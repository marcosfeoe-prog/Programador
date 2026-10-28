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

Ordem: **Frontrooms → 0 → 1 → 2 → 3 → 4 → 5 → 8 → 9 → 10 → 10.1 → 11 → 12 → 14 → 15 → 16 → 23 → 34 → 35 → 37 → 43 → 44 → 45 → 46 → 47 → 48 → 49 → 122 → 62 → 88 → 177**, mais três subníveis secretos (**0.1**, **0.99** e **9.5**). Todos podem ser escolhidos no menu **Níveis** (os secretos só aparecem depois de descobertos).

| Nível | Nome | Como é | Objetivo / saída |
|---|---|---|---|
| **Frontrooms** | A Terra | O **ponto de partida** (um jogo novo começa aqui): uma casa simples no meio de uma floresta viva, num fim de tarde, com pássaros cantando e fumaça na chaminé. Dentro da casa, uma **falha na parede** tremula e mostra o papel de parede amarelo por trás. | Atravesse a falha → **Nível 0**, que começa com um **despertar em terceira pessoa**: o andarilho se levanta, olha ao redor e a câmera avança pelo corredor mostrando o Nível 0 |
| **0** | O Saguão | Papel de parede amarelo, carpete úmido, lâmpadas fluorescentes zumbindo. Bem maior (a saída fica a ~140 m). Áreas secretas atrás de frestas e portas: **As Armadilhas** (carpete podre e encharcado, luzes morrendo, **buracos no chão** — alguns escondidos — que derrubam você direto no Nível 1), **Sala Manila** (toda acesa, segura, a sanidade se recupera) e **Salas Escuras** (todas as lâmpadas apagadas). | Atravesse a parede que falha |
| **0.1** *(secreto)* | Estação Zênite | Usina elétrica no espaço, o maior nível do jogo: Átrio com claraboia e holograma, Mirante com janela gigante para o gigante anelado Orfeu, Refeitório e alojamentos, passarela de vidro, Sala dos Geradores com três bobinas de Tesla e turbinas, Sala de Controle e Hangar com nave. **Moradores para conversar** (Ada, Vega, Lúcio, Iara, Bento, o Viajante e o robô Z-7). Sem entidades; a sanidade se recupera. | Ache no Nível 0 o **rastro vermelho** que leva a uma **porta de madeira** → fale com a Ada → 3 fusíveis → Vega → recalibre as 3 bobinas → Lúcio → elevador (leva ao Nível 1) |
| **1** | Zona Habitável | Armazém de concreto, quedas de energia; **Sorridentes** no escuro. Bem maior (a saída fica a ~150 m). Área secreta **Manutenção 1**, atrás de uma porta com placa amarela num canto escuro: ala técnica vazia com racks de servidores piscando, mesa de controle (o **terminal** indica a distância e a direção da saída) e um **gerador de reserva** que acaba com as quedas de energia. | Porta de SAÍDA verde |
| **2** | Salões de Utilidades | Túneis de manutenção estreitos de concreto sujo, cheios de canos, fios e máquinas paradas; lâmpadas nuas que apagam em trechos. **Canos com faixa vermelha queimam**: ficar perto deles derruba a sanidade. Começa com uma **cena de despertar**. Sem entidades hostis: só o **Jeffrey**, um papagaio que fala e dá dicas sobre os Níveis 2 e 3. | Ache a **chave dourada** → abra a porta de manutenção trancada |
| **3** | Estação Elétrica | Corredores apertados de tijolos de cores desencontradas, cabos, caixas elétricas e zumbido; **dois andares**. O **Cão** (como o do Nível 9) não é rápido, mas persegue de muito longe pelo labirinto. Área secreta: um **portão enorme** trancado; a **chave branca** abre e uma **cena** mostra o salão de robótica onde os **robôs** dominam o nível. Cena de despertar no início. | Chave branca → portão → computador (**ENTER**) → 2º andar → porta de saída |
| **4** | Escritório Abandonado | Divisórias de vidro, mesas, bebedouros, janelas para o vazio. | Chame o elevador |
| **5** | O Hotel do Terror | Hotel dos anos 1930: Salão Principal com lustres e colunas, corredores com quartos numerados, Sala das Caldeiras, jazz de vitrola. **O Hóspede** só anda quando você não olha. Três portas além da saída se abrem: **333** (quarto vazio com uma carta sobre os segredos do hotel), **472** (escada para o **subsolo**: outro hotel, mais velho, de paredes verdes e carpete azul, com corredores compridos e o livro de registros) e **666** (labirinto escuro de **azulejo e quartzo** com alucinações e barulhos — no fundo está o **radar de entidades**). | Pegue a chave na recepção → feche as 3 válvulas → abra o **Quarto 595** |
| **8** | Sistema de Cavernas | Rede enorme de cavernas de calcário no breu total: túneis tortos, salões altos, estalactites, poças geladas. **Só a lanterna** mostra o caminho; sem ela a sanidade despenca. A **M.E.G.** montou uma base de pesquisa iluminada numa das câmaras, com quatro tripulantes para conversar (e dar dicas). | Ache a base → arranque as **tábuas** do túnel escondido → **área de mineração** (trilhos, vagonete, vigas, minério brilhante) → **porta de madeira** (leva ao Nível 9) |
| **9** | Os Subúrbios | Bairro infinito à meia-noite, casas diferentes, postes falhando, lanterna com **pilha**. **Cães** que ouvem você correr; a luz dos postes é segura. | Caixa de correio com bandeira → 3 pilhas → entre na casa certa |
| **9.5** *(secreto)* | Rochester Blues | Subnível do 9, entrado por uma **casa brilhante coberta de neve** que só existe ali. Bairro enorme sob uma **nevasca interminável**; o frio lá fora derruba a sanidade, as casas acesas aquecem. Começa com uma **cena de despertar**. Três andarilhos sem nome conversam numa sala de velas. | Ache a casa com a luz da varanda acesa → leia a **carta longa** inteira → **durma na cama** → acorde no Nível 10 |
| **10** | A Plantação | Trigo infinito, céu nublado, postes, celeiros. | Porta solitária no trigo |
| **10.1** | Lago dos Cadáveres | Lago escuro quase em preto e branco, árvores secas, juncos; água rasa drena sanidade, a funda não deixa passar. Sem entidades. | Siga a margem até o píer → entre no barco |
| **11** | Cidade Sem Fim | Metrópole deserta ao entardecer, semáforos funcionando. | Atenda o orelhão |
| **12** | Matrix | Três áreas. (1) Salinha branca com mesa, cadeira e uma porta "trancada"; do outro lado, corredores brancos intermináveis — filtros de gravação (VHS, câmera, CCTV) falham aqui. (2) Rua deserta sob uma **lua vermelha** enorme e brilho vermelho intenso. (3) O Branco: uma **cena** mostra o boneco do jogador pela primeira vez; depois, só branco infinito, até que surge uma **porta com erros**. Sem entidades. | Abra a porta → passagem no chão → porta branca aberta → espere a porta com erros |
| **14** | O Paraíso Doente | Uma floresta de **árvores vermelhas** sob um **brilho roxo intenso**: flores que brilham, capim roxo, vaga-lumes e folhas caindo. Uma **trilha** de terra leva **300 m** até a saída; pelo caminho, **casas abertas e totalmente vazias**. Uma **música** toca de lugar nenhum ("apathy (slowed)", de neheart) e fica mais lenta perto da porta negra. Sem entidades. | Siga a trilha até a casa da **porta negra** |
| **15** | Os Salões Futuristas | Corredores brancos, trechos totalmente escuros, salas de máquinas atrás de vidro grosso. Começa com o andarilho **acordando no chão** e, pela primeira vez, **falando sozinho** (o motivo disso tudo, se isso vai ter fim). Sem entidades. | Cartão de acesso → religue 3 terminais → abra a comporta |
| **16** | Mundo Dreamcore | Campos abertos sob um céu pastel e **montanhas cor-de-rosa intermináveis**, com coisas dreamcore pelo caminho (uma porta sozinha, piscina de azulejos com colunas, escada para o nada, balanço que balança sozinho, TV chiando, arcos, balões, placas). O nível **muda conforme você anda**: até 250 m o brilho rosa aumenta e surgem **alucinações** (somem se você olhar direto); de 250 a 400 m a **vista embaça** e a tela falha; de 400 a 499 m o **céu fica rosa-choque**, **estrelas piscam** e um **planeta roxo** enorme sobe, enquanto a música fica **lenta e distorcida**; aos 499 m tudo volta ao normal. Começa com um despertar e o andarilho **fala** sobre como o lugar é relaxante e magnífico. Música: "killswitch lullaby", de flawed mangoes. | Toque na **única árvore**, rosa, brilhante e com falhas — ela puxa o andarilho para dentro (cena de saída) |
| **23** | O Jardim Petrificado | Árvores petrificadas entrelaçadas, musgo, névoa e feixes de luz. Sem entidades. | Chegue à Base Seedling e descanse no catre |
| **34** | Sistema de Esgoto | Túneis de esgoto sem fim, **tijolo em cima e pedra embaixo**, água amarelada parada (anda-se mais devagar), quase sem luz e com pilha na lanterna. Um dos níveis mais perigosos: **Sorridentes** (apague a lanterna e olhe para o chão para ele sumir), **Cães de caça**, bandos de **Ratos da Morte** e a silhueta de um suposto **Ladrão de Pele**. Áreas diferentes: esgoto comum, trechos **decaídos** (paredes desmoronando), trechos onde as paredes **mudam de cor** e trechos **sem teto**, sob um **céu esverdeado**. A Água de Amêndoa daqui está **contaminada**. | Ache a **Sala de Junção** (dois túneis se cruzam em volta de um poço) → mergulhe até o fundo |
| **35** | Um Estacionamento Vazio | Garagem enorme de concreto com **seis andares** (P1–P5 e o terraço), ligados por rampas. Luz fraca e quente, com **luzes verdes e azuis** brilhando baixinho; muros no perímetro e um **abismo escuro** além deles. Carros raros — entrar num deles tem **efeitos variados**. Uma única entidade: uma **criatura enorme e rara** que surge nos cantos escuros e **só persegue quem corre** (e é muito rápida). | Suba as rampas até o terraço → ao chegar perto da saída, o terraço **se enche de carros** sem motorista, que aceleram se você passar na frente → escada de saída |
| **37** | Sublimidade | Labirinto de piscinas de azulejos brancos com água morna verde-azulada: salas claras (claraboias), salas no escuro, colunas, poços fundos. Começa com uma **cena do jogador acordando**. **Verão** (a cada 5 min, 3 min de luz de pôr do sol) e **Roxo Iminente** (raro, brilho roxo hipnótico). Área secreta dos **mercenários**: loja onde se compra com o tempo sobrevivido (kit de primeiros socorros, pilha de longa duração, tênis silencioso, amuleto de azulejo, rádio de ondas curtas). Pacífico, sem entidades. | Três saídas: escada para o subsolo (**43**), porta de manutenção (**15**), porta futurista (**0.1**) |
| **43** | Mundo Aquático | Parque-aquário enorme, fechado e vazio, em várias seções: Saguão com bilheterias e lixo, **Túnel dos Peixes** (vidro dos dois lados), salão do **Grande Tanque** (cardumes, arraias, tubarões e um tubarão-baleia), corredor de serviço, Sala de Máquinas, Laboratório e Tanques de Quarentena. Um alto-falante repete avisos do parque. Sem entidades. Área secreta: **O Mar** — atrás de uma fresta escura no Grande Tanque, uma porta molhada leva a uma plataforma no meio de um mar infinito. | Balde de água → jogue no **gerador** → **chave branca** → porta de manutenção → computador **"Abrir Jaula"** → siga o **rastro azul** até a porta aberta |
| **44** | Os Corredores Desfeitos | Corredores vazios de loja, piso de lajotas bege, luzes pela metade. Sem entidades — mas depois de **10 minutos** o nível se desfaz: o teto cai aos pedaços, a imagem falha, a **vista embaça** e aparecem vultos. Três **portas de madeira**: duas são réplicas com **falhas** e levam ao **Vazio** (cena de despertar em terceira pessoa; uma luz ao longe traz de volta). | Ache a porta de madeira **sem falhas** |
| **45** | O Escritório Esquecido | Longos corredores de um **escritório abandonado**: paredes cinzas de reboco, **carpete branco** manchado e forro de placas com fluorescentes que zumbem. Salas com mesas, monitores apagados, arquivos e divisórias, portas e janelas de vidro para o corredor; **alas antigas de tijolo cinza**, mais escuras. Texturas feitas a partir de **fotos reais** (parede, carpete, tijolo). Sem entidades. | Ache o **cartão de acesso** em cima de uma mesa → passe-o no leitor da **porta de manutenção de metal** |
| **46** | Deserto Árabe | Classe 3: um **deserto imenso** de dunas douradas, **vento quente** sem parar e **cabanas** de madeira perdidas na areia (com água e bilhetes). Sem entidades, mas o **calor** é perigoso: fora da sombra a sanidade cai, a vista tremula e a tela pisca de dor; dentro das cabanas você se recupera. **Três eventos** aleatórios: **tempestade de areia** (céu marrom, quase sem visão, machuca quem fica fora), **miragem** (um oásis com palmeiras que some quando você chega perto) e **onda de calor** (tudo estoura de luz, o calor dobra). | Caminhe **600 m** a partir do início: a areia te engole e leva ao próximo nível |
| **0.99** (secreto) | Anomalia | Classe misteriosa. Escondido em dois lugares: no **Nível 4** é uma **porta escura já aberta** no meio do escritório; no **Nível 12** é uma **abertura rasgada na parede**, de fundo preto, perto da passagem subterrânea. Um lugar enorme, **sem cor** (filtro preto e branco próprio), totalmente liminar e sem medida certa: **salões gigantes** de teto altíssimo com pilares, **salas de teto baixo demais**, **pátios a céu aberto** entre paredes altíssimas (ou baixinhas demais), **becos estreitos**, corredores **apertados** de 1 m ou **largos demais**, muretas pequenas sem motivo. A luz **some de vez em quando**. Sem entidades, mas quem fica muito tempo **alucina**: figuras paradas no fim dos corredores, paredes que respiram, vista embaçada, sussurros. | Encontre a **porta de luz branca** (volta ao 5 se veio do 4, ou à área 2 do 12 se veio do 12) |
| **47** | Corredores Liminares | Classe 2: corredores limpos demais, paredes cor de creme, lajotas brilhantes, bancos vazios, plantas de plástico e bebedouros. Mora aqui uma entidade única: o **Ladrão de Peles**. Ele aparece como uma **pessoa comum** (cada vez com outra aparência), acena e chama: *"Eu sei onde fica a saída. Vem comigo."* — mas **não pisca** e a cabeça às vezes gira demais. Se chegar a 3 passos de você, se você **der as costas** a ele por perto ou se demorar demais, a **pele rasga**: rosto sem olhos, boca rasgada, braços compridos — e ele **corre atrás de você pelo labirinto**, sem cansar. Ser pego tira muita sanidade. Aparece no radar. | Ache a porta dupla com a placa verde de **SAÍDA** |
| **48** | Névoa Densa | Classe misteriosa: um descampado engolido por uma **névoa cinza** espessa — não se enxerga a poucos metros. Coisas surgem e somem: postes, placas, cadeiras, uma cerca velha. Eventos estranhos: **silhuetas paradas** que desaparecem quando você chega perto, **passos imitando os seus**, um **sino** distante e uma **voz chamando um nome**. A única referência é uma **luz vermelha piscando** ao longe. | Siga a luz até um **batente de porta sozinho** no descampado e atravesse-o |
| **49** | Estou Sozinho? | Classe 3: um **subsolo esverdeado** (como a foto de referência): paredes de **blocos de concreto pintados**, piso de **lajota marrom-escura**, teto de concreto em **caixotões** com canos e tubos fluorescentes, **pilares grossos** nos salões, **muretas baixas**, **máquinas de venda** apagadas, caixas de alarme vermelhas e corrimões escuros; corredores longos demais ligando tudo. Lanterna liberada. Entidade única: **A Figura** — uma silhueta alta, **toda branca** e sem rosto, que vaga devagar pelos corredores e **não ataca**… a menos que se sinta ameaçada: **chegar perto demais** ou **apontar a lanterna** para ela a faz parar, tremer e, se você insistir, **se agitar e correr atrás de você**. Ela se acalma se perder você de vista. Aparece no radar. | Ache a entrada dos **túneis de concreto** e siga até a **parede que brilha** |
| **122** | Piscinas Estranhas | Classe 0, feito a partir da imagem de referência: cinco salões ligados, com o **teto pintado de céu nublado** (nuvens que se movem devagar), **canteiros de grama alta** e um **rio de água turquesa que brilha** (cáusticas, espuma na borda de azulejo) serpenteando de sala em sala. **Boias escuras** flutuam à deriva, **boias salva-vidas** nas paredes, colunas redondas, placas de "não corra". **Flores amarelas gigantes com um olho no meio** — elas **viram a cabeça para acompanhar você** e piscam de vez em quando. Dá para entrar na água (mais lento, com respingos). | Siga o rio até a **porta com a placa verde** no último salão |
| **62** | Hotel Luxuoso | Classe 1, inspirado na foto de referência: mármore polido, papel de parede adamascado, lambri creme com molduras, arandelas douradas com cúpula e teto em caixotões com luz de sanca. **Três seções** — descubra jogando. | (sem spoilers) |
| **88** | Lago Silencioso | Lago imóvel e gelado no fundo de um vale de floresta escura, com reflexo espelhado de verdade. Perto da água **todo som é abafado**; dentro dela, sussurros sobem pelo corpo. **Ciclo de dia e noite**: o dia é escuro, a noite quase cega. A **Criatura** (só à noite) persegue quem ela vê — só a **cabana com a porta fechada** salva. A **Sombra** observa de longe entre as árvores e some quando você chega perto. No acampamento abandonado há uma **carta com uma foto em branco** que recupera a sanidade sozinha enquanto estiver na mochila. | Encontre a passagem subterrânea e entre na caverna (leva ao Nível 177) |
| **177** | Memórias do Passado | O nível final, em **cinco áreas**, contando a história do andarilho — o **Mike**, que fala sozinho o nível inteiro. (1) **Corredores roxos** com brilho violeta intenso; ache a **porta branca**. (2) Um **parquinho** na calada da noite, tudo azulado sob a lua; uma **trilha** de 150 m leva a uma casa com a luz acesa e a **chaleira soltando vapor**. (3) **Corredores de neon** colorido, com confete e balões; a 50 m, uma porta branca com a carta **"Festa de Mike"** (é aqui que ele lembra o próprio nome). (4) **Campos de grama baixa** e uma **montanha enorme no pôr do sol**; no topo, uma **fogueira** e uma carta sobre o aniversário em que o Mike sumiu. (5) Uma **rua sem fim na neblina**, com a vista embaçada; a 265 m, uma **casa desolada** com uma cama, a chaleira no fogo e o **bilhete com a história do Mike**. Músicas: "rescue" (neheart x ashess) nas áreas 1–3, cada vez **mais lenta e distorcida** nas áreas 2 e 3; "you not the same" (tilekid) nas áreas 4 e 5. | Deite na cama: **cena final** — Mike dorme, acorda numa floresta viva ao pôr do sol com pássaros cantando, anda perdido e encontra a **casa onde cresceu**: voltou para a Terra (as **Frontrooms**). **Primeiro final do jogo** |

Os objetivos aparecem como checklist no HUD e a bússola aponta para o próximo passo.

### Sobrevivência
- **Sanidade** cai com o tempo, mais rápido no escuro e perto de entidades. Com
  pouca sanidade a imagem distorce, a cor some, o coração dispara e há sussurros.
  Se chegar a zero, você "acorda" de novo no início do nível.
- **Água de Amêndoa** (garrafas espalhadas) e **bebedouros** recuperam sanidade.
- **Radar de entidades** (achado atrás da porta 666 do Nível 5): mostra no canto da tela, em
  qualquer nível, as entidades por perto e bipa mais rápido quando estão perto. Usar liga/desliga.
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
  js/levels/level12*.js   Matrix (corredores brancos, rua vermelha, o Branco e a cena)
  js/levels/level37*.js   Sublimidade (piscinas, eventos, cena e loja dos mercenários)
  js/levels/level2*.js    Salões de Utilidades (canos quentes, Jeffrey)
  js/levels/level3*.js    Estação Elétrica (dois andares, o Cão, salão dos robôs)
  js/levels/level8.js     Sistema de Cavernas (base da M.E.G., mina escondida)
  js/levels/level9_5.js   Rochester Blues (nevasca, carta, cama)
  js/levels/level5_secret.js  Portas 333, 472 e 666 do Nível 5
  js/levels/area.js       Áreas fechadas com luz assada (usadas no Nível 5)
  js/radar.js             Radar de entidades
  js/levels/level43*.js   Mundo Aquático (tanques, peixes, mar secreto)
  js/levels/level44.js    Corredores Desfeitos (decaimento, portas, o Vazio)
  js/levels/level45.js    Escritório Esquecido (salas, cartão, porta de metal)
  js/levels/level14.js    Paraíso Doente (floresta vermelha, trilha, casas, porta negra, música)
  js/levels/level16.js    Mundo Dreamcore (estágios por distância, céu/planeta, alucinações, árvore)
  js/levels/levelFR.js    Frontrooms (casa na floresta, a falha na parede)
  js/levels/level0_wake.js despertar em terceira pessoa ao chegar no Nível 0
  js/levels/level46.js    Deserto Árabe (dunas, calor, cabanas, 3 eventos)
  js/levels/level49*.js   Estou Sozinho? (subsolo, túnel, A Figura)
  js/levels/level62*.js   Hotel Luxuoso (kit de construção do hotel e três seções)
  js/levels/level122*.js  Piscinas Estranhas (rio, flores com olho, céu pintado)
  js/levels/level0_99.js  Anomalia (planta irregular, apagões, alucinações; entradas nos Níveis 4 e 12)
  js/levels/level47*.js   Corredores Liminares + o Ladrão de Peles
  js/levels/level48.js    Névoa Densa (farol, silhuetas e eventos)
  js/levels/level177*.js  Memórias do Passado (5 áreas, música contínua, história do Mike, final)
  js/levels/level34*.js   Sistema de Esgoto (áreas, céu verde, Ratos da Morte)
  js/levels/level35*.js   Estacionamento (andares, rampas, criatura, carros)
  js/levels/wake.js       cena de despertar reutilizável
  js/inventory.js     mochila: itens, ícones e efeitos
  js/player.js        movimento, colisão, balanço, passos e lanterna
  js/entities.js      itens, Sorridentes e Observador
  js/input.js         teclado, mouse e toque
  js/audio.js         áudio procedural
  js/ui.js            HUD e menus
  js/notes.js         textos dos bilhetes
```

Parâmetros úteis para testes: `?level=0..41&autostart` (10 = subnível 0.1, 11 = Nível 88, 12–14 = áreas do Nível 12, 15 = Nível 37, 16 = Nível 2, 17 = Nível 3, 18 = Nível 8, 19 = subnível 9.5, 20 = Nível 34, 21 = Nível 35, 22 = Nível 43, 23 = Nível 44, 24 = Nível 45, 25 = Nível 14, 26 = Nível 16, 27–31 = áreas 1–5 do Nível 177, 32 = Nível 46, 33 = Frontrooms, 34 = Nível 47, 35 = Nível 48, 36 = subnível 0.99, 37 = Nível 49, 38 = Nível 122, 39–41 = seções 1–3 do Nível 62) (entra direto no nível),
`?q=ultra`, `?filter=vhs`, `?seed=7`, `?touch` (força os controles de toque).
