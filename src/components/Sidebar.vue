<script setup>
import { ref, computed } from 'vue'
import { nomeDoPerfil, sair, sessao, temPermissao } from '../auth/autenticacao'
import { PERMISSOES } from '../auth/permissoes'
import { alternarTema, estadoTema } from '../tema'

defineProps({
  abertoNoMobile: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['fechar'])

// Estado reativo para controlar o recuo da Sidebar (LIZARDS-37)
const recolhido = ref(false)

function alternarRecuo() {
  recolhido.value = !recolhido.value
}

// Botão de tema (LIZARDS-38): o rótulo descreve a ação, não o estado atual
const temaEscuro = computed(() => estadoTema.atual === 'escuro')
const rotuloTema = computed(() => (temaEscuro.value ? 'Usar tema claro' : 'Usar tema escuro'))

// Handler de duplo clique para expandir a barra lateral caso esteja recolhida
function lidarDuploClique() {
  if (recolhido.value) {
    recolhido.value = false
  }
}

// Estrutura completa agrupada pelas categorias Medalhão (LIZARDS-36) com permissões da sprint-2
const categorias = [
  {
    titulo: 'Ingestão & Qualidade (Bronze)',
    itens: [
      {
        rota: '/fontes',
        rotulo: 'Cadastro de Fontes',
        icone: 'fontes',
        descricao: 'Ingestão e schemas',
        permissao: PERMISSOES.FONTE_VISUALIZAR,
      },
      {
        rota: '/lotes',
        rotulo: 'Lotes e Pipeline',
        icone: 'lotes',
        descricao: 'Monitoramento e Transição',
        permissao: PERMISSOES.LOTE_VISUALIZAR,
      },
      {
        rota: '/quarentena',
        rotulo: 'Quarentena e Qualidade',
        icone: 'quarentena',
        descricao: 'Auditoria e Correção',
        permissao: PERMISSOES.QUARENTENA_VISUALIZAR,
      },
    ],
  },
  {
    titulo: 'Processamento & Linhagem (Silver)',
    itens: [
      {
        rota: '/conjuntos',
        rotulo: 'Conjuntos e Cobertura',
        icone: 'conjuntos',
        descricao: 'Cadastro e Mapa Territorial',
        permissao: PERMISSOES.CONJUNTO_VISUALIZAR,
      },
    ],
  },
  {
    titulo: 'Publicação & Resultados (Gold)',
    itens: [
      {
        rota: '/indicadores',
        rotulo: 'Indicadores e Resultados',
        icone: 'indicadores',
        descricao: 'Consulta por município e imóvel',
        permissao: PERMISSOES.INDICADOR_VISUALIZAR,
      },
    ],
  },
  {
    titulo: 'Administração & Governança',
    itens: [
      {
        rota: '/auditoria',
        rotulo: 'Logs de Auditoria',
        icone: 'auditoria',
        descricao: 'Quem fez o quê e quando',
        permissao: PERMISSOES.AUDITORIA_VISUALIZAR,
      },
      {
        rota: '/admin/usuarios',
        rotulo: 'Usuários e Acessos',
        icone: 'usuarios',
        descricao: 'Perfis e Permissões',
        permissao: PERMISSOES.USUARIO_GERENCIAR,
      },
    ],
  },
]

// Mantém o filtro estrito de permissões da sprint-2 por perfil de usuário
const categoriasVisiveis = computed(() => {
  return categorias
    .map((categoria) => ({
      ...categoria,
      itens: categoria.itens.filter((item) => temPermissao(item.permissao)),
    }))
    .filter((categoria) => categoria.itens.length > 0)
})

const iniciais = computed(() =>
  (sessao.nome || sessao.login || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0].toUpperCase())
    .join(''),
)

const descricaoPerfis = computed(() =>
  sessao.perfis.length ? sessao.perfis.map(nomeDoPerfil).join(' · ') : 'Sem perfil',
)

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
        <!-- Quando RECOLHIDO: Ícone funcional do DataGIS para expandir -->
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

          <!-- Botão Toggle Clean -->
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
        <!-- Renderização agrupada por categorias Medalhão -->
        <div 
          v-for="categoria in categoriasVisiveis" 
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
            @dblclick="lidarDuploClique"
          >
            <div class="icone-wrapper">
              <!-- Ícone para Fontes -->
              <svg v-if="item.icone === 'fontes'" class="icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <ellipse cx="12" cy="5" rx="8" ry="3" />
                <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
                <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
              </svg>
              <!-- Ícone para Lotes e Pipeline -->
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
              <!-- Ícone para Conjuntos e Cobertura -->
              <svg v-else-if="item.icone === 'conjuntos'" class="icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <!-- Ícone para Indicadores e Resultados -->
              <svg v-else-if="item.icone === 'indicadores'" class="icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="9" y1="9" x2="9" y2="21" />
                <line x1="3" y1="15" x2="21" y2="15" />
              </svg>
              <!-- Ícone para Logs de Auditoria -->
              <svg v-else-if="item.icone === 'auditoria'" class="icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="8" y1="13" x2="16" y2="13" />
                <line x1="8" y1="17" x2="13" y2="17" />
              </svg>
              <!-- Ícone para Usuários e Acessos -->
              <svg v-else-if="item.icone === 'usuarios'" class="icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 1 0 7.75" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
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
        <!-- Apenas o avatar centralizado quando recolhido -->
        <div 
          class="avatar" 
          aria-hidden="true" 
          :title="recolhido ? `${sessao.nome || sessao.login} (${descricaoPerfis})` : ''"
        >
          {{ iniciais }}
        </div>
        
        <template v-if="!recolhido">
          <div class="rodape-info">
            <p class="rodape-nome">{{ sessao.nome || sessao.login }}</p>
            <p class="rodape-perfil">{{ descricaoPerfis }}</p>
          </div>
          <button class="btn-tema" :title="rotuloTema" :aria-label="rotuloTema" @click="alternarTema">
            <!-- Sol no escuro (volta pro claro), lua no claro (vai pro escuro) -->
            <svg v-if="temaEscuro" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          </button>
          <button class="btn-sair" title="Sair do DataGIS" aria-label="Sair" @click="sair">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </template>

        <!-- Recolhida: o botão de tema continua acessível, abaixo do avatar (LIZARDS-38) -->
        <button
          v-if="recolhido"
          class="btn-tema"
          :title="rotuloTema"
          :aria-label="rotuloTema"
          @click="alternarTema"
        >
          <svg v-if="temaEscuro" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        </button>

        <!-- Recolhida: o Sair também continua acessível, abaixo do tema (LIZARDS-38) -->
        <button
          v-if="recolhido"
          class="btn-sair"
          title="Sair do DataGIS"
          aria-label="Sair"
          @click="sair"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
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

/* Barra Lateral Desktop Fixa - Largura expandida ajustada para 17.5rem para evitar cortes de texto */
.barra-lateral {
  width: 17.5rem;
  flex-shrink: 0;
  height: 100vh;
  position: sticky;
  top: 0;
  background: #ffffff;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  padding: 1.25rem 0.9rem;
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
  padding: 1.25rem 0.75rem;
}

.marca {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 1rem;
  margin-bottom: 1rem;
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
  gap: 0.6rem;
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
  font-size: 1.15rem;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.02em;
}

.marca-sub {
  display: block;
  font-size: 0.68rem;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* Botão Toggle Clean */
.btn-toggle-desktop {
  background: transparent;
  border: none;
  color: #64748b;
  width: 2rem;
  height: 2rem;
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
  gap: 1rem;
  flex: 1;
}

.menu-categoria {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

/* Títulos de categoria ajustados para caberem sem cortes de reticências */
.menu-secao-rotulo {
  font-size: 0.63rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #94a3b8;
  padding: 0.2rem 0.3rem 0.1rem;
  margin-top: 0.1rem;
  white-space: nowrap;
}

.menu-secao-divisor {
  height: 1px;
  background: #f1f5f9;
  margin: 0.4rem 0;
}

.item-menu {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 0.75rem;
  border-radius: 10px;
  text-decoration: none;
  border: 1px solid transparent;
  transition: all 0.15s ease;
  overflow: hidden;
}

.barra-lateral--recolhida .item-menu {
  justify-content: center;
  padding: 0.65rem 0;
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
  min-width: 0;
}

.item-rotulo {
  font-size: 0.84rem;
  font-weight: 700;
  color: #334155;
  transition: color 0.15s ease;
}

.item-desc {
  font-size: 0.7rem;
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
  gap: 0.65rem;
  padding: 0.85rem 0.25rem 0;
  border-top: 1px solid #eef2f6;
  margin-top: auto;
  flex-shrink: 0;
  overflow: hidden;
}

/* Centralização perfeita da bolinha quando recolhido */
.barra-lateral--recolhida .rodape {
  justify-content: center;
  padding: 0.85rem 0 0;
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
  min-width: 0;
  flex: 1;
}

.btn-sair {
  background: transparent;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s ease;
}

.btn-sair:hover {
  background: #fee2e2;
  border-color: #fecaca;
  color: #dc2626;
}

.btn-sair svg {
  width: 1rem;
  height: 1rem;
}

/* Botão de tema (LIZARDS-38): mesmo formato do Sair, sem o vermelho no hover */
.btn-tema {
  background: transparent;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s ease;
}

.btn-tema:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.btn-tema svg {
  width: 1rem;
  height: 1rem;
}

.rodape-nome {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 700;
  color: #1e293b;
}

.rodape-perfil {
  margin: 0;
  font-size: 0.7rem;
  color: #16a34a;
  font-weight: 600;
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

/* Barra de rolagem discreta (LIZARDS-38): invisível até passar o mouse na sidebar.
   A rolagem continua funcionando; só some a faixa cinza do trilho. scrollbar-width/
   scrollbar-color valem no Chrome, Edge e Firefox (e fazem o Chrome ignorar o
   ::-webkit-scrollbar); o ::-webkit-scrollbar fica como reserva para o Safari. */
.barra-lateral {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.barra-lateral:hover {
  scrollbar-color: #cbd5e1 transparent;
}

.barra-lateral::-webkit-scrollbar-track {
  background: transparent;
}

.barra-lateral::-webkit-scrollbar-thumb {
  background: transparent;
}

.barra-lateral:hover::-webkit-scrollbar-thumb {
  background: #cbd5e1;
}

/* Rodapé recolhido (LIZARDS-38): itens empilhados, para caber o botão de tema */
.barra-lateral--recolhida .rodape {
  flex-direction: column;
  gap: 0.5rem;
}

/* ==========================================================================
   Tema escuro (LIZARDS-38) — só acrescenta; o tema claro acima não muda
   ========================================================================== */
:root[data-tema="escuro"] .barra-lateral {
  background: var(--cor-superficie);
  border-right-color: var(--cor-borda);
  box-shadow: none;
}

:root[data-tema="escuro"] .barra-lateral:hover {
  scrollbar-color: var(--cor-borda-forte) transparent;
}

:root[data-tema="escuro"] .barra-lateral:hover::-webkit-scrollbar-thumb {
  background: var(--cor-borda-forte);
}

:root[data-tema="escuro"] .marca {
  border-bottom-color: var(--cor-borda-suave);
}

:root[data-tema="escuro"] .marca-icone {
  background: var(--cor-primaria);
  color: var(--cor-primaria-contraste);
  box-shadow: none;
}

:root[data-tema="escuro"] .marca-icone--botao:hover {
  background: var(--cor-primaria-hover);
  box-shadow: none;
}

:root[data-tema="escuro"] .marca-nome {
  color: var(--cor-texto-titulo);
}

:root[data-tema="escuro"] .marca-sub {
  color: var(--cor-texto-rotulo);
}

:root[data-tema="escuro"] .btn-toggle-desktop,
:root[data-tema="escuro"] .btn-fechar-drawer {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .btn-toggle-desktop:hover,
:root[data-tema="escuro"] .btn-fechar-drawer:hover {
  background: var(--cor-superficie-elevada);
  color: var(--cor-texto-titulo);
}

:root[data-tema="escuro"] .menu-secao-rotulo {
  color: var(--cor-texto-rotulo);
}

:root[data-tema="escuro"] .menu-secao-divisor {
  background: var(--cor-borda-suave);
}

:root[data-tema="escuro"] .item-menu:hover {
  background: var(--cor-superficie-elevada);
  border-color: var(--cor-borda);
}

:root[data-tema="escuro"] .icone-wrapper {
  background: var(--cor-superficie-elevada);
  color: var(--cor-texto-terciario);
  box-shadow: inset 0 0 0 1px var(--cor-borda);
}

:root[data-tema="escuro"] .item-rotulo {
  color: var(--cor-texto);
}

:root[data-tema="escuro"] .item-desc {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .item-menu--ativo {
  background: var(--cor-primaria-tenue);
  border-color: var(--cor-primaria-borda);
}

:root[data-tema="escuro"] .item-menu--ativo .icone-wrapper {
  background: var(--cor-primaria);
  color: var(--cor-primaria-contraste);
  box-shadow: none;
}

:root[data-tema="escuro"] .item-menu--ativo .item-rotulo {
  color: var(--cor-link);
}

:root[data-tema="escuro"] .item-menu--ativo .item-desc {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .rodape {
  border-top-color: var(--cor-borda-suave);
}

:root[data-tema="escuro"] .avatar {
  background: var(--cor-primaria);
  color: var(--cor-primaria-contraste);
  box-shadow: none;
}

:root[data-tema="escuro"] .rodape-nome {
  color: var(--cor-texto-titulo);
}

:root[data-tema="escuro"] .rodape-perfil {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .btn-sair,
:root[data-tema="escuro"] .btn-tema {
  background: var(--cor-superficie-elevada);
  border-color: var(--cor-borda);
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .btn-tema:hover {
  background: var(--cor-borda);
  color: var(--cor-texto-titulo);
}

:root[data-tema="escuro"] .btn-sair:hover {
  background: var(--tenue-erro);
  border-color: rgb(248 113 113 / 30%);
  color: var(--cor-erro);
}
</style>