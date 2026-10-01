export interface GitLabUser {
  id: number
  username: string
  name: string
  web_url: string
}

export interface GitLabProject {
  id: number
  name: string
  path_with_namespace: string
  web_url: string
}

export type PipelineStatus =
  | 'running'
  | 'pending'
  | 'created'
  | 'preparing'
  | 'waiting_for_resource'
  | 'success'
  | 'failed'
  | 'canceled'
  | 'skipped'
  | 'manual'
  | 'scheduled'

export const ACTIVE_STATUSES: readonly PipelineStatus[] = [
  'running',
  'pending',
  'created',
  'preparing',
  'waiting_for_resource',
]

export interface GitLabPipeline {
  id: number
  iid: number
  project_id: number
  status: PipelineStatus
  ref: string
  sha: string
  web_url: string
  created_at: string
  updated_at: string
}

export interface GitLabJob {
  id: number
  name: string
  stage: string
  status: string
  web_url: string
  started_at: string | null
  allow_failure?: boolean
  /** Bridge job that triggers a downstream pipeline. */
  trigger?: boolean
}

/** Display status: GitLab's "warning" = finished OK but an allow_failure job failed. */
export type EffectiveStatus = PipelineStatus | 'warning'

/** A pipeline triggered by a bridge job (child or multi-project downstream). */
export interface Downstream {
  name: string
  id: number
  project_id: number
  projectName: string
  status: PipelineStatus
  web_url: string
  jobs: GitLabJob[]
  error?: string
}

/** Extra detail for a pipeline: its own jobs and its downstream pipelines. */
export interface PipelineDetail {
  jobs: GitLabJob[]
  bridges: GitLabJob[]
  downstream: Downstream[]
  error?: string
}

/** Key for per-pipeline lookups (pipeline ids are unique per instance, but keep project for clarity). */
export const pipelineKey = (p: { project_id: number; id: number }) => `${p.project_id}-${p.id}`

/** Pipeline joined with its project, as shown in the table. */
export interface PipelineRow extends GitLabPipeline {
  project: GitLabProject
}

export interface GitLabConfig {
  url: string
  token: string
}

export interface ProjectError {
  project: GitLabProject
  message: string
}

export type GitLabErrorKind =
  | 'auth'
  | 'forbidden'
  | 'notfound'
  | 'ratelimit'
  | 'network'
  | 'timeout'
  | 'http'
  | 'aborted'
