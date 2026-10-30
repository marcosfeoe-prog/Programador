# Rota Serena — Viagens de carro em mundo aberto (pasta `viagem/`)

Jogo 3D **relaxante** de viagem de carro que roda no navegador (PC e celular),
feito com [three.js](https://threejs.org/) (WebGL 2). O objetivo não é correr: é
**viajar** entre cidades de seis países, ver a paisagem mudar, colecionar carimbos
no passaporte e descobrir mirantes. Tudo é **gerado do zero, por código**: relevo,
estradas, cidades, árvores, céu, sons, músicas do rádio e os próprios carros
(carroceria, rodas e interior). Não há arquivos de imagem, modelo 3D ou áudio.

## Como jogar

Na raiz do repositório:

```bash
npm start
```

Depois abra `http://localhost:8080/viagem/`. Funciona em qualquer servidor
estático (GitHub Pages, Netlify…). No celular, jogue na horizontal; dá para
"Adicionar à tela inicial" (há manifesto PWA).

Parâmetros úteis na URL: `?quality=low|medium|high|ultra`, `?city=valdoro`
(começar numa cidade), `?car=falke`, `?hour=6`, `?play` (pula a tela título).

Há também um **mostruário** dos carros para ver os modelos de perto:
`http://localhost:8080/viagem/dev/cars.html?car=strale&view=34` (vistas `34`,
`side`, `front`, `back`, `top`, `cockpit`; carros `strale`, `kitsune`, `aero`,
`fulmine`, `falke`, `trilha`, `brisa` e os do trânsito).

## O mapa

Um continente fictício de **22 × 15,6 km**, cercado de mar, com seis países e
**~128 km de estradas** entre doze cidades. As estradas são traçadas por um
algoritmo A* sobre o relevo (desviam de rampas fortes e da água), depois
suavizadas, com rampa máxima de ~10%, aterros, cortes, **pontes com pilares**,
guard-rails onde a encosta despenca, balizadores e placas.

| País | Paisagem | Cidades |
|---|---|---|
| **Noruega** | fiordes, montanhas escarpadas, pinheiros e bétulas, neve no alto | Fjordvik (vila de pescadores no fiorde), Nordheim (igreja de madeira) |
| **Suíça** | Alpes nevados, vales verdes, lago de montanha | Hochpass (passo de montanha), Bergdorf (cidade do lago, torre do relógio) |
| **Japão** | vulcão nevado gigante, cerejeiras soltando pétalas, cedros e bordos | Yamanaka (portal torii no lago), Sakuragawa (pagode de cinco andares) |
| **México** | deserto com mesetas, cânion, saguaros e agaves, praias do Pacífico | San Cielo (igreja de torres amarelas), Puerto Coral (farol e palapas) |
| **Itália** | colinas douradas da Toscana, ciprestes enfileirados nas estradas, oliveiras | Valdoro (campanário e duomo), Marina Bella (porto de pescadores) |
| **Brasil** | mata atlântica, morros de granito, coqueiros e praias | Serra Verde (igrejinha colonial), Praia Dourada (farol listrado) |

Ao cruzar uma fronteira aparece a bandeira e a saudação do país. As faixas
pintadas mudam de cor (amarelas na Noruega, México e Brasil), o limite de
velocidade muda e o trânsito tem a cara do lugar (carrinhos *kei* no Japão).

## Viagens

- **T** abre as **Viagens**: escolha uma das 12 cidades. O **GPS** desenha setas
  luminosas na faixa da direita e um feixe de luz marca o destino.
- **O** liga o **piloto automático**: o carro segue a rota sozinho, freia antes
  das curvas e respeita quem vai à frente. Ideal com a **câmera cinematográfica**.
- Ao chegar, a câmera dá uma volta no carro e aparece um **cartão-postal** com a
  foto do momento e um **carimbo** no passaporte.
- **Mirantes 📷** (até três por país) ficam nos trechos mais altos e com vista;
  pare perto deles para registrá-los.
- O **Passaporte** mostra carimbos, fotos, quilômetros rodados, tempo na estrada,
  países visitados e a porcentagem de estradas descobertas (o mapa clareia as
  estradas por onde você já passou).
- Cidades já visitadas permitem **viajar instantaneamente** pelo mapa.
- **Descansar** (menu) muda a hora: amanhecer, meio-dia, pôr do sol ou noite.

## Os carros

Sete carros fictícios, com carroceria **gerada do zero**: cada seção transversal é
uma superelipse com ombro, cintura e teto, costurada ao longo do comprimento; as
caixas de roda são recortadas na superfície; a estufa (vidros e colunas) é uma
segunda superfície. Faróis, lanternas, grades e entradas de ar são "moldados" na
lataria por projeção. Pintura com verniz (clearcoat) e reflexos do céu.

| Carro | Tipo | Destaques |
|---|---|---|
| Varg Strale | hipercarro de motor central | asa traseira enorme, rodas turbina, pinças verde-limão |
| Kitsune RZ-7 | sedã de rali, tração integral | rodas brancas de seis raios com friso vermelho, turbo que assovia, volante à direita |
| Lumière Aéro 16 | grã-turismo bicolor | friso cromado em "C", W16 suave |
| Fulmine Corsa | hipercarro híbrido | entrada de ar no teto, barbatana, escapes no topo, 11 mil rpm |
| Falke 6S Clássico | cupê de motor traseiro | faróis redondos, rabo de pato, boxer de seis cilindros |
| Serrana Trilha 4x4 | utilitário | rodas de aço, bagageiro, estepe, *snorkel*, suspensão longa |
| Ventura Brisa Camper | van de viagem | duas cores, prancha de surfe no teto, cama e armário dentro |

**Interior completo**: painel, quadro de instrumentos com **ponteiros de verdade**
(conta-giros e velocímetro), visor digital de marcha, tela central, volante que
gira com a direção, bancos (concha, conforto ou banco inteiriço), console,
alavanca de câmbio, pedais, forros de porta, para-sóis e **retrovisor interno que
reflete a estrada**. Um motorista com os **braços no volante** (cinemática
inversa) aparece pelas janelas e no cockpit. Limpadores de para-brisa funcionam
na chuva.

Na **Garagem** dá para trocar de carro, mudar a pintura (16 cores) e a cor das rodas.

### Física

Corpo rígido com **suspensão independente** em cada roda (mola, amortecedor e
barra estabilizadora), pneus com **Pacejka simplificado** e círculo de atrito,
aderência que muda com o piso (asfalto, cascalho, grama, terra, areia, neve),
motor com curva de torque e limitador, **câmbio automático** (ou manual), ré
automática, freios com ABS, freio de mão, aerodinâmica (arrasto e pressão
aerodinâmica) e colisões com casas, árvores, pedras, guard-rails, pontes e
trânsito. As **assistências** (estabilidade e contraesterço) deixam a direção
tranquila e podem ser desligadas.

## Céu, clima e som

- **Ciclo de dia e noite** (12, 24 ou 48 minutos, ou hora parada) com céu
  atmosférico, nuvens, pôr do sol alaranjado, lua e estrelas. Faróis acendem
  sozinhos; postes, janelas e o farol das praias acendem à noite.
- **Clima por país**: céu limpo, nublado, chuva (pista molhada e brilhante),
  neve, neblina; pétalas de cerejeira no Japão.
- **Áudio procedural**: motor sintetizado conforme o tipo (V8, boxer de 4 e 6,
  W16, V6 de alta rotação, quatro-cilindros turbo com válvula de alívio), pneus,
  cascalho, vento, ondas, pássaros, grilos e chuva. Dentro do carro o som fica
  abafado.
- **Rádio** com música **gerada na hora** (R troca): *Rádio Lo-fi da Estrada*
  (piano elétrico, baixo e bateria com swing), *Rádio Aurora* (texturas
  ambientes e sinos) e *Rádio Bossa* (violão de nylon por Karplus–Strong).

## Controles

| Tecla | Ação |
|---|---|
| W / ↑ · S / ↓ | acelerar · frear (segure parado para dar ré) |
| A D / ← → | virar |
| Espaço | freio de mão |
| C | câmera: perseguição, perseguição longe, cockpit, capô, para-choque, cinematográfica |
| arrastar o mouse | olhar em volta (B olha para trás) |
| T / Tab | viagens · M mapa |
| O | piloto automático · K controle de cruzeiro |
| R | rádio · L faróis · H buzina |
| P | modo foto (hora do dia, zoom e salvar PNG) |
| Q / E | marchas (câmbio manual) |
| Backspace | voltar para a estrada |
| I | esconder a interface · F tela cheia · Esc pausa |

Também funciona com **controle** (gatilhos aceleram e freiam, analógico vira) e
com **toque** no celular (deslizar para virar, pedais na direita).

## Desempenho

O relevo é gerado em **workers** (sem travar o jogo): uma malha distante cobre o
continente inteiro e blocos detalhados de 2–4 m carregam em volta do carro. As
árvores têm três níveis de detalhe instanciados. Há **resolução dinâmica** e
quatro níveis de qualidade (Baixa é escolhida automaticamente em celulares).

## Estrutura do código

```
viagem/index.html, css/style.css
js/main.js              orquestra o jogo
js/config.js            qualidade, configurações e progresso salvo
js/world/data.js        países, cidades, estradas, fiordes, lagos, vulcão
js/world/gen.js         relevo, regiões, consultas de estrada, árvores (sem three.js)
js/world/roadgen.js     traçado das estradas (A*) e perfil de altura
js/world/worker.js      worker do mundo (jobs.js, pool.js)
js/world/terrain.js     terreno distante + blocos com nível de detalhe
js/world/sky.js         céu, sol, lua, estrelas, nuvens, neblina, reflexos
js/world/water.js       mar e lagos
js/world/roads.js       pistas, pontes, guard-rails, placas
js/world/cities.js      casas em sete estilos, praças, postes, marcos
js/world/flora.js       18 espécies de plantas e grama
js/world/weather.js     chuva, neve e pétalas
js/cars/specs.js        os carros (formas, rodas, interior e física)
js/cars/body.js         gerador da carroceria e da estufa
js/cars/parts.js        rodas, faróis, grades, retrovisores, aerofólio…
js/cars/interior.js     painel, instrumentos, volante, bancos, motorista
js/cars/model.js        monta o carro e os materiais
js/cars/physics.js      física do veículo
js/traffic.js           trânsito
js/travel.js            rotas, GPS, mirantes, piloto automático
js/camera.js            câmeras
js/audio.js, music.js   som do carro, ambiente e rádio
js/ui/                  HUD, minimapa, mapa, menus, bandeiras
```
