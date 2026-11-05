// Nível 0 — O Saguão: labirinto de papel de parede amarelo, carpete úmido e
// lâmpadas fluorescentes. Saída: porta de manutenção com teclado (código de 4
// dígitos escrito nas paredes). Entidade: o Rastejador.
import * as THREE from 'three';
import { Level } from '../level.js';
import { Grid, WALL, LINTEL, EMPTY } from '../grid.js';
import { connect, bfs, scatterStains, flatSpot, atlasRect } from '../layout.js';
import { K_WALL, K_FLOOR, quadPoint, GeoBuilder, floorRect } from '../build.js';
import { noise2, rng, clamp, smoothstep } from '../util.js';
import { addPickup, wallBits, doorOnWall } from '../props.js';
import { codeDecal } from '../textures.js';
import { gameMaterial, tex } from '../materials.js';
import { Hound } from '../entities/hound.js';
import { Nav } from '../entities/nav.js';
import { t } from '../i18n.js';

const M = 6; // célula "macro" = 3 m (parede de 0,5 m + corredor de 2,5 m)

export class Level0 extends Level {
  constructor(game) {
    super(game, { w: 128, h: 128, H: 3.0, doorH: 2.25, seed: game.seed ?? 1007 });
    this.id = 0;
    this.surf = {
      floor: { tex: 'l0_carpet', scale: 1.6, normalScale: 1.0, macro: 0.18 },
      wall: { tex: 'l0_wall', scale: 1.0, normalScale: 0.55, macro: 0.12, grime: [0.22, 0.5, 0.5] },
      ceil: { tex: 'ceiling', scale: 1.2, normalScale: 0.8, macro: 0.12 },
      trim: { color: 0x6e5d34, h: 0.09, roughness: 0.55 },
    };
    this.fog = { color: 0x0f0d07, density: 0.045 };
    this.grade = { exposure: 1.0, tint: [1.04, 1.0, 0.86], lift: [0.012, 0.01, 0.0], sat: 0.92, contrast: 1.06, bloom: 0.5, ca: 0.028, grain: 0.07 };
    this.bakeParams.floorAlb = [0.42, 0.36, 0.2];
    this.bakeParams.wallAlb = [0.55, 0.5, 0.27];
    this.panelGlow = 5.5;
    this.envOpts = { wall: 0x6a5f35, floor: 0x3a3220, ceil: 0x4a463a };
    this.rr = rng((Math.random() * 1e9) | 0);
    this.code = Array.from({ length: 4 }, () => this.rr.int(0, 9));
    this.found = [false, false, false, false];
    this.open = false;
  }

  async build(onProgress) {
    const g = (this.grid = new Grid(this.dims.w, this.dims.h, { H: this.H, doorH: this.doorH }));
    const r = this.r;
    const NX = Math.floor((g.w - 2) / M), NZ = Math.floor((g.h - 2) / M);
    this.NX = NX;
    this.NZ = NZ;
    // tipo de região por célula macro: 0 labirinto, 1 salas, 2 salão com pilares
    const reg = [];
    for (let j = 0; j < NZ; j++)
      for (let i = 0; i < NX; i++) {
        const n = noise2(i * 0.28, j * 0.28, this.seed);
        reg[j * NX + i] = n < 0.38 ? 0 : n < 0.68 ? 1 : 2;
      }
    this.reg = reg;
    const R = (i, j) => (i < 0 || j < 0 || i >= NX || j >= NZ ? 0 : reg[j * NX + i]);
    // borda
    g.rect(0, 0, g.w - 1, g.h - 1, WALL);
    g.rect(1, 1, NX * M - 1, NZ * M - 1, EMPTY);
    const edge = (cells, rt) => {
      const pw = [0.62, 0.42, 0.08][rt];
      if (!r.chance(pw)) return;
      for (const [x, z] of cells) g.set(x, z, WALL);
      // vão de porta
      if (r.chance(rt === 0 ? 0.35 : 0.55)) {
        const gw = r.int(2, 3);
        const a = r.int(1, M - gw);
        const lin = r.chance(0.45);
        for (let k = a; k < a + gw; k++) g.set(cells[k][0], cells[k][1], lin ? LINTEL : EMPTY);
      }
    };
    for (let j = 0; j < NZ; j++)
      for (let i = 0; i < NX; i++) {
        const rt = Math.min(R(i, j), R(i + 1, j));
        if (i < NX - 1) {
          const x = (i + 1) * M;
          const cells = [];
          for (let z = j * M; z <= (j + 1) * M; z++) cells.push([x, z]);
          edge(cells, rt);
        }
        const rt2 = Math.min(R(i, j), R(i, j + 1));
        if (j < NZ - 1) {
          const z = (j + 1) * M;
          const cells = [];
          for (let x = i * M; x <= (i + 1) * M; x++) cells.push([x, z]);
          edge(cells, rt2);
        }
      }
    // pilares nos salões e paredes soltas
    for (let j = 1; j < NZ; j++)
      for (let i = 1; i < NX; i++) {
        const x = i * M, z = j * M;
        if (R(i, j) === 2 && R(i - 1, j - 1) === 2 && r.chance(0.7)) {
          g.set(x, z, WALL);
          if (r.chance(0.35)) g.rect(x, z, x + 1, z + 1, WALL);
        }
      }
    for (let k = 0; k < 40; k++) {
      const i = r.int(0, NX - 1), j = r.int(0, NZ - 1);
      if (R(i, j) === 2) continue;
      const len = r.int(2, 4);
      const x = i * M + r.int(2, 4), z = j * M + r.int(2, 4);
      if (r.chance(0.5)) g.rect(x, z, Math.min(x + len, (i + 1) * M), z, WALL);
      else g.rect(x, z, x, Math.min(z + len, (j + 1) * M), WALL);
    }
    // As Armadilhas: salão de carpete podre com uma grade de poços no chão
    this.buildTraps(NX, NZ);
    // início no canto, saída longe
    const si = 1, sj = 1;
    this.spawn = { x: (si * M + 3.5) * g.cs, z: (sj * M + 3.5) * g.cs, yaw: -Math.PI * 0.75 };
    g.rect(si * M + 1, sj * M + 1, si * M + M - 1, sj * M + M - 1, EMPTY);
    connect(g, r, g.cell(this.spawn.x), g.cell(this.spawn.z));
    const dist = bfs(g, g.cell(this.spawn.x), g.cell(this.spawn.z));
    this.dist = dist;
    // zonas escuras
    this.dark = [];
    for (let k = 0; k < 4; k++) {
      const p = g.randomOpen(r, this.spawn, 18) || { x: 30, z: 30 };
      this.dark.push({ x: p.x, z: p.z, r: r.range(6, 10) });
    }
    // luminárias no centro de cada célula macro
    for (let j = 0; j < NZ; j++)
      for (let i = 0; i < NX; i++) {
        const x = (i * M + 3.5) * g.cs, z = (j * M + 3.5) * g.cs;
        if (g.get(g.cell(x), g.cell(z)) === WALL) continue;
        const rt = R(i, j);
        if (!r.chance([0.72, 0.86, 0.95][rt])) continue;
        let inDark = false;
        for (const d of this.dark) if (Math.hypot(x - d.x, z - d.z) < d.r) inDark = true;
        const T = this.trap;
        const inTrap = x > T.x0 && x < T.x1 && z > T.z0 && z < T.z1;
        if (inTrap) inDark = false;
        const rot = noise2(i * 0.15, j * 0.15, this.seed + 9) > 0.5;
        if (inDark) {
          if (r.chance(0.5)) this.panel(x, z, { rot, broken: true });
          continue;
        }
        const roll = r();
        const group = inTrap ? (roll < 0.45 ? 2 : roll < 0.6 ? 1 : 0) : roll < 0.07 ? 1 : roll < 0.1 ? 2 : roll < 0.15 ? 3 : 0;
        this.panel(x, z, { rot, group, broken: r.chance(0.05), I: 6 });
      }
    await this.finish(onProgress);
  }

  buildTraps(NX, NZ) {
    const g = this.grid, r = this.r;
    const ti = 1, tj = NZ - 5, wi = 5, wj = 4;
    const X0 = ti * M, Z0 = tj * M, X1 = (ti + wi) * M, Z1 = (tj + wj) * M;
    this.trap = { x0: X0 * g.cs, z0: Z0 * g.cs, x1: (X1 + 1) * g.cs, z1: (Z1 + 1) * g.cs, warned: false };
    g.rect(X0 + 1, Z0 + 1, X1 - 1, Z1 - 1, EMPTY);
    for (let x = X0; x <= X1; x++) g.set(x, Z0, WALL), g.set(x, Z1, WALL);
    for (let z = Z0; z <= Z1; z++) g.set(X0, z, WALL), g.set(X1, z, WALL);
    // entradas (com verga) no lado de cima e no da direita
    const door = (cells) => cells.forEach(([x, z]) => g.set(x, z, LINTEL));
    for (const k of [1, 3]) door([0, 1, 2, 3].map((d) => [X0 + k * M + 1 + d, Z0]));
    door([0, 1, 2, 3].map((d) => [X1, Z0 + 2 * M + 1 + d]));
    // poços de 2 m separados por passarelas de 1 m
    const nX = X1 - X0 - 1, nZ = Z1 - Z0 - 1;
    const isHole = (l, n) => l >= 3 && l < n - 3 && (l - 3) % 6 < 4;
    for (let z = Z0 + 1; z < Z1; z++)
      for (let x = X0 + 1; x < X1; x++) if (isHole(x - X0 - 1, nX) && isHole(z - Z0 - 1, nZ)) g.holes[z * g.w + x] = 1;
    // buracos escondidos no cruzamento das passarelas (o carpete cede)
    const cross = [];
    for (let lz = 7; lz < nZ - 3; lz += 6) for (let lx = 7; lx < nX - 3; lx += 6) cross.push([X0 + 1 + lx, Z0 + 1 + lz]);
    this.hidden = [];
    for (const [x, z] of r.shuffle(cross).slice(0, 4)) {
      const cells = [];
      for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) {
        g.holes[(z + dz) * g.w + x + dx] = 2;
        cells.push([x + dx, z + dz]);
      }
      this.hidden.push({ cells, open: false, t: 0, x: (x + 1) * g.cs, z: (z + 1) * g.cs });
    }
  }

  // Paredes internas dos poços (escurecendo com a profundidade) e tampas dos buracos escondidos.
  buildPits() {
    const g = this.grid, cs = g.cs, D = 2.8;
    const pos = [], nrm = [], uv = [], lig = [], idx = [];
    const lit = this.lightLevel((this.trap.x0 + this.trap.x1) / 2, (this.trap.z0 + this.trap.z1) / 2) * 0.55 + 0.05;
    const quad = (P, n, l) => {
      const b = pos.length / 3;
      P.forEach((p, i) => {
        pos.push(...p);
        nrm.push(...n);
        uv.push(i === 1 || i === 2 ? cs : 0, p[1] / 1);
        const k = Math.max(0, 1 + p[1] / D);
        lig.push(lit * k * k * l, lit * k * k * l * 0.95, lit * k * k * l * 0.8);
      });
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    };
    const H = (cx, cz) => g.inside(cx, cz) && g.holes[cz * g.w + cx];
    for (let cz = 0; cz < g.h; cz++)
      for (let cx = 0; cx < g.w; cx++) {
        if (!H(cx, cz)) continue;
        const x0 = cx * cs, x1 = x0 + cs, z0 = cz * cs, z1 = z0 + cs;
        if (!H(cx - 1, cz)) quad([[x0, -D, z1], [x0, -D, z0], [x0, 0, z0], [x0, 0, z1]], [1, 0, 0], 1);
        if (!H(cx + 1, cz)) quad([[x1, -D, z0], [x1, -D, z1], [x1, 0, z1], [x1, 0, z0]], [-1, 0, 0], 1);
        if (!H(cx, cz - 1)) quad([[x1, -D, z0], [x0, -D, z0], [x0, 0, z0], [x1, 0, z0]], [0, 0, 1], 1);
        if (!H(cx, cz + 1)) quad([[x0, -D, z1], [x1, -D, z1], [x1, 0, z1], [x0, 0, z1]], [0, 0, -1], 1);
        quad([[x0, -D, z0], [x1, -D, z0], [x1, -D, z1], [x0, -D, z1]].reverse(), [0, 1, 0], 0);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('aLight', new THREE.Float32BufferAttribute(lig, 3));
    geo.setAttribute('aFlick', new THREE.Float32BufferAttribute(new Float32Array(lig.length), 3));
    geo.setIndex(idx);
    const m = gameMaterial({ map: tex('l0_wall.jpg'), color: 0x9a8a5a, roughness: 0.95, vlight: true });
    const mesh = new THREE.Mesh(geo, m);
    mesh.matrixAutoUpdate = false;
    this.group.add(mesh);
    // tampas de carpete por cima dos buracos escondidos (mesmo material e lightmap do piso)
    for (const h of this.hidden) {
      const gb = new GeoBuilder();
      for (const [cx, cz] of h.cells) {
        const f = flatSpot(this.quads, (cx + 0.5) * cs, (cz + 0.5) * cs, K_FLOOR);
        if (f) floorRect(gb, f.q, this.atlas, cx * cs, cz * cs, (cx + 1) * cs, (cz + 1) * cs, 1.6, 1.6);
      }
      const g2 = gb.build();
      g2.translate(-h.x, 0, -h.z);
      const cover = new THREE.Mesh(g2, this.meshFloor.material);
      cover.position.set(h.x, 0, h.z);
      this.group.add(cover);
      h.mesh = cover;
    }
  }

  // Jogador sobre um buraco: o carpete cede (se escondido) e ele cai até o Nível 1.
  checkTraps(dt) {
    const p = this.game.player, g = this.grid;
    const T = this.trap;
    if (!T.warned && p.pos.x > T.x0 && p.pos.x < T.x1 && p.pos.z > T.z0 && p.pos.z < T.z1) {
      T.warned = true;
      this.game.ui.toast(t('t_traps'), 3.5);
    }
    for (const h of this.hidden) {
      if (h.open && h.t < 1.5) {
        h.t += dt;
        h.mesh.position.y = -4.9 * h.t * h.t;
        h.mesh.rotation.set(h.t * 0.8, 0, h.t * 0.5);
        if (h.t >= 1.5) h.mesh.visible = false;
      }
    }
    if (this.falling) {
      this.fallT += dt;
      p.vel.x *= 0.9;
      p.vel.z *= 0.9;
      p.pos.x += (this.fallAt.x - p.pos.x) * Math.min(1, dt * 3);
      p.pos.z += (this.fallAt.z - p.pos.z) * Math.min(1, dt * 3);
      if (this.fallT > 0.9 && !this.fallDone) {
        this.fallDone = true;
        this.game.completeLevel();
      }
      return;
    }
    if (!p.onGround || this.game.state !== 'play') return;
    const v = g.hole(p.pos.x, p.pos.z);
    if (!v) return;
    if (v === 2) {
      const h = this.hidden.find((hh) => hh.cells.some(([cx, cz]) => cx === g.cell(p.pos.x) && cz === g.cell(p.pos.z)));
      if (h && !h.open) {
        h.open = true;
        h.t = 0;
        this.game.audio.crack();
      }
    }
    // cai
    this.falling = true;
    this.fallT = 0;
    this.fallAt = { x: (g.cell(p.pos.x) + 0.5) * g.cs, z: (g.cell(p.pos.z) + 0.5) * g.cs };
    p.pit = true;
    p.onGround = false;
    p.vy = -0.5;
    this.game.audio.fall();
    this.game.ui.toast(t('t_fall'), 2);
  }

  compassTarget() {
    if (!this.door) return null;
    const n = this.door.q.n;
    const front = { x: this.door.center.x + n[0] * 1.0, z: this.door.center.z + n[2] * 1.0 };
    if (this.open || !this.digits) return front;
    const p = this.game.player.pos;
    let best = null;
    for (const d of this.digits) {
      if (this.found[d.pos]) continue;
      const c = { x: d.p.x + d.n[0] * 1.2, z: d.p.z + d.n[2] * 1.2 };
      const dd = Math.hypot(c.x - p.x, c.z - p.z);
      if (!best || dd < best.dd) best = { ...c, dd };
    }
    return best || front;
  }

  decorate(quads) {
    const g = this.grid, r = this.rr;
    // carpete podre nas Armadilhas
    const T = this.trap;
    const st = this.decal('stains', { map: 'stains.png', roughness: 0.95 });
    for (let i = 0; i < 40; i++) {
      const x = r.range(T.x0 + 0.6, T.x1 - 0.6), z = r.range(T.z0 + 0.6, T.z1 - 0.6);
      if (g.hole(x, z)) continue;
      const f = flatSpot(quads, x, z, K_FLOOR);
      if (!f) continue;
      const w = r.range(0.5, 1.4);
      st.push({ q: f.q, s: f.s, t: f.t, w, h: w * r.range(0.6, 1), rot: r.range(0, 6.28), rect: atlasRect(4 + r.int(0, 3)) });
    }
    scatterStains(this, quads, { walls: 160, floor: 70, ceil: 50, H: this.H });
    wallBits(this, quads, this.r, 70);
    const sc = g.cell(this.spawn.x), sz = g.cell(this.spawn.z);
    const distAt = (x, z) => this.dist[g.cell(z) * g.w + g.cell(x)];
    let maxD = 0;
    for (const d of this.dist) maxD = Math.max(maxD, d);
    // porta de manutenção: parede longe do início, com espaço livre na frente
    const walls = quads.filter((q) => q.kind === K_WALL && q.base && q.lv > 2.5 && q.lu >= 2.2);
    let best = null;
    for (const q of walls) {
      const p = quadPoint(q, q.lu / 2, 0);
      const fx = p[0] + q.n[0] * 1.2, fz = p[2] + q.n[2] * 1.2;
      if (!g.walkable(g.cell(fx), g.cell(fz))) continue;
      const d = distAt(fx, fz);
      if (d < 0) continue;
      const score = d + r() * maxD * 0.15;
      if (!best || score > best.score) best = { q, score };
    }
    const dq = best.q;
    this.door = doorOnWall(this, dq, dq.lu / 2 - 0.3);
    // teclado ao lado da porta
    const kp = quadPoint(dq, dq.lu / 2 - 0.3 + 0.85, 1.3);
    const rot = Math.atan2(dq.n[0], dq.n[2]);
    const kb = this.prop('keypad', { color: 0x4a4d50, roughness: 0.4, metalness: 0.6 });
    kb.box(kp[0] + dq.n[0] * 0.02, 1.3, kp[2] + dq.n[2] * 0.02, 0.16, 0.24, 0.04, { rot });
    const scr = this.prop('kpscreen', { color: 0x000000, emissive: 0x2aff5a, emissiveIntensity: 1.6, vlight: false, roughness: 0.2 });
    scr.box(kp[0] + dq.n[0] * 0.042, 1.37, kp[2] + dq.n[2] * 0.042, 0.11, 0.04, 0.004, { rot });
    const keys = this.prop('kpkeys', { color: 0x9a9d9f, roughness: 0.4, metalness: 0.5 });
    for (let i = 0; i < 12; i++) {
      const u = ((i % 3) - 1) * 0.035, v = 1.31 - Math.floor(i / 3) * 0.035;
      keys.box(kp[0] + dq.n[0] * 0.044 + dq.u[0] * u, v, kp[2] + dq.n[2] * 0.044 + dq.u[2] * u, 0.026, 0.026, 0.008, { rot });
    }
    this.light(kp[0] + dq.n[0] * 0.1, 1.37, kp[2] + dq.n[2] * 0.1, 0.05, { kind: 'point', radius: 1.5, color: [0.2, 1, 0.35] });
    const kpos = new THREE.Vector3(kp[0] + dq.n[0] * 0.05, 1.3, kp[2] + dq.n[2] * 0.05);
    this.interactables.push({
      pos: kpos,
      r: 0.15,
      label: () => t('p_keypad'),
      enabled: () => !this.open,
      use: () => this.game.overlay('keypad', (code) => this.tryCode(code)),
    });
    this.interactables.push({
      pos: this.door.center,
      r: 0.5,
      label: () => t('p_door_go'),
      enabled: () => this.open && this.doorAng < -1.2,
      use: () => this.game.completeLevel(),
    });
    this.doorAng = 0;
    // dígitos pintados em quatro cantos do saguão
    const W = g.W, D = g.D;
    const corners = [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ];
    const order = r.shuffle([0, 1, 2, 3]);
    this.digits = [];
    corners.forEach(([cx, cz], k) => {
      let pick = null;
      for (let tries = 0; tries < 600 && !pick; tries++) {
        const q = walls[Math.floor(r() * walls.length)];
        if (q === dq) continue;
        const p = quadPoint(q, q.lu / 2, 1.5);
        const inX = cx ? p[0] > W * 0.55 : p[0] < W * 0.45;
        const inZ = cz ? p[2] > D * 0.55 : p[2] < D * 0.45;
        if (!inX || !inZ) continue;
        if (Math.hypot(p[0] - this.spawn.x, p[2] - this.spawn.z) < 10) continue;
        const fx = p[0] + q.n[0] * 1.0, fz = p[2] + q.n[2] * 1.0;
        if (!g.walkable(g.cell(fx), g.cell(fz))) continue;
        pick = { q, p };
      }
      if (!pick) return;
      const pos = order[k];
      const tx = codeDecal(this.code[pos], pos, k * 13 + 5);
      this.decal('code' + k, { map: tx, roughness: 0.55 }).push({ q: pick.q, s: pick.q.lu / 2, t: 1.55, w: 1.2, h: 0.6, rect: [0, 0, 1, 1] });
      this.digits.push({ pos, p: new THREE.Vector3(pick.p[0] + pick.q.n[0] * 0.05, 1.55, pick.p[2] + pick.q.n[2] * 0.05), n: pick.q.n });
    });
    // itens espalhados
    const spots = (n, minD) => {
      const out = [];
      for (let k = 0; k < n * 20 && out.length < n; k++) {
        const p = g.randomOpen(r, this.spawn, minD);
        if (p && out.every((o) => Math.hypot(o.x - p.x, o.z - p.z) > 8)) out.push(p);
      }
      return out;
    };
    for (const p of spots(5, 6)) addPickup(this, 'almond', p.x + r.range(-0.4, 0.4), p.z + r.range(-0.4, 0.4), { rot: r.range(0, 6) });
    for (const p of spots(4, 10)) addPickup(this, 'battery', p.x, p.z, { rot: r.range(0, 6) });
    const notes = spots(2, 8);
    if (notes[0]) addPickup(this, 'note', notes[0].x, notes[0].z, { note: 'l0a', rot: r.range(0, 6) });
    if (notes[1]) addPickup(this, 'note', notes[1].x, notes[1].z, { note: 'l0b', rot: r.range(0, 6) });
    // um bilhete perto do começo
    const first = g.randomOpen(r, this.spawn, 3);
    if (first && Math.hypot(first.x - this.spawn.x, first.z - this.spawn.z) < 14) addPickup(this, 'note', first.x, first.z, { note: 'l0a' });
  }

  afterBake() {
    this.buildPits();
    this.nav = new Nav(this.grid);
    const far = this.farSpot(35);
    this.hound = new Hound(this, far.x, far.z, 11);
    this.entities.push(this.hound);
    this.group.add(this.hound.object);
  }

  setEnv(env) {
    this.hound && this.hound.setEnv(env);
  }

  farSpot(minD) {
    const p = this.game.player;
    const ref = p && p.alive && this.game.state === 'play' ? p.pos : this.spawn;
    return this.grid.randomOpen(this.rr, ref, minD) || this.grid.randomOpen(this.rr);
  }

  onRespawn() {
    const far = this.grid.randomOpen(this.rr, this.spawn, 35);
    if (far) this.hound.teleport(far.x, far.z);
  }

  tryCode(code) {
    if (code === this.code.join('')) {
      this.open = true;
      this.game.audio.success();
      this.game.audio.door(this.door.center.x, 1, this.door.center.z);
      this.game.ui.toast(t('t_code_ok'));
      this.door.col.on = false;
      setTimeout(() => this.game.closeOverlay(), 450);
      return true;
    }
    this.game.audio.beep(false);
    this.game.ui.toast(t('t_code_wrong'));
    return false;
  }

  update(dt) {
    super.update(dt);
    if (this.trap && (this.game.state === 'play' || this.falling)) this.checkTraps(dt);
    // porta abrindo
    if (this.open && this.doorAng > -1.75) {
      this.doorAng = Math.max(-1.75, this.doorAng - dt * 1.4);
      this.door.hinge.rotation.y = this.door.rot + this.doorAng * (1 - Math.pow(1 - Math.min(1, -this.doorAng / 1.75), 2) * 0);
    }
    // anotar dígitos ao ver a parede pintada
    const cam = this.game.camera;
    if (this.game.state === 'play' && this.digits) {
      for (const d of this.digits) {
        if (this.found[d.pos]) continue;
        const dx = d.p.x - cam.position.x, dy = d.p.y - cam.position.y, dz = d.p.z - cam.position.z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist > 5.5) continue;
        if ((dx * d.n[0] + dz * d.n[2]) / dist > -0.35) continue; // olhando de frente para a parede
        const f = cam.getWorldDirection(this._v || (this._v = new THREE.Vector3()));
        if ((f.x * dx + f.y * dy + f.z * dz) / dist < 0.7) continue;
        if (!this.grid.visible(cam.position.x, cam.position.y, cam.position.z, d.p.x + d.n[0] * 0.1, d.p.y, d.p.z + d.n[2] * 0.1)) continue;
        this.found[d.pos] = true;
        this.game.ui.toast(t('t_digit'));
        this.game.audio.paper();
      }
    }
  }

  surfaceAt() {
    return 'carpet';
  }

  objective() {
    const n = this.found.filter(Boolean).length;
    const slots = this.code.map((c, i) => `<span class="slot">${this.found[i] ? c : '&nbsp;'}</span>`).join('');
    const items = `${t('hud_code')}&nbsp; ${slots}`;
    if (this.open) return { text: t('obj_l0_go'), items };
    if (n < 4) return { text: t('obj_l0_code', { n }), items };
    return { text: t('obj_l0_door'), items };
  }
}
