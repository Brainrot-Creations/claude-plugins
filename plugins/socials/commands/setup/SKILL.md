---
description: Interactive setup wizard for Socials browser extension
user-invocable: true
---

# Socials Setup Wizard

Guide the user through connecting the Socials browser extension step by step. Be friendly and conversational.

## Step 1: Check Current Status

First, try `socials_check_access` to see if already connected.

**If connected:**
Say: "Great news! Socials is already connected and ready to go!"
Then offer quick start options:
- "Try `/post` to create your first post"
- "Try `/feed x` to see your X timeline"
- "Or just tell me what you'd like to do on social media"

**If not connected or tool fails:** Continue with setup below.

## Step 2: Welcome & Overview

Say something like:
"Let's get you set up with Socials! This will take about 2 minutes.

Socials connects Claude to your social media accounts (X, LinkedIn, Reddit) through a browser extension. You'll be able to:
- Post and reply directly from here
- Search and browse feeds
- Engage with your audience
- All without leaving Claude Code

Let's make sure you have everything ready."

## Step 3: Check Browser Extension

Ask: "Do you have the **Socials browser extension** installed in Chrome?"

**If no or unsure:**
"No problem! Here's how to get it:
1. Go to the Chrome Web Store
2. Search for **'Socials by Brainrot Creations'**
3. Click **Add to Chrome**

Or visit https://socials.brainrotcreations.com for direct links.

Let me know once it's installed!"

**If yes:** Continue

## Step 4: Activate the Connection

Guide them:
"Great! Now let's activate the connection:

1. **Open your browser** (Chrome) with the Socials extension
2. **Click the Socials icon** in your toolbar (puzzle piece area)
3. **Open the side panel** - this starts the connection
4. **Sign in** to your Socials account if prompted
5. Look for a **'Connected'** status in the extension

Keep that browser window open - it's the bridge between Claude and your social accounts.

Ready? Let me check if we're connected..."

## Step 5: Verify Connection

Try `socials_check_access` again.

**If success:**
"We're connected! You're all set to use Socials with Claude.

Here's what you can do now:
- `/post` - Create and publish a post
- `/engage` - Find posts to reply to
- `/search` - Search for content
- `/feed` - Browse your timeline

Or just tell me what you'd like to do - 'help me post about X' or 'find AI discussions on LinkedIn'

What would you like to try first?"

**If still failing:**
"Hmm, still not connecting. Let's troubleshoot:

1. **Is your browser open?** The extension needs an active browser window
2. **Is the side panel open?** Click the Socials icon and open it
3. **See 'Connected' in the extension?** If not, try refreshing the page
4. **Multiple Claude sessions?** Close other Claude Code windows - they might be using the port

Try those and let me know what you see!"

## Troubleshooting

**"Port already in use" error:**
"Another process is using the connection port. Try:
- Close other Claude Code sessions
- Or run in terminal: `pkill -f socials`
Then restart Claude Code."

**Extension shows "Disconnected":**
"The extension lost connection. Try:
- Refresh the browser page
- Close and reopen the Socials side panel
- Make sure you're still signed in"

**Tools not appearing:**
"The MCP server might not be running. Try:
- Run `/reload-plugins` in Claude Code
- Check the plugin is installed: `/plugin` → Installed tab"

## Tone

Be encouraging and helpful throughout. Celebrate small wins ("Extension installed? Great!"). Don't overwhelm with info - reveal steps progressively.
