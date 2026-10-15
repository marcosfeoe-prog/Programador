// Nível 34 — Ratos da Morte: bandos de ratos magros e de olhos vermelhos que
// vagam pelos túneis apertados. Quando sentem o andarilho por perto, o bando
// inteiro dispara atrás dele pelo labirinto; se alcança, morde (sanidade) e se
// espalha. Mais rápidos que uma caminhada, mais lentos que uma corrida.
import * as THREE from 'three';
import { GeoBuilder } from '../materials.js';
import { W, EH, EV } from './grid.js';
import { clamp, TAU } from '../util.js';

const PASS = new Set([W.NONE, W.DOOR, W.HALF_A, W.HALF_B]);
const MAX_PACKS = 3;
const PACK = 7;
const ROAM = 1.5;
const SWARM = 4.0;
const SENSE = 9;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

function ratGeometry() {
  const B = new GeoBuilder();
  const m = new THREE.Matrix4();
  const sph = new THREE.SphereGeometry(1, 9, 7);
  const col = [0.16, 0.14, 0.12];
  // corpo
  m.compose(new THREE.Vector3(0, 0.06, 0), new THREE.Quaternion(), new THREE.Vector3(0.065, 0.055, 0.13));
  B.addGeometry(sph, m, col);
  // cabeça e focinho
  const cone = new THREE.ConeGeometry(0.045, 0.12, 8);
  m.compose(new THREE.Vector3(0, 0.065, 0.16), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), new THREE.Vector3(1, 1, 1));
  B.addGeometry(cone, m, [0.2, 0.17, 0.15]);
  // orelhas
  for (const s of [-1, 1]) {
    m.compose(new THREE.Vector3(s * 0.03, 0.105, 0.12), new THREE.Quaternion(), new THREE.Vector3(0.02, 0.022, 0.008));
    B.addGeometry(sph, m, [0.35, 0.22, 0.22]);
  }
  // rabo comprido e pelado
  const tail = new THREE.CylinderGeometry(0.004, 0.011, 0.26, 5);
  m.compose(new THREE.Vector3(0, 0.035, -0.24), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - 0.15, 0, 0)), new THREE.Vector3(1, 1, 1));
  B.addGeometry(tail, m, [0.45, 0.3, 0.3]);
  // patas
  for (const [x, z] of [
    [-0.04, 0.08],
    [0.04, 0.08],
    [-0.045, -0.07],
    [0.045, -0.07],
  ]) {
    m.compose(new THREE.Vector3(x, 0.015, z), new THREE.Quaternion(), new THREE.Vector3(0.012, 0.02, 0.016));
    B.addGeometry(sph, m, [0.3, 0.2, 0.2]);
  }
  sph.dispose();
  cone.dispose();
  tail.dispose();
  return B.build();
}

export class DeathRats {
  constructor(level) {
    this.L = level;
    this.game = level.game;
    const n = MAX_PACKS * PACK;
    this.geo = ratGeometry();
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, emissive: 0x050404 });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.eyeGeo = new THREE.SphereGeometry(0.011, 6, 4);
    this.eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.25, 0.15), fog: true });
    this.eyes = new THREE.InstancedMesh(this.eyeGeo, this.eyeMat, n * 2);
    this.eyes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.eyes.frustumCulled = false;
    level.dynamic.add(this.mesh, this.eyes);
    this.packs = [];
    for (let k = 0; k < MAX_PACKS; k++) {
      const rats = [];
      for (let i = 0; i < PACK; i++) rats.push({ x: 0, z: 0, yaw: 0, ph: Math.random() * 10, ox: 0, oz: 0, spd: 0.9 + Math.random() * 0.25 });
      this.packs.push({ active: false, x: 0, z: 0, rats, state: 'roam', wp: null, prev: null, timer: 0, chase: 0, path: null, pathT: 0, squeak: 0 });
    }
    this.spawnT = 12;
    this.cool = 0;
    this.hide();
  }

  hide() {
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < this.mesh.count; i++) this.mesh.setMatrixAt(i, _m);
    for (let i = 0; i < this.eyes.count; i++) this.eyes.setMatrixAt(i, _m);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.eyes.instanceMatrix.needsUpdate = true;
  }

  get activeCount() {
    return this.packs.filter((p) => p.active).length;
  }

  cellOf(v) {
    return Math.floor(v / this.L.cell);
  }

  center(i) {
    return (i + 0.5) * this.L.cell;
  }

  passable(ax, az, dx, dz) {
    const L = this.L;
    const t = dx ? L.edge(EV, dx > 0 ? ax + 1 : ax, az) : L.edge(EH, ax, dz > 0 ? az + 1 : az);
    if (!PASS.has(t)) return false;
    return !(L.ratBlocked && L.ratBlocked(ax + dx, az + dz));
  }

  // Busca em largura curta até a célula do alvo; devolve o próximo ponto.
  pathStep(sxw, szw, tx, tz) {
    const sx = this.cellOf(sxw);
    const sz = this.cellOf(szw);
    const gx = this.cellOf(tx);
    const gz = this.cellOf(tz);
    if (sx === gx && sz === gz) return { x: tx, z: tz };
    const R = 14;
    const key = (x, z) => (x - sx + R) * 100 + (z - sz + R);
    const prev = new Map([[key(sx, sz), null]]);
    const q = [[sx, sz]];
    let found = null;
    for (let qi = 0; qi < q.length && qi < 900; qi++) {
      const [x, z] = q[qi];
      if (x === gx && z === gz) {
        found = [x, z];
        break;
      }
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const nz = z + dz;
        if (Math.abs(nx - sx) > R || Math.abs(nz - sz) > R) continue;
        const k = key(nx, nz);
        if (prev.has(k) || !this.passable(x, z, dx, dz)) continue;
        prev.set(k, [x, z]);
        q.push([nx, nz]);
      }
    }
    if (!found) return null;
    let cur = found;
    for (;;) {
      const p = prev.get(key(cur[0], cur[1]));
      if (!p || (p[0] === sx && p[1] === sz)) break;
      cur = p;
    }
    // mesma célula do alvo vizinha: vai direto
    if (cur[0] === gx && cur[1] === gz) return { x: tx, z: tz };
    return { x: this.center(cur[0]), z: this.center(cur[1]) };
  }

  spawn(player) {
    const L = this.L;
    const pk = this.packs.find((p) => !p.active);
    if (!pk) return false;
    for (let t = 0; t < 20; t++) {
      const a = Math.random() * TAU;
      const r = 16 + Math.random() * 18;
      const ci = this.cellOf(player.pos.x + Math.cos(a) * r);
      const cj = this.cellOf(player.pos.z + Math.sin(a) * r);
      if (L.ratBlocked && L.ratBlocked(ci, cj)) continue;
      if (!L.corridor(ci, cj)) continue;
      const x = this.center(ci);
      const z = this.center(cj);
      if (!L.chunkAt(x, z)) continue;
      Object.assign(pk, { active: true, x, z, state: 'roam', wp: null, prev: null, timer: 0, chase: 0, path: null, pathT: 0, squeak: 1 + Math.random() * 3, life: 0, seen: false });
      for (const rt of pk.rats) {
        rt.x = x + (Math.random() - 0.5) * 1.2;
        rt.z = z + (Math.random() - 0.5) * 1.2;
        rt.ox = (Math.random() - 0.5) * 1.1;
        rt.oz = (Math.random() - 0.5) * 1.6;
      }
      return true;
    }
    return false;
  }

  nextWaypoint(pk) {
    const ci = this.cellOf(pk.x);
    const cj = this.cellOf(pk.z);
    let opts = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].filter(([dx, dz]) => this.passable(ci, cj, dx, dz));
    const fresh = opts.filter(([dx, dz]) => !pk.prev || pk.prev[0] !== ci + dx || pk.prev[1] !== cj + dz);
    if (fresh.length) opts = fresh;
    if (!opts.length) {
      pk.wp = [pk.x, pk.z];
      return;
    }
    const [dx, dz] = opts[Math.floor(Math.random() * opts.length)];
    pk.prev = [ci, cj];
    pk.wp = [this.center(ci + dx), this.center(cj + dz)];
  }

  squeak(pk, d, k = 1) {
    const g = this.game;
    const pan = clamp((pk.x - g.player.pos.x) * Math.cos(g.player.yaw) - (pk.z - g.player.pos.z) * Math.sin(g.player.yaw), -8, 8) / 8;
    g.audio.play('creak', { gain: clamp(1 - d / 28, 0, 1) * 0.16 * k, rate: 2.4 + Math.random() * 1.2, pan, wet: 0.8 });
  }

  update(dt, player) {
    const g = this.game;
    const L = this.L;
    this.cool = Math.max(0, this.cool - dt);
    this.spawnT -= dt;
    const want = L.ratPacks || 2;
    if (this.spawnT <= 0 && !g.transitioning && !L.noRats) this.spawnT = this.activeCount < want && this.spawn(player) ? 10 + Math.random() * 12 : 3;
    let idx = 0;
    let eyeIdx = 0;
    let fear = 0;
    const fx = -Math.sin(player.yaw);
    const fz = -Math.cos(player.yaw);
    for (const pk of this.packs) {
      if (!pk.active) continue;
      pk.life += dt;
      const dx = player.pos.x - pk.x;
      const dz = player.pos.z - pk.z;
      const d = Math.hypot(dx, dz);
      // longe demais: some (e volta a surgir em outro lugar)
      if (d > 55 || L.noRats || (pk.state === 'scatter' && pk.timer <= 0)) {
        pk.active = false;
        continue;
      }
      let tx = pk.x;
      let tz = pk.z;
      let sp = 0;
      if (pk.state === 'roam') {
        if (d < SENSE && this.cool <= 0 && L.los(pk.x, pk.z, player.pos.x, player.pos.z, 0.3)) {
          pk.state = 'swarm';
          pk.chase = 0;
          pk.pathT = 0;
          this.squeak(pk, d, 2.2);
          this.squeak(pk, d, 1.6);
          if (!this.told) {
            this.told = true;
            g.hud.message('Guinchos! Um bando de Ratos da Morte dispara na sua direção. Corra!', 4);
          }
        } else {
          if (!pk.wp || Math.hypot(pk.wp[0] - pk.x, pk.wp[1] - pk.z) < 0.4) this.nextWaypoint(pk);
          tx = pk.wp[0];
          tz = pk.wp[1];
          sp = ROAM;
        }
      } else if (pk.state === 'swarm') {
        pk.chase += dt;
        pk.pathT -= dt;
        if (pk.pathT <= 0) {
          pk.pathT = 0.3;
          pk.path = this.pathStep(pk.x, pk.z, player.pos.x, player.pos.z);
        }
        if (pk.path) {
          tx = pk.path.x;
          tz = pk.path.z;
          sp = SWARM;
        }
        if (pk.chase > 11 || d > 24 || !pk.path) {
          pk.state = 'roam';
          pk.wp = null;
        }
        if (d < 0.75 && !g.transitioning) {
          g.caught({ image: L.ratFace ? L.ratFace() : undefined, text: 'Os Ratos da Morte morderam você e sumiram pelas frestas. Não deixe o bando chegar perto.', sanity: 16 });
          pk.state = 'scatter';
          pk.timer = 2.5;
          this.cool = 9;
        }
      } else if (pk.state === 'scatter') {
        pk.timer -= dt;
        tx = pk.x - dx;
        tz = pk.z - dz;
        sp = 5;
      }
      // move o centro do bando
      const mx = tx - pk.x;
      const mz = tz - pk.z;
      const ml = Math.hypot(mx, mz);
      if (ml > 0.01 && sp > 0) {
        const s = Math.min(ml, sp * dt);
        const p = { x: pk.x + (mx / ml) * s, z: pk.z + (mz / ml) * s };
        L.collide(p, 0.2);
        pk.x = p.x;
        pk.z = p.z;
        pk.dir = Math.atan2(mx, mz);
      }
      pk.squeak -= dt;
      if (pk.squeak <= 0) {
        pk.squeak = pk.state === 'swarm' ? 0.35 + Math.random() * 0.5 : 2 + Math.random() * 4;
        if (d < 26) this.squeak(pk, d, pk.state === 'swarm' ? 1.4 : 0.8);
      }
      if (pk.state === 'swarm') fear = Math.max(fear, clamp(1.1 - d / 12, 0.3, 1));
      else if (d < 10) fear = Math.max(fear, 0.15);
      // cada rato segue o centro com um deslocamento próprio
      const dir = pk.dir || 0;
      const cs = Math.cos(dir);
      const sn = Math.sin(dir);
      for (const rt of pk.rats) {
        rt.ph += dt * (sp > 0 ? 18 : 3) * rt.spd;
        const wob = Math.sin(rt.ph * 0.37) * 0.25;
        const gx = pk.x + (rt.ox + wob) * cs + rt.oz * sn;
        const gz = pk.z - (rt.ox + wob) * sn + rt.oz * cs;
        const ex = gx - rt.x;
        const ez = gz - rt.z;
        const el = Math.hypot(ex, ez);
        const rs = (sp > 0 ? sp * 1.35 : 0.9) * rt.spd;
        if (el > 0.02) {
          const s = Math.min(el, rs * dt);
          const p = { x: rt.x + (ex / el) * s, z: rt.z + (ez / el) * s };
          L.collide(p, 0.08);
          rt.x = p.x;
          rt.z = p.z;
          rt.yaw = Math.atan2(ex, ez);
        }
        const bob = sp > 0 ? Math.abs(Math.sin(rt.ph)) * 0.02 : 0;
        const y = (L.waterY ? L.waterY(rt.x, rt.z) : 0) + bob;
        _q.setFromEuler(_e.set(sp > 0 ? -0.08 : 0, rt.yaw + Math.sin(rt.ph * 0.5) * 0.15, 0));
        _s.setScalar(1.15);
        _p.set(rt.x, y, rt.z);
        _m.compose(_p, _q, _s);
        this.mesh.setMatrixAt(idx++, _m);
        // olhos
        const ca = Math.cos(rt.yaw);
        const sa = Math.sin(rt.yaw);
        for (const s of [-1, 1]) {
          const lx = s * 0.024;
          const lz = 0.2;
          _p.set(rt.x + lx * ca + lz * sa, y + 0.088, rt.z - lx * sa + lz * ca);
          _m.makeTranslation(_p.x, _p.y, _p.z);
          this.eyes.setMatrixAt(eyeIdx++, _m);
        }
      }
      // dentro da visão e perto: um susto
      if (!pk.seen && d < 8) {
        const dot = (-dx * fx - dz * fz) / Math.max(d, 0.01);
        if (dot > 0.7) {
          pk.seen = true;
          g.addSanity(-3);
        }
      }
    }
    _m.makeScale(0, 0, 0);
    for (let i = idx; i < this.mesh.count; i++) this.mesh.setMatrixAt(i, _m);
    for (let i = eyeIdx; i < this.eyes.count; i++) this.eyes.setMatrixAt(i, _m);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.eyes.instanceMatrix.needsUpdate = true;
    return fear;
  }

  dispose() {
    this.L.dynamic.remove(this.mesh, this.eyes);
    this.geo.dispose();
    this.mat.dispose();
    this.eyeGeo.dispose();
    this.eyeMat.dispose();
  }
}
