import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const DEFAULT_BASE = "https://mcp.partiful.shubhthorat.com";

function baseUrl() {
  const env = (process.env.PARTIFUL_API_URL || process.env.API_SERVER_URL || "").trim();
  if (env) return env.replace(/\/$/, "");
  return DEFAULT_BASE;
}

async function partifulGet(pathname, query) {
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
    const err = new Error(`Partiful API ${resp.status}: ${text.slice(0, 500)}`);
    err.status = resp.status;
    err.body = data;
    throw err;
  }
  return data;
}

function asText(payload) {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

const server = new McpServer({ name: "partiful-api", version: "1.0.0" });

server.tool(
  "partiful_events_feed",
  "Fetch paginated events for a city region via Partiful's API. Supports tag filtering (MUSIC, ARTS, FITNESS, FOOD, COMMUNITY) and cursor pagination.",
  {
    region: z.enum(["nyc", "la", "sf", "bos", "dc", "chi", "lon", "mia", "atx"]),
    tag: z.string().optional(),
    limit: z.number().int().positive().max(100).optional(),
    cursor: z.string().optional(),
    timeout: z.number().int().positive().max(120).optional(),
  },
  async ({ region, tag, limit, cursor, timeout }) => {
    try {
      const q = { region };
      if (tag) q.tag = tag;
      if (limit) q.limit = limit;
      if (cursor) q.cursor = cursor;
      if (timeout) q.timeout = timeout;
      const data = await partifulGet("/api/partiful/events/feed", q);
      return asText(data);
    } catch (e) {
      return asText({ ok: false, error: String(e) });
    }
  },
);

server.tool(
  "partiful_explore",
  "Fetch the Partiful explore feed for a city region: curated events, sections, tags, and event counts across all regions.",
  {
    region: z.enum(["nyc", "la", "sf", "bos", "dc", "chi", "lon", "mia", "atx"]),
    timeout: z.number().int().positive().max(120).optional(),
  },
  async ({ region, timeout }) => {
    try {
      const data = await partifulGet(`/api/partiful/explore/${encodeURIComponent(region)}`, timeout ? { timeout } : {});
      return asText(data);
    } catch (e) {
      return asText({ ok: false, error: String(e) });
    }
  },
);

server.tool(
  "partiful_event",
  "Fetch full detail for a Partiful event by its id (from partiful.com/e/{id}).",
  {
    id: z.string().min(1),
    timeout: z.number().int().positive().max(120).optional(),
  },
  async ({ id, timeout }) => {
    try {
      const data = await partifulGet("/api/partiful/event", { id, ...(timeout ? { timeout } : {}) });
      return asText(data);
    } catch (e) {
      return asText({ ok: false, error: String(e) });
    }
  },
);

server.tool(
  "partiful_user",
  "Fetch a Partiful user's public profile by their id (from partiful.com/u/{id}).",
  {
    id: z.string().min(1),
    timeout: z.number().int().positive().max(120).optional(),
  },
  async ({ id, timeout }) => {
    try {
      const data = await partifulGet("/api/partiful/user", { id, ...(timeout ? { timeout } : {}) });
      return asText(data);
    } catch (e) {
      return asText({ ok: false, error: String(e) });
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
