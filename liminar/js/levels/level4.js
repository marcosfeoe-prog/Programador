// Nível 4 — "Escritório Abandonado": carpete azul-acinzentado, paredes de
// gesso, forro branco, divisórias de vidro, mesas vazias, bebedouros e
// janelas que dão para o vazio. Saída: o elevador.
import * as THREE from 'three';
import { GridLevel, W, EH, EV } from './grid.js';
import { getTex, indoorEnvTex, textCanvasTex } from '../textures.js';
import { panelMaterial } from '../materials.js';
import { fbm, hash3, mulberry32, TAU } from '../util.js';

export class Level4 extends GridLevel {
  constructor(game) {
    super(game, {
      cell: 3,
      H: 2.7,
      T: 0.12,
      doorW: 0.95,
      doorH: 2.1,
      chunkCells: 7,
      seed: (game.seed ^ 0x4444) >>> 0,
      lightRadius: 9,
      lightEmitPow: 1,
      bounce: 0.55,
      ambient: 0.03,
      wallUV: [1.2, 2.7],
      floorUV: 1,
      ceilUV: 1.2,
    });
    this.num = 4;
    this.surface = 'carpet';
    this.panelI = 7.5;
    this.flickerGap = 14;
    const S = this.Q.tex;
    const dw = getTex('drywall', S);
    const oc = getTex('officeCarpet', S);
    const ce = getTex('ceiling', S);
    const pn = getTex('panel', S);
    const gr = getTex('grime', S);
    const env = game.makeEnv(indoorEnvTex(['#8a9096', '#5d636a', '#3b4046'], '#ffffff'));
    this.env = env;
    this.mats = {
      floor: {
        map: oc.map,
        normalMap: oc.normalMap,
        roughness: 0.96,
        dirtColor: new THREE.Color(0.8, 0.8, 0.82),
        dirtAmt: 0.3,
      },
      wall: { map: dw.map, normalMap: dw.normalMap, normalScale: 0.6, roughness: 0.85, vertexColors: true, envMap: env, envIntensity: 0.3 },
      ceil: { map: ce.map, normalMap: ce.normalMap, roughness: 0.95, lmIntensity: 0.45, vertexColors: true, color: 0xf2f4f6 },
      prop: { map: gr.map, normalMap: gr.normalMap, vertexColors: true, roughness: 0.55, envMap: env, envIntensity: 0.6 },
    };
    this.panelMat = panelMaterial(pn.map, 0xf4f8ff);
    this.glassMat = new THREE.MeshStandardMaterial({
      color: 0xbfd4d8,
      roughness: 0.04,
      metalness: 0,
      transparent: true,
      opacity: 0.16,
      envMap: this.Q.envMap ? env : null,
      envMapIntensity: 1.6,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    // janela para o vazio, com persiana meio baixada
    const voidTex = textCanvasTex(128, 128, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#05070b');
      g.addColorStop(0.6, '#0b1018');
      g.addColorStop(1, '#151b24');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      for (let y = 0; y < h * 0.38; y += 5) {
        c.fillStyle = '#c9c6bd';
        c.fillRect(0, y, w, 3.6);
        c.fillStyle = '#8d8a83';
        c.fillRect(0, y + 3, w, 0.8);
      }
      c.fillStyle = '#d6d3ca';
      c.fillRect(0, h * 0.38, w, 3);
    });
    this.sharedLayers = {
      void: new THREE.MeshBasicMaterial({ map: voidTex, color: new THREE.Color(0.55, 0.55, 0.55), fog: true }),
    };
    this.look = {
      exposure: 0.84,
      tint: [0.98, 1.0, 1.03],
      sat: 0.85,
      contrast: 1.02,
      lift: [0.02, 0.022, 0.026],
      bloom: 0.12,
      fog: [0.42, 0.45, 0.48],
      fogNear: 0.45,
      lightColor: [0.95, 0.98, 1.0],
      flashlight: false,
      ambience: 'level4',
      reverb: 1.4,
      sanityDrain: 0.08,
    };
    this.route();
  }

  open(x, z) {
    return fbm(x * 0.08, z * 0.08, 3, this.seed + 4) > 0.12;
  }

  genEdge(kind, ix, iz) {
    const op = this.open(ix, iz);
    let p = op ? 0.06 : 0.42;
    // corredores longos a cada poucas fileiras
    const lineId = kind === EH ? iz : ix;
    if (!op && ((lineId % 4) + 4) % 4 === 0 && hash3(lineId, kind, this.seed + 3) < 0.6) p = 0.85;
    const h = hash3(ix * 2 + kind, iz, this.seed);
    if (h >= p) return W.NONE;
    const t = hash3(ix, iz * 3 + kind, this.seed + 7);
    if (t < 0.4) return W.DOOR;
    if (t < 0.62) return W.GLASS;
    if (t < 0.72) return W.WINDOW;
    return W.FULL;
  }

  genLight(cx, cz) {
    const c = this.cell;
    const h = this.hashCell(cx, cz, 3);
    let group = 0;
    if (h < 0.035) group = 3;
    else if (h < 0.06) group = 1;
    const ax = this.open(cx, cz) ? 0 : 1;
    return {
      x: cx * c + (ax === 1 ? 1.5 : 1.2),
      z: cz * c + (ax === 1 ? 1.2 : 1.5),
      y: this.H - 0.02,
      ax,
      len: 1.2,
      wid: 0.6,
      I: 7.5,
      group,
    };
  }

  dirt(x, z) {
    const n = fbm(x * 0.2, z * 0.2, 3, this.seed + 11);
    return n > 0.25 ? Math.min(1, (n - 0.25) * 4) : 0;
  }

  // Molduras de porta, folhas abertas e janelas para o vazio.
  decorateEdge(G, kind, ix, iz, t) {
    const c = this.cell;
    if (t === W.DOOR) {
      const m = c / 2;
      const dw = this.doorW / 2;
      const trim = [0.82, 0.8, 0.76];
      const d = this.T + 0.04;
      if (kind === EH) {
        const z = iz * c;
        G.extra.box(ix * c + m - dw - 0.03, this.doorH / 2, z, 0.06, this.doorH, d, trim, G.lm, {});
        G.extra.box(ix * c + m + dw + 0.03, this.doorH / 2, z, 0.06, this.doorH, d, trim, G.lm, {});
        G.extra.box(ix * c + m, this.doorH + 0.03, z, this.doorW + 0.12, 0.06, d, trim, G.lm, { ao: 0 });
      } else {
        const x = ix * c;
        G.extra.box(x, this.doorH / 2, iz * c + m - dw - 0.03, d, this.doorH, 0.06, trim, G.lm, {});
        G.extra.box(x, this.doorH / 2, iz * c + m + dw + 0.03, d, this.doorH, 0.06, trim, G.lm, {});
        G.extra.box(x, this.doorH + 0.03, iz * c + m, d, 0.06, this.doorW + 0.12, trim, G.lm, { ao: 0 });
      }
    } else if (t === W.WINDOW && G.void) {
      const hT = this.T / 2 + 0.004;
      const y0 = 0.95;
      const y1 = 2.15;
      const a0 = 0.45;
      const a1 = c - 0.45;
      const uv = [0, 0, 1, 0, 1, 1, 0, 1];
      if (kind === EH) {
        const z = iz * c;
        const x0 = ix * c + a0;
        const x1 = ix * c + a1;
        G.void.quad([[x0, y0, z + hT], [x1, y0, z + hT], [x1, y1, z + hT], [x0, y1, z + hT]], [0, 0, 1], uv, null, null);
        G.void.quad([[x1, y0, z - hT], [x0, y0, z - hT], [x0, y1, z - hT], [x1, y1, z - hT]], [0, 0, -1], uv, null, null);
        for (const s of [-1, 1]) {
          G.extra.box((x0 + x1) / 2, y0 - 0.03, z + s * (hT + 0.02), x1 - x0 + 0.1, 0.06, 0.05, [0.85, 0.85, 0.83], G.lm, { ao: 0 });
          G.extra.box((x0 + x1) / 2, y1 + 0.02, z + s * hT, x1 - x0 + 0.1, 0.04, 0.02, [0.85, 0.85, 0.83], G.lm, { ao: 0 });
        }
      } else {
        const x = ix * c;
        const z0 = iz * c + a0;
        const z1 = iz * c + a1;
        G.void.quad([[x - hT, y0, z0], [x - hT, y0, z1], [x - hT, y1, z1], [x - hT, y1, z0]], [-1, 0, 0], uv, null, null);
        G.void.quad([[x + hT, y0, z1], [x + hT, y0, z0], [x + hT, y1, z0], [x + hT, y1, z1]], [1, 0, 0], uv, null, null);
        for (const s of [-1, 1]) {
          G.extra.box(x + s * (hT + 0.02), y0 - 0.03, (z0 + z1) / 2, 0.05, 0.06, z1 - z0 + 0.1, [0.85, 0.85, 0.83], G.lm, { ao: 0 });
          G.extra.box(x + s * hT, y1 + 0.02, (z0 + z1) / 2, 0.02, 0.04, z1 - z0 + 0.1, [0.85, 0.85, 0.83], G.lm, { ao: 0 });
        }
      }
    } else if (t === W.GLASS) {
      // caixilho de alumínio
      const al = [0.6, 0.62, 0.64];
      const po = 0.07;
      if (kind === EH) {
        const z = iz * c;
        for (const y of [0.9, 2.2]) G.extra.box(ix * c + c / 2, y, z, c - po * 2, 0.05, this.T + 0.02, al, G.lm, { ao: 0 });
      } else {
        const x = ix * c;
        for (const y of [0.9, 2.2]) G.extra.box(x, y, iz * c + c / 2, this.T + 0.02, 0.05, c - po * 2, al, G.lm, { ao: 0 });
      }
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
        const h = this.hashCell(x, z, 40);
        const r = this.hashCell(x, z, 41);
        const cxm = x * c + c / 2;
        const czm = z * c + c / 2;
        if (this.open(x, z)) {
          if (h < 0.55 * dens) this.addDesk(ch, cxm, czm, r, true);
        } else if (h < 0.3 * dens) {
          this.addDesk(ch, cxm + (r < 0.5 ? -0.55 : 0.55), czm - 0.5, r, false);
        } else if (h < 0.36 * dens) {
          this.addCooler(ch, cxm + 1.0, czm + 1.0);
        } else if (h < 0.44 * dens) {
          this.addCabinet(ch, cxm - 1.05, czm + 0.9, r);
        } else if (h < 0.5 * dens) {
          this.addPlant(ch, cxm + 1.05, czm - 1.05);
        }
        if (this.hashCell(x, z, 21) < 0.018) {
          ch.items.push({ type: 'water', key: `4:${x}:${z}:w`, x: cxm - 0.3, z: czm + 0.9 });
        }
      }
    }
    if (hash3(ch.cx, ch.cz, this.seed + 31) < 0.4) {
      const x = cx0 + Math.floor(hash3(ch.cx, ch.cz, this.seed + 32) * N);
      const z = cz0 + Math.floor(hash3(ch.cx, ch.cz, this.seed + 33) * N);
      ch.items.push({ type: 'note', key: `4:${ch.cx}:${ch.cz}:n`, x: x * c + 1.1, z: z * c + 1.9, rot: hash3(x, z, 5) * TAU });
    }
  }

  addDesk(ch, x, z, r, cubicle) {
    const rot = r < 0.5 ? 0 : Math.PI / 2;
    const w = 1.5;
    const d = 0.75;
    const ex = rot ? d / 2 : w / 2;
    const ez = rot ? w / 2 : d / 2;
    ch.colliders.push([x - ex, x + ex, z - ez, z + ez]);
    const ao = [x - ex, x + ex, z - ez, z + ez, 0.15];
    ch.props.push({
      ao,
      draw: (G) => {
        const wood = [0.55, 0.45, 0.34];
        const grey = [0.35, 0.36, 0.38];
        G.prop.box(x, 0.725, z, w, 0.04, d, wood, G.lm, { rot, ao: 0 });
        const ux = Math.cos(rot);
        const uz = -Math.sin(rot);
        for (const s of [-1, 1]) {
          G.prop.box(x + ux * s * (w / 2 - 0.03), 0.35, z + uz * s * (w / 2 - 0.03), 0.04, 0.7, d - 0.06, grey, G.lm, { rot });
        }
        // gaveteiro
        G.prop.box(x + ux * 0.45, 0.33, z + uz * 0.45, 0.4, 0.62, d - 0.1, grey, G.lm, { rot });
        // monitor antigo de tubo
        if (r * 7 % 1 < 0.7) {
          const mx = x - Math.sin(rot) * 0.12;
          const mz = z - Math.cos(rot) * 0.12;
          G.prop.box(mx, 0.93, mz, 0.4, 0.34, 0.36, [0.78, 0.76, 0.7], G.lm, { rot, ao: 0 });
          G.prop.box(mx, 0.76, mz, 0.18, 0.04, 0.18, [0.7, 0.68, 0.62], G.lm, { rot, ao: 0 });
          G.prop.box(x + Math.sin(rot) * 0.15, 0.755, z + Math.cos(rot) * 0.15, 0.45, 0.025, 0.16, [0.75, 0.73, 0.68], G.lm, { rot, ao: 0 });
        }
        // cadeira de escritório
        const cx = x + Math.sin(rot) * 0.65;
        const cz = z + Math.cos(rot) * 0.65;
        const cr = rot + (r - 0.5) * 1.2;
        G.prop.cylinder(cx, 0.24, cz, 0.03, 0.4, [0.15, 0.15, 0.16], G.lm, { sides: 6 });
        G.prop.box(cx, 0.06, cz, 0.6, 0.04, 0.06, [0.12, 0.12, 0.13], G.lm, { rot: cr });
        G.prop.box(cx, 0.06, cz, 0.06, 0.04, 0.6, [0.12, 0.12, 0.13], G.lm, { rot: cr });
        G.prop.box(cx, 0.46, cz, 0.48, 0.08, 0.46, [0.16, 0.17, 0.2], G.lm, { rot: cr, ao: 0 });
        G.prop.box(cx + Math.sin(cr) * 0.22, 0.78, cz + Math.cos(cr) * 0.22, 0.44, 0.52, 0.07, [0.16, 0.17, 0.2], G.lm, { rot: cr, ao: 0 });
        if (cubicle) {
          // divisórias de baia
          const fab = [0.42, 0.46, 0.52];
          const bx = x - Math.sin(rot) * (d / 2 + 0.05);
          const bz = z - Math.cos(rot) * (d / 2 + 0.05);
          G.prop.box(bx, 0.62, bz, w + 0.3, 1.24, 0.05, fab, G.lm, { rot });
          for (const s of [-1, 1]) {
            const sx = x + ux * s * (w / 2 + 0.15) + Math.sin(rot) * 0.3;
            const sz = z + uz * s * (w / 2 + 0.15) + Math.cos(rot) * 0.3;
            G.prop.box(sx, 0.62, sz, 0.05, 1.24, d + 0.7, fab, G.lm, { rot });
          }
        }
      },
    });
    if (cubicle) {
      const bx = x - Math.sin(rot) * (d / 2 + 0.05);
      const bz = z - Math.cos(rot) * (d / 2 + 0.05);
      const hx = rot ? 0.05 : (w + 0.3) / 2;
      const hz = rot ? (w + 0.3) / 2 : 0.05;
      ch.colliders.push([bx - hx, bx + hx, bz - hz, bz + hz]);
    }
  }

  addCooler(ch, x, z) {
    ch.colliders.push([x - 0.2, x + 0.2, z - 0.2, z + 0.2]);
    ch.props.push({
      ao: [x - 0.2, x + 0.2, z - 0.2, z + 0.2, 0],
      draw: (G) => {
        G.prop.box(x, 0.5, z, 0.32, 1.0, 0.32, [0.86, 0.86, 0.84], G.lm, {});
        G.prop.cylinder(x, 1.24, z, 0.15, 0.46, [0.35, 0.55, 0.8], G.lm, { sides: 12 });
        G.prop.box(x, 0.85, z + 0.17, 0.08, 0.06, 0.04, [0.2, 0.3, 0.7], G.lm, { ao: 0 });
      },
    });
    ch.items.push({ type: 'cooler', key: `4:${x.toFixed(1)}:${z.toFixed(1)}:c`, x, z: z + 0.3, y: 0.9, noMesh: true });
  }

  addCabinet(ch, x, z, r) {
    const rot = r < 0.5 ? 0 : Math.PI / 2;
    ch.colliders.push([x - 0.3, x + 0.3, z - 0.3, z + 0.3]);
    ch.props.push({
      ao: [x - 0.25, x + 0.25, z - 0.3, z + 0.3, 0],
      draw: (G) => {
        G.prop.box(x, 0.66, z, 0.47, 1.32, 0.6, [0.5, 0.52, 0.5], G.lm, { rot });
        for (let i = 0; i < 4; i++) {
          G.prop.box(x + Math.sin(rot) * 0.31, 0.2 + i * 0.32, z + Math.cos(rot) * 0.31, 0.12, 0.025, 0.02, [0.7, 0.7, 0.7], G.lm, { rot, ao: 0 });
        }
      },
    });
  }

  addPlant(ch, x, z) {
    ch.colliders.push([x - 0.22, x + 0.22, z - 0.22, z + 0.22]);
    ch.props.push({
      ao: [x - 0.2, x + 0.2, z - 0.2, z + 0.2, 0],
      draw: (G) => {
        G.prop.cylinder(x, 0.22, z, 0.2, 0.44, [0.42, 0.3, 0.22], G.lm, { sides: 10, r2: 0.24 });
        for (let i = 0; i < 6; i++) {
          const a = i * 1.05;
          G.prop.box(x + Math.cos(a) * 0.12, 0.7 + (i % 3) * 0.12, z + Math.sin(a) * 0.12, 0.05, 0.55, 0.16, [0.36, 0.33, 0.18], G.lm, { rot: a, ao: 0 });
        }
      },
    });
  }

  buildExtra(G, ch) {
    const e = this.exit;
    const pz = e.z + e.nz * 0.3;
    if (!(e.x >= ch.x0 && e.x < ch.x0 + this.S && pz >= ch.z0 && pz < ch.z0 + this.S)) return;
    // portas do elevador em aço escovado
    const nz = e.nz;
    const steel = [0.62, 0.63, 0.64];
    G.extra.box(e.x - 0.42, 1.08, e.z + nz * 0.02, 0.82, 2.16, 0.04, steel, G.lm, { uvScale: 0.3 });
    G.extra.box(e.x + 0.42, 1.08, e.z + nz * 0.02, 0.82, 2.16, 0.04, steel, G.lm, { uvScale: 0.3 });
    G.extra.box(e.x - 0.9, 1.15, e.z + nz * 0.05, 0.14, 2.3, 0.1, [0.5, 0.5, 0.52], G.lm, {});
    G.extra.box(e.x + 0.9, 1.15, e.z + nz * 0.05, 0.14, 2.3, 0.1, [0.5, 0.5, 0.52], G.lm, {});
    G.extra.box(e.x, 2.3, e.z + nz * 0.05, 1.94, 0.14, 0.1, [0.5, 0.5, 0.52], G.lm, { ao: 0 });
    G.extra.box(e.x + 1.18, 1.15, e.z + nz * 0.015, 0.12, 0.26, 0.03, [0.55, 0.55, 0.57], G.lm, { ao: 0 });
  }

  route() {
    const rnd = mulberry32(this.seed * 7 + 3);
    const a = rnd() * TAU;
    const d = 24 + Math.floor(rnd() * 5);
    const ex = Math.round(Math.cos(a) * d);
    const ez = Math.round(Math.sin(a) * d);
    const c = this.cell;
    const hT = this.T / 2;
    const iz = ez >= 0 ? ez + 1 : ez;
    this.setEdge(EH, ex, iz, W.EXIT);
    this.setEdge(EV, ex, ez, W.NONE);
    this.setEdge(EV, ex + 1, ez, W.NONE);
    this.clearCell(0, 0);
    this.clearCell(ex, ez);
    this.carve(0, 0, ex, ez, rnd);
    this.exitCell = [ex, ez];
    const nz = ez >= 0 ? -1 : 1;
    this.exit = { x: ex * c + c / 2, z: iz * c + nz * hT, nz };
    this.spawn = { x: c / 2, z: c / 2, yaw: Math.atan2(-(this.exit.x - c / 2), -(this.exit.z - c / 2)) + (rnd() - 0.5) * 2 };
    // botão de chamada e indicador de andar
    const btn = new THREE.Mesh(new THREE.CircleGeometry(0.03, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.2, 0.8) }));
    btn.position.set(this.exit.x + 1.18, 1.18, this.exit.z + nz * 0.032);
    btn.rotation.y = nz > 0 ? 0 : Math.PI;
    this.callBtn = btn;
    const indTex = textCanvasTex(128, 48, (cx, w, h) => {
      cx.fillStyle = '#120404';
      cx.fillRect(0, 0, w, h);
      cx.fillStyle = '#ff3a22';
      cx.font = 'bold 34px "Courier New", monospace';
      cx.textAlign = 'center';
      cx.textBaseline = 'middle';
      cx.fillText('▲ 4', w / 2, h / 2 + 2);
    });
    const ind = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.13), new THREE.MeshBasicMaterial({ map: indTex, color: new THREE.Color(2.2, 2.2, 2.2) }));
    ind.position.set(this.exit.x, 2.48, this.exit.z + nz * 0.01);
    ind.rotation.y = btn.rotation.y;
    this.dynamic.add(btn, ind);
  }

  interactable(player) {
    const e = this.exit;
    const dx = player.pos.x - e.x;
    const dz = (player.pos.z - e.z) * e.nz;
    if (Math.abs(dx) < 1.6 && dz > 0 && dz < 1.8) {
      return {
        label: 'Chamar o elevador',
        action: () => {
          this.callBtn.material.color.setRGB(6, 5, 2);
          this.game.audio.ding();
          this.game.reachExit('elevator', 2.2);
        },
      };
    }
    return null;
  }

  exitEmitter() {
    return { x: this.exit.x, y: 2.2, z: this.exit.z, sound: 'elevator' };
  }
}
