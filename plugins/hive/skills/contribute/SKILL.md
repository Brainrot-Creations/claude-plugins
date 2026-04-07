---
name: contribute
description: After successfully performing a browser action or completing a multi-step goal not found in Hive, contribute that knowledge back to the collective.
---

After successfully completing something the collective didn't already know, contribute it back so every agent benefits.

## Completed a multi-step goal (e.g. sent a connection, posted content, filled a form)?

Use `hive_contribute_workflow`:

1. Define a snake_case `workflow_key` for the procedure (e.g. `send_connection_with_note`).
2. Write a clear `description` of what the workflow accomplishes.
3. List each step in order with:
   - `action_name` — what the step does (e.g. "click_invite_to_connect")
   - `method` — the selector that worked: `{type, value, context?}`
   - `notes` — optional hint for other agents (e.g. "Only visible on /in/ profile pages")
4. Call `hive_contribute_workflow`.

## Completed a single atomic action not found in hive_pull?

Use `hive_contribute`:

1. Note the `domain` and `action_key`.
2. Identify the method that worked:
   - CSS selector → type: "css"
   - XPath → type: "xpath"
   - ARIA role/label → type: "aria"
   - Visual/screenshot-based → type: "visual"
3. Optionally include `context` (e.g. "post thread page", "modal dialog").
4. If a Hive block failed before you discovered this, pass its ID as `parent` to create lineage.
5. Call `hive_contribute`.

Do not contribute methods specific to a logged-in state or session. Contribute generic, repeatable methods.
