# Desafios de IA: guia para manutenção

Jogo de casos em sala de aula (FGV). Leia o README para a visão geral e a instalação.

## Estrutura

- `shared/server-core.js`: toda a regra do jogo (fases, pontuação, modelo simulado, placar, ações do professor). Roda igual no Apps Script e na demo. Não usa APIs externas: recebe `store`, `casos` e `config`.
- `shared/stats.js`: simulador binormal (AUC → matriz de confusão, valor da campanha). Usado no servidor e no navegador.
- `backend/adaptador.gs.js`: liga o núcleo ao Apps Script (PropertiesService, planilha, LockService).
- `backend/Codigo.gs`: GERADO. Nunca edite à mão.
- `site/`: páginas estáticas publicadas na Netlify. `site/casos/` é GERADO.
- `casos-fonte/<exercicio>/<caso>.json`: casos completos. Chaves começando com `_` são privadas e o build as remove do site (e falha se alguma vazar).
- `tools/build.js`: gera os arquivos acima e `demo/demo.html` (a partir de `tools/demo-shell.html`).
- `tools/teste-core.js`: partida simulada de ponta a ponta no Node.

## Comandos

```
node tools/build.js       # sempre depois de mudar casos, shared/ ou site/assets
node tools/teste-core.js  # teste rápido do núcleo
```

## Formato de um caso

Todos os casos de um exercício têm o mesmo esqueleto, para serem equivalentes entre grupos:
- 4 fases jogáveis com ids `f1`, `f2`, `f3`, `evento` (o núcleo assume esses ids para status e durações).
- Tipos de item: `escolha` (com `_gabarito` {opção: pontos}), `texto` (corrigido pelo professor), `cartas` (16 colunas: 9 feature, 3 vazamento, 2 sensível, 2 descartar), `mercado` (fontes com `_gabarito` {pontos, auc, flag}), `simulador` (com `divisaoItem`).
- Todo item tem `rotulo` (curto, usado na Ficha do Modelo e na exportação). Toda fase tem `curto` (trilha do topo).
- `_modelo` define o AUC simulado; `_evento` tem os cenários `vazamento` e `drift` com gabarito próprio; `_revelacao` alimenta a tela final.
- Pontuação máxima: 25 (f1) + 40 (f2) + 25 (f3) + 10 (evento) + bônus de desempenho (até 15), velocidade (2 por fase) e créditos (1 por 10 que sobrarem).

## Convenções

- Todo texto em português do Brasil. Nunca use travessão (em dash); use vírgula, dois-pontos ou parênteses.
- Terminologia de gerenciamento de projetos segue o PMBOK 8 (domínios de desempenho).
- Empresas e pessoas dos casos são fictícias.
- Valores vindos do servidor entram no DOM sempre por `textContent` (função `el` de `comum.js`).
- Commits: mensagens em português.
