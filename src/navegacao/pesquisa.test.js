import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { acharNaTela, destacarNaTela, MAXIMO_RESULTADOS, normalizar, pesquisar, telasPermitidas } from './pesquisa'
import { TELAS } from './catalogoTelas'
import { PERMISSOES } from '../auth/permissoes'

const permissoes = vi.hoisted(() => ({ lista: [] }))
vi.mock('../auth/autenticacao', () => ({
  temPermissao: (p) => !p || permissoes.lista.includes(p),
}))

beforeEach(() => {
  permissoes.lista = Object.values(PERMISSOES)
  document.body.innerHTML = ''
})
afterEach(() => vi.useRealTimers())

describe('pesquisa de telas e botões', () => {
  it('ignora acento, maiúscula e espaço sobrando', () => {
    expect(normalizar('  Migração   PARA Gold ')).toBe('migracao para gold')
  })

  it('acha tela pelo título sem acento', () => {
    const resultados = pesquisar('quarentena')
    expect(resultados[0]).toMatchObject({ tipo: 'tela', rota: '/quarentena', titulo: 'Quarentena e Qualidade' })
  })

  it('acha botão e diz em que tela ele está', () => {
    const resultados = pesquisar('migrar gold')
    expect(resultados).toContainEqual(
      expect.objectContaining({ tipo: 'botao', rota: '/lotes', botao: 'Migrar para Gold', detalhe: 'Lotes e Pipeline' }),
    )
  })

  it('cada palavra precisa aparecer, em qualquer ordem', () => {
    expect(pesquisar('gold migrar').some((r) => r.botao === 'Migrar para Gold')).toBe(true)
    expect(pesquisar('gold xyz')).toEqual([])
  })

  it('telas aparecem antes dos botões', () => {
    const tipos = pesquisar('indicadores').map((r) => r.tipo)
    expect(tipos).toContain('tela')
    expect(tipos).toEqual([...tipos].sort((x, y) => (x === y ? 0 : x === 'tela' ? -1 : 1)))
  })

  it('termo vazio não devolve nada', () => {
    expect(pesquisar('   ')).toEqual([])
  })

  it('limita a quantidade de resultados', () => {
    expect(pesquisar('a').length).toBeLessThanOrEqual(MAXIMO_RESULTADOS)
  })

  it('não mostra tela nem botão sem permissão', () => {
    permissoes.lista = [PERMISSOES.LOTE_VISUALIZAR]
    expect(pesquisar('migrar gold')).toEqual([])
    expect(pesquisar('liberar')).toEqual([])
    expect(pesquisar('fontes')).toEqual([])
    expect(pesquisar('lotes')).toContainEqual(expect.objectContaining({ tipo: 'tela', rota: '/lotes' }))
  })

  it('telasPermitidas tira os botões sem permissão', () => {
    permissoes.lista = [PERMISSOES.FONTE_VISUALIZAR]
    const fontes = telasPermitidas().find((t) => t.rota === '/fontes')
    expect(fontes.botoes.map((b) => b.rotulo)).toEqual(['Mapeamento de colunas'])
  })

  it('toda tela do catálogo existe no router', () => {
    const router = readFileSync(resolve(__dirname, '../router/index.js'), 'utf8')
    for (const tela of TELAS) {
      expect(router, tela.rota).toContain(`path: '${tela.rota}'`)
    }
  })
})

describe('destaque do botão na tela', () => {
  it('acha pelo texto, pelo aria-label ou pelo title', () => {
    document.body.innerHTML = `
      <button>Migrar para Gold</button>
      <button aria-label="Executar ingestão">▶</button>
      <a title="Ver conjunto de dados">ícone</a>`
    expect(acharNaTela('migrar para gold').textContent).toBe('Migrar para Gold')
    expect(acharNaTela('Executar ingestão').getAttribute('aria-label')).toBe('Executar ingestão')
    expect(acharNaTela('Ver conjunto de dados').tagName).toBe('A')
  })

  it('não destaca o próprio resultado da barra lateral', () => {
    document.body.innerHTML = `<aside class="barra-lateral"><button>Migrar para Gold</button></aside>`
    expect(acharNaTela('Migrar para Gold')).toBeNull()
  })

  it('espera o botão aparecer, destaca e depois tira o destaque', async () => {
    vi.useFakeTimers()
    const promessa = destacarNaTela('Liberar para Silver', { tentativas: 5, intervaloMs: 100, duracaoMs: 1000 })
    setTimeout(() => {
      document.body.innerHTML = '<button>Liberar para Silver</button>'
    }, 150)
    await vi.advanceTimersByTimeAsync(300)
    await expect(promessa).resolves.toBe(true)
    const botao = document.querySelector('button')
    expect(botao.classList.contains('destaque-pesquisa')).toBe(true)
    await vi.advanceTimersByTimeAsync(1000)
    expect(botao.classList.contains('destaque-pesquisa')).toBe(false)
  })

  it('desiste sem erro quando o botão não aparece', async () => {
    vi.useFakeTimers()
    const promessa = destacarNaTela('Botão que não existe', { tentativas: 3, intervaloMs: 50 })
    await vi.advanceTimersByTimeAsync(200)
    await expect(promessa).resolves.toBe(false)
  })
})
