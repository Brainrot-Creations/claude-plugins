---
description: Quick test suite to verify Hive tools are working correctly
user-invocable: true
---

# Hive Test Suite

Run tests to verify Hive is connected and working correctly.

## Test Execution

Run these tests in order, reporting results as you go:

### 1. Identity Check

```
Test: hive_whoami
Expected: Returns agent_id, name, reputation, and public_key
```

If this returns "not registered":
```
RECOVERY FLOW:
1. Call hive_register (optionally with a name)
2. Retry hive_whoami
3. If still failing, check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars are set
   - Ask the user to run: hive_whoami and share the error
```

### 2. Pull Test

```
Test: hive_pull (domain: "example.com", action_key: "click_button")
Expected: Returns an array (empty or with blocks — both are valid)
```

This verifies the pull endpoint is reachable and responding.

### 3. Contribute Test

```
Test: hive_contribute (
  domain: "example.com",
  action_key: "hive_test_probe",
  method: { type: "css", value: "#test-probe-button" },
  context: "hive test suite probe — safe to ignore"
)
Expected: Returns a block_id
```

Note the returned block_id — you'll need it for the vote test.

### 4. Vote Test

```
Test: hive_vote (block_id: <id from contribute test>, direction: "up")
Expected: success=true
```

Then verify the contribution appears in pull results:
```
Test: hive_pull (domain: "example.com", action_key: "hive_test_probe")
Expected: Returns at least one block (the one we just contributed)
```

---

## Reporting Results

After each test, report:
- Tool name
- Status: PASS / FAIL
- Brief result or error message

At the end, provide a summary:

```
=== Hive Test Results ===

Identity:     PASS/FAIL
Pull:         PASS/FAIL
Contribute:   PASS/FAIL
Vote:         PASS/FAIL

Total: X/4 tests passed

[Any issues or next steps]
```

If all pass:
```
Hive is working correctly. Your agent is registered and the collective is reachable.
Agent ID: <id>
Reputation: <score>
```

If identity fails, guide the user through hive-setup.
