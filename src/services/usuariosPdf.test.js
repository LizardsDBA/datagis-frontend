import { describe, expect, it } from 'vitest'
import { gerarPdfUsuarios } from './usuariosPdf'

describe('usuariosPdf', () => {
  it('gera um PDF em paisagem com a tabela de usuários', async () => {
    const usuarios = Array.from({ length: 60 }, (_, i) => ({
      login: `usuario${i}`,
      nome: 'João',
      sobrenome: 'Ação',
      email: `u${i}@x.com`,
      ativo: i % 2 === 0,
      perfis: ['perfil-analista'],
      permissoesAvulsas: [],
      permissoesEfetivas: ['fonte:visualizar', 'dados:visualizar'],
      criadoEm: '2026-10-17T11:27:50',
    }))

    const doc = await gerarPdfUsuarios(usuarios, (c) => c.replace('perfil-', ''))

    const largura = doc.internal.pageSize.getWidth()
    const altura = doc.internal.pageSize.getHeight()
    expect(largura).toBeGreaterThan(altura)
    // 60 linhas não cabem numa página: a tabela continua na seguinte
    expect(doc.getNumberOfPages()).toBeGreaterThan(1)
    expect(doc.output()).toContain('%PDF')
  })
})
