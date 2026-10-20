<script setup>
import { ref, computed, watch } from 'vue'
import {
  buscarMapeamentos,
  salvarMapeamentos,
  excluirMapeamento,
  limparTodosMapeamentosFonte,
  buscarEsquemasSilver,
  atualizarEntidadeSilverFonte,
} from '../services/quarentenaService'
import { temPermissao } from '../auth/autenticacao'
import { PERMISSOES } from '../auth/permissoes'

// Catálogo padrão de fallback caso a requisição inicial falhe ou esteja em teste
const CATALOGO_SILVER_FALLBACK = [
  {
    id: 'imovel_rural',
    nome: 'Imóvel Rural (CAR)',
    descricao: 'Cadastro Ambiental Rural - limites e situação cadastral de imóveis rurais',
    colunas: [
      { nome: 'cod_imovel', label: 'Código do Imóvel (Chave Natural)', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: true },
      { nome: 'situacao_imovel', label: 'Situação do Imóvel', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false, tabelaReferencia: 'situacao_imovel' },
      { nome: 'condicao_imovel', label: 'Condição do Imóvel', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false, tabelaReferencia: 'condicao_imovel' },
      { nome: 'tipo_imovel', label: 'Tipo do Imóvel', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false, tabelaReferencia: 'tipo_imovel' },
      { nome: 'area_ha', label: 'Área do Imóvel (ha)', tipoDado: 'numero', destinoTipo: 'COLUNA', obrigatorio: false, valorMinimo: 0.0 },
      { nome: 'modulos_fiscais', label: 'Módulos Fiscais', tipoDado: 'numero', destinoTipo: 'COLUNA', obrigatorio: false, valorMinimo: 0.0 },
      { nome: 'municipio', label: 'Município (Código IBGE / Nome)', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false },
      { nome: 'data_registro', label: 'Data de Registro', tipoDado: 'data_iso', destinoTipo: 'COLUNA', obrigatorio: false },
      { nome: 'geometria', label: 'Geometria Espacial (Polígono)', tipoDado: 'wkt', destinoTipo: 'GEOMETRIA', obrigatorio: false, validarGeometria: true, validarRecortePr: true },
    ],
    dominios: [
      { tabela: 'situacao_imovel', label: 'situacao_imovel (AT, PE, CA, SU...)' },
      { tabela: 'condicao_imovel', label: 'condicao_imovel (Aguardando análise, Em análise...)' },
      { tabela: 'tipo_imovel', label: 'tipo_imovel (IRU, AST, PCT...)' },
    ],
  },
  {
    id: 'area_protegida',
    nome: 'Área Protegida (UC / TI)',
    descricao: 'Unidades de Conservação e Terras Indígenas',
    colunas: [
      { nome: 'codigo_origem', label: 'Código de Origem (CNUC / FUNAI)', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: true },
      { nome: 'nome', label: 'Nome da Unidade / Terra Indígena', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: true },
      { nome: 'categoria_area_protegida', label: 'Categoria de Área Protegida', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: true, tabelaReferencia: 'categoria_area_protegida' },
      { nome: 'area_ha', label: 'Área Total (ha)', tipoDado: 'numero', destinoTipo: 'COLUNA', obrigatorio: false, valorMinimo: 0.0 },
      { nome: 'bioma', label: 'Bioma Predominante', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false, tabelaReferencia: 'bioma' },
      { nome: 'ato_legal', label: 'Ato Legal de Criação', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false },
      { nome: 'geometria', label: 'Geometria Espacial (Polígono)', tipoDado: 'wkt', destinoTipo: 'GEOMETRIA', obrigatorio: false, validarGeometria: true, validarRecortePr: true },
    ],
    dominios: [
      { tabela: 'tipo_area_protegida', label: 'tipo_area_protegida (Proteção Integral, Uso Sustentável, TI...)' },
      { tabela: 'categoria_area_protegida', label: 'categoria_area_protegida (PARNA, REBIO, FLONA, APA...)' },
      { tabela: 'orgao', label: 'orgao (ICMBio, IBAMA, FUNAI, IAT, INPE...)' },
      { tabela: 'bioma', label: 'bioma (Mata Atlântica, Cerrado...)' },
    ],
  },
  {
    id: 'embargo_ambiental',
    nome: 'Embargo Ambiental',
    descricao: 'Termos de embargo aplicados por órgãos ambientais (IBAMA / ICMBio / IAT)',
    colunas: [
      { nome: 'numero_termo', label: 'Número do Termo de Embargo (Chave Natural)', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: true },
      { nome: 'data_embargo', label: 'Data do Embargo', tipoDado: 'data_iso', destinoTipo: 'COLUNA', obrigatorio: false },
      { nome: 'area_embargada_ha', label: 'Área Embargada (ha)', tipoDado: 'numero', destinoTipo: 'COLUNA', obrigatorio: false, valorMinimo: 0.0 },
      { nome: 'tipo_area_embargo', label: 'Tipo de Infração / Área Embargada', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false, tabelaReferencia: 'tipo_area_embargo' },
      { nome: 'cpf_cnpj', label: 'Documento do Infrator (CPF / CNPJ)', tipoDado: 'cpf_cnpj', destinoTipo: 'COLUNA', obrigatorio: false, validarCpfCnpj: true },
      { nome: 'nome_autuado', label: 'Nome ou Razão Social do Infrator/Autuado', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false },
      { nome: 'municipio', label: 'Município', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false },
      { nome: 'descricao', label: 'Descrição do Motivo do Embargo', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false },
      { nome: 'num_processo', label: 'Número do Processo Administrativo', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false },
      { nome: 'num_auto_infracao', label: 'Referência ao Auto de Infração', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false },
      { nome: 'geometria', label: 'Geometria do Embargo (Polígono)', tipoDado: 'wkt', destinoTipo: 'GEOMETRIA', obrigatorio: false, validarGeometria: true },
    ],
    dominios: [
      { tabela: 'tipo_area_embargo', label: 'tipo_area_embargo (Desmatamento, Queimada, Exploração irregular...)' },
      { tabela: 'orgao', label: 'orgao (IBAMA, ICMBio, IAT...)' },
    ],
  },
  {
    id: 'auto_infracao',
    nome: 'Auto de Infração',
    descricao: 'Autos de infração e penalidades lavradas por fiscalização ambiental',
    colunas: [
      { nome: 'numero_auto', label: 'Número do Auto de Infração (Chave Natural)', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: true },
      { nome: 'data_auto', label: 'Data da Lavratura do Auto', tipoDado: 'data_iso', destinoTipo: 'COLUNA', obrigatorio: false },
      { nome: 'valor_multa', label: 'Valor da Multa (R$)', tipoDado: 'numero', destinoTipo: 'COLUNA', obrigatorio: false, valorMinimo: 0.0 },
      { nome: 'tipo_auto_infracao', label: 'Tipo de Auto de Infração', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false, tabelaReferencia: 'tipo_auto_infracao' },
      { nome: 'tipo_infracao', label: 'Tipo de Infração', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false, tabelaReferencia: 'tipo_infracao' },
      { nome: 'tipo_pessoa', label: 'Tipo de Pessoa (Física / Jurídica)', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false, tabelaReferencia: 'tipo_pessoa' },
      { nome: 'status_auto_infracao', label: 'Status do Auto', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false, tabelaReferencia: 'status_auto_infracao' },
      { nome: 'cpf_cnpj_infrator', label: 'CPF ou CNPJ do Autuado', tipoDado: 'cpf_cnpj', destinoTipo: 'COLUNA', obrigatorio: false, validarCpfCnpj: true },
      { nome: 'nome_infrator', label: 'Nome do Autuado', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false },
      { nome: 'municipio', label: 'Município', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false },
      { nome: 'descricao', label: 'Descrição da Infração', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false },
      { nome: 'num_processo', label: 'Número do Processo Administrativo', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false },
      { nome: 'houve_embargo', label: 'Houve Embargo', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false },
      { nome: 'houve_apreensao', label: 'Houve Apreensão', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false },
      { nome: 'geometria', label: 'Geometria Espacial (Ponto / Polígono)', tipoDado: 'wkt', destinoTipo: 'GEOMETRIA', obrigatorio: false },
    ],
    dominios: [
      { tabela: 'tipo_auto_infracao', label: 'tipo_auto_infracao (Multa simples, Advertência, Apreensão...)' },
      { tabela: 'tipo_infracao', label: 'tipo_infracao (Contra a flora, fauna, poluição...)' },
      { tabela: 'tipo_pessoa', label: 'tipo_pessoa (PF, PJ)' },
      { tabela: 'status_auto_infracao', label: 'status_auto_infracao (Lavrado, Homologado, Julgado...)' },
      { tabela: 'orgao', label: 'orgao (IBAMA, ICMBio, IAT...)' },
    ],
  },
  {
    id: 'desmatamento',
    nome: 'Desmatamento (PRODES)',
    descricao: 'Polígonos de detecção de desmatamento consolidado INPE',
    colunas: [
      { nome: 'identificador_origem', label: 'Identificador de Origem (Chave Natural)', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: true },
      { nome: 'ano', label: 'Ano da Detecção PRODES', tipoDado: 'numero', destinoTipo: 'COLUNA', obrigatorio: false, valorMinimo: 1980.0 },
      { nome: 'area_ha', label: 'Área Desmatada (ha)', tipoDado: 'numero', destinoTipo: 'COLUNA', obrigatorio: false, valorMinimo: 0.0 },
      { nome: 'classe_prodes', label: 'Classe PRODES', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false, tabelaReferencia: 'classe_prodes' },
      { nome: 'satelite', label: 'Satélite', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false, tabelaReferencia: 'satelite' },
      { nome: 'sensor', label: 'Sensor', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false, tabelaReferencia: 'sensor' },
      { nome: 'data_imagem', label: 'Data da Imagem', tipoDado: 'data_iso', destinoTipo: 'COLUNA', obrigatorio: false },
      { nome: 'geometria', label: 'Geometria do Desmatamento (Polígono)', tipoDado: 'wkt', destinoTipo: 'GEOMETRIA', obrigatorio: false, validarGeometria: true },
    ],
    dominios: [
      { tabela: 'classe_prodes', label: 'classe_prodes (Desmatamento, Não floresta, Floresta...)' },
      { tabela: 'satelite', label: 'satelite (LANDSAT, SENTINEL, CBERS...)' },
      { tabela: 'sensor', label: 'sensor (OLI, MSI, WFI...)' },
    ],
  },
  {
    id: 'foco_calor',
    nome: 'Focos de Calor (Queimadas)',
    descricao: 'Detecções de focos de queimada por satélite (INPE Queimadas)',
    colunas: [
      { nome: 'identificador_origem', label: 'Identificador de Origem (Chave Natural)', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: true },
      { nome: 'data_hora', label: 'Data e Hora do Foco', tipoDado: 'data_iso', destinoTipo: 'COLUNA', obrigatorio: false },
      { nome: 'satelite', label: 'Satélite', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false, tabelaReferencia: 'satelite' },
      { nome: 'bioma', label: 'Bioma', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false, tabelaReferencia: 'bioma' },
      { nome: 'municipio', label: 'Município', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false },
      { nome: 'latitude', label: 'Latitude', tipoDado: 'numero', destinoTipo: 'COLUNA', obrigatorio: false },
      { nome: 'longitude', label: 'Longitude', tipoDado: 'numero', destinoTipo: 'COLUNA', obrigatorio: false },
      { nome: 'risco_fogo', label: 'Risco de Fogo', tipoDado: 'numero', destinoTipo: 'COLUNA', obrigatorio: false },
      { nome: 'dias_sem_chuva', label: 'Dias Sem Chuva', tipoDado: 'numero', destinoTipo: 'COLUNA', obrigatorio: false, valorMinimo: 0.0 },
      { nome: 'precipitacao_mm', label: 'Precipitação (mm)', tipoDado: 'numero', destinoTipo: 'COLUNA', obrigatorio: false, valorMinimo: 0.0 },
      { nome: 'frp', label: 'FRP (Fire Radiative Power)', tipoDado: 'numero', destinoTipo: 'COLUNA', obrigatorio: false, valorMinimo: 0.0 },
      { nome: 'geometria', label: 'Geometria Espacial (Ponto)', tipoDado: 'wkt', destinoTipo: 'GEOMETRIA', obrigatorio: false },
    ],
    dominios: [
      { tabela: 'satelite', label: 'satelite (AQUA, TERRA, GOES-16, NOAA-20...)' },
      { tabela: 'bioma', label: 'bioma (Mata Atlântica, Cerrado...)' },
    ],
  },
  {
    id: 'municipio',
    nome: 'Município (Malha IBGE)',
    descricao: 'Malha territorial e limites municipais',
    colunas: [
      { nome: 'cod_ibge', label: 'Código IBGE (Chave Natural)', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: true },
      { nome: 'nome', label: 'Nome do Município', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: true },
      { nome: 'bioma_predominante', label: 'Bioma Predominante', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false, tabelaReferencia: 'bioma' },
      { nome: 'area_km2', label: 'Área Total do Município (km²)', tipoDado: 'numero', destinoTipo: 'COLUNA', obrigatorio: false, valorMinimo: 0.0 },
      { nome: 'geometria', label: 'Geometria Limite Municipal (Polígono)', tipoDado: 'wkt', destinoTipo: 'GEOMETRIA', obrigatorio: false, validarGeometria: true },
    ],
    dominios: [
      { tabela: 'unidade_federativa', label: 'unidade_federativa (PR, SP, SC...)' },
      { tabela: 'bioma', label: 'bioma (Mata Atlântica, Cerrado...)' },
    ],
  },
  {
    id: 'reserva_legal',
    nome: 'Reserva Legal (CAR)',
    descricao: 'Polígonos de Reserva Legal declarados no CAR',
    colunas: [
      { nome: 'identificador_origem', label: 'Identificador de Origem (Chave Natural)', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: true },
      { nome: 'cod_imovel', label: 'Código do Imóvel Vinculado', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false },
      { nome: 'area_ha', label: 'Área da Reserva Legal (ha)', tipoDado: 'numero', destinoTipo: 'COLUNA', obrigatorio: false, valorMinimo: 0.0 },
      { nome: 'situacao_bruto', label: 'Situação do Imóvel', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false, tabelaReferencia: 'situacao_imovel' },
      { nome: 'condicao_bruto', label: 'Condição do Imóvel', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false, tabelaReferencia: 'condicao_imovel' },
      { nome: 'geometria', label: 'Geometria da Reserva Legal (Polígono)', tipoDado: 'wkt', destinoTipo: 'GEOMETRIA', obrigatorio: false, validarGeometria: true },
    ],
    dominios: [
      { tabela: 'situacao_imovel', label: 'situacao_imovel (AT, PE, CA, SU...)' },
      { tabela: 'condicao_imovel', label: 'condicao_imovel (Aguardando análise, Em análise...)' },
    ],
  },
  {
    id: 'app_declarada',
    nome: 'Área de Preservação Permanente - APP (CAR)',
    descricao: 'Polígonos de APP declarados no CAR',
    colunas: [
      { nome: 'identificador_origem', label: 'Identificador de Origem (Chave Natural)', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: true },
      { nome: 'cod_imovel', label: 'Código do Imóvel Vinculado', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false },
      { nome: 'area_ha', label: 'Área da APP (ha)', tipoDado: 'numero', destinoTipo: 'COLUNA', obrigatorio: false, valorMinimo: 0.0 },
      { nome: 'situacao_bruto', label: 'Situação do Imóvel', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false, tabelaReferencia: 'situacao_imovel' },
      { nome: 'condicao_bruto', label: 'Condição do Imóvel', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false, tabelaReferencia: 'condicao_imovel' },
      { nome: 'geometria', label: 'Geometria da APP (Polígono)', tipoDado: 'wkt', destinoTipo: 'GEOMETRIA', obrigatorio: false, validarGeometria: true },
    ],
    dominios: [
      { tabela: 'situacao_imovel', label: 'situacao_imovel (AT, PE, CA, SU...)' },
      { tabela: 'condicao_imovel', label: 'condicao_imovel (Aguardando análise, Em análise...)' },
    ],
  },
  {
    id: 'vegetacao_nativa_declarada',
    nome: 'Vegetação Nativa (CAR)',
    descricao: 'Polígonos de Vegetação Nativa remanescente declarados no CAR',
    colunas: [
      { nome: 'identificador_origem', label: 'Identificador de Origem (Chave Natural)', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: true },
      { nome: 'cod_imovel', label: 'Código do Imóvel Vinculado', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false },
      { nome: 'area_ha', label: 'Área de Vegetação Nativa (ha)', tipoDado: 'numero', destinoTipo: 'COLUNA', obrigatorio: false, valorMinimo: 0.0 },
      { nome: 'situacao_bruto', label: 'Situação do Imóvel', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false, tabelaReferencia: 'situacao_imovel' },
      { nome: 'condicao_bruto', label: 'Condição do Imóvel', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false, tabelaReferencia: 'condicao_imovel' },
      { nome: 'geometria', label: 'Geometria da Vegetação (Polígono)', tipoDado: 'wkt', destinoTipo: 'GEOMETRIA', obrigatorio: false, validarGeometria: true },
    ],
    dominios: [
      { tabela: 'situacao_imovel', label: 'situacao_imovel (AT, PE, CA, SU...)' },
      { tabela: 'condicao_imovel', label: 'condicao_imovel (Aguardando análise, Em análise...)' },
    ],
  },
  {
    id: 'bioma',
    nome: 'Bioma (IBGE)',
    descricao: 'Limites dos Biomas Brasileiros',
    colunas: [
      { nome: 'codigo_bioma', label: 'Código do Bioma', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: true },
      { nome: 'nome', label: 'Nome do Bioma', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: true },
      { nome: 'geometria', label: 'Geometria do Bioma (Polígono)', tipoDado: 'wkt', destinoTipo: 'GEOMETRIA', obrigatorio: false },
    ],
    dominios: [
      { tabela: 'bioma', label: 'bioma (Mata Atlântica, Cerrado...)' },
    ],
  },
]

// Permissão para gerenciar fontes
const podeEditar = temPermissao(PERMISSOES.FONTE_GERENCIAR)

const props = defineProps({
  fonte: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['fechar', 'atualizado'])

const mapeamentos = ref([])
const carregando = ref(false)
const salvando = ref(false)
const erro = ref(null)
const sucesso = ref(null)

// Catálogo Silver e Tabela Selecionada
const esquemasSilver = ref(CATALOGO_SILVER_FALLBACK)
const carregandoEsquemas = ref(false)
const tabelaSilverSelecionada = ref('')
const tabelaSilverAnterior = ref('')
const salvandoTabelaSilver = ref(false)

// Popups de Confirmação In-App (substituindo alerts/confirms nativos do navegador)
const popupTrocaSilverAberto = ref(false)
const tabelaPendenteTroca = ref('')
const limpandoEAlterandoSilver = ref(false)

const popupExcluirCampoAberto = ref(false)
const mapeamentoParaExcluir = ref(null)
const excluindoCampo = ref(false)

// Controle do Atributo Destino Canônico
const atributoDestinoSelecionado = ref('')

const novoMapeamento = ref({
  id: null,
  colunaOrigem: '',
  atributoDestino: '',
  destinoTipo: 'COLUNA',
  tipoDado: 'texto',
  obrigatorio: false,
  valorMinimo: null,
  tabelaReferencia: '',
  referenciaEntidadeSilver: '',
  validarGeometria: false,
  validarCpfCnpj: false,
  validarRecortePr: false,
  impedirRegressao: true,
})

// Esquema da Silver atualmente selecionada
const esquemaAtivo = computed(() => {
  if (!tabelaSilverSelecionada.value) return null
  return (
    esquemasSilver.value.find(
      (e) => e.id.toLowerCase() === tabelaSilverSelecionada.value.toLowerCase()
    ) || null
  )
})

const nomeTabelaAntiga = computed(() => {
  const id = tabelaSilverAnterior.value
  if (!id) return ''
  return esquemasSilver.value.find((e) => e.id.toLowerCase() === id.toLowerCase())?.nome || id
})

const nomeNovaTabela = computed(() => {
  const id = tabelaPendenteTroca.value
  if (!id) return ''
  return esquemasSilver.value.find((e) => e.id.toLowerCase() === id.toLowerCase())?.nome || id
})

const colunasSilverDisponiveis = computed(() => esquemaAtivo.value?.colunas || [])
const dominiosDisponiveis = computed(() => esquemaAtivo.value?.dominios || [])

const colunasSilverMapeadasNomes = computed(() => {
  const set = new Set()
  for (const m of mapeamentos.value) {
    if (m.destinoTipo !== 'JSON' && m.atributoDestino) {
      set.add(m.atributoDestino.trim().toLowerCase())
    }
  }
  return set
})

const colunasSilverUtilizadasParaBloqueio = computed(() => {
  const set = new Set()
  for (const m of mapeamentos.value) {
    if (novoMapeamento.value.id && m.id === novoMapeamento.value.id) {
      continue
    }
    if (m.destinoTipo !== 'JSON' && m.atributoDestino) {
      set.add(m.atributoDestino.trim().toLowerCase())
    }
  }
  return set
})

function isColunaSilverUtilizada(nomeColuna) {
  if (!nomeColuna) return false
  return colunasSilverUtilizadasParaBloqueio.value.has(nomeColuna.trim().toLowerCase())
}

const statusMapeamentoSilver = computed(() => {
  const todasColunas = colunasSilverDisponiveis.value
  const obrigatorias = todasColunas.filter((c) => c.obrigatorio)
  const totalObrigatorias = obrigatorias.length
  const mapeadasSet = colunasSilverMapeadasNomes.value

  if (totalObrigatorias === 0) {
    return {
      completo: true,
      totalEsperadas: 0,
      totalMapeadas: mapeadasSet.size,
      totalObrigatorias: 0,
      mapeadasObrigatorias: 0,
      faltantes: [],
      porcentagem: 100,
    }
  }

  const faltantes = obrigatorias.filter((c) => !mapeadasSet.has(c.nome.trim().toLowerCase()))
  const mapeadasObrigatorias = totalObrigatorias - faltantes.length
  const completo = faltantes.length === 0
  const porcentagem = Math.round((mapeadasObrigatorias / totalObrigatorias) * 100)

  return {
    completo,
    totalEsperadas: totalObrigatorias,
    totalMapeadas: mapeadasSet.size,
    totalObrigatorias,
    mapeadasObrigatorias,
    faltantes,
    porcentagem,
  }
})

async function carregarEsquemas() {
  carregandoEsquemas.value = true
  try {
    const dados = await buscarEsquemasSilver()
    if (dados && dados.length > 0) {
      esquemasSilver.value = dados
    }
  } catch {
    // Mantém fallback local
    esquemasSilver.value = CATALOGO_SILVER_FALLBACK
  } finally {
    carregandoEsquemas.value = false
  }
}

async function carregarMapeamentos() {
  if (!props.fonte?.id) return
  carregando.value = true
  erro.value = null
  try {
    mapeamentos.value = await buscarMapeamentos(props.fonte.id)
  } catch (e) {
    erro.value = e.message || 'Erro ao carregar mapeamentos de colunas'
  } finally {
    carregando.value = false
  }
}

let timerSucesso = null

function definirMensagemSucesso(msg) {
  sucesso.value = msg
  if (timerSucesso) clearTimeout(timerSucesso)
  timerSucesso = setTimeout(() => {
    sucesso.value = null
  }, 4500)
}

function fechar() {
  if (timerSucesso) clearTimeout(timerSucesso)
  sucesso.value = null
  erro.value = null
  popupTrocaSilverAberto.value = false
  popupExcluirCampoAberto.value = false
  tabelaPendenteTroca.value = ''
  mapeamentoParaExcluir.value = null
  cancelarEdicao()
  emit('fechar')
}

watch(
  () => props.fonte,
  async (novaFonte) => {
    if (timerSucesso) clearTimeout(timerSucesso)
    sucesso.value = null
    erro.value = null
    if (novaFonte) {
      tabelaSilverSelecionada.value = novaFonte.entidadeSilver || ''
      tabelaSilverAnterior.value = novaFonte.entidadeSilver || ''
      cancelarEdicao()
      await carregarEsquemas()
      await carregarMapeamentos()
    } else {
      mapeamentos.value = []
      tabelaSilverSelecionada.value = ''
      tabelaSilverAnterior.value = ''
      popupTrocaSilverAberto.value = false
      popupExcluirCampoAberto.value = false
      tabelaPendenteTroca.value = ''
      mapeamentoParaExcluir.value = null
    }
  },
  { immediate: true }
)

async function salvarSelecaoTabelaSilver() {
  if (!props.fonte?.id || !tabelaSilverSelecionada.value) return
  salvandoTabelaSilver.value = true
  erro.value = null
  sucesso.value = null
  try {
    await atualizarEntidadeSilverFonte(props.fonte.id, tabelaSilverSelecionada.value)
    props.fonte.entidadeSilver = tabelaSilverSelecionada.value
    definirMensagemSucesso(`Tabela Silver definida como "${esquemaAtivo.value?.nome || tabelaSilverSelecionada.value}" com sucesso!`)
  } catch (e) {
    erro.value = e.message || 'Falha ao vincular tabela Silver à fonte.'
  } finally {
    salvandoTabelaSilver.value = false
  }
}

function aoAlterarTabelaSilver(evento) {
  const novaTabela = evento.target.value
  const tabelaAntiga = tabelaSilverAnterior.value

  if (!novaTabela || novaTabela === tabelaAntiga) return

  // Se já existem mapeamentos e está alterando a tabela Silver, abre o popup in-app
  if (mapeamentos.value && mapeamentos.value.length > 0) {
    tabelaPendenteTroca.value = novaTabela
    popupTrocaSilverAberto.value = true
    return
  }

  // Sem mapeamentos anteriores: altera diretamente
  executarTrocaTabelaSilver(novaTabela)
}

function cancelarTrocaTabelaSilver() {
  tabelaSilverSelecionada.value = tabelaSilverAnterior.value
  tabelaPendenteTroca.value = ''
  popupTrocaSilverAberto.value = false
}

async function confirmarTrocaTabelaSilver() {
  if (!tabelaPendenteTroca.value) return
  const novaTabela = tabelaPendenteTroca.value
  limpandoEAlterandoSilver.value = true
  erro.value = null

  try {
    await limparTodosMapeamentosFonte(props.fonte.id)
    mapeamentos.value = []
    cancelarEdicao()
    tabelaSilverSelecionada.value = novaTabela
    await salvarSelecaoTabelaSilver()
    tabelaSilverAnterior.value = novaTabela
    popupTrocaSilverAberto.value = false
    tabelaPendenteTroca.value = ''
    emit('atualizado')
  } catch (e) {
    erro.value = e.message || 'Falha ao limpar mapeamentos anteriores da fonte.'
    tabelaSilverSelecionada.value = tabelaSilverAnterior.value
  } finally {
    limpandoEAlterandoSilver.value = false
  }
}

async function executarTrocaTabelaSilver(novaTabela) {
  tabelaSilverSelecionada.value = novaTabela
  await salvarSelecaoTabelaSilver()
  tabelaSilverAnterior.value = novaTabela
}

function aoTrocarAtributoDestino() {
  novoMapeamento.value.atributoDestino = atributoDestinoSelecionado.value

  const col = colunasSilverDisponiveis.value.find(
    (c) => c.nome === atributoDestinoSelecionado.value
  )
  if (col) {
    novoMapeamento.value.destinoTipo = col.destinoTipo || 'COLUNA'
    novoMapeamento.value.tipoDado = col.tipoDado || 'texto'
    novoMapeamento.value.obrigatorio = !!col.obrigatorio
    novoMapeamento.value.valorMinimo = col.valorMinimo ?? null
    novoMapeamento.value.tabelaReferencia = col.tabelaReferencia || ''
    novoMapeamento.value.validarGeometria = !!col.validarGeometria
    novoMapeamento.value.validarCpfCnpj = !!col.validarCpfCnpj
    novoMapeamento.value.validarRecortePr = !!col.validarRecortePr
  }
}

function editar(map) {
  novoMapeamento.value = {
    id: map.id,
    colunaOrigem: map.colunaOrigem,
    atributoDestino: map.atributoDestino,
    destinoTipo: map.destinoTipo || 'COLUNA',
    tipoDado: map.tipoDado || 'texto',
    obrigatorio: !!map.obrigatorio,
    valorMinimo: map.valorMinimo ?? null,
    tabelaReferencia: map.tabelaReferencia || '',
    referenciaEntidadeSilver: map.referenciaEntidadeSilver || '',
    validarGeometria: !!map.validarGeometria,
    validarCpfCnpj: !!map.validarCpfCnpj,
    validarRecortePr: !!map.validarRecortePr,
    impedirRegressao: map.impedirRegressao !== false,
  }

  atributoDestinoSelecionado.value = map.atributoDestino

  sucesso.value = null
  erro.value = null
  const formEl = document.querySelector('.card-formulario')
  if (formEl) formEl.scrollIntoView({ behavior: 'smooth' })
}

function cancelarEdicao() {
  novoMapeamento.value = {
    id: null,
    colunaOrigem: '',
    atributoDestino: '',
    destinoTipo: 'COLUNA',
    tipoDado: 'texto',
    obrigatorio: false,
    valorMinimo: null,
    tabelaReferencia: '',
    referenciaEntidadeSilver: '',
    validarGeometria: false,
    validarCpfCnpj: false,
    validarRecortePr: false,
    impedirRegressao: true,
  }
  atributoDestinoSelecionado.value = ''
}

async function salvarCampo() {
  if (!novoMapeamento.value.colunaOrigem.trim() || !novoMapeamento.value.atributoDestino.trim()) {
    erro.value = 'Preencha a coluna de origem e o atributo de destino.'
    return
  }

  if (
    novoMapeamento.value.destinoTipo !== 'JSON' &&
    isColunaSilverUtilizada(novoMapeamento.value.atributoDestino)
  ) {
    erro.value = `A coluna Silver "${novoMapeamento.value.atributoDestino}" já está mapeada nesta fonte e não pode ser preenchida novamente.`
    return
  }

  salvando.value = true
  erro.value = null
  sucesso.value = null

  try {
    const item = {
      ...novoMapeamento.value,
      colunaOrigem: novoMapeamento.value.colunaOrigem.trim(),
      atributoDestino: novoMapeamento.value.atributoDestino.trim(),
      tabelaDestino: tabelaSilverSelecionada.value || null,
      referenciaEntidadeSilver: novoMapeamento.value.referenciaEntidadeSilver?.trim() || null,
      tabelaReferencia: novoMapeamento.value.tabelaReferencia?.trim() || null,
      valorMinimo:
        novoMapeamento.value.valorMinimo !== '' && novoMapeamento.value.valorMinimo !== null
          ? Number(novoMapeamento.value.valorMinimo)
          : null,
      fonteDadoId: props.fonte.id,
    }

    await salvarMapeamentos(props.fonte.id, [item])
    definirMensagemSucesso(
      novoMapeamento.value.id
        ? `Mapeamento do campo "${item.colunaOrigem}" atualizado com sucesso!`
        : `Novo mapeamento para "${item.colunaOrigem}" criado com sucesso!`
    )

    cancelarEdicao()
    await carregarMapeamentos()
    emit('atualizado')
  } catch (e) {
    erro.value = e.message || 'Falha ao salvar mapeamento.'
  } finally {
    salvando.value = false
  }
}

function solicitarRemover(map) {
  mapeamentoParaExcluir.value = map
  popupExcluirCampoAberto.value = true
}

function cancelarRemoverCampo() {
  mapeamentoParaExcluir.value = null
  popupExcluirCampoAberto.value = false
}

async function confirmarRemoverCampo() {
  if (!mapeamentoParaExcluir.value) return
  const map = mapeamentoParaExcluir.value
  excluindoCampo.value = true
  erro.value = null

  try {
    await excluirMapeamento(props.fonte.id, map.id)
    if (novoMapeamento.value.id === map.id) {
      cancelarEdicao()
    }
    await carregarMapeamentos()
    definirMensagemSucesso(`Mapeamento da coluna "${map.colunaOrigem}" removido com sucesso.`)
    popupExcluirCampoAberto.value = false
    mapeamentoParaExcluir.value = null
    emit('atualizado')
  } catch (e) {
    erro.value = e.message || 'Erro ao remover mapeamento.'
  } finally {
    excluindoCampo.value = false
  }
}

function remover(id) {
  const map = mapeamentos.value.find((m) => m.id === id)
  if (map) {
    solicitarRemover(map)
  }
}
</script>

<template>
  <div v-if="fonte" class="modal-backdrop" @click.self="fechar">
    <div class="modal-dialog">
      <header class="modal-header">
        <div>
          <span class="modal-etiqueta">MAPEAMENTO DE DADOS (BRONZE → SILVER)</span>
          <h2 class="modal-titulo">Mapeamento de Colunas — {{ fonte.nome }}</h2>
          <p class="modal-sub">
            Defina a tabela de destino na camada Silver e configure as regras de conversão e validação de cada campo.
          </p>
        </div>
        <button class="btn-fechar" title="Fechar modal" @click="fechar">✕</button>
      </header>

      <div class="modal-body">
        <div v-if="erro" class="alerta alerta--erro alerta--dispensavel">
          <span>{{ erro }}</span>
          <button type="button" class="btn-fechar-alerta" title="Dispensar aviso" @click="erro = null">✕</button>
        </div>
        <div v-if="sucesso" class="alerta alerta--sucesso alerta--dispensavel">
          <span>{{ sucesso }}</span>
          <button type="button" class="btn-fechar-alerta" title="Dispensar aviso" @click="sucesso = null">✕</button>
        </div>

        <!-- 1. SELEÇÃO DA TABELA SILVER DE DESTINO (PRÉ-REQUISITO OBRIGATÓRIO) -->
        <section class="card-etapa-silver" :class="{ 'card-etapa-silver--ativo': tabelaSilverSelecionada }">
          <div class="silver-topo">
            <div class="silver-info">
              <div class="silver-passo-tag">
                <span class="etapa-numero">ETAPA 1</span>
                <span class="etapa-status" :class="tabelaSilverSelecionada ? 'status-ok' : 'status-pendente'">
                  <svg v-if="tabelaSilverSelecionada" class="mini-svg-status" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {{ tabelaSilverSelecionada ? 'Tabela Silver Definida' : 'Obrigatório para iniciar' }}
                </span>
              </div>
              <h3 class="silver-titulo">Tabela Silver de Destino</h3>
              <p class="silver-desc">
                Selecione a tabela da camada Silver para onde os registros desta fonte serão promovidos. As opções de colunas e regras de validação serão adaptadas automaticamente.
              </p>
            </div>
          </div>

          <div class="silver-seletor-linha">
            <div class="campo-silver-select">
              <label class="rotulo-campo">Tabela Silver de Destino *</label>
              <div class="select-com-status">
                <select
                  v-model="tabelaSilverSelecionada"
                  :disabled="!podeEditar || salvandoTabelaSilver"
                  class="select-form select-silver-destaque"
                  @change="aoAlterarTabelaSilver"
                >
                  <option value="" disabled>-- Selecione a Tabela Silver de Destino --</option>
                  <option
                    v-for="esq in esquemasSilver"
                    :key="esq.id"
                    :value="esq.id"
                  >
                    {{ esq.nome }} (SILVER.{{ esq.id.toUpperCase() }})
                  </option>
                </select>
                <span v-if="salvandoTabelaSilver" class="spinner-sm"></span>
              </div>
            </div>

            <div v-if="esquemaAtivo" class="silver-badge-card">
              <div class="silver-badge-header">
                <span class="silver-schema-tag">SILVER.{{ esquemaAtivo.id.toUpperCase() }}</span>
                <span class="silver-cols-count">{{ colunasSilverDisponiveis.length }} colunas disponíveis</span>
              </div>
              <p class="silver-badge-desc">{{ esquemaAtivo.descricao }}</p>
            </div>
          </div>
        </section>

        <!-- CARD DE STATUS E PRONTIDÃO PARA INGESTÃO -->
        <div v-if="tabelaSilverSelecionada && esquemaAtivo" class="card-prontidao-ingestao">
          <div v-if="carregando" class="prontidao-topo prontidao-carregando">
            <span class="spinner-sm"></span>
            <span>Carregando integridade do mapeamento...</span>
          </div>
          <template v-else>
            <div class="prontidao-topo">
              <div class="prontidao-status-badge" :class="statusMapeamentoSilver.completo ? 'badge-prontidao-liberada' : 'badge-prontidao-bloqueada'">
                <svg v-if="statusMapeamentoSilver.completo" class="mini-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <svg v-else class="mini-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                </svg>
                <span>{{ statusMapeamentoSilver.completo ? 'Ingestão Liberada' : 'Ingestão Bloqueada' }}</span>
              </div>
              <div class="prontidao-contador">
                <strong>{{ statusMapeamentoSilver.mapeadasObrigatorias }} de {{ statusMapeamentoSilver.totalObrigatorias }}</strong> colunas obrigatórias (NOT NULL) preenchidas ({{ statusMapeamentoSilver.porcentagem }}%) — total de {{ statusMapeamentoSilver.totalMapeadas }} coluna(s) mapeada(s)
              </div>
            </div>

          <div class="barra-prontidao-trilho">
            <div
              class="barra-prontidao-preenchimento"
              :class="{ 'barra-prontidao-preenchimento--completo': statusMapeamentoSilver.completo }"
              :style="{ width: statusMapeamentoSilver.porcentagem + '%' }"
            ></div>
          </div>

          <div v-if="!statusMapeamentoSilver.completo" class="prontidao-pendencias">
            <span class="prontidao-aviso-texto">
              A ingestão desta fonte só será liberada quando todas as colunas obrigatórias (NOT NULL) da tabela Silver forem mapeadas. Colunas obrigatórias pendentes ({{ statusMapeamentoSilver.faltantes.length }}):
            </span>
            <div class="chips-colunas-pendentes">
              <span
                v-for="col in statusMapeamentoSilver.faltantes"
                :key="col.nome"
                class="chip-coluna-pendente"
                :title="col.label"
              >
                {{ col.nome }}
              </span>
            </div>
          </div>
            <div v-else class="prontidao-concluida">
              <svg class="mini-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>Todas as colunas obrigatórias (NOT NULL) da tabela Silver foram preenchidas. Esta fonte está apta para ingestão!</span>
            </div>
          </template>
        </div>

        <!-- AVISO ORIENTATIVO QUANDO NÃO HÁ TABELA SILVER SELECIONADA -->
        <div v-if="!tabelaSilverSelecionada" class="silver-orientacao-inicial">
          <div class="orientacao-icone-wrapper">
            <svg class="orientacao-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <ellipse cx="12" cy="5" rx="9" ry="3" />
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
            </svg>
          </div>
          <div class="orientacao-conteudo">
            <h4 class="orientacao-titulo">Selecione uma Tabela Silver para Iniciar o Mapeamento</h4>
            <p class="orientacao-desc">
              Para mapear os atributos e definir as regras de conversão e validação, escolha a <strong>Tabela Silver de Destino</strong> na Etapa 1 acima.
              Os campos de configuração e a listagem de colunas serão exibidos automaticamente após a seleção.
            </p>
          </div>
        </div>

        <!-- 2. FORMULÁRIO DE MAPEAMENTO (EXIBIDO APENAS QUANDO HOUVER TABELA SILVER) -->
        <section
          v-if="podeEditar && tabelaSilverSelecionada"
          class="card-formulario"
          :class="{ 'card-formulario--editando': novoMapeamento.id }"
        >
          <div class="secao-topo-form">
            <div class="form-titulo-grupo">
              <span class="etapa-numero">ETAPA 2</span>
              <h3 class="secao-titulo">
                {{ novoMapeamento.id ? `Editar Mapeamento: ${novoMapeamento.colunaOrigem}` : 'Mapear Novo Campo' }}
              </h3>
            </div>
            <span v-if="novoMapeamento.id" class="badge-editando">Modo Edição (ID: {{ novoMapeamento.id }})</span>
          </div>

          <form class="grid-form" @submit.prevent="salvarCampo">
            <div class="campo">
              <label class="rotulo-campo">Coluna de Origem (Dado Bruto) *</label>
              <input
                v-model="novoMapeamento.colunaOrigem"
                required
                placeholder="Ex: cod_municipio_ibge, num_tad, cpf_cnpj"
                class="input-form"
              />
            </div>

            <!-- Coluna de Destino -->
            <div class="campo">
              <label class="rotulo-campo">
                Coluna de Destino (Silver: {{ esquemaAtivo?.nome || tabelaSilverSelecionada }}) *
              </label>
              <div class="atributo-select-wrapper">
                <select
                  v-model="atributoDestinoSelecionado"
                  class="select-form"
                  required
                  @change="aoTrocarAtributoDestino"
                >
                  <option value="" disabled>-- Selecione a coluna de destino --</option>
                  <option
                    v-for="col in colunasSilverDisponiveis"
                    :key="col.nome"
                    :value="col.nome"
                    :disabled="isColunaSilverUtilizada(col.nome)"
                  >
                    {{ col.label }} ({{ col.nome }}){{ isColunaSilverUtilizada(col.nome) ? ' — já mapeado' : '' }}
                  </option>
                </select>
              </div>
            </div>

            <div class="campo">
              <label class="rotulo-campo">Destino</label>
              <select v-model="novoMapeamento.destinoTipo" class="select-form">
                <option value="COLUNA">Coluna da Tabela Silver</option>
                <option value="GEOMETRIA">Geometria Espacial</option>
                <option value="JSON">Atributos Adicionais (JSON)</option>
              </select>
            </div>

            <div class="campo">
              <label class="rotulo-campo">Tipo de Dado</label>
              <select v-model="novoMapeamento.tipoDado" class="select-form">
                <option value="texto">Texto (String)</option>
                <option value="numero">Numérico (Inteiro / Decimal)</option>
                <option value="cpf_cnpj">Documento (CPF / CNPJ)</option>
                <option value="data_iso">Data / Hora (ISO)</option>
                <option value="wkt">Geometria WKT</option>
                <option value="booleano">Booleano (Sim / Não)</option>
              </select>
            </div>

            <!-- Validação Cruzada (Referência Silver) -->
            <div class="campo">
              <label class="rotulo-campo">
                Validação Cruzada (Ref. Silver)
                <span class="dica-info" title="Valida se o valor existe na tabela Silver indicada. Se não existir, o registro vai para a Quarentena.">
                  <svg class="icone-info-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                </span>
              </label>
              <select v-model="novoMapeamento.referenciaEntidadeSilver" class="select-form">
                <option value="">(Nenhuma validação cruzada)</option>
                <option value="municipio">municipio — Código em SILVER.MUNICIPIO</option>
                <option value="imovel_rural">imovel_rural — Chave em SILVER.IMOVEL_RURAL</option>
                <option value="area_protegida">area_protegida — Código em SILVER.AREA_PROTEGIDA</option>
                <option value="auto_infracao">auto_infracao — Número em SILVER.AUTO_INFRACAO</option>
                <option value="embargo_ambiental">embargo_ambiental — Termo em SILVER.EMBARGO_AMBIENTAL</option>
              </select>
            </div>

            <!-- Validação de Domínio -->
            <div class="campo">
              <label class="rotulo-campo">
                Validação de Domínio
                <span class="dica-info" title="Valida se o valor pertence à lista oficial de valores aceitos para este campo.">
                  <svg class="icone-info-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                </span>
              </label>
              <select v-model="novoMapeamento.tabelaReferencia" class="select-form">
                <option value="">(Nenhuma tabela de domínio)</option>
                <option
                  v-for="dom in dominiosDisponiveis"
                  :key="dom.tabela"
                  :value="dom.tabela"
                >
                  {{ dom.label }}
                </option>
              </select>
              <span v-if="dominiosDisponiveis.length === 0" class="dica-sem-dominio">
                Nenhuma tabela de domínio aplicável a esta tabela.
              </span>
            </div>

            <!-- Valor Mínimo -->
            <div class="campo">
              <label class="rotulo-campo">
                Valor Mínimo Aceito
                <span class="dica-info" title="Envia para a Quarentena valores numéricos menores que este limite (ex.: área > 0).">
                  <svg class="icone-info-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                </span>
              </label>
              <input
                type="number"
                step="any"
                v-model.number="novoMapeamento.valorMinimo"
                placeholder="Ex: 0.0, 1980"
                class="input-form"
              />
            </div>

            <!-- Checkboxes de Validação -->
            <div class="campo-checks">
              <label class="check-item">
                <input type="checkbox" v-model="novoMapeamento.obrigatorio" />
                <span>Obrigatório</span>
              </label>
              <label class="check-item">
                <input type="checkbox" v-model="novoMapeamento.validarGeometria" />
                <span>Validar Geometria</span>
              </label>
              <label class="check-item">
                <input type="checkbox" v-model="novoMapeamento.validarCpfCnpj" />
                <span>Validar CPF / CNPJ</span>
              </label>
              <label class="check-item">
                <input type="checkbox" v-model="novoMapeamento.validarRecortePr" />
                <span>Validar Limite PR</span>
              </label>
              <label class="check-item">
                <input type="checkbox" v-model="novoMapeamento.impedirRegressao" />
                <span>Bloquear Regressão</span>
              </label>
            </div>

            <!-- Botões de Ação do Form -->
            <div class="campo-btn">
              <button
                v-if="novoMapeamento.id"
                type="button"
                class="btn-cancelar"
                @click="cancelarEdicao"
              >
                Cancelar
              </button>
              <button type="submit" class="btn-adicionar" :disabled="salvando">
                {{ salvando ? 'Gravando...' : novoMapeamento.id ? 'Salvar Alterações' : '+ Mapear Campo' }}
              </button>
            </div>
          </form>
        </section>

        <!-- 3. TABELA DE MAPEAMENTOS CADASTRADOS (EXIBIDA APENAS QUANDO HOUVER TABELA SILVER) -->
        <section v-if="tabelaSilverSelecionada" class="secao-tabela">
          <div class="secao-topo">
            <h3 class="secao-titulo">Colunas Atualmente Mapeadas ({{ mapeamentos.length }})</h3>
            <span v-if="carregando" class="spinner-sm"></span>
          </div>

          <div v-if="mapeamentos.length === 0 && !carregando" class="vazio">
            Nenhum de-para configurado para esta fonte. O pipeline armazenará colunas não mapeadas nos metadados gerais.
          </div>

          <div v-else class="tabela-responsiva-wrapper">
            <table class="tabela-mapeamentos">
              <thead>
                <tr>
                  <th>Coluna Origem</th>
                  <th>Atributo Silver</th>
                  <th>Destino</th>
                  <th>Tipo</th>
                  <th>Regras Ativas</th>
                  <th v-if="podeEditar" class="col-acoes">Ações</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="map in mapeamentos"
                  :key="map.id"
                  :class="{ 'linha-ativa': novoMapeamento.id === map.id }"
                >
                  <td class="coluna-fonte">
                    <code>{{ map.colunaOrigem }}</code>
                  </td>
                  <td class="coluna-silver">
                    <strong>{{ map.atributoDestino }}</strong>
                  </td>
                  <td>
                    <span class="badge-destino" :class="'badge--' + map.destinoTipo?.toLowerCase()">
                      {{ map.destinoTipo }}
                    </span>
                  </td>
                  <td>
                    <span class="tipo-tag">{{ map.tipoDado || 'texto' }}</span>
                  </td>
                  <td class="regras-tags">
                    <!-- Regras de Flags -->
                    <span v-if="map.obrigatorio" class="tag-regra tag-regra--obrig">Obrigatório</span>
                    <span v-if="map.validarGeometria" class="tag-regra tag-regra--geo">Geometria</span>
                    <span v-if="map.validarCpfCnpj" class="tag-regra tag-regra--doc">CPF/CNPJ</span>
                    <span v-if="map.validarRecortePr" class="tag-regra tag-regra--pr">Paraná</span>
                    <span v-if="map.impedirRegressao" class="tag-regra tag-regra--regr">Anti-regressão</span>

                    <!-- Regra de Integridade Cruzada (Ref Silver) -->
                    <span
                      v-if="map.referenciaEntidadeSilver"
                      class="tag-regra tag-regra--ref"
                      :title="'Integridade Cruzada ativa contra SILVER.' + map.referenciaEntidadeSilver"
                    >
                      Ref: {{ map.referenciaEntidadeSilver }}
                    </span>

                    <!-- Regra de Domínio -->
                    <span
                      v-if="map.tabelaReferencia"
                      class="tag-regra tag-regra--dom"
                      :title="'Validação de domínio ativa contra SILVER.' + map.tabelaReferencia"
                    >
                      Domínio: {{ map.tabelaReferencia }}
                    </span>

                    <!-- Regra de Valor Mínimo -->
                    <span
                      v-if="map.valorMinimo !== null && map.valorMinimo !== undefined"
                      class="tag-regra tag-regra--min"
                      :title="'Valor numérico mínimo exigido: ' + map.valorMinimo"
                    >
                      ≥ {{ map.valorMinimo }}
                    </span>
                  </td>
                  <td v-if="podeEditar" class="col-acoes">
                    <button
                      class="btn-editar"
                      title="Editar regras deste campo"
                      @click="editar(map)"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button
                      class="btn-excluir"
                      title="Excluir mapeamento"
                      @click="solicitarRemover(map)"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <footer class="modal-footer">
        <button class="btn-fechar-modal" @click="fechar">Fechar</button>
      </footer>
    </div>

    <!-- POPUP MODAL: CONFIRMAÇÃO DE TROCA DE TABELA SILVER -->
    <div
      v-if="popupTrocaSilverAberto"
      class="popup-overlay"
      @click.self="cancelarTrocaTabelaSilver"
    >
      <div class="popup-card popup-card--perigo">
        <div class="popup-icone-wrapper">
          <svg class="popup-svg-aviso" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <div class="popup-conteudo">
          <h3 class="popup-titulo">Trocar Tabela Silver de Destino?</h3>
          <p class="popup-mensagem">
            A fonte já possui <strong>{{ mapeamentos.length }} coluna(s) mapeada(s)</strong> para a tabela
            <span class="tag-silver-destaque">{{ nomeTabelaAntiga }}</span>.
          </p>
          <div class="popup-alerta-box">
            <svg class="alerta-box-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p class="alerta-box-texto">
              Ao mudar para <strong>{{ nomeNovaTabela }}</strong>, <strong>todos os mapeamentos atuais serão excluídos permanentemente</strong>, pois cada tabela Silver possui suas próprias colunas e validações.
            </p>
          </div>
          <p class="popup-pergunta">Deseja realmente continuar com a alteração?</p>
        </div>
        <div class="popup-acoes">
          <button
            type="button"
            class="btn-popup-cancelar"
            :disabled="limpandoEAlterandoSilver"
            @click="cancelarTrocaTabelaSilver"
          >
            Cancelar
          </button>
          <button
            type="button"
            class="btn-popup-confirmar btn-popup-confirmar--perigo"
            :disabled="limpandoEAlterandoSilver"
            @click="confirmarTrocaTabelaSilver"
          >
            <span v-if="limpandoEAlterandoSilver" class="spinner-sm"></span>
            <span>{{ limpandoEAlterandoSilver ? 'Limpando e Alterando...' : 'Sim, Trocar e Limpar Campos' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- POPUP MODAL: CONFIRMAÇÃO DE EXCLUSÃO DE CAMPO -->
    <div
      v-if="popupExcluirCampoAberto && mapeamentoParaExcluir"
      class="popup-overlay"
      @click.self="cancelarRemoverCampo"
    >
      <div class="popup-card">
        <div class="popup-icone-wrapper popup-icone-wrapper--lixeira">
          <svg class="popup-svg-lixeira" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </div>
        <div class="popup-conteudo">
          <h3 class="popup-titulo">Remover Mapeamento de Coluna</h3>
          <p class="popup-mensagem">
            Deseja realmente remover o de-para da coluna
            <code>{{ mapeamentoParaExcluir.colunaOrigem }}</code>
            <span v-if="mapeamentoParaExcluir.atributoDestino">
              → <strong>{{ mapeamentoParaExcluir.atributoDestino }}</strong>
            </span>?
          </p>
          <p class="popup-subtexto">
            Os dados desta coluna bruta deixarão de ser promovidos para a camada Silver e ficarão apenas nos metadados gerais.
          </p>
        </div>
        <div class="popup-acoes">
          <button
            type="button"
            class="btn-popup-cancelar"
            :disabled="excluindoCampo"
            @click="cancelarRemoverCampo"
          >
            Cancelar
          </button>
          <button
            type="button"
            class="btn-popup-confirmar btn-popup-confirmar--perigo"
            :disabled="excluindoCampo"
            @click="confirmarRemoverCampo"
          >
            <span v-if="excluindoCampo" class="spinner-sm"></span>
            <span>{{ excluindoCampo ? 'Removendo...' : 'Remover Campo' }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.65);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1.5rem;
}

.modal-dialog {
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  width: 100%;
  max-width: 950px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  border: 1px solid #e2e8f0;
  overflow: hidden;
}

.modal-header {
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  background: #fafbfc;
}

.modal-etiqueta {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: #15803d;
  display: inline-block;
  margin-bottom: 0.25rem;
}

.modal-titulo {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 800;
  color: #0f172a;
}

.modal-sub {
  margin: 0.3rem 0 0;
  font-size: 0.84rem;
  color: #64748b;
  max-width: 750px;
  line-height: 1.4;
}

.btn-fechar {
  background: transparent;
  border: none;
  font-size: 1.2rem;
  color: #94a3b8;
  cursor: pointer;
  padding: 0.35rem 0.5rem;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.btn-fechar:hover {
  background: #f1f5f9;
  color: #334155;
}

.modal-body {
  padding: 1.5rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.alerta {
  padding: 0.75rem 1rem;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
}

.alerta--dispensavel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.btn-fechar-alerta {
  background: transparent;
  border: none;
  font-size: 1rem;
  line-height: 1;
  color: inherit;
  opacity: 0.7;
  cursor: pointer;
  padding: 0.15rem 0.35rem;
  border-radius: 4px;
  transition: opacity 0.15s ease;
}

.btn-fechar-alerta:hover {
  opacity: 1;
}

.alerta--erro {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

.alerta--sucesso {
  background: #dcfce7;
  color: #166534;
  border: 1px solid #bbf7d0;
}

/* 1. Card Etapa Silver */
.card-etapa-silver {
  background: #f8fafc;
  border: 2px dashed #cbd5e1;
  border-radius: 12px;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  transition: all 0.2s ease;
}

.card-etapa-silver--ativo {
  background: #f0fdf4;
  border: 1.5px solid #86efac;
  box-shadow: 0 4px 12px rgba(22, 101, 52, 0.05);
}

.silver-topo {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.silver-passo-tag {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.35rem;
}

.etapa-numero {
  background: #0f172a;
  color: #ffffff;
  font-size: 0.65rem;
  font-weight: 800;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  letter-spacing: 0.05em;
}

.etapa-status {
  font-size: 0.72rem;
  font-weight: 700;
}

.status-ok {
  color: #15803d;
}

.status-pendente {
  color: #b45309;
}

.silver-titulo {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  color: #0f172a;
}

.silver-desc {
  margin: 0.25rem 0 0;
  font-size: 0.82rem;
  color: #475569;
  line-height: 1.4;
}

.silver-seletor-linha {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.25rem;
  align-items: flex-start;
}

.campo-silver-select {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.select-com-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.select-silver-destaque {
  border: 1.5px solid #0284c7;
  background-color: #ffffff;
  font-weight: 600;
  color: #0f172a;
  box-shadow: 0 1px 3px rgba(2, 132, 199, 0.12);
}

.silver-badge-card {
  background: #ffffff;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  padding: 0.75rem 1rem;
}

.silver-badge-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.25rem;
}

.silver-schema-tag {
  font-family: monospace;
  font-size: 0.75rem;
  font-weight: 700;
  color: #15803d;
  background: #dcfce7;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
}

.silver-cols-count {
  font-size: 0.75rem;
  color: #64748b;
  font-weight: 600;
}

.silver-badge-desc {
  margin: 0;
  font-size: 0.78rem;
  color: #334155;
  line-height: 1.35;
}

/* 2. Card Formulário com Bloqueio */
.card-formulario {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1.25rem;
  transition: all 0.2s ease;
}

.card-formulario--editando {
  background: #f0fdf4;
  border-color: #86efac;
  box-shadow: 0 4px 12px rgba(22, 101, 52, 0.08);
}

.silver-orientacao-inicial {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  padding: 1.5rem;
  background: #f8fafc;
  border: 1.5px dashed #cbd5e1;
  border-radius: 12px;
  color: #334155;
}

.orientacao-icone-wrapper {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  background: #e0f2fe;
  border: 1px solid #bae6fd;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.orientacao-svg {
  width: 26px;
  height: 26px;
  color: #0284c7;
}

.mini-svg-status {
  width: 13px;
  height: 13px;
  display: inline-block;
  vertical-align: -1px;
  margin-right: 2px;
}

.icone-info-svg {
  width: 14px;
  height: 14px;
  display: inline-block;
  vertical-align: -2px;
  color: #94a3b8;
  transition: color 0.15s ease;
}

.dica-info:hover .icone-info-svg {
  color: #0284c7;
}

.popup-svg-aviso {
  width: 26px;
  height: 26px;
  color: #dc2626;
}

.popup-svg-lixeira {
  width: 24px;
  height: 24px;
  color: #475569;
}

.alerta-box-svg {
  width: 18px;
  height: 18px;
  color: #e11d48;
  flex-shrink: 0;
  margin-top: 1px;
}

.orientacao-titulo {
  margin: 0 0 0.35rem;
  font-size: 0.95rem;
  font-weight: 800;
  color: #0f172a;
}

.orientacao-desc {
  margin: 0;
  font-size: 0.85rem;
  color: #64748b;
  line-height: 1.45;
}

.secao-topo-form {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.form-titulo-grupo {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.secao-titulo {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: #0f172a;
}

.badge-editando {
  font-size: 0.72rem;
  font-weight: 700;
  color: #15803d;
  background: #dcfce7;
  padding: 0.2rem 0.5rem;
  border-radius: 6px;
  border: 1px solid #bbf7d0;
}

.grid-form {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

.campo {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.rotulo-campo {
  font-size: 0.75rem;
  font-weight: 700;
  color: #334155;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.dica-info {
  cursor: help;
  color: #64748b;
  font-size: 0.75rem;
}

.dica-sem-dominio {
  font-size: 0.72rem;
  color: #94a3b8;
  font-style: italic;
  margin-top: 0.2rem;
}

.input-form,
.select-form {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 0.85rem;
  color: #0f172a;
  background-color: #ffffff;
  outline: none;
  transition: all 0.15s ease;
}

.input-form:focus,
.select-form:focus {
  border-color: #15803d;
  box-shadow: 0 0 0 3px rgba(21, 128, 61, 0.15);
}

.campo-checks {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 1.25rem;
  padding: 0.75rem 1rem;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.check-item {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.82rem;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
}

.check-item input[type='checkbox'] {
  width: 16px;
  height: 16px;
  accent-color: #15803d;
  cursor: pointer;
}

.campo-btn {
  grid-column: 1 / -1;
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.btn-cancelar {
  padding: 0.5rem 1rem;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  color: #475569;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-adicionar {
  padding: 0.5rem 1.25rem;
  background: #15803d;
  border: none;
  color: #ffffff;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(21, 128, 61, 0.2);
  transition: all 0.15s ease;
}

.btn-adicionar:hover:not(:disabled) {
  background: #166534;
}

.btn-adicionar:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 3. Tabela de Mapeamentos */
.secao-tabela {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.secao-topo {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tabela-responsiva-wrapper {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow-x: auto;
  background: #ffffff;
}

.tabela-mapeamentos {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
  text-align: left;
}

.tabela-mapeamentos th {
  background: #f8fafc;
  color: #475569;
  font-weight: 700;
  padding: 0.65rem 0.85rem;
  border-bottom: 1px solid #e2e8f0;
  white-space: nowrap;
}

.tabela-mapeamentos td {
  padding: 0.65rem 0.85rem;
  border-bottom: 1px solid #f1f5f9;
  color: #334155;
  vertical-align: middle;
}

.tabela-mapeamentos tbody tr:last-child td {
  border-bottom: none;
}

.tabela-mapeamentos tbody tr:hover {
  background: #f8fafc;
}

.linha-ativa {
  background: #f0fdf4 !important;
}

.coluna-fonte code {
  background: #f1f5f9;
  color: #0f172a;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  font-family: monospace;
  font-size: 0.8rem;
  border: 1px solid #e2e8f0;
}

.coluna-silver strong {
  color: #0f172a;
}

.badge-destino {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  text-transform: uppercase;
}

.badge--coluna {
  background: #e0f2fe;
  color: #0369a1;
}

.badge--geometria {
  background: #fef3c7;
  color: #92400e;
}

.badge--json {
  background: #f3e8ff;
  color: #7e22ce;
}

.tipo-tag {
  font-size: 0.74rem;
  color: #64748b;
  font-family: monospace;
}

.regras-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.tag-regra {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
}

.tag-regra--obrig {
  background: #fee2e2;
  color: #991b1b;
}

.tag-regra--geo {
  background: #fef3c7;
  color: #92400e;
}

.tag-regra--doc {
  background: #e0e7ff;
  color: #3730a3;
}

.tag-regra--pr {
  background: #dcfce7;
  color: #166534;
}

.tag-regra--regr {
  background: #f1f5f9;
  color: #475569;
}

.tag-regra--ref {
  background: #ede9fe;
  color: #5b21b6;
}

.tag-regra--dom {
  background: #e0f2fe;
  color: #0369a1;
}

.tag-regra--min {
  background: #fae8ff;
  color: #86198f;
}

.col-acoes {
  text-align: right;
  white-space: nowrap;
}

.btn-editar,
.btn-excluir {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0.3rem;
  border-radius: 4px;
  margin-left: 0.25rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.btn-editar svg,
.btn-excluir svg {
  width: 15px;
  height: 15px;
}

.btn-editar {
  color: #0284c7;
}

.btn-editar:hover {
  background: #e0f2fe;
}

.btn-excluir {
  color: #ef4444;
}

.btn-excluir:hover {
  background: #fee2e2;
}

.modal-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid #f1f5f9;
  display: flex;
  justify-content: flex-end;
  background: #fafbfc;
}

.btn-fechar-modal {
  padding: 0.5rem 1.25rem;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  color: #334155;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-fechar-modal:hover {
  background: #f1f5f9;
}

.vazio {
  text-align: center;
  padding: 2rem;
  color: #94a3b8;
  font-size: 0.85rem;
  border: 1px dashed #cbd5e1;
  border-radius: 10px;
}

.spinner-sm {
  width: 16px;
  height: 16px;
  border: 2px solid #cbd5e1;
  border-top-color: #15803d;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  display: inline-block;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Popups de Confirmação In-App */
.popup-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.75);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
  padding: 1.5rem;
  animation: fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.popup-card {
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(226, 232, 240, 0.8);
  width: 100%;
  max-width: 480px;
  padding: 1.75rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  animation: scaleUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.popup-card--perigo {
  border-top: 4px solid #ef4444;
}

.popup-icone-wrapper {
  width: 52px;
  height: 52px;
  border-radius: 12px;
  background: #fef2f2;
  border: 1px solid #fee2e2;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
}

.popup-icone-wrapper--lixeira {
  background: #f8fafc;
  border-color: #e2e8f0;
}

.popup-icone {
  font-size: 1.75rem;
}

.popup-conteudo {
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.popup-titulo {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  color: #0f172a;
}

.popup-mensagem {
  margin: 0;
  font-size: 0.88rem;
  color: #475569;
  line-height: 1.45;
}

.popup-subtexto {
  margin: 0;
  font-size: 0.8rem;
  color: #64748b;
  line-height: 1.4;
}

.tag-silver-destaque {
  font-weight: 700;
  color: #15803d;
  background: #dcfce7;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
}

.popup-alerta-box {
  background: #fff1f2;
  border: 1px solid #fecdd3;
  border-radius: 8px;
  padding: 0.75rem 1rem;
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  text-align: left;
}

.alerta-box-texto {
  margin: 0;
  font-size: 0.8rem;
  color: #9f1239;
  line-height: 1.4;
}

.popup-pergunta {
  margin: 0.25rem 0 0;
  font-size: 0.84rem;
  font-weight: 700;
  color: #1e293b;
}

.popup-acoes {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.btn-popup-cancelar {
  background: #ffffff;
  border: 1.5px solid #cbd5e1;
  color: #475569;
  padding: 0.6rem 1.1rem;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-popup-cancelar:hover:not(:disabled) {
  background: #f1f5f9;
  color: #0f172a;
}

.btn-popup-confirmar {
  background: #0f172a;
  border: 1.5px solid #0f172a;
  color: #ffffff;
  padding: 0.6rem 1.25rem;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition: all 0.15s ease;
}

.btn-popup-confirmar--perigo {
  background: #dc2626;
  border-color: #dc2626;
}

.btn-popup-confirmar--perigo:hover:not(:disabled) {
  background: #b91c1c;
  border-color: #b91c1c;
  box-shadow: 0 4px 12px rgba(220, 38, 38, 0.25);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes scaleUp {
  from {
    opacity: 0;
    transform: scale(0.94);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@media (max-width: 768px) {
  .silver-seletor-linha {
    grid-template-columns: 1fr;
  }
  .grid-form {
    grid-template-columns: 1fr;
  }
}

/* Painel de Prontidão e Completude para Ingestão */
.card-prontidao-ingestao {
  background: #ffffff;
  border: 1.5px solid #e2e8f0;
  border-radius: 12px;
  padding: 1.15rem 1.35rem;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.prontidao-topo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.prontidao-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.35rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.badge-prontidao-liberada {
  background: #ecfdf5;
  color: #047857;
  border: 1px solid #a7f3d0;
}

.badge-prontidao-bloqueada {
  background: #fffbeb;
  color: #b45309;
  border: 1px solid #fde68a;
}

.prontidao-contador {
  font-size: 0.86rem;
  color: #475569;
}

.prontidao-contador strong {
  color: #0f172a;
}

.barra-prontidao-trilho {
  width: 100%;
  height: 8px;
  background: #f1f5f9;
  border-radius: 9999px;
  overflow: hidden;
}

.barra-prontidao-preenchimento {
  height: 100%;
  background: linear-gradient(90deg, #f59e0b, #d97706);
  border-radius: 9999px;
  transition: width 0.3s ease;
}

.barra-prontidao-preenchimento--completo {
  background: linear-gradient(90deg, #10b981, #059669);
}

.prontidao-pendencias {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.prontidao-aviso-texto {
  font-size: 0.8rem;
  color: #64748b;
  line-height: 1.4;
}

.chips-colunas-pendentes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.chip-coluna-pendente {
  display: inline-block;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  color: #475569;
  padding: 0.2rem 0.55rem;
  border-radius: 6px;
  font-family: monospace;
  font-size: 0.78rem;
  font-weight: 600;
}

.prontidao-concluida {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.82rem;
  font-weight: 600;
  color: #047857;
}

.prontidao-concluida .mini-svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
</style>
