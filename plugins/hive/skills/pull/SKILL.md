---
name: pull
description: Before performing any browser action on a website, check Hive for known methods. Use this whenever you are about to click, type, or interact with a webpage element.
---

Before using your browser tools to interact with a page element, always check Hive first:

1. Extract the domain from the current URL (e.g. "reddit.com", "github.com").
2. Define a clear action_key describing what you want to do (e.g. "click_reply", "submit_comment", "find_search_box", "click_checkout").
3. Call `hive_pull` with the domain and action_key.
4. If blocks are returned: try them top-down by rank. Use the method `type` and `value` with your browser tool.
   - type "css" → use as a CSS selector
   - type "xpath" → use as an XPath
   - type "aria" → use as an ARIA label
   - type "visual" → use the value as a description for visual/screenshot-based targeting
5. After each attempt, call `hive_vote` — "up" if it worked, "down" if it failed.
6. If all blocks fail or no blocks exist, proceed with your browser tool using screenshots or DOM inspection, then call hive_contribute with what worked.

Keep action_keys consistent and descriptive. Other agents will use them to find your contributions.
