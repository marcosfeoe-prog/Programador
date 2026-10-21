# Escape dos Backrooms (pasta `escape/`)

Jogo de terror em primeira pessoa inspirado em *Escape the Backrooms*, feito do zero
com [three.js](https://threejs.org/) (WebGL 2). Texturas, modelos, animações e sons são
todos **gerados proceduralmente** — não há nenhum arquivo de imagem ou áudio.

## Como jogar

Na raiz do repositório:

```bash
npm start            # http://localhost:8080
```

Abra `http://localhost:8080/escape/`. Funciona no PC (teclado + mouse) e no celular
(controles de toque). O progresso fica salvo no navegador; os níveis desbloqueados
podem ser escolhidos no menu. Para testar um nível direto: `/escape/?nivel=3`.

## Controles

| Tecla | Ação |
|---|---|
| WASD / setas | Andar |
| Mouse | Olhar (clique para capturar; sem pointer lock, arraste) |
| Shift | Correr (gasta fôlego) |
| C (alterna) / Ctrl (segura) | Agachar — mais silencioso e passa sob vigas |
| E / clique | Usar, abrir portas, pegar itens (segure nas válvulas) |
| F | Lanterna (a bateria acaba) |
| Q | Beber água de amêndoas (fôlego cheio + 8 s de corrida infinita) |
| Esc / P | Pausar |

## Os 5 níveis

| Nível | Nome | Ambiente | Objetivo | Ameaça |
|---|---|---|---|---|
| **0** | O Saguão | Labirinto amarelo, carpete úmido, fluorescentes zumbindo | Encontrar a **fenda na realidade** — siga o chiado de estática | Nenhuma entidade; lâmpadas estouram, passos ao longe |
| **1** | Zona Habitável | Armazém de concreto, pilhas de caixas, poças, gotejamento | Achar **3 fusíveis**, instalá-los no painel e entrar no **elevador** | **Apagões** periódicos soltam os **Sorridentes**, atraídos pela lanterna |
| **2** | Sonhos de Canos | Túneis estreitos e escuros forrados de canos enferrujados | Fechar **3 válvulas** (segurar E) para abrir o **portão de manutenção** | **O Pálido** (e um segundo depois da 2ª válvula); **jatos de vapor** |
| **3** | O Hotel | Corredores com carpete vermelho, luzes de emergência, dezenas de quartos | Achar o **cartão-chave** num dos quartos e sair pela porta **EXIT** | **O Uivador** — e outro aparece quando você pega o cartão |
| **4** | Corra Pela Sua Vida | Corredor em serpentina sob luzes vermelhas piscando | Chegar à **saída** no fim do corredor | Perseguição implacável; vigas para agachar e entulho para desviar |

## Animações

- **Câmera**: balanço ao andar/correr, respiração (mais forte quando sem fôlego),
  tremor ao ser visto e quando a entidade está perto.
- **Braços em 1ª pessoa**: lanterna que balança e abaixa ao correr, gesto de alcançar
  ao usar, e a **animação de beber** a garrafa de água de amêndoas.
- **Entidades**: esqueleto procedural (quadril, joelhos, ombros, cotovelos, pescoço) com
  ciclo de caminhada, corrida inclinada com os braços estendidos para agarrar e espasmos
  de cabeça; o Sorridente flutua e tremula no escuro.
- **Mundo**: portas que giram nas dobradiças, elevador que abre, portão que sobe,
  válvulas que giram, vapor, lâmpadas que piscam/pulsam/estouram, itens flutuando.
- **Telas**: título com glitch, cartão animado de cada nível, transição de *noclip*,
  susto (*jumpscare*) com a entidade avançando para a câmera, tela de vitória.

## Estrutura

```
escape/
├── index.html, css/style.css
└── js/
    ├── main.js        menu, opções, modo vitrine
    ├── game.js        laço, níveis, interação, HUD, morte, transições
    ├── player.js      movimento, fôlego, agachar, lanterna, balanço
    ├── viewmodel.js   braços, lanterna e garrafa em 1ª pessoa
    ├── entity.js      modelos, animação e IA das entidades
    ├── grid.js        mapa em grade, colisão, BFS, paredes, luzes, portas
    ├── textures.js    texturas em canvas
    ├── audio.js       sons procedurais (Web Audio)
    └── levels/        level0.js … level4.js
```

Os mapas são gerados a cada partida (labirinto, posições dos itens e da saída mudam).
As entidades perseguem pelo caminho mais curto (BFS na grade), precisam de linha de
visão para ver você, ouvem você correndo e procuram onde você foi visto pela última vez.
