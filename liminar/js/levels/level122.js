// Nível 122 — "Piscinas Estranhas" (Classe 0). Uma sequência de salões fechados
// com o teto pintado de céu nublado, canteiros de grama alta e um rio lento de
// água turquesa que brilha, serpenteando de sala em sala. Boias escuras flutuam
// à deriva, boias salva-vidas pendem das paredes — e flores amarelas gigantes,
// cada uma com um olho no meio, viram a cabeça para acompanhar o andarilho.
// Seguro. Ninguém faz mal a ninguém aqui. Só olham.
// Saída: a porta com a placa verde no último salão.
import * as THREE from 'three';
import { pushCircle } from './grid.js';
import { GeoBuilder } from '../materials.js';
import { textCanvasTex } from '../textures.js';
import { clamp, damp, lerp, mulberry32, smoothstep, TAU } from '../util.js';
import { GrassTufts } from './level177_common.js';
import { River, tileTex, soilTex, bladeTex, wallTex, Botany, WATER_VERT, WATER_FRAG, SKYCEIL_FRAG } from './level122_parts.js';

const WT = 0.3; // espessura das paredes
const DOOR_H = 3.2;
const HW = 1.35; // meia largura do rio
const RIM = 0.4; // borda de azulejo
const POOL = -0.62; // fundo

// Salões [x0, x1, z0, z1, altura do teto]
const ROOMS = [
  { x0: -9, x1: 9, z0: 0, z1: 16, H: 5.5 },
  { x0: -8, x1: 12, z0: -20, z1: 0, H: 6.5 },
  { x0: 12, x1: 32, z0: -26, z1: -8, H: 5.6 },
  { x0: 12, x1: 30, z0: -48, z1: -26, H: 7.2 },
  { x0: -6, x1: 12, z0: -62, z1: -42, H: 6.0 },
];
// Vãos entre salões: { eixo da parede, posição, de, até }
const DOORS = [
  { axis: 'z', at: 0, a: -1.2, b: 4.2 },
  { axis: 'x', at: 12, a: -17.2, b: -11.8 },
  { axis: 'z', at: -26, a: 17.8, b: 23.2 },
  { axis: 'x', at: 12, a: -47.4, b: -42.6 },
];
// Linha central do rio, passando pelo meio de cada vão.
const RIVER = [
  [-4.5, 12.5],
  [-3.2, 8.5],
  [0.6, 5.0],
  [1.5, 1.8],
  [1.5, -1.8],
  [0.0, -6.5],
  [4.5, -12.0],
  [9.0, -14.5],
  [15.0, -14.5],
  [21.5, -13.0],
  [26.0, -17.5],
  [21.5, -23.0],
  [20.5, -28.0],
  [19.0, -33.5],
  [25.0, -38.5],
  [21.0, -44.5],
  [15.0, -45.0],
  [9.0, -45.0],
  [4.0, -49.0],
  [1.5, -54.5],
];
const EXIT = { x: 7.0, z: -62 };

export class Level122 {
  constructor(game) {
    this.game = game;
    this.Q = game.Q;
    this.scene = game.scene;
    this.indoor = false;
    this.num = 122;
    this.camFar = 200;
    this.walkSpeed = 2.2;
    this.baseWalk = 2.2;
    this.flashIntensity = 10;
    this.taken = new Set();
    this.dynamic = new THREE.Group();
    this.scene.add(this.dynamic);
    this.time = 0;
    this.sanityExtra = 0;
    this.geos = [];
    this.mats = [];
    this.texs = [];
    this.walls = [];
    this.circles = [];
    this.look = {
      exposure: 1.02,
      tint: [0.9, 1.04, 0.96],
      sat: 0.92,
      contrast: 1.06,
      lift: [0.01, 0.025, 0.022],
      bloom: 0.42,
      bloomThreshold: 0.85,
      fog: [0.05, 0.12, 0.12],
      lightColor: [1, 1, 1],
      flashlight: false,
      ambience: 'level122',
      reverb: 2.2,
      sanityDrain: 0.02,
    };
    this.objectives = [{ id: 'saida', text: 'Siga o rio até a porta com a placa verde' }];
    this.scene.fog = new THREE.FogExp2(new THREE.Color(...this.look.fog), 0.022);
    this.scene.background = new THREE.Color(0.03, 0.08, 0.08);
    this.river = new River(RIVER, HW);
    this.spawn = { x: 5.5, z: 13.5, yaw: 0.25 };
    this.exit = { x: EXIT.x, z: EXIT.z + 1.2 };
  }

  mat(m) {
    this.mats.push(m);
    return m;
  }

  // ------------------------------------------------------------ relevo
  // Fundo da piscina, paredes do canal, borda de azulejo e canteiros de grama.
  heightAt(x, z) {
    const d = this.river.dist(x, z);
    if (d < HW - 0.22) return POOL;
    if (d < HW) return lerp(POOL, 0, smoothstep(HW - 0.22, HW - 0.02, d));
    if (d < HW + RIM) return 0.0;
    const bed = 0.14 + 0.06 * Math.sin(x * 0.7) * Math.sin(z * 0.6);
    return lerp(0.0, bed, smoothstep(HW + RIM, HW + RIM + 0.25, d));
  }

  inRoom(x, z, m = 0) {
    for (const R of ROOMS) if (x > R.x0 + m && x < R.x1 - m && z > R.z0 + m && z < R.z1 - m) return R;
    return null;
  }

  // ------------------------------------------------------------ construção
  async preload(px, pz, progress) {
    const S = this.Q.tex;
    this.tile = tileTex(Math.min(1024, S));
    this.soil = soilTex(Math.min(1024, S));
    this.wallMap = wallTex(Math.min(1024, S));
    this.texs.push(this.tile, this.soil, this.wallMap);
    progress(0.1);
    this.makeGround();
    progress(0.35);
    await new Promise((r) => setTimeout(r, 0));
    this.makeWater();
    this.makeWalls();
    this.makeCeilings();
    progress(0.55);
    await new Promise((r) => setTimeout(r, 0));
    this.bot = new Botany();
    this.makeFlowers();
    this.makeFloats();
    this.makeDecor();
    this.makeExit();
    this.makeLights();
    progress(0.8);
    const bl = bladeTex();
    this.texs.push(bl);
    this.grass = new GrassTufts(this, bl, this.Q.id === 'low' ? 9 : this.Q.id === 'medium' ? 12 : 16, 0.62, 0xb8d8a8, 0.62);
    this.refreshGrass(px, pz);
    this.spawnItems();
    progress(1);
  }

  isGrass(x, z) {
    if (!this.inRoom(x, z, 0.5)) return false;
    return this.river.dist(x, z) > HW + RIM + 0.3;
  }

  refreshGrass(px, pz) {
    this.grass.refresh(px, pz, (x, z) => this.heightAt(x, z), (x, z) => !this.isGrass(x, z) || this.nearProp(x, z));
  }

  nearProp(x, z) {
    for (const c of this.circles) if (Math.abs(x - c[0]) < c[2] + 0.2 && Math.abs(z - c[1]) < c[2] + 0.2) return true;
    return Math.hypot(x - EXIT.x, z - (EXIT.z + 1)) < 2;
  }

  // Um relevo por salão (grade de 0,25 m), com azulejo e terra misturados.
  makeGround() {
    const step = this.Q.id === 'low' ? 0.4 : 0.25;
    const tileU = { value: this.tile };
    const soilU = { value: this.soil };
    this.groundMat = this.mat(
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, map: this.tile }),
    );
    this.groundMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTile = tileU;
      sh.uniforms.uSoil = soilU;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aTile;\nvarying float vTile;\nvarying vec3 vWP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTile = aTile;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uTile;\nuniform sampler2D uSoil;\nvarying float vTile;\nvarying vec3 vWP;')
        .replace(
          '#include <map_fragment>',
          `vec3 tC = texture2D( uTile, vWP.xz * 0.5 ).rgb;
          vec3 sC = texture2D( uSoil, vWP.xz * 0.6 ).rgb * 2.2;
          diffuseColor.rgb *= mix( sC, tC, vTile );`,
        )
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix( 0.95, 0.18, vTile );');
    };
    this.grounds = [];
    for (const R of ROOMS) {
      const w = R.x1 - R.x0;
      const d = R.z1 - R.z0;
      const nx = Math.round(w / step);
      const nz = Math.round(d / step);
      const geo = new THREE.PlaneGeometry(w, d, nx, nz);
      geo.rotateX(-Math.PI / 2);
      geo.translate((R.x0 + R.x1) / 2, 0, (R.z0 + R.z1) / 2);
      const p = geo.attributes.position;
      const col = new Float32Array(p.count * 3);
      const tl = new Float32Array(p.count);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const z = p.getZ(i);
        const dd = this.river.dist(x, z);
        p.setY(i, this.heightAt(x, z));
        let c;
        let t;
        if (dd < HW - 0.22) {
          c = [0.62, 0.95, 0.92];
          t = 1;
        } else if (dd < HW + RIM) {
          c = dd < HW ? [0.82, 0.96, 0.95] : [0.94, 0.97, 0.95];
          t = 1;
        } else {
          const k = smoothstep(HW + RIM, HW + RIM + 0.3, dd);
          c = [lerp(0.92, 0.55, k), lerp(0.95, 0.7, k), lerp(0.93, 0.5, k)];
          t = 1 - k;
        }
        col.set(c, i * 3);
        tl[i] = t;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setAttribute('aTile', new THREE.BufferAttribute(tl, 1));
      geo.computeVertexNormals();
      this.geos.push(geo);
      const m = new THREE.Mesh(geo, this.groundMat);
      m.receiveShadow = true;
      this.scene.add(m);
      this.grounds.push(m);
    }
  }

  // Superfície da água: um plano por salão, recortado pelo campo de distância.
  makeWater() {
    this.waterTime = { value: 0 };
    this.waters = [];
    const res = this.Q.id === 'low' ? 6 : 10; // texels por metro
    for (const R of ROOMS) {
      const w = R.x1 - R.x0;
      const d = R.z1 - R.z0;
      const W = Math.round(w * res);
      const H = Math.round(d * res);
      const data = new Uint8Array(W * H * 4);
      for (let j = 0; j < H; j++)
        for (let i = 0; i < W; i++) {
          const x = R.x0 + ((i + 0.5) / W) * w;
          const z = R.z0 + ((j + 0.5) / H) * d;
          const v = Math.round(clamp(this.river.nearest(x, z, 3).d / 8, 0, 1) * 255);
          const k = (j * W + i) * 4;
          data[k] = data[k + 1] = data[k + 2] = v;
          data[k + 3] = 255;
        }
      const tex = new THREE.DataTexture(data, W, H);
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
      this.texs.push(tex);
      const m = this.mat(
        new THREE.ShaderMaterial({
          uniforms: { uTime: this.waterTime, uMask: { value: tex }, uRect: { value: new THREE.Vector4(R.x0, R.z0, w, d) }, uHW: { value: HW } },
          vertexShader: WATER_VERT,
          fragmentShader: WATER_FRAG,
          transparent: true,
          depthWrite: false,
        }),
      );
      const geo = new THREE.PlaneGeometry(w, d);
      geo.rotateX(-Math.PI / 2);
      this.geos.push(geo);
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set((R.x0 + R.x1) / 2, -0.12, (R.z0 + R.z1) / 2);
      mesh.renderOrder = 2;
      this.scene.add(mesh);
      this.waters.push(mesh);
    }
  }

  // Paredes por dentro de cada salão (com os vãos), rodapé e cabeçote das passagens.
  makeWalls() {
    const gb = new GeoBuilder();
    const base = [0.62, 0.78, 0.76];
    const box = (cx, cy, cz, sx, sy, sz, solid = true, c = base) => {
      gb.box(cx, cy, cz, sx, sy, sz, c, null, { uvScale: 2.2, ao: 0.4 });
      if (solid) this.walls.push([cx - sx / 2, cx + sx / 2, cz - sz / 2, cz + sz / 2]);
    };
    for (const R of ROOMS) {
      const sides = [
        { axis: 'z', at: R.z0, a: R.x0, b: R.x1, inner: R.z0 + WT / 2 },
        { axis: 'z', at: R.z1, a: R.x0, b: R.x1, inner: R.z1 - WT / 2 },
        { axis: 'x', at: R.x0, a: R.z0, b: R.z1, inner: R.x0 + WT / 2 },
        { axis: 'x', at: R.x1, a: R.z0, b: R.z1, inner: R.x1 - WT / 2 },
      ];
      for (const sd of sides) {
        const gaps = DOORS.filter((D) => D.axis === sd.axis && Math.abs(D.at - sd.at) < 0.01 && D.b > sd.a && D.a < sd.b).sort((p, q) => p.a - q.a);
        let a = sd.a;
        const seg = (p, q, y0, y1, solid) => {
          if (q - p < 0.01) return;
          const m = (p + q) / 2;
          if (sd.axis === 'z') box(m, (y0 + y1) / 2, sd.inner, q - p, y1 - y0, WT, solid);
          else box(sd.inner, (y0 + y1) / 2, m, WT, y1 - y0, q - p, solid);
          // rodapé escuro
          if (y0 === 0) {
            if (sd.axis === 'z') gb.box(m, 0.1, sd.inner + (sd.inner > sd.at ? 0.16 : -0.16), q - p, 0.2, 0.03, [0.25, 0.32, 0.3], null, { ao: 0 });
            else gb.box(sd.inner + (sd.inner > sd.at ? 0.16 : -0.16), 0.1, m, 0.03, 0.2, q - p, [0.25, 0.32, 0.3], null, { ao: 0 });
          }
        };
        for (const D of gaps) {
          seg(a, D.a, 0, R.H, true);
          seg(D.a, D.b, DOOR_H, R.H, false);
          a = D.b;
        }
        seg(a, sd.b, 0, R.H, true);
      }
    }
    // colunas redondas (como a parede curva da foto)
    const colGeo = [];
    for (const [x, z, r] of [
      [-5.5, -15, 0.9],
      [27.5, -11.5, 1.0],
      [14.5, -38.5, 1.1],
      [27.2, -45, 0.8],
    ]) {
      colGeo.push([x, z, r]);
      this.circles.push([x, z, r]);
    }
    this.wallMat = this.mat(new THREE.MeshStandardMaterial({ map: this.wallMap, vertexColors: true, roughness: 0.82, color: 0xa8ccc8, emissive: 0x0e2422 }));
    const mesh = new THREE.Mesh(gb.build(), this.wallMat);
    this.geos.push(mesh.geometry);
    this.scene.add(mesh);
    this.wallMesh = mesh;
    for (const [x, z, r] of colGeo) {
      const R = this.inRoom(x, z);
      const g = new THREE.CylinderGeometry(r, r, R.H, 28);
      this.geos.push(g);
      const c = new THREE.Mesh(g, this.wallMat);
      c.position.set(x, R.H / 2, z);
      this.dynamic.add(c);
    }
  }

  makeCeilings() {
    this.skyTime = { value: 0 };
    const vert = /* glsl */ `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4( position, 1.0 ); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
    this.tubeMat = this.mat(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.4, 2.3) }));
    const tubes = new GeoBuilder();
    for (const R of ROOMS) {
      const w = R.x1 - R.x0;
      const d = R.z1 - R.z0;
      const m = this.mat(
        new THREE.ShaderMaterial({
          uniforms: { uTime: this.skyTime, uRect: { value: new THREE.Vector4(R.x0, R.z0, w, d) } },
          vertexShader: vert,
          fragmentShader: SKYCEIL_FRAG,
          side: THREE.DoubleSide,
        }),
      );
      const geo = new THREE.PlaneGeometry(w, d);
      geo.rotateX(Math.PI / 2);
      this.geos.push(geo);
      const c = new THREE.Mesh(geo, m);
      c.position.set((R.x0 + R.x1) / 2, R.H, (R.z0 + R.z1) / 2);
      this.scene.add(c);
      // tubos fluorescentes rentes ao "céu"
      for (let k = 0; k < 2; k++) {
        const tx = lerp(R.x0, R.x1, 0.3 + k * 0.4);
        const tz = lerp(R.z0, R.z1, 0.25 + ((k * 7) % 5) * 0.12);
        tubes.box(tx, R.H - 0.06, tz, 1.6, 0.06, 0.1, [1, 1, 1], null, { ao: 0, rot: k ? 0.6 : -0.3 });
      }
    }
    const tm = new THREE.Mesh(tubes.build(), this.tubeMat);
    this.geos.push(tm.geometry);
    this.scene.add(tm);
  }

  // Flores com olho espalhadas pelos canteiros; folhas grandes em volta.
  makeFlowers() {
    const r = mulberry32(1222);
    this.flowers = [];
    const ok = (x, z, clear) => {
      if (!this.inRoom(x, z, 1.4)) return false;
      if (this.river.dist(x, z) < HW + RIM + clear) return false;
      if (Math.hypot(x - this.spawn.x, z - this.spawn.z) < 2.5) return false;
      if (Math.hypot(x - EXIT.x, z - EXIT.z) < 3.5) return false;
      for (const D of DOORS) {
        const cx = D.axis === 'z' ? (D.a + D.b) / 2 : D.at;
        const cz = D.axis === 'z' ? D.at : (D.a + D.b) / 2;
        if (Math.hypot(x - cx, z - cz) < 3.5) return false;
      }
      for (const c of this.circles) if (Math.hypot(x - c[0], z - c[1]) < c[2] + 1.5) return false;
      return true;
    };
    for (const R of ROOMS) {
      let placed = 0;
      for (let t = 0; t < 200 && placed < 4; t++) {
        const x = lerp(R.x0, R.x1, r());
        const z = lerp(R.z0, R.z1, r());
        if (!ok(x, z, 0.9)) continue;
        if (this.flowers.some((f) => Math.hypot(f.base[0] - x, f.base[1] - z) < 3.6)) continue;
        const height = 2.4 + r() * Math.min(2.6, R.H - 3.4);
        const size = 1.15 + r() * 0.8;
        const f = this.bot.flower(this.dynamic, x, this.heightAt(x, z), z, height, size, 500 + this.flowers.length * 17);
        this.flowers.push(f);
        this.circles.push([x, z, 0.12]);
        placed++;
        // folhas grandes na base
        for (let k = 0; k < 3; k++) this.bot.leaf(this.dynamic, x, this.heightAt(x, z) + 0.05, z, r() * TAU, 0.7 + r() * 0.5, -0.1 + r() * 0.2);
      }
      // touceiras de folhas soltas
      for (let t = 0, n = 0; t < 120 && n < 4; t++) {
        const x = lerp(R.x0, R.x1, r());
        const z = lerp(R.z0, R.z1, r());
        if (!ok(x, z, 0.4)) continue;
        n++;
        for (let k = 0; k < 2 + Math.floor(r() * 3); k++) this.bot.leaf(this.dynamic, x, this.heightAt(x, z), z, r() * TAU, 0.6 + r() * 0.6, r() * 0.25);
      }
    }
  }

  // Boias escuras à deriva, indo e voltando devagar.
  makeFloats() {
    const r = mulberry32(1225);
    this.floats = [];
    for (let k = 0; k < 9; k++) {
      const m = new THREE.Mesh(this.bot.tubeGeo, this.bot.tubeMat);
      this.dynamic.add(m);
      this.floats.push({ m, s0: (k / 9) * this.river.len + r() * 4, amp: 3 + r() * 5, sp: 0.02 + r() * 0.03, ph: r() * TAU, off: (r() - 0.5) * 1.2, rot: r() * TAU });
    }
  }

  // Boias salva-vidas nas paredes, um banco de azulejo, placas de "não corra".
  makeDecor() {
    const spots = [
      [8.6, 1.6, 9, -Math.PI / 2],
      [-7.6, 1.7, -6, Math.PI / 2],
      [31.6, 1.6, -18, -Math.PI / 2],
      [29.6, 1.7, -33, -Math.PI / 2],
      [-5.6, 1.6, -52, Math.PI / 2],
    ];
    for (const [x, y, z, ry] of spots) {
      const b = new THREE.Mesh(this.bot.buoyGeo, this.bot.buoyMat);
      b.position.set(x, y, z);
      b.rotation.y = ry;
      this.dynamic.add(b);
    }
    this.signTex = textCanvasTex(256, 128, (c, w, h) => {
      c.fillStyle = '#e8f0ec';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#1a5a64';
      c.font = 'bold 30px Arial, Helvetica, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('NÃO CORRA', w / 2, h / 2 - 18);
      c.font = '20px Arial, Helvetica, sans-serif';
      c.fillText('NA BEIRA DA PISCINA', w / 2, h / 2 + 18);
    });
    this.texs.push(this.signTex);
    const sm = this.mat(new THREE.MeshStandardMaterial({ map: this.signTex, roughness: 0.6 }));
    for (const [x, z, ry] of [
      [-8.68, 5, Math.PI / 2],
      [20, -8.32, Math.PI],
    ]) {
      const g = new THREE.PlaneGeometry(0.9, 0.45);
      this.geos.push(g);
      const s = new THREE.Mesh(g, sm);
      s.position.set(x, 1.9, z);
      s.rotation.y = ry;
      this.dynamic.add(s);
    }
  }

  // A saída: uma porta na parede do fundo, com placa verde acesa.
  makeExit() {
    const g = new THREE.Group();
    g.position.set(EXIT.x, 0, EXIT.z + WT + 0.01);
    const frame = this.mat(new THREE.MeshStandardMaterial({ color: 0x3a4a48, roughness: 0.6 }));
    const leaf = this.mat(new THREE.MeshStandardMaterial({ color: 0x5a6e6a, roughness: 0.45, metalness: 0.3 }));
    const box = (sx, sy, sz, m, x, y, z) => {
      const geo = new THREE.BoxGeometry(sx, sy, sz);
      this.geos.push(geo);
      const o = new THREE.Mesh(geo, m);
      o.position.set(x, y, z);
      g.add(o);
      return o;
    };
    box(0.1, 2.3, 0.12, frame, -0.6, 1.15, 0);
    box(0.1, 2.3, 0.12, frame, 0.6, 1.15, 0);
    box(1.3, 0.1, 0.12, frame, 0, 2.3, 0);
    this.doorLeaf = box(1.1, 2.2, 0.05, leaf, 0, 1.1, -0.02);
    box(0.05, 0.05, 0.12, frame, 0.42, 1.0, 0.04);
    this.exitTex = textCanvasTex(256, 96, (c, w, h) => {
      c.fillStyle = '#0a7a3a';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#e8fff0';
      c.font = 'bold 50px Arial, Helvetica, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('SAÍDA', w / 2, h / 2 + 3);
    });
    this.texs.push(this.exitTex);
    const sg = new THREE.PlaneGeometry(0.62, 0.24);
    this.geos.push(sg);
    const sign = new THREE.Mesh(sg, this.mat(new THREE.MeshBasicMaterial({ map: this.exitTex, color: new THREE.Color(1.6, 1.6, 1.6) })));
    sign.position.set(0, 2.62, 0.02);
    g.add(sign);
    const l = new THREE.PointLight(0x50ff90, 3, 6, 2);
    l.position.set(0, 2.5, 0.6);
    g.add(l);
    this.dynamic.add(g);
  }

  // Luz: o brilho da água (as luzes mais próximas acompanham o andarilho).
  makeLights() {
    this.hemi = new THREE.HemisphereLight(0xa8e0d8, 0x2a4a34, 1.5);
    this.scene.add(this.hemi);
    this.poolLights = [];
    for (let s = 2; s < this.river.len; s += 7) {
      const p = this.river.at(s);
      this.poolLights.push({ x: p.x, z: p.z });
    }
    this.pls = [];
    const n = this.Q.id === 'low' ? 3 : 5;
    for (let k = 0; k < n; k++) {
      const l = new THREE.PointLight(0x5af0d0, 5.5, 11, 1.5);
      this.dynamic.add(l);
      this.pls.push(l);
    }
    this.ceilLight = new THREE.PointLight(0xd8fff0, 4, 14, 1.4);
    this.dynamic.add(this.ceilLight);
  }

  spawnItems() {
    const g = this.game;
    const list = [
      { type: 'note', key: '122:n1', x: 6.5, z: 11.8, rot: 0.4 },
      { type: 'water', key: '122:w1', x: 8.5, z: -5.5 },
      { type: 'note', key: '122:n2', x: 27.5, z: -22, rot: 1.2 },
      { type: 'note', key: '122:n3', x: 26.5, z: -30.5, rot: 2.2 },
      { type: 'water', key: '122:w2', x: 8.5, z: -58 },
    ];
    for (const it of list) {
      if (this.taken.has(it.key) || !this.isGrass(it.x, it.z)) continue;
      it.y = this.heightAt(it.x, it.z) + 0.03;
      it.light = 0.7;
      g.items.spawn(it, this.dynamic);
    }
  }

  // ------------------------------------------------------------ quadro
  update(dt, player) {
    const g = this.game;
    const p = player.pos;
    const cam = g.camera.position;
    this.time += dt;
    const t = this.time;
    this.waterTime.value = t;
    this.skyTime.value = t;
    if (!this.lastP || Math.hypot(p.x - this.lastP.x, p.z - this.lastP.z) > 2) {
      this.lastP = { x: p.x, z: p.z };
      this.refreshGrass(p.x, p.z);
      // luzes da água mais próximas
      const near = this.poolLights.slice().sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
      this.pls.forEach((l, i) => {
        const q = near[i];
        l.position.set(q.x, 0.35, q.z);
      });
      const R = this.inRoom(p.x, p.z) || ROOMS[0];
      this.ceilLight.position.set((R.x0 + R.x1) / 2, R.H - 0.6, (R.z0 + R.z1) / 2);
    }
    for (const [i, l] of this.pls.entries()) l.intensity = 5.5 + Math.sin(t * 1.3 + i) * 0.6;
    // boias à deriva
    for (const F of this.floats) {
      const s = clamp(F.s0 + Math.sin(t * F.sp + F.ph) * F.amp, 1, this.river.len - 1);
      const q = this.river.at(s);
      F.m.position.set(q.x - q.tz * F.off * 0.6, -0.1 + Math.sin(t * 1.1 + F.ph) * 0.03, q.z + q.tx * F.off * 0.6);
      F.m.rotation.set(Math.sin(t * 0.9 + F.ph) * 0.05, F.rot + t * 0.05, Math.cos(t * 0.8 + F.ph) * 0.05);
    }
    // as flores olham: viram a cabeça devagar até o andarilho, piscam às vezes
    let watching = 0;
    for (const f of this.flowers) {
      const dx = cam.x - f.x;
      const dz = cam.z - f.z;
      const dy = cam.y - f.y;
      const d = Math.hypot(dx, dz);
      const want = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.atan2(dy, d) * 0.9, Math.atan2(dx, dz), 0, 'YXZ'));
      const k = d < 30 ? 1 - Math.exp(-dt / f.lag) : 0;
      f.head.quaternion.slerp(want, k);
      f.head.position.y = f.y + Math.sin(t * 0.6 + f.phase) * 0.04;
      f.tilt.rotation.z = Math.sin(t * 0.3 + f.phase) * 0.08;
      // piscar: o olho encolhe na vertical por um instante
      f.blinkT -= dt;
      if (f.blinkT < 0) {
        f.blinkT = 4 + Math.random() * 9;
        f.blink = 0.18;
      }
      if (f.blink > 0) f.blink -= dt;
      f.eye.scale.set(1, f.blink > 0 ? 0.15 : 1, 1);
      if (d < 12) watching++;
    }
    // andar na água: lento, com respingos
    const inWater = this.river.dist(p.x, p.z) < HW - 0.15;
    this.walkSpeed = damp(this.walkSpeed, inWater ? 1.3 : this.baseWalk, 6, dt);
    if (inWater) {
      if (!this.toldWater) {
        this.toldWater = true;
        g.hud.message('A água é morna e bate na cintura. Brilha por dentro, como se tivesse luz no fundo.', 5);
      }
      this.splashD = (this.splashD || 0) + player.speed * dt;
      if (this.splashD > 0.9) {
        this.splashD = 0;
        g.audio.play('water', { gain: 0.12, rate: 1.3 + Math.random() * 0.3, wet: 0.5 });
      }
    }
    this.sanityExtra = watching > 3 ? 0.08 : -0.15;
    if (t > 4 && !this.toldStart) {
      this.toldStart = true;
      g.hud.message('Piscinas. Grama. Um céu pintado no teto. E flores enormes… que têm olhos.', 6);
    }
    if (watching >= 2 && !this.toldEyes && t > 8) {
      this.toldEyes = true;
      g.hud.message('As flores viram a cabeça quando você passa. Só olham. Nada mais.', 5);
    }
    if (!this.toldLast && this.inRoom(p.x, p.z) === ROOMS[4]) {
      this.toldLast = true;
      g.hud.message('No fundo do último salão, uma porta com a placa verde de SAÍDA.', 4);
    }
  }

  // ------------------------------------------------------------ física
  collide(p, r) {
    for (let it = 0; it < 2; it++) {
      for (const b of this.walls) if (p.x > b[0] - 1 && p.x < b[1] + 1 && p.z > b[2] - 1 && p.z < b[3] + 1) pushCircle(p, r, b[0], b[1], b[2], b[3]);
      for (const c of this.circles) {
        const dx = p.x - c[0];
        const dz = p.z - c[1];
        const d = Math.hypot(dx, dz);
        const rr = r + c[2];
        if (d < rr && d > 1e-4) {
          p.x = c[0] + (dx / d) * rr;
          p.z = c[1] + (dz / d) * rr;
        }
      }
    }
    // nunca fora dos salões (garantia extra)
    if (!this.inRoom(p.x, p.z) && !this.inDoor(p.x, p.z) && this.okP) {
      p.x = this.okP.x;
      p.z = this.okP.z;
    }
    this.okP = { x: p.x, z: p.z };
    return p;
  }

  inDoor(x, z) {
    for (const D of DOORS) {
      if (D.axis === 'z' && Math.abs(z - D.at) < WT + 0.1 && x > D.a && x < D.b) return true;
      if (D.axis === 'x' && Math.abs(x - D.at) < WT + 0.1 && z > D.a && z < D.b) return true;
    }
    return false;
  }

  groundY(x, z) {
    return this.heightAt(x, z);
  }

  surfaceAt(x, z) {
    const d = this.river.dist(x, z);
    if (d < HW + RIM) return 'tile';
    return 'grass';
  }

  los() {
    return true;
  }

  lightLevel() {
    return 0.85;
  }

  interactable(player) {
    const p = player.pos;
    if (!this.leaving && Math.abs(p.x - EXIT.x) < 1.0 && p.z - EXIT.z < 1.8)
      return {
        label: 'Abrir a porta de SAÍDA',
        action: () => {
          const g = this.game;
          this.leaving = true;
          this.doorLeaf.position.x = -0.9;
          g.completeObjective('saida', 'A porta abre. O cheiro de cloro fica para trás.');
          g.reachExit('door', 1.0);
        },
      };
    return null;
  }

  navTarget() {
    return this.exit;
  }

  exitEmitter() {
    return { x: EXIT.x, y: 1.5, z: EXIT.z, sound: 'hum', gain: 0.1 };
  }

  dispose() {
    this.grass.dispose();
    this.bot.dispose();
    for (const m of [...this.grounds, ...this.waters, this.wallMesh]) this.scene.remove(m);
    this.scene.remove(this.dynamic, this.hemi);
    for (const x of this.geos) x.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.texs) t.dispose();
  }
}
