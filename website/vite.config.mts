import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root,
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('../dist-site', import.meta.url)),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        home: fileURLToPath(new URL('./index.html', import.meta.url)),
        story: fileURLToPath(new URL('./story/index.html', import.meta.url)),
        downloads: fileURLToPath(new URL('./downloads/index.html', import.meta.url)),
        project: fileURLToPath(new URL('./project/index.html', import.meta.url)),
        motionPreview: fileURLToPath(new URL('./motion-preview/index.html', import.meta.url))
      }
    }
  },
  server: { host: '127.0.0.1', port: 4174, strictPort: true }
})
