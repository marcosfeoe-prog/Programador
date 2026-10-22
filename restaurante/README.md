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

## Novidades
- **Dia e noite** (ciclo de 8 minutos): à noite as luminárias, postes, faróis e o
  letreiro acendem, e o jantar paga **+25%** por prato.
- **Chuva**: gotas na tela, pedestres com guarda-chuva e pedidos de delivery em dobro.
- **Delivery de moto** (aba Delivery): o motoboy para na porta, o chef prepara e um
  garçom entrega o pedido (1,5x o preço do prato).
- **Clientes VIP** de coroa pagam 5x. O **crítico gastronômico** (boina e óculos)
  dá 5 estrelas e +5 gemas se for atendido rápido.
- **Hora do Rush**: de tempos em tempos chegam clientes sem parar por 45 segundos.
- **Roleta da Sorte**: um giro grátis por dia; giros extras custam 10 gemas.
- **Toque para jogar**: tocar no fogão acelera o preparo e as moedas de gorjeta
  deixadas nas mesas precisam ser tocadas para coletar.
- Dois pratos novos: **Taça de Sorvete** e **Lagosta Gratinada**, e novas missões.

Controles: arraste para mover a câmera, pinça (ou roda do mouse / botões + e −) para zoom.
