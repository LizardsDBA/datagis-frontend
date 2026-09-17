import { createRouter, createWebHistory } from 'vue-router'
import CadastroFontes from '../components/CadastroFontes.vue'
import QuarentenaView from '../components/QuarentenaView.vue'
import LotesView from '../components/LotesView.vue'
import ConjuntosView from '../components/ConjuntosView.vue'

// Rotas ativas do DataGIS:
// - /fontes: Cadastro e execução de fontes
// - /lotes: Gestão de lotes, pipeline e liberação All-or-Nothing
// - /quarentena: Triagem, auditoria e resolução de inconsistências (Fase 3)
const routes = [
  { path: '/', redirect: '/fontes' },
  { path: '/fontes', name: 'fontes', component: CadastroFontes },
  { path: '/lotes', name: 'lotes', component: LotesView },
  { path: '/quarentena', name: 'quarentena', component: QuarentenaView },
  { path: '/conjuntos', name: 'conjuntos', component: ConjuntosView },
]

export default createRouter({
  history: createWebHistory(),
  routes,
})
