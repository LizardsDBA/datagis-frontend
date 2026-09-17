import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    host: true, // 0.0.0.0 — precisa ser alcançável de fora do container
    port: 5173,
    strictPort: true,
    watch: {
      // Bind mount no WSL2 nem sempre propaga eventos de FS pro container.
      usePolling: true,
    },
    proxy: {
      // Evita CORS em dev: o browser fala só com o Vite, que repassa pro backend.
      '/api': {
        target: 'http://backend:8080',
        changeOrigin: true,
      },
      '/conjuntos': {
        target: 'http://backend:8080',
        changeOrigin: true,
      },
    },
  },
})
