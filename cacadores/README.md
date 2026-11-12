# Caçadores de Tornados — simulador de caça a tempestades

Jogo 3D de caça a tornados que roda no navegador (PC e celular), feito do zero com
[three.js](https://threejs.org/) e WebGL 2. **Tudo é procedural**: relevo, lavouras,
estradas, cidades, casas, árvores, carros (carrocerias e texturas), nuvens, supercélulas,
tornados e sons — não há nenhum arquivo de imagem, modelo ou áudio.

## Como jogar

Na raiz do repositório:

```bash
npm start            # servidor sem dependências em http://localhost:8080
```

Abra `http://localhost:8080/cacadores/`. (O jogo usa módulos ES; abrir o `index.html`
direto do disco não funciona.) A qualidade "Baixa" é escolhida sozinha no celular e pode
ser trocada em **Configurações** ou pela URL: `?quality=low|medium|high|ultra`.

## O ecossistema da caça

1. **Escolha o país** — cada um mostra o risco do dia (Sem risco, Tempestades gerais,
   Marginal, Leve, Elevado, Moderado, Alto) e os parâmetros (CAPE, helicidade, NCL).
2. **Leia a previsão** — boletim no estilo do serviço meteorológico local (NWS, Defesa
   Civil, SMN, ECCC, SENAPRED, INUMET), mapa de risco e direção do deslocamento.
3. **Posicione-se** — o dia começa ao meio-dia numa cidade; as torres nascem entre 14h e
   17h. O relógio corre 10× mais rápido que o tempo real; a física e as tempestades correm
   em tempo real. Dá para acelerar (T) quando não há perigo ou pular até as tempestades.
4. **Intercepte e documente** — radar Doppler no canto (refletividade com eco em gancho e
   bola de detritos; velocidade radial com o par de rotação), alertas com polígonos,
   sirenes nas cidades dos EUA e do Canadá.
5. **Ganhe dinheiro** com fotos vendidas à agência (valem mais formatos raros, boa
   distância e enquadramento), interceptações, relatos ao serviço meteorológico, sondas
   deixadas no caminho do tornado e varreduras com o radar móvel.
6. **Gaste** com combustível, consertos, hotel, viagens e melhores carros.

## Os seis países

Cada país é uma região de 24 × 24 km com cidades reais (posições comprimidas a partir da
geografia verdadeira), rodovias reais, rios, solo e lavouras típicos:

| País | Região | Cidades | Tornados |
|---|---|---|---|
| 🇺🇸 Estados Unidos | Oklahoma Central | Oklahoma City, Moore, Norman, El Reno, Yukon, Union City, Tuttle, Chickasha | **todo dia**, a maioria EF0/EF1 |
| 🇧🇷 Brasil | Oeste de SC e norte do RS | Chapecó, Xaxim, Xanxerê, Ponte Serrada, Seara, Concórdia, Erechim | a cada **2–3 dias**, a maioria EF0/EF1 |
| 🇦🇷 Argentina | Pampa (norte de Buenos Aires) | Pergamino, San Nicolás, Arrecifes, Rojas, Colón, Salto, Ramallo | a cada **3 dias**, a maioria EF0/EF1 |
| 🇨🇦 Canadá | Sul de Manitoba | Winnipeg, Headingley, Elie, Oakville, Portage la Prairie, Starbuck, Carman, Morris | a cada **2–3 dias**, a maioria EF0/EF1 |
| 🇨🇱 Chile | Biobío | Talcahuano, Concepción, Coronel, Chillán, Cabrero, Yumbel, Laja, Los Ángeles, Nacimiento | a cada **5–7 dias**, quase sempre EF0 |
| 🇺🇾 Uruguai | Soriano e Río Negro | Fray Bentos, Mercedes, Villa Soriano, Dolores, Palmitas, Nueva Palmira, Cañada Nieto | a cada **3 dias**, a maioria EF0/EF1 |

Detalhes de cada região: terra vermelha em Oklahoma e no oeste catarinense (a poeira dos
tornados fica avermelhada), cavalos-de-pau de petróleo e trailers nos EUA, aviários e
araucárias no Brasil, silos-bolsa e moinhos na Argentina e no Uruguai, canola amarela,
elevadores de grãos e quonsets no Canadá, plantações de pinus, a costa do Pacífico e a
Cordilheira dos Andes com vulcões nevados no Chile. No hemisfério sul as supercélulas e os
tornados giram no sentido horário e o sol fica ao norte.

## Tempestades e tornados

- **Ciclo da supercélula**: cúmulo → cumulonimbo com bigorna e topo penetrante → mesociclone,
  nuvem parede, nuvem cauda, fractos e linha de flanco → tornado → oclusão e novo
  mesociclone (tornados em **ciclos**) → dissipação. Chuva do núcleo, núcleo de granizo e a
  cortina do gancho (RFD) com a fenda de céu limpo atrás da nuvem parede.
- **Ciclo do tornado**: nuvem funil descendo → redemoinho de poeira no chão (toque) →
  organização → maturidade → encolhimento → **corda** contorcida → dissipação. Algumas
  nuvens funil recuam sem tocar o solo.
- **Formatos**: corda, cone, cilindro, forma de V, cunha e multivórtice (subvórtices de
  sucção girando em volta do centro). Não há limite fixo de tamanho: com a supercélula
  "carregada" o tornado engrossa aos poucos e muda de forma (cone → cilindro → cunha…). Em
  casos raros vira uma **massa rebaixada** que toma o horizonte, sem funil clássico.
- **Visual**: ray marching volumétrico do funil de condensação (estrias que sobem girando,
  sombra própria com contraluz, bordas prateadas), da nuvem de detritos tingida pelo solo
  do país, da nuvem parede, da chuva e do granizo; sombra das tempestades no chão (a da
  bigorna se estende por dezenas de quilômetros com o sol baixo), raios, clarões de postes
  arrebentando e exposição automática medida na imagem.
- **Vento**: vórtice de Rankine modificado com afluxo junto ao chão, corrente ascendente,
  subvórtices e translação. Ele arrasta e levanta o carro, solta detritos (tábuas, telhas,
  chapas, isolamento, galhos) e faz as árvores balançarem.

## Classificação EF pelos danos

Como na vida real, o tornado recebe a nota **só pelos danos observados** em indicadores de
dano (casas, trailers, galpões, prédios, igrejas, silos, árvores, postes, carros, caixas
d'água, turbinas eólicas, pivôs). Como a maioria dos tornados nasce e anda em campos,
a maioria termina como **EF0 ou EF1** — mesmo quando o vento real foi mais forte. O relatório
de levantamento de danos mostra trajetória, largura, duração, os danos mais altos e
compara com o vento real (e com o vento medido por sonda ou radar móvel, se houver).

## Carros (projetos próprios)

| Carro | Destaque |
|---|---|
| Sedã de Aluguel | grátis, rápido no asfalto, frágil |
| Picape 4×4 de Sondas | tração para terra e lama, 3 sondas na caçamba |
| SUV de Pesquisa | estação meteorológica no teto (vento e pressão) |
| Van Radar Doppler | radar móvel: estacione e escaneie (N) para medir o vento real |
| Interceptador Blindado | chapas de aço e âncoras hidráulicas (X); aguenta EF3–EF4 ancorado |

As carrocerias são feitas por *loft* de seções transversais (assoalho, cintura, capô,
teto com *tumblehome*, caixas de roda recortadas no perfil) e as texturas são desenhadas em
canvas: pintura com faixas e adesivos, colunas e vidros, grade e faróis, lanternas, pneus,
rodas e **placas no padrão de cada país** (Mercosul no Brasil, na Argentina e no Uruguai).
Melhorias: grade antigranizo, pneus para lama, câmera profissional, sondas e kits de reparo.

## Controles

| PC | Ação |
|---|---|
| W A S D / setas | dirigir |
| Espaço / Shift | freio de mão / arrancada |
| Mouse (arrastar), roda | olhar em volta, zoom |
| C | câmera: perseguição, motorista, teto, órbita, tripé |
| Q | olhar para o tornado (ou tempestade) mais próximo |
| F | foto |
| P / N / G | sonda / radar móvel / relatar tornado |
| X | âncoras (blindado) |
| E | abastecer e consertar no posto |
| R / Z | radar: refletividade ↔ velocidade / alcance |
| M | mapa · T acelerar o tempo · L faróis · H buzina · Esc pausa |

**Celular** (na horizontal): joystick de direção à esquerda, pedais à direita, arrastar a
tela para olhar e botões de foto, câmera, olhar o tornado, sonda, relato, mapa e radar.

## Laboratório de tornados

No menu, gere uma supercélula madura a poucos quilômetros de você escolhendo o país, o
formato inicial (incluindo a massa rebaixada), a intensidade real (EF0–EF5), a carga da
supercélula, a hora do dia e se ela é de alta precipitação. Sem custos nem prêmios.

## Estrutura do código

```
cacadores/
  index.html, css/style.css
  js/main.js              laço do jogo, telas e regras
  js/config.js            mundo, relógio, qualidade, escala EF
  js/core/                ruído, números aleatórios, entrada, áudio procedural
  js/world/               países, relevo, estradas, uso do solo, cidades, construções,
                          vegetação, objetos e registro de estruturas destrutíveis
  js/weather/             climatologia e previsão, supercélula, tornado, sistema do tempo,
                          danos e levantamento EF
  js/render/              texturas, materiais, céu, volume (ray marching), pipeline,
                          detritos, raios e chuva
  js/vehicle/             catálogo, carrocerias, texturas dos carros, física e câmeras
  js/ui/                  HUD, radar e mapas
  js/game/save.js         salvamento local
```

Usa o three.js r170 que está em `vendor/three/` (licença MIT).
