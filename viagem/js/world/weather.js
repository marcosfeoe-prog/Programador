// Clima: escolhe o tempo conforme o país (sol, nublado, chuva, neve, neblina) e
// desenha partículas animadas na GPU em volta da câmera (chuva, neve e pétalas
// de cerejeira no Japão).
import * as THREE from 'three';
import { COUNTRIES } from './data.js';
import { RNG, clamp, damp } from '../util.js';

const VS = /* glsl */ `
uniform float uTime;
uniform vec3 uCam;
uniform vec3 uBox;
uniform float uSpeed;
uniform float uDrift;
uniform float uSize;
uniform vec3 uWind;
attribute vec4 aRnd;
varying float vA;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vec3 p = position;
  p.y -= uTime * uSpeed * (0.7 + aRnd.x * 0.6);
  p.x += sin(uTime * 0.7 + aRnd.y * 6.28) * uDrift + uWind.x * uTime;
  p.z += cos(uTime * 0.5 + aRnd.z * 6.28) * uDrift + uWind.z * uTime;
  vec3 rel = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5;
  vec4 mv = modelViewMatrix * vec4(uCam + rel, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = length(rel);
  vA = smoothstep(uBox.x * 0.5, uBox.x * 0.3, d) * smoothstep(0.5, 2.0, d);
  gl_PointSize = uSize * (0.6 + aRnd.w) * 300.0 / -mv.z;
  #include <logdepthbuf_vertex>
}`;

const FS = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uShape;
varying float vA;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec2 c = gl_PointCoord - 0.5;
  float a;
  if (uShape < 0.5) {
    // gota alongada
    a = smoothstep(0.08, 0.0, abs(c.x)) * smoothstep(0.5, 0.2, abs(c.y));
  } else if (uShape < 1.5) {
    a = smoothstep(0.5, 0.25, length(c));
  } else {
    // pétala
    vec2 q = vec2(c.x * 1.6, c.y);
    a = smoothstep(0.42, 0.3, length(q));
  }
  gl_FragColor = vec4(uColor, a * vA * uOpacity);
}`;

function particles(n, box, rng) {
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(n * 3);
  const r = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    p[i * 3] = rng.float(-box.x / 2, box.x / 2);
    p[i * 3 + 1] = rng.float(-box.y / 2, box.y / 2);
    p[i * 3 + 2] = rng.float(-box.z / 2, box.z / 2);
    for (let k = 0; k < 4; k++) r[i * 4 + k] = rng.next();
  }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('aRnd', new THREE.BufferAttribute(r, 4));
  return g;
}

export const WEATHER_NAMES = { clear: 'Céu limpo', cloudy: 'Nublado', rain: 'Chuva', snow: 'Neve', fog: 'Neblina' };
export const WEATHER_ICONS = { clear: '☀', cloudy: '☁', rain: '🌧', snow: '❄', fog: '🌫' };

export class Weather {
  constructor(scene, Q) {
    this.scene = scene;
    this.rng = new RNG(77);
    this.kind = 'clear';
    this.target = { cloud: 0.25, rain: 0, snow: 0, fog: 0 };
    this.cur = { cloud: 0.25, rain: 0, snow: 0, fog: 0, petals: 0 };
    this.timer = 0;
    this.mode = 'auto';
    const make = (n, box, shape, color, speed, drift, size, blending = THREE.NormalBlending) => {
      const u = {
        uTime: { value: 0 },
        uCam: { value: new THREE.Vector3() },
        uBox: { value: box },
        uSpeed: { value: speed },
        uDrift: { value: drift },
        uSize: { value: size },
        uWind: { value: new THREE.Vector3(0.6, 0, 0.3) },
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: 0 },
        uShape: { value: shape },
      };
      const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending });
      const pts = new THREE.Points(particles(n, box, this.rng), m);
      pts.frustumCulled = false;
      pts.visible = false;
      scene.add(pts);
      return pts;
    };
    const k = Q.shadows ? 1 : 0.5;
    this.rain = make(Math.round(9000 * k), new THREE.Vector3(50, 24, 50), 0, 0xaabbcc, 22, 0.1, 0.28);
    this.snow = make(Math.round(6000 * k), new THREE.Vector3(60, 30, 60), 1, 0xffffff, 1.6, 1.2, 0.16);
    this.petals = make(Math.round(1500 * k), new THREE.Vector3(60, 24, 60), 2, 0xf6c4d6, 0.8, 1.8, 0.22);
  }

  pick(country) {
    const C = COUNTRIES[country];
    const r = this.rng.next();
    let acc = 0;
    for (const [k, p] of Object.entries(C.weather)) {
      acc += p;
      if (r <= acc) return k;
    }
    return 'clear';
  }

  set(kind) {
    this.kind = kind;
    const T = { clear: [0.15, 0, 0, 0], cloudy: [0.75, 0, 0, 0.1], rain: [0.95, 1, 0, 0.35], snow: [0.9, 0, 1, 0.4], fog: [0.6, 0, 0, 1] }[kind] || [0.2, 0, 0, 0];
    this.target = { cloud: T[0], rain: T[1], snow: T[2], fog: T[3] };
  }

  update(dt, gameDt, cam, country, mode, petalsHere) {
    this.timer -= gameDt;
    if (mode !== this.mode) {
      this.mode = mode;
      this.timer = 0;
    }
    if (this.timer <= 0) {
      this.timer = 420 + this.rng.float(0, 600);
      if (mode === 'auto') this.set(this.pick(country));
      else this.set(mode);
    }
    // neve só onde é frio: chuva vira neve no alto das montanhas e vice-versa
    const c = this.cur;
    const T = this.target;
    for (const k of ['cloud', 'rain', 'snow', 'fog']) c[k] = damp(c[k], T[k], 0.08, dt);
    c.petals = damp(c.petals, petalsHere ? 1 : 0, 0.5, dt);
    const t = this.rain.material.uniforms.uTime.value + dt;
    for (const [p, v, op] of [
      [this.rain, c.rain, 0.55],
      [this.snow, c.snow, 0.9],
      [this.petals, c.petals * (1 - c.rain), 0.9],
    ]) {
      const u = p.material.uniforms;
      u.uTime.value = t;
      u.uCam.value.copy(cam);
      u.uOpacity.value = clamp(v, 0, 1) * op;
      p.visible = v > 0.02;
    }
    return c;
  }

  get wet() {
    return clamp(this.cur.rain * 1.2, 0, 1);
  }
}
