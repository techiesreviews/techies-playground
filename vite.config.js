import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    // playground-host/dist holds about 18,000 Playground files when prepared locally.
    watch: { ignored: ['**/playground-host/dist/**'] },
  },
})
