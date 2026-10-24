import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from './http'
import {
  CAMADA_IMOVEL,
  buscarContornoParana,
  buscarFeicoesQueCruzam,
  buscarGeometriaDaSelecao,
  contarFeicoes,
  geometriaDaSelecao,
  identificarNoPonto,
} from './geoserverService'

vi.mock('./http', () => ({ apiFetch: vi.fn() }))

function resposta(corpo, { status = 200 } = {}) {
  return { ok: status >= 200 && status < 300, status, text: async () => corpo }
}

/** Parâmetros da última chamada ao proxy. */
function parametrosChamados() {
  const url = apiFetch.mock.calls.at(-1)[0]
  const [caminho, consulta] = url.split('?')
  return { caminho, params: new URLSearchParams(consulta) }
}

beforeEach(() => {
  apiFetch.mockReset()
})

describe('geoserverService', () => {
  it('passa pelo proxy do backend, nunca direto no GeoServer', async () => {
    apiFetch.mockResolvedValue(resposta('<wfs:FeatureCollection numberMatched="4611"/>'))

    const total = await contarFeicoes(CAMADA_IMOVEL)

    expect(total).toBe(4611)
    const { caminho, params } = parametrosChamados()
    expect(caminho).toBe('/api/indicadores/geoserver/wfs')
    expect(params.get('REQUEST')).toBe('GetFeature')
    expect(params.get('TYPENAMES')).toBe('datagis:vw_mapa_imovel')
    expect(params.get('RESULTTYPE')).toBe('hits')
  })

  it('busca o contorno do Paraná na camada da Gold', async () => {
    apiFetch.mockResolvedValue(resposta('{"type":"FeatureCollection","features":[]}'))

    await buscarContornoParana()

    expect(parametrosChamados().params.get('TYPENAMES')).toBe('datagis:vw_mapa_limite_pr')
    expect(parametrosChamados().params.get('OUTPUTFORMAT')).toBe('application/json')
  })

  it('monta o querySingle com as aspas do código escapadas duas vezes', () => {
    const cql = geometriaDaSelecao({ tipo: 'municipio', codigo: '4119905' })

    expect(cql).toBe("querySingle('datagis:vw_mapa_municipio','GEOMETRIA','COD_NATURAL=''4119905''')")
  })

  it('código com aspa não quebra o filtro', () => {
    const cql = geometriaDaSelecao({ tipo: 'imovel', codigo: "PR-1'X" })

    expect(cql).toContain("'COD_NATURAL=''PR-1''''X'''")
  })

  it('consulta as feições que cruzam a seleção com INTERSECTS', async () => {
    apiFetch.mockResolvedValue(resposta('{"type":"FeatureCollection","features":[{"properties":{}}]}'))

    const geo = await buscarFeicoesQueCruzam('datagis:vw_mapa_embargo', { tipo: 'imovel', codigo: 'PR-1' })

    expect(geo.features).toHaveLength(1)
    const { params } = parametrosChamados()
    expect(params.get('TYPENAMES')).toBe('datagis:vw_mapa_embargo')
    expect(params.get('CQL_FILTER')).toBe(
      "INTERSECTS(GEOMETRIA, querySingle('datagis:vw_mapa_imovel','GEOMETRIA','COD_NATURAL=''PR-1'''))",
    )
  })

  it('busca a geometria da seleção pelo código', async () => {
    apiFetch.mockResolvedValue(resposta('{"type":"FeatureCollection","features":[]}'))

    await buscarGeometriaDaSelecao({ tipo: 'imovel', codigo: 'PR-9' })

    expect(parametrosChamados().params.get('CQL_FILTER')).toBe("COD_NATURAL='PR-9'")
  })

  it('identifica o item sob o ponto clicado (lon lat)', async () => {
    apiFetch.mockResolvedValue(resposta('{"features":[{"properties":{"COD_NATURAL":"4106902","ROTULO":"Curitiba"}}]}'))

    const item = await identificarNoPonto('datagis:vw_mapa_municipio', -49.27, -25.43)

    expect(item).toEqual({ codigo: '4106902', rotulo: 'Curitiba' })
    expect(parametrosChamados().params.get('PROPERTYNAME')).toBe('COD_NATURAL,ROTULO')
    // SRID explícito: sem ele o GeoServer lê o EPSG:4674 como lat/lon e o clique não acha nada.
    expect(parametrosChamados().params.get('CQL_FILTER')).toBe('INTERSECTS(GEOMETRIA, SRID=4326;POINT(-49.27 -25.43))')
  })

  it('ponto fora de qualquer feição devolve null', async () => {
    apiFetch.mockResolvedValue(resposta('{"features":[]}'))

    expect(await identificarNoPonto(CAMADA_IMOVEL, -40, -10)).toBeNull()
  })

  it('erro do proxy chega com a mensagem do backend', async () => {
    apiFetch.mockResolvedValue(resposta('{"erro":"Camada nao permitida: datagis:outra"}', { status: 400 }))

    await expect(contarFeicoes('datagis:outra')).rejects.toThrow('Camada nao permitida: datagis:outra')
  })

  it('erro do GeoServer com HTTP 200 também vira exceção', async () => {
    apiFetch.mockResolvedValue(resposta(
      '<ows:ExceptionReport><ows:Exception><ows:ExceptionText>Feature type unknown</ows:ExceptionText></ows:Exception></ows:ExceptionReport>',
    ))

    await expect(contarFeicoes(CAMADA_IMOVEL)).rejects.toThrow('Feature type unknown')
  })
})
