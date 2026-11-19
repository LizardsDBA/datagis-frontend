<script setup>
import { ref, computed, reactive, watch, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { nomeDoPerfil, sair, sessao, temPermissao } from '../auth/autenticacao'
import { PERMISSOES } from '../auth/permissoes'
import { alternarTema, estadoTema } from '../tema'
import PesquisaTelas from './PesquisaTelas.vue'
import IconeTela from './IconeTela.vue'

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
  fecharFlutuante()
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
    titulo: 'Tela inicial',
    itens: [
      {
        rota: '/',
        rotulo: 'Home',
        icone: 'inicio',
        descricao: 'Favoritos e atalhos',
        // Sem permissão: a tela inicial abre pra qualquer usuário logado
        permissao: null,
      },
    ],
  },
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
        rotulo: 'Indicadores e Resultados',
        icone: 'conjuntos',
        descricao: 'Indicadores, Mapa e Cobertura',
        permissao: PERMISSOES.CONJUNTO_VISUALIZAR,
        // Mesma área em duas telas: o mapa (/conjuntos) e a tabela (/indicadores), que abre
        // pelo botão "Ver em tabela" do mapa (LIZARDS-35)
        rotasRelacionadas: ['/indicadores'],
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
        rota: '/admin/controle-acesso',
        rotulo: 'Controle de Acesso',
        icone: 'usuarios',
        descricao: 'Usuários, perfis e permissões',
        permissao: PERMISSOES.USUARIO_GERENCIAR,
        // As telas do Controle de Acesso abrem pelo painel; o item continua marcado nelas
        rotasRelacionadas: ['/admin/'],
        // Vira um grupo que abre no próprio menu: a pessoa escolhe a tela direto daqui,
        // sem passar pelo painel. Com a barra recolhida, o ícone leva ao painel (rota).
        filhos: [
          { rota: '/admin/controle-acesso', rotulo: 'Visão geral', icone: 'painel', permissao: PERMISSOES.USUARIO_GERENCIAR },
          { rota: '/admin/usuarios', rotulo: 'Usuários', icone: 'usuarios', permissao: PERMISSOES.USUARIO_GERENCIAR },
          { rota: '/admin/perfis', rotulo: 'Perfis', icone: 'perfis', permissao: PERMISSOES.USUARIO_GERENCIAR },
          { rota: '/admin/matriz-acesso', rotulo: 'Matriz de Acesso', icone: 'matriz', permissao: PERMISSOES.USUARIO_GERENCIAR },
        ],
      },
    ],
  },
]

// Tela aberta a partir de outra (ex.: a tabela /indicadores, aberta pelo mapa) marca o
// item de origem como ativo, pra o menu não ficar sem nenhum item destacado.
const route = useRoute()
function ativoPorRelacao(item) {
  return (item.rotasRelacionadas || []).some((r) => route?.path?.startsWith(r))
}

// Grupos do menu (item com `filhos`): abrem e fecham pelo cabeçalho. Abrem sozinhos
// quando a tela aberta é de dentro do grupo.
const gruposAbertos = reactive(new Set())

function grupoAberto(item) {
  return gruposAbertos.has(item.rota)
}

function alternarGrupo(item) {
  if (gruposAbertos.has(item.rota)) gruposAbertos.delete(item.rota)
  else gruposAbertos.add(item.rota)
}

function filhosVisiveis(item) {
  return (item.filhos || []).filter((filho) => temPermissao(filho.permissao))
}

watch(
  () => route?.path,
  () => {
    categorias.forEach((categoria) =>
      categoria.itens.forEach((item) => {
        if (item.filhos && ativoPorRelacao(item)) gruposAbertos.add(item.rota)
      }),
    )
  },
  { immediate: true },
)

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
  fecharFlutuante()
  emit('fechar')
}

// Barra recolhida: passar o mouse num ícone mostra, ao lado, o nome da tela; num grupo,
// também a lista das telas dele. O menu fica aberto enquanto o mouse está no ícone ou no
// próprio menu. O clique no ícone do grupo abre e fecha (teclado e tela de toque).
// Vai pro <body> (Teleport) pra não ser cortado pela rolagem da barra, na altura do ícone.
const flutuante = ref(null) // { item, top, left } | null
const ATRASO_FECHAR_MS = 200
let timerFechar = null

function posicionar(item, evento) {
  const caixa = evento.currentTarget.getBoundingClientRect()
  flutuante.value = { item, top: caixa.top, left: caixa.right + 4 }
}

function abrirFlutuante(item, evento) {
  cancelarFechamento()
  if (flutuante.value?.item.rota === item.rota) {
    fecharFlutuante()
    return
  }
  posicionar(item, evento)
}

function mostrarAoPassar(item, evento) {
  if (!recolhido.value) return
  cancelarFechamento()
  posicionar(item, evento)
}

function cancelarFechamento() {
  clearTimeout(timerFechar)
  timerFechar = null
}

// Atraso curto: dá tempo de levar o mouse do ícone até o menu sem ele sumir
function agendarFechar() {
  cancelarFechamento()
  timerFechar = setTimeout(fecharFlutuante, ATRASO_FECHAR_MS)
}

function fecharFlutuante() {
  cancelarFechamento()
  flutuante.value = null
}

function aoClicarFora(evento) {
  if (!flutuante.value) return
  if (evento.target.closest?.('.menu-flutuante, .grupo-icone-recolhido')) return
  fecharFlutuante()
}

function aoTeclar(evento) {
  if (evento.key === 'Escape') fecharFlutuante()
}

watch(() => route?.path, fecharFlutuante)

onMounted(() => {
  document.addEventListener('mousedown', aoClicarFora)
  document.addEventListener('keydown', aoTeclar)
})
onUnmounted(() => {
  cancelarFechamento()
  document.removeEventListener('mousedown', aoClicarFora)
  document.removeEventListener('keydown', aoTeclar)
})
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

      <!-- Pesquisa de telas e botões, logo abaixo do nome do projeto -->
      <PesquisaTelas v-if="!recolhido" @navegou="navegar" />

      <nav class="menu">
        <!-- Renderização agrupada por categorias Medalhão -->
        <div 
          v-for="categoria in categoriasVisiveis" 
          :key="categoria.titulo" 
          class="menu-categoria"
        >
          <div v-if="!recolhido" class="menu-secao-rotulo">{{ categoria.titulo }}</div>
          <div v-else class="menu-secao-divisor"></div>

          <template v-for="item in categoria.itens" :key="item.rota">
          <!-- Grupo com a barra recolhida: o ícone abre o menu flutuante com as telas -->
          <button
            v-if="item.filhos && recolhido"
            type="button"
            class="item-menu grupo-icone-recolhido"
            :class="{ 'item-menu--ativo': ativoPorRelacao(item) }"
            :aria-label="item.rotulo"
            aria-haspopup="menu"
            :aria-expanded="flutuante?.item.rota === item.rota"
            @click="abrirFlutuante(item, $event)"
            @mouseenter="mostrarAoPassar(item, $event)"
            @mouseleave="agendarFechar"
          >
            <div class="icone-wrapper">
              <span class="icone"><IconeTela :nome="item.icone" /></span>
            </div>
          </button>

          <router-link
            v-else-if="!item.filhos"
            :to="item.rota"
            class="item-menu"
            active-class="item-menu--ativo"
            :class="{ 'item-menu--ativo': ativoPorRelacao(item) }"
            :aria-label="recolhido ? item.rotulo : undefined"
            @click="navegar"
            @dblclick="lidarDuploClique"
            @mouseenter="mostrarAoPassar(item, $event)"
            @mouseleave="agendarFechar"
          >
            <div class="icone-wrapper">
              <!-- Ícone para Home -->
              <svg v-if="item.icone === 'inicio'" class="icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 10.5 12 3l9 7.5" />
                <path d="M5 9.5V21h14V9.5" />
                <path d="M10 21v-6h4v6" />
              </svg>
              <!-- Ícone para Fontes -->
              <svg v-else-if="item.icone === 'fontes'" class="icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
              <!-- Ícone para Indicadores e Resultados (mapa) -->
              <svg v-else-if="item.icone === 'conjuntos'" class="icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <!-- Ícone para Logs de Auditoria -->
              <svg v-else-if="item.icone === 'auditoria'" class="icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="8" y1="13" x2="16" y2="13" />
                <line x1="8" y1="17" x2="13" y2="17" />
              </svg>
              <!-- Ícone para Controle de Acesso -->
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

          <!-- Grupo: cabeçalho abre a lista de telas, que a pessoa escolhe direto no menu -->
          <div v-else class="grupo-menu">
            <button
              type="button"
              class="item-menu grupo-cabeca"
              :class="{ 'item-menu--ativo': ativoPorRelacao(item) }"
              :aria-expanded="grupoAberto(item)"
              @click="alternarGrupo(item)"
            >
              <div class="icone-wrapper">
                <span class="icone"><IconeTela :nome="item.icone" /></span>
              </div>
              <div class="item-texto">
                <span class="item-rotulo">{{ item.rotulo }}</span>
                <span class="item-desc">{{ item.descricao }}</span>
              </div>
              <svg class="grupo-seta" :class="{ 'grupo-seta--aberta': grupoAberto(item) }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            <ul v-if="grupoAberto(item)" class="grupo-lista">
              <li v-for="filho in filhosVisiveis(item)" :key="filho.rota" class="grupo-item">
                <router-link
                  :to="filho.rota"
                  class="subitem"
                  active-class="subitem--ativo"
                  @click="navegar"
                >
                  <span class="subitem-icone"><IconeTela :nome="filho.icone" /></span>
                  <span class="subitem-rotulo">{{ filho.rotulo }}</span>
                </router-link>
                <a
                  :href="filho.rota"
                  target="_blank"
                  rel="noopener"
                  class="subitem-nova-aba"
                  :title="`Abrir ${filho.rotulo} em nova aba`"
                  :aria-label="`Abrir ${filho.rotulo} em nova aba`"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>
              </li>
            </ul>
          </div>
          </template>
        </div>
      </nav>

      <Teleport to="body">
        <div
          v-if="flutuante"
          class="menu-flutuante"
          :class="{ 'menu-flutuante--grupo': flutuante.item.filhos }"
          role="menu"
          :aria-label="flutuante.item.rotulo"
          :style="{ top: `${flutuante.top}px`, left: `${flutuante.left}px` }"
          @mouseenter="cancelarFechamento"
          @mouseleave="agendarFechar"
        >
          <router-link
            v-if="!flutuante.item.filhos"
            :to="flutuante.item.rota"
            class="menu-flutuante-titulo menu-flutuante-titulo--link"
            role="menuitem"
            @click="navegar"
          >{{ flutuante.item.rotulo }}</router-link>
          <p v-else class="menu-flutuante-titulo">{{ flutuante.item.rotulo }}</p>
          <ul v-if="flutuante.item.filhos" class="grupo-lista grupo-lista--flutuante">
            <li v-for="filho in filhosVisiveis(flutuante.item)" :key="filho.rota" class="grupo-item">
              <router-link :to="filho.rota" class="subitem" active-class="subitem--ativo" role="menuitem" @click="navegar">
                <span class="subitem-icone"><IconeTela :nome="filho.icone" /></span>
                <span class="subitem-rotulo">{{ filho.rotulo }}</span>
              </router-link>
              <a
                :href="filho.rota"
                target="_blank"
                rel="noopener"
                class="subitem-nova-aba"
                :title="`Abrir ${filho.rotulo} em nova aba`"
                :aria-label="`Abrir ${filho.rotulo} em nova aba`"
                @click="fecharFlutuante"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            </li>
          </ul>
        </div>
      </Teleport>

      <div class="rodape">
        <!-- Nome e avatar abrem a Minha conta; recolhida, só o avatar centralizado -->
        <router-link
          to="/minha-conta"
          class="link-conta"
          :class="{ 'link-conta--ativo': route.path === '/minha-conta' }"
          :title="recolhido ? `${sessao.nome || sessao.login} (${descricaoPerfis}) - Minha conta` : 'Minha conta'"
          aria-label="Minha conta"
          @click="emit('fechar')"
        >
          <span class="avatar" aria-hidden="true">{{ iniciais }}</span>
          <span v-if="!recolhido" class="rodape-info">
            <span class="rodape-nome">{{ sessao.nome || sessao.login }}</span>
            <span class="rodape-perfil">{{ descricaoPerfis }}</span>
          </span>
        </router-link>

        <template v-if="!recolhido">
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

<style scoped src="../styles/components/Sidebar.css"></style>
