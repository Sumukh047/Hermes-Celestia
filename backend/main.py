"""
Hermes Agent Studio - Master Backend API Server
Enterprise-grade FastAPI orchestration layer with strict typing, SQLite persistence,
asynchronous tool dispatching, token-to-token streaming, and bidirectional WebSocket pipelines.
"""

import asyncio
from datetime import datetime, timezone, timedelta
import json
import logging
import os
import platform
import shutil
import time
import re
import uuid
from typing import Any, Dict, List, Optional
import psutil
import httpx
from fastapi import FastAPI, APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Depends, BackgroundTasks, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import select, desc, delete, func

from .config import settings
from .db import init_db, SessionLocal, engine
from .models import Agent, Run, RunEvent, Integration, Approval, User, Schedule, utc_now
from .schemas import (
    AgentCreate, AgentPatch, ChatRequest, ChatStreamRequest,
    WorkflowRequest, ModelLoadRequest, ModelUnloadRequest, GatewayConfigRequest, IntegrationConfig,
    IntegrationTestRequest, ApprovalActionRequest,
    UserSignup, UserLogin, UserSettingsUpdate, ScheduleCreate, SchedulePatch, ObsidianNoteCreate,
    MultimodalChatRequest, MultimodalFile
)
from .multimodal import WORK_MODES, parse_attached_file
from .llm.lmstudio import LMStudio
from .runtime import Runtime
from .hermes import Hermes
from .security import secrets, hash_password, verify_password, create_access_token, verify_access_token
from .tools import TOOLS, INTEGRATIONS, get_obsidian_vault_path
from .integrations import test_integration, whatsapp_send, telegram_send, email_send, email_search, decode_mime_words
import email
from email.header import decode_header
import imaplib

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("hermes_agent_studio")

app = FastAPI(
    title="Hermes Agent Studio API",
    description="Backend orchestration layer for Visual AI Agent OS",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Core singletons
llm = LMStudio(settings.lmstudio_base_url, settings.lmstudio_api_key)
runtime = Runtime(llm)
router = APIRouter(prefix="/api")
APP_START_TIME = time.time()


def get_db():
    """Database session dependency for FastAPI routes."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user_id(authorization: Optional[str] = Header(None)) -> str:
    """Extract authenticated user_id from Bearer token."""
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:].strip()
        uid = verify_access_token(token)
        if uid:
            return uid
    return ""


def serialize_user(u: User) -> Dict[str, Any]:
    """Safely serialize user account details (excluding password hash)."""
    return {
        "id": u.id,
        "username": u.username,
        "email": u.email,
        "name": u.name or u.username,
        "settings": json.loads(u.settings_json or "{}"),
        "created_at": u.created_at.isoformat() if u.created_at else None
    }


def serialize_schedule(s: Schedule) -> Dict[str, Any]:
    """Serialize scheduled automation task."""
    return {
        "id": s.id,
        "user_id": s.user_id,
        "agent_id": s.agent_id,
        "name": s.name,
        "cron_expression": s.cron_expression,
        "task_prompt": s.task_prompt,
        "enabled": s.enabled,
        "last_run": s.last_run.isoformat() if s.last_run else None,
        "next_run": s.next_run.isoformat() if s.next_run else None,
        "last_status": s.last_status,
        "last_run_id": getattr(s, "last_run_id", None),
        "last_result": getattr(s, "last_result", None),
        "created_at": s.created_at.isoformat() if s.created_at else None
    }


def serialize_agent(a: Agent) -> Dict[str, Any]:
    """Safely serialize an agent from the database, parsing JSON strings."""
    return {
        "id": a.id,
        "user_id": getattr(a, "user_id", "default_user"),
        "name": a.name,
        "goal": a.goal,
        "system_prompt": a.system_prompt,
        "tone": a.tone,
        "model": a.model,
        "autonomy": a.autonomy,
        "tools": json.loads(a.tools_json or "[]"),
        "workflow": json.loads(a.workflow_json or "[]"),
        "memory": json.loads(a.memory_json or "{}"),
        "enabled": a.enabled,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "updated_at": a.updated_at.isoformat() if a.updated_at else None
    }


# ==============================================================================
# System & Health Endpoints
# ==============================================================================

@router.get("/health", tags=["System"])
async def health_check():
    """System health monitor for underlying services."""
    lm_health = await llm.health()
    hermes_health = Hermes().status()

    return {
        "app": "online",
        "lmstudio": lm_health,
        "hermes": hermes_health,
        "python": platform.python_version(),
        "platform": platform.platform(),
        "status": "Healthy" if lm_health.get("connected") else "Degraded",
        "uptime_seconds": int(time.time() - APP_START_TIME)
    }


@router.get("/system", tags=["System"])
async def system_diagnostics(db: Session = Depends(get_db)):
    """Comprehensive system diagnostics for Settings & Security dashboard."""
    lm_health = await llm.health()
    hermes_health = Hermes().status()

    # Hardware stats via psutil
    cpu_percent = psutil.cpu_percent(interval=None)
    mem = psutil.virtual_memory()

    # DB metrics
    agent_count = db.query(Agent).count()
    run_count = db.query(Run).count()
    integration_count = db.query(Integration).count()

    db_path = settings.db_url.replace("sqlite:///", "")
    db_size = os.path.getsize(db_path) if os.path.exists(db_path) else 0

    return {
        "os": {
            "platform": platform.platform(),
            "system": platform.system(),
            "release": platform.release(),
            "machine": platform.machine(),
            "python_version": platform.python_version()
        },
        "resources": {
            "cpu_percent": cpu_percent,
            "memory_total_gb": round(mem.total / (1024 ** 3), 1),
            "memory_used_gb": round(mem.used / (1024 ** 3), 1),
            "memory_percent": mem.percent
        },
        "hermes": hermes_health,
        "lmstudio": {
            "connected": lm_health.get("connected", False),
            "base_url": settings.lmstudio_base_url,
            "models_count": len(lm_health.get("models", []))
        },
        "security": {
            "encryption": "Fernet AES-128-CBC + HMAC-SHA256",
            "key_file": settings.key_file,
            "key_exists": os.path.exists(settings.key_file),
            "posture": "Strict Local-First. Zero telemetry or cloud exports."
        },
        "database": {
            "path": db_path,
            "size_bytes": db_size,
            "agents_count": agent_count,
            "runs_count": run_count,
            "integrations_count": integration_count
        },
        "uptime_seconds": int(time.time() - APP_START_TIME)
    }


# ==============================================================================
# LM Studio & Model Management
# ==============================================================================

@router.get("/models", tags=["LLM"])
async def list_models():
    """List all available models in LM Studio (unified active loaded + on-disk catalog)."""
    try:
        catalog = await llm.get_unified_catalog()
        return catalog
    except Exception as e:
        logger.error(f"Failed to fetch models from LM Studio: {e}")
        raise HTTPException(status_code=502, detail=f"LM Studio connection failed: {str(e)}")


@router.post("/models/gateway", tags=["LLM"])
async def configure_gateway(request: GatewayConfigRequest):
    """Test, update, or auto-detect the LM Studio Gateway endpoint."""
    if request.auto_detect:
        discovered = await llm.auto_discover_endpoint()
        if discovered:
            return {"status": "discovered", "gateway_url": discovered, "connected": True}
        return {"status": "not_found", "gateway_url": llm.base, "connected": False, "message": "Could not auto-detect active LM Studio on local network."}

    if request.base_url:
        llm.set_base_url(request.base_url)
        health = await llm.health()
        return {
            "status": "configured",
            "gateway_url": llm.base,
            "connected": health.get("connected", False),
            "latency_ms": health.get("latency_ms"),
            "models_count": health.get("loaded_count", 0),
            "error": health.get("error")
        }
    return {"gateway_url": llm.base}


@router.post("/models/load", tags=["LLM"])
async def load_model(request: ModelLoadRequest):
    """Load a specific model into LM Studio memory with advanced offloading configs."""
    try:
        result = await llm.load(
            request.model,
            request.context_length,
            request.gpu_offload,
            request.flash_attention,
            request.offload_kv_cache_to_gpu
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to load model: {str(e)}")


@router.post("/models/unload", tags=["LLM"])
async def unload_model(request: ModelUnloadRequest):
    """Eject/unload a specific model from LM Studio VRAM memory."""
    try:
        result = await llm.unload(request.instance_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to eject model: {str(e)}")


# ==============================================================================
# Agent Fleet CRUD & Execution
# ==============================================================================

@router.get("/agents", tags=["Agents"])
def list_agents(db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    """Get all configured AI agents for current user or all if admin/default."""
    if user_id and user_id != "default_user":
        agents = db.scalars(select(Agent).where((Agent.user_id == user_id) | (Agent.user_id == "default_user")).order_by(desc(Agent.updated_at))).all()
    else:
        agents = db.scalars(select(Agent).order_by(desc(Agent.updated_at))).all()
    return [serialize_agent(x) for x in agents]


@router.post("/agents", tags=["Agents"])
def create_agent(agent_in: AgentCreate, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    """Create a new AI agent with specific tools and workflow."""
    import secrets as pysecrets
    agent_id = pysecrets.token_hex(6)

    workflow_val = agent_in.workflow
    if isinstance(workflow_val, (dict, list)):
        workflow_str = json.dumps(workflow_val)
    else:
        workflow_str = str(workflow_val)

    new_agent = Agent(
        id=agent_id,
        user_id=user_id,
        name=agent_in.name,
        goal=agent_in.goal,
        system_prompt=agent_in.system_prompt,
        tone=agent_in.tone,
        model=agent_in.model,
        autonomy=agent_in.autonomy,
        tools_json=json.dumps(agent_in.tools),
        workflow_json=workflow_str,
        memory_json=json.dumps(agent_in.memory)
    )
    db.add(new_agent)
    db.commit()
    db.refresh(new_agent)
    return serialize_agent(new_agent)


@router.get("/agents/{agent_id}", tags=["Agents"])
def get_agent(agent_id: str, db: Session = Depends(get_db)):
    """Retrieve a single agent by ID."""
    agent = db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return serialize_agent(agent)


@router.patch("/agents/{agent_id}", tags=["Agents"])
def update_agent(agent_id: str, patch_data: AgentPatch, db: Session = Depends(get_db)):
    """Update agent configuration."""
    agent = db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    update_dict = patch_data.model_dump(exclude_unset=True)
    for key, value in update_dict.items():
        if key in ["tools", "workflow", "memory"]:
            setattr(agent, f"{key}_json", json.dumps(value))
        else:
            setattr(agent, key, value)

    agent.updated_at = utc_now()
    db.commit()
    db.refresh(agent)
    return serialize_agent(agent)


@router.delete("/agents/{agent_id}", tags=["Agents"])
async def delete_agent(agent_id: str, db: Session = Depends(get_db)):
    """Delete an agent, stopping any active runs and deleting associated runs."""
    agent = db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Stop active task if running
    await runtime.stop(agent_id)

    # Delete runs and events
    runs = db.scalars(select(Run).where(Run.agent_id == agent_id)).all()
    for r in runs:
        db.execute(delete(RunEvent).where(RunEvent.run_id == r.id))
        db.delete(r)

    db.delete(agent)
    db.commit()
    return {"status": "deleted", "agent_id": agent_id}


@router.post("/agents/{agent_id}/clone", tags=["Agents"])
def clone_agent(agent_id: str, db: Session = Depends(get_db)):
    """Clone an existing agent into a new instance."""
    agent = db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    import secrets as pysecrets
    new_id = pysecrets.token_hex(6)

    cloned = Agent(
        id=new_id,
        name=f"{agent.name} (Copy)",
        goal=agent.goal,
        system_prompt=agent.system_prompt,
        tone=agent.tone,
        model=agent.model,
        autonomy=agent.autonomy,
        tools_json=agent.tools_json,
        workflow_json=agent.workflow_json,
        memory_json=agent.memory_json,
        enabled=False
    )
    db.add(cloned)
    db.commit()
    db.refresh(cloned)
    return serialize_agent(cloned)


@router.post("/agents/{agent_id}/run", tags=["Execution"])
async def run_agent(agent_id: str, request: ChatRequest):
    """Trigger a live, autonomous agent execution."""
    result = await runtime.start(agent_id, request.message, simulation=False)
    if result.get("status") == "already_running":
        raise HTTPException(status_code=409, detail="Agent is already running.")
    return result


@router.post("/agents/{agent_id}/simulate", tags=["Execution"])
async def simulate_agent(agent_id: str, request: ChatRequest):
    """Trigger agent in SANDBOX MODE (no external side effects)."""
    result = await runtime.start(agent_id, request.message, simulation=True)
    return result


@router.post("/agents/{agent_id}/stop", tags=["Execution"])
async def stop_agent(agent_id: str):
    """Gracefully stop a running agent."""
    stopped = await runtime.stop(agent_id)
    return {"status": "stopped" if stopped else "not_running", "agent_id": agent_id}


# ==============================================================================
# Observability & Audit Logs
# ==============================================================================

@router.get("/runs", tags=["Observability"])
def list_runs(db: Session = Depends(get_db)):
    """Fetch execution timeline and audit logs."""
    runs = db.scalars(select(Run).order_by(desc(Run.started_at)).limit(200)).all()
    return [{
        "id": x.id,
        "agent_id": x.agent_id,
        "status": x.status,
        "duration_ms": x.duration_ms,
        "tokens": x.tokens,
        "tool_calls": x.tool_calls,
        "started_at": x.started_at.isoformat() if x.started_at else None,
        "finished_at": x.finished_at.isoformat() if x.finished_at else None,
        "result": x.result,
        "error": x.error
    } for x in runs]


@router.get("/runs/{run_id}", tags=["Observability"])
def get_run(run_id: str, db: Session = Depends(get_db)):
    """Get single run details."""
    run = db.get(Run, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return {
        "id": run.id,
        "agent_id": run.agent_id,
        "status": run.status,
        "duration_ms": run.duration_ms,
        "tokens": run.tokens,
        "tool_calls": run.tool_calls,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "result": run.result,
        "error": run.error
    }


@router.get("/runs/{run_id}/events", tags=["Observability"])
def get_run_events(run_id: str, db: Session = Depends(get_db)):
    """Get detailed X-Ray timeline events for a run."""
    events = db.scalars(select(RunEvent).where(RunEvent.run_id == run_id).order_by(RunEvent.id)).all()
    return [{
        "id": e.id,
        "ts": e.ts.isoformat(),
        "kind": e.kind,
        "message": e.message,
        "payload": json.loads(e.payload or "{}")
    } for e in events]


@router.delete("/runs/{run_id}", tags=["Observability"])
def delete_run(run_id: str, db: Session = Depends(get_db)):
    """Delete a run record and its event log."""
    db.execute(delete(RunEvent).where(RunEvent.run_id == run_id))
    db.execute(delete(Run).where(Run.id == run_id))
    db.commit()
    return {"status": "deleted", "run_id": run_id}


@router.websocket("/runs/{run_id}/stream")
async def stream_run_events(websocket: WebSocket, run_id: str):
    """Live WebSocket streaming for Agent Execution Timeline and telemetry."""
    await websocket.accept()
    queue = runtime.hub.sub(run_id)
    try:
        while True:
            event = await queue.get()
            await websocket.send_json(event)
            if event["type"] in ["complete", "error", "stopped"]:
                break
    except WebSocketDisconnect:
        pass
    finally:
        runtime.hub.unsub(run_id, queue)


# ==============================================================================
# Human-In-The-Loop Approvals
# ==============================================================================

@router.get("/approvals", tags=["Approvals"])
def list_approvals(db: Session = Depends(get_db)):
    """List pending and historical human-in-the-loop action approval requests."""
    items = db.scalars(select(Approval).order_by(desc(Approval.created_at))).all()
    return [{
        "id": a.id,
        "run_id": a.run_id,
        "agent_id": a.agent_id,
        "action": a.action,
        "details": json.loads(a.details or "{}"),
        "status": a.status,
        "created_at": a.created_at.isoformat()
    } for a in items]


@router.post("/approvals/{approval_id}/decision", tags=["Approvals"])
def decide_approval(approval_id: str, request: ApprovalActionRequest, db: Session = Depends(get_db)):
    """Approve or reject a pending agent action."""
    app_record = db.get(Approval, approval_id)
    if not app_record:
        raise HTTPException(status_code=404, detail="Approval request not found")

    app_record.status = "approved" if request.approved else "rejected"
    db.commit()

    runtime.resolve_approval(approval_id, request.approved)
    return {"id": approval_id, "status": app_record.status}


# ==============================================================================
# Tool Registry & Integrations
# ==============================================================================

@router.get("/tools", tags=["Tools"])
def list_tools():
    """List all available tools and their risk levels for the Agent Builder."""
    return [{
        "name": x.name,
        "description": x.description,
        "risk": x.risk,
        "category": x.category,
        "parameters": x.parameters
    } for x in TOOLS]


@router.get("/integrations", tags=["Integrations"])
def list_integrations(db: Session = Depends(get_db)):
    """List integration marketplace connectors with active configured status."""
    db_configs = {x.key: x.enabled for x in db.scalars(select(Integration)).all()}
    result = []
    for base in INTEGRATIONS:
        merged = {**base, "configured": db_configs.get(base["key"], False)}
        result.append(merged)
    return result


@router.get("/integrations/{key}", tags=["Integrations"])
def get_integration_config(key: str, db: Session = Depends(get_db)):
    """Get integration configuration for local editing."""
    integration = db.get(Integration, key)
    if not integration or not integration.config:
        return {"key": key, "configured": False, "config": {}}

    decrypted = secrets.safe_decrypt(integration.config)
    try:
        cfg = json.loads(decrypted) if decrypted else {}
    except Exception:
        cfg = {}

    return {
        "key": key,
        "enabled": integration.enabled,
        "config": cfg
    }


@router.post("/integrations/{key}", tags=["Integrations"])
def configure_integration(key: str, config: IntegrationConfig, db: Session = Depends(get_db)):
    """Securely store an integration configuration (encrypted at rest via Fernet)."""
    valid_keys = {z["key"] for z in INTEGRATIONS}
    valid_keys.update(["email", "gmail", "whatsapp", "telegram", "discord", "slack", "rest"])

    if key not in valid_keys:
        raise HTTPException(status_code=404, detail="Unknown integration key")

    integration = db.get(Integration, key)
    if not integration:
        integration = Integration(key=key)

    # Recover existing secrets if incoming fields contain bullets or are empty
    existing_cfg = {}
    if integration.config:
        try:
            existing_cfg = json.loads(secrets.safe_decrypt(integration.config))
        except Exception:
            existing_cfg = {}

    incoming_cfg = dict(config.config)
    for k, v in list(incoming_cfg.items()):
        if isinstance(v, str) and ("•" in v or "•" in v or "*" in v):
            if k in existing_cfg and existing_cfg[k]:
                incoming_cfg[k] = existing_cfg[k]

    integration.enabled = config.enabled
    encrypted_payload = secrets.encrypt(json.dumps(incoming_cfg))
    integration.config = encrypted_payload

    db.add(integration)
    db.commit()
    return {"key": key, "configured": integration.enabled, "status": "Securely saved"}


@router.post("/integrations/{key}/test", tags=["Integrations"])
async def test_integration_connection(key: str, request: IntegrationTestRequest, db: Session = Depends(get_db)):
    """Directly test and verify credentials for any integration."""
    row = db.get(Integration, key)
    existing_cfg = {}
    if row and row.config:
        try:
            existing_cfg = json.loads(secrets.safe_decrypt(row.config))
        except Exception:
            existing_cfg = {}

    target_config = dict(request.config) if request.config else dict(existing_cfg)

    # If incoming target_config has masked values (bullets), restore real secret from existing DB record
    for k, v in list(target_config.items()):
        if isinstance(v, str) and ("•" in v or "•" in v or "*" in v or not v.strip()):
            if k in existing_cfg and existing_cfg[k]:
                target_config[k] = existing_cfg[k]

    result = await test_integration(key, target_config)
    return result


# In-memory conversational session store: sender -> list of {"role": "user"|"assistant", "content": text}
WHATSAPP_SESSIONS: Dict[str, List[Dict[str, str]]] = {}


async def dispatch_whatsapp_agent(agent_id: str, sender: str, body: str, cfg: Dict[str, Any]):
    """
    Executes the agent for an incoming WhatsApp message and ensures the agent's
    reply is sent back to the sender via WhatsApp with full conversational continuity.
    """
    clean_sender = sender.split("@")[0].replace("+", "").strip() if sender else ""
    run_id = uuid.uuid4().hex[:16]
    logger.info(f"Dispatching WhatsApp message from '{clean_sender}' to agent {agent_id} (run_id: {run_id})")

    # Maintain full multi-turn conversation memory for this sender
    history = WHATSAPP_SESSIONS.setdefault(clean_sender, [])
    history.append({"role": "user", "content": body.strip()})

    # Keep last 10 messages (5 user turns, 5 assistant turns)
    if len(history) > 10:
        history = history[-10:]
        WHATSAPP_SESSIONS[clean_sender] = history

    recent_context = ""
    if len(history) > 1:
        prev_lines = []
        for turn in history[:-1]:
            label = "Friend" if turn["role"] == "user" else "You"
            prev_lines.append(f"{label}: {turn['content']}")
        recent_context = "Recent chat:\n" + "\n".join(prev_lines[-4:]) + "\n\n"

    user_message = f"{recent_context}Friend on WhatsApp: {body.strip()}"

    task_key = f"{agent_id}_{run_id}"
    try:
        task = asyncio.create_task(runtime.execute(agent_id, run_id, user_message, simulation=False))
        runtime.tasks[task_key] = task
        try:
            await task
        finally:
            if task_key in runtime.tasks:
                del runtime.tasks[task_key]

        # Inspect execution result
        db = SessionLocal()
        try:
            run_rec = db.get(Run, run_id)
            if not run_rec:
                return

            # Check if whatsapp.send tool was called during this run
            tool_events = db.query(RunEvent).filter(
                RunEvent.run_id == run_id,
                RunEvent.kind == "tool_result"
            ).all()

            wa_called = any(
                "whatsapp" in (ev.message or "").lower() or "whatsapp" in (ev.payload or "").lower()
                for ev in tool_events
            )

            # If whatsapp.send was NOT already dispatched by the agent, but the agent generated text
            if not wa_called and run_rec.result and run_rec.result.strip():
                reply_text = run_rec.result.strip()
                # Store in conversation history
                history.append({"role": "assistant", "content": reply_text})
                logger.info(f"Sending agent's direct text response to WhatsApp recipient '{clean_sender}'...")
                await whatsapp_send(cfg, to=clean_sender, text=reply_text)
                logger.info(f"Agent's text response successfully sent to WhatsApp recipient '{clean_sender}'!")
            elif wa_called:
                # If tool was called, add a note in history
                history.append({"role": "assistant", "content": run_rec.result or "[Tool Action Executed]"})
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Error in dispatch_whatsapp_agent: {e}", exc_info=True)


@router.post("/integrations/whatsapp/incoming", tags=["Integrations"])
async def whatsapp_incoming_webhook(payload: Dict[str, Any], db: Session = Depends(get_db)):
    """
    Webhook handler for incoming WhatsApp messages received by wa-bridge.
    If 'only_you_chat' is enabled on the agent, responds to personal notes.
    """
    logger.info(f"Incoming WhatsApp webhook: {payload}")
    sender = payload.get("from", "")
    body = payload.get("body", "")
    is_self = payload.get("isSelf", False)

    # Check if an agent is active with whatsapp tool
    agents = db.scalars(select(Agent).where(Agent.enabled == True)).all()
    for a in agents:
        tools = json.loads(a.tools_json or "[]")
        if "whatsapp.send" in tools:
            # Check integration config
            row = db.get(Integration, "whatsapp")
            cfg = json.loads(secrets.safe_decrypt(row.config)) if row and row.config else {}
            only_you = cfg.get("only_you_chat", False)

            if only_you and not is_self:
                logger.info(f"Ignoring message from {sender} due to 'Only You Chat' sandbox setting.")
                continue

            # Trigger agent execution and response dispatch
            asyncio.create_task(dispatch_whatsapp_agent(a.id, sender, body, cfg))

    return {"status": "received"}


@router.post("/integrations/whatsapp/unlink", tags=["Integrations"])
async def unlink_whatsapp():
    """Unlinks local WhatsApp Web session to allow pairing with a new device or re-pairing."""
    logger.info("Unlink WhatsApp requested. Contacting local bridge on port 3001...")
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post("http://127.0.0.1:3001/unlink")
            if r.status_code == 200:
                return r.json()
            return {"success": False, "error": f"Bridge error {r.status_code}: {r.text}"}
    except Exception as e:
        logger.warning(f"Failed to reach WhatsApp bridge for unlink: {e}")
        return {"success": False, "error": f"Failed to contact WhatsApp bridge: {str(e)}"}


@router.get("/integrations/whatsapp/qr", tags=["Integrations"])
async def get_whatsapp_qr():
    """Proxies QR code data from local WhatsApp bridge microservice."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get("http://127.0.0.1:3001/qr")
            if r.status_code == 200:
                return r.json()
            return {"status": "offline", "qr": None}
    except Exception:
        return {"status": "offline", "qr": None}


@router.get("/integrations/whatsapp/status", tags=["Integrations"])
async def get_whatsapp_status():
    """Proxies pairing and connection status from local WhatsApp bridge."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get("http://127.0.0.1:3001/status")
            if r.status_code == 200:
                return r.json()
            return {"ready": False, "status": "offline"}
    except Exception:
        return {"ready": False, "status": "offline"}


# ==============================================================================
# Telegram Bot Dispatcher & Multi-turn Sessions
# ==============================================================================

TELEGRAM_SESSIONS: Dict[str, List[Dict[str, str]]] = {}


def clean_llm_reply(text: str) -> str:
    """Strip any accidental internal model thinking tags or trailing artifacts."""
    cleaned = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL)
    return cleaned.strip()


async def dispatch_telegram_agent(agent_id: str, chat_id: str, sender_name: str, body: str, cfg: Dict[str, Any]):
    """
    Executes the designated agent for an incoming Telegram message and sends the agent response
    back to the chat with conversational history continuity.
    """
    run_id = uuid.uuid4().hex[:16]
    logger.info(f"Dispatching Telegram message from '{sender_name}' ({chat_id}) to agent {agent_id} (run_id: {run_id})")

    # Maintain full multi-turn conversational session
    history = TELEGRAM_SESSIONS.setdefault(chat_id, [])
    history.append({"role": "user", "content": body.strip()})
    if len(history) > 10:
        history = history[-10:]
        TELEGRAM_SESSIONS[chat_id] = history

    recent_context = ""
    if len(history) > 1:
        prev_lines = []
        for turn in history[:-1]:
            label = sender_name if turn["role"] == "user" else "Hermes"
            prev_lines.append(f"{label}: {turn['content']}")
        recent_context = "Recent conversation:\n" + "\n".join(prev_lines[-4:]) + "\n\n"

    user_message = f"{recent_context}Incoming Telegram message from {sender_name}: \"{body.strip()}\"\nPlease reply directly and warmly to {sender_name}:"

    task_key = f"{agent_id}_{run_id}"
    try:
        task = asyncio.create_task(runtime.execute(agent_id, run_id, user_message, simulation=False))
        runtime.tasks[task_key] = task
        try:
            await task
        finally:
            if task_key in runtime.tasks:
                del runtime.tasks[task_key]

        db = SessionLocal()
        try:
            run_rec = db.get(Run, run_id)
            if not run_rec:
                return

            tool_events = db.query(RunEvent).filter(
                RunEvent.run_id == run_id,
                RunEvent.kind == "tool_result"
            ).all()

            tg_called = any(
                "telegram" in (ev.message or "").lower() or "telegram" in (ev.payload or "").lower()
                for ev in tool_events
            )

            if not tg_called and run_rec.result and run_rec.result.strip():
                reply_text = clean_llm_reply(run_rec.result)
                history.append({"role": "assistant", "content": reply_text})
                logger.info(f"Sending agent's response to Telegram chat {chat_id}...")
                await telegram_send(cfg, chat_id=chat_id, text=reply_text)
                logger.info(f"Telegram response successfully sent to chat {chat_id}!")
            elif not tg_called and (not run_rec.result or not run_rec.result.strip()):
                logger.warning(f"Agent {agent_id} yielded empty response, falling back to direct LLM...")
                await dispatch_telegram_direct_llm(chat_id, sender_name, body, cfg)
            elif tg_called:
                history.append({"role": "assistant", "content": run_rec.result or "[Tool Action Executed]"})
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Error in dispatch_telegram_agent: {e}", exc_info=True)


async def dispatch_telegram_direct_llm(chat_id: str, sender_name: str, body: str, cfg: Dict[str, Any]):
    """Fallback Telegram handler using direct LLM when no agent is active."""
    history = TELEGRAM_SESSIONS.setdefault(chat_id, [])
    history.append({"role": "user", "content": body.strip()})
    if len(history) > 10:
        history = history[-10:]
        TELEGRAM_SESSIONS[chat_id] = history

    models = await llm.models()
    model_id = models[0]["id"] if models else settings.model or "google/gemma-4-31b-qat"
    system_prompt = (
        "You are Hermes, an intelligent and polite personal AI assistant. "
        "Keep your responses concise, helpful, and natural for Telegram chat."
    )
    messages = [{"role": "system", "content": system_prompt}] + history
    try:
        reply_text = await llm.one_shot(model_id, messages, temperature=0.5, max_tokens=1000)
        clean_text = clean_llm_reply(reply_text)
        if clean_text:
            history.append({"role": "assistant", "content": clean_text})
            await telegram_send(cfg, chat_id=chat_id, text=clean_text)
            logger.info(f"Direct LLM response delivered to Telegram chat {chat_id}!")
    except Exception as e:
        logger.error(f"Direct LLM Telegram reply error: {e}")


@router.post("/integrations/telegram/incoming", tags=["Integrations"])
async def telegram_incoming_webhook(payload: Dict[str, Any], db: Session = Depends(get_db)):
    """Webhook endpoint for Telegram Bot API updates (used if webhook is configured)."""
    msg = payload.get("message") or payload.get("channel_post")
    if not msg:
        return {"status": "ignored"}

    chat_id = str(msg.get("chat", {}).get("id", ""))
    sender_name = msg.get("from", {}).get("first_name", "Friend")
    text = msg.get("text", "")
    if not text or not chat_id:
        return {"status": "empty"}

    row = db.get(Integration, "telegram")
    cfg = json.loads(secrets.safe_decrypt(row.config)) if row and row.config else {}

    agents = db.scalars(select(Agent).where(Agent.enabled == True)).all()
    target_agent_id = None
    for a in agents:
        tools = json.loads(a.tools_json or "[]")
        if "telegram.send" in tools:
            target_agent_id = a.id
            break
    if not target_agent_id and agents:
        target_agent_id = agents[0].id

    if target_agent_id:
        asyncio.create_task(dispatch_telegram_agent(target_agent_id, chat_id, sender_name, text, cfg))
    else:
        asyncio.create_task(dispatch_telegram_direct_llm(chat_id, sender_name, text, cfg))

    return {"status": "received"}


# ==============================================================================
# Email / Gmail Auto-Responder Dispatcher
# ==============================================================================

EMAIL_SESSIONS: Dict[str, List[Dict[str, str]]] = {}
PROCESSED_EMAIL_IDS: set = set()


def extract_email_body_clean(msg: email.message.Message) -> str:
    """Extract clean plain-text body from an email Message object."""
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            cdispo = str(part.get('Content-Disposition'))
            if ctype == 'text/plain' and 'attachment' not in cdispo:
                payload = part.get_payload(decode=True)
                if payload:
                    charset = part.get_content_charset() or 'utf-8'
                    body += payload.decode(charset, errors='replace')
        if not body:
            for part in msg.walk():
                if part.get_content_type() == 'text/html':
                    payload = part.get_payload(decode=True)
                    if payload:
                        charset = part.get_content_charset() or 'utf-8'
                        html_text = payload.decode(charset, errors='replace')
                        body += re.sub(r'<[^>]+>', ' ', html_text)
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            charset = msg.get_content_charset() or 'utf-8'
            body = payload.decode(charset, errors='replace')
        else:
            body = str(msg.get_payload() or "")
    return body.strip()


async def dispatch_email_agent(agent_id: Optional[str], from_addr: str, subject: str, body: str, cfg: Dict[str, Any]):
    """
    Executes the agent or LLM for an incoming email and sends an automated reply.
    """
    import email.utils
    real_name, sender_email = email.utils.parseaddr(from_addr)
    sender_email = sender_email.strip()
    if not sender_email:
        return

    clean_name = real_name or sender_email.split("@")[0]
    clean_subj = re.sub(r'^(Re:\s*)+', '', subject, flags=re.IGNORECASE).strip()
    reply_subject = f"Re: {clean_subj}" if clean_subj else "Re: Your message to Hermes"

    run_id = uuid.uuid4().hex[:16]
    logger.info(f"Dispatching Email from '{sender_email}' ('{reply_subject}') to agent {agent_id or 'direct_llm'} (run_id: {run_id})")

    history = EMAIL_SESSIONS.setdefault(sender_email, [])
    history.append({"role": "user", "content": f"Subject: {subject}\n\n{body}"})
    if len(history) > 8:
        history = history[-8:]
        EMAIL_SESSIONS[sender_email] = history

    user_message = (
        f"You received an email from {clean_name} <{sender_email}>.\n"
        f"Subject: {subject}\n\n"
        f"{body}\n\n"
        f"Please write a warm, professional, and helpful email reply to {clean_name}."
    )

    reply_sent = False
    if agent_id:
        task_key = f"{agent_id}_{run_id}"
        try:
            task = asyncio.create_task(runtime.execute(agent_id, run_id, user_message, simulation=False))
            runtime.tasks[task_key] = task
            try:
                await task
            finally:
                if task_key in runtime.tasks:
                    del runtime.tasks[task_key]

            db = SessionLocal()
            try:
                run_rec = db.get(Run, run_id)
                if run_rec and run_rec.result and run_rec.result.strip():
                    tool_events = db.query(RunEvent).filter(
                        RunEvent.run_id == run_id,
                        RunEvent.kind == "tool_result"
                    ).all()
                    email_called = any("email" in (ev.message or "").lower() for ev in tool_events)
                    if not email_called:
                        reply_text = clean_llm_reply(run_rec.result)
                        history.append({"role": "assistant", "content": reply_text})
                        logger.info(f"Sending automated reply to {sender_email} via SMTP...")
                        await email_send(cfg, to=sender_email, subject=reply_subject, body=reply_text)
                        reply_sent = True
                        logger.info(f"Automated email reply sent to {sender_email}!")
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Error in agent email dispatch: {e}", exc_info=True)

    # Fallback to direct LLM if agent failed or did not send
    if not reply_sent:
        try:
            models = await llm.models()
            model_id = models[0]["id"] if models else settings.model or "google/gemma-4-31b-qat"
            sys_prompt = (
                "You are Hermes, an intelligent and polite executive AI assistant. "
                "Draft a professional, clear, and courteous email reply. "
                "Do not include email header placeholders like 'Subject:'; just write the direct email body."
            )
            messages = [
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": user_message}
            ]
            reply_text = await llm.one_shot(model_id, messages, temperature=0.5, max_tokens=1000)
            clean_text = clean_llm_reply(reply_text)
            if clean_text:
                history.append({"role": "assistant", "content": clean_text})
                await email_send(cfg, to=sender_email, subject=reply_subject, body=clean_text)
                logger.info(f"Direct LLM email reply sent to {sender_email}!")
        except Exception as e:
            logger.error(f"Direct LLM email reply error: {e}")


# ==============================================================================
# Workflow Synthesis
# ==============================================================================

@router.post("/workflows/generate", tags=["AI Generation"])
async def generate_workflow(request: WorkflowRequest):
    """Natural Language Objective -> React Flow Visual Pipeline."""
    models = await llm.models()
    model_id = request.model or settings.model or (models[0]["id"] if models else None)

    if not model_id:
        raise HTTPException(status_code=400, detail="No LM Studio model available to generate workflow.")

    system_prompt = (
        "You are an expert AI architect translating user goals into a React Flow pipeline. "
        "Return ONLY a valid JSON object with:\n"
        "1. 'nodes': array of {id, type, title} where type in ['trigger', 'ai', 'logic', 'tool'].\n"
        "2. 'edges': array of {source, target}.\n"
        "3. 'required_tools': array of strings matching available tools like 'web.search', 'email.search', 'whatsapp.send'."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Build a visual workflow graph for this objective: {request.goal}"}
    ]

    response_text = await llm.one_shot(model_id, messages, temperature=0.2, max_tokens=1500)

    try:
        start_idx = response_text.find('{')
        end_idx = response_text.rfind('}') + 1
        if start_idx == -1 or end_idx == 0:
            raise ValueError("No JSON block found")
        workflow_data = json.loads(response_text[start_idx:end_idx])
        return workflow_data
    except Exception:
        # Fallback template
        return {
            "nodes": [
                {"id": "trigger", "type": "trigger", "title": "Manual Trigger"},
                {"id": "ai", "type": "ai", "title": "AI Reasoner"},
                {"id": "tool", "type": "tool", "title": "Tool Execution"},
                {"id": "approval", "type": "logic", "title": "Human Approval"}
            ],
            "edges": [
                {"source": "trigger", "target": "ai"},
                {"source": "ai", "target": "tool"},
                {"source": "tool", "target": "approval"}
            ],
            "required_tools": ["web.search"]
        }


# ==============================================================================
# Control Bot & Streaming Chat
# ==============================================================================

@router.post("/helpbot", tags=["Control Bot"])
async def control_bot_stream(request: ChatRequest, db: Session = Depends(get_db)):
    """Token-to-token streaming Help Bot that can read and control the local agent fleet."""
    all_agents = [serialize_agent(a) for a in db.scalars(select(Agent)).all()]

    # Check for direct NLP fleet commands
    command_tuple = runtime.control(request.message, all_agents)
    if command_tuple:
        cmd, target_id = command_tuple[0], command_tuple[1]
        if cmd == "start":
            result = await runtime.start(target_id)
            return {**result, "mode": "action", "message": f"Started agent {target_id}"}
        elif cmd == "stop":
            stopped = await runtime.stop(target_id)
            return {"mode": "action", "stopped": stopped, "agent_id": target_id, "message": f"Stopped agent {target_id}"}
        elif cmd in ["rename", "tone"]:
            agent = db.get(Agent, target_id)
            if agent:
                if cmd == "rename":
                    agent.name = command_tuple[2]
                elif cmd == "tone":
                    agent.tone = command_tuple[2]
                db.commit()
                return {"mode": "action", "updated": serialize_agent(agent), "message": f"Updated agent {target_id} {cmd}"}

    models = await llm.models()
    model_id = settings.model or (models[0]["id"] if models else None)
    if not model_id:
        raise HTTPException(status_code=400, detail="No LM Studio model available for the bot.")

    inventory_context = "\n".join(
        f"- ID: {a['id']} | Name: {a['name']} | Status: {'RUNNING' if a['enabled'] else 'IDLE'} | Tone: {a['tone']} | Model: {a['model'] or 'Default'}"
        for a in all_agents
    )

    bot_system_prompt = (
        "You are the Hermes Agent Studio AI Assistant & Control Bot.\n"
        "You help users manage and monitor their local AI agent fleet, set up tools, and orchestrate tasks.\n"
        "You can explain how to set up WhatsApp QR, Email IMAP/SMTP, and how to create agents.\n"
        "Be concise, friendly, and practical.\n\n"
        f"Active Local Agent Fleet:\n{inventory_context or 'No agents configured yet.'}"
    )

    async def event_generator():
        messages = [
            {"role": "system", "content": bot_system_prompt},
            {"role": "user", "content": request.message}
        ]
        try:
            async for event in llm.stream(model_id, messages, temperature=0.4, max_tokens=1500):
                if event["type"] == "token":
                    yield f'data: {json.dumps({"type": "token", "text": event["text"]})}\n\n'
            yield 'data: {"type": "done"}\n\n'
        except Exception as e:
            yield f'data: {json.dumps({"type": "error", "message": str(e)})}\n\n'

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/chat", tags=["Playground"])
async def playground_chat_stream(request: ChatStreamRequest):
    """Direct playground token-to-token streaming with explicit model and parameter selection."""
    models = await llm.models()
    model_id = request.model or settings.model or (models[0]["id"] if models else None)

    if not model_id:
        raise HTTPException(status_code=400, detail="No LM Studio model available. Please load a model first.")

    system_prompt = request.system_prompt or "You are a helpful AI assistant."
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": request.message}
    ]

    async def event_generator():
        try:
            async for event in llm.stream(
                model_id,
                messages,
                temperature=request.temperature or 0.7,
                top_p=request.top_p or 0.95,
                max_tokens=request.max_tokens or 1024
            ):
                if event["type"] == "token":
                    yield f'data: {json.dumps({"type": "token", "text": event["text"]})}\n\n'
                elif event["type"] == "meta":
                    yield f'data: {json.dumps({"type": "meta", "ttft": event["ttft"]})}\n\n'
            yield 'data: {"type": "done"}\n\n'
        except Exception as e:
            yield f'data: {json.dumps({"type": "error", "message": str(e)})}\n\n'

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ==============================================================================
# Multimodal Inference & Task-Focused Work Modes
# ==============================================================================

_THINKING_CAPABILITIES_CACHE: Dict[str, bool] = {}

@router.get("/multimodal/capabilities", tags=["Multimodal"])
async def multimodal_capabilities():
    """Detects whether currently loaded LLM supports thinking/reasoning mode."""
    models = await llm.models()
    if not models:
        return {"model": None, "supports_thinking": False}

    model_id = models[0]["id"]
    if model_id in _THINKING_CAPABILITIES_CACHE:
        return {"model": model_id, "supports_thinking": _THINKING_CAPABILITIES_CACHE[model_id]}

    m_lower = model_id.lower()
    reasoning_keywords = ["r1", "qwq", "gemma-4", "gemma4", "reason", "think", "thought", "cot", "deepseek-r1"]
    supports = any(k in m_lower for k in reasoning_keywords)

    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get(f"{llm.base_url}/api/v0/models")
            if r.status_code == 200:
                data = r.json().get("data", [])
                for m in data:
                    if m.get("id") == model_id:
                        caps = [str(c).lower() for c in m.get("capabilities", [])]
                        if any("reason" in c or "think" in c for c in caps):
                            supports = True
    except Exception:
        pass

    _THINKING_CAPABILITIES_CACHE[model_id] = supports
    return {"model": model_id, "supports_thinking": supports}


@router.get("/multimodal/modes", tags=["Multimodal"])
def list_work_modes():
    """Returns the matrix of task-focused work modes with metadata and prompts."""
    return [
        {
            "id": mode_id,
            "title": data["title"],
            "description": data["description"]
        }
        for mode_id, data in WORK_MODES.items()
    ]


@router.post("/multimodal/chat", tags=["Multimodal"])
async def multimodal_chat_stream(request: MultimodalChatRequest):
    """
    Direct multimodal inference chatbot utilizing the loaded LM Studio model.
    Parses attached PDFs, PPTXs, DOCXs, Spreadsheets, and Images, then streams the response.
    """
    models = await llm.models()
    model_id = request.model or settings.model or (models[0]["id"] if models else None)

    if not model_id:
        raise HTTPException(status_code=400, detail="No LM Studio model available. Please load a model in VRAM first.")

    # Select Mode System Prompt
    mode_info = WORK_MODES.get(request.mode, WORK_MODES["general"])
    system_prompt = mode_info["system_prompt"]

    # Parse and extract all attached files
    extracted_docs = []
    vision_payloads = []

    if request.files:
        for f in request.files:
            text_rep, vision_item = parse_attached_file(f.name, f.content_base64, f.type or "")
            if text_rep:
                extracted_docs.append(text_rep)
            if vision_item:
                vision_payloads.append(vision_item)

    # Compose User message content
    full_text_parts = []
    if extracted_docs:
        full_text_parts.append("### ATTACHED MULTIMODAL CONTEXT & DOCUMENTS:\n" + "\n\n".join(extracted_docs) + "\n\n---")
    
    full_text_parts.append(request.prompt)
    combined_user_text = "\n\n".join(full_text_parts)

    # If vision payloads exist, format user content for vision models
    if vision_payloads:
        user_content_obj = [{"type": "text", "text": combined_user_text}] + vision_payloads
    else:
        user_content_obj = combined_user_text

    messages = [{"role": "system", "content": system_prompt}]
    if request.history:
        for turn in request.history:
            r = turn.get("role")
            c = turn.get("content", "")
            if r in ("user", "assistant") and c:
                messages.append({"role": r, "content": c})
    messages.append({"role": "user", "content": user_content_obj})

    async def event_generator():
        try:
            async for event in llm.stream(
                model_id,
                messages,
                temperature=request.temperature or 0.7,
                max_tokens=2048
            ):
                if event["type"] == "token":
                    yield f'data: {json.dumps({"type": "token", "text": event["text"]})}\n\n'
                elif event["type"] == "thought":
                    yield f'data: {json.dumps({"type": "thought", "text": event["text"]})}\n\n'
                elif event["type"] == "meta":
                    yield f'data: {json.dumps({"type": "meta", "ttft": event.get("ttft", 0), "model": model_id})}\n\n'
            yield 'data: {"type": "done"}\n\n'
        except Exception as e:
            logger.error(f"Multimodal stream error: {e}", exc_info=True)
            yield f'data: {json.dumps({"type": "error", "message": str(e)})}\n\n'

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ==============================================================================
# Authentication & Multi-User Management
# ==============================================================================

@router.post("/auth/signup", tags=["Auth"])
def auth_signup(req: UserSignup, db: Session = Depends(get_db)):
    """Register a new user account with isolated agent fleets and settings."""
    existing = db.execute(select(User).where((User.username == req.username) | (User.email == req.email))).scalars().first()
    if existing:
        raise HTTPException(status_code=400, detail="Username or email already registered.")

    user_id = uuid.uuid4().hex[:16]
    hashed = hash_password(req.password)
    user = User(
        id=user_id,
        username=req.username.strip(),
        email=req.email.strip().lower(),
        name=req.name.strip() if req.name else req.username.strip(),
        password_hash=hashed,
        settings_json=json.dumps({"theme": "dark", "preferred_tone": "friendly"})
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user_id)
    return {
        "status": "success",
        "token": token,
        "user": serialize_user(user)
    }


@router.post("/auth/login", tags=["Auth"])
def auth_login(req: UserLogin, db: Session = Depends(get_db)):
    """Authenticate with username or email and password."""
    ident = req.username_or_email.strip().lower()
    user = db.execute(select(User).where((func.lower(User.username) == ident) | (func.lower(User.email) == ident))).scalars().first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    if not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    token = create_access_token(user.id)
    return {
        "status": "success",
        "token": token,
        "user": serialize_user(user)
    }


@router.get("/auth/me", tags=["Auth"])
def auth_me(db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    """Get active authenticated user account profile and settings."""
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required.")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User account not found.")
    return serialize_user(user)


@router.patch("/auth/settings", tags=["Auth"])
def auth_update_settings(patch: UserSettingsUpdate, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    """Update settings or display name for the current user."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if patch.name is not None:
        user.name = patch.name
    if patch.settings is not None:
        curr = json.loads(user.settings_json or "{}")
        curr.update(patch.settings)
        user.settings_json = json.dumps(curr)
    db.commit()
    db.refresh(user)
    return serialize_user(user)


@router.post("/auth/logout", tags=["Auth"])
def auth_logout():
    """Client logout confirmation."""
    return {"status": "logged_out"}


# ==============================================================================
# Autonomous Scheduler & Recurring Tasks
# ==============================================================================

def parse_schedule_interval_seconds(expr: str) -> int:
    e = expr.lower().strip()
    if "@hourly" in e:
        return 3600
    if "@daily" in e:
        return 86400
    if "@weekly" in e:
        return 604800
    if "every minute" in e or "every 1 min" in e:
        return 60
    if "every hour" in e or "every 1 hour" in e or "every 1 hr" in e:
        return 3600
    if "every day" in e or "every 1 day" in e:
        return 86400
    m_min = re.search(r'every\s+(\d+)\s*(?:minutes?|mins?|m\b)', e)
    if m_min:
        return max(15, int(m_min.group(1)) * 60)
    m_hr = re.search(r'every\s+(\d+)\s*(?:hours?|hrs?|h\b)', e)
    if m_hr:
        return max(60, int(m_hr.group(1)) * 3600)
    m_sec = re.search(r'every\s+(\d+)\s*(?:seconds?|secs?|s\b)', e)
    if m_sec:
        return max(15, int(m_sec.group(1)))
    # Cron standard notation: */5 * * * * or * * * * *
    parts = e.split()
    if len(parts) == 5:
        minute_part = parts[0]
        if minute_part.startswith("*/"):
            try:
                mins = int(minute_part.replace("*/", ""))
                return max(15, mins * 60)
            except ValueError:
                pass
        elif minute_part == "*":
            return 60
        elif parts[1] == "*" and minute_part == "0":
            return 3600
        elif minute_part == "0" and parts[1] == "0":
            return 86400
    return 3600


async def telegram_polling_worker():
    """
    Continuous background long-polling loop for Telegram Bot API.
    Retrieves incoming updates, dispatches messages to the configured agent, and sends replies.
    """
    logger.info("Hermes Telegram Bot background poller starting...")
    offset = None
    while True:
        try:
            db = SessionLocal()
            try:
                row = db.get(Integration, "telegram")
                cfg = json.loads(secrets.safe_decrypt(row.config)) if row and row.config else {}
            finally:
                db.close()

            bot_token = cfg.get("bot_token")
            if not bot_token:
                await asyncio.sleep(10)
                continue

            url = f"https://api.telegram.org/bot{bot_token}/getUpdates"
            params = {"timeout": 10}
            if offset is not None:
                params["offset"] = offset

            async with httpx.AsyncClient(timeout=25) as client:
                r = await client.get(url, params=params)
                if r.status_code != 200:
                    await asyncio.sleep(5)
                    continue
                data = r.json()

            if not data.get("ok"):
                await asyncio.sleep(5)
                continue

            updates = data.get("result", [])
            for u in updates:
                update_id = u.get("update_id")
                offset = update_id + 1

                msg = u.get("message") or u.get("channel_post")
                if not msg:
                    continue

                chat = msg.get("chat", {})
                chat_id = str(chat.get("id", ""))
                from_user = msg.get("from", {})
                sender_name = from_user.get("first_name") or from_user.get("username") or "Friend"
                text = msg.get("text", "")

                if not text or not chat_id:
                    continue

                logger.info(f"Received Telegram message from '{sender_name}' ({chat_id}): '{text}'")

                db = SessionLocal()
                target_agent_id = None
                try:
                    agents = db.scalars(select(Agent).where(Agent.enabled == True)).all()
                    for a in agents:
                        tools = json.loads(a.tools_json or "[]")
                        if "telegram.send" in tools:
                            target_agent_id = a.id
                            break
                    if not target_agent_id and agents:
                        target_agent_id = agents[0].id
                finally:
                    db.close()

                if target_agent_id:
                    await dispatch_telegram_agent(target_agent_id, chat_id, sender_name, text, cfg)
                else:
                    await dispatch_telegram_direct_llm(chat_id, sender_name, text, cfg)

        except httpx.TimeoutException:
            continue
        except Exception as e:
            logger.warning(f"Telegram polling loop error: {e}")
            await asyncio.sleep(5)


async def email_watcher_worker():
    """
    Continuous background loop that monitors connected IMAP inbox for new unread messages,
    dispatches them to an active agent, and sends automated replies.
    """
    logger.info("Hermes Email Inbox background watcher starting...")
    IGNORED_SENDERS = [
        "no-reply@", "noreply@", "mailer-daemon@", "googlecommunityteam-noreply@",
        "accounts-noreply@", "notifications@", "security-noreply@"
    ]

    while True:
        try:
            await asyncio.sleep(15)

            db = SessionLocal()
            try:
                row = db.get(Integration, "email")
                cfg = json.loads(secrets.safe_decrypt(row.config)) if row and row.config else {}
            finally:
                db.close()

            email_addr = cfg.get("email") or cfg.get("username")
            app_password = cfg.get("app_password") or cfg.get("password")
            if not email_addr or not app_password:
                continue

            clean_pwd = re.sub(r'[\s ​ ]+', '', str(app_password)).strip(' "\'')
            clean_email = str(email_addr).strip()
            imap_host = cfg.get("imap_host", "imap.gmail.com")
            imap_port = int(cfg.get("imap_port", 993))

            def _check_inbox_sync():
                unread_items = []
                mail = imaplib.IMAP4_SSL(imap_host, imap_port)
                mail._encoding = 'utf-8'
                try:
                    mail.login(clean_email, clean_pwd)
                    mail.select("INBOX", readonly=False)

                    status, msg_ids = mail.search(None, "UNSEEN")
                    if status == "OK" and msg_ids and msg_ids[0]:
                        id_list = msg_ids[0].split()
                        for msg_id in id_list:
                            try:
                                res, data = mail.fetch(msg_id, "(RFC822)")
                                if res != "OK":
                                    continue
                                raw_email = data[0][1]
                                msg = email.message_from_bytes(raw_email)
                                from_addr = decode_mime_words(msg.get("From", ""))
                                subject = decode_mime_words(msg.get("Subject", "(No Subject)"))
                                msg_uid = msg.get("Message-ID", msg_id.decode("ascii", errors="ignore"))
                                body = extract_email_body_clean(msg)

                                # Mark as seen in IMAP
                                mail.store(msg_id, '+FLAGS', r'\Seen')

                                unread_items.append({
                                    "msg_id": msg_id.decode("ascii", errors="ignore"),
                                    "uid": msg_uid,
                                    "from": from_addr,
                                    "subject": subject,
                                    "body": body
                                })
                            except Exception as ex:
                                logger.warning(f"Error fetching email {msg_id}: {ex}")
                finally:
                    try:
                        mail.logout()
                    except Exception:
                        pass
                return unread_items

            unseen_messages = await asyncio.to_thread(_check_inbox_sync)

            for item in unseen_messages:
                from_addr = item["from"]
                subject = item["subject"]
                body = item["body"]
                uid = item["uid"]

                # Skip self-sent emails
                if clean_email.lower() in from_addr.lower():
                    continue

                # Skip automated system notifications
                if any(ign in from_addr.lower() for ign in IGNORED_SENDERS):
                    continue

                if uid in PROCESSED_EMAIL_IDS:
                    continue
                PROCESSED_EMAIL_IDS.add(uid)

                logger.info(f"Incoming email detected from '{from_addr}': Subject='{subject}'")

                db = SessionLocal()
                target_agent_id = None
                try:
                    agents = db.scalars(select(Agent).where(Agent.enabled == True)).all()
                    for a in agents:
                        tools = json.loads(a.tools_json or "[]")
                        if any("email" in t for t in tools):
                            target_agent_id = a.id
                            break
                    if not target_agent_id and agents:
                        target_agent_id = agents[0].id
                finally:
                    db.close()

                await dispatch_email_agent(target_agent_id, from_addr, subject, body, cfg)

        except Exception as e:
            logger.warning(f"Email watcher loop error: {e}")
            await asyncio.sleep(10)


async def execute_schedule_task(schedule_id: str, agent_id: str, run_id: str, prompt: str):
    """Executes a schedule task, awaits completion, and updates the schedule status and outcome."""
    logger.info(f"[SCHEDULER] Starting background task for schedule '{schedule_id}' (run: {run_id})")
    try:
        await runtime.execute(agent_id, run_id, prompt, simulation=False)
        db = SessionLocal()
        try:
            sched = db.get(Schedule, schedule_id)
            run_rec = db.get(Run, run_id)
            if sched:
                status = run_rec.status if run_rec else "completed"
                sched.last_status = status
                if run_rec and run_rec.result:
                    sched.last_result = run_rec.result
                sched.last_run_id = run_id
                interval = parse_schedule_interval_seconds(sched.cron_expression)
                sched.next_run = (sched.last_run or utc_now()) + timedelta(seconds=interval)
                db.commit()
                logger.info(f"[SCHEDULER] Schedule '{schedule_id}' finished successfully with status '{status}'")
        finally:
            db.close()
    except Exception as e:
        logger.error(f"[SCHEDULER] Execution failed for schedule '{schedule_id}': {e}", exc_info=True)
        db = SessionLocal()
        try:
            sched = db.get(Schedule, schedule_id)
            if sched:
                sched.last_status = "failed"
                sched.last_result = f"Error: {str(e)}"
                sched.last_run_id = run_id
                db.commit()
        finally:
            db.close()


async def scheduler_worker():
    """Background worker continuously checking scheduled cron jobs and executing due tasks."""
    logger.info("Hermes Autonomous Background Scheduler loop running.")
    while True:
        try:
            await asyncio.sleep(15)
            db = SessionLocal()
            try:
                schedules = db.scalars(select(Schedule).where(Schedule.enabled == True)).all()
                now = utc_now()
                for s in schedules:
                    interval_sec = parse_schedule_interval_seconds(s.cron_expression)
                    should_run = False
                    if not s.last_run:
                        should_run = True
                    else:
                        elapsed = (now - s.last_run).total_seconds()
                        if elapsed >= interval_sec:
                            should_run = True

                    if should_run:
                        logger.info(f"[SCHEDULER] Triggering scheduled automation '{s.name}' for agent '{s.agent_id}'")
                        run_id = uuid.uuid4().hex[:12]
                        s.last_run = now
                        s.last_status = "running"
                        s.last_run_id = run_id
                        s.next_run = now + timedelta(seconds=interval_sec)
                        db.commit()
                        asyncio.create_task(execute_schedule_task(s.id, s.agent_id, run_id, s.task_prompt))
            finally:
                db.close()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"[SCHEDULER] Loop error: {e}")
            await asyncio.sleep(10)


@router.get("/schedules", tags=["Scheduler"])
def list_schedules(db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    """List all scheduled recurring automation jobs."""
    if user_id and user_id != "default_user":
        scheds = db.scalars(select(Schedule).where((Schedule.user_id == user_id) | (Schedule.user_id == "default_user")).order_by(desc(Schedule.created_at))).all()
    else:
        scheds = db.scalars(select(Schedule).order_by(desc(Schedule.created_at))).all()
    return [serialize_schedule(s) for s in scheds]


@router.post("/schedules", tags=["Scheduler"])
def create_schedule(req: ScheduleCreate, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    """Create a new recurring scheduled job."""
    sched_id = uuid.uuid4().hex[:12]
    new_sched = Schedule(
        id=sched_id,
        user_id=user_id,
        agent_id=req.agent_id,
        name=req.name,
        cron_expression=req.cron_expression,
        task_prompt=req.task_prompt,
        enabled=req.enabled,
        last_status="ready"
    )
    db.add(new_sched)
    db.commit()
    db.refresh(new_sched)
    return serialize_schedule(new_sched)


@router.patch("/schedules/{schedule_id}", tags=["Scheduler"])
def update_schedule(schedule_id: str, patch: SchedulePatch, db: Session = Depends(get_db)):
    """Update scheduled automation task properties."""
    sched = db.get(Schedule, schedule_id)
    if not sched:
        raise HTTPException(status_code=404, detail="Schedule not found")

    patch_dict = patch.model_dump(exclude_unset=True)
    for k, v in patch_dict.items():
        setattr(sched, k, v)

    db.commit()
    db.refresh(sched)
    return serialize_schedule(sched)


@router.delete("/schedules/{schedule_id}", tags=["Scheduler"])
def delete_schedule(schedule_id: str, db: Session = Depends(get_db)):
    """Delete a scheduled automation task."""
    sched = db.get(Schedule, schedule_id)
    if not sched:
        raise HTTPException(status_code=404, detail="Schedule not found")
    db.delete(sched)
    db.commit()
    return {"status": "deleted", "id": schedule_id}


@router.post("/schedules/{schedule_id}/run-now", tags=["Scheduler"])
async def run_schedule_now(schedule_id: str, db: Session = Depends(get_db)):
    """Immediately trigger a scheduled automation job."""
    sched = db.get(Schedule, schedule_id)
    if not sched:
        raise HTTPException(status_code=404, detail="Schedule not found")

    now = utc_now()
    sched.last_run = now
    sched.last_status = "running"
    run_id = uuid.uuid4().hex[:12]
    sched.last_run_id = run_id
    interval = parse_schedule_interval_seconds(sched.cron_expression)
    sched.next_run = now + timedelta(seconds=interval)
    db.commit()

    asyncio.create_task(execute_schedule_task(sched.id, sched.agent_id, run_id, sched.task_prompt))
    return {"status": "triggered", "run_id": run_id, "schedule_id": sched.id}


# ==============================================================================
# Obsidian & Second Brain Endpoints
# ==============================================================================

@router.get("/obsidian/vault-info", tags=["Obsidian"])
def get_obsidian_info(db: Session = Depends(get_db)):
    """Retrieve Obsidian Second Brain vault directory status and stats."""
    row = db.get(Integration, "obsidian")
    custom_path = ""
    if row and row.config:
        cfg = json.loads(secrets.safe_decrypt(row.config) or "{}")
        custom_path = cfg.get("vault_path", "")
    vault_path = get_obsidian_vault_path(custom_path)
    notes = list(vault_path.glob("*.md"))
    total_bytes = sum(n.stat().st_size for n in notes)
    return {
        "vault_path": str(vault_path),
        "note_count": len(notes),
        "total_bytes": total_bytes,
        "is_custom": bool(custom_path)
    }


@router.get("/obsidian/notes", tags=["Obsidian"])
def list_obsidian_notes(db: Session = Depends(get_db)):
    """List markdown notes stored in Obsidian Second Brain vault."""
    row = db.get(Integration, "obsidian")
    custom_path = ""
    if row and row.config:
        cfg = json.loads(secrets.safe_decrypt(row.config) or "{}")
        custom_path = cfg.get("vault_path", "")
    vault_path = get_obsidian_vault_path(custom_path)
    results = []
    for f in sorted(vault_path.glob("*.md"), key=lambda x: x.stat().st_mtime, reverse=True)[:100]:
        try:
            content = f.read_text(encoding="utf-8", errors="replace")
            preview = content[:200].replace("\n", " ")
            results.append({
                "name": f.name,
                "title": f.stem,
                "size": f.stat().st_size,
                "mtime": datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
                "preview": preview
            })
        except Exception:
            continue
    return results


@router.get("/obsidian/notes/{note_name}", tags=["Obsidian"])
def get_obsidian_note(note_name: str, db: Session = Depends(get_db)):
    """Read a specific markdown note from Obsidian vault."""
    row = db.get(Integration, "obsidian")
    custom_path = ""
    if row and row.config:
        cfg = json.loads(secrets.safe_decrypt(row.config) or "{}")
        custom_path = cfg.get("vault_path", "")
    vault_path = get_obsidian_vault_path(custom_path)
    if not note_name.endswith(".md"):
        note_name += ".md"
    target = vault_path / note_name
    if not target.exists():
        raise HTTPException(status_code=404, detail="Note not found")
    return {
        "name": note_name,
        "content": target.read_text(encoding="utf-8", errors="replace"),
        "path": str(target)
    }


@router.post("/obsidian/notes", tags=["Obsidian"])
def save_obsidian_note(note_in: ObsidianNoteCreate, db: Session = Depends(get_db)):
    """Save or update a note in the Obsidian Second Brain vault."""
    row = db.get(Integration, "obsidian")
    custom_path = ""
    if row and row.config:
        cfg = json.loads(secrets.safe_decrypt(row.config) or "{}")
        custom_path = cfg.get("vault_path", "")
    vault_path = get_obsidian_vault_path(custom_path)
    clean_name = re.sub(r'[^a-zA-Z0-9_\- ]', '', note_in.title).strip().replace(" ", "-") or "note"
    note_file = f"{clean_name}.md"
    target = vault_path / note_file
    tag_list = note_in.tags or ["hermes", "ai-memory"]
    frontmatter = f"---\ntitle: {note_in.title}\ntags: {json.dumps(tag_list)}\nupdated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n---\n\n"
    target.write_text(frontmatter + note_in.content, encoding="utf-8")
    return {"status": "saved", "name": note_file, "path": str(target)}


@router.delete("/obsidian/notes/{note_name}", tags=["Obsidian"])
def delete_obsidian_note(note_name: str, db: Session = Depends(get_db)):
    """Delete a note from Obsidian vault."""
    row = db.get(Integration, "obsidian")
    custom_path = ""
    if row and row.config:
        cfg = json.loads(secrets.safe_decrypt(row.config) or "{}")
        custom_path = cfg.get("vault_path", "")
    vault_path = get_obsidian_vault_path(custom_path)
    if not note_name.endswith(".md"):
        note_name += ".md"
    target = vault_path / note_name
    if target.exists():
        target.unlink()
    return {"status": "deleted", "name": note_name}


app.include_router(router)


@app.on_event("startup")
async def on_startup():
    """Initialize database, runtime, background scheduler, telegram poller, and email watcher."""
    init_db()
    asyncio.create_task(scheduler_worker())
    asyncio.create_task(telegram_polling_worker())
    asyncio.create_task(email_watcher_worker())
    logger.info("Hermes Agent Studio master server initialized with background scheduler, telegram poller, and email watcher.")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=settings.host, port=settings.port)
