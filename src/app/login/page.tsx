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
