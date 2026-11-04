# Chutebol — Futebol de Discos

Futebol com física visto de cima, no estilo dos jogos de navegador com discos: cada
jogador é um círculo, a bola quica nas linhas, nas traves e na rede, e o chute
só sai quando a bola encosta em você enquanto você segura o botão.

Com o servidor rodando na raiz do repositório (`npm start`), abra
`http://localhost:8080/futebol/`. Funciona no PC e no celular. Não usa bibliotecas
nem arquivos de mídia: tudo é desenhado em canvas 2D e os sons são gerados na hora.

## Controles

| Modo | Andar | Chutar |
|---|---|---|
| 1 jogador | setas ou WASD | `Espaço` ou `X` |
| 2 jogadores, J1 | WASD | `Espaço` |
| 2 jogadores, J2 | setas | `Enter`, `L` ou `Num 0` |
| Celular | joystick (esquerda) | botão CHUTE (direita) |

`Esc` ou `P` pausa. Enquanto o chute está seguro, o contorno do jogador fica branco
e ele anda um pouco mais devagar. Para chutar de novo é preciso soltar e apertar outra vez.

## Regras e opções

- Times **Vermelho** e **Azul**, de **1×1 a 4×4**, completados por **bots** (Fácil, Normal, Difícil).
- Modos: 1 jogador + bots, 2 jogadores no mesmo teclado (um contra o outro ou no mesmo time).
- **Saída de bola**: o time que sai pode entrar no círculo central. O outro time fica
  no próprio campo e fora do círculo até a bola ser tocada. O cronômetro só corre com a bola em jogo.
- Limite de **tempo** (2, 3, 5, 10 min ou sem limite) e de **gols** (3, 5, 7 ou sem limite).
  Empate no fim do tempo leva à **prorrogação com gol de ouro**.
- Quatro mapas: Pequeno, Clássico, Grande e **Hock**, um rinque de hóquei no gelo. No Hock
  os cantos são arredondados, os gols ficam dentro do rinque (dá para passar por trás deles),
  a bola vira um disco menor e o gelo escorrega: todos deslizam mais e o disco quase não perde velocidade.
- **Zoom** de 1.5x (padrão), 1.75x, 2.00x, 2.25x ou 2.5x, escolhido no menu ou trocado durante
  o jogo com as teclas `1` a `5`. A câmera segue a bola quando o campo não cabe na tela.
- O placar mostra quem marcou, a assistência e os gols contra.

## Física (passo fixo de 60 Hz)

| | Raio | Massa inversa | Amortecimento | Quique |
|---|---|---|---|---|
| Jogador | 15 | 0,5 | 0,96 | 0,5 |
| Bola | 10 | 1 | 0,99 | 0,5 |

Aceleração 0,1 (0,07 segurando o chute), força do chute 5, alcance do chute 4.
As linhas do campo só seguram a bola. As redes (curvas) e as traves seguram todos.
Os jogadores podem sair um pouco do campo, até uma margem externa.

Código: `js/game.js` (física, bots, desenho, entrada e áudio).
