# Caçada Jurássica — caça de dinossauros em mundo aberto (pasta `cacada/`)

Jogo 3D em primeira pessoa feito do zero com [three.js](https://threejs.org/) (WebGL 2).
Roda no navegador, no PC e no celular. Os três dinossauros são os modelos **STL** enviados
(`assets/models/`): o jogo lê os arquivos, monta um esqueleto para cada um e anima tudo com
animação procedural. Terreno, árvores, armas, texturas e sons são gerados por código.

## Como jogar

Na raiz do repositório:

```bash
npm start              # servidor em http://localhost:8080
```

Abra `http://localhost:8080/cacada/`. (Abrir o `index.html` direto do disco não funciona:
os módulos e os arquivos STL precisam de HTTP.)

### Objetivo

Você chega ao acampamento de caçadores no meio de uma ilha cercada de montanhas. Cumpra os
**contratos**:

1. Abater 3 **Raptores Esmeralda**
2. Abater um **Tiranossauro Rex**
3. Abater o **Rex Sombrio Espinhoso** no Vale das Sombras, ao norte
4. Coletar 3 **troféus** (aperte **E** perto de um dinossauro abatido)

Cada abate dá pontos (tiro na cabeça vale 1,5×) e o recorde fica salvo no navegador. Se um
dinossauro te pegar, você volta ao acampamento e perde 10% dos pontos.

### Controles (PC)

| Tecla | Ação | Tecla | Ação |
|---|---|---|---|
| WASD | andar | Mouse | olhar |
| Shift | correr (gasta fôlego) / prender a respiração na luneta | Espaço | pular |
| C ou Ctrl | agachar (mais silencioso e difícil de ver) | Botão esquerdo | atirar |
| Botão direito | mirar | R | recarregar |
| 1 2 3 4 | rifle, espingarda, fuzil, besta | Q / roda | trocar de arma |
| B | binóculo 6× (marca dinossauros no mapa) | E | interagir / coletar troféu |
| F | lanterna | M | mapa |
| H | esconder o HUD | Esc | pausa |

**Celular:** joystick à esquerda (empurre além da borda para correr), arraste à direita para
olhar, botão vermelho para atirar (arraste nele para mirar enquanto atira), botões para mira,
recarga, pulo, agachar, binóculo, lanterna e mapa. Toque nas armas do HUD para trocar. A
qualidade "Baixa" é escolhida sozinha em celulares.

## O mundo

- Mapa de **4 km × 4 km** (16 km²) gerado por ruído com semente fixa, em blocos de 256 m com
  quatro níveis de detalhe e um anel de montanhas que continua até o horizonte.
- **Planícies do Leste** (campos abertos, território do T-Rex), **Floresta do Oeste** (mata
  fechada, território dos raptores), **Serra do Norte** com picos nevados e o **Vale das
  Sombras**, onde o Rex Sombrio dorme durante o dia.
- Quatro lagos e um **rio** que serpenteia pela ilha, com água que reflete o céu, espuma na
  margem e cor pela profundidade.
- Pinheiros, árvores de copa, **samambaias gigantes**, moitas, arbustos e rochas
  (dezenas de milhares, desenhados com instancing e três níveis de detalhe), grama e flores
  na GPU que se afastam do jogador, trilhas de terra entre o acampamento e as torres.
- **Ciclo de dia e noite** (um dia dura 20 min): céu com nuvens, pôr do sol, estrelas e lua.
  À noite é preciso a lanterna.
- **Acampamento** com barracas (dá para dormir 6 h), fogueira, jipe e caixa de munição; cinco
  **torres de observação** com escada e munição.

## Os dinossauros

| Espécie | Arquivo | Comportamento |
|---|---|---|
| Raptor Esmeralda | `raptor-esmeralda.stl` | Matilhas de 3–4. Espreitam, abrem em leque, flanqueiam, saltam com as garras e circulam entre os ataques. Fogem quando muito feridos. |
| Tiranossauro Rex | `tiranossauro-rex.stl` | Territorial nas planícies. Ruge antes de atacar, corre a 32 km/h mas gira devagar e não consegue entrar na mata fechada (fica rondando a borda). |
| Rex Sombrio Espinhoso | `rex-sombrio.stl` | Chefe. Dorme no vale de dia; à noite caça o jogador de longe. Olhos que brilham no escuro, 2800 de vida. |

A IA usa **visão** (cone de visão, alcance menor à noite, agachado ou dentro da mata, linha de
visada pelo relevo), **audição** (passos e principalmente tiros — a besta é quase
silenciosa) e reage a ferimentos. Os tiros acertam esferas presas aos ossos: cabeça 2,6×,
pescoço 1,5×, peito 1,25×, pernas 0,7×, cauda 0,45×. Os ferimentos aparecem na pele, o
dinossauro ferido deixa **rastro de sangue** no chão e o virote da besta faz sangrar.

### Dos arquivos STL para dinossauros animados

Os STL são só triângulos, sem esqueleto, sem cor e sem animação. Tudo isso é feito em código,
ao carregar o jogo (`js/dino/`):

1. **`stl.js`** lê o STL (binário ou ASCII), solda os vértices repetidos e converte os eixos.
2. **`species.js`** tem as juntas de cada espécie (quadril, joelho, tornozelo, coluna, pescoço,
   mandíbula, cauda, braços), medidas nas vistas de lado, de cima e em cortes de cada modelo.
3. **`rig.js`** cria 28 ossos e calcula os **pesos de skinning** de cada vértice: osso mais
   próximo (as pernas não "pegam" a barriga nem o outro lado do corpo), divisão suave nas
   juntas e suavização pela superfície da malha. A cabeça é cortada na linha da boca para a
   **mandíbula** abrir; os olhos são encontrados na superfície. Também remove "pontes" de
   malha entre as pernas que o gerador do modelo deixou.
4. **`anim.js`** anima tudo proceduralmente: passada com **cinemática inversa** (os pés
   ficam presos no chão durante o apoio, acompanham o relevo e fazem um arco no balanço), a
   cadência e o comprimento do passo seguem o número de Froude como nos animais de verdade,
   quadril que balança e desce, cauda com molas, pescoço que olha para o alvo e estabiliza a
   cabeça, respiração, **rugido**, **mordida**, **salto** do raptor, reação a tiros e **morte**
   (cai de lado). Os modelos foram esculpidos no meio de um passo; a animação usa uma pose
   neutra igual para as duas pernas, então a passada sai simétrica.
5. **`material.js`** pinta a pele no shader: costas escuras e barriga clara, listras,
   manchas, relevo de escamas, olhos, interior da boca e dentes que aparecem quando a mandíbula
   abre, e as manchas de sangue dos ferimentos.

O **Bestiário** (menu) mostra cada espécie com todas as animações.

## As armas

Modelos 3D montados peça por peça (`js/player/gunmodels.js`), com mãos, recuo, cápsulas
ejetadas, clarão e animações das peças:

| Arma | Detalhes |
|---|---|
| **Rifle .375 de Ferrolho** | Luneta 4× com retícula, ferrolho que gira e volta a cada tiro, recarga cartucho por cartucho, prender a respiração (Shift) |
| **Espingarda Calibre 12** | 9 bagos por tiro, telha de bombeamento animada, dano cai com a distância |
| **Fuzil de Assalto 7,62** | Automático, 30 tiros, mira holográfica com ponto vermelho, traçantes, troca de carregador animada |
| **Besta de Caça** | Silenciosa, virote visível que faz arco, crava no chão, nas árvores e no dinossauro (acompanha o osso), faz sangrar |

Os disparos são projéteis com velocidade e gravidade (a bala cai a longa distância) testados
contra os dinossauros, troncos, rochas, terreno e água.

## Qualidade gráfica

Baixa, Média, Alta e Ultra (menu → Configurações, ou `?quality=low|medium|high|ultra` na URL):
mudam resolução, sombras, distância e densidade das árvores e da grama, relevo das escamas e
os níveis de detalhe do terreno. A resolução se ajusta sozinha para manter o FPS.

## Estrutura

```
cacada/
  index.html, css/style.css, manifest.webmanifest, icon.svg
  assets/models/        os três arquivos STL enviados
  js/main.js            laço do jogo, menus, contratos, interações, renderização
  js/config.js          configurações e recordes (localStorage)
  js/input.js           teclado, mouse e toque
  js/audio.js           sons procedurais (Web Audio)
  js/fx.js              partículas, sangue no chão, traçantes, virotes cravados
  js/ballistics.js      projéteis e colisões
  js/dinos.js           IA, população, dano, sangramento
  js/dino/              STL → rig → animação → material
  js/player/            jogador, armas e modelos das armas
  js/world/             relevo, terreno com LOD, céu, água, vegetação, grama, construções
  js/ui/                HUD, minimapa/mapa, bestiário
  dev/rig.html          visualizador de rig/animação (?sp=raptor&mode=walk&bones=1)
  dev/world.html        visualizador do mundo (?x=..&z=..&yaw=..&h=hora)
```
