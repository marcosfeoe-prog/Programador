// Rede de estradas: rodovias reais de cada região, a grade de estradas de terra/cascalho
// (EUA, Canadá, Argentina), estradas vicinais sinuosas (Brasil, Chile, Uruguai), ruas das
// cidades, pontes e a malha com faixas pintadas no shader.

import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { segDist, smoothstep } from '../core/math.js';
import { WORLD } from '../config.js';
import { patchWorld } from '../render/materials.js';

export const ROAD_TYPES = {
  interstate: { width: 15, surface: 'asphalt', lift: 0.16, speed: 1, lanes: 4 },
  highway: { width: 8.5, surface: 'asphalt', lift: 0.14, speed: 1, lanes: 2 },
  paved: { width: 7, surface: 'asphalt', lift: 0.12, speed: 0.95, lanes: 2 },
  street: { width: 9, surface: 'asphalt', lift: 0.11, speed: 0.9, lanes: 0 },
  gravel: { width: 7, surface: 'gravel', lift: 0.09, speed: 0.78, lanes: 0 },
  dirt: { width: 6, surface: 'dirt', lift: 0.08, speed: 0.7, lanes: 0 },
};

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

// Suaviza uma polilinha de controle e reamostra a cada `step` metros.
export function smoothPath(ctrl, step = 20) {
  if (ctrl.length < 2) return ctrl.slice();
  const out = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)];
    const p1 = ctrl[i];
    const p2 = ctrl[i + 1];
    const p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(1, Math.ceil(L / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push([catmull(p0[0], p1[0], p2[0], p3[0], t), catmull(p0[1], p1[1], p2[1], p3[1], t)]);
    }
  }
  out.push(ctrl[ctrl.length - 1].slice());
  return out;
}

function straight(a, b, step = 25) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.ceil(L / step));
  const out = [];
  for (let k = 0; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  return out;
}

export class RoadNetwork {
  constructor(country, terrain, seed) {
    this.country = country;
    this.terrain = terrain;
    this.rng = new RNG(seed);
    this.roads = [];
    this.cellSize = 250;
    this.grid = new Map();
    this.signs = [];
  }

  add(type, pts, name = '', opts = {}) {
    const road = { id: this.roads.length, type, def: ROAD_TYPES[type], pts, name, ...opts };
    this.roads.push(road);
    return road;
  }

  // Desvia os pontos de controle para dar curvas naturais (relevo acidentado).
  meander(ctrl, amp, rng) {
    const out = [ctrl[0]];
    for (let i = 0; i < ctrl.length - 1; i++) {
      const a = ctrl[i];
      const b = ctrl[i + 1];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.round(L / 900));
      const nx = -(b[1] - a[1]) / (L || 1);
      const nz = (b[0] - a[0]) / (L || 1);
      for (let k = 1; k < n; k++) {
        const t = k / n;
        const off = rng.range(-amp, amp) * Math.sin(Math.PI * t);
        out.push([a[0] + (b[0] - a[0]) * t + nx * off, a[1] + (b[1] - a[1]) * t + nz * off]);
      }
      out.push(b);
    }
    return out;
  }

  generate() {
    const c = this.country;
    const H = WORLD.half + 400;
    const curvy = !c.grid;
    const amp = curvy ? 260 + c.terrain.amp * 1.5 : 60;
    for (const hw of c.highways) {
      const ctrl = this.meander(hw.pts, hw.type === 'interstate' ? amp * 0.35 : amp, this.rng.fork(hw.name));
      this.add(hw.type, smoothPath(ctrl, 20), hw.name);
    }
    if (c.grid) this.makeGrid(c.grid, H);
    else this.makeLocalRoads();
    this.reindex();
    return this;
  }

  makeGrid(g, H) {
    const rng = this.rng.fork('grid');
    const sp = g.spacing;
    const ang = g.angle || 0;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const rot = (u, v) => [u * ca - v * sa, u * sa + v * ca];
    const n = Math.ceil((H * 1.5) / sp);
    let lineIdx = 0;
    for (const axis of [0, 1]) {
      for (let k = -n; k <= n; k++) {
        lineIdx++;
        const paved = g.pavedEvery > 0 && Math.abs(k) % g.pavedEvery === 0;
        const type = paved ? 'paved' : g.type;
        // A linha é cortada em trechos de uma seção; alguns trechos não existem.
        let run = [];
        for (let s = -n; s < n; s++) {
          const skip = !paved && rng.chance(0.12);
          const u0 = s * sp;
          const u1 = (s + 1) * sp;
          const a = axis === 0 ? rot(k * sp, u0) : rot(u0, k * sp);
          const b = axis === 0 ? rot(k * sp, u1) : rot(u1, k * sp);
          const inside = (p) => Math.abs(p[0]) < H && Math.abs(p[1]) < H;
          const wet = this.crossesWide(a, b);
          if (skip || wet || (!inside(a) && !inside(b))) {
            if (run.length > 1) this.add(type, run, '', { grid: true });
            run = [];
            continue;
          }
          const seg = straight(a, b, 25);
          if (run.length) seg.shift();
          run.push(...seg);
        }
        if (run.length > 1) this.add(type, run, '', { grid: true });
      }
    }
  }

  // Rios largos não são atravessados por estradas de terra.
  crossesWide(a, b) {
    for (const rv of this.terrain.rivers) {
      if (rv.width < 120) continue;
      for (let t = 0; t <= 1; t += 0.1) {
        const x = a[0] + (b[0] - a[0]) * t;
        const z = a[1] + (b[1] - a[1]) * t;
        const p = rv.pts;
        for (let i = 0; i < p.length - 1; i++) if (segDist(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]).d < rv.width * 0.6) return true;
      }
    }
    if (this.terrain.cfg.ocean !== undefined) {
      const mx = (a[0] + b[0]) / 2;
      const mz = (a[1] + b[1]) / 2;
      if (this.terrain.heightAt(mx, mz) < 0.5) return true;
    }
    return false;
  }

  // Estradas vicinais: partem das rodovias, serpenteiam pelo campo e ligam fazendas.
  makeLocalRoads() {
    const rng = this.rng.fork('local');
    const type = this.country.id === 'brasil' ? 'dirt' : 'gravel';
    const H = WORLD.half;
    const count = this.country.id === 'brasil' ? 46 : 40;
    const highways = this.roads.slice();
    this.reindex();
    for (let i = 0; i < count; i++) {
      const hw = rng.pick(highways);
      const p0 = rng.pick(hw.pts);
      let x = p0[0];
      let z = p0[1];
      let dir = rng.range(0, Math.PI * 2);
      const steps = rng.int(60, 220);
      const ctrl = [[x, z]];
      for (let s = 0; s < steps; s++) {
        dir += rng.range(-0.35, 0.35);
        // Evita a água: tenta virar se a frente estiver molhada.
        let nx = x + Math.cos(dir) * 60;
        let nz = z + Math.sin(dir) * 60;
        let tries = 0;
        while ((this.terrain.waterAt(nx, nz) || Math.abs(nx) > H - 100 || Math.abs(nz) > H - 100) && tries < 8) {
          dir += rng.range(0.6, 1.6) * rng.sign();
          nx = x + Math.cos(dir) * 60;
          nz = z + Math.sin(dir) * 60;
          tries++;
        }
        if (tries >= 8) break;
        x = nx;
        z = nz;
        if (s % 4 === 0) ctrl.push([x, z]);
        // Termina ao encontrar outra estrada.
        if (s > 25 && s % 6 === 0) {
          const q = this.query(x, z, 45);
          if (q) {
            const a = q.road.pts[q.seg];
            const b = q.road.pts[q.seg + 1];
            ctrl.push([a[0] + (b[0] - a[0]) * q.t, a[1] + (b[1] - a[1]) * q.t]);
            break;
          }
        }
      }
      if (ctrl.length > 3) {
        const road = this.add(type, smoothPath(ctrl, 18), '', { local: true });
        this.index(road);
      }
    }
  }

  // Índice espacial dos segmentos.
  index(road) {
    const cs = this.cellSize;
    const p = road.pts;
    for (let i = 0; i < p.length - 1; i++) {
      const minx = Math.floor((Math.min(p[i][0], p[i + 1][0]) - 20) / cs);
      const maxx = Math.floor((Math.max(p[i][0], p[i + 1][0]) + 20) / cs);
      const minz = Math.floor((Math.min(p[i][1], p[i + 1][1]) - 20) / cs);
      const maxz = Math.floor((Math.max(p[i][1], p[i + 1][1]) + 20) / cs);
      for (let gx = minx; gx <= maxx; gx++)
        for (let gz = minz; gz <= maxz; gz++) {
          const k = gx * 100003 + gz;
          let arr = this.grid.get(k);
          if (!arr) this.grid.set(k, (arr = []));
          arr.push(road.id, i);
        }
    }
  }

  reindex() {
    this.grid.clear();
    for (const r of this.roads) this.index(r);
  }

  // Estrada mais próxima de (x, z): distância, tipo, altura do leito, direção.
  query(x, z, maxD = 30, filter = null) {
    const cs = this.cellSize;
    const gx = Math.floor(x / cs);
    const gz = Math.floor(z / cs);
    let best = null;
    for (let ox = -1; ox <= 1; ox++)
      for (let oz = -1; oz <= 1; oz++) {
        const arr = this.grid.get((gx + ox) * 100003 + gz + oz);
        if (!arr) continue;
        for (let k = 0; k < arr.length; k += 2) {
          const r = this.roads[arr[k]];
          if (filter && !filter(r)) continue;
          const i = arr[k + 1];
          const a = r.pts[i];
          const b = r.pts[i + 1];
          const s = segDist(x, z, a[0], a[1], b[0], b[1]);
          if (s.d > maxD) continue;
          const lim = r.def.width * 0.5;
          // Prefere a estrada em cima da qual estamos (e a "mais alta" nos cruzamentos).
          const score = s.d - (s.d < lim ? 50 + r.def.lift * 10 : 0);
          if (!best || score < best.score) {
            const y = r.y ? r.y[i] + (r.y[i + 1] - r.y[i]) * s.t : null;
            best = { score, d: s.d, road: r, seg: i, t: s.t, y, dx: b[0] - a[0], dz: b[1] - a[1], on: s.d < lim };
          }
        }
      }
    return best;
  }

  // Altura da superfície (leito da estrada/ponte ou terreno).
  surfaceHeight(x, z) {
    const q = this.query(x, z, 12);
    const th = this.terrain.heightAt(x, z);
    if (q && q.on && q.y !== null) return Math.max(th, q.y);
    return th;
  }

  // Calcula alturas (com pontes sobre rios) e monta as malhas.
  buildMeshes(textures, quality) {
    const terrain = this.terrain;
    for (const r of this.roads) {
      r.y = new Float32Array(r.pts.length);
      r.bridge = new Uint8Array(r.pts.length);
      for (let i = 0; i < r.pts.length; i++) {
        const [x, z] = r.pts[i];
        let y = terrain.heightAt(x, z);
        // Amostra o terreno nas bordas também (estrada não afunda).
        const nb = r.pts[Math.min(i + 1, r.pts.length - 1)];
        const pb = r.pts[Math.max(i - 1, 0)];
        const tx = nb[0] - pb[0];
        const tz = nb[1] - pb[1];
        const tl = Math.hypot(tx, tz) || 1;
        const w = r.def.width * 0.5;
        const nx = -tz / tl;
        const nz = tx / tl;
        y = Math.max(y, terrain.heightAt(x + nx * w, z + nz * w), terrain.heightAt(x - nx * w, z - nz * w));
        // Ponte: mantém acima do nível da água.
        for (const rv of terrain.rivers) {
          const p = rv.pts;
          let best = 1e9;
          for (let k = 0; k < p.length - 1; k++) best = Math.min(best, segDist(x, z, p[k][0], p[k][1], p[k + 1][0], p[k + 1][1]).d);
          const span = rv.width * 0.5 + 40;
          if (best < span + 60) {
            let lvl = 0;
            let bd = 1e18;
            for (const wp of rv.water) {
              const d = (wp[0] - x) ** 2 + (wp[2] - z) ** 2;
              if (d < bd) {
                bd = d;
                lvl = wp[1];
              }
            }
            const deck = lvl + 4 + Math.min(6, rv.width * 0.01);
            const k = smoothstep(span + 60, span, best);
            y = Math.max(y, y * (1 - k) + deck * k);
            if (best < span) r.bridge[i] = 1;
          }
        }
        r.y[i] = y + r.def.lift;
      }
      // Suaviza o perfil longitudinal.
      const sm = Float32Array.from(r.y);
      for (let it = 0; it < 2; it++)
        for (let i = 1; i < r.y.length - 1; i++) sm[i] = Math.max(r.y[i], (r.y[i - 1] + r.y[i] * 2 + r.y[i + 1]) / 4);
      r.y = sm;
    }
    this.reindex();

    const groups = { asphalt: [], gravel: [], dirt: [] };
    for (const r of this.roads) groups[r.def.surface].push(r);
    const group = new THREE.Group();
    group.name = 'roads';
    const country = this.country;
    const mk = (surface) => {
      const tex = textures[surface];
      const color = surface === 'dirt' ? new THREE.Color(country.soil).lerp(new THREE.Color('#ffffff'), 0.25) : surface === 'gravel' ? new THREE.Color(country.grid?.gravelColor || '#b0a08c') : new THREE.Color('#ffffff');
      const mat = new THREE.MeshStandardMaterial({ map: tex, color, roughness: surface === 'asphalt' ? 0.82 : 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
      patchWorld(mat, { key: 'road' + surface });
      if (surface === 'asphalt') addMarkings(mat, country.marking);
      return mat;
    };
    for (const surface of Object.keys(groups)) {
      if (!groups[surface].length) continue;
      const geo = ribbonGeometry(groups[surface]);
      const mesh = new THREE.Mesh(geo, mk(surface));
      mesh.receiveShadow = true;
      mesh.name = 'roads-' + surface;
      group.add(mesh);
    }
    group.add(this.bridgeRails());
    return group;
  }

  bridgeRails() {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: '#b8b4ac', roughness: 0.8 });
    patchWorld(mat, { key: 'rail' });
    const items = [];
    for (const r of this.roads) {
      if (!r.bridge) continue;
      for (let i = 0; i < r.pts.length - 1; i++) {
        if (!r.bridge[i] && !r.bridge[i + 1]) continue;
        const a = r.pts[i];
        const b = r.pts[i + 1];
        const dx = b[0] - a[0];
        const dz = b[1] - a[1];
        const L = Math.hypot(dx, dz);
        const nx = -dz / L;
        const nz = dx / L;
        const w = r.def.width * 0.5 + 0.3;
        for (const s of [-1, 1]) items.push({ x: (a[0] + b[0]) / 2 + nx * w * s, z: (a[1] + b[1]) / 2 + nz * w * s, y: (r.y[i] + r.y[i + 1]) / 2 + 0.5, L, ang: Math.atan2(dx, dz), h: 1 });
        // Pilares.
        if (i % 3 === 0) items.push({ x: a[0], z: a[1], y: r.y[i] - 6, L: 1.6, ang: Math.atan2(dx, dz), h: 12, w: r.def.width * 0.7 });
      }
    }
    const inst = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    items.forEach((it, k) => {
      e.set(0, it.ang, 0);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(it.x, it.y, it.z), q, new THREE.Vector3(it.w || 0.3, it.h, it.L + 0.2));
      inst.setMatrixAt(k, m);
    });
    inst.count = items.length;
    inst.castShadow = true;
    inst.receiveShadow = true;
    return inst;
  }

  // Placas "Bem-vindo a ..." nas entradas das cidades.
  citySigns(cities) {
    const out = [];
    for (const city of cities) {
      for (const r of this.roads) {
        if (r.type === 'street' || r.grid || r.local) continue;
        for (let i = 1; i < r.pts.length; i++) {
          const da = Math.hypot(r.pts[i - 1][0] - city.x, r.pts[i - 1][1] - city.z);
          const db = Math.hypot(r.pts[i][0] - city.x, r.pts[i][1] - city.z);
          const R = city.radius + 120;
          if ((da > R) !== (db > R)) {
            const inward = db < da;
            const a = r.pts[i - 1];
            const b = r.pts[i];
            const dx = b[0] - a[0];
            const dz = b[1] - a[1];
            const L = Math.hypot(dx, dz) || 1;
            const side = (r.def.width * 0.5 + 3) * (inward ? 1 : -1);
            out.push({ x: b[0] - (dz / L) * side, z: b[1] + (dx / L) * side, faceAng: Math.atan2(inward ? -dx : dx, inward ? -dz : dz), city });
          }
        }
      }
    }
    return out;
  }
}

// Fita (ribbon) que acompanha a estrada. Atributo aRoad = (através 0..1, ao longo em m).
function ribbonGeometry(roads) {
  let nv = 0;
  for (const r of roads) nv += r.pts.length * 2;
  const pos = new Float32Array(nv * 3);
  const uv = new Float32Array(nv * 2);
  const ar = new Float32Array(nv * 3);
  const nor = new Float32Array(nv * 3);
  const idx = [];
  let v = 0;
  for (const r of roads) {
    const p = r.pts;
    const w = r.def.width * 0.5;
    let along = 0;
    const base = v;
    const lanes = r.def.lanes;
    for (let i = 0; i < p.length; i++) {
      const a = p[Math.max(0, i - 1)];
      const b = p[Math.min(p.length - 1, i + 1)];
      const tx = b[0] - a[0];
      const tz = b[1] - a[1];
      const tl = Math.hypot(tx, tz) || 1;
      const nx = -tz / tl;
      const nz = tx / tl;
      if (i > 0) along += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      const y = r.y[i];
      for (const s of [-1, 1]) {
        pos[v * 3] = p[i][0] + nx * w * s;
        pos[v * 3 + 1] = y;
        pos[v * 3 + 2] = p[i][1] + nz * w * s;
        uv[v * 2] = s < 0 ? 0 : 1;
        uv[v * 2 + 1] = along / (r.def.width * 1.6);
        ar[v * 3] = s < 0 ? 0 : 1;
        ar[v * 3 + 1] = along;
        ar[v * 3 + 2] = lanes;
        nor[v * 3 + 1] = 1;
        v++;
      }
    }
    for (let i = 0; i < p.length - 1; i++) {
      const a = base + i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aRoad', new THREE.BufferAttribute(ar, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// Faixas pintadas: linha central (amarela dupla nas Américas do Norte e no Brasil, branca
// tracejada na Argentina, Chile e Uruguai), faixas de borda brancas.
function addMarkings(mat, style) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    prev(shader, r);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aRoad;\nvarying vec3 vRoad;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoad = aRoad;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vRoad;\n#define MARK_${style.toUpperCase()}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float u = vRoad.x;
          float along = vRoad.y;
          float lanes = vRoad.z;
          float fw = fwidth(u) * 1.5 + 0.002;
          vec3 white = vec3(0.92);
          vec3 yellow = vec3(0.95, 0.72, 0.12);
          float m = 0.0;
          vec3 mc = white;
          if (lanes > 0.5) {
            float edge = sstep(0.035 + fw, 0.035, abs(u - 0.06)) + sstep(0.035 + fw, 0.035, abs(u - 0.94));
            m = max(m, edge * 0.85);
            float dash = step(fract(along / 12.0), 0.45);
            if (lanes > 2.5) {
              // Rodovia de 4 faixas: canteiro amarelo duplo no centro e tracejado nas pistas.
              float c1 = sstep(0.012 + fw, 0.012, abs(u - 0.485)) + sstep(0.012 + fw, 0.012, abs(u - 0.515));
              float d1 = (sstep(0.012 + fw, 0.012, abs(u - 0.27)) + sstep(0.012 + fw, 0.012, abs(u - 0.73))) * dash;
              if (c1 > 0.01) { mc = yellow; m = max(m, c1); }
              m = max(m, d1 * 0.9);
            } else {
              #ifdef MARK_YELLOW
                float c2 = sstep(0.018 + fw, 0.018, abs(u - 0.475)) + sstep(0.018 + fw, 0.018, abs(u - 0.525));
                if (c2 > 0.01) mc = yellow;
                m = max(m, c2);
              #else
                float c2 = sstep(0.02 + fw, 0.02, abs(u - 0.5)) * dash;
                m = max(m, c2);
              #endif
            }
          }
          // Desgaste da tinta.
          m *= 0.75 + 0.25 * fract(sin(dot(floor(vec2(u * 40.0, along * 2.0)), vec2(12.9898, 78.233))) * 43758.5453);
          diffuseColor.rgb = mix(diffuseColor.rgb, mc, clamp(m, 0.0, 1.0));
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'roadmark' + style;
}
