# Personal Skill-Tree Dashboard

Your projects, life goals, and courses as skill trees — auto-fed by Claude Code
sessions, guarded by your fingerprint. Built on evidence from motivation science
(see `docs/superpowers/specs/`): visible small wins, proximal goals, no fake points.

## Why it's different
- **Sessions feed the tree.** A Claude Code session in any connected project pushes
  "what actually moved" onto that project's tree when it ends.
- **The tree talks back.** Queue a directive on any node; the next session in that
  project receives it at startup.
- **Biometric door.** WebAuthn passkey (Touch ID / Face ID) with a 30-minute
  inactivity window.

## Self-host (10 minutes)
1. Fork/clone. `npm install`.
2. MongoDB Atlas free tier → connection string.
3. `cp .env.example .env`, fill: `MONGODB_URI`, `MONGODB_DB`, `DASHBOARD_TOKEN` + `SESSION_SECRET`
   (`openssl rand -hex 32` each), `RP_ID=localhost`, `ORIGIN=http://localhost:3000`.
4. `npm run seed` (optional sample tree), `npm run dev`, open localhost:3000,
   **Register this device** → passkey created. You are the only user; to reset,
   drop the `credentials` collection.
5. Deploy: push to GitHub → import in Vercel → set the same env vars with
   `RP_ID=<your-app>.vercel.app`, `ORIGIN=https://<your-app>.vercel.app` → deploy →
   open it and register your passkey there (passkeys are per-domain).
6. Connect projects: see `integrations/claude-code/README.md`.

## Notes
- `.env` and every project's `.claude/dashboard.json` hold secrets — both gitignored. Never commit them.
- Passkey registered on localhost doesn't carry to prod domain; register on each.
