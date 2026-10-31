// Céu (gradiente, sol, nuvens procedurais, estrelas, relâmpago) e
// precipitação (chuva em riscos e neve em flocos) animadas na GPU.
import * as THREE from 'three';

const skyVS = `
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const skyFS = `
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uCloudLit;
uniform vec3 uCloudDark;
uniform float uCloud;
uniform float uTime;
uniform float uNight;
uniform float uFlash;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { s += noise(p) * a; p *= 2.03; a *= 0.5; }
  return s;
}
void main() {
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.45));
  if (d.y < 0.0) col = mix(uHorizon, uGround, min(1.0, -d.y * 5.0));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunCol * (pow(sd, 900.0) * 10.0 + pow(sd, 10.0) * 0.22) * (1.0 - uCloud * 0.9) * (1.0 - uNight);
  if (d.y > 0.0) {
    vec2 p = d.xz / (d.y + 0.1) * 1.4 + vec2(uTime * 0.006, uTime * 0.002);
    float n = fbm(p);
    float cov = smoothstep(0.62 - uCloud * 0.5, 0.95 - uCloud * 0.35, n + uCloud * 0.12);
    float lit = clamp(dot(normalize(vec3(d.x, 0.4, d.z)), uSunDir) * 0.5 + 0.5, 0.0, 1.0);
    vec3 cc = mix(uCloudDark, uCloudLit, lit * (1.0 - uCloud * 0.6));
    col = mix(col, cc, cov * smoothstep(0.0, 0.12, d.y));
    if (uNight > 0.5) {
      float s = step(0.9975, hash(floor(d.xz / (d.y + 0.25) * 260.0)));
      col += s * (1.0 - cov) * (1.0 - uCloud) * 0.9;
    }
  }
  col += uFlash * vec3(0.75, 0.8, 1.0) * (0.4 + 0.6 * h);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Sky {
  constructor(scene) {
    this.uniforms = {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunCol: { value: new THREE.Color(1, 0.95, 0.85) },
      uZenith: { value: new THREE.Color('#2f6fb8') },
      uHorizon: { value: new THREE.Color('#a9c9e6') },
      uGround: { value: new THREE.Color('#3a4030') },
      uCloudLit: { value: new THREE.Color('#ffffff') },
      uCloudDark: { value: new THREE.Color('#8a919c') },
      uCloud: { value: 0.2 },
      uTime: { value: 0 },
      uNight: { value: 0 },
      uFlash: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: skyVS, fragmentShader: skyFS, uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), mat);
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

const rainVS = `
attribute vec3 aOff;
attribute float aEnd;
uniform float uTime;
uniform vec3 uCenter;
uniform vec3 uBox;
uniform vec3 uVel;
uniform float uLen;
#include <fog_pars_vertex>
void main() {
  vec3 p = fract(aOff + uVel * uTime / uBox) * uBox - uBox * 0.5 + uCenter;
  p -= normalize(uVel) * uLen * aEnd;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const rainFS = `
uniform vec3 uColor;
uniform float uAlpha;
#include <fog_pars_fragment>
void main() {
  gl_FragColor = vec4(uColor, uAlpha);
  #include <fog_fragment>
}`;
const snowVS = `
attribute vec3 aOff;
uniform float uTime;
uniform vec3 uCenter;
uniform vec3 uBox;
uniform vec3 uVel;
uniform float uSize;
#include <fog_pars_vertex>
void main() {
  vec3 p = fract(aOff + uVel * uTime / uBox) * uBox - uBox * 0.5 + uCenter;
  p.x += sin(uTime * 0.9 + aOff.y * 40.0) * 0.6;
  p.z += cos(uTime * 0.7 + aOff.x * 40.0) * 0.6;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = uSize / -mvPosition.z;
  #include <fog_vertex>
}`;
const snowFS = `
uniform float uAlpha;
#include <fog_pars_fragment>
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  gl_FragColor = vec4(vec3(1.0), uAlpha * (1.0 - d * 1.6));
  #include <fog_fragment>
}`;

export class Precip {
  constructor(scene, kind, count, env) {
    this.kind = kind;
    const off = new Float32Array(count * (kind === 'rain' ? 6 : 3));
    const end = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const a = Math.random();
      const b = Math.random();
      const c = Math.random();
      if (kind === 'rain') {
        off.set([a, b, c, a, b, c], i * 6);
        end[i * 2] = 0;
        end[i * 2 + 1] = 1;
      } else off.set([a, b, c], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('aOff', new THREE.BufferAttribute(off, 3));
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(off.length), 3));
    const wind = new THREE.Vector3(env.windX, 0, env.windZ);
    this.uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uCenter: { value: new THREE.Vector3() },
        uBox: { value: new THREE.Vector3(70, 40, 70) },
        uVel: { value: kind === 'rain' ? new THREE.Vector3(wind.x * 0.8, -10 - env.rain * 3, wind.z * 0.8) : new THREE.Vector3(wind.x * 0.5, -1.2, wind.z * 0.5) },
        uLen: { value: 0.55 + env.rain * 0.4 },
        uColor: { value: new THREE.Color(0.75, 0.8, 0.88) },
        uAlpha: { value: kind === 'rain' ? 0.32 + env.rain * 0.2 : 0.9 },
        uSize: { value: 220 },
      },
    ]);
    let mat;
    if (kind === 'rain') {
      g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
      mat = new THREE.ShaderMaterial({ vertexShader: rainVS, fragmentShader: rainFS, uniforms: this.uniforms, transparent: true, depthWrite: false, fog: true });
      this.obj = new THREE.LineSegments(g, mat);
    } else {
      mat = new THREE.ShaderMaterial({ vertexShader: snowVS, fragmentShader: snowFS, uniforms: this.uniforms, transparent: true, depthWrite: false, fog: true });
      this.obj = new THREE.Points(g, mat);
    }
    this.obj.frustumCulled = false;
    scene.add(this.obj);
  }
  update(t, center) {
    this.uniforms.uTime.value = t;
    this.uniforms.uCenter.value.copy(center);
  }
  dispose() {
    this.obj.geometry.dispose();
    this.obj.material.dispose();
    this.obj.parent && this.obj.parent.remove(this.obj);
  }
}
