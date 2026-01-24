import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy API requests to the Worker
      '/api': {
        target: 'https://cloud-worker.wongkiinging.workers.dev',
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            // Spoof the Origin to match production, so the Worker accepts it
            proxyReq.setHeader('Origin', 'https://plc-web.online');
          });
        }
      },
      // Proxy other endpoints used by the app
      '/video_feed': { target: 'https://cloud-worker.wongkiinging.workers.dev', changeOrigin: true, secure: false },
      '/relay': { target: 'https://cloud-worker.wongkiinging.workers.dev', changeOrigin: true, secure: false },
      '/temp': { target: 'https://cloud-worker.wongkiinging.workers.dev', changeOrigin: true, secure: false },
      '/control_status': { target: 'https://cloud-worker.wongkiinging.workers.dev', changeOrigin: true, secure: false },
      '/setpoint': { target: 'https://cloud-worker.wongkiinging.workers.dev', changeOrigin: true, secure: false },
      '/pid': { target: 'https://cloud-worker.wongkiinging.workers.dev', changeOrigin: true, secure: false },
      '/mv_manual': { target: 'https://cloud-worker.wongkiinging.workers.dev', changeOrigin: true, secure: false },
      '/tune': { target: 'https://cloud-worker.wongkiinging.workers.dev', changeOrigin: true, secure: false },
      // Catch-all for other command routes (start_*, stop_*, etc)
      '^/(start_|stop_|auto_|manual_|tune_).*': {
        target: 'https://cloud-worker.wongkiinging.workers.dev',
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            proxyReq.setHeader('Origin', 'https://plc-web.online');
          });
        }
      }
    }
  }
})
