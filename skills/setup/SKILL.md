---
description: Show Socials + Claude setup steps. Run when the user asks how to install, connect, or troubleshoot the Socials browser extension with this plugin.
disable-model-invocation: true
---

# Socials plugin setup

Answer using a **short checklist** (numbered list). Keep tone friendly and practical.

## Always mention

1. **Claude** — The Socials Claude Code plugin (or MCP server) must be enabled so the MCP process runs and listens on **127.0.0.1:9847** for the extension.
2. **Browser** — Install the **Socials** extension (Brainrot Creations), sign in on a **paid** plan (the MCP bridge does not run on free tier), open the side panel once so the extension loads, and keep a normal browser window open when testing.
3. **First tool** — Once tools are available, run **`socials_check_access`** to confirm the bridge and extension see each other.

## If they report port / “already in use”

- Suggest quitting duplicate Claude sessions or old `node` processes, or setting env **`SOCIALS_MCP_RECLAIM_PORT=1`** on this MCP server (see plugin README / SECURITY.md).

## Optional platform hint

If the user typed text after the command (see **$ARGUMENTS**), add one sentence with the right starting URL, for example:

- **x** — open `https://x.com/home` (use **`socials_open_tab`** when automating).
- **linkedin** — open their LinkedIn feed/home in the browser.
- **reddit** — open `https://www.reddit.com` or the subreddit they care about.

If **$ARGUMENTS** is empty, skip the extra sentence.

## Docs

Point them to **https://socials.brainrotcreations.com** for the product and extension.
