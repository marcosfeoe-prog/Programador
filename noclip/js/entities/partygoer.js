// Festeiro (Nível Fun =)): corpo alto e arredondado cor de mostarda, braços
// finos abertos e um sorriso desenhado a giz. Anda gingando, balança os braços,
// inclina a cabeça; quando vê alguém, para, ri e corre para "abraçar".
import * as THREE from 'three';
import { sdfMesh, cone, ell } from '../sdf.js';
import { makeRig, resetPose, fbm3 } from './rig.js';
import { Nav, canSee } from './nav.js';
import { gameMaterial, setProbe } from '../materials.js';
import { partyFace } from '../textures.js';
import { clamp, damp, dampAngle, wrapAngle, lerp, smoothstep, rng } from '../util.js';
import { Q } from '../config.js';

const J = { root: [0, 0.46, 0], spine: [0, 0.95, 0], chest: [0, 1.45, 0], head: [0, 1.78, 0] };
for (const s of [1, -1]) {
  const k = s > 0 ? 'l' : 'r';
  J[k + 'Sh'] = [0.22 * s, 1.56, 0];
  J[k + 'El'] = [0.55 * s, 1.47, 0.04];
  J[k + 'Wr'] = [0.86 * s, 1.5, 0.08];
  J[k + 'Hip'] = [0.12 * s, 0.42, 0];
  J[k + 'Kn'] = [0.13 * s, 0.24, 0.01];
  J[k + 'An'] = [0.13 * s, 0.07, 0];
}
const BONES = [
  ['root', null, J.root],
  ['spine', 'root', J.spine],
  ['chest', 'spine', J.chest],
  ['head', 'chest', J.head],
  ['lUp', 'chest', J.lSh],
  ['lFo', 'lUp', J.lEl],
  ['lHa', 'lFo', J.lWr],
  ['rUp', 'chest', J.rSh],
  ['rFo', 'rUp', J.rEl],
  ['rHa', 'rFo', J.rWr],
  ['lTh', 'root', J.lHip],
  ['lSn', 'lTh', J.lKn],
  ['lFt', 'lSn', J.lAn],
  ['rTh', 'root', J.rHip],
  ['rSn', 'rTh', J.rKn],
  ['rFt', 'rSn', J.rAn],
].map(([name, parent, pos]) => ({ name, parent, pos }));
const BI = Object.fromEntries(BONES.map((b, i) => [b.name, i]));
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

function prims() {
  const P = [];
  P.push(ell([0, 0.47, 0], [0.27, 0.16, 0.25], { bone: BI.root, k: 0.1 }));
  P.push(cone([0, 0.5, 0], [0, 0.95, 0.02], 0.27, 0.275, { bone: BI.root, k: 0.1 }));
  P.push(ell([0, 0.9, 0.035], [0.285, 0.3, 0.262], { bone: BI.spine, k: 0.1 }));
  P.push(cone([0, 0.95, 0.02], [0, 1.45, 0], 0.275, 0.255, { bone: BI.spine, k: 0.1 }));
  P.push(cone([0, 1.45, 0], [0, 1.78, 0], 0.255, 0.25, { bone: BI.chest, k: 0.1 }));
  P.push(ell([0, 1.97, 0], [0.25, 0.36, 0.24], { bone: BI.head, k: 0.14 }));
  for (const s of [1, -1]) {
    const k = s > 0 ? 'l' : 'r';
    P.push(cone(J[k + 'Sh'], J[k + 'El'], 0.05, 0.04, { bone: BI[k + 'Up'], k: 0.04 }));
    P.push(cone(J[k + 'El'], J[k + 'Wr'], 0.04, 0.032, { bone: BI[k + 'Fo'], k: 0.02 }));
    const w = J[k + 'Wr'];
    const palm = add(w, [0.045 * s, 0, 0.005]);
    P.push(ell(palm, [0.05, 0.036, 0.022], { bone: BI[k + 'Ha'], k: 0.02 }));
    for (let f = 0; f < 3; f++) {
      const b0 = add(palm, [0.04 * s, (f - 1) * 0.022, 0]);
      P.push(cone(b0, add(b0, [0.07 * s, (f - 1) * 0.018, 0.01]), 0.016, 0.013, { bone: BI[k + 'Ha'], k: 0.012 }));
    }
    P.push(cone(add(palm, [0, 0.03, 0.01]), add(palm, [0.03 * s, 0.075, 0.02]), 0.015, 0.012, { bone: BI[k + 'Ha'], k: 0.012 }));
    P.push(cone(J[k + 'Hip'], J[k + 'Kn'], 0.095, 0.085, { bone: BI[k + 'Th'], k: 0.05 }));
    P.push(cone(J[k + 'Kn'], J[k + 'An'], 0.085, 0.075, { bone: BI[k + 'Sn'], k: 0.03 }));
    P.push(ell(add(J[k + 'An'], [0, -0.025, 0.05]), [0.085, 0.045, 0.125], { bone: BI[k + 'Ft'], k: 0.03 }));
  }
  return P;
}

function bodyColor(x, y, z) {
  const n = fbm3(x * 4, y * 4, z * 4, 21);
  const n2 = fbm3(x * 12, y * 12, z * 12, 22);
  let r = 0.86, g = 0.66, b = 0.27;
  const m = 0.9 + (n - 0.5) * 0.25 + (n2 - 0.5) * 0.08;
  const dirt = smoothstep(0.45, 0.05, y) * 0.5 + smoothstep(0.62, 0.78, n2) * 0.35;
  r = lerp(r * m, 0.42, dirt);
  g = lerp(g * m, 0.3, dirt);
  b = lerp(b * m, 0.14, dirt);
  return [Math.pow(r, 2.2), Math.pow(g, 2.2), Math.pow(b, 2.2)];
}

let GEO = null, FACE = null;
function geometry() {
  if (!GEO) GEO = sdfMesh(prims(), { voxel: Q().pbr ? 0.018 : 0.024, skin: true, color: bodyColor, smooth: 2, weightFall: 0.05 });
  return GEO;
}

export class Partygoer {
  constructor(level, x, z, seed = 1) {
    this.level = level;
    this.game = level.game;
    this.r = rng(seed);
    this.pos = new THREE.Vector3(x, 0, z);
    this.vel = new THREE.Vector3();
    this.heading = this.r.range(0, 6.28);
    this.state = 'idle';
    this.stateT = this.r.range(0, 3);
    this.threat = 1;
    this.nav = level.nav || (level.nav = new Nav(level.grid));
    this.rig = makeRig(BONES);
    this.mat = gameMaterial({ vertexColors: true, roughness: 0.5, probe: true, forcePBR: true });
    this.mesh = new THREE.SkinnedMesh(geometry(), this.mat);
    this.mesh.add(this.rig.root);
    this.mesh.bind(this.rig.skeleton);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.scale = this.r.range(0.93, 1.08);
    this.mesh.scale.setScalar(this.scale);
    // rosto desenhado (faixa curva presa ao osso da cabeça)
    if (!FACE) FACE = partyFace();
    const fg = new THREE.CylinderGeometry(0.262, 0.262, 0.52, 24, 1, true, -1.1, 2.2);
    fg.translate(0, 1.97 - J.head[1], 0);
    this.faceMat = gameMaterial({ map: FACE, transparent: true, roughness: 0.6, probe: true, forcePBR: true, polygonOffset: true, depthWrite: false });
    const face = new THREE.Mesh(fg, this.faceMat);
    this.rig.by.head.add(face);
    this.mats = [this.mat, this.faceMat];
    this.group = new THREE.Group();
    this.group.add(this.mesh);
    this.phase = this.r();
    this.tilt = 0;
    this.wave = 0;
    this.giggleT = this.r.range(4, 12);
    this.lastSeen = new THREE.Vector3();
    this.lostT = 0;
    this.cooldown = 0;
    this.chasing = false;
    this.probe = new Float32Array(18);
    this.voice = this.game.audio.voice('party');
  }

  get object() {
    return this.group;
  }
  setEnv(env) {
    for (const m of this.mats) {
      m.envMap = env;
      m.envMapIntensity = 0.5;
      m.needsUpdate = true;
    }
  }
  teleport(x, z) {
    this.pos.set(x, 0, z);
    this.state = 'idle';
    this.stateT = 0;
    this.chasing = false;
  }

  hear(p, radius) {
    if (this.state === 'chase' || this.state === 'hug' || this.state === 'notice') return;
    if (Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < radius) {
      this.state = 'walk';
      this.stateT = 0;
      this.target = { x: p.x, z: p.z };
      this.field = this.nav.dijkstra(this.level.grid.cell(p.x), this.level.grid.cell(p.z));
      this.fast = true;
    }
  }

  think(dt) {
    const L = this.level, pl = this.game.player;
    this.stateT += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const dpx = pl.pos.x - this.pos.x, dpz = pl.pos.z - this.pos.z;
    const dP = Math.hypot(dpx, dpz);
    const lit = L.lightLevel(pl.pos.x, pl.pos.z) + (pl.flashOn ? 0.5 : 0);
    const range = 7 + clamp(lit, 0, 1.2) * 13 * (pl.crouching ? 0.65 : 1);
    const sees = pl.alive && this.cooldown <= 0 && canSee(L, this.pos, 2.0, pl.pos, 1.0 + (1 - pl.crouchK) * 0.5, fx, fz, 2.6, range);
    let speed = 0, dx = 0, dz = 0;
    switch (this.state) {
      case 'idle':
        if (this.stateT > 4 + this.r() * 5) {
          const p = this.nav.randomReachable(this.r, this.pos.x, this.pos.z, 8, 40);
          this.field = this.nav.dijkstra(p.cx, p.cz);
          this.state = 'walk';
          this.stateT = 0;
          this.fast = false;
        }
        break;
      case 'walk': {
        speed = this.fast ? 1.6 : 0.9;
        const d = this.field && this.nav.descend(this.field, this.pos.x, this.pos.z);
        if (d) {
          dx = d.x;
          dz = d.z;
        }
        if (!d || d.d < 2 || this.stateT > 25) {
          this.state = 'idle';
          this.stateT = 0;
        }
        break;
      }
      case 'notice':
        // para, inclina a cabeça, ri
        dx = dpx;
        dz = dpz;
        speed = 0.001;
        if (this.stateT > 1.1) {
          this.state = 'chase';
          this.stateT = 0;
          this.lostT = 0;
        }
        break;
      case 'chase': {
        speed = 3.25;
        if (sees) {
          this.lastSeen.copy(pl.pos);
          this.lostT = 0;
        } else this.lostT += dt;
        if (this.lostT > 6) {
          this.state = 'walk';
          this.stateT = 0;
          this.fast = true;
          this.field = this.nav.dijkstra(L.grid.cell(this.lastSeen.x), L.grid.cell(this.lastSeen.z));
          break;
        }
        if (sees && dP < 8) {
          dx = dpx;
          dz = dpz;
        } else {
          const f = this.nav.field(this.lastSeen.x, this.lastSeen.z, 'pg', 0.4, L.time);
          const d = this.nav.descend(f, this.pos.x, this.pos.z);
          if (d) {
            dx = d.x;
            dz = d.z;
          }
        }
        if (dP < 1.1 && sees) {
          this.state = 'hug';
          this.stateT = 0;
          this.hit = false;
        }
        break;
      }
      case 'hug':
        dx = dpx;
        dz = dpz;
        speed = this.stateT < 0.3 ? 1.5 : 0;
        if (!this.hit && this.stateT > 0.35) {
          this.hit = true;
          if (dP < 1.5 && pl.alive) {
            this.game.onHurt(40, this.pos);
            this.game.audio.giggle(this.pos.x, 1.9, this.pos.z, 1.4);
            if (!pl.alive) L.killer = this;
          }
        }
        if (this.stateT > 1.0) {
          // depois do abraço, se afasta um pouco
          this.state = 'walk';
          this.fast = false;
          this.cooldown = 3.5;
          const p = this.nav.randomReachable(this.r, this.pos.x, this.pos.z, 6, 20);
          this.field = this.nav.dijkstra(p.cx, p.cz);
          this.stateT = 0;
        }
        break;
    }
    if (sees && (this.state === 'idle' || this.state === 'walk')) {
      this.state = 'notice';
      this.stateT = 0;
      this.lastSeen.copy(pl.pos);
      this.game.audio.giggle(this.pos.x, 1.9, this.pos.z, 1.2);
      this.game.audio.stinger();
    }
    this.chasing = this.state === 'chase' || this.state === 'hug' || this.state === 'notice';
    const l = Math.hypot(dx, dz);
    if (l > 1e-4) {
      dx /= l;
      dz /= l;
    } else speed = 0;
    return { dx, dz, speed, dP };
  }

  update(dt) {
    const ai = this.think(dt);
    if (ai.speed > 0) this.heading = dampAngle(this.heading, Math.atan2(ai.dx, ai.dz), 5, dt);
    const fwd = Math.cos(wrapAngle(Math.atan2(ai.dx, ai.dz) - this.heading));
    const sp = ai.speed > 0.01 ? ai.speed * clamp(fwd, 0.2, 1) : 0;
    this.vel.x = damp(this.vel.x, Math.sin(this.heading) * sp, 6, dt);
    this.vel.z = damp(this.vel.z, Math.cos(this.heading) * sp, 6, dt);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.level.grid.collide(this.pos, 0.33, 0.1, 2.1);
    const speed = Math.hypot(this.vel.x, this.vel.z);
    this.animate(dt, speed);
    // risadinhas
    this.giggleT -= dt;
    if (this.giggleT <= 0) {
      this.giggleT = this.chasing ? this.r.range(1.5, 3.5) : this.r.range(8, 20);
      if (ai.dP < 25) this.game.audio.giggle(this.pos.x, 1.9, this.pos.z, this.chasing ? 1.1 : 0.6);
    }
    if (this.voice) this.voice.set(this.pos.x, 1.5, this.pos.z, clamp(1 - ai.dP / 16, 0, 1) * 0.25);
    this.level.probes.sample(this.pos.x, this.pos.z, this.probe);
    for (const m of this.mats) setProbe(m, this.probe, 1);
  }

  animate(dt, speed) {
    const B = this.rig.by, t = this.level.time;
    resetPose(this.rig);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    const run = clamp(speed / 3.2, 0, 1);
    const walk = clamp(speed / 0.9, 0, 1);
    const stride = lerp(0.55, 1.1, run);
    const prev = this.phase;
    if (speed > 0.05) this.phase = (this.phase + (speed / stride) * dt * 0.5) % 1;
    // passos que rangem
    if (Math.floor(prev * 2) !== Math.floor(this.phase * 2) && speed > 0.2) this.game.audio.squeak(this.pos.x, 0.05, this.pos.z);
    const a = this.phase * Math.PI * 2;
    const sw = Math.sin(a);
    // pernas curtas
    B.lTh.rotation.x = sw * 0.55 * walk;
    B.rTh.rotation.x = -sw * 0.55 * walk;
    B.lSn.rotation.x = Math.max(0, -Math.cos(a)) * 0.7 * walk;
    B.rSn.rotation.x = Math.max(0, Math.cos(a)) * 0.7 * walk;
    // ginga
    B.root.position.y += Math.abs(Math.cos(a)) * 0.05 * walk - 0.02 * walk;
    B.root.rotation.z = sw * 0.09 * walk;
    B.spine.rotation.z = -sw * 0.08 * walk + Math.sin(t * 0.8) * 0.03;
    B.spine.rotation.x = run * 0.18;
    B.chest.rotation.y = sw * 0.12 * walk;
    B.chest.rotation.x = run * 0.1;
    // cabeça inclinada (mais quando nota alguém)
    const noticing = this.state === 'notice' ? 1 : 0;
    this.tilt = damp(this.tilt, noticing * 0.45 + Math.sin(t * 0.7 + this.phase) * 0.12 + run * Math.sin(t * 7) * 0.15, 6, dt);
    B.head.rotation.z = this.tilt;
    B.head.rotation.x = -noticing * 0.15;
    // braços: balanço largo ao andar, para frente ao correr, abraço
    const hug = this.state === 'hug' ? Math.sin(clamp(this.stateT / 1.0, 0, 1) * Math.PI) : 0;
    for (const s of [1, -1]) {
      const k = s > 0 ? 'l' : 'r';
      const ph = s > 0 ? a : a + Math.PI;
      const flap = Math.sin(ph) * (0.35 * walk + 0.5 * run);
      B[k + 'Up'].rotation.z = s * (-0.25 + flap * 0.6 - run * 0.2) + s * Math.sin(t * 1.3 + s) * 0.06;
      B[k + 'Up'].rotation.y = s * (-run * 0.9 - hug * 1.1);
      B[k + 'Fo'].rotation.y = s * (-0.3 - run * 0.4 - hug * 0.9 + Math.sin(ph * 2) * 0.2 * walk);
      B[k + 'Ha'].rotation.z = s * Math.sin(t * 5 + s) * 0.15 * run;
    }
    // aceno ocasional parado
    if (this.state === 'idle') {
      this.wave = damp(this.wave, Math.sin(this.stateT * 0.9) > 0.6 ? 1 : 0, 3, dt);
      B.rUp.rotation.z += -this.wave * 0.9;
      B.rFo.rotation.z += -this.wave * (0.6 + Math.sin(t * 9) * 0.35);
    }
  }

  dispose() {
    if (this.voice) this.voice.stop();
  }
}
