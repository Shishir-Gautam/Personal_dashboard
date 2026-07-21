# Connect a project to the dashboard

1. Create the project's tree in the dashboard (`/new`), note its slug.
2. In the project repo:
   mkdir -p .claude/hooks .claude/skills
   cp <dashboard-repo>/integrations/claude-code/hooks/*.sh .claude/hooks/
   chmod +x .claude/hooks/*.sh
   cp -r <dashboard-repo>/integrations/claude-code/skills/dashboard-sync .claude/skills/
3. Create `.claude/dashboard.json` (add it to .gitignore — it holds your token):
   { "url": "https://your-dashboard.vercel.app", "tree": "<slug>", "token": "<DASHBOARD_TOKEN>" }
4. Merge `settings-snippet.json` into the project's `.claude/settings.json`.
5. Requires `jq` and `curl` (`brew install jq`).

Test: start a Claude Code session in the project — pending intents appear as context.
End the session — the tree updates on the dashboard.
