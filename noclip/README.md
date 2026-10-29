# NOCLIP — Backrooms

Jogo de terror em primeira pessoa nos Backrooms, feito do zero para o navegador
(PC e celular) com [three.js](https://threejs.org/) e WebGL 2. Inspirado no estilo
de *Backrooms: Escape Together*: quebra-cabeças de fuga, lanterna com pilha, saúde,
fôlego, entidades que perseguem e uma imagem suave e realista, com luz "assada".

Tudo é original e está neste repositório: texturas geradas por script, modelos das
criaturas esculpidos por campos de distância, animações procedurais, iluminação
pré-calculada e sons sintetizados. Nenhuma imagem ou som foi baixado de fora.

## Como jogar

Na raiz do repositório:

```bash
npm start
```

Abra `http://localhost:8080/noclip/`. O jogo usa módulos ES e *workers*, então
precisa ser servido por HTTP (abrir o arquivo direto do disco não funciona).

## Os três níveis

| Nível | Como é | Perigo | Saída |
|---|---|---|---|
| **Nível 0 — O Saguão** | Labirinto de papel de parede amarelo listrado, carpete úmido com manchas, forro de placas e luminárias fluorescentes que zumbem e piscam; salões com pilares, corredores estreitos e zonas escuras. | **O Rastejador**: humanoide magro e pálido, de quatro, cabelo preto comprido. Vaga, fareja, ouve passos (correr faz barulho, agachar é quase silencioso), persegue e ataca. | Quatro dígitos pintados em vermelho nas paredes, um em cada canto do saguão. Olhe para eles para anotar; digite o código no teclado da **porta de manutenção**. |
| **Nível 1 — Zona Habitável** | Armazém de concreto sem fim: pilares, paredes de bloco pintado, estantes metálicas com caixas, caixotes, paletes, poças d'água que refletem a lanterna e lâmpadas industriais penduradas. | **Apagões** de tempos em tempos, e no escuro aparecem os **Sorridentes**: olhos e sorriso que brilham, se aproximam devagar e somem com a luz forte da lanterna. | Ache os **3 fusíveis** (brilham em cima de caixotes), coloque-os no **quadro de força**, puxe a **alavanca** e entre no **elevador de carga** quando a porta de enrolar subir. |
| **Nível Fun =) — A Festa** | Salas amarelas ligadas por arcos rosa-salmão com batentes azuis, carpete vinho com confete, desenhos de giz de cera nas paredes, varais de lâmpadas coloridas, balões que balançam, mesas com toalha, pratos, copos, chapéus e bolo. | **Os Festeiros**: figuras altas cor de mostarda com um sorriso desenhado. Andam gingando, acenam, inclinam a cabeça quando veem você, riem e correm para "abraçar". | Abra os **presentes de fita dourada** para pegar as **3 chaves** (os outros às vezes só soltam confete, às vezes trazem itens… às vezes fazem barulho demais). Destranque os **3 cadeados** da porta **FUN EXIT**. |

Depois do Nível Fun vem o final. O progresso fica salvo e os níveis liberados
podem ser escolhidos no menu **Níveis**.

## Sobrevivência

- **Saúde** (canto inferior esquerdo): cai com os ataques e se recupera devagar depois
  de alguns segundos em paz. **Água de Amêndoa** cura na hora.
- **Lanterna** (pilha no canto superior direito): gasta enquanto estiver ligada; com
  pouca carga ela falha — **chacoalhe** (R) para ela voltar por um instante.
  **Pilhas** recarregam.
- **Fôlego**: correr gasta; sem fôlego você fica lento até recuperar.
- **Microfone** (canto inferior direito): mostra quanto barulho você está fazendo.
- **Bilhetes** contam o que aconteceu com quem passou antes (e dão dicas).

## Controles

| PC | Ação |
|---|---|
| WASD / setas | andar |
| Mouse | olhar |
| Shift | correr |
| C ou Ctrl | agachar |
| Espaço | pular |
| E ou clique | usar / pegar / ler |
| F ou botão direito | lanterna |
| R | chacoalhar a lanterna |
| Esc / P | pausa |
| H | esconder o HUD |
| G | tela cheia |

No teclado de acesso, digite os números e confirme com Enter.

**Celular** (na horizontal): joystick à esquerda (empurre até a borda para correr),
arraste do lado direito para olhar e use os botões **USAR**, **LUZ**, agachar,
pular, chacoalhar e pausa. Dá para "Adicionar à tela inicial".

## Qualidade gráfica

Menu → Configurações (ou `?q=low|medium|high|ultra` na URL). Celulares começam em
**Baixa** e PCs em **Alta**. A **resolução dinâmica** reduz a resolução quando o FPS
cai.

| | Baixa | Média | Alta | Ultra |
|---|---|---|---|---|
| Resolução (× densidade de pixels) | 1× · 80% | 1,5× | 2× | 2,5× |
| Antisserrilhado (MSAA) | — | 4× | 4× | 8× |
| Material | Lambert | PBR + mapas normais | PBR | PBR |
| Lightmap (texels/m · amostras de sombra) | 3 · 2 | 4 · 4 | 5 · 6 | 6 · 9 |
| Sombra da lanterna | — | 512 | 1024 | 2048 |
| Fios de cabelo do Rastejador | 36 | 56 | 72 | 96 |

## Como foi feito

- **Texturas** (`tools/gentex.py`, Python + numpy + Pillow): ruído de Perlin e
  celular "tileáveis", fibras de carpete, papel de parede com listras e emendas,
  placas de forro com fissuras, concreto com juntas e rachaduras, blocos pintados,
  chapa corrugada, madeira, papelão, carpete de confete, pintura com casca de laranja,
  desenhos de giz de cera, a porta "FUN EXIT", porta de metal, detalhe de pele e um
  atlas de manchas. Cada material sai com cor, mapa normal e rugosidade. Para gerar de
  novo: `python3 noclip/tools/gentex.py`.
- **Mundo em grade** de 0,5 m (`js/grid.js`): paredes, vergas de portas e arcos e o
  volume dos objetos. As paredes viram faces por "corridas" gulosas (`js/build.js`)
  com um atlas de lightmap.
- **Luz pré-calculada** (`js/bake_worker.js`, em vários *workers*): luz direta de
  painéis retangulares e lâmpadas com sombras suaves (amostragem da área e
  visibilidade 3D pela grade), luz indireta por difusão da luz que bate no piso
  (bloqueada pelas paredes), oclusão de ambiente por raios curtos, canais separados
  para lâmpadas que piscam e para os apagões, sondas de ambiente para objetos que se
  movem e luz por vértice para os móveis.
- **Pós-processamento** (`js/post.js`): HDR com MSAA, bloom em cadeia, aberração
  cromática, tone mapping fílmico, gradação por nível, vinheta, granulação, efeitos
  de dano, piscar de olhos (acordar), falhas de imagem e fade.
- **Criaturas** (`js/entities/`): corpos esculpidos com primitivas suaves (cones
  arredondados, elipsoides) unidas por *smooth-min* e poligonizadas por *surface nets*
  (`js/sdf.js`), com pesos de esqueleto automáticos. O Rastejador anda com IK de dois
  ossos (mãos e pés plantados no chão, pares diagonais), espasmos de cabeça, mandíbula
  e cabelo com física de verlet; o Festeiro ginga, balança os braços, inclina a cabeça
  e acena; o Sorridente pisca, estica o sorriso e treme sob a luz. A IA usa campos de
  fluxo (Dijkstra com custo perto das paredes), visão dependente da luz e audição.
- **Braço em primeira pessoa** (`js/viewmodel.js`): luva de borracha esculpida por
  SDF segurando a lanterna, manga de traje de proteção; balanço ao andar, corrida,
  atraso ao virar, clique, chacoalhar, pegar item, dano. O feixe da lanterna acompanha
  a mão e usa um "cookie" com anel e imperfeições do refletor.
- **Som** (`js/audio.js`): Web Audio sintetizado — zumbido das fluorescentes,
  reverberação por nível, passos em carpete/concreto/água, respiração e rosnado do
  Rastejador, sussurros dos Sorridentes, risadinhas e caixinha de música da festa,
  música de perseguição, batimentos e sustos.

## Estrutura

```
noclip/
  index.html, css/style.css, manifest.webmanifest, icon.svg
  assets/tex/          texturas geradas (jpg/png)
  tools/gentex.py      gerador das texturas
  js/main.js           fluxo do jogo (menu, carregamento, intro, jogo, morte, final)
  js/level.js          base dos níveis (montagem, bake, luzes piscando, energia)
  js/levels/           Nível 0, Nível 1 e Nível Fun
  js/entities/         Rastejador, Sorridente, Festeiro, rig/IK, navegação
  js/grid.js, build.js, layout.js, bake.js, bake_worker.js, materials.js, post.js
  js/player.js, viewmodel.js, input.js, ui.js, audio.js, props.js, textures.js, sdf.js
  js/i18n.js           textos em português e inglês (escolha em Configurações)
```
