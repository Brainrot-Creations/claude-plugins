---
name: using-socials
description: Use when the user wants to read feeds, inspect posts, draft or post replies, list personas, or control the browser for X, LinkedIn, Reddit, or YouTube via the Socials extension. Apply whenever Socials MCP tools are relevant to the task.
---

# Working with Socials (MCP tools)

Follow this flow unless the user explicitly asks for something else.

## 1. Verify connectivity

- Call **`socials_check_access`** first.
- If the extension is not connected, tell the user they need a **paid** Socials plan (free tier does not connect), to stay signed in, and to keep the browser open with the extension loaded; do not assume tools work until access check succeeds.

## 2. Open the right context in the browser

- Use **`socials_open_tab`** with a concrete URL first. That tab is **pinned** as the Socials **agent tab**: feed, reply, scroll, search, and engage run there even if the user is focused on another tab or another **Chrome window**—automation uses the pinned tab id, not “the focused window.” By default the tab opens in the **background**; use **`focus: true`** to switch to it, or **`socials_focus_agent_tab`** to bring that tab’s window forward. Additional **`socials_open_tab`** calls open in the **same window as the pinned tab** when possible so a new empty window does not hijack the agent workspace.
- **`socials_get_agent_tab`** — see which tab is pinned (`platform` may be `x`, `linkedin`, `reddit`, or `youtube`). **`socials_set_agent_tab`** — pin an existing tab (e.g. X or YouTube already open) by `tab_id` from **`socials_get_active_tab`**.
- Use **`socials_navigate`**, **`socials_reload_tab`**, or **`socials_scroll`** on the agent tab (omit `tab_id` unless targeting a specific tab). **`socials_get_active_tab`** is the **focused** tab (what the user sees), not necessarily the agent tab.
- **If platform is X:** use **`socials_x_search`** first, then **`socials_get_feed`** / **`socials_quick_reply`** / (optionally) **`socials_engage_post`** on results.
- **If platform is LinkedIn:** use **`socials_open_tab`** with `https://www.linkedin.com/feed/` and then **`socials_get_feed`** / **`socials_quick_reply`** (optionally **`socials_scroll`**) to work with posts and replies. Use **`socials_linkedin_posts_search`** to search for posts, then **`socials_get_feed`** to read results. Use **`socials_linkedin_engage_post`** to like or repost.
- **If platform is Reddit:** use **`socials_open_tab`** with the subreddit URL and then **`socials_get_feed`** / **`socials_quick_reply`** (optionally **`socials_scroll`**) to work with posts.
- **If the user wants YouTube:** use **`socials_open_tab`** with `https://www.youtube.com/` (home), a watch URL, or **search results** `https://www.youtube.com/results?search_query=...` where the query value is **URL-encoded** (same idea as `encodeURIComponent`). Refine search with **`socials_navigate`** on the agent tab. To apply filters (Type/Duration/Upload date/Features/Prioritize), use **`socials_apply_search_filters`** with `platform: "youtube"` and filter labels. Read search cards with **`socials_get_page_content`**; on **watch** pages use **`socials_get_page_content`** for metadata + comments (each has **`commentId`** — the YouTube `lc` token). To **reply to a YouTube comment**, use **`socials_quick_reply`** with `post_id` set to that **`commentId`**. **`socials_get_feed`** is not used for YouTube.

## 3. Read content

- **`socials_fetch_image`** — pass a direct **image URL** (e.g. `thumbnailUrl` from YouTube cards, X `pbs.twimg.com`, Reddit preview URLs). Returns an **MCP image** for side-by-side visual inspection without opening tabs. **Token policy:** image blocks are high-cost; use this only when it materially improves the outcome (visual comparison/detail checks). If text/URLs are enough, keep thumbnails as URLs and summarize from metadata. Requires the same **Socials Pro + extension** connection as other MCP tools. Public CDN URLs work; cookie-only private URLs may fail (fetch runs in the MCP process).
- **`socials_get_feed`** — recent posts from a feed (requires **Socials Pro**; extension should be on the right feed page).
- **`socials_get_post_context`** — thread/reply context for a **post URL** (Pro).
- **`socials_get_page_content`** —
  - On **YouTube search results** (`/results?search_query=…`): returns **video cards** (title, URL, **thumbnail URL**, channel, views, duration, snippet) with auto-scroll until **`limit`** is reached or no new rows load.
  - On **YouTube watch pages** (`/watch?v=…`): returns structured `page_data` with title/channel/views/likes/description/comments count and extracted comments. Use `comment_sort: "top" | "newest"` to switch ordering before scrape, `comments_limit` (1–120, default 20), and `expand_description` (default true).
  - On X/LinkedIn/Reddit: feed snippets as before.

## 4. Drafting and posting

- **`socials_list_personas`** — when the user cares about tone or persona-backed generation.
- **`socials_generate_reply`** — optional AI-assisted draft from Socials (Pro); you may also write copy yourself.
- **`socials_quick_reply`** — posts a reply **in the browser**: X/LinkedIn from the feed (post id from **`socials_get_feed`**); **YouTube watch** — `post_id` = **`commentId`** from **`socials_get_page_content`** `page_data.comments`. **Always confirm exact text with the user before calling** — this is a real post.

## 5. Errors and limits

- If a tool says **not Pro** or **not connected**, explain clearly and do not retry blindly.
- Respect each platform’s terms and the user’s intent; prefer summarizing and drafting over automating spam or harassment.
