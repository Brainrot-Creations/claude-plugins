---
name: product-promotion
description: Use when the user wants to promote their product, service, or project on social media without being spammy. Covers how to naturally mention products in replies, when promotion is appropriate, and platform-specific rules.
---

# Product Promotion Guide

Help users promote their products authentically without coming across as spam.

## The golden rule

**Add value first, mention product second.**

Every promotional post or reply must stand on its own merit. If you removed the product mention entirely, the content should still be worth posting.

## When product promotion works

### Good opportunities
- Someone asks for tool/product recommendations in your category
- A discussion about a problem your product solves
- Sharing genuine results or lessons learned from building
- Responding to direct questions about solutions
- Show-and-tell threads (X) or dedicated promo threads (Reddit)

### Bad opportunities
- Random unrelated posts (looks like spam)
- Emotional/personal posts (insensitive)
- Threads already saturated with self-promo
- Controversial topics (brand risk)
- When you have nothing valuable to add beyond "use my product"

## Platform-specific rules

### X (Twitter)
- Replies can mention products if genuinely relevant
- Don't spam the same reply to multiple people
- Quote tweets with added insight work well
- Building in public threads are accepted promo
- Avoid replying to big accounts just for visibility (transparent and cringe)

### LinkedIn
- Comments should add professional value first
- Soft mentions work better than hard pitches
- Share case studies and learnings, not just features
- Connection request + immediate pitch = blocked
- Posts about your journey/building are accepted

### Reddit
- **Most strict about self-promotion**
- Many subs ban it entirely or require specific threads
- Ratio matters: 90% helpful content, 10% promo max
- Always disclose if it's your product ("I built X...")
- Never create fake accounts to promote
- Add genuine value in comments consistently before ever mentioning your product

## How to structure a promotional reply

### Pattern 1: Help first, mention after
```
[Directly address their question/problem with useful insight]

[Optional: share relevant experience]

[Brief mention: "I actually built [Product] for this exact reason" or "We solve this with [Product]"]

[Back to helping: additional tip or offer to answer questions]
```

### Pattern 2: Story-driven
```
[Share a relevant experience or struggle you had]

[What you learned or how you solved it]

[Natural mention: "That's why I ended up building [Product]"]

[Invitation: "Happy to share more if useful"]
```

### Pattern 3: Direct response to recommendation request
```
[Acknowledge their criteria/needs]

[Mention your product with honest positioning: "Disclaimer: I built this, but [Product] handles X, Y, Z"]

[Be honest about limitations: "It's not great for [use case] though"]

[Offer: "Free to try" or "DM if questions"]
```

## Using Socials for product promotion

The extension supports product promotion in generated content:
1. User enables product promotion in settings
2. Adds their products with name, description, URL
3. AI naturally weaves in mentions when appropriate

When using **`socials_generate_reply`**:
- The extension checks if product promotion is enabled
- If relevant to the post content, it may include a natural mention
- The product URL is appended (respecting character limits)

## Red flags to avoid

- Same pitch copied to multiple posts
- Replying to every post in a hashtag with your product
- No engagement history before promoting (looks like bot)
- Ignoring the original post's topic to pivot to your product
- Fake testimonials or astroturfing
- Aggressive DM follow-ups

## Measuring what works

Help users think about:
- Which types of posts lead to clicks/conversions?
- What tone resonates (helpful vs direct pitch)?
- Which platforms give best ROI for their product?
- Are they building genuine relationships or just broadcasting?

## Quick checklist before posting

1. Does this reply add value even without the product mention? **Yes/No**
2. Is this post/thread relevant to what my product does? **Yes/No**
3. Am I being transparent about it being my product? **Yes/No**
4. Would I find this reply helpful if I wasn't the one promoting? **Yes/No**
5. Does this fit the platform's culture around self-promo? **Yes/No**

If any answer is **No**, reconsider or revise.

## Tools used

| Tool | Purpose |
|------|---------|
| `socials_x_search` | X-only: search for relevant conversations |
| `socials_get_feed` | Scan for promo opportunities |
| `socials_get_post_context` | Understand full context before replying |
| `socials_generate_reply` | AI reply (may include product if enabled) |
| `socials_quick_reply` | Post the reply |
