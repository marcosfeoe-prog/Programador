// Texturas procedurais (canvas 2D): solo, pedras, madeira, reboco, telhas, ferrugem,
// tecidos, pele, grama, sprites de brilho/fogo e placas. Nenhum arquivo de imagem.
import * as THREE from 'three';
import { makeFbm, Rng, clamp } from './util.js';

let ANISO = 4;
export function setAnisotropy(a) {
  ANISO = Math.max(1, Math.min(8, a | 0));
}

const cache = new Map();
export function tex(name) {
  let t = cache.get(name);
  if (!t) {
    const make = MAKERS[name];
    if (!make) throw new Error('Textura desconhecida: ' + name);
    t = make();
    cache.set(name, t);
  }
  return t;
}

function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function finish(c, { srgb = true, repeat = true, mips = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = ANISO;
  if (!mips) {
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
  }
  t.needsUpdate = true;
  return t;
}

function fillPixels(g, w, h, fn) {
  const img = g.createImageData(w, h);
  const d = img.data;
  const o = [0, 0, 0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      fn(x / w, y / h, o, x, y);
      const i = (y * w + x) * 4;
      d[i] = o[0];
      d[i + 1] = o[1];
      d[i + 2] = o[2];
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}

// Multiplica a imagem atual por um ruído (dá textura a pinturas lisas).
function noiseMultiply(g, S, fbm, amount, offset = 0) {
  const img = g.getImageData(0, 0, S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const k = 1 - amount * 0.5 + amount * fbm(x / S + offset, y / S) ;
      const i = (y * S + x) * 4;
      d[i] *= k;
      d[i + 1] *= k;
      d[i + 2] *= k;
    }
  }
  g.putImageData(img, 0, 0);
}

// Desenha também as cópias nas bordas para a textura repetir sem emenda.
function wrapped(S, x, y, r, draw) {
  draw(x, y);
  if (x < r) draw(x + S, y);
  if (x > S - r) draw(x - S, y);
  if (y < r) draw(x, y + S);
  if (y > S - r) draw(x, y - S);
  if (x < r && y < r) draw(x + S, y + S);
  if (x > S - r && y > S - r) draw(x - S, y - S);
  if (x < r && y > S - r) draw(x + S, y - S);
  if (x > S - r && y < r) draw(x - S, y + S);
}

function rrect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

const rgb = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;

// Linhas de pedra/tijolo com larguras que somam exatamente S (repete sem emenda).
function rowLayout(rng, S, minW, maxW) {
  const ws = [];
  let sum = 0;
  while (sum < S) {
    const w = rng.range(minW, maxW);
    ws.push(w);
    sum += w;
  }
  const k = S / sum;
  const off = rng.next() * S;
  const out = [];
  let x = off;
  for (const w of ws) {
    out.push([x, w * k]);
    x += w * k;
  }
  return out;
}

const MAKERS = {
  dirt() {
    const S = 512,
      c = mk(S, S),
      g = c.getContext('2d', { willReadFrequently: true }),
      rng = new Rng(101);
    const n1 = makeFbm(6, 6, rng),
      n2 = makeFbm(3, 3, rng),
      n3 = makeFbm(32, 2, rng);
    fillPixels(g, S, S, (u, v, o) => {
      const a = n1(u, v),
        b = n2(u, v),
        f = n3(u, v) - 0.5;
      const t = clamp((a - 0.3) * 1.6, 0, 1);
      const wet = clamp((b - 0.56) * 4, 0, 1) * 0.42;
      o[0] = (54 + t * 40 + f * 26) * (1 - wet);
      o[1] = (47 + t * 33 + f * 22) * (1 - wet);
      o[2] = (38 + t * 25 + f * 16) * (1 - wet * 0.8);
    });
    for (let i = 0; i < 1500; i++) {
      const x = rng.next() * S,
        y = rng.next() * S;
      const r = 0.7 + rng.next() ** 2 * 3.4;
      const ry = r * (0.55 + rng.next() * 0.45),
        rot = rng.next() * 3;
      const l = rng.next();
      const col =
        l < 0.45
          ? rgb(22, 19, 16, 0.55 + rng.next() * 0.3)
          : l < 0.9
            ? rgb(100 + rng.int(0, 30), 92 + rng.int(0, 25), 80 + rng.int(0, 20), 0.75)
            : rgb(140, 132, 118, 0.8);
      g.fillStyle = col;
      wrapped(S, x, y, r + 2, (px, py) => {
        g.beginPath();
        g.ellipse(px, py, r, ry, rot, 0, Math.PI * 2);
        g.fill();
      });
    }
    return finish(c);
  },

  cobble() {
    const S = 512,
      c = mk(S, S),
      g = c.getContext('2d', { willReadFrequently: true }),
      rng = new Rng(202);
    g.fillStyle = '#1c1a17';
    g.fillRect(0, 0, S, S);
    const rows = 9,
      rh = S / rows;
    for (let r = 0; r < rows; r++) {
      const y = r * rh;
      for (const [x, w] of rowLayout(rng, S, 40, 74)) {
        const sh = rng.range(0.72, 1.12);
        const base = [96 * sh, 92 * sh, 84 * sh];
        const jx = rng.range(-2, 2),
          jy = rng.range(-2, 2);
        for (const ox of [0, -S]) {
          const px = x + ox + 3 + jx,
            py = y + 3 + jy,
            pw = w - 6,
            ph = rh - 6;
          rrect(g, px, py, pw, ph, 12);
          g.fillStyle = rgb(base[0], base[1], base[2]);
          g.fill();
          // luz em cima, sombra embaixo
          const grd = g.createLinearGradient(0, py, 0, py + ph);
          grd.addColorStop(0, 'rgba(255,255,255,0.12)');
          grd.addColorStop(0.5, 'rgba(0,0,0,0)');
          grd.addColorStop(1, 'rgba(0,0,0,0.35)');
          g.fillStyle = grd;
          g.fill();
        }
      }
    }
    noiseMultiply(g, S, makeFbm(16, 4, rng), 0.55);
    return finish(c);
  },

  planks() {
    const S = 512,
      c = mk(S, S),
      g = c.getContext('2d', { willReadFrequently: true }),
      rng = new Rng(303);
    const n = 8,
      pw = S / n;
    const base = [],
      lines = [];
    for (let i = 0; i < n; i++) {
      const k = rng.range(0.7, 1.15);
      base.push([78 * k, 62 * k, 48 * k]);
      const arr = new Float32Array(Math.ceil(pw));
      for (let j = 0; j < arr.length; j++) arr[j] = rng.range(0.82, 1.08);
      // linhas de veio mais escuras
      for (let k2 = 0; k2 < 6; k2++) {
        const p = rng.int(2, arr.length - 3);
        arr[p] *= 0.72;
        arr[p + 1] *= 0.85;
      }
      lines.push(arr);
    }
    const nf = makeFbm(8, 4, rng),
      nv = makeFbm(4, 2, rng);
    fillPixels(g, S, S, (u, v, o, x) => {
      const i = Math.floor(x / pw),
        lx = x - i * pw;
      const b = base[i],
        gr = lines[i][Math.min(lines[i].length - 1, Math.floor(lx))];
      const f = 0.78 + nf(u, v) * 0.4,
        w = 0.85 + nv(u, v) * 0.3;
      let k = gr * f * w;
      if (lx < 2 || lx > pw - 2) k *= 0.35;
      o[0] = b[0] * k;
      o[1] = b[1] * k;
      o[2] = b[2] * k;
    });
    for (let i = 0; i < 10; i++) {
      const x = rng.next() * S,
        y = rng.next() * S,
        r = rng.range(3, 7);
      g.fillStyle = 'rgba(30,20,12,0.6)';
      wrapped(S, x, y, r * 2, (px, py) => {
        g.beginPath();
        g.ellipse(px, py, r * 0.7, r * 1.6, 0, 0, Math.PI * 2);
        g.fill();
      });
    }
    return finish(c);
  },

  stone() {
    const S = 512,
      c = mk(S, S),
      g = c.getContext('2d', { willReadFrequently: true }),
      rng = new Rng(404);
    g.fillStyle = '#26231f';
    g.fillRect(0, 0, S, S);
    const rows = 6,
      rh = S / rows;
    for (let r = 0; r < rows; r++) {
      const y = r * rh;
      for (const [x, w] of rowLayout(rng, S, 90, 170)) {
        const sh = rng.range(0.75, 1.1);
        const col = [104 * sh, 100 * sh, 92 * sh];
        for (const ox of [0, -S]) {
          const px = x + ox + 2.5,
            py = y + 2.5;
          rrect(g, px, py, w - 5, rh - 5, 5);
          g.fillStyle = rgb(col[0], col[1], col[2]);
          g.fill();
          const grd = g.createLinearGradient(0, py, 0, py + rh);
          grd.addColorStop(0, 'rgba(255,255,255,0.08)');
          grd.addColorStop(1, 'rgba(0,0,0,0.28)');
          g.fillStyle = grd;
          g.fill();
        }
      }
    }
    noiseMultiply(g, S, makeFbm(12, 5, rng), 0.6);
    // manchas de musgo e umidade
    const moss = makeFbm(4, 4, rng);
    const img = g.getImageData(0, 0, S, S),
      d = img.data;
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const m = clamp((moss(x / S, y / S) - 0.55) * 4, 0, 1) * 0.5;
        const i = (y * S + x) * 4;
        d[i] = d[i] * (1 - m) + 40 * m;
        d[i + 1] = d[i + 1] * (1 - m) + 52 * m;
        d[i + 2] = d[i + 2] * (1 - m) + 30 * m;
      }
    g.putImageData(img, 0, 0);
    return finish(c);
  },

  plaster() {
    const S = 512,
      c = mk(S, S),
      g = c.getContext('2d', { willReadFrequently: true }),
      rng = new Rng(505);
    const n1 = makeFbm(4, 6, rng),
      n2 = makeFbm(10, 3, rng);
    fillPixels(g, S, S, (u, v, o) => {
      const a = n1(u, v),
        b = n2(u, v);
      const stain = clamp((a - 0.5) * 2.2, 0, 1);
      const k = 0.86 + (b - 0.5) * 0.18;
      o[0] = (176 - stain * 70) * k;
      o[1] = (162 - stain * 66) * k;
      o[2] = (138 - stain * 60) * k;
    });
    // reboco caído mostrando tijolos (poucos e irregulares)
    for (let i = 0; i < 2; i++) {
      const x = rng.next() * S,
        y = rng.next() * S,
        w = rng.range(70, 150),
        h = rng.range(26, 54);
      wrapped(S, x, y, Math.max(w, h), (px, py) => {
        g.save();
        g.beginPath();
        g.ellipse(px, py, w / 2, h / 2, 0, 0, Math.PI * 2);
        g.clip();
        g.fillStyle = '#4a2f24';
        g.fillRect(px - w, py - h, w * 2, h * 2);
        g.fillStyle = '#6e4232';
        for (let by = py - h; by < py + h; by += 12) {
          const off = ((by / 12) | 0) % 2 ? 0 : 12;
          for (let bx = px - w - off; bx < px + w; bx += 24) g.fillRect(bx + 1, by + 1, 22, 10);
        }
        g.restore();
      });
    }
    // rachaduras
    g.strokeStyle = 'rgba(40,32,26,0.55)';
    for (let i = 0; i < 14; i++) {
      let x = rng.next() * S,
        y = rng.next() * S;
      g.lineWidth = rng.range(0.6, 1.6);
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 9; k++) {
        x += rng.range(-14, 14);
        y += rng.range(4, 16);
        g.lineTo(x, y);
      }
      g.stroke();
    }
    return finish(c);
  },

  roof() {
    const S = 256,
      c = mk(S, S),
      g = c.getContext('2d', { willReadFrequently: true }),
      rng = new Rng(606);
    g.fillStyle = '#2a1712';
    g.fillRect(0, 0, S, S);
    const rows = 8,
      rh = S / rows,
      cols = 8,
      cw = S / cols;
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k <= cols; k++) {
        const x = k * cw + (r % 2 ? cw / 2 : 0) - cw / 2;
        const sh = rng.range(0.7, 1.1);
        const col = [118 * sh, 60 * sh, 40 * sh];
        for (const ox of [0, -S, S]) {
          const px = x + ox;
          const grd = g.createLinearGradient(px, 0, px + cw, 0);
          grd.addColorStop(0, rgb(col[0] * 0.55, col[1] * 0.55, col[2] * 0.55));
          grd.addColorStop(0.45, rgb(col[0], col[1], col[2]));
          grd.addColorStop(1, rgb(col[0] * 0.5, col[1] * 0.5, col[2] * 0.5));
          g.fillStyle = grd;
          rrect(g, px + 1, r * rh, cw - 2, rh + 4, 6);
          g.fill();
        }
      }
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillRect(0, r * rh + rh - 3, S, 3);
    }
    noiseMultiply(g, S, makeFbm(8, 4, rng), 0.5);
    // musgo escuro
    const moss = makeFbm(3, 4, rng);
    const img = g.getImageData(0, 0, S, S),
      d = img.data;
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const m = clamp((moss(x / S, y / S) - 0.5) * 3, 0, 1) * 0.55;
        const i = (y * S + x) * 4;
        d[i] = d[i] * (1 - m) + 34 * m;
        d[i + 1] = d[i + 1] * (1 - m) + 38 * m;
        d[i + 2] = d[i + 2] * (1 - m) + 24 * m;
      }
    g.putImageData(img, 0, 0);
    return finish(c);
  },

  rust() {
    const S = 256,
      c = mk(S, S),
      g = c.getContext('2d', { willReadFrequently: true }),
      rng = new Rng(707);
    const n1 = makeFbm(4, 6, rng),
      n2 = makeFbm(16, 3, rng);
    fillPixels(g, S, S, (u, v, o) => {
      const a = n1(u, v),
        b = n2(u, v);
      const r = clamp((a - 0.42) * 3.2, 0, 1);
      const k = 0.8 + b * 0.4;
      o[0] = (56 * (1 - r) + 128 * r) * k;
      o[1] = (52 * (1 - r) + 58 * r) * k;
      o[2] = (50 * (1 - r) + 28 * r) * k;
    });
    for (let i = 0; i < 260; i++) {
      g.fillStyle = rgb(30, 18, 12, 0.5);
      const x = rng.next() * S,
        y = rng.next() * S,
        r = rng.range(0.6, 2);
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    return finish(c);
  },

  metal() {
    const S = 256,
      c = mk(S, S),
      g = c.getContext('2d', { willReadFrequently: true }),
      rng = new Rng(808);
    const n1 = makeFbm(6, 5, rng);
    fillPixels(g, S, S, (u, v, o) => {
      const a = n1(u, v);
      const r = clamp((a - 0.6) * 4, 0, 1);
      o[0] = 44 + a * 26 + r * 50;
      o[1] = 44 + a * 24 + r * 16;
      o[2] = 46 + a * 22;
    });
    g.strokeStyle = 'rgba(160,160,160,0.12)';
    for (let i = 0; i < 70; i++) {
      const x = rng.next() * S,
        y = rng.next() * S,
        l = rng.range(6, 30),
        a = rng.next() * Math.PI;
      g.lineWidth = rng.range(0.4, 1);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    }
    return finish(c);
  },

  bark() {
    const S = 256,
      c = mk(S, S),
      g = c.getContext('2d', { willReadFrequently: true }),
      rng = new Rng(909);
    const cols = new Float32Array(S);
    for (let i = 0; i < S; i++) cols[i] = rng.range(0.75, 1.1);
    for (let k = 0; k < 40; k++) {
      const p = rng.int(0, S - 1);
      cols[p] *= 0.5;
    }
    const nf = makeFbm(8, 4, rng);
    fillPixels(g, S, S, (u, v, o, x) => {
      const k = cols[x] * (0.7 + nf(u, v) * 0.6);
      o[0] = 62 * k;
      o[1] = 56 * k;
      o[2] = 50 * k;
    });
    return finish(c);
  },

  fabric() {
    const S = 128,
      c = mk(S, S),
      g = c.getContext('2d', { willReadFrequently: true }),
      rng = new Rng(1001);
    const nf = makeFbm(8, 4, rng);
    fillPixels(g, S, S, (u, v, o, x, y) => {
      const weave = (x + y) % 2 === 0 ? 1 : 0.9;
      const k = (0.7 + nf(u, v) * 0.45) * weave;
      o[0] = o[1] = o[2] = 235 * k;
    });
    return finish(c);
  },

  skin() {
    const S = 128,
      c = mk(S, S),
      g = c.getContext('2d', { willReadFrequently: true }),
      rng = new Rng(1102);
    const n1 = makeFbm(4, 5, rng),
      n2 = makeFbm(8, 3, rng);
    fillPixels(g, S, S, (u, v, o) => {
      const a = n1(u, v),
        b = n2(u, v);
      const vein = clamp(1 - Math.abs(b - 0.5) * 18, 0, 1) * 0.6;
      const k = 0.82 + a * 0.3;
      o[0] = 240 * k;
      o[1] = 236 * k * (1 - vein * 0.55);
      o[2] = 232 * k * (1 - vein * 0.75);
    });
    return finish(c);
  },

  // Pele infectada: veias cor de ferrugem bem marcadas.
  skinRust() {
    const S = 128,
      c = mk(S, S),
      g = c.getContext('2d', { willReadFrequently: true }),
      rng = new Rng(1203);
    const n1 = makeFbm(4, 5, rng),
      n2 = makeFbm(6, 4, rng),
      n3 = makeFbm(3, 3, rng);
    fillPixels(g, S, S, (u, v, o) => {
      const a = n1(u, v),
        b = n2(u, v),
        p = n3(u, v);
      const vein = clamp(1 - Math.abs(b - 0.5) * 12, 0, 1);
      const patch = clamp((p - 0.55) * 3, 0, 1);
      const k = 0.78 + a * 0.32;
      const rr = Math.max(vein, patch * 0.8);
      o[0] = 236 * k * (1 - rr * 0.25);
      o[1] = 230 * k * (1 - rr * 0.68);
      o[2] = 226 * k * (1 - rr * 0.85);
    });
    return finish(c);
  },

  grass() {
    const S = 128,
      c = mk(S, S),
      g = c.getContext('2d', { willReadFrequently: true }),
      rng = new Rng(1304);
    g.clearRect(0, 0, S, S);
    const cols = ['#6d6a3c', '#857a48', '#53582f', '#7c7046', '#5e5233', '#9a8c58'];
    for (let i = 0; i < 46; i++) {
      const x = rng.range(8, S - 8),
        h = rng.range(S * 0.45, S * 0.98),
        bend = rng.range(-26, 26),
        w = rng.range(1.5, 3.6);
      g.fillStyle = rng.pick(cols);
      g.beginPath();
      g.moveTo(x - w, S);
      g.quadraticCurveTo(x + bend * 0.3, S - h * 0.5, x + bend, S - h);
      g.quadraticCurveTo(x + bend * 0.3 + w * 0.3, S - h * 0.5, x + w, S);
      g.closePath();
      g.fill();
    }
    return finish(c, { repeat: false });
  },

  glow() {
    const S = 64,
      c = mk(S, S),
      g = c.getContext('2d');
    const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grd.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    return finish(c, { repeat: false });
  },

  flame() {
    const W = 64,
      H = 128,
      c = mk(W, H),
      g = c.getContext('2d');
    const grd = g.createRadialGradient(W / 2, H * 0.72, 2, W / 2, H * 0.62, H * 0.5);
    grd.addColorStop(0, 'rgba(255,250,220,1)');
    grd.addColorStop(0.25, 'rgba(255,200,90,0.95)');
    grd.addColorStop(0.55, 'rgba(240,100,30,0.55)');
    grd.addColorStop(1, 'rgba(120,30,10,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(W / 2, 2);
    g.bezierCurveTo(W * 0.95, H * 0.45, W * 0.98, H * 0.95, W / 2, H - 2);
    g.bezierCurveTo(W * 0.02, H * 0.95, W * 0.05, H * 0.45, W / 2, 2);
    g.fill();
    return finish(c, { repeat: false });
  },

  flash() {
    const S = 128,
      c = mk(S, S),
      g = c.getContext('2d');
    g.translate(S / 2, S / 2);
    for (let i = 0; i < 7; i++) {
      g.rotate((Math.PI * 2) / 7 + Math.random() * 0.2);
      const len = S * (0.32 + Math.random() * 0.16);
      const grd = g.createLinearGradient(0, 0, len, 0);
      grd.addColorStop(0, 'rgba(255,240,200,1)');
      grd.addColorStop(1, 'rgba(255,160,60,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(0, -5);
      g.lineTo(len, 0);
      g.lineTo(0, 5);
      g.fill();
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.3);
    grd.addColorStop(0, 'rgba(255,255,240,1)');
    grd.addColorStop(1, 'rgba(255,190,90,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    return finish(c, { repeat: false });
  },

  hole() {
    const S = 64,
      c = mk(S, S),
      g = c.getContext('2d', { willReadFrequently: true }),
      rng = new Rng(1405);
    const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grd.addColorStop(0, 'rgba(8,6,5,1)');
    grd.addColorStop(0.35, 'rgba(15,12,10,0.95)');
    grd.addColorStop(0.55, 'rgba(30,26,22,0.5)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(20,16,12,0.6)';
    for (let i = 0; i < 6; i++) {
      const a = rng.next() * Math.PI * 2;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(S / 2 + Math.cos(a) * 8, S / 2 + Math.sin(a) * 8);
      g.lineTo(S / 2 + Math.cos(a) * rng.range(16, 28), S / 2 + Math.sin(a) * rng.range(16, 28));
      g.stroke();
    }
    return finish(c, { repeat: false });
  },

  splat() {
    const S = 128,
      c = mk(S, S),
      g = c.getContext('2d', { willReadFrequently: true }),
      rng = new Rng(1506);
    g.fillStyle = 'rgba(255,255,255,1)';
    for (let i = 0; i < 14; i++) {
      const a = rng.next() * Math.PI * 2,
        d = rng.range(0, S * 0.22),
        r = rng.range(S * 0.06, S * 0.18);
      g.beginPath();
      g.arc(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, r, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 16; i++) {
      const a = rng.next() * Math.PI * 2,
        d = rng.range(S * 0.25, S * 0.46),
        r = rng.range(1.5, 4.5);
      g.beginPath();
      g.arc(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, r, 0, Math.PI * 2);
      g.fill();
    }
    return finish(c, { repeat: false });
  },

  water() {
    const S = 256,
      c = mk(S, S),
      g = c.getContext('2d', { willReadFrequently: true }),
      rng = new Rng(1607);
    const n1 = makeFbm(4, 5, rng),
      n2 = makeFbm(8, 3, rng);
    fillPixels(g, S, S, (u, v, o) => {
      const a = n1(u, v),
        b = n2(u, v);
      const line = clamp(1 - Math.abs(a - 0.5) * 14, 0, 1) * 0.6 + clamp(1 - Math.abs(b - 0.5) * 18, 0, 1) * 0.3;
      o[0] = 10 + line * 50;
      o[1] = 16 + line * 58;
      o[2] = 20 + line * 62;
    });
    return finish(c);
  },

  paper() {
    const S = 128,
      c = mk(S, S),
      g = c.getContext('2d', { willReadFrequently: true }),
      rng = new Rng(1708);
    g.fillStyle = '#d8cdb3';
    g.fillRect(0, 0, S, S);
    g.fillStyle = 'rgba(60,40,30,0.55)';
    for (let y = 18; y < S - 12; y += 9) {
      const w = rng.range(S * 0.5, S * 0.8);
      g.fillRect(14, y, w, 2);
    }
    g.fillStyle = 'rgba(120,30,20,0.35)';
    g.beginPath();
    g.arc(S * 0.75, S * 0.8, 9, 0, Math.PI * 2);
    g.fill();
    return finish(c, { repeat: false });
  },

  moon() {
    const S = 128,
      c = mk(S, S),
      g = c.getContext('2d', { willReadFrequently: true }),
      rng = new Rng(1809);
    const grd = g.createRadialGradient(S / 2, S / 2, S * 0.18, S / 2, S / 2, S / 2);
    grd.addColorStop(0, 'rgba(220,226,240,0.9)');
    grd.addColorStop(0.32, 'rgba(160,175,205,0.25)');
    grd.addColorStop(1, 'rgba(120,140,180,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    g.fillStyle = '#e4e6ee';
    g.beginPath();
    g.arc(S / 2, S / 2, S * 0.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(150,155,170,0.5)';
    for (let i = 0; i < 9; i++) {
      const a = rng.next() * Math.PI * 2,
        d = rng.range(0, S * 0.14);
      g.beginPath();
      g.arc(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, rng.range(2, 6), 0, Math.PI * 2);
      g.fill();
    }
    return finish(c, { repeat: false });
  },

  sign() {
    const W = 512,
      H = 128,
      c = mk(W, H),
      g = c.getContext('2d', { willReadFrequently: true }),
      rng = new Rng(1910);
    g.fillStyle = '#4a3a2b';
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i % 2 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.04)';
      g.fillRect(0, i * 32, W, 32);
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(0, i * 32 + 31, W, 1);
    }
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(20,14,8,${rng.range(0.05, 0.2)})`;
      g.fillRect(rng.next() * W, rng.next() * H, rng.range(10, 60), 1);
    }
    g.font = 'bold 54px Georgia, "Times New Roman", serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillText('VALE DOS CORVOS', W / 2 + 2, H / 2 + 3);
    g.fillStyle = '#c9b48f';
    g.fillText('VALE DOS CORVOS', W / 2, H / 2);
    g.fillStyle = 'rgba(110,20,14,0.75)';
    g.save();
    g.translate(W * 0.78, H * 0.55);
    g.rotate(-0.4);
    g.fillRect(-60, -3, 120, 6);
    g.restore();
    return finish(c, { repeat: false });
  },
};

// Pré-gera as texturas usadas pelo cenário (chamado durante o carregamento).
export const WORLD_TEXTURES = ['dirt', 'cobble', 'planks', 'stone', 'plaster', 'roof', 'rust', 'metal', 'bark', 'fabric', 'skin', 'skinRust', 'grass', 'glow', 'flame', 'flash', 'hole', 'splat', 'water', 'paper', 'moon', 'sign'];
