// "Remendo" dos materiais do three.js para o mundo: sombra das nuvens das tempestades,
// superfícies molhadas, clarão dos relâmpagos, máscara de pintura do atlas de fachadas
// e balanço da vegetação com o vento.

import * as THREE from 'three';

const WHITE = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
WHITE.needsUpdate = true;

export const SHARED = {
  uCloudShadow: { value: WHITE },
  uShadowHalf: { value: 30000 },
  uWet: { value: 0 },
  uFlash: { value: 0 },
  uTime: { value: 0 },
  uWind: { value: new THREE.Vector4(1, 0, 0, 0) }, // xy = direção, z = força (m/s), w = rajada
  uTor0: { value: new THREE.Vector4(0, 0, 0, 0) }, // xz = posição, z(w) = raio, w = força
  uTor0b: { value: new THREE.Vector4(0, 0, 0, 0) },
};

const VERT_DECL = /* glsl */ `
varying vec3 vWPos;
uniform float uTime;
uniform vec4 uWind;
uniform vec4 uTor0;
uniform vec4 uTor0b;
vec3 swayOffset(vec3 origin, float h) {
  // Vento ambiente + puxão do tornado próximo (afluxo girando).
  vec2 dir = uWind.xy;
  float s = uWind.z * 0.02;
  vec2 d = origin.xz - uTor0.xy;
  float r = length(d) + 1.0;
  float tor = uTor0.w * smoothstep(uTor0.z * 6.0, uTor0.z, r);
  vec2 tang = vec2(-d.y, d.x) / r * sign(uTor0b.x + 1e-4);
  vec2 inflow = -d / r;
  vec2 tdir = normalize(tang + inflow * 0.6);
  float osc = sin(uTime * (1.3 + s) + origin.x * 0.13 + origin.z * 0.11) * 0.5 + 0.5;
  float gust = 0.6 + 0.4 * sin(uTime * 0.7 + origin.x * 0.01);
  vec2 off = dir * s * (0.4 + 0.6 * osc) * gust + tdir * tor * (0.7 + 0.3 * osc);
  float k = h * h * 0.012;
  return vec3(off.x * k, -length(off) * k * 0.15, off.y * k);
}
`;

const FRAG_DECL = /* glsl */ `
varying vec3 vWPos;
uniform sampler2D uCloudShadow;
uniform float uShadowHalf;
uniform float uWet;
uniform float uFlash;
float cloudSun() {
  vec2 uv = vWPos.xz / (2.0 * uShadowHalf) + 0.5;
  return texture2D(uCloudShadow, uv).r;
}
`;

const PROJECT = /* glsl */ `
vec4 wPos = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  wPos = instanceMatrix * wPos;
#endif
wPos = modelMatrix * wPos;
#ifdef SWAY
  vec3 iOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  wPos.xyz += swayOffset(iOrigin, max(wPos.y - iOrigin.y, 0.0));
#endif
vWPos = wPos.xyz;
vec4 mvPosition = viewMatrix * wPos;
gl_Position = projectionMatrix * mvPosition;
`;

export function patchWorld(material, opts = {}) {
  const { paint = false, sway = false, wet = 1, key = '' } = opts;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, SHARED);
    shader.uniforms.uWetMul = { value: wet };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_DECL)
      .replace('#include <project_vertex>', PROJECT);
    if (sway) shader.vertexShader = '#define SWAY\n' + shader.vertexShader;
    let fs = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG_DECL + '\nuniform float uWetMul;\n');
    fs = fs.replace(
      'getDirectionalLightInfo( directionalLight, directLight );',
      'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= cloudSun();',
    );
    if (paint) {
      fs = fs.replace(
        '#include <color_fragment>',
        `#if defined( USE_COLOR ) && defined( USE_MAP )
          diffuseColor.rgb *= mix(vec3(1.0), vColor, sampledDiffuseColor.a);
          diffuseColor.a = 1.0;
        #elif defined( USE_COLOR )
          diffuseColor.rgb *= vColor;
        #endif`,
      );
    }
    // Molhado: mais escuro e mais liso (reflete o céu).
    fs = fs.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
      float wetK = uWet * uWetMul;
      roughnessFactor = mix(roughnessFactor, 0.18, wetK * 0.85);
      diffuseColor.rgb *= 1.0 - 0.38 * wetK;`,
    );
    // Clarão de relâmpago: luz azulada que ilumina tudo por um instante.
    fs = fs.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      totalEmissiveRadiance += diffuseColor.rgb * vec3(0.75, 0.82, 1.0) * uFlash;`,
    );
    shader.fragmentShader = fs;
  };
  material.customProgramCacheKey = () => `w${paint ? 1 : 0}${sway ? 1 : 0}${wet}${key}`;
  return material;
}

// Material padrão do mundo (MeshStandardMaterial remendado).
export function worldMat(params = {}, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...params });
  return patchWorld(m, opts);
}
