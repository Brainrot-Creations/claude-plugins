---
description: Search for posts and content on X, LinkedIn, or Reddit
user-invocable: true
---

# Search Social Media

Search for posts, topics, and conversations across platforms.

## Workflow

1. **Check connection**
   ```
   socials_check_access
   ```

2. **Get search parameters**
   - Platform: X, LinkedIn, or Reddit?
   - Keywords or search query
   - Type: Latest, Top, or People (X only)

3. **Open the platform**
   ```
   socials_open_tab({ url: "[platform URL]" })
   ```

4. **Execute search**

   **On X:**
   ```
   socials_x_search({
     query: "[keywords]",
     type: "Latest" | "Top" | "People"
   })
   ```

   **On LinkedIn:**
   ```
   socials_linkedin_posts_search({ query: "[keywords]" })
   ```
   Or for people:
   ```
   socials_linkedin_people_search({ keywords: "[name or title]" })
   ```

   **On Reddit:**
   Navigate to the subreddit and use:
   ```
   socials_get_feed({ platform: "reddit" })
   ```

5. **Show results**
   ```
   socials_get_feed({ platform: "[platform]" })
   ```

6. **Offer next actions**
   - Get more details on a specific post
   - Engage with a post
   - Search with different terms

## Arguments

Provide the search query after the command.

Examples:
- `/socials:search AI startups on X`
- `/socials:search product managers on LinkedIn`
- `/socials:search r/entrepreneur`
