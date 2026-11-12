// Projéteis: granadas do jogador, pedras arremessadas pelos aldeões, ferro derretido do
// Ferreiro e as poças de fogo que ele deixa.
import * as THREE from 'three';
import { raySphere, explode } from './combat.js';
import { rand } from './util.js';

const GRAV = 9.8;

export class Projectiles {
  constructor(G) {
    this.G = G;
    this.list = [];
    this.fires = [];
    this.geoGrenade = new THREE.DodecahedronGeometry(0.06);
    this.geoRock = new THREE.DodecahedronGeometry(0.11);
    this.geoMolten = new THREE.IcosahedronGeometry(0.24, 1);
    this.matGrenade = new THREE.MeshStandardMaterial({ color: 0x3e4a2c, roughness: 0.6, metalness: 0.3 });
    this.matRock = new THREE.MeshStandardMaterial({ color: 0x77736a, roughness: 1, flatShading: true });
    this.matMolten = new THREE.MeshBasicMaterial({ color: 0xff7a1a, toneMapped: false });
    this._p = { x: 0, z: 0 };
  }

  _mesh(geo, mat) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    this.G.scene.add(m);
    return m;
  }

  spawnGrenade(pos, vel) {
    this.list.push({ kind: 'grenade', mesh: this._mesh(this.geoGrenade, this.matGrenade), pos: pos.clone(), vel: vel.clone(), t: 0, fuse: 1.6, r: 0.07, bounces: 0 });
  }

  spawnRock(pos, vel, dmg) {
    this.list.push({ kind: 'rock', mesh: this._mesh(this.geoRock, this.matRock), pos: pos.clone(), vel: vel.clone(), t: 0, r: 0.16, dmg });
  }

  spawnMolten(pos, vel, dmg) {
    const p = { kind: 'molten', mesh: this._mesh(this.geoMolten, this.matMolten), pos: pos.clone(), vel: vel.clone(), t: 0, r: 0.32, dmg };
    p.mesh.castShadow = false;
    p.light = this.G.fx.lights.add({ x: pos.x, y: pos.y, z: pos.z, color: 0xff6a1a, intensity: 30, range: 8, flicker: 0.2, priority: 40, instant: true, temp: true });
    this.list.push(p);
  }

  remove(p) {
    this.G.scene.remove(p.mesh);
    if (p.light) this.G.fx.lights.remove(p.light);
    p.dead = true;
  }

  // Um tiro acertou o projétil.
  shot(p) {
    if (p.dead) return;
    if (p.kind === 'rock') {
      this.G.fx.dust(p.pos, { x: 0, y: 1, z: 0 }, 6);
      this.G.audio.hit('stone', p.pos);
      this.remove(p);
    } else if (p.kind === 'molten') {
      this.burst(p, false);
    }
  }

  burst(p, makeFire = true) {
    const G = this.G;
    G.fx.explosion({ x: p.pos.x, y: Math.max(0, p.pos.y - 0.3), z: p.pos.z }, 2.6);
    G.audio.explosion(p.pos);
    const P = G.player;
    const d = Math.hypot(P.pos.x - p.pos.x, P.pos.z - p.pos.z);
    if (d < 2.6 && Math.abs(P.pos.y + 1 - p.pos.y) < 2.5) P.takeDamage(p.dmg * (1 - d / 3.2), p.pos, {});
    if (makeFire) this.addFire(p.pos.x, p.pos.z);
    this.remove(p);
  }

  addFire(x, z) {
    const light = this.G.fx.lights.add({ x, y: 0.6, z, color: 0xff7a2a, intensity: 18, range: 7, flicker: 0.35, priority: 20, temp: true });
    this.fires.push({ x, z, r: 1.7, t: 4.5, light, acc: 0 });
  }

  update(dt) {
    const G = this.G,
      P = G.player;
    for (const p of this.list) {
      if (p.dead) continue;
      p.t += dt;
      const steps = 3,
        h = dt / steps;
      for (let s = 0; s < steps && !p.dead; s++) {
        p.vel.y -= GRAV * h;
        p.pos.addScaledVector(p.vel, h);
        const gy = G.col.groundY(p.pos.x, p.pos.z);
        // cenário (paredes)
        if (p.pos.y < 6) {
          const q = this._p;
          q.x = p.pos.x;
          q.z = p.pos.z;
          if (G.col.resolve(q, p.r, p.pos.y - p.r, p.pos.y + p.r)) {
            const nx = q.x - p.pos.x,
              nz = q.z - p.pos.z;
            const nl = Math.hypot(nx, nz) || 1;
            if (p.kind === 'grenade') {
              const ux = nx / nl,
                uz = nz / nl;
              const vn = p.vel.x * ux + p.vel.z * uz;
              if (vn < 0) {
                p.vel.x -= 1.6 * vn * ux;
                p.vel.z -= 1.6 * vn * uz;
                p.vel.multiplyScalar(0.7);
                if (G.audio) G.audio.hit('metal', p.pos);
              }
              p.pos.x = q.x;
              p.pos.z = q.z;
            } else if (p.kind === 'rock') {
              G.fx.dust(p.pos, { x: nx / nl, y: 0, z: nz / nl }, 5);
              G.audio.hit('stone', p.pos);
              this.remove(p);
              break;
            } else {
              this.burst(p, true);
              break;
            }
          }
        }
        if (p.pos.y < gy + p.r) {
          if (p.kind === 'grenade') {
            p.pos.y = gy + p.r;
            if (gy < 0) {
              // caiu na água: apaga
              G.fx.splash(p.pos);
              this.remove(p);
              break;
            }
            if (Math.abs(p.vel.y) > 1.2 && G.audio) G.audio.hit('metal', p.pos);
            p.vel.y = -p.vel.y * 0.35;
            p.vel.x *= 0.62;
            p.vel.z *= 0.62;
          } else if (p.kind === 'rock') {
            G.fx.dust(p.pos, { x: 0, y: 1, z: 0 }, 4);
            this.remove(p);
            break;
          } else {
            p.pos.y = Math.max(p.pos.y, gy + 0.1);
            if (gy < 0) {
              G.fx.splash(p.pos);
              this.remove(p);
            } else this.burst(p, true);
            break;
          }
        }
        // acerto no jogador
        if (!p.dead && p.kind !== 'grenade' && !P.dead) {
          const dx = P.pos.x - p.pos.x,
            dy = P.pos.y + 1.15 - p.pos.y,
            dz = P.pos.z - p.pos.z;
          if (dx * dx + dz * dz < (0.42 + p.r) ** 2 && Math.abs(dy) < 0.95) {
            if (p.kind === 'rock') {
              P.takeDamage(p.dmg, p.pos, {});
              G.fx.dust(p.pos, { x: 0, y: 1, z: 0 }, 4);
              this.remove(p);
            } else {
              this.burst(p, true);
            }
          }
        }
      }
      if (p.dead) continue;
      p.mesh.position.copy(p.pos);
      p.mesh.rotation.x += dt * 9;
      p.mesh.rotation.z += dt * 7;
      if (p.light) {
        p.light.x = p.pos.x;
        p.light.y = p.pos.y;
        p.light.z = p.pos.z;
      }
      if (p.kind === 'molten') G.fx.embers(p.pos, 1, 0.1, 0.5);
      if (p.kind === 'grenade') {
        p.fuse -= dt;
        if (p.fuse <= 0) {
          this.remove(p);
          explode(G, p.pos.x, Math.max(0, p.pos.y), p.pos.z, 5.5, 170, 50);
        }
      }
      if (p.t > 8 && !p.dead) this.remove(p);
    }
    this.list = this.list.filter((p) => !p.dead);
    for (const f of this.fires) {
      f.t -= dt;
      f.acc += dt * 30;
      const n = Math.floor(f.acc);
      if (n) {
        f.acc -= n;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2,
            r = Math.sqrt(Math.random()) * f.r;
          G.fx.fire({ x: f.x + Math.cos(a) * r, y: 0.05, z: f.z + Math.sin(a) * r }, 1, rand(0.6, 1.1) * Math.min(1, f.t));
        }
      }
      if (!P.dead && Math.hypot(P.pos.x - f.x, P.pos.z - f.z) < f.r + 0.2) P.burn(14 * dt);
      if (f.t <= 0) G.fx.lights.remove(f.light);
    }
    this.fires = this.fires.filter((f) => f.t > 0);
  }

  raycast(o, d, maxT) {
    let best = null,
      bt = maxT;
    for (const p of this.list) {
      if (p.dead || p.kind === 'grenade') continue;
      const t = raySphere(o, d, p.pos, p.r + 0.06);
      if (t >= 0 && t < bt) {
        bt = t;
        best = { proj: p, t };
      }
    }
    return best;
  }

  clear() {
    for (const p of this.list) if (!p.dead) this.remove(p);
    this.list = [];
    for (const f of this.fires) this.G.fx.lights.remove(f.light);
    this.fires = [];
  }
}
