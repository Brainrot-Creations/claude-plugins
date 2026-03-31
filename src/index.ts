#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { ExtensionBridge, initPortConfig, getCurrentPortConfig } from "./extension-bridge.js";
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

// ============ Parameter Alias Resolution ============
// Agents commonly use alternative parameter names (e.g., tweet_id instead of post_id).
// These helpers normalize args so tools work regardless of naming convention.

function resolveParam(args: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (args[key] !== undefined) return args[key];
  }
  return undefined;
}

function requireParam<T = string>(args: Record<string, unknown>, name: string, ...aliases: string[]): T {
  const value = resolveParam(args, name, ...aliases);
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing required parameter "${name}". Got: ${Object.keys(args).join(", ")}. Aliases checked: ${[name, ...aliases].join(", ")}`);
  }
  return value as T;
}

/** Resolve post/tweet ID from common parameter name variations */
function resolvePostId(args: Record<string, unknown>): string {
  return requireParam(args, "post_id", "postId", "tweet_id", "tweetId", "id");
}

/** Resolve content/text from common parameter name variations */
function resolveContent(args: Record<string, unknown>): string {
  return requireParam(args, "content", "text", "reply", "body", "message");
}

/** Resolve profile URL from common parameter name variations */
function resolveProfileUrl(args: Record<string, unknown>): string {
  return requireParam(args, "profile_url", "profileUrl", "url", "profile");
}

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

const CreatePostMediaSchema = z.object({
  path: z.string().optional().describe("Local file path or URL to the media file"),
  url: z.string().optional().describe("Alias for path (for backwards compatibility)"),
  type: z.enum(["image", "video", "gif"]).describe("Type of media"),
}).transform((item) => ({
  // Normalize: prefer 'path', fallback to 'url'
  path: item.path || item.url || "",
  type: item.type,
}));

const CreatePostSchema = z.object({
  platform: z
    .literal("x")
    .describe("Only X (Twitter) is supported for new posts via the extension"),
  content: z
    .string()
    .min(1)
    .describe("Full text of the new post (X character limits apply)"),
  media: z
    .array(CreatePostMediaSchema)
    .optional()
    .describe("Optional media attachments. Accepts local file paths (e.g., /path/to/image.png) or URLs."),
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
      'Base search text. Can include hashtags (#), mentions (@), cashtags ($), exact phrases ("phrase"), or exclusions (-word).',
    ),
  // User filters
  from: z.string().optional().describe("Posts from specific user (without @)"),
  to: z.string().optional().describe("Replies to specific user (without @)"),
  retweets_of: z.string().optional().describe("Retweets of specific user's posts"),
  // Time filters
  since: z.string().optional().describe("Start date (YYYY-MM-DD)"),
  until: z.string().optional().describe("End date (YYYY-MM-DD)"),
  since_time: z.number().optional().describe("Start Unix timestamp"),
  until_time: z.number().optional().describe("End Unix timestamp"),
  // Engagement filters
  min_retweets: z.number().optional().describe("Minimum retweet count"),
  min_faves: z.number().optional().describe("Minimum like count"),
  min_replies: z.number().optional().describe("Minimum reply count"),
  // Content filters
  filter: z.enum(["media", "images", "video", "links"]).optional()
    .describe("Include only posts with specific content type"),
  has: z.array(z.enum(["links", "hashtags", "media", "images", "video"])).optional()
    .describe("Must have these content types"),
  is_reply: z.boolean().optional().describe("Only show replies (true) or exclude replies (false)"),
  is_retweet: z.boolean().optional().describe("Only show retweets (true) or exclude retweets (false)"),
  // Location filters
  lang: z.string().optional().describe("Language code (e.g., 'en', 'es', 'ja')"),
  near: z.string().optional().describe("Location name (e.g., 'San Francisco')"),
  place: z.string().optional().describe("Specific place ID"),
  place_country: z.string().optional().describe("Country code (e.g., 'US', 'GB')"),
  // Advanced
  list: z.string().optional().describe("Posts from members of a list (list ID)"),
  conversation_id: z.string().optional().describe("Posts in a specific conversation thread"),
  // Results mode
  mode: z.enum(["top", "latest", "people", "photos", "videos"]).optional()
    .describe("Search results tab (default: top)"),
});

const LinkedInPostsSearchSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      'LinkedIn content/posts search text (e.g. "founder energy", "startup tips"). Navigates to LinkedIn search results page filtered to Posts.',
    ),
});

const LinkedInPeopleSearchSchema = z.object({
  query: z
    .string()
    .optional()
    .describe('Search keywords (e.g., "software engineer", "product manager")'),
  network: z.array(z.enum(["1st", "2nd", "3rd"])).optional()
    .describe("Connection degree filter: 1st, 2nd, 3rd (can combine multiple)"),
  actively_hiring: z.boolean().optional()
    .describe("Filter to people who are actively hiring"),
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
    version: "1.1.11",
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
          "Check connection status. After confirming access, use socials_open_tab to open X/LinkedIn/Reddit. " +
          "RECOVERY FLOW if this fails: 1) socials_refresh_auth 2) if still fails, socials_restart_bridge 3) user refreshes browser extension 4) retry check_access.",
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
      // DISABLED: socials_generate_reply - temporarily commented out
      // {
      //   name: "socials_generate_reply",
      //   description:
      //     "OPTIONAL: Generate a reply using Socials AI with the user's persona. You can also write replies yourself without this tool.",
      //   inputSchema: {
      //     type: "object",
      //     properties: {
      //       platform: {
      //         type: "string",
      //         enum: ["x", "linkedin", "reddit"],
      //         description: "Social media platform",
      //       },
      //       post_content: {
      //         type: "string",
      //         description: "The content of the post to reply to",
      //       },
      //       post_author: {
      //         type: "string",
      //         description: "The author/handle of the post",
      //       },
      //       persona_id: {
      //         type: "string",
      //         description: "Optional: specific persona ID to use",
      //       },
      //       mood: {
      //         type: "string",
      //         description:
      //           "Optional: mood/tone (witty, professional, casual, etc.)",
      //       },
      //     },
      //     required: ["platform", "post_content", "post_author"],
      //   },
      // },
      {
        name: "socials_quick_reply",
        description:
          "Reply to a tweet in the pinned agent tab's feed. " +
          "Pass post_id (from socials_get_feed) and content (your reply text). " +
          "IMPORTANT: Always confirm with the user before posting.",
        inputSchema: {
          type: "object",
          properties: {
            post_id: {
              type: "string",
              description: "The tweet ID from socials_get_feed results (e.g. '2039054554721824939')",
            },
            content: {
              type: "string",
              description: "Your reply text",
            },
            media: {
              type: "array",
              description: "Optional media to attach. Accepts local file paths (e.g., /path/to/image.png) or URLs. Max 4 images or 1 video/GIF.",
              items: {
                type: "object",
                properties: {
                  path: {
                    type: "string",
                    description: "Local file path or URL to the media file",
                  },
                  type: {
                    type: "string",
                    enum: ["image", "video", "gif"],
                    description: "Type of media",
                  },
                },
                required: ["path", "type"],
              },
            },
          },
          required: ["post_id", "content"],
        },
      },
      {
        name: "socials_create_post",
        description:
          "Publish a new original post on X (not a reply) in the pinned agent tab (need not be focused). " +
          "Opens the compose dialog from the sidebar, fills the text, optionally attaches media, and clicks Post. " +
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
            media: {
              type: "array",
              description:
                "Optional media attachments (images, videos, GIFs). Accepts local file paths or URLs. Max 4 images or 1 video/GIF per post.",
              items: {
                type: "object",
                properties: {
                  path: {
                    type: "string",
                    description: "Local file path (e.g., /Users/me/image.png) or URL to the media file",
                  },
                  type: {
                    type: "string",
                    enum: ["image", "video", "gif"],
                    description: "Type of media",
                  },
                },
                required: ["path", "type"],
              },
            },
          },
          required: ["platform", "content"],
        },
      },
      {
        name: "socials_engage_post",
        description:
          "Engage with a tweet (like, repost, bookmark, share). " +
          "Pass post_id from socials_get_feed. Actions are toggles — calling again may undo. " +
          "IMPORTANT: Only use when the user explicitly wants these actions.",
        inputSchema: {
          type: "object",
          properties: {
            platform: {
              type: "string",
              enum: ["x"],
              description: "Must be 'x'",
            },
            post_id: {
              type: "string",
              description: "The tweet ID from socials_get_feed results",
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
          "Advanced X search with full operator support. " +
          "User: from/to/retweets_of. Time: since/until (YYYY-MM-DD) or since_time/until_time (Unix). " +
          "Engagement: min_faves/min_retweets/min_replies. Content: filter (media/images/video/links), " +
          "has (links/hashtags/media), is_reply, is_retweet. Location: lang, near, place_country. " +
          "Modes: top (default), latest, people, photos, videos. " +
          "Query supports: #hashtags, @mentions, $cashtags, \"exact phrases\", -exclusions.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search text with optional #hashtags, @mentions, $cashtags, \"phrases\", -exclusions",
            },
            from: { type: "string", description: "Posts from user (without @)" },
            to: { type: "string", description: "Replies to user (without @)" },
            retweets_of: { type: "string", description: "Retweets of user's posts" },
            since: { type: "string", description: "Start date (YYYY-MM-DD)" },
            until: { type: "string", description: "End date (YYYY-MM-DD)" },
            since_time: { type: "number", description: "Start Unix timestamp" },
            until_time: { type: "number", description: "End Unix timestamp" },
            min_retweets: { type: "number", description: "Minimum retweets" },
            min_faves: { type: "number", description: "Minimum likes" },
            min_replies: { type: "number", description: "Minimum replies" },
            filter: {
              type: "string",
              enum: ["media", "images", "video", "links"],
              description: "Only posts with this content type",
            },
            has: {
              type: "array",
              items: { type: "string", enum: ["links", "hashtags", "media", "images", "video"] },
              description: "Must have these content types",
            },
            is_reply: { type: "boolean", description: "true=only replies, false=exclude replies" },
            is_retweet: { type: "boolean", description: "true=only retweets, false=exclude retweets" },
            lang: { type: "string", description: "Language code (en, es, ja, etc.)" },
            near: { type: "string", description: "Location name" },
            place: { type: "string", description: "Specific place ID" },
            place_country: { type: "string", description: "Country code (US, GB, etc.)" },
            list: { type: "string", description: "Posts from list members (list ID)" },
            conversation_id: { type: "string", description: "Posts in conversation thread" },
            mode: {
              type: "string",
              enum: ["top", "latest", "people", "photos", "videos"],
              description: "Results tab (default: top)",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "socials_x_profile",
        description:
          "Extract profile information from an X (Twitter) profile page. Must navigate to a profile URL first (e.g., https://x.com/username). " +
          "Returns name, handle, bio, location, website, join date, following/followers counts, verification status, and follow relationship.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "socials_x_notifications",
        description:
          "Get notifications from X (Twitter). Must navigate to https://x.com/notifications first. " +
          "Returns likes, follows, reposts, mentions with user info and timestamps.",
        inputSchema: {
          type: "object",
          properties: {
            count: {
              type: "number",
              description: "Number of notifications to retrieve (default 10, max 20)",
            },
          },
          required: [],
        },
      },
      {
        name: "socials_x_quote_tweet",
        description:
          "Quote tweet a post on X. Pass post_id (from socials_get_feed) and content (your quote text). " +
          "IMPORTANT: Always confirm with the user before posting.",
        inputSchema: {
          type: "object",
          properties: {
            post_id: {
              type: "string",
              description: "The tweet ID from socials_get_feed results",
            },
            content: {
              type: "string",
              description: "Your quote tweet text",
            },
            media: {
              type: "array",
              description: "Optional media to attach. Accepts local file paths or URLs. Max 4 images or 1 video/GIF.",
              items: {
                type: "object",
                properties: {
                  path: {
                    type: "string",
                    description: "Local file path or URL to the media file",
                  },
                  type: {
                    type: "string",
                    enum: ["image", "video", "gif"],
                    description: "Type of media",
                  },
                },
                required: ["path", "type"],
              },
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
          "Search for people on LinkedIn with filters. " +
          "Filters: network (1st/2nd/3rd connections), actively_hiring. " +
          "Use socials_linkedin_get_people to get results after search.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search keywords (e.g., 'software engineer')",
            },
            network: {
              type: "array",
              items: { type: "string", enum: ["1st", "2nd", "3rd"] },
              description: "Connection degree filter",
            },
            actively_hiring: {
              type: "boolean",
              description: "Filter to people who are actively hiring",
            },
          },
          required: [],
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
          "Send a LinkedIn connection request. Pass profile_url (e.g. 'https://linkedin.com/in/username'). " +
          "Auto-navigates to the profile. Returns status: already_connected, pending_sent, success, etc. " +
          "IMPORTANT: Always confirm with the user before sending.",
        inputSchema: {
          type: "object",
          properties: {
            profile_url: {
              type: "string",
              description: "LinkedIn profile URL, e.g. 'https://www.linkedin.com/in/satyanadella'",
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
          "Get a LinkedIn profile. Pass profile_url — auto-navigates and extracts name, headline, about, experience, education, skills, contact info.",
        inputSchema: {
          type: "object",
          properties: {
            profile_url: {
              type: "string",
              description: "LinkedIn profile URL, e.g. 'https://www.linkedin.com/in/satyanadella'",
            },
          },
          required: ["profile_url"],
        },
      },
      {
        name: "socials_linkedin_connection_status",
        description:
          "Check connection status with a LinkedIn user (read-only, no request sent). Returns: connected, pending_sent, not_connected, etc.",
        inputSchema: {
          type: "object",
          properties: {
            profile_url: {
              type: "string",
              description: "LinkedIn profile URL, e.g. 'https://www.linkedin.com/in/satyanadella'",
            },
          },
          required: ["profile_url"],
        },
      },
      {
        name: "socials_linkedin_engage",
        description:
          "Engage with a LinkedIn post. Pass post_id from socials_get_feed. " +
          "Actions: like (toggle), repost, quote_repost. " +
          "IMPORTANT: Only use when the user explicitly wants these actions.",
        inputSchema: {
          type: "object",
          properties: {
            post_id: {
              type: "string",
              description: "The post ID from socials_get_feed results",
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
      // Connection health and extension control tools
      {
        name: "socials_health_check",
        description:
          "Check the health of the connection to the Socials extension. " +
          "Returns ping latency, consecutive failures, and time since last successful ping. " +
          "Use this to detect if the extension has disconnected mid-session.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "socials_refresh_auth",
        description:
          "RECOVERY STEP 1: Restore authentication when connected but auth fails. " +
          "Uses device-based auth if device was previously registered (works even when logged out). " +
          "Auto-registers device for future sessions if user is logged in. " +
          "If this fails, proceed to socials_restart_bridge (step 2).",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "socials_restart_bridge",
        description:
          "RECOVERY STEP 2: Restart the WebSocket bridge when refresh_auth fails or connection is stuck. " +
          "Use when socials_check_access shows ws_server_listening=false or connected=false. " +
          "Kills stale processes on port 9847 and restarts WS server. " +
          "AFTER THIS: User must refresh Socials extension in browser, then retry socials_check_access.",
        inputSchema: {
          type: "object",
          properties: {},
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
                    "WS bridge not listening. RECOVERY: " +
                    "1) Call socials_restart_bridge to restart the bridge " +
                    "2) Refresh Socials extension in browser " +
                    "3) Retry socials_check_access",
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
                    "Extension not connected. RECOVERY: " +
                    "1) Ensure Socials extension is installed and enabled " +
                    "2) Refresh/reload the extension in browser " +
                    "3) If still fails: socials_restart_bridge → refresh extension → retry",
                }),
              },
            ],
          };
        }

        let accessResult: { isPro: boolean; tier: string; canUseMcp: boolean; device_registered?: boolean };
        let refreshed = false;

        try {
          accessResult = await bridge.checkProAccess();
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          // If not logged in, try device-based auth refresh automatically
          if (errorMsg.toLowerCase().includes("not logged in") || errorMsg.toLowerCase().includes("user not")) {
            try {
              const refreshResult = await bridge.refreshAuth();
              if (refreshResult.success) {
                refreshed = true;
                // Retry checkProAccess after successful refresh
                accessResult = await bridge.checkProAccess();
              } else {
                throw new Error(refreshResult.error || "Auth refresh failed");
              }
            } catch (refreshError) {
              throw new Error(`Not logged in and auto-refresh failed: ${refreshError instanceof Error ? refreshError.message : refreshError}`);
            }
          } else {
            throw error;
          }
        }

        const { isPro, tier, canUseMcp, device_registered } = accessResult;

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
                device_registered,
                auto_refreshed: refreshed || undefined,
                message: canUseMcp
                  ? isPro
                    ? (refreshed ? "Session restored via device auth. " : "") + "Connected with Pro access. Ready to use all Socials tools."
                    : (refreshed ? "Session restored via device auth. " : "") + "Connected with MCP access (allowlisted). Ready to use all Socials tools."
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
                  verified: p.verified,
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

      // DISABLED: socials_generate_reply handler - temporarily commented out
      // case "socials_generate_reply": {
      //   await requireProAccess();
      //   const parsed = GenerateReplySchema.parse(args);
      //   const result = await bridge.generateReply(
      //     parsed.platform,
      //     parsed.post_content,
      //     parsed.post_author,
      //     parsed.persona_id,
      //     parsed.mood,
      //   );
      //
      //   // Track persona usage if specified
      //   if (result.metadata?.personaUsed) {
      //     trackPersonaUsed(parsed.persona_id || "default", result.metadata.personaUsed);
      //   }
      //
      //   // Track tool usage
      //   const elapsed = getElapsed();
      //   await trackToolUsage(name, parsed.platform, true, elapsed);
      //
      //   return {
      //     content: [
      //       {
      //         type: "text",
      //         text: JSON.stringify({
      //           success: true,
      //           generatedReply: result.content,
      //           metadata: result.metadata,
      //         }),
      //       },
      //     ],
      //   };
      // }

      case "socials_quick_reply": {
        await requireProAccess();
        const postId = resolvePostId(args as Record<string, unknown>);
        const content = resolveContent(args as Record<string, unknown>);
        const rawMedia = (args as { media?: Array<{ path: string; type: "image" | "video" | "gif" }> }).media;

        // Process media: convert local files to base64, keep URLs as-is (same as create_post)
        const processedMedia = rawMedia
          ? await Promise.all(
              rawMedia.map(async (item) => {
                // Normalize the path - strip file:// protocol if present
                let normalizedPath = item.path;
                if (normalizedPath.startsWith("file://")) {
                  normalizedPath = normalizedPath.slice(7);
                }

                const isUrl = normalizedPath.startsWith("http://") || normalizedPath.startsWith("https://");

                if (isUrl) {
                  return { url: normalizedPath, type: item.type };
                } else {
                  // Local file - read and convert to base64
                  const filePath = normalizedPath.startsWith("~")
                    ? normalizedPath.replace("~", process.env.HOME || "")
                    : normalizedPath;

                  if (!fs.existsSync(filePath)) {
                    throw new Error(`Media file not found: ${filePath}`);
                  }

                  const fileBuffer = fs.readFileSync(filePath);
                  const base64Data = fileBuffer.toString("base64");
                  const filename = path.basename(filePath);
                  const ext = path.extname(filePath).toLowerCase().slice(1);

                  const mimeTypes: Record<string, string> = {
                    jpg: "image/jpeg",
                    jpeg: "image/jpeg",
                    png: "image/png",
                    gif: "image/gif",
                    webp: "image/webp",
                    mp4: "video/mp4",
                    mov: "video/quicktime",
                    webm: "video/webm",
                  };
                  const mimeType = mimeTypes[ext] || "application/octet-stream";

                  return {
                    data: base64Data,
                    filename,
                    mimeType,
                    type: item.type,
                  };
                }
              })
            )
          : undefined;

        const result = await bridge.quickReply(postId, content, processedMedia);

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

        // Process media: convert local files to base64, keep URLs as-is
        const processedMedia = parsed.media
          ? await Promise.all(
              parsed.media.map(async (item) => {
                // Normalize the path - strip file:// protocol if present
                let normalizedPath = item.path;
                if (normalizedPath.startsWith("file://")) {
                  normalizedPath = normalizedPath.slice(7); // Remove "file://"
                }

                const isUrl = normalizedPath.startsWith("http://") || normalizedPath.startsWith("https://");

                if (isUrl) {
                  // URL - extension will fetch it
                  return { url: normalizedPath, type: item.type };
                } else {
                  // Local file - read and convert to base64
                  const filePath = normalizedPath.startsWith("~")
                    ? normalizedPath.replace("~", process.env.HOME || "")
                    : normalizedPath;

                  if (!fs.existsSync(filePath)) {
                    throw new Error(`Media file not found: ${filePath}. Make sure the file exists and the path is correct.`);
                  }

                  const fileBuffer = fs.readFileSync(filePath);
                  const base64Data = fileBuffer.toString("base64");
                  const filename = path.basename(filePath);
                  const ext = path.extname(filePath).toLowerCase().slice(1);

                  // Determine MIME type
                  const mimeTypes: Record<string, string> = {
                    jpg: "image/jpeg",
                    jpeg: "image/jpeg",
                    png: "image/png",
                    gif: "image/gif",
                    webp: "image/webp",
                    mp4: "video/mp4",
                    mov: "video/quicktime",
                    webm: "video/webm",
                  };
                  const mimeType = mimeTypes[ext] || "application/octet-stream";

                  return {
                    data: base64Data,
                    filename,
                    mimeType,
                    type: item.type,
                  };
                }
              })
            )
          : undefined;

        const result = await bridge.createPost({
          platform: parsed.platform,
          content: parsed.content,
          media: processedMedia,
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

        // Build advanced query string from parameters
        const queryParts: string[] = [parsed.query];

        // User filters
        if (parsed.from) queryParts.push(`from:${parsed.from}`);
        if (parsed.to) queryParts.push(`to:${parsed.to}`);
        if (parsed.retweets_of) queryParts.push(`retweets_of:${parsed.retweets_of}`);

        // Time filters
        if (parsed.since) queryParts.push(`since:${parsed.since}`);
        if (parsed.until) queryParts.push(`until:${parsed.until}`);
        if (parsed.since_time) queryParts.push(`since_time:${parsed.since_time}`);
        if (parsed.until_time) queryParts.push(`until_time:${parsed.until_time}`);

        // Engagement filters
        if (parsed.min_retweets) queryParts.push(`min_retweets:${parsed.min_retweets}`);
        if (parsed.min_faves) queryParts.push(`min_faves:${parsed.min_faves}`);
        if (parsed.min_replies) queryParts.push(`min_replies:${parsed.min_replies}`);

        // Content filters
        if (parsed.filter) queryParts.push(`filter:${parsed.filter}`);
        if (parsed.has) {
          for (const h of parsed.has) {
            queryParts.push(`has:${h}`);
          }
        }
        if (parsed.is_reply === true) queryParts.push(`is:reply`);
        if (parsed.is_reply === false) queryParts.push(`-is:reply`);
        if (parsed.is_retweet === true) queryParts.push(`is:retweet`);
        if (parsed.is_retweet === false) queryParts.push(`-is:retweet`);

        // Location filters
        if (parsed.lang) queryParts.push(`lang:${parsed.lang}`);
        if (parsed.near) queryParts.push(`near:"${parsed.near}"`);
        if (parsed.place) queryParts.push(`place:${parsed.place}`);
        if (parsed.place_country) queryParts.push(`place_country:${parsed.place_country}`);

        // Advanced filters
        if (parsed.list) queryParts.push(`list:${parsed.list}`);
        if (parsed.conversation_id) queryParts.push(`conversation_id:${parsed.conversation_id}`);

        const fullQuery = queryParts.join(" ");
        const result = await bridge.xSearch({ query: fullQuery, mode: parsed.mode });

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
                query: fullQuery,
                error: result.error,
              }),
            },
          ],
        };
      }

      case "socials_x_profile": {
        await requireProAccess();
        const result = await bridge.getXProfile();

        const elapsed = getElapsed();
        await trackToolUsage(name, "x", result.success, elapsed);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: result.success,
                profile: result.profile,
                error: result.error,
              }),
            },
          ],
        };
      }

      case "socials_x_notifications": {
        await requireProAccess();
        const count = (args as { count?: number }).count || 10;
        const result = await bridge.getXNotifications({ count });

        const elapsed = getElapsed();
        await trackToolUsage(name, "x", result.success, elapsed);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: result.success,
                notifications: result.notifications,
                count: result.notifications?.length || 0,
                scrolled: result.scrolled,
                message: result.message,
                error: result.error,
              }),
            },
          ],
        };
      }

      case "socials_x_quote_tweet": {
        await requireProAccess();
        const postId = resolvePostId(args as Record<string, unknown>);
        const content = resolveContent(args as Record<string, unknown>);
        const rawMedia = (args as { media?: Array<{ path: string; type: "image" | "video" | "gif" }> }).media;

        // Process media: convert local files to base64, keep URLs as-is (same as quick_reply)
        const processedMedia = rawMedia
          ? await Promise.all(
              rawMedia.map(async (item) => {
                // Normalize the path - strip file:// protocol if present
                let normalizedPath = item.path;
                if (normalizedPath.startsWith("file://")) {
                  normalizedPath = normalizedPath.slice(7);
                }

                const isUrl = normalizedPath.startsWith("http://") || normalizedPath.startsWith("https://");

                if (isUrl) {
                  return { url: normalizedPath, type: item.type };
                } else {
                  // Local file - read and convert to base64
                  const filePath = normalizedPath.startsWith("~")
                    ? normalizedPath.replace("~", process.env.HOME || "")
                    : normalizedPath;

                  if (!fs.existsSync(filePath)) {
                    throw new Error(`Media file not found: ${filePath}`);
                  }

                  const fileBuffer = fs.readFileSync(filePath);
                  const base64Data = fileBuffer.toString("base64");
                  const filename = path.basename(filePath);
                  const ext = path.extname(filePath).toLowerCase().slice(1);

                  const mimeTypes: Record<string, string> = {
                    jpg: "image/jpeg",
                    jpeg: "image/jpeg",
                    png: "image/png",
                    gif: "image/gif",
                    webp: "image/webp",
                    mp4: "video/mp4",
                    mov: "video/quicktime",
                    webm: "video/webm",
                  };
                  const mimeType = mimeTypes[ext] || "application/octet-stream";

                  return {
                    data: base64Data,
                    filename,
                    mimeType,
                    type: item.type,
                  };
                }
              })
            )
          : undefined;

        const result = await bridge.quoteTweet(postId, content, processedMedia);

        const elapsed = getElapsed();
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
        const parsed = LinkedInPeopleSearchSchema.parse(args);

        const result = await bridge.linkedinPeopleSearch({
          query: parsed.query,
          network: parsed.network,
          actively_hiring: parsed.actively_hiring,
        });

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
                  ? `Navigated to LinkedIn people search. Use socials_linkedin_get_people to get results.`
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
        const profileUrl = resolveProfileUrl(args as Record<string, unknown>);
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
        const profileUrl = resolveProfileUrl(args as Record<string, unknown>);
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
        const profileUrl = resolveProfileUrl(args as Record<string, unknown>);
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
        const postId = resolvePostId(args as Record<string, unknown>);
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
                version: "1.1.11",
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

      case "socials_health_check": {
        const connectionHealth = bridge.getConnectionHealth();
        const wsListening = bridge.isWsServerListening();
        await trackToolUsage(name, null, true, getElapsed());

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                connected: connectionHealth.connected,
                ws_server_listening: wsListening,
                consecutive_ping_failures: connectionHealth.consecutiveFailures,
                seconds_since_last_ping: connectionHealth.secondsSinceLastPing,
                last_ping_latency_ms: connectionHealth.lastPingLatencyMs,
                is_healthy: connectionHealth.healthy,
                message: connectionHealth.healthy
                  ? "Connection is healthy"
                  : connectionHealth.connected
                    ? `Connection may be degraded: ${connectionHealth.consecutiveFailures} consecutive ping failures`
                    : "Extension not connected",
              }),
            },
          ],
        };
      }

      case "socials_refresh_auth": {
        if (!bridge.isConnected()) {
          throw new Error("Extension not connected");
        }

        const result = await bridge.refreshAuth();
        await trackToolUsage(name, null, result.success, getElapsed());

        let message: string;
        if (result.success) {
          if (result.registered) {
            message = "Authentication successful. Device auto-registered for future sessions.";
          } else {
            message = "Authentication successful";
          }
        } else {
          message = result.action_required || result.error || "Failed to refresh authentication";
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: result.success,
                error: result.error,
                device_id: result.device_id,
                device_registered: result.registered,
                action_required: result.action_required,
                message,
              }),
            },
          ],
        };
      }

      case "socials_restart_bridge": {
        const result = await bridge.restart();
        await trackToolUsage(name, null, result.success, getElapsed());

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result),
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

    // Provide helpful hints for common errors - guide through recovery flow
    let hint = "";
    const lowerError = errorMessage.toLowerCase();
    if (lowerError.includes("not logged in") || lowerError.includes("auth") || lowerError.includes("session")) {
      hint = " RECOVERY: 1) socials_refresh_auth 2) if fails, socials_restart_bridge + refresh browser extension 3) socials_check_access.";
    } else if (lowerError.includes("not connected") || lowerError.includes("extension")) {
      hint = " RECOVERY: 1) socials_refresh_auth 2) if fails, socials_restart_bridge + refresh browser extension 3) socials_check_access.";
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: true,
            message: errorMessage + hint,
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

  // Initialize port config from feature flags before starting bridge
  await initPortConfig();

  // Start WebSocket bridge for extension communication
  try {
    await bridge.start();
    console.error("[socials-plugin] Extension bridge started");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[socials-plugin] Failed to start extension bridge:", msg);
    if (msg.includes("EADDRINUSE") || msg.includes("address already in use")) {
      const config = getCurrentPortConfig();
      const portEnd = config.portStart + config.portCount - 1;
      console.error(
        `[socials-plugin] All ports ${config.portStart}-${portEnd} are in use (often stale Socials MCP processes). ` +
          `Fix: quit duplicate Claude windows, or run \`lsof -nP -iTCP:${config.portStart} | grep LISTEN\` and kill that PID. ` +
          "Optional: set env SOCIALS_MCP_RECLAIM_PORT=1 on this MCP server to SIGTERM listeners before bind.",
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
