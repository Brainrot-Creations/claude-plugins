import type { UserInfo, FeedPost, PostContext, PersonaInfo, GenerateResult } from "./types.js";
export declare class ExtensionBridge {
    private wss;
    /** True after the WebSocket server has bound to BRIDGE_PORT (extension can dial in). */
    private wsServerListening;
    private client;
    private pendingRequests;
    private pingInterval;
    start(): Promise<void>;
    private startPingInterval;
    private handleMessage;
    private sendRequest;
    isConnected(): boolean;
    /** Whether the MCP process is listening for the browser extension on BRIDGE_PORT. */
    isWsServerListening(): boolean;
    checkProAccess(): Promise<{
        isPro: boolean;
        tier: string;
    }>;
    getCurrentUser(): Promise<UserInfo>;
    getFeedPosts(platform: string, count?: number): Promise<FeedPost[]>;
    getPostContext(platform: string, postUrl: string): Promise<PostContext>;
    generateReply(platform: string, postContent: string, postAuthor: string, personaId?: string, mood?: string): Promise<GenerateResult>;
    submitReply(platform: string, postUrl: string, replyContent: string): Promise<{
        success: boolean;
        postedUrl?: string;
    }>;
    listPersonas(): Promise<PersonaInfo[]>;
    getSettings(): Promise<{
        mood: string;
        personaId: string;
        autoGenerate: boolean;
    }>;
    openTab(url: string): Promise<{
        tabId: number;
        url: string;
        windowId: number;
    }>;
    navigateTo(url: string, tabId?: number): Promise<{
        tabId: number;
        url: string;
    }>;
    getActiveTab(): Promise<{
        tabId: number;
        url: string;
        title: string;
        platform: string | null;
    }>;
    reloadTab(tabId?: number): Promise<{
        success: boolean;
    }>;
    getPageContent(tabId?: number): Promise<{
        url: string;
        title: string;
        platform: string | null;
        posts: unknown[];
    }>;
    quickReply(postId: string, content: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    scrollPage(direction: string, amount: number): Promise<{
        success: boolean;
    }>;
    stop(): void;
}
//# sourceMappingURL=extension-bridge.d.ts.map