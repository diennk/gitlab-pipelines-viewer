import { useCallback, useEffect, useRef, useState } from 'react'
import { GitLabError, getAllPipelines, getAllProjects, getPipelineDetails, getCurrentUser, normalizeUrl } from '../api/gitlab'
import type { GitLabConfig, PipelineDetail, GitLabProject, GitLabUser, PipelineRow, ProjectError } from '../types/gitlab'

const STORAGE_KEY = 'gitlab-pipeline-dashboard:config'

export function loadSavedConfig(): GitLabConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as GitLabConfig) : null
  } catch {
    return null
  }
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function useGitLab() {
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [config, setConfig] = useState<GitLabConfig | null>(null)
  const [user, setUser] = useState<GitLabUser | null>(null)
  const [projects, setProjects] = useState<GitLabProject[]>([])
  const [pipelines, setPipelines] = useState<PipelineRow[]>([])
  const [projectErrors, setProjectErrors] = useState<ProjectError[]>([])
  const [jobs, setJobs] = useState<Record<string, PipelineDetail>>({})
  const [loading, setLoading] = useState<'projects' | 'pipelines' | 'jobs' | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [autoMs, setAutoMs] = useState(30_000)
  const [sinceHours, setSinceHours] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const configRef = useRef<GitLabConfig | null>(null)
  const projectsRef = useRef<GitLabProject[]>([])
  const sinceRef = useRef(0)

  /** Load pipelines (and projects when `discover`). Old data stays visible until new data arrives. */
  const run = useCallback(async (discover: boolean) => {
    const cfg = configRef.current
    if (!cfg) return
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setError(null)
    try {
      if (discover || !projectsRef.current.length) {
        setLoading('projects')
        projectsRef.current = await getAllProjects(cfg, ac.signal)
        setProjects(projectsRef.current)
      }
      setLoading('pipelines')
      setProgress({ done: 0, total: projectsRef.current.length })
      const r = await getAllPipelines(cfg, projectsRef.current, {
        signal: ac.signal,
        sinceHours: sinceRef.current,
        onProgress: (done, total) => setProgress({ done, total }),
      })
      if (ac.signal.aborted) return
      setPipelines(r.pipelines)
      setProjectErrors(r.errors)
      // Jobs/downstream only for running or recently updated pipelines; the table is already visible.
      setLoading('jobs')
      setProgress(null)
      const j = await getPipelineDetails(cfg, r.pipelines, projectsRef.current, {
        signal: ac.signal,
        onProgress: (done, total) => setProgress({ done, total }),
      })
      if (ac.signal.aborted) return
      setJobs(j)
    } catch (e) {
      if (ac.signal.aborted) return
      setError(msg(e))
    }
    if (ac.signal.aborted) return
    setLastUpdated(new Date())
    setLoading(null)
    setProgress(null)
  }, [])

  const disconnect = useCallback(() => {
    abortRef.current?.abort()
    configRef.current = null
    projectsRef.current = []
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
    setConnected(false)
    setConnecting(false)
    setConfig(null)
    setUser(null)
    setProjects([])
    setPipelines([])
    setProjectErrors([])
    setJobs({})
    setLoading(null)
    setProgress(null)
    setError(null)
    setLastUpdated(null)
  }, [])

  const connect = useCallback(
    async (input: GitLabConfig, remember: boolean) => {
      const cfg = { url: normalizeUrl(input.url), token: input.token.trim() }
      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac
      setConnecting(true)
      setError(null)
      try {
        const u = await getCurrentUser(cfg, ac.signal)
        try {
          if (remember) localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
          else localStorage.removeItem(STORAGE_KEY)
        } catch {
          /* ignore */
        }
        configRef.current = cfg
        projectsRef.current = []
        setConfig(cfg)
        setUser(u)
        setPipelines([])
        setProjects([])
        setProjectErrors([])
        setLastUpdated(null)
        setConnected(true)
        setConnecting(false)
        void run(true)
      } catch (e) {
        if (ac.signal.aborted) return
        setConnecting(false)
        setError(
          e instanceof GitLabError && e.kind === 'auth'
            ? 'Authentication failed.\nPlease check your GitLab URL and Personal Access Token.'
            : msg(e),
        )
      }
    },
    [run],
  )

  // Auto-connect when a saved config exists.
  useEffect(() => {
    const saved = loadSavedConfig()
    if (saved) void connect(saved, true)
    return () => abortRef.current?.abort()
  }, [connect])

  // Auto refresh (pipelines only); countdown ticks every second.
  useEffect(() => {
    if (!autoMs || !connected || !lastUpdated || loading) {
      setSecondsLeft(null)
      return
    }
    const tick = () => {
      const left = Math.ceil((lastUpdated.getTime() + autoMs - Date.now()) / 1000)
      if (left <= 0) void run(false)
      else setSecondsLeft(left)
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [autoMs, connected, lastUpdated, loading, run])

  /** Switch between live (0) and a history window; history is heavy, so auto refresh is turned off. */
  const setRange = useCallback(
    (hours: number) => {
      sinceRef.current = hours
      setSinceHours(hours)
      if (hours) setAutoMs(0)
      void run(false)
    },
    [run],
  )

  /** Load (or reload) the detail graph of one pipeline, e.g. when its detail view is opened. */
  const loadDetail = useCallback(async (p: PipelineRow) => {
    const cfg = configRef.current
    if (!cfg) return
    const r = await getPipelineDetails(cfg, [p], projectsRef.current, { force: true })
    setJobs((old) => ({ ...old, ...r }))
  }, [])

  return {
    loadDetail,
    sinceHours, setRange,
    connected, connecting, config, user, projects, pipelines, projectErrors, jobs,
    loading, progress, error, lastUpdated, autoMs, setAutoMs, secondsLeft,
    connect, disconnect,
    refresh: () => run(false),
    rediscover: () => run(true),
  }
}
