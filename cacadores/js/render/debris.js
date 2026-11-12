// Detritos voando: tábuas, chapas, telhas, tijolos, galhos, folhas e isolamento.
// Cada peça sofre arrasto do vento do tornado, gravidade, gira e cai no chão.

import * as THREE from 'three';
import { patchWorld } from './materials.js';

const TYPES = {
  plank: { geo: () => new THREE.BoxGeometry(2.4, 0.04, 0.2), color: '#a07850', drag: 0.9, mass: 1, n: 0.3 },
  sheet: { geo: () => new THREE.BoxGeometry(1.8, 0.02, 0.9), color: '#b0b4b8', drag: 1.6, mass: 1, n: 0.15, metal: true },
  shingle: { geo: () => new THREE.BoxGeometry(0.45, 0.01, 0.3), color: '#3a3836', drag: 2.2, mass: 0.6, n: 0.2 },
  chunk: { geo: () => new THREE.DodecahedronGeometry(0.22, 0), color: '#8a6a52', drag: 0.25, mass: 1.6, n: 0.1 },
  branch: { geo: () => new THREE.CylinderGeometry(0.05, 0.08, 1.8, 5), color: '#4a3a2a', drag: 0.8, mass: 0.9, n: 0.1 },
  leaf: { geo: () => new THREE.PlaneGeometry(0.25, 0.18), color: '#4a6a2a', drag: 4, mass: 0.2, n: 0.1, double: true },
  insul: { geo: () => new THREE.BoxGeometry(0.6, 0.08, 0.4), color: '#e8a0a8', drag: 2.6, mass: 0.4, n: 0.05 },
};

export const DEBRIS_TYPES = Object.keys(TYPES);

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _w = { x: 0, y: 0, z: 0 };

export class DebrisSystem {
  constructor(max) {
    this.max = max;
    this.group = new THREE.Group();
    this.group.name = 'debris';
    this.meshes = {};
    this.pieces = [];
    for (const [name, t] of Object.entries(TYPES)) {
      const cap = Math.max(16, Math.round(max * t.n));
      const mat = patchWorld(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: t.metal ? 0.4 : 0.85, metalness: t.metal ? 0.6 : 0, side: t.double ? THREE.DoubleSide : THREE.FrontSide }), { key: 'deb' + name });
      const mesh = new THREE.InstancedMesh(t.geo(), mat, cap);
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const c = new THREE.Color(t.color);
      for (let i = 0; i < cap; i++) mesh.setColorAt(i, c);
      this.meshes[name] = { mesh, cap, list: [], def: t, base: new THREE.Color(t.color) };
      this.group.add(mesh);
    }
  }

  spawn(type, x, y, z, vx = 0, vy = 0, vz = 0, tint = null) {
    const m = this.meshes[type];
    if (!m) return;
    if (m.list.length >= m.cap) {
      // Recicla a peça mais antiga.
      const old = m.list.shift();
      old.dead = true;
    }
    const p = {
      type,
      x,
      y,
      z,
      vx,
      vy,
      vz,
      rx: Math.random() * 6,
      ry: Math.random() * 6,
      rz: Math.random() * 6,
      wx: (Math.random() - 0.5) * 8,
      wy: (Math.random() - 0.5) * 8,
      wz: (Math.random() - 0.5) * 8,
      age: 0,
      rest: 0,
      drag: m.def.drag * (0.6 + Math.random() * 0.8),
      mass: m.def.mass,
      dead: false,
      tint,
    };
    m.list.push(p);
  }

  count() {
    let n = 0;
    for (const m of Object.values(this.meshes)) n += m.list.length;
    return n;
  }

  update(dt, weather, world) {
    const tors = weather.tornadoes;
    const step = Math.min(dt, 0.05);
    for (const m of Object.values(this.meshes)) {
      let i = 0;
      const list = m.list;
      for (let k = 0; k < list.length; k++) {
        const p = list[k];
        if (p.dead) continue;
        p.age += dt;
        // Vento dos tornados próximos.
        let wx = 0;
        let wy = 0;
        let wz = 0;
        for (const t of tors) {
          if (Math.abs(p.x - t.x) > 3000 || Math.abs(p.z - t.z) > 3000) continue;
          t.windAt(p.x, p.y, p.z, _w);
          wx += _w.x;
          wy += _w.y;
          wz += _w.z;
        }
        const g = world.groundAt(p.x, p.z);
        if (p.rest > 0 && Math.hypot(wx, wz) < 30) {
          p.rest += dt;
        } else {
          const k2 = p.drag / p.mass;
          const rvx = wx - p.vx;
          const rvy = wy - p.vy;
          const rvz = wz - p.vz;
          const rel = Math.hypot(rvx, rvy, rvz);
          const a = Math.min(k2 * 0.012 * rel, 4);
          p.vx += rvx * a * step * 1.0;
          p.vy += rvy * a * step * 1.0 - 9.81 * step;
          p.vz += rvz * a * step * 1.0;
          // Placas planas "planam" (sustentação).
          if (m.def.drag > 1.5) p.vy += Math.min(rel * 0.02, 3) * step;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.z += p.vz * dt;
          const spin = 1 + rel * 0.08;
          p.rx += p.wx * dt * spin;
          p.ry += p.wy * dt * spin;
          p.rz += p.wz * dt * spin;
          if (p.y < g + 0.05) {
            p.y = g + 0.05;
            if (Math.abs(p.vy) < 3 && Math.hypot(p.vx, p.vz) < 4) {
              p.rest = 0.01;
              p.vx = p.vy = p.vz = 0;
              p.rx = Math.PI / 2 * Math.round(p.rx / (Math.PI / 2));
              p.rz = 0;
            } else {
              p.vy = Math.abs(p.vy) * 0.25;
              p.vx *= 0.5;
              p.vz *= 0.5;
            }
          }
        }
        if (p.rest > 120 || p.age > 240 || p.y > 3000) {
          p.dead = true;
          continue;
        }
        _e.set(p.rx, p.ry, p.rz);
        _q.setFromEuler(_e);
        _m.compose(_p.set(p.x, p.y, p.z), _q, _s);
        m.mesh.setMatrixAt(i, _m);
        if (p.tint) m.mesh.setColorAt(i, p.tint);
        else m.mesh.setColorAt(i, m.base);
        i++;
      }
      m.list = list.filter((p) => !p.dead);
      m.mesh.count = i;
      m.mesh.instanceMatrix.needsUpdate = true;
      if (m.mesh.instanceColor) m.mesh.instanceColor.needsUpdate = true;
    }
  }

  // Peças perto de um ponto (para colisão com o carro).
  near(x, y, z, r, out = []) {
    out.length = 0;
    for (const m of Object.values(this.meshes))
      for (const p of m.list) {
        if (p.rest > 0) continue;
        const dx = p.x - x;
        const dy = p.y - y;
        const dz = p.z - z;
        if (dx * dx + dy * dy + dz * dz < r * r) out.push(p);
      }
    return out;
  }

  clear() {
    for (const m of Object.values(this.meshes)) {
      m.list = [];
      m.mesh.count = 0;
    }
  }
}
