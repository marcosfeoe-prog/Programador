// Chuva, neve e raios em volta da câmera.
import * as THREE from 'three';
import { CH } from './consts.js';
import { SOLID, LIQUID } from './world.js';

const N_RAIN = 1400;
const RADIUS = 18;

export class WeatherFx {
  constructor(scene) {
    // chuva: segmentos de linha
    this.drops = [];
    const pos = new Float32Array(N_RAIN * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.rainMat = new THREE.LineBasicMaterial({ color: 0x9fb4d8, transparent: true, opacity: 0.5, depthWrite: false });
    this.rain = new THREE.LineSegments(g, this.rainMat);
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 4;
    scene.add(this.rain);
    // neve: pontos
    const sp = new Float32Array(N_RAIN * 3);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3).setUsage(THREE.DynamicDrawUsage));
    this.snowMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, transparent: true, opacity: 0.9, depthWrite: false });
    this.snow = new THREE.Points(sg, this.snowMat);
    this.snow.frustumCulled = false;
    scene.add(this.snow);
    for (let i = 0; i < N_RAIN; i++) this.drops.push({ x: 0, y: -999, z: 0, top: 0, floor: 0, snow: false, phase: Math.random() * 6 });
    this.tops = new Map();
    this.topsTime = 0;
    // raio
    this.boltMat = new THREE.LineBasicMaterial({ color: 0xeef4ff, transparent: true, opacity: 1, depthWrite: false });
    this.boltLine = new THREE.LineSegments(new THREE.BufferGeometry(), this.boltMat);
    this.boltLine.frustumCulled = false;
    this.boltLine.visible = false;
    scene.add(this.boltLine);
    this.boltLife = 0;
    this.flash = 0;
  }

  // altura onde a chuva para (primeiro bloco sólido, folha ou líquido de cima para baixo)
  topAt(world, x, z, fromY) {
    const key = x * 100003 + z;
    let t = this.tops.get(key);
    if (t === undefined) {
      let y = Math.min(CH - 1, Math.floor(fromY) + 24);
      while (y > 0) {
        const id = world.getBlock(x, y, z);
        if (SOLID[id] || LIQUID[id] || id === 10 || id === 23 || id === 25) break;
        y--;
      }
      t = y + 1;
      this.tops.set(key, t);
    }
    return t;
  }

  bolt_(x, y, z) {
    const pts = [];
    let cx = x, cz = z;
    let cy = 140;
    while (cy > y) {
      const nx = cx + (Math.random() - 0.5) * 4, nz = cz + (Math.random() - 0.5) * 4, ny = Math.max(y, cy - 4 - Math.random() * 6);
      pts.push(cx, cy, cz, nx, ny, nz);
      // galhos
      if (Math.random() < 0.25) pts.push(nx, ny, nz, nx + (Math.random() - 0.5) * 8, ny - 5, nz + (Math.random() - 0.5) * 8);
      cx = nx;
      cz = nz;
      cy = ny;
    }
    this.boltLine.geometry.dispose();
    this.boltLine.geometry = new THREE.BufferGeometry();
    this.boltLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.boltLine.visible = true;
    this.boltLife = 0.35;
    this.flash = 1;
  }
  bolt(x, y, z) {
    this.bolt_(x, y, z);
  }

  update(dt, world, cam, rain, particles, fancy) {
    if (this.boltLife > 0) {
      this.boltLife -= dt;
      this.boltMat.opacity = Math.random() < 0.3 ? 0.3 : 1;
      if (this.boltLife <= 0) this.boltLine.visible = false;
    }
    this.flash = Math.max(0, this.flash - dt * 2.5);
    const on = rain > 0.02 && world;
    this.rain.visible = this.snow.visible = !!on;
    if (!on) return;
    const now = performance.now();
    if (now - this.topsTime > 1500) {
      this.tops.clear();
      this.topsTime = now;
    }
    const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
    const active = Math.floor(N_RAIN * Math.min(1, rain));
    const rp = this.rain.geometry.attributes.position.array;
    const sp = this.snow.geometry.attributes.position.array;
    let splashBudget = fancy ? 6 : 0;
    for (let i = 0; i < N_RAIN; i++) {
      const d = this.drops[i];
      if (i >= active) {
        rp.fill(0, i * 6, i * 6 + 6);
        sp[i * 3 + 1] = -999;
        continue;
      }
      if (d.y < d.floor || Math.abs(d.x - cx) > RADIUS + 2 || Math.abs(d.z - cz) > RADIUS + 2) {
        // renasce em cima, numa coluna aleatória perto da câmera
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * RADIUS;
        d.x = cx + Math.cos(a) * r;
        d.z = cz + Math.sin(a) * r;
        const bx = Math.floor(d.x), bz = Math.floor(d.z);
        d.floor = this.topAt(world, bx, bz, cy);
        d.snow = world.isCold(bx, bz);
        d.y = Math.max(d.floor, cy + 6 + Math.random() * 14);
        if (d.y - d.floor < 0.5) d.y = d.floor - 1;
        d.speed = d.snow ? 2.2 + Math.random() : 16 + Math.random() * 6;
      }
      d.y -= d.speed * dt;
      if (d.snow) {
        d.phase += dt;
        sp[i * 3] = d.x + Math.sin(d.phase * 1.3) * 0.4;
        sp[i * 3 + 1] = d.y;
        sp[i * 3 + 2] = d.z + Math.cos(d.phase) * 0.4;
        rp.fill(0, i * 6, i * 6 + 6);
      } else {
        sp[i * 3 + 1] = -999;
        rp[i * 6] = d.x;
        rp[i * 6 + 1] = d.y;
        rp[i * 6 + 2] = d.z;
        rp[i * 6 + 3] = d.x - 0.02;
        rp[i * 6 + 4] = d.y + 0.7;
        rp[i * 6 + 5] = d.z;
        if (d.y < d.floor && splashBudget > 0 && Math.random() < 0.3) {
          splashBudget--;
          particles.rainSplash(d.x, d.floor + 0.05, d.z);
        }
      }
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
    this.snow.geometry.attributes.position.needsUpdate = true;
    const day = world.daylight();
    this.rainMat.opacity = 0.25 + 0.35 * rain * (0.4 + 0.6 * day);
    this.rainMat.color.setRGB(0.5 + 0.25 * day, 0.6 + 0.2 * day, 0.75 + 0.15 * day);
    this.snowMat.color.setScalar(0.4 + 0.6 * day);
  }
}
