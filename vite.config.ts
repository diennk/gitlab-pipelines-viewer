import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Dev-only proxy: the browser calls /api/gitlab/*, Vite forwards to VITE_GITLAB_URL.
// It only relays requests (no token storage); the token is still sent by the browser.
export default defineConfig(({ mode }) => {
  const target = loadEnv(mode, process.cwd(), '').VITE_GITLAB_URL?.replace(/\/+$/, '')
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: target
        ? {
            '/api/gitlab': {
              target,
              changeOrigin: true,
              secure: false, // allow self-signed certs on self-managed GitLab
              rewrite: (p) => p.replace(/^\/api\/gitlab/, ''),
            },
          }
        : undefined,
    },
  }
})
