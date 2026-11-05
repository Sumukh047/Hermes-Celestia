# Architecture

```text
Tauri 2 shell
  └─ React + TypeScript + React Flow
       └─ FastAPI + WebSocket
            ├─ Agent runtime
            ├─ Permission boundary
            ├─ Tool registry
            ├─ SQLite state
            ├─ Hermes adapter
            └─ LM Studio adapter
                 └─ local OpenAI-compatible API
```

Multiple agents are independent records and tasks. They can point at the same LM Studio model identifier, so separate prompts/tones do not require separate LLM downloads.
