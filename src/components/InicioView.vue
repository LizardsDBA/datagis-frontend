<script setup>
/**
 * Tela inicial (Home). Só informação leve, pra abrir rápido:
 * - favoritos do usuário (1 chamada pequena: /api/favoritos);
 * - processamentos em andamento (lidos do painel de Processamentos, que já consulta o
 *   backend sozinho — nenhuma chamada a mais aqui);
 * - última publicação da Gold e o resumo dos indicadores por município (só pra quem pode
 *   ver indicadores: /api/gold/status, /api/indicadores/municipios — uma linha por
 *   município — e /api/indicadores/tipos);
 * - atalhos pras telas que o perfil pode abrir (montados do catálogo, sem chamada).
 * Nada de lista de imóveis nem do mapa, que deixariam a Home lenta.
 *
 * Seção minimizada e tela oculta ficam no navegador, por usuário (preferência de tela,
 * não dado: o favorito, que é dado, fica no banco).
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { sessao, nomeDoPerfil, temPermissao } from '../auth/autenticacao'
import { PERMISSOES } from '../auth/permissoes'
import { telasPermitidas } from '../navegacao/pesquisa'
import { listarFavoritos, salvarFavoritos } from '../services/favoritoService'
import { listarTiposIndicador, obterStatusGold } from '../services/goldService'
import { listarIndicadoresPorMunicipio } from '../services/consultaIndicadoresService'
import { useMonitoramentoGlobal } from '../composables/useMonitoramentoGlobal'
import IconeTela from './IconeTela.vue'

const { totalEmAndamento, abrirPainel } = useMonitoramentoGlobal()

const telas = telasPermitidas()
const favoritos = ref([])
const carregandoFavoritos = ref(true)
const salvando = ref(false)
const erroFavoritos = ref('')
const statusGold = ref(null)
const municipios = ref([])
const tipos = ref([])
const carregandoIndicadores = ref(true)
const erroIndicadores = ref('')
const podeVerIndicadores = temPermissao(PERMISSOES.INDICADOR_VISUALIZAR)

// ---------- Preferências da tela (navegador, por usuário) ----------
const CHAVE_PREFERENCIAS = `datagis.home.${sessao.login || 'anonimo'}`

function lerPreferencias() {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_PREFERENCIAS) || '{}')
    return {
      minimizadas: Array.isArray(salvo.minimizadas) ? salvo.minimizadas : [],
      ocultas: Array.isArray(salvo.ocultas) ? salvo.ocultas : [],
    }
  } catch {
    return { minimizadas: [], ocultas: [] }
  }
}

const preferencias = reactive(lerPreferencias())
const mostrandoOcultas = ref(false)

function gravarPreferencias() {
  try {
    localStorage.setItem(CHAVE_PREFERENCIAS, JSON.stringify(preferencias))
  } catch {
    // Sem localStorage (aba anônima, bloqueio): funciona igual, só não lembra depois
  }
}

function minimizada(secao) {
  return preferencias.minimizadas.includes(secao)
}

function alternarSecao(secao) {
  preferencias.minimizadas = minimizada(secao)
    ? preferencias.minimizadas.filter((s) => s !== secao)
    : [...preferencias.minimizadas, secao]
  gravarPreferencias()
}

function oculta(rota) {
  return preferencias.ocultas.includes(rota)
}

function alternarOculta(rota) {
  preferencias.ocultas = oculta(rota) ? preferencias.ocultas.filter((r) => r !== rota) : [...preferencias.ocultas, rota]
  gravarPreferencias()
}

const telasVisiveis = computed(() => telas.filter((t) => !oculta(t.rota)))
const telasOcultas = computed(() => telas.filter((t) => oculta(t.rota)))

// ---------- Cabeçalho ----------
const saudacao = computed(() => {
  const hora = new Date().getHours()
  const periodo = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
  const nome = (sessao.nome || sessao.login || '').split(' ')[0]
  return nome ? `${periodo}, ${nome}` : periodo
})

const perfis = computed(() => (sessao.perfis.length ? sessao.perfis.map(nomeDoPerfil).join(' · ') : 'Sem perfil'))

// ---------- Gold ----------
const ultimaPublicacao = computed(() => {
  const ind = statusGold.value?.indicadores
  if (!ind || ind.status === 'NUNCA_EXECUTADO') return null
  return ind
})

const ROTULO_STATUS_GOLD = { CONCLUIDA: 'Concluída', EM_ANDAMENTO: 'Em andamento', FALHOU: 'Falhou' }

// ---------- Indicadores e resultados ----------
const MAXIMO_MUNICIPIOS = 5

const indicadoresOrdenados = computed(() =>
  tipos.value
    .filter((t) => t.ativo !== false)
    .slice()
    .sort((a, b) => (a.ordemExibicao ?? 99) - (b.ordemExibicao ?? 99)),
)

const totais = computed(() => ({
  municipios: municipios.value.length,
  imoveis: municipios.value.reduce((s, m) => s + (m.qtdImoveis || 0), 0),
  comIntersecao: municipios.value.reduce((s, m) => s + (m.qtdImoveisComIntersecao || 0), 0),
  areaHa: municipios.value.reduce((s, m) => s + (m.areaTotalHa || 0), 0),
}))

const municipiosEmDestaque = computed(() =>
  municipios.value
    .slice()
    .sort((a, b) => (b.qtdImoveis || 0) - (a.qtdImoveis || 0))
    .slice(0, MAXIMO_MUNICIPIOS),
)

function campoDoIndicador(codigo) {
  return `valor${codigo.charAt(0).toUpperCase()}${codigo.slice(1).toLowerCase()}`
}

/**
 * Faixa do valor (bom, atenção, crítico ou sem cálculo) — a mesma regra e as mesmas cores
 * (badge-tag--*) da tela Indicadores e Resultados (IndicadoresView), pelos limites e pelo
 * sentido do catálogo de indicadores.
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

function formatarNumero(valor, casas = 1) {
  if (valor === null || valor === undefined) return '—'
  return Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}

function formatarInteiro(valor) {
  return Number(valor || 0).toLocaleString('pt-BR')
}

// ---------- Favoritos ----------
// Favorito de tela que o usuário deixou de poder abrir some da lista, sem erro
const telasFavoritas = computed(() =>
  favoritos.value.map((rota) => telas.find((t) => t.rota === rota)).filter(Boolean),
)

function ehFavorita(rota) {
  return favoritos.value.includes(rota)
}

async function alternarFavorito(rota) {
  const anterior = favoritos.value
  favoritos.value = ehFavorita(rota) ? anterior.filter((r) => r !== rota) : [...anterior, rota]
  salvando.value = true
  erroFavoritos.value = ''
  try {
    favoritos.value = await salvarFavoritos(favoritos.value)
  } catch (e) {
    favoritos.value = anterior
    erroFavoritos.value = e.message
  } finally {
    salvando.value = false
  }
}

function formatarData(valor) {
  return valor ? new Date(valor).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : ''
}

onMounted(async () => {
  const [lista, gold, porMunicipio, catalogo] = await Promise.allSettled([
    listarFavoritos(),
    podeVerIndicadores ? obterStatusGold() : Promise.resolve(null),
    podeVerIndicadores ? listarIndicadoresPorMunicipio() : Promise.resolve([]),
    podeVerIndicadores ? listarTiposIndicador() : Promise.resolve([]),
  ])
  if (lista.status === 'fulfilled') favoritos.value = lista.value
  else erroFavoritos.value = lista.reason?.message || 'Falha ao carregar os favoritos'
  carregandoFavoritos.value = false

  if (gold.status === 'fulfilled') statusGold.value = gold.value
  if (porMunicipio.status === 'fulfilled') municipios.value = porMunicipio.value || []
  else erroIndicadores.value = porMunicipio.reason?.message || 'Falha ao carregar os indicadores'
  if (catalogo.status === 'fulfilled') tipos.value = catalogo.value || []
  carregandoIndicadores.value = false
})
</script>

<template>
  <div class="inicio">
    <header class="inicio-topo">
      <div>
        <h1 class="inicio-titulo">{{ saudacao }}</h1>
        <p class="inicio-sub">{{ perfis }}</p>
      </div>
    </header>

    <div v-if="erroFavoritos" class="alerta-erro" role="alert">✕ {{ erroFavoritos }}</div>

    <section class="bloco-resumo">
      <button type="button" class="card-resumo" @click="abrirPainel">
        <span class="resumo-rotulo">Processamentos agora</span>
        <strong class="resumo-valor">{{ totalEmAndamento }}</strong>
        <span class="resumo-detalhe">{{ totalEmAndamento ? 'em andamento · ver no painel' : 'nada rodando no momento' }}</span>
      </button>
      <div v-if="podeVerIndicadores" class="card-resumo card-resumo--fixo">
        <span class="resumo-rotulo">Última publicação da Gold</span>
        <template v-if="ultimaPublicacao">
          <strong class="resumo-valor resumo-valor--texto">
            {{ ROTULO_STATUS_GOLD[ultimaPublicacao.status] || ultimaPublicacao.status }}
          </strong>
          <span class="resumo-detalhe">
            {{ formatarData(ultimaPublicacao.concluidoEm || ultimaPublicacao.iniciadoEm) }}
            <template v-if="ultimaPublicacao.totalSucesso"> · {{ ultimaPublicacao.totalSucesso }} imóveis</template>
          </span>
        </template>
        <template v-else>
          <strong class="resumo-valor resumo-valor--texto">Ainda não publicada</strong>
          <span class="resumo-detalhe">o mapa e os indicadores ficam vazios até publicar</span>
        </template>
      </div>
    </section>

    <!-- Indicadores e resultados: números, sem mapa -->
    <section v-if="podeVerIndicadores" class="secao" data-secao="indicadores">
      <header class="secao-topo">
        <h2 class="secao-titulo">
          <button type="button" class="secao-alternar" :aria-expanded="!minimizada('indicadores')" @click="alternarSecao('indicadores')">
            <svg class="secao-seta" :class="{ 'secao-seta--aberta': !minimizada('indicadores') }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true">
              <polyline points="9 6 15 12 9 18" />
            </svg>
            Indicadores e resultados
          </button>
        </h2>
        <div v-if="!minimizada('indicadores')" class="secao-acoes">
          <router-link to="/indicadores" class="btn-secao">Ver em tabela</router-link>
        </div>
      </header>

      <template v-if="!minimizada('indicadores')">
        <p v-if="carregandoIndicadores" class="estado-vazio">Carregando indicadores…</p>
        <p v-else-if="erroIndicadores" class="estado-vazio">{{ erroIndicadores }}</p>
        <p v-else-if="!municipios.length" class="estado-vazio">
          Nenhum indicador publicado ainda. Os números aparecem aqui depois da publicação da Gold.
        </p>
        <template v-else>
          <div class="totais">
            <div class="total">
              <span class="total-valor">{{ formatarInteiro(totais.imoveis) }}</span>
              <span class="total-rotulo">imóveis publicados</span>
            </div>
            <div class="total">
              <span class="total-valor">{{ formatarInteiro(totais.municipios) }}</span>
              <span class="total-rotulo">municípios</span>
            </div>
            <div class="total">
              <span class="total-valor">{{ formatarInteiro(totais.comIntersecao) }}</span>
              <span class="total-rotulo">imóveis com sobreposição</span>
            </div>
            <div class="total">
              <span class="total-valor">{{ formatarNumero(totais.areaHa, 0) }}</span>
              <span class="total-rotulo">hectares</span>
            </div>
          </div>

          <div class="tabela-container">
            <table class="tabela-indicadores">
              <thead>
                <tr>
                  <th>Município</th>
                  <th class="num">Imóveis</th>
                  <th v-for="t in indicadoresOrdenados" :key="t.codigo" class="num" :title="t.descricao">
                    {{ t.codigo }} <small>{{ t.unidadeSimbolo || '%' }}</small>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="m in municipiosEmDestaque" :key="m.codIbge">
                  <td>{{ m.nome || `IBGE ${m.codIbge}` }}</td>
                  <td class="num">{{ formatarInteiro(m.qtdImoveis) }}</td>
                  <td v-for="t in indicadoresOrdenados" :key="t.codigo" class="num">
                    <span class="badge-tag" :class="`badge-tag--${faixaDoValor(t, m[campoDoIndicador(t.codigo)])}`">
                      {{ formatarNumero(m[campoDoIndicador(t.codigo)]) }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="nota-tabela">
            Média ponderada pela área dos imóveis de cada município.
            <template v-if="municipios.length > MAXIMO_MUNICIPIOS">
              Mostrando os {{ MAXIMO_MUNICIPIOS }} com mais imóveis, de {{ municipios.length }}.
            </template>
          </p>
        </template>
      </template>
    </section>

    <section class="secao" data-secao="favoritos">
      <header class="secao-topo">
        <h2 class="secao-titulo">
          <button type="button" class="secao-alternar" :aria-expanded="!minimizada('favoritos')" @click="alternarSecao('favoritos')">
            <svg class="secao-seta" :class="{ 'secao-seta--aberta': !minimizada('favoritos') }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true">
              <polyline points="9 6 15 12 9 18" />
            </svg>
            <span class="estrela-titulo" aria-hidden="true">☆</span> Favoritos
          </button>
        </h2>
      </header>
      <template v-if="!minimizada('favoritos')">
        <p v-if="carregandoFavoritos" class="estado-vazio">Carregando favoritos…</p>
        <p v-else-if="!telasFavoritas.length" class="estado-vazio">
          Não há favoritos. Marque a estrela de uma tela em "Todas as telas" para ela aparecer aqui.
        </p>
        <div v-else class="grade-atalhos">
          <router-link
            v-for="tela in telasFavoritas"
            :key="tela.rota"
            :to="tela.rota"
            class="atalho"
            :title="tela.descricao"
          >
            <span class="atalho-icone" :style="{ background: tela.cor }">
              <IconeTela :nome="tela.icone" />
            </span>
            <span class="atalho-rotulo">{{ tela.titulo }}</span>
          </router-link>
        </div>
      </template>
    </section>

    <section class="secao" data-secao="telas">
      <header class="secao-topo">
        <h2 class="secao-titulo">
          <button type="button" class="secao-alternar" :aria-expanded="!minimizada('telas')" @click="alternarSecao('telas')">
            <svg class="secao-seta" :class="{ 'secao-seta--aberta': !minimizada('telas') }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true">
              <polyline points="9 6 15 12 9 18" />
            </svg>
            Todas as telas
          </button>
        </h2>
      </header>
      <template v-if="!minimizada('telas')">
        <p v-if="!telas.length" class="estado-vazio">Seu usuário ainda não tem acesso a nenhuma tela. Fale com o administrador.</p>
        <p v-else-if="!telasVisiveis.length" class="estado-vazio">Todas as telas estão ocultas.</p>
        <div v-if="telasVisiveis.length" class="grade-telas">
          <div v-for="tela in telasVisiveis" :key="tela.rota" class="card-tela">
            <router-link :to="tela.rota" class="card-tela-link">
              <span class="card-tela-cabeca">
                <span class="card-tela-icone" :style="{ color: tela.cor }"><IconeTela :nome="tela.icone" /></span>
                <span class="card-tela-titulo">{{ tela.titulo }}</span>
              </span>
              <span class="card-tela-desc">{{ tela.descricao }}</span>
            </router-link>
            <div class="card-tela-acoes">
              <button
                type="button"
                class="btn-icone btn-estrela"
                :class="{ 'btn-estrela--marcada': ehFavorita(tela.rota) }"
                :disabled="salvando || carregandoFavoritos"
                :aria-pressed="ehFavorita(tela.rota)"
                :aria-label="ehFavorita(tela.rota) ? `Remover ${tela.titulo} dos favoritos` : `Adicionar ${tela.titulo} aos favoritos`"
                :title="ehFavorita(tela.rota) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'"
                @click="alternarFavorito(tela.rota)"
              >
                {{ ehFavorita(tela.rota) ? '★' : '☆' }}
              </button>
              <button
                type="button"
                class="btn-icone btn-ocultar"
                :aria-label="`Ocultar ${tela.titulo} da Home`"
                title="Ocultar desta lista"
                @click="alternarOculta(tela.rota)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div v-if="telasOcultas.length" class="ocultas">
          <button type="button" class="link-ocultas" :aria-expanded="mostrandoOcultas" @click="mostrandoOcultas = !mostrandoOcultas">
            {{ mostrandoOcultas ? 'Esconder lista de ocultas' : `Telas ocultas (${telasOcultas.length})` }}
          </button>
          <ul v-if="mostrandoOcultas" class="lista-ocultas">
            <li v-for="tela in telasOcultas" :key="tela.rota">
              <span>{{ tela.titulo }}</span>
              <button type="button" class="btn-reexibir" @click="alternarOculta(tela.rota)">Mostrar de novo</button>
            </li>
          </ul>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped src="../styles/views/InicioView.css"></style>
