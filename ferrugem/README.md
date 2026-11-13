# Ferrugem — Survival Horror 3D

Jogo de **survival horror em terceira pessoa** que roda direto no navegador (PC e celular),
feito com [three.js](https://threejs.org/) (WebGL 2) e Web Audio. A história, os personagens,
os inimigos e os mapas são **originais**. Todas as texturas, modelos, animações e sons são
**gerados por código**: não há arquivos de imagem, áudio ou modelos 3D.

> Outubro de 2004. A Serra da Aurora parou de responder. O exército fechou as estradas e fala
> em "contaminação na água". Seu nome é **Ryan**. Sua mulher, Helena, e sua filha, Bia, estavam
> no Vale dos Corvos quando tudo começou. Você furou o bloqueio a pé, pela mata, e não vai voltar
> sem a sua família.

## Como jogar

O jogo usa módulos ES, então precisa ser servido por HTTP. Na raiz do repositório:

```bash
npm start
```

Depois abra `http://localhost:8080/ferrugem/` no Chrome, Edge, Firefox ou Safari.
Também funciona em qualquer servidor estático (GitHub Pages, Netlify…), o que facilita
jogar no celular. Use fone de ouvido.

## A campanha: três capítulos

**Capítulo 1 — O Vale dos Corvos.** A vila tomada pela Ferrugem, o cemitério com a ponte
levadiça (duas manivelas para girar enquanto os infectados chegam) e a forja, onde espera
**O Ferreiro**. Uma carta de Helena conta que ela e Bia partiram com o comboio do exército.

**Capítulo 2 — Ferrópolis.** A cidade industrial abandonada: avenida com carros largados,
posto de evacuação vazio, farmácia, posto de gasolina, delegacia, Mercado Municipal e obra.
Logo na chegada, **um helicóptero do exército sobrevoa a cidade** (e volta a passar de tempos
em tempos, com holofote, sem nunca pousar).

- Na avenida, **um grupo de sobreviventes cerca Ryan com armas apontadas** (cena animada).
  Ele levanta as mãos e se explica: também é um sobrevivente, e o nome dele é Ryan. O grupo se
  acalma e mostra onde vive: **um beco escuro**, com fogo no tambor, colchões, uma lona e um
  **vigia sempre no alto do andaime**, com medo de que os infectados ataquem. Os vigias atiram
  nos infectados que chegam perto do beco.
- O grupo: **Tião** (o líder, de escopeta), **Clara**, **Rafa**, **Dona Cida**, **Zeca**
  (o vigia) e **Jorge** (mordido, com febre).
- **Clara, a companheira**, segue Ryan pela cidade, atira nos infectados, avisa quando algo
  vem por trás e reaparece ao lado dele se ficar para trás.
- **Cinco missões** (em qualquer ordem, a quinta abre depois das outras quatro):
  1. *Remédio para o Jorge* — antibióticos no depósito da Farmácia Central.
  2. *Combustível* — dois galões do posto para o gerador do beco (as luzes acendem).
  3. *O rádio da delegacia* — a frequência do exército fala do Campo Esperança.
  4. *O Mercado Municipal* — o chefe **O Açougueiro** e os mantimentos.
  5. *A saída norte* — dinamite da obra para explodir a barricada da ponte.
- No fim, **Ryan precisa abandonar o grupo**: o objetivo dele é encontrar a família de
  qualquer jeito. Cena de despedida no beco (Clara entrega o rifle do pai dela), e o
  helicóptero passa sobre a cidade enquanto ele vai embora.

**Capítulo 3 — A Serra da Aurora.** **Mundo aberto** de 360 × 360 metros: estradas, florestas,
fazendas, vila operária, torre de rádio, barreira do exército, o Campo Esperança, a Pedreira,
a Represa da Aurora e, ao norte, a Siderúrgica Aurora. Mapa com as missões na tecla **M**.

- **Três missões**: *Campo Esperança* (o registro de evacuados revela para onde levaram
  Helena e Bia), *A Pedreira* (derrotar **O Colosso** e pegar o crachá do engenheiro) e
  *A energia da represa* (religar três geradores e resistir 60 segundos às ondas de infectados).
- Com o crachá e a energia, o portão da siderúrgica abre para o chefe final, **Dr. Augusto
  Vidal**, e para o final da história.

## História e lore

O menu **História** (tela título) conta a origem da Ferrugem: o minério vermelho que o ferreiro
Bento achou na mina velha era uma colônia de bactérias que come ferro; a Siderúrgica Aurora o
comprou para o **Projeto Têmpera**, do Dr. Vidal, e os resíduos foram parar no rio. Também traz
a Operação Cerca do exército e o **bestiário** com todos os infectados. Os **documentos** pelo
caminho (diários, cartas de Helena, jornal, ordens do exército, anotações do Dr. Vidal) contam o
resto e ficam guardados na mochila. Cada capítulo abre com um cartão e um texto, e fecha com o
que acontece em seguida.

O menu **Capítulos** permite começar direto de um capítulo já liberado.

## Armas

| Arma | Detalhes |
|---|---|
| Pistola P-9 | 12 tiros, mira laser; tiro na cabeça atordoa |
| Escopeta calibre 12 | recarga cartucho por cartucho; de perto derruba vários |
| Submetralhadora SM-10 | **automática** (segure o gatilho), 30 tiros |
| Rifle de precisão | **luneta com zoom** ao mirar; a bala **atravessa até três** inimigos |
| Revólver .44 | dano enorme, atravessa dois inimigos, costuma derrubar |
| Faca | sem gastar munição; quebra caixas |
| Granada | explode depois de 1,6 s |
| Coquetel molotov | quebra no impacto e deixa o chão em chamas que **incendeiam** os infectados |

## Infectados

Além dos **infectados comuns** (com ferramentas como arma, alguns arremessam pedras) e dos
**rastejantes**, há **dez tipos novos**:

| Tipo | Como luta |
|---|---|
| Corredor | rápido e frágil, ataca em bando |
| Brutamontes | enorme, investe e esmaga o chão; tumor brilhante nas costas é o ponto fraco |
| Cuspidor | mantém distância e cospe bile ácida que queima o chão; a bolsa do pescoço estoura |
| Inchado | lento; explode perto de você ou quando morre (dá para usar em cadeia) |
| Gritador | o grito alerta todos por perto, deixa todos mais rápidos e traz Corredores |
| Blindado | escudo de choque bloqueia tiros de frente: mire nas pernas ou dê a volta |
| Incendiário | deixa rastro de fogo, incendeia o jogador e é imune às chamas |
| Arrastado | sem as pernas, finge de morto e agarra o tornozelo (aperte Ação várias vezes) |
| Cão infectado | matilha veloz que cerca e salta para morder |
| Espreitador | quase invisível: só aparece na luz da lanterna ou bem de perto |

## Chefes

- **O Ferreiro** (cap. 1) — marretada, varrida, investida, ferro derretido; núcleo no peito.
- **O Açougueiro** (cap. 2) — cutelo em sequência, **gancho com corrente que puxa o jogador**,
  investida contra os pilares do mercado e cães de reforço; tumor no ventre.
- **O Colosso** (cap. 3) — operador fundido à escavadeira: marretada, varrida, **onda de choque**,
  pedras e ferro arremessados. Quebre os **dois joelhos** brilhantes para ele cair e expor as costas.
- **Dr. Augusto Vidal** (cap. 3, final) — **três fases de crescimento**: rápido e teleportando,
  depois gigante com espinhos, e por fim fundido ao alto-forno, com chuva de ferro derretido.

## Controles

**PC**

| Tecla | Ação |
|---|---|
| W A S D | andar |
| Shift | correr |
| Mouse | olhar e girar (clique na tela para capturar o mouse) |
| Botão direito ou X | mirar (laser; no rifle, luneta) |
| Botão esquerdo | atirar (segure com a submetralhadora) · sem mirar: faca |
| E | pegar, ler, falar, girar manivela/religar (segure), chutar, soltar-se |
| R | recarregar |
| 1 a 5 / roda do mouse | pistola, escopeta, submetralhadora, rifle, revólver |
| G / T | arremessar / trocar entre granada e molotov |
| H | usar tônico |
| M | mapa e missões |
| Q | giro rápido de 180° |
| Tab ou I | mochila |
| Esc ou P | pausa |
| Enter | pular cena |

**Celular** (na horizontal): joystick à esquerda para andar (empurre até o fim para correr),
arraste no lado direito para olhar. **Mirar** liga e desliga a mira, **Atirar** sem mira usa a
faca, **Ação** interage e chuta. Há botões para recarregar, trocar de arma, curar, granada,
giro de 180°, correr, **mapa**, mochila e pausa. Toque na tela para pular as cenas.

## Opções

Qualidade **Baixa** (sem sombras, escolhida automaticamente no celular), **Média** e **Alta**,
resolução dinâmica para manter o FPS, sensibilidade do mouse e do toque, inverter eixo vertical,
volume geral e da música, indicador do objetivo, ajuda de mira no toque e contador de FPS. Três
dificuldades (**Fácil**, **Normal** e **Difícil**). Checkpoints com salvamento automático.

## Estrutura do código

```
index.html, css/style.css
js/main.js            laço principal, estados, capítulos, cenas, checkpoints, qualidade
js/config.js          dificuldades, qualidade gráfica, preferências, salvamento e capítulos liberados
js/chapters/ch1.js    Capítulo 1: o Vale dos Corvos (mapa, itens, portão, manivelas, ponte, Ferreiro)
js/chapters/ch2.js    Capítulo 2: Ferrópolis (cidade, grupo do beco, cenas, 5 missões, Açougueiro)
js/chapters/ch3.js    Capítulo 3: a Serra da Aurora (mundo aberto, 3 missões, Colosso, Dr. Vidal, final)
js/chapters/common.js peças de cidade e de mundo aberto, zonas de inimigos e população itinerante
js/world.js           kit de construção, céu, luar, neblina, grama, fogo; carrega cada capítulo
js/level.js           itens, caixas, barris, documentos, interações, gatilhos, missões, checkpoints
js/player.js          jogador: câmera, mira, cinco armas, faca, chute, arremessos, fogo, cenas
js/weapons.js         tabela de armas e munições
js/enemies.js         infectados comuns, rastejantes e o gerenciador (alerta, vagas de ataque)
js/infected.js        os dez novos tipos de infectados
js/boss.js            o Ferreiro
js/bosses.js          o Açougueiro, o Colosso e o Dr. Vidal
js/npc.js             sobreviventes, vigias e a companheira Clara
js/cutscene.js        cenas: câmera roteirizada, falas legendadas, faixas pretas
js/heli.js            helicóptero com holofote e som de rotor
js/enemy_base.js      movimento, campo de fluxo, testes de acerto, fogo
js/rig.js             esqueletos procedurais e poses
js/combat.js          raios contra cenário/inimigos/projéteis e explosões
js/projectiles.js     granadas, molotovs, pedras, bile, ferro derretido, fogo e ácido no chão
js/collision.js       colisão no plano (caixas orientadas e cilindros) e raios
js/nav.js             grade de navegação e campo de fluxo (Dijkstra)
js/effects.js         partículas, marcas, cápsulas, clarão do cano, pool de luzes, tremor
js/audio.js           áudio procedural (incluindo o rotor do helicóptero e o rádio)
js/textures.js        texturas procedurais (incluindo asfalto, fachadas e placas)
js/models.js          armas, itens e objetos interativos
js/geo.js             geometrias e junção de malhas estáticas
js/input.js           teclado, mouse (com e sem captura) e toque
js/ui.js              HUD, menus, capítulos, história, mapa, mochila, documentos e telas
js/story.js           textos: capítulos, documentos, missões, lore, bestiário, dicas e final
```
