// Nível 0 — O Saguão: labirinto de papel de parede amarelo, carpete úmido e
// lâmpadas fluorescentes. Saída: porta de manutenção com teclado (código de 4
// dígitos escrito nas paredes). Entidade: o Rastejador.
import * as THREE from 'three';
import { Level } from '../level.js';
import { Grid, WALL, LINTEL, EMPTY } from '../grid.js';
import { connect, bfs, scatterStains } from '../layout.js';
import { K_WALL, quadPoint } from '../build.js';
import { noise2, rng, clamp, smoothstep } from '../util.js';
import { addPickup, wallBits, doorOnWall } from '../props.js';
import { codeDecal } from '../textures.js';
import { gameMaterial } from '../materials.js';
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
    // início no canto, saída longe
    const si = 1, sj = 1;
    this.spawn = { x: (si * M + 3.5) * g.cs, z: (sj * M + 3.5) * g.cs, yaw: Math.PI * 0.75 };
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
        const rot = noise2(i * 0.15, j * 0.15, this.seed + 9) > 0.5;
        if (inDark) {
          if (r.chance(0.5)) this.panel(x, z, { rot, broken: true });
          continue;
        }
        const roll = r();
        const group = roll < 0.07 ? 1 : roll < 0.1 ? 2 : roll < 0.15 ? 3 : 0;
        this.panel(x, z, { rot, group, broken: r.chance(0.05), I: 6 });
      }
    await this.finish(onProgress);
  }

  decorate(quads) {
    const g = this.grid, r = this.rr;
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
        if ((dx * d.n.x + dz * d.n.z) / dist > -0.35) continue; // olhando de frente para a parede
        const f = cam.getWorldDirection(this._v || (this._v = new THREE.Vector3()));
        if ((f.x * dx + f.y * dy + f.z * dz) / dist < 0.7) continue;
        if (!this.grid.visible(cam.position.x, cam.position.y, cam.position.z, d.p.x + d.n.x * 0.1, d.p.y, d.p.z + d.n.z * 0.1)) continue;
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
