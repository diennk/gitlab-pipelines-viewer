import type { ReactNode } from 'react'
import type { GitLabConfig, GitLabUser } from '../types/gitlab'

interface Props {
  user: GitLabUser
  config: GitLabConfig
  projectCount: number
  lastUpdated: Date | null
  loading: boolean
  progress: ReactNode
  autoMs: number
  sinceHours: number
  onRangeChange: (h: number) => void
  secondsLeft: number | null
  onAutoChange: (ms: number) => void
  onRefresh: () => void
  onRediscover: () => void
  onSettings: () => void
}

const INTERVALS: [string, number][] = [
  ['Off', 0],
  ['10s', 10_000],
  ['30s', 30_000],
  ['60s', 60_000],
  ['5m', 300_000],
]

const RANGES: [string, number][] = [
  ['Live (latest 20/project)', 0],
  ['History: 24h', 24],
  ['History: 7 days', 168],
  ['History: 30 days', 720],
]

const btn = 'rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50'

export function Header(p: Props) {
  let host = p.config.url
  try {
    host = new URL(p.config.url).host
  } catch {
    /* keep raw */
  }
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">GitLab Pipeline Dashboard</h1>
        <p className="text-sm text-emerald-400">
          ● Connected: {p.user.username} <span className="text-slate-400">({p.user.name})</span>
        </p>
        <p className="text-xs text-slate-400">
          GitLab: {host} · Projects: {p.projectCount} · Last Updated: {p.lastUpdated ? p.lastUpdated.toLocaleTimeString() : '-'}
        </p>
        {p.progress}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm" aria-label="Range" value={p.sinceHours} onChange={(e) => p.onRangeChange(Number(e.target.value))}>
          {RANGES.map(([l, v]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          Auto Refresh
          <select className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5" value={p.autoMs} onChange={(e) => p.onAutoChange(Number(e.target.value))}>
            {INTERVALS.map(([l, v]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
        {p.autoMs > 0 && p.secondsLeft !== null && <span className="text-xs text-slate-400">Next refresh: {p.secondsLeft}s</span>}
        <button className={btn} onClick={p.onRefresh} disabled={p.loading}>Refresh ↻</button>
        <button className={btn} onClick={p.onRediscover} disabled={p.loading}>Rediscover Projects</button>
        <button className={btn} onClick={p.onSettings}>⚙ Settings</button>
      </div>
    </header>
  )
}
