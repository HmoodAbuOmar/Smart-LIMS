import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Serve the browser's API calls from the frontend origin so it can receive and
// read the CSRF cookie alongside the HttpOnly session cookie.
const proxy = { '/api': { target: process.env.SMARTLIMS_API_TARGET || 'http://127.0.0.1:8080' } }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
  // The user-owned design reference lives in dist/images; never clear it on build.
  build: {
    emptyOutDir: false,
    rollupOptions: { input: { main: 'index.html', admin: 'admin/index.html' } },
  },
})
