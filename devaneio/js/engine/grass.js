// Grama instanciada na GPU: lâminas (ou trigo, ou flores) em ladrilhos que acompanham
// o jogador, com vento, manchas, máscara de onde pode crescer e esmaecimento à distância.
import * as THREE from 'three';
import { injectAtmo } from './atmosphere.js';
import { rng, ihash } from './noise.js';

const WHITE = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
WHITE.needsUpdate = true;
const BLACK = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
BLACK.needsUpdate = true;

// Mapa de alturas (meia precisão, filtrável) para a grama acompanhar o relevo.
export function makeHeightMap(heightAt, rect, res = 256) {
  const [x0, z0, w, h] = rect;
  const data = new Uint16Array(res * res);
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const x = x0 + (i / (res - 1)) * w, z = z0 + (j / (res - 1)) * h;
      data[j * res + i] = THREE.DataUtils.toHalfFloat(heightAt(x, z));
    }
  }
  const t = new THREE.DataTexture(data, res, res, THREE.RedFormat, THREE.HalfFloatType);
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return { texture: t, rect, res };
}

const NOISE_GLSL = /* glsl */ `
float gHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float gNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), u.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

function bladeGeometry(seg) {
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i < seg; i++) {
    const t = i / seg;
    pos.push(-0.5, t, 0, 0.5, t, 0);
    uv.push(0, t, 1, t);
  }
  pos.push(0, 1, 0);
  uv.push(0.5, 1);
  for (let i = 0; i < seg - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const a = (seg - 1) * 2;
  idx.push(a, a + 1, seg * 2);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}

// Máscara em coordenadas de mundo: draw(ctx) desenha em metros (x, z); branco = cresce.
export function makeMask(rect, draw, res = 512) {
  const [x0, z0, w, h] = rect;
  const c = document.createElement('canvas');
  c.width = c.height = res;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, res, res);
  ctx.setTransform(res / w, 0, 0, -res / h, (-x0 * res) / w, res + (z0 * res) / h);
  draw(ctx);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return { texture: t, rect };
}

export class Grass {
  constructor(o = {}) {
    const P = (this.opts = {
      tile: 10,
      slots: 9,
      density: 26,
      height: [0.18, 0.42],
      width: [0.035, 0.07],
      lean: 0.25,
      base: '#2f3d1c',
      tip: '#7f8f4c',
      dry: '#a8975e',
      head: '#c9a96a',
      head2: '#f07ab0',
      dryAmount: 0.75,
      ao: 0.35,
      sss: '#000000',
      flex: 1,
      profile: 'blade',
      segments: 4,
      cross: false,
      seed: 7,
      patch: 0.55,
      clump: 0,
      clumpScale: 0.55,
      roughness: 0.85,
      ...o,
    });
    this.group = new THREE.Group();
    this.group.name = 'grass';
    this.uniforms = {
      uCam: { value: new THREE.Vector3() },
      uFadeStart: { value: (P.slots / 2) * P.tile * 0.55 },
      uFadeEnd: { value: (P.slots / 2) * P.tile * 0.92 },
      uHeightMul: { value: 1 },
      uMask: { value: WHITE },
      uMaskRect: { value: new THREE.Vector4(0, 0, 1, 1) },
      uUseMask: { value: 0 },
      uFlex: { value: P.flex },
      uPatch: { value: P.patch },
      uClump: { value: new THREE.Vector2(P.clump, P.clumpScale) },
      uBase: { value: new THREE.Color(P.base) },
      uTip: { value: new THREE.Color(P.tip) },
      uDry: { value: new THREE.Color(P.dry) },
      uHead: { value: new THREE.Color(P.head) },
      uHead2: { value: new THREE.Color(P.head2) },
      uDryAmt: { value: P.dryAmount },
      uAO: { value: P.ao },
      uSSS: { value: new THREE.Color(P.sss) },
      uSunView: { value: new THREE.Vector3(0, 1, 0) },
      uHMap: { value: BLACK },
      uHRect: { value: new THREE.Vector4(0, 0, 1, 1) },
      uHRes: { value: 2 },
      uUseH: { value: 0 },
    };
    this._buildGeometry();
    this._buildMaterial();
    this._buildTiles();
  }

  _buildGeometry() {
    const P = this.opts;
    const r = rng(P.seed);
    const T = P.tile;
    let n = Math.max(16, Math.round(P.density * T * T));
    const per = P.cross ? 2 : 1;
    const A = new Float32Array(n * per * 4);
    const B = new Float32Array(n * per * 4);
    for (let i = 0; i < n; i++) {
      const x = (r() - 0.5) * T, z = (r() - 0.5) * T;
      const h = P.height[0] + (P.height[1] - P.height[0]) * Math.pow(r(), 1.3);
      const yaw = r() * Math.PI * 2;
      const w = P.width[0] + (P.width[1] - P.width[0]) * r();
      const lean = r() * P.lean;
      const cv = r();
      const seed = r();
      for (let k = 0; k < per; k++) {
        const j = (i * per + k) * 4;
        A[j] = x;
        A[j + 1] = z;
        A[j + 2] = h;
        A[j + 3] = yaw + k * Math.PI * 0.5;
        B[j] = w;
        B[j + 1] = lean;
        B[j + 2] = cv;
        B[j + 3] = seed;
      }
    }
    n *= per;
    const iA = new THREE.InstancedBufferAttribute(A, 4);
    const iB = new THREE.InstancedBufferAttribute(B, 4);
    this.count = n;
    // LOD: a mesma lista de instâncias (ordem aleatória), desenhando menos nos anéis distantes
    this.geos = [1, 0.5, 0.25, 0.12].map((f, li) => {
      const g = bladeGeometry(li < 2 ? P.segments : Math.max(2, P.segments - 2));
      g.setAttribute('iA', iA);
      g.setAttribute('iB', iB);
      g.instanceCount = Math.max(1, Math.floor((n / per) * f) * per);
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, P.height[1] * 0.5, 0), T * 0.75 + P.height[1]);
      return g;
    });
  }

  _buildMaterial() {
    const P = this.opts;
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: P.roughness, metalness: 0, side: THREE.DoubleSide });
    m.defines = {};
    if (P.profile === 'wheat') m.defines.GRASS_WHEAT = '';
    if (P.profile === 'flower') m.defines.GRASS_FLOWER = '';
    const U = this.uniforms;
    m.onBeforeCompile = (sh) => {
      injectAtmo(sh);
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace(
          '#include <common>',
          /* glsl */ `#include <common>
attribute vec4 iA;
attribute vec4 iB;
uniform vec3 uCam;
uniform float uFadeStart, uFadeEnd, uHeightMul, uUseMask, uFlex, uPatch;
uniform vec2 uClump;
uniform sampler2D uMask;
uniform vec4 uMaskRect;
uniform sampler2D uHMap;
uniform vec4 uHRect;
uniform float uHRes, uUseH;
uniform float uTime;
uniform vec3 uWind;
varying float vT;
varying float vVar;
varying float vSeed;
${NOISE_GLSL}`
        )
        .replace(
          '#include <beginnormal_vertex>',
          /* glsl */ `vec3 objectNormal = normalize(vec3(-sin(iA.w), 0.0, cos(iA.w)) * 0.3 + vec3(0.0, 1.0, 0.0));
#ifdef USE_TANGENT
  vec3 objectTangent = vec3(1.0, 0.0, 0.0);
#endif`
        )
        .replace(
          '#include <begin_vertex>',
          /* glsl */ `
float t = uv.y;
vT = t; vVar = iB.z; vSeed = iB.w;
vec3 base = vec3(iA.x, 0.0, iA.y);
vec2 wxz = (modelMatrix * vec4(base, 1.0)).xz;
float h = iA.z * uHeightMul;
float pn = gNoise(wxz * 0.09 + 7.0) * 0.6 + gNoise(wxz * 0.37 + 3.0) * 0.4;
h *= mix(1.0 - uPatch, 1.0 + uPatch * 0.45, pn);
if (uClump.x > 0.0) {
  float cn = gNoise(wxz * uClump.y + 11.0) * 0.7 + gNoise(wxz * uClump.y * 2.3 + 5.0) * 0.3;
  h *= smoothstep(uClump.x, uClump.x + 0.07, cn) * (0.6 + 0.6 * smoothstep(uClump.x, uClump.x + 0.25, cn));
}
if (uUseMask > 0.5) {
  vec2 muv = (wxz - uMaskRect.xy) / uMaskRect.zw;
  float inside = step(0.0, muv.x) * step(muv.x, 1.0) * step(0.0, muv.y) * step(muv.y, 1.0);
  h *= mix(1.0, texture2D(uMask, muv).r, inside);
}
float dist = length(wxz - uCam.xz);
h *= 1.0 - smoothstep(uFadeStart, uFadeEnd, dist);
float w = iB.x;
#if defined(GRASS_WHEAT)
  float prof = t < 0.64 ? 0.34 : 0.34 + 0.85 * sin(3.14159 * clamp((t - 0.64) / 0.36, 0.0, 1.0));
#elif defined(GRASS_FLOWER)
  float prof = t < 0.44 ? 0.2 : 0.2 + 1.0 * pow(sin(3.14159 * clamp((t - 0.4) / 0.6, 0.0, 1.0)), 0.55);
#else
  float prof = 1.0 - pow(t, 1.5) * 0.9;
#endif
vec3 p = vec3((uv.x - 0.5) * w * prof, t * h, 0.0);
float cy = cos(iA.w), sy = sin(iA.w);
p = vec3(p.x * cy, p.y, p.x * sy);
vec2 lean = vec2(cos(iB.w * 6.2831), sin(iB.w * 6.2831)) * iB.y;
float gust = gNoise(wxz * 0.05 - uWind.xy * uTime * 0.4);
float flutter = sin(uTime * 2.1 + iB.w * 40.0 + dot(wxz, uWind.xy) * 0.7);
vec2 windL = (transpose(mat3(modelMatrix)) * vec3(uWind.x, 0.0, uWind.y)).xz;
vec2 bend = lean + windL * uWind.z * (gust * 1.15 + flutter * 0.18) * uFlex;
float bt = t * t;
p.xz += bend * bt * h;
p.y *= 1.0 - min(dot(bend, bend), 0.8) * 0.35 * bt;
vec3 transformed = base + p;
if (uUseH > 0.5) {
  vec2 huv = (wxz - uHRect.xy) / uHRect.zw;
  huv = huv * (uHRes - 1.0) / uHRes + 0.5 / uHRes;
  transformed.y += texture2D(uHMap, huv).r;
}
`
        );
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          /* glsl */ `#include <common>
uniform vec3 uBase, uTip, uDry, uHead, uHead2, uSSS, uSunView;
uniform float uDryAmt, uAO;
varying float vT;
varying float vVar;
varying float vSeed;`
        )
        .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''))
        .replace(
          '#include <color_fragment>',
          /* glsl */ `
vec3 gcol = mix(uBase, uTip, smoothstep(0.0, 1.0, vT));
gcol = mix(gcol, uDry, smoothstep(0.5, 0.75, vVar) * uDryAmt);
gcol *= 0.8 + 0.4 * fract(vSeed * 13.7);
#ifdef GRASS_WHEAT
  gcol = mix(gcol, uHead * (0.85 + 0.3 * fract(vSeed * 5.3)), smoothstep(0.6, 0.68, vT));
#endif
#ifdef GRASS_FLOWER
  vec3 fc = mix(uHead, uHead2, step(0.5, fract(vSeed * 7.1)));
  fc *= 0.78 + 0.32 * sin(vT * 70.0 + vSeed * 20.0);
  gcol = mix(gcol, fc, smoothstep(0.42, 0.5, vT));
#endif
gcol *= mix(uAO, 1.0, smoothstep(0.0, 0.65, vT));
diffuseColor.rgb *= gcol;
`
        )
        .replace(
          '#include <emissivemap_fragment>',
          /* glsl */ `#include <emissivemap_fragment>
{
  vec3 V = normalize(vViewPosition);
  float back = pow(max(dot(-V, uSunView), 0.0), 3.0);
  totalEmissiveRadiance += uSSS * back * vT * vT * diffuseColor.rgb * 2.0;
}`
        );
    };
    this.material = m;
  }

  _buildTiles() {
    const P = this.opts;
    this.meshes = [];
    for (let i = 0; i < P.slots * P.slots; i++) {
      const mesh = new THREE.Mesh(this.geos[0], this.material);
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.matrixAutoUpdate = true;
      this.group.add(mesh);
      this.meshes.push(mesh);
    }
  }

  setMask(mask) {
    if (!mask) {
      this.uniforms.uUseMask.value = 0;
      return;
    }
    this.uniforms.uMask.value = mask.texture;
    this.uniforms.uMaskRect.value.set(mask.rect[0], mask.rect[1], mask.rect[2], mask.rect[3]);
    this.uniforms.uUseMask.value = 1;
  }

  setHeightMap(hm) {
    this.uniforms.uHMap.value = hm.texture;
    this.uniforms.uHRect.value.set(hm.rect[0], hm.rect[1], hm.rect[2], hm.rect[3]);
    this.uniforms.uHRes.value = hm.res;
    this.uniforms.uUseH.value = 1;
  }

  update(camera) {
    const P = this.opts;
    const cp = camera.position;
    this.uniforms.uCam.value.copy(cp);
    // direção do sol em espaço de visão (translucidez)
    const T = P.tile, n = P.slots, half = Math.floor(n / 2);
    const cx = Math.floor(cp.x / T), cz = Math.floor(cp.z / T);
    const fadeEnd = this.uniforms.uFadeEnd.value;
    let k = 0;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const mesh = this.meshes[k++];
        const tx = cx + i - half, tz = cz + j - half;
        const ox = tx * T + T / 2, oz = tz * T + T / 2;
        const ring = Math.max(Math.abs(i - half), Math.abs(j - half));
        const nearX = Math.max(Math.abs(cp.x - ox) - T / 2, 0), nearZ = Math.max(Math.abs(cp.z - oz) - T / 2, 0);
        const near = Math.hypot(nearX, nearZ);
        mesh.visible = near < fadeEnd;
        if (!mesh.visible) continue;
        mesh.position.set(ox, 0, oz);
        mesh.rotation.y = Math.floor(ihash(tx, tz, P.seed) * 4) * Math.PI * 0.5;
        mesh.geometry = this.geos[ring <= 1 ? 0 : ring === 2 ? 1 : ring === 3 ? 2 : 3];
      }
    }
  }

  setSunView(sunDirWorld, camera) {
    this.uniforms.uSunView.value.copy(sunDirWorld).transformDirection(camera.matrixWorldInverse);
  }

  dispose() {
    for (const g of this.geos) g.dispose();
    this.material.dispose();
  }
}
