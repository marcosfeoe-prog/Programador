// Texturas e sprites em pixel art, todos pintados por código (sem imagens).
import { rgba, hash2, tfbm, clamp } from './util.js';
import { forEachTextPixel, textWidth } from './font.js';

const cl = (v) => clamp(Math.round(v), 0, 255);

export class Tex {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint32Array(w * h);
    this.em = new Uint8Array(w * h); // brilho próprio (não depende de luz)
  }
  set(x, y, r, g, b, a = 255, e = 0) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    this.data[i] = rgba(cl(r), cl(g), cl(b), cl(a));
    this.em[i] = e;
  }
  get(x, y) {
    const c = this.data[y * this.w + x];
    return [c & 255, (c >> 8) & 255, (c >> 16) & 255, c >>> 24];
  }
  mul(x, y, m) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const [r, g, b, a] = this.get(x, y);
    if (!a) return;
    const i = y * this.w + x;
    this.data[i] = rgba(cl(r * m[0]), cl(g * m[1]), cl(b * m[2]), a);
  }
  fill(fn) {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const c = fn(x, y);
        if (c) this.set(x, y, c[0], c[1], c[2], c[3] ?? 255, c[4] || 0);
      }
    return this;
  }
  px(x, y, c) { this.set(x, y, c[0], c[1], c[2], c[3] ?? 255, c[4] || 0); }
  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
  }
  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.px(x, y, c);
      }
  }
  // Preenchimento de polígono por varredura de linhas.
  poly(pts, c) {
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    for (let y = Math.floor(minY); y <= maxY; y++) {
      const sy = y + 0.5, xs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= sy && b[1] > sy) || (b[1] <= sy && a[1] > sy))
          xs.push(a[0] + ((sy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.px(x, y, c);
    }
  }
  line(x0, y0, x1, y1, c, th = 1) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n;
      this.rect(Math.round(x - th / 2), Math.round(y - th / 2), th, th, c);
    }
  }
  // Contorno claro à esquerda e escuro à direita: dá volume a silhuetas.
  rim(light, dark) {
    const a = (x, y) => x >= 0 && y >= 0 && x < this.w && y < this.h && this.data[y * this.w + x] >>> 24;
    const marks = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (!a(x, y)) continue;
        if (!a(x - 1, y) || !a(x, y - 1)) marks.push([x, y, light]);
        else if (dark && (!a(x + 1, y) || !a(x, y + 1))) marks.push([x, y, dark]);
      }
    for (const [x, y, m] of marks) this.mul(x, y, m);
  }
}

// ---------- Nível 0: papel de parede amarelo, carpete, forro ----------

function wallpaper(seed, stained) {
  const t = new Tex(32, 32).fill((x, y) => {
    let r = 200, g = 182, b = 104;
    let m = 1 + (hash2(x, y, seed) - 0.5) * 0.07;
    if (x % 8 === 0) m *= 0.9;
    else if (x % 8 === 4) m *= 1.04;
    const yy = (y + (Math.floor(x / 8) % 2) * 4) % 8;
    if (Math.abs((x % 8) - 4) + Math.abs(yy - 4) === 3) m *= 0.91;
    const n = tfbm(x / 8, y / 8, 4, seed + 3);
    if (n > 0.58) m *= 1 - (n - 0.58) * 0.7;
    if (y === 0) m *= 0.62;
    else if (y === 1) m *= 0.84;
    if (y >= 27) {
      r = 150; g = 126; b = 70;
      m = 1 + (hash2(x, y, seed + 9) - 0.5) * 0.06;
      if (y === 27) m *= 1.18;
      if (y === 31) m *= 0.68;
    }
    return [r * m, g * m, b * m];
  });
  if (stained) {
    // escorridos de umidade descendo do forro
    for (let k = 0; k < 5; k++) {
      const cx = Math.floor(hash2(k, 1, seed) * 32);
      const len = 8 + Math.floor(hash2(k, 2, seed) * 18);
      const wd = 1 + Math.floor(hash2(k, 3, seed) * 3);
      for (let y = 0; y < len; y++) {
        const ww = y < 4 ? wd + 2 : wd;
        for (let i = 0; i < ww; i++) t.mul(cx - (ww >> 1) + i, y, y === len - 1 ? [0.7, 0.62, 0.5] : [0.82, 0.76, 0.64]);
      }
    }
  }
  return t;
}

function carpet(seed) {
  return new Tex(32, 32).fill((x, y) => {
    let m = 1 + (hash2(x, y, seed) - 0.5) * 0.22;
    if ((x + y) % 2 === 0) m *= 0.95;
    const n = tfbm(x / 8, y / 8, 4, seed + 1);
    m *= 0.82 + n * 0.36;
    return [150 * m, 128 * m, 66 * m];
  });
}

function dampCarpet(seed) {
  const t = new Tex(32, 32);
  t.fill((x, y) => {
    const dx = (x - 15.5) / 15, dy = (y - 15.5) / 13;
    const d = Math.sqrt(dx * dx + dy * dy) + (tfbm(x / 8, y / 8, 4, seed) - 0.5) * 0.6;
    if (d > 0.95) return null;
    const m = 0.62 + (hash2(x, y, seed + 2) - 0.5) * 0.1;
    return [150 * m, 126 * m, 60 * m, 255];
  });
  return t;
}

function ceilTile(seed, base, line) {
  return new Tex(32, 32).fill((x, y) => {
    let m = 1 + (hash2(x, y, seed) - 0.5) * 0.05;
    if (x % 4 === 2 && y % 4 === 2) m *= 0.86;
    const n = tfbm(x / 16, y / 16, 2, seed + 5);
    if (n > 0.62) m *= 1 - (n - 0.62) * 0.9;
    if (x === 0 || y === 0) return [line[0], line[1], line[2]];
    if (x === 31 || y === 31) m *= 0.9;
    return [base[0] * m, base[1] * m, base[2] * m];
  });
}

function lampPanel(seed) {
  const t = ceilTile(seed, [205, 200, 180], [150, 145, 130]);
  t.rect(5, 3, 22, 26, [175, 172, 160]);
  for (let y = 4; y < 28; y++)
    for (let x = 6; x < 26; x++) {
      const louver = y % 4 === 0;
      t.set(x, y, 255, louver ? 236 : 250, louver ? 200 : 226, 255, louver ? 170 : 255);
    }
  return t;
}

// ---------- Nível 1: concreto, caixas, poças ----------

function cinderBlock(seed) {
  return new Tex(32, 32).fill((x, y) => {
    const row = Math.floor(y / 8);
    const bx = (x + (row % 2) * 8) % 16;
    if (y % 8 === 0 || bx === 0) return [82, 82, 80];
    let m = 1 + (hash2(x, y, seed) - 0.5) * 0.14;
    m *= 0.85 + tfbm(x / 8, y / 8, 4, seed + 4) * 0.3;
    if (bx === 1 || y % 8 === 1) m *= 1.08;
    if (bx === 15 || y % 8 === 7) m *= 0.9;
    if (y > 24) m *= 1 - (y - 24) * 0.035;
    return [128 * m, 128 * m, 123 * m];
  });
}

function crates(seed) {
  const t = new Tex(32, 32);
  for (let k = 0; k < 2; k++) {
    const y0 = k * 16;
    t.fill((x, y) => {
      if (y < y0 || y >= y0 + 16) return null;
      const ly = y - y0;
      let m = 1 + (hash2(x, y, seed) - 0.5) * 0.1 + Math.sin(x * 0.9 + ly * 4 + k) * 0.04;
      if (ly % 5 === 0) m *= 0.78;
      return [146 * m, 104 * m, 60 * m];
    });
    t.rect(0, y0, 32, 2, [96, 66, 38]);
    t.rect(0, y0 + 14, 32, 2, [90, 62, 36]);
    t.rect(0, y0, 2, 16, [96, 66, 38]);
    t.rect(30, y0, 2, 16, [90, 62, 36]);
    t.line(3, y0 + 13, 28, y0 + 2, [170, 126, 76], 2);
    t.rect(13, y0 + 6, 6, 3, [40, 40, 44]);
  }
  return t;
}

function concrete(seed) {
  const t = new Tex(32, 32).fill((x, y) => {
    let m = 1 + (hash2(x, y, seed) - 0.5) * 0.12;
    m *= 0.8 + tfbm(x / 8, y / 8, 4, seed + 6) * 0.4;
    if (x === 0 || y === 0) m *= 0.6;
    return [110 * m, 110 * m, 106 * m];
  });
  // rachaduras
  let x = 6 + hash2(1, 1, seed) * 20, y = 0;
  while (y < 32) {
    t.mul(x, y, [0.62, 0.62, 0.62]);
    x += Math.round((hash2(Math.floor(y), 7, seed) - 0.5) * 2.4);
    y += 1;
  }
  return t;
}

function puddle(seed) {
  return new Tex(32, 32).fill((x, y) => {
    const dx = (x - 15.5) / 14, dy = (y - 15.5) / 12;
    const d = Math.sqrt(dx * dx + dy * dy) + (tfbm(x / 8, y / 8, 4, seed) - 0.5) * 0.7;
    if (d > 0.95) return null;
    const sheen = hash2(x, y, seed + 3) > 0.93 ? 1.6 : 1;
    const edge = d > 0.82 ? 0.8 : 1;
    return [52 * sheen * edge, 60 * sheen * edge, 70 * sheen * edge, 255, sheen > 1 ? 30 : 0];
  });
}

function darkConcreteCeil(seed) {
  return new Tex(32, 32).fill((x, y) => {
    let m = 1 + (hash2(x, y, seed) - 0.5) * 0.1;
    m *= 0.85 + tfbm(x / 8, y / 8, 4, seed + 2) * 0.3;
    if (y >= 12 && y <= 19) m *= y === 12 ? 1.2 : y === 19 ? 0.6 : 0.78;
    return [74 * m, 74 * m, 72 * m];
  });
}

function cagedBulb(seed) {
  const t = darkConcreteCeil(seed);
  t.ellipse(16, 16, 8, 8, [60, 60, 58]);
  t.ellipse(16, 16, 5.5, 5.5, [255, 244, 210, 255, 255]);
  t.ellipse(16, 16, 2.5, 2.5, [255, 255, 245, 255, 255]);
  for (let i = -7; i <= 7; i += 4) { t.line(16 + i, 8, 16 + i, 24, [50, 50, 48]); t.line(8, 16 + i, 24, 16 + i, [50, 50, 48]); }
  return t;
}

// ---------- Nível 2: canos, grades, luz vermelha ----------

function pipeWall(seed, valve) {
  const t = new Tex(32, 32).fill((x, y) => {
    let m = 1 + (hash2(x, y, seed) - 0.5) * 0.18;
    m *= 0.8 + tfbm(x / 8, y / 8, 4, seed + 1) * 0.4;
    if (y % 16 === 0) m *= 0.7;
    return [58 * m, 50 * m, 44 * m];
  });
  const pipe = (y0, h, col) => {
    for (let y = y0; y < y0 + h; y++) {
      const k = 0.45 + 0.75 * Math.sin((Math.PI * (y - y0 + 0.5)) / h);
      for (let x = 0; x < 32; x++) {
        const rust = tfbm(x / 8, y / 4, 4, seed + y0) > 0.62 ? [0.85, 0.6, 0.45] : [1, 1, 1];
        const hl = y === y0 + 1 ? 1.25 : 1;
        t.set(x, y, col[0] * k * rust[0] * hl, col[1] * k * rust[1] * hl, col[2] * k * rust[2] * hl);
      }
    }
  };
  pipe(3, 7, [170, 104, 58]);
  pipe(13, 4, [110, 112, 118]);
  pipe(21, 8, [124, 70, 46]);
  for (const bx of [7, 23]) { t.rect(bx, 2, 2, 9, [36, 34, 32]); t.rect(bx, 20, 2, 10, [36, 34, 32]); }
  if (valve) {
    t.ellipse(16, 16, 8, 8, [150, 30, 24]);
    t.ellipse(16, 16, 6, 6, [58, 50, 44]);
    t.line(10, 16, 22, 16, [150, 30, 24], 2);
    t.line(16, 10, 16, 22, [150, 30, 24], 2);
    t.ellipse(16, 16, 2, 2, [190, 60, 40]);
  }
  return t;
}

function grating(seed) {
  return new Tex(32, 32).fill((x, y) => {
    const m = 1 + (hash2(x, y, seed) - 0.5) * 0.15;
    if (x === 0 || y === 0 || x === 31 || y === 31) return [60 * m, 56 * m, 52 * m];
    if (x % 4 === 0 || y % 4 === 0) return [82 * m, 78 * m, 72 * m];
    if (x % 4 === 1 || y % 4 === 1) return [38, 34, 32];
    return [10, 8, 8];
  });
}

function pipeCeil(seed) {
  return new Tex(32, 32).fill((x, y) => {
    let m = 1 + (hash2(x, y, seed) - 0.5) * 0.1;
    let col = [32, 30, 28];
    const p = (x0, w, c) => {
      if (x >= x0 && x < x0 + w) { col = c; m *= 0.45 + 0.75 * Math.sin((Math.PI * (x - x0 + 0.5)) / w); }
    };
    p(4, 6, [120, 80, 50]);
    p(18, 9, [90, 92, 96]);
    return [col[0] * m, col[1] * m, col[2] * m];
  });
}

function redLamp(seed) {
  const t = pipeCeil(seed);
  t.rect(9, 9, 14, 14, [50, 48, 46]);
  t.ellipse(16, 16, 5.5, 5.5, [255, 60, 40, 255, 255]);
  t.ellipse(16, 16, 2.5, 2.5, [255, 180, 150, 255, 255]);
  t.line(10, 16, 22, 16, [40, 36, 34]);
  return t;
}

// ---------- Saídas ----------

function glitchFrames(seed) {
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const base = wallpaper(seed + f, false);
    const t = new Tex(32, 32);
    for (let y = 0; y < 32; y++) {
      const shift = hash2(y >> 2, f, seed) > 0.6 ? Math.floor((hash2(y, f, seed + 1) - 0.5) * 16) : 0;
      for (let x = 0; x < 32; x++) {
        const [r, g, b] = base.get(((x + shift) % 32 + 32) % 32, y);
        const h = hash2(x, y, seed + f * 13);
        if (h > 0.86) t.set(x, y, h * 255, 255 - h * 120, 255, 255, 255);
        else if (h > 0.7) t.set(x, y, 255 - r, 255 - g, 255 - b, 255, 160);
        else if (h < 0.08) t.set(x, y, 0, 0, 0);
        else t.set(x, y, r, g, b, 255, 40);
      }
    }
    frames.push(t);
  }
  return frames;
}

function exitDoor(seed) {
  const t = cinderBlock(seed);
  t.rect(4, 11, 24, 21, [60, 66, 62]);
  t.rect(6, 13, 20, 19, [92, 108, 98]);
  t.rect(8, 15, 7, 7, [80, 94, 86]);
  t.rect(17, 15, 7, 7, [80, 94, 86]);
  t.rect(8, 24, 16, 6, [80, 94, 86]);
  t.rect(22, 22, 3, 2, [200, 200, 190]);
  // placa SAÍDA acesa em verde
  t.rect(1, 0, 30, 11, [24, 120, 52, 255, 230]);
  const tw = textWidth('SAÍDA');
  forEachTextPixel('SAÍDA', 16 - tw / 2, -1, 1, (x, y) => t.set(x, y, 235, 255, 235, 255, 255));
  return t;
}

function woodDoor(seed) {
  const t = pipeWall(seed, false);
  t.rect(5, 2, 22, 30, [40, 26, 18]);
  t.fill((x, y) => {
    if (x < 7 || x > 24 || y < 4) return null;
    let m = 1 + (hash2(x, y, seed) - 0.5) * 0.12 + Math.sin(y * 0.7 + x * 3) * 0.04;
    if ((x - 7) % 6 === 0) m *= 0.7;
    return [118 * m, 70 * m, 40 * m];
  });
  t.ellipse(21.5, 18.5, 1.6, 1.6, [214, 180, 90, 255, 70]);
  t.rect(9, 8, 14, 1, [80, 48, 28]);
  return t;
}

// ---------- Decalques de chão ----------

function arrow(dir, col, seed) {
  const [dx, dy] = [[1, 0], [0, 1], [-1, 0], [0, -1]][dir];
  return new Tex(32, 32).fill((x, y) => {
    const px = x - 15.5, py = y - 15.5;
    const u = px * dx + py * dy, v = -px * dy + py * dx;
    let inside = (u > -11 && u < 4 && Math.abs(v) < 2.2) || (u >= 3 && u < 12 && Math.abs(v) < (12 - u) * 0.95);
    const h = hash2(x, y, seed + dir);
    if (inside && h > 0.9) inside = false;
    if (!inside && h > 0.985 && Math.abs(v) < 9 && Math.abs(u) < 14) inside = true;
    if (!inside) return null;
    const m = 0.85 + h * 0.25;
    return [col[0] * m, col[1] * m, col[2] * m, 255];
  });
}

// ---------- Sprites ----------

function entityFrame(k) {
  const t = new Tex(32, 64);
  const body = [14, 12, 16];
  const ph = (k / 4) * Math.PI * 2, sw = Math.sin(ph), lift = Math.abs(Math.cos(ph));
  t.line(14, 37, 14 + sw * 4, 62 - (sw > 0 ? lift * 2 : 0), body, 2);
  t.line(18, 37, 18 - sw * 4, 62 - (sw < 0 ? lift * 2 : 0), body, 2);
  t.poly([[9, 15], [23, 15], [20.5, 38], [11.5, 38]], body);
  t.line(10, 16, 7 - sw * 2.5, 52, body, 2);
  t.line(22, 16, 25 + sw * 2.5, 52, body, 2);
  for (const [hx, s] of [[7 - sw * 2.5, -1], [25 + sw * 2.5, 1]]) {
    t.line(hx, 52, hx + s, 57, body, 1);
    t.line(hx, 52, hx, 58, body, 1);
  }
  t.rect(15, 11, 3, 5, body);
  t.ellipse(16.5, 7, 4.2, 6, body);
  t.rim([2.4, 2.2, 2.6], [0.6, 0.6, 0.6]);
  t.set(14, 6, 255, 255, 255, 255, 255);
  t.set(19, 6, 255, 255, 255, 255, 255);
  return t;
}

function face() {
  const t = new Tex(32, 32);
  t.ellipse(16, 16, 13, 15.5, [12, 10, 12]);
  t.ellipse(10, 11, 3.6, 4.2, [250, 250, 250, 255, 255]);
  t.ellipse(22, 11, 3.6, 4.2, [250, 250, 250, 255, 255]);
  t.set(10, 11, 0, 0, 0);
  t.set(22, 12, 0, 0, 0);
  t.ellipse(16, 23, 9, 4.5, [110, 0, 4, 255, 60]);
  for (let x = 8; x <= 23; x += 2) {
    t.set(x, 20, 240, 236, 220, 255, 200);
    t.set(x + 1, 21, 240, 236, 220, 255, 200);
    t.set(x, 26, 240, 236, 220, 255, 200);
    t.set(x + 1, 25, 240, 236, 220, 255, 200);
  }
  return t;
}

function bottle() {
  const t = new Tex(12, 24);
  t.rect(4, 0, 4, 3, [60, 92, 210, 255, 40]);
  t.rect(4, 3, 4, 3, [214, 220, 214, 200]);
  t.rect(1, 6, 10, 18, [214, 220, 214, 190]);
  t.rect(2, 10, 8, 13, [236, 226, 184, 255, 40]);
  t.rect(1, 13, 10, 6, [68, 118, 210, 255, 30]);
  t.rect(1, 15, 10, 1, [240, 240, 240, 255, 60]);
  t.rect(2, 7, 1, 16, [255, 255, 255, 230, 90]);
  t.rect(1, 23, 10, 1, [150, 150, 140]);
  return t;
}

function battery() {
  const t = new Tex(10, 18);
  t.rect(3, 0, 4, 2, [210, 150, 64, 255, 40]);
  t.rect(1, 2, 8, 16, [40, 40, 46]);
  t.rect(1, 2, 8, 5, [214, 154, 66, 255, 30]);
  t.rect(1, 8, 8, 4, [80, 210, 96, 255, 80]);
  t.rect(2, 2, 1, 16, [110, 110, 120]);
  t.rect(4, 4, 2, 1, [40, 30, 20]);
  return t;
}

function puff() {
  return new Tex(16, 16).fill((x, y) => {
    const d = Math.hypot(x - 7.5, y - 7.5) / 8 + (hash2(x, y, 3) - 0.5) * 0.2;
    if (d >= 1) return null;
    return [210, 205, 200, (1 - d) * (1 - d) * 210];
  });
}

// Mão segurando a lanterna, em primeira pessoa (inclinada para o centro da tela).
function hand(on) {
  const t = new Tex(80, 64);
  const skin = [206, 150, 116], skinD = [158, 106, 82], skinL = [232, 182, 146];
  const metal = [64, 64, 72], metalL = [118, 118, 128], metalD = [30, 30, 34];
  const A = [60, 70], B = [41, 25];
  const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
  const u = [(B[0] - A[0]) / len, (B[1] - A[1]) / len], n = [-u[1], u[0]];
  const P = (k, side) => [A[0] + (B[0] - A[0]) * k + n[0] * side, A[1] + (B[1] - A[1]) * k + n[1] * side];
  const C = [B[0] + u[0] * 11, B[1] + u[1] * 11];
  const Q = (base, along, side) => [base[0] + u[0] * along + n[0] * side, base[1] + u[1] * along + n[1] * side];
  // manga
  t.poly([[50, 64], [80, 42], [80, 64]], [44, 48, 74]);
  t.poly([[60, 64], [80, 50], [80, 64]], [32, 35, 56]);
  // corpo
  t.poly([P(0, -10), P(0, 10), P(1, 7), P(1, -7)], metal);
  t.line(...P(0.05, -8.5), ...P(1, -6), metalL, 2);
  t.line(...P(0.05, 9), ...P(1, 6), metalD, 2);
  for (let k = 0.55; k < 0.9; k += 0.07) t.line(...P(k, -7), ...P(k, 6), metalD);
  t.rect(...P(0.92, -1).map(Math.round), 3, 2, on ? [210, 60, 40] : [90, 40, 30]);
  // cabeça
  t.poly([Q(B, 0, -8), Q(B, 0, 8), Q(C, 0, 11), Q(C, 0, -11)], [80, 80, 90]);
  t.line(...Q(B, 0, -7), ...Q(C, 0, -10), [140, 140, 150]);
  t.line(...Q(B, 0, 7), ...Q(C, 0, 10), metalD);
  const lens = (rx, ry, c, off = 0) => {
    const pts = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      pts.push(Q(C, Math.sin(a) * ry + off, Math.cos(a) * rx));
    }
    t.poly(pts, c);
  };
  lens(12, 4.2, [104, 104, 112]);
  if (on) { lens(10, 3.2, [255, 246, 214, 255, 255]); lens(5, 1.5, [255, 255, 255, 255, 255], 0.5); }
  else { lens(10, 3.2, [146, 152, 158]); lens(4, 1.1, [205, 210, 214], -1); }
  // dedos envolvendo o corpo
  for (let i = 0; i < 4; i++) {
    const k = 0.18 + i * 0.13;
    const a = P(k, -9), b = P(k + 0.1, -9), c = P(k + 0.1, 16), d = P(k, 16);
    t.poly([a, b, c, d], skin);
    t.line(...a, ...d, skinD);
    t.line(...P(k + 0.09, -8), ...P(k + 0.09, -4), skinL);
  }
  // polegar por cima
  t.poly([P(0.5, -12), P(0.72, -9), P(0.7, -3), P(0.46, -5)], skin);
  t.line(...P(0.5, -11), ...P(0.7, -8), skinL);
  t.poly([P(0.66, -8), P(0.72, -8), P(0.71, -4), P(0.66, -4)], [232, 196, 176]);
  // palma e pulso
  t.poly([P(0.62, 15), P(0.1, 16), [80, 52], [80, 64], [62, 64]], skin);
  t.poly([P(0.2, 15), [80, 58], [80, 64], P(0.0, 15)], skinD);
  return t;
}

const ARROW_COLORS = { 0: [160, 34, 26], 1: [44, 150, 70], 2: [210, 200, 60] };

export function buildLevelTextures(id, seed) {
  const tex = { walls: {}, decals: {} };
  if (id === 0) {
    tex.walls[1] = wallpaper(seed, false);
    tex.walls[2] = wallpaper(seed + 1, true);
    tex.floor = carpet(seed + 2);
    tex.ceil = ceilTile(seed + 3, [205, 200, 180], [150, 145, 130]);
    tex.lamp = lampPanel(seed + 4);
    tex.exit = glitchFrames(seed + 5);
    tex.decals[5] = dampCarpet(seed + 6);
  } else if (id === 1) {
    tex.walls[1] = cinderBlock(seed);
    tex.walls[2] = crates(seed + 1);
    tex.floor = concrete(seed + 2);
    tex.ceil = darkConcreteCeil(seed + 3);
    tex.lamp = cagedBulb(seed + 4);
    tex.exit = [exitDoor(seed + 5)];
    tex.decals[5] = puddle(seed + 6);
  } else {
    tex.walls[1] = pipeWall(seed, false);
    tex.walls[2] = pipeWall(seed + 1, true);
    tex.floor = grating(seed + 2);
    tex.ceil = pipeCeil(seed + 3);
    tex.lamp = redLamp(seed + 4);
    tex.exit = [woodDoor(seed + 5)];
  }
  for (let d = 0; d < 4; d++) tex.decals[d + 1] = arrow(d, ARROW_COLORS[id], seed + 40);
  return tex;
}

export function buildSprites() {
  return {
    entity: [0, 1, 2, 3].map(entityFrame),
    face: face(),
    bottle: bottle(),
    battery: battery(),
    puff: puff(),
    handOn: hand(true),
    handOff: hand(false),
  };
}
