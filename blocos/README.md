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

### Controles (PC)

| Tecla | Ação |
|---|---|
| W A S D | andar |
| Espaço | pular (no criativo, 2× rápido para voar; segure para subir) |
| Shift | agachar (não cai da beirada) / descer voando |
| Ctrl ou W 2× | correr |
| Botão esquerdo | quebrar bloco (segure) / atacar |
| Botão direito | colocar bloco / usar bancada, fornalha, baú, TNT / comer (segure) |
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

`/gamemode creative|survival`, `/time set day|noon|night|midnight|<ticks>`, `/tp x y z`
(aceita `~`), `/give <item> [qtd]`, `/spawn porco|ovelha|vaca|zumbi|creeper`, `/seed`,
`/spawnpoint`, `/kill`, `/help`.

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
- 57 blocos, incluindo vidro, tijolos, lã colorida, estante, TNT, pedra luminosa,
  bancada, fornalha, baú e blocos de metal.

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

### Sobrevivência
- **Vida, fome, saturação e ar**, regeneração com a barra de fome cheia, afogamento,
  dano de lava, cacto, queda e explosões; tela "Você morreu!" com renascimento.
- Tempo de quebra que depende da dureza do bloco e da ferramenta; picareta necessária
  para pedra e minérios (diamante exige picareta de ferro).
- **Ferramentas** (picareta, machado, pá e espada) de madeira, pedra, ferro, ouro e
  diamante, com durabilidade.
- **Criação** 2×2 no inventário e 3×3 na bancada (tábuas, gravetos, tochas, ferramentas,
  fornalha, baú, blocos de metal...), **fornalha** que funde minério e assa carne com
  combustível, **baú** com 27 espaços.
- Comida: maçã, carnes cruas e assadas, pão, carne podre (segure o botão direito para comer).

### Criaturas (modelos e animações feitos do zero)
- **Porco, ovelha e vaca**: passeiam, olham para você, fogem quando atacados; a ovelha
  come grama. Soltam carne e lã.
- **Zumbi**: aparece no escuro e à noite, persegue e ataca, queima ao sol.
- **Creeper**: se aproxima, incha piscando e explode.
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
  js/render.js          shaders, céu, sol/lua/estrelas, nuvens, seleção e rachaduras
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
