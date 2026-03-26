/**
 * PostHog analytics for MCP plugin usage tracking.
 * Uses the official posthog-node SDK for reliable event delivery.
 */

import { PostHog } from "posthog-node";
import { createHash } from "crypto";
import { hostname } from "os";

// PostHog configuration - Brainrot Creations project
const POSTHOG_HOST = "https://us.i.posthog.com";
const POSTHOG_API_KEY = "phc_HzbU9VFUqbZA66VeBnhpaQtgTkjhw70JekcWxsHVtJM";

// Initialize PostHog client
const posthog = new PostHog(POSTHOG_API_KEY, {
  host: POSTHOG_HOST,
  flushAt: 1, // Send events immediately for MCP (short-lived)
  flushInterval: 0, // Disable batching interval
});

// Generate anonymous machine ID (hash of hostname + username) - fallback only
function getAnonymousMachineId(): string {
  const raw = `${hostname()}-${process.env.USER || process.env.USERNAME || "unknown"}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

const anonymousMachineId = getAnonymousMachineId();
const pluginVersion = "1.0.23";

// User identity from extension (set when extension connects)
let userId: string | null = null;
let userEmail: string | null = null;
let userTier: string | null = null;

// Session tracking
let sessionStartTime: number | null = null;
let lastToolName: string | null = null;
let toolCallCount = 0;

// Engagement scoring - tracks session activity
let sessionPostsCreated = 0;
let sessionRepliesSent = 0;
let sessionEngagements = 0;
let sessionSearches = 0;
let sessionProfileViews = 0;
let sessionConnectionRequests = 0;

// Health metrics
let lastExtensionLatencyMs: number | null = null;

// Feature flags cache
let featureFlagsCache: Record<string, boolean | string> = {};
let featureFlagsFetchedAt: number | null = null;
let featureFlagsFetchPromise: Promise<void> | null = null;
let featureFlagsFetchSucceeded: boolean = false; // Track if last fetch was successful
const FEATURE_FLAGS_TTL = 30 * 1000; // 30 seconds - refresh frequently for real-time flag changes

/**
 * Get the distinct ID to use for PostHog events.
 * Prefers user's Supabase ID, falls back to anonymous machine ID.
 */
function getDistinctId(): string {
  return userId || `anon_${anonymousMachineId}`;
}

/**
 * Shutdown PostHog client - call before process exit
 */
export async function shutdownAnalytics(): Promise<void> {
  await posthog.shutdown();
}

// Handle process exit
process.on("beforeExit", async () => {
  await shutdownAnalytics();
});

/**
 * Set user identity from the extension and send identify call.
 * Called when the extension connects and provides user info.
 */
export function setUserIdentity(id: string, email?: string, tier?: string): void {
  const previousId = userId ? null : `anon_${anonymousMachineId}`;

  userId = id;
  userEmail = email || null;
  userTier = tier || null;
  sessionStartTime = Date.now();
  toolCallCount = 0;

  // Reset session engagement counters
  sessionPostsCreated = 0;
  sessionRepliesSent = 0;
  sessionEngagements = 0;
  sessionSearches = 0;
  sessionProfileViews = 0;
  sessionConnectionRequests = 0;

  // Send identify call
  posthog.identify({
    distinctId: id,
    properties: {
      email: userEmail,
      tier: userTier,
      plugin_version: pluginVersion,
      os_platform: process.platform,
      last_seen_plugin: new Date().toISOString(),
    },
  });

  // Alias anonymous ID to known user if we have both
  if (previousId) {
    posthog.alias({
      distinctId: id,
      alias: previousId,
    });
  }

  // Fetch feature flags for this user
  fetchFeatureFlags();
}

/**
 * Clear user identity (e.g., when extension disconnects)
 */
export function clearUserIdentity(): void {
  // Track final engagement score before clearing
  if (userId) {
    const score = calculateEngagementScore();
    capture("mcp_session_engagement_score", {
      engagement_score: score.score,
      engagement_level: score.level,
      ...score.breakdown,
    });
  }

  userId = null;
  userEmail = null;
  userTier = null;
  sessionStartTime = null;
  lastToolName = null;
  toolCallCount = 0;
  featureFlagsCache = {};
  featureFlagsFetchedAt = null;
  featureFlagsFetchSucceeded = false;
}

interface EventProperties {
  [key: string]: string | number | boolean | undefined | null | string[] | Record<string, unknown>;
}

// ============ Feature Flags ============

/**
 * Fetch feature flags from PostHog for the current user
 */
async function fetchFeatureFlagsInternal(): Promise<void> {
  try {
    const distinctId = getDistinctId();
    const flags = await posthog.getAllFlags(distinctId, {
      personProperties: {
        email: userEmail,
        tier: userTier,
      },
    });
    featureFlagsCache = flags || {};
    featureFlagsFetchedAt = Date.now();
    featureFlagsFetchSucceeded = true;
  } catch {
    // On error, set fetched time to prevent constant retries
    featureFlagsFetchedAt = Date.now();
    featureFlagsFetchSucceeded = false;
  }
}

/**
 * Fetch feature flags, deduplicating concurrent requests
 */
function fetchFeatureFlags(): Promise<void> {
  if (!featureFlagsFetchPromise) {
    featureFlagsFetchPromise = fetchFeatureFlagsInternal().finally(() => {
      featureFlagsFetchPromise = null;
    });
  }
  return featureFlagsFetchPromise;
}

/**
 * Ensure feature flags are loaded (call at startup or before first tool use)
 */
export async function ensureFeatureFlagsLoaded(): Promise<void> {
  if (!featureFlagsFetchedAt) {
    await fetchFeatureFlags();
  }
}

/**
 * Force refresh feature flags (bypass TTL)
 */
export async function forceRefreshFeatureFlags(): Promise<void> {
  featureFlagsFetchedAt = null; // Reset to force fetch
  await fetchFeatureFlags();
}

/**
 * Check if a feature flag is enabled (sync version - uses cached value)
 *
 * IMPORTANT: If flags were successfully fetched and the flag is missing, return FALSE (disabled).
 * Only use defaultValue if no fetch has happened yet or fetch failed.
 */
export function isFeatureEnabled(flagName: string, defaultValue: boolean = false): boolean {
  // Trigger background refresh if stale (but don't wait)
  if (!featureFlagsFetchedAt || Date.now() - featureFlagsFetchedAt > FEATURE_FLAGS_TTL) {
    fetchFeatureFlags();
  }

  const value = featureFlagsCache[flagName];

  // If flag is explicitly in cache, use its value
  if (value !== undefined) {
    return value === true || value === "true";
  }

  // Flag not in cache - if fetch succeeded, treat as disabled; otherwise use default
  if (featureFlagsFetchSucceeded) {
    return false; // Flag not found after successful fetch = disabled
  }

  return defaultValue;
}

/**
 * Check if a feature flag is enabled (async version - ensures flags are loaded first)
 *
 * IMPORTANT: If flags were successfully fetched and the flag is missing, return FALSE (disabled).
 * This ensures that inactive flags in PostHog properly disable tools.
 * Only use defaultValue if the fetch itself failed (graceful degradation).
 */
export async function isFeatureEnabledAsync(flagName: string, defaultValue: boolean = false): Promise<boolean> {
  if (!featureFlagsFetchedAt || Date.now() - featureFlagsFetchedAt > FEATURE_FLAGS_TTL) {
    await fetchFeatureFlags();
  }

  const value = featureFlagsCache[flagName];

  // If flag is explicitly in cache, use its value
  if (value !== undefined) {
    return value === true || value === "true";
  }

  // Flag not in cache - if fetch succeeded, treat as disabled; if fetch failed, use default
  if (featureFlagsFetchSucceeded) {
    return false; // Flag not found after successful fetch = disabled
  }

  return defaultValue; // Graceful degradation on fetch failure
}

/**
 * Get a feature flag value (for multivariate flags)
 */
export function getFeatureFlagValue(flagName: string, defaultValue: string = ""): string {
  if (!featureFlagsFetchedAt || Date.now() - featureFlagsFetchedAt > FEATURE_FLAGS_TTL) {
    fetchFeatureFlags();
  }

  const value = featureFlagsCache[flagName];
  if (value === undefined) return defaultValue;
  return String(value);
}

/**
 * Get all feature flags (for debugging)
 */
export function getAllFeatureFlags(): Record<string, boolean | string> {
  return { ...featureFlagsCache };
}

// ============ Feature Flag Definitions ============

export const PlatformFlags = {
  x: "mcp_platform_x",
  linkedin: "mcp_platform_linkedin",
  reddit: "mcp_platform_reddit",
} as const;

export const ToolFlags: Record<string, string> = {
  socials_check_access: "mcp_tool_check_access",
  socials_diagnostics: "mcp_tool_diagnostics",
  socials_list_personas: "mcp_tool_list_personas",
  socials_get_feed: "mcp_tool_get_feed",
  socials_get_post_context: "mcp_tool_get_post_context",
  socials_generate_reply: "mcp_tool_generate_reply",
  socials_quick_reply: "mcp_tool_quick_reply",
  socials_create_post: "mcp_tool_create_post",
  socials_engage_post: "mcp_tool_engage_post",
  socials_x_search: "mcp_tool_x_search",
  socials_open_tab: "mcp_tool_open_tab",
  socials_navigate: "mcp_tool_navigate",
  socials_get_active_tab: "mcp_tool_get_active_tab",
  socials_get_agent_tab: "mcp_tool_get_agent_tab",
  socials_focus_agent_tab: "mcp_tool_focus_agent_tab",
  socials_set_agent_tab: "mcp_tool_set_agent_tab",
  socials_reload_tab: "mcp_tool_reload_tab",
  socials_get_page_content: "mcp_tool_get_page_content",
  socials_scroll: "mcp_tool_scroll",
  socials_linkedin_people_search: "mcp_tool_linkedin_people_search",
  socials_linkedin_get_people: "mcp_tool_linkedin_get_people",
  socials_linkedin_next_page: "mcp_tool_linkedin_next_page",
  socials_linkedin_go_to_page: "mcp_tool_linkedin_go_to_page",
  socials_linkedin_posts_search: "mcp_tool_linkedin_posts_search",
  socials_linkedin_connect: "mcp_tool_linkedin_connect",
  socials_linkedin_profile: "mcp_tool_linkedin_profile",
  socials_linkedin_connection_status: "mcp_tool_linkedin_connection_status",
  socials_linkedin_engage: "mcp_tool_linkedin_engage",
  socials_linkedin_create_post: "mcp_tool_linkedin_create_post",
} as const;

export const ToolPlatformMap: Record<string, "x" | "linkedin" | "reddit" | "core" | "browser"> = {
  socials_check_access: "core",
  socials_diagnostics: "core",
  socials_list_personas: "core",
  socials_open_tab: "browser",
  socials_navigate: "browser",
  socials_get_active_tab: "browser",
  socials_get_agent_tab: "browser",
  socials_focus_agent_tab: "browser",
  socials_set_agent_tab: "browser",
  socials_reload_tab: "browser",
  socials_get_page_content: "browser",
  socials_scroll: "browser",
  socials_get_feed: "x",
  socials_get_post_context: "x",
  socials_generate_reply: "x",
  socials_quick_reply: "x",
  socials_create_post: "x",
  socials_engage_post: "x",
  socials_x_search: "x",
  socials_linkedin_people_search: "linkedin",
  socials_linkedin_get_people: "linkedin",
  socials_linkedin_next_page: "linkedin",
  socials_linkedin_go_to_page: "linkedin",
  socials_linkedin_posts_search: "linkedin",
  socials_linkedin_connect: "linkedin",
  socials_linkedin_profile: "linkedin",
  socials_linkedin_connection_status: "linkedin",
  socials_linkedin_engage: "linkedin",
  socials_linkedin_create_post: "linkedin",
};

export function isPlatformEnabled(platform: "x" | "linkedin" | "reddit"): boolean {
  const flagName = PlatformFlags[platform];
  return isFeatureEnabled(flagName, true);
}

export function isToolEnabled(toolName: string): boolean {
  const platform = ToolPlatformMap[toolName];
  if (platform && platform !== "core" && platform !== "browser") {
    if (!isPlatformEnabled(platform as "x" | "linkedin" | "reddit")) {
      return false;
    }
  }
  const toolFlag = ToolFlags[toolName];
  if (toolFlag) {
    return isFeatureEnabled(toolFlag, true);
  }
  return true;
}

export async function isPlatformEnabledAsync(platform: "x" | "linkedin" | "reddit"): Promise<boolean> {
  const flagName = PlatformFlags[platform];
  return isFeatureEnabledAsync(flagName, true);
}

export async function isToolEnabledAsync(toolName: string): Promise<boolean> {
  const platform = ToolPlatformMap[toolName];
  if (platform && platform !== "core" && platform !== "browser") {
    if (!(await isPlatformEnabledAsync(platform as "x" | "linkedin" | "reddit"))) {
      return false;
    }
  }
  const toolFlag = ToolFlags[toolName];
  if (toolFlag) {
    return isFeatureEnabledAsync(toolFlag, true);
  }
  return true;
}

export function getEnabledTools(): string[] {
  return Object.keys(ToolFlags).filter(isToolEnabled);
}

export function getDisabledTools(): string[] {
  return Object.keys(ToolFlags).filter(tool => !isToolEnabled(tool));
}

export function getFeatureGatingStatus(): {
  platforms: Record<string, boolean>;
  tools: Record<string, boolean>;
  disabled_tools: string[];
  debug: {
    flags_fetched: boolean;
    flags_fetch_succeeded: boolean;
    flags_age_seconds: number | null;
    flags_ttl_seconds: number;
    raw_flags: Record<string, boolean | string>;
    distinct_id: string;
  };
} {
  return {
    platforms: {
      x: isPlatformEnabled("x"),
      linkedin: isPlatformEnabled("linkedin"),
      reddit: isPlatformEnabled("reddit"),
    },
    tools: Object.fromEntries(Object.keys(ToolFlags).map(t => [t, isToolEnabled(t)])),
    disabled_tools: getDisabledTools(),
    debug: {
      flags_fetched: featureFlagsFetchedAt !== null,
      flags_fetch_succeeded: featureFlagsFetchSucceeded,
      flags_age_seconds: featureFlagsFetchedAt ? Math.round((Date.now() - featureFlagsFetchedAt) / 1000) : null,
      flags_ttl_seconds: FEATURE_FLAGS_TTL / 1000,
      raw_flags: { ...featureFlagsCache },
      distinct_id: getDistinctId(),
    },
  };
}

// ============ Engagement Scoring ============

interface EngagementScore {
  score: number;
  level: "inactive" | "low" | "medium" | "high" | "power_user";
  breakdown: {
    posts_score: number;
    replies_score: number;
    engagements_score: number;
    searches_score: number;
    profile_views_score: number;
    connections_score: number;
    session_duration_score: number;
    tool_diversity_score: number;
  };
}

export function calculateEngagementScore(): EngagementScore {
  const weights = { posts: 15, replies: 10, engagements: 3, searches: 2, profileViews: 2, connections: 8, sessionDuration: 10, toolDiversity: 10 };
  const postsScore = Math.min(sessionPostsCreated * weights.posts, 30);
  const repliesScore = Math.min(sessionRepliesSent * weights.replies, 30);
  const engagementsScore = Math.min(sessionEngagements * weights.engagements, 15);
  const searchesScore = Math.min(sessionSearches * weights.searches, 10);
  const profileViewsScore = Math.min(sessionProfileViews * weights.profileViews, 10);
  const connectionsScore = Math.min(sessionConnectionRequests * weights.connections, 24);
  const sessionDurationMin = sessionStartTime ? (Date.now() - sessionStartTime) / 60000 : 0;
  const sessionDurationScore = Math.min(sessionDurationMin / 3, weights.sessionDuration);
  const uniqueActivities = [sessionPostsCreated > 0, sessionRepliesSent > 0, sessionEngagements > 0, sessionSearches > 0, sessionProfileViews > 0, sessionConnectionRequests > 0].filter(Boolean).length;
  const toolDiversityScore = (uniqueActivities / 6) * weights.toolDiversity;
  const totalScore = Math.min(postsScore + repliesScore + engagementsScore + searchesScore + profileViewsScore + connectionsScore + sessionDurationScore + toolDiversityScore, 100);
  let level: EngagementScore["level"] = totalScore === 0 ? "inactive" : totalScore < 15 ? "low" : totalScore < 35 ? "medium" : totalScore < 60 ? "high" : "power_user";
  return {
    score: Math.round(totalScore * 10) / 10,
    level,
    breakdown: {
      posts_score: Math.round(postsScore * 10) / 10,
      replies_score: Math.round(repliesScore * 10) / 10,
      engagements_score: Math.round(engagementsScore * 10) / 10,
      searches_score: Math.round(searchesScore * 10) / 10,
      profile_views_score: Math.round(profileViewsScore * 10) / 10,
      connections_score: Math.round(connectionsScore * 10) / 10,
      session_duration_score: Math.round(sessionDurationScore * 10) / 10,
      tool_diversity_score: Math.round(toolDiversityScore * 10) / 10,
    },
  };
}

export function getEngagementScore(): EngagementScore {
  return calculateEngagementScore();
}

// ============ Health Metrics ============

interface HealthMetrics {
  memory_usage_mb: number;
  memory_heap_used_mb: number;
  memory_heap_total_mb: number;
  memory_external_mb: number;
  uptime_seconds: number;
  last_extension_latency_ms: number | null;
  feature_flags_cached: number;
  feature_flags_age_seconds: number | null;
}

export function getHealthMetrics(): HealthMetrics {
  const memUsage = process.memoryUsage();
  return {
    memory_usage_mb: Math.round(memUsage.rss / 1024 / 1024 * 100) / 100,
    memory_heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100,
    memory_heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024 * 100) / 100,
    memory_external_mb: Math.round(memUsage.external / 1024 / 1024 * 100) / 100,
    uptime_seconds: Math.round(process.uptime()),
    last_extension_latency_ms: lastExtensionLatencyMs,
    feature_flags_cached: Object.keys(featureFlagsCache).length,
    feature_flags_age_seconds: featureFlagsFetchedAt ? Math.round((Date.now() - featureFlagsFetchedAt) / 1000) : null,
  };
}

export function recordExtensionLatency(latencyMs: number): void {
  lastExtensionLatencyMs = latencyMs;
}

export function trackHealthMetrics(): void {
  const health = getHealthMetrics();
  const engagement = calculateEngagementScore();
  capture("mcp_health_check", { ...health, engagement_score: engagement.score, engagement_level: engagement.level });
}

// ============ Core Event Capture ============

/**
 * Capture an event to PostHog using captureImmediate for guaranteed delivery.
 * This is critical for MCP servers which may be short-lived.
 */
async function captureAsync(event: string, properties: EventProperties = {}): Promise<void> {
  const distinctId = getDistinctId();

  try {
    await posthog.captureImmediate({
      distinctId,
      event,
      properties: {
        // Core identification
        product: "socials",
        client: "claude_code",
        client_type: "mcp_server",
        source: "claude-code-plugin",

        // Version info
        plugin_version: pluginVersion,
        $lib: "socials-mcp",
        $lib_version: pluginVersion,

        // Environment
        os: process.platform,
        os_name: process.platform === "darwin" ? "macOS" : process.platform === "win32" ? "Windows" : "Linux",
        node_version: process.version,

        // User context
        user_id: userId,
        user_email: userEmail,
        user_tier: userTier,
        is_identified: !!userId,

        // Session context
        session_tool_count: toolCallCount,
        session_duration_seconds: sessionStartTime ? Math.round((Date.now() - sessionStartTime) / 1000) : null,

        // Group for tier-based analysis
        $groups: userTier ? { subscription_tier: userTier } : undefined,

        // Event-specific properties (passed in)
        ...properties,
      },
    });
  } catch {
    // Silent fail - analytics shouldn't break the app
  }
}

/**
 * Fire-and-forget capture for non-critical events (backwards compat)
 */
function capture(event: string, properties: EventProperties = {}): void {
  captureAsync(event, properties).catch(() => {});
}

// ============ Timing Utility ============

export function createTimer(): () => number {
  const start = Date.now();
  return () => Date.now() - start;
}

// ============ Session & Connection Events ============

export function trackServerStart(): void {
  capture("mcp_server_started", { machine_id: anonymousMachineId });
}

export function trackExtensionConnected(tier?: string): void {
  capture("mcp_extension_connected", { tier: tier || "unknown" });
}

export function trackExtensionDisconnected(): void {
  const sessionDurationMs = sessionStartTime ? Date.now() - sessionStartTime : null;
  const engagement = calculateEngagementScore();
  capture("mcp_extension_disconnected", {
    session_duration_ms: sessionDurationMs,
    session_duration_min: sessionDurationMs ? Math.round(sessionDurationMs / 60000) : null,
    session_tool_count: toolCallCount,
    final_engagement_score: engagement.score,
    final_engagement_level: engagement.level,
  });
}

// ============ Tool Usage Events ============

export async function trackToolUsage(toolName: string, platform?: string, success: boolean = true, durationMs?: number): Promise<void> {
  toolCallCount++;
  await captureAsync("mcp_tool_called", {
    tool: toolName,
    social_platform: platform || "unknown",
    success,
    duration_ms: durationMs,
    is_slow: durationMs ? durationMs > 5000 : undefined,
  });
  lastToolName = toolName;
}

export async function trackError(toolName: string, errorMessage: string): Promise<void> {
  const msg = errorMessage.toLowerCase();
  const category = msg.includes("not connected") || msg.includes("websocket") ? "connection"
    : msg.includes("pro access") || msg.includes("permission") ? "permission"
    : msg.includes("timeout") ? "timeout"
    : msg.includes("rate limit") ? "rate_limit"
    : msg.includes("not found") ? "not_found"
    : msg.includes("invalid") ? "validation"
    : "unknown";

  await captureAsync("mcp_tool_error", { tool: toolName, error: errorMessage.slice(0, 200), error_category: category });
}

// ============ Action-Specific Events ============

function analyzeContent(content: string) {
  const hashtags = content.match(/#\w+/g) || [];
  const mentions = content.match(/@\w+/g) || [];
  const urls = content.match(/https?:\/\/[^\s]+/g) || [];
  return {
    hashtag_count: hashtags.length,
    hashtags: hashtags.slice(0, 5),
    mention_count: mentions.length,
    mentions: mentions.slice(0, 5),
    url_count: urls.length,
    has_emoji: /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/u.test(content),
    word_count: content.trim().split(/\s+/).filter(w => w.length > 0).length,
    character_count: content.length,
  };
}

export function trackPostCreated(platform: string, content: string, success: boolean, durationMs?: number): void {
  if (success) sessionPostsCreated++;
  capture("mcp_post_created", { social_platform: platform, success, duration_ms: durationMs, ...analyzeContent(content) });
}

export function trackReplySent(platform: string, content: string, success: boolean, durationMs?: number): void {
  if (success) sessionRepliesSent++;
  capture("mcp_reply_sent", { social_platform: platform, success, duration_ms: durationMs, ...analyzeContent(content) });
}

export function trackEngagement(platform: string, actions: string[], success: boolean, durationMs?: number): void {
  if (success) sessionEngagements += actions.length;
  capture("mcp_engagement_action", {
    social_platform: platform,
    actions: actions.join(","),
    action_count: actions.length,
    has_like: actions.includes("like"),
    has_repost: actions.includes("repost"),
    has_bookmark: actions.includes("bookmark"),
    success,
    duration_ms: durationMs,
  });
}

export function trackSearch(platform: string, searchType: "posts" | "people", success: boolean, durationMs?: number): void {
  if (success) sessionSearches++;
  capture("mcp_search_performed", { social_platform: platform, search_type: searchType, success, duration_ms: durationMs });
}

export function trackProfileViewed(success: boolean, durationMs?: number): void {
  if (success) sessionProfileViews++;
  capture("mcp_profile_viewed", { social_platform: "linkedin", success, duration_ms: durationMs });
}

export function trackConnectionRequest(success: boolean, hasNote: boolean, durationMs?: number): void {
  if (success) sessionConnectionRequests++;
  capture("mcp_connection_request", { social_platform: "linkedin", success, has_note: hasNote, duration_ms: durationMs });
}

export function trackPersonaUsed(personaId: string, personaName: string): void {
  capture("mcp_persona_used", { persona_id: personaId, persona_name: personaName, is_custom: !personaId.startsWith("system_") });
}

export function trackFeedViewed(platform: string, postCount: number, durationMs?: number): void {
  capture("mcp_feed_viewed", { social_platform: platform, post_count: postCount, duration_ms: durationMs });
}

// ============ Group Analytics ============

export function updateTierGroupProperties(): void {
  if (!userTier) return;
  posthog.groupIdentify({
    groupType: "subscription_tier",
    groupKey: userTier,
    properties: { name: userTier, updated_at: new Date().toISOString() },
  });
}
