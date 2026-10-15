// Subnível 0.1 — quem mora na Estação Zênite e o que essa gente tem a dizer.
// Cada fala depende do andamento da tarefa (fusíveis → bobinas → elevador).

export const NPC_DEFS = [
  {
    id: 'ada',
    name: 'Ada Okoro',
    role: 'Supervisora',
    x: 3.2,
    z: -10.2,
    yaw: 0.25,
    h: 1.76,
    look: { skin: '#7a4a32', hair: '#1a1210', hairStyle: 'bun', suit: '#2c4a6e', accent: '#e8b04a', female: true, arms: 'tablet', holds: { kind: 'tablet', hand: 'l' }, eyes: '#2a1a10' },
  },
  {
    id: 'vega',
    name: 'Lia Vega',
    role: 'Engenheira-chefe',
    x: -4.6,
    z: -62.8,
    yaw: 0.2,
    h: 1.68,
    look: { skin: '#d9a77f', hair: '#6b2e1a', hairStyle: 'long', suit: '#a8561c', accent: '#2b2f36', female: true, arms: 'crossed', goggles: true, fringe: true, eyes: '#3d6b3a' },
  },
  {
    id: 'lucio',
    name: 'Lúcio Brandão',
    role: 'Operador da rede',
    x: 39,
    z: -75.4,
    yaw: Math.PI,
    h: 1.8,
    pose: 'sit',
    look: { skin: '#c48a5e', hair: '#2b1d14', hairStyle: 'short', suit: '#3b4a3a', accent: '#9fd36b', arms: 'desk', glasses: '#202428', beard: 'rgba(40,25,15,0.45)' },
  },
  {
    id: 'iara',
    name: 'Iara Tupã',
    role: 'Astrônoma',
    x: -40.4,
    z: -9.6,
    yaw: -Math.PI / 2 - 0.3,
    h: 1.62,
    look: { skin: '#b07a52', hair: '#0e0a08', hairStyle: 'long', suit: '#4a3a66', accent: '#d9c9ff', female: true, arms: 'behind', eyes: '#1b120c' },
  },
  {
    id: 'bento',
    name: 'Bento Salgado',
    role: 'Cozinheiro',
    x: 27,
    z: -28.9,
    yaw: 0,
    h: 1.83,
    look: { skin: '#e2b896', hair: '#8a8a86', hairStyle: 'shaved', suit: '#e6e3dc', accent: '#b53a2e', apron: 0xf4f1ea, cap: true, beard: 'rgba(110,100,90,0.55)', holds: { kind: 'cup', hand: 'r' } },
  },
  {
    id: 'viajante',
    name: 'O Viajante',
    role: 'Também veio pela porta',
    x: -44.6,
    z: -66.2,
    yaw: 0.9,
    h: 1.75,
    pose: 'sit',
    look: { skin: '#cfa384', hair: '#4a3a2a', hairStyle: 'curly', suit: '#5a5248', accent: '#c9b98a', arms: 'down', beard: 'rgba(60,45,30,0.6)', eyes: '#4a6070' },
  },
  {
    id: 'z7',
    name: 'Z-7',
    role: 'Robô zelador',
    robot: true,
    path: [
      [7, -5],
      [7, -25],
      [-7, -25],
      [-7, -5],
    ],
  },
];

const FUSE_HINT =
  'Um ficou no Mirante, a oeste, com a Iara — perto do telescópio. Outro está nos alojamentos, no fundo do Refeitório, a leste. ' +
  'O último caiu em alguma caixa do hangar: atravesse a passarela ao norte, a Sala dos Geradores, e vire à esquerda.';

export function talkTo(L, npc) {
  const fn = TALK[npc.id];
  if (fn) fn(L, npc);
}

const TALK = {
  ada(L, n) {
    const g = L.game;
    const st = L.st;
    const say = (t, c) => L.say(n, t, c);
    const lore = {
      text: 'O que é este lugar?',
      fn: () =>
        say(
          'A Estação Zênite, Usina Orbital 7. Ninguém sabe em volta de quê ela orbita: os planetas lá fora não constam em mapa nenhum. ' +
            'Acordamos aqui há onze anos, com a usina já ligada. Produzimos energia para… bem, achamos que é para as luzes do Saguão. Aquele zumbido amarelo? É nosso.',
          [door, back],
        ),
    };
    const door = {
      text: 'E a porta de madeira?',
      fn: () =>
        say(
          'Ela aparece e some. Às vezes alguém atravessa: quase sempre com essa mesma cara de quem andou semanas no carpete molhado. ' +
            'Você é o primeiro em dois anos. O rastro vermelho… melhor não perguntar de quem é.',
          [lore, back],
        ),
    };
    const back = { text: 'Voltar', fn: () => TALK.ada(L, n) };
    if (!g.objectiveDone('talk')) {
      say(
        'Ei… calma, calma. Você veio pela porta de madeira, não foi? Respire. Aqui é a Estação Zênite e você está seguro. ' +
          'Sou a Ada, a supervisora. Escute: a usina está fora de fase desde a última tempestade solar, e sem energia o elevador de serviço não desce. ' +
          'Se quiser sair daqui, vai precisar ajudar a gente.',
        [
          {
            text: 'Como eu ajudo?',
            fn: () => {
              say(
                'Precisamos de três fusíveis de plasma. ' + FUSE_HINT + ' Leve os três para a engenheira Vega, na Sala dos Geradores. Ela cuida do resto.',
                [{ text: 'Pode deixar.', fn: () => g.completeObjective('talk', 'A Ada explicou o plano: três fusíveis para a engenheira Vega.') }],
              );
            },
          },
          lore,
          door,
        ],
      );
      return;
    }
    if (!g.objectiveDone('deliver')) {
      const left = 3 - st.fuses;
      say(
        left > 0
          ? `Faltam ${left} fusível${left > 1 ? 'is' : ''}. ${FUSE_HINT}`
          : 'Os três fusíveis! Corra até a Vega, na Sala dos Geradores: siga a passarela de vidro ao norte.',
        [lore, door, { text: 'Até já.' }],
      );
      return;
    }
    if (!g.objectiveDone('coils')) {
      say('A Vega instalou os fusíveis? Então falta recalibrar as três bobinas. Os painéis ficam na base de cada uma.', [lore, { text: 'Estou indo.' }]);
      return;
    }
    if (!g.objectiveDone('control')) {
      say(
        'Sentiu isso? A estação inteira respirou fundo. Obrigada. Fale com o Lúcio, na Sala de Controle — a leste da Sala dos Geradores — para liberar o elevador.',
        [lore, { text: 'Vou lá.' }],
      );
      return;
    }
    say(
      'Então é adeus. Leve um pouco desta luz com você, lá embaixo vai precisar. E se encontrar a porta de madeira de novo… sempre haverá café quente aqui.',
      [{ text: 'Obrigado, Ada.' }],
    );
  },

  vega(L, n) {
    const g = L.game;
    const st = L.st;
    const say = (t, c) => L.say(n, t, c);
    const lore = {
      text: 'O que essas bobinas alimentam?',
      fn: () =>
        say(
          'Tudo e nada. A energia sai por cabos que atravessam a parede e simplesmente somem. ' +
            'Uma vez segui um deles com uma lanterna, por um duto de manutenção. Acabei num corredor amarelo, com carpete molhado e lâmpadas zumbindo. Voltei correndo.',
          [{ text: 'Voltar', fn: () => TALK.vega(L, n) }],
        ),
    };
    if (!g.objectiveDone('deliver')) {
      if (st.fuses >= 3) {
        say(
          'Três fusíveis de plasma, intactos! Me dá aqui… pronto, encaixados. Agora vá até os painéis na base de cada bobina e ponha a frequência em fase. ' +
            'O alvo é 60,0 kHz: se a leitura estiver acima, diminua; se estiver abaixo, aumente. Eu fico de olho nas leituras daqui.',
          [
            {
              text: 'Entendido.',
              fn: () => {
                st.fusesHeld = 0;
                g.inventory.remove('fusivel', 3);
                g.completeObjective('deliver', 'A engenheira Vega instalou os fusíveis. Agora as bobinas.');
              },
            },
          ],
        );
      } else if (!g.objectiveDone('talk')) {
        say(
          'Cuidado onde pisa — essas bobinas estão cuspindo arco em tudo. Você é novo? Fale com a Ada no Átrio primeiro, ela organiza a bagunça por aqui.',
          [lore, { text: 'Certo.' }],
        );
      } else {
        say(
          `Tem ${st.fuses} fusíve${st.fuses === 1 ? 'l' : 'is'}? Preciso dos três: o circuito é em série, se um faltar, tudo falha. ` + FUSE_HINT,
          [lore, { text: 'Vou buscar.' }],
        );
      }
      return;
    }
    if (!g.objectiveDone('coils')) {
      const left = st.coils.filter((c) => !c).length;
      say(
        `Faltam ${left}. O painel fica na base de cada bobina, virado para a entrada. Alvo: 60,0 kHz. Acima, diminua; abaixo, aumente. E não encoste no anel de cobre.`,
        [lore, { text: 'Ok.' }],
      );
      return;
    }
    say(
      'Ouviu? Esse zumbido limpo é o som de uma estação viva. Bom trabalho. O Lúcio precisa confirmar a carga na Sala de Controle, pela porta leste.',
      [lore, { text: 'Valeu, Vega.' }],
    );
  },

  lucio(L, n) {
    const g = L.game;
    const say = (t, c) => L.say(n, t, c);
    const who = {
      text: 'Quem é você?',
      fn: () =>
        say('Lúcio, operador do turno da noite. Aqui todo turno é da noite, então sou o operador de todos os turnos. Café?', [
          { text: 'Voltar', fn: () => TALK.lucio(L, n) },
        ]),
    };
    if (!g.objectiveDone('coils')) {
      say(
        'Opa! Desculpa a bagunça, o painel está cheio de alarme. Enquanto as bobinas não entrarem em fase eu não libero nada — nem o elevador, nem a máquina de café.',
        [who, { text: 'Já volto.' }],
      );
      return;
    }
    if (!g.objectiveDone('control')) {
      say('Leituras… estáveis. Cem por cento! Você e a Vega fizeram mágica. Quer que eu libere o elevador de serviço do hangar?', [
        {
          text: 'Libere o elevador.',
          fn: () => {
            g.completeObjective('control', 'Elevador de serviço liberado. Ele desce para o Nível 1.');
            L.elevatorReady = true;
            g.audio.play('ding', { gain: 0.5 });
            say('Feito. Ele desce para os níveis de manutenção e sai na zona habitável — o Nível 1. Boa viagem. Se vir alguém no caminho, diga que a Zênite ainda está acesa.', [
              { text: 'Pode deixar.' },
            ]);
          },
        },
        who,
      ]);
      return;
    }
    say('O elevador está te esperando no hangar, parede oeste. Vai lá, antes que a porta de madeira mude de ideia.', [who, { text: 'Tchau, Lúcio.' }]);
  },

  iara(L, n) {
    const say = (t, c) => L.say(n, t, c);
    const st = L.st;
    const back = { text: 'Voltar', fn: () => TALK.iara(L, n) };
    say(
      'Está vendo aquele gigante cor de âmbar? Chamo de Orfeu. Os anéis giram no sentido contrário ao que deveriam. E a estrela… nunca se põe. Estamos parados em relação a ela há onze anos.',
      [
        {
          text: 'Que planetas são esses?',
          fn: () =>
            say(
              'Orfeu, o gigante com anéis, a oeste. Tétis Rubra, o vermelho ao norte — dá para ver da janela dos geradores. Vésper, a lua de gelo, a leste, pela janela do refeitório. ' +
                'E a Nix, a luazinha cinzenta, só aparece pela baía do hangar. Nenhum deles tem nome em catálogo nenhum. Os nomes são meus.',
              [back],
            ),
        },
        {
          text: 'Você viu um fusível de plasma?',
          fn: () =>
            say(
              L.taken.has('z:fuse:0')
                ? 'Você já pegou — estava na caixa de manutenção, do lado do telescópio. Eu usava de peso de papel. Não conta para a Vega.'
                : 'Ah… o cilindro que brilha? Eu usava de peso de papel, perdão. Está na caixa de manutenção, do lado do telescópio.',
              [back],
            ),
        },
        {
          text: 'Posso olhar pelo telescópio?',
          fn: () => {
            st.scope = true;
            say(
              'Claro. Está apontado para Tétis Rubra. Repare na planície perto do equador: tem um retângulo amarelo-pálido lá embaixo, do tamanho de uma cidade. ' +
                'Às vezes ele pisca, como uma lâmpada fluorescente com defeito. Eu não gosto de olhar por muito tempo.',
              [back, { text: 'Melhor não olhar.' }],
            );
          },
        },
      ],
    );
  },

  bento(L, n) {
    const g = L.game;
    const st = L.st;
    const say = (t, c) => L.say(n, t, c);
    const back = { text: 'Voltar', fn: () => TALK.bento(L, n) };
    say(
      'Bem-vindo ao Refeitório! Ninguém chega aqui com fome de comida — chega com fome de lugar. Senta um pouco. Quer uma Água de Amêndoa geladinha?',
      [
        {
          text: st.water < 2 ? 'Aceito a água.' : 'Mais uma água?',
          fn: () => {
            if (st.water < 2) {
              st.water++;
              g.addSanity(45);
              g.audio.drink();
              say('Toma. Gelada, do jeito certo. A cabeça clareia, não clareia?', [back, { text: 'Obrigado!' }]);
            } else say('Acabou o estoque de hoje. Amanhã chega mais. Sempre chega mais, ninguém sabe de onde.', [back]);
          },
        },
        {
          text: 'Viu algum fusível por aí?',
          fn: () =>
            say(
              L.taken.has('z:fuse:1')
                ? 'Você já achou o dos alojamentos. Os outros devem estar com a Iara e no hangar.'
                : 'Nos alojamentos, aqui no fundo. Na beliche de cima, a mais perto da janela. Alguém dorme abraçado nele: diz que é quentinho.',
              [back],
            ),
        },
        {
          text: 'O que tem para comer?',
          fn: () => say('Sopa de algas da hidroponia. Igual à de ontem. Igual à de amanhã. Mas é quente, e aqui isso vale ouro.', [back]),
        },
      ],
    );
  },

  viajante(L, n) {
    const say = (t, c) => L.say(n, t, c);
    const back = { text: 'Voltar', fn: () => TALK.viajante(L, n) };
    say(
      'Também vim pela porta de madeira. Faz… quanto tempo? Aqui o tempo é uma estação que não muda. Era para eu ter pegado aquele elevador. Fiquei.',
      [
        { text: 'Por que ficou?', fn: () => say('Porque aqui alguém sabe o meu nome. Lá embaixo eu era só mais um par de passos no carpete.', [back]) },
        { text: 'Vem comigo?', fn: () => say('Talvez na próxima porta. Vai na frente. Se o caminho for bom, deixa um bilhete.', [back]) },
        {
          text: 'Viu um fusível aqui?',
          fn: () =>
            say(
              L.taken.has('z:fuse:2')
                ? 'Você já achou. Boa. Eu fiquei olhando para ele por semanas, sem coragem de entregar.'
                : 'Na caixa aberta perto da parede, do lado da baía. Fica brilhando de noite. Bem, aqui é sempre de noite.',
              [back],
            ),
        },
      ],
    );
  },

  z7(L, n) {
    const say = (t, c) => L.say(n, t, c);
    const back = { text: 'Voltar', fn: () => TALK.z7(L, n) };
    say('BIP. ZELADOR Z-7. VISITANTE NÃO REGISTRADO DETECTADO. BEM-VINDO À ZÊNITE. POR FAVOR, NÃO PISE NO PISO MOLHADO.', [
      { text: 'Onde fica o hangar?', fn: () => say('HANGAR: PASSARELA AO NORTE, SALA DOS GERADORES, PORTA OESTE. CONTROLE: PORTA LESTE.', [back]) },
      { text: 'Você limpa o rastro vermelho?', fn: () => say('… … ESSE NÃO É O MEU SETOR. BIP.', [back]) },
      { text: 'Tchau, Z-7.' },
    ]);
  },
};
