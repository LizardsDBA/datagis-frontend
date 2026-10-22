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

<style scoped>
.monitor-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 1050;
  font-family: inherit;
}

/* Pílula Minimizada */
.pill-minimizada {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  padding: 0 16px;
  background: rgba(15, 23, 42, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 9999px;
  color: #f1f5f9;
  font-size: 0.85rem;
  font-weight: 500;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 1px 1px rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(14px);
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  user-select: none;
}

.pill-minimizada:hover {
  background: rgba(30, 41, 59, 0.96);
  border-color: rgba(255, 255, 255, 0.24);
  transform: translateY(-2px);
  box-shadow: 0 14px 30px -4px rgba(0, 0, 0, 0.6);
}

.pill--ativa {
  border-color: rgba(16, 185, 129, 0.4);
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 16px rgba(16, 185, 129, 0.25);
}

.pill-icone-status {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #38bdf8;
}

.pill--ativa .pill-icone-status {
  color: #34d399;
}

.pulso-ativo {
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: #10b981;
  opacity: 0.6;
  animation: pulso-onda 2s infinite;
}

@keyframes pulso-onda {
  0% { transform: scale(1); opacity: 0.7; }
  100% { transform: scale(2.2); opacity: 0; }
}

.icone-pill {
  width: 18px;
  height: 18px;
}

.pill-texto {
  white-space: nowrap;
}

.pill-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  background: #10b981;
  color: #042f2e;
  font-size: 0.75rem;
  font-weight: 700;
  border-radius: 9999px;
}

.icone-chevron {
  width: 16px;
  height: 16px;
  opacity: 0.6;
  transition: transform 0.2s ease;
}

.pill-minimizada:hover .icone-chevron {
  opacity: 1;
}

/* Card Expandido */
.painel-card {
  width: 390px;
  max-width: calc(100vw - 32px);
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  box-shadow: 0 20px 35px -8px rgba(0, 0, 0, 0.6), 0 0 20px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(20px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.painel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(30, 41, 59, 0.4);
}

.painel-titulo-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ponto-status-topo {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #64748b;
}

.ponto-status-topo.ponto-ativo {
  background: #10b981;
  box-shadow: 0 0 10px #10b981;
}

.painel-titulo {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: #f8fafc;
}

.painel-subtitulo {
  margin: 2px 0 0 0;
  font-size: 0.75rem;
  color: #94a3b8;
}

.painel-acoes-topo {
  display: flex;
  gap: 6px;
}

.btn-icone-painel {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: transparent;
  border: 1px solid transparent;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-icone-painel:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #f8fafc;
  border-color: rgba(255, 255, 255, 0.1);
}

.btn-icone-painel svg {
  width: 16px;
  height: 16px;
}

.girando {
  animation: girar 1s linear infinite;
}

@keyframes girar {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Abas */
.painel-abas {
  display: flex;
  padding: 8px 12px;
  gap: 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(15, 23, 42, 0.6);
}

.aba-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 9999px;
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 0.78rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.aba-btn:hover {
  color: #f1f5f9;
  background: rgba(255, 255, 255, 0.05);
}

.aba-btn--ativa {
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
  font-weight: 600;
}

.dot-aba {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.dot--bronze { background: #38bdf8; }
.dot--silver { background: #34d399; }
.dot--gold { background: #fbbf24; }

.aba-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 16px;
  padding: 0 5px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.15);
  font-size: 0.68rem;
  font-weight: 700;
}
.aba-badge--bronze { background: rgba(56, 189, 248, 0.2); color: #38bdf8; }
.aba-badge--silver { background: rgba(52, 211, 153, 0.2); color: #34d399; }
.aba-badge--gold { background: rgba(251, 191, 36, 0.2); color: #fbbf24; }

/* Conteúdo */
.painel-conteudo {
  padding: 14px 16px;
  max-height: 400px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.painel-conteudo::-webkit-scrollbar {
  width: 5px;
}
.painel-conteudo::-webkit-scrollbar-track {
  background: transparent;
}
.painel-conteudo::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 4px;
}

/* Estado Vazio */
.painel-vazio {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  text-align: center;
  color: #64748b;
}

.icone-vazio {
  width: 32px;
  height: 32px;
  margin-bottom: 8px;
  opacity: 0.7;
}

.vazio-titulo {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 600;
  color: #94a3b8;
}

.vazio-sub {
  margin-top: 4px;
  font-size: 0.75rem;
}

/* Divisores de Seção */
.secao-divider {
  margin-top: 4px;
  display: flex;
  align-items: center;
}

.secao-tag {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  padding: 2px 8px;
  border-radius: 4px;
}
.tag--bronze { background: rgba(56, 189, 248, 0.12); color: #38bdf8; }
.tag--silver { background: rgba(52, 211, 153, 0.12); color: #34d399; }
.tag--gold { background: rgba(251, 191, 36, 0.12); color: #fbbf24; }

/* Cards de Tarefas */
.card-tarefa {
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  padding: 12px;
  transition: all 0.2s ease;
}

.card-tarefa--executando {
  border-color: rgba(56, 189, 248, 0.3);
  background: rgba(30, 41, 59, 0.85);
}

.card-tarefa-topo {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.tarefa-info {
  display: flex;
  flex-direction: column;
}

.tarefa-nome {
  font-size: 0.85rem;
  font-weight: 600;
  color: #f1f5f9;
}

.tarefa-fase {
  font-size: 0.72rem;
  color: #94a3b8;
  margin-top: 2px;
}

.tarefa-percentual {
  font-size: 0.85rem;
  font-weight: 700;
  color: #f8fafc;
}

/* Trilho e Barra de Progresso */
.trilho-progresso {
  height: 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 9999px;
  margin: 10px 0 8px 0;
  overflow: hidden;
}

.barra-preenchimento {
  height: 100%;
  border-radius: 9999px;
  transition: width 0.4s ease;
}

.barra--bronze {
  background: linear-gradient(90deg, #0284c7, #38bdf8);
}

.barra--silver {
  background: linear-gradient(90deg, #059669, #34d399);
}

.barra--gold {
  background: linear-gradient(90deg, #d97706, #fbbf24);
}

/* Rodapé do Card */
.card-tarefa-rodape {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 4px;
}

.tarefa-detalhe {
  font-size: 0.72rem;
  color: #94a3b8;
}

.botoes-atalho-grupo {
  display: flex;
  gap: 6px;
}

.btn-atalho-tarefa {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  color: #cbd5e1;
  font-size: 0.72rem;
  font-weight: 500;
  padding: 3px 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-atalho-tarefa:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
  border-color: rgba(255, 255, 255, 0.25);
}

.btn-atalho--alerta {
  border-color: rgba(248, 113, 113, 0.3);
  color: #f87171;
}

.btn-atalho--alerta:hover {
  background: rgba(239, 68, 68, 0.15);
  border-color: #ef4444;
  color: #fca5a5;
}

/* Grid de Camadas Gold */
.grid-camadas-gold {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
  margin: 8px 0;
  padding: 6px;
  background: rgba(15, 23, 42, 0.4);
  border-radius: 6px;
}

.item-camada-mapa {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.68rem;
  padding: 2px 4px;
}

.camada-nome {
  color: #94a3b8;
}

.camada-badge {
  font-size: 0.65rem;
  font-weight: 600;
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.08);
  color: #94a3b8;
}

.badge--concluida {
  background: rgba(52, 211, 153, 0.2);
  color: #34d399;
}

.badge--andamento {
  background: rgba(251, 191, 36, 0.2);
  color: #fbbf24;
}

/* Transições Vue */
.painel-slide-enter-active,
.painel-slide-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.painel-slide-enter-from,
.painel-slide-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.96);
}
</style>
