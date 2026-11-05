# Security

- Local SQLite by default.
- Fernet key generated locally under `~/.hermes-agent-studio/`.
- Secrets are never put into `.agent.json` templates.
- Tool allowlists are per agent.
- High-risk tool calls can be held for approval.
- Network-capable tools are explicit and can be removed from an agent.
- User-facing errors are kept human-readable; raw traces stay server-side.
