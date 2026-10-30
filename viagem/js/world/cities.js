// Cidades: casas em sete estilos (fachadas e telhados procedurais), praça central,
// ruas laterais, postes de luz e um marco por cidade (pagode, campanário, farol…).
import * as THREE from 'three';
import { CITIES, COUNTRIES, LAKES } from './data.js';
import { RNG, clamp, lerp } from '../util.js';
import { merge, paint, xf, box, cyl } from '../geom.js';
import { pavingTex, glowTex, textTex } from './textures.js';
import { drawFlag } from '../ui/flags.js';

// ------------------------------------------------------------ texturas de fachada
const facadeCache = {};
function facade(style) {
  if (facadeCache[style]) return facadeCache[style];
  const W = 1024;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const e = document.createElement('canvas');
  e.width = W;
  e.height = H;
  const ctx = c.getContext('2d');
  const ex = e.getContext('2d');
  ex.fillStyle = '#000';
  ex.fillRect(0, 0, W, H);
  const rng = new RNG(style.length * 31 + 7);
  const B = 128; // 1 vão = 3 m
  const px = (m) => (m / 3) * B;
  // parede base
  const plaster = (y0, y1, base) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, y0, W, y1 - y0);
    for (let i = 0; i < 2600; i++) {
      const g = rng.float(-14, 14);
      ctx.fillStyle = `rgba(${g > 0 ? 255 : 0},${g > 0 ? 255 : 0},${g > 0 ? 255 : 0},${Math.abs(g) / 255})`;
      ctx.fillRect(rng.float(0, W), rng.float(y0, y1), rng.float(1, 4), rng.float(1, 4));
    }
    // sujeira escorrida
    for (let i = 0; i < 40; i++) {
      const x = rng.float(0, W);
      const gr = ctx.createLinearGradient(0, y0, 0, y1);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(1, 'rgba(40,30,20,0.08)');
      ctx.fillStyle = gr;
      ctx.fillRect(x, y0, rng.float(4, 30), y1 - y0);
    }
  };
  const boards = (y0, y1, base, vertical = false) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, y0, W, y1 - y0);
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 2;
    if (vertical) for (let x = 0; x < W; x += 14) ctx.strokeRect(x, y0, 0, y1 - y0);
    else
      for (let y = y0; y < y1; y += 9) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
  };
  const stone = (y0, y1) => {
    ctx.fillStyle = '#d8d2c4';
    ctx.fillRect(0, y0, W, y1 - y0);
    for (let y = y0; y < y1; y += 12) {
      let x = rng.float(-20, 0);
      while (x < W) {
        const w = rng.float(14, 30);
        const k = rng.float(0.78, 1.02);
        ctx.fillStyle = `rgb(${200 * k},${190 * k},${172 * k})`;
        ctx.fillRect(x + 1, y + 1, w - 2, 10);
        x += w;
      }
    }
  };
  const lights = ['#ffcf8a', '#ffd9a0', '#ffe8c4', '#ffc070', '#cfe6ff'];
  const win = (cx, by, w, h, opt = {}) => {
    const x = cx - w / 2;
    const y = by - h;
    // moldura
    ctx.fillStyle = opt.frame || '#f4f2ec';
    ctx.fillRect(x - 5, y - 5, w + 10, h + 10);
    if (opt.arch) {
      ctx.beginPath();
      ctx.arc(cx, y, w / 2 + 5, Math.PI, 0);
      ctx.fill();
    }
    // vidro com reflexo
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#5c6e80');
    g.addColorStop(0.5, '#2a3542');
    g.addColorStop(1, '#3a4a58');
    ctx.fillStyle = opt.glass || g;
    ctx.fillRect(x, y, w, h);
    if (opt.arch) {
      ctx.beginPath();
      ctx.arc(cx, y, w / 2, Math.PI, 0);
      ctx.fill();
    }
    // cortina
    if (rng.chance(0.5)) {
      ctx.fillStyle = 'rgba(235,225,205,0.55)';
      ctx.fillRect(x + 2, y + 2, w * rng.float(0.2, 0.45), h - 4);
    }
    // caixilhos
    ctx.fillStyle = opt.frame || '#f4f2ec';
    const mul = opt.mullion ?? 1;
    if (mul >= 1) ctx.fillRect(cx - 2, y, 4, h);
    if (mul >= 2) ctx.fillRect(x, y + h * 0.45, w, 3);
    if (opt.grid) {
      for (let gx = x; gx < x + w; gx += w / opt.grid) ctx.fillRect(gx, y, 2, h);
      for (let gy = y; gy < y + h; gy += h / (opt.grid + 1)) ctx.fillRect(x, gy, w, 2);
    }
    // venezianas
    if (opt.shutter) {
      ctx.fillStyle = opt.shutter;
      ctx.fillRect(x - 5 - w * 0.5, y - 4, w * 0.48, h + 8);
      ctx.fillRect(x + w + 5, y - 4, w * 0.48, h + 8);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let yy = y; yy < y + h; yy += 5) {
        ctx.fillRect(x - 5 - w * 0.5, yy, w * 0.48, 1);
        ctx.fillRect(x + w + 5, yy, w * 0.48, 1);
      }
    }
    if (opt.box) {
      ctx.fillStyle = '#6b4a2a';
      ctx.fillRect(x - 6, by + 4, w + 12, 8);
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = rng.pick(['#d0302a', '#e8586a', '#f0a030', '#c8304a']);
        ctx.beginPath();
        ctx.arc(x + rng.float(0, w), by + 2, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // luz noturna
    if (!opt.nolight && rng.chance(0.5)) {
      ex.fillStyle = rng.pick(lights);
      ex.fillRect(x, y, w, h);
      if (opt.arch) {
        ex.beginPath();
        ex.arc(cx, y, w / 2, Math.PI, 0);
        ex.fill();
      }
    }
  };
  const door = (cx, by, w, h, col, arch) => {
    ctx.fillStyle = '#3a2a20';
    ctx.fillRect(cx - w / 2 - 5, by - h - 5, w + 10, h + 5);
    ctx.fillStyle = col;
    ctx.fillRect(cx - w / 2, by - h, w, h);
    if (arch) {
      ctx.beginPath();
      ctx.arc(cx, by - h, w / 2, Math.PI, 0);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - w / 2 + 6, by - h + 8, w / 2 - 9, h - 16);
    ctx.strokeRect(cx + 3, by - h + 8, w / 2 - 9, h - 16);
    ctx.fillStyle = '#d8b860';
    ctx.fillRect(cx + w / 2 - 10, by - h / 2, 4, 4);
  };
  const shop = (cx, by, w, h, awn) => {
    win(cx, by - 8, w, h, { mullion: 0, frame: '#2a2a2a', glass: '#28323c' });
    ex.fillStyle = '#ffe6b8';
    ex.fillRect(cx - w / 2, by - 8 - h, w, h);
    if (awn) {
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 ? '#f2f2f0' : awn;
        ctx.fillRect(cx - w / 2 - 8 + (i * (w + 16)) / 8, by - h - 26, (w + 16) / 8 + 1, 16);
      }
    }
  };
  const UP = 0;
  const GR = 128;
  const bay = (i) => i * B + B / 2;
  switch (style) {
    case 'nordic':
      boards(0, H, '#f2f0ea');
      for (let i = 0; i < 8; i++) {
        win(bay(i), UP + px(2.4), px(1.0), px(1.3), { mullion: 2, frame: '#ffffff' });
        if (i % 4 === 1) door(bay(i), GR + B, px(1.0), px(2.1), '#2f4a5a');
        else win(bay(i), GR + px(2.2), px(1.0), px(1.3), { mullion: 2, frame: '#ffffff' });
      }
      break;
    case 'alpine':
      boards(0, GR, '#c49a6c', true);
      plaster(GR, H, '#f4f1ea');
      for (let i = 0; i < 8; i++) {
        win(bay(i), UP + px(2.3), px(1.0), px(1.2), { mullion: 2, frame: '#f6f0e4', shutter: '#3a6a3a', box: true });
        if (i % 4 === 2) door(bay(i), GR + B, px(1.1), px(2.2), '#6a3a1e', false);
        else win(bay(i), GR + px(2.2), px(0.9), px(1.1), { mullion: 2, frame: '#f6f0e4', shutter: '#3a6a3a' });
      }
      break;
    case 'japanese':
      plaster(0, H, '#ece6d8');
      ctx.fillStyle = '#4a3326';
      for (let i = 0; i <= 8; i++) ctx.fillRect(i * B - 5, 0, 10, H);
      ctx.fillRect(0, GR - 8, W, 10);
      for (let i = 0; i < 8; i++) {
        win(bay(i), UP + px(2.3), px(1.6), px(1.1), { mullion: 0, frame: '#4a3326', glass: '#e6dcc4', grid: 4 });
        if (i % 3 === 0) shop(bay(i), GR + B, px(2.2), px(1.6), '#2a3a6a');
        else win(bay(i), GR + px(2.4), px(1.8), px(1.7), { mullion: 0, frame: '#4a3326', glass: '#e8dfc8', grid: 4 });
      }
      break;
    case 'mexican':
      plaster(0, H, '#f6f2ea');
      for (let i = 0; i < 8; i++) {
        win(bay(i), UP + px(2.4), px(0.9), px(1.4), { mullion: 1, frame: '#fdfbf6', shutter: rng.pick(['#2a6a8a', '#8a3a2a', '#2a7a5a']) });
        if (i % 3 === 1) door(bay(i), GR + B, px(1.2), px(2.2), '#6a3a1e', true);
        else win(bay(i), GR + px(2.2), px(0.9), px(1.3), { mullion: 1, frame: '#fdfbf6', arch: true });
      }
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(0, H - 14, W, 14);
      break;
    case 'italian':
      plaster(0, GR, '#f0e4cc');
      stone(GR, H);
      for (let i = 0; i < 8; i++) {
        win(bay(i), UP + px(2.4), px(0.85), px(1.5), { mullion: 1, frame: '#efe8da', shutter: '#3e5e3a' });
        if (i % 4 === 1) door(bay(i), GR + B, px(1.3), px(2.4), '#5a3a22', true);
        else if (i % 4 === 3) shop(bay(i), GR + B, px(1.8), px(1.6), '#a03028');
        else win(bay(i), GR + px(2.3), px(0.85), px(1.4), { mullion: 1, frame: '#efe8da', shutter: '#3e5e3a' });
      }
      break;
    case 'colonial':
      plaster(0, H, '#fbfaf6');
      for (let i = 0; i < 8; i++) {
        const fc = rng.pick(['#1f5aa8', '#e2b21c', '#2a8a4a', '#c0392b']);
        win(bay(i), UP + px(2.5), px(1.0), px(1.5), { mullion: 2, frame: fc, arch: true });
        if (i % 2 === 0) door(bay(i), GR + B, px(1.2), px(2.4), fc, true);
        else win(bay(i), GR + px(2.3), px(1.0), px(1.4), { mullion: 2, frame: fc });
      }
      break;
    default:
      // praia / prédios modernos
      plaster(0, H, '#eef0f0');
      for (let i = 0; i < 8; i++) {
        win(bay(i), UP + px(2.6), px(2.4), px(1.9), { mullion: 1, frame: '#c8ccd0', glass: '#3a5468' });
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(i * B + 6, UP + px(2.6), B - 12, 6);
        if (i % 2 === 0) shop(bay(i), GR + B, px(2.4), px(1.8), rng.pick(['#e05a2a', '#2a8ac0', '#f0c020']));
        else win(bay(i), GR + px(2.4), px(2.4), px(1.8), { mullion: 1, frame: '#c8ccd0' });
      }
  }
  // canto liso (para os oitões)
  ctx.fillStyle = style === 'alpine' ? '#c49a6c' : style === 'nordic' ? '#f2f0ea' : '#f4f1ea';
  ctx.fillRect(0, 0, 8, 8);
  ex.fillStyle = '#000';
  ex.fillRect(0, 0, 8, 8);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.anisotropy = 8;
  const em = new THREE.CanvasTexture(e);
  em.colorSpace = THREE.SRGBColorSpace;
  em.wrapS = THREE.RepeatWrapping;
  facadeCache[style] = { map, em };
  return facadeCache[style];
}

let roofTexCache = null;
function roofTex() {
  if (roofTexCache) return roofTexCache;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d');
  const rng = new RNG(4);
  ctx.fillStyle = '#7a7a7a';
  ctx.fillRect(0, 0, S, S);
  const rows = 8;
  const rh = S / rows;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * 16;
    for (let x = -32; x < S; x += 32) {
      const k = rng.float(0.82, 1.08);
      const g = ctx.createLinearGradient(0, r * rh, 0, r * rh + rh);
      g.addColorStop(0, `rgb(${150 * k},${150 * k},${150 * k})`);
      g.addColorStop(0.8, `rgb(${215 * k},${215 * k},${215 * k})`);
      g.addColorStop(1, `rgb(${110 * k},${110 * k},${110 * k})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(x + off + 1, r * rh + 1, 30, rh - 2, 6);
      ctx.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  roofTexCache = t;
  return t;
}

// ------------------------------------------------------------ construtor de malhas
class MB {
  constructor() {
    this.P = [];
    this.N = [];
    this.U = [];
    this.C = [];
    this.I = [];
  }
  vert(p, n, u, v, c) {
    this.P.push(p[0], p[1], p[2]);
    this.N.push(n[0], n[1], n[2]);
    this.U.push(u, v);
    this.C.push(c.r, c.g, c.b);
    return this.P.length / 3 - 1;
  }
  // quad a,b,c,d em sentido anti-horário visto de fora
  quad(a, b, c, d, uv, col) {
    const n = new THREE.Vector3()
      .subVectors(new THREE.Vector3(...b), new THREE.Vector3(...a))
      .cross(new THREE.Vector3().subVectors(new THREE.Vector3(...d), new THREE.Vector3(...a)))
      .normalize()
      .toArray();
    const i0 = this.vert(a, n, uv[0], uv[1], col);
    const i1 = this.vert(b, n, uv[2], uv[3], col);
    const i2 = this.vert(c, n, uv[4], uv[5], col);
    const i3 = this.vert(d, n, uv[6], uv[7], col);
    this.I.push(i0, i1, i2, i0, i2, i3);
  }
  tri(a, b, c, uv, col) {
    const n = new THREE.Vector3()
      .subVectors(new THREE.Vector3(...b), new THREE.Vector3(...a))
      .cross(new THREE.Vector3().subVectors(new THREE.Vector3(...c), new THREE.Vector3(...a)))
      .normalize()
      .toArray();
    const i0 = this.vert(a, n, uv[0], uv[1], col);
    const i1 = this.vert(b, n, uv[2], uv[3], col);
    const i2 = this.vert(c, n, uv[4], uv[5], col);
    this.I.push(i0, i1, i2);
  }
  geo() {
    if (!this.I.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setIndex(this.I);
    g.computeBoundingSphere();
    return g;
  }
}

const PALETTE = {
  nordic: { walls: ['#9b2a22', '#a8322a', '#e8dcc0', '#d8a83a', '#f2f0ea', '#2f4a5a'], roofs: ['#2a2a2c', '#3a3a3a', '#4a2a22'], roof: 'gable', floors: [1, 2] },
  alpine: { walls: ['#ffffff', '#f6efe0', '#fff6e8'], roofs: ['#5a4030', '#4a3a32', '#6a6460'], roof: 'chalet', floors: [2, 3] },
  japanese: { walls: ['#f2ece0', '#e8e0d0', '#fff8ee'], roofs: ['#3a3e44', '#2e3236', '#4a4e54'], roof: 'japanese', floors: [1, 2] },
  mexican: { walls: ['#f0a0b8', '#f6d050', '#60c0c0', '#f08a50', '#a0d070', '#f4f0e8', '#c060a0'], roofs: ['#b8582e', '#a04a28'], roof: 'flat', floors: [1, 2] },
  italian: { walls: ['#e8c890', '#d89a60', '#f0dcb0', '#e0a878', '#f4e4c8', '#c88a5a'], roofs: ['#b05a32', '#a8502c', '#c06a3e'], roof: 'hip', floors: [2, 4] },
  colonial: { walls: ['#ffffff', '#fff8e8', '#f8f0e0', '#fff4c0', '#e0f0ff'], roofs: ['#b0603a', '#a05030'], roof: 'hip', floors: [1, 2] },
  beach: { walls: ['#f8f8f4', '#f0f4f8', '#fff0e0', '#e8f8f0'], roofs: ['#9a9a9a', '#b8b0a8'], roof: 'flat', floors: [2, 5] },
};

export class Cities {
  constructor(scene, gen, Q) {
    this.scene = scene;
    this.gen = gen;
    this.Q = Q;
    this.groups = [];
    this.lamps = []; // posições das lâmpadas (para luzes pontuais à noite)
    this.colliders = new Map(); // caixas das construções
    this.winMats = [];
    this.lampMat = new THREE.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffd9a0, emissiveIntensity: 0 });
    this.glowMat = new THREE.PointsMaterial({ map: glowTex(), size: 3.2, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, color: 0xffd8a0 });
    this.detailMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05 });
    this.metalMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.7 });
    this.roofMat = new THREE.MeshStandardMaterial({ map: roofTex(), vertexColors: true, roughness: 0.75, side: THREE.DoubleSide });
    this.pavingMats = {};
    this.streetMat = null;
  }

  addCollider(x, z, hx, hz, yaw) {
    const c = { x, z, hx, hz, yaw, cos: Math.cos(yaw), sin: Math.sin(yaw) };
    const r = Math.hypot(hx, hz);
    for (let i = Math.floor((x - r) / 32); i <= Math.floor((x + r) / 32); i++)
      for (let j = Math.floor((z - r) / 32); j <= Math.floor((z + r) / 32); j++) {
        const k = i * 100000 + j;
        let l = this.colliders.get(k);
        if (!l) this.colliders.set(k, (l = []));
        l.push(c);
      }
  }

  collidersNear(x, z) {
    return this.colliders.get(Math.floor(x / 32) * 100000 + Math.floor(z / 32));
  }

  build(roads, streetMat) {
    this.streetMat = streetMat;
    CITIES.forEach((c, i) => this.buildCity(c, i, roads));
  }

  // ----- casa
  house(mb, rb, det, { x, y, z, yaw, w, d, floors, wall, roof, roofType, uoff, style }) {
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const T = (lx, ly, lz) => [x + lx * cy + lz * sy, y + ly, z - lx * sy + lz * cy];
    const fh = 3;
    const top = floors * fh;
    const hw = w / 2;
    const hd = d / 2;
    const wc = new THREE.Color(wall);
    // paredes: 4 lados, um quad por andar
    const sides = [
      [[-hw, hd], [hw, hd], w],
      [[hw, hd], [hw, -hd], d],
      [[hw, -hd], [-hw, -hd], w],
      [[-hw, -hd], [-hw, hd], d],
    ];
    const plain = [0.004, 0.99];
    for (const [a, b, len] of sides) {
      const u0 = uoff;
      const u1 = uoff + len / 24;
      // embasamento
      mb.quad(T(a[0], -1.2, a[1]), T(b[0], -1.2, b[1]), T(b[0], 0, b[1]), T(a[0], 0, a[1]), [...plain, ...plain, ...plain, ...plain], wc.clone().multiplyScalar(0.62));
      for (let f = 0; f < floors; f++) {
        const v0 = f === 0 ? 0 : 0.5;
        mb.quad(T(a[0], f * fh, a[1]), T(b[0], f * fh, b[1]), T(b[0], (f + 1) * fh, b[1]), T(a[0], (f + 1) * fh, a[1]), [u0, v0, u1, v0, u1, v0 + 0.5, u0, v0 + 0.5], wc);
      }
    }
    const rc = new THREE.Color(roof);
    const pitch = roofType === 'chalet' ? 0.45 : roofType === 'japanese' ? 0.55 : 0.62;
    const o = roofType === 'chalet' ? 1.1 : roofType === 'japanese' ? 0.9 : 0.45;
    if (roofType === 'flat') {
      mb.quad(T(-hw, top, hd), T(hw, top, hd), T(hw, top, -hd), T(-hw, top, -hd), [...plain, ...plain, ...plain, ...plain], wc.clone().multiplyScalar(0.8));
      // platibanda
      for (const [a, b] of sides) {
        const g = box(Math.hypot(b[0] - a[0], b[1] - a[1]) + 0.3, 0.6, 0.3);
        const mx = (a[0] + b[0]) / 2;
        const mz = (a[1] + b[1]) / 2;
        const p = T(mx, top + 0.3, mz);
        xf(g, p[0], p[1], p[2], 0, yaw + Math.atan2(b[0] - a[0], b[1] - a[1]) + Math.PI / 2);
        det.push(paint(g, wc.clone().multiplyScalar(0.92)));
      }
      if (style === 'mexican' && Math.random() < 0.6) {
        // caixa d'água e varal
        const g = cyl(0.6, 0.6, 1.1, 10);
        const p = T(hw * 0.4, top + 0.55, -hd * 0.3);
        xf(g, p[0], p[1], p[2]);
        det.push(paint(g, '#2a2a2a'));
      }
      return;
    }
    // telhados inclinados: cumeeira ao longo do lado maior
    const alongX = w >= d;
    const L = (alongX ? hw : hd) + o;
    const S = (alongX ? hd : hw) + o;
    const rise = (alongX ? hd : hw) * pitch;
    const eaveY = top - o * pitch;
    const ridgeY = top + rise;
    // coordenadas no sistema (a = ao longo da cumeeira, b = transversal)
    const R = (a, h, b) => (alongX ? T(a, h, b) : T(b, h, a));
    const hip = roofType === 'hip' || roofType === 'japanese';
    const ridgeL = hip ? Math.max(0.3, L - S) : L;
    const slope = Math.hypot(S, rise + o * pitch);
    const uvq = (len) => [0, 0, len / 2, 0, len / 2, slope / 2, 0, slope / 2];
    // as duas águas
    for (const s of [1, -1]) {
      const a0 = R(-L * s, eaveY, S * s);
      const a1 = R(L * s, eaveY, S * s);
      const a2 = R(ridgeL * s, ridgeY, 0);
      const a3 = R(-ridgeL * s, ridgeY, 0);
      if (alongX) rb.quad(a0, a1, a2, a3, uvq(2 * L), rc);
      else rb.quad(a1, a0, a3, a2, uvq(2 * L), rc);
    }
    if (hip) {
      for (const s of [1, -1]) {
        const a0 = R(L * s, eaveY, S);
        const a1 = R(L * s, eaveY, -S);
        const a2 = R(ridgeL * s, ridgeY, 0);
        const uv = [0, 0, S, 0, S / 2, slope / 2];
        if ((s > 0) === alongX) rb.tri(a0, a1, a2, uv, rc);
        else rb.tri(a1, a0, a2, uv, rc);
      }
      if (roofType === 'japanese') {
        // beiral levantado nas pontas
        for (const s of [1, -1]) {
          const g = box(2 * L + 0.4, 0.18, 0.35);
          const p = R(0, eaveY - 0.05, S * s);
          xf(g, p[0], p[1], p[2], 0, yaw + (alongX ? 0 : Math.PI / 2));
          det.push(paint(g, rc.clone().multiplyScalar(0.7)));
        }
        const rg = box(2 * ridgeL + 0.6, 0.35, 0.4);
        const p = R(0, ridgeY + 0.1, 0);
        xf(rg, p[0], p[1], p[2], 0, yaw + (alongX ? 0 : Math.PI / 2));
        det.push(paint(rg, rc.clone().multiplyScalar(0.6)));
      }
    } else {
      // oitões
      for (const s of [1, -1]) {
        const e = alongX ? hw : hd;
        const a0 = R(e * s, top, (alongX ? hd : hw) * s);
        const a1 = R(e * s, top, -(alongX ? hd : hw) * s);
        const a2 = R(e * s, ridgeY - 0.05, 0);
        mb.tri(a0, a1, a2, [...plain, ...plain, ...plain], wc);
        mb.tri(a1, a0, a2, [...plain, ...plain, ...plain], wc);
      }
    }
    // chaminé
    if (style === 'nordic' || style === 'alpine' || style === 'italian') {
      const g = box(0.6, rise + 1.4, 0.6);
      const p = R(L * 0.4, top + (rise + 1.4) / 2, -S * 0.25);
      xf(g, p[0], p[1], p[2], 0, yaw);
      det.push(paint(g, style === 'italian' ? '#c88a5a' : '#6a6060'));
    }
    if (style === 'alpine' && floors > 1) {
      // sacada de madeira na frente
      const g = box(w * 0.9, 0.9, 1.0);
      const p = T(0, fh + 0.45, hd + 0.5);
      xf(g, p[0], p[1], p[2], 0, yaw);
      det.push(paint(g, '#7a5232'));
    }
  }

  buildCity(c, ci, roads) {
    const rng = new RNG(ci * 977 + 13);
    const style = c.style;
    const pal = PALETTE[style];
    const gen = this.gen;
    const group = new THREE.Group();
    group.name = c.name;
    const mb = new MB();
    const rb = new MB();
    const det = [];
    const metal = [];
    const lampHeads = [];
    const glow = [];
    const y = c.h;
    const placed = [];
    const streets = [];
    const myRoads = roads.filter((r) => r.a === ci || r.b === ci);

    // ruas laterais: escolhe direções longe das estradas existentes
    const dirs = myRoads.map((r) => {
      const k = r.a === ci ? 8 : r.hs.length - 9;
      return Math.atan2(r.pts[k * 2 + 1] - c.z, r.pts[k * 2] - c.x);
    });
    const free = [];
    for (let a = 0; a < 24; a++) {
      const ang = (a / 24) * Math.PI * 2;
      let m = Math.PI;
      for (const d of dirs) m = Math.min(m, Math.abs(Math.atan2(Math.sin(ang - d), Math.cos(ang - d))));
      free.push([m, ang]);
    }
    free.sort((a, b) => b[0] - a[0]);
    const streetDirs = [];
    for (const [m, ang] of free) {
      if (m < 0.6) break;
      if (streetDirs.every((s) => Math.abs(Math.atan2(Math.sin(ang - s), Math.cos(ang - s))) > 1.0)) streetDirs.push(ang);
      if (streetDirs.length >= 2) break;
    }
    for (const ang of streetDirs) {
      const len = c.r * 0.9;
      streets.push({ x0: c.x + Math.cos(ang) * 22, z0: c.z + Math.sin(ang) * 22, x1: c.x + Math.cos(ang) * len, z1: c.z + Math.sin(ang) * len, hw: 3.4 });
    }
    // malha das ruas laterais
    for (const s of streets) {
      const dx = s.x1 - s.x0;
      const dz = s.z1 - s.z0;
      const L = Math.hypot(dx, dz);
      const g = new THREE.PlaneGeometry(s.hw * 2, L);
      g.rotateX(-Math.PI / 2);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (L / 12));
      const m = new THREE.Mesh(g, this.streetMat);
      m.position.set((s.x0 + s.x1) / 2, y + 0.03, (s.z0 + s.z1) / 2);
      m.rotation.y = Math.atan2(dx, dz);
      m.receiveShadow = true;
      group.add(m);
    }
    const streetDist = (x, z) => {
      let best = 1e9;
      for (const s of streets) {
        const dx = s.x1 - s.x0;
        const dz = s.z1 - s.z0;
        const t = clamp(((x - s.x0) * dx + (z - s.z0) * dz) / (dx * dx + dz * dz), 0, 1);
        best = Math.min(best, Math.hypot(s.x0 + dx * t - x, s.z0 + dz * t - z) - s.hw);
      }
      return best;
    };
    const clear = (x, z, rad) => {
      if (Math.hypot(x - c.x, z - c.z) < 30 + rad) return false;
      for (const p of placed) if (Math.hypot(p[0] - x, p[1] - z) < p[2] + rad) return false;
      const q = gen.roadQuery(x, z, 40);
      if (q && q.dist < q.hw + 2 + rad * 0.7) return false;
      if (streetDist(x, z) < 2 + rad * 0.7) return false;
      return true;
    };
    const fac = facade(style);
    let lampToggle = 0;
    const lamp = (x, z, yaw) => {
      const pole = cyl(0.07, 0.1, 5.5, 8);
      xf(pole, x, y + 2.75, z);
      metal.push(paint(pole, '#3a3c40'));
      const arm = box(0.08, 0.08, 1.4);
      const ax = x + Math.sin(yaw) * 0.6;
      const az = z + Math.cos(yaw) * 0.6;
      xf(arm, ax, y + 5.45, az, 0, yaw);
      metal.push(paint(arm, '#3a3c40'));
      const hx = x + Math.sin(yaw) * 1.2;
      const hz = z + Math.cos(yaw) * 1.2;
      const head = box(0.5, 0.12, 0.28);
      xf(head, hx, y + 5.35, hz, 0, yaw);
      lampHeads.push(head);
      glow.push(hx, y + 5.2, hz);
      this.lamps.push(new THREE.Vector3(hx, y + 5.1, hz));
    };
    // casas ao longo de uma linha (estrada ou rua), dos dois lados
    const along = (pts, hw, maxS) => {
      let s = 18;
      const total = pts.length;
      for (let k = 1; k < total - 1; k++) {
        const [x, z, ds] = pts[k];
        if (ds < s) continue;
        if (Math.hypot(x - c.x, z - c.z) > c.r + 10) break;
        const [px, pz] = pts[k - 1];
        const [nx, nz] = pts[k + 1];
        let tx = nx - px;
        let tz = nz - pz;
        const tl = Math.hypot(tx, tz) || 1;
        tx /= tl;
        tz /= tl;
        const rx = -tz;
        const rz = tx;
        for (const side of [-1, 1]) {
          const bays = rng.int(2, style === 'beach' ? 5 : 4);
          const w = bays * 3;
          const d = rng.pick([6, 9, 9, 12]);
          const set = hw + 2.5 + d / 2 + rng.float(0, 1.5);
          const bx = x + rx * side * set;
          const bz = z + rz * side * set;
          const rad = Math.hypot(w, d) / 2 * 0.85;
          if (!clear(bx, bz, rad)) continue;
          placed.push([bx, bz, rad]);
          const yaw = Math.atan2(-rx * side, -rz * side);
          const floors = rng.int(pal.floors[0], pal.floors[1]);
          this.house(mb, rb, det, {
            x: bx,
            y,
            z: bz,
            yaw,
            w,
            d,
            floors,
            wall: rng.pick(pal.walls),
            roof: rng.pick(pal.roofs),
            roofType: style === 'nordic' && rng.chance(0.3) ? 'hip' : pal.roof,
            uoff: rng.int(0, 7) / 8,
            style,
          });
          this.addCollider(bx, bz, w / 2, d / 2, yaw);
        }
        // poste
        if (ds > 20 && Math.floor(ds / 26) !== Math.floor((ds - 5) / 26)) {
          lampToggle = -lampToggle || 1;
          const lx = x + rx * lampToggle * (hw + 1.2);
          const lz = z + rz * lampToggle * (hw + 1.2);
          lamp(lx, lz, Math.atan2(-rx * lampToggle, -rz * lampToggle));
        }
        s = ds + rng.float(10, 16);
        if (ds > maxS) break;
      }
    };
    for (const r of myRoads) {
      const pts = [];
      const n = r.hs.length;
      const fwd = r.a === ci;
      for (let k = 0; k < n; k++) {
        const kk = fwd ? k : n - 1 - k;
        pts.push([r.pts[kk * 2], r.pts[kk * 2 + 1], fwd ? r.cum[kk] : r.len - r.cum[kk]]);
        if (pts[pts.length - 1][2] > c.r + 20) break;
      }
      along(pts, r.hw, c.r);
    }
    for (const s of streets) {
      const pts = [];
      const L = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
      for (let d = 0; d <= L; d += 4) pts.push([lerp(s.x0, s.x1, d / L), lerp(s.z0, s.z1, d / L), d + 22]);
      along(pts, s.hw, c.r);
    }
    // anel extra de casas espalhadas (vila mais cheia)
    for (let k = 0; k < 26; k++) {
      const a = rng.float(0, Math.PI * 2);
      const r = rng.float(45, c.r - 10);
      const bx = c.x + Math.cos(a) * r;
      const bz = c.z + Math.sin(a) * r;
      const w = rng.int(2, 3) * 3;
      const d = rng.pick([6, 9]);
      const rad = (Math.hypot(w, d) / 2) * 0.85;
      if (!clear(bx, bz, rad + 2)) continue;
      placed.push([bx, bz, rad]);
      const yaw = rng.float(0, Math.PI * 2);
      this.house(mb, rb, det, { x: bx, y, z: bz, yaw, w, d, floors: rng.int(pal.floors[0], Math.max(pal.floors[0], pal.floors[1] - 1)), wall: rng.pick(pal.walls), roof: rng.pick(pal.roofs), roofType: pal.roof, uoff: rng.int(0, 7) / 8, style });
      this.addCollider(bx, bz, w / 2, d / 2, yaw);
    }

    // praça
    const pv = style === 'japanese' ? [0.62, 0.6, 0.58] : style === 'mexican' || style === 'italian' ? [0.78, 0.66, 0.52] : [0.68, 0.66, 0.62];
    const pmat = new THREE.MeshStandardMaterial({ map: pavingTex(pv), roughness: 0.85 });
    pmat.map.repeat.set(6, 6);
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(25, 48), pmat);
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(c.x, y + 0.035, c.z);
    plaza.receiveShadow = true;
    group.add(plaza);
    this.landmark(c, ci, det, metal, rng, group, myRoads, placed, mb, rb);
    // chafariz ou estátua no centro? (a praça é passagem das estradas: fica na borda)
    const fa = free[0][1];
    const fx = c.x + Math.cos(fa) * 17;
    const fz = c.z + Math.sin(fa) * 17;
    const basin = cyl(2.2, 2.4, 0.7, 20);
    xf(basin, fx, y + 0.35, fz);
    det.push(paint(basin, '#c8c0b0'));
    const col = cyl(0.35, 0.45, 2.2, 10);
    xf(col, fx, y + 1.1, fz);
    det.push(paint(col, '#d0c8b8'));
    const wtr = cyl(2.0, 2.0, 0.05, 20);
    xf(wtr, fx, y + 0.62, fz);
    det.push(paint(wtr, '#4a7a8a'));
    this.addCollider(fx, fz, 2.3, 2.3, 0);
    // bancos
    for (let k = 0; k < 4; k++) {
      const a = fa + (k - 1.5) * 0.5;
      const bx = c.x + Math.cos(a) * 22;
      const bz = c.z + Math.sin(a) * 22;
      const g = box(1.8, 0.45, 0.5);
      xf(g, bx, y + 0.25, bz, 0, -a);
      det.push(paint(g, '#7a5a3a'));
    }

    // monta as malhas
    const wallMat = new THREE.MeshStandardMaterial({ map: fac.map, emissiveMap: fac.em, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true, roughness: 0.82 });
    this.winMats.push(wallMat);
    const add = (geo, mat, cast = true) => {
      if (!geo) return;
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = cast;
      m.receiveShadow = true;
      group.add(m);
    };
    add(mb.geo(), wallMat);
    add(rb.geo(), this.roofMat);
    if (det.length) add(merge(det), this.detailMat);
    if (metal.length) add(merge(metal), this.metalMat);
    if (lampHeads.length) add(merge(lampHeads), this.lampMat, false);
    if (glow.length) {
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.Float32BufferAttribute(glow, 3));
      const pts = new THREE.Points(pg, this.glowMat);
      pts.frustumCulled = false;
      group.add(pts);
    }
    this.scene.add(group);
    this.groups.push({ group, city: c });
    c.streets = streets;
  }

  // ----- marcos
  landmark(c, ci, det, metal, rng, group, myRoads, placed, mb, rb) {
    const y = c.h;
    // acha um lugar livre perto da praça (ou na beira d'água)
    const spot = (rad, dmin, dmax) => {
      for (let tries = 0; tries < 80; tries++) {
        const a = rng.float(0, Math.PI * 2);
        const d = rng.float(dmin, dmax);
        const x = c.x + Math.cos(a) * d;
        const z = c.z + Math.sin(a) * d;
        const q = this.gen.roadQuery(x, z, 60);
        if (q && q.dist < q.hw + rad + 2) continue;
        if (placed.some((p) => Math.hypot(p[0] - x, p[1] - z) < p[2] + rad)) continue;
        let sd = 1e9;
        for (const s of c.streets || []) {
          const dx = s.x1 - s.x0;
          const dz = s.z1 - s.z0;
          const t = clamp(((x - s.x0) * dx + (z - s.z0) * dz) / (dx * dx + dz * dz), 0, 1);
          sd = Math.min(sd, Math.hypot(s.x0 + dx * t - x, s.z0 + dz * t - z) - s.hw);
        }
        if (sd < rad + 1) continue;
        placed.push([x, z, rad]);
        return [x, z, Math.atan2(c.x - x, c.z - z)];
      }
      return [c.x + dmax, c.z, 0];
    };
    // beira d'água: caminha do centro até a água
    const shore = () => {
      let lake = null;
      for (const l of LAKES) if (Math.hypot(l.x - c.x, l.z - c.z) < l.r + c.r + 500) lake = l;
      const level = lake ? lake.level : 0;
      let best = null;
      for (let a = 0; a < 36; a++) {
        const ang = (a / 36) * Math.PI * 2;
        for (let d = 30; d < c.r + 520; d += 10) {
          const x = c.x + Math.cos(ang) * d;
          const z = c.z + Math.sin(ang) * d;
          if (this.gen.height(x, z) < level - 0.3) {
            if (!best || d < best[0]) best = [d, x, z, ang];
            break;
          }
        }
      }
      return best ? { x: best[1], z: best[2], ang: best[3], level, d: best[0] } : null;
    };
    const P = (g, col, mtl = false) => (mtl ? metal : det).push(paint(g, col));
    const at = (g, x, yy, z, ry = 0) => xf(g, x, yy, z, 0, ry);
    const tower = (x, z, w, h, col, roofCol, ry = 0) => {
      P(at(box(w, h, w), x, y + h / 2, z, ry), col);
      const rg = new THREE.ConeGeometry(w * 0.78, w * 1.4, 4);
      P(at(rg, x, y + h + w * 0.7, z, ry + Math.PI / 4), roofCol);
      this.addCollider(x, z, w / 2, w / 2, ry);
    };
    switch (c.landmark) {
      case 'pagoda': {
        const [x, z] = spot(9, 40, 70);
        let yy = y;
        P(at(box(10, 1.2, 10), x, yy + 0.6, z), '#8a8278');
        yy += 1.2;
        for (let t = 0; t < 5; t++) {
          const w = 7 - t * 0.9;
          P(at(box(w, 3, w), x, yy + 1.5, z), '#b03a2e');
          P(at(box(w * 0.75, 2.2, w * 0.75), x, yy + 1.5, z), '#f2ece0');
          yy += 3;
          const rg = new THREE.ConeGeometry(w * 1.05, 1.6, 4, 1, true);
          P(at(rg, x, yy + 0.4, z, Math.PI / 4), '#2e3236');
          P(at(box(w * 1.45, 0.25, w * 1.45), x, yy - 0.35, z), '#2e3236');
          yy += 0.4;
        }
        P(at(cyl(0.12, 0.2, 6, 8), x, yy + 3, z), '#c8a040', true);
        for (let k = 0; k < 7; k++) P(at(new THREE.TorusGeometry(0.5 - k * 0.04, 0.08, 6, 14), x, yy + 1 + k * 0.6, z), '#c8a040', true);
        this.addCollider(x, z, 5, 5, 0);
        break;
      }
      case 'torii': {
        const s = shore() || { x: c.x + 60, z: c.z, ang: 0, level: y };
        const ang = s.ang;
        const tx = s.x + Math.cos(ang) * 6;
        const tz = s.z + Math.sin(ang) * 6;
        const yaw = Math.atan2(Math.cos(ang), Math.sin(ang)) + Math.PI / 2;
        const ry = -ang;
        const by = s.level - 1.2;
        for (const sd of [-1, 1]) {
          const px = tx + Math.cos(ang + Math.PI / 2) * sd * 3;
          const pz = tz + Math.sin(ang + Math.PI / 2) * sd * 3;
          P(at(cyl(0.32, 0.36, 9, 14), px, by + 4.5, pz), '#c8321e');
        }
        const top1 = box(9.5, 0.5, 0.6);
        P(at(top1, tx, by + 9.0, tz, ry), '#1e1e1e');
        P(at(box(8.6, 0.4, 0.45), tx, by + 8.5, tz, ry), '#c8321e');
        P(at(box(7.4, 0.35, 0.35), tx, by + 7.2, tz, ry), '#c8321e');
        void yaw;
        // lanternas de pedra
        for (const sd of [-1, 1]) {
          const lx = s.x - Math.cos(ang) * 12 + Math.cos(ang + Math.PI / 2) * sd * 4;
          const lz = s.z - Math.sin(ang) * 12 + Math.sin(ang + Math.PI / 2) * sd * 4;
          const gy = this.gen.height(lx, lz);
          P(at(cyl(0.25, 0.35, 1.2, 8), lx, gy + 0.6, lz), '#9a968e');
          P(at(box(0.8, 0.6, 0.8), lx, gy + 1.5, lz), '#a8a49c');
          P(at(new THREE.ConeGeometry(0.75, 0.5, 4), lx, gy + 2.05, lz, Math.PI / 4), '#9a968e');
        }
        // casa de chá e cerejeiras ficam por conta da vegetação
        const [hx, hz, hy] = spot(7, 50, 80);
        this.house(mb, rb, det, { x: hx, y, z: hz, yaw: hy, w: 9, d: 9, floors: 1, wall: '#f2ece0', roof: '#2e3236', roofType: 'japanese', uoff: 0, style: 'japanese' });
        this.addCollider(hx, hz, 4.5, 4.5, hy);
        break;
      }
      case 'stavechurch': {
        const [x, z, ry] = spot(8, 40, 70);
        const wood = '#3a2a20';
        P(at(box(8, 5, 12), x, y + 2.5, z, ry), wood);
        let yy = y + 5;
        for (let t = 0; t < 3; t++) {
          const w = 9 - t * 2.6;
          const rg = new THREE.ConeGeometry(w * 0.8, 3.4 - t * 0.6, 4);
          P(at(rg, x, yy + 1.4, z, ry + Math.PI / 4), '#2a2420');
          yy += 2.6;
          if (t < 2) P(at(box(w * 0.55, 2.2, w * 0.55), x, yy + 0.8, z, ry), wood);
          yy += 1.0;
        }
        P(at(new THREE.ConeGeometry(0.9, 6, 6), x, yy + 3, z), '#2a2420');
        this.addCollider(x, z, 4.5, 6.5, ry);
        break;
      }
      case 'boathouses':
      case 'harbor': {
        const s = shore();
        if (s) {
          const ang = s.ang;
          const nx = Math.cos(ang);
          const nz = Math.sin(ang);
          const tx = -nz;
          const tz = nx;
          // píer
          for (let k = 0; k < 12; k++) {
            const px = s.x + nx * (k * 3 - 6);
            const pz = s.z + nz * (k * 3 - 6);
            P(at(box(3.2, 0.25, 3.2), px, s.level + 1.1, pz, -ang), '#6a5038');
            if (k % 2 === 0)
              for (const sd of [-1, 1]) P(at(cyl(0.15, 0.15, 4, 6), px + tx * sd * 1.4, s.level - 0.5, pz + tz * sd * 1.4), '#4a3828');
          }
          // casas de barco / casinhas coloridas na orla
          for (let k = -3; k <= 3; k++) {
            if (k === 0) continue;
            const bx = s.x - nx * 8 + tx * k * 9;
            const bz = s.z - nz * 8 + tz * k * 9;
            const gy = Math.max(this.gen.height(bx, bz), s.level + 0.3);
            const col = c.landmark === 'boathouses' ? rng.pick(['#9b2a22', '#a8322a', '#d8a83a', '#f2f0ea']) : rng.pick(['#e8c890', '#d86a50', '#f0dc80', '#7aa8c8', '#e8a0a0']);
            if (placed.some((p) => Math.hypot(p[0] - bx, p[1] - bz) < p[2] + 4)) continue;
            const q = this.gen.roadQuery(bx, bz, 30);
            if (q && q.dist < q.hw + 5) continue;
            placed.push([bx, bz, 4]);
            const yaw = Math.atan2(nx, nz);
            this.house(mb, rb, det, { x: bx, y: gy, z: bz, yaw, w: 6, d: 9, floors: c.landmark === 'harbor' ? 2 : 1, wall: col, roof: c.landmark === 'harbor' ? '#b05a32' : '#2a2a2c', roofType: c.landmark === 'harbor' ? 'hip' : 'gable', uoff: rng.int(0, 7) / 8, style: c.style });
            this.addCollider(bx, bz, 3, 4.5, yaw);
          }
          // barcos
          this.boats = this.boats || [];
          for (let k = 0; k < 5; k++) {
            const bx = s.x + nx * rng.float(12, 40) + tx * rng.float(-25, 25);
            const bz = s.z + nz * rng.float(12, 40) + tz * rng.float(-25, 25);
            const hull = new THREE.CylinderGeometry(0.01, 1.2, 6, 10, 1);
            hull.rotateX(Math.PI / 2);
            hull.scale(1, 0.55, 1);
            const hcol = rng.pick(['#f4f4f0', '#2a5a9a', '#c83a2a', '#3a7a4a']);
            const bg = merge([paint(hull, hcol), paint(at(box(1.4, 1.0, 1.6), 0, 0.7, -0.8), '#f0f0e8'), paint(at(cyl(0.05, 0.05, 5, 6), 0, 2.5, 0.6), '#d0d0d0')]);
            const bm = new THREE.Mesh(bg, this.detailMat);
            bm.position.set(bx, s.level + 0.2, bz);
            bm.rotation.y = rng.float(0, Math.PI * 2);
            bm.castShadow = true;
            group.add(bm);
            this.boats.push({ m: bm, ph: rng.float(0, 6), y: s.level + 0.2 });
          }
        }
        if (c.landmark === 'harbor') {
          const [x, z] = spot(5, 40, 80);
          tower(x, z, 4.5, 16, '#e8c890', '#b05a32');
        }
        break;
      }
      case 'steeple':
      case 'whitechurch':
      case 'twintowers': {
        const [x, z, ry] = spot(10, 40, 70);
        const white = c.landmark === 'twintowers' ? '#f2d060' : '#f6f4ee';
        const trim = c.landmark === 'whitechurch' ? '#2a5aa8' : c.landmark === 'twintowers' ? '#e8e0c8' : '#d0c8b8';
        P(at(box(11, 9, 20), x, y + 4.5, z, ry), white);
        // telhado da nave
        const nave = new THREE.CylinderGeometry(0.01, 6.6, 20.4, 4, 1);
        nave.rotateX(Math.PI / 2);
        nave.rotateZ(Math.PI / 4);
        nave.scale(1.18, 0.62, 1);
        P(at(nave, x, y + 11.2, z, ry), c.landmark === 'steeple' ? '#3a3a3c' : '#b05a32');
        const fx = Math.sin(ry);
        const fz = Math.cos(ry);
        const rx = Math.cos(ry);
        const rz = -Math.sin(ry);
        if (c.landmark === 'twintowers') {
          for (const sd of [-1, 1]) {
            const tx = x + fx * 10 + rx * sd * 4.5;
            const tz = z + fz * 10 + rz * sd * 4.5;
            P(at(box(4, 20, 4), tx, y + 10, tz, ry), white);
            P(at(box(4.4, 0.5, 4.4), tx, y + 20.2, tz, ry), trim);
            P(at(new THREE.SphereGeometry(2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), tx, y + 20.4, tz), '#3a7aa8');
            P(at(cyl(0.08, 0.08, 2, 6), tx, y + 23.2, tz), '#d8c060', true);
          }
          const dome = new THREE.SphereGeometry(5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
          P(at(dome, x - fx * 4, y + 12, z - fz * 4), '#3a7aa8');
        } else {
          const tx = x + fx * 10;
          const tz = z + fz * 10;
          const th = c.landmark === 'steeple' ? 22 : 15;
          P(at(box(4.5, th, 4.5), tx, y + th / 2, tz, ry), white);
          P(at(box(4.9, 0.5, 4.9), tx, y + th, tz, ry), trim);
          P(at(new THREE.ConeGeometry(3.2, c.landmark === 'steeple' ? 14 : 5, 4), tx, y + th + (c.landmark === 'steeple' ? 7 : 2.5), tz, ry + Math.PI / 4), c.landmark === 'steeple' ? '#3a4a3a' : trim);
          // relógio
          const clock = cyl(1.1, 1.1, 0.1, 20);
          clock.rotateX(Math.PI / 2);
          P(at(clock, tx + fx * 2.3, y + th - 3, tz + fz * 2.3, ry), '#f8f6f0');
          P(at(box(2.2, 3.6, 0.2), x + fx * 10.05 + fx * 2.2, y + 1.8, z + fz * 10.05 + fz * 2.2, ry), '#5a3a22');
        }
        this.addCollider(x, z, 6, 11, ry);
        break;
      }
      case 'clocktower': {
        const [x, z, ry] = spot(5, 35, 60);
        P(at(box(5.5, 24, 5.5), x, y + 12, z, ry), '#f2ece0');
        P(at(box(6, 4, 6), x, y + 22, z, ry), '#c8b89a');
        for (let k = 0; k < 4; k++) {
          const a = ry + (k * Math.PI) / 2;
          const clock = cyl(1.4, 1.4, 0.1, 24);
          clock.rotateX(Math.PI / 2);
          P(at(clock, x + Math.sin(a) * 3.05, y + 22, z + Math.cos(a) * 3.05, a), '#1a2a4a');
          P(at(box(0.15, 1.1, 0.12), x + Math.sin(a) * 3.12, y + 22.3, z + Math.cos(a) * 3.12, a), '#e8c860', true);
        }
        P(at(new THREE.ConeGeometry(4.6, 8, 4), x, y + 28, z, ry + Math.PI / 4), '#5a3a2a');
        this.addCollider(x, z, 2.8, 2.8, ry);
        break;
      }
      case 'campanile': {
        const [x, z, ry] = spot(14, 40, 75);
        // torre de tijolos
        P(at(box(6, 34, 6), x, y + 17, z, ry), '#b8653e');
        for (let k = 0; k < 4; k++) {
          const a = ry + (k * Math.PI) / 2;
          P(at(box(2.2, 4, 0.3), x + Math.sin(a) * 3.0, y + 30, z + Math.cos(a) * 3.0, a), '#2a2018');
        }
        P(at(box(6.6, 0.6, 6.6), x, y + 33, z, ry), '#e8dcc8');
        P(at(new THREE.ConeGeometry(4.4, 6, 4), x, y + 37.3, z, ry + Math.PI / 4), '#a8502c');
        this.addCollider(x, z, 3, 3, ry);
        // duomo
        const dx = x + Math.cos(ry) * 16;
        const dz = z - Math.sin(ry) * 16;
        P(at(box(14, 12, 22), dx, y + 6, dz, ry), '#f0e8d8');
        P(at(cyl(5, 5, 4, 16), dx, y + 14, dz), '#f0e8d8');
        P(at(new THREE.SphereGeometry(5.2, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), dx, y + 16, dz), '#b8653e');
        P(at(cyl(0.6, 0.8, 2, 8), dx, y + 21.6, dz), '#f0e8d8');
        this.addCollider(dx, dz, 7, 11, ry);
        break;
      }
      case 'lighthouse':
      case 'stripedlighthouse': {
        const s = shore();
        let x = c.x + 80;
        let z = c.z;
        if (s) {
          x = s.x - Math.cos(s.ang) * 14;
          z = s.z - Math.sin(s.ang) * 14;
        }
        const gy = Math.max(this.gen.height(x, z), 1.5);
        const H = 22;
        for (let k = 0; k < 8; k++) {
          const r0 = 2.6 - (k / 8) * 1.0;
          const r1 = 2.6 - ((k + 1) / 8) * 1.0;
          const col = c.landmark === 'stripedlighthouse' ? (k % 2 ? '#c8281e' : '#f6f4ee') : '#f6f4ee';
          P(at(cyl(r1, r0, H / 8, 18), x, gy + (k + 0.5) * (H / 8), z), col);
        }
        P(at(cyl(2.1, 2.1, 0.4, 18), x, gy + H + 0.2, z), '#2a2a2a', true);
        const lan = cyl(1.2, 1.2, 2.2, 14);
        xf(lan, x, gy + H + 1.5, z);
        this.lighthouseLamp = this.lighthouseLamp || [];
        const lm = new THREE.Mesh(lan, new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xffe8a0, emissiveIntensity: 0.2, transparent: true, opacity: 0.85 }));
        group.add(lm);
        this.lighthouseLamp.push(lm);
        P(at(new THREE.ConeGeometry(1.5, 1.6, 14), x, gy + H + 3.4, z), c.landmark === 'stripedlighthouse' ? '#c8281e' : '#2a2a2a');
        this.addCollider(x, z, 2.6, 2.6, 0);
        // quiosques / palapas na praia
        if (s) {
          for (let k = 0; k < 6; k++) {
            const a = s.ang + Math.PI / 2;
            const px = s.x + Math.cos(a) * (k - 2.5) * 14 - Math.cos(s.ang) * 3;
            const pz = s.z + Math.sin(a) * (k - 2.5) * 14 - Math.sin(s.ang) * 3;
            const py = Math.max(this.gen.height(px, pz), 0.6);
            P(at(cyl(0.12, 0.12, 2.6, 6), px, py + 1.3, pz), '#7a5a3a');
            P(at(new THREE.ConeGeometry(2.6, 1.3, 12), px, py + 3.0, pz), '#c8a868');
            P(at(box(1.6, 0.08, 1.6), px, py + 0.75, pz), '#e8e0d0');
          }
        }
        break;
      }
    }
  }

  update(cam, night, t) {
    const lampOn = night > 0.35 ? 1 : 0;
    this.lampMat.emissiveIntensity = lampOn * 2.4;
    this.glowMat.opacity = lampOn * 0.85;
    for (const m of this.winMats) m.emissiveIntensity = night * 1.25;
    if (this.lighthouseLamp) for (const l of this.lighthouseLamp) l.material.emissiveIntensity = 0.3 + night * 4 * (0.6 + 0.4 * Math.sin(t * 2));
    if (this.boats)
      for (const b of this.boats) {
        b.m.position.y = b.y + Math.sin(t * 0.9 + b.ph) * 0.12;
        b.m.rotation.z = Math.sin(t * 0.7 + b.ph) * 0.04;
      }
    for (const g of this.groups) {
      const d = Math.hypot(g.city.x - cam.x, g.city.z - cam.z);
      g.group.visible = d < this.Q.cityDist;
    }
  }
}
