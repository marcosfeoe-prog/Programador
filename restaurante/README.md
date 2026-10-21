# Sabor Tycoon

Jogo tycoon/idle de restaurante em 2D isométrico, no estilo dos jogos de celular.
Tudo é desenhado do zero em canvas (personagens, pratos, móveis, carros) e os sons
são sintetizados: não há imagens nem áudios externos. É um único `index.html`.

Para jogar, abra `restaurante/index.html` no navegador (funciona direto do disco ou
em qualquer servidor estático, como `npm start` → `http://localhost:8080/restaurante/`).

## Como funciona
- Clientes chegam pela calçada, sentam, o **garçom** anota o pedido e leva a comanda
  ao balcão, o **chef** cozinha no fogão (com fogo, vapor e barra de progresso),
  deixa o prato no balcão, o garçom serve, o cliente come e paga.
- **Melhorias**: cardápio (6 pratos, preço dobra a cada 25 níveis), fogões + chefs,
  mesas, conforto (gorjetas), garçons, agilidade e propaganda. Compra x1, x10 ou MÁX.
- Toque nas **etiquetas verdes** no próprio restaurante para comprar a próxima mesa
  ou fogão. Tocar em mesas, fogões e funcionários abre a melhoria correspondente.
- **Decorar**: piso do salão, paredes, toalhas, piso da cozinha e cor dos fogões.
  Cada item comprado aumenta as gorjetas para sempre.
- **Presentes semanais**: um presente por dia, sequência de 7 dias.
- **Missões** dão gemas; gemas ativam o **Turbo 2x** e a **Gorjeta do Chef**.
- **Expandir**: abre um restaurante novo (Diner, Cantina, Sushi Bar…) com pratos
  mais valiosos, mantendo gemas e decoração.
- Ganhos enquanto você está fora (até 3 horas) e salvamento automático.

Controles: arraste para mover a câmera, pinça (ou roda do mouse / botões + e −) para zoom.
