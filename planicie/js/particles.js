// Partículas: detritos finos girando em volta do tornado (calculados no shader)
// e chuva em volta da câmera quando o jogador entra no núcleo de precipitação.
import * as THREE from 'three';
import { U, COMMON_GLSL } from './atmo.js';

const swirlVert = /* glsl */ `
${COMMON_GLSL}
uniform vec2 uTB;
uniform vec2 uTilt;
uniform float uWobble;
uniform float uRBot;
uniform float uDust;
uniform float uRotV;
uniform float uScale;
attribute vec4 aSeed;
varying float vA;
varying vec3 vW;
void main() {
  float Hmax = 60.0 + 380.0 * uDust * clamp(uRBot / 200.0, 0.3, 1.0);
  float up = 6.0 + uRotV * 0.25;
  float life = Hmax / up;
  float ph = fract(aSeed.z + uTime / life);
  float y = ph * ph * Hmax;
  float rad = (uRBot * 0.8 + 10.0) * (0.5 + aSeed.x * 0.8) * (1.0 + 0.8 * ph);
  float ang = aSeed.y * 6.2832 + uTorSpin * uTime * uRotV / max(rad, 5.0) * 0.8;
  float h = y / uCloudBase;
  vec2 c = uTB + uTilt * pow(h, 1.5) + uWobble * sin(h * 3.1416) * vec2(sin(h * 6.0 + uTime * 0.5), cos(h * 5.0 + uTime * 0.43));
  vec3 p = vec3(c.x + cos(ang) * rad, y + 0.3, c.y + sin(ang) * rad);
  vW = p;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = (0.15 + aSeed.w * 0.6) * (aSeed.w > 0.95 ? 3.0 : 1.0);
  float px = size * uScale / -mv.z;
  gl_PointSize = clamp(px, 1.0, 24.0);
  // pontos menores que um pixel somem aos poucos (evita "revoada" de pontos ao longe)
  vA = uDust * smoothstep(0.0, 0.08, ph) * (1.0 - smoothstep(0.75, 1.0, ph)) * smoothstep(0.4, 1.6, px);
  if (vA < 0.01) gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
}
`;

const swirlFrag = /* glsl */ `
${COMMON_GLSL}
varying float vA;
varying vec3 vW;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  if (dot(q, q) > 0.25) discard;
  vec3 col = vec3(0.16, 0.13, 0.1) * (uAmb * 2.0);
  vec3 d = vW - uCam;
  float l = length(d);
  col = applyFog(col, uCam, d / l, l);
  gl_FragColor = vec4(col, vA);
}
`;

export class Particles {
  constructor(scene, quality) {
    const n = quality.debrisParticles;
    const g = new THREE.BufferGeometry();
    const seeds = new Float32Array(n * 4);
    for (let i = 0; i < n * 4; i++) seeds[i] = Math.random();
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.swirlMat = new THREE.ShaderMaterial({
      vertexShader: swirlVert,
      fragmentShader: swirlFrag,
      uniforms: {
        ...U,
        uTB: { value: new THREE.Vector2() },
        uTilt: { value: new THREE.Vector2() },
        uWobble: { value: 0 },
        uRBot: { value: 50 },
        uDust: { value: 0 },
        uRotV: { value: 30 },
        uScale: { value: 600 },
      },
      transparent: true,
      depthWrite: false,
    });
    this.swirl = new THREE.Points(g, this.swirlMat);
    this.swirl.frustumCulled = false;
    scene.add(this.swirl);

    // chuva perto da câmera
    const rn = quality.rain;
    this.rainN = rn;
    this.rainPos = new Float32Array(rn * 6);
    this.drops = [];
    for (let i = 0; i < rn; i++) this.drops.push(new THREE.Vector3((Math.random() - 0.5) * 60, Math.random() * 30, (Math.random() - 0.5) * 60));
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rainMat = new THREE.LineBasicMaterial({ color: 0x9aa3ad, transparent: true, opacity: 0, depthWrite: false });
    this.rain = new THREE.LineSegments(rg, this.rainMat);
    this.rain.frustumCulled = false;
    scene.add(this.rain);
    this.rainAmt = 0;
  }

  update(dt, vol, camPos, wind, height) {
    const u = this.swirlMat.uniforms;
    const v = vol.uniforms;
    u.uTB.value.copy(v.uTB.value);
    u.uTilt.value.copy(v.uTilt.value);
    u.uWobble.value = v.uWobble.value;
    u.uRBot.value = v.uRBot.value;
    u.uDust.value = v.uDust.value * v.uFunnelOn.value;
    u.uRotV.value = v.uRotV.value;
    u.uScale.value = height * 0.9;

    // intensidade de chuva no ponto da câmera
    const rp = v.uRainPos.value;
    const dR = Math.hypot(camPos.x - rp.x, camPos.z - rp.y) / v.uRainR.value;
    let amt = THREE.MathUtils.clamp(1.15 - dR, 0, 1);
    if (v.uRainWrap.value > 0.01) {
      const dW = Math.hypot(camPos.x - v.uTB.value.x - 260, camPos.z - v.uTB.value.y - 160) / (v.uRBot.value * 2 + 650);
      amt = Math.max(amt, THREE.MathUtils.clamp(1.1 - dW, 0, 1) * v.uRainWrap.value);
    }
    this.rainAmt += (amt - this.rainAmt) * Math.min(1, dt * 0.8);
    this.rainMat.opacity = this.rainAmt * 0.35;
    this.rain.visible = this.rainAmt > 0.02;
    if (!this.rain.visible) return;
    const fall = 9;
    const arr = this.rainPos;
    const sx = wind.x * 0.06, sz = wind.z * 0.06;
    const active = Math.floor(this.rainN * this.rainAmt);
    for (let i = 0; i < this.rainN; i++) {
      const d = this.drops[i];
      d.y -= fall * dt;
      d.x += wind.x * dt * 0.5;
      d.z += wind.z * dt * 0.5;
      if (d.y < 0) d.y += 30;
      // mantém as gotas numa caixa ao redor da câmera
      d.x = ((d.x + 30) % 60 + 60) % 60 - 30;
      d.z = ((d.z + 30) % 60 + 60) % 60 - 30;
      const o = i * 6;
      if (i >= active) {
        arr.fill(0, o, o + 6);
        continue;
      }
      const x = camPos.x + d.x, y = camPos.y - 12 + d.y, z = camPos.z + d.z;
      arr[o] = x; arr[o + 1] = y; arr[o + 2] = z;
      arr[o + 3] = x - sx; arr[o + 4] = y + 0.9; arr[o + 5] = z - sz;
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
  }
}
