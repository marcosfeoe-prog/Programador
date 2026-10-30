// Céu (gradiente atmosférico, sol, lua, estrelas e nuvens), ciclo de dia e noite,
// luzes da cena, neblina e mapa de ambiente para os reflexos dos carros.
import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../util.js';

const SKY_VS = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w * 0.99999;
}`;

export const SKY_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunCol;
uniform vec3 uGround;
uniform vec3 uFogCol;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform float uSunVis;
uniform float uNight;
uniform float uHaze;
uniform float uCloud;
uniform float uCloudAlpha;
uniform float uTime;
uniform vec2 uWind;

float skHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float skHash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float skNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(skHash(i), skHash(i + vec2(1, 0)), u.x), mix(skHash(i + vec2(0, 1)), skHash(i + vec2(1, 1)), u.x), u.y);
}
float skFbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * skNoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return s;
}

vec3 skyBase(vec3 d) {
  float y = d.y;
  float h = 1.0 - clamp(y, 0.0, 1.0);
  vec3 col = mix(uZenith, uHorizon, pow(h, 3.0));
  float sd = max(dot(d, uSunDir), 0.0);
  float hz = pow(h, 6.0);
  col += uSunCol * (pow(sd, 6.0) * 0.28 + pow(sd, 90.0) * 0.9) * uSunVis;
  col += uSunCol * pow(sd, 2.5) * hz * 0.45 * uSunVis;
  if (y < 0.0) col = mix(col, uGround, smoothstep(0.0, -0.12, y));
  return col;
}

vec3 skyColor(vec3 d, bool clouds) {
  vec3 col = skyBase(d);
  float y = d.y;
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunCol * smoothstep(0.99955, 0.99975, sd) * 40.0 * uSunVis * (1.0 - uCloud * 0.85);
  if (uNight > 0.01 && y > 0.0) {
    vec3 p = d * 420.0;
    vec3 c = floor(p);
    float hs = skHash3(c);
    float st = step(0.9982, hs) * smoothstep(0.45, 0.1, length(fract(p) - 0.5));
    col += vec3(0.9, 0.95, 1.0) * st * uNight * (0.7 + 0.3 * sin(uTime * 2.0 + hs * 90.0)) * 2.5 * (1.0 - uCloud);
    // via láctea suave
    float band = exp(-pow(dot(d, normalize(vec3(0.3, 0.2, 1.0))) * 4.0, 2.0));
    col += vec3(0.05, 0.06, 0.09) * band * skFbm(d.xz * 6.0) * uNight * (1.0 - uCloud);
  }
  float md = dot(d, uMoonDir);
  col += vec3(0.95, 0.95, 1.0) * smoothstep(0.99962, 0.99975, md) * 3.0 * uNight;
  col += vec3(0.1, 0.13, 0.2) * pow(max(md, 0.0), 300.0) * uNight;
  if (clouds && y > 0.0) {
    vec2 uv = d.xz / (y + 0.08) * 0.55 + uWind * uTime;
    float n = skFbm(uv * 1.4);
    float cov = mix(0.66, 0.3, uCloud);
    float c = smoothstep(cov, cov + 0.22, n);
    float thick = smoothstep(cov, cov + 0.55, skFbm(uv * 1.4 + 0.12 * uSunDir.xz + 0.3));
    vec3 cc = mix(uCloudLit, uCloudShade, thick * 0.75);
    cc += uSunCol * pow(sd, 5.0) * 0.7 * uSunVis * (1.0 - thick);
    float fade = smoothstep(0.0, 0.16, y);
    col = mix(col, cc, c * fade * uCloudAlpha);
  }
  float hz = pow(1.0 - clamp(abs(y), 0.0, 1.0), 8.0);
  col = mix(col, uFogCol, hz * uHaze);
  return col;
}`;

const SKY_FS = /* glsl */ `
${SKY_GLSL}
varying vec3 vDir;
void main() {
  vec3 col = skyColor(normalize(vDir), true);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// quadros-chave por elevação do sol (graus)
const KEYS = [
  { e: -20, zen: '#020409', hor: '#070c18', sun: '#000000', cl: '#141a26', cs: '#06080d' },
  { e: -9, zen: '#07102a', hor: '#1d2240', sun: '#2a1a30', cl: '#232838', cs: '#0d1120' },
  { e: -3, zen: '#162650', hor: '#9a5a4c', sun: '#ff6a3a', cl: '#8a5a5c', cs: '#2f2c40' },
  { e: 0, zen: '#29467c', hor: '#f2905a', sun: '#ff8a46', cl: '#ffab7c', cs: '#5a4a5c' },
  { e: 5, zen: '#3a63a6', hor: '#fbb47c', sun: '#ffb070', cl: '#ffd2aa', cs: '#867884' },
  { e: 12, zen: '#4377c2', hor: '#e8cfb4', sun: '#ffdcb0', cl: '#fff0e0', cs: '#a4a4b0' },
  { e: 25, zen: '#3b76cf', hor: '#bed6ec', sun: '#fff1de', cl: '#ffffff', cs: '#b2bccb' },
  { e: 60, zen: '#2d68c8', hor: '#a8c7e8', sun: '#fff6ea', cl: '#ffffff', cs: '#b8c2d0' },
  { e: 91, zen: '#2d68c8', hor: '#a8c7e8', sun: '#fff6ea', cl: '#ffffff', cs: '#b8c2d0' },
];
const KC = KEYS.map((k) => ({
  e: k.e,
  zen: new THREE.Color(k.zen),
  hor: new THREE.Color(k.hor),
  sun: new THREE.Color(k.sun),
  cl: new THREE.Color(k.cl),
  cs: new THREE.Color(k.cs),
}));

export class Sky {
  constructor(renderer, scene, Q) {
    this.renderer = renderer;
    this.scene = scene;
    this.Q = Q;
    this.hours = 16.5;
    this.uniforms = {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uSunCol: { value: new THREE.Color() },
      uGround: { value: new THREE.Color(0.08, 0.09, 0.08) },
      uFogCol: { value: new THREE.Color() },
      uCloudLit: { value: new THREE.Color() },
      uCloudShade: { value: new THREE.Color() },
      uSunVis: { value: 1 },
      uNight: { value: 0 },
      uHaze: { value: 0.6 },
      uCloud: { value: 0.3 },
      uCloudAlpha: { value: 0.95 },
      uTime: { value: 0 },
      uWind: { value: new THREE.Vector2(0.004, 0.0015) },
    };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: SKY_VS,
      fragmentShader: SKY_FS,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    const geo = new THREE.SphereGeometry(1000, 48, 24);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    // luzes
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = Q.shadows > 0;
    if (Q.shadows > 0) {
      this.sun.shadow.mapSize.set(Q.shadows, Q.shadows);
      const S = Q.shadowRange;
      const c = this.sun.shadow.camera;
      c.left = -S;
      c.right = S;
      c.top = S;
      c.bottom = -S;
      c.near = 1;
      c.far = 900;
      this.sun.shadow.bias = -0.0003;
      this.sun.shadow.normalBias = 0.05;
    }
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbcd4ff, 0x3a3a28, 0.4);
    scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(0xa0b0c0, 0.00012);

    // cena do ambiente (só o céu e um chão), para o PMREM
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    const envSky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), this.mat);
    this.envScene.add(envSky);
    this.groundMat = new THREE.MeshBasicMaterial({ color: 0x334422, side: THREE.DoubleSide, fog: false });
    const gnd = new THREE.Mesh(new THREE.CircleGeometry(48, 24), this.groundMat);
    gnd.rotation.x = -Math.PI / 2;
    gnd.position.y = -2;
    this.envScene.add(gnd);
    this.envRT = null;
    this.envTimer = 0;
    this.lastEnvKey = '';

    this.weather = { cloud: 0.3, rain: 0, fog: 0, snow: 0 };
    this.sunDir = this.uniforms.uSunDir.value;
    this.light = { sunInt: 0, night: 0, elev: 0 };
    this.tmpA = new THREE.Color();
    this.tmpB = new THREE.Color();
  }

  // horas (0..24) -> direção do sol
  computeSun(hours, out) {
    const a = ((hours - 6) / 12) * Math.PI;
    out.set(Math.cos(a), Math.sin(a) * 0.9, 0.42).normalize();
    return out;
  }

  update(hours, dt, camPos, followPos, groundColor) {
    this.hours = hours;
    const U = this.uniforms;
    U.uTime.value += dt;
    this.computeSun(hours, U.uSunDir.value);
    const sd = U.uSunDir.value;
    U.uMoonDir.value.set(-sd.x * 0.9, -sd.y, -sd.z + 0.3).normalize();
    const elev = (Math.asin(clamp(sd.y, -1, 1)) * 180) / Math.PI;
    this.light.elev = elev;
    // interpola as cores
    let i = 0;
    while (i < KC.length - 2 && elev > KC[i + 1].e) i++;
    const k0 = KC[i];
    const k1 = KC[i + 1];
    const t = clamp((elev - k0.e) / (k1.e - k0.e), 0, 1);
    const W = this.weather;
    const grey = W.cloud * 0.75 + W.rain * 0.25;
    const night = 1 - smoothstep(-10, 2, elev);
    U.uNight.value = night;
    const zen = U.uZenith.value.copy(k0.zen).lerp(k1.zen, t);
    const hor = U.uHorizon.value.copy(k0.hor).lerp(k1.hor, t);
    const sunC = U.uSunCol.value.copy(k0.sun).lerp(k1.sun, t);
    // tempo nublado: céu acinzentado
    const lum = (zen.r + zen.g + zen.b) / 3;
    const hl = (hor.r + hor.g + hor.b) / 3;
    zen.lerp(this.tmpA.setRGB(lum, lum, lum * 1.05), grey * 0.8);
    hor.lerp(this.tmpA.setRGB(hl, hl, hl * 1.03), grey * 0.75);
    U.uSunVis.value = (1 - smoothstep(0.6, 1, grey)) * smoothstep(-4, 1, elev);
    U.uCloud.value = W.cloud;
    U.uCloudLit.value.copy(k0.cl).lerp(k1.cl, t).lerp(this.tmpA.setRGB(hl * 0.9, hl * 0.9, hl * 0.95), grey * 0.6);
    U.uCloudShade.value.copy(k0.cs).lerp(k1.cs, t).multiplyScalar(1 - W.rain * 0.45);
    if (groundColor) U.uGround.value.copy(groundColor).multiplyScalar(0.5 * (1 - night * 0.9) + 0.02);

    // neblina com a cor do horizonte
    const fog = this.scene.fog;
    fog.color.copy(hor).lerp(zen, 0.18);
    const fd = this.Q.fogBase * (1 + W.fog * 7 + W.rain * 3 + W.snow * 5 + grey * 0.8);
    fog.density = fd;
    U.uFogCol.value.copy(fog.color);
    U.uHaze.value = clamp(0.35 + W.fog * 0.6 + W.rain * 0.5, 0, 1);

    // sol / lua
    const sunInt = smoothstep(-3, 10, elev) * 3.1 * (1 - grey * 0.62);
    const moonInt = night * 0.22 * (1 - W.cloud * 0.6);
    this.light.sunInt = sunInt;
    this.light.night = night;
    const sun = this.sun;
    const dir = elev > -3 ? sd : U.uMoonDir.value;
    if (elev > -3) sun.color.copy(sunC);
    else sun.color.setRGB(0.5, 0.6, 0.85);
    sun.intensity = Math.max(sunInt, moonInt);
    const fp = followPos || camPos;
    sun.target.position.copy(fp);
    sun.position.copy(fp).addScaledVector(dir, 400);
    // estabiliza a sombra (evita tremulação) arredondando ao tamanho do texel
    if (sun.castShadow) {
      const tex = (this.Q.shadowRange * 2) / this.Q.shadows;
      sun.target.position.x = Math.round(sun.target.position.x / tex) * tex;
      sun.target.position.z = Math.round(sun.target.position.z / tex) * tex;
      sun.position.copy(sun.target.position).addScaledVector(dir, 400);
    }
    this.hemi.color.copy(zen).lerp(hor, 0.4).multiplyScalar(1.2);
    this.hemi.groundColor.copy(U.uGround.value).multiplyScalar(1.5);
    this.hemi.intensity = 0.25 + 0.35 * (1 - night) + 0.25 * grey;
    this.scene.environmentIntensity = lerp(0.12, 1.0, smoothstep(-8, 8, elev)) * (1 - grey * 0.25);

    this.mesh.position.copy(camPos);
    this.mesh.scale.setScalar(1);

    // atualiza o mapa de ambiente de vez em quando
    this.envTimer -= dt;
    const key = `${Math.round(elev * 1.5)}|${Math.round(W.cloud * 10)}|${Math.round(W.rain * 5)}`;
    if (!this.envRT || (this.envTimer <= 0 && key !== this.lastEnvKey)) {
      this.lastEnvKey = key;
      this.envTimer = 1.0;
      this.updateEnv();
    }
  }

  updateEnv() {
    const U = this.uniforms;
    const alpha = U.uCloudAlpha.value;
    this.groundMat.color.copy(U.uGround.value);
    const old = this.envRT;
    this.envRT = this.pmrem.fromScene(this.envScene, 0.02, 0.1, 200);
    this.scene.environment = this.envRT.texture;
    if (old) old.dispose();
    U.uCloudAlpha.value = alpha;
  }

  // exposição sugerida (noite um pouco mais clara para enxergar)
  get exposure() {
    const n = this.light.night;
    return lerp(0.95, 1.6, n);
  }
}
