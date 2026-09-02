import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Express serves ../public statically (see ../server.js), so that is where we build.
// base '/' because the app is always mounted at the site root, http://localhost:8123
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    // `npm run dev` here + `npm start` in the project root gives hot reload against the real API
    proxy: {
      '/api': { target: 'http://localhost:8123', changeOrigin: true },
    },
  },
})
