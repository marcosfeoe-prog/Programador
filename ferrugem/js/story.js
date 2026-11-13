// Textos do jogo: introdução, capítulos, documentos, falas, objetivos, missões, itens,
// dicas, história de fundo e final. A história e todos os personagens são originais.

export const INTRO = [
  'Outubro de 2004. Serra da Aurora.',
  'Há três semanas, a região inteira parou de responder. O exército fechou as estradas e fala em "contaminação na água".',
  'A última ligação de Helena caiu no meio de uma frase: "Ryan, as pessoas aqui... os olhos delas..."',
  'Ela e a pequena Bia estavam na casa da mãe dela, no Vale dos Corvos.',
  'Seu nome é Ryan. Você furou o bloqueio a pé, pela mata.',
  'E não vai voltar sem a sua família.',
];

// Cartão de abertura e texto de cada capítulo.
export const CHAPTER_TEXT = {
  1: { tag: 'Capítulo 1', title: 'O Vale dos Corvos', lines: INTRO },
  2: {
    tag: 'Capítulo 2',
    title: 'Ferrópolis',
    lines: [
      'Ferrópolis vivia do aço: quarenta mil pessoas, uma siderúrgica e um rio cor de ferrugem.',
      'O comboio que levou Helena e Bia seguiu para o posto de evacuação da Praça da Estação.',
      'Hoje a cidade é silêncio. Só os helicópteros do exército passam por cima, sem nunca pousar.',
      'Em algum lugar entre esses prédios, alguém sabe para onde levaram os evacuados.',
    ],
  },
  3: {
    tag: 'Capítulo 3',
    title: 'A Serra da Aurora',
    lines: [
      'O rádio da delegacia falou do Campo Esperança, na represa. Foi para lá que levaram quem sobrou.',
      'Além da cidade, a serra inteira virou ferrugem: fazendas, estradas, a pedreira e, no coração de tudo, a Siderúrgica Aurora.',
      'Ryan está sozinho de novo.',
      'Mas agora sabe para onde ir.',
    ],
  },
};

// Texto que fecha cada capítulo.
export const CHAPTER_END = {
  1: [
    'O Ferreiro caiu, e com ele o fogo da forja.',
    'A carta de Helena dizia tudo: ela e Bia tinham partido com o comboio do exército para Ferrópolis.',
    'Ferrópolis. A cidade da siderúrgica, a trinta quilômetros dali.',
    'Se houver alguém vivo lá, Ryan vai encontrar.',
  ],
  2: [
    'Ryan deixou o beco antes do amanhecer.',
    'Atrás dele ficaram o fogo do barril, o apito do Zeca e a promessa de voltar.',
    'Na frente, a estrada para a represa e uma serra inteira tomada pela Ferrugem.',
  ],
};

export const ENDING = [
  'O coração de ferro parou de bater. Por toda a serra, os infectados caíram onde estavam.',
  'No fundo do abrigo, atrás de uma porta de aço, uma menina chamou: "Pai?"',
  'Helena e Bia estavam vivas.',
  'Ao amanhecer, o helicóptero que tantas vezes passou sem pousar desceu na siderúrgica.',
  'Na volta, ele baixou sobre Ferrópolis, onde uma fogueira acesa num beco escuro esperava por eles.',
];

// História de fundo (menu "História" na tela título).
export const LORE = [
  {
    title: 'A Serra da Aurora',
    text: 'Uma região de montanhas no interior, com a vila do Vale dos Corvos, a cidade industrial de Ferrópolis e a represa que move a Siderúrgica Aurora, a maior empregadora da serra. Lá, o rio tem cor de ferrugem desde que todos se lembram.',
  },
  {
    title: 'O minério vermelho',
    text: 'Na mina velha do Vale dos Corvos, o ferreiro Bento encontrou um minério vermelho que parecia se consertar sozinho. Não era minério: era uma colônia de bactérias que se alimenta de ferro. No sangue de uma pessoa, ela transforma a hemoglobina em ferrugem e toma conta dos nervos.',
  },
  {
    title: 'A Ferrugem',
    text: 'Os primeiros sinais são febre e gosto de ferro na boca. Depois vêm as veias escuras, os olhos cor de brasa e, por fim, o silêncio: a pessoa não fala mais, só obedece à colônia. A Ferrugem passa pela água, pelo sangue e pelas mordidas. Cada infectado muda de um jeito: uns correm, outros incham, outros crescem.',
  },
  {
    title: 'O Projeto Têmpera',
    text: 'A Siderúrgica Aurora comprou o minério de Bento e criou o Projeto Têmpera, dirigido pelo Dr. Augusto Vidal, para fabricar um aço que se regenera. Os resíduos foram parar no rio. Três meses depois, Ferrópolis amanheceu com febre.',
  },
  {
    title: 'A Operação Cerca',
    text: 'O exército isolou a serra, montou postos de evacuação e o Campo Esperança, na represa. Os helicópteros vigiam a região, mas têm ordem de não pousar dentro do perímetro. Oficialmente, a serra está vazia.',
  },
];

// Bestiário (menu "História").
export const BESTIARY = [
  { name: 'Infectado', text: 'Moradores tomados pela Ferrugem. Andam em grupo, usam ferramentas como arma e às vezes atiram pedras.' },
  { name: 'Rastejante', text: 'Corpo deformado sobre quatro patas compridas. Salta de longe e fica exposto ao cair.' },
  { name: 'Corredor', text: 'Infectado recente e magro. Corre muito e ataca em bando, mas cai com poucos tiros.' },
  { name: 'Brutamontes', text: 'Ex-operário enorme, coberto de chapas. Investe e esmaga o chão. O tumor brilhante nas costas é o ponto fraco.' },
  { name: 'Cuspidor', text: 'Mantém distância e cospe bile ácida que queima o chão. Um tiro na bolsa do pescoço estoura tudo.' },
  { name: 'Inchado', text: 'Lento e cheio de gás. Explode perto de você ou quando morre, levando os vizinhos junto.' },
  { name: 'Gritador', text: 'O grito chama todos os infectados da área, deixa todos mais rápidos e traz Corredores. Mate primeiro.' },
  { name: 'Blindado', text: 'Policial infectado com escudo de choque. Tiros de frente não passam: mire nas pernas ou dê a volta.' },
  { name: 'Incendiário', text: 'Operário da siderúrgica que não para de queimar. Deixa rastro de fogo e é imune às chamas.' },
  { name: 'Arrastado', text: 'Sem as pernas, finge de morto e agarra o tornozelo de quem passa. Aperte Ação várias vezes para se soltar.' },
  { name: 'Cão infectado', text: 'Cães de guarda e de rua. Vêm em matilha, cercam e saltam para morder.' },
  { name: 'Espreitador', text: 'A pele virou espelho de ferrugem. Quase invisível: só aparece sob a luz da lanterna ou bem de perto.' },
];

export const NOTES = {
  aviso: {
    title: 'Aviso da Prefeitura',
    kind: 'print',
    body: `PREFEITURA MUNICIPAL DO VALE DOS CORVOS
AVISO À POPULAÇÃO

Por ordem do prefeito Otávio Brandão:

1. O poço da praça está interditado. A água tem gosto de ferro.

2. Quem apresentar manchas cor de ferrugem na pele deve procurar o ferreiro Bento, na forja do outro lado do rio, para receber o "tratamento".

3. O portão do cemitério ficará trancado até segunda ordem. A chave fica sob a guarda do prefeito, em sua residência, a casa grande do lado leste da estrada.

4. O exército passará com um comboio para levar os moradores sadios até Ferrópolis. Aguardem na praça.

Não saiam de casa depois do anoitecer.`,
  },
  diario: {
    title: 'Diário de um morador',
    kind: 'hand',
    body: `Dia 9. A Rosa não dorme mais. Passa a noite inteira na janela, olhando para o lado da forja. Os olhos dela brilham como brasa.

Dia 11. Hoje ela me chamou pelo nome do meu pai, que morreu há vinte anos. A pele do braço dela está dura e fria, cheia de veias vermelhas.

Dia 12. Eles andam em grupo agora. Não falam, só gemem. Ouvi o ferreiro gritando do outro lado do rio, mais alto que o martelo.

Deixei a escopeta do meu pai em cima da mesa, carregada. Que Deus me perdoe se eu precisar usá-la.`,
  },
  prefeito: {
    title: 'Carta do prefeito',
    kind: 'hand',
    body: `Bento,

O minério vermelho que você trouxe da mina velha está espalhando a doença. Já são quarenta e três "convertidos". Você jurou que o fogo da forja purificaria o metal. Mentiu. E vendeu o resto para aquela gente da Siderúrgica Aurora.

Tranquei o portão do cemitério e guardei a chave comigo. A ponte levadiça só desce se alguém girar as duas manivelas: uma na capela, outra em frente ao mausoléu. Que ninguém as gire.

Se alguém estiver lendo isto, é porque eu também já fui convertido.

Otávio Brandão, prefeito`,
  },
  helena1: {
    title: 'Carta de Helena',
    kind: 'hand',
    body: `Ryan,

Se você estiver lendo isto, é porque veio atrás da gente. Eu sabia.

A mamãe não resistiu. A febre levou ela na terça. A Bia está bem, assustada, mas bem. Ela dorme agarrada no seu casaco velho.

O exército passou de manhã com um comboio. Disseram que vão levar os sadios para um posto de evacuação em Ferrópolis, na Praça da Estação, e de lá para um lugar seguro. Não deixaram ninguém ficar.

Não fica aqui, amor. Essa vila está morrendo.

Vem buscar a gente.

Helena`,
  },
  ferreiro: {
    title: 'Anotações do ferreiro',
    kind: 'hand',
    body: `O ferro canta para mim.

Ele diz que a carne é fraca, que apodrece e esquece. A ferrugem não esquece nada. A ferrugem é eterna.

Cada um que bebe da água do poço vira uma peça na minha bigorna. Eu bato, eles obedecem. Quando o último beber, o vale inteiro será uma só peça forjada.

Os homens da siderúrgica levaram três carroças do minério. Disseram que o doutor tem planos grandes. Eu ri. O ferro também tem.

Eu sou o martelo. Eles são o metal.`,
  },
  relatorio: {
    title: 'Relatório de campo da Equipe 2',
    kind: 'print',
    body: `RELATÓRIO DE CAMPO, EQUIPE 2 (OPERAÇÃO CERCA)
Situação: crítica. Três baixas.

Para quem vier depois:

• Os infectados quase não sentem tiros no tronco. Mirem na CABEÇA ou nos JOELHOS: eles cambaleiam e ficam abertos para um chute.

• Os rastejantes são rápidos, mas ficam expostos logo depois de cada salto.

• O grandalhão da forja tem um núcleo incandescente no peito. É o único lugar onde as balas fazem diferença de verdade. Quando ele cair de joelhos, chegue perto e termine o serviço.

• Os barris vermelhos explodem. Usem isso.

Se alguém encontrar isto: não deixem a forja acesa.

Sgt. Marta Lins`,
  },
  jornal: {
    title: 'Jornal "O Aço de Ferrópolis"',
    kind: 'print',
    body: `O AÇO DE FERRÓPOLIS — EDIÇÃO EXTRA

FEBRE DA FERRUGEM: CIDADE EM QUARENTENA

O Hospital Municipal confirmou 312 internações por uma doença que começa com febre e "gosto de ferro na boca". Pacientes em estado avançado apresentam veias escuras e comportamento agressivo.

Moradores da Vila Operária relatam que a água das torneiras ficou avermelhada depois que a Siderúrgica Aurora passou a despejar resíduos do novo "Projeto Têmpera" no rio.

Em nota, a Siderúrgica Aurora afirma que "não há qualquer relação entre suas atividades e o surto" e que o Dr. Augusto Vidal, diretor de pesquisa, "colabora com as autoridades".

O exército anunciou a Operação Cerca. Moradores sem sintomas devem se apresentar no posto da Praça da Estação.`,
  },
  farmacia: {
    title: 'Anotações do farmacêutico',
    kind: 'hand',
    body: `Os quatro estágios, pelo que vi no balcão:

1. Febre, cansaço, gosto de ferro na boca. Ainda dá tempo. Antibiótico pesado, muita água FERVIDA.

2. Veias escuras nos braços e no pescoço. A pessoa fica fria ao toque. O antibiótico só atrasa.

3. Olhos cor de brasa. Param de dormir. Ficam olhando para o lado da siderúrgica.

4. Não falam mais. Gemem. Andam em grupo. Não são mais quem eram.

Guardei o último kit de antibióticos no depósito dos fundos. Se alguém precisar, está lá. Eu não vou precisar.`,
  },
  ordem: {
    title: 'Ordem da Operação Cerca',
    kind: 'print',
    body: `MINISTÉRIO DA DEFESA — OPERAÇÃO CERCA
ORDEM Nº 14 — RESERVADO

1. Ferrópolis e o Vale dos Corvos ficam isolados. Ninguém sai sem triagem.

2. Civis sem sintomas serão transferidos do posto da Praça da Estação para o CAMPO ESPERANÇA, junto à Represa da Aurora.

3. As aeronaves NÃO estão autorizadas a pousar dentro do perímetro. Missões de reconhecimento apenas.

4. Por solicitação da Siderúrgica Aurora, civis de interesse científico poderão ser encaminhados ao Abrigo Têmpera, sob responsabilidade do Dr. Augusto Vidal.

5. Em caso de colapso do perímetro, destruir a ponte norte.`,
  },
  helena2: {
    title: 'Bilhete de Helena',
    kind: 'hand',
    body: `Ryan,

Deixei isto preso no mural da delegacia, onde deixam os recados das famílias. Rezo para você passar por aqui.

Estamos no posto da estação desde quinta. Hoje separaram as pessoas em dois grupos. O nosso vai para o tal Campo Esperança, na represa. Disseram que a Bia "é um caso interessante" porque ela não pegou a febre, mesmo bebendo a água da vovó.

Eu não gosto do jeito que o médico de jaleco olha para ela.

Represa da Aurora. Vem.

Helena`,
  },
  acougue: {
    title: 'Caderno do açougueiro',
    kind: 'hand',
    body: `A carne fala comigo agora, igual o ferro falava com o Bento.

Pendurei os que vinham roubar. Pendurei os que vinham ajudar. A ferrugem não deixa a carne estragar, sabia? Ela só endurece.

O pessoal do beco acha que eu não sei onde eles moram. Eu sei. O gancho alcança longe.

Ainda tem comida no depósito do mercado. É minha.`,
  },
  registro: {
    title: 'Registro de evacuados do Campo Esperança',
    kind: 'print',
    body: `CAMPO ESPERANÇA — REGISTRO DE TRIAGEM
Folha 31 de 44

...
Santos, Marcos — sadio — alojamento C
Oliveira, Joana — estágio 1 — isolamento
Moraes, Helena — sadia — TRANSFERIDA
Moraes, Beatriz (8 anos) — sadia, IMUNE? — TRANSFERIDA
Paiva, Antônio — estágio 2 — isolamento
...

Observação a lápis: "Transferidas para o Abrigo Têmpera, na siderúrgica, por ordem do Dr. Vidal. A menina não apresenta reação ao contato com o minério. Prioridade máxima."

Observação mais abaixo, em outra letra: "O campo caiu na terceira noite. Que Deus perdoe a gente."`,
  },
  vidal1: {
    title: 'Diário do Dr. Augusto Vidal',
    kind: 'hand',
    body: `Dia 112 do Projeto Têmpera.

O minério não é minério. É uma colônia. Uma bactéria que come ferro e devolve obediência. No aço, ela fecha rachaduras sozinha. No sangue, ela fecha a vontade.

A diretoria quer o aço. O exército quer uma cura. Eu quero entender.

A menina Moraes não reage à colônia. O sangue dela recusa a ferrugem. Se eu entender por quê, posso controlar a Ferrugem em vez de ser controlado por ela.`,
  },
  vidal2: {
    title: 'Última página do Dr. Vidal',
    kind: 'hand',
    body: `Injetei em mim a cepa purificada.

O frio passou. Agora eu vejo o ferro dentro das coisas: nas vigas, nas pessoas, no rio. Tudo é a mesma liga, esperando a têmpera certa.

A colônia pede um coração. A forja do alto-forno será esse coração. E eu serei o ferreiro que o Bento nunca conseguiu ser.

A menina fica comigo. A mãe insiste em ficar com ela. Que fique.`,
  },
  engenheiro: {
    title: 'Bilhete do engenheiro-chefe',
    kind: 'hand',
    body: `Para quem achar meu corpo:

O crachá de acesso nível 3 está comigo. Sem ele, o portão da siderúrgica não abre.

O Gervásio, operador da escavadeira, foi o primeiro aqui da pedreira a virar. A ferrugem juntou o corpo dele com as chapas da máquina. Ficou enorme. Os joelhos e as costas brilham onde a ferrugem é mais nova: é ali que ele sente.

Não tente correr dele em linha reta. Use as pedras.`,
  },
  soldado: {
    title: 'Diário de um soldado',
    kind: 'hand',
    body: `Noite 1. O campo está cheio. Famílias, crianças. Distribuímos sopa e água mineral. Ninguém bebe do rio.

Noite 2. Chegaram dois caminhões de "pacientes" da siderúrgica. O sargento mandou isolar. Um deles mordeu o cabo Ramos.

Noite 3. Eles vieram pela represa. Muitos. Os que estavam no isolamento abriram as grades por dentro.

Se a energia da represa voltar, os portões da siderúrgica destravam. Foi a última coisa que o tenente disse.`,
  },
  helena3: {
    title: 'Último bilhete de Helena',
    kind: 'hand',
    body: `Ryan,

Escrevo no verso de uma ficha de laboratório. O doutor deixou a gente numa sala com porta de aço, no fundo do abrigo. A Bia canta para não ter medo.

Ele mudou. A pele dele brilha por dentro, como brasa. Ele fala com as paredes.

Ouvi os soldados dizendo que tem alguém atravessando a serra sozinho, matando os infectados um por um.

Eu sei que é você.

Estamos aqui. Não desiste.

Helena`,
  },
};

// Objetivos curtos (barra superior). Os de capítulo 2 e 3 vêm das missões.
export const OBJ = {
  c1: {
    start: 'Investigue a vila',
    findKey: 'Encontre a chave do portão na casa do prefeito',
    openGate: 'Abra o portão do cemitério ao norte',
    winches: (n) => `Gire as duas manivelas da ponte (${n}/2)`,
    cross: 'Atravesse a ponte até a forja',
    boss: 'Derrote o Ferreiro',
    end: 'Sobreviva',
  },
  c2: {
    arrive: 'Siga pela avenida em busca de sobreviventes',
    alley: 'Siga o grupo até o beco',
    back: 'Volte ao beco e fale com o grupo',
    leave: 'Despeça-se do grupo',
  },
  c3: {
    final: 'Entre na Siderúrgica Aurora e encontre sua família',
    boss: 'Derrote o Dr. Vidal',
  },
};

export const MISSIONS = {
  2: [
    { id: 'm1', title: 'Remédio para o Jorge', desc: 'Pegue o kit de antibióticos no depósito da Farmácia Central.' },
    { id: 'm2', title: 'Combustível', desc: 'Traga dois galões do posto abandonado para o gerador do beco.' },
    { id: 'm3', title: 'O rádio da delegacia', desc: 'Ligue o rádio da delegacia e escute a frequência do exército.' },
    { id: 'm4', title: 'O Mercado Municipal', desc: 'Derrote o Açougueiro e recupere os mantimentos do mercado.' },
    { id: 'm5', title: 'A saída norte', desc: 'Pegue os explosivos na obra e abra a barricada da ponte norte.' },
  ],
  3: [
    { id: 'm1', title: 'Campo Esperança', desc: 'Encontre o registro de evacuados no campo do exército, perto da represa.' },
    { id: 'm2', title: 'A Pedreira', desc: 'Derrote o Colosso e pegue o crachá do engenheiro-chefe.' },
    { id: 'm3', title: 'A energia da represa', desc: 'Religue os geradores da represa e resista até a energia voltar.' },
  ],
};

export const ITEMS = {
  pistol: { name: 'Pistola P-9', desc: 'Semiautomática 9 mm com mira laser. 12 tiros por pente.' },
  shotgun: { name: 'Escopeta calibre 12', desc: 'De perto, derruba qualquer um. 6 cartuchos.' },
  smg: { name: 'Submetralhadora SM-10', desc: 'Automática: segure o gatilho. 30 tiros, pouco dano por bala.' },
  rifle: { name: 'Rifle de precisão', desc: 'Luneta com zoom ao mirar. Atravessa até três inimigos. 5 tiros.' },
  magnum: { name: 'Revólver .44', desc: 'Dano enorme e atravessa dois inimigos. 6 tiros.' },
  knife: { name: 'Faca de combate', desc: 'Clique sem mirar. Economiza munição e quebra caixas.' },
  ammo_pistol: { name: 'Munição 9 mm', desc: 'Para a Pistola P-9.' },
  ammo_shotgun: { name: 'Cartuchos calibre 12', desc: 'Para a escopeta.' },
  ammo_smg: { name: 'Munição .45', desc: 'Para a submetralhadora.' },
  ammo_rifle: { name: 'Balas de rifle', desc: 'Para o rifle de precisão.' },
  ammo_magnum: { name: 'Balas .44 Magnum', desc: 'Para o revólver.' },
  tonic: { name: 'Tônico', desc: 'Frasco de tônico estimulante. Recupera 45% da vitalidade.' },
  medkit: { name: 'Kit de primeiros socorros', desc: 'Recupera toda a vitalidade.' },
  grenade: { name: 'Granada', desc: 'Explode 1,6 s depois de lançada. Tecla G.' },
  molotov: { name: 'Coquetel molotov', desc: 'Quebra no impacto e deixa o chão em chamas. Tecla G (T alterna).' },
  key: { name: 'Chave do cemitério', desc: 'Chave de ferro pesada com um corvo gravado.' },
  weapon_shotgun: { name: 'Escopeta calibre 12', desc: 'De perto, derruba qualquer um.' },
  weapon_smg: { name: 'Submetralhadora SM-10', desc: 'Automática.' },
  weapon_rifle: { name: 'Rifle de precisão', desc: 'Com luneta.' },
  weapon_magnum: { name: 'Revólver .44', desc: 'Potente.' },
  mission_meds: { name: 'Kit de antibióticos', desc: 'Remédio para o Jorge, que está com febre no beco.' },
  mission_fuel: { name: 'Galão de combustível', desc: 'Para o gerador do beco.' },
  mission_food: { name: 'Mantimentos do mercado', desc: 'Enlatados para o grupo do beco.' },
  mission_dynamite: { name: 'Explosivos da obra', desc: 'Dinamite para abrir a barricada da ponte norte.' },
  mission_registry: { name: 'Registro de evacuados', desc: 'Folha 31: Helena e Bia foram transferidas para o Abrigo Têmpera.' },
  mission_badge: { name: 'Crachá de acesso nível 3', desc: 'Abre o portão da Siderúrgica Aurora.' },
};

export const TIPS = [
  'Tiros na cabeça ou nos joelhos deixam o infectado atordoado. Chegue perto e aperte E para chutar.',
  'O chute derruba todos os inimigos à sua frente, e você não sofre dano durante o golpe.',
  'Barris vermelhos explodem com um tiro. Inchados também, e levam os vizinhos junto.',
  'Use a faca (clique sem mirar) para quebrar caixas e economizar munição.',
  'Com a escopeta, deixe-os chegar perto. Mas não perto demais.',
  'Q faz um giro rápido de 180°.',
  'H usa um tônico na hora, sem abrir a mochila.',
  'Os rastejantes ficam vulneráveis logo depois de saltar.',
  'Mate o Gritador primeiro: o grito dele chama e acelera os outros.',
  'O escudo do Blindado para as balas. Mire nas pernas ou dê a volta.',
  'O Espreitador só aparece na luz da lanterna. Olhe ao redor quando ouvir sussurros.',
  'O Brutamontes tem um tumor brilhante nas costas.',
  'Molotov no chão para cercas de fogo: os infectados atravessam e queimam.',
  'Infectados derrubados se levantam. Termine o serviço com a faca enquanto estão no chão.',
  'No mundo aberto, aperte M para ver o mapa e as missões.',
];

export function rankOf(stats) {
  const acc = stats.shots ? stats.hits / stats.shots : 0;
  let score = 0;
  score += Math.max(0, 60 - stats.time / 150);
  score += acc * 60;
  score -= stats.deaths * 8;
  score += Math.min(30, stats.heads * 0.8);
  if (score >= 95) return 'S';
  if (score >= 70) return 'A';
  if (score >= 45) return 'B';
  return 'C';
}
