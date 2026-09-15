# 🎮 Genius — IF Casa Aberta

Jogo de memória **Genius (Simon Says)** reescrito como aplicação web para
funcionar em modo **kiosk** durante o evento institucional **IF Casa Aberta**
(IFSP Itapetininga), rodando tanto em **tablet (touch)** quanto em
**notebook (teclado)**.

Reimplementação da versão original em C/SDL2 do mesmo jogo, agora em
**Vite + TypeScript**, com áudio sintetizado via Web Audio API e interface
em Tailwind CSS. Este README foi escrito para servir como **modelo de
referência** — a estrutura, as decisões de arquitetura e o fluxo de deploy
aqui documentados podem ser reaproveitados em outros projetos do curso.

---

## 📑 Sumário

- [Funcionalidades](#-funcionalidades)
- [Como jogar](#️-como-jogar)
- [Stack e por que essas escolhas](#️-stack-e-por-que-essas-escolhas)
- [Arquitetura](#-arquitetura)
- [Estrutura de pastas](#-estrutura-de-pastas)
- [Pré-requisitos](#-pré-requisitos)
- [Rodando localmente](#-rodando-localmente)
- [Scripts disponíveis](#-scripts-disponíveis)
- [Testes](#-testes)
- [Publicando no GitHub Pages](#-publicando-no-github-pages)
- [Solução de problemas comuns](#-solução-de-problemas-comuns)
- [Sobre o ranking](#-sobre-o-ranking)
- [Como estender este projeto](#-como-estender-este-projeto)
- [Licença](#-licença)

---

## ✨ Funcionalidades

- ✅ **Modo Solo** e **Modo Dupla** (dois jogadores no mesmo aparelho,
  cada um com sua **própria sequência independente**, alternando turnos).
- ✅ **Passo a passo rápido** de como jogar, com legenda de teclas para
  quem estiver no notebook, exibido dentro do próprio app antes da partida.
- ✅ Jogável por **toque** (tablet) e por **teclado** (`Q W A S` e setas
  `↑ → ← ↓`).
- ✅ **Ranking com pódio (top 3)** e lista completa, atualizado a cada
  partida e persistido no navegador.
- ✅ Áudio sintetizado em tempo real (osciladores + envelope ADSR),
  sem arquivos de som externos.
- ✅ Layout fullscreen, sem rolagem, pensado para rodar 24/7 sem
  vazamento de memória (timers e listeners sempre limpos).
- ✅ Deploy automático no GitHub Pages via GitHub Actions.

## 🕹️ Como jogar

| Cor      | Tecla | Seta |
|----------|:-----:|:----:|
| Verde    | `Q`   | ↑    |
| Vermelho | `W`   | →    |
| Amarelo  | `A`   | ←    |
| Azul     | `S`   | ↓    |

No tablet, basta tocar no quadrante colorido. As instruções completas
também aparecem dentro do próprio app antes de iniciar uma partida.

### Modo Solo

Um jogador, uma sequência que cresce uma cor por rodada. Errar tira uma
vida; sem vidas, fim de jogo.

### Modo Dupla

Os dois jogadores **não compartilham a mesma sequência** — cada um tem a
sua própria, gerada de forma independente. Eles se alternam turno a turno:
o jogador da vez acrescenta um passo à *sua* sequência e a repete inteira;
depois passa a vez para o outro fazer o mesmo na dele. Cada jogador tem
vidas independentes; quando um esgota as vidas, o outro continua sozinho
(sempre na própria sequência) até também perder. As pontuações de ambos
entram no ranking ao fim da partida.

## 🛠️ Stack e por que essas escolhas

| Ferramenta | Papel | Por quê |
|---|---|---|
| [Vite](https://vitejs.dev/) | Build tool / dev server | Build rápido, HMR instantâneo, saída estática simples de hospedar |
| TypeScript (`strict: true`) | Linguagem | Pega erros de tipo em tempo de build — importante numa máquina de estados como a do jogo |
| [Tailwind CSS](https://tailwindcss.com/) | Estilo | Classes utilitárias, sem precisar escrever CSS à mão para um layout simples |
| Web Audio API nativa | Áudio | Sintetiza os sons em tempo real (osciladores), sem depender de arquivos `.mp3`/`.wav` nem de licenciamento de som |
| `localStorage` | Persistência do ranking | Não precisa de backend/servidor — o jogo continua 100% estático |

Nenhuma dessas escolhas é obrigatória para reaproveitar a estrutura deste
projeto: o padrão de organização (`types` → `core` → `ui`) funciona igual
com React, Vue ou vanilla JS puro.

## 🏗️ Arquitetura

O código é dividido em três camadas com responsabilidades bem separadas —
isso facilita testar a lógica sem precisar de navegador, e facilita trocar
a UI no futuro sem mexer nas regras do jogo:

```
┌─────────────────────────────────────────────┐
│  src/types/game.ts                           │
│  Enums, interfaces e constantes de domínio.  │
│  Não importa nada de fora — é a "verdade"    │
│  compartilhada por todas as outras camadas.  │
└─────────────────────────────────────────────┘
                     ▲
                     │ importado por
        ┌────────────┴────────────┐
        │                         │
┌───────────────────┐   ┌───────────────────────┐
│  src/core/         │   │  src/ui/               │
│  Regra de negócio. │   │  Tudo que toca DOM.    │
│  ZERO import de    │   │  Consome os eventos do │
│  DOM. Emite eventos│──▶│  GameEngine e atualiza │
│  ('state-change',  │   │  a tela; nunca decide  │
│  'sequence-step',  │   │  regra de jogo aqui.   │
│  'game-over'...).  │   │                        │
└───────────────────┘   └───────────────────────┘
```

- **`GameEngine`** é uma máquina de estados finita
  (`IDLE → PLAYING_SEQUENCE → WAITING_INPUT → GAME_OVER`) que não sabe o
  que é um `<button>` ou um clique — só recebe `submitInput(quadrante)` e
  emite eventos. Isso permite testá-la inteira em Node/jsdom, sem navegador
  real (veja [Testes](#-testes)).
- **`AudioSynth`** é um singleton: só existe um `AudioContext` na aplicação
  inteira, para não vazar recursos de áudio num kiosk rodando 24/7.
- **`RankingStore`** encapsula o `localStorage` — se um dia o ranking
  precisar virar uma API remota, só essa classe muda, nada mais.
- **`App` (ui/)** é quem instancia o `GameEngine`, escuta os eventos dele e
  atualiza o DOM. Toda entrada do usuário (clique, toque, tecla) passa por
  aqui antes de virar uma chamada a `engine.submitInput(...)`.

Todo `setTimeout`/listener registrado é feito com `AbortController` e
desfeito explicitamente (`destroy()`), porque o app roda continuamente num
tablet/notebook do laboratório — sem isso, memória e handlers se acumulam
ao longo do dia do evento.

## 📂 Estrutura de pastas

```
genius-web/
├── .github/
│   └── workflows/
│       └── deploy.yml       # Build + deploy automático no GitHub Pages
├── src/
│   ├── types/
│   │   └── game.ts          # Enums, tipos e constantes de domínio
│   ├── core/
│   │   ├── GameEngine.ts    # Lógica do jogo, sem DOM (solo + dupla)
│   │   ├── AudioSynth.ts    # Síntese sonora (Web Audio API)
│   │   └── RankingStore.ts  # Persistência do placar (localStorage)
│   ├── ui/
│   │   ├── App.ts               # Orquestração das telas
│   │   ├── InstructionsOverlay.ts
│   │   └── Podium.ts
│   ├── main.ts               # Ponto de entrada, monta a App no #app
│   └── style.css             # Diretivas do Tailwind + reset de kiosk
├── tests/
│   └── smoke-test.mjs        # Testes de fluxo do engine e do ranking
├── index.html
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
├── package.json
├── .gitignore
└── LICENSE
```

## 📋 Pré-requisitos

- [Node.js](https://nodejs.org/) 18 ou superior (recomendado: 20 LTS)
- npm (vem junto com o Node)
- Um navegador atualizado (Chrome, Firefox, Edge ou Safari recentes) —
  o jogo usa Web Audio API e `AbortController`, disponíveis em qualquer
  navegador dos últimos anos

Verifique sua versão do Node:

```bash
node -v
```

## 🚀 Rodando localmente

```bash
git clone <url-do-seu-repositorio>
cd genius-web
npm install
npm run dev
```

Abra o endereço exibido pelo Vite (por padrão `http://localhost:5173`).

### Testar no tablet, na mesma rede Wi-Fi

```bash
npm run dev -- --host
```

Isso expõe o servidor de desenvolvimento na rede local. Descubra o IP do
notebook:

```bash
# Linux
ip a
# Windows
ipconfig
# macOS
ifconfig
```

E acesse, no navegador do tablet, `http://<ip-do-notebook>:5173`
(ambos precisam estar na mesma rede Wi-Fi).

## 📜 Scripts disponíveis

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe o servidor de desenvolvimento com hot reload |
| `npm run build` | Roda o type-check (`tsc -b`) e gera o build de produção em `dist/` |
| `npm run preview` | Serve o conteúdo de `dist/` localmente, para conferir o build antes de publicar |
| `npm test` | Roda o smoke test do `GameEngine` e do `RankingStore` (sem navegador) |

## 🧪 Testes

```bash
npm test
```

Isso executa `tests/smoke-test.mjs` com [`tsx`](https://github.com/privatenumber/tsx)
(para importar `.ts` direto, sem precisar compilar antes) e
[`jsdom`](https://github.com/jsdom/jsdom) (para simular um DOM mínimo, já
que o `GameEngine` usa `window.setTimeout`/`AbortController`, mas não
precisa de um navegador de verdade).

O teste cobre:

- que o modo Dupla realmente alterna a vez entre os jogadores;
- que cada jogador cresce a **própria** sequência, de forma independente
  (não em lockstep com a do outro);
- que errar tira vida só do jogador da vez, sem afetar o outro;
- que um jogador eliminado sai da rotação e o outro continua sozinho;
- que o `RankingStore` ordena corretamente e ignora pontuação zero.

**Por que testar assim, sem Playwright/Cypress?** Porque toda a regra de
jogo mora no `GameEngine`, que não depende de DOM real — então dá para
validar toda a lógica (inclusive bugs sutis de alternância de turno) em
milissegundos, sem abrir navegador. Isso foi inclusive o que pegou um bug
real durante o desenvolvimento: uma versão inicial da alternância de turno
entrava em loop infinito devolvendo a vez para o jogador errado, e o teste
acusou isso antes de chegar no tablet.

Ao adicionar uma funcionalidade nova ao `GameEngine`, adicione um teste
correspondente em `tests/smoke-test.mjs` seguindo o mesmo padrão (crie um
`GameEngine` com timings bem curtos, dispare a ação, `await` um tempinho,
e `assert` o snapshot resultante).

## 🌐 Publicando no GitHub Pages

O projeto já vem com um workflow pronto em
`.github/workflows/deploy.yml` que builda e publica automaticamente a cada
push na branch `main`, usando o método oficial do GitHub (Actions +
`actions/deploy-pages`, sem branch `gh-pages` manual).

### Configuração (uma vez só, por repositório)

1. No GitHub, vá em **Settings → Pages**.
2. Em **"Build and deployment" → Source**, selecione **"GitHub Actions"**
   (não "Deploy from a branch").
3. Dê push para `main` (ou rode manualmente em **Actions → Deploy no
   GitHub Pages → Run workflow**).
4. Em cerca de 1 minuto, o site estará em
   `https://<seu-usuário>.github.io/<nome-do-repositório>/`.

### Por que `base: './'` no `vite.config.ts`

O GitHub Pages de projeto publica o site num subcaminho
(`usuario.github.io/repo/`, não na raiz do domínio). Se o Vite gerar os
`<script>`/`<link>` do `index.html` com caminho absoluto (`/assets/...`),
eles vão apontar para a raiz do domínio (`usuario.github.io/assets/...`,
que não existe) em vez do subcaminho correto. `base: './'` faz o Vite
gerar caminhos **relativos** (`./assets/...`), que funcionam em qualquer
subcaminho — inclusive num domínio próprio, se um dia o projeto migrar
para um. Isso já está configurado em `vite.config.ts`; se copiar este
projeto como modelo para outro, lembre de manter essa linha.

### Publicando manualmente (alternativa, sem Actions)

Se preferir não usar o workflow:

```bash
npm run build
npx gh-pages -d dist
```

(`npx gh-pages` publica o conteúdo de `dist/` numa branch `gh-pages`; nesse
caso, em Settings → Pages, a Source deve ser "Deploy from a branch" e a
branch `gh-pages`.)

## 🔧 Solução de problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| Tela branca no GitHub Pages | Build antigo publicado, ou `base` errado no `vite.config.ts` | Confirme que `base: './'` está no arquivo, dê `git push` de novo, e recarregue com hard refresh (`Ctrl+Shift+R`) para ignorar cache |
| Console mostra `main.ts:1 404` | O navegador está tentando carregar o **`index.html` fonte** (pré-build), não o `dist/` | Confira o "Source" em Settings → Pages: deve ser "GitHub Actions", não "Deploy from a branch" apontando para a branch errada |
| Erro `HttpError: Not Found` no job `build` do Actions | O GitHub Pages ainda não foi habilitado nas configurações do repositório | Settings → Pages → Source → "GitHub Actions" (precisa ser feito manualmente uma vez, o workflow sozinho não habilita) |
| `npm test` diz `Missing script: "test"` | O `package.json` local está desatualizado em relação ao restante do projeto | Confirme que o `package.json` tem a chave `"test": "tsx tests/smoke-test.mjs"` em `scripts` e as devDependencies `tsx`/`jsdom` |
| Sem som no tablet/celular | Política de autoplay do navegador: áudio só é liberado após interação do usuário | Normal — o app já trata isso (`AudioSynth.unlock()` é chamado no primeiro toque/clique); basta interagir uma vez com a tela |
| `npm run build` falha com erro de tipo do TypeScript | Alguma alteração no código quebrou o `strict: true` | Rode `npx tsc -b --noEmit` para ver o erro isolado do build do Vite, e corrija o tipo antes de buildar |

## 🏆 Sobre o ranking

O placar é salvo no `localStorage` do navegador — ou seja, é **local a
cada aparelho**. Se o jogo rodar simultaneamente no tablet e no notebook,
cada um terá seu próprio ranking, não um placar único compartilhado entre
os dois. Unificar isso exigiria um backend simples (uma API para gravar e
ler pontuações), fora do escopo desta versão. Se isso vier a ser
necessário para um evento futuro, o ponto de extensão certo é a classe
`RankingStore` — trocar sua implementação interna (hoje `localStorage`)
por chamadas `fetch` para uma API mantém toda a UI e o `GameEngine`
intactos.

## 🔁 Como estender este projeto

Ideias de como reaproveitar esta base em outro trabalho do curso:

- **Novo jogo, mesma arquitetura:** troque só o conteúdo de
  `src/types/game.ts` e `src/core/GameEngine.ts` — se a UI (`src/ui/`)
  consumir apenas eventos e um `getSnapshot()`, ela nem precisa mudar
  muito para um jogo diferente com a mesma forma (sequência, turnos,
  vidas).
- **Adicionar um 3º jogador:** o `GameEngine` já usa `players: []` (array,
  não campos fixos "player1"/"player2"); a alternância de turno precisaria
  generalizar de "o outro jogador" para "o próximo jogador vivo na fila",
  mas a estrutura de dados já comporta.
- **Ranking compartilhado entre aparelhos:** troque o `RankingStore` para
  falar com uma API (mesmo que seja um Google Sheets via Apps Script, ou
  um backend simples em Node/Express).
- **Novo tema visual:** as cores e o Tailwind estão isolados em
  `src/ui/App.ts`, `Podium.ts` e `InstructionsOverlay.ts` — dá para trocar
  a paleta sem tocar em `core/`.

## 📜 Licença

Distribuído sob a licença MIT — veja o arquivo [`LICENSE`](LICENSE).