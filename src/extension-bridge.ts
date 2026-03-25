import { execFileSync } from "child_process";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
import type {
  ExtensionMessage,
  ExtensionResponse,
  ExtensionMessageType,
  UserInfo,
  FeedPost,
  PostContext,
  PersonaInfo,
  GenerateResult,
  GetFeedPostsPayload,
  GetPostContextPayload,
  GenerateReplyPayload,
  SubmitReplyPayload,
  CreatePostPayload,
  EngagePostPayload,
  EngageActionType,
} from "./types.js";

const BRIDGE_PORT = 9847; // Port for extension to connect to
const BRIDGE_HOST = "127.0.0.1" as const; // IPv4 only — avoids :: vs localhost mismatch and some EADDRINUSE cases
const PING_INTERVAL = 30000; // 30 seconds
const REQUEST_TIMEOUT = 60000; // 60 seconds for generation requests

/** Optional: set SOCIALS_MCP_RECLAIM_PORT=1 to SIGTERM listeners on BRIDGE_PORT before bind (stale Socials MCP server). */
function tryReclaimBridgePort(port: number): void {
  if (process.env.SOCIALS_MCP_RECLAIM_PORT !== "1") return;
  try {
    const out = execFileSync("lsof", ["-t", "-i", `TCP:${port}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    for (const pid of out.split("\n").filter(Boolean)) {
      try {
        process.kill(Number(pid), "SIGTERM");
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* no listeners */
  }
}

export class ExtensionBridge {
  private wss: WebSocketServer | null = null;
  /** True after the WebSocket server has bound to BRIDGE_PORT (extension can dial in). */
  private wsServerListening = false;
  private client: WebSocket | null = null;
  private pendingRequests = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();
  private pingInterval: NodeJS.Timeout | null = null;

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wsServerListening = false;
        tryReclaimBridgePort(BRIDGE_PORT);
        this.wss = new WebSocketServer({
          port: BRIDGE_PORT,
          host: BRIDGE_HOST,
        });

        this.wss.on("listening", () => {
          this.wsServerListening = true;
          console.error(
            `[ExtensionBridge] WebSocket server listening on ${BRIDGE_HOST}:${BRIDGE_PORT} (extension must use ws://127.0.0.1:${BRIDGE_PORT})`
          );
          resolve();
        });

        this.wss.on("connection", (ws) => {
          console.error("[ExtensionBridge] ✓ Extension connected!");

          // Only allow one client at a time
          if (this.client) {
            console.error("[ExtensionBridge] Closing existing connection");
            this.client.close();
          }

          this.client = ws;

          ws.on("message", (data) => {
            this.handleMessage(data.toString());
          });

          ws.on("close", () => {
            console.error("[ExtensionBridge] Extension disconnected");
            if (this.client === ws) {
              this.client = null;
            }
          });

          ws.on("error", (error) => {
            console.error("[ExtensionBridge] WebSocket error:", error.message);
          });

          // Start ping interval
          this.startPingInterval();
        });

        this.wss.on("error", (error) => {
          this.wsServerListening = false;
          const hint =
            (error as NodeJS.ErrnoException).code === "EADDRINUSE"
              ? ` Port ${BRIDGE_PORT} is in use. Quit duplicate Claude/MCP instances, or run: lsof -nP -iTCP:${BRIDGE_PORT} | grep LISTEN — then kill that PID. Or set SOCIALS_MCP_RECLAIM_PORT=1 in MCP env to reclaim the port (use with care).`
              : "";
          console.error("[ExtensionBridge] Server error:", error.message + hint);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  private startPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    this.pingInterval = setInterval(() => {
      if (this.client?.readyState === WebSocket.OPEN) {
        this.sendRequest("ping", undefined).catch(() => {
          // Ping failed, connection may be dead
        });
      }
    }, PING_INTERVAL);
  }

  private handleMessage(data: string): void {
    try {
      const response: ExtensionResponse = JSON.parse(data);

      const pending = this.pendingRequests.get(response.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(response.id);

        if (response.success) {
          pending.resolve(response.data);
        } else {
          pending.reject(new Error(response.error || "Unknown error"));
        }
      }
    } catch (error) {
      console.error("[ExtensionBridge] Failed to parse message:", error);
    }
  }

  private sendRequest<T>(type: ExtensionMessageType, payload: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.client || this.client.readyState !== WebSocket.OPEN) {
        reject(new Error("Extension not connected. Please open the Socials extension in your browser."));
        return;
      }

      const id = randomUUID();
      const message: ExtensionMessage = { id, type, payload };

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error("Request timed out"));
      }, REQUEST_TIMEOUT);

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      });

      this.client.send(JSON.stringify(message));
    });
  }

  isConnected(): boolean {
    return this.client?.readyState === WebSocket.OPEN;
  }

  /** Whether the MCP process is listening for the browser extension on BRIDGE_PORT. */
  isWsServerListening(): boolean {
    return this.wsServerListening;
  }

  async checkProAccess(): Promise<{ isPro: boolean; tier: string; canUseMcp: boolean }> {
    const result = await this.sendRequest<UserInfo>("check_pro_access", undefined);
    const { isPro, tier, canUseMcp } = result.subscription;
    return {
      isPro,
      tier,
      canUseMcp: canUseMcp ?? isPro,
    };
  }

  async getCurrentUser(): Promise<UserInfo> {
    return this.sendRequest<UserInfo>("get_current_user", undefined);
  }

  async getFeedPosts(platform: string, count = 10): Promise<FeedPost[]> {
    const payload: GetFeedPostsPayload = {
      platform: platform as "x" | "linkedin" | "reddit",
      count,
    };
    return this.sendRequest<FeedPost[]>("get_feed_posts", payload);
  }

  async getPostContext(platform: string, postUrl: string): Promise<PostContext> {
    const payload: GetPostContextPayload = {
      platform: platform as "x" | "linkedin" | "reddit",
      postUrl,
    };
    return this.sendRequest<PostContext>("get_post_context", payload);
  }

  async generateReply(
    platform: string,
    postContent: string,
    postAuthor: string,
    personaId?: string,
    mood?: string
  ): Promise<GenerateResult> {
    const payload: GenerateReplyPayload = {
      platform: platform as "x" | "linkedin" | "reddit",
      postContent,
      postAuthor,
      personaId,
      mood,
    };
    return this.sendRequest<GenerateResult>("generate_reply", payload);
  }

  async submitReply(
    platform: string,
    postUrl: string,
    replyContent: string
  ): Promise<{ success: boolean; postedUrl?: string }> {
    const payload: SubmitReplyPayload = {
      platform: platform as "x" | "linkedin" | "reddit",
      postUrl,
      replyContent,
    };
    return this.sendRequest<{ success: boolean; postedUrl?: string }>("submit_reply", payload);
  }

  async listPersonas(): Promise<PersonaInfo[]> {
    return this.sendRequest<PersonaInfo[]>("list_personas", undefined);
  }

  async getSettings(): Promise<{ mood: string; personaId: string; autoGenerate: boolean }> {
    return this.sendRequest<{ mood: string; personaId: string; autoGenerate: boolean }>(
      "get_settings",
      undefined
    );
  }

  // Browser control methods
  async openTab(
    url: string,
    focus?: boolean
  ): Promise<{ tabId: number; url: string; windowId: number; agentTabPinned: boolean }> {
    return this.sendRequest<{ tabId: number; url: string; windowId: number; agentTabPinned: boolean }>(
      "open_tab",
      { url, focus }
    );
  }

  async getAgentTab(): Promise<{
    tabId: number;
    url: string;
    title: string;
    platform: string | null;
  } | null> {
    return this.sendRequest<{
      tabId: number;
      url: string;
      title: string;
      platform: string | null;
    } | null>("get_agent_tab", undefined);
  }

  async focusAgentTab(): Promise<{ tabId: number; url: string; title: string }> {
    return this.sendRequest<{ tabId: number; url: string; title: string }>(
      "focus_agent_tab",
      undefined
    );
  }

  async setAgentTab(tabId: number): Promise<{ tabId: number; url: string; title: string }> {
    return this.sendRequest<{ tabId: number; url: string; title: string }>("set_agent_tab", {
      tabId,
    });
  }

  async navigateTo(url: string, tabId?: number): Promise<{ tabId: number; url: string }> {
    return this.sendRequest<{ tabId: number; url: string }>("navigate_to", { url, tabId });
  }

  async getActiveTab(): Promise<{ tabId: number; url: string; title: string; platform: string | null }> {
    return this.sendRequest<{ tabId: number; url: string; title: string; platform: string | null }>(
      "get_active_tab",
      undefined
    );
  }

  async reloadTab(tabId?: number): Promise<{ success: boolean }> {
    return this.sendRequest<{ success: boolean }>("reload_tab", { tabId });
  }

  async getPageContent(tabId?: number): Promise<{
    url: string;
    title: string;
    platform: string | null;
    posts: unknown[];
  }> {
    return this.sendRequest<{
      url: string;
      title: string;
      platform: string | null;
      posts: unknown[];
    }>("get_page_content", { tabId });
  }

  async quickReply(postId: string, content: string): Promise<{ success: boolean; error?: string }> {
    return this.sendRequest<{ success: boolean; error?: string }>("quick_reply", { postId, content });
  }

  async createPost(payload: CreatePostPayload): Promise<{ success: boolean; error?: string }> {
    return this.sendRequest<{ success: boolean; error?: string }>("create_post", payload);
  }

  async engagePost(payload: EngagePostPayload): Promise<{
    success: boolean;
    results?: Partial<Record<EngageActionType, boolean>>;
    error?: string;
  }> {
    return this.sendRequest<{
      success: boolean;
      results?: Partial<Record<EngageActionType, boolean>>;
      error?: string;
    }>("engage_post", payload);
  }

  async xSearch(payload: { query: string }): Promise<{
    success: boolean;
    url?: string;
    error?: string;
  }> {
    return this.sendRequest<{ success: boolean; url?: string; error?: string }>(
      "x_search",
      payload
    );
  }

  async scrollPage(direction: string, amount: number): Promise<{ success: boolean }> {
    return this.sendRequest<{ success: boolean }>("scroll_page", { direction, amount });
  }

  // LinkedIn People Search methods
  async linkedinPeopleSearch(query: string): Promise<{
    success: boolean;
    url?: string;
    error?: string;
  }> {
    return this.sendRequest<{ success: boolean; url?: string; error?: string }>(
      "linkedin_people_search",
      { query }
    );
  }

  async linkedinGetPeople(count: number): Promise<{
    success: boolean;
    people?: Array<{
      name: string;
      headline: string;
      location: string;
      profileUrl: string;
      imageUrl?: string;
      connectionDegree?: string;
      currentPosition?: string;
    }>;
    pagination?: {
      currentPage: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
    error?: string;
  }> {
    return this.sendRequest<{
      success: boolean;
      people?: Array<{
        name: string;
        headline: string;
        location: string;
        profileUrl: string;
        imageUrl?: string;
        connectionDegree?: string;
        currentPosition?: string;
      }>;
      pagination?: {
        currentPage: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
      };
      error?: string;
    }>("linkedin_get_people", { count });
  }

  async linkedinConnect(
    profileUrl: string,
    note?: string
  ): Promise<{ success: boolean; error?: string }> {
    return this.sendRequest<{ success: boolean; error?: string }>(
      "linkedin_connect",
      { profileUrl, note }
    );
  }

  async linkedinNextPage(): Promise<{
    success: boolean;
    currentPage?: number;
    error?: string;
  }> {
    return this.sendRequest<{
      success: boolean;
      currentPage?: number;
      error?: string;
    }>("linkedin_next_page", {});
  }

  async linkedinGoToPage(page: number): Promise<{
    success: boolean;
    currentPage?: number;
    error?: string;
  }> {
    return this.sendRequest<{
      success: boolean;
      currentPage?: number;
      error?: string;
    }>("linkedin_go_to_page", { page });
  }

  stop(): void {
    this.wsServerListening = false;
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Bridge shutting down"));
    }
    this.pendingRequests.clear();

    if (this.client) {
      this.client.close();
      this.client = null;
    }

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }
}
