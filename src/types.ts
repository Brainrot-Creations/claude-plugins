// Types shared between MCP server and browser extension

export type PlatformType = "x" | "linkedin" | "reddit";

export interface ExtensionMessage {
  id: string;
  type: ExtensionMessageType;
  payload?: unknown;
}

export interface ExtensionResponse {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export type ExtensionMessageType =
  | "ping"
  | "check_pro_access"
  | "get_current_user"
  | "get_feed_posts"
  | "get_post_context"
  | "generate_reply"
  | "submit_reply"
  | "list_personas"
  | "get_settings"
  // Browser control
  | "open_tab"
  | "navigate_to"
  | "get_active_tab"
  | "get_agent_tab"
  | "focus_agent_tab"
  | "set_agent_tab"
  | "reload_tab"
  | "close_tab"
  | "get_page_content"
  | "quick_reply"
  | "create_post"
  | "engage_post"
  | "x_search"
  | "scroll_page"
  // LinkedIn People Search
  | "linkedin_people_search"
  | "linkedin_get_people"
  | "linkedin_connect"
  | "linkedin_next_page"
  | "linkedin_go_to_page"
  // LinkedIn Profile
  | "linkedin_get_profile"
  | "linkedin_profile_connect"
  // LinkedIn Engagement
  | "linkedin_engage_post"
  // LinkedIn Search
  | "linkedin_posts_search"
  // Unified LinkedIn Tools (v2 - intent-oriented)
  | "linkedin_connect_v2"
  | "linkedin_profile_v2"
  | "linkedin_connection_status"
  | "linkedin_engage_v2"
  | "linkedin_create_post";

// Payloads for each message type
export interface GetFeedPostsPayload {
  platform: PlatformType;
  count?: number;
}

export interface GetPostContextPayload {
  platform: PlatformType;
  postUrl: string;
}

export interface GenerateReplyPayload {
  platform: PlatformType;
  postContent: string;
  postAuthor: string;
  personaId?: string;
  mood?: string;
}

export interface SubmitReplyPayload {
  platform: PlatformType;
  postUrl: string;
  replyContent: string;
}

/** New original post (currently X only; extension validates tab). */
export interface CreatePostPayload {
  platform: "x";
  content: string;
  /** Optional media attachments (images, videos, GIFs). */
  media?: Array<{
    /** URL to the media file OR local file path (will be read and converted to base64) */
    url?: string;
    /** Base64-encoded file data (set by MCP server when reading local files) */
    data?: string;
    /** Original filename */
    filename?: string;
    /** MIME type */
    mimeType?: string;
    /** Media type hint */
    type: "image" | "video" | "gif";
  }>;
}

export type EngageActionType = "like" | "repost" | "bookmark" | "share";

/** Like / repost / bookmark / share on a visible X post by tweet id. */
export interface EngagePostPayload {
  platform: "x";
  postId: string;
  actions: EngageActionType[];
}

export type LinkedInEngageActionType = "like" | "repost" | "quote_repost";

/** Like / repost / quote_repost on a visible LinkedIn post by post id/urn. */
export interface LinkedInEngagePostPayload {
  platform: "linkedin";
  postId: string;
  actions: LinkedInEngageActionType[];
}

/** Run X top-nav search (Explore / search results). */
export interface XSearchPayload {
  query: string;
}

// Response data types
export interface UserInfo {
  id: string;
  email?: string;
  subscription: {
    tier: string;
    isActive: boolean;
    isPro: boolean;
    /** When true, MCP tools are allowed (paid plan or PostHog allowlist for free tier). */
    canUseMcp?: boolean;
  };
}

export interface FeedPost {
  id: string;
  url: string;
  author: {
    name: string;
    handle: string;
    isVerified?: boolean;
  };
  content: string;
  /** LinkedIn uses 'text' instead of 'content' */
  text?: string;
  timestamp: string;
  engagement?: {
    likes?: number;
    replies?: number;
    reposts?: number;
  };
  /** Whether this is the focused/main post being replied to */
  isFocused?: boolean;
  /** URLs extracted from post content */
  urls?: Array<{ url: string; type?: string }>;
}

export interface PostContext {
  mainPost: FeedPost;
  replies?: FeedPost[];
  quotedPost?: FeedPost;
  /** Thread context for LinkedIn - the original post when replying to a comment */
  threadContext?: FeedPost[];
  /** Who we're replying to (LinkedIn comment replies) */
  replyingTo?: {
    handle: string;
    name: string;
  };
  /** Context type: feed (main timeline) or thread (comment thread) */
  contextType?: "feed" | "thread";
}

export interface PersonaInfo {
  id: string;
  name: string;
  shortName: string;
  description: string;
  isUserCreated: boolean;
}

export interface GenerateResult {
  content: string;
  metadata?: {
    personaUsed: string;
    characterCount: number;
  };
}

/** LinkedIn profile information extracted from a profile page */
export interface LinkedInProfile {
  name: string;
  headline: string;
  location?: string;
  profileUrl: string;
  connectionDegree?: string;
  followers?: string;
  connections?: string;
  about?: string;
  isPremium?: boolean;
  isVerified?: boolean;
  profileImageUrl?: string;
  currentRole?: {
    title: string;
    company: string;
    duration?: string;
    location?: string;
  };
  experiences?: Array<{
    title: string;
    company: string;
    duration?: string;
    location?: string;
    description?: string;
  }>;
  education?: Array<{
    school: string;
    degree?: string;
    years?: string;
  }>;
  skills?: string[];
}

// ============ V2 Intent-Oriented Types ============

/** Connection status on LinkedIn */
export type LinkedInConnectionStatus =
  | "connected"
  | "pending_sent"
  | "pending_received"
  | "not_connected"
  | "follow_only"
  | "unknown";

/** Rich error response for better diagnostics */
export interface LinkedInActionResult {
  success: boolean;
  error_code?:
    | "already_connected"
    | "pending_sent"
    | "pending_received"
    | "follow_only"
    | "button_not_found"
    | "navigation_failed"
    | "timeout"
    | "rate_limited"
    | "unknown";
  error?: string;
  status?: LinkedInConnectionStatus;
  actions_available?: string[];
  data?: unknown;
}

/** Unified connect payload - handles navigation internally */
export interface LinkedInConnectV2Payload {
  profile_url: string;
  note?: string;
}

/** Unified profile payload - navigates and extracts in one call */
export interface LinkedInProfileV2Payload {
  profile_url: string;
}

/** Connection status query payload */
export interface LinkedInConnectionStatusPayload {
  profile_url: string;
}

/** Unified engage payload - accepts URL, handles navigation */
export interface LinkedInEngageV2Payload {
  post_url: string;
  actions: LinkedInEngageActionType[];
}

/** LinkedIn create post payload */
export interface LinkedInCreatePostPayload {
  content: string;
}
