<script setup>
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import Sidebar from './components/Sidebar.vue'
import PainelMonitoramentoGlobal from './components/PainelMonitoramentoGlobal.vue'

const menuAberto = ref(false)
const route = useRoute()

function obterNomePagina() {
  if (route.path.startsWith('/fontes')) return 'Cadastro de Fontes'
  if (route.path.startsWith('/lotes')) return 'Lotes e Pipeline'
  if (route.path.startsWith('/quarentena')) return 'Quarentena e Qualidade'
  if (route.path.startsWith('/gold')) return 'Indicadores e Imóveis'
  if (route.path.startsWith('/admin/usuarios')) return 'Usuários e Acessos'
  if (route.path.startsWith('/auditoria')) return 'Logs de Auditoria'
  return 'DataGIS'
}
</script>

<template>
  <div class="layout">
    <!-- Topbar para Dispositivos Móveis e Tablets (< 1024px) -->
    <header class="topbar-mobile">
      <button
        class="btn-hamburguer"
        @click="menuAberto = true"
        aria-label="Abrir menu de navegação"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      <div class="topbar-mobile-marca">
        <span class="topbar-titulo">{{ obterNomePagina() }}</span>
        <span class="topbar-sub">DataGIS</span>
      </div>

      <div class="topbar-status-badge">
        <span class="ponto-status"></span>
        <span>Online</span>
      </div>
    </header>

    <div class="layout-corpo">
      <Sidebar
        :abertoNoMobile="menuAberto"
        @fechar="menuAberto = false"
      />

      <main class="conteudo">
        <div class="conteudo-container">
          <router-view />
        </div>
      </main>
    </div>

    <!-- Painel Global de Monitoramento de Migrações e Ingestões -->
    <PainelMonitoramentoGlobal />
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: #f8fafc;
}

.layout-corpo {
  display: flex;
  flex: 1;
  width: 100%;
  position: relative;
}

/* Topbar Mobile */
.topbar-mobile {
  display: none;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.25rem;
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  position: sticky;
  top: 0;
  z-index: 90;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.btn-hamburguer {
  background: transparent;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  width: 2.4rem;
  height: 2.4rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #334155;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-hamburguer:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
}

.btn-hamburguer svg {
  width: 1.35rem;
  height: 1.35rem;
}

.topbar-mobile-marca {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.topbar-titulo {
  font-size: 0.95rem;
  font-weight: 700;
  color: #0f172a;
}

.topbar-sub {
  font-size: 0.68rem;
  font-weight: 600;
  color: #16a34a;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.topbar-status-badge {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.72rem;
  font-weight: 600;
  color: #166534;
  background: #dcfce7;
  padding: 0.25rem 0.55rem;
  border-radius: 9999px;
}

.ponto-status {
  width: 6px;
  height: 6px;
  background: #16a34a;
  border-radius: 50%;
  animation: pulso 2s infinite;
}

@keyframes pulso {
  0% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(1.2); }
  100% { opacity: 1; transform: scale(1); }
}

/* Área Principal Fluida */
.conteudo {
  flex: 1;
  min-width: 0; /* Previne que flexbox force overflow horizontal */
  padding: 2rem 2.5rem;
  box-sizing: border-box;
}

.conteudo-container {
  width: 100%;
  max-width: 1680px;
  margin: 0 auto;
}

/* Responsividade de Padding e Visibilidade */
@media (max-width: 1023px) {
  .topbar-mobile {
    display: flex;
  }

  .conteudo {
    padding: 1.25rem 1.25rem 2.5rem;
  }
}

@media (max-width: 640px) {
  .conteudo {
    padding: 0.85rem 0.75rem 2rem;
  }
}
</style>
