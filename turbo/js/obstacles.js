// Obstáculos: martelos pendulares, barras giratórias, pistões laterais e
// pilhas de caixotes. Cada um anima, testa colisão com os carros (em
// coordenadas de pista) e informa o perigo de cada faixa para a IA.
import * as THREE from 'three';
import { G } from './config.js';
import { makeFrame } from './track.js';
import { hazardTexture, crateTexture } from './textures.js';
import { CAR_HALF_L, CAR_HALF_W } from './physics.js';
import { clamp, smoothstep } from './util.js';

const HAMMER_L = 7.2;
const HAMMER_PIVOT = 9.0;
const HAMMER_A = 1.1;
const SPIN_L = 5.6;
const PISTON_EXT = 6;
const CRATE = 1.7;

function frac(x) {
  return x - Math.floor(x);
}

function pistonExt(o, t) {
  const p = frac(t / o.period + o.phase);
  if (p < 0.35) return 0;
  if (p < 0.45) return smoothstep(0.35, 0.45, p);
  if (p < 0.75) return 1;
  return 1 - smoothstep(0.75, 0.95, p);
}

function hammerAngle(o, t) {
  return HAMMER_A * Math.sin(Math.PI * 2 * (t / o.period + o.phase));
}

export class Obstacles {
  constructor(track, world, parent) {
    this.track = track;
    this.group = new THREE.Group();
    this.group.name = 'obstaculos';
    parent.add(this.group);
    const fr = makeFrame();
    const hz = new THREE.MeshLambertMaterial({ map: hazardTexture() });
    const metal = new THREE.MeshStandardMaterial({ color: 0x8a919c, metalness: 0.7, roughness: 0.35 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x2a2c33 });
    const accent = new THREE.MeshLambertMaterial({ color: world.side });
    const crate = new THREE.MeshLambertMaterial({ map: crateTexture() });
    this.list = [];
    this.crates = [];
    for (const o of track.obstacles) {
      track.frame(o.s, fr);
      const g = new THREE.Group();
      g.matrixAutoUpdate = false;
      g.matrix.makeBasis(fr.B, fr.N, fr.T.clone().negate()).setPosition(fr.P);
      g.matrixWorldNeedsUpdate = true;
      const hw = fr.w / 2;
      const ob = { ...o, hw, frame: { P: fr.P.clone(), T: fr.T.clone(), N: fr.N.clone(), B: fr.B.clone() }, group: g, cool: new Map() };
      if (o.kind === 'hammer') {
        for (const sg of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, 10, 0.8), accent);
          post.position.set(sg * (hw + 0.9), 5, 0);
          post.castShadow = true;
          g.add(post);
        }
        const beam = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 2.6, 0.9, 1.0), accent);
        beam.position.set(0, 9.7, 0);
        beam.castShadow = true;
        g.add(beam);
        const pivot = new THREE.Group();
        pivot.position.set(0, HAMMER_PIVOT, 0);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.35, HAMMER_L, 0.35), metal);
        arm.position.y = -HAMMER_L / 2;
        arm.castShadow = true;
        pivot.add(arm);
        const headGeo = new THREE.CylinderGeometry(1.05, 1.05, 2.6, 20);
        headGeo.rotateX(Math.PI / 2);
        const head = new THREE.Mesh(headGeo, [hz, dark, dark]);
        head.position.y = -HAMMER_L;
        head.castShadow = true;
        pivot.add(head);
        g.add(pivot);
        ob.pivot = pivot;
      } else if (o.kind === 'spinner') {
        const postGeo = new THREE.CylinderGeometry(0.55, 0.7, 1.9, 16);
        postGeo.translate(0, 0.95, 0);
        const post = new THREE.Mesh(postGeo, [hz, dark, dark]);
        post.castShadow = true;
        g.add(post);
        const rotor = new THREE.Group();
        rotor.position.y = 1.05;
        const bar = new THREE.Mesh(new THREE.BoxGeometry(SPIN_L * 2, 0.5, 0.5), hz);
        bar.castShadow = true;
        rotor.add(bar);
        for (const sg of [-1, 1]) {
          const tip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.9), accent);
          tip.position.x = sg * SPIN_L;
          rotor.add(tip);
        }
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.4, 16), accent);
        cap.position.y = 0.4;
        rotor.add(cap);
        g.add(rotor);
        ob.rotor = rotor;
      } else if (o.kind === 'pistons') {
        const housing = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.8, 4.0), accent);
        housing.position.set(o.side * (hw + 1.7), 1.2, 0);
        housing.castShadow = true;
        g.add(housing);
        const ramGeo = new THREE.BoxGeometry(PISTON_EXT + 0.4, 2.0, 3.0);
        const ram = new THREE.Mesh(ramGeo, [hz, hz, dark, dark, hz, hz]);
        ram.castShadow = true;
        g.add(ram);
        ob.ram = ram;
      } else if (o.kind === 'crates') {
        for (let k = 0; k < (o.stack || 1); k++) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(CRATE, CRATE, CRATE), crate);
          m.castShadow = true;
          const local = new THREE.Vector3(o.d, CRATE / 2 + k * CRATE, 0);
          m.position.copy(local);
          m.rotation.y = (k * 0.4 + o.s) % 0.6;
          g.add(m);
          this.crates.push({ ob, mesh: m, alive: true, local, vel: new THREE.Vector3(), spin: new THREE.Vector3(), t: 0, k });
        }
      }
      this.group.add(g);
      this.list.push(ob);
    }
    this.list.sort((a, b) => a.s - b.s);
    this.time = 0;
  }

  update(t, dt) {
    this.time = t;
    for (const o of this.list) {
      if (o.kind === 'hammer') o.pivot.rotation.z = hammerAngle(o, t);
      else if (o.kind === 'spinner') o.rotor.rotation.y = o.phase + o.speed * t;
      else if (o.kind === 'pistons') {
        const e = pistonExt(o, t);
        o.ram.position.set(o.side * (o.hw + (PISTON_EXT + 0.4) / 2 - e * PISTON_EXT), 1.1, 0);
      }
    }
    for (const c of this.crates) {
      if (c.alive || !c.mesh.visible) continue;
      c.t += dt;
      c.vel.y -= G * dt;
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += c.spin.x * dt;
      c.mesh.rotation.z += c.spin.z * dt;
      if (c.t > 2.5) c.mesh.visible = false;
    }
  }

  // Colisões de todos os carros com os obstáculos próximos.
  collide(cars, t) {
    for (const car of cars) {
      if (car.respawnT > 0 || car.ghostT > 0) continue;
      const s = car.progress;
      for (const o of this.list) {
        if (o.s < s - 8) continue;
        if (o.s > s + 8) break;
        const last = o.cool.get(car) ?? -9;
        if (t - last < 0.8) continue;
        const rs = s - o.s;
        if (car.air) {
          // no ar só batem os martelos (a cabeça fica alta)
          continue;
        }
        let hit = null;
        if (o.kind === 'hammer') {
          const a = hammerAngle(o, t);
          const dh = HAMMER_L * Math.sin(a);
          const hh = HAMMER_PIVOT - HAMMER_L * Math.cos(a);
          if (Math.abs(rs) < CAR_HALF_L + 1.3 && Math.abs(car.d - dh) < CAR_HALF_W + 1.05 && hh < 2.9) {
            const dir = Math.sign(Math.cos(Math.PI * 2 * (t / o.period + o.phase))) || 1;
            hit = { lateral: dir * 16, speedMul: 0.55, spin: 0.9, launch: 6.5 };
          }
        } else if (o.kind === 'spinner') {
          const th = o.phase + o.speed * t;
          const sn = Math.sin(th);
          const cs = Math.cos(th);
          const p = rs * sn + car.d * cs;
          const perp = Math.abs(rs * cs - car.d * sn);
          if (Math.hypot(rs, car.d) < 0.6 + 1.4) hit = { lateral: car.d >= 0 ? 6 : -6, speedMul: 0.35, spin: 0.6 };
          else if (Math.abs(p) < SPIN_L + 0.6 && perp < 0.3 + 1.25) {
            const lat = -p * sn * o.speed;
            hit = { lateral: (Math.sign(lat) || 1) * 13, speedMul: 0.6, spin: 0.7, launch: 3 };
          }
        } else if (o.kind === 'pistons') {
          if (Math.abs(rs) < CAR_HALF_L + 1.5) {
            const e = pistonExt(o, t);
            const face = o.hw - e * PISTON_EXT;
            if (o.side * car.d + CAR_HALF_W > face && e > 0.05) {
              car.d = o.side * (face - CAR_HALF_W - 0.05);
              const moving = frac(t / o.period + o.phase) < 0.47;
              hit = moving ? { lateral: -o.side * 14, speedMul: 0.8, spin: 0.5 } : { lateral: -o.side * 4, speedMul: 0.62 };
            }
          }
        } else if (o.kind === 'crates') {
          for (const c of this.crates) {
            if (c.ob !== o || !c.alive) continue;
            if (Math.abs(rs) < CAR_HALF_L + 0.85 && Math.abs(car.d - o.d) < CAR_HALF_W + 0.85) {
              c.alive = false;
              const f = o.frame;
              const wv = new THREE.Vector3().copy(f.T).multiplyScalar(car.v * 0.85 + 4).addScaledVector(f.N, 6 + c.k * 3).addScaledVector(f.B, (Math.random() - 0.5) * 10);
              c.vel.set(wv.dot(f.B), wv.dot(f.N), -wv.dot(f.T));
              c.spin.set((Math.random() - 0.5) * 12, 0, (Math.random() - 0.5) * 12);
              hit = { lateral: (car.d >= o.d ? 1 : -1) * 2.5, speedMul: 0.8 };
              car.events.push({ type: 'crate' });
            }
          }
        }
        if (hit && car.hit(hit)) o.cool.set(car, t);
      }
    }
  }

  // Perigo (0 ou 1) de estar na faixa lateral `lane` ao chegar ao obstáculo.
  danger(lane, s, v, now) {
    let total = 0;
    const vv = Math.max(v, 12);
    for (const o of this.list) {
      const ds = o.s - s;
      if (ds < 3) continue;
      if (ds > 70) break;
      const t = now + ds / vv;
      let d = 0;
      if (o.kind === 'hammer') {
        const a = hammerAngle(o, t);
        const dh = HAMMER_L * Math.sin(a);
        const hh = HAMMER_PIVOT - HAMMER_L * Math.cos(a);
        if (hh < 3.2 && Math.abs(lane - dh) < 3.0) d = 1;
      } else if (o.kind === 'spinner') {
        const th = o.phase + o.speed * t;
        if (Math.abs(lane) < 2.2) d = 1;
        else if (Math.abs(lane * Math.sin(th)) < 2.0) d = 1;
      } else if (o.kind === 'pistons') {
        const e = Math.max(pistonExt(o, t), pistonExt(o, t - 0.25), pistonExt(o, t + 0.25));
        if (o.side * lane + 1.6 > o.hw - e * PISTON_EXT) d = 1;
      } else if (o.kind === 'crates') {
        for (const c of this.crates) if (c.ob === o && c.alive && Math.abs(lane - o.d) < 2.3) d = 1;
      }
      total += d * (1 - ds / 90);
    }
    return total;
  }
}
