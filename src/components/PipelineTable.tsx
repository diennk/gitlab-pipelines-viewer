import { Fragment, memo, useState } from 'react'
import { durationMs } from '../api/gitlab'
import { PipelineGraph, STATUS_STYLE } from './PipelineGraph'
import { pipelineKey, type EffectiveStatus, type GitLabUser, type PipelineDetail, type PipelineRow } from '../types/gitlab'

export type SortKey = 'project' | 'id' | 'status' | 'created' | 'updated' | 'duration'
export interface Sort {
  key: SortKey
  dir: 'asc' | 'desc'
}

function StatusBadge({ status, title }: { status: EffectiveStatus; title?: string }) {
  const [icon, cls] = STATUS_STYLE[status] ?? ['?', 'bg-slate-800 text-slate-300 border-slate-600']
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium uppercase ${cls}`}>
      <span aria-hidden>{icon}</span>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function fmtTime(iso: string) {
  const d = new Date(iso)
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtDuration(ms: number | null) {
  if (ms === null || ms < 0) return '-'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`
}

const COLS: [string, SortKey | null][] = [
  ['Project', 'project'],
  ['Pipeline', 'id'],
  ['Branch / Tag', null],
  ['Status', 'status'],
  ['Commit', null],
  ['User', null],
  ['Created', 'created'],
  ['Updated', 'updated'],
  ['Duration', 'duration'],
  ['Details', null],
]

interface Props {
  rows: PipelineRow[]
  jobs: Record<string, PipelineDetail>
  users: Record<string, GitLabUser>
  /** Called when a row is expanded, to (re)load its graph data. */
  onExpand: (p: PipelineRow) => void
  statuses: Record<string, EffectiveStatus>
  sort: Sort | null
  onSort: (key: SortKey) => void
}

const link = 'text-sky-400 hover:underline'

function PipelineTableBase({ rows, jobs, users, statuses, sort, onSort, onExpand }: Props) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (p: PipelineRow) => {
    const k = pipelineKey(p)
    const isOpen = open.has(k)
    setOpen((o) => {
      const n = new Set(o)
      if (isOpen) n.delete(k)
      else n.add(k)
      return n
    })
    if (!isOpen) onExpand(p) // fresh data on every expand
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            {COLS.map(([label, key]) => (
              <th key={label} className="px-3 py-2 font-medium" aria-sort={key && sort?.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                {key ? (
                  <button className="uppercase hover:text-slate-100" onClick={() => onSort(key)}>
                    {label} {sort?.key === key ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                  </button>
                ) : label === 'Details' ? (
                  <span className="sr-only">Details</span>
                ) : (
                  label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((p) => (
            <Fragment key={pipelineKey(p)}>
            <tr className="hover:bg-slate-900/60">
              <td className="px-3 py-2">
                <a className={link} href={p.project.web_url} target="_blank" rel="noopener noreferrer" title={p.project.path_with_namespace}>
                  {p.project.name}
                </a>
              </td>
              <td className="px-3 py-2">
                <a className={link} href={p.web_url} target="_blank" rel="noopener noreferrer">#{p.id}</a>
              </td>
              <td className="px-3 py-2 font-mono text-xs">{p.ref}</td>
              <td className="px-3 py-2"><StatusBadge status={statuses[pipelineKey(p)] ?? p.status} title={`Pipeline: ${p.status}`} /></td>
              <td className="px-3 py-2 font-mono text-xs text-slate-400">{p.sha.slice(0, 7)}</td>
              <td className="px-3 py-2 text-slate-300">
                {users[pipelineKey(p)] ? (
                  <a className={link} href={users[pipelineKey(p)].web_url} target="_blank" rel="noopener noreferrer" title={`@${users[pipelineKey(p)].username}`}>
                    {users[pipelineKey(p)].name}
                  </a>
                ) : '-'}
              </td>
              <td className="px-3 py-2 text-slate-400">{fmtTime(p.created_at)}</td>
              <td className="px-3 py-2 text-slate-400">{fmtTime(p.updated_at)}</td>
              <td className="px-3 py-2 text-slate-300">{fmtDuration(durationMs(p))}</td>
              <td className="px-3 py-1 text-right">
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                  onClick={() => toggle(p)}
                  aria-expanded={open.has(pipelineKey(p))}
                  aria-label={open.has(pipelineKey(p)) ? 'Collapse pipeline details' : 'Expand pipeline details'}
                  title={open.has(pipelineKey(p)) ? 'Collapse' : 'Show stages & jobs'}
                >
                  <svg viewBox="0 0 20 20" className={`h-4 w-4 transition-transform ${open.has(pipelineKey(p)) ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M5 8l5 5 5-5" />
                  </svg>
                </button>
              </td>
            </tr>
            
            {open.has(pipelineKey(p)) && (
              <tr className="bg-slate-900/30">
                <td colSpan={COLS.length} className="px-4 py-3">
                  <PipelineGraph detail={jobs[pipelineKey(p)]} projectId={p.project_id} />
                </td>
              </tr>
            )}
            </Fragment>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={COLS.length} className="px-3 py-8 text-center text-slate-500">No pipelines match the current filters.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export const PipelineTable = memo(PipelineTableBase)
