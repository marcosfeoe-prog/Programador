# Hordas.io — Defesa de base contra zumbis (2D)

Jogo 2D de sobrevivência e *tower defense* no navegador, inspirado no gênero de Zombs.io.
Feito do zero com Canvas 2D, sem dependências. Toda a arte (construções, árvores, rochas,
personagens, zumbis, ícones) é **vetorial e procedural**, desenhada em código no estilo
"plano com contorno escuro". Nenhuma imagem ou som do jogo original foi copiado.

## Como jogar

Abra `zombs/index.html` direto no navegador ou sirva a pasta raiz (`npm start`) e acesse
`http://localhost:8080/zombs/`.

1. Bata em **árvores** e **rochas** com a picareta para conseguir madeira e pedra.
2. Coloque o **Cofre de Ouro** (tecla 1). Ele é a sua base e marca a área de construção.
   Se ele for destruído, o jogo acaba.
3. Construa paredes, portas, armadilhas, torres, minas de ouro e coletores.
4. Toda **noite** vem uma onda de zumbis, cada vez mais fortes (8 cores/níveis). A cada
   8 ondas aparece um **chefão**. De dia o sol queima os zumbis restantes e as construções se reparam.
5. Use o ouro para **melhorar** tudo até o nível VIII (as construções não passam do nível
   do Cofre) e para comprar armas, escudo e poções na **Loja**.

| Tecla | Ação |
|---|---|
| WASD / setas | mover |
| Mouse / clique / Espaço | mirar e atacar (segure) |
| 1–0 | Parede, Porta, Armadilha Lenta, Torre de Flechas, Canhão, Soco, Bombas, Mágica, Mina de Ouro, Coletor |
| Clique numa construção | painel com status, **E** melhorar, **T** vender, "melhorar todas" |
| B | loja (armas: picareta, lança, arco, bomba · escudo · poção) |
| Q / F / R / M | trocar arma / poção / ataque automático / som |
| Esc / botão direito | cancelar |

No celular: o lado esquerdo da tela é um joystick, e tocar e segurar à direita mira e ataca.
Toques rápidos constroem ou selecionam.

## Arquivos

- `js/data.js`: tabelas de balanceamento (construções, níveis, zumbis, armas)
- `js/art.js`: toda a arte procedural
- `js/game.js`: simulação (mundo, zumbis, torres, projéteis, ciclo dia/noite, loja)
- `js/render.js`: câmera, camadas, iluminação noturna e minimapa
- `js/input.js`, `js/ui.js`, `js/audio.js`, `js/main.js`: controles, HUD, sons sintetizados, laço principal
