// Nível 1 — "Zona Habitável": armazém de concreto colossal, pilares, caixas,
// canos e luminárias penduradas. Há zonas sem luz onde os Sorridentes vivem,
// e às vezes a energia cai por alguns segundos.
// Saída: porta de metal com placa verde de SAÍDA.
import * as THREE from 'three';
import { GridLevel, W, EH } from './grid.js';
import { getTex, indoorEnvTex, exitSignTex } from '../textures.js';
import { panelMaterial } from '../materials.js';
import { fbm, hash3, mulberry32, TAU } from '../util.js';

const WHITE = [1, 1, 1];

export class Level1 extends GridLevel {
  constructor(game) {
    super(game, {
      cell: 6,
      H: 5,
      T: 0.3,
      doorW: 2.6,
      doorH: 3.4,
      chunkCells: 5,
      seed: (game.seed ^ 0x1111) >>> 0,
      lightRadius: 14,
      lightEmitPow: 0.4,
      bounce: 0.3,
      ambient: 0.004,
      wallUV: [2.4, 2.4],
      floorUV: 3,
      ceilUV: 3,
      lmDensity: 0.75,
    });
    this.num = 1;
    this.surface = 'concrete';
    this.panelI = 9;
    this.flickerGap = 5;
    this.outage = { t: 50 + Math.random() * 40, on: 0 };
    const S = this.Q.tex;
    const cw = getTex('concrete', S);
    const cf = getTex('concreteFloor', S);
    const sl = getTex('slab', S);
    const pn = getTex('panel', S);
    const gr = getTex('grime', S);
    const env = game.makeEnv(indoorEnvTex(['#3d4246', '#26292c', '#1a1c1e'], '#f4fbff', 5));
    this.mats = {
      floor: {
        map: cf.map,
        normalMap: cf.normalMap,
        roughnessMap: cf.roughnessMap,
        roughness: 1,
        dirtColor: new THREE.Color(0.55, 0.55, 0.53),
        dirtAmt: 0.5,
        wet: 1,
        envMap: env,
        envIntensity: 1,
        lambertEnv: 0.15,
      },
      wall: { map: cw.map, normalMap: cw.normalMap, roughness: 0.9, vertexColors: true, envMap: env, envIntensity: 0.2 },
      ceil: { map: sl.map, roughness: 1, lmIntensity: 0.28, vertexColors: true },
      prop: { map: gr.map, normalMap: gr.normalMap, vertexColors: true, roughness: 0.75, envMap: env, envIntensity: 0.5 },
    };
    this.panelMat = panelMaterial(pn.map, 0xeef6ff);
    this.look = {
      exposure: 0.95,
      tint: [0.95, 1.0, 1.04],
      sat: 0.82,
      contrast: 1.08,
      lift: [0.006, 0.008, 0.012],
      bloom: 0.2,
      fog: [0.07, 0.078, 0.086],
      fogNear: 0.15,
      lightColor: [0.92, 0.97, 1.0],
      flashlight: true,
      ambience: 'level1',
      reverb: 4.5,
      sanityDrain: 0.18,
      smilers: true,
    };
    this.route();
  }

  zone(x, z) {
    return fbm(x * 0.09, z * 0.09, 3, this.seed + 4);
  }

  genEdge(kind, ix, iz) {
    const z = this.zone(ix, iz);
    const p = z > 0.25 ? 0.12 : 0.3;
    const h = hash3(ix * 2 + kind, iz, this.seed);
    if (h >= p) return W.NONE;
    const t = hash3(ix, iz * 3 + kind, this.seed + 7);
    if (t < 0.42) return W.DOOR;
    if (t < 0.5) return W.HALF_A;
    if (t < 0.58) return W.HALF_B;
    return W.FULL;
  }

  pillar() {
    return 0.62;
  }

  dark(cx, cz) {
    return fbm(cx * 0.11 + 50, cz * 0.11, 3, this.seed + 8) < -0.17;
  }

  genLight(cx, cz) {
    const c = this.cell;
    const h = this.hashCell(cx, cz, 3);
    let group = 0;
    if (this.dark(cx, cz)) group = h < 0.88 ? 3 : 1;
    else if (h < 0.07) group = 3;
    else if (h < 0.15) group = 1;
    else if (h < 0.22) group = 2;
    const ax = (cz & 1) === 0 ? 0 : 1;
    return { x: cx * c + c / 2, z: cz * c + c / 2, y: 3.9, ax, len: 1.3, wid: 0.3, I: 15, group };
  }

  dirt(x, z) {
    const n = fbm(x * 0.12, z * 0.12, 3, this.seed + 11);
    const t = (n - 0.08) / 0.22;
    return t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
  }

  // Luminária pendurada por correntes com dois tubos.
  buildLight(G, L) {
    const len = L.len;
    const y = L.y;
    const along = L.ax === 0;
    G.prop.box(L.x, y + 0.07, L.z, along ? len + 0.12 : 0.3, 0.09, along ? 0.3 : len + 0.12, [0.36, 0.37, 0.38], G.lm, { ao: 0 });
    for (const s of [-1, 1]) {
      const ox = along ? s * len * 0.4 : 0;
      const oz = along ? 0 : s * len * 0.4;
      const h = this.H - y - 0.11;
      G.prop.box(L.x + ox, y + 0.11 + h / 2, L.z + oz, 0.03, h, 0.03, [0.18, 0.18, 0.18], G.lm, { ao: 0 });
    }
    for (const s of [-1, 1]) {
      const ox = along ? 0 : s * 0.07;
      const oz = along ? s * 0.07 : 0;
      G.panel.cylinder(L.x + ox, y, L.z + oz, 0.022, len, WHITE, null, {
        axis: along ? 'x' : 'z',
        sides: 6,
        caps: false,
        uvConst: true,
        group: L.group,
      });
    }
  }

  genProps(ch, cx0, cz0) {
    const N = this.chunkCells;
    const c = this.cell;
    const dens = this.Q.props;
    for (let z = cz0; z < cz0 + N; z++) {
      for (let x = cx0; x < cx0 + N; x++) {
        if (Math.abs(x) + Math.abs(z) < 2) continue;
        if (this.exitCell && x === this.exitCell[0] && z === this.exitCell[1]) continue;
        for (let q = 0; q < 4; q++) {
          const h = this.hashCell(x, z, 40 + q);
          if (h > 0.33 * dens) continue;
          const sx = q & 1 ? 1 : -1;
          const sz = q & 2 ? 1 : -1;
          const px = x * c + c / 2 + sx * (1.7 + this.hashCell(x, z, 50 + q) * 0.5);
          const pz = z * c + c / 2 + sz * (1.7 + this.hashCell(x, z, 60 + q) * 0.5);
          const kind = Math.floor(this.hashCell(x, z, 70 + q) * 5);
          const rot = this.hashCell(x, z, 80 + q) < 0.5 ? 0 : Math.PI / 2;
          this.addProp(ch, kind, px, pz, rot, this.hashCell(x, z, 90 + q));
        }
        if (this.hashCell(x, z, 21) < 0.02) {
          ch.items.push({ type: 'water', key: `1:${x}:${z}:w`, x: x * c + c / 2 + 0.8, z: z * c + c / 2 - 0.6 });
        }
      }
    }
    if (hash3(ch.cx, ch.cz, this.seed + 31) < 0.35) {
      const x = cx0 + Math.floor(hash3(ch.cx, ch.cz, this.seed + 32) * N);
      const z = cz0 + Math.floor(hash3(ch.cx, ch.cz, this.seed + 33) * N);
      ch.items.push({ type: 'note', key: `1:${ch.cx}:${ch.cz}:n`, x: x * c + c / 2 - 0.5, z: z * c + c / 2 + 0.4, rot: hash3(x, z, 5) * TAU });
    }
  }

  addProp(ch, kind, x, z, rot, r) {
    const blocker = (hx, hz) => {
      const ex = rot ? hz : hx;
      const ez = rot ? hx : hz;
      ch.colliders.push([x - ex, x + ex, z - ez, z + ez]);
      return [x - ex, x + ex, z - ez, z + ez, 0];
    };
    if (kind === 0) {
      // pilha de caixotes de madeira
      const n = 1 + Math.floor(r * 3);
      const wood = [0.58, 0.44, 0.29];
      ch.props.push({
        ao: blocker(0.6, 0.6),
        draw: (G) => {
          for (let i = 0; i < n; i++) {
            const s = 1.1 - i * 0.12;
            const k = 0.9 + ((i * 7) % 3) * 0.06;
            G.prop.box(x + (i % 2) * 0.06, s / 2 + i * 1.02, z, s, s, s, [wood[0] * k, wood[1] * k, wood[2] * k], G.lm, { rot: rot + i * 0.2, uvScale: 0.5, floorY: 0 });
          }
        },
      });
    } else if (kind === 1) {
      // palete com caixas de papelão
      const card = [0.62, 0.48, 0.3];
      ch.props.push({
        ao: blocker(0.65, 0.55),
        draw: (G) => {
          G.prop.box(x, 0.07, z, 1.25, 0.14, 1.05, [0.5, 0.4, 0.28], G.lm, { rot });
          for (let i = 0; i < 4; i++) {
            const lx = i & 1 ? 0.3 : -0.3;
            const lz = i & 2 ? 0.25 : -0.25;
            const px = x + (rot ? lz : lx);
            const pz = z + (rot ? lx : lz);
            const k = 0.9 + ((i * 5) % 3) * 0.05;
            G.prop.box(px, 0.14 + 0.25, pz, 0.56, 0.5, 0.46, [card[0] * k, card[1] * k, card[2] * k], G.lm, { rot, uvScale: 0.5 });
          }
          if (r > 0.5) G.prop.box(x, 0.64 + 0.22, z, 0.5, 0.44, 0.4, card, G.lm, { rot: rot + 0.3, uvScale: 0.5 });
        },
      });
    } else if (kind === 2) {
      // tambores
      const cols = [
        [0.12, 0.22, 0.48],
        [0.45, 0.22, 0.12],
        [0.38, 0.4, 0.42],
      ];
      const col = cols[Math.floor(r * 3)];
      ch.props.push({
        ao: blocker(0.75, 0.4),
        draw: (G) => {
          for (let i = 0; i < 3; i++) {
            const o = (i - 1) * 0.62;
            G.prop.cylinder(x + (rot ? 0 : o), 0.45, z + (rot ? o : 0), 0.29, 0.9, col, G.lm, { sides: 12 });
          }
        },
      });
    } else if (kind === 3) {
      // estante metálica com caixas
      ch.props.push({
        ao: blocker(1.3, 0.45),
        draw: (G) => {
          const ux = rot ? 0 : 1;
          const uz = rot ? 1 : 0;
          const orange = [0.72, 0.32, 0.08];
          for (const a of [-1.25, 1.25]) {
            for (const b of [-0.4, 0.4]) {
              G.prop.box(x + ux * a + uz * b, 1.3, z + uz * a + ux * b, 0.07, 2.6, 0.07, orange, G.lm, {});
            }
          }
          for (const y of [0.15, 1.0, 1.85, 2.55]) {
            G.prop.box(x, y, z, rot ? 0.9 : 2.6, 0.05, rot ? 2.6 : 0.9, [0.4, 0.42, 0.44], G.lm, { ao: 0 });
            if (y < 2.5) {
              for (let i = 0; i < 3; i++) {
                if (hash3(i, Math.floor(y * 10), Math.floor(r * 1000)) < 0.35) continue;
                const o = (i - 1) * 0.8;
                const k = 0.85 + i * 0.05;
                G.prop.box(x + ux * o, y + 0.2, z + uz * o, 0.6, 0.36, 0.5, [0.6 * k, 0.47 * k, 0.3 * k], G.lm, { rot, uvScale: 0.5 });
              }
            }
          }
        },
      });
    } else {
      // entulho: blocos de concreto e barras
      ch.props.push({
        ao: [x - 0.6, x + 0.6, z - 0.6, z + 0.6, 0],
        draw: (G) => {
          for (let i = 0; i < 4; i++) {
            const a = r * 10 + i * 1.7;
            G.prop.box(x + Math.cos(a) * 0.45, 0.1, z + Math.sin(a) * 0.45, 0.4, 0.2, 0.2, [0.5, 0.5, 0.48], G.lm, { rot: a });
          }
          G.prop.box(x, 0.03, z, 1.6, 0.03, 0.03, [0.3, 0.2, 0.14], G.lm, { rot: r * 3 });
        },
      });
    }
  }

  // Canos e eletrodutos atravessando o teto.
  buildExtra(G, ch, cx0, cz0) {
    const c = this.cell;
    const S = this.S;
    const N = this.chunkCells;
    for (let z = cz0; z < cz0 + N; z++) {
      if (hash3(z, 1, this.seed + 61) > 0.3) continue;
      const pz = z * c + 1.1;
      G.prop.cylinder(ch.x0 + S / 2, this.H - 0.45, pz, 0.13, S, [0.34, 0.36, 0.33], G.lm, { axis: 'x', sides: 8, caps: false });
      G.prop.cylinder(ch.x0 + S / 2, this.H - 0.38, pz + 0.4, 0.06, S, [0.55, 0.3, 0.12], G.lm, { axis: 'x', sides: 6, caps: false });
    }
    for (let x = cx0; x < cx0 + N; x++) {
      if (hash3(x, 2, this.seed + 62) > 0.2) continue;
      G.prop.cylinder(x * c + 4.6, this.H - 0.6, ch.z0 + S / 2, 0.09, S, [0.3, 0.3, 0.3], G.lm, { axis: 'z', sides: 8, caps: false });
    }
    if (this.exit && ch === this.exitChunkProbe(ch)) this.buildDoor(G);
  }

  exitChunkProbe(ch) {
    const S = this.S;
    const ex = this.exit;
    const pz = ex.z + ex.nz * 0.3;
    const inside = ex.x >= ch.x0 && ex.x < ch.x0 + S && pz >= ch.z0 && pz < ch.z0 + S;
    return inside ? ch : null;
  }

  buildDoor(G) {
    const e = this.exit;
    const nz = e.nz;
    const z = e.z;
    const steel = [0.24, 0.3, 0.27];
    const frame = [0.2, 0.21, 0.22];
    G.prop.box(e.x, 1.1, z + nz * 0.03, 1.1, 2.2, 0.06, steel, G.lm, { uvScale: 0.6 });
    G.prop.box(e.x - 0.62, 1.15, z + nz * 0.05, 0.12, 2.3, 0.1, frame, G.lm, {});
    G.prop.box(e.x + 0.62, 1.15, z + nz * 0.05, 0.12, 2.3, 0.1, frame, G.lm, {});
    G.prop.box(e.x, 2.33, z + nz * 0.05, 1.36, 0.1, 0.1, frame, G.lm, { ao: 0 });
    G.prop.box(e.x, 1.05, z + nz * 0.1, 0.9, 0.06, 0.06, [0.55, 0.56, 0.57], G.lm, { ao: 0 });
    G.prop.box(e.x, 0.15, z + nz * 0.065, 1.0, 0.25, 0.012, [0.5, 0.5, 0.48], G.lm, {});
  }

  route() {
    const rnd = mulberry32(this.seed * 7 + 3);
    const a = rnd() * TAU;
    const d = 13 + Math.floor(rnd() * 3);
    const ex = Math.round(Math.cos(a) * d);
    const ez = Math.round(Math.sin(a) * d);
    const c = this.cell;
    const hT = this.T / 2;
    const iz = ez >= 0 ? ez + 1 : ez;
    this.setEdge(EH, ex, iz, W.EXIT);
    this.clearCell(0, 0);
    this.clearCell(ex, ez);
    this.carve(0, 0, ex, ez, rnd);
    this.exitCell = [ex, ez];
    const nz = ez >= 0 ? -1 : 1;
    this.exit = { x: ex * c + c / 2, z: iz * c + nz * hT, nz };
    // a porta de saída fica sempre iluminada
    this.exitLight = [ex, ez];
    this.spawn = { x: c / 2, z: c / 2, yaw: Math.atan2(-(this.exit.x - c / 2), -(this.exit.z - c / 2)) + (rnd() - 0.5) * 2 };
    // placa SAÍDA (emissiva)
    const signMat = new THREE.MeshBasicMaterial({ map: exitSignTex(), color: new THREE.Color(2.4, 2.4, 2.4), fog: true });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.23), signMat);
    sign.position.set(this.exit.x, 2.62, this.exit.z + nz * 0.07);
    sign.rotation.y = nz > 0 ? 0 : Math.PI;
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.28, 0.1), new THREE.MeshBasicMaterial({ color: 0x1c241e }));
    box.position.set(this.exit.x, 2.62, this.exit.z + nz * 0.015);
    this.dynamic.add(sign, box);
  }

  // Luz da célula de saída nunca apaga.
  light(cx, cz) {
    const L = super.light(cx, cz);
    if (L && this.exitLight && cx === this.exitLight[0] && cz === this.exitLight[1]) L.group = 0;
    return L;
  }

  tick(dt, player) {
    // quedas de energia ocasionais
    const o = this.outage;
    o.t -= dt;
    if (o.on > 0) {
      o.on -= dt;
      if (o.on <= 0) {
        o.t = 70 + Math.random() * 60;
        this.game.audio.powerUp();
      }
    } else if (o.t <= 0) {
      o.on = 5 + Math.random() * 4;
      this.game.audio.powerDown();
      this.game.hud.message('As luzes se apagaram.');
    }
    const target = o.on > 0 ? 0.04 : 1;
    this.game.power += (target - this.game.power) * Math.min(1, dt * (target < this.game.power ? 9 : 2.5));
  }

  interactable(player) {
    const e = this.exit;
    const dx = player.pos.x - e.x;
    const dz = (player.pos.z - e.z) * e.nz;
    if (Math.abs(dx) < 1.2 && dz > 0 && dz < 1.8) return { label: 'Abrir a porta de SAÍDA', action: () => this.game.reachExit('door') };
    return null;
  }

  exitEmitter() {
    return { x: this.exit.x, y: 2.4, z: this.exit.z, sound: 'radio' };
  }
}
