// Viagens: rotas pela malha de estradas (Dijkstra), GPS com setas sobre a pista,
// marcador de destino, mirantes para descobrir, estradas percorridas e o
// piloto automático (segue a rota na faixa da direita).
import * as THREE from 'three';
import { CITIES, COUNTRIES } from './world/data.js';
import { clamp, lerp, wrapAngle } from './util.js';

// ponto da estrada na distância s (interpolado)
export function roadAt(r, s, out = {}) {
  const cum = r.cum;
  const n = r.hs.length;
  s = clamp(s, 0, r.len);
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (cum[m] <= s) lo = m;
    else hi = m;
  }
  const t = (s - cum[lo]) / Math.max(cum[hi] - cum[lo], 1e-6);
  const p = r.pts;
  out.x = lerp(p[lo * 2], p[hi * 2], t);
  out.z = lerp(p[lo * 2 + 1], p[hi * 2 + 1], t);
  out.y = lerp(r.hs[lo], r.hs[hi], t);
  let tx = p[hi * 2] - p[lo * 2];
  let tz = p[hi * 2 + 1] - p[lo * 2 + 1];
  const l = Math.hypot(tx, tz) || 1;
  out.tx = tx / l;
  out.tz = tz / l;
  out.k = lo;
  out.slope = (r.hs[hi] - r.hs[lo]) / Math.max(cum[hi] - cum[lo], 1e-6);
  return out;
}

export class Router {
  constructor(roads, gen) {
    this.roads = roads;
    this.gen = gen;
    this.adj = CITIES.map(() => []);
    for (const r of roads) {
      this.adj[r.a].push({ r, to: r.b, len: r.len, fwd: true });
      this.adj[r.b].push({ r, to: r.a, len: r.len, fwd: false });
    }
  }

  dijkstra(src) {
    const n = CITIES.length;
    const dist = new Array(n).fill(Infinity);
    const prev = new Array(n).fill(null);
    const done = new Array(n).fill(false);
    dist[src] = 0;
    for (let it = 0; it < n; it++) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0 || dist[u] === Infinity) break;
      done[u] = true;
      for (const e of this.adj[u]) {
        const d = dist[u] + e.len;
        if (d < dist[e.to]) {
          dist[e.to] = d;
          prev[e.to] = { from: u, e };
        }
      }
    }
    return { dist, prev };
  }

  // estrada mais próxima de (x, z): {r, s, dist}
  nearest(x, z) {
    const q = this.gen.roadQuery(x, z, 60);
    if (q) return { r: q.road, s: q.s, dist: q.dist };
    let best = null;
    for (const r of this.roads) {
      const p = r.pts;
      for (let k = 0; k < r.hs.length; k += 4) {
        const d = Math.hypot(p[k * 2] - x, p[k * 2 + 1] - z);
        if (!best || d < best.dist) best = { r, s: r.cum[k], dist: d };
      }
    }
    return best;
  }

  // rota da posição atual até a cidade de destino
  route(x, z, dest, heading = null) {
    const start = this.nearest(x, z);
    if (!start) return null;
    const { r, s } = start;
    const options = [];
    for (const fwd of [true, false]) {
      const endCity = fwd ? r.b : r.a;
      const along = fwd ? r.len - s : s;
      let cost = along;
      // prefere seguir no sentido em que o carro já está apontando
      if (heading) {
        const p = roadAt(r, s);
        const dot = (p.tx * heading.x + p.tz * heading.z) * (fwd ? 1 : -1);
        if (dot < 0) cost += 250;
      }
      if (endCity === dest) {
        options.push({ cost, legs: [{ r, s0: s, s1: fwd ? r.len : 0 }] });
        continue;
      }
      const D = this.dijkstra(endCity);
      if (D.dist[dest] === Infinity) continue;
      const legs = [{ r, s0: s, s1: fwd ? r.len : 0 }];
      const chain = [];
      let c = dest;
      while (c !== endCity) {
        const p = D.prev[c];
        chain.push(p.e);
        c = p.from;
      }
      chain.reverse();
      for (const e of chain) legs.push({ r: e.r, s0: e.fwd ? 0 : e.r.len, s1: e.fwd ? e.r.len : 0 });
      options.push({ cost: cost + D.dist[dest], legs });
    }
    if (!options.length) return null;
    options.sort((a, b) => a.cost - b.cost);
    return this.build(options[0].legs, dest);
  }

  build(legs, dest) {
    const P = [];
    const tmp = {};
    for (const L of legs) {
      const dir = L.s1 >= L.s0 ? 1 : -1;
      const len = Math.abs(L.s1 - L.s0);
      const n = Math.max(1, Math.ceil(len / 5));
      for (let i = 0; i <= n; i++) {
        const s = L.s0 + dir * len * (i / n);
        roadAt(L.r, s, tmp);
        P.push({ x: tmp.x, y: tmp.y, z: tmp.z, hw: L.r.hw, r: L.r });
      }
    }
    // remove pontos duplicados nas emendas
    const pts = [P[0]];
    for (let i = 1; i < P.length; i++) if (Math.hypot(P[i].x - pts[pts.length - 1].x, P[i].z - pts[pts.length - 1].z) > 0.5) pts.push(P[i]);
    const cum = new Float32Array(pts.length);
    for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    return { pts, cum, total: cum[cum.length - 1], dest, idx: 0, legs };
  }
}

// ------------------------------------------------------------ GPS na pista
function chevronTex() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 64, 128);
  ctx.fillStyle = 'rgba(255,255,255,1)';
  ctx.beginPath();
  ctx.moveTo(6, 70);
  ctx.lineTo(32, 30);
  ctx.lineTo(58, 70);
  ctx.lineTo(46, 70);
  ctx.lineTo(32, 48);
  ctx.lineTo(18, 70);
  ctx.closePath();
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export class Gps {
  constructor(scene) {
    this.scene = scene;
    this.route = null;
    this.mat = new THREE.MeshBasicMaterial({ map: chevronTex(), color: 0x5fe6ff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
    // feixe de luz no destino
    const beamMat = new THREE.MeshBasicMaterial({ color: 0x7fe8ff, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 400, 24, 1, true), beamMat);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(6, 7.5, 48), new THREE.MeshBasicMaterial({ color: 0x7fe8ff, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
    this.ring.rotation.x = -Math.PI / 2;
    this.beam.visible = this.ring.visible = false;
    scene.add(this.beam, this.ring);
    this.lastIdx = -1;
    this.enabled = true;
  }

  set(route) {
    this.route = route;
    this.lastIdx = -1;
    if (route) {
      const c = CITIES[route.dest];
      this.beam.position.set(c.x, c.h + 200, c.z);
      this.ring.position.set(c.x, c.h + 0.15, c.z);
    }
    this.beam.visible = this.ring.visible = !!route;
    if (!route) this.mesh.geometry = new THREE.BufferGeometry();
  }

  // avança o progresso na rota; devolve distância até a rota
  progress(x, z) {
    const R = this.route;
    if (!R) return 0;
    let best = R.idx;
    let bd = 1e9;
    const n = R.pts.length;
    for (let i = Math.max(0, R.idx - 10); i < Math.min(n, R.idx + 80); i++) {
      const d = Math.hypot(R.pts[i].x - x, R.pts[i].z - z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    R.idx = best;
    R.remaining = R.total - R.cum[best];
    return bd;
  }

  update(t) {
    const R = this.route;
    this.mat.map.offset.y = -t * 1.2;
    this.ring.rotation.z = t * 0.3;
    if (!R || !this.enabled) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    if (R.idx === this.lastIdx) return;
    this.lastIdx = R.idx;
    const P = [];
    const U = [];
    const I = [];
    const i0 = R.idx + 2;
    const i1 = Math.min(R.pts.length - 1, i0 + 70);
    let row = 0;
    for (let i = i0; i <= i1; i++) {
      const a = R.pts[Math.max(0, i - 1)];
      const b = R.pts[Math.min(R.pts.length - 1, i + 1)];
      let tx = b.x - a.x;
      let tz = b.z - a.z;
      const l = Math.hypot(tx, tz) || 1;
      tx /= l;
      tz /= l;
      const p = R.pts[i];
      // faixa da direita (no sentido da viagem)
      const off = p.hw * 0.48;
      const cx = p.x - tz * off;
      const cz = p.z + tx * off;
      const w = 0.75;
      const fade = Math.min(1, (i - i0) / 6) * Math.min(1, (i1 - i) / 12);
      P.push(cx + tz * w, p.y + 0.09, cz - tx * w, cx - tz * w, p.y + 0.09, cz + tx * w);
      U.push(0, R.cum[i] / 4, 1, R.cum[i] / 4);
      if (row > 0) {
        const k = (row - 1) * 2;
        I.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
      row++;
      void fade;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setIndex(I);
    this.mesh.geometry.dispose();
    this.mesh.geometry = g;
  }
}

// ------------------------------------------------------------ mirantes
const VP_NAMES = {
  0: ['Mirante do Fiorde', 'Mirante das Cachoeiras', 'Mirante do Troll'],
  1: ['Mirante dos Alpes', 'Mirante do Glaciar', 'Mirante do Lago'],
  2: ['Mirante do Vulcão', 'Mirante das Cerejeiras', 'Mirante do Templo'],
  3: ['Mirante do Cânion', 'Mirante das Mesetas', 'Mirante do Pacífico'],
  4: ['Mirante da Toscana', 'Mirante dos Ciprestes', 'Mirante do Mediterrâneo'],
  5: ['Mirante da Mata', 'Mirante do Morro', 'Mirante da Baía'],
};

export function findViewpoints(roads, gen) {
  const cands = [];
  for (const r of roads) {
    for (let k = 40; k < r.hs.length - 40; k += 40) {
      if (r.br[k]) continue;
      const x = r.pts[k * 2];
      const z = r.pts[k * 2 + 1];
      if (CITIES.some((c) => Math.hypot(c.x - x, c.z - z) < 700)) continue;
      const h = r.hs[k];
      let sum = 0;
      let water = 0;
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2;
        sum += gen.natural(x + Math.cos(ang) * 600, z + Math.sin(ang) * 600);
        if (gen.natural(x + Math.cos(ang) * 1500, z + Math.sin(ang) * 1500) < 0) water++;
      }
      const prom = h - sum / 8;
      const score = prom + water * 25 + Math.min(h, 1500) * 0.05;
      cands.push({ r, k, x, z, h, score, ci: gen.countryAt(x, z) });
    }
  }
  cands.sort((a, b) => b.score - a.score);
  const out = [];
  for (const c of cands) {
    const same = out.filter((o) => o.ci === c.ci);
    if (same.length >= 3) continue;
    if (out.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < 2500)) continue;
    // lado da estrada com a vista mais aberta (terreno mais baixo)
    const r = c.r;
    const p = roadAt(r, r.cum[c.k]);
    const rx = -p.tz;
    const rz = p.tx;
    const hl = gen.natural(c.x - rx * 300, c.z - rz * 300);
    const hr = gen.natural(c.x + rx * 300, c.z + rz * 300);
    const side = hr < hl ? 1 : -1;
    const off = r.hw + 7;
    const name = VP_NAMES[c.ci][same.length] || 'Mirante';
    out.push({ ...c, side, name, px: c.x + rx * side * off, pz: c.z + rz * side * off, yaw: Math.atan2(rx * side, rz * side), id: out.length });
  }
  return out;
}

export function buildViewpointMeshes(scene, vps, gen, roadsObj) {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a5232, roughness: 0.8 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x3a6a5a, roughness: 0.4, metalness: 0.6 });
  for (const v of vps) {
    const y = gen.height(v.px, v.pz);
    const g = new THREE.Group();
    g.position.set(v.px, y, v.pz);
    g.rotation.y = v.yaw;
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.45), wood);
    bench.position.set(-1.5, 0.45, 0);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 0.06), wood);
    back.position.set(-1.5, 0.75, -0.22);
    const scopePost = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.1, 10), metal);
    scopePost.position.set(1.5, 0.55, 0.2);
    const scope = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.42), metal);
    scope.position.set(1.5, 1.2, 0.2);
    g.add(bench, back, scopePost, scope);
    for (const m of [bench, back, scopePost, scope]) m.castShadow = true;
    scene.add(g);
    group.add(g);
    // placa turística marrom
    const r = v.r;
    const p = roadAt(r, r.cum[Math.max(0, v.k - 30)]);
    const sx = p.x + -p.tz * v.side * (r.hw + 3.2);
    const sz = p.z + p.tx * v.side * (r.hw + 3.2);
    roadsObj.sign(['📷 ' + v.name.replace('Mirante ', 'Mirante '), '300 m'], sx, gen.height(sx, sz), sz, Math.atan2(-p.tx, -p.tz), { bg: '#6a3a1e', w: 3.6, h: 1.2, post: 1.4, font: 'bold 48px sans-serif', sub: 'bold 40px sans-serif' });
  }
  return group;
}

// ------------------------------------------------------------ estradas percorridas
export class Discovery {
  constructor(roads, saved) {
    this.roads = roads;
    this.seg = 50;
    this.bits = roads.map((r) => new Uint8Array(Math.ceil(r.len / this.seg)));
    if (saved)
      saved.forEach((str, i) => {
        if (!this.bits[i]) return;
        for (let k = 0; k < Math.min(str.length, this.bits[i].length); k++) this.bits[i][k] = str[k] === '1' ? 1 : 0;
      });
    this.total = roads.reduce((a, r) => a + r.len, 0);
  }
  mark(road, s) {
    const i = this.roads.indexOf(road);
    const k = Math.floor(s / this.seg);
    const b = this.bits[i];
    if (b && k >= 0 && k < b.length && !b[k]) {
      b[k] = 1;
      return true;
    }
    return false;
  }
  isDone(i, s) {
    const b = this.bits[i];
    return b && b[Math.floor(s / this.seg)];
  }
  get fraction() {
    let d = 0;
    let n = 0;
    for (const b of this.bits) {
      for (const v of b) d += v;
      n += b.length;
    }
    return n ? d / n : 0;
  }
  roadDone(i) {
    const b = this.bits[i];
    let d = 0;
    for (const v of b) d += v;
    return d / b.length;
  }
  serialize() {
    return this.bits.map((b) => Array.from(b).join(''));
  }
}

// ------------------------------------------------------------ piloto automático
// Segue os pontos da rota pela faixa da direita, freando antes das curvas.
export function autopilot(route, phys, maxKmh, dt, state) {
  const pos = phys.pos;
  const fwd = phys.forward;
  const v = phys.speed;
  const pts = route.pts;
  const n = pts.length;
  const look = 7 + Math.abs(v) * 0.75;
  let i = route.idx;
  let acc = 0;
  while (i < n - 1 && acc < look) {
    acc += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
    i++;
  }
  const lane = (k) => {
    const a = pts[Math.max(0, k - 1)];
    const b = pts[Math.min(n - 1, k + 1)];
    let tx = b.x - a.x;
    let tz = b.z - a.z;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    const off = pts[k].hw * 0.45;
    return { x: pts[k].x - tz * off, z: pts[k].z + tx * off, tx, tz };
  };
  const tgt = lane(i);
  const dx = tgt.x - pos.x;
  const dz = tgt.z - pos.z;
  const heading = Math.atan2(fwd.x, fwd.z);
  const ang = wrapAngle(Math.atan2(dx, dz) - heading);
  const ld = Math.max(Math.hypot(dx, dz), 1);
  const wb = phys.wheelBase;
  const delta = Math.atan2(2 * wb * Math.sin(ang), ld);
  // curvatura à frente -> velocidade segura
  let curv = 0;
  for (let k = route.idx; k < Math.min(n - 3, route.idx + 40); k += 3) {
    const a = lane(k);
    const b = lane(k + 3);
    const da = Math.abs(wrapAngle(Math.atan2(b.tx, b.tz) - Math.atan2(a.tx, a.tz)));
    const d = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const dist = Math.max(1, Math.hypot(a.x - pos.x, a.z - pos.z));
    curv = Math.max(curv, (da / d) / (1 + dist / 120));
  }
  let vt = Math.min(maxKmh / 3.6, Math.sqrt(3.9 / Math.max(curv, 1e-4)));
  const remain = route.remaining ?? 1e9;
  vt = Math.min(vt, Math.sqrt(2 * 2.5 * Math.max(0, remain - 25)) + 2);
  if (state && state.blocked) vt = Math.min(vt, state.blocked);
  const err = vt - v;
  return {
    steer: clamp(-delta / Math.max(phys.maxSteer * 0.8, 0.1), -1, 1),
    throttle: clamp(err * 0.25, 0, 0.85),
    brake: clamp(-err * 0.2, 0, 1),
    analog: true,
    handbrake: false,
  };
}

export const countryName = (i) => COUNTRIES[i].name;
