/**
 * Catálogo das telas do DataGIS e dos botões principais de cada uma.
 *
 * Usado pela pesquisa da barra lateral (acha tela pelo título e botão pelo rótulo) e pela
 * tela inicial (atalhos e favoritos). Cada tela e cada botão leva a permissão que a própria
 * tela exige pra mostrá-lo: quem não pode ver o botão também não o encontra na pesquisa.
 *
 * `icone` e `cor` desenham o atalho da tela nos favoritos da Home (IconeTela.vue).
 *
 * `rotulo` do botão é o texto, o aria-label ou o title que o botão tem na tela — é por ele
 * que a pesquisa acha e destaca o botão depois de abrir a tela (destacarNaTela). Botão
 * novo numa tela entra aqui; tela nova entra aqui e no router.
 */
import { PERMISSOES } from '../auth/permissoes'

export const TELAS = [
  {
    rota: '/fontes',
    cor: '#3b82f6',
    titulo: 'Cadastro de Fontes',
    descricao: 'Fontes de dados, ingestão e mapeamento de colunas',
    icone: 'fontes',
    permissao: PERMISSOES.FONTE_VISUALIZAR,
    botoes: [
      { rotulo: 'Adicionar fonte', permissao: PERMISSOES.FONTE_GERENCIAR },
      { rotulo: 'Executar ingestão', permissao: PERMISSOES.FONTE_GERENCIAR },
      { rotulo: 'Fazer upload de arquivo', permissao: PERMISSOES.FONTE_GERENCIAR },
      { rotulo: 'Editar fonte', permissao: PERMISSOES.FONTE_GERENCIAR },
      { rotulo: 'Mapeamento de colunas' },
      { rotulo: 'Ver conjunto de dados', permissao: PERMISSOES.DADOS_VISUALIZAR },
    ],
  },
  {
    rota: '/lotes',
    cor: '#10b981',
    titulo: 'Lotes e Pipeline',
    descricao: 'Lotes de ingestão, liberação para a Silver e migração para a Gold',
    icone: 'lotes',
    permissao: PERMISSOES.LOTE_VISUALIZAR,
    botoes: [
      { rotulo: 'Migrar para Gold', permissao: PERMISSOES.INDICADOR_PUBLICAR },
      { rotulo: 'Liberar para Silver', permissao: PERMISSOES.LOTE_GERENCIAR },
      { rotulo: 'Descartar', permissao: PERMISSOES.LOTE_GERENCIAR },
      { rotulo: 'Inspecionar Erros', permissao: PERMISSOES.QUARENTENA_VISUALIZAR },
    ],
  },
  {
    rota: '/quarentena',
    cor: '#f59e0b',
    titulo: 'Quarentena e Qualidade',
    descricao: 'Registros reprovados e correção pelo analista',
    icone: 'quarentena',
    permissao: PERMISSOES.QUARENTENA_VISUALIZAR,
    botoes: [{ rotulo: 'Inspecionar' }],
  },
  {
    rota: '/conjuntos',
    cor: '#8b5cf6',
    titulo: 'Indicadores e Resultados (mapa)',
    descricao: 'Mapa do Paraná com os indicadores por município e imóvel',
    icone: 'conjuntos',
    permissao: PERMISSOES.CONJUNTO_VISUALIZAR,
    botoes: [
      { rotulo: 'Ver em tabela', permissao: PERMISSOES.INDICADOR_VISUALIZAR },
      { rotulo: 'Limpar seleção' },
    ],
  },
  {
    rota: '/indicadores',
    cor: '#06b6d4',
    titulo: 'Indicadores e Resultados (tabela)',
    descricao: 'Os 7 indicadores por município e por imóvel',
    icone: 'tabela',
    permissao: PERMISSOES.INDICADOR_VISUALIZAR,
    botoes: [
      { rotulo: 'Ver no mapa', permissao: PERMISSOES.CONJUNTO_VISUALIZAR },
      { rotulo: 'Por município' },
      { rotulo: 'Por imóvel' },
    ],
  },
  {
    rota: '/auditoria',
    cor: '#ec4899',
    titulo: 'Logs de Auditoria',
    descricao: 'Quem fez o quê e quando',
    icone: 'auditoria',
    permissao: PERMISSOES.AUDITORIA_VISUALIZAR,
    botoes: [{ rotulo: 'Filtrar' }, { rotulo: 'Ver JSON do filtro' }],
  },
  {
    rota: '/admin/controle-acesso',
    cor: '#84cc16',
    titulo: 'Controle de Acesso',
    descricao: 'Usuários, perfis e matriz de acesso',
    icone: 'painel',
    permissao: PERMISSOES.USUARIO_GERENCIAR,
    botoes: [],
  },
  {
    rota: '/admin/usuarios',
    cor: '#f97316',
    titulo: 'Usuários',
    descricao: 'Cadastro, perfis e permissões avulsas',
    icone: 'usuarios',
    permissao: PERMISSOES.USUARIO_GERENCIAR,
    botoes: [
      { rotulo: '+ Novo usuário' },
      { rotulo: 'Exportar' },
      { rotulo: 'Importação em Massa de Usuário' },
      { rotulo: 'Redefinir senha' },
    ],
  },
  {
    rota: '/admin/perfis',
    cor: '#6366f1',
    titulo: 'Perfis',
    descricao: 'O que cada perfil libera (consulta)',
    icone: 'perfis',
    permissao: PERMISSOES.USUARIO_GERENCIAR,
    botoes: [],
  },
  {
    rota: '/admin/matriz-acesso',
    cor: '#14b8a6',
    titulo: 'Matriz de Acesso',
    descricao: 'Permissões, perfis e telas liberadas (consulta)',
    icone: 'matriz',
    permissao: PERMISSOES.USUARIO_GERENCIAR,
    botoes: [],
  },
  {
    // Sem permissão: todo usuário logado abre a própria conta (pelo nome no rodapé do menu)
    rota: '/minha-conta',
    cor: '#0ea5e9',
    titulo: 'Minha conta',
    descricao: 'Seus dados, troca de nome e de senha',
    icone: 'conta',
    botoes: [{ rotulo: 'Trocar senha' }, { rotulo: 'Salvar nome' }],
  },
]
