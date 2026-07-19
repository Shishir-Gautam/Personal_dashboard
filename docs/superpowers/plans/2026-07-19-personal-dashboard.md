# Personal Skill-Tree Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Single-user Vercel dashboard rendering projects/life/courses as skill trees, auto-fed by Claude Code sessions, with an intent-queue back-channel and WebAuthn biometric login.

**Architecture:** Next.js App Router + MongoDB Atlas (mongoose). Machine endpoints (`/api/updates`, `/api/intents`) use a static bearer token; all human UI sits behind a WebAuthn passkey session cookie with a 30-minute sliding inactivity window enforced in middleware. Trees are DAGs of nodes; lock states are recomputed server-side after every write. React Flow + dagre renders the tree.

**Tech Stack:** Next.js 15 (TS, App Router, src dir, Tailwind), mongoose 8, @simplewebauthn/server + /browser v13, jose, zod, @xyflow/react 12, @dagrejs/dagre, vitest + mongodb-memory-server, tsx.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-19-personal-dashboard-design.md`. Read it first.
- Env vars (all in `.env`, never committed; `.env.example` documents them): `MONGODB_URI`, `MONGODB_DB=dashboard`, `DASHBOARD_TOKEN`, `SESSION_SECRET`, `RP_ID` (`localhost` dev), `ORIGIN` (`http://localhost:3000` dev).
- No XP, points, badges, or streaks anywhere in UI copy.
- Never display total-tree %; only per-node progress.
- Home screen: max 4 visual groups.
- Session inactivity window: exactly 30 minutes, sliding (refreshed on every authenticated request).
- Mongoose model for nodes is named `TreeNode` (avoids DOM `Node` clash); collection name `nodes`.
- All commits: conventional format, end body with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Scaffold, DB helper, test rig

**Files:**
- Create: Next.js scaffold at repo root (via temp dir), `src/lib/db.ts`, `.env.example`, `vitest.config.ts`, `src/test/setup.ts`, `src/lib/db.test.ts`

**Interfaces:**
- Produces: `db(): Promise<typeof mongoose>` from `@/lib/db` — every later task calls this before model use. Path alias `@/*` → `src/*` (create-next-app default).

- [ ] **Step 1: Scaffold into non-empty repo root**

```bash
cd /Users/shishirgautam/Personal_Dashboard
npx create-next-app@latest tmp-scaffold --ts --tailwind --app --src-dir --eslint --turbopack --no-import-alias
rsync -a tmp-scaffold/ ./ --exclude .gitignore --exclude .git
cat tmp-scaffold/.gitignore >> .gitignore
rm -rf tmp-scaffold
npm install mongoose zod jose @simplewebauthn/server @simplewebauthn/browser @xyflow/react @dagrejs/dagre
npm install -D vitest mongodb-memory-server tsx @types/dagre
```

- [ ] **Step 2: Write `.env.example`**

```bash
# MongoDB Atlas connection string (free tier works)
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net
MONGODB_DB=dashboard
# Long random string; hooks authenticate API pushes with it. `openssl rand -hex 32`
DASHBOARD_TOKEN=
# Long random string for signing session cookies. `openssl rand -hex 32`
SESSION_SECRET=
# WebAuthn relying-party ID = your domain. Dev: localhost. Prod: yourapp.vercel.app
RP_ID=localhost
ORIGIN=http://localhost:3000
```

- [ ] **Step 3: Write `src/lib/db.ts`**

```ts
import mongoose from 'mongoose'

type Cached = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null }
const g = global as unknown as { _mongoose?: Cached }
const cached: Cached = g._mongoose ?? { conn: null, promise: null }
g._mongoose = cached

export async function db() {
  if (cached.conn) return cached.conn
  cached.promise ??= mongoose.connect(process.env.MONGODB_URI!, {
    dbName: process.env.MONGODB_DB || 'dashboard',
  })
  cached.conn = await cached.promise
  return cached.conn
}
```

- [ ] **Step 4: Write `vitest.config.ts` and `src/test/setup.ts`**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: { setupFiles: ['src/test/setup.ts'], testTimeout: 30000, hookTimeout: 60000 },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
})
```

```ts
// src/test/setup.ts
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import { beforeAll, afterAll, beforeEach } from 'vitest'

let mongod: MongoMemoryServer

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  process.env.MONGODB_URI = mongod.getUri()
  process.env.MONGODB_DB = 'test'
  process.env.DASHBOARD_TOKEN = 'test-token'
  process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret'
  process.env.RP_ID = 'localhost'
  process.env.ORIGIN = 'http://localhost:3000'
})

beforeEach(async () => {
  const { db } = await import('@/lib/db')
  const conn = await db()
  await conn.connection.db!.dropDatabase()
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongod?.stop()
})
```

- [ ] **Step 5: Write failing test `src/lib/db.test.ts`, run, verify pass**

```ts
import { describe, it, expect } from 'vitest'
import { db } from './db'

describe('db', () => {
  it('connects and reuses the cached connection', async () => {
    const a = await db()
    const b = await db()
    expect(a).toBe(b)
    expect(a.connection.readyState).toBe(1)
  })
})
```

Run: `npx vitest run src/lib/db.test.ts` — Expected: PASS. Add `"test": "vitest run"` to package.json scripts.

- [ ] **Step 6: Verify build + commit**

Run: `npm run build` — Expected: compiles.
```bash
git add -A && git commit -m "feat: scaffold Next.js app with mongo + test rig"
```

---

### Task 2: Models + lock-state computation (TDD)

**Files:**
- Create: `src/lib/models.ts`, `src/lib/statuses.ts`, `src/lib/statuses.test.ts`

**Interfaces:**
- Produces: mongoose models `Tree`, `TreeNode`, `Update`, `Intent`, `Reflection`, `Credential` from `@/lib/models`; `computeStatuses(nodes: {id: string; status: string; progress: number; prereqs: string[]}[]): Map<string, 'locked'|'available'|'in_progress'|'done'>` from `@/lib/statuses`.

- [ ] **Step 1: Write failing test `src/lib/statuses.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { computeStatuses } from './statuses'

const n = (id: string, over: Partial<{ status: string; progress: number; prereqs: string[] }> = {}) =>
  ({ id, status: 'locked', progress: 0, prereqs: [], ...over })

describe('computeStatuses', () => {
  it('root with no prereqs is available', () => {
    expect(computeStatuses([n('a')]).get('a')).toBe('available')
  })
  it('locked while any prereq not done, available when all done', () => {
    const st = computeStatuses([n('a', { status: 'done' }), n('b'), n('c', { prereqs: ['a', 'b'] })])
    expect(st.get('c')).toBe('locked')
    const st2 = computeStatuses([n('a', { status: 'done' }), n('b', { progress: 100 }), n('c', { prereqs: ['a', 'b'] })])
    expect(st2.get('c')).toBe('available')
  })
  it('progress > 0 means in_progress; >= 100 means done', () => {
    const st = computeStatuses([n('a', { progress: 40 }), n('b', { progress: 100 })])
    expect(st.get('a')).toBe('in_progress')
    expect(st.get('b')).toBe('done')
  })
})
```

- [ ] **Step 2: Run to verify fail** — `npx vitest run src/lib/statuses.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/statuses.ts`**

```ts
export type StatusInput = { id: string; status: string; progress: number; prereqs: string[] }
export type NodeStatus = 'locked' | 'available' | 'in_progress' | 'done'

export function computeStatuses(nodes: StatusInput[]): Map<string, NodeStatus> {
  const done = new Set(nodes.filter(x => x.status === 'done' || x.progress >= 100).map(x => x.id))
  const out = new Map<string, NodeStatus>()
  for (const x of nodes) {
    if (done.has(x.id)) out.set(x.id, 'done')
    else if (x.progress > 0) out.set(x.id, 'in_progress')
    else if (x.prereqs.every(p => done.has(p))) out.set(x.id, 'available')
    else out.set(x.id, 'locked')
  }
  return out
}
```

- [ ] **Step 4: Run to verify pass** — same command — Expected: PASS.

- [ ] **Step 5: Write `src/lib/models.ts`**

```ts
import { Schema, model, models, Model } from 'mongoose'

const TreeSchema = new Schema({
  slug: { type: String, unique: true, required: true },
  title: { type: String, required: true },
  kind: { type: String, enum: ['project', 'life', 'course'], required: true },
  proposed: [{ title: String, why: String, at: { type: Date, default: Date.now } }],
}, { timestamps: true })

const NodeSchema = new Schema({
  treeId: { type: Schema.Types.ObjectId, ref: 'Tree', index: true, required: true },
  title: { type: String, required: true },
  why: { type: String, default: '' },
  status: { type: String, enum: ['locked', 'available', 'in_progress', 'done'], default: 'locked' },
  progress: { type: Number, min: 0, max: 100, default: 0 },
  nextAction: { type: String, default: '' },
  reviewDue: Date,
  position: { x: Number, y: Number },
  prereqs: [{ type: Schema.Types.ObjectId, ref: 'TreeNode' }],
}, { timestamps: true })

const UpdateSchema = new Schema({
  nodeId: { type: Schema.Types.ObjectId, ref: 'TreeNode', index: true },
  treeId: { type: Schema.Types.ObjectId, ref: 'Tree', index: true, required: true },
  sessionId: String,
  summary: { type: String, required: true },
  delta: { type: Number, default: 0 },
  source: { type: String, enum: ['session', 'manual'], default: 'session' },
}, { timestamps: true })

const IntentSchema = new Schema({
  nodeId: { type: Schema.Types.ObjectId, ref: 'TreeNode' },
  treeId: { type: Schema.Types.ObjectId, ref: 'Tree', index: true, required: true },
  directive: { type: String, required: true },
  status: { type: String, enum: ['pending', 'delivered', 'done'], default: 'pending' },
  deliveredAt: Date,
}, { timestamps: true })

const ReflectionSchema = new Schema({
  weekStart: { type: Date, unique: true, required: true },
  body: { type: String, required: true },
}, { timestamps: true })

const CredentialSchema = new Schema({
  credId: { type: String, unique: true, required: true },
  publicKey: { type: String, required: true }, // base64url-encoded
  counter: { type: Number, default: 0 },
  transports: [String],
}, { timestamps: true })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const m = <T>(name: string, schema: Schema, coll?: string): Model<any> =>
  (models[name] as Model<any>) || model(name, schema, coll)

export const Tree = m('Tree', TreeSchema)
export const TreeNode = m('TreeNode', NodeSchema, 'nodes')
export const Update = m('Update', UpdateSchema)
export const Intent = m('Intent', IntentSchema)
export const Reflection = m('Reflection', ReflectionSchema)
export const Credential = m('Credential', CredentialSchema)
```

- [ ] **Step 6: Run full tests + commit**

Run: `npm test` — Expected: all PASS.
```bash
git add -A && git commit -m "feat: mongoose models and lock-state computation"
```

---

### Task 3: Session cookie + sliding-window middleware (TDD)

**Files:**
- Create: `src/lib/session.ts`, `src/lib/session.test.ts`, `src/middleware.ts`

**Interfaces:**
- Produces: `signSession(): Promise<string>`, `verifySession(token: string): Promise<boolean>`, `SESSION_COOKIE = 'pd_session'`, `SESSION_TTL_S = 1800`, `sessionCookieOptions` from `@/lib/session`. Middleware protects everything except `/login`, `/api/auth/*`, `/api/updates`, `/api/intents`, `_next`, `favicon.ico`.

- [ ] **Step 1: Write failing test `src/lib/session.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { signSession, verifySession } from './session'

describe('session', () => {
  it('signs and verifies', async () => {
    expect(await verifySession(await signSession())).toBe(true)
  })
  it('rejects garbage and tampered tokens', async () => {
    expect(await verifySession('nope')).toBe(false)
    const t = await signSession()
    expect(await verifySession(t.slice(0, -2) + 'xx')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify fail** — `npx vitest run src/lib/session.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/session.ts`**

```ts
import { SignJWT, jwtVerify } from 'jose'

export const SESSION_COOKIE = 'pd_session'
export const SESSION_TTL_S = 30 * 60 // 30-minute sliding inactivity window

const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET!)

export async function signSession(): Promise<string> {
  return new SignJWT({ u: 'owner' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_S}s`)
    .sign(secret())
}

export async function verifySession(token: string): Promise<boolean> {
  try { await jwtVerify(token, secret()); return true } catch { return false }
}

export const sessionCookieOptions = {
  httpOnly: true as const,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: SESSION_TTL_S,
  path: '/',
}
```

- [ ] **Step 4: Run to verify pass** — Expected: PASS.

- [ ] **Step 5: Write `src/middleware.ts`** (sliding window = re-sign fresh 30-min token on every authenticated request)

```ts
import { NextRequest, NextResponse } from 'next/server'
import { verifySession, signSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/session'

const PUBLIC = [/^\/login/, /^\/api\/auth\//, /^\/api\/updates$/, /^\/api\/intents$/]

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (PUBLIC.some(r => r.test(pathname))) return NextResponse.next()
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (token && (await verifySession(token))) {
    const res = NextResponse.next()
    res.cookies.set(SESSION_COOKIE, await signSession(), sessionCookieOptions)
    return res
  }
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.redirect(new URL('/login', req.url))
}

export const config = { matcher: ['/((?!_next|favicon\\.ico).*)'] }
```

- [ ] **Step 6: Verify redirect manually + commit**

Run: `npm run dev` then `curl -sI http://localhost:3000/ | head -3` — Expected: `307` with `location: /login`.
```bash
git add -A && git commit -m "feat: signed session cookie with 30-min sliding window"
```

---

### Task 4: WebAuthn biometric register/login + login page

**Files:**
- Create: `src/app/api/auth/register/options/route.ts`, `src/app/api/auth/register/verify/route.ts`, `src/app/api/auth/login/options/route.ts`, `src/app/api/auth/login/verify/route.ts`, `src/app/login/page.tsx`, `src/app/api/auth/auth.test.ts`

**Interfaces:**
- Consumes: `db`, `Credential`, `signSession`, `SESSION_COOKIE`, `sessionCookieOptions`.
- Produces: browser flow — POST `options` route returns @simplewebauthn options JSON + sets `pd_challenge` cookie (5 min, httpOnly); POST `verify` route checks it, stores/loads `Credential`, sets session cookie. Registration only allowed while `Credential` collection is empty (clone-owners register their own first passkey; reset = drop `credentials` collection).

- [ ] **Step 1: Write failing test `src/app/api/auth/auth.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { db } from '@/lib/db'
import { Credential } from '@/lib/models'
import { POST as regOptions } from './register/options/route'

describe('webauthn registration options', () => {
  it('returns options with challenge and sets challenge cookie when no credential exists', async () => {
    await db()
    const res = await regOptions()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.challenge).toBeTruthy()
    expect(body.rp.id).toBe('localhost')
    expect(res.headers.get('set-cookie')).toContain('pd_challenge=')
  })
  it('refuses when a credential already exists', async () => {
    await db()
    await Credential.create({ credId: 'x', publicKey: 'x', counter: 0 })
    const res = await regOptions()
    expect(res.status).toBe(403)
  })
})
```

- [ ] **Step 2: Run to verify fail** — `npx vitest run src/app/api/auth/auth.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement the four routes**

```ts
// src/app/api/auth/register/options/route.ts
import { generateRegistrationOptions } from '@simplewebauthn/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Credential } from '@/lib/models'

export async function POST() {
  await db()
  if ((await Credential.countDocuments()) > 0)
    return NextResponse.json({ error: 'already registered — sign in instead' }, { status: 403 })
  const options = await generateRegistrationOptions({
    rpName: 'Personal Dashboard',
    rpID: process.env.RP_ID!,
    userName: 'owner',
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
  })
  const res = NextResponse.json(options)
  res.cookies.set('pd_challenge', options.challenge, { httpOnly: true, maxAge: 300, path: '/' })
  return res
}
```

```ts
// src/app/api/auth/register/verify/route.ts
import { verifyRegistrationResponse } from '@simplewebauthn/server'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Credential } from '@/lib/models'
import { signSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/session'

export async function POST(req: NextRequest) {
  await db()
  if ((await Credential.countDocuments()) > 0)
    return NextResponse.json({ error: 'already registered' }, { status: 403 })
  const expectedChallenge = req.cookies.get('pd_challenge')?.value
  if (!expectedChallenge) return NextResponse.json({ error: 'no challenge' }, { status: 400 })
  const v = await verifyRegistrationResponse({
    response: await req.json(),
    expectedChallenge,
    expectedOrigin: process.env.ORIGIN!,
    expectedRPID: process.env.RP_ID!,
    requireUserVerification: true,
  })
  if (!v.verified || !v.registrationInfo) return NextResponse.json({ error: 'not verified' }, { status: 400 })
  const { credential } = v.registrationInfo
  await Credential.create({
    credId: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    transports: credential.transports ?? [],
  })
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, await signSession(), sessionCookieOptions)
  res.cookies.delete('pd_challenge')
  return res
}
```

```ts
// src/app/api/auth/login/options/route.ts
import { generateAuthenticationOptions } from '@simplewebauthn/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Credential } from '@/lib/models'

export async function POST() {
  await db()
  const creds = await Credential.find()
  if (creds.length === 0) return NextResponse.json({ error: 'no passkey registered' }, { status: 404 })
  const options = await generateAuthenticationOptions({
    rpID: process.env.RP_ID!,
    userVerification: 'required',
    allowCredentials: creds.map(c => ({ id: c.credId, transports: c.transports })),
  })
  const res = NextResponse.json(options)
  res.cookies.set('pd_challenge', options.challenge, { httpOnly: true, maxAge: 300, path: '/' })
  return res
}
```

```ts
// src/app/api/auth/login/verify/route.ts
import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Credential } from '@/lib/models'
import { signSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/session'

export async function POST(req: NextRequest) {
  await db()
  const body = await req.json()
  const expectedChallenge = req.cookies.get('pd_challenge')?.value
  if (!expectedChallenge) return NextResponse.json({ error: 'no challenge' }, { status: 400 })
  const cred = await Credential.findOne({ credId: body.id })
  if (!cred) return NextResponse.json({ error: 'unknown credential' }, { status: 404 })
  const v = await verifyAuthenticationResponse({
    response: body,
    expectedChallenge,
    expectedOrigin: process.env.ORIGIN!,
    expectedRPID: process.env.RP_ID!,
    requireUserVerification: true,
    credential: {
      id: cred.credId,
      publicKey: new Uint8Array(Buffer.from(cred.publicKey, 'base64url')),
      counter: cred.counter,
      transports: cred.transports,
    },
  })
  if (!v.verified) return NextResponse.json({ error: 'not verified' }, { status: 401 })
  cred.counter = v.authenticationInfo.newCounter
  await cred.save()
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, await signSession(), sessionCookieOptions)
  res.cookies.delete('pd_challenge')
  return res
}
```

- [ ] **Step 4: Run test to verify pass** — Expected: PASS.

- [ ] **Step 5: Write `src/app/login/page.tsx`**

```tsx
'use client'
import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function Login() {
  const router = useRouter()
  const [err, setErr] = useState('')

  async function go(kind: 'login' | 'register') {
    setErr('')
    try {
      const optRes = await fetch(`/api/auth/${kind}/options`, { method: 'POST' })
      if (!optRes.ok) throw new Error((await optRes.json()).error ?? 'options failed')
      const optionsJSON = await optRes.json()
      const cred = kind === 'login'
        ? await startAuthentication({ optionsJSON })
        : await startRegistration({ optionsJSON })
      const vRes = await fetch(`/api/auth/${kind}/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(cred),
      })
      if (!vRes.ok) throw new Error((await vRes.json()).error ?? 'verify failed')
      router.push('/')
      router.refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-neutral-50 dark:bg-neutral-950">
      <div className="space-y-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Personal Dashboard</h1>
        <button onClick={() => go('login')}
          className="rounded-lg border border-neutral-300 px-6 py-3 text-lg hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900">
          Unlock with biometrics
        </button>
        <button onClick={() => go('register')} className="mx-auto block text-sm text-neutral-500 underline">
          First time here? Register this device
        </button>
        {err && <p className="text-sm text-red-600">{err}</p>}
      </div>
    </main>
  )
}
```

- [ ] **Step 6: Manual verify + commit**

Run: `npm run dev`, open `http://localhost:3000` → redirected to `/login` → "Register this device" → Touch ID prompt → lands on `/`. Then wait or delete cookie → back to `/login`, "Unlock with biometrics" works.
```bash
git add -A && git commit -m "feat: webauthn biometric register/login with passkey"
```

---

### Task 5: `/api/updates` — session push endpoint (TDD)

**Files:**
- Create: `src/lib/apply-update.ts`, `src/lib/apply-update.test.ts`, `src/app/api/updates/route.ts`, `src/lib/bearer.ts`

**Interfaces:**
- Consumes: models, `computeStatuses`.
- Produces: `applyUpdate(payload: unknown): Promise<{ applied: string[]; unknown: string[] }>`; `checkBearer(req: Request): boolean` from `@/lib/bearer`; POST `/api/updates` accepting `{ tree, sessionId?, updates: [{node, delta, note}], proposed?: [{title, why?}], intentsDone?: string[] }` — this exact payload shape is what the Task 12 skill writes to `dashboard-summary.json`.

- [ ] **Step 1: Write failing test `src/lib/apply-update.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { Tree, TreeNode, Update, Intent } from './models'
import { applyUpdate } from './apply-update'

let treeId: string, aId: string, bId: string

beforeEach(async () => {
  await db()
  const tree = await Tree.create({ slug: 'xnock', title: 'Xnock', kind: 'project' })
  treeId = String(tree._id)
  const a = await TreeNode.create({ treeId, title: 'Core engine', status: 'in_progress', progress: 50 })
  aId = String(a._id)
  const b = await TreeNode.create({ treeId, title: 'Rendering', prereqs: [aId] })
  bId = String(b._id)
})

describe('applyUpdate', () => {
  it('applies delta, appends update, completes at 100, unlocks dependents', async () => {
    const r = await applyUpdate({ tree: 'xnock', updates: [{ node: 'core engine', delta: 50, note: 'engine finished' }] })
    expect(r.applied).toEqual(['Core engine'])
    const a = await TreeNode.findById(aId)
    expect(a!.status).toBe('done')
    const b = await TreeNode.findById(bId)
    expect(b!.status).toBe('available')
    expect(await Update.countDocuments()).toBe(1)
  })
  it('routes unknown node titles to the proposed inbox', async () => {
    const r = await applyUpdate({ tree: 'xnock', updates: [{ node: 'Networking', delta: 10, note: 'started sockets' }] })
    expect(r.unknown).toEqual(['Networking'])
    const t = await Tree.findOne({ slug: 'xnock' })
    expect(t!.proposed[0].title).toBe('Networking')
    expect(await TreeNode.countDocuments()).toBe(2) // never auto-added
  })
  it('marks intents done', async () => {
    const i = await Intent.create({ treeId, directive: 'focus rendering', status: 'delivered' })
    await applyUpdate({ tree: 'xnock', updates: [], intentsDone: [String(i._id)] })
    expect((await Intent.findById(i._id))!.status).toBe('done')
  })
  it('rejects unknown tree and bad payloads', async () => {
    await expect(applyUpdate({ tree: 'nope', updates: [] })).rejects.toThrow('unknown tree')
    await expect(applyUpdate({ updates: 'x' })).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run to verify fail** — Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/apply-update.ts` and `src/lib/bearer.ts`**

```ts
// src/lib/apply-update.ts
import { z } from 'zod'
import { Tree, TreeNode, Update, Intent } from './models'
import { computeStatuses } from './statuses'

export const UpdatePayload = z.object({
  tree: z.string(),
  sessionId: z.string().optional(),
  updates: z.array(z.object({
    node: z.string(),
    delta: z.number().min(0).max(100),
    note: z.string().min(1),
  })).default([]),
  proposed: z.array(z.object({ title: z.string(), why: z.string().optional() })).default([]),
  intentsDone: z.array(z.string()).default([]),
})

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export async function applyUpdate(payload: unknown) {
  const p = UpdatePayload.parse(payload)
  const tree = await Tree.findOne({ slug: p.tree })
  if (!tree) throw new Error(`unknown tree: ${p.tree}`)
  const applied: string[] = []
  const unknown: string[] = []

  for (const u of p.updates) {
    const node = await TreeNode.findOne({ treeId: tree._id, title: new RegExp(`^${escapeRe(u.node)}$`, 'i') })
    if (!node) { unknown.push(u.node); tree.proposed.push({ title: u.node, why: u.note }); continue }
    node.progress = Math.min(100, node.progress + u.delta)
    node.status = node.progress >= 100 ? 'done' : node.progress > 0 ? 'in_progress' : node.status
    await node.save()
    await Update.create({ nodeId: node._id, treeId: tree._id, sessionId: p.sessionId, summary: u.note, delta: u.delta, source: 'session' })
    applied.push(node.title)
  }
  for (const pr of p.proposed) tree.proposed.push({ title: pr.title, why: pr.why ?? '' })
  await tree.save()
  if (p.intentsDone.length) await Intent.updateMany({ _id: { $in: p.intentsDone } }, { status: 'done' })

  const nodes = await TreeNode.find({ treeId: tree._id })
  const st = computeStatuses(nodes.map(x => ({ id: String(x._id), status: x.status, progress: x.progress, prereqs: x.prereqs.map(String) })))
  await Promise.all(nodes.map(x => {
    const s = st.get(String(x._id))!
    if (s !== x.status) { x.status = s; return x.save() }
  }))
  return { applied, unknown }
}
```

```ts
// src/lib/bearer.ts
export function checkBearer(req: Request): boolean {
  return req.headers.get('authorization') === `Bearer ${process.env.DASHBOARD_TOKEN}`
}
```

```ts
// src/app/api/updates/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { applyUpdate } from '@/lib/apply-update'
import { checkBearer } from '@/lib/bearer'

export async function POST(req: NextRequest) {
  if (!checkBearer(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  await db()
  try {
    return NextResponse.json(await applyUpdate(await req.json()))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'bad payload' }, { status: 400 })
  }
}
```

- [ ] **Step 4: Run to verify pass** — `npm test` — Expected: PASS.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: /api/updates push endpoint with proposed-node inbox"`

---

### Task 6: `/api/intents` pull endpoint + UI intent CRUD (TDD)

**Files:**
- Create: `src/app/api/intents/route.ts`, `src/app/api/intents/intents.test.ts`, `src/app/api/trees/[slug]/intents/route.ts`

**Interfaces:**
- Consumes: models, `checkBearer`.
- Produces: GET `/api/intents?project=<slug>` (bearer) → `{ intents: [{ id, node: string|null, directive }] }`, marks them `delivered`. POST `/api/trees/[slug]/intents` (session-protected by middleware) body `{ directive: string, nodeId?: string }` → creates pending intent.

- [ ] **Step 1: Write failing test `src/app/api/intents/intents.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { Tree, TreeNode, Intent } from '@/lib/models'
import { GET } from './route'

const req = (url: string, token = 'test-token') =>
  new NextRequest(url, { headers: { authorization: `Bearer ${token}` } })

beforeEach(async () => {
  await db()
  const tree = await Tree.create({ slug: 'xnock', title: 'Xnock', kind: 'project' })
  const node = await TreeNode.create({ treeId: tree._id, title: 'Rendering' })
  await Intent.create({ treeId: tree._id, nodeId: node._id, directive: 'focus rendering next' })
})

describe('GET /api/intents', () => {
  it('401s without token', async () => {
    const res = await GET(req('http://x/api/intents?project=xnock', 'wrong'))
    expect(res.status).toBe(401)
  })
  it('returns pending intents with node titles and marks delivered', async () => {
    const res = await GET(req('http://x/api/intents?project=xnock'))
    const body = await res.json()
    expect(body.intents).toHaveLength(1)
    expect(body.intents[0].node).toBe('Rendering')
    expect(body.intents[0].directive).toBe('focus rendering next')
    expect((await Intent.findOne())!.status).toBe('delivered')
    const again = await (await GET(req('http://x/api/intents?project=xnock'))).json()
    expect(again.intents).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run to verify fail** — Expected: FAIL.

- [ ] **Step 3: Implement both routes**

```ts
// src/app/api/intents/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Tree, Intent } from '@/lib/models'
import { checkBearer } from '@/lib/bearer'

export async function GET(req: NextRequest) {
  if (!checkBearer(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  await db()
  const slug = req.nextUrl.searchParams.get('project')
  const tree = await Tree.findOne({ slug })
  if (!tree) return NextResponse.json({ error: `unknown tree: ${slug}` }, { status: 404 })
  const pending = await Intent.find({ treeId: tree._id, status: 'pending' }).populate('nodeId', 'title')
  const intents = pending.map(i => ({
    id: String(i._id),
    node: i.nodeId ? (i.nodeId as unknown as { title: string }).title : null,
    directive: i.directive,
  }))
  await Intent.updateMany(
    { _id: { $in: pending.map(i => i._id) } },
    { status: 'delivered', deliveredAt: new Date() },
  )
  return NextResponse.json({ intents })
}
```

```ts
// src/app/api/trees/[slug]/intents/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { Tree, Intent } from '@/lib/models'

const Body = z.object({ directive: z.string().min(1), nodeId: z.string().optional() })

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  await db()
  const { slug } = await params
  const tree = await Tree.findOne({ slug })
  if (!tree) return NextResponse.json({ error: 'unknown tree' }, { status: 404 })
  const parsed = Body.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'bad payload' }, { status: 400 })
  const intent = await Intent.create({ treeId: tree._id, nodeId: parsed.data.nodeId, directive: parsed.data.directive })
  return NextResponse.json({ id: String(intent._id) })
}
```

- [ ] **Step 4: Run to verify pass** — `npm test` — Expected: PASS.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: intent queue pull endpoint and UI intent creation"`

---

### Task 7: Markdown importer + tree CRUD + seed (TDD)

**Files:**
- Create: `src/lib/importer.ts`, `src/lib/importer.test.ts`, `src/app/api/trees/route.ts`, `scripts/seed.ts`

**Interfaces:**
- Consumes: models.
- Produces: `importTree(input: { slug: string; title: string; kind: 'project'|'life'|'course'; outline: string }): Promise<{ treeId: string; nodeCount: number }>` — outline is `- ` bulleted markdown, 2-space indent = child (child's prereq = parent). Every tree gets a synthetic root node `Setup` created as `done` (endowed progress), prereq of all depth-0 nodes. POST `/api/trees` (session) body = same input. GET `/api/trees` → `[{ slug, title, kind }]`. `npm run seed` seeds a sample tree.

- [ ] **Step 1: Write failing test `src/lib/importer.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { db } from './db'
import { TreeNode } from './models'
import { importTree, parseOutline } from './importer'

describe('parseOutline', () => {
  it('parses titles and depths', () => {
    expect(parseOutline('- A\n  - B\n    - C\n- D')).toEqual([
      { title: 'A', depth: 0 }, { title: 'B', depth: 1 }, { title: 'C', depth: 2 }, { title: 'D', depth: 0 },
    ])
  })
})

describe('importTree', () => {
  it('creates Setup root done, wires prereqs, computes statuses', async () => {
    await db()
    await importTree({ slug: 't', title: 'T', kind: 'life', outline: '- A\n  - B\n- D' })
    const nodes = await TreeNode.find().sort('createdAt')
    const byTitle = Object.fromEntries(nodes.map(x => [x.title, x]))
    expect(byTitle['Setup'].status).toBe('done')
    expect(byTitle['A'].status).toBe('available')
    expect(byTitle['A'].prereqs.map(String)).toEqual([String(byTitle['Setup']._id)])
    expect(byTitle['B'].status).toBe('locked')
    expect(byTitle['B'].prereqs.map(String)).toEqual([String(byTitle['A']._id)])
    expect(byTitle['D'].status).toBe('available')
  })
})
```

- [ ] **Step 2: Run to verify fail** — Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/importer.ts`**

```ts
import { Tree, TreeNode } from './models'
import { computeStatuses } from './statuses'

export function parseOutline(md: string): { title: string; depth: number }[] {
  return md.split('\n')
    .map(l => { const m = l.match(/^(\s*)-\s+(.+)$/); return m ? { depth: Math.floor(m[1].length / 2), title: m[2].trim() } : null })
    .filter((x): x is { title: string; depth: number } => x !== null)
}

export async function importTree(input: { slug: string; title: string; kind: 'project' | 'life' | 'course'; outline: string }) {
  const tree = await Tree.create({ slug: input.slug, title: input.title, kind: input.kind })
  const setup = await TreeNode.create({ treeId: tree._id, title: 'Setup', why: 'Groundwork already done by creating this tree.', status: 'done', progress: 100 })
  const stack: { depth: number; id: string }[] = []
  for (const item of parseOutline(input.outline)) {
    while (stack.length && stack[stack.length - 1].depth >= item.depth) stack.pop()
    const prereq = stack.length ? stack[stack.length - 1].id : String(setup._id)
    const node = await TreeNode.create({ treeId: tree._id, title: item.title, prereqs: [prereq] })
    stack.push({ depth: item.depth, id: String(node._id) })
  }
  const nodes = await TreeNode.find({ treeId: tree._id })
  const st = computeStatuses(nodes.map(x => ({ id: String(x._id), status: x.status, progress: x.progress, prereqs: x.prereqs.map(String) })))
  await Promise.all(nodes.map(x => { const s = st.get(String(x._id))!; if (s !== x.status) { x.status = s; return x.save() } }))
  return { treeId: String(tree._id), nodeCount: nodes.length }
}
```

- [ ] **Step 4: Run to verify pass** — Expected: PASS.

- [ ] **Step 5: Implement `src/app/api/trees/route.ts` and `scripts/seed.ts`**

```ts
// src/app/api/trees/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { Tree } from '@/lib/models'
import { importTree } from '@/lib/importer'

const Body = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  kind: z.enum(['project', 'life', 'course']),
  outline: z.string(),
})

export async function GET() {
  await db()
  const trees = await Tree.find().sort('-updatedAt')
  return NextResponse.json(trees.map(t => ({ slug: t.slug, title: t.title, kind: t.kind })))
}

export async function POST(req: NextRequest) {
  await db()
  const parsed = Body.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'bad payload' }, { status: 400 })
  if (await Tree.findOne({ slug: parsed.data.slug }))
    return NextResponse.json({ error: 'slug taken' }, { status: 409 })
  return NextResponse.json(await importTree(parsed.data))
}
```

```ts
// scripts/seed.ts — run with: npx tsx --env-file=.env scripts/seed.ts
import { db } from '../src/lib/db'
import { Tree } from '../src/lib/models'
import { importTree } from '../src/lib/importer'
import mongoose from 'mongoose'

async function main() {
  await db()
  if (await Tree.findOne({ slug: 'xnock' })) { console.log('already seeded'); return }
  const r = await importTree({
    slug: 'xnock', title: 'Xnock', kind: 'project',
    outline: '- Core engine\n  - Rendering\n    - Polish\n  - Audio\n- Networking',
  })
  console.log(`seeded xnock with ${r.nodeCount} nodes`)
}
main().then(() => mongoose.disconnect())
```

Add to package.json scripts: `"seed": "tsx --env-file=.env scripts/seed.ts"`.

- [ ] **Step 6: Run seed against real Atlas + commit**

Run: `npm run seed` — Expected: `seeded xnock with 6 nodes`.
```bash
git add -A && git commit -m "feat: markdown outline importer, tree CRUD, seed script"
```

---

### Task 8: Tree view — React Flow skill tree + node drawer

**Files:**
- Create: `src/lib/layout.ts`, `src/lib/queries.ts`, `src/app/t/[slug]/page.tsx`, `src/components/SkillTree.tsx`, `src/components/NodeDrawer.tsx`, `src/app/api/nodes/[id]/route.ts`

**Interfaces:**
- Consumes: models, `computeStatuses` (statuses already stored), intents POST route from Task 6.
- Produces: `layoutTree(nodes: {id: string}[], edges: {source: string; target: string}[]): (n & {position: {x: number; y: number}})[]`; `getTreeData(slug: string)` in `@/lib/queries` returning `{ tree: {slug,title,kind,proposed}, nodes: NodeDTO[], updatesByNode: Record<string, {summary: string; at: string}[]> }` where `NodeDTO = { id, title, why, status, progress, nextAction, reviewDue: string|null, prereqs: string[] }`. PATCH `/api/nodes/[id]` body subset `{ nextAction?, why?, progress?, status?, reviewDue? }` for drawer edits (session-protected).

- [ ] **Step 1: Write `src/lib/layout.ts`**

```ts
import dagre from '@dagrejs/dagre'

export function layoutTree<T extends { id: string }>(nodes: T[], edges: { source: string; target: string }[]) {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 70 })
  g.setDefaultEdgeLabel(() => ({}))
  nodes.forEach(n => g.setNode(n.id, { width: 190, height: 70 }))
  edges.forEach(e => g.setEdge(e.source, e.target))
  dagre.layout(g)
  return nodes.map(n => ({ ...n, position: { x: g.node(n.id).x - 95, y: g.node(n.id).y - 35 } }))
}
```

- [ ] **Step 2: Write `src/lib/queries.ts`**

```ts
import { db } from './db'
import { Tree, TreeNode, Update } from './models'

export async function getTreeData(slug: string) {
  await db()
  const tree = await Tree.findOne({ slug }).lean()
  if (!tree) return null
  const nodes = await TreeNode.find({ treeId: tree._id }).lean()
  const updates = await Update.find({ treeId: tree._id }).sort('-createdAt').limit(200).lean()
  const updatesByNode: Record<string, { summary: string; at: string }[]> = {}
  for (const u of updates) {
    const k = String(u.nodeId ?? '')
    ;(updatesByNode[k] ??= []).push({ summary: u.summary, at: (u as { createdAt: Date }).createdAt.toISOString() })
  }
  return {
    tree: { slug: tree.slug, title: tree.title, kind: tree.kind, proposed: (tree.proposed ?? []).map(p => ({ title: p.title, why: p.why ?? '' })) },
    nodes: nodes.map(x => ({
      id: String(x._id), title: x.title, why: x.why, status: x.status, progress: x.progress,
      nextAction: x.nextAction, reviewDue: x.reviewDue?.toISOString() ?? null, prereqs: (x.prereqs ?? []).map(String),
    })),
    updatesByNode,
  }
}
```

- [ ] **Step 3: Write `src/components/SkillTree.tsx`** (client component)

```tsx
'use client'
import { ReactFlow, Background, Handle, Position, type NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useMemo, useState } from 'react'
import { layoutTree } from '@/lib/layout'
import NodeDrawer, { type NodeDTO } from './NodeDrawer'

const STATUS_STYLE: Record<string, string> = {
  locked: 'opacity-40 border-dashed',
  available: 'border-neutral-400',
  in_progress: 'border-amber-500 shadow-md',
  done: 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950',
}

function SkillNode({ data }: NodeProps) {
  const d = data as unknown as NodeDTO & { onOpen: (n: NodeDTO) => void }
  return (
    <button onClick={() => d.onOpen(d)}
      className={`w-[190px] rounded-lg border-2 bg-white p-2 text-left dark:bg-neutral-900 ${STATUS_STYLE[d.status]}`}>
      <Handle type="target" position={Position.Top} className="invisible" />
      <div className="truncate text-sm font-medium">{d.title}</div>
      {d.status !== 'done' && d.status !== 'locked' && (
        <div className="mt-1 h-1.5 rounded bg-neutral-200 dark:bg-neutral-700">
          <div className="h-1.5 rounded bg-amber-500" style={{ width: `${d.progress}%` }} />
        </div>
      )}
      {d.status === 'done' && <div className="text-xs text-emerald-700">done</div>}
      <Handle type="source" position={Position.Bottom} className="invisible" />
    </button>
  )
}

export default function SkillTree({ slug, nodes, updatesByNode }:
  { slug: string; nodes: NodeDTO[]; updatesByNode: Record<string, { summary: string; at: string }[]> }) {
  const [open, setOpen] = useState<NodeDTO | null>(null)
  const flow = useMemo(() => {
    const edges = nodes.flatMap(n => n.prereqs.map(p => ({ id: `${p}-${n.id}`, source: p, target: n.id })))
    const laid = layoutTree(nodes.map(n => ({ ...n, onOpen: setOpen })), edges)
    return {
      nodes: laid.map(n => ({ id: n.id, type: 'skill', position: n.position, data: n as unknown as Record<string, unknown> })),
      edges,
    }
  }, [nodes])
  return (
    <div className="h-[calc(100vh-3rem)]">
      <ReactFlow nodeTypes={{ skill: SkillNode }} nodes={flow.nodes} edges={flow.edges} fitView proOptions={{ hideAttribution: true }}>
        <Background />
      </ReactFlow>
      {open && <NodeDrawer slug={slug} node={open} updates={updatesByNode[open.id] ?? []} onClose={() => setOpen(null)} />}
    </div>
  )
}
```

- [ ] **Step 4: Write `src/components/NodeDrawer.tsx`**

```tsx
'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export type NodeDTO = {
  id: string; title: string; why: string; status: string; progress: number
  nextAction: string; reviewDue: string | null; prereqs: string[]
}

export default function NodeDrawer({ slug, node, updates, onClose }:
  { slug: string; node: NodeDTO; updates: { summary: string; at: string }[]; onClose: () => void }) {
  const router = useRouter()
  const [nextAction, setNextAction] = useState(node.nextAction)
  const [directive, setDirective] = useState('')

  async function patch(body: Record<string, unknown>) {
    await fetch(`/api/nodes/${node.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    router.refresh()
  }
  async function sendIntent() {
    if (!directive.trim()) return
    await fetch(`/api/trees/${slug}/intents`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ directive, nodeId: node.id }) })
    setDirective('')
    router.refresh()
  }

  return (
    <aside className="fixed right-0 top-0 z-10 h-full w-96 overflow-y-auto border-l bg-white p-5 dark:bg-neutral-900">
      <div className="flex items-start justify-between">
        <h2 className="text-lg font-semibold">{node.title}</h2>
        <button onClick={onClose} className="text-neutral-500">✕</button>
      </div>
      <p className="mt-1 text-sm text-neutral-500">{node.why || 'No why-line yet.'}</p>
      <p className="mt-2 text-sm">{node.status} · {node.progress}% toward unlock</p>

      <label className="mt-4 block text-xs font-medium uppercase text-neutral-400">Next action (when/how)</label>
      <input value={nextAction} onChange={e => setNextAction(e.target.value)} onBlur={() => patch({ nextAction })}
        placeholder="When I next open this project, I will…"
        className="mt-1 w-full rounded border p-2 text-sm dark:bg-neutral-800" />

      <div className="mt-4 flex gap-2">
        {node.status !== 'done' && (
          <button onClick={() => patch({ progress: 100, status: 'done' })} className="rounded border px-3 py-1 text-sm">Mark done</button>
        )}
      </div>

      <label className="mt-6 block text-xs font-medium uppercase text-neutral-400">Directive for next session</label>
      <div className="mt-1 flex gap-2">
        <input value={directive} onChange={e => setDirective(e.target.value)}
          placeholder="focus this next / explain this branch…"
          className="w-full rounded border p-2 text-sm dark:bg-neutral-800" />
        <button onClick={sendIntent} className="rounded border px-3 text-sm">Queue</button>
      </div>

      <h3 className="mt-6 text-xs font-medium uppercase text-neutral-400">History</h3>
      <ul className="mt-2 space-y-2">
        {updates.map((u, i) => (
          <li key={i} className="text-sm"><span className="text-neutral-400">{u.at.slice(0, 10)}</span> {u.summary}</li>
        ))}
        {updates.length === 0 && <li className="text-sm text-neutral-400">Nothing yet.</li>}
      </ul>
    </aside>
  )
}
```

- [ ] **Step 5: Write page + PATCH route**

```tsx
// src/app/t/[slug]/page.tsx
import { notFound } from 'next/navigation'
import { getTreeData } from '@/lib/queries'
import SkillTree from '@/components/SkillTree'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function TreePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const data = await getTreeData(slug)
  if (!data) notFound()
  return (
    <main>
      <header className="flex h-12 items-center gap-4 border-b px-4">
        <Link href="/" className="text-sm text-neutral-500">← Home</Link>
        <h1 className="font-semibold">{data.tree.title}</h1>
        {data.tree.proposed.length > 0 && (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
            {data.tree.proposed.length} proposed node(s): {data.tree.proposed.map(p => p.title).join(', ')}
          </span>
        )}
      </header>
      <SkillTree slug={slug} nodes={data.nodes} updatesByNode={data.updatesByNode} />
    </main>
  )
}
```

```ts
// src/app/api/nodes/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { TreeNode } from '@/lib/models'
import { computeStatuses } from '@/lib/statuses'

const Body = z.object({
  nextAction: z.string().optional(),
  why: z.string().optional(),
  progress: z.number().min(0).max(100).optional(),
  status: z.enum(['locked', 'available', 'in_progress', 'done']).optional(),
  reviewDue: z.string().datetime().nullable().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await db()
  const { id } = await params
  const parsed = Body.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'bad payload' }, { status: 400 })
  const node = await TreeNode.findById(id)
  if (!node) return NextResponse.json({ error: 'not found' }, { status: 404 })
  Object.assign(node, parsed.data, parsed.data.reviewDue !== undefined ? { reviewDue: parsed.data.reviewDue ? new Date(parsed.data.reviewDue) : undefined } : {})
  await node.save()
  const nodes = await TreeNode.find({ treeId: node.treeId })
  const st = computeStatuses(nodes.map(x => ({ id: String(x._id), status: x.status, progress: x.progress, prereqs: x.prereqs.map(String) })))
  await Promise.all(nodes.map(x => { const s = st.get(String(x._id))!; if (s !== x.status) { x.status = s; return x.save() } }))
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 6: Verify + commit**

Run: `npm run dev`, log in, open `http://localhost:3000/t/xnock` — Expected: laid-out tree, seeded statuses (Setup done, Core engine + Networking available, rest locked), drawer opens, queue a directive, `npm test` still green, `npm run build` clean.
```bash
git add -A && git commit -m "feat: react-flow skill tree view with node drawer"
```

---

### Task 9: Home page — four groups

**Files:**
- Create: `src/app/page.tsx` (replace scaffold), extend `src/lib/queries.ts`

**Interfaces:**
- Consumes: models.
- Produces: `getHomeData()` in `@/lib/queries` returning `{ resume: NodeCard|null, next: NodeCard|null, weekMoved: {tree: string; summary: string; at: string}[], alert: string|null, trees: {slug: string; title: string; kind: string}[] }` where `NodeCard = { id, title, tree, treeSlug, progress, nextAction }`.

- [ ] **Step 1: Extend `src/lib/queries.ts`**

```ts
import { Intent } from './models' // add to existing imports

export function mondayOf(d = new Date()) {
  const x = new Date(d); const day = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0); return x
}

export async function getHomeData() {
  await db()
  const trees = await Tree.find().sort('-updatedAt').lean()
  const byId = Object.fromEntries(trees.map(t => [String(t._id), t]))
  const card = (n: { _id: unknown; title: string; treeId: unknown; progress: number; nextAction: string }) => ({
    id: String(n._id), title: n.title, tree: byId[String(n.treeId)]?.title ?? '', treeSlug: byId[String(n.treeId)]?.slug ?? '',
    progress: n.progress, nextAction: n.nextAction,
  })
  const resume = await TreeNode.findOne({ status: 'in_progress' }).sort('-updatedAt').lean()
  const next = await TreeNode.findOne({ status: 'available' }).sort('-updatedAt').lean()
  const weekUpdates = await Update.find({ createdAt: { $gte: mondayOf() } }).sort('-createdAt').limit(5).lean()
  const pendingIntent = await Intent.findOne({ status: 'pending' }).sort('createdAt').lean()
  const overdue = await TreeNode.findOne({ reviewDue: { $lte: new Date() }, status: { $ne: 'done' } }).lean()
  return {
    resume: resume ? card(resume) : null,
    next: next ? card(next) : null,
    weekMoved: weekUpdates.map(u => ({ tree: byId[String(u.treeId)]?.title ?? '', summary: u.summary, at: (u as { createdAt: Date }).createdAt.toISOString() })),
    alert: overdue ? `Review due: ${overdue.title}` : pendingIntent ? `Intent waiting: ${pendingIntent.directive}` : null,
    trees: trees.map(t => ({ slug: t.slug, title: t.title, kind: t.kind })),
  }
}
```

- [ ] **Step 2: Replace `src/app/page.tsx`**

```tsx
import Link from 'next/link'
import { getHomeData } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const d = await getHomeData()
  return (
    <main className="mx-auto max-w-3xl space-y-8 p-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <nav className="flex gap-3 text-sm text-neutral-500">
          {d.trees.map(t => <Link key={t.slug} href={`/t/${t.slug}`} className="underline">{t.title}</Link>)}
          <Link href="/new" className="underline">+ tree</Link>
          <Link href="/week" className="underline">week</Link>
        </nav>
      </header>

      <section className="rounded-xl border p-4">
        <h2 className="text-xs font-medium uppercase text-neutral-400">Resume here</h2>
        {d.resume ? (
          <Link href={`/t/${d.resume.treeSlug}`} className="mt-1 block">
            <span className="text-lg font-medium">{d.resume.title}</span>
            <span className="ml-2 text-sm text-neutral-500">{d.resume.tree} · {d.resume.progress}%</span>
            {d.resume.nextAction && <p className="text-sm text-neutral-500">→ {d.resume.nextAction}</p>}
          </Link>
        ) : <p className="mt-1 text-sm text-neutral-400">Nothing in progress. Pick something from Next up.</p>}
      </section>

      <section className="rounded-xl border p-4">
        <h2 className="text-xs font-medium uppercase text-neutral-400">Next up</h2>
        {d.next ? (
          <Link href={`/t/${d.next.treeSlug}`} className="mt-1 block">
            <span className="text-lg font-medium">{d.next.title}</span>
            <span className="ml-2 text-sm text-neutral-500">{d.next.tree} · {d.next.progress}% toward unlock</span>
          </Link>
        ) : <p className="mt-1 text-sm text-neutral-400">All caught up.</p>}
      </section>

      <section className="rounded-xl border p-4">
        <h2 className="text-xs font-medium uppercase text-neutral-400">This week moved</h2>
        <ul className="mt-1 space-y-1">
          {d.weekMoved.map((u, i) => (
            <li key={i} className="text-sm"><span className="text-neutral-400">{u.tree}</span> {u.summary}</li>
          ))}
          {d.weekMoved.length === 0 && <li className="text-sm text-neutral-400">No wins logged yet this week.</li>}
        </ul>
      </section>

      {d.alert && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:bg-amber-950">
          <h2 className="text-xs font-medium uppercase text-amber-600">Needs you</h2>
          <p className="mt-1 text-sm">{d.alert}</p>
        </section>
      )}
    </main>
  )
}
```

- [ ] **Step 3: Verify + commit**

Run: `npm run dev`, open `/` — Expected: 4 groups max, seeded data visible. `npm run build` clean.
```bash
git add -A && git commit -m "feat: home page with four research-backed groups"
```

---

### Task 10: Tree editor page

**Files:**
- Create: `src/app/new/page.tsx`

**Interfaces:**
- Consumes: POST `/api/trees` from Task 7.

- [ ] **Step 1: Write `src/app/new/page.tsx`**

```tsx
'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function NewTree() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [kind, setKind] = useState<'project' | 'life' | 'course'>('project')
  const [outline, setOutline] = useState('- First milestone\n  - Depends on first\n- Independent branch')
  const [err, setErr] = useState('')

  async function create() {
    setErr('')
    const res = await fetch('/api/trees', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, slug, kind, outline }),
    })
    if (!res.ok) { setErr((await res.json()).error ?? 'failed'); return }
    router.push(`/t/${slug}`)
  }

  return (
    <main className="mx-auto max-w-xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">New tree</h1>
      <input value={title} onChange={e => { setTitle(e.target.value); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')) }}
        placeholder="Title" className="w-full rounded border p-2 dark:bg-neutral-800" />
      <input value={slug} onChange={e => setSlug(e.target.value)} placeholder="slug" className="w-full rounded border p-2 dark:bg-neutral-800" />
      <select value={kind} onChange={e => setKind(e.target.value as typeof kind)} className="w-full rounded border p-2 dark:bg-neutral-800">
        <option value="project">project</option><option value="life">life</option><option value="course">course</option>
      </select>
      <p className="text-xs text-neutral-500">Markdown outline. 2-space indent = needs the node above it. A done “Setup” root is added for you.</p>
      <textarea value={outline} onChange={e => setOutline(e.target.value)} rows={10} className="w-full rounded border p-2 font-mono text-sm dark:bg-neutral-800" />
      <button onClick={create} className="rounded border px-4 py-2">Create</button>
      {err && <p className="text-sm text-red-600">{err}</p>}
    </main>
  )
}
```

- [ ] **Step 2: Verify + commit**

Run: dev server → `/new` → create a `life` tree → lands on its tree view, Setup done, roots available.
```bash
git add -A && git commit -m "feat: tree editor with markdown outline import"
```

---

### Task 11: Weekly digest + reflections

**Files:**
- Create: `src/app/week/page.tsx`, `src/app/api/reflections/route.ts`
- Modify: `src/lib/queries.ts` (add `getWeekData`)

**Interfaces:**
- Consumes: `mondayOf`, models.
- Produces: `getWeekData()` → `{ weekStart: string, byTree: {tree: string; items: {summary: string; at: string}[]}[], reflection: string|null }`. POST `/api/reflections` body `{ body: string }` upserts current week's reflection (session-protected).

- [ ] **Step 1: Add `getWeekData` to `src/lib/queries.ts`**

```ts
import { Reflection } from './models' // add to existing imports

export async function getWeekData() {
  await db()
  const weekStart = mondayOf()
  const updates = await Update.find({ createdAt: { $gte: weekStart } }).sort('-createdAt').lean()
  const trees = await Tree.find().lean()
  const byId = Object.fromEntries(trees.map(t => [String(t._id), t.title]))
  const grouped: Record<string, { summary: string; at: string }[]> = {}
  for (const u of updates)
    (grouped[byId[String(u.treeId)] ?? '?'] ??= []).push({ summary: u.summary, at: (u as { createdAt: Date }).createdAt.toISOString() })
  const reflection = await Reflection.findOne({ weekStart }).lean()
  return {
    weekStart: weekStart.toISOString(),
    byTree: Object.entries(grouped).map(([tree, items]) => ({ tree, items })),
    reflection: reflection?.body ?? null,
  }
}
```

- [ ] **Step 2: Write `src/app/api/reflections/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { Reflection } from '@/lib/models'
import { mondayOf } from '@/lib/queries'

export async function POST(req: NextRequest) {
  await db()
  const parsed = z.object({ body: z.string().min(1) }).safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'bad payload' }, { status: 400 })
  await Reflection.findOneAndUpdate({ weekStart: mondayOf() }, { body: parsed.data.body }, { upsert: true })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Write `src/app/week/page.tsx`**

```tsx
import { getWeekData } from '@/lib/queries'
import ReflectForm from './reflect-form'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function Week() {
  const d = await getWeekData()
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Week of {d.weekStart.slice(0, 10)}</h1>
        <Link href="/" className="text-sm text-neutral-500 underline">Home</Link>
      </header>
      {d.byTree.map(g => (
        <section key={g.tree} className="rounded-xl border p-4">
          <h2 className="font-medium">{g.tree}</h2>
          <ul className="mt-1 space-y-1">
            {g.items.map((u, i) => <li key={i} className="text-sm">{u.summary}</li>)}
          </ul>
        </section>
      ))}
      {d.byTree.length === 0 && <p className="text-sm text-neutral-400">Nothing moved yet this week.</p>}
      <ReflectForm existing={d.reflection} />
    </main>
  )
}
```

```tsx
// src/app/week/reflect-form.tsx
'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function ReflectForm({ existing }: { existing: string | null }) {
  const router = useRouter()
  const [body, setBody] = useState(existing ?? '')
  const [saved, setSaved] = useState(!!existing)
  async function save() {
    if (!body.trim()) return
    await fetch('/api/reflections', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body }) })
    setSaved(true); router.refresh()
  }
  return (
    <section className={`rounded-xl border p-4 ${saved ? 'border-emerald-300' : 'border-amber-300'}`}>
      <h2 className="text-xs font-medium uppercase text-neutral-400">
        {saved ? 'Week closed — reflection saved' : 'Close the week: one line — what did you learn?'}
      </h2>
      <div className="mt-2 flex gap-2">
        <input value={body} onChange={e => setBody(e.target.value)} className="w-full rounded border p-2 text-sm dark:bg-neutral-800" />
        <button onClick={save} className="rounded border px-3 text-sm">Save</button>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Verify + commit**

Run: dev server → `/week` shows grouped updates; saving reflection flips border to green and persists on reload. `npm run build` clean.
```bash
git add -A && git commit -m "feat: weekly digest with closing reflection"
```

---

### Task 12: Claude Code integration — skill, hooks, config

**Files:**
- Create: `integrations/claude-code/README.md`, `integrations/claude-code/hooks/push-summary.sh`, `integrations/claude-code/hooks/pull-intents.sh`, `integrations/claude-code/settings-snippet.json`, `integrations/claude-code/skills/dashboard-sync/SKILL.md`

**Interfaces:**
- Consumes: `/api/updates` payload shape (Task 5), `/api/intents` response shape (Task 6).
- Produces: files a user copies into any tracked project: hooks read `.claude/dashboard.json` (`{ "url": "...", "tree": "<slug>", "token": "<DASHBOARD_TOKEN>" }`, gitignored); skill maintains `.claude/dashboard-summary.json` in the exact `/api/updates` payload shape.

- [ ] **Step 1: Write `integrations/claude-code/hooks/push-summary.sh`**

```bash
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
```

- [ ] **Step 2: Write `integrations/claude-code/hooks/pull-intents.sh`**

```bash
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
```

- [ ] **Step 3: Write `integrations/claude-code/settings-snippet.json`**

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "bash .claude/hooks/pull-intents.sh" }] }
    ],
    "SessionEnd": [
      { "hooks": [{ "type": "command", "command": "bash .claude/hooks/push-summary.sh", "async": true }] }
    ]
  }
}
```

- [ ] **Step 4: Write `integrations/claude-code/skills/dashboard-sync/SKILL.md`**

```markdown
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
```

- [ ] **Step 5: Write `integrations/claude-code/README.md`**

```markdown
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
```

- [ ] **Step 6: End-to-end verify against dev server + commit**

Run (dashboard dev server up, using the real `DASHBOARD_TOKEN` from `.env`):
```bash
cd /private/tmp/claude-501/*/scratchpad && mkdir -p hooktest/.claude/hooks && cd hooktest
cp /Users/shishirgautam/Personal_Dashboard/integrations/claude-code/hooks/*.sh .claude/hooks/
echo '{ "url": "http://localhost:3000", "tree": "xnock", "token": "<token from .env>" }' > .claude/dashboard.json
echo '{ "tree": "xnock", "updates": [{ "node": "Rendering", "delta": 20, "note": "hook e2e test" }] }' > .claude/dashboard-summary.json
bash .claude/hooks/push-summary.sh && ls .claude/   # expect dashboard-summary.sent.json
bash .claude/hooks/pull-intents.sh                  # expect queued directive from Task 8 manual test
```
Expected: Rendering node at 20% on `/t/xnock`; queued intent printed then marked delivered.
```bash
git add -A && git commit -m "feat: claude code integration - dashboard-sync skill and hooks"
```

---

### Task 13: README, deploy, wire xnock

**Files:**
- Create: `README.md` (replace scaffold README)
- Modify: `.env.example` (final check), `.gitignore` (ensure `.env`, `.claude/dashboard.json` patterns documented)

**Interfaces:**
- Consumes: everything.

- [ ] **Step 1: Write `README.md`**

```markdown
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
3. `cp .env.example .env`, fill: `MONGODB_URI`, `DASHBOARD_TOKEN` + `SESSION_SECRET`
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
```

- [ ] **Step 2: Full check**

Run: `npm test` (all green), `npm run build` (clean), `npx eslint .` (clean).

- [ ] **Step 3: Commit + push + deploy**

```bash
git add -A && git commit -m "docs: readme with self-host guide"
git push -u origin main
```
Then: user imports repo in Vercel, sets env vars (`MONGODB_URI`, `MONGODB_DB`, `DASHBOARD_TOKEN`, `SESSION_SECRET`, `RP_ID`, `ORIGIN`), deploys, registers passkey on prod domain.

- [ ] **Step 4: Wire xnock for real**

Follow `integrations/claude-code/README.md` inside `/Users/shishirgautam/XN` with `tree: "xnock"` pointed at the deployed URL. Run one real session; verify the tree moves. This is the spec's §8 manual test.
