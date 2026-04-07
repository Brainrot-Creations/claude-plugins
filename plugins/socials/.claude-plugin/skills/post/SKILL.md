---
description: Create and publish a post on X, LinkedIn, or Reddit
user-invocable: true
---

# Create a Post

Create and publish content to your social media accounts.

## Workflow

1. **Check connection**
   ```
   socials_check_access
   ```

2. **Get user input**
   Ask if not provided:
   - Platform: X, LinkedIn, or Reddit?
   - Topic: What to post about?
   - Tone: Professional, casual, witty?
   - Length: Short, medium, thread?

3. **Get available personas**
   ```
   socials_list_personas
   ```
   Recommend an appropriate persona based on platform and topic.

4. **Generate or draft content**
   Either use `socials_generate_post` with a persona, or draft it directly.

5. **Show draft and get approval**
   Always show the full post text before publishing. Ask:
   - Does this look good?
   - Any changes needed?
   - Ready to post?

6. **Publish**
   ```
   socials_create_post
   ```

## Platform tips

### X (Twitter)
- Keep under 280 characters for single posts
- Threads: Start with a hook, number each tweet
- Use line breaks for readability

### LinkedIn
- Can be longer (up to 3000 chars)
- Story format works well
- End with a question for engagement

### Reddit
- Choose the right subreddit
- Follow subreddit rules
- Add value, don't just promote

## Arguments

If the user provides text after `/socials:post`, use it as the topic or content idea.

Example: `/socials:post about our new feature launch on LinkedIn`
