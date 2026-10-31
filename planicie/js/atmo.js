// Atmosfera compartilhada: uniforms globais, presets de iluminação e trechos GLSL
// (céu, neblina, campos agrícolas) usados pelo chão, grama, céu e volume.
import * as THREE from 'three';

export const U = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunCol: { value: new THREE.Color(1, 1, 1) },
  uZenith: { value: new THREE.Color() },
  uHorizon: { value: new THREE.Color() },
  uAmb: { value: new THREE.Color() },
  uStorm: { value: new THREE.Vector2() },
  uStormR: { value: 14000 },
  uTor: { value: new THREE.Vector2(1e6, 1e6) },
  uTorOn: { value: 0 },
  uTorVmax: { value: 0 },
  uTorRc: { value: 50 },
  uTorSpin: { value: -1 },
  uFlash: { value: 0 },
  uFogDen: { value: 1 / 9000 },
  uCloudBase: { value: 900 },
  uCam: { value: new THREE.Vector3() },
  uN2: { value: null },
  uNoise: { value: null },
  uScar: { value: null },
  uScarExt: { value: 8000 },
  uWind: { value: new THREE.Vector2(3, -5) },
};

export const PRESETS = {
  tarde: {
    name: 'Fim de tarde',
    sunElev: 18, sunAz: 250,
    sunCol: [1.75, 1.55, 1.25], zenith: [0.22, 0.36, 0.6], horizon: [0.92, 0.88, 0.8],
    amb: [0.34, 0.37, 0.4], stormR: 14000, fog: 1 / 9500, exposure: 0.8,
  },
  porDoSol: {
    name: 'Pôr do sol',
    sunElev: 4, sunAz: 265,
    sunCol: [2.0, 1.05, 0.5], zenith: [0.18, 0.22, 0.42], horizon: [1.05, 0.62, 0.36],
    amb: [0.27, 0.26, 0.29], stormR: 13000, fog: 1 / 8500, exposure: 0.95,
  },
  escuro: {
    name: 'Tempestade escura',
    sunElev: 25, sunAz: 230,
    sunCol: [1.4, 1.35, 1.25], zenith: [0.2, 0.3, 0.45], horizon: [0.62, 0.66, 0.66],
    amb: [0.22, 0.25, 0.27], stormR: 22000, fog: 1 / 6500, exposure: 0.95,
  },
  verde: {
    name: 'Céu esverdeado',
    sunElev: 12, sunAz: 255,
    sunCol: [1.5, 1.45, 1.0], zenith: [0.2, 0.32, 0.38], horizon: [0.75, 0.86, 0.7],
    amb: [0.25, 0.31, 0.29], stormR: 16000, fog: 1 / 8000, exposure: 0.9,
  },
};

export function applyPreset(p) {
  const el = THREE.MathUtils.degToRad(p.sunElev);
  const az = THREE.MathUtils.degToRad(p.sunAz);
  // norte = -z, leste = +x
  U.uSunDir.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
  U.uSunCol.value.setRGB(...p.sunCol);
  U.uZenith.value.setRGB(...p.zenith);
  U.uHorizon.value.setRGB(...p.horizon);
  U.uAmb.value.setRGB(...p.amb);
  U.uStormR.value = p.stormR;
  U.uFogDen.value = p.fog;
}

// Cobertura da base da tempestade no ponto (0 = céu limpo, 1 = sob a supercélula).
export function stormCoverage(x, z) {
  const d = Math.hypot(x - U.uStorm.value.x, z - U.uStorm.value.y);
  const r = U.uStormR.value;
  const t = THREE.MathUtils.clamp((d - r * 0.55) / (r * 0.45), 0, 1);
  return 1 - t * t * (3 - 2 * t);
}

export const COMMON_GLSL = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uAmb;
uniform vec2 uStorm;
uniform float uStormR;
uniform vec2 uTor;
uniform float uTorOn;
uniform float uTorVmax;
uniform float uTorRc;
uniform float uTorSpin;
uniform float uFlash;
uniform float uFogDen;
uniform float uCloudBase;
uniform vec3 uCam;
uniform vec2 uWind;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float stormCov(vec2 xz) {
  float d = length(xz - uStorm);
  return 1.0 - smoothstep(uStormR * 0.55, uStormR, d);
}

vec3 skyGradient(vec3 rd) {
  float h = max(rd.y, 0.0);
  vec3 c = mix(uHorizon, uZenith, pow(h, 0.45));
  float sd = max(dot(rd, uSunDir), 0.0);
  c += uSunCol * (pow(sd, 5.0) * 0.28 + pow(sd, 48.0) * 0.5);
  return c;
}

vec3 fogColor(vec3 ro, vec3 rd, float dist) {
  vec3 dh = normalize(vec3(rd.x, max(rd.y, 0.0) * 0.4 + 0.02, rd.z));
  vec3 c = skyGradient(dh);
  vec2 dir2 = rd.xz / max(length(rd.xz), 1e-4);
  float covNear = stormCov(ro.xz);
  float covMid = stormCov(ro.xz + dir2 * min(dist, 5000.0));
  float covFar = stormCov(ro.xz + dir2 * min(dist, 14000.0));
  float cov = max(covMid, mix(covNear, covFar, 0.5));
  c = mix(c, uAmb * 1.1, cov * 0.85);
  c += uFlash * vec3(0.45, 0.5, 0.65) * covNear * 0.25;
  return c;
}

vec3 applyFog(vec3 col, vec3 ro, vec3 rd, float dist) {
  float f = 1.0 - exp(-dist * uFogDen);
  return mix(col, fogColor(ro, rd, dist), f);
}

// Luz que chega ao chão: céu encoberto sob a tempestade, sol fora dela.
vec3 groundLight(vec2 xz, float nDotL) {
  float sunVis = 1.0 - stormCov(xz) * 0.94;
  return uAmb * 0.78 + uZenith * 0.06 + uSunCol * max(nDotL, 0.0) * sunVis * 0.85
       + uFlash * vec3(0.5, 0.55, 0.7) * 0.15;
}

// Malha agrícola: talhões de meia milha, estradas de terra a cada milha.
// x = tipo (0 pasto, 1 trigo, 2 arado, 3 lavoura em fileiras, 4 capim seco)
// y = eixo das fileiras, z = aleatório, w = distância à borda do talhão
const float CELL = 805.0;
vec4 fieldInfo(vec2 xz) {
  vec2 c = floor(xz / CELL);
  float h = hash12(c + 3.1);
  float h2 = hash12(c + 17.3);
  float t = h < 0.4 ? 0.0 : h < 0.6 ? 1.0 : h < 0.75 ? 2.0 : h < 0.88 ? 3.0 : 4.0;
  vec2 l = xz - c * CELL;
  float e = min(min(l.x, CELL - l.x), min(l.y, CELL - l.y));
  return vec4(t, step(0.5, h2), h2, e);
}

float roadDist(vec2 xz) {
  vec2 m = abs(mod(xz + 805.0, 1610.0) - 805.0);
  return min(m.x, m.y);
}
`;

// Substitui a neblina padrão dos materiais do three.js pela neblina atmosférica.
export function patchFog(material) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFogW;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 fw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          fw = instanceMatrix * fw;
        #endif
        vFogW = (modelMatrix * fw).xyz;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vFogW;\n${COMMON_GLSL}`)
      .replace(
        '#include <fog_fragment>',
        `{ vec3 fd = vFogW - uCam; float fl = length(fd);
           gl_FragColor.rgb = applyFog(gl_FragColor.rgb, uCam, fd / max(fl, 1e-3), fl); }`
      );
  };
  return material;
}
