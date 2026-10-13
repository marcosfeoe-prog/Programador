// Jogador (caçador de tempestades): andar, dirigir a picape, câmera livre e
// câmera cinematográfica. O vento empurra/levanta o jogador e destroços ferem.
import * as THREE from 'three';
import { clamp, lerp, smoothstep } from './util/math.js';
import { WORLD } from './config.js';

const _w = new THREE.Vector3();
const _f = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');

export const CAMERA_MODES = {
  walk: 'A pé (1ª pessoa)',
  drive: 'Dirigindo',
  free: 'Câmera livre',
  cine: 'Câmera cinematográfica',
};

export class Player {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    const sp = world.town.playerSpawn;
    this.spawn = new THREE.Vector3(sp.x, world.terrain.heightAt(sp.x, sp.z), sp.z);
    this.pos = this.spawn.clone();
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI * 0.75; // olhando para sudoeste, de onde vêm as tempestades
    this.pitch = 0.08;
    this.onGround = true;
    this.health = 100;
    this.mode = 'walk';
    this.driveCam = 'chase';
    this.truck = world.town.playerTruck;
    this.truckState = { speed: 0, steer: 0, yaw: this.truck.yaw };
    this.lastHit = 10;
    this.hitCooldown = 0;
    this.damageFlash = 0;
    this.dead = false;
    this.deadT = 0;
    this.bob = 0;
    this.shake = 0;
    this.cineAngle = 0;
    this.freePos = new THREE.Vector3();
    this.camOrbit = 0;
    this.chasePos = new THREE.Vector3();
    this.localWind = 0;
    this.airborne = false;
    this.messages = [];
  }

  msg(text, kind = 'info') {
    this.messages.push({ text, kind });
  }

  nearTruck() {
    const t = this.truck;
    if (!t.mesh || t.body) return false;
    return Math.hypot(this.pos.x - t.mesh.position.x, this.pos.z - t.mesh.position.z) < 6;
  }

  cycleCamera() {
    if (this.mode === 'drive') {
      this.driveCam = this.driveCam === 'chase' ? 'cab' : 'chase';
      return;
    }
    const order = ['walk', 'free', 'cine'];
    const i = order.indexOf(this.mode);
    const next = order[(i + 1) % order.length];
    if (next === 'free') this.freePos.copy(this.camera.position);
    this.mode = next;
    this.msg(CAMERA_MODES[next]);
  }

  update(dt, input, ctx) {
    this.hitCooldown -= dt;
    this.lastHit += dt;
    this.damageFlash = Math.max(0, this.damageFlash - dt * 1.5);
    const look = input.consumeLook();

    if (this.dead) {
      this.deadT += dt;
      if (this.deadT > 4.5) this.respawn();
      this.updateCameraDead(dt);
      return;
    }

    if (input.pressed('camera')) this.cycleCamera();
    if (input.pressed('interact')) {
      if (this.mode === 'drive') this.exitTruck();
      else if (this.mode === 'walk' && this.nearTruck()) this.enterTruck();
    }

    if (this.mode === 'walk') this.updateWalk(dt, input, look, ctx);
    else if (this.mode === 'drive') this.updateDrive(dt, input, look, ctx);
    else if (this.mode === 'free') this.updateFree(dt, input, look);
    else if (this.mode === 'cine') this.updateCine(dt, look, ctx);

    // Regeneração
    if (this.lastHit > 6 && this.health < 100) this.health = Math.min(100, this.health + dt * 2);
    if (this.health <= 0 && !this.dead) this.die(ctx);
  }

  hurt(amount, ctx, why) {
    if (this.mode === 'free' || this.mode === 'cine' || this.dead) return;
    this.health -= amount;
    this.lastHit = 0;
    this.damageFlash = Math.min(1, this.damageFlash + amount / 25);
    if (ctx && ctx.onHurt) ctx.onHurt(amount, why);
  }

  die(ctx) {
    this.dead = true;
    this.deadT = 0;
    this.health = 0;
    if (this.mode === 'drive') this.exitTruck(true);
    if (ctx && ctx.onDeath) ctx.onDeath();
  }

  respawn() {
    this.dead = false;
    this.health = 100;
    this.mode = 'walk';
    const t = this.truck;
    if (t.mesh && !t.body) this.pos.set(t.mesh.position.x + 3, 0, t.mesh.position.z + 3);
    else this.pos.copy(this.spawn);
    this.pos.y = this.world.terrain.heightAt(this.pos.x, this.pos.z);
    this.vel.set(0, 0, 0);
    this.msg('Você voltou ao ponto seguro.');
  }

  // ------------------------------------------------------------- a pé
  updateWalk(dt, input, look, ctx) {
    const T = this.world.terrain;
    this.yaw -= look.x;
    this.pitch = clamp(this.pitch - look.y, -1.45, 1.45);
    const fwd = _tmp.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    const mx = input.moveX;
    const my = input.moveY;
    const speed = input.sprint ? 8.2 : 4.3;
    let dx = (fwd.x * my + rx * mx) * speed;
    let dz = (fwd.z * my + rz * mx) * speed;
    const l = Math.hypot(dx, dz);
    if (l > speed) {
      dx *= speed / l;
      dz *= speed / l;
    }
    // Vento sobre o corpo (área ~0,75 m², 80 kg)
    ctx.wind(this.pos.x, this.pos.y + 1, this.pos.z, _w);
    this.localWind = _w.length();
    _f.copy(_w).sub(this.vel);
    const rel = _f.length();
    const k = (0.5 * 1.2 * 1.0 * 0.75 * rel) / 80;
    const ax = _f.x * k;
    const ay = _f.y * k * 0.8;
    const az = _f.z * k;
    this.vel.x += ax * dt;
    this.vel.z += az * dt;
    this.vel.y += (ay - 9.81) * dt;
    const g = T.heightAt(this.pos.x, this.pos.z);
    if (this.onGround) {
      // controle no chão limitado pelo atrito (μ ≈ 0,9)
      const cx = dx - this.vel.x;
      const cz = dz - this.vel.z;
      const cl = Math.hypot(cx, cz);
      const maxA = 0.9 * 9.81 * dt + (cl < 1 ? cl : 0);
      const s = cl > maxA ? maxA / cl : 1;
      this.vel.x += cx * s;
      this.vel.z += cz * s;
      if (input.pressed('jump')) this.vel.y = 5.2;
    } else {
      this.vel.x += dx * 0.02 * dt * 10;
      this.vel.z += dz * 0.02 * dt * 10;
    }
    this.pos.addScaledVector(this.vel, dt);
    const g2 = T.heightAt(this.pos.x, this.pos.z);
    if (this.pos.y <= g2) {
      const impact = Math.hypot(this.vel.x * 0.5, this.vel.y, this.vel.z * 0.5);
      if (!this.onGround && impact > 11) this.hurt((impact - 11) * 7, ctx, 'queda');
      this.pos.y = g2;
      if (this.vel.y < 0) this.vel.y = 0;
      this.onGround = true;
      this.airborne = false;
    } else if (this.pos.y > g2 + 0.25) {
      this.onGround = false;
      if (this.pos.y > g2 + 3) this.airborne = true;
    }
    // Encosta íngreme
    if (this.onGround) {
      const s = (g2 - g) / Math.max(Math.hypot(this.vel.x, this.vel.z) * dt, 1e-3);
      if (s > 1.4) {
        this.pos.x -= this.vel.x * dt;
        this.pos.z -= this.vel.z * dt;
      }
    }
    this.world.town.collide(this.pos, 0.4);
    this.clampWorld(this.pos);
    // Destroços em voo
    this.checkDebris(ctx);
    // Dentro do núcleo do tornado: pancadas de detritos
    if (this.localWind > 48) this.hurt((this.localWind - 48) * 0.35 * dt, ctx, 'detritos');

    // Câmera
    const moving = this.onGround && Math.hypot(this.vel.x, this.vel.z) > 0.5;
    if (moving) this.bob += dt * Math.hypot(this.vel.x, this.vel.z) * 1.6;
    const bobY = moving ? Math.sin(this.bob) * 0.04 : 0;
    this.camera.position.set(this.pos.x, this.pos.y + 1.68 + bobY, this.pos.z);
    this.applyShake(dt, ctx);
    _e.set(this.pitch, this.yaw, 0);
    this.camera.quaternion.setFromEuler(_e);
    if (this.airborne) {
      // girando no ar
      _q.setFromAxisAngle(_tmp.set(0, 0, 1), Math.sin(performance.now() * 0.003) * 0.6);
      this.camera.quaternion.multiply(_q);
    }
  }

  checkDebris(ctx) {
    if (this.hitCooldown > 0) return;
    const p = _tmp.set(this.pos.x, this.pos.y + 1, this.pos.z);
    this.world.physics.forEachNear(p, 2.2, (b) => {
      if (this.hitCooldown > 0) return;
      const relV = _f.copy(b.vel).sub(this.vel).length();
      if (relV < 9) return;
      // distância ao centro (aprox. caixa)
      const d = b.pos.distanceTo(p) - Math.min(b.half.x, b.half.y, b.half.z) - 0.4;
      if (d > Math.max(b.half.x, b.half.y, b.half.z) * 0.6) return;
      const dmg = Math.min(80, relV * Math.sqrt(b.mass) * 0.12);
      this.hurt(dmg, ctx, 'destroço');
      this.vel.addScaledVector(b.vel, Math.min(0.5, b.mass / 400));
      this.hitCooldown = 0.5;
    });
  }

  applyShake(dt, ctx) {
    const t = ctx.tornado;
    let s = smoothstep(18, 60, this.localWind) * 0.12;
    if (t && t.stage === 'tornado') {
      const d = Math.hypot(this.camera.position.x - t.pos.x, this.camera.position.z - t.pos.z);
      s += clamp(t.vmax / 100, 0, 1) * 0.25 / (1 + Math.pow(d / (t.rCore * 4 + 150), 2));
    }
    this.shake = lerp(this.shake, s, 1 - Math.exp(-dt * 4));
    if (this.shake > 0.002) {
      const tt = performance.now() * 0.001;
      this.camera.position.x += Math.sin(tt * 37) * this.shake * 0.5;
      this.camera.position.y += Math.sin(tt * 43 + 1) * this.shake * 0.5;
      this.camera.position.z += Math.sin(tt * 31 + 2) * this.shake * 0.5;
    }
  }

  clampWorld(p) {
    const L = WORLD.playHalf;
    p.x = clamp(p.x, -L, L);
    p.z = clamp(p.z, -L, L);
  }

  // ------------------------------------------------------------- picape
  enterTruck() {
    const t = this.truck;
    this.mode = 'drive';
    t.driven = true;
    this.truckState.yaw = t.mesh.rotation.y;
    this.truckState.speed = 0;
    this.msg('Dirigindo — [W/S] acelerar/frear, [A/D] virar, [E] sair, [C] câmera');
  }

  exitTruck(silent) {
    const t = this.truck;
    this.mode = 'walk';
    t.driven = false;
    const yaw = this.truckState.yaw;
    const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(-2.4);
    this.pos.copy(t.mesh.position).add(side);
    this.pos.y = this.world.terrain.heightAt(this.pos.x, this.pos.z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw + Math.PI;
    if (!silent) this.msg('Você saiu da picape.');
  }

  updateDrive(dt, input, look, ctx) {
    const T = this.world.terrain;
    const t = this.truck;
    const st = this.truckState;
    const throttle = input.moveY;
    const steerIn = -input.moveX;
    // Física simplificada (bicicleta)
    if (throttle > 0) st.speed += (st.speed < 0 ? 14 : 6.5) * throttle * dt;
    else if (throttle < 0) st.speed += (st.speed > 0 ? 13 : 4) * throttle * dt;
    else st.speed -= Math.sign(st.speed) * Math.min(Math.abs(st.speed), 1.6 * dt);
    if (input.isHeld('jump')) st.speed -= Math.sign(st.speed) * Math.min(Math.abs(st.speed), 18 * dt);
    // atrito fora da estrada
    const onRoad = this.onRoad(t.mesh.position.x, t.mesh.position.z);
    const maxV = onRoad ? 38 : 17;
    st.speed = clamp(st.speed, -9, maxV + (Math.abs(st.speed) > maxV ? -dt * 8 : 0));
    if (!onRoad && Math.abs(st.speed) > 17) st.speed -= Math.sign(st.speed) * 8 * dt;
    const steerMax = lerp(0.6, 0.12, clamp(Math.abs(st.speed) / 38, 0, 1));
    st.steer = lerp(st.steer, steerIn * steerMax, 1 - Math.exp(-dt * 6));
    st.yaw += (st.speed / 3.4) * Math.tan(st.steer) * dt;
    const fx = Math.sin(st.yaw);
    const fz = Math.cos(st.yaw);
    // vento empurra lateralmente
    ctx.wind(t.mesh.position.x, t.mesh.position.y + 1, t.mesh.position.z, _w);
    this.localWind = _w.length();
    const p = t.mesh.position;
    p.x += fx * st.speed * dt + _w.x * 0.004 * this.localWind * dt;
    p.z += fz * st.speed * dt + _w.z * 0.004 * this.localWind * dt;
    this.clampWorld(p);
    // colisão com construções
    _tmp.set(p.x, p.y, p.z);
    this.world.town.collide(_tmp, 1.8);
    if (_tmp.x !== p.x || _tmp.z !== p.z) st.speed *= 0.3;
    p.x = _tmp.x;
    p.z = _tmp.z;
    // apoio no terreno (4 rodas)
    const s = t.spec;
    const hf = T.heightAt(p.x + fx * s.l * 0.35, p.z + fz * s.l * 0.35);
    const hb = T.heightAt(p.x - fx * s.l * 0.35, p.z - fz * s.l * 0.35);
    const rxv = Math.cos(st.yaw);
    const rzv = -Math.sin(st.yaw);
    const hr = T.heightAt(p.x + rxv * s.w * 0.45, p.z + rzv * s.w * 0.45);
    const hl = T.heightAt(p.x - rxv * s.w * 0.45, p.z - rzv * s.w * 0.45);
    p.y = (hf + hb + hr + hl) / 4;
    const pitch = Math.atan2(hb - hf, s.l * 0.7);
    const roll = Math.atan2(hr - hl, s.w * 0.9);
    _e.set(pitch, st.yaw, roll, 'YXZ');
    t.mesh.quaternion.setFromEuler(_e);
    t.x = p.x;
    t.z = p.z;
    t.y = p.y;
    t.yaw = st.yaw;
    this.pos.copy(p);

    // O vento pode arrancar a picape da estrada
    const hv = Math.hypot(_w.x, _w.z);
    const Fh = 0.5 * 1.2 * s.l * s.h * 0.85 * hv * hv;
    const L = 0.5 * 1.2 * 0.45 * s.l * s.w * hv * hv;
    if ((Fh > 0.62 * s.mass * 9.81 || L > 0.8 * s.mass * 9.81) && ctx.tornado) {
      t.driven = false;
      ctx.activateCar(t, ctx.tornado);
      t.body.vel.set(fx * st.speed, 0, fz * st.speed);
      this.mode = 'walk';
      this.pos.copy(p).add(new THREE.Vector3(0, 1.5, 0));
      this.vel.set(fx * st.speed + _w.x * 0.3, 4, fz * st.speed + _w.z * 0.3);
      this.onGround = false;
      this.hurt(25, ctx, 'picape arremessada');
      this.msg('A picape foi arrancada pelo vento!', 'alert');
      return;
    }
    if (this.localWind > 50) this.hurt((this.localWind - 50) * 0.2 * dt, ctx, 'detritos');

    // Câmera
    this.camOrbit = clamp(this.camOrbit - look.x, -Math.PI, Math.PI);
    if (Math.abs(look.x) < 1e-4) this.camOrbit *= Math.exp(-dt * 0.8);
    this.pitch = clamp(this.pitch - look.y, -0.8, 0.9);
    if (this.driveCam === 'chase') {
      const a = st.yaw + Math.PI + this.camOrbit;
      const dist = 9;
      const want = _tmp.set(p.x + Math.sin(a) * dist, p.y + 3.4 + this.pitch * 4, p.z + Math.cos(a) * dist);
      const gy = T.heightAt(want.x, want.z) + 1.2;
      if (want.y < gy) want.y = gy;
      this.chasePos.lerp(want, 1 - Math.exp(-dt * 6));
      if (this.chasePos.distanceTo(want) > 30) this.chasePos.copy(want);
      this.camera.position.copy(this.chasePos);
      this.camera.lookAt(p.x, p.y + 1.6, p.z);
    } else {
      const seat = new THREE.Vector3(-0.42, 1.55, 0.35).applyQuaternion(t.mesh.quaternion).add(p);
      this.camera.position.copy(seat);
      _e.set(this.pitch * 0.6, st.yaw + Math.PI + this.camOrbit, 0, 'YXZ');
      this.camera.quaternion.setFromEuler(_e);
    }
    this.applyShake(dt, ctx);
  }

  onRoad(x, z) {
    if (Math.abs(x) < 300 && Math.abs(z) < 200) return true;
    return this.world.distToRoad(x, z) < 6.5;
  }

  // ------------------------------------------------------------- câmera livre
  updateFree(dt, input, look) {
    this.yaw -= look.x;
    this.pitch = clamp(this.pitch - look.y, -1.5, 1.5);
    _e.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(_e);
    const sp = input.sprint ? 120 : 28;
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const r = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.freePos.addScaledVector(f, input.moveY * sp * dt);
    this.freePos.addScaledVector(r, input.moveX * sp * dt);
    if (input.isHeld('jump')) this.freePos.y += sp * dt;
    if (input.isHeld('down')) this.freePos.y -= sp * dt;
    const g = this.world.terrain.heightAt(this.freePos.x, this.freePos.z) + 1.5;
    if (this.freePos.y < g) this.freePos.y = g;
    this.freePos.y = Math.min(this.freePos.y, 6000);
    this.clampWorld(this.freePos);
    this.camera.position.copy(this.freePos);
  }

  // ------------------------------------------------------------- câmera cinematográfica
  updateCine(dt, look, ctx) {
    const st = ctx.storm;
    const t = ctx.tornado;
    let target;
    let dist;
    let h;
    if (t) {
      target = new THREE.Vector3(t.pos.x, t.pos.y + t.H * 0.35, t.pos.z);
      dist = clamp(t.rCore * 7 + 650, 700, 2600);
      h = 35;
    } else if (st.alpha > 0.2) {
      target = new THREE.Vector3(st.wallPos.x, WORLD.cloudBase * 0.5, st.wallPos.y);
      dist = 4200;
      h = 60;
    } else {
      target = new THREE.Vector3(0, 30, 0);
      dist = 900;
      h = 120;
    }
    this.cineAngle += dt * 0.035 - look.x * 0.5;
    const x = target.x + Math.cos(this.cineAngle) * dist;
    const z = target.z + Math.sin(this.cineAngle) * dist;
    const y = Math.max(this.world.terrain.heightAt(x, z) + h, 10);
    const want = new THREE.Vector3(x, y, z);
    if (!this.cinePos || this.cinePos.distanceTo(want) > 3000) this.cinePos = want.clone();
    this.cinePos.lerp(want, 1 - Math.exp(-dt * 0.8));
    this.camera.position.copy(this.cinePos);
    this.camera.lookAt(target);
  }

  updateCameraDead(dt) {
    this.camera.position.y = lerp(this.camera.position.y, this.pos.y + 0.3, 1 - Math.exp(-dt * 3));
    _q.setFromAxisAngle(_tmp.set(0, 0, 1), dt * 0.2);
    this.camera.quaternion.multiply(_q);
  }
}
