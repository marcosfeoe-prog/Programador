// Efeitos visuais: partículas (sangue enferrujado, faíscas, poeira, fogo, fumaça, brasas),
// marcas de tiro e de sangue, cápsulas ejetadas, clarão do cano, luzes dinâmicas e tremor de tela.
import * as THREE from 'three';
import { tex } from './textures.js';
import { rand, clamp } from './util.js';

const VERT = `
attribute float size;
attribute vec4 color;
varying vec4 vColor;
varying float vFog;
uniform float scale;
uniform float fogDensity;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(size * scale / max(0.05, -mv.z), 0.0, 512.0);
  gl_Position = projectionMatrix * mv;
  vColor = color;
  float d = -mv.z;
  vFog = 1.0 - exp(-fogDensity * fogDensity * d * d);
}`;

const FRAG_ADD = `
varying vec4 vColor;
varying float vFog;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  float a = 1.0 - smoothstep(0.0, 1.0, r);
  a *= a;
  gl_FragColor = vec4(vColor.rgb * a * vColor.a * (1.0 - vFog), 1.0);
}`;

const FRAG_NORM = `
varying vec4 vColor;
varying float vFog;
uniform vec3 fogColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  float a = 1.0 - smoothstep(0.55, 1.0, r);
  if (a <= 0.0) discard;
  gl_FragColor = vec4(mix(vColor.rgb, fogColor, vFog), vColor.a * a);
}`;

class Particles {
  constructor(scene, cap, additive) {
    this.cap = cap;
    this.n = 0;
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 4);
    this.size = new Float32Array(cap);
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.max = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.s0 = new Float32Array(cap);
    this.s1 = new Float32Array(cap);
    this.a0 = new Float32Array(cap);
    this.ground = new Uint8Array(cap);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('color', this.aCol);
    g.setAttribute('size', this.aSize);
    g.setDrawRange(0, 0);
    this.uniforms = {
      scale: { value: 600 },
      fogDensity: { value: 0.04 },
      fogColor: { value: new THREE.Color(0x0c1016) },
    };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: additive ? FRAG_ADD : FRAG_NORM,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
    scene.add(this.points);
    this.geo = g;
    this.limit = cap;
  }

  spawn(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, grav = 0, drag = 0, groundStop = false) {
    if (this.n >= this.limit) return;
    const i = this.n++;
    const i3 = i * 3,
      i4 = i * 4;
    this.pos[i3] = x;
    this.pos[i3 + 1] = y;
    this.pos[i3 + 2] = z;
    this.vel[i3] = vx;
    this.vel[i3 + 1] = vy;
    this.vel[i3 + 2] = vz;
    this.col[i4] = r;
    this.col[i4 + 1] = g;
    this.col[i4 + 2] = b;
    this.col[i4 + 3] = a;
    this.a0[i] = a;
    this.life[i] = life;
    this.max[i] = life;
    this.s0[i] = s0;
    this.s1[i] = s1;
    this.size[i] = s0;
    this.grav[i] = grav;
    this.drag[i] = drag;
    this.ground[i] = groundStop ? 1 : 0;
  }

  kill(i) {
    const j = --this.n;
    if (i === j) return;
    const i3 = i * 3,
      j3 = j * 3,
      i4 = i * 4,
      j4 = j * 4;
    for (let k = 0; k < 3; k++) {
      this.pos[i3 + k] = this.pos[j3 + k];
      this.vel[i3 + k] = this.vel[j3 + k];
    }
    for (let k = 0; k < 4; k++) this.col[i4 + k] = this.col[j4 + k];
    this.life[i] = this.life[j];
    this.max[i] = this.max[j];
    this.s0[i] = this.s0[j];
    this.s1[i] = this.s1[j];
    this.size[i] = this.size[j];
    this.grav[i] = this.grav[j];
    this.drag[i] = this.drag[j];
    this.a0[i] = this.a0[j];
    this.ground[i] = this.ground[j];
  }

  update(dt) {
    for (let i = this.n - 1; i >= 0; i--) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.kill(i);
        continue;
      }
      const i3 = i * 3;
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= dr;
      this.vel[i3 + 2] *= dr;
      this.vel[i3 + 1] = this.vel[i3 + 1] * dr - this.grav[i] * dt;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.ground[i] && this.pos[i3 + 1] < 0.02) {
        this.pos[i3 + 1] = 0.02;
        this.vel[i3] = this.vel[i3 + 1] = this.vel[i3 + 2] = 0;
      }
      const t = 1 - this.life[i] / this.max[i];
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      // some no final da vida
      const fade = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      this.col[i * 4 + 3] = this.a0[i] * fade;
    }
    this.geo.setDrawRange(0, this.n);
    if (this.n > 0) {
      this.aPos.needsUpdate = true;
      this.aCol.needsUpdate = true;
      this.aSize.needsUpdate = true;
    }
  }

  clear() {
    this.n = 0;
    this.geo.setDrawRange(0, 0);
  }
}

// Marcas (buracos de bala, sangue no chão) reaproveitadas em fila circular.
class DecalPool {
  constructor(scene, count, material, size) {
    this.list = [];
    this.i = 0;
    const geo = new THREE.PlaneGeometry(size, size);
    for (let k = 0; k < count; k++) {
      const m = new THREE.Mesh(geo, material);
      m.visible = false;
      m.renderOrder = 1;
      m.matrixAutoUpdate = true;
      scene.add(m);
      this.list.push(m);
    }
  }
  place(x, y, z, nx, ny, nz, scale = 1) {
    const m = this.list[this.i];
    this.i = (this.i + 1) % this.list.length;
    m.position.set(x + nx * 0.012, y + ny * 0.012, z + nz * 0.012);
    m.lookAt(x + nx, y + ny, z + nz);
    m.rotateZ(Math.random() * Math.PI * 2);
    m.scale.setScalar(scale);
    m.visible = true;
    return m;
  }
  clear() {
    for (const m of this.list) m.visible = false;
  }
}

// Pool de luzes pontuais: só as fontes mais próximas do jogador acendem uma luz de verdade.
class LightPool {
  constructor(scene, count) {
    this.scene = scene;
    this.lights = [];
    this.sources = [];
    this.setCount(count);
    this._cand = [];
  }
  setCount(n) {
    while (this.lights.length > n) {
      const l = this.lights.pop();
      if (l.userData.src) l.userData.src.light = null;
      this.scene.remove(l);
    }
    while (this.lights.length < n) {
      const l = new THREE.PointLight(0xff9040, 0, 12, 2);
      l.castShadow = false;
      l.userData.src = null;
      l.userData.fade = 0;
      this.scene.add(l);
      this.lights.push(l);
    }
  }
  add(src) {
    // src: {x,y,z,color,intensity,range,flicker,priority,life?}
    src.phase = Math.random() * 100;
    src.light = null;
    src.on = src.on ?? true;
    this.sources.push(src);
    return src;
  }
  remove(src) {
    const i = this.sources.indexOf(src);
    if (i >= 0) this.sources.splice(i, 1);
    if (src.light) {
      src.light.userData.src = null;
      src.light = null;
    }
  }
  update(dt, px, pz, time) {
    // remove fontes temporárias vencidas
    for (let i = this.sources.length - 1; i >= 0; i--) {
      const s = this.sources[i];
      if (s.life !== undefined) {
        s.life -= dt;
        if (s.life <= 0) this.remove(s);
      }
    }
    const cand = this._cand;
    cand.length = 0;
    for (const s of this.sources) {
      if (!s.on) continue;
      const dx = s.x - px,
        dz = s.z - pz;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > (s.maxDist || 42)) continue;
      s._score = d - (s.priority || 0);
      cand.push(s);
    }
    cand.sort((a, b) => a._score - b._score);
    const N = this.lights.length;
    const chosen = cand.length > N ? cand.slice(0, N) : cand;
    for (const l of this.lights) {
      const s = l.userData.src;
      if (s && (chosen.indexOf(s) < 0 || !s.on)) {
        s.light = null;
        l.userData.src = null;
      }
    }
    for (const s of chosen) {
      if (s.light) continue;
      const free = this.lights.find((l) => !l.userData.src);
      if (!free) break;
      free.userData.src = s;
      free.userData.fade = s.instant ? 1 : 0;
      s.light = free;
    }
    for (const l of this.lights) {
      const s = l.userData.src;
      if (!s) {
        l.intensity = 0;
        continue;
      }
      l.userData.fade = Math.min(1, l.userData.fade + dt * 3);
      let f = 1;
      if (s.flicker) {
        const t = time * 1 + s.phase;
        f = 1 + s.flicker * (Math.sin(t * 13.1) * 0.45 + Math.sin(t * 27.7) * 0.3 + Math.sin(t * 6.3) * 0.25);
      }
      let k = 1;
      if (s.life !== undefined && s.maxLife) k = clamp(s.life / s.maxLife, 0, 1);
      l.position.set(s.x, s.y, s.z);
      l.color.setHex(s.color);
      l.distance = s.range;
      l.intensity = s.intensity * f * k * l.userData.fade;
    }
  }
  clearTemp() {
    for (let i = this.sources.length - 1; i >= 0; i--) if (this.sources[i].temp) this.remove(this.sources[i]);
  }

  // Troca de capítulo: apaga todas as fontes de luz.
  clearAll() {
    for (const s of this.sources) s.light = null;
    this.sources = [];
    for (const l of this.lights) {
      l.userData.src = null;
      l.intensity = 0;
    }
  }
}

export class Effects {
  constructor(G) {
    this.G = G;
    const scene = G.scene;
    this.scene = scene;
    this.add = new Particles(scene, 2400, true);
    this.norm = new Particles(scene, 2000, false);
    const holeMat = new THREE.MeshBasicMaterial({ map: tex('hole'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, color: 0x9a948c });
    this.holes = new DecalPool(scene, 70, holeMat, 0.09);
    const splatMat = new THREE.MeshStandardMaterial({ map: tex('splat'), color: 0x3a0d06, transparent: true, depthWrite: false, roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.splats = new DecalPool(scene, 40, splatMat, 1);
    const scorchMat = new THREE.MeshBasicMaterial({ map: tex('hole'), color: 0x222222, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.scorch = new DecalPool(scene, 10, scorchMat, 1);
    this.lights = new LightPool(scene, G.quality.lights);
    // clarão do cano
    this.flashMat = new THREE.SpriteMaterial({ map: tex('flash'), color: 0xffd8a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
    this.flash = new THREE.Sprite(this.flashMat);
    this.flash.visible = false;
    this.flash.renderOrder = 4;
    scene.add(this.flash);
    this.flashT = 0;
    this.muzzleLight = new THREE.PointLight(0xffb060, 0, 9, 2);
    scene.add(this.muzzleLight);
    this.muzzleT = 0;
    // cápsulas
    this.casings = [];
    const cg = new THREE.CylinderGeometry(0.0065, 0.0065, 0.022, 6);
    const sg = new THREE.CylinderGeometry(0.011, 0.011, 0.06, 6);
    const brass = new THREE.MeshStandardMaterial({ color: 0xc9a050, roughness: 0.3, metalness: 0.9 });
    const red = new THREE.MeshStandardMaterial({ color: 0x9a2a20, roughness: 0.5 });
    for (let i = 0; i < 24; i++) {
      const sh = i >= 18;
      const m = new THREE.Mesh(sh ? sg : cg, sh ? red : brass);
      m.visible = false;
      m.castShadow = false;
      scene.add(m);
      this.casings.push({ m, v: new THREE.Vector3(), w: new THREE.Vector3(), life: 0, bounced: 0, shell: sh });
    }
    this.trauma = 0;
    this.shakeOffset = new THREE.Vector3();
    this.shakeRoll = 0;
    this.time = 0;
    this.setQuality(G.quality);
  }

  setQuality(q) {
    this.add.limit = Math.floor(this.add.cap * q.particles);
    this.norm.limit = Math.floor(this.norm.cap * q.particles);
    this.lights.setCount(q.lights);
  }

  setFog(color, density) {
    for (const p of [this.add, this.norm]) {
      p.uniforms.fogDensity.value = density;
      p.uniforms.fogColor.value.copy(color);
    }
  }

  setScale(px) {
    this.add.uniforms.scale.value = px;
    this.norm.uniforms.scale.value = px;
  }

  shake(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  // ----------------- emissores -----------------
  blood(p, dir, n = 10, heavy = false) {
    const N = this.norm,
      A = this.add;
    for (let i = 0; i < n; i++) {
      const sp = rand(1, heavy ? 5 : 3.4);
      const vx = dir.x * sp * 0.6 + rand(-1.6, 1.6),
        vy = rand(0.4, 3),
        vz = dir.z * sp * 0.6 + rand(-1.6, 1.6);
      N.spawn(p.x, p.y, p.z, vx, vy, vz, rand(0.45, 0.9), rand(0.04, 0.08), rand(0.02, 0.05), rand(0.22, 0.32), 0.05, 0.03, 0.95, 9.8, 0.6, true);
    }
    for (let i = 0; i < Math.ceil(n * 0.4); i++) {
      N.spawn(p.x, p.y, p.z, rand(-0.6, 0.6) + dir.x, rand(0, 0.8), rand(-0.6, 0.6) + dir.z, rand(0.4, 0.7), 0.1, rand(0.3, 0.5), 0.2, 0.04, 0.03, 0.35, 0.4, 2);
    }
    // brasas cor de ferrugem: a Ferrugem no sangue
    for (let i = 0; i < Math.ceil(n * 0.35); i++) {
      A.spawn(p.x, p.y, p.z, rand(-2, 2) + dir.x * 2, rand(0.5, 3), rand(-2, 2) + dir.z * 2, rand(0.3, 0.7), 0.05, 0.01, 1, 0.42, 0.12, 0.9, 6, 1);
    }
    if (heavy && Math.random() < 0.8) this.groundSplat(p.x + dir.x * 0.6, p.z + dir.z * 0.6, rand(0.5, 0.9));
  }

  groundSplat(x, z, s = 0.6) {
    const gy = this.G.col.groundY(x, z);
    if (gy !== 0) return;
    this.splats.place(x, 0.004, z, 0, 1, 0, s);
  }

  sparks(p, nrm, n = 8, color = [1, 0.75, 0.35]) {
    for (let i = 0; i < n; i++) {
      const sp = rand(2, 6);
      this.add.spawn(p.x, p.y, p.z, nrm.x * sp + rand(-2, 2), nrm.y * sp + rand(-1, 3), nrm.z * sp + rand(-2, 2), rand(0.12, 0.35), 0.035, 0.01, color[0], color[1], color[2], 1, 9.8, 1.5);
    }
  }

  dust(p, nrm, n = 6, col = [0.42, 0.38, 0.33]) {
    for (let i = 0; i < n; i++) {
      const sp = rand(0.3, 1.5);
      this.norm.spawn(p.x, p.y, p.z, nrm.x * sp + rand(-0.5, 0.5), nrm.y * sp + rand(0, 0.8), nrm.z * sp + rand(-0.5, 0.5), rand(0.5, 1.1), rand(0.06, 0.12), rand(0.3, 0.6), col[0], col[1], col[2], 0.6, 0.5, 2.5);
    }
  }

  chips(p, nrm, n = 8, col = [0.42, 0.3, 0.2]) {
    for (let i = 0; i < n; i++) {
      const sp = rand(1.5, 4);
      this.norm.spawn(p.x, p.y, p.z, nrm.x * sp + rand(-1.5, 1.5), nrm.y * sp + rand(0.5, 3), nrm.z * sp + rand(-1.5, 1.5), rand(0.5, 1.0), rand(0.04, 0.07), 0.03, col[0], col[1], col[2], 1, 9.8, 0.4, true);
    }
  }

  splash(p) {
    for (let i = 0; i < 10; i++) {
      this.norm.spawn(p.x, p.y, p.z, rand(-1, 1), rand(1.5, 3.5), rand(-1, 1), rand(0.4, 0.7), 0.05, 0.03, 0.55, 0.62, 0.66, 0.7, 9.8, 0.5);
    }
  }

  // Impacto de bala no cenário conforme o material.
  impact(hit, dir) {
    const p = { x: hit.x, y: hit.y, z: hit.z },
      n = { x: hit.nx, y: hit.ny, z: hit.nz };
    const mat = hit.mat || 'stone';
    if (mat === 'water') {
      this.splash(p);
      return;
    }
    if (mat === 'metal') {
      this.sparks(p, n, 10);
      this.dust(p, n, 2, [0.3, 0.3, 0.3]);
    } else if (mat === 'wood') {
      this.chips(p, n, 7);
      this.dust(p, n, 3, [0.36, 0.3, 0.24]);
    } else if (mat === 'dirt') {
      this.dust(p, n, 7, [0.33, 0.29, 0.24]);
      this.chips(p, n, 4, [0.25, 0.22, 0.18]);
    } else {
      this.sparks(p, n, 4, [1, 0.8, 0.5]);
      this.dust(p, n, 5);
    }
    if (hit.collider || mat === 'dirt') this.holes.place(p.x, p.y, p.z, n.x, n.y, n.z, mat === 'dirt' ? 1.4 : 1);
    void dir;
  }

  muzzle(p, dir, big = false) {
    this.flash.position.copy(p).addScaledVector(dir, big ? 0.12 : 0.06);
    this.flash.scale.setScalar(big ? 0.75 : 0.42);
    this.flashMat.rotation = Math.random() * Math.PI * 2;
    this.flash.visible = true;
    this.flashT = big ? 0.06 : 0.045;
    this.muzzleLight.position.copy(p).addScaledVector(dir, 0.2);
    this.muzzleLight.intensity = big ? 70 : 40;
    this.muzzleT = 0.06;
    for (let i = 0; i < (big ? 10 : 5); i++) {
      this.norm.spawn(p.x, p.y, p.z, dir.x * rand(0.5, 2) + rand(-0.3, 0.3), dir.y * rand(0.5, 2) + rand(0, 0.5), dir.z * rand(0.5, 2) + rand(-0.3, 0.3), rand(0.4, 0.8), 0.04, big ? 0.32 : 0.18, 0.4, 0.4, 0.42, big ? 0.22 : 0.12, -0.3, 2.5);
    }
    for (let i = 0; i < (big ? 8 : 3); i++) {
      this.add.spawn(p.x, p.y, p.z, dir.x * rand(4, 12) + rand(-1, 1), dir.y * rand(4, 12) + rand(-1, 1), dir.z * rand(4, 12) + rand(-1, 1), rand(0.05, 0.14), 0.03, 0.01, 1, 0.75, 0.35, 1, 4, 1);
    }
  }

  eject(p, right, up, shell = false) {
    const pool = this.casings.filter((c) => c.shell === shell);
    let c = pool.find((k) => k.life <= 0);
    if (!c) c = pool.reduce((a, b) => (a.life < b.life ? a : b));
    c.m.position.copy(p);
    c.v.copy(right).multiplyScalar(rand(1.6, 2.6)).addScaledVector(up, rand(1.4, 2.4));
    c.v.x += rand(-0.3, 0.3);
    c.v.z += rand(-0.3, 0.3);
    c.w.set(rand(-20, 20), rand(-20, 20), rand(-20, 20));
    c.life = 4;
    c.bounced = 0;
    c.m.visible = true;
    c.m.scale.setScalar(1);
  }

  explosion(p, radius = 4.5) {
    const A = this.add,
      N = this.norm;
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2,
        e = rand(-0.2, 1.2),
        sp = rand(2, 8);
      A.spawn(p.x, p.y + 0.4, p.z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 1, Math.sin(a) * Math.cos(e) * sp, rand(0.25, 0.6), rand(0.4, 0.8), rand(1.0, 1.8), 1, rand(0.45, 0.7), 0.15, 0.95, -1.5, 3.5);
    }
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2,
        sp = rand(0.5, 3);
      N.spawn(p.x + rand(-0.5, 0.5), p.y + rand(0.2, 1.2), p.z + rand(-0.5, 0.5), Math.cos(a) * sp, rand(1, 3), Math.sin(a) * sp, rand(1.4, 2.6), rand(0.6, 1), rand(2.2, 3.6), 0.12, 0.11, 0.1, 0.55, -0.5, 1.6);
    }
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2,
        sp = rand(5, 12);
      A.spawn(p.x, p.y + 0.3, p.z, Math.cos(a) * sp, rand(3, 9), Math.sin(a) * sp, rand(0.5, 1.2), 0.06, 0.02, 1, 0.7, 0.3, 1, 9.8, 0.6);
    }
    this.lights.add({ x: p.x, y: p.y + 1.2, z: p.z, color: 0xff8030, intensity: 260, range: radius * 4, life: 0.5, maxLife: 0.5, priority: 100, instant: true, temp: true });
    this.scorch.place(p.x, 0.006, p.z, 0, 1, 0, radius * 0.55);
  }

  embers(p, n = 6, spread = 0.4, up = 1.5) {
    for (let i = 0; i < n; i++) {
      this.add.spawn(p.x + rand(-spread, spread), p.y + rand(-0.1, 0.3), p.z + rand(-spread, spread), rand(-0.4, 0.4), rand(0.4, up), rand(-0.4, 0.4), rand(0.8, 1.8), rand(0.03, 0.06), 0.01, 1, rand(0.35, 0.55), 0.1, 0.9, -0.2, 0.8);
    }
  }

  fire(p, n = 2, size = 1) {
    for (let i = 0; i < n; i++) {
      this.add.spawn(p.x + rand(-0.15, 0.15) * size, p.y, p.z + rand(-0.15, 0.15) * size, rand(-0.2, 0.2), rand(0.8, 1.6) * size, rand(-0.2, 0.2), rand(0.35, 0.7), rand(0.25, 0.4) * size, 0.05, 1, rand(0.4, 0.6), 0.12, 0.75, -0.5, 1);
    }
    if (Math.random() < 0.25 * n) {
      this.norm.spawn(p.x, p.y + 0.4 * size, p.z, rand(-0.2, 0.2), rand(0.6, 1.2), rand(-0.2, 0.2), rand(1.2, 2.2), 0.2 * size, 0.9 * size, 0.08, 0.08, 0.08, 0.3, -0.2, 0.6);
    }
  }

  // Corpo virando pó de ferrugem.
  dissolve(p, n = 4, h = 1.6) {
    for (let i = 0; i < n; i++) {
      this.add.spawn(p.x + rand(-0.35, 0.35), p.y + rand(0, h), p.z + rand(-0.35, 0.35), rand(-0.3, 0.3), rand(0.3, 1.4), rand(-0.3, 0.3), rand(0.7, 1.5), rand(0.03, 0.07), 0.01, 1, rand(0.3, 0.5), 0.08, 0.85, -0.3, 0.8);
      this.norm.spawn(p.x + rand(-0.3, 0.3), p.y + rand(0, h * 0.7), p.z + rand(-0.3, 0.3), rand(-0.2, 0.2), rand(0.2, 0.8), rand(-0.2, 0.2), rand(0.8, 1.6), 0.08, rand(0.25, 0.45), 0.24, 0.12, 0.07, 0.45, -0.1, 1.2);
    }
  }

  // ----------------- atualização -----------------
  update(dt, px, pz) {
    this.time += dt;
    this.add.update(dt);
    this.norm.update(dt);
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.flash.visible = false;
    }
    if (this.muzzleT > 0) {
      this.muzzleT -= dt;
      if (this.muzzleT <= 0) this.muzzleLight.intensity = 0;
    }
    for (const c of this.casings) {
      if (c.life <= 0) continue;
      c.life -= dt;
      if (c.life <= 0) {
        c.m.visible = false;
        continue;
      }
      const m = c.m;
      if (c.bounced < 3) {
        c.v.y -= 9.8 * dt;
        m.position.addScaledVector(c.v, dt);
        m.rotation.x += c.w.x * dt;
        m.rotation.y += c.w.y * dt;
        m.rotation.z += c.w.z * dt;
        const gy = this.G.col.groundY(m.position.x, m.position.z) + 0.007;
        if (m.position.y < gy) {
          m.position.y = gy;
          if (gy < 0) {
            c.life = Math.min(c.life, 0.3);
          }
          if (c.bounced === 0 && this.G.audio) this.G.audio.casing(m.position, c.shell);
          c.v.y = -c.v.y * 0.35;
          c.v.x *= 0.5;
          c.v.z *= 0.5;
          c.w.multiplyScalar(0.4);
          c.bounced++;
          if (c.bounced >= 3) {
            m.rotation.set(Math.PI / 2, m.rotation.y, 0);
          }
        }
      }
      if (c.life < 0.5) m.scale.setScalar(Math.max(0.01, c.life / 0.5));
    }
    this.lights.update(dt, px, pz, this.time);
    // tremor (trauma²)
    this.trauma = Math.max(0, this.trauma - dt * 1.5);
    const s = this.trauma * this.trauma;
    const t = this.time * 40;
    this.shakeOffset.set(Math.sin(t * 1.1) * 0.12 * s, Math.sin(t * 1.37 + 1) * 0.1 * s, Math.sin(t * 0.93 + 2) * 0.08 * s);
    this.shakeRoll = Math.sin(t * 0.77 + 3) * 0.04 * s;
  }

  clear() {
    this.add.clear();
    this.norm.clear();
    this.holes.clear();
    this.splats.clear();
    this.scorch.clear();
    this.lights.clearTemp();
    for (const c of this.casings) {
      c.life = 0;
      c.m.visible = false;
    }
    this.flash.visible = false;
    this.muzzleLight.intensity = 0;
    this.trauma = 0;
  }
}
