// Chuva e granizo em volta da câmera (desenhados por cima da composição, com teste de
// profundidade manual contra a cena) e poeira/palha soprada perto do tornado.

import * as THREE from 'three';

const RAIN_VERT = /* glsl */ `
attribute vec3 aOff;
attribute float aRand;
uniform vec3 uCam;
uniform float uTime;
uniform vec3 uWind;
uniform float uFall;
uniform float uBox;
uniform float uLen;
uniform float uSize;
varying float vA;
varying vec4 vClip;
void main() {
  // Posição da gota dentro de uma caixa que acompanha a câmera.
  vec3 p = aOff * uBox;
  float fall = uFall * (0.8 + aRand * 0.4);
  p.y -= uTime * fall;
  p.xz += uWind.xz * uTime * (0.8 + aRand * 0.4);
  p = mod(p - uCam + uBox * 0.5, uBox) + uCam - uBox * 0.5;
  vec3 vel = vec3(uWind.x, -fall, uWind.z);
  vec3 dir = normalize(vel);
  // Fita: position.x = lado (-1/1), position.y = 0 cabeça / 1 cauda.
  vec3 view = normalize(p - cameraPosition);
  vec3 side = normalize(cross(dir, view)) * uSize;
  vec3 wp = p + side * position.x - dir * position.y * uLen;
  vA = (0.35 + aRand * 0.65) * (1.0 - position.y * 0.6);
  vec4 clip = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  vClip = clip;
  gl_Position = clip;
}`;

const RAIN_FRAG = /* glsl */ `
uniform sampler2D tDepth;
uniform float uNear;
uniform float uFar;
uniform float uAmount;
uniform vec3 uColor;
varying float vA;
varying vec4 vClip;
float linZ(float d) { return (uNear * uFar) / (uFar - d * (uFar - uNear)); }
void main() {
  vec2 uv = vClip.xy / vClip.w * 0.5 + 0.5;
  float sceneZ = linZ(texture2D(tDepth, uv).x);
  float z = vClip.w;
  if (z > sceneZ) discard;
  float a = vA * uAmount * smoothstep(0.0, 1.5, z) * (1.0 - smoothstep(20.0, 60.0, z));
  gl_FragColor = vec4(uColor, a);
}`;

export class Precipitation {
  constructor(count) {
    this.count = count;
    const base = new THREE.InstancedBufferGeometry();
    base.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
    base.setIndex([0, 1, 2, 0, 2, 3]);
    const off = new Float32Array(count * 3);
    const rnd = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      off[i * 3] = Math.random() - 0.5;
      off[i * 3 + 1] = Math.random() - 0.5;
      off[i * 3 + 2] = Math.random() - 0.5;
      rnd[i] = Math.random();
    }
    base.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3));
    base.setAttribute('aRand', new THREE.InstancedBufferAttribute(rnd, 1));
    base.instanceCount = count;
    const mk = (color, len, size, fall, box) =>
      new THREE.ShaderMaterial({
        vertexShader: RAIN_VERT,
        fragmentShader: RAIN_FRAG,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          tDepth: { value: null },
          uNear: { value: 0.5 },
          uFar: { value: 1000 },
          uCam: { value: new THREE.Vector3() },
          uTime: { value: 0 },
          uWind: { value: new THREE.Vector3() },
          uFall: { value: fall },
          uBox: { value: box },
          uLen: { value: len },
          uSize: { value: size },
          uAmount: { value: 0 },
          uColor: { value: new THREE.Color(color) },
        },
      });
    this.rainMat = mk('#c8ced6', 0.9, 0.012, 9.5, 46);
    this.hailMat = mk('#f2f4f6', 0.12, 0.05, 18, 36);
    this.rain = new THREE.Mesh(base, this.rainMat);
    this.rain.frustumCulled = false;
    const hailGeo = base.clone();
    hailGeo.instanceCount = Math.floor(count * 0.35);
    this.hail = new THREE.Mesh(hailGeo, this.hailMat);
    this.hail.frustumCulled = false;
    this.group = new THREE.Group();
    this.group.add(this.rain, this.hail);
  }

  update(dt, camera, depthTex, rain, hail, wind, light) {
    for (const [m, amt] of [
      [this.rainMat, rain],
      [this.hailMat, hail],
    ]) {
      const u = m.uniforms;
      u.tDepth.value = depthTex;
      u.uNear.value = camera.near;
      u.uFar.value = camera.far;
      u.uCam.value.copy(camera.position);
      u.uTime.value += dt;
      u.uWind.value.set(wind.x * 0.6, 0, wind.z * 0.6);
      u.uAmount.value = amt;
      u.uColor.value.setRGB(light, light * 1.02, light * 1.06);
    }
    this.rain.visible = rain > 0.01;
    this.hail.visible = hail > 0.01;
  }
}
