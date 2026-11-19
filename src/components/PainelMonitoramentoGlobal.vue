<script setup>
import { onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useMonitoramentoGlobal } from '../composables/useMonitoramentoGlobal'

const router = useRouter()

const {
  statusGlobal,
  carregando,
  painelAberto,
  abaAtiva,
  totalEmAndamento,
  ingestoes,
  migracoesSilver,
  migracaoGold,
  iniciarPolling,
  pararPolling,
  forcarAtualizacao,
  alternarPainel,
  fecharPainel,
  definirAba,
} = useMonitoramentoGlobal()

onMounted(() => {
  iniciarPolling()
})

onUnmounted(() => {
  pararPolling()
})

const totalIngestoes = computed(() => ingestoes.value.filter(i => i.emExecucao).length)
const totalSilver = computed(() => migracoesSilver.value.filter(s => s.emExecucao).length)
const totalGoldAtivo = computed(() => (migracaoGold.value && migracaoGold.value.emExecucao) ? 1 : 0)

const ingestoesFiltradas = computed(() => {
  if (abaAtiva.value === 'TODAS' || abaAtiva.value === 'INGESTAO') {
    return ingestoes.value.filter(i => i.emExecucao)
  }
  return []
})

const silverFiltradas = computed(() => {
  if (abaAtiva.value === 'TODAS' || abaAtiva.value === 'SILVER') {
    return migracoesSilver.value.filter(s => s.emExecucao)
  }
  return []
})

const exibirGold = computed(() => {
  if (abaAtiva.value === 'TODAS' || abaAtiva.value === 'GOLD') {
    return migracaoGold.value !== null && migracaoGold.value.emExecucao
  }
  return false
})

const temItensNaAba = computed(() => {
  if (abaAtiva.value === 'TODAS') {
    return totalIngestoes.value > 0 || totalSilver.value > 0 || totalGoldAtivo.value > 0
  }
  if (abaAtiva.value === 'INGESTAO') return totalIngestoes.value > 0
  if (abaAtiva.value === 'SILVER') return totalSilver.value > 0
  if (abaAtiva.value === 'GOLD') return totalGoldAtivo.value > 0
  return false
})

function navegarPara(rota) {
  router.push(rota)
}

function formatarFase(fase) {
  if (!fase) return 'Em processamento'
  const mapa = {
    'INICIANDO': 'Iniciando',
    'BUSCANDO_DADOS': 'Buscando dados na origem',
    'DESCOMPACTANDO': 'Descompactando arquivo',
    'LENDO_REGISTROS': 'Lendo registros',
    'GRAVANDO': 'Gravando na Bronze',
    'CONCLUIDO': 'Concluído',
    'CONCLUIDA': 'Concluída',
    'PROMOVIDO_SILVER': 'Promovido para Silver',
    'FALHA': 'Falha na execução',
    'ERRO': 'Falha na execução',
    'SEM_MUDANCA': 'Sem mudanças na origem',
    'REVALIDANDO_QUARENTENA': 'Revalidando Quarentena',
    'CARREGANDO_BRONZE': 'Lendo dados da Bronze',
    'VALIDANDO_REGRAS': 'Validando regras de negócio',
    'PERSISTINDO_SILVER': 'Persistindo na Silver',
    'RETIDO_QUARENTENA': 'Retido na Quarentena',
    'EM_ANDAMENTO': 'Calculando indicadores',
    'EM_PROCESSAMENTO': 'Em processamento',
    'OCIOSO': 'Aguardando publicação',
  }
  return mapa[fase] || fase
}
</script>

<template>
  <div class="monitor-container" id="painel-monitoramento-global">
    <!-- Pílula Minimizada (Floating Pill) -->
    <button
      v-if="!painelAberto"
      class="pill-minimizada"
      :class="{ 'pill--ativa': totalEmAndamento > 0 }"
      @click="alternarPainel"
      title="Acompanhar processamentos em segundo plano"
      aria-label="Abrir painel de monitoramento de processamentos"
    >
      <span class="pill-icone-status">
        <span v-if="totalEmAndamento > 0" class="pulso-ativo"></span>
        <svg class="icone-pill" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      </span>

      <span class="pill-texto">
        {{ totalEmAndamento > 0 ? `${totalEmAndamento} em execução` : 'Processamentos' }}
      </span>

      <span v-if="totalEmAndamento > 0" class="pill-badge">
        {{ totalEmAndamento }}
      </span>

      <svg class="icone-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="18 15 12 9 6 15" />
      </svg>
    </button>

    <!-- Card Expandido -->
    <transition name="painel-slide">
      <div v-if="painelAberto" class="painel-card">
        <!-- Topo do Card -->
        <header class="painel-header">
          <div class="painel-titulo-wrapper">
            <span class="ponto-status-topo" :class="{ 'ponto-ativo': totalEmAndamento > 0 }"></span>
            <div>
              <h3 class="painel-titulo">Processamentos Ativos</h3>
              <p class="painel-subtitulo">
                {{ totalEmAndamento > 0 ? `${totalEmAndamento} tarefa(s) em segundo plano` : 'Nenhuma tarefa em andamento' }}
              </p>
            </div>
          </div>

          <div class="painel-acoes-topo">
            <button
              class="btn-icone-painel"
              @click="forcarAtualizacao"
              :disabled="carregando"
              title="Atualizar status agora"
              aria-label="Atualizar status"
            >
              <svg :class="{ 'girando': carregando }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 2v6h-6" />
                <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                <path d="M3 22v-6h6" />
                <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
              </svg>
            </button>

            <button
              class="btn-icone-painel"
              @click="fecharPainel"
              title="Minimizar painel"
              aria-label="Minimizar painel"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>
        </header>

        <!-- Seletor de Abas -->
        <nav class="painel-abas">
          <button
            class="aba-btn"
            :class="{ 'aba-btn--ativa': abaAtiva === 'TODAS' }"
            @click="definirAba('TODAS')"
          >
            <span>Todas</span>
            <span v-if="totalEmAndamento > 0" class="aba-badge">{{ totalEmAndamento }}</span>
          </button>

          <button
            class="aba-btn"
            :class="{ 'aba-btn--ativa': abaAtiva === 'INGESTAO' }"
            @click="definirAba('INGESTAO')"
          >
            <span class="dot-aba dot--bronze"></span>
            <span>Ingestão</span>
            <span v-if="totalIngestoes > 0" class="aba-badge aba-badge--bronze">{{ totalIngestoes }}</span>
          </button>

          <button
            class="aba-btn"
            :class="{ 'aba-btn--ativa': abaAtiva === 'SILVER' }"
            @click="definirAba('SILVER')"
          >
            <span class="dot-aba dot--silver"></span>
            <span>Silver</span>
            <span v-if="totalSilver > 0" class="aba-badge aba-badge--silver">{{ totalSilver }}</span>
          </button>

          <button
            class="aba-btn"
            :class="{ 'aba-btn--ativa': abaAtiva === 'GOLD' }"
            @click="definirAba('GOLD')"
          >
            <span class="dot-aba dot--gold"></span>
            <span>Gold</span>
            <span v-if="totalGoldAtivo > 0" class="aba-badge aba-badge--gold">1</span>
          </button>
        </nav>

        <!-- Corpo das Tarefas -->
        <div class="painel-conteudo">
          <!-- Estado Vazio -->
          <div v-if="!temItensNaAba" class="painel-vazio">
            <svg class="icone-vazio" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            <p class="vazio-titulo">Tudo calmo por aqui</p>
            <span class="vazio-sub">Nenhum processamento ativo nesta seção.</span>
          </div>

          <!-- Seção Ingestão (Bronze) -->
          <template v-if="ingestoesFiltradas.length > 0">
            <div class="secao-divider">
              <span class="secao-tag tag--bronze">INGESTÃO BRONZE</span>
            </div>

            <article
              v-for="item in ingestoesFiltradas"
              :key="'ingestao-' + item.fonteId"
              class="card-tarefa"
              :class="{ 'card-tarefa--executando': item.emExecucao }"
            >
              <div class="card-tarefa-topo">
                <div class="tarefa-info">
                  <span class="tarefa-nome">{{ item.fonteNome }}</span>
                  <span class="tarefa-fase">{{ formatarFase(item.fase) }}</span>
                </div>
                <span class="tarefa-percentual">{{ item.percentual }}%</span>
              </div>

              <!-- Barra de Progresso -->
              <div class="trilho-progresso">
                <div
                  class="barra-preenchimento barra--bronze"
                  :style="{ width: `${item.percentual}%` }"
                ></div>
              </div>

              <div class="card-tarefa-rodape">
                <span class="tarefa-detalhe">
                  {{ item.registrosProcessados }}
                  <template v-if="item.totalEstimado">/ {{ item.totalEstimado }}</template>
                  registros
                </span>

                <button
                  class="btn-atalho-tarefa"
                  @click="navegarPara('/fontes')"
                  title="Abrir tela de fontes"
                >
                  Ver Fonte →
                </button>
              </div>
            </article>
          </template>

          <!-- Seção Migração Silver -->
          <template v-if="silverFiltradas.length > 0">
            <div class="secao-divider">
              <span class="secao-tag tag--silver">MIGRAÇÃO SILVER</span>
            </div>

            <article
              v-for="item in silverFiltradas"
              :key="'silver-' + item.loteId"
              class="card-tarefa"
              :class="{ 'card-tarefa--executando': item.emExecucao }"
            >
              <div class="card-tarefa-topo">
                <div class="tarefa-info">
                  <span class="tarefa-nome">Lote #{{ item.loteId }} — {{ item.fonteNome }}</span>
                  <span class="tarefa-fase">{{ formatarFase(item.fase) }}</span>
                </div>
                <span class="tarefa-percentual">{{ item.percentual }}%</span>
              </div>

              <!-- Barra de Progresso -->
              <div class="trilho-progresso">
                <div
                  class="barra-preenchimento barra--silver"
                  :style="{ width: `${item.percentual}%` }"
                ></div>
              </div>

              <div class="card-tarefa-rodape">
                <span class="tarefa-detalhe">
                  {{ item.registrosProcessados }} de {{ item.totalRegistros }} registros
                  <template v-if="item.errosEncontrados > 0">
                    ({{ item.errosEncontrados }} erro(s))
                  </template>
                </span>

                <div class="botoes-atalho-grupo">
                  <button
                    class="btn-atalho-tarefa"
                    @click="navegarPara('/lotes')"
                    title="Abrir tela de lotes"
                  >
                    Lotes
                  </button>
                  <button
                    v-if="item.errosEncontrados > 0 || item.statusFinal === 'RETIDO_QUARENTENA'"
                    class="btn-atalho-tarefa btn-atalho--alerta"
                    @click="navegarPara(`/quarentena?loteId=${item.loteId}`)"
                    title="Inspecionar lote na quarentena"
                  >
                    Quarentena →
                  </button>
                </div>
              </div>
            </article>
          </template>

          <!-- Seção Migração Gold -->
          <template v-if="exibirGold && migracaoGold">
            <div class="secao-divider">
              <span class="secao-tag tag--gold">MIGRAÇÃO GOLD</span>
            </div>

            <article
              class="card-tarefa"
              :class="{ 'card-tarefa--executando': migracaoGold.emExecucao }"
            >
              <div class="card-tarefa-topo">
                <div class="tarefa-info">
                  <span class="tarefa-nome">Publicação Consolidada na Gold</span>
                  <span class="tarefa-fase">{{ formatarFase(migracaoGold.statusIndicadores) }}</span>
                </div>
                <span class="tarefa-percentual">{{ migracaoGold.percentualGeral }}%</span>
              </div>

              <!-- Barra de Progresso -->
              <div class="trilho-progresso">
                <div
                  class="barra-preenchimento barra--gold"
                  :style="{ width: `${migracaoGold.percentualGeral}%` }"
                ></div>
              </div>

              <!-- Sub-etapas de Camadas de Mapa -->
              <div v-if="migracaoGold.camadasMapa && migracaoGold.camadasMapa.length > 0" class="grid-camadas-gold">
                <div
                  v-for="camada in migracaoGold.camadasMapa"
                  :key="camada.codigoCamada"
                  class="item-camada-mapa"
                >
                  <span class="camada-nome">{{ camada.codigoCamada }}</span>
                  <span
                    class="camada-badge"
                    :class="{
                      'badge--concluida': camada.status === 'CONCLUIDA',
                      'badge--andamento': camada.status === 'EM_ANDAMENTO',
                    }"
                  >
                    {{ camada.status === 'CONCLUIDA' ? '✓' : (camada.status === 'EM_ANDAMENTO' ? '...' : 'Pendente') }}
                  </span>
                </div>
              </div>

              <div class="card-tarefa-rodape">
                <span class="tarefa-detalhe">
                  {{ migracaoGold.indicadoresProcessados }} de {{ migracaoGold.indicadoresTotal }} imóveis consolidados
                </span>

                <button
                  class="btn-atalho-tarefa"
                  @click="navegarPara('/gold')"
                  title="Abrir tela de indicadores"
                >
                  Ver Gold →
                </button>
              </div>
            </article>
          </template>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped src="../styles/components/PainelMonitoramentoGlobal.css"></style>
