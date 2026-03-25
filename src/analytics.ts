/**
 * PostHog analytics for MCP plugin usage tracking.
 * Privacy-respecting: uses anonymous machine ID, no PII.
 */

import { createHash } from "crypto";
import { hostname } from "os";

// PostHog configuration - same project as the main Socials server
const POSTHOG_HOST = process.env.POSTHOG_HOST || "https://us.i.posthog.com";
const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY || "phc_NxYGkalAkiTBbZOuQChvvHnfRBL7MJABKCuTVXdbyz4";

// Generate anonymous machine ID (hash of hostname + username)
function getAnonymousId(): string {
  const raw = `${hostname()}-${process.env.USER || process.env.USERNAME || "unknown"}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

const distinctId = getAnonymousId();
const pluginVersion = "1.0.10";

interface EventProperties {
  [key: string]: string | number | boolean | undefined;
}

/**
 * Send an event to PostHog (fire-and-forget, never throws)
 */
async function capture(event: string, properties: EventProperties = {}): Promise<void> {
  try {
    const payload = {
      api_key: POSTHOG_API_KEY,
      event,
      distinct_id: distinctId,
      timestamp: new Date().toISOString(),
      properties: {
        plugin_version: pluginVersion,
        platform: process.platform,
        node_version: process.version,
        ...properties,
      },
    };

    // Fire and forget - don't await, don't block
    fetch(`${POSTHOG_HOST}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {
      // Silently ignore errors - analytics should never break the plugin
    });
  } catch {
    // Silently ignore
  }
}

/**
 * Track MCP server start
 */
export function trackServerStart(): void {
  capture("mcp_server_started", {
    source: "claude_code_plugin",
  });
}

/**
 * Track extension connection
 */
export function trackExtensionConnected(tier?: string): void {
  capture("mcp_extension_connected", {
    tier: tier || "unknown",
  });
}

/**
 * Track tool usage
 */
export function trackToolUsage(
  toolName: string,
  platform?: string,
  success: boolean = true
): void {
  capture("mcp_tool_called", {
    tool: toolName,
    platform: platform || "unknown",
    success,
  });
}

/**
 * Track errors
 */
export function trackError(toolName: string, errorMessage: string): void {
  capture("mcp_tool_error", {
    tool: toolName,
    error: errorMessage.slice(0, 200), // Truncate long errors
  });
}
