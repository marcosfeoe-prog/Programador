# Corrida 3D

Jogo de corrida 3D que roda direto no navegador (PC e celular), feito com
[three.js](https://threejs.org/). Tudo é procedural: carros, pista, texturas e sons —
não há arquivos de mídia externos.

Com o servidor do repositório rodando (`npm start`), abra
`http://localhost:8080/corrida/`.

## Como jogar

| Ação | Teclado | Controle (gamepad) | Toque |
|---|---|---|---|
| Acelerar | ↑ / W | RT / A | ACELERAR |
| Frear / ré (segure parado) | ↓ / S | LT / X | FREIO |
| Direção | ← → / A D | analógico esquerdo | ◀ ▶ |
| Freio de mão (derrapar) | Espaço | B | FREIO DE MÃO |
| Trocar câmera | C | | 🎥 |
| Recolocar na pista | R | | ↺ |
| Controle de tração/estabilidade | T | | menu de pausa |
| Som liga/desliga | M | | menu de pausa |
| Pausa | P / Esc | | ❚❚ |

No menu escolha o carro, a cor, o número de voltas (1, 3 ou 5), de adversários
(0, 3, 5 ou 7) e a dificuldade. Você larga em último no grid; o semáforo acende as
cinco luzes vermelhas e a corrida começa quando elas se apagam.

## Física

Cada carro é um corpo rígido 3D (posição, velocidade, orientação e velocidade angular,
com tensor de inércia) simulado a 120 Hz:

- **Suspensão independente** nas 4 rodas (raycast contra o relevo): mola, amortecedor,
  batente e barras estabilizadoras — o carro inclina nas curvas, afunda ao frear e
  empina ao acelerar.
- **Pneus** com ângulo de deriva e curva de força lateral tipo Pacejka, **círculo de
  atrito** (frear ou acelerar em curva reduz a aderência lateral), resistência ao
  rolamento e aderência diferente no asfalto, na zebra (que vibra) e na grama.
- **Motor** com curva de torque, limitador de giro e **câmbio automático** de 6
  marchas + ré; tração traseira, ABS, controle de tração e de estabilidade
  (desligáveis com **T**, aí o carro patina e sai de traseira).
- **Aerodinâmica**: arrasto e downforce que crescem com o quadrado da velocidade.
- **Colisões** com impulso e atrito: contra os muros, entre carros (com giro) e da
  carroceria com o chão (capotamento — o carro é recolocado na pista).

## Carros

Três modelos com dirigibilidade diferente — **Falcão GT** (com asa), **Raio S**
(motor central) e **Bisão V8** (muscle car) — em 8 cores. A carroceria é gerada por
seções superelípticas com caixas de roda recortadas e tem pintura com verniz,
faixas, número e patrocínios, cabine com vidros e colunas, faróis com projetores e
luz diurna, lanternas que acendem ao frear, luz de ré, grade colmeia, splitter,
difusor, escapamentos, retrovisores, limpadores, maçanetas, tampa de combustível,
placa, interior com bancos, painel, volante que gira e piloto de capacete. As rodas
têm pneu com banda de rodagem e letras na lateral, aro de raios duplos, porcas,
disco de freio e pinça colorida; giram, esterçam e acompanham a suspensão.

## Pista

Circuito de 2,2 km com relevo, zebras nas curvas, muros com patrocinadores,
pórtico de largada com semáforo, arquibancadas com público, boxes, torre, árvores e
montanhas. Marcas de pneu ficam no asfalto, há fumaça nas derrapagens e poeira na
grama. Os adversários seguem o traçado ideal, calculam a frenagem para as curvas à
frente, desviam de carros mais lentos e se recuperam quando batem.

## Estrutura

```
corrida/
  index.html, css/style.css, icon.svg
  js/main.js         laço do jogo, corrida, câmeras e HUD
  js/vehicle.js      física do carro
  js/carModel.js     modelos 3D procedurais dos carros
  js/track.js        pista, relevo e cenário
  js/ai.js           pilotos do computador
  js/effects.js      marcas de pneu, fumaça e poeira
  js/audio.js        sons procedurais (Web Audio)
  js/input.js        teclado, gamepad e toque
  js/environment.js  céu, luzes e reflexos
  js/textures.js     texturas geradas em canvas
```
