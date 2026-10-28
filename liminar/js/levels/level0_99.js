// Subnível 0.99 — "Anomalia" (classe misteriosa, secreto). Escondido no Nível 4
// (uma porta escura já aberta) e no Nível 12 (uma abertura na parede perto da
// passagem subterrânea). Um lugar enorme e irregular, totalmente liminal:
// salões gigantes com teto alto demais, salas de teto baixo demais, becos
// estreitos a céu aberto entre paredes altíssimas, corredores largos demais ou
// apertados demais, muretas pequenas demais no meio do nada. Tudo em preto e
// branco, com a luz que some de vez em quando. Sem entidades — mas quem fica
// muito tempo começa a alucinar.
import * as THREE from 'three';
import { GeoBuilder } from '../materials.js';
import { pushCircle } from './grid.js';
import { getTex, registerTexture, TEX } from '../textures.js';
import { clamp, damp, lerp, mulberry32, smoothstep, TAU } from '../util.js';

const N = 150; // células de 1 m
const SKY = -1;

registerTexture('l099Tile', (S) => {
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  const n = 8;
  const t = S / n;
  const r = mulberry32(99);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const l = 205 + r() * 25;
      x.fillStyle = `rgb(${l},${l},${l - 4})`;
      x.fillRect(i * t, j * t, t, t);
    }
  x.fillStyle = '#7a7a78';
  const g = Math.max(1.5, S / 200);
  for (let i = 0; i <= n; i++) {
    x.fillRect(i * t - g / 2, 0, g, S);
    x.fillRect(0, i * t - g / 2, S, g);
  }
  return { map: TEX.toTex(c), normalMap: null };
});

export class Level0_99 {
  constructor(game) {
    this.game = game;
    this.Q = game.Q;
    this.scene = game.scene;
    this.indoor = false;
    this.num = 0.99;
    this.camFar = 400;
    this.walkSpeed = 2.2;
    this.flashIntensity = 12;
    this.taken = new Set();
    this.dynamic = new THREE.Group();
    this.scene.add(this.dynamic);
    this.from = game.prevKey;
    this.time = 0;
    this.blur = 0;
    this.sanityExtra = 0;
    this.geos = [];
    this.mats = [];
    this.texs = [];
    this.look = {
      exposure: 1.0,
      tint: [1, 1, 1],
      sat: 0,
      contrast: 1.22,
      lift: [0.012, 0.012, 0.012],
      bloom: 0.22,
      bloomThreshold: 0.95,
      fog: [0.1, 0.1, 0.1],
      lightColor: [1, 1, 1],
      flashlight: false,
      ambience: 'level0_99',
      reverb: 3.0,
      sanityDrain: 0.1,
    };
    this.objectives = [{ id: 'saida', text: 'Encontre a porta de luz branca' }];
    this.fogC = new THREE.Color(...this.look.fog);
    this.scene.fog = new THREE.FogExp2(this.fogC.clone(), 0.02);
    this.scene.background = new THREE.Color(0.2, 0.2, 0.2);
    this.hemi = new THREE.HemisphereLight(0xe0e0e0, 0x6a6a6a, 0.8);
    // luz difusa de céu nublado (pátios e becos a céu aberto)
    this.sky = new THREE.DirectionalLight(0xffffff, 0.7);
    this.sky.position.set(0.3, 1, 0.2);
    this.scene.add(this.hemi, this.sky);
    this.generate();
  }

  // ------------------------------------------------------------ planta
  generate() {
    const r = mulberry32(((this.game.seed ^ 0x0990) >>> 0) || 1);
    this.zoneOf = new Int16Array(N * N).fill(-1);
    this.block = new Float32Array(N * N); // altura de muretas/pilares (0 = nada)
    const Z = (this.zones = []);
    const set = (i, j, z, force) => {
      if (i < 1 || j < 1 || i >= N - 1 || j >= N - 1) return;
      const k = j * N + i;
      if (force || this.zoneOf[k] < 0) this.zoneOf[k] = z;
    };
    // salas
    const KINDS = [
      // [peso, tipo]
      [3, 'hall'],
      [6, 'room'],
      [3, 'low'],
      [2, 'court'],
      [2, 'tallroom'],
    ];
    const pick = () => {
      let s = r() * KINDS.reduce((a, k) => a + k[0], 0);
      for (const k of KINDS) if ((s -= k[0]) < 0) return k[1];
      return 'room';
    };
    const rooms = [];
    for (let t = 0; t < 400 && rooms.length < 26; t++) {
      const kind = rooms.length === 0 ? 'room' : pick();
      let w;
      let d;
      let ceil;
      let wallH = 0;
      if (kind === 'hall') {
        w = 14 + Math.floor(r() * 14);
        d = 14 + Math.floor(r() * 14);
        ceil = 9 + r() * 9;
      } else if (kind === 'room') {
        w = 5 + Math.floor(r() * 6);
        d = 5 + Math.floor(r() * 6);
        ceil = 2.7 + r() * 0.8;
      } else if (kind === 'low') {
        w = 6 + Math.floor(r() * 8);
        d = 6 + Math.floor(r() * 8);
        ceil = 2.02 + r() * 0.08;
      } else if (kind === 'court') {
        w = 10 + Math.floor(r() * 12);
        d = 10 + Math.floor(r() * 12);
        ceil = SKY;
        wallH = r() < 0.5 ? 18 + r() * 14 : 3 + r() * 2;
      } else {
        w = 4 + Math.floor(r() * 4);
        d = 4 + Math.floor(r() * 4);
        ceil = 12 + r() * 10;
      }
      const x0 = 3 + Math.floor(r() * (N - 6 - w));
      const z0 = 3 + Math.floor(r() * (N - 6 - d));
      const ok = rooms.every((o) => x0 > o.x1 + 3 || x0 + w < o.x0 - 3 || z0 > o.z1 + 3 || z0 + d < o.z0 - 3);
      if (!ok) continue;
      const room = { x0, z0, x1: x0 + w, z1: z0 + d, kind, ceil, wallH, floor: kind === 'low' || r() < 0.35 ? 1 : 0, cx: x0 + w / 2, cz: z0 + d / 2 };
      room.id = Z.length;
      Z.push(room);
      rooms.push(room);
    }
    this.rooms = rooms;
    // corredores (antes de marcar as salas, que têm prioridade)
    const corridors = [];
    const STY = [
      () => ({ w: 1, ceil: 2.05, wallH: 0, floor: 0, kind: 'tight' }),
      () => ({ w: 2, ceil: 2.7, wallH: 0, floor: 1, kind: 'corr' }),
      () => ({ w: 5 + Math.floor(r() * 3), ceil: 6 + r() * 3, wallH: 0, floor: 0, kind: 'wide' }),
      () => ({ w: 1 + Math.floor(r() * 2), ceil: SKY, wallH: 16 + r() * 16, floor: 0, kind: 'alley' }),
      () => ({ w: 2, ceil: 11 + r() * 8, wallH: 0, floor: 1, kind: 'tallcorr' }),
    ];
    const connected = [rooms[0]];
    const rest = rooms.slice(1);
    while (rest.length) {
      let best = null;
      for (const a of rest)
        for (const b of connected) {
          const d = Math.hypot(a.cx - b.cx, a.cz - b.cz);
          if (!best || d < best.d) best = { a, b, d };
        }
      rest.splice(rest.indexOf(best.a), 1);
      connected.push(best.a);
      const st = STY[Math.floor(r() * STY.length)]();
      corridors.push({ a: best.a, b: best.b, ...st });
    }
    // alguns laços extras
    for (let k = 0; k < 5; k++) {
      const a = rooms[Math.floor(r() * rooms.length)];
      const b = rooms[Math.floor(r() * rooms.length)];
      if (a !== b) corridors.push({ a, b, ...STY[Math.floor(r() * STY.length)]() });
    }
    for (const c of corridors) {
      const z = Z.length;
      Z.push({ kind: c.kind, ceil: c.ceil, wallH: c.wallH, floor: c.floor });
      const ax = Math.round(c.a.cx);
      const az = Math.round(c.a.cz);
      const bx = Math.round(c.b.cx);
      const bz = Math.round(c.b.cz);
      const h = Math.floor(c.w / 2);
      const first = r() < 0.5;
      const mx = first ? bx : ax;
      const mz = first ? az : bz;
      const seg = (x0, z0, x1, z1) => {
        for (let i = Math.min(x0, x1) - h; i <= Math.max(x0, x1) - h + c.w - 1; i++)
          for (let j = Math.min(z0, z1) - h; j <= Math.max(z0, z1) - h + c.w - 1; j++) set(i, j, z, false);
      };
      seg(ax, az, mx, mz);
      seg(mx, mz, bx, bz);
    }
    // salas por cima
    for (const R of rooms) for (let i = R.x0; i < R.x1; i++) for (let j = R.z0; j < R.z1; j++) set(i, j, R.id, true);
    // por dentro: pilares nos salões, muretas pequenas demais, paredes soltas
    for (const R of rooms) {
      const w = R.x1 - R.x0;
      const d = R.z1 - R.z0;
      if (R.kind === 'hall' && r() < 0.7) {
        const s = 5 + Math.floor(r() * 3);
        for (let i = R.x0 + s; i < R.x1 - 2; i += s) for (let j = R.z0 + s; j < R.z1 - 2; j += s) this.block[j * N + i] = 99;
      }
      if (R.kind === 'hall' || R.kind === 'court') {
        const n = 2 + Math.floor(r() * 4);
        for (let k = 0; k < n; k++) {
          const len = 3 + Math.floor(r() * 6);
          const hh = r() < 0.6 ? 0.5 + r() * 0.8 : 2.4 + r() * 1.5;
          const alongX = r() < 0.5;
          const i0 = R.x0 + 2 + Math.floor(r() * Math.max(1, w - 4 - (alongX ? len : 0)));
          const j0 = R.z0 + 2 + Math.floor(r() * Math.max(1, d - 4 - (alongX ? 0 : len)));
          for (let q = 0; q < len; q++) {
            const i = alongX ? i0 + q : i0;
            const j = alongX ? j0 : j0 + q;
            if (i < R.x1 - 1 && j < R.z1 - 1) this.block[j * N + i] = hh;
          }
        }
      }
      if (R.kind === 'room' && r() < 0.4) {
        // uma parede baixinha atravessando a sala sem motivo
        const j = R.z0 + Math.floor(d / 2);
        for (let i = R.x0 + 1; i < R.x1 - 1; i++) this.block[j * N + i] = 0.9;
      }
    }
    // começo e saída: as salas mais distantes entre si
    const start = rooms[0];
    let far = rooms[1];
    for (const R of rooms) if (Math.hypot(R.cx - start.cx, R.cz - start.cz) > Math.hypot(far.cx - start.cx, far.cz - start.cz)) far = R;
    const clear = (x, z) => {
      for (let i = Math.floor(x) - 1; i <= Math.floor(x) + 1; i++) for (let j = Math.floor(z) - 1; j <= Math.floor(z) + 1; j++) this.block[j * N + i] = 0;
    };
    this.spawn = { x: Math.floor(start.cx) + 0.5, z: Math.floor(start.cz) + 0.5, yaw: Math.atan2(-(far.cx - start.cx), -(far.cz - start.cz)) };
    clear(this.spawn.x, this.spawn.z);
    this.exitRoom = far;
    this.door = { x: Math.floor(far.cx) + 0.5, z: Math.floor(far.cz) + 0.5 };
    clear(this.door.x, this.door.z);
    clear(this.door.x, this.door.z + 1);
    clear(this.door.x, this.door.z - 1);
    this.exit = { x: this.door.x, z: this.door.z + 1 };
  }

  zone(i, j) {
    if (i < 0 || j < 0 || i >= N || j >= N) return null;
    const z = this.zoneOf[j * N + i];
    return z < 0 ? null : this.zones[z];
  }

  solid(i, j) {
    if (i < 0 || j < 0 || i >= N || j >= N) return true;
    return this.zoneOf[j * N + i] < 0 || this.block[j * N + i] > 0;
  }

  topOf(z) {
    return z.ceil === SKY ? z.wallH : z.ceil;
  }

  // ------------------------------------------------------------ geometria
  async preload(px, pz, progress) {
    progress(0.2);
    this.build();
    progress(0.7);
    await new Promise((r) => setTimeout(r, 0));
    this.makeDoor();
    this.makeLights();
    this.makeFigure();
    progress(1);
  }

  build() {
    const S = this.Q.tex;
    const gWall = new GeoBuilder();
    const gFloor = [new GeoBuilder(), new GeoBuilder()];
    const gCeil = new GeoBuilder();
    const gBlock = new GeoBuilder();
    const gLamp = new GeoBuilder();
    const W1 = [1, 1, 1];
    const shade = (y, top) => {
      const k = 0.5 + 0.5 * smoothstep(0, 2.2, y);
      return [k * (top ? 1 : 1), k, k];
    };
    // faces verticais: (ax,az)->(bx,bz), de y0 a y1, normal n
    const vq = (gb, ax, az, bx, bz, y0, y1, n, along0) => {
      const L = Math.hypot(bx - ax, bz - az);
      const c0 = shade(y0);
      const c1 = shade(y1);
      gb.quad(
        [
          [ax, y0, az],
          [bx, y0, bz],
          [bx, y1, bz],
          [ax, y1, az],
        ],
        n,
        [along0 / 2, y0 / 2, (along0 + L) / 2, y0 / 2, (along0 + L) / 2, y1 / 2, along0 / 2, y1 / 2],
        null,
        [c0, c0, c1, c1],
      );
    };
    // pisos e tetos (corridas por linha)
    for (let j = 0; j < N; j++) {
      let i = 0;
      while (i < N) {
        const z = this.zone(i, j);
        if (!z) {
          i++;
          continue;
        }
        let e = i + 1;
        while (e < N && this.zone(e, j) && this.zone(e, j).floor === z.floor) e++;
        gFloor[z.floor].quad(
          [
            [i, 0, j + 1],
            [e, 0, j + 1],
            [e, 0, j],
            [i, 0, j],
          ],
          [0, 1, 0],
          [i / 2, (j + 1) / 2, e / 2, (j + 1) / 2, e / 2, j / 2, i / 2, j / 2],
          null,
          [W1, W1, W1, W1],
        );
        i = e;
      }
      i = 0;
      while (i < N) {
        const z = this.zone(i, j);
        if (!z || z.ceil === SKY) {
          i++;
          continue;
        }
        let e = i + 1;
        while (e < N && this.zone(e, j) && this.zone(e, j).ceil === z.ceil) e++;
        const h = z.ceil;
        const c = [0.8, 0.8, 0.8];
        gCeil.quad(
          [
            [i, h, j],
            [e, h, j],
            [e, h, j + 1],
            [i, h, j + 1],
          ],
          [0, -1, 0],
          [i / 2, j / 2, e / 2, j / 2, e / 2, (j + 1) / 2, i / 2, (j + 1) / 2],
          null,
          [c, c, c, c],
        );
        // laje vista de cima (dos pátios a céu aberto)
        gCeil.quad(
          [
            [i, h + 0.3, j + 1],
            [e, h + 0.3, j + 1],
            [e, h + 0.3, j],
            [i, h + 0.3, j],
          ],
          [0, 1, 0],
          [0, 0, 0, 0, 0, 0, 0, 0],
          null,
          [c, c, c, c],
        );
        i = e;
      }
    }
    // paredes, uma face por borda de célula
    const dirs = [
      [1, 0, [-1, 0, 0]],
      [-1, 0, [1, 0, 0]],
      [0, 1, [0, 0, -1]],
      [0, -1, [0, 0, 1]],
    ];
    const lamps = [];
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const z = this.zone(i, j);
        if (!z) continue;
        const top = this.topOf(z);
        for (const [dx, dz, n] of dirs) {
          const nz = this.zone(i + dx, j + dz);
          let y0 = -1;
          if (!nz) y0 = 0;
          else if (nz.ceil !== SKY && nz.ceil < top - 0.01) y0 = nz.ceil;
          if (y0 < 0) continue;
          // borda entre (i,j) e o vizinho
          let ax;
          let az;
          let bx;
          let bz;
          if (dx === 1) [ax, az, bx, bz] = [i + 1, j, i + 1, j + 1];
          else if (dx === -1) [ax, az, bx, bz] = [i, j + 1, i, j];
          else if (dz === 1) [ax, az, bx, bz] = [i + 1, j + 1, i, j + 1];
          else [ax, az, bx, bz] = [i, j, i + 1, j];
          vq(gWall, ax, az, bx, bz, y0, top, n, dx ? j : i);
        }
        // luminárias no teto
        if (z.ceil !== SKY && i % 5 === 2 && j % 6 === 3) {
          const h = z.ceil - 0.01;
          const L = [2.2, 2.2, 2.2];
          gLamp.quad(
            [
              [i - 0.3, h, j - 0.6],
              [i + 0.3, h, j - 0.6],
              [i + 0.3, h, j + 0.6],
              [i - 0.3, h, j + 0.6],
            ],
            [0, -1, 0],
            [0, 0, 1, 0, 1, 1, 0, 1],
            null,
            [L, L, L, L],
          );
          lamps.push({ x: i, z: j, y: h, dead: (i * 7 + j * 13) % 11 === 0 });
        }
        // muretas e pilares
        const bh = this.block[j * N + i];
        if (bh > 0) {
          const hh = Math.min(bh, top);
          for (const [dx, dz, n] of dirs) {
            if (this.block[(j + dz) * N + (i + dx)] >= bh && !this.solidZone(i + dx, j + dz)) continue;
            let ax;
            let az;
            let bx;
            let bz;
            if (dx === 1) [ax, az, bx, bz] = [i + 1, j + 1, i + 1, j];
            else if (dx === -1) [ax, az, bx, bz] = [i, j, i, j + 1];
            else if (dz === 1) [ax, az, bx, bz] = [i, j + 1, i + 1, j + 1];
            else [ax, az, bx, bz] = [i + 1, j, i, j];
            vq(gBlock, ax, az, bx, bz, 0, hh, [-n[0], 0, -n[2]], dx ? j : i);
          }
          if (hh < top) {
            const c = [1, 1, 1];
            gBlock.quad(
              [
                [i, hh, j + 1],
                [i + 1, hh, j + 1],
                [i + 1, hh, j],
                [i, hh, j],
              ],
              [0, 1, 0],
              [0, 0, 0.5, 0, 0.5, 0.5, 0, 0.5],
              null,
              [c, c, c, c],
            );
          }
        }
      }
    this.lamps = lamps;
    // materiais
    const dw = getTex('concrete', S);
    const pl = getTex('drywall', S);
    const cf = getTex('concreteFloor', S);
    const tl = getTex('l099Tile', S);
    const ce = getTex('ceiling', S);
    this.warpU = { uWarp: { value: 0 }, uTime: { value: 0 } };
    const warp = (m) => {
      m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, this.warpU);
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float uWarp;\nuniform float uTime;')
          .replace(
            '#include <begin_vertex>',
            `vec3 transformed = vec3( position );
            float wv = sin( position.y * 0.9 + uTime * 1.3 + position.x * 0.2 ) * sin( position.z * 0.3 + uTime * 0.7 );
            transformed.xz += normal.xz * wv * uWarp * smoothstep( 0.3, 2.0, position.y );`,
          );
      };
      return m;
    };
    const wallM = this.mat(warp(new THREE.MeshStandardMaterial({ map: dw.map, normalMap: this.Q.normalMaps ? dw.normalMap : null, vertexColors: true, roughness: 0.9, color: 0xf0f0f0, emissive: 0x3a3a3a })));
    this.wallM = wallM;
    const blockM = this.mat(new THREE.MeshStandardMaterial({ map: pl.map, vertexColors: true, roughness: 0.9, color: 0xd8d8d8 }));
    const floorM = [this.mat(new THREE.MeshStandardMaterial({ map: cf.map, roughness: 0.85, color: 0xe0e0e0 })), this.mat(new THREE.MeshStandardMaterial({ map: tl.map, roughness: 0.3, color: 0xffffff }))];
    const ceilM = this.mat(new THREE.MeshStandardMaterial({ map: ce.map, vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }));
    this.lampMat = this.mat(new THREE.MeshBasicMaterial({ vertexColors: true }));
    const add = (gb, m) => {
      if (gb.empty) return;
      const mesh = new THREE.Mesh(gb.build(), m);
      mesh.matrixAutoUpdate = false;
      this.geos.push(mesh.geometry);
      this.scene.add(mesh);
      (this.meshes = this.meshes || []).push(mesh);
    };
    add(gWall, wallM);
    add(gBlock, blockM);
    add(gFloor[0], floorM[0]);
    add(gFloor[1], floorM[1]);
    add(gCeil, ceilM);
    add(gLamp, this.lampMat);
  }

  solidZone(i, j) {
    return !this.zone(i, j);
  }

  mat(m) {
    this.mats.push(m);
    return m;
  }

  // A saída: uma porta solta no meio da última sala, cheia de luz branca.
  makeDoor() {
    const d = this.door;
    const g = new THREE.Group();
    g.position.set(d.x, 0, d.z);
    const frame = this.mat(new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.6 }));
    const light = this.mat(new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3), side: THREE.DoubleSide }));
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.3, 0.18), frame);
      p.position.set(s * 0.6, 1.15, 0);
      g.add(p);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.12, 0.18), frame);
    top.position.y = 2.3;
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 2.24), light);
    pane.position.y = 1.12;
    g.add(top, pane);
    g.traverse((o) => o.geometry && this.geos.push(o.geometry));
    this.doorLight = new THREE.PointLight(0xffffff, 10, 14, 1.5);
    this.doorLight.position.set(0, 1.4, 0.8);
    g.add(this.doorLight);
    this.dynamic.add(g);
    this.doorG = g;
  }

  // Poucas luzes de verdade: as luminárias mais próximas do andarilho.
  makeLights() {
    this.pls = [];
    for (let k = 0; k < 6; k++) {
      const l = new THREE.PointLight(0xffffff, 0, 11, 1.5);
      this.dynamic.add(l);
      this.pls.push(l);
    }
    this.power = 1;
    this.darkT = 25;
  }

  // Figura da alucinação: alguém parado, alto demais.
  makeFigure() {
    const m = this.mat(new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0, depthWrite: false }));
    this.figMat = m;
    const g = new THREE.Group();
    const add = (geo, x, y, z) => {
      const o = new THREE.Mesh(geo, m);
      o.position.set(x, y, z);
      g.add(o);
      this.geos.push(geo);
    };
    add(new THREE.CylinderGeometry(0.17, 0.24, 1.9, 8), 0, 1.25, 0);
    add(new THREE.SphereGeometry(0.16, 10, 8), 0, 2.38, 0);
    for (const s of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), s * 0.29, 1.3, 0);
      add(new THREE.CylinderGeometry(0.07, 0.07, 0.6, 6), s * 0.09, 0.3, 0);
    }
    g.visible = false;
    this.dynamic.add(g);
    this.fig = { g, on: false, a: 0 };
  }

  // Linha de visão pela grade (paredes cheias bloqueiam; muretas baixas não).
  los(x0, z0, x1, z1) {
    const d = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.ceil(d * 2);
    for (let k = 1; k < n; k++) {
      const t = k / n;
      const i = Math.floor(lerp(x0, x1, t));
      const j = Math.floor(lerp(z0, z1, t));
      if (!this.zone(i, j) || this.block[j * N + i] > 1.7) return false;
    }
    return true;
  }

  spawnFigure(player) {
    const p = player.pos;
    for (let t = 0; t < 30; t++) {
      const a = player.yaw + (Math.random() - 0.5) * 1.4;
      const d = 9 + Math.random() * 16;
      const x = p.x - Math.sin(a) * d;
      const z = p.z - Math.cos(a) * d;
      if (this.solid(Math.floor(x), Math.floor(z)) || !this.los(p.x, p.z, x, z)) continue;
      Object.assign(this.fig, { on: true, a: 0, t: 0, look: 0 });
      this.fig.g.position.set(x, 0, z);
      this.fig.g.visible = true;
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------ quadro
  update(dt, player) {
    const g = this.game;
    const p = player.pos;
    this.time += dt;
    const t = this.time;
    // quanto tempo aqui → alucinações (começa em ~1 min, máximo em ~5 min)
    const k = clamp((t - 60) / 240, 0, 1);
    this.k = k;
    // apagões momentâneos
    this.darkT -= dt;
    if (this.darkT <= 0) {
      if (this.power > 0.5) {
        this.power = 0;
        this.darkT = 1.2 + Math.random() * (2 + k * 3);
        g.audio.powerDown();
        if (!this.toldDark) {
          this.toldDark = true;
          g.hud.message('A luz some. Tudo preto. Fique parado.', 3);
        }
      } else {
        this.power = 1;
        this.darkT = 14 + Math.random() * 20 - k * 8;
        g.audio.powerUp();
        if (k > 0.25 && Math.random() < 0.6) this.spawnFigure(player);
      }
    }
    this.pw = damp(this.pw ?? 1, this.power, this.power ? 3 : 12, dt);
    const flick = this.power ? 1 - (Math.sin(t * 37) > 0.97 ? 0.5 : 0) : 0;
    const pw = this.pw * flick;
    this.hemi.intensity = 0.06 + 0.75 * pw;
    this.sky.intensity = 0.7 * pw;
    this.wallM.emissive.setScalar(0.02 + 0.11 * pw);
    this.lampMat.color.setScalar(0.05 + pw * 0.95);
    this.scene.background.setScalar(0.03 + 0.2 * pw);
    this.scene.fog.color.setScalar(0.02 + 0.1 * pw);
    // luzes mais próximas
    if ((this.plT = (this.plT || 0) - dt) <= 0) {
      this.plT = 0.4;
      const near = this.lamps
        .filter((l) => !l.dead && Math.abs(l.x - p.x) < 16 && Math.abs(l.z - p.z) < 16)
        .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))
        .slice(0, this.pls.length);
      this.pls.forEach((l, i) => {
        const L = near[i];
        l.visible = !!L;
        if (L) {
          // nos salões altos a luz alcança o chão de qualquer jeito
          l.position.set(L.x, L.y - 0.3, L.z);
          l.distance = 11 + L.y * 1.6;
          l.userData.k = 1 + Math.max(0, L.y - 3) * 0.35;
        }
      });
    }
    for (const l of this.pls) l.intensity = 7 * pw * (l.userData.k || 1);
    this.doorLight.intensity = 10 * (0.3 + 0.7 * pw);
    // paredes "respiram", vista embaça
    this.warpU.uTime.value = t;
    this.warpU.uWarp.value = k * 0.18;
    this.blur = k * 0.25 + (k > 0.5 ? Math.max(0, Math.sin(t * 0.6)) * 0.2 : 0);
    this.sanityExtra = 0.05 + k * 0.6;
    // alucinações
    const F = this.fig;
    if (F.on) {
      F.t += dt;
      const dx = F.g.position.x - p.x;
      const dz = F.g.position.z - p.z;
      const d = Math.hypot(dx, dz);
      const fx = -Math.sin(player.yaw);
      const fz = -Math.cos(player.yaw);
      const watched = (dx * fx + dz * fz) / Math.max(d, 0.01) > 0.93;
      F.look = watched ? F.look + dt : 0;
      const gone = d < 5 || F.look > 0.7 || F.t > 10 || this.power < 0.5;
      F.a = damp(F.a, gone ? 0 : 0.9, gone ? 9 : 1.5, dt);
      this.figMat.opacity = F.a;
      F.g.lookAt(p.x, 0, p.z);
      if (gone && F.a < 0.03) {
        F.on = false;
        F.g.visible = false;
        if (F.look > 0.7 || d < 5) {
          g.glitch = Math.max(g.glitch, 0.5);
          g.audio.play('whisper', { gain: 0.15, rate: 0.6, wet: 1.4 });
        }
      }
    } else if (k > 0 && Math.random() < dt * (0.01 + k * 0.05)) this.spawnFigure(player);
    if (k > 0 && Math.random() < dt * k * 0.15) g.glitch = Math.max(g.glitch, 0.2 + Math.random() * 0.3);
    if (k > 0.2 && Math.random() < dt * 0.03) g.audio.play(Math.random() < 0.5 ? 'knock' : 'whisper', { gain: 0.08 + k * 0.1, rate: 0.6 + Math.random() * 0.4, pan: Math.random() * 2 - 1, wet: 1.8 });
    // avisos
    if (t > 4 && !this.told0) {
      this.told0 = true;
      g.hud.message('Tudo sem cor. Salas grandes demais, corredores apertados demais. Nada aqui tem a medida certa.', 6);
    }
    if (t > 90 && !this.told1) {
      this.told1 = true;
      g.hud.message('Você está aqui há tempo demais. Os cantos dos olhos começam a mentir.', 5);
    }
    if (t > 200 && !this.told2) {
      this.told2 = true;
      g.hud.message('As paredes respiram. Saia daqui.', 4);
    }
    // a porta de luz
    const d = this.door;
    if (!this.leaving && Math.abs(p.x - d.x) < 0.5 && Math.abs(p.z - d.z) < 0.25) this.leave();
  }

  leave() {
    const g = this.game;
    this.leaving = true;
    g.completeObjective('saida', 'Luz branca. Quando ela passa, as cores voltam.');
    const to = this.from === '12' ? '12.2' : '5';
    g.enterLevel(to, 'none', 0.3);
  }

  // ------------------------------------------------------------ física
  collide(p, r) {
    for (let it = 0; it < 2; it++) {
      const i0 = Math.floor(p.x - r) - 1;
      const j0 = Math.floor(p.z - r) - 1;
      for (let j = j0; j <= j0 + 3; j++) for (let i = i0; i <= i0 + 3; i++) if (this.solid(i, j)) pushCircle(p, r, i, i + 1, j, j + 1);
    }
    return p;
  }

  groundY() {
    return 0;
  }

  surfaceAt(x, z) {
    const zz = this.zone(Math.floor(x), Math.floor(z));
    return zz && zz.floor ? 'tile' : 'concrete';
  }

  lightLevel() {
    return 0.15 + 0.6 * (this.pw ?? 1);
  }

  interactable() {
    return null;
  }

  navTarget() {
    return this.exit;
  }

  exitEmitter() {
    return { x: this.door.x, y: 1.4, z: this.door.z, sound: 'hum', gain: 0.2 };
  }

  dispose() {
    for (const m of this.meshes || []) this.scene.remove(m);
    this.scene.remove(this.dynamic, this.hemi, this.sky);
    for (const x of this.geos) x.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.texs) t.dispose();
  }
}

// ------------------------------------------------------------ entradas
// Uma passagem para o 0.99: um vão preto (com ou sem porta aberta) que
// engole quem atravessa. Usado nos Níveis 4 e 12.
export class VoidPortal {
  // axis 'x': o vão fica numa parede ao longo de x (normal em z).
  constructor(level, x, z, { w = 0.95, h = 2.1, slab = true, ragged = false } = {}) {
    this.L = level;
    this.x = x;
    this.z = z;
    this.w = w;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    this.black = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
    this.mats = [this.black];
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.02, h), this.black);
    pane.position.y = h / 2;
    g.add(pane);
    if (slab) {
      // a porta, escura, já aberta para dentro do escuro
      const dm = new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 0.6 });
      this.mats.push(dm);
      const piv = new THREE.Group();
      piv.position.set(-w / 2, 0, 0.03);
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(w - 0.02, h - 0.02, 0.05), dm);
      leaf.position.set((w - 0.02) / 2, h / 2, 0);
      piv.add(leaf);
      piv.rotation.y = 1.25;
      g.add(piv);
    }
    if (ragged) {
      // bordas rasgadas: pedaços escuros irregulares em volta do vão
      const r = mulberry32(990);
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * TAU;
        const s = 0.12 + r() * 0.22;
        const geo = new THREE.PlaneGeometry(s, s * (0.6 + r()));
        const off = (level.T || 0.16) / 2 + 0.006;
        for (const side of [-1, 1]) {
          const m = new THREE.Mesh(geo, this.black);
          m.position.set(Math.cos(a) * (w / 2 + 0.06), h / 2 + Math.sin(a) * (h / 2 + 0.06), side * off);
          m.rotation.z = r() * 3;
          g.add(m);
        }
      }
    }
    this.geos = [];
    g.traverse((o) => o.geometry && !this.geos.includes(o.geometry) && this.geos.push(o.geometry));
    level.dynamic.add(g);
    this.g = g;
  }

  // Devolve true quando o andarilho atravessa o vão.
  crossed(p) {
    return Math.abs(p.x - this.x) < this.w / 2 && Math.abs(p.z - this.z) < 0.2;
  }

  near(p, d = 6) {
    return Math.hypot(p.x - this.x, p.z - this.z) < d;
  }

  dispose() {
    for (const m of this.mats) m.dispose();
    for (const g of this.geos || []) g.dispose();
  }
}
