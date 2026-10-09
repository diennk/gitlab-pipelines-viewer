import { useCallback, useMemo, useState } from 'react'
import { durationMs, effectiveStatus, isActive } from './api/gitlab'
import { pipelineKey, type EffectiveStatus } from './types/gitlab'
import { ConnectionForm } from './components/ConnectionForm'
import { Header } from './components/Header'
import { LoadingProgress } from './components/LoadingProgress'
import { PipelineFilters, type Filters } from './components/PipelineFilters'
import { PipelineTable, type Sort, type SortKey } from './components/PipelineTable'
import { SummaryCards } from './components/SummaryCards'
import { useGitLab } from './hooks/useGitLab'
import type { PipelineRow } from './types/gitlab'

const STATUS_RANK: Record<string, number> = {
  running: 0, pending: 1, waiting_for_resource: 2, preparing: 3, created: 4,
  failed: 5, warning: 5, manual: 6, scheduled: 7, success: 8, canceled: 9, skipped: 10,
}

const sortValue = (p: PipelineRow, key: SortKey, st: EffectiveStatus): string | number => {
  switch (key) {
    case 'project': return p.project.path_with_namespace.toLowerCase()
    case 'id': return p.id
    case 'status': return STATUS_RANK[st] ?? 99
    case 'created': return Date.parse(p.created_at)
    case 'updated': return Date.parse(p.updated_at)
    case 'duration': return durationMs(p) ?? -1
  }
}

const cmp = (a: string | number, b: string | number) => (a < b ? -1 : a > b ? 1 : 0)

export default function App() {
  const gl = useGitLab()
  const [showSettings, setShowSettings] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const [sort, setSort] = useState<Sort | null>(null) // null = active first, newest first
  const [filters, setFilters] = useState<Filters>({ search: '', status: 'all', project: '', branch: '', activeOnly: true })

  const { pipelines, jobs: details } = gl

  // Overall status per pipeline, from its stages and downstream pipelines.
  const statuses = useMemo(
    () => Object.fromEntries(pipelines.map((p) => [pipelineKey(p), effectiveStatus(p, details[pipelineKey(p)])])),
    [pipelines, details],
  )

  const branches = useMemo(() => [...new Set(pipelines.map((p) => p.ref))].sort(), [pipelines])

  const rows = useMemo(() => {
    const q = filters.search.trim().toLowerCase()
    const out = pipelines.filter((p) => {
      const st = statuses[pipelineKey(p)]
      const live = isActive({ status: st })
      const want = filters.status
      if (want === 'active' ? !live : want === 'success' ? st !== 'success' && st !== 'warning' : want !== 'all' ? st !== want : filters.activeOnly && !live) return false
      if (filters.project && String(p.project_id) !== filters.project) return false
      if (filters.branch && p.ref !== filters.branch) return false
      if (!q) return true
      return (
        p.project.name.toLowerCase().includes(q) ||
        p.project.path_with_namespace.toLowerCase().includes(q) ||
        String(p.id).includes(q.replace(/^#/, '')) ||
        p.ref.toLowerCase().includes(q) ||
        p.sha.toLowerCase().startsWith(q)
      )
    })
    if (!sort) {
      return out.sort((a, b) => Number(isActive({ status: statuses[pipelineKey(b)] })) - Number(isActive({ status: statuses[pipelineKey(a)] })) || Date.parse(b.created_at) - Date.parse(a.created_at))
    }
    const d = sort.dir === 'asc' ? 1 : -1
    return out.sort((a, b) => d * cmp(sortValue(a, sort.key, statuses[pipelineKey(a)]), sortValue(b, sort.key, statuses[pipelineKey(b)])))
  }, [pipelines, statuses, filters, sort])

  // click cycle: asc -> desc -> default
  const onSort = useCallback((key: SortKey) => {
    setSort((s) => (s?.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null))
  }, [])

  if (!gl.connected || showSettings) {
    return (
      <ConnectionForm
        busy={gl.connecting}
        error={gl.connected ? null : gl.error}
        current={gl.config}
        onSubmit={(cfg, remember) => {
          setShowSettings(false)
          void gl.connect(cfg, remember)
        }}
        onCancel={gl.connected ? () => setShowSettings(false) : undefined}
        onDisconnect={
          gl.connected
            ? () => {
                gl.disconnect()
                setShowSettings(false)
              }
            : undefined
        }
      />
    )
  }

  const loaded = gl.progress ? gl.progress.done : gl.projects.length
  const failed = gl.projectErrors.length

  return (
    <main className="mx-auto max-w-7xl space-y-4 p-6">
      <Header
        user={gl.user!}
        config={gl.config!}
        projectCount={gl.projects.length}
        lastUpdated={gl.lastUpdated}
        loading={gl.loading !== null}
        progress={
          gl.loading === 'projects' ? (
            <LoadingProgress label="Discovering projects..." />
          ) : gl.loading === 'pipelines' && gl.progress ? (
            <LoadingProgress label="Loading pipelines..." done={gl.progress.done} total={gl.progress.total} />
          ) : gl.loading === 'jobs' ? (
            <LoadingProgress label="Loading jobs..." />
          ) : (
            <LoadingProgress />
          )
        }
        autoMs={gl.autoMs}
        sinceHours={gl.sinceHours}
        onRangeChange={(h) => {
          gl.setRange(h)
          if (h) setFilters((f) => ({ ...f, activeOnly: false }))
        }}
        secondsLeft={gl.secondsLeft}
        onAutoChange={gl.setAutoMs}
        onRefresh={gl.refresh}
        onRediscover={gl.rediscover}
        onSettings={() => setShowSettings(true)}
      />

      <SummaryCards projectCount={gl.projects.length} statuses={Object.values(statuses)} />

      {gl.error && (
        <div className="rounded-lg border border-red-900 bg-red-950/50 p-3 text-sm text-red-300" role="alert">
          {gl.error}
        </div>
      )}

      {failed > 0 && !gl.loading && (
        <div className="rounded-lg border border-amber-900/60 bg-amber-950/30 p-3 text-sm text-amber-300">
          {gl.projects.length - failed} / {gl.projects.length} projects loaded · {failed} project{failed > 1 ? 's' : ''} failed{' '}
          <button className="underline" onClick={() => setShowErrors((v) => !v)}>
            [ {showErrors ? 'Hide' : 'View'} errors ]
          </button>
          {showErrors && (
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs">
              {gl.projectErrors.map((e) => (
                <li key={e.project.id}>
                  <span className="font-medium">{e.project.path_with_namespace}</span>: {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <PipelineFilters filters={filters} projects={gl.projects} branches={branches} onChange={setFilters} />
      <PipelineTable rows={rows} jobs={details} users={gl.users} statuses={statuses} onExpand={gl.loadDetail} sort={sort} onSort={onSort} />

      <footer className="pb-6 text-center text-xs text-slate-500">
        {loaded} / {gl.projects.length} projects · showing {rows.length} of {pipelines.length} pipelines
        {gl.lastUpdated && ` · Last updated ${gl.lastUpdated.toLocaleTimeString()}`}
      </footer>
    </main>
  )
}
