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
  if (route.path.startsWith('/admin/')) return 'Controle de Acesso'
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

<style scoped src="./styles/components/App.css"></style>
