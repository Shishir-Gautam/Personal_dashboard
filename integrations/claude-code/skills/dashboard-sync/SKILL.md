---
name: dashboard-sync
description: Use at the start of every session and whenever meaningful work lands - keeps .claude/dashboard-summary.json current so the SessionEnd hook can push progress to the personal dashboard skill tree.
---

# dashboard-sync

This project reports progress to a personal skill-tree dashboard. Config lives in
`.claude/dashboard.json` (`tree` = this project's tree slug).

## Your job during the session

Whenever a meaningful unit of work completes (feature lands, bug fixed, module
understood, milestone advanced), update `.claude/dashboard-summary.json`. Create it
if missing. It must always hold the WHOLE session's summary in this exact shape:

~~~json
{
  "tree": "<slug from .claude/dashboard.json>",
  "sessionId": "<your session id if known, else omit>",
  "updates": [
    { "node": "<existing tree node title this work advanced>", "delta": 15, "note": "one line: what moved and why it matters" }
  ],
  "proposed": [
    { "title": "<new node title>", "why": "work happened outside the existing tree" }
  ],
  "intentsDone": ["<intent id delivered at session start that you completed>"]
}
~~~

Rules:
- `delta` = your honest estimate of % this node advanced this session (0-100).
- `note` is read by a human on a dashboard: plain language, outcome-focused, no file paths.
- Work that fits no existing node goes in `proposed` — never invent node names in `updates`.
- Directives injected at session start list intent ids — when you complete one, add its id to `intentsDone`.
- Keep the file cumulative for the session: re-read it before writing, merge, don't clobber earlier entries.
- A SessionEnd hook POSTs this file automatically. Never POST it yourself.
