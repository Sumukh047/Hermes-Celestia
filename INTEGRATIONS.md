# Integrations

The UI deliberately separates **connector setup** from **per-agent tool permissions**.

- **Gmail:** configuration boundary for Google OAuth credentials. The UI accepts client JSON so a full OAuth flow can be added without changing the agent model.
- **WhatsApp:** official WhatsApp Business Cloud API configuration (access token + phone number ID). No unofficial automation is used.
- **Telegram / Slack / Discord:** configuration-ready connector slots.
- **REST/Webhook:** generic API integration path.
- **Web:** built-in `web.search` and `web.fetch` tools, opt-in per agent.
- **Files:** built-in local filesystem tools, opt-in per agent.
