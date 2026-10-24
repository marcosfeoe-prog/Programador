# AKASHI — Episódio 1: "O Delinquente de Kōyō"

Um episódio de anime de **9 minutos e 50 segundos** em **3D, feito inteiramente em
código** e renderizado em tempo real no navegador com [three.js](https://threejs.org/)
(WebGL 2) e Web Audio. Não há nenhum arquivo de imagem, modelo ou som: personagens,
rostos, cenários, céu, efeitos, trilha sonora e efeitos sonoros são todos gerados por
código.

## Como assistir

Na raiz do repositório:

```bash
npm start              # servidor sem dependências em http://localhost:8080
# ou
python3 -m http.server 8080
```

Abra `http://localhost:8080/akashi/` e clique em **▶ Assistir**. Use fones de ouvido.

### Controles

| Tecla | Ação |
|---|---|
| Espaço / K | reproduzir / pausar |
| ← / → | voltar / avançar 5 s |
| J / L | voltar / avançar 10 s |
| 0–9 | pular para 0%, 10%… 90% do episódio |
| C | legendas |
| F | tela cheia |
| M | mudo |

No celular, toque na tela para mostrar os controles. O botão **Cenas** lista os
capítulos e a engrenagem abre as configurações: qualidade (Baixa/Média/Alta), vozes
(bipes no estilo "fala de jogo", voz sintetizada do navegador ou sem voz), animação
"em dois" (as poses mudam 12 vezes por segundo, como no anime) e **gravar o episódio
em vídeo** (WebM, gravado em tempo real com áudio; o arquivo é baixado ao final).

Parâmetros de URL: `?t=123` começa no segundo 123; `?q=low|medium|high` força a
qualidade; `?autoplay=1` começa sozinho (se o navegador permitir som).

## A história

O Akashi é o delinquente do Colégio Kōyō: cabelo vermelho espetado, casaco longo
(chōran) e cara de poucos amigos. Ele se irrita fácil, é determinado e é viciado em
**rosbife**. Todo mundo foge dele — menos a Hana, a aluna nova, que se apaixona sem
que ele perceba nada.

| Tempo | Cena |
|---|---|
| 0:00 | **Abertura fria** — amanhecer no portão; passos pesados, todos se calam: "O delinquente... Akashi!" |
| 0:25 | **Abertura "Kōyō Crimson"** (90 s de rock de anime): ele entra na escola em câmera lenta e todos abrem caminho; cartões da Hana, do Kenta, dos valentões e do Akashi ("Irrita-se fácil · Determinado · Ama rosbife"); montagem de luta, o soco na câmera e o logotipo |
| 1:55 | **O corredor** — alunos encostados na parede, o calouro que esbarra nele, o professor que quase desmaia e o Kenta com a notícia do rosbife na cantina |
| 2:35 | **A aluna nova** — a Hana se apresenta e senta ao lado dele; ela acha os olhos dele tranquilos, ele só pensa em rosbife… até a barriga roncar |
| 3:35 | **O terraço** — a marmita se abre com raios dourados e coral celestial; a Hana traz um sanduíche de rosbife feito por ela. "...Não é ruim." "Tá com febre?" |
| 4:30 | **Intervalo** (eyecatch) |
| 4:35 | **Atrás do ginásio** — a gangue do Ryuji encurrala um calouro; uma sombra comprida se aproxima; ele só precisa de um olhar e eles fogem |
| 5:30 | **Suspense na rua** — a Hana é seguida ao entardecer; passos que param quando ela para; um gato; e a gangue espreitando |
| 6:10 | **O beco escuro** — neons, poças e o monólogo do Akashi sobre si mesmo; um flashback da infância; o grito de socorro |
| 7:05 | **A batalha** — debaixo do viaduto, ao pôr do sol, cinco contra um: taco, chute giratório, cabeçada, gancho, corrente, o cano de ferro que entorta na cabeça dele ("...É só isso?") e o soco final |
| 8:50 | **Desfecho** — ele pega a mochila e vai embora sem dizer uma palavra, como se aquilo fosse só o trabalho dele |
| 9:20 | **Encerramento** — créditos e a prévia do Episódio 2, "O Rosbife Proibido" |

## Como é feito

- **Personagens** (`js/character.js`, `js/face.js`, `js/poses.js`): esqueleto de grupos
  (quadril, coluna, peito, pescoço, cabeça, braços e pernas articulados) com roupas de
  primitivas — gakuran, o chōran do Akashi com forro vermelho que balança com as
  pernas e o vento, uniforme de marinheiro com saia pregueada, terno. Cabelos com
  mechas cônicas. O rosto é desenhado num canvas e projetado de frente sobre a cabeça,
  com ~25 expressões (raiva, olhar ameaçador com olhos vermelhos brilhando, rubor,
  olhos de estrela, susto…), piscadas e boca falando. Poses e ciclos (andar gingado,
  correr, socos, chute, gancho, comer de hashi…) são funções do tempo.
- **Estilo anime** (`js/toon.js`, `js/post.js`): sombreamento em dois tons com borda
  suave, contorno preto pelo método do casco invertido, luz de recorte (rim light),
  pós-processamento com bloom, quadros de impacto invertidos, quadro de mangá em preto
  e branco com retícula, zoom blur, aberração cromática e sépia nos flashbacks.
- **Efeitos** (`js/fx.js`, `js/overlay.js`): veia de raiva, gota de suor, brilhos,
  corações, vapor de vergonha, aura de chamas, poeira, estrela de impacto, onda de
  choque, respingos, pétalas de cerejeira; linhas de velocidade do mangá,
  onomatopeias ("SOC!", "BAM!!!", "GRRRUUUM"), legendas, cartões e créditos.
- **Cenários** (`js/sets/`): frente da escola com cerejeiras e torre do relógio,
  corredor com faixas de sol, sala de aula, terraço, fundos do ginásio, rua residencial
  com postes e fios, beco de neons, margem do rio sob o viaduto e o fundo abstrato da
  abertura. Céu pintado em shader, com nuvens em dois tons e estrelas.
- **Som** (`js/audio.js`, `js/music.js`): sintetizadores Web Audio (bateria, baixo,
  guitarra distorcida, solo, piano, cordas, coral, taiko, metais) tocando a trilha
  composta em código; efeitos sonoros sintetizados (passos, socos, sino da escola,
  barriga roncando, gato…); vozes em bipes por personagem ou voz sintetizada.
- **Direção** (`js/director.js`, `js/episode.js`, `js/scenes/`): o roteiro é uma lista
  de cenas com tomadas, falas e efeitos sonoros. Cada quadro é calculado a partir do
  tempo, então dá para pausar, voltar e pular para qualquer ponto.
