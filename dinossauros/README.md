# Instinto Jurássico — Sobrevivência de Dinossauros 3D

Jogo 3D de sobrevivência em que você nasce **filhote** e precisa crescer até
**adulto** num vale pré-histórico cheio de manadas e predadores. Roda direto no
navegador (PC e celular na horizontal) com [three.js](https://threejs.org/) e
WebGL 2.

**Tudo é feito do zero, em código:** os modelos dos dinossauros (esqueleto e
malha), as **animações** (nenhum clipe pronto — a pose é calculada a cada
quadro), as **texturas** (pele com escamas, terreno, vegetação, água, olhos) e
os **sons** (rugidos sintetizados). Não há nenhum arquivo de imagem, modelo ou
áudio.

## Como jogar

Na raiz do repositório:

```bash
npm start
```

Abra `http://localhost:8080/dinossauros/`.

| Ação | PC | Celular |
|---|---|---|
| Mover | WASD / setas | joystick à esquerda |
| Correr | Shift | empurrar o joystick além da borda ou botão » |
| Girar a câmera | mouse (clique para capturar) | arrastar no lado direito |
| Zoom | roda do mouse | pinça |
| Atacar | clique / Espaço / F | ⚔ |
| Comer / beber | E (ou botão direito) | 🍖 |
| Descansar | R | ☾ |
| Rugir / chamar | C | 📣 |
| Mapa | M | 🗺 |
| Pausa | Esc / P | ❚❚ |

## Espécies

| Espécie | Dieta | Destaques |
|---|---|---|
| **Tiranossauro rex** | carnívoro | mordida de 210, lento para virar, fome enorme, defende território |
| **Velociraptor** | carnívoro | o mais rápido (11,5 m/s), ágil, garra em foice causa muito sangramento, caça em bando |
| **Triceratops** | herbívoro | chifres e babado, muita vida e armadura, enfrenta predadores |
| **Estegossauro** | herbívoro | placas dorsais, golpe de cauda com espinhos (thagomizer) |
| **Parassaurolofo** | herbívoro | veloz, vive em bandos grandes, chamado de "corneta" pela crista |
| **Braquiossauro** | herbívoro (só IA) | gigante de 20 m, come copas de árvores, pisoteia quem ameaça |

## Sistema de sobrevivência

- **Vida** — regenera com fome e sede acima de 25% (3× mais rápido descansando).
- **Fome** — herbívoros comem **samambaias** (a planta encolhe ao ser comida e
  volta a crescer); carnívoros comem **carcaças** — cace ou ache animais mortos.
  Carcaças apodrecem e somem com o tempo.
- **Sede** — beba em rios e lagos quando a boca estiver na água.
- **Energia** — correr, atacar e nadar gastam; ao zerar você fica **exausto**
  até recuperar 25%.
- **Sangramento** — mordidas e garras abrem feridas que drenam vida;
  descansar estanca mais rápido.
- **Crescimento** — com fome e sede acima de 40% você cresce:
  Filhote → Juvenil → Subadulto → Adulto. Crescer aumenta tamanho, vida,
  dano e velocidade (e muda o que é presa ou ameaça).
- Fome ou sede em 0% tiram vida até a morte. Ao morrer aparece o relatório
  (tempo, estágio, tamanho, abates) e o recorde por espécie fica salvo.

## Mundo e IA

- Vale de 1 km² com colinas, rio sinuoso, quatro lagos e montanhas nas bordas.
- Ciclo de dia e noite (24 h do jogo = 20 min), sol, lua, estrelas e nuvens.
- Herbívoros andam em **manadas**, pastam, procuram água quando têm sede,
  dormem à noite, fogem de predadores — ou se defendem (Triceratops,
  Estegossauro, Braquiossauro).
- Carnívoros caçam presas mais fracas, comem carcaças, raptores se ajudam na
  caçada e o T. rex ataca carnívoros que invadem seu espaço.
- A população se renova longe do jogador.

## Como foi feito (do zero)

| Arquivo | O que faz |
|---|---|
| `js/rig.js` | monta o **esqueleto** (THREE.Bone) e a **malha com skinning** por *loft*: anéis elípticos ao longo das cadeias de ossos (tronco, cauda, pescoço, pernas) com pesos suavizados nas juntas; chifres, babado, placas, crista, dentes, garras e olhos |
| `js/anim.js` | **animação procedural**: marcha com fase por pata (bípede, quadrúpede passo/trote), **IK de 2 ossos** com pés plantados sem deslizar, ondulação da cauda com atraso, respiração, curvatura ao virar, olhar, e as ações morder, chifrar, golpe de cauda, pisotear, rugir, comer, beber, descansar, nadar, ferimento e morte |
| `js/textures.js` | **texturas em canvas**: escamas por Voronoi num toro (sem emendas) + osteodermos no dorso + listras/manchas/bandas + contra-sombreamento da barriga + **mapa de normais**; grama, terra, rocha, areia, casca, folhas com alfa, água, olhos com pupila em fenda |
| `js/world.js` | terreno, mistura de texturas por shader, água, céu com shader, vegetação instanciada com vento, comida e água |
| `js/creature.js` | física, natação, colisão, sobrevivência, ataques e carcaças |
| `js/ai.js` | IA (manadas, caça, fuga, defesa) e população |
| `js/audio.js` | rugidos e chamados sintetizados, passos, mordidas, ambiente |
| `js/player.js` | controle e câmera em terceira pessoa |
| `js/ui.js` | HUD, minimapa e mapa |
| `js/main.js` | inicialização, menus e laço principal |
