import {
  ACTIVE_STATUSES,
  type GitLabConfig,
  type GitLabErrorKind,
  type Downstream,
  type EffectiveStatus,
  type GitLabJob,
  type PipelineDetail,
  type PipelineStatus,
  type GitLabPipeline,
  type GitLabProject,
  type GitLabUser,
  type PipelineRow,
  pipelineKey,
  type ProjectError,
} from '../types/gitlab'

export const CONCURRENCY = 10
const TIMEOUT_MS = 30_000
const PIPELINES_PER_PROJECT = 20

export class GitLabError extends Error {
  kind: GitLabErrorKind
  retryAfter?: number
  constructor(kind: GitLabErrorKind, message: string) {
    super(message)
    this.kind = kind
  }
}

export const normalizeUrl = (u: string) => u.trim().replace(/\/+$/, '')

const ENV_URL = import.meta.env.VITE_GITLAB_URL as string | undefined

/** True when requests go through the Vite dev proxy (/api/gitlab) instead of straight to GitLab. */
export const usesProxy = (url: string) =>
  import.meta.env.DEV && !!ENV_URL && normalizeUrl(ENV_URL) === normalizeUrl(url)

const apiBase = (cfg: GitLabConfig) =>
  (usesProxy(cfg.url) ? '/api/gitlab' : normalizeUrl(cfg.url)) + '/api/v4'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function attempt<T>(
  cfg: GitLabConfig,
  path: string,
  signal?: AbortSignal,
): Promise<{ data: T; headers: Headers }> {
  const ctl = new AbortController()
  let timedOut = false
  const onAbort = () => ctl.abort()
  if (signal?.aborted) ctl.abort()
  signal?.addEventListener('abort', onAbort)
  const timer = setTimeout(() => {
    timedOut = true
    ctl.abort()
  }, TIMEOUT_MS)

  try {
    const res = await fetch(apiBase(cfg) + path, {
      headers: { 'PRIVATE-TOKEN': cfg.token },
      signal: ctl.signal,
    })
    if (!res.ok) {
      const s = res.status
      if (s === 401) throw new GitLabError('auth', 'Authentication failed (401). Check your GitLab URL and Personal Access Token.')
      if (s === 403) throw new GitLabError('forbidden', 'Forbidden (403): no permission for this resource.')
      if (s === 404) throw new GitLabError('notfound', 'Not found (404): resource does not exist or is not visible.')
      if (s === 429) {
        const e = new GitLabError('ratelimit', 'Rate limited by GitLab (429). Try again later or use a longer refresh interval.')
        e.retryAfter = Number(res.headers.get('Retry-After')) || 2
        throw e
      }
      throw new GitLabError('http', `GitLab returned HTTP ${s}.`)
    }
    return { data: (await res.json()) as T, headers: res.headers }
  } catch (e) {
    if (e instanceof GitLabError) throw e
    if (signal?.aborted) throw new GitLabError('aborted', 'Request cancelled.')
    if (timedOut) throw new GitLabError('timeout', `Request timed out after ${TIMEOUT_MS / 1000}s.`)
    throw new GitLabError(
      'network',
      'Network or CORS error: cannot reach GitLab. If GitLab blocks CORS, set VITE_GITLAB_URL and restart the dev server (see README).',
    )
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

async function request<T>(cfg: GitLabConfig, path: string, signal?: AbortSignal) {
  try {
    return await attempt<T>(cfg, path, signal)
  } catch (e) {
    if (e instanceof GitLabError && e.kind === 'ratelimit') {
      // one retry, honouring Retry-After (capped at 10s)
      await sleep(Math.min(e.retryAfter ?? 2, 10) * 1000)
      return attempt<T>(cfg, path, signal)
    }
    throw e
  }
}

export async function getCurrentUser(cfg: GitLabConfig, signal?: AbortSignal): Promise<GitLabUser> {
  return (await request<GitLabUser>(cfg, '/user', signal)).data
}

/** All projects the token is a member of, following X-Next-Page until exhausted. */
export async function getAllProjects(cfg: GitLabConfig, signal?: AbortSignal): Promise<GitLabProject[]> {
  const all: GitLabProject[] = []
  let page = '1'
  while (page) {
    const { data, headers } = await request<GitLabProject[]>(
      cfg,
      `/projects?membership=true&simple=true&archived=false&per_page=100&page=${page}`,
      signal,
    )
    all.push(...data)
    page = headers.get('X-Next-Page') ?? ''
  }
  return all
}

const MAX_HISTORY_PAGES = 10 // ponytail: caps history at 1000 pipelines per project

/** Latest pipelines of a project; with `sinceHours`, all pipelines created in that window (paginated). */
export async function getProjectPipelines(
  cfg: GitLabConfig,
  projectId: number,
  signal?: AbortSignal,
  sinceHours = 0,
): Promise<GitLabPipeline[]> {
  const base = `/projects/${projectId}/pipelines?order_by=id&sort=desc`
  if (!sinceHours) {
    return (await request<GitLabPipeline[]>(cfg, `${base}&per_page=${PIPELINES_PER_PROJECT}`, signal)).data
  }
  const after = encodeURIComponent(new Date(Date.now() - sinceHours * 3_600_000).toISOString())
  const all: GitLabPipeline[] = []
  let page = '1'
  for (let i = 0; page && i < MAX_HISTORY_PAGES; i++) {
    const { data, headers } = await request<GitLabPipeline[]>(
      cfg,
      `${base}&created_after=${after}&per_page=100&page=${page}`,
      signal,
    )
    all.push(...data)
    page = headers.get('X-Next-Page') ?? ''
  }
  return all
}

/** Run worker over items with at most `limit` in flight. Worker must not throw. */
async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await worker(items[next++])
    }),
  )
}

export interface LoadOptions {
  signal?: AbortSignal
  onProgress?: (done: number, total: number) => void
  /** 0 = latest 20 per project; otherwise history window in hours. */
  sinceHours?: number
  /** getPipelineDetails: load every given pipeline, not only running/recent ones. */
  force?: boolean
}

/** Pipelines of every project (concurrency-limited). A failing project is reported, not thrown. */
export async function getAllPipelines(
  cfg: GitLabConfig,
  projects: GitLabProject[],
  { signal, onProgress, sinceHours }: LoadOptions = {},
): Promise<{ pipelines: PipelineRow[]; errors: ProjectError[] }> {
  const pipelines: PipelineRow[] = []
  const errors: ProjectError[] = []
  let done = 0
  await runPool(projects, CONCURRENCY, async (project) => {
    if (signal?.aborted) return
    try {
      for (const p of await getProjectPipelines(cfg, project.id, signal, sinceHours)) pipelines.push({ ...p, project })
    } catch (e) {
      if (!signal?.aborted) errors.push({ project, message: e instanceof Error ? e.message : String(e) })
    }
    onProgress?.(++done, projects.length)
  })
  return { pipelines, errors }
}

/**
 * Who triggered each pipeline (the list endpoint has no `user`, so one GET per pipeline).
 * Pipelines already in `known` are skipped; a failed lookup is just left out.
 */
export async function getPipelineUsers(
  cfg: GitLabConfig,
  pipelines: GitLabPipeline[],
  known: Record<string, GitLabUser>,
  signal?: AbortSignal,
): Promise<Record<string, GitLabUser>> {
  const out: Record<string, GitLabUser> = {}
  const todo = pipelines.filter((p) => !known[pipelineKey(p)])
  await runPool(todo, CONCURRENCY, async (p) => {
    if (signal?.aborted) return
    try {
      const { data } = await request<{ user: GitLabUser | null }>(cfg, `/projects/${p.project_id}/pipelines/${p.id}`, signal)
      if (data.user) out[pipelineKey(p)] = data.user
    } catch {
      /* column shows "-" */
    }
  })
  return out
}

/** Jobs of a pipeline (first 100). */
export async function getPipelineJobs(
  cfg: GitLabConfig,
  projectId: number,
  pipelineId: number,
  signal?: AbortSignal,
): Promise<GitLabJob[]> {
  return (await request<GitLabJob[]>(cfg, `/projects/${projectId}/pipelines/${pipelineId}/jobs?per_page=100`, signal)).data
}

interface Bridge {
  id: number
  name: string
  stage: string
  status: string
  web_url: string
  allow_failure?: boolean
  downstream_pipeline: { id: number; project_id: number; status: PipelineStatus; web_url: string } | null
}

const RECENT_MS = 60 * 60_000
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * Jobs + downstream for pipelines worth a closer look: running ones plus anything updated in the
 * last hour (downstream pipelines can still run after the parent finished).
 * One level of downstream. `force` skips the running/recent filter (used when opening a pipeline).
 */
export async function getPipelineDetails(
  cfg: GitLabConfig,
  rows: PipelineRow[],
  projects: GitLabProject[],
  { signal, onProgress, force }: LoadOptions = {},
): Promise<Record<string, PipelineDetail>> {
  const names = new Map(projects.map((p) => [p.id, p.name]))
  const targets = rows.filter((p) => force || p.status === 'running' || Date.now() - Date.parse(p.updated_at) < RECENT_MS)
  const out: Record<string, PipelineDetail> = {}
  let done = 0
  await runPool(targets, CONCURRENCY, async (p) => {
    if (signal?.aborted) return
    const detail: PipelineDetail = { jobs: [], bridges: [], downstream: [] }
    try {
      detail.jobs = await getPipelineJobs(cfg, p.project_id, p.id, signal)
      const bridges = (await request<Bridge[]>(cfg, `/projects/${p.project_id}/pipelines/${p.id}/bridges?per_page=100`, signal)).data
      for (const b of bridges) {
        detail.bridges.push({ id: b.id, name: b.name, stage: b.stage, status: b.status, web_url: b.web_url, started_at: null, allow_failure: b.allow_failure, trigger: true })
        const d = b.downstream_pipeline
        if (!d) continue
        const ds: Downstream = {
          name: b.name, id: d.id, project_id: d.project_id, status: d.status, web_url: d.web_url,
          projectName: names.get(d.project_id) ?? `project #${d.project_id}`, jobs: [],
        }
        try {
          ds.jobs = await getPipelineJobs(cfg, d.project_id, d.id, signal)
        } catch (e) {
          ds.error = errMsg(e)
        }
        detail.downstream.push(ds)
      }
    } catch (e) {
      if (signal?.aborted) return
      detail.error = errMsg(e)
    }
    out[pipelineKey(p)] = detail
    onProgress?.(++done, targets.length)
  })
  return out
}

export async function getActivePipelines(cfg: GitLabConfig, projects: GitLabProject[], opts: LoadOptions = {}) {
  const r = await getAllPipelines(cfg, projects, opts)
  return { ...r, pipelines: r.pipelines.filter(isActive) }
}

/**
 * Overall status derived from the pipeline, its stages' jobs and its downstream pipelines:
 * anything running/pending wins, then failed, then warning, else the pipeline's own status.
 */
export function effectiveStatus(p: GitLabPipeline, d?: PipelineDetail): EffectiveStatus {
  const all: string[] = [p.status, ...(d?.downstream.map((x) => x.status) ?? [])]
  for (const s of ['running', 'preparing', 'waiting_for_resource', 'pending', 'created'] as const) {
    if (all.includes(s)) return s
  }
  if (all.includes('failed')) return 'failed'
  const jobs = [...(d?.jobs ?? []), ...(d?.downstream.flatMap((x) => x.jobs) ?? [])]
  if (p.status === 'success' && jobs.some((j) => j.status === 'failed' && j.allow_failure)) return 'warning'
  return p.status
}

export const isActive = (p: { status: string }) => (ACTIVE_STATUSES as readonly string[]).includes(p.status)

/**
 * The list endpoint has no started_at/duration, so this is approximate:
 * running: now - created_at (includes queue time); finished: updated_at - created_at.
 */
export function durationMs(p: GitLabPipeline): number | null {
  const start = Date.parse(p.created_at)
  if (p.status === 'running') return Date.now() - start
  if (['success', 'failed', 'canceled', 'skipped'].includes(p.status)) return Date.parse(p.updated_at) - start
  return null
}
