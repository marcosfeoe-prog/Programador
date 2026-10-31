// Jogador (a pé, 1ª pessoa) e picape de caçador de tempestades (3ª pessoa ou cabine).
// O vento do tornado empurra, levanta e fere o jogador; a picape aguenta mais.
import * as THREE from 'three';
import { patchFog } from './atmo.js';
import { windField } from './tornado.js';

const _w = new THREE.Vector3();

function buildTruck() {
  const g = new THREE.Group();
  const paint = patchFog(new THREE.MeshStandardMaterial({ color: 0x8a1f1a, roughness: 0.38, metalness: 0.35 }));
  const dark = patchFog(new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.8 }));
  const glass = patchFog(new THREE.MeshStandardMaterial({ color: 0x1a2128, roughness: 0.08, metalness: 0.7 }));
  const chrome = patchFog(new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.25, metalness: 0.9 }));
  const light = patchFog(new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0xffe9b0, emissiveIntensity: 0.6 }));
  const box = (w, h, d, m, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  box(2.0, 0.55, 5.4, paint, 0, 0.85, 0); // chassi/caçamba
  box(1.96, 0.75, 1.9, paint, 0, 1.45, 1.55); // capô
  box(1.9, 0.85, 1.8, paint, 0, 1.75, -0.2); // cabine
  box(1.92, 0.6, 0.06, glass, 0, 1.85, 0.72).rotation.x = -0.35; // para-brisa
  box(1.94, 0.5, 1.4, glass, 0, 1.85, -0.2).scale.set(1.0, 1.0, 0.98);
  box(1.9, 0.35, 0.06, glass, 0, 1.9, -1.1);
  box(2.02, 0.5, 0.08, paint, 0, 1.35, -2.66); // tampa traseira
  box(0.08, 0.5, 2.0, paint, 0.97, 1.35, -1.68);
  box(0.08, 0.5, 2.0, paint, -0.97, 1.35, -1.68);
  box(2.05, 0.25, 0.2, chrome, 0, 0.72, 2.72); // para-choque
  box(0.4, 0.18, 0.05, light, 0.68, 1.35, 2.52);
  box(0.4, 0.18, 0.05, light, -0.68, 1.35, 2.52);
  box(1.6, 0.1, 0.4, dark, 0, 2.25, -0.5); // barra de luzes / sensores
  // anemômetro no teto
  const mast = box(0.05, 0.7, 0.05, dark, 0.6, 2.6, -0.8);
  const cups = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), dark);
    c.position.set(Math.cos(i * 2.094) * 0.18, 0, Math.sin(i * 2.094) * 0.18);
    cups.add(c);
  }
  cups.position.set(0.6, 2.95, -0.8);
  g.add(cups);
  const wheels = [];
  const wgeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 18).rotateZ(Math.PI / 2);
  for (const [x, z] of [[0.92, 1.7], [-0.92, 1.7], [0.92, -1.75], [-0.92, -1.75]]) {
    const w = new THREE.Mesh(wgeo, dark);
    w.position.set(x, 0.42, z);
    g.add(w);
    wheels.push(w);
  }
  g.userData = { wheels, cups, mast };
  return g;
}

export class Player {
  constructor(scene, camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3(30, 0, -300);
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI * 0.75;
    this.pitch = 0.12;
    this.health = 100;
    this.inTruck = false;
    this.camMode = 0; // na picape: 0 = 3ª pessoa, 1 = cabine
    this.onGround = true;
    this.wind = new THREE.Vector3();
    this.windSpeed = 0;
    this.lifted = false;
    this.dead = false;
    this.deathCause = '';
    this.stamina = 1;
    this.lookYaw = 0;

    this.truck = buildTruck();
    this.truck.position.set(36, 0, -296);
    this.truck.rotation.y = 0.2;
    scene.add(this.truck);
    this.tr = { speed: 0, heading: 0.2, steer: 0, vel: new THREE.Vector3(), tilt: 0, roll: 0, airborne: false, vy: 0 };
    this.bob = 0;
    this.shake = 0;
  }

  get eye() {
    return this.camera.position;
  }

  toggleTruck(hud) {
    if (this.inTruck) {
      if (Math.abs(this.tr.speed) > 3) { hud.toast('Pare a picape para descer'); return; }
      this.inTruck = false;
      const side = new THREE.Vector3(Math.cos(this.tr.heading), 0, -Math.sin(this.tr.heading));
      this.pos.copy(this.truck.position).addScaledVector(side, -2.2);
      this.yaw = this.tr.heading + Math.PI;
      this.vel.set(0, 0, 0);
    } else {
      if (this.pos.distanceTo(this.truck.position) > 5) { hud.toast('Chegue mais perto da picape (E)'); return; }
      this.inTruck = true;
      this.lookYaw = 0;
      this.pitch = 0.05;
    }
  }

  update(dt, input, storm, time, colliders) {
    const look = input.consumeLook();
    if (this.inTruck) {
      this.lookYaw -= look.x;
      // volta a olhar para a frente quando a picape anda
      if (!look.x && Math.abs(this.tr.speed) > 3) this.lookYaw *= 1 - Math.min(1, dt * 0.7);
    } else {
      this.yaw -= look.x;
    }
    this.pitch = THREE.MathUtils.clamp(this.pitch - look.y, -1.3, 1.3);
    const ax = input.axis();

    const ref = this.inTruck ? this.truck.position : this.pos;
    windField(storm, ref.x, this.inTruck ? 1.2 : 1.2, ref.z, time, this.wind);
    this.windSpeed = Math.hypot(this.wind.x, this.wind.z);

    if (this.inTruck) this.updateTruck(dt, ax, input, colliders);
    else this.updateWalk(dt, ax, input, colliders);

    // ferimentos pelo vento e detritos
    const limit = this.inTruck ? 62 : 42;
    if (this.windSpeed > limit) {
      this.health -= (this.windSpeed - limit) * (this.inTruck ? 0.5 : 0.9) * dt;
    }
    this.shake = THREE.MathUtils.clamp((this.windSpeed - 18) / 50, 0, 1);
    if (this.health <= 0 && !this.dead) {
      this.health = 0;
      this.dead = true;
      this.deathCause = this.inTruck ? 'A picape foi arremessada pelo tornado.' : 'Você foi apanhado pelo vento do tornado.';
    }
    this.updateCamera(dt, time);
  }

  collide(p, r, colliders) {
    for (const c of colliders) {
      if (c.part && !c.part.alive) continue;
      if (c.tree && c.tree.fall > 0.6) continue;
      const dx = p.x - c.x, dz = p.z - c.z;
      if (Math.abs(dx) > c.r + r + 1 || Math.abs(dz) > c.r + r + 1) continue;
      const d = Math.hypot(dx, dz);
      const m = c.r + r;
      if (d < m && d > 1e-4) {
        p.x = c.x + (dx / d) * m;
        p.z = c.z + (dz / d) * m;
        return true;
      }
    }
    return false;
  }

  updateWalk(dt, ax, input, colliders) {
    const run = input.down('ShiftLeft') || input.down('ShiftRight') || input.down('Run');
    const speed = run && this.stamina > 0.05 ? 7.5 : 3.6;
    if (run && (ax.x || ax.y)) this.stamina = Math.max(0, this.stamina - dt * 0.12);
    else this.stamina = Math.min(1, this.stamina + dt * 0.08);
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const tx = (fx * ax.y + rx * ax.x) * speed;
    const tz = (fz * ax.y + rz * ax.x) * speed;
    const k = this.onGround ? 10 : 0.5;
    this.vel.x += (tx - this.vel.x) * Math.min(1, k * dt);
    this.vel.z += (tz - this.vel.z) * Math.min(1, k * dt);
    // empurrão do vento: arrasto num corpo humano (~0.6 m², 75 kg)
    const rel = _w.copy(this.wind).sub(this.vel);
    const rl = rel.length();
    const push = 0.0045 * rl;
    if (this.windSpeed > 22) {
      this.vel.x += rel.x * push * dt;
      this.vel.z += rel.z * push * dt;
    }
    if (this.windSpeed > 58 || this.wind.y > 25) {
      this.vel.y += (this.wind.y * 0.6 + (this.windSpeed - 58) * 0.3) * dt;
      this.onGround = false;
    }
    if (input.hit('Space') && this.onGround) {
      this.vel.y = 4.6;
      this.onGround = false;
    }
    this.vel.y -= 9.81 * dt;
    this.pos.addScaledVector(this.vel, dt);
    if (this.pos.y <= 0) {
      if (this.vel.y < -14) this.health -= (-this.vel.y - 14) * 6;
      this.pos.y = 0;
      this.vel.y = 0;
      this.onGround = true;
    }
    this.collide(this.pos, 0.4, colliders);
    this.bob += Math.hypot(this.vel.x, this.vel.z) * dt * (this.onGround ? 1.8 : 0);
  }

  updateTruck(dt, ax, input, colliders) {
    const t = this.tr;
    const brake = input.down('Space');
    const fwd = new THREE.Vector3(Math.sin(t.heading), 0, Math.cos(t.heading));
    // cascalho vs. campo
    const p = this.truck.position;
    const m = Math.abs(((p.x + 805) % 1610 + 1610) % 1610 - 805);
    const n = Math.abs(((p.z + 805) % 1610 + 1610) % 1610 - 805);
    const onRoad = Math.min(m, n) < 4.5;
    const vmax = onRoad ? 38 : 19;
    const accel = ax.y > 0 ? 7.5 : ax.y < 0 ? (t.speed > 0.5 ? -14 : -4) : 0;
    if (!t.airborne) {
      t.speed += accel * Math.abs(ax.y) * dt;
      t.speed -= t.speed * (onRoad ? 0.08 : 0.35) * dt;
      if (brake) t.speed -= Math.sign(t.speed) * Math.min(Math.abs(t.speed), 22 * dt);
      t.speed = THREE.MathUtils.clamp(t.speed, -8, vmax);
      t.steer += (ax.x * 0.55 - t.steer) * Math.min(1, dt * 5);
      t.heading -= t.steer * t.speed * dt / (3.2 + Math.abs(t.speed) * 0.12);
    }
    t.vel.copy(fwd).multiplyScalar(t.speed);
    // vento lateral sobre a picape (~2 t, área lateral ~7 m²)
    const rel = _w.copy(this.wind).sub(t.vel);
    const rl = rel.length();
    if (this.windSpeed > 30) {
      const k = 0.00028 * rl;
      t.vel.addScaledVector(rel, k * 6);
      t.speed = t.vel.dot(fwd);
      t.roll = THREE.MathUtils.lerp(t.roll, THREE.MathUtils.clamp((this.windSpeed - 30) / 60, 0, 1) * 0.25 * Math.sin(performance.now() * 0.02), dt * 4);
    } else {
      t.roll *= 1 - Math.min(1, dt * 3);
    }
    if (this.windSpeed > 78 && !t.airborne) {
      t.airborne = true;
      t.vy = 6 + this.wind.y * 0.3;
    }
    if (t.airborne) {
      t.vy += (this.wind.y * 0.15 - 9.81) * dt;
      p.y += t.vy * dt;
      t.vel.addScaledVector(rel, 0.0006 * rl * 30 * dt);
      t.tilt += dt * 1.5;
      if (p.y <= 0) {
        p.y = 0;
        if (t.vy < -8) this.health -= (-t.vy - 8) * 5;
        t.vy = 0;
        t.airborne = false;
        t.tilt = 0;
      }
    }
    p.addScaledVector(t.vel, dt);
    if (this.collide(p, 2.2, colliders)) {
      if (Math.abs(t.speed) > 8) this.health -= Math.abs(t.speed) * 0.8;
      t.speed *= -0.3;
    }
    this.truck.rotation.set(t.tilt, t.heading, t.roll, 'YXZ');
    const wr = this.truck.userData.wheels;
    for (const w of wr) w.rotation.x += t.speed * dt / 0.42;
    this.pos.copy(p);
    this.vel.copy(t.vel);
    if (input.hit('KeyC')) this.camMode = (this.camMode + 1) % 2;
  }

  updateCamera(dt, time) {
    const cam = this.camera;
    this.truck.userData.cups.rotation.y += (this.inTruck ? this.windSpeed : 4 + this.windSpeed) * dt * 0.8;
    const sh = this.shake * this.shake;
    const jx = (Math.sin(time * 37) + Math.sin(time * 23.3)) * 0.004 * sh;
    const jy = (Math.sin(time * 31) + Math.sin(time * 19.7)) * 0.004 * sh;
    if (this.inTruck) {
      const t = this.tr;
      const p = this.truck.position;
      if (this.camMode === 1) {
        const q = new THREE.Vector3(-0.4, 1.95, -0.1).applyEuler(this.truck.rotation);
        cam.position.copy(p).add(q);
        cam.rotation.set(this.pitch + jy, t.heading + Math.PI + this.yawOff(), 0, 'YXZ');
      } else {
        const yaw = t.heading + Math.PI + this.yawOff();
        const dist = 9;
        cam.position.set(p.x + Math.sin(yaw) * dist, 0, p.z + Math.cos(yaw) * dist);
        cam.position.y = Math.max(p.y + 2.8 - Math.sin(this.pitch) * dist, 0.6);
        cam.lookAt(p.x, p.y + 1.8, p.z);
        cam.rotation.x += jy;
      }
    } else {
      const bob = Math.sin(this.bob * 2) * 0.035;
      cam.position.set(this.pos.x, this.pos.y + 1.68 + bob, this.pos.z);
      cam.rotation.set(this.pitch + jy, this.yaw + jx, 0, 'YXZ');
    }
  }

  // olhar livre na picape: yaw relativo ao veículo
  yawOff() {
    return this.lookYaw;
  }
}
