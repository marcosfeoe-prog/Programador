// Renderização volumétrica por ray marching.
//
// Passo "nuvens" (baixa resolução): céu acima da base — cúmulos, torre da supercélula,
// topo penetrante, bigorna, linha de flanco e o "teto" escuro da tempestade.
// Passo "volume" (resolução média): tudo abaixo da base — tornado (funil de condensação,
// nuvem de detritos, subvórtices), nuvem parede, nuvem cauda, fractos (scud) e as
// cortinas de chuva e granizo (incluindo a chuva do gancho que esconde tornados HP).
// Passo "sombra": mapa 2D da sombra das tempestades sobre o chão.

import * as THREE from 'three';

export const MAX_STORMS = 4;
export const MAX_TOR = 2;

const COMMON = /* glsl */ `
precision highp float;
precision highp sampler3D;
uniform sampler2D tDepth;
uniform sampler3D tNoise;
uniform vec2 uRes;
uniform mat4 uProjInv;
uniform mat4 uCamMat;
uniform vec3 uCam;
uniform float uNear;
uniform float uFar;
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uAmbSky;
uniform vec3 uAmbGnd;
uniform vec3 uHaze;
uniform float uVis;
uniform float uGround;
uniform float uBase;
uniform float uCover;
uniform vec2 uWindOff;
uniform vec4 uFlash;
uniform int uNS;
uniform vec4 uS0[${MAX_STORMS}];
uniform vec4 uS1[${MAX_STORMS}];
uniform vec4 uS2[${MAX_STORMS}];
uniform vec4 uS3[${MAX_STORMS}];
varying vec2 vUv;

#define PI 3.14159265
float sat(float x) { return clamp(x, 0.0, 1.0); }
// smoothstep seguro também com bordas invertidas (a > b).
float ss(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / (12.566 * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5)); }
vec4 nz(vec3 p) { return texture(tNoise, p); }

vec3 rayDir(vec2 uv) {
  vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  v /= v.w;
  return normalize((uCamMat * vec4(v.xyz, 0.0)).xyz);
}
float depthToDist(float d, vec3 rd) {
  if (d >= 0.99999) return 1e9;
  float z = (uNear * uFar) / ((uFar - uNear) * d - uFar);
  vec3 fwd = -normalize(uCamMat[2].xyz);
  return -z / max(dot(rd, fwd), 1e-4);
}
// Coordenadas da tempestade: x = à frente (movimento), y = lateral espelhada pelo hemisfério
// (o núcleo de precipitação fica sempre em y < 0).
vec2 stormLocal(int i, vec2 xz) {
  vec2 rel = xz - uS0[i].xy;
  vec2 F = uS1[i].xy;
  vec2 R = vec2(-F.y, F.x);
  return vec2(dot(rel, F), dot(rel, R) * uS0[i].w);
}
// Cobertura 2D das partes da tempestade (para sombras e escurecimento do céu).
// x = teto baixo (base), y = torre/updraft, z = bigorna.
vec3 stormParts(vec2 xz) {
  vec3 c = vec3(0.0);
  for (int i = 0; i < ${MAX_STORMS}; i++) {
    if (i >= uNS) break;
    vec2 L = stormLocal(i, xz);
    float k = uS3[i].x;
    float m = uS0[i].z;
    float dB = length(L / (vec2(7200.0, 6500.0) * k));
    float dF = length((L - vec2(5500.0, -3500.0) * k) / (vec2(9500.0, 6800.0) * k));
    float deck = ss(1.0, 0.6, min(dB, dF)) * ss(0.1, 0.45, m);
    // Fenda de céu limpo do RFD atrás da nuvem parede.
    float slot = ss(2600.0 * k, 900.0 * k, length(L - vec2(-2600.0, 1400.0) * k)) * uS3[i].w;
    deck *= 1.0 - slot * 0.85;
    float tw = ss(1.0, 0.55, length((L - vec2(1200.0, -700.0) * k) / (vec2(5200.0, 5200.0) * k))) * ss(0.15, 0.5, m);
    float aR = uS3[i].z;
    float dA = length((L - vec2(aR * 0.55, -1500.0 * k)) / vec2(aR, aR * 0.62));
    float anv = ss(1.0, 0.35, dA) * ss(0.25, 0.7, m);
    c = max(c, vec3(deck, tw, anv));
  }
  return c;
}
float stormCover2D(vec2 xz) {
  vec3 c = stormParts(xz);
  return max(c.x, c.z * 0.75);
}
vec3 hazeAt(vec3 p) {
  return uHaze * mix(1.0, 0.32, stormCover2D(p.xz));
}
float sunVis(vec3 p) {
  // Cada camada faz sombra a partir da sua altitude: com o sol baixo, a sombra da
  // torre e da bigorna se estende por dezenas de quilômetros.
  vec2 dir = uSunDir.xz / max(uSunDir.y, 0.06);
  float a = stormParts(p.xz + dir * max(uBase + 900.0 - p.y, 0.0)).x;
  float b = stormParts(p.xz + dir * max(uBase + 5000.0 - p.y, 0.0)).y;
  float c = stormParts(p.xz + dir * max(uBase + 9500.0 - p.y, 0.0)).z;
  return (1.0 - 0.94 * a) * (1.0 - 0.92 * b) * (1.0 - 0.85 * c);
}
`;

// ------------------------------------------------------------------ passo das nuvens
const CLOUD_FRAG = /* glsl */ `
${COMMON}
uniform float uSteps;
uniform float uLightSteps;

float cumulus(vec3 p) {
  float h = p.y - uBase;
  if (h < 0.0 || h > 2600.0) return 0.0;
  vec2 q = p.xz / 9000.0 + uWindOff;
  float cov = nz(vec3(q.x, 0.37, q.y)).r;
  cov = sat((cov - (1.0 - uCover)) / max(uCover, 0.08));
  if (cov <= 0.001) return 0.0;
  float top = 500.0 + 2000.0 * cov;
  float hn = h / top;
  if (hn >= 1.0) return 0.0;
  float prof = sat(hn * 8.0) * sat((1.0 - hn) * 2.2);
  vec4 n = nz(vec3(p.x / 2400.0 + uWindOff.x * 3.0, h / 2400.0, p.z / 2400.0 + uWindOff.y * 3.0));
  float d = cov * prof - (1.0 - n.r) * 0.6 - (1.0 - n.g) * 0.2 * hn;
  return sat(d * 1.6) * 0.011;
}

float storm(int i, vec3 p) {
  vec2 L = stormLocal(i, p.xz);
  float k = uS3[i].x;
  float m = uS0[i].z;
  float top = uS3[i].y;
  float h = p.y - uBase;
  if (h < -120.0 || p.y > top + 2500.0) return 0.0;
  float towerH = max(top - uBase, 1.0);
  float hn = h / towerH;
  vec2 tc = L - vec2(1200.0, -700.0) * k;
  float R0 = mix(1600.0, 4800.0, m) * k;
  vec4 n1 = nz(vec3(p.x, p.y * 0.8, p.z) / 5200.0 + vec3(0.0, -uTime * 0.003, 0.0));
  float bump = (n1.r - 0.5) * 2000.0 * k + (n1.g - 0.5) * 800.0;
  float Rt = R0 * (0.8 + 0.3 * sat(hn)) * (1.0 - 0.5 * ss(0.8, 1.06, hn));
  float dT = length(tc) - Rt - bump;
  float tower = ss(450.0, -250.0, dT) * ss(1.07, 0.97, hn) * step(0.0, h);
  // Topo penetrante (domo acima da bigorna).
  vec3 ot = vec3(tc.x + 500.0 * k, h - towerH, tc.y);
  float dO = length(ot / vec3(R0 * 0.6, R0 * 0.32, R0 * 0.6)) - 1.0;
  tower = max(tower, ss(0.15, -0.25, dO + (n1.b - 0.5) * 0.5) * ss(0.5, 0.9, m));
  // Bigorna.
  float aR = uS3[i].z;
  float aTop = top - 150.0;
  float aBot = top - mix(1300.0, 3200.0, m);
  vec2 ac = L - vec2(aR * 0.55, -1500.0 * k);
  float ea = length(ac / vec2(aR, aR * 0.62));
  vec4 n2 = nz(vec3(p.x / 9000.0 + uTime * 0.0015, p.y / 2600.0, p.z / 9000.0));
  float edge = sat(1.0 - ea + (n2.r - 0.5) * 0.35);
  float th = mix(0.3, 1.0, ss(0.0, 0.45, edge));
  float aMid = mix(aBot, aTop, 0.6);
  float aHalf = (aTop - aBot) * 0.5 * th;
  float band = ss(aHalf + 250.0, aHalf - 250.0, abs(p.y - aMid - (1.0 - th) * 450.0));
  float anvil = band * ss(0.0, 0.18, edge) * ss(0.2, 0.65, m);
  // Mamatos sob a bigorna, perto da torre.
  float mam = 0.0;
  if (abs(p.y - aBot) < 700.0) {
    vec4 nm = nz(vec3(p.x / 1400.0, 0.5, p.z / 1400.0));
    float lump = (nm.g - 0.45) * 900.0;
    mam = ss(0.0, 180.0, p.y - (aBot - lump)) * ss(aBot + 100.0, aBot - 50.0, p.y) * ss(0.55, 0.85, edge) * ss(0.5, 0.9, m);
  }
  // "Teto" baixo e escuro (base livre de chuva + região de precipitação).
  float dB = length(L / (vec2(6500.0, 5500.0) * k));
  float dF = length((L - vec2(5000.0, -3000.0) * k) / (vec2(7500.0, 4500.0) * k));
  // Base irregular: ondulações e "bolsões" pendurados sob o teto.
  vec4 nb = nz(vec3(p.x / 1700.0, 0.21, p.z / 1700.0) + vec3(uTime * 0.002, 0.0, 0.0));
  float under = (nb.r - 0.5) * 160.0 + (nb.g - 0.5) * 70.0;
  float deck = ss(1.0, 0.72, min(dB, dF) + (n1.r - 0.5) * 0.35) * ss(2800.0, 1000.0, h) * ss(under - 30.0, under + 140.0, h) * ss(0.1, 0.4, m);
  // Fenda do RFD.
  float slot = ss(2600.0 * k, 900.0 * k, length(L - vec2(-2600.0, 1400.0) * k)) * uS3[i].w;
  deck *= 1.0 - slot;
  // Linha de flanco (torres que descem em degraus para trás/direita).
  float flank = 0.0;
  for (int f = 1; f <= 3; f++) {
    float ff = float(f);
    vec2 fc = L - vec2(-2700.0 * ff, 2300.0 * ff) * k;
    float fh = towerH * (0.6 - 0.13 * ff) * m;
    float fr = (1700.0 - 250.0 * ff) * k;
    float df = length(vec3(fc.x, (h - fh * 0.5) * fr / max(fh * 0.5, 1.0), fc.y)) - fr - bump * 0.35;
    flank = max(flank, ss(250.0, -200.0, df) * step(0.0, h));
  }
  float total = max(max(tower, flank), max(max(anvil, mam) * 0.55, deck));
  if (total < 0.003) return 0.0;
  vec4 n3 = nz(p / 1100.0 + vec3(0.0, -uTime * 0.008, 0.0));
  total = sat(total - (1.0 - n3.g) * 0.38 * (1.0 - total * 0.6));
  return total * 0.018;
}

float density(vec3 p) {
  float d = cumulus(p);
  for (int i = 0; i < ${MAX_STORMS}; i++) {
    if (i >= uNS) break;
    d = max(d, storm(i, p));
  }
  return d;
}

bool cyl(vec3 ro, vec3 rd, vec2 c, float r, float y0, float y1, out float ta, out float tb) {
  vec2 o = ro.xz - c;
  vec2 d = rd.xz;
  float A = dot(d, d);
  float B = dot(o, d);
  float C = dot(o, o) - r * r;
  float a0 = -1e9;
  float a1 = 1e9;
  if (A > 1e-9) {
    float disc = B * B - A * C;
    if (disc < 0.0) return false;
    float s = sqrt(disc);
    a0 = (-B - s) / A;
    a1 = (-B + s) / A;
  } else if (C > 0.0) return false;
  float b0 = -1e9;
  float b1 = 1e9;
  if (abs(rd.y) > 1e-6) {
    float t0 = (y0 - ro.y) / rd.y;
    float t1 = (y1 - ro.y) / rd.y;
    b0 = min(t0, t1);
    b1 = max(t0, t1);
  } else if (ro.y < y0 || ro.y > y1) return false;
  ta = max(max(a0, b0), 0.0);
  tb = min(a1, b1);
  return tb > ta;
}

void main() {
  vec3 rd = rayDir(vUv);
  vec3 ro = uCam;
  float depth = texture2D(tDepth, vUv).x;
  float tScene = depthToDist(depth, rd);
  if (rd.y < 0.0 && depth < 0.99999) { gl_FragColor = vec4(0.0); return; }
  float maxD = 75000.0;
  float tEnd = min(tScene, maxD);
  // Intervalos: camada de cúmulos e cilindros das tempestades.
  float ta[5];
  float tb[5];
  int n = 0;
  if (rd.y > 0.0) {
    float a = max((uBase - 130.0 - ro.y) / rd.y, 0.0);
    float b = min((uBase + 2600.0 - ro.y) / rd.y, min(tEnd, 32000.0));
    if (b > a) { ta[n] = a; tb[n] = b; n++; }
  }
  for (int i = 0; i < ${MAX_STORMS}; i++) {
    if (i >= uNS) break;
    float k = uS3[i].x;
    vec2 F = uS1[i].xy;
    vec2 R = vec2(-F.y, F.x) * uS0[i].w;
    float aR = uS3[i].z;
    vec2 c = uS0[i].xy + F * aR * 0.35 - R * 1500.0 * k;
    float rad = max(aR * 1.05, 9000.0 * k) + 2500.0;
    float a;
    float b;
    if (cyl(ro, rd, c, rad, uBase - 130.0, uS3[i].y + 2600.0, a, b)) {
      b = min(b, tEnd);
      if (b > a) { ta[n] = a; tb[n] = b; n++; }
    }
  }
  if (n == 0) { gl_FragColor = vec4(0.0); return; }
  // Ordena e une os intervalos.
  for (int i = 0; i < 5; i++) for (int j = 0; j < 4; j++) {
    if (j + 1 >= n) break;
    if (ta[j] > ta[j + 1]) { float x = ta[j]; ta[j] = ta[j + 1]; ta[j + 1] = x; x = tb[j]; tb[j] = tb[j + 1]; tb[j + 1] = x; }
  }
  float total = 0.0;
  for (int j = 0; j < 5; j++) { if (j >= n) break; total += tb[j] - ta[j]; }
  float jit = ign(gl_FragCoord.xy);
  vec3 col = vec3(0.0);
  float T = 1.0;
  float mu = dot(rd, uSunDir);
  float phase = mix(hg(mu, 0.62), hg(mu, -0.15), 0.35) * 4.0 + 0.25;
  int steps = int(uSteps);
  float covered = 0.0;
  for (int j = 0; j < 5; j++) {
    if (j >= n || T < 0.02) break;
    float a = max(ta[j], covered);
    float b = tb[j];
    if (b <= a) continue;
    covered = b;
    int ns = int(max(8.0, float(steps) * (b - a) / max(total, 1.0)));
    for (int s = 0; s < 96; s++) {
      if (s >= ns || T < 0.02) break;
      float u0 = (float(s) + jit) / float(ns);
      float u1 = (float(s) + 1.0 + jit) / float(ns);
      float t = a + (b - a) * u0 * u0;
      float dt = (b - a) * (u1 * u1 - u0 * u0);
      vec3 p = ro + rd * t;
      float d = density(p);
      if (d <= 1e-6) continue;
      // Luz do sol atravessando a nuvem.
      float od = density(p + uSunDir * 220.0) * 220.0;
      if (uLightSteps > 1.5) od += density(p + uSunDir * 900.0) * 680.0;
      if (uLightSteps > 2.5) od += density(p + uSunDir * 2600.0) * 1700.0;
      float Tl = exp(-od * 1.15);
      float powder = 1.0 - exp(-d * 260.0);
      float hgt = sat((p.y - uBase) / 9000.0);
      // Embaixo a nuvem só recebe a luz refletida pelo chão e a do horizonte.
      float cov = stormCover2D(p.xz);
      vec3 ambLow = uAmbGnd * 1.1 + uHaze * mix(0.22, 0.06, cov);
      vec3 amb = mix(ambLow, uAmbSky * 1.1, sat(pow(hgt * 1.4, 0.6)));
      vec3 S = uSunCol * (Tl * phase + 0.35 * pow(max(Tl, 1e-6), 0.25) * 0.25) * mix(0.6, 1.0, powder) + amb;
      // Relâmpago dentro da nuvem.
      if (uFlash.w > 0.0) S += vec3(0.75, 0.8, 1.0) * uFlash.w * 3.0 * exp(-length(p - uFlash.xyz) / 5000.0);
      S *= 0.9;
      float fogT = exp(-t / (uVis * 1.4));
      S = mix(hazeAt(p), S, fogT);
      float ex = exp(-d * dt);
      col += T * S * (1.0 - ex);
      T *= ex;
    }
  }
  // Horizonte: além das nuvens, a névoa distante (escura sob as tempestades).
  if (T > 0.01 && rd.y < 0.3 && depth >= 0.99999) {
    vec3 hz = vec3(0.0);
    float wsum = 0.0;
    for (int k = 0; k < 5; k++) {
      float d = 4000.0 * pow(2.0, float(k));
      vec3 p = ro + rd * d;
      float w = exp(-max(p.y - uGround, 0.0) / 2500.0);
      hz += hazeAt(p) * w;
      wsum += w;
    }
    hz /= max(wsum, 1e-3);
    float amt = (1.0 - ss(0.0, 0.3, rd.y)) * 0.92;
    // A névoa sob o temporal escurece o "céu" atrás da chuva.
    float dark = 1.0 - dot(hz, vec3(0.333)) / max(dot(uHaze, vec3(0.333)), 1e-3);
    col += T * hz * amt * dark;
    T *= 1.0 - amt * dark;
  }
  gl_FragColor = vec4(col, 1.0 - T);
}
`;

// ------------------------------------------------------------------ passo do volume (abaixo da base)
const VOL_FRAG = /* glsl */ `
${COMMON}
uniform float uSteps;
uniform int uNT;
uniform vec4 uT0[${MAX_TOR}]; // xyz chão do tornado, w altura do funil (H)
uniform vec4 uT1[${MAX_TOR}]; // x raio no chão, y raio no topo, z expoente do perfil, w nível da condensação
uniform vec4 uT2[${MAX_TOR}]; // xy deslocamento do topo, z amplitude da contorção, w fase
uniform vec4 uT3[${MAX_TOR}]; // x multivórtice, y nº de subvórtices, z detritos, w raio dos detritos
uniform vec4 uT4[${MAX_TOR}]; // x ângulo de giro, y densidade, z chuva envolvente, w redemoinho de poeira
uniform vec4 uT5[${MAX_TOR}]; // rgb cor dos detritos, w raio do núcleo
uniform vec4 uT6[${MAX_TOR}]; // x turbulência, y subida, z torção, w giro dos detritos (rad/s)

// Luz difusa abaixo da base: pouca vinda de cima (teto escuro), mais vinda do horizonte.
vec3 ambBelow(float cov) {
  return uAmbSky * mix(0.55, 0.07, cov) + uHaze * mix(0.35, 0.2, cov) + uAmbGnd * 0.45;
}

// Comprimento que o raio de sol percorre dentro de um cilindro vertical de raio R,
// saindo do ponto à distância radial r (direção radial rad) — sombra própria do funil.
float chordSun(vec2 rad, float r, float R, vec2 sh) {
  float b = r * dot(rad, sh);
  float disc = b * b - r * r + R * R;
  if (disc <= 0.0) return 0.0;
  float q = sqrt(disc);
  float t1 = -b - q;
  float t2 = -b + q;
  if (t2 <= 0.0) return 0.0;
  return t2 - max(t1, 0.0);
}

vec2 torAxis(int i, float hn) {
  vec2 c = uT2[i].xy * pow(hn, 1.25);
  float amp = uT2[i].z;
  float ph = uT2[i].w;
  c += sin(PI * hn) * amp * vec2(sin(hn * 6.5 + ph), cos(hn * 4.9 + ph * 1.37));
  c += sin(PI * hn) * amp * 0.35 * vec2(sin(hn * 17.0 + ph * 2.1 + uTime * 0.6), cos(hn * 13.0 + ph * 1.7 + uTime * 0.5));
  return c;
}

// x = condensação, y = detritos, zw = direção radial (para a luz).
// shade: oclusão das reentrâncias do funil; hn: altura normalizada.
vec4 tornado(int i, vec3 p, out float shade, out float hnOut, out vec3 geo) {
  shade = 1.0;
  hnOut = 0.0;
  geo = vec3(0.0, 1.0, 1.0);
  vec3 q = p - uT0[i].xyz;
  float H = uT0[i].w;
  if (q.y < -3.0 || q.y > H + 120.0) return vec4(0.0);
  float hn = clamp(q.y / H, 0.0, 1.0);
  hnOut = hn;
  vec2 ax = torAxis(i, hn);
  vec2 d = q.xz - ax;
  float r = length(d);
  float Rg = uT1[i].x;
  float Rt = uT1[i].y;
  float R = mix(Rg, Rt, pow(hn, uT1[i].z));
  float fl = ss(0.74, 1.0, hn);
  R += fl * fl * (60.0 + Rt * 0.7 * (1.0 - ss(150.0, 700.0, Rt)));
  float cond = uT1[i].w;
  // Ponta afinada só quando o funil ainda não chegou ao chão.
  float span = (0.14 * (1.0 - cond) + 0.03) * ss(0.0, 0.06, cond) + 1e-3;
  float tipK = ss(cond - 0.01, cond + span, hn);
  float Rc = R * mix(0.05, 1.0, tipK);
  float Rd = uT3[i].w;
  if (r > max(Rc * 1.8 + 30.0, Rd * 1.6 + 30.0)) return vec4(0.0);
  vec2 radial = d / max(r, 1e-3);
  geo = vec3(r, Rc, Rd);
  float spin = uT4[i].x;
  float ang = atan(d.y, d.x);
  float Rref = 0.5 * (Rg + Rt) + 12.0;
  float turb = uT6[i].x;
  // Textura do funil gira com o vento e sobe em espiral.
  float a1 = ang - spin;
  vec2 cs = vec2(cos(a1), sin(a1));
  float hc = q.y / (Rref * 2.8) - uTime * uT6[i].y;
  vec4 n1 = nz(vec3(cs * 0.45, hc * 0.45));
  vec4 n2 = nz(vec3(cs * 1.4, hc * 1.1 + a1 * 0.05) + vec3(0.37, 0.11, 0.53));
  // Estrias: faixas finas esticadas ao longo da espiral (o ar sobe girando).
  vec4 n3 = nz(vec3(cs * 2.6, hc * 0.25 - a1 * 0.08) + vec3(0.71, 0.29, 0.13));
  float hel = sin(a1 * 3.0 + q.y / (Rref * 0.55) * uT6[i].z * 2.0 + n1.b * 3.0);
  float disp = ((n1.b - 0.5) * 1.0 + (n2.a - 0.5) * 0.6 + (n3.b - 0.5) * 0.4 + hel * 0.08) * Rc * (0.1 + 0.45 * turb);
  float ew = Rc * (0.035 + 0.11 * turb) + 0.6;
  float funnel = ss(Rc + ew, Rc - ew * 0.6, r + disp) * tipK;
  // Reentrâncias mais escuras, saliências mais claras.
  shade = mix(0.42, 1.18, sat(n1.b * 0.7 + n2.a * 0.35 + (n3.b - 0.5) * 0.6 - 0.05));
  // Partes "rasgadas" do funil (corda se desfazendo).
  funnel *= mix(1.0, ss(0.25, 0.55, n2.r + 0.15), uT4[i].w * 0.0 + turb * 0.15);
  float mv = uT3[i].x;
  funnel *= mix(1.0, mix(0.18, 1.0, ss(0.3, 0.85, hn)), mv);
  float dens = funnel * uT4[i].y;
  // Subvórtices de sucção (multivórtice).
  if (mv > 0.02) {
    int ns = int(uT3[i].y);
    float orbit = max(Rg, 8.0) * 0.68;
    float rs = max(Rg * 0.15, 3.0) * (1.0 + 0.9 * hn);
    float sub = 0.0;
    for (int k = 0; k < 7; k++) {
      if (k >= ns) break;
      float fk = float(k);
      float phi = spin * 0.6 + 6.2831853 * fk / float(ns) + hn * 2.2 * sign(spin + 1e-4) + sin(uTime * 0.7 + fk * 2.1) * 0.3;
      vec2 c = ax + orbit * (1.0 + 0.18 * sin(uTime * 0.9 + fk * 1.7)) * vec2(cos(phi), sin(phi));
      vec2 dd = q.xz - c;
      float life = 0.5 + 0.5 * sin(uTime * (0.33 + 0.08 * fk) + fk * 2.3);
      sub = max(sub, exp(-dot(dd, dd) / (rs * rs)) * life);
    }
    sub *= (1.0 - ss(0.25, 0.8, hn)) * mv;
    dens += sub * uT4[i].y * 1.3;
  }
  // Nuvem de detritos (poeira, terra, palha) girando e subindo junto ao chão.
  float deb = 0.0;
  float dA = uT3[i].z;
  if (dA > 0.001) {
    vec2 g = q.xz - torAxis(i, 0.0);
    float rg = length(g);
    float hd = max(Rd * 0.55, 22.0) * (0.55 + 0.9 * dA);
    float vprof = exp(-max(q.y, 0.0) / hd);
    // Capa de detritos: mais larga embaixo, abraçando o funil.
    float rprof = ss(Rd * (1.0 + 0.25 * vprof), Rd * 0.25, rg - q.y * 0.15);
    float w0 = fract(uTime * 0.12);
    float om = uT6[i].w * clamp(pow(Rd / max(rg, Rd * 0.2), 1.2), 0.3, 3.0);
    float ga = atan(g.y, g.x);
    float ag1 = ga - om * w0 * 8.0;
    float ag2 = ga - om * fract(w0 + 0.5) * 8.0;
    float hz = q.y / (hd * 2.2) - uTime * 0.09;
    vec4 dn1 = nz(vec3(vec2(cos(ag1), sin(ag1)) * rg / (Rd * 1.7 + 1.0), hz));
    vec4 dn2 = nz(vec3(vec2(cos(ag2), sin(ag2)) * rg / (Rd * 1.7 + 1.0), hz) + vec3(0.5, 0.3, 0.1));
    float wb = 1.0 - abs(2.0 * w0 - 1.0);
    float dn = mix(dn2.r, dn1.r, wb) * 0.7 + mix(dn2.a, dn1.a, wb) * 0.3;
    deb = dA * vprof * rprof * sat(dn * 1.8 - 0.25) * 0.085;
    // Jatos de poeira em espiral no chão (afluxo).
    float arms = sin(ga * 3.0 + log(rg + 1.0) * 5.0 * sign(spin + 1e-4) - uTime * 1.5);
    deb += dA * ss(Rd * 2.6, Rd * 0.8, rg) * ss(14.0, 0.0, q.y) * sat(arms * 0.5 + dn - 0.4) * 0.012;
  }
  return vec4(dens, deb, radial);
}

float wallCloud(int i, vec3 p) {
  float L = uS2[i].y;
  float Rw = uS2[i].z;
  if (L < 5.0) return 0.0;
  float bottom = uBase - L;
  if (p.y < bottom - 160.0 || p.y > uBase + 20.0) return 0.0;
  vec2 dm = p.xz - uS0[i].xy;
  float rm = length(dm);
  if (rm > Rw * 2.4 + 2600.0) return 0.0;
  float a = atan(dm.y, dm.x) - uS2[i].w;
  vec2 cs = vec2(cos(a), sin(a)) * (rm / 2200.0);
  vec4 n = nz(vec3(cs.x, p.y / 1100.0, cs.y) + vec3(0.13, 0.0, 0.71));
  vec4 nf = nz(vec3(cs.x * 3.0, p.y / 300.0, cs.y * 3.0) + vec3(0.4, 0.2, 0.1));
  float prof = ss(Rw * 1.12, Rw * 0.72, rm + (n.r - 0.5) * Rw * 0.55);
  // Base em degraus (estrias) que sobem para fora.
  float terr = floor((rm / Rw) * 3.0 + n.g * 0.8) / 3.0;
  float bot = bottom + (n.g - 0.5) * L * 0.45 + terr * L * 0.38 + (nf.a - 0.5) * 30.0;
  float v = ss(bot - 15.0, bot + 45.0, p.y);
  // Nuvem cauda em direção à precipitação.
  vec2 Lc = stormLocal(i, p.xz);
  float tail = ss(1.0, 0.45, length((Lc - vec2(1500.0, -1100.0)) / vec2(1500.0, 420.0)) + (n.b - 0.5) * 0.45);
  float tailBot = uBase - L * 0.55;
  float vt = ss(tailBot - 20.0, tailBot + 70.0, p.y + (n.r - 0.5) * 90.0);
  float dens = max(prof * v, tail * vt * 0.85);
  // Fractos (scud) sendo sugados.
  vec4 ns = nz(vec3(p.x / 520.0 + uTime * 0.012, p.y / 240.0, p.z / 520.0));
  float scud = sat((ns.r - 0.66) * 4.0) * ss(Rw * 2.4, Rw * 0.9, rm) * ss(bottom - 160.0, bottom + 40.0, p.y) * ss(uBase + 10.0, uBase - 150.0, p.y);
  dens = max(dens, scud * 0.75);
  return dens * 0.011 * ss(0.0, 0.25, uS2[i].x);
}

// x = densidade de chuva, y = fração de granizo
vec2 rain(int i, vec3 p) {
  float pr = uS1[i].z;
  if (pr < 0.01 || p.y > uBase) return vec2(0.0);
  vec2 L = stormLocal(i, p.xz);
  float k = uS3[i].x;
  vec4 n = nz(vec3(p.x / 1500.0, p.y / 7000.0 - uTime * 0.02, p.z / 1500.0));
  vec4 n2 = nz(vec3(p.x / 420.0, p.y / 3000.0 - uTime * 0.06, p.z / 420.0) + vec3(0.3));
  float e = length((L - vec2(5200.0, -3100.0) * k) / (vec2(6600.0, 4000.0) * k));
  float ffd = ss(1.0, 0.3, e + (n.r - 0.5) * 0.55);
  // Gancho: cortina do RFD enrolando em volta do mesociclone.
  float r = length(L);
  float ph = atan(-L.y, L.x);
  if (ph < -0.6) ph += 6.2831853;
  float hr = mix(3300.0, 700.0, sat((ph - 0.7) / 3.2)) * k;
  float onArc = ss(0.6, 1.2, ph) * ss(4.3, 3.7, ph);
  float hook = onArc * ss(1000.0 * k, 250.0 * k, abs(r - hr) + (n2.r - 0.5) * 700.0) * (0.35 + uS3[i].w);
  float dens = (ffd * (0.55 + 0.9 * n2.g) + hook) * pr;
  // Pé de chuva: mais denso perto do chão, evapora em cima.
  dens *= mix(0.45, 1.0, ss(uBase, uBase - 1400.0, p.y));
  float hail = uS1[i].w * ss(1.0, 0.2, length((L - vec2(2400.0, -1300.0) * k) / (vec2(1900.0, 1300.0) * k)));
  return vec2(dens * 0.00105, hail);
}

bool cyl(vec3 ro, vec3 rd, vec2 c, float r, float y0, float y1, out float ta, out float tb) {
  vec2 o = ro.xz - c;
  vec2 d = rd.xz;
  float A = dot(d, d);
  float B = dot(o, d);
  float C = dot(o, o) - r * r;
  float a0 = -1e9;
  float a1 = 1e9;
  if (A > 1e-9) {
    float disc = B * B - A * C;
    if (disc < 0.0) return false;
    float s = sqrt(disc);
    a0 = (-B - s) / A;
    a1 = (-B + s) / A;
  } else if (C > 0.0) return false;
  float b0 = -1e9;
  float b1 = 1e9;
  if (abs(rd.y) > 1e-6) {
    float t0 = (y0 - ro.y) / rd.y;
    float t1 = (y1 - ro.y) / rd.y;
    b0 = min(t0, t1);
    b1 = max(t0, t1);
  } else if (ro.y < y0 || ro.y > y1) return false;
  ta = max(max(a0, b0), 0.0);
  tb = min(a1, b1);
  return tb > ta;
}

void main() {
  vec3 rd = rayDir(vUv);
  vec3 ro = uCam;
  float depth = texture2D(tDepth, vUv).x;
  float tEnd = min(depthToDist(depth, rd), 60000.0);
  float ia[10];
  float ib[10];
  float is[10];
  int n = 0;
  float budget = uSteps;
  for (int i = 0; i < ${MAX_TOR}; i++) {
    if (i >= uNT) break;
    float H = uT0[i].w;
    float rad = max(max(uT1[i].x, uT1[i].y) * 1.9 + 160.0, uT3[i].w * 1.7 + 40.0) + length(uT2[i].xy) * 0.5 + uT2[i].z * 1.4;
    vec2 c = uT0[i].xz + uT2[i].xy * 0.5;
    float a;
    float b;
    if (cyl(ro, rd, c, rad, uT0[i].y - 5.0, uT0[i].y + H + 140.0, a, b)) {
      b = min(b, tEnd);
      if (b > a) { ia[n] = a; ib[n] = b; is[n] = max((b - a) / (budget * 0.55), max(0.6, min(uT1[i].x, uT1[i].y) * 0.08)); n++; }
    }
  }
  for (int i = 0; i < ${MAX_STORMS}; i++) {
    if (i >= uNS) break;
    float a;
    float b;
    float L = uS2[i].y;
    float Rw = uS2[i].z;
    if (L > 5.0 && cyl(ro, rd, uS0[i].xy, Rw * 2.4 + 2600.0, uBase - L - 170.0, uBase + 20.0, a, b)) {
      b = min(b, tEnd);
      if (b > a) { ia[n] = a; ib[n] = b; is[n] = max((b - a) / 26.0, 12.0); n++; }
    }
    float k = uS3[i].x;
    vec2 F = uS1[i].xy;
    vec2 R = vec2(-F.y, F.x) * uS0[i].w;
    vec2 c = uS0[i].xy + F * 3200.0 * k - R * 2000.0 * k;
    if (uS1[i].z > 0.01 && cyl(ro, rd, c, 9800.0 * k, uGround - 80.0, uBase, a, b)) {
      b = min(b, tEnd);
      if (b > a) { ia[n] = a; ib[n] = b; is[n] = max((b - a) / 22.0, 35.0); n++; }
    }
  }
  if (n == 0) { gl_FragColor = vec4(0.0); return; }
  float t = 1e9;
  for (int k = 0; k < 10; k++) { if (k >= n) break; t = min(t, ia[k]); }
  float jit = ign(gl_FragCoord.xy);
  vec3 col = vec3(0.0);
  float T = 1.0;
  float mu = dot(rd, uSunDir);
  float phCond = hg(mu, 0.5) * 3.0 + 0.3;
  float phRain = hg(mu, 0.7) * 2.0 + 0.4;
  vec2 sxz = normalize(uSunDir.xz + vec2(1e-4));
  int maxIt = int(uSteps) + 40;
  for (int it = 0; it < 300; it++) {
    if (it >= maxIt || T < 0.01 || t >= tEnd) break;
    float dt = 1e9;
    float nextA = 1e9;
    bool inside = false;
    for (int k = 0; k < 10; k++) {
      if (k >= n) break;
      if (t >= ia[k] && t < ib[k]) { inside = true; dt = min(dt, is[k]); }
      else if (ia[k] > t) nextA = min(nextA, ia[k]);
    }
    if (!inside) {
      if (nextA >= tEnd) break;
      t = nextA;
      continue;
    }
    dt = min(dt, max(nextA - t, 0.5));
    vec3 p = ro + rd * (t + dt * jit);
    float sig = 0.0;
    vec3 Ls = vec3(0.0);
    float sv = -1.0;
    vec3 amb = vec3(0.0);
    // Tornados.
    for (int i = 0; i < ${MAX_TOR}; i++) {
      if (i >= uNT) break;
      float shd;
      float hnn;
      vec3 geo;
      vec4 tr = tornado(i, p, shd, hnn, geo);
      float s = tr.x + tr.y;
      if (s > 1e-6) {
        if (sv < 0.0) {
          sv = sunVis(p);
          float cov = stormCover2D(p.xz);
          amb = ambBelow(cov);
        }
        // Sombra própria: com o sol atrás do funil, o lado visível fica escuro e só as
        // bordas brilham; com o sol atrás de quem olha, o funil fica claro.
        float slant = 1.0 / max(sqrt(1.0 - uSunDir.y * uSunDir.y), 0.3);
        float cC = chordSun(tr.zw, geo.x, geo.y, sxz) * slant;
        float cD = chordSun(tr.zw, geo.x, geo.z, sxz) * slant;
        float selfC = exp(-cC * uT4[i].y * mix(0.55, 0.25, uT3[i].x));
        float selfD = exp(-cD * uT3[i].z * 0.018);
        // Espalhamento múltiplo aproximado: a sombra própria não é totalmente preta.
        float lam = mix(selfC, sqrt(selfC), 0.35);
        float hfac = sat((p.y - uT0[i].y) / 60.0) * 0.4 + 0.6;
        // Parte de cima do funil fica na sombra da nuvem parede; cunhas largas e
        // envoltas em chuva recebem pouco sol direto.
        float svT = sv * mix(1.0, 0.2, ss(0.5, 0.95, hnn)) * mix(1.0, 0.4, ss(250.0, 900.0, uT1[i].x)) * (1.0 - 0.6 * uT4[i].z);
        vec3 sunL = uSunCol * svT * lam * (0.45 + phCond * 0.55);
        vec3 cCond = (sunL * shd + amb * hfac * mix(0.7, 1.0, shd)) * 0.8;
        // Poeira levantada tinge a parte de baixo do funil.
        vec3 dustTint = mix(vec3(1.0), uT5[i].rgb / max(uT5[i].r, 1e-3), 0.45) * 0.8;
        cCond = mix(cCond, cCond * dustTint, uT3[i].z * 0.7 * pow(1.0 - hnn, 2.5));
        vec3 dcol = mix(vec3(dot(uT5[i].rgb, vec3(0.333))), uT5[i].rgb, 0.62);
        vec3 cDeb = (uSunCol * svT * selfD * (0.45 + phCond * 0.55) * 0.7 + amb * hfac) * dcol;
        sig += s;
        Ls += tr.x * cCond + tr.y * cDeb;
      }
      // Cortina de chuva envolvente em volta do tornado.
      float rw = uT4[i].z;
      if (rw > 0.01) {
        vec2 g = p.xz - uT0[i].xz;
        float rr = length(g);
        float R0 = max(uT1[i].x, uT1[i].y * 0.6) + 40.0;
        float ring = ss(R0 * 0.9, R0 * 1.6, rr) * ss(R0 * 5.0 + 600.0, R0 * 2.0, rr);
        vec4 nr = nz(vec3(p.x / 260.0, p.y / 1800.0 - uTime * 0.08, p.z / 260.0));
        float rd2 = ring * rw * (0.4 + nr.g) * 0.0022 * step(p.y, uBase);
        if (rd2 > 1e-6) {
          if (sv < 0.0) { sv = sunVis(p); amb = ambBelow(stormCover2D(p.xz)); }
          sig += rd2;
          Ls += rd2 * (uSunCol * sv * phRain * 0.25 + amb) * 0.75;
        }
      }
    }
    // Nuvem parede e chuva de cada tempestade.
    for (int i = 0; i < ${MAX_STORMS}; i++) {
      if (i >= uNS) break;
      float w = wallCloud(i, p);
      vec2 rn = rain(i, p);
      if (w + rn.x > 1e-7) {
        if (sv < 0.0) {
          sv = sunVis(p);
          float cov = stormCover2D(p.xz);
          amb = ambBelow(cov);
        }
        // A base da nuvem parede recebe pouca luz (só de baixo e dos lados).
        // Auto-sombreamento: a chuva densa e a nuvem parede bloqueiam o próprio sol.
        float svR = sv * exp(-rn.x * 2200.0);
        float svW = sv * exp(-w * 260.0);
        vec3 cw = (uSunCol * svW * 0.3 * phCond + amb * 0.55) * 0.85;
        vec3 cr = (uSunCol * svR * phRain * 0.3 + amb) * mix(vec3(0.72, 0.76, 0.8), vec3(0.9, 1.0, 0.95), rn.y);
        sig += w + rn.x;
        Ls += w * cw + rn.x * cr;
      }
    }
    if (sig > 1e-7) {
      vec3 S = Ls / sig;
      if (uFlash.w > 0.0) S += vec3(0.75, 0.8, 1.0) * uFlash.w * 2.5 * exp(-length(p - uFlash.xyz) / 3500.0);
      float tt = t + dt * jit;
      S = mix(hazeAt(p), S, exp(-tt / uVis));
      float ex = exp(-sig * dt);
      col += T * S * (1.0 - ex);
      T *= ex;
    }
    t += dt;
  }
  gl_FragColor = vec4(col, 1.0 - T);
}
`;

// ------------------------------------------------------------------ sombra das tempestades
const SHADOW_FRAG = /* glsl */ `
${COMMON}
uniform float uHalf;
void main() {
  vec2 xz = (vUv - 0.5) * 2.0 * uHalf;
  xz.y = -xz.y;
  vec3 p = vec3(xz.x, uGround, xz.y);
  float v = sunVis(p);
  // Sombra dos cúmulos de fundo.
  vec2 off = uSunDir.xz / max(uSunDir.y, 0.08) * max(uBase + 500.0 - uGround, 0.0);
  vec2 q = (xz + off) / 9000.0 + uWindOff;
  float cov = nz(vec3(q.x, 0.37, q.y)).r;
  cov = sat((cov - (1.0 - uCover)) / max(uCover, 0.08));
  v *= 1.0 - 0.75 * ss(0.0, 0.35, cov);
  gl_FragColor = vec4(v, v, v, 1.0);
}
`;

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

function stormUniforms() {
  const arr = (n) => Array.from({ length: n }, () => new THREE.Vector4());
  return {
    tDepth: { value: null },
    tNoise: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uProjInv: { value: new THREE.Matrix4() },
    uCamMat: { value: new THREE.Matrix4() },
    uCam: { value: new THREE.Vector3() },
    uNear: { value: 0.5 },
    uFar: { value: 1000 },
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: new THREE.Color() },
    uAmbSky: { value: new THREE.Color() },
    uAmbGnd: { value: new THREE.Color() },
    uHaze: { value: new THREE.Color() },
    uVis: { value: 30000 },
    uGround: { value: 0 },
    uBase: { value: 1200 },
    uCover: { value: 0.3 },
    uWindOff: { value: new THREE.Vector2() },
    uFlash: { value: new THREE.Vector4() },
    uNS: { value: 0 },
    uS0: { value: arr(MAX_STORMS) },
    uS1: { value: arr(MAX_STORMS) },
    uS2: { value: arr(MAX_STORMS) },
    uS3: { value: arr(MAX_STORMS) },
  };
}

export class VolumeRenderer {
  constructor(noiseTex) {
    this.shared = stormUniforms();
    this.shared.tNoise.value = noiseTex;
    const torU = {
      uNT: { value: 0 },
      uT0: { value: Array.from({ length: MAX_TOR }, () => new THREE.Vector4()) },
      uT1: { value: Array.from({ length: MAX_TOR }, () => new THREE.Vector4()) },
      uT2: { value: Array.from({ length: MAX_TOR }, () => new THREE.Vector4()) },
      uT3: { value: Array.from({ length: MAX_TOR }, () => new THREE.Vector4()) },
      uT4: { value: Array.from({ length: MAX_TOR }, () => new THREE.Vector4()) },
      uT5: { value: Array.from({ length: MAX_TOR }, () => new THREE.Vector4()) },
      uT6: { value: Array.from({ length: MAX_TOR }, () => new THREE.Vector4()) },
    };
    this.tor = torU;
    const mk = (frag, extra) =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: frag,
        uniforms: { ...this.shared, ...extra },
        depthTest: false,
        depthWrite: false,
      });
    this.cloudMat = mk(CLOUD_FRAG, { uSteps: { value: 40 }, uLightSteps: { value: 2 } });
    this.volMat = mk(VOL_FRAG, { uSteps: { value: 80 }, ...torU });
    this.shadowMat = mk(SHADOW_FRAG, { uHalf: { value: 30000 } });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.cloudMat);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.shadowRT = new THREE.WebGLRenderTarget(256, 256, { type: THREE.UnsignedByteType, depthBuffer: false });
    this.shadowRT.texture.minFilter = THREE.LinearFilter;
    this.shadowRT.texture.magFilter = THREE.LinearFilter;
    this.shadowRT.texture.generateMipmaps = false;
  }

  setCamera(camera) {
    const s = this.shared;
    s.uProjInv.value.copy(camera.projectionMatrixInverse);
    s.uCamMat.value.copy(camera.matrixWorld);
    s.uCam.value.setFromMatrixPosition(camera.matrixWorld);
    s.uNear.value = camera.near;
    s.uFar.value = camera.far;
  }

  // Copia o estado do tempo (tempestades e tornados) para os uniforms.
  setWeather(storms, tornadoes) {
    const s = this.shared;
    const n = Math.min(MAX_STORMS, storms.length);
    s.uNS.value = n;
    for (let i = 0; i < n; i++) {
      const st = storms[i].render;
      s.uS0.value[i].set(st.x, st.z, st.maturity, st.hemi);
      s.uS1.value[i].set(st.dirX, st.dirZ, st.precip, st.hail);
      s.uS2.value[i].set(st.meso, st.wallLower, st.wallR, st.spin);
      s.uS3.value[i].set(st.scale, st.top, st.anvilR, st.rfd);
    }
    const t = this.tor;
    const m = Math.min(MAX_TOR, tornadoes.length);
    t.uNT.value = m;
    for (let i = 0; i < m; i++) {
      const v = tornadoes[i].render;
      t.uT0.value[i].set(v.x, v.y, v.z, v.H);
      t.uT1.value[i].set(v.Rg, v.Rt, v.pexp, v.cond);
      t.uT2.value[i].set(v.topX, v.topZ, v.contort, v.contortPh);
      t.uT3.value[i].set(v.mv, v.nsub, v.debris, v.debrisR);
      t.uT4.value[i].set(v.spin, v.dens, v.rainWrap, v.dust);
      t.uT5.value[i].set(v.debrisCol[0], v.debrisCol[1], v.debrisCol[2], v.Rcore);
      t.uT6.value[i].set(v.turb, v.rise, v.twist, v.debrisSpin);
    }
  }

  renderShadow(renderer) {
    this.quad.material = this.shadowMat;
    renderer.setRenderTarget(this.shadowRT);
    renderer.render(this.scene, this.cam);
    return this.shadowRT.texture;
  }

  renderClouds(renderer, target, depthTex, steps, lightSteps) {
    this.shared.tDepth.value = depthTex;
    this.shared.uRes.value.set(target.width, target.height);
    this.cloudMat.uniforms.uSteps.value = steps;
    this.cloudMat.uniforms.uLightSteps.value = lightSteps;
    this.quad.material = this.cloudMat;
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.cam);
  }

  renderVolume(renderer, target, depthTex, steps) {
    this.shared.tDepth.value = depthTex;
    this.shared.uRes.value.set(target.width, target.height);
    this.volMat.uniforms.uSteps.value = steps;
    this.quad.material = this.volMat;
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.cam);
  }
}
