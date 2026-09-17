# feat<LIZARDS-9>: adiciona tela de conjuntos e cobertura territorial

Destino: branch de desenvolvimento do frontend → `sprint-1`.
Branch local no momento da preparação: `feat/tela-de-upload-e-dados`.

Adiciona uma tela para cadastrar e consultar conjuntos por fonte, competência e
status, com apresentação de cobertura territorial no mapa. Atende à tarefa
**LIZARDS-9** e depende da API de conjuntos da **LIZARDS-8**.

## Implementação

- Tela `ConjuntosView`, navegação no menu e rota no Vue Router.
- Formulário com validação de fonte/competência e conversão de mês para o primeiro
  dia do mês exigido pela API; cobertura territorial enviada como `null`.
- Listagem com status, feedback de carregamento/cadastro e destaque no mapa Leaflet.
- Serviço HTTP para fontes/conjuntos e proxy Vite para `/conjuntos`.
- Exibição do campo `erro` retornado pelo backend, preservando a mensagem específica
  em casos como fonte inexistente.
- Vitest, Vue Test Utils e jsdom, com comandos `npm test` e `npm run test:watch`.

## Validação local — 2026-09-16

- `npm test`: 17 testes aprovados em 2 arquivos.
- `npm run build`: build de produção concluído.
- `git diff --check`: sem erros.
- O teste da mensagem no campo `erro` falhou antes da correção e passou depois dela.

## Impactos e pontos de atenção

- O lockfile inclui as novas dependências de desenvolvimento; instalar com `npm ci`.
- Os testes simulam HTTP e Leaflet. Não validam tiles reais nem a serialização
  de geometria JTS proveniente do Oracle. O cenário de mapa usa uma fixture GeoJSON.
- A falha HTTP 400 do backend foi corrigida localmente: os 4 testes Oracle passaram,
  incluindo listagem de polígono real em GeoJSON. A tela agora preserva também
  GeometryCollection, coberta por um novo teste de componente.
- A visualização final em navegador com tiles reais ainda requer verificação manual.
- O proxy local cobre `/conjuntos` e `/api`; o ambiente de publicação precisa
  encaminhar essas rotas ao backend.
- Instruções de execução e limites estão em `docs/testes-conjuntos.md`.

Antes de publicar: revisar o código, validar a integração pendente e conferir
se a base está atualizada com a sprint remota. Esta descrição deve acompanhar a correção quando enviada ao GitHub.
