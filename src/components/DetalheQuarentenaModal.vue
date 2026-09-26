<script setup>
import { ref, computed } from 'vue'
import {
  descartarItem,
  iniciarAnaliseItem,
  reprocessarItem,
  adicionarValorDominio,
  buscarTiposAreaProtegida,
} from '../services/quarentenaService'

const props = defineProps({
  item: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['close', 'atualizado'])

const enviando = ref(false)
const erroAcao = ref(null)
const motivoDescarte = ref('')
const modoEdicao = ref(false)
const copiado = ref(false)
const copiadoGeometria = ref(false)
const payloadEditado = ref(formatarJson(props.item.payloadOriginal))

// Helpers para conversão bidirecional entre WKT e Lista de Coordenadas JSON
function extrairTipoWkt(wkt) {
  if (!wkt || typeof wkt !== 'string') return 'POLYGON'
  const w = wkt.trim().toUpperCase()
  if (w.startsWith('MULTIPOLYGON')) return 'MULTIPOLYGON'
  if (w.startsWith('POLYGON')) return 'POLYGON'
  if (w.startsWith('POINT')) return 'POINT'
  if (w.startsWith('LINESTRING')) return 'LINESTRING'
  return 'POLYGON'
}

function extrairParesCoordenadas(texto) {
  if (!texto || typeof texto !== 'string') return []
  const limpo = texto.trim()

  if (limpo.startsWith('[')) {
    try {
      const parsed = JSON.parse(limpo)
      if (Array.isArray(parsed) && parsed.length > 0 && Array.isArray(parsed[0])) {
        // Se for array 1D de pontos [ [lon, lat], ... ]
        if (typeof parsed[0][0] === 'number') return parsed
        // Se for aninhado [ [ [lon, lat], ... ] ]
        if (Array.isArray(parsed[0][0])) return parsed[0]
      }
    } catch (e) {}
  }

  // Regex para capturar números decimais [lon, lat] de WKT ou texto livre
  const coordRegex = /(-?\d+\.?\d*(?:[eE][-+]?\d+)?)\s+(-?\d+\.?\d*(?:[eE][-+]?\d+)?)/g
  const lista = []
  let match
  while ((match = coordRegex.exec(limpo)) !== null) {
    const lon = parseFloat(match[1])
    const lat = parseFloat(match[2])
    if (!isNaN(lon) && !isNaN(lat)) {
      lista.push([lon, lat])
    }
  }
  return lista
}

function formatarCoordenadasEmListaJson(coords) {
  if (!coords || !coords.length) return '[]'
  const linhas = coords.map((p) => `  [${p[0]}, ${p[1]}]`)
  return '[\n' + linhas.join(',\n') + '\n]'
}

function converterParaWkt(textoJsonOuWkt, tipoPrimitivo = 'POLYGON') {
  if (!textoJsonOuWkt || !textoJsonOuWkt.trim()) return ''
  const limpo = textoJsonOuWkt.trim()

  if (limpo.toUpperCase().startsWith('POLYGON') || limpo.toUpperCase().startsWith('MULTIPOLYGON')) {
    return limpo
  }

  const coords = extrairParesCoordenadas(limpo)
  if (coords.length > 0) {
    const pts = coords.map((c) => `${c[0]} ${c[1]}`).join(', ')
    if (tipoPrimitivo.toUpperCase().includes('MULTI')) {
      return `MULTIPOLYGON (((${pts})))`
    }
    return `POLYGON ((${pts}))`
  }

  return limpo
}

// Inicialização: carrega as coordenadas no formato de lista JSON separada
const tipoGeometriaOriginal = ref(extrairTipoWkt(props.item.geometriaWkt || props.item.valorRecebido))
const coordsIniciais = extrairParesCoordenadas(props.item.geometriaWkt || props.item.valorRecebido)
const geometriaEditada = ref(
  coordsIniciais.length > 0
    ? formatarCoordenadasEmListaJson(coordsIniciais)
    : (props.item.geometriaWkt || props.item.valorRecebido || '')
)
const modoVisualizacaoWkt = ref(false)

const totalVertices = computed(() => {
  return extrairParesCoordenadas(geometriaEditada.value).length
})

function alternarModoVisualizacaoGeometria() {
  modoVisualizacaoWkt.value = !modoVisualizacaoWkt.value
  if (modoVisualizacaoWkt.value) {
    geometriaEditada.value = converterParaWkt(geometriaEditada.value, tipoGeometriaOriginal.value)
  } else {
    const coords = extrairParesCoordenadas(geometriaEditada.value)
    geometriaEditada.value = formatarCoordenadasEmListaJson(coords)
  }
}

// Identificação estrita de erros de geometria
const isErroGeometria = computed(() => {
  const cod = (props.item.tipoErroCodigo || '').toUpperCase()
  const campo = (props.item.campoProblema || '').toLowerCase()
  const codigosGeometria = [
    'GEOMETRIA_NULA',
    'GEOMETRIA_MALFORMADA',
    'GEOMETRIA_INVALIDA',
    'GEOMETRIA_TIPO_INCOMPATIVEL',
    'FORA_DO_RECORTE_TERRITORIAL'
  ]
  return codigosGeometria.includes(cod) ||
         cod.includes('GEOMETRIA') ||
         cod.includes('TERRITORIAL') ||
         campo === 'geometria' ||
         campo === 'geometria_wkt' ||
         campo === 'geometry' ||
         campo === 'geom'
})

// Estado para Adição ao Domínio Dinâmico
const modoAdicionarDominio = ref(false)
const salvandoDominio = ref(false)
const sucessoDominio = ref(null)
const novoCodigo = ref('')
const novaDescricao = ref('')
const tipoAreaProtegida = ref('')
const categoriaAreaProtegida = ref('')

// Estado específico para relacionamento de Área Protegida (Tipo <-> Categoria)
const tiposAreaProtegidaDisponiveis = ref([])
const carregandoTipos = ref(false)
const modoNovoTipo = ref(false)
const tipoSelecionadoId = ref(null)
const novoTipoDescricao = ref('')
const novoTipoCodigo = ref('')
const sugestaoTipoEncontrada = ref(false)

function formatarJson(raw) {
  if (!raw) return ''
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return JSON.stringify(parsed, null, 2)
  } catch (e) {
    return String(raw)
  }
}

function copiarPayload() {
  navigator.clipboard.writeText(payloadEditado.value)
  copiado.value = true
  setTimeout(() => { copiado.value = false }, 2000)
}

function copiarGeometria() {
  if (!geometriaEditada.value) return
  navigator.clipboard.writeText(geometriaEditada.value)
  copiadoGeometria.value = true
  setTimeout(() => { copiadoGeometria.value = false }, 2000)
}

function gerarSlug(texto) {
  if (!texto) return ''
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

const podeAdicionarAoDominio = computed(() => {
  if (props.item.tipoErroCodigo !== 'VALOR_FORA_DO_DOMINIO') return false
  if (props.item.statusAnaliseCodigo === 'DESCARTADO' || props.item.statusAnaliseCodigo === 'CORRIGIDO_REPROCESSADO') return false
  const tab = props.item.tabelaReferencia
  if (!tab || tab === 'unidade_federativa' || tab === 'uf') return false
  return true
})

async function abrirFormularioDominio() {
  modoAdicionarDominio.value = !modoAdicionarDominio.value
  if (modoAdicionarDominio.value) {
    novaDescricao.value = props.item.valorRecebido || ''
    novoCodigo.value = gerarSlug(props.item.valorRecebido || '')
    tipoAreaProtegida.value = props.item.tipoAreaProtegida || ''
    categoriaAreaProtegida.value = props.item.categoriaAreaProtegida || ''
    modoNovoTipo.value = false
    novoTipoDescricao.value = ''
    novoTipoCodigo.value = ''
    tipoSelecionadoId.value = null
    sugestaoTipoEncontrada.value = false
    sucessoDominio.value = null
    erroAcao.value = null

    if (props.item.tabelaReferencia === 'categoria_area_protegida') {
      carregandoTipos.value = true
      try {
        const tipos = await buscarTiposAreaProtegida()
        tiposAreaProtegidaDisponiveis.value = tipos || []

        // Sugestão automática: se o registro tem tipo_area_protegida no payload ou na quarentena
        const tipoOriginal = (props.item.tipoAreaProtegida || '').trim().toUpperCase()
        if (tipoOriginal && tiposAreaProtegidaDisponiveis.value.length > 0) {
          const match = tiposAreaProtegidaDisponiveis.value.find((t) => {
            const cod = (t.CODIGO || t.codigo || '').toUpperCase()
            const desc = (t.DESCRICAO || t.descricao || '').toUpperCase()
            return cod === tipoOriginal || desc === tipoOriginal || tipoOriginal.includes(cod) || cod.includes(tipoOriginal)
          })
          if (match) {
            tipoSelecionadoId.value = match.ID || match.id
            sugestaoTipoEncontrada.value = true
          }
        }
        if (!tipoSelecionadoId.value && tiposAreaProtegidaDisponiveis.value.length > 0) {
          tipoSelecionadoId.value = tiposAreaProtegidaDisponiveis.value[0].ID || tiposAreaProtegidaDisponiveis.value[0].id
        }
      } catch (e) {
        console.warn('Erro ao carregar tipos de áreas protegidas:', e)
      } finally {
        carregandoTipos.value = false
      }
    }
  }
}

async function onSalvarDominio() {
  if (!novaDescricao.value.trim()) {
    erroAcao.value = 'A descrição do novo termo é obrigatória.'
    return
  }

  if (props.item.tabelaReferencia === 'categoria_area_protegida') {
    if (modoNovoTipo.value && !novoTipoDescricao.value.trim()) {
      erroAcao.value = 'Informe a descrição do novo tipo de área protegida.'
      return
    }
    if (!modoNovoTipo.value && !tipoSelecionadoId.value) {
      erroAcao.value = 'Selecione um tipo de área protegida para vincular a esta categoria.'
      return
    }
  }

  salvandoDominio.value = true
  erroAcao.value = null
  sucessoDominio.value = null
  try {
    const cod = novoCodigo.value.trim() ? novoCodigo.value.trim() : gerarSlug(novaDescricao.value)
    const dadosEnvio = {
      tabela: props.item.tabelaReferencia,
      codigo: cod,
      descricao: novaDescricao.value.trim(),
      quarentenaItemId: props.item.id,
      entidade: props.item.entidade,
      analistaId: 1,
    }

    if (props.item.tabelaReferencia === 'categoria_area_protegida') {
      if (modoNovoTipo.value) {
        dadosEnvio.criarNovoTipo = true
        dadosEnvio.novoTipoAreaProtegidaDescricao = novoTipoDescricao.value.trim()
        dadosEnvio.novoTipoAreaProtegidaCodigo = novoTipoCodigo.value.trim() ? novoTipoCodigo.value.trim() : gerarSlug(novoTipoDescricao.value)
      } else {
        dadosEnvio.tipoAreaProtegidaId = tipoSelecionadoId.value
      }
    }

    await adicionarValorDominio(dadosEnvio)
    sucessoDominio.value = `Termo "${cod}" cadastrado com sucesso em "${props.item.tabelaReferencia}"!`
    // Aciona a revalidação imediata para aprovação e transição do item
    await onReprocessar()
  } catch (err) {
    erroAcao.value = err.message
  } finally {
    salvandoDominio.value = false
  }
}

const badgeTipoErroClass = computed(() => {
  const err = props.item.tipoErroCodigo || ''
  if (err.includes('GEOMETRIA') || err.includes('TERRITORIAL')) return 'badge-tag--espacial'
  if (err.includes('CPF') || err.includes('DOMINIO') || err.includes('REFERENCIA')) return 'badge-tag--alerta'
  if (err.includes('REGRESSAO')) return 'badge-tag--erro'
  return 'badge-tag--neutro'
})

const badgeStatusClass = computed(() => {
  const st = props.item.statusAnaliseCodigo || ''
  if (st === 'PENDENTE') return 'badge-tag--alerta'
  if (st === 'EM_ANALISE') return 'badge-tag--info'
  if (st === 'CORRIGIDO_REPROCESSADO') return 'badge-tag--sucesso'
  if (st === 'DESCARTADO') return 'badge-tag--neutro'
  return 'badge-tag--neutro'
})

async function onIniciarAnalise() {
  enviando.value = true
  erroAcao.value = null
  try {
    await iniciarAnaliseItem(props.item.entidade, props.item.id)
    emit('atualizado')
    emit('close')
  } catch (err) {
    erroAcao.value = err.message
  } finally {
    enviando.value = false
  }
}

async function onDescartar() {
  if (!motivoDescarte.value.trim()) {
    erroAcao.value = 'Informe a justificativa para o descarte deste registro.'
    return
  }
  enviando.value = true
  erroAcao.value = null
  try {
    await descartarItem(props.item.entidade, props.item.id, motivoDescarte.value)
    emit('atualizado')
    emit('close')
  } catch (err) {
    erroAcao.value = err.message
  } finally {
    enviando.value = false
  }
}

async function onReprocessar() {
  enviando.value = true
  erroAcao.value = null
  try {
    let res
    if (isErroGeometria.value) {
      const wktFinal = converterParaWkt(geometriaEditada.value, tipoGeometriaOriginal.value)
      res = await reprocessarItem(props.item.entidade, props.item.id, null, 1, wktFinal)
    } else {
      res = await reprocessarItem(props.item.entidade, props.item.id, payloadEditado.value, 1, null)
    }
    emit('atualizado', res)
    emit('close')
  } catch (err) {
    erroAcao.value = err.message
    emit('atualizado')
  } finally {
    enviando.value = false
  }
}
</script>


<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-container">
      <!-- Topo / Cabeçalho -->
      <header class="modal-header">
        <div class="header-info">
          <div class="header-tag">
            <span class="tag-entidade">{{ item.entidade }}</span>
            <span class="badge-tag" :class="badgeStatusClass">
              {{ item.statusAnaliseDescricao || item.statusAnaliseCodigo }}
            </span>
          </div>
          <h2 class="chave-registro">{{ item.chaveIdentificacao || 'Registro sem chave natural' }}</h2>
          <span class="fonte-origem">
            Fonte: <strong>{{ item.fonteDadoNome || ('ID ' + item.fonteDadoId) }}</strong> • Lote #{{ item.loteIngestaoId }}
          </span>
        </div>
        <button class="btn-fechar" @click="emit('close')" title="Fechar modal">&times;</button>
      </header>

      <div class="modal-corpo">
        <!-- Alerta do Erro / Inconsistência -->
        <section class="secao-inconsistencia">
          <div class="inconsistencia-topo">
            <span class="badge-tag" :class="badgeTipoErroClass">
              {{ item.tipoErroCodigo }}
            </span>
            <span class="erro-descricao">{{ item.tipoErroDescricao }}</span>
          </div>

          <div class="detalhes-grid">
            <div class="detalhe-item">
              <span class="label">Campo com Inconsistência:</span>
              <code class="valor-destaque">{{ item.campoProblema || 'Não especificado' }}</code>
            </div>
            <div class="detalhe-item">
              <span class="label">Valor Recebido da Origem:</span>
              <span class="valor-recebido">{{ item.valorRecebido !== null ? item.valorRecebido : '(nulo / ausente)' }}</span>
            </div>
          </div>

          <div class="motivo-box">
            <strong>Motivo Completo da Rejeição:</strong>
            <p>{{ item.motivoRejeicao }}</p>
          </div>
        </section>

        <!-- Painel Rápido de Adição ao Domínio (RN / Domínio Dinâmico) -->
        <section v-if="podeAdicionarAoDominio" class="secao-dominio">
          <div class="dominio-header">
            <div class="dominio-info">
              <span class="icone-sparkle">✨</span>
              <div>
                <h4>Adicionar ao Domínio Silver</h4>
                <p>O valor rejeitado pode ser inserido na tabela de referência <code>{{ item.tabelaReferencia }}</code>.</p>
              </div>
            </div>
            <button
              type="button"
              class="btn-toggle-dominio"
              :class="{ 'ativo': modoAdicionarDominio }"
              @click="abrirFormularioDominio"
            >
              {{ modoAdicionarDominio ? 'Ocultar Formulário' : '+ Adicionar ao Domínio' }}
            </button>
          </div>

          <div v-if="modoAdicionarDominio" class="dominio-formulario">
            <div class="grid-dominio-campos">
              <div class="campo-grupo">
                <label class="label">Tabela de Referência:</label>
                <input type="text" class="campo-texto campo-readonly" :value="item.tabelaReferencia" readonly />
              </div>
              <div class="campo-grupo">
                <label class="label">Código Canônico (Slug):</label>
                <input
                  v-model="novoCodigo"
                  type="text"
                  class="campo-texto"
                  placeholder="Ex.: DESTRUICAO, PARNA"
                  maxlength="40"
                />
                <small class="campo-ajuda">Padronizado em caixa-alta sem acentos.</small>
              </div>
              <div class="campo-grupo campo-full">
                <label class="label">Descrição Oficial do Valor:</label>
                <input
                  v-model="novaDescricao"
                  type="text"
                  class="campo-texto"
                  placeholder="Descrição do termo..."
                  maxlength="200"
                />
              </div>

              <!-- Contexto relacional para Área Protegida -->
              <div v-if="item.tabelaReferencia === 'categoria_area_protegida'" class="campo-grupo campo-full painel-tipo-ap">
                <div class="tipo-ap-header">
                  <label class="label">Vínculo com Tipo de Área Protegida *</label>
                  <div class="tipo-ap-botoes">
                    <button
                      type="button"
                      class="btn-opcao-tipo"
                      :class="{ 'btn-opcao-tipo--ativo': !modoNovoTipo }"
                      @click="modoNovoTipo = false"
                    >
                      Selecionar Tipo Existente
                    </button>
                    <button
                      type="button"
                      class="btn-opcao-tipo"
                      :class="{ 'btn-opcao-tipo--ativo': modoNovoTipo }"
                      @click="modoNovoTipo = true"
                    >
                      + Cadastrar Novo Tipo
                    </button>
                  </div>
                </div>

                <!-- Modo 1: Selecionar Tipo Existente -->
                <div v-if="!modoNovoTipo" class="tipo-ap-conteudo">
                  <div v-if="carregandoTipos" class="texto-carregando">
                    Carregando tipos cadastrados...
                  </div>
                  <div v-else class="campo-grupo">
                    <select v-model="tipoSelecionadoId" class="campo-texto campo-select">
                      <option :value="null" disabled>Selecione um tipo de área protegida...</option>
                      <option
                        v-for="tipo in tiposAreaProtegidaDisponiveis"
                        :key="tipo.ID || tipo.id"
                        :value="tipo.ID || tipo.id"
                      >
                        {{ tipo.DESCRICAO || tipo.descricao }} ({{ tipo.CODIGO || tipo.codigo }})
                      </option>
                    </select>
                    <small v-if="sugestaoTipoEncontrada" class="campo-ajuda dica-sugestao">
                      ✨ Pré-selecionado automaticamente a partir do registro bruto original ({{ item.tipoAreaProtegida }}).
                    </small>
                  </div>
                </div>

                <!-- Modo 2: Criar Novo Tipo -->
                <div v-else class="tipo-ap-conteudo novo-tipo-grid">
                  <div class="campo-grupo">
                    <label class="label-sm">Descrição do Novo Tipo *</label>
                    <input
                      v-model="novoTipoDescricao"
                      type="text"
                      class="campo-texto"
                      placeholder="Ex.: Reserva Biológica Municipal"
                      maxlength="200"
                    />
                  </div>
                  <div class="campo-grupo">
                    <label class="label-sm">Código do Novo Tipo (Slug)</label>
                    <input
                      v-model="novoTipoCodigo"
                      type="text"
                      class="campo-texto"
                      placeholder="Ex.: REBIO_MUNICIPAL"
                      maxlength="40"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div class="dominio-acoes">
              <button
                type="button"
                class="btn-cancelar-sm"
                @click="modoAdicionarDominio = false"
                :disabled="salvandoDominio"
              >
                Cancelar
              </button>
              <button
                type="button"
                class="btn-salvar-dominio"
                @click="onSalvarDominio"
                :disabled="salvandoDominio || !novaDescricao.trim()"
              >
                {{ salvandoDominio ? 'Cadastrando & Revalidando...' : 'Salvar no Domínio & Revalidar' }}
              </button>
            </div>
          </div>

          <div v-if="sucessoDominio" class="alerta-sucesso">
            ✓ {{ sucessoDominio }}
          </div>
        </section>

        <!-- Editor de Polígono / Geometria Completa - Exclusivo para Erros de Geometria -->
        <section v-if="isErroGeometria" class="secao-geometria">
          <div class="geometria-header">
            <div class="geometria-titulo-container">
              <div class="titulo-linha">
                <span class="icone-gis">🗺️</span>
                <h3>Lista de Coordenadas do Polígono</h3>
                <span class="badge-srid">SRID 4674 • SIRGAS 2000</span>
                <span v-if="totalVertices > 0" class="badge-vertices">{{ totalVertices }} vértices</span>
              </div>
              <p class="geometria-sub">Cada coordenada está separada em formato de lista [Longitude, Latitude] para fácil inspeção e correção manual</p>
            </div>
            <div class="geometria-acoes">
              <button type="button" class="btn-secundario-sm" @click="alternarModoVisualizacaoGeometria" :title="modoVisualizacaoWkt ? 'Ver lista de coordenadas' : 'Ver WKT completo'">
                {{ modoVisualizacaoWkt ? 'Formato Lista [JSON]' : 'Formato WKT OGC' }}
              </button>
              <button type="button" class="btn-copiar-wkt" @click="copiarGeometria" title="Copiar coordenadas para a área de transferência">
                {{ copiadoGeometria ? '✓ Copiado!' : (modoVisualizacaoWkt ? 'Copiar WKT' : 'Copiar Lista [JSON]') }}
              </button>
            </div>
          </div>

          <div class="geometria-editor">
            <div class="editor-subtitulo-linha">
              <label class="label">
                {{ modoVisualizacaoWkt ? 'Geometria WKT (Linha Contínua):' : 'Coordenadas do Polígono em Lista [Longitude, Latitude]:' }}
              </label>
              <span class="dica-contador" v-if="geometriaEditada">{{ geometriaEditada.length }} caracteres • {{ totalVertices }} pontos</span>
            </div>
            <textarea
              v-model="geometriaEditada"
              class="campo-textarea campo-textarea--geometria"
              rows="11"
              :placeholder="modoVisualizacaoWkt ? 'POLYGON ((...))' : '[\n  [-51.4, -24.2],\n  [-51.3, -24.2]\n]'"
              spellcheck="false"
            ></textarea>
            <div class="geometria-guia">
              <div class="guia-item">
                <span class="guia-bullet">📍</span>
                <span><strong>Formato das Coordenadas:</strong> Lista ordenada de pares <code>[longitude, latitude]</code>. O primeiro e o último ponto devem ser iguais para fechar o polígono.</span>
              </div>
              <div class="guia-item">
                <span class="guia-bullet">📐</span>
                <span><strong>Recorte Territorial do Paraná:</strong> Longitude entre <code>-55.00</code> e <code>-47.50</code>, Latitude entre <code>-27.20</code> e <code>-22.00</code>.</span>
              </div>
            </div>
          </div>
        </section>

        <!-- Visualizador e Editor do Payload JSON (Exibido apenas quando NÃO for erro de geometria) -->
        <section v-else class="secao-payload">
          <div class="payload-header">
            <div>
              <h3>Payload Original (Camada Bronze)</h3>
              <p class="payload-sub">Dados brutos capturados na ingestão</p>
            </div>
            <div class="payload-acoes">
              <button class="btn-copiar-json" @click="copiarPayload" title="Copiar JSON para a área de transferência">
                {{ copiado ? '✓ Copiado!' : 'Copiar JSON' }}
              </button>
              <button class="btn-secundario-sm" @click="modoEdicao = !modoEdicao">
                {{ modoEdicao ? 'Visualizar Formatado' : 'Editar Correção Manual' }}
              </button>
            </div>
          </div>

          <div v-if="!modoEdicao" class="json-viewer">
            <pre><code>{{ formatarJson(item.payloadOriginal) }}</code></pre>
          </div>

          <div v-else class="json-editor">
            <label class="label">Correção Manual pelo Operador (RN007):</label>
            <textarea
              v-model="payloadEditado"
              class="campo-textarea"
              rows="9"
              placeholder="Ajuste os atributos no payload JSON..."
            ></textarea>
            <small class="dica">O operador pode corrigir manualmente códigos de domínio, nomes ou atributos faltantes. Ao revalidar, o registro é aprovado e aguarda a liberação conjunta do lote para ser transferido à Silver.</small>
          </div>
        </section>

        <!-- Formulário de Descarte com Justificativa -->
        <section class="secao-descarte" v-if="item.statusAnaliseCodigo !== 'DESCARTADO' && item.statusAnaliseCodigo !== 'CORRIGIDO_REPROCESSADO'">
          <label class="label">Justificativa para Descarte do Registro (se irrecuperável):</label>
          <input
            v-model="motivoDescarte"
            type="text"
            class="campo-texto"
            placeholder="Ex.: Imóvel cancelado na base original; registro teste sem correspondência..."
          />
        </section>

        <div v-if="erroAcao" class="alerta-erro">
          ✕ {{ erroAcao }}
        </div>
      </div>

      <!-- Rodapé com Ações -->
      <footer class="modal-footer">
        <button class="btn-cancelar" @click="emit('close')" :disabled="enviando">
          Fechar
        </button>

        <div class="acoes-direita">
          <button
            v-if="podeAdicionarAoDominio && !modoAdicionarDominio"
            type="button"
            class="btn-acao-dominio"
            @click="abrirFormularioDominio"
            :disabled="enviando || salvandoDominio"
          >
            + Adicionar ao Domínio
          </button>

          <button
            v-if="item.statusAnaliseCodigo === 'PENDENTE'"
            class="btn-analise"
            @click="onIniciarAnalise"
            :disabled="enviando"
          >
            Iniciar Análise
          </button>

          <button
            v-if="item.statusAnaliseCodigo !== 'DESCARTADO' && item.statusAnaliseCodigo !== 'CORRIGIDO_REPROCESSADO'"
            class="btn-descartar"
            @click="onDescartar"
            :disabled="enviando"
          >
            Descartar Registro
          </button>

          <button
            v-if="item.statusAnaliseCodigo !== 'CORRIGIDO_REPROCESSADO'"
            class="btn-reprocessar"
            @click="onReprocessar"
            :disabled="enviando"
          >
            {{ enviando ? 'Revalidando...' : 'Revalidar & Aprovar' }}
          </button>
        </div>
      </footer>

    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 1rem;
}

.modal-container {
  background: #ffffff;
  border-radius: 14px;
  width: 100%;
  max-width: 52rem;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  border: 1px solid #e2e8f0;
}

.modal-header {
  padding: 1.25rem 1.5rem;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.header-info {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.header-tag {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.tag-entidade {
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: #e2e8f0;
  color: #475569;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
}

.chave-registro {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 800;
  color: #0f172a;
  word-break: break-all;
}

.fonte-origem {
  font-size: 0.82rem;
  color: #64748b;
}

.btn-fechar {
  background: transparent;
  border: none;
  font-size: 1.75rem;
  color: #94a3b8;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.btn-fechar:hover {
  color: #0f172a;
}

.modal-corpo {
  padding: 1.5rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.secao-inconsistencia {
  background: #fff1f2;
  border: 1px solid #fecdd3;
  border-radius: 10px;
  padding: 1.1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.inconsistencia-topo {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.erro-descricao {
  font-size: 0.88rem;
  color: #881337;
  font-weight: 700;
}

.detalhes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  font-size: 0.85rem;
}

.detalhe-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.label {
  font-weight: 700;
  color: #475569;
  font-size: 0.78rem;
}

.valor-destaque {
  font-family: var(--fonte-mono);
  background: #ffe4e6;
  color: #9f1239;
  padding: 0.2rem 0.45rem;
  border-radius: 4px;
  display: inline-block;
  font-weight: 700;
}

.valor-recebido {
  font-weight: 600;
  color: #1e293b;
  word-break: break-all;
}

.motivo-box {
  background: #ffffff;
  border-radius: 8px;
  padding: 0.75rem 1rem;
  font-size: 0.86rem;
  color: #1e293b;
  border-left: 4px solid #e11d48;
}

.motivo-box p {
  margin: 0.25rem 0 0;
  line-height: 1.4;
  word-break: break-word;
}

.secao-payload {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.payload-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.payload-header h3 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: #0f172a;
}

.payload-sub {
  margin: 0.15rem 0 0;
  font-size: 0.75rem;
  color: #64748b;
}

.payload-acoes {
  display: flex;
  gap: 0.5rem;
}

.btn-copiar-json,
.btn-secundario-sm {
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  color: #334155;
  padding: 0.35rem 0.75rem;
  border-radius: 6px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-copiar-json:hover,
.btn-secundario-sm:hover {
  background: #e2e8f0;
}

.json-viewer {
  background: #0f172a;
  color: #38bdf8;
  border-radius: 8px;
  padding: 0.85rem 1rem;
  max-height: 220px;
  overflow-y: auto;
  font-size: 0.8rem;
  font-family: var(--fonte-mono);
}

.json-viewer pre {
  margin: 0;
}

.json-editor {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.campo-textarea,
.campo-texto {
  width: 100%;
  padding: 0.65rem 0.85rem;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-family: var(--fonte-mono);
  font-size: 0.84rem;
  color: #1e293b;
  outline: none;
}

.campo-textarea:focus,
.campo-texto:focus {
  border-color: #15803d;
  box-shadow: 0 0 0 3px rgba(21, 128, 61, 0.15);
}

.dica {
  font-size: 0.75rem;
  color: #64748b;
}

.secao-descarte {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.alerta-erro {
  background: #fee2e2;
  color: #991b1b;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
}

.modal-footer {
  padding: 1rem 1.5rem;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.acoes-direita {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.btn-cancelar {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  color: #475569;
  padding: 0.55rem 1.1rem;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
}

.btn-cancelar:hover {
  background: #f1f5f9;
}

.btn-analise {
  background: #e0f2fe;
  color: #0284c7;
  border: 1px solid #bae6fd;
  padding: 0.55rem 1.1rem;
  border-radius: 8px;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
}

.btn-analise:hover {
  background: #bae6fd;
}

.btn-descartar {
  background: #ffffff;
  color: #dc2626;
  border: 1px solid #fecaca;
  padding: 0.55rem 1.1rem;
  border-radius: 8px;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
}

.btn-descartar:hover {
  background: #fee2e2;
}

.btn-reprocessar {
  background: #15803d;
  color: #ffffff;
  border: none;
  padding: 0.55rem 1.3rem;
  border-radius: 8px;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
}

.btn-reprocessar:hover {
  background: #166534;
}

/* Painel de Adição ao Domínio */
.secao-dominio {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 10px;
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.dominio-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.dominio-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.icone-sparkle {
  font-size: 1.3rem;
  background: #dcfce7;
  padding: 0.4rem;
  border-radius: 8px;
  line-height: 1;
}

.dominio-info h4 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: #166534;
}

.dominio-info p {
  margin: 0.15rem 0 0;
  font-size: 0.8rem;
  color: #374151;
}

.dominio-info code {
  background: #dcfce7;
  color: #166534;
  padding: 0.15rem 0.35rem;
  border-radius: 4px;
  font-weight: 700;
  font-family: var(--fonte-mono);
}

.btn-toggle-dominio {
  background: #15803d;
  color: #ffffff;
  border: none;
  padding: 0.45rem 0.95rem;
  border-radius: 7px;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-toggle-dominio:hover {
  background: #166534;
}

.btn-toggle-dominio.ativo {
  background: #ffffff;
  color: #166534;
  border: 1px solid #86efac;
}

.dominio-formulario {
  background: #ffffff;
  border: 1px solid #dcfce7;
  border-radius: 8px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.grid-dominio-campos {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.campo-grupo {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.campo-full {
  grid-column: 1 / -1;
}

.campo-readonly {
  background: #f8fafc;
  color: #64748b;
  cursor: not-allowed;
}

.campo-ajuda {
  font-size: 0.7rem;
  color: #64748b;
}

.alerta-relacionamento {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  padding: 0.65rem 0.85rem;
}

.painel-tipo-ap {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.tipo-ap-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.tipo-ap-botoes {
  display: flex;
  gap: 0.35rem;
}

.btn-opcao-tipo {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  color: #475569;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.25rem 0.65rem;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-opcao-tipo:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.btn-opcao-tipo--ativo {
  background: #0f766e;
  border-color: #0f766e;
  color: #ffffff;
}

.btn-opcao-tipo--ativo:hover {
  background: #115e59;
}

.tipo-ap-conteudo {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 0.65rem 0.75rem;
}

.campo-select {
  cursor: pointer;
  background-color: #ffffff;
}

.novo-tipo-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.65rem;
}

.label-sm {
  font-size: 0.72rem;
  font-weight: 700;
  color: #475569;
}

.texto-carregando {
  font-size: 0.78rem;
  color: #64748b;
  font-style: italic;
  padding: 0.3rem 0;
}

.dica-sugestao {
  color: #047857;
  font-weight: 600;
}

.relacionamento-info strong {
  font-size: 0.8rem;
  color: #1e40af;
}

.relacionamento-info p {
  margin: 0.2rem 0 0;
  font-size: 0.78rem;
  color: #1e3a8a;
}

.dominio-acoes {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid #f1f5f9;
}

.btn-cancelar-sm {
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  color: #475569;
  padding: 0.4rem 0.85rem;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-salvar-dominio {
  background: #15803d;
  color: #ffffff;
  border: none;
  padding: 0.45rem 1.1rem;
  border-radius: 6px;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(21, 128, 61, 0.25);
  transition: all 0.15s ease;
}

.btn-salvar-dominio:hover:not(:disabled) {
  background: #166534;
}

.btn-salvar-dominio:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-acao-dominio {
  background: #ecfdf5;
  color: #047857;
  border: 1px solid #a7f3d0;
  padding: 0.55rem 1.1rem;
  border-radius: 8px;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-acao-dominio:hover {
  background: #d1fae5;
  border-color: #6ee7b7;
}

.alerta-sucesso {
  background: #dcfce7;
  color: #15803d;
  padding: 0.65rem 0.85rem;
  border-radius: 6px;
  font-size: 0.82rem;
  font-weight: 600;
}

/* Seção Especializada: Edição de Polígono / Geometria WKT */
.secao-geometria {
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.geometria-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  flex-wrap: wrap;
}

.geometria-titulo-container {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.titulo-linha {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.icone-gis {
  font-size: 1.25rem;
}

.titulo-linha h3 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: #0f172a;
}

.badge-srid {
  font-size: 0.72rem;
  font-weight: 700;
  background: #e0f2fe;
  color: #0369a1;
  border: 1px solid #bae6fd;
  padding: 0.15rem 0.55rem;
  border-radius: 9999px;
  letter-spacing: 0.03em;
}

.badge-vertices {
  font-size: 0.72rem;
  font-weight: 700;
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #cbd5e1;
  padding: 0.15rem 0.55rem;
  border-radius: 9999px;
}

.geometria-sub {
  margin: 0;
  font-size: 0.8rem;
  color: #64748b;
}

.btn-copiar-wkt {
  background: #0284c7;
  color: #ffffff;
  border: none;
  padding: 0.45rem 0.95rem;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 2px 4px rgba(2, 132, 199, 0.25);
}

.btn-copiar-wkt:hover {
  background: #0369a1;
}

.geometria-editor {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.editor-subtitulo-linha {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dica-contador {
  font-size: 0.74rem;
  color: #64748b;
  font-family: monospace;
}

.campo-textarea--geometria {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 0.85rem;
  line-height: 1.5;
  background: #0f172a;
  color: #38bdf8;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 0.85rem 1rem;
  white-space: pre-wrap;
  word-break: break-all;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2);
}

.campo-textarea--geometria:focus {
  outline: none;
  border-color: #0284c7;
  box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.3), inset 0 2px 4px rgba(0, 0, 0, 0.2);
}

.geometria-guia {
  background: #f1f5f9;
  border-radius: 8px;
  padding: 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  border: 1px solid #e2e8f0;
}

.guia-item {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.8rem;
  color: #475569;
  line-height: 1.4;
}

.guia-item code {
  background: #e2e8f0;
  color: #0f172a;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  font-size: 0.76rem;
}

.guia-bullet {
  font-size: 0.9rem;
  line-height: 1.2;
}

@media (max-width: 640px) {
  .grid-dominio-campos {
    grid-template-columns: 1fr;
  }

  .modal-header {
    flex-direction: column;
    position: relative;
  }

  .btn-fechar {
    position: absolute;
    top: 1rem;
    right: 1rem;
  }

  .modal-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .acoes-direita {
    flex-direction: column;
  }

  .btn-cancelar,
  .btn-acao-dominio,
  .btn-analise,
  .btn-descartar,
  .btn-reprocessar {
    width: 100%;
    text-align: center;
  }
}
</style>

