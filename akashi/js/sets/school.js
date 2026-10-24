// Cenário: frente do Colégio Kōyō. Portão na rua (z = +22), caminho de
// cerejeiras até a entrada do prédio principal (fachada em z = -34) com a
// torre do relógio; ginásio à direita, casas do outro lado da rua e a
// cidade e as montanhas ao fundo.
import * as THREE from 'three';
import { toon, flat, mesh, canvasTexture } from '../toon.js';
import {
  B,
  ground,
  freeze,
  facadeTex,
  tileTex,
  asphaltTex,
  concreteTex,
  signTex,
  sakuraTree,
  greenTree,
  bush,
  skyline,
  mountains,
  utilityPole,
  wires,
  house,
} from './common.js';

function clockFaceTex() {
  return canvasTexture(256, 256, (g, W) => {
    g.fillStyle = '#fbfbf6';
    g.beginPath();
    g.arc(W / 2, W / 2, W / 2 - 4, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 10;
    g.strokeStyle = '#2a2a2a';
    g.stroke();
    g.fillStyle = '#2a2a2a';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.save();
      g.translate(W / 2 + Math.sin(a) * (W / 2 - 24), W / 2 - Math.cos(a) * (W / 2 - 24));
      g.rotate(a);
      g.fillRect(-4, -12, 8, i % 3 === 0 ? 28 : 18);
      g.restore();
    }
  });
}

// Ponteiros (o relógio mostra a hora pedida pela tomada).
export function makeClock(parent, x, y, z, r, ry = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  const face = new THREE.Mesh(new THREE.CircleGeometry(r, 40), flat(0xffffff, { map: clockFaceTex() }));
  g.add(face);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.06, 6, 40), toon(0x8a8a8a));
  g.add(rim);
  const hMat = flat(0x1a1a1a);
  const hour = new THREE.Group();
  const hm = new THREE.Mesh(new THREE.PlaneGeometry(r * 0.09, r * 0.55), hMat);
  hm.position.set(0, r * 0.25, 0.01);
  hour.add(hm);
  const min = new THREE.Group();
  const mm = new THREE.Mesh(new THREE.PlaneGeometry(r * 0.06, r * 0.82), hMat);
  mm.position.set(0, r * 0.38, 0.02);
  min.add(mm);
  g.add(hour, min);
  g.userData.dynamic = true;
  hour.userData.dynamic = true;
  min.userData.dynamic = true;
  g.userData.set = (hours) => {
    hour.rotation.z = -((hours % 12) / 12) * Math.PI * 2;
    min.rotation.z = -(hours % 1) * Math.PI * 2;
  };
  parent.add(g);
  return g;
}

export function buildSchool(q) {
  const g = new THREE.Group();
  // chão
  ground(g, 900, 900, toon(0x86b85a), 0, 0, -0.02);
  const pave = tileTex('#ddd3c2', '#c2b8a6', 8, 'pave');
  B(g, 74, 0.02, 56, 0xffffff, 0, -0.02, -6, { map: pave, uv: 1 / 16 });
  B(g, 6, 0.03, 56, 0xffffff, 0, -0.02, -6, { map: tileTex('#e2cdb4', '#c9b296', 6, 'path'), uv: 1 / 6 });
  // rua e calçadas
  B(g, 400, 0.02, 9, 0xffffff, 0, -0.02, 28.5, { map: asphaltTex(), uv: 1 / 8 });
  for (const z of [24.3, 32.7])
    B(g, 400, 0.12, 0.25, 0xe0e0e0, 0, 0, z);
  for (let x = -190; x < 190; x += 6) B(g, 3, 0.025, 0.15, 0xf2f2f2, x, -0.01, 28.5);
  B(g, 400, 0.1, 3, 0xc8c4bc, 0, -0.02, 35, { map: concreteTex('#c8c4bc', 'side'), uv: 1 / 3 });

  // muro da frente e portão
  const wallTex = concreteTex('#d8d2c4', 'wall');
  B(g, 55, 1.6, 0.35, 0xffffff, -32.5, 0, 22, { map: wallTex, uv: 1 / 3, cast: true });
  B(g, 55, 1.6, 0.35, 0xffffff, 32.5, 0, 22, { map: wallTex, uv: 1 / 3, cast: true });
  for (const s of [1, -1]) {
    B(g, 0.9, 2.5, 0.9, 0xcfc7b6, s * 5.2, 0, 22, { cast: true, outline: 0.5 });
    B(g, 1.1, 0.2, 1.1, 0xb8b0a0, s * 5.2, 2.5, 22, { outline: 0.4 });
  }
  const plate = B(g, 3.2, 0.7, 0.06, 0xffffff, 7.6, 0.6, 22.2, { map: signTex('COLÉGIO KŌYŌ', { bg: '#f6f1e4', font: 'bold 70px Georgia, serif' }) });
  plate.material = flat(0xffffff, { map: plate.material.map });
  // portão de correr aberto (grade)
  const gate = new THREE.Group();
  gate.position.set(7.6, 0, 21.4);
  g.add(gate);
  for (let i = 0; i < 12; i++) B(gate, 0.05, 1.5, 0.05, 0x6a6e76, -1.9 + i * 0.33, 0.05, 0);
  B(gate, 4, 0.08, 0.06, 0x6a6e76, 0, 1.5, 0);
  B(gate, 4, 0.08, 0.06, 0x6a6e76, 0, 0.1, 0);

  // prédio principal
  const fac = facadeTex({ cols: 4, rows: 1, key: 'school' });
  B(g, 78, 13, 12, 0xffffff, 0, 0, -40, { map: fac, uv: [1 / 14, 1 / 4.33], cast: true });
  B(g, 78.4, 0.9, 12.4, 0xe2dccf, 0, 13, -40);
  for (let k = 1; k < 3; k++) B(g, 78.2, 0.18, 12.2, 0xd2cabc, 0, k * 4.33 - 0.1, -40);
  // torre do relógio
  B(g, 9.5, 18, 13, 0xf2ece0, 0, 0, -39.6, { cast: true });
  B(g, 10, 0.8, 13.5, 0xd8d0c0, 0, 18, -39.6);
  B(g, 3, 1.8, 3, 0xd8d0c0, 0, 18.8, -39.6);
  const clock = makeClock(g, 0, 15.1, -33.05, 1.8);
  // entrada
  B(g, 7, 2.8, 0.2, 0x34445a, 0, 0, -33.15, { emissive: 0x182030, ei: 0.4 });
  for (let i = -1; i <= 1; i++) B(g, 0.08, 2.8, 0.25, 0x9a9aa0, i * 1.75, 0, -33.05);
  B(g, 8, 0.25, 3, 0xe8e2d6, 0, 3.0, -32.2, { cast: true, outline: 0.4 });
  B(g, 8, 0.15, 1.6, 0xcac2b2, 0, 0, -32.2);
  // letreiro vertical ao lado da entrada
  const vs = B(g, 0.9, 3.6, 0.1, 0xffffff, 5.2, 0.6, -33.0, {
    map: canvasTexture(64, 256, (c, W, H) => {
      c.fillStyle = '#f8f4ea';
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#222';
      c.font = 'bold 30px Georgia, serif';
      c.textAlign = 'center';
      [...'KŌYŌ'].forEach((ch, i) => c.fillText(ch, W / 2, 50 + i * 52));
    }),
  });
  vs.material = flat(0xffffff, { map: vs.material.map });

  // ginásio
  B(g, 24, 9, 30, 0xffffff, 50, 0, -14, { map: facadeTex({ cols: 3, rows: 1, wall: '#e6dccb', key: 'gym' }), uv: [1 / 10, 1 / 9], cast: true });
  const roof = mesh(new THREE.CylinderGeometry(12.4, 12.4, 30.6, 24, 1, false, -Math.PI / 2, Math.PI), toon(0x5d7a6e), 0.5, { cast: true });
  roof.rotation.x = Math.PI / 2;
  roof.rotation.y = Math.PI / 2;
  roof.scale.set(1, 1, 0.32);
  roof.position.set(50, 9, -14);
  g.add(roof);
  // ala lateral esquerda
  B(g, 14, 9, 30, 0xffffff, -52, 0, -22, { map: fac, uv: [1 / 14, 1 / 4.33], cast: true });

  // cerejeiras ao longo do caminho
  let seed = 1;
  for (const z of [17, 9, 1, -7, -15, -23]) {
    for (const s of [1, -1]) sakuraTree(g, s * 7.6, z, 1.25, seed++);
  }
  for (const [x, z] of [
    [-18, 12],
    [-26, -4],
    [20, 14],
    [28, 2],
    [-30, 16],
    [32, -26],
  ])
    sakuraTree(g, x, z, 1.1, seed++);
  for (let x = -34; x <= 34; x += 3) if (Math.abs(x) > 10) bush(g, x, 20.8, 0.9);
  for (const [x, z] of [
    [-60, 0],
    [-66, -16],
    [68, 10],
    [72, -30],
    [-70, 18],
  ])
    greenTree(g, x, z, 1.6, seed++);

  // do outro lado da rua: casas, postes e fios
  const poles = [];
  for (let x = -88; x <= 88; x += 16) {
    utilityPole(g, x, 33.6);
    poles.push(x);
  }
  for (const y of [8.25, 7.35]) for (const dx of [-0.8, 0.8]) wires(g, poles.map((x) => [x + dx, y, 33.6]), 0.5);
  let hs = 1;
  for (let x = -90; x <= 90; x += 11) {
    if (Math.abs(x) < 4) continue;
    house(g, x, 43 + (hs % 3), 8, 7, 5 + (hs % 2) * 2.5, {
      wall: [0xe8e0d0, 0xd8e0e8, 0xf0e4d4, 0xe0d8c8][hs % 4],
      roof: [0x4a5a6a, 0x7a4a3a, 0x3a4a5a, 0x5a5a5a][hs % 4],
      seed: hs++,
    });
  }
  skyline(g, { r0: 210, r1: 380, n: 160, color: 0xb4bfd4, seed: 8 });
  mountains(g, { r: 520, color: 0x9fb2cc });

  freeze(g);
  return {
    group: g,
    clock,
    env: {
      sky: 'day',
      hemi: { sky: 0xe8eeff, ground: 0x9a8a7a, int: 1.35 },
      sun: { color: 0xfff2e0, int: 2.3, dir: [0.3, 0.62, 0.75], box: 30, center: [0, 0, 8] },
      fog: { color: 0xc8d8ec, near: 80, far: 650 },
      rim: 0x000000,
    },
  };
}
