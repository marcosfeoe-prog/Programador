// Nível 35 — carros: a malha de um carro comum (usada nos estacionados, que
// entram na geometria dos blocos, e nos que andam sozinhos) e o "enxame" de
// carros que toma o terraço quando o andarilho chega perto da saída. Eles
// andam pelas faixas sem ninguém dentro; passar na frente ou atrás de um faz
// ele acelerar. Encostar num deles em movimento é ser atropelado.
import * as THREE from 'three';
import { GeoBuilder } from '../materials.js';
import { clamp } from '../util.js';

export const CAR_COLORS = [
  [0.5, 0.06, 0.05],
  [0.08, 0.16, 0.32],
  [0.62, 0.62, 0.6],
  [0.12, 0.12, 0.13],
  [0.15, 0.3, 0.2],
  [0.55, 0.45, 0.25],
];
const CL = 4.4; // comprimento
const CW = 1.85; // largura

// Desenha um carro num GeoBuilder: centro (x, z), yaw múltiplo de 90°.
// O comprimento fica no eixo x local.
export function drawCar(gb, x, z, yaw, color, lm, y0 = 0) {
  const cs = Math.round(Math.cos(yaw));
  const sn = Math.round(Math.sin(yaw));
  const W = (lx, lz) => [x + lx * cs + lz * sn, z - lx * sn + lz * cs];
  const box = (lx, y, lz, sx, sy, sz, col, o = {}) => {
    const [px, pz] = W(lx, lz);
    gb.box(px, y0 + y, pz, sx, sy, sz, col, lm, { rot: yaw, ...o });
  };
  const dark = [0.03, 0.035, 0.04];
  const glass = [0.05, 0.07, 0.08];
  const c2 = [color[0] * 0.8, color[1] * 0.8, color[2] * 0.8];
  box(0, 0.55, 0, CL, 0.5, CW, color);
  box(1.55, 0.83, 0, 1.25, 0.08, CW - 0.06, c2, { ao: 0 });
  box(-1.65, 0.83, 0, 1.0, 0.08, CW - 0.06, c2, { ao: 0 });
  box(-0.05, 1.08, 0, 2.15, 0.48, CW - 0.2, glass, { ao: 0 });
  box(-0.1, 1.34, 0, 1.7, 0.06, CW - 0.26, color, { ao: 0 });
  box(CL / 2 + 0.03, 0.42, 0, 0.1, 0.22, CW - 0.1, dark, { ao: 0 });
  box(-CL / 2 - 0.03, 0.42, 0, 0.1, 0.22, CW - 0.1, dark, { ao: 0 });
  for (const s of [-1, 1]) {
    box(CL / 2 + 0.02, 0.64, s * 0.66, 0.06, 0.12, 0.34, [0.95, 0.92, 0.8], { ao: 0 });
    box(-CL / 2 - 0.02, 0.64, s * 0.7, 0.06, 0.12, 0.3, [0.6, 0.05, 0.04], { ao: 0 });
  }
  const axis = sn !== 0 ? 'x' : 'z';
  for (const a of [-1.4, 1.35])
    for (const s of [-1, 1]) {
      const [px, pz] = W(a, s * (CW / 2 - 0.12));
      gb.cylinder(px, y0 + 0.33, pz, 0.33, 0.24, dark, lm, { axis, sides: 12 });
    }
}

// Retângulo de colisão (eixos alinhados) de um carro parado.
export function carRect(x, z, yaw, pad = 0) {
  const along = Math.abs(Math.round(Math.cos(yaw))) === 1;
  const hx = (along ? CL : CW) / 2 + pad;
  const hz = (along ? CW : CL) / 2 + pad;
  return [x - hx, x + hx, z - hz, z + hz];
}

function glowTex() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Os carros que tomam o terraço.
export class CarRush {
  constructor(level, lanes, parked) {
    this.L = level;
    this.game = level.game;
    this.lanes = lanes;
    this.group = new THREE.Group();
    level.dynamic.add(this.group);
    this.tex = glowTex();
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.55, envMap: level.env || null, envMapIntensity: 0.8 });
    // o terraço não tem luzes dinâmicas: um pouco da cor própria aparece sempre
    this.mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * 0.16;');
    };
    this.geos = CAR_COLORS.map((c) => {
      const gb = new GeoBuilder();
      drawCar(gb, 0, 0, 0, c, null);
      return gb.build();
    });
    this.headMat = new THREE.SpriteMaterial({ map: this.tex, color: new THREE.Color(3, 2.8, 2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.tailMat = new THREE.SpriteMaterial({ map: this.tex, color: new THREE.Color(2.5, 0.15, 0.08), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.beamMat = new THREE.MeshBasicMaterial({ map: this.tex, color: new THREE.Color(0.55, 0.5, 0.38), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.beamGeo = new THREE.PlaneGeometry(9, 4.5);
    this.cars = [];
    // estacionados que surgem com o evento (só malha + colisão)
    this.parked = parked.map((p, i) => {
      const m = new THREE.Mesh(this.geos[i % this.geos.length], this.mat);
      m.position.set(p.x, 0, p.z);
      m.rotation.y = p.yaw;
      m.visible = false;
      this.group.add(m);
      this.addLights(m, i % 3 === 0);
      return { ...p, mesh: m, rect: carRect(p.x, p.z, p.yaw, 0.05) };
    });
    this.active = false;
    this.hitCool = 0;
  }

  addLights(m, on) {
    const lights = [];
    for (const s of [-1, 1]) {
      const h = new THREE.Sprite(this.headMat);
      h.position.set(CL / 2 + 0.1, 0.64, s * 0.66);
      h.scale.setScalar(0.9);
      const t = new THREE.Sprite(this.tailMat);
      t.position.set(-CL / 2 - 0.1, 0.64, s * 0.7);
      t.scale.setScalar(0.55);
      m.add(h, t);
      lights.push(h, t);
    }
    const beam = new THREE.Mesh(this.beamGeo, this.beamMat);
    beam.rotation.x = -Math.PI / 2;
    beam.position.set(CL / 2 + 4.3, 0.03, 0);
    m.add(beam);
    lights.push(beam);
    for (const l of lights) l.visible = on;
    m.userData.lights = lights;
  }

  start() {
    if (this.active) return;
    this.active = true;
    const g = this.game;
    for (const p of this.parked) p.mesh.visible = true;
    const P = g.player.pos;
    // um carro por faixa, começando longe do andarilho
    this.lanes.forEach((ln, i) => {
      const m = new THREE.Mesh(this.geos[(i + 2) % this.geos.length], this.mat);
      this.addLights(m, true);
      this.group.add(m);
      const len = ln.len;
      let t = ((i * 0.37) % 1) * len;
      const pos = (tt) => ({ x: ln.x0 + ln.dx * tt, z: ln.z0 + ln.dz * tt });
      for (let k = 0; k < 6; k++) {
        const q = pos(t);
        if (Math.hypot(q.x - P.x, q.z - P.z) > 22) break;
        t = (t + len * 0.31) % len;
      }
      const car = { ln, t, mesh: m, speed: 6 + (i % 3) * 1.6, base: 6 + (i % 3) * 1.6, boost: 0, snd: g.audio.positional('machine', 0, 0.6, 0, { gain: 0.5, rate: 0.55 + (i % 3) * 0.08, ref: 4, rolloff: 1.4 }) };
      this.cars.push(car);
      this.place(car);
    });
    g.audio.play('alarm', { gain: 0.25, rate: 0.7 });
    g.audio.play('growl', { gain: 0.35, rate: 0.6 });
    g.vibrate([100, 50, 100]);
  }

  place(car) {
    const ln = car.ln;
    const x = ln.x0 + ln.dx * car.t;
    const z = ln.z0 + ln.dz * car.t;
    car.x = x;
    car.z = z;
    car.mesh.position.set(x, 0, z);
    car.mesh.rotation.y = Math.atan2(-ln.dz, ln.dx);
    car.snd.setPos(x, 0.6, z);
  }

  // Colisão com os estacionados que apareceram.
  colliders() {
    return this.active ? this.parked.map((p) => p.rect) : [];
  }

  update(dt, player) {
    if (!this.active) return 0;
    const g = this.game;
    const P = player.pos;
    this.hitCool = Math.max(0, this.hitCool - dt);
    let fear = 0;
    for (const car of this.cars) {
      const ln = car.ln;
      // passar na frente (ou logo atrás) faz ele acelerar
      const rx = P.x - car.x;
      const rz = P.z - car.z;
      const along = rx * ln.dx + rz * ln.dz;
      const side = Math.abs(-rx * ln.dz + rz * ln.dx);
      if (side < 3.2 && along > -7 && along < 14) car.boost = 1.6;
      car.boost = Math.max(0, car.boost - dt);
      const target = car.boost > 0 ? 15 : car.base;
      car.speed += clamp(target - car.speed, -6 * dt, (car.boost > 0 ? 12 : 4) * dt);
      car.t += car.speed * dt;
      if (car.t > ln.len) car.t -= ln.len;
      this.place(car);
      // atropelamento
      if (side < CW / 2 + 0.35 && Math.abs(along) < CL / 2 + 0.35 && this.hitCool <= 0 && !g.transitioning) {
        this.hitCool = 2.5;
        g.caught({ image: this.L.carFace(), text: 'Um carro sem ninguém dentro te atropelou e seguiu em frente. Não passe na frente deles!', sanity: 40 });
        // arremessa para o lado
        const s = -rx * ln.dz + rz * ln.dx > 0 ? 1 : -1;
        P.x += -ln.dz * s * 2.4 + ln.dx * 1.2;
        P.z += ln.dx * s * 2.4 + ln.dz * 1.2;
        this.L.collide(P, player.radius || 0.3);
      }
      const d = Math.hypot(rx, rz);
      fear = Math.max(fear, clamp(1 - d / 16, 0, 1) * (car.boost > 0 ? 1 : 0.6));
      car.snd.setGain(car.boost > 0 ? 0.9 : 0.5);
    }
    return fear;
  }

  dispose() {
    for (const c of this.cars) c.snd.stop();
    this.L.dynamic.remove(this.group);
    for (const g of this.geos) g.dispose();
    this.beamGeo.dispose();
    for (const m of [this.mat, this.headMat, this.tailMat, this.beamMat]) m.dispose();
    this.tex.dispose();
  }
}
