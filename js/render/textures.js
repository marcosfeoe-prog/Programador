// Texturas procedurais (geradas em canvas) — sem arquivos externos.
// Todas repetem sem emendas e algumas possuem mapa normal derivado da altura.
import * as THREE from 'three';
import { Perlin, worley3p } from '../util/noise.js';
import { RNG, clamp } from '../util/math.js';

const perlin = new Perlin(911);

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function toTexture(cv, renderer, srgb = true, repeat = true) {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

// Preenche um canvas por pixel. fn(u, v, x, y, out) escreve RGB em [0,1].
function paint(size, fn) {
  const cv = canvas(size);
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const out = [0, 0, 0];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      fn(x / size, y / size, x, y, out);
      const i = (y * size + x) * 4;
      d[i] = clamp(out[0], 0, 1) * 255;
      d[i + 1] = clamp(out[1], 0, 1) * 255;
      d[i + 2] = clamp(out[2], 0, 1) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

function heightField(size, fn) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = fn(x / size, y / size, x, y);
  return h;
}

function normalFromHeight(h, size, strength) {
  return paint(size, (u, v, x, y, out) => {
    const xl = (x - 1 + size) % size;
    const xr = (x + 1) % size;
    const yu = (y - 1 + size) % size;
    const yd = (y + 1) % size;
    const dx = (h[y * size + xr] - h[y * size + xl]) * strength;
    const dy = (h[yd * size + x] - h[yu * size + x]) * strength;
    let nx = -dx;
    let ny = dy;
    let nz = 1;
    const l = Math.hypot(nx, ny, nz);
    nx /= l;
    ny /= l;
    nz /= l;
    out[0] = nx * 0.5 + 0.5;
    out[1] = ny * 0.5 + 0.5;
    out[2] = nz * 0.5 + 0.5;
  });
}

const mix3 = (a, b, t, out) => {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
};

// Desenha traços (lâminas de grama, agulhas) com repetição nas bordas.
function strokes(cv, count, rng, styleFn) {
  const ctx = cv.getContext('2d');
  const s = cv.width;
  for (let i = 0; i < count; i++) {
    const st = styleFn(rng);
    ctx.strokeStyle = st.color;
    ctx.lineWidth = st.width;
    ctx.globalAlpha = st.alpha;
    for (const ox of [-s, 0, s]) {
      for (const oy of [-s, 0, s]) {
        const x = st.x * s + ox;
        const y = st.y * s + oy;
        if (x < -40 || x > s + 40 || y < -40 || y > s + 40) continue;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + st.dx * 0.5 + st.bend, y + st.dy * 0.5, x + st.dx, y + st.dy);
        ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;
}

const yieldFrame = () => new Promise((r) => setTimeout(r, 0));

export async function generateTextures(renderer, size, progress = () => {}) {
  const T = {};
  const rng = new RNG(4242);
  const steps = 15;
  let k = 0;
  const step = async (name) => {
    k++;
    progress(k / steps, name);
    await yieldFrame();
  };

  // ---------- Grama ----------
  {
    const P = 8;
    const cv = paint(size, (u, v, x, y, out) => {
      const n1 = perlin.fbm2p(u * P, v * P, P, 4) * 0.5 + 0.5;
      const n2 = perlin.fbm2p(u * P * 4, v * P * 4, P * 4, 3) * 0.5 + 0.5;
      const dark = [0.13, 0.22, 0.06];
      const mid = [0.24, 0.34, 0.1];
      const dry = [0.4, 0.39, 0.17];
      mix3(dark, mid, clamp(n1 * 1.4 - 0.1, 0, 1), out);
      const dryT = clamp((n2 - 0.62) * 3, 0, 1) * 0.6;
      mix3(out, dry, dryT, out);
      const f = 0.75 + n2 * 0.45;
      out[0] *= f;
      out[1] *= f;
      out[2] *= f;
    });
    strokes(cv, size * 7, rng, (r) => {
      const g = r.float(0.25, 0.55);
      return {
        x: r.next(), y: r.next(),
        dx: r.float(-3, 3), dy: -r.float(4, 11) * (size / 512),
        bend: r.float(-2, 2), width: r.float(0.6, 1.4) * (size / 512),
        alpha: r.float(0.25, 0.6),
        color: `rgb(${Math.floor(g * 140)},${Math.floor(g * 200 + 40)},${Math.floor(g * 60)})`,
      };
    });
    T.grass = toTexture(cv, renderer);
  }
  await step('grama');

  // ---------- Terra ----------
  {
    const cv = paint(size, (u, v, x, y, out) => {
      const n = perlin.fbm2p(u * 6, v * 6, 6, 5) * 0.5 + 0.5;
      const w = worley3p(u * 24, v * 24, 0.5, 24, 3);
      const peb = clamp((0.22 - w) * 6, 0, 1);
      mix3([0.27, 0.2, 0.13], [0.42, 0.32, 0.21], n, out);
      mix3(out, [0.5, 0.46, 0.4], peb * 0.7, out);
    });
    T.dirt = toTexture(cv, renderer);
  }
  await step('terra');

  // ---------- Rocha ----------
  {
    const h = heightField(size, (u, v) => {
      const r = perlin.fbm2p(u * 4, v * 4, 4, 6) * 0.5 + 0.5;
      const strata = Math.sin((v * 24 + perlin.fbm2p(u * 3, v * 3, 3, 3) * 3) * Math.PI) * 0.08;
      const cr = 1 - Math.abs(perlin.fbm2p(u * 8 + 3, v * 8, 8, 3));
      return r + strata - Math.pow(cr, 12) * 0.4;
    });
    const cv = paint(size, (u, v, x, y, out) => {
      const hv = h[y * size + x];
      const l = perlin.fbm2p(u * 10 + 5, v * 10, 10, 3) * 0.5 + 0.5;
      mix3([0.3, 0.29, 0.27], [0.55, 0.53, 0.5], clamp(hv, 0, 1), out);
      const lichen = clamp((l - 0.62) * 4, 0, 1) * 0.5;
      mix3(out, [0.42, 0.45, 0.28], lichen, out);
    });
    T.rock = toTexture(cv, renderer);
    T.rockN = toTexture(normalFromHeight(h, size, size / 64), renderer, false);
  }
  await step('rocha');

  // ---------- Chão de floresta ----------
  {
    const cv = paint(size, (u, v, x, y, out) => {
      const n = perlin.fbm2p(u * 5, v * 5, 5, 5) * 0.5 + 0.5;
      const m = perlin.fbm2p(u * 3 + 7, v * 3, 3, 4) * 0.5 + 0.5;
      mix3([0.12, 0.09, 0.05], [0.26, 0.19, 0.11], n, out);
      mix3(out, [0.14, 0.22, 0.07], clamp((m - 0.5) * 2.5, 0, 1) * 0.7, out);
    });
    strokes(cv, size * 6, rng, (r) => {
      const c = r.float(0.3, 0.6);
      const a = r.float(0, Math.PI * 2);
      const len = r.float(3, 7) * (size / 512);
      return {
        x: r.next(), y: r.next(), dx: Math.cos(a) * len, dy: Math.sin(a) * len, bend: 0,
        width: 0.8 * (size / 512), alpha: 0.6,
        color: `rgb(${Math.floor(c * 160)},${Math.floor(c * 110)},${Math.floor(c * 60)})`,
      };
    });
    T.forest = toTexture(cv, renderer);
  }
  await step('floresta');

  // ---------- Trigo / plantação ----------
  {
    const cv = paint(size, (u, v, x, y, out) => {
      const row = Math.pow(Math.abs(Math.sin(u * Math.PI * 16)), 0.6);
      const n = perlin.fbm2p(u * 16, v * 16, 16, 3) * 0.5 + 0.5;
      const n2 = perlin.fbm2p(u * 4, v * 4, 4, 3) * 0.5 + 0.5;
      mix3([0.42, 0.3, 0.12], [0.78, 0.62, 0.3], row * (0.6 + n * 0.4), out);
      mix3(out, [0.62, 0.55, 0.25], n2 * 0.3, out);
    });
    T.wheat = toTexture(cv, renderer);
  }
  await step('plantação');

  // ---------- Asfalto ----------
  {
    const cv = paint(size, (u, v, x, y, out) => {
      const n = perlin.fbm2p(u * 32, v * 32, 32, 2) * 0.5 + 0.5;
      const p = perlin.fbm2p(u * 4, v * 4, 4, 4) * 0.5 + 0.5;
      const g = 0.09 + n * 0.07 + (p - 0.5) * 0.05;
      const speck = ((x * 7919 + y * 104729) % 97) / 97 > 0.93 ? 0.08 : 0;
      out[0] = g + speck;
      out[1] = g + speck;
      out[2] = g * 1.05 + speck;
    });
    // Rachaduras
    const ctx = cv.getContext('2d');
    ctx.strokeStyle = 'rgba(10,10,10,0.7)';
    for (let i = 0; i < 6; i++) {
      ctx.lineWidth = rng.float(0.5, 1.5);
      ctx.beginPath();
      let x = rng.float(0, size);
      let y = rng.float(0, size);
      ctx.moveTo(x, y);
      for (let j = 0; j < 12; j++) {
        x += rng.float(-14, 14);
        y += rng.float(-14, 14);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    T.asphalt = toTexture(cv, renderer);
  }
  await step('asfalto');

  // ---------- Concreto ----------
  {
    const cv = paint(size, (u, v, x, y, out) => {
      const n = perlin.fbm2p(u * 16, v * 16, 16, 4) * 0.5 + 0.5;
      const st = perlin.fbm2p(u * 3, v * 3, 3, 3) * 0.5 + 0.5;
      let g = 0.5 + n * 0.12 - st * 0.08;
      const jx = Math.min(u % 0.5, 0.5 - (u % 0.5));
      const jy = Math.min(v % 0.5, 0.5 - (v % 0.5));
      if (Math.min(jx, jy) < 0.004) g *= 0.6;
      out[0] = g;
      out[1] = g * 0.98;
      out[2] = g * 0.95;
    });
    T.concrete = toTexture(cv, renderer);
  }
  await step('concreto');

  // ---------- Revestimento de madeira (siding) ----------
  {
    const boards = 8;
    const h = heightField(size, (u, v) => {
      const t = (v * boards) % 1;
      return t * 0.8 + perlin.noise2p(u * 64, v * 4, 64) * 0.02;
    });
    const cv = paint(size, (u, v, x, y, out) => {
      const t = (v * boards) % 1;
      const grain = perlin.noise2p(u * 48, v * boards * 8, 48) * 0.5 + 0.5;
      let g = 0.84 + grain * 0.1;
      if (t > 0.94) g *= 0.55; // sombra da tábua
      out[0] = g;
      out[1] = g * 0.99;
      out[2] = g * 0.96;
    });
    T.siding = toTexture(cv, renderer);
    T.sidingN = toTexture(normalFromHeight(h, size, size / 40), renderer, false);
  }
  await step('revestimento');

  // ---------- Tijolo ----------
  {
    const rows = 16;
    const cols = 6;
    const brickId = (u, v) => {
      const r = Math.floor(v * rows);
      const off = r % 2 ? 0.5 / cols : 0;
      const c = Math.floor(((u + off) % 1) * cols);
      const fu = (((u + off) % 1) * cols) % 1;
      const fv = (v * rows) % 1;
      return { r, c, fu, fv };
    };
    const h = heightField(size, (u, v) => {
      const b = brickId(u, v);
      const m = Math.min(b.fu, 1 - b.fu) * 3.2 / cols * cols;
      const mv = Math.min(b.fv, 1 - b.fv);
      const mortar = Math.min(m * 0.5, mv) < 0.07 ? 0 : 1;
      return mortar * (0.8 + perlin.noise2p(u * 64, v * 64, 64) * 0.1);
    });
    const cv = paint(size, (u, v, x, y, out) => {
      const b = brickId(u, v);
      const hv = h[y * size + x];
      if (hv < 0.1) {
        out[0] = out[1] = out[2] = 0.62;
        return;
      }
      const seed = ((b.r * 31 + b.c * 17) % 13) / 13;
      const n = perlin.noise2p(u * 40, v * 40, 40) * 0.5 + 0.5;
      mix3([0.42, 0.15, 0.09], [0.6, 0.27, 0.16], seed, out);
      const f = 0.8 + n * 0.3;
      out[0] *= f;
      out[1] *= f;
      out[2] *= f;
    });
    T.brick = toTexture(cv, renderer);
    T.brickN = toTexture(normalFromHeight(h, size, size / 60), renderer, false);
  }
  await step('tijolo');

  // ---------- Telhas asfálticas ----------
  {
    const rows = 14;
    const tabs = 8;
    const h = heightField(size, (u, v) => {
      const r = Math.floor(v * rows);
      const fv = (v * rows) % 1;
      const off = (r % 2) * 0.5 / tabs;
      const fu = (((u + off) % 1) * tabs) % 1;
      let hv = fv * 0.7;
      if (fu < 0.03) hv *= 0.4;
      return hv;
    });
    const cv = paint(size, (u, v, x, y, out) => {
      const r = Math.floor(v * rows);
      const off = (r % 2) * 0.5 / tabs;
      const c = Math.floor(((u + off) % 1) * tabs);
      const seed = (((r * 13 + c * 7) % 11) / 11) * 0.25;
      const n = perlin.noise2p(u * 128, v * 128, 128) * 0.5 + 0.5;
      const fv = (v * rows) % 1;
      let g = 0.55 + seed + n * 0.18;
      if (fv > 0.92) g *= 0.4;
      out[0] = g;
      out[1] = g;
      out[2] = g;
    });
    T.shingle = toTexture(cv, renderer);
    T.shingleN = toTexture(normalFromHeight(h, size, size / 40), renderer, false);
  }
  await step('telhas');

  // ---------- Metal corrugado ----------
  {
    const ribs = 16;
    const h = heightField(size, (u) => Math.sin(u * ribs * Math.PI * 2) * 0.5 + 0.5);
    const cv = paint(size, (u, v, x, y, out) => {
      const sh = Math.sin(u * ribs * Math.PI * 2) * 0.12;
      const streak = perlin.fbm2p(u * 32, v * 2, 32, 3) * 0.5 + 0.5;
      const rust = clamp((perlin.fbm2p(u * 6, v * 6, 6, 4) - 0.25) * 3, 0, 1);
      let g = 0.7 + sh + streak * 0.1;
      out[0] = g;
      out[1] = g;
      out[2] = g * 1.02;
      mix3(out, [0.45, 0.26, 0.14], rust * 0.6, out);
    });
    T.metal = toTexture(cv, renderer);
    T.metalN = toTexture(normalFromHeight(h, size, size / 30), renderer, false);
  }
  await step('metal');

  // ---------- Madeira (tábuas / compensado) ----------
  {
    const cv = paint(size, (u, v, x, y, out) => {
      const plank = Math.floor(v * 4);
      const grain = Math.sin((u * 30 + perlin.fbm2p(u * 4, v * 16 + plank, 4, 3) * 4) * Math.PI) * 0.5 + 0.5;
      const n = perlin.noise2p(u * 64, v * 64, 64) * 0.5 + 0.5;
      mix3([0.45, 0.32, 0.19], [0.66, 0.5, 0.32], grain * 0.6 + n * 0.4, out);
      if ((v * 4) % 1 > 0.97) {
        out[0] *= 0.5;
        out[1] *= 0.5;
        out[2] *= 0.5;
      }
    });
    T.wood = toTexture(cv, renderer);
  }
  await step('madeira');

  // ---------- Atlas de árvore (casca | folhagem), em tons neutros ----------
  {
    const s = size;
    const cv = canvas(s);
    const ctx = cv.getContext('2d');
    const bark = paint(s, (u, v, x, y, out) => {
      const st = perlin.fbm2p(u * 24, v * 3, 24, 4) * 0.5 + 0.5;
      const cr = 1 - Math.abs(perlin.noise2p(u * 12, v * 2, 12));
      let g = 0.55 + st * 0.35 - Math.pow(cr, 10) * 0.4;
      out[0] = g;
      out[1] = g * 0.95;
      out[2] = g * 0.9;
    });
    const leaves = paint(s, (u, v, x, y, out) => {
      const w1 = worley3p(u * 14, v * 14, 0.3, 14, 7);
      const w2 = worley3p(u * 30, v * 30, 0.7, 30, 9);
      const n = perlin.fbm2p(u * 8, v * 8, 8, 3) * 0.5 + 0.5;
      let g = 0.55 + (1 - w1) * 0.35 + (1 - w2) * 0.2 - n * 0.15;
      if (w2 > 0.75) g *= 0.6;
      out[0] = g * 0.95;
      out[1] = g;
      out[2] = g * 0.9;
    });
    ctx.drawImage(bark, 0, 0, s, s, 0, 0, s / 2, s);
    ctx.drawImage(leaves, 0, 0, s, s, s / 2, 0, s / 2, s);
    T.treeAtlas = toTexture(cv, renderer, true, false);
    T.treeAtlas.wrapS = T.treeAtlas.wrapT = THREE.ClampToEdgeWrapping;
  }
  await step('árvores');

  // ---------- Ruído genérico (RGBA, linear) para variações em shaders ----------
  {
    const s = 256;
    const cv = canvas(s);
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(s, s);
    const d = img.data;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / s;
        const v = y / s;
        const i = (y * s + x) * 4;
        d[i] = (perlin.fbm2p(u * 4, v * 4, 4, 5) * 0.5 + 0.5) * 255;
        d[i + 1] = (perlin.fbm2p(u * 16 + 3, v * 16, 16, 3) * 0.5 + 0.5) * 255;
        d[i + 2] = (1 - worley3p(u * 8, v * 8, 0.5, 8, 5)) * 255;
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    T.noise = toTexture(cv, renderer, false);
  }
  await step('ruído');

  // ---------- Vidro / janelas ----------
  {
    const s = 128;
    const cv = paint(s, (u, v, x, y, out) => {
      const frame = u < 0.06 || u > 0.94 || v < 0.06 || v > 0.94 || Math.abs(u - 0.5) < 0.025 || Math.abs(v - 0.5) < 0.025;
      if (frame) {
        out[0] = out[1] = out[2] = 0.85;
      } else {
        const g = 0.25 + v * 0.25;
        out[0] = g;
        out[1] = g;
        out[2] = g;
      }
    });
    T.window = toTexture(cv, renderer);
  }
  await step('janelas');

  return T;
}
