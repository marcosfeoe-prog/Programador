# Planície — Caçador de Tornados (pasta `planicie/`)

Jogo 3D no navegador (PC e celular) em que você caça tornados numa **planície enorme**
das Grandes Planícies: talhões de trigo, pasto, terra arada e lavouras em fileiras,
estradas de cascalho a cada milha, cercas, linhas de energia, quebra-ventos de árvores
e sítios com casa, celeiro e silos. Tudo é procedural — não há arquivos de imagem ou som.

Com o servidor rodando na raiz do repositório (`npm start`), abra
`http://localhost:8080/planicie/`.

## O tornado

- Renderizado com **ray marching volumétrico** em meia resolução e composto sobre a
  cena com upsampling que respeita a profundidade.
- **Funil de condensação** com bordas esfiapadas e estrias helicoidais girando
  (ruído Perlin-Worley 3D advectado em duas fases misturadas, para o giro nunca
  "esticar" a textura), iluminação suave pelo lado do horizonte claro e espalhamento
  frontal nas bordas finas.
- **Nuvem de poeira e detritos** na base, **subvórtices** nos multivórtices,
  **nuvem parede** rebaixada girando sob a base da supercélula e **cortinas de chuva**
  (núcleo de precipitação e tornados envoltos pela chuva).
- Formatos: **corda, cone, cilindro, cunha e multivórtice**; aparências **cinza,
  branco, envolto em poeira, cinza escuro e envolto pela chuva**.
- Ciclo de vida: nuvem parede → funil descendo (às vezes recua sem tocar o solo) →
  tornado → estágio de corda (afina, inclina e serpenteia) → dissipação.
- Campo de vento de **vórtice de Rankine modificado** com afluxo, corrente ascendente
  e translação. Ele curva a grama, arranca fardos, cercas, postes, árvores e
  construções (que viram destroços com física) e raspa o solo, deixando a cicatriz
  da trajetória no chão.

## Jogabilidade

- **Fotografe** (F ou clique) o tornado: mais perto e bem enquadrado vale mais pontos.
- **Sondas** (P): coloque no caminho do tornado; se o núcleo passar por cima, ela
  mede a rajada e rende muitos pontos. Recarregam ao entrar na picape.
- **Picape** (E) para cruzar a planície — mais rápida no cascalho; câmera em 3ª pessoa
  ou cabine (C). Ventos fortes empurram e até arremessam o veículo.
- Vento acima de ~150 km/h fere; dentro do núcleo você é arremessado.
- Ao fim de cada tornado aparece o **levantamento de danos** (classificação EF,
  vento máximo, trajetória, largura, objetos destruídos).
- Minimapa estilo radar (M muda o zoom), bússola com a direção do tornado, alertas.

## Controles

| Tecla | Ação |
|---|---|
| WASD / setas | andar / dirigir |
| Mouse | olhar |
| Shift | correr |
| Espaço | pular / freio |
| E | entrar/sair da picape |
| F ou clique | fotografar |
| P | posicionar sonda |
| C | câmera da picape |
| M | zoom do mapa |
| T | forçar tornadogênese |
| H | esconder HUD |
| Esc | pausa / menu |

No celular: joystick à esquerda, arraste à direita para olhar e botões na tela.

## Opções

No menu: **qualidade** (Baixa, Média, Alta, Ultra — resolução e passos do volume,
quantidade de grama, MSAA), **céu** (fim de tarde, pôr do sol, tempestade escura,
céu esverdeado), **formato**, **aparência** e **duração** do tornado. Também pela URL:
`?q=alta&clima=porDoSol&formato=cunha&aparencia=escuro&duracao=5`.

## Código

```
planicie/index.html, css/style.css
js/main.js       laço do jogo, fotos, sondas, relâmpagos, menus
js/atmo.js       uniforms globais, presets de céu, neblina e GLSL compartilhado
js/sky.js        céu e base da supercélula (nuvens com ray marching)
js/ground.js     chão procedural (talhões, estradas) e cicatriz do tornado
js/grass.js      grama instanciada que segue a câmera e curva com o vento
js/volume.js     tornado volumétrico, poeira, nuvem parede, chuva e composição final
js/tornado.js    supercélula, ciclo de vida, formatos e campo de vento
js/props.js      postes, cercas, fardos, árvores, sítios e física de destroços
js/particles.js  detritos girando e chuva perto da câmera
js/player.js     jogador a pé e picape
js/hud.js        HUD, bússola e minimapa
js/input.js      teclado, mouse e toque
js/audio.js      áudio procedural
```

A textura de ruído 3D é gerada na GPU pelo mesmo módulo do simulador principal
(`js/render/noise3d.js`), e o three.js vem de `vendor/three/`.
