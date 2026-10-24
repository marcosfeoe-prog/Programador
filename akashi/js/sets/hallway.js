// Cenário: corredor da escola. Corre ao longo do eixo X (de -22 a 22), com
// as salas de aula do lado z = -1.6 e as janelas do lado z = +1.6, por onde
// entra o sol da manhã (faixas de luz no chão).
import * as THREE from 'three';
import { toon, flat, canvasTexture } from '../toon.js';
import { B, freeze, woodFloorTex, signTex, sakuraTree, facadeTex, skyline } from './common.js';
import { RNG } from '../util.js';

function posterTex(seed) {
  return canvasTexture(256, 160, (g, W, H) => {
    const rng = new RNG(seed);
    g.fillStyle = '#c8a070';
    g.fillRect(0, 0, W, H);
    const cols = ['#f4f0e0', '#ffd6e0', '#d6ecff', '#fff2b0', '#e0ffd6'];
    for (let i = 0; i < 5; i++) {
      const x = rng.float(5, W - 80);
      const y = rng.float(5, H - 70);
      g.fillStyle = rng.pick(cols);
      g.save();
      g.translate(x + 35, y + 30);
      g.rotate(rng.float(-0.1, 0.1));
      g.fillRect(-35, -30, 70, 60);
      g.fillStyle = 'rgba(40,40,60,0.6)';
      for (let k = 0; k < 4; k++) g.fillRect(-28, -20 + k * 12, rng.float(20, 56), 4);
      g.fillStyle = '#d03040';
      g.beginPath();
      g.arc(0, -30, 3, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  });
}

function doorTex() {
  return canvasTexture(128, 256, (g, W, H) => {
    g.fillStyle = '#c9a678';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#8a6a44';
    g.lineWidth = 6;
    g.strokeRect(3, 3, W - 6, H - 6);
    g.fillStyle = '#bcd8ec';
    g.fillRect(22, 30, W - 44, 70);
    g.strokeRect(22, 30, W - 44, 70);
    g.fillStyle = '#6a5a4a';
    g.fillRect(W - 26, 130, 8, 30);
  });
}

// Faixa de luz: quadrilátero no chão (sombra da janela projetada pelo sol).
function lightPatch(parent, x0, x1, y0, y1, wz, sun, mat) {
  const pts = [];
  for (const [x, y] of [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ]) {
    const t = y / -sun.y;
    pts.push([x + sun.x * t, 0.012, Math.max(-1.55, wz + sun.z * t)]);
  }
  const geo = new THREE.BufferGeometry();
  const p = [...pts[0], ...pts[1], ...pts[2], ...pts[0], ...pts[2], ...pts[3]];
  geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 1;
  parent.add(m);
  // feixe volumétrico (planos translúcidos da janela até o chão)
  const rays = new THREE.BufferGeometry();
  const r = [];
  const top = [
    [x0, y1, wz],
    [x1, y1, wz],
  ];
  const bot = [pts[3], pts[2]];
  r.push(...top[0], ...top[1], ...bot[1], ...top[0], ...bot[1], ...bot[0]);
  rays.setAttribute('position', new THREE.Float32BufferAttribute(r, 3));
  rays.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0], 2));
  const rm = new THREE.Mesh(rays, RAY_MAT());
  rm.renderOrder = 3;
  parent.add(rm);
}

let rayMat;
export function RAY_MAT() {
  if (!rayMat) {
    const tex = canvasTexture(64, 128, (g, W, H) => {
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, 'rgba(255,240,210,0.0)');
      gr.addColorStop(0.15, 'rgba(255,240,210,0.9)');
      gr.addColorStop(1, 'rgba(255,240,210,0.0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
    });
    rayMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.09,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
  }
  return rayMat;
}

export function buildHallway(q) {
  const g = new THREE.Group();
  const L = 44;
  B(g, L, 0.1, 3.4, 0xffffff, 0, -0.1, 0, { map: woodFloorTex(), uv: 0.5 });
  B(g, L, 0.1, 3.4, 0xf4f2ec, 0, 3.1, 0, { cast: true, mat: toon(0xf4f2ec, { emissive: 0x8a867c }) });
  // parede das salas (z = -1.6)
  B(g, L, 3.1, 0.12, 0xf0e8d8, 0, 0, -1.72, { cast: true });
  B(g, L, 1.0, 0.04, 0xb8946a, 0, 0, -1.64);
  B(g, L, 0.06, 0.06, 0x8a6a4a, 0, 1.0, -1.62);
  const dTex = doorTex();
  const rooms = ['2-A', '2-B', 'Sala dos Prof.', '2-C', '2-D'];
  [-16, -8, 0, 8, 16].forEach((x, i) => {
    const d = B(g, 1.7, 2.1, 0.06, 0xffffff, x, 0, -1.6, { map: dTex });
    d.material = toon(0xffffff, { map: dTex });
    B(g, 1.9, 0.08, 0.1, 0x8a6a4a, x, 2.1, -1.6);
    const sign = B(g, 0.06, 0.32, 0.9, 0xffffff, x + 1.1, 2.55, -1.2, {
      map: signTex(rooms[i], { w: 256, h: 96, font: 'bold 48px Arial, sans-serif', bg: '#fbfaf4' }),
    });
    sign.material = flat(0xffffff, { map: sign.material.map });
  });
  [-12, -4, 4, 12].forEach((x, i) => {
    const b = B(g, 1.8, 1.05, 0.04, 0xffffff, x, 1.25, -1.62, { map: posterTex(i + 3) });
    b.material = toon(0xffffff, { map: b.material.map });
  });
  // armários no fim do corredor
  const lockTex = canvasTexture(128, 128, (c, W) => {
    c.fillStyle = '#9aa4ae';
    c.fillRect(0, 0, W, W);
    c.strokeStyle = '#6a737c';
    c.lineWidth = 4;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) c.strokeRect(i * 64 + 4, j * 64 + 4, 56, 56);
    c.fillStyle = '#4a5058';
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) c.fillRect(i * 64 + 44, j * 64 + 28, 6, 12);
  });
  B(g, 5, 1.9, 0.45, 0xffffff, 19, 0, -1.4, { map: lockTex, uv: [1 / 1, 1 / 0.95] });
  B(g, 3, 1.9, 0.45, 0xffffff, -19.5, 0, -1.4, { map: lockTex, uv: [1 / 1, 1 / 0.95] });
  // parede das janelas (z = +1.6): parapeito, verga e montantes
  B(g, L, 0.9, 0.15, 0xf0e8d8, 0, 0, 1.72, { cast: true });
  B(g, L, 0.06, 0.3, 0xd8cfc0, 0, 0.9, 1.62);
  B(g, L, 0.5, 0.15, 0xf0e8d8, 0, 2.6, 1.72, { cast: true });
  for (let x = -22; x <= 22; x += 1.8) B(g, 0.1, 1.7, 0.14, 0xd0d4d8, x, 0.9, 1.72, { cast: true });
  B(g, L, 0.05, 0.1, 0xd0d4d8, 0, 1.75, 1.74);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(L, 1.7), flat(0xcfe8ff, { transparent: true, opacity: 0.08, dw: false }));
  glass.position.set(0, 1.75, 1.66);
  glass.rotation.y = Math.PI;
  g.add(glass);
  // paredes do fim
  for (const s of [1, -1]) B(g, 0.2, 3.1, 3.4, 0xf0e8d8, s * 22.1, 0, 0);
  // luminárias
  for (let x = -20; x <= 20; x += 4)
    for (const z of [-0.6, 0.6]) {
      const l = B(g, 1.2, 0.05, 0.16, 0xffffff, x, 3.03, z);
      l.material = flat(0xfafcff);
    }
  // faixas de sol no chão
  const sun = new THREE.Vector3(0.35, -0.6, -0.72).normalize();
  const pm = new THREE.MeshBasicMaterial({
    color: 0xffe2b0,
    transparent: true,
    opacity: 0.32,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  for (let x = -22; x < 22; x += 1.8) lightPatch(g, x + 0.06, x + 1.74, 0.95, 2.55, 1.66, sun, pm);
  // lá fora: pátio, cerejeiras e outra ala do prédio
  const out = new THREE.Group();
  g.add(out);
  B(out, 120, 0.1, 40, 0xddd3c2, 0, -4.5, 22);
  for (let x = -24; x <= 24; x += 8) sakuraTree(out, x, 9 + (x % 3), 1.4, 20 + x, { outline: 0 });
  for (const t of out.children) if (t.isGroup) t.position.y = -4.5;
  B(out, 120, 16, 10, 0xffffff, 0, -4.5, 34, { map: facadeTex({ cols: 4, rows: 1, key: 'school' }), uv: [1 / 14, 1 / 4.33] });
  skyline(out, { r0: 230, r1: 360, n: 60, arc: [0.4, 2.7], color: 0xc4cede, seed: 5, hMax: 45 });

  freeze(g);
  return {
    group: g,
    env: {
      sky: 'day',
      hemi: { sky: 0xfff6ea, ground: 0xc8a882, int: 1.55 },
      sun: { color: 0xffeccc, int: 2.2, dir: [-0.35, 0.6, 0.72], box: 24, center: [0, 1, 0] },
      fog: { color: 0xe8eef6, near: 40, far: 300 },
    },
  };
}
