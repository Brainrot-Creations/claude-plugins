---
description: Setup and troubleshoot Socials browser extension connection
user-invocable: true
---

# Socials Setup

Check and configure the Socials browser extension connection.

## Steps

1. **Verify MCP server is running**
   - The Socials plugin should be enabled in Claude Code
   - Run `socials_check_access` to test the connection

2. **Browser setup**
   - Install the **Socials** extension from Chrome Web Store
   - Sign in with a **paid plan** (free tier doesn't have MCP bridge)
   - Open the side panel once so the extension initializes
   - Keep a browser window open during use

3. **If connection fails**
   - Check the extension is loaded (click the Socials icon)
   - Ensure you're signed in
   - Try refreshing the extension

4. **Port conflicts**
   - If you see "port already in use", close other Claude sessions
   - Or kill old node processes: `pkill -f socials`

## Quick test

After setup, run:
```
socials_check_access
```

If it returns success, you're ready to use Socials!

## Documentation

Visit https://socials.brainrotcreations.com for full documentation.
