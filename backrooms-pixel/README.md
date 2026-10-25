# Backrooms // Pixel

Terror em primeira pessoa nos Backrooms, com visual **minimalista e pixelado**
(320×180, pontilhado Bayer, 8 tons por canal). Tudo é construído do zero, sem
bibliotecas nem arquivos de mídia: o motor é um **raycaster** próprio em Canvas 2D,
e as texturas, sprites, a fonte bitmap e todos os sons são gerados por código.

## Como jogar

Na raiz do repositório:

```bash
npm start              # http://localhost:8080
```

Abra `http://localhost:8080/backrooms-pixel/` (os módulos ES precisam de HTTP).
Funciona no PC e no celular (na horizontal).

| Controle | PC | Celular |
|---|---|---|
| Andar | WASD / setas | analógico (lado esquerdo) |
| Olhar | mouse | arrastar (lado direito) |
| Correr | Shift | botão CORRER |
| Lanterna | F / botão direito | botão LUZ |
| Girar sem mouse | Q / E | — |
| Pausar | Esc / P | botão II |

## Os três níveis

Cada mapa é gerado na hora (labirinto em blocos sobre um toro, então ele "dá a volta"
e parece infinito) e sempre tem um caminho até a saída. Setas pintadas no chão
apontam, de vez em quando, para o lado certo.

| Nível | Nome | Como é | Saída |
|---|---|---|---|
| **0** | O Saguão | Papel de parede amarelo, carpete úmido, lâmpadas fluorescentes que zumbem e piscam. **O Vagante** perambula por aqui. | A parede que falha (estática) — atravesse-a (noclip) |
| **1** | Zona Habitável | Armazém de concreto, pilhas de caixas, poças, goteiras; **quedas de energia** apagam tudo por alguns segundos. | Porta com placa SAÍDA verde |
| **2** | Canos | Túneis estreitos de manutenção, grades no chão, luz vermelha de emergência, **vapor** que queima a sanidade. Quase tudo depende da lanterna. | Porta de madeira |

## Mecânicas

- **Lanterna**: facho em cone que atrasa um pouco em relação à câmera, consome pilha
  e pisca quando a carga está baixa (ou quando a entidade está perto). Pilhas
  espalhadas recarregam 45%.
- **Sanidade**: cai devagar o tempo todo, rápido no escuro (menos com a lanterna
  ligada), ao **olhar para a entidade**, durante perseguições e no vapor. Sob luz
  forte ela se recupera um pouco. **Água de Amêndoa** devolve 30 pontos.
  Com sanidade baixa: cores lavadas, aberração cromática, ondas na imagem,
  sussurros, batimentos, letras do HUD embaralhadas e **alucinações** (vultos que
  somem quando você olha). Em zero, você se perde.
- **O Vagante** (Nível 0): figura alta e magra de olhos brancos. Vaga pelo nível
  por caminhos (busca em largura), ouve você correr, enxerga a lanterna e persegue
  quem vê. Ele é mais rápido que o seu passo, mas mais lento que a sua corrida — e o
  fôlego acaba. As lâmpadas perto dele falham. Se ele te alcançar: susto e −38 de
  sanidade.
- **Câmera tremida**: mover a visão faz a câmera **balançar como uma mola** (passa
  do ponto e volta, inclinando a imagem), com balanço dos passos, tremor de mão,
  mais tremor com medo/sanidade baixa e impactos. A intensidade é ajustável
  (0–200%) no menu.

## Arquivos

```
index.html, css/style.css
js/main.js       estados do jogo, regras, HUD e composição final (giro da câmera)
js/renderer.js   raycaster: paredes, chão/teto, mapa de luz, lanterna, sprites, pós-processo
js/levels.js     geração dos níveis, luzes, mapa de luz com sombras, itens, saída
js/textures.js   texturas e sprites em pixel art pintados por código
js/entity.js     IA do Vagante
js/camera.js     balanço, passos e tremores da câmera
js/audio.js      sons sintetizados (Web Audio)
js/font.js       fonte bitmap 5×7 com acentos
js/hud.js, js/input.js, js/util.js
```
