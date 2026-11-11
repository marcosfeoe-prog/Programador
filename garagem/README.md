# Garagem Lendária

Jogo de colecionar carros para navegador (feito para celular), em HTML/CSS/JS puro,
sem dependências. Os carros são desenhados em SVG por código; marcas e modelos são fictícios.

## Como jogar

```bash
npm start
```

Depois abra `http://localhost:8080/garagem/`.

- **Pista**: toque no carro para ganhar moedas e XP; ative o Turbo 3×; cumpra as missões do dia.
- **Caixas**: quatro caixas com chances exibidas; cada uma traz um carro de seis raridades.
- **Garagem**: 60 carros de 10 marcas, busca, filtros, venda de repetidos e prêmio por marca completa.
- **Jogos**: Mais ou Menos, Dia de Corrida, Campo de Cones e Cara ou Coroa (só moedas do jogo).
- **Oficina**: melhorias de toque e renda passiva, troca de gemas e ofertas diárias.

O progresso fica no `localStorage` do navegador.

## Código

- `js/data.js` — catálogo de carros, caixas e missões
- `js/art.js` — desenho dos carros em SVG
- `js/state.js` — save e economia
- `js/games.js` — minijogos
- `js/main.js` — telas e interação
