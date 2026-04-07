---
description: Find relevant posts and engage with thoughtful replies
user-invocable: true
---

# Engage with Posts

Find relevant conversations and craft valuable replies to grow your presence.

## Workflow

1. **Check connection**
   ```
   socials_check_access
   ```

2. **Get targeting info**
   Ask if not provided:
   - Platform: X, LinkedIn, or Reddit?
   - Topics/keywords to search for
   - Niche or expertise area
   - Time available (quick session or deep engagement?)

3. **Find opportunities**

   **On X:**
   ```
   socials_open_tab({ url: "https://x.com/home" })
   socials_x_search({ query: "[keywords]", type: "Latest" })
   socials_get_feed({ platform: "x" })
   ```

   **On LinkedIn:**
   ```
   socials_open_tab({ url: "https://linkedin.com/feed" })
   socials_linkedin_posts_search({ query: "[keywords]" })
   socials_get_feed({ platform: "linkedin" })
   ```

   **On Reddit:**
   ```
   socials_open_tab({ url: "https://reddit.com/r/[subreddit]/new" })
   socials_get_feed({ platform: "reddit" })
   ```

4. **Qualify posts**
   Look for:
   - Recent posts (< 24 hours)
   - Relevant to user's expertise
   - Not already saturated with replies
   - Genuine opportunity to add value

5. **Get full context**
   ```
   socials_get_post_context({ post_url: "..." })
   ```

6. **Craft replies**
   Use `socials_generate_reply` with appropriate persona, or draft directly.

   Good replies:
   - Add unique insight or experience
   - Answer questions helpfully
   - Extend the conversation

   Bad replies:
   - Generic ("Great post!")
   - Pure self-promotion
   - Off-topic

7. **Get approval and post**
   Always confirm exact text before posting:
   ```
   socials_quick_reply({ post_url: "...", reply_text: "..." })
   ```

## Arguments

If the user provides text after `/socials:engage`, use it as the topic focus.

Example: `/socials:engage with AI startup discussions on X`
