# Blocos — Mundo de Blocos 3D

Jogo de mundo aberto em blocos no estilo **Minecraft**, feito do zero para rodar no
navegador (PC e celular). Usa [three.js](https://threejs.org/) (WebGL 2) só para desenhar;
todo o resto foi escrito do zero: geração de terreno, iluminação, física, malhas, modelos,
animações, texturas em pixel art, sons e música. **Não há nenhum arquivo de imagem ou
áudio**: tudo é gerado por código.

## Como jogar

O jogo usa módulos ES, então precisa ser servido por HTTP. Na raiz do repositório:

```bash
npm start              # servidor sem dependências em http://localhost:8080
# ou
python3 -m http.server 8080
```

Abra `http://localhost:8080/blocos/`, clique em **Um jogador → Criar novo mundo** e escolha
**Sobrevivência** ou **Criativo**. Os mundos ficam salvos no navegador (localStorage).

### Câmeras: primeira e terceira pessoa

Aperte **F5** (ou **V**, ou o botão 👁 no celular) para alternar entre:

1. **Primeira pessoa**: mão/braço e item na mão animados (balanço ao andar, golpe,
   troca de item, comer);
2. **Terceira pessoa por trás**: o personagem inteiro com animação de andar, correr,
   agachar, golpear e segurar itens;
3. **Terceira pessoa de frente**: a câmera olha para o rosto do personagem.

Nas câmeras de terceira pessoa a câmera se aproxima quando há um bloco no caminho.

### Gráficos: Baixo, Médio, Alto, ULTRA e MAX

Em **Opções → Gráficos** escolha o nível (o celular começa no Baixo):

| Nível | O que muda |
|---|---|
| **Baixo** | Menos pixels na tela, folhas opacas, sem nuvens e menos partículas. Para celulares e computadores fracos. |
| **Médio** | O visual clássico, com nuvens em blocos. |
| **Alto** | **Sombras do sol** de verdade (árvores, casas, criaturas e o próprio jogador fazem sombra), **água com reflexo do céu, ondas e brilho do sol**, grama, flores, plantações e folhas **balançando ao vento**, **folhas caindo** das árvores, brilho (*bloom*) e correção de cor. |
| **ULTRA** | Tudo do Alto e mais: **texturas realistas em alta resolução** (64×64, 4× mais detalhes) geradas por código, com **relevo** (*normal map*) e **brilho especular** (minérios, metais, gelo, obsidiana, chão molhado na chuva); grama alta com folhas finas; luz do sol calculada pixel a pixel; **sombras suaves**; **céu realista com nuvens volumétricas** iluminadas pelo sol e halo solar; **raios de sol** (*god rays*); e **animações realistas**: personagens com **joelhos e cotovelos articulados**, passos com o corpo subindo e descendo, ombros girando, respiração e agachamento dobrando os joelhos; animais com passo mais pesado. |

| **MAX** | O ápice. Tudo do ULTRA e mais: **texturas 128×128** (8× mais detalhes) com **relevo 3D de verdade** (*parallax occlusion*: pedras, tijolos e cascalho saltam do bloco e fazem sombra em si mesmos); **céu com atmosfera física** (espalhamento de Rayleigh e Mie: azul profundo no alto, horizonte claro, pôr do sol alaranjado), **nuvens volumétricas em 3D** que se movem com o vento, iluminadas pelo sol por dentro e projetando **sombra no chão**; **sol com escurecimento de borda**, **lua com fases e crateras**, estrelas que cintilam e Via Láctea; **água com reflexo do mundo** (árvores, montanhas e céu refletidos), **refração**, cor que escurece com a profundidade, **espuma na beira** e **cáusticas** no fundo; **sombras suaves com penumbra variável** (nítidas perto do objeto, borradas longe); **oclusão de ambiente** (SSAO); **neblina atmosférica** que funde o horizonte no céu; luz do céu azulada nas sombras e tochas tremulando; reflexos de lente; adaptação do olho ao escurecer; e **animais realistas**: pelo, lã e penas em alta resolução, iluminados pelo sol e recebendo sombras, patas com **joelho e jarrete**, **orelhas** que se mexem, **caudas** espantando moscas, respiração, vacas pastando e galinhas bicando o chão com o balanço de cabeça típico. À noite aparecem **vaga-lumes** sobre a grama. |

O ULTRA exige uma boa placa de vídeo e o MAX uma placa potente (de jogos). As texturas realistas levam menos de um segundo para serem geradas na primeira vez.

### Controles (PC)

| Tecla | Ação |
|---|---|
| W A S D | andar |
| Espaço | pular (no criativo, 2× rápido para voar; segure para subir) |
| Shift | agachar (não cai da beirada) / descer voando |
| Ctrl ou W 2× | correr |
| Botão esquerdo | quebrar bloco (segure) / atacar |
| Botão direito | colocar bloco / usar bancada, fornalha, baú, porta, cama, TNT / comer (segure) / puxar o arco (segure e solte) / arar com a enxada / plantar / usar balde |
| Botão do meio | escolher o bloco mirado (criativo) |
| 1–9 ou roda | barra rápida |
| E | inventário |
| Q / Ctrl+Q | soltar item / soltar a pilha |
| F5 ou V | primeira / terceira pessoa |
| F3 | informações de depuração |
| F1 | esconder a interface |
| T ou / | chat e comandos |
| Esc | pausar |

No inventário: clique esquerdo pega/coloca a pilha, clique direito divide ao meio ou coloca
um de cada vez, Shift+clique move a pilha rapidamente e as teclas 1–9 trocam com a barra rápida.

### Controles (celular)

Joystick à esquerda para andar (empurre até o fim para correr), arraste na tela para olhar,
**toque** para colocar blocos/usar, **segure** para quebrar/atacar. Botões para pular,
agachar, inventário, câmera, soltar item e pausar.

### Comandos

`/gamemode creative|survival`, `/time set day|noon|night|midnight|<ticks>`,
`/weather clear|rain|thunder`, `/tp x y z` (aceita `~`), `/give <item> [qtd]`,
`/spawn porco|ovelha|vaca|galinha|zumbi|esqueleto|aranha|creeper`, `/seed`, `/spawnpoint`,
`/kill`, `/help`.

## O que tem no jogo

### Mundo
- Mundo infinito gerado em **chunks** de 16×16×128 a partir de uma **semente**.
- Relevo com continentes, oceanos, praias, planícies, colinas e montanhas com neve.
- Biomas: **planície, floresta, floresta de bétulas, deserto, tundra nevada, montanhas,
  praia, oceano e oceano congelado**, com cor da grama e das folhas variando por bioma.
- **Cavernas** (túneis "espaguete" e grandes salões), **lagos de lava** no fundo, rocha-mãe.
- **Minérios** por profundidade: carvão, ferro, ouro e diamante.
- Árvores de **carvalho, bétula e pinheiro**, cactos, cana-de-açúcar, grama alta,
  flores, arbustos mortos e abóboras.
- 72 blocos, incluindo vidro, tijolos, lã colorida, estante, TNT, pedra luminosa,
  bancada, fornalha, baú, blocos de metal, **porta**, **cama**, **escada de mão**, **cerca**,
  **lajes** (pedra, pedregulho e madeira; duas lajes viram um bloco), **camada de neve**,
  **cogumelos**, **fardo de feno** e tijolos de pedra musgosos e rachados.
- **Masmorras** escondidas no subsolo: salas de pedregulho musgoso com **baús de tesouro**.
- **Clima**: chuva, **neve** nos biomas frios (a neve se acumula no chão e a água congela),
  **tempestades com raios** e trovões. Dá para dormir durante tempestades.

### Visual
- **Iluminação por propagação** (luz do céu e luz de blocos, 16 níveis, como no original),
  com **iluminação suave** e **oclusão de ambiente** nos cantos.
- **Ciclo de dia e noite** de 20 minutos: nascer e pôr do sol alaranjados, sol, lua,
  estrelas e escuridão de verdade à noite (tochas são necessárias).
- **Nuvens em blocos** que se movem, neblina na distância, visão debaixo d'água.
- Água translúcida e lava **animadas**, com altura variando conforme o fluxo.
- Texturas 16×16 em pixel art com mipmaps, rachaduras ao quebrar, contorno do bloco mirado.
- Partículas: fragmentos de blocos, fumaça e chamas das tochas, explosões, bolhas e respingos.

### Física e simulação (20 ticks por segundo)
- Movimento fiel ao original: aceleração e atrito, pulo, corrida (com pulo longo),
  agachar sem cair da beirada, nado, voo no criativo, dano de queda.
- **Água e lava fluem** (água infinita com duas fontes; água + lava = pedra/obsidiana).
- **Areia e cascalho caem**, plantas e tochas soltam se perderem o apoio.
- Grama se espalha pela terra, mudas viram árvores, cana e cacto crescem.
- **TNT** explode em cadeia e destrói o terreno.
- **Agricultura**: are a terra com a **enxada**, plante **sementes** (caem da grama alta), o
  **trigo** cresce em 8 estágios (mais rápido com água por perto ou chuva); farinha de osso
  acelera plantações, faz mudas virarem árvores e espalha flores. Pular na plantação estraga.
- **Baldes** de água e de lava, **portas** que abrem e fecham, **escadas de mão** para subir,
  **camas** para dormir à noite (pula para a manhã e vira o ponto de nascimento).
- **Arco e flecha**: segure para puxar (a visão aproxima), solte para atirar; flechas
  caem com a gravidade, ficam cravadas nos blocos e podem ser recolhidas.

### Sobrevivência
- **Vida, fome, saturação e ar**, regeneração com a barra de fome cheia, afogamento,
  dano de lava, cacto, queda e explosões; tela "Você morreu!" com renascimento.
- Tempo de quebra que depende da dureza do bloco e da ferramenta; picareta necessária
  para pedra e minérios (diamante exige picareta de ferro).
- **Ferramentas** (picareta, machado, pá, espada e **enxada**) de madeira, pedra, ferro,
  ouro e diamante, com durabilidade, e **arco** com flechas.
- **Criação** 2×2 no inventário e 3×3 na bancada (tábuas, gravetos, tochas, ferramentas,
  fornalha, baú, blocos de metal...), **fornalha** que funde minério e assa carne com
  combustível, **baú** com 27 espaços.
- Comida: maçã, carnes cruas e assadas, pão, carne podre (segure o botão direito para comer).

### Criaturas (modelos e animações feitos do zero)
- **Porco, ovelha e vaca**: passeiam, olham para você, fogem quando atacados; a ovelha
  come grama. Soltam carne e lã.
- **Galinha**: cacareja, bate as asas e cai devagar, bota ovos. Solta penas e frango.
- **Zumbi**: aparece no escuro e à noite, persegue e ataca, queima ao sol.
- **Esqueleto**: mantém distância, mira e **atira flechas**; queima ao sol. Solta ossos e flechas.
- **Aranha**: escala paredes, dá botes; de dia só ataca se for provocada. Solta linha.
- **Creeper**: se aproxima, incha piscando e explode. Solta pólvora.
- Animações de andar, cabeça seguindo o olhar, golpe, dano (vermelho) e morte.

### Interface
- Tela de título com logotipo em blocos e panorama do mundo girando, lista de mundos,
  criação de mundo com semente, opções (campo de visão, sensibilidade, distância de
  renderização, brilho, sons, música, nuvens, balanço da visão, tamanho da interface).
- HUD com barra rápida, corações, fome e bolhas de ar; nome do item ao trocar.
- Inventário de sobrevivência com o **personagem em 3D** acompanhando o mouse,
  inventário criativo com abas e pesquisa, bancada, fornalha e baú.
- Sons sintetizados (passos e quebra por material, animais, zumbi, explosões) e
  música ambiente de piano gerada na hora.

## Estrutura do código

```
blocos/
  index.html            telas e HUD
  css/style.css         estilo da interface (botões e janelas do jogo original)
  js/main.js            laço do jogo, câmeras (1ª/3ª pessoa), menus e comandos
  js/world.js           chunks, propagação de luz, líquidos, atualizações de blocos
  js/terrain.js         gerador de terreno, biomas, cavernas, minérios e árvores
  js/mesher.js          malhas dos chunks (faces visíveis, oclusão, luz suave)
  js/render.js          níveis de gráficos, shaders, sombras, pós-processamento, céu e nuvens
  js/hdtextures.js      texturas realistas em alta resolução com relevo (ULTRA e MAX)
  js/maxsky.js          céu do MAX: atmosfera, nuvens volumétricas, sol, lua e estrelas
  js/weather.js         chuva, neve e raios
  js/textures.js        texturas e ícones em pixel art gerados por código
  js/models.js          modelos do jogador e das criaturas, animações, mão em 1ª pessoa
  js/entities.js        criaturas e sua IA, itens soltos, blocos caindo, TNT
  js/player.js          movimento, sobrevivência, quebrar/colocar, atacar, comer
  js/physics.js         colisão de caixas contra blocos
  js/inventory.js       inventário, receitas e fornalha
  js/particles.js       partículas
  js/ui.js              HUD, inventários e menus
  js/input.js           teclado, mouse e toque
  js/audio.js           sons e música sintetizados
  js/save.js            salvamento no navegador
  js/noise.js           ruído de Perlin e números aleatórios com semente
```
