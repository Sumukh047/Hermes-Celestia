"""
Hermes Agent Studio - Core AI Agent Runtime
Orchestrates autonomous multi-turn execution loops (Think -> Plan -> Tool Select -> Execute -> Decide),
real-time WebSocket telemetry broadcasting, Human-In-The-Loop approvals,
dynamic personality tone injection, and AI Help Bot fleet controls.
"""

import asyncio
import json
import logging
import re
import time
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from .db import SessionLocal
from .models import Agent, Run, RunEvent, Approval, Integration, utc_now
from .tools import schemas as generate_tool_schemas, run_tool, TOOLMAP
from .integrations import (
    email_search, email_send, email_create_draft,
    whatsapp_send, telegram_send, discord_send, slack_send
)
from .security import secrets

logger = logging.getLogger("hermes_agent_studio.runtime")

TONE_MAP = {
    "general": "natural, concise, and helpful",
    "professional": "polished, precise, and business-focused",
    "customer_support": "warm, empathetic, and solution-oriented",
    "technical": "rigorous, engineer-focused, and concise",
    "friendly": "approachable, upbeat, and conversational",
    "executive": "high-level, decision-oriented, and strategic"
}


class EventHub:
    """PubSub hub for real-time WebSocket broadcasting of agent execution events."""

    def __init__(self):
        self.queues: Dict[str, List[asyncio.Queue]] = defaultdict(list)

    def sub(self, run_id: str) -> asyncio.Queue:
        """Subscribe to a specific run's event stream."""
        q = asyncio.Queue()
        self.queues[run_id].append(q)
        return q

    def unsub(self, run_id: str, q: asyncio.Queue):
        """Unsubscribe from a run's event stream."""
        if run_id in self.queues and q in self.queues[run_id]:
            self.queues[run_id].remove(q)

    async def pub(self, run_id: str, event: Dict[str, Any]):
        """Publish an event to all active WebSocket listeners of a run."""
        for q in list(self.queues.get(run_id, [])):
            try:
                await q.put(event)
            except Exception:
                pass


class Runtime:
    """
    Core AI orchestration runtime handling agent execution loops, tool calling,
    simulations (Sandbox Mode), state persistence, and Agent fleet control.
    """

    def __init__(self, llm):
        self.llm = llm
        self.tasks: Dict[str, asyncio.Task] = {}
        self.hub = EventHub()
        # Active pending approval events keyed by approval_id
        self._pending_approvals: Dict[str, asyncio.Event] = {}
        self._approval_decisions: Dict[str, bool] = {}

    def _get_integration_config(self, key: str) -> Dict[str, Any]:
        """Safely fetch and decrypt an integration's credentials from the database."""
        db = SessionLocal()
        try:
            row = db.get(Integration, key)
            if not row or not row.config:
                return {}
            decrypted = secrets.safe_decrypt(row.config)
            return json.loads(decrypted) if decrypted else {}
        except Exception as e:
            logger.warning(f"Could not load integration config for '{key}': {e}")
            return {}
        finally:
            db.close()

    def _serialize_agent(self, agent: Agent) -> Dict[str, Any]:
        """Convert Agent ORM model to dictionary."""
        return {
            "id": agent.id,
            "name": agent.name,
            "goal": agent.goal,
            "system_prompt": agent.system_prompt,
            "tone": agent.tone,
            "model": agent.model,
            "autonomy": agent.autonomy,
            "tools": json.loads(agent.tools_json or "[]"),
            "workflow": json.loads(agent.workflow_json or "[]"),
            "memory": json.loads(agent.memory_json or "{}"),
            "enabled": agent.enabled
        }

    async def start(self, agent_id: str, message: str = "", simulation: bool = False) -> Dict[str, Any]:
        """Trigger an autonomous agent loop in the background."""
        # Clean up finished tasks first
        if agent_id in self.tasks and self.tasks[agent_id].done():
            del self.tasks[agent_id]

        if agent_id in self.tasks and not self.tasks[agent_id].done():
            return {"status": "already_running", "run_id": None}

        run_id = uuid.uuid4().hex[:16]
        task = asyncio.create_task(
            self.execute(agent_id, run_id, message, simulation)
        )
        self.tasks[agent_id] = task

        # Attach cleanup callback
        def _cleanup(t):
            if agent_id in self.tasks and self.tasks[agent_id] == t:
                del self.tasks[agent_id]

        task.add_done_callback(_cleanup)
        return {"status": "started", "run_id": run_id, "agent_id": agent_id}

    async def stop(self, agent_id: str) -> bool:
        """Cancel a running agent's execution loop."""
        task = self.tasks.get(agent_id)
        stopped = False
        if task and not task.done():
            task.cancel()
            stopped = True

        db = SessionLocal()
        try:
            agent = db.get(Agent, agent_id)
            if agent:
                agent.enabled = False
                db.commit()
        finally:
            db.close()

        if agent_id in self.tasks:
            del self.tasks[agent_id]
        return stopped

    async def emit_event(self, run_id: str, kind: str, message: str, payload: Optional[Dict[str, Any]] = None):
        """Emit real-time WebSocket event and persist to Audit Log."""
        payload = payload or {}
        event_obj = {
            "run_id": run_id,
            "type": kind,
            "message": message,
            "payload": payload,
            "ts": datetime.now(timezone.utc).isoformat()
        }
        await self.hub.pub(run_id, event_obj)

        db = SessionLocal()
        try:
            db.add(RunEvent(
                run_id=run_id,
                kind=kind,
                message=message,
                payload=json.dumps(payload)
            ))
            db.commit()
        finally:
            db.close()

    def resolve_approval(self, approval_id: str, approved: bool):
        """Notifies a waiting agent whether human approval was granted."""
        self._approval_decisions[approval_id] = approved
        if approval_id in self._pending_approvals:
            self._pending_approvals[approval_id].set()

    async def execute(self, agent_id: str, run_id: str, message: str, simulation: bool):
        """
        Main execution loop for an Agent.
        Implements: Think -> Plan -> Tool Select -> Execute -> Decide -> Loop.
        """
        start_time = time.perf_counter()

        db = SessionLocal()
        try:
            run_record = Run(id=run_id, agent_id=agent_id, status="running")
            db.add(run_record)
            agent_orm = db.get(Agent, agent_id)
            if not agent_orm:
                raise ValueError(f"Agent '{agent_id}' not found in database.")

            agent_orm.enabled = True
            db.commit()
            agent_data = self._serialize_agent(agent_orm)
        finally:
            db.close()

        model = agent_data.get("model")
        if not model:
            # Fallback to any loaded model
            try:
                models = await self.llm.models()
                if models:
                    model = models[0]["id"]
            except Exception:
                pass

        if not model:
            await self.emit_event(run_id, "error", "No LLM model selected or available in LM Studio.")
            db = SessionLocal()
            try:
                r = db.get(Run, run_id)
                if r:
                    r.status = "failed"
                    r.error = "No LLM model available."
                    db.commit()
            finally:
                db.close()
            return

        if agent_data.get("tone") == "friendly":
            system_prompt = (
                f"{agent_data.get('system_prompt') or 'You are a friendly, upbeat, helpful AI buddy.'}\n\n"
                "Tone: Approachable, cheerful, conversational, and encouraging with fitting emojis (like 😊, 🙌, 🚀).\n"
                "You are chatting directly with your friend on WhatsApp. Respond warmly, naturally, and helpfully like a knowledgeable best friend without robotic corporate phrasing or headers.\n"
                "Important: Always fulfill the user's request, answer, or generate the requested text immediately in this message; never say you will do it later or tell them to stay tuned."
            )
        else:
            chosen_tone = TONE_MAP.get(agent_data.get("tone", "general"), TONE_MAP["general"])
            system_prompt = (
                f"{agent_data.get('system_prompt') or 'You are an autonomous AI agent.'}\n\n"
                f"Tone Guideline: Keep your language {chosen_tone}.\n"
                "Instructions:\n"
                "1. Focus strictly on accomplishing the user's objective.\n"
                "2. When tools are necessary, call them with accurate parameters.\n"
                "3. Do not invent or hallucinate tool outputs; use the actual results.\n"
                "4. Deliver your answer clearly."
            )

        user_content = f"Objective: {agent_data.get('goal', 'Assist the user')}"
        if message:
            user_content += f"\nInput Message: {message}"

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content}
        ]

        final_response = ""
        total_tokens = 0
        total_tool_calls = 0
        tool_schemas = generate_tool_schemas(agent_data.get("tools", []))

        await self.emit_event(run_id, "status", f"Agent initialized with model '{model}'", {
            "simulation": simulation,
            "tone": agent_data.get("tone"),
            "autonomy": agent_data.get("autonomy"),
            "tools_count": len(agent_data.get("tools", []))
        })

        try:
            # Autonomous Iteration Loop (Max 8 turns)
            for iteration in range(8):
                tool_accumulators = {}

                # Stream LLM Response
                async for event in self.llm.stream(model, messages, tools=tool_schemas):
                    if event["type"] == "token":
                        final_response += event["text"]
                        total_tokens += 1
                        await self.emit_event(run_id, "token", event["text"])

                    elif event["type"] == "tool_calls":
                        for tc in event["data"]:
                            idx = tc.get("index", 0)
                            acc = tool_accumulators.setdefault(idx, {
                                "id": tc.get("id") or uuid.uuid4().hex,
                                "name": "",
                                "args": ""
                            })
                            func_chunk = tc.get("function", {})
                            acc["name"] += func_chunk.get("name", "")
                            acc["args"] += func_chunk.get("arguments", "")

                # If no tools called, we're done
                if not tool_accumulators:
                    break

                # Append assistant tool calls to history
                assistant_message = {"role": "assistant", "content": final_response or "", "tool_calls": []}
                for acc in tool_accumulators.values():
                    try:
                        parsed_args = json.loads(acc["args"] or "{}")
                    except Exception:
                        parsed_args = {}
                    assistant_message["tool_calls"].append({
                        "id": acc["id"],
                        "type": "function",
                        "function": {"name": acc["name"], "arguments": json.dumps(parsed_args)}
                    })
                messages.append(assistant_message)

                # Reset final_response for next iteration
                final_response = ""

                # Execute each accumulated tool
                for acc in tool_accumulators.values():
                    tool_name = acc["name"]
                    try:
                        parsed_args = json.loads(acc["args"] or "{}")
                    except Exception:
                        parsed_args = {}

                    total_tool_calls += 1
                    risk_level = TOOLMAP[tool_name].risk if tool_name in TOOLMAP else "medium"
                    if tool_name == "whatsapp.send":
                        wa_cfg = self._get_integration_config("whatsapp")
                        if wa_cfg.get("only_you_chat", False):
                            risk_level = "low"
                    autonomy_level = agent_data.get("autonomy", "approval")

                    # Check Human-In-The-Loop Approval
                    needs_approval = (
                        not simulation and
                        autonomy_level != "autonomous" and
                        (autonomy_level == "suggest" or (autonomy_level == "approval" and risk_level == "high"))
                    )

                    if simulation:
                        await self.emit_event(
                            run_id, "simulation",
                            f"Simulated execution of '{tool_name}' (Sandbox Mode)",
                            {"tool": tool_name, "arguments": parsed_args}
                        )
                        tool_result = {"status": "simulated", "tool": tool_name, "note": "Sandbox Mode: Tool was simulated without side effects."}

                    elif needs_approval:
                        approval_id = uuid.uuid4().hex[:12]
                        db_app = SessionLocal()
                        try:
                            db_app.add(Approval(
                                id=approval_id,
                                run_id=run_id,
                                agent_id=agent_id,
                                action=tool_name,
                                details=json.dumps(parsed_args),
                                status="pending"
                            ))
                            db_app.commit()
                        finally:
                            db_app.close()

                        await self.emit_event(
                            run_id, "approval_required",
                            f"Awaiting human approval to execute '{tool_name}'",
                            {"approval_id": approval_id, "tool": tool_name, "arguments": parsed_args, "risk": risk_level}
                        )

                        # Wait for human response
                        event_lock = asyncio.Event()
                        self._pending_approvals[approval_id] = event_lock

                        try:
                            # Wait up to 180 seconds for human decision
                            await asyncio.wait_for(event_lock.wait(), timeout=180.0)
                            approved = self._approval_decisions.get(approval_id, False)
                        except asyncio.TimeoutError:
                            approved = False

                        finally:
                            if approval_id in self._pending_approvals:
                                del self._pending_approvals[approval_id]
                            if approval_id in self._approval_decisions:
                                del self._approval_decisions[approval_id]

                        if approved:
                            await self.emit_event(run_id, "status", f"Human approved execution of '{tool_name}'.")
                            tool_result = await self._dispatch_tool(tool_name, parsed_args)
                        else:
                            await self.emit_event(run_id, "status", f"Human rejected execution of '{tool_name}'.")
                            tool_result = {"error": "Action was denied by user approval policy."}

                    else:
                        await self.emit_event(
                            run_id, "tool_start",
                            f"Executing '{tool_name}'",
                            {"tool": tool_name, "arguments": parsed_args}
                        )
                        tool_result = await self._dispatch_tool(tool_name, parsed_args)

                    await self.emit_event(
                        run_id, "tool_result",
                        f"Completed '{tool_name}'",
                        {"tool": tool_name, "result": str(tool_result)[:3000]}
                    )

                    messages.append({
                        "role": "tool",
                        "tool_call_id": acc["id"],
                        "content": json.dumps(tool_result)[:15000]
                    })

            # Execution Finished Successfully
            duration_ms = int((time.perf_counter() - start_time) * 1000)
            db = SessionLocal()
            try:
                rec = db.get(Run, run_id)
                if rec:
                    rec.status = "completed"
                    rec.finished_at = utc_now()
                    rec.duration_ms = duration_ms
                    rec.tokens = total_tokens
                    rec.tool_calls = total_tool_calls
                    rec.result = final_response
                    db.commit()
            finally:
                db.close()

            await self.emit_event(run_id, "complete", "Agent execution successfully completed", {
                "tokens": total_tokens,
                "tool_calls": total_tool_calls,
                "duration_ms": duration_ms
            })

        except asyncio.CancelledError:
            duration_ms = int((time.perf_counter() - start_time) * 1000)
            db = SessionLocal()
            try:
                rec = db.get(Run, run_id)
                if rec:
                    rec.status = "stopped"
                    rec.finished_at = utc_now()
                    rec.duration_ms = duration_ms
                    db.commit()
            finally:
                db.close()
            await self.emit_event(run_id, "stopped", "Agent was manually stopped.")

        except Exception as e:
            logger.error(f"Execution error for agent {agent_id}: {e}", exc_info=True)
            duration_ms = int((time.perf_counter() - start_time) * 1000)
            db = SessionLocal()
            try:
                rec = db.get(Run, run_id)
                if rec:
                    rec.status = "failed"
                    rec.error = str(e)
                    rec.finished_at = utc_now()
                    rec.duration_ms = duration_ms
                    db.commit()
            finally:
                db.close()
            await self.emit_event(run_id, "error", f"Execution failed: {str(e)}", {"error": str(e)})

    async def _dispatch_tool(self, name: str, args: Dict[str, Any]) -> Any:
        """Route tool invocations to either local engines or integration connectors."""
        try:
            # Email / Gmail Dispatch
            if name in ("email.search", "gmail.search"):
                cfg = self._get_integration_config("email") or self._get_integration_config("gmail")
                return await email_search(cfg, query=args.get("query", ""), max_results=args.get("max_results", 10))

            elif name in ("email.send", "gmail.send"):
                cfg = self._get_integration_config("email") or self._get_integration_config("gmail")
                return await email_send(cfg, to=args.get("to", ""), subject=args.get("subject", ""), body=args.get("body", ""))

            elif name in ("email.create_draft", "gmail.create_draft"):
                cfg = self._get_integration_config("email") or self._get_integration_config("gmail")
                return await email_create_draft(cfg, to=args.get("to", ""), subject=args.get("subject", ""), body=args.get("body", ""))

            # WhatsApp Dispatch
            elif name == "whatsapp.send":
                cfg = self._get_integration_config("whatsapp")
                return await whatsapp_send(cfg, to=args.get("to", ""), text=args.get("text", ""))

            # Telegram Dispatch
            elif name == "telegram.send":
                cfg = self._get_integration_config("telegram")
                return await telegram_send(cfg, chat_id=args.get("chat_id", ""), text=args.get("text", ""))

            # Discord Dispatch
            elif name == "discord.send":
                cfg = self._get_integration_config("discord")
                return await discord_send(cfg, target=args.get("target", ""), text=args.get("text", ""))

            # Slack Dispatch
            elif name == "slack.send":
                cfg = self._get_integration_config("slack")
                return await slack_send(cfg, channel=args.get("channel", "general"), text=args.get("text", ""))

            # Obsidian Vault Dispatch
            elif name in ("obsidian.read_note", "obsidian.write_note", "obsidian.sync"):
                cfg = self._get_integration_config("obsidian") or {}
                if "vault_path" not in args and cfg.get("vault_path"):
                    args["vault_path"] = cfg.get("vault_path")
                return await run_tool(name, args)

            # Multi-Agent Delegation Dispatch
            elif name == "agent.delegate":
                target = args.get("target_agent_id_or_name", "")
                task_msg = args.get("task_message", "")
                db = SessionLocal()
                try:
                    from sqlalchemy import select
                    target_agent = db.execute(select(Agent).where((Agent.id == target) | (Agent.name == target))).scalars().first()
                    if target_agent:
                        import uuid
                        sub_run_id = uuid.uuid4().hex[:12]
                        await self.execute(target_agent.id, sub_run_id, task_msg, simulation=False)
                        sub_run = db.get(Run, sub_run_id)
                        return {
                            "delegated_agent": target_agent.name,
                            "agent_id": target_agent.id,
                            "result": sub_run.result if sub_run and sub_run.result else "Subagent completed execution."
                        }
                finally:
                    db.close()
                return await run_tool(name, args)

            # Local & Extended Tools fallback
            return await run_tool(name, args)

        except Exception as e:
            logger.error(f"Tool execution failed for '{name}': {e}")
            return {"error": str(e)}

    def control(self, message: str, agents: List[Dict[str, Any]]) -> Optional[Tuple[str, str, str]]:
        """
        NLP Command Parser for Control Bot.
        Recognizes natural language requests to start, stop, rename, or change tones of agents.
        """
        low = message.lower().strip()

        for a in agents:
            a_id = a["id"].lower()
            a_name = a["name"].lower()

            if a_id in low or a_name in low:
                # Start / Run command
                if re.search(r'\b(start|run|launch|execute|activate|resume)\b', low):
                    return ("start", a["id"], "")

                # Stop / Cancel command
                if re.search(r'\b(stop|halt|cancel|terminate|pause|kill)\b', low):
                    return ("stop", a["id"], "")

                # Rename command
                if re.search(r'\b(rename|name)\b', low):
                    m = re.search(r'(?:rename|name).*?(?:to|as)\s+["\']?([^"\']+)["\']?$', message, re.IGNORECASE)
                    if m:
                        return ("rename", a["id"], m.group(1).strip())

                # Tone command
                if "tone" in low:
                    for tone in TONE_MAP:
                        if tone in low or tone.replace("_", " ") in low:
                            return ("tone", a["id"], tone)

        return None
