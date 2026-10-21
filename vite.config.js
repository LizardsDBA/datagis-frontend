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
      // Regex, não prefixo simples: "/conjuntos" (endpoint legado do backend sem
      // prefixo /api) casava por prefixo com "/conjuntos-dados" também, mandando a
      // rota da tela nova (SPA, client-side) direto pro backend por engano.
      '^/conjuntos($|/)': {
        target: 'http://backend:8080',
        changeOrigin: true,
        // A tela /conjuntos tem o mesmo caminho do endpoint: F5 ou URL digitada pedem
        // HTML e iam parar no backend (401). Pedido de página fica no Vite (SPA).
        bypass: (req) => (req.headers.accept?.includes('text/html') ? req.url : undefined),
      },
    },
  },
})
