#!/usr/bin/env bash
# SessionEnd hook: POST the session summary the dashboard-sync skill maintained, then archive it.
set -u
CONFIG=".claude/dashboard.json"
SUMMARY=".claude/dashboard-summary.json"
[ -f "$CONFIG" ] && [ -f "$SUMMARY" ] || exit 0
URL=$(jq -r .url "$CONFIG")
TOKEN=$(jq -r .token "$CONFIG")
post() {
  curl -sf --max-time 15 -X POST "$URL/api/updates" \
    -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
    -d @"$SUMMARY"
}
post || post || exit 0   # one retry, then give up quietly — never break a session
mv "$SUMMARY" ".claude/dashboard-summary.sent.json"
