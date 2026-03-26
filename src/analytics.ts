/**
 * PostHog analytics for MCP plugin usage tracking.
 * Features:
 * - User identification with anonymous fallback
 * - Tool call timing and performance metrics
 * - Error categorization
 * - Cumulative user properties (lifetime stats)
 * - Content insights (hashtags, mentions)
 * - Tool sequence tracking (funnels)
 * - Group analytics by subscription tier
 * - Feature flags for remote control and A/B testing
 * - Engagement scoring
 * - Health metrics (memory, latency)
 */

import { createHash } from "crypto";
import { hostname } from "os";

// PostHog configuration - same project as the main Socials server
const POSTHOG_HOST = process.env.POSTHOG_HOST || "https://us.i.posthog.com";
const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY || "phc_NxYGkalAkiTBbZOuQChvvHnfRBL7MJABKCuTVXdbyz4";

// Generate anonymous machine ID (hash of hostname + username) - fallback only
function getAnonymousMachineId(): string {
  const raw = `${hostname()}-${process.env.USER || process.env.USERNAME || "unknown"}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

const anonymousMachineId = getAnonymousMachineId();
const pluginVersion = "1.0.16";

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
let totalEventsQueued = 0;
let totalEventsSent = 0;
let totalEventsFailed = 0;

// Feature flags cache
let featureFlagsCache: Record<string, boolean | string> = {};
let featureFlagsFetchedAt: number | null = null;
const FEATURE_FLAGS_TTL = 5 * 60 * 1000; // 5 minutes

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

  // Send identify call to link anonymous user to known user
  identify(previousId);

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
}

/**
 * Get the distinct ID to use for PostHog events.
 * Prefers user's Supabase ID, falls back to anonymous machine ID.
 */
function getDistinctId(): string {
  return userId || `anon_${anonymousMachineId}`;
}

interface EventProperties {
  [key: string]: string | number | boolean | undefined | null | string[] | Record<string, unknown>;
}

// ============ Feature Flags ============

/**
 * Fetch feature flags from PostHog for the current user
 */
async function fetchFeatureFlags(): Promise<void> {
  try {
    const response = await fetch(`${POSTHOG_HOST}/decide/?v=3`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: POSTHOG_API_KEY,
        distinct_id: getDistinctId(),
        person_properties: {
          email: userEmail,
          tier: userTier,
        },
        groups: userTier ? { subscription_tier: userTier } : undefined,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      featureFlagsCache = data.featureFlags || {};
      featureFlagsFetchedAt = Date.now();
    }
  } catch {
    // Silently ignore - feature flags are optional
  }
}

/**
 * Check if a feature flag is enabled
 * @param flagName - Name of the feature flag
 * @param defaultValue - Default value if flag is not found
 */
export function isFeatureEnabled(flagName: string, defaultValue: boolean = false): boolean {
  // Refresh flags if stale
  if (!featureFlagsFetchedAt || Date.now() - featureFlagsFetchedAt > FEATURE_FLAGS_TTL) {
    fetchFeatureFlags();
  }

  const value = featureFlagsCache[flagName];
  if (value === undefined) return defaultValue;
  return value === true || value === "true";
}

/**
 * Get a feature flag value (for multivariate flags)
 * @param flagName - Name of the feature flag
 * @param defaultValue - Default value if flag is not found
 */
export function getFeatureFlagValue(flagName: string, defaultValue: string = ""): string {
  // Refresh flags if stale
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

/**
 * Platform-level feature flags
 * These control entire platforms (all tools for that platform)
 */
export const PlatformFlags = {
  x: "mcp_platform_x",
  linkedin: "mcp_platform_linkedin",
  reddit: "mcp_platform_reddit",
} as const;

/**
 * Tool-level feature flags
 * These control individual tools (checked after platform flag)
 */
export const ToolFlags: Record<string, string> = {
  // Core tools (always on by default)
  socials_check_access: "mcp_tool_check_access",
  socials_diagnostics: "mcp_tool_diagnostics",
  socials_list_personas: "mcp_tool_list_personas",

  // X (Twitter) tools
  socials_get_feed: "mcp_tool_get_feed",
  socials_get_post_context: "mcp_tool_get_post_context",
  socials_generate_reply: "mcp_tool_generate_reply",
  socials_quick_reply: "mcp_tool_quick_reply",
  socials_create_post: "mcp_tool_create_post",
  socials_engage_post: "mcp_tool_engage_post",
  socials_x_search: "mcp_tool_x_search",

  // Browser control tools
  socials_open_tab: "mcp_tool_open_tab",
  socials_navigate: "mcp_tool_navigate",
  socials_get_active_tab: "mcp_tool_get_active_tab",
  socials_get_agent_tab: "mcp_tool_get_agent_tab",
  socials_focus_agent_tab: "mcp_tool_focus_agent_tab",
  socials_set_agent_tab: "mcp_tool_set_agent_tab",
  socials_reload_tab: "mcp_tool_reload_tab",
  socials_get_page_content: "mcp_tool_get_page_content",
  socials_scroll: "mcp_tool_scroll",

  // LinkedIn tools
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

/**
 * Map tools to their platforms
 */
export const ToolPlatformMap: Record<string, "x" | "linkedin" | "reddit" | "core" | "browser"> = {
  // Core tools (no platform)
  socials_check_access: "core",
  socials_diagnostics: "core",
  socials_list_personas: "core",

  // Browser tools (no platform)
  socials_open_tab: "browser",
  socials_navigate: "browser",
  socials_get_active_tab: "browser",
  socials_get_agent_tab: "browser",
  socials_focus_agent_tab: "browser",
  socials_set_agent_tab: "browser",
  socials_reload_tab: "browser",
  socials_get_page_content: "browser",
  socials_scroll: "browser",

  // X tools
  socials_get_feed: "x", // Also used for LinkedIn, handled separately
  socials_get_post_context: "x",
  socials_generate_reply: "x",
  socials_quick_reply: "x",
  socials_create_post: "x",
  socials_engage_post: "x",
  socials_x_search: "x",

  // LinkedIn tools
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

/**
 * Check if a platform is enabled
 * Default: all platforms enabled (true) unless explicitly disabled in PostHog
 */
export function isPlatformEnabled(platform: "x" | "linkedin" | "reddit"): boolean {
  const flagName = PlatformFlags[platform];
  return isFeatureEnabled(flagName, true); // Default to enabled
}

/**
 * Check if a specific tool is enabled
 * Checks both platform flag and tool-specific flag
 * Default: all tools enabled (true) unless explicitly disabled
 */
export function isToolEnabled(toolName: string): boolean {
  // Core and browser tools are always enabled (unless explicitly disabled)
  const platform = ToolPlatformMap[toolName];

  // Check platform-level flag first (for platform-specific tools)
  if (platform && platform !== "core" && platform !== "browser") {
    if (!isPlatformEnabled(platform as "x" | "linkedin" | "reddit")) {
      return false;
    }
  }

  // Check tool-specific flag
  const toolFlag = ToolFlags[toolName];
  if (toolFlag) {
    return isFeatureEnabled(toolFlag, true); // Default to enabled
  }

  // Unknown tools are enabled by default
  return true;
}

/**
 * Get all enabled tools
 */
export function getEnabledTools(): string[] {
  return Object.keys(ToolFlags).filter(isToolEnabled);
}

/**
 * Get all disabled tools
 */
export function getDisabledTools(): string[] {
  return Object.keys(ToolFlags).filter(tool => !isToolEnabled(tool));
}

/**
 * Get platform and tool status for diagnostics
 */
export function getFeatureGatingStatus(): {
  platforms: Record<string, boolean>;
  tools: Record<string, boolean>;
  disabled_tools: string[];
} {
  const platforms: Record<string, boolean> = {
    x: isPlatformEnabled("x"),
    linkedin: isPlatformEnabled("linkedin"),
    reddit: isPlatformEnabled("reddit"),
  };

  const tools: Record<string, boolean> = {};
  for (const toolName of Object.keys(ToolFlags)) {
    tools[toolName] = isToolEnabled(toolName);
  }

  return {
    platforms,
    tools,
    disabled_tools: getDisabledTools(),
  };
}

/**
 * Track feature flag evaluation
 */
export function trackFeatureFlagEvaluation(flagName: string, value: boolean | string): void {
  capture("$feature_flag_called", {
    $feature_flag: flagName,
    $feature_flag_response: value,
  });
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

/**
 * Calculate engagement score for the current session
 * Score ranges from 0-100
 */
export function calculateEngagementScore(): EngagementScore {
  // Weights for different activities
  const weights = {
    posts: 15,           // High value - creating content
    replies: 10,         // High value - engagement
    engagements: 3,      // Medium value - likes/reposts
    searches: 2,         // Lower value - discovery
    profileViews: 2,     // Lower value - research
    connections: 8,      // High value - networking
    sessionDuration: 10, // Value sustained usage
    toolDiversity: 10,   // Value using multiple features
  };

  // Calculate individual scores (capped at reasonable maximums)
  const postsScore = Math.min(sessionPostsCreated * weights.posts, 30);
  const repliesScore = Math.min(sessionRepliesSent * weights.replies, 30);
  const engagementsScore = Math.min(sessionEngagements * weights.engagements, 15);
  const searchesScore = Math.min(sessionSearches * weights.searches, 10);
  const profileViewsScore = Math.min(sessionProfileViews * weights.profileViews, 10);
  const connectionsScore = Math.min(sessionConnectionRequests * weights.connections, 24);

  // Session duration score (up to 30 min = 10 points)
  const sessionDurationMin = sessionStartTime ? (Date.now() - sessionStartTime) / 60000 : 0;
  const sessionDurationScore = Math.min(sessionDurationMin / 3, weights.sessionDuration);

  // Tool diversity score (number of unique tool types used)
  const uniqueActivities = [
    sessionPostsCreated > 0,
    sessionRepliesSent > 0,
    sessionEngagements > 0,
    sessionSearches > 0,
    sessionProfileViews > 0,
    sessionConnectionRequests > 0,
  ].filter(Boolean).length;
  const toolDiversityScore = (uniqueActivities / 6) * weights.toolDiversity;

  // Total score
  const totalScore = Math.min(
    postsScore +
    repliesScore +
    engagementsScore +
    searchesScore +
    profileViewsScore +
    connectionsScore +
    sessionDurationScore +
    toolDiversityScore,
    100
  );

  // Determine engagement level
  let level: EngagementScore["level"];
  if (totalScore === 0) level = "inactive";
  else if (totalScore < 15) level = "low";
  else if (totalScore < 35) level = "medium";
  else if (totalScore < 60) level = "high";
  else level = "power_user";

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

/**
 * Get current engagement score without tracking
 */
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
  events_queued: number;
  events_sent: number;
  events_failed: number;
  event_success_rate: number;
  last_extension_latency_ms: number | null;
  feature_flags_cached: number;
  feature_flags_age_seconds: number | null;
}

/**
 * Get current health metrics
 */
export function getHealthMetrics(): HealthMetrics {
  const memUsage = process.memoryUsage();
  const totalEvents = totalEventsSent + totalEventsFailed;

  return {
    memory_usage_mb: Math.round(memUsage.rss / 1024 / 1024 * 100) / 100,
    memory_heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100,
    memory_heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024 * 100) / 100,
    memory_external_mb: Math.round(memUsage.external / 1024 / 1024 * 100) / 100,
    uptime_seconds: Math.round(process.uptime()),
    events_queued: totalEventsQueued,
    events_sent: totalEventsSent,
    events_failed: totalEventsFailed,
    event_success_rate: totalEvents > 0 ? Math.round(totalEventsSent / totalEvents * 100) : 100,
    last_extension_latency_ms: lastExtensionLatencyMs,
    feature_flags_cached: Object.keys(featureFlagsCache).length,
    feature_flags_age_seconds: featureFlagsFetchedAt
      ? Math.round((Date.now() - featureFlagsFetchedAt) / 1000)
      : null,
  };
}

/**
 * Record extension latency (called from bridge)
 */
export function recordExtensionLatency(latencyMs: number): void {
  lastExtensionLatencyMs = latencyMs;
}

/**
 * Track health metrics periodically
 */
export function trackHealthMetrics(): void {
  const health = getHealthMetrics();
  const engagement = calculateEngagementScore();

  capture("mcp_health_check", {
    ...health,
    engagement_score: engagement.score,
    engagement_level: engagement.level,
  });
}

// ============ Core Event Capture ============

/**
 * Send an identify call to PostHog to set user properties and link anonymous to known user
 */
function identify(previousDistinctId: string | null): void {
  try {
    const distinctId = getDistinctId();

    const payload: Record<string, unknown> = {
      api_key: POSTHOG_API_KEY,
      distinct_id: distinctId,
      timestamp: new Date().toISOString(),
      $set: {
        email: userEmail,
        tier: userTier,
        user_id: userId,
        plugin_version: pluginVersion,
        os_platform: process.platform,
        last_seen_plugin: new Date().toISOString(),
      },
      $set_once: {
        first_seen_plugin: new Date().toISOString(),
        initial_tier: userTier,
        initial_plugin_version: pluginVersion,
      },
    };

    totalEventsQueued++;

    // Send identify
    fetch(`${POSTHOG_HOST}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        event: "$identify",
      }),
    })
      .then(() => { totalEventsSent++; })
      .catch(() => { totalEventsFailed++; });

    // Alias anonymous ID to known user if we have both
    if (previousDistinctId && userId) {
      totalEventsQueued++;
      fetch(`${POSTHOG_HOST}/capture/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: POSTHOG_API_KEY,
          event: "$create_alias",
          distinct_id: userId,
          properties: {
            alias: previousDistinctId,
          },
        }),
      })
        .then(() => { totalEventsSent++; })
        .catch(() => { totalEventsFailed++; });
    }
  } catch {
    totalEventsFailed++;
  }
}

/**
 * Send an event to PostHog (fire-and-forget, never throws)
 */
function capture(event: string, properties: EventProperties = {}): void {
  try {
    const distinctId = getDistinctId();
    const engagement = calculateEngagementScore();
    const health = getHealthMetrics();

    const payload = {
      api_key: POSTHOG_API_KEY,
      event,
      distinct_id: distinctId,
      timestamp: new Date().toISOString(),
      properties: {
        // Product identification
        product: "socials",
        source: "claude-plugins",
        plugin_version: pluginVersion,

        // Environment info
        os_platform: process.platform,
        node_version: process.version,

        // User context
        has_user_identity: !!userId,
        user_tier: userTier,

        // Session context
        session_tool_count: toolCallCount,
        session_duration_ms: sessionStartTime ? Date.now() - sessionStartTime : null,

        // Tool sequence tracking (for funnels)
        previous_tool: lastToolName,

        // Engagement score (included on all events)
        engagement_score: engagement.score,
        engagement_level: engagement.level,

        // Health metrics (lightweight subset)
        memory_mb: health.memory_usage_mb,
        extension_latency_ms: health.last_extension_latency_ms,

        // Group analytics - group by tier for cohort analysis
        $groups: userTier ? { subscription_tier: userTier } : undefined,

        // Event-specific properties
        ...properties,
      },
    };

    totalEventsQueued++;

    // Fire and forget
    fetch(`${POSTHOG_HOST}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(() => { totalEventsSent++; })
      .catch(() => { totalEventsFailed++; });
  } catch {
    totalEventsFailed++;
  }
}

/**
 * Increment a user property (for cumulative stats)
 */
function incrementUserProperty(property: string, amount: number = 1): void {
  if (!userId) return;

  try {
    totalEventsQueued++;
    fetch(`${POSTHOG_HOST}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: POSTHOG_API_KEY,
        event: "$set",
        distinct_id: getDistinctId(),
        $set: {
          [property]: { $increment: amount },
        },
      }),
    })
      .then(() => { totalEventsSent++; })
      .catch(() => { totalEventsFailed++; });
  } catch {
    totalEventsFailed++;
  }
}

// ============ Error Categorization ============

type ErrorCategory =
  | "connection"
  | "permission"
  | "timeout"
  | "rate_limit"
  | "not_found"
  | "validation"
  | "extension"
  | "unknown";

function categorizeError(errorMessage: string): ErrorCategory {
  const msg = errorMessage.toLowerCase();

  if (msg.includes("not connected") || msg.includes("connection") || msg.includes("websocket")) {
    return "connection";
  }
  if (msg.includes("pro access") || msg.includes("paid plan") || msg.includes("permission") || msg.includes("allowlist")) {
    return "permission";
  }
  if (msg.includes("timeout") || msg.includes("timed out")) {
    return "timeout";
  }
  if (msg.includes("rate limit") || msg.includes("too many")) {
    return "rate_limit";
  }
  if (msg.includes("not found") || msg.includes("404")) {
    return "not_found";
  }
  if (msg.includes("invalid") || msg.includes("required") || msg.includes("must be")) {
    return "validation";
  }
  if (msg.includes("extension")) {
    return "extension";
  }
  return "unknown";
}

// ============ Content Analysis ============

interface ContentInsights {
  hashtag_count: number;
  hashtags: string[];
  mention_count: number;
  mentions: string[];
  url_count: number;
  has_emoji: boolean;
  word_count: number;
  character_count: number;
}

function analyzeContent(content: string): ContentInsights {
  const hashtags = content.match(/#\w+/g) || [];
  const mentions = content.match(/@\w+/g) || [];
  const urls = content.match(/https?:\/\/[^\s]+/g) || [];
  const hasEmoji = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/u.test(content);
  const words = content.trim().split(/\s+/).filter(w => w.length > 0);

  return {
    hashtag_count: hashtags.length,
    hashtags: hashtags.slice(0, 5), // Limit to 5
    mention_count: mentions.length,
    mentions: mentions.slice(0, 5),
    url_count: urls.length,
    has_emoji: hasEmoji,
    word_count: words.length,
    character_count: content.length,
  };
}

// ============ Timing Utility ============

/**
 * Create a timer for measuring tool execution duration
 */
export function createTimer(): () => number {
  const start = Date.now();
  return () => Date.now() - start;
}

// ============ Session & Connection Events ============

/**
 * Track MCP server start
 */
export function trackServerStart(): void {
  capture("mcp_server_started", {
    machine_id: anonymousMachineId,
  });
}

/**
 * Track extension connection with user identity
 */
export function trackExtensionConnected(tier?: string): void {
  capture("mcp_extension_connected", {
    tier: tier || "unknown",
  });

  // Update user's last connection time
  if (userId) {
    incrementUserProperty("total_sessions");
  }
}

/**
 * Track extension disconnection
 */
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

/**
 * Track tool usage with timing and sequence
 */
export function trackToolUsage(
  toolName: string,
  platform?: string,
  success: boolean = true,
  durationMs?: number
): void {
  toolCallCount++;

  capture("mcp_tool_called", {
    tool: toolName,
    social_platform: platform || "unknown",
    success,
    duration_ms: durationMs,
    is_slow: durationMs ? durationMs > 5000 : undefined, // Flag slow calls (>5s)
  });

  lastToolName = toolName;

  // Increment lifetime tool usage
  if (userId && success) {
    incrementUserProperty("total_tool_calls");
    incrementUserProperty(`tool_${toolName}_count`);
  }
}

/**
 * Track errors with categorization
 */
export function trackError(toolName: string, errorMessage: string): void {
  const category = categorizeError(errorMessage);

  capture("mcp_tool_error", {
    tool: toolName,
    error: errorMessage.slice(0, 200),
    error_category: category,
  });

  // Increment error counts
  if (userId) {
    incrementUserProperty("total_errors");
    incrementUserProperty(`error_${category}_count`);
  }
}

// ============ Action-Specific Events ============

/**
 * Track post creation with content analysis
 */
export function trackPostCreated(
  platform: string,
  content: string,
  success: boolean,
  durationMs?: number
): void {
  const insights = analyzeContent(content);

  if (success) sessionPostsCreated++;

  capture("mcp_post_created", {
    social_platform: platform,
    success,
    duration_ms: durationMs,
    ...insights,
  });

  if (userId && success) {
    incrementUserProperty("total_posts_created");
    incrementUserProperty(`posts_${platform}_count`);
  }
}

/**
 * Track reply sent with content analysis
 */
export function trackReplySent(
  platform: string,
  content: string,
  success: boolean,
  durationMs?: number
): void {
  const insights = analyzeContent(content);

  if (success) sessionRepliesSent++;

  capture("mcp_reply_sent", {
    social_platform: platform,
    success,
    duration_ms: durationMs,
    ...insights,
  });

  if (userId && success) {
    incrementUserProperty("total_replies_sent");
    incrementUserProperty(`replies_${platform}_count`);
  }
}

/**
 * Track engagement actions (like, repost, bookmark, etc.)
 */
export function trackEngagement(
  platform: string,
  actions: string[],
  success: boolean,
  durationMs?: number
): void {
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

  if (userId && success) {
    incrementUserProperty("total_engagements");
    actions.forEach(action => {
      incrementUserProperty(`engagement_${action}_count`);
    });
  }
}

/**
 * Track search performed
 */
export function trackSearch(
  platform: string,
  searchType: "posts" | "people",
  success: boolean,
  durationMs?: number
): void {
  if (success) sessionSearches++;

  capture("mcp_search_performed", {
    social_platform: platform,
    search_type: searchType,
    success,
    duration_ms: durationMs,
  });

  if (userId && success) {
    incrementUserProperty("total_searches");
    incrementUserProperty(`searches_${platform}_count`);
  }
}

/**
 * Track profile viewed (LinkedIn)
 */
export function trackProfileViewed(success: boolean, durationMs?: number): void {
  if (success) sessionProfileViews++;

  capture("mcp_profile_viewed", {
    social_platform: "linkedin",
    success,
    duration_ms: durationMs,
  });

  if (userId && success) {
    incrementUserProperty("total_profiles_viewed");
  }
}

/**
 * Track connection request sent (LinkedIn)
 */
export function trackConnectionRequest(
  success: boolean,
  hasNote: boolean,
  durationMs?: number
): void {
  if (success) sessionConnectionRequests++;

  capture("mcp_connection_request", {
    social_platform: "linkedin",
    success,
    has_note: hasNote,
    duration_ms: durationMs,
  });

  if (userId && success) {
    incrementUserProperty("total_connection_requests");
    if (hasNote) {
      incrementUserProperty("connection_requests_with_note");
    }
  }
}

/**
 * Track persona usage
 */
export function trackPersonaUsed(personaId: string, personaName: string): void {
  capture("mcp_persona_used", {
    persona_id: personaId,
    persona_name: personaName,
    is_custom: !personaId.startsWith("system_"),
  });

  if (userId) {
    incrementUserProperty("total_persona_uses");
    incrementUserProperty(`persona_${personaId}_uses`);
  }
}

/**
 * Track feed viewed
 */
export function trackFeedViewed(platform: string, postCount: number, durationMs?: number): void {
  capture("mcp_feed_viewed", {
    social_platform: platform,
    post_count: postCount,
    duration_ms: durationMs,
  });

  if (userId) {
    incrementUserProperty("total_feeds_viewed");
    incrementUserProperty(`feeds_${platform}_count`);
  }
}

// ============ Group Analytics ============

/**
 * Update group properties for the subscription tier
 */
export function updateTierGroupProperties(): void {
  if (!userTier) return;

  try {
    totalEventsQueued++;
    fetch(`${POSTHOG_HOST}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: POSTHOG_API_KEY,
        event: "$groupidentify",
        distinct_id: getDistinctId(),
        properties: {
          $group_type: "subscription_tier",
          $group_key: userTier,
          $group_set: {
            name: userTier,
            updated_at: new Date().toISOString(),
          },
        },
      }),
    })
      .then(() => { totalEventsSent++; })
      .catch(() => { totalEventsFailed++; });
  } catch {
    totalEventsFailed++;
  }
}
