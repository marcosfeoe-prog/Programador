// Partículas em pontos texturizados: fragmentos de blocos, fumaça, chamas, explosões e respingos.
import * as THREE from 'three';
import { tileUV, blockFaces } from './textures.js';
import { BLOCKS, B } from './blocks.js';
import { SOLID } from './world.js';
import { brightnessAt } from './entities.js';

const MAX = 4000;

export class Particles {
  constructor(scene, atlas) {
    this.pos = new Float32Array(MAX * 3);
    this.uv = new Float32Array(MAX * 4);
    this.size = new Float32Array(MAX);
    this.color = new Float32Array(MAX * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aUV', new THREE.BufferAttribute(this.uv, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uAtlas: { value: atlas }, uScale: { value: 500 }, uFogColor: { value: new THREE.Color() }, uFogFar: { value: 100 } },
      vertexShader: `attribute vec4 aUV; attribute float aSize; attribute vec3 aColor; uniform float uScale;
        varying vec4 vUV; varying vec3 vColor; varying float vD;
        void main(){ vUV = aUV; vColor = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z;
          gl_PointSize = aSize * uScale / max(0.05, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D uAtlas; uniform vec3 uFogColor; uniform float uFogFar; varying vec4 vUV; varying vec3 vColor; varying float vD;
        void main(){ vec2 uv = vec2(mix(vUV.x, vUV.z, gl_PointCoord.x), mix(vUV.w, vUV.y, gl_PointCoord.y));
          vec4 t = texture2D(uAtlas, uv); if (t.a < 0.5) discard;
          float f = smoothstep(uFogFar * 0.6, uFogFar, vD);
          gl_FragColor = vec4(mix(t.rgb * vColor, uFogColor, f), 1.0); }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.list = [];
  }

  setAtlas(t) {
    this.mat.uniforms.uAtlas.value = t;
  }
  add(p) {
    if (this.density !== undefined && this.density < 1 && !p.keep && Math.random() > this.density) return;
    if (this.list.length >= MAX) this.list.shift();
    this.list.push(p);
  }

  // recorte aleatório de 4×4 pixels da textura do bloco
  subTile(tex) {
    const [u0, v0, u1, v1] = tileUV(tex);
    const du = (u1 - u0) / 4, dv = (v1 - v0) / 4;
    const i = Math.floor(Math.random() * 3.99), j = Math.floor(Math.random() * 3.99);
    return [u0 + du * i, v0 + dv * j, u0 + du * (i + 1), v0 + dv * (j + 1)];
  }
  blockTex(id) {
    const b = BLOCKS[id];
    if (!b || b.render === 'none') return 'stone';
    if (typeof b.tex === 'string') return b.tex;
    return blockFaces(id).side;
  }

  blockBreak(x, y, z, id, bright) {
    const tex = this.blockTex(id);
    const tint = BLOCKS[id].tint === 'grass' || BLOCKS[id].tint === 'foliage' ? [0.85, 1, 0.8] : [1, 1, 1];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) {
      const px = x + (i + 0.5) / 4, py = y + (j + 0.5) / 4, pz = z + (k + 0.5) / 4;
      this.add({
        x: px, y: py, z: pz,
        vx: (px - x - 0.5) * 2.5 + (Math.random() - 0.5) * 1.5,
        vy: (py - y - 0.5) * 2.5 + Math.random() * 2,
        vz: (pz - z - 0.5) * 2.5 + (Math.random() - 0.5) * 1.5,
        life: 0.4 + Math.random() * 0.9, uv: this.subTile(tex), size: 0.07 + Math.random() * 0.05,
        color: tint.map((c) => c * bright), gravity: 18, collide: true,
      });
    }
  }
  blockHit(hit, bright) {
    const tex = this.blockTex(hit.id);
    const [fx, fy, fz] = hit.face;
    const r = () => Math.random();
    const x = hit.x + (fx ? (fx > 0 ? 1.03 : -0.03) : r()), y = hit.y + (fy ? (fy > 0 ? 1.03 : -0.03) : r()), z = hit.z + (fz ? (fz > 0 ? 1.03 : -0.03) : r());
    this.add({ x, y, z, vx: fx * 1.5 + (r() - 0.5), vy: fy * 1.5 + r(), vz: fz * 1.5 + (r() - 0.5), life: 0.3 + r() * 0.4, uv: this.subTile(tex), size: 0.05 + r() * 0.04, color: [bright, bright, bright], gravity: 18, collide: true });
  }
  smoke(x, y, z, n = 1, spread = 0.1, dark = false) {
    const uv = tileUV('particle_smoke');
    for (let i = 0; i < n; i++) {
      const g = dark ? 0.15 + Math.random() * 0.15 : 0.55 + Math.random() * 0.35;
      this.add({ x: x + (Math.random() - 0.5) * spread * 2, y: y + (Math.random() - 0.5) * spread, z: z + (Math.random() - 0.5) * spread * 2, vx: (Math.random() - 0.5) * 0.3, vy: 0.4 + Math.random() * 0.5, vz: (Math.random() - 0.5) * 0.3, life: 0.8 + Math.random() * 1.2, uv, size: 0.1 + Math.random() * 0.1, color: [g, g, g], gravity: -0.3, drag: 0.96, shrink: true });
    }
  }
  flame(x, y, z) {
    const uv = tileUV('particle_flame');
    this.add({ x, y, z, vx: (Math.random() - 0.5) * 0.04, vy: 0.08 + Math.random() * 0.08, vz: (Math.random() - 0.5) * 0.04, life: 0.35 + Math.random() * 0.4, uv, size: 0.07, color: [1, 1, 1], gravity: 0, shrink: true });
  }
  explosion(x, y, z, power) {
    const uv = tileUV('particle_smoke');
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2, b = Math.random() * 2 - 1, s = 2 + Math.random() * 6;
      const r = Math.sqrt(1 - b * b);
      const g = 0.6 + Math.random() * 0.4;
      this.add({ x, y, z, vx: Math.cos(a) * r * s, vy: b * s * 0.7 + 1, vz: Math.sin(a) * r * s, life: 0.6 + Math.random() * 1.2, uv, size: 0.4 + Math.random() * power * 0.25, color: [g, g, g], gravity: -0.5, drag: 0.88, shrink: true });
    }
  }
  splash(x, y, z, n = 12) {
    for (let i = 0; i < n; i++) this.add({ x: x + (Math.random() - 0.5), y, z: z + (Math.random() - 0.5), vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3, vz: (Math.random() - 0.5) * 2, life: 0.5 + Math.random() * 0.4, uv: this.subTile('water'), size: 0.06, color: [0.6, 0.75, 1], gravity: 16, collide: true });
  }
  rainSplash(x, y, z) {
    const uv = this.subTile('water');
    for (let i = 0; i < 2; i++) this.add({ x, y, z, vx: (Math.random() - 0.5) * 1.5, vy: 1.5 + Math.random() * 1.5, vz: (Math.random() - 0.5) * 1.5, life: 0.25 + Math.random() * 0.2, uv, size: 0.04, color: [0.7, 0.8, 1], gravity: 14 });
  }
  happy(x, y, z) {
    const uv = tileUV('particle_smoke');
    this.add({ x, y, z, vx: (Math.random() - 0.5) * 0.4, vy: 0.4 + Math.random() * 0.4, vz: (Math.random() - 0.5) * 0.4, life: 0.8 + Math.random() * 0.6, uv, size: 0.07, color: [0.4, 1, 0.4], gravity: 0, shrink: true, keep: true });
  }
  // folha caindo: balança de um lado para o outro
  leaf(x, y, z, tint, bright) {
    const uv = this.subTile('leaves');
    this.add({ x, y, z, vx: 0, vy: -0.6, vz: 0, life: 5 + Math.random() * 3, uv, size: 0.09, color: tint.map((c) => c * bright), gravity: 0, flutter: Math.random() * 6, collide: true });
  }
  // vaga-lume: pisca devagar e passeia no ar (cor acima de 1 para brilhar no bloom)
  firefly(x, y, z) {
    const uv = tileUV('particle_smoke');
    this.add({ x, y, z, vx: 0, vy: 0, vz: 0, life: 5 + Math.random() * 5, uv, size: 0.06, color: [0, 0, 0], gravity: 0, keep: true, glow: [2.6, 3.4, 0.7], t: Math.random() * 6, freq: 1.2 + Math.random() * 1.4 });
  }
  bubble(x, y, z) {
    const uv = tileUV('particle_smoke');
    this.add({ x, y, z, vx: (Math.random() - 0.5) * 0.3, vy: 1.2, vz: (Math.random() - 0.5) * 0.3, life: 0.6 + Math.random() * 0.6, uv, size: 0.05, color: [0.7, 0.85, 1], gravity: 0 });
  }

  update(dt, world, cam, height, fogColor, fogFar) {
    const list = this.list;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy -= p.gravity * dt;
      if (p.flutter !== undefined) {
        p.flutter += dt;
        p.vx = Math.sin(p.flutter * 2.1) * 0.7;
        p.vz = Math.cos(p.flutter * 1.3) * 0.5;
        p.vy = -0.5 - Math.abs(Math.sin(p.flutter * 2.1)) * 0.4;
      }
      if (p.glow) {
        p.t += dt;
        p.vx = p.vx * 0.97 + (Math.random() - 0.5) * dt * 3;
        p.vy = p.vy * 0.97 + (Math.random() - 0.5) * dt * 2;
        p.vz = p.vz * 0.97 + (Math.random() - 0.5) * dt * 3;
        const pulse = Math.max(0, Math.sin(p.t * p.freq)) ** 2 * Math.min(1, p.life * 0.5);
        for (let k = 0; k < 3; k++) p.color[k] = p.glow[k] * (0.05 + 0.95 * pulse);
      }
      if (p.drag) {
        const d = Math.pow(p.drag, dt * 20);
        p.vx *= d;
        p.vy *= d;
        p.vz *= d;
      }
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
      if (p.collide && SOLID[world.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz))]) {
        if (!SOLID[world.getBlock(Math.floor(p.x), Math.floor(ny), Math.floor(p.z))]) {
          p.x = nx; p.z = nz;
        }
        p.vx *= 0.5;
        p.vz *= 0.5;
        p.vy = 0;
      } else {
        p.x = nx;
        p.y = ny;
        p.z = nz;
      }
      list[w++] = p;
    }
    list.length = w;
    const n = Math.min(w, MAX);
    for (let i = 0; i < n; i++) {
      const p = list[i];
      this.pos[i * 3] = p.x;
      this.pos[i * 3 + 1] = p.y;
      this.pos[i * 3 + 2] = p.z;
      this.uv.set(p.uv, i * 4);
      this.size[i] = p.shrink ? p.size * Math.min(1, p.life * 1.5) : p.size;
      this.color.set(p.color, i * 3);
    }
    this.geo.setDrawRange(0, n);
    for (const k of ['position', 'aUV', 'aSize', 'aColor']) {
      const at = this.geo.attributes[k];
      at.needsUpdate = true;
      at.clearUpdateRanges();
      at.addUpdateRange(0, n * at.itemSize);
    }
    this.mat.uniforms.uScale.value = height / (2 * Math.tan((cam.fov * Math.PI) / 360));
    this.mat.uniforms.uFogColor.value.copy(fogColor);
    this.mat.uniforms.uFogFar.value = fogFar;
  }

  clear() {
    this.list.length = 0;
  }
}

export { brightnessAt, B };
