# 🎮 Genius — IF Casa Aberta

Jogo de memória **Genius (Simon Says)** reescrito como aplicação web para
funcionar em modo **kiosk** durante o evento institucional **IF Casa Aberta**
(IFSP Itapetininga), rodando tanto em **tablet (touch)** quanto em
**notebook (teclado)**.

Reimplementação da versão original em C/SDL2 do mesmo jogo, agora em
**Vite + TypeScript**, com áudio sintetizado via Web Audio API e interface
em Tailwind CSS.

## ✨ Funcionalidades

- ✅ **Modo Solo** e **Modo Dupla** (dois jogadores no mesmo aparelho,
  alternando turnos na mesma sequência).
- ✅ **Passo a passo rápido** de como jogar, com legenda de teclas para
  quem estiver no notebook.
- ✅ Jogável por **toque** (tablet) e por **teclado** (`Q W A S` e setas
  `↑ → ← ↓`).
- ✅ **Ranking com pódio (top 3)** e lista completa, atualizado a cada
  partida e persistido no navegador.
- ✅ Áudio sintetizado em tempo real (osciladores + envelope ADSR),
  sem arquivos de som externos.
- ✅ Layout fullscreen, sem rolagem, pensado para rodar 24/7 sem
  vazamento de memória (timers e listeners sempre limpos).

## 🕹️ Como jogar

| Cor      | Tecla | Seta |
|----------|:-----:|:----:|
| Verde    | `Q`   | ↑    |
| Vermelho | `W`   | →    |
| Amarelo  | `A`   | ←    |
| Azul     | `S`   | ↓    |

No tablet, basta tocar no quadrante colorido. As instruções completas
também aparecem dentro do próprio app antes de iniciar uma partida.

### Modo Dupla

Os dois jogadores compartilham a mesma sequência crescente, alternando a
vez a cada rodada. Cada um tem vidas independentes; quando um esgota as
vidas, o outro continua sozinho até também perder. As pontuações de ambos
entram no ranking ao fim da partida.

## 🛠️ Stack

- [Vite](https://vitejs.dev/) + TypeScript (`strict: true`)
- [Tailwind CSS](https://tailwindcss.com/)
- Web Audio API nativa (sem dependências de áudio)

## 📂 Estrutura

```
genius-web/
├── src/
│   ├── types/game.ts        # Enums, tipos e constantes de domínio
│   ├── core/
│   │   ├── GameEngine.ts    # Lógica do jogo, sem DOM (solo + dupla)
│   │   ├── AudioSynth.ts    # Síntese sonora (Web Audio API)
│   │   └── RankingStore.ts  # Persistência do placar (localStorage)
│   ├── ui/
│   │   ├── App.ts               # Orquestração das telas
│   │   ├── InstructionsOverlay.ts
│   │   └── Podium.ts
│   ├── main.ts
│   └── style.css
├── tests/
│   └── smoke-test.mjs       # Testes de fluxo do engine e do ranking
├── index.html
└── ...arquivos de configuração (vite, tailwind, tsconfig)
```

## 🚀 Rodando localmente

```bash
npm install
npm run dev
```

Abra o endereço exibido pelo Vite (por padrão `http://localhost:5173`).

### Testar no tablet, na mesma rede

```bash
npm run dev -- --host
```

Descubra o IP local do notebook (`ip a` no Linux) e acesse, no tablet,
`http://<ip-do-notebook>:5173`.

### Build de produção

```bash
npm run build   # gera a pasta dist/, estática
npm run preview # serve o build de produção localmente para conferir
```

O conteúdo de `dist/` pode ser hospedado em qualquer servidor estático
(GitHub Pages, Netlify, um `npx serve dist`, etc.) para deixar o jogo
publicado durante o evento.

### Testes

```bash
npm test
```

Roda um smoke test do `GameEngine` (alternância de turnos no modo Dupla,
avanço de rodada, eliminação de jogador) e do `RankingStore`, sem precisar
de navegador.

## 📋 Sobre o ranking

O placar é salvo no `localStorage` do navegador — ou seja, é **local a
cada aparelho**. Se o jogo rodar simultaneamente no tablet e no notebook,
cada um terá seu próprio ranking, não um placar único compartilhado entre
os dois. Unificar isso exigiria um backend simples (uma API para gravar e
ler pontuações), fora do escopo desta versão.

## 📜 Licença

Distribuído sob a licença MIT — veja o arquivo [`LICENSE`](LICENSE).