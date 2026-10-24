// Cenário: rua residencial ao entardecer (cena de suspense). A rua corre ao
// longo de Z; muros de blocos dos dois lados, casas com janelas acesas,
// postes com fios, postes de luz que piscam, máquina de bebidas, espelho
// convexo na esquina e as lixeiras de onde pula o gato.
import * as THREE from 'three';
import { toon, flat, mesh, canvasTexture } from '../toon.js';
import { B, ground, freeze, asphaltTex, blockWallTex, utilityPole, wires, streetLamp, house, skyline } from './common.js';
import { makeTrashCan, makeTrashBag } from '../props.js';

export function buildStreet(q) {
  const g = new THREE.Group();
  ground(g, 400, 400, toon(0x4a5a3a), 0, 0, -0.03);
  B(g, 6.4, 0.02, 180, 0xffffff, 0, -0.02, 0, { map: asphaltTex(), uv: 1 / 6 });
  for (const x of [-2.75, 2.75]) B(g, 0.12, 0.022, 180, 0xe8e8e0, x, -0.015, 0);
  // faixa de pedestre e "PARE" na esquina
  for (let i = 0; i < 6; i++) B(g, 0.45, 0.022, 3, 0xe8e8e0, -2.2 + i * 0.9, -0.012, -26);
  // muros
  const wall = blockWallTex();
  const lamps = [];
  for (const s of [1, -1]) {
    for (let z = -88; z < 88; z += 11) {
      if (z > -34 && z < -24) continue; // cruzamento
      const gap = 1.2;
      B(g, 0.16, 1.7, 11 - gap, 0xffffff, s * 3.35, 0, z + 5.5, { map: wall, uv: [1 / 2, 1 / 1.7], cast: true });
      B(g, 0.22, 0.08, 11 - gap, 0x8a867c, s * 3.35, 1.7, z + 5.5);
    }
    let k = 0;
    for (let z = -84; z < 84; z += 11) {
      if (z > -36 && z < -22) continue;
      house(g, s * 9, z + 5, 9, 8, 5.5 + (k % 3) * 1.2, {
        ry: s > 0 ? -Math.PI / 2 : Math.PI / 2,
        wall: [0xd8d0c0, 0xc8d0d8, 0xe0d4c4, 0xd0c8b8][k % 4],
        roof: [0x3a4a5a, 0x5a3a32, 0x2a3a4a, 0x4a4a4a][k % 4],
        night: true,
        lit: 0.55,
        seed: 50 + k + (s > 0 ? 20 : 0),
      });
      k++;
    }
  }
  // postes e fios
  const pts = [];
  for (let z = -80; z <= 80; z += 16) {
    utilityPole(g, 3.0, z);
    pts.push(z);
  }
  for (const y of [8.25, 7.35]) for (const dx of [-0.8, 0.8]) wires(g, pts.map((z) => [3.0 + dx, y, z]), 0.45);
  for (const z of [-48, -16, 16, 48]) lamps.push(streetLamp(g, 2.75, z, { h: 5.2, arm: 0.6, ry: -Math.PI / 2, color: 0xe8f0ff }));
  for (const z of [-32, 0, 32]) lamps.push(streetLamp(g, -3.0, z, { h: 4.8, arm: 0.6, ry: Math.PI / 2, color: 0xfff0c8 }));
  // máquina de bebidas brilhando
  const vend = canvasTexture(128, 256, (c, W, H) => {
    c.fillStyle = '#eaf4ff';
    c.fillRect(0, 0, W, H);
    const cols = ['#e83a3a', '#3a8ae8', '#f0c030', '#3ac06a', '#a050d0', '#f08030'];
    for (let j = 0; j < 3; j++)
      for (let i = 0; i < 4; i++) {
        c.fillStyle = cols[(i + j * 3) % cols.length];
        c.fillRect(10 + i * 28, 20 + j * 50, 18, 34);
      }
    c.fillStyle = '#222';
    c.fillRect(20, 190, 88, 30);
  });
  B(g, 0.75, 1.85, 1.0, 0x2a5ad0, -2.95, 0, 9, { outline: 0.5 });
  const vf = B(g, 0.02, 1.4, 0.8, 0xffffff, -2.56, 0.3, 9);
  vf.material = flat(0xffffff, { map: vend });
  const vl = new THREE.PointLight(0xc8e0ff, 3, 6, 1.6);
  vl.position.set(-2.2, 1.2, 9);
  g.add(vl);
  // espelho convexo
  const mpole = mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 8), toon(0xf07a2a), 0.4);
  mpole.position.set(2.9, 1.6, -22.5);
  g.add(mpole);
  const mirror = mesh(new THREE.CircleGeometry(0.42, 24), toon(0xc8d8e8, { emissive: 0x3a4a6a, ei: 0.5 }), 0);
  mirror.position.set(2.9, 3.0, -22.35);
  mirror.rotation.y = -0.4;
  g.add(mirror);
  const ring = mesh(new THREE.TorusGeometry(0.42, 0.05, 6, 24), toon(0xf07a2a), 0.4);
  ring.position.copy(mirror.position);
  ring.rotation.y = -0.4;
  g.add(ring);
  // lixeiras e sacos (o gato sai daqui)
  const net = new THREE.Group();
  net.position.set(-2.7, 0, -6);
  g.add(net);
  for (const [x, z] of [
    [0, 0],
    [0.1, 0.7],
  ]) {
    const t = makeTrashCan(0x3a5a8a);
    t.position.set(x, 0, z);
    net.add(t);
  }
  const bag = makeTrashBag(0x2a3a2a);
  bag.position.set(0.15, 0, -0.8);
  net.add(bag);
  // luzes pontuais principais (as tomadas reposicionam)
  const pl1 = new THREE.PointLight(0xfff0c8, 0, 9, 1.6);
  const pl2 = new THREE.PointLight(0xe8f0ff, 0, 9, 1.6);
  g.add(pl1, pl2);
  pl1.userData.dynamic = pl2.userData.dynamic = true;
  skyline(g, { r0: 160, r1: 300, n: 90, night: true, color: 0x3a3a52, seed: 21, hMax: 50 });
  freeze(g);
  return {
    group: g,
    lamps,
    pl1,
    pl2,
    net,
    env: {
      sky: 'dusk',
      hemi: { sky: 0x8a7ab0, ground: 0x4a3a40, int: 1.1 },
      sun: { color: 0xff9a70, int: 1.1, dir: [-0.7, 0.18, 0.7], box: 22, center: [0, 0, 0] },
      fog: { color: 0x6a5a7a, near: 25, far: 170 },
      rim: 0x4a2a3a,
    },
  };
}
