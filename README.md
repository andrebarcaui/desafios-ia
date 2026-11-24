# Desafios de IA

Jogo de casos para aulas de IA aplicada (FGV, prof. André Barcaui). Cada grupo recebe um caso diferente, com estrutura e dificuldade equivalentes, e resolve em fases cronometradas enquanto um placar ao vivo roda no telão.

Exercício atual: **machine learning supervisionado**. Caso pronto: *A Fuga Silenciosa* (Banco Arandu, previsão de abandono de cartão).

## Como funciona

| Parte | Onde roda | O que faz |
|---|---|---|
| `site/` | Netlify (site público) | Três telas: `index.html` (grupos), `professor.html` (painel) e `telao.html` (placar no projetor) |
| `backend/Codigo.gs` | Google Apps Script, dentro de uma planilha sua | Guarda o estado do jogo, calcula pontos com o gabarito e registra as respostas na planilha |
| `casos-fonte/` | Só no repositório | Os casos completos, com gabarito. Nunca vão para o site |

O gabarito fica apenas no Apps Script. O site recebe uma versão do caso sem nenhum campo de resposta.

## Instalação (uma vez)

### 1. Servidor no Google Apps Script

1. Com sua conta Google **pessoal**, crie uma planilha nova (por exemplo, "Desafios de IA").
2. Menu **Extensões > Apps Script**. Apague o código que aparece e cole todo o conteúdo de `backend/Codigo.gs`. Salve.
3. No seletor de funções do editor, escolha `configurar` e clique em **Executar**. Autorize o acesso quando o Google pedir.
4. Volte à planilha: ela agora tem as abas **Grupos** (códigos dos 6 grupos e o caso de cada um), **Config** (chave do professor e duração das fases) e **Respostas**.
5. No editor do Apps Script: **Implantar > Nova implantação**, tipo **App da Web**. Executar como: **Eu**. Quem pode acessar: **Qualquer pessoa**. Clique em Implantar e copie a URL que termina em `/exec`.

### 2. Ligar o site ao servidor

Coloque a URL do passo anterior em `site/assets/config.js`, no campo `apiUrl`, e envie a alteração ao GitHub.

### 3. Publicar o site na Netlify

1. Em [app.netlify.com](https://app.netlify.com), entre com o GitHub e escolha **Add new site > Import an existing project**.
2. Selecione o repositório `desafios-ia`. As configurações já vêm do `netlify.toml` (pasta publicada: `site`). Clique em Deploy.
3. Endereço próprio (opcional): em **Domain management**, adicione por exemplo `desafios.barcaui.com.br` e crie no seu provedor de DNS um registro CNAME apontando para o endereço `.netlify.app` do site.

A partir daí, todo envio ao GitHub republica o site sozinho.

## Em aula

1. Antes da aula, confira a aba **Grupos**: um código por grupo e o caso de cada um. Se mudar algo, espere 1 minuto para o servidor ler de novo.
2. Projete `telao.html`. Abra `professor.html` no seu computador e entre com a chave da aba **Config**.
3. Entregue a cada grupo o seu código. Eles entram em `index.html` com o código e os nomes dos integrantes.
4. No painel, abra uma fase de cada vez. Quando você abre a fase seguinte, o que estiver marcado na anterior é enviado automaticamente.
5. No pitch, use **Projetar ficha** e **Sortear quem responde** em cada grupo.
6. Ao final, **Baixar respostas (CSV)** traz respostas, justificativas, pontos e sinais de comportamento de cada grupo. A aba **Respostas** da planilha guarda cada fase enviada.

Para jogar de novo com outra turma: menu **Desafios de IA > Reiniciar jogo** na planilha (ou o botão no painel).

Roteiro de 60 minutos: abertura 3 min, Enquadre 6, Dataset 12, Treino 8, Produção 6, pitches 15 (6 × 2 min + pergunta), revelação 7.

## Alterar ou criar casos

1. Edite ou crie um JSON em `casos-fonte/<exercicio>/`. Campos que começam com `_` são privados (gabarito, explicações, modelo, evento, revelação).
2. Rode `node tools/build.js`. Ele gera `site/casos/`, `backend/Codigo.gs` e `demo/demo.html`.
3. Rode `node tools/teste-core.js` para uma partida simulada completa.
4. Envie ao GitHub (o site se atualiza) e cole o novo `backend/Codigo.gs` no Apps Script. Depois: **Implantar > Gerenciar implantações > Editar > Versão: nova versão > Implantar**. Sem esse passo, o servidor continua com a versão antiga.

## Demonstração local

`demo/demo.html` roda o jogo inteiro no navegador, sem servidor, com cinco grupos simulados. Ela contém o gabarito: use só para testar e não distribua.
