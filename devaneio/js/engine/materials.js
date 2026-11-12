// Materiais com variação em escala de mundo para quebrar a repetição das texturas
// (amostragem dupla + ruído macro + cor distante).
import * as THREE from 'three';
import { injectAtmo } from './atmosphere.js';

const NOISE = /* glsl */ `
float mHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float mNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mHash(i), mHash(i + vec2(1.0, 0.0)), u.x), mix(mHash(i + vec2(0.0, 1.0)), mHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float mFbm(vec2 p) { return mNoise(p) * 0.55 + mNoise(p * 2.13 + 3.1) * 0.3 + mNoise(p * 4.7 + 7.3) * 0.15; }
`;

let gid = 0;

// Material de chão: textura em UV de mundo, segunda amostra em outra escala, ruído macro,
// e transição para uma cor "de longe" (casa com a grama que some à distância).
export function groundMaterial(o = {}) {
  const P = {
    color: '#ffffff',
    roughness: 0.95,
    metalness: 0,
    macro: 0.22,
    macroScale: 0.03,
    second: 0.37,
    secondMix: 0.45,
    far: null,
    farStart: 25,
    farEnd: 70,
    farMix: 0.75,
    normalScale: 1,
    ...o,
  };
  const m = new THREE.MeshStandardMaterial({
    color: P.color,
    map: P.map || null,
    normalMap: P.normalMap || null,
    roughness: P.roughness,
    metalness: P.metalness,
  });
  if (P.normalMap) m.normalScale.set(P.normalScale, P.normalScale);
  const U = {
    uMacro: { value: P.macro },
    uMacroScale: { value: P.macroScale },
    uSecond: { value: P.second },
    uSecondMix: { value: P.secondMix },
    uFar: { value: new THREE.Color(P.far || '#000000') },
    uFarOn: { value: P.far ? 1 : 0 },
    uFarRange: { value: new THREE.Vector3(P.farStart, P.farEnd, P.farMix) },
  };
  m.userData.uniforms = U;
  m.defines = { DV_GROUND: '' };
  m.onBeforeCompile = (sh) => {
    injectAtmo(sh);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vGW;
uniform float uMacro, uMacroScale, uSecond, uSecondMix, uFarOn;
uniform vec3 uFar, uFarRange;
${NOISE}`
      )
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
  vec4 tA = texture2D(map, vMapUv);
  vec4 tB = texture2D(map, vMapUv * uSecond + vec2(0.31, 0.77));
  vec4 sampledDiffuseColor = mix(tA, tB, uSecondMix * (0.6 + 0.4 * mNoise(vGW.xz * 0.05)));
  diffuseColor *= sampledDiffuseColor;
#endif
float mac = mFbm(vGW.xz * uMacroScale);
diffuseColor.rgb *= 1.0 + (mac - 0.5) * 2.0 * uMacro;
if (uFarOn > 0.5) {
  float fd = length(vGW.xz - cameraPosition.xz);
  float fk = smoothstep(uFarRange.x, uFarRange.y, fd) * uFarRange.z;
  diffuseColor.rgb = mix(diffuseColor.rgb, uFar * (1.0 + (mac - 0.5) * 2.0 * uMacro), fk);
}`
      );
  };
  m.customProgramCacheKey = () => 'ground';
  gid++;
  return m;
}

export function std(color, o = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...o });
}

export function glow(color, intensity = 3, o = {}) {
  return new THREE.MeshStandardMaterial({ color: '#000000', emissive: color, emissiveIntensity: intensity, roughness: 1, metalness: 0, ...o });
}

// Material aditivo para halos/brilhos (sem neblina somando cor).
export function additive(map, color = '#ffffff', opacity = 1) {
  const m = new THREE.MeshBasicMaterial({
    map,
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  m.defines = { DV_ADDITIVE: '' };
  return m;
}

// Sombra de contato (mancha escura sob objetos)
export function blobMaterial(map, opacity = 0.5) {
  return new THREE.MeshBasicMaterial({
    map,
    color: '#000000',
    transparent: true,
    opacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

// Folhagem em cartões com transparência recortada: normais "esféricas" (sem inverter
// no verso) para iluminação macia e balanço leve com o vento.
export function foliageMaterial(map, o = {}) {
  const P = { color: '#ffffff', alphaTest: 0.45, roughness: 0.85, sway: 0.06, ...o };
  const m = new THREE.MeshStandardMaterial({
    map,
    color: P.color,
    alphaTest: P.alphaTest,
    side: THREE.DoubleSide,
    roughness: P.roughness,
    metalness: 0,
  });
  m.onBeforeCompile = (sh) => {
    injectAtmo(sh);
    sh.uniforms.uSway = { value: P.sway };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec3 uWind;\nuniform float uSway;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
{
  vec3 wp = vec3(0.0);
  #ifdef USE_INSTANCING
    wp = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  #endif
  float ph = dot(wp.xz, vec2(0.37, 0.21));
  float k = max(transformed.y, 0.0);
  transformed.x += sin(uTime * 1.7 + ph) * uSway * k * uWind.z;
  transformed.z += cos(uTime * 1.3 + ph * 1.3) * uSway * 0.6 * k * uWind.z;
}`
      );
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '')
    );
  };
  m.customProgramCacheKey = () => 'foliage';
  return m;
}

// Normais apontando para fora a partir de um centro (folhagem/copas macias)
export function sphericalNormals(geo, center = [0, 0, 0], bias = [0, 0.3, 0]) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal || new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i) - center[0] + bias[0], pos.getY(i) - center[1] + bias[1], pos.getZ(i) - center[2] + bias[2]).normalize();
    nor.setXYZ(i, v.x, v.y, v.z);
  }
  geo.setAttribute('normal', nor);
  return geo;
}
