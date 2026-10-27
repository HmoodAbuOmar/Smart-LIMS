import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The user-owned design reference lives in dist/images; never clear it on build.
  build: { emptyOutDir: false },
})
