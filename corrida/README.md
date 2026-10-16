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
(0, 3, 5 ou 7), a dificuldade e a **qualidade gráfica**. Você larga em último no grid; o semáforo acende as
cinco luzes vermelhas e a corrida começa quando elas se apagam.

## Qualidade gráfica

| Nível | O que muda |
|---|---|
| **Baixo** | resolução reduzida, sem sombras, menos árvores e partículas, neblina mais perto |
| **Médio** | sombras 1024, mais árvores, grama 3D esparsa (padrão no celular) |
| **Alta** | sombras suaves 2048, floresta densa, grama 3D (padrão no PC) |
| **Ultra** | sombras 4096, resolução máxima, ainda mais árvores e grama, **reflexos em tempo real** na pintura e nos cromados |

Dá para trocar no menu ou durante a corrida (pausa → Gráficos).

## Física

Cada carro é um corpo rígido 3D (posição, velocidade, orientação e velocidade angular,
com tensor de inércia) simulado a 120 Hz:

- **Suspensão independente** nas 4 rodas (raycast contra o relevo): mola, amortecedor,
  batente e barras estabilizadoras — o carro inclina nas curvas, afunda ao frear e
  empina ao acelerar.
- **Direção sensível à velocidade**: em alta, as rodas esterçam só o que a
  aderência permite (como num carro real), então o carro não sai de traseira com
  o teclado.
- **Pneus** com ângulo de deriva e curva de força lateral tipo Pacejka, **círculo de
  atrito** (frear ou acelerar em curva reduz a aderência lateral), resistência ao
  rolamento e aderência diferente no asfalto, na zebra (que vibra) e na grama.
- **Motor** com curva de torque, limitador de giro e **câmbio automático** de 6
  marchas + ré; tração traseira, ABS, controle de tração (desliga com **T**) e
  controle de estabilidade, que compara a guinada real com a esperada pela direção
  e corrige como um ESC de verdade (fica desligado enquanto você puxa o freio de mão,
  para dar para derrapar de propósito).
- **Aerodinâmica**: arrasto e downforce que crescem com o quadrado da velocidade.
- **Colisões** com impulso e atrito: contra os muros, entre carros (com giro) e da
  carroceria com o chão (capotamento — o carro é recolocado na pista).

## Danos

Batidas no muro, em outros carros e capotamentos **amassam a lataria** no ponto do
impacto (e riscam a pintura). Peças acumulam dano e **se soltam**: para-choque com
grade e splitter, faróis, lanternas, retrovisores, saias laterais, asa/aerofólio,
difusor, placa, tomada de ar do capô e antena. Elas caem com física, quicam, ficam na
pista e são chutadas por quem passa por cima. Há faíscas nas batidas, o motor perde
potência (até 25%), a direção pode "puxar" e, com muito dano, o capô solta fumaça. O
indicador ao lado do velocímetro mostra o dano de cada região do carro.

## Carros

Quatro modelos com dirigibilidade diferente, em 8 cores:

- **Falcão GT**: GT de corrida com para-lamas acima do capô, aberturas no capô e
  nos para-lamas, canards, splitter e difusor de carbono, asa com endplates, gaiola
  de proteção e rodas de porca central.
- **Raio S**: superesportivo de motor central, cabine avançada, entradas de ar
  laterais grandes, venezianas sobre o motor, barra de LED traseira e rodas em Y.
- **Bisão V8**: muscle car de capô longo e teto "notchback", grade de largura total
  com quatro faróis redondos, para-choques cromados, tomada de ar no capô e rodas
  "slot".
- **Eagle SS**: fastback V8 preparado, inspirado no Mustang, com o ressalto do capô
  na própria lataria, grade "nariz de tubarão", três presas de LED, lanternas de três
  barras, antena barbatana e asa baixa.

A carroceria é gerada por seções transversais com forma de carro de verdade
(assoalho plano, lateral quase vertical, ombro arredondado, capô e tampa com
abaulamento, para-lamas que podem ficar acima do capô) e as caixas de roda são
recortadas na lataria com lábio alargado e caixa interna preta. A cabine tem
para-brisa e vidro traseiro que abraçam as colunas, borracha nos vidros, serigrafia
preta nas bordas, forro do teto e lado de dentro das portas (dá para olhar de dentro
na câmera de cockpit). Faróis, lanternas, grades e aberturas são posicionados e
orientados pela própria superfície. Pintura com verniz, faixas, juntas de portas,
capô e tampa, número e patrocinadores. Interior com bancos concha, painel com
instrumentos, volante que gira e piloto. As rodas têm pneu com banda de rodagem e
letras na lateral, aro com degrau e lábio, cinco desenhos de raios, disco de freio
perfurado e pinça de seis pistões; giram, esterçam e acompanham a suspensão.

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
  js/damage.js       amassados, peças que se soltam e detritos
  js/effects.js      marcas de pneu, fumaça, poeira e faíscas
  js/audio.js        sons procedurais (Web Audio)
  js/input.js        teclado, gamepad e toque
  js/environment.js  céu, luzes e reflexos
  js/textures.js     texturas geradas em canvas
```
