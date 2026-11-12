// Base dos inimigos: movimento com colisão, caminho pelo campo de fluxo, teste de acerto
// pelas cápsulas do esqueleto e controle das "vagas" de ataque (no máximo N atacam juntos).
import * as THREE from 'three';
import { rand, TAU } from './util.js';
import { raySphere, rayCapsule } from './combat.js';

let NEXT_ID = 1;
const ZERO = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _p = { x: 0, z: 0 };

export const ATTACK_STATES = new Set(['windup', 'strike', 'recover', 'throwWind', 'throw', 'crouch', 'leap']);

export class Enemy {
  constructor(G, x, z, o = {}) {
    this.G = G;
    this.id = NEXT_ID++;
    this.pos = new THREE.Vector3(x, 0, z);
    this.vel = new THREE.Vector3();
    this.knock = new THREE.Vector3();
    this.yaw = o.yaw ?? rand(0, TAU);
    this.state = 'idle';
    this.st = 0;
    this.alive = true;
    this.removed = false;
    this.hittable = true;
    this.radius = 0.36;
    this.height = 1.8;
    this.boundR = 2;
    this.alert = false;
    this.alertDelay = -1;
    this.slot = false;
    this.flank = rand(-1, 1);
    this.phase = rand(0, TAU);
    this.sink = 0;
    this.isBoss = false;
    this.mass = 1;
  }

  get mgr() {
    return this.G.enemies;
  }

  get kickable() {
    return false;
  }

  setState(s) {
    if (this.slot && !ATTACK_STATES.has(s)) this.releaseSlot();
    this.state = s;
    this.st = 0;
  }

  takeSlot() {
    if (!this.slot) {
      this.slot = true;
      this.mgr.slots++;
    }
  }

  releaseSlot() {
    if (this.slot) {
      this.slot = false;
      this.mgr.slots = Math.max(0, this.mgr.slots - 1);
    }
  }

  toPlayer(out) {
    const P = this.G.player;
    out.dx = P.pos.x - this.pos.x;
    out.dz = P.pos.z - this.pos.z;
    out.d = Math.hypot(out.dx, out.dz);
    out.yaw = Math.atan2(out.dx, out.dz);
    return out;
  }

  // Move com a velocidade desejada + empurrão (knock), resolvendo colisão com o cenário.
  integrate(dt, vx, vz) {
    this.vel.x = vx;
    this.vel.z = vz;
    this.pos.x += (vx + this.knock.x) * dt;
    this.pos.z += (vz + this.knock.z) * dt;
    const k = Math.exp(-5 * dt);
    this.knock.x *= k;
    this.knock.z *= k;
    _p.x = this.pos.x;
    _p.z = this.pos.z;
    const hit = this.G.col.resolve(_p, this.radius, 0.1, Math.max(0.6, this.height));
    this.pos.x = _p.x;
    this.pos.z = _p.z;
    return hit;
  }

  // Direção até o jogador: reta se dá para ver, senão segue o campo de fluxo.
  pathDir(out) {
    const G = this.G,
      P = G.player;
    const dx = P.pos.x - this.pos.x,
      dz = P.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    let ok = false;
    if (d < 2.5 || G.nav.lineClear(this.pos.x, this.pos.z, P.pos.x, P.pos.z)) {
      out.x = dx / d;
      out.z = dz / d;
      ok = true;
    } else ok = G.nav.direction(this.pos.x, this.pos.z, out);
    if (!ok) {
      out.x = dx / d;
      out.z = dz / d;
    }
    return d;
  }

  syncRig() {
    const r = this.rig.root;
    r.position.set(this.pos.x, this.pos.y - this.sink, this.pos.z);
    r.rotation.y = this.yaw;
    r.updateMatrixWorld(true);
  }

  hitTest(o, d, maxT) {
    if (!this.hittable) return null;
    const cy = this.pos.y + this.height * 0.5;
    const cx = this.pos.x - o.x,
      cyy = cy - o.y,
      cz = this.pos.z - o.z;
    const tc = cx * d.x + cyy * d.y + cz * d.z;
    const R = this.boundR;
    if (tc < -R || tc - R > maxT) return null;
    const dd = cx * cx + cyy * cyy + cz * cz - tc * tc;
    if (dd > R * R) return null;
    let best = null,
      bt = maxT,
      prio = null,
      pt = Infinity;
    const s = this.rig.s;
    for (const h of this.rig.hitDefs) {
      _a.copy(h.ao || ZERO).applyMatrix4(h.a.matrixWorld);
      let t;
      if (h.b) {
        _b.copy(h.bo || ZERO).applyMatrix4(h.b.matrixWorld);
        t = rayCapsule(o, d, _a, _b, h.r * s);
      } else t = raySphere(o, d, _a, h.r * s);
      if (t < 0) continue;
      if (h.priority && t < pt) {
        pt = t;
        prio = h;
      }
      if (t < bt) {
        bt = t;
        best = h.part;
      }
    }
    // partes prioritárias (núcleo do chefe) vencem se estiverem logo atrás do primeiro acerto
    if (prio && pt <= bt + prio.priority * s && pt < maxT) return { part: prio.part, t: Math.min(pt, bt) };
    return best ? { part: best, t: bt } : null;
  }

  worldOf(jointName, x, y, z, out) {
    return out.set(x, y, z).applyMatrix4(this.rig.j[jointName].matrixWorld);
  }

  remove() {
    if (this.removed) return;
    this.removed = true;
    this.releaseSlot();
    this.G.scene.remove(this.rig.root);
    this.rig.dispose();
  }
}
