// Nível 62 — "Hotel Luxuoso" (Classe 1), seção 1: o saguão e o corredor do
// 12º andar. Mármore polido, papel de parede adamascado, lambri creme,
// arandelas com cúpula e um teto em caixotões com luz de sanca. O corredor
// é longo demais: os números dos quartos se repetem.
import * as THREE from 'three';
import { HotelLevel, Props, plaqueAtlas, coveTex } from './level62_kit.js';
import { GeoBuilder } from '../materials.js';

const CW = 1.5; // meia largura do corredor (múltiplo da grade de 0,5 m)
const PERIOD = 24;
const END = -98;
const LOOP_AT = -66;
const TARGET = 1213;

export class Level62 extends HotelLevel {
  constructor(game) {
    super(game, {
      bounds: [-8, -100, 8, 13],
      look: {
        exposure: 1.0,
        tint: [1.05, 1.0, 0.92],
        sat: 0.95,
        contrast: 1.06,
        lift: [0.012, 0.01, 0.006],
        bloom: 0.4,
        bloomThreshold: 0.85,
        fog: [0.12, 0.09, 0.06],
        lightColor: [1, 1, 1],
        flashlight: false,
        ambience: 'level62',
        reverb: 1.6,
        sanityDrain: 0.03,
      },
      fog: 0.045,
      hemi: 0.55,
    });
    this.objectives = [
      { id: 'campainha', text: 'Toque a campainha da recepção' },
      { id: 'cartao', text: 'Pegue o cartão do quarto' },
      { id: 'quarto', text: `Encontre o quarto ${TARGET}` },
    ];
    this.spawn = { x: 0, z: 10.2, yaw: 0 };
    this.exit = { x: -CW + 0.8, z: -21 };
    this.loops = 0;
  }

  async preload(px, pz, progress) {
    this.materials();
    progress(0.3);
    this.buildWorld();
    progress(0.8);
    this.updateLights({ x: px, z: pz }, true);
    progress(1);
  }

  buildWorld() {
    const P = this.plan;
    const props = new Props(this);
    this.props = props;
    const lobby = P.zone({ H: 4.6, ceil: [0.96, 0.92, 0.84] });
    const corr = P.zone({ H: 3.3, ceil: [0.98, 0.94, 0.86] });
    const nook = P.zone({ H: 3.0, ceil: [0.96, 0.92, 0.84] });
    P.rect(-7, 0, 7, 12, lobby);
    P.rect(-CW, END, CW, 0, corr);
    for (let m = 0; m < 4; m++) {
      const c = -13.5 - m * PERIOD;
      P.rect(CW, c - 2, CW + 2, c + 2, nook);
    }
    // placas de número (atlas 1201–1216)
    const labels = [];
    for (let n = 1201; n <= 1216; n++) labels.push(n);
    const atlas = plaqueAtlas(labels);
    this.tex(atlas.tex);
    this.M.plaque = this.mat(new THREE.MeshStandardMaterial({ map: atlas.tex, roughness: 0.3, metalness: 0.6, envMap: this.env, envMapIntensity: 1.2 }));
    // portas e arandelas do corredor
    this.doors = [];
    for (let k = 0; k * 3 + 3 <= -END - 1; k++) {
      const z = -3 - k * 3;
      const kk = k % 8;
      const nl = 1201 + kk * 2;
      props.door(-CW, z, 1, 0, atlas.uv(nl - 1201));
      this.doors.push({ x: -CW, z, n: nl, nx: 1 });
      if (kk !== 3 && kk !== 4) {
        const nr = 1202 + kk * 2;
        props.door(CW, z, -1, 0, atlas.uv(nr - 1201));
        this.doors.push({ x: CW, z, n: nr, nx: -1 });
      }
      props.sconce(-CW, z - 1.5, 1, 0);
      if (kk !== 3) props.sconce(CW, z - 1.5, -1, 0);
    }
    this.corridorCeiling();
    // recantos com sofá (um por período)
    for (let m = 0; m < 4; m++) {
      const c = -13.5 - m * PERIOD;
      props.sofa(CW + 1.45, c, -Math.PI / 2, [0.42, 0.3, 0.2], 2.2);
      for (const s of [-1, 1]) {
        const o = { x: CW + 1.6, z: c + s * 1.55, rot: 0 };
        props.box('wood', o, 0, 0.3, 0, 0.45, 0.6, 0.45, [0.5, 0.34, 0.2], 0.3);
        props.cyl('brass', o, 0, 0.75, 0, 0.06, 0.3, [0.9, 0.72, 0.38]);
        props.cyl('glow', o, 0, 1.0, 0, 0.18, 0.22, [2.0, 1.7, 1.2], { r2: 0.12, caps: false });
        this.addLamp(o.x, 1.0, o.z, 0xffc880, 2.2, 4.5, 0.6);
        this.colliders.push([o.x - 0.25, o.x + 0.25, o.z - 0.25, o.z + 0.25]);
      }
      props.painting(CW + 2, 1.95, c, -1, 0, 1.6, 0.9, [[0.3, 0.36, 0.3], [0.5, 0.42, 0.3], [0.2, 0.24, 0.3], [0.62, 0.55, 0.42]]);
      this.plan.hole('z', CW + 2, c - 1.2, c + 1.2);
    }
    // fim do corredor: um vão escuro com a placa de saída
    const e = { x: 0, z: END, rot: 0 };
    props.box('dark', e, 0, 1.15, 0.03, 1.4, 2.3, 0.04, [0.02, 0.02, 0.02]);
    props.box('wood', e, -0.76, 1.2, 0.05, 0.12, 2.4, 0.1, [0.86, 0.78, 0.62]);
    props.box('wood', e, 0.76, 1.2, 0.05, 0.12, 2.4, 0.1, [0.86, 0.78, 0.62]);
    props.box('wood', e, 0, 2.45, 0.05, 1.64, 0.12, 0.1, [0.86, 0.78, 0.62]);
    props.box('glow', e, 0, 2.72, 0.06, 0.42, 0.16, 0.04, [0.2, 2.2, 0.6]);
    this.plan.hole('x', END, -0.9, 0.9);
    this.buildLobby(props, atlas);
    this.finishBuild(props);
  }

  // Caixotões do corredor: sancas laterais, vigas a cada 3 m e luz de sanca.
  corridorCeiling() {
    const props = this.props;
    const H = 3.3;
    const cream = [0.95, 0.92, 0.86];
    const o = { x: 0, z: 0, rot: 0 };
    const len = -END;
    for (const s of [-1, 1]) props.box('paint', o, s * (CW - 0.22), H - 0.19, END / 2, 0.44, 0.38, len, cream);
    const cove = new GeoBuilder();
    const W1 = [1, 0.82, 0.6];
    for (let z = -1.5; z > END; z -= 3) {
      props.box('paint', o, 0, H - 0.16, z, 2 * CW - 0.4, 0.32, 0.3, cream);
      // pequena luz embutida no centro de cada caixotão
      const zc = z - 1.5;
      if (zc > END + 0.5) {
        props.cyl('glow', o, 0, H - 0.01, zc, 0.07, 0.02, [2.4, 2.2, 1.9]);
        this.addLamp(0, H - 0.3, zc, 0xffe2b8, 3.2, 6.5, 0);
        const y = H - 0.012;
        const hx = CW - 0.45;
        const hz = 1.32;
        cove.quad(
          [
            [hx, y, zc + hz],
            [-hx, y, zc + hz],
            [-hx, y, zc - hz],
            [hx, y, zc - hz],
          ],
          [0, -1, 0],
          [1, 1, 0, 1, 0, 0, 1, 0],
          null,
          [W1, W1, W1, W1],
        );
      }
    }
    this.coveMat = this.mat(new THREE.MeshBasicMaterial({ map: this.tex(coveTex()), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85 }));
    const m = new THREE.Mesh(cove.build(), this.coveMat);
    m.renderOrder = 3;
    this.geos.push(m.geometry);
    this.scene.add(m);
    this.meshes.push(m);
  }

  buildLobby(props) {
    const P = this.plan;
    // balcão da recepção (frente para -x)
    const d = { x: 4.6, z: 5.5, rot: -Math.PI / 2 };
    props.box('wood', d, 0, 0.55, 0, 5.0, 1.1, 0.7, [0.46, 0.3, 0.18], 0.4);
    for (let k = -2; k <= 2; k++) props.box('wood', d, k * 0.96, 0.55, 0.36, 0.8, 0.82, 0.02, [0.54, 0.36, 0.22]);
    props.box('stone', d, 0, 1.12, 0.06, 5.2, 0.05, 0.86, [1, 0.98, 0.95]);
    props.box('brass', d, 0, 0.06, 0.37, 5.0, 0.12, 0.02, [0.9, 0.72, 0.38]);
    this.colliders.push([4.2, 5.0, 3.0, 8.0]);
    // campainha
    props.cyl('brass', { x: 4.35, z: 5.5, rot: 0 }, 0, 1.17, 0, 0.07, 0.04, [0.95, 0.8, 0.45], { r2: 0.05 });
    props.cyl('brass', { x: 4.35, z: 5.5, rot: 0 }, 0, 1.21, 0, 0.012, 0.04, [0.95, 0.8, 0.45]);
    this.bell = { x: 3.75, z: 5.5 };
    // um livro de registro aberto e um abajur de mesa
    props.box('cloth', { x: 4.4, z: 4.2, rot: 0.2 }, 0, 1.16, 0, 0.42, 0.03, 0.3, [0.95, 0.92, 0.85]);
    props.box('dark', { x: 4.4, z: 4.2, rot: 0.2 }, 0, 1.15, 0, 0.45, 0.02, 0.33, [0.3, 0.06, 0.06]);
    props.cyl('brass', { x: 4.7, z: 7.4, rot: 0 }, 0, 1.3, 0, 0.02, 0.32, [0.9, 0.72, 0.38]);
    props.cyl('glow', { x: 4.7, z: 7.4, rot: 0 }, 0, 1.5, 0, 0.16, 0.16, [2.2, 1.6, 0.6], { r2: 0.1, caps: false });
    this.addLamp(4.4, 1.55, 7.4, 0xffb060, 2.5, 4.5, 0.5);
    // claviculário atrás do balcão
    const kc = { x: 6.97, z: 5.5, rot: -Math.PI / 2 };
    props.box('wood', kc, 0, 1.7, 0.04, 2.4, 1.0, 0.08, [0.4, 0.26, 0.15]);
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 4; j++) {
        props.box('brass', kc, -1.05 + i * 0.3, 1.36 + j * 0.22, 0.1, 0.03, 0.03, 0.06, [0.95, 0.78, 0.42]);
        if ((i * 7 + j * 3) % 5 !== 1) props.box('brass', kc, -1.05 + i * 0.3, 1.3 + j * 0.22, 0.12, 0.04, 0.08, 0.01, [0.8, 0.62, 0.3]);
      }
    P.hole('z', 7, 4.0, 7.0);
    // relógio parado
    const ck = { x: 6.95, z: 9.2, rot: 0 };
    props.cyl('brass', ck, 0, 2.5, 0, 0.32, 0.05, [0.9, 0.72, 0.38], { axis: 'x', sides: 24 });
    props.cyl('cloth', ck, -0.03, 2.5, 0, 0.27, 0.02, [0.95, 0.93, 0.88], { axis: 'x', sides: 24 });
    props.box('dark', ck, -0.05, 2.58, 0, 0.01, 0.17, 0.018, [0.05, 0.05, 0.05]);
    props.box('dark', ck, -0.05, 2.5, 0.09, 0.01, 0.018, 0.2, [0.05, 0.05, 0.05]);
    // elevadores (fora de serviço) na parede da esquerda
    this.elevators = [];
    for (const z of [3.8, 8.2]) {
      const o = { x: -7, z, rot: Math.PI / 2 };
      props.box('wood', o, 0, 1.25, 0.05, 1.7, 2.5, 0.1, [0.86, 0.78, 0.62]);
      props.box('brass', o, -0.31, 1.12, 0.1, 0.6, 2.24, 0.03, [0.88, 0.7, 0.36]);
      props.box('brass', o, 0.31, 1.12, 0.1, 0.6, 2.24, 0.03, [0.88, 0.7, 0.36]);
      props.box('dark', o, 0, 1.12, 0.11, 0.015, 2.24, 0.03, [0.05, 0.04, 0.03]);
      props.box('dark', o, 0, 2.62, 0.1, 0.6, 0.14, 0.03, [0.05, 0.04, 0.03]);
      props.box('glow', o, 0, 2.62, 0.12, 0.2, 0.06, 0.01, [2.2, 0.3, 0.15]);
      props.box('brass', o, 1.05, 1.15, 0.03, 0.12, 0.26, 0.03, [0.9, 0.72, 0.38]);
      props.cyl('glow', o, 1.05, 1.15, 0.05, 0.022, 0.02, [0.6, 0.5, 0.4], { axis: 'z' });
      P.hole('z', -7, z - 1.1, z + 1.1);
      this.elevators.push({ x: -6.3, z });
    }
    // porta de entrada de vidro escuro (fundo do saguão)
    const fe = { x: 0, z: 12, rot: Math.PI };
    for (const s of [-1, 1]) {
      props.box('dark', fe, s * 0.62, 1.3, 0.02, 1.16, 2.6, 0.03, [0.01, 0.012, 0.015]);
      props.box('brass', fe, s * 0.62, 1.3, 0.04, 1.22, 0.06, 0.03, [0.9, 0.72, 0.38]);
      props.box('brass', fe, s * 0.12, 1.3, 0.06, 0.04, 0.5, 0.05, [0.9, 0.72, 0.38]);
      props.box('brass', fe, s * 1.22, 1.32, 0.04, 0.06, 2.64, 0.06, [0.9, 0.72, 0.38]);
    }
    props.box('brass', fe, 0, 2.64, 0.04, 2.5, 0.08, 0.06, [0.9, 0.72, 0.38]);
    P.hole('x', 12, -1.4, 1.4);
    this.frontDoor = { x: 0, z: 11.4 };
    // estar: sofás, mesa de centro, poltronas, tapete
    props.rug(-3.4, 6, 4.6, 3.8, 0, 'paint', [0.36, 0.1, 0.1]);
    props.sofa(-3.4, 3.7, 0, [0.42, 0.28, 0.2], 2.4);
    props.sofa(-3.4, 8.3, Math.PI, [0.42, 0.28, 0.2], 2.4);
    props.coffeeTable(-3.4, 6, 0, 1.3, 0.7);
    props.armchair(-0.9, 6, -Math.PI / 2, [0.5, 0.36, 0.22]);
    // vaso de flores na mesa
    props.cyl('stone', { x: -3.4, z: 6, rot: 0 }, 0, 0.56, 0, 0.08, 0.24, [1, 1, 1], { r2: 0.06 });
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * 6.283;
      props.cyl('paint', { x: -3.4 + Math.cos(a) * 0.08, z: 6 + Math.sin(a) * 0.08, rot: 0 }, 0, 0.82, 0, 0.05, 0.08, [0.85, 0.82, 0.78]);
    }
    for (const [x, z] of [
      [-6.3, 0.7],
      [-6.3, 11.3],
      [6.3, 11.3],
      [6.3, 0.7],
      [-2.4, 0.7],
      [2.4, 0.7],
    ])
      props.plant(x, z, 1.5);
    // carrinho de malas
    const lc = { x: 2.4, z: 9.6, rot: 0.3 };
    props.box('paint', lc, 0, 0.32, 0, 1.0, 0.04, 0.6, [0.45, 0.08, 0.08]);
    for (const s of [-1, 1]) {
      props.box('brass', lc, s * 0.48, 1.0, 0, 0.04, 1.4, 0.04, [0.95, 0.78, 0.42]);
      props.cyl('dark', lc, s * 0.42, 0.08, 0.25, 0.07, 0.04, [0.05, 0.05, 0.05], { axis: 'x' });
      props.cyl('dark', lc, s * 0.42, 0.08, -0.25, 0.07, 0.04, [0.05, 0.05, 0.05], { axis: 'x' });
    }
    props.box('brass', lc, 0, 1.7, 0, 1.0, 0.04, 0.04, [0.95, 0.78, 0.42]);
    props.box('fabric', lc, -0.15, 0.6, 0, 0.5, 0.52, 0.3, [0.24, 0.18, 0.12]);
    props.box('fabric', lc, 0.25, 0.48, 0.05, 0.36, 0.28, 0.42, [0.5, 0.42, 0.3]);
    this.solidRect(lc, 1.0, 0.65);
    // arandelas do saguão
    for (const z of [2, 6, 10]) props.sconce(-7, z, 1, 0, 2.3);
    for (const z of [1.6, 10]) props.sconce(7, z, -1, 0, 2.3);
    for (const x of [-4.5, 4.5]) props.sconce(x, 12, 0, -1, 2.3);
    for (const x of [-4.5, 4.5]) props.sconce(x, 0, 0, 1, 2.3);
    props.chandelier(0, 4.6, 6, 1.35, 9);
    // caixotões do teto do saguão
    const o = { x: 0, z: 6, rot: 0 };
    for (const x of [-3.5, 0, 3.5]) props.box('paint', o, x, 4.45, 0, 0.3, 0.3, 12, [0.95, 0.92, 0.86]);
    for (const z of [-3, 0, 3]) props.box('paint', o, 0, 4.45, z, 14, 0.3, 0.3, [0.95, 0.92, 0.86]);
  }

  spawnCard() {
    const g = this.game;
    g.items.spawn(
      {
        type: 'x',
        key: '62:cartao',
        x: 4.3,
        z: 4.75,
        y: 1.155,
        label: 'Pegar o cartão do quarto',
        makeMesh: (it, items) => {
          const grp = new THREE.Group();
          const a = items.litMat({ color: 0x1a1a1c, roughness: 0.3 }, 1.2);
          const b = items.litMat({ color: 0xd8b060, roughness: 0.25, metalness: 0.6 }, 1.2);
          this.cardMats = [a, b];
          const body = new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.004, 0.054), a);
          const s = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.005, 0.008), b);
          s.position.z = 0.012;
          grp.add(body, s);
          this.geos.push(body.geometry, s.geometry);
          grp.position.set(it.x, it.y, it.z);
          grp.rotation.y = -0.5;
          grp.scale.setScalar(2);
          return grp;
        },
        onUse: (game) => {
          game.inventory.add('cartao62');
          game.audio.play('beep', { gain: 0.25, rate: 1.3 });
          game.completeObjective('cartao', `Um cartão preto com letras douradas: QUARTO ${TARGET}. Ninguém apareceu para entregar.`);
        },
      },
      this.dynamic,
    );
  }

  // ------------------------------------------------------------ quadro
  update(dt, player) {
    const g = this.game;
    const p = player.pos;
    this.time += dt;
    // o corredor não acaba: depois de um ponto, volta 24 m sem ninguém perceber
    if (p.z < LOOP_AT) {
      p.z += PERIOD;
      this.loops++;
      this.updateLights(p, true);
      if (this.loops === 2) g.hud.message('Você já passou por esse sofá. E por aquele quadro. Os números dos quartos… se repetem.', 5);
      if (this.loops === 4) this.say('loop', ['Eu tô andando em círculo? Não… é sempre reto.', 'Os números. Eu preciso prestar atenção nos números.']);
    }
    this.updateLights(p);
    this.lightPower(1 + Math.sin(this.time * 0.7) * 0.03);
    if (this.time > 3 && !this.toldStart) {
      this.toldStart = true;
      g.hud.message('Um saguão de hotel de luxo. Mármore, lustre de cristal, cheiro de flores. E ninguém no balcão.', 6);
    }
    if (p.z < -2 && !this.toldCorr) {
      this.toldCorr = true;
      this.say('corr', ['Que corredor longo… Dá pra ver uma placa de saída lá no fim.']);
    }
    // às vezes alguém bate de volta
    if (this.knockT > 0 && (this.knockT -= dt) <= 0) {
      g.audio.play('knock', { gain: 0.3, rate: 0.9, wet: 0.8 });
      if (!this.toldKnock) {
        this.toldKnock = true;
        g.hud.message('Alguém bateu de volta. Do lado de dentro.', 4);
      }
    }
  }

  nearDoor(p) {
    for (const d of this.doors) {
      const dx = (p.x - d.x) * d.nx;
      if (dx > 0 && dx < 1.4 && Math.abs(p.z - d.z) < 0.7) return d;
    }
    return null;
  }

  interactable(player) {
    const g = this.game;
    const p = player.pos;
    if (Math.hypot(p.x - this.bell.x, p.z - this.bell.z) < 1.3 && !g.objectiveDone('campainha'))
      return {
        label: 'Tocar a campainha',
        action: () => {
          g.audio.play('ding', { gain: 0.5, rate: 1.6, wet: 1.2 });
          setTimeout(() => g.level === this && g.audio.play('ding', { gain: 0.4, rate: 1.6, wet: 1.4 }), 900);
          g.completeObjective('campainha', 'O som ecoa pelo saguão. Ninguém vem. Mas, quando você olha de novo, há um cartão no balcão.');
          this.spawnCard();
        },
      };
    for (const e of this.elevators) if (Math.hypot(p.x - e.x, p.z - e.z) < 1.3) return { label: 'Chamar o elevador', action: () => (g.audio.play('ding', { gain: 0.3, rate: 0.8 }), g.hud.message('O botão acende e apaga. Lá dentro, nenhum som de motor. FORA DE SERVIÇO.', 3.5)) };
    if (Math.hypot(p.x - this.frontDoor.x, p.z - this.frontDoor.z) < 1.4) return { label: 'Abrir a porta de entrada', action: () => g.hud.message('Trancada. Do outro lado do vidro não há rua — só preto.', 3.5) };
    const d = this.nearDoor(p);
    if (d) {
      if (d.n === TARGET && g.inventory.has('cartao62'))
        return {
          label: `Abrir o quarto ${TARGET}`,
          action: () => {
            g.inventory.remove('cartao62');
            g.audio.play('beep', { gain: 0.3, rate: 1.5 });
            g.completeObjective('quarto', 'Luz verde na fechadura. A porta abre para dentro — e não é um quarto.');
            g.enterLevel('62.2', 'door', 0.8);
          },
        };
      if (d.n === TARGET) return { label: `Quarto ${TARGET} (trancado)`, action: () => (g.audio.play('beep', { gain: 0.25, rate: 0.5 }), g.hud.message('A fechadura eletrônica pisca vermelho. Precisa do cartão.', 3)) };
      return {
        label: `Bater no ${d.n}`,
        action: () => {
          g.audio.play('knock', { gain: 0.35, rate: 1.1, wet: 0.4 });
          if (Math.random() < 0.3) this.knockT = 1.6 + Math.random();
        },
      };
    }
    return null;
  }

  navTarget() {
    const g = this.game;
    if (!g.objectiveDone('campainha')) return this.bell;
    if (!g.objectiveDone('cartao')) return { x: 4.3, z: 4.75 };
    // a porta 1213 mais próxima à frente
    const p = g.player.pos;
    let best = null;
    for (const d of this.doors) if (d.n === TARGET && d.z > LOOP_AT - 4 && (!best || Math.abs(d.z - p.z) < Math.abs(best.z - p.z))) best = d;
    return best ? { x: best.x + 0.7, z: best.z } : this.exit;
  }

  exitEmitter() {
    return { x: 0, y: 2.6, z: 6, sound: 'hum', gain: 0.08 };
  }

  dispose() {
    if (this.cardMats) for (const m of this.cardMats) m.dispose();
    super.dispose();
  }
}
