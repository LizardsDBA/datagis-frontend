import { createRouter, createWebHistory } from 'vue-router'
import CadastroFontes from '../components/CadastroFontes.vue'
import QuarentenaView from '../components/QuarentenaView.vue'
import LotesView from '../components/LotesView.vue'
import ConjuntosView from '../components/ConjuntosView.vue'
import GoldView from '../components/GoldView.vue'
import ConjuntosDadosView from '../components/ConjuntosDadosView.vue'
import UsuariosView from '../components/UsuariosView.vue'
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
// - /auditoria: log de auditoria das ações (somente leitura)
// - /admin/usuarios: cadastro de usuários e atribuição de perfis/permissões
//
// meta.permissao = role de permissão exigida pra abrir a tela (mesmo código do backend).
// A ordem da lista também define pra onde "/" leva: a primeira tela que o usuário pode abrir.
const routes = [
  { path: '/', redirect: () => primeiraRotaPermitida() },
  { path: '/fontes', name: 'fontes', component: CadastroFontes, meta: { permissao: PERMISSOES.FONTE_VISUALIZAR } },
  { path: '/lotes', name: 'lotes', component: LotesView, meta: { permissao: PERMISSOES.LOTE_VISUALIZAR } },
  { path: '/quarentena', name: 'quarentena', component: QuarentenaView, meta: { permissao: PERMISSOES.QUARENTENA_VISUALIZAR } },
  { path: '/conjuntos', name: 'conjuntos', component: ConjuntosView, meta: { permissao: PERMISSOES.CONJUNTO_VISUALIZAR } },
  {
    path: '/conjuntos-dados/:fonteId',
    name: 'conjuntos-dados',
    component: ConjuntosDadosView,
    meta: { permissao: PERMISSOES.DADOS_VISUALIZAR },
  },
  { path: '/gold', name: 'gold', component: GoldView, meta: { permissao: PERMISSOES.INDICADOR_VISUALIZAR } },
  { path: '/auditoria', name: 'auditoria', component: AuditoriaView, meta: { permissao: PERMISSOES.AUDITORIA_VISUALIZAR } },
  { path: '/admin/usuarios', name: 'usuarios', component: UsuariosView, meta: { permissao: PERMISSOES.USUARIO_GERENCIAR } },
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
