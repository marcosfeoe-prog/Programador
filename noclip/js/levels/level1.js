// Nível 1 — Zona Habitável: armazém de concreto sem fim, pilares, corredores de
// estantes, caixas e paletes, poças, lâmpadas industriais penduradas. A energia
// cai de tempos em tempos e os Sorridentes aparecem no escuro. Saída: três
// fusíveis → quadro de força → alavanca → elevador de carga.
import * as THREE from 'three';
import { Level } from '../level.js';
import { Grid, WALL, LINTEL, EMPTY } from '../grid.js';
import { connect, bfs, scatterStains, flatSpot, atlasRect } from '../layout.js';
import { K_FLOOR, quadPoint } from '../build.js';
import { noise2, rng, clamp, smoothstep, lerp } from '../util.js';
import { addPickup, crate, pallet, shelf, cardboard, wallBits, sparkle } from '../props.js';
import { gameMaterial, tex } from '../materials.js';
import { Smiler } from '../entities/smiler.js';
import { Nav } from '../entities/nav.js';
import { t } from '../i18n.js';

const M = 12; // 6 m

export class Level1 extends Level {
  constructor(game) {
    super(game, { w: 144, h: 144, H: 5.5, doorH: 3.4, seed: 2203 });
    this.id = 1;
    this.surf = {
      floor: { tex: 'l1_floor', scale: 4, normalScale: 0.7, macro: 0.2, roughness: 1, envMapIntensity: 0.25 },
      wall: { tex: 'l1_wall', scale: 1.6, normalScale: 0.9, macro: 0.16, grime: [0.38, 1.1, 0.3], color: 0xb4b2a8 },
      ceil: { tex: 'l1_ceiling', scale: 2, normalScale: 1.0, macro: 0.1 },
    };
    this.fog = { color: 0x08090a, density: 0.034 };
    this.grade = { exposure: 1.0, tint: [1.0, 0.98, 0.93], lift: [0.0, 0.006, 0.01], sat: 0.85, contrast: 1.08, bloom: 0.55, ca: 0.025, grain: 0.08 };
    this.bakeParams.floorAlb = [0.3, 0.3, 0.28];
    this.bakeParams.wallAlb = [0.42, 0.43, 0.38];
    this.bakeParams.ambient = [0.004, 0.0045, 0.005];
    this.bakeParams.bounce = 1.0;
    this.bakeParams.spread = 50;
    this.panelColor = new THREE.Color(1, 0.86, 0.66);
    this.envOpts = { wall: 0x3c3e3a, floor: 0x2e2e2c, ceil: 0x1e1f20, light: 0xffdcaa };
    this.rr = rng((Math.random() * 1e9) | 0);
    this.fuses = 0;
    this.inserted = false;
    this.powered = false;
    this.blackoutT = 55 + this.rr() * 30;
    this.blackout = false;
    this.puddles = [];
    this.smilers = [];
  }

  async build(onProgress) {
    const g = (this.grid = new Grid(this.dims.w, this.dims.h, { H: this.H, doorH: this.doorH }));
    const r = this.r;
    const NX = Math.floor((g.w - 2) / M), NZ = Math.floor((g.h - 2) / M);
    g.rect(0, 0, g.w - 1, g.h - 1, WALL);
    g.rect(1, 1, NX * M - 1, NZ * M - 1, EMPTY);
    // zonas: 0 estantes, 1 aberto com caixas, 2 setor escuro, 3 salas
    const zone = [];
    for (let j = 0; j < NZ; j++)
      for (let i = 0; i < NX; i++) {
        const n = noise2(i * 0.35, j * 0.35, 77);
        zone[j * NX + i] = n < 0.36 ? 0 : n < 0.7 ? 1 : n < 0.8 ? 3 : 2;
      }
    zone[NX + 1] = 1;
    zone[NX - 2] = zone[NX - 2] === 2 ? 1 : zone[NX - 2];
    this.zone = zone;
    this.NX = NX;
    this.NZ = NZ;
    const Z = (i, j) => (i < 0 || j < 0 || i >= NX || j >= NZ ? 1 : zone[j * NX + i]);
    // paredes de bloco entre algumas células, com aberturas largas
    const edge = (cells, p) => {
      if (!r.chance(p)) return;
      for (const [x, z] of cells) g.set(x, z, WALL);
      const gw = r.int(5, 8);
      const a = r.int(2, M - gw - 1);
      const lin = r.chance(0.7);
      for (let k = a; k < a + gw; k++) g.set(cells[k][0], cells[k][1], lin ? LINTEL : EMPTY);
      if (r.chance(0.3)) {
        const b = (a + gw + r.int(1, 3)) % (M - 3);
        for (let k = b; k < b + 3 && k < M; k++) g.set(cells[k][0], cells[k][1], EMPTY);
      }
    };
    for (let j = 0; j < NZ; j++)
      for (let i = 0; i < NX; i++) {
        const z0 = Z(i, j);
        if (i < NX - 1) {
          const z1 = Z(i + 1, j);
          const p = z0 === 3 || z1 === 3 ? 0.85 : z0 !== z1 ? 0.55 : 0.18;
          const cells = [];
          for (let z = j * M; z <= (j + 1) * M; z++) cells.push([(i + 1) * M, z]);
          edge(cells, p);
        }
        if (j < NZ - 1) {
          const z1 = Z(i, j + 1);
          const p = z0 === 3 || z1 === 3 ? 0.85 : z0 !== z1 ? 0.55 : 0.18;
          const cells = [];
          for (let x = i * M; x <= (i + 1) * M; x++) cells.push([x, (j + 1) * M]);
          edge(cells, p);
        }
      }
    // pilares de 1 m nas interseções e no meio das células grandes
    for (let j = 0; j <= NZ; j++)
      for (let i = 0; i <= NX; i++) {
        const x = i * M, z = j * M;
        if (x <= 0 || z <= 0 || x >= NX * M || z >= NZ * M) continue;
        g.rect(x - 1, z - 1, x, z, WALL);
      }
    // elevador de carga: nicho cavado na borda norte (z pequeno) longe do início
    this.spawn = { x: (M + M / 2) * g.cs, z: (M + M / 2) * g.cs, yaw: Math.PI * 1.25 };
    const ei = NX - 2;
    const ex0 = ei * M + 3, ex1 = ex0 + 6; // 3,5 m de largura
    // a borda tem 1 célula; o nicho ocupa a linha de células macro superior
    g.rect(ex0 - 1, 1, ex1 + 1, 7, WALL);
    g.rect(ex0, 1, ex1, 6, EMPTY);
    g.rect(ex0, 7, ex1, 7, LINTEL);
    g.rect(ex0 - 2, 8, ex1 + 2, 12, EMPTY);
    this.elev = { x0: ex0 * g.cs, x1: (ex1 + 1) * g.cs, z0: 1 * g.cs, z1: 7 * g.cs, zDoor: 8 * g.cs };
    connect(g, r, g.cell(this.spawn.x), g.cell(this.spawn.z), 5);
    this.dist = bfs(g, g.cell(this.spawn.x), g.cell(this.spawn.z));
    // lâmpadas penduradas (centro de cada 6 m e entre pilares)
    for (let j = 0; j < NZ; j++)
      for (let i = 0; i < NX; i++) {
        const zz = Z(i, j);
        for (const [ox, oz] of [
          [0.5, 0.5],
          [0, 0.5],
          [0.5, 0],
        ]) {
          if ((ox === 0 || oz === 0) && !r.chance(0.35)) continue;
          const x = (i + ox) * M * g.cs + (ox === 0 ? 0 : 0), z = (j + oz) * M * g.cs;
          if (!g.open(g.cell(x), g.cell(z))) continue;
          if (zz === 2) {
            if (r.chance(0.3)) this.lamp(x, z, { broken: true });
            continue;
          }
          const roll = r();
          this.lamp(x, z, { group: roll < 0.08 ? 1 : roll < 0.12 ? 2 : roll < 0.2 ? 3 : 0, broken: r.chance(0.06) });
        }
      }
    // a área em frente ao elevador é sempre iluminada
    for (const dx of [-3, 3]) this.lamp((this.elev.x0 + this.elev.x1) / 2 + dx, this.elev.z1 + 3.5, { group: 0 });
    // luz dentro do elevador
    const ecx = (this.elev.x0 + this.elev.x1) / 2, ecz = (this.elev.z0 + this.elev.z1) / 2;
    this.light(ecx, 3.1, ecz, 2.2, { kind: 'point', hx: 0.1, radius: 5, color: [1, 0.95, 0.85], group: 3 });
    this.elevLight = [ecx, ecz];
    // estantes e caixas
    for (let j = 0; j < NZ; j++)
      for (let i = 0; i < NX; i++) {
        if (i === 1 && j === 1) continue;
        const zz = Z(i, j);
        const cx = (i * M + M / 2) * g.cs, cz = (j * M + M / 2) * g.cs;
        if (Math.abs(cx - ecx) < 7 && cz < 10) continue;
        if (zz === 0) {
          const rot = noise2(i * 0.5, j * 0.5, 3) > 0.5 ? 0 : Math.PI / 2;
          for (const o of [-1.6, 1.6]) {
            const x = cx + (rot ? o : 0), z = cz + (rot ? 0 : o);
            if (this.areaFree(x, z, 2.8, 1.3, rot)) shelf(this, x, z, 3.6, rot, r);
          }
        } else if (zz === 1 || zz === 2) {
          const n = r.int(2, 5);
          for (let k = 0; k < n; k++) {
            const x = cx + r.range(-2, 2), z = cz + r.range(-2, 2);
            if (!this.areaFree(x, z, 1.4, 1.4, 0)) continue;
            const kind = r();
            if (kind < 0.5) {
              const s = r.range(0.6, 1.0);
              crate(this, x, z, s, r.range(0, 1.5));
              if (r.chance(0.4)) crate(this, x + r.range(-0.1, 0.1), z + r.range(-0.1, 0.1), s * 0.8, r.range(0, 1.5), s);
            } else if (kind < 0.8) {
              pallet(this, x, z, r.range(0, 1.5));
              for (let b = 0; b < r.int(1, 4); b++) cardboard(this, x + r.range(-0.3, 0.3), 0.14, z + r.range(-0.3, 0.3), r.range(0.3, 0.6), r.range(0.25, 0.5), r.range(0.3, 0.6), r.range(0, 1.5));
            } else cardboard(this, x, 0, z, r.range(0.4, 0.7), r.range(0.3, 0.6), r.range(0.4, 0.7), r.range(0, 3));
          }
        }
      }
    await this.finish(onProgress);
  }

  areaFree(x, z, w, d, rot) {
    const g = this.grid;
    const hw = (rot ? d : w) / 2 + 0.6, hd = (rot ? w : d) / 2 + 0.6;
    for (let zz = z - hd; zz <= z + hd; zz += 0.25)
      for (let xx = x - hw; xx <= x + hw; xx += 0.25) {
        const cx = g.cell(xx), cz = g.cell(zz);
        if (g.get(cx, cz) !== EMPTY) return false;
        if (g.propHi[cz * g.w + cx] > -1e8) return false;
      }
    if (Math.hypot(x - this.spawn.x, z - this.spawn.z) < 3) return false;
    return true;
  }

  // Lâmpada industrial pendurada: cabo, cúpula e lâmpada (luz pontual no bake).
  lamp(x, z, { group = 0, broken = false } = {}) {
    const H = this.H, y = H - 1.25;
    const cable = this.prop('cable', { color: 0x111111, roughness: 0.6 });
    cable.box(x, (H + y + 0.25) / 2, z, 0.012, H - y - 0.25, 0.012);
    const shadeG = new THREE.CylinderGeometry(0.06, 0.32, 0.26, 20, 1, true);
    const outer = this.prop('shade', { color: 0x2f4a3a, roughness: 0.45, metalness: 0.5, side: THREE.DoubleSide });
    outer.add(shadeG, new THREE.Matrix4().makeTranslation(x, y + 0.13, z));
    const capG = new THREE.CylinderGeometry(0.07, 0.07, 0.05, 12);
    outer.add(capG, new THREE.Matrix4().makeTranslation(x, y + 0.27, z));
    if (!broken) {
      this.light(x, y - 0.02, z, 4.6, { kind: 'point', hx: 0.12, radius: 14, group, color: this.panelColor });
      const bulb = this.prop('bulb' + group, { color: 0x000000, emissive: this.panelColor, emissiveIntensity: 9, emitPower: true, vlight: false });
      bulb.add(new THREE.SphereGeometry(0.06, 12, 8), new THREE.Matrix4().makeTranslation(x, y + 0.03, z));
    } else {
      const dead = this.prop('bulbdead', { color: 0x777064, roughness: 0.3 });
      dead.add(new THREE.SphereGeometry(0.06, 12, 8), new THREE.Matrix4().makeTranslation(x, y + 0.03, z));
    }
  }

  decorate(quads) {
    const g = this.grid, r = this.rr;
    scatterStains(this, quads, { walls: 140, floor: 40, ceil: 0, H: this.H });
    wallBits(this, quads, this.r, 30);
    // poças d'água (decalques brilhantes)
    const wet = this.decal('puddles', { map: 'stains.png', roughness: 0.03, color: 0x4a4a46, metalness: 0 });
    for (let i = 0; i < 70; i++) {
      const p = g.randomOpen(this.r);
      if (!p) break;
      const f = flatSpot(quads, p.x, p.z, K_FLOOR);
      if (!f) continue;
      const w = this.r.range(1.0, 3.2);
      wet.push({ q: f.q, s: f.s, t: f.t, w, h: w * this.r.range(0.5, 0.9), rot: this.r.range(0, 6.28), rect: atlasRect(4 + this.r.int(0, 3)), off: 0.003 });
      this.puddles.push({ x: p.x, z: p.z, r: w * 0.35 });
    }
    // fusíveis longe do início
    const far = [];
    let maxD = 0;
    for (const d of this.dist) maxD = Math.max(maxD, d);
    for (let k = 0; k < 4000 && far.length < 3; k++) {
      const p = g.randomOpen(r, this.spawn, 18);
      if (!p) continue;
      const d = this.dist[p.cz * g.w + p.cx];
      if (d < maxD * 0.35) continue;
      if (far.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < 22)) continue;
      if (Math.hypot(p.x - (this.elev.x0 + this.elev.x1) / 2, p.z - this.elev.z1) < 12) continue;
      far.push(p);
    }
    for (const p of far) {
      // num caixote, para destacar
      crate(this, p.x, p.z, 0.7, r.range(0, 1.5));
      addPickup(this, 'fuse', p.x, p.z, { y: 0.7, rot: r.range(0, 3), spark: true, onTake: () => this.takeFuse() });
    }
    // itens
    for (let i = 0; i < 6; i++) {
      const p = g.randomOpen(r, this.spawn, 6);
      if (p) addPickup(this, i < 3 ? 'almond' : 'battery', p.x, p.z, { rot: r.range(0, 6) });
    }
    const n1 = g.randomOpen(r, this.spawn, 2);
    if (n1) addPickup(this, 'note', Math.min(n1.x, this.spawn.x + 4), Math.min(n1.z, this.spawn.z + 4), { note: 'l1a' });
    const n2 = g.randomOpen(r, this.spawn, 20);
    if (n2) addPickup(this, 'note', n2.x, n2.z, { note: 'l1b' });
    this.buildElevator();
  }

  buildElevator() {
    const E = this.elev;
    const cx = (E.x0 + E.x1) / 2, w = E.x1 - E.x0, zDoor = E.z1;
    // cabine: piso de chapa e paredes metálicas (por dentro do nicho)
    const plate = this.prop('elevplate', { map: 'door_metal.jpg', roughness: 0.5, metalness: 0.6, color: 0x9a9a9a });
    plate.box(cx, 0.02, (E.z0 + E.z1) / 2, w - 0.05, 0.04, E.z1 - E.z0 - 0.05, { uvs: 2 });
    const rail = this.prop('elevrail', { color: 0xc9a227, roughness: 0.4, metalness: 0.5 });
    for (const y of [1.0, 1.05]) rail.box(cx, y, E.z0 + 0.15, w - 0.4, 0.04, 0.04);
    // faixa de alerta e moldura
    const haz = this.prop('hazard', { color: 0xd8b21c, roughness: 0.6 });
    haz.box(E.x0 - 0.12, this.doorH / 2, zDoor + 0.04, 0.2, this.doorH, 0.08);
    haz.box(E.x1 + 0.12, this.doorH / 2, zDoor + 0.04, 0.2, this.doorH, 0.08);
    haz.box(cx, this.doorH + 0.2, zDoor + 0.04, w + 0.44, 0.4, 0.1);
    // porta de enrolar (dinâmica)
    const sm = gameMaterial({ map: tex('l1_ceiling.jpg'), normalMap: tex('l1_ceiling_n.jpg', { srgb: false }), color: 0xa8a49a, roughness: 0.55, metalness: 0.5, probe: true, forcePBR: true });
    const sg = new THREE.PlaneGeometry(w, this.doorH, 1, 1);
    sg.rotateZ(Math.PI / 2);
    const uv = sg.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (this.doorH / 2), uv.getY(i) * (w / 2));
    this.shutter = new THREE.Mesh(sg, sm);
    this.shutter.rotation.z = 0;
    this.shutterG = new THREE.Group();
    this.shutterG.position.set(cx, this.doorH / 2, zDoor + 0.03);
    this.shutterG.add(this.shutter);
    this.shutter.castShadow = true;
    this.group.add(this.shutterG);
    this.pickups.push({ obj: this.shutterG, kind: 'shutter' });
    this.shutterCol = this.grid.addSolid(E.x0, zDoor - 0.05, E.x1, zDoor + 0.08, 0, this.doorH, { occlude: false, nav: false });
    this.shutterY = 0;
    // quadro de força ao lado
    const px = E.x1 + 1.3, pz = zDoor + 0.5;
    // fica preso na parede frontal (z = zDoor), voltado para +z
    const box = this.prop('breaker', { color: 0x6d7276, roughness: 0.5, metalness: 0.5 });
    box.box(px, 1.45, zDoor + 0.11, 0.7, 0.9, 0.2);
    const lab = this.prop('breakerlab', { color: 0xd8b21c, roughness: 0.6 });
    lab.box(px, 1.82, zDoor + 0.215, 0.5, 0.08, 0.01);
    const slots = this.prop('slots', { color: 0x141414, roughness: 0.7 });
    for (let i = 0; i < 3; i++) slots.box(px - 0.18 + i * 0.12, 1.5, zDoor + 0.215, 0.08, 0.22, 0.01);
    this.breaker = { x: px, z: zDoor + 0.22 };
    // fusíveis inseridos (aparecem depois)
    this.fuseMeshes = [];
    const fm = gameMaterial({ color: 0xe9e2d0, roughness: 0.5, probe: true, forcePBR: true });
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.12, 10), fm);
      f.position.set(px - 0.18 + i * 0.12, 1.5, zDoor + 0.235);
      f.visible = false;
      this.group.add(f);
      this.fuseMeshes.push(f);
    }
    this.pickups.push({ obj: this.fuseMeshes[0], kind: 'deco' });
    // alavanca
    const lv = new THREE.Group();
    lv.position.set(px + 0.26, 1.35, zDoor + 0.24);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.32, 0.04), gameMaterial({ color: 0x8a8d90, metalness: 0.8, roughness: 0.3, probe: true, forcePBR: true }));
    arm.position.y = 0.16;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 10), gameMaterial({ color: 0xc0281e, roughness: 0.4, probe: true, forcePBR: true }));
    knob.position.y = 0.33;
    lv.add(arm, knob);
    lv.rotation.x = -0.5;
    this.lever = lv;
    this.leverA = -0.5;
    this.group.add(lv);
    this.pickups.push({ obj: lv, kind: 'deco' });
    this.interactables.push({
      pos: new THREE.Vector3(px - 0.06, 1.5, zDoor + 0.25),
      r: 0.3,
      label: () => (this.fuses >= 3 ? t('p_panel') : t('p_panel_need', { n: this.fuses })),
      can: () => this.fuses >= 3,
      enabled: () => !this.inserted,
      use: () => {
        this.inserted = true;
        this.fuseMeshes.forEach((f) => (f.visible = true));
        this.game.audio.clank(px, 1.5, zDoor);
      },
    });
    this.interactables.push({
      pos: new THREE.Vector3(px + 0.26, 1.55, zDoor + 0.28),
      r: 0.2,
      label: () => t('p_lever'),
      enabled: () => this.inserted && !this.powered,
      use: () => this.powerOn(),
    });
    this.interactables.push({
      pos: new THREE.Vector3(cx, 1.4, (E.z0 + E.z1) / 2),
      r: 1.2,
      label: () => t('p_lift'),
      enabled: () => this.shutterY > 2.6,
      use: () => {
        this.game.audio.elevator();
        this.game.completeLevel();
      },
    });
  }

  takeFuse() {
    this.fuses++;
    this.game.ui.toast(t('t_fuse', { n: this.fuses }));
  }

  powerOn() {
    this.powered = true;
    this.blackout = false;
    this.powerTarget = 1;
    this.powerRate = 0.8;
    this.game.audio.lever();
    this.game.audio.powerUp();
    this.game.ui.toast(t('t_power_on'), 4);
    this.flick[3].kind = 'buzz';
    for (const s of this.smilers) s.vanish(false);
    this.elevT = 3.5;
  }

  afterBake() {
    this.nav = new Nav(this.grid);
    for (let i = 0; i < 2; i++) {
      const s = new Smiler(this, 40 + i);
      this.smilers.push(s);
      this.entities.push(s);
      this.group.add(s.object);
    }
    this.flick[3].kind = 'dying';
  }

  setEnv(env) {
    if (!this.meshFloor.material.isMeshStandardMaterial) return;
    this.meshFloor.material.envMap = env;
    this.meshFloor.material.envMapIntensity = 0.22;
    this.meshFloor.material.needsUpdate = true;
  }

  onRespawn() {
    for (const s of this.smilers) {
      s.active = false;
      s.group.visible = false;
    }
    this.blackoutT = 40;
  }

  update(dt) {
    super.update(dt);
    const g = this.game;
    const playing = g.state === 'play';
    // apagões
    if (!this.powered && playing) {
      this.blackoutT -= dt;
      if (this.blackoutT <= 0) {
        if (!this.blackout) {
          this.blackout = true;
          this.powerTarget = 0.015;
          this.powerRate = 1.2;
          this.blackoutT = 22 + this.rr() * 10;
          g.audio.powerDown();
          g.ui.toast(t('t_blackout'), 3);
          this.spawnT = 3;
        } else {
          this.blackout = false;
          this.powerTarget = 1;
          this.powerRate = 3;
          this.blackoutT = 65 + this.rr() * 40;
          g.audio.powerUp();
          g.ui.toast(t('t_power_back'));
          for (const s of this.smilers) s.vanish(false);
        }
      }
    }
    // Sorridentes aparecem no escuro
    if (playing) {
      const p = g.player.pos;
      const dark = this.lightLevel(p.x, p.z) < 0.08;
      this.spawnT = (this.spawnT ?? 6) - dt;
      if (dark && this.spawnT <= 0) {
        this.spawnT = this.blackout ? 7 + this.rr() * 5 : 14 + this.rr() * 10;
        const s = this.smilers.find((x) => !x.active);
        if (s) {
          // atrás ou ao lado, num lugar escuro a 9–15 m
          for (let k = 0; k < 60; k++) {
            const a = this.rr() * Math.PI * 2, d = 9 + this.rr() * 6;
            const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
            const cx = this.grid.cell(x), cz = this.grid.cell(z);
            if (!this.grid.walkable(cx, cz)) continue;
            if (this.lightLevel(x, z) > 0.08) continue;
            s.spawn(x, z);
            break;
          }
        }
      }
    }
    // elevador chegando
    if (this.powered) {
      this.elevT -= dt;
      if (this.elevT <= 0 && this.shutterY < 3.3) {
        if (this.shutterY === 0) g.audio.door((this.elev.x0 + this.elev.x1) / 2, 1.5, this.elev.z1);
        this.shutterY = Math.min(3.3, this.shutterY + dt * 0.9);
        this.shutterG.position.y = this.doorH / 2 + this.shutterY;
        this.shutterG.scale.y = 1 - (this.shutterY / 3.3) * 0.85;
        this.shutterG.position.y -= (this.doorH * (this.shutterY / 3.3) * 0.85) / 2;
        if (this.shutterY > 2.4) this.shutterCol.on = false;
      }
    }
    // alavanca
    this.leverA = lerp(this.leverA, this.powered ? 0.6 : -0.5, Math.min(1, dt * 8));
    this.lever.rotation.x = this.leverA;
  }

  surfaceAt(x, z) {
    for (const p of this.puddles) if (Math.hypot(p.x - x, p.z - z) < p.r) return 'wet';
    return 'concrete';
  }

  objective() {
    const items = `${t('hud_fuses')}&nbsp; ${[0, 1, 2].map((i) => `<span class="slot">${i < this.fuses ? '■' : '&nbsp;'}</span>`).join('')}`;
    if (this.shutterY > 2.4) return { text: t('obj_l1_lift'), items };
    if (this.inserted) return { text: t('obj_l1_lever'), items };
    if (this.fuses >= 3) return { text: t('obj_l1_panel'), items };
    return { text: t('obj_l1_fuses', { n: this.fuses }), items };
  }
}
