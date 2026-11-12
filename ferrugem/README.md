# Ferrugem — Survival Horror 3D

Jogo de **survival horror em terceira pessoa** que roda direto no navegador (PC e celular),
feito com [three.js](https://threejs.org/) (WebGL 2) e Web Audio. A história, os personagens,
os inimigos e o mapa são **originais**. Todas as texturas, modelos, animações e sons são
**gerados por código**: não há arquivos de imagem, áudio ou modelos 3D.

> Outubro de 2004. O Vale dos Corvos, uma vila isolada na serra, parou de responder.
> A última transmissão de rádio dizia apenas: *"o ferro está vivo"*.
> Você é Elias Duarte, agente da Polícia Federal.

## Como jogar

O jogo usa módulos ES, então precisa ser servido por HTTP. Na raiz do repositório:

```bash
npm start
```

Depois abra `http://localhost:8080/ferrugem/` no Chrome, Edge, Firefox ou Safari.
Também funciona em qualquer servidor estático (GitHub Pages, Netlify…), o que facilita
jogar no celular. Use fone de ouvido.

## O que tem no jogo

- **Câmera por cima do ombro** que se aproxima ao mirar, com **mira laser** (o ponto vermelho
  balança de leve e é exatamente onde o tiro vai).
- **Zonas de acerto**: tiro na **cabeça** deixa o infectado atordoado com as mãos no rosto;
  tiro no **joelho** derruba ele de joelhos. Nos dois casos aparece **E · Chutar**: o chute
  derruba todos à frente e você não sofre dano durante o golpe.
- **Armas**: Pistola P-9 (12 tiros), Escopeta calibre 12 (recarrega cartucho por cartucho,
  derruba de perto), faca (sem gastar munição), granadas.
- **Munição escassa** e itens de cura (tônico e kit de primeiros socorros). Caixas de madeira
  quebram com a faca e escondem itens; barris vermelhos explodem e derrubam grupos inteiros.
- **Inimigos**:
  - *Aldeões infectados* pela Ferrugem, com machado, foice, forcado, pá, facão ou pedras
    para arremessar. Andam em grupo, cercam, se alertam uns aos outros pelo barulho dos tiros
    e esperam a vez de atacar (no máximo dois golpeiam ao mesmo tempo).
  - *Rastejantes*: rápidos, correm em zigue-zague e dão botes; ficam expostos depois de cada salto.
  - *O Ferreiro*: chefe final com marretada em área, varrida, investida (se bater num pilar
    fica atordoado), arremesso de ferro derretido que deixa fogo no chão e reforços. O ponto
    fraco é o núcleo incandescente no peito; quando ele cai de joelhos, chegue perto e chute.
- **Três áreas**: a vila (casas que dá para entrar, praça com poço, braseiros, casa do
  prefeito), o cemitério com capela em ruínas, mausoléu e um rio com **ponte levadiça**
  (duas manivelas para girar enquanto os infectados chegam), e a **forja**, arena do chefe.
- **Documentos** espalhados contam a história e dizem para onde ir; ficam guardados na mochila.
- **Checkpoints** com salvamento automático (dá para continuar depois pelo título),
  tela de morte com dicas e tela final com tempo, precisão, abates e **classificação** (S, A, B, C).
- Três dificuldades: **Fácil**, **Normal** e **Difícil**.
- Neblina noturna que muda por área, luar com sombras, lanterna presa ao peito, tochas e
  fornalhas tremulando, partículas (sangue enferrujado, faíscas, poeira, brasas, fumaça),
  marcas de bala, cápsulas ejetadas e tremor de tela.
- **Som procedural**: tiros com eco, passos por tipo de chão, gemidos e gritos dos infectados,
  corvos, vento, rangidos, e uma trilha que cresce quando o perigo se aproxima, com batimentos
  cardíacos quando a vida está baixa.

## Controles

**PC**

| Tecla | Ação |
|---|---|
| W A S D | andar |
| Shift | correr |
| Mouse | olhar e girar (clique na tela para capturar o mouse) |
| Botão direito ou X | mirar (laser) |
| Botão esquerdo | atirar · sem mirar: faca |
| E | pegar, ler, abrir, girar manivela (segure), chutar |
| R | recarregar |
| 1 / 2 / roda do mouse | pistola / escopeta |
| G | granada |
| H | usar tônico |
| Q | giro rápido de 180° |
| Tab ou I | mochila |
| Esc ou P | pausa |
| ← → | girar sem mouse |

Se o navegador não permitir capturar o mouse (por exemplo, dentro de um iframe), o jogo
continua funcionando: mova o mouse para olhar e encoste o cursor nas bordas para girar.

**Celular** (na horizontal): joystick à esquerda para andar (empurre até o fim para correr),
arraste no lado direito para olhar. **Mirar** liga e desliga a mira, **Atirar** sem mira usa a
faca, **Ação** interage e chuta. Há botões para recarregar, trocar de arma, curar, granada, giro
de 180°, correr, mochila e pausa. A ajuda de mira no toque puxa levemente a mira para o inimigo
mais próximo (pode ser desligada).

## Opções

Qualidade **Baixa** (sem sombras, escolhida automaticamente no celular), **Média** e **Alta**
(sombras da lanterna e mais luzes), resolução dinâmica para manter o FPS, sensibilidade do mouse
e do toque, inverter eixo vertical, volume geral e da música, indicador do objetivo e contador
de FPS. As preferências ficam salvas no navegador.

## Estrutura do código

```
index.html, css/style.css
js/main.js         laço principal, estados do jogo, checkpoints, qualidade e tela
js/config.js       dificuldades, qualidade gráfica, preferências e salvamento
js/world.js        o Vale dos Corvos: terreno, casas, cemitério, rio, forja, floresta, céu, neblina
js/level.js        itens, caixas, barris, documentos, portão, manivelas, ponte, gatilhos e objetivos
js/player.js       jogador: câmera, mira laser, tiros, faca, chute, recarga, cura, dano
js/enemies.js      aldeões, rastejantes e o gerenciador (alerta em grupo, vagas de ataque)
js/boss.js         o Ferreiro
js/enemy_base.js   movimento, campo de fluxo e testes de acerto dos inimigos
js/rig.js          esqueletos procedurais e poses (humanoide, rastejante, chefe)
js/combat.js       raios contra cenário/inimigos/projéteis e explosões
js/projectiles.js  granadas, pedras, ferro derretido e fogo no chão
js/collision.js    colisão no plano (caixas orientadas e cilindros) e raios
js/nav.js          grade de navegação e campo de fluxo (Dijkstra)
js/effects.js      partículas, marcas, cápsulas, clarão do cano, pool de luzes, tremor
js/audio.js        áudio procedural
js/textures.js     texturas procedurais
js/models.js       armas, itens e objetos interativos
js/geo.js          geometrias e junção de malhas estáticas
js/input.js        teclado, mouse (com e sem captura) e toque
js/ui.js           HUD, menus, mochila, documentos e telas
js/story.js        textos: introdução, documentos, objetivos, dicas e final
```
