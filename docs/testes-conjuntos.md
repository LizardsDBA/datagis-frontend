# Testes de conjuntos — LIZARDS-9

Na raiz do frontend, instale as dependências com `npm ci` e execute:

```sh
npm test
npm run build
```

Para desenvolver com reexecução automática: `npm run test:watch`.

São 17 testes usando Vitest, Vue Test Utils e jsdom:

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

Após a correção da API, os 4 testes de integração Oracle passaram: a listagem de
polígono real retorna HTTP 200 e GeoJSON. A tela preserva objetos GeoJSON completos,
incluindo GeometryCollection com seu campo geometries (novo teste de componente).
A visualização em navegador com tiles reais ainda não foi exercitada nesta rodada.
