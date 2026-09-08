<script setup>
// So o item que ja existe de verdade entra aqui — nada de "em breve" (decisao da
// equipe). Painel/Catalogo/Execucoes/Qualidade/Versoes entram quando forem construidos.
const itens = [{ rota: '/fontes', rotulo: 'Cadastro de Fontes' }]
</script>

<template>
  <aside class="barra-lateral">
    <div class="marca">
      <span class="marca-nome">DataGis</span>
      <span class="marca-sub">Portal de dados</span>
    </div>

    <nav class="menu">
      <router-link
        v-for="item in itens"
        :key="item.rota"
        :to="item.rota"
        class="item-menu"
        active-class="item-menu--ativo"
      >
        <svg class="icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <ellipse cx="12" cy="5" rx="8" ry="3" />
          <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
          <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
        </svg>
        {{ item.rotulo }}
      </router-link>
    </nav>

    <div class="rodape">
      <div class="avatar" aria-hidden="true">EQ</div>
      <div>
        <p class="rodape-nome">Equipe de dados</p>
        <p class="rodape-perfil">Sem login ainda</p>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.barra-lateral {
  width: 15rem;
  flex-shrink: 0;
  min-height: 100vh;
  background: #ffffff;
  border-right: 1px solid #e6e8eb;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding: 1.5rem 1rem;
}

.marca {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  padding: 0 0.5rem 1.5rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid #eef0f2;
}

.marca-nome {
  font-size: 1.15rem;
  font-weight: 800;
  color: #1a1a1a;
}

.marca-sub {
  font-size: 0.75rem;
  color: #8a8f98;
}

.menu {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  flex: 1;
}

.item-menu {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.6rem 0.75rem;
  border-radius: 8px;
  font-size: 0.88rem;
  font-weight: 600;
  color: #555;
  text-decoration: none;
  border-left: 3px solid transparent;
  transition: background-color 0.12s ease, color 0.12s ease;
}

.item-menu:hover {
  background: #f4f6f5;
}

.item-menu--ativo {
  color: #2e7d32;
  background: #eaf5eb;
  border-left-color: #2e7d32;
}

.icone {
  width: 1.1rem;
  height: 1.1rem;
  flex-shrink: 0;
}

.rodape {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.75rem 0.5rem 0;
  border-top: 1px solid #eef0f2;
}

.avatar {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: #2e7d32;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 700;
  flex-shrink: 0;
}

.rodape-nome {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 600;
  color: #333;
}

.rodape-perfil {
  margin: 0;
  font-size: 0.72rem;
  color: #9a9fa6;
}
</style>
