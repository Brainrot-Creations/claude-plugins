---
name: persona-guide
description: Use when the user asks about personas, wants to choose the right persona for their content, or needs help understanding how personas affect generated content. Covers both system personas and custom personas.
---

# Persona Guide

Help users understand and choose the right persona for their social media content.

## What is a persona?

A persona defines the **voice, tone, and style** of generated content. It shapes:
- Word choice and sentence structure
- Level of formality vs casualness
- Use of humor, sarcasm, or directness
- How opinions are expressed
- Overall personality that comes through

## List available personas

Use **`socials_list_personas`** to show what's available. This returns both:
- **System personas**: Pre-built voices (e.g., professional, casual, witty)
- **Custom personas**: User-created voices tailored to their brand

## Choosing the right persona

Guide the user based on their goals:

### For professional/business content
- LinkedIn posts → Professional, thoughtful, industry-expert voice
- B2B engagement → Credible, helpful, not salesy

### For casual/personal brand
- X/Twitter → Can be more opinionated, witty, authentic
- Personal takes → Match their natural speaking style

### For specific niches
- Tech/startup → Direct, data-driven, maybe slightly contrarian
- Creative fields → More expressive, story-driven
- Finance/legal → Conservative, precise, trustworthy

### Platform considerations
- **X**: Punchy, bold, hot takes work well. 280 char limit rewards conciseness.
- **LinkedIn**: More measured, professional. Longer-form accepted.
- **Reddit**: Authentic, helpful, no-BS. Redditors detect fakeness instantly.

## Using personas with tools

When calling **`socials_generate_reply`**:
- Pass `persona_id` to use a specific persona
- Combine with `mood` for additional tone adjustment (e.g., "witty", "supportive", "critical")

Example:
```
socials_generate_reply({
  platform: "x",
  post_content: "...",
  post_author: "@someone",
  persona_id: "professional",
  mood: "thoughtful"
})
```

## When to NOT use a persona

Sometimes users want:
- Their own authentic voice (you write it, not AI)
- A one-off tone that doesn't match any persona
- To experiment with a new style

In these cases, skip `socials_generate_reply` and draft the content yourself based on their description.

## Custom personas

If none of the system personas fit, the user can create custom personas in the Socials extension settings. Custom personas can define:
- Name and description
- Voice characteristics
- Specific phrases or patterns to use/avoid
- Target length preferences

Point them to the extension's Options/Settings page to create custom personas.

## Persona + Platform matrix

| Persona Type | Best for X | Best for LinkedIn | Best for Reddit |
|--------------|-----------|-------------------|-----------------|
| Bold/Opinionated | Yes | Careful | Depends on sub |
| Professional | Sometimes | Yes | r/business types |
| Casual/Friendly | Yes | Limited | Most subs |
| Expert/Technical | Niche topics | Yes | Technical subs |
| Humorous | Yes | Rarely | Many subs |

## Quick tips

1. **Consistency matters**: Pick a persona and stick with it for brand recognition
2. **Platform-adapt**: Same persona can flex slightly per platform
3. **Authenticity wins**: The best persona is close to who they actually are
4. **Test and iterate**: Try different personas, see what resonates with their audience
