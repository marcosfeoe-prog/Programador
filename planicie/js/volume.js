// Renderização volumétrica do tornado (ray marching em meia resolução):
// funil de condensação com estrias girando, nuvem de detritos/poeira na base,
// subvórtices, nuvem parede e cortinas de chuva. Depois composição + tone mapping.
import * as THREE from 'three';
import { U, COMMON_GLSL } from './atmo.js';

const quadVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const volFrag = /* glsl */ `
precision highp float;
precision highp sampler3D;
${COMMON_GLSL}
uniform sampler3D uNoise;
uniform sampler2D uN2;
uniform sampler2D tDepth;
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform vec2 uTB;
uniform float uRBot;
uniform float uRTop;
uniform float uExp;
uniform float uContact;
uniform vec2 uTilt;
uniform float uWobble;
uniform float uMulti;
uniform float uDust;
uniform vec3 uCond;
uniform float uOpacity;
uniform float uDustTint;
uniform float uCondBottom;
uniform float uRotV;
uniform float uWallR;
uniform float uWallOn;
uniform float uFunnelOn;
uniform vec2 uRainPos;
uniform float uRainR;
uniform float uRainOn;
uniform float uRainWrap;
uniform float uStepMul;
uniform float uFrame;
varying vec2 vUv;

#define PI 3.14159265

vec2 funnelCenter(float y) {
  float h = clamp(y / uCloudBase, 0.0, 1.0);
  float s = sin(h * PI);
  return uTB + uTilt * pow(h, 1.5) + uWobble * s * vec2(sin(h * 6.0 + uTime * 0.5), cos(h * 5.0 + uTime * 0.43));
}

float funnelRadius(float h) {
  float r = mix(uRBot, uRTop, pow(h, uExp));
  r += uRTop * 0.9 * pow(smoothstep(0.78, 1.0, h), 2.0);
  // ponta afilada só enquanto o funil ainda desce
  float hb = (1.0 - uContact) * 0.93;
  float tip = sqrt(smoothstep(hb, hb + 0.22 * (1.0 - hb) + 0.02, h));
  r *= mix(tip, 1.0, smoothstep(0.9, 1.0, uContact));
  return r;
}

// Ruído girando em torno de um eixo, com duas fases misturadas para não esticar.
float swirl(vec3 p, vec2 c, float scale, float omega, float up, float helix) {
  vec2 rel = p.xz - c;
  float P = 2.6;
  float f1 = fract(uTime / P);
  float f2 = fract(uTime / P + 0.5);
  float w1 = 1.0 - abs(2.0 * f1 - 1.0);
  float acc = 0.0;
  for (int k = 0; k < 2; k++) {
    float f = k == 0 ? f1 : f2;
    float a = -(omega * f * P) * uTorSpin + p.y * helix;
    float ca = cos(a), sa = sin(a);
    vec2 rr = vec2(ca * rel.x - sa * rel.y, sa * rel.x + ca * rel.y);
    vec3 q = vec3(rr.x, (p.y - up * f * P) * 0.55, rr.y) / scale + float(k) * 0.37;
    vec4 n = texture(uNoise, q);
    vec4 n2 = texture(uNoise, q * 3.1 + 0.21);
    float v = n.a * 0.55 + n.g * 0.25 + n2.a * 0.2;
    acc += v * (k == 0 ? w1 : 1.0 - w1);
  }
  return acc;
}

float hg(float c, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * c, 1.5));
}

// Amostra o volume: devolve cor (rgb) e extinção (a). sd = distância segura
// até a próxima região com densidade; ls = escala local para o passo.
vec4 sampleVol(vec3 p, vec3 rd, out float sd, out float ls) {
  float H = uCloudBase;
  float h = clamp(p.y / H, 0.0, 1.0);
  vec3 col = vec3(0.0);
  float sig = 0.0;
  sd = 1e5;
  ls = 400.0;
  float cov = stormCov(uTB);
  vec3 ambient = uAmb * 1.7 + uZenith * 0.12 + uSunCol * 0.18 * (1.0 - cov);
  float sunVis = 1.0 - cov * 0.94;
  vec3 flash = uFlash * vec3(0.9, 0.95, 1.2) * 0.35;
  vec2 sunH = normalize(uSunDir.xz + 1e-4);
  float cosV = dot(rd, uSunDir);

  // --- funil de condensação ---
  if (uFunnelOn > 0.001) {
    vec2 c = funnelCenter(p.y);
    vec2 rel = p.xz - c;
    float d = length(rel);
    float r = funnelRadius(h);
    float outer = r * 1.35 + 4.0;
    sd = min(sd, max(d - outer, 0.0));
    if (d < outer && r > 0.5) {
      float omega = uRotV / max(d, r * 0.6);
      float n = swirl(p, c, r * 2.0 + 18.0, omega, uRotV * 0.25, 1.0 / (r * 2.5 + 30.0));
      float edge = r * (0.68 + 0.65 * n);
      float dens = smoothstep(edge, edge * 0.45, d);
      // borda esfiapada e faixas horizontais
      dens *= 0.6 + 0.7 * smoothstep(0.3, 0.72, n);
      float hb = (1.0 - uContact) * 0.93;
      dens *= smoothstep(hb, hb + 0.03, h + (n - 0.5) * 0.04);
      dens *= mix(0.12, 1.0, smoothstep(0.0, max(uCondBottom, 1e-3), h));
      dens *= mix(1.0, smoothstep(0.04, 0.45, h) * 0.7 + 0.08, uMulti);
      dens *= uFunnelOn;
      if (dens > 0.001) {
        vec2 nrm = rel / max(d, 1e-3);
        float side = dot(nrm, sunH);
        float shade = (0.62 + 0.32 * side) * mix(0.6, 1.0, smoothstep(0.0, edge, d));
        shade *= mix(1.1, 0.75, h);
        shade *= 0.62 + 0.75 * n;
        vec3 c0 = uCond * (ambient * shade + flash);
        // perto da base da nuvem o funil se funde à nuvem parede escura
        c0 = mix(c0, uAmb * (0.55 + 0.4 * n), smoothstep(0.62, 0.97, h));
        float thin = 1.0 - smoothstep(0.0, 0.6, dens);
        c0 += uSunCol * hg(cosV, 0.6) * thin * sunVis * 1.6;
        float s = dens * uOpacity * 7.0 / max(r, 8.0);
        col += c0 * s;
        sig += s;
      }
      ls = min(ls, max(r, 6.0));
    }

    // --- subvórtices (multivórtice) ---
    if (uMulti > 0.01 && h < 0.5) {
      float orbit = uRBot * 0.55;
      float om = uRotV * 0.5 / max(orbit, 10.0);
      for (int k = 0; k < 3; k++) {
        float a = uTime * om * uTorSpin + float(k) * 2.094;
        vec2 ck = c + orbit * vec2(cos(a), sin(a));
        float rs = uRBot * 0.11 * (1.0 + h * 3.0);
        float dk = length(p.xz - ck);
        if (dk < rs * 1.6) {
          float n = texture(uNoise, vec3(p.x - ck.x, p.y * 0.5 - uTime * 20.0, p.z - ck.y) / (rs * 3.0)).a;
          float dens = smoothstep(rs * (0.8 + 0.5 * n), rs * 0.25, dk) * (1.0 - smoothstep(0.08, 0.45, h)) * uMulti;
          vec3 c0 = mix(uCond, vec3(0.42, 0.35, 0.27), 0.4) * ambient * (0.7 + 0.3 * n);
          float s = dens * 10.0 / max(rs, 4.0);
          col += c0 * s;
          sig += s;
          ls = min(ls, rs);
        }
        sd = min(sd, max(dk - rs * 1.6, 0.0));
      }
    }

    // --- nuvem de poeira e detritos na base ---
    if (uDust > 0.01) {
      float Hd = 30.0 + 180.0 * uDust * (0.4 + 0.6 * clamp(uRBot / 300.0, 0.0, 1.0));
      vec2 c0 = funnelCenter(0.0);
      float dr = (uRBot * 1.35 + 22.0) * (1.0 + 0.9 * clamp(p.y / Hd, 0.0, 1.4));
      vec2 rel0 = p.xz - c0;
      float dd = length(rel0);
      sd = min(sd, max(max(dd - dr * 1.2, p.y - Hd * 1.7), 0.0));
      if (p.y < Hd * 1.7 && dd < dr * 1.2) {
        float nd = swirl(p, c0, dr * 0.9 + 10.0, uRotV * 0.9 / max(dd, uRBot * 0.8 + 5.0), uRotV * 0.5, 0.0);
        float dens = smoothstep(dr * (0.55 + 0.6 * nd), dr * 0.2, dd);
        dens *= 1.0 - smoothstep(Hd * 0.2, Hd * 1.5, p.y + (nd - 0.5) * Hd * 1.2);
        dens *= smoothstep(0.3, 0.75, nd + 0.15) * uDust;
        if (dens > 0.001) {
          vec3 dustCol = mix(vec3(0.4, 0.32, 0.23), vec3(0.5, 0.42, 0.32), nd);
          dustCol = mix(dustCol, uCond, 0.15 * (1.0 - uDustTint));
          vec2 nrm = rel0 / max(dd, 1e-3);
          float shade = (0.65 + 0.3 * dot(nrm, sunH)) * (0.75 + 0.35 * nd);
          vec3 c1 = dustCol * (ambient * shade + flash);
          c1 += uSunCol * vec3(0.9, 0.75, 0.55) * hg(cosV, 0.5) * sunVis * (1.0 - dens) * 1.2;
          float s = dens * 4.5 / max(dr * 0.5, 10.0);
          col += c1 * s;
          sig += s;
        }
        ls = min(ls, max(dr * 0.6, 6.0));
      }
    }
  }

  // --- nuvem parede (rebaixada e girando sob a base) ---
  if (uWallOn > 0.01) {
    vec2 cw = funnelCenter(H);
    vec2 relw = p.xz - cw;
    float dw = length(relw);
    float Rw = uWallR;
    sd = min(sd, max(max(dw - Rw * 1.2, H - 420.0 - p.y), 0.0));
    if (p.y > H - 420.0 && dw < Rw * 1.2) {
      float nw = swirl(p, cw, 300.0, 9.0 / max(dw, 250.0), 2.0, 0.0);
      float q = clamp(dw / Rw, 0.0, 1.0);
      float lowerEdge = H - 330.0 * uWallOn * (1.0 - q * q) + (nw - 0.5) * 160.0;
      float dens = smoothstep(lowerEdge, lowerEdge + 70.0, p.y);
      dens *= smoothstep(Rw * 1.15, Rw * 0.55, dw + (nw - 0.5) * 300.0);
      dens *= smoothstep(H + 60.0, H - 10.0, p.y);
      if (dens > 0.001) {
        float shade = (0.3 + 0.55 * nw * nw) * mix(0.8, 1.0, smoothstep(lowerEdge, lowerEdge + 200.0, p.y));
        vec3 c0 = uAmb * 1.25 * shade + flash * 0.5;
        float s = dens * 0.02 * uWallOn;
        col += c0 * s;
        sig += s;
      }
      ls = min(ls, 70.0);
    }
  }

  if (sig > 0.0) col /= sig;
  sd = max(sd, 0.0);
  return vec4(col, sig);
}

vec2 cylHit(vec3 ro, vec3 rd, vec2 c, float R, float y0, float y1) {
  vec2 oc = ro.xz - c;
  float a = dot(rd.xz, rd.xz);
  float b = dot(oc, rd.xz);
  float cc = dot(oc, oc) - R * R;
  float tA = -1e9, tB = 1e9;
  if (a > 1e-8) {
    float disc = b * b - a * cc;
    if (disc < 0.0) return vec2(1.0, -1.0);
    float sq = sqrt(disc);
    tA = (-b - sq) / a;
    tB = (-b + sq) / a;
  } else if (cc > 0.0) {
    return vec2(1.0, -1.0);
  }
  float ry = abs(rd.y) < 1e-6 ? 1e-6 : rd.y;
  float s0 = (y0 - ro.y) / ry, s1 = (y1 - ro.y) / ry;
  float t0 = max(max(tA, min(s0, s1)), 0.0);
  float t1 = min(tB, max(s0, s1));
  return vec2(t0, t1);
}

// Cortina de chuva: atenuação analítica pelo comprimento da corda.
vec4 rainShaft(vec3 ro, vec3 rd, vec2 c, float R, float tMax, float sigma, out float tIn) {
  vec2 th = cylHit(ro, rd, c, R, 0.0, uCloudBase - 100.0);
  tIn = 1e9;
  if (th.y <= th.x || th.x > tMax) return vec4(0.0);
  float t1 = min(th.y, tMax);
  tIn = th.x;
  vec3 pm = ro + rd * (0.5 * (th.x + t1));
  float len = t1 - th.x;
  // densidade mais forte no núcleo
  vec2 relm = pm.xz - c;
  float core = 1.0 - smoothstep(0.2, 1.0, length(relm) / R);
  float streak = texture(uN2, vec2(atan(relm.y, relm.x) * 0.9, 0.0) + pm.xz * 0.00025).g;
  float a = (1.0 - exp(-len * sigma * (0.45 + core) * (0.7 + 0.6 * streak)));
  a *= smoothstep(uCloudBase - 100.0, uCloudBase * 0.55, pm.y) * 0.5 + 0.5;
  vec3 rc = mix(uAmb * vec3(1.15, 1.2, 1.3), uHorizon * 0.55, 0.15) * (0.85 + 0.25 * streak);
  rc += uFlash * 0.5;
  return vec4(rc * a, a);
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec4 vp = uInvProj * vec4(ndc, 1.0, 1.0);
  vec3 rdv = normalize(vp.xyz / vp.w);
  vec3 rd = normalize((uCamWorld * vec4(rdv, 0.0)).xyz);
  vec3 ro = uCam;
  float z = texture(tDepth, vUv).x;
  float sceneDist = 1e9;
  if (z < 0.9999999) {
    vec4 pv = uInvProj * vec4(ndc, z * 2.0 - 1.0, 1.0);
    sceneDist = length(pv.xyz / pv.w);
  }
  // chão plano: corta o raio no solo mesmo sem profundidade
  if (rd.y < 0.0) sceneDist = min(sceneDist, -ro.y / rd.y);

  float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy + uFrame * vec2(5.588, 3.31), vec2(0.06711056, 0.00583715))));

  vec3 colT = vec3(0.0);
  float TT = 1.0;
  float tEnterT = 1e9;
  if (uFunnelOn > 0.001 || uWallOn > 0.01) {
    vec2 cMid = uTB + uTilt * 0.5;
    float boundR = max(max(uWallR * 1.2, uRTop * 2.6), uRBot * 3.2 + 40.0) + length(uTilt) * 0.55 + uWobble + 60.0;
    vec2 th = cylHit(ro, rd, cMid, boundR, 0.0, uCloudBase + 70.0);
    float tEnd = min(th.y, sceneDist);
    if (th.y > th.x && th.x < sceneDist) {
      float t = th.x + jit * 1.5 * uStepMul;
      tEnterT = th.x;
      for (int i = 0; i < MAX_STEPS; i++) {
        if (t > tEnd || TT < 0.01) break;
        vec3 p = ro + rd * t;
        float sd, ls;
        vec4 s = sampleVol(p, rd, sd, ls);
        float stepLen;
        if (s.a > 1e-5) {
          stepLen = clamp(ls * 0.1, 0.8, 30.0) * uStepMul;
          float a = 1.0 - exp(-s.a * stepLen);
          colT += TT * a * s.rgb;
          TT *= 1.0 - a;
        } else {
          stepLen = max(sd * 0.65, clamp(ls * 0.18, 1.0, 60.0) * uStepMul);
        }
        t += stepLen;
      }
      // névoa entre câmera e o tornado
      float fd = tEnterT + 0.5 * max(0.0, min(tEnd, t) - tEnterT);
      float fogA = exp(-fd * uFogDen);
      colT = mix(fogColor(ro, rd, fd) * (1.0 - TT), colT, fogA);
    }
  }

  vec4 res = vec4(colT, 1.0 - TT);

  // cortinas de chuva: núcleo de precipitação e (opcional) chuva envolvendo o tornado
  float tR1, tR2;
  vec4 r1 = uRainOn > 0.01 ? rainShaft(ro, rd, uRainPos, uRainR, sceneDist, 0.00032 * uRainOn, tR1) : vec4(0.0);
  vec4 r2 = uRainWrap > 0.01 ? rainShaft(ro, rd, uTB + vec2(260.0, 160.0), uRBot * 2.0 + 650.0, sceneDist, 0.0011 * uRainWrap, tR2) : vec4(0.0);
  if (r2.a > 0.0) {
    r2.rgb = applyFog(r2.rgb / max(r2.a, 1e-4), ro, rd, tR2) * r2.a;
    res = tR2 < tEnterT ? vec4(r2.rgb + res.rgb * (1.0 - r2.a), 1.0 - (1.0 - r2.a) * (1.0 - res.a))
                        : vec4(res.rgb + r2.rgb * (1.0 - res.a), 1.0 - (1.0 - r2.a) * (1.0 - res.a));
  }
  if (r1.a > 0.0) {
    r1.rgb = applyFog(r1.rgb / max(r1.a, 1e-4), ro, rd, tR1) * r1.a;
    res = tR1 < tEnterT ? vec4(r1.rgb + res.rgb * (1.0 - r1.a), 1.0 - (1.0 - r1.a) * (1.0 - res.a))
                        : vec4(res.rgb + r1.rgb * (1.0 - res.a), 1.0 - (1.0 - r1.a) * (1.0 - res.a));
  }
  gl_FragColor = res;
}
`;

const compFrag = /* glsl */ `
precision highp float;
uniform sampler2D tScene;
uniform sampler2D tVol;
uniform sampler2D tDepth;
uniform mat4 uInvProj;
uniform vec2 uVolSize;
uniform float uExposure;
uniform float uTime;
uniform float uDamage;
uniform float uFlashUi;
uniform float uRainScreen;
varying vec2 vUv;

float distAt(vec2 uv) {
  float d = texture(tDepth, uv).x;
  if (d >= 0.9999999) return 1e5;
  vec4 pv = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  return length(pv.xyz / pv.w);
}

vec4 volUpsample(vec2 uv) {
  float dist = distAt(uv);
  vec2 p = uv * uVolSize - 0.5;
  vec2 c = floor(p + 0.5);
  vec4 acc = vec4(0.0);
  float ws = 0.0;
  float ld = log(max(dist, 0.1));
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 o = c + vec2(float(i), float(j));
      vec2 tc = (o + 0.5) / uVolSize;
      vec2 dd = abs(o - p);
      float wb = max(0.0, 1.5 - dd.x) * max(0.0, 1.5 - dd.y);
      float rel = abs(log(max(distAt(tc), 0.1)) - ld);
      float w = wb / (1.0 + rel * rel * 40.0);
      acc += texture(tVol, tc) * w;
      ws += w;
    }
  }
  return ws > 1e-4 ? acc / ws : texture(tVol, uv);
}

vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec3 scene = texture(tScene, vUv).rgb;
  vec4 vol = volUpsample(vUv);
  vec3 col = scene * (1.0 - vol.a) + vol.rgb;
  col *= uExposure;
  // gradação: leve dessaturação fria de tempestade
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, 0.95);
  col = aces(col);
  col = pow(col, vec3(1.0 / 2.2));
  // vinheta e granulação suave
  vec2 q = vUv - 0.5;
  col *= 1.0 - dot(q, q) * 0.55;
  col += (hash(vUv * 1000.0 + fract(uTime * 13.7)) - 0.5) * 0.018;
  // dano / vento extremo: borda avermelhada
  col = mix(col, vec3(0.45, 0.06, 0.04), uDamage * smoothstep(0.15, 0.75, length(q) * 1.4));
  col += uFlashUi;
  gl_FragColor = vec4(col, 1.0);
}
`;

export class Pipeline {
  constructor(renderer, quality) {
    this.renderer = renderer;
    this.quality = quality;
    const samples = quality.msaa ? 4 : 0;
    this.depthTex = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    this.rtMain = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      depthTexture: this.depthTex,
      samples,
    });
    this.rtVol = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.rtVol.texture.minFilter = this.rtVol.texture.magFilter = THREE.LinearFilter;

    this.volMat = new THREE.ShaderMaterial({
      vertexShader: quadVert,
      fragmentShader: volFrag,
      defines: { MAX_STEPS: quality.volSteps },
      uniforms: {
        ...U,
        tDepth: { value: this.depthTex },
        uInvProj: { value: new THREE.Matrix4() },
        uCamWorld: { value: new THREE.Matrix4() },
        uTB: { value: new THREE.Vector2(1e6, 1e6) },
        uRBot: { value: 20 },
        uRTop: { value: 60 },
        uExp: { value: 1 },
        uContact: { value: 0 },
        uTilt: { value: new THREE.Vector2() },
        uWobble: { value: 0 },
        uMulti: { value: 0 },
        uDust: { value: 0 },
        uCond: { value: new THREE.Color(0.5, 0.5, 0.5) },
        uOpacity: { value: 1 },
        uDustTint: { value: 0 },
        uCondBottom: { value: 0 },
        uRotV: { value: 30 },
        uWallR: { value: 900 },
        uWallOn: { value: 0 },
        uFunnelOn: { value: 0 },
        uRainPos: { value: new THREE.Vector2() },
        uRainR: { value: 2300 },
        uRainOn: { value: 1 },
        uRainWrap: { value: 0 },
        uStepMul: { value: quality.stepMul },
        uFrame: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.compMat = new THREE.ShaderMaterial({
      vertexShader: quadVert,
      fragmentShader: compFrag,
      uniforms: {
        tScene: { value: this.rtMain.texture },
        tVol: { value: this.rtVol.texture },
        tDepth: { value: this.depthTex },
        uInvProj: { value: new THREE.Matrix4() },
        uVolSize: { value: new THREE.Vector2(1, 1) },
        uExposure: { value: 1.4 },
        uTime: U.uTime,
        uDamage: { value: 0 },
        uFlashUi: { value: 0 },
        uRainScreen: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.volMat);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    this.frame = 0;
  }

  setSize(w, h) {
    const pr = this.renderer.getPixelRatio();
    const W = Math.max(1, Math.floor(w * pr));
    const Hh = Math.max(1, Math.floor(h * pr));
    this.rtMain.setSize(W, Hh);
    const s = this.quality.volScale;
    const vw = Math.max(1, Math.floor(W * s)), vh = Math.max(1, Math.floor(Hh * s));
    this.rtVol.setSize(vw, vh);
    this.compMat.uniforms.uVolSize.value.set(vw, vh);
  }

  render(scene, camera) {
    const r = this.renderer;
    this.frame++;
    camera.updateMatrixWorld();
    const vu = this.volMat.uniforms;
    vu.uInvProj.value.copy(camera.projectionMatrixInverse);
    vu.uCamWorld.value.copy(camera.matrixWorld);
    vu.uFrame.value = this.frame % 64;
    this.compMat.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);

    r.setRenderTarget(this.rtMain);
    r.render(scene, camera);

    this.quad.material = this.volMat;
    r.setRenderTarget(this.rtVol);
    r.render(this.quadScene, this.quadCam);

    this.quad.material = this.compMat;
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCam);
  }

  // Atualiza os uniforms do volume a partir do estado da tempestade.
  sync(storm) {
    const u = this.volMat.uniforms;
    const t = storm.tornado;
    const g = storm.genesisPoint();
    u.uRainPos.value.set(storm.pos.x, storm.pos.y - 2500); // núcleo de chuva ao norte
    if (!t) {
      u.uFunnelOn.value = 0;
      u.uTB.value.copy(g);
      u.uTilt.value.set(0, 0);
      u.uWobble.value = 0;
      u.uWallOn.value = storm.wallCloud;
      u.uRainWrap.value = 0;
      u.uRBot.value = 20;
      u.uRTop.value = 60;
      return;
    }
    u.uFunnelOn.value = Math.min(1, t.contact * 4);
    u.uTB.value.set(t.pos.x, t.pos.y);
    u.uRBot.value = t.rBot;
    u.uRTop.value = t.rTop;
    u.uExp.value = t.exp;
    u.uContact.value = t.contact;
    u.uTilt.value.copy(t.tilt);
    u.uWobble.value = t.wobble;
    u.uMulti.value = t.multi;
    u.uDust.value = t.dust * Math.min(1, t.strength * 1.3) * (t.contact > 0.9 ? 1 : 0.0);
    u.uCond.value.setRGB(...t.look.cond);
    u.uOpacity.value = t.look.opacity;
    u.uDustTint.value = t.look.dustTint;
    u.uCondBottom.value = t.lookKey === 'poeira' ? 0.35 : t.shapeKey === 'multi' ? 0.15 : 0.0;
    u.uRotV.value = Math.max(12, t.vmax * 0.55);
    u.uWallR.value = 550 + t.rTop * 0.8;
    u.uWallOn.value = Math.max(storm.wallCloud, t.phase === 'dissipando' ? 1 - t.phaseT / 14 : 1);
    u.uRainWrap.value = t.look.rainWrap * t.strength;
  }
}
