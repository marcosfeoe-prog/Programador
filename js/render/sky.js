// Domo do céu: espalhamento atmosférico (modelo de Preetham), estrelas, lua
// e escurecimento em tempo nublado/tempestade.
import * as THREE from 'three';
import { smoothstep, lerp } from '../util/math.js';

const vert = /* glsl */ `
uniform vec3 uSunDir;
uniform float uRayleigh;
uniform float uTurbidity;
uniform float uMieCoef;
varying vec3 vDir;
varying vec3 vBetaR;
varying vec3 vBetaM;
varying float vSunE;
varying float vSunfade;

const float e = 2.718281828459045;
const vec3 totalRayleigh = vec3(5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5);
const vec3 MieConst = vec3(1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14);
const float cutoffAngle = 1.6110731556870734;
const float steepness = 1.5;
const float EE = 1000.0;

float sunIntensity(float zenithAngleCos) {
  zenithAngleCos = clamp(zenithAngleCos, -1.0, 1.0);
  return EE * max(0.0, 1.0 - pow(e, -((cutoffAngle - acos(zenithAngleCos)) / steepness)));
}
vec3 totalMie(float T) {
  float c = (0.2 * T) * 10E-18;
  return 0.434 * c * MieConst;
}
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
  vSunE = sunIntensity(uSunDir.y);
  vSunfade = 1.0 - clamp(1.0 - exp(uSunDir.y * 2.5), 0.0, 1.0);
  float rayleighCoefficient = uRayleigh - (1.0 * (1.0 - vSunfade));
  vBetaR = totalRayleigh * rayleighCoefficient;
  vBetaM = totalMie(uTurbidity) * uMieCoef;
}
`;

const frag = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform float uMieG;
uniform float uTime;
uniform float uOvercast;
uniform vec3 uOvercastColor;
uniform float uNight;
uniform float uFlash;
uniform float uBrightness;
uniform vec3 uGlowColor;
varying vec3 vDir;
varying vec3 vBetaR;
varying vec3 vBetaM;
varying float vSunE;
varying float vSunfade;

const float pi = 3.141592653589793;
const float rayleighZenithLength = 8.4E3;
const float mieZenithLength = 1.25E3;
const float sunAngularDiameterCos = 0.99995;
const float THREE_OVER_SIXTEENPI = 0.05968310365946075;
const float ONE_OVER_FOURPI = 0.07957747154594767;

float rayleighPhase(float c) { return THREE_OVER_SIXTEENPI * (1.0 + c * c); }
float hgPhase(float c, float g) {
  float g2 = g * g;
  return ONE_OVER_FOURPI * ((1.0 - g2) / pow(1.0 - 2.0 * g * c + g2, 1.5));
}
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

vec3 stars(vec3 d) {
  vec3 col = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    float sc = i == 0 ? 180.0 : 420.0;
    vec3 p = d * sc;
    vec3 id = floor(p);
    vec3 f = fract(p) - 0.5;
    float h = hash13(id + float(i) * 13.1);
    if (h > 0.985) {
      vec3 o = vec3(hash13(id + 1.7), hash13(id + 5.3), hash13(id + 9.1)) - 0.5;
      float dist = length(f - o * 0.6);
      float b = pow(max(0.0, 1.0 - dist * 3.2), 12.0);
      float tw = 0.7 + 0.3 * sin(uTime * (2.0 + h * 9.0) + h * 100.0);
      float temp = hash13(id + 3.3);
      vec3 tint = mix(vec3(1.0, 0.82, 0.65), vec3(0.75, 0.85, 1.0), temp);
      col += tint * b * tw * (i == 0 ? 2.5 : 1.2) * (h - 0.985) * 66.0;
    }
  }
  return col;
}

void main() {
  vec3 direction = normalize(vDir);
  float up = max(direction.y, 0.0);
  float zenithAngle = acos(max(0.0, direction.y));
  float inverse = 1.0 / (cos(zenithAngle) + 0.15 * pow(93.885 - ((zenithAngle * 180.0) / pi), -1.253));
  float sR = rayleighZenithLength * inverse;
  float sM = mieZenithLength * inverse;
  vec3 Fex = exp(-(vBetaR * sR + vBetaM * sM));
  float cosTheta = dot(direction, uSunDir);
  float rPhase = rayleighPhase(cosTheta * 0.5 + 0.5);
  vec3 betaRTheta = vBetaR * rPhase;
  float mPhase = hgPhase(cosTheta, uMieG);
  vec3 betaMTheta = vBetaM * mPhase;
  vec3 Lin = pow(vSunE * ((betaRTheta + betaMTheta) / (vBetaR + vBetaM)) * (1.0 - Fex), vec3(1.5));
  Lin *= mix(vec3(1.0), pow(vSunE * ((betaRTheta + betaMTheta) / (vBetaR + vBetaM)) * Fex, vec3(0.5)),
             clamp(pow(1.0 - uSunDir.y, 5.0), 0.0, 1.0));
  vec3 L0 = vec3(0.1) * Fex;
  float sundisk = smoothstep(sunAngularDiameterCos, sunAngularDiameterCos + 0.00002, cosTheta);
  L0 += (vSunE * 19000.0 * Fex) * sundisk * pow(1.0 - uOvercast, 4.0);
  vec3 texColor = (Lin + L0) * 0.04 + vec3(0.0, 0.0003, 0.00075);
  vec3 sky = pow(texColor, vec3(1.0 / (1.2 + (1.2 * vSunfade)))) * uBrightness;

  // Abaixo do horizonte: escurece suavemente (o terreno cobre quase tudo).
  float below = smoothstep(0.0, -0.25, direction.y);
  sky = mix(sky, sky * 0.35, below);

  // Céu noturno
  vec3 nightCol = mix(vec3(0.0035, 0.005, 0.011), vec3(0.008, 0.010, 0.018), pow(1.0 - up, 3.0));
  nightCol += uGlowColor * pow(1.0 - up, 10.0); // poluição luminosa da cidade
  vec3 st = stars(direction) * smoothstep(0.0, 0.15, direction.y) * (1.0 - uOvercast);
  float moonCos = dot(direction, uMoonDir);
  float moonDisk = smoothstep(0.99975, 0.99982, moonCos);
  float moonGlow = pow(max(moonCos, 0.0), 300.0) * 0.06 + pow(max(moonCos, 0.0), 12.0) * 0.006;
  vec3 moon = vec3(0.85, 0.88, 0.95) * (moonDisk * 1.4 * (1.0 - uOvercast * 0.95) + moonGlow * (1.0 - uOvercast * 0.6));
  sky += (nightCol + st + moon) * uNight;

  // Tempo encoberto / tempestade
  vec3 oc = uOvercastColor * mix(0.7, 1.15, pow(1.0 - up, 2.0));
  sky = mix(sky, oc, uOvercast);

  // Relâmpago
  sky += vec3(0.55, 0.6, 0.9) * uFlash * (0.4 + 0.6 * up);

  gl_FragColor = vec4(max(sky, 0.0), 1.0);
}
`;

export class Sky {
  constructor(scene) {
    this.uniforms = {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
      uRayleigh: { value: 1.6 },
      uTurbidity: { value: 6.5 },
      uMieCoef: { value: 0.005 },
      uMieG: { value: 0.8 },
      uTime: { value: 0 },
      uOvercast: { value: 0 },
      uOvercastColor: { value: new THREE.Color(0.3, 0.32, 0.35) },
      uNight: { value: 0 },
      uFlash: { value: 0 },
      uBrightness: { value: 0.55 },
      uGlowColor: { value: new THREE.Color(0.02, 0.012, 0.004) },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const geo = new THREE.SphereGeometry(1, 64, 32);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.scale.setScalar(9000);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    scene.add(this.mesh);

    // Cores aproximadas (CPU) para iluminação ambiente e neblina.
    this.zenith = new THREE.Color();
    this.horizon = new THREE.Color();
    this.ground = new THREE.Color();
    this.fogColor = new THREE.Color();
    this.fogSunColor = new THREE.Color();
  }

  update(camera, sunDir, moonDir, env, time) {
    const u = this.uniforms;
    this.mesh.position.copy(camera.position);
    u.uSunDir.value.copy(sunDir);
    u.uMoonDir.value.copy(moonDir);
    u.uTime.value = time;
    u.uOvercast.value = env.overcast;
    u.uFlash.value = env.flash;
    u.uTurbidity.value = lerp(4.5, 9, env.humidity);
    u.uRayleigh.value = lerp(1.4, 2.6, 1 - smoothstep(0.0, 0.4, sunDir.y));
    const sunY = sunDir.y;
    const day = smoothstep(-0.12, 0.2, sunY);
    u.uNight.value = 1 - smoothstep(-0.18, 0.02, sunY);
    u.uGlowColor.value.setRGB(0.03, 0.017, 0.006).multiplyScalar(env.townPower);
    // Cor encoberta depende da luz disponível
    const ocL = lerp(0.006, 0.34, day) * (1 - env.stormDark * 0.55);
    u.uOvercastColor.value.setRGB(ocL * 0.92, ocL * 0.97, ocL * 1.05);
    if (sunY < 0.25 && sunY > -0.12) {
      const s = 1 - smoothstep(-0.05, 0.25, sunY);
      u.uOvercastColor.value.lerp(new THREE.Color(ocL * 1.25, ocL * 0.85, ocL * 0.65), s * 0.5 * day);
    }

    // Aproximações para a iluminação da cena
    const sunset = (1 - smoothstep(0.0, 0.35, sunY)) * smoothstep(-0.15, 0.02, sunY);
    this.zenith.setRGB(0.09, 0.2, 0.45).multiplyScalar(day);
    this.zenith.lerp(new THREE.Color(0.0045, 0.006, 0.012), 1 - day);
    this.horizon.setRGB(0.42, 0.5, 0.6).multiplyScalar(day);
    this.horizon.lerp(new THREE.Color(0.75, 0.42, 0.24).multiplyScalar(day + 0.15), sunset * 0.8);
    this.horizon.lerp(new THREE.Color(0.008, 0.01, 0.018), 1 - day);
    const oc = u.uOvercastColor.value;
    this.zenith.lerp(oc, env.overcast);
    this.horizon.lerp(new THREE.Color(oc.r * 1.1, oc.g * 1.1, oc.b * 1.1), env.overcast);
    this.ground.setRGB(0.16, 0.14, 0.1).multiplyScalar(lerp(0.02, 1, day));

    this.fogColor.copy(this.horizon);
    this.fogSunColor.setRGB(1.0, 0.82, 0.6).multiplyScalar(lerp(0, 0.9, day) * (1 - env.overcast * 0.8));
    this.fogSunColor.lerp(new THREE.Color(1.0, 0.5, 0.25).multiplyScalar(0.9), sunset * (1 - env.overcast));
    return { day, sunset };
  }
}

export function sunColorFromElevation(y, out) {
  // Transmitância atmosférica aproximada (avermelha perto do horizonte)
  const air = 1 / Math.max(0.035, y + 0.035);
  const r = Math.exp(-0.012 * air);
  const g = Math.exp(-0.03 * air);
  const b = Math.exp(-0.07 * air);
  out.setRGB(r, g, b);
  return out;
}

