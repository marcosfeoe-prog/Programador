# Liminar — Espaços Liminares 3D

Jogo 3D de exploração em espaços liminares ("Backrooms") que roda no navegador,
feito primeiro para **celular na horizontal** e também jogável no PC. Usa
[three.js](https://threejs.org/) (WebGL 2). Todas as texturas, modelos, luzes e
sons são **gerados proceduralmente**: não há arquivos de imagem ou áudio.

## Como jogar

O jogo usa módulos ES, então precisa ser servido por HTTP. Na raiz do repositório:

```bash
npm start              # servidor sem dependências em http://localhost:8080
# ou
python3 -m http.server 8080
```

Abra `http://localhost:8080/liminar/`. Para jogar no celular, hospede a pasta em
qualquer servidor estático (GitHub Pages, Netlify…) ou acesse o IP do computador
na mesma rede. No celular dá para "Adicionar à tela inicial" (há manifesto PWA,
em tela cheia e na horizontal).

## Os níveis (V2)

Ordem: **0 → 1 → 4 → 5 → 9 → 10 → 10.1 → 11 → 15 → 23 → 88**, mais um subnível secreto (**0.1**). Todos podem ser escolhidos no menu **Níveis** (o secreto só aparece depois de descoberto).

| Nível | Nome | Como é | Objetivo / saída |
|---|---|---|---|
| **0** | O Saguão | Papel de parede amarelo, carpete úmido, lâmpadas fluorescentes zumbindo. | Atravesse a parede que falha |
| **0.1** *(secreto)* | Estação Zênite | Usina elétrica no espaço, o maior nível do jogo: Átrio com claraboia e holograma, Mirante com janela gigante para o gigante anelado Orfeu, Refeitório e alojamentos, passarela de vidro, Sala dos Geradores com três bobinas de Tesla e turbinas, Sala de Controle e Hangar com nave. **Moradores para conversar** (Ada, Vega, Lúcio, Iara, Bento, o Viajante e o robô Z-7). Sem entidades; a sanidade se recupera. | Ache no Nível 0 o **rastro vermelho** que leva a uma **porta de madeira** → fale com a Ada → 3 fusíveis → Vega → recalibre as 3 bobinas → Lúcio → elevador (leva ao Nível 1) |
| **1** | Zona Habitável | Armazém de concreto, quedas de energia; **Sorridentes** no escuro. | Porta de SAÍDA verde |
| **4** | Escritório Abandonado | Divisórias de vidro, mesas, bebedouros, janelas para o vazio. | Chame o elevador |
| **5** | O Hotel do Terror | Hotel dos anos 1930: Salão Principal com lustres e colunas, corredores com quartos numerados, Sala das Caldeiras, jazz de vitrola. **O Hóspede** só anda quando você não olha. | Pegue a chave na recepção → feche as 3 válvulas → abra o quarto |
| **9** | Os Subúrbios | Bairro infinito à meia-noite, casas diferentes, postes falhando, lanterna com **pilha**. **Cães** que ouvem você correr; a luz dos postes é segura. | Caixa de correio com bandeira → 3 pilhas → entre na casa certa |
| **10** | A Plantação | Trigo infinito, céu nublado, postes, celeiros. | Porta solitária no trigo |
| **10.1** | Lago dos Cadáveres | Lago escuro quase em preto e branco, árvores secas, juncos; água rasa drena sanidade, a funda não deixa passar. Sem entidades. | Siga a margem até o píer → entre no barco |
| **11** | Cidade Sem Fim | Metrópole deserta ao entardecer, semáforos funcionando. | Atenda o orelhão |
| **15** | Os Salões Futuristas | Corredores brancos, trechos totalmente escuros, salas de máquinas atrás de vidro grosso. Sem entidades. | Cartão de acesso → religue 3 terminais → abra a comporta |
| **23** | O Jardim Petrificado | Árvores petrificadas entrelaçadas, musgo, névoa e feixes de luz. Sem entidades. | Chegue à Base Seedling e descanse no catre |
| **88** | Lago Silencioso | Lago imóvel e gelado no fundo de um vale de floresta escura, com reflexo espelhado de verdade. Perto da água **todo som é abafado**; dentro dela, sussurros sobem pelo corpo. **Ciclo de dia e noite**: o dia é escuro, a noite quase cega. A **Criatura** persegue quem ela vê — só a **cabana com a porta fechada** salva. A **Sombra** observa de longe entre as árvores e some quando você chega perto. No acampamento abandonado há uma **carta com uma foto em branco** que recupera a sanidade sozinha enquanto estiver na mochila. | Encontre a passagem subterrânea e entre na caverna (final do jogo) |

Os objetivos aparecem como checklist no HUD e a bússola aponta para o próximo passo.

### Sobrevivência
- **Sanidade** cai com o tempo, mais rápido no escuro e perto de entidades. Com
  pouca sanidade a imagem distorce, a cor some, o coração dispara e há sussurros.
  Se chegar a zero, você "acorda" de novo no início do nível.
- **Água de Amêndoa** (garrafas espalhadas) e **bebedouros** recuperam sanidade.
- **Mochila (inventário)**: botão 🎒 ou tecla **I**. Água de Amêndoa fica guardada para
  beber quando quiser; itens de missão (chave, cartão, fusíveis…) aparecem ali, e a
  carta do Nível 88 age sozinha enquanto estiver com você.
- **Bilhetes** contam o que aconteceu com quem passou antes.
- **Conversas**: na Estação Zênite, chegue perto de alguém e toque em **USAR** (ou E);
  escolha as respostas tocando nos botões ou com as teclas 1–4.
- **Sorridentes** (Nível 1) avançam no escuro e recuam quando iluminados pela
  lanterna. Um **Observador** às vezes aparece ao longe nos Níveis 0 e 10.
- **Bússola de intuição** (pode desligar): aponta a direção aproximada da saída.

## Filtros

Escolha no menu **Filtros** ou troque durante o jogo (botão **FILTRO** / tecla **V**).
Há controle de intensidade, granulação e vinheta.

| Filtro | Efeito |
|---|---|
| Nenhum | Só a gradação de cor do nível |
| Fita VHS | Croma borrado (YIQ), tremor de linha, faixa de trilha, ruído de troca de cabeça e "● REC" |
| Filme antigo | Sépia 8 mm, riscos, poeira, oscilação de brilho e do quadro |
| Preto e branco | Alto contraste e granulação |
| Visão noturna | Intensificador verde com muito ruído |
| Monitor CRT | Tela curva, linhas de varredura e máscara RGB |
| Dreamcore | Brilho suave, tons pastel e aberração cromática |
| Glitch | Blocos deslocados, canais RGB separados, faixas invertidas |
| Câmera térmica | Falsa cor por "temperatura" (brilho) |
| Câmera digital 2005 | Cores quentes, nitidez exagerada, ruído de cor e data laranja |
| Câmera de segurança | Olho de peixe, ~10 quadros por segundo e carimbo "CAM" |

## Qualidade gráfica

Menu → Configurações → Qualidade (ou `?q=low|medium|high|ultra` na URL).
Celulares começam em **Baixa**; PCs em **Alta**.

| | Baixa | Média | Alta | Ultra |
|---|---|---|---|---|
| Resolução (× densidade de pixels) | até 1× (90%) | até 1,5× | até 2× | até 2,5× (120%, supersampling) |
| Antisserrilhado | — | MSAA 4× | MSAA 4× | MSAA 4× |
| Material | Lambert | PBR + mapas normais + reflexos | idem | idem |
| Texturas procedurais | 256 px | 512 px | 1024 px | 1024 px |
| Lightmap (texels/m · amostras de penumbra) | 2 · 1 | 3 · 2 | 4 · 3 | 5 · 4 |
| Distância de visão interna / aberta | 22 m / 90 m | 34 m / 150 m | 46 m / 220 m | 62 m / 300 m |
| Sombras do sol (níveis abertos) | — | 1024 | 2048 | 4096 |
| Sombras da lanterna | — | — | 512 | 1024 |
| Bloom (níveis) | 3 | 4 | 5 | 6 |
| Trigo (raio · espaçamento) | 15 m · 0,62 m | 24 m · 0,5 m | 32 m · 0,42 m | 42 m · 0,36 m |

A **resolução dinâmica** (ligada por padrão no celular) reduz a resolução quando
o FPS cai e volta a aumentar quando sobra desempenho.

## Controles

**Celular** (na horizontal): joystick à esquerda — empurre até a borda para
correr; arraste à direita para olhar. Botões: **USAR** (pisca quando há algo para
usar), lanterna, correr, mochila, bússola, filtro e menu. Vibra nos sustos.

**PC**

| Tecla | Ação |
|---|---|
| WASD / setas | mover |
| Mouse | olhar |
| Shift | correr |
| E ou Espaço | usar / beber / ler / abrir |
| F | lanterna |
| V | próximo filtro |
| N | bússola de intuição |
| I ou Tab | mochila (inventário) |
| 1–4 | escolher resposta / item |
| H | esconder HUD |
| G | tela cheia |
| Esc / P | pausa |

## Como funciona

- **Iluminação pré-calculada por bloco.** Nos níveis internos, a luz de cada
  luminária é traçada pela grade de paredes (DDA) até cada texel do piso: paredes,
  batentes e vergas de porta projetam sombra; a penumbra vem de várias amostras ao
  longo da lâmpada. Depois entram a luz rebatida (borrão largo), a oclusão de
  contato junto às paredes e uma máscara de umidade/sujeira. O lightmap guarda as
  luzes fixas e dois grupos de lâmpadas que **piscam** em canais separados, então o
  ambiente escurece junto com a lâmpada que falha — sem nenhuma luz dinâmica.
- **Trigo** em instâncias numa grade que "dá a volta" ao redor da câmera no
  shader, com vento, e um dossel distante que continua o campo até a neblina.
- **Pós-processamento**: cena em HDR com MSAA, bloom Kawase duplo, ACES,
  gradação de cor por nível, efeitos de sanidade e os filtros (compilados sob
  demanda com `#define`, para não pesar no celular).
- **Áudio** sintetizado com Web Audio: zumbido de 120 Hz com harmônicos, passos
  diferentes para cada piso, trilha ambiente (pads) por nível, reverberação,
  a saída como fonte sonora posicional (HRTF) e eventos aleatórios. A saída passa
  por equalização, compressão e limitador para ser audível em alto-falantes de
  celular (há o botão **Testar som** em Configurações; o som começa no primeiro toque).
- **Estação Zênite**: luz "assada" por vértice em dois canais (luzes da estação, que
  acompanham a energia, e luz fixa das janelas/sol), sol com sombras reais da
  qualidade média para cima, planetas e céu estrelado em shaders, pessoas montadas
  com primitivas e rosto pintado em canvas, e diálogos com escolhas.

## Estrutura

```
liminar/
  index.html, css/style.css, manifest.webmanifest, icon.svg
  js/main.js          laço do jogo, níveis, transições, sanidade, resolução dinâmica
  js/config.js        presets de qualidade, filtros, dados dos níveis, preferências
  js/post.js          bloom e composição final com os 11 filtros
  js/materials.js     materiais com lightmap (patch de shader) e construtor de geometria
  js/textures.js      texturas procedurais em canvas (papel de parede, carpete, concreto…)
  js/levels/grid.js   motor dos níveis internos (blocos, lightmaps, colisão)
  js/levels/outdoor.js base dos níveis abertos (blocos, céu, sol com sombras)
  js/levels/level0.js (+ level0_secret.js: rastro e porta de madeira)
  js/levels/level0_1*.js  Estação Zênite (construção, adereços, espaço, pessoas, história)
  js/levels/level1.js, level4.js, level5*.js, level9*.js, level10*.js, level11.js, level15*.js, level23*.js
  js/levels/level88*.js   Lago Silencioso (mundo, objetos, criatura e sombra)
  js/inventory.js     mochila: itens, ícones e efeitos
  js/player.js        movimento, colisão, balanço, passos e lanterna
  js/entities.js      itens, Sorridentes e Observador
  js/input.js         teclado, mouse e toque
  js/audio.js         áudio procedural
  js/ui.js            HUD e menus
  js/notes.js         textos dos bilhetes
```

Parâmetros úteis para testes: `?level=0..11&autostart` (10 = subnível 0.1, 11 = Nível 88) (entra direto no nível),
`?q=ultra`, `?filter=vhs`, `?seed=7`, `?touch` (força os controles de toque).
