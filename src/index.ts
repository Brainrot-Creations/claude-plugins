#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { ExtensionBridge } from "./extension-bridge.js";

const bridge = new ExtensionBridge();

// Tool schemas
const GetFeedPostsSchema = z.object({
  platform: z.enum(["x", "linkedin", "reddit"]).describe("Social media platform"),
  count: z.number().optional().default(10).describe("Number of posts to fetch (default: 10)"),
});

const GetPostContextSchema = z.object({
  platform: z.enum(["x", "linkedin", "reddit"]).describe("Social media platform"),
  post_url: z.string().describe("URL of the post to get context for"),
});

const GenerateReplySchema = z.object({
  platform: z.enum(["x", "linkedin", "reddit"]).describe("Social media platform"),
  post_content: z.string().describe("Content of the post to reply to"),
  post_author: z.string().describe("Author/handle of the post"),
  persona_id: z.string().optional().describe("Persona ID to use for generation"),
  mood: z.string().optional().describe("Mood/tone for the reply (e.g., witty, professional)"),
});

// Browser control schemas
const OpenTabSchema = z.object({
  url: z.string().describe("URL to open in new tab"),
});

const NavigateToSchema = z.object({
  url: z.string().describe("URL to navigate to"),
  tab_id: z.number().optional().describe("Tab ID (uses active tab if not provided)"),
});

const ReloadTabSchema = z.object({
  tab_id: z.number().optional().describe("Tab ID to reload (uses active tab if not provided)"),
});

// Create MCP server
const server = new Server(
  {
    name: "socials-claude-code-plugin",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Helper to check Pro access before operations
async function requireProAccess(): Promise<void> {
  if (!bridge.isConnected()) {
    throw new Error(
      "Socials extension not connected. Please:\n" +
      "1. Open your browser with the Socials extension installed\n" +
      "2. Enable 'Agent Mode' in the extension settings"
    );
  }

  const { isPro, tier } = await bridge.checkProAccess();
  if (!isPro) {
    throw new Error(
      `This feature requires Socials Pro. Current tier: ${tier}\n` +
      "Upgrade at https://socials.brainrotcreations.com/pricing"
    );
  }
}

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "socials_check_access",
        description:
          "Check connection status. After confirming access, use socials_open_tab to open X/LinkedIn/Reddit.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "socials_get_feed",
        description:
          "Get recent posts from a social media feed. Requires Pro access. " +
          "The extension must be open on the target platform's feed page.",
        inputSchema: {
          type: "object",
          properties: {
            platform: {
              type: "string",
              enum: ["x", "linkedin", "reddit"],
              description: "Social media platform to get posts from",
            },
            count: {
              type: "number",
              description: "Number of posts to fetch (default: 10, max: 50)",
            },
          },
          required: ["platform"],
        },
      },
      {
        name: "socials_get_post_context",
        description:
          "Get detailed context for a specific post including replies. Requires Pro access.",
        inputSchema: {
          type: "object",
          properties: {
            platform: {
              type: "string",
              enum: ["x", "linkedin", "reddit"],
              description: "Social media platform",
            },
            post_url: {
              type: "string",
              description: "Full URL of the post",
            },
          },
          required: ["platform", "post_url"],
        },
      },
      {
        name: "socials_generate_reply",
        description:
          "OPTIONAL: Generate a reply using Socials AI with the user's persona. You can also write replies yourself without this tool.",
        inputSchema: {
          type: "object",
          properties: {
            platform: {
              type: "string",
              enum: ["x", "linkedin", "reddit"],
              description: "Social media platform",
            },
            post_content: {
              type: "string",
              description: "The content of the post to reply to",
            },
            post_author: {
              type: "string",
              description: "The author/handle of the post",
            },
            persona_id: {
              type: "string",
              description: "Optional: specific persona ID to use",
            },
            mood: {
              type: "string",
              description: "Optional: mood/tone (witty, professional, casual, etc.)",
            },
          },
          required: ["platform", "post_content", "post_author"],
        },
      },
      {
        name: "socials_quick_reply",
        description:
          "Reply to a post directly from the feed WITHOUT navigating away. Clicks reply on the tweet, types the content, and posts. " +
          "You can write the reply yourself OR use socials_generate_reply first if you want to use the user's persona. " +
          "IMPORTANT: Always confirm with the user before posting.",
        inputSchema: {
          type: "object",
          properties: {
            post_id: {
              type: "string",
              description: "Tweet/post ID to reply to",
            },
            content: {
              type: "string",
              description: "The reply content (you can write this yourself)",
            },
          },
          required: ["post_id", "content"],
        },
      },
      {
        name: "socials_list_personas",
        description:
          "List available personas for content generation. Includes both system personas and user-created custom personas.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      // Browser control tools
      {
        name: "socials_open_tab",
        description:
          "Open a new browser tab. ALWAYS use this first before trying to get posts. Example: open https://x.com/home to view X feed.",
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "URL to open. Use https://x.com/home for X feed.",
            },
          },
          required: ["url"],
        },
      },
      {
        name: "socials_navigate",
        description:
          "Navigate the current or specified tab to a URL.",
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "URL to navigate to",
            },
            tab_id: {
              type: "number",
              description: "Tab ID (optional, uses active tab if not provided)",
            },
          },
          required: ["url"],
        },
      },
      {
        name: "socials_get_active_tab",
        description:
          "Get information about the currently active browser tab including URL, title, and detected platform.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "socials_reload_tab",
        description:
          "Reload the current or specified browser tab. Useful after page changes to get fresh content.",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: {
              type: "number",
              description: "Tab ID to reload (optional, uses active tab if not provided)",
            },
          },
          required: [],
        },
      },
      {
        name: "socials_get_page_content",
        description:
          "Get posts from current page. Use socials_open_tab first to open the social media site.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "socials_scroll",
        description:
          "Scroll the page to load more posts. Use this to discover new content in the feed.",
        inputSchema: {
          type: "object",
          properties: {
            direction: {
              type: "string",
              enum: ["down", "up"],
              description: "Scroll direction (default: down)",
            },
            amount: {
              type: "number",
              description: "Scroll amount in pixels (default: 800)",
            },
          },
          required: [],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "socials_check_access": {
        const wsServerListening = bridge.isWsServerListening();
        const extensionConnected = bridge.isConnected();

        if (!wsServerListening) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  connected: false,
                  ws_server_listening: false,
                  extension_connected: false,
                  action:
                    "The MCP WebSocket bridge is not listening on port 9847 (bridge failed to start or port is in use). " +
                    "Fix: run `lsof -nP -iTCP:9847 | grep LISTEN`, quit duplicate Claude sessions or stale node processes, " +
                    "or add env SOCIALS_MCP_RECLAIM_PORT=1 to this MCP server in Claude. " +
                    "Then restart Claude Code so the Socials plugin starts cleanly.",
                }),
              },
            ],
          };
        }

        if (!extensionConnected) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  connected: false,
                  ws_server_listening: true,
                  extension_connected: false,
                  action:
                    "MCP is listening; the browser extension has not connected to ws://127.0.0.1:9847. " +
                    "Use Chrome/Edge/Brave with Socials installed, open the extension → Settings → turn Agent Mode ON, " +
                    "then toggle it off/on or reload the extension. Keep this Claude session open while testing.",
                }),
              },
            ],
          };
        }

        const { isPro, tier } = await bridge.checkProAccess();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                connected: true,
                ws_server_listening: true,
                extension_connected: true,
                isPro,
                tier,
                message: isPro
                  ? "Connected with Pro access. Ready to use all Socials tools."
                  : `Connected but Pro access required. Current tier: ${tier}. Upgrade at https://socials.brainrotcreations.com/pricing`,
              }),
            },
          ],
        };
      }

      case "socials_get_feed": {
        await requireProAccess();
        const parsed = GetFeedPostsSchema.parse(args);
        const posts = await bridge.getFeedPosts(parsed.platform, Math.min(parsed.count || 10, 50));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                platform: parsed.platform,
                count: posts.length,
                posts: posts.map((p) => ({
                  id: p.id,
                  url: p.url,
                  author: p.author,
                  content: p.content,
                  timestamp: p.timestamp,
                  engagement: p.engagement,
                })),
              }),
            },
          ],
        };
      }

      case "socials_get_post_context": {
        await requireProAccess();
        const parsed = GetPostContextSchema.parse(args);
        const context = await bridge.getPostContext(parsed.platform, parsed.post_url);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(context),
            },
          ],
        };
      }

      case "socials_generate_reply": {
        await requireProAccess();
        const parsed = GenerateReplySchema.parse(args);
        const result = await bridge.generateReply(
          parsed.platform,
          parsed.post_content,
          parsed.post_author,
          parsed.persona_id,
          parsed.mood
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                generatedReply: result.content,
                metadata: result.metadata,
              }),
            },
          ],
        };
      }

      case "socials_quick_reply": {
        await requireProAccess();
        const postId = (args as { post_id: string }).post_id;
        const content = (args as { content: string }).content;

        const result = await bridge.quickReply(postId, content);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: result.success,
                error: result.error,
              }),
            },
          ],
        };
      }

      case "socials_list_personas": {
        if (!bridge.isConnected()) {
          throw new Error("Extension not connected");
        }

        const personas = await bridge.listPersonas();

        // Return concise list: just name and id
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                personas: personas.map((p) => ({ id: p.id, name: p.name })),
              }),
            },
          ],
        };
      }

      // Browser control tools
      case "socials_open_tab": {
        await requireProAccess();
        const parsed = OpenTabSchema.parse(args);
        const result = await bridge.openTab(parsed.url);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                tabId: result.tabId,
                url: result.url,
                message: `Opened new tab with URL: ${result.url}`,
              }),
            },
          ],
        };
      }

      case "socials_navigate": {
        await requireProAccess();
        const parsed = NavigateToSchema.parse(args);
        const result = await bridge.navigateTo(parsed.url, parsed.tab_id);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                tabId: result.tabId,
                url: result.url,
                message: `Navigated to: ${result.url}`,
              }),
            },
          ],
        };
      }

      case "socials_get_active_tab": {
        if (!bridge.isConnected()) {
          throw new Error("Extension not connected");
        }

        const result = await bridge.getActiveTab();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                tabId: result.tabId,
                url: result.url,
                title: result.title,
                platform: result.platform,
                message: result.platform
                  ? `Active tab is on ${result.platform}: ${result.url}`
                  : `Active tab: ${result.url} (not a supported social platform)`,
              }),
            },
          ],
        };
      }

      case "socials_reload_tab": {
        await requireProAccess();
        const parsed = ReloadTabSchema.parse(args);
        await bridge.reloadTab(parsed.tab_id);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                message: "Tab reloaded successfully",
              }),
            },
          ],
        };
      }

      case "socials_get_page_content": {
        await requireProAccess();
        const tabId = args && typeof args === "object" && "tab_id" in args
          ? (args as { tab_id?: number }).tab_id
          : undefined;
        const result = await bridge.getPageContent(tabId);

        const payload: Record<string, unknown> = {
          platform: result.platform,
          url: result.url,
          posts: result.posts.slice(0, 5),
        };
        if (process.env.SOCIALS_MCP_DEBUG === "1") {
          payload.debug = (result as { debug?: unknown }).debug;
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(payload),
            },
          ],
        };
      }

      case "socials_scroll": {
        await requireProAccess();
        const direction = (args as { direction?: string })?.direction || "down";
        const amount = (args as { amount?: number })?.amount || 800;
        await bridge.scrollPage(direction, amount);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true }),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: true,
            message: errorMessage,
          }),
        },
      ],
      isError: true,
    };
  }
});

// Main entry point
async function main(): Promise<void> {
  // Start WebSocket bridge for extension communication
  try {
    await bridge.start();
    console.error("[socials-plugin] Extension bridge started");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[socials-plugin] Failed to start extension bridge:", msg);
    if (msg.includes("EADDRINUSE") || msg.includes("address already in use")) {
      console.error(
        "[socials-plugin] Another process holds port 9847 (often a stale Socials MCP process). " +
          "Fix: quit duplicate Claude windows, or run `lsof -nP -iTCP:9847 | grep LISTEN` and kill that PID. " +
          "Optional: set env SOCIALS_MCP_RECLAIM_PORT=1 on this MCP server to SIGTERM listeners on 9847 before bind."
      );
    }
    // Continue anyway - tools will report extension not connected
  }

  // Start MCP server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[socials-plugin] MCP server running");

  // Handle shutdown
  process.on("SIGINT", () => {
    bridge.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    bridge.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("[socials-plugin] Fatal error:", error);
  process.exit(1);
});
