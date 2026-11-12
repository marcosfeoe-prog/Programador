// Objetos de cena compartilhados entre níveis (postes, TV, balanço, placas, árvores, carros...).
import * as THREE from 'three';
import { box, roundBox, cylinder, tube, merge, paint, tf, lathe, wire } from '../engine/geo.js';
import { std, glow } from '../engine/materials.js';
import * as TX from '../engine/textures.js';

// Poste de luz com braço curvo e luminária tipo "cabeça de cobra"
export function lampPost(o = {}) {
  const P = { height: 8, arm: 1.7, color: '#2b2b31', light: '#fff0dc', glow: 3, footing: true, ...o };
  const g = new THREE.Group();
  const metal = std(P.color, { roughness: 0.42, metalness: 0.55 });
  const H = P.height;
  const pole = new THREE.Mesh(cylinder(0.065, 0.1, H, 14), metal);
  pole.position.y = H / 2;
  pole.castShadow = true;
  g.add(pole);
  if (P.footing) {
    const f = new THREE.Mesh(cylinder(0.17, 0.2, 0.3, 14), std('#9a9592', { roughness: 0.95, map: TX.concrete().map }));
    f.position.y = 0.12;
    f.castShadow = f.receiveShadow = true;
    g.add(f);
    const ring = new THREE.Mesh(cylinder(0.12, 0.13, 0.35, 14), metal);
    ring.position.y = 0.4;
    g.add(ring);
  }
  const A = P.arm;
  const arm = new THREE.Mesh(
    tube([[0, H - 0.5, 0], [0, H - 0.05, 0], [0.25, H + 0.28, 0], [A * 0.6, H + 0.42, 0], [A, H + 0.4, 0]], 0.042, 24, 8),
    metal
  );
  arm.castShadow = true;
  g.add(arm);
  const head = new THREE.Group();
  head.position.set(A + 0.22, H + 0.36, 0);
  head.rotation.z = -0.08;
  const shell = new THREE.Mesh(roundBox(0.72, 0.17, 0.34, 0.07, 3), metal);
  shell.castShadow = true;
  head.add(shell);
  const lensMat = glow(P.light, P.glow);
  const lens = new THREE.Mesh(roundBox(0.52, 0.05, 0.25, 0.02, 2), lensMat);
  lens.position.y = -0.085;
  head.add(lens);
  g.add(head);
  return { group: g, lens, lensMat, headLocal: head.position.clone() };
}

// Televisão de tubo antiga com tela animada (chuvisco)
export function crtTV(o = {}) {
  const P = { color: '#d9d2c4', ...o };
  const g = new THREE.Group();
  const body = std(P.color, { roughness: 0.55 });
  const dark = std('#2a2628', { roughness: 0.6 });
  const b = new THREE.Mesh(roundBox(0.62, 0.5, 0.52, 0.05, 3), body);
  b.position.y = 0.25 + 0.04;
  b.castShadow = b.receiveShadow = true;
  g.add(b);
  const back = new THREE.Mesh(roundBox(0.42, 0.36, 0.25, 0.06, 2), body);
  back.position.set(0, 0.27, -0.33);
  back.castShadow = true;
  g.add(back);
  const bezel = new THREE.Mesh(roundBox(0.5, 0.39, 0.04, 0.03, 2), dark);
  bezel.position.set(-0.04, 0.3, 0.255);
  g.add(bezel);
  // tela com chuvisco desenhado num canvas pequeno
  const c = TX.makeCanvas(96, 72);
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  const screenMat = new THREE.MeshStandardMaterial({ color: '#111', emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 1.6, roughness: 0.15, metalness: 0 });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.32), screenMat);
  screen.position.set(-0.04, 0.3, 0.278);
  g.add(screen);
  for (let i = 0; i < 2; i++) {
    const k = new THREE.Mesh(cylinder(0.018, 0.018, 0.02, 10), dark);
    k.rotation.x = Math.PI / 2;
    k.position.set(0.25, 0.38 - i * 0.08, 0.27);
    g.add(k);
  }
  for (const s of [-1, 1]) {
    const ant = new THREE.Mesh(cylinder(0.004, 0.006, 0.6, 5), std('#9a9a9e', { metalness: 0.8, roughness: 0.3 }));
    ant.position.set(s * 0.12, 0.8, -0.1);
    ant.rotation.z = s * -0.5;
    g.add(ant);
  }
  let acc = 0;
  const img = ctx.createImageData(96, 72);
  const update = (dt, t, tint = [255, 190, 225]) => {
    acc += dt;
    if (acc < 1 / 20) return;
    acc = 0;
    const d = img.data;
    const roll = (t * 40) % 72;
    for (let y = 0; y < 72; y++) {
      const band = Math.abs(y - roll) < 4 ? 1.4 : 1;
      for (let x = 0; x < 96; x++) {
        const v = Math.random() * 200 * band;
        const i = (y * 96 + x) * 4;
        d[i] = (v * tint[0]) / 255;
        d[i + 1] = (v * tint[1]) / 255;
        d[i + 2] = (v * tint[2]) / 255;
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    tex.needsUpdate = true;
  };
  return { group: g, update, screenMat };
}

// Balanço de quintal (estrutura em A com um assento que balança sozinho)
export function swingSet(o = {}) {
  const P = { color: '#c9d6e6', seat: '#e88fb4', ...o };
  const g = new THREE.Group();
  const metal = std(P.color, { roughness: 0.4, metalness: 0.6 });
  const H = 2.2, W = 2.6, spread = 0.7;
  const legs = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      legs.push(tube([[sx * W / 2, 0, sz * spread], [sx * W / 2, H, 0]], 0.035, 2, 8));
    }
  }
  legs.push(tube([[-W / 2 - 0.05, H, 0], [W / 2 + 0.05, H, 0]], 0.045, 2, 8));
  const frame = new THREE.Mesh(merge(legs), metal);
  frame.castShadow = true;
  g.add(frame);
  const swings = [];
  for (const x of [-0.55, 0.55]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, H, 0);
    const chainMat = std('#b8b8be', { metalness: 0.9, roughness: 0.35 });
    const ch = new THREE.Mesh(merge([tf(cylinder(0.008, 0.008, 1.75, 5), [-0.2, -0.875, 0]), tf(cylinder(0.008, 0.008, 1.75, 5), [0.2, -0.875, 0])]), chainMat);
    pivot.add(ch);
    const seat = new THREE.Mesh(roundBox(0.5, 0.04, 0.2, 0.015, 2), std(P.seat, { roughness: 0.5 }));
    seat.position.y = -1.77;
    seat.castShadow = true;
    pivot.add(seat);
    g.add(pivot);
    swings.push(pivot);
  }
  const update = (dt, t) => {
    swings[0].rotation.x = Math.sin(t * 1.15) * 0.42;
    swings[1].rotation.x = Math.sin(t * 1.15 + 2.2) * 0.05;
  };
  return { group: g, update, swings };
}

// Placa de aviso triangular "!" (deserto)
export function warningSign(o = {}) {
  const P = { border: '#3fb8cc', face: '#f7f7fb', mark: '#e8457f', pole: '#d9a6b8', height: 2.45, ...o };
  const g = new THREE.Group();
  const c = TX.makeCanvas(256, 256);
  const ctx = c.getContext('2d');
  const tri = (inset) => {
    ctx.beginPath();
    ctx.moveTo(128, 18 + inset * 1.8);
    ctx.lineTo(240 - inset * 1.5, 232 - inset * 0.85);
    ctx.lineTo(16 + inset * 1.5, 232 - inset * 0.85);
    ctx.closePath();
  };
  ctx.clearRect(0, 0, 256, 256);
  ctx.lineJoin = 'round';
  ctx.fillStyle = P.border;
  tri(0);
  ctx.fill();
  ctx.fillStyle = P.face;
  tri(20);
  ctx.fill();
  ctx.fillStyle = P.mark;
  ctx.beginPath();
  ctx.moveTo(116, 82);
  ctx.lineTo(140, 82);
  ctx.lineTo(134, 170);
  ctx.lineTo(122, 170);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(128, 193, 11, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const size = P.size || 1.05;
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({ map: tex, transparent: false, alphaTest: 0.5, roughness: 0.45, metalness: 0.1, side: THREE.DoubleSide })
  );
  face.position.set(0, P.height, 0.035);
  face.castShadow = true;
  g.add(face);
  const backMat = std('#c9ccd4', { roughness: 0.5, metalness: 0.5, alphaTest: 0.5, map: tex, side: THREE.BackSide });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(size, size), backMat);
  back.position.copy(face.position);
  back.position.z = 0.03;
  g.add(back);
  const pole = new THREE.Mesh(cylinder(0.03, 0.035, P.height + 0.1, 10), std(P.pole, { roughness: 0.5, metalness: 0.4 }));
  pole.position.y = (P.height + 0.1) / 2;
  pole.castShadow = true;
  g.add(pole);
  return { group: g };
}

// Poste de madeira com cruzeta e isoladores; devolve pontos de fixação dos fios
export function utilityPole(o = {}) {
  const P = { height: 11, ...o };
  const g = new THREE.Group();
  const woodTex = TX.wood();
  const woodMat = std('#7a6656', { map: woodTex.map, normalMap: woodTex.normalMap, roughness: 0.9 });
  const H = P.height;
  const pole = new THREE.Mesh(cylinder(0.12, 0.17, H, 12, 1), woodMat);
  pole.position.y = H / 2;
  pole.castShadow = true;
  g.add(pole);
  const arm = new THREE.Mesh(box(2.4, 0.12, 0.12, 1), woodMat);
  arm.position.y = H - 0.6;
  arm.castShadow = true;
  g.add(arm);
  const ins = std('#cfd6d0', { roughness: 0.3 });
  const tips = [];
  for (const x of [-1.05, -0.45, 0.45, 1.05]) {
    const i = new THREE.Mesh(cylinder(0.035, 0.05, 0.16, 8), ins);
    i.position.set(x, H - 0.46, 0);
    g.add(i);
    tips.push(new THREE.Vector3(x, H - 0.36, 0));
  }
  const tr = new THREE.Mesh(cylinder(0.26, 0.26, 0.8, 14), std('#8e9294', { metalness: 0.6, roughness: 0.5 }));
  tr.position.set(0, H - 2.0, 0.32);
  tr.castShadow = true;
  if (P.transformer) g.add(tr);
  return { group: g, tips };
}

// Árvores simples, mas com silhueta orgânica
export function coniferGeo(h = 8, r = 2.2, seed = 1, rand = Math.random) {
  const parts = [];
  const trunk = paint(cylinder(0.12, 0.2, h * 0.3, 8), '#3b2c26');
  tf(trunk, [0, h * 0.15, 0]);
  parts.push(trunk);
  const layers = 9;
  for (let i = 0; i < layers; i++) {
    const t = i / layers;
    const lr = r * (1 - t * 0.9) * (0.9 + rand() * 0.2);
    const cone = new THREE.ConeGeometry(lr, h * 0.22, 9, 2);
    const pos = cone.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
      const n = 0.7 + rand() * 0.5;
      pos.setXYZ(k, x * n, y + (rand() - 0.5) * 0.15 * h * 0.1, z * n);
    }
    cone.computeVertexNormals();
    paint(cone, '#22362a', 0.08, rand);
    tf(cone, [(rand() - 0.5) * 0.2, h * 0.22 + t * h * 0.72, (rand() - 0.5) * 0.2], [0, rand() * 3, 0]);
    parts.push(cone);
  }
  return merge(parts);
}

export function roundTreeGeo(h = 6, r = 2.6, rand = Math.random, color = '#3a5a34') {
  const parts = [];
  const trunk = paint(cylinder(0.12, 0.22, h * 0.55, 8), '#4a3a30');
  tf(trunk, [0, h * 0.27, 0]);
  parts.push(trunk);
  const blobs = 7;
  for (let i = 0; i < blobs; i++) {
    const s = new THREE.IcosahedronGeometry(r * (0.45 + rand() * 0.3), 1);
    const pos = s.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const f = 0.85 + rand() * 0.3;
      pos.setXYZ(k, pos.getX(k) * f, pos.getY(k) * f, pos.getZ(k) * f);
    }
    s.computeVertexNormals();
    paint(s, color, 0.12, rand);
    const a = (i / blobs) * Math.PI * 2;
    const d = i === 0 ? 0 : r * 0.45;
    tf(s, [Math.cos(a) * d, h * 0.68 + (rand() - 0.3) * r * 0.5, Math.sin(a) * d]);
    parts.push(s);
  }
  return merge(parts);
}

// Carro dos anos 90 bem simples (carroceria arredondada, vidros, rodas e luzes)
export function car(o = {}) {
  const P = { color: '#b8c4d8', headlights: false, tail: false, ...o };
  const g = new THREE.Group();
  const paintMat = new THREE.MeshPhysicalMaterial({ color: P.color, roughness: 0.32, metalness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#1a1c28', roughness: 0.08, metalness: 0.2 });
  const rubber = std('#141416', { roughness: 0.9 });
  const chrome = std('#cfd2d8', { roughness: 0.2, metalness: 1 });
  const lower = new THREE.Mesh(roundBox(1.76, 0.62, 4.4, 0.16, 3), paintMat);
  lower.position.y = 0.62;
  lower.castShadow = true;
  g.add(lower);
  const cab = new THREE.Mesh(roundBox(1.56, 0.56, 2.3, 0.18, 3), glass);
  cab.position.set(0, 1.18, -0.15);
  cab.castShadow = true;
  g.add(cab);
  const roof = new THREE.Mesh(roundBox(1.5, 0.08, 1.9, 0.04, 2), paintMat);
  roof.position.set(0, 1.47, -0.2);
  g.add(roof);
  for (const sx of [-0.78, 0.78]) {
    for (const sz of [-1.35, 1.35]) {
      const w = new THREE.Mesh(cylinder(0.33, 0.33, 0.24, 18), rubber);
      w.rotation.z = Math.PI / 2;
      w.position.set(sx, 0.33, sz);
      g.add(w);
      const hub = new THREE.Mesh(cylinder(0.18, 0.18, 0.25, 12), chrome);
      hub.rotation.z = Math.PI / 2;
      hub.position.set(sx * 1.01, 0.33, sz);
      g.add(hub);
    }
  }
  const hl = glow('#fff4e0', P.headlights ? 14 : 0.2);
  const tl = glow('#ff2a4a', P.tail ? 6 : 0.3);
  for (const sx of [-0.6, 0.6]) {
    const h = new THREE.Mesh(roundBox(0.34, 0.14, 0.06, 0.03, 2), hl);
    h.position.set(sx, 0.7, 2.2);
    g.add(h);
    const t = new THREE.Mesh(roundBox(0.34, 0.12, 0.06, 0.03, 2), tl);
    t.position.set(sx, 0.72, -2.2);
    g.add(t);
  }
  const bumper = std('#2a2a30', { roughness: 0.6 });
  for (const z of [-2.22, 2.22]) {
    const b = new THREE.Mesh(roundBox(1.8, 0.16, 0.12, 0.05, 2), bumper);
    b.position.set(0, 0.42, z);
    g.add(b);
  }
  return { group: g, headMat: hl, tailMat: tl };
}

export { wire, lathe };
