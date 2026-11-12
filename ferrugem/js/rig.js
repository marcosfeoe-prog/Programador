// Esqueletos procedurais (humanoide e rastejante): juntas, malhas, poses com suavização
// e as cápsulas de acerto usadas pelos tiros.
import * as THREE from 'three';
import { tex } from './textures.js';
import { mergeByMaterial } from './geo.js';

const matCache = new Map();
export function charMat(color, kind = 'cloth') {
  const key = kind + ':' + color;
  let m = matCache.get(key);
  if (!m) {
    switch (kind) {
      case 'skin':
        m = new THREE.MeshStandardMaterial({ color, map: tex('skin'), roughness: 0.78 });
        break;
      case 'rustskin':
        m = new THREE.MeshStandardMaterial({ color, map: tex('skinRust'), roughness: 0.82 });
        break;
      case 'metal':
        m = new THREE.MeshStandardMaterial({ color, map: tex('rust'), roughness: 0.62, metalness: 0.45 });
        break;
      case 'leather':
        m = new THREE.MeshStandardMaterial({ color, map: tex('fabric'), roughness: 0.62 });
        break;
      case 'glow':
        m = new THREE.MeshBasicMaterial({ color, fog: false, toneMapped: false });
        break;
      case 'hair':
        m = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
        break;
      case 'dress':
        m = new THREE.MeshStandardMaterial({ color, map: tex('fabric'), roughness: 0.92, side: THREE.DoubleSide });
        break;
      default:
        m = new THREE.MeshStandardMaterial({ color, map: tex('fabric'), roughness: 0.92 });
    }
    matCache.set(key, m);
  }
  return m;
}

const geoCache = new Map();
function cached(key, make) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}
const r3 = (v) => Math.round(v * 1000) / 1000;
export const BOX = (w, h, d) => cached(`b${r3(w)},${r3(h)},${r3(d)}`, () => new THREE.BoxGeometry(w, h, d));
export const CYL = (rt, rb, h, seg = 7) => cached(`c${r3(rt)},${r3(rb)},${r3(h)},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
export const SPH = (seg = 10, rings = 8, cap = 1) =>
  cached(`s${seg},${rings},${cap}`, () => new THREE.SphereGeometry(1, seg, rings, 0, Math.PI * 2, 0, Math.PI * cap));
export const CONE = (r, h, seg = 5) => cached(`k${r3(r)},${r3(h)},${seg}`, () => new THREE.ConeGeometry(r, h, seg));

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

const HUMAN_JOINTS = ['hips', 'spine', 'neck', 'head', 'lSh', 'lEl', 'lHand', 'rSh', 'rEl', 'rHand', 'lHip', 'lKnee', 'lAnkle', 'rHip', 'rKnee', 'rAnkle'];

// Base comum: juntas com alvos de rotação suavizados.
class RigBase {
  constructor() {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.j = {};
    this.t = {};
    this.meshes = [];
    this.bodyTilt = 0;
    this.bodyRoll = 0;
    this.bodyLift = 0;
    this.bodySlide = 0;
  }

  joint(name, parent, x, y, z) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    this.j[name] = g;
    this.t[name] = new Float32Array(3);
    return g;
  }

  part(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    this.meshes.push(m);
    return m;
  }

  resetPose() {
    for (const k in this.t) {
      const a = this.t[k];
      a[0] = a[1] = a[2] = 0;
    }
    this.hipsY = 0;
    this.bodyTilt = 0;
    this.bodyRoll = 0;
    this.bodyLift = 0;
    this.bodySlide = 0;
  }

  set(name, x, y = 0, z = 0) {
    const a = this.t[name];
    a[0] = x;
    a[1] = y;
    a[2] = z;
  }

  add(name, x, y = 0, z = 0) {
    const a = this.t[name];
    a[0] += x;
    a[1] += y;
    a[2] += z;
  }

  apply(dt, rate = 12, bodyRate = 9) {
    const k = 1 - Math.exp(-rate * dt);
    for (const name in this.t) {
      const r = this.j[name].rotation,
        a = this.t[name];
      r.x += (a[0] - r.x) * k;
      r.y += (a[1] - r.y) * k;
      r.z += (a[2] - r.z) * k;
    }
    const kb = 1 - Math.exp(-bodyRate * dt);
    if (this.j.hips) {
      const h = this.j.hips.position;
      h.y += (this.hipsBaseY + this.hipsY - h.y) * k;
    }
    this.body.rotation.x += (this.bodyTilt - this.body.rotation.x) * kb;
    this.body.rotation.z += (this.bodyRoll - this.body.rotation.z) * kb;
    this.body.position.y += (this.bodyLift - this.body.position.y) * kb;
    this.body.position.z += (this.bodySlide - this.body.position.z) * kb;
  }

  // Coloca as juntas direto na pose alvo (sem suavização).
  snap() {
    for (const name in this.t) {
      const a = this.t[name];
      this.j[name].rotation.set(a[0], a[1], a[2]);
    }
    if (this.j.hips) this.j.hips.position.y = this.hipsBaseY + this.hipsY;
    this.body.rotation.x = this.bodyTilt;
    this.body.rotation.z = this.bodyRoll;
    this.body.position.y = this.bodyLift;
    this.body.position.z = this.bodySlide;
  }

  setVisible(v) {
    this.root.visible = v;
  }

  // Junta as peças de cada junta por material (um personagem cai de ~30 para ~15 malhas).
  optimize() {
    for (const k in this.j) mergeByMaterial(this.j[k]);
    this.meshes = [];
    this.root.traverse((o) => {
      if (o.isMesh) this.meshes.push(o);
    });
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.isMesh && o.userData.merged) o.geometry.dispose();
    });
  }
}

/*
 Humanoide virado para +Z. Lado esquerdo do personagem = +X.
 Rotação X negativa no ombro/quadril levanta o membro para a frente; no cotovelo dobra para a frente;
 no joelho, rotação positiva dobra para trás.
*/
export class Humanoid extends RigBase {
  constructor(o = {}) {
    super();
    const s = (this.s = o.scale || 1);
    const bw = (this.bw = o.build === 'heavy' ? 1.32 : o.build === 'thin' ? 0.86 : 1);
    const arm = o.armScale || 1;
    this.root.scale.setScalar(s);
    this.hipsBaseY = 0.92;
    this.hipsY = 0;
    const J = this.joint.bind(this);
    J('hips', this.body, 0, 0.92, 0);
    J('spine', this.j.hips, 0, 0.04, 0);
    J('neck', this.j.spine, 0, 0.56, 0);
    J('head', this.j.neck, 0, 0.08, 0);
    const shx = 0.2 * bw + 0.02 * arm;
    J('lSh', this.j.spine, shx, 0.5, 0);
    J('lEl', this.j.lSh, 0, -0.29, 0);
    J('lHand', this.j.lEl, 0, -0.27, 0);
    J('rSh', this.j.spine, -shx, 0.5, 0);
    J('rEl', this.j.rSh, 0, -0.29, 0);
    J('rHand', this.j.rEl, 0, -0.27, 0);
    J('lHip', this.j.hips, 0.1 * bw, -0.03, 0);
    J('lKnee', this.j.lHip, 0, -0.45, 0);
    J('lAnkle', this.j.lKnee, 0, -0.42, 0);
    J('rHip', this.j.hips, -0.1 * bw, -0.03, 0);
    J('rKnee', this.j.rHip, 0, -0.45, 0);
    J('rAnkle', this.j.rKnee, 0, -0.42, 0);

    const skin = charMat(o.skin ?? 0xb59a86, o.infected ? 'rustskin' : 'skin');
    const shirt = charMat(o.shirt ?? 0x4a4038, o.shirtKind || 'cloth');
    const sleeve = o.sleeves === 'short' ? skin : shirt;
    const pants = charMat(o.pants ?? 0x2f2b28);
    const shoes = charMat(o.shoes ?? 0x1c1714, 'leather');
    const P = this.part.bind(this);
    const j = this.j;

    P(j.hips, BOX(0.32 * bw, 0.18, 0.2), pants, 0, -0.02, 0);
    P(j.spine, BOX(0.3 * bw, 0.26, 0.19 * Math.sqrt(bw)), shirt, 0, 0.13, 0);
    this.chest = P(j.spine, BOX(0.38 * bw, 0.3, 0.23 * Math.sqrt(bw)), shirt, 0, 0.4, 0.005);
    P(j.spine, BOX(0.42 * bw, 0.08, 0.2 * Math.sqrt(bw)), shirt, 0, 0.53, 0);
    P(j.neck, CYL(0.045, 0.052, 0.12), skin, 0, 0.02, 0);
    this.headMesh = P(j.head, SPH(10, 8), skin, 0, 0.1, 0.005, 0, 0, 0, 0.104, 0.124, 0.114);
    P(j.head, BOX(0.026, 0.045, 0.03), skin, 0, 0.09, 0.115);
    P(j.head, BOX(0.17, 0.022, 0.03), skin, 0, 0.142, 0.096);
    P(j.head, BOX(0.06, 0.012, 0.012), charMat(0x1a0d0a), 0, 0.045, 0.108);
    this.eyes = [];
    if (o.eyes !== undefined && o.eyes !== null) {
      const em = charMat(o.eyes, 'glow');
      this.eyes.push(P(j.head, BOX(0.032, 0.013, 0.01), em, 0.038, 0.118, 0.11));
      this.eyes.push(P(j.head, BOX(0.032, 0.013, 0.01), em, -0.038, 0.118, 0.11));
      for (const e of this.eyes) e.castShadow = false;
    } else {
      const em = charMat(0x14100e);
      P(j.head, BOX(0.03, 0.012, 0.01), em, 0.038, 0.118, 0.11);
      P(j.head, BOX(0.03, 0.012, 0.01), em, -0.038, 0.118, 0.11);
    }

    for (const side of ['l', 'r']) {
      P(j[side + 'Sh'], CYL(0.056 * arm, 0.046 * arm, 0.3), sleeve, 0, -0.145, 0);
      P(j[side + 'El'], CYL(0.046 * arm, 0.037 * arm, 0.27), o.longSleeves ? shirt : skin, 0, -0.135, 0);
      P(j[side + 'Hand'], BOX(0.07 * arm, 0.09, 0.045), skin, 0, -0.045, 0);
      P(j[side + 'Hip'], CYL(0.088 * bw, 0.066 * Math.sqrt(bw), 0.45), pants, 0, -0.225, 0);
      P(j[side + 'Knee'], CYL(0.064 * Math.sqrt(bw), 0.048, 0.42), pants, 0, -0.21, 0);
      P(j[side + 'Ankle'], BOX(0.1, 0.07, 0.24), shoes, 0, 0.015, 0.05);
    }

    // Cabelo, chapéus, barba, vestido...
    const hair = o.hair ? charMat(o.hair, 'hair') : null;
    if (hair && o.hairStyle !== 'bald') {
      P(j.head, SPH(10, 6, 0.55), hair, 0, 0.115, -0.005, 0, 0, 0, 0.112, 0.132, 0.122);
      P(j.head, SPH(10, 6, 0.5), hair, 0, 0.1, -0.02, -1.25, 0, 0, 0.11, 0.12, 0.12);
      if (o.hairStyle === 'long') P(j.head, BOX(0.2, 0.26, 0.06), hair, 0, 0.0, -0.09);
      if (o.hairStyle === 'bun') P(j.head, SPH(8, 6), hair, 0, 0.2, -0.1, 0, 0, 0, 0.06, 0.06, 0.06);
    }
    if (o.beard) P(j.head, BOX(0.15, 0.08, 0.05), charMat(o.beard, 'hair'), 0, 0.02, 0.09);
    if (o.hat === 'cap') {
      const hm = charMat(o.hatColor ?? 0x2b2622);
      P(j.head, CYL(0.118, 0.122, 0.07, 10), hm, 0, 0.215, -0.005);
      P(j.head, BOX(0.18, 0.015, 0.09), hm, 0, 0.19, 0.11, -0.15);
    } else if (o.hat === 'straw') {
      const hm = charMat(o.hatColor ?? 0x8a7650);
      P(j.head, CYL(0.25, 0.25, 0.015, 12), hm, 0, 0.2, 0);
      P(j.head, CYL(0.1, 0.12, 0.1, 10), hm, 0, 0.25, 0);
    } else if (o.hat === 'scarf') {
      const hm = charMat(o.hatColor ?? 0x4a2a2a);
      P(j.head, SPH(10, 6, 0.6), hm, 0, 0.11, -0.012, 0, 0, 0, 0.122, 0.142, 0.13);
      P(j.head, BOX(0.16, 0.18, 0.05), hm, 0, 0.0, -0.1, 0.25);
    } else if (o.hat === 'hood') {
      const hm = charMat(o.hatColor ?? 0x2a2522);
      P(j.head, SPH(10, 6, 0.62), hm, 0, 0.1, -0.02, 0, 0, 0, 0.135, 0.155, 0.145);
    }
    if (o.dress) {
      const dm = charMat(o.dress, 'dress');
      P(j.hips, cached('dress', () => new THREE.CylinderGeometry(0.19, 0.31, 0.62, 10, 1, true)), dm, 0, -0.3, 0);
    }
    if (o.apron) P(j.spine, BOX(0.3 * bw, 0.5, 0.02), charMat(o.apron), 0, 0.05, 0.12 * Math.sqrt(bw));
    if (o.shards) {
      const sm = charMat(0x5a2c18, 'metal');
      const spots = [
        [j.spine, 0.12, 0.5, -0.1, -0.6, 0, 0.3],
        [j.spine, -0.1, 0.42, -0.12, -0.9, 0, -0.4],
        [j.lSh, 0.03, -0.06, -0.03, 0.2, 0, 1.2],
        [j.head, 0.05, 0.2, -0.07, -0.7, 0, 0.5],
        [j.spine, 0.0, 0.25, -0.11, -1.2, 0, 0],
      ];
      for (let i = 0; i < o.shards; i++) {
        const sp = spots[i % spots.length];
        const m = P(sp[0], CONE(0.025, 0.13, 4), sm, sp[1], sp[2], sp[3], sp[4], sp[5], sp[6]);
        m.castShadow = false;
      }
    }

    // Suporte da arma na mão direita (cabo ao longo de -Y local).
    this.mountR = new THREE.Group();
    this.mountR.position.set(0, -0.06, 0.0);
    j.rHand.add(this.mountR);
    this.mountL = new THREE.Group();
    this.mountL.position.set(0, -0.06, 0.0);
    j.lHand.add(this.mountL);

    this.hitDefs = [
      { part: 'head', a: j.head, ao: V(0, 0.1, 0.01), r: 0.14 },
      { part: 'body', a: j.hips, ao: V(0, 0.02, 0), b: j.neck, bo: V(0, -0.04, 0), r: 0.19 * bw },
      { part: 'leg', a: j.lHip, ao: V(), b: j.lKnee, bo: V(), r: 0.085 * bw },
      { part: 'leg', a: j.lKnee, ao: V(), b: j.lAnkle, bo: V(), r: 0.068 },
      { part: 'leg', a: j.rHip, ao: V(), b: j.rKnee, bo: V(), r: 0.085 * bw },
      { part: 'leg', a: j.rKnee, ao: V(), b: j.rAnkle, bo: V(), r: 0.068 },
      { part: 'arm', a: j.lSh, ao: V(), b: j.lEl, bo: V(), r: 0.062 * arm },
      { part: 'arm', a: j.lEl, ao: V(), b: j.lHand, bo: V(0, -0.08, 0), r: 0.055 * arm },
      { part: 'arm', a: j.rSh, ao: V(), b: j.rEl, bo: V(), r: 0.062 * arm },
      { part: 'arm', a: j.rEl, ao: V(), b: j.rHand, bo: V(0, -0.08, 0), r: 0.055 * arm },
    ];
    this.resetPose();
    this.snap();
    this.optimize();
  }

  // Ciclo de passos. phase em radianos, amt 0..1, run 0..1
  gait(phase, amt, run = 0) {
    if (amt <= 0.001) return;
    const s = Math.sin(phase),
      c = Math.cos(phase);
    const sw = 0.48 + run * 0.28;
    this.add('lHip', -s * sw * amt);
    this.add('rHip', s * sw * amt);
    this.add('lKnee', (Math.max(0, c) * (0.85 + run * 0.55) + 0.06) * amt);
    this.add('rKnee', (Math.max(0, -c) * (0.85 + run * 0.55) + 0.06) * amt);
    this.add('lAnkle', -Math.max(0, -s) * 0.18 * amt);
    this.add('rAnkle', -Math.max(0, s) * 0.18 * amt);
    this.add('lSh', s * (0.38 + run * 0.35) * amt);
    this.add('rSh', -s * (0.38 + run * 0.35) * amt);
    this.add('lEl', -(0.22 + run * 0.9) * amt);
    this.add('rEl', -(0.22 + run * 0.9) * amt);
    this.add('spine', run * 0.2 * amt, s * 0.08 * amt, 0);
    this.hipsY += -Math.abs(s) * 0.03 * amt * (1 + run);
  }

  // Posição de mundo de um ponto local de uma junta.
  worldPoint(jointName, x, y, z, out) {
    return out.set(x, y, z).applyMatrix4(this.j[jointName].matrixWorld);
  }
}

/*
 Rastejante: corpo horizontal sobre quatro patas compridas. Frente em +Z.
*/
export class CrawlerRig extends RigBase {
  constructor(o = {}) {
    super();
    const s = (this.s = o.scale || 1);
    this.root.scale.setScalar(s);
    this.hipsBaseY = 0;
    this.hipsY = 0;
    const skin = charMat(o.skin ?? 0x5b3a30, 'rustskin');
    const dark = charMat(0x2b1a15, 'rustskin');
    const metal = charMat(0x6a3418, 'metal');
    const eye = charMat(0xff6a1a, 'glow');
    const P = this.part.bind(this);
    const J = this.joint.bind(this);
    J('torso', this.body, 0, 0.34, 0);
    J('neck', this.j.torso, 0, 0.05, 0.36);
    J('head', this.j.neck, 0, 0.0, 0.08);
    J('tail', this.j.torso, 0, 0.02, -0.38);
    P(this.j.torso, BOX(0.34, 0.24, 0.5), skin, 0, 0, 0.1);
    P(this.j.torso, BOX(0.28, 0.2, 0.34), dark, 0, 0.0, -0.3);
    P(this.j.torso, BOX(0.22, 0.06, 0.4), charMat(0xff5a14, 'glow'), 0, -0.12, 0.05).castShadow = false;
    for (let i = 0; i < 6; i++) P(this.j.torso, CONE(0.035, 0.16 - i * 0.012, 4), metal, 0, 0.14, 0.3 - i * 0.12, -0.5);
    this.headMesh = P(this.j.head, SPH(10, 8), skin, 0, 0, 0.08, 0, 0, 0, 0.13, 0.11, 0.17);
    P(this.j.head, BOX(0.16, 0.04, 0.16), dark, 0, -0.07, 0.1, 0.25);
    this.eyes = [];
    for (const [x, y] of [
      [0.05, 0.04],
      [-0.05, 0.04],
      [0.08, 0.0],
      [-0.08, 0.0],
    ]) {
      const e = P(this.j.head, BOX(0.025, 0.018, 0.01), eye, x, y, 0.235);
      e.castShadow = false;
      this.eyes.push(e);
    }
    // Patas: ombro/quadril -> joelho -> pé.
    const legs = [
      ['FL', 0.17, 0.22, 1],
      ['FR', -0.17, 0.22, -1],
      ['BL', 0.15, -0.3, 1],
      ['BR', -0.15, -0.3, -1],
    ];
    for (const [n, x, z] of legs) {
      const hip = J('h' + n, this.j.torso, x, -0.04, z);
      const knee = J('k' + n, hip, 0, -0.36, 0);
      P(hip, CYL(0.045, 0.035, 0.36), skin, 0, -0.18, 0);
      P(knee, CYL(0.033, 0.02, 0.46), dark, 0, -0.23, 0);
      P(knee, CONE(0.03, 0.09, 4), metal, 0, -0.48, 0, Math.PI);
    }
    this.hitDefs = [
      { part: 'head', a: this.j.head, ao: V(0, 0, 0.08), r: 0.16 },
      { part: 'body', a: this.j.torso, ao: V(0, 0, -0.38), b: this.j.torso, bo: V(0, 0, 0.32), r: 0.19 },
      { part: 'leg', a: this.j.hFL, ao: V(), b: this.j.kFL, bo: V(0, -0.3, 0), r: 0.05 },
      { part: 'leg', a: this.j.hFR, ao: V(), b: this.j.kFR, bo: V(0, -0.3, 0), r: 0.05 },
    ];
    this.resetPose();
    this.stance();
    this.snap();
    this.optimize();
  }

  // Pose de apoio: patas abertas como as de uma aranha, joelhos altos.
  stance(crouch = 0) {
    const out = 2.0,
      bend = 1.5;
    for (const n of ['FL', 'BL']) {
      this.set('h' + n, 0, 0, out);
      this.set('k' + n, 0, 0, -bend);
    }
    for (const n of ['FR', 'BR']) {
      this.set('h' + n, 0, 0, -out);
      this.set('k' + n, 0, 0, bend);
    }
    this.add('hFL', 0, -0.45, 0);
    this.add('hFR', 0, 0.45, 0);
    this.add('hBL', 0, 0.45, 0);
    this.add('hBR', 0, -0.45, 0);
    this.set('torso', 0, 0, 0);
    this.set('neck', -0.15, 0, 0);
    this.hipsY = 0;
    this.bodyLift = -crouch * 0.12;
  }

  // Trote: pares diagonais (FL+BR e FR+BL). Rotação Y varre a pata para frente/trás.
  gait(phase, amt) {
    const s = Math.sin(phase),
      c = Math.cos(phase);
    const a = 0.5 * amt,
      lift = 0.4 * amt;
    const liftA = Math.max(0, c) * lift,
      liftB = Math.max(0, -c) * lift;
    this.add('hFL', 0, -s * a, liftA);
    this.add('hBR', 0, s * a, -liftA);
    this.add('hFR', 0, -s * a, -liftB);
    this.add('hBL', 0, s * a, liftB);
    this.add('torso', 0, s * 0.06 * amt, 0);
    this.bodyLift += Math.abs(c) * 0.03 * amt;
  }
}

// Ferreiro (chefe): humanoide enorme com avental, placas de ferro, núcleo incandescente e marreta.
export function buildBlacksmith() {
  const h = new Humanoid({
    scale: 1.85,
    build: 'heavy',
    armScale: 1.55,
    skin: 0x9a7a68,
    infected: true,
    shirt: 0x3a2e26,
    pants: 0x2a2420,
    shoes: 0x1a1410,
    eyes: 0xff7a20,
    sleeves: 'short',
    hair: 0x1a1512,
    hairStyle: 'bald',
    beard: 0x231a14,
  });
  const j = h.j;
  const metal = charMat(0x5c3a28, 'metal');
  const leather = charMat(0x3e2a1c, 'leather');
  const P = h.part.bind(h);
  P(j.spine, BOX(0.46, 0.72, 0.03), leather, 0, 0.2, 0.15);
  P(j.hips, BOX(0.44, 0.5, 0.03), leather, 0, -0.28, 0.12);
  P(j.lSh, BOX(0.2, 0.08, 0.22), metal, 0.03, 0.02, 0, 0, 0, 0.35);
  P(j.rSh, BOX(0.2, 0.08, 0.22), metal, -0.03, 0.02, 0, 0, 0, -0.35);
  P(j.head, BOX(0.15, 0.1, 0.03), metal, 0.03, 0.14, 0.11);
  P(j.spine, BOX(0.5, 0.06, 0.28), metal, 0, 0.0, 0);
  for (let i = 0; i < 5; i++) P(j.spine, CONE(0.04, 0.22, 4), metal, -0.16 + i * 0.08, 0.55, -0.12, -0.9);
  // núcleo incandescente no peito
  h.core = P(j.spine, SPH(12, 10), charMat(0xff7a22, 'glow'), 0, 0.4, 0.125, 0, 0, 0, 0.085, 0.085, 0.05);
  h.core.castShadow = false;
  h.core.userData.keep = true;
  h.coreRing = P(j.spine, cached('ring', () => new THREE.TorusGeometry(0.1, 0.022, 6, 14)), metal, 0, 0.4, 0.12);
  // marreta
  const hammer = new THREE.Group();
  const handle = new THREE.Mesh(CYL(0.032, 0.036, 1.25), charMat(0x3a2a1c, 'leather'));
  handle.position.y = -0.5;
  const head = new THREE.Mesh(BOX(0.46, 0.26, 0.26), metal);
  head.position.y = -1.1;
  const head2 = new THREE.Mesh(BOX(0.1, 0.3, 0.3), charMat(0x3a2018, 'metal'));
  head2.position.set(0.2, -1.1, 0);
  for (const m of [handle, head, head2]) {
    m.castShadow = true;
    hammer.add(m);
  }
  mergeByMaterial(hammer);
  h.mountR.add(hammer);
  h.hammer = hammer;
  // o núcleo tem prioridade sobre o tronco quando os dois são atingidos quase no mesmo ponto
  h.optimize();
  h.hitDefs.unshift({ part: 'core', a: j.spine, ao: V(0, 0.4, 0.17), r: 0.13, priority: 0.3 });
  return h;
}
