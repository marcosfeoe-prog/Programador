// Espécies. A anatomia é descrita em metros (adulto), olhando de lado:
//   z = para frente, y = para cima, x = lado esquerdo.
// torso/tail: nós [z, y, meia-largura, meia-altura, papel] — 'nb' = sem osso próprio
// pernas: pontos [x, y, z, raio] quadril → joelho → tornozelo → planta → ponta
// braços: ombro → cotovelo → pulso → ponta

export const SPECIES = {
  trex: {
    id: 'trex',
    name: 'Tiranossauro rex',
    short: 'T. rex',
    diet: 'carnivoro',
    playable: true,
    desc: 'Predador de topo. Mordida esmagadora, lento para virar e fome enorme.',
    gait: 'biped',
    attack: 'bite',
    stats: { health: 1000, damage: 210, bleed: 3, walk: 2.8, run: 7.6, turn: 1.5, stamina: 100, reach: 1.7, armor: 0.3 },
    survival: { hunger: 9, thirst: 11, appetite: 260, growMin: 22 },
    hatchScale: 0.2,
    ai: { herd: [1, 1], aggression: 0.9, fear: 0.0, preyMax: 0.9, roam: 0.6 },
    voice: { pitch: 0.42, rough: 0.9 },
    skin: { base: '#6e5a3c', belly: '#cbb58a', pattern: '#2f261a', type: 'stripes', count: 3, scale: 54 },
    accent: null,
    eye: '#e09a1c',
    rig: {
      torso: [
        [0, 3.3, 0.75, 0.95, 'pelvis'],
        [1.1, 3.2, 0.95, 1.18, 'spine'],
        [2.1, 3.15, 0.85, 1.05, 'chest'],
        [2.85, 3.4, 0.58, 0.72, 'neck'],
        [3.45, 3.8, 0.5, 0.62, 'neck'],
        [3.95, 4.12, 0.52, 0.6, 'head'],
        [4.6, 4.05, 0.42, 0.45, 'nb'],
        [5.35, 3.92, 0.27, 0.3, 'nb'],
      ],
      tail: [
        [-1.0, 3.38, 0.62, 0.82],
        [-2.2, 3.35, 0.46, 0.6],
        [-3.4, 3.22, 0.32, 0.42],
        [-4.6, 3.05, 0.21, 0.28],
        [-5.8, 2.9, 0.13, 0.17],
        [-6.8, 2.78, 0.05, 0.07, 'nb'],
      ],
      jaw: [
        [3.95, 3.72, 0.44, 0.3],
        [4.7, 3.62, 0.34, 0.22],
        [5.3, 3.6, 0.22, 0.13],
      ],
      teeth: { from: 4.15, to: 5.25, n: 9, len: 0.17 },
      eye: { z: 4.2, a: 0.55, r: 0.075 },
      hind: [
        [0.55, 3.25, 0.1, 0.62],
        [0.68, 2.05, 0.75, 0.36],
        [0.62, 0.78, -0.12, 0.17],
        [0.6, 0.14, 0.28, 0.15],
        [0.6, 0.06, 0.95, 0.07],
      ],
      arms: [
        [0.55, 2.7, 2.25, 0.15],
        [0.62, 2.35, 2.45, 0.1],
        [0.6, 2.15, 2.7, 0.07],
        [0.58, 2.05, 2.88, 0.035],
      ],
      claws: true,
      extras: [],
    },
  },

  raptor: {
    id: 'raptor',
    name: 'Velociraptor',
    short: 'Raptor',
    diet: 'carnivoro',
    playable: true,
    desc: 'Pequeno, muito rápido e ágil. A garra em foice causa sangramento.',
    gait: 'biped',
    attack: 'bite',
    stats: { health: 230, damage: 34, bleed: 7, walk: 3.0, run: 11.5, turn: 4.2, stamina: 100, reach: 0.75, armor: 0 },
    survival: { hunger: 11, thirst: 12, appetite: 40, growMin: 14 },
    hatchScale: 0.3,
    ai: { herd: [2, 4], aggression: 0.8, fear: 0.7, preyMax: 0.7, roam: 0.9, pack: true },
    voice: { pitch: 1.6, rough: 0.6 },
    skin: { base: '#8c6a3a', belly: '#e2d0a4', pattern: '#2a1f16', type: 'stripes', count: 5, scale: 61 },
    eye: '#e8c020',
    rig: {
      torso: [
        [0, 1.25, 0.28, 0.36, 'pelvis'],
        [0.42, 1.2, 0.33, 0.42, 'spine'],
        [0.85, 1.22, 0.28, 0.36, 'chest'],
        [1.12, 1.42, 0.15, 0.18, 'neck'],
        [1.28, 1.68, 0.12, 0.14, 'neck'],
        [1.4, 1.86, 0.13, 0.15, 'head'],
        [1.66, 1.82, 0.1, 0.1, 'nb'],
        [1.92, 1.77, 0.05, 0.05, 'nb'],
      ],
      tail: [
        [-0.42, 1.3, 0.2, 0.24],
        [-0.9, 1.33, 0.12, 0.14],
        [-1.4, 1.33, 0.08, 0.09],
        [-1.85, 1.3, 0.05, 0.055],
        [-2.25, 1.27, 0.02, 0.025, 'nb'],
      ],
      jaw: [
        [1.42, 1.74, 0.11, 0.075],
        [1.66, 1.7, 0.08, 0.05],
        [1.9, 1.7, 0.04, 0.03],
      ],
      teeth: { from: 1.5, to: 1.88, n: 8, len: 0.035 },
      eye: { z: 1.46, a: 0.5, r: 0.03 },
      hind: [
        [0.2, 1.2, 0.06, 0.24],
        [0.24, 0.75, 0.33, 0.12],
        [0.22, 0.3, -0.06, 0.06],
        [0.21, 0.05, 0.07, 0.055],
        [0.21, 0.025, 0.25, 0.03],
      ],
      arms: [
        [0.2, 1.08, 0.9, 0.08],
        [0.24, 0.9, 0.82, 0.06],
        [0.24, 0.78, 1.02, 0.04],
        [0.23, 0.66, 1.16, 0.02],
      ],
      claws: true,
      extras: [{ type: 'sickle' }],
    },
  },

  trike: {
    id: 'trike',
    name: 'Triceratops',
    short: 'Triceratops',
    diet: 'herbivoro',
    playable: true,
    desc: 'Tanque com chifres. Herbívoro resistente que enfrenta predadores de frente.',
    gait: 'quad',
    attack: 'horns',
    stats: { health: 1000, damage: 130, bleed: 4, walk: 2.4, run: 7.0, turn: 1.6, stamina: 100, reach: 1.3, armor: 0.35 },
    survival: { hunger: 10, thirst: 11, appetite: 220, growMin: 20 },
    hatchScale: 0.22,
    ai: { herd: [2, 5], aggression: 0.5, fear: 0.3, roam: 0.5, defend: true },
    voice: { pitch: 0.6, rough: 0.7 },
    skin: { base: '#6f7a48', belly: '#c9c29a', pattern: '#3c3a26', type: 'bands', count: 2, scale: 46 },
    accent: { base: '#a8492c', belly: '#d9a060', pattern: '#2d1e14', type: 'spots', count: 3, scale: 32, strength: 0.9 },
    eye: '#7a4a18',
    rig: {
      torso: [
        [0, 2.25, 0.95, 0.92, 'pelvis'],
        [1.2, 2.1, 1.22, 1.18, 'spine'],
        [2.3, 1.9, 1.0, 1.0, 'chest'],
        [3.0, 1.75, 0.62, 0.66, 'neck'],
        [3.55, 1.7, 0.6, 0.62, 'head'],
        [4.2, 1.45, 0.42, 0.46, 'nb'],
        [4.8, 1.15, 0.14, 0.22, 'nb'],
      ],
      tail: [
        [-1.1, 2.15, 0.66, 0.7],
        [-2.3, 1.9, 0.42, 0.46],
        [-3.4, 1.55, 0.26, 0.28],
        [-4.3, 1.25, 0.13, 0.14],
        [-4.9, 1.05, 0.04, 0.04, 'nb'],
      ],
      jaw: [
        [3.7, 1.3, 0.45, 0.3],
        [4.2, 1.15, 0.32, 0.2],
        [4.7, 1.0, 0.1, 0.1],
      ],
      eye: { z: 3.85, a: 0.45, r: 0.06 },
      hind: [
        [0.72, 2.05, 0.1, 0.72],
        [0.82, 1.35, 0.5, 0.42],
        [0.82, 0.5, 0.05, 0.27],
        [0.84, 0.1, 0.18, 0.26],
        [0.86, 0.05, 0.45, 0.15],
      ],
      front: [
        [0.78, 1.55, 2.4, 0.5],
        [0.9, 1.0, 2.15, 0.32],
        [0.9, 0.38, 2.38, 0.21],
        [0.9, 0.08, 2.45, 0.2],
        [0.92, 0.04, 2.68, 0.12],
      ],
      extras: [
        { type: 'frill', z: 3.4, y: 2.0, r: 1.35, tilt: 0.62 },
        { type: 'horn', x: 0.3, y: 2.05, z: 3.95, dir: [0.08, 0.5, 1], len: 1.05, r: 0.12, curl: 0.25 },
        { type: 'horn', x: 0, y: 1.6, z: 4.5, dir: [0, 1, 0.5], len: 0.34, r: 0.09, curl: 0.1 },
      ],
    },
  },

  stego: {
    id: 'stego',
    name: 'Estegossauro',
    short: 'Estegossauro',
    diet: 'herbivoro',
    playable: true,
    desc: 'Placas nas costas e cauda com espinhos (thagomizer) que fere muito.',
    gait: 'quad',
    attack: 'tail',
    stats: { health: 850, damage: 150, bleed: 6, walk: 2.0, run: 5.4, turn: 1.6, stamina: 100, reach: 2.4, armor: 0.25 },
    survival: { hunger: 10, thirst: 11, appetite: 200, growMin: 18 },
    hatchScale: 0.22,
    ai: { herd: [2, 4], aggression: 0.4, fear: 0.4, roam: 0.45, defend: true },
    voice: { pitch: 0.75, rough: 0.5 },
    skin: { base: '#7a6f52', belly: '#d0c4a0', pattern: '#4a553a', type: 'spots', count: 3, scale: 50 },
    accent: { base: '#b4643a', belly: '#d8a85a', pattern: '#5a2a18', type: 'bands', count: 4, scale: 32, strength: 0.6 },
    eye: '#5a3a14',
    rig: {
      torso: [
        [0, 2.45, 0.9, 1.0, 'pelvis'],
        [1.0, 2.3, 1.0, 1.18, 'spine'],
        [2.0, 1.85, 0.8, 0.92, 'chest'],
        [2.8, 1.4, 0.45, 0.5, 'neck'],
        [3.35, 1.1, 0.32, 0.34, 'neck'],
        [3.75, 0.95, 0.25, 0.27, 'head'],
        [4.35, 0.8, 0.1, 0.13, 'nb'],
      ],
      tail: [
        [-1.2, 2.5, 0.62, 0.72],
        [-2.4, 2.3, 0.4, 0.45],
        [-3.5, 2.0, 0.25, 0.28],
        [-4.4, 1.75, 0.14, 0.15],
        [-5.1, 1.6, 0.04, 0.04, 'nb'],
      ],
      jaw: [
        [3.8, 0.84, 0.22, 0.14],
        [4.3, 0.74, 0.09, 0.06],
      ],
      eye: { z: 3.82, a: 0.4, r: 0.04 },
      hind: [
        [0.65, 2.25, 0.05, 0.65],
        [0.75, 1.38, 0.45, 0.38],
        [0.75, 0.45, 0.05, 0.22],
        [0.76, 0.1, 0.2, 0.22],
        [0.78, 0.04, 0.48, 0.13],
      ],
      front: [
        [0.62, 1.5, 2.1, 0.42],
        [0.75, 0.92, 1.88, 0.26],
        [0.75, 0.35, 2.05, 0.17],
        [0.76, 0.08, 2.12, 0.17],
        [0.78, 0.04, 2.35, 0.1],
      ],
      extras: [
        { type: 'plates', from: -4.0, to: 2.7, n: 15, h: 0.95 },
        { type: 'spikes', z: -4.5 },
      ],
    },
  },

  para: {
    id: 'para',
    name: 'Parassaurolofo',
    short: 'Parassaurolofo',
    diet: 'herbivoro',
    playable: true,
    desc: 'Herbívoro veloz que vive em bandos. A crista amplifica seu chamado.',
    gait: 'biped',
    attack: 'tail',
    stats: { health: 480, damage: 40, bleed: 1, walk: 3.0, run: 10.2, turn: 2.6, stamina: 120, reach: 2.0, armor: 0.1 },
    survival: { hunger: 10, thirst: 12, appetite: 120, growMin: 16 },
    hatchScale: 0.22,
    ai: { herd: [3, 6], aggression: 0.1, fear: 1.0, roam: 0.7 },
    voice: { pitch: 0.9, rough: 0.15, horn: true },
    skin: { base: '#7a5a3a', belly: '#dcc49a', pattern: '#3a2a1c', type: 'stripes', count: 4, scale: 54 },
    accent: { base: '#b8482a', belly: '#e0a050', pattern: '#5a1c10', type: 'bands', count: 3, scale: 36 },
    eye: '#6a4818',
    rig: {
      torso: [
        [0, 2.7, 0.7, 0.85, 'pelvis'],
        [1.0, 2.62, 0.82, 0.98, 'spine'],
        [1.9, 2.6, 0.68, 0.84, 'chest'],
        [2.55, 2.95, 0.38, 0.46, 'neck'],
        [3.05, 3.38, 0.3, 0.36, 'neck'],
        [3.4, 3.62, 0.3, 0.36, 'head'],
        [3.95, 3.5, 0.24, 0.25, 'nb'],
        [4.45, 3.32, 0.2, 0.12, 'nb'],
      ],
      tail: [
        [-1.1, 2.75, 0.5, 0.75],
        [-2.3, 2.6, 0.34, 0.55],
        [-3.5, 2.4, 0.22, 0.36],
        [-4.6, 2.2, 0.12, 0.18],
        [-5.5, 2.05, 0.03, 0.04, 'nb'],
      ],
      jaw: [
        [3.45, 3.38, 0.26, 0.18],
        [3.95, 3.25, 0.2, 0.12],
        [4.38, 3.2, 0.17, 0.07],
      ],
      eye: { z: 3.5, a: 0.45, r: 0.045 },
      hind: [
        [0.5, 2.6, 0.1, 0.55],
        [0.6, 1.65, 0.62, 0.32],
        [0.58, 0.62, -0.1, 0.17],
        [0.57, 0.1, 0.25, 0.15],
        [0.57, 0.04, 0.6, 0.08],
      ],
      arms: [
        [0.5, 2.25, 1.95, 0.18],
        [0.56, 1.65, 2.05, 0.12],
        [0.56, 1.15, 2.15, 0.09],
        [0.56, 0.98, 2.25, 0.05],
      ],
      extras: [
        {
          type: 'crest',
          pts: [
            [3.8, 3.42, 0.13],
            [4.15, 3.05, 0.12],
            [4.5, 2.62, 0.1],
            [4.72, 2.25, 0.07],
          ],
        },
      ],
    },
  },

  brachio: {
    id: 'brachio',
    name: 'Braquiossauro',
    short: 'Braquiossauro',
    diet: 'herbivoro',
    playable: false,
    desc: 'Gigante de pescoço longo. Pacífico, mas esmaga quem o ameaça.',
    gait: 'quad',
    attack: 'stomp',
    stats: { health: 3600, damage: 240, bleed: 2, walk: 2.1, run: 3.8, turn: 0.6, stamina: 100, reach: 3.5, armor: 0.4 },
    survival: { hunger: 6, thirst: 8, appetite: 800, growMin: 40 },
    hatchScale: 0.15,
    ai: { herd: [1, 3], aggression: 0.2, fear: 0.0, roam: 0.35, defend: true, browser: true },
    voice: { pitch: 0.3, rough: 0.2, horn: true },
    skin: { base: '#6c736c', belly: '#b9b6a0', pattern: '#454b44', type: 'mottled', count: 2, scale: 39 },
    eye: '#3a2a14',
    rig: {
      torso: [
        [0, 4.65, 1.5, 1.5, 'pelvis'],
        [2.0, 4.95, 1.9, 1.9, 'spine'],
        [3.8, 5.35, 1.7, 1.8, 'chest'],
        [5.2, 6.3, 1.0, 1.05, 'neck'],
        [6.2, 7.7, 0.7, 0.72, 'neck'],
        [7.0, 9.3, 0.55, 0.56, 'neck'],
        [7.6, 10.9, 0.45, 0.46, 'neck'],
        [8.05, 12.2, 0.38, 0.4, 'neck'],
        [8.45, 12.85, 0.42, 0.48, 'head'],
        [9.3, 12.7, 0.22, 0.24, 'nb'],
      ],
      tail: [
        [-1.8, 4.6, 1.0, 1.1],
        [-3.8, 4.2, 0.65, 0.7],
        [-5.8, 3.6, 0.4, 0.42],
        [-7.8, 3.0, 0.22, 0.24],
        [-9.6, 2.5, 0.1, 0.1],
        [-11, 2.2, 0.03, 0.03, 'nb'],
      ],
      jaw: [
        [8.55, 12.6, 0.33, 0.2],
        [9.2, 12.52, 0.18, 0.1],
      ],
      eye: { z: 8.6, a: 0.5, r: 0.07 },
      hind: [
        [1.1, 4.35, 0.2, 1.1],
        [1.25, 2.5, 0.6, 0.7],
        [1.25, 0.8, 0.3, 0.5],
        [1.25, 0.2, 0.45, 0.5],
        [1.27, 0.08, 0.9, 0.3],
      ],
      front: [
        [1.15, 5.0, 3.9, 0.9],
        [1.3, 3.0, 3.6, 0.6],
        [1.3, 0.9, 3.8, 0.45],
        [1.3, 0.2, 3.9, 0.45],
        [1.32, 0.08, 4.2, 0.28],
      ],
      extras: [],
    },
  },
};

export const PLAYABLE = Object.values(SPECIES).filter((s) => s.playable);

// População alvo ao redor do jogador
export const POPULATION = { trex: 2, raptor: 6, trike: 7, stego: 5, para: 10, brachio: 4 };

export const QUALITY = {
  baixa: { label: 'Baixa', pixelRatio: 0.75, shadows: false, shadowSize: 1024, grass: 2500, trees: 0.55, view: 320, ring: 10 },
  media: { label: 'Média', pixelRatio: 1, shadows: true, shadowSize: 1024, grass: 6000, trees: 0.8, view: 420, ring: 12 },
  alta: { label: 'Alta', pixelRatio: 1.5, shadows: true, shadowSize: 2048, grass: 11000, trees: 1, view: 520, ring: 16 },
};

// Duração do dia: 24 h do jogo em 20 min reais
export const DAY_SECONDS = 20 * 60;

export function stageName(g) {
  if (g < 0.25) return 'Filhote';
  if (g < 0.6) return 'Juvenil';
  if (g < 1) return 'Subadulto';
  return 'Adulto';
}

const KEY = 'dinossauros-config';
export function loadSettings() {
  const def = {
    quality: /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ? 'baixa' : 'media',
    sensitivity: 1,
    volume: 0.8,
    invertY: false,
  };
  try {
    return { ...def, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch (e) {
    return def;
  }
}
export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ quality: s.quality, sensitivity: s.sensitivity, volume: s.volume, invertY: s.invertY }));
  } catch (e) {
    /* armazenamento indisponível */
  }
}
export function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem(KEY + '-recordes') || '{}');
  } catch (e) {
    return {};
  }
}
export function saveRecords(r) {
  try {
    localStorage.setItem(KEY + '-recordes', JSON.stringify(r));
  } catch (e) {
    /* armazenamento indisponível */
  }
}
