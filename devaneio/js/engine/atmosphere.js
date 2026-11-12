// Neblina com altura, cor que puxa para o sol e vento compartilhados por todos os materiais.
// Os blocos de shader de neblina do three.js são substituídos por este modelo e os
// uniforms são injetados em qualquer material via onBeforeCompile.
import * as THREE from 'three';

export const ATMO = {
  uFogColor: { value: new THREE.Color('#d8d8e0') },
  uFogSunColor: { value: new THREE.Color(0, 0, 0) },
  uFogSunDir: { value: new THREE.Vector3(0, 1, 0) },
  // x: densidade do ar no chão (1/m), y: densidade da névoa rasteira, z: queda da névoa
  // com a altura (1/m), w: altura da câmera
  uFogParams: { value: new THREE.Vector4(0.001, 0.0, 0.1, 1.6) },
  // x: queda do ar com a altura (1/m)
  uFogParams2: { value: new THREE.Vector4(1 / 250, 0, 0, 0) },
  uTime: { value: 0 },
  // x,y: direção do vento (xz), z: força
  uWind: { value: new THREE.Vector3(0.8, 0.6, 0.6) },
};

export const FOG_GLSL = /* glsl */ `
float dvLayer(float d0, float b, float h0, float dirY, float L) {
  float dy = clamp(b * dirY * L, -25.0, 60.0);
  float k = abs(dy) > 1e-4 ? (1.0 - exp(-dy)) / dy : 1.0;
  return d0 * exp(-b * h0) * L * k;
}
float dvFogAmount(vec3 rel) {
  float L = length(rel);
  vec3 dir = rel / max(L, 1e-4);
  float od = dvLayer(uFogParams.x, uFogParams2.x, uFogParams.w, dir.y, L)
           + dvLayer(uFogParams.y, uFogParams.z, uFogParams.w, dir.y, L);
  return 1.0 - exp(-od);
}
vec3 dvFogColor(vec3 dir) {
  return uFogColor + uFogSunColor * pow(max(dot(dir, uFogSunDir), 0.0), 5.0);
}
`;

export const FOG_UNIFORMS_GLSL = /* glsl */ `
uniform vec3 uFogColor;
uniform vec3 uFogSunColor;
uniform vec3 uFogSunDir;
uniform vec4 uFogParams;
uniform vec4 uFogParams2;
`;

THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vFogRel;
#endif
`;
THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogRel = transpose(mat3(viewMatrix)) * mvPosition.xyz;
#endif
`;
THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vFogRel;
  ${FOG_UNIFORMS_GLSL}
  ${FOG_GLSL}
#endif
`;
THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  {
    float dvF = dvFogAmount(vFogRel);
    #ifdef DV_ADDITIVE
      gl_FragColor.rgb *= (1.0 - dvF);
    #else
      gl_FragColor.rgb = mix(gl_FragColor.rgb, dvFogColor(normalize(vFogRel)), dvF);
    #endif
  }
#endif
`;

export function injectAtmo(shader) {
  shader.uniforms.uFogColor = ATMO.uFogColor;
  shader.uniforms.uFogSunColor = ATMO.uFogSunColor;
  shader.uniforms.uFogSunDir = ATMO.uFogSunDir;
  shader.uniforms.uFogParams = ATMO.uFogParams;
  shader.uniforms.uFogParams2 = ATMO.uFogParams2;
  shader.uniforms.uTime = ATMO.uTime;
  shader.uniforms.uWind = ATMO.uWind;
}

// Todo material (padrão do three ou ShaderMaterial) recebe os uniforms da atmosfera.
THREE.Material.prototype.onBeforeCompile = function (shader) {
  injectAtmo(shader);
};

export function setAtmosphere(p) {
  if (p.fogColor) ATMO.uFogColor.value.set(p.fogColor);
  if (p.fogSunColor !== undefined) {
    ATMO.uFogSunColor.value.set(p.fogSunColor);
    if (p.fogSunAmount !== undefined) ATMO.uFogSunColor.value.multiplyScalar(p.fogSunAmount);
  }
  if (p.fogBase !== undefined) ATMO.uFogParams.value.x = p.fogBase;
  if (p.fogGround !== undefined) ATMO.uFogParams.value.y = p.fogGround;
  if (p.fogFalloff !== undefined) ATMO.uFogParams.value.z = p.fogFalloff;
  ATMO.uFogParams2.value.x = p.airFalloff !== undefined ? p.airFalloff : 1 / 250;
  if (p.wind) ATMO.uWind.value.set(p.wind[0], p.wind[1], p.wind[2]);
}
