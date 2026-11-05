/**
 * Pesquisa de telas e botões da barra lateral.
 *
 * Procura no catálogo (catalogoTelas.js) sem acento e sem diferenciar maiúscula, só entre o
 * que o usuário tem permissão de ver. Ao escolher um botão, a tela abre e o botão encontrado
 * pisca por alguns segundos (destacarNaTela).
 */
import { temPermissao } from '../auth/autenticacao'
import { TELAS } from './catalogoTelas'

export const MAXIMO_RESULTADOS = 8

export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Telas que o usuário pode abrir, com só os botões que ele pode ver. */
export function telasPermitidas() {
  return TELAS.filter((tela) => temPermissao(tela.permissao)).map((tela) => ({
    ...tela,
    botoes: tela.botoes.filter((botao) => temPermissao(botao.permissao)),
  }))
}

/**
 * Resultados da pesquisa: telas primeiro (pelo título ou descrição), depois botões (pelo
 * rótulo). Cada palavra digitada precisa aparecer em algum lugar do texto.
 */
export function pesquisar(termo) {
  const palavras = normalizar(termo).split(' ').filter(Boolean)
  if (!palavras.length) return []
  const contem = (texto) => {
    const alvo = normalizar(texto)
    return palavras.every((p) => alvo.includes(p))
  }

  const telas = []
  const botoes = []
  for (const tela of telasPermitidas()) {
    if (contem(`${tela.titulo} ${tela.descricao}`)) {
      telas.push({ tipo: 'tela', rota: tela.rota, titulo: tela.titulo, detalhe: tela.descricao, icone: tela.icone, cor: tela.cor })
    }
    for (const botao of tela.botoes) {
      if (contem(botao.rotulo)) {
        botoes.push({
          tipo: 'botao',
          rota: tela.rota,
          titulo: botao.rotulo,
          detalhe: tela.titulo,
          botao: botao.rotulo,
          icone: tela.icone,
          cor: tela.cor,
        })
      }
    }
  }
  return [...telas, ...botoes].slice(0, MAXIMO_RESULTADOS)
}

const SELETOR_CLICAVEL = 'button, a, [role="button"], [role="tab"]'

/** Botão visível da tela cujo texto, aria-label ou title bate com o rótulo do catálogo. */
export function acharNaTela(rotulo, raiz = document) {
  const alvo = normalizar(rotulo)
  for (const elemento of raiz.querySelectorAll(SELETOR_CLICAVEL)) {
    if (elemento.closest('.barra-lateral')) continue
    const textos = [elemento.textContent, elemento.getAttribute('aria-label'), elemento.getAttribute('title')]
    if (textos.some((t) => t && normalizar(t).includes(alvo))) return elemento
  }
  return null
}

/**
 * Espera o botão aparecer (a tela pode ainda estar carregando dados), rola até ele e o
 * destaca. Devolve true se achou. Botão que só aparece em linha de tabela vazia, ou que
 * a tela esconde naquele estado, simplesmente não é destacado.
 */
export function destacarNaTela(rotulo, { tentativas = 20, intervaloMs = 150, duracaoMs = 2500 } = {}) {
  return new Promise((resolver) => {
    let restantes = tentativas
    const tentar = () => {
      const elemento = acharNaTela(rotulo)
      if (elemento) {
        elemento.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
        elemento.classList.add('destaque-pesquisa')
        setTimeout(() => elemento.classList.remove('destaque-pesquisa'), duracaoMs)
        resolver(true)
        return
      }
      restantes -= 1
      if (restantes <= 0) {
        resolver(false)
        return
      }
      setTimeout(tentar, intervaloMs)
    }
    tentar()
  })
}
