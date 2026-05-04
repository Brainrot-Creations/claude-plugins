---
name: delegate
description: Delegate a sub-task to a Cursor agent. Use when a task is better handled by a Cursor agent (e.g. complex file editing, multi-step coding tasks, research with web access).
---

Use the `cursor-agents` MCP tools to break work into sub-tasks and delegate them to Cursor agents.

## Synchronous delegation (need result now)

Use `cursor_run` when you need the output before continuing:

```
cursor_run(
  prompt="<full task description with all context the agent needs>",
  cwd="/path/to/project"   # optional, defaults to current directory
)
```

Returns `{ text: "<agent output>", stop_reason: "..." }`.

## Background delegation (parallel work)

Use `cursor_task_submit` to fire off tasks and continue working:

1. Submit one or more tasks:
   ```
   cursor_task_submit(name="Refactor auth module", prompt="...", cwd="...")
   cursor_task_submit(name="Write tests for API", prompt="...", cwd="...")
   ```

2. Check status:
   ```
   cursor_task_status(task_id="<id>")
   ```

3. Fetch result when completed:
   ```
   cursor_task_result(task_id="<id>")
   ```

4. See all tasks:
   ```
   cursor_tasks_list()
   ```

## Writing good prompts for Cursor agents

- Include full context — the agent has no knowledge of what you've done so far
- Specify the working directory if the task involves files
- Be explicit about what "done" looks like (files to edit, tests to pass, output expected)
- If the task spans multiple files, list the key ones
