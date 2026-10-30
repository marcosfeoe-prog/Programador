// Partículas (faíscas, poeira, fumaça, confete, chamas) e linhas de
// velocidade desenhadas num canvas 2D por cima do jogo.
import * as THREE from 'three';

const VS = `
attribute float size;
attribute float alpha;
attribute vec3 color;
varying float vA;
varying vec3 vC;
uniform float scale;
void main() {
  vA = alpha;
  vC = color;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = min(size * scale / max(0.5, -mv.z), 256.0);
  gl_Position = projectionMatrix * mv;
}`;
const FS = `
varying float vA;
varying vec3 vC;
uniform float square;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p);
  float a = square > 0.5 ? step(max(abs(p.x), abs(p.y)), 0.45) : smoothstep(0.5, 0.1, d);
  if (a * vA < 0.01) discard;
  gl_FragColor = vec4(vC, a * vA);
  #include <colorspace_fragment>
}`;

export class Particles {
  constructor(max, { additive = false, square = false } = {}) {
    this.max = max;
    this.n = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.life = new Float32Array(max);
    this.age = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.a0 = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      uniforms: { scale: { value: 400 }, square: { value: square ? 1 : 0 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.c = new THREE.Color();
  }

  // size das partículas em metros: escala = altura da tela em pixels / (2·tan(fov/2))
  setScale(h, fov = 62) {
    this.mat.uniforms.scale.value = h / (2 * Math.tan((fov * Math.PI) / 360));
  }

  emit(p, v, color, size, life, { drag = 1, grav = 0, grow = 0, alpha = 1 } = {}) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos[i * 3] = p.x;
    this.pos[i * 3 + 1] = p.y;
    this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x;
    this.vel[i * 3 + 1] = v.y;
    this.vel[i * 3 + 2] = v.z;
    this.c.set(color);
    this.col[i * 3] = this.c.r;
    this.col[i * 3 + 1] = this.c.g;
    this.col[i * 3 + 2] = this.c.b;
    this.size[i] = size;
    this.life[i] = life;
    this.age[i] = 0;
    this.drag[i] = drag;
    this.grav[i] = grav;
    this.grow[i] = grow;
    this.a0[i] = alpha;
    this.alpha[i] = alpha;
  }

  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        this.kill(i);
        continue;
      }
      const k = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= k;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const f = this.age[i] / this.life[i];
      this.alpha[i] = this.a0[i] * (1 - f * f);
      i++;
    }
    this.geo.setDrawRange(0, this.n);
    for (const k of ['position', 'color', 'size', 'alpha']) this.geo.attributes[k].needsUpdate = true;
  }

  kill(i) {
    const j = --this.n;
    if (i === j) return;
    for (const [arr, w] of [
      [this.pos, 3],
      [this.vel, 3],
      [this.col, 3],
    ])
      for (let k = 0; k < w; k++) arr[i * w + k] = arr[j * w + k];
    for (const arr of [this.size, this.alpha, this.life, this.age, this.grow, this.drag, this.grav, this.a0]) arr[i] = arr[j];
  }

  clear() {
    this.n = 0;
    this.geo.setDrawRange(0, 0);
  }
}

// Linhas de velocidade em volta da tela (canvas 2D).
export class SpeedLines {
  constructor(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.lines = [];
    for (let i = 0; i < 46; i++) this.lines.push({ a: Math.random() * Math.PI * 2, r: Math.random(), w: 1 + Math.random() * 2.5, sp: 0.6 + Math.random() });
    this.k = 0;
  }
  resize(w, h) {
    this.c.width = Math.round(w / 2);
    this.c.height = Math.round(h / 2);
  }
  update(dt, intensity) {
    const ctx = this.ctx;
    const W = this.c.width;
    const H = this.c.height;
    this.k += (intensity - this.k) * Math.min(1, dt * 5);
    ctx.clearRect(0, 0, W, H);
    if (this.k < 0.03) return;
    const cx = W / 2;
    const cy = H * 0.46;
    const R = Math.hypot(W, H) * 0.6;
    ctx.lineCap = 'round';
    for (const l of this.lines) {
      l.r += dt * l.sp * (1.5 + this.k * 2.5);
      if (l.r > 1) {
        l.r = 0.35 + Math.random() * 0.2;
        l.a = Math.random() * Math.PI * 2;
      }
      const r0 = R * l.r;
      const r1 = r0 + R * 0.12 * this.k;
      const ca = Math.cos(l.a);
      const sa = Math.sin(l.a);
      ctx.strokeStyle = `rgba(255,255,255,${0.5 * this.k * l.r})`;
      ctx.lineWidth = l.w;
      ctx.beginPath();
      ctx.moveTo(cx + ca * r0, cy + sa * r0);
      ctx.lineTo(cx + ca * r1, cy + sa * r1);
      ctx.stroke();
    }
  }
}
