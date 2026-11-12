// Textos do jogo: introdução, documentos, objetivos, itens, dicas e final.

export const INTRO = [
  'Outubro de 2004.',
  'Há três semanas, o Vale dos Corvos parou de responder.',
  'Duas equipes de resgate subiram a serra. Nenhuma voltou.',
  'A última transmissão de rádio dizia apenas: "o ferro está vivo".',
  'Você é Elias Duarte, agente da Polícia Federal.',
  'Descubra o que aconteceu com a vila. E saia de lá vivo.',
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

3. O portão do cemitério ficará trancado até segunda ordem. A chave fica sob a guarda do prefeito, em sua residência, a casa grande do lado oeste da estrada.

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

O minério vermelho que você trouxe da mina velha está espalhando a doença. Já são quarenta e três "convertidos". Você jurou que o fogo da forja purificaria o metal. Mentiu.

Tranquei o portão do cemitério e guardei a chave comigo. A ponte levadiça só desce se alguém girar as duas manivelas: uma na capela, outra em frente ao mausoléu. Que ninguém as gire.

Se alguém estiver lendo isto, é porque eu também já fui convertido.

Otávio Brandão, prefeito`,
  },
  ferreiro: {
    title: 'Anotações do ferreiro',
    kind: 'hand',
    body: `O ferro canta para mim.

Ele diz que a carne é fraca, que apodrece e esquece. A ferrugem não esquece nada. A ferrugem é eterna.

Cada um que bebe da água do poço vira uma peça na minha bigorna. Eu bato, eles obedecem. Quando o último beber, o vale inteiro será uma só peça forjada.

Eu sou o martelo. Eles são o metal.`,
  },
  relatorio: {
    title: 'Relatório de campo da Equipe 2',
    kind: 'print',
    body: `RELATÓRIO DE CAMPO, EQUIPE 2
Situação: crítica. Três baixas.

Para quem vier depois:

• Os infectados quase não sentem tiros no tronco. Mirem na CABEÇA ou nos JOELHOS: eles cambaleiam e ficam abertos para um chute.

• Os rastejantes são rápidos, mas ficam expostos logo depois de cada salto.

• O grandalhão da forja tem um núcleo incandescente no peito. É o único lugar onde as balas fazem diferença de verdade. Quando ele cair de joelhos, chegue perto e termine o serviço.

• Os barris vermelhos explodem. Usem isso.

Se alguém encontrar isto: não deixem a forja acesa.

Sgt. Marta Lins`,
  },
};

export const OBJ = {
  start: 'Investigue a vila',
  findKey: 'Encontre a chave do portão na casa do prefeito',
  openGate: 'Abra o portão do cemitério ao norte',
  winches: (n) => `Gire as duas manivelas da ponte (${n}/2)`,
  cross: 'Atravesse a ponte até a forja',
  boss: 'Derrote o Ferreiro',
  end: 'Sobreviva',
};

export const ITEMS = {
  pistol: { name: 'Pistola P-9', desc: 'Semiautomática 9 mm com mira laser. 12 tiros por pente.' },
  shotgun: { name: 'Escopeta calibre 12', desc: 'De perto, derruba qualquer um. 6 cartuchos.' },
  knife: { name: 'Faca de combate', desc: 'Clique sem mirar. Economiza munição e quebra caixas.' },
  ammo_pistol: { name: 'Munição 9 mm', desc: 'Para a Pistola P-9.' },
  ammo_shotgun: { name: 'Cartuchos calibre 12', desc: 'Para a escopeta.' },
  tonic: { name: 'Tônico', desc: 'Frasco de tônico estimulante. Recupera 45% da vitalidade.' },
  medkit: { name: 'Kit de primeiros socorros', desc: 'Recupera toda a vitalidade.' },
  grenade: { name: 'Granada', desc: 'Explode 1,6 s depois de lançada.' },
  key: { name: 'Chave do cemitério', desc: 'Chave de ferro pesada com um corvo gravado.' },
  weapon_shotgun: { name: 'Escopeta calibre 12', desc: 'De perto, derruba qualquer um.' },
};

export const TIPS = [
  'Tiros na cabeça ou nos joelhos deixam o infectado atordoado. Chegue perto e aperte E para chutar.',
  'O chute derruba todos os inimigos à sua frente, e você não sofre dano durante o golpe.',
  'Barris vermelhos explodem com um tiro.',
  'Use a faca (clique sem mirar) para quebrar caixas e economizar munição.',
  'Com a escopeta, deixe-os chegar perto. Mas não perto demais.',
  'Q faz um giro rápido de 180°.',
  'H usa um tônico na hora, sem abrir a mochila.',
  'Os rastejantes ficam vulneráveis logo depois de saltar.',
  'O núcleo no peito do Ferreiro é o ponto fraco dele.',
  'Infectados derrubados se levantam. Termine o serviço com a faca enquanto estão no chão.',
];

export const ENDING = [
  'O Ferreiro caiu. As fornalhas se apagaram uma a uma.',
  'Pela primeira vez em semanas, o vale ficou em silêncio.',
  'Ao amanhecer, a neblina subiu pela serra e levou com ela o cheiro de ferro.',
];

export function rankOf(stats) {
  const acc = stats.shots ? stats.hits / stats.shots : 0;
  let score = 0;
  score += Math.max(0, 40 - stats.time / 60) * 2;
  score += acc * 60;
  score -= stats.deaths * 15;
  score += Math.min(30, stats.heads * 1.5);
  if (score >= 90) return 'S';
  if (score >= 65) return 'A';
  if (score >= 40) return 'B';
  return 'C';
}
