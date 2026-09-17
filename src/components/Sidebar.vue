<script setup>
defineProps({
  abertoNoMobile: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['fechar'])

const itens = [
  {
    rota: '/fontes',
    rotulo: 'Cadastro de Fontes',
    icone: 'fontes',
    descricao: 'Ingestão e schemas',
  },
  {
    rota: '/lotes',
    rotulo: 'Lotes & Pipeline',
    icone: 'lotes',
    descricao: 'Monitoramento & Transição',
  },
  {
    rota: '/quarentena',
    rotulo: 'Quarentena & Qualidade',
    icone: 'quarentena',
    descricao: 'Auditoria & Correção',
  },
  {
    rota: '/conjuntos',
    rotulo: 'Conjuntos & Cobertura',
    icone: 'conjuntos',
    descricao: 'Cadastro & Mapa Territorial',
  },
]

function navegar() {
  emit('fechar')
}
</script>

<template>
  <div>
    <!-- Backdrop com desfoque suave para mobile -->
    <div
      v-if="abertoNoMobile"
      class="sidebar-backdrop"
      @click="emit('fechar')"
      aria-hidden="true"
    ></div>

    <!-- Barra Lateral / Drawer -->
    <aside class="barra-lateral" :class="{ 'barra-lateral--aberta-mobile': abertoNoMobile }">
      <div class="marca">
        <div class="marca-info">
          <div class="marca-icone" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
          </div>
          <div>
            <span class="marca-nome">DataGIS</span>
            <span class="marca-sub">Plataforma Geoespacial</span>
          </div>
        </div>

        <!-- Botão de Fechar no Mobile -->
        <button class="btn-fechar-drawer" @click="emit('fechar')" title="Fechar menu">
          ✕
        </button>
      </div>

      <nav class="menu">
        <div class="menu-secao-rotulo">Módulos do Sistema</div>
        <router-link
          v-for="item in itens"
          :key="item.rota"
          :to="item.rota"
          class="item-menu"
          active-class="item-menu--ativo"
          @click="navegar"
        >
          <div class="icone-wrapper">
            <!-- Ícone para Fontes -->
            <svg v-if="item.icone === 'fontes'" class="icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <ellipse cx="12" cy="5" rx="8" ry="3" />
              <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
              <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
            </svg>
            <!-- Ícone para Lotes & Pipeline -->
            <svg v-else-if="item.icone === 'lotes'" class="icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
            <!-- Ícone para Quarentena / Qualidade -->
            <svg v-else-if="item.icone === 'quarentena'" class="icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M12 8v4" />
              <path d="M12 16h.01" />
            </svg>
            <!-- Ícone para Conjuntos & Cobertura -->
            <svg v-else-if="item.icone === 'conjuntos'" class="icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>
          <div class="item-texto">
            <span class="item-rotulo">{{ item.rotulo }}</span>
            <span class="item-desc">{{ item.descricao }}</span>
          </div>
        </router-link>
      </nav>

      <div class="rodape">
        <div class="avatar" aria-hidden="true">EQ</div>
        <div class="rodape-info">
          <p class="rodape-nome">Equipe de Dados</p>
          <p class="rodape-perfil">Operador Ativo</p>
        </div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
/* Backdrop Mobile */
.sidebar-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(3px);
  z-index: 998;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Barra Lateral Desktop */
.barra-lateral {
  width: 16.5rem;
  flex-shrink: 0;
  min-height: 100vh;
  height: 100%;
  background: #ffffff;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  padding: 1.5rem 1.1rem;
  box-shadow: 1px 0 3px rgba(0, 0, 0, 0.02);
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  position: sticky;
  top: 0;
  z-index: 100;
}

.marca {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 1.25rem;
  margin-bottom: 1.25rem;
  border-bottom: 1px solid #eef2f6;
}

.marca-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.marca-icone {
  width: 2.2rem;
  height: 2.2rem;
  background: linear-gradient(135deg, #16a34a, #15803d);
  color: #ffffff;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 4px rgba(21, 128, 61, 0.25);
}

.marca-icone svg {
  width: 1.25rem;
  height: 1.25rem;
}

.marca-nome {
  display: block;
  font-size: 1.2rem;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.02em;
}

.marca-sub {
  display: block;
  font-size: 0.72rem;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.btn-fechar-drawer {
  display: none;
  background: transparent;
  border: none;
  font-size: 1.25rem;
  color: #64748b;
  cursor: pointer;
  padding: 0.4rem;
  border-radius: 6px;
  line-height: 1;
}

.btn-fechar-drawer:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.menu {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  flex: 1;
}

.menu-secao-rotulo {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #94a3b8;
  padding: 0.4rem 0.6rem;
  margin-bottom: 0.2rem;
}

.item-menu {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 0.75rem 0.85rem;
  border-radius: 10px;
  text-decoration: none;
  border: 1px solid transparent;
  transition: all 0.15s ease;
}

.item-menu:hover {
  background: #f8fafc;
  border-color: #e2e8f0;
}

.icone-wrapper {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: #f1f5f9;
  color: #64748b;
  flex-shrink: 0;
  transition: all 0.15s ease;
}

.icone {
  width: 1.15rem;
  height: 1.15rem;
}

.item-texto {
  display: flex;
  flex-direction: column;
}

.item-rotulo {
  font-size: 0.88rem;
  font-weight: 700;
  color: #334155;
  transition: color 0.15s ease;
}

.item-desc {
  font-size: 0.72rem;
  color: #94a3b8;
}

/* Item Ativo */
.item-menu--ativo {
  background: #f0fdf4;
  border-color: #bbf7d0;
}

.item-menu--ativo .icone-wrapper {
  background: #15803d;
  color: #ffffff;
  box-shadow: 0 2px 4px rgba(21, 128, 61, 0.2);
}

.item-menu--ativo .item-rotulo {
  color: #15803d;
}

.item-menu--ativo .item-desc {
  color: #166534;
}

.rodape {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 0.5rem 0;
  border-top: 1px solid #eef2f6;
  margin-top: auto;
}

.avatar {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  background: linear-gradient(135deg, #15803d, #166534);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.78rem;
  font-weight: 800;
  flex-shrink: 0;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.rodape-info {
  display: flex;
  flex-direction: column;
}

.rodape-nome {
  margin: 0;
  font-size: 0.84rem;
  font-weight: 700;
  color: #1e293b;
}

.rodape-perfil {
  margin: 0;
  font-size: 0.72rem;
  color: #16a34a;
  font-weight: 600;
}

/* Breakpoint Mobile / Tablet (< 1024px) */
@media (max-width: 1023px) {
  .barra-lateral {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 18rem;
    max-width: 85vw;
    z-index: 999;
    transform: translateX(-100%);
    box-shadow: 4px 0 24px rgba(0, 0, 0, 0.15);
  }

  .barra-lateral--aberta-mobile {
    transform: translateX(0);
  }

  .btn-fechar-drawer {
    display: block;
  }
}
</style>
