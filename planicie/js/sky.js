// Céu: gradiente atmosférico + base da supercélula (camada de nuvens com
// ray marching curto), nuvem parede rebaixada e girando sobre o tornado.
import * as THREE from 'three';
import { U, COMMON_GLSL } from './atmo.js';

const vert = /* glsl */ `
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  gl_Position.z = gl_Position.w * 0.99999; // sempre no fundo
}
`;

const frag = /* glsl */ `
precision highp float;
precision highp sampler3D;
${COMMON_GLSL}
uniform sampler3D uNoise;
uniform int uSteps;
varying vec3 vW;

// rotação do mesociclone com duas fases misturadas (evita esticar o ruído para sempre)
float swirlNoise(vec3 p, float r, vec2 rel) {
  float omega = uTorOn * uTorSpin * 0.05 * exp(-r / 2600.0);
  vec3 drift = vec3(uWind.x, 0.0, uWind.y) * uTime * 0.6;
  if (omega < 0.0005) {
    vec4 n = texture(uNoise, (p - drift) * 0.00032);
    return n.a * 0.7 + n.g * 0.3;
  }
  float P = 40.0;
  float f1 = fract(uTime / P), f2 = fract(uTime / P + 0.5);
  float w1 = 1.0 - abs(2.0 * f1 - 1.0);
  float res = 0.0;
  for (int k = 0; k < 2; k++) {
    float f = k == 0 ? f1 : f2;
    float a = -omega * f * P;
    float c = cos(a), s = sin(a);
    vec2 rr = vec2(c * rel.x - s * rel.y, s * rel.x + c * rel.y);
    vec3 q = vec3(uTor.x + rr.x, p.y, uTor.y + rr.y) - drift + float(k) * 913.0;
    vec4 n = texture(uNoise, q * 0.00032);
    res += (n.a * 0.7 + n.g * 0.3) * (k == 0 ? w1 : 1.0 - w1);
  }
  return res;
}

void main() {
  vec3 ro = uCam;
  vec3 rd = normalize(vW - uCam);
  if (rd.y <= 0.002) {
    gl_FragColor = vec4(fogColor(ro, rd, 1e6), 1.0);
    return;
  }
  vec3 bg = skyGradient(rd);
  float base0 = uCloudBase - 320.0;
  float thick = 900.0;
  float t0 = (base0 - ro.y) / rd.y;
  float t1 = min((uCloudBase + thick - ro.y) / rd.y, t0 + 9000.0);
  vec3 sum = vec3(0.0);
  float T = 1.0;
  float steps = float(uSteps);
  float dt = (t1 - t0) / steps;
  float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float tHit = t1;
  for (int i = 0; i < 24; i++) {
    if (i >= uSteps || T < 0.03) break;
    float t = t0 + (float(i) + jit) * dt;
    vec3 p = ro + rd * t;
    vec2 rel = p.xz - uTor;
    float r = length(rel);
    float wall = uTorOn * exp(-r * r / (1400.0 * 1400.0));
    float base = uCloudBase - 300.0 * wall;
    float hf = clamp((p.y - base) / thick, 0.0, 1.0);
    if (p.y < base) continue;
    float cov = stormCov(p.xz);
    float n = swirlNoise(p, r, rel);
    float lower = smoothstep(0.0, 0.12, hf);
    float d = clamp((n + cov * 0.95 + wall * 0.4 - 0.98) * 4.0, 0.0, 1.0) * lower;
    if (d > 0.001) {
      tHit = min(tHit, t);
      float lit = pow(hf, 0.55);
      float n2 = texture(uNoise, p * 0.0012 + vec3(0.0, uTime * 0.0004, 0.0)).g;
      float tex = mix(0.45, 1.35, n) * mix(0.75, 1.2, n2);
      vec3 dark = uAmb * 0.42 * tex * (1.0 - wall * 0.4);
      vec3 lightTop = mix(uAmb * 0.95 * tex, uSunCol * 0.75 + uZenith * 0.45, 1.0 - cov);
      vec3 c = mix(dark, lightTop, lit * (1.0 - cov * 0.6));
      // borda iluminada pelo sol baixo fora da tempestade
      float sd = max(dot(rd, uSunDir), 0.0);
      c += uSunCol * pow(sd, 6.0) * (1.0 - cov) * 0.6;
      c += uFlash * vec3(0.7, 0.75, 0.95) * (0.6 + n) * cov;
      float a = 1.0 - exp(-d * dt * 0.02);
      sum += T * a * c;
      T *= 1.0 - a;
    }
  }
  vec3 col = sum + T * bg;
  col = applyFog(col, ro, rd, tHit * 0.75);
  gl_FragColor = vec4(col, 1.0);
}
`;

export function createSky(quality) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: { ...U, uSteps: { value: quality.cloudSteps } },
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(30000, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}
