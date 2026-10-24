// Pele procedural dos dinossauros: o STL não tem cor nem textura, então tudo é
// calculado no shader a partir da posição de repouso de cada vértice: costas escuras e
// barriga clara, listras, manchas, escamas em relevo, olhos, interior da boca, dentes
// e manchas de sangue nos pontos onde levou tiro.
import * as THREE from 'three';

export const MAX_WOUNDS = 10;

const NOISE = /* glsl */ `
float dh31(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
vec3 dh33(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
float dvnoise(vec3 p){
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dh31(i), dh31(i + vec3(1,0,0)), f.x), mix(dh31(i + vec3(0,1,0)), dh31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(dh31(i + vec3(0,0,1)), dh31(i + vec3(1,0,1)), f.x), mix(dh31(i + vec3(0,1,1)), dh31(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float dfbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * dvnoise(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
// relevo de escamas: saliências arredondadas (ruído de valor, contínuo nas derivadas)
float dscales(vec3 p){
  float a = dvnoise(p);
  float b = dvnoise(p * 2.13 + 5.7);
  return a * a * 1.2 + b * 0.45;
}
`;

export function createDinoMaterial(asset, quality = 'high') {
  const sp = asset.species;
  const c = sp.cores;
  const s = sp.scale;
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0.0 });
  const eyeL = asset.eyes[0] || new THREE.Vector3(0, -100, 0);
  const eyeR = asset.eyes[1] || new THREE.Vector3(0, -100, 0);
  const wounds = [];
  for (let i = 0; i < MAX_WOUNDS; i++) wounds.push(new THREE.Vector4(0, -1000, 0, 0));
  const hingeZ = asset.joint.jaw.z;
  const uniforms = {
    uBack: { value: new THREE.Color(c.costas) },
    uSide: { value: new THREE.Color(c.lados) },
    uBelly: { value: new THREE.Color(c.barriga) },
    uStripe: { value: new THREE.Color(c.listras) },
    uEye: { value: new THREE.Color(c.olho) },
    uEyeGlow: { value: new THREE.Color(c.brilhoOlho) },
    uMouth: { value: new THREE.Color(c.boca) },
    uStripeFreq: { value: c.listraFreq / s },
    uStripeAmt: { value: c.listraQtd },
    uSpots: { value: c.manchas },
    uInvScale: { value: 1 / s },
    uEyeL: { value: eyeL },
    uEyeR: { value: eyeR },
    uEyeRad: { value: sp.eyeRadius * s },
    uHingeZ: { value: hingeZ },
    uHurt: { value: 0 },
    uNight: { value: 0 },
    uWounds: { value: wounds },
    uBump: { value: quality === 'low' ? 0 : 1 },
  };
  mat.userData.uniforms = uniforms;
  mat.userData.wounds = wounds;
  mat.userData.woundCount = 0;
  const detailed = quality !== 'low';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aJaw;
varying vec3 vRest;
varying vec3 vRestN;
varying float vJaw;
varying vec3 vAxX, vAxY, vAxZ;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vRest = position; vRestN = normal; vJaw = aJaw;`,
      )
      .replace(
        '#include <defaultnormal_vertex>',
        `#include <defaultnormal_vertex>
#ifdef USE_SKINNING
mat3 dsm = mat3(skinMatrix);
#else
mat3 dsm = mat3(1.0);
#endif
vAxX = normalMatrix * (dsm * vec3(1.0, 0.0, 0.0));
vAxY = normalMatrix * (dsm * vec3(0.0, 1.0, 0.0));
vAxZ = normalMatrix * (dsm * vec3(0.0, 0.0, 1.0));`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vRest;
varying vec3 vRestN;
varying float vJaw;
varying vec3 vAxX, vAxY, vAxZ;
uniform vec3 uBack, uSide, uBelly, uStripe, uEye, uEyeGlow, uMouth;
uniform float uStripeFreq, uStripeAmt, uSpots, uInvScale, uEyeRad, uHingeZ, uHurt, uNight, uBump;
uniform vec3 uEyeL, uEyeR;
uniform vec4 uWounds[${MAX_WOUNDS}];
${NOISE}
float gBlood = 0.0; float gEye = 0.0; float gMouth = 0.0;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  vec3 rp = vRest * uInvScale;           // unidades do STL (padrões com o mesmo tamanho relativo)
  vec3 rn = normalize(vRestN);
  float up = rn.y;
  float n1 = dfbm(rp * 0.11);
  float back = smoothstep(-0.25, 0.75, up + (n1 - 0.5) * 0.5);
  float belly = smoothstep(0.0, -0.65, up + (n1 - 0.5) * 0.3);
  vec3 col = mix(uSide, uBack, back);
  col = mix(col, uBelly, belly * 0.9);
  // listras transversais, só nas costas e nos lados
  float st = sin(vRest.z * uStripeFreq + dfbm(rp * 0.07) * 6.0 + abs(rp.x) * 0.15);
  float stripe = smoothstep(0.35, 0.8, st) * smoothstep(-0.35, 0.35, up) * uStripeAmt;
  col = mix(col, uStripe, stripe);
  // manchas e variação
  float sp = dfbm(rp * 0.32 + 3.0);
  col *= 1.0 - uSpots * smoothstep(0.55, 0.75, sp) * 0.6;
  col *= 0.9 + 0.2 * dfbm(rp * 0.22 + 11.0);
  // interior da boca: triângulos que ligam a mandíbula à cabeça (esticam ao abrir)
  float m = vJaw;
  float inner = 1.0 - abs(2.0 * m - 1.0);
  float front = smoothstep(uHingeZ + 1.0 / uInvScale, uHingeZ + 3.0 / uInvScale, vRest.z);
  gMouth = smoothstep(0.08, 0.3, inner) * front;
  float teeth = step(0.45, fract(vRest.z * uInvScale * 0.9)) * (1.0 - smoothstep(0.1, 0.3, inner)) * step(0.02, inner) * front;
  col = mix(col, uMouth * (0.5 + 0.5 * smoothstep(0.3, 1.0, inner)), gMouth);
  col = mix(col, vec3(0.86, 0.82, 0.7), teeth);
  // olhos
  float de = min(distance(vRest, uEyeL), distance(vRest, uEyeR)) / uEyeRad;
  gEye = 1.0 - smoothstep(0.85, 1.0, de);
  vec3 eyeCol = mix(uEye, uEye * 0.35, smoothstep(0.2, 0.85, de));
  eyeCol = mix(vec3(0.01), eyeCol, smoothstep(0.12, 0.3, de));
  col = mix(col, eyeCol, gEye);
  // sangue dos ferimentos
  for (int i = 0; i < ${MAX_WOUNDS}; i++) {
    vec4 w = uWounds[i];
    if (w.w <= 0.0) continue;
    float d = distance(vRest, w.xyz);
    float r = w.w * (0.7 + 0.6 * dvnoise(rp * 0.8 + float(i) * 3.1));
    float b = 1.0 - smoothstep(r * 0.35, r, d);
    // escorre para baixo
    float drip = (1.0 - smoothstep(0.0, w.w * 0.25, abs(vRest.x - w.x) + abs(vRest.z - w.z) * 0.5)) * step(vRest.y, w.y) * (1.0 - smoothstep(0.0, w.w * 3.0, w.y - vRest.y));
    gBlood = max(gBlood, max(b, drip * 0.8));
  }
  col = mix(col, vec3(0.25, 0.015, 0.01), gBlood * 0.92);
  diffuseColor.rgb = col;
}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.25, max(gEye, gBlood * 0.7));
roughnessFactor = mix(roughnessFactor, 0.4, gMouth);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
${
  detailed
    ? `if (uBump > 0.5) {
  // relevo das escamas: gradiente calculado no espaço de repouso e levado pela rotação do skinning
  vec3 q = vRest * uInvScale * 1.6;
  float fade = (1.0 - smoothstep(0.3, 0.9, length(fwidth(q)))) * (1.0 - gEye) * (1.0 - gMouth);
  if (fade > 0.01) {
    const float e = 0.07;
    float h0 = dscales(q);
    float hx = dscales(q + vec3(e, 0.0, 0.0));
    float hy = dscales(q + vec3(0.0, e, 0.0));
    float hz = dscales(q + vec3(0.0, 0.0, e));
    vec3 g = vec3(hx - h0, hy - h0, hz - h0) / e;
    vec3 gv = vAxX * g.x + vAxY * g.y + vAxZ * g.z;
    gv -= normal * dot(gv, normal);
    normal = normalize(normal - gv * 0.22 * fade);
  }
}`
    : ''
}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += uEyeGlow * gEye * (0.6 + 2.5 * uNight);
totalEmissiveRadiance += vec3(0.5, 0.05, 0.02) * uHurt;`,
      );
  };
  mat.customProgramCacheKey = () => 'dino-skin-' + (detailed ? 'hi' : 'lo');
  return mat;
}

// Marca um ferimento (posição no pose de repouso, espaço do modelo).
export function addWound(mat, restPos, radius) {
  const w = mat.userData.wounds;
  const i = mat.userData.woundCount % MAX_WOUNDS;
  w[i].set(restPos.x, restPos.y, restPos.z, radius);
  mat.userData.woundCount++;
}

export function clearWounds(mat) {
  for (const w of mat.userData.wounds) w.set(0, -1000, 0, 0);
  mat.userData.woundCount = 0;
}
