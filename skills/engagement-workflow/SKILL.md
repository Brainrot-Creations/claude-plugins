---
name: engagement-workflow
description: Use when the user wants to grow their audience, find relevant posts to engage with, or build a consistent engagement routine on X, LinkedIn, or Reddit. Helps identify high-value posts and craft authentic responses.
---

# Engagement Workflow

Help users find and engage with relevant posts to grow their presence authentically.

## 1. Understand their goals

Ask (if not clear):
- **Platform**: X, LinkedIn, or Reddit?
- **Niche/topics**: What subjects do they want to be known for?
- **Time available**: Quick 10-min session or deeper engagement?
- **Growth goal**: Build authority, network, drive traffic, or just stay active?

## 2. Find relevant content

### On X
1. **`socials_open_tab`** with `https://x.com/home` or `https://x.com/explore`
2. **`socials_x_search`** with relevant keywords, hashtags, or `from:influencer`
3. **`socials_get_feed`** to see what's available
4. Look for posts with good engagement potential:
   - Recent (< 2-4 hours old for X)
   - From accounts in their niche
   - Has some engagement but not saturated (10-100 replies ideal)
   - Asks a question or shares an opinion they can add to

### On LinkedIn
1. **`socials_open_tab`** with `https://www.linkedin.com/feed/`
2. **`socials_get_feed`** to scan posts
3. Prioritize:
   - Posts from connections or industry leaders
   - Posts with < 50 comments (not saturated)
   - Questions, polls, or discussion starters

### On Reddit
1. **`socials_open_tab`** with relevant subreddit (e.g., `https://www.reddit.com/r/startups/new`)
2. **`socials_get_feed`** to see recent posts
3. Look for:
   - New posts (< 1 hour) where early comments get visibility
   - Questions where they have genuine expertise
   - Discussions they can add unique value to

## 3. Qualify posts before engaging

For each potential post, quickly assess:
- **Relevance**: Does it connect to their expertise/brand?
- **Value-add**: Can they contribute something meaningful (not just "great post!")?
- **Risk**: Any controversy or negativity to avoid?
- **Fit**: Does it align with their persona/voice?

Skip posts where they have nothing unique to add.

## 4. Craft the engagement

Two options:
- **Use `socials_generate_reply`** if they want their persona's voice
- **Write it yourself** based on their style and the post content

Good replies:
- Add a specific insight, experience, or counterpoint
- Ask a thoughtful follow-up question
- Share relevant data or a brief story
- Agree AND extend (not just agree)

Bad replies:
- Generic ("Love this!", "So true!")
- Self-promotional without adding value
- Argumentative without substance

## 5. Post with confirmation

**Always confirm the exact text before posting.**

Use **`socials_quick_reply`** to post. Optionally use **`socials_engage_post`** to like/repost if the content genuinely resonates.

## 6. Suggest a routine

For consistent growth, suggest a pattern:
- **X**: 15-30 min daily, 5-10 quality replies
- **LinkedIn**: 3-5x/week, 3-5 thoughtful comments
- **Reddit**: Focus on 2-3 subreddits, be a regular contributor

Remind them: quality > quantity. One great reply beats ten generic ones.

## Tools used

| Tool | When |
|------|------|
| `socials_open_tab` | Start on the right page |
| `socials_x_search` | Find relevant X content |
| `socials_get_feed` | See available posts |
| `socials_get_post_context` | Deeper context before replying |
| `socials_list_personas` | Check available personas |
| `socials_generate_reply` | AI-assisted reply (optional) |
| `socials_quick_reply` | Post the reply |
| `socials_engage_post` | Like/repost (X only) |
