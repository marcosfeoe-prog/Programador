// Nível 1 — "Zona Habitável": armazém de concreto colossal, pilares, caixas,
// canos e luminárias penduradas. Há zonas sem luz onde os Sorridentes vivem,
// e às vezes a energia cai por alguns segundos.
// Saída: porta de metal com placa verde de SAÍDA.
// Área secreta: "Manutenção 1" — uma ala técnica vazia atrás de uma porta com
// placa amarela: racks de servidores piscando, mesas de controle, cabos e um
// gerador de reserva que acaba com as quedas de energia.
import * as THREE from 'three';
import { GridLevel, W, EH, EV } from './grid.js';
import { getTex, indoorEnvTex, exitSignTex, textCanvasTex } from '../textures.js';
import { panelMaterial } from '../materials.js';
import { clamp, fbm, hash3, mulberry32, TAU } from '../util.js';

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

  inMaint(ix, iz) {
    const M = this.maint;
    return !!M && ix >= M.x0 && ix < M.x1 && iz >= M.z0 && iz < M.z1;
  }

  genEdge(kind, ix, iz) {
    const bx = kind === EH ? ix : ix - 1;
    const bz = kind === EH ? iz - 1 : iz;
    const ma = this.inMaint(ix, iz);
    const mb = this.inMaint(bx, bz);
    if (ma && mb) return W.NONE;
    if (ma !== mb) {
      const e = this.maint.entrance;
      return e.kind === kind && e.ix === ix && e.iz === iz ? W.DOOR : W.FULL;
    }
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

  pillar(gx, gz) {
    const M = this.maint;
    if (M && gx > M.x0 && gx < M.x1 && gz > M.z0 && gz < M.z1) return 0;
    return 0.62;
  }

  dark(cx, cz) {
    if (this.inMaint(cx, cz)) return false;
    const M = this.maint;
    if (M && Math.abs(cx - M.entrance.out[0]) + Math.abs(cz - M.entrance.out[1]) <= 1) return true;
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
    if (this.inMaint(cx, cz)) return { x: cx * c + c / 2, z: cz * c + c / 2, y: 3.9, ax, len: 1.3, wid: 0.3, I: 11, group: h < 0.25 ? 1 : 0 };
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
        if (Math.abs(x) + Math.abs(z) < 2 || this.inMaint(x, z)) continue;
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
    this.maintProps(ch);
    if (hash3(ch.cx, ch.cz, this.seed + 31) < 0.35) {
      const x = cx0 + Math.floor(hash3(ch.cx, ch.cz, this.seed + 32) * N);
      const z = cz0 + Math.floor(hash3(ch.cx, ch.cz, this.seed + 33) * N);
      ch.items.push({
        type: 'note',
        key: `1:${ch.cx}:${ch.cz}:n`,
        x: x * c + c / 2 - 0.5,
        z: z * c + c / 2 + 0.4,
        rot: hash3(x, z, 5) * TAU,
      });
    }
  }

  // Manutenção 1: racks, mesas de controle, cabos e o gerador de reserva.
  maintProps(ch) {
    const M = this.maint;
    const c = this.cell;
    const X0 = M.x0 * c;
    const Z0 = M.z0 * c;
    const X1 = M.x1 * c;
    const Z1 = M.z1 * c;
    const inC = (x, z) => x >= ch.x0 && x < ch.x0 + this.S && z >= ch.z0 && z < ch.z0 + this.S;
    const add = (x, z, hx, hz, draw) => {
      if (!inC(x, z)) return;
      ch.props.push({ ao: [x - hx, x + hx, z - hz, z + hz, 0], draw });
      ch.colliders.push([x - hx, x + hx, z - hz, z + hz]);
    };
    const dark = [0.07, 0.08, 0.09];
    // fileiras de racks
    for (let r = 0; r < 3; r++) {
      const z = Z0 + 5 + r * 4.2;
      for (let k = 0; k < 8; k++) {
        const x = X0 + 6 + k * 0.72;
        add(x, z, 0.33, 0.5, (G) => {
          G.prop.box(x, 1.1, z, 0.64, 2.2, 1.0, dark, G.lm, { floorY: 0 });
          for (let l = 0; l < 7; l++) {
            const grp = (k + l + r) % 5 === 0 ? 2 : (k * 3 + l) % 4 === 0 ? 1 : 0;
            G.panel.box(x - 0.2 + (l % 3) * 0.08, 0.5 + l * 0.22, z - 0.505, 0.03, 0.02, 0.01, [1, 1, 1], null, { group: grp });
          }
          G.prop.box(x, 1.25, z - 0.505, 0.5, 1.6, 0.01, [0.12, 0.13, 0.14], G.lm, { ao: 0 });
        });
      }
    }
    // mesa de controle com três monitores (perto da entrada)
    const e = M.entrance;
    const dx = (e.inn[0] + 0.5) * c + (e.kind === EV ? (e.ix === M.x0 ? 1.5 : -1.5) : 2.6);
    const dz = (e.inn[1] + 0.5) * c + (e.kind === EH ? (e.iz === M.z0 ? 1.5 : -1.5) : 2.6);
    this.terminal = { x: dx, z: dz };
    add(dx, dz, 1.3, 0.45, (G) => {
      G.prop.box(dx, 0.75, dz, 2.6, 0.06, 0.9, [0.3, 0.31, 0.33], G.lm, {});
      G.prop.box(dx, 0.37, dz, 2.5, 0.74, 0.8, [0.18, 0.19, 0.2], G.lm, { floorY: 0 });
      for (let m = -1; m <= 1; m++) {
        G.prop.box(dx + m * 0.8, 1.1, dz + 0.2, 0.6, 0.42, 0.06, [0.05, 0.05, 0.05], G.lm, {});
        G.panel.box(dx + m * 0.8, 1.1, dz + 0.165, 0.52, 0.34, 0.01, [1, 1, 1], null, { group: m === 0 ? 0 : 1 });
      }
    });
    // gerador de reserva (canto oposto)
    const gx = X1 - 3;
    const gz = Z1 - 3;
    this.generator = { x: gx, z: gz };
    add(gx, gz, 1.2, 0.8, (G) => {
      G.prop.box(gx, 0.8, gz, 2.4, 1.6, 1.6, [0.62, 0.52, 0.12], G.lm, { floorY: 0 });
      for (let k = 0; k < 6; k++) G.prop.box(gx - 1.0 + k * 0.4, 0.15, gz - 0.805, 0.18, 0.3, 0.01, [0.05, 0.05, 0.05], G.lm, { ao: 0 });
      G.prop.cylinder(gx + 0.6, 1.9, gz, 0.12, 0.6, [0.3, 0.3, 0.3], G.lm, { sides: 8 });
      G.panel.box(gx - 0.6, 1.2, gz - 0.805, 0.1, 0.06, 0.01, [1, 1, 1], null, { group: 2 });
    });
    // calhas de cabos no teto
    if (inC(X0 + c, Z0 + c)) {
      ch.props.push({
        draw: (G) => {
          for (let r = 0; r < 3; r++) G.prop.box((X0 + X1) / 2, this.H - 0.6, Z0 + 5 + r * 4.2, X1 - X0 - 2, 0.08, 0.5, [0.3, 0.32, 0.33], G.lm, { ao: 0 });
          for (let r = 0; r < 3; r++)
            for (let k = 0; k < 3; k++) G.prop.cylinder((X0 + X1) / 2, this.H - 0.5, Z0 + 4.85 + r * 4.2 + k * 0.12, 0.035, X1 - X0 - 2, [[0.1, 0.1, 0.1], [0.5, 0.1, 0.05], [0.1, 0.25, 0.5]][k], G.lm, { axis: 'x', sides: 5, caps: false });
        },
      });
    }
    // água e um bilhete
    const ix = M.x0 + 1;
    const iz = M.z1 - 1;
    if (inC(ix * c + 3, iz * c + 3)) {
      ch.items.push({ type: 'water', key: '1:maint:w', x: ix * c + 3, z: iz * c + 3 });
      ch.items.push({
        type: 'note',
        key: '1:maint:n',
        x: ix * c + 3.6,
        z: iz * c + 2.4,
        rot: 0.3,
        onUse: (g) => {
          g.audio.paper();
          g.hud.showNote('MANUTENÇÃO 1 — escala de turnos. Todos os nomes riscados. Embaixo: "Os servidores continuam ligados e ninguém sabe o que eles processam. Se as luzes caírem de novo, ligue o gerador de reserva no fundo da sala. Ele segura o nível inteiro."');
          g.addSanity(4);
        },
      });
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
            G.prop.box(x + (i % 2) * 0.06, s / 2 + i * 1.02, z, s, s, s, [wood[0] * k, wood[1] * k, wood[2] * k], G.lm, {
              rot: rot + i * 0.2,
              uvScale: 0.5,
              floorY: 0,
            });
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
    const d = 24 + Math.floor(rnd() * 4);
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
    this.placeMaint(rnd, a);
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

  // Coloca a Manutenção 1 longe da rota da saída, com a porta voltada para o início.
  placeMaint(rnd, exitAng) {
    const W2 = 4;
    const H2 = 3;
    const ex = this.exitCell;
    for (let t = 0; t < 30; t++) {
      const ang = exitAng + Math.PI * (0.55 + rnd() * 0.9);
      const d = 10 + rnd() * 4;
      const cx = Math.round(Math.cos(ang) * d);
      const cz = Math.round(Math.sin(ang) * d);
      const L2 = ex[0] * ex[0] + ex[1] * ex[1];
      const tt = clamp((cx * ex[0] + cz * ex[1]) / L2, 0, 1);
      if (Math.hypot(cx - ex[0] * tt, cz - ex[1] * tt) < 6) continue;
      const M = { x0: cx - 2, x1: cx - 2 + W2, z0: cz - 1, z1: cz - 1 + H2 };
      if (Math.abs(cx) >= Math.abs(cz)) {
        const iz = cz;
        M.entrance = cx > 0 ? { kind: EV, ix: M.x0, iz, out: [M.x0 - 1, iz], inn: [M.x0, iz] } : { kind: EV, ix: M.x1, iz, out: [M.x1, iz], inn: [M.x1 - 1, iz] };
      } else {
        const ix = cx;
        M.entrance = cz > 0 ? { kind: EH, ix, iz: M.z0, out: [ix, M.z0 - 1], inn: [ix, M.z0] } : { kind: EH, ix, iz: M.z1, out: [ix, M.z1], inn: [ix, M.z1 - 1] };
      }
      this.maint = M;
      break;
    }
    this.edgeMemo.clear();
    const M = this.maint;
    this.carve(0, 0, M.entrance.out[0], M.entrance.out[1], rnd);
    // placa amarela sobre a porta
    const c = this.cell;
    const e = M.entrance;
    const hT = this.T / 2;
    let x;
    let z;
    let ry;
    if (e.kind === EV) {
      const s = e.out[0] < e.inn[0] ? -1 : 1;
      x = e.ix * c + s * (hT + 0.02);
      z = e.iz * c + c / 2;
      ry = s > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      const s = e.out[1] < e.inn[1] ? -1 : 1;
      x = e.ix * c + c / 2;
      z = e.iz * c + s * (hT + 0.02);
      ry = s > 0 ? 0 : Math.PI;
    }
    this.maintSignTex = textCanvasTex(512, 128, (g, w, h) => {
      g.fillStyle = '#d8b418';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#111';
      for (let i = -2; i < 20; i++) {
        g.beginPath();
        g.moveTo(i * 30, 0);
        g.lineTo(i * 30 + 14, 0);
        g.lineTo(i * 30 - 6, 22);
        g.lineTo(i * 30 - 20, 22);
        g.fill();
      }
      g.font = 'bold 54px Arial, Helvetica, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('MANUTENÇÃO 1', w / 2, h / 2 + 12);
    });
    this.maintSignMat = new THREE.MeshBasicMaterial({ map: this.maintSignTex, color: new THREE.Color(0.55, 0.55, 0.55), fog: true });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), this.maintSignMat);
    sign.position.set(x, 3.75, z);
    sign.rotation.y = ry;
    this.dynamic.add(sign);
    this.maintDoor = { x: x + Math.sin(ry) * 0.8, z: z + Math.cos(ry) * 0.8 };
  }

  // Luz da célula de saída nunca apaga.
  light(cx, cz) {
    const L = super.light(cx, cz);
    if (L && this.exitLight && cx === this.exitLight[0] && cz === this.exitLight[1]) L.group = 0;
    return L;
  }

  tick(dt, player) {
    const g = this.game;
    const c = this.cell;
    const inM = this.inMaint(Math.floor(player.pos.x / c), Math.floor(player.pos.z / c));
    if (inM && !this.toldMaint) {
      this.toldMaint = true;
      g.hud.message('Área secreta: MANUTENÇÃO 1. Uma ala técnica vazia: racks de servidores piscando sozinhos, telas ligadas, ninguém. O ar é frio e zumbe.', 6);
      g.audio.play('beep', { gain: 0.3, rate: 0.9 });
    }
    this.sanityExtra = inM ? -0.4 : 0;
    // quedas de energia ocasionais (o gerador de reserva acaba com elas)
    const o = this.outage;
    if (o.fixed) return;
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
    const g = this.game;
    const p = player.pos;
    const T = this.terminal;
    if (T && Math.hypot(p.x - T.x, p.z - T.z) < 1.6) return { label: 'Usar o terminal de manutenção', action: () => this.useTerminal() };
    const G = this.generator;
    if (G && Math.hypot(p.x - G.x, p.z - G.z) < 2.4) {
      if (this.outage.fixed) return { label: 'Gerador de reserva (ligado)', action: () => g.hud.message('O gerador ronca baixinho. As luzes do nível estão estáveis.', 3) };
      return {
        label: 'Ligar o gerador de reserva',
        action: () => {
          this.outage.fixed = true;
          this.outage.on = 0;
          g.power = 1;
          g.audio.powerUp();
          g.audio.play('machine', { gain: 0.4, rate: 0.7 });
          g.addSanity(10);
          g.hud.message('O gerador pega com um tranco. As luzes do Nível 1 não vão mais cair. (+Sanidade)', 5);
        },
      };
    }
    const e = this.exit;
    const dx = player.pos.x - e.x;
    const dz = (player.pos.z - e.z) * e.nz;
    if (Math.abs(dx) < 1.2 && dz > 0 && dz < 1.8) return { label: 'Abrir a porta de SAÍDA', action: () => this.game.reachExit('door') };
    return null;
  }

  useTerminal() {
    const g = this.game;
    const p = g.player.pos;
    const dx = this.exit.x - p.x;
    const dz = this.exit.z - p.z;
    const d = Math.round(Math.hypot(dx, dz));
    const dirs = ['leste', 'sudeste', 'sul', 'sudoeste', 'oeste', 'noroeste', 'norte', 'nordeste'];
    const dir = dirs[(Math.round(Math.atan2(dz, dx) / (Math.PI / 4)) + 8) % 8];
    g.audio.play('beep', { gain: 0.3, rate: 1.3 });
    g.hud.dialog(
      'Terminal — Manutenção 1',
      `> SISTEMA DE MONITORAMENTO DO NÍVEL 1\n> PORTA DE SAÍDA DETECTADA: ~${d} m, direção ${dir}.\n> QUEDAS DE ENERGIA: ${this.outage.fixed ? 'ESTABILIZADAS' : 'ATIVAS — ligue o gerador de reserva'}.\n> SORRIDENTES DETECTADOS NAS ZONAS SEM LUZ.`,
      [{ text: 'Sair', fn: () => g.hud.closeDialog() }],
      '',
    );
  }

  exitEmitter() {
    return { x: this.exit.x, y: 2.4, z: this.exit.z, sound: 'radio' };
  }

  dispose() {
    this.maintSignTex.dispose();
    this.maintSignMat.dispose();
    super.dispose();
  }
}
