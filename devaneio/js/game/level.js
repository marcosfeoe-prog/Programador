// Classe base dos níveis: guarda objetos, colisores, sons e atualizações por quadro,
// e libera tudo da GPU ao sair do nível.
import * as THREE from 'three';

export class Level {
  constructor(ctx) {
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.colliders = [];
    this.updaters = [];
    this.triggers = [];
    this.grass = [];
    this.memoryDefs = [];
    this.spawn = { x: 0, z: 0, yaw: 0 };
    this.bounds = { x: 0, z: 0, r: 200 };
    this.env = {};
    this.keepTextures = true;
    this.speed = 1;
  }

  add(o) {
    this.group.add(o);
    return o;
  }

  mesh(geo, mat, { cast = true, receive = true, name } = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = receive;
    if (name) m.name = name;
    this.group.add(m);
    return m;
  }

  // colisores 2D (plano XZ)
  circle(x, z, r) {
    this.colliders.push({ t: 0, x, z, r });
  }
  rect(x, z, w, d, rot = 0) {
    this.colliders.push({ t: 1, x, z, hw: w / 2, hd: d / 2, c: Math.cos(rot), s: Math.sin(rot) });
  }

  onUpdate(fn) {
    this.updaters.push(fn);
  }

  // dispara uma vez quando o jogador entra no raio
  trigger(x, z, r, fn, once = true) {
    this.triggers.push({ x, z, r, fn, once, done: false });
  }

  heightAt() {
    return 0;
  }

  surfaceAt() {
    return 'grass';
  }

  collide(p, radius) {
    for (const c of this.colliders) {
      if (c.t === 0) {
        const dx = p.x - c.x, dz = p.z - c.z;
        const rr = c.r + radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-8) {
          const d = Math.sqrt(d2);
          p.x = c.x + (dx / d) * rr;
          p.z = c.z + (dz / d) * rr;
        }
      } else {
        const dx = p.x - c.x, dz = p.z - c.z;
        // para o espaço local do retângulo
        const lx = dx * c.c - dz * c.s;
        const lz = dx * c.s + dz * c.c;
        const qx = Math.max(-c.hw, Math.min(c.hw, lx));
        const qz = Math.max(-c.hd, Math.min(c.hd, lz));
        let ox = lx - qx, oz = lz - qz;
        const d2 = ox * ox + oz * oz;
        let nlx = lx, nlz = lz;
        if (d2 > 1e-10) {
          if (d2 < radius * radius) {
            const d = Math.sqrt(d2);
            nlx = qx + (ox / d) * radius;
            nlz = qz + (oz / d) * radius;
          } else continue;
        } else {
          // dentro: empurra pelo eixo de menor penetração
          const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz);
          if (px < pz) nlx = Math.sign(lx || 1) * (c.hw + radius);
          else nlz = Math.sign(lz || 1) * (c.hd + radius);
        }
        // volta para o mundo
        p.x = c.x + nlx * c.c + nlz * c.s;
        p.z = c.z - nlx * c.s + nlz * c.c;
      }
    }
  }

  update(dt, t, game) {
    const pp = game.player.pos;
    for (const tr of this.triggers) {
      if (tr.done) continue;
      const dx = pp.x - tr.x, dz = pp.z - tr.z;
      if (dx * dx + dz * dz < tr.r * tr.r) {
        tr.fn(game);
        if (tr.once) tr.done = true;
      }
    }
    for (const fn of this.updaters) fn(dt, t, game);
    for (const g of this.grass) g.update(game.camera);
  }

  dispose() {
    const mats = new Set();
    const geos = new Set();
    this.group.traverse((o) => {
      if (o.geometry) geos.add(o.geometry);
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m));
    });
    for (const g of this.grass) g.dispose();
    geos.forEach((g) => g.dispose());
    mats.forEach((m) => {
      if (!this.keepTextures) {
        for (const k in m) if (m[k] && m[k].isTexture) m[k].dispose();
      }
      m.dispose();
    });
    if (this.onDispose) this.onDispose();
  }
}
