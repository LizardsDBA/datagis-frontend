/**
 * Consulta dos dados finais em tabela (LIZARDS-34).
 *
 * Service separado do goldService de propósito: o goldService cuida do CADASTRO de tipos
 * de indicador e dos imóveis publicados; estas duas chamadas são a LEITURA agregada que
 * alimenta a tela de consulta. Manter separado também reduz conflito de merge, já que a
 * tela de mapa (LIZARDS-35) vai consumir o mesmo endpoint de municípios.
 */
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

/** Uma linha por município, com os 7 indicadores em média ponderada pela área. */
export async function listarIndicadoresPorMunicipio() {
    try {
        const { data } = await api.get('/indicadores/municipios')
        return data
    } catch (error) {
        throw new Error(mensagemDoErro(error, 'Falha ao carregar os indicadores por município.'))
    }
}

/** Uma linha por imóvel publicado, com o código CAR completo e o nome do município. */
export async function listarIndicadoresPorImovel() {
    try {
        const { data } = await api.get('/indicadores/imoveis')
        return data
    } catch (error) {
        throw new Error(mensagemDoErro(error, 'Falha ao carregar os indicadores por imóvel.'))
    }
}