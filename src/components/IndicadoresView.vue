<script setup>
/**
 * Consulta dos dados finais em tabela (LIZARDS-34).
 *
 * Duas abas sobre o mesmo dado da camada Gold: por município (indicadores em média
 * ponderada pela área, calculada no banco) e por imóvel (uma linha por imóvel publicado).
 * Somente leitura.
 *
 * Clicar numa linha abre o detalhe EM BAIXO DELA, dentro da própria tabela. Um painel
 * fixo no fim da página obrigaria a rolar até o fim para descobrir que ele existe — e
 * informação que exige rolagem para ser descoberta, na prática, não existe.
 *
 * O detalhe exibe exatamente os valores que o backend devolveu — não há agregação nova
 * aqui. Juntar médias municipais no navegador daria número diferente do backend, porque
 * cada média tem denominador próprio (a área só dos imóveis que têm aquele indicador).
 *
 * As faixas de cor vêm de `GET /api/indicadores/tipos`, que entrega `dimensao`,
 * `sentido`, `limiteBom` e `limiteAtencao`. Mudar um limite é um UPDATE no banco. O
 * `sentido` existe porque IAE, IDESMAT e IFC são indicadores em que menos é melhor —
 * sem ele o pior resultado seria pintado de verde.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { temPermissao } from '../auth/autenticacao'
import { PERMISSOES } from '../auth/permissoes'
import { listarTiposIndicador } from '../services/goldService'
import {
  listarIndicadoresPorImovel,
  listarIndicadoresPorMunicipio,
} from '../services/consultaIndicadoresService'

const TAMANHO_PAGINA = 50
const route = useRoute()
const router = useRouter()
// A tabela não tem item de menu: abre pelo "Ver em tabela" do mapa (LIZARDS-35) e este botão volta
const podeVerMapa = temPermissao(PERMISSOES.CONJUNTO_VISUALIZAR)

const ORDEM_DIMENSOES = ['CONSERVACAO', 'TERRITORIAL', 'AMBIENTAL']
const ROTULO_DIMENSAO = {
  CONSERVACAO: 'Conservação',
  TERRITORIAL: 'Territorial',
  AMBIENTAL: 'Ambiental',
  SEM_DIMENSAO: 'Outros',
}

const visao = ref('municipio')
const tipos = ref([])
const municipios = ref([])
const imoveis = ref(null) // null = ainda não carregado (só busca ao abrir a aba)
const busca = ref('')
const filtroMunicipioCod = ref('')
const pagina = ref(0)
const carregando = ref(false)
const erro = ref('')
const codigoCopiado = ref('')

/** Linha aberta na sanfona: { tipo: 'municipio' | 'imovel', dado } */
const selecionado = ref({ tipo: 'municipio', dado: null })
const abaDimensao = ref('TODAS')

// ---------------------------------------------------------------- carregamento

async function carregarInicial() {
  carregando.value = true
  erro.value = ''
  try {
    const [listaTipos, listaMunicipios] = await Promise.all([
      listarTiposIndicador(),
      listarIndicadoresPorMunicipio(),
    ])
    tipos.value = listaTipos
    municipios.value = listaMunicipios
    // Tudo fechado: um detalhe já aberto empurraria os municípios seguintes para fora da
    // tela, escondendo justamente a lista que esta aba existe para mostrar.
    selecionado.value = { tipo: 'municipio', dado: null }
  } catch (e) {
    erro.value = e.message
  } finally {
    carregando.value = false
  }
}

async function carregarImoveis() {
  carregando.value = true
  erro.value = ''
  try {
    imoveis.value = await listarIndicadoresPorImovel()
  } catch (e) {
    erro.value = e.message
  } finally {
    carregando.value = false
  }
}

async function atualizar() {
  imoveis.value = null
  filtroMunicipioCod.value = ''
  busca.value = ''
  await carregarInicial()
  if (visao.value === 'imovel') await carregarImoveis()
}

function trocarVisao(nova) {
  if (visao.value === nova) return
  visao.value = nova
  busca.value = ''
  if (nova === 'municipio') filtroMunicipioCod.value = ''
  selecionado.value = { tipo: nova, dado: null }
}

/** Clique na linha abre o detalhe; clicar de novo na mesma linha fecha. */
function selecionar(linha) {
  if (estaSelecionada(linha)) {
    selecionado.value = { tipo: visao.value, dado: null }
    return
  }
  selecionado.value = { tipo: visao.value, dado: linha }
}

/** Botão do detalhe: vai para a aba de imóveis já filtrada no município aberto. */
function verImoveis() {
  const municipio = selecionado.value.dado
  if (!municipio) return
  visao.value = 'imovel'
  busca.value = ''
  filtroMunicipioCod.value = String(municipio.codIbge)
  selecionado.value = { tipo: 'imovel', dado: null }
}

watch(visao, async (nova) => {
  pagina.value = 0
  if (nova === 'imovel' && imoveis.value === null) await carregarImoveis()
})

watch([busca, filtroMunicipioCod], () => {
  pagina.value = 0
})

/**
 * Vindo do mapa (/conjuntos, LIZARDS-35) com ?municipio=<cod IBGE> ou
 * ?imovel=<código CAR>: a tela abre já filtrada e com o detalhe do item aberto.
 * Código que não existe na resposta é ignorado.
 */
async function abrirItemDaUrl() {
  const { municipio, imovel } = route?.query || {}
  if (imovel) {
    await carregarImoveis()
    const achado = (imoveis.value || []).find((i) => i.codImovel === imovel)
    if (!achado) return
    visao.value = 'imovel'
    busca.value = achado.codImovel
    selecionado.value = { tipo: 'imovel', dado: achado }
    return
  }
  if (municipio) {
    const achado = municipios.value.find((m) => String(m.codIbge) === String(municipio))
    if (!achado) return
    busca.value = achado.nome || String(achado.codIbge)
    selecionado.value = { tipo: 'municipio', dado: achado }
  }
}

/** Volta pro mapa no item aberto (município ou imóvel), ou no recorte inteiro. */
function verNoMapa() {
  const { tipo, dado } = selecionado.value
  let query = {}
  if (dado && tipo === 'imovel') query = { imovel: dado.codImovel }
  else if (dado && tipo === 'municipio') query = { municipio: String(dado.codIbge) }
  else if (visao.value === 'imovel' && filtroMunicipioCod.value) query = { municipio: filtroMunicipioCod.value }
  router?.push({ path: '/conjuntos', query })
}

onMounted(async () => {
  await carregarInicial()
  await abrirItemDaUrl()
})

// ------------------------------------------------------------------ indicadores

/** Código do indicador no catálogo → nome do campo na resposta (ICV → valorIcv). */
function campoDoIndicador(codigo) {
  return `valor${codigo.charAt(0).toUpperCase()}${codigo.slice(1).toLowerCase()}`
}

function indiceDimensao(chave) {
  const i = ORDEM_DIMENSOES.indexOf(chave)
  return i === -1 ? ORDEM_DIMENSOES.length : i
}

/** Indicadores ativos agrupados por dimensão, na ordem de exibição do catálogo. */
const dimensoes = computed(() => {
  const ativos = tipos.value
    .filter((t) => t.ativo !== false)
    .slice()
    .sort((a, b) => (a.ordemExibicao ?? 99) - (b.ordemExibicao ?? 99))

  const grupos = new Map()
  ativos.forEach((tipo) => {
    const chave = tipo.dimensao || 'SEM_DIMENSAO'
    if (!grupos.has(chave)) grupos.set(chave, [])
    grupos.get(chave).push(tipo)
  })

  return [...grupos.entries()]
    .sort(([a], [b]) => indiceDimensao(a) - indiceDimensao(b))
    .map(([chave, lista]) => ({
      chave,
      rotulo: ROTULO_DIMENSAO[chave] || chave,
      tipos: lista,
    }))
})

const colunas = computed(() => dimensoes.value.flatMap((d) => d.tipos))

/** Colunas fixas (identificação, município/imóveis, área) + uma por indicador. */
const totalColunas = computed(() => 3 + colunas.value.length)

const abasDoDetalhe = computed(() => [
  { chave: 'TODAS', rotulo: 'Todas' },
  ...dimensoes.value.map((d) => ({ chave: d.chave, rotulo: d.rotulo })),
])

/**
 * Faixa de cor de um valor. Sem valor devolve "neutro": célula vazia é diferente de
 * resultado ruim, e pintar de vermelho um indicador que simplesmente não foi calculado
 * seria mentir sobre o dado.
 */
function faixaDoValor(tipo, valor) {
  if (valor === null || valor === undefined) return 'neutro'
  if (tipo.limiteBom === null || tipo.limiteBom === undefined) return 'neutro'
  if (tipo.limiteAtencao === null || tipo.limiteAtencao === undefined) return 'neutro'

  if (tipo.sentido === 'MENOR_MELHOR') {
    if (valor <= tipo.limiteBom) return 'sucesso'
    return valor <= tipo.limiteAtencao ? 'alerta' : 'erro'
  }
  if (valor >= tipo.limiteBom) return 'sucesso'
  return valor >= tipo.limiteAtencao ? 'alerta' : 'erro'
}

function valorDaLinha(linha, tipo) {
  return linha[campoDoIndicador(tipo.codigo)]
}

function sentidoDoTipo(tipo) {
  return tipo.sentido === 'MENOR_MELHOR' ? 'menor é melhor' : 'maior é melhor'
}

function tituloDoIndicador(tipo) {
  const unidade = tipo.unidadeSimbolo ? `, em ${tipo.unidadeSimbolo}` : ''
  return `${tipo.codigo} — ${tipo.descricao || ''} (${sentidoDoTipo(tipo)}${unidade})`.replace(
    ' — (',
    ' (',
  )
}

/**
 * Escala da barra. Percentual tem teto natural em 100. Densidade não tem teto — o IFC é
 * focos de calor por mil hectares (pkg_calculo_ambiental, V045) —, então ali a barra
 * passa a medir a distância até o limite crítico, que é a leitura que de fato interessa:
 * barra cheia significa "chegou no limite".
 */
function escalaDaBarra(tipo) {
  if (tipo.unidade === 'DENSIDADE') return tipo.limiteAtencao || 0
  return 100
}

function posicaoNaEscala(valor, escala) {
  if (!escala || escala <= 0) return 0
  if (valor === null || valor === undefined) return 0
  const posicao = Math.min(Math.max((valor / escala) * 100, 0), 100)
  // Arredonda para não gerar largura do tipo 28.939999999999998% no HTML.
  return Math.round(posicao * 100) / 100
}

// --------------------------------------------------------------------- detalhe

const ehDetalheDeMunicipio = computed(() => selecionado.value.tipo === 'municipio')

const detalheTitulo = computed(() => {
  const d = selecionado.value.dado
  if (!d) return ''
  return ehDetalheDeMunicipio.value ? d.nome || `IBGE ${d.codIbge}` : d.codImovel
})

const detalheSubtitulo = computed(() => {
  const d = selecionado.value.dado
  if (!d) return ''
  if (ehDetalheDeMunicipio.value) {
    return `${formatarInteiro(d.qtdImoveis)} imóveis · ${formatarNumero(d.areaTotalHa)} ha · média ponderada pela área`
  }
  return `${d.municipioNome || 'Município não identificado'} · ${formatarNumero(d.areaHa)} ha`
})

/**
 * Valor complementar em hectares, só para IRL (déficit/excedente de RL frente ao
 * mínimo do bioma) e IAPP (passivo de APP a recuperar) — pág. 6 do slide oficial.
 */
function valorSecundario(tipo, linha) {
  if (tipo.codigo === 'IRL' && linha.valorIrlDeficitHa != null) {
    return {
      rotulo: linha.valorIrlDeficitHa < 0 ? 'Déficit' : 'Excedente',
      valor: Math.abs(linha.valorIrlDeficitHa),
    }
  }
  if (tipo.codigo === 'IAPP' && linha.valorIappPassivoHa != null) {
    return { rotulo: 'Passivo', valor: linha.valorIappPassivoHa }
  }
  return null
}

/** Grupos de barras: todas as dimensões, ou só a da aba escolhida. */
const gruposDoDetalhe = computed(() => {
  const d = selecionado.value.dado
  if (!d) return []

  const visiveis =
    abaDimensao.value === 'TODAS'
      ? dimensoes.value
      : dimensoes.value.filter((dim) => dim.chave === abaDimensao.value)

  return visiveis.map((dimensao) => ({
    chave: dimensao.chave,
    rotulo: dimensao.rotulo,
    barras: dimensao.tipos.map((tipo) => {
      const valor = valorDaLinha(d, tipo)
      const escala = escalaDaBarra(tipo)
      const ehDensidade = tipo.unidade === 'DENSIDADE'
      return {
        codigo: tipo.codigo,
        descricao: tipo.descricao || '',
        sentido: sentidoDoTipo(tipo),
        titulo: tituloDoIndicador(tipo),
        unidadeSimbolo: tipo.unidadeSimbolo || '',
        ehDensidade,
        valor,
        secundario: valorSecundario(tipo, d),
        faixa: faixaDoValor(tipo, valor),
        largura: posicaoNaEscala(valor, escala),
        marcaBom:
          tipo.limiteBom === null || tipo.limiteBom === undefined
            ? null
            : { posicao: posicaoNaEscala(tipo.limiteBom, escala), rotulo: tipo.limiteBom },
        // Em densidade a barra cheia já É o limite crítico: marcá-lo seria redundante.
        // Limites iguais (caso do IRL, em que conformidade legal é binária) desenham
        // uma marca só — duas no mesmo ponto sobreporiam os rótulos.
        marcaAtencao:
          ehDensidade ||
          tipo.limiteAtencao === null ||
          tipo.limiteAtencao === undefined ||
          tipo.limiteAtencao === tipo.limiteBom
            ? null
            : { posicao: posicaoNaEscala(tipo.limiteAtencao, escala), rotulo: tipo.limiteAtencao },
      }
    }),
  }))
})

const mostrarDivisorDeDimensao = computed(() => abaDimensao.value === 'TODAS')

function estaSelecionada(linha) {
  const d = selecionado.value.dado
  if (!d || selecionado.value.tipo !== visao.value) return false
  return visao.value === 'municipio' ? d.codIbge === linha.codIbge : d.codImovel === linha.codImovel
}

// ---------------------------------------------------------------------- formato

function normalizar(texto) {
  return (texto ?? '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

function formatarNumero(valor, casas = 2) {
  if (valor === null || valor === undefined) return '—'
  return valor.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })
}

function formatarInteiro(valor) {
  if (valor === null || valor === undefined) return '—'
  return valor.toLocaleString('pt-BR')
}

/**
 * O código do CAR tem 43 caracteres e começa com UF e código IBGE, que a coluna do lado
 * já mostra. Na linha da tabela fica só o final, que é o que distingue um imóvel do
 * outro; o detalhe aberto mostra o código inteiro, e a busca também usa o inteiro.
 */
function codigoCurto(codigo) {
  if (!codigo) return '—'
  return codigo.length > 8 ? `…${codigo.slice(-8)}` : codigo
}

async function copiarCodigo(codigo) {
  try {
    await navigator.clipboard.writeText(codigo)
    codigoCopiado.value = codigo
    setTimeout(() => {
      if (codigoCopiado.value === codigo) codigoCopiado.value = ''
    }, 1500)
  } catch {
    // Área de transferência bloqueada pelo navegador: o código segue no detalhe aberto.
  }
}

// ----------------------------------------------------------------------- tabela

const resumo = computed(() => ({
  municipios: municipios.value.length,
  imoveis: municipios.value.reduce((soma, m) => soma + (m.qtdImoveis || 0), 0),
  areaHa: municipios.value.reduce((soma, m) => soma + (m.areaTotalHa || 0), 0),
}))

const linhas = computed(() => {
  if (visao.value === 'municipio') return municipios.value
  const todos = imoveis.value || []
  if (!filtroMunicipioCod.value) return todos
  return todos.filter((i) => String(i.municipioCodIbge) === filtroMunicipioCod.value)
})

const linhasFiltradas = computed(() => {
  const termo = normalizar(busca.value).trim()
  if (!termo) return linhas.value

  return linhas.value.filter((linha) => {
    const alvo =
      visao.value === 'municipio'
        ? `${linha.nome} ${linha.codIbge}`
        : `${linha.codImovel} ${linha.municipioNome}`
    return normalizar(alvo).includes(termo)
  })
})

const totalPaginas = computed(() =>
  Math.max(1, Math.ceil(linhasFiltradas.value.length / TAMANHO_PAGINA)),
)

const linhasVisiveis = computed(() => {
  const inicio = pagina.value * TAMANHO_PAGINA
  return linhasFiltradas.value.slice(inicio, inicio + TAMANHO_PAGINA)
})

function irPara(novaPagina) {
  pagina.value = Math.min(Math.max(0, novaPagina), totalPaginas.value - 1)
}

function chaveDaLinha(linha) {
  return visao.value === 'municipio' ? linha.codIbge : linha.codImovel
}
</script>

<template>
  <div class="pagina-indicadores">
    <header class="topo-pagina">
      <h1 class="titulo">Indicadores e Resultados</h1>
      <div class="topo-acoes">
        <button
          v-if="podeVerMapa"
          class="btn-secundario"
          data-acao="ver-mapa"
          :title="selecionado.dado ? 'Ver este item no mapa' : 'Ver no mapa'"
          @click="verNoMapa"
        >
          Ver no mapa
        </button>
        <button class="btn-secundario" :disabled="carregando" @click="atualizar">Atualizar</button>
      </div>
    </header>

    <section class="faixa-resumo" aria-label="Totais do recorte publicado">
      <div class="resumo-item">
        <span class="resumo-valor">{{ formatarInteiro(resumo.municipios) }}</span>
        <span class="resumo-rotulo">Municípios publicados</span>
      </div>
      <div class="resumo-item">
        <span class="resumo-valor">{{ formatarInteiro(resumo.imoveis) }}</span>
        <span class="resumo-rotulo">Imóveis rurais</span>
      </div>
      <div class="resumo-item">
        <span class="resumo-valor">{{ formatarNumero(resumo.areaHa) }}</span>
        <span class="resumo-rotulo">Área total (ha)</span>
      </div>
    </section>

    <div class="abas-pagina" role="tablist">
      <button
        type="button"
        class="aba-pagina"
        :class="{ 'aba-pagina--ativa': visao === 'municipio' }"
        role="tab"
        :aria-selected="visao === 'municipio'"
        @click="trocarVisao('municipio')"
      >
        Por município
      </button>
      <button
        type="button"
        class="aba-pagina"
        :class="{ 'aba-pagina--ativa': visao === 'imovel' }"
        role="tab"
        :aria-selected="visao === 'imovel'"
        @click="trocarVisao('imovel')"
      >
        Por imóvel
      </button>
    </div>

    <section class="card">
      <div class="barra-ferramentas">
        <div class="filtros">
          <label class="campo-busca">
            <span class="sr-only">Buscar</span>
            <input
              v-model="busca"
              class="campo"
              type="search"
              :placeholder="
                visao === 'municipio'
                  ? 'Buscar município'
                  : 'Buscar por código do imóvel ou município'
              "
            />
          </label>
          <label v-if="visao === 'imovel'" class="campo-filtro">
            <span class="sr-only">Filtrar por município</span>
            <select v-model="filtroMunicipioCod" class="campo filtro-municipio">
              <option value="">Todos os municípios</option>
              <option v-for="m in municipios" :key="m.codIbge" :value="String(m.codIbge)">
                {{ m.nome || `IBGE ${m.codIbge}` }}
              </option>
            </select>
          </label>
        </div>
        <span class="contagem">
          {{ formatarInteiro(linhasFiltradas.length) }}
          {{ visao === 'municipio' ? 'município(s)' : 'imóvel(is)' }}
        </span>
      </div>

      <div v-if="erro" class="alerta alerta--erro">{{ erro }}</div>
      <p v-else-if="carregando" class="estado-vazio">Carregando indicadores…</p>
      <p v-else-if="!linhas.length" class="estado-vazio">
        Nenhum dado publicado na camada Gold até o momento.
      </p>
      <p v-else-if="!linhasFiltradas.length" class="estado-vazio">Nada encontrado.</p>

      <template v-else>
        <div class="tabela-container">
          <table class="tabela-dados">
            <thead>
              <tr>
                <th rowspan="2">{{ visao === 'municipio' ? 'Município' : 'Imóvel' }}</th>
                <th rowspan="2" :class="visao === 'municipio' ? 'col-numero' : 'col-municipio'">
                  {{ visao === 'municipio' ? 'Imóveis' : 'Município' }}
                </th>
                <th rowspan="2" class="col-numero">Área (ha)</th>
                <th
                  v-for="dimensao in dimensoes"
                  :key="dimensao.chave"
                  :colspan="dimensao.tipos.length"
                  class="col-dimensao"
                >
                  {{ dimensao.rotulo }}
                </th>
              </tr>
              <tr>
                <th
                  v-for="tipo in colunas"
                  :key="tipo.codigo"
                  class="col-indicador"
                  :title="tituloDoIndicador(tipo)"
                >
                  {{ tipo.codigo }}
                </th>
              </tr>
            </thead>
            <tbody>
              <template v-for="linha in linhasVisiveis" :key="chaveDaLinha(linha)">
                <tr
                  class="linha-dados"
                  :class="{ 'linha-dados--aberta': estaSelecionada(linha) }"
                  @click="selecionar(linha)"
                >
                  <template v-if="visao === 'municipio'">
                    <td>
                      <div class="forte">{{ linha.nome || 'Município não identificado' }}</div>
                      <div class="detalhe">IBGE {{ linha.codIbge }}</div>
                    </td>
                    <td class="col-numero">{{ formatarInteiro(linha.qtdImoveis) }}</td>
                    <td class="col-numero">{{ formatarNumero(linha.areaTotalHa) }}</td>
                  </template>
                  <template v-else>
                    <td>
                      <button
                        type="button"
                        class="codigo-imovel"
                        :title="linha.codImovel"
                        @click.stop="copiarCodigo(linha.codImovel)"
                      >
                        {{ codigoCurto(linha.codImovel) }}
                      </button>
                      <div class="detalhe">
                        {{ codigoCopiado === linha.codImovel ? 'Código copiado' : 'Clique para copiar' }}
                      </div>
                    </td>
                    <td class="col-municipio">{{ linha.municipioNome || '—' }}</td>
                    <td class="col-numero">{{ formatarNumero(linha.areaHa) }}</td>
                  </template>

                  <td v-for="tipo in colunas" :key="tipo.codigo" class="col-indicador">
                    <span class="badge-tag" :class="`badge-tag--${faixaDoValor(tipo, valorDaLinha(linha, tipo))}`">
                      {{ formatarNumero(valorDaLinha(linha, tipo)) }}
                    </span>
                  </td>
                </tr>

                <tr v-if="estaSelecionada(linha)" class="linha-detalhe">
                  <td :colspan="totalColunas">
                    <div class="detalhe-painel">
                      <div class="detalhe-topo">
                        <div>
                          <h2 class="detalhe-titulo">
                            {{ ehDetalheDeMunicipio ? 'Município:' : 'Imóvel:' }}
                            <span :class="{ 'detalhe-codigo': !ehDetalheDeMunicipio }">
                              {{ detalheTitulo }}
                            </span>
                          </h2>
                          <p class="detalhe">{{ detalheSubtitulo }}</p>
                        </div>
                        <div class="abas-dimensao" role="group" aria-label="Filtrar por dimensão">
                          <button
                            v-for="aba in abasDoDetalhe"
                            :key="aba.chave"
                            type="button"
                            class="aba"
                            :class="{ 'aba--ativa': abaDimensao === aba.chave }"
                            @click.stop="abaDimensao = aba.chave"
                          >
                            {{ aba.rotulo }}
                          </button>
                        </div>
                      </div>

                      <div class="barras">
                        <template v-for="grupo in gruposDoDetalhe" :key="grupo.chave">
                          <p v-if="mostrarDivisorDeDimensao" class="divisor-dimensao">
                            {{ grupo.rotulo }}
                          </p>
                          <div v-for="barra in grupo.barras" :key="barra.codigo" class="indicador">
                            <span class="indicador-nome" :title="barra.titulo">
                              <span class="indicador-codigo">{{ barra.codigo }}</span>
                              <span class="indicador-descricao">
                                {{ barra.descricao }} · {{ barra.sentido }}
                              </span>
                            </span>
                            <span class="trilho">
                              <span
                                class="preenchida"
                                :class="`preenchida--${barra.faixa}`"
                                :style="{ width: `${barra.largura}%` }"
                              ></span>
                              <span
                                v-if="barra.marcaBom"
                                class="limite"
                                :style="{ left: `${barra.marcaBom.posicao}%` }"
                              >
                                <span>{{ barra.marcaBom.rotulo }}</span>
                              </span>
                              <span
                                v-if="barra.marcaAtencao"
                                class="limite"
                                :style="{ left: `${barra.marcaAtencao.posicao}%` }"
                              >
                                <span>{{ barra.marcaAtencao.rotulo }}</span>
                              </span>
                            </span>
                            <span class="indicador-valor">
                              <span class="indicador-numero">
                                {{ formatarNumero(barra.valor) }}<template v-if="!barra.ehDensidade">{{ barra.unidadeSimbolo }}</template>
                              </span>
                              <span v-if="barra.ehDensidade" class="indicador-unidade">
                                {{ barra.unidadeSimbolo }}
                              </span>
                              <span v-if="barra.secundario" class="indicador-unidade">
                                {{ barra.secundario.rotulo }}: {{ formatarNumero(barra.secundario.valor) }} ha
                              </span>
                            </span>
                          </div>
                        </template>
                      </div>

                      <div class="detalhe-rodape">
                        <div class="legenda">
                          <span class="badge-tag badge-tag--sucesso">bom</span>
                          <span class="badge-tag badge-tag--alerta">atenção</span>
                          <span class="badge-tag badge-tag--erro">crítico</span>
                          <span class="badge-tag badge-tag--neutro">sem cálculo</span>
                          <span class="legenda-nota">
                            Indicadores percentuais usam escala de 0 a 100, e as marcas cinzas são
                            os limites de cada faixa. Em indicadores de densidade, a barra cheia
                            equivale ao limite crítico.
                          </span>
                        </div>
                        <button
                          v-if="ehDetalheDeMunicipio"
                          type="button"
                          class="btn-principal"
                          @click.stop="verImoveis"
                        >
                          Ver os {{ formatarInteiro(linha.qtdImoveis) }} imóveis de
                          {{ linha.nome || `IBGE ${linha.codIbge}` }} →
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

        <div v-if="totalPaginas > 1" class="paginacao">
          <button class="btn-secundario" :disabled="pagina === 0" @click="irPara(pagina - 1)">
            ← Anterior
          </button>
          <span>Página {{ pagina + 1 }} de {{ totalPaginas }}</span>
          <button
            class="btn-secundario"
            :disabled="pagina + 1 >= totalPaginas"
            @click="irPara(pagina + 1)"
          >
            Próxima →
          </button>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped src="../styles/views/IndicadoresView.css"></style>
