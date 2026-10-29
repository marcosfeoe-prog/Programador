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
    const dx = Math.abs(d - da);
    if (dx < P.rA) ya = Math.max(ya, P.wr + Math.sqrt(P.rA * P.rA - dx * dx));
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
function paintMaterial(color, finish) {
  const c = new THREE.Color(color);
  const base = { color: c, vertexColors: true };
  switch (finish) {
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
  const paint = paintMaterial(spec.color || '#c0392b', spec.finish);
  const paint2 = spec.color2 ? paintMaterial(spec.color2, spec.finish2 || (spec.finish === 'matte' ? 'matte' : 'gloss')) : null;
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x05070a, metalness: 0.2, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 0.75 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x0b0c0e, metalness: 0.3, roughness: 0.45 });
  const chromeTrim = new THREE.MeshStandardMaterial({ color: 0xdfe3e8, metalness: 1, roughness: 0.08 });
  const roofMat = P.roof === 'black' ? new THREE.MeshPhysicalMaterial({ color: 0x0d0e10, metalness: 0.3, roughness: 0.25, clearcoat: 1 }) : P.roofColor ? paintMaterial(P.roofColor, 'gloss') : paint;
  const rc = RIM_COLORS[spec.rimColor || 'silver'];
  const mats = {
    tire: new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.82, metalness: 0 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf0efe8, roughness: 0.6 }),
    barrel: new THREE.MeshStandardMaterial({ color: 0x0e0f11, roughness: 0.7, side: THREE.DoubleSide }),
    disc: new THREE.MeshStandardMaterial({ color: 0x6d7076, metalness: 0.9, roughness: 0.45 }),
    caliper: new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.caliper || '#c0392b'), roughness: 0.4, metalness: 0.2 }),
    rim: new THREE.MeshStandardMaterial({ color: rc[0], metalness: rc[1], roughness: rc[2] }),
    cap: new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.badge || '#d4a017'), metalness: 0.8, roughness: 0.3 }),
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
  let bodyMat = paint;
  if (P.split && paint2) {
    // dois tons com divisa nítida: a cor é escolhida por fragmento, pela mesma curva em "C"
    const C = P.split;
    bodyMat = paint.clone();
    bodyMat.onBeforeCompile = (sh) => {
      sh.uniforms.uColor2 = { value: new THREE.Color(spec.color2) };
      sh.uniforms.uSplit = { value: new THREE.Vector4(C.bottom, C.mid, C.top, P.L / 2) };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSplitPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplitPos = position;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSplitPos;\nuniform vec3 uColor2;\nuniform vec4 uSplit;')
        .replace(
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          `float tS = clamp((vSplitPos.y - 0.12) / 0.9, 0.0, 1.0);
          float dB = tS < 0.45 ? uSplit.y - (uSplit.y - uSplit.x) * pow((0.45 - tS) / 0.45, 2.0) : uSplit.y - (uSplit.y - uSplit.z) * pow((tS - 0.45) / 0.55, 2.0);
          vec4 diffuseColor = vec4((uSplit.w - vSplitPos.x) < dB ? diffuse : uColor2, opacity);`,
        );
    };
    bodyMat.customProgramCacheKey = () => `split-${C.bottom}-${C.mid}-${C.top}-${P.L}-${spec.color2}`;
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

  // --- faróis (lights: 'none' = faróis escamoteáveis fechados)
  const hl = HEADLIGHT[P.lights] || HEADLIGHT.slim;
  if (P.lights !== 'none') {
  const hlTex = canvasTex(256, Math.round(256 * Math.min(1, P.lightH / P.lightW)), hl);
  const hlMat = new THREE.MeshStandardMaterial({ map: hlTex, emissiveMap: hlTex, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.12, metalness: 0.2, alphaTest: 0.5, transparent: false });
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
      decal({ center: new THREE.Vector3(P.L / 2 - (P.gh.bp + 0.45), P.fTop(P.gh.bp) - 0.24, 0), dir: new THREE.Vector3(0, 0, -sz), u: Xv.clone().multiplyScalar(sz), v: Yv, w: 0.55, h: 0.2, nu: 20, nv: 8 }, m);
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

  // --- linhas de porta
  {
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
    const leather = new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.interior || '#3b2a22'), roughness: 0.6 });
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
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.12, hgt + 0.03, 0.025), trim);
      st.position.set(P.L / 2 - d, y + hgt / 2 - 0.01, sz * span * 0.33);
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
    sh.lineTo(xB, P.fTop(dB) + 0.36);
    sh.lineTo(xB - 0.08, P.fTop(dB) + 0.36);
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

  // --- rodas
  for (const da of [P.fo, P.ra]) {
    const x = P.L / 2 - da;
    const hwA = (P.fHw(da) * P.W) / 2;
    for (const sz of [1, -1]) {
      const wgrp = buildWheel(P, mats);
      wgrp.position.set(x, P.wr, sz * (P.track ?? hwA - P.tw * 0.5 - 0.035));
      if (sz < 0) wgrp.rotation.y = Math.PI;
      if (da === P.fo) wgrp.rotation.y += (spec.steer ?? 0.32) * (sz > 0 ? 1 : 1);
      car.add(wgrp);
    }
  }

  car.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
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
