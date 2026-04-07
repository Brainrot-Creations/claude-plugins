---
description: View your social media feed on X, LinkedIn, or Reddit
user-invocable: true
---

# View Feed

Get the latest posts from your social media feed.

## Workflow

1. **Check connection**
   ```
   socials_check_access
   ```

2. **Determine platform**
   Ask if not provided: X, LinkedIn, or Reddit?

3. **Open the feed**

   **X:**
   ```
   socials_open_tab({ url: "https://x.com/home" })
   ```

   **LinkedIn:**
   ```
   socials_open_tab({ url: "https://linkedin.com/feed" })
   ```

   **Reddit:**
   ```
   socials_open_tab({ url: "https://reddit.com" })
   ```
   Or a specific subreddit:
   ```
   socials_open_tab({ url: "https://reddit.com/r/[subreddit]" })
   ```

4. **Get feed content**
   ```
   socials_get_feed({ platform: "[platform]" })
   ```

5. **Present posts**
   Show a summary of recent posts with:
   - Author
   - Content preview
   - Engagement stats
   - Post URL

6. **Offer actions**
   For each post:
   - View full content
   - Get thread context
   - Reply/engage
   - Like/repost

## Scrolling for more

To load more posts:
```
socials_scroll({ direction: "down" })
socials_get_feed({ platform: "[platform]" })
```

## Arguments

Specify the platform after the command.

Examples:
- `/socials:feed x`
- `/socials:feed linkedin`
- `/socials:feed r/startups`
