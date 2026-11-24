# Desafios de IA: guia para manutenção

Jogo de casos em sala de aula (FGV). Leia o README para a visão geral e a instalação.

## Estrutura

- `shared/server-core.js`: toda a regra do jogo (fases, pontuação, modelo simulado, placar, ações do professor). Roda igual no Apps Script e na demo. Não usa APIs externas: recebe `store`, `casos` e `config`.
- `shared/stats.js`: simulador binormal (AUC → matriz de confusão, valor da campanha). Usado no servidor e no navegador.
- `backend/adaptador.gs.js`: liga o núcleo ao Apps Script (PropertiesService, planilha, LockService).
- `backend/Codigo.gs`: GERADO. Nunca edite à mão.
- `site/index.html`: tela do grupo (link dos alunos). `site/professor/`: painel (com o telão como uma segunda vista na mesma aba, `telao.js`) e visão de qualquer grupo, todos com senha (o servidor exige a senha nas ações `prof_*`). `site/casos/` é GERADO.
- `site/assets/aluno.js` serve à tela do grupo e, com `DESAFIOS_ESPIAR`, à visão só leitura do professor.
- `casos-fonte/<exercicio>/<caso>.json`: casos completos. Chaves começando com `_` são privadas e o build as remove do site (e falha se alguma vazar).
- `tools/build.js`: gera os arquivos acima e `demo/demo.html` (a partir de `tools/demo-shell.html`).
- `tools/teste-core.js`: partida simulada de ponta a ponta no Node.

## Comandos

```
node tools/build.js       # sempre depois de mudar casos, shared/ ou site/assets
node tools/teste-core.js  # teste rápido do núcleo
node tools/validar-casos.js  # estrutura e pontuação de todos os casos
```

## Formato de um caso

Todos os casos de um exercício têm o mesmo esqueleto, para serem equivalentes entre grupos:
- Dois tipos de caso, definidos em `_modelo.tipo`: supervisionado (padrão) e `agrupamento`. Os dois podem ser misturados na mesma aula: a pontuação máxima é a mesma.
- 4 fases jogáveis com ids `f1`, `f2`, `f3`, `evento` (o núcleo assume esses ids para status e durações).
- Tipos de item: `escolha` (com `_gabarito` {opção: pontos} e, opcional, `entenda`), `texto` (suportado pelo motor, mas não usado: o placar deve ser objetivo), `cartas` (16 colunas: 9 da primeira caixa, 3 da segunda, 2 sensíveis, 2 descartar), `mercado` (fontes com `_gabarito` {pontos, auc, flag}), `simulador` (supervisionado, com `dependeDe` e `simulador.termos`) ou `agrupamento` (clustering, com `dependeDe`, `_gabarito` {k: pontos} e o bloco `agrupamento`).
- Supervisionado: caixas `feature`, `vazamento`, `sensivel`, `descartar`; eventos `vazamento`, `rotulo` (quando `_modelo.rotulo` diz que o alvo escolhido na fase 1 é ruim) e `drift`. Agrupamento: caixas `agrupar`, `descrever`, `sensivel`, `descartar`; eventos `escala`, `circular` e `drift`.
- Uma fase pode ter `explicacao` (passos numerados exibidos no topo). Todo caso tem `imagem` (SVG em `casos-fonte/img/`).
- Todo item tem `rotulo` (curto, usado na Ficha do Modelo e na exportação). Toda fase tem `curto` (trilha do topo).
- `_modelo` define a métrica simulada; cada cenário de `_evento` tem gabarito próprio e `feed` (mensagem do telão); `_revelacao` alimenta a tela final.
- Depois de mexer em casos: `node tools/validar-casos.js`.
- Pontuação máxima: 30 (f1) + 40 (f2) + 30 (f3) + 14 (evento) + bônus de desempenho (até 15), velocidade (2 por fase) e créditos (1 por 10 que sobrarem).
- Não há perguntas dissertativas: tudo o que conta no placar é objetivo. Cada fase termina com uma pergunta-desafio de múltipla escolha (`f1x`, `f3x`, `evx`).

## Convenções

- Todo texto em português do Brasil. Nunca use travessão (em dash); use vírgula, dois-pontos ou parênteses.
- Terminologia de gerenciamento de projetos segue o PMBOK 8 (domínios de desempenho).
- Empresas e pessoas dos casos são fictícias.
- Valores vindos do servidor entram no DOM sempre por `textContent` (função `el` de `comum.js`).
- Commits: mensagens em português.
