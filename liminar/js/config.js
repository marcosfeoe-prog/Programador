// Configurações: presets de qualidade gráfica, filtros, níveis e preferências salvas.
import { isMobileDevice } from './util.js';

// maxDpr: limite da densidade de pixels; scale: fator sobre ela.
// viewDist: distância (m) em que os blocos do mundo são mantidos carregados.
export const QUALITY = {
  low: {
    id: 'low',
    label: 'Baixa',
    maxDpr: 1,
    scale: 0.9,
    msaa: 0,
    bloomLevels: 3,
    bloomStart: 2,
    tex: 256,
    normalMaps: false,
    lambert: true,
    envMap: false,
    lmTpm: 2,
    lmSamples: 1,
    viewDist: 22,
    outdoorView: 90,
    shadows: false,
    shadowSize: 512,
    flashShadow: false,
    wheatRadius: 15,
    wheatSpacing: 0.62,
    props: 0.6,
    halfFloat: true,
  },
  medium: {
    id: 'medium',
    label: 'Média',
    maxDpr: 1.5,
    scale: 1,
    msaa: 4,
    bloomLevels: 4,
    bloomStart: 1,
    tex: 512,
    normalMaps: true,
    lambert: false,
    envMap: true,
    lmTpm: 3,
    lmSamples: 2,
    viewDist: 34,
    outdoorView: 150,
    shadows: true,
    shadowSize: 1024,
    flashShadow: false,
    wheatRadius: 24,
    wheatSpacing: 0.5,
    props: 0.85,
    halfFloat: true,
  },
  high: {
    id: 'high',
    label: 'Alta',
    maxDpr: 2,
    scale: 1,
    msaa: 4,
    bloomLevels: 5,
    bloomStart: 1,
    tex: 1024,
    normalMaps: true,
    lambert: false,
    envMap: true,
    lmTpm: 4,
    lmSamples: 3,
    viewDist: 46,
    outdoorView: 220,
    shadows: true,
    shadowSize: 2048,
    flashShadow: true,
    wheatRadius: 32,
    wheatSpacing: 0.42,
    props: 1,
    halfFloat: true,
  },
  ultra: {
    id: 'ultra',
    label: 'Ultra',
    maxDpr: 2.5,
    scale: 1.2,
    msaa: 4,
    bloomLevels: 6,
    bloomStart: 1,
    tex: 1024,
    normalMaps: true,
    lambert: false,
    envMap: true,
    lmTpm: 5,
    lmSamples: 4,
    viewDist: 62,
    outdoorView: 300,
    shadows: true,
    shadowSize: 4096,
    flashShadow: true,
    wheatRadius: 42,
    wheatSpacing: 0.36,
    props: 1,
    halfFloat: true,
  },
};
export const QUALITY_ORDER = ['low', 'medium', 'high', 'ultra'];

// Filtros de pós-processamento (o índice vira #define FILTER no shader).
export const FILTERS = [
  { id: 'none', label: 'Nenhum', desc: 'Imagem limpa, só a correção de cor do nível.' },
  { id: 'vhs', label: 'Fita VHS', desc: 'Gravação caseira dos anos 90: cor borrada, ruído de trilha e REC.' },
  { id: 'film', label: 'Filme antigo', desc: 'Película 8 mm em sépia com riscos, poeira e oscilação.' },
  { id: 'noir', label: 'Preto e branco', desc: 'Alto contraste e granulação forte.' },
  { id: 'night', label: 'Visão noturna', desc: 'Intensificador de luz verde com muito ruído.' },
  { id: 'crt', label: 'Monitor CRT', desc: 'Tela curva, linhas de varredura e máscara RGB.' },
  { id: 'dream', label: 'Dreamcore', desc: 'Brilho suave, tons pastel e aberração cromática.' },
  { id: 'glitch', label: 'Glitch', desc: 'Corrupção digital, blocos deslocados e canais separados.' },
  { id: 'thermal', label: 'Câmera térmica', desc: 'Falsa cor por temperatura aparente.' },
  { id: 'digicam', label: 'Câmera digital 2005', desc: 'Cores quentes, nitidez exagerada e data laranja.' },
  { id: 'cctv', label: 'Câmera de segurança', desc: 'Olho de peixe, poucos quadros por segundo e carimbo de hora.' },
];

// Os níveis, na ordem em que são visitados. `key` identifica a classe do nível
// e os bilhetes; `num` é o número canônico (10.1 é um subnível do 10).
// Ordem em que os níveis são visitados (as chaves de LEVELS; secretos e partes ficam de fora).
export const ORDER = ['0', '1', '2', '3', '4', '5', '8', '9', '10', '10.1', '11', '12', '15', '23', '34', '35', '37', '88'];

// Posição de um nível na ordem (partes contam como o nível principal; secretos, como o pai).
export function orderPos(info) {
  if (!info) return -1;
  const k = info.part || (info.secret ? info.parent : info.key);
  return ORDER.indexOf(k);
}

export const LEVELS = [
  {
    key: '0',
    num: 0,
    name: 'O Saguão',
    tag: 'Nível 0',
    danger: 'Classe 1 · Seguro · Instável',
    desc: 'Corredores amarelos sem fim, carpete úmido e o zumbido constante das lâmpadas fluorescentes.',
    objective: 'Procure uma parede que esteja falhando e atravesse-a.',
    hint: 'Siga o chiado elétrico mais forte que o zumbido.',
  },
  {
    key: '1',
    num: 1,
    name: 'Zona Habitável',
    tag: 'Nível 1',
    danger: 'Classe 1 · Seguro · Entidades no escuro',
    desc: 'Um armazém de concreto gigantesco. As luzes às vezes apagam, e algo sorri no escuro.',
    objective: 'Encontre a porta de metal com a placa verde de SAÍDA.',
    hint: 'Ilumine os Sorridentes com a lanterna para afastá-los.',
  },
  {
    key: '4',
    num: 4,
    name: 'Escritório Abandonado',
    tag: 'Nível 4',
    danger: 'Classe 1 · Seguro · Sem entidades',
    desc: 'Um escritório vazio e silencioso. Bebedouros ainda funcionam.',
    objective: 'Encontre o elevador e chame-o.',
    hint: 'O elevador apita de tempos em tempos.',
  },
  {
    key: '5',
    num: 5,
    name: 'O Hotel do Terror',
    tag: 'Nível 5',
    danger: 'Classe 2 · Instável · Um hóspede vaga pelos corredores',
    desc: 'Um hotel infinito dos anos 1930, impecavelmente limpo. Jazz toca baixinho em vitrolas que ninguém liga.',
    objective: 'Pegue a chave na recepção, desligue as caldeiras e abra o quarto marcado.',
    hint: 'O Hóspede só anda quando você não está olhando.',
  },
  {
    key: '9',
    num: 9,
    name: 'Os Subúrbios',
    tag: 'Nível 9',
    danger: 'Classe 5 · Inseguro · Infestado de entidades',
    desc: 'Um bairro infinito à meia-noite. Casas diferentes umas das outras, postes falhando e algo correndo pelas ruas.',
    objective: 'Ache o endereço na caixa de correio, junte pilhas e entre na casa certa.',
    hint: 'Não corra perto dos Cães. Fique sob a luz dos postes.',
  },
  {
    key: '10',
    num: 10,
    name: 'A Plantação',
    tag: 'Nível 10',
    danger: 'Classe 1 · Seguro · Céu sempre nublado',
    desc: 'Campos de trigo infinitos sob um céu cinzento. Estradas de terra e postes que não levam a lugar nenhum.',
    objective: 'Siga as estradas e encontre a porta solitária no meio do trigo.',
    hint: 'Ela range com o vento.',
  },
  {
    key: '10.1',
    num: 10.1,
    sub: true,
    name: 'Lago dos Cadáveres',
    tag: 'Subnível 10.1',
    danger: 'Classe 5 · Perigos ambientais · Sem entidades',
    desc: 'Um lago artificial escuro no meio do Nível 10. A água é gelada, funda e cheia de coisas que não se movem.',
    objective: 'Contorne a margem até o píer e pegue o barco.',
    hint: 'Não entre na água funda.',
  },
  {
    key: '11',
    num: 11,
    name: 'Cidade Sem Fim',
    tag: 'Nível 11',
    danger: 'Classe 0 · Seguro · Abandonado',
    desc: 'Uma metrópole interminável ao entardecer, sem ninguém nas ruas.',
    objective: 'Um telefone público está tocando. Atenda.',
    hint: 'Escute o toque entre os prédios.',
  },
  {
    key: '15',
    num: 15,
    name: 'Os Salões Futuristas',
    tag: 'Nível 15',
    danger: 'Classe 0 · Seguro · Sem entidades',
    desc: 'Corredores futuristas brancos, trechos totalmente escuros e salas de máquinas atrás de vidro grosso.',
    objective: 'Ache o cartão de acesso, religue os três terminais e abra a comporta.',
    hint: 'Os motores ficam mais altos perto das salas de máquinas.',
  },
  {
    key: '23',
    num: 23,
    name: 'O Jardim Petrificado',
    tag: 'Nível 23',
    danger: 'Classe 4 · Coberto de vegetação · Sem entidades',
    desc: 'Um superorganismo do tamanho de um planetoide: árvores petrificadas entrelaçadas, musgo e névoa.',
    objective: 'Atravesse as raízes até a Base Seedling.',
    hint: 'Procure a luz quente do abrigo.',
  },
  // Subnível secreto: fica no fim da lista para não mudar os índices salvos.
  // Só aparece no menu depois de descoberto; ao sair, volta para `returnTo`.
  {
    key: '0.1',
    num: 0.1,
    sub: true,
    secret: true,
    parent: '0',
    returnTo: '1',
    name: 'Estação Zênite',
    tag: 'Subnível 0.1',
    danger: 'Classe 0 · Seguro · Habitado',
    desc: 'Uma usina elétrica flutuando no espaço, escondida atrás de uma porta de madeira no Nível 0. Há gente aqui.',
    objective: 'Fale com a supervisora no Átrio.',
    hint: 'Converse com todos. Olhe pelas janelas.',
  },
  // Nível 88: depois do 23, o último do jogo (no fim da lista para não mudar índices salvos).
  {
    key: '88',
    num: 88,
    name: 'Lago Silencioso',
    tag: 'Nível 88',
    danger: 'Pendente · Não protegido · Entidades presentes',
    desc: 'Um lago imóvel e gelado no fundo de uma floresta escura. Perto da água, todo som desaparece.',
    objective: 'Encontre a passagem subterrânea.',
    hint: 'À noite algo caça na mata: se ele te vir, corra para a cabana e feche a porta.',
  },
  // Nível 12 em três áreas (as áreas 2 e 3 são partes: não aparecem no menu).
  {
    key: '12',
    num: 12,
    next: '12.2',
    name: 'Matrix',
    tag: 'Nível 12',
    danger: 'Classe 0 · Seguro · Sem entidades',
    desc: 'Uma salinha branca com mesa, cadeira e uma porta. Do outro lado, corredores brancos que não terminam.',
    objective: 'Encontre a passagem subterrânea nos corredores.',
    hint: 'Nada aqui pode ser gravado. Nem lembrado direito.',
  },
  {
    key: '12.2',
    num: 12,
    part: '12',
    next: '12.3',
    name: 'Matrix — A Rua Vermelha',
    tag: 'Nível 12 · Área 2',
    danger: 'Classe 0 · Lua vermelha',
    desc: 'Uma rua deserta sob uma lua vermelha enorme.',
    objective: 'Encontre a porta branca aberta.',
    hint: 'Ela brilha. Procure a luz branca no vermelho.',
  },
  {
    key: '12.3',
    num: 12,
    part: '12',
    next: '15',
    name: 'Matrix — O Branco',
    tag: 'Nível 12 · Área 3',
    danger: 'Classe ? · Nada',
    desc: 'Branco. Só branco.',
    objective: 'Espere.',
    hint: 'Alguma coisa vai aparecer.',
  },
  {
    key: '37',
    num: 37,
    name: 'Sublimidade',
    tag: 'Nível 37',
    danger: 'Classe 0 · Seguro · Desprovido de entidades',
    desc: 'Um labirinto infinito de piscinas de azulejos brancos, água morna e luz que entra em ângulos impossíveis.',
    objective: 'Descanse. Explore as piscinas.',
    hint: 'Três saídas: uma escada para baixo, uma porta de manutenção e uma porta futurista.',
  },
  {
    key: '2',
    num: 2,
    name: 'Salões de Utilidades',
    tag: 'Nível 2',
    danger: 'Classe 3 · Inseguro · Canos quentes',
    desc: 'Túneis de manutenção estreitos, cheios de canos, fios e máquinas paradas. Alguns canos fervem.',
    objective: 'Encontre a chave dourada.',
    hint: 'Não encoste nos canos com faixa vermelha. Converse com o papagaio.',
  },
  {
    key: '3',
    num: 3,
    name: 'Estação Elétrica',
    tag: 'Nível 3',
    danger: 'Classe 4 · Inseguro · Entidades presentes',
    desc: 'Corredores apertados de tijolos, cabos estalando e algo que anda de quatro. Dois andares.',
    objective: 'Encontre a chave branca.',
    hint: 'O Cão não é rápido, mas não desiste. Não corra perto dele.',
  },
  {
    key: '8',
    num: 8,
    name: 'Sistema de Cavernas',
    tag: 'Nível 8',
    danger: 'Classe 4 · Muito difícil de sair · Escuro total',
    desc: 'Uma rede enorme de cavernas frias e escuras. Só a lanterna mostra o caminho. A M.E.G. montou uma base aqui.',
    objective: 'Encontre a área de mineração escondida.',
    hint: 'Sem a lanterna você não vê nada. Procure a base da M.E.G.',
  },
  {
    key: '9.5',
    num: 9.5,
    sub: true,
    secret: true,
    parent: '9',
    returnTo: '10',
    name: 'Rochester Blues',
    tag: 'Subnível 9.5',
    danger: 'Pendente · Frio extremo',
    desc: 'Um subúrbio sem fim coberto de neve, numa noite que não acaba. As casas iluminadas são quentes por dentro.',
    objective: 'Encontre a casa iluminada coberta de neve.',
    hint: 'O frio lá fora derruba a sanidade. Descanse dentro das casas acesas.',
  },
  {
    key: '34',
    num: 34,
    name: 'Sistema de Esgoto',
    tag: 'Nível 34',
    danger: 'Classe 4 · Inseguro · Muitas entidades',
    desc: 'Túneis de esgoto sem fim, tijolo em cima e pedra embaixo, água amarelada no chão. Sorridentes, Cães de caça, Ratos da Morte… e boatos de um Ladrão de Pele.',
    objective: 'Encontre a Sala de Junção e mergulhe até o fundo.',
    hint: 'Viu um Sorridente? Apague a lanterna e olhe para o chão. Não beba a água daqui.',
  },
  {
    key: '35',
    num: 35,
    name: 'Um Estacionamento Vazio',
    tag: 'Nível 35',
    danger: 'Classe 2 · Inseguro · Poucas entidades',
    desc: 'Uma garagem enorme de concreto com seis andares, luz quente e brilhos verdes e azuis, cercada por um abismo escuro. Algo grande vive nos cantos escuros.',
    objective: 'Suba até o terraço e saia pela escada.',
    hint: 'NÃO CORRA. A criatura só persegue quem corre.',
  },
];

// Ordem dos níveis da versão 1 (para migrar o progresso salvo).
const V1_ORDER = ['0', '1', '4', '10', '11'];

const KEY = 'liminar-settings-v1';

export function defaultSettings() {
  const mobile = isMobileDevice();
  return {
    quality: mobile ? 'low' : 'high',
    filter: 'vhs',
    filterStrength: 1,
    grain: 0.5,
    vignette: 0.6,
    sensitivity: 1,
    invertY: false,
    volume: 1,
    fov: mobile ? 78 : 74,
    headBob: true,
    navHelp: true,
    showFps: false,
    dynamicRes: mobile,
    reached: 0,
    v2: true,
    mobile,
  };
}

export function loadSettings() {
  const s = defaultSettings();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      // progresso salvo na v1 era um índice na lista antiga de 5 níveis
      if (!saved.v2 && typeof saved.reached === 'number') {
        const k = V1_ORDER[saved.reached] || '0';
        saved.reached = Math.max(0, LEVELS.findIndex((l) => l.key === k));
      }
      Object.assign(s, saved);
    }
  } catch (e) {
    /* armazenamento indisponível */
  }
  s.mobile = isMobileDevice();
  const params = new URLSearchParams(location.search);
  const q = params.get('q') || params.get('quality');
  if (q && QUALITY[q]) s.quality = q;
  const f = params.get('filter');
  if (f && FILTERS.some((x) => x.id === f)) s.filter = f;
  if (params.has('touch')) s.mobile = true;
  if (!QUALITY[s.quality]) s.quality = 'medium';
  if (!FILTERS.some((x) => x.id === s.filter)) s.filter = 'none';
  return s;
}

export function saveSettings(s) {
  try {
    const { mobile, ...rest } = s;
    rest.v2 = true;
    localStorage.setItem(KEY, JSON.stringify(rest));
  } catch (e) {
    /* armazenamento indisponível */
  }
}
