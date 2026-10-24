// Cenário: sala de aula 2-A. Lousa na frente (z = -4.6), janelas à esquerda
// dos alunos (x = -4.6), portas à direita. Carteiras em 6 colunas × 5 fileiras;
// o Akashi senta na última fileira, junto à janela.
import * as THREE from 'three';
import { toon, flat, outlineMaterial, smoothNormalGeo, canvasTexture, mergeGeos } from '../toon.js';
import { B, freeze, woodFloorTex, sakuraTree, skyline, signTex } from './common.js';
import { RAY_MAT } from './hallway.js';
import { makeClock } from './school.js';

export const DESK_X = [-3.35, -2.05, -0.75, 0.55, 1.85, 3.15];
export const DESK_Z = [-1.9, -0.75, 0.4, 1.55, 2.7];
// Posição da cadeira (onde o aluno senta) da carteira (col, row).
export function seat(col, row) {
  return { x: DESK_X[col], z: DESK_Z[row] + 0.42 };
}

function boardTex() {
  return canvasTexture(1024, 256, (g, W, H) => {
    g.fillStyle = '#2f5a46';
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 30; i++) {
      g.fillStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.03})`;
      g.fillRect(Math.random() * W, Math.random() * H, 120, 30);
    }
    g.fillStyle = 'rgba(245,245,235,0.92)';
    g.font = 'bold 54px "Comic Sans MS", "Chalkboard SE", cursive';
    g.fillText('Bem-vinda, Hana Mizuki!', 60, 110);
    g.font = '36px "Comic Sans MS", cursive';
    g.fillText('Matemática — p. 42', 80, 190);
    g.fillText('8 de abril', 800, 70);
    g.fillStyle = 'rgba(255,200,220,0.9)';
    g.font = 'bold 44px "Comic Sans MS", cursive';
    g.fillText('♡', 690, 110);
    g.strokeStyle = 'rgba(245,245,235,0.7)';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(560, 160);
    g.lineTo(700, 230);
    g.lineTo(880, 160);
    g.stroke();
  });
}

export function buildClassroom(q) {
  const g = new THREE.Group();
  const R = 4.6;
  B(g, R * 2, 0.1, R * 2, 0xffffff, 0, -0.1, 0, { map: woodFloorTex(), uv: 0.5 });
  B(g, R * 2, 0.1, R * 2, 0xf4f2ec, 0, 3.1, 0, { cast: true, mat: toon(0xf4f2ec, { emissive: 0x8a867c }) });
  // frente (lousa)
  B(g, R * 2, 3.1, 0.12, 0xf0e8d8, 0, 0, -R - 0.06, { cast: true });
  const board = B(g, 6, 1.25, 0.05, 0xffffff, 0, 0.85, -R + 0.03, { map: boardTex() });
  board.material = toon(0xffffff, { map: board.material.map });
  B(g, 6.2, 0.08, 0.1, 0x8a6a4a, 0, 2.1, -R + 0.04);
  B(g, 6.2, 0.06, 0.16, 0x8a6a4a, 0, 0.8, -R + 0.08);
  B(g, 9.2, 0.15, 1.6, 0xb08a5e, 0, 0, -R + 0.8);
  B(g, 1.5, 0.78, 0.65, 0x9a7650, 0, 0.15, -3.55, { outline: 0.5, cast: true });
  const clock = makeClock(g, 0, 2.6, -R + 0.07, 0.24);
  // parede de trás com escaninhos
  B(g, R * 2, 3.1, 0.12, 0xf0e8d8, 0, 0, R + 0.06);
  const cub = canvasTexture(256, 128, (c, W, H) => {
    c.fillStyle = '#b8946a';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#5a4030';
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) c.fillRect(i * 64 + 6, j * 64 + 6, 52, 52);
    const cols = ['#2a1a14', '#3a2a5a', '#1a2a3a', '#4a1a1a'];
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 2; j++) {
        c.fillStyle = cols[(i + j) % 4];
        c.fillRect(i * 64 + 12, j * 64 + 26, 40, 30);
      }
  });
  B(g, 8, 1.1, 0.4, 0xffffff, 0, 0, R - 0.2, { map: cub, uv: [1 / 2, 1 / 1.1] });
  const bb = B(g, 4, 0.9, 0.04, 0xc8a070, 0, 1.6, R - 0.02);
  bb.rotation.y = Math.PI;
  // parede das portas (x = +R)
  B(g, 0.12, 3.1, R * 2, 0xf0e8d8, R + 0.06, 0, 0);
  for (const z of [-3.6, 3.6]) {
    B(g, 0.06, 2.1, 1.6, 0xc9a678, R - 0.01, 0, z);
    B(g, 0.07, 0.6, 0.9, 0xbcd8ec, R - 0.02, 1.25, z);
  }
  const sign = B(g, 0.06, 0.3, 0.8, 0xffffff, R + 0.2, 2.5, -3.6, { map: signTex('2-A', { w: 256, h: 96 }) });
  sign.material = flat(0xffffff, { map: sign.material.map });
  // parede das janelas (x = -R)
  B(g, 0.15, 0.9, R * 2, 0xf0e8d8, -R - 0.06, 0, 0, { cast: true });
  B(g, 0.15, 0.5, R * 2, 0xf0e8d8, -R - 0.06, 2.6, 0, { cast: true });
  B(g, 0.3, 0.06, R * 2, 0xd8cfc0, -R + 0.05, 0.9, 0);
  for (let z = -R; z <= R + 0.01; z += 1.53) B(g, 0.14, 1.7, 0.1, 0xd0d4d8, -R - 0.06, 0.9, z, { cast: true });
  B(g, 0.1, 0.05, R * 2, 0xd0d4d8, -R - 0.08, 1.75, 0);
  // cortinas
  const cur = toon(0xf4ecd4, { side: THREE.DoubleSide });
  const curGeo = new THREE.PlaneGeometry(0.6, 2.2, 6, 1);
  const p = curGeo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 18) * 0.05);
  curGeo.computeVertexNormals();
  for (const z of [-4.2, 4.2]) {
    const c = new THREE.Mesh(curGeo, cur);
    c.position.set(-R + 0.12, 1.85, z);
    c.rotation.y = Math.PI / 2;
    g.add(c);
  }
  // feixes de sol pela janela
  const sun = new THREE.Vector3(0.75, -0.55, 0.3).normalize();
  for (let z = -R; z < R - 0.5; z += 1.53) {
    const rays = new THREE.BufferGeometry();
    const top = [
      [-R, 2.55, z + 0.06],
      [-R, 2.55, z + 1.47],
    ];
    const bot = top.map(([x, y, zz]) => {
      const t = y / -sun.y;
      return [x + sun.x * t, 0.02, zz + sun.z * t];
    });
    rays.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([...top[0], ...top[1], ...bot[1], ...top[0], ...bot[1], ...bot[0]], 3),
    );
    rays.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0], 2));
    const m = new THREE.Mesh(rays, RAY_MAT());
    m.renderOrder = 3;
    g.add(m);
  }
  // luminárias
  for (const x of [-2.2, 0, 2.2])
    for (const z of [-2.5, 0, 2.5]) {
      const l = B(g, 0.16, 0.05, 1.2, 0xffffff, x, 3.03, z);
      l.material = flat(0xfafcff);
    }

  // carteiras e cadeiras (instanciadas)
  const wood = [];
  const metal = [];
  const add = (arr, w, h, d, x, y, z) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    geo.translate(x, y + h / 2, z);
    arr.push({ geo });
  };
  add(wood, 0.62, 0.03, 0.45, 0, 0.7, 0);
  add(metal, 0.58, 0.12, 0.38, 0, 0.56, -0.02);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(metal, 0.03, 0.7, 0.03, sx * 0.28, 0, sz * 0.19);
  add(wood, 0.4, 0.03, 0.38, 0, 0.42, 0.45);
  add(wood, 0.4, 0.26, 0.03, 0, 0.6, 0.65);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(metal, 0.025, 0.42, 0.025, sx * 0.17, 0, 0.45 + sz * 0.16);
  for (const sx of [-1, 1]) add(metal, 0.025, 0.5, 0.025, sx * 0.17, 0.42, 0.63);
  const woodGeo = mergeGeos(wood);
  const metalGeo = mergeGeos(metal);
  const n = DESK_X.length * DESK_Z.length;
  const wm = new THREE.InstancedMesh(woodGeo, toon(0xd8b080), n);
  const mm = new THREE.InstancedMesh(metalGeo, toon(0x8a9098), n);
  const wo = new THREE.InstancedMesh(smoothNormalGeo(woodGeo), outlineMaterial(0x1b1416, 0.7), n);
  const mtx = new THREE.Matrix4();
  let i = 0;
  for (const z of DESK_Z)
    for (const x of DESK_X) {
      mtx.makeTranslation(x, 0, z);
      wm.setMatrixAt(i, mtx);
      mm.setMatrixAt(i, mtx);
      wo.setMatrixAt(i, mtx);
      i++;
    }
  for (const m of [wm, mm, wo]) {
    m.castShadow = m !== wo;
    m.receiveShadow = true;
    g.add(m);
  }

  // lá fora: cerejeira bem na janela, pátio e cidade
  const out = new THREE.Group();
  g.add(out);
  B(out, 60, 0.1, 80, 0xddd3c2, -36, -8, 0);
  sakuraTree(out, -11, -2.5, 1.6, 41, { outline: 0 });
  sakuraTree(out, -9.5, 5, 1.5, 42, { outline: 0 });
  sakuraTree(out, -10, -8, 1.5, 43, { outline: 0 });
  for (const t of out.children) if (t.isGroup) t.position.y = -4;
  skyline(out, { r0: 220, r1: 340, hMax: 45, n: 60, arc: [Math.PI * 0.65, Math.PI * 1.35], color: 0xc4cede, seed: 6 });

  freeze(g);
  return {
    group: g,
    clock,
    env: {
      sky: 'day',
      hemi: { sky: 0xfff6ea, ground: 0xc8a882, int: 1.6 },
      sun: { color: 0xffeccc, int: 2.2, dir: [-0.75, 0.55, -0.3], box: 8, center: [0, 1, 0] },
      fog: { color: 0xe8eef6, near: 40, far: 300 },
    },
  };
}
