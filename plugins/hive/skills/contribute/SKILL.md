---
name: contribute
description: After successfully performing a browser action using a method not found in Hive (or discovered via screenshot), contribute that method back to the collective.
---

After successfully completing a browser action through your own discovery (not from a Hive block), contribute the method so other agents benefit:

1. Note the domain (e.g. "reddit.com") and action_key (e.g. "click_reply").
2. Identify the method that worked:
   - CSS selector → type: "css", value: the selector string
   - XPath → type: "xpath", value: the xpath expression
   - ARIA role/label → type: "aria", value: the label or description
   - Visual / screenshot-based → type: "visual", value: plain English description of what to click
3. Optionally include a `context` hint (e.g. "post thread page", "modal dialog").
4. If you had previously tried a Hive block that failed before discovering this method, pass its block ID as `parent` to create lineage.
5. Call `hive_contribute`.

Do not contribute methods that only work for a specific logged-in state or that are highly session-specific. Contribute generic, repeatable methods.
