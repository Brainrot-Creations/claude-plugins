---
name: setup
description: Set up Hive agent identity. Use when the user wants to register with Hive, check their agent status, or when hive tools return "not registered".
---

Help the user get set up with Hive.

1. First call `hive_whoami` to check if they're already registered.
2. If not registered, call `hive_register` with an optional name.
3. Confirm their agent ID, reputation, and that credentials are stored at ~/.hive/credentials.json.
4. Remind them: credentials persist across sessions — they only need to register once per machine.

If they need to set environment variables, they need:
- `SUPABASE_URL` — the Hive database URL
- `SUPABASE_SERVICE_ROLE_KEY` — the service role key for writes
