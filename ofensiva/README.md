# Ofensiva — Tiro Tático 3D

Jogo de tiro tático em primeira pessoa no estilo dos clássicos de desarme de bomba
(Terroristas × Contra-Terroristas), que roda direto no navegador (PC e celular).
Feito com [three.js](https://threejs.org/). Mapa, texturas, modelos e sons são todos
**gerados proceduralmente**: não há arquivos de mídia.

## Como jogar

Na raiz do repositório:

```bash
npm start
```

Abra `http://localhost:8080/ofensiva/`.

## Modos

| Modo | Como funciona |
|---|---|
| **Desarme de bomba** | Os T plantam a C4 no bombsite A ou B; os CT defendem ou desarmam. Tempo de compra, rodadas de 1:55, bomba de 40 s, troca de lados no meio da partida. Partidas **MR4**, **MR8** ou **MR12** (primeiro a 5, 9 ou 13). |
| **Mata-mata** | 10 minutos, renascimento imediato, todas as armas de graça. Vence o time com mais abates. |
| **Treino livre** | Bots que andam pelo mapa sem atirar, para testar armas, recuo e granadas. |

Times de **2×2, 3×3 ou 5×5**, com bots nos níveis Fácil, Normal, Difícil e Expert.

## O que tem

- **Mapa "Poeira"**: bombsites A e B, meio com portas, curto (passarela), longo,
  túneis superiores e inferior, caixotes (que dão para pular e **atravessar com tiro**).
- **Armas**: Faca, Glock-18, USP-S, P250, Desert Eagle, MAC-10, MP9, Nova, Galil AR, FAMAS,
  AK-47, M4A4, SSG 08 e AWP (luneta de 2 níveis), granadas HE, de luz e de fumaça, C4.
- **Tiro realista**: padrão de recuo fixo por arma (dá para aprender o spray), imprecisão
  ao correr/pular, precisão ao agachar ou parar, perda de dano com a distância,
  multiplicadores por região (cabeça ×4, estômago ×1,25, pernas ×0,75), penetração do
  colete e do capacete (a AK mata com um tiro na cabeça; a M4 não, com capacete).
- **Movimento estilo Source**: aceleração, atrito, controle no ar, andar em silêncio (Shift),
  agachar, lentidão ao levar tiro.
- **Economia**: $800 iniciais, bônus de vitória/derrota acumulativo, recompensa por abate
  conforme a arma, bônus de plantio, limite de $16.000. Menu de compra (B) por categoria.
- **Bots**: tempo de reação, controle de recuo, rajadas de longe e spray de perto,
  contra-strafe, visão bloqueada por fumaça e cegueira por granada de luz, audição
  de passos e tiros, rotas variadas, execução no bombsite, pós-plantio, rotação e desarme,
  um AWPer por time e mensagens de rádio.
- **HUD**: radar giratório, feed de abates, mira dinâmica, marcador de acerto, indicador
  de direção do dano, placar (Tab), modo espectador ao morrer.

## Controles

| Tecla | Ação |
|---|---|
| WASD | Mover |
| Mouse | Mirar · botão esquerdo atira · direito: luneta / faca forte / granada por baixo |
| Espaço / Ctrl ou C / Shift | Pular / agachar / andar em silêncio |
| R · E · G · F | Recarregar · plantar/desarmar/pegar arma · largar arma · inspecionar |
| 1–5 · Q · roda | Armas · última arma · trocar |
| B · Tab · Esc | Compra · placar · pausa |

No celular: analógico à esquerda, arrastar à direita para mirar e botões de ação.

## Arquivos

```
js/main.js       inicialização, menus e laço principal
js/game.js       rodadas, economia, tiros, dano, granadas, bomba
js/bots.js       inteligência dos bots
js/map.js        mapa em grade, raycast, colisão e A*
js/physics.js    movimento e hitboxes
js/weapons.js    dados das armas e padrões de recuo
js/actor.js      estado de jogador/bot
js/player.js     controle do jogador e câmera
js/viewmodel.js  arma em primeira pessoa
js/models.js     modelos das armas e personagens
js/effects.js    traçantes, marcas, sangue, fumaça, explosões
js/hud.js        HUD, radar, menu de compra e placar
js/audio.js      sons procedurais (Web Audio)
```
