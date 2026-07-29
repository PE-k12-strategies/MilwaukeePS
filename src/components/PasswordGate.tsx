import { useState, type FormEvent } from 'react'
import mpsLogo from '../assets/MPS-logo-RGB.jpeg'

const AUTH_SESSION_KEY = 'mps-lrfmp-auth'
const DASHBOARD_PASSWORD = 'MPSTool'

export function isDashboardUnlocked(): boolean {
  try {
    return sessionStorage.getItem(AUTH_SESSION_KEY) === '1'
  } catch {
    return false
  }
}

function persistUnlock() {
  try {
    sessionStorage.setItem(AUTH_SESSION_KEY, '1')
  } catch {
    // Private mode / blocked storage — unlock still works for this page load.
  }
}

interface PasswordGateProps {
  open: boolean
  onSuccess: () => void
}

/** Modal overlay — dashboard remains visible (dimmed) behind the prompt. */
export function PasswordGate({ open, onSuccess }: PasswordGateProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (password === DASHBOARD_PASSWORD) {
      persistUnlock()
      onSuccess()
      return
    }
    setError('Incorrect password. Please try again.')
    setPassword('')
  }

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-900/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="password-gate-title"
    >
      <div className="w-full max-w-md rounded-xl border border-mps-gray-border bg-white p-6 shadow-xl sm:p-8">
        <div className="mb-5 flex justify-center">
          <img
            src={mpsLogo}
            alt="Milwaukee Public Schools"
            className="h-14 w-auto object-contain"
          />
        </div>
        <h1
          id="password-gate-title"
          className="text-center text-xl font-bold text-mps-blue"
        >
          MPS LRFMP Strategy Tool
        </h1>
        <p className="mt-2 text-center text-sm text-mps-muted">
          Enter the password to view the dashboard.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-mps-muted">
              Password
            </span>
            <input
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (error) setError(null)
              }}
              className="w-full rounded-lg border border-mps-gray-border px-3 py-2.5 text-sm text-mps-text outline-none transition focus:border-mps-blue focus:ring-2 focus:ring-mps-blue/20"
              placeholder="Enter password"
            />
          </label>

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="w-full rounded-lg bg-mps-blue px-4 py-3 text-sm font-semibold text-white transition hover:bg-mps-blue-dark"
          >
            Unlock Dashboard
          </button>
        </form>
      </div>
    </div>
  )
}
