# Supercélula — Simulador de Tornados 3D

Jogo 3D de simulação de tornados que roda direto no navegador (PC e celular), feito
com [three.js](https://threejs.org/) e WebGL 2. Todas as texturas, nuvens, sons e
modelos são gerados proceduralmente — não há arquivos de mídia externos.

## Como jogar

O jogo usa módulos ES, então precisa ser servido por HTTP (abrir o `index.html`
direto do disco não funciona):

```bash
npm start            # servidor sem dependências em http://localhost:8080
# ou
python3 -m http.server 8080
```

Depois abra `http://localhost:8080` no Chrome, Edge, Firefox ou Safari.
Também funciona hospedado em qualquer servidor estático (GitHub Pages, Netlify…),
o que facilita jogar no celular.

## O que tem no jogo

### Ciclo de dia e noite
- O **dia (06:00–18:00) dura 10 minutos** e a **noite (18:00–06:00) dura 10 minutos**.
- Céu com espalhamento atmosférico (nascer/pôr do sol avermelhados), lua, estrelas,
  luzes das casas e dos postes à noite, poluição luminosa da cidade.
- Velocidade do tempo ajustável (1×, 2×, 5×, 10×) — volta a 1× durante um tornado.

### Formação de tornados
As tempestades se formam sozinhas (com mais frequência à tarde) seguindo as fases:

1. **Cúmulos em desenvolvimento**
2. **Cúmulos congestus** (torres em "couve-flor")
3. **Cumulonimbus** (bigorna, chuva e trovoadas)
4. **Supercélula** (mesociclone girando, eco em gancho no radar, linha de torres de flanco)
5. **Nuvem parede** baixa e girando sob a base
6. **Nuvem funil** descendo da nuvem parede — ela pode recuar sem tocar o solo
7. **Tornado** — somente quando o funil **toca o solo**
8. **Dissipação** (estágio de corda, inclinação e o tornado se levanta)

A probabilidade de tornado e a intensidade potencial dependem do ambiente
atmosférico (CAPE, cisalhamento, helicidade, NCL e o índice STP — tecla **I**).

### Formatos de tornado
**Corda**, **Cone**, **Cilindro**, **Forma em V**, **Cunha** e **Multivórtice** (vários
vórtices de sucção girando em torno do centro). Todo tornado termina no estágio de corda
antes de se dissipar. As **cunhas** começam com 1 km ou mais de largura e continuam
crescendo enquanto estão no solo, sem limite (podem passar de 5 km em tornados longos).

Aparências: **Cinza** (padrão), **Branco**, **Envolto de poeira**, **Cinza denso e escuro**
e **Envolto pela chuva**.

A intensidade depende do formato: cordas e cones pequenos costumam ser F0–F2, enquanto
cunhas e multivórtices têm ventos acima de 250 km/h (geralmente F3–F4; F5 é raro).
A maioria dos tornados dura de 2 a 5 minutos.

No **Laboratório de tornados** (menu) dá para escolher formato, aparência e a **duração**
dos tornados: 1, 2, 5, 10, 30, 60, 120 ou 180 minutos.

### Classificação F0–F5 pelos danos
O tornado **não** recebe a classe pelo vento real. A classe é atribuída apenas pelos
danos observados em **indicadores de dano**, como num levantamento real:

| Indicador | Exemplos de grau de dano |
|---|---|
| Casa de madeira | telhas (F0) → telhado arrancado (F2) → paredes derrubadas (F3) → casa arrasada (F4) → varrida da fundação (F5) |
| Prédio de alvenaria, igreja, escola | letreiros (F0) … destruição total (F4) |
| Trailer | deslocado/tombado (F1), destruído (F2) |
| Árvores | galhos (F0/F1), arrancada (F1), tronco partido (F2), descascada (F4) |
| Veículos | arrastado (F1), capotado (F2), arremessado >15 m (F3), >50 m (F4), >100 m (F5) |
| Postes, caixa d'água, silo, posto | inclinado/partido/desabado (F1–F3) |

Um tornado violento que passa só por campos vazios pode terminar com classificação
baixa. Ao final aparece o **relatório de levantamento de danos** com trajetória,
largura, construções destruídas e a comparação com o vento real simulado.

### Mundo e física
- Pequena cidade (casas, comércio, prefeitura, igreja, escola, posto, caixa d'água,
  parque de trailers), fazenda com celeiro e silos, plantações, rodovias, floresta e
  montanhas ao redor.
- Campo de vento de vórtice de Rankine modificado com afluxo, corrente ascendente,
  translação e vórtices de sucção.
- Física de destroços com arrasto dependente da orientação, sustentação de placas,
  torque, gravidade e colisão com o terreno. Casas se desmontam peça por peça,
  carros são arrastados e arremessados, árvores tombam, postes partem com clarões
  elétricos e a cidade fica sem energia.
- Solo arrancado (marcas escuras) no caminho de tornados intensos.
- Nuvens, supercélula e tornado renderizados com *ray marching* volumétrico.
- Radar Doppler (refletividade e velocidade radial), alertas, sirenes e áudio procedural.

## Controles

**PC**

| Tecla | Ação |
|---|---|
| WASD / setas | mover / dirigir |
| Mouse | olhar |
| Shift | correr |
| Espaço | pular / freio de mão |
| E | entrar/sair da picape |
| C | câmera (1ª pessoa, livre, cinematográfica; na picape: 3ª pessoa/cabine) |
| Q / Ctrl | descer (câmera livre) |
| R | radar: refletividade ↔ velocidade |
| M | tamanho do radar |
| I | dados atmosféricos |
| H | esconder HUD |
| T | iniciar uma supercélula agora |
| N | avançar fase da tempestade |
| [ e ] | velocidade do tempo |
| F | tela cheia |
| Esc | menu |

**Celular**: joystick à esquerda para mover, arraste à direita para olhar e botões
para pular, correr, entrar no veículo, trocar câmera, radar e menu. A qualidade
"Baixa" é escolhida automaticamente em celulares.

## Qualidade gráfica

O jogo usa **resolução dinâmica** mirando 60 FPS: quando um quadro passa do tempo
disponível, ele primeiro deixa as nuvens volumétricas mais leves (resolução e passos
do ray marching, nuvens calculadas a cada dois quadros com reprojeção) e só depois
reduz a resolução da tela; a qualidade volta sozinha quando sobra desempenho.
Ative "Mostrar FPS" nas configurações para acompanhar.

Baixa, Média, Alta e Ultra (menu → Configurações). As opções mudam a resolução das
nuvens volumétricas, número de passos do ray marching, quantidade de árvores e grama,
sombras e limite de destroços simultâneos. Também é possível forçar pela URL:
`?quality=low|medium|high|ultra`.

## Estrutura do código

```
index.html, css/style.css
js/main.js            orquestra o jogo (render, iluminação, eventos)
js/config.js          qualidade, escala Fujita, constantes
js/render/            céu, nuvens volumétricas, pós-processamento, chuva, relâmpagos, texturas
js/world/             terreno, cidade, peças destrutíveis, floresta, grama, veículos
js/sim/               ciclo dia/noite, tempestade, tornado, física, danos
js/player.js          jogador, picape e câmeras
js/input.js           teclado, mouse e toque
js/ui/                HUD, radar e menu
js/audio.js           áudio procedural (Web Audio)
vendor/three/         three.js r170 (licença MIT)
```

---

# Liminar — Espaços Liminares 3D (pasta `liminar/`)

Segundo jogo do repositório: exploração em primeira pessoa pelos **Níveis 0, 1, 4,
10 e 11** dos "Backrooms", com 11 **filtros** (VHS, filme antigo, CRT, visão
noturna, câmera térmica…), qualidade gráfica **Baixa, Média, Alta e Ultra** e
controles feitos para **celular**. Com o servidor rodando (`npm start`), abra
`http://localhost:8080/liminar/`. Detalhes em [`liminar/README.md`](liminar/README.md).

## MamoBall Craque (`mamoball/`)

Futebol 5 contra 5 no estilo MamoBall, com câmera de transmissão e placar de TV. A bola
gruda no pé: dá para conduzir, tocar e chutar (segure para carregar a força). Funciona no
celular (joystick + botões, em pé ou deitado) e no PC (WASD/setas, Espaço passa, K chuta,
Shift corre). Abra `mamoball/index.html` direto no navegador — é um arquivo único.
