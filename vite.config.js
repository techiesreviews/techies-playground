import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { wpCliFromHostPlugin } from './scripts/prepare-playground-host.mjs'
import { playgroundOrigin } from './src/lib/playground-host.js'

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    wpCliFromHostPlugin(playgroundOrigin(loadEnv(mode, process.cwd(), 'VITE_').VITE_PLAYGROUND_ORIGIN)),
  ],
  server: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    // playground-host/dist holds about 18,000 Playground files when prepared locally.
    watch: { ignored: ['**/playground-host/dist/**'] },
  },
}))
