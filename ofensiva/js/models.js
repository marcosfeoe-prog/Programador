// Modelos procedurais: armas (usadas na visão em primeira pessoa e nas mãos dos
// bonecos) e os personagens das duas equipes.
import * as THREE from 'three';
import { gunMetalTex, woodTex } from './textures.js';

let MAT = null;
function mats() {
  if (MAT) return MAT;
  const metal = gunMetalTex(9);
  MAT = {
    steel: new THREE.MeshStandardMaterial({ color: 0x2b2d30, map: metal, metalness: 0.7, roughness: 0.45 }),
    black: new THREE.MeshStandardMaterial({ color: 0x18191b, map: metal, metalness: 0.3, roughness: 0.6 }),
    poly: new THREE.MeshStandardMaterial({ color: 0x232323, roughness: 0.8 }),
    wood: new THREE.MeshStandardMaterial({ color: 0xffffff, map: woodTex(11), roughness: 0.55 }),
    green: new THREE.MeshStandardMaterial({ color: 0x3f5a35, roughness: 0.6, metalness: 0.2 }),
    tan: new THREE.MeshStandardMaterial({ color: 0x9d8a66, roughness: 0.7 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.95, roughness: 0.2 }),
    lens: new THREE.MeshStandardMaterial({ color: 0x1a3550, metalness: 0.9, roughness: 0.05 }),
    blade: new THREE.MeshStandardMaterial({ color: 0xc9ccd0, metalness: 1, roughness: 0.18 }),
    grenade: new THREE.MeshStandardMaterial({ color: 0x4b5a3a, roughness: 0.6 }),
    flash: new THREE.MeshStandardMaterial({ color: 0x8a9096, metalness: 0.6, roughness: 0.4 }),
    smoke: new THREE.MeshStandardMaterial({ color: 0x5d6a74, roughness: 0.6 }),
    c4: new THREE.MeshStandardMaterial({ color: 0x8b7d55, roughness: 0.9 }),
    c4pad: new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6 }),
    led: new THREE.MeshBasicMaterial({ color: 0xff2020 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xc89878, roughness: 0.75 }),
    glove: new THREE.MeshStandardMaterial({ color: 0x2c2a26, roughness: 0.85 }),
  };
  return MAT;
}

function box(g, w, h, d, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  g.add(m);
  return m;
}
function cyl(g, r, len, mat, x = 0, y = 0, z = 0, seg = 10, axis = 'z') {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  m.position.set(x, y, z);
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  if (axis === 'x') m.rotation.z = Math.PI / 2;
  g.add(m);
  return m;
}

// Arma com o cano apontando para -Z e a origem no punho.
// userData.muzzle: posição do cano; userData.mag: o carregador (anima na recarga).
export function buildGun(id) {
  const M = mats();
  const g = new THREE.Group();
  let muzzle = new THREE.Vector3(0, 0.05, -0.5);
  let mag = null;
  let slide = null;
  switch (id) {
    case 'ak47':
    case 'galil': {
      const wood = id === 'ak47' ? M.wood : M.poly;
      box(g, 0.05, 0.065, 0.36, M.steel, 0, 0.055, -0.12);
      box(g, 0.046, 0.02, 0.3, M.steel, 0, 0.095, -0.1);
      box(g, 0.055, 0.06, 0.2, wood, 0, 0.05, -0.39);
      box(g, 0.04, 0.03, 0.18, wood, 0, 0.095, -0.38);
      cyl(g, 0.011, 0.36, M.steel, 0, 0.07, -0.62);
      cyl(g, 0.009, 0.25, M.steel, 0, 0.1, -0.55);
      box(g, 0.012, 0.04, 0.012, M.steel, 0, 0.1, -0.78);
      box(g, 0.012, 0.025, 0.02, M.steel, 0, 0.12, -0.1);
      // coronha
      box(g, 0.045, 0.07, 0.26, wood, 0, 0.03, 0.17, 0.12);
      box(g, 0.05, 0.11, 0.04, wood, 0, 0.0, 0.3, 0.1);
      // punho
      box(g, 0.035, 0.1, 0.045, wood, 0, -0.03, 0.03, 0.35);
      // carregador curvo
      mag = new THREE.Group();
      box(mag, 0.035, 0.12, 0.06, M.steel, 0, -0.04, 0, 0.18);
      box(mag, 0.035, 0.1, 0.06, M.steel, 0, -0.13, -0.035, 0.45);
      mag.position.set(0, 0.03, -0.17);
      g.add(mag);
      muzzle = new THREE.Vector3(0, 0.07, -0.8);
      break;
    }
    case 'm4a4':
    case 'famas': {
      box(g, 0.05, 0.075, 0.34, M.black, 0, 0.055, -0.1);
      box(g, 0.03, 0.02, 0.32, M.black, 0, 0.1, -0.12); // trilho
      box(g, 0.058, 0.065, 0.24, M.poly, 0, 0.055, -0.38);
      cyl(g, 0.011, 0.3, M.steel, 0, 0.06, -0.62);
      box(g, 0.015, 0.05, 0.015, M.black, 0, 0.11, -0.47);
      box(g, 0.02, 0.04, 0.05, M.black, 0, 0.125, 0.03);
      // coronha retrátil
      cyl(g, 0.016, 0.2, M.black, 0, 0.06, 0.15);
      box(g, 0.045, 0.1, 0.12, M.poly, 0, 0.035, 0.27);
      box(g, 0.035, 0.1, 0.045, M.poly, 0, -0.03, 0.03, 0.3);
      mag = new THREE.Group();
      box(mag, 0.03, 0.17, 0.065, M.black, 0, -0.06, 0, 0.08);
      mag.position.set(0, 0.03, -0.17);
      g.add(mag);
      muzzle = new THREE.Vector3(0, 0.06, -0.78);
      break;
    }
    case 'awp':
    case 'ssg08': {
      const body = id === 'awp' ? M.green : M.black;
      box(g, 0.06, 0.08, 0.5, body, 0, 0.04, -0.15);
      box(g, 0.06, 0.12, 0.28, body, 0, 0.02, 0.22, 0.05);
      box(g, 0.035, 0.1, 0.05, body, 0, -0.04, 0.03, 0.3);
      cyl(g, id === 'awp' ? 0.014 : 0.011, 0.55, M.steel, 0, 0.065, -0.65);
      cyl(g, 0.017, 0.06, M.steel, 0, 0.065, -0.93);
      // luneta
      cyl(g, 0.022, 0.3, M.black, 0, 0.14, -0.12);
      cyl(g, 0.03, 0.06, M.black, 0, 0.14, -0.28);
      cyl(g, 0.028, 0.05, M.black, 0, 0.14, 0.04);
      box(g, 0.02, 0.04, 0.04, M.black, 0, 0.1, -0.2);
      box(g, 0.02, 0.04, 0.04, M.black, 0, 0.1, -0.03);
      const ln = cyl(g, 0.027, 0.005, M.lens, 0, 0.14, -0.312);
      void ln;
      // ferrolho
      cyl(g, 0.008, 0.06, M.chrome, 0.045, 0.07, 0.0, 6, 'x');
      mag = new THREE.Group();
      box(mag, 0.04, 0.06, 0.08, M.black, 0, -0.02, 0);
      mag.position.set(0, 0.0, -0.12);
      g.add(mag);
      muzzle = new THREE.Vector3(0, 0.065, -0.97);
      break;
    }
    case 'mac10':
    case 'mp9': {
      box(g, 0.05, 0.08, 0.26, M.black, 0, 0.06, -0.1);
      cyl(g, 0.012, 0.1, M.steel, 0, 0.07, -0.27);
      box(g, 0.035, 0.11, 0.045, M.poly, 0, -0.02, 0.0, 0.1);
      if (id === 'mp9') {
        box(g, 0.035, 0.09, 0.04, M.poly, 0, 0.0, -0.17, -0.2);
        box(g, 0.03, 0.03, 0.18, M.poly, 0, 0.06, 0.12);
      } else box(g, 0.02, 0.02, 0.15, M.steel, 0, 0.09, 0.08);
      mag = new THREE.Group();
      box(mag, 0.028, 0.15, 0.035, M.black, 0, -0.07, 0);
      mag.position.set(0, -0.04, 0.0);
      g.add(mag);
      muzzle = new THREE.Vector3(0, 0.07, -0.33);
      break;
    }
    case 'nova': {
      box(g, 0.05, 0.07, 0.3, M.black, 0, 0.05, -0.08);
      cyl(g, 0.014, 0.5, M.steel, 0, 0.075, -0.45);
      cyl(g, 0.016, 0.42, M.steel, 0, 0.04, -0.4);
      slide = box(g, 0.055, 0.05, 0.16, M.poly, 0, 0.04, -0.38);
      box(g, 0.045, 0.1, 0.28, M.poly, 0, 0.02, 0.2, 0.12);
      box(g, 0.035, 0.1, 0.045, M.poly, 0, -0.03, 0.03, 0.3);
      muzzle = new THREE.Vector3(0, 0.075, -0.7);
      break;
    }
    case 'deagle':
    case 'glock':
    case 'usp':
    case 'p250': {
      const big = id === 'deagle';
      const len = big ? 0.27 : 0.19;
      const col = id === 'glock' ? M.poly : big ? M.chrome : M.black;
      slide = box(g, 0.03, big ? 0.045 : 0.035, len, col, 0, 0.065, -len / 2 + 0.03);
      box(g, 0.028, 0.025, len * 0.85, M.black, 0, 0.035, -len / 2 + 0.04);
      box(g, 0.028, 0.11, 0.045, M.poly, 0, -0.02, 0.01, 0.25);
      box(g, 0.006, 0.03, 0.03, M.black, 0, 0.01, -0.04);
      if (id === 'usp') cyl(g, 0.016, 0.14, M.black, 0, 0.065, -0.23);
      mag = new THREE.Group();
      box(mag, 0.024, 0.1, 0.035, M.black, 0, -0.03, 0, 0.25);
      mag.position.set(0, -0.02, 0.01);
      g.add(mag);
      muzzle = new THREE.Vector3(0, 0.065, id === 'usp' ? -0.3 : -len + 0.02);
      break;
    }
    case 'knife': {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.035, 0.17), M.blade);
      blade.geometry.translate(0, 0, -0.085);
      const pos = blade.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        if (pos.getZ(i) < -0.15) pos.setY(i, pos.getY(i) * 0.15 + 0.01);
      }
      blade.position.set(0, 0.03, -0.06);
      g.add(blade);
      box(g, 0.02, 0.03, 0.1, M.poly, 0, 0.025, 0.0);
      box(g, 0.03, 0.045, 0.012, M.steel, 0, 0.03, -0.055);
      muzzle = new THREE.Vector3(0, 0.03, -0.25);
      break;
    }
    case 'he':
    case 'flash':
    case 'smoke': {
      const mat = id === 'he' ? M.grenade : id === 'flash' ? M.flash : M.smoke;
      if (id === 'he') {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), mat);
        s.position.set(0, 0.04, 0);
        g.add(s);
      } else cyl(g, 0.03, 0.11, mat, 0, 0.04, 0, 12, 'y');
      cyl(g, 0.012, 0.025, M.steel, 0, 0.1, 0, 8, 'y');
      box(g, 0.01, 0.06, 0.012, M.steel, 0.025, 0.07, 0);
      muzzle = new THREE.Vector3(0, 0.05, -0.05);
      break;
    }
    case 'c4': {
      box(g, 0.13, 0.06, 0.2, M.c4, 0, 0.03, 0);
      box(g, 0.09, 0.012, 0.1, M.c4pad, 0, 0.066, -0.02);
      const led = box(g, 0.012, 0.01, 0.012, M.led, 0.03, 0.075, 0.05);
      g.userData.led = led;
      for (let i = 0; i < 3; i++) cyl(g, 0.006, 0.2, [M.led, M.steel, M.c4pad][i], -0.05 + i * 0.012, 0.065, 0, 6);
      muzzle = new THREE.Vector3(0, 0.05, -0.1);
      break;
    }
    default:
      box(g, 0.05, 0.08, 0.4, M.black);
  }
  g.userData.muzzle = muzzle;
  g.userData.mag = mag;
  g.userData.magHome = mag ? mag.position.clone() : null;
  g.userData.slide = slide;
  g.userData.slideHome = slide ? slide.position.clone() : null;
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return g;
}

// Braços da visão em primeira pessoa (luvas + mangas na cor da equipe).
export function buildArms(team) {
  const M = mats();
  const sleeve = new THREE.MeshStandardMaterial({ color: team === 'T' ? 0x6b5a3e : 0x2c3a52, roughness: 0.9 });
  const make = (side) => {
    const a = new THREE.Group();
    const fore = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.32), sleeve);
    fore.position.z = 0.16;
    a.add(fore);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.06, 0.1), M.glove);
    hand.position.z = -0.03;
    a.add(hand);
    a.userData.side = side;
    return a;
  };
  return { right: make(1), left: make(-1) };
}

// ------------------------------------------------------------ personagens
const TEAM_LOOK = {
  T: { shirt: 0x6e5a3a, pants: 0x8a7a5a, vest: 0x4a4030, head: 0x1f1d1b, skin: 0xb88a68 },
  CT: { shirt: 0x2d3b55, pants: 0x262d38, vest: 0x1d2430, head: 0x262b31, skin: 0xc89878 },
};

export function buildCharacter(team, variant = 0) {
  const L = TEAM_LOOK[team];
  const std = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
  const shirt = std(L.shirt);
  const pants = std(L.pants);
  const vest = std(L.vest);
  const headM = std(L.head);
  const skin = std(L.skin);
  const boots = std(0x1c1a17);
  const root = new THREE.Group();
  const body = new THREE.Group(); // gira com o yaw
  root.add(body);

  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(0.11 * s, 0.9, 0);
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.46, 0.2), pants);
    thigh.position.y = -0.23;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.46;
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 0.17), pants);
    shin.position.y = -0.2;
    knee.add(shin);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.27), boots);
    boot.position.set(0, -0.39, -0.04);
    knee.add(boot);
    hip.add(knee);
    hip.userData.knee = knee;
    body.add(hip);
    legs.push(hip);
  }
  const torso = new THREE.Group();
  torso.position.y = 0.9;
  body.add(torso);
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.58, 0.25), shirt);
  chest.position.y = 0.3;
  torso.add(chest);
  const vestM = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.42, 0.29), vest);
  vestM.position.y = 0.34;
  torso.add(vestM);
  const neck = new THREE.Group();
  neck.position.y = 0.62;
  torso.add(neck);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.24, 0.23), team === 'T' ? headM : skin);
  head.position.y = 0.13;
  neck.add(head);
  if (team === 'CT') {
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), headM);
    helm.position.y = 0.2;
    helm.scale.set(1, 0.8, 1.1);
    neck.add(helm);
    const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.03), new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.2 }));
    goggles.position.set(0, 0.16, -0.12);
    neck.add(goggles);
  } else {
    // balaclava com abertura para os olhos
    const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.045, 0.01), skin);
    eyes.position.set(0, 0.16, -0.117);
    neck.add(eyes);
    if (variant % 2) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.06, 0.26), std(0x4d4636));
      cap.position.set(0, 0.26, -0.01);
      neck.add(cap);
    }
  }
  // braços segurando a arma
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group();
    sh.position.set(0.27 * s, 0.52, 0);
    const up = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.13), shirt);
    up.position.y = -0.15;
    sh.add(up);
    const el = new THREE.Group();
    el.position.y = -0.3;
    const fo = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.28, 0.11), shirt);
    fo.position.y = -0.14;
    el.add(fo);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), mats().glove);
    hand.position.y = -0.3;
    el.add(hand);
    sh.add(el);
    sh.userData.elbow = el;
    torso.add(sh);
    arms.push(sh);
  }
  const gunMount = new THREE.Group();
  gunMount.position.set(0.12, 0.38, -0.32);
  torso.add(gunMount);

  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = false;
    }
  });
  root.userData = { body, torso, neck, legs, arms, gunMount, gun: null, gunId: null, walk: 0 };
  return root;
}

// Atualiza a pose do boneco a partir do estado do ator.
export function poseCharacter(model, a, dt) {
  const u = model.userData;
  model.position.copy(a.pos);
  u.body.rotation.y = a.yaw;
  const speed = Math.hypot(a.vel.x, a.vel.z);
  u.walk += dt * speed * 1.9;
  const swing = Math.min(1, speed / 4) * 0.6;
  const c = a.crouchT;
  const ph = Math.sin(u.walk);
  u.legs[0].rotation.x = ph * swing + c * 1.1;
  u.legs[1].rotation.x = -ph * swing + c * 1.1;
  u.legs[0].userData.knee.rotation.x = -(Math.max(0, -ph) * swing + c * 2.0);
  u.legs[1].userData.knee.rotation.x = -(Math.max(0, ph) * swing + c * 2.0);
  const legH = 0.9 - c * 0.4;
  u.legs[0].position.y = u.legs[1].position.y = legH;
  u.torso.position.y = legH;
  u.torso.rotation.x = -c * 0.25;
  u.neck.rotation.x = a.pitch * 0.7 + c * 0.2;
  // braços apontando a arma conforme o pitch
  const aim = Math.PI / 2 - 0.2 + a.pitch * 0.8 + c * 0.2;
  // braço esquerdo cruza para segurar a frente da arma; o direito fica no punho
  u.arms[0].rotation.set(aim - 0.1, 0, 0.55);
  u.arms[1].rotation.set(aim - 0.25, 0, -0.08);
  u.arms[0].userData.elbow.rotation.x = 0.4;
  u.arms[1].userData.elbow.rotation.x = 0.2;
  u.gunMount.rotation.x = a.pitch * 0.8 + c * 0.25;
  u.gunMount.position.y = 0.38 + a.pitch * 0.1;
}

export function setCharacterGun(model, id) {
  const u = model.userData;
  if (u.gunId === id) return;
  if (u.gun) u.gunMount.remove(u.gun);
  u.gun = id ? buildGun(id) : null;
  u.gunId = id;
  if (u.gun) u.gunMount.add(u.gun);
}
