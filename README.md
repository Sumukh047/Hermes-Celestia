# Hermes Agent Studio

**Hermes CLI → GUI.** A modern desktop-first visual AI agent workbench using **LM Studio as the local inference layer**.

## Included

- LM Studio auto-detection and `/v1/models` model selection.
- Native LM Studio load controls for context length, GPU offload, Flash Attention and KV-cache GPU offload where supported.
- Multiple agent instances sharing the same selected LLM, each with unique ID, system prompt, tone, autonomy, tools and workflow.
- Streaming agent/control-bot responses.
- Built-in Control Bot with deterministic start/stop control by agent ID and live agent inventory in its local-model prompt.
- Visual workflow editor with natural-language → workflow generation.
- Tool selection with web search/fetch, filesystem and HTTP tools.
- Integration selection screen for Gmail, WhatsApp Cloud API, Telegram, Slack, Discord, Calendar, Drive, Notion, DB, REST, webhooks, Files.
- Hermes CLI adapter + CLI status/command boundary; native runtime remains usable even when Hermes is not installed.
- Agent simulation, human-approval boundary, run history, WebSocket execution events and X-Ray-ready data model.
- Local SQLite persistence and encrypted local secret key.
- Tauri 2 shell for a Windows installer.

## Run

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1
```

Start the LM Studio local server. The default endpoint is `http://127.0.0.1:1234`.

## Project map

- `backend/` FastAPI orchestration, runtime, LM Studio adapter, tools and persistence.
- `frontend/` React + TypeScript UI.
- `desktop/src-tauri/` Tauri desktop shell.
- `templates/` portable agent templates.
- `scripts/` Windows setup/dev/build helpers.

The implementation follows the supplied project brief's visual, local-first, explainable architecture: Agent Builder, Integrations, AI Engine, Runs, Playground, Control Bot, approvals, and audit-oriented execution events. fileciteturn0file0L2125-L2165
