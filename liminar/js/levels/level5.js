// Nível 5 — "O Hotel do Terror": hotel infinito dos anos 1930, impecavelmente
// limpo. Três áreas: o Salão Principal (spawn, recepção, colunas, lustres e a
// vitrola tocando jazz), a malha infinita de corredores com portas numeradas
// e a Sala das Caldeiras, distante. Objetivos: pegar a chave na recepção,
// fechar as três válvulas das caldeiras e abrir o quarto da chave.
// Entidade: O Hóspede, que só anda quando ninguém está olhando.
import * as THREE from 'three';
import { GridLevel, W, EH, EV } from './grid.js';
import { getTex, indoorEnvTex } from '../textures.js';
import { panelMaterial, litMaterial, GeoBuilder } from '../materials.js';
import { hash3, mulberry32, clamp } from '../util.js';
import { initL5Textures, rampTex, glowTex, glowMaterial, guestFaceURL, WALL_H, WALL_W } from './level5_tex.js';
import {
  Kit,
  Frame,
  COL,
  B,
  lmGeo,
  chandelier,
  bowl,
  sconce,
  cageBulb,
  roomDoor,
  doorLeaf,
  elevator,
  picture,
  mirror,
  console_,
  tray,
  shoes,
  luggageCart,
  bench,
  palm,
  speaker,
} from './level5_props.js';
import { salonDecor, boilerDecor, archFill, DRY } from './level5_rooms.js';
import { Guest } from './level5_guest.js';
import { Steam, makePartyBuffer, makeSteamBuffer } from './level5_fx.js';

const ARCH = 8; // vão largo com arco (portas duplas do salão)
const BLOCK = 0; // miolo dos quarteirões de quartos (inacessível)
const SALON = 1;
const HALL = 2;
const BOIL = 3;
const PX = 8; // período das colunas de corredores (em células)
const PZ = 6; // período das fileiras de corredores
const md = (a, n) => ((a % n) + n) % n;
const HP = Math.PI / 2;
const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export class Level5 extends GridLevel {
  constructor(game) {
    initL5Textures();
    super(game, {
      cell: 2.6,
      H: WALL_H,
      T: 0.2,
      doorW: 1.0,
      doorH: 2.25,
      chunkCells: game.Q.lambert ? 10 : 8,
      seed: (game.seed ^ 0x5151) >>> 0,
      lightRadius: 7.5,
      lightEmitPow: 0.55,
      bounce: 0.55,
      ambient: 0.035,
      wallUV: [WALL_W, WALL_H],
      floorUV: 1.3,
      ceilUV: 2.6,
    });
    this.num = 5;
    this.HALL = HALL;
    this.panelI = 5;
    this.flickerGap = 16;
    this.layout();
    this.makeMaterials();
    this.look = {
      exposure: 1.0,
      tint: [1.05, 0.98, 0.9],
      sat: 0.92,
      contrast: 1.05,
      lift: [0.018, 0.012, 0.008],
      bloom: 0.3,
      fog: [0.05, 0.034, 0.022],
      fogNear: 0.32,
      lightColor: [1.0, 0.74, 0.47],
      flashlight: false,
      ambience: 'level5',
      reverb: 1.7,
      sanityDrain: 0.06,
    };
    this.objectives = [
      { id: 'key', text: 'Pegue a chave na recepção do Salão Principal' },
      { id: 'valves', text: 'Desligue as válvulas da Sala das Caldeiras (0/3)' },
      { id: 'room', text: `Abra o Quarto ${this.roomNum}` },
    ];
    this.guest = new Guest(this, guestFaceURL());
    this.steam = new Steam(
      this.dynamic,
      this.valves.map((v) => ({
        x: v.wx - v.nx * 0.22,
        y: v.y + 0.42,
        z: v.wz - v.nz * 0.22,
        dx: v.nx * 0.5 - v.nz * 0.6,
        dy: 0.15,
        dz: v.nz * 0.5 + v.nx * 0.6,
      })),
    );
    this.makeLamps();
    this.t = 0;
    this.recT = 80;
    this.partyT = 40;
    this.jazzRate = 1;
  }

  // ------------------------------------------------------------ planta
  layout() {
    const c = this.cell;
    const hT = this.T / 2;
    const rnd = mulberry32(this.seed * 3 + 11);
    this.roomNum = String(510 + Math.floor(rnd() * 88));
    // Salão Principal: células x ∈ [-4, 4], z ∈ [-3, 3]
    this.salon = { x0: -4, x1: 4, z0: -3, z1: 3, X0: -4 * c + hT, X1: 5 * c - hT, Z0: -3 * c + hT, Z1: 4 * c - hT, CX: c / 2 };
    const CX = c / 2;
    const mx = (x) => 2 * CX - x;
    this.columns = [];
    for (const x of [-8.1, -3.5, mx(-3.5), mx(-8.1)]) for (const z of [-1.4, 4.0]) this.columns.push([x, z]);
    // Sala das Caldeiras: quarteirão x ∈ [17, 23], z ∈ [-11, -7], porta a oeste
    const b = { x0: 17, x1: 23, z0: -11, z1: -7, X0: 17 * c + hT, X1: 24 * c - hT, Z0: -11 * c + hT, Z1: -6 * c - hT };
    Object.assign(b, { bx: 55.5, len: 5.2, R: 1.05, boilers: [-25.8, -22.1, -18.4], walkX: 51.4, dz: -9 * c + c / 2 });
    this.boil = b;
    this.boilDoor = { ix: 17, iz: -9, x: 17 * c, z: -9 * c + c / 2 };
    this.valves = [
      { x: 52.35, z: -23.95, nx: -1, nz: 0 },
      { x: b.X1 - 0.25, z: -20.25, nx: -1, nz: 0 },
      { x: 46.6, z: b.Z1 - 0.25, nx: 0, nz: -1 },
    ].map((v) => ({ ...v, y: 1.25, wx: v.x + v.nx * 0.17, wz: v.z + v.nz * 0.17, a: 0, turning: 0, done: false }));
    b.valves = this.valves;
    // porta do quarto do objetivo (numa parede de corredor, longe das caldeiras)
    const cand = [
      [-14, 6, 1],
      [-12, -6, -1],
      [-10, 12, -1],
      [6, 12, 1],
      [-18, -6, 1],
    ];
    const [tx, tz, side] = cand[Math.floor(rnd() * cand.length)];
    const ez = side > 0 ? tz + 1 : tz;
    const nz = side > 0 ? -1 : 1;
    this.door = { ix: tx, iz: ez, x: tx * c + c / 2, z: ez * c + nz * hT, nx: 0, nz, open: 0, opening: false };
    this.exit = { x: this.door.x, z: this.door.z };
    this.keyPos = { x: CX + 1.05, z: -5.58, y: 1.152 };
    this.gramo = { x: this.salon.X0 + 0.3, z: 4.7 };
    this.spawn = { x: CX, z: 6.6, yaw: 0 };
    // luzes especiais (salão e caldeiras), por célula
    this.special = new Map();
    const put = (x, z, L) => {
      const k = this.key(Math.floor(x / c), Math.floor(z / c));
      if (!this.special.has(k)) this.special.set(k, { x, z, ax: 0, len: 0.3, wid: 0.3, group: 0, ...L });
    };
    for (const [x, z, s, I] of [
      [CX, 1.3, 1.1, 9],
      [CX, -4.6, 0.75, 5],
      [-5.8, 1.3, 0.85, 6],
      [mx(-5.8), 1.3, 0.85, 6],
      [-5.6, -4.4, 0.7, 4.2],
      [mx(-5.6), -4.4, 0.7, 4.2],
      [-5.6, 6.7, 0.7, 4.2],
      [mx(-5.6), 6.7, 0.7, 4.2],
    ]) {
      put(x, z, { kind: 'chand', s, I, y: this.H - s - 0.05 });
    }
    const S = this.salon;
    const sc = (wx, wz, nx, nz) => put(wx + nx * 0.35, wz + nz * 0.35, { kind: 'sconce', I: 1.8, y: 2.35, walls: [{ wx, wz, nx, nz }] });
    for (const z of [1.3 - 2.4, 1.3 + 2.4]) {
      sc(S.X0, z, 1, 0);
      sc(S.X1, z, -1, 0);
    }
    for (const x of [CX - 2.4, CX + 2.4]) sc(x, S.Z1, 0, -1);
    for (const x of [CX - 2.6, CX + 2.6]) sc(x, S.Z0, 0, 1);
    for (let ix = b.x0; ix <= b.x1; ix += 2) {
      for (let iz = b.z0; iz <= b.z1; iz += 2) {
        if (iz === -9 && ix >= 19 && ix <= 22) continue; // em cima da caldeira do meio
        const h = hash3(ix, iz, this.seed + 91);
        put(ix * c + c / 2, iz * c + c / 2, { kind: 'cage', I: 3.0, y: 2.85, group: h < 0.15 ? 3 : h < 0.4 ? 1 : 0 });
      }
    }
    // arcos (portas duplas) do salão
    const arches = [
      { ox: -4 * c, oz: c / 2, ux: 0, uz: 1, nx: 1, nz: 0 },
      { ox: 5 * c, oz: c / 2, ux: 0, uz: 1, nx: -1, nz: 0 },
      { ox: c / 2, oz: 4 * c, ux: 1, uz: 0, nx: 0, nz: -1 },
    ].map((a) => ({ ...a, r: 0.95, top: 2.95, hT }));
    this.archTop = 2.95;
    // objetos fixos: salão, caldeiras, arcos e a porta do objetivo
    this.decor = [...salonDecor(this), ...boilerDecor(this)];
    for (const a of arches)
      this.decor.push({ x: a.ox + a.nx * 0.3, z: a.oz + a.nz * 0.3, fn: (K) => archFill(K, this, a, K.G.wpan, K.G.wall) });
    const d = this.door;
    this.decor.push({
      x: d.x,
      z: d.z,
      fn: (K) => {
        const sl = { fx: d.x, fz: d.z, nx: d.nx, nz: d.nz };
        roomDoor(K, sl, this.roomNum, { noLeaf: true });
        // vestíbulo escuro atrás da porta
        const f = new Frame(d.x, d.z, Math.atan2(d.nx, d.nz));
        if (K.G.wall) {
          const dk = [0.32, 0.3, 0.28];
          K.box(K.G.wall, f, 0, this.H / 2, -this.T - 1.7, 2.2, this.H, 0.1, dk);
          for (const s of [-1, 1]) K.box(K.G.wall, f, s * 1.0, this.H / 2, -this.T - 0.9, 0.1, this.H, 1.7, dk);
        }
        // fresta de luz sob a porta
        if (K.G.glow) {
          const [gx, gz] = f.p(0, 0.25);
          K.hquad(K.G.glow, gx - 0.5, gx + 0.5, gz - 0.25, gz + 0.25, 0.012, true, [0.1, 0, 0.9, 0.5], [0.5, 0.35, 0.18], 0);
        }
        return [f.aabb(0.55, 0.1, 0, -0.06)];
      },
    });
    for (const e of this.decor) {
      const r = e.fn(DRY);
      e.cols = !r || !r.length ? [] : Array.isArray(r[0]) ? r : [r];
    }
  }

  // Tipo da célula: salão, corredor, caldeiras ou miolo de quarteirão.
  cellKind(ix, iz) {
    const s = this.salon;
    if (ix >= s.x0 && ix <= s.x1 && iz >= s.z0 && iz <= s.z1) return SALON;
    const b = this.boil;
    if (ix >= b.x0 && ix <= b.x1 && iz >= b.z0 && iz <= b.z1) return BOIL;
    if (md(iz, PZ) === 0) return HALL;
    if (md(ix, PX) === 0 && this.colOpen(ix, Math.floor(iz / PZ))) return HALL;
    return BLOCK;
  }

  // Trecho de corredor vertical entre duas fileiras existe?
  colOpen(ix, seg) {
    if (ix === 0) return seg === 0; // atrás da recepção não há corredor
    if (ix === 16 && (seg === -1 || seg === -2)) return true; // caminho até as caldeiras
    return hash3(ix, seg, this.seed + 71) > 0.28;
  }

  // Eixo do corredor na célula: 0 = ao longo de x, 1 = ao longo de z, 2 = cruzamento.
  hallAxis(ix, iz) {
    const row = md(iz, PZ) === 0;
    const col = md(ix, PX) === 0 && (this.cellKind(ix, iz - 1) === HALL || this.cellKind(ix, iz + 1) === HALL);
    return row && col ? 2 : row ? 0 : 1;
  }

  makePieces() {
    super.makePieces();
    const c = this.cell;
    const m = c / 2;
    const r = 0.95;
    this.pieces[ARCH] = [
      { a0: 0, a1: m - r, y0: 0, y1: this.H },
      { a0: m + r, a1: c, y0: 0, y1: this.H },
      { a0: m - r, a1: m + r, y0: 2.95, y1: this.H },
    ];
  }

  isTargetEdge(kind, ix, iz) {
    return kind === EH && ix === this.door.ix && iz === this.door.iz;
  }

  genEdge(kind, ix, iz) {
    const ax = kind === EV ? ix - 1 : ix;
    const az = kind === EH ? iz - 1 : iz;
    const a = this.cellKind(ax, az);
    const b = this.cellKind(ix, iz);
    if (a === b) return W.NONE;
    if (this.isTargetEdge(kind, ix, iz)) return W.DOOR;
    if (a === SALON || b === SALON) return a === HALL || b === HALL ? ARCH : W.FULL;
    if (a === BOIL || b === BOIL) return kind === EV && ix === this.boilDoor.ix && iz === this.boilDoor.iz ? W.DOOR : W.FULL;
    return W.FULL;
  }

  // Dá para passar da célula a para a vizinha b?
  passable(ax, az, bx, bz) {
    let t;
    if (bx !== ax) t = this.edge(EV, Math.max(ax, bx), az);
    else t = this.edge(EH, ax, Math.max(az, bz));
    return t === W.NONE || t === W.DOOR || t === ARCH;
  }

  // Paredes de corredor de uma célula (lado do corredor): { wx, wz, nx, nz }.
  hallWalls(ix, iz) {
    const c = this.cell;
    const hT = this.T / 2;
    const out = [];
    const ax = this.hallAxis(ix, iz);
    if (ax === 2) return out;
    if (ax === 0) {
      if (this.edge(EH, ix, iz) === W.FULL) out.push({ wx: ix * c + c / 2, wz: iz * c + hT, nx: 0, nz: 1, kind: EH, ex: ix, ez: iz });
      if (this.edge(EH, ix, iz + 1) === W.FULL)
        out.push({ wx: ix * c + c / 2, wz: (iz + 1) * c - hT, nx: 0, nz: -1, kind: EH, ex: ix, ez: iz + 1 });
    } else {
      if (this.edge(EV, ix, iz) === W.FULL) out.push({ wx: ix * c + hT, wz: iz * c + c / 2, nx: 1, nz: 0, kind: EV, ex: ix, ez: iz });
      if (this.edge(EV, ix + 1, iz) === W.FULL)
        out.push({ wx: (ix + 1) * c - hT, wz: iz * c + c / 2, nx: -1, nz: 0, kind: EV, ex: ix + 1, ez: iz });
    }
    return out;
  }

  // O que há numa parede entre corredor e quarteirão (visto do corredor).
  wallInfo(kind, ix, iz) {
    if (this.edge(kind, ix, iz) !== W.FULL) return null;
    const kp = this.cellKind(ix, iz);
    const km = kind === EH ? this.cellKind(ix, iz - 1) : this.cellKind(ix - 1, iz);
    let side;
    if (kp === HALL && km !== HALL) side = 1;
    else if (km === HALL && kp !== HALL) side = -1;
    else return null;
    const other = side > 0 ? km : kp;
    const c = this.cell;
    const hT = this.T / 2;
    const sl =
      kind === EH
        ? { fx: ix * c + c / 2, fz: iz * c + side * hT, nx: 0, nz: side }
        : { fx: ix * c + side * hT, fz: iz * c + c / 2, nx: side, nz: 0 };
    const along = kind === EH ? ix : iz;
    const h = this.hashCell(ix * 2 + kind, iz, 61);
    let type = 'plain';
    if (md(along, 2) === 0) {
      if (other === BLOCK) type = h < 0.86 ? 'door' : h < 0.95 ? 'picture' : 'elevator';
    } else if (h < 0.22) type = 'speaker';
    return { sl, side, type, h };
  }

  roomNumber(kind, ix, iz) {
    let n = 500 + md(ix * 37 + iz * 53 + kind * 11, 100);
    if (String(n) === this.roomNum) n++;
    return String(n);
  }

  genLight(cx, cz) {
    const sp = this.special.get(this.key(cx, cz));
    if (sp) return sp;
    if (this.cellKind(cx, cz) !== HALL) return null;
    const c = this.cell;
    const ax = this.hallAxis(cx, cz);
    const along = ax === 0 ? cx : cz;
    const h = this.hashCell(cx, cz, 5);
    const nearSalon = Math.abs(cx) < 12 && Math.abs(cz) < 9;
    let group = h < 0.05 ? 3 : h < 0.17 ? 1 : h < 0.27 ? 2 : 0;
    if (nearSalon && group === 3) group = 0;
    const x = cx * c + c / 2;
    const z = cz * c + c / 2;
    if (ax === 2 || md(along, 2) === 0) return { kind: 'bowl', x, z, y: this.H - 0.22, ax: 0, len: 0.3, wid: 0.3, I: 3.0, group };
    return { kind: 'sconce', x, z, y: 2.3, ax: 0, len: 0.3, wid: 0.3, I: 1.9, group, walls: this.hallWalls(cx, cz) };
  }

  // ------------------------------------------------------------ materiais
  makeMaterials() {
    const S = this.Q.tex;
    const tx = (n) => getTex(n, S);
    const dam = tx('l5Damask');
    const pan = tx('l5Panel');
    const car = tx('l5Carpet');
    const par = tx('l5Parquet');
    const rug = tx('l5Rug');
    const pla = tx('l5Plaster');
    const wood = tx('l5Wood');
    const fab = tx('l5Fabric');
    const bri = tx('l5Brick');
    const atl = tx('l5Atlas');
    const con = tx('concreteFloor');
    const env = this.game.makeEnv(indoorEnvTex(['#5a3c24', '#2c1b10', '#120a06'], '#ffd9a6'));
    this.env = env;
    this.mats = {
      floor: { map: car.map, normalMap: car.normalMap, normalScale: 0.7, roughness: 0.97, vertexColors: true },
      wall: {
        map: dam.map,
        normalMap: dam.normalMap,
        normalScale: 0.8,
        roughness: 0.72,
        vertexColors: true,
        envMap: env,
        envIntensity: 0.15,
        color: new THREE.Color(0.86, 0.8, 0.78),
      },
      ceil: { map: pla.map, roughness: 0.95, lmIntensity: 0.6, vertexColors: true },
      prop: { map: wood.map, normalMap: wood.normalMap, vertexColors: true, roughness: 0.38, envMap: env, envIntensity: 0.55 },
      extra: { map: fab.map, normalMap: fab.normalMap, vertexColors: true, roughness: 0.88 },
    };
    // camadas com lightmap próprio por bloco (o material é trocado em onChunkBuilt)
    this.lmLayers = {
      atlas: { map: atl.map, roughnessMap: atl.orm, metalMap: atl.orm, vertexColors: true, roughness: 1, envMap: env, envIntensity: 1 },
      wpan: {
        map: pan.map,
        normalMap: pan.normalMap,
        vertexColors: true,
        roughness: 0.42,
        envMap: env,
        envIntensity: 0.45,
        lmIntensity: 1.4,
      },
      brick: { map: bri.map, normalMap: bri.normalMap, vertexColors: true, roughness: 0.85 },
      parq: {
        map: par.map,
        normalMap: par.normalMap,
        roughnessMap: par.roughnessMap,
        vertexColors: true,
        roughness: 1,
        envMap: env,
        envIntensity: 0.6,
      },
      conc: { map: con.map, normalMap: con.normalMap, vertexColors: true, roughness: 0.9, color: 0xb8b4ac },
      rug: { map: rug.map, normalMap: rug.normalMap, vertexColors: true, roughness: 0.98 },
    };
    this.panelMat = panelMaterial(rampTex(), 0xffd6a0);
    this.glowMat = glowMaterial(glowTex(), new THREE.Color(0.11, 0.11, 0.11), this.panelMat.uniforms.uGroupI);
    this.sharedLayers = { glow: this.glowMat };
    this.placeholders = [];
    for (const name in this.lmLayers) {
      const ph = new THREE.MeshBasicMaterial();
      ph.userData.l5layer = name;
      this.placeholders.push(ph);
      this.sharedLayers[name] = ph;
    }
  }

  // Material com o lightmap do bloco para uma das camadas.
  lmMaterial(name, tex) {
    const p = this.lmLayers[name] || this.mats[name];
    const m = litMaterial(this.Q, { ...p, lightMap: tex });
    if (p.metalMap && !this.Q.lambert) {
      m.metalnessMap = p.metalMap;
      m.metalness = 1;
    }
    return m;
  }

  kit(G) {
    if (!G.K) {
      // qualidade baixa: estofados e madeira no mesmo material (menos draw calls)
      if (this.Q.lambert) G.extra = G.prop;
      G.K = new Kit(G, G);
    }
    return G.K;
  }

  // ------------------------------------------------------------ geometria
  // Paredes com material por face: lambri no salão, damasco nos corredores,
  // tijolo pintado nas caldeiras; faces voltadas para o miolo nem são geradas.
  faceLayer(G, k) {
    if (k === SALON) return G.wpan;
    if (k === BOIL) return G.brick;
    if (k === HALL) return G.wall;
    return null;
  }

  buildEdge(G, kind, ix, iz) {
    const t = this.edge(kind, ix, iz);
    if (t === W.NONE) return;
    const c = this.cell;
    const hT = this.T / 2;
    const ps = this.pieces[t];
    const c0 = this.cornerInfo(kind, ix, iz, 0);
    const c1 = this.cornerInfo(kind, ix, iz, 1);
    const ur = this.wallUV[0];
    const gp = this.faceLayer(G, this.cellKind(ix, iz));
    const gm = this.faceLayer(G, kind === EH ? this.cellKind(ix, iz - 1) : this.cellKind(ix - 1, iz));
    const gc = gp || gm;
    if (!gc) return;
    for (const p of ps) {
      const atStart = p.a0 === 0 && p.y0 === 0 && p.y1 === this.H;
      const atEnd = p.a1 === c && p.y0 === 0 && p.y1 === this.H;
      const e0 = atStart ? c0.ext : 0;
      const e1 = atEnd ? c1.ext : 0;
      const cap0 = atStart ? c0.cap : true;
      const cap1 = atEnd ? c1.cap : true;
      const a0 = p.a0 - e0;
      const a1 = p.a1 + e1;
      if (kind === EH) {
        const zc = iz * c;
        const xa = ix * c + a0;
        const xb = ix * c + a1;
        if (gp) this.vface(gp, xa, zc + hT, xb, zc + hT, p.y0, p.y1, [0, 0, 1], xa / ur, xb / ur, G.lm);
        if (gm) this.vface(gm, xb, zc - hT, xa, zc - hT, p.y0, p.y1, [0, 0, -1], -xb / ur, -xa / ur, G.lm);
        if (cap0) this.vface(gc, xa, zc - hT, xa, zc + hT, p.y0, p.y1, [-1, 0, 0], 0, this.T / ur, G.lm);
        if (cap1) this.vface(gc, xb, zc + hT, xb, zc - hT, p.y0, p.y1, [1, 0, 0], 0, this.T / ur, G.lm);
        if (p.y0 > 0) this.hface(gc, xa, xb, zc - hT, zc + hT, p.y0, false, G.lm, ur, 0.75);
      } else {
        const xc = ix * c;
        const za = iz * c + a0;
        const zb = iz * c + a1;
        if (gm) this.vface(gm, xc - hT, za, xc - hT, zb, p.y0, p.y1, [-1, 0, 0], za / ur, zb / ur, G.lm);
        if (gp) this.vface(gp, xc + hT, zb, xc + hT, za, p.y0, p.y1, [1, 0, 0], -zb / ur, -za / ur, G.lm);
        if (cap0) this.vface(gc, xc + hT, za, xc - hT, za, p.y0, p.y1, [0, 0, -1], 0, this.T / ur, G.lm);
        if (cap1) this.vface(gc, xc - hT, zb, xc + hT, zb, p.y0, p.y1, [0, 0, 1], 0, this.T / ur, G.lm);
        if (p.y0 > 0) this.hface(gc, xc - hT, xc + hT, za, zb, p.y0, false, G.lm, ur, 0.75);
      }
    }
    this.decorateEdge(G, kind, ix, iz, t);
  }

  // Portas numeradas, quadros, elevadores e alto-falantes nas paredes dos corredores.
  decorateEdge(G, kind, ix, iz, t) {
    if (t !== W.FULL) return;
    const w = this.wallInfo(kind, ix, iz);
    if (!w || w.type === 'plain') return;
    const K = this.kit(G);
    const f = new Frame(w.sl.fx, w.sl.fz, Math.atan2(w.sl.nx, w.sl.nz));
    if (w.type === 'door') roomDoor(K, w.sl, this.roomNumber(kind, ix, iz), { dnd: w.h < 0.1, staff: w.h > 0.83 });
    else if (w.type === 'picture') picture(K, f, 0, 1.85, 1.1, 0.8, Math.floor(w.h * 97) % 8);
    else if (w.type === 'elevator') elevator(K, w.sl);
    else if (w.type === 'speaker') speaker(K, f, 0, 3.05);
  }

  buildLight(G, L) {
    const K = this.kit(G);
    if (L.kind === 'chand') chandelier(K, L.x, L.z, this.H, L.group, L.s);
    else if (L.kind === 'bowl') bowl(K, L.x, L.z, this.H, L.group);
    else if (L.kind === 'sconce') for (const w of L.walls) sconce(K, w.wx, w.wz, w.nx, w.nz, 2.3, L.group);
    else if (L.kind === 'cage') cageBulb(K, L.x, L.z, this.H, L.y + 0.05, L.group);
  }

  // Piso e teto por célula: carpete no salão, parquet com passadeira nos
  // corredores, concreto nas caldeiras; o miolo dos quarteirões fica vazio.
  buildFloorCeil(G, ch) {
    const c = this.cell;
    const N = this.chunkCells;
    const cx0 = ch.cx * N;
    const cz0 = ch.cz * N;
    const K = this.kit(G);
    const flat = [0.5, 0.5, 0.5, 0.5];
    const border = [0.05, 0.12, 0.07];
    const tgt = this.door;
    for (let iz = cz0; iz < cz0 + N; iz++) {
      for (let ix = cx0; ix < cx0 + N; ix++) {
        const k = this.cellKind(ix, iz);
        const x0 = ix * c;
        const z0 = iz * c;
        const x1 = x0 + c;
        const z1 = z0 + c;
        if (k === BLOCK) {
          // só o vestíbulo atrás da porta do objetivo tem piso e teto
          const vz = tgt.nz > 0 ? tgt.iz - 1 : tgt.iz;
          if (ix === tgt.ix && iz === vz) {
            this.hface(G.parq, x0, x1, z0, z1, 0, true, G.lm, 1.3, 0.6);
            this.hface(G.ceil, x0, x1, z0, z1, this.H, false, G.lm, 2.6, 0.5);
          }
          continue;
        }
        if (k === SALON) this.hface(G.floor, x0, x1, z0, z1, 0, true, G.lm, 1.3);
        else if (k === BOIL) this.hface(G.conc, x0, x1, z0, z1, 0, true, G.lm, 2.4);
        else {
          this.hface(G.parq, x0, x1, z0, z1, 0, true, G.lm, 1.3);
          // passadeira: quadrado central e braços para os lados abertos
          const rw = 0.7;
          const mx = x0 + c / 2;
          const mz = z0 + c / 2;
          const y = 0.01;
          this.hface(G.floor, mx - rw, mx + rw, mz - rw, mz + rw, y, true, G.lm, 1.3);
          const open = DIRS.map(([dx, dz]) => this.passable(ix, iz, ix + dx, iz + dz) && this.cellKind(ix + dx, iz + dz) !== BLOCK);
          const yb = 0.012;
          const bw = 0.05;
          if (open[0]) this.hface(G.floor, mx + rw, x1, mz - rw, mz + rw, y, true, G.lm, 1.3);
          if (open[1]) this.hface(G.floor, x0, mx - rw, mz - rw, mz + rw, y, true, G.lm, 1.3);
          if (open[2]) this.hface(G.floor, mx - rw, mx + rw, mz + rw, z1, y, true, G.lm, 1.3);
          if (open[3]) this.hface(G.floor, mx - rw, mx + rw, z0, mz - rw, y, true, G.lm, 1.3);
          // debrum verde nas bordas da passadeira
          for (const s of [-1, 1]) {
            const ox = mx + s * (rw - bw / 2);
            const oz = mz + s * (rw - bw / 2);
            if (open[0]) K.hquad(G.extra, mx + rw, x1, oz - bw / 2, oz + bw / 2, yb, true, flat, border);
            if (open[1]) K.hquad(G.extra, x0, mx - rw, oz - bw / 2, oz + bw / 2, yb, true, flat, border);
            if (open[2]) K.hquad(G.extra, ox - bw / 2, ox + bw / 2, mz + rw, z1, yb, true, flat, border);
            if (open[3]) K.hquad(G.extra, ox - bw / 2, ox + bw / 2, z0, mz - rw, yb, true, flat, border);
            if (!open[s > 0 ? 2 : 3]) K.hquad(G.extra, mx - rw, mx + rw, oz - bw / 2, oz + bw / 2, yb, true, flat, border);
            if (!open[s > 0 ? 0 : 1]) K.hquad(G.extra, ox - bw / 2, ox + bw / 2, mz - rw, mz + rw, yb, true, flat, border);
          }
        }
        this.hface(G.ceil, x0, x1, z0, z1, this.H, false, G.lm, 2.6, k === BOIL ? 0.45 : 1);
      }
    }
  }

  // Vigas do teto em caixotões no salão (cortadas nos limites do bloco).
  buildExtra(G, ch) {
    const s = this.salon;
    const x0 = Math.max(ch.x0, s.X0);
    const x1 = Math.min(ch.x0 + this.S, s.X1);
    const z0 = Math.max(ch.z0, s.Z0);
    const z1 = Math.min(ch.z0 + this.S, s.Z1);
    if (x1 <= x0 || z1 <= z0) return;
    const col = [0.9, 0.86, 0.8];
    const H = this.H;
    for (const bx of [-8.1, -3.5, 2 * s.CX + 3.5, 2 * s.CX + 8.1]) {
      if (bx < x0 || bx >= x1) continue;
      G.ceil.box(bx, H - 0.16, (z0 + z1) / 2, 0.38, 0.32, z1 - z0, col, G.lm, { ao: 0, skip: 'py' });
    }
    for (const bz of [-1.4, 4.0]) {
      if (bz < z0 || bz >= z1) continue;
      G.ceil.box((x0 + x1) / 2, H - 0.17, bz, x1 - x0, 0.34, 0.38, col, G.lm, { ao: 0, skip: 'py' });
    }
  }

  genProps(ch, cx0, cz0) {
    const S = this.S;
    const inside = (x, z) => x >= ch.x0 && x < ch.x0 + S && z >= ch.z0 && z < ch.z0 + S;
    for (const e of this.decor) {
      if (!inside(e.x, e.z)) continue;
      for (const b of e.cols) {
        ch.colliders.push(b);
        ch.props.push({ ao: [b[0], b[1], b[2], b[3], 0.05] });
      }
      ch.props.push({ draw: (G) => e.fn(this.kit(G)) });
    }
    // a chave da recepção
    const kp = this.keyPos;
    if (inside(kp.x, kp.z)) ch.items.push(this.keyItem());
    this.hallProps(ch, cx0, cz0);
  }

  // Móveis e itens soltos dos corredores.
  hallProps(ch, cx0, cz0) {
    const N = this.chunkCells;
    const c = this.cell;
    const dens = this.Q.props;
    const halls = [];
    for (let iz = cz0; iz < cz0 + N; iz++) {
      for (let ix = cx0; ix < cx0 + N; ix++) {
        if (this.cellKind(ix, iz) !== HALL) continue;
        halls.push([ix, iz]);
        const ax = this.hallAxis(ix, iz);
        const h = this.hashCell(ix, iz, 40);
        const r = this.hashCell(ix, iz, 41);
        const mx = ix * c + c / 2;
        const mz = iz * c + c / 2;
        const add = (fn) => {
          const cols = fn(DRY) || [];
          const list = cols.length && Array.isArray(cols[0]) ? cols : cols.length ? [cols] : [];
          for (const b of list) {
            ch.colliders.push(b);
            ch.props.push({ ao: [b[0], b[1], b[2], b[3], 0.05] });
          }
          ch.props.push({ draw: (G) => fn(this.kit(G)) });
        };
        if (ax === 2) {
          // palmeiras nos cantos dos cruzamentos
          if (h < 0.45 * dens) {
            const s = r < 0.5 ? 1 : -1;
            add((K) => palm(K, mx + 0.85, mz + 0.85 * s, 0.95));
            add((K) => palm(K, mx - 0.85, mz - 0.85 * s, 0.95));
          }
          continue;
        }
        const walls = this.hallWalls(ix, iz);
        if (!walls.length) continue;
        const w = walls[r < 0.5 || walls.length === 1 ? 0 : 1];
        const f = new Frame(w.wx, w.wz, Math.atan2(w.nx, w.nz));
        const along = ax === 0 ? ix : iz;
        if (md(along, 2) === 1) {
          if (h < 0.16 * dens) {
            add((K) => {
              mirror(K, f, 0, 1.5, 0.62, 0.72);
              return console_(K, f, 0, r < 0.75 ? 0 : 1);
            });
          } else if (h < 0.22 * dens) add((K) => bench(K, ...f.p(0, 0.3), f.rot, 1.4));
          else if (h < 0.25 * dens) add((K) => luggageCart(K, ...f.p(0, 0.55), f.rot + (r - 0.5) * 0.4));
        } else {
          const info = this.wallInfo(w.kind, w.ex, w.ez);
          if (info && info.type === 'door') {
            if (h < 0.07) add((K) => tray(K, f, 0.2));
            else if (h < 0.13) add((K) => shoes(K, f, -0.32));
          }
        }
        if (this.hashCell(ix, iz, 21) < 0.012) {
          const [x, z] = f.p(r < 0.5 ? -0.8 : 0.8, 0.35);
          ch.items.push({ type: 'water', key: `5:${ix}:${iz}:w`, x, z });
        }
      }
    }
    if (halls.length && hash3(ch.cx, ch.cz, this.seed + 31) < 0.35) {
      const [ix, iz] = halls[Math.floor(hash3(ch.cx, ch.cz, this.seed + 32) * halls.length)];
      ch.items.push({
        type: 'note',
        key: `5:${ch.cx}:${ch.cz}:n`,
        x: ix * c + c / 2 + 0.35,
        z: iz * c + c / 2 - 0.25,
        rot: hash3(ix, iz, 5) * 6.28,
      });
    }
  }

  // Item da chave (latão, etiqueta vermelha com o número).
  keyItem() {
    const kp = this.keyPos;
    return {
      type: 'x',
      key: '5:chave',
      x: kp.x,
      z: kp.z,
      y: kp.y,
      label: `Pegar a chave do Quarto ${this.roomNum}`,
      makeMesh: (it, items) => {
        const g = new THREE.Group();
        const brass = items.litMat({ color: 0xc09a48, roughness: 0.3, metalness: 0.7 }, it.light);
        const red = items.litMat({ color: 0x8a1c14, roughness: 0.6 }, it.light);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 6, 16), brass);
        ring.rotation.x = HP;
        ring.position.set(-0.05, 0.004, 0);
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.006, 0.008), brass);
        shaft.position.set(0.01, 0.004, 0);
        const bit = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.005, 0.022), brass);
        bit.position.set(0.04, 0.004, 0.012);
        const fob = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.008, 6), red);
        fob.scale.set(1.5, 1, 0.8);
        fob.position.set(-0.11, 0.004, 0.01);
        g.add(ring, shaft, bit, fob);
        g.position.set(it.x, it.y, it.z);
        g.rotation.y = 0.5;
        g.scale.setScalar(1.6);
        return g;
      },
      onUse: (game) => {
        game.audio.click();
        game.completeObjective(
          'key',
          `Você pegou a chave do Quarto ${this.roomNum}. A etiqueta diz: "Desligue as caldeiras antes de subir."`,
        );
      },
    };
  }

  // ------------------------------------------------------------ blocos prontos
  chunkLM(ch) {
    const span = this.S + this.pad * 2;
    const ox = ch.x0 - this.pad;
    const oz = ch.z0 - this.pad;
    return (x, z) => [(x - ox) / span, (z - oz) / span];
  }

  onChunkBuilt(ch) {
    // troca os materiais provisórios pelas versões com o lightmap do bloco
    for (const m of ch.meshes) {
      const name = m.material.userData && m.material.userData.l5layer;
      if (!name) continue;
      m.material = this.lmMaterial(name, ch.lmTex);
      m.userData.sharedMat = false;
    }
    const inChunk = (x, z) => x >= ch.x0 && x < ch.x0 + this.S && z >= ch.z0 && z < ch.z0 + this.S;
    const own = [];
    for (const v of this.valves) if (inChunk(v.x, v.z)) own.push(this.makeWheel(v, ch));
    if (inChunk(this.door.x, this.door.z)) own.push(this.makeDoorLeaf(ch));
    if (own.length) {
      ch.onDispose = () => {
        for (const o of own) {
          this.dynamic.remove(o);
          o.traverse((q) => {
            if (q.geometry) q.geometry.dispose();
            if (q.material) q.material.dispose();
          });
        }
      };
    }
  }

  // Volante vermelho da válvula (gira ao ser fechado).
  makeWheel(v, ch) {
    const gb = new GeoBuilder();
    const uv = this.chunkLM(ch)(v.wx + v.nx * 0.3, v.wz + v.nz * 0.3);
    const lm = () => uv;
    const red = [0.55, 0.05, 0.035];
    const m = new THREE.Matrix4();
    lmGeo(gb, B.torus(0.14), m.makeScale(0.21, 0.21, 0.21), red, lm);
    for (let i = 0; i < 3; i++) {
      m.makeRotationZ((i / 3) * Math.PI).scale(new THREE.Vector3(0.016, 0.42, 0.016));
      lmGeo(gb, B.cyl(6), m, red, lm);
    }
    m.makeRotationX(HP).scale(new THREE.Vector3(0.045, 0.07, 0.045));
    lmGeo(gb, B.cyl(10), m, [0.25, 0.22, 0.2], lm);
    m.makeTranslation(0.21, 0, 0.05).scale(new THREE.Vector3(0.018, 0.018, 0.06));
    lmGeo(gb, B.cyl(8), m.multiply(new THREE.Matrix4().makeRotationX(HP)), red, lm);
    const mesh = new THREE.Mesh(gb.build(), litMaterial(this.Q, { vertexColors: true, roughness: 0.45, lightMap: ch.lmTex }));
    mesh.position.set(v.wx, v.y, v.wz);
    mesh.rotation.y = Math.atan2(v.nx, v.nz);
    mesh.rotation.z = v.a;
    v.mesh = mesh;
    this.dynamic.add(mesh);
    return mesh;
  }

  // Folha animada da porta do objetivo, com dobradiça no lado esquerdo.
  makeDoorLeaf(ch) {
    const d = this.door;
    const uv = this.chunkLM(ch)(d.x + d.nx * 0.4, d.z + d.nz * 0.4);
    const G = {
      prop: new GeoBuilder(),
      extra: new GeoBuilder(),
      atlas: new GeoBuilder(),
      panel: new GeoBuilder(),
      glow: new GeoBuilder(),
      lm: () => uv,
    };
    const K = new Kit(G, G);
    doorLeaf(K, new Frame(0.48, 0, 0), COL.walnut, this.roomNum, -0.06);
    const pivot = new THREE.Group();
    const rot = Math.atan2(d.nx, d.nz);
    const hinge = new Frame(d.x, d.z, rot).p(-0.48, 0);
    pivot.position.set(hinge[0], 0, hinge[1]);
    pivot.rotation.y = rot + d.open * 1.45;
    for (const [gb, name] of [
      [G.prop, 'prop'],
      [G.extra, 'extra'],
      [G.atlas, 'atlas'],
    ]) {
      if (gb.empty) continue;
      const mesh = new THREE.Mesh(gb.build(), this.lmMaterial(name, ch.lmTex));
      pivot.add(mesh);
    }
    d.pivot = pivot;
    this.dynamic.add(pivot);
    return pivot;
  }

  // Lâmpadas indicadoras (vermelho → verde) sobre as válvulas e na porta.
  makeLamps() {
    this.lampGeo = new THREE.SphereGeometry(0.045, 10, 8);
    this.lamps = [];
    const mk = (x, y, z) => {
      const m = new THREE.Mesh(this.lampGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.25, 0.15) }));
      m.position.set(x, y, z);
      this.dynamic.add(m);
      this.lamps.push(m);
      return m;
    };
    for (const v of this.valves) v.lamp = mk(v.x + v.nx * 0.08, v.y + 0.72, v.z + v.nz * 0.08);
    this.doorLamp = mk(this.boilDoor.x - this.T / 2 - 0.06, 2.62 + 0.3, this.boilDoor.z);
  }

  // ------------------------------------------------------------ interação
  near(p, x, z, r) {
    const dx = x - p.pos.x;
    const dz = z - p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > r) return false;
    if (d < 0.7) return true;
    const f = new THREE.Vector3();
    p.forward(f);
    return (dx * f.x + dz * f.z) / (d * (Math.hypot(f.x, f.z) || 1)) > 0.45;
  }

  interactable(player) {
    const g = this.game;
    for (const v of this.valves) {
      if (v.done || v.turning) continue;
      if (this.near(player, v.wx + v.nx * 0.2, v.wz + v.nz * 0.2, 1.45))
        return { label: 'Fechar a válvula', action: () => this.turnValve(v) };
    }
    const d = this.door;
    if (!d.opening && this.near(player, d.x + d.nx * 0.3, d.z + d.nz * 0.3, 1.5)) {
      const keyOk = g.objectiveDone('key');
      const valvesOk = g.objectiveDone('valves');
      if (!keyOk || !valvesOk) {
        const n = this.valves.filter((v) => v.done).length;
        const why = !keyOk
          ? `Trancado. A chave do Quarto ${this.roomNum} está na recepção do Salão Principal.`
          : `A chave gira, mas a porta não cede: as caldeiras ainda estão ligadas (${n}/3 válvulas).`;
        return {
          label: `Quarto ${this.roomNum} — trancado (${!keyOk ? 'falta a chave' : 'faltam as válvulas'})`,
          action: () => {
            g.audio.play('creak', { gain: 0.35, rate: 1.6 });
            g.hud.message(why, 4);
          },
        };
      }
      return { label: `Abrir o Quarto ${this.roomNum}`, action: () => this.openRoom() };
    }
    if (this.near(player, this.gramo.x, this.gramo.z, 1.5)) return { label: 'Trocar o disco', action: () => this.nextRecord(true) };
    // outras portas: sempre trancadas
    const c = this.cell;
    const ix = Math.floor(player.pos.x / c);
    const iz = Math.floor(player.pos.z / c);
    if (this.cellKind(ix, iz) === HALL) {
      for (const w of this.hallWalls(ix, iz)) {
        const info = this.wallInfo(w.kind, w.ex, w.ez);
        if (!info || info.type !== 'door') continue;
        if (!this.near(player, w.wx + w.nx * 0.3, w.wz + w.nz * 0.3, 1.2)) continue;
        const num = this.roomNumber(w.kind, w.ex, w.ez);
        return {
          label: `Quarto ${num}`,
          action: () => {
            g.audio.play('creak', { gain: 0.3, rate: 1.7 });
            const msgs = [
              'Trancada. A maçaneta nem se mexe.',
              'Trancada. Do outro lado, alguém prende a respiração.',
              'Trancada. Você ouve um copo sendo pousado lá dentro.',
            ];
            g.hud.message(msgs[Math.floor(Math.random() * msgs.length)], 3);
          },
        };
      }
    }
    return null;
  }

  turnValve(v) {
    v.turning = 1.7;
    this.game.audio.play('creak', { gain: 0.55, rate: 0.55, wet: 0.6 });
  }

  valveDone(v) {
    v.done = true;
    v.turning = 0;
    const g = this.game;
    const i = this.valves.indexOf(v);
    this.steam.setOn(i, false);
    if (this.hiss && this.hiss[i]) this.hiss[i].setGain(0, 0.4);
    v.lamp.material.color.setRGB(0.25, 2.6, 0.5);
    const n = this.valves.filter((q) => q.done).length;
    g.setObjectiveText('valves', `Desligue as válvulas da Sala das Caldeiras (${n}/3)`);
    g.audio.click();
    if (this.machine) this.machine.setGain(0.5 * (1 - n / 3) + 0.04, 1.2);
    if (n === 3) {
      this.doorLamp.material.color.setRGB(0.25, 2.6, 0.5);
      if (this.machine && this.machine.src) this.machine.src.playbackRate.setTargetAtTime(0.45, g.audio.ctx.currentTime, 1.5);
      g.completeObjective('valves', `As caldeiras silenciam. Em algum lugar, a fechadura do Quarto ${this.roomNum} estala.`);
    } else g.hud.message(`Válvula fechada (${n}/3). O chiado diminui.`, 3);
  }

  openRoom() {
    const d = this.door;
    d.opening = true;
    this.game.completeObjective('room', `O Quarto ${this.roomNum} se abre. Lá dentro, só escuridão — e o jazz.`);
    this.game.reachExit('door', 1.4);
  }

  navTarget() {
    const cur = this.game.currentObjective();
    if (!cur || cur.id === 'room') return this.exit;
    if (cur.id === 'key') return this.keyPos;
    const p = this.game.player.pos;
    let best = null;
    let bd = 1e9;
    for (const v of this.valves) {
      if (v.done) continue;
      const dd = Math.hypot(v.wx - p.x, v.wz - p.z);
      if (dd < bd) {
        bd = dd;
        best = { x: v.wx, z: v.wz };
      }
    }
    return best || this.exit;
  }

  exitEmitter() {
    const d = this.door;
    return { x: d.x - d.nx * 0.8, y: 1.4, z: d.z - d.nz * 0.8, sound: 'knock' };
  }

  surfaceAt(x, z) {
    const c = this.cell;
    const ix = Math.floor(x / c);
    const iz = Math.floor(z / c);
    const k = this.cellKind(ix, iz);
    if (k === BOIL) return 'concrete';
    if (k === HALL) {
      const lx = x - ix * c - c / 2;
      const lz = z - iz * c - c / 2;
      const ax = this.hallAxis(ix, iz);
      const on = ax === 0 ? Math.abs(lz) < 0.7 : ax === 1 ? Math.abs(lx) < 0.7 : Math.abs(lx) < 0.7 || Math.abs(lz) < 0.7;
      return on ? 'carpet' : 'wood';
    }
    return 'carpet';
  }

  onCollapse() {
    this.guest.reset();
    this.game.power = 1;
  }

  // ------------------------------------------------------------ som
  initAudio() {
    const a = this.game.audio;
    if (!a.ready || this.audioOn) return;
    this.audioOn = true;
    a.ensureJazz();
    if (!a.B.l5party) a.addBuffer('l5party', makePartyBuffer());
    if (!a.B.l5steam) a.addBuffer('l5steam', makeSteamBuffer());
    this.startJazz(0);
    const b = this.boil;
    this.machine = a.positional('machine', b.bx, 1.4, b.dz, { gain: 0.5, ref: 4, rolloff: 1.3, wet: 0.5, rate: 0.8 });
    this.hiss = this.valves.map((v) =>
      a.positional('l5steam', v.wx, v.y + 0.4, v.wz, { gain: v.done ? 0 : 0.22, ref: 1.5, rolloff: 1.6, wet: 0.4 }),
    );
  }

  // Vitrola do salão e alto-falantes dos corredores tocando o mesmo disco.
  startJazz(offset) {
    const a = this.game.audio;
    if (this.jazz) this.jazz.stop();
    if (this.jazzHall) this.jazzHall.stop();
    const o = { rate: this.jazzRate, offset, wet: 0.45 };
    this.jazz = a.positional('jazz', this.gramo.x + 0.2, 1.2, this.gramo.z, { ...o, gain: 0.55, ref: 2.5, rolloff: 1.1 });
    this.jazzHall = a.positional('jazz', 0, 3, 0, { ...o, gain: 0, ref: 2, rolloff: 1.4, wet: 0.7 });
    this.speakerT = 0;
  }

  // Troca de disco: arranhão da agulha e outra rotação/trecho.
  nextRecord(manual) {
    const a = this.game.audio;
    a.crackle(0.9);
    a.click();
    const rates = [0.86, 0.93, 1.0, 1.07];
    let r = this.jazzRate;
    while (r === this.jazzRate) r = rates[Math.floor(Math.random() * rates.length)];
    this.jazzRate = r;
    if (this.audioOn) this.startJazz(Math.random() * 16);
    this.recT = 70 + Math.random() * 70;
    if (manual) this.game.hud.message('A agulha pula para outro disco. Ninguém o colocou ali.', 3);
  }

  // Alto-falante de corredor mais próximo (para o jazz "dos corredores").
  nearestSpeaker(p) {
    const c = this.cell;
    const pcx = Math.floor(p.x / c);
    const pcz = Math.floor(p.z / c);
    let best = null;
    let bd = 1e9;
    for (let iz = pcz - 5; iz <= pcz + 5; iz++) {
      for (let ix = pcx - 5; ix <= pcx + 5; ix++) {
        for (const kind of [EH, EV]) {
          const w = this.wallInfo(kind, ix, iz);
          if (!w || w.type !== 'speaker') continue;
          const d = Math.hypot(w.sl.fx - p.x, w.sl.fz - p.z);
          if (d < bd) {
            bd = d;
            best = w.sl;
          }
        }
      }
    }
    return best;
  }

  // Conversa de festa abafada vinda de um quarto ao lado.
  party(p) {
    const c = this.cell;
    const ix = Math.floor(p.x / c);
    const iz = Math.floor(p.z / c);
    const walls = this.hallWalls(ix, iz);
    if (!walls.length) return;
    const w = walls[Math.floor(Math.random() * walls.length)];
    this.game.audio.positional('l5party', w.wx - w.nx * 1.4, 1.5, w.wz - w.nz * 1.4, {
      loop: false,
      gain: 0.55,
      ref: 2,
      rolloff: 1.3,
      wet: 0.8,
    });
  }

  // ------------------------------------------------------------ quadro a quadro
  tick(dt, player) {
    const g = this.game;
    const p = player.pos;
    this.t += dt;
    this.initAudio();
    const c = this.cell;
    const here = this.cellKind(Math.floor(p.x / c), Math.floor(p.z / c));
    // jazz: troca de disco e alto-falante mais próximo
    this.recT -= dt;
    if (this.recT <= 0) this.nextRecord(false);
    this.speakerT -= dt;
    if (this.audioOn && this.speakerT <= 0) {
      this.speakerT = 0.6;
      const sp = here === HALL ? this.nearestSpeaker(p) : null;
      if (sp) {
        this.jazzHall.setPos(sp.fx + sp.nx * 0.1, 3.0, sp.fz + sp.nz * 0.1);
        this.jazzHall.setGain(0.2, 0.6);
      } else this.jazzHall.setGain(0, 0.8);
    }
    // festa do outro lado da parede
    this.partyT -= dt;
    if (this.partyT <= 0) {
      this.partyT = 40 + Math.random() * 50;
      if (this.audioOn && here === HALL) this.party(p);
    }
    // válvulas girando
    for (const v of this.valves) {
      if (v.turning > 0) {
        v.turning -= dt;
        v.a += dt * 7.5;
        if (v.turning <= 0) this.valveDone(v);
      }
      if (v.mesh) v.mesh.rotation.z = v.a;
    }
    // vapor e lâmpadas só perto das caldeiras
    const b = this.boil;
    const db = Math.hypot(p.x - (b.X0 + b.X1) / 2, p.z - (b.Z0 + b.Z1) / 2);
    const nearB = db < 26;
    this.steam.points.visible = nearB;
    for (const l of this.lamps) l.visible = nearB;
    if (nearB) this.steam.update(dt, this.lightLevel(b.walkX, b.dz) * g.power);
    // porta do quarto se abrindo
    const d = this.door;
    if (d.opening && d.open < 1) {
      d.open = Math.min(1, d.open + dt * 0.9);
      if (d.pivot) d.pivot.rotation.y = Math.atan2(d.nx, d.nz) + (1 - Math.pow(1 - d.open, 2)) * 1.45;
    }
    // O Hóspede: só nos corredores, depois de pegar a chave
    const allowed = here === HALL && g.objectiveDone('key') && this.t > 35 && !d.opening;
    const st = this.guest.update(dt, player, allowed);
    if (st) {
      const near = clamp(1 - st.d / 13, 0, 1);
      g.st.fear = Math.max(g.st.fear, clamp(1 - st.d / 16, 0, 1));
      // luzes piscam perto dele
      if (near > 0) {
        for (const f of this.flick) if (f.burst <= 0 && Math.random() < dt * near * 1.5) f.burst = 0.2 + Math.random() * 0.5;
        g.power = 1 - near * 0.35 * (0.5 + 0.5 * Math.sin(this.t * 23) * Math.sin(this.t * 7.1));
        this.powerTouched = true;
      } else if (this.powerTouched) {
        g.power = 1;
        this.powerTouched = false;
      }
    } else if (this.powerTouched) {
      g.power = 1;
      this.powerTouched = false;
    }
  }

  dispose() {
    super.dispose();
    this.guest.dispose();
    this.steam.dispose();
    this.lampGeo.dispose();
    for (const l of this.lamps) l.material.dispose();
    for (const m of this.placeholders) m.dispose();
    this.panelMat.dispose();
    this.glowMat.dispose();
  }
}
