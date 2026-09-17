# Testes de conjuntos — LIZARDS-9

Na raiz do frontend, instale as dependências com `npm ci` e execute:

```sh
npm test
npm run build
```

Para desenvolver com reexecução automática: `npm run test:watch`.

São 16 testes usando Vitest, Vue Test Utils e jsdom:

- Serviço HTTP: rotas de fontes/conjuntos, envio de JSON, retorno do cadastro,
  mensagens de erro (`erro`, `mensagem`, `message`), erro sem JSON e falha de rede.
- Tela: carregamento e estado vazio, campos obrigatórios, conversão de mês para
  primeiro dia do mês, status escolhido, atualização da lista e limpeza do formulário,
  bloqueio durante envio, recuperação após falha, nova tentativa de carregamento,
  cobertura GeoJSON, destaque e liberação do mapa.

O Leaflet e o serviço HTTP são simulados nos testes da tela; `fetch` é simulado nos
testes do serviço. Nenhum teste acessa Oracle, backend ou servidores de tiles.
O teste de mapa usa um objeto GeoJSON de exemplo: ele não comprova o formato
efetivamente serializado pelo backend a partir de uma Geometry JTS.

A API atual usa `/conjuntos` e `/api/fontes`, com proxy Vite para ambas as rotas.
O formulário envia `coberturaTerritorial: null`. A integração com uma geometria
real do Oracle precisa ser validada separadamente.

Na integração do backend com Oracle local em 2026-09-16, a V032 e a persistência
espacial foram verificadas, mas `GET /conjuntos` com geometria real retornou HTTP 400
(`Operation does not support GeometryCollection arguments`). Portanto, os 16 testes
do frontend aprovados não significam que o mapa já funcione com dados reais da API.
