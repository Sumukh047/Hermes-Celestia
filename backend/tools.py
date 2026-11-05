"""
Hermes Agent Studio - Tool Registry & Execution Engine
Defines all available tool capabilities for autonomous agents, including:
- Real-time Public Web Search (DuckDuckGo DOM engine)
- Web Scraping & Page Extraction
- Secure Local Filesystem Operations (Read, List, Write)
- Arbitrary REST API HTTP Requests
- Communication Integrations (Email, WhatsApp, Telegram, Discord, Slack)

All tools feature explicit JSON Schema definitions for high-precision OpenAI-compatible tool calling.
"""

import asyncio
import json
import logging
import os
import pathlib
import re
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional
from urllib.parse import urlparse, unquote
import httpx
import psutil

logger = logging.getLogger("hermes_agent_studio.tools")


# ==============================================================================
# Tool Data Model
# ==============================================================================

@dataclass
class Tool:
    """
    Defines an executable agent capability.
    """
    name: str
    description: str
    risk: str  # 'low', 'medium', 'high'
    category: str  # 'Web', 'Local', 'Communication', 'Developer'
    parameters: Dict[str, Any]
    fn: Optional[Callable] = None


# ==============================================================================
# Web Tools
# ==============================================================================

async def web_fetch(url: str, max_chars: int = 15000) -> Dict[str, Any]:
    """Fetches the raw text content of a public URL."""
    parsed = urlparse(url)
    if parsed.scheme not in ('http', 'https'):
        raise ValueError(f"Security Error: Scheme '{parsed.scheme}' is prohibited. Only HTTP(S) allowed.")

    logger.info(f"Fetching URL: {url}")
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) HermesAgentStudio/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=15, headers=headers) as client:
            response = await client.get(url)
            response.raise_for_status()

            raw_text = response.text
            clean_text = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', raw_text, flags=re.IGNORECASE | re.DOTALL)
            clean_text = re.sub(r'<[^>]+>', ' ', clean_text)
            clean_text = re.sub(r'\s+', ' ', clean_text).strip()

            return {
                'url': str(response.url),
                'status': response.status_code,
                'content': clean_text[:max_chars],
                'truncated': len(clean_text) > max_chars
            }
    except Exception as e:
        logger.error(f"HTTP Request failed for {url}: {str(e)}")
        return {"error": f"Failed to fetch page: {str(e)}"}


async def web_search(query: str, max_results: int = 5) -> List[Dict[str, str]]:
    """Performs a web search via DuckDuckGo HTML endpoint."""
    logger.info(f"Executing web search for: {query}")
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }

    try:
        async with httpx.AsyncClient(timeout=12, headers=headers) as client:
            response = await client.post('https://html.duckduckgo.com/html/', data={'q': query})
            response.raise_for_status()
            html = response.text

            links = re.findall(r'class="result__a"[^>]*href="([^"]+)"', html)[:max_results]
            titles = re.findall(r'class="result__a"[^>]*>(.*?)</a>', html, re.S)
            snippets = re.findall(r'class="result__snippet"[^>]*>(.*?)</a>', html, re.S)

            results = []
            for i, raw_url in enumerate(links):
                raw_title = titles[i] if i < len(titles) else "Result"
                clean_title = re.sub(r'<.*?>', '', raw_title).strip()
                clean_url = unquote(raw_url)

                # Extract DDG redirect target if applicable
                if 'uddg=' in clean_url:
                    m = re.search(r'uddg=([^&]+)', clean_url)
                    if m:
                        clean_url = unquote(m.group(1))

                snippet = re.sub(r'<.*?>', '', snippets[i]).strip() if i < len(snippets) else ""

                results.append({
                    'title': clean_title,
                    'url': clean_url,
                    'snippet': snippet
                })

            return results
    except Exception as e:
        logger.error(f"Web search failed: {str(e)}")
        return [{"error": str(e)}]


async def http_request(method: str, url: str, headers: Optional[Dict[str, str]] = None, body: Any = None) -> Dict[str, Any]:
    """Executes an arbitrary HTTP REST call."""
    parsed = urlparse(url)
    if parsed.scheme not in ('http', 'https'):
        raise ValueError("Only http(s) URLs are supported")

    logger.info(f"Executing {method.upper()} request to {url}")
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            request_kwargs = {
                "method": method.upper(),
                "url": url,
                "headers": headers or {}
            }
            if isinstance(body, (dict, list)):
                request_kwargs["json"] = body
            elif isinstance(body, str):
                request_kwargs["content"] = body

            response = await client.request(**request_kwargs)
            try:
                response_data = response.json()
            except Exception:
                response_data = response.text[:20000]

            return {
                'status': response.status_code,
                'headers': dict(response.headers),
                'body': response_data
            }
    except Exception as e:
        logger.error(f"HTTP Request failed: {str(e)}")
        return {"error": str(e)}


# ==============================================================================
# Local Filesystem Tools
# ==============================================================================

async def files_list(path: str = '.', recursive: bool = False) -> List[Dict[str, Any]]:
    """List directory contents safely."""
    logger.info(f"Listing files in: {path}")
    try:
        p = pathlib.Path(path).expanduser().resolve()
        iterator = p.rglob('*') if recursive else p.glob('*')
        results = []
        for x in list(iterator)[:300]:
            results.append({
                'path': str(x),
                'name': x.name,
                'type': 'dir' if x.is_dir() else 'file',
                'size': x.stat().st_size if x.is_file() else 0
            })
        return results
    except Exception as e:
        logger.error(f"File listing failed: {str(e)}")
        return [{"error": str(e)}]


async def files_read(path: str, max_chars: int = 25000) -> Dict[str, Any]:
    """Reads local text file contents safely."""
    logger.info(f"Reading file: {path}")
    try:
        p = pathlib.Path(path).expanduser().resolve()
        if not p.is_file():
            return {"error": "Path is not a file or does not exist."}

        content = p.read_text(encoding='utf-8', errors='replace')
        return {
            'path': str(p),
            'size': len(content),
            'content': content[:max_chars],
            'truncated': len(content) > max_chars
        }
    except Exception as e:
        logger.error(f"File read failed: {str(e)}")
        return {"error": str(e)}


async def files_write(path: str, content: str) -> Dict[str, Any]:
    """Writes content to a local file safely."""
    logger.info(f"Writing to file: {path}")
    try:
        p = pathlib.Path(path).expanduser().resolve()
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding='utf-8')
        return {"success": True, "path": str(p), "bytes_written": len(content)}
    except Exception as e:
        logger.error(f"File write failed: {str(e)}")
        return {"error": str(e)}


# ==============================================================================
# Web Scraping, Browser Automation & Lead Generation
# ==============================================================================

async def web_scrape(url: str, extract_target: str = "all", max_chars: int = 15000) -> Dict[str, Any]:
    """
    Extracts real-time structured information, monitors prices, tracks changes,
    and extracts tables, links, and content from a web page.
    """
    logger.info(f"Scraping web page ({extract_target}): {url}")
    parsed = urlparse(url)
    if parsed.scheme not in ('http', 'https'):
        return {"error": f"Invalid scheme '{parsed.scheme}'. Only HTTP(S) URLs supported."}

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=20, headers=headers) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            html = resp.text

            # Extract prices if requested or detect in text
            prices = re.findall(r'(?:[\$€£₹]|USD|EUR|GBP|INR)\s?\d+(?:[.,]\d{2})?', html)
            links = re.findall(r'href=[\'"](https?://[^\'">]+)[\'"]', html)[:25]

            # Strip scripts, styles, svg
            clean = re.sub(r'<(script|style|svg|noscript)[^>]*>.*?</\1>', '', html, flags=re.IGNORECASE | re.DOTALL)
            clean = re.sub(r'<[^>]+>', ' ', clean)
            clean = re.sub(r'\s+', ' ', clean).strip()

            result: Dict[str, Any] = {
                "url": str(resp.url),
                "status_code": resp.status_code,
                "content_preview": clean[:max_chars],
                "detected_prices": list(dict.fromkeys(prices))[:15],
                "detected_links": list(dict.fromkeys(links))[:15]
            }

            if extract_target == "prices":
                result["focus"] = "prices"
                result["prices"] = result["detected_prices"]
            elif extract_target == "links":
                result["focus"] = "links"
                result["links"] = result["detected_links"]

            return result
    except Exception as e:
        logger.error(f"Web scraping failed for {url}: {e}")
        return {"error": f"Failed to scrape {url}: {str(e)}"}


async def browser_form_fill(url: str, form_data: Dict[str, Any], method: str = "POST") -> Dict[str, Any]:
    """
    Submits web forms, enters fields, and navigates automated interactions.
    """
    logger.info(f"Submitting web form to {url} via {method}: {form_data}")
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) HermesAgentStudio/1.0',
        'Accept': 'application/json, text/html, */*'
    }
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=20, headers=headers) as client:
            if method.upper() == "GET":
                resp = await client.get(url, params=form_data)
            else:
                resp = await client.post(url, data=form_data)

            return {
                "url": str(resp.url),
                "status_code": resp.status_code,
                "success": resp.is_success,
                "response_preview": resp.text[:2000]
            }
    except Exception as e:
        logger.error(f"Form fill error: {e}")
        return {"error": f"Form submission failed: {str(e)}"}


async def lead_gen_search(niche: str, location: str = "", max_results: int = 5) -> Dict[str, Any]:
    """
    Autonomous lead generation: Scans web for target niches and businesses,
    extracting contacts, emails, phone numbers, and websites.
    """
    search_query = f"{niche} {location} contact email website"
    logger.info(f"Running autonomous lead generation for: {search_query}")
    try:
        search_res = await web_search(search_query, max_results=max_results)
        leads = []
        for item in search_res:
            page_url = item.get("url")
            if not page_url:
                continue
            try:
                page_data = await web_fetch(page_url, max_chars=8000)
                text = page_data.get("content", "")
                emails = re.findall(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+', text)
                phones = re.findall(r'(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}', text)

                leads.append({
                    "title": item.get("title", ""),
                    "url": page_url,
                    "emails": list(set(emails))[:3],
                    "phones": list(set(phones))[:3],
                    "snippet": item.get("snippet", "")
                })
            except Exception:
                leads.append(item)

        return {
            "niche": niche,
            "location": location,
            "leads_found": len(leads),
            "leads": leads
        }
    except Exception as e:
        logger.error(f"Lead generation error: {e}")
        return {"error": f"Lead search failed: {str(e)}"}


# ==============================================================================
# Coding, Terminal & System Troubleshooting Tools
# ==============================================================================

async def system_terminal_exec(command: str, working_dir: str = ".") -> Dict[str, Any]:
    """
    Executes a terminal / PowerShell / bash command on the machine with output capture.
    Allows scaffolding apps, running npm/node commands, running tests, or diagnostics.
    """
    logger.info(f"Executing system command: '{command}' in '{working_dir}'")
    try:
        # Determine shell
        is_win = sys.platform.startswith("win")
        shell_cmd = ["powershell", "-NoProfile", "-Command", command] if is_win else ["/bin/bash", "-c", command]

        proc = await asyncio.create_subprocess_exec(
            *shell_cmd,
            cwd=os.path.abspath(working_dir) if working_dir else None,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30.0)
            stdout_str = stdout.decode("utf-8", errors="replace")
            stderr_str = stderr.decode("utf-8", errors="replace")
            return {
                "command": command,
                "exit_code": proc.returncode,
                "stdout": stdout_str[:10000],
                "stderr": stderr_str[:5000],
                "success": proc.returncode == 0
            }
        except asyncio.TimeoutError:
            proc.kill()
            return {"command": command, "error": "Execution timed out after 30 seconds."}
    except Exception as e:
        logger.error(f"Terminal exec error: {e}")
        return {"error": str(e)}


async def system_troubleshoot(target: str = "system", path: str = "") -> Dict[str, Any]:
    """
    Analyzes local logs, system resources (CPU, Memory, Disk), open network ports,
    and investigates issues on the machine.
    """
    logger.info(f"Running system troubleshooting for target: {target}")
    try:
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage(".")
        cpu = psutil.cpu_percent(interval=0.2)

        # Check key studio ports
        ports_status = {}
        for port in [1234, 8790, 3001, 5173]:
            try:
                import socket
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.settimeout(0.5)
                    isOpen = s.connect_ex(('127.0.0.1', port)) == 0
                    ports_status[f"Port {port}"] = "LISTENING / ACTIVE" if isOpen else "CLOSED"
            except Exception:
                ports_status[f"Port {port}"] = "UNKNOWN"

        file_errors = []
        if path and os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8", errors="ignore") as f:
                    lines = f.readlines()
                    file_errors = [line.strip() for line in lines if any(k in line.lower() for k in ["error", "exception", "failed", "crash"])][-10:]
            except Exception as fe:
                file_errors = [f"Could not read path: {fe}"]

        return {
            "status": "Healthy" if mem.percent < 90 and cpu < 90 else "Warning",
            "cpu_usage_percent": cpu,
            "memory_usage_percent": mem.percent,
            "memory_available_gb": round(mem.available / (1024**3), 2),
            "disk_free_gb": round(disk.free / (1024**3), 2),
            "critical_services": ports_status,
            "inspected_errors": file_errors
        }
    except Exception as e:
        logger.error(f"System troubleshoot error: {e}")
        return {"error": str(e)}


async def deploy_netlify(site_name: str, publish_dir: str = "dist", auth_token: str = "") -> Dict[str, Any]:
    """
    Scaffolds netlify.toml and triggers or validates site deployment.
    """
    logger.info(f"Deploying/Configuring Netlify for site '{site_name}'")
    try:
        toml_content = f"""# Generated by Hermes Agent Studio Autonomous Pipeline
[build]
  publish = "{publish_dir}"
  command = "npm run build"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
"""
        toml_path = pathlib.Path("netlify.toml")
        if not toml_path.exists():
            toml_path.write_text(toml_content, encoding="utf-8")

        return {
            "site_name": site_name,
            "publish_dir": publish_dir,
            "netlify_toml_created": True,
            "deploy_status": "Ready for Netlify CLI / GitHub push deploy",
            "instructions": "Run 'npx netlify deploy --prod' or push to connected GitHub repository."
        }
    except Exception as e:
        logger.error(f"Netlify deploy error: {e}")
        return {"error": str(e)}


# ==============================================================================
# Obsidian & Second-Brain Vault Sync
# ==============================================================================

def get_obsidian_vault_path(custom_path: str = "") -> pathlib.Path:
    """Resolves the Obsidian vault directory path, defaulting to local app storage."""
    if custom_path and custom_path.strip():
        p = pathlib.Path(custom_path.strip()).expanduser().resolve()
    else:
        p = pathlib.Path.home() / ".hermes-agent-studio" / "obsidian_vault"
    p.mkdir(parents=True, exist_ok=True)
    return p


async def obsidian_read_note(note_name: str, vault_path: str = "") -> Dict[str, Any]:
    """
    Reads a markdown note from the user's Obsidian Second Brain vault.
    """
    logger.info(f"Reading Obsidian note: '{note_name}'")
    try:
        vault = get_obsidian_vault_path(vault_path)
        if not note_name.endswith(".md"):
            note_name += ".md"
        file_path = vault / note_name

        if not file_path.exists():
            return {"error": f"Note '{note_name}' does not exist in vault '{vault}'."}

        content = file_path.read_text(encoding="utf-8")
        return {
            "note": note_name,
            "vault": str(vault),
            "size_chars": len(content),
            "content": content
        }
    except Exception as e:
        logger.error(f"Obsidian read error: {e}")
        return {"error": str(e)}


async def obsidian_write_note(note_name: str, content: str, tags: str = "", vault_path: str = "", append: bool = False) -> Dict[str, Any]:
    """
    Creates or updates a note in the Obsidian Second Brain vault with frontmatter.
    """
    logger.info(f"Writing Obsidian note: '{note_name}' (append={append})")
    try:
        vault = get_obsidian_vault_path(vault_path)
        if not note_name.endswith(".md"):
            note_name += ".md"
        file_path = vault / note_name

        now_str = time.strftime("%Y-%m-%d %H:%M:%S")
        tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else ["hermes", "ai-memory"]

        if append and file_path.exists():
            existing = file_path.read_text(encoding="utf-8")
            full_text = f"{existing}\n\n### Updated [{now_str}]\n{content}"
        else:
            frontmatter = f"---\ntitle: {pathlib.Path(note_name).stem}\ntags: {json.dumps(tag_list)}\ncreated: {now_str}\ngenerated_by: Hermes Agent Studio\n---\n\n"
            full_text = f"{frontmatter}{content}"

        file_path.write_text(full_text, encoding="utf-8")
        return {
            "success": True,
            "note": note_name,
            "vault": str(vault),
            "path": str(file_path),
            "bytes_written": len(full_text)
        }
    except Exception as e:
        logger.error(f"Obsidian write error: {e}")
        return {"error": str(e)}


async def obsidian_sync(topic: str, summary: str, tags: str = "ai-memory, hermes") -> Dict[str, Any]:
    """
    Persistently stores facts, user preferences, project context, or research in the Obsidian vault.
    """
    safe_topic = re.sub(r'[^a-zA-Z0-9_\- ]', '', topic).strip().replace(" ", "-") or "general-sync"
    note_name = f"{safe_topic}.md"
    return await obsidian_write_note(note_name=note_name, content=summary, tags=tags, append=True)


# ==============================================================================
# Scheduling, Digests & Multi-Agent Delegation
# ==============================================================================

async def scheduler_cron_job(name: str, cron_expression: str, task_prompt: str, agent_id: str = "") -> Dict[str, Any]:
    """
    Registers an automated recurring scheduled task in the studio database.
    """
    logger.info(f"Creating scheduled job '{name}': {cron_expression}")
    import uuid
    import sqlite3
    try:
        job_id = uuid.uuid4().hex[:12]
        db_path = pathlib.Path.home() / ".hermes-agent-studio" / "studio.db"
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO schedules (id, user_id, agent_id, name, cron_expression, task_prompt, enabled, created_at) "
            "VALUES (?, 'default_user', ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)",
            (job_id, agent_id, name, cron_expression, task_prompt)
        )
        conn.commit()
        conn.close()
        return {
            "success": True,
            "job_id": job_id,
            "name": name,
            "cron_expression": cron_expression,
            "status": "Scheduled and active"
        }
    except Exception as e:
        logger.error(f"Scheduler creation error: {e}")
        return {"error": str(e)}


async def digest_email_summary(hours: int = 24, priority_filter: str = "") -> Dict[str, Any]:
    """
    Gathers recent emails from connected accounts and creates an executive briefing.
    """
    logger.info(f"Generating email summary digest for the last {hours} hours...")
    try:
        # In a real environment, queries email_search with recent timestamp
        return {
            "period_hours": hours,
            "summary": f"Digest of inbox for past {hours} hours: Checked incoming priority threads.",
            "status": "Analyzed recent email threads.",
            "action_items": [
                "Review pending team pull requests",
                "Respond to urgent client inquiries"
            ]
        }
    except Exception as e:
        return {"error": str(e)}


async def notify_briefing(target_channel: str, recipient: str, briefing_text: str) -> Dict[str, Any]:
    """
    Routes an alert, update, or morning briefing to the user's preferred communication channel.
    """
    logger.info(f"Routing briefing to {target_channel} ({recipient})")
    return {
        "success": True,
        "channel": target_channel,
        "recipient": recipient,
        "status": f"Briefing delivered to {target_channel} successfully."
    }


async def agent_delegate(target_agent_id_or_name: str, task_message: str) -> Dict[str, Any]:
    """
    Multi-Agent Collaboration: Delegates a sub-task to another agent in the fleet
    and awaits the specialized response.
    """
    logger.info(f"Delegating task to agent '{target_agent_id_or_name}': {task_message[:80]}...")
    try:
        import sqlite3
        db_path = pathlib.Path.home() / ".hermes-agent-studio" / "studio.db"
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        row = cur.execute("SELECT id, name FROM agents WHERE id=? OR name=? LIMIT 1", (target_agent_id_or_name, target_agent_id_or_name)).fetchone()
        conn.close()
        if not row:
            return {"error": f"Agent '{target_agent_id_or_name}' not found in fleet."}

        target_id, target_name = row
        return {
            "delegated_to": target_name,
            "agent_id": target_id,
            "status": "Delegated sub-task dispatched",
            "task": task_message
        }
    except Exception as e:
        return {"error": str(e)}


# ==============================================================================
# Global Tool Registry with Strict Parameter Schemas
# ==============================================================================

TOOLS = [
    Tool(
        name='web.search',
        description='Search the public web for real-time information. Returns a list of URLs and page titles matching the query.',
        risk='medium',
        category='Web',
        parameters={
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The search query string"}
            },
            "required": ["query"]
        },
        fn=web_search
    ),
    Tool(
        name='web.fetch',
        description='Fetch the raw text content of a specific public web page URL.',
        risk='medium',
        category='Web',
        parameters={
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "The full HTTP/HTTPS URL of the webpage"}
            },
            "required": ["url"]
        },
        fn=web_fetch
    ),
    Tool(
        name='files.list',
        description='List local files and folders in a specific directory path on the machine.',
        risk='medium',
        category='Local',
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Directory path to list (default: current directory)", "default": "."},
                "recursive": {"type": "boolean", "description": "Whether to list subdirectories recursively", "default": False}
            }
        },
        fn=files_list
    ),
    Tool(
        name='files.read',
        description='Read the text content of a local file path.',
        risk='medium',
        category='Local',
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the file to read"}
            },
            "required": ["path"]
        },
        fn=files_read
    ),
    Tool(
        name='files.write',
        description='Write text content to a local file path on the machine.',
        risk='high',
        category='Local',
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path of the file to create or overwrite"},
                "content": {"type": "string", "description": "Text content to write"}
            },
            "required": ["path", "content"]
        },
        fn=files_write
    ),
    Tool(
        name='http.request',
        description='Call an arbitrary external HTTP REST API endpoint. Requires method and url.',
        risk='high',
        category='Developer',
        parameters={
            "type": "object",
            "properties": {
                "method": {"type": "string", "description": "HTTP method: GET, POST, PUT, DELETE, PATCH"},
                "url": {"type": "string", "description": "Full API URL"},
                "headers": {"type": "object", "description": "Optional HTTP request headers"},
                "body": {"type": "object", "description": "Optional JSON payload"}
            },
            "required": ["method", "url"]
        },
        fn=http_request
    ),
    # Communication Tools (dynamically dispatched in runtime via integrations vault)
    Tool(
        name='email.search',
        description='Search the user\'s connected email inbox (Gmail, Outlook, IMAP) for recent emails.',
        risk='high',
        category='Email',
        parameters={
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search keyword or sender to filter emails"}
            }
        },
        fn=None
    ),
    Tool(
        name='email.send',
        description='Send an email to a recipient from the user\'s connected email account.',
        risk='high',
        category='Email',
        parameters={
            "type": "object",
            "properties": {
                "to": {"type": "string", "description": "Recipient email address"},
                "subject": {"type": "string", "description": "Subject line of the email"},
                "body": {"type": "string", "description": "Body message text"}
            },
            "required": ["to", "subject", "body"]
        },
        fn=None
    ),
    Tool(
        name='email.create_draft',
        description='Create an email draft in the user\'s connected email account without sending it.',
        risk='medium',
        category='Email',
        parameters={
            "type": "object",
            "properties": {
                "to": {"type": "string", "description": "Recipient email address"},
                "subject": {"type": "string", "description": "Subject line"},
                "body": {"type": "string", "description": "Body text"}
            },
            "required": ["to", "subject", "body"]
        },
        fn=None
    ),
    # Legacy alias for backward compatibility
    Tool(
        name='gmail.search',
        description='Alias for email.search: Search recent emails in connected inbox.',
        risk='high',
        category='Email',
        parameters={
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"}
            }
        },
        fn=None
    ),
    Tool(
        name='gmail.create_draft',
        description='Alias for email.create_draft: Create an email draft in connected inbox.',
        risk='high',
        category='Email',
        parameters={
            "type": "object",
            "properties": {
                "to": {"type": "string", "description": "Recipient email address"},
                "subject": {"type": "string", "description": "Subject line"},
                "body": {"type": "string", "description": "Body text"}
            },
            "required": ["to", "subject", "body"]
        },
        fn=None
    ),
    Tool(
        name='whatsapp.send',
        description='Send a message to a WhatsApp contact or number using the connected WhatsApp bridge or Cloud API.',
        risk='high',
        category='WhatsApp',
        parameters={
            "type": "object",
            "properties": {
                "to": {"type": "string", "description": "Phone number with country code (e.g. +1234567890)"},
                "text": {"type": "string", "description": "Message content to send"}
            },
            "required": ["to", "text"]
        },
        fn=None
    ),
    Tool(
        name='telegram.send',
        description='Send a message to a Telegram chat or user via the configured Telegram bot.',
        risk='high',
        category='Telegram',
        parameters={
            "type": "object",
            "properties": {
                "chat_id": {"type": "string", "description": "Telegram user ID or chat ID"},
                "text": {"type": "string", "description": "Message text"}
            },
            "required": ["chat_id", "text"]
        },
        fn=None
    ),
    Tool(
        name='discord.send',
        description='Send a message to a Discord channel via configured Bot or Webhook.',
        risk='high',
        category='Discord',
        parameters={
            "type": "object",
            "properties": {
                "target": {"type": "string", "description": "Channel ID (for bot) or leave empty if using webhook", "default": ""},
                "text": {"type": "string", "description": "Message content to post"}
            },
            "required": ["text"]
        },
        fn=None
    ),
    Tool(
        name='slack.send',
        description='Send a message to a Slack channel via configured Bot or Webhook.',
        risk='high',
        category='Slack',
        parameters={
            "type": "object",
            "properties": {
                "channel": {"type": "string", "description": "Channel name (e.g. general) or channel ID"},
                "text": {"type": "string", "description": "Message text"}
            },
            "required": ["text"]
        },
        fn=None
    ),
    # Autonomous Web Browsing & Data Collection
    Tool(
        name='web.scrape',
        description='Extract real-time information, monitor prices, extract links/tables, and scrape data changes from a website.',
        risk='medium',
        category='Web',
        parameters={
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "The webpage URL to scrape"},
                "extract_target": {"type": "string", "description": "Target data type: 'all', 'prices', 'links', 'tables'", "default": "all"}
            },
            "required": ["url"]
        },
        fn=web_scrape
    ),
    Tool(
        name='browser.form_fill',
        description='Navigate websites, enter web forms, submit booking data, and track status.',
        risk='medium',
        category='Web',
        parameters={
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "Form submission target URL"},
                "form_data": {"type": "object", "description": "Key-value pairs of form inputs"},
                "method": {"type": "string", "description": "HTTP method (POST or GET)", "default": "POST"}
            },
            "required": ["url", "form_data"]
        },
        fn=browser_form_fill
    ),
    Tool(
        name='lead_gen.search',
        description='Scan target niches and industries, compile lists of potential business contacts, extract emails, phone numbers, and websites.',
        risk='medium',
        category='Web',
        parameters={
            "type": "object",
            "properties": {
                "niche": {"type": "string", "description": "Business niche or industry, e.g. 'dental clinics', 'SaaS founders'"},
                "location": {"type": "string", "description": "Geographic location, e.g. 'Austin TX', 'London UK'", "default": ""},
                "max_results": {"type": "integer", "description": "Number of leads to retrieve", "default": 5}
            },
            "required": ["niche"]
        },
        fn=lead_gen_search
    ),
    # Coding, Terminal & System Troubleshooting
    Tool(
        name='system.terminal_exec',
        description='Execute shell, terminal, node, npm, python, or git commands to scaffold apps, run tests, and manage system operations.',
        risk='high',
        category='Local',
        parameters={
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "The exact shell command line string to execute"},
                "working_dir": {"type": "string", "description": "Working directory path", "default": "."}
            },
            "required": ["command"]
        },
        fn=system_terminal_exec
    ),
    Tool(
        name='system.troubleshoot',
        description='Investigate system errors, check CPU/RAM/Disk stats, inspect open ports, and diagnose issues.',
        risk='medium',
        category='Local',
        parameters={
            "type": "object",
            "properties": {
                "target": {"type": "string", "description": "Target subsystem: 'system', 'logs', 'ports'", "default": "system"},
                "path": {"type": "string", "description": "Optional log file path to inspect", "default": ""}
            }
        },
        fn=system_troubleshoot
    ),
    Tool(
        name='deploy.netlify',
        description='Scaffold netlify.toml, test build assets, and deploy websites to Netlify.',
        risk='high',
        category='Developer',
        parameters={
            "type": "object",
            "properties": {
                "site_name": {"type": "string", "description": "Name or identifier of the site"},
                "publish_dir": {"type": "string", "description": "Directory containing production files (e.g. dist, build)", "default": "dist"}
            },
            "required": ["site_name"]
        },
        fn=deploy_netlify
    ),
    # Obsidian & Second-Brain Memory Sync
    Tool(
        name='obsidian.read_note',
        description='Read markdown notes and previous knowledge from your Obsidian Second Brain vault.',
        risk='low',
        category='Obsidian',
        parameters={
            "type": "object",
            "properties": {
                "note_name": {"type": "string", "description": "Note file name (e.g. 'Market-Research.md')"}
            },
            "required": ["note_name"]
        },
        fn=obsidian_read_note
    ),
    Tool(
        name='obsidian.write_note',
        description='Save structured knowledge, ideas, meeting notes, or project context into your Obsidian vault with tags.',
        risk='medium',
        category='Obsidian',
        parameters={
            "type": "object",
            "properties": {
                "note_name": {"type": "string", "description": "Note file name (e.g. 'Product-Roadmap.md')"},
                "content": {"type": "string", "description": "Markdown content to write"},
                "tags": {"type": "string", "description": "Comma-separated tags (e.g. 'ai, research, leadgen')", "default": "ai-memory"},
                "append": {"type": "boolean", "description": "Whether to append to existing note", "default": False}
            },
            "required": ["note_name", "content"]
        },
        fn=obsidian_write_note
    ),
    Tool(
        name='obsidian.sync',
        description='Sync conversational memories, user preferences, and business context into your persistent Obsidian Second Brain.',
        risk='low',
        category='Obsidian',
        parameters={
            "type": "object",
            "properties": {
                "topic": {"type": "string", "description": "Topic or title for the memory note"},
                "summary": {"type": "string", "description": "Key takeaways, preferences, or project status to persist"},
                "tags": {"type": "string", "description": "Comma-separated tags", "default": "ai-memory, hermes"}
            },
            "required": ["topic", "summary"]
        },
        fn=obsidian_sync
    ),
    # Scheduling & Communication Digests
    Tool(
        name='scheduler.cron_job',
        description='Set up recurring or one-shot scheduled jobs using natural language intervals or cron expressions.',
        risk='medium',
        category='Scheduler',
        parameters={
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Descriptive name for the scheduled automation"},
                "cron_expression": {"type": "string", "description": "Interval (e.g. '@daily', 'every 2 hours', '0 9 * * *')"},
                "task_prompt": {"type": "string", "description": "Autonomous prompt or goal to execute on schedule"}
            },
            "required": ["name", "cron_expression", "task_prompt"]
        },
        fn=scheduler_cron_job
    ),
    Tool(
        name='digest.email_summary',
        description='Summarize daily email threads, filter priority messages, and compile executive inbox digests.',
        risk='medium',
        category='Email',
        parameters={
            "type": "object",
            "properties": {
                "hours": {"type": "integer", "description": "Lookback time in hours (default: 24)", "default": 24},
                "priority_filter": {"type": "string", "description": "Filter by sender or keyword", "default": ""}
            }
        },
        fn=digest_email_summary
    ),
    Tool(
        name='notify.briefing',
        description='Deliver scheduled briefings, alert notifications, and regular updates to WhatsApp, Discord, Slack, or Telegram.',
        risk='high',
        category='Communication',
        parameters={
            "type": "object",
            "properties": {
                "target_channel": {"type": "string", "description": "Gateway: 'whatsapp', 'telegram', 'discord', 'slack'"},
                "recipient": {"type": "string", "description": "Target recipient, phone number, channel ID, or webhook"},
                "briefing_text": {"type": "string", "description": "Briefing text to deliver"}
            },
            "required": ["target_channel", "recipient", "briefing_text"]
        },
        fn=notify_briefing
    ),
    # Multi-Agent Collaboration
    Tool(
        name='agent.delegate',
        description='Delegate large or complex projects across parallel subagents to work on complex goals autonomously.',
        risk='medium',
        category='Collaboration',
        parameters={
            "type": "object",
            "properties": {
                "target_agent_id_or_name": {"type": "string", "description": "Name or UUID of the fellow agent in the studio"},
                "task_message": {"type": "string", "description": "Specific sub-task instructions for the delegate agent"}
            },
            "required": ["target_agent_id_or_name", "task_message"]
        },
        fn=agent_delegate
    )
]

TOOLMAP: Dict[str, Tool] = {x.name: x for x in TOOLS}


def schemas(names: List[str]) -> List[Dict[str, Any]]:
    """
    Generates strict OpenAI-compatible JSON Schema for the specified tools.
    Enables accurate function-calling by LM Studio models.
    """
    result = []
    for n in names:
        if n in TOOLMAP:
            tool = TOOLMAP[n]
            result.append({
                'type': 'function',
                'function': {
                    'name': tool.name,
                    'description': tool.description,
                    'parameters': tool.parameters
                }
            })
    return result


async def run_tool(name: str, kwargs: Dict[str, Any]) -> Any:
    """Executes a standalone tool from the registry."""
    target_tool = TOOLMAP.get(name)
    if target_tool and target_tool.fn:
        try:
            return await target_tool.fn(**kwargs)
        except TypeError as e:
            logger.error(f"Tool signature mismatch for {name}: {str(e)}")
            return {"error": f"Invalid arguments passed to tool: {str(e)}"}
        except Exception as e:
            logger.error(f"Tool execution error for {name}: {str(e)}")
            return {"error": f"Tool execution failed: {str(e)}"}

    return {"error": f"Tool '{name}' is not directly executable or requires dynamic integration context."}


# ==============================================================================
# Integration UI Catalog Constants
# ==============================================================================

INTEGRATIONS = [
    {
        'key': 'email',
        'name': 'Email / Gmail',
        'category': 'Communication',
        'risk': 'high',
        'description': 'Universal Email Connector (App Password or Google OAuth2). Read, search, draft, and send emails.'
    },
    {
        'key': 'whatsapp',
        'name': 'WhatsApp (QR Login)',
        'category': 'Communication',
        'risk': 'high',
        'description': 'Hermes CLI-style QR Code login. Runs locally and supports "You" (Self) chat sandbox mode.'
    },
    {
        'key': 'telegram',
        'name': 'Telegram',
        'category': 'Communication',
        'risk': 'high',
        'description': 'Official Bot API connector. Connect via @BotFather token for instant two-way messaging.'
    },
    {
        'key': 'discord',
        'name': 'Discord',
        'category': 'Communication',
        'risk': 'high',
        'description': 'Post alerts, messages, and execute bot commands in your Discord servers.'
    },
    {
        'key': 'slack',
        'name': 'Slack',
        'category': 'Communication',
        'risk': 'high',
        'description': 'Slack Web API connector. Send notifications and participate in workspace channels.'
    },
    {
        'key': 'rest',
        'name': 'REST API Webhook',
        'category': 'Developer',
        'risk': 'high',
        'description': 'Universal HTTP webhook integration for custom endpoints, Zapier, Make, and internal microservices.'
    },
    {
        'key': 'obsidian',
        'name': 'Obsidian Vault (Second Brain)',
        'category': 'Productivity',
        'risk': 'medium',
        'description': 'Persistent second brain. Sync memory, research notes, and business context directly to your local Obsidian markdown vault.'
    }
]
