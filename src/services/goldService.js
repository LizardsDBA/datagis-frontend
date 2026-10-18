import axios from 'axios'
import { autenticarAxios } from './http'

const api = autenticarAxios(axios.create({ baseURL: '/api' }))

function mensagemDoErro(error, fallback) {
  const data = error?.response?.data

  if (typeof data === 'string' && data.trim()) return data
  if (data?.erro) return data.erro
  if (data?.mensagem) return data.mensagem
  if (data?.message) return data.message
  if (error?.message) return error.message

  return fallback
}

export async function listarTiposIndicador() {
  try {
    const { data } = await api.get('/indicadores/tipos')
    return data
  } catch (error) {
    throw new Error(mensagemDoErro(error, 'Falha ao carregar os tipos de indicador.'))
  }
}

export async function buscarTipoIndicadorPorId(id) {
  try {
    const { data } = await api.get(`/indicadores/tipos/${id}`)
    return data
  } catch (error) {
    throw new Error(mensagemDoErro(error, `Falha ao carregar o tipo de indicador #${id}.`))
  }
}

export async function cadastrarTipoIndicador(payload) {
  try {
    const { data } = await api.post('/indicadores/tipos', payload)
    return data
  } catch (error) {
    throw new Error(mensagemDoErro(error, 'Falha ao cadastrar o tipo de indicador.'))
  }
}

export async function atualizarTipoIndicador(id, payload) {
  try {
    const { data } = await api.put(`/indicadores/tipos/${id}`, payload)
    return data
  } catch (error) {
    throw new Error(mensagemDoErro(error, `Falha ao atualizar o tipo de indicador #${id}.`))
  }
}

export async function desativarTipoIndicador(id) {
  try {
    await api.delete(`/indicadores/tipos/${id}`)
  } catch (error) {
    throw new Error(mensagemDoErro(error, `Falha ao desativar o tipo de indicador #${id}.`))
  }
}

export async function listarImoveisPublicados() {
  try {
    const { data } = await api.get('/gold/imoveis')
    return data
  } catch (error) {
    throw new Error(mensagemDoErro(error, 'Falha ao carregar os imóveis publicados.'))
  }
}

export async function buscarImovelPublicado(codImovel) {
  try {
    const { data } = await api.get(`/gold/imoveis/${encodeURIComponent(codImovel)}`)
    return data
  } catch (error) {
    throw new Error(mensagemDoErro(error, `Falha ao carregar o imóvel ${codImovel}.`))
  }
}

export async function publicarGold(loteId = null) {
  try {
    const url = loteId ? `/gold/publicar?loteId=${encodeURIComponent(loteId)}` : '/gold/publicar'
    const { data } = await api.post(url)
    return data
  } catch (error) {
    throw new Error(mensagemDoErro(error, 'Falha ao executar a publicação da camada Gold.'))
  }
}

export async function obterStatusGold() {
  try {
    const { data } = await api.get('/gold/status')
    return data
  } catch (error) {
    throw new Error(mensagemDoErro(error, 'Falha ao consultar o status da publicação Gold.'))
  }
}

export async function obterStatusIndicadores() {
  try {
    const { data } = await api.get('/gold/publicacoes-indicadores/status')
    return data
  } catch (error) {
    throw new Error(mensagemDoErro(error, 'Falha ao consultar o status dos indicadores.'))
  }
}

export async function publicarCamadaMapa(codigo) {
  try {
    await api.post(`/gold/mapa-camadas/${encodeURIComponent(codigo)}/publicar`)
  } catch (error) {
    throw new Error(mensagemDoErro(error, `Falha ao publicar a camada de mapa ${codigo}.`))
  }
}

export async function recalcularImovel(codImovel) {
  try {
    await api.post(`/gold/imoveis/${encodeURIComponent(codImovel)}/recalcular`)
  } catch (error) {
    throw new Error(mensagemDoErro(error, `Falha ao recalcular indicadores do imóvel ${codImovel}.`))
  }
}
