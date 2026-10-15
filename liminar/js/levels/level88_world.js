// Nível 88 — geografia do Lago Silencioso: um lago comprido e imóvel no fundo
// de um vale de floresta fechada. Funções de altura do terreno, margens, trilha,
// texturas procedurais (chão de floresta, lama, rocha, casca, ramos de abeto,
// samambaia) e as malhas de terreno, água e árvores.
import * as THREE from 'three';
import { registerTexture, TEX } from '../textures.js';
import { clamp, fbm, hash3, mulberry32, TAU } from '../util.js';

const { toTex, noiseField, whiteNoise, paintRGB, normalMap } = TEX;

// ------------------------------------------------------------ geografia
export const WORLD = { x0: -265, x1: 262, half: 150 };
export const LAKE_END = 214; // o lago termina aqui (a leste fica o paredão da caverna)
export const DEEP = -1.05; // mais fundo que isto não dá para andar

// Linha central do vale/lago e meia-largura da água.
export function zc(x) {
  return 30 * Math.sin(x / 75 + 0.4) + 14 * Math.sin(x / 33 + 1.7);
}
export function halfW(x) {
  let w = 34 + 14 * Math.sin(x / 58 + 2.0) + 8 * Math.sin(x / 23);
  // estreita e termina no leste
  const t = clamp((LAKE_END - x) / 30, 0, 1);
  w *= t * t * (3 - 2 * t);
  return w;
}
// Distância (aproximada) até a margem: < 0 dentro d'água.
export function shoreS(x, z) {
  return Math.abs(z - zc(x)) - halfW(x);
}
// Trilha antiga pela margem sul (+z).
export function trailZ(x) {
  return zc(x) + Math.max(halfW(x), 6) + 9 + 3 * Math.sin(x / 17) + 1.5 * Math.sin(x / 7.3);
}

const SEED = 8888;
function hills(x, z) {
  return fbm(x * 0.012, z * 0.012, 4, SEED) * 9 + fbm(x * 0.05, z * 0.05, 2, SEED + 3) * 1.2;
}

// Altura do chão (o nível da água é y = 0).
export function groundH(x, z) {
  const s = shoreS(x, z);
  let h;
  if (s < 0) {
    const d = -s;
    h = d < 7 ? -0.04 - d * 0.13 : -0.95 - (d - 7) * 0.38;
    h = Math.max(h, -9);
    h += fbm(x * 0.08, z * 0.08, 2, SEED + 9) * 0.12;
  } else {
    const rel = Math.abs(z - zc(x));
    h = 0.2 + 1.7 * (1 - Math.exp(-s / 7));
    h += (hills(x, z) + 3) * clamp((s - 6) / 40, 0, 1);
    // paredes do vale
    const wall = Math.max(0, rel - 115);
    h += wall * wall * 0.02 + wall * 0.25;
    h += fbm(x * 0.17, z * 0.17, 2, SEED + 5) * 0.25;
    // trilha: um pouco rebaixada e lisa
    const tz = trailZ(x);
    const td = Math.abs(z - tz);
    if (td < 3) h -= (1 - td / 3) * 0.12;
  }
  // paredão de pedra no leste (onde fica a caverna)
  if (x > 220) {
    const k = clamp((x - 220) / 10, 0, 1);
    h += k * k * (14 + fbm(z * 0.08, x * 0.08, 3, SEED + 7) * 5) + Math.max(0, x - 232) * 0.6;
  }
  // a boca da caverna fica num recorte plano
  const cdx = x - CAVE.x;
  const cdz = z - CAVE.z;
  const cr = Math.hypot(cdx * 0.8, cdz);
  if (cr < 9 && x < CAVE.x + 2) h = h + (CAVE.y - h) * clamp((9 - cr) / 4, 0, 1);
  // borda do mundo
  const bx = Math.max(0, WORLD.x0 + 12 - x, x - (WORLD.x1 - 6));
  h += bx * bx * 0.15;
  return h;
}

// Entrada da caverna (no pé do paredão, perto do fim do lago, margem sul).
export const CAVE = { x: 222.5, z: 0, y: 0 };
CAVE.z = zc(222) + 12;
CAVE.y = 0.6;

export function slopeAt(x, z) {
  const e = 0.8;
  const dx = groundH(x + e, z) - groundH(x - e, z);
  const dz = groundH(x, z + e) - groundH(x, z - e);
  return Math.hypot(dx, dz) / (2 * e);
}

// ------------------------------------------------------------ texturas
// Chão de floresta: terra escura, acículas de pinheiro, musgo, gravetos.
registerTexture('l88Floor', (S) => {
  const low = noiseField(S, S, 4, 4, 5, 8801);
  const moss = noiseField(S, S, 6, 6, 4, 8802);
  const fine = whiteNoise(S * S, 8803);
  const hf = new Float32Array(S * S);
  const cv = TEX.makeCanvas(S, S);
  const c = cv.getContext('2d');
  const img = c.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const m = clamp((moss[i] - 0.55) * 4, 0, 1);
    const k = 0.75 + low[i] * 0.4 + fine[i] * 0.06;
    let r = 0.3 * k;
    let g = 0.23 * k;
    let b = 0.16 * k;
    r = r * (1 - m) + 0.2 * m * k;
    g = g * (1 - m) + 0.28 * m * k;
    b = b * (1 - m) + 0.11 * m * k;
    img.data[i * 4] = r * 255;
    img.data[i * 4 + 1] = g * 255;
    img.data[i * 4 + 2] = b * 255;
    img.data[i * 4 + 3] = 255;
    hf[i] = low[i] * 0.4 + m * 0.3;
  }
  c.putImageData(img, 0, 0);
  // acículas e gravetos
  const r = mulberry32(8804);
  const n = Math.floor((S * S) / 180);
  for (let i = 0; i < n; i++) {
    const x = r() * S;
    const y = r() * S;
    const a = r() * TAU;
    const L = (3 + r() * 7) * (S / 512);
    const sh = 0.5 + r() * 0.7;
    c.strokeStyle = r() < 0.75 ? `rgba(${(120 * sh) | 0},${(82 * sh) | 0},${(48 * sh) | 0},0.85)` : `rgba(${(70 * sh) | 0},${(60 * sh) | 0},${(45 * sh) | 0},0.9)`;
    c.lineWidth = Math.max(0.6, (S / 512) * (r() < 0.06 ? 2.2 : 0.9));
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + Math.cos(a) * L * (r() < 0.06 ? 3 : 1), y + Math.sin(a) * L * (r() < 0.06 ? 3 : 1));
    c.stroke();
  }
  // pequenas pedras
  for (let i = 0; i < 40; i++) {
    const x = r() * S;
    const y = r() * S;
    const rr = (1 + r() * 3) * (S / 256);
    c.fillStyle = `rgba(${90 + r() * 30},${88 + r() * 25},${80 + r() * 20},0.9)`;
    c.beginPath();
    c.ellipse(x, y, rr, rr * 0.7, r() * 3, 0, TAU);
    c.fill();
  }
  const hd = TEX.canvasHeight(cv);
  for (let i = 0; i < S * S; i++) hf[i] = hf[i] * 0.5 + hd[i] * 0.8;
  return { map: toTex(cv), normalMap: normalMap(hf, S, S, 3) };
});

// Lama úmida e lodo da margem.
registerTexture('l88Mud', (S) => {
  const low = noiseField(S, S, 5, 5, 5, 8811);
  const fine = whiteNoise(S * S, 8812);
  const hf = new Float32Array(S * S);
  const rg = new Float32Array(S * S);
  const cv = paintRGB(S, S, (x, y, i, o) => {
    const k = 0.7 + low[i] * 0.5 + fine[i] * 0.04;
    o[0] = 0.18 * k;
    o[1] = 0.165 * k;
    o[2] = 0.13 * k;
    hf[i] = low[i] + fine[i] * 0.05;
    rg[i] = clamp(0.25 + low[i] * 0.4, 0.1, 0.7);
  });
  const rgh = paintRGB(S, S, (x, y, i, o) => {
    o[0] = o[1] = o[2] = rg[i];
  });
  return { map: toTex(cv), normalMap: normalMap(hf, S, S, 2), roughnessMap: toTex(rgh, { srgb: false }) };
});

// Rocha cinza com rachaduras e líquen.
registerTexture('l88Rock', (S) => {
  const low = noiseField(S, S, 4, 4, 6, 8821);
  const cr = noiseField(S, S, 10, 10, 3, 8822);
  const li = noiseField(S, S, 8, 8, 3, 8823);
  const hf = new Float32Array(S * S);
  const cv = paintRGB(S, S, (x, y, i, o) => {
    const crack = Math.abs(cr[i] - 0.5) < 0.012 ? 0.45 : 1;
    const l = li[i] > 0.68 ? 1 : 0;
    const k = (0.62 + low[i] * 0.45) * crack;
    o[0] = (l ? 0.44 : 0.4) * k;
    o[1] = (l ? 0.46 : 0.4) * k;
    o[2] = (l ? 0.34 : 0.39) * k;
    hf[i] = low[i] * crack;
  });
  return { map: toTex(cv), normalMap: normalMap(hf, S, S, 4) };
});

// Casca de abeto: sulcos verticais escuros.
registerTexture('l88Bark', (S) => {
  const n = noiseField(S, S, 16, 3, 4, 8831);
  const f = noiseField(S, S, 32, 8, 2, 8832);
  const hf = new Float32Array(S * S);
  const cv = paintRGB(S, S, (x, y, i, o) => {
    const ridge = Math.abs(Math.sin(x * ((TAU * 12) / S) + n[i] * 6));
    const k = 0.45 + ridge * 0.45 + f[i] * 0.2;
    o[0] = 0.26 * k;
    o[1] = 0.21 * k;
    o[2] = 0.17 * k;
    hf[i] = ridge;
  });
  return { map: toTex(cv), normalMap: normalMap(hf, S, S, 3) };
});

// Ramo de abeto (cartão com transparência): eixo de x=0 a x=1, raminhos
// pendentes cobertos de acículas, com falhas entre eles.
registerTexture('l88Needles', (S) => {
  const W = S;
  const H = S >> 1;
  const cv = TEX.makeCanvas(W, H);
  const c = cv.getContext('2d');
  const r = mulberry32(8841);
  const sc = W / 256;
  const needles = (px, py, ang, len, dens) => {
    const n = Math.max(3, Math.floor((len / sc) * dens));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const x = px + Math.cos(ang) * len * t;
      const y = py + Math.sin(ang) * len * t;
      const l = (3.2 + r() * 2.2) * sc * (1 - t * 0.45);
      for (const s of [-1, 1]) {
        const a = ang + s * (0.75 + r() * 0.5) + 0.35;
        const sh = 0.6 + r() * 0.55;
        c.strokeStyle = `rgb(${(36 * sh) | 0},${(60 * sh) | 0},${(44 * sh) | 0})`;
        c.lineWidth = Math.max(0.8, 1.05 * sc);
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
        c.stroke();
      }
    }
  };
  // galho principal (marrom), levemente arqueado
  c.strokeStyle = 'rgb(52,40,28)';
  c.lineWidth = 2.2 * sc;
  c.beginPath();
  c.moveTo(1, H * 0.45);
  c.quadraticCurveTo(W * 0.5, H * 0.4, W - 4, H * 0.55);
  c.stroke();
  // raminhos laterais pendentes
  for (let i = 0; i < 16; i++) {
    const t = 0.04 + i * 0.06 + r() * 0.02;
    const x = W * t;
    const y = H * (0.45 - 0.05 * Math.sin(t * Math.PI) + t * 0.1);
    const len = H * (0.55 - t * 0.3) * (0.7 + r() * 0.4);
    for (const s of [-1, 1]) {
      if (r() < 0.12) continue;
      const a = s * (0.6 + r() * 0.35) + 0.25;
      c.strokeStyle = 'rgb(46,36,26)';
      c.lineWidth = 1 * sc;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      c.stroke();
      needles(x, y, a, len, 0.9);
    }
  }
  needles(1, H * 0.45, -0.02, W - 6, 0.6);
  return { map: toTex(cv, { repeat: false }) };
});

// Silhueta inteira de um abeto (árvores distantes).
registerTexture('l88SpruceFar', (S) => {
  const W = S >> 1;
  const H = S;
  const cv = TEX.makeCanvas(W, H);
  const c = cv.getContext('2d');
  const r = mulberry32(8851);
  c.fillStyle = 'rgb(46,36,28)';
  c.fillRect(W / 2 - W * 0.025, H * 0.82, W * 0.05, H * 0.18);
  const tiers = 26;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const y = H * (0.86 - t * 0.84);
    const R = W * 0.48 * Math.pow(1 - t, 0.9) + W * 0.02;
    for (let k = 0; k < 14; k++) {
      const s = k % 2 ? 1 : -1;
      const len = R * (0.6 + r() * 0.4);
      const sh = 0.6 + r() * 0.4;
      c.fillStyle = `rgb(${(22 * sh) | 0},${(38 * sh) | 0},${(28 * sh) | 0})`;
      c.beginPath();
      c.moveTo(W / 2, y - H * 0.012);
      c.quadraticCurveTo(W / 2 + s * len * 0.6, y - H * 0.004, W / 2 + s * len, y + H * (0.025 + r() * 0.02));
      c.lineTo(W / 2 + s * len * 0.7, y + H * 0.03);
      c.lineTo(W / 2, y + H * 0.02);
      c.fill();
    }
  }
  return { map: toTex(cv, { repeat: false }) };
});

// Samambaia (cartão).
registerTexture('l88Fern', (S) => {
  const cv = TEX.makeCanvas(S, S);
  const c = cv.getContext('2d');
  const r = mulberry32(8861);
  const sc = S / 256;
  for (let f = 0; f < 7; f++) {
    const a = -Math.PI / 2 + (f - 3) * 0.32 + (r() - 0.5) * 0.2;
    const L = S * (0.38 + r() * 0.12);
    const x0 = S / 2;
    const y0 = S;
    let px = x0;
    let py = y0;
    for (let i = 0; i < 24; i++) {
      const t = i / 24;
      const ang = a + t * t * 0.9 * Math.sign(a + Math.PI / 2 || 1);
      const nx = px + Math.cos(ang) * (L / 24);
      const ny = py + Math.sin(ang) * (L / 24);
      c.strokeStyle = 'rgb(38,52,28)';
      c.lineWidth = 1.4 * sc;
      c.beginPath();
      c.moveTo(px, py);
      c.lineTo(nx, ny);
      c.stroke();
      const lf = (1 - t) * 14 * sc + 2 * sc;
      for (const s of [-1, 1]) {
        const sh = 0.6 + r() * 0.5;
        c.fillStyle = `rgb(${(40 * sh) | 0},${(66 * sh) | 0},${(30 * sh) | 0})`;
        c.beginPath();
        c.ellipse(nx + Math.cos(ang + s * 1.3) * lf * 0.5, ny + Math.sin(ang + s * 1.3) * lf * 0.5, lf * 0.55, 1.6 * sc, ang + s * 1.3, 0, TAU);
        c.fill();
      }
      px = nx;
      py = ny;
    }
  }
  return { map: toTex(cv, { repeat: false }) };
});

// Toras da cabana: madeira cinzenta envelhecida com veios.
registerTexture('l88Logs', (S) => {
  const n = noiseField(S, S, 4, 16, 4, 8871);
  const f = whiteNoise(S * S, 8872);
  const hf = new Float32Array(S * S);
  const cv = paintRGB(S, S, (x, y, i, o) => {
    const grain = Math.sin(y * ((TAU * 20) / S) + n[i] * 8) * 0.5 + 0.5;
    const k = 0.55 + grain * 0.3 + n[i] * 0.25 + f[i] * 0.04;
    o[0] = 0.3 * k;
    o[1] = 0.26 * k;
    o[2] = 0.21 * k;
    hf[i] = grain;
  });
  return { map: toTex(cv), normalMap: normalMap(hf, S, S, 2) };
});

// ------------------------------------------------------------ terreno
// Malha única sobre todo o vale, com pesos de lama (margem), rocha (encosta) e trilha.
export function makeTerrainGeometry(step) {
  const x0 = WORLD.x0 - 20;
  const x1 = WORLD.x1 + 20;
  const zMin = -WORLD.half - 70;
  const zMax = WORLD.half + 70;
  const nx = Math.ceil((x1 - x0) / step);
  const nz = Math.ceil((zMax - zMin) / step);
  const N = (nx + 1) * (nz + 1);
  const pos = new Float32Array(N * 3);
  const nor = new Float32Array(N * 3);
  const uv = new Float32Array(N * 2);
  const mix = new Float32Array(N * 3);
  const H = new Float32Array(N);
  let i = 0;
  for (let j = 0; j <= nz; j++) {
    for (let k = 0; k <= nx; k++, i++) {
      const x = x0 + k * step;
      // o vale acompanha a linha central (as linhas da malha se curvam junto)
      const z = zMin + j * step + zc(x);
      const h = groundH(x, z);
      H[i] = h;
      pos[i * 3] = x;
      pos[i * 3 + 1] = h;
      pos[i * 3 + 2] = z;
      uv[i * 2] = x / 4;
      uv[i * 2 + 1] = z / 4;
      const s = shoreS(x, z);
      const mud = clamp(1 - (s - 1.5) / 5, 0, 1);
      const td = Math.abs(z - trailZ(x));
      const path = x > WORLD.x0 + 15 && x < CAVE.x ? clamp(1 - td / 1.8, 0, 1) * 0.85 : 0;
      mix[i * 3] = mud;
      mix[i * 3 + 1] = 0;
      mix[i * 3 + 2] = path;
    }
  }
  // normais e rocha nas encostas íngremes
  const W = nx + 1;
  for (let j = 0; j <= nz; j++) {
    for (let k = 0; k <= nx; k++) {
      const a = j * W + k;
      const hl = H[j * W + Math.max(0, k - 1)];
      const hr = H[j * W + Math.min(nx, k + 1)];
      const hd = H[Math.max(0, j - 1) * W + k];
      const hu = H[Math.min(nz, j + 1) * W + k];
      const dx = (hr - hl) / (2 * step);
      const dz = (hu - hd) / (2 * step);
      const l = Math.hypot(dx, 1, dz);
      nor[a * 3] = -dx / l;
      nor[a * 3 + 1] = 1 / l;
      nor[a * 3 + 2] = -dz / l;
      const sl = Math.hypot(dx, dz);
      mix[a * 3 + 1] = clamp((sl - 0.6) * 2.2, 0, 1);
    }
  }
  const idx = new Uint32Array(nx * nz * 6);
  let q = 0;
  for (let j = 0; j < nz; j++) {
    for (let k = 0; k < nx; k++) {
      const a = j * W + k;
      const b = a + 1;
      const c = a + W;
      const d = c + 1;
      idx[q++] = a;
      idx[q++] = c;
      idx[q++] = b;
      idx[q++] = b;
      idx[q++] = c;
      idx[q++] = d;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aMix', new THREE.BufferAttribute(mix, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

// Material do terreno: mistura chão de floresta, lama molhada, rocha e trilha.
export function patchTerrain(mat, maps) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.tMud = { value: maps.mud };
    sh.uniforms.tRock = { value: maps.rock };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aMix;\nvarying vec3 vMix;\nvarying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMix = aMix;\nvWP = ( modelMatrix * vec4( position, 1.0 ) ).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tMud;\nuniform sampler2D tRock;\nvarying vec3 vMix;\nvarying vec3 vWP;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        // boca da caverna: o túnel tem geometria própria
        if ( vWP.x > ${(CAVE.x + 1.3).toFixed(2)} && vWP.x < ${(CAVE.x + 18).toFixed(2)} && abs( vWP.z - ${CAVE.z.toFixed(2)} ) < 2.2 && vWP.y < ${(CAVE.y + 2.4).toFixed(2)} - ( vWP.x - ${CAVE.x.toFixed(2)} ) * 0.17 ) discard;
        vec2 wuv = vWP.xz / 4.0;
        vec3 mud = texture2D( tMud, wuv * 1.3 ).rgb;
        vec3 rock = texture2D( tRock, vec2( vWP.x + vWP.z, vWP.y ) / 6.0 ).rgb;
        diffuseColor.rgb = mix( diffuseColor.rgb, mud * vec3( 1.25, 1.18, 1.05 ), vMix.z );
        diffuseColor.rgb = mix( diffuseColor.rgb, mud, vMix.x );
        diffuseColor.rgb = mix( diffuseColor.rgb, rock, vMix.y );
        // faixa molhada logo acima da água
        float wet = smoothstep( 0.6, 0.02, vWP.y ) * ( 1.0 - vMix.y );
        diffuseColor.rgb *= 1.0 - wet * 0.45;
        // variação ampla de tom
        float big = sin( vWP.x * 0.031 ) * sin( vWP.z * 0.027 + 1.3 );
        diffuseColor.rgb *= 0.88 + big * 0.12;`,
      );
    if (sh.fragmentShader.includes('#include <roughnessmap_fragment>'))
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = mix( roughnessFactor, 0.25, smoothstep( 0.6, 0.02, vWP.y ) * 0.8 );',
      );
  };
  mat.customProgramCacheKey = () => 'l88-terrain';
}

// ------------------------------------------------------------ água
// Faixa que cobre o lago acompanhando a linha central. aDepth = profundidade.
export function makeWaterGeometry(lowQ) {
  const nxS = lowQ ? 220 : 340;
  const nzS = lowQ ? 18 : 28;
  const x0 = WORLD.x0 - 40;
  const x1 = LAKE_END + 4;
  const pos = [];
  const dep = [];
  const idx = [];
  for (let i = 0; i <= nxS; i++) {
    const x = x0 + ((x1 - x0) * i) / nxS;
    const w = halfW(x) + 4;
    for (let j = 0; j <= nzS; j++) {
      const v = j / nzS;
      const z = zc(x) + (v * 2 - 1) * w;
      pos.push(x, 0, z);
      dep.push(Math.max(0, -groundH(x, z)));
    }
  }
  const W = nzS + 1;
  for (let i = 0; i < nxS; i++) {
    for (let j = 0; j < nzS; j++) {
      const a = i * W + j;
      const b = a + W;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aDepth', new THREE.Float32BufferAttribute(dep, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export function makeWaterMaterial(hq) {
  return new THREE.ShaderMaterial({
    defines: hq ? { HQ: 1 } : {},
    uniforms: {
      uTime: { value: 0 },
      uMirror: { value: 0 },
      tMirror: { value: null },
      uTexMat: { value: new THREE.Matrix4() },
      uSkyTop: { value: new THREE.Color() },
      uSkyHor: { value: new THREE.Color() },
      uFogC: { value: new THREE.Color() },
      uFogD: { value: 0.01 },
      uDeep: { value: new THREE.Color(0.004, 0.006, 0.007) },
      uShallow: { value: new THREE.Color(0.03, 0.032, 0.026) },
      uFlashP: { value: new THREE.Vector3() },
      uFlashD: { value: new THREE.Vector3(0, -1, 0) },
      uFlash: { value: 0 },
      uRings: { value: [new THREE.Vector4(0, 0, -99, 0), new THREE.Vector4(0, 0, -99, 0), new THREE.Vector4(0, 0, -99, 0), new THREE.Vector4(0, 0, -99, 0)] },
      uMist: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float aDepth;
      varying float vDepth;
      varying vec3 vW;
      varying vec4 vM;
      uniform mat4 uTexMat;
      void main() {
        vDepth = aDepth;
        vec4 w = modelMatrix * vec4( position, 1.0 );
        vW = w.xyz;
        vM = uTexMat * w;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uMirror, uFogD, uFlash, uMist;
      uniform sampler2D tMirror;
      uniform vec3 uSkyTop, uSkyHor, uFogC, uDeep, uShallow, uFlashP, uFlashD;
      uniform vec4 uRings[4];
      varying float vDepth;
      varying vec3 vW;
      varying vec4 vM;
      float h2( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
      float n2( vec2 p ) {
        vec2 i = floor( p ); vec2 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
        return mix( mix( h2( i ), h2( i + vec2( 1, 0 ) ), f.x ), mix( h2( i + vec2( 0, 1 ) ), h2( i + vec2( 1, 1 ) ), f.x ), f.y );
      }
      void main() {
        vec3 v = cameraPosition - vW;
        float dist = length( v );
        v /= dist;
        // superfície quase parada: ondulação mínima e anéis onde o jogador entra na água
        vec2 g = vec2( 0.0 );
        vec2 p = vW.xz;
        #ifdef HQ
        float e = 0.15;
        float a0 = n2( p * 0.35 + uTime * 0.02 ) + n2( p * 1.1 - uTime * 0.03 ) * 0.5;
        float ax = n2( ( p + vec2( e, 0.0 ) ) * 0.35 + uTime * 0.02 ) + n2( ( p + vec2( e, 0.0 ) ) * 1.1 - uTime * 0.03 ) * 0.5;
        float az = n2( ( p + vec2( 0.0, e ) ) * 0.35 + uTime * 0.02 ) + n2( ( p + vec2( 0.0, e ) ) * 1.1 - uTime * 0.03 ) * 0.5;
        g = vec2( ax - a0, az - a0 ) / e * 0.006;
        #endif
        for ( int i = 0; i < 4; i++ ) {
          vec4 R = uRings[ i ];
          float age = uTime - R.z;
          if ( age < 0.0 || age > 4.0 ) continue;
          vec2 d = p - R.xy;
          float r = length( d ) + 1e-4;
          float front = age * 0.9;
          float w = sin( ( r - front ) * 9.0 ) * exp( -abs( r - front ) * 2.5 ) * exp( -age * 0.9 ) * R.w;
          g += d / r * w * 0.08;
        }
        vec3 n = normalize( vec3( -g.x, 1.0, -g.y ) );
        float cosT = max( dot( n, v ), 0.0 );
        float F = 0.02 + 0.98 * pow( 1.0 - cosT, 5.0 );
        // reflexo: espelho planar (ou o céu, nas qualidades sem espelho)
        vec3 rd = reflect( -v, n );
        vec3 refl = mix( uSkyHor, uSkyTop, clamp( rd.y * 1.6, 0.0, 1.0 ) );
        // linha escura das árvores refletida (aproximação sem espelho)
        float tree = smoothstep( 0.02, 0.12, rd.y ) * ( 1.0 - smoothstep( 0.12, 0.3 + n2( vec2( atan( rd.z, rd.x ) * 30.0, 0.0 ) ) * 0.1, rd.y ) );
        refl = mix( refl, uDeep * 0.5, tree * 0.85 );
        if ( uMirror > 0.5 ) {
          vec2 uv = vM.xy / vM.w + n.xz * 0.04;
          refl = texture2D( tMirror, uv ).rgb;
        }
        // corpo d'água: escuro e frio; raso deixa ver o fundo (alfa)
        vec3 body = mix( uShallow, uDeep, smoothstep( 0.0, 2.5, vDepth ) );
        // luz da lanterna espalhada na água turva
        vec3 toF = vW - uFlashP;
        float fd = length( toF );
        float spot = smoothstep( 0.86, 0.97, dot( toF / fd, uFlashD ) ) * uFlash / ( 1.0 + fd * fd * 0.05 );
        body += vec3( 0.9, 0.85, 0.7 ) * spot * 0.06;
        // brilho especular da lanterna no espelho d'água
        vec3 hv = normalize( normalize( uFlashP - vW ) + v );
        refl += vec3( 1.0, 0.95, 0.8 ) * pow( max( dot( n, hv ), 0.0 ), 400.0 ) * spot * 6.0;
        vec3 col = mix( body, refl, F );
        float alpha = clamp( smoothstep( 0.0, 1.1, vDepth ) * 0.9 + F + 0.05, 0.0, 1.0 );
        // névoa baixa sobre a água à noite
        col = mix( col, uFogC * 1.4, uMist * 0.25 * ( 1.0 - exp( -dist * 0.02 ) ) );
        float fogF = 1.0 - exp( -uFogD * uFogD * dist * dist );
        col = mix( col, uFogC, fogF );
        gl_FragColor = vec4( col, alpha );
      }`,
    transparent: true,
    depthWrite: false,
  });
}

// ------------------------------------------------------------ árvores
// Abeto detalhado: tronco + cone interno + camadas de cartões de ramos.
// Grupos: 0 casca, 1 ramos (com transparência), 2 núcleo escuro.
export function spruceGeometry(H, seed, tiers = 12) {
  const r = mulberry32(seed);
  const pos = [];
  const nor = [];
  const uv = [];
  const groups = [[], [], []];
  const verts = [];
  const add = (gi, p, n, t) => {
    verts.push({ gi, p, n, t });
  };
  // tronco
  const trunk = new THREE.CylinderGeometry(0.035 * H * 0.25 + 0.03, 0.022 * H + 0.08, H, 7, 1, true).translate(0, H / 2, 0);
  const core = new THREE.ConeGeometry(0.13 * H, H * 0.8, 9, 1, true).translate(0, H * 0.18 + H * 0.4, 0);
  const pushGeo = (g, gi, uvS = 1) => {
    const ng = g.toNonIndexed();
    const P = ng.attributes.position;
    const N = ng.attributes.normal;
    const U = ng.attributes.uv;
    for (let i = 0; i < P.count; i++)
      add(gi, [P.getX(i), P.getY(i), P.getZ(i)], [N.getX(i), N.getY(i), N.getZ(i)], [U.getX(i) * uvS, U.getY(i) * H * 0.4 * uvS]);
    ng.dispose();
    g.dispose();
  };
  pushGeo(trunk, 0);
  pushGeo(core, 2);
  for (let t = 0; t < tiers; t++) {
    const f = t / tiers;
    const y = H * (0.14 + 0.84 * f);
    const R = 0.21 * H * Math.pow(1 - f, 0.85) + 0.35;
    const k = Math.max(4, Math.round(8 - f * 4));
    const a0 = r() * TAU;
    for (let i = 0; i < k; i++) {
      const a = a0 + (i / k) * TAU + (r() - 0.5) * 0.4;
      const droop = 0.25 + r() * 0.25 + f * 0.15;
      const len = R * (0.8 + r() * 0.35);
      const wid = len * 0.5;
      const ox = Math.cos(a);
      const oz = Math.sin(a);
      // eixo do ramo (para fora e para baixo) e direção lateral
      const dir = new THREE.Vector3(ox * Math.cos(droop), -Math.sin(droop), oz * Math.cos(droop));
      const side = new THREE.Vector3(-oz, 0, ox);
      const roll = (r() - 0.5) * 0.5;
      const up = new THREE.Vector3().crossVectors(side, dir).normalize();
      side.applyAxisAngle(dir, roll);
      up.applyAxisAngle(dir, roll);
      const b = new THREE.Vector3(ox * 0.08, y + (r() - 0.5) * 0.15, oz * 0.08);
      const P = (s, w) => b.clone().addScaledVector(dir, s * len).addScaledVector(side, (w - 0.5) * wid);
      const tex = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
        [1, 1],
        [0, 1],
      ];
      // normal "de folhagem": para fora do tronco e para cima (iluminação suave dos dois lados)
      const n = [ox * 0.55, 0.8, oz * 0.55];
      const quad = [P(0, 0), P(1, 0), P(1, 1), P(0, 0), P(1, 1), P(0, 1)];
      for (let q = 0; q < 6; q++) add(1, [quad[q].x, quad[q].y, quad[q].z], n, tex[q]);
      // segundo cartão girado em torno do galho (dá volume)
      side.applyAxisAngle(dir, 1.1);
      const quad2 = [P(0, 0), P(1, 0), P(1, 1), P(0, 0), P(1, 1), P(0, 1)];
      for (let q = 0; q < 6; q++) add(1, [quad2[q].x, quad2[q].y, quad2[q].z], n, tex[q]);
    }
  }
  // monta com grupos contíguos
  for (const v of verts) groups[v.gi].push(v);
  const g = new THREE.BufferGeometry();
  let start = 0;
  for (let gi = 0; gi < 3; gi++) {
    for (const v of groups[gi]) {
      pos.push(...v.p);
      const l = Math.hypot(...v.n) || 1;
      nor.push(v.n[0] / l, v.n[1] / l, v.n[2] / l);
      uv.push(...v.t);
    }
    g.addGroup(start, groups[gi].length, gi);
    start += groups[gi].length;
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  return g;
}

// Abeto distante: dois cartões cruzados com a silhueta.
export function spruceFarGeometry(H) {
  const w = H * 0.62;
  const g = new THREE.BufferGeometry();
  const pos = [];
  const nor = [];
  const uv = [];
  for (const a of [0, Math.PI / 2]) {
    const cx = Math.cos(a) * w * 0.5;
    const cz = Math.sin(a) * w * 0.5;
    const P = [
      [-cx, 0, -cz],
      [cx, 0, cz],
      [cx, H, cz],
      [-cx, 0, -cz],
      [cx, H, cz],
      [-cx, H, -cz],
    ];
    const T = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
      [1, 1],
      [0, 1],
    ];
    for (let i = 0; i < 6; i++) {
      pos.push(...P[i]);
      nor.push(0, 0.6, 0.8);
      uv.push(...T[i]);
    }
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  return g;
}

// Distribui as árvores pelo vale (grade com variação). Cada árvore: {x, z, y, s, rot, kind, r}
export function scatterTrees(avoid) {
  const out = [];
  const step = 4.6;
  for (let x = WORLD.x0 + 2; x < WORLD.x1 - 2; x += step) {
    for (let zr = -WORLD.half + 6; zr < WORLD.half - 2; zr += step) {
      const jx = hash3(x * 3.1, zr * 1.7, 11) - 0.5;
      const jz = hash3(x * 1.3, zr * 2.9, 12) - 0.5;
      const px = x + jx * step * 0.9;
      const pz = zc(px) + zr + jz * step * 0.9;
      const s = shoreS(px, pz);
      if (s < 2.5 + hash3(px, pz, 13) * 3) continue;
      const dens = fbm(px * 0.02, pz * 0.02, 3, 77);
      if (hash3(px, pz, 14) > 0.62 + dens * 0.5) continue;
      if (Math.abs(pz - trailZ(px)) < 2.4) continue;
      let skip = false;
      for (const a of avoid) if (Math.hypot(px - a.x, pz - a.z) < a.r) skip = true;
      if (skip) continue;
      const y = groundH(px, pz);
      if (px > 219) continue;
      const h = hash3(px, pz, 15);
      out.push({
        x: px,
        z: pz,
        y,
        s: 0.75 + hash3(px, pz, 16) * 0.55,
        rot: hash3(px, pz, 17) * TAU,
        kind: h < 0.14 ? 'dead' : 'spruce',
        v: Math.floor(hash3(px, pz, 18) * 3),
        r: 0,
      });
    }
  }
  return out;
}
