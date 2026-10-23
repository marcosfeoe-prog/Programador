// Céu dos gráficos MAX: atmosfera com espalhamento de Rayleigh e Mie, nuvens volumétricas em
// raymarching, disco solar com escurecimento de borda, lua com fases e crateras, estrelas e Via Láctea.
// É desenhado em tela cheia (meia resolução) e usado também pela neblina do terreno.

// mapa de nuvens 2D compartilhado com o shader dos blocos (sombras das nuvens no chão)
export const CLOUD_GLSL = /* glsl */ `
  float chash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float cnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(chash(i), chash(i + vec2(1, 0)), u.x), mix(chash(i + vec2(0, 1)), chash(i + vec2(1, 1)), u.x), u.y);
  }
  // cobertura das nuvens num ponto do plano (coordenadas do mundo, em blocos)
  float cloudMap(vec2 xz, float t) {
    vec2 p = xz / 640.0 + vec2(t * 0.0045, t * 0.0018);
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { s += cnoise(p) * a; p = p * 2.07 + 3.1; a *= 0.5; }
    return s;
  }
`;

export const SKY_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export const SKY_FRAG = /* glsl */ `
  #define PI 3.14159265
  uniform mat4 uInvProj;
  uniform mat4 uCamWorld;
  uniform vec3 uCamPos;
  uniform vec3 uSunDir;
  uniform float uTime;
  uniform float uCover;
  uniform float uRain;
  uniform float uFlash;
  varying vec2 vUv;
  ${CLOUD_GLSL}

  const float RE = 6371e3, RA = 6471e3;
  const vec3 BR = vec3(5.8e-6, 13.5e-6, 33.1e-6);
  const float BM = 21e-6, HR = 8000.0, HM = 1200.0;

  vec2 raySphere(vec3 ro, vec3 rd, float r) {
    float b = dot(ro, rd), c = dot(ro, ro) - r * r, d = b * b - c;
    if (d < 0.0) return vec2(1e9, -1e9);
    d = sqrt(d);
    return vec2(-b - d, -b + d);
  }
  // espalhamento simples da atmosfera ao longo do raio de visão
  vec3 atmosphere(vec3 rd, vec3 L, float I) {
    vec3 ro = vec3(0.0, RE + 200.0, 0.0);
    // sem espalhamento múltiplo o horizonte ficaria amarelado; comprime a faixa perto dele
    rd.y = 0.05 + max(rd.y, 0.0) * 0.95;
    rd = normalize(rd);
    float tmax = raySphere(ro, rd, RA).y;
    const int N = 14;
    float ds = tmax / float(N);
    vec3 sR = vec3(0.0), sM = vec3(0.0);
    float oR = 0.0, oM = 0.0;
    float mu = dot(rd, L);
    float pR = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
    float g = 0.76;
    float pM = 3.0 / (8.0 * PI) * ((1.0 - g * g) * (1.0 + mu * mu)) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
    for (int i = 0; i < N; i++) {
      vec3 p = ro + rd * (ds * (float(i) + 0.5));
      float h = length(p) - RE;
      float hr = exp(-h / HR) * ds, hm = exp(-h / HM) * ds;
      oR += hr;
      oM += hm;
      float tl = raySphere(p, L, RA).y;
      float dl = tl / 4.0, lR = 0.0, lM = 0.0;
      bool ok = true;
      for (int j = 0; j < 4; j++) {
        vec3 q = p + L * (dl * (float(j) + 0.5));
        float hl = length(q) - RE;
        if (hl < 0.0) { ok = false; break; }
        lR += exp(-hl / HR) * dl;
        lM += exp(-hl / HM) * dl;
      }
      if (ok) {
        vec3 att = exp(-(BR * (oR + lR) + BM * 1.1 * (oM + lM)));
        sR += att * hr;
        sM += att * hm;
      }
    }
    return I * (sR * BR * pR + sM * BM * pM);
  }

  float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float n3(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm3(vec3 p, int oct) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { if (i >= oct) break; s += n3(p) * a; p = p * 2.02 + vec3(1.7, 9.2, 3.3); a *= 0.5; }
    return s;
  }

  const float CB = 230.0, CT = 470.0; // base e topo da camada de nuvens (blocos)
  float cloudDensity(vec3 p, int oct) {
    float hf = (p.y - CB) / (CT - CB);
    if (hf < 0.0 || hf > 1.0) return 0.0;
    float cover = cloudMap(p.xz, uTime);
    float grad = smoothstep(0.0, 0.12, hf) * smoothstep(1.0, 0.35 + 0.4 * cover, hf);
    float base = cover - (1.0 - uCover) * 0.95;
    if (base * grad < -0.05) return 0.0;
    vec3 q = p * 0.006 + vec3(uTime * 0.012, 0.0, uTime * 0.005);
    float shape = fbm3(q, oct);
    float d = (base + shape * 0.6 - 0.45) * grad;
    // erosão fina das bordas
    if (oct > 2) d -= (fbm3(q * 4.3, 2) - 0.5) * 0.12 * (1.0 - d);
    return clamp(d * 4.0, 0.0, 1.0);
  }
  float hg(float mu, float g) { float g2 = g * g; return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * mu, 1.5)); }

  void main() {
    vec4 vp = uInvProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
    vec3 rd = normalize((uCamWorld * vec4(vp.xyz / vp.w, 0.0)).xyz);
    vec3 L = normalize(uSunDir);
    vec3 M = -L; // lua oposta ao sol
    float day = smoothstep(-0.12, 0.08, L.y);
    // céu: luz do sol de dia, da lua (fraca e azulada) à noite
    vec3 rad = atmosphere(rd, L, 22.0) * day + atmosphere(rd, M, 0.06) * (1.0 - day) * vec3(0.7, 0.8, 1.2);
    // abaixo do horizonte: neblina azulada da distância (o terreno se funde nela)
    if (rd.y < 0.0) rad = mix(rad, rad * vec3(0.78, 0.86, 1.0), smoothstep(0.0, -0.35, rd.y));
    float mu = dot(rd, L);
    // disco do sol com escurecimento da borda
    float sunR = 0.0095;
    float cs = acos(clamp(mu, -1.0, 1.0));
    vec3 sun = vec3(0.0);
    if (cs < sunR) {
      float r = cs / sunR;
      sun = vec3(1.0, 0.92, 0.8) * 60.0 * (1.0 - 0.6 * (1.0 - sqrt(1.0 - r * r))) * smoothstep(-0.02, 0.05, L.y);
    }
    // lua com fases e crateras
    vec3 moon = vec3(0.0);
    float cm = acos(clamp(dot(rd, M), -1.0, 1.0));
    float moonR = 0.016;
    if (cm < moonR && M.y > -0.05) {
      vec3 up = abs(M.y) > 0.99 ? vec3(1, 0, 0) : vec3(0, 1, 0);
      vec3 mx = normalize(cross(up, M)), my = cross(M, mx);
      vec2 lp = vec2(dot(rd - M, mx), dot(rd - M, my)) / moonR;
      float z = sqrt(max(0.0, 1.0 - dot(lp, lp)));
      vec3 n = normalize(mx * lp.x + my * lp.y + M * z);
      // fase: o sol de verdade ilumina a lua (desviado para dar meia-lua de vez em quando)
      vec3 sunForMoon = normalize(L + mx * sin(uTime * 0.002) * 1.6);
      float lit = max(dot(n, sunForMoon), 0.0) + 0.04;
      float crater = fbm3(vec3(lp * 3.5, 1.0), 4);
      moon = vec3(0.9, 0.92, 1.0) * (0.55 + crater * 0.6) * lit * 2.2 * smoothstep(1.0, 0.92, length(lp));
    }
    // estrelas e Via Láctea
    vec3 stars = vec3(0.0);
    if (rd.y > -0.05) {
      vec3 sp = rd * 420.0;
      vec3 cell = floor(sp);
      float hs = h3(cell);
      if (hs > 0.9965) {
        vec3 c = cell + 0.5 + (vec3(h3(cell + 1.3), h3(cell + 2.7), h3(cell + 5.1)) - 0.5) * 0.6;
        float d = length(sp - c);
        float tw = 0.65 + 0.35 * sin(uTime * (1.5 + hs * 30.0) + hs * 100.0);
        vec3 tint = mix(vec3(1.0, 0.8, 0.6), vec3(0.7, 0.85, 1.0), h3(cell + 9.1));
        stars += tint * smoothstep(0.5, 0.0, d) * tw * (hs - 0.9965) * 900.0;
      }
      vec3 mwN = normalize(vec3(0.3, 0.55, 0.78));
      float band = exp(-pow(dot(rd, mwN) / 0.16, 2.0));
      stars += vec3(0.55, 0.6, 0.8) * band * fbm3(rd * 9.0, 4) * 0.35 * (0.5 + fbm3(rd * 30.0, 3));
      stars *= (1.0 - day) * smoothstep(-0.05, 0.15, rd.y);
    }
    vec3 col = rad + sun + moon + stars;
    // nuvens volumétricas
    float T = 1.0;
    vec3 cl = vec3(0.0);
    if (rd.y > 0.01) {
      float t0 = (CB - uCamPos.y) / rd.y, t1 = (CT - uCamPos.y) / rd.y;
      t1 = min(t1, t0 + 2500.0);
      const int STEPS = 36;
      float dt = (t1 - t0) / float(STEPS);
      float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))) + fract(uTime * 7.0) * 0.618);
      vec3 sunC = vec3(1.0, 0.93, 0.82) * mix(0.35, 1.6, smoothstep(0.0, 0.3, L.y)) * day;
      sunC = mix(sunC, vec3(1.25, 0.55, 0.25), smoothstep(0.25, 0.0, L.y) * day);
      vec3 amb = atmosphere(vec3(0.0, 1.0, 0.0), L, 22.0) * day * 2.2 + vec3(0.012, 0.016, 0.03) * (1.0 - day) + vec3(0.004);
      float phase = mix(hg(mu, 0.6), hg(mu, -0.25), 0.35) * 4.0;
      for (int i = 0; i < STEPS; i++) {
        vec3 p = uCamPos + rd * (t0 + dt * (float(i) + jitter));
        float d = cloudDensity(p, 4);
        if (d > 0.002) {
          // luz que chega até aqui atravessando a nuvem na direção do sol
          float od = 0.0;
          for (int j = 1; j <= 4; j++) od += cloudDensity(p + L * float(j * j) * 9.0, 2) * 9.0 * float(2 * j - 1);
          float tl = exp(-od * 0.055);
          float powder = 1.0 - exp(-d * 4.0);
          float hf = (p.y - CB) / (CT - CB);
          vec3 lum = sunC * tl * phase * mix(0.6, 1.0, powder) + amb * (0.25 + 0.75 * hf);
          float a = 1.0 - exp(-d * dt * 0.11);
          cl += T * a * lum;
          T *= 1.0 - a;
          if (T < 0.02) break;
        }
      }
      // nuvens distantes somem na névoa do horizonte
      float far = 1.0 - exp(-t0 / 3500.0);
      cl = mix(cl, rad * (1.0 - T), far);
      T = mix(T, 1.0, far * 0.6);
      col = col * T + cl * (1.0 - uRain * 0.5);
    }
    // nublado com chuva
    col = mix(col, vec3(0.32, 0.34, 0.38) * (0.15 + 0.85 * day) * (1.0 - T * 0.4), uRain * 0.65);
    col += vec3(0.6, 0.65, 0.8) * uFlash;
    // radiância → valor de tela (a composição final aplica o tonemapping)
    vec3 disp = pow(1.0 - exp(-col * 1.6), vec3(1.0 / 2.2));
    // mantém o brilho do sol acima de 1 para o bloom e os raios
    disp += max(col - 3.0, 0.0) * 0.05;
    gl_FragColor = vec4(disp, 1.0);
  }
`;
