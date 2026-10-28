// Nível 49 — "A Figura": uma silhueta humana alta, toda branca, sem rosto, que
// vaga pelos corredores do subsolo. Não ataca por conta própria. Mas se o
// andarilho chegar perto demais ou apontar a lanterna para ela, ela se agita —
// e quando se agita, corre atrás dele pelo labirinto.
import * as THREE from 'three';
import { W, EH, EV } from './grid.js';
import { TEX } from '../textures.js';
import { angleDiff, clamp } from '../util.js';

const PASS = new Set([W.NONE, W.DOOR, W.HALF_A, W.HALF_B]);
const WANDER = 0.75;
const CHASE = 4.1;
const CALM = 12; // segundos sem ver o andarilho até se acalmar

function faceURL() {
  const c = TEX.makeCanvas(256, 256);
  const x = c.getContext('2d');
  x.fillStyle = '#000';
  x.fillRect(0, 0, 256, 256);
  const g = x.createRadialGradient(128, 128, 10, 128, 128, 120);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.7, '#e8ece8');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.beginPath();
  x.ellipse(128, 128, 82, 112, 0, 0, Math.PI * 2);
  x.fill();
  // nenhum rosto — só duas sombras fundas onde deviam estar os olhos
  x.fillStyle = 'rgba(80,90,80,0.35)';
  for (const ex of [98, 158]) {
    x.beginPath();
    x.ellipse(ex, 112, 16, 9, 0, 0, Math.PI * 2);
    x.fill();
  }
  return c.toDataURL();
}

export class TheFigure {
  constructor(level) {
    this.L = level;
    this.game = level.game;
    this.state = 'off';
    this.timer = 20;
    this.threat = 0;
    this.x = 0;
    this.z = 0;
    this.yaw = 0;
    this.face = faceURL();
    this.mat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xd8e0d8, emissiveIntensity: 0.55, roughness: 0.9 });
    const g = new THREE.Group();
    const add = (geo, x, y, z, rx = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, this.mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, 0, rz);
      g.add(m);
      return m;
    };
    this.geos = [];
    const G = (geo) => (this.geos.push(geo), geo);
    this.body = add(G(new THREE.CapsuleGeometry(0.2, 1.0, 6, 12)), 0, 1.45, 0);
    this.body.scale.set(1, 1, 0.7);
    this.head = add(G(new THREE.SphereGeometry(0.17, 16, 12)), 0, 2.22, 0);
    this.head.scale.set(0.9, 1.2, 1);
    this.neck = add(G(new THREE.CylinderGeometry(0.05, 0.06, 0.18, 8)), 0, 2.02, 0);
    this.arms = [];
    this.legs = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(s * 0.27, 1.88, 0);
      const arm = new THREE.Mesh(G(new THREE.CylinderGeometry(0.045, 0.035, 1.25, 8).translate(0, -0.62, 0)), this.mat);
      sh.add(arm);
      g.add(sh);
      this.arms.push({ sh, s });
      const hip = new THREE.Group();
      hip.position.set(s * 0.1, 0.95, 0);
      const leg = new THREE.Mesh(G(new THREE.CylinderGeometry(0.07, 0.05, 0.95, 8).translate(0, -0.47, 0)), this.mat);
      hip.add(leg);
      g.add(hip);
      this.legs.push({ hip, s });
    }
    g.visible = false;
    level.dynamic.add(g);
    this.root = g;
    this.glow = new THREE.PointLight(0xe8f0e8, 0, 5, 2);
    this.glow.position.set(0, 1.6, 0.3);
    g.add(this.glow);
  }

  cell(v) {
    return Math.floor(v / this.L.cell);
  }

  center(i) {
    return (i + 0.5) * this.L.cell;
  }

  passable(ax, az, dx, dz) {
    const L = this.L;
    if (L.inTunnel(ax + dx, az + dz)) return false; // não entra nos túneis
    const t = dx ? L.edge(EV, dx > 0 ? ax + 1 : ax, az) : L.edge(EH, ax, dz > 0 ? az + 1 : az);
    return PASS.has(t);
  }

  pathStep(tx, tz) {
    const sx = this.cell(this.x);
    const sz = this.cell(this.z);
    const gx = this.cell(tx);
    const gz = this.cell(tz);
    if (sx === gx && sz === gz) return { x: tx, z: tz };
    const R = 30;
    const key = (x, z) => (x - sx + R) * 1000 + (z - sz + R);
    const prev = new Map([[key(sx, sz), null]]);
    const q = [[sx, sz]];
    let found = null;
    for (let qi = 0; qi < q.length && qi < 4000; qi++) {
      const [x, z] = q[qi];
      if (x === gx && z === gz) {
        found = [x, z];
        break;
      }
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const nz = z + dz;
        if (Math.abs(nx - sx) > R || Math.abs(nz - sz) > R) continue;
        const k = key(nx, nz);
        if (prev.has(k) || !this.passable(x, z, dx, dz)) continue;
        prev.set(k, [x, z]);
        q.push([nx, nz]);
      }
    }
    if (!found) return null;
    let cur = found;
    for (;;) {
      const p = prev.get(key(cur[0], cur[1]));
      if (!p || (p[0] === sx && p[1] === sz)) break;
      cur = p;
    }
    return { x: this.center(cur[0]), z: this.center(cur[1]) };
  }

  // Surge longe, num corredor fora de vista, e começa a vagar.
  appear(player) {
    const L = this.L;
    const p = player.pos;
    for (let t = 0; t < 60; t++) {
      const a = Math.random() * Math.PI * 2;
      const d = 18 + Math.random() * 14;
      const x = this.center(this.cell(p.x + Math.cos(a) * d));
      const z = this.center(this.cell(p.z + Math.sin(a) * d));
      if (!L.open(this.cell(x), this.cell(z)) || L.inTunnel(this.cell(x), this.cell(z))) continue;
      if (!L.chunkAt(x, z)) continue;
      this.x = x;
      this.z = z;
      this.state = 'wander';
      this.wp = null;
      this.prev = null;
      this.threat = 0;
      this.root.visible = true;
      return true;
    }
    return false;
  }

  nextWander() {
    const ci = this.cell(this.x);
    const cj = this.cell(this.z);
    let opts = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].filter(([dx, dz]) => this.passable(ci, cj, dx, dz));
    const fresh = opts.filter(([dx, dz]) => !this.prev || this.prev[0] !== ci + dx || this.prev[1] !== cj + dz);
    if (fresh.length) opts = fresh;
    if (!opts.length) return null;
    // prefere seguir em frente (vaga pelos corredores longos)
    const fx = Math.round(Math.sin(this.yaw));
    const fz = Math.round(Math.cos(this.yaw));
    const ahead = opts.find(([dx, dz]) => dx === fx && dz === fz);
    const [dx, dz] = ahead && Math.random() < 0.7 ? ahead : opts[Math.floor(Math.random() * opts.length)];
    this.prev = [ci, cj];
    return { x: this.center(ci + dx), z: this.center(cj + dz) };
  }

  update(dt, player) {
    const g = this.game;
    const L = this.L;
    const p = player.pos;
    if (this.state === 'off') {
      this.timer -= dt;
      if (this.timer <= 0 && !this.appear(player)) this.timer = 3;
      return;
    }
    this.t = (this.t || 0) + dt;
    const dx = p.x - this.x;
    const dz = p.z - this.z;
    const d = Math.hypot(dx, dz);
    const sees = d < 40 && L.los(this.x, this.z, p.x, p.z);
    // lanterna apontada para ela?
    const fx = -Math.sin(player.yaw) * Math.cos(player.pitch);
    const fz = -Math.cos(player.yaw) * Math.cos(player.pitch);
    const lit = player.flashOn && sees && d < 16 && (-dx * fx - dz * fz) / Math.max(d, 0.01) > 0.94;
    let speed = 0;
    if (this.state === 'wander') {
      // ameaça: perto demais ou luz no rosto
      const near = sees && d < 4.5;
      if (near) this.threat += dt * (5.5 - d) * 0.35;
      if (lit) this.threat += dt * 0.9;
      if (!near && !lit) this.threat = Math.max(0, this.threat - dt * 0.25);
      if (this.threat > 0.25 && !this.warned) {
        this.warned = true;
        g.hud.message(lit ? 'A Figura para. Vira a cabeça para a luz. Abaixe a lanterna.' : 'A Figura para e vira para você. Afaste-se, devagar.', 4);
        g.audio.play('whisper', { gain: 0.2, rate: 0.5, wet: 1.2 });
      }
      if (this.threat < 0.05) this.warned = false;
      if (this.threat > 0.25) {
        // parada, olhando, tremendo
        this.yaw += angleDiff(Math.atan2(dx, dz), this.yaw) * Math.min(1, dt * 3);
        this.head.rotation.z = Math.sin(this.t * 30) * 0.12 * this.threat;
      } else {
        speed = WANDER;
        this.head.rotation.z = 0;
      }
      if (this.threat >= 1) this.agitate();
      if (d > 70) this.hide(12);
      if (!L.toldSeen && sees && d < 22) {
        L.toldSeen = true;
        g.hud.message('Alguém todo branco, andando devagar pelo corredor. Não parece te notar. Não chegue perto — nem jogue luz nele.', 6);
      }
    } else if (this.state === 'angry') {
      speed = this.t > 1.2 ? CHASE : 0;
      this.lost = sees ? 0 : (this.lost || 0) + dt;
      g.st.fear = Math.max(g.st.fear, clamp(1 - d / 25, 0.35, 1));
      this.head.rotation.set(Math.sin(this.t * 17) * 0.3, Math.sin(this.t * 23) * 0.5, Math.sin(this.t * 29) * 0.3);
      this.growlT = (this.growlT || 0) - dt;
      if (this.growlT <= 0) {
        this.growlT = 1.2 + Math.random() * 1.6;
        g.audio.play(Math.random() < 0.5 ? 'scare' : 'whisper', { gain: clamp(0.4 - d / 70, 0.06, 0.4), rate: 0.5 + Math.random() * 0.3, wet: 0.9 });
      }
      if (d < 1.0 && this.t > 1.2) {
        g.caught({ image: this.face, text: 'A Figura te alcançou. Ela não ataca quem a deixa em paz: não chegue perto e não aponte a lanterna para ela.', sanity: 50 });
        this.hide(40);
        return;
      }
      if (this.lost > CALM || d > 60) {
        g.hud.message('Silêncio. A Figura se acalmou… em algum lugar.', 4);
        this.hide(25);
        return;
      }
    }
    if (speed > 0) {
      if (this.state === 'angry') {
        this.pathT = (this.pathT || 0) - dt;
        if (!sees && (this.pathT <= 0 || !this.wp)) {
          this.pathT = 0.25;
          this.wp = this.pathStep(p.x, p.z);
        }
      } else if (!this.wp || Math.hypot(this.wp.x - this.x, this.wp.z - this.z) < 0.15) this.wp = this.nextWander();
      const tgt = this.state === 'angry' && (sees || !this.wp) ? { x: p.x, z: p.z } : this.wp;
      if (tgt) {
        const ax = tgt.x - this.x;
        const az = tgt.z - this.z;
        const al = Math.hypot(ax, az) || 1;
        const step = Math.min(al, speed * dt);
        const q = { x: this.x + (ax / al) * step, z: this.z + (az / al) * step };
        L.collide(q, 0.3);
        this.x = q.x;
        this.z = q.z;
        this.yaw += angleDiff(Math.atan2(ax, az), this.yaw) * Math.min(1, dt * (this.state === 'angry' ? 10 : 3));
        this.ph = (this.ph || 0) + dt * speed * 2.6;
      }
    }
    // pose: passos lentos e braços pendurados; furiosa, braços para frente
    const walk = speed > 0 ? 1 : 0;
    const ph = this.ph || 0;
    for (const l of this.legs) l.hip.rotation.x = Math.sin(ph) * (this.state === 'angry' ? 0.75 : 0.35) * l.s * walk;
    for (const a of this.arms) {
      if (this.state === 'angry') {
        a.sh.rotation.x = -1.35 + Math.sin(ph * 2 + a.s) * 0.3;
        a.sh.rotation.z = a.s * 0.25;
      } else {
        a.sh.rotation.x = Math.sin(ph) * 0.15 * -a.s * walk;
        a.sh.rotation.z = a.s * 0.04;
      }
    }
    this.root.position.set(this.x, 0, this.z);
    this.root.rotation.set(this.state === 'angry' ? 0.15 : 0, this.yaw, 0);
    this.glow.intensity = this.state === 'angry' ? 3 + Math.sin(this.t * 20) * 1.5 : 1.2;
    this.mat.emissiveIntensity = this.state === 'angry' ? 0.9 + Math.sin(this.t * 25) * 0.3 : 0.55;
  }

  agitate() {
    const g = this.game;
    this.state = 'angry';
    this.t = 0;
    this.lost = 0;
    this.wp = null;
    this.L.chased = true;
    g.glitch = 0.9;
    g.audio.play('scare');
    g.audio.play('growl', { gain: 0.5, rate: 0.5, wet: 0.8 });
    g.vibrate([80, 40, 200]);
    g.hud.message(this.L.toldAngry ? 'A Figura se agitou de novo. CORRA!' : 'A Figura grita sem boca. Ela está vindo. CORRA!', 4);
    this.L.toldAngry = true;
  }

  hide(t) {
    this.state = 'off';
    this.root.visible = false;
    this.timer = t;
    this.threat = 0;
    this.L.chased = false;
  }

  get active() {
    return this.state !== 'off';
  }

  dispose() {
    this.root.removeFromParent();
    this.mat.dispose();
    for (const g of this.geos) g.dispose();
  }
}
