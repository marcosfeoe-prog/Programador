// Dados do jogo: carros, personalização, mundos, níveis e qualidade gráfica.

export const TRACK_W = 13; // largura padrão da pista (m)
export const G = 24; // gravidade arcade (m/s²)
export const N_RACERS = 6;

// Atributos base (nível de melhoria 0). vmax em m/s, accel em m/s², controle =
// velocidade lateral máxima (m/s), nitro = multiplicador do turbo.
export const CARS = [
  { id: 'faisca', name: 'Faísca', kind: 'Compacto', price: 0, vmax: 44, accel: 15, handling: 9.5, nitro: 1.0, paint: 'amarelo' },
  { id: 'raio', name: 'Raio GT', kind: 'Esportivo', price: 1000, vmax: 46.5, accel: 16.5, handling: 10.5, nitro: 1.04, paint: 'vermelho' },
  { id: 'trovao', name: 'Trovão', kind: 'Muscle', price: 2000, vmax: 49, accel: 18.5, handling: 9.5, nitro: 1.1, paint: 'verde' },
  { id: 'lobo', name: 'Lobo', kind: 'Buggy', price: 3200, vmax: 48, accel: 21, handling: 12.5, nitro: 1.05, paint: 'laranja' },
  { id: 'cometa', name: 'Cometa', kind: 'Superesportivo', price: 4800, vmax: 53, accel: 20, handling: 11.5, nitro: 1.1, paint: 'roxo' },
  { id: 'tufao', name: 'Tufão F', kind: 'Fórmula', price: 6800, vmax: 55, accel: 24, handling: 13.5, nitro: 1.1, paint: 'azul' },
  { id: 'vespa', name: 'Vespa X', kind: 'Hiperesportivo', price: 9000, vmax: 58, accel: 23, handling: 12.5, nitro: 1.15, paint: 'preto' },
  { id: 'bolido', name: 'Bólido 70', kind: 'Clássico de corrida', price: 12000, vmax: 57, accel: 22, handling: 14.5, nitro: 1.2, paint: 'branco' },
  { id: 'ciclone', name: 'Ciclone LM', kind: 'Protótipo', price: 16000, vmax: 61, accel: 26, handling: 13.5, nitro: 1.2, paint: 'ciano' },
  { id: 'fantasma', name: 'Fantasma', kind: 'Conceito', price: 21000, vmax: 64, accel: 28, handling: 15.5, nitro: 1.25, paint: 'perola' },
];

export const MAX_UPGRADE = 5;
export const UPGRADE_STEP = { vmax: 1.7, accel: 1.3, handling: 0.55, nitro: 0.03 };

export function carStats(car, level) {
  return {
    vmax: car.vmax + UPGRADE_STEP.vmax * level,
    accel: car.accel + UPGRADE_STEP.accel * level,
    handling: car.handling + UPGRADE_STEP.handling * level,
    nitro: car.nitro + UPGRADE_STEP.nitro * level,
  };
}

export function upgradeCost(car, level) {
  return Math.round(((250 + car.price * 0.09) * (1 + level * 0.65)) / 10) * 10;
}

// Valores 0–100 para as barras da garagem.
export function statBars(s) {
  return {
    vmax: Math.round(((s.vmax - 38) / (74 - 38)) * 100),
    accel: Math.round(((s.accel - 12) / (36 - 12)) * 100),
    handling: Math.round(((s.handling - 8) / (19 - 8)) * 100),
    nitro: Math.round(((s.nitro - 0.95) / (1.42 - 0.95)) * 100),
  };
}

export const PAINTS = [
  { id: 'amarelo', name: 'Amarelo Sol', color: 0xffc21a, metal: 0.25, rough: 0.32, price: 0 },
  { id: 'vermelho', name: 'Vermelho Rubi', color: 0xe8202a, metal: 0.25, rough: 0.3, price: 0 },
  { id: 'azul', name: 'Azul Royal', color: 0x1f5fff, metal: 0.3, rough: 0.3, price: 0 },
  { id: 'verde', name: 'Verde Lima', color: 0x3fd13a, metal: 0.25, rough: 0.32, price: 300 },
  { id: 'laranja', name: 'Laranja Brasa', color: 0xff6a12, metal: 0.25, rough: 0.32, price: 300 },
  { id: 'roxo', name: 'Roxo Galáxia', color: 0x8a2be2, metal: 0.35, rough: 0.3, price: 400 },
  { id: 'rosa', name: 'Rosa Chiclete', color: 0xff4fb0, metal: 0.25, rough: 0.32, price: 400 },
  { id: 'ciano', name: 'Ciano Elétrico', color: 0x12d6e8, metal: 0.3, rough: 0.3, price: 500 },
  { id: 'branco', name: 'Branco Neve', color: 0xf2f4f6, metal: 0.1, rough: 0.35, price: 500 },
  { id: 'preto', name: 'Preto Fosco', color: 0x1a1b1f, metal: 0.2, rough: 0.6, price: 600 },
  { id: 'perola', name: 'Pérola', color: 0xe8e2f2, metal: 0.55, rough: 0.2, price: 900 },
  { id: 'prata', name: 'Prata Líquida', color: 0xb8c0c8, metal: 0.9, rough: 0.18, price: 1100 },
  { id: 'dourado', name: 'Ouro', color: 0xf0b232, metal: 0.95, rough: 0.2, price: 1600 },
  { id: 'vinho', name: 'Vinho', color: 0x7a0f2b, metal: 0.45, rough: 0.28, price: 700 },
  { id: 'menta', name: 'Menta', color: 0x8ff0c6, metal: 0.2, rough: 0.35, price: 700 },
  { id: 'grafite', name: 'Grafite', color: 0x4a5058, metal: 0.6, rough: 0.3, price: 800 },
];

export const RIMS = [
  { id: 'cinco', name: 'Cinco Raios', style: 'cinco', color: '#d9dde2', price: 0 },
  { id: 'malha', name: 'Malha', style: 'malha', color: '#c9ced6', price: 500 },
  { id: 'turbina', name: 'Turbina', style: 'turbina', color: '#e2e5ea', price: 700 },
  { id: 'estrela', name: 'Estrela Negra', style: 'estrela', color: '#26282c', price: 800 },
  { id: 'disco', name: 'Disco Vermelho', style: 'disco', color: '#e0242c', price: 900 },
  { id: 'raios', name: 'Raios Finos', style: 'raios', color: '#e9eef3', price: 1000 },
  { id: 'ouro', name: 'Ouro', style: 'cinco', color: '#f1b52e', price: 1400 },
  { id: 'neon', name: 'Neon Ciano', style: 'turbina', color: '#20e6ff', price: 1600 },
];

export const NEONS = [
  { id: 'nenhum', name: 'Nenhum', color: null, price: 0 },
  { id: 'azul', name: 'Azul', color: 0x2a7bff, price: 600 },
  { id: 'rosa', name: 'Rosa', color: 0xff2fa8, price: 600 },
  { id: 'verde', name: 'Verde', color: 0x2dff6a, price: 700 },
  { id: 'laranja', name: 'Laranja', color: 0xff8a1c, price: 700 },
  { id: 'roxo', name: 'Roxo', color: 0xa14bff, price: 800 },
  { id: 'branco', name: 'Branco', color: 0xf4f8ff, price: 900 },
  { id: 'arco', name: 'Arco-íris', color: 'rainbow', price: 2000 },
];

// Cores da pista: asfalto, zebras, laterais, defensas e brilho das bordas.
export const WORLDS = [
  {
    id: 'arquipelago',
    name: 'Arquipélago',
    sub: 'Pistas sobre o mar tropical',
    road: '#55606e',
    kerbA: '#ffffff',
    kerbB: '#1e7bff',
    side: '#2e9bff',
    under: '#1d4f8a',
    rail: '#f4f7fb',
    railStripe: '#1e7bff',
    glow: null,
    altitude: 46,
    ground: -2,
    music: 0,
  },
  {
    id: 'canion',
    name: 'Cânion Dourado',
    sub: 'Mesas de pedra ao pôr do sol',
    road: '#5b524c',
    kerbA: '#ffffff',
    kerbB: '#e53a1e',
    side: '#f08a24',
    under: '#7a3a1a',
    rail: '#fff3e0',
    railStripe: '#e53a1e',
    glow: null,
    altitude: 40,
    ground: 0,
    music: 1,
  },
  {
    id: 'metropole',
    name: 'Metrópole Neon',
    sub: 'Entre arranha-céus ao anoitecer',
    road: '#3a3d4a',
    kerbA: '#ffe14a',
    kerbB: '#1b1b24',
    side: '#ff3ea5',
    under: '#2a1a3a',
    rail: '#2b2d3a',
    railStripe: '#ff3ea5',
    glow: '#ff3ea5',
    altitude: 70,
    ground: 0,
    music: 2,
  },
  {
    id: 'glacial',
    name: 'Pico Glacial',
    sub: 'Gelo e aurora boreal',
    road: '#5d6f86',
    kerbA: '#ffffff',
    kerbB: '#29c6ff',
    side: '#bfe9ff',
    under: '#3d6a8f',
    rail: '#e9f6ff',
    railStripe: '#29c6ff',
    glow: '#5fe3ff',
    altitude: 52,
    ground: 0,
    music: 3,
  },
  {
    id: 'vulcao',
    name: 'Vulcão Rubro',
    sub: 'Sobre rios de lava',
    road: '#3b3533',
    kerbA: '#ffb21a',
    kerbB: '#1a1414',
    side: '#5a2d22',
    under: '#2a1612',
    rail: '#2e2624',
    railStripe: '#ff6a1a',
    glow: '#ff5a1a',
    altitude: 50,
    ground: -4,
    music: 4,
  },
  {
    id: 'orbita',
    name: 'Órbita Estelar',
    sub: 'Pistas suspensas no espaço',
    road: '#2d2a48',
    kerbA: '#ffffff',
    kerbB: '#a63bff',
    side: '#3a2a8a',
    under: '#1a1440',
    rail: '#2a2450',
    railStripe: '#33f0ff',
    glow: '#33f0ff',
    altitude: 0,
    ground: null,
    music: 5,
  },
];

export const LEVELS_PER_WORLD = 5;
export const TOTAL_LEVELS = WORLDS.length * LEVELS_PER_WORLD;

// Parâmetros de cada nível (índice global 0..29).
export function levelInfo(idx) {
  const w = Math.floor(idx / LEVELS_PER_WORLD);
  const l = idx % LEVELS_PER_WORLD;
  const d = idx / (TOTAL_LEVELS - 1); // dificuldade 0..1
  return {
    idx,
    world: w,
    local: l,
    difficulty: d,
    seed: 1000 + idx * 7919,
    length: Math.round(1300 + idx * 55 + (l === 4 ? 300 : 0)),
    aiSpeed: 40.5 + idx * 0.78,
    reward: [400, 250, 160, 100, 70, 50].map((r) => Math.round((r * (1 + idx * 0.09)) / 10) * 10),
  };
}

export const AI_NAMES = ['Rafa', 'Bia', 'Léo', 'Duda', 'Tico', 'Nina', 'Caio', 'Juju', 'Beto', 'Mari', 'Guto', 'Lila', 'Zeca', 'Tati', 'Dani', 'Vini'];

export const QUALITY = {
  low: { label: 'Baixa', pixelRatio: 1, shadows: 0, antialias: false, props: 0.5, particles: 0.5 },
  medium: { label: 'Média', pixelRatio: 1.5, shadows: 1024, antialias: true, props: 0.8, particles: 0.8 },
  high: { label: 'Alta', pixelRatio: 2, shadows: 2048, antialias: true, props: 1, particles: 1 },
};
