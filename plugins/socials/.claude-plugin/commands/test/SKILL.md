---
description: Comprehensive test suite for all Socials tools and functionality
user-invocable: true
---

# Socials Test Suite

Run comprehensive tests on all Socials tools to verify the extension and MCP server are working correctly.

## Mode Selection

**IMPORTANT: Before running any tests, ask the user which mode they want:**

```
Which test mode would you like to run?

1. **Dry Run** (safe) - Tests read-only tools only. Will NOT post, reply, or engage.
2. **Full Test** (destructive) - Tests ALL tools including posting and engagement.
   WARNING: This will create real posts, replies, likes, and connection requests!

Enter 1 or 2:
```

Wait for user response before proceeding. Default to Dry Run if unclear.

---

## Test Execution

Run tests in this order, reporting results as you go:

### 1. Connection & Access Tests

```
Test: socials_check_access
Expected: connected=true, canUseMcp=true
```

**If this fails, run the RECOVERY FLOW before stopping:**
```
RECOVERY FLOW:
1. socials_refresh_auth → try to restore auth
2. If still fails: socials_restart_bridge → restart WS bridge
3. Ask user to refresh Socials extension in browser
4. Retry socials_check_access
5. If still fails after recovery, stop and report the issue
```

```
Test: socials_health_check
Expected: is_healthy=true, connected=true
```

```
Test: socials_diagnostics
Expected: status=ok, extension_connected=true
```

### 2. Browser Control Tests

```
Test: socials_get_active_tab
Expected: Returns current tab info (tabId, url, title)
```

```
Test: socials_get_agent_tab
Expected: Returns agent tab info or null if not set
```

If no agent tab is set:
```
Test: socials_open_tab (url: "https://x.com/home", focus: false)
Expected: success=true, agentTabPinned=true
```

```
Test: socials_get_agent_tab (verify it's now set)
Expected: Returns the tab we just opened
```

```
Test: socials_set_agent_tab (tabId: <current agent tab id>)
Expected: success=true (re-pins the same tab)
```

```
Test: socials_focus_agent_tab
Expected: success=true, agent tab receives focus
```

```
Test: socials_refresh_auth
Expected: Returns auth status (validates device auth flow)
```

```
Test: socials_reload_tab
Expected: success=true, agent tab reloaded
```

Optional (only if testing recovery):
```
Test: socials_restart_bridge
Expected: success=true, message includes "listening on 127.0.0.1:9847"
Note: After this, user must refresh browser extension before continuing
```

### 3. X (Twitter) Tests - Read Only

Ensure agent tab is on X (`https://x.com/home`):

```
Test: socials_get_feed (platform: "x", count: 5)
Expected: Returns array of posts with id, author, content
```

```
Test: socials_get_page_content
Expected: Returns posts from current page
```

```
Test: socials_scroll (direction: "down", amount: 400)
Expected: success=true
```

```
Test: socials_x_search (query: "test")
Expected: success=true, navigates to search results (default mode: top)
```

```
Test: socials_x_search (query: "startup", mode: "latest")
Expected: success=true, navigates to Latest tab (f=live)
```

```
Test: socials_x_search (query: "AI", from: "elonmusk", min_faves: 100)
Expected: query="AI from:elonmusk min_faves:100"
Note: Tests user filter + engagement threshold
```

```
Test: socials_x_search (query: "tech", filter: "media", is_retweet: false, lang: "en")
Expected: query="tech filter:media -is:retweet lang:en"
Note: Tests content filter + exclusion + language
```

```
Test: socials_x_search (query: "news", since: "2026-01-01", until: "2026-03-01")
Expected: query="news since:2026-01-01 until:2026-03-01"
Note: Tests date range (YYYY-MM-DD format)
```

```
Test: socials_x_search (query: "#buildinpublic", has: ["media", "links"], min_retweets: 5)
Expected: query="#buildinpublic has:media has:links min_retweets:5"
Note: Tests hashtag + has filters + engagement
```

```
Test: socials_x_search (query: "conference", near: "San Francisco", place_country: "US")
Expected: query="conference near:\"San Francisco\" place_country:US"
Note: Tests location filters
```

```
Test: socials_x_search (query: "thread", is_reply: false, mode: "latest")
Expected: query="thread -is:reply", mode=latest
Note: Tests reply exclusion for finding original posts
```

After search results load, test post context:
```
Test: socials_get_feed (platform: "x", count: 1)
Expected: Returns at least one post with an id
```

```
Test: socials_get_post_context (tweet_id: <id from previous feed>)
Expected: Returns context around the post (replies, parent thread)
```

Navigate to notifications for notification tests:
```
Test: socials_navigate (url: "https://x.com/notifications")
Expected: success=true
```

Wait 2 seconds, then:
```
Test: socials_x_notifications (count: 5)
Expected: Returns array of notifications with:
  - type: "like", "follow", "repost", "reply", "quote", "mention", or "unknown"
  - user: { name, handle, avatarUrl, isVerified }
  - timestamp: ISO datetime string
  - relatedContent: truncated text of the liked/mentioned tweet (if applicable)
  - tweetUrl: URL to the tweet (for tweets)
  - tweetId: Tweet ID for use with socials_engage_post / socials_quick_reply
Note: Must be on https://x.com/notifications page
Note: If fewer notifications than requested, will auto-scroll up to 3 times
```

Test notification engagement workflow (if tweet notification found with tweetId):
```
Test: socials_engage_post (tweet_id: <tweetId from notification>, like: true, bookmark: true)
Expected: success=true, likes and bookmarks the tweet directly from notifications page
Note: No navigation needed - engage_post works on current page
```

```
Test: socials_quick_reply (tweet_id: <tweetId from notification>, reply: "Thanks for the engagement! [timestamp]")
Expected: success=true, replies to the notification tweet directly
Note: Opens reply modal on the notification tweet and posts - no navigation needed
```

### 4. X (Twitter) Tests - Destructive [FULL MODE ONLY]

**Skip this section in Dry Run mode.**

Before running, confirm with user:
```
About to test X engagement tools. This will:
- Create a test post on your X account
- Like and bookmark a post
- Reply to a post

Continue? (yes/no)
```

If confirmed:

```
Test: socials_create_post (content: "Test post from Socials MCP - please ignore [timestamp]", platform: "x")
Expected: success=true, returns post URL
Action: Note the post URL to delete manually later
```

```
Test: socials_create_post (content: "Testing newlines:\n\nLine 1\nLine 2\nLine 3\n\n[timestamp]", platform: "x")
Expected: success=true, post should display with proper line breaks
Action: Note the post URL to delete manually later
Note: Tests newline (\n) support in X compose box
```

```
Test: socials_create_post with video (content: "Testing video upload [timestamp]", platform: "x", media: [video file])
Expected: success=true, waits for upload progress to reach 100% before posting
Action: Note the post URL to delete manually later
Note: Tests video upload progress detection (waits for "Processing X%" to complete)
```

```
Test: socials_engage_post (tweet_id: <id from feed>, like: true, bookmark: true)
Expected: success=true
Note: This will like and bookmark a real post
```

```
Test: socials_quick_reply (tweet_id: <id from feed>, reply: "Test reply from Socials MCP [timestamp]")
Expected: success=true, returns reply URL
Action: Note the reply URL to delete manually later
```

After tests, remind user:
```
Destructive X tests complete. Please manually delete:
- Test post: [URL]
- Test reply: [URL]
- Undo like/bookmark if desired
```

### 5. LinkedIn Tests - Read Only

Navigate to LinkedIn:
```
Test: socials_navigate (url: "https://www.linkedin.com/feed/")
Expected: success=true
```

Wait 2-3 seconds for page load, then:

```
Test: socials_get_feed (platform: "linkedin", count: 5)
Expected: Returns array of LinkedIn posts
```

```
Test: socials_linkedin_posts_search (query: "startup")
Expected: success=true
```

```
Test: socials_linkedin_people_search (query: "software engineer")
Expected: success=true
```

```
Test: socials_linkedin_get_people (count: 3)
Expected: Returns array of people results
```

```
Test: socials_linkedin_go_to_page (pageNumber: 2)
Expected: success=true, navigates to page 2 of results
```

```
Test: socials_linkedin_next_page
Expected: success=true, navigates to page 3 of results
```

Navigate to a profile for connection status and profile tests:
```
Test: socials_navigate (url: "https://www.linkedin.com/in/satyanadella/")
Expected: success=true
```

Wait 2 seconds, then:
```
Test: socials_linkedin_connection_status
Expected: Returns connection status with one of:
  - connected (detected via "More" menu button)
  - pending_sent (detected via "Pending, click to withdraw" button)
  - not_connected (detected via "Invite to connect" button)
  - follow_only, unknown
Also returns actions_available array
```

```
Test: socials_linkedin_profile
Expected: Returns profile details including:
  - Basic: name, headline, location, profileUrl
  - Connection: connectionDegree, followers, connections
  - Content: about, currentRole, experiences, education, skills
  - Contact Info: contactInfo object with emails[], phones[], websites[], birthday, twitter, address
Note: Tab will briefly focus to trigger LinkedIn's lazy-loaded content
Verify: Contact info extraction works (requires 1st degree connection for full data)
```

For contact info verification, navigate to a 1st degree connection:
```
Test: socials_linkedin_profile (on a 1st degree connection)
Expected: contactInfo should contain at least some fields if shared by connection
Note: Contact info visibility depends on the connection's privacy settings
```

### 6. LinkedIn Tests - Destructive [FULL MODE ONLY]

**Skip this section in Dry Run mode.**

Before running, confirm with user:
```
About to test LinkedIn engagement tools. This will:
- Like a LinkedIn post
- Send a connection request (optional)

Continue? (yes/no)
Also test connection request? (yes/no) - WARNING: Cannot be easily undone!
```

If confirmed:

Navigate to feed first:
```
Test: socials_navigate (url: "https://www.linkedin.com/feed/")
```

```
Test: socials_get_feed (platform: "linkedin", count: 1)
Expected: Returns at least one post with post_id
```

```
Test: socials_linkedin_engage (post_id: <id from feed>, like: true)
Expected: success=true
Note: This will like a real LinkedIn post
```

If user confirmed connection request test:
```
Test: socials_linkedin_people_search (query: "test account")
Expected: success=true
```

```
Test: socials_linkedin_get_people (count: 1)
Expected: Returns a person result
```

```
Test: socials_linkedin_connect (profile_url: <url from people result>, note: "Test connection from Socials MCP")
Expected: success=true
WARNING: This sends a real connection request!
```

After tests, remind user:
```
Destructive LinkedIn tests complete. You may want to:
- Unlike the post if desired
- Withdraw connection request if sent
```

### 7. Reddit Tests

Navigate to Reddit:
```
Test: socials_navigate (url: "https://www.reddit.com/")
Expected: success=true
```

Wait 2-3 seconds for page load, then:

```
Test: socials_get_feed (platform: "reddit", count: 5)
Expected: Returns array of Reddit posts with title, author, subreddit
```

```
Test: socials_get_page_content
Expected: Returns posts from current Reddit page
```

```
Test: socials_scroll (direction: "down", amount: 400)
Expected: success=true
```

Navigate to a specific subreddit:
```
Test: socials_navigate (url: "https://www.reddit.com/r/programming/")
Expected: success=true
```

Wait 2 seconds, then:
```
Test: socials_get_feed (platform: "reddit", count: 3)
Expected: Returns posts from r/programming
```

### 8. Persona Tests

```
Test: socials_list_personas
Expected: Returns array of personas with id and name
```

### 9. Feature Flag Tests

```
Test: socials_diagnostics (refresh: true)
Expected: Returns feature_gating status with flags
```

---

## Reporting Results

After each test, report:
- Tool name
- Status: PASS / FAIL / SKIP
- Brief result or error message

At the end, provide a summary:

```
=== Socials Test Results ===
Mode: [Dry Run / Full Test]

Connection Tests:        X/X passed
Browser Tests:           X/X passed
X Read Tests:            X/X passed
X Destructive Tests:     X/X passed (or SKIPPED in dry run)
LinkedIn Read Tests:     X/X passed
LinkedIn Destructive:    X/X passed (or SKIPPED in dry run)
Reddit Tests:            X/X passed
Persona Tests:           X/X passed
Feature Flag Tests:      X/X passed

Total: XX/XX tests passed

[Any issues or recommendations]
[If Full Mode: List of posts/actions to clean up manually]
```

---

## Test Guidelines

1. **Always ask mode first**: Never run destructive tests without explicit confirmation

2. **Handle failures gracefully**: If a test fails, log it and continue with other tests

3. **Wait for page loads**: After navigation, wait 2-3 seconds before testing feed/content tools

4. **Clean up reminders**: In Full Mode, always remind user what to clean up at the end

5. **Report issues clearly**: If something fails, explain what the user might need to fix

6. **Timestamps**: Add timestamps to test posts/replies so they're identifiable

7. **Newline testing**: When testing posts with \n characters, verify the output has actual line breaks

8. **Video uploads**: Large video uploads may take 1-2 minutes; the extension waits for 100% progress

9. **Modal targeting**: Posts/replies correctly target the modal compose box (not timeline composer)

10. **X Advanced Search**: Test all modes (top/latest/people/photos/videos) and operators:
    - User: from, to, retweets_of
    - Time: since/until (YYYY-MM-DD), since_time/until_time (Unix)
    - Engagement: min_faves, min_retweets, min_replies
    - Content: filter (media/images/video/links), has[], is_reply, is_retweet
    - Location: lang, near, place, place_country
    - Advanced: list, conversation_id

---

## Optional Parameters

The user may specify:
- `--dry-run` or `--safe` to skip mode selection and run non-destructive only
- `--full` to skip mode selection and run all tests (still confirms before destructive)
- `--platform x`, `--platform linkedin`, or `--platform reddit` to test only one platform
- `--skip-browser` to skip browser control tests (if tab is already set up)
- `--verbose` for detailed output of each tool response

---

## Example Output - Dry Run

```
Running Socials Test Suite...

Mode Selection: Which test mode? (1=Dry Run, 2=Full Test)
> 1

Running in DRY RUN mode (safe, non-destructive)

[1/9] Connection Tests
  socials_check_access: PASS (connected, Pro tier)
  socials_health_check: PASS (healthy, 12ms latency)
  socials_diagnostics: PASS (v1.0.39)

[2/9] Browser Control Tests
  socials_get_active_tab: PASS (tab 123, x.com)
  socials_get_agent_tab: PASS (tab 123 pinned)
  socials_set_agent_tab: PASS (tab re-pinned)
  socials_focus_agent_tab: PASS (focused)
  socials_refresh_auth: PASS (auth valid)
  socials_reload_tab: PASS (reloaded)

[3/9] X (Twitter) Read Tests
  socials_get_feed: PASS (5 posts retrieved)
  socials_get_page_content: PASS (5 posts)
  socials_scroll: PASS
  socials_x_search (basic): PASS (mode: top)
  socials_x_search (mode: latest): PASS (f=live)
  socials_x_search (from + min_faves): PASS (user + engagement)
  socials_x_search (filter + is_retweet + lang): PASS (content filters)
  socials_x_search (since/until): PASS (date range)
  socials_x_search (hashtag + has + min_retweets): PASS (has filters)
  socials_x_search (near + place_country): PASS (location)
  socials_x_search (is_reply: false): PASS (exclusion)
  socials_get_post_context: PASS (context retrieved)
  socials_navigate (notifications): PASS (x.com/notifications)
  socials_x_notifications: PASS (5 notifications: 3 likes, 1 follow, 1 mention)

[4/9] X (Twitter) Destructive Tests
  SKIPPED (Dry Run mode)

[5/9] LinkedIn Read Tests
  socials_navigate: PASS (linkedin.com/feed)
  socials_get_feed: PASS (5 posts retrieved)
  socials_linkedin_posts_search: PASS
  socials_linkedin_people_search: PASS
  socials_linkedin_get_people: PASS (3 results)
  socials_linkedin_go_to_page: PASS (page 2)
  socials_linkedin_next_page: PASS (page 3)
  socials_linkedin_connection_status: PASS (not_connected)
  socials_linkedin_profile: PASS (profile details)

[6/9] LinkedIn Destructive Tests
  SKIPPED (Dry Run mode)

[7/9] Reddit Tests
  socials_navigate: PASS (reddit.com)
  socials_get_feed: PASS (5 posts retrieved)
  socials_get_page_content: PASS (posts on page)
  socials_scroll: PASS
  socials_navigate (subreddit): PASS (r/programming)
  socials_get_feed (subreddit): PASS (3 posts)

[8/9] Persona Tests
  socials_list_personas: PASS (4 personas)

[9/9] Feature Flag Tests
  socials_diagnostics (refresh): PASS (flags loaded)

=== Socials Test Results ===
Mode: Dry Run (non-destructive)

All 33 read-only tests passed!
6 destructive tests skipped.

Your Socials setup is working correctly.
```

## Example Output - Full Test

```
Running Socials Test Suite...

Mode Selection: Which test mode? (1=Dry Run, 2=Full Test)
> 2

WARNING: Full Test mode will create real posts and engagement!
Running in FULL TEST mode

[1/9] Connection Tests
  socials_check_access: PASS (connected, Pro tier)
  ...

[3/9] X (Twitter) Read Tests
  ...all pass...

[4/9] X (Twitter) Destructive Tests
  Confirm: About to create posts and engage. Continue? (yes/no)
  > yes
  socials_create_post: PASS (posted: x.com/user/status/123456)
  socials_engage_post: PASS (liked + bookmarked)
  socials_quick_reply: PASS (replied: x.com/user/status/123457)

[5/9] LinkedIn Read Tests
  ...all pass...

[6/9] LinkedIn Destructive Tests
  Confirm: About to like posts and optionally connect. Continue? (yes/no)
  > yes
  Test connection request too? (yes/no)
  > no
  socials_linkedin_engage: PASS (liked post)
  socials_linkedin_connect: SKIPPED (user declined)

...

=== Socials Test Results ===
Mode: Full Test (destructive)

All 36 tests passed! (1 skipped by user choice)

CLEANUP REQUIRED:
- Delete test post: x.com/user/status/123456
- Delete test reply: x.com/user/status/123457
- Undo like/bookmark on X if desired
- Undo LinkedIn like if desired
```
