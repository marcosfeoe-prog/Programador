# Gramado — Futebol 3D (pasta `futebol/`)

Jogo de futebol 3D realista que roda no navegador (PC e celular), feito com
[three.js](https://threejs.org/) e WebGL 2. Tudo é **procedural**: estádios,
gramado, uniformes, escudos, torcida, céu, chuva, neve e sons — não há arquivos
de imagem ou áudio. São **30 clubes fictícios**, com campeonatos, carreira com
acesso e rebaixamento, partidas avulsas e **8 climas** em **3 horários**.

## Como jogar

O jogo usa módulos ES, então precisa ser servido por HTTP. Na raiz do repositório:

```bash
npm start              # servidor sem dependências em http://localhost:8080
```

Abra `http://localhost:8080/futebol/`. No celular, jogue com a tela deitada
(há manifesto PWA para "Adicionar à tela inicial"). A qualidade gráfica pode ser
forçada pela URL: `?quality=baixa|media|alta|ultra`.

## Modos

- **Partida rápida** — escolha mandante e visitante, com quem você joga (ou
  assista CPU × CPU), clima (ou "pelo clima da cidade"), horário, duração de
  cada tempo (2 a 10 min) e dificuldade (Amador, Profissional, Mundial, Lendário).
- **Carreira** — escolha um dos 30 clubes e dispute temporadas completas:
  - **Série A** (16 clubes) e **Série B** (14 clubes), pontos corridos em turno e returno;
    os 3 últimos da A caem e os 3 primeiros da B sobem;
  - **Copa Nacional**: mata-mata com os 30 clubes (os 2 mais fortes folgam na 1ª fase),
    empate vai para prorrogação e pênaltis;
  - **Taça Continental**: 8 clubes (os 7 primeiros da Série A + o campeão da Copa)
    em 2 grupos de 4 (ida e volta), semifinal e final.
  Calendário de fevereiro a setembro, jogos dos outros clubes simulados, tabelas,
  chaveamentos, artilharia, histórico de campeões e sala de troféus. Cada jogo
  pode ser **jogado** ou **simulado**. O progresso fica salvo no navegador.
- **Torneios** — Copa Nacional, Liga Expressa (16 clubes, turno único), Taça
  Continental ou Copa Relâmpago (8 clubes), com qualquer clube.
- **Clubes** — ficha dos 30 clubes: cidade, estádio, capacidade, clima, altitude,
  estilo, formação, uniformes, força por setor e o elenco de 22 jogadores com atributos.

## Os 30 clubes

Divisão inicial na carreira (pela força do elenco):

| Div. | Clube | Cidade | Estádio (lugares) | Clima | Estilo e formação |
|---|---|---|---|---|---|
| A | Sport Clube Porto Celeste (POC) | Porto Celeste | Arena do Farol (62.000) | Litorâneo | Posse de bola, 4-3-3 |
| A | Aurora Futebol Clube (AUR) | Vila Aurora | Estádio Sol Nascente (58.000) | Temperado | Pressão alta, 4-2-3-1 |
| A | Real Vale Verde (RVV) | Vale Verde | Arena Esmeralda (52.000) | Tropical | Posse de bola, 4-3-3 |
| A | Cometa Esporte Clube (COM) | Estrela d'Alva | Arena Cometa (44.000) | Temperado | Contra-ataque, 4-3-3 |
| A | Atlético Serra Dourada (ASD) | Serra Dourada | Estádio do Pico (41.000) | Montanha, 2650 m | Jogo direto, 4-4-2 |
| A | Fênix Esporte Clube (FEN) | Cinzas Altas | Estádio Renascer (38.000) | Semiárido | Contra-ataque, 4-3-3 |
| A | Vulcano Atlético (VUL) | Vulcano | Estádio da Cratera (32.000) | Montanha, 2900 m | Pressão alta, 4-2-3-1 |
| A | União Ferroviária (UFE) | Ferrópolis | Estádio da Estação (36.000) | Temperado | Equilibrado, 4-4-2 |
| A | Estrela do Norte FC (ENO) | Boreal | Arena Polar (34.000) | Frio | Equilibrado, 4-1-4-1 |
| A | Bandeirante da Colina (BCO) | Colina Alta | Estádio do Bandeirante (35.000) | Temperado | Equilibrado, 4-4-2 |
| A | Operário de Nova Forja (ONF) | Nova Forja | Estádio da Fundição (33.000) | Temperado | Pressão alta, 4-4-2 |
| A | Grêmio Lago Sereno (GLS) | Lago Sereno | Estádio do Lago (30.000) | Frio | Posse de bola, 4-3-3 |
| A | Mineração Esporte Clube (MIN) | Ouro Fundo | Estádio da Mina (29.000) | Montanha, 1250 m | Jogo direto, 5-3-2 |
| A | Náutico Baía Funda (NBF) | Baía Funda | Estádio do Cais (31.000) | Litorâneo | Equilibrado, 4-2-3-1 |
| A | Esporte Clube Ventania (VEN) | Ventania | Estádio dos Ventos (28.000) | Litorâneo | Contra-ataque, 4-4-2 |
| A | Atlética Monte Claro (AMC) | Monte Claro | Estádio do Mirante (26.000) | Montanha, 1850 m | Jogo direto, 4-2-3-1 |
| B | Independente de Pedra Azul (IPA) | Pedra Azul | Estádio da Rocha (24.000) | Montanha, 1400 m | Equilibrado, 3-5-2 |
| B | Caravela Sport (CAR) | Caravelas do Sul | Estádio da Caravela (26.000) | Litorâneo | Posse de bola, 4-1-4-1 |
| B | Leões da Savana (LSA) | Savana Grande | Estádio da Juba (27.000) | Semiárido | Jogo direto, 4-4-2 |
| B | Pinheiral Futebol Clube (PIN) | Pinheiral | Estádio das Araucárias (22.000) | Frio, 1100 m | Pressão alta, 4-4-2 |
| B | Princesa do Cerrado (PCE) | Cerradópolis | Estádio do Ipê (25.000) | Tropical, 1050 m | Posse de bola, 4-3-3 |
| B | Marítimo das Dunas (MDU) | Dunas Brancas | Estádio da Maré (21.000) | Semiárido | Contra-ataque, 4-4-2 |
| B | Rio Escuro Atlético (REA) | Rio Escuro | Estádio da Correnteza (23.000) | Úmido | Contra-ataque, 5-3-2 |
| B | Tempestade Futebol Clube (TEM) | Trovoada | Estádio do Trovão (20.000) | Tropical | Pressão alta, 4-3-3 |
| B | Tritão Atlético (TRI) | Ilha do Tritão | Estádio do Atol (18.000) | Tropical | Posse de bola, 4-3-3 |
| B | Santa Brisa Esporte Clube (SBR) | Santa Brisa | Estádio da Brisa (19.000) | Litorâneo | Posse de bola, 4-2-3-1 |
| B | Coqueiral Futebol Clube (COQ) | Coqueiral | Estádio dos Coqueiros (17.000) | Tropical | Contra-ataque, 4-4-2 |
| B | Neblina Esporte Clube (NEB) | Vale da Neblina | Estádio do Nevoeiro (16.000) | Úmido, 1500 m | Contra-ataque, 4-1-4-1 |
| B | Granito Futebol Clube (GRA) | Granitópolis | Estádio da Pedreira (15.000) | Frio, 1300 m | Jogo direto, 5-3-2 |
| B | Sabiá Futebol Clube (SAB) | Sabiá | Estádio do Canto (14.000) | Temperado | Equilibrado, 4-4-2 |

Cada clube tem escudo, uniforme principal e reserva (listras, aros, faixa,
metades, quartos, mangas…), elenco gerado com nomes, números, posições, altura,
pé preferido, aparência e 15 atributos (velocidade, aceleração, resistência,
força, passe, finalização, potência, drible, domínio, desarme, cabeceio, visão e,
para goleiros, reflexos, manejo e elasticidade). O estádio de cada clube é
construído conforme a capacidade: 1 a 3 anéis de arquibancada, cantos
arredondados e cobertura nos maiores, torres de iluminação nos menores, cadeiras
nas cores do clube com a sigla escrita, torcida com as camisas do mandante e
setor visitante.

## Climas e horários

| Clima | Efeito no jogo |
|---|---|
| ☀️ Ensolarado | Gramado seco, sombras nítidas |
| ☁️ Nublado | Luz difusa |
| 🌧️ Chuva | Bola desliza mais e quica menos; chuteiras escorregam (curvas fechadas em velocidade podem derrubar); bola molhada é mais difícil de encaixar para o goleiro |
| ⛈️ Tempestade | Tudo da chuva + vento forte com rajadas, **poças** que freiam a bola rasteira de repente, relâmpagos e trovões |
| ❄️ Neve | Gramado branco com linhas azuis e **bola laranja**; a bola rola pouco e quica baixo; jogadores mais lentos e com menos tração |
| 🌫️ Neblina | Visibilidade reduzida |
| 🌬️ Ventania | Vento de 40–60 km/h que desvia lançamentos, cruzamentos e chutes altos |
| 🥵 Calor intenso | Fôlego acaba bem mais rápido |

Horários: **tarde**, **pôr do sol** (luz baixa e alaranjada) e **noite** (refletores,
várias sombras). Na carreira, o clima de cada jogo é sorteado pela região da cidade
do mandante e pelo mês (neve no inverno das cidades frias e de montanha, temporais
no verão tropical…). A **altitude** do estádio muda a densidade do ar: em Serra
Dourada (2650 m) e Vulcano (2900 m) a bola voa mais e todos se cansam mais rápido.

## Física e regras

- **Bola** (430 g, 22 cm) integrada a 240 Hz: gravidade; **arrasto** com a crise de
  arrasto (Cd ≈ 0,45 devagar → ≈ 0,21 acima de ~15 m/s); **efeito Magnus** pela
  rotação (chutes colocados que fazem a curva, cavadinhas com backspin, bolas com
  topspin que caem); "**folha seca**" (bola rápida sem rotação oscila); vento que
  aumenta com a altura; **quique** com restituição e atrito que trocam velocidade
  por rotação; deslize até começar a rolar; resistência de rolagem do gramado;
  **traves e travessão** cilíndricos; **rede** que segura a bola e balança.
- **Chutes e passes** são resolvidos fisicamente (o jogador "mira" um ponto e o
  jogo calcula a velocidade, a elevação e a rotação necessárias, compensando parte
  do vento) e depois recebem o **erro humano**, que depende do atributo, da
  pressão do marcador, da velocidade da corrida, do ângulo do corpo, de voleios,
  do cansaço e do clima.
- **Jogadores** com aceleração que diminui perto da velocidade máxima (modelo de
  arrancada), frenagem e curvas limitadas pela tração, inércia, colisões de corpo,
  **condução de bola por toques** (a bola fica solta entre um toque e outro e pode
  ser roubada; em velocidade os toques ficam mais longos), domínio que pode
  espirrar, cabeceio com pulo e disputa aérea, desvios no corpo, **fôlego** e
  **cansaço** acumulado (substituições automáticas da CPU).
- **Goleiro** se posiciona na bissetriz, lê a trajetória com tempo de reação,
  **mergulha** com alcance físico limitado, encaixa ou espalma (para escanteio ou
  por cima do travessão), sai nos cruzamentos e no mano a mano, respeita a regra
  do recuo e repõe com a mão ou o pé.
- **IA** com formações (4-4-2, 4-3-3, 4-2-3-1, 3-5-2, 5-3-2, 4-1-4-1), linha
  defensiva, marcação, pressão e cobertura, infiltrações, apoio, e decisões de
  passe/lançamento/enfiada/cruzamento/chute/drible avaliadas por risco de
  interceptação e ganho de posição (gols esperados).
- **Regras**: impedimento (com bandeira do assistente), faltas, vantagem, cartões
  (incluindo segundo amarelo e vermelho por chance clara de gol), mão na bola,
  laterais, escanteios, tiros de meta, faltas com barreira que pula, pênaltis,
  acréscimos, prorrogação e disputa de pênaltis.
- Estatísticas (posse, finalizações, xG, passes, desarmes, faltas…), melhor em
  campo, **replay automático dos gols** em câmera lenta (de ângulos diferentes) e
  replay manual.

## Controles

| PC | Com a bola | Sem a bola |
|---|---|---|
| W A S D / setas | mover | mover |
| Shift | correr | correr |
| J ou Z | passe rasteiro (segure = mais força) | desarme em pé |
| K ou X | chute (segure = força e altura) | carrinho |
| L ou C | lançamento / cruzamento | trocar de jogador |
| I ou V | enfiada | chamar companheiro para pressionar |
| Q (segurar) + chute | chute colocado (com efeito) | — |
| E (segurar) + chute | cavadinha | — |
| Espaço | arrancada (toque longo) | segurar: conter |
| Tab | trocar de jogador | trocar de jogador |
| B · R · Esc/P | câmera · replay · pausa | |

**Controle (gamepad)**: analógico move; A passe/desarme; B chute/carrinho; X
enfiada/pressão; Y lançamento; LB trocar; RB chute colocado; LT cavadinha/conter;
RT correr; Start pausa; Select câmera.

**Celular**: joystick à esquerda e botões à direita, que mudam na defesa. Segure
Chute/Passe para carregar a força. "Efeito" deixa o próximo chute colocado.

Em bolas paradas aparece uma dica do que apertar. No pênalti contra, escolha o
canto do goleiro com uma direção + Chute antes da cobrança.

Câmeras: **Transmissão** (padrão, da arquibancada), **TV próxima**, **Alta**
(cabo aéreo) e **Atrás do ataque**.

## Estrutura do código

```
futebol/index.html, css/style.css, manifest.webmanifest, icon.svg
js/main.js              orquestra menus, partidas, replay, áudio e HUD
js/data/clubs.js        os 30 clubes e o gerador de elencos
js/engine/              motor (sem three.js, roda também no Node)
  constants.js          medidas oficiais e constantes físicas
  weather.js            climas, horários e física do ambiente
  ball.js               física da bola e solucionadores de chute
  player.js             cinemática, fôlego e estados do jogador
  team.js               formações, escalação e referencial do time
  ai.js                 IA tática e decisões com a bola
  keeper.js             IA e defesas do goleiro
  setpieces.js          posicionamento de bolas paradas
  match.js              partida: contato, chutes, regras, relógio, replay
  sim.js                simulação rápida (estatística) das outras partidas
  geom.js               geometria do campo e xG
js/comp/                competições (ligas, copas, grupos) e carreira/torneios
js/render/              estádio, jogadores, céu/clima, câmeras e texturas
js/ui/                  menus, HUD e escudos
js/audio.js             torcida, apito, chute, trave, chuva e trovão (Web Audio)
js/input.js             teclado, gamepad e toque
```
