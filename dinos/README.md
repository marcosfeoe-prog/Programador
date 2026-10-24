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

## Espécies

| Espécie | Dieta | Estilo |
|---|---|---|
| **Tiranossauro** | Carnívoro | Predador supremo: vira devagar, mordida mais forte do jogo |
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
automaticamente em celulares; dá para mudar em Configurações ou com `?quality=low|medium|high`.

## Como é feito

```
js/species.js    anatomia de cada espécie (perfil do corpo, ossos, pernas), pele e atributos
js/dinoModel.js  "esculpe" o corpo com anéis ao longo da coluna, tubos nas pernas/braços,
                 dentes, garras, chifres, escudo, crista, placas; calcula os pesos dos ossos
                 e monta uma SkinnedMesh com esqueleto próprio por instância
js/animator.js   animações procedurais: passada com IK de 2 ossos (os pés pisam no relevo),
                 respiração, cauda, olhar, comer, beber, rugir, atacar, dano, deitar, morrer
js/textures.js   texturas em canvas: escamas (Voronoi periódico), listras/manchas,
                 contra-sombra, mapas normais, terreno, casca, folhas, água e olhos
js/world.js      relevo, lagos, rio, mistura de texturas no shader, vegetação instanciada
js/sky.js        céu com sol, lua, estrelas e nuvens; luz e neblina do dia e da noite
js/creature.js   sobrevivência, movimento, combate, comer e beber
js/ai.js         comportamento das manadas, bandos e predadores
js/player.js     controle do jogador e câmera em terceira pessoa
js/audio.js      rugidos com formantes, passos, mordidas e ambiente (Web Audio)
js/ui.js         menu, HUD, bússola, minimapa e mapa
```
