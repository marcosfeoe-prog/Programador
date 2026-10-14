// Nível 15 — conteúdo dos quarteirões: salas de máquinas (turbina, geradores,
// servidores), salas brancas com números pintados, o cartão de acesso, os
// terminais e a comporta. Peças estáticas entram na geometria do bloco (com
// lightmap); peças que se mexem viram "dyn" e são montadas em onChunkBuilt.
import * as THREE from 'three';
import { hash3 } from '../util.js';

const WHITE = [0.86, 0.88, 0.89];
const PLASTIC = [0.78, 0.8, 0.81];
const STEEL = [0.46, 0.48, 0.5];
const DARK = [0.13, 0.14, 0.15];
const BLACK = [0.04, 0.04, 0.045];
const YELLOW = [0.86, 0.62, 0.08];
const LED = {
  g: [0.25, 1.0, 0.45],
  a: [1.0, 0.55, 0.08],
  r: [1.0, 0.12, 0.08],
  b: [0.3, 0.62, 1.0],
  w: [0.85, 0.92, 1.0],
};
const ONLY_TOP = 'px nx pz nz ny';

// ------------------------------------------------------------ utilitários de geometria
// Quad com orientação automática: a normal `n` decide qual lado é a frente.
export function face(gb, pts, n, uvs, lmFn, col, g = 0) {
  const [a, b, c] = pts;
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const cx = uy * vz - uz * vy;
  const cy = uz * vx - ux * vz;
  const cz = ux * vy - uy * vx;
  let P = pts;
  let U = uvs;
  if (cx * n[0] + cy * n[1] + cz * n[2] < 0) {
    P = [pts[0], pts[3], pts[2], pts[1]];
    U = [uvs[0], uvs[1], uvs[6], uvs[7], uvs[4], uvs[5], uvs[2], uvs[3]];
  }
  let lm = null;
  if (lmFn) {
    lm = [];
    for (const p of P) lm.push(...lmFn(p[0] + n[0] * 0.25, p[2] + n[2] * 0.25));
  }
  const cols = col ? (Array.isArray(col[0]) ? col : [col, col, col, col]) : null;
  gb.quad(P, n, U, lm, cols, g);
}

// Quad vertical centrado em (x, z), voltado para a normal horizontal (nx, nz),
// afastado `d` da superfície. Os uv vão da esquerda para a direita de quem olha.
export function vquad(gb, x, z, nx, nz, w, y0, y1, d, lmFn, col, g = 0, uvs = [0, 0, 1, 0, 1, 1, 0, 1]) {
  const rx = nz;
  const rz = -nx;
  const px = x + nx * d;
  const pz = z + nz * d;
  const h = w / 2;
  face(
    gb,
    [
      [px - rx * h, y0, pz - rz * h],
      [px + rx * h, y0, pz + rz * h],
      [px + rx * h, y1, pz + rz * h],
      [px - rx * h, y1, pz - rz * h],
    ],
    [nx, 0, nz],
    uvs,
    lmFn,
    col,
    g,
  );
}

// LED quadrado (camada emissiva que pisca).
export function led(G, x, y, z, nx, nz, s, col, g = 0) {
  vquad(G.led, x, z, nx, nz, s, y - s / 2, y + s / 2, 0.006, null, col, g);
}

// Acrescenta uma BufferGeometry com uv de lightmap corretos.
export function addGeoLM(gb, geo, m, color, lmFn) {
  const base = gb.n;
  gb.addGeometry(geo, m, color);
  geo.dispose();
  if (!lmFn) return;
  for (let i = base; i < gb.n; i++) {
    const l = lmFn(gb.pos[i * 3] + gb.nor[i * 3] * 0.25, gb.pos[i * 3 + 2] + gb.nor[i * 3 + 2] * 0.25);
    gb.uv1[i * 2] = l[0];
    gb.uv1[i * 2 + 1] = l[1];
  }
}

// Ponto na face interna da parede do lado `s` (0 = −x, 1 = +x, 2 = −z, 3 = +z),
// no centro da célula `k` (1..4, pode ser fracionário), com normal para dentro.
export function sidePoint(L, blk, s, k, inset = 0) {
  const c = L.cell;
  const hT = L.T / 2;
  const x0 = blk.bx * L.B * c;
  const z0 = blk.bz * L.B * c;
  const far = L.B * c;
  let x;
  let z;
  let nx = 0;
  let nz = 0;
  if (s === 0) {
    x = x0 + c + hT;
    z = z0 + (k + 0.5) * c;
    nx = 1;
  } else if (s === 1) {
    x = x0 + far - hT;
    z = z0 + (k + 0.5) * c;
    nx = -1;
  } else if (s === 2) {
    z = z0 + c + hT;
    x = x0 + (k + 0.5) * c;
    nz = 1;
  } else {
    z = z0 + far - hT;
    x = x0 + (k + 0.5) * c;
    nz = -1;
  }
  return { x: x + nx * inset, z: z + nz * inset, nx, nz };
}

// Algarismo pintado em pontos numa parede (camada G.num).
export function paintDigit(G, x, z, nx, nz, d, h, y0 = 0.3) {
  const w = h * 0.8;
  const u0 = d / 10;
  const u1 = (d + 1) / 10;
  vquad(G.num, x, z, nx, nz, w, y0, y0 + h, 0.008, null, null, 0, [u0, 0, u1, 0, u1, 1, u0, 1]);
}

const rotY = (x, z, a) => [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];

// ------------------------------------------------------------ salas de máquinas
export function fillMachine(L, ch, blk) {
  const c = L.cell;
  const B = L.B;
  const hT = L.T / 2;
  const X0 = (blk.bx * B + 1) * c + hT;
  const X1 = (blk.bx * B + B) * c - hT;
  const Z0 = (blk.bz * B + 1) * c + hT;
  const Z1 = (blk.bz * B + B) * c - hT;
  const cx = (blk.bx * B + 3) * c;
  const cz = (blk.bz * B + 3) * c;
  // piso de chapas de metal sobre uma base escura (frestas)
  ch.props.push({
    draw: (G) => {
      G.extra.box((X0 + X1) / 2, 0.003, (Z0 + Z1) / 2, X1 - X0, 0.006, Z1 - Z0, BLACK, G.lm, { skip: ONLY_TOP, ao: 0 });
      const n = Math.round((X1 - X0) / 1.6);
      const sx = (X1 - X0) / n;
      const sz = (Z1 - Z0) / n;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const k = 0.36 + hash3(i, j, blk.bx * 31 + blk.bz) * 0.05;
          G.extra.box(X0 + (i + 0.5) * sx, 0.008, Z0 + (j + 0.5) * sz, sx - 0.025, 0.016, sz - 0.025, [k, k * 1.01, k * 1.03], G.lm, {
            skip: ONLY_TOP,
            ao: 0,
            uvScale: 0.8,
          });
        }
      }
    },
  });
  if (blk.kind === 0) turbine(L, ch, blk, cx, cz, X0, X1, Z0, Z1);
  else if (blk.kind === 1) generators(L, ch, blk, cx, cz);
  else servers(L, ch, blk, cx, cz);
  if (blk.term) terminal(L, ch, blk, blk.term);
}

// Turbina colossal: a coluna atravessa o piso e o teto (não se vê o fim dela).
function turbine(L, ch, blk, cx, cz, X0, X1, Z0, Z1) {
  const H = L.H;
  const R = 1.7;
  const housing = [0.8, 0.82, 0.83];
  ch.circles.push([cx, cz, R + 0.42]);
  ch.props.push({
    ao: [cx - R - 0.4, cx + R + 0.4, cz - R - 0.4, cz + R + 0.4, 0.15],
    draw: (G) => {
      const lm = G.lm;
      G.extra.cylinder(cx, 0.14, cz, R + 0.4, 0.28, DARK, lm, { sides: 28 });
      G.extra.cylinder(cx, H / 2, cz, R, H, housing, lm, { sides: 28, caps: false });
      for (const y of [0.55, 1.35, 2.2, 2.95]) G.extra.cylinder(cx, y, cz, R + 0.05, 0.08, DARK, lm, { sides: 28 });
      G.extra.cylinder(cx, H - 0.2, cz, R + 0.32, 0.4, STEEL, lm, { sides: 28 });
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        G.extra.box(cx + Math.cos(a) * (R + 0.04), 0.9, cz + Math.sin(a) * (R + 0.04), 0.12, 0.62, 0.07, STEEL, lm, { rot: -a, ao: 0 });
      }
      // anel de perigo pintado no piso
      const rr = R + 0.75;
      for (let i = 0; i < 32; i++) {
        const a = ((i + 0.5) / 32) * Math.PI * 2;
        G.extra.box(cx + Math.cos(a) * rr, 0.02, cz + Math.sin(a) * rr, 0.16, 0.004, (2 * Math.PI * rr) / 32 - 0.01, i % 2 ? YELLOW : BLACK, lm, {
          rot: -a,
          skip: ONLY_TOP,
          ao: 0,
        });
      }
      // dutos até as paredes cegas, no alto
      for (let s = 0; s < 4; s++) {
        if (s === blk.side || blk.glass[s]) continue;
        const along = s < 2;
        const w0 = s === 0 ? X0 : s === 1 ? X1 : s === 2 ? Z0 : Z1;
        const m0 = along ? cx : cz;
        const len = Math.abs(w0 - m0) - R + 0.05;
        const mid = (w0 + m0 + (w0 > m0 ? R : -R)) / 2;
        if (along) G.extra.cylinder(mid, 2.75, cz, 0.16, len, STEEL, lm, { axis: 'x', sides: 10, caps: false });
        else G.extra.cylinder(cx, 2.75, mid, 0.16, len, STEEL, lm, { axis: 'z', sides: 10, caps: false });
      }
      // painéis de LEDs na coluna
      for (let p = 0; p < 4; p++) {
        const a = Math.PI / 4 + (p * Math.PI) / 2;
        const nx = Math.cos(a);
        const nz = Math.sin(a);
        const tx = -nz;
        const tz = nx;
        for (let r = 0; r < 5; r++) {
          for (let q = 0; q < 3; q++) {
            const o = (q - 1) * 0.08;
            const h = hash3(p * 7 + q, r, blk.bx * 13 + blk.bz);
            const col = h < 0.12 ? LED.a : h < 0.18 ? LED.r : LED.g;
            led(G, cx + nx * (R + 0.005) + tx * o, 1.55 + r * 0.075, cz + nz * (R + 0.005) + tz * o, nx, nz, 0.035, col, h < 0.5 ? 1 + h * 2 : 0);
          }
        }
      }
    },
  });
  // colar de aletas girando em volta da coluna
  ch.dyn.push({
    pivot: [cx, 1.78, cz],
    anim: { t: 'rot', axis: 'y', speed: 0.7 },
    build: (gb, lm) => {
      gb.cylinder(cx, 1.78, cz, R + 0.08, 0.14, STEEL, lm, { sides: 28 });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        gb.box(cx + Math.cos(a) * (R + 0.22), 1.78, cz + Math.sin(a) * (R + 0.22), 0.3, 0.42, 0.035, [0.7, 0.72, 0.74], lm, { rot: -a + 0.5, ao: 0 });
      }
    },
  });
  ch.machine = { x: cx, z: cz, gain: 0.75, rate: 0.55 };
}

// Dois geradores deitados com rotores expostos e uma bomba de pistões.
function generators(L, ch, blk, cx, cz) {
  const H = L.H;
  const housing = [0.72, 0.74, 0.75];
  for (const s of [-1, 1]) {
    const gz = cz + s * 1.7;
    ch.colliders.push([cx - 2.5, cx + 2.5, gz - 0.8, gz + 0.8]);
    ch.props.push({
      ao: [cx - 2.4, cx + 2.4, gz - 0.75, gz + 0.75, 0],
      draw: (G) => {
        const lm = G.lm;
        G.extra.box(cx, 0.15, gz, 4.8, 0.3, 1.5, DARK, lm, { uvScale: 0.6 });
        G.extra.cylinder(cx - 0.15, 1.05, gz, 0.72, 4.1, housing, lm, { axis: 'x', sides: 20 });
        for (const x of [-1.7, -0.5, 0.7, 1.6]) G.extra.cylinder(cx + x, 1.05, gz, 0.77, 0.1, DARK, lm, { axis: 'x', sides: 20 });
        G.extra.box(cx - 1.1, 0.55, gz, 0.5, 0.5, 1.3, STEEL, lm, {});
        G.extra.box(cx + 1.1, 0.55, gz, 0.5, 0.5, 1.3, STEEL, lm, {});
        G.extra.box(cx - 0.9, 1.88, gz, 0.9, 0.3, 0.6, STEEL, lm, { ao: 0 });
        G.extra.cylinder(cx + 0.9, (1.7 + H) / 2, gz, 0.17, H - 1.7, STEEL, lm, { sides: 10, caps: false });
        G.extra.cylinder(cx + 0.9, H - 0.06, gz, 0.26, 0.12, DARK, lm, { sides: 10 });
        // anel de proteção do rotor
        G.extra.cylinder(cx + 2.12, 1.05, gz, 0.8, 0.22, DARK, lm, { axis: 'x', sides: 20, caps: false });
        G.extra.cylinder(cx + 2.12, 1.05, gz, 0.74, 0.22, DARK, lm, { axis: 'x', sides: 20, caps: false });
        // painel de controle virado para o corredor do meio
        const nz = -s;
        G.extra.box(cx - 0.3, 1.0, gz + nz * 0.76, 0.9, 0.5, 0.06, DARK, lm, { ao: 0 });
        for (let i = 0; i < 6; i++) {
          const h = hash3(i, s, blk.bx * 7 + blk.bz);
          led(G, cx - 0.62 + i * 0.13, 1.12, gz + nz * 0.79, 0, nz, 0.04, h < 0.2 ? LED.a : LED.g, h < 0.6 ? 1 + h : 0);
        }
        led(G, cx - 0.3, 0.92, gz + nz * 0.79, 0, nz, 0.06, LED.r, 2.3);
      },
    });
    // rotor girando rápido
    ch.dyn.push({
      pivot: [cx + 2.12, 1.05, gz],
      anim: { t: 'rot', axis: 'x', speed: 9 },
      build: (gb, lm) => {
        gb.cylinder(cx + 2.12, 1.05, gz, 0.16, 0.2, DARK, lm, { axis: 'x', sides: 10 });
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          const m = new THREE.Matrix4()
            .makeTranslation(cx + 2.12, 1.05, gz)
            .multiply(new THREE.Matrix4().makeRotationX(a))
            .multiply(new THREE.Matrix4().makeRotationY(0.5))
            .multiply(new THREE.Matrix4().makeTranslation(0, 0.4, 0));
          const geo = new THREE.BoxGeometry(0.03, 0.5, 0.16);
          const base = gb.n;
          gb.addGeometry(geo, m, [0.6, 0.62, 0.64]);
          geo.dispose();
          const l = lm(cx + 2.4, gz);
          for (let v = base; v < gb.n; v++) {
            gb.uv1[v * 2] = l[0];
            gb.uv1[v * 2 + 1] = l[1];
          }
        }
      },
    });
  }
  // bomba de pistões entre os dois
  const px = cx - 1.2;
  ch.colliders.push([px - 0.6, px + 0.6, cz - 0.45, cz + 0.45]);
  ch.props.push({
    ao: [px - 0.6, px + 0.6, cz - 0.4, cz + 0.4, 0],
    draw: (G) => {
      const lm = G.lm;
      G.extra.box(px, 0.45, cz, 1.2, 0.9, 0.8, STEEL, lm, {});
      G.extra.box(px, 0.92, cz, 1.25, 0.05, 0.85, DARK, lm, { ao: 0 });
      for (const o of [-0.3, 0.3]) G.extra.cylinder(px + o, 1.15, cz, 0.11, 0.45, DARK, lm, { sides: 10 });
      for (const s of [-1, 1]) G.extra.cylinder(px, 0.6, cz + s * 0.62, 0.08, 0.5, STEEL, lm, { axis: 'z', sides: 8, caps: false });
      led(G, px + 0.4, 0.7, cz - 0.405, 0, -1, 0.05, LED.a, 3.1);
    },
  });
  ch.dyn.push({
    pivot: [px, 1.6, cz],
    anim: { t: 'bob', amp: 0.26, freq: 1.3 },
    build: (gb, lm) => {
      for (const o of [-0.3, 0.3]) gb.cylinder(px + o, 1.62, cz, 0.055, 1.0, [0.8, 0.82, 0.84], lm, { sides: 8 });
      gb.box(px, 2.14, cz, 0.9, 0.1, 0.22, DARK, lm, { ao: 0 });
    },
  });
  ch.machine = { x: cx, z: cz, gain: 0.6, rate: 0.95 };
}

// Fileiras de servidores, um laptop esquecido e um exaustor no teto.
function servers(L, ch, blk, cx, cz) {
  const H = L.H;
  for (const o of [-2.0, 0, 2.0]) {
    const rz = cz + o;
    ch.colliders.push([cx - 2.45, cx + 2.45, rz - 0.5, rz + 0.5]);
    ch.props.push({
      ao: [cx - 2.4, cx + 2.4, rz - 0.45, rz + 0.45, 0],
      draw: (G) => {
        const lm = G.lm;
        for (let i = 0; i < 6; i++) {
          const rx = cx - 2.0 + i * 0.8;
          G.extra.box(rx, 1.05, rz, 0.78, 2.1, 0.9, [0.11, 0.12, 0.13], lm, { uvScale: 0.5 });
          for (const s of [-1, 1]) {
            G.extra.box(rx, 1.05, rz + s * 0.452, 0.66, 1.9, 0.01, [0.05, 0.055, 0.06], lm, { ao: 0 });
            for (let r = 0; r < 9; r++) {
              const y = 0.3 + r * 0.19;
              for (let q = 0; q < 3; q++) {
                const h = hash3(i * 5 + q, r * 3 + s, blk.bx * 17 + blk.bz + o * 3);
                if (h < 0.25) continue;
                const col = h < 0.33 ? LED.a : h < 0.37 ? LED.r : h < 0.7 ? LED.g : LED.b;
                led(G, rx - 0.22 + q * 0.06, y, rz + s * 0.458, 0, s, 0.022, col, h < 0.85 ? 1 + ((h * 37) % 4) : 0);
              }
              if (hash3(i, r, s + 9) < 0.4) led(G, rx + 0.12, y, rz + s * 0.458, 0, s, 0.02, LED.w, 0);
            }
          }
        }
        // eletrocalha suspensa
        G.extra.box(cx, 2.55, rz, 4.9, 0.08, 0.4, STEEL, lm, { ao: 0 });
        for (const x of [-2.2, 2.2]) G.extra.box(cx + x, (2.6 + H) / 2, rz, 0.04, H - 2.6, 0.04, STEEL, lm, { ao: 0 });
      },
    });
  }
  // laptop numa mesinha (a menor das máquinas)
  const ps = blk.side < 2 ? 2 : 0;
  const p = sidePoint(L, blk, ps, 2, 0.5);
  const rot = Math.atan2(p.nx, p.nz);
  ch.colliders.push([p.x - 0.55, p.x + 0.55, p.z - 0.55, p.z + 0.55]);
  ch.props.push({
    ao: [p.x - 0.5, p.x + 0.5, p.z - 0.35, p.z + 0.35, 0],
    draw: (G) => {
      const lm = G.lm;
      G.extra.box(p.x, 0.73, p.z, 1.1, 0.04, 0.6, PLASTIC, lm, { rot, ao: 0 });
      for (const [a, b] of [
        [-0.5, -0.25],
        [0.5, -0.25],
        [-0.5, 0.25],
        [0.5, 0.25],
      ]) {
        const [ox, oz] = rotY(a, b, rot);
        G.extra.box(p.x + ox, 0.36, p.z + oz, 0.04, 0.72, 0.04, STEEL, lm, { ao: 0 });
      }
      G.extra.box(p.x, 0.762, p.z, 0.34, 0.02, 0.24, DARK, lm, { rot, ao: 0 });
      const [sx, sz] = rotY(0, -0.12, rot);
      G.extra.box(p.x + sx, 0.88, p.z + sz, 0.34, 0.24, 0.015, DARK, lm, { rot, ao: 0 });
      vquad(G.led, p.x + sx, p.z + sz, p.nx, p.nz, 0.3, 0.775, 0.985, 0.009, null, [0.16, 0.24, 0.32], 0);
    },
  });
  // exaustor no teto sobre o corredor entre as fileiras
  const fz = cz + 1.0;
  ch.props.push({
    draw: (G) => {
      G.extra.box(cx, H - 0.14, fz, 1.3, 0.28, 1.3, STEEL, G.lm, { ao: 0 });
      G.extra.cylinder(cx, H - 0.33, fz, 0.6, 0.1, DARK, G.lm, { sides: 16, caps: false });
    },
  });
  ch.dyn.push({
    pivot: [cx, H - 0.34, fz],
    anim: { t: 'rot', axis: 'y', speed: 6 },
    build: (gb, lm) => {
      gb.cylinder(cx, H - 0.34, fz, 0.1, 0.06, DARK, lm, { sides: 8 });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        gb.box(cx + Math.cos(a) * 0.3, H - 0.34, fz + Math.sin(a) * 0.3, 0.42, 0.015, 0.14, [0.55, 0.57, 0.6], lm, { rot: -a, ao: 0 });
      }
    },
  });
  ch.machine = { x: cx, z: cz, gain: 0.32, rate: 1.55 };
}

// Terminal de controle: pedestal fixo; tela e lâmpada são montadas pelo nível.
function terminal(L, ch, blk, t) {
  const rot = Math.atan2(t.fx, t.fz);
  ch.colliders.push([t.x - 0.45, t.x + 0.45, t.z - 0.45, t.z + 0.45]);
  ch.props.push({
    ao: [t.x - 0.4, t.x + 0.4, t.z - 0.3, t.z + 0.3, 0],
    draw: (G) => {
      const lm = G.lm;
      G.extra.box(t.x, 0.5, t.z, 0.8, 1.0, 0.5, PLASTIC, lm, { rot });
      G.extra.box(t.x, 0.03, t.z, 0.9, 0.06, 0.6, DARK, lm, { rot });
      const [bx, bz] = rotY(0, -0.12, rot);
      G.extra.box(t.x + bx, 1.22, t.z + bz, 0.78, 0.46, 0.12, DARK, lm, { rot, ao: 0 });
      const [kx, kz] = rotY(0, 0.18, rot);
      G.extra.box(t.x + kx, 1.02, t.z + kz, 0.7, 0.04, 0.2, [0.2, 0.21, 0.22], lm, { rot, ao: 0 });
      G.extra.box(t.x + bx, 1.5, t.z + bz, 0.1, 0.1, 0.1, DARK, lm, { rot, ao: 0 });
    },
  });
}

// ------------------------------------------------------------ salas brancas
export function fillWhite(L, ch, blk) {
  const c = L.cell;
  const B = L.B;
  const cx = (blk.bx * B + 3) * c;
  const cz = (blk.bz * B + 3) * c;
  const opp = blk.side ^ 1;
  // o número enorme pintado em pontos na parede do fundo
  const p = sidePoint(L, blk, opp, 2.5);
  ch.props.push({ draw: (G) => paintDigit(G, p.x, p.z, p.nx, p.nz, blk.num, 2.75, 0.32) });
  if (blk.card) {
    // balcão de recepção com o cartão de acesso
    const along = blk.side < 2 ? 'z' : 'x';
    const w = along === 'x' ? 2.0 : 0.8;
    const d = along === 'x' ? 0.8 : 2.0;
    ch.colliders.push([cx - w / 2 - 0.05, cx + w / 2 + 0.05, cz - d / 2 - 0.05, cz + d / 2 + 0.05]);
    ch.props.push({
      ao: [cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, 0],
      draw: (G) => {
        G.extra.box(cx, 0.46, cz, w, 0.92, d, WHITE, G.lm, { uvScale: 0.6 });
        G.extra.box(cx, 0.94, cz, w + 0.06, 0.04, d + 0.06, [0.3, 0.32, 0.34], G.lm, { ao: 0 });
        G.extra.box(cx, 0.06, cz, w - 0.1, 0.12, d - 0.1, DARK, G.lm, {});
        // monitor desligado
        const mx = along === 'x' ? cx + 0.55 : cx;
        const mz = along === 'x' ? cz : cz + 0.55;
        G.extra.box(mx, 1.22, mz, 0.5, 0.32, 0.5, DARK, G.lm, { ao: 0, rot: 0.6 });
      },
    });
    return;
  }
  const h = hash3(blk.bx, blk.bz, L.seed + 77);
  if (h < 0.4) {
    // banco branco encostado na parede lateral
    const ps = blk.side < 2 ? 2 : 0;
    const q = sidePoint(L, blk, ps, 2.5, 0.35);
    const w = 2.4;
    const ax = q.nx === 0;
    ch.colliders.push(ax ? [q.x - w / 2, q.x + w / 2, q.z - 0.3, q.z + 0.3] : [q.x - 0.3, q.x + 0.3, q.z - w / 2, q.z + w / 2]);
    ch.props.push({
      ao: ax ? [q.x - w / 2, q.x + w / 2, q.z - 0.25, q.z + 0.25, 0] : [q.x - 0.25, q.x + 0.25, q.z - w / 2, q.z + w / 2, 0],
      draw: (G) => {
        G.extra.box(q.x, 0.42, q.z, ax ? w : 0.5, 0.08, ax ? 0.5 : w, WHITE, G.lm, { ao: 0 });
        for (const s of [-1, 1]) {
          const ox = ax ? s * (w / 2 - 0.15) : 0;
          const oz = ax ? 0 : s * (w / 2 - 0.15);
          G.extra.box(q.x + ox, 0.19, q.z + oz, ax ? 0.08 : 0.42, 0.38, ax ? 0.42 : 0.08, STEEL, G.lm, {});
        }
      },
    });
  } else if (h < 0.7) {
    // mesa com um laptop aberto, tela acesa
    ch.colliders.push([cx - 0.65, cx + 0.65, cz - 0.45, cz + 0.45]);
    ch.props.push({
      ao: [cx - 0.6, cx + 0.6, cz - 0.4, cz + 0.4, 0],
      draw: (G) => {
        G.extra.box(cx, 0.74, cz, 1.2, 0.04, 0.8, WHITE, G.lm, { ao: 0 });
        G.extra.cylinder(cx, 0.37, cz, 0.06, 0.72, STEEL, G.lm, { sides: 8 });
        G.extra.cylinder(cx, 0.02, cz, 0.35, 0.04, STEEL, G.lm, { sides: 14 });
        G.extra.box(cx, 0.772, cz + 0.05, 0.34, 0.02, 0.24, DARK, G.lm, { ao: 0 });
        G.extra.box(cx, 0.89, cz - 0.07, 0.34, 0.24, 0.015, DARK, G.lm, { ao: 0, rot: 0 });
        vquad(G.led, cx, cz - 0.07, 0, 1, 0.3, 0.785, 0.995, 0.009, null, [0.2, 0.3, 0.42], 0);
      },
    });
  }
}

// ------------------------------------------------------------ a comporta
// Túnel curto que termina numa comporta circular na parede do quarteirão.
export function fillHatch(L, ch, h) {
  const R = h.r;
  ch.props.push({
    draw: (G) => {
      const lm = G.lm;
      const fx = h.x;
      // chapa de fundo e moldura em anel
      G.extra.box(fx - 0.03, h.y, h.z, 0.06, 2.9, 2.9, DARK, lm, { uvScale: 0.5 });
      const ring = new THREE.TorusGeometry(R + 0.06, 0.13, 10, 40);
      const m = new THREE.Matrix4().makeTranslation(fx - 0.1, h.y, h.z).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
      addGeoLM(G.extra, ring, m, STEEL, lm);
      // faixa de perigo em volta
      for (let i = 0; i < 28; i++) {
        const a = ((i + 0.5) / 28) * Math.PI * 2;
        const rr = R + 0.32;
        G.extra.box(fx - 0.065, h.y + Math.sin(a) * rr, h.z + Math.cos(a) * rr, 0.012, (2 * Math.PI * rr) / 28 - 0.01, 0.16, i % 2 ? YELLOW : BLACK, lm, {
          ao: 0,
        });
      }
      // parafusos
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        G.extra.cylinder(fx - 0.2, h.y + Math.sin(a) * (R + 0.07), h.z + Math.cos(a) * (R + 0.07), 0.03, 0.06, DARK, lm, { axis: 'x', sides: 6 });
      }
      // dobradiças
      for (const y of [h.y - 0.6, h.y + 0.6]) G.extra.box(fx - 0.18, y, h.z + R + 0.05, 0.2, 0.22, 0.18, DARK, lm, { ao: 0 });
      // faixa de perigo no piso em frente
      for (let i = 0; i < 10; i++) {
        const z = h.z - 1.35 + (i + 0.5) * 0.27;
        G.extra.box(fx - 0.9, 0.012, z, 0.12, 0.004, 0.25, i % 2 ? YELLOW : BLACK, lm, { skip: ONLY_TOP, ao: 0 });
      }
      // sirenes giratórias (base) e caixa do painel de status
      for (const s of [-1, 1]) G.extra.box(fx - 0.08, 2.75, h.z + s * 1.25, 0.16, 0.12, 0.2, DARK, lm, { ao: 0 });
      G.extra.box(fx - 0.06, 1.3, h.z - 1.55, 0.12, 0.3, 0.2, DARK, lm, { ao: 0 });
    },
  });
}
