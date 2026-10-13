<script setup>
import { ref } from 'vue'

defineProps({
  abertoNoMobile: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['fechar'])

// Estado reativo para controlar o recuo (LIZARDS-37)
const recolhido = ref(false)

function alternarRecuo() {
  recolhido.value = !recolhido.value
}

// Estrutura agrupada por categorias com rótulos compactos (Medalhão)
const categorias = [
  {
    titulo: 'CAMADA BRONZE • INGESTÃO',
    itens: [
      {
        rota: '/fontes',
        rotulo: 'Cadastro de Fontes',
        icone: 'fontes',
        descricao: 'Ingestão e schemas',
      },
      {
        rota: '/lotes',
        rotulo: 'Lotes e Pipeline',
        icone: 'lotes',
        descricao: 'Monitoramento e Transição',
      },
      {
        rota: '/quarentena',
        rotulo: 'Quarentena e Qualidade',
        icone: 'quarentena',
        descricao: 'Auditoria e Correção',
      },
    ],
  },
  {
    titulo: 'CAMADA SILVER • LINHAGEM',
    itens: [
      {
        rota: '/conjuntos',
        rotulo: 'Conjuntos e Cobertura',
        icone: 'conjuntos',
        descricao: 'Cadastro e Mapa Territorial',
      },
    ],
  },
]

function navegar() {
  emit('fechar')
}
</script>

<template>
  <div>
    <!-- Backdrop para mobile -->
    <div
      v-if="abertoNoMobile"
      class="sidebar-backdrop"
      @click="emit('fechar')"
      aria-hidden="true"
    ></div>

    <!-- Barra Lateral / Drawer -->
    <aside 
      class="barra-lateral" 
      :class="{ 
        'barra-lateral--aberta-mobile': abertoNoMobile,
        'barra-lateral--recolhida': recolhido 
      }"
    >
      <div class="marca">
        <!-- Quando RECOLHIDO: Apenas o ícone do DataGIS funciona como botão para expandir (Estilo Gemini) -->
        <button 
          v-if="recolhido" 
          class="marca-icone marca-icone--botao" 
          @click="alternarRecuo"
          title="Expandir painel lateral"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
          </svg>
        </button>

        <!-- Quando EXPANDIDO: Logo + Nome + Botão Clean do Toggle -->
        <template v-else>
          <div class="marca-info">
            <div class="marca-icone" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            </div>
            <div class="marca-texto">
              <span class="marca-nome">DataGIS</span>
              <span class="marca-sub">Plataforma Geoespacial</span>
            </div>
          </div>

          <!-- Botão Toggle Clean (sem borda/caixa cinza) -->
          <button 
            class="btn-toggle-desktop" 
            @click="alternarRecuo" 
            title="Recolher painel lateral"
          >
            <svg class="icone-gemini" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>
        </template>

        <!-- Botão de Fechar no Mobile -->
        <button class="btn-fechar-drawer" @click="emit('fechar')" title="Fechar menu">
          ✕
        </button>
      </div>

      <nav class="menu">
        <!-- Renderização por Categorias (LIZARDS-36) -->
        <div 
          v-for="categoria in categorias" 
          :key="categoria.titulo" 
          class="menu-categoria"
        >
          <div v-if="!recolhido" class="menu-secao-rotulo">{{ categoria.titulo }}</div>
          <div v-else class="menu-secao-divisor"></div>

          <router-link
            v-for="item in categoria.itens"
            :key="item.rota"
            :to="item.rota"
            class="item-menu"
            active-class="item-menu--ativo"
            :title="recolhido ? item.rotulo : ''"
            @click="navegar"
          >
            <div class="icone-wrapper">
              <svg v-if="item.icone === 'fontes'" class="icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <ellipse cx="12" cy="5" rx="8" ry="3" />
                <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
                <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
              </svg>
              <svg v-else-if="item.icone === 'lotes'" class="icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
              <svg v-else-if="item.icone === 'quarentena'" class="icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M12 8v4" />
                <path d="M12 16h.01" />
              </svg>
              <svg v-else-if="item.icone === 'conjuntos'" class="icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </div>

            <div v-if="!recolhido" class="item-texto">
              <span class="item-rotulo">{{ item.rotulo }}</span>
              <span class="item-desc">{{ item.descricao }}</span>
            </div>
          </router-link>
        </div>
      </nav>

      <div class="rodape">
        <div class="avatar" aria-hidden="true" :title="recolhido ? 'Equipe de Dados' : ''">EQ</div>
        <div v-if="!recolhido" class="rodape-info">
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

/* Barra Lateral Desktop Fixa */
.barra-lateral {
  width: 16.5rem;
  flex-shrink: 0;
  height: 100vh;
  position: sticky;
  top: 0;
  background: #ffffff;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  padding: 1.5rem 1.1rem;
  box-shadow: 1px 0 3px rgba(0, 0, 0, 0.02);
  transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1), padding 0.25s ease;
  z-index: 100;
  overflow-y: auto;
  overflow-x: hidden;
}

.barra-lateral::-webkit-scrollbar {
  width: 4px;
}
.barra-lateral::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}

/* Estado Recolhido (LIZARDS-37) */
.barra-lateral--recolhida {
  width: 5rem;
  padding: 1.5rem 0.75rem;
}

.marca {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 1.25rem;
  margin-bottom: 1.25rem;
  border-bottom: 1px solid #eef2f6;
  flex-shrink: 0;
  min-height: 2.5rem;
}

.barra-lateral--recolhida .marca {
  justify-content: center;
}

.marca-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  overflow: hidden;
}

.marca-texto {
  overflow: hidden;
  white-space: nowrap;
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
  flex-shrink: 0;
  border: none;
}

/* Quando o ícone do DataGIS vira botão clicável (recolhido) */
.marca-icone--botao {
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.marca-icone--botao:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 8px rgba(21, 128, 61, 0.35);
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
  text-overflow: ellipsis;
  overflow: hidden;
}

.marca-sub {
  display: block;
  font-size: 0.72rem;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  text-overflow: ellipsis;
  overflow: hidden;
}

/* Botão Toggle Clean (Estilo Gemini - sem moldura cinza) */
.btn-toggle-desktop {
  background: transparent;
  border: none;
  color: #64748b;
  width: 2.2rem;
  height: 2.2rem;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.btn-toggle-desktop:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.icone-gemini {
  width: 1.35rem;
  height: 1.35rem;
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

.menu {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  flex: 1;
}

.menu-categoria {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

/* Prevenção de estouro/vazamento de texto da categoria */
.menu-secao-rotulo {
  font-size: 0.65rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #94a3b8;
  padding: 0.3rem 0.4rem 0.1rem;
  margin-top: 0.2rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.menu-secao-divisor {
  height: 1px;
  background: #f1f5f9;
  margin: 0.4rem 0;
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
  overflow: hidden;
}

.barra-lateral--recolhida .item-menu {
  justify-content: center;
  padding: 0.75rem 0;
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
  white-space: nowrap;
  overflow: hidden;
}

.item-rotulo {
  font-size: 0.88rem;
  font-weight: 700;
  color: #334155;
  transition: color 0.15s ease;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-desc {
  font-size: 0.72rem;
  color: #94a3b8;
  overflow: hidden;
  text-overflow: ellipsis;
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
  flex-shrink: 0;
  overflow: hidden;
}

.barra-lateral--recolhida .rodape {
  justify-content: center;
  padding: 1rem 0 0;
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
  white-space: nowrap;
  overflow: hidden;
}

.rodape-nome {
  margin: 0;
  font-size: 0.84rem;
  font-weight: 700;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rodape-perfil {
  margin: 0;
  font-size: 0.72rem;
  color: #16a34a;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Breakpoint Mobile / Tablet (< 1024px) */
@media (max-width: 1023px) {
  .btn-toggle-desktop {
    display: none;
  }

  .barra-lateral {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 18rem !important;
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