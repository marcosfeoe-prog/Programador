// Materiais no estilo anime: sombreamento em dois tons (cel shading) com
// borda serrilhada suave, brilho de contorno (rim light) e linhas de contorno
// pelo método do "casco invertido" (cópia da malha empurrada ao longo das
// normais e desenhada só pelas faces de trás).
import * as THREE from 'three';

// Uniformes compartilhados por todos os materiais toon: cada cenário ajusta.
export const TOON = {
  uToonThr: { value: 0.02 },
  uToonSoft: { value: 0.015 },
  uRim: { value: new THREE.Color(0, 0, 0) },
  uRimThr: { value: 0.72 },
};
export const OUTLINE = {
  uOutline: { value: 0.0026 },
  uOutlineMax: { value: 0.045 },
};

function patchToon(m) {
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, TOON);
    sh.uniforms.uWrap = { value: m.userData.wrap || 0 };
    sh.uniforms.uSoftM = { value: m.userData.soft || 0 };
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <gradientmap_pars_fragment>',
        /* glsl */ `
uniform float uToonThr;
uniform float uToonSoft;
uniform vec3 uRim;
uniform float uRimThr;
uniform float uWrap;
uniform float uSoftM;
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
  float d = dot( normal, lightDirection );
  float fw = fwidth( d ) * 0.8 + uToonSoft + uSoftM;
  float thr = uToonThr - uWrap;
  return vec3( smoothstep( thr - fw, thr + fw, d ) );
}`,
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `
{
  float rimF = 1.0 - max( dot( normal, normalize( vViewPosition ) ), 0.0 );
  float fwr = fwidth( rimF ) + 0.01;
  outgoingLight += uRim * diffuseColor.rgb * smoothstep( uRimThr - fwr, uRimThr + fwr, rimF );
}
#include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => 'akashi-toon';
}

const toonCache = new Map();
// Material toon (cacheado por cor e opções simples).
export function toon(color, opts = {}) {
  const key = `${color}|${opts.emissive || 0}|${opts.ei || 0}|${opts.side || 0}|${opts.map ? opts.map.uuid : ''}|${
    opts.transparent ? opts.opacity : ''
  }|${opts.fog === false ? 'nf' : ''}|${opts.vc ? 'vc' : ''}|${opts.wrap || 0}|${opts.soft || 0}`;
  if (!opts.unique && toonCache.has(key)) return toonCache.get(key);
  const m = new THREE.MeshToonMaterial({
    color,
    map: opts.map || null,
    emissive: opts.emissive || 0x000000,
    emissiveIntensity: opts.ei ?? 1,
    side: opts.side ?? THREE.FrontSide,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
    fog: opts.fog !== false,
    vertexColors: !!opts.vc,
  });
  m.userData.wrap = opts.wrap || 0;
  m.userData.soft = opts.soft || 0;
  patchToon(m);
  if (!opts.unique) toonCache.set(key, m);
  return m;
}

// Material sem iluminação (céu pintado, letreiros, rostos).
const flatCache = new Map();
export function flat(color, opts = {}) {
  const key = `${color}|${opts.map ? opts.map.uuid : ''}|${opts.transparent ? 1 : 0}|${opts.opacity ?? 1}|${
    opts.side || 0
  }|${opts.blend || 0}|${opts.fog === false ? 0 : 1}|${opts.dw === false ? 0 : 1}`;
  if (!opts.unique && flatCache.has(key)) return flatCache.get(key);
  const m = new THREE.MeshBasicMaterial({
    color,
    map: opts.map || null,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    blending: opts.blend || THREE.NormalBlending,
    fog: opts.fog !== false,
    depthWrite: opts.dw !== false,
  });
  if (!opts.unique) flatCache.set(key, m);
  return m;
}

const outlineCache = new Map();
export function outlineMaterial(color = 0x1b1416, scale = 1) {
  const key = `${color}|${scale}`;
  if (outlineCache.has(key)) return outlineCache.get(key);
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uOutline = OUTLINE.uOutline;
    sh.uniforms.uOutlineMax = OUTLINE.uOutlineMax;
    sh.uniforms.uScale = { value: scale };
    sh.vertexShader =
      'uniform float uOutline;\nuniform float uOutlineMax;\nuniform float uScale;\n' +
      sh.vertexShader.replace(
        '#include <project_vertex>',
        /* glsl */ `
vec4 mvPosition = vec4( transformed, 1.0 );
vec3 nObj = normal;
#ifdef USE_INSTANCING
mvPosition = instanceMatrix * mvPosition;
nObj = mat3( instanceMatrix ) * nObj;
#endif
mvPosition = modelViewMatrix * mvPosition;
vec3 nView = normalize( normalMatrix * nObj );
float wOut = min( uOutline * max( -mvPosition.z, 0.25 ), uOutlineMax ) * uScale;
mvPosition.xyz += nView * wOut;
gl_Position = projectionMatrix * mvPosition;`,
      );
  };
  m.customProgramCacheKey = () => 'akashi-outline';
  outlineCache.set(key, m);
  return m;
}

// Normais médias por posição: o contorno de caixas e cilindros fica contínuo
// nas quinas (sem rachaduras).
const smoothCache = new WeakMap();
export function smoothNormalGeo(geo) {
  if (smoothCache.has(geo)) return smoothCache.get(geo);
  const g = geo.clone();
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const map = new Map();
  const key = (i) =>
    `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    let a = map.get(k);
    if (!a) map.set(k, (a = [0, 0, 0]));
    a[0] += nor.getX(i);
    a[1] += nor.getY(i);
    a[2] += nor.getZ(i);
  }
  for (let i = 0; i < pos.count; i++) {
    const a = map.get(key(i));
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    nor.setXYZ(i, a[0] / l, a[1] / l, a[2] / l);
  }
  smoothCache.set(geo, g);
  return g;
}

// Malha toon com contorno opcional (scale 0 = sem contorno).
export function mesh(geo, mat, outline = 1, opts = {}) {
  const m = new THREE.Mesh(geo, mat);
  if (outline > 0) {
    const og = opts.smooth ? smoothNormalGeo(geo) : geo;
    const o = new THREE.Mesh(og, outlineMaterial(opts.lineColor ?? 0x1b1416, outline));
    o.raycast = () => {};
    o.userData.isOutline = true;
    m.add(o);
  }
  m.castShadow = opts.cast ?? true;
  m.receiveShadow = opts.receive ?? true;
  return m;
}

// Junta várias geometrias (com matrizes) numa só, sem índice.
export function mergeGeos(list) {
  const parts = list.map(({ geo, matrix }) => {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    return g;
  });
  let n = 0;
  for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of parts) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += c;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
// Matriz que leva o eixo +Y até a direção dir, com a base em pos.
export function alignMatrix(pos, dir, scale = 1) {
  _q.setFromUnitVectors(_up, dir.clone().normalize());
  _s.set(scale, scale, scale);
  return _m.clone().compose(pos, _q, typeof scale === 'number' ? _s : scale);
}

export function canvasTexture(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = opts.aniso ?? 4;
  if (opts.repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  if (opts.nearest) t.magFilter = THREE.NearestFilter;
  return t;
}
