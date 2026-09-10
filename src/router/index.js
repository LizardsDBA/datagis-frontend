import { createRouter, createWebHistory } from 'vue-router'
import CadastroFontes from '../components/CadastroFontes.vue'

// So uma rota de verdade por enquanto (§ decisao da equipe: mostrar so o que ja
// existe no menu, nao itens "em breve"). Novas paginas (Painel, Catalogo, Execucoes...)
// entram aqui conforme forem construidas.
const routes = [
  { path: '/', redirect: '/fontes' },
  { path: '/fontes', name: 'fontes', component: CadastroFontes },
]

export default createRouter({
  history: createWebHistory(),
  routes,
})
