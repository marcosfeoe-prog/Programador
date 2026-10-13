// Neblina com decaimento exponencial em altura (integral analítica ao longo do raio),
// compartilhada pelo pós-processamento e pelo renderizador volumétrico.
export const FOG_GLSL = /* glsl */ `
uniform vec3 uFogColor;
uniform vec3 uFogSunColor;
uniform vec3 uFogSunDir;
uniform vec2 uFog; // x = densidade no nível do solo, y = decaimento por metro de altura

float fogAmount(vec3 ro, vec3 rd, float t) {
  float base = uFog.x * exp(-uFog.y * max(ro.y, -50.0));
  float k = uFog.y * rd.y;
  if (abs(k) < 1e-7) return base * t;
  return base * (1.0 - exp(-clamp(k * t, -30.0, 30.0))) / k;
}
float fogTrans(vec3 ro, vec3 rd, float t) { return exp(-fogAmount(ro, rd, t)); }
vec3 fogColorDir(vec3 rd) {
  float s = max(dot(rd, uFogSunDir), 0.0);
  return uFogColor + uFogSunColor * (pow(s, 6.0) * 0.5 + pow(s, 48.0) * 0.7);
}
`;
