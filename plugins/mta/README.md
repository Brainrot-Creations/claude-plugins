# MTA BusTime API MCP

Calls **`GET https://mcp.mta.shubhthorat.com/api/mta/*`** by default — **no env or API key required**.

## Tools

- `mta_arrivals` — real-time bus arrivals at any MTA stop with distance and ETA. Pass a stop id (e.g. 400001) and optionally a route filter (e.g. M15).
- `mta_vehicles` — all active buses on a route right now with GPS location, bearing, and next stop.
- `mta_route_stops` — all stops on a route in order with stop ids, names, and coordinates. Use this to discover stop ids.

## Environment (optional)

| Variable | When to set |
|----------|-------------|
| `MTA_API_URL` | Different base URL if self-hosting |
| `API_SERVER_URL` | Shared override for all API plugins |

## Setup

`/reload-plugins` after install. Rebuild after editing `server/index.js`:

```bash
cd server && npm install && npm run build
```
