<script setup>
import Sidebar from './components/Sidebar.vue'
</script>

<template>
  <div class="layout">
    <Sidebar />
    <main class="conteudo">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
:root {
  color-scheme: light;
}

.layout {
  display: flex;
  min-height: 100vh;
  background: #f6f7f8;
  font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
}

.conteudo {
  flex: 1;
  padding: 2rem 2.5rem;
  box-sizing: border-box;
  max-width: 64rem;
}
</style>
