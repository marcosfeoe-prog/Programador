// Nível 35 — a criatura: um bicho enorme e magro, de quatro patas compridas,
// que surge raramente nos cantos mais escuros do estacionamento. Ela não liga
// para quem anda devagar: fica parada, respirando, olhando. Mas se o andarilho
// CORRER, ela dispara atrás dele, muito mais rápida que qualquer pessoa. Parar
// de correr faz ela perder o interesse aos poucos.
import * as THREE from 'three';
import { clamp, damp, TAU } from '../util.js';

const CHASE = 10.5;
const REACH = 1.9;

function faceURL() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const c = cv.getContext('2d');
  c.fillStyle = '#000';
  c.fillRect(0, 0, 256, 256);
  // cabeça comprida e cinzenta saindo do escuro
  const g = c.createRadialGradient(128, 150, 10, 128, 150, 120);
  g.addColorStop(0, '#6a645c');
  g.addColorStop(0.55, '#2a2622');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.beginPath();
  c.ellipse(128, 150, 62, 118, 0, 0, TAU);
  c.fill();
  for (const x of [100, 156]) {
    const e = c.createRadialGradient(x, 104, 0, x, 104, 16);
    e.addColorStop(0, 'rgba(255,250,230,1)');
    e.addColorStop(0.4, 'rgba(220,210,170,0.6)');
    e.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = e;
    c.beginPath();
    c.arc(x, 104, 16, 0, TAU);
    c.fill();
  }
  // boca aberta, vertical
  c.fillStyle = '#050303';
  c.beginPath();
  c.ellipse(128, 196, 22, 46, 0, 0, TAU);
  c.fill();
  c.fillStyle = 'rgba(220,210,190,0.85)';
  for (let k = 0; k < 9; k++) {
    const y = 158 + k * 9;
    c.fillRect(108 + (k % 2) * 2, y, 8, 3);
    c.fillRect(140 - (k % 2) * 2, y, 8, 3);
  }
  return cv.toDataURL();
}

export class Creature {
  constructor(level) {
    this.L = level;
    this.game = level.game;
    this.mat = new THREE.MeshStandardMaterial({ color: 0x4a443c, roughness: 0.9, metalness: 0, emissive: 0x221e1a });
    this.eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.3, 1.9) });
    const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 4, 10);
    this.geos = [];
    const G = (g) => {
      this.geos.push(g);
      return g;
    };
    const root = new THREE.Group();
    const body = new THREE.Group();
    body.position.y = 2.25;
    root.add(body);
    // tronco comprido, costelas marcadas
    const torso = new THREE.Mesh(G(cap(0.36, 1.5)), this.mat);
    torso.rotation.x = Math.PI / 2;
    torso.scale.set(1, 1, 0.85);
    body.add(torso);
    const chest = new THREE.Mesh(G(new THREE.SphereGeometry(0.5, 14, 10)), this.mat);
    chest.position.set(0, 0.05, 0.75);
    chest.scale.set(1, 0.9, 1.05);
    body.add(chest);
    for (let k = 0; k < 5; k++) {
      const rib = new THREE.Mesh(G(new THREE.TorusGeometry(0.4 - k * 0.02, 0.025, 5, 14, Math.PI)), this.mat);
      rib.position.set(0, -0.02, 0.55 - k * 0.22);
      rib.rotation.set(Math.PI, 0, 0);
      body.add(rib);
    }
    // pescoço e cabeça
    const neck = new THREE.Group();
    neck.position.set(0, 0.25, 1.1);
    body.add(neck);
    const nm = new THREE.Mesh(G(cap(0.14, 0.9)), this.mat);
    nm.rotation.x = 0.9;
    nm.position.set(0, 0.25, 0.35);
    neck.add(nm);
    const head = new THREE.Group();
    head.position.set(0, 0.55, 0.75);
    neck.add(head);
    const skull = new THREE.Mesh(G(new THREE.SphereGeometry(0.26, 14, 10)), this.mat);
    skull.scale.set(0.85, 0.95, 1.6);
    skull.position.z = 0.12;
    head.add(skull);
    const jaw = new THREE.Mesh(G(new THREE.SphereGeometry(0.18, 10, 8)), this.mat);
    jaw.scale.set(0.8, 0.5, 1.6);
    jaw.position.set(0, -0.16, 0.22);
    head.add(jaw);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(G(new THREE.SphereGeometry(0.05, 8, 6)), this.eyeMat);
      eye.position.set(s * 0.12, 0.06, 0.42);
      head.add(eye);
    }
    // quatro patas compridas (coxa + canela), dianteiras mais longas
    this.legs = [];
    for (const [x, z, front, ph] of [
      [-0.32, 0.75, true, 0],
      [0.32, 0.75, true, Math.PI],
      [-0.3, -0.75, false, Math.PI],
      [0.3, -0.75, false, 0],
    ]) {
      const hip = new THREE.Group();
      hip.position.set(x, 0.0, z);
      body.add(hip);
      const up = front ? 1.25 : 1.15;
      const lo = front ? 1.3 : 1.2;
      const th = new THREE.Mesh(G(cap(0.09, up)), this.mat);
      th.position.y = -up / 2;
      hip.add(th);
      const knee = new THREE.Group();
      knee.position.y = -up;
      hip.add(knee);
      const sh = new THREE.Mesh(G(cap(0.06, lo)), this.mat);
      sh.position.y = -lo / 2;
      knee.add(sh);
      const foot = new THREE.Mesh(G(new THREE.SphereGeometry(0.1, 8, 6)), this.mat);
      foot.scale.set(1, 0.4, 1.8);
      foot.position.set(0, -lo, 0.08);
      knee.add(foot);
      // a canela dobra ao contrário nas patas de trás
      this.legs.push({ hip, knee, ph, front, base: front ? -0.25 : 0.25 });
    }
    // cabe curvada sob o teto baixo da garagem (≈ 2,5 m de altura)
    root.scale.setScalar(0.76);
    root.visible = false;
    level.dynamic.add(root);
    this.root = root;
    this.body = body;
    this.neck = neck;
    this.head = head;
    this.state = 'off';
    this.timer = 45 + Math.random() * 30;
    this.x = 0;
    this.z = 0;
    this.yaw = 0;
    this.speed = 0;
    this.phase = 0;
    this.face = null;
  }

  faceURL() {
    if (!this.face) this.face = faceURL();
    return this.face;
  }

  reset(delay = 50) {
    this.state = 'off';
    this.root.visible = false;
    this.timer = delay + Math.random() * 30;
    this.speed = 0;
  }

  // Tenta surgir num canto escuro, longe e fora da vista.
  spawn(player, near = false) {
    const L = this.L;
    const P = player.pos;
    const fx = -Math.sin(player.yaw);
    const fz = -Math.cos(player.yaw);
    for (let t = 0; t < 40; t++) {
      const a = Math.random() * TAU;
      const r = near ? 14 + Math.random() * 10 : 18 + Math.random() * 18;
      const x = P.x + Math.cos(a) * r;
      const z = P.z + Math.sin(a) * r;
      if (!L.inside(x, z, 3)) continue;
      if (L.lightLevel(x, z) > (near ? 0.25 : 0.1)) continue;
      const dot = ((x - P.x) * fx + (z - P.z) * fz) / r;
      if (!near && dot > 0.4) continue;
      const p = { x, z };
      L.collide(p, 0.9);
      if (Math.hypot(p.x - x, p.z - z) > 0.05) continue;
      this.x = x;
      this.z = z;
      this.yaw = Math.atan2(P.x - x, P.z - z);
      this.state = 'lurk';
      this.timer = 30 + Math.random() * 25;
      this.speed = 0;
      this.calm = 0;
      this.seen = false;
      this.root.visible = true;
      return true;
    }
    return false;
  }

  update(dt, player, enabled) {
    const g = this.game;
    const L = this.L;
    const P = player.pos;
    if (!enabled) {
      if (this.state !== 'off') this.reset(25);
      return 0;
    }
    if (this.state === 'off') {
      this.timer -= dt;
      if (this.timer <= 0) {
        if (!this.spawn(player)) this.timer = 6;
        else if (!this.toldNear) {
          this.toldNear = true;
          g.audio.play('breath', { gain: 0.2, rate: 0.45, wet: 1.2 });
        }
      }
      return 0;
    }
    const dx = P.x - this.x;
    const dz = P.z - this.z;
    const d = Math.hypot(dx, dz) || 0.01;
    const toYaw = Math.atan2(dx, dz);
    const run = player.sprinting;
    const fx = -Math.sin(player.yaw);
    const fz = -Math.cos(player.yaw);
    const inView = (-dx * fx - dz * fz) / d > 0.75 && L.los(P.x, P.z, this.x, this.z, 1.6);
    let want = 0;
    let face = toYaw;
    if (this.state === 'lurk') {
      this.timer -= dt;
      if (run && d < 50) {
        this.state = 'alert';
        this.timer = 0.75;
        g.audio.play('growl', { gain: 0.55, rate: 0.42, wet: 1.2 });
        g.audio.sting();
        g.hud.message('Ela ouviu você correr. PARE DE CORRER!', 3);
      } else if (this.timer <= 0) {
        this.state = 'leave';
        this.timer = 8;
      }
    } else if (this.state === 'alert') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'chase';
        this.calm = 0;
      }
    } else if (this.state === 'chase') {
      want = CHASE;
      this.calm = run ? 0 : this.calm + dt;
      if (this.calm > 0.9) {
        this.state = 'stalk';
        this.timer = 6;
        g.audio.play('breath', { gain: 0.35, rate: 0.4, wet: 0.8 });
      }
      if (d < REACH && !g.transitioning) {
        g.caught({ image: this.faceURL(), text: 'A criatura te alcançou. Ela só persegue quem corre: no Nível 35, ande devagar.', sanity: 55 });
        this.state = 'leave';
        this.timer = 6;
        this.cool = true;
      }
    } else if (this.state === 'stalk') {
      this.timer -= dt;
      if (run && d < 50) {
        this.state = 'chase';
        this.calm = 0;
        g.audio.play('growl', { gain: 0.45, rate: 0.5, wet: 1 });
      } else if (this.timer <= 0) {
        this.state = 'leave';
        this.timer = 8;
      }
    } else if (this.state === 'leave') {
      this.timer -= dt;
      want = 2.4;
      face = toYaw + Math.PI;
      if (this.timer <= 0 || (!inView && d > 26)) {
        this.reset(this.cool ? 90 : 70);
        this.cool = false;
        return 0;
      }
    }
    // movimento
    this.speed = damp(this.speed, want, want > this.speed ? 2.2 : 4, dt);
    let dy = face - this.yaw;
    while (dy > Math.PI) dy -= TAU;
    while (dy < -Math.PI) dy += TAU;
    this.yaw += dy * Math.min(1, dt * (this.state === 'chase' ? 6 : 1.6));
    if (this.speed > 0.05) {
      const p = { x: this.x + Math.sin(this.yaw) * this.speed * dt, z: this.z + Math.cos(this.yaw) * this.speed * dt };
      L.collide(p, 0.8);
      this.x = p.x;
      this.z = p.z;
    }
    // passos pesados
    this.phase += dt * (0.8 + this.speed * 0.55);
    if (this.speed > 1) {
      this.stepT = (this.stepT || 0) - dt * this.speed;
      if (this.stepT <= 0) {
        this.stepT = 2.2;
        const k = clamp(1 - d / 40, 0, 1);
        g.audio.play('knock', { gain: 0.25 * k * (this.speed / CHASE + 0.3), rate: 0.35 + Math.random() * 0.1, wet: 0.8 });
        if (this.speed > 6) g.vibrate(20);
      }
    } else if (d < 28) {
      this.breathT = (this.breathT || 0) - dt;
      if (this.breathT <= 0) {
        this.breathT = 3 + Math.random() * 2.5;
        g.audio.play('breath', { gain: clamp(1 - d / 28, 0, 1) * 0.25, rate: 0.38 + Math.random() * 0.06, wet: 1 });
      }
    }
    // primeira vez que aparece na luz da lanterna ou perto
    if (!this.seen && inView && d < 30) {
      this.seen = true;
      g.addSanity(-6);
      g.audio.sting();
      if (!this.toldSeen) {
        this.toldSeen = true;
        g.hud.message('Algo enorme, de quatro, no canto escuro. Ele está olhando. NÃO CORRA.', 5);
      }
    }
    this.animate(dt, player, d);
    // medo e rosnado para o coração e o áudio
    let fear;
    if (this.state === 'chase' || this.state === 'alert') fear = clamp(1.3 - d / 30, 0.5, 1);
    else fear = clamp(1 - d / 26, 0, 0.7);
    g.st.growl = { x: this.x, z: this.z, v: this.state === 'chase' ? 0.8 : clamp(1 - d / 20, 0, 0.4) };
    return fear;
  }

  animate(dt, player, d) {
    const s = this.speed;
    const amp = clamp(s / 6, 0.12, 0.85);
    const t = this.phase;
    for (const l of this.legs) {
      const a = Math.sin(t + l.ph) * amp;
      l.hip.rotation.x = l.base * 0.4 + a;
      const bend = Math.max(0, -Math.cos(t + l.ph)) * amp * 1.3 + 0.2;
      l.knee.rotation.x = l.front ? -bend * 0.6 + 0.25 : bend;
    }
    const rear = this.state === 'alert' ? 0.35 : 0;
    this.body.rotation.x = damp(this.body.rotation.x, -rear + (s > 4 ? 0.12 : 0), 4, dt);
    this.body.position.y = 2.25 + Math.sin(t * 2) * 0.04 * (0.3 + amp) + (s < 0.5 ? Math.sin(this.game.time * 1.3) * 0.03 : 0);
    // a cabeça acompanha o andarilho
    const P = player.pos;
    let hy = Math.atan2(P.x - this.x, P.z - this.z) - this.yaw;
    while (hy > Math.PI) hy -= 2 * Math.PI;
    while (hy < -Math.PI) hy += 2 * Math.PI;
    this.neck.rotation.y = damp(this.neck.rotation.y, clamp(hy, -1.1, 1.1), 3, dt);
    this.head.rotation.z = Math.sin(this.game.time * 0.7) * 0.15 * (s < 1 ? 1 : 0.2);
    this.head.rotation.x = damp(this.head.rotation.x, d < 6 ? 0.35 : 0.1, 2, dt);
    this.root.position.set(this.x, 0, this.z);
    this.root.rotation.y = this.yaw;
  }

  dispose() {
    this.L.dynamic.remove(this.root);
    for (const g of this.geos) g.dispose();
    this.mat.dispose();
    this.eyeMat.dispose();
  }
}
