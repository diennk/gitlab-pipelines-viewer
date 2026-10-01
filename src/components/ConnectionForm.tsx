import { useState, type FormEvent } from 'react'
import { loadSavedConfig } from '../hooks/useGitLab'
import type { GitLabConfig } from '../types/gitlab'

interface Props {
  busy: boolean
  error: string | null
  /** Current config when opened from Settings. */
  current?: GitLabConfig | null
  onSubmit: (cfg: GitLabConfig, remember: boolean) => void
  onCancel?: () => void
  onDisconnect?: () => void
}

const inputCls =
  'w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-orange-500 focus:outline-none'

export function ConnectionForm({ busy, error, current, onSubmit, onCancel, onDisconnect }: Props) {
  const saved = loadSavedConfig()
  const [url, setUrl] = useState(current?.url ?? saved?.url ?? (import.meta.env.VITE_GITLAB_URL as string | undefined) ?? '')
  const [token, setToken] = useState(current?.token ?? saved?.token ?? '')
  const [remember, setRemember] = useState(!!saved)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit({ url, token }, remember)
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
        <h1 className="text-xl font-semibold text-slate-100">GitLab Pipeline Dashboard</h1>

        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">GitLab URL</span>
          <input className={inputCls} type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://gitlab.company.local" />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Personal Access Token</span>
          <input className={inputCls} type="password" required autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="glpat-xxxxxxxxxxxxxxxx" />
        </label>

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Remember configuration on this browser
        </label>

        <p className="rounded-md border border-amber-900/60 bg-amber-950/40 p-2 text-xs text-amber-300">
          The token is used directly from your browser. Use a token with the minimum scope needed (<code>read_api</code>).
          {remember && ' Remembering stores the token in plain text in localStorage.'}
        </p>

        {error && <p className="whitespace-pre-line rounded-md border border-red-900 bg-red-950/50 p-2 text-sm text-red-300" role="alert">{error}</p>}

        <div className="flex gap-2">
          <button type="submit" disabled={busy} className="flex-1 rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50">
            {busy ? 'Connecting...' : 'Connect to GitLab'}
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel} className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">
              Cancel
            </button>
          )}
        </div>
        {onDisconnect && (
          <button type="button" onClick={onDisconnect} className="w-full rounded-md border border-red-900 px-4 py-2 text-sm text-red-300 hover:bg-red-950">
            Disconnect / Clear Token
          </button>
        )}
      </form>
    </div>
  )
}
