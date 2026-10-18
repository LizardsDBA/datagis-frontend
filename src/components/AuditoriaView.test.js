import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import AuditoriaView from './AuditoriaView.vue'
import { buscarLogAuditoria } from '../services/auditoriaService'

vi.mock('../services/auditoriaService', () => ({ buscarLogAuditoria: vi.fn() }))
vi.mock('../auth/autenticacao', () => ({ nomeDoPerfil: (c) => c.replace('perfil-', '') }))

const PAGINA = {
  total: 2,
  pagina: 0,
  tamanho: 50,
  itens: [
    {
      id: 2,
      dataHora: '2026-10-13T20:00:00Z',
      usuarioLogin: 'maria',
      perfis: 'perfil-analista',
      metodo: 'POST',
      rota: '/api/quarentena/lotes/45/liberar',
      acao: 'Liberar lote para a Silver',
      statusHttp: 403,
      sucesso: false,
      duracaoMs: 4,
      ipOrigem: '172.18.0.5',
    },
    {
      id: 1,
      dataHora: '2026-10-13T19:00:00Z',
      usuarioLogin: 'operador',
      perfis: 'perfil-operador',
      metodo: 'POST',
      rota: '/api/fontes/3/executar',
      acao: 'Executar ingestao da fonte',
      statusHttp: 200,
      sucesso: true,
      duracaoMs: 1520,
      ipOrigem: '172.18.0.5',
    },
  ],
}

beforeEach(() => buscarLogAuditoria.mockResolvedValue(PAGINA))
afterEach(() => vi.clearAllMocks())

describe('AuditoriaView', () => {
  it('lista quem fez o quê, com o resultado legível', async () => {
    const wrapper = mount(AuditoriaView)
    await flushPromises()

    const linhas = wrapper.findAll('tbody tr')
    expect(linhas).toHaveLength(2)
    expect(linhas[0].text()).toContain('maria')
    expect(linhas[0].text()).toContain('Liberar lote para a Silver')
    expect(linhas[0].text()).toContain('Acesso negado')
    expect(linhas[1].text()).toContain('Sucesso')
    expect(linhas[1].text()).toContain('1520 ms')
  })

  it('não tem nenhum botão de editar ou apagar registro', async () => {
    const wrapper = mount(AuditoriaView)
    await flushPromises()

    expect(wrapper.find('tbody button').exists()).toBe(false)
  })

  it('filtra enviando os campos preenchidos e volta pra primeira página', async () => {
    const wrapper = mount(AuditoriaView)
    await flushPromises()

    await wrapper.find('input[placeholder="login"]').setValue('maria')
    await wrapper.findAll('select')[1].setValue('false')
    await wrapper.find('form.filtros').trigger('submit')
    await flushPromises()

    expect(buscarLogAuditoria).toHaveBeenLastCalledWith(
      expect.objectContaining({ usuario: 'maria', sucesso: 'false' }),
      0,
      50,
    )
  })
})
