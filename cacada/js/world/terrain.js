// Malha do terreno em blocos de 256 m com quatro níveis de detalhe (LOD), saias para
// esconder as emendas e um material procedural (grama, campos, chão de floresta, trilhas,
// areia, rocha nas encostas e neve nos picos). Também cria o relevo além da borda do mapa.
import * as THREE from 'three';
import { HALF, RES, CELL, WATER } from './heightfield.js';

const CHUNK_CELLS = 64; // 256 m
const CHUNKS = (RES - 1) / CHUNK_CELLS; // 16
const LOD_STEPS = [1, 2, 4, 8];

export function createTerrainMaterial(tex, quality) {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const uniforms = {
    tGrass: { value: tex.grass },
    tDirt: { value: tex.dirt },
    tRock: { value: tex.rock },
    tSnow: { value: tex.snow },
    tSand: { value: tex.sand },
    tFloor: { value: tex.floor },
    tMacro: { value: tex.macro },
    uWater: { value: WATER },
    uSnowLine: { value: 365 },
  };
  mat.userData.uniforms = uniforms;
  const triplanar = quality !== 'low';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec2 aBiome;
varying vec3 vWPos;
varying vec3 vWN;
varying vec2 vBiome;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWN = normalize(mat3(modelMatrix) * objectNormal);
vBiome = aBiome;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D tGrass, tDirt, tRock, tSnow, tSand, tFloor, tMacro;
uniform float uWater, uSnowLine;
varying vec3 vWPos;
varying vec3 vWN;
varying vec2 vBiome;
vec3 tri(sampler2D t, vec3 p, vec3 n) {
  ${
    triplanar
      ? `vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
  return texture2D(t, p.zy).rgb * w.x + texture2D(t, p.xz).rgb * w.y + texture2D(t, p.xy).rgb * w.z;`
      : `return texture2D(t, p.xz).rgb;`
  }
}`,
      )
      .replace(
        '#include <map_fragment>',
        `{
  vec3 n = normalize(vWN);
  float slope = 1.0 - n.y;
  vec2 uv = vWPos.xz * 0.21;
  vec4 mac = texture2D(tMacro, vWPos.xz / 700.0);
  vec4 mac2 = texture2D(tMacro, vWPos.xz / 97.0 + 0.37);
  float dist = length(vWPos - cameraPosition);
  // grama com duas escalas para esconder a repetição
  vec3 gA = texture2D(tGrass, uv).rgb;
  vec3 gB = texture2D(tGrass, uv * 0.137 + 0.5).rgb;
  vec3 grass = mix(gA, gB, 0.35 + 0.3 * smoothstep(40.0, 300.0, dist));
  // campos secos (amarelados) x pasto verde
  float dry = smoothstep(0.42, 0.75, mac.r + mac2.g * 0.25);
  grass *= mix(vec3(0.95, 1.05, 0.85), vec3(1.22, 1.08, 0.62), dry);
  grass *= 0.85 + 0.3 * mac2.r;
  vec3 floorC = texture2D(tFloor, uv * 1.3).rgb * mix(1.0, 0.75, mac2.g);
  vec3 dirt = texture2D(tDirt, uv * 1.4).rgb;
  vec3 sand = texture2D(tSand, uv * 1.1).rgb;
  vec3 rock = tri(tRock, vWPos * 0.09, n) * (0.85 + 0.3 * mac.g);
  vec3 snow = texture2D(tSnow, uv * 0.5).rgb;
  float forest = vBiome.x;
  float path = vBiome.y;
  vec3 col = mix(grass, floorC, smoothstep(0.25, 0.75, forest));
  // margens: areia e lama
  float shore = 1.0 - smoothstep(0.6, 2.4 + mac2.r * 1.5, vWPos.y - uWater);
  col = mix(col, sand * mix(1.0, 0.62, smoothstep(uWater + 0.6, uWater - 1.5, vWPos.y)), shore);
  col = mix(col, dirt, path * (1.0 - shore));
  // rocha nas encostas e no alto
  float rk = smoothstep(0.3, 0.46, slope + (mac2.g - 0.5) * 0.12);
  rk = max(rk, smoothstep(250.0, 330.0, vWPos.y + mac.r * 60.0) * 0.85);
  col = mix(col, rock, rk);
  // neve nos picos (não gruda nas paredes muito íngremes)
  float sn = smoothstep(uSnowLine - 20.0, uSnowLine + 25.0, vWPos.y + (mac.g - 0.5) * 70.0) * (1.0 - smoothstep(0.55, 0.75, slope));
  col = mix(col, snow, sn);
  diffuseColor.rgb *= col;
}`,
      );
  };
  mat.customProgramCacheKey = () => 'terrain-' + (triplanar ? 'tri' : 'flat');
  return mat;
}

function buildChunkGeometry(hf, ci, cj, step) {
  const n = CHUNK_CELLS / step + 1;
  const vCount = n * n + 4 * n; // + saias
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const bio = new Uint8Array(vCount * 2);
  const i0 = ci * CHUNK_CELLS;
  const j0 = cj * CHUNK_CELLS;
  const tmp = [0, 0, 0];
  let v = 0;
  const put = (i, j, drop) => {
    const id = j * RES + i;
    pos[v * 3] = -HALF + i * CELL;
    pos[v * 3 + 1] = hf.h[id] - drop;
    pos[v * 3 + 2] = -HALF + j * CELL;
    hf.normalAtIndex(i, j, tmp);
    nor[v * 3] = tmp[0];
    nor[v * 3 + 1] = tmp[1];
    nor[v * 3 + 2] = tmp[2];
    bio[v * 2] = hf.forest[id];
    bio[v * 2 + 1] = hf.path[id];
    return v++;
  };
  for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) put(i0 + a * step, j0 + b * step, 0);
  const idx = [];
  for (let b = 0; b < n - 1; b++)
    for (let a = 0; a < n - 1; a++) {
      const p00 = b * n + a;
      const p10 = p00 + 1;
      const p01 = p00 + n;
      const p11 = p01 + 1;
      // mesma diagonal usada em Heightfield.height()
      idx.push(p00, p01, p10, p01, p11, p10);
    }
  // saias nas quatro bordas
  const drop = step * 3 + 1;
  const edges = [
    [...Array(n).keys()].map((a) => a), // norte (b=0)
    [...Array(n).keys()].map((a) => (n - 1) * n + a), // sul
    [...Array(n).keys()].map((b) => b * n), // oeste
    [...Array(n).keys()].map((b) => b * n + n - 1), // leste
  ];
  for (let e = 0; e < 4; e++) {
    const ring = edges[e];
    const base = v;
    for (const p of ring) {
      const i = Math.round((pos[p * 3] + HALF) / CELL);
      const j = Math.round((pos[p * 3 + 2] + HALF) / CELL);
      put(i, j, drop);
    }
    for (let k = 0; k < ring.length - 1; k++) {
      const a = ring[k];
      const b = ring[k + 1];
      const c = base + k;
      const d = base + k + 1;
      // os dois lados (a orientação muda conforme a borda)
      idx.push(a, c, b, b, c, d, a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('aBiome', new THREE.BufferAttribute(bio, 2, true));
  g.setIndex(idx);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

export class Terrain {
  constructor(hf, material, quality) {
    this.hf = hf;
    this.material = material;
    this.group = new THREE.Group();
    this.group.name = 'terreno';
    this.chunks = [];
    this.queue = [];
    const lodDist = { low: [260, 600, 1300], medium: [330, 800, 1600], high: [420, 950, 1900], ultra: [560, 1200, 2400] }[quality] || [420, 950, 1900];
    this.lodDist = lodDist;
    for (let cj = 0; cj < CHUNKS; cj++)
      for (let ci = 0; ci < CHUNKS; ci++) {
        const cx = -HALF + (ci + 0.5) * CHUNK_CELLS * CELL;
        const cz = -HALF + (cj + 0.5) * CHUNK_CELLS * CELL;
        const geo = buildChunkGeometry(hf, ci, cj, 8);
        const mesh = new THREE.Mesh(geo, material);
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        this.group.add(mesh);
        this.chunks.push({ ci, cj, cx, cz, mesh, geos: [null, null, null, geo], lod: 3, want: 3 });
      }
    this.outer = this.buildOuter();
    this.group.add(this.outer);
  }

  // relevo além da borda: montanhas que continuam até o horizonte
  buildOuter() {
    const hf = this.hf;
    const R = 7000;
    const step = 100;
    const n = Math.floor((2 * R) / step) + 1;
    const pos = [];
    const nor = [];
    const bio = [];
    const idx = [];
    const map = new Int32Array(n * n).fill(-1);
    const hAt = (x, z) => {
      const ex = Math.max(Math.abs(x), Math.abs(z));
      if (ex <= HALF) return hf.height(x, z);
      // continua com picos que vão baixando até o horizonte
      const cx = Math.max(-HALF, Math.min(HALF, x));
      const cz = Math.max(-HALF, Math.min(HALF, z));
      const edge = hf.height(cx, cz);
      const d = ex - HALF;
      const s = Math.sin(x * 0.0021 + Math.cos(z * 0.0017) * 2) * Math.cos(z * 0.0023 - x * 0.0009);
      const peaks = 280 + 220 * s + 90 * Math.sin(x * 0.007 + z * 0.005);
      const f = Math.min(1, d / 600);
      return edge * (1 - f) + peaks * f * (1 - Math.min(0.6, d / 9000));
    };
    for (let b = 0; b < n; b++)
      for (let a = 0; a < n; a++) {
        const x = -R + a * step;
        const z = -R + b * step;
        const inner = Math.max(Math.abs(x), Math.abs(z)) < HALF - step * 1.5;
        if (inner) continue;
        map[b * n + a] = pos.length / 3;
        pos.push(x, hAt(x, z), z);
        bio.push(40, 0);
      }
    for (let b = 0; b < n; b++)
      for (let a = 0; a < n; a++) {
        const k = map[b * n + a];
        if (k < 0) continue;
        const e = 60;
        const x = -R + a * step;
        const z = -R + b * step;
        const dx = (hAt(x + e, z) - hAt(x - e, z)) / (2 * e);
        const dz = (hAt(x, z + e) - hAt(x, z - e)) / (2 * e);
        const l = Math.hypot(dx, 1, dz);
        nor.push(-dx / l, 1 / l, -dz / l);
      }
    for (let b = 0; b < n - 1; b++)
      for (let a = 0; a < n - 1; a++) {
        const p00 = map[b * n + a];
        const p10 = map[b * n + a + 1];
        const p01 = map[(b + 1) * n + a];
        const p11 = map[(b + 1) * n + a + 1];
        if (p00 < 0 || p10 < 0 || p01 < 0 || p11 < 0) continue;
        idx.push(p00, p01, p10, p01, p11, p10);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('aBiome', new THREE.BufferAttribute(new Uint8Array(bio), 2, true));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, this.material);
    m.receiveShadow = false;
    m.matrixAutoUpdate = false;
    return m;
  }

  update(camPos, budget = 3) {
    const [d0, d1, d2] = this.lodDist;
    for (const c of this.chunks) {
      const dx = Math.max(0, Math.abs(camPos.x - c.cx) - 128);
      const dz = Math.max(0, Math.abs(camPos.z - c.cz) - 128);
      const d = Math.hypot(dx, dz, Math.max(0, camPos.y - 300) * 0.5);
      const want = d < d0 ? 0 : d < d1 ? 1 : d < d2 ? 2 : 3;
      c.want = want;
      if (c.geos[want]) {
        if (c.lod !== want) {
          c.mesh.geometry = c.geos[want];
          c.lod = want;
        }
      }
    }
    // gera as geometrias que faltam (as mais próximas primeiro), poucas por quadro
    let made = 0;
    const missing = this.chunks.filter((c) => !c.geos[c.want]);
    missing.sort((a, b) => Math.hypot(a.cx - camPos.x, a.cz - camPos.z) - Math.hypot(b.cx - camPos.x, b.cz - camPos.z));
    for (const c of missing) {
      if (made >= budget) break;
      c.geos[c.want] = buildChunkGeometry(this.hf, c.ci, c.cj, LOD_STEPS[c.want]);
      c.mesh.geometry = c.geos[c.want];
      c.lod = c.want;
      made++;
    }
    // libera geometrias detalhadas de blocos distantes
    for (const c of this.chunks) {
      for (let l = 0; l < 2; l++) {
        if (c.geos[l] && c.want > l + 1) {
          c.geos[l].dispose();
          c.geos[l] = null;
        }
      }
    }
  }

  // pré-carrega o detalhe ao redor de um ponto (antes de começar o jogo)
  warmup(pos) {
    this.update(pos, 1e9);
  }
}
