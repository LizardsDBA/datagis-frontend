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

<style scoped>
.inicio {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.inicio-titulo {
  margin: 0;
  font-size: 1.6rem;
  font-weight: 800;
  color: var(--cor-slate-900);
}

.inicio-sub {
  margin: 0.25rem 0 0;
  font-size: 0.9rem;
  color: var(--cor-slate-500);
}

.alerta-erro {
  padding: 0.7rem 1rem;
  border-radius: 8px;
  background: var(--status-erro-bg);
  color: var(--status-erro-texto);
  font-size: 0.86rem;
}

.bloco-resumo {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 16rem), 1fr));
  gap: 1rem;
}

.card-resumo {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 1rem 1.15rem;
  text-align: left;
  font: inherit;
  border-radius: 12px;
  background: var(--cor-branco);
  border: 1px solid var(--cor-slate-200);
  box-shadow: var(--sombra-sm);
  cursor: pointer;
}

.card-resumo:hover,
.card-resumo:focus-visible {
  border-color: var(--cor-primaria);
  outline: none;
}

.card-resumo--fixo {
  cursor: default;
}

.card-resumo--fixo:hover {
  border-color: var(--cor-slate-200);
}

.resumo-rotulo {
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--cor-slate-500);
}

.resumo-valor {
  font-size: 1.8rem;
  font-weight: 800;
  color: var(--cor-slate-900);
}

.resumo-valor--texto {
  font-size: 1.15rem;
}

.resumo-detalhe {
  font-size: 0.8rem;
  color: var(--cor-slate-500);
}

.secao-topo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
  padding: 0.15rem 0.6rem 0.15rem 0.15rem;
  border-radius: 10px;
  background: var(--cor-branco);
  border: 1px solid var(--cor-slate-200);
}

.secao-titulo {
  flex: 1;
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--cor-slate-900);
}

/* O título inteiro é o botão que abre e minimiza a seção */
.secao-alternar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.55rem 0.6rem;
  border: none;
  border-radius: 8px;
  background: transparent;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.secao-alternar:hover,
.secao-alternar:focus-visible {
  color: var(--cor-primaria);
  outline: none;
}

.secao-seta {
  flex-shrink: 0;
  width: 1rem;
  height: 1rem;
  color: var(--cor-slate-400);
  transition: transform 0.15s;
}

.secao-seta--aberta {
  transform: rotate(90deg);
}

.secao-acoes {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.btn-secao {
  padding: 0.3rem 0.7rem;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--cor-slate-600);
  background: var(--cor-branco);
  border: 1px solid var(--cor-slate-200);
  border-radius: 6px;
  cursor: pointer;
  text-decoration: none;
  line-height: 1.3;
}

.btn-secao:hover {
  border-color: var(--cor-primaria);
  color: var(--cor-primaria);
}

.estado-vazio {
  margin: 0;
  font-size: 0.86rem;
  color: var(--cor-slate-500);
}

.totais {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 11rem), 1fr));
  gap: 0.75rem;
  margin-bottom: 0.85rem;
}

.total {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  padding: 0.75rem 0.9rem;
  border-radius: 10px;
  background: var(--cor-branco);
  border: 1px solid var(--cor-slate-200);
}

.total-valor {
  font-size: 1.35rem;
  font-weight: 800;
  color: var(--cor-slate-900);
}

.total-rotulo {
  font-size: 0.76rem;
  color: var(--cor-slate-500);
}

.tabela-container {
  overflow-x: auto;
  border-radius: 10px;
  border: 1px solid var(--cor-slate-200);
  background: var(--cor-branco);
}

.tabela-indicadores {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.84rem;
}

.tabela-indicadores th,
.tabela-indicadores td {
  padding: 0.55rem 0.75rem;
  text-align: left;
  border-bottom: 1px solid var(--cor-slate-100);
  white-space: nowrap;
}

.tabela-indicadores th {
  font-size: 0.74rem;
  font-weight: 700;
  color: var(--cor-slate-500);
  background: var(--cor-slate-50);
}

.tabela-indicadores th small {
  font-weight: 500;
}

.tabela-indicadores td {
  color: var(--cor-slate-900);
}

.tabela-indicadores tr:last-child td {
  border-bottom: none;
}

.num {
  text-align: right !important;
}

.nota-tabela {
  margin: 0.45rem 0 0;
  font-size: 0.76rem;
  color: var(--cor-slate-500);
}

.grade-telas {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr));
  gap: 0.85rem;
}

.card-tela {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.9rem 1rem;
  border-radius: 10px;
  background: var(--cor-branco);
  border: 1px solid var(--cor-slate-200);
  text-decoration: none;
  color: inherit;
  transition: border-color 0.15s;
}

.card-tela:hover,
.card-tela:focus-within {
  border-color: var(--cor-primaria);
}

.estrela-titulo {
  color: var(--cor-slate-400);
  font-weight: 400;
}

/* Favoritos em quadradinhos: ícone da tela num quadrado colorido e o nome embaixo */
.grade-atalhos {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.atalho {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  width: 8.5rem;
  min-height: 6.5rem;
  padding: 0.85rem 0.6rem;
  border-radius: 10px;
  background: var(--cor-branco);
  border: 1px solid var(--cor-slate-200);
  box-shadow: var(--sombra-sm);
  text-decoration: none;
  text-align: center;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}

.atalho:hover,
.atalho:focus-visible {
  border-color: var(--cor-primaria);
  box-shadow: 0 0 0 2px var(--cor-primaria-clara);
  outline: none;
}

.atalho-icone {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.6rem;
  height: 2.6rem;
  padding: 0.6rem;
  box-sizing: border-box;
  border-radius: 10px;
  color: #ffffff;
}

.atalho-rotulo {
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1.3;
  color: var(--cor-slate-900);
}

.card-tela-cabeca {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.card-tela-icone {
  flex-shrink: 0;
  width: 1.15rem;
  height: 1.15rem;
}

.card-tela-link {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding-right: 3.6rem;
  text-decoration: none;
  color: inherit;
}

.card-tela-titulo {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--cor-slate-900);
}

.card-tela-desc {
  font-size: 0.8rem;
  line-height: 1.45;
  color: var(--cor-slate-500);
}

.card-tela-acoes {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  display: flex;
  gap: 0.15rem;
}

.btn-icone {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--cor-slate-400);
  cursor: pointer;
}

.btn-icone:hover {
  background: var(--cor-slate-100);
}

.btn-estrela {
  font-size: 1.2rem;
  line-height: 1;
}

.btn-estrela--marcada {
  color: #d97706;
}

.btn-estrela:disabled {
  cursor: wait;
  opacity: 0.6;
}

.btn-ocultar svg {
  width: 1rem;
  height: 1rem;
}

.ocultas {
  margin-top: 0.75rem;
}

.link-ocultas {
  padding: 0;
  border: none;
  background: none;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--cor-primaria);
  cursor: pointer;
}

.lista-ocultas {
  margin: 0.5rem 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  max-width: 32rem;
}

.lista-ocultas li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.45rem 0.7rem;
  font-size: 0.84rem;
  color: var(--cor-slate-700);
  border-radius: 8px;
  background: var(--cor-branco);
  border: 1px solid var(--cor-slate-200);
}

.btn-reexibir {
  padding: 0.2rem 0.55rem;
  font-size: 0.76rem;
  font-weight: 700;
  color: var(--cor-primaria);
  background: transparent;
  border: 1px solid var(--cor-slate-200);
  border-radius: 6px;
  cursor: pointer;
}

/* "Ver em tabela" é link (<a>): sem isto, a cor de link do tema escuro passaria por cima
   e ele ficaria diferente dos outros textos da barra da seção */
:root[data-tema="escuro"] .btn-secao {
  color: var(--cor-slate-600);
}

:root[data-tema="escuro"] .btn-secao:hover {
  color: var(--cor-primaria);
}

:root[data-tema="escuro"] .btn-estrela--marcada {
  color: var(--cor-alerta);
}
</style>
