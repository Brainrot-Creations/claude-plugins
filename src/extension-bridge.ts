import { execFileSync } from "child_process";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
import { trackExtensionDisconnected, clearUserIdentity, recordExtensionLatency, getPortConfig, type PortConfig } from "./analytics.js";
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
  LinkedInEngagePostPayload,
  LinkedInEngageActionType,
  LinkedInActionResult,
  LinkedInConnectionStatus,
  LinkedInProfile,
} from "./types.js";

// Default port range (can be overridden by feature flag)
const DEFAULT_PORT_START = 9847;
const DEFAULT_PORT_COUNT = 10;
const BRIDGE_HOST = "127.0.0.1" as const; // IPv4 only — avoids :: vs localhost mismatch and some EADDRINUSE cases
const PING_INTERVAL = 30000; // 30 seconds
const REQUEST_TIMEOUT = 60000; // 60 seconds for generation requests
const MAX_PING_FAILURES = 3; // Disconnect after 3 consecutive ping failures
const HEALTH_CHECK_TIMEOUT = 5000; // 5 seconds for health check ping

// Runtime port config (populated from feature flags at startup)
let portConfig: PortConfig = { portStart: DEFAULT_PORT_START, portCount: DEFAULT_PORT_COUNT };

/** Initialize port config from feature flags (with 5s timeout) */
export async function initPortConfig(): Promise<PortConfig> {
  try {
    // Add timeout to prevent hanging on slow PostHog fetch
    const timeoutPromise = new Promise<PortConfig>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), 5000)
    );
    portConfig = await Promise.race([getPortConfig(), timeoutPromise]);
    console.log(`[ExtensionBridge] Port config: ${portConfig.portStart}-${portConfig.portStart + portConfig.portCount - 1} (${portConfig.portCount} ports)`);
  } catch {
    console.log(`[ExtensionBridge] Using default port config: ${DEFAULT_PORT_START}-${DEFAULT_PORT_START + DEFAULT_PORT_COUNT - 1}`);
  }
  return portConfig;
}

/** Get current port config */
export function getCurrentPortConfig(): PortConfig {
  return portConfig;
}

/** Check if a port is available */
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const net = require("net");
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close();
      resolve(true);
    });
    server.listen(port, BRIDGE_HOST);
  });
}

/** Find first available port in range */
async function findAvailablePort(): Promise<number> {
  // Check if user specified a port via env var
  const envPort = process.env.SOCIALS_MCP_PORT;
  if (envPort) {
    const port = parseInt(envPort, 10);
    if (!isNaN(port) && port > 0 && port < 65536) {
      return port; // Use specified port, even if taken (will error later)
    }
  }

  // Use config from feature flags
  const portEnd = portConfig.portStart + portConfig.portCount - 1;

  // Auto-find available port in range
  for (let port = portConfig.portStart; port <= portEnd; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available ports in range ${portConfig.portStart}-${portEnd}. Close some MCP instances.`);
}

export class ExtensionBridge {
  private wss: WebSocketServer | null = null;
  /** True after the WebSocket server has bound to a port (extension can dial in). */
  private wsServerListening = false;
  /** The port we're actually listening on */
  private activePort: number = 0;
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
  private consecutivePingFailures = 0;
  private lastSuccessfulPing: number | null = null;
  private lastPingLatencyMs: number | null = null;

  async start(): Promise<void> {
    // Find available port first
    const port = await findAvailablePort();
    this.activePort = port;

    return new Promise((resolve, reject) => {
      try {
        this.wsServerListening = false;
        this.wss = new WebSocketServer({
          port: port,
          host: BRIDGE_HOST,
        });

        this.wss.on("listening", () => {
          this.wsServerListening = true;
          const portEnd = portConfig.portStart + portConfig.portCount - 1;
          console.error(
            `[ExtensionBridge] WebSocket server listening on ${BRIDGE_HOST}:${port} (extension scans ports ${portConfig.portStart}-${portEnd})`
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
              // Track disconnection and clear user identity
              trackExtensionDisconnected();
              clearUserIdentity();
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
              ? ` Port ${port} is in use (should not happen with auto-discovery). Try setting SOCIALS_MCP_PORT env var to a specific port.`
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

    // Reset counters on new connection
    this.consecutivePingFailures = 0;
    this.lastSuccessfulPing = Date.now();

    this.pingInterval = setInterval(() => {
      if (this.client?.readyState === WebSocket.OPEN) {
        const pingStart = Date.now();
        this.sendRequest("ping", undefined)
          .then(() => {
            // Record latency on successful ping
            const latency = Date.now() - pingStart;
            this.lastPingLatencyMs = latency;
            this.lastSuccessfulPing = Date.now();
            this.consecutivePingFailures = 0;
            recordExtensionLatency(latency);
          })
          .catch((error) => {
            // Ping failed, increment failure counter
            this.consecutivePingFailures++;
            console.error(
              `[ExtensionBridge] Ping failed (${this.consecutivePingFailures}/${MAX_PING_FAILURES}):`,
              error.message
            );

            // After MAX_PING_FAILURES consecutive failures, consider connection dead
            if (this.consecutivePingFailures >= MAX_PING_FAILURES) {
              console.error(
                `[ExtensionBridge] Connection presumed dead after ${MAX_PING_FAILURES} failed pings. Closing.`
              );
              if (this.client) {
                this.client.close();
                this.client = null;
                trackExtensionDisconnected();
                clearUserIdentity();
              }
            }
          });
      }
    }, PING_INTERVAL);
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      // Check if this is a keepalive request from the extension (has type field)
      if (message.type === "keepalive" && message.id) {
        // Respond to keepalive to confirm we're alive
        if (this.client?.readyState === WebSocket.OPEN) {
          this.client.send(JSON.stringify({
            id: message.id,
            success: true,
            data: { ack: true, serverTimestamp: Date.now() }
          }));
        }
        // Reset ping failure counters since extension is clearly alive
        this.consecutivePingFailures = 0;
        this.lastSuccessfulPing = Date.now();
        return;
      }

      // Otherwise treat as response to a pending request
      const response: ExtensionResponse = message;
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

  /**
   * Get detailed connection health status.
   * Use this to detect stale connections before long-running operations.
   */
  getConnectionHealth(): {
    connected: boolean;
    consecutiveFailures: number;
    lastSuccessfulPingMs: number | null;
    lastPingLatencyMs: number | null;
    secondsSinceLastPing: number | null;
    healthy: boolean;
  } {
    const now = Date.now();
    const secondsSinceLastPing = this.lastSuccessfulPing
      ? Math.round((now - this.lastSuccessfulPing) / 1000)
      : null;

    // Consider healthy if: connected, no recent failures, and pinged within 2 intervals
    const maxHealthyAge = PING_INTERVAL * 2.5;
    const healthy =
      this.isConnected() &&
      this.consecutivePingFailures === 0 &&
      this.lastSuccessfulPing !== null &&
      now - this.lastSuccessfulPing < maxHealthyAge;

    return {
      connected: this.isConnected(),
      consecutiveFailures: this.consecutivePingFailures,
      lastSuccessfulPingMs: this.lastSuccessfulPing,
      lastPingLatencyMs: this.lastPingLatencyMs,
      secondsSinceLastPing,
      healthy,
    };
  }

  /**
   * Perform an immediate health check ping.
   * Returns true if extension responds within HEALTH_CHECK_TIMEOUT.
   */
  async healthCheckPing(): Promise<{ healthy: boolean; latencyMs?: number; error?: string }> {
    if (!this.isConnected()) {
      return { healthy: false, error: "Not connected" };
    }

    const pingStart = Date.now();
    try {
      await Promise.race([
        this.sendRequest("ping", undefined),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Health check timeout")), HEALTH_CHECK_TIMEOUT)
        ),
      ]);
      const latencyMs = Date.now() - pingStart;
      this.lastPingLatencyMs = latencyMs;
      this.lastSuccessfulPing = Date.now();
      this.consecutivePingFailures = 0;
      recordExtensionLatency(latencyMs);
      return { healthy: true, latencyMs };
    } catch (error) {
      this.consecutivePingFailures++;
      return {
        healthy: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Trigger a token refresh / re-authentication in the extension.
   * Uses device-based auth if device is registered.
   * Auto-registers device if user has a session but device isn't registered yet.
   */
  async refreshAuth(): Promise<{ success: boolean; error?: string; action_required?: string; device_id?: string; registered?: boolean }> {
    return this.sendRequest<{ success: boolean; error?: string; action_required?: string; device_id?: string; registered?: boolean }>("refresh_auth", undefined);
  }

  async checkProAccess(): Promise<{ isPro: boolean; tier: string; canUseMcp: boolean; device_registered?: boolean }> {
    const result = await this.sendRequest<UserInfo & { device_registered?: boolean }>("check_pro_access", undefined);
    const { isPro, tier, canUseMcp } = result.subscription;
    return {
      isPro,
      tier,
      canUseMcp: canUseMcp ?? isPro,
      device_registered: result.device_registered,
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

  async quickReply(
    postId: string,
    content: string,
    media?: Array<{
      url?: string;
      data?: string;
      filename?: string;
      mimeType?: string;
      type: "image" | "video" | "gif";
    }>
  ): Promise<{ success: boolean; error?: string }> {
    return this.sendRequest<{ success: boolean; error?: string }>("quick_reply", { postId, content, media });
  }

  async quoteTweet(
    postId: string,
    content: string,
    media?: Array<{
      url?: string;
      data?: string;
      filename?: string;
      mimeType?: string;
      type: "image" | "video" | "gif";
    }>
  ): Promise<{ success: boolean; error?: string }> {
    return this.sendRequest<{ success: boolean; error?: string }>("quote_tweet", { postId, content, media });
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

  async xSearch(payload: { query: string; mode?: string }): Promise<{
    success: boolean;
    url?: string;
    error?: string;
  }> {
    return this.sendRequest<{ success: boolean; url?: string; error?: string }>(
      "x_search",
      payload
    );
  }

  async getXProfile(): Promise<{
    success: boolean;
    profile?: {
      name: string;
      handle: string;
      bio: string;
      location?: string;
      website?: string;
      joinDate?: string;
      following?: number;
      followers?: number;
      isVerified: boolean;
      profileImageUrl?: string;
      bannerImageUrl?: string;
      followStatus: "following" | "not_following" | "follows_you" | "mutual" | "unknown";
    };
    error?: string;
  }> {
    return this.sendRequest<{
      success: boolean;
      profile?: {
        name: string;
        handle: string;
        bio: string;
        location?: string;
        website?: string;
        joinDate?: string;
        following?: number;
        followers?: number;
        isVerified: boolean;
        profileImageUrl?: string;
        bannerImageUrl?: string;
        followStatus: "following" | "not_following" | "follows_you" | "mutual" | "unknown";
      };
      error?: string;
    }>("x_profile", {});
  }

  async getXNotifications(payload: { count?: number }): Promise<{
    success: boolean;
    notifications?: Array<{
      type: "like" | "follow" | "repost" | "reply" | "mention" | "quote" | "unknown";
      user: {
        name: string;
        handle: string;
        avatarUrl?: string;
        isVerified: boolean;
      };
      timestamp?: string;
      relatedContent?: string;
      tweetUrl?: string;
      tweetId?: string;
    }>;
    scrolled?: boolean;
    message?: string;
    error?: string;
  }> {
    return this.sendRequest<{
      success: boolean;
      notifications?: Array<{
        type: "like" | "follow" | "repost" | "reply" | "mention" | "quote" | "unknown";
        user: {
          name: string;
          handle: string;
          avatarUrl?: string;
          isVerified: boolean;
        };
        timestamp?: string;
        relatedContent?: string;
        tweetUrl?: string;
        tweetId?: string;
      }>;
      scrolled?: boolean;
      message?: string;
      error?: string;
    }>("x_notifications", payload);
  }

  async scrollPage(direction: string, amount: number): Promise<{ success: boolean }> {
    return this.sendRequest<{ success: boolean }>("scroll_page", { direction, amount });
  }

  // LinkedIn People Search methods
  async linkedinPeopleSearch(filters: {
    query?: string;
    network?: string[];
    actively_hiring?: boolean;
  }): Promise<{
    success: boolean;
    url?: string;
    error?: string;
  }> {
    return this.sendRequest<{ success: boolean; url?: string; error?: string }>(
      "linkedin_people_search",
      filters
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

  // LinkedIn Profile methods
  async linkedinGetProfile(): Promise<{
    success: boolean;
    profile?: {
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
    };
    error?: string;
  }> {
    return this.sendRequest<{
      success: boolean;
      profile?: {
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
      };
      error?: string;
    }>("linkedin_get_profile", {});
  }

  async linkedinProfileConnect(note?: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    return this.sendRequest<{ success: boolean; error?: string }>(
      "linkedin_profile_connect",
      { note }
    );
  }

  async linkedinEngagePost(payload: LinkedInEngagePostPayload): Promise<{
    success: boolean;
    results?: Partial<Record<LinkedInEngageActionType, boolean>>;
    error?: string;
  }> {
    return this.sendRequest<{
      success: boolean;
      results?: Partial<Record<LinkedInEngageActionType, boolean>>;
      error?: string;
    }>("linkedin_engage_post", payload);
  }

  async linkedinPostsSearch(query: string): Promise<{
    success: boolean;
    url?: string;
    error?: string;
  }> {
    return this.sendRequest<{ success: boolean; url?: string; error?: string }>(
      "linkedin_posts_search",
      { query }
    );
  }

  // ============ V2 Intent-Oriented Methods ============
  // These handle navigation internally and return rich status

  /**
   * Unified connect - navigates to profile and sends connection request.
   * Returns rich status on any outcome.
   */
  async linkedinConnectV2(profileUrl: string, note?: string): Promise<LinkedInActionResult> {
    return this.sendRequest<LinkedInActionResult>("linkedin_connect_v2", {
      profile_url: profileUrl,
      note,
    });
  }

  /**
   * Unified profile - navigates to profile and extracts data in one call.
   */
  async linkedinProfileV2(profileUrl: string): Promise<LinkedInActionResult & { profile?: LinkedInProfile }> {
    return this.sendRequest<LinkedInActionResult & { profile?: LinkedInProfile }>(
      "linkedin_profile_v2",
      { profile_url: profileUrl }
    );
  }

  /**
   * Get connection status without taking action.
   */
  async linkedinConnectionStatus(profileUrl: string): Promise<{
    success: boolean;
    status: LinkedInConnectionStatus;
    error?: string;
  }> {
    return this.sendRequest<{
      success: boolean;
      status: LinkedInConnectionStatus;
      error?: string;
    }>("linkedin_connection_status", { profile_url: profileUrl });
  }

  /**
   * Unified engage - accepts post URL, navigates if needed, performs actions.
   */
  async linkedinEngageV2(postUrl: string, actions: LinkedInEngageActionType[]): Promise<LinkedInActionResult> {
    return this.sendRequest<LinkedInActionResult>("linkedin_engage_v2", {
      post_url: postUrl,
      actions,
    });
  }

  /**
   * Create a new LinkedIn post.
   */
  async linkedinCreatePost(content: string): Promise<LinkedInActionResult> {
    return this.sendRequest<LinkedInActionResult>("linkedin_create_post", { content });
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

  /**
   * Restart the WebSocket bridge. Useful when the connection is stuck.
   * Will find a new available port automatically.
   */
  async restart(): Promise<{ success: boolean; message: string }> {
    console.error("[ExtensionBridge] Restarting bridge...");
    const oldPort = this.activePort;

    // Stop existing server and connections
    this.stop();

    // Wait a moment for cleanup
    await new Promise(resolve => setTimeout(resolve, 500));

    // If we had an old port, try to reclaim it by killing stale processes
    if (oldPort > 0) {
      try {
        const out = execFileSync("lsof", ["-t", "-i", `TCP:${oldPort}`], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        for (const pid of out.split("\n").filter(Boolean)) {
          const pidNum = Number(pid);
          // Don't kill ourselves
          if (pidNum !== process.pid) {
            try {
              process.kill(pidNum, "SIGTERM");
              console.error(`[ExtensionBridge] Killed stale process ${pidNum} on port ${oldPort}`);
            } catch {
              /* ignore */
            }
          }
        }
        // Wait for processes to die
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch {
        /* no listeners - good */
      }
    }

    // Restart the server (will find available port automatically)
    try {
      await this.start();
      return {
        success: true,
        message: `Bridge restarted successfully. WebSocket server listening on ${BRIDGE_HOST}:${this.activePort}. Extension will auto-discover this port.`
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        message: `Failed to restart bridge: ${msg}`
      };
    }
  }

  /** Get the port this bridge is listening on */
  getActivePort(): number {
    return this.activePort;
  }
}
