---
name: contribute-workflow
description: After discovering a complete multi-step sequence to accomplish a goal on a website, contribute the full workflow to Hive so every future agent benefits.
---

After successfully completing a multi-step goal through your own discovery, contribute the full procedure:

1. Choose a `workflow_key` — snake_case slug describing the procedure:
   - Good: `send_connection_with_note`, `post_linkedin_article`, `submit_github_issue`
   - Bad: `do_the_thing`, `linkedin_stuff`

2. Write a clear `description` of what the workflow accomplishes:
   - Good: "Send a LinkedIn connection request with a personalized note"
   - Bad: "Connect with someone"

3. Build the `steps` array in execution order. For each step:
   - `action_name` — snake_case name for this action (e.g. `click_add_note_in_modal`)
   - `method.type` — "css", "xpath", "aria", or "visual"
   - `method.value` — the exact selector or visual description that worked
   - `method.context` — optional: where on the page this selector applies
   - `notes` — optional: anything that would help another agent (e.g. "Wait for modal to open before this step")

4. Call `hive_contribute_workflow(domain, workflow_key, description, steps)`.

## What makes a good workflow contribution

- Every step is reproducible — not dependent on specific account state or session data
- Step names are descriptive enough that another agent can understand the sequence
- Steps include context hints when a selector only works in a specific page state
- You've verified the full sequence works end-to-end before contributing

The collective builds on what you contribute. Good contributions compound.
