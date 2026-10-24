// Peças comuns dos cenários: caixas, texturas pintadas em canvas (janelas,
// pisos, muros, letreiros de neon), árvores de cerejeira, postes e prédios.
import * as THREE from 'three';
import { toon, flat, mesh, canvasTexture, mergeGeos } from '../toon.js';
import { hash, RNG } from '../util.js';

// Caixa com a base em y (não no centro).
export function B(parent, w, h, d, color, x, y, z, opts = {}) {
  const geo = new THREE.BoxGeometry(w, h, d);
  if (opts.uv) scaleUV(geo, w, h, d, opts.uv);
  const mat = opts.mat || toon(color, { map: opts.map, emissive: opts.emissive, ei: opts.ei });
  const m = mesh(geo, mat, opts.outline ?? 0, { smooth: true, cast: opts.cast ?? false, receive: opts.receive ?? true });
  m.position.set(x, y + h / 2, z);
  if (opts.ry) m.rotation.y = opts.ry;
  if (opts.rx) m.rotation.x = opts.rx;
  if (opts.rz) m.rotation.z = opts.rz;
  parent.add(m);
  return m;
}

// UV em metros (para texturas que repetem por tamanho real).
function scaleUV(geo, w, h, d, k) {
  const kx = Array.isArray(k) ? k[0] : k;
  const ky = Array.isArray(k) ? k[1] : k;
  const uv = geo.attributes.uv;
  const n = geo.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    let sx;
    let sy;
    if (ax > 0.5) {
      sx = d;
      sy = h;
    } else if (ay > 0.5) {
      sx = w;
      sy = d;
    } else {
      sx = w;
      sy = h;
    }
    uv.setXY(i, uv.getX(i) * sx * kx, uv.getY(i) * sy * ky);
  }
}

export function plane(parent, w, h, mat, x, y, z, rx = 0, ry = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, 0);
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

export function ground(parent, w, d, mat, x = 0, z = 0, y = 0) {
  return plane(parent, w, d, mat, x, y, z, -Math.PI / 2);
}

// Congela as matrizes de um grupo estático (economiza CPU por quadro).
export function freeze(group) {
  group.updateMatrixWorld(true);
  group.traverse((o) => {
    if (!o.userData.dynamic) o.matrixAutoUpdate = false;
  });
}

// ------------------------------------------------------------ texturas
const TEX = new Map();
function cached(key, fn) {
  if (!TEX.has(key)) TEX.set(key, fn());
  return TEX.get(key);
}

// Fachada com janelas (o vidro reflete o céu).
export function facadeTex(opts = {}) {
  const {
    wall = '#ece6da',
    glassTop = '#9cc4e8',
    glassBot = '#d8ecfa',
    frame = '#8a8a90',
    cols = 4,
    rows = 1,
    lit = 0,
    night = false,
    sill = '#c8c2b6',
    key = '',
  } = opts;
  return cached(`fac${key}|${wall}|${glassTop}|${cols}|${rows}|${lit}|${night}`, () =>
    canvasTexture(
      256,
      256,
      (g, W, H) => {
        g.fillStyle = wall;
        g.fillRect(0, 0, W, H);
        const cw = W / cols;
        const ch = H / rows;
        const rng = new RNG(cols * 7 + rows * 13 + (night ? 5 : 0) + lit * 100);
        for (let j = 0; j < rows; j++)
          for (let i = 0; i < cols; i++) {
            const x = i * cw + cw * 0.1;
            const y = j * ch + ch * 0.18;
            const w = cw * 0.8;
            const h = ch * 0.56;
            const on = rng.chance(lit);
            const gr = g.createLinearGradient(0, y, 0, y + h);
            if (night) {
              gr.addColorStop(0, on ? '#ffd890' : '#1a2238');
              gr.addColorStop(1, on ? '#f0b060' : '#283050');
            } else {
              gr.addColorStop(0, glassTop);
              gr.addColorStop(1, glassBot);
            }
            g.fillStyle = gr;
            g.fillRect(x, y, w, h);
            if (!night) {
              g.fillStyle = 'rgba(255,255,255,0.45)';
              g.beginPath();
              g.moveTo(x + w * 0.15, y + h);
              g.lineTo(x + w * 0.45, y);
              g.lineTo(x + w * 0.6, y);
              g.lineTo(x + w * 0.3, y + h);
              g.fill();
            }
            g.strokeStyle = frame;
            g.lineWidth = 3;
            g.strokeRect(x, y, w, h);
            g.beginPath();
            g.moveTo(x + w / 2, y);
            g.lineTo(x + w / 2, y + h);
            g.stroke();
            g.fillStyle = sill;
            g.fillRect(x - 3, y + h, w + 6, 5);
          }
      },
      { repeat: [1, 1] },
    ),
  );
}

export function tileTex(base = '#d9d0bf', line = '#bcb2a0', n = 8, key = '') {
  return cached(`tile${base}${line}${n}${key}`, () =>
    canvasTexture(
      256,
      256,
      (g, W) => {
        g.fillStyle = base;
        g.fillRect(0, 0, W, W);
        const rng = new RNG(n * 31);
        const s = W / n;
        for (let j = 0; j < n; j++)
          for (let i = 0; i < n; i++) {
            const v = rng.float(-10, 10);
            g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 120})`;
            g.fillRect(i * s, j * s, s, s);
          }
        g.strokeStyle = line;
        g.lineWidth = 2;
        for (let i = 0; i <= n; i++) {
          g.beginPath();
          g.moveTo(i * s, 0);
          g.lineTo(i * s, W);
          g.moveTo(0, i * s);
          g.lineTo(W, i * s);
          g.stroke();
        }
      },
      { repeat: [1, 1] },
    ),
  );
}

export function woodFloorTex() {
  return cached('wood', () =>
    canvasTexture(
      256,
      256,
      (g, W) => {
        const rng = new RNG(7);
        const n = 8;
        const s = W / n;
        for (let i = 0; i < n; i++) {
          const v = rng.float(-14, 14);
          g.fillStyle = `rgb(${200 + v},${160 + v * 0.8},${110 + v * 0.6})`;
          g.fillRect(0, i * s, W, s);
          g.strokeStyle = 'rgba(90,60,30,0.35)';
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(0, i * s);
          g.lineTo(W, i * s);
          const off = rng.float(0, W);
          g.moveTo(off, i * s);
          g.lineTo(off, i * s + s);
          g.stroke();
          g.strokeStyle = 'rgba(120,80,40,0.12)';
          for (let k = 0; k < 4; k++) {
            g.beginPath();
            const y = i * s + rng.float(4, s - 4);
            g.moveTo(0, y);
            g.bezierCurveTo(W * 0.3, y + rng.float(-3, 3), W * 0.6, y + rng.float(-3, 3), W, y);
            g.stroke();
          }
        }
      },
      { repeat: [1, 1] },
    ),
  );
}

export function asphaltTex() {
  return cached('asph', () =>
    canvasTexture(
      256,
      256,
      (g, W) => {
        g.fillStyle = '#4a4c52';
        g.fillRect(0, 0, W, W);
        const rng = new RNG(3);
        for (let i = 0; i < 1600; i++) {
          const v = rng.float(0, 1);
          g.fillStyle = v > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.12)';
          g.fillRect(rng.float(0, W), rng.float(0, W), 2, 2);
        }
      },
      { repeat: [1, 1] },
    ),
  );
}

export function concreteTex(base = '#b8b4aa', key = '') {
  return cached('conc' + base + key, () =>
    canvasTexture(
      256,
      256,
      (g, W) => {
        g.fillStyle = base;
        g.fillRect(0, 0, W, W);
        const rng = new RNG(11);
        for (let i = 0; i < 60; i++) {
          g.fillStyle = `rgba(0,0,0,${rng.float(0.01, 0.035)})`;
          g.beginPath();
          g.ellipse(rng.float(0, W), rng.float(0, W), rng.float(5, 30), rng.float(5, 30), 0, 0, Math.PI * 2);
          g.fill();
        }
        g.strokeStyle = 'rgba(0,0,0,0.18)';
        g.lineWidth = 2;
        g.strokeRect(0, 0, W, W);
      },
      { repeat: [1, 1] },
    ),
  );
}

// Muro de blocos de concreto (típico das ruas japonesas).
export function blockWallTex() {
  return cached('block', () =>
    canvasTexture(
      256,
      256,
      (g, W) => {
        g.fillStyle = '#a8a49a';
        g.fillRect(0, 0, W, W);
        const bw = W / 2;
        const bh = W / 6;
        const rng = new RNG(5);
        for (let j = 0; j < 6; j++)
          for (let i = -1; i < 3; i++) {
            const x = i * bw + (j % 2) * bw * 0.5;
            const v = rng.float(-8, 8);
            g.fillStyle = `rgb(${168 + v},${164 + v},${154 + v})`;
            g.fillRect(x + 2, j * bh + 2, bw - 4, bh - 4);
          }
      },
      { repeat: [1, 1] },
    ),
  );
}

export function chainFenceTex() {
  return cached('fence', () => {
    const t = canvasTexture(
      128,
      128,
      (g, W) => {
        g.clearRect(0, 0, W, W);
        g.strokeStyle = 'rgba(150,160,165,1)';
        g.lineWidth = 3;
        for (let i = -W; i < W * 2; i += 32) {
          g.beginPath();
          g.moveTo(i, 0);
          g.lineTo(i + W, W);
          g.moveTo(i, W);
          g.lineTo(i + W, 0);
          g.stroke();
        }
      },
      { repeat: [1, 1] },
    );
    return t;
  });
}

export function brickTex(base = '#6a4a42', key = '') {
  return cached('brick' + base + key, () =>
    canvasTexture(
      256,
      256,
      (g, W) => {
        g.fillStyle = '#2a2224';
        g.fillRect(0, 0, W, W);
        const rows = 8;
        const bh = W / rows;
        const bw = W / 4;
        const rng = new RNG(base.length * 17);
        const c = new THREE.Color(base);
        for (let j = 0; j < rows; j++)
          for (let i = -1; i < 5; i++) {
            const v = rng.float(0.8, 1.15);
            g.fillStyle = `rgb(${Math.min(255, c.r * 255 * v)},${Math.min(255, c.g * 255 * v)},${Math.min(255, c.b * 255 * v)})`;
            g.fillRect(i * bw + (j % 2) * bw * 0.5 + 2, j * bh + 2, bw - 4, bh - 4);
          }
      },
      { repeat: [1, 1] },
    ),
  );
}

// Letreiro de neon: texto com brilho.
export function neonTex(text, color, opts = {}) {
  const { w = 512, h = 160, font = 'bold 96px "Arial Black", Impact, sans-serif', vertical = false, bg = 'rgba(10,8,14,0.92)' } = opts;
  return cached(`neon${text}${color}${w}${h}${vertical}`, () =>
    canvasTexture(w, h, (g, W, H) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);
      g.strokeStyle = color;
      g.lineWidth = 6;
      g.shadowColor = color;
      g.shadowBlur = 24;
      g.strokeRect(10, 10, W - 20, H - 20);
      g.font = font;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#ffffff';
      if (vertical) {
        const chars = [...text];
        const step = (H - 40) / chars.length;
        chars.forEach((ch, i) => {
          g.shadowBlur = 30;
          g.fillStyle = color;
          g.fillText(ch, W / 2, 20 + step * (i + 0.5));
          g.shadowBlur = 0;
          g.fillStyle = 'rgba(255,255,255,0.85)';
          g.fillText(ch, W / 2, 20 + step * (i + 0.5));
        });
      } else {
        g.shadowBlur = 30;
        g.fillStyle = color;
        g.fillText(text, W / 2, H / 2 + 4);
        g.shadowBlur = 0;
        g.fillStyle = 'rgba(255,255,255,0.85)';
        g.fillText(text, W / 2, H / 2 + 4);
      }
    }),
  );
}

// Placa simples com texto (nome da escola, sala de aula…).
export function signTex(text, opts = {}) {
  const { w = 512, h = 128, bg = '#f4efe2', fg = '#202020', font = 'bold 64px "Noto Serif", Georgia, serif', border = '#444' } = opts;
  return cached(`sign${text}${bg}${fg}${w}${h}`, () =>
    canvasTexture(w, h, (g, W, H) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);
      g.strokeStyle = border;
      g.lineWidth = 8;
      g.strokeRect(4, 4, W - 8, H - 8);
      g.fillStyle = fg;
      g.font = font;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, W / 2, H / 2 + 3);
    }),
  );
}

// Grafite no pilar da ponte.
export function graffitiTex() {
  return cached('graf', () =>
    canvasTexture(512, 256, (g, W, H) => {
      g.fillStyle = '#8a8680';
      g.fillRect(0, 0, W, H);
      const rng = new RNG(9);
      for (let i = 0; i < 40; i++) {
        g.fillStyle = `rgba(0,0,0,${rng.float(0.03, 0.1)})`;
        g.fillRect(rng.float(0, W), rng.float(0, H), rng.float(10, 80), rng.float(10, 60));
      }
      g.font = 'bold 110px "Arial Black", Impact, sans-serif';
      g.textAlign = 'center';
      g.lineWidth = 12;
      g.strokeStyle = '#1a1a1a';
      g.save();
      g.translate(W / 2, H / 2 + 30);
      g.rotate(-0.08);
      g.strokeText('KUROGANE', 0, 0);
      const gr = g.createLinearGradient(-200, -60, 200, 40);
      gr.addColorStop(0, '#e83a6a');
      gr.addColorStop(0.5, '#f0a030');
      gr.addColorStop(1, '#3ab0e0');
      g.fillStyle = gr;
      g.fillText('KUROGANE', 0, 0);
      g.restore();
      g.fillStyle = '#f0f0f0';
      g.font = 'bold 40px "Arial Black", sans-serif';
      g.fillText('★ 4EVER ★', 120, 50);
    }),
  );
}

// ------------------------------------------------------------ vegetação
const SAKURA_PINKS = [0xf7b6c8, 0xf4a6bc, 0xf9c8d4];
export function sakuraTree(parent, x, z, s = 1, seed = 1, opts = {}) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.scale.setScalar(s);
  g.rotation.y = hash(seed) * 6.28;
  const bark = toon(0x5a3a32);
  const trunk = mesh(new THREE.CylinderGeometry(0.16, 0.26, 2.6, 8), bark, opts.outline ?? 0.6, { cast: true });
  trunk.position.y = 1.3;
  g.add(trunk);
  for (let i = 0; i < 3; i++) {
    const br = mesh(new THREE.CylinderGeometry(0.07, 0.12, 1.6, 6), bark, opts.outline ?? 0.6);
    const a = (i / 3) * Math.PI * 2 + hash(seed + i) * 0.5;
    br.position.set(Math.cos(a) * 0.4, 2.8, Math.sin(a) * 0.4);
    br.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7);
    g.add(br);
  }
  const rng = new RNG(seed * 77 + 1);
  const L = [];
  for (let i = 0; i < 9; i++) {
    const r = rng.float(0.9, 1.5);
    const geo = new THREE.IcosahedronGeometry(r, 1);
    const a = rng.float(0, Math.PI * 2);
    const d = i === 0 ? 0 : rng.float(0.8, 1.7);
    geo.translate(Math.cos(a) * d, 3.5 + rng.float(-0.3, 1.0) + (i === 0 ? 0.6 : 0), Math.sin(a) * d);
    L.push({ geo });
  }
  const crown = mesh(mergeGeos(L), toon(SAKURA_PINKS[Math.abs(Math.round(seed)) % 3]), opts.outline ?? 0.5, { cast: true });
  g.add(crown);
  parent.add(g);
  return g;
}

export function greenTree(parent, x, z, s = 1, seed = 1, color = 0x5a9a4a) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.scale.setScalar(s);
  const trunk = mesh(new THREE.CylinderGeometry(0.14, 0.22, 2.2, 7), toon(0x5a4030), 0.5);
  trunk.position.y = 1.1;
  g.add(trunk);
  const rng = new RNG(seed * 31 + 5);
  const L = [];
  for (let i = 0; i < 6; i++) {
    const geo = new THREE.IcosahedronGeometry(rng.float(0.8, 1.3), 1);
    const a = rng.float(0, 6.28);
    const d = i === 0 ? 0 : rng.float(0.5, 1.2);
    geo.translate(Math.cos(a) * d, 3 + rng.float(-0.2, 1.2), Math.sin(a) * d);
    L.push({ geo });
  }
  g.add(mesh(mergeGeos(L), toon(color), 0.5, { cast: true }));
  parent.add(g);
  return g;
}

export function bush(parent, x, z, s = 1, color = 0x4a8a3a) {
  const m = mesh(new THREE.IcosahedronGeometry(0.6, 1), toon(color), 0.5);
  m.position.set(x, 0.35 * s, z);
  m.scale.set(s * 1.3, s * 0.8, s);
  parent.add(m);
  return m;
}

// ------------------------------------------------------------ cidade
// Anel de prédios ao longe (silhueta da cidade).
export function skyline(parent, opts = {}) {
  const { r0 = 160, r1 = 320, n = 140, y = 0, night = false, seed = 3, color = 0xa8b4c8, arc = [0, Math.PI * 2], hMax = 70 } = opts;
  const rng = new RNG(seed);
  const geos = [];
  const geosLit = [];
  for (let i = 0; i < n; i++) {
    const a = rng.float(arc[0], arc[1]);
    const r = rng.float(r0, r1);
    const w = rng.float(10, 26);
    const h = rng.float(12, hMax) * (rng.chance(0.15) ? 1.6 : 1);
    const geo = new THREE.BoxGeometry(w, h, w * rng.float(0.6, 1.2));
    geo.rotateY(-a + rng.float(-0.3, 0.3));
    geo.translate(Math.cos(a) * r, y + h / 2, Math.sin(a) * r);
    (rng.chance(0.5) ? geosLit : geos).push({ geo });
  }
  const tex = facadeTex({ cols: 6, rows: 8, night, lit: night ? 0.45 : 0, wall: night ? '#1a1e2c' : '#c4ccd8', key: 'sky' });
  tex.repeat.set(3, 4);
  const c1 = new THREE.Color(color);
  const m1 = toon(c1.getHex(), { map: night ? tex : null, emissive: night ? 0xffffff : 0, ei: night ? 0.5 : 0, unique: true });
  if (night) m1.emissiveMap = tex;
  const m2 = toon(c1.clone().multiplyScalar(0.88).getHex(), { map: tex, unique: true });
  if (night) {
    m2.emissive = new THREE.Color(0xffffff);
    m2.emissiveMap = tex;
    m2.emissiveIntensity = 0.6;
  }
  if (geos.length) parent.add(new THREE.Mesh(mergeGeos(geos), m1));
  if (geosLit.length) parent.add(new THREE.Mesh(mergeGeos(geosLit), m2));
}

// Montanhas azuladas no horizonte.
export function mountains(parent, opts = {}) {
  const { r = 420, n = 22, color = 0x8aa0c0, seed = 4, hMin = 40, hMax = 110 } = opts;
  const rng = new RNG(seed);
  const L = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.float(-0.1, 0.1);
    const h = rng.float(hMin, hMax);
    const geo = new THREE.ConeGeometry(rng.float(60, 120), h, 6);
    geo.translate(Math.cos(a) * r, h / 2 - 5, Math.sin(a) * r);
    L.push({ geo });
  }
  const m = new THREE.Mesh(mergeGeos(L), toon(color, { fog: true }));
  parent.add(m);
  return m;
}

// Poste de luz com cabeça emissiva e cone de luz translúcido.
export function streetLamp(parent, x, z, opts = {}) {
  const { h = 4.6, arm = 0.9, ry = 0, color = 0xfff0c8, cone = true } = opts;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  const pole = mesh(new THREE.CylinderGeometry(0.06, 0.08, h, 8), toon(0x5a5e66), 0.5);
  pole.position.y = h / 2;
  g.add(pole);
  const a = mesh(new THREE.BoxGeometry(0.06, 0.06, arm), toon(0x5a5e66), 0.5);
  a.position.set(0, h - 0.05, arm / 2);
  g.add(a);
  const headMat = new THREE.MeshBasicMaterial({ color });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.4), headMat);
  head.position.set(0, h - 0.12, arm);
  g.add(head);
  let coneMesh = null;
  if (cone) {
    const cg = new THREE.ConeGeometry(1.6, h - 0.2, 20, 1, true);
    cg.translate(0, -(h - 0.2) / 2, 0);
    const cm = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.08,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    coneMesh = new THREE.Mesh(cg, cm);
    coneMesh.position.set(0, h - 0.16, arm);
    g.add(coneMesh);
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(1.8, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, 0.02, arm);
    g.add(pool);
    g.userData.pool = pool;
  }
  g.userData.head = head;
  g.userData.cone = coneMesh;
  g.userData.dynamic = true;
  parent.add(g);
  return g;
}

// Poste de concreto com cruzetas (fios ligados entre postes por quem chama).
export function utilityPole(parent, x, z, ry = 0) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  const pole = mesh(new THREE.CylinderGeometry(0.12, 0.17, 9, 8), toon(0x9a968c), 0.5);
  pole.position.y = 4.5;
  g.add(pole);
  for (const [y, w] of [
    [8.3, 1.8],
    [7.4, 1.4],
  ]) {
    const c = mesh(new THREE.BoxGeometry(w, 0.1, 0.1), toon(0x6a6a6a), 0.4);
    c.position.set(0, y, 0);
    g.add(c);
  }
  const tr = mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.8, 10), toon(0x8a9098), 0.5);
  tr.position.set(0, 6.4, 0.32);
  g.add(tr);
  parent.add(g);
  return g;
}

// Fios caídos (catenária) entre pontos.
export function wires(parent, pts, sag = 0.6, color = 0x1a1a1a) {
  const positions = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const N = 12;
    for (let k = 0; k < N; k++) {
      for (const u of [k / N, (k + 1) / N]) {
        positions.push(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - Math.sin(u * Math.PI) * sag, a[2] + (b[2] - a[2]) * u);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const l = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color }));
  parent.add(l);
  return l;
}

// Casa simples com telhado de duas águas.
export function house(parent, x, z, w, d, h, opts = {}) {
  const { wall = 0xe8e0d0, roof = 0x4a5a6a, ry = 0, night = false, lit = 0.5, seed = 1 } = opts;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  const tex = facadeTex({ cols: 2, rows: 2, night, lit, wall: '#' + new THREE.Color(wall).getHexString(), key: 'house' + seed });
  const body = B(g, w, h, d, 0xffffff, 0, 0, 0, { map: tex, cast: true });
  if (night) {
    body.material = toon(0xffffff, { map: tex, emissive: 0xffffff, ei: 0.35, unique: true });
    body.material.emissiveMap = tex;
  }
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 - 0.3, 0);
  shape.lineTo(0, h * 0.45);
  shape.lineTo(w / 2 + 0.3, 0);
  shape.lineTo(-w / 2 - 0.3, 0);
  const rg = new THREE.ExtrudeGeometry(shape, { depth: d + 0.6, bevelEnabled: false });
  rg.translate(0, h, -d / 2 - 0.3);
  const r = mesh(rg, toon(roof), 0.5, { cast: true });
  g.add(r);
  parent.add(g);
  return g;
}
