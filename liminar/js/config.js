// Configurações: presets de qualidade gráfica, filtros, níveis e preferências salvas.
import { isMobileDevice } from './util.js';

// maxDpr: limite da densidade de pixels; scale: fator sobre ela.
// viewDist: distância (m) em que os blocos do mundo são mantidos carregados.
export const QUALITY = {
  low: {
    id: 'low',
    label: 'Baixa',
    maxDpr: 1,
    scale: 0.8,
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
    scale: 0.9,
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

// Os cinco níveis. `num` é o número canônico do nível.
export const LEVELS = [
  {
    num: 0,
    name: 'O Saguão',
    tag: 'Nível 0',
    danger: 'Classe 1 · Seguro · Instável',
    desc: 'Corredores amarelos sem fim, carpete úmido e o zumbido constante das lâmpadas fluorescentes.',
    objective: 'Procure uma parede que esteja falhando e atravesse-a.',
    hint: 'Siga o chiado elétrico mais forte que o zumbido.',
  },
  {
    num: 1,
    name: 'Zona Habitável',
    tag: 'Nível 1',
    danger: 'Classe 1 · Seguro · Entidades no escuro',
    desc: 'Um armazém de concreto gigantesco. As luzes às vezes apagam, e algo sorri no escuro.',
    objective: 'Encontre a porta de metal com a placa verde de SAÍDA.',
    hint: 'Ilumine os Sorridentes com a lanterna para afastá-los.',
  },
  {
    num: 4,
    name: 'Escritório Abandonado',
    tag: 'Nível 4',
    danger: 'Classe 1 · Seguro · Sem entidades',
    desc: 'Um escritório vazio e silencioso. Bebedouros ainda funcionam.',
    objective: 'Encontre o elevador e chame-o.',
    hint: 'O elevador apita de tempos em tempos.',
  },
  {
    num: 10,
    name: 'A Plantação',
    tag: 'Nível 10',
    danger: 'Classe 1 · Seguro · Céu sempre nublado',
    desc: 'Campos de trigo infinitos sob um céu cinzento. Estradas de terra e postes que não levam a lugar nenhum.',
    objective: 'Siga as estradas e encontre a porta solitária no meio do trigo.',
    hint: 'Ela range com o vento.',
  },
  {
    num: 11,
    name: 'Cidade Sem Fim',
    tag: 'Nível 11',
    danger: 'Classe 0 · Seguro · Abandonado',
    desc: 'Uma metrópole interminável ao entardecer, sem ninguém nas ruas.',
    objective: 'Um telefone público está tocando. Atenda.',
    hint: 'Escute o toque entre os prédios.',
  },
];

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
    volume: 0.8,
    fov: mobile ? 78 : 74,
    headBob: true,
    navHelp: true,
    showFps: false,
    dynamicRes: mobile,
    reached: 0,
    mobile,
  };
}

export function loadSettings() {
  const s = defaultSettings();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(s, JSON.parse(raw));
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
    localStorage.setItem(KEY, JSON.stringify(rest));
  } catch (e) {
    /* armazenamento indisponível */
  }
}
