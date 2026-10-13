// Terreno: cidade plana no centro, planícies com plantações, anel de floresta
// e montanhas ao redor. Fornece consultas de altura/normal para a física.
import * as THREE from 'three';
import { Perlin } from '../util/noise.js';
import { smoothstep, clamp, RNG } from '../util/math.js';
import { WORLD } from '../config.js';

const perlin = new Perlin(WORLD.seed);

// Traçado das rodovias (mesma função em JS e GLSL).
export function roadZ(x) {
  const ax = Math.abs(x);
  if (ax < 450) return 0;
  return 70 * Math.sin((ax - 450) / 520) * smoothstep(450, 900, ax);
}
export function roadX(z) {
  const az = Math.abs(z);
  if (az < 350) return 0;
  return 60 * Math.sin((az - 350) / 480) * smoothstep(350, 800, az) * Math.sign(z);
}
export const ROAD_GLSL = /* glsl */ `
float roadZ(float x) {
  float ax = abs(x);
  if (ax < 450.0) return 0.0;
  return 70.0 * sin((ax - 450.0) / 520.0) * smoothstep(450.0, 900.0, ax);
}
float roadX(float z) {
  float az = abs(z);
  if (az < 350.0) return 0.0;
  return 60.0 * sin((az - 350.0) / 480.0) * smoothstep(350.0, 800.0, az) * sign(z);
}
`;

export const FARM = { x: -760, z: 560 };

export function distToRoad(x, z) {
  return Math.min(Math.abs(z - roadZ(x)), Math.abs(x - roadX(z)));
}

function rawHeight(x, z) {
  const r = Math.hypot(x, z);
  let h = perlin.fbm2(x * 0.0011, z * 0.0011, 4) * 18 + perlin.fbm2(x * 0.005, z * 0.005, 2) * 2;
  const ang = Math.atan2(z, x);
  const rn = perlin.fbm2(Math.cos(ang) * 1.3 + 5.2, Math.sin(ang) * 1.3 - 2.1, 3) * 650;
  const m = smoothstep(1600 + rn, 3400 + rn, r);
  if (m > 0) {
    const broad = perlin.fbm2(x * 0.00042 + 7.3, z * 0.00042 - 3.1, 4) * 0.5 + 0.5;
    const rid = perlin.ridged2(x * 0.0008 + 3.1, z * 0.0008 - 1.7, 5);
    let mt = Math.pow(broad, 1.5) * 540 + rid * rid * 270 * (0.4 + broad) + perlin.fbm2(x * 0.003, z * 0.003, 3) * 22;
    mt = mt * m + m * 80;
    const corr = Math.max(
      smoothstep(170, 30, Math.abs(z - roadZ(x))),
      smoothstep(170, 30, Math.abs(x - roadX(z))),
    );
    h += mt * (1 - 0.9 * corr);
  }
  return h;
}

const farmBase = rawHeight(FARM.x, FARM.z);

export function terrainHeightFn(x, z) {
  let h = rawHeight(x, z);
  // Fazenda nivelada
  const fd = Math.hypot(x - FARM.x, z - FARM.z);
  const ff = 1 - smoothstep(70, 190, fd);
  h = h * (1 - ff) + farmBase * ff;
  // Cidade plana
  const tx = Math.max(0, Math.abs(x) - 400);
  const tz = Math.max(0, Math.abs(z) - 270);
  const flat = 1 - smoothstep(0, 230, Math.hypot(tx, tz));
  return h * (1 - flat);
}

export class Terrain {
  constructor(quality) {
    this.size = WORLD.size;
    this.half = WORLD.half;
    this.N = quality.terrainSegs;
    this.cell = this.size / this.N;
    const n1 = this.N + 1;
    this.heights = new Float32Array(n1 * n1);
    for (let i = 0; i <= this.N; i++) {
      const z = -this.half + i * this.cell;
      for (let j = 0; j <= this.N; j++) {
        const x = -this.half + j * this.cell;
        this.heights[i * n1 + j] = terrainHeightFn(x, z);
      }
    }
    this.fields = this.makeFields();
    this.scourDirty = false;
  }

  heightAt(x, z) {
    const n1 = this.N + 1;
    const gx = clamp((x + this.half) / this.cell, 0, this.N - 0.0001);
    const gz = clamp((z + this.half) / this.cell, 0, this.N - 0.0001);
    const j = Math.floor(gx);
    const i = Math.floor(gz);
    const fx = gx - j;
    const fz = gz - i;
    const H = this.heights;
    const a = H[i * n1 + j];
    const b = H[i * n1 + j + 1];
    const c = H[(i + 1) * n1 + j];
    const d = H[(i + 1) * n1 + j + 1];
    // Mesma triangulação da malha (diagonal b-c)
    if (fx + fz < 1) return a + (b - a) * fx + (c - a) * fz;
    return d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
  }

  normalAt(x, z, out) {
    const e = this.cell * 0.5;
    const hl = this.heightAt(x - e, z);
    const hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e);
    const hu = this.heightAt(x, z + e);
    out.set(hl - hr, 2 * e, hd - hu).normalize();
    return out;
  }

  // Plantações retangulares nas planícies entre a cidade e a floresta.
  makeFields() {
    const rng = new RNG(77);
    const fields = [];
    const cs = 170;
    for (let gx = -9; gx <= 9; gx++) {
      for (let gz = -9; gz <= 9; gz++) {
        const cx = gx * cs + cs / 2;
        const cz = gz * cs + cs / 2;
        const r = Math.hypot(cx, cz);
        if (r < 520 || r > 1350) continue;
        if (Math.abs(cx) < 470 && Math.abs(cz) < 330) continue;
        if (distToRoad(cx, cz) < cs * 0.5 + 12) continue;
        const nearFarm = Math.hypot(cx - FARM.x, cz - FARM.z) < 520;
        if (!nearFarm && !rng.chance(0.5)) continue;
        const w = cs * rng.float(0.82, 0.96);
        const d = cs * rng.float(0.82, 0.96);
        const type = rng.pick(nearFarm ? [0.6, 0.6, 0.85, 0.35, 0.1] : [0.1, 0.35, 0.6, 0.85]);
        fields.push({ x: cx, z: cz, w, d, type });
      }
    }
    return fields;
  }

  fieldAt(x, z) {
    for (const f of this.fields) {
      if (Math.abs(x - f.x) < f.w / 2 && Math.abs(z - f.z) < f.d / 2) return f;
    }
    return null;
  }

  fieldNear(x, z, margin) {
    for (const f of this.fields) {
      if (Math.abs(x - f.x) < f.w / 2 + margin && Math.abs(z - f.z) < f.d / 2 + margin) return f;
    }
    return null;
  }

  forestDensity(x, z) {
    const r = Math.hypot(x, z);
    let d = smoothstep(720, 1050, r);
    const h = this.heightAt(x, z);
    d *= 1 - smoothstep(470, 600, h);
    const n = perlin.fbm2(x / 650 + 11, z / 650 - 7, 3);
    d *= smoothstep(-0.4, 0.0, n);
    d *= smoothstep(9, 22, distToRoad(x, z));
    if (this.fieldAt(x, z)) d = 0;
    if (Math.hypot(x - FARM.x, z - FARM.z) < 200) d = 0;
    return d;
  }

  // Mapa-múndi (512²): R = densidade de floresta, G = plantação, B = tipo de cultura.
  buildWorldMap() {
    const S = 512;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      const z = -this.half + ((y + 0.5) / S) * this.size;
      for (let x = 0; x < S; x++) {
        const wx = -this.half + ((x + 0.5) / S) * this.size;
        const i = ((S - 1 - y) * S + x) * 4; // flipY do CanvasTexture
        img.data[i] = this.forestDensity(wx, z) * 255;
        const f = this.fieldAt(wx, z);
        img.data[i + 1] = f ? 255 : 0;
        // fora das plantações repete o tipo da plantação vizinha (evita bordas de outra cor)
        const fn = f || this.fieldNear(wx, z, 45);
        img.data[i + 2] = fn ? fn.type * 255 : 0;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.NoColorSpace;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    this.worldMap = t;
    return t;
  }

  // Marcas de solo arrancado deixadas por tornados intensos.
  buildScourMap() {
    const S = 1024;
    this.scourCanvas = document.createElement('canvas');
    this.scourCanvas.width = this.scourCanvas.height = S;
    this.scourCtx = this.scourCanvas.getContext('2d');
    this.scourCtx.fillStyle = '#000';
    this.scourCtx.fillRect(0, 0, S, S);
    const t = new THREE.CanvasTexture(this.scourCanvas);
    t.colorSpace = THREE.NoColorSpace;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    this.scourMap = t;
    return t;
  }

  paintScour(x, z, radius, strength) {
    if (!this.scourCtx) return;
    const S = this.scourCanvas.width;
    const px = ((x + this.half) / this.size) * S;
    const py = (1 - (z + this.half) / this.size) * S;
    const pr = Math.max(1.5, (radius / this.size) * S);
    const g = this.scourCtx.createRadialGradient(px, py, 0, px, py, pr);
    const a = clamp(strength, 0, 1) * 0.25;
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    this.scourCtx.fillStyle = g;
    this.scourCtx.beginPath();
    this.scourCtx.arc(px, py, pr, 0, Math.PI * 2);
    this.scourCtx.fill();
    this.scourDirty = true;
  }

  flushScour() {
    if (this.scourDirty && this.scourMap) {
      this.scourMap.needsUpdate = true;
      this.scourDirty = false;
    }
  }

  buildMesh(scene, textures, townMap, townHalf) {
    const N = this.N;
    const n1 = N + 1;
    const pos = new Float32Array(n1 * n1 * 3);
    const nor = new Float32Array(n1 * n1 * 3);
    const H = this.heights;
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        const k = i * n1 + j;
        pos[k * 3] = -this.half + j * this.cell;
        pos[k * 3 + 1] = H[k];
        pos[k * 3 + 2] = -this.half + i * this.cell;
        const hl = H[i * n1 + Math.max(j - 1, 0)];
        const hr = H[i * n1 + Math.min(j + 1, N)];
        const hd = H[Math.max(i - 1, 0) * n1 + j];
        const hu = H[Math.min(i + 1, N) * n1 + j];
        let nx = hl - hr;
        let ny = 2 * this.cell;
        let nz = hd - hu;
        const l = Math.hypot(nx, ny, nz);
        nor[k * 3] = nx / l;
        nor[k * 3 + 1] = ny / l;
        nor[k * 3 + 2] = nz / l;
      }
    }
    const idx = new Uint32Array(N * N * 6);
    let p = 0;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const a = i * n1 + j;
        const b = a + 1;
        const c = a + n1;
        const d = c + 1;
        idx[p++] = a;
        idx[p++] = c;
        idx[p++] = b;
        idx[p++] = b;
        idx[p++] = c;
        idx[p++] = d;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();

    this.material = makeTerrainMaterial(textures, this.worldMap, townMap, this.scourMap, this.half, townHalf);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    // Anel distante de montanhas (horizonte)
    const segA = 160;
    const radii = [];
    let r = 3600;
    while (r < 16000) {
      radii.push(r);
      r *= 1.13;
    }
    radii.push(16000);
    const rp = new Float32Array(segA * radii.length * 3);
    for (let ri = 0; ri < radii.length; ri++) {
      for (let a = 0; a < segA; a++) {
        const ang = (a / segA) * Math.PI * 2;
        const x = Math.cos(ang) * radii[ri];
        const z = Math.sin(ang) * radii[ri];
        const inside = Math.max(Math.abs(x), Math.abs(z));
        const off = -40 * smoothstep(this.half - 150, this.half - 400, inside);
        const k = (ri * segA + a) * 3;
        rp[k] = x;
        rp[k + 1] = terrainHeightFn(x, z) * (1 + smoothstep(5000, 14000, radii[ri]) * 0.35) + off;
        rp[k + 2] = z;
      }
    }
    const ri2 = [];
    for (let ri = 0; ri < radii.length - 1; ri++) {
      for (let a = 0; a < segA; a++) {
        const a1 = (a + 1) % segA;
        const i0 = ri * segA + a;
        const i1 = ri * segA + a1;
        const i2 = (ri + 1) * segA + a;
        const i3 = (ri + 1) * segA + a1;
        ri2.push(i0, i1, i2, i1, i3, i2);
      }
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    rg.setIndex(ri2);
    rg.computeVertexNormals();
    this.ring = new THREE.Mesh(rg, this.material);
    this.ring.frustumCulled = false;
    scene.add(this.ring);
  }
}

function makeTerrainMaterial(T, worldMap, townMap, scourMap, worldHalf, townHalf) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  const uniforms = {
    tGrass: { value: T.grass },
    tDirt: { value: T.dirt },
    tRock: { value: T.rock },
    tForest: { value: T.forest },
    tWheat: { value: T.wheat },
    tAsphalt: { value: T.asphalt },
    tConcrete: { value: T.concrete },
    tWorldMap: { value: worldMap },
    tTownMap: { value: townMap },
    tScour: { value: scourMap },
    tNoise2: { value: T.noise },
    uWorldHalf: { value: worldHalf },
    uTownHalf: { value: townHalf },
    uWet: { value: 0 },
  };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTPos;\nvarying vec3 vTNor;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvTPos = (modelMatrix * vec4(position, 1.0)).xyz;\nvTNor = normal;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vTPos;
varying vec3 vTNor;
uniform sampler2D tGrass, tDirt, tRock, tForest, tWheat, tAsphalt, tConcrete, tWorldMap, tTownMap, tScour, tNoise2;
uniform float uWorldHalf, uTownHalf, uWet;
${ROAD_GLSL}
`,
      )
      .replace(
        '#include <map_fragment>',
        `
vec3 wp = vTPos;
vec2 uvW = wp.xz;
vec3 nW = normalize(vTNor);
float slope = 1.0 - nW.y;
vec4 mac = texture2D(tNoise2, uvW / 1100.0);
float macro = mac.r;
float macro2 = texture2D(tNoise2, uvW / 260.0).g;
vec3 grass = texture2D(tGrass, uvW / 6.5).rgb * mix(0.78, 1.18, macro2) * vec3(0.96, 0.92, 0.84);
grass = mix(grass, texture2D(tGrass, uvW / 47.0).rgb, 0.4);
grass *= mix(vec3(1.05, 1.0, 0.85), vec3(0.85, 1.0, 1.05), macro);
vec3 dirt = texture2D(tDirt, uvW / 5.5).rgb;
vec3 forestF = texture2D(tForest, uvW / 6.0).rgb;
vec3 bw = pow(abs(nW), vec3(4.0));
bw /= (bw.x + bw.y + bw.z);
vec3 rock = texture2D(tRock, wp.zy / 24.0).rgb * bw.x + texture2D(tRock, wp.xz / 24.0).rgb * bw.y + texture2D(tRock, wp.xy / 24.0).rgb * bw.z;
rock *= mix(0.85, 1.1, macro2);
vec4 wm = texture2D(tWorldMap, (wp.xz + uWorldHalf) / (2.0 * uWorldHalf));
vec3 tcol = grass;
tcol = mix(tcol, dirt, smoothstep(0.6, 0.8, macro) * 0.55);
float camD = length(wp - cameraPosition);
float fden = smoothstep(0.15, 0.55, wm.r);
// de longe a floresta aparece como copas verde-escuras
vec3 canopy = vec3(0.075, 0.115, 0.05) * mix(0.7, 1.25, texture2D(tNoise2, uvW / 90.0).b) * mix(0.9, 1.1, macro);
vec3 fcol = mix(forestF, canopy, smoothstep(120.0, 700.0, camD) * smoothstep(0.3, 0.8, wm.r));
tcol = mix(tcol, fcol, fden);
vec3 wheat = texture2D(tWheat, uvW / 8.0).rgb;
float crop = wm.b;
float rowP = dot(wp.xz, vec2(0.7071, 0.7071)) / 1.6;
float rows = mix(0.82 + 0.18 * sin(rowP * 6.2831), 0.9, smoothstep(0.2, 0.55, fwidth(rowP)));
vec3 fieldCol = crop < 0.2 ? dirt * vec3(0.78, 0.7, 0.62) * mix(0.85, 1.05, rows)
              : crop < 0.45 ? mix(dirt * 0.8, vec3(0.13, 0.2, 0.06), 0.75) * rows
              : crop < 0.72 ? wheat * vec3(0.82, 0.76, 0.66)
              : vec3(0.1, 0.17, 0.05) * mix(0.8, 1.15, macro2) * rows;
tcol = mix(tcol, fieldCol, smoothstep(0.3, 0.7, wm.g));
float rockW = smoothstep(0.2, 0.42, slope + (macro - 0.5) * 0.18) ;
rockW = max(rockW, smoothstep(430.0, 620.0, wp.y + macro * 120.0) * 0.7);
tcol = mix(tcol, rock, rockW);
float snowW = smoothstep(600.0, 700.0, wp.y + macro * 70.0) * (1.0 - smoothstep(0.3, 0.6, slope));
tcol = mix(tcol, vec3(0.86, 0.88, 0.92), snowW);
// Ruas e calçadas
float asph = 0.0, conc = 0.0, paintY = 0.0;
vec2 tuv = (wp.xz + uTownHalf) / (2.0 * uTownHalf);
float inTown = (tuv.x > 0.0 && tuv.x < 1.0 && tuv.y > 0.0 && tuv.y < 1.0) ? 1.0 : 0.0;
if (inTown > 0.5) {
  vec3 tm = texture2D(tTownMap, tuv).rgb;
  asph = tm.r; conc = tm.g; paintY = tm.b;
} else {
  float dEW = abs(wp.z - roadZ(wp.x));
  float dNS = abs(wp.x - roadX(wp.z));
  float dmin = min(dEW, dNS);
  asph = smoothstep(4.8, 4.2, dmin);
  conc = smoothstep(6.5, 5.0, dmin) * (1.0 - asph) * 0.6; // acostamento de cascalho
}
// Faixa central amarela tracejada (analítica, nítida)
{
  float dEW = abs(wp.z - roadZ(wp.x));
  float dNS = abs(wp.x - roadX(wp.z));
  float aa = max(fwidth(wp.x) + fwidth(wp.z), 0.02);
  float lineEW = (1.0 - smoothstep(0.09, 0.09 + aa, dEW)) * step(0.5, fract(wp.x / 12.0)) * step(8.0, min(min(abs(wp.x + 220.0), abs(wp.x + 110.0)), min(min(abs(wp.x), abs(wp.x - 110.0)), abs(wp.x - 220.0))));
  float lineNS = (1.0 - smoothstep(0.09, 0.09 + aa, dNS)) * step(0.5, fract(wp.z / 12.0)) * step(8.0, abs(wp.z));
  paintY = max(paintY, max(lineEW, lineNS) * asph * smoothstep(0.6, 0.15, aa));
}
vec3 asphC = texture2D(tAsphalt, uvW / 9.0).rgb * mix(0.85, 1.1, macro2);
vec3 concC = texture2D(tConcrete, uvW / 6.0).rgb;
tcol = mix(tcol, concC, conc);
tcol = mix(tcol, asphC, asph);
tcol = mix(tcol, vec3(0.78, 0.6, 0.1), paintY * 0.9);
// Solo arrancado pelo tornado
float sc = texture2D(tScour, (wp.xz + uWorldHalf) / (2.0 * uWorldHalf)).r;
tcol = mix(tcol, dirt * vec3(0.7, 0.62, 0.55), clamp(sc * 1.5, 0.0, 0.9) * (1.0 - asph * 0.6));
// Superfície molhada
float wetMask = uWet * (1.0 - snowW);
tcol *= mix(1.0, 0.62, wetMask * (0.6 + 0.4 * max(asph, conc)));
diffuseColor.rgb *= tcol;
`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `float roughnessFactor = roughness;
roughnessFactor = mix(roughnessFactor, 0.82, asph);
roughnessFactor = mix(roughnessFactor, 0.28, uWet * max(asph, conc));
roughnessFactor = mix(roughnessFactor, 0.7, uWet * 0.6 * (1.0 - max(asph, conc)));
roughnessFactor = mix(roughnessFactor, 0.5, snowW);`,
      );
  };
  mat.customProgramCacheKey = () => 'terrain-v1';
  return mat;
}
