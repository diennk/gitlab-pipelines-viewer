# GitLab Pipeline Dashboard

Frontend-only (Vite + React + TypeScript + Tailwind) dashboard that lists pipelines from **all projects your token can access** on a GitLab Self-Managed instance. No backend, database, Docker or Admin rights needed.

## Run

```bash
cp .env.example .env     # set VITE_GITLAB_URL (recommended, see CORS)
npm install
npm run dev              # http://localhost:5173
```

Enter your GitLab URL and a Personal Access Token (scope `read_api` is enough) and press **Connect to GitLab**.

Other scripts: `npm run typecheck`, `npm run build`, `npm run preview`.

## What it does

1. `GET /api/v4/user` to validate the token.
2. `GET /api/v4/projects?membership=true&simple=true&archived=false&per_page=100`, following `X-Next-Page` until exhausted.
3. `GET /api/v4/projects/:id/pipelines` (latest 20 per project), max **10 requests in flight** (small promise pool in `src/api/gitlab.ts`).
4. A failing project (403/404/429/timeout/...) is listed under **View errors**; the others still render.
5. Auto refresh (default 30s) reloads pipelines only; **Rediscover Projects** re-fetches the project list.

## CORS

A browser app on `http://localhost:5173` calling `https://gitlab.company.local` is blocked unless GitLab sends CORS headers. Fix for development: set

```
VITE_GITLAB_URL=https://gitlab.company.local
```

and restart `npm run dev`. If the URL you type in the form equals `VITE_GITLAB_URL`, the app calls `/api/gitlab/...` and the Vite dev server forwards it to GitLab (self-signed certs accepted). Otherwise it calls GitLab directly.

Limits:
- The proxy exists **only in `npm run dev`** (and only for that one GitLab). `npm run build` output has no proxy; serving it elsewhere needs GitLab CORS or your own reverse proxy.
- The token is still sent by the browser (`PRIVATE-TOKEN` header); the proxy just relays it. It is never put in URLs or logged.

## Security

- The token is used directly from the browser. Use a minimal-scope token (`read_api`).
- "Remember configuration" stores URL **and token in plain text in `localStorage`**. Leave it off on shared machines.
- **Settings → Disconnect / Clear Token** wipes memory, `localStorage` and loaded data.
- The token is only sent to the GitLab URL you enter.

## Known simplifications

- Live mode fetches only the latest 20 pipelines per project. Use the range selector (History: 24h / 7 days / 30 days) to load everything created in that window via `created_after` with pagination (max 1000 per project). History mode makes many requests, so it turns Auto Refresh off; press Refresh to reload.
- Duration is approximate (the list API has no `started_at`): running = now - created; finished = updated - created.
- Summary counts (Active/Running/Pending/Failed) cover the loaded pipelines, not all history.
- Archived projects are skipped.
- With **Active Only** on, it applies when Status is "All"; choosing a specific Status overrides it.

## Structure

```
src/
  api/gitlab.ts          API client, pagination, concurrency pool, error mapping
  types/gitlab.ts        GitLabUser, GitLabProject, GitLabPipeline, PipelineStatus...
  hooks/useGitLab.ts     connection, loading, auto refresh, disconnect
  components/            ConnectionForm, Header, SummaryCards, PipelineFilters,
                         PipelineTable, LoadingProgress
  App.tsx  main.tsx  index.css
```
