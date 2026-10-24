// Cenário: terraço da escola. Piso de concreto, grade alta em volta, a casinha
// da escada (porta em z = -3.8) e a caixa d'água; abaixo, o pátio e a cidade.
import * as THREE from 'three';
import { toon, flat, mesh } from '../toon.js';
import { B, freeze, tileTex, chainFenceTex, skyline, mountains, sakuraTree, facadeTex } from './common.js';

export function buildRooftop(q) {
  const g = new THREE.Group();
  const W = 26;
  const D = 20;
  B(g, W, 0.3, D, 0xffffff, 0, -0.3, 0, { map: tileTex('#c4bfb4', '#a8a296', 4, 'roof'), uv: 1 / 4 });
  // mureta e grade
  const fenceTex = chainFenceTex();
  const fm = new THREE.MeshBasicMaterial({ map: fenceTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
  fm.map.wrapS = fm.map.wrapT = THREE.RepeatWrapping;
  const sides = [
    [0, D / 2, W, 0],
    [0, -D / 2, W, 0],
    [W / 2, 0, D, Math.PI / 2],
    [-W / 2, 0, D, Math.PI / 2],
  ];
  for (const [x, z, len, ry] of sides) {
    B(g, len, 0.4, 0.3, 0xd8d2c6, x, 0, z, { ry, outline: 0.4 });
    const geo = new THREE.PlaneGeometry(len, 2.4);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len * 2.5, uv.getY(i) * 2.4 * 2.5);
    const f = new THREE.Mesh(geo, fm);
    f.position.set(x, 1.6, z);
    f.rotation.y = ry;
    g.add(f);
    B(g, len, 0.06, 0.06, 0x8a9098, x, 2.8, z, { ry });
    B(g, len, 0.05, 0.05, 0x8a9098, x, 0.4, z, { ry });
    for (let k = -len / 2; k <= len / 2 + 0.01; k += 2) {
      const px = x + Math.cos(ry) * k;
      const pz = z - Math.sin(ry) * k;
      B(g, 0.07, 2.45, 0.07, 0x8a9098, px, 0.4, pz);
    }
  }
  // casinha da escada
  B(g, 5, 3.2, 4, 0xe6e0d4, -8, 0, -6, { cast: true, outline: 0.5 });
  B(g, 5.4, 0.25, 4.4, 0xc8c0b2, -8, 3.2, -6, { outline: 0.4 });
  const door = B(g, 1.1, 2.15, 0.08, 0x7a8a96, -8, 0, -3.97, { outline: 0.4 });
  door.userData.dynamic = true;
  B(g, 0.08, 0.12, 0.08, 0x2a2a2a, -7.6, 1.05, -3.9);
  // caixa d'água
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(g, 0.15, 2, 0.15, 0x8a9098, 7 + sx * 1.1, 0, -6 + sz * 1.1);
  const tank = mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.2, 20), toon(0xe8eef4), 0.6, { cast: true });
  tank.position.set(7, 3.1, -6);
  g.add(tank);
  B(g, 0.6, 0.6, 0.6, 0xb0bac4, 3, 0, -8, { outline: 0.4 });
  B(g, 1.6, 0.9, 1.0, 0xc8ccd0, 10, 0, 6, { outline: 0.4 });
  // embaixo: pátio, árvores, cidade
  const out = new THREE.Group();
  g.add(out);
  B(out, 600, 0.1, 600, 0x86b85a, 0, -14, 0);
  B(out, 70, 0.1, 50, 0xddd3c2, 0, -13.95, 30);
  for (let i = 0; i < 8; i++) {
    const t = sakuraTree(out, -24 + i * 7, 22, 1.3, 60 + i, { outline: 0 });
    t.position.y = -14;
  }
  B(out, 80, 13.7, 14, 0xffffff, -44, -14, 0, { map: facadeTex({ cols: 4, rows: 1, key: 'school' }), uv: [1 / 14, 1 / 4.33] });
  skyline(out, { r0: 120, r1: 330, n: 170, y: -14, color: 0xb4c0d4, seed: 12 });
  mountains(out, { r: 480, color: 0x9fb2cc });
  freeze(g);
  return {
    group: g,
    door,
    reset() {
      door.position.set(-8, 1.075, -3.97);
      door.rotation.y = 0;
    },
    env: {
      sky: 'day',
      hemi: { sky: 0xe6eeff, ground: 0x9a9080, int: 1.4 },
      sun: { color: 0xfff6e8, int: 2.4, dir: [0.35, 0.8, 0.45], box: 16, center: [0, 0, 0] },
      fog: { color: 0xc8daf0, near: 100, far: 700 },
    },
  };
}
