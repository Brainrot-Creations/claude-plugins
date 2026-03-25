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
export type ExtensionMessageType = "ping" | "check_pro_access" | "get_current_user" | "get_feed_posts" | "get_post_context" | "generate_reply" | "submit_reply" | "list_personas" | "get_settings" | "open_tab" | "navigate_to" | "get_active_tab" | "get_agent_tab" | "focus_agent_tab" | "set_agent_tab" | "reload_tab" | "close_tab" | "get_page_content" | "quick_reply" | "create_post" | "engage_post" | "x_search" | "scroll_page";
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
}
export type EngageActionType = "like" | "repost" | "bookmark" | "share";
/** Like / repost / bookmark / share on a visible X post by tweet id. */
export interface EngagePostPayload {
    platform: "x";
    postId: string;
    actions: EngageActionType[];
}
/** Run X top-nav search (Explore / search results). */
export interface XSearchPayload {
    query: string;
}
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
    urls?: Array<{
        url: string;
        type?: string;
    }>;
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
//# sourceMappingURL=types.d.ts.map