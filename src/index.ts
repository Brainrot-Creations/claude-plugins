#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { ExtensionBridge } from "./extension-bridge.js";
import {
  trackServerStart,
  trackToolUsage,
  trackError,
  trackExtensionConnected,
  trackExtensionDisconnected,
  setUserIdentity,
  clearUserIdentity,
  trackPostCreated,
  trackReplySent,
  trackEngagement,
  trackSearch,
  trackProfileViewed,
  trackConnectionRequest,
  trackPersonaUsed,
  trackFeedViewed,
  createTimer,
  updateTierGroupProperties,
  trackHealthMetrics,
  isFeatureEnabled,
  getEngagementScore,
  getHealthMetrics,
  isToolEnabled,
  isPlatformEnabled,
  isToolEnabledAsync,
  isPlatformEnabledAsync,
  ensureFeatureFlagsLoaded,
  forceRefreshFeatureFlags,
  getFeatureGatingStatus,
  getToolFlagName,
  trackFeatureView,
  trackFeatureInteraction,
} from "./analytics.js";

const bridge = new ExtensionBridge();

// Tool schemas
const GetFeedPostsSchema = z.object({
  platform: z
    .enum(["x", "linkedin", "reddit"])
    .describe("Social media platform"),
  count: z
    .number()
    .optional()
    .default(10)
    .describe("Number of posts to fetch (default: 10)"),
});

const GetPostContextSchema = z.object({
  platform: z
    .enum(["x", "linkedin", "reddit"])
    .describe("Social media platform"),
  post_url: z.string().describe("URL of the post to get context for"),
});

const GenerateReplySchema = z.object({
  platform: z
    .enum(["x", "linkedin", "reddit"])
    .describe("Social media platform"),
  post_content: z.string().describe("Content of the post to reply to"),
  post_author: z.string().describe("Author/handle of the post"),
  persona_id: z
    .string()
    .optional()
    .describe("Persona ID to use for generation"),
  mood: z
    .string()
    .optional()
    .describe("Mood/tone for the reply (e.g., witty, professional)"),
});

const CreatePostSchema = z.object({
  platform: z
    .literal("x")
    .describe("Only X (Twitter) is supported for new posts via the extension"),
  content: z
    .string()
    .min(1)
    .describe("Full text of the new post (X character limits apply)"),
});

const EngagePostSchema = z.object({
  platform: z
    .literal("x")
    .describe("Only X is supported for feed engagement via the extension"),
  post_id: z
    .string()
    .min(1)
    .describe("Tweet id from socials_get_feed (numeric status id)"),
  actions: z
    .array(z.enum(["like", "repost", "bookmark", "share"]))
    .min(1)
    .describe(
      "One or more actions to run in order on that tweet. like/repost/bookmark toggle if already engaged. share opens the share menu.",
    ),
});

const XSearchSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      'X search text (e.g. "startup", hashtag, or from:user). Submits the top search field and navigates to results.',
    ),
});

const LinkedInPostsSearchSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      'LinkedIn content/posts search text (e.g. "founder energy", "startup tips"). Navigates to LinkedIn search results page filtered to Posts.',
    ),
});

// Browser control schemas
const OpenTabSchema = z.object({
  url: z.string().describe("URL to open in new tab"),
  focus: z
    .boolean()
    .optional()
    .describe(
      "If true, switch Chrome to this tab. Default false: tab opens in the background so you can keep working elsewhere; it becomes the pinned agent tab for all Socials automation.",
    ),
});

const NavigateToSchema = z.object({
  url: z.string().describe("URL to navigate to"),
  tab_id: z
    .number()
    .optional()
    .describe(
      "Tab ID to navigate. If omitted, navigates the pinned agent tab (from socials_open_tab), not necessarily the foreground tab.",
    ),
});

const SetAgentTabSchema = z.object({
  tab_id: z
    .number()
    .describe(
      "Existing Chrome tab ID to use as the Socials agent tab (from socials_get_active_tab or the tab bar).",
    ),
});

const ReloadTabSchema = z.object({
  tab_id: z
    .number()
    .optional()
    .describe("Tab ID to reload (uses active tab if not provided)"),
});

// Create MCP server
const server = new Server(
  {
    name: "claude-plugins",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Helper to check Pro access before operations
async function requireProAccess(): Promise<void> {
  if (!bridge.isConnected()) {
    throw new Error(
      "Socials extension not connected. Please:\n" +
        "1. Open your browser with the Socials extension installed and signed in\n" +
        "2. MCP is available on paid plans (or when your account is allowlisted). Open the side panel once so the extension loads; it connects when this MCP server is running",
    );
  }

  const { tier, canUseMcp } = await bridge.checkProAccess();
  if (!canUseMcp) {
    throw new Error(
      `Claude Code ↔ Socials requires a paid plan (or an allowlisted account). Current tier: ${tier}\n` +
        "Upgrade at https://socials.brainrotcreations.com/pricing",
    );
  }
}

// All tool definitions
const allTools = [
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
          "Reads the pinned agent tab (set by socials_open_tab), not the tab or window you are looking at—works across Chrome windows.",
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
              description:
                "Optional: mood/tone (witty, professional, casual, etc.)",
            },
          },
          required: ["platform", "post_content", "post_author"],
        },
      },
      {
        name: "socials_quick_reply",
        description:
          "Reply from the pinned agent tab's feed (see socials_open_tab)—that tab need not be focused. " +
          "Clicks reply on the tweet, types the content, and posts. " +
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
        name: "socials_create_post",
        description:
          "Publish a new original post on X (not a reply) in the pinned agent tab (need not be focused). " +
          "Opens the compose dialog from the sidebar, fills the text, and clicks Post. " +
          "Agent tab should be on X (e.g. https://x.com/home) with the left nav visible. " +
          "IMPORTANT: Always confirm the exact text with the user before calling this tool.",
        inputSchema: {
          type: "object",
          properties: {
            platform: {
              type: "string",
              enum: ["x"],
              description: "Must be x",
            },
            content: {
              type: "string",
              description: "Full post body to publish",
            },
          },
          required: ["platform", "content"],
        },
      },
      {
        name: "socials_engage_post",
        description:
          "On X, perform engagement on a tweet visible in the pinned agent tab (home timeline, list, etc.; tab need not be focused). " +
          "Uses the tweet id from socials_get_feed. Runs actions in order: like, repost (simple repost, not quote), bookmark, and/or share (opens share menu). " +
          "Like/bookmark/repost are toggles on X—calling again may undo. " +
          "IMPORTANT: Only use when the user explicitly wants these actions.",
        inputSchema: {
          type: "object",
          properties: {
            platform: {
              type: "string",
              enum: ["x"],
              description: "Must be x",
            },
            post_id: {
              type: "string",
              description: "Tweet status id",
            },
            actions: {
              type: "array",
              items: {
                type: "string",
                enum: ["like", "repost", "bookmark", "share"],
              },
              description: "Actions to perform, in order",
            },
          },
          required: ["platform", "post_id", "actions"],
        },
      },
      {
        name: "socials_x_search",
        description:
          "On X, run search in the pinned agent tab (not necessarily the focused tab): fills top search and navigates to results (e.g. /search?q=…). " +
          "After success, use socials_get_feed, socials_quick_reply, and socials_engage_post on the visible tweets. " +
          "If the search box is missing, the extension may navigate the agent tab to https://x.com/explore and retry once.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search string to submit in X's top search box",
            },
          },
          required: ["query"],
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
          "Open a URL in a new tab and pin it as the Socials agent tab. Automation targets this tab by ID across tabs and Chrome windows (not only the focused window). By default opens in the background (focus: true to switch to it). If a pin already exists, the new tab opens in the same window as that pin so a separate empty window does not steal the agent workspace.",
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description:
                "URL to open. Use https://x.com/home for X feed, https://www.linkedin.com/feed/ for LinkedIn feed, and https://www.reddit.com/ (or a subreddit URL) for Reddit.",
            },
            focus: {
              type: "boolean",
              description:
                "If true, activate the new tab and focus the window. Default false (background).",
            },
          },
          required: ["url"],
        },
      },
      {
        name: "socials_navigate",
        description:
          "Navigate the pinned agent tab (or tab_id if provided) to a URL. Does not require that tab to be active.",
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "URL to navigate to",
            },
            tab_id: {
              type: "number",
              description:
                "Optional. If omitted, uses the pinned agent tab from socials_open_tab.",
            },
          },
          required: ["url"],
        },
      },
      {
        name: "socials_get_active_tab",
        description:
          "Get the currently focused browser tab (what you are looking at). For the tab Claude automates, use socials_get_agent_tab.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "socials_get_agent_tab",
        description:
          "Get the pinned Socials agent tab (URL, title, platform). Null if none set yet—then call socials_open_tab.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "socials_focus_agent_tab",
        description:
          "Bring the pinned agent tab to the foreground (same as clicking it). Use when you want to watch what Claude is doing.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "socials_set_agent_tab",
        description:
          "Pin an existing tab as the agent tab (e.g. you already have X open). Pass tab_id from socials_get_active_tab.",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: {
              type: "number",
              description: "Chrome tab ID to pin for automation",
            },
          },
          required: ["tab_id"],
        },
      },
      {
        name: "socials_reload_tab",
        description: "Reload the pinned agent tab, or tab_id if provided.",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: {
              type: "number",
              description:
                "Optional. If omitted, reloads the pinned agent tab.",
            },
          },
          required: [],
        },
      },
      {
        name: "socials_get_page_content",
        description:
          "Get posts from the pinned agent tab (or foreground tab if no pin). Use socials_open_tab first.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "socials_scroll",
        description:
          "Scroll the pinned agent tab to load more posts (does not require that tab to be focused).",
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
      // LinkedIn People Search tools
      {
        name: "socials_linkedin_people_search",
        description:
          "Search for people on LinkedIn. Navigates to the search results page in the pinned agent tab. " +
          "Returns list of people with their profiles. Use socials_linkedin_get_people to get the results after search.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query (e.g., 'software engineer amazon', 'product manager google')",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "socials_linkedin_get_people",
        description:
          "Get people results from the current LinkedIn people search page. " +
          "Returns array of people with name, headline, location, profile URL, and connection status. " +
          "Also returns pagination info (current page, total pages, has next/prev).",
        inputSchema: {
          type: "object",
          properties: {
            count: {
              type: "number",
              description: "Maximum number of people to return (default: 10)",
            },
          },
          required: [],
        },
      },
      {
        name: "socials_linkedin_next_page",
        description:
          "Go to the next page of LinkedIn search results. Returns false if already on the last page.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "socials_linkedin_go_to_page",
        description:
          "Go to a specific page number of LinkedIn search results.",
        inputSchema: {
          type: "object",
          properties: {
            page: {
              type: "number",
              description: "Page number to navigate to (1-based)",
            },
          },
          required: ["page"],
        },
      },
      // LinkedIn Posts Search
      {
        name: "socials_linkedin_posts_search",
        description:
          "Search for posts on LinkedIn. Navigates to search results filtered to Posts. " +
          "After success, use socials_get_feed to read visible posts, then socials_linkedin_engage or socials_quick_reply to interact.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search string for LinkedIn posts (e.g. 'founder energy', 'startup tips')",
            },
          },
          required: ["query"],
        },
      },
      // LinkedIn Profile & Connection Tools (handle navigation internally)
      {
        name: "socials_linkedin_connect",
        description:
          "Send a connection request on LinkedIn. Automatically navigates to the profile if needed. " +
          "Returns rich status: already_connected, pending_sent, pending_received, follow_only, or success. " +
          "IMPORTANT: Always confirm with the user before sending connection requests.",
        inputSchema: {
          type: "object",
          properties: {
            profile_url: {
              type: "string",
              description: "LinkedIn profile URL (full URL or /in/username)",
            },
            note: {
              type: "string",
              description: "Optional personalized note (max 300 chars)",
            },
          },
          required: ["profile_url"],
        },
      },
      {
        name: "socials_linkedin_profile",
        description:
          "Get LinkedIn profile information. Navigates to the profile and extracts data in one call. " +
          "Returns name, headline, about, experience, education, skills, connection status, and more.",
        inputSchema: {
          type: "object",
          properties: {
            profile_url: {
              type: "string",
              description: "LinkedIn profile URL (full URL or /in/username)",
            },
          },
          required: ["profile_url"],
        },
      },
      {
        name: "socials_linkedin_connection_status",
        description:
          "Check the connection status with a LinkedIn user without sending a request. " +
          "Returns: connected, pending_sent, pending_received, not_connected, or follow_only.",
        inputSchema: {
          type: "object",
          properties: {
            profile_url: {
              type: "string",
              description: "LinkedIn profile URL (full URL or /in/username)",
            },
          },
          required: ["profile_url"],
        },
      },
      {
        name: "socials_linkedin_engage",
        description:
          "Engage with a LinkedIn post visible on the current feed or search results page. " +
          "Use socials_get_feed first to get post IDs, then pass the post_id here. " +
          "Actions: like (toggle), repost (instant), quote_repost (opens dialog). " +
          "IMPORTANT: Only use when the user explicitly wants these actions.",
        inputSchema: {
          type: "object",
          properties: {
            post_id: {
              type: "string",
              description: "LinkedIn post ID/URN from socials_get_feed",
            },
            actions: {
              type: "array",
              items: {
                type: "string",
                enum: ["like", "repost", "quote_repost"],
              },
              description: "Actions to perform",
            },
          },
          required: ["post_id", "actions"],
        },
      },
      // TODO: Re-enable when LinkedIn UI selectors are updated
      // {
      //   name: "socials_linkedin_create_post",
      //   description:
      //     "Create a new post on LinkedIn. Opens the compose dialog, types the content, and posts. " +
      //     "IMPORTANT: Always confirm the exact text with the user before calling this tool.",
      //   inputSchema: {
      //     type: "object",
      //     properties: {
      //       content: {
      //         type: "string",
      //         description: "Post content (LinkedIn character limits apply)",
      //       },
      //     },
      //     required: ["content"],
      //   },
      // },
      // Diagnostics tool
      {
        name: "socials_diagnostics",
        description:
          "Get diagnostics info: health metrics, engagement score, feature flags. " +
          "Use refresh=true to force-refresh feature flags from PostHog.",
        inputSchema: {
          type: "object",
          properties: {
            refresh: {
              type: "boolean",
              description: "Force refresh feature flags from PostHog (bypasses cache)",
            },
          },
          required: [],
        },
      },
];

// List available tools (filtered by feature flags)
server.setRequestHandler(ListToolsRequestSchema, async () => {
  // Filter tools based on feature flags
  const enabledTools = allTools.filter(tool => isToolEnabled(tool.name));

  return {
    tools: enabledTools,
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Extract platform from args if present
  const platform = args && typeof args === "object" && "platform" in args
    ? String((args as { platform?: string }).platform)
    : undefined;

  // Start timer for this tool call
  const getElapsed = createTimer();

  // Check if tool is enabled via feature flags (async to ensure flags are loaded)
  const toolEnabled = await isToolEnabledAsync(name);
  if (!toolEnabled) {
    const gatingStatus = getFeatureGatingStatus();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: true,
            message: `Tool "${name}" is currently disabled. Contact support if you believe this is an error.`,
            feature_gated: true,
            debug: {
              tool: name,
              flags_fetched: gatingStatus.debug.flags_fetched,
              flags_fetch_succeeded: gatingStatus.debug.flags_fetch_succeeded,
              flags_age_seconds: gatingStatus.debug.flags_age_seconds,
              raw_flags: gatingStatus.debug.raw_flags,
            },
          }),
        },
      ],
      isError: true,
    };
  }

  // Check platform-level flag for platform-specific tools
  if (platform && (platform === "x" || platform === "linkedin" || platform === "reddit")) {
    if (!(await isPlatformEnabledAsync(platform))) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: true,
              message: `Platform "${platform}" is currently disabled. Contact support if you believe this is an error.`,
              feature_gated: true,
            }),
          },
        ],
        isError: true,
      };
    }
  }

  // Track feature flag view for enriched analytics
  const toolFlagName = getToolFlagName(name);
  if (toolFlagName) {
    trackFeatureView(toolFlagName);
  }

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
                    "Use Chrome/Edge/Brave with Socials installed, sign in, open the side panel once so the extension loads " +
                    "(paid plan or allowlisted free tier), then reload the extension if needed. " +
                    "Keep this Claude session open while testing.",
                }),
              },
            ],
          };
        }

        const { isPro, tier, canUseMcp } = await bridge.checkProAccess();

        // Get full user info for analytics
        try {
          const userInfo = await bridge.getCurrentUser();
          setUserIdentity(userInfo.id, userInfo.email, tier);
          updateTierGroupProperties();
          // Pre-load feature flags for this user
          await ensureFeatureFlagsLoaded();
        } catch {
          // Continue without user identity if getCurrentUser fails
        }

        // Track successful connection and tool usage with timing
        trackExtensionConnected(tier);
        await trackToolUsage(name, platform, true, getElapsed());

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
                canUseMcp,
                message: canUseMcp
                  ? isPro
                    ? "Connected with Pro access. Ready to use all Socials tools."
                    : "Connected with MCP access (allowlisted). Ready to use all Socials tools."
                  : `Connected but MCP tools require a paid plan (or allowlist). Current tier: ${tier}. Upgrade at https://socials.brainrotcreations.com/pricing`,
              }),
            },
          ],
        };
      }

      case "socials_get_feed": {
        await requireProAccess();
        const parsed = GetFeedPostsSchema.parse(args);
        const posts = await bridge.getFeedPosts(
          parsed.platform,
          Math.min(parsed.count || 10, 50),
        );

        // Track feed view with timing
        const elapsed = getElapsed();
        trackFeedViewed(parsed.platform, posts.length, elapsed);
        await trackToolUsage(name, parsed.platform, true, elapsed);

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
        const context = await bridge.getPostContext(
          parsed.platform,
          parsed.post_url,
        );

        // Track tool usage
        await trackToolUsage(name, parsed.platform, true, getElapsed());

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
          parsed.mood,
        );

        // Track persona usage if specified
        if (result.metadata?.personaUsed) {
          trackPersonaUsed(parsed.persona_id || "default", result.metadata.personaUsed);
        }

        // Track tool usage
        const elapsed = getElapsed();
        await trackToolUsage(name, parsed.platform, true, elapsed);

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

        // Track reply sent with content analysis and timing
        const elapsed = getElapsed();
        trackReplySent("x", content, result.success, elapsed);
        await trackToolUsage(name, "x", result.success, elapsed);

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

      case "socials_create_post": {
        await requireProAccess();
        const parsed = CreatePostSchema.parse(args);
        const result = await bridge.createPost({
          platform: parsed.platform,
          content: parsed.content,
        });

        // Track post created with content analysis and timing
        const elapsed = getElapsed();
        trackPostCreated(parsed.platform, parsed.content, result.success, elapsed);
        await trackToolUsage(name, parsed.platform, result.success, elapsed);

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

      case "socials_engage_post": {
        await requireProAccess();
        const parsed = EngagePostSchema.parse(args);
        const result = await bridge.engagePost({
          platform: parsed.platform,
          postId: parsed.post_id,
          actions: parsed.actions,
        });

        // Track engagement with timing
        const elapsed = getElapsed();
        trackEngagement(parsed.platform, parsed.actions, result.success, elapsed);
        await trackToolUsage(name, parsed.platform, result.success, elapsed);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: result.success,
                results: result.results,
                error: result.error,
              }),
            },
          ],
        };
      }

      case "socials_x_search": {
        await requireProAccess();
        const parsed = XSearchSchema.parse(args);
        const result = await bridge.xSearch({ query: parsed.query });

        // Track search with timing
        const elapsed = getElapsed();
        trackSearch("x", "posts", result.success, elapsed);
        await trackToolUsage(name, "x", result.success, elapsed);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: result.success,
                url: result.url,
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
        await trackToolUsage(name, null, true, getElapsed());

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
        const result = await bridge.openTab(parsed.url, parsed.focus);
        await trackToolUsage(name, null, true, getElapsed());

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                tabId: result.tabId,
                url: result.url,
                agentTabPinned: result.agentTabPinned,
                message: parsed.focus
                  ? `Opened and focused tab ${result.tabId} (${result.url}). This tab is pinned for all Socials automation.`
                  : `Opened tab ${result.tabId} in the background (${result.url}). Pinned for automation—you can use other tabs; use socials_focus_agent_tab to view it.`,
              }),
            },
          ],
        };
      }

      case "socials_navigate": {
        await requireProAccess();
        const parsed = NavigateToSchema.parse(args);
        const result = await bridge.navigateTo(parsed.url, parsed.tab_id);
        await trackToolUsage(name, null, true, getElapsed());

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
        await trackToolUsage(name, null, true, getElapsed());

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

      case "socials_get_agent_tab": {
        if (!bridge.isConnected()) {
          throw new Error("Extension not connected");
        }

        const agent = await bridge.getAgentTab();
        await trackToolUsage(name, null, true, getElapsed());

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                agent
                  ? {
                      tabId: agent.tabId,
                      url: agent.url,
                      title: agent.title,
                      platform: agent.platform,
                      message: `Pinned agent tab (Claude uses this for feed/reply/scroll): ${agent.url}`,
                    }
                  : {
                      agentTab: null,
                      message:
                        "No agent tab pinned yet. Call socials_open_tab or socials_set_agent_tab.",
                    },
              ),
            },
          ],
        };
      }

      case "socials_focus_agent_tab": {
        await requireProAccess();
        const result = await bridge.focusAgentTab();
        await trackToolUsage(name, null, true, getElapsed());

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                tabId: result.tabId,
                url: result.url,
                title: result.title,
                message: "Focused the pinned agent tab.",
              }),
            },
          ],
        };
      }

      case "socials_set_agent_tab": {
        await requireProAccess();
        const parsed = SetAgentTabSchema.parse(args);
        const result = await bridge.setAgentTab(parsed.tab_id);
        await trackToolUsage(name, null, true, getElapsed());

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                tabId: result.tabId,
                url: result.url,
                title: result.title,
                message: `Pinned tab ${result.tabId} as the Socials agent tab.`,
              }),
            },
          ],
        };
      }

      case "socials_reload_tab": {
        await requireProAccess();
        const parsed = ReloadTabSchema.parse(args);
        await bridge.reloadTab(parsed.tab_id);
        await trackToolUsage(name, null, true, getElapsed());

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
        const tabId =
          args && typeof args === "object" && "tab_id" in args
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
        await trackToolUsage(name, result.platform, true, getElapsed());

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
        await trackToolUsage(name, null, true, getElapsed());

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true }),
            },
          ],
        };
      }

      // LinkedIn People Search tools
      case "socials_linkedin_people_search": {
        await requireProAccess();
        const query = (args as { query: string }).query;
        const result = await bridge.linkedinPeopleSearch(query);

        // Track search with timing
        const elapsed = getElapsed();
        trackSearch("linkedin", "people", result.success, elapsed);
        await trackToolUsage(name, "linkedin", result.success, elapsed);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: result.success,
                url: result.url,
                error: result.error,
                message: result.success
                  ? `Navigated to LinkedIn people search for "${query}". Use socials_linkedin_get_people to get results.`
                  : result.error,
              }),
            },
          ],
        };
      }

      case "socials_linkedin_get_people": {
        await requireProAccess();
        const count = (args as { count?: number })?.count || 10;
        const result = await bridge.linkedinGetPeople(count);
        await trackToolUsage(name, "linkedin", result.success, getElapsed());

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: result.success,
                people: result.people,
                pagination: result.pagination,
                error: result.error,
              }),
            },
          ],
        };
      }

      case "socials_linkedin_next_page": {
        await requireProAccess();
        const result = await bridge.linkedinNextPage();
        await trackToolUsage(name, "linkedin", result.success, getElapsed());

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: result.success,
                currentPage: result.currentPage,
                error: result.error,
                message: result.success
                  ? `Navigated to page ${result.currentPage}`
                  : result.error || "Already on last page",
              }),
            },
          ],
        };
      }

      case "socials_linkedin_go_to_page": {
        await requireProAccess();
        const page = (args as { page: number }).page;
        const result = await bridge.linkedinGoToPage(page);
        await trackToolUsage(name, "linkedin", result.success, getElapsed());

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: result.success,
                currentPage: result.currentPage,
                error: result.error,
                message: result.success
                  ? `Navigated to page ${result.currentPage}`
                  : result.error,
              }),
            },
          ],
        };
      }

      case "socials_linkedin_posts_search": {
        await requireProAccess();
        const parsed = LinkedInPostsSearchSchema.parse(args);
        const result = await bridge.linkedinPostsSearch(parsed.query);

        // Track search with timing
        const elapsed = getElapsed();
        trackSearch("linkedin", "posts", result.success, elapsed);
        await trackToolUsage(name, "linkedin", result.success, elapsed);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: result.success,
                url: result.url,
                error: result.error,
                message: result.success
                  ? `Navigated to LinkedIn posts search for "${parsed.query}". Use socials_get_feed to get results.`
                  : result.error,
              }),
            },
          ],
        };
      }

      // ============ V2 Intent-Oriented Handlers ============

      case "socials_linkedin_connect": {
        await requireProAccess();
        const profileUrl = (args as { profile_url: string }).profile_url;
        const note = (args as { note?: string }).note;
        const result = await bridge.linkedinConnectV2(profileUrl, note);

        // Track connection request with timing
        const elapsed = getElapsed();
        trackConnectionRequest(result.success, !!note, elapsed);
        await trackToolUsage(name, "linkedin", result.success, elapsed);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result),
            },
          ],
        };
      }

      case "socials_linkedin_profile": {
        await requireProAccess();
        const profileUrl = (args as { profile_url: string }).profile_url;
        const result = await bridge.linkedinProfileV2(profileUrl);

        // Track profile viewed with timing
        const elapsed = getElapsed();
        trackProfileViewed(result.success, elapsed);
        await trackToolUsage(name, "linkedin", result.success, elapsed);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result),
            },
          ],
        };
      }

      case "socials_linkedin_connection_status": {
        await requireProAccess();
        const profileUrl = (args as { profile_url: string }).profile_url;
        const result = await bridge.linkedinConnectionStatus(profileUrl);
        await trackToolUsage(name, "linkedin", result.success, getElapsed());

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result),
            },
          ],
        };
      }

      case "socials_linkedin_engage": {
        await requireProAccess();
        const postId = (args as { post_id: string }).post_id;
        const actions = (args as { actions: string[] }).actions as Array<
          "like" | "repost" | "quote_repost"
        >;
        const result = await bridge.linkedinEngagePost({
          platform: "linkedin",
          postId,
          actions,
        });

        // Track engagement with timing
        const elapsed = getElapsed();
        trackEngagement("linkedin", actions, result.success, elapsed);
        await trackToolUsage(name, "linkedin", result.success, elapsed);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: result.success,
                results: result.results,
                error: result.error,
              }),
            },
          ],
        };
      }

      // TODO: Re-enable when LinkedIn UI selectors are updated
      // case "socials_linkedin_create_post": {
      //   await requireProAccess();
      //   const content = (args as { content: string }).content;
      //   const result = await bridge.linkedinCreatePost(content);
      //
      //   return {
      //     content: [
      //       {
      //         type: "text",
      //         text: JSON.stringify(result),
      //       },
      //     ],
      //   };
      // }

      case "socials_diagnostics": {
        const refresh = (args as { refresh?: boolean })?.refresh;

        // Force refresh flags if requested
        if (refresh) {
          await forceRefreshFeatureFlags();
        }

        const health = getHealthMetrics();
        const engagement = getEngagementScore();
        const extensionConnected = bridge.isConnected();

        // Get feature gating status (includes debug info)
        const featureGating = getFeatureGatingStatus();
        await trackToolUsage(name, null, true, getElapsed());

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "ok",
                version: "1.0.28",
                extension_connected: extensionConnected,
                health,
                engagement,
                feature_gating: featureGating,
                refreshed: refresh || false,
              }, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Track error with timing - await to ensure events are sent
    await trackError(name, errorMessage);
    await trackToolUsage(name, platform, false, getElapsed());

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
  // Track server start
  trackServerStart();

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
          "Optional: set env SOCIALS_MCP_RECLAIM_PORT=1 on this MCP server to SIGTERM listeners on 9847 before bind.",
      );
    }
    // Continue anyway - tools will report extension not connected
  }

  // Start MCP server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[socials-plugin] MCP server running");

  // Start periodic health tracking (every 5 minutes)
  const healthInterval = setInterval(() => {
    trackHealthMetrics();
  }, 5 * 60 * 1000);

  // Handle shutdown
  process.on("SIGINT", () => {
    clearInterval(healthInterval);
    bridge.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    clearInterval(healthInterval);
    bridge.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("[socials-plugin] Fatal error:", error);
  process.exit(1);
});
