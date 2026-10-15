// Nível 3 — "Estação Elétrica": corredores apertados de tijolos de cores
// desencontradas, piso de concreto empoeirado, luzes fluorescentes fracas,
// cabos, caixas elétricas e um zumbido que nunca para. Dois andares.
// Entidade: o Cão (não é rápido, mas persegue de muito longe).
// Segredo: um portão enorme trancado; a chave branca abre e revela um salão de
// robótica onde os robôs tomaram conta. Lá, o computador destrava a porta de
// saída do segundo andar (→ Nível 4).
//
// Os dois andares ficam na mesma grade: o 2º andar começa na célula x = 1000.
import * as THREE from 'three';
import { GridLevel, W, EH, EV, pushCircle } from './grid.js';
import { getTex, indoorEnvTex, textCanvasTex } from '../textures.js';
import { panelMaterial } from '../materials.js';
import { clamp, fbm, hash3, mulberry32 } from '../util.js';
import './level3_tex.js';
import './level0_1_tex.js';
import { standardWake } from './wake.js';
import { RobotHall, textScreen } from './level3_hall.js';
import { GridHounds } from './level3_hound.js';
import { keyMesh } from './level2.js';

const F2 = 1000; // primeira coluna do 2º andar
// salão dos robôs (células, inclusive no início, exclusivo no fim)
const HALL = { x0: 14, x1: 22, z0: -8, z1: 0 };
const GATE = [-5, -4]; // linhas (iz) do portão na parede oeste do salão

export class Level3 extends GridLevel {
  constructor(game) {
    super(game, {
      cell: 3,
      H: 3,
      T: 0.24,
      doorW: 1.1,
      doorH: 2.2,
      chunkCells: 8,
      seed: (game.seed ^ 0x3333) >>> 0,
      lightRadius: 10,
      lightEmitPow: 1,
      bounce: 0.35,
      ambient: 0.006,
      wallUV: [2, 2],
      floorUV: 3,
      ceilUV: 3,
    });
    this.num = 3;
    this.surface = 'concrete';
    this.panelI = 7;
    this.flickerGap = 4;
    const S = this.Q.tex;
    const br = getTex('l3Brick', S);
    const cf = getTex('concreteFloor', S);
    const sl = getTex('slab', S);
    const pn = getTex('panel', S);
    const gr = getTex('grime', S);
    const env = game.makeEnv(indoorEnvTex(['#3a2a1e', '#22180f', '#120c08'], '#ffe6b0', 4));
    this.mats = {
      floor: { map: cf.map, normalMap: cf.normalMap, roughnessMap: cf.roughnessMap, roughness: 1, dirtColor: new THREE.Color(0.55, 0.5, 0.42), dirtAmt: 0.75, wet: 0.2, envMap: env, envIntensity: 0.5 },
      wall: { map: br.map, normalMap: br.normalMap, roughnessMap: br.roughnessMap, roughness: 1, vertexColors: true, envMap: env, envIntensity: 0.25 },
      ceil: { map: sl.map, roughness: 1, lmIntensity: 0.3, vertexColors: true, color: 0x9a948a },
      prop: { map: gr.map, normalMap: gr.normalMap, vertexColors: true, roughness: 0.55, metalness: 0.4, envMap: env, envIntensity: 0.6 },
    };
    this.panelMat = panelMaterial(pn.map, 0xfff0d0);
    this.look = {
      exposure: 1.0,
      tint: [1.06, 0.98, 0.9],
      sat: 0.9,
      contrast: 1.12,
      lift: [0.008, 0.006, 0.004],
      bloom: 0.22,
      fog: [0.05, 0.04, 0.03],
      fogNear: 0.12,
      lightColor: [1.0, 0.9, 0.74],
      flashlight: true,
      ambience: 'level3',
      reverb: 2.2,
      sanityDrain: 0.2,
    };
    this.objectives = [
      { id: 'key', text: 'Encontre a chave branca' },
      { id: 'gate', text: 'Abra o grande portão trancado' },
      { id: 'pc', text: 'Ache o computador e aperte ENTER' },
      { id: 'up', text: 'Suba para o 2º andar' },
      { id: 'exit', text: 'Saia pela porta do 2º andar' },
    ];
    this.exitOpen = false;
    this.route();
  }

  // ------------------------------------------------------------ andares
  floorOf(x) {
    return x >= F2 * this.cell - 30 ? 2 : 1;
  }

  inHall(ix, iz) {
    return ix >= HALL.x0 && ix < HALL.x1 && iz >= HALL.z0 && iz < HALL.z1;
  }

  houndBlocked(ix, iz) {
    return this.inHall(ix, iz);
  }

  // ------------------------------------------------------------ planta
  genEdge(kind, ix, iz) {
    const ax = ix;
    const az = iz;
    const bx = kind === EH ? ix : ix - 1;
    const bz = kind === EH ? iz - 1 : iz;
    // fronteira entre os andares
    if (kind === EV && ix === F2) return W.FULL;
    // salão dos robôs
    const ha = this.inHall(ax, az);
    const hb = this.inHall(bx, bz);
    if (ha && hb) return W.NONE;
    if (ha !== hb) {
      if (kind === EV && ix === HALL.x0 && GATE.includes(iz)) return W.NONE;
      return W.FULL;
    }
    // labirinto de tijolos: muitas paredes, corredores estreitos
    const fl = ix >= F2 ? 2 : 1;
    const sd = this.seed + fl * 101;
    const z = fbm(ix * 0.1, iz * 0.1, 3, sd + 4);
    const p = z > 0.22 ? 0.3 : 0.5;
    const h = hash3(ix * 2 + kind, iz, sd);
    if (h >= p) return W.NONE;
    const t = hash3(ix, iz * 3 + kind, sd + 7);
    if (t < 0.28) return W.DOOR;
    if (t < 0.36) return W.HALF_A;
    if (t < 0.44) return W.HALF_B;
    return W.FULL;
  }

  dark(cx, cz) {
    return fbm(cx * 0.1 + 70, cz * 0.1, 3, this.seed + 8) < -0.18;
  }

  genLight(cx, cz) {
    if (this.inHall(cx, cz) || (cx + cz) & 1) return null;
    const h = this.hashCell(cx, cz, 3);
    let group = 0;
    if (this.dark(cx, cz)) group = h < 0.8 ? 3 : 1;
    else if (h < 0.1) group = 3;
    else if (h < 0.2) group = 1;
    else if (h < 0.28) group = 2;
    const ax = (cz & 2) === 0 ? 0 : 1;
    return { x: cx * this.cell + 1.5, z: cz * this.cell + 1.5, y: this.H - 0.02, ax, len: 1.2, wid: 0.22, I: 7, group };
  }

  dirt(x, z) {
    const n = fbm(x * 0.13, z * 0.13, 3, this.seed + 11);
    return clamp((n + 0.1) / 0.3, 0, 1);
  }

  // Cabos e caixas elétricas pregados nos tijolos.
  decorateEdge(G, kind, ix, iz, t) {
    if (t !== W.FULL) return;
    const h = hash3(ix * 7 + kind, iz * 5, this.seed + 31);
    if (h > 0.55) return;
    const c = this.cell;
    const hT = this.T / 2;
    const s = h < 0.27 ? 1 : -1;
    const n = 1 + Math.floor(hash3(ix, iz, this.seed + 32) * 3);
    for (let k = 0; k < n; k++) {
      const y = 2.55 - k * 0.12;
      const r = 0.025 + k * 0.008;
      const col = [[0.08, 0.08, 0.08], [0.25, 0.08, 0.06], [0.3, 0.3, 0.28]][k % 3];
      if (kind === EH) G.prop.cylinder(ix * c + c / 2, y, iz * c + s * (hT + r + 0.01), r, c, col, G.lm, { axis: 'x', sides: 6, caps: false });
      else G.prop.cylinder(ix * c + s * (hT + r + 0.01), y, iz * c + c / 2, r, c, col, G.lm, { axis: 'z', sides: 6, caps: false });
    }
    if (h < 0.18) {
      const a = 0.6 + hash3(ix, iz, this.seed + 33) * 1.8;
      const off = hT + 0.1;
      const col = [0.45, 0.46, 0.42];
      if (kind === EH) {
        G.prop.box(ix * c + a, 1.5, iz * c + s * off, 0.45, 0.6, 0.2, col, G.lm, {});
        G.prop.box(ix * c + a, 1.5, iz * c + s * (off + 0.105), 0.06, 0.08, 0.02, [0.7, 0.1, 0.08], G.lm, { ao: 0 });
        G.prop.box(ix * c + a, 2.1, iz * c + s * (hT + 0.03), 0.05, 0.6, 0.05, [0.1, 0.1, 0.1], G.lm, { ao: 0 });
      } else {
        G.prop.box(ix * c + s * off, 1.5, iz * c + a, 0.2, 0.6, 0.45, col, G.lm, {});
        G.prop.box(ix * c + s * (off + 0.105), 1.5, iz * c + a, 0.02, 0.08, 0.06, [0.7, 0.1, 0.08], G.lm, { ao: 0 });
        G.prop.box(ix * c + s * (hT + 0.03), 2.1, iz * c + a, 0.05, 0.6, 0.05, [0.1, 0.1, 0.1], G.lm, { ao: 0 });
      }
    }
  }

  genProps(ch, cx0, cz0) {
    const N = this.chunkCells;
    const c = this.cell;
    for (let z = cz0; z < cz0 + N; z++)
      for (let x = cx0; x < cx0 + N; x++) {
        if (this.inHall(x, z)) continue;
        const h = this.hashCell(x, z, 51);
        if (h > 0.992) ch.items.push({ type: 'water', key: `3:${x}:${z}:w`, x: x * c + 1.5, z: z * c + 1.5 });
        else if (h > 0.982) ch.items.push({ type: 'note', key: `3:${x}:${z}:n`, x: x * c + 1.5, z: z * c + 1.2, rot: h * 50 });
        else if (h > 0.972) ch.items.push({ type: 'battery', key: `3:${x}:${z}:b`, x: x * c + 1.2, z: z * c + 1.6 });
      }
  }

  // Piso e teto da grade sem o salão (ele tem os seus, mais altos).
  buildFloorCeil(G, ch) {
    const c = this.cell;
    const hall = { x0: HALL.x0 * c, x1: HALL.x1 * c, z0: HALL.z0 * c, z1: HALL.z1 * c };
    let rects = [{ x0: ch.x0, x1: ch.x0 + this.S, z0: ch.z0, z1: ch.z0 + this.S }];
    const q = rects[0];
    if (!(hall.x1 <= q.x0 || hall.x0 >= q.x1 || hall.z1 <= q.z0 || hall.z0 >= q.z1)) {
      rects = [];
      if (hall.z0 > q.z0) rects.push({ x0: q.x0, x1: q.x1, z0: q.z0, z1: hall.z0 });
      if (hall.z1 < q.z1) rects.push({ x0: q.x0, x1: q.x1, z0: hall.z1, z1: q.z1 });
      const z0 = Math.max(q.z0, hall.z0);
      const z1 = Math.min(q.z1, hall.z1);
      if (hall.x0 > q.x0) rects.push({ x0: q.x0, x1: hall.x0, z0, z1 });
      if (hall.x1 < q.x1) rects.push({ x0: hall.x1, x1: q.x1, z0, z1 });
    }
    for (const r of rects) {
      this.hface(G.floor, r.x0, r.x1, r.z0, r.z1, 0, true, G.lm, this.floorUV);
      this.hface(G.ceil, r.x0, r.x1, r.z0, r.z1, this.H, false, G.lm, this.ceilUV);
    }
  }

  // ------------------------------------------------------------ rota
  route() {
    const rnd = mulberry32(this.seed * 5 + 3);
    const c = this.cell;
    const ring = (r0, r1, a0, a1) => {
      const a = a0 + rnd() * (a1 - a0);
      const r = r0 + rnd() * (r1 - r0);
      return [Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r)];
    };
    this.clearCell(0, 0);
    // 1º andar: chave branca (oeste/sudoeste), escada (noroeste), portão (leste)
    const [kx, kz] = ring(15, 19, Math.PI * 0.6, Math.PI * 1.0);
    const [sx, sz] = ring(13, 17, Math.PI * 1.1, Math.PI * 1.45);
    const gx = HALL.x0 - 1;
    const gz = GATE[0];
    for (const [x, z] of [
      [kx, kz],
      [sx, sz],
      [gx, gz],
      [gx, GATE[1]],
    ])
      this.clearCell(x, z);
    this.carve(0, 0, kx, kz, rnd);
    this.carve(0, 0, sx, sz, rnd);
    this.carve(0, 0, gx, gz, rnd);
    this.setEdge(EH, gx, GATE[1], W.NONE);
    this.keyP = { x: kx * c + c / 2, z: kz * c + c / 2 };
    this.stairs1 = { ix: sx, iz: sz, x: sx * c + c / 2, z: sz * c + c / 2 };
    // 2º andar: chegada e porta de saída
    const ax = F2 + 2;
    const az = 0;
    const [ex, ez] = ring(15, 20, -Math.PI * 0.45, Math.PI * 0.45);
    const dx = ax + Math.abs(ex);
    const dz = ez;
    this.clearCell(ax, az);
    this.clearCell(dx, dz);
    this.carve(ax, az, dx, dz, rnd);
    this.stairs2 = { ix: ax, iz: az, x: ax * c + c / 2, z: az * c + c / 2 };
    // porta na parede leste da célula final
    this.setEdge(EV, dx + 1, dz, W.EXIT);
    this.exitDoor = { x: (dx + 1) * c - this.T / 2 - 0.01, z: dz * c + c / 2 };
    this.exit = this.exitDoor;
    this.spawn = { x: c / 2, z: c / 2, yaw: -Math.PI / 2 };
    // salão dos robôs
    const ins = this.T / 2 + 0.02;
    this.hall = new RobotHall(
      this,
      { x0: HALL.x0 * c + ins, x1: HALL.x1 * c - ins, z0: HALL.z0 * c + ins, z1: HALL.z1 * c - ins },
      { z0: GATE[0] * c, z1: (GATE[1] + 1) * c },
    );
    this.makeStairs();
    this.makeExitDoor();
  }

  // Escadas (subir no 1º andar, descer no 2º): degraus encostados na parede.
  makeStairs() {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0x7a7268, emissive: 0x141210 });
    const rail = new THREE.MeshLambertMaterial({ color: 0x3a3a38, emissive: 0x080808 });
    const sign = (txt) => textCanvasTex(256, 96, (c, w, h) => {
      c.fillStyle = '#12301c';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#d8ffe0';
      c.font = 'bold 40px Arial, Helvetica, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(txt, w / 2, h / 2 + 2);
    });
    this.stairTex = [sign('ANDAR 2 ↑'), sign('ANDAR 1 ↓')];
    const make = (S, up, tex) => {
      const s = new THREE.Group();
      for (let k = 0; k < 9; k++) {
        const st = new THREE.Mesh(new THREE.BoxGeometry(1.2, up ? 0.18 * (k + 1) : 0.18, 0.3), mat);
        st.position.set(0, up ? 0.09 * (k + 1) : -0.09 - k * 0.18, -1.2 + k * 0.3);
        s.add(st);
      }
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 2.8), rail);
      r.position.set(0.6, up ? 1.5 : 0.9, 0);
      r.rotation.x = up ? -0.55 : 0.55;
      s.add(r);
      const sm = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.3), new THREE.MeshBasicMaterial({ map: tex }));
      sm.material.color.setScalar(0.9);
      sm.position.set(0, 2.5, -1.45);
      s.add(sm);
      if (!up) {
        const hole = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.7), new THREE.MeshBasicMaterial({ color: 0x000000 }));
        hole.rotation.x = -Math.PI / 2;
        hole.position.set(0, 0.004, 0);
        s.add(hole);
      }
      s.position.set(S.x, 0, S.z);
      g.add(s);
    };
    make(this.stairs1, true, this.stairTex[0]);
    make(this.stairs2, false, this.stairTex[1]);
    this.dynamic.add(g);
    this.stairMats = [mat, rail];
    this.stairGroup = g;
  }

  makeExitDoor() {
    const d = this.exitDoor;
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0x6a6e72, roughness: 0.45, metalness: 0.75, emissive: 0x101214 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 1.1), steel);
    slab.position.set(-0.04, 1.1, 0);
    this.lampMat = new THREE.MeshBasicMaterial({ color: 0xff2010 });
    this.lampMat.color.multiplyScalar(2.5);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), this.lampMat);
    lamp.position.set(-0.1, 2.45, 0);
    this.exitTex = textScreen('SAÍDA', 'TRAVADA PELO CR-3', '#ff5040');
    this.exitTexOpen = textScreen('SAÍDA', 'LIBERADA', '#40ff80');
    this.exitScreenMat = new THREE.MeshBasicMaterial({ map: this.exitTex });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), this.exitScreenMat);
    scr.position.set(-0.1, 1.45, 0.75);
    scr.rotation.y = -Math.PI / 2;
    g.add(slab, lamp, scr);
    g.position.set(d.x, 0, d.z);
    this.dynamic.add(g);
    this.exitMats = [steel, this.lampMat, this.exitScreenMat];
  }

  unlockExit() {
    this.exitOpen = true;
    this.lampMat.color.setRGB(0.25, 2.5, 0.6);
    this.exitScreenMat.map = this.exitTexOpen;
  }

  // ------------------------------------------------------------ quadro
  tick(dt, player) {
    const g = this.game;
    this.time = (this.time || 0) + dt;
    if (!this.hounds) this.hounds = new GridHounds(this);
    if (this.wake === undefined)
      this.wake = standardWake(
        this,
        this.spawn.x,
        this.spawn.z,
        this.spawn.yaw,
        [
          [1.0, 'Poeira de tijolo na boca. Um zumbido elétrico baixo, por toda parte.'],
          [4.2, 'Cabos estalam nas paredes. Algo pinga.'],
          [7.3, 'Bem longe, um latido rouco. Depois, silêncio.'],
          [10.2, ''],
        ],
        { sound: 'crackle', done: () => g.hud.objective('Nível 3: a estação elétrica. Algo anda de quatro por aqui. Não corra perto dele.', 7) },
      );
    this.hall.update(dt, this.time, player);
    if (this.wake.active) {
      this.wake.update(dt);
      return;
    }
    if (this.hall.cine !== undefined && this.hall.cine !== null) {
      this.noHounds = true;
      this.hall.updateCine(dt);
      return;
    }
    this.noHounds = !!this.climbing;
    this.hounds.update(dt, player);
    this.sanityExtra = (this.houndFear || 0) * 0.45;
    const p = player.pos;
    // entrar no salão pela primeira vez
    const c = this.cell;
    if (this.inHall(Math.floor(p.x / c), Math.floor(p.z / c)) && !this.inHallTold) {
      this.inHallTold = true;
      g.hud.message('Ar frio e limpo. Zumbido de servos. Os robôs acompanham você com os visores.', 4.5);
    }
  }

  // Sobe/desce entre os andares (escurece, carrega o outro andar, clareia).
  async climb(to) {
    const g = this.game;
    if (this.climbing) return;
    this.climbing = true;
    g.player.frozen = true;
    g.fadeTarget = 1;
    g.audio.play(g.audio.B.step.concrete, { gain: 0.3, rate: 0.9 });
    await new Promise((r) => setTimeout(r, 900));
    const S = to === 2 ? this.stairs2 : this.stairs1;
    const ox = to === 2 ? 0 : 0;
    const oz = to === 2 ? 1.6 : 1.6;
    await this.preload(S.x + ox, S.z + oz);
    if (g.level !== this) return;
    g.player.pos.set(S.x + ox, 0, S.z + oz);
    g.player.yaw = 0;
    g.fadeTarget = 0;
    g.player.frozen = false;
    this.climbing = false;
    if (to === 2) {
      g.completeObjective('up', this.exitOpen ? '2º andar. A porta de saída está liberada.' : '2º andar. A porta de saída deve estar por aqui… e trancada.');
    } else g.hud.message('1º andar.', 2);
  }

  collide(p, r) {
    super.collide(p, r);
    for (let it = 0; it < 2; it++) {
      const gc = this.hall.gateCollider();
      if (gc) pushCircle(p, r, gc[0], gc[1], gc[2], gc[3]);
      for (const b of this.hall.colliders) {
        if (p.x < b[0] - 1 || p.x > b[1] + 1 || p.z < b[2] - 1 || p.z > b[3] + 1) continue;
        pushCircle(p, r, b[0], b[1], b[2], b[3]);
      }
      // escadas: corrimão lateral
      for (const S of [this.stairs1, this.stairs2]) pushCircle(p, r, S.x + 0.62, S.x + 0.7, S.z - 1.4, S.z + 1.4);
    }
    return p;
  }

  groundY() {
    return 0;
  }

  pushOutSafe() {}

  inSafe() {
    return false;
  }

  interactable(player) {
    const p = player.pos;
    const g = this.game;
    if (this.climbing || (this.hall.cine !== undefined && this.hall.cine !== null)) return null;
    // portão
    const G = this.hall.gate;
    if (G.open < 0.5 && Math.abs(p.z - G.zc) < 3 && p.x < G.x && G.x - p.x < 2.4) {
      if (!g.inventory.has('chaveBranca'))
        return {
          label: 'Portão trancado',
          action: () => {
            g.audio.play('knock', { gain: 0.4, rate: 0.6 });
            g.hud.message('Um portão enorme de grades, com um cadeado branco. “FORA DOS LIMITES”. Do outro lado, zumbido de máquinas.', 4.5);
          },
        };
      return {
        label: 'Abrir o portão com a chave branca',
        action: () => {
          g.inventory.remove('chaveBranca');
          this.hall.startCine();
        },
      };
    }
    // computador
    const pc = this.hall.pc;
    if (G.open > 0.5 && Math.hypot(p.x - pc.x, p.z - pc.z) < 1.5) return { label: 'Usar o computador', action: () => this.computer() };
    // escadas
    const s1 = this.stairs1;
    if (Math.hypot(p.x - s1.x, p.z - s1.z) < 1.8) return { label: 'Subir para o 2º andar', action: () => this.climb(2) };
    const s2 = this.stairs2;
    if (Math.hypot(p.x - s2.x, p.z - s2.z) < 1.8) return { label: 'Descer para o 1º andar', action: () => this.climb(1) };
    // saída
    const d = this.exitDoor;
    if (Math.hypot(p.x - (d.x - 0.6), p.z - d.z) < 1.4) {
      if (!this.exitOpen)
        return {
          label: 'Porta de saída (travada)',
          action: () => {
            g.audio.play('beep', { gain: 0.35, rate: 0.5 });
            g.hud.message('Luz vermelha. A tela diz: “TRAVADA PELO CR-3”. Algum computador controla esta porta.', 4);
          },
        };
      return {
        label: 'Abrir a porta de saída',
        action: () => {
          g.completeObjective('exit', 'A porta se abre. Atrás dela, um corredor de escritório e o cheiro de carpete.');
          g.reachExit('door', 0.8);
        },
      };
    }
    return null;
  }

  computer() {
    const g = this.game;
    const hud = g.hud;
    const say = (text, choices) => hud.dialog('Terminal CR-3', text, choices, '');
    if (this.exitOpen) {
      say('> PORTA SAÍDA (ANDAR 2): LIBERADA.\n> UNIDADES EM ALERTA.', [{ text: 'Sair', fn: () => hud.closeDialog() }]);
      return;
    }
    g.audio.play('beep', { gain: 0.3, rate: 1.4 });
    say('> SISTEMA DE CONTROLE ROBÓTICO CR-3\n> PORTA SAÍDA (ANDAR 2): TRAVADA\n> PARA LIBERAR, PRESSIONE ENTER.', [
      {
        text: '[ ENTER ]',
        fn: () => {
          hud.closeDialog();
          this.unlockExit();
          this.hall.alarm = 6;
          g.audio.play('alarm', { gain: 0.35 });
          g.audio.play('ding', { gain: 0.4, when: 0.4 });
          g.vibrate(150);
          g.completeObjective('pc', 'ENTER. Um estalo distante: a porta do 2º andar destravou. Todos os robôs viram a cabeça para você.');
        },
      },
      { text: 'Sair', fn: () => hud.closeDialog() },
    ]);
  }

  navTarget() {
    const g = this.game;
    const has = g.inventory.has('chaveBranca');
    const G = this.hall.gate;
    const f = this.floorOf(g.player.pos.x);
    if (!this.exitOpen) {
      if (f === 2) return this.stairs2;
      if (G.open < 0.5) return has ? { x: G.x - 1, z: G.zc } : this.keyP;
      return this.hall.pc;
    }
    return f === 1 ? this.stairs1 : this.exitDoor;
  }

  exitEmitter() {
    return { x: this.exitDoor.x, y: 1.4, z: this.exitDoor.z, sound: 'hum', gain: 0.3 };
  }

  dispose() {
    if (this.wake) this.wake.dispose();
    if (this.hounds) this.hounds.dispose();
    this.hall.dispose();
    this.stairGroup.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material.isMeshBasicMaterial) o.material.dispose();
    });
    for (const m of [...this.stairMats, ...this.exitMats]) m.dispose();
    for (const t of [...this.stairTex, this.exitTex, this.exitTexOpen]) t.dispose();
    super.dispose();
  }
}

// A chave branca (criada com o bloco onde fica).
Level3.prototype.onChunkBuilt = function (ch) {
  const k = this.keyP;
  if (this.keySpawned || this.taken.has('3:key')) return;
  if (this.chunkAt(k.x, k.z) !== ch) return;
  this.keySpawned = true;
  this.game.items.spawn(
    {
      type: 'key',
      key: '3:key',
      x: k.x,
      z: k.z,
      y: 0.02,
      label: 'Pegar a chave branca',
      makeMesh: (it) => keyMesh(this, it, 0xf4f4f0, 0x606060),
      onUse: (game) => {
        game.inventory.add('chaveBranca');
        game.audio.play('ding', { gain: 0.4, rate: 1.2 });
        game.completeObjective('key', 'Uma chave branca, fria como plástico. Na etiqueta: “PORTÃO — ROBÓTICA”.');
      },
    },
    this.dynamic,
  );
};

