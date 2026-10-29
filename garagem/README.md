# Garagem Lendária — jogo de colecionar carros (pasta `garagem/`)

Jogo para celular (funciona também no PC) em que você toca para ganhar moedas, abre
caixas para tirar carros raros, monta a garagem dos sonhos e joga minijogos.
Todas as marcas e modelos são **fictícios** (Gorlomi, Korsche, Nivan, Belvares…).

Com o servidor rodando (`npm start` na raiz), abra `http://localhost:8080/garagem/`.

## Telas

| Aba | O que tem |
|---|---|
| **Início** | Toque no carro em destaque para ganhar moedas, Boost x3, nível e XP, renda passiva da garagem. Atalhos: Diário, Tarefas, Ranking, Câmbio, Perfil, Melhorias, Conquistas e Coleções |
| **Caixas** | Ofertas do dia (3 carros com estoque limitado, trocam à meia-noite), Edições Limitadas (tiragem fixa) e 5 caixas padrão — Básica, Entusiasta, Colecionador, Prestígio e Graal — com as chances de cada raridade. Inventário de caixas ganhas |
| **Garagem** | Valor total, carros e únicos; busca, filtro por raridade e por carroceria, ordenação e modo "mostrar todos" (silhuetas dos que faltam). Detalhes, destacar no início e vender |
| **Leilão** | Leilão ao vivo contra rivais: cada lance garante pelo menos 8 s no relógio |
| **Loja** | Recompensa diária com sequência de 7 dias, concessionária (estoque novo a cada 4 h) e câmbio de gemas/moedas |
| **Jogos** | Quiz de Carros, Dia de Corrida, Leilão, Duelo, Cara ou Coroa e Ferro-Velho (minas) |

Raridades: **Comum, Incomum, Raro, Épico, Lendário e Ultra Prestígio**. Ao abrir uma
caixa a cor do brilho já indica a raridade antes da revelação, que mostra valor, XP,
potência, velocidade máxima, 0 a 100 km/h, ano e a chance ("1 em N tiradas").

O progresso fica salvo no navegador (localStorage). Enquanto o jogo está fechado a
garagem continua rendendo moedas (até 2 h, ampliável em Melhorias).

## Imagens dos carros

As imagens em `assets/cars/` e `assets/boxes/` são recortes com fundo transparente
(WebP) **gerados do zero** por um modelador 3D procedural feito com three.js
(`tools/carmodel.js`): carroceria montada por seções transversais com caixas de roda,
estufa com vidros e colunas, rodas com aros de vários estilos, pinças de freio e
decalques projetados na superfície (faróis, grades, entradas de ar, linhas de porta,
faixas de pintura e lanternas). Há 22 tipos de carroceria (entre eles super carro, hipercarro, luxuoso, elétrico, vintage, Mustang, conversível, perua, van,
hipercarro, GT, muscle, clássico, sedã, elétrico, hatch, JDM, SUV, picape e protótipo).

A receita de cada carro (tipo, cor, acabamento, aros…) fica em `js/data.js`. Para
regenerar as imagens depois de mudar o catálogo (precisa de Playwright + Chromium):

```bash
node garagem/tools/render.mjs            # todos os carros e caixas
node garagem/tools/render.mjs nivan-sky-r34-2000 boxes
```

Também dá para ver um carro no navegador: `/garagem/tools/render.html?car=<id>`.

## Estrutura

```
index.html, css/style.css
js/data.js     catálogo: raridades, carrocerias, 145 carros (receitas 3D) e caixas
js/state.js    estado, economia, níveis, tarefas, conquistas, coleções, sorteio das caixas
js/ui.js       ícones SVG, sons (Web Audio), toasts, janelas, confete
js/main.js     telas: início, caixas, garagem, leilão, loja e painéis
js/games.js    minijogos
tools/         modelador 3D e estúdio de renderização das imagens
```
