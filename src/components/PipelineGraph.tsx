import { Fragment } from 'react'
import type { Downstream, EffectiveStatus, GitLabJob, PipelineDetail } from '../types/gitlab'

export const STATUS_STYLE: Record<EffectiveStatus, [string, string]> = {
  warning: ['!', 'bg-orange-950 text-orange-300 border-orange-800'],
  running: ['●', 'bg-blue-950 text-blue-300 border-blue-800'],
  pending: ['◷', 'bg-amber-950 text-amber-300 border-amber-800'],
  created: ['○', 'bg-slate-800 text-slate-300 border-slate-600'],
  preparing: ['◔', 'bg-slate-800 text-slate-300 border-slate-600'],
  waiting_for_resource: ['◷', 'bg-amber-950 text-amber-300 border-amber-800'],
  success: ['✓', 'bg-emerald-950 text-emerald-300 border-emerald-800'],
  failed: ['✕', 'bg-red-950 text-red-300 border-red-800'],
  canceled: ['⊘', 'bg-slate-800 text-slate-400 border-slate-600'],
  skipped: ['»', 'bg-slate-800 text-slate-400 border-slate-600'],
  manual: ['▶', 'bg-purple-950 text-purple-300 border-purple-800'],
  scheduled: ['⏱', 'bg-purple-950 text-purple-300 border-purple-800'],
}

const jobStatus = (j: GitLabJob): EffectiveStatus =>
  j.status === 'failed' && j.allow_failure ? 'warning' : ((j.status in STATUS_STYLE ? j.status : 'created') as EffectiveStatus)

/** Round status icon like GitLab's; the status is also in the tooltip / screen-reader text. */
function Icon({ status }: { status: EffectiveStatus }) {
  const [icon, cls] = STATUS_STYLE[status]
  return (
    <span title={status} className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${cls}`}>
      <span aria-hidden className={status === 'running' ? 'animate-pulse' : ''}>{icon}</span>
      <span className="sr-only">{status}</span>
    </span>
  )
}

function JobCard({ job }: { job: GitLabJob }) {
  return (
    <a
      href={job.web_url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col gap-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 hover:border-slate-500"
    >
      <span className="flex items-center gap-2">
        <Icon status={jobStatus(job)} />
        <span className="truncate text-slate-200" title={job.name}>{job.name}</span>
      </span>
      {job.trigger && <span className="w-fit rounded-full bg-sky-950 px-2 py-0.5 text-[10px] text-sky-300">Trigger job</span>}
    </a>
  )
}

/** Stage columns, ordered by lowest job id (jobs are created in stage order). */
function Stages({ jobs }: { jobs: GitLabJob[] }) {
  const stages = new Map<string, GitLabJob[]>()
  for (const j of [...jobs].sort((a, b) => a.id - b.id)) stages.set(j.stage, [...(stages.get(j.stage) ?? []), j])
  return (
    <div className="flex items-start">
      {[...stages].map(([name, js], i) => (
        <Fragment key={name}>
          {i > 0 && <div className="mt-6 h-px w-6 shrink-0 bg-slate-600" />}
          <div className="w-52 shrink-0 space-y-1.5 rounded-lg border border-slate-700 bg-slate-900 p-2">
            <div className="px-1 text-xs font-semibold text-slate-200">{name}</div>
            {js.map((j) => (
              <JobCard key={j.id} job={j} />
            ))}
          </div>
        </Fragment>
      ))}
    </div>
  )
}

function DownstreamRow({ d, sameProject }: { d: Downstream; sameProject: boolean }) {
  return (
    <div className="flex items-start">
      <div className="flex w-52 shrink-0 flex-col gap-1 rounded-md border border-slate-700 bg-slate-900 p-2">
        <span className="flex items-center gap-2">
          <Icon status={d.status} />
          <span className="truncate text-slate-200" title={d.projectName}>{d.projectName}</span>
        </span>
        <a className="text-sky-400 hover:underline" href={d.web_url} target="_blank" rel="noopener noreferrer">#{d.id}</a>
        <span className="w-fit rounded-full bg-sky-950 px-2 py-0.5 text-[10px] text-sky-300">{sameProject ? 'Child' : 'Multi-project'}</span>
        {d.error && <span className="text-red-400">Jobs unavailable: {d.error}</span>}
      </div>
      {d.jobs.length > 0 && (
        <>
          <div className="mt-6 h-px w-6 shrink-0 bg-slate-600" />
          <div className="rounded-lg bg-slate-800/60 p-2">
            <Stages jobs={d.jobs} />
          </div>
        </>
      )}
    </div>
  )
}

/** GitLab-style pipeline graph: stage columns with job cards, then downstream pipelines. */
export function PipelineGraph({ detail, projectId }: { detail?: PipelineDetail; projectId: number }) {
  if (!detail) return <div className="text-xs text-slate-500">Loading details...</div>
  const own = [...detail.jobs, ...detail.bridges]
  return (
    <div className="space-y-2 text-xs">
      {detail.error && <div className="text-red-400">Details unavailable: {detail.error}</div>}
      {own.length === 0 && detail.downstream.length === 0 && !detail.error && <div className="text-slate-500">No jobs.</div>}
      <div className="flex items-start gap-8 overflow-x-auto pb-2">
        {own.length > 0 && <Stages jobs={own} />}
        {detail.downstream.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-semibold text-slate-300">Downstream</div>
            {detail.downstream.map((d) => (
              <DownstreamRow key={d.id} d={d} sameProject={d.project_id === projectId} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
