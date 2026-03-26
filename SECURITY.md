# Security

## What this project does

- **Socials Claude Code plugin** (npm: `claude-plugins`) runs on your computer and listens on **`127.0.0.1:9847`** for a single WebSocket client (the Socials browser extension).
- It does **not** ship API keys for your backend; the extension uses its own session with Socials services.

## Local trust model

- The WebSocket server is bound to **localhost only**. Anything on your machine that can open `ws://127.0.0.1:9847` could in principle connect; in normal use that is only the Socials extension.
- **Do not** expose port `9847` to the public internet (e.g. port forwarding). This MCP is intended for **local development / personal use** only.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `SOCIALS_MCP_RECLAIM_PORT=1` | Optional. On startup, may send SIGTERM to processes listening on port 9847 (helps recover from a stale Socials MCP server). Use with care on shared machines. |
| `SOCIALS_MCP_DEBUG=1` | Optional. If set, `socials_get_page_content` may include a `debug` field from the extension. Omit in normal use to avoid leaking verbose extension diagnostics into Claude. |

## Reporting issues

If you find a security issue in this repository, please email [contact@brainrotcreations.com](mailto:contact@brainrotcreations.com) rather than filing a public issue with exploit details.
