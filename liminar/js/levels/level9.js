// Nível 9 — Os Subúrbios: bairro infinito à meia-noite. Ruas molhadas, postes falhando,
// casas todas diferentes (quase sempre) e os Cães rondando as ruas, caçando pelo som.
// Objetivos: achar a caixa de correio com a bandeira levantada (endereço), juntar pilhas
// e entrar na casa certa (a da luz de varanda acesa, com a TV chiando lá dentro).
import * as THREE from 'three';
import { OutdoorLevel } from './outdoor.js';
import { GeoBuilder } from '../materials.js';
import { getTex } from '../textures.js';
import { mulberry32, hash3, clamp, smoothstep } from '../util.js';
import {
  P,
  RW,
  CURB,
  STRIP,
  LOT,
  ROWL,
  FLOOR,
  LAMP_H,
  rowWorld,
  lampsOf,
  planBlock,
  buildLot,
  curbCar,
  mailboxAt,
} from './level9_build.js';
import {
  STREETS_H,
  STREETS_V,
  signAtlas,
  lampUniforms,
  injectLamps,
  baseMat,
  makeGroundMat,
  makeYardMat,
  makeWindowMat,
  makeLampMat,
  makeHaloMat,
  makeFoliageMat,
  makeNightSky,
} from './level9_mats.js';
import { Hounds } from './level9_hounds.js';

const SAFE_R = 5.5; // raio da "poça de luz" de um poste aceso (zona segura)
const METAL = [0.13, 0.14, 0.15];
const FENCE = [0.3, 0.22, 0.15];
const md = (v) => {
  // distância até o eixo da rua mais próxima
  const r = ((v % P) + P) % P;
  return Math.min(r, P - r);
};

export class Level9 extends OutdoorLevel {
  constructor(game) {
    // a neblina noturna esconde tudo além de ~70–130 m: gera menos blocos
    const view = clamp(game.Q.outdoorView * 0.5, 70, 130);
    super(game, { P, Q: { ...game.Q, outdoorView: view }, walkSpeed: 2.5, camFar: view + 300, shadowDist: 150, flashIntensity: 12 });
    this.num = 9;
    this.seed = (game.seed ^ 0x9a9a9) >>> 0;
    const Q = this.Q;
    const fogD = 2.05 / view;
    this.look = {
      exposure: 1.05,
      tint: [0.94, 1.0, 1.05],
      sat: 0.82,
      contrast: 1.08,
      lift: [0.004, 0.007, 0.01],
      bloom: 0.32,
      bloomThreshold: 1.0,
      fog: [0.02, 0.03, 0.034],
      lightColor: [1, 1, 1],
      flashlight: true,
      battery: 1 / 150,
      ambience: 'level9',
      reverb: 1.4,
      sanityDrain: 0.05,
    };
    const fogC = new THREE.Color(...this.look.fog);
    this.scene.fog = new THREE.FogExp2(fogC, fogD);
    this.scene.background = fogC;
    // estado do planejamento (determinístico pela semente)
    this.plans = new Map();
    this.lampCache = new Map();
    this.forced = new Map();
    this.forceLamp = new Map();
    this.goalInfo = null;
    const rnd = mulberry32((this.seed * 13 + 5) >>> 0);
    this.nameOff = Math.floor(rnd() * 12);
    this.nameOffV = Math.floor(rnd() * 12);
    // céu com lua e luz fraca e azulada
    const moonDir = new THREE.Vector3(0.42, 0.5, -0.76).normalize();
    this.skyOpts = {
      zenith: [0.003, 0.005, 0.01],
      horizon: [0.03, 0.042, 0.046],
      fog: this.look.fog,
      moonDir,
      moon: [0.85, 0.9, 1.0],
      cloud: [0.012, 0.016, 0.02],
      cloudLit: [0.09, 0.1, 0.12],
      cover: 0.42,
    };
    this.sky = makeNightSky(this.skyOpts);
    this.scene.add(this.sky);
    this.setupLights({
      sky: 0x34445e,
      ground: 0x0b0f0b,
      hemi: 0.42,
      sunColor: 0x9fb6e6,
      sun: 0.42,
      sunDir: moonDir,
      shadowExtent: 45,
      shadowFar: 400,
    });
    let env = null;
    if (Q.envMap) {
      const sc = new THREE.Scene();
      const sk = makeNightSky(this.skyOpts);
      sc.add(sk);
      const rt = game.pmrem.fromScene(sc, 0, 0.1, 1500);
      game.envs.push(rt);
      env = rt.texture;
      sk.geometry.dispose();
      sk.material.dispose();
    }
    this.env = env;
    // luzes dos postes/varandas injetadas nos shaders (as N mais próximas)
    this.lampU = lampUniforms(Q.lambert ? 6 : Q.id === 'medium' ? 8 : 10);
    this.wind = { uTime: { value: 0 } };
    this.atlas = signAtlas(1024);
    const S = Q.tex;
    const sid = getTex('l9Siding', S);
    const shi = getTex('l9Shingle', S);
    const gri = getTex('grime', S);
    const U = this.lampU;
    this.mats = {
      wall: injectLamps(
        baseMat(Q, { map: sid.map, normalMap: sid.normalMap, normalScale: 0.8, roughness: 0.82, envMap: env, envIntensity: 0.3 }),
        U,
        {
          shin: '14.0',
          spec: '0.08',
        },
      ),
      roof: injectLamps(baseMat(Q, { map: shi.map, normalMap: shi.normalMap, roughness: 0.75, envMap: env, envIntensity: 0.5 }), U, {
        shin: '22.0',
        spec: '0.18',
      }),
      trim: injectLamps(baseMat(Q, { map: gri.map, roughness: 0.6, envMap: env, envIntensity: 0.4 }), U, { shin: '28.0', spec: '0.2' }),
      win: makeWindowMat(Q, U, env),
      fol: makeFoliageMat(Q, U, this.wind),
      lamp: makeLampMat(),
      halo: makeHaloMat(fogD),
      sign: injectLamps(baseMat(Q, { map: this.atlas.tex, alphaTest: 0.5, roughness: 0.45 }), U, { shin: '30.0', spec: '0.3' }),
      yard: makeYardMat(Q, U, P, RW, STRIP, LOT),
    };
    this.route(rnd);
    this.makeGround();
    this.makeFlag();
    this.hounds = new Hounds(this);
    this.makeSnowfall();
    this.bat = 0;
    this._lights = [];
    this.objectives = [
      { id: 'mail', text: 'Encontre a caixa de correio com a bandeira levantada' },
      { id: 'batteries', text: 'Junte pilhas para a lanterna (0/3)' },
      { id: 'house', text: 'Entre na casa nº ??' },
    ];
  }

  // Nome da rua (e índice no atlas das placas).
  street(road, idx) {
    const k = (((idx + (road === 'h' ? this.nameOff : this.nameOffV)) % 12) + 12) % 12;
    return road === 'h' ? { name: STREETS_H[k], atlas: k } : { name: STREETS_V[k], atlas: 12 + k };
  }

  // Caixa de correio a ~60 m do início, ao lado de um poste aceso; casa certa a ~110 m dela.
  route(rnd) {
    this.forced.set(this.chunkKey(0, 0), { orient: 'x', lots: [3, 3], special: [0, 0, 'mail', 16 - LOT + 2.4] });
    this.forceLamp.set('0,0,0', 0);
    this.forceLamp.set('0,-1,0', 0);
    const gi = rnd() < 0.5 ? 1 : -2;
    this.forced.set(this.chunkKey(gi, 1), { orient: 'z', lots: [3, 3], special: [0, 1, 'goal'] });
    // a casa coberta de neve (Nível 9.5), num quarteirão vizinho ao início
    const si = gi === 1 ? -1 : 1;
    this.forced.set(this.chunkKey(si, -1), { orient: 'z', lots: [3, 3], special: [1, 1, 'snow'] });
    // rua da casa certa: escura, com a luz da varanda; um poste aceso do outro lado
    this.forceLamp.set(`${gi},1,2`, 4);
    this.forceLamp.set(`${gi},1,3`, 0);
    // caixa de correio
    const mp = planBlock(this, 0, 0);
    const mrow = mp.rows[0];
    const mlot = mrow.lots.find((l) => l.special === 'mail');
    const mb = -(LOT - RW - 0.6);
    const [mx, mz] = rowWorld(mrow.fr, mlot.mailA, mb);
    this.mail = { x: mx, z: mz, fr: mrow.fr, a: mlot.mailA, b: mb };
    // casa certa
    const gp = planBlock(this, gi, 1);
    const grow = gp.rows[0];
    const glot = grow.lots.find((l) => l.special === 'goal');
    const h = glot.house;
    const fr = grow.fr;
    const lc = (glot.a0 + glot.a1) / 2;
    const [dx, dz] = rowWorld(fr, lc + h.cu + h.doorU, h.setback);
    const [ix, iz] = rowWorld(fr, lc + h.cu + h.doorU, h.setback - 0.7);
    const [cx, cz] = rowWorld(fr, lc + h.cu, h.setback + h.hd / 2);
    const number = 11 + 2 * Math.floor(rnd() * 40);
    const st = this.street(fr.road, fr.roadIdx);
    this.goalInfo = { road: fr.road, roadIdx: fr.roadIdx, V: fr.V, along: fr.road === 'h' ? dx : dz, number, name: st.name };
    this.door = { x: ix, z: iz, cx, cz };
    this.exit = { x: ix, z: iz };
    this.spawn = { x: -0.6, z: -45, yaw: Math.PI };
    {
      const sp = planBlock(this, si, -1);
      const row = sp.rows[1];
      const lot = row.lots.find((l) => l.special === 'snow');
      const hh = lot.house;
      const lc2 = (lot.a0 + lot.a1) / 2;
      const [sx, sz] = rowWorld(row.fr, lc2 + hh.cu + hh.doorU, hh.setback - 0.7);
      const [scx, scz] = rowWorld(row.fr, lc2 + hh.cu, hh.setback + hh.hd / 2);
      const [y0x, y0z] = rowWorld(row.fr, lot.a0, -0.2);
      const [y1x, y1z] = rowWorld(row.fr, lot.a1, hh.setback + hh.hd + 3);
      this.snowHouse = { x: sx, z: sz, cx: scx, cz: scz, x0: Math.min(y0x, y1x), x1: Math.max(y0x, y1x), z0: Math.min(y0z, y1z), z1: Math.max(y0z, y1z), chunk: this.chunkKey(si, -1) };
    }
  }

  makeGround() {
    const size = this.Q.outdoorView * 2 + P * 2;
    const g = new THREE.PlaneGeometry(size, size, 1, 1);
    g.rotateX(-Math.PI / 2);
    this.groundMat = makeGroundMat(this.Q, this.lampU, P, RW, this.env);
    this.ground = new THREE.Mesh(g, this.groundMat);
    this.ground.receiveShadow = this.Q.shadows;
    this.ground.frustumCulled = false;
    this.scene.add(this.ground);
  }

  // Bandeira vermelha levantada na caixa de correio do objetivo (abaixa ao abrir).
  makeFlag() {
    const m = this.mail;
    const mat = new THREE.MeshStandardMaterial({ color: 0xd0160f, emissive: 0x8a0c06, roughness: 0.4, metalness: 0.2 });
    const root = new THREE.Group();
    const [px, pz] = rowWorld(m.fr, m.a + 0.14, m.b - 0.02);
    root.position.set(px, CURB + 1.1, pz);
    root.rotation.y = m.fr.rot;
    const piv = new THREE.Group();
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.36, 0.026), mat);
    arm.position.y = 0.18;
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.13, 0.19), mat);
    flag.position.set(0, 0.3, 0.095);
    piv.add(arm, flag);
    root.add(piv);
    this.dynamic.add(root);
    this.flag = { root, piv, mat, geos: [arm.geometry, flag.geometry], down: false };
  }

  *genChunk(ch) {
    const { i, j, x0, z0 } = ch;
    ch.walls = [];
    ch.steps = [];
    ch.porch = [];
    ch.lights = [];
    const rnd = mulberry32(((i * 92837111) ^ (j * 689287499) ^ (this.seed + 77)) >>> 0);
    const plan = planBlock(this, i, j);
    const B = {};
    for (const k of ['yard', 'wall', 'roof', 'trim', 'win', 'fol', 'sign', 'lamp', 'halo']) B[k] = new GeoBuilder();
    // laje dos lotes (as faces laterais são o meio-fio)
    B.yard.box(x0 + P / 2, CURB / 2, z0 + P / 2, P - 2 * RW, CURB, P - 2 * RW, [1, 1, 1], null, { ao: 0, skip: 'ny' });
    this.buildLamps(B, ch, i, j);
    this.buildCorner(B, ch, i, j, rnd);
    yield;
    const lots = [];
    for (let r = 0; r < plan.rows.length; r++) {
      const row = plan.rows[r];
      for (let k = 0; k < row.lots.length; k++) {
        const lot = row.lots[k];
        const res = buildLot(this, B, ch, row, lot, r, k);
        lots.push({ row, lot, res });
        if (lot.special === 'mail') mailboxAt(B, ch, row.fr, lot.mailA, -(LOT - RW - 0.6), [0.09, 0.1, 0.11], true);
        yield;
      }
    }
    if (this.snowHouse && this.snowHouse.chunk === this.chunkKey(i, j)) this.buildSnow(B, ch);
    if (plan.backFence) this.backFence(B, ch, plan);
    this.curbCars(B, ch, rnd);
    if (plan.hydrant >= 0) this.hydrant(B, ch, plan, lots);
    // luzes de varanda acesas
    for (const pl of ch.porch)
      ch.lights.push({ x: pl.x, y: pl.y, z: pl.z, col: [1.0, 0.52, 0.2], I: pl.goal ? 9 : 6, R: pl.goal ? 11 : 9, cone: 0, state: 0 });
    this.placeItems(ch, lots, rnd);
    yield;
    // malhas em três etapas (a montagem das geometrias custa vários ms num celular)
    this._bch = ch;
    const M = this.mats;
    const add = (gb, mat, o) => (gb.empty ? null : this.addMesh(ch, gb.build(), mat, o));
    add(B.yard, M.yard, { cast: false });
    add(B.wall, M.wall);
    yield;
    add(B.roof, M.roof);
    add(B.trim, M.trim);
    yield;
    add(B.fol, M.fol);
    add(B.win, M.win.mat, { cast: false });
    add(B.sign, M.sign, { cast: false });
    add(B.lamp, M.lamp, { cast: false, receive: false });
    const halo = add(B.halo, M.halo, { cast: false, receive: false });
    if (halo) halo.renderOrder = 2;
    this._bch = null;
  }

  // Flocos caindo só em volta da casa brilhante (ela parece estar em outro inverno).
  makeSnowfall() {
    const s = this.snowHouse;
    const n = this.Q.id === 'low' ? 500 : 1200;
    const pos = new Float32Array(n * 3);
    const r = mulberry32(951);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = s.x0 - 4 + r() * (s.x1 - s.x0 + 8);
      pos[i * 3 + 1] = r() * 14;
      pos[i * 3 + 2] = s.z0 - 4 + r() * (s.z1 - s.z0 + 8);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const cv = document.createElement('canvas');
    cv.width = cv.height = 32;
    const c = cv.getContext('2d');
    const gr = c.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr;
    c.fillRect(0, 0, 32, 32);
    this.snowTex = new THREE.CanvasTexture(cv);
    this.snowPts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.09, map: this.snowTex, transparent: true, depthWrite: false, color: 0xdde8ff, fog: true }));
    this.snowPts.frustumCulled = false;
    this.scene.add(this.snowPts);
  }

  updateSnowfall(dt) {
    const s = this.snowHouse;
    const a = this.snowPts.geometry.attributes.position;
    const t = this.game.time;
    for (let i = 0; i < a.count; i++) {
      let y = a.getY(i) - dt * (0.6 + (i % 7) * 0.08);
      if (y < 0) y += 14;
      a.setY(i, y);
      a.setX(i, a.getX(i) + Math.sin(t * 0.7 + i) * dt * 0.15);
    }
    a.needsUpdate = true;
    void s;
  }

  // Neve sobre o quintal da casa brilhante: manto, montes e luz quente.
  buildSnow(B, ch) {
    const s = this.snowHouse;
    const rnd = mulberry32(959);
    const W = [0.9, 0.93, 0.98];
    B.trim.box((s.x0 + s.x1) / 2, CURB + 0.05, (s.z0 + s.z1) / 2, s.x1 - s.x0, 0.1, s.z1 - s.z0, W, null, { ao: 0, skip: 'ny' });
    for (let k = 0; k < 26; k++) {
      const x = s.x0 + rnd() * (s.x1 - s.x0);
      const z = s.z0 + rnd() * (s.z1 - s.z0);
      const r = 0.4 + rnd() * 1.1;
      B.trim.cylinder(x, CURB + 0.1, z, r, 0.25 + rnd() * 0.2, W, null, { sides: 10, r2: r * 0.55 });
    }
    ch.lights.push({ x: s.cx, y: FLOOR + 1.6, z: s.cz, col: [1.0, 0.75, 0.45], I: 14, R: 16, cone: 0, state: 0 });
    ch.lights.push({ x: s.x, y: FLOOR + 2.2, z: s.z, col: [0.85, 0.9, 1.0], I: 8, R: 12, cone: 0, state: 0 });
  }

  // Postes: coluna, braço, luminária "cabeça de cobra", lente e halo (cone na neblina + brilho).
  buildLamps(B, ch, i, j) {
    for (const l of lampsOf(this, i, j)) {
      B.trim.box(l.x, CURB + 0.12, l.z, 0.3, 0.24, 0.3, [0.42, 0.41, 0.39], null, { ao: 0.2 });
      B.trim.cylinder(l.x, (CURB + LAMP_H) / 2, l.z, 0.085, LAMP_H - CURB, METAL, null, { sides: 8, r2: 0.06 });
      const ax = Math.abs(l.ax);
      const az = Math.abs(l.az);
      B.trim.box(l.x + l.ax * 0.95, LAMP_H - 0.02, l.z + l.az * 0.95, ax * 1.9 + 0.07, 0.07, az * 1.9 + 0.07, METAL, null, { ao: 0 });
      B.trim.box(l.hx, LAMP_H - 0.08, l.hz, ax ? 0.72 : 0.34, 0.16, az ? 0.72 : 0.34, [0.2, 0.21, 0.22], null, { ao: 0 });
      B.lamp.box(l.hx, LAMP_H - 0.17, l.hz, ax ? 0.52 : 0.24, 0.03, az ? 0.52 : 0.24, l.col, null, { ao: 0, group: l.state });
      ch.colliders.push([l.x - 0.16, l.x + 0.16, l.z - 0.16, l.z + 0.16]);
      if (l.state === 4) continue;
      this.halo(B.halo, l.hx, LAMP_H - 0.2, l.hz, l.col, l.state);
      ch.lights.push({ x: l.hx, y: LAMP_H - 0.35, z: l.hz, col: l.col, I: l.I, R: 22, cone: 1, state: l.state });
    }
  }

  // Cone de luz na neblina (uv.y: 0 no chão, 1 na lâmpada) e brilho em billboard.
  halo(gb, x, y, z, col, g) {
    const n = 12;
    const r0 = 3.4;
    const r1 = 0.22;
    const cols = [col, col, col, col];
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2;
      const a1 = ((k + 1) / n) * Math.PI * 2;
      const am = (a0 + a1) / 2;
      const p0 = [x + Math.cos(a0) * r0, 0.05, z + Math.sin(a0) * r0];
      const p1 = [x + Math.cos(a1) * r0, 0.05, z + Math.sin(a1) * r0];
      const p2 = [x + Math.cos(a1) * r1, y, z + Math.sin(a1) * r1];
      const p3 = [x + Math.cos(a0) * r1, y, z + Math.sin(a0) * r1];
      gb.quad([p1, p0, p3, p2], [Math.cos(am), 0, Math.sin(am)], [0, 0, 0, 0, 0, 1, 0, 1], null, cols, g);
    }
    const s = 2.6;
    gb.quad(
      [
        [x, y, z],
        [x, y, z],
        [x, y, z],
        [x, y, z],
      ],
      [0, 0, 1],
      [0, 0, 1, 0, 1, 1, 0, 1],
      [1, s, 1, s, 1, s, 1, s],
      cols,
      g,
    );
  }

  // Retângulo de atlas virado para (nx, nz), em coordenadas de mundo.
  plate(gb, x, y, z, nx, nz, w, h, uv, col) {
    const r = [nz, -nx];
    const pts = [
      [x - (r[0] * w) / 2, y - h / 2, z - (r[1] * w) / 2],
      [x + (r[0] * w) / 2, y - h / 2, z + (r[1] * w) / 2],
      [x + (r[0] * w) / 2, y + h / 2, z + (r[1] * w) / 2],
      [x - (r[0] * w) / 2, y + h / 2, z - (r[1] * w) / 2],
    ];
    gb.quad(pts, [nx, 0, nz], [uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]], null, [col, col, col, col], 0);
  }

  // Esquina (x0, z0): placas com os nomes das duas ruas e, às vezes, uma placa PARE.
  buildCorner(B, ch, i, j, rnd) {
    const x = ch.x0 + RW + 0.75;
    const z = ch.z0 + RW + 0.75;
    const green = [0.2, 0.24, 0.22];
    B.trim.cylinder(x, CURB + 1.6, z, 0.04, 3.2, green, null, { sides: 6 });
    ch.colliders.push([x - 0.08, x + 0.08, z - 0.08, z + 0.08]);
    const W = 0.95;
    const H = 0.135;
    const hName = this.street('h', j);
    const vName = this.street('v', i);
    const white = [1, 1, 1];
    // placa da rua horizontal (paralela a x), legível dos dois lados
    const y1 = CURB + 3.0;
    B.trim.box(x + 0.2, y1, z, W, H, 0.02, [0.06, 0.18, 0.4], null, { ao: 0 });
    this.plate(B.sign, x + 0.2, y1, z + 0.012, 0, 1, W, H, this.atlas.name(hName.atlas), white);
    this.plate(B.sign, x + 0.2, y1, z - 0.012, 0, -1, W, H, this.atlas.name(hName.atlas), white);
    // placa da rua vertical (paralela a z)
    const y2 = CURB + 3.17;
    B.trim.box(x, y2, z + 0.2, 0.02, H, W, [0.06, 0.18, 0.4], null, { ao: 0 });
    this.plate(B.sign, x + 0.012, y2, z + 0.2, 1, 0, W, H, this.atlas.name(vName.atlas), white);
    this.plate(B.sign, x - 0.012, y2, z + 0.2, -1, 0, W, H, this.atlas.name(vName.atlas), white);
    // PARE para quem desce a rua vertical em direção ao cruzamento
    if (hash3(i * 5 + 1, j * 3 - 2, this.seed + 31) < 0.45) {
      const sx = ch.x0 + RW + 0.5;
      const sz = ch.z0 + LOT + 0.4;
      B.trim.box(sx, CURB + 1.1, sz, 0.06, 2.2, 0.06, [0.5, 0.5, 0.5], null, { ao: 0 });
      this.plate(B.sign, sx, CURB + 2.15, sz + 0.035, 0, 1, 0.72, 0.72, this.atlas.stop, [0.95, 0.95, 0.95]);
      this.plate(B.sign, sx, CURB + 2.15, sz - 0.005, 0, -1, 0.72, 0.72, this.atlas.stop, [0.12, 0.12, 0.12]);
      ch.colliders.push([sx - 0.06, sx + 0.06, sz - 0.06, sz + 0.06]);
    }
  }

  // Cerca alta de madeira entre os quintais das duas fileiras.
  backFence(B, ch, plan) {
    const alongX = plan.orient === 'z';
    const cx = ch.x0 + P / 2;
    const cz = ch.z0 + P / 2;
    B.trim.box(cx, CURB + 0.95, cz, alongX ? ROWL : 0.05, 1.7, alongX ? 0.05 : ROWL, FENCE, null, { ao: 0.3, floorY: CURB, uvScale: 0.4 });
    for (let t = -ROWL / 2; t <= ROWL / 2 + 0.01; t += 2.4) {
      B.trim.box(cx + (alongX ? t : 0), CURB + 1.0, cz + (alongX ? 0 : t), 0.1, 1.85, 0.1, [0.25, 0.18, 0.12], null, {
        ao: 0.2,
        floorY: CURB,
      });
    }
    const hx = alongX ? ROWL / 2 : 0.08;
    const hz = alongX ? 0.08 : ROWL / 2;
    ch.colliders.push([cx - hx, cx + hx, cz - hz, cz + hz]);
  }

  // Carros estacionados junto ao meio-fio, nos quatro lados do quarteirão.
  curbCars(B, ch, rnd) {
    const { x0, z0 } = ch;
    const sides = [
      [x0 + RW - 1.15, null, false],
      [x0 + P - RW + 1.15, null, false],
      [null, z0 + RW - 1.15, true],
      [null, z0 + P - RW + 1.15, true],
    ];
    for (const [sx, sz, alongX] of sides) {
      if (rnd() > 0.32) continue;
      const t = 12 + rnd() * (P - 24);
      const x = sx !== null ? sx : x0 + t;
      const z = sz !== null ? sz : z0 + t;
      if (Math.hypot(x - this.spawn.x, z - this.spawn.z) < 12) continue;
      if (Math.hypot(x - this.mail.x, z - this.mail.z) < 7) continue;
      curbCar(B, ch, x, z, alongX, rnd);
    }
  }

  // Hidrante na faixa de grama da primeira fileira.
  hydrant(B, ch, plan, lots) {
    const row = plan.rows[0];
    const a = plan.hydrant * ROWL;
    const b = -(LOT - RW - 0.7);
    const [x, z] = rowWorld(row.fr, a, b);
    const near = (px, pz, r) => Math.hypot(px - x, pz - z) < r;
    if (lampsOf(this, ch.i, ch.j).some((l) => near(l.x, l.z, 2.5))) return;
    if (lots.some((o) => o.row === row && near(...rowWorld(row.fr, o.lot.mailA, b), 2))) return;
    const red = [0.5, 0.06, 0.04];
    B.trim.cylinder(x, CURB + 0.3, z, 0.13, 0.6, red, null, { sides: 10 });
    B.trim.cylinder(x, CURB + 0.66, z, 0.1, 0.12, red, null, { sides: 10, r2: 0.04 });
    B.trim.cylinder(x, CURB + 0.38, z, 0.06, 0.42, [0.45, 0.42, 0.1], null, { sides: 6, axis: 'x' });
    ch.colliders.push([x - 0.18, x + 0.18, z - 0.18, z + 0.18]);
  }

  // Pilhas nas varandas e calçadas; às vezes um bilhete.
  placeItems(ch, lots, rnd) {
    const { i, j } = ch;
    const cands = [];
    for (const { row, lot, res } of lots) {
      const h = lot.house;
      if (h.porch) {
        const p = h.porch;
        const s = rnd() < 0.5 ? -1 : 1;
        const [x, z] = res.hc.w(p.u + s * Math.max(0.3, p.w / 2 - 0.5), h.hd / 2 + p.d * 0.55);
        cands.push({ x, z, y: FLOOR });
      } else {
        const [x, z] = rowWorld(row.fr, lot.a0 + 2 + rnd() * (lot.w - 4), -0.75);
        cands.push({ x, z, y: CURB });
      }
    }
    for (let k = cands.length - 1; k > 0; k--) {
      const r = Math.floor(rnd() * (k + 1));
      [cands[k], cands[r]] = [cands[r], cands[k]];
    }
    const n = rnd() < 0.35 ? 2 : 1;
    for (let k = 0; k < Math.min(n, cands.length); k++) {
      ch.items.push({ type: 'battery', key: `l9b:${i}:${j}:${k}`, ...cands[k], light: 0.45 });
    }
    if (rnd() < 0.15 && lots.length) {
      const o = lots[Math.floor(rnd() * lots.length)];
      const [x, z] = rowWorld(o.row.fr, o.lot.a0 + 1.5 + rnd() * (o.lot.w - 3), -0.8);
      ch.items.push({ type: 'note', key: `l9n:${i}:${j}`, x, z, y: CURB, rot: rnd() * 6.28, light: 0.3 });
    }
  }

  // ------------------------------------------------------------ luz
  // Pisca-pisca dos postes: 1 falha de vez em quando, 2 morrendo devagar, 3 estrobo.
  flick(state, t) {
    if (state === 1) {
      const h = hash3(Math.floor(t * 9), 11, 1);
      return h < 0.1 ? 0.05 : h < 0.17 ? 0.45 : 1;
    }
    if (state === 2) {
      const c = (t % 11) / 11;
      if (c < 0.55) return 1;
      if (c < 0.62) return Math.floor(t * 18) % 2 ? 0.08 : 0.8;
      if (c < 0.85) return 0.03;
      return smoothstep(0.85, 1, c) * 0.9 + 0.03;
    }
    if (state === 3) return hash3(Math.floor(t * 13), 23, 3) < 0.45 ? 0.04 : 0.9;
    return 1;
  }

  updateLamps() {
    const t = this.game.time;
    const f = [1, this.flick(1, t), this.flick(2, t), this.flick(3, t)];
    const I = 6;
    for (const u of [this.mats.lamp.uniforms.uI.value, this.mats.halo.uniforms.uI.value]) {
      u[0] = I;
      u[1] = I * f[1];
      u[2] = I * f[2];
      u[3] = I * f[3];
    }
    // TVs: azul trêmulo
    const W = this.mats.win.uniforms.uWin.value;
    const tv = 0.55 + 0.45 * hash3(Math.floor(t * 7), 5, 9);
    W[2].setRGB(0.5 * tv, 0.7 * tv, 1.4 * tv);
    const tv2 = 0.5 + 0.5 * hash3(Math.floor(t * 9), 7, 13);
    W[4].setRGB(0.6 * tv2, 0.8 * tv2, 1.7 * tv2);
    // as N luzes mais próximas da câmera vão para os uniforms
    const cam = this.game.camera.position;
    const list = this._lights;
    list.length = 0;
    for (const ch of this.chunks.values()) {
      for (const L of ch.lights) {
        const d = Math.hypot(L.x - cam.x, L.z - cam.z);
        if (d < 80) list.push({ d, L });
      }
    }
    list.sort((a, b) => a.d - b.d);
    const U = this.lampU;
    for (let k = 0; k < U.n; k++) {
      const p = U.uL9P.value[k];
      const c = U.uL9C.value[k];
      const e = list[k];
      if (!e) {
        p.set(0, -1e4, 0, 1);
        c.set(0, 0, 0, 0);
        continue;
      }
      const L = e.L;
      const k2 = L.I * f[L.state] * clamp((80 - e.d) / 16, 0, 1);
      p.set(L.x, L.y, L.z, L.R);
      c.set(L.col[0] * k2, L.col[1] * k2, L.col[2] * k2, L.cone);
    }
  }

  // Dentro da poça de luz de um poste aceso (fixo)?
  inSafe(x, z, margin = 0) {
    const ci = Math.floor(x / P);
    const cj = Math.floor(z / P);
    const r = SAFE_R + margin;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        for (const l of lampsOf(this, ci + di, cj + dj)) {
          if (l.state === 0 && Math.abs(x - l.hx) < r && Math.abs(z - l.hz) < r && Math.hypot(x - l.hx, z - l.hz) < r) return true;
        }
      }
    }
    return false;
  }

  // Empurra p para fora das poças de luz (os Cães contornam a borda).
  pushOutSafe(p, h) {
    const ci = Math.floor(p.x / P);
    const cj = Math.floor(p.z / P);
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        for (const l of lampsOf(this, ci + di, cj + dj)) {
          if (l.state !== 0) continue;
          const dx = p.x - l.hx;
          const dz = p.z - l.hz;
          const d = Math.hypot(dx, dz);
          if (d >= SAFE_R || d < 1e-4) continue;
          const side = h.side || 1;
          p.x = l.hx + (dx / d) * SAFE_R - (dz / d) * 0.03 * side;
          p.z = l.hz + (dz / d) * SAFE_R + (dx / d) * 0.03 * side;
        }
      }
    }
  }

  lightLevel(x, z) {
    return this.inSafe(x, z) ? 0.9 : 0.12;
  }

  // ------------------------------------------------------------ chão
  stepY(x, z) {
    const ch = this.chunks.get(this.chunkKey(Math.floor(x / P), Math.floor(z / P)));
    if (!ch || !ch.steps) return -1;
    let y = -1;
    for (const s of ch.steps) if (x >= s[0] && x <= s[1] && z >= s[2] && z <= s[3]) y = Math.max(y, s[4]);
    return y;
  }

  groundY(x, z) {
    if (md(x) <= RW || md(z) <= RW) return 0;
    return Math.max(CURB, this.stepY(x, z));
  }

  surfaceAt(x, z) {
    const a = md(x);
    const b = md(z);
    if (a <= RW || b <= RW) return 'asphalt';
    if (this.stepY(x, z) > CURB) return 'wood';
    const dm = Math.min(a, b);
    if ((a < LOT && b < LOT) || (dm > RW + STRIP && dm < LOT)) return 'concrete';
    return 'grass';
  }

  // ------------------------------------------------------------ laço
  update(dt, player) {
    const p = player.pos;
    this.updateChunks(p.x, p.z);
    const cam = this.game.camera.position;
    this.sky.position.copy(cam);
    this.sky.material.uniforms.uTime.value += dt;
    this.ground.position.set(Math.round(cam.x / 8) * 8, 0, Math.round(cam.z / 8) * 8);
    this.updateSun(p);
    this.wind.uTime.value = this.game.time;
    this.updateLamps();
    this.hounds.update(dt, player);
    this.updateSnowfall(dt);
    const sh = this.snowHouse;
    if (!this.toldSnow && Math.hypot(p.x - sh.cx, p.z - sh.cz) < 30) {
      this.toldSnow = true;
      this.game.hud.message('Uma casa coberta de neve, com todas as janelas acesas. Só nela está nevando.', 5);
    }
    // bandeira da caixa de correio
    const f = this.flag;
    f.piv.rotation.x += ((f.down ? -Math.PI / 2 : 0) - f.piv.rotation.x) * Math.min(1, dt * 6);
  }

  onBattery() {
    this.bat++;
    const n = Math.min(3, this.bat);
    this.game.setObjectiveText('batteries', `Junte pilhas para a lanterna (${n}/3)`);
    if (n >= 3) this.game.completeObjective('batteries', 'Pilhas suficientes. A lanterna vai aguentar.');
  }

  onCollapse() {
    this.hounds.reset();
  }

  interactable(player) {
    const g = this.game;
    const px = player.pos.x;
    const pz = player.pos.z;
    const m = this.mail;
    if (!g.objectiveDone('mail') && Math.hypot(px - m.x, pz - m.z) < 1.8) {
      return { label: 'Abrir a caixa de correio', action: () => this.openMail() };
    }
    const sh = this.snowHouse;
    if (Math.hypot(px - sh.x, pz - sh.z) < 1.7) {
      return {
        label: 'Entrar na casa coberta de neve',
        action: () => {
          g.audio.play('wind', { gain: 0.4, rate: 1.3 });
          g.enterLevel('9.5', 'door', 0.6);
        },
      };
    }
    const d = this.door;
    if (Math.hypot(px - d.x, pz - d.z) < 1.6) {
      const num = this.goalInfo.number;
      if (!g.objectiveDone('mail')) {
        return {
          label: 'Porta trancada',
          action: () => g.hud.message('Trancada. Lá dentro, uma TV chia. Primeiro descubra o endereço.', 4),
        };
      }
      if (!g.objectiveDone('batteries')) {
        return {
          label: 'Porta trancada',
          action: () => g.hud.message(`Ainda trancada. Vai estar escuro lá dentro: junte as pilhas (${Math.min(3, this.bat)}/3).`, 4),
        };
      }
      return {
        label: `Entrar na casa nº ${num}`,
        action: () => {
          g.completeObjective('house', 'A porta se abre sozinha. A TV chia na sala escura.');
          g.reachExit('door', 0.8);
        },
      };
    }
    return null;
  }

  openMail() {
    const g = this.game;
    const { number, name } = this.goalInfo;
    this.flag.down = true;
    g.audio.paper();
    g.setObjectiveText('house', `Entre na casa nº ${number} (${name})`);
    g.inventory.add('envelope', 1, { text: `${name}, ${number}. Entre antes que eles ouçam você.` });
    g.completeObjective('mail', `Um envelope úmido, escrito à mão: “${name}, ${number}”.`);
  }

  navTarget() {
    const g = this.game;
    if (!g.objectiveDone('mail')) return { x: this.mail.x, z: this.mail.z };
    if (!g.objectiveDone('batteries')) {
      const p = g.player.pos;
      let best = null;
      let bd = 1e9;
      for (const it of g.items.list) {
        if (it.type !== 'battery' || it.used || it.dead) continue;
        const d = Math.hypot(it.x - p.x, it.z - p.z);
        if (d < bd) {
          bd = d;
          best = it;
        }
      }
      return best ? { x: best.x, z: best.z } : null;
    }
    return { x: this.door.x, z: this.door.z };
  }

  exitEmitter() {
    return { x: this.door.cx, y: FLOOR + 1.2, z: this.door.cz, sound: 'tvstatic', gain: 0.55 };
  }

  // Os itens (pilhas, bilhetes) ganham materiais próprios em Items.spawn: libera junto com o bloco.
  disposeChunk(ch) {
    for (const it of ch.items) if (it.mesh) it.mesh.traverse((o) => o.material && o.material.dispose());
    super.disposeChunk(ch);
  }

  dispose() {
    super.dispose();
    this.scene.remove(this.snowPts);
    this.snowPts.geometry.dispose();
    this.snowPts.material.dispose();
    this.snowTex.dispose();
    // bloco interrompido no meio da montagem das malhas (ainda não registrado)
    if (this._bch) for (const m of this._bch.meshes) m.geometry.dispose();
    this._bch = null;
    this.building = null;
    this.hounds.dispose();
    this.ground.geometry.dispose();
    this.groundMat.dispose();
    this.scene.remove(this.sky);
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    for (const k in this.mats) (this.mats[k].mat || this.mats[k]).dispose();
    this.atlas.tex.dispose();
    this.flag.mat.dispose();
    for (const g of this.flag.geos) g.dispose();
  }
}
