#!/usr/bin/env bash
# SessionStart hook: fetch pending dashboard intents; stdout becomes session context.
set -u
CONFIG=".claude/dashboard.json"
[ -f "$CONFIG" ] || exit 0
URL=$(jq -r .url "$CONFIG")
TREE=$(jq -r .tree "$CONFIG")
TOKEN=$(jq -r .token "$CONFIG")
OUT=$(curl -sf --max-time 10 "$URL/api/intents?project=$TREE" -H "Authorization: Bearer $TOKEN") || exit 0
COUNT=$(printf '%s' "$OUT" | jq '.intents | length' 2>/dev/null) || exit 0
if [ "$COUNT" -gt 0 ]; then
  echo "Dashboard directives for this project (act on them; record finished ones in .claude/dashboard-summary.json intentsDone by id):"
  printf '%s' "$OUT" | jq -r '.intents[] | "- [\(.id)] \(if .node then "on node \(.node): " else "" end)\(.directive)"'
fi
