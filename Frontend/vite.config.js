import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { apiTarget } from './apiTarget.js'

// Serve the browser's API calls from the frontend origin so it can receive and
// read the CSRF cookie alongside the HttpOnly session cookie.
const target = apiTarget(process.env.SMARTLIMS_API_TARGET ?? 'http://127.0.0.1:8090')
const proxy = target ? { '^/api(?:/|\\?|$)': { target, changeOrigin: true } } : undefined

function rejectUnconfiguredApi({ middlewares }) {
  if (target) return
  middlewares.use('/api', (_request, response) => {
    response.statusCode = 503
    response.setHeader('Content-Type', 'application/json')
    response.setHeader('Cache-Control', 'no-store')
    response.end(JSON.stringify({ code: 'SERVICE_UNAVAILABLE' }))
  })
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), {
    name: 'smartlims-api-target',
    configureServer: rejectUnconfiguredApi,
    configurePreviewServer: rejectUnconfiguredApi,
  }],
  server: { proxy },
  preview: { proxy },
  // The user-owned design reference lives in dist/images; never clear it on build.
  build: {
    emptyOutDir: false,
    rollupOptions: { input: { main: 'index.html', admin: 'admin/index.html' } },
  },
})
