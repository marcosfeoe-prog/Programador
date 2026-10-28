// Nível 62, seção 2 — o salão de baile do hotel. Teto alto em caixotões,
// lustres enormes, papel de parede vermelho com ouro, espelhos altos entre
// pilastras, mesas redondas postas para um jantar que nunca começou, uma pista
// de parquete e um palco com cortina de veludo. Um piano toca sozinho.
import * as THREE from 'three';
import { HotelLevel, Props, damaskTex, carpetTex, parquetTex } from './level62_kit.js';
import { GeoBuilder } from '../materials.js';
import { clamp, angleDiff, TAU } from '../util.js';

const BX = 14;
const BZ = -26;
const H = 7.5;
const STAGE = { x0: -8, x1: 8, z0: -24, z1: -20, h: 0.75 };
const GAP = { x0: 6, x1: 7.2 };
const TABLES = [
  [-10, -4],
  [-10, -10],
  [-10, -16],
  [10, -4],
  [10, -10],
  [10, -16],
  [-5.8, -4],
  [5.8, -4],
  [-5.8, -13],
  [5.8, -13],
];
// melodia lenta e um pouco desafinada (semitons)
const TUNE = [0, 4, 7, 12, 11, 7, 4, 5, 9, 12, 16, 14, 12, 9, 7, 4, 2, 5, 9, 11, 7, 4, 0, -1];

export class Level62Ball extends HotelLevel {
  constructor(game) {
    super(game, {
      bounds: [-15, -27, 15, 7],
      look: {
        exposure: 0.95,
        tint: [1.06, 0.97, 0.88],
        sat: 1.0,
        contrast: 1.1,
        lift: [0.012, 0.006, 0.004],
        bloom: 0.5,
        bloomThreshold: 0.8,
        fog: [0.07, 0.04, 0.03],
        lightColor: [1, 1, 1],
        flashlight: false,
        ambience: 'level62_2',
        reverb: 3.2,
        sanityDrain: 0.04,
      },
      fog: 0.025,
      hemi: 0.4,
      envCols: ['#a85a3a', '#5a2a1a', '#200c08'],
    });
    this.objectives = [
      { id: 'palco', text: 'Suba ao palco' },
      { id: 'bastidores', text: 'Encontre a saída pelos bastidores' },
    ];
    this.spawn = { x: 0, z: 5, yaw: 0 };
    this.exit = { x: -6, z: -25.2 };
    this.noteI = 0;
    this.noteT = 4;
    this.piano = true;
  }

  async preload(px, pz, progress) {
    const M = this.materials();
    const S = Math.min(1024, this.Q.tex);
    M.wall.damask2 = this.mat(new THREE.MeshStandardMaterial({ map: this.tex(damaskTex(Math.min(512, S), '#5a1416', 'rgba(232,180,96,0.32)', 'rgba(10,0,0,0.25)')), vertexColors: true, roughness: 0.6, envMap: this.env, envMapIntensity: 0.2 }));
    const cp = this.tex(carpetTex(Math.min(512, S)));
    M.floor.carpet = this.mat(new THREE.MeshStandardMaterial({ map: cp, roughness: 0.95 }));
    M.floor.parquet = this.mat(new THREE.MeshStandardMaterial({ map: this.tex(parquetTex(Math.min(512, S))), roughness: 0.22, envMap: this.env, envMapIntensity: 0.7 }));
    progress(0.3);
    this.buildWorld();
    progress(0.8);
    this.updateLights({ x: px, z: pz }, true);
    progress(1);
  }

  buildWorld() {
    const P = this.plan;
    const props = new Props(this);
    const gold = [0.86, 0.66, 0.34];
    const vest = P.zone({ H: 3.2, ceil: [0.95, 0.9, 0.82] });
    const hall = P.zone({ H, floor: 'carpet', paper: 'damask2', trimColor: gold, panelColor: [0.32, 0.14, 0.1], wainH: 1.1, ceil: [0.9, 0.78, 0.6], floorUV: 1.6 });
    const dance = P.zone({ H, floor: 'parquet', paper: 'damask2', trimColor: gold, panelColor: [0.32, 0.14, 0.1], wainH: 1.1, ceil: [0.9, 0.78, 0.6], floorUV: 2 });
    P.rect(-1.5, 0, 1.5, 6, vest);
    P.rect(-BX, BZ, BX, 0, hall);
    P.rect(-4, -17, 4, -7, dance);
    // a porta por onde você entrou (não abre mais)
    props.door(0, 6, 0, -1, null);
    for (const z of [1.5, 4.5]) {
      props.sconce(-1.5, z, 1, 0, 1.9);
      props.sconce(1.5, z, -1, 0, 1.9);
    }
    // pilastras, espelhos e arandelas nas paredes laterais
    for (const s of [-1, 1]) {
      const wx = s * BX;
      for (let z = -2; z >= -24; z -= 4.4) {
        const o = { x: wx, z, rot: s > 0 ? -Math.PI / 2 : Math.PI / 2 };
        props.box('wood', o, 0, H / 2 - 0.1, 0.1, 0.6, H - 0.2, 0.2, gold);
        props.box('wood', o, 0, 0.6, 0.15, 0.75, 1.2, 0.3, [0.7, 0.52, 0.26]);
        props.box('wood', o, 0, H - 0.6, 0.16, 0.8, 0.5, 0.32, [0.95, 0.74, 0.4]);
        const mz = z - 2.2;
        if (mz > BZ + 1.5) {
          const m = { x: wx, z: mz, rot: o.rot };
          props.box('brass', m, 0, 3.4, 0.03, 1.9, 4.1, 0.06, [0.95, 0.76, 0.4]);
          props.box('mirror', m, 0, 3.4, 0.065, 1.7, 3.9, 0.01, [0.55, 0.52, 0.5]);
          props.cyl('brass', m, 0, 5.4, 0.03, 0.95, 0.05, [0.95, 0.76, 0.4], { axis: 'x', sides: 24 });
          P.hole('z', wx, mz - 1.1, mz + 1.1);
          props.sconce(wx, mz - 1.4, -s, 0, 2.4);
          props.sconce(wx, mz + 1.4, -s, 0, 2.4);
        }
      }
    }
    // parede da entrada: dois painéis de veludo e arandelas
    for (const x of [-8, -4, 4, 8]) props.sconce(x, 0, 0, -1, 2.6);
    // mesas redondas postas
    this.chairs = [];
    const linen = [0.97, 0.95, 0.9];
    for (const [tx, tz] of TABLES) {
      const o = { x: tx, z: tz, rot: 0 };
      props.cyl('cloth', o, 0, 0.385, 0, 0.98, 0.77, linen, { sides: 28, r2: 0.92 });
      props.cyl('cloth', o, 0, 0.775, 0, 0.92, 0.01, linen, { sides: 28 });
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU + 0.26;
        const px = Math.cos(a) * 0.68;
        const pz = Math.sin(a) * 0.68;
        props.cyl('cloth', o, px, 0.79, pz, 0.13, 0.015, [1, 1, 1], { sides: 16 });
        props.cyl('glow', o, Math.cos(a + 0.35) * 0.7, 0.86, Math.sin(a + 0.35) * 0.7, 0.03, 0.14, [1.1, 1.1, 1.15], { sides: 8, r2: 0.012 });
        this.chairs.push({ tx, tz, a, yaw0: Math.atan2(-Math.cos(a), -Math.sin(a)), yaw: Math.atan2(-Math.cos(a), -Math.sin(a)) });
      }
      // centro: candelabro e flores
      props.cyl('brass', o, 0, 0.95, 0, 0.03, 0.35, [0.95, 0.78, 0.42]);
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * TAU;
        props.cyl('glow', o, Math.cos(a) * 0.12, 1.2, Math.sin(a) * 0.12, 0.015, 0.14, [2.6, 2.0, 1.2], { sides: 6 });
      }
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU;
        props.cyl('paint', o, Math.cos(a) * 0.14, 0.86, Math.sin(a) * 0.14, 0.06, 0.08, k % 2 ? [0.7, 0.08, 0.1] : [0.95, 0.92, 0.88]);
      }
      this.addLamp(tx, 1.4, tz, 0xffb060, 1.6, 4, 0.5);
      this.circles.push([tx, tz, 1.0]);
    }
    this.makeChairs();
    // lustres
    props.chandelier(0, H, -12, 2.3, 12);
    for (const [x, z] of [
      [-7, -6],
      [7, -6],
      [-7, -17],
      [7, -17],
    ])
      props.chandelier(x, H, z, 1.7, 8);
    // teto em caixotões dourados
    const co = { x: 0, z: BZ / 2, rot: 0 };
    for (let x = -BX + 3.5; x < BX; x += 3.5) props.box('wood', co, x, H - 0.25, 0, 0.35, 0.5, -BZ, [0.8, 0.62, 0.32]);
    for (let z = -3.25; z > BZ; z -= 3.25) props.box('wood', { x: 0, z, rot: 0 }, 0, H - 0.25, 0, BX * 2, 0.5, 0.35, [0.8, 0.62, 0.32]);
    this.buildStage(props);
    this.finishBuild(props);
  }

  makeChairs() {
    const gb = new GeoBuilder();
    const gold = [0.88, 0.68, 0.34];
    const red = [0.5, 0.06, 0.08];
    gb.box(0, 0.47, 0, 0.46, 0.06, 0.46, gold, null, { ao: 0 });
    gb.box(0, 0.51, 0.02, 0.42, 0.04, 0.4, red, null, { ao: 0 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box(sx * 0.2, 0.22, sz * 0.2, 0.035, 0.46, 0.035, gold, null, { ao: 0.3, floorY: 0 });
    gb.box(0, 0.86, -0.21, 0.44, 0.72, 0.04, gold, null, { ao: 0 });
    gb.box(0, 0.86, -0.185, 0.34, 0.56, 0.02, red, null, { ao: 0 });
    const geo = gb.build();
    this.geos.push(geo);
    this.chairMesh = new THREE.InstancedMesh(geo, this.M.wood, this.chairs.length);
    this.chairMesh.frustumCulled = false;
    this.scene.add(this.chairMesh);
    this.meshes.push(this.chairMesh);
    this.placeChairs();
  }

  placeChairs() {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3(1, 1, 1);
    this.chairs.forEach((c, i) => {
      v.set(c.tx + Math.cos(c.a) * 1.3, 0, c.tz + Math.sin(c.a) * 1.3);
      m.compose(v, q.setFromEuler(e.set(0, c.yaw, 0)), s);
      this.chairMesh.setMatrixAt(i, m);
    });
    this.chairMesh.instanceMatrix.needsUpdate = true;
  }

  buildStage(props) {
    const S = STAGE;
    const o = { x: 0, z: 0, rot: 0 };
    const wood = [0.36, 0.2, 0.12];
    const velvet = [0.42, 0.03, 0.05];
    const gold = [0.9, 0.7, 0.36];
    const cz = (S.z0 + S.z1) / 2;
    props.box('wood', o, 0, S.h / 2, cz, S.x1 - S.x0, S.h, S.z1 - S.z0, wood, 0.3);
    props.box('wood', o, 0, S.h + 0.005, cz, S.x1 - S.x0, 0.01, S.z1 - S.z0, [0.48, 0.3, 0.18]);
    props.box('fabric', o, 0, S.h / 2, S.z1 + 0.03, S.x1 - S.x0 - 3, S.h, 0.04, velvet);
    // escadinhas nos dois cantos da frente
    for (const sx of [-1, 1])
      for (let k = 0; k < 3; k++) {
        const h = (k + 1) * 0.25;
        props.box('wood', { x: sx * 7.25, z: S.z1 + 1.25 - k * 0.5, rot: 0 }, 0, h / 2, 0, 1.5, h, 0.5, [0.44, 0.27, 0.16], 0.3);
      }
    // atrás da cortina, degraus para descer aos bastidores
    for (let k = 0; k < 3; k++) {
      const h = S.h - (k + 1) * 0.25;
      if (h > 0) props.box('wood', { x: (GAP.x0 + GAP.x1) / 2, z: S.z0 - 0.25 - k * 0.5, rot: 0 }, 0, h / 2, 0, GAP.x1 - GAP.x0, h, 0.5, [0.3, 0.18, 0.1]);
    }
    // arco do proscênio
    for (const sx of [-1, 1]) props.box('wood', { x: sx * 8.6, z: S.z1, rot: 0 }, 0, H / 2, 0, 0.7, H, 0.7, gold);
    props.box('wood', { x: 0, z: S.z1, rot: 0 }, 0, H - 0.9, 0, 17.9, 1.8, 0.6, gold);
    props.box('fabric', { x: 0, z: S.z1 - 0.4, rot: 0 }, 0, H - 1.5, 0, 16.4, 1.0, 0.12, velvet);
    // cortina com dobras (aberta só num ponto, à direita)
    this.curtain = [];
    for (let x = S.x0 + 0.25; x < S.x1; x += 0.5) {
      if (x > GAP.x0 && x < GAP.x1) continue;
      const k = Math.round((x - S.x0) / 0.5);
      props.box('fabric', { x, z: S.z0 + 0.1 + (k % 2) * 0.12, rot: 0 }, 0, S.h + (H - 1.8 - S.h) / 2, 0, 0.52, H - 1.8 - S.h, 0.14, k % 2 ? velvet : [0.36, 0.02, 0.04]);
    }
    // a ponta da cortina presa de lado (onde dá para passar)
    props.box('fabric', { x: GAP.x1 + 0.15, z: S.z0 + 0.25, rot: 0.25 }, 0, S.h + 2.3, 0, 0.5, 4.2, 0.3, velvet);
    props.box('brass', { x: GAP.x1 + 0.15, z: S.z0 + 0.3, rot: 0 }, 0, S.h + 1.4, 0, 0.5, 0.06, 0.32, gold);
    this.colliders.push([S.x0, GAP.x0, S.z0 - 0.05, S.z0 + 0.25], [GAP.x1, S.x1, S.z0 - 0.05, S.z0 + 0.25]);
    // bordas do palco: frente (entre as escadas) e laterais
    this.colliders.push([-6.5, 6.5, S.z1 - 0.05, S.z1 + 0.1]);
    this.colliders.push([-8.95, -8.25, S.z0, S.z1 + 0.35], [8.25, 8.95, S.z0, S.z1 + 0.35]);
    // piano de cauda no palco
    const pn = { x: -4.6, z: -22.3, rot: 0.5 };
    const black = [0.02, 0.02, 0.025];
    const y0 = S.h;
    props.box('dark', pn, 0, y0 + 0.75, 0, 1.5, 0.32, 1.1, black);
    props.box('dark', pn, 0.15, y0 + 0.75, -0.75, 1.2, 0.32, 0.5, black);
    props.cyl('dark', pn, 0.55, y0 + 0.75, -0.95, 0.35, 0.32, black, { sides: 16 });
    for (const [lx, lz] of [
      [-0.6, 0.4],
      [0.6, 0.4],
      [0.3, -1.0],
    ])
      props.cyl('dark', pn, lx, y0 + 0.3, lz, 0.05, 0.6, black, { sides: 8 });
    props.box('cloth', pn, 0, y0 + 0.86, 0.5, 1.2, 0.03, 0.14, [0.96, 0.95, 0.92]);
    for (let k = 0; k < 20; k++) props.box('dark', pn, -0.57 + k * 0.06, y0 + 0.885, 0.47, 0.025, 0.02, 0.08, black);
    props.box('dark', { x: -4.6 + Math.sin(0.5) * -0.2, z: -22.3 - 0.2, rot: 0.5 }, 0, y0 + 1.25, 0, 1.4, 0.03, 1.4, black);
    props.box('dark', pn, 0, y0 + 0.5, 1.0, 0.8, 0.06, 0.35, [0.1, 0.05, 0.04]);
    this.solidRect({ x: -4.6, z: -22.6, rot: 0.5 }, 1.6, 1.9);
    this.pianoPos = { x: -4.6, z: -22.3 };
    // refletores do palco
    for (const x of [-5, 0, 5]) {
      props.cyl('dark', { x, z: S.z1 - 0.6, rot: 0 }, 0, H - 2.15, 0, 0.12, 0.25, [0.1, 0.1, 0.1]);
      props.cyl('glow', { x, z: S.z1 - 0.6, rot: 0 }, 0, H - 2.3, 0, 0.1, 0.02, [2.4, 2.2, 1.8]);
      this.addLamp(x, H - 3, S.z1 - 1, 0xfff0d0, 5, 9, 0.8);
    }
    // bastidores: porta de serviço e uma lâmpada nua
    const bd = props.door(-6, BZ, 0, 1, null, { color: [0.4, 0.4, 0.38], trim: [0.3, 0.3, 0.3] });
    props.box('glow', { x: bd.x, z: BZ, rot: 0 }, 0, 2.7, 0.06, 0.5, 0.14, 0.02, [0.2, 2.0, 0.5]);
    props.cyl('glow', { x: 0, z: BZ + 1, rot: 0 }, 0, 3.5, 0, 0.05, 0.12, [2.4, 2.0, 1.4]);
    this.addLamp(0, 3.3, BZ + 1, 0xffc880, 2.2, 7, 0.4);
    this.addLamp(-6, 2.6, BZ + 0.8, 0x60ff90, 1.0, 3, 0);
  }

  // ------------------------------------------------------------ quadro
  update(dt, player) {
    const g = this.game;
    const p = player.pos;
    this.time += dt;
    const t = this.time;
    this.updateLights(p);
    // o piano toca sozinho
    if (this.piano) {
      this.noteT -= dt;
      if (this.noteT <= 0) {
        const semi = TUNE[this.noteI % TUNE.length] + (Math.random() < 0.08 ? 1 : 0);
        this.noteI++;
        this.noteT = this.noteI % 8 === 0 ? 1.4 : 0.55;
        const d = Math.hypot(p.x - this.pianoPos.x, p.z - this.pianoPos.z);
        const gain = clamp(0.5 - d / 60, 0.08, 0.5);
        g.audio.play('ding', { gain, rate: 0.5 * Math.pow(2, semi / 12), wet: 1.6, pan: clamp((this.pianoPos.x - p.x) / 15, -0.8, 0.8) });
        if (this.noteI % 3 === 0) g.audio.play('ding', { gain: gain * 0.6, rate: 0.25 * Math.pow(2, (semi - 12) / 12), wet: 1.8 });
      }
    }
    // as cadeiras viram para você quando você não está olhando
    if (t > 25 && this.piano) {
      const fx = -Math.sin(player.yaw);
      const fz = -Math.cos(player.yaw);
      let turned = 0;
      let moved = false;
      for (const c of this.chairs) {
        const cx = c.tx + Math.cos(c.a) * 1.3;
        const cz = c.tz + Math.sin(c.a) * 1.3;
        const dx = cx - p.x;
        const dz = cz - p.z;
        const d = Math.hypot(dx, dz);
        const seen = (dx * fx + dz * fz) / Math.max(d, 0.01) > 0.15;
        const want = Math.atan2(p.x - cx, p.z - cz);
        if (!seen && d > 4 && Math.random() < dt * 0.4) {
          c.yaw = want;
          moved = true;
        }
        if (Math.abs(angleDiff(want, c.yaw)) < 0.5) turned++;
      }
      if (moved) this.placeChairs();
      if (turned > this.chairs.length * 0.45 && !this.toldChairs) {
        this.toldChairs = true;
        g.hud.message('As cadeiras… quase todas estão viradas para você agora.', 5);
        g.audio.play('creak', { gain: 0.3, rate: 0.7, wet: 1.4 });
      }
    }
    // subir ao palco
    const onStage = p.x > STAGE.x0 && p.x < STAGE.x1 && p.z > STAGE.z0 && p.z < STAGE.z1;
    if (onStage && !g.objectiveDone('palco')) {
      this.piano = false;
      this.flickT = 2.2;
      g.completeObjective('palco', 'O piano para no meio de uma nota. Silêncio. E então, de lugar nenhum: aplausos.');
      for (let k = 0; k < 40; k++) g.audio.play('knock', { gain: 0.04 + Math.random() * 0.05, rate: 1.6 + Math.random() * 0.8, wet: 2, pan: Math.random() * 2 - 1, when: 0.6 + Math.random() * 2.5 });
      for (const c of this.chairs) c.yaw = Math.atan2(STAGE.x0 + 8 - (c.tx + Math.cos(c.a) * 1.3), STAGE.z1 - (c.tz + Math.sin(c.a) * 1.3));
      this.placeChairs();
      setTimeout(() => g.level === this && this.say('stage', ['Quem tá aplaudindo? Não tem ninguém aqui.', 'Tem uma fresta na cortina… ali, na direita.']), 3500);
    }
    let pw = 1;
    if (this.flickT > 0) {
      this.flickT -= dt;
      pw = Math.sin(t * 40) > 0 ? 0.15 : 1;
    }
    this.lightPower(pw);
    if (t > 3 && !this.toldStart) {
      this.toldStart = true;
      g.hud.message('Um salão de baile. As mesas estão postas, as velas acesas. Ninguém. E um piano tocando sozinho no palco.', 6);
    }
    if (p.z < STAGE.z0 - 0.3 && !this.toldBack) {
      this.toldBack = true;
      g.hud.message('Bastidores. Cheiro de poeira e de veludo velho. Uma porta com a luz verde acima.', 4);
    }
  }

  groundY(x, z) {
    const S = STAGE;
    if (x > S.x0 && x < S.x1 && z > S.z0 && z < S.z1) return S.h;
    // escadas da frente
    if (Math.abs(x) > 6.5 && Math.abs(x) < 8 && z >= S.z1 && z < S.z1 + 1.5) return S.h * clamp((S.z1 + 1.5 - z) / 1.5, 0, 1);
    // degraus atrás da cortina
    if (x > GAP.x0 && x < GAP.x1 && z <= S.z0 && z > S.z0 - 1.5) return S.h * clamp((z - (S.z0 - 1.5)) / 1.5, 0, 1);
    return 0;
  }

  surfaceAt(x, z) {
    if (this.groundY(x, z) > 0.1) return 'wood';
    return super.surfaceAt(x, z);
  }

  interactable(player) {
    const g = this.game;
    const p = player.pos;
    if (Math.hypot(p.x, p.z - 5.5) < 1.0) return { label: 'Abrir a porta', action: () => g.hud.message('A maçaneta gira, mas a porta não se move. Como se do outro lado não houvesse mais nada.', 3.5) };
    if (Math.hypot(p.x - this.pianoPos.x, p.z - this.pianoPos.z) < 1.8 && p.y > 0.5)
      return { label: 'Tocar uma tecla', action: () => g.audio.play('ding', { gain: 0.4, rate: 0.5 * Math.pow(2, (Math.floor(Math.random() * 12) - 6) / 12), wet: 1.6 }) };
    if (Math.abs(p.x - this.exit.x) < 0.9 && p.z < BZ + 1.6)
      return {
        label: 'Abrir a porta de serviço',
        action: () => {
          g.completeObjective('bastidores', 'Um corredor estreito de serviço… e outra porta, dupla, de madeira escura.');
          g.enterLevel('62.3', 'door', 0.8);
        },
      };
    return null;
  }

  navTarget() {
    return this.game.objectiveDone('palco') ? (this.game.player.pos.z > STAGE.z0 ? { x: 6.6, z: STAGE.z0 + 0.4 } : this.exit) : { x: 7.25, z: -19 };
  }

  exitEmitter() {
    return { x: this.pianoPos.x, y: 1.5, z: this.pianoPos.z, sound: 'hum', gain: 0.03 };
  }
}
