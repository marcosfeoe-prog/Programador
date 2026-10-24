// Céu procedural com ciclo de dia e noite: degradê atmosférico, sol, lua, nuvens,
// estrelas, e a iluminação/névoa da cena acompanhando a hora do dia.
import * as THREE from 'three';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// cores-chave ao longo do dia (zênite, horizonte, luz do sol, ambiente)
const KEYS = [
  { e: -0.35, zen: 0x02040a, hor: 0x070b14, sun: 0x000000, amb: 0x0d1424, gnd: 0x05060a },
  { e: -0.1, zen: 0x0a1224, hor: 0x2a2a3e, sun: 0x000000, amb: 0x1a2236, gnd: 0x0a0a0e },
  { e: 0.0, zen: 0x24406e, hor: 0xd4784a, sun: 0xff7a3a, amb: 0x5a5a70, gnd: 0x2a2018 },
  { e: 0.12, zen: 0x3a6cae, hor: 0xe8b27c, sun: 0xffc48a, amb: 0x8898b0, gnd: 0x4a3c2a },
  { e: 0.35, zen: 0x3f7fd0, hor: 0xb8d4ec, sun: 0xfff0dc, amb: 0xa8c0dc, gnd: 0x5a5038 },
  { e: 1.0, zen: 0x2f6fc8, hor: 0xb4d2ee, sun: 0xffffff, amb: 0xb0c8e6, gnd: 0x5e5640 },
];
const _c1 = new THREE.Color();
const _c2 = new THREE.Color();

function keyColor(e, field, out) {
  let a = KEYS[0];
  let b = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (e >= KEYS[i].e && e <= KEYS[i + 1].e) {
      a = KEYS[i];
      b = KEYS[i + 1];
      break;
    }
  }
  if (e < KEYS[0].e) b = a;
  const t = b === a ? 0 : clamp((e - a.e) / (b.e - a.e), 0, 1);
  _c1.setHex(a[field]);
  _c2.setHex(b[field]);
  return out.copy(_c1).lerp(_c2, t);
}

const SKY_VS = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
  vec4 p = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0);
  gl_Position = p.xyww;
}`;
const SKY_FS = /* glsl */ `
uniform vec3 uZenith, uHorizon, uSunDir, uSunColor, uMoonDir;
uniform float uTime, uNight, uCloud, uSunVis;
varying vec3 vDir;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * vn(p); p = p * 2.07 + 3.1; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  float hy = max(y, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(hy, 0.55));
  // abaixo do horizonte: tom do horizonte escurecido
  col = mix(col, uHorizon * 0.55, smoothstep(0.0, -0.25, y));
  float sd = max(dot(d, uSunDir), 0.0);
  // brilho em volta do sol (Mie)
  col += uSunColor * (pow(sd, 8.0) * 0.35 + pow(sd, 64.0) * 0.6) * uSunVis;
  col += uSunColor * smoothstep(0.9993, 0.9997, sd) * 6.0 * uSunVis;
  // nuvens: plano projetado
  if (y > 0.0) {
    vec2 uv = d.xz / (y + 0.08) * 1.4 + vec2(uTime * 0.004, uTime * 0.0015);
    float c = fbm(uv);
    float cov = smoothstep(0.62 - uCloud * 0.25, 0.95, c);
    float lit = 0.6 + 0.4 * clamp(dot(normalize(vec3(uSunDir.x, 0.4, uSunDir.z)), vec3(0, 1, 0)), 0.0, 1.0);
    vec3 cc = mix(uHorizon * 1.05, vec3(1.0), 0.55) * lit;
    cc = mix(cc, uSunColor * 1.2 + uHorizon * 0.3, pow(sd, 6.0) * 0.6 * uSunVis);
    cc *= mix(1.0, 0.12, uNight);
    col = mix(col, cc, cov * smoothstep(0.0, 0.15, y) * 0.92);
    // estrelas
    if (uNight > 0.01) {
      vec2 sp = d.xz / (y + 1.0) * 380.0;
      float st = step(0.9965, h21(floor(sp))) * h21(floor(sp) + 7.0);
      float tw = 0.6 + 0.4 * sin(uTime * 3.0 + h21(floor(sp)) * 40.0);
      col += vec3(st * tw) * uNight * (1.0 - cov) * smoothstep(0.02, 0.25, y);
      // lua
      float md = max(dot(d, uMoonDir), 0.0);
      col += vec3(0.9, 0.93, 1.0) * smoothstep(0.99955, 0.9998, md) * 1.6 * uNight;
      col += vec3(0.25, 0.3, 0.45) * pow(md, 30.0) * 0.4 * uNight;
    }
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Sky {
  constructor(scene, quality) {
    this.scene = scene;
    this.uniforms = {
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
      uSunColor: { value: new THREE.Color() },
      uTime: { value: 0 },
      uNight: { value: 0 },
      uCloud: { value: 0.4 },
      uSunVis: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: SKY_VS,
      fragmentShader: SKY_FS,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    scene.add(this.mesh);

    // luzes
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = quality !== 'low';
    const sm = { low: 1024, medium: 1536, high: 2048, ultra: 4096 }[quality] || 2048;
    this.sun.shadow.mapSize.set(sm, sm);
    this.shadowRange = quality === 'ultra' ? 110 : 85;
    const sc = this.sun.shadow.camera;
    sc.left = -this.shadowRange;
    sc.right = this.shadowRange;
    sc.top = this.shadowRange;
    sc.bottom = -this.shadowRange;
    sc.near = 1;
    sc.far = 900;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xb0c8e6, 0x5e5640, 1.2);
    scene.add(this.hemi);
    this.fog = new THREE.FogExp2(0xb4d2ee, 0.0004);
    scene.fog = this.fog;
    this.hour = 8;
    this.sunDir = new THREE.Vector3();
    this.night = 0;
    this.daylight = 1;
    this.fogBoost = 0;
  }

  // dia de 24 h; sol nasce às 6h a leste (+x) e se põe às 18h a oeste
  setHour(h) {
    this.hour = ((h % 24) + 24) % 24;
  }

  update(dt, camPos, renderer) {
    const u = this.uniforms;
    u.uTime.value += dt;
    const a = ((this.hour - 6) / 12) * Math.PI;
    const tilt = 0.5;
    const sd = this.sunDir.set(Math.cos(a), Math.sin(a) * Math.cos(tilt), Math.sin(a) * Math.sin(tilt)).normalize();
    u.uSunDir.value.copy(sd);
    u.uMoonDir.value.set(-sd.x, -sd.y, -sd.z * 0.6 + 0.2).normalize();
    const e = sd.y;
    keyColor(e, 'zen', u.uZenith.value);
    keyColor(e, 'hor', u.uHorizon.value);
    keyColor(e, 'sun', u.uSunColor.value);
    u.uSunVis.value = smooth(-0.06, 0.02, e);
    const night = smooth(0.02, -0.16, e);
    this.night = night;
    u.uNight.value = night;
    this.daylight = smooth(-0.08, 0.25, e);

    // sol ou lua iluminam a cena
    const moon = u.uMoonDir.value;
    const useMoon = e < -0.04;
    const ld = useMoon ? moon : sd;
    this.sun.position.copy(camPos).addScaledVector(ld, 400);
    this.sun.target.position.copy(camPos);
    // encaixa a câmera de sombra na grade de texels (evita tremulação)
    const texel = (2 * this.shadowRange) / this.sun.shadow.mapSize.x;
    this.sun.target.position.x = Math.round(this.sun.target.position.x / texel) * texel;
    this.sun.target.position.z = Math.round(this.sun.target.position.z / texel) * texel;
    this.sun.position.x = this.sun.target.position.x + ld.x * 400;
    this.sun.position.z = this.sun.target.position.z + ld.z * 400;
    if (useMoon) {
      this.sun.color.setRGB(0.55, 0.65, 0.95);
      this.sun.intensity = 0.32 * smooth(-0.02, 0.25, moon.y);
    } else {
      this.sun.color.copy(u.uSunColor.value);
      this.sun.intensity = 3.2 * smooth(-0.03, 0.12, e);
    }
    keyColor(e, 'amb', this.hemi.color);
    keyColor(e, 'gnd', this.hemi.groundColor);
    this.hemi.intensity = 0.55 + 0.75 * this.daylight + night * 0.45;
    // névoa da cor do horizonte (mais densa ao amanhecer/à noite)
    this.fog.color.copy(u.uHorizon.value).lerp(u.uZenith.value, 0.15);
    const dawn = Math.exp(-Math.pow((this.hour - 6.3) / 1.2, 2));
    this.fog.density = 0.00032 + dawn * 0.0006 + night * 0.00035 + this.fogBoost;
    if (renderer) renderer.toneMappingExposure = 0.9 + night * 0.6;
  }
}
