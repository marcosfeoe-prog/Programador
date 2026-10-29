// O Rastejador (Nível 0): humanoide magro de quatro, pele pálida, cabelo preto
// comprido. Modelo por SDF com esqueleto, marcha procedural com IK (mãos e pés
// plantados no chão), cabelo com física, cabeça que acompanha o jogador com
// espasmos. IA: vagar, farejar, investigar sons, perseguir e atacar.
import * as THREE from 'three';
import { sdfMesh, cone, ell } from '../sdf.js';
import { makeRig, resetPose, ik2, Hair, fbm3, noise3 } from './rig.js';
import { Nav, canSee } from './nav.js';
import { gameMaterial, tex, setProbe } from '../materials.js';
import { clamp, damp, dampAngle, wrapAngle, lerp, smoothstep, rng } from '../util.js';
import { Q } from '../config.js';

const J = {
  hips: [0, 0.8, -0.3],
  spine: [0, 0.83, -0.06],
  chest: [0, 0.8, 0.18],
  neck: [0, 0.77, 0.36],
  head: [0, 0.69, 0.46],
  jaw: [0, 0.635, 0.5],
};
for (const s of [1, -1]) {
  const k = s > 0 ? 'l' : 'r';
  J[k + 'Sh'] = [0.16 * s, 0.76, 0.28];
  J[k + 'El'] = [0.31 * s, 0.47, 0.33];
  J[k + 'Wr'] = [0.27 * s, 0.075, 0.5];
  J[k + 'Hip'] = [0.11 * s, 0.76, -0.36];
  J[k + 'Kn'] = [0.21 * s, 0.44, -0.18];
  J[k + 'An'] = [0.18 * s, 0.09, -0.45];
}

const BONES = [
  ['hips', null, J.hips],
  ['spine', 'hips', J.spine],
  ['chest', 'spine', J.chest],
  ['neck', 'chest', J.neck],
  ['head', 'neck', J.head],
  ['jaw', 'head', J.jaw],
  ['lUp', 'chest', J.lSh],
  ['lFo', 'lUp', J.lEl],
  ['lHa', 'lFo', J.lWr],
  ['rUp', 'chest', J.rSh],
  ['rFo', 'rUp', J.rEl],
  ['rHa', 'rFo', J.rWr],
  ['lTh', 'hips', J.lHip],
  ['lSn', 'lTh', J.lKn],
  ['lFt', 'lSn', J.lAn],
  ['rTh', 'hips', J.rHip],
  ['rSn', 'rTh', J.rKn],
  ['rFt', 'rSn', J.rAn],
].map(([name, parent, pos]) => ({ name, parent, pos }));
const BI = Object.fromEntries(BONES.map((b, i) => [b.name, i]));

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function prims() {
  const P = [];
  const seg = (a, b, r1, r2, b1, b2, k = 0.03) => {
    const m = mix(a, b, 0.5), rm = (r1 + r2) / 2;
    P.push(cone(a, m, r1, rm, { bone: BI[b1], k }));
    P.push(cone(m, b, rm, r2, { bone: BI[b2], k }));
  };
  // tronco
  P.push(ell([0, 0.79, -0.33], [0.145, 0.1, 0.125], { bone: BI.hips, k: 0.04 }));
  for (const s of [1, -1]) P.push(ell([0.07 * s, 0.775, -0.41], [0.068, 0.068, 0.066], { bone: BI.hips, k: 0.04 }));
  seg(J.hips, J.spine, 0.1, 0.088, 'hips', 'spine', 0.05);
  seg(J.spine, J.chest, 0.088, 0.12, 'spine', 'chest', 0.05);
  P.push(ell([0, 0.79, 0.17], [0.15, 0.125, 0.17], { bone: BI.chest, k: 0.05 }));
  for (const s of [1, -1]) {
    P.push(ell([0.085 * s, 0.875, 0.22], [0.068, 0.03, 0.085], { bone: BI.chest, k: 0.035 }));
    for (let i = 0; i < 5; i++) {
      const z = 0.05 + i * 0.052;
      P.push(cone([0.035 * s, 0.9, z], [0.13 * s, 0.85, z + 0.012], 0.011, 0.011, { bone: BI.chest, k: 0.014 }));
      P.push(cone([0.13 * s, 0.85, z + 0.012], [0.158 * s, 0.73, z + 0.03], 0.011, 0.01, { bone: BI.chest, k: 0.014 }));
    }
  }
  // vértebras
  const spinePts = [J.hips, J.spine, J.chest, J.neck];
  for (let i = 0; i <= 14; i++) {
    const t = (i / 14) * 3;
    const k = Math.min(2, Math.floor(t));
    const p = mix(spinePts[k], spinePts[k + 1], t - k);
    const bone = ['hips', 'spine', 'chest'][k];
    P.push(ell(add(p, [0, 0.098 - (k === 2 ? 0.01 : 0), 0]), [0.017, 0.016, 0.02], { bone: BI[bone], k: 0.02 }));
  }
  // pescoço e cabeça
  seg([0, 0.84, 0.3], [0, 0.735, 0.46], 0.052, 0.045, 'chest', 'neck', 0.04);
  P.push(ell([0, 0.705, 0.53], [0.079, 0.093, 0.104], { bone: BI.head, k: 0.03 }));
  for (const s of [1, -1]) P.push(ell([0.047 * s, 0.655, 0.585], [0.03, 0.025, 0.032], { bone: BI.head, k: 0.02 }));
  P.push(cone([0, 0.69, 0.615], [0, 0.664, 0.638], 0.013, 0.009, { bone: BI.head, k: 0.01 }));
  P.push(ell([0, 0.603, 0.56], [0.054, 0.028, 0.062], { bone: BI.jaw, k: 0.02 }));
  P.push(ell([0, 0.625, 0.603], [0.042, 0.02, 0.05], { bone: BI.head, k: 0.012, sub: true }));
  for (const s of [1, -1]) P.push(ell([0.032 * s, 0.7, 0.615], [0.022, 0.017, 0.02], { bone: BI.head, k: 0.01, sub: true }));
  // braços
  for (const s of [1, -1]) {
    const k = s > 0 ? 'l' : 'r';
    const sh = J[k + 'Sh'], el = J[k + 'El'], wr = J[k + 'Wr'];
    P.push(ell(sh, [0.05, 0.045, 0.05], { bone: BI[k + 'Up'], k: 0.03 }));
    P.push(cone(sh, el, 0.048, 0.036, { bone: BI[k + 'Up'], k: 0.025 }));
    P.push(ell(el, [0.038, 0.038, 0.038], { bone: BI[k + 'Fo'], k: 0.02 }));
    P.push(cone(el, wr, 0.036, 0.026, { bone: BI[k + 'Fo'], k: 0.02 }));
    const palm = add(wr, [0, -0.035, 0.05]);
    P.push(ell(palm, [0.034, 0.013, 0.048], { bone: BI[k + 'Ha'], k: 0.018 }));
    for (let f = 0; f < 4; f++) {
      const ox = (f - 1.5) * 0.017 * s;
      const base = add(palm, [ox, -0.004, 0.04]);
      const mid = add(base, [ox * 0.6, -0.012, 0.065]);
      const tip = add(mid, [ox * 0.5, -0.03, 0.05 - Math.abs(f - 1.5) * 0.008]);
      P.push(cone(base, mid, 0.0085, 0.0072, { bone: BI[k + 'Ha'], k: 0.006 }));
      P.push(cone(mid, tip, 0.0072, 0.0055, { bone: BI[k + 'Ha'], k: 0.005 }));
    }
    P.push(cone(add(wr, [-0.03 * s, -0.035, 0.03]), add(wr, [-0.065 * s, -0.06, 0.085]), 0.01, 0.007, { bone: BI[k + 'Ha'], k: 0.008 }));
    // pernas
    const hp = J[k + 'Hip'], kn = J[k + 'Kn'], an = J[k + 'An'];
    P.push(cone(hp, kn, 0.072, 0.05, { bone: BI[k + 'Th'], k: 0.03 }));
    P.push(ell(kn, [0.045, 0.045, 0.045], { bone: BI[k + 'Sn'], k: 0.02 }));
    P.push(cone(kn, an, 0.045, 0.03, { bone: BI[k + 'Sn'], k: 0.02 }));
    P.push(ell(add(an, [0, -0.052, 0.065]), [0.038, 0.024, 0.085], { bone: BI[k + 'Ft'], k: 0.02 }));
    for (let f = 0; f < 3; f++) P.push(cone(add(an, [(f - 1) * 0.018 * s, -0.065, 0.13]), add(an, [(f - 1) * 0.022 * s, -0.075, 0.17]), 0.009, 0.007, { bone: BI[k + 'Ft'], k: 0.008 }));
  }
  return P;
}

function skinColor(x, y, z, prim) {
  const n = fbm3(x * 7, y * 7, z * 7, 3);
  const n2 = noise3(x * 22, y * 22, z * 22, 5);
  let r = 0.8, g = 0.6, b = 0.48;
  const m = 0.85 + (n - 0.5) * 0.35 + (n2 - 0.5) * 0.08;
  r *= m;
  g *= m * 0.98;
  b *= m * 0.95;
  // sujeira nas extremidades e juntas
  const low = smoothstep(0.32, 0.05, y);
  r = lerp(r, r * 0.55, low * 0.8);
  g = lerp(g, g * 0.45, low * 0.8);
  b = lerp(b, b * 0.42, low * 0.8);
  // sangue na boca, mãos e manchas
  const dm = Math.hypot(x, (y - 0.62) * 1.3, z - 0.6);
  const blood = Math.max(smoothstep(0.1, 0.03, dm), low * smoothstep(0.55, 0.75, fbm3(x * 9, y * 9, z * 9, 8)), smoothstep(0.7, 0.82, fbm3(x * 5, y * 5, z * 5, 11)) * 0.8);
  r = lerp(r, 0.32, blood);
  g = lerp(g, 0.04, blood);
  b = lerp(b, 0.03, blood);
  // olheiras escuras
  const de = Math.min(Math.hypot(x - 0.032, y - 0.7, z - 0.61), Math.hypot(x + 0.032, y - 0.7, z - 0.61));
  const dk = smoothstep(0.045, 0.015, de);
  // cores pensadas em sRGB → linear
  return [Math.pow(r * (1 - dk * 0.8), 2.2), Math.pow(g * (1 - dk * 0.85), 2.2), Math.pow(b * (1 - dk * 0.8), 2.2)];
}

let GEO = null;
function geometry() {
  if (!GEO) {
    GEO = sdfMesh(prims(), { voxel: Q().pbr ? 0.0105 : 0.014, skin: true, color: skinColor, smooth: 1, weightFall: 0.03 });
  }
  return GEO;
}

function teethGeo(upper) {
  const g = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 11 - 0.5) * 2.2;
    const c = new THREE.ConeGeometry(0.0045, 0.018 + Math.random() * 0.008, 5);
    if (upper) c.rotateX(Math.PI);
    c.translate(Math.sin(a) * 0.036, upper ? 0.633 : 0.61, 0.6 + Math.cos(a) * 0.03 - 0.02);
    g.push(c);
  }
  const merged = new THREE.BufferGeometry();
  const pos = [], nrm = [];
  for (const c of g) {
    const nc = c.toNonIndexed();
    pos.push(...nc.attributes.position.array);
    nrm.push(...nc.attributes.normal.array);
  }
  merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return merged;
}

const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();

export class Hound {
  constructor(level, x, z, seed = 1) {
    this.level = level;
    this.game = level.game;
    this.r = rng(seed);
    this.pos = new THREE.Vector3(x, 0, z);
    this.vel = new THREE.Vector3();
    this.heading = 0;
    this.state = 'wander';
    this.stateT = 0;
    this.threat = 1;
    this.chasing = false;
    this.nav = level.nav || (level.nav = new Nav(level.grid));
    // malha
    this.rig = makeRig(BONES);
    this.mat = gameMaterial({ vertexColors: true, roughness: 0.48, probe: true, detail: tex('skin.jpg'), detailScale: 7, forcePBR: true });
    this.mesh = new THREE.SkinnedMesh(geometry(), this.mat);
    this.mesh.add(this.rig.root);
    this.mesh.bind(this.rig.skeleton);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.group = new THREE.Group();
    this.group.add(this.mesh);
    // dentes e olhos
    const toothMat = gameMaterial({ color: 0xcfc4a2, roughness: 0.35, probe: true, forcePBR: true });
    const head = this.rig.by.head, jaw = this.rig.by.jaw;
    const up = new THREE.Mesh(teethGeo(true), toothMat);
    up.position.set(-J.head[0], -J.head[1], -J.head[2]);
    head.add(up);
    const lo = new THREE.Mesh(teethGeo(false), toothMat);
    lo.position.set(-J.jaw[0], -J.jaw[1], -J.jaw[2]);
    jaw.add(lo);
    const eyeMat = gameMaterial({ color: 0x0a0a08, roughness: 0.08, probe: true, forcePBR: true, emissive: 0x220a04, emissiveIntensity: 0.6 });
    for (const s of [1, -1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.0115, 12, 10), eyeMat);
      e.position.set(0.032 * s - J.head[0], 0.7 - J.head[1], 0.607 - J.head[2]);
      head.add(e);
    }
    this.mats = [this.mat, toothMat, eyeMat];
    // cabelo
    const roots = [];
    const hr = rng(seed + 7);
    const nh = Q().hair;
    const hc = [0, 0.705 - J.head[1], 0.53 - J.head[2]];
    for (let i = 0; i < nh; i++) {
      let d;
      for (;;) {
        d = new THREE.Vector3(hr.range(-1, 1), hr.range(-0.15, 1), hr.range(-1, 0.75));
        if (d.lengthSq() <= 1 && d.lengthSq() > 0.1) break;
      }
      d.normalize();
      roots.push({ p: [hc[0] + d.x * 0.084, hc[1] + d.y * 0.094, hc[2] + d.z * 0.1], len: hr.range(0.28, 0.5) });
    }
    this.hairMat = gameMaterial({ color: 0x0c0a08, roughness: 0.4, probe: true, side: THREE.DoubleSide, forcePBR: true });
    this.mats.push(this.hairMat);
    this.hair = new Hair(head, roots, { segs: 7, width: 0.012, material: this.hairMat, headR: 0.098, headC: hc });
    this.group.add(this.hair.mesh);
    // membros: [osso raiz, meio, ponta, casa (modelo), pole (modelo), fase]
    const B = this.rig.by;
    this.limbs = [
      { a: B.lUp, b: B.lFo, c: B.lHa, home: new THREE.Vector3(0.28, 0.075, 0.52), pole: new THREE.Vector3(0.9, 0.9, 0.25), off: 0, arm: true },
      { a: B.rUp, b: B.rFo, c: B.rHa, home: new THREE.Vector3(-0.28, 0.075, 0.52), pole: new THREE.Vector3(-0.9, 0.9, 0.25), off: 0.5, arm: true },
      { a: B.lTh, b: B.lSn, c: B.lFt, home: new THREE.Vector3(0.18, 0.09, -0.44), pole: new THREE.Vector3(0.4, 0.6, 1.2), off: 0.5 },
      { a: B.rTh, b: B.rSn, c: B.rFt, home: new THREE.Vector3(-0.18, 0.09, -0.44), pole: new THREE.Vector3(-0.4, 0.6, 1.2), off: 0 },
    ];
    for (const l of this.limbs) {
      l.planted = new THREE.Vector3();
      l.from = new THREE.Vector3();
      l.to = new THREE.Vector3();
      l.swing = false;
      l.s = 0;
    }
    this.phase = 0;
    this.speedK = 0;
    this.jaw = 0.1;
    this.twitch = 0;
    this.twitchT = 2;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.attackT = 0;
    this.cooldown = 0;
    this.lastSeen = new THREE.Vector3();
    this.lostT = 0;
    this.target = null;
    this.field = null;
    this.voice = this.game.audio.voice('hound');
    this.probe = new Float32Array(18);
    this.placeLimbs();
  }

  setEnv(env) {
    for (const m of this.mats) {
      m.envMap = env;
      m.envMapIntensity = 0.6;
      m.needsUpdate = true;
    }
  }

  get object() {
    return this.group;
  }

  teleport(x, z) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.state = 'wander';
    this.chasing = false;
    this.target = null;
    this.placeLimbs();
    this.hair.reset();
  }

  placeLimbs() {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    this.mesh.updateMatrixWorld(true);
    for (const l of this.limbs) {
      l.planted.copy(l.home).applyMatrix4(this.mesh.matrixWorld);
      l.planted.y = l.home.y;
      l.swing = false;
    }
  }

  hear(p, radius) {
    if (this.state === 'chase' || this.state === 'attack') return;
    const d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
    if (d < radius) {
      if (this.state === 'investigate' && this.target && Math.hypot(this.target.x - p.x, this.target.z - p.z) < 3) return;
      this.state = 'investigate';
      this.stateT = 0;
      this.target = { x: p.x, z: p.z };
      this.field = this.nav.dijkstra(this.level.grid.cell(p.x), this.level.grid.cell(p.z));
      this.alert = Math.min(1, (this.alert || 0) + 0.5);
    }
  }

  // ------------------------------------------------------------------- IA --
  think(dt) {
    const pl = this.game.player;
    const L = this.level;
    const now = L.time;
    this.stateT += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    const fwdX = Math.sin(this.heading), fwdZ = Math.cos(this.heading);
    const dpx = pl.pos.x - this.pos.x, dpz = pl.pos.z - this.pos.z;
    const dP = Math.hypot(dpx, dpz);
    // visibilidade depende de quanto o jogador está iluminado
    const lit = L.lightLevel(pl.pos.x, pl.pos.z) + (pl.flashOn && pl.battery > 0 ? 0.6 : 0);
    const range = 6 + clamp(lit, 0, 1.2) * 12 * (pl.crouching ? 0.6 : 1);
    const sees = pl.alive && canSee(L, this.pos, 0.7, pl.pos, 1.0 + (1 - pl.crouchK) * 0.4, fwdX, fwdZ, 3.6, range);
    let speed = 0, goal = null;
    switch (this.state) {
      case 'wander': {
        if (!this.target || this.stateT > 30) {
          const p = this.nav.randomReachable(this.r, this.pos.x, this.pos.z, 12, 80);
          this.target = { x: p.x, z: p.z };
          this.field = this.nav.dijkstra(p.cx, p.cz);
          this.stateT = 0;
        }
        if (this.nav.distAt(this.field, this.pos.x, this.pos.z) < 2) {
          this.state = 'sniff';
          this.stateT = 0;
          this.target = null;
        }
        speed = 0.85;
        goal = 'field';
        break;
      }
      case 'sniff':
        speed = 0;
        if (this.stateT > 2.5 + this.r() * 2) {
          this.state = 'wander';
          this.stateT = 0;
        }
        break;
      case 'investigate':
        speed = 1.7;
        goal = 'field';
        if (this.nav.distAt(this.field, this.pos.x, this.pos.z) < 2 || this.stateT > 20) {
          this.state = 'sniff';
          this.stateT = 0;
          this.target = null;
        }
        break;
      case 'chase': {
        speed = 3.6;
        if (sees) {
          this.lastSeen.copy(pl.pos);
          this.lostT = 0;
        } else this.lostT += dt;
        if (this.lostT > 5) {
          this.state = 'investigate';
          this.stateT = 0;
          this.target = { x: this.lastSeen.x, z: this.lastSeen.z };
          this.field = this.nav.dijkstra(L.grid.cell(this.lastSeen.x), L.grid.cell(this.lastSeen.z));
          break;
        }
        goal = sees && dP < 9 ? 'direct' : 'chase';
        if (dP < 1.15 && this.cooldown <= 0 && sees) {
          this.state = 'attack';
          this.stateT = 0;
          this.hit = false;
        }
        break;
      }
      case 'attack':
        speed = this.stateT < 0.35 ? 2.2 : 0;
        goal = 'direct';
        if (!this.hit && this.stateT > 0.32) {
          this.hit = true;
          if (dP < 1.5 && pl.alive) {
            this.game.onHurt(30, this.pos);
            if (!pl.alive) L.killer = this;
          }
        }
        if (this.stateT > 0.75) {
          this.state = 'chase';
          this.cooldown = 1.3;
        }
        break;
    }
    if (sees && this.state !== 'chase' && this.state !== 'attack' && (dP < range * 0.8 || this.state === 'investigate')) {
      this.state = 'chase';
      this.stateT = 0;
      this.lostT = 0;
      this.lastSeen.copy(pl.pos);
      this.game.audio.scream(this.pos.x, 0.7, this.pos.z);
      this.game.audio.stinger();
      this.twitchOn = 0.3;
      this.twitchV = 0.8;
    }
    this.chasing = this.state === 'chase' || this.state === 'attack';
    // direção desejada
    let dx = 0, dz = 0;
    if (goal === 'direct') {
      dx = dpx;
      dz = dpz;
    } else if (goal === 'chase') {
      const f = this.nav.field(this.lastSeen.x, this.lastSeen.z, 'hound', 0.4, now);
      const d = this.nav.descend(f, this.pos.x, this.pos.z);
      if (d) {
        dx = d.x;
        dz = d.z;
      } else {
        dx = this.lastSeen.x - this.pos.x;
        dz = this.lastSeen.z - this.pos.z;
      }
    } else if (goal === 'field' && this.field) {
      const d = this.nav.descend(this.field, this.pos.x, this.pos.z);
      if (d) {
        dx = d.x;
        dz = d.z;
      }
    }
    const l = Math.hypot(dx, dz);
    if (l > 1e-4 && speed > 0) {
      dx /= l;
      dz /= l;
    } else speed = 0;
    return { dx, dz, speed, sees, dP };
  }

  update(dt) {
    const pl = this.game.player;
    const ai = this.think(dt);
    // movimento com inércia e giro limitado
    const want = Math.atan2(ai.dx, ai.dz);
    if (ai.speed > 0) this.heading = dampAngle(this.heading, want, ai.speed > 2 ? 7 : 3.5, dt);
    const facing = Math.cos(wrapAngle(want - this.heading));
    const sp = ai.speed * clamp(facing, 0.15, 1);
    this.vel.x = damp(this.vel.x, Math.sin(this.heading) * sp, 5, dt);
    this.vel.z = damp(this.vel.z, Math.cos(this.heading) * sp, 5, dt);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.level.grid.collide(this.pos, 0.32, 0.1, 0.9);
    const speed = Math.hypot(this.vel.x, this.vel.z);
    this.speedK = damp(this.speedK, clamp(speed / 3.6, 0, 1), 6, dt);
    this.animate(dt, speed, ai);
    // som
    const d = ai.dP;
    if (this.voice) {
      this.voice.set(this.pos.x, 0.7, this.pos.z, clamp(1.2 - d / 18, 0, 1) * (this.chasing ? 0.9 : 0.45));
      this.voice.growl.gain.setTargetAtTime(this.chasing ? 0.5 : this.state === 'investigate' ? 0.15 : 0.03, this.game.audio.ctx.currentTime, 0.2);
      this.voice.lfo.frequency.value = this.chasing ? 2.2 : 0.7;
    }
    // luz
    this.level.probes.sample(this.pos.x, this.pos.z, this.probe);
    for (const m of this.mats) setProbe(m, this.probe, 1);
  }

  animate(dt, speed, ai) {
    const rig = this.rig;
    const B = rig.by;
    const t = this.level.time;
    resetPose(rig);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    const run = this.speedK;
    // fase da marcha
    const stride = lerp(0.75, 1.5, run);
    const duty = lerp(0.62, 0.48, run);
    if (speed > 0.05) this.phase = (this.phase + (speed / stride) * dt) % 1;
    const bob = Math.sin(this.phase * Math.PI * 4);
    // corpo
    const atk = this.state === 'attack' ? Math.sin(clamp(this.stateT / 0.75, 0, 1) * Math.PI) : 0;
    B.hips.position.y += -Math.abs(bob) * 0.03 * (0.4 + run) - run * 0.06;
    B.hips.position.z += atk * 0.18;
    B.hips.rotation.z = Math.sin(this.phase * Math.PI * 2) * 0.06 * (0.3 + run);
    B.spine.rotation.x = -run * 0.12 + bob * 0.03 * run - atk * 0.25;
    B.chest.rotation.x = run * 0.08 - atk * 0.35 + Math.sin(t * 1.3) * 0.02;
    B.chest.rotation.z = -Math.sin(this.phase * Math.PI * 2) * 0.08 * (0.3 + run);
    // cabeça olha para o jogador (ou fareja) com espasmos
    const pl = this.game.player;
    let ly = 0, lp = 0;
    if (this.chasing || (ai.sees && ai.dP < 12) || this.state === 'investigate') {
      const lx = pl.pos.x - this.pos.x, lz = pl.pos.z - this.pos.z;
      ly = clamp(wrapAngle(Math.atan2(lx, lz) - this.heading), -1.1, 1.1);
      lp = clamp(Math.atan2(1.3, Math.hypot(lx, lz)) - 0.3, -0.4, 0.6);
    } else if (this.state === 'sniff') {
      ly = Math.sin(t * 1.7) * 0.7;
      lp = -0.35 + Math.sin(t * 3.1) * 0.08;
    } else ly = Math.sin(t * 0.6) * 0.25;
    this.lookYaw = damp(this.lookYaw, ly, 6, dt);
    this.lookPitch = damp(this.lookPitch, lp, 6, dt);
    this.twitchT -= dt;
    if (this.twitchT <= 0) {
      this.twitchV = this.r.range(-1, 1);
      this.twitchOn = 0.28;
      this.twitchT = this.r.range(1.2, 4);
    }
    this.twitchOn = Math.max(0, (this.twitchOn || 0) - dt);
    const tw = this.twitchOn > 0 ? this.twitchV : 0;
    this.twv = damp(this.twv || 0, tw, 25, dt);
    B.neck.rotation.set(-this.lookPitch * 0.4, this.lookYaw * 0.45, 0);
    B.head.rotation.set(-this.lookPitch * 0.6, this.lookYaw * 0.55, this.twv * 0.7 + Math.sin(t * 9) * 0.02 * run);
    // mandíbula
    const jawT = this.state === 'attack' ? 0.9 : this.chasing ? 0.55 + Math.sin(t * 11) * 0.15 : 0.12 + Math.sin(t * 1.4) * 0.06;
    this.jaw = damp(this.jaw, jawT, 10, dt);
    B.jaw.rotation.x = this.jaw * 0.55;
    this.mesh.updateMatrixWorld(true);
    // membros
    const mw = this.mesh.matrixWorld;
    const swingT = (stride * (1 - duty)) / Math.max(speed, 0.3);
    for (const l of this.limbs) {
      const homeW = tmpV.copy(l.home).applyMatrix4(mw);
      homeW.y = l.home.y;
      if (speed > 0.05) {
        const lp = (this.phase + l.off) % 1;
        const swinging = lp >= duty;
        if (swinging && !l.swing) {
          l.swing = true;
          l.from.copy(l.planted);
          l.to.copy(homeW).addScaledVector(this.vel, swingT * 0.9);
          l.to.y = l.home.y;
        }
        if (swinging) {
          const s = (lp - duty) / (1 - duty);
          l.to.copy(homeW).addScaledVector(this.vel, swingT * 0.9);
          l.to.y = l.home.y;
          l.cur = l.cur || new THREE.Vector3();
          l.cur.lerpVectors(l.from, l.to, smoothstep(0, 1, s));
          l.cur.y += Math.sin(s * Math.PI) * (l.arm ? 0.14 : 0.1) * (0.6 + run * 0.6);
        } else if (l.swing) {
          l.swing = false;
          l.planted.copy(l.to);
          if (l.arm && this.r() < 0.6) this.game.audio.skitter(l.planted.x, 0.05, l.planted.z, 0.4 + run * 0.6);
        }
      } else if (!l.swing && l.planted.distanceTo(homeW) > 0.24) {
        // reposiciona parado
        l.swing = true;
        l.from.copy(l.planted);
        l.to.copy(homeW);
        l.s = 0;
      }
      if (speed <= 0.05 && l.swing) {
        l.s += dt / 0.28;
        l.cur = l.cur || new THREE.Vector3();
        l.cur.lerpVectors(l.from, l.to, smoothstep(0, 1, Math.min(1, l.s)));
        l.cur.y += Math.sin(Math.min(1, l.s) * Math.PI) * 0.1;
        if (l.s >= 1) {
          l.swing = false;
          l.planted.copy(l.to);
        }
      }
      let target = l.swing ? l.cur : l.planted;
      // ataque: braço direito sobe na direção do jogador
      if (l.arm && l.off === 0.5 && atk > 0) {
        tmpV2.set(pl.pos.x, 0.9, pl.pos.z);
        target = tmpV2.lerp(target, 1 - atk);
      }
      ik2(l.a, l.b, l.c, target, tmpV.copy(l.pole).applyMatrix4(mw));
      // mão/pé fica plano no chão
      l.c.rotation.set(0, 0, 0);
    }
    this.hair.update(dt, this.game.camera.position);
  }

  dispose() {
    if (this.voice) this.voice.stop();
    this.hairMat.dispose();
    this.hair.geo.dispose();
  }
}
