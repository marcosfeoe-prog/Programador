// Projéteis: granadas e molotovs do jogador, pedras dos aldeões, bile dos Cuspidores, ferro
// derretido dos chefes e as áreas que ficam no chão (fogo e ácido).
import * as THREE from 'three';
import { raySphere, explode } from './combat.js';
import { rand } from './util.js';
import { makeMolotov } from './models.js';
import { tex } from './textures.js';

const GRAV = 9.8;

export class Projectiles {
  constructor(G) {
    this.G = G;
    this.list = [];
    this.fires = [];
    this.geoGrenade = new THREE.DodecahedronGeometry(0.06);
    this.geoRock = new THREE.DodecahedronGeometry(0.11);
    this.geoMolten = new THREE.IcosahedronGeometry(0.24, 1);
    this.geoBile = new THREE.IcosahedronGeometry(0.16, 1);
    this.matGrenade = new THREE.MeshStandardMaterial({ color: 0x3e4a2c, roughness: 0.6, metalness: 0.3 });
    this.matRock = new THREE.MeshStandardMaterial({ color: 0x77736a, roughness: 1, flatShading: true });
    this.matMolten = new THREE.MeshBasicMaterial({ color: 0xff7a1a, toneMapped: false });
    this.matBile = new THREE.MeshBasicMaterial({ color: 0x9adf3a, toneMapped: false });
    this.flameMat = new THREE.SpriteMaterial({ map: tex('flame'), color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
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

  spawnMolotov(pos, vel) {
    const g = makeMolotov();
    const f = new THREE.Sprite(this.flameMat);
    f.position.set(0, 0.26, 0);
    f.scale.set(0.12, 0.2, 1);
    g.add(f);
    this.G.scene.add(g);
    const p = { kind: 'molotov', mesh: g, pos: pos.clone(), vel: vel.clone(), t: 0, r: 0.09 };
    p.light = this.G.fx.lights.add({ x: pos.x, y: pos.y, z: pos.z, color: 0xff8a3a, intensity: 8, range: 5, flicker: 0.3, priority: 30, instant: true, temp: true });
    this.list.push(p);
  }

  spawnRock(pos, vel, dmg) {
    this.list.push({ kind: 'rock', mesh: this._mesh(this.geoRock, this.matRock), pos: pos.clone(), vel: vel.clone(), t: 0, r: 0.16, dmg });
  }

  spawnBile(pos, vel, dmg) {
    const p = { kind: 'bile', mesh: this._mesh(this.geoBile, this.matBile), pos: pos.clone(), vel: vel.clone(), t: 0, r: 0.22, dmg };
    p.mesh.castShadow = false;
    p.light = this.G.fx.lights.add({ x: pos.x, y: pos.y, z: pos.z, color: 0x8adf2a, intensity: 10, range: 5, flicker: 0.15, priority: 30, instant: true, temp: true });
    this.list.push(p);
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
    } else if (p.kind === 'bile') {
      this.splatBile(p, false);
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

  // Molotov quebrando: vidro, labareda e uma área de fogo que queima infectados.
  shatter(p) {
    const G = this.G;
    const gy = G.col.groundY(p.pos.x, p.pos.z);
    this.remove(p);
    G.audio.glass(p.pos);
    if (gy < -0.1) {
      G.fx.splash(p.pos);
      return;
    }
    G.audio.ignite(p.pos);
    G.fx.sparks({ x: p.pos.x, y: gy + 0.2, z: p.pos.z }, { x: 0, y: 1, z: 0 }, 10, [1, 0.6, 0.2]);
    for (let i = 0; i < 14; i++) G.fx.fire({ x: p.pos.x + rand(-0.8, 0.8), y: gy + 0.05, z: p.pos.z + rand(-0.8, 0.8) }, 1, 1.2);
    this.addFire(p.pos.x, p.pos.z, { r: 2.5, t: 7, hurtsEnemies: true, playerDps: 9 });
    G.enemies.noise(p.pos.x, p.pos.z, 20);
  }

  splatBile(p, onPlayer) {
    const G = this.G;
    this.remove(p);
    G.audio.splat(p.pos);
    for (let i = 0; i < 16; i++) {
      G.fx.norm.spawn(p.pos.x, Math.max(0.1, p.pos.y), p.pos.z, rand(-2, 2), rand(0.5, 3), rand(-2, 2), rand(0.4, 0.8), 0.07, 0.03, 0.45, 0.75, 0.15, 0.9, 9.8, 0.5, true);
    }
    if (!onPlayer && p.pos.y > 2.5) return;
    this.addFire(p.pos.x, p.pos.z, { kind: 'acid', r: 1.5, t: 6, playerDps: 9 });
  }

  // Área no chão: fogo (molotov e ferro derretido) ou ácido (bile).
  addFire(x, z, o = {}) {
    const kind = o.kind || 'fire';
    const acid = kind === 'acid';
    const light = this.G.fx.lights.add({ x, y: 0.6, z, color: acid ? 0x7acf2a : 0xff7a2a, intensity: acid ? 8 : 18, range: 7, flicker: acid ? 0.1 : 0.35, priority: 20, temp: true });
    this.fires.push({ kind, x, z, r: o.r || 1.7, t: o.t || 4.5, t0: o.t || 4.5, light, acc: 0, hurtsEnemies: !!o.hurtsEnemies, playerDps: o.playerDps ?? 14 });
  }

  // Inimigo ou área em chamas (usado pelo Incendiário).
  fireAt(x, z, r = 1.2, t = 3.5, hurtsEnemies = false) {
    if (this.fires.length > 24) return;
    for (const f of this.fires) if (f.kind === 'fire' && Math.hypot(f.x - x, f.z - z) < r * 0.8) return;
    this.addFire(x, z, { r, t, hurtsEnemies, playerDps: 10 });
  }

  hitsEnemy(p) {
    for (const e of this.G.enemies.list) {
      if (!e.alive || !e.hittable) continue;
      const dx = e.pos.x - p.pos.x,
        dz = e.pos.z - p.pos.z;
      if (dx * dx + dz * dz > (e.radius + 0.25) ** 2) continue;
      if (p.pos.y < e.pos.y - 0.1 || p.pos.y > e.pos.y + e.height + 0.1) continue;
      return e;
    }
    return null;
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
        if (p.pos.y < 8) {
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
            } else if (p.kind === 'molotov') {
              p.pos.x = q.x;
              p.pos.z = q.z;
              this.shatter(p);
              break;
            } else if (p.kind === 'bile') {
              this.splatBile(p, false);
              break;
            } else {
              this.burst(p, true);
              break;
            }
          }
        }
        if (p.kind === 'molotov') {
          const e = this.hitsEnemy(p);
          if (e) {
            this.shatter(p);
            e.burnT = Math.max(e.burnT || 0, 4);
            break;
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
          } else if (p.kind === 'molotov') {
            p.pos.y = gy + 0.05;
            this.shatter(p);
            break;
          } else if (p.kind === 'bile') {
            p.pos.y = gy + 0.05;
            if (gy < 0) {
              G.fx.splash(p.pos);
              this.remove(p);
            } else this.splatBile(p, false);
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
        if (!p.dead && p.kind !== 'grenade' && p.kind !== 'molotov' && !P.dead) {
          const dx = P.pos.x - p.pos.x,
            dy = P.pos.y + 1.15 - p.pos.y,
            dz = P.pos.z - p.pos.z;
          if (dx * dx + dz * dz < (0.42 + p.r) ** 2 && Math.abs(dy) < 0.95) {
            if (p.kind === 'rock') {
              P.takeDamage(p.dmg, p.pos, {});
              G.fx.dust(p.pos, { x: 0, y: 1, z: 0 }, 4);
              this.remove(p);
            } else if (p.kind === 'bile') {
              P.takeDamage(p.dmg, p.pos, {});
              this.splatBile(p, true);
            } else {
              this.burst(p, true);
            }
          }
        }
      }
      if (p.dead) continue;
      p.mesh.position.copy(p.pos);
      if (p.kind === 'molotov') {
        p.mesh.rotation.x += dt * 8;
        p.mesh.rotation.z += dt * 3;
        if (Math.random() < 0.5) G.fx.embers(p.pos, 1, 0.05, 0.4);
      } else {
        p.mesh.rotation.x += dt * 9;
        p.mesh.rotation.z += dt * 7;
      }
      if (p.light) {
        p.light.x = p.pos.x;
        p.light.y = p.pos.y;
        p.light.z = p.pos.z;
      }
      if (p.kind === 'molten') G.fx.embers(p.pos, 1, 0.1, 0.5);
      if (p.kind === 'bile' && Math.random() < 0.6) G.fx.norm.spawn(p.pos.x, p.pos.y, p.pos.z, 0, -0.5, 0, 0.4, 0.06, 0.02, 0.45, 0.75, 0.15, 0.8, 4, 0);
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
      const life = Math.min(1, f.t / Math.min(1.5, f.t0));
      f.acc += dt * (f.kind === 'acid' ? 14 : 30) * Math.min(1.6, f.r / 1.7);
      const n = Math.floor(f.acc);
      if (n) {
        f.acc -= n;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2,
            r = Math.sqrt(Math.random()) * f.r;
          const x = f.x + Math.cos(a) * r,
            z = f.z + Math.sin(a) * r;
          if (f.kind === 'acid') {
            G.fx.add.spawn(x, 0.05, z, 0, rand(0.2, 0.6), 0, rand(0.5, 1), rand(0.12, 0.22), 0.02, 0.45, 0.85, 0.15, 0.55 * life, -0.2, 1);
          } else G.fx.fire({ x, y: 0.05, z }, 1, rand(0.6, 1.1) * life);
        }
      }
      if (f.light) f.light.intensity = (f.kind === 'acid' ? 8 : 18) * life;
      if (!P.dead && Math.hypot(P.pos.x - f.x, P.pos.z - f.z) < f.r + 0.2) {
        P.burn(f.playerDps * dt);
        if (f.kind === 'fire' && f.hurtsEnemies === false && Math.random() < dt * 0.5) P.ignite(1.5);
      }
      if (f.hurtsEnemies) {
        for (const e of G.enemies.list) {
          if (!e.alive) continue;
          if (Math.hypot(e.pos.x - f.x, e.pos.z - f.z) < f.r + e.radius) {
            e.burnT = Math.max(e.burnT || 0, 3);
            if (e.onBurn) e.onBurn(26 * dt);
          }
        }
      }
      if (f.t <= 0) G.fx.lights.remove(f.light);
    }
    this.fires = this.fires.filter((f) => f.t > 0);
  }

  raycast(o, d, maxT) {
    let best = null,
      bt = maxT;
    for (const p of this.list) {
      if (p.dead || p.kind === 'grenade' || p.kind === 'molotov') continue;
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
