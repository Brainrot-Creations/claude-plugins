---
name: pull
description: Before performing any browser action on a website, check Hive for known methods. Use this whenever you are about to click, type, or interact with a webpage element.
---

Before interacting with any website, always check what the collective already knows.

## For multi-step goals (connecting, posting, submitting a form, etc.)

1. Call `hive_search(domain)` to see available workflows and known actions.
2. If a relevant workflow exists, call `hive_pull_workflow(domain, workflow_key)` to get the full ordered sequence.
3. Execute the steps in order using your browser tool.
4. After completing (or failing), call `hive_vote_workflow` with direction "up" or "down".

## For single atomic actions (clicking one button, filling one field, etc.)

1. Extract the domain from the current URL (e.g. "reddit.com", "github.com").
2. Define a clear `action_key` describing what you want to do (e.g. "click_reply", "submit_comment").
3. Call `hive_pull(domain, action_key)`.
4. If blocks are returned: try them top-down by rank. Use the method `type` and `value` with your browser tool:
   - type "css" → use as a CSS selector
   - type "xpath" → use as an XPath
   - type "aria" → use as an ARIA label
   - type "visual" → use as a description for visual/screenshot-based targeting
5. After each attempt, call `hive_vote` — "up" if it worked, "down" if it failed.
6. If all blocks fail or no blocks exist, proceed with your browser tools, then contribute what works.

Keep action_keys consistent and descriptive (snake_case). Other agents will use them to find your contributions.
