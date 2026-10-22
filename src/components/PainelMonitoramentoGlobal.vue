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

/* Pílula Minimizada (Estilo DataGIS - Clean White & Agroambiental) */
.pill-minimizada {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 42px;
  padding: 0 16px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 9999px;
  color: #1e293b;
  font-size: 0.84rem;
  font-weight: 600;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08), 0 1px 3px rgba(15, 23, 42, 0.05);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  user-select: none;
}

.pill-minimizada:hover {
  background: #f8fafc;
  border-color: #94a3b8;
  transform: translateY(-2px);
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.12);
}

.pill--ativa {
  border-color: #86efac;
  background: #ffffff;
  box-shadow: 0 4px 14px rgba(22, 163, 74, 0.15), 0 0 0 3px rgba(34, 197, 94, 0.12);
}

.pill--ativa:hover {
  border-color: #4ade80;
  box-shadow: 0 8px 20px rgba(22, 163, 74, 0.2), 0 0 0 3px rgba(34, 197, 94, 0.15);
}

.pill-icone-status {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #15803d;
}

.pill--ativa .pill-icone-status {
  color: #16a34a;
}

.pulso-ativo {
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: #22c55e;
  opacity: 0.5;
  animation: pulso-onda 2s infinite;
}

@keyframes pulso-onda {
  0% { transform: scale(1); opacity: 0.7; }
  100% { transform: scale(2.2); opacity: 0; }
}

.icone-pill {
  width: 17px;
  height: 17px;
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
  background: #15803d;
  color: #ffffff;
  font-size: 0.72rem;
  font-weight: 700;
  border-radius: 9999px;
}

.icone-chevron {
  width: 15px;
  height: 15px;
  color: #64748b;
  transition: transform 0.2s ease;
}

.pill-minimizada:hover .icone-chevron {
  color: #0f172a;
}

/* Card Expandido (Estilo DataGIS - Padrão Modal e Containers Brancos) */
.painel-card {
  width: 400px;
  max-width: calc(100vw - 32px);
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  box-shadow: 0 20px 25px -5px rgba(15, 23, 42, 0.12), 0 10px 10px -5px rgba(15, 23, 42, 0.04), 0 0 0 1px rgba(15, 23, 42, 0.03);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.painel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
}

.painel-titulo-wrapper {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ponto-status-topo {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #94a3b8;
}

.ponto-status-topo.ponto-ativo {
  background: #16a34a;
  box-shadow: 0 0 0 3px #dcfce7;
}

.painel-titulo {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 700;
  color: #0f172a;
}

.painel-subtitulo {
  margin: 1px 0 0 0;
  font-size: 0.73rem;
  color: #64748b;
}

.painel-acoes-topo {
  display: flex;
  gap: 4px;
}

.btn-icone-painel {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: transparent;
  border: 1px solid transparent;
  color: #64748b;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-icone-painel:hover {
  background: #f1f5f9;
  color: #0f172a;
  border-color: #e2e8f0;
}

.btn-icone-painel svg {
  width: 15px;
  height: 15px;
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
  padding: 6px 12px;
  gap: 4px;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
}

.aba-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 11px;
  border-radius: 6px;
  background: transparent;
  border: 1px solid transparent;
  color: #64748b;
  font-size: 0.77rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.aba-btn:hover {
  color: #1e293b;
  background: #f1f5f9;
}

.aba-btn--ativa {
  background: #ffffff;
  color: #0f172a;
  border-color: #cbd5e1;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
}

.dot-aba {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.dot--bronze { background: #d97706; }
.dot--silver { background: #7c3aed; }
.dot--gold { background: #15803d; }

.aba-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 16px;
  padding: 0 5px;
  border-radius: 9999px;
  background: #f1f5f9;
  color: #475569;
  font-size: 0.68rem;
  font-weight: 700;
}
.aba-badge--bronze { background: #fef3c7; color: #92400e; }
.aba-badge--silver { background: #ede9fe; color: #5b21b6; }
.aba-badge--gold { background: #dcfce7; color: #166534; }

/* Conteúdo */
.painel-conteudo {
  padding: 14px 16px;
  max-height: 390px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: #ffffff;
}

.painel-conteudo::-webkit-scrollbar {
  width: 6px;
}
.painel-conteudo::-webkit-scrollbar-track {
  background: #f8fafc;
}
.painel-conteudo::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}
.painel-conteudo::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

/* Estado Vazio */
.painel-vazio {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 36px 16px;
  text-align: center;
}

.icone-vazio {
  width: 34px;
  height: 34px;
  margin-bottom: 8px;
  color: #94a3b8;
}

.vazio-titulo {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 700;
  color: #334155;
}

.vazio-sub {
  margin-top: 3px;
  font-size: 0.76rem;
  color: #64748b;
}

/* Divisores de Seção */
.secao-divider {
  margin-top: 2px;
  display: flex;
  align-items: center;
}

.secao-tag {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 2px 7px;
  border-radius: 4px;
}
.tag--bronze { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
.tag--silver { background: #ede9fe; color: #5b21b6; border: 1px solid #ddd6fe; }
.tag--gold { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }

/* Cards de Tarefas */
.card-tarefa {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px 14px;
  transition: all 0.15s ease;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.03);
}

.card-tarefa:hover {
  border-color: #cbd5e1;
  box-shadow: 0 4px 6px -1px rgba(15, 23, 42, 0.06);
}

.card-tarefa--executando {
  border-color: #86efac;
  background: #f0fdf4;
  box-shadow: 0 2px 8px rgba(22, 163, 74, 0.08);
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
  font-size: 0.84rem;
  font-weight: 700;
  color: #0f172a;
}

.tarefa-fase {
  font-size: 0.73rem;
  color: #64748b;
  margin-top: 2px;
}

.tarefa-percentual {
  font-size: 0.84rem;
  font-weight: 700;
  color: #15803d;
}

/* Trilho e Barra de Progresso */
.trilho-progresso {
  height: 6px;
  background: #e2e8f0;
  border-radius: 9999px;
  margin: 9px 0 8px 0;
  overflow: hidden;
}

.barra-preenchimento {
  height: 100%;
  border-radius: 9999px;
  transition: width 0.4s ease;
}

.barra--bronze {
  background: linear-gradient(90deg, #d97706, #f59e0b);
}

.barra--silver {
  background: linear-gradient(90deg, #7c3aed, #a855f7);
}

.barra--gold {
  background: linear-gradient(90deg, #15803d, #22c55e);
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
  font-size: 0.73rem;
  color: #64748b;
}

.botoes-atalho-grupo {
  display: flex;
  gap: 6px;
}

.btn-atalho-tarefa {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  color: #15803d;
  font-size: 0.73rem;
  font-weight: 600;
  padding: 3px 9px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-atalho-tarefa:hover {
  background: #f0fdf4;
  border-color: #15803d;
  color: #166534;
}

.btn-atalho--alerta {
  border-color: #fecaca;
  color: #b91c1c;
  background: #fef2f2;
}

.btn-atalho--alerta:hover {
  background: #fee2e2;
  border-color: #ef4444;
  color: #991b1b;
}

/* Grid de Camadas Gold */
.grid-camadas-gold {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
  margin: 8px 0;
  padding: 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.item-camada-mapa {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.70rem;
  padding: 2px 4px;
}

.camada-nome {
  color: #334155;
  font-weight: 500;
}

.camada-badge {
  font-size: 0.66rem;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  background: #f1f5f9;
  color: #64748b;
  border: 1px solid #e2e8f0;
}

.badge--concluida {
  background: #dcfce7;
  color: #166534;
  border-color: #bbf7d0;
}

.badge--andamento {
  background: #fef3c7;
  color: #92400e;
  border-color: #fde68a;
}

/* Transições Vue */
.painel-slide-enter-active,
.painel-slide-leave-active {
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.painel-slide-enter-from,
.painel-slide-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.97);
}
</style>
