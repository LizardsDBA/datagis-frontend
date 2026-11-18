<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  atualizarTipoIndicador,
  buscarImovelPublicado,
  cadastrarTipoIndicador,
  desativarTipoIndicador,
  listarImoveisPublicados,
  listarTiposIndicador,
} from '../services/goldService'
import { temPermissao } from '../auth/autenticacao'
import { PERMISSOES } from '../auth/permissoes'

// Cadastrar/editar/desativar tipo de indicador exige indicador:publicar (LIZARDS-46);
// quem só visualiza (ex.: Auditor) consulta tipos e imóveis publicados.
const podePublicar = temPermissao(PERMISSOES.INDICADOR_PUBLICAR)

const abaAtiva = ref('tipos')

const tipos = ref([])
const imoveis = ref([])
const filtroImovel = ref('')

const carregando = ref(false)
const erroTipos = ref(null)
const erroImoveis = ref(null)

const modalTipoAberto = ref(false)
const editandoTipoId = ref(null)
const enviandoTipo = ref(false)
const erroForm = ref(null)

const detalheImovelAberto = ref(false)
const imovelSelecionado = ref(null)
const buscandoImovel = ref(false)
const erroDetalhe = ref(null)

const sucesso = ref(null)
let timerSucesso = null

function formVazio() {
  return {
    codigo: '',
    descricao: '',
    temFonte: true,
    ativo: true,
  }
}

const formTipo = ref(formVazio())

const tiposAtivos = computed(() => tipos.value.filter(tipo => tipo.ativo).length)

const imoveisFiltrados = computed(() => {
  const termo = filtroImovel.value.trim().toLowerCase()
  if (!termo) return imoveis.value

  return imoveis.value.filter(imovel =>
    String(imovel.codImovel || '').toLowerCase().includes(termo),
  )
})

const indicadores = [
  { campo: 'valorIcv', codigo: 'ICV', titulo: 'Cobertura vegetal nativa' },
  { campo: 'valorIrl', codigo: 'IRL', titulo: 'Reserva Legal' },
  { campo: 'valorIapp', codigo: 'IAPP', titulo: 'Área de Preservação Permanente' },
  { campo: 'valorIsap', codigo: 'ISAP', titulo: 'Sobreposição com Áreas Protegidas' },
  { campo: 'valorIae', codigo: 'IAE', titulo: 'Área Embargada' },
  { campo: 'valorIdesmat', codigo: 'IDesmat', titulo: 'Desmatamento' },
  { campo: 'valorIfc', codigo: 'IFC', titulo: 'Focos de Calor' },
]

function mostrarSucesso(mensagem) {
  sucesso.value = mensagem
  if (timerSucesso) clearTimeout(timerSucesso)
  timerSucesso = setTimeout(() => {
    sucesso.value = null
    timerSucesso = null
  }, 4000)
}

async function carregarTipos() {
  erroTipos.value = null
  try {
    tipos.value = await listarTiposIndicador()
  } catch (error) {
    erroTipos.value = error.message || 'Erro ao carregar os tipos de indicador.'
  }
}

async function carregarImoveis() {
  erroImoveis.value = null
  try {
    imoveis.value = await listarImoveisPublicados()
  } catch (error) {
    erroImoveis.value = error.message || 'Erro ao carregar os imóveis publicados.'
  }
}

async function carregarTudo() {
  carregando.value = true
  await Promise.all([carregarTipos(), carregarImoveis()])
  carregando.value = false
}

function abrirCadastroTipo() {
  editandoTipoId.value = null
  formTipo.value = formVazio()
  erroForm.value = null
  modalTipoAberto.value = true
}

function abrirEdicaoTipo(tipo) {
  editandoTipoId.value = tipo.id
  formTipo.value = {
    codigo: tipo.codigo || '',
    descricao: tipo.descricao || '',
    temFonte: tipo.temFonte !== false,
    ativo: tipo.ativo !== false,
  }
  erroForm.value = null
  modalTipoAberto.value = true
}

function fecharModalTipo() {
  modalTipoAberto.value = false
  editandoTipoId.value = null
  erroForm.value = null
  formTipo.value = formVazio()
}

async function salvarTipo() {
  erroForm.value = null

  if (!formTipo.value.codigo.trim()) {
    erroForm.value = 'Informe o código do tipo de indicador.'
    return
  }

  if (!formTipo.value.descricao.trim()) {
    erroForm.value = 'Informe a descrição do tipo de indicador.'
    return
  }

  enviandoTipo.value = true

  const payload = {
    codigo: formTipo.value.codigo,
    descricao: formTipo.value.descricao,
    temFonte: formTipo.value.temFonte,
    ativo: formTipo.value.ativo,
  }

  try {
    const editando = Boolean(editandoTipoId.value)

    if (editando) {
      await atualizarTipoIndicador(editandoTipoId.value, payload)
    } else {
      await cadastrarTipoIndicador(payload)
    }

    await carregarTipos()
    fecharModalTipo()
    mostrarSucesso(editando ? 'Tipo de indicador atualizado com sucesso.' : 'Tipo de indicador cadastrado com sucesso.')
  } catch (error) {
    erroForm.value = error.message || 'Não foi possível salvar o tipo de indicador.'
  } finally {
    enviandoTipo.value = false
  }
}

async function desativarTipo(tipo) {
  const confirmado = window.confirm(
    `Desativar o tipo de indicador ${tipo.codigo}? Ele continuará no histórico, mas ficará inativo.`,
  )

  if (!confirmado) return

  try {
    await desativarTipoIndicador(tipo.id)
    await carregarTipos()
    mostrarSucesso(`Tipo ${tipo.codigo} desativado com sucesso.`)
  } catch (error) {
    erroTipos.value = error.message || 'Não foi possível desativar o tipo de indicador.'
  }
}

async function abrirDetalheImovel(imovel) {
  erroDetalhe.value = null
  imovelSelecionado.value = imovel
  detalheImovelAberto.value = true
  buscandoImovel.value = true

  try {
    imovelSelecionado.value = await buscarImovelPublicado(imovel.codImovel)
  } catch (error) {
    erroDetalhe.value = error.message || 'Não foi possível carregar o detalhe do imóvel.'
  } finally {
    buscandoImovel.value = false
  }
}

function fecharDetalheImovel() {
  detalheImovelAberto.value = false
  imovelSelecionado.value = null
  erroDetalhe.value = null
}

function formatarData(valor) {
  if (!valor) return '—'
  const data = new Date(valor)
  if (Number.isNaN(data.getTime())) return String(valor)
  return data.toLocaleString('pt-BR')
}

function formatarNumero(valor, casas = 2) {
  if (valor === null || valor === undefined || valor === '') return '—'
  const numero = Number(valor)
  if (!Number.isFinite(numero)) return String(valor)

  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  }).format(numero)
}

function formatarIbge(valor) {
  if (valor === null || valor === undefined || valor === '') return '—'
  return String(valor).padStart(7, '0')
}

function valorIndicador(imovel, campo) {
  return formatarNumero(imovel?.[campo])
}

onMounted(carregarTudo)

onUnmounted(() => {
  if (timerSucesso) clearTimeout(timerSucesso)
})
</script>

<template>
  <div class="pagina-gold">
    <header class="topo-pagina">
      <div>
        <p class="etiqueta">CAMADA GOLD</p>
        <h1 class="titulo">Indicadores e Imóveis Publicados</h1>
        <p class="subtitulo">
          Administração dos tipos de indicadores e consulta dos imóveis já publicados para consumo do portal.
        </p>
      </div>

      <button class="btn-atualizar" type="button" :disabled="carregando" @click="carregarTudo">
        <svg class="icone-btn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 2v6h-6" />
          <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
          <path d="M3 22v-6h6" />
          <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        </svg>
        <span>{{ carregando ? 'Atualizando…' : 'Atualizar' }}</span>
      </button>
    </header>

    <div v-if="sucesso" class="banner-sucesso" role="status">
      ✓ {{ sucesso }}
    </div>

    <div class="resumo-grid">
      <article class="resumo-card">
        <span class="resumo-label">Tipos de indicador</span>
        <strong class="resumo-valor">{{ tipos.length }}</strong>
        <span class="resumo-detalhe">{{ tiposAtivos }} ativos</span>
      </article>
      <article class="resumo-card">
        <span class="resumo-label">Imóveis publicados</span>
        <strong class="resumo-valor">{{ imoveis.length }}</strong>
        <span class="resumo-detalhe">versões disponíveis para consulta</span>
      </article>
      <article class="resumo-card resumo-card--info">
        <span class="resumo-label">Camada</span>
        <strong class="resumo-valor resumo-valor--texto">GOLD</strong>
        <span class="resumo-detalhe">dados publicados e rastreáveis</span>
      </article>
    </div>

    <nav class="abas" aria-label="Seções da camada Gold">
      <button
        type="button"
        class="aba"
        :class="{ 'aba--ativa': abaAtiva === 'tipos' }"
        @click="abaAtiva = 'tipos'"
      >
        <span>Tipos de Indicador</span>
        <span class="aba-contagem">{{ tipos.length }}</span>
      </button>
      <button
        type="button"
        class="aba"
        :class="{ 'aba--ativa': abaAtiva === 'imoveis' }"
        @click="abaAtiva = 'imoveis'"
      >
        <span>Imóveis Publicados</span>
        <span class="aba-contagem">{{ imoveis.length }}</span>
      </button>
    </nav>

    <section v-if="abaAtiva === 'tipos'" class="cartao">
      <div class="cartao-header cartao-header--tabela">
        <div>
          <h2 class="cartao-titulo">Tipos de indicador</h2>
          <p class="cartao-sub">
            Cadastre, edite ou desative os tipos que compõem os indicadores Gold. O código é imutável após a criação.
          </p>
        </div>
        <button v-if="podePublicar" class="botao-principal botao-principal--compacto" type="button" @click="abrirCadastroTipo">
          + Novo tipo
        </button>
      </div>

      <div v-if="erroTipos" class="banner-erro">✕ {{ erroTipos }}</div>

      <div v-if="carregando && !tipos.length" class="estado-carregando">
        <div class="spinner"></div>
        <span>Carregando tipos de indicador…</span>
      </div>

      <div v-else-if="!tipos.length" class="estado-vazio">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10" />
          <path d="M8 12h8" />
          <path d="M12 8v8" />
        </svg>
        <p>Nenhum tipo de indicador cadastrado.</p>
        <small>Use “Novo tipo” para cadastrar o primeiro.</small>
      </div>

      <div v-else class="tabela-responsiva-wrapper">
        <table class="tabela-gold">
          <thead>
            <tr>
              <th>Código</th>
              <th>Descrição</th>
              <th>Fonte de dados</th>
              <th>Status</th>
              <th>Cadastrado em</th>
              <th v-if="podePublicar" class="col-acoes-titulo">Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="tipo in tipos" :key="tipo.id">
              <td><code class="codigo-badge">{{ tipo.codigo }}</code></td>
              <td>
                <strong class="celula-titulo">{{ tipo.descricao }}</strong>
              </td>
              <td>
                <span class="badge-tag" :class="tipo.temFonte ? 'badge-tag--sucesso' : 'badge-tag--neutro'">
                  {{ tipo.temFonte ? 'Com fonte' : 'Sem fonte' }}
                </span>
              </td>
              <td>
                <span class="badge-tag" :class="tipo.ativo ? 'badge-tag--sucesso' : 'badge-tag--neutro'">
                  {{ tipo.ativo ? 'Ativo' : 'Inativo' }}
                </span>
              </td>
              <td>{{ formatarData(tipo.dataAdd) }}</td>
              <td v-if="podePublicar" class="celula-acoes">
                <div class="grupo-botoes-acoes">
                  <button
                    type="button"
                    class="btn-acao-circulo btn-editar"
                    title="Editar tipo de indicador"
                    aria-label="Editar tipo de indicador"
                    @click="abrirEdicaoTipo(tipo)"
                  >
                    ✎
                  </button>
                  <button
                    v-if="tipo.ativo"
                    type="button"
                    class="btn-acao-circulo btn-desativar"
                    title="Desativar tipo de indicador"
                    aria-label="Desativar tipo de indicador"
                    @click="desativarTipo(tipo)"
                  >
                    ×
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-else class="cartao">
      <div class="cartao-header cartao-header--tabela gold-header-imoveis">
        <div>
          <h2 class="cartao-titulo">Imóveis publicados</h2>
          <p class="cartao-sub">
            Consulta somente leitura dos registros congelados na Gold, com os sete indicadores publicados para cada imóvel.
          </p>
        </div>

        <label class="campo-busca">
          <span class="sr-only">Buscar por código do imóvel</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input v-model="filtroImovel" type="search" placeholder="Buscar código do imóvel…" />
        </label>
      </div>

      <div v-if="erroImoveis" class="banner-erro">✕ {{ erroImoveis }}</div>

      <div v-if="carregando && !imoveis.length" class="estado-carregando">
        <div class="spinner"></div>
        <span>Carregando imóveis publicados…</span>
      </div>

      <div v-else-if="!imoveisFiltrados.length" class="estado-vazio">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </svg>
        <p>{{ imoveis.length ? 'Nenhum imóvel corresponde à busca.' : 'Nenhum imóvel publicado encontrado.' }}</p>
      </div>

      <div v-else class="tabela-responsiva-wrapper">
        <table class="tabela-gold tabela-imoveis">
          <thead>
            <tr>
              <th>Código do imóvel</th>
              <th>Município (IBGE)</th>
              <th>Área (ha)</th>
              <th>Indicadores Gold</th>
              <th>Publicação</th>
              <th class="col-acoes-titulo">Consulta</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="imovel in imoveisFiltrados" :key="`${imovel.codImovel}-${imovel.indicadorVersaoId}`">
              <td>
                <code class="codigo-badge codigo-badge--imovel">{{ imovel.codImovel }}</code>
              </td>
              <td>{{ formatarIbge(imovel.municipioCodIbge) }}</td>
              <td>{{ formatarNumero(imovel.areaHa) }}</td>
              <td>
                <div class="indicadores-mini-grid">
                  <span v-for="indicador in indicadores" :key="indicador.codigo" class="indicador-mini" :title="indicador.titulo">
                    <strong>{{ indicador.codigo }}</strong>
                    <em>{{ valorIndicador(imovel, indicador.campo) }}</em>
                  </span>
                </div>
              </td>
              <td>{{ formatarData(imovel.dataPublicacao) }}</td>
              <td class="celula-acoes">
                <button
                  type="button"
                  class="btn-detalhe"
                  :disabled="buscandoImovel"
                  @click="abrirDetalheImovel(imovel)"
                >
                  {{ buscandoImovel ? 'Consultando…' : 'Ver detalhe' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <div v-if="modalTipoAberto" class="modal-overlay" @click.self="fecharModalTipo">
      <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="titulo-modal-tipo">
        <header class="modal-cabecalho">
          <div>
            <p class="etiqueta">CAMADA GOLD</p>
            <h2 id="titulo-modal-tipo">{{ editandoTipoId ? 'Editar tipo de indicador' : 'Novo tipo de indicador' }}</h2>
          </div>
          <button type="button" class="modal-fechar" aria-label="Fechar" @click="fecharModalTipo">×</button>
        </header>

        <form id="form-tipo-indicador" class="formulario-gold" @submit.prevent="salvarTipo">
          <div class="campo-grupo">
            <label class="rotulo" for="input-codigo">Código *</label>
            <input
              id="input-codigo"
              v-model="formTipo.codigo"
              class="input-campo"
              maxlength="20"
              required
              :disabled="Boolean(editandoTipoId) || enviandoTipo"
              placeholder="Ex.: ISAP"
            />
            <small class="ajuda-campo">
              {{ editandoTipoId ? 'O código não pode ser alterado após o cadastro.' : 'Até 20 caracteres. O backend normaliza para maiúsculas.' }}
            </small>
          </div>

          <div class="campo-grupo">
            <label class="rotulo" for="input-descricao">Descrição *</label>
            <textarea
              id="input-descricao"
              v-model="formTipo.descricao"
              class="input-campo textarea-campo"
              maxlength="200"
              rows="3"
              required
              :disabled="enviandoTipo"
              placeholder="Ex.: Índice de Sobreposição com Áreas Protegidas"
            ></textarea>
          </div>

          <label class="checkbox-custom">
            <input v-model="formTipo.temFonte" type="checkbox" :disabled="enviandoTipo" />
            <span class="checkbox-box"></span>
            <span class="checkbox-texto">Indicador possui fonte de dados disponível</span>
          </label>

          <label class="checkbox-custom">
            <input v-model="formTipo.ativo" type="checkbox" :disabled="enviandoTipo" />
            <span class="checkbox-box"></span>
            <span class="checkbox-texto">Tipo de indicador ativo</span>
          </label>

          <div v-if="erroForm" class="banner-erro banner-erro--form">✕ {{ erroForm }}</div>

          <div class="acoes-formulario">
            <button type="button" class="botao-secundario" :disabled="enviandoTipo" @click="fecharModalTipo">
              Cancelar
            </button>
            <button type="submit" class="botao-principal" :disabled="enviandoTipo">
              {{ enviandoTipo ? 'Salvando…' : (editandoTipoId ? 'Salvar alterações' : 'Cadastrar tipo') }}
            </button>
          </div>
        </form>
      </section>
    </div>

    <div v-if="detalheImovelAberto" class="modal-overlay" @click.self="fecharDetalheImovel">
      <section class="modal-card modal-card--detalhe" role="dialog" aria-modal="true" aria-labelledby="titulo-modal-imovel">
        <header class="modal-cabecalho">
          <div>
            <p class="etiqueta">GOLD · IMÓVEL PUBLICADO</p>
            <h2 id="titulo-modal-imovel">{{ imovelSelecionado?.codImovel || 'Imóvel' }}</h2>
          </div>
          <button type="button" class="modal-fechar" aria-label="Fechar" @click="fecharDetalheImovel">×</button>
        </header>

        <div v-if="buscandoImovel" class="estado-carregando estado-carregando--modal">
          <div class="spinner"></div>
          <span>Consultando detalhe do imóvel…</span>
        </div>

        <div v-else class="detalhe-imovel">
          <div v-if="erroDetalhe" class="banner-erro">✕ {{ erroDetalhe }}</div>

          <div class="detalhe-grid">
            <div class="detalhe-item">
              <span class="detalhe-label">Código do imóvel</span>
              <code>{{ imovelSelecionado?.codImovel || '—' }}</code>
            </div>
            <div class="detalhe-item">
              <span class="detalhe-label">Município (IBGE)</span>
              <strong>{{ formatarIbge(imovelSelecionado?.municipioCodIbge) }}</strong>
            </div>
            <div class="detalhe-item">
              <span class="detalhe-label">Área do imóvel</span>
              <strong>{{ formatarNumero(imovelSelecionado?.areaHa) }} ha</strong>
            </div>
            <div class="detalhe-item">
              <span class="detalhe-label">Versão do indicador</span>
              <strong>#{{ imovelSelecionado?.indicadorVersaoId || '—' }}</strong>
            </div>
            <div class="detalhe-item">
              <span class="detalhe-label">Publicado em</span>
              <strong>{{ formatarData(imovelSelecionado?.dataPublicacao) }}</strong>
            </div>
          </div>

          <div class="detalhe-secao">
            <div class="detalhe-secao-header">
              <h3>Indicadores publicados</h3>
              <span class="detalhe-secao-ajuda">NULL = ainda não calculável</span>
            </div>

            <div class="indicadores-detalhe-grid">
              <article v-for="indicador in indicadores" :key="indicador.codigo" class="indicador-card">
                <span class="indicador-card-codigo">{{ indicador.codigo }}</span>
                <strong>{{ valorIndicador(imovelSelecionado, indicador.campo) }}</strong>
                <small>{{ indicador.titulo }}</small>
              </article>
            </div>
          </div>
        </div>

        <footer class="modal-rodape">
          <button type="button" class="botao-secundario" @click="fecharDetalheImovel">Fechar</button>
        </footer>
      </section>
    </div>
  </div>
</template>

<style scoped src="../styles/views/GoldView.css"></style>
