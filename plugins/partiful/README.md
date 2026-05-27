# Partiful API MCP

Calls **`GET https://mcp.partiful.shubhthorat.com/api/partiful/*`** by default — **no env or API key required**.

## Tools

- `partiful_explore` — curated event feed for a city region (nyc, la, sf, bos, dc, chi, lon, mia, atx).
- `partiful_event` — full event detail (title, hosts, location, guest counts) by event id.
- `partiful_user` — public user profile by user id.

## Environment (optional)

| Variable | When to set |
|----------|-------------|
| `PARTIFUL_API_URL` | Different base URL if self-hosting |
| `API_SERVER_URL` | Shared override for all API plugins |

## Setup

`/reload-plugins` after install. Rebuild after editing `server/index.js`:

```bash
cd server && npm install && npm run build
```
