// Nível 0 — "O Saguão": papel de parede amarelo, carpete úmido e luminárias
// fluorescentes em salas irregulares que nunca terminam.
// Saída: uma parede que falha ("fenda"); atravessá-la leva ao Nível 1.
// Segredo: um rastro vermelho leva a uma porta de madeira (Subnível 0.1).
// Áreas secretas (atrás de portas e frestas nas paredes):
//  • As Armadilhas: carpete podre e encharcado, luzes morrendo e buracos no
//    chão — alguns escondidos. Quem cai, cai no Nível 1.
//  • Sala Manila: uma sala ampla de paredes cor de manila, toda acesa e
//    segura; a sanidade se recupera lá dentro.
//  • Salas Escuras: um trecho onde todas as luzes morreram.
import * as THREE from 'three';
import { GridLevel, W, EH, EV } from './grid.js';
import { getTex, indoorEnvTex, loadPhotoTex } from '../textures.js';
import { panelMaterial } from '../materials.js';
import { clamp, fbm, hash3, mulberry32, TAU } from '../util.js';
import { SecretTrail } from './level0_secret.js';

export class Level0 extends GridLevel {
  constructor(game) {
    super(game, {
      cell: 2.4,
      H: 2.7,
      T: 0.14,
      doorW: 1.05,
      doorH: 2.15,
      chunkCells: 8,
      seed: (game.seed ^ 0x5151) >>> 0,
      lightRadius: 9.5,
      lightEmitPow: 1,
      bounce: 0.5,
      ambient: 0.025,
      wallUV: [1.2, 2.7],
      floorUV: 2,
      ceilUV: 1.2,
    });
    this.num = 0;
    this.surface = 'carpet';
    this.panelI = 7;
    this.flickerGap = 8;
    const S = this.Q.tex;
    const wp = getTex('wallpaper', S);
    const cp = getTex('carpet', S);
    const ce = getTex('ceiling', S);
    const pn = getTex('panel', S);
    const gr = getTex('grime', S);
    const env = game.makeEnv(indoorEnvTex(['#6b5f3a', '#4a4128', '#3a3220'], '#fff6d8'));
    this.mats = {
      floor: {
        map: cp.map,
        normalMap: cp.normalMap,
        normalScale: 0.8,
        roughness: 0.92,
        dirtColor: new THREE.Color(0.7, 0.62, 0.48),
        dirtAmt: 0.6,
        wet: 0.55,
        envMap: env,
        envIntensity: 0.6,
      },
      wall: {
        map: wp.map,
        normalMap: wp.normalMap,
        normalScale: 0.5,
        roughness: 0.82,
        vertexColors: true,
        envMap: env,
        envIntensity: 0.25,
      },
      ceil: { map: ce.map, normalMap: ce.normalMap, roughness: 0.95, lmIntensity: 0.4, vertexColors: true },
      prop: { map: gr.map, normalMap: gr.normalMap, vertexColors: true, roughness: 0.6, envMap: env, envIntensity: 0.4 },
    };
    this.panelMat = panelMaterial(pn.map, 0xfff1d0);
    this.look = {
      exposure: 1.05,
      tint: [1.04, 1.0, 0.88],
      sat: 0.92,
      contrast: 1.04,
      lift: [0.025, 0.02, 0.008],
      bloom: 0.16,
      fog: [0.36, 0.31, 0.17],
      fogNear: 0.4,
      lightColor: [1.0, 0.93, 0.74],
      flashlight: false,
      ambience: 'level0',
      reverb: 2.2,
      sanityDrain: 0.22,
      watcher: { near: 11, far: 20, first: 50, gap: 80 },
    };
    this.pitMat = new THREE.MeshBasicMaterial({ map: pitTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    this.pitHidden = this.pitMat.clone();
    this.pitHidden.opacity = 0.5;
    this.sharedLayers = { pit: this.pitMat, pitH: this.pitHidden };
    this.zones = [];
    this.pits = [];
    this.told = {};
    this.route();
  }

  // ------------------------------------------------------------ áreas secretas
  zoneAt(ix, iz) {
    for (const z of this.zones) if (ix >= z.x0 && ix < z.x1 && iz >= z.z0 && iz < z.z1) return z;
    return null;
  }

  zoneEdge(kind, ix, iz) {
    const bx = kind === EH ? ix : ix - 1;
    const bz = kind === EH ? iz - 1 : iz;
    const za = this.zoneAt(ix, iz);
    const zb = this.zoneAt(bx, bz);
    if (!za && !zb) return undefined;
    if (za === zb) {
      if (za.type === 'manila') return W.NONE;
      if (za.type === 'trap') {
        const h = hash3(ix * 2 + kind, iz, this.seed + 41);
        if (h > 0.2) return W.NONE;
        const t = hash3(ix, iz * 3 + kind, this.seed + 42);
        return t < 0.4 ? W.HALF_A : t < 0.7 ? W.HALF_B : W.FULL;
      }
      return undefined; // salas escuras: planta normal
    }
    const z = za || zb;
    const e = z.entrance;
    if (e && e.kind === kind && e.ix === ix && e.iz === iz) return z.type === 'trap' ? W.HALF_A : W.DOOR;
    return W.FULL;
  }

  // Coloca as áreas longe da rota da saída e do rastro vermelho.
  placeZones(rnd, exitAng, trailCells) {
    const defs = [
      { type: 'manila', w: 6, h: 5, d: 17 },
      { type: 'trap', w: 10, h: 8, d: 26 },
      { type: 'dark', w: 10, h: 10, d: 38 },
    ];
    const ex = this.exitCell;
    const segD = (px, pz) => {
      const L2 = ex[0] * ex[0] + ex[1] * ex[1];
      const t = clamp((px * ex[0] + pz * ex[1]) / L2, 0, 1);
      return Math.hypot(px - ex[0] * t, pz - ex[1] * t);
    };
    let ang = exitAng + 1.3 + rnd() * 0.6;
    for (const d of defs) {
      for (let tries = 0; tries < 24; tries++, ang += 0.45) {
        const cx = Math.round(Math.cos(ang) * d.d);
        const cz = Math.round(Math.sin(ang) * d.d);
        const z = { type: d.type, x0: cx - (d.w >> 1), z0: cz - (d.h >> 1) };
        z.x1 = z.x0 + d.w;
        z.z1 = z.z0 + d.h;
        const bad =
          segD(cx, cz) < Math.max(d.w, d.h) / 2 + 4 ||
          this.zones.some((o) => !(z.x1 + 3 < o.x0 || z.x0 - 3 > o.x1 || z.z1 + 3 < o.z0 || z.z0 - 3 > o.z1)) ||
          trailCells.some(([tx, tz]) => tx >= z.x0 - 2 && tx < z.x1 + 2 && tz >= z.z0 - 2 && tz < z.z1 + 2);
        if (bad) continue;
        // entrada no lado voltado para o início
        if (Math.abs(cx) >= Math.abs(cz)) {
          const iz = cz;
          if (cx > 0) z.entrance = { kind: EV, ix: z.x0, iz, out: [z.x0 - 1, iz], inn: [z.x0, iz] };
          else z.entrance = { kind: EV, ix: z.x1, iz, out: [z.x1, iz], inn: [z.x1 - 1, iz] };
        } else {
          const ix = cx;
          if (cz > 0) z.entrance = { kind: EH, ix, iz: z.z0, out: [ix, z.z0 - 1], inn: [ix, z.z0] };
          else z.entrance = { kind: EH, ix, iz: z.z1, out: [ix, z.z1], inn: [ix, z.z1 - 1] };
        }
        z.cx = cx;
        z.cz = cz;
        this.zones.push(z);
        ang += 1.9;
        break;
      }
    }
    // buracos nas Armadilhas (alguns escondidos sob o carpete encharcado)
    const T = this.zones.find((z) => z.type === 'trap');
    if (T) {
      const c = this.cell;
      for (let k = 0; k < 40 && this.pits.length < 9; k++) {
        const ix = T.x0 + 1 + Math.floor(rnd() * (T.x1 - T.x0 - 2));
        const iz = T.z0 + 1 + Math.floor(rnd() * (T.z1 - T.z0 - 2));
        if (Math.abs(ix - T.cx) + Math.abs(iz - T.cz) < 2) continue;
        if (Math.abs(ix - T.entrance.inn[0]) + Math.abs(iz - T.entrance.inn[1]) < 2) continue;
        if (this.pits.some((p) => p.ix === ix && p.iz === iz)) continue;
        this.pits.push({ ix, iz, x: ix * c + c / 2 + (rnd() - 0.5) * 0.6, z: iz * c + c / 2 + (rnd() - 0.5) * 0.6, r: 0.75 + rnd() * 0.35, hidden: rnd() < 0.4 });
      }
    }
    this.edgeMemo.clear();
    for (const z of this.zones) this.carve(0, 0, z.entrance.out[0], z.entrance.out[1], rnd);
  }

  genEdge(kind, ix, iz) {
    const ze = this.zoneEdge(kind, ix, iz);
    if (ze !== undefined) return ze;
    return this.baseEdge(kind, ix, iz);
  }

  tintAt(x, z) {
    const zn = this.zoneAt(Math.floor(x / this.cell), Math.floor(z / this.cell));
    if (!zn) return null;
    return { trap: [0.55, 0.47, 0.32], manila: [1.08, 0.84, 0.6], dark: [0.55, 0.52, 0.42] }[zn.type];
  }

  // Paredes com o tom da área secreta.
  vface(gb, ax, az, bx, bz, y0, y1, n, uA, uB, lmFn) {
    const t = this.tintAt((ax + bx) / 2 + n[0] * 0.3, (az + bz) / 2 + n[2] * 0.3);
    if (!t) return super.vface(gb, ax, az, bx, bz, y0, y1, n, uA, uB, lmFn);
    const rows = this.wallRows(y0, y1);
    const vr = this.wallUV[1];
    const la = lmFn(ax + n[0] * 0.25, az + n[2] * 0.25);
    const lb = lmFn(bx + n[0] * 0.25, bz + n[2] * 0.25);
    for (let r = 0; r < rows.length - 1; r++) {
      const ya = rows[r];
      const yb = rows[r + 1];
      const ka = this.wallShade(ya);
      const kb = this.wallShade(yb);
      const ca = [ka * t[0], ka * t[1], ka * t[2]];
      const cb = [kb * t[0], kb * t[1], kb * t[2]];
      gb.quad(
        [
          [ax, ya, az],
          [bx, ya, bz],
          [bx, yb, bz],
          [ax, yb, az],
        ],
        n,
        [uA, ya / vr, uB, ya / vr, uB, yb / vr, uA, yb / vr],
        [la[0], la[1], lb[0], lb[1], lb[0], lb[1], la[0], la[1]],
        [ca, ca, cb, cb],
      );
    }
  }

  // Buracos das Armadilhas no bloco.
  buildExtra(G, ch) {
    for (const p of this.pits) {
      if (p.x < ch.x0 || p.x >= ch.x0 + this.S || p.z < ch.z0 || p.z >= ch.z0 + this.S) continue;
      const r = p.r + 0.25;
      const y = 0.006;
      const gb = p.hidden ? G.pitH : G.pit;
      gb.quad(
        [
          [p.x - r, y, p.z + r],
          [p.x + r, y, p.z + r],
          [p.x + r, y, p.z - r],
          [p.x - r, y, p.z - r],
        ],
        [0, 1, 0],
        [0, 1, 1, 1, 1, 0, 0, 0],
        null,
        null,
      );
    }
  }

  region(x, z) {
    return fbm(x * 0.06, z * 0.06, 3, this.seed);
  }

  // Paredes longas e paralelas formam corredores; o resto é aleatório por região.
  baseEdge(kind, ix, iz) {
    const r = this.region(ix, iz);
    let p = 0.3;
    if (r > 0.2) p = 0.06;
    else if (r < -0.22) p = 0.46;
    const lineId = kind === EH ? iz : ix;
    const along = kind === EH ? ix : iz;
    const line = hash3(lineId, kind, this.seed + 5);
    if (line < 0.16 && r < 0.2) {
      // parede de corredor com segmentos e aberturas
      const seg = Math.floor(along / (3 + Math.floor(line * 40)));
      if (hash3(seg, lineId * 3 + kind, this.seed + 9) < 0.82) p = 0.88;
    }
    const h = hash3(ix * 2 + kind, iz, this.seed);
    if (h >= p) return W.NONE;
    const t = hash3(ix, iz * 3 + kind, this.seed + 7);
    if (t < 0.27) return W.DOOR;
    if (t < 0.35) return W.HALF_A;
    if (t < 0.42) return W.HALF_B;
    return W.FULL;
  }

  pillar(ix, iz) {
    if (this.zoneAt(ix, iz) || this.zoneAt(ix - 1, iz - 1)) return 0;
    if (this.region(ix, iz) < 0.2) return 0;
    if (ix & 1 || iz & 1) return 0;
    return 0.46;
  }

  genLight(cx, cz) {
    if (cx & 1 || cz & 1) return null;
    const c = this.cell;
    const h = this.hashCell(cx, cz, 3);
    const zn = this.zoneAt(cx, cz);
    if (zn) {
      let group = 0;
      let I = 9;
      if (zn.type === 'dark') group = h < 0.94 ? 3 : 1;
      else if (zn.type === 'trap') {
        group = h < 0.6 ? 3 : h < 0.82 ? 1 : 2;
        I = 5;
      } else I = 11;
      return { x: cx * c + 1.2, z: cz * c + 0.9, y: this.H - 0.02, ax: 0, len: 1.2, wid: 0.6, I, group };
    }
    const dim = fbm(cx * 0.04 + 30, cz * 0.04, 2, this.seed + 1);
    let group = 0;
    const off = dim < -0.32 ? 0.45 : 0.06;
    if (h < off) group = 3;
    else if (h < off + 0.045) group = 1;
    else if (h < off + 0.09) group = 2;
    const ax = fbm(cx * 0.05 + 9, cz * 0.05, 2, this.seed + 2) > 0 ? 1 : 0;
    return {
      x: cx * c + (ax === 1 ? 0.9 : 1.2),
      z: cz * c + (ax === 1 ? 1.2 : 0.9),
      y: this.H - 0.02,
      ax,
      len: 1.2,
      wid: 0.6,
      I: 9,
      group,
    };
  }

  dirt(x, z) {
    const zn = this.zoneAt(Math.floor(x / this.cell), Math.floor(z / this.cell));
    if (zn && zn.type === 'trap') return clamp(0.55 + fbm(x * 0.3, z * 0.3, 2, this.seed + 12) * 1.5, 0, 1);
    const n = fbm(x * 0.16, z * 0.16, 3, this.seed + 11);
    const t = (n - 0.12) / 0.3;
    return t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
  }

  genProps(ch, cx0, cz0) {
    const N = this.chunkCells;
    const c = this.cell;
    this.zoneProps(ch, cx0, cz0);
    for (let z = cz0; z < cz0 + N; z++) {
      for (let x = cx0; x < cx0 + N; x++) {
        if (Math.abs(x) + Math.abs(z) < 2 || this.zoneAt(x, z)) continue;
        const h = this.hashCell(x, z, 21);
        if (h < 0.014) {
          ch.items.push({
            type: 'water',
            key: `0:${x}:${z}:w`,
            x: x * c + 0.6 + this.hashCell(x, z, 22) * 1.2,
            z: z * c + 0.6 + this.hashCell(x, z, 23) * 1.2,
          });
        }
      }
    }
    if (hash3(ch.cx, ch.cz, this.seed + 31) < 0.3) {
      const x = cx0 + Math.floor(hash3(ch.cx, ch.cz, this.seed + 32) * N);
      const z = cz0 + Math.floor(hash3(ch.cx, ch.cz, this.seed + 33) * N);
      ch.items.push({ type: 'note', key: `0:${ch.cx}:${ch.cz}:n`, x: x * c + 1.2, z: z * c + 1.0, rot: hash3(x, z, 5) * TAU });
    }
  }

  // Recompensas e objetos das áreas secretas.
  zoneProps(ch, cx0, cz0) {
    const c = this.cell;
    const N = this.chunkCells;
    const inC = (ix, iz) => ix >= cx0 && ix < cx0 + N && iz >= cz0 && iz < cz0 + N;
    for (const z of this.zones) {
      if (!inC(z.cx, z.cz)) continue;
      const x = z.cx * c + c / 2;
      const zz = z.cz * c + c / 2;
      const note = (key, text, dx, dz) =>
        ch.items.push({
          type: 'note',
          key,
          x: x + dx,
          z: zz + dz,
          rot: 0.4,
          onUse: (g) => {
            g.audio.paper();
            g.hud.showNote(text);
            g.addSanity(4);
          },
        });
      if (z.type === 'trap') {
        for (let k = 0; k < 3; k++) ch.items.push({ type: 'water', key: `0:trap:w${k}`, x: x - 0.4 + k * 0.4, z: zz + 0.3 });
        note('0:trap:n', 'AS ARMADILHAS. O carpete aqui apodreceu de tanta água. Há buracos no chão, e alguns estão cobertos pelo carpete encharcado — parecem só manchas. Quem cai não volta para o Nível 0: acorda lá embaixo, no concreto do Nível 1. Às vezes é um atalho. Às vezes não.', 0.2, -0.5);
        // caixas de papelão molhadas em volta do esconderijo
        ch.props.push({
          ao: [x - 1.1, x - 0.5, zz - 0.4, zz + 0.4, 0],
          draw: (G) => {
            G.prop.box(x - 0.8, 0.22, zz, 0.5, 0.44, 0.6, [0.42, 0.33, 0.2], G.lm, { rot: 0.3 });
            G.prop.box(x - 0.78, 0.6, zz + 0.05, 0.42, 0.32, 0.5, [0.46, 0.36, 0.22], G.lm, { rot: 0.1 });
          },
        });
        ch.colliders.push([x - 1.1, x - 0.5, zz - 0.4, zz + 0.4]);
      } else if (z.type === 'manila') {
        ch.items.push({ type: 'water', key: '0:manila:w', x: x + 0.6, z: zz - 0.3 });
        note('0:manila:n', 'SALA MANILA. Aqui as luzes nunca falham e as paredes têm cor de envelope velho. Ninguém sabe por quê, mas aqui dentro a cabeça descansa. Fique o quanto precisar. Só não durma: quem dorme aqui acorda em outra sala amarela.', -0.6, 0.4);
        ch.props.push({
          ao: [x - 0.5, x + 0.5, zz - 0.35, zz + 0.35, 0],
          draw: (G) => {
            G.prop.box(x, 0.72, zz, 1.0, 0.05, 0.7, [0.5, 0.42, 0.3], G.lm, {});
            for (const [a, b] of [
              [-0.45, -0.3],
              [0.45, -0.3],
              [-0.45, 0.3],
              [0.45, 0.3],
            ])
              G.prop.box(x + a, 0.35, zz + b, 0.04, 0.7, 0.04, [0.3, 0.3, 0.3], G.lm, {});
            G.prop.box(x + 0.9, 0.45, zz + 0.6, 0.45, 0.06, 0.45, [0.25, 0.25, 0.28], G.lm, { rot: 0.5 });
            G.prop.box(x + 0.9, 0.75, zz + 0.82, 0.45, 0.55, 0.06, [0.25, 0.25, 0.28], G.lm, { rot: 0.5 });
          },
        });
        ch.colliders.push([x - 0.5, x + 0.5, zz - 0.35, zz + 0.35]);
      } else {
        ch.items.push({ type: 'water', key: '0:dark:w', x: x, z: zz });
        note('0:dark:n', 'SALAS ESCURAS. As lâmpadas daqui não queimaram: foram desligadas. Alguma coisa gosta do escuro. Se ouvir o zumbido voltar perto de você, não é a energia.', 0.5, 0.3);
      }
    }
  }

  // Sorteia a parede que falha (~130 m) e garante uma rota até ela.
  route() {
    const rnd = mulberry32(this.seed * 7 + 3);
    const a = rnd() * TAU;
    const d = 52 + Math.floor(rnd() * 8);
    const ex = Math.round(Math.cos(a) * d);
    const ez = Math.round(Math.sin(a) * d);
    const c = this.cell;
    const hT = this.T / 2;
    // a fenda fica do lado oposto ao de chegada
    const iz = ez >= 0 ? ez + 1 : ez;
    this.setEdge(EH, ex, iz, W.EXIT);
    this.clearCell(0, 0);
    this.clearCell(ex, ez);
    this.carve(0, 0, ex, ez, rnd);
    this.exitCell = [ex, ez];
    const nz = ez >= 0 ? -1 : 1;
    this.exit = { x: ex * c + c / 2, z: iz * c + nz * (hT + 0.01), nz };
    this.spawn = { x: c / 2, z: c / 2, yaw: Math.atan2(-(this.exit.x - c / 2), -(this.exit.z - c / 2)) + (rnd() - 0.5) * 2 };
    this.secret = new SecretTrail(this, mulberry32(this.seed * 13 + 1), a + Math.PI);
    this.placeZones(mulberry32(this.seed * 17 + 5), a, this.secret.cells);
    // malha animada da fenda
    const wp = getTex('wallpaper', this.Q.tex);
    this.riftMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { map: { value: wp.map }, uTime: { value: 0 }, uLight: { value: new THREE.Color(1, 1, 1) }, uRep: { value: (c - 0.2) / 1.2 }, uRepY: { value: 1 } },
      ]),
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        #include <fog_pars_vertex>
        void main() {
          vUv = uv;
          vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform float uTime;
        uniform vec3 uLight;
        uniform float uRep;
        uniform float uRepY;
        varying vec2 vUv;
        #include <fog_pars_fragment>
        float h( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
        void main() {
          vec2 uv = vUv;
          float t = uTime;
          float tick = floor( t * 14.0 );
          float row = floor( uv.y * 46.0 );
          float g = step( 0.62, h( vec2( row, tick ) ) );
          uv.x += ( h( vec2( row, tick + 1.0 ) ) - 0.5 ) * 0.3 * g;
          vec3 wp = texture2D( map, vec2( uv.x * uRep, uv.y * uRepY ) ).rgb * uLight;
          float cx = 0.5 + ( h( vec2( floor( uv.y * 26.0 ), floor( t * 5.0 ) ) ) - 0.5 ) * 0.07;
          float w = 0.035 + 0.02 * sin( uv.y * 17.0 + t * 2.3 );
          float slit = smoothstep( 0.05, 0.0, abs( uv.x - cx ) - w );
          vec3 col = mix( wp, vec3( 0.0 ), slit * 0.97 );
          col += vec3( h( vec2( row, t ) ), h( vec2( row + 3.0, t ) ), h( vec2( row + 7.0, t ) ) ) * g * 0.45 * uLight;
          col *= 0.85 + 0.3 * h( vec2( tick, 9.0 ) );
          float e = min( min( vUv.x, 1.0 - vUv.x ), min( vUv.y, 1.0 - vUv.y ) );
          gl_FragColor = vec4( col, smoothstep( 0.0, 0.07, e ) );
          #include <fog_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    const geo = new THREE.PlaneGeometry(c - 0.2, this.H - 0.06);
    this.rift = new THREE.Mesh(geo, this.riftMat);
    this.rift.position.set(this.exit.x, this.H / 2, this.exit.z + nz * 0.004);
    this.rift.rotation.y = nz > 0 ? 0 : Math.PI;
    this.rift.renderOrder = 3;
    this.dynamic.add(this.rift);
  }

  onChunkBuilt(ch) {
    this.secret.onChunkBuilt(ch);
    if (this.riftLit) return;
    if (!this.chunkAt(this.exit.x, this.exit.z + this.exit.nz * 0.5)) return;
    const L = this.lightLevel(this.exit.x, this.exit.z + this.exit.nz * 0.5);
    this.riftMat.uniforms.uLight.value.setRGB(1, 0.93, 0.74).multiplyScalar(Math.min(2, L * 0.9 + 0.1));
    this.riftLit = true;
  }

  groundY() {
    return this.falling ? this.falling.y : 0;
  }

  tick(dt, player) {
    this.riftMat.uniforms.uTime.value += dt;
    this.secret.tick(dt, player);
    this.zoneTick(dt, player);
    const dx = player.pos.x - this.exit.x;
    const dz = (player.pos.z - this.exit.z) * this.exit.nz;
    if (Math.abs(dx) < this.cell / 2 - 0.2 && dz > 0 && dz < 0.62) this.game.reachExit();
  }

  zoneTick(dt, player) {
    const g = this.game;
    const p = player.pos;
    const c = this.cell;
    // caindo num buraco das Armadilhas
    if (this.falling) {
      const f = this.falling;
      f.t += dt;
      f.y = -f.t * f.t * 7;
      if (f.t > 0.7 && !f.done) {
        f.done = true;
        g.reachExit('noclip', 0.1);
      }
      return;
    }
    const zn = this.zoneAt(Math.floor(p.x / c), Math.floor(p.z / c));
    this.sanityExtra = zn && zn.type === 'manila' ? -1.4 : 0;
    if (zn && !this.told[zn.type]) {
      this.told[zn.type] = true;
      const msg = {
        trap: 'Área secreta: AS ARMADILHAS. O carpete está podre e encharcado, e há buracos no chão. Algumas manchas escuras não são só manchas. Cuidado onde pisa.',
        manila: 'Área secreta: SALA MANILA. Paredes cor de envelope velho, todas as luzes acesas, silêncio. Aqui a cabeça descansa.',
        dark: 'Área secreta: SALAS ESCURAS. Todas as lâmpadas daqui estão apagadas. O zumbido some. Melhor acender a lanterna (F / 🔦).',
      }[zn.type];
      g.hud.message(msg, 6);
      g.audio.play(zn.type === 'manila' ? 'ding' : 'heart', { gain: 0.3 });
    }
    if (!zn || zn.type !== 'trap') return;
    for (const pit of this.pits) {
      const d = Math.hypot(p.x - pit.x, p.z - pit.z);
      if (d < pit.r + 1.3 && !pit.creaked) {
        pit.creaked = true;
        g.audio.play('creak', { gain: 0.35, rate: 0.6, wet: 0.6 });
        if (!this.told.creak) {
          this.told.creak = true;
          g.hud.message('O chão range e afunda sob o carpete…', 3);
        }
      }
      if (d < pit.r * 0.7 && !g.transitioning) {
        this.falling = { t: 0, y: 0 };
        player.frozen = true;
        g.audio.play('creak', { gain: 0.6, rate: 0.4 });
        g.audio.scare();
        g.hud.message('O carpete cede! Você cai no escuro…', 3);
        g.vibrate([80, 40, 200]);
        return;
      }
    }
  }

  interactable(player) {
    return this.secret.interactable(player);
  }

  exitEmitter() {
    return { x: this.exit.x, y: 1.4, z: this.exit.z, sound: 'rift' };
  }

  // Papel de parede fotográfico (gerado no Higgsfield), carregado antes de montar
  // as paredes; se não carregar, fica a textura desenhada por código.
  async preload(px, pz, progress) {
    if (!this.photoTried) {
      this.photoTried = true;
      const [map, nor] = await Promise.all([loadPhotoTex('assets/tex/l0_wallpaper.jpg'), loadPhotoTex('assets/tex/l0_wallpaper_n.jpg', { srgb: false })]);
      if (map) {
        const T = 1.35; // metros por repetição da foto
        this.photos = [map, nor].filter(Boolean);
        this.mats.wall.map = map;
        if (nor) this.mats.wall.normalMap = nor;
        this.mats.wall.normalScale = 0.7;
        this.wallUV = [T, T];
        const u = this.riftMat.uniforms;
        u.map.value = map;
        u.uRep.value = (this.cell - 0.2) / T;
        u.uRepY.value = (this.H - 0.06) / T;
      }
    }
    return super.preload(px, pz, progress);
  }

  dispose() {
    super.dispose();
    if (this.photos) for (const t of this.photos) t.dispose();
    this.pitMat.map.dispose();
    this.pitMat.dispose();
    this.pitHidden.dispose();
  }
}

// Buraco no piso: preto no meio, borda de carpete rasgado e encharcado.
function pitTex() {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d');
  const img = c.createImageData(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = x / S - 0.5;
      const dy = y / S - 0.5;
      const a = Math.atan2(dy, dx);
      const r = Math.hypot(dx, dy) * 2;
      const edge = 0.62 + Math.sin(a * 7) * 0.04 + Math.sin(a * 13 + 1) * 0.03;
      const i = (y * S + x) * 4;
      if (r < edge) {
        const k = clamp((edge - r) * 6, 0, 1);
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 4 * (1 - k);
        img.data[i + 3] = 255;
      } else {
        // carpete molhado e escurecido em volta
        const k = clamp(1 - (r - edge) / (1 - edge), 0, 1);
        img.data[i] = 40;
        img.data[i + 1] = 32;
        img.data[i + 2] = 12;
        img.data[i + 3] = k * k * 200;
      }
    }
  c.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
