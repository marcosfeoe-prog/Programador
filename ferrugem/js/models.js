// Modelos procedurais de armas, itens e objetos interativos.
import * as THREE from 'three';
import { tex } from './textures.js';
import { BOX, CYL, CONE } from './rig.js';
import { boxGeo, cylGeo, mergeByMaterial } from './geo.js';

let M = null;
export function mats() {
  if (M) return M;
  M = {
    gun: new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.4, metalness: 0.75 }),
    gunDark: new THREE.MeshStandardMaterial({ color: 0x131416, roughness: 0.65, metalness: 0.45 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x7a5434, map: tex('planks'), roughness: 0.7 }),
    darkWood: new THREE.MeshStandardMaterial({ color: 0x5a4632, map: tex('planks'), roughness: 0.85 }),
    blade: new THREE.MeshStandardMaterial({ color: 0xaab0b8, roughness: 0.28, metalness: 0.9 }),
    rust: new THREE.MeshStandardMaterial({ color: 0x9a6a50, map: tex('rust'), roughness: 0.66, metalness: 0.4 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x8a8a8e, map: tex('metal'), roughness: 0.55, metalness: 0.65 }),
    laser: new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc9a050, roughness: 0.32, metalness: 0.92 }),
    shell: new THREE.MeshStandardMaterial({ color: 0x9a2a20, roughness: 0.5 }),
    ammoBox: new THREE.MeshStandardMaterial({ color: 0x46522f, roughness: 0.7 }),
    label: new THREE.MeshStandardMaterial({ color: 0xc4a548, roughness: 0.6 }),
    redBox: new THREE.MeshStandardMaterial({ color: 0x6e231c, roughness: 0.7 }),
    white: new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.6 }),
    red: new THREE.MeshStandardMaterial({ color: 0xa31d18, roughness: 0.55, emissive: 0x300404 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xb87a2a, roughness: 0.15, metalness: 0.1, emissive: 0x4a2a08, transparent: true, opacity: 0.85 }),
    cork: new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.9 }),
    olive: new THREE.MeshStandardMaterial({ color: 0x3e4a2c, roughness: 0.6, metalness: 0.3 }),
    paper: new THREE.MeshStandardMaterial({ map: tex('paper'), roughness: 0.9, side: THREE.DoubleSide }),
    drum: new THREE.MeshStandardMaterial({ color: 0x8e1f16, map: tex('rust'), roughness: 0.55, metalness: 0.5 }),
    hazard: new THREE.MeshStandardMaterial({ color: 0xc8a018, roughness: 0.6 }),
    crate: new THREE.MeshStandardMaterial({ color: 0x9a7a54, map: tex('planks'), roughness: 0.85 }),
    crateEdge: new THREE.MeshStandardMaterial({ color: 0x4e3a26, map: tex('planks'), roughness: 0.85 }),
    stone: new THREE.MeshStandardMaterial({ color: 0x8a8478, map: tex('stone'), roughness: 0.95 }),
  };
  return M;
}

function add(g, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}

function marker(g, x, y, z) {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  g.add(o);
  return o;
}

// ---------- Armas do jogador (cano em +Z, cabo em -Y, origem na empunhadura) ----------
export function makePistol() {
  const m = mats(),
    g = new THREE.Group();
  add(g, BOX(0.034, 0.042, 0.2), m.gun, 0, 0.045, 0.055);
  add(g, BOX(0.03, 0.028, 0.15), m.gunDark, 0, 0.012, 0.05);
  add(g, BOX(0.03, 0.11, 0.05), m.gunDark, 0, -0.04, -0.012, 0.22);
  add(g, BOX(0.01, 0.028, 0.036), m.gunDark, 0, -0.004, 0.022);
  add(g, BOX(0.026, 0.022, 0.05), m.gunDark, 0, -0.008, 0.112);
  add(g, BOX(0.012, 0.012, 0.004), m.laser, 0, -0.008, 0.138).castShadow = false;
  g.userData = { muzzle: marker(g, 0, 0.045, 0.165), laser: marker(g, 0, -0.008, 0.142), eject: marker(g, -0.02, 0.055, 0.06) };
  return g;
}

export function makeShotgun() {
  const m = mats(),
    g = new THREE.Group();
  add(g, CYL(0.014, 0.014, 0.62, 8), m.gun, 0, 0.05, 0.36, Math.PI / 2);
  add(g, CYL(0.012, 0.012, 0.46, 8), m.gunDark, 0, 0.022, 0.3, Math.PI / 2);
  add(g, BOX(0.046, 0.075, 0.21), m.gun, 0, 0.035, 0.02);
  add(g, BOX(0.052, 0.046, 0.16), m.wood, 0, 0.02, 0.3);
  add(g, BOX(0.036, 0.1, 0.05), m.wood, 0, -0.035, -0.07, 0.35);
  add(g, BOX(0.042, 0.085, 0.3), m.wood, 0, -0.005, -0.25, -0.12);
  add(g, BOX(0.022, 0.02, 0.04), m.gunDark, 0, 0.0, 0.52);
  add(g, BOX(0.01, 0.01, 0.004), m.laser, 0, 0.0, 0.542).castShadow = false;
  g.userData = { muzzle: marker(g, 0, 0.05, 0.68), laser: marker(g, 0, 0.0, 0.546), eject: marker(g, -0.025, 0.05, 0.03) };
  return g;
}

// Faca: lâmina ao longo de -Y (continua o braço).
export function makeKnife() {
  const m = mats(),
    g = new THREE.Group();
  add(g, BOX(0.022, 0.1, 0.026), m.gunDark, 0, 0.0, 0);
  add(g, BOX(0.006, 0.19, 0.034), m.blade, 0, -0.14, 0.004);
  add(g, BOX(0.03, 0.012, 0.05), m.gunDark, 0, -0.05, 0);
  return g;
}

// ---------- Armas dos inimigos (cabo ao longo de -Y a partir da mão) ----------
export function makeEnemyWeapon(kind) {
  const m = mats(),
    g = new THREE.Group();
  switch (kind) {
    case 'axe':
      add(g, CYL(0.019, 0.023, 0.78, 6), m.darkWood, 0, -0.27, 0);
      add(g, BOX(0.034, 0.13, 0.16), m.rust, 0, -0.6, 0.06);
      add(g, BOX(0.014, 0.16, 0.025), m.blade, 0, -0.6, 0.145);
      break;
    case 'sickle': {
      add(g, CYL(0.018, 0.021, 0.24, 6), m.darkWood, 0, -0.06, 0);
      const blade = add(g, new THREE.TorusGeometry(0.15, 0.011, 4, 14, Math.PI * 1.15), m.rust, 0, -0.32, 0.13, 0, Math.PI / 2, Math.PI * 0.15);
      blade.scale.set(1, 1, 1.6);
      break;
    }
    case 'pitchfork':
      add(g, CYL(0.017, 0.02, 1.6, 6), m.darkWood, 0, -0.5, 0);
      add(g, BOX(0.22, 0.022, 0.022), m.rust, 0, -1.28, 0);
      for (const x of [-0.09, 0, 0.09]) add(g, CYL(0.006, 0.004, 0.32, 4), m.rust, x, -1.44, 0);
      break;
    case 'shovel':
      add(g, CYL(0.018, 0.02, 1.05, 6), m.darkWood, 0, -0.35, 0);
      add(g, BOX(0.2, 0.27, 0.016), m.rust, 0, -0.98, 0.0);
      break;
    case 'machete':
      add(g, BOX(0.03, 0.12, 0.03), m.darkWood, 0, -0.02, 0);
      add(g, BOX(0.008, 0.42, 0.07), m.blade, 0, -0.3, 0.02);
      break;
    case 'rock':
      add(g, new THREE.DodecahedronGeometry(0.1), m.stone, 0, -0.06, 0.04);
      break;
    default:
      break;
  }
  return g;
}

// ---------- Itens coletáveis ----------
export function makePickupModel(type) {
  const m = mats(),
    g = new THREE.Group();
  switch (type) {
    case 'ammo_pistol':
      add(g, BOX(0.17, 0.09, 0.12), m.ammoBox, 0, 0.045, 0);
      add(g, BOX(0.172, 0.03, 0.122), m.label, 0, 0.05, 0);
      break;
    case 'ammo_shotgun':
      add(g, BOX(0.18, 0.1, 0.12), m.redBox, 0, 0.05, 0);
      for (let i = 0; i < 3; i++) {
        add(g, CYL(0.013, 0.013, 0.07, 8), m.shell, -0.04 + i * 0.04, 0.115, 0, 0, 0, Math.PI / 2);
        add(g, CYL(0.0135, 0.0135, 0.018, 8), m.brass, -0.04 + i * 0.04 - 0.035, 0.115, 0, 0, 0, Math.PI / 2);
      }
      break;
    case 'tonic':
      add(g, CYL(0.042, 0.045, 0.13, 10), m.glass, 0, 0.065, 0);
      add(g, CYL(0.016, 0.02, 0.05, 8), m.glass, 0, 0.15, 0);
      add(g, CYL(0.018, 0.016, 0.03, 8), m.cork, 0, 0.185, 0);
      break;
    case 'medkit':
      add(g, BOX(0.24, 0.09, 0.17), m.white, 0, 0.045, 0);
      add(g, BOX(0.11, 0.004, 0.03), m.red, 0, 0.092, 0);
      add(g, BOX(0.03, 0.004, 0.11), m.red, 0, 0.092, 0);
      add(g, BOX(0.08, 0.02, 0.02), m.gunDark, 0, 0.1, 0.06);
      break;
    case 'grenade':
      add(g, new THREE.DodecahedronGeometry(0.055), m.olive, 0, 0.055, 0);
      add(g, BOX(0.02, 0.07, 0.015), m.gunDark, 0.03, 0.1, 0, 0, 0, -0.4);
      add(g, new THREE.TorusGeometry(0.018, 0.004, 4, 10), m.iron, -0.01, 0.13, 0);
      break;
    case 'key':
      add(g, new THREE.TorusGeometry(0.035, 0.009, 6, 14), m.brass, -0.07, 0.02, 0, Math.PI / 2);
      add(g, BOX(0.12, 0.014, 0.014), m.brass, 0.02, 0.02, 0);
      add(g, BOX(0.014, 0.04, 0.012), m.brass, 0.065, 0.0, 0);
      add(g, BOX(0.014, 0.03, 0.012), m.brass, 0.04, 0.005, 0);
      break;
    case 'weapon_shotgun': {
      const s = makeShotgun();
      s.rotation.set(0, 0.6, Math.PI / 2);
      s.position.y = 0.05;
      g.add(s);
      break;
    }
    default:
      add(g, BOX(0.1, 0.1, 0.1), m.white, 0, 0.05, 0);
  }
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = false;
  });
  return mergeByMaterial(g);
}

// ---------- Objetos do cenário que mudam de estado ----------
export function makeCrate(size = 0.8) {
  const m = mats(),
    g = new THREE.Group();
  add(g, boxGeo(size, size, size, 1), m.crate, 0, size / 2, 0);
  const e = 0.06,
    s2 = size / 2;
  for (const [x, z] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    add(g, BOX(e, size + 0.01, e), m.crateEdge, x * (s2 - e / 2 + 0.005), s2, z * (s2 - e / 2 + 0.005));
  }
  for (const y of [0.04, size - 0.04]) {
    add(g, BOX(size + 0.02, 0.06, e), m.crateEdge, 0, y, s2);
    add(g, BOX(size + 0.02, 0.06, e), m.crateEdge, 0, y, -s2);
    add(g, BOX(e, 0.06, size + 0.02), m.crateEdge, s2, y, 0);
    add(g, BOX(e, 0.06, size + 0.02), m.crateEdge, -s2, y, 0);
  }
  add(g, BOX(size * 1.3, 0.06, e), m.crateEdge, 0, s2, s2 + 0.01, 0, 0, 0.78);
  return mergeByMaterial(g);
}

export function makeDrum() {
  const m = mats(),
    g = new THREE.Group();
  add(g, cylGeo(0.3, 0.3, 0.88, 14, 1), m.drum, 0, 0.44, 0);
  for (const y of [0.12, 0.44, 0.76]) add(g, CYL(0.305, 0.305, 0.03, 14), m.gunDark, 0, y, 0);
  add(g, CYL(0.306, 0.306, 0.12, 14), m.hazard, 0, 0.6, 0);
  add(g, CYL(0.06, 0.06, 0.03, 8), m.gunDark, 0.14, 0.89, 0.05);
  return mergeByMaterial(g);
}

export function makeWinch() {
  const m = mats(),
    g = new THREE.Group();
  add(g, BOX(0.16, 1.3, 0.16), m.darkWood, -0.55, 0.65, 0);
  add(g, BOX(0.16, 1.3, 0.16), m.darkWood, 0.55, 0.65, 0);
  add(g, BOX(1.3, 0.14, 0.2), m.darkWood, 0, 1.25, 0);
  add(g, BOX(1.5, 0.12, 0.7), m.darkWood, 0, 0.06, 0);
  add(g, CYL(0.07, 0.07, 1.1, 10), m.iron, 0, 0.8, 0, 0, 0, Math.PI / 2);
  const wheel = new THREE.Group();
  wheel.position.set(0.66, 0.8, 0);
  g.add(wheel);
  add(wheel, new THREE.TorusGeometry(0.36, 0.035, 6, 18), m.iron, 0, 0, 0, 0, Math.PI / 2);
  for (let i = 0; i < 4; i++) add(wheel, BOX(0.03, 0.7, 0.03), m.iron, 0, 0, 0, i * (Math.PI / 4));
  add(wheel, CYL(0.025, 0.025, 0.28, 6), m.darkWood, 0.14, 0.36, 0, 0, 0, Math.PI / 2);
  // corrente enrolada
  for (let i = 0; i < 7; i++) add(g, new THREE.TorusGeometry(0.05, 0.012, 4, 8), m.iron, -0.3 + i * 0.1, 0.8, 0.0, 0, i % 2 ? 0 : Math.PI / 2);
  mergeByMaterial(wheel);
  mergeByMaterial(g);
  g.userData.wheel = wheel;
  return g;
}

// Folha do portão de ferro (largura w, dobradiça na origem, abre em +X).
export function makeGateLeaf(w = 3, h = 3.2) {
  const m = mats(),
    g = new THREE.Group();
  const n = Math.round(w / 0.16);
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * w;
    add(g, CYL(0.022, 0.022, h, 6), m.iron, x, h / 2, 0);
    add(g, CONE(0.04, 0.14, 4), m.iron, x, h + 0.07, 0);
  }
  for (const y of [0.25, h * 0.5, h - 0.2]) add(g, BOX(w, 0.06, 0.05), m.iron, w / 2, y, 0);
  add(g, new THREE.TorusGeometry(0.35, 0.025, 4, 16), m.iron, w / 2, h * 0.72, 0);
  return mergeByMaterial(g);
}

export function makePortcullis(w = 7.6, h = 4.8) {
  const m = mats(),
    g = new THREE.Group();
  const n = Math.round(w / 0.32);
  for (let i = 0; i <= n; i++) {
    const x = -w / 2 + (i / n) * w;
    add(g, BOX(0.07, h, 0.07), m.iron, x, h / 2, 0);
    add(g, CONE(0.06, 0.2, 4), m.iron, x, -0.08, 0, Math.PI);
  }
  for (let y = 0.4; y < h; y += 0.55) add(g, BOX(w, 0.06, 0.06), m.iron, 0, y, 0);
  return mergeByMaterial(g);
}

export function makeNoteModel() {
  const m = mats(),
    g = new THREE.Group();
  const p = add(g, new THREE.PlaneGeometry(0.24, 0.32), m.paper, 0, 0.01, 0, -Math.PI / 2, 0, 0.2);
  p.castShadow = false;
  return g;
}
