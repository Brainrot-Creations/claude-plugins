---
name: using-socials
description: Use when the user wants to read feeds, inspect posts, draft or post replies, list personas, or control the browser for X, LinkedIn, or Reddit via the Socials extension. Apply whenever Socials MCP tools are relevant to the task.
---

# Working with Socials (MCP tools)

Follow this flow unless the user explicitly asks for something else.

## 1. Verify connectivity

- Call **`socials_check_access`** first.
- If the extension is not connected, tell the user to enable **Agent Mode** in Socials and keep the browser open; do not assume tools work until access check succeeds.

## 2. Open the right context in the browser

- Use **`socials_open_tab`** with a concrete URL before scraping feeds or pages (e.g. `https://x.com/home` for X).
- Use **`socials_navigate`**, **`socials_reload_tab`**, **`socials_get_active_tab`**, or **`socials_scroll`** when you need to move, refresh, or load more content.

## 3. Read content

- **`socials_get_feed`** — recent posts from a feed (requires **Socials Pro**; extension should be on the right feed page).
- **`socials_get_post_context`** — thread/reply context for a **post URL** (Pro).
- **`socials_get_page_content`** — content from the **current** page after you have opened the right tab.

## 4. Drafting and posting

- **`socials_list_personas`** — when the user cares about tone or persona-backed generation.
- **`socials_generate_reply`** — optional AI-assisted draft from Socials (Pro); you may also write copy yourself.
- **`socials_quick_reply`** — posts a reply **in the browser** from the feed. **Always confirm exact text with the user before calling** — this is a real post.

## 5. Errors and limits

- If a tool says **not Pro** or **not connected**, explain clearly and do not retry blindly.
- Respect each platform’s terms and the user’s intent; prefer summarizing and drafting over automating spam or harassment.
