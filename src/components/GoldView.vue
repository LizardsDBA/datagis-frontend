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
        <button class="botao-principal botao-principal--compacto" type="button" @click="abrirCadastroTipo">
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
              <th class="col-acoes-titulo">Ações</th>
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
              <td class="celula-acoes">
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

<style scoped>
.pagina-gold {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.topo-pagina {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.titulo {
  margin: 0.15rem 0 0.35rem;
  font-size: clamp(1.55rem, 2vw, 2rem);
}

.subtitulo {
  margin: 0;
  max-width: 58rem;
  color: var(--cor-slate-500);
  font-size: 0.92rem;
}

.etiqueta {
  margin: 0;
  color: var(--cor-primaria);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.btn-atualizar {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 2.5rem;
  padding: 0.65rem 0.95rem;
  border: 1px solid var(--cor-slate-300);
  border-radius: var(--raio-md);
  background: var(--cor-branco);
  color: var(--cor-slate-700);
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-atualizar:hover:not(:disabled) {
  border-color: var(--cor-primaria);
  color: var(--cor-primaria-hover);
  background: var(--cor-primaria-clara);
}

.btn-atualizar:disabled { opacity: 0.65; cursor: not-allowed; }
.icone-btn { width: 1rem; height: 1rem; }

.banner-sucesso,
.banner-erro {
  padding: 0.75rem 0.9rem;
  border-radius: var(--raio-md);
  border: 1px solid;
  font-size: 0.86rem;
  font-weight: 600;
}

.banner-sucesso {
  background: var(--status-sucesso-bg);
  border-color: var(--status-sucesso-borda);
  color: var(--status-sucesso-texto);
}

.banner-erro {
  background: var(--status-erro-bg);
  border-color: var(--status-erro-borda);
  color: var(--status-erro-texto);
}

.banner-erro--form { margin-top: 0.75rem; }

.resumo-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.9rem;
}

.resumo-card {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-height: 7.25rem;
  padding: 1.05rem 1.15rem;
  background: var(--cor-branco);
  border: 1px solid var(--cor-slate-200);
  border-radius: var(--raio-lg);
  box-shadow: var(--sombra-sm);
}

.resumo-label {
  color: var(--cor-slate-500);
  font-size: 0.78rem;
  font-weight: 700;
}

.resumo-valor {
  color: var(--cor-slate-900);
  font-size: 1.8rem;
  line-height: 1;
}

.resumo-valor--texto { font-size: 1.45rem; }
.resumo-detalhe { color: var(--cor-slate-400); font-size: 0.75rem; }

.abas {
  display: flex;
  gap: 0.4rem;
  padding: 0.35rem;
  background: var(--cor-slate-100);
  border: 1px solid var(--cor-slate-200);
  border-radius: var(--raio-lg);
  overflow-x: auto;
}

.aba {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.65rem 0.9rem;
  border: 1px solid transparent;
  border-radius: var(--raio-md);
  background: transparent;
  color: var(--cor-slate-600);
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.aba:hover { color: var(--cor-slate-900); }

.aba--ativa {
  background: var(--cor-branco);
  border-color: var(--cor-slate-200);
  color: var(--cor-primaria);
  box-shadow: var(--sombra-sm);
}

.aba-contagem {
  min-width: 1.5rem;
  padding: 0.1rem 0.35rem;
  border-radius: var(--raio-full);
  background: var(--cor-slate-100);
  color: var(--cor-slate-500);
  font-size: 0.7rem;
  text-align: center;
}

.cartao {
  overflow: hidden;
  background: var(--cor-branco);
  border: 1px solid var(--cor-slate-200);
  border-radius: var(--raio-lg);
  box-shadow: var(--sombra-sm);
}

.cartao-header {
  padding: 1.1rem 1.25rem;
}

.cartao-header--tabela {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.cartao-titulo {
  margin: 0;
  color: var(--cor-slate-900);
  font-size: 1rem;
}

.cartao-sub {
  margin: 0.25rem 0 0;
  color: var(--cor-slate-500);
  font-size: 0.78rem;
  line-height: 1.5;
}

.botao-principal,
.botao-secundario,
.btn-detalhe {
  border-radius: var(--raio-md);
  padding: 0.7rem 0.95rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
}

.botao-principal {
  border: 1px solid var(--cor-primaria);
  background: linear-gradient(135deg, #16a34a, #15803d);
  color: #fff;
  box-shadow: var(--sombra-sm);
}

.botao-principal:hover:not(:disabled) { filter: brightness(0.98); transform: translateY(-1px); }
.botao-principal:disabled,
.botao-secundario:disabled,
.btn-detalhe:disabled { opacity: 0.6; cursor: not-allowed; }
.botao-principal--compacto { white-space: nowrap; }

.botao-secundario {
  border: 1px solid var(--cor-slate-300);
  background: var(--cor-branco);
  color: var(--cor-slate-700);
}

.botao-secundario:hover:not(:disabled) {
  background: var(--cor-slate-50);
  border-color: var(--cor-slate-400);
}

.campo-busca {
  position: relative;
  display: flex;
  align-items: center;
  width: min(22rem, 100%);
}

.campo-busca svg {
  position: absolute;
  left: 0.7rem;
  width: 1rem;
  height: 1rem;
  color: var(--cor-slate-400);
  pointer-events: none;
}

.campo-busca input {
  width: 100%;
  min-height: 2.45rem;
  padding: 0.55rem 0.75rem 0.55rem 2.1rem;
  border: 1px solid var(--cor-slate-300);
  border-radius: var(--raio-md);
  outline: none;
}

.campo-busca input:focus,
.input-campo:focus {
  border-color: #86efac;
  box-shadow: 0 0 0 3px var(--cor-primaria-glow);
}

.tabela-gold {
  width: 100%;
  border-collapse: collapse;
  min-width: 760px;
}

.tabela-gold th,
.tabela-gold td {
  padding: 0.85rem 0.95rem;
  border-bottom: 1px solid var(--cor-slate-100);
  text-align: left;
  vertical-align: middle;
}

.tabela-gold th {
  background: var(--cor-slate-50);
  color: var(--cor-slate-500);
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.tabela-gold tbody tr:last-child td { border-bottom: 0; }
.tabela-gold tbody tr:hover td { background: #fbfefc; }

.tabela-imoveis { min-width: 1020px; }
.codigo-badge {
  display: inline-block;
  padding: 0.25rem 0.45rem;
  border-radius: var(--raio-sm);
  background: var(--cor-slate-100);
  color: var(--cor-slate-700);
  font-family: var(--fonte-mono);
  font-size: 0.76rem;
  font-weight: 700;
  white-space: nowrap;
}

.codigo-badge--imovel {
  background: #eff6ff;
  color: #1d4ed8;
}

.celula-titulo { color: var(--cor-slate-800); font-size: 0.86rem; }

.celula-acoes { white-space: nowrap; }
.grupo-botoes-acoes { display: inline-flex; gap: 0.45rem; }

.btn-acao-circulo {
  width: 2rem;
  height: 2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid var(--cor-slate-200);
  border-radius: 50%;
  background: var(--cor-branco);
  color: var(--cor-slate-600);
  cursor: pointer;
}

.btn-acao-circulo:hover { background: var(--cor-slate-50); border-color: var(--cor-slate-300); }
.btn-desativar:hover { color: var(--status-erro-texto); border-color: var(--status-erro-borda); background: var(--status-erro-bg); }

.indicadores-mini-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(5.2rem, auto));
  gap: 0.3rem;
}

.indicador-mini {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.35rem;
  padding: 0.22rem 0.4rem;
  border: 1px solid var(--cor-slate-200);
  border-radius: var(--raio-sm);
  background: var(--cor-slate-50);
  white-space: nowrap;
}

.indicador-mini strong {
  color: var(--cor-slate-500);
  font-size: 0.66rem;
}

.indicador-mini em {
  color: var(--cor-slate-800);
  font-size: 0.7rem;
  font-style: normal;
  font-weight: 800;
  font-family: var(--fonte-mono);
}

.btn-detalhe {
  padding: 0.5rem 0.75rem;
  border: 1px solid #bbf7d0;
  background: #f0fdf4;
  color: #166534;
}

.btn-detalhe:hover:not(:disabled) { background: #dcfce7; }

.estado-carregando,
.estado-vazio {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 12rem;
  padding: 2rem 1rem;
  text-align: center;
  color: var(--cor-slate-500);
}

.estado-vazio svg { width: 2.5rem; height: 2.5rem; color: var(--cor-slate-400); }
.estado-vazio p { margin: 0; font-weight: 700; color: var(--cor-slate-600); }
.estado-vazio small { color: var(--cor-slate-400); }

.spinner {
  width: 1.25rem;
  height: 1.25rem;
  border: 2px solid var(--cor-slate-200);
  border-top-color: var(--cor-primaria);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(15, 23, 42, 0.54);
}

.modal-card {
  width: min(42rem, 100%);
  max-height: min(90vh, 52rem);
  overflow: auto;
  background: var(--cor-branco);
  border: 1px solid var(--cor-slate-200);
  border-radius: 16px;
  box-shadow: var(--sombra-modal);
}

.modal-card--detalhe { width: min(60rem, 100%); }

.modal-cabecalho {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.15rem 1.25rem;
  border-bottom: 1px solid var(--cor-slate-200);
}

.modal-cabecalho h2 {
  margin: 0.15rem 0 0;
  color: var(--cor-slate-900);
  font-size: 1.15rem;
}

.modal-fechar {
  width: 2.1rem;
  height: 2.1rem;
  border: 1px solid var(--cor-slate-200);
  border-radius: 50%;
  background: var(--cor-branco);
  color: var(--cor-slate-500);
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
}

.modal-fechar:hover { background: var(--cor-slate-50); color: var(--cor-slate-900); }

.formulario-gold {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.25rem;
}

.campo-grupo { display: flex; flex-direction: column; gap: 0.4rem; }
.rotulo { color: var(--cor-slate-700); font-size: 0.82rem; font-weight: 700; }
.input-campo {
  width: 100%;
  padding: 0.7rem 0.75rem;
  border: 1px solid var(--cor-slate-300);
  border-radius: var(--raio-md);
  outline: none;
  color: var(--cor-slate-800);
  background: var(--cor-branco);
}

.input-campo:disabled { background: var(--cor-slate-50); color: var(--cor-slate-500); cursor: not-allowed; }
.textarea-campo { resize: vertical; }
.ajuda-campo { color: var(--cor-slate-400); font-size: 0.72rem; line-height: 1.45; }

.checkbox-custom {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  color: var(--cor-slate-700);
  font-size: 0.85rem;
  cursor: pointer;
}

.checkbox-custom input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.checkbox-box {
  width: 1.15rem;
  height: 1.15rem;
  flex: 0 0 auto;
  border: 2px solid var(--cor-slate-300);
  border-radius: 4px;
  background: var(--cor-branco);
}

.checkbox-custom input:checked + .checkbox-box {
  border-color: var(--cor-primaria);
  background: var(--cor-primaria);
  box-shadow: inset 0 0 0 3px var(--cor-branco);
}

.acoes-formulario,
.modal-rodape {
  display: flex;
  justify-content: flex-end;
  gap: 0.65rem;
}

.modal-rodape {
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--cor-slate-200);
}

.estado-carregando--modal { min-height: 16rem; }

.detalhe-imovel { padding: 1.25rem; }

.detalhe-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.detalhe-item {
  padding: 0.8rem;
  border: 1px solid var(--cor-slate-200);
  border-radius: var(--raio-md);
  background: var(--cor-slate-50);
}

.detalhe-label {
  display: block;
  margin-bottom: 0.25rem;
  color: var(--cor-slate-400);
  font-size: 0.69rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.detalhe-item strong,
.detalhe-item code { color: var(--cor-slate-800); font-size: 0.84rem; }

.detalhe-secao { margin-top: 1.15rem; }
.detalhe-secao-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.7rem;
}

.detalhe-secao-header h3 {
  margin: 0;
  font-size: 0.95rem;
}

.detalhe-secao-ajuda { color: var(--cor-slate-400); font-size: 0.72rem; }

.indicadores-detalhe-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.7rem;
}

.indicador-card {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-height: 7rem;
  padding: 0.85rem;
  border: 1px solid var(--cor-slate-200);
  border-radius: var(--raio-md);
  background: var(--cor-branco);
}

.indicador-card-codigo {
  color: var(--cor-primaria);
  font-family: var(--fonte-mono);
  font-size: 0.72rem;
  font-weight: 800;
}

.indicador-card strong { color: var(--cor-slate-900); font-size: 1.35rem; }
.indicador-card small { color: var(--cor-slate-500); font-size: 0.72rem; line-height: 1.35; }

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 900px) {
  .topo-pagina,
  .cartao-header--tabela,
  .gold-header-imoveis { flex-direction: column; }
  .resumo-grid { grid-template-columns: 1fr; }
  .campo-busca { width: 100%; }
  .detalhe-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .indicadores-detalhe-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 600px) {
  .detalhe-grid,
  .indicadores-detalhe-grid { grid-template-columns: 1fr; }
  .modal-overlay { padding: 0.5rem; }
}
</style>
