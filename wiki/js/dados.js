// Dados da Wiki de Tornados Fictícios.
// Todos os tornados, cidades e eventos aqui são inventados.

export const ESCALA = [
  {
    classe: 'FU',
    nome: 'Sem classe',
    min: null,
    max: null,
    faixa: 'Não classificado',
    cor: '#8a94a6',
    danos:
      'Tornado sem classificação: não atingiu nada que permitisse estimar os ventos, ' +
      'foi observado apenas de longe ou os dados são insuficientes.',
  },
  {
    classe: 'F0',
    nome: 'Fraco',
    min: 60,
    max: 144,
    faixa: '60–144 km/h',
    cor: '#5fb3e6',
    danos: 'Galhos quebrados, placas e antenas tortas, algumas telhas soltas, árvores de raiz rasa tombadas.',
  },
  {
    classe: 'F1',
    nome: 'Moderado',
    min: 145,
    max: 192,
    faixa: '145–192 km/h',
    cor: '#5ccf8a',
    danos: 'Telhados parcialmente arrancados, casas móveis empurradas, carros desviados da estrada, vidraças estouradas.',
  },
  {
    classe: 'F2',
    nome: 'Considerável',
    min: 193,
    max: 265,
    faixa: '193–265 km/h',
    cor: '#f2d04b',
    danos: 'Telhados inteiros arrancados, casas móveis destruídas, árvores grandes partidas ou arrancadas, objetos leves viram projéteis.',
  },
  {
    classe: 'F3',
    nome: 'Severo',
    min: 266,
    max: 322,
    faixa: '266–322 km/h',
    cor: '#f59a3c',
    danos: 'Paredes de casas bem construídas derrubadas, trens tombados, florestas inteiras derrubadas, carros erguidos do chão.',
  },
  {
    classe: 'F4',
    nome: 'Devastador',
    min: 323,
    max: 421,
    faixa: '323–421 km/h',
    cor: '#e5484d',
    danos: 'Casas bem construídas niveladas, estruturas com fundação fraca arremessadas, carros lançados a dezenas de metros.',
  },
  {
    classe: 'F5',
    nome: 'Inacreditável',
    min: 422,
    max: null,
    faixa: '422 km/h ou mais',
    cor: '#b44fe8',
    danos: 'Casas arrancadas das fundações e varridas, carros lançados a mais de 100 m, asfalto arrancado, prédios de concreto gravemente danificados.',
  },
];

/** Classifica uma velocidade de vento (km/h) na escala da wiki. */
export function classificar(vento) {
  if (vento == null || Number.isNaN(vento) || vento < 60) return 'FU';
  for (let i = ESCALA.length - 1; i > 0; i--) {
    if (vento >= ESCALA[i].min) return ESCALA[i].classe;
  }
  return 'FU';
}

export function escalaDe(classe) {
  return ESCALA.find((e) => e.classe === classe) || ESCALA[0];
}

// formato: corda | cone | cilindro | cunha | multivortice | tromba
// aparencia: branco | cinza | poeira | chuva | noite
export const TORNADOS = [
  {
    id: 'santa-luzia-do-norte',
    nome: 'Tornado de Santa Luzia do Norte',
    classe: 'F5',
    vento: 486,
    data: '14 de abril de 2019',
    hora: '18:42–19:51',
    local: 'Santa Luzia do Norte, Planalto Central Fictício',
    duracao: '69 minutos',
    trajetoria: '58,4 km',
    largura: '2,6 km',
    formato: 'cunha',
    aparencia: 'cinza',
    mortes: 41,
    feridos: 612,
    prejuizo: 'R$ 3,2 bilhões',
    imagem: 'imagens/ia/santa-luzia-do-norte.png',
    canva: 'MAHZWLh9W6M',
    prompt:
      'Photorealistic storm chaser photograph of a massive dark grey wedge tornado over flat farmland at dusk, rotating supercell wall cloud above, debris cloud at the base, lightning in the distance',
    resumo:
      'O Tornado de Santa Luzia do Norte foi uma cunha colossal que cruzou o Planalto Central Fictício ao entardecer, ' +
      'tornando-se o tornado mais intenso já registrado na wiki e o único com ventos estimados acima de 480 km/h.',
    secoes: [
      {
        titulo: 'Contexto meteorológico',
        texto:
          'Na tarde de 14 de abril, uma frente fria lenta encontrou uma massa de ar extremamente úmida vinda do norte. ' +
          'O CAPE passou de 4.800 J/kg e a helicidade nos primeiros 3 km chegou a 520 m²/s². ' +
          'Às 17:50 uma supercélula isolada desenvolveu uma bigorna de mais de 15 km de altura e um eco em gancho bem definido.',
      },
      {
        titulo: 'Trajetória',
        texto:
          'O funil tocou o solo às 18:42 como um cone estreito a oeste da Fazenda Boa Esperança. ' +
          'Em apenas quatro minutos alargou-se para uma cunha de mais de 1 km, alcançando 2,6 km de largura ' +
          'ao cruzar a rodovia BR-000. Atingiu o bairro Jardim Primavera às 19:12 e seguiu para nordeste ' +
          'até se transformar em corda e dissipar perto do Córrego Fundo.',
      },
      {
        titulo: 'Danos',
        texto:
          'Bairros inteiros foram varridos até as fundações. Um caminhão-tanque foi encontrado a 420 m de onde estava estacionado ' +
          'e trechos de asfalto foram arrancados da rodovia. Os danos ao silo de concreto da Cooperativa Agrícola ' +
          'foram o principal indicador para a classificação F5.',
      },
      {
        titulo: 'Legado',
        texto:
          'Após o desastre, Santa Luzia do Norte instalou a primeira rede de sirenes da região e construiu abrigos ' +
          'subterrâneos em todas as escolas. O dia 14 de abril passou a ser o "Dia da Prevenção" no município.',
      },
    ],
  },
  {
    id: 'vale-sereno',
    nome: 'Tornado de Vale Sereno',
    classe: 'FU',
    vento: null,
    data: '2 de novembro de 2021',
    hora: '15:07–15:09',
    local: 'Vale Sereno, Serra do Orvalho',
    duracao: '2 minutos',
    trajetoria: '0,3 km',
    largura: '15 m',
    formato: 'corda',
    aparencia: 'cinza',
    mortes: 0,
    feridos: 0,
    prejuizo: 'Nenhum',
    imagem: 'imagens/ia/vale-sereno.png',
    canva: 'MAHZWLLv6SE',
    prompt:
      'Photorealistic photograph of a faint, thin translucent funnel cloud barely touching an empty green pasture under a low grey storm cloud base, light rain, calm countryside, no damage',
    resumo:
      'O Tornado de Vale Sereno foi um vórtice fraco e breve que tocou um pasto vazio. ' +
      'Como não atingiu nenhuma estrutura, nunca recebeu uma classificação — é o exemplo clássico de tornado FU.',
    secoes: [
      {
        titulo: 'Observação',
        texto:
          'Um grupo de estudantes de meteorologia em excursão filmou o funil translúcido descendo de uma nuvem de base baixa. ' +
          'A poeira e a grama levantadas no solo confirmaram a circulação em contato com o chão por cerca de 2 minutos.',
      },
      {
        titulo: 'Por que "sem classe"?',
        texto:
          'A classificação depende dos danos causados. O tornado cruzou apenas pastagem, sem árvores, cercas ou construções. ' +
          'Sem indicadores de dano, os avaliadores registraram o evento como FU (Sem classe).',
      },
    ],
  },
  {
    id: 'campo-lindo',
    nome: 'Tornado de Campo Lindo',
    classe: 'F0',
    vento: 118,
    data: '23 de outubro de 2018',
    hora: '16:20–16:31',
    local: 'Campo Lindo, Vale do Trigo Dourado',
    duracao: '11 minutos',
    trajetoria: '3,8 km',
    largura: '40 m',
    formato: 'corda',
    aparencia: 'branco',
    mortes: 0,
    feridos: 0,
    prejuizo: 'R$ 90 mil',
    imagem: 'imagens/ia/campo-lindo.png',
    canva: 'MAHZWPdEtQ8',
    prompt:
      'Photorealistic photograph of a thin white rope tornado snaking down from a bright cloud base over golden wheat fields on a sunny afternoon, small dust whirl at the ground, blue sky behind',
    resumo:
      'O Tornado de Campo Lindo foi uma corda branca e fotogênica que serpenteou sobre plantações de trigo sob céu quase limpo. ' +
      'É um dos tornados mais fotografados da wiki.',
    secoes: [
      {
        titulo: 'Formação',
        texto:
          'Diferente da maioria dos tornados, Campo Lindo não veio de uma supercélula clássica: formou-se sob um cúmulo congestus ' +
          'que cresceu sobre uma linha de convergência de ventos, num processo parecido com o de um "landspout".',
      },
      {
        titulo: 'Danos',
        texto:
          'Derrubou um trecho de cerca, entortou a antena de uma casa de fazenda e espalhou fardos de feno. ' +
          'Os ventos foram estimados em 118 km/h, dentro da faixa F0.',
      },
    ],
  },
  {
    id: 'ribeirao-das-garcas',
    nome: 'Tornado de Ribeirão das Garças',
    classe: 'F1',
    vento: 176,
    data: '9 de março de 2022',
    hora: '17:03–17:22',
    local: 'Ribeirão das Garças, Planície do Leste',
    duracao: '19 minutos',
    trajetoria: '9,1 km',
    largura: '120 m',
    formato: 'cone',
    aparencia: 'cinza',
    mortes: 0,
    feridos: 4,
    prejuizo: 'R$ 1,7 milhão',
    imagem: 'imagens/ia/ribeirao-das-garcas.png',
    canva: 'MAHZWHt-hqY',
    prompt:
      'Photorealistic photograph of a grey cone-shaped tornado crossing a small rural road near a farmhouse with tin roof, trees bending, dark supercell sky, storm chaser perspective',
    resumo:
      'O Tornado de Ribeirão das Garças foi um cone cinza que cruzou a estrada vicinal RG-12, ' +
      'arrancando telhados de zinco e derrubando dezenas de árvores.',
    secoes: [
      {
        titulo: 'Trajetória',
        texto:
          'Formou-se a sudoeste do povoado, cruzou a RG-12 diante de caçadores de tempestade e seguiu ' +
          'pelas margens do ribeirão antes de recuar para a nuvem parede.',
      },
      {
        titulo: 'Danos',
        texto:
          'Doze casas perderam parte do telhado, um galpão de madeira desabou e um carro foi empurrado para fora da pista. ' +
          'Quatro pessoas tiveram ferimentos leves causados por estilhaços de vidro.',
      },
    ],
  },
  {
    id: 'aguas-claras',
    nome: 'Tornado de Águas Claras',
    classe: 'F1',
    vento: 158,
    data: '30 de janeiro de 2020',
    hora: '13:44–13:58',
    local: 'Lago de Águas Claras, Região dos Lagos Azuis',
    duracao: '14 minutos',
    trajetoria: '4,6 km (2,9 km sobre a água)',
    largura: '90 m',
    formato: 'tromba',
    aparencia: 'branco',
    mortes: 0,
    feridos: 2,
    prejuizo: 'R$ 640 mil',
    imagem: 'imagens/ia/aguas-claras.png',
    canva: 'MAHZWGmE3YU',
    prompt:
      'Photorealistic photograph of a tornado waterspout moving from a large lake onto the shore of a small lakeside town, spray ring at the base, grey green sky',
    resumo:
      'O Tornado de Águas Claras começou como uma tromba d\'água tornádica sobre o lago e avançou sobre a orla da cidade, ' +
      'virando barcos e danificando quiosques.',
    secoes: [
      {
        titulo: 'Sobre a água',
        texto:
          'Banhistas viram um anel de borrifos girar sobre o lago antes de o funil branco se tornar visível. ' +
          'A tromba percorreu quase 3 km sobre a água, sugando um anel de spray de até 30 m de altura.',
      },
      {
        titulo: 'Chegada à orla',
        texto:
          'Ao tocar a margem, o vórtice virou onze barcos no píer, arrancou a cobertura de quatro quiosques e ' +
          'derrubou postes da avenida beira-lago. Ventos estimados em 158 km/h — classe F1.',
      },
    ],
  },
  {
    id: 'nova-aurora',
    nome: 'Tornado de Nova Aurora',
    classe: 'F2',
    vento: 238,
    data: '5 de setembro de 2017',
    hora: '14:12–14:40',
    local: 'Nova Aurora, Chapada Vermelha',
    duracao: '28 minutos',
    trajetoria: '17,5 km',
    largura: '310 m',
    formato: 'cilindro',
    aparencia: 'poeira',
    mortes: 1,
    feridos: 27,
    prejuizo: 'R$ 24 milhões',
    imagem: null,
    prompt:
      'Photorealistic photograph of a brown dust-wrapped cylindrical tornado over dry red soil plains, large dust cloud swirling at the base, sun backlighting, debris flying',
    resumo:
      'O Tornado de Nova Aurora foi um cilindro envolto em poeira vermelha que atravessou a Chapada Vermelha no auge da estação seca, ' +
      'reduzindo a visibilidade a quase zero em sua passagem.',
    secoes: [
      {
        titulo: 'Aparência',
        texto:
          'O solo seco e solto da chapada fez com que o tornado ficasse totalmente envolto por uma nuvem de poeira avermelhada. ' +
          'Testemunhas descreveram "uma parede de terra girando".',
      },
      {
        titulo: 'Danos',
        texto:
          'Telhados inteiros foram arrancados no distrito industrial e três casas móveis foram destruídas. ' +
          'Uma linha de transmissão teve quatro torres dobradas.',
      },
    ],
  },
  {
    id: 'serra-partida',
    nome: 'Tornado de Serra Partida',
    classe: 'F3',
    vento: 304,
    data: '19 de maio de 2015',
    hora: '19:05–19:38',
    local: 'Serra Partida, Colinas do Sul',
    duracao: '33 minutos',
    trajetoria: '24,2 km',
    largura: '780 m',
    formato: 'multivortice',
    aparencia: 'cinza',
    mortes: 6,
    feridos: 143,
    prejuizo: 'R$ 210 milhões',
    imagem: null,
    prompt:
      'Photorealistic photograph of a large multiple-vortex tornado with several sub-vortices rotating around the main funnel, crossing hilly farmland, dark stormy sky, debris clouds',
    resumo:
      'O Tornado de Serra Partida foi um tornado multivórtice que subiu e desceu as colinas do sul, ' +
      'com até seis vórtices de sucção girando ao redor do centro.',
    secoes: [
      {
        titulo: 'Estrutura multivórtice',
        texto:
          'Vídeos mostram vórtices de sucção nascendo e morrendo em segundos ao redor do funil principal. ' +
          'Os danos mais intensos aparecem em faixas estreitas e curvas, típicas desses sub-vórtices.',
      },
      {
        titulo: 'Danos',
        texto:
          'Um trem de carga com 14 vagões foi tombado e casas de alvenaria perderam paredes externas. ' +
          'Uma floresta de eucaliptos de 200 hectares foi derrubada.',
      },
    ],
  },
  {
    id: 'pedra-azul',
    nome: 'Tornado de Pedra Azul',
    classe: 'F4',
    vento: 377,
    data: '27 de abril de 2016',
    hora: '16:55–17:46',
    local: 'Pedra Azul, Vale das Tormentas',
    duracao: '51 minutos',
    trajetoria: '41,0 km',
    largura: '1,4 km',
    formato: 'cunha',
    aparencia: 'chuva',
    mortes: 19,
    feridos: 288,
    prejuizo: 'R$ 1,1 bilhão',
    imagem: null,
    prompt:
      'Photorealistic photograph of a huge dark rain-wrapped wedge tornado partially hidden behind curtains of heavy rain, approaching a small town with power flashes, ominous green-grey sky',
    resumo:
      'O Tornado de Pedra Azul foi uma cunha envolta pela chuva, praticamente invisível para quem estava no caminho. ' +
      'Os clarões de transformadores explodindo foram o único sinal visível de sua aproximação.',
    secoes: [
      {
        titulo: 'Um tornado escondido',
        texto:
          'Cortinas de chuva pesada giravam ao redor do funil, escondendo-o por completo. ' +
          'Muitas vítimas relataram ter ouvido "um trem" antes de qualquer coisa ser vista.',
      },
      {
        titulo: 'Danos',
        texto:
          'Casas bem construídas foram niveladas no bairro Alto da Pedra e carros foram arremessados a mais de 50 m. ' +
          'A torre da igreja matriz, de 1912, desabou.',
      },
    ],
  },
  {
    id: 'itavera',
    nome: 'Tornado Noturno de Itaverá',
    classe: 'F4',
    vento: 352,
    data: '11 de dezembro de 2023',
    hora: '23:18–23:57',
    local: 'Itaverá, Planalto dos Ventos',
    duracao: '39 minutos',
    trajetoria: '29,7 km',
    largura: '650 m',
    formato: 'cilindro',
    aparencia: 'noite',
    mortes: 12,
    feridos: 97,
    prejuizo: 'R$ 480 milhões',
    imagem: null,
    prompt:
      'Photorealistic night photograph of a large stovepipe tornado illuminated by a bright lightning flash over open fields, city lights glowing faintly on the horizon',
    resumo:
      'O Tornado Noturno de Itaverá atingiu a periferia da cidade perto da meia-noite e só foi visto graças aos relâmpagos. ' +
      'Tornou-se o principal argumento para a criação de alertas por celular na região.',
    secoes: [
      {
        titulo: 'Na escuridão',
        texto:
          'Tornados noturnos são especialmente perigosos: a maioria das pessoas está dormindo e o funil é invisível. ' +
          'Um único relâmpago, fotografado por um morador, revelou o cilindro largo a menos de 2 km da cidade.',
      },
      {
        titulo: 'Danos',
        texto:
          'Um conjunto habitacional de 40 casas foi nivelado e um galpão logístico perdeu toda a estrutura metálica. ' +
          'Ventos estimados em 352 km/h.',
      },
    ],
  },
];

export const FORMATOS = {
  corda: 'Corda',
  cone: 'Cone',
  cilindro: 'Cilindro',
  cunha: 'Cunha',
  multivortice: 'Multivórtice',
  tromba: "Tromba d'água tornádica",
};

export const APARENCIAS = {
  branco: 'Branco',
  cinza: 'Cinza',
  poeira: 'Envolto de poeira',
  chuva: 'Envolto pela chuva',
  noite: 'Noturno',
};
