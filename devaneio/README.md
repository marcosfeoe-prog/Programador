# Devaneio — Espaços Liminares

Jogo 3D em primeira pessoa sobre **espaços liminares** em estilo **dreamcore**:
lugares vazios, pastel e silenciosos que parecem lembranças. Roda no navegador
(PC e celular), feito do zero com [three.js](https://threejs.org/) r170 e a
Web Audio API. **Tudo é gerado por código**: céu e nuvens, grama, areia,
cogumelos, casas, texturas, fotos das lembranças, músicas e sons. Não há
arquivos de imagem nem de áudio.

## Como jogar

O jogo usa módulos ES, então precisa ser servido por HTTP. Na raiz do repositório:

```bash
npm start
```

Depois abra `http://localhost:8080/devaneio/`. Também funciona em qualquer
servidor estático (GitHub Pages, Netlify…), inclusive no celular.

**Objetivo:** em cada lugar há **três lembranças** (polaroides flutuando, com
brilho e um sininho que dá para ouvir de longe — use fones). Quando as três são
encontradas, **uma porta sozinha aparece** em algum lugar do cenário, com uma
coluna de luz. Atravesse a porta para ir ao próximo lugar. Se você andar longe
demais, o sonho **pisca** e você reaparece do outro lado ("você já esteve aqui
antes").

## Os cinco lugares

| | Lugar | Como é | Detalhes |
|---|---|---|---|
| I | **o caminho rosa** | Campo infinito de grama sob um céu de cúmulos pastel, uma calçada rosa até o horizonte e um poste aceso em pleno dia. | Uma TV de tubo chiando no meio do mato e um balanço que balança sozinho. |
| II | **deserto infravermelho** | Areia azul, arbustos magenta, tufos rosa-choque, céu rosa com horizonte cor de pêssego e acácias escuras ao longe (como numa foto infravermelha). | Placas de aviso "!" com frases estranhas, que **viram para você quando você não está olhando**. O ar quente faz a imagem tremer. |
| III | **o bosque dos cogumelos** | Cogumelos gigantes cor-de-rosa com pintas, névoa rosada, samambaias, trilha de pedras, esporos flutuando e feixes de luz. | Um círculo de fadas e um cogumelo enorme que guarda a porta. |
| IV | **o bairro ao entardecer** | Avenida larga, uma rua de casas iguais demais, gramados, postes acendendo, nuvens rosadas num céu azul e um prédio no fim da rua. | Semáforo verde para ninguém (ele muda de cor com um clique), um carro de faróis acesos que **nunca chega** e uma garagem que se abre sozinha. |
| V | **o último posto** | Posto de gasolina no meio do campo, cobertura com neon laranja e rosa, bombas acesas, postes com fios e uma nuvem enorme pegando fogo no pôr do sol. | As telas das bombas dizem coisas como "você voltou". Para terminar, **fique debaixo da luz**. |

Os lugares já visitados ficam disponíveis em **capítulos**, no menu inicial.

## Controles

**PC:** WASD ou setas para andar · mouse para olhar (clique na tela para travar o
cursor; se o navegador não deixar, arraste com o botão pressionado) · Shift para
correr · Espaço para pular · Esc ou P para pausar · H esconde a interface · F tela cheia.

**Celular:** joystick à esquerda para andar, arraste à direita para olhar, botões
de correr e pular. A qualidade "baixa" é escolhida automaticamente em celulares.

**Controle (gamepad):** analógico esquerdo anda, direito olha, A pula, gatilho
direito corre, Start pausa.

## Opções

Qualidade gráfica (baixa, média, alta), sensibilidade, campo de visão, volumes de
música e efeitos, inverter eixo, balanço da câmera, granulação de filme,
aberração cromática, **filtro de fita VHS** (com data na tela) e contador de FPS.
O progresso e as opções ficam salvos no navegador. Também dá para forçar a
qualidade pela URL: `?q=baixa|media|alta`.

## Como o visual foi feito

- **Céu:** gradiente, sol e nuvens cúmulos feitas com *ray march* curto numa faixa
  de altura (base plana e topo arredondado), mais um banco de nuvens de pôr do
  sol no último nível. O céu também gera o mapa de ambiente (PMREM) que ilumina
  e reflete nos materiais.
- **Neblina:** duas camadas (ar e névoa rasteira) que diminuem com a altura e
  ficam mais claras na direção do sol; substitui a neblina padrão do three.js em
  todos os materiais.
- **Grama, trigo e flores:** centenas de milhares de lâminas instanciadas na GPU,
  em ladrilhos que acompanham o jogador, com vento, manchas, máscara (não nascem
  em calçadas, ruas e casas) e mapa de altura para seguir as dunas.
- **Pós-processamento:** cena em HDR, *bloom* físico (cadeia de mips, sem limiar),
  tonemapping ACES, gradação pastel por nível (pretos levantados, *split toning*),
  bordas desfocadas, aberração cromática, vinheta, vazamento de luz de filme,
  granulação e, opcionalmente, VHS.
- **Resolução dinâmica:** se o jogo ficar lento, a resolução interna diminui e
  volta quando sobra desempenho.
- **Áudio:** vento, pads com oscilação de fita, caixinha de música generativa
  (cada lugar tem sua escala e acordes), passos diferentes por superfície e sons
  em 3D (zumbido dos postes, neon, chuvisco da TV, grilos, sinos, rangidos).

## Estrutura do código

```
index.html, css/style.css, icon.svg, manifest.webmanifest
js/main.js              ponto de entrada
js/engine/              atmosfera/neblina, céu, pós-processamento, texturas, grama,
                        geometria e materiais
js/game/                núcleo (estados e regras), jogador, entrada, áudio,
                        lembranças, fotos procedurais, porta, salvamento
js/levels/              os cinco lugares, objetos compartilhados e utilitários
js/ui/ui.js             menus, HUD, história, opções e controles de toque
```
