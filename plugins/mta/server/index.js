import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const DEFAULT_BASE = "https://mcp.mta.shubhthorat.com";

function baseUrl() {
  const env = (process.env.MTA_API_URL || process.env.API_SERVER_URL || "").trim();
  if (env) return env.replace(/\/$/, "");
  return DEFAULT_BASE;
}

async function mtaGet(pathname, query) {
  const u = new URL(pathname, baseUrl() + "/");
  for (const [k, v] of Object.entries(query || {})) {
    if (v === undefined || v === null || v === "") continue;
    u.searchParams.set(k, String(v));
  }
  const resp = await fetch(u, { method: "GET", headers: { Accept: "application/json" } });
  const text = await resp.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = { _raw: text }; }
  if (!resp.ok) {
    const err = new Error(`MTA API ${resp.status}: ${text.slice(0, 500)}`);
    err.status = resp.status;
    err.body = data;
    throw err;
  }
  return data;
}

function asText(payload) {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

const server = new McpServer({ name: "mta-api", version: "1.0.0" });

server.tool(
  "mta_arrivals",
  "Real-time bus arrivals at an MTA stop. Returns upcoming buses with distance, stops away, and presentable ETA. Optionally filter by route (e.g. M15, Q32, B44).",
  {
    stop: z.string().min(1),
    line: z.string().optional(),
    limit: z.number().int().positive().max(50).optional(),
    timeout: z.number().int().positive().max(120).optional(),
  },
  async ({ stop, line, limit, timeout }) => {
    try {
      const q = { stop };
      if (line) q.line = line;
      if (limit) q.limit = limit;
      if (timeout) q.timeout = timeout;
      const data = await mtaGet("/api/mta/arrivals", q);
      return asText(data);
    } catch (e) {
      return asText({ ok: false, error: String(e) });
    }
  },
);

server.tool(
  "mta_vehicles",
  "All active buses on an MTA route right now. Returns each vehicle's GPS location, bearing, next stop, and progress status.",
  {
    line: z.string().min(1),
    timeout: z.number().int().positive().max(120).optional(),
  },
  async ({ line, timeout }) => {
    try {
      const data = await mtaGet("/api/mta/vehicles", { line, ...(timeout ? { timeout } : {}) });
      return asText(data);
    } catch (e) {
      return asText({ ok: false, error: String(e) });
    }
  },
);

server.tool(
  "mta_route_stops",
  "All stops on an MTA bus route in order, with stop ids, names, and coordinates. Use this to discover stop ids for the arrivals tool.",
  {
    line: z.string().min(1),
    timeout: z.number().int().positive().max(120).optional(),
  },
  async ({ line, timeout }) => {
    try {
      const data = await mtaGet("/api/mta/route/stops", { line, ...(timeout ? { timeout } : {}) });
      return asText(data);
    } catch (e) {
      return asText({ ok: false, error: String(e) });
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
