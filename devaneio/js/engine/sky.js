// Céu procedural: gradiente, sol, nuvens em camada (com iluminação e variação de cor),
// um banco de nuvens "faixa" para o pôr do sol e névoa no horizonte. Também gera o
// mapa de ambiente (PMREM) para que os materiais reflitam o céu do nível.
import * as THREE from 'three';
import { ATMO, FOG_GLSL, FOG_UNIFORMS_GLSL } from './atmosphere.js';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  p.z = p.w * 0.999999;
  gl_Position = p;
}
`;

const FRAG = /* glsl */ `
varying vec3 vDir;
uniform vec3 uZenith, uHorizon, uGround, uHorizonSun;
uniform float uHorizonSunAmt, uSkyExp;
uniform vec3 uSunDir, uSunColor;
uniform float uSunDisc, uSunGlow, uSunGlowPow;
uniform float uCloudCover, uCloudSoft, uCloudScale, uCloudOpacity, uCloudLightK, uCloudBright, uCloudCurve, uCloudThick, uCloudShape, uCloudSteps;
uniform vec2 uCloudWind;
uniform vec3 uCloudLit, uCloudLit2, uCloudShade;
uniform vec4 uBand;
uniform float uBandSpan, uBandGlow;
uniform vec3 uBandLit, uBandLit2, uBandShade;
uniform float uStars, uTime, uSkyFog, uSkyHaze;
${FOG_UNIFORMS_GLSL}
${FOG_GLSL}

float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
const mat2 M2 = mat2(1.6, 1.2, -1.2, 1.6);
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { s += a * noise(p); p = M2 * p; a *= 0.5; } return s; }
float fbm4(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * noise(p); p = M2 * p; a *= 0.5; } return s; }

void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  float t = pow(clamp(y, 0.0, 1.0), uSkyExp);
  vec3 col = mix(uHorizon, uZenith, t);
  vec2 sxz = normalize(uSunDir.xz + vec2(1e-5));
  float az = dot(normalize(d.xz + vec2(1e-5)), sxz) * 0.5 + 0.5;
  col = mix(col, uHorizonSun, uHorizonSunAmt * pow(az, 2.5) * (1.0 - smoothstep(-0.05, 0.45, y)));
  float sd = dot(d, uSunDir);
  col += uSunColor * (uSunGlow * pow(max(sd, 0.0), uSunGlowPow) + uSunGlow * 0.12 * pow(max(sd, 0.0), 3.0));
  col += uSunColor * uSunDisc * smoothstep(0.99955, 0.99978, sd);

  if (uStars > 0.0 && y > 0.0) {
    vec2 sp = d.xz / (y + 0.6) * 260.0;
    vec2 cell = floor(sp);
    float h = hash(cell);
    vec2 sc = fract(sp) - 0.5 - (vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5) * 0.6;
    float st = smoothstep(0.08, 0.0, length(sc)) * step(0.985, h);
    st *= 0.6 + 0.4 * sin(uTime * (1.0 + h * 3.0) + h * 40.0);
    col += vec3(1.0, 0.9, 0.98) * st * uStars * smoothstep(0.0, 0.25, y) * 3.0;
  }

  if (uCloudOpacity > 0.0 && y > 0.0) {
    // faixa de nuvens entre a base (altura 1) e o topo (1 + espessura): ray march curto.
    // A densidade vem de um ruído 2D com limiar que sobe com a altura → base plana e topo
    // arredondado (cúmulos), iluminados por cima.
    float yc = y + uCloudCurve;
    float t0 = 1.0 / yc;
    float t1 = (1.0 + uCloudThick) / yc;
    float len = min(t1 - t0, uCloudThick * 5.0);
    vec2 p0 = d.xz * t0 * uCloudScale + uCloudWind * uTime;
    vec2 q = vec2(fbm4(p0 * 0.45 + vec2(1.7, 9.2)), fbm4(p0 * 0.45 + vec2(8.3, 2.8)));
    vec2 warp = (q - 0.5) * 1.3;
    float cells = smoothstep(0.25, 0.75, noise(p0 * 0.33 + 4.0));
    float tv = fbm4(p0 * 0.09 + vec2(3.3, 7.7));
    vec3 litCol = mix(uCloudLit, uCloudLit2, smoothstep(0.4, 0.62, tv));
    float th = 1.0 - uCloudCover;
    float jit = hash(gl_FragCoord.xy + fract(uTime) * 13.0);
    vec3 acc = vec3(0.0);
    float T = 1.0;
    float stepA = clamp(len / uCloudThick, 0.4, 3.0) / uCloudSteps * 2.2;
    for (int i = 0; i < 10; i++) {
      if (float(i) >= uCloudSteps) break;
      float tt = t0 + (float(i) + jit) / uCloudSteps * len;
      vec2 pp = d.xz * tt * uCloudScale + uCloudWind * uTime + warp;
      float h = clamp((tt * yc - 1.0) / uCloudThick, 0.0, 1.0);
      float n = fbm(pp) * (0.72 + 0.5 * cells);
      float dens = smoothstep(0.0, uCloudSoft, n - th - h * h * uCloudShape);
      if (dens > 0.002) {
        float n2 = fbm(pp + sxz * 0.12);
        float sunF = clamp(0.5 + (n - n2) * uCloudLightK, 0.0, 1.0);
        float lit = clamp(0.18 + 0.62 * h + 0.35 * sunF - (n - th) * 0.6, 0.0, 1.0);
        vec3 c = mix(uCloudShade, litCol, lit);
        float a = clamp(dens * stepA, 0.0, 1.0);
        acc += T * a * c;
        T *= 1.0 - a;
        if (T < 0.02) break;
      }
    }
    float alpha = 1.0 - T;
    vec3 cc = acc / max(alpha, 1e-3);
    cc += uSunColor * pow(max(sd, 0.0), 10.0) * (1.0 - alpha) * 1.2;
    cc = mix(cc, col, 0.1) * uCloudBright;
    float fade = smoothstep(0.0, 0.08, y);
    col = mix(col, cc, alpha * fade * uCloudOpacity);
  }

  if (uBand.w > 0.0) {
    // banco de nuvens do pôr do sol: topo couve-flor iluminado (laranja), base rosa/lilás
    float el = asin(clamp(y, -1.0, 1.0));
    float a = atan(d.x, -d.z);
    float da = a - uBand.z;
    da = atan(sin(da), cos(da));
    float hv = (el - uBand.x) / uBand.y;
    float span = 1.0 - smoothstep(uBandSpan * 0.4, uBandSpan, abs(da));
    vec2 bp = vec2(da * 3.2 + uTime * 0.004, (el - uBand.x) * 9.0);
    vec2 bq = vec2(fbm4(bp * 0.8 + 3.0), fbm4(bp * 0.8 + 9.0));
    float bn = fbm(bp * 1.4 + (bq - 0.5) * 1.6);
    float topEdge = 0.55 + (bn - 0.5) * 1.6 + (fbm4(vec2(da * 9.0, 1.3)) - 0.5) * 0.9;
    float botEdge = -0.75 + (fbm4(vec2(da * 6.0, 7.1)) - 0.5) * 0.35;
    float inside = smoothstep(botEdge - 0.08, botEdge + 0.12, hv) * (1.0 - smoothstep(topEdge - 0.12, topEdge + 0.05, hv));
    float bd = clamp(inside * span * (0.75 + bn * 0.5), 0.0, 1.0);
    float bn2 = fbm(bp * 1.4 + (bq - 0.5) * 1.6 + sxz * 0.25);
    float shade = clamp(0.5 + (bn - bn2) * 4.0, 0.0, 1.0);
    float up = smoothstep(-0.7, 0.9, hv);
    vec3 bc = mix(uBandLit2, uBandLit, clamp(up * 0.85 + shade * 0.35 - 0.15, 0.0, 1.0));
    bc = mix(uBandShade, bc, clamp(0.35 + shade * 0.5 + up * 0.4, 0.0, 1.0));
    bc *= 1.0 + uBandGlow * up * up * (0.6 + shade * 0.6);
    col = mix(col, bc, bd * uBand.w);
    col += uBandLit2 * uBandGlow * 0.035 * exp(-hv * hv * 0.5) * span * uBand.w;
  }

  col = mix(col, uGround, smoothstep(0.0, -0.06, y));
  float fa = dvFogAmount(d * uSkyFog) * uSkyHaze;
  col = mix(col, dvFogColor(d), fa);
  gl_FragColor = vec4(col, 1.0);
}
`;

const deg = Math.PI / 180;

export const SKY_DEFAULTS = {
  zenith: '#8fb2d8',
  horizon: '#dfe3ea',
  ground: '#6f7a5a',
  horizonSun: '#ffd2c0',
  horizonSunAmt: 0.0,
  skyExp: 0.55,
  sunElev: 35,
  sunAzim: 30,
  sunColor: '#ffffff',
  sunDisc: 0.0,
  sunGlow: 0.2,
  sunGlowPow: 24,
  cloudCover: 0.0,
  cloudSoft: 0.12,
  cloudScale: 1.4,
  cloudOpacity: 0.0,
  cloudLightK: 6.0,
  cloudBright: 1.0,
  cloudCurve: 0.1,
  cloudThick: 0.35,
  cloudShape: 0.35,
  cloudSteps: 6,
  cloudWind: [0.006, 0.002],
  cloudLit: '#ffffff',
  cloudLit2: '#fff2dc',
  cloudShade: '#a0a8bc',
  band: [0, 0.1, 0, 0],
  bandSpan: 1.2,
  bandGlow: 0.0,
  bandLit: '#ffa060',
  bandLit2: '#ff70a8',
  bandShade: '#8070a8',
  stars: 0,
  skyFog: 4000,
  skyHaze: 1,
};

export class Sky {
  constructor() {
    const u = {
      uTime: ATMO.uTime,
      uFogColor: ATMO.uFogColor,
      uFogSunColor: ATMO.uFogSunColor,
      uFogSunDir: ATMO.uFogSunDir,
      uFogParams: ATMO.uFogParams,
      uFogParams2: ATMO.uFogParams2,
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uCloudWind: { value: new THREE.Vector2() },
      uBand: { value: new THREE.Vector4() },
    };
    const colors = ['zenith', 'horizon', 'ground', 'horizonSun', 'sunColor', 'cloudLit', 'cloudLit2', 'cloudShade', 'bandLit', 'bandLit2', 'bandShade'];
    for (const c of colors) u['u' + c[0].toUpperCase() + c.slice(1)] = { value: new THREE.Color() };
    const floats = ['horizonSunAmt', 'skyExp', 'sunDisc', 'sunGlow', 'sunGlowPow', 'cloudCover', 'cloudSoft', 'cloudScale', 'cloudOpacity', 'cloudLightK', 'cloudBright', 'cloudCurve', 'cloudThick', 'cloudShape', 'cloudSteps', 'bandSpan', 'bandGlow', 'stars', 'skyFog', 'skyHaze'];
    for (const f of floats) u['u' + f[0].toUpperCase() + f.slice(1)] = { value: 0 };
    this.uniforms = u;
    this.material = new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.geometry = new THREE.SphereGeometry(1, 48, 24);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1000;
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.params = { ...SKY_DEFAULTS };
    this.set(SKY_DEFAULTS);
    this.pmrem = null;
    this.envRT = null;
  }

  set(p) {
    Object.assign(this.params, p);
    const P = this.params;
    const u = this.uniforms;
    for (const k in P) {
      const name = 'u' + k[0].toUpperCase() + k.slice(1);
      const v = P[k];
      if (!u[name]) continue;
      if (typeof v === 'string') u[name].value.set(v);
      else if (typeof v === 'number') u[name].value = v;
    }
    const el = P.sunElev * deg, az = P.sunAzim * deg;
    // azimute 0 = olhando para -Z (frente do jogador ao começar), positivo para a direita (+X)
    this.sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    u.uSunDir.value.copy(this.sunDir);
    u.uCloudWind.value.set(P.cloudWind[0], P.cloudWind[1]);
    u.uBand.value.set(P.band[0] * deg, P.band[1] * deg, P.band[2] * deg, P.band[3]);
    u.uBandSpan.value = P.bandSpan;
  }

  follow(camera) {
    this.mesh.position.copy(camera.position);
  }

  // Gera (ou regenera) o mapa de ambiente filtrado a partir do céu atual.
  makeEnvironment(renderer) {
    if (!this.pmrem) this.pmrem = new THREE.PMREMGenerator(renderer);
    const s = new THREE.Scene();
    const m = new THREE.Mesh(this.geometry, this.material);
    m.frustumCulled = false;
    s.add(m);
    const old = this.envRT;
    this.envRT = this.pmrem.fromScene(s, 0.02, 0.1, 100);
    if (old) old.dispose();
    return this.envRT.texture;
  }
}
