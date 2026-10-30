# Turbo Looping 3D — corrida arcade em pistas suspensas (pasta `turbo/`)

Jogo de corrida 3D que roda no navegador, feito primeiro para **celular** (em pé ou
deitado) e também jogável no PC. Pistas flutuando no céu com **loops**, **saltos**,
**parafusos**, **hélices**, **lombadas** e **obstáculos**; seis mundos com cinco níveis
cada; garagem com dez carros, melhorias, pinturas, rodas e neon. Usa
[three.js](https://threejs.org/) (WebGL 2). Todas as texturas, carros, cenários,
sons e a música são **gerados por código**: não há arquivos de imagem ou áudio.

## Como jogar

O jogo usa módulos ES, então precisa ser servido por HTTP. Na raiz do repositório:

```bash
npm start              # servidor sem dependências em http://localhost:8080
```

Abra `http://localhost:8080/turbo/`. Para jogar no celular, hospede o repositório em
qualquer servidor estático (GitHub Pages, Netlify…) ou acesse o IP do computador na
mesma rede. Há manifesto PWA ("Adicionar à tela inicial" abre em tela cheia).

### Controles

| Celular / mouse | Teclado | Ação |
|---|---|---|
| Segurar o dedo na tela | ↑ / W | Acelerar (soltar desacelera) |
| Arrastar para os lados | ← → / A D | Virar |
| Botão **NITRO** | Espaço / Shift | Nitro |
| — | ↓ / S | Frear |
| Botão ❚❚ | P / Esc | Pausa |

## Regras

- Seis carros largam juntos; você sai do fundo do grid.
- **Largada perfeita**: acelere no último segundo da contagem para ganhar um turbo.
- **Chegue entre os 3 primeiros** para liberar o próximo nível.
- Cada colocação dá moedas (mais nos mundos difíceis) e cada moeda recolhida na pista
  vale 5. Gaste na **garagem**.
- O **nitro** enche com moedas, placas de turbo, saltos, loops e parafusos.
- Nos **loops** é preciso velocidade: soltar o acelerador antes do topo derruba o carro.
- Onde não há defensa, dá para **cair da pista**: o carro reaparece no último ponto
  seguro, alguns segundos atrás.

## Mundos

| Mundo | Clima | Destaques |
|---|---|---|
| **Arquipélago** | dia de sol | mar animado, ilhas com palmeiras, veleiros, nuvens abaixo da pista |
| **Cânion Dourado** | pôr do sol | mesas de pedra em camadas, cactos, rochas |
| **Metrópole Neon** | anoitecer | arranha-céus com janelas acesas, luzes piscando no topo, bordas neon |
| **Pico Glacial** | noite | aurora boreal animada, montanhas de gelo, pinheiros nevados, neve caindo |
| **Vulcão Rubro** | céu em brasa | mar de lava animado, vulcão fumegando, brasas no ar |
| **Órbita Estelar** | espaço | nebulosa, planeta com anéis, lua, campo de asteroides, cristais |

As pistas são geradas a partir de uma semente por nível (sempre iguais para o mesmo
nível) e ficam mais longas e difíceis a cada mundo.

### Peças de pista

Retas, curvas inclinadas (com defensa só por fora e setas), curvas em S, subidas e
descidas, quedas com turbo, ondulações que fazem o carro voar, **salto** (rampa, vão
sem pista e rampa de pouso), **loop**, **hélice** (volta completa subindo ou
descendo), **parafuso** (a pista gira 360° e o carro fica grudado), trecho estreito,
placas de turbo e moedas.

### Obstáculos

- **Martelo pendular**: balança de um lado para o outro e pode jogar o carro para fora.
- **Barra giratória**: gira no meio da pista em volta de um poste.
- **Pistões**: blocos que saem das laterais e empurram o carro.
- **Caixotes**: pilhas que voam longe quando atingidas (e seguram você).

## Garagem

Dez carros (Faísca, Raio GT, Trovão, Lobo, Cometa, Tufão F, Vespa X, Bólido 70,
Ciclone LM e Fantasma), cada um com velocidade, aceleração, controle e nitro
próprios e **5 níveis de melhoria**. Dá para trocar a **pintura** (16 cores, algumas
metálicas), as **rodas** (8 aros) e o **neon** embaixo do carro (incluindo
arco-íris). O progresso fica salvo no navegador.

## Qualidade gráfica

Baixa (padrão no celular), Média e Alta, em **Ajustes** no menu. Mudam a resolução,
as sombras e a quantidade de objetos no cenário.

## Estrutura do código

```
index.html, css/style.css, manifest.webmanifest, icon.svg
js/main.js       orquestra telas, garagem, corrida e renderização
js/config.js     carros, cores, rodas, neon, mundos, níveis e qualidade
js/save.js       progresso salvo (localStorage)
js/track.js      gerador de pistas (peças integradas como "tartaruga" 3D)
js/trackmesh.js  malha da pista, defensas, pórticos, turbo, moedas e pilares
js/physics.js    física arcade (coordenadas de pista no chão, projétil no ar)
js/ai.js         pilotos do computador
js/obstacles.js  martelos, barras giratórias, pistões e caixotes
js/cars.js       modelos procedurais dos carros
js/worlds.js     céu (shader), mar/lava (shader) e cenários dos seis mundos
js/race.js       uma corrida: carros, colisões, colocações, eventos e efeitos
js/camera.js     câmera de perseguição (acompanha loops e parafusos)
js/effects.js    partículas e linhas de velocidade
js/audio.js      motor, efeitos e música procedurais (Web Audio)
js/input.js      toque, mouse e teclado
js/hud.js, ui.js HUD da corrida e telas
js/garage.js     cena 3D da garagem e miniaturas dos carros
```

`?auto` na URL faz o carro do jogador dirigir sozinho (útil para testar pistas).
