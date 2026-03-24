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
  | "reload_tab"
  | "close_tab"
  | "get_page_content"
  | "quick_reply"
  | "scroll_page";

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

// Response data types
export interface UserInfo {
  id: string;
  email?: string;
  subscription: {
    tier: string;
    isActive: boolean;
    isPro: boolean;
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
  timestamp: string;
  engagement?: {
    likes?: number;
    replies?: number;
    reposts?: number;
  };
}

export interface PostContext {
  mainPost: FeedPost;
  replies?: FeedPost[];
  quotedPost?: FeedPost;
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
