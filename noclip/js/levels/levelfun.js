// Nível Fun =) — A Festa: salas amarelas ligadas por arcos, carpete vinho com
// confete, desenhos de giz de cera, varais de luzes coloridas, balões, mesas de
// festa e presentes. Os Festeiros vagam pelas salas. Saída: a porta FUN EXIT,
// trancada com três cadeados (as chaves estão nos presentes de fita dourada).
import * as THREE from 'three';
import { Level } from '../level.js';
import { Grid, WALL, LINTEL, EMPTY } from '../grid.js';
import { connect, bfs, scatterStains, atlasRect } from '../layout.js';
import { K_WALL, quadPoint, GeoBuilder } from '../build.js';
import { rng, clamp, lerp, smoothstep } from '../util.js';
import { addPickup, partyTable, chair, doorOnWall, makeItem, sparkle } from '../props.js';
import { gameMaterial, setProbe } from '../materials.js';
import { Partygoer } from '../entities/partygoer.js';
import { Nav } from '../entities/nav.js';
import { t } from '../i18n.js';

const BULBS = [
  [1, 0.12, 0.1],
  [0.15, 1, 0.2],
  [0.15, 0.3, 1],
  [1, 0.8, 0.1],
  [1, 0.2, 0.75],
  [0.1, 0.9, 1],
];
const BALLOONS = [0xd8222a, 0x2a5fd8, 0x2fb04a, 0xe8c11e, 0xd0389a, 0xf07a1c, 0x7b3fd0];
const CLOTHS = [0x2f9e6a, 0x2aa3a8, 0x4fae4a, 0x6a8fd8];
const WRAP = [0xc8202a, 0x2246b8, 0x1f8a3c, 0x7a2fb0, 0xd6408c, 0x158a8a];

export class LevelFun extends Level {
  constructor(game) {
    super(game, { w: 100, h: 100, H: 3.0, doorH: 2.35, seed: 3301 });
    this.id = 2;
    this.surf = {
      floor: { tex: 'fun_carpet', scale: 2, normalScale: 1.0, macro: 0.12 },
      wall: { tex: 'fun_wall', scale: 2, normalScale: 0.6, macro: 0.1, grime: [0.2, 0.6, 0.3] },
      ceil: { tex: 'ceiling', scale: 1.2, normalScale: 0.8, macro: 0.1 },
      soffit: { color: 0xd98a78, roughness: 0.8, macro: 0.05 },
      trim: { color: 0x2a1a14, h: 0.12, roughness: 0.5 },
    };
    this.fog = { color: 0x0d0806, density: 0.04 };
    this.grade = { exposure: 1.0, tint: [1.03, 0.99, 0.93], lift: [0.012, 0.004, 0.012], sat: 1.04, contrast: 1.06, bloom: 0.45, ca: 0.03, grain: 0.065 };
    this.bakeParams.floorAlb = [0.17, 0.1, 0.1];
    this.bakeParams.ind = [0.8, 1.0, 0.6];
    this.bakeParams.wallAlb = [0.55, 0.45, 0.16];
    this.bakeParams.ambient = [0.006, 0.004, 0.005];
    this.panelGlow = 4.5;
    this.envOpts = { wall: 0x6e5a28, floor: 0x3a1418, ceil: 0x4a463a };
    this.rr = rng((Math.random() * 1e9) | 0);
    this.glitchNear = 0.18;
    this.music = 0.6;
    this.keys = 0;
    this.unlocked = 0;
    this.balloons = [];
    this.bulbs = [];
    this.presents = [];
    this.arches = [];
  }

  async build(onProgress) {
    const g = (this.grid = new Grid(this.dims.w, this.dims.h, { H: this.H, doorH: this.doorH }));
    const r = this.r;
    g.rect(0, 0, g.w - 1, g.h - 1, WALL);
    g.rect(1, 1, g.w - 2, g.h - 2, EMPTY);
    // salas por partição binária; cada parede de corte ganha um arco
    const rooms = [];
    const split = (x0, z0, x1, z1, depth) => {
      const w = x1 - x0 + 1, h = z1 - z0 + 1;
      const can = Math.max(w, h) > 26 || (depth < 3 && Math.max(w, h) > 18 && r.chance(0.8));
      if (!can) {
        rooms.push({ x0, z0, x1, z1 });
        return;
      }
      const vert = w > h ? true : w < h ? false : r.chance(0.5);
      const hits = (v, s) => this.arches.some((a) => a.v !== v && (a.line === (v ? z0 - 1 : x0 - 1) || a.line === (v ? z1 + 1 : x1 + 1)) && s >= a.a - 1 && s <= a.a + a.n);
      const pickS = (v, lo, hi) => {
        let s = r.int(lo, hi);
        for (let k = 0; k < 12 && hits(v, s); k++) s = r.int(lo, hi);
        return s;
      };
      if (vert) {
        const s = pickS(true, x0 + 8, x1 - 8);
        for (let z = z0; z <= z1; z++) g.set(s, z, WALL);
        this.arch(true, s, r.int(z0 + 2, z1 - 7), r.int(4, 5));
        if (h > 22 && r.chance(0.5)) this.arch(true, s, r.int(z0 + 2, z1 - 7), 4);
        split(x0, z0, s - 1, z1, depth + 1);
        split(s + 1, z0, x1, z1, depth + 1);
      } else {
        const s = pickS(false, z0 + 8, z1 - 8);
        for (let x = x0; x <= x1; x++) g.set(x, s, WALL);
        this.arch(false, s, r.int(x0 + 2, x1 - 7), r.int(4, 5));
        if (w > 22 && r.chance(0.5)) this.arch(false, s, r.int(x0 + 2, x1 - 7), 4);
        split(x0, z0, x1, s - 1, depth + 1);
        split(x0, s + 1, x1, z1, depth + 1);
      }
    };
    split(1, 1, g.w - 2, g.h - 2, 0);
    // recorta os arcos (depois das paredes, que podem ter passado por cima)
    for (const a of this.arches) for (let k = 0; k < a.n; k++) a.v ? g.set(a.line, a.a + k, LINTEL) : g.set(a.a + k, a.line, LINTEL);
    this.rooms = rooms;
    // início na sala do canto
    const start = rooms.reduce((b, rm) => (rm.x0 + rm.z0 < b.x0 + b.z0 ? rm : b));
    this.spawn = { x: g.center(start.x0 + 3), z: g.center(start.z0 + 3), yaw: -Math.PI * 0.75 };
    connect(g, r, g.cell(this.spawn.x), g.cell(this.spawn.z), 4);
    this.dist = bfs(g, g.cell(this.spawn.x), g.cell(this.spawn.z));
    // sala da saída: a mais distante
    let far = null;
    for (const rm of rooms) {
      const d = this.roomDist(rm);
      if (!far || d > far.d) far = { rm, d };
    }
    this.exitRoom = far.rm;
    // luzes e mobília por sala
    rooms.forEach((rm, i) => {
      const x0 = rm.x0 * g.cs, z0 = rm.z0 * g.cs, x1 = (rm.x1 + 1) * g.cs, z1 = (rm.z1 + 1) * g.cs;
      const W = x1 - x0, D = z1 - z0;
      const isExit = rm === this.exitRoom;
      rm.kind = isExit ? 'exit' : rm === start ? 'start' : r.pick(['hall', 'hall', 'kids', 'empty', 'hall']);
      // painéis do teto (a sala da saída só tem luzinhas)
      if (!isExit) {
        const nx = Math.max(1, Math.round(W / 3)), nz = Math.max(1, Math.round(D / 3));
        for (let a = 0; a < nx; a++)
          for (let b = 0; b < nz; b++) {
            if (rm.kind === 'kids' && r.chance(0.35)) continue;
            const x = x0 + ((a + 0.5) * W) / nx, z = z0 + ((b + 0.5) * D) / nz;
            const roll = r();
            this.panel(x, z, { rot: W > D, group: roll < 0.06 ? 1 : roll < 0.1 ? 3 : 0, broken: r.chance(0.07), I: rm.kind === 'kids' ? 4.5 : 5.5 });
          }
      }
      // varais de luzes coloridas
      if (isExit || rm.kind === 'hall' || r.chance(0.3)) {
        const n = isExit ? 4 : r.int(1, 2);
        for (let k = 0; k < n; k++) {
          const along = W > D;
          const f = (k + 1) / (n + 1);
          const a = along ? [x0 + 0.3, this.H - 0.12, z0 + D * f] : [x0 + W * f, this.H - 0.12, z0 + 0.3];
          const b = along ? [x1 - 0.3, this.H - 0.12, z0 + D * (1 - f * 0.6 - 0.2)] : [x0 + W * (1 - f * 0.6 - 0.2), this.H - 0.12, z1 - 0.3];
          this.stringLights(a, b, isExit ? 0.35 : 0.45, isExit ? 0.11 : 0.15);
        }
      }
      rm.area = W * D;
    });
    await this.finish(onProgress);
  }

  arch(v, line, a, n) {
    this.arches.push({ v, line, a, n });
  }

  // Varal de lâmpadas coloridas em catenária (luz pontual colorida no bake).
  stringLights(a, b, sag, I) {
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const n = Math.max(4, Math.floor(len / 0.32));
    const wire = this.prop('wire', { color: 0x151515, roughness: 0.6 });
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const tt = i / n;
      const p = [lerp(a[0], b[0], tt), lerp(a[1], b[1], tt) - Math.sin(tt * Math.PI) * sag, lerp(a[2], b[2], tt)];
      if (prev) {
        const dx = p[0] - prev[0], dy = p[1] - prev[1], dz = p[2] - prev[2];
        const l = Math.hypot(dx, dy, dz);
        const m = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), new THREE.Vector3(dx, dy, dz), new THREE.Vector3(0, 1, 0));
        m.setPosition((p[0] + prev[0]) / 2, (p[1] + prev[1]) / 2, (p[2] + prev[2]) / 2);
        wire.add(new THREE.BoxGeometry(0.008, 0.008, l), m);
      }
      if (i > 0 && i < n) {
        const c = BULBS[(i + Math.floor(a[0] * 7)) % BULBS.length];
        this.bulbs.push({ p: [p[0], p[1] - 0.04, p[2]], c, ph: Math.random() * 6.28 });
        // uma luz no bake a cada três lâmpadas (mais forte), com a cor média do trio
        if (i % 3 === 2) {
          const c0 = BULBS[(i - 1 + Math.floor(a[0] * 7)) % BULBS.length], c1 = BULBS[(i - 2 + Math.floor(a[0] * 7)) % BULBS.length];
          const cm = [(c[0] + c0[0] + c1[0]) / 3, (c[1] + c0[1] + c1[1]) / 3, (c[2] + c0[2] + c1[2]) / 3];
          this.light(p[0], p[1] - 0.05, p[2], I * 3, { kind: 'point', hx: 0.15, radius: 3.4, color: cm });
        }
      }
      prev = p;
    }
  }

  decorate(quads) {
    const g = this.grid, r = this.rr, rs = this.r;
    scatterStains(this, quads, { walls: 60, floor: 15, ceil: 25, H: this.H });
    this.buildArches();
    // desenhos de giz de cera nas paredes (altura de criança)
    const walls = quads.filter((q) => q.kind === K_WALL && q.base && q.lu > 1.4 && q.lv > 2);
    const dl = this.decal('drawings', { map: 'drawings.png', roughness: 0.85 });
    for (let i = 0; i < 46; i++) {
      const q = walls[Math.floor(rs() * walls.length)];
      const w = rs.range(0.7, 1.15);
      if (q.lu < w + 0.2) continue;
      const k = rs.int(0, 7);
      const c = k % 4, row = Math.floor(k / 4);
      dl.push({ q, s: w / 2 + 0.1 + rs() * (q.lu - w - 0.2), t: rs.range(0.75, 1.5), w, h: w * 0.95, rect: [c / 4, 1 - (row + 1) / 2, (c + 1) / 4, 1 - row / 2], rot: rs.range(-0.12, 0.12) });
    }
    // mesas, cadeiras e balões
    for (const rm of this.rooms) {
      const x0 = rm.x0 * g.cs, z0 = rm.z0 * g.cs, x1 = (rm.x1 + 1) * g.cs, z1 = (rm.z1 + 1) * g.cs;
      const W = x1 - x0, D = z1 - z0;
      if (rm.kind === 'hall' || rm.kind === 'start') {
        const n = Math.min(4, Math.floor((W * D) / 30));
        for (let k = 0; k < n; k++) {
          const x = x0 + 2.2 + rs() * (W - 4.4), z = z0 + 2 + rs() * (D - 4);
          const rot = W > D ? 0 : Math.PI / 2;
          if (!this.free(x, z, 2.6)) continue;
          partyTable(this, x, z, rot, rs, rs.pick(CLOTHS));
          const c = Math.cos(rot), s = Math.sin(rot);
          for (const [u, v] of [
            [-0.6, 0.75],
            [0.1, 0.78],
            [0.6, -0.75],
            [-0.3, -0.8],
          ]) {
            if (!rs.chance(0.75)) continue;
            chair(this, x + u * c + v * s, z - u * s + v * c, rot + (v > 0 ? Math.PI : 0) + rs.range(-0.4, 0.4), rs.pick([0x9a9a98, 0x6a6c70, 0xb83a3a]));
          }
          this.balloonBunch(x + 0.8 * c, 0.76, z - 0.8 * s, rs.int(3, 5));
        }
      } else if (rm.kind === 'kids') {
        for (let k = 0; k < 3; k++) {
          const x = x0 + 1 + rs() * (W - 2), z = z0 + 1 + rs() * (D - 2);
          if (this.free(x, z, 0.8)) chair(this, x, z, rs.range(0, 6.28), 0xd84a3a);
        }
      } else if (rm.kind === 'empty' && rs.chance(0.6)) {
        // uma cadeira virada para a parede
        const x = x0 + 0.7, z = (z0 + z1) / 2;
        if (this.free(x, z, 0.6)) chair(this, x, z, Math.PI / 2);
      }
      // balões soltos no teto
      for (let k = 0; k < Math.floor((W * D) / 25); k++) {
        const x = x0 + 0.5 + rs() * (W - 1), z = z0 + 0.5 + rs() * (D - 1);
        this.balloons.push({ base: [x, this.H - 0.24 - rs() * 0.08, z], color: rs.pick(BALLOONS), ph: rs() * 6.28, free: true });
      }
    }
    this.buildExit(quads);
    // presentes: 3 dourados com chave + vários de enfeite
    const rooms = this.rooms.filter((rm) => rm.kind !== 'start');
    const golds = r.shuffle([...rooms].sort((a, b) => this.roomDist(b) - this.roomDist(a)).slice(0, Math.max(5, rooms.length >> 1))).slice(0, 3);
    let placed = 0;
    for (const rm of [...golds, ...r.shuffle([...rooms])]) if (placed < 3 && this.placePresent(rm, true)) placed++;
    for (let i = 0; i < 11; i++) this.placePresent(r.pick(this.rooms), false);
    // itens
    for (let i = 0; i < 6; i++) {
      const p = g.randomOpen(r, this.spawn, 6);
      if (p) addPickup(this, i < 3 ? 'almond' : 'battery', p.x, p.z, { rot: r.range(0, 6) });
    }
    const n1 = g.randomOpen(r, this.spawn, 2);
    if (n1 && Math.hypot(n1.x - this.spawn.x, n1.z - this.spawn.z) < 9) addPickup(this, 'note', n1.x, n1.z, { note: 'lfa' });
    else addPickup(this, 'note', this.spawn.x + 1.2, this.spawn.z + 1.2, { note: 'lfa' });
    const n2 = g.randomOpen(r, this.spawn, 20);
    if (n2) addPickup(this, 'note', n2.x, n2.z, { note: 'lfb' });
  }

  roomDist(rm) {
    const g = this.grid;
    return this.dist[((rm.z0 + rm.z1) >> 1) * g.w + ((rm.x0 + rm.x1) >> 1)];
  }

  free(x, z, rad) {
    const g = this.grid;
    for (let zz = z - rad; zz <= z + rad; zz += 0.25)
      for (let xx = x - rad; xx <= x + rad; xx += 0.25) {
        const cx = g.cell(xx), cz = g.cell(zz);
        if (g.get(cx, cz) !== EMPTY) return false;
        if (g.propHi[cz * g.w + cx] > -1e8) return false;
      }
    if (Math.hypot(x - this.spawn.x, z - this.spawn.z) < 1.5) return false;
    return true;
  }

  // Arcos: enchimento curvo sob a verga (rosa-salmão) e batentes azuis.
  buildArches() {
    const g = this.grid, cs = g.cs, H = this.doorH;
    const sp = this.prop('spandrel', { color: 0xd98a78, roughness: 0.8 });
    const jb = this.prop('jamb', { color: 0x2f6fb0, roughness: 0.6 });
    for (const a of this.arches) {
      const w = a.n * cs, th = cs;
      // eixo ao longo da abertura (u) e normal da parede (n)
      const c0 = a.a * cs, cl = a.line * cs;
      const rise = Math.min(0.55, w * 0.32);
      const N = 14;
      const P = (u, y, side) => (a.v ? [cl + side * th, y, c0 + u] : [c0 + u, y, cl + side * th]);
      for (let i = 0; i < N; i++) {
        const u0 = (i / N) * w, u1 = ((i + 1) / N) * w;
        const y = (u) => H - rise + rise * Math.sqrt(Math.max(0, 1 - Math.pow((u - w / 2) / (w / 2), 2)));
        const y0 = y(u0), y1 = y(u1);
        // as duas faces
        for (const side of [0, 1]) {
          const n = a.v ? [side ? 1 : -1, 0, 0] : [0, 0, side ? 1 : -1];
          const o = side ? 0.002 : -0.002;
          const Q = (u, yy) => {
            const p = P(u, yy, side);
            return a.v ? [p[0] + o, p[1], p[2]] : [p[0], p[1], p[2] + o];
          };
          sp.quad([Q(u0, y0), Q(u1, y1), Q(u1, H), Q(u0, H)], n, [[0, 0], [1, 0], [1, 1], [0, 1]]);
        }
        // intradorso
        const mid = (u0 + u1) / 2;
        const ny = -1, nu = (y1 - y0) / (u1 - u0);
        const nl = Math.hypot(nu, 1);
        const nn = a.v ? [0, ny / nl, -nu / nl] : [-nu / nl, ny / nl, 0];
        sp.quad([P(u0, y0, 0), P(u1, y1, 0), P(u1, y1, 1), P(u0, y0, 1)], nn, [[0, 0], [1, 0], [1, 1], [0, 1]]);
        void mid;
      }
      // batentes azuis (revestem as faces laterais da abertura)
      for (const end of [0, 1]) {
        const u = end ? w - 0.015 : 0.015;
        const p = P(u, (H - rise) / 2, 0.5);
        jb.box(p[0], p[1], p[2], a.v ? th + 0.06 : 0.03, H - rise, a.v ? 0.03 : th + 0.06);
      }
    }
  }

  balloonBunch(x, y, z, n) {
    const rs = this.r;
    for (let i = 0; i < n; i++) {
      const top = [x + rs.range(-0.35, 0.35), y + 1.0 + rs.range(0.3, 1.0), z + rs.range(-0.35, 0.35)];
      this.balloons.push({ base: top, tie: [x, y, z], color: rs.pick(BALLOONS), ph: rs() * 6.28 });
    }
  }

  placePresent(rm, gold) {
    const g = this.grid, r = this.rr;
    for (let k = 0; k < 40; k++) {
      const x = g.center(r.int(rm.x0 + 1, rm.x1 - 1)), z = g.center(r.int(rm.z0 + 1, rm.z1 - 1));
      if (!this.free(x, z, 0.6)) continue;
      if (this.presents.some((p) => Math.hypot(p.x - x, p.z - z) < 2)) continue;
      const s = gold ? 0.42 : r.range(0.28, 0.5);
      const pr = this.makePresent(s, gold ? 0xb81d3a : r.pick(WRAP), gold ? 0xf2c230 : r.pick([0xf0f0f0, 0xe070b0, 0x60a0e8]), gold);
      pr.group.position.set(x, 0, z);
      pr.group.rotation.y = r.range(0, 6.28);
      this.group.add(pr.group);
      this.pickups.push({ obj: pr.group, kind: 'present' });
      const P = { x, z, s, gold, pr, opened: false, t: 0, decoy: gold ? 'key' : r.pick(['confetti', 'confetti', 'confetti', 'item', 'scare']) };
      this.presents.push(P);
      this.grid.addSolid(x - s / 2, z - s / 2, x + s / 2, z + s / 2, 0, s, { occlude: false });
      this.interactables.push({
        pos: new THREE.Vector3(x, s * 0.8, z),
        r: s * 0.6,
        label: () => t('p_present'),
        enabled: () => !P.opened,
        use: () => this.openPresent(P),
      });
      return true;
    }
    return false;
  }

  makePresent(s, wrap, ribbon, gold) {
    const group = new THREE.Group();
    const wm = gameMaterial({ color: wrap, roughness: 0.4, probe: true, forcePBR: true });
    const rm = gameMaterial({ color: ribbon, roughness: gold ? 0.2 : 0.4, metalness: gold ? 0.7 : 0, probe: true, forcePBR: true });
    const hb = s * 0.82;
    const body = new THREE.Mesh(new THREE.BoxGeometry(s, hb, s), wm);
    body.position.y = hb / 2;
    const r1 = new THREE.Mesh(new THREE.BoxGeometry(s * 1.005, hb * 1.002, s * 0.12), rm);
    r1.position.y = hb / 2;
    const r2 = new THREE.Mesh(new THREE.BoxGeometry(s * 0.12, hb * 1.002, s * 1.005), rm);
    r2.position.y = hb / 2;
    const lid = new THREE.Group();
    lid.position.y = hb;
    const lt = new THREE.Mesh(new THREE.BoxGeometry(s * 1.06, s * 0.16, s * 1.06), wm);
    lt.position.y = s * 0.06;
    const l1 = new THREE.Mesh(new THREE.BoxGeometry(s * 1.07, s * 0.165, s * 0.12), rm);
    l1.position.y = s * 0.06;
    const l2 = new THREE.Mesh(new THREE.BoxGeometry(s * 0.12, s * 0.165, s * 1.07), rm);
    l2.position.y = s * 0.06;
    lid.add(lt, l1, l2);
    for (const a of [0.7, -0.7]) {
      const bow = new THREE.Mesh(new THREE.TorusGeometry(s * 0.12, s * 0.035, 8, 16), rm);
      bow.position.set(0, s * 0.2, 0);
      bow.rotation.set(0, a + Math.PI / 4, 0.5);
      lid.add(bow);
    }
    group.add(body, r1, r2, lid);
    group.traverse((o) => o.isMesh && (o.castShadow = true));
    let sp = null;
    if (gold) {
      sp = sparkle();
      sp.position.y = s * 1.15;
      group.add(sp);
    }
    return { group, lid, sp, mats: [wm, rm] };
  }

  openPresent(P) {
    P.opened = true;
    P.t = 0;
    const g = this.game;
    g.audio.pop(P.x, P.s, P.z);
    this.confetti(P.x, P.s, P.z);
    if (P.decoy === 'key') {
      this.keys++;
      g.audio.pickup();
      g.ui.toast(t('t_key', { n: this.keys }));
    } else if (P.decoy === 'item') {
      const kind = this.rr.chance(0.5) ? 'almond' : 'battery';
      setTimeout(() => {
        const pk = addPickup(this, kind, P.x + 0.45, P.z, { rot: 1 });
        this.lightObject(pk.obj);
      }, 300);
      g.ui.toast(t('t_present_empty'));
    } else if (P.decoy === 'scare') {
      // boneco de mola com carinha =)
      this.jack(P);
      g.audio.giggle(P.x, 0.8, P.z, 1.6);
      g.audio.stinger();
      g.noise({ x: P.x, z: P.z }, 26, 1);
      g.ui.toast(t('t_present_scare'));
    } else {
      g.noise({ x: P.x, z: P.z }, 10, 0.6);
      g.ui.toast(t('t_present_empty'));
    }
  }

  jack(P) {
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), gameMaterial({ color: 0xf2d24a, roughness: 0.5, probe: true, forcePBR: true }));
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.12, 20), new THREE.MeshBasicMaterial({ map: this.partyFaceTex(), transparent: true }));
    face.position.z = 0.125;
    head.add(face);
    const spring = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.4, 8, 6), gameMaterial({ color: 0x999999, metalness: 0.8, roughness: 0.3, probe: true, forcePBR: true }));
    const j = new THREE.Group();
    j.add(spring, head);
    j.position.set(0, P.s * 0.8, 0);
    P.pr.group.add(j);
    P.jack = { j, head, spring };
    this.lightObject(P.pr.group);
  }

  partyFaceTex() {
    if (!this._pft) {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const x = c.getContext('2d');
      x.strokeStyle = '#120c0a';
      x.fillStyle = '#120c0a';
      x.lineWidth = 7;
      x.beginPath();
      x.arc(46, 48, 8, 0, 6.3);
      x.arc(82, 48, 8, 0, 6.3);
      x.fill();
      x.beginPath();
      x.arc(64, 62, 34, 0.25, Math.PI - 0.25);
      x.stroke();
      this._pft = new THREE.CanvasTexture(c);
    }
    return this._pft;
  }

  confetti(x, y, z) {
    const n = 110;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) {
      pos.set([x, y, z], i * 3);
      const c = new THREE.Color(BALLOONS[i % BALLOONS.length]);
      col.set([c.r * 1.4, c.g * 1.4, c.b * 1.4], i * 3);
      const a = Math.random() * 6.28, sp = 0.6 + Math.random() * 1.6;
      vel.push([Math.cos(a) * sp, 2.2 + Math.random() * 2.2, Math.sin(a) * sp]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.035, vertexColors: true, transparent: true }));
    pts.frustumCulled = false;
    this.group.add(pts);
    let life = 0;
    const upd = (dt) => {
      life += dt;
      for (let i = 0; i < n; i++) {
        const v = vel[i];
        v[1] -= 6 * dt;
        v[0] *= 0.97;
        v[2] *= 0.97;
        if (v[1] < -0.6) v[1] = -0.6; // confete plana
        pos[i * 3] += v[0] * dt + Math.sin(life * 8 + i) * 0.004;
        pos[i * 3 + 1] = Math.max(0.01, pos[i * 3 + 1] + v[1] * dt);
        pos[i * 3 + 2] += v[2] * dt;
      }
      geo.attributes.position.needsUpdate = true;
      pts.material.opacity = 1 - smoothstep(4, 6, life);
      if (life > 6) {
        this.group.remove(pts);
        geo.dispose();
        this.updaters.splice(this.updaters.indexOf(upd), 1);
      }
    };
    this.updaters.push(upd);
  }

  buildExit(quads) {
    const g = this.grid, rm = this.exitRoom;
    const x0 = rm.x0 * g.cs, z0 = rm.z0 * g.cs, x1 = (rm.x1 + 1) * g.cs, z1 = (rm.z1 + 1) * g.cs;
    // parede da sala da saída com espaço para a porta
    let best = null;
    for (const q of quads) {
      if (q.kind !== K_WALL || !q.base || q.lu < 2.4 || q.lv < 2.9) continue;
      const p = quadPoint(q, q.lu / 2, 0);
      if (p[0] < x0 - 0.6 || p[0] > x1 + 0.6 || p[2] < z0 - 0.6 || p[2] > z1 + 0.6) continue;
      const fx = p[0] + q.n[0] * 0.8, fz = p[2] + q.n[2] * 0.8;
      if (fx < x0 || fx > x1 || fz < z0 || fz > z1) continue;
      const sc = q.lu + this.rr();
      if (!best || sc > best.sc) best = { q, sc };
    }
    if (!best) {
      // reserva: a parede mais longe do início
      for (const qq of quads) {
        if (qq.kind !== K_WALL || !qq.base || qq.lu < 2.4) continue;
        const p = quadPoint(qq, qq.lu / 2, 0);
        const fx = p[0] + qq.n[0] * 0.8, fz = p[2] + qq.n[2] * 0.8;
        if (!g.walkable(g.cell(fx), g.cell(fz))) continue;
        const d = this.dist[g.cell(fz) * g.w + g.cell(fx)];
        if (!best || d > best.sc) best = { q: qq, sc: d };
      }
    }
    const q = best.q;
    this.door = doorOnWall(this, q, q.lu / 2, { map: 'fun_exit.jpg', normal: null, rough: null, frameColor: 0xe8e4da, metal: 0, glow: true, w: 0.92 });
    this.door.mat.roughness = 0.75;
    // moldura de lampadinhas em volta da porta (como na festa)
    const dw = 0.92, dh = 2.1;
    const P = (u, y) => {
      const p = quadPoint(q, q.lu / 2 + u, y);
      return [p[0] + q.n[0] * 0.07, p[1], p[2] + q.n[2] * 0.07];
    };
    const ring = [];
    for (let y = 0.15; y <= dh + 0.1; y += 0.13) ring.push(P(-dw / 2 - 0.1, y), P(dw / 2 + 0.1, y));
    for (let u = -dw / 2 - 0.1; u <= dw / 2 + 0.1; u += 0.13) ring.push(P(u, dh + 0.12));
    ring.forEach((p, i) => {
      const c = BULBS[i % 3 === 0 ? 0 : i % 3 === 1 ? 1 : 2];
      this.bulbs.push({ p, c, ph: i * 0.7, size: 0.028 });
      if (i % 4 === 0) this.light(p[0], p[1], p[2], 0.06, { kind: 'point', hx: 0.02, radius: 2.0, color: c });
    });
    // cadeados presos à folha da porta
    this.padlocks = [];
    const pm = gameMaterial({ color: 0xc89a2a, roughness: 0.3, metalness: 0.85, probe: true, forcePBR: true });
    const sm = gameMaterial({ color: 0xb8b8b8, roughness: 0.25, metalness: 0.9, probe: true, forcePBR: true });
    for (let i = 0; i < 3; i++) {
      const pl = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.065, 0.03), pm);
      const sh = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.0055, 8, 16, Math.PI), sm);
      sh.position.y = 0.032;
      pl.add(body, sh);
      pl.position.set(0.92 - 0.14, 0.75 + i * 0.32, 0.045);
      this.door.leaf.add(pl);
      this.padlocks.push({ g: pl, drop: -1, v: 0 });
    }
    this.mats = [pm, sm];
    this.interactables.push({
      pos: new THREE.Vector3().copy(this.door.center),
      r: 0.45,
      label: () => (this.keys > this.unlocked ? t('p_padlock') : t('p_padlock_need')),
      can: () => this.keys > this.unlocked,
      enabled: () => this.unlocked < 3,
      use: () => this.unlock(),
    });
    this.interactables.push({
      pos: new THREE.Vector3().copy(this.door.center),
      r: 0.5,
      label: () => t('p_exit'),
      enabled: () => this.unlocked >= 3 && this.doorAng < -1.2,
      use: () => this.game.completeLevel(),
    });
    this.doorAng = 0;
  }

  unlock() {
    const p = this.padlocks[this.unlocked];
    p.drop = 0;
    this.unlocked++;
    this.game.audio.clank(this.door.center.x, 1, this.door.center.z);
    this.game.ui.toast(t('t_unlocked'));
    if (this.unlocked >= 3) {
      this.game.audio.door(this.door.center.x, 1, this.door.center.z);
      this.door.col.on = false;
      this.opening = true;
    }
  }

  afterBake() {
    this.nav = new Nav(this.grid);
    // balões (instanciados) e fios
    const bg = new THREE.SphereGeometry(0.15, 18, 14);
    bg.scale(1, 1.18, 1);
    const knot = new THREE.ConeGeometry(0.022, 0.04, 8);
    knot.translate(0, -0.19, 0);
    const merged = new GeoBuilder();
    merged.add(bg, new THREE.Matrix4());
    merged.add(knot, new THREE.Matrix4());
    const geo = merged.build();
    geo.deleteAttribute('uv1');
    this.balloonMat = gameMaterial({ roughness: 0.22, probe: true, forcePBR: true });
    const B = this.balloons;
    this.balloonMesh = new THREE.InstancedMesh(geo, this.balloonMat, B.length);
    this.balloonMesh.frustumCulled = false;
    const avg = new Float32Array(18), tmp = new Float32Array(18);
    let lvSum = 0;
    for (const b of B) {
      this.probes.sample(b.base[0], b.base[2], tmp);
      for (let i = 0; i < 18; i++) avg[i] += tmp[i] / B.length;
      b.lv = this.probes.level(b.base[0], b.base[2]);
      lvSum += b.lv;
    }
    setProbe(this.balloonMat, avg, 1);
    const lvAvg = lvSum / Math.max(1, B.length);
    const c = new THREE.Color();
    B.forEach((b, i) => {
      c.set(b.color).multiplyScalar(clamp(b.lv / Math.max(lvAvg, 1e-3), 0.25, 1.6));
      this.balloonMesh.setColorAt(i, c);
    });
    this.group.add(this.balloonMesh);
    const tied = B.filter((b) => b.tie);
    this.strings = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xbbbbbb, transparent: true, opacity: 0.55 }));
    this.strings.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tied.length * 6), 3));
    this.strings.frustumCulled = false;
    this.group.add(this.strings);
    // lampadinhas
    const bulbG = new THREE.SphereGeometry(0.032, 8, 6);
    this.bulbMesh = new THREE.InstancedMesh(bulbG, new THREE.MeshBasicMaterial({ color: 0xffffff }), this.bulbs.length);
    const m = new THREE.Matrix4();
    this.bulbs.forEach((b, i) => {
      m.makeScale(b.size ? b.size / 0.032 : 1, b.size ? b.size / 0.032 : 1, b.size ? b.size / 0.032 : 1).setPosition(b.p[0], b.p[1], b.p[2]);
      this.bulbMesh.setMatrixAt(i, m);
      this.bulbMesh.setColorAt(i, c.setRGB(b.c[0] * 5, b.c[1] * 5, b.c[2] * 5));
    });
    this.group.add(this.bulbMesh);
    // Festeiros
    for (let i = 0; i < 4; i++) {
      const p = this.grid.randomOpen(this.rr, this.spawn, 20 + i * 4);
      if (!p) continue;
      const pg = new Partygoer(this, p.x, p.z, 50 + i);
      this.entities.push(pg);
      this.group.add(pg.object);
    }
    this.updateBalloons(0);
  }

  setEnv(env) {
    for (const e of this.entities) e.setEnv && e.setEnv(env);
    const ms = [this.balloonMat, ...(this.mats || [])];
    for (const m of ms) {
      if (!m.isMeshStandardMaterial) continue;
      m.envMap = env;
      m.envMapIntensity = 0.7;
      m.needsUpdate = true;
    }
  }

  onRespawn() {
    for (const e of this.entities) {
      const p = this.grid.randomOpen(this.rr, this.spawn, 22);
      if (p) e.teleport(p.x, p.z);
    }
  }

  updateBalloons(time) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
    const str = this.strings.geometry.attributes.position.array;
    let k = 0;
    this.balloons.forEach((b, i) => {
      const sw = Math.sin(time * 0.7 + b.ph) * 0.05, sw2 = Math.cos(time * 0.53 + b.ph * 1.3) * 0.05;
      v.set(b.base[0] + sw, b.base[1] + Math.sin(time * 1.1 + b.ph) * 0.03, b.base[2] + sw2);
      e.set(sw2 * 1.5, b.ph, -sw * 1.5);
      q.setFromEuler(e);
      m.compose(v, q, s);
      this.balloonMesh.setMatrixAt(i, m);
      if (b.tie) {
        str.set([b.tie[0], b.tie[1], b.tie[2], v.x, v.y - 0.2, v.z], k * 6);
        k++;
      }
    });
    this.balloonMesh.instanceMatrix.needsUpdate = true;
    this.strings.geometry.attributes.position.needsUpdate = true;
  }

  update(dt) {
    super.update(dt);
    const T = this.time;
    if (this.balloonMesh) this.updateBalloons(T);
    // lampadinhas cintilando
    if (this.bulbMesh && Math.floor(T * 10) !== this._tw) {
      this._tw = Math.floor(T * 10);
      const c = new THREE.Color();
      this.bulbs.forEach((b, i) => {
        const k = 3.5 + 2 * Math.max(0, Math.sin(T * 1.7 + b.ph));
        this.bulbMesh.setColorAt(i, c.setRGB(b.c[0] * k, b.c[1] * k, b.c[2] * k));
      });
      this.bulbMesh.instanceColor.needsUpdate = true;
    }
    // presentes abrindo
    for (const P of this.presents) {
      if (!P.opened || P.t > 3) continue;
      P.t += dt;
      const k = smoothstep(0, 0.5, P.t);
      P.pr.lid.position.set(P.s * 0.6 * k, P.s * 0.82 + Math.sin(k * Math.PI) * 0.35 + (P.t > 0.5 ? -0.0 : 0), 0);
      P.pr.lid.rotation.set(0, 0, -k * 1.9);
      if (P.t > 0.5) P.pr.lid.position.y = lerp(P.s * 0.82, P.s * 0.08, smoothstep(0.5, 0.8, P.t));
      if (P.pr.sp) P.pr.sp.visible = false;
      if (P.jack) {
        const j = smoothstep(0, 0.25, P.t);
        const wob = Math.sin(P.t * 18) * Math.exp(-P.t * 3) * 0.25;
        P.jack.spring.scale.y = j * (1 + wob);
        P.jack.spring.position.y = 0.2 * j * (1 + wob);
        P.jack.head.position.y = 0.42 * j * (1 + wob) + 0.1;
        P.jack.head.rotation.z = wob;
        const pl = this.game.player.pos;
        P.jack.head.rotation.y = Math.atan2(pl.x - P.x, pl.z - P.z) - P.pr.group.rotation.y;
      }
    }
    // cadeados caindo
    if (this.padlocks)
      for (const p of this.padlocks) {
        if (p.drop < 0 || p.drop > 2) continue;
        p.drop += dt;
        p.v += 9.8 * dt;
        p.g.position.y = Math.max(-0.0, p.g.position.y - p.v * dt);
        p.g.position.z += dt * 0.25;
        p.g.rotation.z += dt * 4;
        if (p.drop > 1.2) p.g.visible = false;
      }
    // porta abrindo para a luz
    if (this.opening && this.doorAng > -1.75) {
      this.doorAng = Math.max(-1.75, this.doorAng - dt * 1.2);
      this.door.hinge.rotation.y = this.door.rot + this.doorAng;
    }
  }

  surfaceAt() {
    return 'carpet';
  }

  objective() {
    const items = `${t('hud_keys')}&nbsp; ${[0, 1, 2].map((i) => `<span class="slot">${i < this.keys ? '⚿' : '&nbsp;'}</span>`).join('')}`;
    if (this.unlocked >= 3) return { text: t('obj_fun_go'), items };
    if (this.keys >= 3) return { text: t('obj_fun_door'), items };
    return { text: t('obj_fun_keys', { n: this.keys }), items };
  }
}
