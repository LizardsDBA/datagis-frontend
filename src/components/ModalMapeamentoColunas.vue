<script setup>
import { ref, computed, watch } from 'vue'
import {
  buscarMapeamentos,
  salvarMapeamentos,
  excluirMapeamento,
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
      { nome: 'situacao_imovel', label: 'Situação do Imóvel', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: true, tabelaReferencia: 'situacao_imovel' },
      { nome: 'condicao_imovel', label: 'Condição do Imóvel', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false, tabelaReferencia: 'condicao_imovel' },
      { nome: 'tipo_imovel', label: 'Tipo do Imóvel', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false, tabelaReferencia: 'tipo_imovel' },
      { nome: 'area_ha', label: 'Área do Imóvel (ha)', tipoDado: 'numero', destinoTipo: 'COLUNA', obrigatorio: false, valorMinimo: 0.0 },
      { nome: 'modulos_fiscais', label: 'Módulos Fiscais', tipoDado: 'numero', destinoTipo: 'COLUNA', obrigatorio: false, valorMinimo: 0.0 },
      { nome: 'municipio', label: 'Município (Código IBGE / Nome)', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false },
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
      { nome: 'area_ha', label: 'Área Total (ha)', tipoDado: 'numero', destinoTipo: 'COLUNA', obrigatorio: false, valorMinimo: 0.0 },
      { nome: 'tipo_area_protegida', label: 'Tipo de Área Protegida', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false, tabelaReferencia: 'tipo_area_protegida' },
      { nome: 'categoria_area_protegida', label: 'Categoria de Área Protegida', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false, tabelaReferencia: 'categoria_area_protegida' },
      { nome: 'orgao', label: 'Órgão Gestor Responsável', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false, tabelaReferencia: 'orgao' },
      { nome: 'bioma', label: 'Bioma Predominante', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false, tabelaReferencia: 'bioma' },
      { nome: 'ato_legal', label: 'Ato Legal de Criação', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false },
      { nome: 'ano_criacao', label: 'Ano de Criação', tipoDado: 'numero', destinoTipo: 'COLUNA', obrigatorio: false, valorMinimo: 1500.0 },
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
      { nome: 'area_ha', label: 'Área Embargada (ha)', tipoDado: 'numero', destinoTipo: 'COLUNA', obrigatorio: false, valorMinimo: 0.0 },
      { nome: 'orgao', label: 'Órgão Emissor', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: true, tabelaReferencia: 'orgao' },
      { nome: 'tipo_area_embargo', label: 'Tipo de Infração / Área Embargada', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false, tabelaReferencia: 'tipo_area_embargo' },
      { nome: 'cpf_cnpj', label: 'Documento do Infrator (CPF / CNPJ)', tipoDado: 'cpf_cnpj', destinoTipo: 'COLUNA', obrigatorio: false, validarCpfCnpj: true },
      { nome: 'nome_infrator', label: 'Nome ou Razão Social do Infrator', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false },
      { nome: 'municipio', label: 'Município', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false },
      { nome: 'descricao_infracao', label: 'Descrição do Motivo do Embargo', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false },
      { nome: 'processo', label: 'Número do Processo Administrativo', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false },
      { nome: 'auto_infracao_id', label: 'Referência ao Auto de Infração', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false },
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
      { nome: 'orgao', label: 'Órgão Autuador', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: true, tabelaReferencia: 'orgao' },
      { nome: 'tipo_auto_infracao', label: 'Tipo de Auto de Infração', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false, tabelaReferencia: 'tipo_auto_infracao' },
      { nome: 'tipo_infracao', label: 'Tipo de Infração', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false, tabelaReferencia: 'tipo_infracao' },
      { nome: 'tipo_pessoa', label: 'Tipo de Pessoa (Física / Jurídica)', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false, tabelaReferencia: 'tipo_pessoa' },
      { nome: 'status_auto_infracao', label: 'Status do Auto', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false, tabelaReferencia: 'status_auto_infracao' },
      { nome: 'cpf_cnpj', label: 'CPF ou CNPJ do Autuado', tipoDado: 'cpf_cnpj', destinoTipo: 'COLUNA', obrigatorio: false, validarCpfCnpj: true },
      { nome: 'nome_infrator', label: 'Nome do Autuado', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false },
      { nome: 'municipio', label: 'Município', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false },
      { nome: 'descricao_infracao', label: 'Descrição da Infração', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false },
      { nome: 'processo', label: 'Número do Processo Administrativo', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false },
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
      { nome: 'ano_deteccao', label: 'Ano da Detecção PRODES', tipoDado: 'numero', destinoTipo: 'COLUNA', obrigatorio: false, valorMinimo: 1980.0 },
      { nome: 'area_ha', label: 'Área Desmatada (ha)', tipoDado: 'numero', destinoTipo: 'COLUNA', obrigatorio: false, valorMinimo: 0.0 },
      { nome: 'classe_prodes', label: 'Classe PRODES', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false, tabelaReferencia: 'classe_prodes' },
      { nome: 'satelite', label: 'Satélite', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false, tabelaReferencia: 'satelite' },
      { nome: 'sensor', label: 'Sensor', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false, tabelaReferencia: 'sensor' },
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
      { nome: 'data_hora_foco', label: 'Data e Hora do Foco', tipoDado: 'data_iso', destinoTipo: 'COLUNA', obrigatorio: false },
      { nome: 'satelite', label: 'Satélite', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false, tabelaReferencia: 'satelite' },
      { nome: 'bioma', label: 'Bioma', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false, tabelaReferencia: 'bioma' },
      { nome: 'municipio', label: 'Município', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false },
      { nome: 'risco_fogo', label: 'Risco de Fogo', tipoDado: 'numero', destinoTipo: 'COLUNA', obrigatorio: false },
      { nome: 'dias_sem_chuva', label: 'Dias Sem Chuva', tipoDado: 'numero', destinoTipo: 'COLUNA', obrigatorio: false, valorMinimo: 0.0 },
      { nome: 'precipitacao', label: 'Precipitação (mm)', tipoDado: 'numero', destinoTipo: 'COLUNA', obrigatorio: false, valorMinimo: 0.0 },
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
      { nome: 'unidade_federativa', label: 'Unidade Federativa (UF)', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false, tabelaReferencia: 'unidade_federativa' },
      { nome: 'bioma_predominante', label: 'Bioma Predominante', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: false, tabelaReferencia: 'bioma' },
      { nome: 'area_ha', label: 'Área Total do Município (ha)', tipoDado: 'numero', destinoTipo: 'COLUNA', obrigatorio: false, valorMinimo: 0.0 },
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

const emit = defineEmits(['fechar'])

const mapeamentos = ref([])
const carregando = ref(false)
const salvando = ref(false)
const erro = ref(null)
const sucesso = ref(null)

// Catálogo Silver e Tabela Selecionada
const esquemasSilver = ref(CATALOGO_SILVER_FALLBACK)
const carregandoEsquemas = ref(false)
const tabelaSilverSelecionada = ref('')
const salvandoTabelaSilver = ref(false)

// Controle do Atributo Destino Canônico vs Customizado
const atributoDestinoSelecionado = ref('')
const modoAtributoCustomizado = ref(false)

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

const colunasSilverDisponiveis = computed(() => esquemaAtivo.value?.colunas || [])
const dominiosDisponiveis = computed(() => esquemaAtivo.value?.dominios || [])

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

watch(
  () => props.fonte,
  async (novaFonte) => {
    if (novaFonte) {
      tabelaSilverSelecionada.value = novaFonte.entidadeSilver || ''
      cancelarEdicao()
      await carregarEsquemas()
      await carregarMapeamentos()
    } else {
      mapeamentos.value = []
      tabelaSilverSelecionada.value = ''
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
    sucesso.value = `Tabela Silver definida como "${esquemaAtivo.value?.nome || tabelaSilverSelecionada.value}" com sucesso!`
  } catch (e) {
    erro.value = e.message || 'Falha ao vincular tabela Silver à fonte.'
  } finally {
    salvandoTabelaSilver.value = false
  }
}

function aoTrocarAtributoDestino() {
  if (atributoDestinoSelecionado.value === '__customizado__') {
    modoAtributoCustomizado.value = true
    novoMapeamento.value.atributoDestino = ''
    novoMapeamento.value.destinoTipo = 'JSON'
    novoMapeamento.value.tipoDado = 'texto'
    return
  }

  modoAtributoCustomizado.value = false
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

function voltarParaColunasCanonicas() {
  modoAtributoCustomizado.value = false
  atributoDestinoSelecionado.value = ''
  novoMapeamento.value.atributoDestino = ''
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

  const existeNoCatalogo = colunasSilverDisponiveis.value.some(
    (c) => c.nome === map.atributoDestino
  )
  if (existeNoCatalogo) {
    atributoDestinoSelecionado.value = map.atributoDestino
    modoAtributoCustomizado.value = false
  } else {
    atributoDestinoSelecionado.value = '__customizado__'
    modoAtributoCustomizado.value = true
  }

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
  modoAtributoCustomizado.value = false
}

async function salvarCampo() {
  if (!novoMapeamento.value.colunaOrigem.trim() || !novoMapeamento.value.atributoDestino.trim()) {
    erro.value = 'Preencha a coluna de origem e o atributo de destino.'
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
      referenciaEntidadeSilver: novoMapeamento.value.referenciaEntidadeSilver?.trim() || null,
      tabelaReferencia: novoMapeamento.value.tabelaReferencia?.trim() || null,
      valorMinimo:
        novoMapeamento.value.valorMinimo !== '' && novoMapeamento.value.valorMinimo !== null
          ? Number(novoMapeamento.value.valorMinimo)
          : null,
      fonteDadoId: props.fonte.id,
    }

    await salvarMapeamentos(props.fonte.id, [item])
    sucesso.value = novoMapeamento.value.id
      ? `Mapeamento do campo "${item.colunaOrigem}" atualizado com sucesso!`
      : `Novo mapeamento para "${item.colunaOrigem}" criado com sucesso!`

    cancelarEdicao()
    await carregarMapeamentos()
  } catch (e) {
    erro.value = e.message || 'Falha ao salvar mapeamento.'
  } finally {
    salvando.value = false
  }
}

async function remover(id) {
  if (!confirm('Deseja realmente remover este mapeamento de coluna?')) return
  try {
    await excluirMapeamento(props.fonte.id, id)
    if (novoMapeamento.value.id === id) {
      cancelarEdicao()
    }
    await carregarMapeamentos()
  } catch (e) {
    erro.value = e.message || 'Erro ao remover mapeamento.'
  }
}
</script>

<template>
  <div v-if="fonte" class="modal-backdrop" @click.self="emit('fechar')">
    <div class="modal-dialog">
      <header class="modal-header">
        <div>
          <span class="modal-etiqueta">DE-PARA DE ATRIBUTOS (BRONZE → SILVER)</span>
          <h2 class="modal-titulo">Mapeamento de Colunas — {{ fonte.nome }}</h2>
          <p class="modal-sub">
            Configure a tabela Silver de destino, regras de conversão, tipos de dados e validações (domínio, integridade, geometrias e CPF/CNPJ).
          </p>
        </div>
        <button class="btn-fechar" @click="emit('fechar')">✕</button>
      </header>

      <div class="modal-body">
        <div v-if="erro" class="alerta alerta--erro">{{ erro }}</div>
        <div v-if="sucesso" class="alerta alerta--sucesso">{{ sucesso }}</div>

        <!-- 1. SELEÇÃO DA TABELA SILVER DE DESTINO (PRÉ-REQUISITO OBRIGATÓRIO) -->
        <section class="card-etapa-silver" :class="{ 'card-etapa-silver--ativo': tabelaSilverSelecionada }">
          <div class="silver-topo">
            <div class="silver-info">
              <div class="silver-passo-tag">
                <span class="etapa-numero">ETAPA 1</span>
                <span class="etapa-status" :class="tabelaSilverSelecionada ? 'status-ok' : 'status-pendente'">
                  {{ tabelaSilverSelecionada ? '✓ Tabela Silver Definida' : 'Obrigatório para iniciar' }}
                </span>
              </div>
              <h3 class="silver-titulo">Tabela Silver de Destino (Fenômeno Canônico)</h3>
              <p class="silver-desc">
                Selecione a tabela da camada Silver para onde os registros tratados desta fonte serão promovidos.
                O de-para de campos e os domínios de validação serão contextualmente adaptados à tabela escolhida.
              </p>
            </div>
          </div>

          <div class="silver-seletor-linha">
            <div class="campo-silver-select">
              <label class="rotulo-campo">Tabela Canônica Silver *</label>
              <div class="select-com-status">
                <select
                  v-model="tabelaSilverSelecionada"
                  :disabled="!podeEditar || salvandoTabelaSilver"
                  class="select-form select-silver-destaque"
                  @change="salvarSelecaoTabelaSilver"
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
                <span class="silver-cols-count">{{ colunasSilverDisponiveis.length }} colunas canônicas</span>
              </div>
              <p class="silver-badge-desc">{{ esquemaAtivo.descricao }}</p>
            </div>
          </div>
        </section>

        <!-- 2. FORMULÁRIO DE MAPEAMENTO (BLOQUEADO ENQUANTO NÃO HOUVER TABELA SILVER) -->
        <section
          v-if="podeEditar"
          class="card-formulario"
          :class="{
            'card-formulario--editando': novoMapeamento.id,
            'card-formulario--bloqueado': !tabelaSilverSelecionada
          }"
        >
          <!-- Estado Bloqueado: Exibe aviso orientativo -->
          <div v-if="!tabelaSilverSelecionada" class="bloqueio-aviso">
            <div class="bloqueio-icone">🔒</div>
            <div class="bloqueio-conteudo">
              <h4 class="bloqueio-titulo">Mapeamento de Campos Bloqueado</h4>
              <p class="bloqueio-desc">
                Para configurar o de-para dos atributos, você deve primeiro selecionar a <strong>Tabela Silver de Destino</strong> na <strong>Etapa 1</strong> acima.
                Isso carregará automaticamente a lista de atributos canônicos e as regras de domínio permitidas.
              </p>
            </div>
          </div>

          <!-- Estado Desbloqueado: Formulário Ativo -->
          <template v-else>
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
                <label class="rotulo-campo">Coluna de Origem (Bronze/Payload) *</label>
                <input
                  v-model="novoMapeamento.colunaOrigem"
                  required
                  placeholder="Ex: cod_municipio_ibge, num_tad, cpf_cnpj"
                  class="input-form"
                />
              </div>

              <!-- Atributo Destino: Select inteligente das colunas canônicas da Silver -->
              <div class="campo">
                <label class="rotulo-campo">
                  Atributo Destino (Silver: {{ esquemaAtivo?.nome || tabelaSilverSelecionada }}) *
                </label>
                <div v-if="!modoAtributoCustomizado" class="atributo-select-wrapper">
                  <select
                    v-model="atributoDestinoSelecionado"
                    class="select-form"
                    required
                    @change="aoTrocarAtributoDestino"
                  >
                    <option value="" disabled>-- Selecione a coluna canônica da Silver --</option>
                    <option
                      v-for="col in colunasSilverDisponiveis"
                      :key="col.nome"
                      :value="col.nome"
                    >
                      {{ col.label }} ({{ col.nome }})
                    </option>
                    <option value="__customizado__">+ Outro / Atributo JSON Livre...</option>
                  </select>
                </div>
                <div v-else class="custom-atributo-wrapper">
                  <input
                    v-model="novoMapeamento.atributoDestino"
                    required
                    placeholder="Nome do atributo no JSON"
                    class="input-form"
                  />
                  <button
                    type="button"
                    class="btn-voltar-select"
                    title="Voltar para a lista de colunas canônicas"
                    @click="voltarParaColunasCanonicas"
                  >
                    ← Voltar às colunas padrão
                  </button>
                </div>
              </div>

              <div class="campo">
                <label class="rotulo-campo">Destino</label>
                <select v-model="novoMapeamento.destinoTipo" class="select-form">
                  <option value="COLUNA">Coluna Tabela Silver</option>
                  <option value="GEOMETRIA">Geometria Espacial</option>
                  <option value="JSON">Atributos JSON (Metadados)</option>
                </select>
              </div>

              <div class="campo">
                <label class="rotulo-campo">Tipo de Dado</label>
                <select v-model="novoMapeamento.tipoDado" class="select-form">
                  <option value="texto">Texto (String)</option>
                  <option value="numero">Numérico (Inteiro / Decimal)</option>
                  <option value="cpf_cnpj">Documento (CPF / CNPJ)</option>
                  <option value="data_iso">Data ISO / Timestamp</option>
                  <option value="wkt">Geometria WKT</option>
                  <option value="booleano">Booleano</option>
                </select>
              </div>

              <!-- Regra de Integridade Cruzada (Referência Silver) -->
              <div class="campo">
                <label class="rotulo-campo">
                  Integridade Cruzada (Ref. Silver)
                  <span class="dica-info" title="Valida se o valor existe na tabela canônica da Silver indicada. Se não existir, rejeita para a Quarentena.">ℹ</span>
                </label>
                <select v-model="novoMapeamento.referenciaEntidadeSilver" class="select-form">
                  <option value="">(Nenhuma validação cruzada)</option>
                  <option value="municipio">municipio — Valida código em SILVER.MUNICIPIO</option>
                  <option value="imovel_rural">imovel_rural — Valida chave em SILVER.IMOVEL_RURAL</option>
                  <option value="area_protegida">area_protegida — Valida código em SILVER.AREA_PROTEGIDA</option>
                  <option value="auto_infracao">auto_infracao — Valida número em SILVER.AUTO_INFRACAO</option>
                  <option value="embargo_ambiental">embargo_ambiental — Valida termo em SILVER.EMBARGO_AMBIENTAL</option>
                </select>
              </div>

              <!-- Regra de Domínio (Tabela Referência) - FILTRADA PELA TABELA SILVER SELECIONADA -->
              <div class="campo">
                <label class="rotulo-campo">
                  Validação de Domínio (Lookup)
                  <span class="dica-info" title="Valida se o código/descrição pertence à tabela de domínio cadastrada da entidade selecionada.">ℹ</span>
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
                  ℹ Nenhuma tabela de domínio aplicável a {{ esquemaAtivo?.nome }}.
                </span>
              </div>

              <!-- Valor Mínimo -->
              <div class="campo">
                <label class="rotulo-campo">
                  Valor Mínimo (Limite Inferior)
                  <span class="dica-info" title="Rejeita valores numéricos menores que este limite (ex.: área > 0).">ℹ</span>
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
                  <span>Validar CPF/CNPJ (Módulo 11)</span>
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
          </template>
        </section>

        <!-- 3. TABELA DE MAPEAMENTOS CADASTRADOS -->
        <section class="secao-tabela">
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
                      @click="remover(map.id)"
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
        <button class="btn-fechar-modal" @click="emit('fechar')">Fechar</button>
      </footer>
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

.card-formulario--bloqueado {
  background: #f8fafc;
  border-color: #cbd5e1;
  opacity: 0.9;
}

.bloqueio-aviso {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 8px;
}

.bloqueio-icone {
  font-size: 2rem;
}

.bloqueio-titulo {
  margin: 0 0 0.25rem;
  font-size: 0.92rem;
  font-weight: 800;
  color: #92400e;
}

.bloqueio-desc {
  margin: 0;
  font-size: 0.82rem;
  color: #78350f;
  line-height: 1.4;
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

.custom-atributo-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.btn-voltar-select {
  align-self: flex-start;
  background: transparent;
  border: none;
  font-size: 0.74rem;
  font-weight: 700;
  color: #0284c7;
  cursor: pointer;
  padding: 0.1rem 0;
  text-decoration: underline;
}

.btn-voltar-select:hover {
  color: #0369a1;
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

@media (max-width: 768px) {
  .silver-seletor-linha {
    grid-template-columns: 1fr;
  }
  .grid-form {
    grid-template-columns: 1fr;
  }
}
</style>
