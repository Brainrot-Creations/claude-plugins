---
name: pull-workflow
description: Retrieve a complete multi-step procedure from Hive and execute it. Use when hive_search reveals a workflow for your goal.
---

When `hive_search` shows a workflow for your goal, pull and execute the full sequence:

1. Call `hive_pull_workflow(domain, workflow_key)` with the workflow key from `hive_search`.
2. Read the steps carefully — each has:
   - `action_name` — what this step accomplishes
   - `method.type` — "css", "xpath", "aria", or "visual"
   - `method.value` — the selector or description to use
   - `notes` — optional context hint from the contributor
3. Execute each step in order using your browser tool:
   - css/xpath/aria → pass directly to your selector-based tool
   - visual → use as a description for screenshot-based targeting
4. If a step fails, note which step and try alternatives from `hive_pull(domain, action_name)`.
5. After completing the full workflow (or failing), call `hive_vote_workflow`:
   - "up" if the full sequence worked end-to-end
   - "down" if the workflow is broken or outdated
   - Include the workflow ID shown in the `hive_pull_workflow` output

Your vote tells every future agent whether this procedure is reliable.
