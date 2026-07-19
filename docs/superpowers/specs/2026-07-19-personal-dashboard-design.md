# Personal Dashboard — Design Spec

Date: 2026-07-19
Status: draft for review
Approach: A — "Living skill tree, thin slice" (Vercel-hosted)

## 1. What this is

A single-user, minimal dashboard hosted on Vercel that renders every tracked domain — coding projects (e.g. xnock), life goals, courses — as a **skill tree**: branching milestone nodes with prerequisites, progress states, and short explanations. Two things make it different from every existing tool:

1. **Semantic session feed.** Claude Code sessions working in any local project automatically push a meaning-level summary ("shader pipeline fixed, Rendering node 70%") that advances the tree. No manual check-off for project trees.
2. **Intent queue back-channel.** The user attaches directives to tree nodes in the dashboard ("focus networking branch next", "explain this module to me"). The next Claude Code session in that project pulls pending directives at session start and acts on them.

Life and course trees use the same node template but are updated manually (v1).

## 2. Goals / non-goals

**Goals (v1)**
- One glance → understand where any project/goal/course stands and what's next.
- Zero-friction automatic progress capture from Claude Code sessions.
- Two-way loop: dashboard → next session via intent queue.
- Every design choice grounded in cited productivity research (see §7).
- Minimal: one Next.js app, one MongoDB database, one Claude Code skill, two hooks.
- Clone-and-run for others: public repo, `.env.example`, documented setup.

**Non-goals (v1)**
- Multi-user, teams, sharing.
- Real-time session monitoring / token telemetry (ccusage et al. already do this).
- Launching or steering live sessions from the dashboard (only queued intents).
- Deep spaced-repetition scheduler (course nodes get a simple "review due" flag, not full SM-2).
- Mobile app (responsive web is enough).

## 3. Architecture

```
┌─ Mac ────────────────────────────┐      ┌─ Vercel ─────────────────────┐
│ Claude Code session in ~/project   │      │ Next.js App Router           │
│                                  │      │                              │
│ SessionStart hook (command) ─────┼──────┼→ /api/intents?project=xnock  │
│   curls intents, stdout becomes  │      │                              │
│   injected session context       │      │ /api/updates  ←─ POST ───────┼─┐
│                                  │      │                              │ │
│ dashboard-sync skill             │      │ UI pages (React Flow tree)   │ │
│   (keeps .claude/dashboard-      │      │        │                     │ │
│    summary.json current during   │      │        ▼                     │ │
│    the session)                  │      │  MongoDB Atlas (mongoose)    │ │
│ SessionEnd hook (command) ───────┼──────┘                              │ │
│   curls summary file, bearer ────┼─────────────────────────────────────┘ │
└──────────────────────────────────┘                                       │
                User browser ── WebAuthn passkey, 30-min sliding cookie ───┘
```

- **App:** Next.js (App Router, TypeScript, Tailwind), deployed on Vercel.
- **DB:** MongoDB Atlas via mongoose (`MONGODB_URI` env var; owner reuses the xnock cluster).
- **Auth:** two layers.
  - API writes/pulls (hooks): static bearer token in `DASHBOARD_TOKEN` env var, checked in route handlers.
  - UI: **WebAuthn passkey (platform biometric — Touch ID / Face ID / Windows Hello)** via @simplewebauthn. First visit with zero registered passkeys → register; afterwards login requires a biometric assertion. Session = signed httpOnly cookie with a **30-minute sliding inactivity window**: any authenticated request refreshes it; after 30 idle minutes the next request redirects to biometric login.
- **Self-hostable:** repo is public-template friendly — `.env` gitignored, `.env.example` documents `MONGODB_URI`, `DASHBOARD_TOKEN`, `SESSION_SECRET`, `RP_ID`/origin; README covers clone → Atlas free tier → Vercel deploy → register your passkey → install skill+hooks.
- **Tree rendering:** React Flow (xyflow) + dagre auto-layout. Custom node component.
- **Local side:** one reusable `dashboard-sync` skill + two `command` hook entries in each tracked project's `.claude/settings.json` (SessionStart intent pull, SessionEnd summary push script).

## 4. Data model

```
trees:    id, slug, title, kind ('project'|'life'|'course'), created_at
nodes:    id, tree_id, title, why            -- one line: why this node matters
          status ('locked'|'available'|'in_progress'|'done')
          progress int 0-100                 -- % toward THIS node's completion
          next_action text                   -- implementation-intention line
          review_due date null               -- course nodes only
          position json null                 -- optional manual layout override
node_prereqs: node_id, prereq_node_id        -- DAG edges (multiple parents allowed)
updates:  id, node_id, tree_id, session_id, summary text, delta int,
          source ('session'|'manual'), created_at
intents:  id, node_id null, tree_id, directive text,
          status ('pending'|'delivered'|'done'), created_at, delivered_at
reflections: id, week_start date, body text, created_at
```

Rules:
- A node is `locked` until all prereqs are `done`; then `available`. Computed server-side, never stored inconsistently.
- `updates` are append-only — the narrative history of a node.
- Deleting a tree cascades. Nothing else is ever hard-deleted.

## 5. The feed pipeline (project trees)

**Push (session end):**
1. `dashboard-sync` skill (installed per project, points at the project's tree slug) instructs Claude to keep `.claude/dashboard-summary.json` current as meaningful work lands: nodes touched, per-node delta %, one-line narrative each, proposed new nodes if work went beyond the tree. (A hook can't ask Claude anything at SessionEnd — the model is gone — so the summary must already exist on disk.)
2. `SessionEnd` hook (`command`, `async: true`) runs a tiny script: if the summary file exists and is newer than session start, POST it to `/api/updates` with the bearer token, then archive it.
3. API validates (zod), applies deltas, appends `updates` rows, recomputes lock states. Unknown node references land in a "proposed nodes" inbox on the tree — never silently dropped, never auto-added.

**Pull (session start):**
1. `SessionStart` hook (`command`) curls `/api/intents?project=<slug>&status=pending`; its stdout is injected as session context.
2. API marks returned intents `delivered`.
3. Claude works with them; the session summary can mark an intent `done`.

**Failure handling:** hooks are `async` — a down dashboard never blocks or breaks a session. Failed pushes are lost (acceptable v1; next session's summary re-covers state). API rejects malformed payloads with 400; push script retries once then gives up quietly.

## 6. UI (minimal, research-shaped)

Max four visual groups on any screen (Cowan ~4-chunk limit). Everything else behind clicks.

- **Home (`/`):** four groups only —
  1. **Resume here**: the single pinned in-progress node across all trees (Zeigarnik).
  2. **Next up**: nearest `available` node with its % and next-action line (goal-gradient).
  3. **This week moved**: 3-5 latest update narratives (progress principle).
  4. **One alert**: oldest pending intent or overdue course review — or nothing.
- **Tree view (`/t/[slug]`):** React Flow skill tree. Node fill encodes status pre-attentively (empty/partial/full); click → drawer with why-line, next-action, update history, intent composer, "propose split" if node too big. Proposed-nodes inbox appears here.
- **Weekly digest (`/week`):** auto-generated Monday reset (fresh-start effect): what moved, per tree. Closes only after one free-text reflection line (Di Stefano).
- **Tree editor:** create/edit trees as a simple form or paste-a-markdown-outline importer (`- node` nesting = prereq chain). New trees pre-mark their setup node done (endowed progress — never start at 0%).

Design language: minimal, monochrome + one accent, generous whitespace, no XP/points/streaks anywhere (SDT overjustification). Every node explains itself — `why` line always visible in drawer (explanatory requirement).

## 7. Research → feature map

| Finding (source) | Feature |
|---|---|
| Progress principle (Amabile & Kramer 2011) | "This week moved" narratives from sessions |
| Goal-gradient (Kivetz et al. 2006) | Per-node % to next unlock; total tree % never shown |
| Endowed progress (Nunes & Drèze 2006) | New trees start with setup node pre-completed |
| SDT / gamification backfire (Deci; Sailer 2017) | No points, no streaks; unlocks = real capabilities; user picks branch order |
| Implementation intentions (Gollwitzer & Sheeran 2006, d=0.65) | `next_action` when/how line on every active node |
| Proximal subgoals (Bandura & Schunk 1981) | Nodes sized ~1 session; "propose split" on oversized nodes |
| Zeigarnik 1927 | Pinned "Resume here" node on home |
| Fresh-start effect (Dai, Milkman & Riis 2014) | Monday weekly digest reset |
| Retrieval + spacing (Roediger 2006; Cepeda 2006) | Course nodes complete via self-test note, `review_due` resurfaces them |
| Reflection (Di Stefano et al. 2014, +23%) | Digest closes with one reflection line |
| ~4-chunk working memory (Cowan 2001) | Max 4 groups per screen, drawer disclosure |

## 8. Testing

- Unit: lock-state computation, markdown importer, zod schemas (vitest).
- API: route handler tests for /api/updates and /api/intents (auth, validation, delta application).
- E2E smoke: create tree → POST fake session update → node advances → intent round-trip (playwright, one spec).
- Manual: install skill+hooks in one real project (xnock), run one real session, verify tree updates.

## 9. Build order (for the implementation plan)

1. Scaffold Next.js + mongoose + MongoDB; schemas.
2. API routes (updates, intents) + bearer auth; WebAuthn register/login + 30-min sliding session; seed script with sample tree.
3. Tree view (React Flow + dagre) + node drawer.
4. Home page four-group layout.
5. Tree editor + markdown importer.
6. Weekly digest + reflections.
7. `dashboard-sync` skill + hook snippets; wire into xnock; end-to-end verify.
