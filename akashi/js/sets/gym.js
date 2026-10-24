// Cenário: atrás do ginásio. Faixa estreita entre a parede do ginásio
// (z = -3) e a grade da escola (z = +6); a entrada fica no lado x = +9,
// por onde o sol da tarde entra baixo e projeta sombras compridas.
import * as THREE from 'three';
import { toon, flat, mesh, canvasTexture } from '../toon.js';
import { B, ground, freeze, concreteTex, chainFenceTex, greenTree, bush, house, facadeTex } from './common.js';
import { makeTrashCan, makeCrate } from '../props.js';

export function buildGym(q) {
  const g = new THREE.Group();
  ground(g, 300, 300, toon(0x7aa850), 0, 0, -0.02);
  B(g, 40, 0.03, 9, 0xffffff, -6, -0.02, 1.5, { map: concreteTex('#b6aa92', 'dirt'), uv: 1 / 4 });
  // parede do ginásio
  B(g, 34, 1.3, 0.3, 0x9a9488, -8, 0, -3.15, { cast: true });
  B(g, 34, 8.7, 26, 0xe2d6c0, -8, 1.3, -16.3, { cast: true });
  for (let x = -22; x <= 6; x += 4) {
    const w = B(g, 2.4, 0.9, 0.06, 0x5a6a7a, x, 6.2, -3.0);
    w.material = toon(0x6a7e92, { emissive: 0x1a2a3a, ei: 0.4 });
  }
  B(g, 0.18, 9.5, 0.18, 0x8a8a8a, -15.5, 0, -2.9, { outline: 0.3 });
  B(g, 1.3, 2.2, 0.1, 0x7a8288, -10, 0, -2.98, { outline: 0.4 });
  B(g, 1.6, 0.15, 0.8, 0x9a9488, -10, 0, -2.6);
  const exit = canvasTexture(128, 64, (c, W, H) => {
    c.fillStyle = '#2ab060';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#fff';
    c.font = 'bold 26px Arial';
    c.fillText('SAÍDA', 22, 42);
  });
  const ex = B(g, 0.6, 0.3, 0.04, 0xffffff, -10, 2.35, -2.92, { map: exit });
  ex.material = flat(0xffffff, { map: exit });
  // máquina de bebidas encostada na parede
  const vend = canvasTexture(128, 256, (c, W, H) => {
    c.fillStyle = '#d8e8f4';
    c.fillRect(0, 0, W, H);
    const cols = ['#e83a3a', '#3a8ae8', '#f0c030', '#3ac06a', '#a050d0', '#f08030'];
    for (let j = 0; j < 3; j++)
      for (let i = 0; i < 4; i++) {
        c.fillStyle = cols[(i + j * 2) % cols.length];
        c.fillRect(10 + i * 28, 20 + j * 50, 18, 34);
      }
    c.fillStyle = '#222';
    c.fillRect(20, 190, 88, 30);
  });
  B(g, 1.0, 1.85, 0.75, 0xd03030, -18, 0, -2.6, { outline: 0.5, cast: true });
  const vf = B(g, 0.8, 1.4, 0.02, 0xffffff, -18, 0.3, -2.22);
  vf.material = flat(0xffffff, { map: vend });
  // grade da escola e o bairro além
  const fm = new THREE.MeshBasicMaterial({ map: chainFenceTex(), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
  const geo = new THREE.PlaneGeometry(40, 2.6);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 100, uv.getY(i) * 6.5);
  const fence = new THREE.Mesh(geo, fm);
  fence.position.set(-6, 1.3, 6);
  g.add(fence);
  for (let x = -26; x <= 14; x += 2.5) B(g, 0.07, 2.65, 0.07, 0x7a8288, x, 0, 6);
  B(g, 40, 0.06, 0.06, 0x7a8288, -6, 2.6, 6);
  for (let x = -24; x <= 12; x += 5) greenTree(g, x, 9 + (x % 2), 1.3, 70 + x, x % 3 ? 0x5a9a4a : 0x6aa456);
  for (let x = -24; x <= 4; x += 3.5) bush(g, x, 5.2, 0.7, 0x5a8a3a);
  for (let i = 0; i < 6; i++) house(g, -30 + i * 11, 20, 8, 7, 5.5, { wall: 0xe8e0d0, roof: 0x7a4a3a, seed: 30 + i });
  // entulho: carteiras velhas, latas de lixo, caixotes, cones
  const desk = (x, z, ry, y = 0) => {
    const d = new THREE.Group();
    d.position.set(x, y, z);
    d.rotation.y = ry;
    B(d, 0.62, 0.03, 0.45, 0xb8956a, 0, 0.7, 0, { outline: 0.4 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(d, 0.03, 0.7, 0.03, 0x7a8088, sx * 0.28, 0, sz * 0.19);
    g.add(d);
  };
  desk(-21, -1.6, 0.2);
  desk(-21.2, -1.7, -0.1, 0.73);
  desk(-19.8, -1.4, 0.5);
  const tc = makeTrashCan(0x6a7a5a);
  tc.position.set(-14.5, 0, -2.4);
  g.add(tc);
  const cr = makeCrate();
  cr.position.set(-13.5, 0.225, -2.5);
  g.add(cr);
  for (const [x, z] of [
    [2, -2.4],
    [2.6, -2.2],
  ]) {
    const c = mesh(new THREE.ConeGeometry(0.17, 0.5, 10), toon(0xf06a2a), 0.5);
    c.position.set(x, 0.25, z);
    g.add(c);
  }
  // mato
  const weed = toon(0x6a9a3a);
  for (let i = 0; i < 40; i++) {
    const x = -24 + ((i * 7.31) % 32);
    const z = (i % 2 ? -2.7 : 5.5) + Math.sin(i) * 0.2;
    const w = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.35, 4), weed);
    w.position.set(x, 0.17, z);
    g.add(w);
  }
  // sombra comprida (silhueta) que as tomadas posicionam
  const shTex = canvasTexture(64, 256, (c, W, H) => {
    c.fillStyle = 'rgba(0,0,0,1)';
    c.beginPath();
    c.ellipse(W / 2, H * 0.1, W * 0.2, H * 0.07, 0, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(W * 0.22, H * 0.17);
    c.lineTo(W * 0.78, H * 0.17);
    c.lineTo(W * 0.86, H * 0.62);
    c.lineTo(W * 0.62, H * 0.98);
    c.lineTo(W * 0.38, H * 0.98);
    c.lineTo(W * 0.14, H * 0.62);
    c.closePath();
    c.fill();
  });
  const longShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: shTex, transparent: true, opacity: 0.6, depthWrite: false, color: 0x2a1020 }),
  );
  longShadow.rotation.x = -Math.PI / 2;
  longShadow.renderOrder = 2;
  longShadow.visible = false;
  longShadow.userData.dynamic = true;
  g.add(longShadow);
  freeze(g);
  return {
    group: g,
    longShadow,
    reset() {
      longShadow.visible = false;
    },
    env: {
      sky: 'afternoon',
      hemi: { sky: 0xd8ccd8, ground: 0x8a7a5a, int: 1.15 },
      sun: { color: 0xffd6a0, int: 2.6, dir: [0.85, 0.3, 0.32], box: 18, center: [-4, 0, 1] },
      fog: { color: 0xd8c8b8, near: 50, far: 400 },
      rim: 0x3a2a10,
    },
  };
}
