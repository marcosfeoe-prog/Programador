// Modelador procedural de carros (three.js).
// Cada carro é montado a partir de perfis ao longo do comprimento (seções transversais),
// com caixas de roda recortadas, estufa (vidros + teto), rodas detalhadas e decalques
// projetados (faróis, grade, entradas de ar, linhas de porta, faixas de pintura).
// Usado só pela ferramenta de renderização (tools/render.html) para gerar as imagens
// recortadas em assets/cars/.
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Tipos de carroceria. Distâncias em metros; "d" é medido a partir da frente.
// Chaves de perfil: [d, valor]. hw é fração de W/2.
// ---------------------------------------------------------------------------
export const TYPES = {
  sport: {
    L: 4.52, W: 1.86, wr: 0.335, tw: 0.27, fo: 0.98, wb: 2.45, rs: 0.17, endF: 0.3, endR: 0.38,
    yb: [[0, 0.3], [0.25, 0.16], [4.2, 0.17], [4.52, 0.3]],
    top: [[0, 0.5], [0.3, 0.66], [0.98, 0.79], [1.55, 0.8], [2.6, 0.86], [3.43, 0.9], [4.15, 0.84], [4.52, 0.66]],
    dip: [[0, 0], [0.5, 0.08], [1.25, 0.08], [1.6, 0.03], [2.9, 0.02], [3.43, 0.06], [4.52, 0]],
    hw: [[0, 0.86], [0.5, 0.96], [0.98, 1], [1.8, 0.96], [3.43, 1.02], [4.2, 0.97], [4.52, 0.88]],
    gh: { ws: 1.55, roofF: 2.2, roofR: 2.75, rw: 4.12, roofY: 1.29, inset: 0.07, tumble: 0.2, bp: 2.75 },
    lights: 'round', grille: 'none', intake: 'triple', lightY: -0.07, lightZ: 0.66, lightW: 0.28, lightH: 0.2,
  },
  super: {
    L: 4.6, W: 2.03, wr: 0.35, tw: 0.3, fo: 1.05, wb: 2.7, rs: 0.1, endF: 0.22, endR: 0.22,
    yb: [[0, 0.2], [0.3, 0.12], [4.3, 0.14], [4.6, 0.3]],
    top: [[0, 0.4], [0.45, 0.6], [1.05, 0.78], [1.7, 0.8], [3.0, 0.92], [3.75, 0.97], [4.3, 0.93], [4.6, 0.82]],
    dip: [[0, 0], [0.5, 0.12], [1.3, 0.1], [1.75, 0.03], [2.9, 0.02], [3.4, 0.1], [4.2, 0.08], [4.6, 0]],
    hw: [[0, 0.84], [0.6, 0.95], [1.05, 1], [2.0, 0.94], [3.0, 0.98], [3.75, 1.03], [4.3, 1], [4.6, 0.9]],
    gh: { ws: 1.5, roofF: 2.22, roofR: 2.6, rw: 3.65, roofY: 1.14, inset: 0.12, tumble: 0.24, bp: 2.62 },
    lights: 'slim', grille: 'none', intake: 'wide', side: true, lightY: -0.05, lightZ: 0.7, lightW: 0.42, lightH: 0.1,
  },
  hyper: {
    L: 4.7, W: 2.05, wr: 0.355, tw: 0.31, fo: 1.08, wb: 2.68, rs: 0.12, endF: 0.24, endR: 0.2,
    yb: [[0, 0.18], [0.3, 0.11], [4.4, 0.13], [4.7, 0.28]],
    top: [[0, 0.38], [0.45, 0.6], [1.08, 0.8], [1.6, 0.78], [3.0, 0.9], [3.76, 0.97], [4.45, 0.95], [4.7, 0.86]],
    dip: [[0, 0], [0.5, 0.14], [1.3, 0.12], [1.7, 0.03], [2.9, 0.02], [3.3, 0.12], [4.3, 0.1], [4.7, 0.02]],
    hw: [[0, 0.82], [0.6, 0.96], [1.08, 1.02], [2.0, 0.92], [3.0, 0.97], [3.76, 1.04], [4.4, 1], [4.7, 0.92]],
    gh: { ws: 1.45, roofF: 2.12, roofR: 2.55, rw: 3.7, roofY: 1.12, inset: 0.14, tumble: 0.25, bp: 2.6 },
    lights: 'slim', grille: 'none', intake: 'wide', side: true, wing: true, lightY: -0.05, lightZ: 0.72, lightW: 0.4, lightH: 0.09,
  },
  gt: {
    L: 4.66, W: 1.97, wr: 0.35, tw: 0.29, fo: 0.92, wb: 2.72, rs: 0.13, endF: 0.26, endR: 0.3,
    yb: [[0, 0.24], [0.3, 0.14], [4.35, 0.16], [4.66, 0.3]],
    top: [[0, 0.52], [0.35, 0.68], [0.92, 0.79], [1.6, 0.83], [2.0, 0.85], [3.0, 0.9], [3.64, 0.94], [4.3, 0.9], [4.66, 0.78]],
    dip: [[0, 0], [0.5, 0.08], [1.6, 0.05], [2.0, 0.02], [3.2, 0.02], [4.66, 0]],
    hw: [[0, 0.84], [0.5, 0.96], [0.92, 1], [2.0, 0.95], [3.64, 1.01], [4.35, 0.97], [4.66, 0.88]],
    gh: { ws: 2.0, roofF: 2.6, roofR: 3.05, rw: 4.12, roofY: 1.28, inset: 0.08, tumble: 0.22, bp: 3.05 },
    lights: 'slim', grille: 'mesh', intake: 'none', lightY: -0.06, lightZ: 0.68, lightW: 0.34, lightH: 0.11,
  },
  muscle: {
    L: 4.95, W: 1.95, wr: 0.36, tw: 0.3, fo: 0.95, wb: 2.95, rs: 0.07, endF: 0.12, endR: 0.12, endV: 0.35,
    yb: [[0, 0.28], [0.2, 0.18], [4.7, 0.2], [4.95, 0.3]],
    top: [[0, 0.8], [0.2, 0.85], [0.95, 0.88], [2.0, 0.9], [3.9, 0.93], [4.8, 0.92], [4.95, 0.86]],
    dip: [[0, 0], [0.6, 0.03], [1.9, 0.02], [4.95, 0]],
    hw: [[0, 0.93], [0.4, 0.98], [0.95, 1], [3.9, 1.01], [4.7, 0.99], [4.95, 0.95]],
    gh: { ws: 2.05, roofF: 2.65, roofR: 3.35, rw: 4.15, roofY: 1.36, inset: 0.08, tumble: 0.2, bp: 3.0 },
    lights: 'quad', grille: 'bars', intake: 'none', scoop: true, lightY: -0.12, lightZ: 0.7, lightW: 0.3, lightH: 0.14, grilleW: 0.95, grilleH: 0.22,
  },
  classic: {
    L: 4.45, W: 1.79, wr: 0.34, tw: 0.22, fo: 0.9, wb: 2.4, rs: 0.28, endF: 0.4, endR: 0.48, rimRatio: 0.62,
    yb: [[0, 0.32], [0.4, 0.21], [4.05, 0.21], [4.45, 0.34]],
    top: [[0, 0.55], [0.35, 0.73], [0.9, 0.86], [1.3, 0.84], [2.0, 0.83], [3.3, 0.85], [4.0, 0.73], [4.45, 0.56]],
    dip: [[0, 0], [0.6, 0.09], [1.6, 0.04], [2.0, 0], [3.0, 0.02], [3.3, 0.07], [4.45, 0]],
    hw: [[0, 0.8], [0.5, 0.95], [0.9, 1], [1.7, 0.95], [3.3, 0.99], [4.0, 0.92], [4.45, 0.8]],
    gh: { ws: 1.85, roofF: 2.35, roofR: 2.78, rw: 3.6, roofY: 1.25, inset: 0.1, tumble: 0.24, bp: 2.62 },
    lights: 'round', grille: 'chrome', intake: 'none', lightY: -0.06, lightZ: 0.7, lightW: 0.2, lightH: 0.2, grilleW: 0.55, grilleH: 0.2,
  },
  sedan: {
    L: 4.86, W: 1.88, wr: 0.34, tw: 0.26, fo: 0.92, wb: 2.88, rs: 0.1, endF: 0.2, endR: 0.2, endV: 0.5,
    yb: [[0, 0.28], [0.25, 0.18], [4.55, 0.2], [4.86, 0.34]],
    top: [[0, 0.68], [0.3, 0.77], [0.92, 0.82], [1.7, 0.88], [3.0, 0.94], [3.8, 0.98], [4.7, 0.98], [4.86, 0.9]],
    dip: [[0, 0], [0.6, 0.03], [1.6, 0.01], [4.86, 0]],
    hw: [[0, 0.88], [0.4, 0.97], [0.92, 1], [3.8, 1], [4.6, 0.97], [4.86, 0.9]],
    gh: { ws: 1.75, roofF: 2.4, roofR: 3.4, rw: 4.05, roofY: 1.45, inset: 0.07, tumble: 0.17, bp: 2.95 },
    lights: 'slim', grille: 'bars', intake: 'lip', lightY: -0.06, lightZ: 0.7, lightW: 0.34, lightH: 0.1, grilleW: 0.6, grilleH: 0.2,
  },
  ev: {
    L: 4.95, W: 1.95, wr: 0.36, tw: 0.27, fo: 0.95, wb: 2.98, rs: 0.12, endF: 0.24, endR: 0.22,
    yb: [[0, 0.24], [0.25, 0.15], [4.65, 0.17], [4.95, 0.3]],
    top: [[0, 0.6], [0.3, 0.72], [0.95, 0.79], [1.7, 0.84], [3.0, 0.9], [3.93, 0.94], [4.75, 0.93], [4.95, 0.84]],
    dip: [[0, 0], [0.6, 0.05], [1.6, 0.01], [4.95, 0]],
    hw: [[0, 0.86], [0.4, 0.97], [0.95, 1], [3.93, 1.01], [4.7, 0.96], [4.95, 0.88]],
    gh: { ws: 1.6, roofF: 2.35, roofR: 3.3, rw: 4.55, roofY: 1.4, inset: 0.08, tumble: 0.2, bp: 2.9 },
    lights: 'blade', grille: 'none', intake: 'lip', lightY: -0.05, lightZ: 0.7, lightW: 0.4, lightH: 0.07,
  },
  hatch: {
    L: 4.1, W: 1.79, wr: 0.32, tw: 0.24, fo: 0.86, wb: 2.62, rs: 0.1, endF: 0.2, endR: 0.12, endV: 0.5,
    yb: [[0, 0.28], [0.25, 0.18], [3.85, 0.2], [4.1, 0.34]],
    top: [[0, 0.68], [0.3, 0.78], [0.86, 0.84], [1.6, 0.92], [3.48, 0.98], [3.95, 0.95], [4.1, 0.86]],
    dip: [[0, 0], [0.6, 0.02], [1.4, 0.01], [4.1, 0]],
    hw: [[0, 0.88], [0.4, 0.97], [0.86, 1], [3.48, 1], [4.0, 0.97], [4.1, 0.92]],
    gh: { ws: 1.45, roofF: 2.05, roofR: 3.2, rw: 3.98, roofY: 1.47, inset: 0.07, tumble: 0.16, bp: 2.6 },
    lights: 'slim', grille: 'bars', intake: 'lip', lightY: -0.06, lightZ: 0.68, lightW: 0.32, lightH: 0.11, grilleW: 0.55, grilleH: 0.12,
  },
  jdm: {
    L: 4.6, W: 1.79, wr: 0.33, tw: 0.26, fo: 0.92, wb: 2.67, rs: 0.09, endF: 0.17, endR: 0.14, endV: 0.5,
    yb: [[0, 0.24], [0.3, 0.15], [4.3, 0.17], [4.6, 0.3]],
    top: [[0, 0.62], [0.3, 0.72], [0.92, 0.78], [1.7, 0.84], [3.59, 0.92], [4.4, 0.94], [4.6, 0.86]],
    dip: [[0, 0], [0.5, 0.03], [1.5, 0.01], [4.6, 0]],
    hw: [[0, 0.9], [0.4, 0.98], [0.92, 1.01], [2.0, 0.98], [3.59, 1.02], [4.4, 0.99], [4.6, 0.92]],
    gh: { ws: 1.75, roofF: 2.35, roofR: 3.05, rw: 3.85, roofY: 1.34, inset: 0.07, tumble: 0.18, bp: 2.75 },
    lights: 'square', grille: 'mesh', intake: 'lip', wing: true, lightY: -0.06, lightZ: 0.7, lightW: 0.34, lightH: 0.12, grilleW: 0.7, grilleH: 0.14,
  },
  suv: {
    L: 4.85, W: 1.98, wr: 0.4, tw: 0.3, fo: 0.92, wb: 2.9, rs: 0.1, endF: 0.15, endR: 0.1, endV: 0.35,
    yb: [[0, 0.44], [0.3, 0.32], [4.55, 0.34], [4.85, 0.46]],
    top: [[0, 0.94], [0.3, 1.03], [0.92, 1.08], [1.6, 1.12], [3.82, 1.16], [4.75, 1.15], [4.85, 1.08]],
    dip: [[0, 0], [0.6, 0.02], [1.4, 0.01], [4.85, 0]],
    hw: [[0, 0.92], [0.4, 0.98], [0.92, 1], [3.82, 1], [4.7, 0.98], [4.85, 0.94]],
    gh: { ws: 1.5, roofF: 2.1, roofR: 4.55, rw: 4.8, roofY: 1.82, inset: 0.07, tumble: 0.14, bp: 2.75, cp: 3.75 },
    lights: 'square', grille: 'bars', intake: 'lip', lightY: -0.08, lightZ: 0.7, lightW: 0.34, lightH: 0.12, grilleW: 0.85, grilleH: 0.24,
  },
  pickup: {
    L: 5.6, W: 2.03, wr: 0.41, tw: 0.31, fo: 0.98, wb: 3.6, rs: 0.07, endF: 0.1, endR: 0.06, endV: 0.3,
    yb: [[0, 0.46], [0.3, 0.36], [5.3, 0.38], [5.6, 0.48]],
    top: [[0, 1.02], [0.3, 1.08], [0.98, 1.12], [1.8, 1.16], [5.5, 1.16], [5.6, 1.1]],
    dip: [[0, 0], [0.6, 0.02], [1.6, 0.01], [5.6, 0]],
    hw: [[0, 0.95], [0.4, 0.99], [0.98, 1], [5.6, 1]],
    gh: { ws: 1.72, roofF: 2.25, roofR: 3.05, rw: 3.25, roofY: 1.93, inset: 0.08, tumble: 0.14, bp: 2.62 },
    bed: [3.35, 5.48],
    lights: 'square', grille: 'bars', intake: 'none', lightY: -0.1, lightZ: 0.72, lightW: 0.32, lightH: 0.16, grilleW: 1.0, grilleH: 0.34,
  },
  roadster: {
    L: 4.0, W: 1.73, wr: 0.32, tw: 0.23, fo: 0.82, wb: 2.33, rs: 0.16, endF: 0.3, endR: 0.32,
    yb: [[0, 0.26], [0.3, 0.15], [3.75, 0.16], [4.0, 0.3]],
    top: [[0, 0.5], [0.3, 0.62], [0.82, 0.72], [1.5, 0.76], [2.5, 0.8], [3.15, 0.82], [3.8, 0.78], [4.0, 0.65]],
    dip: [[0, 0], [0.5, 0.06], [1.4, 0.04], [1.7, 0], [4.0, 0]],
    hw: [[0, 0.85], [0.5, 0.96], [0.82, 1], [1.8, 0.96], [3.15, 1.01], [3.8, 0.96], [4.0, 0.86]],
    gh: { ws: 1.55, roofF: 1.9, roofR: 1.9, rw: 2.02, roofY: 1.08, inset: 0.1, tumble: 0.12, bp: 99, open: true },
    cockpit: 0.95,
    lights: 'round', grille: 'mesh', intake: 'none', lightY: -0.06, lightZ: 0.66, lightW: 0.2, lightH: 0.16, grilleW: 0.42, grilleH: 0.12,
  },
  wagon: {
    L: 4.9, W: 1.88, wr: 0.34, tw: 0.26, fo: 0.92, wb: 2.92, rs: 0.1, endF: 0.2, endR: 0.14, endV: 0.45,
    yb: [[0, 0.28], [0.25, 0.18], [4.6, 0.2], [4.9, 0.34]],
    top: [[0, 0.68], [0.3, 0.77], [0.92, 0.82], [1.7, 0.88], [3.0, 0.94], [3.84, 0.97], [4.8, 0.97], [4.9, 0.9]],
    dip: [[0, 0], [0.6, 0.03], [1.6, 0.01], [4.9, 0]],
    hw: [[0, 0.88], [0.4, 0.97], [0.92, 1], [3.84, 1], [4.7, 0.98], [4.9, 0.92]],
    gh: { ws: 1.75, roofF: 2.4, roofR: 4.5, rw: 4.82, roofY: 1.47, inset: 0.07, tumble: 0.15, bp: 2.95, cp: 3.98 },
    lights: 'slim', grille: 'bars', intake: 'lip', lightY: -0.06, lightZ: 0.7, lightW: 0.34, lightH: 0.1, grilleW: 0.6, grilleH: 0.18,
  },
  van: {
    L: 4.5, W: 1.75, wr: 0.33, tw: 0.24, fo: 0.72, wb: 2.4, rs: 0.14, endF: 0.28, endR: 0.12, endV: 0.4,
    yb: [[0, 0.38], [0.2, 0.3], [4.3, 0.32], [4.5, 0.42]],
    top: [[0, 0.98], [0.15, 1.04], [0.6, 1.08], [4.4, 1.1], [4.5, 1.04]],
    dip: [[0, 0], [4.5, 0]],
    hw: [[0, 0.9], [0.3, 0.98], [4.3, 0.98], [4.5, 0.94]],
    gh: { ws: 0.32, roofF: 0.78, roofR: 4.32, rw: 4.47, roofY: 1.98, inset: 0.05, tumble: 0.1, bp: 1.35, cp: 2.45 },
    lights: 'round', grille: 'none', intake: 'none', lightY: -0.3, lightZ: 0.7, lightW: 0.2, lightH: 0.2,
  },
  supercarro: {
    L: 4.85, W: 2.06, wr: 0.36, tw: 0.32, fo: 1.1, wb: 2.72, rs: 0.05, endF: 0.16, endR: 0.12, endV: 0.4,
    yb: [[0, 0.16], [0.3, 0.1], [4.55, 0.12], [4.85, 0.26]],
    top: [[0, 0.34], [0.5, 0.56], [1.1, 0.74], [1.6, 0.78], [3.0, 0.92], [3.82, 0.98], [4.6, 0.96], [4.85, 0.88]],
    dip: [[0, 0], [0.5, 0.1], [1.3, 0.08], [1.6, 0.02], [3.0, 0.02], [3.4, 0.1], [4.4, 0.08], [4.85, 0]],
    hw: [[0, 0.8], [0.6, 0.94], [1.1, 1], [2.0, 0.92], [3.0, 0.98], [3.82, 1.05], [4.6, 1.02], [4.85, 0.94]],
    gh: { ws: 1.4, roofF: 2.35, roofR: 2.65, rw: 3.95, roofY: 1.13, inset: 0.14, tumble: 0.28, bp: 2.75, wsLin: true },
    lights: 'slim', grille: 'none', intake: 'wide', side: true, lightY: -0.04, lightZ: 0.72, lightW: 0.44, lightH: 0.08,
  },
  hipercarro: {
    L: 4.75, W: 2.1, wr: 0.36, tw: 0.33, fo: 1.1, wb: 2.75, rs: 0.18, endF: 0.3, endR: 0.18,
    yb: [[0, 0.14], [0.3, 0.09], [4.5, 0.11], [4.75, 0.24]],
    top: [[0, 0.36], [0.5, 0.62], [1.1, 0.82], [1.6, 0.7], [2.8, 0.74], [3.85, 0.98], [4.5, 0.96], [4.75, 0.9]],
    dip: [[0, 0], [0.5, 0.18], [1.1, 0.2], [1.6, 0.06], [2.8, 0.06], [3.4, 0.18], [4.3, 0.16], [4.75, 0.04]],
    hw: [[0, 0.78], [0.6, 0.96], [1.1, 1.03], [1.9, 0.86], [2.8, 0.88], [3.85, 1.05], [4.5, 1.02], [4.75, 0.95]],
    gh: { ws: 1.35, roofF: 2.05, roofR: 2.4, rw: 3.4, roofY: 1.08, inset: 0.42, tumble: 0.12, bp: 99 },
    lights: 'slim', grille: 'none', intake: 'wide', side: true, wing: true, wingH: 0.28, lightY: -0.05, lightZ: 0.74, lightW: 0.3, lightH: 0.08,
  },
  luxo: {
    L: 5.55, W: 2.0, wr: 0.41, tw: 0.27, fo: 0.95, wb: 3.3, rs: 0.07, endF: 0.1, endR: 0.14, endV: 0.3, rimRatio: 0.68,
    yb: [[0, 0.36], [0.25, 0.24], [5.3, 0.26], [5.55, 0.4]],
    top: [[0, 0.98], [0.2, 1.02], [0.95, 1.04], [2.2, 1.06], [4.25, 1.08], [5.4, 1.07], [5.55, 1.0]],
    dip: [[0, 0], [5.55, 0]],
    hw: [[0, 0.92], [0.3, 0.98], [0.95, 1], [4.25, 1], [5.4, 0.98], [5.55, 0.94]],
    gh: { ws: 2.1, roofF: 2.7, roofR: 3.95, rw: 4.6, roofY: 1.6, inset: 0.07, tumble: 0.14, bp: 3.25, cp: 4.15 },
    lights: 'slim', grille: 'temple', intake: 'lip', ornament: true, lightY: -0.18, lightZ: 0.74, lightW: 0.36, lightH: 0.11, grilleW: 0.6, grilleH: 0.34,
  },
  eletrico: {
    L: 4.75, W: 1.95, wr: 0.37, tw: 0.27, fo: 0.92, wb: 2.9, rs: 0.12, endF: 0.3, endR: 0.18, endV: 0.7,
    yb: [[0, 0.3], [0.3, 0.2], [4.45, 0.22], [4.75, 0.34]],
    top: [[0, 0.66], [0.35, 0.8], [0.92, 0.86], [1.5, 0.9], [3.82, 0.98], [4.6, 0.97], [4.75, 0.9]],
    dip: [[0, 0], [0.6, 0.02], [4.75, 0]],
    hw: [[0, 0.86], [0.5, 0.97], [0.92, 1], [3.82, 1.01], [4.6, 0.97], [4.75, 0.9]],
    gh: { ws: 1.3, roofF: 2.25, roofR: 3.5, rw: 4.62, roofY: 1.6, inset: 0.08, tumble: 0.18, bp: 2.85, glassRoof: true },
    lights: 'blade', lightbar: true, grille: 'none', intake: 'lip', rim: 'disc', lightY: -0.06, lightZ: 0, lightW: 1.4, lightH: 0.06,
  },
  vintage: {
    L: 4.4, W: 1.5, wr: 0.4, tw: 0.15, fo: 0.72, wb: 2.95, rs: 0.06, endF: 0.12, endR: 0.25, endV: 0.3, rimRatio: 0.55,
    track: 0.8, noArch: true, fenders: true, lamps: true,
    yb: [[0, 0.5], [0.2, 0.44], [4.1, 0.44], [4.4, 0.5]],
    top: [[0, 0.98], [0.15, 1.04], [1.5, 1.06], [1.75, 1.1], [3.8, 1.12], [4.4, 1.0]],
    dip: [[0, 0], [1.5, 0.03], [1.8, 0], [4.4, 0]],
    hw: [[0, 0.6], [0.2, 0.64], [1.55, 0.66], [1.8, 1], [4.0, 1], [4.4, 0.92]],
    gh: { ws: 1.82, roofF: 1.95, roofR: 3.7, rw: 3.86, roofY: 1.86, inset: 0.04, tumble: 0.06, bp: 2.75, cp: 3.3 },
    lights: 'none', grille: 'temple', intake: 'none', lightY: -0.2, lightZ: 0, lightW: 0.2, lightH: 0.2, grilleW: 0.5, grilleH: 0.48, grilleY: 0.06,
  },
  pony: {
    L: 4.65, W: 1.82, wr: 0.35, tw: 0.27, fo: 0.92, wb: 2.74, rs: 0.07, endF: 0.1, endR: 0.1, endV: 0.35,
    yb: [[0, 0.26], [0.2, 0.18], [4.45, 0.2], [4.65, 0.3]],
    top: [[0, 0.78], [0.2, 0.82], [0.92, 0.84], [1.9, 0.87], [3.66, 0.92], [4.5, 0.91], [4.65, 0.86]],
    dip: [[0, 0], [0.6, 0.03], [1.8, 0.02], [4.65, 0]],
    hw: [[0, 0.9], [0.4, 0.98], [0.92, 1], [2.2, 0.98], [3.66, 1.01], [4.5, 0.99], [4.65, 0.95]],
    gh: { ws: 2.0, roofF: 2.55, roofR: 2.95, rw: 4.3, roofY: 1.32, inset: 0.08, tumble: 0.2, bp: 3.0 },
    lights: 'none', grille: 'pony', intake: 'none', sideScoop: true, lightY: -0.1, lightZ: 0.7, lightW: 0.3, lightH: 0.14, grilleW: 1.3, grilleH: 0.22, grilleY: 0,
  },
  hiperluxo: {
    L: 4.54, W: 2.04, wr: 0.36, tw: 0.32, fo: 1.05, wb: 2.71, rs: 0.16, endF: 0.32, endR: 0.2,
    yb: [[0, 0.18], [0.3, 0.12], [4.25, 0.13], [4.54, 0.28]],
    top: [[0, 0.5], [0.35, 0.72], [1.05, 0.84], [1.6, 0.86], [2.8, 0.92], [3.76, 0.98], [4.3, 0.94], [4.54, 0.82]],
    dip: [[0, 0], [0.5, 0.07], [1.2, 0.06], [1.6, 0.02], [3.0, 0.02], [3.4, 0.06], [4.54, 0]],
    hw: [[0, 0.82], [0.5, 0.96], [1.05, 1], [2.0, 0.95], [3.0, 0.97], [3.76, 1.02], [4.3, 1], [4.54, 0.92]],
    gh: { ws: 1.6, roofF: 2.3, roofR: 2.75, rw: 3.95, roofY: 1.21, inset: 0.12, tumble: 0.24, bp: 99 },
    split: { bottom: 1.6, mid: 2.8, top: 1.95 }, cline: { bottom: 1.6, mid: 2.8, top: 1.95 },
    lights: 'quadled', grille: 'horseshoe', intake: 'wide', lightY: -0.13, lightZ: 0.6, lightW: 0.44, lightH: 0.09, grilleW: 0.36, grilleH: 0.38, grilleY: 0.08,
  },
  escultural: {
    L: 4.6, W: 2.05, wr: 0.37, tw: 0.32, fo: 1.08, wb: 2.72, rs: 0.22, endF: 0.34, endR: 0.22, endV: 0.7,
    yb: [[0, 0.16], [0.3, 0.1], [4.3, 0.12], [4.6, 0.26]],
    top: [[0, 0.4], [0.4, 0.66], [1.08, 0.86], [1.6, 0.76], [2.6, 0.8], [3.8, 1.02], [4.35, 0.98], [4.6, 0.86]],
    dip: [[0, 0], [0.5, 0.16], [1.1, 0.2], [1.6, 0.05], [2.8, 0.04], [3.4, 0.2], [4.2, 0.18], [4.6, 0.04]],
    hw: [[0, 0.78], [0.6, 0.96], [1.08, 1.04], [1.9, 0.88], [2.7, 0.9], [3.8, 1.06], [4.4, 1.02], [4.6, 0.92]],
    gh: { ws: 1.45, roofF: 2.15, roofR: 2.6, rw: 3.75, roofY: 1.15, inset: 0.2, tumble: 0.22, bp: 99 },
    cline: { bottom: 1.75, mid: 3.0, top: 2.0 }, roofScoop: 2.7,
    lights: 'slats', grille: 'horseshoe', intake: 'wide', lightY: -0.06, lightZ: 0.66, lightW: 0.34, lightH: 0.16, grilleW: 0.26, grilleH: 0.28, grilleY: 0.16,
  },
  aero: {
    L: 4.54, W: 1.93, wr: 0.35, tw: 0.3, fo: 1.02, wb: 2.67, rs: 0.18, endF: 0.3, endR: 0.24, endV: 0.65,
    yb: [[0, 0.18], [0.3, 0.11], [4.25, 0.13], [4.54, 0.28]],
    top: [[0, 0.42], [0.45, 0.62], [1.02, 0.78], [1.55, 0.76], [3.0, 0.86], [3.69, 0.92], [4.35, 0.9], [4.54, 0.82]],
    dip: [[0, 0], [0.5, 0.09], [1.25, 0.07], [1.6, 0.02], [2.9, 0.02], [3.4, 0.08], [4.54, 0]],
    hw: [[0, 0.82], [0.6, 0.96], [1.02, 1], [2.0, 0.93], [3.0, 0.96], [3.69, 1.02], [4.35, 0.99], [4.54, 0.9]],
    gh: { ws: 1.45, roofF: 2.15, roofR: 2.65, rw: 4.05, roofY: 1.2, inset: 0.1, tumble: 0.26, bp: 99, glassRoof: true },
    roof: 'black', doorScoop: true,
    lights: 'socket', grille: 'none', intake: 'wide', lightY: -0.05, lightZ: 0.64, lightW: 0.42, lightH: 0.17,
  },
  pista: {
    L: 4.7, W: 2.05, wr: 0.35, tw: 0.33, fo: 1.1, wb: 2.8, rs: 0.14, endF: 0.26, endR: 0.18,
    yb: [[0, 0.14], [0.3, 0.08], [4.4, 0.1], [4.7, 0.24]],
    top: [[0, 0.38], [0.45, 0.62], [1.1, 0.8], [1.6, 0.74], [2.9, 0.82], [3.9, 0.96], [4.5, 0.94], [4.7, 0.86]],
    dip: [[0, 0], [0.5, 0.16], [1.2, 0.14], [1.6, 0.04], [2.9, 0.04], [3.4, 0.14], [4.4, 0.12], [4.7, 0.03]],
    hw: [[0, 0.8], [0.6, 0.96], [1.1, 1.04], [1.9, 0.9], [2.9, 0.93], [3.9, 1.05], [4.5, 1.02], [4.7, 0.95]],
    gh: { ws: 1.4, roofF: 2.1, roofR: 2.5, rw: 3.6, roofY: 1.12, inset: 0.22, tumble: 0.18, bp: 99 },
    wing: true, wingH: 0.46, wingChord: 0.42, roofScoop: 2.25, fin: true, splitter: true, canards: true, side: true,
    lights: 'pagani', grille: 'none', intake: 'wide', lightY: -0.07, lightZ: 0.7, lightW: 0.2, lightH: 0.24,
  },
  rali: {
    L: 4.46, W: 1.77, wr: 0.33, tw: 0.25, fo: 0.88, wb: 2.63, rs: 0.07, endF: 0.14, endR: 0.12, endV: 0.45,
    yb: [[0, 0.24], [0.25, 0.15], [4.2, 0.17], [4.46, 0.3]],
    top: [[0, 0.7], [0.3, 0.78], [0.88, 0.82], [1.6, 0.88], [3.51, 0.96], [4.35, 0.97], [4.46, 0.9]],
    dip: [[0, 0], [0.6, 0.02], [1.5, 0.01], [4.46, 0]],
    hw: [[0, 0.9], [0.35, 0.99], [0.88, 1.02], [2.0, 0.98], [3.51, 1.02], [4.3, 0.99], [4.46, 0.93]],
    gh: { ws: 1.6, roofF: 2.25, roofR: 3.25, rw: 3.85, roofY: 1.43, inset: 0.07, tumble: 0.16, bp: 2.75 },
    wing: true, wingH: 0.2, wingChord: 0.3, wingColor: 'body', hoodVents: true, canards: true, splitter: true, rim: 'spoke6',
    lights: 'evo', grille: 'mesh', intake: 'wide', lightY: -0.08, lightZ: 0.66, lightW: 0.38, lightH: 0.13, grilleW: 0.55, grilleH: 0.14,
  },
  conceito: {
    L: 4.75, W: 2.06, wr: 0.36, tw: 0.32, fo: 1.12, wb: 2.75, rs: 0.12, endF: 0.2, endR: 0.18, endV: 0.55,
    yb: [[0, 0.12], [0.3, 0.09], [4.45, 0.11], [4.75, 0.26]],
    top: [[0, 0.36], [0.35, 0.56], [1.12, 0.8], [1.65, 0.78], [2.9, 0.86], [3.87, 0.98], [4.5, 0.96], [4.75, 0.88]],
    dip: [[0, 0], [0.5, 0.14], [1.2, 0.12], [1.7, 0.03], [2.9, 0.03], [3.4, 0.14], [4.3, 0.12], [4.75, 0.02]],
    hw: [[0, 0.84], [0.5, 0.97], [1.12, 1.03], [2.0, 0.9], [2.9, 0.92], [3.87, 1.05], [4.5, 1.02], [4.75, 0.94]],
    gh: { ws: 1.5, roofF: 2.3, roofR: 2.75, rw: 3.8, roofY: 1.14, inset: 0.14, tumble: 0.26, bp: 99 },
    roof: 'black', carbonFront: true, sills: true, side: true,
    lights: 'blade', lightbar: true, grille: 'none', intake: 'none', lightY: -0.02, lightZ: 0, lightW: 1.6, lightH: 0.045,
  },
  lmh: {
    L: 4.9, W: 2.05, wr: 0.36, tw: 0.33, fo: 1.15, wb: 2.85, rs: 0.2, endF: 0.22, endR: 0.16, endV: 0.6,
    yb: [[0, 0.12], [0.3, 0.08], [4.6, 0.1], [4.9, 0.24]],
    top: [[0, 0.5], [0.4, 0.78], [1.15, 0.9], [1.7, 0.8], [3.0, 0.82], [4.0, 0.98], [4.65, 0.96], [4.9, 0.9]],
    dip: [[0, 0.12], [0.4, 0.34], [1.15, 0.34], [1.7, 0.12], [3.0, 0.08], [3.5, 0.2], [4.5, 0.16], [4.9, 0.04]],
    hw: [[0, 0.86], [0.5, 0.98], [1.15, 1.03], [2.0, 0.9], [3.0, 0.92], [4.0, 1.05], [4.65, 1.02], [4.9, 0.95]],
    gh: { ws: 1.55, roofF: 2.25, roofR: 2.65, rw: 3.7, roofY: 1.12, inset: 0.32, tumble: 0.14, bp: 99 },
    canardStack: 3, splitter: true, fin: true, antenna: true, wing: true, wingH: 0.18, wingChord: 0.34, doorScoop: true, rim: 'multi', badge: '#2a7fff',
    lights: 'slim', grille: 'hex', intake: 'none', lightY: -0.07, lightZ: 0.74, lightW: 0.22, lightH: 0.06, grilleW: 0.78, grilleH: 0.28, grilleY: 0.24,
  },
  visor: {
    L: 4.84, W: 2.06, wr: 0.36, tw: 0.32, fo: 1.1, wb: 2.67, rs: 0.12, endF: 0.24, endR: 0.16,
    yb: [[0, 0.16], [0.3, 0.1], [4.55, 0.12], [4.84, 0.28]],
    top: [[0, 0.5], [0.35, 0.7], [1.1, 0.84], [1.6, 0.82], [2.9, 0.9], [3.77, 0.98], [4.55, 0.96], [4.84, 0.9]],
    dip: [[0, 0.02], [0.5, 0.12], [1.2, 0.1], [1.65, 0.03], [2.9, 0.02], [3.4, 0.08], [4.84, 0.02]],
    hw: [[0, 0.86], [0.5, 0.97], [1.1, 1.02], [2.0, 0.94], [3.0, 0.97], [3.77, 1.04], [4.55, 1.01], [4.84, 0.93]],
    gh: { ws: 1.55, roofF: 2.3, roofR: 2.7, rw: 3.85, roofY: 1.14, inset: 0.12, tumble: 0.26, bp: 99 },
    roof: 'black', visor: true, hoodDuct: true, fenderVents: true, wing: true, wingH: 0.06, wingChord: 0.3, wingColor: 'body', caliper: '#f2c218',
    lights: 'blade', lightbar: true, grille: 'hex', intake: 'none', lightY: -0.13, lightZ: 0, lightW: 1.6, lightH: 0.03, grilleW: 1.2, grilleH: 0.16, grilleY: 0.14,
  },
  endurance: {
    L: 5.0, W: 2.0, wr: 0.36, tw: 0.33, fo: 1.2, wb: 3.15, rs: 0.2, endF: 0.2, endR: 0.12, endV: 0.6,
    yb: [[0, 0.1], [0.3, 0.07], [4.75, 0.09], [5.0, 0.22]],
    top: [[0, 0.46], [0.4, 0.8], [1.2, 0.96], [1.75, 0.82], [3.2, 0.84], [4.35, 1.0], [4.85, 0.98], [5.0, 0.9]],
    dip: [[0, 0.16], [0.4, 0.42], [1.2, 0.44], [1.8, 0.16], [3.2, 0.1], [3.8, 0.26], [4.7, 0.22], [5.0, 0.06]],
    hw: [[0, 0.84], [0.5, 0.98], [1.2, 1.03], [2.1, 0.86], [3.2, 0.88], [4.35, 1.05], [4.85, 1.02], [5.0, 0.96]],
    gh: { ws: 1.7, roofF: 2.35, roofR: 2.7, rw: 3.7, roofY: 1.08, inset: 0.36, tumble: 0.12, bp: 99 },
    fin: true, finH: 0.5, wing: true, wingH: 0.42, wingChord: 0.42, splitter: true, antenna: true, roofScoop: 2.45, tireRing: '#f2c218', roundel: 24, rim: 'multi', rimColor: 'black',
    lights: 'blade', grille: 'none', intake: 'none', lightY: -0.05, lightZ: 0.72, lightW: 0.34, lightH: 0.04,
  },
  xbow: {
    L: 4.2, W: 2.0, wr: 0.35, tw: 0.3, fo: 0.95, wb: 2.43, rs: 0.08, endF: 0.16, endR: 0.12, endV: 0.5,
    yb: [[0, 0.2], [0.3, 0.12], [3.95, 0.14], [4.2, 0.28]],
    top: [[0, 0.42], [0.4, 0.6], [0.95, 0.7], [1.5, 0.74], [2.3, 0.8], [3.38, 0.92], [4.0, 0.9], [4.2, 0.82]],
    dip: [[0, 0.02], [0.5, 0.1], [1.2, 0.08], [1.6, 0.02], [4.2, 0.02]],
    hw: [[0, 0.6], [0.5, 0.66], [0.95, 0.68], [1.6, 0.78], [2.6, 0.92], [3.38, 1], [4.0, 0.97], [4.2, 0.9]],
    gh: { ws: 1.45, roofF: 1.75, roofR: 1.75, rw: 1.87, roofY: 0.98, inset: 0.08, tumble: 0.1, bp: 99, open: true },
    cockpit: 1.0, interior: '#17181b', trackF: 0.82, noArchFront: true, cycleFenders: true, rollHoop: true, airbox: true, noDoors: true,
    lowerColor: '#0b0c0e', lowerY: 0.42, splitter: true, wing: true, wingH: 0.3, wingChord: 0.32, rim: 'multi', rimColor: 'black',
    lights: 'xbow', grille: 'none', intake: 'wide', lightY: -0.07, lightZ: 0.62, lightW: 0.28, lightH: 0.07,
  },
  fulminea: {
    L: 4.95, W: 2.0, wr: 0.36, tw: 0.32, fo: 1.2, wb: 2.78, rs: 0.14, endF: 0.34, endR: 0.14, endV: 0.75,
    yb: [[0, 0.14], [0.35, 0.09], [4.65, 0.11], [4.95, 0.26]],
    top: [[0, 0.32], [0.5, 0.56], [1.2, 0.78], [1.75, 0.76], [3.0, 0.84], [3.98, 0.96], [4.7, 0.95], [4.95, 0.86]],
    dip: [[0, 0], [0.6, 0.1], [1.3, 0.09], [1.8, 0.02], [3.0, 0.02], [3.5, 0.1], [4.6, 0.08], [4.95, 0.02]],
    hw: [[0, 0.76], [0.6, 0.95], [1.2, 1.02], [2.1, 0.93], [3.0, 0.96], [3.98, 1.04], [4.7, 1], [4.95, 0.92]],
    gh: { ws: 1.55, roofF: 2.35, roofR: 2.85, rw: 4.15, roofY: 1.16, inset: 0.12, tumble: 0.26, bp: 99 },
    fenderLeds: true, cove: '#2a1015', sideNumber: '61', wing: true, wingH: 0.34, wingChord: 0.4, splitter: true, tireRing: '#f4f4f0',
    lights: 'blade', grille: 'none', intake: 'wide', lightY: -0.03, lightZ: 0.76, lightW: 0.34, lightH: 0.035,
  },
  camo: {
    L: 4.82, W: 2.03, wr: 0.36, tw: 0.32, fo: 0.92, wb: 2.73, rs: 0.12, endF: 0.22, endR: 0.2,
    yb: [[0, 0.16], [0.3, 0.1], [4.5, 0.12], [4.82, 0.28]],
    top: [[0, 0.56], [0.35, 0.7], [0.92, 0.82], [1.6, 0.84], [2.1, 0.86], [3.0, 0.9], [3.65, 0.96], [4.5, 0.94], [4.82, 0.86]],
    dip: [[0, 0], [0.5, 0.08], [1.6, 0.05], [2.1, 0.02], [3.2, 0.02], [3.6, 0.06], [4.82, 0]],
    hw: [[0, 0.86], [0.5, 0.97], [0.92, 1.03], [2.0, 0.95], [3.0, 0.98], [3.65, 1.05], [4.5, 1.02], [4.82, 0.94]],
    gh: { ws: 2.05, roofF: 2.65, roofR: 3.1, rw: 4.05, roofY: 1.25, inset: 0.1, tumble: 0.24, bp: 3.0 },
    finish: 'camo', hoodVents: true, splitter: true, wing: true, wingH: 0.3, wingChord: 0.34, rim: 'split', rimColor: 'black',
    lights: 'slim', grille: 'mesh', intake: 'triple', lightY: -0.06, lightZ: 0.72, lightW: 0.36, lightH: 0.09, grilleW: 0.55, grilleH: 0.16, grilleY: 0.1,
  },
  ultima: {
    L: 4.0, W: 1.88, wr: 0.34, tw: 0.3, fo: 0.95, wb: 2.5, rs: 0.18, endF: 0.3, endR: 0.16,
    yb: [[0, 0.16], [0.3, 0.1], [3.75, 0.12], [4.0, 0.26]],
    top: [[0, 0.4], [0.4, 0.62], [0.95, 0.8], [1.5, 0.78], [2.6, 0.86], [3.45, 0.94], [3.9, 0.92], [4.0, 0.86]],
    dip: [[0, 0], [0.5, 0.12], [1.2, 0.1], [1.6, 0.03], [2.6, 0.03], [3.2, 0.1], [4.0, 0.04]],
    hw: [[0, 0.82], [0.6, 0.97], [0.95, 1.02], [1.8, 0.94], [2.6, 0.96], [3.45, 1.03], [3.9, 1], [4.0, 0.94]],
    gh: { ws: 1.45, roofF: 2.1, roofR: 2.5, rw: 3.4, roofY: 1.08, inset: 0.2, tumble: 0.24, bp: 99 },
    roofScoop: 2.3, side: true, sideD: 2.92, wing: true, wingH: 0.38, wingChord: 0.38, rim: 'spoke5', rimColor: 'chrome', caliper: '#f2c218',
    lights: 'teardrop', grille: 'none', intake: 'wide', lightY: -0.05, lightZ: 0.72, lightW: 0.36, lightH: 0.15,
  },
  atlantic: {
    L: 4.6, W: 1.78, wr: 0.36, tw: 0.2, fo: 0.95, wb: 2.98, rs: 0.3, endF: 0.42, endR: 0.9, endV: 0.5, rimRatio: 0.62,
    yb: [[0, 0.36], [0.4, 0.24], [1.6, 0.22], [3.0, 0.22], [4.3, 0.26], [4.6, 0.42]],
    top: [[0, 0.6], [0.5, 0.82], [0.95, 0.9], [1.5, 0.78], [2.1, 0.74], [3.0, 0.78], [3.93, 0.92], [4.3, 0.74], [4.6, 0.5]],
    dip: [[0, 0], [0.6, 0.14], [1.0, 0.16], [1.5, 0.06], [2.2, 0], [3.3, 0.04], [3.93, 0.14], [4.6, 0.02]],
    hw: [[0, 0.74], [0.6, 0.96], [0.95, 1], [1.5, 0.86], [2.2, 0.8], [3.0, 0.84], [3.93, 1], [4.35, 0.86], [4.6, 0.56]],
    gh: { ws: 1.7, roofF: 2.1, roofR: 2.6, rw: 4.2, roofY: 1.36, inset: 0.18, tumble: 0.3, bp: 2.55, cp: 3.02, solidRear: true, sideEnd: 3.12 },
    rearSpat: true, dorsal: true, rim: 'disc', rimColor: 'silver', badge: '#c9a35a',
    lights: 'round', grille: 'horseshoe', intake: 'none', lightY: -0.1, lightZ: 0.8, lightW: 0.17, lightH: 0.17, grilleW: 0.3, grilleH: 0.3, grilleY: 0.12,
  },
  vertical: {
    L: 4.5, W: 1.98, wr: 0.36, tw: 0.31, fo: 1.0, wb: 2.65, rs: 0.05, endF: 0.08, endR: 0.12, endV: 0.3,
    yb: [[0, 0.18], [0.25, 0.12], [4.25, 0.14], [4.5, 0.28]],
    top: [[0, 0.6], [0.3, 0.66], [1.0, 0.76], [1.45, 0.8], [2.9, 0.88], [3.65, 0.94], [4.35, 0.93], [4.5, 0.88]],
    dip: [[0, 0.02], [0.5, 0.07], [1.2, 0.06], [1.5, 0.02], [2.9, 0.02], [3.3, 0.06], [4.5, 0.02]],
    hw: [[0, 0.9], [0.3, 0.97], [1.0, 1], [2.0, 0.95], [3.0, 0.97], [3.65, 1.02], [4.35, 1], [4.5, 0.96]],
    gh: { ws: 1.42, roofF: 2.2, roofR: 2.72, rw: 4.1, roofY: 1.19, inset: 0.1, tumble: 0.25, bp: 99, wsLin: true },
    vflank: true, hoodSlot: true, sideSlot: true, noDoors: false, rim: 'spoke5', rimColor: 'black',
    lights: 'seg4', grille: 'vframe', intake: 'none', lightY: -0.035, lightZ: 0.66, lightW: 0.42, lightH: 0.05, grilleW: 0.42, grilleH: 0.4, grilleY: 0.2,
  },
  flecha: {
    L: 5.02, W: 2.08, wr: 0.36, tw: 0.33, fo: 1.15, wb: 2.7, rs: 0.04, endF: 0.12, endR: 0.14, endV: 0.3,
    yb: [[0, 0.12], [0.3, 0.08], [4.7, 0.1], [5.02, 0.24]],
    top: [[0, 0.36], [0.5, 0.6], [1.15, 0.8], [1.6, 0.74], [2.9, 0.84], [3.85, 1.0], [4.7, 0.98], [5.02, 0.9]],
    dip: [[0, 0.05], [0.5, 0.2], [1.15, 0.2], [1.6, 0.06], [2.9, 0.04], [3.4, 0.16], [4.6, 0.14], [5.02, 0.04]],
    hw: [[0, 0.82], [0.6, 0.96], [1.15, 1.04], [2.0, 0.9], [3.0, 0.93], [3.85, 1.06], [4.7, 1.02], [5.02, 0.94]],
    gh: { ws: 1.42, roofF: 2.3, roofR: 2.65, rw: 3.95, roofY: 1.14, inset: 0.16, tumble: 0.28, bp: 99, wsLin: true },
    side: true, hoodVents: true, wing: true, wingH: 0.36, wingChord: 0.4, fin: true, finH: 0.3, splitter: true, canards: true,
    sillLine: '#e0102a', tireRing: '#e0102a', rim: 'turbine', rimColor: 'black', caliper: '#e0102a',
    lights: 'yshape', grille: 'none', intake: 'wide', lightY: -0.04, lightZ: 0.74, lightW: 0.42, lightH: 0.15,
  },
  gaivota: {
    L: 4.6, W: 2.0, wr: 0.36, tw: 0.31, fo: 1.0, wb: 2.7, rs: 0.14, endF: 0.28, endR: 0.2,
    yb: [[0, 0.16], [0.3, 0.1], [4.3, 0.12], [4.6, 0.28]],
    top: [[0, 0.46], [0.4, 0.66], [1.0, 0.82], [1.6, 0.8], [2.9, 0.88], [3.7, 0.96], [4.4, 0.94], [4.6, 0.86]],
    dip: [[0, 0], [0.5, 0.12], [1.2, 0.1], [1.6, 0.03], [2.9, 0.02], [3.4, 0.08], [4.6, 0.02]],
    hw: [[0, 0.82], [0.6, 0.96], [1.0, 1.02], [2.0, 0.94], [3.0, 0.97], [3.7, 1.03], [4.4, 1], [4.6, 0.92]],
    gh: { ws: 1.6, roofF: 2.3, roofR: 2.75, rw: 3.9, roofY: 1.18, inset: 0.12, tumble: 0.26, bp: 99 },
    gullwing: true, hoodDuct: true, noDoors: true, interior: '#5a0f14', rim: 'spoke6',
    lights: 'louver', grille: 'none', intake: 'triple', lightY: -0.06, lightZ: 0.72, lightW: 0.3, lightH: 0.14,
  },
  megacarro: {
    L: 4.61, W: 2.03, wr: 0.35, tw: 0.33, fo: 1.08, wb: 2.7, rs: 0.16, endF: 0.3, endR: 0.16,
    yb: [[0, 0.12], [0.3, 0.08], [4.35, 0.1], [4.61, 0.24]],
    top: [[0, 0.38], [0.45, 0.6], [1.08, 0.8], [1.6, 0.76], [2.9, 0.84], [3.78, 0.98], [4.4, 0.96], [4.61, 0.88]],
    dip: [[0, 0], [0.5, 0.14], [1.2, 0.12], [1.65, 0.04], [2.9, 0.03], [3.35, 0.12], [4.4, 0.1], [4.61, 0.02]],
    hw: [[0, 0.82], [0.6, 0.96], [1.08, 1.03], [2.0, 0.92], [3.0, 0.95], [3.78, 1.05], [4.4, 1.02], [4.61, 0.94]],
    gh: { ws: 1.45, roofF: 2.2, roofR: 2.62, rw: 3.75, roofY: 1.13, inset: 0.14, tumble: 0.26, bp: 99 },
    roof: 'black', side: true, sideD: 2.95, sideW: 0.72, sideH: 0.32, hoodVents: true, wing: true, wingH: 0.46, wingChord: 0.38, swan: true,
    splitter: true, splitterAccent: '#9ae600', caliper: '#9ae600', rim: 'turbine', rimColor: 'black',
    lights: 'slim', grille: 'none', intake: 'wide', lightY: -0.05, lightZ: 0.72, lightW: 0.36, lightH: 0.08,
  },
  proto: {
    L: 4.4, W: 2.0, wr: 0.34, tw: 0.3, fo: 0.95, wb: 2.3, rs: 0.14, endF: 0.28, endR: 0.2,
    yb: [[0, 0.18], [0.3, 0.1], [4.1, 0.12], [4.4, 0.24]],
    top: [[0, 0.36], [0.45, 0.62], [0.95, 0.77], [1.4, 0.72], [2.9, 0.86], [3.25, 0.9], [4.4, 0.84]],
    dip: [[0, 0], [0.6, 0.14], [1.25, 0.08], [1.6, 0], [2.6, 0.06], [3.25, 0.14], [4.4, 0.06]],
    hw: [[0, 0.8], [0.6, 0.96], [0.95, 1.02], [1.8, 0.9], [3.25, 1.03], [4.4, 0.98]],
    gh: { ws: 1.32, roofF: 1.86, roofR: 2.15, rw: 3.15, roofY: 1.04, inset: 0.3, tumble: 0.16, bp: 99 },
    lights: 'round', grille: 'none', intake: 'triple', lightY: -0.08, lightZ: 0.62, lightW: 0.24, lightH: 0.18,
  },
};

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// Interpolação cúbica monotônica (Fritsch–Carlson): perfis suaves sem "ondas".
function mono(keys) {
  const n = keys.length;
  const xs = keys.map((k) => k[0]);
  const ys = keys.map((k) => k[1]);
  const d = [];
  const m = [];
  for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

// Escala chaves de perfil quando o carro é mais longo/curto que o tipo base.
function scaleKeys(keys, s) {
  return keys.map(([d, v]) => [d * s, v]);
}

function resolve(spec) {
  const T = TYPES[spec.type] || TYPES.sport;
  const P = { ...T, ...spec, gh: { ...T.gh, ...(spec.gh || {}) } };
  const s = (spec.L || T.L) / T.L;
  if (s !== 1) {
    for (const k of ['yb', 'top', 'dip', 'hw']) P[k] = scaleKeys(T[k], s);
    for (const k of ['ws', 'roofF', 'roofR', 'rw', 'bp', 'cp']) if (P.gh[k] != null && !(spec.gh && spec.gh[k] != null)) P.gh[k] = T.gh[k] * s;
    if (!spec.fo) P.fo = T.fo * s;
    if (!spec.wb) P.wb = T.wb * s;
    if (T.bed && !spec.bed) P.bed = T.bed.map((v) => v * s);
  }
  if (spec.topAdd) P.top = P.top.map(([d, v]) => [d, v + spec.topAdd]);
  if (spec.roofAdd) P.gh.roofY += spec.roofAdd;
  P.ra = P.fo + P.wb;
  P.rA = P.wr + 0.045;
  P.fYb = mono(P.yb);
  P.fTop = mono(P.top);
  P.fDip = mono(P.dip);
  P.fHw = mono(P.hw);
  P.endV = P.endV ?? 0.6;
  P.rimRatio = P.rimRatio ?? 0.7;
  return P;
}

// ---------------------------------------------------------------------------
// Carroceria inferior
// ---------------------------------------------------------------------------
function archY(P, d) {
  let ya = -1;
  if (P.noArch) return ya;
  for (const da of [P.fo, P.ra]) {
    if (P.noArchFront && da === P.fo) continue;
    const dx = Math.abs(d - da);
    if (dx >= P.rA) continue;
    let a = P.wr + Math.sqrt(P.rA * P.rA - dx * dx);
    // saia traseira: a carroceria cobre a roda e só deixa a parte de baixo do pneu à vista
    if (P.rearSpat && da === P.ra) a = Math.min(a, P.wr * 0.85);
    ya = Math.max(ya, a);
  }
  return ya;
}

// Meia seção (z >= 0) do fundo até o centro do topo. Retorna [z, y, tag].
function bodyHalf(P, d) {
  const hw = (P.fHw(d) * P.W) / 2;
  const yb = P.fYb(d);
  const yts = P.fTop(d);
  const ytc = yts - P.fDip(d);
  let ya = archY(P, d);
  const inArch = ya > 0;
  if (!inArch) ya = yb;
  const zIn = Math.max(0.15, hw - P.tw - 0.1);
  const rc = 0.045;
  ya = Math.min(ya, yts - rc - 0.06);
  const rs = clamp(Math.min(P.rs, (yts - ya - rc) * 0.7, hw * 0.45), 0.015, 1);
  const pts = [];
  pts.push([0, yb, 'u'], [zIn * 0.5, yb, 'u'], [zIn, yb, 'u']);
  const wt = inArch ? 'w' : 'u';
  pts.push([zIn, lerp(yb, ya, 0.5), wt], [zIn, ya, wt]);
  pts.push([lerp(zIn, hw - rc, 0.5), ya, wt], [hw - rc, ya, wt]);
  for (let k = 1; k <= 3; k++) {
    const a = -Math.PI / 2 + (k / 3) * (Math.PI / 2);
    pts.push([hw - rc + rc * Math.cos(a), ya + rc + rc * Math.sin(a), k === 1 ? 'l' : 'p']);
  }
  for (let k = 1; k <= 6; k++) {
    const t = k / 6;
    const y = lerp(ya + rc, yts - rs, t);
    pts.push([hw - 0.025 * (1 - t) * (1 - t) + 0.008 * Math.sin(Math.PI * t), y, 'p']);
  }
  for (let k = 1; k <= 7; k++) {
    const a = (k / 7) * (Math.PI / 2);
    pts.push([hw - rs + rs * Math.cos(a), yts - rs + rs * Math.sin(a), 'p']);
  }
  const z0 = hw - rs;
  for (let k = 1; k <= 8; k++) {
    const t = k / 8;
    const z = z0 * (1 - t);
    const q = z / Math.max(z0, 1e-3);
    pts.push([z, ytc + (yts - ytc) * Math.pow(q, 2.2), 'p']);
  }
  // arredondamento das pontas (planta e perfil)
  let f = 1;
  if (d < P.endF) f = Math.sqrt(Math.max(0, 1 - ((P.endF - d) / P.endF) ** 2));
  if (d > P.L - P.endR) f = Math.sqrt(Math.max(0, 1 - ((d - (P.L - P.endR)) / P.endR) ** 2));
  const fv = Math.pow(f, P.endV);
  const fvb = Math.pow(f, P.endV * 0.45);
  const ym = (yb + yts) * 0.5;
  return pts.map(([z, y, tag]) => [z * f, ym + (y - ym) * (y < ym ? fvb : fv), tag]);
}

function stations(L, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    // mais estações perto das pontas
    out.push(L * (0.5 - 0.5 * Math.cos(Math.PI * s)) * 0.55 + L * s * 0.45);
  }
  return out;
}

// Monta uma superfície em grade a partir de anéis (meias seções espelhadas).
function loft(ds, halfFn, P, classify) {
  const halves = ds.map((d) => halfFn(P, d));
  const K = halves[0].length;
  const R = 2 * K - 2;
  const pos = [];
  const tags = [];
  for (let i = 0; i < ds.length; i++) {
    const x = P.L / 2 - ds[i];
    const h = halves[i];
    for (let j = 0; j < K; j++) {
      pos.push(x, h[j][1], h[j][0]);
      tags.push(h[j][2]);
    }
    for (let j = K - 2; j >= 1; j--) {
      pos.push(x, h[j][1], -h[j][0]);
      tags.push(h[j][2]);
    }
  }
  const groups = new Map();
  for (let i = 0; i < ds.length - 1; i++) {
    for (let j = 0; j < R; j++) {
      const j2 = (j + 1) % R;
      const a = i * R + j;
      const b = (i + 1) * R + j;
      const c = (i + 1) * R + j2;
      const e = i * R + j2;
      const mat = classify ? classify(tags[a], tags[e], (ds[i] + ds[i + 1]) / 2, j, j2, K) : 0;
      if (!groups.has(mat)) groups.set(mat, []);
      groups.get(mat).push(a, e, b, b, e, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const index = [];
  for (const [mat, idx] of [...groups.entries()].sort((p, q) => p[0] - q[0])) {
    g.addGroup(index.length, idx.length, mat);
    for (const v of idx) index.push(v);
  }
  g.setIndex(index);
  g.computeVertexNormals();
  return { geo: g, tags };
}

// ---------------------------------------------------------------------------
// Estufa (vidros, colunas e teto)
// ---------------------------------------------------------------------------
function makeRoofFn(P) {
  const G = P.gh;
  const base = (d) => P.fTop(d) - P.fDip(d) * 0.5 - 0.02;
  const mid = (G.roofF + G.roofR) / 2;
  if (G.open) {
    // conversível: só o para-brisa, caindo logo atrás para o cockpit
    return {
      base,
      top: mono([
        [G.ws, base(G.ws)],
        [lerp(G.ws, G.roofF, 0.55), lerp(base(G.ws), G.roofY, 0.75)],
        [G.roofF, G.roofY],
        [G.rw, base(G.rw)],
      ]),
    };
  }
  const roofKeys = [
    [G.ws, base(G.ws)],
    [lerp(G.ws, G.roofF, 0.55), lerp(base(G.ws), G.roofY, G.wsLin ? 0.56 : 0.78)],
    [G.roofF, G.roofY - 0.005],
    [mid, G.roofY + 0.01],
    [G.roofR, G.roofY - 0.01],
    [lerp(G.roofR, G.rw, 0.45), lerp(G.roofY, base(G.rw), 0.42)],
    [G.rw, base(G.rw)],
  ];
  if (G.rw - G.roofR < 0.4) roofKeys.splice(5, 1);
  const top = mono(roofKeys);
  return { base, top };
}

function greenhouseHalf(P, d) {
  const G = P.gh;
  const { base, top } = P.roofFn;
  const yb = base(d);
  const yt = Math.max(yb, top(d));
  const h = yt - yb;
  const hw = (P.fHw(d) * P.W) / 2;
  const gb = Math.max(0.2, hw - G.inset);
  const gt = Math.max(0.15, gb - G.tumble * clamp(h / 0.4, 0, 1));
  const rr = Math.min(0.09, h * 0.4);
  const pts = [];
  pts.push([0, yb - 0.05, 'h'], [gb * 0.5, yb - 0.05, 'h'], [gb, yb - 0.04, 'h']);
  pts.push([gb + 0.004, yb + h * 0.06, 's'], [lerp(gb, gt, 0.12), yb + h * 0.12, 'g']);
  for (let k = 1; k <= 5; k++) {
    const t = 0.12 + (k / 5) * 0.88;
    const y = lerp(yb + h * 0.12, yt - rr, (t - 0.12) / 0.88);
    const z = lerp(gb, gt + rr * 0.3, t) + 0.015 * Math.sin(Math.PI * t);
    pts.push([z, y, k === 5 ? 'c' : 'g']);
  }
  const zc = gt + rr * 0.3 - rr;
  for (let k = 1; k <= 4; k++) {
    const a = (k / 4) * (Math.PI / 2);
    pts.push([zc + rr * Math.cos(a), yt - rr + rr * Math.sin(a), 'c']);
  }
  for (let k = 1; k <= 6; k++) {
    const t = k / 6;
    const z = zc * (1 - t);
    pts.push([z, yt + 0.035 * (1 - (z / Math.max(zc, 1e-3)) ** 2) * clamp(h / 0.3, 0, 1), 'r']);
  }
  return pts;
}

// ---------------------------------------------------------------------------
// Texturas desenhadas em canvas (faróis, grades, entradas, linhas de porta)
// ---------------------------------------------------------------------------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function rrect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

const HEADLIGHT = {
  yshape: (g, w, h) => {
    // farol afiado em "Y": carcaça escura inclinada com o LED na borda de cima
    g.fillStyle = '#07080a';
    g.beginPath();
    g.moveTo(w * 0.02, h * 0.12);
    g.lineTo(w * 0.98, h * 0.02);
    g.lineTo(w * 0.62, h * 0.5);
    g.lineTo(w * 0.72, h * 0.98);
    g.lineTo(w * 0.48, h * 0.55);
    g.lineTo(w * 0.06, h * 0.4);
    g.closePath();
    g.fill();
    g.shadowColor = '#e8f6ff';
    g.shadowBlur = 8;
    g.strokeStyle = '#ffffff';
    g.lineWidth = h * 0.07;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(w * 0.08, h * 0.16);
    g.lineTo(w * 0.9, h * 0.07);
    g.lineTo(w * 0.6, h * 0.48);
    g.stroke();
  },
  louver: (g, w, h) => {
    // farol oval encoberto, com aletas horizontais
    g.fillStyle = '#0b0c0e';
    g.beginPath();
    g.ellipse(w / 2, h / 2, w * 0.48, h * 0.46, -0.12, 0, Math.PI * 2);
    g.fill();
    g.save();
    g.beginPath();
    g.ellipse(w / 2, h / 2, w * 0.44, h * 0.4, -0.12, 0, Math.PI * 2);
    g.clip();
    g.shadowColor = '#e8f6ff';
    g.shadowBlur = 5;
    g.fillStyle = '#f4f9ff';
    for (let y = h * 0.22; y < h * 0.85; y += h * 0.16) g.fillRect(0, y, w, h * 0.05);
    g.restore();
  },
  seg4: (g, w, h) => {
    g.fillStyle = '#0a0b0d';
    rrect(g, 1, 1, w - 2, h - 2, h * 0.3);
    g.fill();
    g.shadowColor = '#e6f4ff';
    g.shadowBlur = 6;
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 4; i++) rrect(g, w * (0.08 + i * 0.22), h * 0.25, w * 0.14, h * 0.5, 2), g.fill();
  },
  xbow: (g, w, h) => {
    g.fillStyle = '#060708';
    rrect(g, 1, 1, w - 2, h - 2, h * 0.45);
    g.fill();
    for (const cx of [w * 0.32, w * 0.62]) {
      const gr = g.createRadialGradient(cx, h / 2, 1, cx, h / 2, h * 0.34);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.45, '#ffe29a');
      gr.addColorStop(1, 'rgba(255,200,90,0.0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(cx, h / 2, h * 0.34, 0, Math.PI * 2);
      g.fill();
    }
  },
  teardrop: (g, w, h) => {
    g.fillStyle = '#aab3bd';
    g.beginPath();
    g.moveTo(w * 0.98, h * 0.5);
    g.bezierCurveTo(w * 0.7, h * 0.02, w * 0.12, h * 0.05, w * 0.03, h * 0.5);
    g.bezierCurveTo(w * 0.12, h * 0.95, w * 0.7, h * 0.98, w * 0.98, h * 0.5);
    g.fill();
    g.fillStyle = '#1a1e24';
    g.beginPath();
    g.ellipse(w * 0.62, h * 0.5, w * 0.3, h * 0.36, 0, 0, Math.PI * 2);
    g.fill();
    const gr = g.createRadialGradient(w * 0.68, h * 0.5, 1, w * 0.68, h * 0.5, h * 0.3);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.6, '#dfe8f0');
    gr.addColorStop(1, '#5c6670');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(w * 0.68, h * 0.5, h * 0.28, 0, Math.PI * 2);
    g.fill();
  },
  quadled: (g, w, h) => {
    g.fillStyle = '#0c1015';
    rrect(g, 1, 1, w - 2, h - 2, h * 0.45);
    g.fill();
    g.shadowColor = '#cfe9ff';
    g.shadowBlur = 8;
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 4; i++) rrect(g, w * (0.12 + i * 0.2), h * 0.22, w * 0.11, h * 0.5, 3), g.fill();
    rrect(g, w * 0.08, h * 0.8, w * 0.84, h * 0.08, 2);
    g.fill();
  },
  slats: (g, w, h) => {
    g.shadowColor = '#e6f4ff';
    g.shadowBlur = 8;
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 4; i++) rrect(g, w * (0.04 + i * 0.13), h * (0.08 + i * 0.22), w * 0.5, h * 0.11, h * 0.05), g.fill();
  },
  socket: (g, w, h) => {
    g.fillStyle = '#07080a';
    g.beginPath();
    g.moveTo(w * 0.02, h * 0.55);
    g.quadraticCurveTo(w * 0.25, h * 0.02, w * 0.98, h * 0.12);
    g.quadraticCurveTo(w * 0.8, h * 0.95, w * 0.3, h * 0.96);
    g.quadraticCurveTo(w * 0.05, h * 0.92, w * 0.02, h * 0.55);
    g.fill();
    g.shadowColor = '#d9efff';
    g.shadowBlur = 10;
    g.strokeStyle = '#ffffff';
    g.lineWidth = h * 0.07;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(w * 0.12, h * 0.42);
    g.quadraticCurveTo(w * 0.35, h * 0.16, w * 0.9, h * 0.2);
    g.stroke();
    g.shadowBlur = 0;
    const gr = g.createRadialGradient(w * 0.62, h * 0.42, 1, w * 0.62, h * 0.42, h * 0.14);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(1, '#3a4450');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(w * 0.62, h * 0.42, h * 0.13, 0, Math.PI * 2);
    g.fill();
  },
  pagani: (g, w, h) => {
    g.fillStyle = '#0a0b0d';
    g.beginPath();
    g.ellipse(w / 2, h / 2, w * 0.48, h * 0.48, 0, 0, Math.PI * 2);
    g.fill();
    for (const cy of [h * 0.3, h * 0.7]) {
      const R = Math.min(w, h) * 0.2;
      const gr = g.createRadialGradient(w / 2, cy, 1, w / 2, cy, R);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.55, '#dfe8f0');
      gr.addColorStop(0.85, '#59626c');
      gr.addColorStop(1, '#e3e6ea');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(w / 2, cy, R, 0, Math.PI * 2);
      g.fill();
    }
  },
  evo: (g, w, h) => {
    g.fillStyle = '#c9d0d8';
    rrect(g, 1, 1, w - 2, h - 2, h * 0.3);
    g.fill();
    g.fillStyle = '#ff9a1a';
    rrect(g, 4, h * 0.18, w * 0.16, h * 0.64, 4);
    g.fill();
    for (const cx of [w * 0.42, w * 0.72]) {
      const gr = g.createRadialGradient(cx, h / 2, 2, cx, h / 2, h * 0.36);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.5, '#e8f0f8');
      gr.addColorStop(0.9, '#56606a');
      gr.addColorStop(1, '#aab2bb');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(cx, h / 2, h * 0.34, 0, Math.PI * 2);
      g.fill();
    }
  },
  round: (g, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) / 2 - 2;
    let gr = g.createRadialGradient(cx, cy, 2, cx, cy, R);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.25, '#e8f2ff');
    gr.addColorStop(0.55, '#7d8a99');
    gr.addColorStop(0.85, '#2a3038');
    gr.addColorStop(1, '#d9dde3');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.lineWidth = 2;
    for (let r = R * 0.35; r < R; r += R * 0.18) {
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.stroke();
    }
  },
  slim: (g, w, h) => {
    g.fillStyle = '#10141a';
    rrect(g, 1, 1, w - 2, h - 2, h * 0.45);
    g.fill();
    g.fillStyle = '#f4fbff';
    g.shadowColor = '#bfe3ff';
    g.shadowBlur = 8;
    rrect(g, w * 0.06, h * 0.18, w * 0.88, h * 0.16, h * 0.08);
    g.fill();
    g.shadowBlur = 0;
    for (let i = 0; i < 3; i++) {
      const cx = w * (0.28 + i * 0.2);
      const gr = g.createRadialGradient(cx, h * 0.62, 1, cx, h * 0.62, h * 0.22);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.6, '#9fb4c8');
      gr.addColorStop(1, '#263039');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(cx, h * 0.62, h * 0.22, 0, Math.PI * 2);
      g.fill();
    }
  },
  blade: (g, w, h) => {
    g.fillStyle = '#0d1116';
    rrect(g, 1, 1, w - 2, h - 2, h * 0.5);
    g.fill();
    g.shadowColor = '#d6f0ff';
    g.shadowBlur = 10;
    g.fillStyle = '#ffffff';
    rrect(g, w * 0.04, h * 0.32, w * 0.92, h * 0.36, h * 0.18);
    g.fill();
  },
  square: (g, w, h) => {
    g.fillStyle = '#d0d6dd';
    rrect(g, 1, 1, w - 2, h - 2, 6);
    g.fill();
    g.fillStyle = '#1b2026';
    rrect(g, 5, 5, w - 10, h - 10, 4);
    g.fill();
    for (let i = 0; i < 2; i++) {
      const cx = w * (0.3 + i * 0.4);
      const gr = g.createRadialGradient(cx, h / 2, 2, cx, h / 2, h * 0.36);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.5, '#cfe2f5');
      gr.addColorStop(1, '#3c4652');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(cx, h / 2, h * 0.34, 0, Math.PI * 2);
      g.fill();
    }
  },
  quad: (g, w, h) => {
    g.fillStyle = '#0c0d0f';
    rrect(g, 1, 1, w - 2, h - 2, 6);
    g.fill();
    for (let i = 0; i < 2; i++) {
      const cx = w * (0.27 + i * 0.46);
      const R = h * 0.4;
      const gr = g.createRadialGradient(cx, h / 2, 2, cx, h / 2, R);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.45, '#dfe8f0');
      gr.addColorStop(0.9, '#59626c');
      gr.addColorStop(1, '#c9ced4');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(cx, h / 2, R, 0, Math.PI * 2);
      g.fill();
    }
  },
};

const GRILLE = {
  vframe: (g, w, h) => {
    // grade vertical: moldura prata, colmeia escura e emblema (losango) no alto
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, '#8d949c');
    gr.addColorStop(0.5, '#e9ecef');
    gr.addColorStop(1, '#8d949c');
    g.fillStyle = gr;
    rrect(g, 1, 1, w - 2, h - 2, 10);
    g.fill();
    g.fillStyle = '#060708';
    rrect(g, w * 0.07, h * 0.06, w * 0.86, h * 0.88, 8);
    g.fill();
    g.strokeStyle = '#2b2f35';
    g.lineWidth = 3;
    for (let y = h * 0.2; y < h * 0.92; y += 16) for (let x = w * 0.1 + ((y / 16) % 2) * 8; x < w * 0.9; x += 16) g.strokeRect(x, y, 9, 9);
    g.strokeStyle = '#e9ecef';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(w / 2, h * 0.07);
    g.lineTo(w * 0.62, h * 0.12);
    g.lineTo(w / 2, h * 0.17);
    g.lineTo(w * 0.38, h * 0.12);
    g.closePath();
    g.stroke();
  },
  hex: (g, w, h) => {
    g.fillStyle = '#050607';
    rrect(g, 1, 1, w - 2, h - 2, Math.min(18, h * 0.3));
    g.fill();
    g.save();
    rrect(g, 1, 1, w - 2, h - 2, Math.min(18, h * 0.3));
    g.clip();
    const s = 26;
    g.strokeStyle = '#3a3f46';
    g.lineWidth = 3;
    for (let y = 0, r = 0; y < h + s; y += s * 0.8, r++) {
      for (let x = (r % 2) * (s / 2); x < w + s; x += s) {
        g.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
          g.lineTo(x + Math.cos(a) * s * 0.5, y + Math.sin(a) * s * 0.5);
        }
        g.closePath();
        g.stroke();
      }
    }
    g.restore();
  },
  horseshoe: (g, w, h) => {
    const path = (m) => {
      g.beginPath();
      g.moveTo(m, h * 0.12 + m * 0.4);
      g.quadraticCurveTo(w / 2, -h * 0.02 + m, w - m, h * 0.12 + m * 0.4);
      g.bezierCurveTo(w - m, h * 0.62, w * 0.82 - m * 0.3, h - m, w / 2, h - m);
      g.bezierCurveTo(w * 0.18 + m * 0.3, h - m, m, h * 0.62, m, h * 0.12 + m * 0.4);
      g.closePath();
    };
    const gr = g.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.5, '#8d949c');
    gr.addColorStop(1, '#f1f3f5');
    g.fillStyle = gr;
    path(2);
    g.fill();
    g.fillStyle = '#08090b';
    path(w * 0.07);
    g.fill();
    g.save();
    path(w * 0.07);
    g.clip();
    g.strokeStyle = '#2a2e34';
    g.lineWidth = 2;
    for (let y = 0; y < h; y += 10) for (let x = (y / 10) % 2 ? 5 : 0; x < w; x += 10) g.strokeRect(x, y, 6, 6);
    g.restore();
    g.fillStyle = '#c4161c';
    g.beginPath();
    g.ellipse(w / 2, h * 0.3, w * 0.17, h * 0.07, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#f1f3f5';
    g.lineWidth = 3;
    g.stroke();
  },
  temple: (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, '#9aa1aa');
    gr.addColorStop(0.5, '#ffffff');
    gr.addColorStop(1, '#8b929b');
    g.fillStyle = gr;
    rrect(g, 1, 1, w - 2, h - 2, 6);
    g.fill();
    g.fillStyle = '#121417';
    g.fillRect(w * 0.1, h * 0.1, w * 0.8, h * 0.82);
    for (let x = w * 0.14; x < w * 0.88; x += w * 0.06) {
      const b = g.createLinearGradient(x, 0, x + w * 0.03, 0);
      b.addColorStop(0, '#f2f4f6');
      b.addColorStop(1, '#7b828b');
      g.fillStyle = b;
      g.fillRect(x, h * 0.1, w * 0.028, h * 0.82);
    }
  },
  pony: (g, w, h) => {
    g.fillStyle = '#060708';
    rrect(g, 1, 1, w - 2, h - 2, h * 0.3);
    g.fill();
    g.strokeStyle = '#25282d';
    g.lineWidth = 2;
    for (let x = 0; x < w; x += 9) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
    }
    for (let y = 0; y < h; y += 9) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
    for (const cx of [h * 0.6, w - h * 0.6]) {
      const gr = g.createRadialGradient(cx, h / 2, 2, cx, h / 2, h * 0.42);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.5, '#e6eef6');
      gr.addColorStop(0.85, '#59626c');
      gr.addColorStop(1, '#c9ced4');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(cx, h / 2, h * 0.42, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = '#c9ced4';
    g.lineWidth = 3;
    rrect(g, w / 2 - h * 0.55, h * 0.25, h * 1.1, h * 0.5, 6);
    g.stroke();
  },
  mesh: (g, w, h) => {
    g.fillStyle = '#07080a';
    rrect(g, 1, 1, w - 2, h - 2, h * 0.35);
    g.fill();
    g.save();
    rrect(g, 1, 1, w - 2, h - 2, h * 0.35);
    g.clip();
    g.strokeStyle = '#2b2f35';
    g.lineWidth = 2;
    const s = 10;
    for (let y = 0; y < h + s; y += s * 0.85) {
      for (let x = (Math.round(y / (s * 0.85)) % 2) * (s / 2); x < w + s; x += s) {
        g.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
          g.lineTo(x + Math.cos(a) * s * 0.5, y + Math.sin(a) * s * 0.5);
        }
        g.closePath();
        g.stroke();
      }
    }
    g.restore();
  },
  bars: (g, w, h) => {
    g.fillStyle = '#08090b';
    rrect(g, 1, 1, w - 2, h - 2, 8);
    g.fill();
    g.fillStyle = '#4a4f57';
    for (let y = h * 0.15; y < h * 0.9; y += h * 0.17) g.fillRect(w * 0.04, y, w * 0.92, Math.max(2, h * 0.05));
    g.strokeStyle = '#9aa1aa';
    g.lineWidth = 3;
    rrect(g, 2, 2, w - 4, h - 4, 8);
    g.stroke();
  },
  chrome: (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.5, '#8b929b');
    gr.addColorStop(1, '#e9ecef');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(w / 2, h / 2, w / 2 - 2, h / 2 - 2, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#0a0b0d';
    g.beginPath();
    g.ellipse(w / 2, h / 2, w / 2 - 9, h / 2 - 9, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#c7ccd2';
    for (let x = w * 0.12; x < w * 0.9; x += w * 0.075) g.fillRect(x, h * 0.15, 4, h * 0.7);
  },
};

function intakeTex() {
  return canvasTex(256, 96, (g, w, h) => {
    g.fillStyle = '#060708';
    rrect(g, 2, 2, w - 4, h - 4, h * 0.3);
    g.fill();
    g.strokeStyle = '#1d2024';
    g.lineWidth = 3;
    for (let x = 0; x < w; x += 12) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + h, h);
      g.stroke();
    }
  });
}

function doorTex(color) {
  return canvasTex(512, 256, (g, w, h) => {
    g.strokeStyle = color;
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(w * 0.04, h * 0.02);
    g.lineTo(w * 0.04, h * 0.98);
    g.moveTo(w * 0.96, h * 0.02);
    g.quadraticCurveTo(w * 0.99, h * 0.6, w * 0.93, h * 0.98);
    g.stroke();
    g.fillStyle = color;
    rrect(g, w * 0.72, h * 0.12, w * 0.14, h * 0.07, 6);
    g.fill();
  });
}

function tailTex() {
  return canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#2a0204';
    rrect(g, 1, 1, w - 2, h - 2, h * 0.4);
    g.fill();
    g.shadowColor = '#ff2a2a';
    g.shadowBlur = 10;
    g.fillStyle = '#ff3b30';
    rrect(g, w * 0.05, h * 0.35, w * 0.9, h * 0.3, h * 0.15);
    g.fill();
  });
}

// ---------------------------------------------------------------------------
// Decalques projetados (conformes à superfície)
// ---------------------------------------------------------------------------
const _ray = new THREE.Raycaster();

function projectDecal(targets, { center, dir, u, v, w, h, nu = 24, nv = 12, offset = 0.004, avoid }) {
  const D = dir.clone().normalize();
  const pos = [];
  const uv = [];
  const ok = [];
  const nrm = new THREE.Vector3();
  // distância de referência no centro: descarta acertos "atrás" da borda (ex.: capô)
  _ray.set(center.clone().addScaledVector(D, -6), D);
  const ch = _ray.intersectObjects(targets, false)[0];
  const refDist = ch ? ch.distance : null;
  const tol = Math.max(w, h) * 0.6;
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const s = i / nu;
      const t = j / nv;
      const p = center
        .clone()
        .addScaledVector(u, (s - 0.5) * w)
        .addScaledVector(v, (t - 0.5) * h)
        .addScaledVector(D, -6);
      _ray.set(p, D);
      const hit = _ray.intersectObjects(targets, false)[0];
      let good = !!hit && (refDist == null || Math.abs(hit.distance - refDist) < tol);
      if (hit && avoid && hit.object.material && Array.isArray(hit.object.material)) {
        const grp = hit.object.geometry.groups.find((gr) => hit.faceIndex * 3 >= gr.start && hit.faceIndex * 3 < gr.start + gr.count);
        if (grp && avoid.includes(grp.materialIndex)) good = false;
      }
      if (hit) {
        nrm.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
        const q = hit.point.clone().addScaledVector(nrm, offset);
        pos.push(q.x, q.y, q.z);
      } else pos.push(0, 0, 0);
      uv.push(s, t);
      ok.push(good);
    }
  }
  const idx = [];
  const W = nu + 1;
  // mantém as faces viradas para fora (contra a direção de projeção)
  const flip = new THREE.Vector3().crossVectors(u, v).dot(D) > 0;
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * W + i;
      const b = a + 1;
      const c = a + W;
      const d = c + 1;
      if (ok[a] && ok[b] && ok[c] && ok[d]) {
        if (flip) idx.push(a, c, b, b, c, d);
        else idx.push(a, b, c, b, d, c);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// Rodas
// ---------------------------------------------------------------------------
function buildWheel(P, mats) {
  const grp = new THREE.Group();
  const R = P.wr;
  const tw = P.tw;
  const rimR = R * P.rimRatio;
  // pneu (torno) com eixo em Z
  const prof = [];
  const sw = R - rimR;
  const N = 14;
  for (let k = 0; k <= N; k++) {
    const a = -Math.PI / 2 + (k / N) * Math.PI;
    const r = rimR + sw * 0.5 + Math.cos(a) * sw * 0.5;
    const yy = Math.sin(a) * tw * 0.5;
    prof.push(new THREE.Vector2(Math.max(rimR * 0.98, r + (k > 2 && k < N - 2 ? 0.006 : 0)), yy));
  }
  const tire = new THREE.Mesh(new THREE.LatheGeometry(prof, 64), mats.tire);
  tire.rotation.x = Math.PI / 2;
  grp.add(tire);
  if (P.tireRing) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(rimR + sw * 0.42, rimR + sw * 0.52, 64), mats.ring);
    ring.position.z = tw * 0.5 + 0.005;
    grp.add(ring);
  }
  if (P.whitewall) {
    const ww = new THREE.Mesh(new THREE.RingGeometry(rimR + sw * 0.18, rimR + sw * 0.62, 64), mats.white);
    ww.position.z = tw * 0.5 + 0.004;
    grp.add(ww);
  }
  // cilindro interno escuro (aro por dentro)
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR, tw * 0.9, 48, 1, true), mats.barrel);
  barrel.rotation.x = Math.PI / 2;
  grp.add(barrel);
  const back = new THREE.Mesh(new THREE.CircleGeometry(rimR, 32), mats.barrel);
  back.position.z = -tw * 0.3;
  grp.add(back);
  // disco e pinça de freio
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(rimR * 0.78, rimR * 0.78, 0.02, 40), mats.disc);
  disc.rotation.x = Math.PI / 2;
  disc.position.z = tw * 0.05;
  grp.add(disc);
  if (P.caliper) {
    const cal = new THREE.Mesh(new THREE.BoxGeometry(rimR * 0.32, rimR * 0.6, 0.06), mats.caliper);
    cal.position.set(-rimR * 0.62, rimR * 0.18, tw * 0.1);
    cal.rotation.z = 0.35;
    grp.add(cal);
  }
  // borda do aro
  const lip = new THREE.Mesh(new THREE.TorusGeometry(rimR * 0.97, 0.012, 8, 64), mats.rim);
  lip.position.z = tw * 0.42;
  grp.add(lip);
  const face = new THREE.Group();
  face.position.z = tw * 0.36;
  grp.add(face);
  const style = P.rim || 'spoke5';
  const spoke = (n, width, depth, rot = 0, len = rimR * 0.92, tilt = 0) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rot;
      const m = new THREE.Mesh(new THREE.BoxGeometry(width, len, depth), mats.rim);
      m.position.set(Math.cos(a + Math.PI / 2) * len * 0.5, Math.sin(a + Math.PI / 2) * len * 0.5, 0);
      m.rotation.z = a;
      m.rotation.y = tilt;
      face.add(m);
    }
  };
  if (style === 'spoke6') {
    spoke(6, rimR * 0.22, 0.035);
  } else if (style === 'spoke5') {
    spoke(5, rimR * 0.2, 0.03);
  } else if (style === 'split') {
    spoke(5, rimR * 0.08, 0.03, 0.09);
    spoke(5, rimR * 0.08, 0.03, -0.09);
  } else if (style === 'multi') {
    spoke(10, rimR * 0.08, 0.025);
  } else if (style === 'mesh') {
    spoke(12, rimR * 0.045, 0.02, 0.15);
    spoke(12, rimR * 0.045, 0.02, -0.15);
  } else if (style === 'wire') {
    spoke(32, 0.005, 0.005, 0, rimR * 0.95);
    spoke(16, 0.005, 0.005, 0.1, rimR * 0.95);
    spoke(16, 0.005, 0.005, -0.1, rimR * 0.95);
  } else if (style === 'turbine') {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.BoxGeometry(rimR * 0.16, rimR * 0.88, 0.02), mats.rim);
      m.position.set(Math.cos(a + Math.PI / 2) * rimR * 0.45, Math.sin(a + Math.PI / 2) * rimR * 0.45, 0);
      m.rotation.z = a + 0.45;
      face.add(m);
    }
  } else if (style === 'disc') {
    const dsk = new THREE.Mesh(new THREE.CircleGeometry(rimR * 0.95, 48), mats.rim);
    dsk.position.z = -0.005;
    face.add(dsk);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const hole = new THREE.Mesh(new THREE.CircleGeometry(rimR * 0.13, 20), mats.barrel);
      hole.position.set(Math.cos(a) * rimR * 0.6, Math.sin(a) * rimR * 0.6, 0.002);
      face.add(hole);
    }
  } else if (style === 'steel') {
    const dsk = new THREE.Mesh(new THREE.CircleGeometry(rimR * 0.95, 48), mats.rim);
    face.add(dsk);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const hole = new THREE.Mesh(new THREE.CircleGeometry(rimR * 0.09, 16), mats.barrel);
      hole.position.set(Math.cos(a) * rimR * 0.62, Math.sin(a) * rimR * 0.62, 0.002);
      face.add(hole);
    }
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(rimR * 0.2, rimR * 0.24, 0.05, 24), mats.rim);
  hub.rotation.x = Math.PI / 2;
  hub.position.z = 0.01;
  face.add(hub);
  const cap = new THREE.Mesh(new THREE.CircleGeometry(rimR * 0.12, 24), mats.cap);
  cap.position.z = 0.037;
  face.add(cap);
  return grp;
}

// ---------------------------------------------------------------------------
// Materiais
// ---------------------------------------------------------------------------
// Pintura RGB: arco-íris calculado por fragmento a partir da posição no mundo.
function rgbMaterial(L) {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, metalness: 0.3, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02, toneMapped: false });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRgbL = { value: L };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRgbPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRgbPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vRgbPos;
        uniform float uRgbL;
        vec3 rgbHue(float hh) { vec3 p = abs(fract(vec3(hh) + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0); return clamp(p - 1.0, 0.0, 1.0); }`,
      )
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec3 rgbCol = rgbHue(fract((vRgbPos.x / uRgbL) * 0.9 + vRgbPos.y * 0.22 + vRgbPos.z * 0.08));\nvec4 diffuseColor = vec4(rgbCol, opacity);')
      .replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = rgbCol * 0.28;');
  };
  m.customProgramCacheKey = () => `rgb-${L}`;
  return m;
}

// Efeitos de pintura calculados por fragmento, a partir da posição no mundo (o carro fica
// na origem). userData.fx guarda quais estão ligados, para que um clone os mantenha:
//   split: dois tons com divisa em "C"; lower: parte de baixo em outra cor;
//   camo: camuflagem geométrica; weave: trama de fibra de carbono.
function applyFx(mat, L) {
  const fx = mat.userData.fx || {};
  const u = {};
  let decl = 'varying vec3 vFxPos;\nfloat fxHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n';
  let code = 'vec3 fxC = diffuse;\n';
  if (fx.camo) {
    u.uCamo0 = { value: new THREE.Color(fx.camo[0]) };
    u.uCamo1 = { value: new THREE.Color(fx.camo[1]) };
    u.uCamo2 = { value: new THREE.Color(fx.camo[2]) };
    decl += `uniform vec3 uCamo0; uniform vec3 uCamo1; uniform vec3 uCamo2;
    vec3 fxCamo(vec3 p) {
      vec2 a = vec2(p.x + p.z * 0.55, p.y * 1.25 - p.z * 0.45) * 3.4;
      mat2 r1 = mat2(0.866, 0.5, -0.5, 0.866);
      mat2 r2 = mat2(0.5, -0.866, 0.866, 0.5);
      float v = fxHash(floor(a)) + fxHash(floor(r1 * a * 1.35) + 7.0) + fxHash(floor(r2 * a * 0.85) + 13.0);
      float t = fract(v);
      return t < 0.36 ? uCamo0 : (t < 0.68 ? uCamo1 : uCamo2);
    }\n`;
    code += 'fxC = fxCamo(vFxPos);\n';
  }
  if (fx.split) {
    u.uSplit = { value: new THREE.Vector4(fx.split[0], fx.split[1], fx.split[2], L / 2) };
    u.uSplitC = { value: new THREE.Color(fx.split[3]) };
    decl += 'uniform vec4 uSplit; uniform vec3 uSplitC;\n';
    code += `{ float tS = clamp((vFxPos.y - 0.12) / 0.9, 0.0, 1.0);
      float dB = tS < 0.45 ? uSplit.y - (uSplit.y - uSplit.x) * pow((0.45 - tS) / 0.45, 2.0) : uSplit.y - (uSplit.y - uSplit.z) * pow((tS - 0.45) / 0.55, 2.0);
      if ((uSplit.w - vFxPos.x) >= dB) fxC = uSplitC; }\n`;
  }
  if (fx.lower) {
    u.uLowerY = { value: fx.lower[0] };
    u.uLowerC = { value: new THREE.Color(fx.lower[1]) };
    decl += 'uniform float uLowerY; uniform vec3 uLowerC;\n';
    code += 'if (vFxPos.y < uLowerY + 0.05 * sin(vFxPos.x * 1.7)) fxC = uLowerC;\n';
  }
  if (fx.weave) {
    decl += `float fxWeave(vec3 p) {
      vec2 q = vec2(p.x + p.z * 0.7, p.y + p.z * 0.7) * 30.0;
      vec2 c = floor(q);
      float on = mod(c.x + c.y, 4.0) < 2.0 ? 1.0 : 0.0;
      float f = on > 0.5 ? fract(q.x) : fract(q.y);
      return mix(0.62, 1.12, on) * (0.86 + 0.14 * sin(f * 3.14159));
    }\n`;
    code += 'fxC *= fxWeave(vFxPos);\n';
  }
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFxPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFxPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + decl)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', code + 'vec4 diffuseColor = vec4(fxC, opacity);');
  };
  mat.customProgramCacheKey = () => 'fx' + JSON.stringify(fx) + L;
  mat.needsUpdate = true;
  return mat;
}

function paintMaterial(color, finish) {
  const c = new THREE.Color(color);
  const base = { color: c, vertexColors: true };
  switch (finish) {
    case 'satin':
      return new THREE.MeshPhysicalMaterial({ ...base, metalness: 0.65, roughness: 0.42, clearcoat: 0.25, clearcoatRoughness: 0.4 });
    case 'carbonweave':
      return new THREE.MeshPhysicalMaterial({ ...base, metalness: 0.35, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.02 });
    case 'neon':
      // sem tone mapping, para a cor saturada não desbotar como faria um carro comum
      return new THREE.MeshPhysicalMaterial({ ...base, emissive: c, emissiveIntensity: 0.32, metalness: 0.15, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02, toneMapped: false });
    case 'matte':
      return new THREE.MeshPhysicalMaterial({ ...base, metalness: 0.2, roughness: 0.62, clearcoat: 0.1, clearcoatRoughness: 0.6 });
    case 'chrome':
      return new THREE.MeshPhysicalMaterial({ ...base, metalness: 1, roughness: 0.07, clearcoat: 1, clearcoatRoughness: 0.02 });
    case 'pearl':
      return new THREE.MeshPhysicalMaterial({ ...base, metalness: 0.45, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.03, iridescence: 0.9, iridescenceIOR: 1.6, iridescenceThicknessRange: [200, 600] });
    case 'gloss':
      return new THREE.MeshPhysicalMaterial({ ...base, metalness: 0.05, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.03 });
    case 'carbon':
      return new THREE.MeshPhysicalMaterial({ ...base, metalness: 0.3, roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.05 });
    default:
      return new THREE.MeshPhysicalMaterial({ ...base, metalness: 0.55, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03 });
  }
}

const RIM_COLORS = {
  silver: [0xc9ced4, 0.9, 0.25],
  chrome: [0xf2f4f6, 1, 0.05],
  gunmetal: [0x3e4247, 0.85, 0.3],
  black: [0x16171a, 0.6, 0.35],
  gold: [0xc9a24a, 1, 0.25],
  bronze: [0x8a6a3a, 0.9, 0.3],
  white: [0xe8e8e8, 0.2, 0.3],
};

// ---------------------------------------------------------------------------
// Montagem do carro
// ---------------------------------------------------------------------------
export function buildCar(spec) {
  const P = resolve(spec);
  const car = new THREE.Group();
  const finish = spec.finish || P.finish;
  const paint = finish === 'rgb' ? rgbMaterial(P.L) : paintMaterial(spec.color || '#c0392b', finish === 'camo' ? 'gloss' : finish);
  if (finish === 'camo' || finish === 'carbonweave') {
    paint.userData.fx = finish === 'camo' ? { camo: P.camo || ['#141518', '#eceeef', '#8a8f96'] } : { weave: true };
    applyFx(paint, P.L);
  }
  const paint2 = spec.color2 ? paintMaterial(spec.color2, spec.finish2 || (spec.finish === 'matte' ? 'matte' : spec.finish === 'neon' || spec.finish === 'rgb' ? 'neon' : 'gloss')) : null;
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x05070a, metalness: 0.2, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 0.75 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x0b0c0e, metalness: 0.3, roughness: 0.45 });
  const chromeTrim = new THREE.MeshStandardMaterial({ color: 0xdfe3e8, metalness: 1, roughness: 0.08 });
  const roofMat = P.roof === 'black' ? new THREE.MeshPhysicalMaterial({ color: 0x0d0e10, metalness: 0.3, roughness: 0.25, clearcoat: 1 }) : P.roofColor ? paintMaterial(P.roofColor, 'gloss') : paint;
  // rimColor aceita um nome da tabela ou uma cor (#rrggbb), que brilha nas pinturas neon/RGB
  const rimHex = typeof spec.rimColor === 'string' && spec.rimColor.startsWith('#');
  const rc = rimHex ? [new THREE.Color(spec.rimColor), 0.6, 0.25] : RIM_COLORS[P.rimColor || 'silver'];
  const mats = {
    tire: new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.82, metalness: 0 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf0efe8, roughness: 0.6 }),
    barrel: new THREE.MeshStandardMaterial({ color: 0x0e0f11, roughness: 0.7, side: THREE.DoubleSide }),
    disc: new THREE.MeshStandardMaterial({ color: 0x6d7076, metalness: 0.9, roughness: 0.45 }),
    caliper: new THREE.MeshStandardMaterial({ color: new THREE.Color(P.caliper || '#c0392b'), roughness: 0.4, metalness: 0.2 }),
    rim: new THREE.MeshStandardMaterial({ color: rc[0], metalness: rc[1], roughness: rc[2], emissive: rimHex && (finish === 'neon' || finish === 'rgb') ? new THREE.Color(spec.rimColor) : 0x000000, emissiveIntensity: rimHex ? 0.5 : 0 }),
    ring: new THREE.MeshStandardMaterial({ color: new THREE.Color(P.tireRing || '#ffffff'), roughness: 0.5 }),
    cap: new THREE.MeshStandardMaterial({ color: new THREE.Color(P.badge || '#d4a017'), metalness: 0.8, roughness: 0.3 }),
  };

  // --- carroceria inferior
  const ds = stations(P.L, 200);
  const body = loft(ds, bodyHalf, P, null);
  const col = [];
  const nAttr = body.geo.attributes.normal;
  body.tags.forEach((t, i) => {
    let k = 1;
    if (t === 'w') k = 0.03;
    else if (t === 'u') k = lerp(1, 0.05, clamp((-nAttr.getY(i) - 0.15) / 0.45, 0, 1));
    else if (t === 'l') k = 0.45;
    col.push(k, k, k);
  });
  // curva em "C" (vista lateral): d da divisa em função da altura
  const cCurve = (C, y) => {
    const t = clamp((y - 0.12) / 0.9, 0, 1);
    const tm = 0.45;
    return t < tm ? C.mid - (C.mid - C.bottom) * ((tm - t) / tm) ** 2 : C.mid - (C.mid - C.top) * ((t - tm) / (1 - tm)) ** 2;
  };
  // dois tons com divisa em "C" e/ou base de outra cor: só na carroceria inferior
  let bodyMat = paint;
  if (finish !== 'rgb' && ((P.split && paint2) || P.lowerColor)) {
    bodyMat = paint.clone();
    bodyMat.userData.fx = { ...(paint.userData.fx || {}) };
    if (P.split && paint2) bodyMat.userData.fx.split = [P.split.bottom, P.split.mid, P.split.top, spec.color2];
    if (P.lowerColor) bodyMat.userData.fx.lower = [P.lowerY ?? 0.4, P.lowerColor];
    applyFx(bodyMat, P.L);
  }
  body.geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const bodyMesh = new THREE.Mesh(body.geo, bodyMat);
  car.add(bodyMesh);

  // --- estufa
  P.roofFn = makeRoofFn(P);
  const G = P.gh;
  const gds = [];
  const NG = 110;
  for (let i = 0; i <= NG; i++) gds.push(lerp(G.ws, G.rw, i / NG));
  const pillarW = 0.05;
  // 0 = vidro, 1 = teto/pintura, 2 = acabamento preto
  const classify = (ta, tb, d) => {
    const tags = ta + tb;
    if (tags.includes('h')) return 2;
    // traseira fechada (art déco): teto e laterais viram lataria depois do fim das janelas
    if (G.solidRear && d > G.roofR - 0.02) {
      const sideFace = tags.includes('g') || tags.includes('s');
      if (!sideFace || d > (G.sideEnd ?? G.roofR)) return tags.includes('s') ? 2 : 1;
    }
    if (ta === 'r' && tb === 'r') return !G.glassRoof && d > G.roofF + 0.04 && d < G.roofR - 0.02 ? 1 : 0;
    if (ta === 'c' && tb === 'c') return 1;
    if (ta === 'c' || tb === 'c') {
      if (ta === 'r' || tb === 'r') return !G.glassRoof && d > G.roofF + 0.04 && d < G.roofR - 0.02 ? 1 : 0;
      return 0;
    }
    if (ta === 's' || tb === 's') return 2;
    if (Math.abs(d - G.bp) < pillarW) return 2;
    if (G.cp && Math.abs(d - G.cp) < pillarW * 1.6) return 1;
    return 0;
  };
  const gh = loft(gds, greenhouseHalf, P, classify);
  const ghCol = new Float32Array(gh.tags.length * 3).fill(1);
  gh.geo.setAttribute('color', new THREE.BufferAttribute(ghCol, 3));
  const ghMesh = new THREE.Mesh(gh.geo, [glass, roofMat, trim]);
  car.add(ghMesh);
  const targets = [bodyMesh, ghMesh];
  car.updateMatrixWorld(true);

  const decal = (opts, material) => {
    const g = projectDecal(targets, opts);
    const m = new THREE.Mesh(g, material);
    car.add(m);
    return m;
  };
  const front = new THREE.Vector3(-1, 0, 0);
  const Zv = new THREE.Vector3(0, 0, 1);
  const Yv = new THREE.Vector3(0, 1, 0);
  const Xv = new THREE.Vector3(1, 0, 0);
  const noseTop = P.fTop(0.12);
  const hw0 = (P.fHw(0.3) * P.W) / 2;

  // --- faixas de pintura (projetadas de cima, sem passar pelo vidro)
  if (paint2 && spec.stripes && !P.split) {
    const stripeMat = paint2.clone();
    stripeMat.vertexColors = false;
    stripeMat.polygonOffset = true;
    stripeMat.polygonOffsetFactor = -2;
    const sw = spec.stripes === 'wide' ? 0.42 : 0.16;
    const offs = spec.stripes === 'twin' ? [-0.16, 0.16] : [0];
    for (const oz of offs) {
      const g = projectDecal([bodyMesh, ghMesh], {
        center: new THREE.Vector3(0, 0, oz),
        dir: new THREE.Vector3(0, -1, 0),
        u: Xv,
        v: Zv,
        w: P.L * 0.995,
        h: sw,
        nu: 220,
        nv: 4,
        offset: 0.003,
        avoid: [0],
      });
      car.add(new THREE.Mesh(g, stripeMat));
    }
  }

  // --- faixas em várias cores (ex.: tricolor de endurance)
  if (P.stripeColors) {
    const n = P.stripeColors.length;
    const sw = 0.1;
    P.stripeColors.forEach((sc, i) => {
      const m = paintMaterial(sc, 'gloss');
      m.vertexColors = false;
      m.polygonOffset = true;
      m.polygonOffsetFactor = -2;
      const g = projectDecal([bodyMesh, ghMesh], { center: new THREE.Vector3(0, 0, (i - (n - 1) / 2) * sw), dir: new THREE.Vector3(0, -1, 0), u: Xv, v: Zv, w: P.L * 0.995, h: sw, nu: 220, nv: 3, offset: 0.003, avoid: [0] });
      car.add(new THREE.Mesh(g, m));
    });
  }

  // --- faróis (lights: 'none' = faróis escamoteáveis fechados)
  const hl = HEADLIGHT[P.lights] || HEADLIGHT.slim;
  if (P.lights !== 'none') {
  const hlTex = canvasTex(256, Math.round(256 * Math.min(1, P.lightH / P.lightW)), (g, w, h) => {
    hl(g, w, h);
    if (!P.lightColor) return;
    // tinge o farol: multiplica pela cor e restaura o recorte (alfa) original
    const copy = document.createElement('canvas');
    copy.width = w;
    copy.height = h;
    copy.getContext('2d').drawImage(g.canvas, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = P.lightColor;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(copy, 0, 0);
    g.globalCompositeOperation = 'source-over';
  });
  const hlMat = new THREE.MeshStandardMaterial({ map: hlTex, emissiveMap: hlTex, emissive: P.lightColor ? new THREE.Color(P.lightColor) : 0xffffff, emissiveIntensity: P.lightColor ? 2.2 : 0.9, roughness: 0.12, metalness: 0.2, alphaTest: 0.5, transparent: false, toneMapped: !P.lightColor });
  const glowTex = P.lightGlow
    ? canvasTex(256, 128, (g, w, h) => {
        const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
        gr.addColorStop(0, P.lightColor || '#ffffff');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.save();
        g.scale(1, h / w);
        g.fillStyle = gr;
        g.fillRect(0, 0, w, w);
        g.restore();
      })
    : null;
  hlTex.premultiplyAlpha = false;
  for (const sz of P.lightbar ? [1] : [1, -1]) {
    decal(
      {
        center: new THREE.Vector3(0, noseTop + P.lightY, P.lightbar ? 0 : sz * hw0 * P.lightZ),
        dir: front,
        u: new THREE.Vector3(0, 0, -sz),
        v: Yv,
        w: P.lightbar ? hw0 * 1.8 : P.lightW,
        h: P.lightH,
        nu: P.lightbar ? 48 : 24,
        nv: 12,
      },
      hlMat,
    );
    if (glowTex) {
      const gm = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 });
      decal({ center: new THREE.Vector3(0, noseTop + P.lightY, sz * hw0 * P.lightZ), dir: front, u: new THREE.Vector3(0, 0, -sz), v: Yv, w: P.lightW * 2.2, h: P.lightH * 5, nu: 20, nv: 10, offset: 0.008 }, gm);
    }
  }
  }

  // --- grade
  if (P.grille && P.grille !== 'none') {
    const gw = P.grilleW || 0.6;
    const gH = P.grilleH || 0.16;
    const t = canvasTex(512, Math.round(512 * (gH / gw)), GRILLE[P.grille]);
    const glow = P.grille === 'pony' ? { emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.6 } : {};
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.3, metalness: P.grille === 'temple' ? 0.9 : 0.5, alphaTest: 0.5, ...glow });
    decal({ center: new THREE.Vector3(0, noseTop + P.lightY - (P.grilleY ?? 0.02), 0), dir: front, u: Zv.clone().negate(), v: Yv, w: gw, h: gH, nu: 28, nv: 10 }, m);
  }
  // --- entradas de ar inferiores
  const yb0 = P.fYb(0.3);
  if (P.intake === 'wide' || P.intake === 'triple' || P.intake === 'lip') {
    const it = intakeTex();
    const m = new THREE.MeshStandardMaterial({ map: it, roughness: 0.6, alphaTest: 0.5 });
    const iy = yb0 + (noseTop - yb0) * 0.3;
    if (P.intake === 'wide') {
      decal({ center: new THREE.Vector3(0, iy, 0), dir: front, u: Zv.clone().negate(), v: Yv, w: hw0 * 1.5, h: 0.13, nu: 30, nv: 6 }, m);
    } else if (P.intake === 'triple') {
      decal({ center: new THREE.Vector3(0, iy, 0), dir: front, u: Zv.clone().negate(), v: Yv, w: hw0 * 0.55, h: 0.12, nu: 16, nv: 6 }, m);
      for (const sz of [1, -1]) decal({ center: new THREE.Vector3(0, iy, sz * hw0 * 0.72), dir: front, u: Zv.clone().negate(), v: Yv, w: hw0 * 0.36, h: 0.12, nu: 16, nv: 6 }, m);
    } else {
      decal({ center: new THREE.Vector3(0, yb0 + 0.06, 0), dir: front, u: Zv.clone().negate(), v: Yv, w: hw0 * 1.1, h: 0.08, nu: 30, nv: 4 }, m);
    }
  }
  // --- entradas laterais (motor central)
  if (P.side) {
    const it = intakeTex();
    const m = new THREE.MeshStandardMaterial({ map: it, roughness: 0.6, alphaTest: 0.5 });
    for (const sz of [1, -1]) {
      const sd = P.sideD ?? P.gh.bp + 0.45;
      decal({ center: new THREE.Vector3(P.L / 2 - sd, P.fTop(sd) - 0.26, 0), dir: new THREE.Vector3(0, 0, -sz), u: Xv.clone().multiplyScalar(sz), v: Yv, w: P.sideW || 0.55, h: P.sideH || 0.2, nu: 20, nv: 8 }, m);
    }
  }
  if (P.sideScoop) {
    const it = intakeTex();
    const m = new THREE.MeshStandardMaterial({ map: it, roughness: 0.6, alphaTest: 0.5 });
    const d = P.ra - P.rA - 0.32;
    for (const sz of [1, -1]) {
      decal({ center: new THREE.Vector3(P.L / 2 - d, P.fTop(d) - 0.28, 0), dir: new THREE.Vector3(0, 0, -sz), u: Xv.clone().multiplyScalar(sz), v: Yv, w: 0.34, h: 0.12, nu: 14, nv: 6 }, m);
    }
  }
  // --- linha cromada em "C" na lateral
  if (P.cline) {
    const C = P.cline;
    const d0 = Math.min(C.bottom, C.top) - 0.12;
    const d1 = C.mid + 0.12;
    const y0 = 0.1;
    const y1 = Math.min(1.12, P.fTop(C.mid) + 0.05);
    const W2 = d1 - d0;
    const H2 = y1 - y0;
    const dc = (d0 + d1) / 2;
    for (const sz of [1, -1]) {
      const tex = canvasTex(512, Math.round(512 * (H2 / W2)), (g, w, h) => {
        g.strokeStyle = '#f4f6f8';
        g.lineWidth = Math.max(3, (0.028 / W2) * w);
        g.lineCap = 'round';
        g.beginPath();
        for (let k = 0; k <= 60; k++) {
          const y = y0 + 0.06 + (k / 60) * (H2 - 0.1);
          const d = cCurve(C, y);
          const sx = sz > 0 ? 0.5 - (d - dc) / W2 : 0.5 + (d - dc) / W2;
          const px = sx * w;
          const py = (1 - (y - y0) / H2) * h;
          if (k) g.lineTo(px, py);
          else g.moveTo(px, py);
        }
        g.stroke();
      });
      const m = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0x6a6e74, metalness: 0.85, roughness: 0.18, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -3 });
      decal({ center: new THREE.Vector3(P.L / 2 - dc, (y0 + y1) / 2, 0), dir: new THREE.Vector3(0, 0, -sz), u: Xv.clone().multiplyScalar(sz), v: Yv, w: W2, h: H2, nu: 40, nv: 30, offset: 0.004 }, m);
    }
  }
  // --- entrada de ar na porta (aerodinâmico)
  if (P.doorScoop) {
    const tex = canvasTex(256, 160, (g, w, h) => {
      g.fillStyle = '#050607';
      g.beginPath();
      g.moveTo(w * 0.05, h * 0.1);
      g.quadraticCurveTo(w * 0.6, h * 0.0, w * 0.95, h * 0.45);
      g.quadraticCurveTo(w * 0.7, h * 0.95, w * 0.15, h * 0.9);
      g.quadraticCurveTo(w * 0.35, h * 0.5, w * 0.05, h * 0.1);
      g.fill();
    });
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });
    const d = P.fo + P.rA + 0.28;
    const ymid = (P.fYb(d) + P.fTop(d)) / 2;
    for (const sz of [1, -1]) decal({ center: new THREE.Vector3(P.L / 2 - d, ymid, 0), dir: new THREE.Vector3(0, 0, -sz), u: Xv.clone().multiplyScalar(-sz), v: Yv, w: 0.5, h: 0.3, nu: 20, nv: 12 }, m);
  }
  // --- saídas de ar no capô (sedã de rali)
  if (P.hoodVents) {
    const t = canvasTex(256, 128, GRILLE.mesh);
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const oz of [-0.2, 0.2]) decal({ center: new THREE.Vector3(P.L / 2 - 0.78, 0, oz), dir: new THREE.Vector3(0, -1, 0), u: Xv.clone().negate(), v: Zv, w: 0.32, h: 0.2, nu: 12, nv: 8 }, m);
  }

  // --- frente em fibra de carbono (conceito)
  if (P.carbonFront) {
    const tex = canvasTex(512, 160, (g, w, h) => {
      g.fillStyle = '#0b0c0e';
      rrect(g, 2, 2, w - 4, h - 4, h * 0.28);
      g.fill();
      g.save();
      rrect(g, 2, 2, w - 4, h - 4, h * 0.28);
      g.clip();
      for (let y = 0; y < h; y += 8)
        for (let x = 0; x < w; x += 8) {
          g.fillStyle = (x / 8 + y / 8) % 2 ? '#1c1f24' : '#121418';
          g.fillRect(x, y, 8, 8);
        }
      g.fillStyle = 'rgba(0,0,0,0.55)';
      for (let x = w * 0.08; x < w * 0.92; x += w * 0.12) g.fillRect(x, h * 0.25, w * 0.08, h * 0.55);
      g.restore();
    });
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.3, alphaTest: 0.5 });
    const yb1 = P.fYb(0.3);
    decal({ center: new THREE.Vector3(0, yb1 + (noseTop - yb1) * 0.38, 0), dir: front, u: Zv.clone().negate(), v: Yv, w: hw0 * 1.85, h: (noseTop - yb1) * 0.55, nu: 40, nv: 12 }, m);
  }
  // --- faixa preta "visor" na frente
  if (P.visor) {
    const tex = canvasTex(512, 96, (g, w, h) => {
      g.fillStyle = '#050607';
      rrect(g, 2, 2, w - 4, h - 4, h * 0.45);
      g.fill();
    });
    const m = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.15, metalness: 0.3, clearcoat: 1, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -1 });
    decal({ center: new THREE.Vector3(0, noseTop - 0.05, 0), dir: front, u: Zv.clone().negate(), v: Yv, w: hw0 * 1.95, h: 0.13, nu: 48, nv: 8, offset: 0.002 }, m);
  }
  // --- duto central no capô
  if (P.hoodDuct) {
    const tex = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#050607';
      g.beginPath();
      g.moveTo(w * 0.1, h * 0.25);
      g.lineTo(w * 0.9, h * 0.1);
      g.lineTo(w * 0.9, h * 0.9);
      g.lineTo(w * 0.1, h * 0.75);
      g.closePath();
      g.fill();
    });
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });
    decal({ center: new THREE.Vector3(P.L / 2 - 0.62, 0, 0), dir: new THREE.Vector3(0, -1, 0), u: Xv.clone().negate(), v: Zv, w: 0.42, h: 0.42, nu: 12, nv: 12 }, m);
  }
  // --- saídas verticais no para-lama dianteiro
  if (P.fenderVents) {
    const tex = canvasTex(128, 256, (g, w, h) => {
      g.fillStyle = '#050607';
      for (let i = 0; i < 3; i++) rrect(g, w * (0.08 + i * 0.32), h * 0.05, w * 0.2, h * 0.9, 6), g.fill();
    });
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });
    const d = P.fo + P.rA + 0.1;
    const ymid = (P.fYb(d) + P.fTop(d)) / 2;
    for (const sz of [1, -1]) decal({ center: new THREE.Vector3(P.L / 2 - d, ymid, 0), dir: new THREE.Vector3(0, 0, -sz), u: Xv.clone().multiplyScalar(-sz), v: Yv, w: 0.14, h: 0.32, nu: 8, nv: 12 }, m);
  }
  // --- soleiras laterais em carbono
  if (P.sills) {
    const tex = canvasTex(512, 64, (g, w, h) => {
      g.fillStyle = '#0b0c0e';
      rrect(g, 2, 2, w - 4, h - 4, h * 0.4);
      g.fill();
    });
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, metalness: 0.3, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });
    const d0 = P.fo + P.rA + 0.04;
    const d1 = P.ra - P.rA - 0.04;
    const dm = (d0 + d1) / 2;
    for (const sz of [1, -1]) decal({ center: new THREE.Vector3(P.L / 2 - dm, P.fYb(dm) + 0.1, 0), dir: new THREE.Vector3(0, 0, -sz), u: Xv.clone().multiplyScalar(-sz), v: Yv, w: d1 - d0, h: 0.12, nu: 24, nv: 4 }, m);
  }
  // --- número de corrida no bico
  if (P.roundel) {
    const tex = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#f4f4f0';
      g.beginPath();
      g.ellipse(w / 2, h / 2, w * 0.48, h * 0.34, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = P.roundelColor || '#d1121b';
      g.font = `italic 900 ${Math.round(h * 0.42)}px Arial Black, Arial, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.save();
      g.translate(w / 2, h / 2);
      g.rotate(Math.PI / 2);
      g.fillText(String(P.roundel), 0, 4);
      g.restore();
    });
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -3 });
    decal({ center: new THREE.Vector3(P.L / 2 - 0.55, 0, 0), dir: new THREE.Vector3(0, -1, 0), u: Xv.clone().negate(), v: Zv, w: 0.5, h: 0.62, nu: 16, nv: 16, offset: 0.004 }, m);
  }

  // --- filetes de LED subindo pelos para-lamas (hiper GT)
  if (P.fenderLeds) {
    const tex = canvasTex(512, 32, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.35, '#ffffff');
      gr.addColorStop(1, '#ffffff');
      g.fillStyle = gr;
      rrect(g, 0, h * 0.2, w, h * 0.6, h * 0.3);
      g.fill();
    });
    const m = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 1.2, alphaTest: 0.3, polygonOffset: true, polygonOffsetFactor: -3 });
    for (const sz of [1, -1]) {
      const d = 0.42;
      decal({ center: new THREE.Vector3(P.L / 2 - d, 0, sz * ((P.fHw(d) * P.W) / 2) * 0.8), dir: new THREE.Vector3(0, -1, 0), u: Xv, v: Zv, w: 0.62, h: 0.035, nu: 30, nv: 2, offset: 0.004 }, m);
    }
  }
  // --- recorte escuro na lateral e número de corrida (hiper GT)
  if (P.cove) {
    const d0 = P.fo + P.rA + 0.08;
    const d1 = P.ra - P.rA - 0.04;
    const yA = P.fYb((d0 + d1) / 2) + 0.06;
    const yB = P.fTop((d0 + d1) / 2) - 0.22;
    for (const sz of [1, -1]) {
      const tex = canvasTex(512, 160, (g, w, h) => {
        g.fillStyle = P.cove;
        g.beginPath();
        // borda dianteira inclinada (lado direito do decalque fica na frente)
        g.moveTo(w * 0.02, h * 0.98);
        g.lineTo(w * 0.7, h * 0.98);
        g.lineTo(w * 0.98, h * 0.02);
        g.lineTo(w * 0.55, h * 0.02);
        g.closePath();
        g.fill();
      });
      const m = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.3, metalness: 0.4, clearcoat: 1, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });
      decal({ center: new THREE.Vector3(P.L / 2 - (d0 + d1) / 2, (yA + yB) / 2, 0), dir: new THREE.Vector3(0, 0, -sz), u: Xv.clone(), v: Yv, w: d1 - d0, h: yB - yA, nu: 30, nv: 10 }, m);
    }
  }
  if (P.sideNumber) {
    const d = P.fo + P.rA + 0.42;
    const y = P.fTop(d) - 0.25;
    for (const sz of [1, -1]) {
      const tex = canvasTex(256, 160, (g, w, h) => {
        g.font = `italic 900 ${Math.round(h * 0.78)}px Arial Black, Arial, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineWidth = 8;
        g.strokeStyle = 'rgba(20,20,24,0.9)';
        g.strokeText(String(P.sideNumber), w / 2, h / 2);
        g.fillStyle = P.numberColor || '#f4f4f0';
        g.fillText(String(P.sideNumber), w / 2, h / 2);
      });
      const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -4 });
      decal({ center: new THREE.Vector3(P.L / 2 - d, y, 0), dir: new THREE.Vector3(0, 0, -sz), u: Xv.clone().multiplyScalar(sz), v: Yv, w: 0.36, h: 0.22, nu: 12, nv: 8, offset: 0.005 }, m);
    }
  }
  // --- bandeirinha tricolor curta no capô
  if (P.hoodFlag) {
    P.hoodFlag.forEach((fc, i) => {
      const m = paintMaterial(fc, 'gloss');
      m.vertexColors = false;
      m.polygonOffset = true;
      m.polygonOffsetFactor = -3;
      decal({ center: new THREE.Vector3(P.L / 2 - 0.85, 0, 0.32 + (i - 1) * 0.04), dir: new THREE.Vector3(0, -1, 0), u: Xv, v: Zv, w: 0.5, h: 0.035, nu: 20, nv: 2, offset: 0.004 }, m);
    });
  }
  // --- adesivo de fogo na lateral
  if (P.flames) {
    const d0 = P.fo - 0.1;
    const d1 = P.ra - P.rA + 0.15;
    const yA = P.fYb((d0 + d1) / 2) + 0.05;
    const yB = P.fTop((d0 + d1) / 2) - 0.02;
    const tex = canvasTex(1024, 320, (g, w, h) => {
      // labaredas nascem na frente (direita) e lambem para trás (esquerda)
      const layer = (scale, colors, outline) => {
        const gr = g.createLinearGradient(w, 0, 0, 0);
        colors.forEach((c, i) => gr.addColorStop(i / (colors.length - 1), c));
        g.fillStyle = gr;
        g.strokeStyle = outline;
        g.lineWidth = 5;
        const N = 6;
        g.beginPath();
        g.moveTo(w, h * 0.12);
        for (let i = 0; i < N; i++) {
          const y0 = h * (0.12 + (i / N) * 0.76);
          const y1 = h * (0.12 + ((i + 1) / N) * 0.76);
          const ym = (y0 + y1) / 2;
          const len = w * scale * (0.55 + 0.4 * Math.abs(Math.sin(i * 2.3 + 1)));
          const tipY = ym + (y1 - y0) * 0.55;
          g.bezierCurveTo(w * 0.7, y0 - h * 0.02, w - len * 0.7, ym - h * 0.08, w - len, tipY);
          g.bezierCurveTo(w - len * 0.62, ym + h * 0.02, w * 0.78, y1 - h * 0.03, w * 0.86, y1);
        }
        g.lineTo(w, h * 0.88);
        g.closePath();
        g.fill();
        if (outline) g.stroke();
      };
      layer(1.0, ['#ffe066', '#ff8a00', '#e8180f', '#a80b06'], 'rgba(90,0,0,0.9)');
      layer(0.62, ['#fff7c2', '#ffd21a', '#ff7a00'], '');
    });
    const m = new THREE.MeshPhysicalMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.25, clearcoat: 1, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -3 });
    for (const sz of [1, -1]) decal({ center: new THREE.Vector3(P.L / 2 - (d0 + d1) / 2, (yA + yB) / 2, 0), dir: new THREE.Vector3(0, 0, -sz), u: Xv.clone(), v: Yv, w: d1 - d0, h: yB - yA, nu: 48, nv: 16, offset: 0.004 }, m);
  }

  // --- entradas verticais escuras ao lado da grade (conceito vertical)
  if (P.vflank) {
    const tex = canvasTex(160, 256, (g, w, h) => {
      g.fillStyle = '#060708';
      rrect(g, 2, 2, w - 4, h - 4, 8);
      g.fill();
      g.fillStyle = '#23272d';
      for (let x = w * 0.14; x < w * 0.9; x += w * 0.16) g.fillRect(x, h * 0.06, w * 0.05, h * 0.88);
    });
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.4, alphaTest: 0.5 });
    for (const sz of [1, -1]) decal({ center: new THREE.Vector3(0, noseTop + P.lightY - (P.grilleY ?? 0.02), sz * hw0 * 0.6), dir: front, u: Zv.clone().negate(), v: Yv, w: 0.26, h: P.grilleH || 0.4, nu: 12, nv: 16 }, m);
  }
  // --- friso escuro no capô, junto ao para-brisa
  if (P.hoodSlot) {
    const tex = canvasTex(64, 256, (g, w, h) => {
      g.fillStyle = '#050607';
      rrect(g, 2, 2, w - 4, h - 4, 10);
      g.fill();
    });
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0, envMapIntensity: 0.15, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });
    decal({ center: new THREE.Vector3(P.L / 2 - (P.gh.ws - 0.22), 0, 0), dir: new THREE.Vector3(0, -1, 0), u: Xv.clone().negate(), v: Zv, w: 0.12, h: hw0 * 0.9, nu: 6, nv: 16 }, m);
  }
  // --- entrada vertical alta na lateral, atrás da porta
  if (P.sideSlot) {
    const tex = canvasTex(96, 320, (g, w, h) => {
      g.fillStyle = '#040506';
      rrect(g, 2, 2, w - 4, h - 4, 12);
      g.fill();
    });
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });
    const d = P.ra - P.rA - 0.32;
    const yA = P.fYb(d) + 0.14;
    const yB = P.fTop(d) - 0.08;
    for (const sz of [1, -1]) decal({ center: new THREE.Vector3(P.L / 2 - d, (yA + yB) / 2, 0), dir: new THREE.Vector3(0, 0, -sz), u: Xv.clone().multiplyScalar(sz), v: Yv, w: 0.13, h: yB - yA, nu: 6, nv: 16 }, m);
  }
  // --- adesivo sombrio de caveira na porta
  if (P.skull) {
    const tex = canvasTex(512, 512, (g, w, h) => {
      const ink = '#141417';
      const edge = 'rgba(70,72,80,0.9)';
      // crânio e mandíbula
      g.fillStyle = ink;
      g.strokeStyle = edge;
      g.lineWidth = 6;
      g.beginPath();
      g.ellipse(w * 0.5, h * 0.4, w * 0.3, h * 0.29, 0, Math.PI * 0.82, Math.PI * 2.18);
      g.bezierCurveTo(w * 0.78, h * 0.62, w * 0.7, h * 0.66, w * 0.68, h * 0.7);
      g.lineTo(w * 0.66, h * 0.86);
      g.quadraticCurveTo(w * 0.5, h * 0.95, w * 0.34, h * 0.86);
      g.lineTo(w * 0.32, h * 0.7);
      g.bezierCurveTo(w * 0.3, h * 0.66, w * 0.22, h * 0.62, w * 0.235, h * 0.535);
      g.closePath();
      g.fill();
      g.stroke();
      // órbitas com brilho vermelho fraco
      for (const ex of [0.375, 0.625]) {
        g.fillStyle = '#030304';
        g.beginPath();
        g.ellipse(w * ex, h * 0.43, w * 0.085, h * 0.075, ex < 0.5 ? 0.25 : -0.25, 0, Math.PI * 2);
        g.fill();
        const gr = g.createRadialGradient(w * ex, h * 0.44, 1, w * ex, h * 0.44, w * 0.05);
        gr.addColorStop(0, 'rgba(255,40,30,0.95)');
        gr.addColorStop(1, 'rgba(120,0,0,0)');
        g.fillStyle = gr;
        g.beginPath();
        g.arc(w * ex, h * 0.44, w * 0.05, 0, Math.PI * 2);
        g.fill();
      }
      // nariz
      g.fillStyle = '#030304';
      g.beginPath();
      g.moveTo(w * 0.5, h * 0.52);
      g.lineTo(w * 0.465, h * 0.6);
      g.quadraticCurveTo(w * 0.5, h * 0.62, w * 0.535, h * 0.6);
      g.closePath();
      g.fill();
      // dentes
      g.strokeStyle = '#030304';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(w * 0.35, h * 0.74);
      g.lineTo(w * 0.65, h * 0.74);
      for (let x = 0.38; x < 0.64; x += 0.045) {
        g.moveTo(w * x, h * 0.69);
        g.lineTo(w * x, h * 0.84);
      }
      g.stroke();
      // rachadura no crânio
      g.strokeStyle = edge;
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(w * 0.46, h * 0.13);
      g.lineTo(w * 0.5, h * 0.21);
      g.lineTo(w * 0.47, h * 0.27);
      g.lineTo(w * 0.52, h * 0.33);
      g.stroke();
    });
    const m = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.55, metalness: 0.1, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -4 });
    const d = (P.fo + P.rA + 0.1 + (P.ra - P.rA - 0.5)) / 2;
    const y = (P.fYb(d) + P.fTop(d)) / 2 + 0.02;
    const size = Math.min(0.66, (P.fTop(d) - P.fYb(d)) * 0.95);
    for (const sz of [1, -1]) decal({ center: new THREE.Vector3(P.L / 2 - d, y, 0), dir: new THREE.Vector3(0, 0, -sz), u: Xv.clone().multiplyScalar(sz), v: Yv, w: size, h: size, nu: 24, nv: 24, offset: 0.005 }, m);
  }

  // --- filete colorido na soleira (flecha)
  if (P.sillLine) {
    const tex = canvasTex(512, 16, (g, w, h) => {
      g.fillStyle = P.sillLine;
      g.fillRect(0, h * 0.2, w, h * 0.6);
    });
    const m = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.5, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -3 });
    const d0 = P.fo + P.rA + 0.02;
    const d1 = P.ra - P.rA - 0.02;
    const dm = (d0 + d1) / 2;
    for (const sz of [1, -1]) decal({ center: new THREE.Vector3(P.L / 2 - dm, P.fYb(dm) + 0.05, 0), dir: new THREE.Vector3(0, 0, -sz), u: Xv.clone(), v: Yv, w: d1 - d0, h: 0.025, nu: 30, nv: 2, offset: 0.004 }, m);
  }
  // --- adesivo de corrida: número no círculo, faixa quadriculada e patrocinador
  if (P.raceLivery) {
    const R = P.raceLivery;
    const d = P.fo + P.rA + 0.45;
    const y = (P.fYb(d) + P.fTop(d)) / 2 + 0.04;
    const num = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#f4f4f0';
      g.beginPath();
      g.arc(w / 2, h / 2, w * 0.47, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 10;
      g.strokeStyle = R.color || '#d1121b';
      g.stroke();
      g.fillStyle = '#111214';
      g.font = `italic 900 ${Math.round(h * 0.58)}px Arial Black, Arial, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(R.number), w / 2, h / 2 + 6);
    });
    const checker = canvasTex(512, 48, (g, w, h) => {
      const c = h / 2;
      for (let x = 0; x < w; x += c) for (let yy = 0; yy < h; yy += c) {
        g.fillStyle = (x / c + yy / c) % 2 ? '#111214' : '#f4f4f0';
        g.fillRect(x, yy, c, c);
      }
    });
    const sponsor = canvasTex(512, 96, (g, w, h) => {
      g.fillStyle = R.color || '#d1121b';
      rrect(g, 4, 8, w - 8, h - 16, 10);
      g.fill();
      g.fillStyle = '#ffffff';
      g.font = `italic 900 ${Math.round(h * 0.46)}px Arial Black, Arial, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(R.sponsor || 'LENDÁRIA', w / 2, h / 2 + 2);
    });
    const mk = (t, k) => new THREE.MeshStandardMaterial({ map: t, roughness: 0.35, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: k });
    const d0 = P.fo + P.rA + 0.04;
    const d1 = P.ra - P.rA - 0.04;
    for (const sz of [1, -1]) {
      decal({ center: new THREE.Vector3(P.L / 2 - d, y, 0), dir: new THREE.Vector3(0, 0, -sz), u: Xv.clone().multiplyScalar(sz), v: Yv, w: 0.42, h: 0.42, nu: 16, nv: 16, offset: 0.005 }, mk(num, -4));
      decal({ center: new THREE.Vector3(P.L / 2 - (d0 + d1) / 2, P.fYb((d0 + d1) / 2) + 0.11, 0), dir: new THREE.Vector3(0, 0, -sz), u: Xv.clone(), v: Yv, w: d1 - d0, h: 0.06, nu: 30, nv: 3, offset: 0.005 }, mk(checker, -4));
      const ds = d + 0.62;
      decal({ center: new THREE.Vector3(P.L / 2 - ds, y - 0.02, 0), dir: new THREE.Vector3(0, 0, -sz), u: Xv.clone().multiplyScalar(sz), v: Yv, w: 0.5, h: 0.1, nu: 16, nv: 4, offset: 0.005 }, mk(sponsor, -4));
    }
  }
  // --- abertura das portas asa de gaivota (interior visível)
  if (P.gullwing) {
    const tex = canvasTex(256, 160, (g, w, h) => {
      g.fillStyle = '#0c0c0e';
      rrect(g, 2, 2, w - 4, h - 4, 18);
      g.fill();
      // encosto do banco aparecendo pela abertura
      g.fillStyle = P.interior || '#141416';
      rrect(g, w * 0.55, h * 0.12, w * 0.28, h * 0.7, 16);
      g.fill();
    });
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -3 });
    const d0 = G.ws + 0.25;
    const d1 = d0 + 1.05;
    const yA = P.fYb((d0 + d1) / 2) + 0.2;
    const yB = P.fTop((d0 + d1) / 2) + 0.02;
    for (const sz of [1, -1]) decal({ center: new THREE.Vector3(P.L / 2 - (d0 + d1) / 2, (yA + yB) / 2, 0), dir: new THREE.Vector3(0, 0, -sz), u: Xv.clone(), v: Yv, w: d1 - d0, h: yB - yA, nu: 20, nv: 10, offset: 0.004 }, m);
  }

  // --- linhas de porta
  if (!P.noDoors) {
    const dc = spec.finish === 'chrome' ? '#30343a' : 'rgba(0,0,0,0.75)';
    const dt = doorTex(dc);
    const m = new THREE.MeshStandardMaterial({ map: dt, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    const d0 = G.ws + 0.12;
    const d1 = Math.min(G.bp + 0.02, P.ra - P.rA - 0.05);
    const yTop = P.fTop((d0 + d1) / 2) - 0.03;
    const yBot = P.fYb((d0 + d1) / 2) + 0.1;
    for (const sz of [1, -1]) {
      decal({ center: new THREE.Vector3(P.L / 2 - (d0 + d1) / 2, (yTop + yBot) / 2, 0), dir: new THREE.Vector3(0, 0, -sz), u: Xv.clone().multiplyScalar(-sz), v: Yv, w: d1 - d0, h: yTop - yBot, nu: 16, nv: 8, offset: 0.003 }, m);
    }
  }
  // --- lanternas
  {
    const tt = tailTex();
    const m = new THREE.MeshStandardMaterial({ map: tt, emissiveMap: tt, emissive: 0xffffff, emissiveIntensity: 0.6, alphaTest: 0.5 });
    const ty = P.fTop(P.L - 0.15) - 0.1;
    const hwr = (P.fHw(P.L - 0.3) * P.W) / 2;
    for (const sz of [1, -1]) decal({ center: new THREE.Vector3(0, ty, sz * hwr * 0.62), dir: new THREE.Vector3(1, 0, 0), u: Zv.clone().multiplyScalar(sz), v: Yv, w: 0.42, h: 0.1, nu: 16, nv: 6 }, m);
  }

  // --- retrovisores
  {
    const md = G.ws + (G.roofF - G.ws) * 0.35;
    const y = P.fTop(md) + 0.06;
    const hwM = (P.fHw(md) * P.W) / 2 - P.gh.inset * 0.4;
    for (const sz of [1, -1]) {
      const g = new THREE.SphereGeometry(0.075, 20, 12);
      g.scale(1.1, 0.75, 1.25);
      const m = new THREE.Mesh(g, spec.mirrors === 'black' ? trim : paint);
      m.position.set(P.L / 2 - md, y, sz * (hwM + 0.07));
      car.add(m);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.025, 0.1), trim);
      arm.position.set(P.L / 2 - md + 0.02, y - 0.02, sz * (hwM + 0.0));
      car.add(arm);
    }
  }

  // --- tomada de ar no capô
  if (P.scoop || spec.scoop) {
    const d = 1.2;
    const y = P.fTop(d) - P.fDip(d);
    const g = new THREE.BoxGeometry(0.62, 0.11, 0.5, 4, 2, 4);
    const pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i);
      if (pa.getY(i) > 0 && x > 0) pa.setY(i, pa.getY(i) - 0.07 * (x / 0.31));
      pa.setZ(i, pa.getZ(i) * (1 - 0.15 * (pa.getY(i) > 0 ? 1 : 0)));
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, paint2 && spec.scoopColor2 ? paint2 : paint);
    m.position.set(P.L / 2 - d, y + 0.02, 0);
    car.add(m);
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.05), trim);
    mouth.rotation.y = Math.PI / 2;
    mouth.position.set(P.L / 2 - d + 0.312, y + 0.06, 0);
    car.add(mouth);
  }

  // --- cockpit aberto (conversíveis): abertura escura, bancos e volante
  if (G.open) {
    const d0 = G.rw + 0.02;
    const d1 = d0 + (P.cockpit || 0.95);
    const hwc = (P.fHw((d0 + d1) / 2) * P.W) / 2;
    const ct = canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = '#0a0a0b';
      rrect(g, 2, 2, w - 4, h - 4, h * 0.42);
      g.fill();
    });
    decal({ center: new THREE.Vector3(P.L / 2 - (d0 + d1) / 2, 0, 0), dir: new THREE.Vector3(0, -1, 0), u: Xv.clone().negate(), v: Zv, w: d1 - d0, h: hwc * 1.45, nu: 24, nv: 12, offset: 0.003 }, new THREE.MeshStandardMaterial({ map: ct, roughness: 0.8, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2 }));
    const leather = new THREE.MeshStandardMaterial({ color: new THREE.Color(P.interior || '#3b2a22'), roughness: 0.6 });
    const deck = P.fTop((d0 + d1) / 2) - P.fDip((d0 + d1) / 2);
    for (const sz of [1, -1]) {
      const back = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.28, 4, 10), leather);
      back.scale.set(1, 1, 2.2);
      back.position.set(P.L / 2 - (d1 - 0.2), deck + 0.08, sz * hwc * 0.36);
      back.rotation.z = 0.25;
      car.add(back);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), leather);
      head.scale.set(0.7, 0.9, 1.3);
      head.position.set(P.L / 2 - (d1 - 0.12), deck + 0.36, sz * hwc * 0.36);
      car.add(head);
    }
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.018, 8, 28), trim);
    wheel.position.set(P.L / 2 - (d0 + 0.28), deck + 0.2, hwc * 0.36);
    wheel.rotation.y = Math.PI / 2;
    wheel.rotation.x = 0.35;
    car.add(wheel);
  }

  // --- enfeite de capô (luxuoso)
  if (P.ornament) {
    const y = P.fTop(0.18);
    const fig = new THREE.Group();
    const body2 = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.1, 10), chromeTrim);
    body2.position.y = 0.05;
    fig.add(body2);
    const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.004), chromeTrim);
    wingL.position.set(-0.03, 0.08, 0);
    wingL.rotation.z = 0.5;
    fig.add(wingL);
    fig.position.set(P.L / 2 - 0.18, y - 0.005, 0);
    car.add(fig);
  }
  // --- faróis-bala cromados (vintage)
  if (P.lamps) {
    const lens = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3d6, emissiveIntensity: 1.1, roughness: 0.1 });
    for (const sz of [1, -1]) {
      const g = new THREE.Group();
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.07, 0.16, 24), chromeTrim);
      shell.rotation.z = Math.PI / 2;
      g.add(shell);
      const glassL = new THREE.Mesh(new THREE.CircleGeometry(0.1, 24), lens);
      glassL.rotation.y = Math.PI / 2;
      glassL.position.x = 0.081;
      g.add(glassL);
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 8), chromeTrim);
      stalk.position.set(-0.04, -0.15, 0);
      g.add(stalk);
      g.position.set(P.L / 2 - 0.12, P.fTop(0.1) - 0.02, sz * 0.5);
      car.add(g);
    }
  }
  // --- para-lamas separados e estribos (vintage)
  if (P.fenders) {
    const fm = paint2 || new THREE.MeshPhysicalMaterial({ color: 0x0b0b0d, metalness: 0.4, roughness: 0.25, clearcoat: 1 });
    const fmat = fm.clone();
    fmat.vertexColors = false;
    fmat.side = THREE.DoubleSide;
    const R = P.wr + 0.07;
    const width = P.tw + 0.14;
    for (const da of [P.fo, P.ra]) {
      for (const sz of [1, -1]) {
        const arc = da === P.fo ? 3.4 : 3.0;
        const g = new THREE.CylinderGeometry(R, R, width, 36, 1, true, Math.PI - arc / 2 + (da === P.fo ? -0.25 : 0.2), arc);
        g.rotateX(Math.PI / 2);
        const f = new THREE.Mesh(g, fmat);
        f.position.set(P.L / 2 - da, P.wr, sz * P.track);
        car.add(f);
        // tampa lateral interna do para-lama
        const cap = new THREE.Mesh(new THREE.RingGeometry(P.wr + 0.02, R, 36, 1, Math.PI / 2 - arc / 2, arc), fmat);
        cap.position.set(P.L / 2 - da, P.wr, sz * (P.track - width / 2));
        car.add(cap);
      }
    }
    const x0 = P.L / 2 - (P.fo + R * 0.75);
    const x1 = P.L / 2 - (P.ra - R * 0.95);
    const hwB = (P.fHw((P.fo + P.ra) / 2) * P.W) / 2;
    const zOut = P.track + width / 2;
    for (const sz of [1, -1]) {
      const rb = new THREE.Mesh(new THREE.BoxGeometry(x0 - x1, 0.035, zOut - hwB + 0.04), fmat);
      rb.position.set((x0 + x1) / 2, P.fYb((P.fo + P.ra) / 2) + 0.02, sz * (hwB + zOut) / 2);
      car.add(rb);
    }
    // estepe na traseira
    const spare = buildWheel(P, mats);
    spare.rotation.y = Math.PI / 2;
    spare.position.set(-P.L / 2 - P.tw * 0.4, P.fYb(P.L - 0.2) + P.wr + 0.05, 0);
    car.add(spare);
  }

  // --- caçamba (picape): tampa preta
  if (P.bed) {
    const [b0, b1] = P.bed;
    const y = P.fTop((b0 + b1) / 2) + 0.004;
    const hwb = (P.fHw((b0 + b1) / 2) * P.W) / 2 - 0.07;
    const g = new THREE.BoxGeometry(b1 - b0, 0.03, hwb * 2);
    const m = new THREE.Mesh(g, trim);
    m.position.set(P.L / 2 - (b0 + b1) / 2, y, 0);
    car.add(m);
  }

  // --- aerofólio
  if (P.wing || spec.wing) {
    const d = P.L - 0.28;
    const y = P.fTop(d);
    const span = (P.fHw(d) * P.W) * 0.9;
    const shape = new THREE.Shape();
    const c = P.wingChord ?? 0.3;
    shape.moveTo(-c / 2, 0);
    shape.quadraticCurveTo(-c * 0.1, 0.05, c / 2, 0.02);
    shape.lineTo(c / 2, 0.005);
    shape.quadraticCurveTo(0, 0.0, -c / 2, -0.012);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: span, bevelEnabled: false, curveSegments: 10 });
    g.translate(0, 0, -span / 2);
    const wingMat = P.wingColor === 'body' ? paint : P.wingColor === 'accent' && paint2 ? paint2 : trim;
    const w = new THREE.Mesh(g, wingMat);
    const hgt = P.wingH ?? 0.26;
    w.position.set(P.L / 2 - d - 0.02, y + hgt, 0);
    w.rotation.z = -0.1;
    car.add(w);
    for (const sz of [1, -1]) {
      const sh2 = P.swan ? hgt + 0.12 : hgt + 0.03;
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.12, sh2, 0.025), trim);
      st.position.set(P.L / 2 - d + (P.swan ? 0.06 : 0), y + sh2 / 2 - 0.01, sz * span * 0.33);
      car.add(st);
      const ep = new THREE.Mesh(new THREE.BoxGeometry(c + 0.04, 0.12 + c * 0.25, 0.012), wingMat);
      ep.position.set(P.L / 2 - d - 0.02, y + hgt + 0.02, sz * span / 2);
      car.add(ep);
    }
  }

  // --- tomada de ar no teto
  if (P.roofScoop) {
    const d = P.roofScoop;
    const y = P.roofFn.top(d) + 0.03;
    const g = new THREE.BoxGeometry(0.5, 0.12, 0.3, 4, 2, 2);
    const pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i);
      if (pa.getY(i) > 0) pa.setY(i, pa.getY(i) - 0.07 * clamp(-x / 0.25, 0, 1));
      pa.setZ(i, pa.getZ(i) * (pa.getY(i) > 0 ? 0.8 : 1));
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, paint2 && !P.split ? paint2 : roofMat === paint ? trim : roofMat);
    m.position.set(P.L / 2 - d, y, 0);
    car.add(m);
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.07), trim);
    mouth.rotation.y = Math.PI / 2;
    mouth.position.set(P.L / 2 - d + 0.252, y + 0.02, 0);
    car.add(mouth);
  }
  // --- barbatana (carro de pista)
  if (P.fin) {
    const sh = new THREE.Shape();
    const xA = P.L / 2 - (G.roofR - 0.05);
    const dB = P.L - 0.4;
    const xB = P.L / 2 - dB;
    sh.moveTo(xA, P.roofFn.top(G.roofR - 0.05));
    sh.lineTo(xB, P.fTop(dB) + (P.finH ?? 0.36));
    sh.lineTo(xB - 0.08, P.fTop(dB) + (P.finH ?? 0.36));
    sh.lineTo(xB - 0.08, P.fTop(dB) - 0.05);
    for (let k = 0; k <= 10; k++) {
      const d = lerp(dB, G.roofR, k / 10);
      const yy = d < G.rw ? P.roofFn.top(d) : P.fTop(d) - P.fDip(d);
      sh.lineTo(P.L / 2 - d, yy - 0.04);
    }
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.014, bevelEnabled: false });
    g.translate(0, 0, -0.007);
    car.add(new THREE.Mesh(g, paint2 && !P.split ? paint2 : trim));
  }
  // --- splitter dianteiro e canards
  if (P.splitter) {
    if (P.splitterAccent) {
      const acc = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.026, hw0 * 1.78), new THREE.MeshStandardMaterial({ color: new THREE.Color(P.splitterAccent), roughness: 0.4 }));
      acc.position.set(P.L / 2 - 0.08, P.fYb(0.3) + 0.012, 0);
      car.add(acc);
    }
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.022, hw0 * 1.78), trim);
    sp.position.set(P.L / 2 - 0.2, P.fYb(0.3) + 0.01, 0);
    car.add(sp);
  }
  if (P.canards) {
    for (const sz of [1, -1])
      for (const k of [0, 1]) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.01, 0.07), trim);
        c.position.set(P.L / 2 - 0.3 - k * 0.03, P.fYb(0.3) + 0.12 + k * 0.07, sz * (hw0 * 0.94 + 0.02));
        c.rotation.z = -0.22;
        car.add(c);
      }
  }

  // --- canards empilhados (hipercarro de Le Mans)
  if (P.canardStack) {
    for (const sz of [1, -1])
      for (let k = 0; k < P.canardStack; k++) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.1), trim);
        c.position.set(P.L / 2 - 0.26 - k * 0.02, P.fYb(0.3) + 0.1 + k * 0.09, sz * (hw0 * 0.95 + 0.03));
        c.rotation.z = -0.15;
        car.add(c);
      }
    for (const sz of [1, -1]) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.22, P.canardStack * 0.09 + 0.06, 0.012), trim);
      plate.position.set(P.L / 2 - 0.28, P.fYb(0.3) + 0.08 + P.canardStack * 0.045, sz * (hw0 * 0.95 + 0.08));
      car.add(plate);
    }
  }
  // --- antena no teto
  if (P.antenna) {
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.01, 0.32, 6), trim);
    const d = G.roofR + 0.05;
    a.position.set(P.L / 2 - d, P.roofFn.top(Math.min(d, G.rw - 0.01)) + 0.15, 0.12);
    a.rotation.z = -0.25;
    car.add(a);
  }
  // --- neon embaixo do carro (pinturas neon e RGB)
  if (spec.finish === 'neon' || spec.finish === 'rgb' || spec.underglow) {
    const rgb = spec.finish === 'rgb';
    const tex = canvasTex(512, 256, (g, w, h) => {
      const off = document.createElement('canvas');
      off.width = w;
      off.height = h;
      const o = off.getContext('2d');
      if (rgb) {
        const lg = o.createLinearGradient(0, 0, w, 0);
        ['#ff0040', '#ff9900', '#ffee00', '#22ff66', '#00d5ff', '#4455ff', '#cc33ff'].forEach((c, i, a) => lg.addColorStop(i / (a.length - 1), c));
        o.fillStyle = lg;
      } else o.fillStyle = spec.underglow || spec.color;
      o.fillRect(0, 0, w, h);
      o.globalCompositeOperation = 'destination-in';
      // o gradiente é aplicado com escala vertical: centro em (w/2, w/2) vira (w/2, h/2)
      const rg = o.createRadialGradient(w / 2, w / 2, 4, w / 2, w / 2, w / 2);
      rg.addColorStop(0, 'rgba(0,0,0,0.95)');
      rg.addColorStop(0.45, 'rgba(0,0,0,0.6)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      o.fillStyle = rg;
      o.save();
      o.scale(1, h / w);
      o.fillRect(0, 0, w, w);
      o.restore();
      g.drawImage(off, 0, 0);
    });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(P.L * 1.25, P.W * 2.0), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.004;
    glow.renderOrder = 1;
    glow.userData.noShadow = true;
    glow.userData.noFrame = true;
    car.add(glow);
  }

  // --- para-lamas dianteiros soltos sobre as rodas (cockpit aberto)
  if (P.cycleFenders) {
    const fm = paint.clone();
    fm.side = THREE.DoubleSide;
    fm.vertexColors = false;
    if (paint.userData.fx) applyFx(fm, P.L);
    const R = P.wr + 0.06;
    const width = P.tw + 0.08;
    const hwF = (P.fHw(P.fo) * P.W) / 2;
    for (const sz of [1, -1]) {
      const g = new THREE.CylinderGeometry(R, R, width, 36, 1, true, Math.PI - 1.75 - 0.3, 3.5);
      g.rotateX(Math.PI / 2);
      const f = new THREE.Mesh(g, fm);
      f.position.set(P.L / 2 - P.fo, P.wr, sz * P.trackF);
      car.add(f);
      // braço que liga o para-lama ao bico
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, P.trackF - width / 2 - hwF + 0.12), trim);
      arm.position.set(P.L / 2 - P.fo, P.wr + 0.12, sz * (hwF + (P.trackF - width / 2 - hwF) / 2 - 0.04));
      car.add(arm);
    }
  }
  // --- arco de proteção e caixa de ar atrás do cockpit
  if (P.rollHoop && G.open) {
    const d1 = G.rw + 0.02 + (P.cockpit || 0.95);
    const deck = P.fTop(d1) - P.fDip(d1);
    const hwc = (P.fHw(d1) * P.W) / 2;
    const hoopMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.9, roughness: 0.3 });
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(hwc * 0.6, 0.032, 10, 32, Math.PI), hoopMat);
    hoop.rotation.y = Math.PI / 2;
    hoop.position.set(P.L / 2 - (d1 - 0.05), deck + 0.05, 0);
    car.add(hoop);
    const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.6, 8), hoopMat);
    brace.rotation.z = Math.PI / 2 + 0.75;
    brace.position.set(P.L / 2 - (d1 + 0.18), deck + 0.28, 0);
    car.add(brace);
  }
  if (P.airbox && G.open) {
    const d = G.rw + 0.02 + (P.cockpit || 0.95) + 0.22;
    const y = P.fTop(d) - P.fDip(d);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.34), trim);
    box.position.set(P.L / 2 - d, y + 0.09, 0);
    car.add(box);
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.12), new THREE.MeshStandardMaterial({ color: 0x020203, roughness: 0.9 }));
    mouth.rotation.y = Math.PI / 2;
    mouth.position.set(P.L / 2 - d + 0.182, y + 0.1, 0);
    car.add(mouth);
  }
  // --- crista central com rebites (art déco)
  if (P.dorsal) {
    const ridgeY = (d) => {
      if (d > G.ws && d < G.rw) {
        const t = P.roofFn.top(d);
        const h = t - P.roofFn.base(d);
        return Math.max(t + 0.035 * clamp(h / 0.3, 0, 1), P.fTop(d) - P.fDip(d));
      }
      return P.fTop(d) - P.fDip(d);
    };
    const d0 = 0.35;
    const d1 = P.L - 0.18;
    const sh = new THREE.Shape();
    const N = 80;
    for (let k = 0; k <= N; k++) {
      const d = lerp(d0, d1, k / N);
      const y = ridgeY(d) + 0.028 * Math.sin((Math.PI * k) / N) + 0.008;
      if (k) sh.lineTo(P.L / 2 - d, y);
      else sh.moveTo(P.L / 2 - d, y);
    }
    for (let k = N; k >= 0; k--) {
      const d = lerp(d0, d1, k / N);
      sh.lineTo(P.L / 2 - d, ridgeY(d) - 0.04);
    }
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 4 });
    g.translate(0, 0, -0.011);
    car.add(new THREE.Mesh(g, paint));
    const rivet = new THREE.SphereGeometry(0.007, 8, 6);
    for (let d = d0 + 0.05; d < d1 - 0.05; d += 0.075) {
      for (const sz of [1, -1]) {
        const r = new THREE.Mesh(rivet, chromeTrim);
        r.position.set(P.L / 2 - d, ridgeY(d) + 0.004, sz * 0.024);
        car.add(r);
      }
    }
  }

  // --- portas asa de gaivota abertas (dobradiça no centro do teto)
  if (P.gullwing) {
    const d0 = G.ws + 0.25;
    const len = 1.05;
    const dm = d0 + len / 2;
    const roofTop = P.roofFn.top(dm) + 0.02;
    const hwM = (P.fHw(dm) * P.W) / 2;
    const inner = new THREE.MeshStandardMaterial({ color: new THREE.Color(P.interior || '#141416'), roughness: 0.6 });
    for (const sz of [1, -1]) {
      const door = new THREE.Group();
      // pedaço do teto (fechado: deitado), janela e painel lateral (fechado: em pé)
      const roofW = Math.max(0.3, hwM - G.inset - G.tumble - 0.1);
      const top = new THREE.Mesh(new THREE.BoxGeometry(len * 0.82, 0.03, roofW), [paint, paint, paint, inner, paint, paint]);
      top.position.set(0, 0, roofW / 2);
      door.add(top);
      const win = new THREE.Mesh(new THREE.BoxGeometry(len * 0.8, 0.3, 0.02), glass);
      win.position.set(0, -0.16, roofW + 0.04);
      win.rotation.x = 0.2;
      door.add(win);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(len, 0.42, 0.035), [paint, paint, paint, paint, paint, inner]);
      panel.position.set(0, -0.52, roofW + 0.09);
      door.add(panel);
      door.position.set(P.L / 2 - dm, roofTop, sz * 0.12);
      door.rotation.x = sz > 0 ? -1.15 : 1.15;
      if (sz < 0) door.scale.z = -1;
      car.add(door);
    }
  }

  // --- rodas
  for (const da of [P.fo, P.ra]) {
    const x = P.L / 2 - da;
    const hwA = (P.fHw(da) * P.W) / 2;
    for (const sz of [1, -1]) {
      const wgrp = buildWheel(P, mats);
      const trk = da === P.fo && P.trackF ? P.trackF : P.track;
      wgrp.position.set(x, P.wr, sz * (trk ?? hwA - P.tw * 0.5 - 0.035));
      if (sz < 0) wgrp.rotation.y = Math.PI;
      if (da === P.fo) wgrp.rotation.y += (spec.steer ?? 0.32) * (sz > 0 ? 1 : 1);
      car.add(wgrp);
    }
  }

  car.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = !o.userData.noShadow;
      o.receiveShadow = false;
    }
  });
  car.userData.P = P;
  return car;
}

// ---------------------------------------------------------------------------
// Caixas (loot boxes) para a loja
// ---------------------------------------------------------------------------
export function buildBox(spec) {
  const grp = new THREE.Group();
  const col = new THREE.Color(spec.color);
  const metal = new THREE.MeshPhysicalMaterial({ color: col, metalness: 0.85, roughness: spec.rough ?? 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2, iridescence: spec.irid ? 0.8 : 0 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0a0b0d, roughness: 0.5, metalness: 0.4 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.accent || '#d8dde3'), metalness: 1, roughness: 0.18, emissive: new THREE.Color(spec.glow || '#000000'), emissiveIntensity: spec.glow ? 1.4 : 0 });
  const rbox = (w, h, d, r, mat) => {
    const s = new THREE.Shape();
    const x = -w / 2;
    const y = -d / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + d - r);
    s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
    s.lineTo(x + r, y + d);
    s.quadraticCurveTo(x, y + d, x, y + d - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
    const g = new THREE.ExtrudeGeometry(s, { depth: h - 0.08, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 5, curveSegments: 6 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0.04, 0);
    return new THREE.Mesh(g, mat);
  };
  const base = rbox(1.6, 0.9, 1.2, 0.12, metal);
  grp.add(base);
  const seam = rbox(1.62, 0.04, 1.22, 0.12, dark);
  seam.position.y = 0.88;
  grp.add(seam);
  const lid = rbox(1.64, 0.36, 1.24, 0.13, metal);
  lid.position.y = 0.92;
  grp.add(lid);
  // reforços nas quinas
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.3, 0.16), accent);
      c.position.set(sx * 0.76, 0.64, sz * 0.56);
      grp.add(c);
    }
  // placa frontal e trava
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.04), dark);
  plate.position.set(0, 0.55, 0.61);
  grp.add(plate);
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.24, 0.05), accent);
  lock.position.set(0, 0.86, 0.63);
  grp.add(lock);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), accent);
  gem.position.set(0, 0.55, 0.65);
  gem.scale.set(1, 1.2, 0.5);
  grp.add(gem);
  // silhueta de carro em relevo na tampa
  const cs = new THREE.Shape();
  cs.moveTo(-0.5, 0);
  cs.lineTo(0.5, 0);
  cs.quadraticCurveTo(0.56, 0.05, 0.5, 0.09);
  cs.lineTo(0.22, 0.12);
  cs.quadraticCurveTo(0.05, 0.25, -0.18, 0.22);
  cs.lineTo(-0.48, 0.12);
  cs.quadraticCurveTo(-0.56, 0.06, -0.5, 0);
  const cg = new THREE.ExtrudeGeometry(cs, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 });
  cg.rotateX(-Math.PI / 2);
  const emb = new THREE.Mesh(cg, accent);
  emb.position.set(0, 1.29, 0.12);
  grp.add(emb);
  grp.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return grp;
}
