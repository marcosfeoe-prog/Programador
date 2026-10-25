# Gramado — Universo do Futebol

Um universo de futebol **100% fictício** que roda no navegador (PC e celular): um
portal de notícias vivo, com cinco ligas, uma Copa 5 estrelas, torneios e prêmios
criados por você e um **modo protagonista** em que você vira jogador e tenta chegar
ao topo do futebol mundial. Os bonecos 3D usam [three.js](https://threejs.org/) e são
gerados do zero (sem arquivos de imagem).

## Como abrir

Na raiz do repositório:

```bash
npm start      # http://localhost:8080/futebol/
```

O progresso é salvo automaticamente no navegador (há exportar/importar em **Ajustes**).

## O universo

| Liga | Ranking de competitividade | Importância |
|---|---|---|
| The Premier League | 1ª (a mais competitiva do mundo) | ★★★★★ |
| La Liga Série A | 2ª | ★★★★★ |
| Liga Brasileira A1 | 3ª | ★★★★ |
| França League One | 4ª | ★★★★ |
| Primera Liga Argentina | 5ª | ★★★ |

- Cada liga tem **10 clubes com 11 titulares** (4-3-3), técnico, estádio, torcida e cores
  próprias. Turno e returno: 18 rodadas.
- **Copa Suprema dos Campeões** (★★★★★): os 3 primeiros de cada liga + o 4º da Premier,
  em mata-mata com final em campo neutro.
- Jogadores têm nacionalidade, idade, posição, atributos, potencial, personalidade
  (Temperamental, Baladeiro, Marrento…), forma, moral, fama, valor de mercado e legado.
  Envelhecem, evoluem, se aposentam e são substituídos por jovens da base.
- **Polêmicas**: baladas, brigas com o técnico, posts provocativos, áudios vazados,
  agressões com suspensão, investigações de apostas (com desfecho semanas depois)…
  A chance depende da personalidade e da fama de cada jogador.
- **Mercado**: rumores semanais e janelas de transferência na rodada 10 e no fim da
  temporada; técnicos são demitidos após sequências de derrotas.

## Notícias generativas

A cada semana, um motor de texto gera matérias em estilo jornalístico, assinadas por
veículos e jornalistas fictícios: relato das partidas com gols, notas, melhor em campo e
falas dos técnicos, resumo de rodadas, lesões, polêmicas, transferências, recordes,
colunas sobre a corrida pela Bola de Ouro, títulos e galas de premiação. Perfis de
jogadores trazem relatório de olheiro gerado a partir dos atributos.

**Redação com IA (opcional):** em **Ajustes**, informe uma chave da API da Anthropic
para reescrever qualquer matéria ou gerar biografias com o Claude (padrão:
`claude-opus-5-5`). A chave fica só no seu navegador e é enviada direto para a Anthropic.

## Torneios criados pelo usuário

Em **Torneios → Criar torneio**: nome, importância (1 a 5 estrelas), formato (pontos
corridos ou mata-mata), descrição e participantes — **no mínimo 10 clubes**, escolhidos
entre os existentes ou criados na hora (nome, cidade, cores, padrão da camisa, nível e
país dos 11 jogadores). O torneio joga uma rodada por semana, coroa um campeão, elege o
craque do torneio e pode se repetir a cada temporada.

## Prêmios por estrelas

| Estrelas | Nível | Exemplos padrão |
|---|---|---|
| ★ | Regional | Craque da Rodada, Revelação Regional, Craque da Torcida |
| ★★ | Simples | Artilheiro da Liga, Rei das Assistências, Luva de Ouro da Liga |
| ★★★ | Internacional | Jogador do Mês, Gol do Ano, Promessa de Ouro, Muralha Internacional |
| ★★★★ | Cobiçado | Melhor Jogador da Temporada da Liga, Chuteira de Ouro, Luva Lendária |
| ★★★★★ | Lendário | Bola de Ouro, Coroa Mundial, Craque da Copa Suprema |

Em **Prêmios → Criar prêmio** você define nome, estrelas, valor em dinheiro, critério
(gols, assistências, nota, jovem, goleiro, defensor, voto popular, gol mais bonito,
desempenho geral), abrangência (mundial, cada liga, uma liga ou um torneio) e frequência
(mensal ou fim de temporada). Os prêmios são entregues automaticamente.

## Modo protagonista

Em **Carreira**, crie seu jogador em 4 passos, com prévia 3D ao vivo:

1. **Identidade** — nome, apelido, nacionalidade, posição, pé, idade, número e personalidade.
2. **Aparência** — tom de pele, 15 cortes de cabelo, cor do cabelo e dos olhos, barba,
   altura, porte físico e cor da chuteira.
3. **Uniforme** — o do clube ou um personalizado (cores, padrão e patrocínio).
4. **Clube e talento** — qualquer clube das 5 ligas; talento Promessa, Prodígio ou Fenômeno.

Depois, a cada semana: escolha o foco do treino (ou descanse), dispute a vaga de titular,
responda a coletivas, convites, patrocínios e dilemas (que podem virar polêmica), e aceite
propostas de clubes maiores nas janelas. O painel **Rumo ao topo** acompanha 17
conquistas — do primeiro gol à Bola de Ouro e ao nº 1 do ranking mundial.

## TeleChat (rede social)

Em **TeleChat**, os jogadores postam toda semana: gols, vitórias, derrotas, expulsões,
lesões, transferências, prêmios, títulos, polêmicas, treinos e vida pessoal. Astros e
jogadores pouco conhecidos postam; a quantidade de curtidas e seguidores depende da fama.
O texto de cada post segue a personalidade (o Marrento provoca, o Influencer usa hashtags,
o Tímido escreve pouco, o Festeiro fala de resenha…).

Com um protagonista criado, você pode:
- **postar** (posts provocativos podem virar polêmica na imprensa);
- **seguir jogadores**: astros mundiais quase nunca seguem de volta; jogadores pouco
  conhecidos quase sempre seguem. Companheiros de time, mesma nacionalidade e boas
  conversas aumentam a chance. Alguns seguem na hora, outros na semana seguinte;
- **mandar mensagens**: a chance de resposta segue a mesma lógica, e a resposta tem o tom
  da personalidade do jogador (elogio, pedido de dica, convite, provocação…). Com a
  redação com IA ativada, o Claude escreve a resposta no estilo do jogador.

## Criar jogador

Em **Criar jogador**, adicione ao universo lendas, craques ou promessas: nome,
nacionalidade, idade, posição, overall, potencial, fama, personalidade, aparência,
clube (titular ou reserva), jogos, gols, assistências, quantas vezes ganhou cada prêmio
e cada título (ligas, Copa Suprema, seus torneios e copas de seleções). Há modelos
prontos (Lenda mundial, Craque, Promessa, Jogador comum, Veterano).

## Envelhecimento

A partir dos 31 anos o rendimento começa a cair. **Aos 33 anos ou mais**, overall e
potencial despencam a cada temporada (o potencial cai de 7 a 12 pontos por ano) e o
treino rende muito menos, inclusive para o protagonista.

## Estrutura

```
futebol/
  index.html, css/style.css, icon.svg, manifest.webmanifest
  js/data.js         países, nomes, ligas, clubes, veículos de imprensa
  js/world.js        geração do mundo, jogadores, aparência, valores
  js/match.js        simulação de partidas (gols, cartões, lesões, notas)
  js/tournaments.js  tabelas, calendário, Copa Suprema e torneios do usuário
  js/season.js       semanas, prêmios, mercado, polêmicas, envelhecimento
  js/awards.js       prêmios por estrelas e apuração
  js/news.js         gerador de notícias; js/text.js motor de texto; js/bio.js perfis
  js/career.js       modo protagonista
  js/telechat.js     rede social TeleChat; js/creator.js criador de jogadores
  js/avatar3d.js     bonecos 3D (three.js) e miniaturas
  js/ai.js           redação opcional com a API do Claude
  js/ui.js, views.js, views2.js, views3.js, main.js   interface e rotas
```
