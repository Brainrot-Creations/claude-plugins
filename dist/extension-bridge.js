import { execFileSync } from "child_process";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
const BRIDGE_PORT = 9847; // Port for extension to connect to
const BRIDGE_HOST = "127.0.0.1"; // IPv4 only — avoids :: vs localhost mismatch and some EADDRINUSE cases
const PING_INTERVAL = 30000; // 30 seconds
const REQUEST_TIMEOUT = 60000; // 60 seconds for generation requests
/** Optional: set SOCIALS_MCP_RECLAIM_PORT=1 to SIGTERM listeners on BRIDGE_PORT before bind (stale socials-mcp). */
function tryReclaimBridgePort(port) {
    if (process.env.SOCIALS_MCP_RECLAIM_PORT !== "1")
        return;
    try {
        const out = execFileSync("lsof", ["-t", "-i", `TCP:${port}`], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        for (const pid of out.split("\n").filter(Boolean)) {
            try {
                process.kill(Number(pid), "SIGTERM");
            }
            catch {
                /* ignore */
            }
        }
    }
    catch {
        /* no listeners */
    }
}
export class ExtensionBridge {
    wss = null;
    /** True after the WebSocket server has bound to BRIDGE_PORT (extension can dial in). */
    wsServerListening = false;
    client = null;
    pendingRequests = new Map();
    pingInterval = null;
    async start() {
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
                    console.error(`[ExtensionBridge] WebSocket server listening on ${BRIDGE_HOST}:${BRIDGE_PORT} (extension must use ws://127.0.0.1:${BRIDGE_PORT})`);
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
                    const hint = error.code === "EADDRINUSE"
                        ? ` Port ${BRIDGE_PORT} is in use. Quit duplicate Claude/MCP instances, or run: lsof -nP -iTCP:${BRIDGE_PORT} | grep LISTEN — then kill that PID. Or set SOCIALS_MCP_RECLAIM_PORT=1 in MCP env to reclaim the port (use with care).`
                        : "";
                    console.error("[ExtensionBridge] Server error:", error.message + hint);
                    reject(error);
                });
            }
            catch (error) {
                reject(error);
            }
        });
    }
    startPingInterval() {
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
    handleMessage(data) {
        try {
            const response = JSON.parse(data);
            const pending = this.pendingRequests.get(response.id);
            if (pending) {
                clearTimeout(pending.timeout);
                this.pendingRequests.delete(response.id);
                if (response.success) {
                    pending.resolve(response.data);
                }
                else {
                    pending.reject(new Error(response.error || "Unknown error"));
                }
            }
        }
        catch (error) {
            console.error("[ExtensionBridge] Failed to parse message:", error);
        }
    }
    sendRequest(type, payload) {
        return new Promise((resolve, reject) => {
            if (!this.client || this.client.readyState !== WebSocket.OPEN) {
                reject(new Error("Extension not connected. Please open the Socials extension in your browser."));
                return;
            }
            const id = randomUUID();
            const message = { id, type, payload };
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(id);
                reject(new Error("Request timed out"));
            }, REQUEST_TIMEOUT);
            this.pendingRequests.set(id, {
                resolve: resolve,
                reject,
                timeout,
            });
            this.client.send(JSON.stringify(message));
        });
    }
    isConnected() {
        return this.client?.readyState === WebSocket.OPEN;
    }
    /** Whether the MCP process is listening for the browser extension on BRIDGE_PORT. */
    isWsServerListening() {
        return this.wsServerListening;
    }
    async checkProAccess() {
        const result = await this.sendRequest("check_pro_access", undefined);
        return {
            isPro: result.subscription.isPro,
            tier: result.subscription.tier,
        };
    }
    async getCurrentUser() {
        return this.sendRequest("get_current_user", undefined);
    }
    async getFeedPosts(platform, count = 10) {
        const payload = {
            platform: platform,
            count,
        };
        return this.sendRequest("get_feed_posts", payload);
    }
    async getPostContext(platform, postUrl) {
        const payload = {
            platform: platform,
            postUrl,
        };
        return this.sendRequest("get_post_context", payload);
    }
    async generateReply(platform, postContent, postAuthor, personaId, mood) {
        const payload = {
            platform: platform,
            postContent,
            postAuthor,
            personaId,
            mood,
        };
        return this.sendRequest("generate_reply", payload);
    }
    async submitReply(platform, postUrl, replyContent) {
        const payload = {
            platform: platform,
            postUrl,
            replyContent,
        };
        return this.sendRequest("submit_reply", payload);
    }
    async listPersonas() {
        return this.sendRequest("list_personas", undefined);
    }
    async getSettings() {
        return this.sendRequest("get_settings", undefined);
    }
    // Browser control methods
    async openTab(url) {
        return this.sendRequest("open_tab", { url });
    }
    async navigateTo(url, tabId) {
        return this.sendRequest("navigate_to", { url, tabId });
    }
    async getActiveTab() {
        return this.sendRequest("get_active_tab", undefined);
    }
    async reloadTab(tabId) {
        return this.sendRequest("reload_tab", { tabId });
    }
    async getPageContent(tabId) {
        return this.sendRequest("get_page_content", { tabId });
    }
    async quickReply(postId, content) {
        return this.sendRequest("quick_reply", { postId, content });
    }
    async scrollPage(direction, amount) {
        return this.sendRequest("scroll_page", { direction, amount });
    }
    stop() {
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
//# sourceMappingURL=extension-bridge.js.map