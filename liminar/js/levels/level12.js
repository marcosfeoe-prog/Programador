// Nível 12 — "Matrix", área 1: uma salinha branca e bem iluminada, com uma
// mesa, uma cadeira e uma porta. Do outro lado da porta, corredores brancos
// intermináveis em grade. Em algum cruzamento há uma passagem no chão que desce
// para a área 2 (a rua da lua vermelha).
// O nível se "autocensura": filtros de gravação (VHS, câmera, CCTV) falham aqui.
import * as THREE from 'three';
import { GridLevel, W, EH, EV } from './grid.js';
import { getTex, indoorEnvTex } from '../textures.js';
import { panelMaterial } from '../materials.js';
import { clamp, mulberry32 } from '../util.js';
import './level0_1_tex.js';

const ROOM = { x0: 0, x1: 2, z0: 0, z1: 2 }; // células da sala inicial (inclusive)
const DOOR = { ix: 1, iz: 0 }; // aresta EH na parede norte da sala
const RECORDING = ['vhs', 'cctv', 'digicam'];

const mod = (a, n) => ((a % n) + n) % n;

export class Level12 extends GridLevel {
  constructor(game) {
    super(game, {
      cell: 2.4,
      H: 2.9,
      T: 0.16,
      doorW: 1.0,
      doorH: 2.2,
      chunkCells: 8,
      seed: (game.seed ^ 0x1212) >>> 0,
      lightRadius: 10,
      lightEmitPow: 1,
      bounce: 0.75,
      ambient: 0.09,
      wallUV: [2.4, 2.9],
      floorUV: 2.4,
      ceilUV: 1.2,
    });
    this.num = 12;
    this.surface = 'tile';
    this.panelI = 8;
    this.flickerGap = 30;
    const S = this.Q.tex;
    const dw = getTex('drywall', S);
    const fl = getTex('zFloor', S);
    const ce = getTex('ceiling', S);
    const pn = getTex('panel', S);
    const env = game.makeEnv(indoorEnvTex(['#f4f6f8', '#e2e5e8', '#cfd3d6'], '#ffffff'));
    this.mats = {
      floor: { map: fl.map, normalMap: fl.normalMap, normalScale: 0.4, roughness: 0.35, color: 0xf7f8fa, envMap: env, envIntensity: 0.7, wet: 0 },
      wall: { map: dw.map, normalMap: dw.normalMap, normalScale: 0.3, roughness: 0.8, color: 0xf6f7f8, vertexColors: true, envMap: env, envIntensity: 0.2 },
      ceil: { map: ce.map, normalMap: ce.normalMap, roughness: 0.95, lmIntensity: 0.55, vertexColors: true, color: 0xf8f8f8 },
      prop: { vertexColors: true, roughness: 0.5, envMap: env, envIntensity: 0.5 },
    };
    this.panelMat = panelMaterial(pn.map, 0xffffff);
    this.look = {
      exposure: 1.12,
      tint: [1.0, 1.0, 1.01],
      sat: 0.35,
      contrast: 1.02,
      lift: [0.03, 0.03, 0.032],
      bloom: 0.3,
      fog: [0.86, 0.87, 0.88],
      fogNear: 0.35,
      lightColor: [1, 1, 1],
      flashlight: false,
      ambience: 'level12',
      reverb: 1.4,
      sanityDrain: 0.05,
    };
    this.objectives = [
      { id: 'door', text: 'Abra a porta da sala' },
      { id: 'hatch', text: 'Encontre a passagem subterrânea' },
    ];
    this.doorOpen = 0;
    document.getElementById('hud').classList.add('onwhite');
    this.doorTarget = 0;
    this.tries = 0;
    this.time = 0;
    this.route();
  }

  // ------------------------------------------------------------ planta
  corridor(ix, iz) {
    if (ix >= ROOM.x0 && ix <= ROOM.x1 && iz >= ROOM.z0 && iz <= ROOM.z1) return false;
    if (mod(iz + 1, 4) === 0 || mod(ix - 1, 5) === 0) return true;
    // nichos e salinhas vazias de vez em quando
    return this.hashCell(ix, iz, 5) < 0.07;
  }

  genEdge(kind, ix, iz) {
    const a = this.corridor(ix, iz);
    const b = kind === EH ? this.corridor(ix, iz - 1) : this.corridor(ix - 1, iz);
    if (a && b) {
      // de vez em quando uma parede atravessa o corredor (beco sem saída)
      if (this.hashCell(ix * 3 + kind, iz, 9) < 0.035) return W.FULL;
      return W.NONE;
    }
    if (a || b) return this.hashCell(ix * 2 + kind, iz, 11) < 0.03 ? W.DOOR : W.FULL;
    return W.NONE;
  }

  genLight(cx, cz) {
    const inRoom = cx >= ROOM.x0 && cx <= ROOM.x1 && cz >= ROOM.z0 && cz <= ROOM.z1;
    if (inRoom) {
      if (cx !== 1) return null;
      return { x: cx * this.cell + 1.2, z: cz * this.cell + 1.2, y: this.H - 0.02, ax: 0, len: 1.2, wid: 0.6, I: 11, group: 0 };
    }
    if (!this.corridor(cx, cz) || mod(cx + cz, 2)) return null;
    const h = this.hashCell(cx, cz, 3);
    const along = mod(cz + 1, 4) === 0 ? 0 : 1;
    return {
      x: cx * this.cell + 1.2,
      z: cz * this.cell + 1.2,
      y: this.H - 0.02,
      ax: along,
      len: 1.2,
      wid: 0.3,
      I: 10,
      group: h < 0.02 ? 1 : 0,
    };
  }

  dirt() {
    return 0;
  }

  // Sala fechada (só a porta), passagem no chão longe dali.
  route() {
    const c = this.cell;
    // paredes da sala
    for (let ix = ROOM.x0; ix <= ROOM.x1 + 1; ix++)
      for (let iz = ROOM.z0; iz <= ROOM.z1 + 1; iz++) {
        if (ix <= ROOM.x1) {
          const boundary = iz === ROOM.z0 || iz === ROOM.z1 + 1;
          this.setEdge(EH, ix, iz, boundary ? W.FULL : W.NONE);
        }
        if (iz <= ROOM.z1) {
          const boundary = ix === ROOM.x0 || ix === ROOM.x1 + 1;
          this.setEdge(EV, ix, iz, boundary ? W.FULL : W.NONE);
        }
      }
    this.setEdge(EH, DOOR.ix, DOOR.iz, W.DOOR);
    this.setEdge(EH, DOOR.ix, DOOR.iz - 1, W.NONE);
    // a passagem: num cruzamento a ~30 células
    const rnd = mulberry32(this.seed * 5 + 1);
    const kx = (rnd() < 0.5 ? -1 : 1) * (4 + Math.floor(rnd() * 3));
    const kz = -(5 + Math.floor(rnd() * 3));
    const hx = 1 + kx * 5;
    const hz = -1 + kz * 4;
    for (const [kind, ix, iz] of [
      [EH, hx, hz],
      [EH, hx, hz + 1],
      [EV, hx, hz],
      [EV, hx + 1, hz],
    ]) {
      const t = this.edge(kind, ix, iz);
      if (t === W.FULL && this.corridor(kind === EH ? ix : ix - 1, kind === EH ? iz - 1 : iz)) this.setEdge(kind, ix, iz, W.NONE);
    }
    this.hatch = { x: hx * c + c / 2, z: hz * c + c / 2 };
    this.exit = { x: this.hatch.x, z: this.hatch.z };
    this.spawn = { x: 1.5 * c, z: 2.2 * c, yaw: 0 };
    this.makeDoor();
    this.makeHatch();
  }

  makeDoor() {
    const c = this.cell;
    const w = this.doorW;
    const h = this.doorH;
    this.doorMat = new THREE.MeshLambertMaterial({ color: 0xeeeeee, emissive: 0x6a6a6a });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w - 0.02, h - 0.01, 0.05), this.doorMat);
    slab.position.set(w / 2, h / 2, 0);
    const knobMat = new THREE.MeshLambertMaterial({ color: 0xb0b0b0, emissive: 0x404040 });
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), knobMat);
    knob.position.set(w - 0.1, 1.0, 0.05);
    const knob2 = knob.clone();
    knob2.position.z = -0.05;
    const pivot = new THREE.Group();
    pivot.add(slab, knob, knob2);
    pivot.position.set(DOOR.ix * c + c / 2 - w / 2, 0, DOOR.iz * c);
    this.dynamic.add(pivot);
    this.doorPivot = pivot;
    this.door = { x: DOOR.ix * c + c / 2, z: DOOR.iz * c };
    this.doorMats = [this.doorMat, knobMat];
  }

  makeHatch() {
    const g = new THREE.Group();
    const dark = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const metal = new THREE.MeshLambertMaterial({ color: 0xd8dadc, emissive: 0x505254 });
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), dark);
    hole.rotation.x = -Math.PI / 2;
    hole.position.y = 0.006;
    hole.renderOrder = 2;
    dark.polygonOffset = true;
    dark.polygonOffsetFactor = -2;
    g.add(hole);
    // moldura
    for (const [x, z, sx, sz] of [
      [0, -0.55, 1.2, 0.1],
      [0, 0.55, 1.2, 0.1],
      [-0.55, 0, 0.1, 1.0],
      [0.55, 0, 0.1, 1.0],
    ]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.05, sz), metal);
      b.position.set(x, 0.025, z);
      g.add(b);
    }
    // tampa aberta, em pé
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 0.04), metal);
    lid.position.set(0, 0.5, -0.62);
    lid.rotation.x = -0.15;
    g.add(lid);
    // degraus da escada que somem no escuro
    for (let i = 0; i < 2; i++) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.03, 0.03), metal);
      r.position.set(0, -0.05 - i * 0.3, 0.42);
      g.add(r);
    }
    g.position.set(this.hatch.x, 0, this.hatch.z);
    this.dynamic.add(g);
    this.hatchMats = [dark, metal];
  }

  onChunkBuilt() {
    // cor da porta pelo nível de luz local
    if (this.lit) return;
    if (!this.chunkAt(this.door.x, this.door.z + 0.5)) return;
    this.lit = true;
  }

  // ------------------------------------------------------------ quadro
  tick(dt, player) {
    const g = this.game;
    const p = player.pos;
    this.time += dt;
    // porta
    this.doorOpen += clamp(this.doorTarget - this.doorOpen, -dt * 1.6, dt * 1.6);
    this.doorPivot.rotation.y = this.doorOpen * 1.6;
    // descer pela passagem pisando nela
    if (Math.hypot(p.x - this.hatch.x, p.z - this.hatch.z) < 0.45 && !g.transitioning) this.descend();
    // autocensura: filtros de gravação falham
    if (RECORDING.includes(g.settings.filter)) {
      this.censorT = (this.censorT || 0) - dt;
      if (this.censorT <= 0) {
        this.censorT = 2.5 + Math.random() * 3;
        g.glitch = 1;
        g.audio.play('tvstatic', { gain: 0.12, rate: 1 + Math.random() * 0.3 });
        if (!this.toldCensor) {
          this.toldCensor = true;
          g.hud.message('A gravação falha. Este lugar não aparece em câmera nenhuma.', 4);
        }
      }
    }
    if (this.doorOpen > 0.6 && !this.toldHall && p.z < 0) {
      this.toldHall = true;
      g.hud.message('Corredores brancos para todos os lados. O mesmo zumbido limpo em todos eles.', 4.5);
    }
  }

  descend() {
    const g = this.game;
    if (this.going) return;
    this.going = true;
    g.completeObjective('hatch', 'Você desce pela escada até o escuro.');
    g.audio.play('door', { gain: 0.4, rate: 0.7 });
    g.reachExit('noclip', 0.6);
  }

  collide(p, r) {
    super.collide(p, r);
    if (this.doorOpen < 0.5) {
      const d = this.door;
      const w = this.doorW / 2;
      const q = { x: p.x, z: p.z };
      // folha fechada (bloqueia o vão)
      if (Math.abs(q.x - d.x) < w + r && Math.abs(q.z - d.z) < r + 0.05) {
        p.z = q.z > d.z ? d.z + r + 0.05 : d.z - r - 0.05;
      }
    }
    return p;
  }

  interactable(player) {
    const p = player.pos;
    const d = this.door;
    if (this.doorTarget < 0.5 && Math.hypot(p.x - d.x, p.z - d.z) < 1.6) {
      return {
        label: 'Abrir a porta',
        action: () => {
          const g = this.game;
          this.tries++;
          if (this.tries === 1) {
            g.audio.play('knock', { gain: 0.25, rate: 1.3 });
            g.hud.message('A maçaneta não gira. Trancada.', 2.5);
            return;
          }
          g.audio.door();
          this.doorTarget = 1;
          g.completeObjective('door', '…clique. Agora ela abre. Você tem certeza de que estava trancada?');
        },
      };
    }
    if (Math.hypot(p.x - this.hatch.x, p.z - this.hatch.z) < 1.4) return { label: 'Descer pela passagem', action: () => this.descend() };
    return null;
  }

  navTarget() {
    return this.doorTarget < 0.5 ? this.door : this.hatch;
  }

  exitEmitter() {
    return { x: this.hatch.x, y: -1, z: this.hatch.z, sound: 'wind', gain: 0.5 };
  }

  dispose() {
    document.getElementById('hud').classList.remove('onwhite');
    super.dispose();
    for (const m of [...this.doorMats, ...this.hatchMats]) m.dispose();
  }
}

// Mesa e cadeira da sala (desenhadas no bloco da origem).
Level12.prototype.genProps = function (ch, cx0, cz0) {
  if (cx0 > ROOM.x0 || cz0 > ROOM.z0 || cx0 + this.chunkCells <= ROOM.x1 || cz0 + this.chunkCells <= ROOM.z1) return;
  const c = this.cell;
  const x = 1.5 * c;
  const z = 1.6 * c;
  ch.props.push({
    ao: [x - 0.7, x + 0.7, z - 0.4, z + 0.4, 0],
    draw: (G) => {
      const white = [0.95, 0.95, 0.95];
      const grey = [0.6, 0.62, 0.64];
      G.prop.box(x, 0.74, z, 1.2, 0.04, 0.7, white, G.lm, {});
      for (const [dx, dz] of [
        [-0.55, -0.3],
        [0.55, -0.3],
        [-0.55, 0.3],
        [0.55, 0.3],
      ])
        G.prop.box(x + dx, 0.36, z + dz, 0.04, 0.72, 0.04, grey, G.lm, { ao: 0 });
      // cadeira
      const cz = z + 0.75;
      G.prop.box(x, 0.45, cz, 0.45, 0.04, 0.45, white, G.lm, {});
      G.prop.box(x, 0.72, cz + 0.21, 0.45, 0.5, 0.04, white, G.lm, {});
      for (const [dx, dz] of [
        [-0.2, -0.2],
        [0.2, -0.2],
        [-0.2, 0.2],
        [0.2, 0.2],
      ])
        G.prop.box(x + dx, 0.22, cz + dz, 0.03, 0.44, 0.03, grey, G.lm, { ao: 0 });
    },
  });
  ch.colliders.push([x - 0.65, x + 0.65, z - 0.4, z + 0.4]);
  ch.colliders.push([x - 0.25, x + 0.25, z + 0.5, z + 1.0]);
  ch.items.push({ type: 'note', key: '12:n0', x: x + 0.3, z: z - 0.1, y: 0.765, rot: 0.3 });
};
