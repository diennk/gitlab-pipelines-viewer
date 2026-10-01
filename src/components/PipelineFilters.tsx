import type { GitLabProject } from '../types/gitlab'

export interface Filters {
  search: string
  status: string
  project: string
  branch: string
  activeOnly: boolean
}

export const STATUS_OPTIONS: [string, string][] = [
  ['all', 'All'],
  ['active', 'Active'],
  ['running', 'Running'],
  ['pending', 'Pending'],
  ['failed', 'Failed'],
  ['success', 'Success'],
  ['canceled', 'Canceled'],
]

interface Props {
  filters: Filters
  projects: GitLabProject[]
  branches: string[]
  onChange: (f: Filters) => void
}

const ctl = 'rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100'

export function PipelineFilters({ filters, projects, branches, onChange }: Props) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch })
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-800 bg-slate-900 p-3">
      <input
        className={`${ctl} min-w-64 flex-1`}
        placeholder="🔎 Search project, pipeline #, branch/tag, commit..."
        value={filters.search}
        onChange={(e) => set({ search: e.target.value })}
      />
      <select className={ctl} value={filters.status} onChange={(e) => set({ status: e.target.value })} aria-label="Status">
        {STATUS_OPTIONS.map(([v, l]) => (
          <option key={v} value={v}>{v === 'all' ? 'Status: All' : l}</option>
        ))}
      </select>
      <select className={`${ctl} max-w-48`} value={filters.project} onChange={(e) => set({ project: e.target.value })} aria-label="Project">
        <option value="">Project: All</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.path_with_namespace}</option>
        ))}
      </select>
      <select className={`${ctl} max-w-40`} value={filters.branch} onChange={(e) => set({ branch: e.target.value })} aria-label="Branch">
        <option value="">Branch: All</option>
        {branches.map((b) => (
          <option key={b} value={b}>{b}</option>
        ))}
      </select>
      <label
        className="flex items-center gap-2 text-sm text-slate-300"
        title="Applies when Status is All. Pick a specific status to see it regardless."
      >
        <input type="checkbox" checked={filters.activeOnly} onChange={(e) => set({ activeOnly: e.target.checked })} />
        Active Only
      </label>
    </div>
  )
}
