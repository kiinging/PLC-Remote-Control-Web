import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // All backend API calls (including /api/ws WebSocket) go through the Worker
      '/api': {
        target: 'https://cloud-worker.wongkiinging.workers.dev',
        changeOrigin: true,
        secure: false,
        ws: true, // Enable WebSocket proxying for /api/ws
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            // Spoof the Origin to match production, so the Worker accepts it
            proxyReq.setHeader('Origin', 'https://plc-web.online');
          });
        }
      }
    }
  }
})
