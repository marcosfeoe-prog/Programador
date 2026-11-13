// Personagens não infectados: sobreviventes (com poses de vigia, sentado, ferido, mirando...)
// e a companheira que segue o jogador e atira nos infectados.
import * as THREE from 'three';
import { Humanoid, charMat, BOX, CYL } from './rig.js';
import { makePistol, makeShotgun, makeRifle, mats } from './models.js';
import { clamp, dampAngle, angleDiff, rand, pick } from './util.js';
import { raycastAll } from './combat.js';
import { mergeByMaterial } from './geo.js';

const _v = new THREE.Vector3();
const _p = { x: 0, z: 0 };
const _dir = { x: 0, z: 0 };
const _o = { x: 0, y: 0, z: 0 };
const _d = { x: 0, y: 0, z: 0 };

function makeBat() {
  const m = mats(),
    g = new THREE.Group();
  const b = new THREE.Mesh(CYL(0.035, 0.02, 0.8, 6), m.darkWood);
  b.position.y = -0.3;
  b.castShadow = true;
  g.add(b);
  return g;
}

function makeBinoculars() {
  const m = mats(),
    g = new THREE.Group();
  for (const x of [-0.035, 0.035]) {
    const c = new THREE.Mesh(CYL(0.025, 0.025, 0.12, 8), m.gunDark);
    c.rotation.x = Math.PI / 2;
    c.position.set(x, -0.04, 0.04);
    g.add(c);
  }
  return mergeByMaterial(g);
}

export class NPC {
  constructor(G, o) {
    this.G = G;
    this.id = o.id;
    this.name = o.name || o.id;
    this.rig = new Humanoid({ ...(o.look || {}), eyes: null });
    this.pos = new THREE.Vector3(o.x, o.y || 0, o.z);
    this.yaw = o.yaw ?? 0;
    this.radius = 0.34;
    this.mode = o.mode || 'idle';
    this.t = rand(0, 10);
    this.phase = 0;
    this.speed = 1.6;
    this.path = null;
    this.face = null;
    this.talking = 0;
    this.weaponKind = o.weapon || null;
    this.solid = o.solid !== false;
    this.guard = o.guard || 0;
    this.fireCd = 1;
    this.targetT = 0;
    this.target = null;
    this.calm = 0;
    this.baseMode = this.mode;
    if (o.weapon === 'pistol' || o.weapon === 'shotgun' || o.weapon === 'rifle') {
      this.gun = o.weapon === 'pistol' ? makePistol() : o.weapon === 'shotgun' ? makeShotgun() : makeRifle();
      this.gunMount = new THREE.Group();
      this.gunMount.rotation.x = Math.PI / 2;
      this.gunMount.add(this.gun);
      this.rig.mountR.add(this.gunMount);
    } else if (o.weapon === 'bat') this.rig.mountR.add(makeBat());
    else if (o.weapon === 'binoculars') this.rig.mountR.add(makeBinoculars());
    G.scene.add(this.rig.root);
    this.pose(0);
    this.rig.snap();
    this.sync();
  }

  remove() {
    this.G.scene.remove(this.rig.root);
    this.rig.dispose();
  }

  // Caminha por uma lista de pontos [[x,z],...]
  walk(points, speed = 1.6, onArrive = null) {
    this.path = points.map((p) => ({ x: p[0], z: p[1] }));
    this.speed = speed;
    this.onArrive = onArrive;
    this.mode = 'walk';
  }

  teleport(x, z, yaw) {
    this.pos.set(x, this.pos.y, z);
    if (yaw !== undefined) this.yaw = yaw;
    this.path = null;
  }

  lookAt(x, z) {
    this.face = { x, z };
  }

  // Muda a pose; se estiver andando, aplica ao chegar.
  setMode(m) {
    if (this.path && this.mode === 'walk') this.afterMode = m;
    else this.mode = m;
  }

  sync() {
    const r = this.rig.root;
    r.position.copy(this.pos);
    r.rotation.y = this.yaw;
    r.updateMatrixWorld(true);
  }

  // Pose de acordo com o modo.
  pose(dt) {
    const R = this.rig,
      t = this.t;
    R.resetPose();
    const breath = Math.sin(t * 1.7) * 0.02;
    switch (this.mode) {
      case 'walk':
      case 'follow':
      case 'combat':
        break;
      case 'aim':
        this.aimPose(0);
        break;
      case 'lookout':
        R.set('lSh', -2.1, 0, -0.35);
        R.set('rSh', -2.1, 0, 0.35);
        R.set('lEl', -1.5);
        R.set('rEl', -1.5);
        R.set('neck', -0.05 + Math.sin(t * 0.4) * 0.05, Math.sin(t * 0.3) * 0.5, 0);
        R.set('spine', 0.05, Math.sin(t * 0.3) * 0.15, 0);
        break;
      case 'sit':
        R.hipsY = -0.5;
        R.set('lHip', -1.5);
        R.set('rHip', -1.5);
        R.set('lKnee', 1.5);
        R.set('rKnee', 1.5);
        R.set('spine', 0.25 + breath, 0, 0);
        R.set('lSh', -0.6, 0, -0.2);
        R.set('rSh', -0.6, 0, 0.2);
        R.set('lEl', -0.9);
        R.set('rEl', -0.9);
        R.set('neck', 0.2);
        break;
      case 'wounded':
        // deitado de costas no colchão, mão no braço mordido
        R.bodyTilt = -1.5;
        R.bodyLift = 0.28;
        R.set('lSh', -0.2, 0, 0.4);
        R.set('rSh', -1.2, 0, -0.5);
        R.set('rEl', -1.6);
        R.set('neck', 0.25 + Math.sin(t * 0.8) * 0.05, 0.4, 0);
        R.set('rHip', -0.4);
        R.set('rKnee', 0.7);
        R.set('spine', Math.sin(t * 2.2) * 0.03, 0, 0);
        break;
      case 'sitGround':
        // sentado no chão encostado na parede, pernas esticadas
        R.hipsY = -0.78;
        R.set('lHip', -1.45);
        R.set('rHip', -1.35, 0, -0.1);
        R.set('lKnee', 0.15);
        R.set('rKnee', 0.5);
        R.set('spine', -0.12 + breath, 0, 0);
        R.set('lSh', -0.4, 0, 0.2);
        R.set('rSh', -0.6, 0, -0.2);
        R.set('lEl', -0.6);
        R.set('rEl', -0.9);
        R.set('neck', 0.15);
        break;
      case 'cower':
        R.hipsY = -0.45;
        R.set('lHip', -1.2);
        R.set('rHip', -1.2);
        R.set('lKnee', 1.8);
        R.set('rKnee', 1.8);
        R.set('spine', 0.7, 0, 0);
        R.set('lSh', -2.6, 0, -0.6);
        R.set('rSh', -2.6, 0, 0.6);
        R.set('lEl', -1.8);
        R.set('rEl', -1.8);
        break;
      case 'wave': {
        const k = Math.sin(t * 9);
        R.set('lSh', -2.9, 0, -0.5 + k * 0.35);
        R.set('rSh', -2.9, 0, 0.5 - k * 0.35);
        R.set('lEl', -0.3);
        R.set('rEl', -0.3);
        R.set('neck', -0.45);
        R.set('spine', -0.1);
        break;
      }
      case 'threat':
        R.set('rSh', -2.6, 0, 0.3);
        R.set('rEl', -0.9);
        R.set('lSh', -0.7, 0, -0.3);
        R.set('lEl', -0.8);
        R.set('spine', 0.1, 0.2, 0);
        break;
      case 'lookUp':
        R.set('neck', -0.6, 0, 0);
        R.set('spine', -0.15, 0, 0);
        R.set('lSh', -0.15, 0, 0.08);
        R.set('rSh', -0.15, 0, -0.08);
        break;
      case 'kneelHelp':
        R.hipsY = -0.36;
        R.set('lHip', -1.5);
        R.set('lKnee', 1.5);
        R.set('rHip', 0.05);
        R.set('rKnee', 1.6);
        R.set('rAnkle', 0.8);
        R.set('spine', 0.5, 0, 0);
        R.set('lSh', -1.1, 0, 0.2);
        R.set('rSh', -1.1, 0, -0.2);
        R.set('neck', 0.3);
        break;
      case 'hug':
        R.set('lSh', -1.4, 0, 0.6);
        R.set('rSh', -1.4, 0, -0.6);
        R.set('lEl', -1.3);
        R.set('rEl', -1.3);
        R.set('spine', 0.15, 0, 0);
        R.set('neck', 0.2);
        break;
      case 'handsUp':
        R.set('lSh', -2.8, 0, -0.35);
        R.set('rSh', -2.8, 0, 0.35);
        R.set('lEl', -0.4);
        R.set('rEl', -0.4);
        break;
      case 'cook':
        R.set('spine', 0.35, 0, 0);
        R.set('rSh', -1.0, 0, 0.3);
        R.set('rEl', -0.6 - Math.sin(t * 3) * 0.3);
        R.set('lSh', -0.5);
        break;
      default:
        R.set('spine', breath, Math.sin(t * 0.4) * 0.05, 0);
        R.set('lSh', -0.1, 0, 0.06);
        R.set('rSh', this.weaponKind === 'pistol' ? -0.3 : -0.1, 0, -0.06);
        R.set('rEl', this.weaponKind ? -0.6 : -0.2);
        R.set('lEl', -0.2);
        if (this.weaponKind === 'shotgun' || this.weaponKind === 'bat' || this.weaponKind === 'rifle') {
          R.set('rSh', -0.45, 0, 0.25);
          R.set('rEl', -1.15);
          R.set('lSh', -0.75, 0, -0.45);
          R.set('lEl', -1.0);
        }
    }
    if (this.talking > 0) {
      R.add('rSh', -0.3 - Math.max(0, Math.sin(t * 5)) * 0.4, 0, 0);
      R.add('rEl', -0.5);
      R.add('neck', Math.sin(t * 3) * 0.06);
    }
    void dt;
  }

  aimPose(pitch) {
    const R = this.rig;
    if (this.weaponKind === 'shotgun' || this.weaponKind === 'rifle') {
      R.set('rSh', -1.25 - pitch, 0, 0.42);
      R.set('rEl', -0.85);
      R.set('lSh', -1.45 - pitch, 0, -0.12);
      R.set('lEl', -0.2);
      R.set('spine', 0, 0.28, 0);
    } else {
      R.set('rSh', -1.55 - pitch, 0, 0.24);
      R.set('rEl', -0.08);
      R.set('lSh', -1.45 - pitch, 0, -0.52);
      R.set('lEl', -0.5);
      R.set('spine', 0, 0.16, 0);
    }
  }

  // Vigia: atira nos infectados que chegam perto do posto (o beco fica seguro).
  guardThink(dt) {
    const G = this.G;
    this.targetT -= dt;
    if (this.targetT <= 0 || (this.target && !this.target.alive)) {
      this.targetT = 0.4;
      this.target = null;
      let bd = this.guard;
      for (const e of G.enemies.list) {
        if (!e.alive || !e.hittable || e.isBoss) continue;
        if (e.kind === 'stalker' && !e.revealed) continue;
        const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
        if (d >= bd) continue;
        if (!G.col.clear(this.pos.x, this.pos.y + 1.45, this.pos.z, e.pos.x, e.pos.y + e.height * 0.6, e.pos.z, 'bullet')) continue;
        bd = d;
        this.target = e;
      }
    }
    const tg = this.target;
    if (!tg) {
      this.calm += dt;
      if (this.calm > 2 && this.mode === 'aim') this.mode = this.baseMode;
      return;
    }
    this.calm = 0;
    if (this.mode !== 'aim') {
      this.baseMode = this.mode === 'aim' ? this.baseMode : this.mode;
      this.mode = 'aim';
    }
    const ty = Math.atan2(tg.pos.x - this.pos.x, tg.pos.z - this.pos.z);
    this.yaw = dampAngle(this.yaw, ty, 8, dt);
    this.fireCd -= dt;
    if (this.fireCd <= 0 && Math.abs(angleDiff(this.yaw, ty)) < 0.2) {
      const dist = Math.hypot(tg.pos.x - this.pos.x, tg.pos.z - this.pos.z);
      this.shootAt(tg, dist);
    }
  }

  shootAt(e, dist) {
    const G = this.G;
    const kind = this.weaponKind;
    this.rig.mountR.getWorldPosition(_v);
    const head = Math.random() < (kind === 'rifle' ? 0.6 : 0.3) && e.kind !== 'crawler' && e.kind !== 'dog' && e.kind !== 'dragger';
    const tx = e.pos.x,
      ty = e.pos.y + e.height * (head ? 0.9 : 0.6),
      tz = e.pos.z;
    const spread = (kind === 'rifle' ? 0.005 : 0.02) + dist * 0.003;
    let dx = tx - _v.x + rand(-1, 1) * spread * dist,
      dy = ty - _v.y + rand(-1, 1) * spread * dist,
      dz = tz - _v.z + rand(-1, 1) * spread * dist;
    const L = Math.hypot(dx, dy, dz) || 1;
    _o.x = _v.x;
    _o.y = _v.y;
    _o.z = _v.z;
    _d.x = dx / L;
    _d.y = dy / L;
    _d.z = dz / L;
    const hit = raycastAll(G, _o, _d, 60);
    G.audio.shot(kind === 'rifle' ? 'rifle' : kind === 'shotgun' ? 'shotgun' : 'pistol', this.pos);
    G.fx.sparks(_v, _d, 3, [1, 0.8, 0.45]);
    if (hit && hit.kind === 'enemy') {
      const dmg = kind === 'rifle' ? 80 : kind === 'shotgun' ? (dist < 10 ? 70 : 30) : 26;
      hit.enemy.onHit({ dmg, part: hit.part, weapon: kind, dir: { x: _d.x, y: 0, z: _d.z }, push: kind === 'shotgun' ? 2 : 0.8, knockdown: kind === 'shotgun' && dist < 7 });
      G.fx.blood({ x: hit.x, y: hit.y, z: hit.z }, _d, 6);
    } else if (hit && hit.kind !== 'object') G.fx.impact(hit, _d);
    this.fireCd = kind === 'rifle' ? rand(1.4, 2.0) : kind === 'shotgun' ? rand(1.0, 1.4) : rand(0.5, 0.8);
  }

  update(dt) {
    this.t += dt;
    if (this.talking > 0) this.talking -= dt;
    if (this.guard && this.G.state === 'play') this.guardThink(dt);
    let moving = 0;
    if (this.mode === 'walk' && this.path) {
      const goal = this.path[0];
      const dx = goal.x - this.pos.x,
        dz = goal.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.25) {
        this.path.shift();
        if (!this.path.length) {
          this.path = null;
          this.mode = this.afterMode || 'idle';
          this.afterMode = null;
          const cb = this.onArrive;
          this.onArrive = null;
          if (cb) cb(this);
        }
      } else {
        const sp = Math.min(this.speed, d * 3 + 0.3);
        this.pos.x += (dx / d) * sp * dt;
        this.pos.z += (dz / d) * sp * dt;
        this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 8, dt);
        moving = sp;
      }
    } else if (this.face) {
      this.yaw = dampAngle(this.yaw, Math.atan2(this.face.x - this.pos.x, this.face.z - this.pos.z), 5, dt);
    }
    this.pose(dt);
    if (moving > 0) {
      this.phase += dt * moving * 4.4;
      this.rig.gait(this.phase, Math.min(1, moving / 1.5), moving > 3 ? 0.7 : 0);
      if (this.weaponKind === 'shotgun') {
        this.rig.set('rSh', -0.45, 0, 0.25);
        this.rig.set('rEl', -1.15);
      }
    }
    this.rig.apply(dt, 10);
    this.sync();
  }
}

// ======================================================================= COMPANHEIRA
const BARKS = {
  kill: ['Peguei um!', 'Menos um.', 'Caiu!', 'Esse não levanta mais.'],
  behind: ['Atrás de você, Ryan!', 'Cuidado, atrás!'],
  reload: ['Recarregando!', 'Me cobre, tô recarregando!'],
  screamer: ['Gritador! Derruba ele antes que grite!'],
  bloater: ['Inchado! Não deixa ele chegar perto!'],
  hurt: ['Tá sangrando, Ryan. Usa um tônico.'],
};

export class Companion extends NPC {
  constructor(G, o) {
    super(G, { ...o, weapon: 'pistol' });
    this.mode = 'follow';
    this.fireCd = 1;
    this.mag = 15;
    this.reloadT = 0;
    this.barkT = 4;
    this.target = null;
    this.retarget = 0;
    this.stuck = 0;
    this.side = 1;
    this.downT = 0;
  }

  bark(kind) {
    if (this.barkT > 0) return;
    this.barkT = rand(7, 12);
    this.G.ui.say(this.name, pick(BARKS[kind]), 2.2);
  }

  pickTarget() {
    const G = this.G;
    let best = null,
      bd = 21;
    for (const e of G.enemies.list) {
      if (!e.alive || !e.hittable || e.isBoss) continue;
      if (e.kind === 'stalker' && !e.revealed) continue;
      const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
      if (d >= bd) continue;
      if (!G.col.clear(this.pos.x, 1.45, this.pos.z, e.pos.x, e.pos.y + e.height * 0.6, e.pos.z, 'bullet')) continue;
      bd = d;
      best = e;
    }
    // chefes: só se não houver outro alvo
    if (!best && G.enemies.boss && G.enemies.boss.alive && G.enemies.boss.awake) {
      const b = G.enemies.boss;
      if (Math.hypot(b.pos.x - this.pos.x, b.pos.z - this.pos.z) < 24) best = b;
    }
    return best;
  }

  update(dt) {
    if (this.mode !== 'follow') return super.update(dt);
    const G = this.G,
      P = G.player;
    this.t += dt;
    if (this.barkT > 0) this.barkT -= dt;
    if (this.talking > 0) this.talking -= dt;
    // posição desejada: atrás e ao lado do jogador
    const back = 2.4,
      side = 1.6 * this.side;
    const py = P.yaw;
    const gx = P.pos.x - Math.sin(py) * back + -Math.cos(py) * -side,
      gz = P.pos.z - Math.cos(py) * back + Math.sin(py) * -side;
    let dx = gx - this.pos.x,
      dz = gz - this.pos.z;
    let d = Math.hypot(dx, dz);
    const dp = Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
    // longe demais: reaparece atrás do jogador
    if (dp > 28 || this.stuck > 3) {
      this.respawnNear();
      return;
    }
    let vx = 0,
      vz = 0;
    if (d > 0.9) {
      const sp = d > 6 ? 4.6 : d > 2.5 ? 3.2 : 1.8;
      if (!G.nav.lineClear(this.pos.x, this.pos.z, gx, gz) && G.nav.direction(this.pos.x, this.pos.z, _dir)) {
        dx = _dir.x;
        dz = _dir.z;
        d = 1;
      }
      vx = (dx / d) * sp;
      vz = (dz / d) * sp;
    }
    const ox = this.pos.x,
      oz = this.pos.z;
    this.pos.x += vx * dt;
    this.pos.z += vz * dt;
    _p.x = this.pos.x;
    _p.z = this.pos.z;
    G.col.resolve(_p, this.radius, 0.1, 1.7);
    this.pos.x = _p.x;
    this.pos.z = _p.z;
    const moved = Math.hypot(this.pos.x - ox, this.pos.z - oz);
    if (Math.hypot(vx, vz) > 0.5 && moved < Math.hypot(vx, vz) * dt * 0.2) this.stuck += dt;
    else this.stuck = Math.max(0, this.stuck - dt);
    // alvo e tiros
    this.retarget -= dt;
    if (this.retarget <= 0 || (this.target && !this.target.alive)) {
      this.retarget = 0.4;
      this.target = this.pickTarget();
      if (this.target && this.target.kind === 'screamer') this.bark('screamer');
      else if (this.target && this.target.kind === 'bloater') this.bark('bloater');
    }
    const tg = this.target;
    const R = this.rig;
    R.resetPose();
    const sp = Math.hypot(vx, vz);
    if (tg && tg.alive) {
      const ty = Math.atan2(tg.pos.x - this.pos.x, tg.pos.z - this.pos.z);
      this.yaw = dampAngle(this.yaw, ty, 10, dt);
      const dist = Math.hypot(tg.pos.x - this.pos.x, tg.pos.z - this.pos.z);
      const pitch = Math.atan2(tg.pos.y + tg.height * 0.6 - 1.45, dist);
      this.aimPose(pitch * 0.85);
      if (this.reloadT > 0) {
        this.reloadT -= dt;
        if (this.reloadT <= 0) this.mag = 15;
      } else {
        this.fireCd -= dt;
        if (this.fireCd <= 0 && Math.abs(angleDiff(this.yaw, ty)) < 0.25) this.shoot(tg, dist);
      }
      // inimigo atrás do jogador
      const ex = tg.pos.x - P.pos.x,
        ez = tg.pos.z - P.pos.z;
      if (Math.hypot(ex, ez) < 4 && (ex * Math.sin(P.camYaw) + ez * Math.cos(P.camYaw)) < -1) this.bark('behind');
    } else {
      if (sp > 0.3) this.yaw = dampAngle(this.yaw, Math.atan2(vx, vz), 8, dt);
      else this.yaw = dampAngle(this.yaw, P.yaw, 2, dt);
      R.set('rSh', -0.3);
      R.set('rEl', -0.6);
      R.set('spine', Math.sin(this.t * 1.7) * 0.02, 0, 0);
      if (this.reloadT > 0) {
        this.reloadT -= dt;
        if (this.reloadT <= 0) this.mag = 15;
      } else if (this.mag < 8) {
        this.reloadT = 1.4;
      }
    }
    if (sp > 0.3) {
      this.phase += dt * sp * 4.4;
      R.gait(this.phase, Math.min(1, sp / 1.6), sp > 3.5 ? 0.7 : 0);
    }
    if (P.hp < 30 && !P.dead) this.bark('hurt');
    R.apply(dt, 12);
    this.sync();
  }

  respawnNear() {
    const G = this.G,
      P = G.player;
    this.stuck = 0;
    for (const a of [Math.PI, Math.PI * 0.75, -Math.PI * 0.75, Math.PI / 2, -Math.PI / 2]) {
      const yaw = P.camYaw + a;
      const x = P.pos.x + Math.sin(yaw) * 3,
        z = P.pos.z + Math.cos(yaw) * 3;
      if (!G.nav.isBlocked(x, z) && G.nav.lineClear(P.pos.x, P.pos.z, x, z)) {
        this.teleport(x, z, P.yaw);
        this.sync();
        return;
      }
    }
    this.teleport(P.pos.x, P.pos.z - 1, P.yaw);
  }

  shoot(e, dist) {
    const G = this.G,
      P = G.player;
    this.rig.mountR.getWorldPosition(_v);
    const head = Math.random() < 0.3 && e.kind !== 'crawler' && e.kind !== 'dog';
    let tx, ty, tz;
    if (e.isBoss && e.rig.core) {
      e.rig.core.getWorldPosition(_v);
      tx = _v.x;
      ty = _v.y;
      tz = _v.z;
      this.rig.mountR.getWorldPosition(_v);
    } else {
      tx = e.pos.x;
      ty = e.pos.y + e.height * (head ? 0.9 : 0.6);
      tz = e.pos.z;
    }
    const spread = 0.02 + dist * 0.004;
    let dx = tx - _v.x + rand(-1, 1) * spread * dist,
      dy = ty - _v.y + rand(-1, 1) * spread * dist,
      dz = tz - _v.z + rand(-1, 1) * spread * dist;
    const L = Math.hypot(dx, dy, dz) || 1;
    dx /= L;
    dy /= L;
    dz /= L;
    // nunca atira se o jogador estiver na linha de tiro
    const px = P.pos.x - _v.x,
      pz = P.pos.z - _v.z;
    const along = px * dx + pz * dz;
    if (along > 0 && along < L) {
      const cx = _v.x + dx * along - P.pos.x,
        cz = _v.z + dz * along - P.pos.z;
      if (Math.hypot(cx, cz) < 0.8) {
        this.fireCd = 0.3;
        this.side = -this.side;
        return;
      }
    }
    _o.x = _v.x;
    _o.y = _v.y;
    _o.z = _v.z;
    _d.x = dx;
    _d.y = dy;
    _d.z = dz;
    const hit = raycastAll(G, _o, _d, 40);
    G.audio.shot('pistol', this.pos, 0.55);
    G.fx.sparks(_v, { x: dx, y: dy, z: dz }, 3, [1, 0.8, 0.45]);
    if (hit) {
      if (hit.kind === 'enemy') {
        const en = hit.enemy;
        const wasAlive = en.alive;
        en.onHit({ dmg: 24, part: hit.part, weapon: 'pistol', dir: { x: dx, y: 0, z: dz }, push: 0.5 });
        G.fx.blood({ x: hit.x, y: hit.y, z: hit.z }, _d, 6);
        if (wasAlive && !en.alive) this.bark('kill');
      } else if (hit.kind === 'object' && hit.owner && hit.owner.kind === 'crate') {
        /* não quebra caixas de propósito */
      } else G.fx.impact(hit, _d);
    }
    this.mag--;
    this.fireCd = rand(0.42, 0.75);
    if (this.mag <= 0) {
      this.reloadT = 1.6;
      this.bark('reload');
    }
  }
}

// ======================================================================= GERENCIADOR
export class NPCManager {
  constructor(G) {
    this.G = G;
    this.list = [];
  }

  spawn(o) {
    const n = o.companion ? new Companion(this.G, o) : new NPC(this.G, o);
    this.list.push(n);
    return n;
  }

  get(id) {
    return this.list.find((n) => n.id === id) || null;
  }

  get companion() {
    return this.list.find((n) => n instanceof Companion && n.mode === 'follow') || null;
  }

  remove(id) {
    const n = this.get(id);
    if (!n) return;
    n.remove();
    this.list.splice(this.list.indexOf(n), 1);
  }

  clear() {
    for (const n of this.list) n.remove();
    this.list = [];
  }

  update(dt) {
    const P = this.G.player;
    for (const n of this.list) {
      n.update(dt);
      if (!n.solid || P.dead || n.pos.y > 0.5) continue;
      const dx = P.pos.x - n.pos.x,
        dz = P.pos.z - n.pos.z;
      const rr = n.radius + P.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2),
          push = (rr - d) / d;
        P.pos.x += dx * push * 0.5;
        P.pos.z += dz * push * 0.5;
        n.pos.x -= dx * push * 0.5;
        n.pos.z -= dz * push * 0.5;
        P.resolveWorld();
      }
    }
  }
}

export const LOOKS = {
  tiao: { scale: 1.04, build: 'heavy', skin: 0x9a7a62, shirt: 0x3a4a5a, pants: 0x2e2a26, hair: 0x5a5048, hairStyle: 'short', beard: 0x6a6058, hat: 'cap', hatColor: 0x2a3a4a, longSleeves: true },
  clara: { scale: 0.97, build: 'thin', skin: 0xb88a6e, shirt: 0x2e3a2e, shirtKind: 'leather', pants: 0x26282e, hair: 0x1a1210, hairStyle: 'bun', longSleeves: true },
  cida: { scale: 0.9, build: 'normal', skin: 0x8a6a52, shirt: 0x6a4a5a, pants: 0x3a3030, dress: 0x5a3a46, hair: 0x9a9690, hairStyle: 'bun', longSleeves: true },
  rafa: { scale: 0.95, build: 'thin', skin: 0xc49a7e, shirt: 0x7a2a22, pants: 0x2a3448, hair: 0x2a1a12, hairStyle: 'short', hat: 'hood', hatColor: 0x3a3a40, longSleeves: true },
  zeca: { scale: 1.0, build: 'normal', skin: 0x7a5a44, shirt: 0x24282e, pants: 0x24282e, hair: 0x14100e, hairStyle: 'bald', beard: 0x14100e, longSleeves: true },
  jorge: { scale: 1.0, build: 'normal', skin: 0xb09080, shirt: 0x8a8070, pants: 0x3a3630, hair: 0x3a2a1e, hairStyle: 'short', sleeves: 'short' },
  helena: { scale: 0.95, build: 'thin', skin: 0xc49a82, shirt: 0x6a2a2a, shirtKind: 'leather', pants: 0x2a2e3a, hair: 0x3a2418, hairStyle: 'long', longSleeves: true },
  bia: { scale: 0.62, build: 'thin', skin: 0xc8a088, shirt: 0xc8b048, pants: 0x3a4a6a, dress: 0xa83a4a, hair: 0x4a2a18, hairStyle: 'bun', sleeves: 'short' },
};

export { charMat, BOX };
