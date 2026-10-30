// Trânsito: carros que seguem as estradas na faixa da direita, respeitam a
// distância de quem vai na frente (inclusive você), param se houver batida e
// acendem os faróis à noite.
import * as THREE from 'three';
import { TRAFFIC, TRAFFIC_COLORS } from './cars/specs.js';
import { CarModel } from './cars/model.js';
import { CITIES, COUNTRIES } from './world/data.js';
import { roadAt } from './travel.js';
import { RNG, clamp } from './util.js';

export class Traffic {
  constructor(scene, roads, gen, count) {
    this.scene = scene;
    this.roads = roads;
    this.gen = gen;
    this.count = count;
    this.cars = [];
    this.rng = new RNG(99);
    this.templates = [];
    this.mats = new Map();
    this.headMats = [];
    this.ready = false;
    this.tmp = {};
  }

  // os modelos são gerados aos poucos (não trava o carregamento)
  async init(yieldFn) {
    for (const spec of TRAFFIC) {
      const m = new CarModel({ ...spec, interior: { side: 1 }, phys: { wd: 0.55, cg: 0.5 } }, { lod: 1 });
      this.templates.push({ spec, model: m });
      if (yieldFn) await yieldFn();
    }
    this.ready = true;
  }

  paintMat(hex) {
    let m = this.mats.get(hex);
    if (!m) {
      m = new THREE.MeshPhysicalMaterial({ color: hex, metalness: 0.5, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.06 });
      this.mats.set(hex, m);
    }
    return m;
  }

  spawn(px, pz, near) {
    const rng = this.rng;
    // escolhe um ponto de estrada a 250–1100 m do jogador, nas estradas próximas
    const near2 = this.roads.filter((r) => r.bbox && px > r.bbox[0] - 1200 && px < r.bbox[2] + 1200 && pz > r.bbox[1] - 1200 && pz < r.bbox[3] + 1200);
    if (!near2.length) return null;
    for (let tries = 0; tries < 12; tries++) {
      const r = rng.pick(near2);
      let k0 = 0;
      let bd = 1e18;
      for (let k = 0; k < r.hs.length; k += 8) {
        const d = (r.pts[k * 2] - px) ** 2 + (r.pts[k * 2 + 1] - pz) ** 2;
        if (d < bd) {
          bd = d;
          k0 = k;
        }
      }
      const s = clamp(r.cum[k0] + (rng.chance(0.5) ? 1 : -1) * rng.float(near ? 160 : 300, 1000), 30, r.len - 30);
      const p = roadAt(r, s, this.tmp);
      const d = Math.hypot(p.x - px, p.z - pz);
      if (d < (near ? 140 : 280) || d > 1200) continue;
      const dir = rng.chance(0.5) ? 1 : -1;
      if (this.cars.some((c) => c.road === r && Math.abs(c.s - s) < 40)) continue;
      const T = rng.pick(this.templates);
      // kei cars são mais comuns no Japão
      const ci = this.gen.countryAt(p.x, p.z);
      const tpl = ci === 2 && rng.chance(0.4) ? this.templates.find((t) => t.spec.id === 'kei') || T : T;
      const root = tpl.model.root.clone(true);
      const color = rng.pick(TRAFFIC_COLORS);
      const pm = this.paintMat(color);
      const head = tpl.model.headMat.clone();
      const tail = tpl.model.tailMat.clone();
      root.traverse((o) => {
        if (!o.isMesh) return;
        if (o.material === tpl.model.paintMat) o.material = pm;
        else if (o.material === tpl.model.headMat) o.material = head;
        else if (o.material === tpl.model.tailMat) o.material = tail;
        o.castShadow = false;
      });
      // rodas: guarda os grupos de giro
      const wheels = [];
      root.traverse((o) => {
        if (o.isGroup && o.parent === root && o.children.length && o.children[0].isGroup) wheels.push(o);
      });
      this.scene.add(root);
      const speed = COUNTRIES[ci].speed / 3.6 * rng.float(0.8, 1.05);
      const car = { root, road: r, s, dir, v: speed * 0.8, vmax: speed, spec: tpl.spec, wheels, head, tail, wait: 0, spin: 0, L: tpl.spec.dims.L, W: tpl.spec.dims.W, pos: new THREE.Vector3(), yaw: 0, velVec: new THREE.Vector3(), brake: 0 };
      this.cars.push(car);
      this.place(car);
      return car;
    }
    return null;
  }

  place(c) {
    const p = roadAt(c.road, c.s, this.tmp);
    const tx = p.tx * c.dir;
    const tz = p.tz * c.dir;
    // faixa da direita: direita = (-tz, tx)
    const off = c.road.hw * 0.46;
    const x = p.x - tz * off;
    const z = p.z + tx * off;
    const y = p.y + 0.02;
    c.pos.set(x, y, z);
    c.yaw = Math.atan2(tx, tz);
    c.root.position.set(x, y, z);
    c.root.rotation.set(-Math.atan(p.slope * c.dir), c.yaw, 0, 'YXZ');
    c.velVec.set(tx * c.v, 0, tz * c.v);
  }

  despawn(c) {
    this.scene.remove(c.root);
    c.head.dispose();
    c.tail.dispose();
  }

  // phys: física do jogador (para manter distância)
  update(dt, player, night) {
    if (!this.ready) return;
    const px = player.pos.x;
    const pz = player.pos.z;
    // remove os distantes, cria novos
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      if (Math.hypot(c.pos.x - px, c.pos.z - pz) > 1500) {
        this.despawn(c);
        this.cars.splice(i, 1);
      }
    }
    if (this.cars.length < this.count && this.rng.chance(0.3)) this.spawn(px, pz, this.cars.length < this.count / 2);
    const pf = player.forward;
    for (const c of this.cars) {
      // distância livre à frente
      let gap = 1e9;
      for (const o of this.cars) {
        if (o === c || o.road !== c.road || o.dir !== c.dir) continue;
        const d = (o.s - c.s) * c.dir;
        if (d > 0 && d < gap) gap = d;
      }
      // o jogador na mesma faixa à frente
      const dx = px - c.pos.x;
      const dz = pz - c.pos.z;
      const fx = Math.sin(c.yaw);
      const fz = Math.cos(c.yaw);
      const ahead = dx * fx + dz * fz;
      const lat = -dx * fz + dz * fx;
      if (ahead > 0 && ahead < 60 && Math.abs(lat) < 2.6) gap = Math.min(gap, ahead);
      void pf;
      let vt = c.vmax;
      // devagar dentro das cidades
      for (const city of CITIES) if (Math.hypot(city.x - c.pos.x, city.z - c.pos.z) < city.r + 60) vt = Math.min(vt, 9);
      // curvas
      const p2 = roadAt(c.road, c.s + c.dir * 25, this.tmp);
      const ty = Math.atan2(p2.tx * c.dir, p2.tz * c.dir);
      let dy = ty - c.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      vt = Math.min(vt, Math.sqrt(3 / Math.max(Math.abs(dy) / 25, 1e-4)));
      if (gap < 1e8) vt = Math.min(vt, Math.max(0, (gap - 9) * 0.6));
      if (c.wait > 0) {
        c.wait -= dt;
        vt = 0;
      }
      const a = vt > c.v ? 2.2 : -6;
      c.brake = vt < c.v - 0.5 ? 1 : 0;
      c.v = clamp(c.v + a * dt, 0, Math.max(vt, 0));
      if (vt < c.v) c.v = Math.max(vt, c.v - 6 * dt);
      c.s += c.v * c.dir * dt;
      // fim da estrada: segue por outra estrada da cidade
      if (c.s < 0 || c.s > c.road.len) {
        const city = c.s < 0 ? c.road.a : c.road.b;
        const opts = this.roads.filter((r) => r !== c.road && (r.a === city || r.b === city));
        const nr = opts.length ? this.rng.pick(opts) : c.road;
        if (nr === c.road) {
          c.dir = -c.dir;
          c.s = clamp(c.s, 0, c.road.len);
        } else {
          c.road = nr;
          c.dir = nr.a === city ? 1 : -1;
          c.s = c.dir > 0 ? 0 : nr.len;
        }
      }
      this.place(c);
      c.spin += (c.v / 0.32) * dt;
      for (const w of c.wheels) if (w.children[0]) w.children[0].rotation.x = c.spin;
      c.head.emissiveIntensity = night > 0.4 ? 3 : 0.3;
      c.tail.emissiveIntensity = c.brake ? 3.2 : night > 0.4 ? 1 : 0.1;
    }
  }

  // caixas para colisão com o jogador
  near(x, z, r = 12) {
    return this.cars.filter((c) => Math.abs(c.pos.x - x) < r && Math.abs(c.pos.z - z) < r);
  }

  clear() {
    for (const c of this.cars) this.despawn(c);
    this.cars = [];
  }
}
