// Nível 8 — "Sistema de Cavernas": uma rede enorme de cavernas naturais, frias
// e escuras como breu. Câmaras amplas ligadas por túneis tortos, estalactites,
// poças d'água paradas. Só a lanterna mostra o caminho.
// A M.E.G. montou uma base de pesquisa numa das câmaras: barracas, lâmpadas de
// obra, gerador, mesa com mapas e alguns tripulantes para conversar.
// Saída: uma passagem tapada com tábuas leva à área de mineração escondida;
// lá, uma porta de madeira na rocha leva ao Nível 9.
import * as THREE from 'three';
import { pushCircle } from './grid.js';
import { GeoBuilder, litMaterial } from '../materials.js';
import { getTex, textCanvasTex } from '../textures.js';
import { clamp, fbm, hash3, mulberry32, smoothstep, TAU } from '../util.js';
import './level88_world.js';
import { NPC } from './level0_1_npc.js';

const R = 160; // metade do lado do mapa (m)
const G = 1; // resolução da grade lógica (m)
const N = (2 * R) / G + 1;
const WATER = -0.55;

export class Level8 {
  constructor(game) {
    this.game = game;
    this.Q = game.Q;
    this.scene = game.scene;
    this.indoor = false;
    this.num = 8;
    this.camFar = 160;
    this.walkSpeed = 2.1;
    this.flashIntensity = 60;
    this.taken = new Set();
    this.dynamic = new THREE.Group();
    this.scene.add(this.dynamic);
    this.seed = (game.seed ^ 0x8888) >>> 0;
    this.look = {
      exposure: 1.1,
      tint: [0.96, 1.0, 1.04],
      sat: 0.75,
      contrast: 1.12,
      lift: [0.0, 0.0, 0.002],
      bloom: 0.3,
      bloomThreshold: 1.0,
      fog: [0.004, 0.005, 0.006],
      lightColor: [1, 1, 1],
      flashlight: true,
      ambience: 'level8',
      reverb: 3.5,
      sanityDrain: 0.18,
    };
    this.objectives = [
      { id: 'base', text: 'Encontre a base da M.E.G.' },
      { id: 'mine', text: 'Encontre a área de mineração escondida' },
      { id: 'door', text: 'Abra a porta de madeira' },
    ];
    this.scene.background = new THREE.Color(0, 0, 0);
    this.scene.fog = new THREE.FogExp2(new THREE.Color(...this.look.fog), 0.042);
    this.hemi = new THREE.HemisphereLight(0x8090a0, 0x201810, 0.12);
    this.scene.add(this.hemi);
    this.circles = [];
    this.rects = [];
    this.npcs = [];
    this.plan();
  }

  // ------------------------------------------------------------ planta
  idx(x, z) {
    const i = clamp(Math.round((x + R) / G), 0, N - 1);
    const j = clamp(Math.round((z + R) / G), 0, N - 1);
    return j * N + i;
  }

  sample(arr, x, z) {
    const fx = clamp((x + R) / G, 0, N - 1.001);
    const fz = clamp((z + R) / G, 0, N - 1.001);
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const a = arr[j * N + i];
    const b = arr[j * N + i + 1];
    const c = arr[(j + 1) * N + i];
    const d = arr[(j + 1) * N + i + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }

  stamp(x, z, r, height, floorDrop = 0) {
    const O = this.open;
    const r2 = r + 2;
    for (let j = Math.floor((z - r2 + R) / G); j <= Math.ceil((z + r2 + R) / G); j++) {
      if (j < 0 || j >= N) continue;
      for (let i = Math.floor((x - r2 + R) / G); i <= Math.ceil((x + r2 + R) / G); i++) {
        if (i < 0 || i >= N) continue;
        const px = i * G - R;
        const pz = j * G - R;
        const d = Math.hypot(px - x, pz - z);
        const k = clamp((r - d) / 1.6 + 0.5, 0, 1);
        const id = j * N + i;
        if (k > O[id]) O[id] = k;
        if (k > 0.2) {
          this.hc[id] = Math.max(this.hc[id], height * k);
          this.drop[id] = Math.max(this.drop[id], floorDrop * k);
        }
      }
    }
  }

  // túnel serpenteando entre dois pontos
  tunnel(a, b, w, rnd, h = 3.2) {
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.ceil(L / 0.8);
    const nx = -(b.z - a.z) / L;
    const nz = (b.x - a.x) / L;
    const ph = rnd() * 10;
    const amp = 3 + rnd() * 5;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const off = Math.sin(t * Math.PI * (1.5 + (ph % 2)) + ph) * amp * Math.sin(t * Math.PI);
      const x = a.x + (b.x - a.x) * t + nx * off;
      const z = a.z + (b.z - a.z) * t + nz * off;
      const ww = w * (0.8 + 0.4 * fbm(x * 0.1, z * 0.1, 2, this.seed + 3));
      this.stamp(x, z, ww, h + ww * 0.3);
    }
  }

  plan() {
    const rnd = mulberry32(this.seed);
    this.open = new Float32Array(N * N);
    this.hc = new Float32Array(N * N);
    this.drop = new Float32Array(N * N);
    // câmaras fixas
    const spawnC = { x: 0, z: 0, r: 11, h: 7 };
    const base = { x: 72 + rnd() * 10, z: 30 + rnd() * 15, r: 17, h: 11 };
    const preMine = { x: -60, z: -30 - rnd() * 10, r: 9, h: 6 };
    const mine = { x: -100, z: -78, r: 13, h: 8 };
    const chambers = [spawnC, base, preMine];
    for (let k = 0; k < 11; k++) {
      for (let t = 0; t < 30; t++) {
        const c = { x: (rnd() - 0.5) * 2 * (R - 25), z: (rnd() - 0.5) * 2 * (R - 25), r: 6 + rnd() * 9, h: 5 + rnd() * 9 };
        if (chambers.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < o.r + c.r + 14)) continue;
        if (Math.hypot(c.x - mine.x, c.z - mine.z) < 45) continue;
        chambers.push(c);
        break;
      }
    }
    // árvore de ligação (vizinho mais próximo já ligado) + alguns laços
    const linked = [chambers[0]];
    const rest = chambers.slice(1);
    while (rest.length) {
      let best = null;
      for (const c of rest)
        for (const l of linked) {
          const d = Math.hypot(c.x - l.x, c.z - l.z);
          if (!best || d < best.d) best = { c, l, d };
        }
      this.tunnel(best.l, best.c, 1.8 + rnd() * 1.8, rnd);
      linked.push(best.c);
      rest.splice(rest.indexOf(best.c), 1);
    }
    for (let k = 0; k < 4; k++) {
      const a = chambers[Math.floor(rnd() * chambers.length)];
      const b = chambers[Math.floor(rnd() * chambers.length)];
      if (a !== b && Math.hypot(a.x - b.x, a.z - b.z) < 110) this.tunnel(a, b, 1.6 + rnd(), rnd);
    }
    // becos sem saída
    for (let k = 0; k < 8; k++) {
      const a = chambers[Math.floor(rnd() * chambers.length)];
      const ang = rnd() * TAU;
      const b = { x: clamp(a.x + Math.cos(ang) * 40, -R + 15, R - 15), z: clamp(a.z + Math.sin(ang) * 40, -R + 15, R - 15) };
      if (Math.hypot(b.x - mine.x, b.z - mine.z) < 40) continue;
      this.tunnel(a, b, 1.4 + rnd(), rnd);
    }
    for (const c of chambers) {
      for (let k = 0; k < 4; k++) {
        const a = rnd() * TAU;
        const d = c.r * 0.45 * rnd();
        this.stamp(c.x + Math.cos(a) * d, c.z + Math.sin(a) * d, c.r * (0.55 + rnd() * 0.45), c.h);
      }
    }
    // poças: na câmara inicial e em duas outras
    this.pools = [{ x: spawnC.x - 4, z: spawnC.z + 3, r: 5 }];
    for (const c of chambers.slice(3, 5)) this.pools.push({ x: c.x, z: c.z, r: c.r * 0.5 });
    for (const p of this.pools) this.stamp(p.x, p.z, p.r, 0, 1.1);
    // área de mineração: só por um túnel estreito e reto, tapado com tábuas
    this.stamp(mine.x, mine.z, mine.r, mine.h);
    this.stamp(mine.x + 6, mine.z + 4, mine.r * 0.7, mine.h);
    const ta = { x: preMine.x - preMine.r + 1, z: preMine.z - 2 };
    const tb = { x: mine.x + mine.r - 2, z: mine.z + 4 };
    const L = Math.hypot(tb.x - ta.x, tb.z - ta.z);
    for (let k = 0; k <= L / 0.6; k++) {
      const t = (k * 0.6) / L;
      this.stamp(ta.x + (tb.x - ta.x) * t, ta.z + (tb.z - ta.z) * t, 1.25, 2.6);
    }
    const dir = { x: (tb.x - ta.x) / L, z: (tb.z - ta.z) / L };
    this.boards = { x: ta.x + dir.x * 3, z: ta.z + dir.z * 3, dx: dir.x, dz: dir.z, open: false };
    this.mine = mine;
    this.base = base;
    this.preMine = preMine;
    this.chambers = chambers;
    // alturas finais
    this.fl = new Float32Array(N * N);
    this.ce = new Float32Array(N * N);
    this.w = new Float32Array(N * N);
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const id = j * N + i;
        const x = i * G - R;
        const z = j * G - R;
        const n = fbm(x * 0.06, z * 0.06, 3, this.seed + 7);
        const w = smoothstep(0.25, 0.75, this.open[id]);
        this.w[id] = w;
        const f = n * 0.9 - this.drop[id];
        const c = Math.max(f + 2.6, n * 0.9 + 2.6 + this.hc[id] * 0.6 + fbm(x * 0.15, z * 0.15, 2, this.seed + 9) * 0.8);
        const mid = (f + c) / 2;
        // rocha: piso sobe e teto desce até se encontrarem
        this.fl[id] = f + (1 - w) * (mid - f + 0.6);
        this.ce[id] = c - (1 - w) * (c - mid + 0.6);
      }
    this.spawn = { x: spawnC.x + 3, z: spawnC.z - 2, yaw: Math.PI * 0.75 };
    this.exit = { x: mine.x - mine.r + 1.5, z: mine.z - 2 };
  }

  floorAt(x, z) {
    return this.sample(this.fl, x, z);
  }

  ambientAt(x, y, z) {
    const v = (this._amb = this._amb || new THREE.Vector3());
    const d = Math.hypot(x - this.base.x, z - this.base.z);
    return d < 20 ? v.set(0.55, 0.45, 0.32) : v.set(0.08, 0.08, 0.09);
  }

  // ------------------------------------------------------------ malhas
  async preload(px, pz, progress) {
    const Q = this.Q;
    const tick = async (f) => {
      if (progress) progress(f);
      await new Promise((r) => setTimeout(r, 0));
    };
    const rock = getTex('l88Rock', Q.tex);
    const mud = getTex('l88Mud', Q.tex);
    this.M = {
      floor: litMaterial(Q, { map: mud.map, normalMap: rock.normalMap, vertexColors: true, roughness: 0.75, normalScale: 1.5 }),
      rock: litMaterial(Q, { map: rock.map, normalMap: rock.normalMap, vertexColors: true, roughness: 0.85, normalScale: 1.5, side: THREE.DoubleSide }),
      props: litMaterial(Q, { vertexColors: true, roughness: 0.7 }),
      wood: litMaterial(Q, { map: getTex('planks', Math.min(Q.tex, 512)).map, vertexColors: true, roughness: 0.8 }),
      glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    };
    const step = Q.id === 'low' ? 1.5 : 1;
    this.floorMesh = this.surface(step, true);
    await tick(0.3);
    this.ceilMesh = this.surface(step, false);
    await tick(0.55);
    this.buildRocks();
    await tick(0.65);
    this.buildWater();
    this.buildBase();
    await tick(0.8);
    this.buildMine();
    this.spawnItems();
    await tick(1);
  }

  surface(step, floor) {
    const n = Math.floor((2 * R) / step) + 1;
    const pos = new Float32Array(n * n * 3);
    const col = new Float32Array(n * n * 3);
    const uv = new Float32Array(n * n * 2);
    const H = new Float32Array(n * n);
    const src = floor ? this.fl : this.ce;
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const x = i * step - R;
        const z = j * step - R;
        const id = j * n + i;
        const y = this.sample(src, x, z);
        H[id] = y;
        pos.set([x, y, z], id * 3);
        uv.set([x / 4, z / 4], id * 2);
        const w = this.sample(this.w, x, z);
        const wet = floor ? clamp((WATER + 0.3 - y) * 1.5, 0, 0.5) : 0;
        const k = (floor ? 0.62 + 0.25 * w : 0.5) * (1 - wet) * (0.85 + hash3(i, j, 11) * 0.15);
        col.set([k, k * 0.97, k * 0.92], id * 3);
      }
    const idx = [];
    for (let j = 0; j < n - 1; j++)
      for (let i = 0; i < n - 1; i++) {
        const a = j * n + i;
        // só onde há caverna perto (economiza triângulos)
        const x = i * step - R;
        const z = j * step - R;
        if (this.sample(this.w, x + step / 2, z + step / 2) < 0.02 && this.sample(this.open, x + step / 2, z + step / 2) < 0.02) continue;
        if (floor) idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
        else idx.push(a, a + 1, a + n, a + 1, a + n + 1, a + n);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, floor ? this.M.floor : this.M.rock);
    m.matrixAutoUpdate = false;
    this.scene.add(m);
    return m;
  }

  // Estalactites e estalagmites (uma malha por tipo, com instâncias).
  buildRocks() {
    const rnd = mulberry32(this.seed + 21);
    const n = this.Q.id === 'low' ? 500 : 1100;
    const tites = [];
    const mites = [];
    for (let k = 0; k < n * 4 && tites.length + mites.length < n; k++) {
      const x = (rnd() - 0.5) * 2 * R;
      const z = (rnd() - 0.5) * 2 * R;
      const w = this.sample(this.w, x, z);
      if (w < 0.7) continue;
      const f = this.floorAt(x, z);
      const c = this.sample(this.ce, x, z);
      if (c - f < 3) continue;
      if (Math.hypot(x - this.base.x, z - this.base.z) < 18 || Math.hypot(x - this.mine.x, z - this.mine.z) < 14) continue;
      const s = 0.3 + Math.pow(rnd(), 2) * 1.6;
      if (rnd() < 0.6) tites.push([x, c, z, s]);
      else if (f > WATER + 0.1 && Math.hypot(x - this.spawn.x, z - this.spawn.z) > 3) {
        mites.push([x, f, z, s]);
        if (s > 0.5) this.circles.push([x, z, s * 0.28 + 0.1]);
      }
    }
    const cone = new THREE.ConeGeometry(0.35, 1, 7, 2);
    const p = cone.attributes.position;
    for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * (1 + Math.sin(p.getY(i) * 9) * 0.12));
    cone.computeVertexNormals();
    const make = (list, down) => {
      const m = new THREE.InstancedMesh(cone, this.M.rock, list.length);
      const mat = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      list.forEach(([x, y, z, s], i) => {
        q.setFromEuler(new THREE.Euler(down ? Math.PI : 0, rnd() * TAU, 0));
        const h = s * (down ? 2.2 : 1.6);
        mat.compose(new THREE.Vector3(x, y + (down ? -h / 2 + 0.1 : h / 2 - 0.1), z), q, new THREE.Vector3(s, h, s));
        m.setMatrixAt(i, mat);
      });
      const cols = new Float32Array(list.length * 3).fill(0.75);
      m.instanceColor = new THREE.InstancedBufferAttribute(cols, 3);
      this.scene.add(m);
      return m;
    };
    this.cone = cone;
    this.tites = make(tites, true);
    this.mites = make(mites, false);
  }

  buildWater() {
    this.waterMat = new THREE.MeshStandardMaterial({ color: 0x050a0c, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.85 });
    this.waters = this.pools.map((p) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(p.r + 2.5, 32).rotateX(-Math.PI / 2), this.waterMat);
      m.position.set(p.x, WATER, p.z);
      this.scene.add(m);
      return m;
    });
  }

  // ------------------------------------------------------------ base da M.E.G.
  buildBase() {
    const b = this.base;
    const gb = new GeoBuilder();
    const wb = new GeoBuilder();
    const glow = new GeoBuilder();
    const y = (x, z) => this.floorAt(x, z);
    const rnd = mulberry32(this.seed + 51);
    // piso de pallets
    for (let i = -3; i <= 3; i++)
      for (let k = -2; k <= 2; k++) {
        const x = b.x + i * 1.25;
        const z = b.z + k * 1.25;
        wb.box(x, y(x, z) + 0.06, z, 1.2, 0.12, 1.2, [0.8, 0.7, 0.55], null, { uvScale: 0.5 });
      }
    // barracas (prismas de lona verde-oliva)
    const tents = [
      [b.x - 9, b.z - 5, 0.3],
      [b.x - 8, b.z + 6, -0.4],
      [b.x + 9, b.z + 5, 2.6],
    ];
    for (const [x, z, a] of tents) {
      const fy = y(x, z);
      const m = new THREE.Matrix4().makeRotationY(a).setPosition(x, fy + 1.1, z);
      const g = new THREE.CylinderGeometry(1.6, 1.6, 4, 3, 1).rotateZ(Math.PI / 2).rotateX(Math.PI / 2 + Math.PI / 6);
      gb.addGeometry(g, m, [0.32, 0.36, 0.22]);
      this.circles.push([x, z, 1.9]);
    }
    // caixas, barris, gerador
    for (let k = 0; k < 10; k++) {
      const a = rnd() * TAU;
      const r = 6 + rnd() * 6;
      const x = b.x + Math.cos(a) * r;
      const z = b.z + Math.sin(a) * r;
      if (tents.some((t) => Math.hypot(t[0] - x, t[1] - z) < 3)) continue;
      const s = 0.6 + rnd() * 0.5;
      if (rnd() < 0.6) wb.box(x, y(x, z) + s / 2, z, s * 1.4, s, s, [0.75, 0.6, 0.4], null, { rot: rnd() * 3 });
      else gb.cylinder(x, y(x, z) + 0.45, z, 0.3, 0.9, [0.25, 0.3, 0.45], null, { sides: 12 });
      this.circles.push([x, z, s * 0.8]);
    }
    const gx = b.x + 5;
    const gz = b.z - 6;
    gb.box(gx, y(gx, gz) + 0.5, gz, 1.6, 1.0, 1.0, [0.75, 0.55, 0.1], null, {});
    gb.box(gx, y(gx, gz) + 1.05, gz, 1.2, 0.1, 0.7, [0.2, 0.2, 0.2], null, {});
    this.circles.push([gx, gz, 1.1]);
    // mesa com mapas e rádio
    const tx = b.x + 1;
    const tz = b.z + 1;
    const ty = y(tx, tz);
    wb.box(tx, ty + 0.75, tz, 2.2, 0.06, 1.1, [0.7, 0.55, 0.38], null, {});
    for (const [dx, dz] of [
      [-1, -0.5],
      [1, -0.5],
      [-1, 0.5],
      [1, 0.5],
    ])
      gb.box(tx + dx, ty + 0.37, tz + dz, 0.05, 0.74, 0.05, [0.3, 0.3, 0.3], null, {});
    gb.box(tx - 0.4, ty + 0.79, tz, 1.0, 0.01, 0.7, [0.85, 0.82, 0.7], null, {});
    gb.box(tx + 0.7, ty + 0.9, tz - 0.2, 0.35, 0.25, 0.2, [0.15, 0.17, 0.14], null, {});
    glow.box(tx + 0.7, ty + 0.92, tz - 0.09, 0.12, 0.05, 0.02, [0.3, 2, 0.5], null, {});
    this.circles.push([tx, tz, 1.3]);
    this.table = { x: tx, z: tz };
    // lâmpadas de obra em tripés e um varal de lâmpadas
    const lamps = [
      [b.x - 4, b.z - 1],
      [b.x + 4, b.z + 2],
    ];
    this.baseLights = [];
    for (const [x, z] of lamps) {
      const fy = y(x, z);
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * TAU;
        const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3)).setPosition(x + Math.cos(a) * 0.3, fy + 0.9, z + Math.sin(a) * 0.3);
        gb.addGeometry(new THREE.CylinderGeometry(0.02, 0.02, 1.9, 5), m, [0.2, 0.2, 0.2]);
      }
      gb.box(x, fy + 1.9, z, 0.4, 0.3, 0.2, [0.75, 0.55, 0.1], null, {});
      glow.box(x, fy + 1.9, z + 0.11, 0.32, 0.22, 0.02, [3, 2.6, 1.8], null, {});
      const l = new THREE.PointLight(0xffd8a0, 30, 30, 1.5);
      l.position.set(x, fy + 2.1, z + 0.4);
      this.scene.add(l);
      this.baseLights.push(l);
      this.circles.push([x, z, 0.45]);
    }
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * TAU;
      const x = b.x + Math.cos(a) * 10;
      const z = b.z + Math.sin(a) * 10;
      glow.box(x, y(x, z) + 2.8 + Math.sin(k * 1.7) * 0.2, z, 0.08, 0.1, 0.08, [2.4, 2.0, 1.2], null, {});
    }
    this.add(gb, this.M.props);
    this.add(wb, this.M.wood);
    this.add(glow, this.M.glow);
    // faixa da M.E.G.
    this.banner = textCanvasTex(512, 160, (c, w, h) => {
      c.fillStyle = '#16233a';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#e8eef8';
      c.font = 'bold 76px Arial, Helvetica, sans-serif';
      c.textAlign = 'center';
      c.fillText('M.E.G.', w / 2, 80);
      c.font = '26px Arial, Helvetica, sans-serif';
      c.fillStyle = '#9fc0e8';
      c.fillText('POSTO DE PESQUISA · NÍVEL 8', w / 2, 128);
    });
    const bm = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.0), new THREE.MeshLambertMaterial({ map: this.banner, side: THREE.DoubleSide, emissive: 0x101820 }));
    bm.position.set(b.x - 8.5, y(b.x - 8.5, b.z - 5) + 2.6, b.z - 5);
    bm.rotation.y = 0.3;
    this.dynamic.add(bm);
    this.bannerMesh = bm;
    // tripulantes
    const crew = [
      { id: 'rios', name: 'Capitã Rios', role: 'Líder do posto', x: tx - 1.5, z: tz + 1.2, yaw: Math.PI * 0.8, look: { skin: '#9a6a48', hair: '#1a1410', hairStyle: 'bun', suit: '#2c3a52', accent: '#e0b040', female: true, arms: 'crossed' } },
      { id: 'ito', name: 'Dra. Hana Ito', role: 'Geóloga', x: tx + 2.2, z: tz - 0.5, yaw: -Math.PI / 2, look: { skin: '#e8c8a8', hair: '#101010', hairStyle: 'short', suit: '#6a5a3a', accent: '#8ad0ff', female: true, arms: 'tablet', holds: { kind: 'tablet', hand: 'l' }, glasses: '#202020' } },
      { id: 'kova', name: 'Sargento Kovač', role: 'Segurança', x: b.x + 2, z: b.z - 7, yaw: Math.PI, look: { skin: '#d8b090', hair: '#5a4030', hairStyle: 'shaved', suit: '#3a4030', accent: '#c05030', arms: 'behind', beard: 'rgba(80,60,40,0.6)' } },
      { id: 'teo', name: 'Téo', role: 'Técnico', x: gx - 1.2, z: gz + 0.8, yaw: Math.PI / 2, pose: 'sit', look: { skin: '#7a4a32', hair: '#1a1410', hairStyle: 'curly', suit: '#4a4a52', accent: '#f0a020', arms: 'desk' } },
    ];
    for (const d of crew) {
      const npc = new NPC(this, { ...d, h: 1.75 });
      npc.root.position.y = this.floorAt(d.x, d.z);
      this.npcs.push(npc);
    }
  }

  add(gb, mat) {
    if (gb.empty) return null;
    const m = new THREE.Mesh(gb.build(), mat);
    m.matrixAutoUpdate = false;
    this.dynamic.add(m);
    return m;
  }

  // ------------------------------------------------------------ mineração
  buildMine() {
    const M = this.mine;
    const gb = new GeoBuilder();
    const wb = new GeoBuilder();
    const glow = new GeoBuilder();
    const y = (x, z) => this.floorAt(x, z);
    const rnd = mulberry32(this.seed + 61);
    const B = this.boards;
    // tábuas pregadas tapando a fenda
    this.boardGroup = new THREE.Group();
    const bw = new GeoBuilder();
    const by = y(B.x, B.z);
    for (let k = 0; k < 6; k++) bw.box(0, by + 0.3 + k * 0.38, 0, 2.8, 0.22, 0.05, [0.7 + rnd() * 0.2, 0.55, 0.4], null, { rot: 0 });
    bw.box(-0.6, by + 1.2, 0.04, 0.12, 2.4, 0.05, [0.5, 0.4, 0.3], null, {});
    bw.box(0.7, by + 1.2, 0.04, 0.12, 2.4, 0.05, [0.5, 0.4, 0.3], null, {});
    const bm = new THREE.Mesh(bw.build(), this.M.wood);
    bm.rotation.z = 0;
    this.boardGroup.add(bm);
    this.boardGroup.position.set(B.x, 0, B.z);
    this.boardGroup.rotation.y = Math.atan2(B.dx, B.dz);
    this.dynamic.add(this.boardGroup);
    // vigas de madeira ao longo do túnel e na câmara
    const L = Math.hypot(M.x + M.r - 2 - B.x, M.z + 4 - B.z);
    for (let s = 4; s < L; s += 3) {
      const x = B.x + B.dx * s;
      const z = B.z + B.dz * s;
      const fy = y(x, z);
      const px = -B.dz;
      const pz = B.dx;
      for (const sd of [-1, 1]) wb.box(x + px * sd * 1.0, fy + 1.15, z + pz * sd * 1.0, 0.18, 2.3, 0.18, [0.6, 0.48, 0.35], null, {});
      const m = new THREE.Matrix4().makeRotationY(Math.atan2(px, pz)).setPosition(x, fy + 2.3, z);
      wb.addGeometry(new THREE.BoxGeometry(0.18, 0.18, 2.3), m, [0.6, 0.48, 0.35]);
      glow.box(x, fy + 2.1, z, 0.1, 0.14, 0.1, rnd() < 0.3 ? [0.1, 0.08, 0.05] : [2.4, 1.6, 0.6], null, {});
    }
    // trilhos e vagonete
    for (let s = -8; s < 10; s += 0.6) {
      const x = M.x + s;
      const z = M.z + 2;
      wb.box(x, y(x, z) + 0.05, z, 0.12, 0.08, 1.4, [0.45, 0.35, 0.25], null, {});
    }
    for (const dz of [-0.5, 0.5]) {
      const m = new THREE.Matrix4().makeTranslation(M.x + 1, y(M.x, M.z + 2) + 0.12, M.z + 2 + dz);
      gb.addGeometry(new THREE.BoxGeometry(18, 0.05, 0.05), m, [0.35, 0.33, 0.32]);
    }
    const cx = M.x + 3;
    const cz = M.z + 2;
    const cy = y(cx, cz);
    gb.box(cx, cy + 0.65, cz, 1.6, 0.8, 1.1, [0.32, 0.25, 0.2], null, {});
    gb.box(cx, cy + 1.0, cz, 1.4, 0.3, 0.9, [0.2, 0.18, 0.16], null, {});
    for (const [dx, dz] of [
      [-0.55, -0.6],
      [0.55, -0.6],
      [-0.55, 0.6],
      [0.55, 0.6],
    ])
      gb.cylinder(cx + dx, cy + 0.2, cz + dz, 0.18, 0.1, [0.15, 0.15, 0.15], null, { axis: 'z', sides: 10 });
    this.circles.push([cx, cz, 1.0]);
    // picaretas, pás, lampiões e veios de minério brilhante
    for (let k = 0; k < 4; k++) {
      const x = M.x - 4 + k * 2;
      const z = M.z - 5;
      const fy = y(x, z);
      const m = new THREE.Matrix4().makeRotationZ(0.35).setPosition(x, fy + 0.6, z);
      wb.addGeometry(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 5), m, [0.55, 0.42, 0.3]);
      gb.box(x - 0.2, fy + 1.15, z, 0.5, 0.06, 0.06, [0.4, 0.4, 0.42], null, {});
    }
    for (let k = 0; k < 18; k++) {
      const a = rnd() * TAU;
      const x = M.x + Math.cos(a) * (M.r - 0.5);
      const z = M.z + Math.sin(a) * (M.r - 0.5);
      glow.box(x, y(x, z) + 0.8 + rnd() * 2.5, z, 0.12 + rnd() * 0.2, 0.06, 0.12, [0.2, 1.4, 1.6], null, { rot: rnd() * 3 });
    }
    // porta de madeira na parede oeste
    const ex = this.exit.x;
    const ez = this.exit.z;
    const ey = y(ex, ez);
    wb.box(ex - 0.35, ey + 1.2, ez, 0.12, 2.4, 1.3, [0.6, 0.45, 0.3], null, {});
    wb.box(ex - 0.3, ey + 2.45, ez, 0.25, 0.2, 1.7, [0.45, 0.35, 0.25], null, {});
    for (const s of [-1, 1]) wb.box(ex - 0.3, ey + 1.2, ez + s * 0.75, 0.25, 2.5, 0.2, [0.45, 0.35, 0.25], null, {});
    gb.box(ex - 0.25, ey + 1.1, ez + 0.45, 0.08, 0.08, 0.08, [0.6, 0.5, 0.2], null, {});
    glow.box(ex + 0.2, ey + 2.3, ez - 0.95, 0.12, 0.16, 0.12, [2.6, 1.7, 0.6], null, {});
    this.add(gb, this.M.props);
    this.add(wb, this.M.wood);
    this.add(glow, this.M.glow);
    this.mineLight = new THREE.PointLight(0xffb060, 22, 26, 1.5);
    this.mineLight.position.set(M.x, y(M.x, M.z) + 3, M.z);
    this.scene.add(this.mineLight);
    // lampião pendurado ao lado da porta de madeira
    this.doorLight = new THREE.PointLight(0xffa850, 10, 9, 1.6);
    this.doorLight.position.set(this.exit.x + 1.2, y(this.exit.x, this.exit.z) + 2.4, this.exit.z);
    this.scene.add(this.doorLight);
  }

  spawnItems() {
    const g = this.game;
    const rnd = mulberry32(this.seed + 71);
    let n = 0;
    for (const c of this.chambers) {
      if (rnd() < 0.5) continue;
      const x = c.x + (rnd() - 0.5) * c.r;
      const z = c.z + (rnd() - 0.5) * c.r;
      if (this.sample(this.w, x, z) < 0.8 || this.floorAt(x, z) < WATER + 0.05) continue;
      const type = n % 3 === 1 ? 'note' : 'water';
      g.items.spawn({ type, key: `8:${n}`, x, z, y: this.floorAt(x, z) + 0.02, rot: rnd() * 6, light: 0.3 }, this.dynamic);
      n++;
    }
  }

  // ------------------------------------------------------------ conversa
  talk(npc) {
    const g = this.game;
    const hud = g.hud;
    this.talking = npc;
    const say = (t, c) => hud.dialog(`${npc.name} · ${npc.role}`, t, c, npc.portrait);
    const back = { text: 'Outra pergunta…', fn: () => this.talk(npc) };
    const bye = { text: 'Até mais.', fn: () => hud.closeDialog() };
    const L = {
      rios: [
        'Um andarilho vivo! Bem-vindo ao Posto Oito da M.E.G. Fique perto das luzes. Lá fora, no escuro, as coisas que vivem nas paredes não gostam de visita.',
        [
          { text: 'O que vocês fazem aqui?', fn: () => say('Mapeamos as cavernas, medimos o ar, catalogamos o que se mexe. Três equipes já sumiram tentando chegar ao fundo. Nós ficamos aqui, na luz, e anotamos.', [back, bye]) },
          {
            text: 'Como eu saio do Nível 8?',
            fn: () =>
              say(
                'Há uma área de mineração antiga, a sudoeste. Alguém pregou tábuas na fenda que leva até lá. Atrás delas, os mineiros deixaram uma porta de madeira. Quem atravessa sai num bairro à meia-noite: o Nível 9.',
                [back, bye],
              ),
          },
          bye,
        ],
      ],
      ito: [
        'Olhe isso: calcário que cresce dois centímetros por dia. As estalactites aqui são mais novas que eu. A caverna está viva, de algum jeito.',
        [
          { text: 'Viva?', fn: () => say('Os túneis mudam. Devagar, mas mudam. Por isso nossos mapas têm data e hora. O de hoje mostra a fenda das tábuas a sudoeste, depois de uma câmara pequena.', [back, bye]) },
          { text: 'Tem água boa?', fn: () => say('As poças são paradas e geladas. Não beba. Se achar Água de Amêndoa pelas câmaras, guarde: ela ajuda a cabeça a não ceder ao escuro.', [back, bye]) },
          bye,
        ],
      ],
      kova: [
        'Alto. …Humano. Tudo bem. Desculpe, aqui a gente aprende a desconfiar de quem chega andando no escuro.',
        [
          { text: 'Do que vocês se protegem?', fn: () => say('Coisas que se arrastam no teto. Aranhas do tamanho de um cachorro, dizem. Eu nunca vi uma de perto, e pretendo continuar assim. Não apague a lanterna.', [back, bye]) },
          { text: 'E a área de mineração?', fn: () => say('Tapada com tábuas. Eu mesmo preguei algumas. Se for passar, arranque e siga a linha de vigas. No fim tem uma porta. Não volte por ela.', [back, bye]) },
          bye,
        ],
      ],
      teo: [
        'Esse gerador é a única coisa entre a gente e o breu. Se ele tossir, todo mundo corre pra barraca. Quer ajudar? Não. Ninguém quer.',
        [
          { text: 'Há quanto tempo vocês estão aqui?', fn: () => say('Pelo relógio, seis semanas. Pelo cansaço, uns três anos. O tempo aqui embaixo é estranho, igual em todo lugar dos Bastidores.', [back, bye]) },
          bye,
        ],
      ],
    }[npc.id];
    g.audio.play('beep', { gain: 0.03, rate: 1.2 });
    say(L[0], L[1]);
  }

  // ------------------------------------------------------------ quadro
  update(dt, player) {
    const g = this.game;
    const p = player.pos;
    this.time = (this.time || 0) + dt;
    const t = this.time;
    if (!this.toldStart) {
      this.toldStart = true;
      setTimeout(() => g.level === this && g.hud.message('Você sai da água gelada tossindo. Breu total. Só a lanterna corta o escuro.', 5), 600);
    }
    if (!g.hud.dialogOpen) this.talking = null;
    for (const npc of this.npcs) {
      npc.update(dt, player, t, this.talking === npc);
      npc.root.position.y = this.floorAt(npc.x, npc.z);
    }
    for (const l of this.baseLights) l.intensity = 30 * (0.92 + Math.sin(t * 13 + l.position.x) * 0.04 + (Math.random() < 0.01 ? -0.4 : 0));
    const db = Math.hypot(p.x - this.base.x, p.z - this.base.z);
    if (db < 16 && !g.objectiveDone('base')) g.completeObjective('base', 'Luzes de obra, barracas e vozes humanas: o posto de pesquisa da M.E.G.');
    // perto da base, a sanidade se recupera; longe da luz, cai mais
    this.sanityExtra = db < 14 ? -1.0 : player.flashOn ? 0 : 0.35;
    // sons de coisas se arrastando no escuro
    this.scuttle = (this.scuttle || 12) - dt;
    if (this.scuttle <= 0) {
      this.scuttle = 10 + Math.random() * 18;
      if (db > 25) {
        g.audio.play('crackle', { gain: 0.12, rate: 0.4 + Math.random() * 0.3, pan: Math.random() * 2 - 1, wet: 1.6 });
        if (Math.random() < 0.3) g.audio.play('growl', { gain: 0.06, rate: 1.6, pan: Math.random() * 2 - 1, wet: 2 });
      }
    }
    if (!this.mineTold && Math.hypot(p.x - this.mine.x, p.z - this.mine.z) < this.mine.r + 3) {
      this.mineTold = true;
      g.completeObjective('mine', 'Vigas de madeira, trilhos, um vagonete e veios azuis brilhando na rocha. A área de mineração.');
    }
    // na água: frio e lento
    const wet = this.floorAt(p.x, p.z) < WATER;
    this.walkSpeed = wet ? 1.3 : 2.1;
  }

  collide(p, r) {
    const o = this.okP || { x: this.spawn.x, z: this.spawn.z };
    for (let it = 0; it < 2; it++) {
      for (const c of this.circles) {
        const dx = p.x - c[0];
        const dz = p.z - c[1];
        if (Math.abs(dx) > c[2] + 1 || Math.abs(dz) > c[2] + 1) continue;
        const d = Math.hypot(dx, dz);
        const rr = r + c[2];
        if (d < rr && d > 1e-4) {
          p.x = c[0] + (dx / d) * rr;
          p.z = c[1] + (dz / d) * rr;
        }
      }
      for (const n of this.npcs) pushCircle(p, r, n.x - 0.25, n.x + 0.25, n.z - 0.25, n.z + 0.25);
      if (!this.boards.open) {
        const B = this.boards;
        const lx = (p.x - B.x) * B.dz - (p.z - B.z) * B.dx;
        const lz = (p.x - B.x) * B.dx + (p.z - B.z) * B.dz;
        if (Math.abs(lx) < 1.6 && lz > -0.4 && lz < 0.4) {
          const push = lz < 0 ? -0.4 - lz : 0.4 - lz;
          p.x += B.dx * push;
          p.z += B.dz * push;
        }
      }
    }
    // rocha: onde a caverna fecha (ou o chão sobe demais), volta pelo eixo livre
    const ok = (x, z) => this.sample(this.w, x, z) > 0.55 && this.sample(this.ce, x, z) - this.floorAt(x, z) > 1.9;
    if (!ok(p.x, p.z)) {
      if (ok(p.x, o.z)) p.z = o.z;
      else if (ok(o.x, p.z)) p.x = o.x;
      else {
        p.x = o.x;
        p.z = o.z;
      }
    }
    this.okP = { x: p.x, z: p.z };
    return p;
  }

  groundY(x, z) {
    return Math.max(this.floorAt(x, z), WATER - 0.45);
  }

  surfaceAt(x, z) {
    return this.floorAt(x, z) < WATER ? 'mud' : 'concrete';
  }

  los() {
    return true;
  }

  lightLevel(x, z) {
    return Math.hypot(x - this.base.x, z - this.base.z) < 14 ? 1 : 0.05;
  }

  interactable(player) {
    const p = player.pos;
    const g = this.game;
    if (this.talking && g.hud.dialogOpen) return null;
    for (const n of this.npcs) if (Math.hypot(p.x - n.x, p.z - n.z) < 1.9) return { label: `Falar com ${n.name}`, action: () => this.talk(n) };
    const B = this.boards;
    if (!B.open && Math.hypot(p.x - B.x, p.z - B.z) < 2) {
      return {
        label: 'Arrancar as tábuas',
        action: () => {
          B.open = true;
          g.audio.play('door', { gain: 0.6, rate: 0.6 });
          g.audio.play('crackle', { gain: 0.4, rate: 0.8 });
          g.vibrate(120);
          this.boardGroup.rotation.x = 0;
          this.boardGroup.position.y = -0.1;
          this.boardGroup.children[0].rotation.x = -1.45;
          this.boardGroup.children[0].position.z = 0.6;
          g.hud.message('As tábuas cedem com um estalo. Atrás delas, um túnel estreito sustentado por vigas, sumindo no escuro.', 5);
        },
      };
    }
    const e = this.exit;
    if (Math.hypot(p.x - e.x, p.z - e.z) < 1.7) {
      return {
        label: 'Abrir a porta de madeira',
        action: () => {
          g.completeObjective('door', 'A porta range. Do outro lado, ar frio da noite e um poste falhando.');
          g.reachExit('door', 0.8);
        },
      };
    }
    return null;
  }

  navTarget() {
    const g = this.game;
    if (!g.objectiveDone('base')) return this.base;
    if (!this.boards.open) return this.boards;
    return this.exit;
  }

  exitEmitter() {
    return { x: this.base.x + 5, y: 1, z: this.base.z - 6, sound: 'machine', gain: 0.5 };
  }

  dispose() {
    for (const n of this.npcs) n.dispose();
    for (const m of [this.floorMesh, this.ceilMesh, this.tites, this.mites, ...this.waters]) {
      this.scene.remove(m);
      m.geometry.dispose();
    }
    this.cone.dispose();
    this.waterMat.dispose();
    for (const l of [...this.baseLights, this.mineLight, this.doorLight]) this.scene.remove(l);
    this.dynamic.traverse((o) => o.geometry && o.geometry.dispose());
    this.bannerMesh.material.dispose();
    this.banner.dispose();
    for (const k in this.M) this.M[k].dispose();
    this.scene.remove(this.dynamic, this.hemi);
    this.scene.background = null;
  }
}
