// Céu procedural (degradê atmosférico, sol, lua e estrelas), luzes e neblina
// acompanhando o ciclo de dia e noite.
import * as THREE from 'three';
import { clamp, lerp, smoothstep } from './util.js';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const FRAG = /* glsl */ `
uniform vec3 sunDir;
uniform vec3 moonDir;
uniform vec3 topCol;
uniform vec3 horCol;
uniform vec3 sunCol;
uniform float night;
uniform float cloudT;
varying vec3 vDir;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(vec3(i, 1.0)), b = hash(vec3(i + vec2(1, 0), 1.0));
  float c = hash(vec3(i + vec2(0, 1), 1.0)), d = hash(vec3(i + vec2(1, 1), 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return s;
}

void main() {
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 col = mix(horCol, topCol, pow(h, 0.55));
  // brilho perto do sol (espalhamento)
  float sd = max(dot(d, sunDir), 0.0);
  col += sunCol * (pow(sd, 8.0) * 0.35 + pow(sd, 64.0) * 0.6) * (1.0 - night);
  // disco do sol
  col += sunCol * smoothstep(0.9993, 0.9997, sd) * 18.0 * (1.0 - night);
  // lua
  float md = max(dot(d, moonDir), 0.0);
  col += vec3(0.85, 0.9, 1.0) * smoothstep(0.9994, 0.9997, md) * 2.5 * night;
  col += vec3(0.25, 0.3, 0.45) * pow(md, 30.0) * 0.25 * night;
  // estrelas
  if (night > 0.01 && d.y > 0.0) {
    vec3 g = floor(d * 380.0);
    float s = hash(g);
    float tw = 0.6 + 0.4 * sin(cloudT * 3.0 + s * 50.0);
    col += vec3(1.0) * step(0.9975, s) * night * h * 1.6 * tw;
  }
  // nuvens altas
  if (d.y > 0.0) {
    vec2 uv = d.xz / (d.y + 0.12) * 1.6 + vec2(cloudT * 0.01, cloudT * 0.004);
    float c = smoothstep(0.45, 0.85, fbm(uv));
    vec3 cc = mix(horCol * 1.15 + sunCol * 0.25, vec3(0.05, 0.06, 0.09), night * 0.85);
    col = mix(col, cc, c * 0.65 * smoothstep(0.0, 0.25, d.y));
  }
  // abaixo do horizonte
  col = mix(col, horCol * 0.8, smoothstep(0.0, -0.08, d.y));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const C = (h) => new THREE.Color(h);
const NIGHT_SKY = C(0x22304e);
const WHITE = C(0xffffff);
// paletas: [altura do sol, topo, horizonte]
const PAL = [
  [-0.3, C(0x03060d), C(0x0a1020)],
  [-0.08, C(0x0a1430), C(0x2a2440)],
  [0.0, C(0x2a3a66), C(0xe07a48)],
  [0.08, C(0x3c62a0), C(0xf0a66a)],
  [0.25, C(0x3f78c8), C(0xb9d2ea)],
  [1.0, C(0x2c64be), C(0xa8c8e8)],
];

function palette(h, outTop, outHor) {
  for (let i = 0; i < PAL.length - 1; i++) {
    const a = PAL[i];
    const b = PAL[i + 1];
    if (h <= b[0] || i === PAL.length - 2) {
      const t = clamp((h - a[0]) / (b[0] - a[0]), 0, 1);
      outTop.copy(a[1]).lerp(b[1], t);
      outHor.copy(a[2]).lerp(b[2], t);
      return;
    }
  }
}

export class Sky {
  constructor(scene, quality) {
    this.scene = scene;
    this.uniforms = {
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      moonDir: { value: new THREE.Vector3(0, -1, 0) },
      topCol: { value: new THREE.Color() },
      horCol: { value: new THREE.Color() },
      sunCol: { value: new THREE.Color(1, 0.9, 0.7) },
      night: { value: 0 },
      cloudT: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    scene.add(this.mesh);

    this.hemi = new THREE.HemisphereLight(0xbcd4ff, 0x4a4030, 0.9);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d8, 3);
    this.sun.castShadow = quality.shadows > 0;
    if (quality.shadows > 0) {
      this.sun.shadow.mapSize.set(quality.shadows, quality.shadows);
      const s = quality.shadowRange;
      const cam = this.sun.shadow.camera;
      cam.left = -s;
      cam.right = s;
      cam.top = s;
      cam.bottom = -s;
      cam.near = 1;
      cam.far = 400;
      this.sun.shadow.bias = -0.0004;
      this.sun.shadow.normalBias = 0.05;
    }
    scene.add(this.sun);
    scene.add(this.sun.target);
    scene.fog = new THREE.Fog(0xa8c8e8, 60, 420);
    this.fogFar = quality.fogFar;
    this.fogColor = new THREE.Color();
    this.night = 0;
    this.daylight = 1;
    this._dayHemi = new THREE.Color();
  }

  // hour em [0,24)
  update(hour, center, dt, weatherFog = 0) {
    const u = this.uniforms;
    u.cloudT.value += dt;
    const ang = ((hour - 6) / 24) * Math.PI * 2;
    const sunDir = u.sunDir.value.set(Math.cos(ang) * 0.85, Math.sin(ang), 0.45).normalize();
    // a lua fica sempre alta no céu à noite (boa luz para jogar)
    u.moonDir.value.set(-Math.cos(ang) * 0.6, 0.45 + 0.4 * Math.max(0, -Math.sin(ang)), -0.35).normalize();
    const h = sunDir.y;
    palette(h, u.topCol.value, u.horCol.value);
    const night = 1 - smoothstep(-0.12, 0.04, h);
    u.night.value = night;
    this.night = night;
    const warm = smoothstep(0.35, 0.02, h) * (1 - night);
    u.sunCol.value.setRGB(1, lerp(0.92, 0.55, warm), lerp(0.8, 0.3, warm));

    // luz direcional: sol de dia, lua à noite
    const day = smoothstep(-0.1, 0.14, h);
    this.daylight = day;
    const useSun = h > -0.02;
    const lightDir = useSun ? sunDir : u.moonDir.value;
    this.sun.position.copy(center).addScaledVector(lightDir, 150);
    this.sun.target.position.copy(center);
    if (this.sun.castShadow) {
      // estabiliza a sombra em texels
      const s = this.sun.shadow.camera.right * 2 / this.sun.shadow.mapSize.x;
      this.sun.target.position.x = Math.round(center.x / s) * s;
      this.sun.target.position.z = Math.round(center.z / s) * s;
      this.sun.position.x = this.sun.target.position.x + lightDir.x * 150;
      this.sun.position.z = this.sun.target.position.z + lightDir.z * 150;
    }
    this.sun.intensity = useSun ? 3.2 * smoothstep(-0.02, 0.14, h) : 0.9 * night;
    this.sun.color.setRGB(useSun ? 1 : 0.55, useSun ? lerp(0.95, 0.62, warm) : 0.68, useSun ? lerp(0.85, 0.38, warm) : 1);
    this.hemi.intensity = lerp(0.75, 1.0, day);
    this.hemi.color.copy(NIGHT_SKY).lerp(this._dayHemi.copy(u.topCol.value).lerp(WHITE, 0.4), day);
    this.hemi.groundColor.setRGB(lerp(0.06, 0.32, day), lerp(0.07, 0.28, day), lerp(0.1, 0.2, day));

    this.fogColor.copy(u.horCol.value).lerp(u.topCol.value, 0.25);
    this.scene.fog.color.copy(this.fogColor);
    const far = lerp(this.fogFar, this.fogFar * 0.45, night) * (1 - weatherFog * 0.6);
    this.scene.fog.far = far;
    this.scene.fog.near = far * 0.12;
    this.mesh.position.copy(center);
  }
}
