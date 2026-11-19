<script setup>
/**
 * Tela de Conjunto de Dados — compara, por lote, o mesmo registro nas camadas Bronze,
 * Silver e Quarentena. Sempre mostra o último lote da fonte que chegou na Silver
 * (status PROMOVIDO_SILVER), direto ou via liberação manual — não distingue os dois
 * casos, o status final é o mesmo.
 *
 * Tela nova e isolada — não reaproveita nada de QuarentenaView.vue/ConjuntosView.vue de
 * propósito, só a mesma ideia visual (cards, tabela, badges).
 */
import { ref, computed, watch, onMounted } from 'vue'
import { apiFetch } from '../services/http'
import { useRoute, useRouter } from 'vue-router'
import {
  buscarUltimoLote,
  buscarBronze,
  buscarSilver,
  buscarQuarentenaDoLote,
  buscarNaListaPorRegistroBruto,
  buscarRegistroBronzePorId,
  buscarRegistroSilverPorId,
} from '../services/conjuntosDadosService'
import ModalVisualizarGeometria from './ModalVisualizarGeometria.vue'
import ModalRegistroCamada from './ModalRegistroCamada.vue'
import ModalComparacaoCamadas from './ModalComparacaoCamadas.vue'
import ModalComparacaoLotes from './ModalComparacaoLotes.vue'
import { temPermissao } from '../auth/autenticacao'
import { PERMISSOES } from '../auth/permissoes'

const route = useRoute()
const router = useRouter()
const fonteId = route.params.fonteId

const TAMANHO_PAGINA = 25

const CAMADAS = [
  { valor: 'BRONZE', rotulo: 'Bronze' },
  { valor: 'SILVER', rotulo: 'Silver' },
  { valor: 'QUARENTENA', rotulo: 'Quarentena' },
]

const QUARENTENA_ROTULOS = {
  chaveIdentificacao: 'Identificação',
  tipoErroDescricao: 'Tipo de erro',
  campoProblema: 'Campo com problema',
  valorRecebido: 'Valor recebido',
  motivoRejeicao: 'Motivo da rejeição',
  statusAnaliseDescricao: 'Status',
  dataQuarentena: 'Data da quarentena',
}

const carregandoInicial = ref(true)
const erroInicial = ref(null)
const loteResumo = ref(null)

const camadaAtiva = ref('BRONZE')
const pagina = ref(0)
const total = ref(0)
const itensAtuais = ref([])
const carregandoTabela = ref(false)
const erroTabela = ref(null)

// --- ESTADOS DO PAINEL DE PESQUISA (DUAS CAIXAS - TASK LIZARDS-40) ---
const painelFiltrosAberto = ref(true)
const filtroId = ref('')
const termoBusca = ref('')

function limparFiltros() {
  filtroId.value = ''
  termoBusca.value = ''
}

function voltar() {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push('/fontes')
  }
}

// Filtro direcionado: Caixa 'ID' busca estritamente na 1ª coluna da esquerda
const itensFiltrados = computed(() => {
  if (!itensAtuais.value || !Array.isArray(itensAtuais.value)) {
    return []
  }

  const idProcurado = filtroId.value.toLowerCase().trim()
  const termoProcurado = termoBusca.value.toLowerCase().trim()

  if (!idProcurado && !termoProcurado) {
    return itensAtuais.value
  }

  return itensAtuais.value.filter((item) => {
    const dadosLinha = item.dados || item
    const entradas = Object.entries(dadosLinha)

    // 1. Valida a caixa ID: Pega rigorosamente a PRIMEIRA coluna da esquerda (posição 0)
    let bateuId = true
    if (idProcurado && entradas.length > 0) {
      const [primeiraChave, primeiroValor] = entradas[0]
      if (primeiroValor === null || primeiroValor === undefined) {
        bateuId = false
      } else {
        bateuId = String(primeiroValor).toLowerCase().includes(idProcurado)
      }
    }

    // 2. Valida a caixa Nome: Varre as demais colunas por correspondência de texto
    let bateuNome = true
    if (termoProcurado) {
      bateuNome = Object.values(dadosLinha).some((valor) => {
        if (valor === null || valor === undefined) return false
        return String(valor).toLowerCase().includes(termoProcurado)
      })
    }

    return bateuId && bateuNome
  })
})

// --- LÓGICA DE FILTRAGEM E PAGINAÇÃO RÍGIDA (TASK LIZARDS-40) ---

// Monitora a digitação e alterna entre o modo de busca total e o modo paginado (25 por página)
watch([filtroId, termoBusca], async ([novoId, novoTermo]) => {
  pagina.value = 0
  const idLimpo = (novoId || '').trim()
  const termoLimpo = (novoTermo || '').trim()

  if (idLimpo !== '' || termoLimpo !== '') {
    // Se digitou algo: carrega o lote completo para encontrar em qualquer página
    await carregarTodosOsRegistrosDoLote()
  } else {
    // Se está em branco: RESTAURA rigorosamente a busca paginada de 25 registros do servidor
    await carregarPaginaAtual()
  }
})

// Bate o martelo em exatamente quais 25 registros devem ir para a tabela
const itensExibidos = computed(() => {
  const temFiltroAtivo = filtroId.value.trim() !== '' || termoBusca.value.trim() !== ''

  // 1. SEM FILTRO: Limita ESTRITAMENTE aos 25 registros da página atual do servidor
  if (!temFiltroAtivo) {
    return (itensAtuais.value || []).slice(0, TAMANHO_PAGINA)
  }

  // 2. COM FILTRO DIGITADO: Fatia a lista filtrada em blocos de 25 por página
  const inicio = pagina.value * TAMANHO_PAGINA
  return itensFiltrados.value.slice(inicio, inicio + TAMANHO_PAGINA)
})

// Calcula o total exato de páginas para a barra de navegação
const totalPaginasCalculado = computed(() => {
  const temFiltroAtivo = filtroId.value.trim() !== '' || termoBusca.value.trim() !== ''
  const totalRegistros = temFiltroAtivo ? itensFiltrados.value.length : total.value
  return Math.max(1, Math.ceil(totalRegistros / TAMANHO_PAGINA))
})

async function carregarTodosOsRegistrosDoLote() {
  if (!loteResumo.value) return
  carregandoTabela.value = true
  erroTabela.value = null
  try {
    const totalDoLote = loteResumo.value.quantidadeRegistros || 1000
    if (camadaAtiva.value === 'BRONZE') {
      const resultado = await buscarBronze(loteResumo.value.loteId, 0, totalDoLote)
      itensAtuais.value = resultado.itens
      total.value = resultado.total
    } else if (camadaAtiva.value === 'SILVER') {
      const resultado = await buscarSilver(loteResumo.value.loteId, 0, totalDoLote)
      itensAtuais.value = resultado.itens
      total.value = resultado.total
    } else {
      await garantirQuarentenaCarregada()
      total.value = quarentenaItensBrutos.value.length
      itensAtuais.value = quarentenaItensBrutos.value.map((item) => ({
        registroBrutoId: item.registroBrutoId,
        temGeometria: false,
        geometriaWkt: null,
        dados: normalizarItemQuarentena(item),
      }))
    }
  } catch (e) {
    erroTabela.value = e.message
  } finally {
    carregandoTabela.value = false
  }
}

const quarentenaItensBrutos = ref([])
const quarentenaCarregada = ref(false)

const modalGeometria = ref(null) // { titulo, wkt }
const modalRegistro = ref(null) // { titulo, dados, mensagemVazio }
const modalComparacao = ref(null) // { registroBrutoId, parInicial }
const modalComparacaoLotes = ref(false)

const totalPaginas = computed(() => Math.max(1, Math.ceil(total.value / TAMANHO_PAGINA)))

const colunasDinamicas = computed(() => {
  const chaves = new Set()
  for (const item of itensAtuais.value) {
    Object.keys(item.dados || {}).forEach((chave) => chaves.add(chave))
  }
  return Array.from(chaves)
})

// A aba Quarentena le /api/quarentena: so aparece pra quem tem quarentena:visualizar.
// O Analista ve Bronze e Silver; o Operador e o Auditor veem as tres (LIZARDS-46).
const camadasPermitidas = CAMADAS.filter(
  (c) => c.valor !== 'QUARENTENA' || temPermissao(PERMISSOES.QUARENTENA_VISUALIZAR),
)
const outrasCamadas = computed(() => camadasPermitidas.map((c) => c.valor).filter((v) => v !== camadaAtiva.value))

function normalizarItemQuarentena(item) {
  const dados = {}
  for (const [chave, rotulo] of Object.entries(QUARENTENA_ROTULOS)) {
    dados[rotulo] = item[chave] ?? '—'
  }
  return dados
}

async function garantirQuarentenaCarregada() {
  if (quarentenaCarregada.value) return
  const resposta = await buscarQuarentenaDoLote(loteResumo.value.loteId)
  quarentenaItensBrutos.value = resposta
  quarentenaCarregada.value = true
}

async function carregarPaginaAtual() {
  if (!loteResumo.value) return
  carregandoTabela.value = true
  erroTabela.value = null
  try {
    if (camadaAtiva.value === 'BRONZE') {
      const resultado = await buscarBronze(loteResumo.value.loteId, pagina.value, TAMANHO_PAGINA)
      itensAtuais.value = resultado.itens
      total.value = resultado.total
    } else if (camadaAtiva.value === 'SILVER') {
      const resultado = await buscarSilver(loteResumo.value.loteId, pagina.value, TAMANHO_PAGINA)
      itensAtuais.value = resultado.itens
      total.value = resultado.total
    } else {
      await garantirQuarentenaCarregada()
      total.value = quarentenaItensBrutos.value.length
      const inicio = pagina.value * TAMANHO_PAGINA
      itensAtuais.value = quarentenaItensBrutos.value
        .slice(inicio, inicio + TAMANHO_PAGINA)
        .map((item) => ({
          registroBrutoId: item.registroBrutoId,
          temGeometria: false,
          geometriaWkt: null,
          dados: normalizarItemQuarentena(item),
        }))
    }
  } catch (e) {
    erroTabela.value = e.message
  } finally {
    carregandoTabela.value = false
  }
}

const idCopiadoRecentemente = ref(null)

async function copiarPayload(registro) {
  try {
    await navigator.clipboard.writeText(JSON.stringify(registro.dados, null, 2))
    idCopiadoRecentemente.value = registro.registroBrutoId
    setTimeout(() => {
      if (idCopiadoRecentemente.value === registro.registroBrutoId) idCopiadoRecentemente.value = null
    }, 1500)
  } catch (e) {
    erroTabela.value = 'Não foi possível copiar: ' + e.message
  }
}

function trocarCamada(valor) {
  if (camadaAtiva.value === valor) return
  camadaAtiva.value = valor
  pagina.value = 0
  carregarPaginaAtual()
}

function irParaPagina(novaPagina) {
  if (novaPagina < 0 || novaPagina >= totalPaginas.value) return
  pagina.value = novaPagina
  carregarPaginaAtual()
}

function verGeometria(registro) {
  modalGeometria.value = {
    titulo: `Geometria — registro #${registro.registroBrutoId}`,
    wkt: registro.geometriaWkt,
  }
}

async function verEmCamada(registro, camadaDestino) {
  const rotuloCamada = CAMADAS.find((c) => c.valor === camadaDestino)?.rotulo || camadaDestino
  const titulo = `Registro #${registro.registroBrutoId} — ${rotuloCamada}`
  try {
    if (camadaDestino === 'BRONZE') {
      const resultado = await buscarRegistroBronzePorId(registro.registroBrutoId)
      modalRegistro.value = { titulo, dados: resultado.dados, mensagemVazio: null }
    } else if (camadaDestino === 'SILVER') {
      const resultado = await buscarRegistroSilverPorId(registro.registroBrutoId)
      modalRegistro.value = {
        titulo,
        dados: resultado?.dados || null,
        mensagemVazio: 'Este registro não chegou a virar uma linha na Silver (pode ter perdido uma deduplicação dentro do próprio lote).',
      }
    } else {
      await garantirQuarentenaCarregada()
      const item = buscarNaListaPorRegistroBruto(quarentenaItensBrutos.value, registro.registroBrutoId)
      modalRegistro.value = {
        titulo,
        dados: item ? normalizarItemQuarentena(item) : null,
        mensagemVazio: 'Este registro não foi para a Quarentena — passou direto pela validação.',
      }
    }
  } catch (e) {
    modalRegistro.value = { titulo, dados: null, mensagemVazio: e.message }
  }
}

// Quarentena não tem comparação: o registro rejeitado não existe na Silver nem na Gold.
function compararRegistro(registro) {
  modalComparacao.value = {
    registroBrutoId: registro.registroBrutoId,
    parInicial: camadaAtiva.value === 'SILVER' ? 'SILVER_GOLD' : 'BRONZE_SILVER',
  }
}

function rotuloCamada(valor) {
  return CAMADAS.find((c) => c.valor === valor)?.rotulo || valor
}

function formatarData(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR')
}

onMounted(async () => {
  try {
    const [fonteResp, loteResp] = await Promise.all([
      apiFetch(`/api/fontes/${fonteId}`).then((r) => (r.ok ? r.json() : null)),
      buscarUltimoLote(fonteId),
    ])
    loteResumo.value = { ...loteResp, fonteDadoNomeExibicao: fonteResp?.nome || loteResp.fonteDadoNome }
    await carregarPaginaAtual()
  } catch (e) {
    erroInicial.value = e.message
  } finally {
    carregandoInicial.value = false
  }
})
</script>

<template>
  <div class="pagina-conjunto-dados">
    <header class="topo-pagina">
      <div class="topo-titulo-linha">
        <button 
          type="button" 
          class="btn-voltar" 
          title="Voltar para o Cadastro de Fontes" 
          @click="voltar"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" class="icone-voltar">
            <path d="M19 12H5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M12 19l-7-7 7-7" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Voltar
        </button>
        <p class="etiqueta">CONJUNTO DE DADOS</p>
      </div>

      <div class="linha-titulo-comparar">
        <h1 class="titulo">{{ loteResumo?.fonteDadoNomeExibicao || 'Carregando…' }}</h1>
        <button
          v-if="loteResumo"
          class="botao-comparar-lotes"
          title="Comparar com o lote anterior (diff entre lotes)"
          @click="modalComparacaoLotes = true"
        >
          ⇄ Comparar lotes
        </button>
      </div>
      <p v-if="loteResumo" class="subtitulo">
        Lote #{{ loteResumo.loteId }} — {{ loteResumo.quantidadeRegistros }} registros —
        promovido em {{ formatarData(loteResumo.dataExecucao) }}
      </p>
    </header>

    <div v-if="carregandoInicial" class="estado-carregando">
      <div class="spinner-grande"></div>
      <span>Carregando…</span>
    </div>

    <div v-else-if="erroInicial" class="estado-vazio estado-vazio--erro">
      <p>{{ erroInicial }}</p>
    </div>

    <template v-else>
      <div class="seletor-camadas">
        <button
          v-for="camada in camadasPermitidas"
          :key="camada.valor"
          class="botao-camada"
          :class="{ 'botao-camada--ativo': camadaAtiva === camada.valor }"
          @click="trocarCamada(camada.valor)"
        >
          {{ camada.rotulo }}
        </button>
      </div>

<!-- PAINEL DE PESQUISA COM DUAS CAIXAS (TASK LIZARDS-40) -->
<section class="card-pesquisa">
  <div class="header-pesquisa">
    <h3>Pesquisa no Conjunto de Dados</h3>
    <button 
      type="button" 
      class="btn-recolher" 
      @click="painelFiltrosAberto = !painelFiltrosAberto"
    >
      {{ painelFiltrosAberto ? 'Recolher ▲' : 'Expandir ▼' }}
    </button>
  </div>

  <div v-show="painelFiltrosAberto" class="corpo-filtros">
    <!-- Caixinha 1: Apenas ID -->
    <div class="grupo-campo busca-id">
      <label for="filtro-id">ID:</label>
      <input
        id="filtro-id"
        v-model="filtroId"
        type="text"
        class="input-texto"
        placeholder="Ex: 1, 2, 3..."
      />
    </div>

    <!-- Caixinha 2: Nome -->
    <div class="grupo-campo busca-ampla">
      <label for="filtro-termo">Nome:</label>
      <input
        id="filtro-termo"
        v-model="termoBusca"
        type="text"
        class="input-texto"
        placeholder="Ex: Amazônia, Peabiru, Nova Olímpia..."
      />
    </div>

    <!-- Botão de Limpar -->
    <div v-if="filtroId || termoBusca" class="grupo-campo acoes">
      <button type="button" class="btn-limpar" @click="limparFiltros">
        Limpar Filtros
      </button>
    </div>
  </div>
</section>

      <section class="cartao">
        <div v-if="carregandoTabela" class="estado-carregando">
          <div class="spinner-grande"></div>
          <span>Carregando {{ rotuloCamada(camadaAtiva) }}…</span>
        </div>

        <div v-else-if="erroTabela" class="estado-vazio estado-vazio--erro">{{ erroTabela }}</div>

        <div v-else-if="!itensFiltrados.length" class="estado-vazio">
          Nenhum registro encontrado na camada {{ rotuloCamada(camadaAtiva) }} para os parâmetros informados.
        </div>

        <div v-else class="tabela-responsiva-wrapper">
          <table class="tabela-dados">
            <thead>
              <tr>
                <th v-for="coluna in colunasDinamicas" :key="coluna">{{ coluna }}</th>
                <th class="col-acoes-titulo">Ações</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in itensExibidos" :key="item.registroBrutoId">
                <td v-for="coluna in colunasDinamicas" :key="coluna">
                  {{ item.dados?.[coluna] === null || item.dados?.[coluna] === undefined ? '—' : item.dados[coluna] }}
                </td>
                <td class="celula-acoes">
                  <div class="grupo-botoes-linha">
                    <button
                      class="botao-icone"
                      title="Copiar payload (JSON)"
                      @click="copiarPayload(item)"
                    >
                      {{ idCopiadoRecentemente === item.registroBrutoId ? '✓ Copiado' : 'Copiar' }}
                    </button>
                    <button
                      v-if="item.temGeometria"
                      class="botao-icone"
                      title="Ver geometria"
                      @click="verGeometria(item)"
                    >
                      Mapa
                    </button>
                    <button
                      v-if="camadaAtiva !== 'QUARENTENA'"
                      class="botao-icone botao-icone--comparar"
                      title="Comparar com a camada vizinha (Bronze → Silver → Gold)"
                      @click="compararRegistro(item)"
                    >
                      Comparar
                    </button>
                    <button
                      v-for="destino in outrasCamadas"
                      :key="destino"
                      class="botao-icone botao-icone--texto"
                      :title="'Ver na ' + rotuloCamada(destino)"
                      @click="verEmCamada(item, destino)"
                    >
                      {{ rotuloCamada(destino) }}
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="itensFiltrados.length" class="controles-paginacao">
  <button :disabled="pagina === 0" @click="irParaPagina(pagina - 1)">← Anterior</button>
  <span>
    Página {{ pagina + 1 }} de {{ totalPaginasCalculado }} 
    ({{ (filtroId || termoBusca) ? itensFiltrados.length : total }} registros)
  </span>
  <button :disabled="pagina + 1 >= totalPaginasCalculado" @click="irParaPagina(pagina + 1)">Próxima →</button>
</div>
      </section>
    </template>

    <ModalVisualizarGeometria
      v-if="modalGeometria"
      :titulo="modalGeometria.titulo"
      :wkt="modalGeometria.wkt"
      @fechar="modalGeometria = null"
    />

    <ModalRegistroCamada
      v-if="modalRegistro"
      :titulo="modalRegistro.titulo"
      :dados="modalRegistro.dados"
      :mensagem-vazio="modalRegistro.mensagemVazio || undefined"
      @fechar="modalRegistro = null"
    />

    <ModalComparacaoCamadas
      v-if="modalComparacao"
      :registro-bruto-id="modalComparacao.registroBrutoId"
      :par-inicial="modalComparacao.parInicial"
      @fechar="modalComparacao = null"
    />

    <ModalComparacaoLotes
      v-if="modalComparacaoLotes"
      :fonte-dado-id="Number(fonteId)"
      :fonte-dado-nome="loteResumo?.fonteDadoNomeExibicao || ''"
      @fechar="modalComparacaoLotes = false"
    />
  </div>
</template>

<style scoped src="../styles/views/ConjuntosDadosView.css"></style>
