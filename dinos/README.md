# Instinto Jurássico — Sobrevivência de Dinossauros 3D

Jogo 3D de sobrevivência de dinossauros que roda no navegador (PC e celular), feito
com [three.js](https://threejs.org/). **Tudo é gerado do zero por código**: os
modelos dos dinossauros, o esqueleto e os pesos de pele, as **animações** (procedurais,
com cinemática inversa nas pernas), as **texturas** (escamas, padrões, terreno,
vegetação, água, olhos), o céu e os sons. Não há nenhum arquivo de imagem, modelo ou áudio.

## Como jogar

Na raiz do repositório:

```bash
npm start              # servidor sem dependências em http://localhost:8080
```

Abra `http://localhost:8080/dinos/`. Escolha uma espécie no menu e clique em **Jogar**.

## Realismo

**Pele**: escamas de tamanhos diferentes por região (miúdas nos flancos e nas pernas,
graúdas no dorso, placas transversais na barriga), duas fileiras de osteodermos ao longo
da espinha, dobras de pele, sujeira nas frestas, barro nos pés, contra-sombra (barriga
clara), mapa de rugosidade, um segundo mapa normal de microdetalhe e brilho aveludado
(*sheen*) nas qualidades Alta e Extra Alta. As escamas ficam proporcionais ao corpo
(a textura acompanha o perímetro local, então afinam na cauda e nos dedos). Placas,
escudo e crista têm sulcos de vasos sanguíneos; os olhos têm íris com fibras, pupila em
fenda, verniz (*clearcoat*), pálpebras que piscam e narinas.

**Animação**: cada pé fica preso no chão enquanto apoia (sem escorregar) e o próximo passo
é planejado para onde o corpo vai estar; parado, o dinossauro só reposiciona o pé que ficou
torto, então dá passinhos ao girar no lugar. Calcanhar que levanta no fim do apoio,
quadrúpedes passando do passo ao trote, quadril que desce em terreno irregular, peso que
passa de uma perna para a outra, inclinação ao acelerar e frear, cauda e pescoço com
inércia (molas), cabeça estabilizada, tórax que expande ao respirar (ofegante quando
cansado), piscadas, olhos e cabeça que acompanham presas, ameaças, comida e a câmera,
gestos ociosos (olhar em volta, sacudir a cabeça, abanar a cauda, farejar), carnívoros que
chacoalham a presa ao morder e arrancam pedaços ao comer, herbívoros que mastigam de lado,
recuo para o lado oposto ao golpe e morte em etapas (joelhos cedem, o corpo tomba e assenta).

### O tiranossauro

Modelado à parte do resto: crânio fundo e largo atrás (com a "quina" do occipital,
focinho rombudo e áspero, chifres sobre os olhos, bochechas e músculos da mandíbula),
olhos voltados para a frente, mandíbula funda com lábios, dentes grossos e irregulares,
língua, pescoço curto e grosso em S, tórax fundo e estreito no dorso, base da cauda
com o músculo caudofemoral, coxas em "coxinha" com quadríceps e posteriores marcados,
panturrilha, metatarso longo, três dedos com almofadas e garras, esporão atrás do pé
e braços curtos de dois dedos. Pele com selas escuras e máscara no focinho.

Animações próprias: rugido em dois tempos (enche o peito com a cabeça erguida, depois
projeta a cabeça, escancara a boca, chacoalha, faz o corpo tremer e levanta a cauda),
mordida com bote (recua e abre a boca, avança o corpo de verdade, fecha com força e
chacoalha a presa), passos pesados (o corpo afunda e o pescoço, a cauda e os braços
balançam a cada pisada), puxões com o corpo todo ao comer, bocejo, farejar o ar,
deitar com o queixo no chão e dormir com a cabeça de lado e a cauda enrolada.

## Espécies

| Espécie | Dieta | Estilo |
|---|---|---|
| **Tiranossauro** | Carnívoro | Predador supremo: 14,5 m e 5,3 m no quadril, vira devagar, mordida mais forte do jogo |
| **Velociraptor** | Carnívoro | Rápido e frágil; na IA, caça em bando e cerca a presa |
| **Tricerátops** | Herbívoro | Quadrúpede blindado; ataca com os chifres e defende a manada |
| **Parassaurolofo** | Herbívoro | Vive em manada, foge rápido; chamado grave pela crista |
| **Galimimo** | Herbívoro | O mais rápido; indefeso, sobrevive correndo |
| **Estegossauro** | Herbívoro | Placas nas costas e cauda com espinhos (golpe de cauda) |

## Sistema de sobrevivência

- **Vida** — cai com ataques, sangramento, fome e sede; regenera com fome/sede acima de 20%
  (mais rápido descansando e dormindo).
- **Fome** — carnívoros comem **carcaças** (é preciso caçar); herbívoros comem
  **arbustos com frutas vermelhas**, que encolhem ao serem comidos e crescem de volta.
- **Sede** — beba em **lagos e no rio**; água funda não deixa passar e água rasa deixa lento.
- **Energia** — correr gasta; zerada, você fica exausto até recuperar.
- **Sangramento** — mordidas e golpes de cauda abrem feridas; descansar estanca mais rápido.
- **Crescimento** — você nasce **filhote** (30%) e, bem alimentado, vira **jovem**,
  **subadulto** e **adulto** (~18 min). Tamanho, vida, força e velocidade crescem junto.
- **Ciclo de dia e noite** (um dia = 20 min): à noite os herbívoros dormem; dormir acelera
  o tempo e a recuperação.
- Ao morrer aparece a causa, os dias sobrevividos e os abates; o **recorde por espécie** fica salvo.

### Ecossistema (IA)

Manadas e bandos com líder, pastagem, ida até a água, descanso e sono noturno. Herbívoros
fogem de predadores (e de rugidos), tricerátops e estegossauros enfrentam ameaças para
defender o grupo, raptors caçam juntos e cercam a presa, carnívoros comem carcaças e
quem é atacado revida ou foge conforme o tamanho. Espécies que somem são repostas longe do jogador.

## Controles

| PC | Ação |
|---|---|
| WASD / setas | andar (relativo à câmera) |
| Shift / Ctrl | correr / andar devagar |
| Mouse, roda | câmera, zoom |
| Clique, Espaço ou F | atacar |
| E | comer / beber |
| Q ou botão direito | rugir |
| C / Z | deitar / dormir |
| M / H / G / Esc | mapa / esconder HUD / tela cheia / pausa |

**Celular**: joystick à esquerda, arraste à direita para girar a câmera (pinça para zoom)
e botões de Atacar, Ação, Correr, Rugir, Deitar e Dormir. A qualidade **Baixa** é escolhida
automaticamente em celulares; dá para mudar em Configurações ou com
`?quality=low|medium|high|ultra`. **Extra Alta** (`ultra`) usa peles de 1024 px, malhas mais
detalhadas, sombras de 4096 px, mais vegetação e alcance de visão maior. As peles são geradas
em paralelo em Web Workers durante o carregamento.

## Como é feito

```
js/species.js    anatomia de cada espécie (perfil do corpo, ossos, pernas), pele e atributos
js/dinoModel.js  "esculpe" o corpo com anéis ao longo da coluna, tubos nas pernas/braços,
                 dentes, garras, chifres, escudo, crista, placas; calcula os pesos dos ossos
                 e monta uma SkinnedMesh com esqueleto próprio por instância
js/animator.js   animações procedurais: passada com IK de 2 ossos (os pés pisam no relevo),
                 respiração, cauda, olhar, comer, beber, rugir, atacar, dano, deitar, morrer
js/skingen.js    pele dos dinossauros em arrays puros (escamas por região, padrões,
                 dobras, rugosidade, mapa normal); roda em js/texworker.js
js/textures.js   demais texturas em canvas: microdetalhe, placas, olhos, marfim,
                 terreno, casca, folhas e água
js/world.js      relevo, lagos, rio, mistura de texturas no shader, vegetação instanciada
js/sky.js        céu com sol, lua, estrelas e nuvens; luz e neblina do dia e da noite
js/creature.js   sobrevivência, movimento, combate, comer e beber
js/ai.js         comportamento das manadas, bandos e predadores
js/player.js     controle do jogador e câmera em terceira pessoa
js/audio.js      rugidos com formantes, passos, mordidas e ambiente (Web Audio)
js/ui.js         menu, HUD, bússola, minimapa e mapa
```
