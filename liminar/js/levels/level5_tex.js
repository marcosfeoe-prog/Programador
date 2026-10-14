// Nível 5 — texturas procedurais do hotel: papel damasco com lambri, painéis
// de nogueira do Salão Principal, carpete ornamentado, parquet em espinha,
// tapete persa, gesso, madeira, veludo, tijolo pintado da Sala das Caldeiras
// e um atlas de detalhes (números de latão, quadros, placas, mostradores).
import * as THREE from 'three';
import { registerTexture, TEX, textCanvasTex } from '../textures.js';
import { mulberry32, clamp, hash3 } from '../util.js';

const { makeCanvas, toTex, noiseField, whiteNoise, paintRGB, normalMap, canvasHeight, wrapDraw } = TEX;

export const WALL_H = 3.6; // altura coberta pelas texturas de parede (m)
export const WALL_W = 1.3; // largura de um ladrilho de parede (m)

const sst = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const fract = (x) => x - Math.floor(x);

// Painel almofadado: devolve null fora do retângulo, senão a altura (0..1) e o
// sombreamento do chanfro (luz vinda de cima e da esquerda).
function raised(u, h, u0, u1, h0, h1, b) {
  const dl = u - u0;
  const dr = u1 - u;
  const db = h - h0;
  const dt = h1 - h;
  const d = Math.min(dl, dr, db, dt);
  if (d < 0) return null;
  if (d >= b) return { hgt: 1, sh: 1 };
  let sh;
  if (d === dt) sh = 1.28;
  else if (d === dl) sh = 1.12;
  else if (d === dr) sh = 0.84;
  else sh = 0.7;
  return { hgt: d / b, sh };
}

// Motivo de damasco (medalhão simétrico) desenhado em coordenadas unitárias.
function damaskMotif(c, cx, cy, w, h, fill, cut) {
  c.save();
  c.translate(cx, cy);
  c.scale(w, h);
  for (const sx of [1, -1]) {
    c.save();
    c.scale(sx, 1);
    c.fillStyle = fill;
    c.beginPath();
    c.moveTo(0, -0.5);
    c.bezierCurveTo(0.1, -0.4, 0.44, -0.42, 0.42, -0.16);
    c.bezierCurveTo(0.4, -0.02, 0.24, 0.0, 0.26, 0.12);
    c.bezierCurveTo(0.28, 0.26, 0.5, 0.28, 0.35, 0.42);
    c.bezierCurveTo(0.24, 0.52, 0.08, 0.44, 0, 0.5);
    c.closePath();
    c.fill();
    c.fillStyle = cut;
    c.beginPath();
    c.moveTo(0, -0.39);
    c.bezierCurveTo(0.08, -0.31, 0.32, -0.32, 0.31, -0.15);
    c.bezierCurveTo(0.3, -0.05, 0.15, -0.02, 0.17, 0.12);
    c.bezierCurveTo(0.19, 0.24, 0.36, 0.28, 0.26, 0.36);
    c.bezierCurveTo(0.17, 0.42, 0.06, 0.36, 0, 0.4);
    c.closePath();
    c.fill();
    c.fillStyle = fill;
    c.beginPath();
    c.ellipse(0.21, -0.19, 0.05, 0.075, 0.5, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(0.18, 0.27, 0.045, 0.06, -0.4, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(0.04, 0.02);
    c.quadraticCurveTo(0.16, -0.06, 0.13, 0.1);
    c.quadraticCurveTo(0.08, 0.06, 0.04, 0.02);
    c.fill();
    c.restore();
  }
  c.fillStyle = fill;
  c.beginPath();
  c.ellipse(0, -0.04, 0.07, 0.2, 0, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.moveTo(0, -0.33);
  c.lineTo(0.07, -0.22);
  c.lineTo(0, -0.12);
  c.lineTo(-0.07, -0.22);
  c.closePath();
  c.fill();
  c.fillStyle = cut;
  c.beginPath();
  c.ellipse(0, -0.04, 0.03, 0.12, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = fill;
  c.beginPath();
  c.arc(0, 0.22, 0.045, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

// Florzinha em losango entre os medalhões.
function fleur(c, cx, cy, s, fill) {
  c.fillStyle = fill;
  c.beginPath();
  c.moveTo(cx, cy - s);
  c.quadraticCurveTo(cx + s * 0.25, cy - s * 0.25, cx + s * 0.7, cy);
  c.quadraticCurveTo(cx + s * 0.25, cy + s * 0.25, cx, cy + s);
  c.quadraticCurveTo(cx - s * 0.25, cy + s * 0.25, cx - s * 0.7, cy);
  c.quadraticCurveTo(cx - s * 0.25, cy - s * 0.25, cx, cy - s);
  c.fill();
}

// ------------------------------------------------------------------ atlas
// Grade 8×8. Linha 0 no topo da imagem.
export const ATL = {
  N: 8,
  rect(col, row, w = 1, h = 1) {
    const n = 8;
    return [col / n, 1 - (row + h) / n, (col + w) / n, 1 - row / n];
  },
  center(col, row) {
    return [(col + 0.5) / 8, 1 - (row + 0.5) / 8];
  },
  digit(d) {
    return d < 8 ? [d, 0] : [d - 8, 1];
  },
  BRASS: [2, 1],
  GOLD: [3, 1],
  IRON: [4, 1],
  RED: [5, 1],
  ENAMEL: [6, 1],
  GREEN: [7, 1],
  PAINT: [
    [0, 2],
    [2, 2],
    [4, 2],
    [6, 2],
    [0, 4],
    [2, 4],
    [4, 4],
    [6, 4],
  ],
  SIGN_DESK: [0, 6],
  SIGN_BOIL: [4, 6],
  GAUGE: [0, 7],
  DND: [1, 7],
  FOB: [2, 7],
  STAFF: [3, 7],
  GRILLE: [4, 7],
  DIAL: [5, 7],
  MIRROR: [6, 7],
  CLOCK: [7, 7],
};

function drawAtlas(A) {
  const cv = makeCanvas(A, A);
  const c = cv.getContext('2d');
  const orm = makeCanvas(A, A);
  const o = orm.getContext('2d');
  const s = A / 8;
  const rnd = mulberry32(5501);
  // propriedades do material: G = rugosidade, B = metal
  const prop = (col, row, w, h, rough, metal) => {
    o.fillStyle = `rgb(255,${Math.round(rough * 255)},${Math.round(metal * 255)})`;
    o.fillRect(col * s, row * s, w * s, h * s);
  };
  const brassGrad = (x, y, w, h) => {
    const g = c.createLinearGradient(x, y, x + w * 0.3, y + h);
    g.addColorStop(0, '#d8b45e');
    g.addColorStop(0.5, '#a9802f');
    g.addColorStop(1, '#7a5a1e');
    return g;
  };
  c.fillStyle = '#202020';
  c.fillRect(0, 0, A, A);
  prop(0, 0, 8, 8, 0.6, 0);
  // dígitos gravados em latão
  for (let d = 0; d < 10; d++) {
    const [col, row] = ATL.digit(d);
    const x = col * s;
    const y = row * s;
    c.fillStyle = brassGrad(x, y, s, s);
    c.fillRect(x, y, s, s);
    c.fillStyle = '#2a1c08';
    c.font = `bold ${Math.round(s * 0.86)}px Georgia, "Times New Roman", serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(d), x + s / 2, y + s * 0.54);
    prop(col, row, 1, 1, 0.38, 0.55);
  }
  // cores lisas
  const flat = (cell, top, bot, rough, metal) => {
    const [col, row] = cell;
    const g = c.createLinearGradient(0, row * s, 0, row * s + s);
    g.addColorStop(0, top);
    g.addColorStop(1, bot);
    c.fillStyle = g;
    c.fillRect(col * s, row * s, s, s);
    prop(col, row, 1, 1, rough, metal);
  };
  flat(ATL.BRASS, '#c9a24c', '#a07c31', 0.32, 0.6);
  flat(ATL.GOLD, '#e2bd62', '#b8913e', 0.28, 0.65);
  flat(ATL.IRON, '#3a3b3d', '#2c2d2f', 0.5, 0.45);
  flat(ATL.RED, '#a3221c', '#8e1a15', 0.42, 0.05);
  flat(ATL.ENAMEL, '#efeadc', '#e2dccb', 0.25, 0);
  flat(ATL.GREEN, '#2f7a46', '#1d5a31', 0.12, 0.1);
  // quadros a óleo (paisagens, retratos, natureza-morta)
  const P = ATL.PAINT;
  for (let k = 0; k < P.length; k++) {
    const x = P[k][0] * s;
    const y = P[k][1] * s;
    const w = s * 2;
    const h = s * 2;
    c.save();
    c.beginPath();
    c.rect(x, y, w, h);
    c.clip();
    paintPicture(c, x, y, w, h, k, rnd);
    c.restore();
    prop(P[k][0], P[k][1], 2, 2, 0.55, 0);
  }
  // placa RECEPÇÃO em latão
  {
    const [col, row] = ATL.SIGN_DESK;
    const x = col * s;
    const y = row * s;
    c.fillStyle = brassGrad(x, y, s * 4, s);
    c.fillRect(x, y, s * 4, s);
    c.strokeStyle = '#5a400f';
    c.lineWidth = s * 0.05;
    c.strokeRect(x + s * 0.08, y + s * 0.1, s * 3.84, s * 0.8);
    c.fillStyle = '#2a1c08';
    c.font = `bold ${Math.round(s * 0.5)}px Georgia, serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('RECEPÇÃO', x + s * 2, y + s * 0.53);
    prop(col, row, 4, 1, 0.35, 0.55);
  }
  // placa esmaltada CALDEIRAS
  {
    const [col, row] = ATL.SIGN_BOIL;
    const x = col * s;
    const y = row * s;
    c.fillStyle = '#e9e1c8';
    c.fillRect(x, y, s * 4, s);
    c.fillStyle = '#8e1a15';
    c.fillRect(x + s * 0.06, y + s * 0.06, s * 3.88, s * 0.88);
    c.fillStyle = '#efe6cc';
    c.font = `bold ${Math.round(s * 0.42)}px Arial, Helvetica, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('SALA DAS CALDEIRAS', x + s * 2, y + s * 0.4);
    c.font = `bold ${Math.round(s * 0.2)}px Arial, Helvetica, sans-serif`;
    c.fillText('PERIGO · ALTA PRESSÃO', x + s * 2, y + s * 0.76);
    prop(col, row, 4, 1, 0.3, 0);
  }
  // manômetro
  {
    const [col, row] = ATL.GAUGE;
    const cx = col * s + s / 2;
    const cy = row * s + s / 2;
    c.fillStyle = '#3a3b3d';
    c.fillRect(col * s, row * s, s, s);
    c.fillStyle = '#b08a3a';
    c.beginPath();
    c.arc(cx, cy, s * 0.49, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#f1ead6';
    c.beginPath();
    c.arc(cx, cy, s * 0.42, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#a3221c';
    c.lineWidth = s * 0.05;
    c.beginPath();
    c.arc(cx, cy, s * 0.34, -0.2, 0.75);
    c.stroke();
    c.strokeStyle = '#1b1b1b';
    c.lineWidth = Math.max(1, s * 0.015);
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * s * 0.3, cy + Math.sin(a) * s * 0.3);
      c.lineTo(cx + Math.cos(a) * s * 0.38, cy + Math.sin(a) * s * 0.38);
      c.stroke();
    }
    c.lineWidth = Math.max(1.5, s * 0.03);
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(cx + Math.cos(0.35) * s * 0.33, cy + Math.sin(0.35) * s * 0.33);
    c.stroke();
    prop(col, row, 1, 1, 0.2, 0.2);
  }
  // cartão NÃO PERTURBE
  {
    const [col, row] = ATL.DND;
    const x = col * s;
    const y = row * s;
    c.fillStyle = '#e8dcc0';
    c.fillRect(x, y, s, s);
    c.fillStyle = '#7a1a1c';
    c.fillRect(x + s * 0.06, y + s * 0.34, s * 0.88, s * 0.6);
    c.fillStyle = '#2a2420';
    c.beginPath();
    c.arc(x + s / 2, y + s * 0.17, s * 0.1, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#f1e6c8';
    c.font = `bold ${Math.round(s * 0.15)}px Georgia, serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('NÃO', x + s / 2, y + s * 0.52);
    c.fillText('PERTURBE', x + s / 2, y + s * 0.72);
    prop(col, row, 1, 1, 0.85, 0);
  }
  // chaveiro (ficha de latão)
  {
    const [col, row] = ATL.FOB;
    const x = col * s;
    const y = row * s;
    c.fillStyle = '#5a3a1a';
    c.fillRect(x, y, s, s);
    c.fillStyle = brassGrad(x, y, s, s);
    c.beginPath();
    c.ellipse(x + s / 2, y + s / 2, s * 0.46, s * 0.3, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#5a400f';
    c.lineWidth = s * 0.03;
    c.stroke();
    prop(col, row, 1, 1, 0.35, 0.55);
  }
  // placa SOMENTE FUNCIONÁRIOS
  {
    const [col, row] = ATL.STAFF;
    const x = col * s;
    const y = row * s;
    c.fillStyle = '#d8ccb0';
    c.fillRect(x, y, s, s);
    c.fillStyle = '#1f1c18';
    c.font = `bold ${Math.round(s * 0.16)}px Arial, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('SOMENTE', x + s / 2, y + s * 0.38);
    c.fillText('FUNCIONÁRIOS', x + s / 2, y + s * 0.6);
    prop(col, row, 1, 1, 0.4, 0);
  }
  // grade de alto-falante art déco
  {
    const [col, row] = ATL.GRILLE;
    const x = col * s;
    const y = row * s;
    c.fillStyle = '#2a1a10';
    c.fillRect(x, y, s, s);
    c.fillStyle = brassGrad(x, y, s, s);
    c.beginPath();
    c.arc(x + s / 2, y + s / 2, s * 0.44, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#1a120a';
    for (let i = 0; i < 9; i++) {
      const yy = y + s * 0.18 + i * s * 0.07;
      const hw = Math.sqrt(Math.max(0, 0.4 * 0.4 - Math.pow((yy - y - s / 2) / s, 2))) * s * 0.9;
      c.fillRect(x + s / 2 - hw, yy, hw * 2, s * 0.035);
    }
    prop(col, row, 1, 1, 0.4, 0.5);
  }
  // mostrador do elevador (meia-lua com ponteiro)
  {
    const [col, row] = ATL.DIAL;
    const x = col * s;
    const y = row * s;
    c.fillStyle = brassGrad(x, y, s, s);
    c.fillRect(x, y, s, s);
    c.fillStyle = '#efe6cc';
    c.beginPath();
    c.arc(x + s / 2, y + s * 0.8, s * 0.42, Math.PI, 0);
    c.fill();
    c.fillStyle = '#2a1c08';
    c.font = `bold ${Math.round(s * 0.1)}px Georgia, serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + (i / 6) * Math.PI;
      c.fillText(i === 0 ? 'T' : String(i), x + s / 2 + Math.cos(a) * s * 0.33, y + s * 0.8 + Math.sin(a) * s * 0.33);
    }
    c.strokeStyle = '#2a1c08';
    c.lineWidth = Math.max(1.5, s * 0.025);
    c.beginPath();
    c.moveTo(x + s / 2, y + s * 0.8);
    c.lineTo(x + s / 2 + Math.cos(-1.1) * s * 0.3, y + s * 0.8 + Math.sin(-1.1) * s * 0.3);
    c.stroke();
    prop(col, row, 1, 1, 0.35, 0.5);
  }
  // espelho envelhecido
  {
    const [col, row] = ATL.MIRROR;
    const x = col * s;
    const y = row * s;
    const g = c.createLinearGradient(x, y, x + s, y + s);
    g.addColorStop(0, '#8d8f88');
    g.addColorStop(0.45, '#5c5f5a');
    g.addColorStop(0.55, '#777a73');
    g.addColorStop(1, '#3f413d');
    c.fillStyle = g;
    c.fillRect(x, y, s, s);
    for (let i = 0; i < 30; i++) {
      c.fillStyle = `rgba(40,36,28,${0.05 + rnd() * 0.12})`;
      c.beginPath();
      c.arc(x + rnd() * s, y + (rnd() < 0.5 ? rnd() * 0.15 : 1 - rnd() * 0.15) * s, rnd() * s * 0.05, 0, Math.PI * 2);
      c.fill();
    }
    prop(col, row, 1, 1, 0.08, 0.85);
  }
  // relógio de parede
  {
    const [col, row] = ATL.CLOCK;
    const cx = col * s + s / 2;
    const cy = row * s + s / 2;
    c.fillStyle = '#3a2416';
    c.fillRect(col * s, row * s, s, s);
    c.fillStyle = '#b08a3a';
    c.beginPath();
    c.arc(cx, cy, s * 0.48, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#f0e8d2';
    c.beginPath();
    c.arc(cx, cy, s * 0.42, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#1b1b1b';
    c.font = `${Math.round(s * 0.1)}px Georgia, serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const rom = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      c.fillText(rom[i], cx + Math.cos(a) * s * 0.33, cy + Math.sin(a) * s * 0.33);
    }
    c.strokeStyle = '#111';
    c.lineWidth = Math.max(1.5, s * 0.03);
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(cx + Math.cos(-2.2) * s * 0.2, cy + Math.sin(-2.2) * s * 0.2);
    c.moveTo(cx, cy);
    c.lineTo(cx + Math.cos(-0.5) * s * 0.3, cy + Math.sin(-0.5) * s * 0.3);
    c.stroke();
    prop(col, row, 1, 1, 0.25, 0);
  }
  return { map: toTex(cv), orm: toTex(orm, { srgb: false }) };
}

// Pintura a óleo procedural: céu, relevo e verniz escurecido.
function paintPicture(c, x, y, w, h, k, rnd) {
  const kind = k % 4;
  if (k < 4) {
    // paisagens
    const skies = [
      ['#2b2f3a', '#6b5a48', '#c08a4a'],
      ['#1d2a2c', '#4a5a50', '#9a8f6a'],
      ['#3a2a2a', '#8a5a3a', '#d8a050'],
      ['#22262e', '#545a60', '#8a8478'],
    ];
    const sk = skies[kind];
    const g = c.createLinearGradient(0, y, 0, y + h * 0.65);
    g.addColorStop(0, sk[0]);
    g.addColorStop(0.6, sk[1]);
    g.addColorStop(1, sk[2]);
    c.fillStyle = g;
    c.fillRect(x, y, w, h);
    // sol ou lua velado
    const sx = x + w * (0.3 + rnd() * 0.4);
    const sy = y + h * (0.35 + rnd() * 0.15);
    const sg = c.createRadialGradient(sx, sy, 0, sx, sy, w * 0.25);
    sg.addColorStop(0, 'rgba(255,220,160,0.55)');
    sg.addColorStop(1, 'rgba(255,220,160,0)');
    c.fillStyle = sg;
    c.fillRect(x, y, w, h);
    // camadas de colinas / mar
    const layers = kind === 0 ? 2 : 3;
    for (let l = 0; l < layers; l++) {
      const base = y + h * (0.55 + l * 0.14);
      const col = ['#3a3428', '#2a2a20', '#1a1a14'][l];
      c.fillStyle = kind === 0 && l === 0 ? '#34404a' : col;
      c.beginPath();
      c.moveTo(x, y + h);
      const ph = rnd() * 10;
      for (let i = 0; i <= 24; i++) {
        const xx = x + (i / 24) * w;
        const yy = base - Math.sin(i * 0.5 + ph) * h * 0.04 - Math.sin(i * 1.3 + ph * 2) * h * 0.02 * (kind === 0 && l === 0 ? 0.2 : 1);
        c.lineTo(xx, yy);
      }
      c.lineTo(x + w, y + h);
      c.closePath();
      c.fill();
    }
    // árvores escuras
    if (kind !== 0) {
      for (let i = 0; i < 4; i++) {
        const tx = x + w * (0.1 + rnd() * 0.8);
        const ty = y + h * (0.72 + rnd() * 0.1);
        c.fillStyle = '#141410';
        c.beginPath();
        c.ellipse(tx, ty - h * 0.08, w * 0.04, h * 0.1, 0, 0, Math.PI * 2);
        c.fill();
      }
    }
  } else if (kind === 0 || kind === 1) {
    // retratos sobre fundo escuro
    const g = c.createRadialGradient(x + w * 0.5, y + h * 0.4, 0, x + w * 0.5, y + h * 0.5, w * 0.7);
    g.addColorStop(0, kind ? '#4a3a2a' : '#3a3428');
    g.addColorStop(1, '#120e0a');
    c.fillStyle = g;
    c.fillRect(x, y, w, h);
    c.fillStyle = kind ? '#1a1418' : '#16120e';
    c.beginPath();
    c.ellipse(x + w * 0.5, y + h * 1.0, w * 0.42, h * 0.38, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = kind ? '#2a1c14' : '#0e0c0a';
    c.beginPath();
    c.ellipse(x + w * 0.5, y + h * 0.4, w * 0.17, h * 0.22, 0, 0, Math.PI * 2);
    c.fill();
    const fg = c.createRadialGradient(x + w * 0.46, y + h * 0.44, 0, x + w * 0.5, y + h * 0.46, w * 0.15);
    fg.addColorStop(0, '#c8a88a');
    fg.addColorStop(1, '#6a5040');
    c.fillStyle = fg;
    c.beginPath();
    c.ellipse(x + w * 0.5, y + h * 0.46, w * 0.12, h * 0.16, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(30,20,14,0.6)';
    c.fillRect(x + w * 0.43, y + h * 0.43, w * 0.04, h * 0.02);
    c.fillRect(x + w * 0.53, y + h * 0.43, w * 0.04, h * 0.02);
    if (!kind) {
      c.fillStyle = '#d8d0c0';
      c.beginPath();
      c.moveTo(x + w * 0.44, y + h * 0.62);
      c.lineTo(x + w * 0.56, y + h * 0.62);
      c.lineTo(x + w * 0.5, y + h * 0.75);
      c.fill();
    }
  } else if (kind === 2) {
    // natureza-morta: vaso com flores
    c.fillStyle = '#1c1610';
    c.fillRect(x, y, w, h);
    c.fillStyle = '#3a2a1a';
    c.fillRect(x, y + h * 0.72, w, h * 0.28);
    c.fillStyle = '#5a4a3a';
    c.beginPath();
    c.ellipse(x + w * 0.5, y + h * 0.62, w * 0.12, h * 0.14, 0, 0, Math.PI * 2);
    c.fill();
    const cols = ['#a8302a', '#d8c0a0', '#c87a30', '#8a2030'];
    for (let i = 0; i < 14; i++) {
      c.fillStyle = cols[i % 4];
      c.beginPath();
      c.arc(x + w * (0.3 + rnd() * 0.4), y + h * (0.22 + rnd() * 0.25), w * (0.03 + rnd() * 0.04), 0, Math.PI * 2);
      c.fill();
    }
  } else {
    // veleiro em mar escuro
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#2a3038');
    g.addColorStop(0.55, '#6a6a5a');
    g.addColorStop(0.56, '#2a3a40');
    g.addColorStop(1, '#141c20');
    c.fillStyle = g;
    c.fillRect(x, y, w, h);
    c.fillStyle = '#1a1612';
    c.beginPath();
    c.moveTo(x + w * 0.3, y + h * 0.6);
    c.lineTo(x + w * 0.7, y + h * 0.6);
    c.lineTo(x + w * 0.64, y + h * 0.66);
    c.lineTo(x + w * 0.36, y + h * 0.66);
    c.fill();
    c.fillStyle = '#c8bca0';
    c.beginPath();
    c.moveTo(x + w * 0.5, y + h * 0.2);
    c.lineTo(x + w * 0.5, y + h * 0.58);
    c.lineTo(x + w * 0.34, y + h * 0.58);
    c.fill();
    c.beginPath();
    c.moveTo(x + w * 0.52, y + h * 0.26);
    c.lineTo(x + w * 0.52, y + h * 0.58);
    c.lineTo(x + w * 0.66, y + h * 0.58);
    c.fill();
  }
  // pinceladas, verniz amarelado e craquelado
  for (let i = 0; i < 160; i++) {
    c.fillStyle = `rgba(${rnd() < 0.5 ? '255,240,200' : '0,0,0'},${rnd() * 0.05})`;
    c.fillRect(x + rnd() * w, y + rnd() * h, w * (0.02 + rnd() * 0.06), h * 0.006 + 1);
  }
  const v = c.createRadialGradient(x + w / 2, y + h / 2, w * 0.2, x + w / 2, y + h / 2, w * 0.75);
  v.addColorStop(0, 'rgba(60,40,10,0.05)');
  v.addColorStop(1, 'rgba(20,12,4,0.55)');
  c.fillStyle = v;
  c.fillRect(x, y, w, h);
  c.strokeStyle = 'rgba(10,8,4,0.18)';
  c.lineWidth = 1;
  for (let i = 0; i < 18; i++) {
    c.beginPath();
    let px = x + rnd() * w;
    let py = y + rnd() * h;
    c.moveTo(px, py);
    for (let j = 0; j < 5; j++) {
      px += (rnd() - 0.5) * w * 0.1;
      py += (rnd() - 0.5) * h * 0.1;
      c.lineTo(px, py);
    }
    c.stroke();
  }
}

// ------------------------------------------------------------------ geradores
let registered = false;

export function initL5Textures() {
  if (registered) return;
  registered = true;

  // Corredores: papel damasco bordô sobre lambri de mogno, guarda-cadeira e
  // friso de gesso. Ladrilho de 1,3 m × altura total (3,6 m); v = 0 no piso.
  registerTexture('l5Damask', (S) => {
    const W = Math.max(64, S / 2);
    const H = Math.round(W * (WALL_H / WALL_W));
    const py = (h) => (1 - h / WALL_H) * H;
    // máscara do motivo
    const mask = makeCanvas(W, H);
    const mc = mask.getContext('2d');
    mc.fillStyle = '#000';
    mc.fillRect(0, 0, W, H);
    mc.save();
    mc.beginPath();
    mc.rect(0, py(3.36), W, py(1.03) - py(3.36));
    mc.clip();
    const mw = W * 0.36;
    const mh = mw * 1.5;
    const dy = mh * 0.56;
    let row = 0;
    for (let yy = py(3.36) + mh * 0.3; yy < py(1.03) + mh; yy += dy, row++) {
      const xs = row % 2 ? [0, W / 2] : [W / 4, (3 * W) / 4];
      for (const xx of xs) {
        wrapDraw(W, 0, xx, yy, (ax) => damaskMotif(mc, ax, yy, mw, mh, '#fff', '#000'));
        wrapDraw(W, 0, xx + W / 4, yy, (ax) => fleur(mc, ax, yy, W * 0.035, '#fff'));
      }
    }
    mc.restore();
    const m = canvasHeight(mask);
    const gh = noiseField(W, H, 3, 120, 3, 501);
    const low = noiseField(W, H, 3, 8, 4, 502);
    const fib = whiteNoise(W * H, 503);
    const hf = new Float32Array(W * H);
    const cv = paintRGB(W, H, (x, y, i, o) => {
      const u = (x / W) * WALL_W;
      const h = (1 - y / H) * WALL_H;
      let r;
      let g;
      let b;
      let ht = 0;
      if (h < 1.03) {
        let k = 0.86 + gh[i] * 0.2 + fib[i] * 0.03;
        if (h < 0.14) {
          k *= h > 0.125 ? 1.25 : 0.72;
          ht = h > 0.125 ? 0.5 : 0.35;
        } else if (h > 0.95) {
          const t = Math.sin(((h - 0.95) / 0.08) * Math.PI);
          k *= 0.9 + t * 0.45;
          ht = 0.5 + t * 0.4;
        } else {
          const p = raised(u, h, 0.11, 1.19, 0.25, 0.86, 0.035);
          const groove = raised(u, h, 0.08, 1.22, 0.22, 0.89, 0.012);
          if (p) {
            k *= p.sh;
            ht = 0.3 + p.hgt * 0.25;
          } else if (groove && groove.hgt < 1) {
            k *= 0.62;
            ht = 0.18;
          } else ht = 0.3;
        }
        r = 0.27 * k;
        g = 0.13 * k;
        b = 0.07 * k;
      } else if (h > 3.36) {
        const k = 0.95 + low[i] * 0.04 + fib[i] * 0.015;
        const line = Math.abs(h - 3.39) < 0.008 || Math.abs(h - 3.55) < 0.006;
        r = (line ? 0.55 : 0.8) * k;
        g = (line ? 0.42 : 0.74) * k;
        b = (line ? 0.22 : 0.6) * k;
        ht = line ? 0.2 : 0.5;
      } else {
        const mm = m[i];
        const k = 1 + low[i] * 0.05 + fib[i] * 0.025;
        const sheen = 1 + fib[i] * 0.04 * mm;
        r = (0.31 + mm * 0.17) * k * sheen;
        g = (0.07 + mm * 0.08) * k * sheen;
        b = (0.08 + mm * 0.035) * k * sheen;
        ht = mm * 0.35 + fib[i] * 0.04;
      }
      o[0] = r;
      o[1] = g;
      o[2] = b;
      hf[i] = ht;
    });
    return { map: toTex(cv), normalMap: normalMap(hf, W, H, 2.2) };
  });

  // Salão Principal: lambris de nogueira do piso ao teto.
  registerTexture('l5Panel', (S) => {
    const W = Math.max(64, S / 2);
    const H = Math.round(W * (WALL_H / WALL_W));
    const gv = noiseField(W, H, 80, 3, 3, 511); // veio vertical
    const gx = noiseField(W, H, 3, 160, 3, 512); // veio horizontal
    const low = noiseField(W, H, 2, 6, 3, 513);
    const fib = whiteNoise(W * H, 514);
    const hf = new Float32Array(W * H);
    const cv = paintRGB(W, H, (x, y, i, o) => {
      const u = (x / W) * WALL_W;
      const h = (1 - y / H) * WALL_H;
      let k = 0.9 + low[i] * 0.08 + fib[i] * 0.025;
      let ht = 0.3;
      let horiz = false;
      if (h < 0.16) {
        k *= h > 0.145 ? 1.2 : 0.65;
        ht = 0.4;
        horiz = true;
      } else if (h < 0.95) {
        const p = raised(u, h, 0.12, 1.18, 0.27, 0.84, 0.04);
        if (p) {
          k *= p.sh;
          ht = 0.3 + p.hgt * 0.3;
        } else horiz = h < 0.27 || h > 0.84;
      } else if (h < 1.08) {
        const t = Math.sin(((h - 0.95) / 0.13) * Math.PI);
        k *= 0.85 + t * 0.4;
        ht = 0.5 + t * 0.4;
        horiz = true;
      } else if (h < 3.0) {
        const p = raised(u, h, 0.14, 1.16, 1.2, 2.86, 0.045);
        const inner = raised(u, h, 0.24, 1.06, 1.32, 2.74, 0.01);
        if (p) {
          k *= p.sh;
          ht = 0.3 + p.hgt * 0.3;
          if (inner && inner.hgt < 1) {
            k *= inner.sh * 0.9;
            ht -= 0.1;
          }
        } else horiz = h < 1.2 || h > 2.86;
      } else if (h < 3.12) {
        horiz = true;
        k *= 0.9;
      } else if (h < 3.42) {
        // friso com dentículos
        const d = fract(u / 0.065);
        const den = h > 3.2 && h < 3.32;
        if (den) {
          k *= d < 0.6 ? 1.1 : 0.55;
          ht = d < 0.6 ? 0.7 : 0.2;
        } else k *= 0.95;
        horiz = true;
      } else {
        const t = (h - 3.42) / 0.18;
        k *= 0.9 + Math.sin(t * Math.PI * 2) * 0.2;
        ht = 0.6;
        horiz = true;
      }
      const grain = horiz ? gx[i] : gv[i];
      k *= 0.88 + grain * 0.25;
      o[0] = 0.3 * k;
      o[1] = 0.165 * k;
      o[2] = 0.085 * k;
      hf[i] = ht + grain * 0.03;
    });
    return { map: toTex(cv), normalMap: normalMap(hf, W, H, 2.4) };
  });

  // Carpete ornamentado dos corredores (ladrilho de 1,3 m): treliça dourada em
  // losangos sobre vermelho, rosetas verdes nos nós e flores marfim.
  registerTexture('l5Carpet', (S) => {
    const low = noiseField(S, S, 3, 3, 4, 521);
    const fib = whiteNoise(S * S, 522);
    const fib2 = noiseField(S, S, S / 4, S / 4, 1, 523);
    const hf = new Float32Array(S * S);
    const cv = paintRGB(S, S, (x, y, i, o) => {
      const nu = (x / S) * 4;
      const nv = (y / S) * 4;
      let r = 0.36;
      let g = 0.065;
      let b = 0.06;
      let ht = 0.5;
      // linhas da treliça
      const p = nu + nv;
      const q = nu - nv;
      const dl = Math.min(Math.abs(p - Math.round(p)), Math.abs(q - Math.round(q))) / Math.SQRT2;
      if (dl < 0.045) {
        if (dl < 0.028) {
          r = 0.6;
          g = 0.42;
          b = 0.16;
          ht = 0.7;
        } else {
          r = 0.12;
          g = 0.04;
          b = 0.03;
          ht = 0.3;
        }
      }
      // roseta nos nós
      const ax = Math.round(nu);
      const ay = Math.round(nv);
      const bx = Math.floor(nu) + 0.5;
      const by = Math.floor(nv) + 0.5;
      const da = Math.hypot(nu - ax, nv - ay);
      const db = Math.hypot(nu - bx, nv - by);
      const [cx, cy, dn] = da < db ? [ax, ay, da] : [bx, by, db];
      const th = Math.atan2(nv - cy, nu - cx);
      const rr = 0.15 * (1 + 0.22 * Math.cos(th * 8));
      if (dn < rr + 0.025) {
        if (dn < 0.045) {
          r = 0.66;
          g = 0.48;
          b = 0.18;
        } else if (dn < rr - 0.012) {
          r = 0.07;
          g = 0.2;
          b = 0.13;
        } else if (dn < rr + 0.012) {
          r = 0.62;
          g = 0.45;
          b = 0.17;
        } else {
          r = 0.1;
          g = 0.03;
          b = 0.03;
        }
        ht = 0.6;
      }
      // flor no centro dos losangos
      const fx = Math.abs(nu - Math.round(nu)) < 0.25 ? Math.round(nu) : Math.floor(nu) + 0.5;
      const fy = fx === Math.round(nu) ? Math.floor(nv) + 0.5 : Math.round(nv);
      const df = Math.hypot(nu - fx, nv - fy);
      const tf = Math.atan2(nv - fy, nu - fx);
      if (df < 0.09 * (0.55 + 0.45 * Math.abs(Math.cos(tf * 2)))) {
        r = 0.72;
        g = 0.64;
        b = 0.46;
        ht = 0.65;
      }
      const f = fib[i] * 0.6 + fib2[i] * 0.4;
      const k = 1 + low[i] * 0.06 + f * 0.12;
      o[0] = r * k;
      o[1] = g * k;
      o[2] = b * k;
      hf[i] = ht * 0.4 + f * 0.5;
    });
    return { map: toTex(cv), normalMap: normalMap(hf, S, S, 2.2) };
  });

  // Parquet em espinha (chevron) de carvalho envernizado (ladrilho de 1,3 m).
  registerTexture('l5Parquet', (S) => {
    const fine = whiteNoise(S * S, 531);
    const low = noiseField(S, S, 3, 3, 3, 532);
    const hf = new Float32Array(S * S);
    const rough = new Float32Array(S * S);
    const cols = 4;
    const planks = 16;
    const cv = paintRGB(S, S, (x, y, i, o) => {
      const u = x / S;
      const v = y / S;
      const ci = Math.floor(u * cols);
      const xl = u * cols - ci; // 0..1 dentro da coluna
      const sgn = ci % 2 === 0 ? 1 : -1;
      const s = v * planks + (sgn > 0 ? xl : 1 - xl) * (planks / cols);
      const j = Math.floor(s);
      const fs = s - j;
      const gap = fs < 0.05 || xl < 0.012 || xl > 0.988;
      const pid = ((j % planks) + planks) % planks;
      const tone = 0.82 + hash3(ci, pid, 77) * 0.3;
      const along = (sgn > 0 ? xl : 1 - xl) - (v * planks - Math.floor(v * planks));
      const grain = Math.sin(along * 40 + hash3(ci, pid, 78) * 30 + Math.sin(fs * 9) * 0.6) * 0.5 + 0.5;
      let k = tone * (0.9 + grain * 0.12 + fine[i] * 0.03 + low[i] * 0.05);
      if (gap) k *= 0.35;
      o[0] = 0.4 * k;
      o[1] = 0.23 * k;
      o[2] = 0.11 * k;
      hf[i] = gap ? 0 : 0.6 + grain * 0.05;
      rough[i] = gap ? 0.9 : 0.32 + low[i] * 0.08 + grain * 0.06;
    });
    const rcv = paintRGB(S, S, (x, y, i, o) => {
      o[0] = o[1] = o[2] = rough[i];
    });
    return { map: toTex(cv), normalMap: normalMap(hf, S, S, 1.6), roughnessMap: toTex(rcv, { srgb: false }) };
  });

  // Tapete persa (5 × 3,3 m), não repete.
  registerTexture('l5Rug', (S) => {
    const W = S;
    const H = Math.round(S * 0.66);
    const RW = 5;
    const RH = 3.3;
    const low = noiseField(W, H, 4, 3, 3, 541);
    const abr = noiseField(W, H, 1, 12, 2, 542); // abrash (faixas de tingimento)
    const fib = whiteNoise(W * H, 543);
    const hf = new Float32Array(W * H);
    const cv = paintRGB(W, H, (x, y, i, o) => {
      const mx = ((x + 0.5) / W) * RW;
      const my = ((y + 0.5) / H) * RH;
      const d = Math.min(mx, RW - mx, my, RH - my);
      let c;
      if (mx < 0.07 || mx > RW - 0.07) {
        // franja
        const th = fract(my / 0.012) < 0.6;
        c = th ? [0.78, 0.72, 0.58] : [0.3, 0.26, 0.2];
      } else if (d < 0.11) c = d < 0.09 && d > 0.075 ? [0.08, 0.08, 0.12] : [0.74, 0.66, 0.5];
      else if (d < 0.15) c = [0.5, 0.08, 0.07];
      else if (d < 0.45) {
        // barra principal: fundo azul-marinho com rosetas e gavinha dourada
        const along = my < 0.45 || my > RH - 0.45 ? mx : my;
        const across = (d - 0.15) / 0.3;
        const ph = fract(along / 0.32);
        const vine = Math.abs(across - 0.5 - Math.sin(along * 19.6) * 0.28) < 0.06;
        const rd = Math.hypot((ph - 0.5) * 0.32, (across - 0.5) * 0.3);
        if (rd < 0.06) c = rd < 0.025 ? [0.75, 0.58, 0.25] : [0.55, 0.1, 0.08];
        else if (vine) c = [0.66, 0.5, 0.22];
        else c = [0.09, 0.11, 0.2];
      } else if (d < 0.5) c = d < 0.475 ? [0.74, 0.66, 0.5] : [0.5, 0.08, 0.07];
      else {
        // campo vermelho com medalhão central e cantoneiras
        const ex = (mx - RW / 2) / 1.15;
        const ey = (my - RH / 2) / 0.78;
        const e = Math.hypot(ex, ey);
        const th = Math.atan2(ey, ex);
        const lob = e * (1 - 0.09 * Math.cos(th * 16));
        c = [0.5, 0.075, 0.065];
        // motivos pequenos no campo
        const gu = fract(mx / 0.26 + (Math.floor(my / 0.26) % 2) * 0.5);
        const gv = fract(my / 0.26);
        const sm = Math.hypot(gu - 0.5, gv - 0.5);
        if (sm < 0.12) c = sm < 0.05 ? [0.75, 0.68, 0.52] : [0.1, 0.13, 0.22];
        if (lob < 0.62) {
          if (lob < 0.12) c = [0.75, 0.6, 0.28];
          else if (lob < 0.2) c = [0.5, 0.08, 0.07];
          else if (lob < 0.27) c = [0.74, 0.66, 0.5];
          else if (lob < 0.55) c = Math.abs(Math.sin(th * 8)) < 0.18 ? [0.62, 0.48, 0.22] : [0.08, 0.1, 0.19];
          else c = [0.66, 0.5, 0.22];
        }
        // pingentes do medalhão
        const pd = Math.abs(my - RH / 2) / 0.12 + Math.abs(Math.abs(mx - RW / 2) - 1.45) / 0.22;
        if (pd < 1) c = pd < 0.45 ? [0.74, 0.66, 0.5] : [0.08, 0.1, 0.19];
        // cantoneiras
        const cx = Math.min(mx - 0.5, RW - 0.5 - mx);
        const cy = Math.min(my - 0.5, RH - 0.5 - my);
        const cq = Math.hypot(cx / 0.9, cy / 0.6);
        if (cq < 1) c = cq > 0.9 ? [0.66, 0.5, 0.22] : [0.09, 0.11, 0.2];
      }
      const k = (1 + low[i] * 0.05 + fib[i] * 0.06) * (1 + abr[i] * 0.06);
      o[0] = c[0] * k;
      o[1] = c[1] * k;
      o[2] = c[2] * k;
      hf[i] = fib[i] * 0.5 + (d < 0.15 ? 0.2 : 0);
    });
    const t = toTex(cv, { repeat: false });
    return { map: t, normalMap: normalMap(hf, W, H, 1.6) };
  });

  // Gesso creme do teto (ladrilho de 2,6 m).
  registerTexture('l5Plaster', (S) => {
    const W = Math.max(64, S / 2);
    const low = noiseField(W, W, 4, 4, 4, 551);
    const fine = whiteNoise(W * W, 552);
    const cv = paintRGB(W, W, (x, y, i, o) => {
      const k = 0.96 + low[i] * 0.04 + fine[i] * 0.015;
      o[0] = 0.86 * k;
      o[1] = 0.8 * k;
      o[2] = 0.68 * k;
    });
    return { map: toTex(cv) };
  });

  // Madeira neutra (multiplicada pela cor de vértice).
  registerTexture('l5Wood', (S) => {
    const W = Math.max(64, S / 2);
    const g = noiseField(W, W, 2, 40, 3, 561);
    const g2 = noiseField(W, W, 1, 90, 2, 562);
    const fine = whiteNoise(W * W, 563);
    const hf = new Float32Array(W * W);
    const cv = paintRGB(W, W, (x, y, i, o) => {
      const ring = Math.sin((y / W) * 60 + g[i] * 9) * 0.5 + 0.5;
      const k = 0.82 + ring * 0.1 + g2[i] * 0.1 + fine[i] * 0.03;
      o[0] = k;
      o[1] = k * 0.93;
      o[2] = k * 0.86;
      hf[i] = ring * 0.3 + fine[i] * 0.05;
    });
    return { map: toTex(cv), normalMap: normalMap(hf, W, W, 0.8) };
  });

  // Veludo e tecido (fino, neutro).
  registerTexture('l5Fabric', (S) => {
    const W = Math.max(64, S / 4);
    const low = noiseField(W, W, 4, 4, 3, 571);
    const fine = whiteNoise(W * W, 572);
    const hf = new Float32Array(W * W);
    const cv = paintRGB(W, W, (x, y, i, o) => {
      const weave = ((x + y) % 2) * 0.03;
      const k = 0.88 + low[i] * 0.06 + fine[i] * 0.05 + weave;
      o[0] = k;
      o[1] = k;
      o[2] = k;
      hf[i] = fine[i] * 0.5 + weave * 4;
    });
    return { map: toTex(cv), normalMap: normalMap(hf, W, W, 0.6) };
  });

  // Tijolo pintado da Sala das Caldeiras: barra verde, filete e creme.
  registerTexture('l5Brick', (S) => {
    const W = Math.max(64, S / 2);
    const H = Math.round(W * (WALL_H / WALL_W));
    const low = noiseField(W, H, 3, 8, 4, 581);
    const fine = whiteNoise(W * H, 582);
    const stain = noiseField(W, H, 6, 16, 4, 583);
    const hf = new Float32Array(W * H);
    const cv = paintRGB(W, H, (x, y, i, o) => {
      const u = (x / W) * WALL_W;
      const h = (1 - y / H) * WALL_H;
      const course = Math.floor(h / 0.075);
      const off = course % 2 ? 0.108 : 0;
      const bu = fract((u + off) / 0.2167);
      const bv = fract(h / 0.075);
      const mortar = bu < 0.05 || bv < 0.13;
      const brickTone = 0.93 + hash3(Math.floor((u + off) / 0.2167), course, 9) * 0.12;
      let c;
      if (h < 1.25) c = [0.19, 0.29, 0.23];
      else if (h < 1.31) c = [0.42, 0.17, 0.11];
      else c = [0.6, 0.58, 0.51];
      let k = (mortar ? 0.82 : brickTone) * (1 + low[i] * 0.05 + fine[i] * 0.03);
      const st = clamp((stain[i] - 0.25) * 2, 0, 1) * (h > 2.6 ? 1 : 0.3);
      k *= 1 - st * 0.18;
      o[0] = c[0] * k;
      o[1] = c[1] * k;
      o[2] = c[2] * k;
      hf[i] = (mortar ? 0 : 0.6) + fine[i] * 0.05;
    });
    return { map: toTex(cv), normalMap: normalMap(hf, W, H, 2.4) };
  });

  // Atlas de detalhes.
  registerTexture('l5Atlas', (S) => drawAtlas(S <= 256 ? 512 : S <= 512 ? 768 : 1024));
}

// Rampa de brilho para as lentes/cúpulas (u escolhe a intensidade).
export function rampTex() {
  return textCanvasTex(
    64,
    4,
    (c, w, h) => {
      for (let x = 0; x < w; x++) {
        const k = Math.pow(x / (w - 1), 1.4);
        c.fillStyle = `rgb(${Math.round(255 * k)},${Math.round(246 * k)},${Math.round(230 * k)})`;
        c.fillRect(x, 0, 1, h);
      }
    },
    { mips: false },
  );
}

// Brilho radial suave para as "poças de luz" aditivas.
export function glowTex() {
  return textCanvasTex(
    64,
    64,
    (c, w, h) => {
      const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgb(255,255,255)');
      g.addColorStop(0.25, 'rgb(150,150,150)');
      g.addColorStop(0.6, 'rgb(40,40,40)');
      g.addColorStop(1, 'rgb(0,0,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    },
    { mips: true },
  );
}

// Material aditivo das poças de luz: segue o brilho dos grupos de lâmpadas e
// some na névoa escurecendo (em vez de clarear para a cor da névoa).
export function glowMaterial(map, color, groupI) {
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { map: { value: map }, uColor: { value: new THREE.Color(color) }, uGroupI: { value: new THREE.Vector4(1, 1, 1, 0) } },
    ]),
    vertexShader: /* glsl */ `
      attribute float aGroup;
      attribute vec3 color;
      varying vec2 vUv;
      varying float vGroup;
      varying vec3 vCol;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        vGroup = aGroup;
        vCol = color;
        vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec3 uColor;
      uniform vec4 uGroupI;
      varying vec2 vUv;
      varying float vGroup;
      varying vec3 vCol;
      #include <fog_pars_fragment>
      void main() {
        float gi = vGroup < 0.5 ? uGroupI.x : vGroup < 1.5 ? uGroupI.y : vGroup < 2.5 ? uGroupI.z : uGroupI.w;
        vec3 c = texture2D( map, vUv ).rgb * uColor * vCol * gi;
        #ifdef USE_FOG
          c *= 1.0 - smoothstep( fogNear, fogFar, vFogDepth );
        #endif
        gl_FragColor = vec4( c, 1.0 );
      }`,
    fog: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  // compartilha o vetor de intensidades com o material das lentes
  if (groupI) m.uniforms.uGroupI = groupI;
  return m;
}

// Rosto do Hóspede para o susto (dataURL).
export function guestFaceURL() {
  const cv = makeCanvas(512, 512);
  const c = cv.getContext('2d');
  c.fillStyle = '#000';
  c.fillRect(0, 0, 512, 512);
  // aba do chapéu e sombra
  const fg = c.createRadialGradient(256, 300, 20, 256, 300, 230);
  fg.addColorStop(0, '#c9c2b4');
  fg.addColorStop(0.55, '#8c8578');
  fg.addColorStop(1, '#141210');
  c.fillStyle = fg;
  c.beginPath();
  c.ellipse(256, 300, 150, 200, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#060606';
  c.beginPath();
  c.ellipse(256, 110, 250, 46, 0, 0, Math.PI * 2);
  c.fill();
  c.fillRect(150, 0, 212, 112);
  const sh = c.createLinearGradient(0, 120, 0, 230);
  sh.addColorStop(0, 'rgba(0,0,0,0.85)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = sh;
  c.fillRect(0, 120, 512, 110);
  // olhos fundos, sem brilho
  for (const sx of [-1, 1]) {
    const eg = c.createRadialGradient(256 + sx * 58, 262, 4, 256 + sx * 58, 262, 52);
    eg.addColorStop(0, '#000');
    eg.addColorStop(0.55, '#050505');
    eg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = eg;
    c.beginPath();
    c.ellipse(256 + sx * 58, 262, 52, 40, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(255,250,235,0.85)';
    c.beginPath();
    c.arc(256 + sx * 54, 258, 3, 0, Math.PI * 2);
    c.fill();
  }
  // bigode fino e sorriso largo demais
  c.strokeStyle = '#1a1612';
  c.lineWidth = 5;
  c.beginPath();
  c.moveTo(215, 352);
  c.quadraticCurveTo(256, 340, 297, 352);
  c.stroke();
  c.fillStyle = '#120c0a';
  c.beginPath();
  c.moveTo(168, 372);
  c.quadraticCurveTo(256, 452, 344, 372);
  c.quadraticCurveTo(256, 410, 168, 372);
  c.fill();
  c.strokeStyle = 'rgba(235,228,210,0.9)';
  c.lineWidth = 3;
  for (let i = 1; i < 10; i++) {
    const x = 168 + (176 * i) / 10;
    c.beginPath();
    c.moveTo(x, 380 + Math.sin((i / 10) * Math.PI) * 10);
    c.lineTo(x, 392 + Math.sin((i / 10) * Math.PI) * 18);
    c.stroke();
  }
  // colarinho
  c.fillStyle = '#d8d2c4';
  c.beginPath();
  c.moveTo(150, 512);
  c.lineTo(256, 470);
  c.lineTo(362, 512);
  c.fill();
  return cv.toDataURL();
}
