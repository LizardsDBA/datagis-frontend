import { createRouter, createWebHistory } from 'vue-router'
import CadastroFontes from '../components/CadastroFontes.vue'
import QuarentenaView from '../components/QuarentenaView.vue'
import LotesView from '../components/LotesView.vue'
import ConjuntosView from '../components/ConjuntosView.vue'
import GoldView from '../components/GoldView.vue'
import IndicadoresView from '../components/IndicadoresView.vue'
import ConjuntosDadosView from '../components/ConjuntosDadosView.vue'
import UsuariosView from '../components/UsuariosView.vue'
import ControleAcessoView from '../components/ControleAcessoView.vue'
import PerfisAcessoView from '../components/PerfisAcessoView.vue'
import MatrizAcessoView from '../components/MatrizAcessoView.vue'
import AuditoriaView from '../components/AuditoriaView.vue'
import SemAcessoView from '../components/SemAcessoView.vue'
import { temPermissao } from '../auth/autenticacao'
import { PERMISSOES } from '../auth/permissoes'

// Rotas ativas do DataGIS:
// - /fontes: Cadastro e execução de fontes
// - /lotes: Gestão de lotes, pipeline e liberação All-or-Nothing
// - /quarentena: Triagem, auditoria e resolução de inconsistências (Fase 3)
// - /conjuntos-dados/:fonteId: comparação Bronze/Silver/Quarentena linha a linha
//   (não confundir com /conjuntos, que é cadastro de cobertura territorial)
// - /indicadores: consulta dos dados finais em tabela, por município e por imóvel
// - /auditoria: log de auditoria das ações (somente leitura)
// - /admin/controle-acesso: painel do Controle de Acesso, com atalho pras 3 telas abaixo
// - /admin/usuarios: cadastro de usuários e atribuição de perfis/permissões
// - /admin/perfis e /admin/matriz-acesso: consulta (só leitura) de perfis e permissões
//
// meta.permissao = role de permissão exigida pra abrir a tela (mesmo código do backend).
// meta.titulo = nome da tela na Matriz de Acesso (que lista as telas de cada permissão).
// A ordem da lista também define pra onde "/" leva: a primeira tela que o usuário pode abrir.
const routes = [
  { path: '/', redirect: () => primeiraRotaPermitida() },
  {
    path: '/fontes',
    name: 'fontes',
    component: CadastroFontes,
    meta: { permissao: PERMISSOES.FONTE_VISUALIZAR, titulo: 'Cadastro de Fontes' },
  },
  {
    path: '/lotes',
    name: 'lotes',
    component: LotesView,
    meta: { permissao: PERMISSOES.LOTE_VISUALIZAR, titulo: 'Lotes e Pipeline' },
  },
  {
    path: '/quarentena',
    name: 'quarentena',
    component: QuarentenaView,
    meta: { permissao: PERMISSOES.QUARENTENA_VISUALIZAR, titulo: 'Quarentena e Qualidade' },
  },
  {
    path: '/conjuntos',
    name: 'conjuntos',
    component: ConjuntosView,
    meta: { permissao: PERMISSOES.CONJUNTO_VISUALIZAR, titulo: 'Indicadores e Resultados (mapa)' },
  },
  {
    path: '/conjuntos-dados/:fonteId',
    name: 'conjuntos-dados',
    component: ConjuntosDadosView,
    meta: { permissao: PERMISSOES.DADOS_VISUALIZAR, titulo: 'Conjunto de Dados (aberto pelo Cadastro de Fontes)' },
  },
  {
    path: '/gold',
    name: 'gold',
    component: GoldView,
    meta: { permissao: PERMISSOES.INDICADOR_VISUALIZAR, titulo: 'Gold (publicação)' },
  },
  {
    path: '/indicadores',
    name: 'indicadores',
    component: IndicadoresView,
    meta: { permissao: PERMISSOES.INDICADOR_VISUALIZAR, titulo: 'Indicadores e Resultados (tabela)' },
  },
  {
    path: '/auditoria',
    name: 'auditoria',
    component: AuditoriaView,
    meta: { permissao: PERMISSOES.AUDITORIA_VISUALIZAR, titulo: 'Logs de Auditoria' },
  },
  {
    path: '/admin/controle-acesso',
    name: 'controle-acesso',
    component: ControleAcessoView,
    meta: { permissao: PERMISSOES.USUARIO_GERENCIAR, titulo: 'Controle de Acesso' },
  },
  {
    path: '/admin/usuarios',
    name: 'usuarios',
    component: UsuariosView,
    meta: { permissao: PERMISSOES.USUARIO_GERENCIAR, titulo: 'Usuários' },
  },
  {
    path: '/admin/perfis',
    name: 'perfis',
    component: PerfisAcessoView,
    meta: { permissao: PERMISSOES.USUARIO_GERENCIAR, titulo: 'Perfis' },
  },
  {
    path: '/admin/matriz-acesso',
    name: 'matriz-acesso',
    component: MatrizAcessoView,
    meta: { permissao: PERMISSOES.USUARIO_GERENCIAR, titulo: 'Matriz de Acesso' },
  },
  { path: '/sem-acesso', name: 'sem-acesso', component: SemAcessoView },
]

function primeiraRotaPermitida() {
  const rota = routes.find((r) => r.meta?.permissao && !r.path.includes(':') && temPermissao(r.meta.permissao))
  return rota ? rota.path : '/sem-acesso'
}

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// Tela sem permissão: manda pra primeira tela permitida (ou pra "sem acesso"), em vez de
// abrir uma página que só ia mostrar erro 403 em todas as chamadas.
router.beforeEach((destino) => {
  if (destino.meta.permissao && !temPermissao(destino.meta.permissao)) {
    return primeiraRotaPermitida()
  }
  return true
})

export default router