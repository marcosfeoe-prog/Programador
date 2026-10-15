// Renderizador volumétrico (ray marching): camada de cúmulos, supercélula
// (torre, bigorna, base, nuvem parede, chuva) e o tornado (funil + nuvem de detritos).
// É desenhado em resolução reduzida e composto sobre a cena no pós-processamento.
import * as THREE from 'three';
import { FOG_GLSL } from './fog.js';

const vert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const frag = /* glsl */ `
precision highp float;
precision highp sampler3D;

uniform sampler2D tDepth;
uniform sampler3D tNoise;
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform vec3 uCamPos;
uniform float uTime;
uniform float uFrame;
uniform int uSteps;
uniform int uLightSteps;

uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uAmbTop;
uniform vec3 uAmbBot;
uniform vec4 uFlash;

uniform float uCloudBase;
uniform float uCloudThick;
uniform float uCoverage;
uniform vec2 uWindOff;

uniform float uStormAlpha;
uniform vec2 uStormPos;
uniform vec2 uUpdraft;
uniform vec2 uStormDir;
uniform float uGrowth;
uniform float uStormTop;
uniform float uTowerR;
uniform float uBaseR;
uniform float uAnvil;
uniform float uAnvilLen;
uniform float uMesoAngle;
uniform float uMeso;
uniform vec4 uWall;
uniform vec4 uRain;
uniform vec4 uHook;

uniform vec3 uTorBase;
uniform vec2 uTorAxis[6];
uniform float uTorTop;
uniform vec4 uTorR;
uniform vec4 uTorP;
uniform vec4 uTorM;
uniform vec4 uTorD;
uniform vec4 uTorX;
uniform vec3 uDebrisCol;
uniform float uDebug;

varying vec2 vUv;

${FOG_GLSL}

float remap(float x, float a, float b, float c, float d) { return c + (x - a) / (b - a) * (d - c); }
float sat(float x) { return clamp(x, 0.0, 1.0); }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / (12.566 * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

// ---------------------------------------------------------------- Tornado
vec2 catmull(vec2 p0, vec2 p1, vec2 p2, vec2 p3, float t) {
  float t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2.0 * p1) + (-p0 + p2) * t + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3);
}
vec2 torAxis(float hn) {
  float t = clamp(hn, 0.0, 1.0) * 5.0;
  int i = int(min(floor(t), 4.0));
  float f = t - float(i);
  vec2 p0 = uTorAxis[max(i - 1, 0)];
  vec2 p1 = uTorAxis[i];
  vec2 p2 = uTorAxis[i + 1];
  vec2 p3 = uTorAxis[min(i + 2, 5)];
  return catmull(p0, p1, p2, p3, f);
}
float torRadius(float hn) {
  float r = mix(uTorR.x, uTorR.y, pow(hn, uTorR.z));
  r += uTorR.w * pow(smoothstep(0.72, 1.0, hn), 2.0);
  return r;
}

// Retorna (condensação, detritos); dist = distância horizontal à borda.
vec2 tornado(vec3 p, bool cheap, out float dist) {
  dist = 1e5;
  if (uTorD.w < 0.5) return vec2(0.0);
  float H = max(uTorTop - uTorBase.y, 10.0);
  float h = p.y - uTorBase.y;
  float hn = clamp(h / H, 0.0, 1.0);
  vec2 rel = p.xz - (uTorBase.xz + torAxis(hn));
  float d = length(rel);
  float R = torRadius(hn);
  float outerR = R * (uTorM.x > 0.5 ? 1.7 : 1.45);
  float debR = uTorD.x;
  if (uTorP.w > 0.01 && h < uTorD.y * 3.5) outerR = max(outerR, debR);
  dist = d - outerR;
  if (h < -10.0 || h > H + 80.0) { dist = max(dist, abs(h - H * 0.5) - H * 0.5); return vec2(0.0); }
  if (dist > 0.0) return vec2(0.0);

  float fb = uTorP.y - uTorBase.y; // base do funil (altura relativa)
  float taper = mix(1.0, smoothstep(fb, fb + max(H * 0.14, 25.0), h), uTorX.x);
  float Rt = R * mix(0.12, 1.0, taper);

  if (cheap) {
    float c = smoothstep(Rt, Rt * 0.55, d) * step(fb, h) * uTorP.x;
    float db = uTorP.w * smoothstep(debR, debR * 0.3, d) * exp(-max(h, 0.0) / max(uTorD.y, 1.0));
    return vec2(c, db);
  }

  // Ruído girando rigidamente em torno do eixo + subida helicoidal.
  vec2 q = rot(uTorP.z) * rel;
  float fs = 1.0 / (max(R, 12.0) * 3.2);
  vec3 nc = vec3(q.x * fs, h * fs * 0.45 - uTime * 0.05, q.y * fs);
  vec4 n4 = texture(tNoise, nc);
  float n = n4.r * 0.6 + n4.g * 0.4;
  // Faixa vertical de baixa frequência (funil irregular / fragmentado)
  float brk = texture(tNoise, vec3(0.13, h / (H * 1.5) + uTime * 0.01, 0.37)).a;

  float edge = 1.0 - d / max(Rt, 0.5);
  float body = smoothstep(-0.06, 0.22, edge + (n - 0.55) * 0.5);
  body *= smoothstep(fb - 2.0, fb + 6.0, h);
  // Efeito de "corda" fragmentada no estágio final
  body *= 1.0 - uTorD.z * smoothstep(0.42, 0.62, brk);

  // Múltiplos vórtices
  float cond0 = 0.0;
  float subDust = 0.0;
  if (uTorM.x > 0.5) {
    float sub = 0.0;
    for (int i = 0; i < 6; i++) {
      if (float(i) >= uTorM.x) break;
      float a = 6.2831853 * float(i) / uTorM.x + uTorP.z * 0.55 + hn * 1.2;
      float orb = uTorM.y * (0.85 + 0.15 * sin(uTime * 0.6 + float(i) * 2.3));
      vec2 sc = vec2(cos(a), sin(a)) * orb;
      float ds = length(rel - sc);
      float rs = uTorM.z * mix(0.55, 1.4, hn) * mix(0.3, 1.0, taper);
      sub = max(sub, smoothstep(rs, rs * 0.2, ds + (n - 0.5) * rs * 0.9));
      // redemoinho de poeira de cada vórtice de sucção
      subDust = max(subDust, smoothstep(rs * 2.2, rs * 0.4, ds + (n - 0.5) * rs) * exp(-max(h, 0.0) / (uTorD.y * 3.0)));
    }
    float pc = body * uTorP.x;
    cond0 = max(pc * (1.0 - 0.75 * uTorM.w), sub * uTorM.w);
  }
  float cond = uTorM.x > 0.5 ? cond0 : body * uTorP.x;

  float deb = 0.0;
  if (uTorP.w > 0.001) {
    vec2 qd = rot(uTorP.z * 1.6) * rel;
    float fd = 1.0 / max(debR * 0.9, 20.0);
    float nd = texture(tNoise, vec3(qd.x * fd, h * fd * 0.8 - uTime * 0.12, qd.y * fd)).r;
    float shape = smoothstep(debR, debR * 0.25, d + (nd - 0.5) * debR * 0.9);
    float vert = exp(-max(h, 0.0) / max(uTorD.y, 1.0));
    deb = shape * vert * uTorP.w * (0.4 + nd * 0.9) * (1.0 - 0.55 * uTorM.w);
    deb *= 260.0 / (260.0 + debR);
    deb += subDust * uTorP.w * uTorM.w * (0.6 + nd * 0.8);
    // Detritos sobem ao longo do funil
    deb += uTorP.w * 0.25 * smoothstep(R * 1.25, R * 0.6, d) * exp(-max(h, 0.0) / (uTorD.y * 4.0)) * nd;
  }
  return vec2(cond, deb);
}

// ---------------------------------------------------------------- Nuvens
float stormCover(vec2 xz) {
  if (uStormAlpha <= 0.0) return 0.0;
  vec2 r = xz - uStormPos;
  float d = length(r);
  float core = smoothstep(uBaseR * 1.1, uBaseR * 0.55, d) * smoothstep(0.15, 0.5, uGrowth);
  vec2 ru = xz - uUpdraft;
  float along = dot(ru, uStormDir);
  float side = abs(dot(ru, vec2(-uStormDir.y, uStormDir.x)));
  float w = uTowerR * 1.1 + max(along, 0.0) * 0.45;
  float anv = uAnvil * smoothstep(w, w * 0.6, side) * smoothstep(-uTowerR * 1.3, -uTowerR * 0.6, along)
            * smoothstep(uAnvilLen, uAnvilLen * 0.6, along);
  return clamp(max(core, anv * 0.85), 0.0, 1.0) * uStormAlpha;
}

// Densidade das nuvens. type: x = nuvem, y = precipitação
vec2 clouds(vec3 p, bool cheap) {
  float dens = 0.0;
  float precip = 0.0;

  // --- Camada de cúmulos ambiente ---
  float hl = (p.y - uCloudBase - 120.0) / uCloudThick;
  if (hl > 0.0 && hl < 1.0) {
    vec3 q = vec3(p.x + uWindOff.x, p.y, p.z + uWindOff.y);
    float cov = uCoverage;
    if (uStormAlpha > 0.0) cov += 0.18 * uStormAlpha * smoothstep(uBaseR * 1.6, uBaseR * 0.8, length(p.xz - uStormPos));
    vec4 n = texture(tNoise, q * vec3(1.0 / 2600.0, 1.0 / 1800.0, 1.0 / 2600.0));
    float big = texture(tNoise, q * (1.0 / 11000.0) + 0.37).a;
    cov = sat(cov + (big - 0.5) * 0.5);
    float grad = smoothstep(0.0, 0.07, hl) * smoothstep(1.0, mix(0.3, 0.75, cov), hl);
    float d = remap(n.r * grad, 1.0 - cov, 1.0, 0.0, 1.0);
    if (d > 0.0 && !cheap) {
      vec4 dn = texture(tNoise, q * (1.0 / 520.0) + vec3(0.0, uTime * 0.0015, 0.0));
      float det = dn.g * 0.6 + dn.b * 0.4;
      d = remap(d, det * 0.32, 1.0, 0.0, 1.0);
    }
    dens = max(dens, d * 0.9);
  }

  if (uStormAlpha <= 0.0) return vec2(max(dens, 0.0), 0.0);

  // --- Supercélula ---
  float H = uStormTop - uCloudBase;
  float hn = (p.y - uCloudBase) / H;
  vec2 ru = p.xz - uUpdraft;
  float du = length(ru);
  float along = dot(ru, uStormDir);
  float side = dot(ru, vec2(-uStormDir.y, uStormDir.x));
  float topN = clamp(smoothstep(0.0, 0.85, uGrowth) * 1.02, 0.08, 1.0);

  float cov = 0.0;
  if (hn > -0.02 && hn < 1.12) {
    // Torre de corrente ascendente (com topo em domo e torção do mesociclone)
    float Rt = uTowerR * (0.35 + 0.65 * smoothstep(0.0, 0.6, uGrowth));
    Rt *= (0.8 + 0.2 * smoothstep(0.0, 0.25, hn)) * (1.0 - 0.22 * smoothstep(0.45, 0.85, hn));
    float domeStart = topN - 0.16;
    if (hn > domeStart) Rt *= sqrt(max(0.0, 1.0 - pow((hn - domeStart) / max(topN + 0.06 - domeStart, 0.01), 2.0)));
    // lóbulos irregulares da torre
    float lobe = texture(tNoise, vec3(ru.x / 2600.0, p.y / 3000.0, ru.y / 2600.0)).a;
    float RtL = Rt * (0.82 + 0.36 * lobe);
    float tower = RtL > 1.0 ? smoothstep(RtL, RtL * 0.5, du) : 0.0;
    cov = max(cov, tower);
    // Linha de torres de flanco (cúmulos congestus alinhados no flanco traseiro)
    if (uGrowth > 0.5) {
      vec2 rgt = vec2(-uStormDir.y, uStormDir.x);
      for (int k = 1; k <= 4; k++) {
        float fk = float(k);
        vec2 c = uUpdraft - uStormDir * (fk * 1700.0) + rgt * (fk * 800.0);
        float rk = uTowerR * (0.68 - fk * 0.1);
        float topk = (0.85 - fk * 0.16) * smoothstep(0.5, 1.0, uGrowth);
        float hk = clamp(hn / max(topk, 0.05), 0.0, 2.0);
        float rr2 = rk * (hk > 0.75 ? sqrt(max(0.0, 1.0 - pow((hk - 0.75) / 0.3, 2.0))) : 1.0);
        float dk = length(p.xz - c);
        if (rr2 > 1.0) cov = max(cov, smoothstep(rr2, rr2 * 0.45, dk) * step(0.0, hn));
      }
    }

    // Bigorna espalhando-se a favor do vento em altitude
    if (uAnvil > 0.0) {
      float aL = uAnvilLen * uAnvil;
      float fa = sat(along / max(aL, 1.0));
      float aBot = mix(0.8, 0.88, fa);
      float aTop = mix(1.0, 0.95, fa);
      float w = max(Rt * 0.95, uTowerR * 0.6) + max(along, 0.0) * 0.36;
      float vprof = smoothstep(aBot, aBot + 0.05, hn) * smoothstep(aTop + 0.02, aTop - 0.04, hn);
      float anv = smoothstep(w, w * 0.62, abs(side)) * smoothstep(-uTowerR * 1.0, -uTowerR * 0.3, along)
                * smoothstep(aL, aL * 0.55, along) * vprof * uAnvil;
      // Overshooting top
      float ot = smoothstep(uTowerR * 0.45, uTowerR * 0.1, du) * smoothstep(1.1, 0.98, hn) * step(0.9, hn) * uAnvil;
      cov = max(cov, max(anv, ot));
      // Mammatus sob a bigorna
      if (!cheap && hn > aBot - 0.06 && hn < aBot + 0.02 && anv > 0.0) {
        float m = texture(tNoise, vec3(p.x, 0.0, p.z) * (1.0 / 700.0)).b;
        float sag = (aBot - hn) * 18.0;
        cov = max(cov, smoothstep(0.55, 0.85, m - sag) * smoothstep(0.0, 0.3, anv));
      }
    }

    // Base larga e escura (região livre de chuva + área de precipitação)
    vec2 rs = p.xz - uStormPos;
    float ds = length(rs);
    float baseCov = smoothstep(uBaseR, uBaseR * 0.6, ds) * smoothstep(0.12, 0.45, uGrowth);
    float und = cheap ? 0.5 : texture(tNoise, vec3(p.x, 0.0, p.z) * (1.0 / 1500.0) + vec3(0.0, 0.3, uTime * 0.002)).g;
    float bottom = -0.012 + (und - 0.5) * 0.03;
    float baseV = smoothstep(bottom, bottom + 0.02, hn) * smoothstep(0.32, 0.08, hn);
    cov = max(cov, baseCov * baseV);
  }

  // --- Nuvem parede (abaixo da base, girando) ---
  float wallD = 0.0;
  if (uWall.w > 1.0) {
    vec2 rw = p.xz - uWall.xy;
    float dw = length(rw);
    float bottom = uCloudBase - uWall.w;
    if (p.y > bottom - 60.0 && p.y < uCloudBase + 40.0 && dw < uWall.z * 1.6) {
      vec2 qw = rot(uMesoAngle * 1.6) * rw;
      float nw = cheap ? 0.5 : texture(tNoise, vec3(qw.x, p.y * 1.6, qw.y) * (1.0 / 520.0)).r;
      // formato de "degrau" com bordas irregulares; afunila para baixo
      float lvl = sat((p.y - bottom) / max(uWall.w, 1.0));
      float rr = uWall.z * mix(0.55, 1.0, sqrt(lvl));
      float w = smoothstep(rr, rr * 0.55, dw + (nw - 0.5) * uWall.z * 0.55);
      w *= smoothstep(bottom - 40.0 + nw * 70.0, bottom + 30.0 + nw * 40.0, p.y);
      // Nuvem cauda em direção ao núcleo de chuva
      vec2 toRain = normalize(uRain.xy - uWall.xy + 1e-3);
      float ta = dot(rw, toRain);
      float ts = abs(dot(rw, vec2(-toRain.y, toRain.x)));
      float tail = smoothstep(uWall.z * 0.45, uWall.z * 0.15, ts + (nw - 0.5) * 140.0) * smoothstep(-50.0, uWall.z * 0.4, ta)
                 * smoothstep(uWall.z * 2.2, uWall.z * 0.9, ta) * smoothstep(bottom + uWall.w * 0.35, bottom + uWall.w * 0.7, p.y);
      wallD = max(w * 1.6, tail * 0.8);
    }
  }

  // Erosão por ruído (torre "couve-flor"), rotação do mesociclone na base
  if (cov > 0.0) {
    vec2 rr = rot(uMesoAngle * uMeso * (1.0 - sat(hn) * 0.7) + hn * 1.5 * uMeso) * (p.xz - uUpdraft);
    vec3 q = vec3(rr.x, p.y, rr.y) + vec3(uUpdraft.x, -uTime * 3.0 * uGrowth, uUpdraft.y);
    vec4 n = texture(tNoise, q * vec3(1.0 / 3400.0, 1.0 / 2200.0, 1.0 / 3400.0));
    float d = remap(n.r, 1.0 - cov, 1.0, 0.0, 1.0) * mix(1.0, 1.3, cov);
    // estrias horizontais na torre girando
    if (!cheap && d > 0.0) {
      vec4 dn = texture(tNoise, q * (1.0 / 640.0));
      float stria = texture(tNoise, vec3(atan(rr.y, rr.x) * 0.25, p.y / 500.0, 0.5)).a;
      float det = mix(dn.g * 0.6 + dn.b * 0.4, stria, 0.35 * uMeso * smoothstep(0.5, 0.0, hn));
      d = remap(d, det * 0.38, 1.0, 0.0, 1.0);
    }
    dens = max(dens, d);
  }
  dens = max(dens, wallD);

  // --- Chuva / granizo (núcleo da corrente descendente e gancho) ---
  if (uRain.w > 0.0 && p.y < uCloudBase + 100.0) {
    vec2 rp = p.xz - uRain.xy;
    float dr = length(rp);
    float nr = cheap ? 0.5 : texture(tNoise, vec3(p.x / 900.0, p.y / 2600.0 + uTime * 0.04, p.z / 900.0)).a;
    float shaft = smoothstep(uRain.z, uRain.z * 0.35, dr + (nr - 0.5) * uRain.z * 0.7);
    // Gancho envolvendo o mesociclone (precipitação em arco)
    vec2 rh = p.xz - uHook.xy;
    float dh = length(rh);
    float ang = atan(rh.y, rh.x);
    float arc = smoothstep(uHook.z * 0.45, 0.0, abs(dh - uHook.z)) * (0.5 + 0.5 * cos(ang - uHook.w)) * 0.75;
    float pr = max(shaft, arc) * uRain.w * smoothstep(uCloudBase + 100.0, uCloudBase - 100.0, p.y);
    precip = pr * (0.6 + 0.6 * nr);
  }
  return vec2(max(dens, 0.0), precip);
}

// Sombra analítica da tempestade para pontos sob a base
float stormShadow(vec3 p) {
  if (uStormAlpha <= 0.0 || p.y > uCloudBase + 300.0) return 1.0;
  float ly = max(uLightDir.y, 0.03);
  float yMid = uCloudBase + 1200.0;
  vec3 q = p + uLightDir * ((yMid - p.y) / ly);
  return 1.0 - stormCover(q.xz) * 0.96;
}

const float K_CLOUD = 0.032;
const float K_PRECIP = 0.0009;
const float K_COND = 0.13;
const float K_DEBRIS = 0.035;

float lightMarch(vec3 p, float s0) {
  float od = 0.0;
  float s = s0;
  vec3 q = p;
  float dd;
  for (int j = 0; j < 6; j++) {
    if (j >= uLightSteps) break;
    q += uLightDir * s;
    vec2 c = clouds(q, true);
    vec2 t = tornado(q, true, dd);
    od += (c.x * K_CLOUD + c.y * K_PRECIP + t.x * K_COND + t.y * K_DEBRIS) * s;
    s *= 2.2;
  }
  // amostra longa: sombra da nuvem parede / base sobre o funil
  if (s0 < 30.0) {
    vec2 c2 = clouds(p + uLightDir * 260.0, true);
    od += c2.x * K_CLOUD * 180.0;
  }
  return max(exp(-od), 0.55 * exp(-od * 0.25));
}

bool slab(vec3 ro, vec3 rd, float y0, float y1, out float t0, out float t1) {
  if (abs(rd.y) < 1e-5) {
    t0 = 0.0; t1 = 1e9;
    return ro.y >= y0 && ro.y <= y1;
  }
  float a = (y0 - ro.y) / rd.y;
  float b = (y1 - ro.y) / rd.y;
  t0 = max(min(a, b), 0.0);
  t1 = max(a, b);
  return t1 > t0;
}

bool box(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax, out float t0, out float t1) {
  vec3 inv = 1.0 / (rd + vec3(1e-7));
  vec3 a = (bmin - ro) * inv;
  vec3 b = (bmax - ro) * inv;
  vec3 mn = min(a, b), mx = max(a, b);
  t0 = max(max(mn.x, mn.y), max(mn.z, 0.0));
  t1 = min(min(mx.x, mx.y), mx.z);
  return t1 > t0;
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec4 vp = uInvProj * vec4(ndc, 1.0, 1.0);
  vec3 rdv = normalize(vp.xyz / vp.w);
  vec3 rd = normalize((uCamWorld * vec4(rdv, 0.0)).xyz);
  vec3 ro = uCamPos;

  float depth = texture(tDepth, vUv).x;
  float sceneDist = 60000.0;
  if (depth < 0.999999) {
    vec4 pv = uInvProj * vec4(ndc, depth * 2.0 - 1.0, 1.0);
    sceneDist = length(pv.xyz / pv.w);
  }

  // Intervalo de marcha: camada de nuvens ∪ caixa da tempestade
  float tA0 = 1e9, tA1 = -1.0;
  float s0, s1;
  if (slab(ro, rd, uCloudBase + 120.0, uCloudBase + 120.0 + uCloudThick, s0, s1)) { tA0 = min(tA0, s0); tA1 = max(tA1, s1); }
  if (uStormAlpha > 0.0) {
    float ext = uAnvilLen + uTowerR * 2.0;
    vec3 c = vec3(uStormPos.x, 0.0, uStormPos.y);
    if (box(ro, rd, vec3(c.x - ext, -20.0, c.z - ext), vec3(c.x + ext, uStormTop + 900.0, c.z + ext), s0, s1)) { tA0 = min(tA0, s0); tA1 = max(tA1, s1); }
  }
  if (uTorD.w > 0.5) {
    float ext = uTorR.y + uTorR.w + uTorD.x + 400.0;
    vec3 c = vec3(uTorBase.x, 0.0, uTorBase.z);
    if (box(ro, rd, vec3(c.x - ext, -20.0, c.z - ext), vec3(c.x + ext, uTorTop + 100.0, c.z + ext), s0, s1)) { tA0 = min(tA0, s0); tA1 = max(tA1, s1); }
  }
  float tEnd = min(min(tA1, sceneDist), 32000.0);
  float t = tA0;

  vec3 fogC = fogColorDir(rd);
  float cosT = dot(rd, uLightDir);
  float phase = mix(hg(cosT, 0.62), hg(cosT, -0.25), 0.3);
  float phaseP = mix(hg(cosT, 0.75), hg(cosT, -0.1), 0.2);

  vec3 col = vec3(0.0);
  float T = 1.0;
  float jit = ign(gl_FragCoord.xy + mod(uFrame, 16.0) * vec2(5.588, 3.123));
  float dbgSet = 0.0;
  vec3 dbgV = vec3(0.0);

  if (t < tEnd) {
    for (int i = 0; i < 220; i++) {
      if (i >= uSteps * 2 || t >= tEnd || T < 0.012) break;
      float remain = float(max(uSteps - i, 8));
      float dt = max(18.0 + t * 0.011, (tEnd - t) / remain);
      vec3 p0 = ro + rd * t;
      float dTor;
      vec2 tq = tornado(p0, true, dTor);
      if (dTor < dt) dt = clamp(dTor * 0.7, max(uTorR.x * 0.35, 1.5), dt);
      dt = min(dt, tEnd - t + 0.01);
      vec3 p = ro + rd * (t + dt * jit);

      vec2 cd = clouds(p, false);
      float dT;
      vec2 td = tornado(p, false, dT);
      float sC = cd.x * K_CLOUD;
      float sP = cd.y * K_PRECIP;
      float sT = td.x * K_COND;
      float sD = td.y * K_DEBRIS;
      float sigma = sC + sP + sT + sD;
      if (sigma > 1e-6) {
        float ls = (sT + sD) > sC ? max(uTorR.x * 0.6, 6.0) : 40.0;
        float lm = lightMarch(p, ls);
        float ssh = stormShadow(p);
        float lt = lm * ssh;
        if (uDebug > 0.5 && dbgSet < 0.5) { dbgSet = 1.0; dbgV = uDebug < 1.5 ? vec3(lm) : uDebug < 2.5 ? vec3(ssh) : vec3(sT > 1e-6 ? 1.0 : 0.0, sC > 1e-6 ? 1.0 : 0.0, sP > 1e-6 ? 1.0 : 0.0); }
        float hgt = sat((p.y - uCloudBase) / 2500.0);
        float under = 1.0 - stormCover(p.xz) * 0.9 * (1.0 - hgt);
        vec3 amb = mix(uAmbBot, uAmbTop * under, 0.45 + 0.55 * hgt);
        float hT = p.y - uTorBase.y;
        vec3 condAlb = mix(uDebrisCol * 1.6, vec3(0.9), smoothstep(uTorD.y * 0.5, uTorD.y * 4.0, hT) * 0.6 + 0.4 * (1.0 - min(uTorP.w, 1.0)));
        vec3 alb = (sC * vec3(1.0) + sP * vec3(0.62, 0.65, 0.7) + sT * condAlb + sD * uDebrisCol) / sigma;
        float ph = (sP > sC + sT) ? phaseP : phase;
        float powder = 1.0 - exp(-sigma * 60.0);
        vec3 Ls = uLightColor * lt * ph * mix(1.0, powder * 1.8, 0.5);
        vec3 fl = vec3(0.75, 0.8, 1.0) * uFlash.w * 30.0 / (1.0 + pow(length(p - uFlash.xyz) / 900.0, 2.0));
        vec3 S = (Ls + amb + fl) * alb * sigma;
        float Ts = exp(-sigma * dt);
        vec3 Sint = (S - S * Ts) / sigma;
        float ft = fogTrans(ro, rd, t + dt * jit);
        col += T * (Sint * ft + fogC * (1.0 - ft) * (1.0 - Ts));
        T *= Ts;
      }
      t += dt;
    }
  }
  if (T < 0.015) T = 0.0;
  if (uDebug > 0.5) { gl_FragColor = vec4(dbgV * 5.0, 0.0); return; }
  gl_FragColor = vec4(col, T);
}
`;

const resolveFrag = /* glsl */ `
precision highp float;
uniform sampler2D tCur;
uniform sampler2D tHist;
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform mat4 uPrevProj;
uniform mat4 uPrevViewInv;
uniform vec2 uTexel;
uniform float uBlend;
uniform float uReproj;
varying vec2 vUv;
void main() {
  vec4 cur = texture(tCur, vUv);
  vec4 n1 = texture(tCur, vUv + vec2(uTexel.x, 0.0));
  vec4 n2 = texture(tCur, vUv - vec2(uTexel.x, 0.0));
  vec4 n3 = texture(tCur, vUv + vec2(0.0, uTexel.y));
  vec4 n4 = texture(tCur, vUv - vec2(0.0, uTexel.y));
  // média espacial que não atravessa bordas (pesos pela semelhança da transmitância)
  float w1 = 1.0 / (1.0 + 40.0 * abs(n1.a - cur.a));
  float w2 = 1.0 / (1.0 + 40.0 * abs(n2.a - cur.a));
  float w3 = 1.0 / (1.0 + 40.0 * abs(n3.a - cur.a));
  float w4 = 1.0 / (1.0 + 40.0 * abs(n4.a - cur.a));
  vec4 avg = (cur * 2.0 + n1 * w1 + n2 * w2 + n3 * w3 + n4 * w4) / (2.0 + w1 + w2 + w3 + w4);
  // limites apenas dos vizinhos semelhantes (evita vazamento através das bordas)
  vec4 mn = cur, mx = cur;
  if (w1 > 0.3) { mn = min(mn, n1); mx = max(mx, n1); }
  if (w2 > 0.3) { mn = min(mn, n2); mx = max(mx, n2); }
  if (w3 > 0.3) { mn = min(mn, n3); mx = max(mx, n3); }
  if (w4 > 0.3) { mn = min(mn, n4); mx = max(mx, n4); }
  // direção do raio deste pixel (mundo)
  vec4 vp = uInvProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 rd = normalize((uCamWorld * vec4(normalize(vp.xyz / vp.w), 0.0)).xyz);
  // reprojeção apenas pela rotação (nuvens distantes)
  vec3 pv = (uPrevViewInv * vec4(rd, 0.0)).xyz;
  vec4 pc = uPrevProj * vec4(pv, 1.0);
  vec2 puv = pc.xy / pc.w * 0.5 + 0.5;
  // câmera parada: usa exatamente o mesmo texel (sem borrar)
  if (all(lessThan(abs(puv - vUv), uTexel * 0.3))) puv = vUv;
  float valid = (pv.z < 0.0 && puv.x > 0.0 && puv.x < 1.0 && puv.y > 0.0 && puv.y < 1.0) ? 1.0 : 0.0;
  vec4 hist = texture(tHist, puv);
  vec4 ext = (mx - mn) * 0.1 + vec4(0.004);
  hist = clamp(hist, mn - ext, mx + ext);
  // quadro sem ray marching: só reprojeta o histórico (nuvens a meia taxa)
  if (uReproj > 0.5) {
    gl_FragColor = valid > 0.5 ? texture(tHist, puv) : cur;
    return;
  }
  float b = uBlend * valid;
  gl_FragColor = mix(avg, hist, b);
}
`;

export class Volumetrics {
  constructor(renderer, noiseTex, quality) {
    this.quality = quality;
    this.scale = quality.volScale;
    this.rt = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    const axis = [];
    for (let i = 0; i < 6; i++) axis.push(new THREE.Vector2());
    this.uniforms = {
      tDepth: { value: null },
      tNoise: { value: noiseTex },
      uInvProj: { value: new THREE.Matrix4() },
      uCamWorld: { value: new THREE.Matrix4() },
      uCamPos: { value: new THREE.Vector3() },
      uTime: { value: 0 },
      uFrame: { value: 0 },
      uSteps: { value: quality.volSteps },
      uLightSteps: { value: quality.lightSteps },
      uLightDir: { value: new THREE.Vector3(0, 1, 0) },
      uLightColor: { value: new THREE.Color(1, 1, 1) },
      uAmbTop: { value: new THREE.Color(0.3, 0.35, 0.45) },
      uAmbBot: { value: new THREE.Color(0.1, 0.1, 0.1) },
      uFlash: { value: new THREE.Vector4(0, 0, 0, 0) },
      uFogColor: { value: new THREE.Color() },
      uFogSunColor: { value: new THREE.Color() },
      uFogSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uFog: { value: new THREE.Vector2(0.00012, 0.0011) },
      uCloudBase: { value: 650 },
      uCloudThick: { value: 900 },
      uCoverage: { value: 0.3 },
      uWindOff: { value: new THREE.Vector2() },
      uStormAlpha: { value: 0 },
      uStormPos: { value: new THREE.Vector2() },
      uUpdraft: { value: new THREE.Vector2() },
      uStormDir: { value: new THREE.Vector2(1, 0) },
      uGrowth: { value: 0 },
      uStormTop: { value: 8000 },
      uTowerR: { value: 2200 },
      uBaseR: { value: 4200 },
      uAnvil: { value: 0 },
      uAnvilLen: { value: 14000 },
      uMesoAngle: { value: 0 },
      uMeso: { value: 0 },
      uWall: { value: new THREE.Vector4() },
      uRain: { value: new THREE.Vector4() },
      uHook: { value: new THREE.Vector4() },
      uTorBase: { value: new THREE.Vector3() },
      uTorAxis: { value: axis },
      uTorTop: { value: 400 },
      uTorR: { value: new THREE.Vector4(20, 60, 1, 0) },
      uTorP: { value: new THREE.Vector4() },
      uTorM: { value: new THREE.Vector4() },
      uTorD: { value: new THREE.Vector4() },
      uTorX: { value: new THREE.Vector4(1, 0, 0, 0) },
      uDebrisCol: { value: new THREE.Color(0.36, 0.27, 0.19) },
      uDebug: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
    });
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
    this.frame = 0;

    // Acumulação temporal (reduz o ruído da amostragem)
    const mkRT = () =>
      new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.hist = [mkRT(), mkRT()];
    this.histIdx = 0;
    this.resolveU = {
      tCur: { value: this.rt.texture },
      tHist: { value: null },
      uInvProj: { value: new THREE.Matrix4() },
      uCamWorld: { value: new THREE.Matrix4() },
      uPrevProj: { value: new THREE.Matrix4() },
      uPrevViewInv: { value: new THREE.Matrix4() },
      uTexel: { value: new THREE.Vector2() },
      uBlend: { value: 0 },
      uReproj: { value: 0 },
    };
    this.resolveMat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: resolveFrag, uniforms: this.resolveU, depthTest: false, depthWrite: false });
    this.resolveScene = new THREE.Scene();
    const q2 = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.resolveMat);
    q2.frustumCulled = false;
    this.resolveScene.add(q2);
    this.prevProj = new THREE.Matrix4();
    this.prevViewInv = new THREE.Matrix4();
    this.prevPos = new THREE.Vector3();
    this.hasHistory = false;
    this.output = this.hist[0].texture;
  }

  setScale(s) {
    if (Math.abs(s - this.scale) < 0.005) return;
    this.scale = s;
    if (this.lastW) this.setSize(this.lastW, this.lastH);
  }

  setSize(w, h) {
    this.lastW = w;
    this.lastH = h;
    const W = Math.max(2, Math.floor(w * this.scale));
    const H = Math.max(2, Math.floor(h * this.scale));
    this.rt.setSize(W, H);
    this.hist[0].setSize(W, H);
    this.hist[1].setSize(W, H);
    this.resolveU.uTexel.value.set(1 / W, 1 / H);
    this.hasHistory = false;
  }

  render(renderer, camera, depthTexture, time, full = true) {
    if (!full && this.hasHistory) {
      // reprojeção barata do resultado anterior
      const r = this.resolveU;
      const src = this.hist[this.histIdx];
      const dst = this.hist[1 - this.histIdx];
      r.tHist.value = src.texture;
      r.uInvProj.value.copy(camera.projectionMatrixInverse);
      r.uCamWorld.value.copy(camera.matrixWorld);
      r.uPrevProj.value.copy(this.prevProj);
      r.uPrevViewInv.value.copy(this.prevViewInv);
      r.uReproj.value = 1;
      renderer.setRenderTarget(dst);
      renderer.render(this.resolveScene, this.camera);
      r.uReproj.value = 0;
      this.histIdx = 1 - this.histIdx;
      this.output = dst.texture;
      this.prevProj.copy(camera.projectionMatrix);
      this.prevViewInv.copy(camera.matrixWorldInverse);
      return;
    }
    const u = this.uniforms;
    u.tDepth.value = depthTexture;
    u.uInvProj.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
    u.uCamPos.value.copy(camera.position);
    u.uTime.value = time;
    u.uFrame.value = this.frame++;
    renderer.setRenderTarget(this.rt);
    renderer.render(this.scene, this.camera);

    // Resolve temporal
    const r = this.resolveU;
    const src = this.hist[this.histIdx];
    const dst = this.hist[1 - this.histIdx];
    r.tHist.value = src.texture;
    r.uInvProj.value.copy(camera.projectionMatrixInverse);
    r.uCamWorld.value.copy(camera.matrixWorld);
    r.uPrevProj.value.copy(this.prevProj);
    r.uPrevViewInv.value.copy(this.prevViewInv);
    const moved = camera.position.distanceTo(this.prevPos);
    r.uBlend.value = this.hasHistory && moved < 25 ? (moved > 2 ? 0.6 : 0.82) : 0;
    renderer.setRenderTarget(dst);
    renderer.render(this.resolveScene, this.camera);
    this.histIdx = 1 - this.histIdx;
    this.output = dst.texture;
    this.prevProj.copy(camera.projectionMatrix);
    this.prevViewInv.copy(camera.matrixWorldInverse);
    this.prevPos.copy(camera.position);
    this.hasHistory = true;
  }
}
