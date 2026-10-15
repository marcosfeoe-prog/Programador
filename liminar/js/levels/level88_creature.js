// Nível 88 — as entidades do Lago Silencioso.
//
// A Criatura: corpo comprido e magro, pele pálida e úmida, braços longos
// demais, cabeça sem olhos com uma boca enorme. Ronda a mata perto da cabana;
// se vê ou ouve o andarilho, grita e corre atrás dele. Só a cabana com a porta
// fechada salva. Ela não entra na água.
//
// A Sombra: uma figura negra e alta que aparece entre as árvores, sempre de
// longe, olhando. Não faz barulho. Some quando você chega perto.
import * as THREE from 'three';
import { pushCircle } from './grid.js';
import { TEX } from '../textures.js';
import { litMaterial } from '../materials.js';
import { angleDiff, clamp, damp, mulberry32, TAU } from '../util.js';
import { groundH, shoreS, zc, halfW } from './level88_world.js';

const _f = new THREE.Vector3();

// Junta várias geometrias (cada uma com sua matriz) numa só, para economizar
// chamadas de desenho no celular.
function merge(parts) {
  const pos = [];
  const nor = [];
  const nm = new THREE.Matrix3();
  const v = new THREE.Vector3();
  for (const [g0, m] of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    nm.getNormalMatrix(m);
    const P = g.attributes.position;
    const N = g.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m);
      pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
      nor.push(v.x, v.y, v.z);
    }
    if (g !== g0) g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}
const M4 = (x, y, z, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)).setPosition(x, y, z);

// Pele: cinza-rosada doente, veias escuras, manchas, costelas marcadas.
function skinTex(S = 256) {
  const n = TEX.noiseField(S, S, 6, 6, 5, 8881);
  const v = TEX.noiseField(S, S, 16, 16, 3, 8882);
  const hf = new Float32Array(S * S);
  const cv = TEX.paintRGB(S, S, (x, y, i, o) => {
    const vein = Math.abs(v[i] - 0.5) < 0.018 ? 0.55 : 1;
    const rib = 0.85 + 0.15 * Math.sin((y / S) * TAU * 14);
    const k = (0.72 + n[i] * 0.35) * vein * rib;
    o[0] = 0.62 * k;
    o[1] = 0.55 * k;
    o[2] = 0.52 * k;
    hf[i] = rib * 0.6 + n[i] * 0.4 - (vein < 1 ? 0.2 : 0);
  });
  return { map: TEX.toTex(cv), normalMap: TEX.normalMap(hf, S, S, 3) };
}

// Imagem do susto (desenhada em canvas).
export function creatureScareURL() {
  const W = 640;
  const H = 400;
  const cv = TEX.makeCanvas(W, H);
  const c = cv.getContext('2d');
  c.fillStyle = '#000';
  c.fillRect(0, 0, W, H);
  const g = c.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, 260);
  g.addColorStop(0, '#5a5452');
  g.addColorStop(0.5, '#2a2524');
  g.addColorStop(1, '#000');
  c.fillStyle = g;
  c.beginPath();
  c.ellipse(W / 2, H / 2 - 20, 170, 200, 0, 0, TAU);
  c.fill();
  // boca enorme
  c.fillStyle = '#120606';
  c.beginPath();
  c.ellipse(W / 2, H / 2 + 40, 130, 110, 0, 0, TAU);
  c.fill();
  c.fillStyle = '#d8ceb0';
  const r = mulberry32(5);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * TAU;
    const x = W / 2 + Math.cos(a) * 125;
    const y = H / 2 + 40 + Math.sin(a) * 104;
    const L = 22 + r() * 30;
    c.beginPath();
    c.moveTo(x - 6, y);
    c.lineTo(x + 6, y);
    c.lineTo(x - Math.cos(a) * L, y - Math.sin(a) * L);
    c.fill();
  }
  c.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 4000; i++) c.fillRect(r() * W, r() * H, 1, 1);
  return cv.toDataURL('image/jpeg', 0.8);
}

// ------------------------------------------------------------ a Criatura
export class Creature {
  constructor(L) {
    this.L = L;
    this.game = L.game;
    const Q = L.Q;
    const sk = skinTex(Q.id === 'low' ? 128 : 256);
    this.skinTex = sk;
    this.mat = litMaterial(Q, { map: sk.map, normalMap: sk.normalMap, roughness: 0.38, metalness: 0.0, color: 0xfff2ea, emissive: 0x1c1817 });
    this.dark = litMaterial(Q, { color: 0x1a0a08, roughness: 0.5 });
    this.teeth = litMaterial(Q, { color: 0xcfc4a0, roughness: 0.3 });
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0x8a8f7a });
    this.mats = [this.mat, this.dark, this.teeth, this.eyeMat];
    this.root = new THREE.Group();
    this.root.scale.setScalar(1.18);
    this.build();
    L.dynamic.add(this.root);
    this.reset(true);
    this.scareURL = creatureScareURL();
  }

  build() {
    const M = this.mat;
    const seg = this.L.Q.id === 'low' ? 7 : 10;
    const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 4, seg);
    const body = new THREE.Group();
    this.root.add(body);
    this.body = body;
    // tronco comprido, inclinado para a frente
    const torso = new THREE.Mesh(cap(0.24, 1.25), M);
    torso.rotation.x = Math.PI / 2 - 0.25;
    torso.scale.set(0.85, 1, 1.15);
    torso.position.set(0, 1.25, 0.1);
    body.add(torso);
    this.torso = torso;
    // espinha saltada
    const cone = new THREE.ConeGeometry(0.05, 0.16, 5);
    const spine = [];
    for (let i = 0; i < 9; i++) spine.push([cone, M4(0, 1.47 - i * 0.03, 0.75 - i * 0.18, -0.3)]);
    body.add(new THREE.Mesh(merge(spine), M));
    cone.dispose();
    const hips = new THREE.Mesh(cap(0.2, 0.2), M);
    hips.position.set(0, 1.08, -0.5);
    body.add(hips);
    // pescoço e cabeça
    const neck = new THREE.Group();
    neck.position.set(0, 1.42, 0.72);
    body.add(neck);
    this.neck = neck;
    const neckM = new THREE.Mesh(cap(0.08, 0.45), M);
    neckM.rotation.x = Math.PI / 2 - 0.5;
    neckM.position.set(0, 0.12, 0.2);
    neck.add(neckM);
    const head = new THREE.Group();
    head.position.set(0, 0.26, 0.48);
    neck.add(head);
    this.head = head;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, seg + 4, seg), M);
    skull.scale.set(0.85, 0.8, 1.45);
    head.add(skull);
    // mandíbula aberta com dentes
    const jaw = new THREE.Group();
    jaw.position.set(0, -0.06, 0.02);
    head.add(jaw);
    this.jaw = jaw;
    const jawM = new THREE.Mesh(new THREE.SphereGeometry(0.17, seg, 6, 0, TAU, Math.PI / 2, Math.PI / 2), M);
    jawM.scale.set(0.9, 0.7, 1.7);
    jaw.add(jawM);
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.15, seg, 6), this.dark);
    mouth.scale.set(0.8, 0.5, 1.5);
    mouth.position.set(0, -0.02, 0.05);
    head.add(mouth);
    const toothG = new THREE.ConeGeometry(0.014, 0.07, 4);
    const upT = [];
    const loT = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 17 - 0.5) * 2.6;
      upT.push([toothG, M4(Math.sin(a) * 0.13, 0.012 - 0.02, 0.05 + Math.cos(a) * 0.24, Math.PI)]);
      loT.push([toothG, M4(Math.sin(a) * 0.13, -0.012 - 0.02, 0.05 + Math.cos(a) * 0.24)]);
    }
    head.add(new THREE.Mesh(merge(upT), this.teeth));
    jaw.add(new THREE.Mesh(merge(loT), this.teeth));
    toothG.dispose();
    // pontinhos que refletem a lanterna (no lugar dos olhos)
    const eyeG = new THREE.SphereGeometry(0.012, 5, 4);
    const eyes = [];
    for (let i = 0; i < 5; i++) eyes.push([eyeG, M4((i - 2) * 0.045, 0.1 + Math.abs(i - 2) * -0.01, 0.2)]);
    head.add(new THREE.Mesh(merge(eyes), this.eyeMat));
    eyeG.dispose();
    // membros: [ombro, comprimento superior, inferior, dianteiro?]
    this.limbs = [];
    const limb = (x, y, z, l1, l2, front, side) => {
      const sh = new THREE.Group();
      sh.position.set(x, y, z);
      body.add(sh);
      const up = new THREE.Mesh(cap(front ? 0.055 : 0.075, l1), M);
      up.position.y = -l1 / 2;
      sh.add(up);
      const el = new THREE.Group();
      el.position.y = -l1;
      sh.add(el);
      const lo = new THREE.Mesh(cap(front ? 0.04 : 0.05, l2), M);
      lo.position.y = -l2 / 2;
      el.add(lo);
      // dedos compridos
      const hand = new THREE.Group();
      hand.position.y = -l2;
      el.add(hand);
      const fg = cap(0.012, front ? 0.22 : 0.12);
      const fingers = [];
      for (let k = 0; k < (front ? 4 : 3); k++) fingers.push([fg, M4((k - 1.5) * 0.03, -0.05, 0.08, 1.2, 0, (k - 1.5) * 0.25)]);
      hand.add(new THREE.Mesh(merge(fingers), M));
      fg.dispose();
      this.limbs.push({ sh, el, front, side, l1, l2 });
    };
    limb(-0.24, 1.32, 0.55, 0.95, 1.0, true, -1);
    limb(0.24, 1.32, 0.55, 0.95, 1.0, true, 1);
    limb(-0.2, 1.08, -0.5, 0.6, 0.62, false, -1);
    limb(0.2, 1.08, -0.5, 0.6, 0.62, false, 1);
  }

  // Surge à noite, longe do jogador, no fundo da mata.
  appear(p) {
    const L = this.L;
    this.active = true;
    this.root.visible = true;
    this.state = 'roam';
    this.target = null;
    this.cool = 6;
    const side = p.x > L.cabin.x ? -1 : 1;
    this.x = clamp(p.x + side * (70 + Math.random() * 30), -200, 200);
    this.z = L.trailZ(this.x) + 22;
    this.game.hud.message('Do fundo da mata vem um grito comprido. Algo acordou com a noite.', 5);
    this.playAt('scare', 0.5, 0.45);
  }

  reset(first) {
    const L = this.L;
    this.active = false;
    this.root.visible = false;
    this.state = 'roam';
    this.x = 30;
    this.z = L.trailZ(30) + 18;
    if (!first) {
      // longe do jogador
      const p = this.game.player.pos;
      this.x = p.x > -40 ? -130 : 60;
      this.z = L.trailZ(this.x) + 20;
    }
    this.yaw = 0;
    this.speed = 0;
    this.phase = 0;
    this.target = null;
    this.alertT = 0;
    this.cool = first ? 45 : 30;
    this.siegeT = 0;
    this.lostT = 0;
    this.scream = 0;
    this.jawOpen = 0;
    this.rear = 0;
    this.knockT = 0;
    this.stepT = 0;
    this.waitT = 0;
    this.root.position.set(this.x, groundH(this.x, this.z), this.z);
  }

  // Ponto aleatório para rondar (mata da margem sul, perto da cabana).
  pickRoam() {
    const L = this.L;
    const r = Math.random;
    for (let k = 0; k < 20; k++) {
      const x = L.cabin.x - 120 + r() * 220;
      const z = L.trailZ(x) + (r() - 0.35) * 50;
      if (shoreS(x, z) < 3) continue;
      if (Math.hypot(x - L.cabin.x, z - L.cabin.z) < 14) continue;
      return { x, z };
    }
    return { x: L.cabin.x + 30, z: L.trailZ(L.cabin.x + 30) + 15 };
  }

  // som com pan/volume pela posição relativa à câmera
  playAt(name, gain, rate = 1) {
    const g = this.game;
    const cam = g.camera.position;
    const dx = this.x - cam.x;
    const dz = this.z - cam.z;
    const d = Math.hypot(dx, dz);
    const rx = Math.cos(g.player.yaw);
    const rz = -Math.sin(g.player.yaw);
    const pan = clamp((dx * rx + dz * rz) / Math.max(d, 1), -1, 1);
    const k = gain / (1 + d * d * 0.004);
    if (k < 0.004) return;
    g.audio.play(name, { gain: k * (1 - 0.7 * (g.audio.muffK || 0)), rate, pan, wet: 0.4 + Math.min(1, d / 40) });
  }

  // O jogador está escondido (dentro da cabana com a porta fechada)?
  hidden(p) {
    const c = this.L.cabin;
    return c.inside(p.x, p.z) && c.closed();
  }

  detect(p, d, dayK) {
    const L = this.L;
    const g = this.game;
    if (this.cool > 0 || L.safeT > 0) return false;
    if (this.hidden(p)) return false;
    if (L.cabin.inside(p.x, p.z) && d > 6) return false;
    const P = g.player;
    // visão: cone à frente
    const ang = Math.abs(angleDiff(Math.atan2(p.x - this.x, p.z - this.z), this.yaw));
    let sight = 13 + dayK * 21;
    if (P.flashOn) sight += (1 - dayK) * 24;
    if (ang < 1.3 && d < sight) return true;
    // a luz da lanterna batendo nela
    if (P.flashOn && d < 38) {
      P.forward(_f);
      const dot = ((this.x - p.x) * _f.x + (this.z - p.z) * _f.z) / Math.max(d, 0.1) / (Math.hypot(_f.x, _f.z) || 1);
      if (dot > 0.93) return true;
    }
    // audição (o lago engole o som)
    const quiet = 1 - 0.75 * clamp((14 - shoreS(p.x, p.z)) / 14, 0, 1);
    const sprint = P.speed > 3.2;
    const hear = (sprint ? 30 : P.speed > 0.5 ? 9 : 0) * quiet * (g.quietMul || 1);
    return d < hear;
  }

  update(dt, t, player) {
    const L = this.L;
    const g = this.game;
    const p = player.pos;
    const dayK = L.dayK;
    // só existe à noite: some ao amanhecer (a não ser no meio de uma caçada)
    const night = dayK < 0.45;
    const hunting = this.state === 'chase' || this.state === 'alert' || this.state === 'siege';
    if (!this.active) {
      if (!night) return;
      this.appear(p);
    } else if (!night && !hunting) {
      this.active = false;
      this.root.visible = false;
      this.state = 'roam';
      this.dist = 999;
      return;
    }
    let dx = p.x - this.x;
    let dz = p.z - this.z;
    let d = Math.hypot(dx, dz);
    this.cool = Math.max(0, this.cool - dt);
    let tx = null;
    let tz = null;
    let speed = 0;
    const st = this.state;
    this.toDoor = st === 'siege';
    if (st === 'roam') {
      if (!this.target || Math.hypot(this.target.x - this.x, this.target.z - this.z) < 1.5) {
        if (this.target) this.waitT = 2 + Math.random() * 5;
        this.target = this.pickRoam();
      }
      if (this.waitT > 0) this.waitT -= dt;
      else {
        tx = this.target.x;
        tz = this.target.z;
        speed = 1.2;
      }
      if (this.detect(p, d, dayK)) {
        this.state = 'alert';
        this.alertT = 1.1;
        this.scream = 1;
        this.playAt('scare', 1.2, 0.55);
        this.playAt('growl', 1.4, 0.8);
        g.vibrate(120);
      }
    } else if (st === 'alert') {
      this.alertT -= dt;
      tx = p.x;
      tz = p.z;
      speed = 0;
      if (this.alertT <= 0) {
        this.state = 'chase';
        this.lostT = 0;
        g.hud.message('A criatura viu você. Corra para a cabana e feche a porta!', 5);
      }
    } else if (st === 'chase') {
      this.lastX = p.x;
      this.lastZ = p.z;
      speed = 3.6 + (1 - dayK) * 0.5;
      const c = L.cabin;
      if (this.hidden(p)) {
        this.state = 'siege';
        this.siegeT = 12 + Math.random() * 6;
        this.knockT = 1.2;
      } else if (c.inside(p.x, p.z)) {
        // porta aberta: ela não entra, enfia o corpo pelo vão e ataca
        tx = c.doorX;
        tz = c.z - c.D / 2 - 1.1;
        this.toDoor = true;
        if (Math.hypot(this.x - tx, this.z - tz) < 1.6) {
          this.kill();
        }
      } else {
        tx = p.x;
        tz = p.z;
      }
      // perde o rastro: muito longe ou dentro d'água
      const inWater = groundH(p.x, p.z) < -0.35;
      if (d > 58 || inWater) this.lostT += dt;
      else this.lostT = Math.max(0, this.lostT - dt);
      if (this.lostT > (inWater ? 3 : 5)) {
        this.state = 'search';
        this.searchT = 7;
        this.target = { x: this.lastX, z: this.lastZ };
        g.hud.message(inWater ? 'Ela para na margem. Não entra na água. O som some.' : 'Você a despistou… por enquanto.', 4);
      }
      if (d < 1.8 && !c.inside(p.x, p.z)) this.kill();
      // rosnado posicional e medo
      g.st.growl = { x: this.x, z: this.z, v: clamp(1 - d / 40, 0.15, 0.9) };
      g.st.fear = Math.max(g.st.fear, clamp(1 - d / 45, 0.3, 1));
    } else if (st === 'siege') {
      const c = L.cabin;
      tx = c.doorX;
      tz = c.z - c.D / 2 - 1.1;
      speed = 2.5;
      this.siegeT -= dt;
      g.st.fear = Math.max(g.st.fear, 0.7);
      g.st.growl = { x: this.x, z: this.z, v: 0.35 };
      if (Math.hypot(this.x - tx, this.z - tz) < 1.6) {
        this.knockT -= dt;
        if (this.knockT <= 0) {
          this.knockT = 1.4 + Math.random() * 1.6;
          this.playAt('knock', 2.2, 0.6 + Math.random() * 0.2);
          this.playAt('door', 1.2, 0.5);
          g.vibrate(60);
          this.scream = Math.random() < 0.3 ? 1 : this.scream;
        }
      }
      if (!this.hidden(p)) {
        // abriu a porta ou saiu: volta a caçar
        this.state = 'chase';
      } else if (this.siegeT <= 0) {
        this.state = 'roam';
        this.cool = 35;
        this.target = { x: c.x + (Math.random() < 0.5 ? -70 : 70), z: L.trailZ(c.x) + 25 };
        g.hud.message('As batidas param. Passos se afastando para dentro da mata.', 5);
        this.playAt('growl', 1.0, 0.6);
      }
    } else if (st === 'search') {
      this.searchT -= dt;
      tx = this.target.x;
      tz = this.target.z;
      speed = 1.8;
      if (this.detect(p, d, dayK) && groundH(p.x, p.z) > -0.3) {
        this.state = 'chase';
        this.playAt('growl', 1.4, 0.9);
      } else if (this.searchT <= 0) {
        this.state = 'roam';
        this.target = null;
        this.cool = 8;
      }
    }
    // movimento
    let vx = 0;
    let vz = 0;
    if (tx !== null) {
      const ex = tx - this.x;
      const ez = tz - this.z;
      const e = Math.hypot(ex, ez);
      const want = Math.atan2(ex, ez);
      this.yaw += clamp(angleDiff(want, this.yaw), -dt * 4, dt * 4);
      if (speed > 0 && e > 0.3) {
        // desvia dos troncos
        let ax = ex / e;
        let az = ez / e;
        // contorna a cabana (nunca atravessa as paredes)
        const cb = L.cabin;
        const ox0 = this.x - cb.x;
        const oz0 = this.z - cb.z;
        const od0 = Math.hypot(ox0, oz0) || 1;
        // perto da porta (cerco ou ataque) não precisa contornar
        const nearDoor = this.toDoor && Math.hypot(this.x - tx, this.z - tz) < 4;
        if (od0 < 7.5 && !nearDoor) {
          const k = clamp((7.5 - od0) / 3, 0, 1) * 1.6;
          ax += (ox0 / od0) * k;
          az += (oz0 / od0) * k;
          // alvo do outro lado da cabana: dá a volta por fora (tangente)
          const toward = -(ox0 * ax + oz0 * az) / od0;
          if (toward > -0.2) {
            const sg = ox0 * (ez / e) - oz0 * (ex / e) >= 0 ? 1 : -1;
            ax += (-oz0 / od0) * sg * 2.2;
            az += (ox0 / od0) * sg * 2.2;
          }
        }
        for (const tr of L.treesNear(this.x, this.z, 3)) {
          const ox = this.x - tr.x;
          const oz = this.z - tr.z;
          const od = Math.hypot(ox, oz) || 1;
          const k = clamp((2.4 - od) / 2.4, 0, 1) * 1.4;
          ax += (ox / od) * k;
          az += (oz / od) * k;
        }
        const al = Math.hypot(ax, az) || 1;
        this.speed = damp(this.speed, speed, 4, dt);
        vx = (ax / al) * this.speed;
        vz = (az / al) * this.speed;
      } else this.speed = damp(this.speed, 0, 6, dt);
    } else this.speed = damp(this.speed, 0, 6, dt);
    const nx = this.x + vx * dt;
    const nz = this.z + vz * dt;
    // não entra na água
    if (groundH(nx, nz) > -0.25) {
      this.x = nx;
      this.z = nz;
    } else if (groundH(nx, this.z) > -0.25) this.x = nx;
    else if (groundH(this.x, nz) > -0.25) this.z = nz;
    const q = { x: this.x, z: this.z };
    for (const b of L.colliders) pushCircle(q, 0.45, b[0], b[1], b[2], b[3]);
    // a cabana inteira é sólida para ela (o corpo é comprido)
    const cb = L.cabin;
    pushCircle(q, 1.1, cb.x - cb.W / 2, cb.x + cb.W / 2, cb.z - cb.D / 2, cb.z + cb.D / 2);
    this.x = q.x;
    this.z = q.z;
    this.animate(dt, t, p);
    // passos pesados
    if (this.speed > 0.3) {
      this.stepT -= dt * this.speed * 1.6;
      const B = this.game.audio.B;
      if (this.stepT <= 0 && B && B.step) {
        this.stepT = 1;
        this.playAt(B.step.dirt, this.speed > 2.5 ? 1.6 : 0.8, 0.6);
      }
    }
    dx = p.x - this.x;
    dz = p.z - this.z;
    d = Math.hypot(dx, dz);
    this.dist = d;
  }

  animate(dt, t, p) {
    const sp = this.speed;
    const run = clamp(sp / 3.6, 0, 1);
    this.phase += dt * (1.6 + sp * 1.5);
    const ph = this.phase;
    this.scream = Math.max(0, this.scream - dt * 0.8);
    this.jawOpen = damp(this.jawOpen, this.state === 'chase' ? 0.55 + Math.sin(t * 7) * 0.15 : this.scream > 0 ? 0.9 : 0.15, 8, dt);
    this.jaw.rotation.x = this.jawOpen * 0.9;
    this.rear = damp(this.rear, this.state === 'alert' ? 1 : 0, 5, dt);
    const y = groundH(this.x, this.z);
    this.root.position.set(this.x, y + Math.abs(Math.sin(ph)) * 0.06 * run, this.z);
    this.root.rotation.y = this.yaw;
    this.body.rotation.x = -this.rear * 0.55 + run * 0.12 + Math.sin(ph * 2) * 0.03 * run;
    // cabeça com espasmos
    if (Math.random() < dt * 3) this.twitch = (Math.random() - 0.5) * 0.9;
    this.twitchV = damp(this.twitchV || 0, this.twitch || 0, 25, dt);
    const look = Math.atan2(p.x - this.x, p.z - this.z);
    const rel = this.state === 'roam' ? Math.sin(t * 0.7) * 0.4 : clamp(angleDiff(look, this.yaw), -1, 1);
    this.neck.rotation.y = rel * 0.6;
    this.head.rotation.z = this.twitchV * 0.6;
    this.head.rotation.y = this.twitchV * 0.3;
    this.neck.rotation.x = this.state === 'roam' ? 0.25 + Math.sin(t * 1.3) * 0.1 : -0.1 + this.rear * -0.4;
    // passada (galope desajeitado)
    for (const l of this.limbs) {
      const off = (l.front ? 0 : Math.PI) + (l.side > 0 ? Math.PI * 0.5 : 0);
      const s = Math.sin(ph + off);
      const amp = 0.25 + run * 0.55;
      l.sh.rotation.x = (l.front ? -0.35 : 0.3) + s * amp - (l.front ? this.rear * 1.1 : 0);
      l.el.rotation.x = (l.front ? 0.5 : -0.75) + Math.max(0, -Math.cos(ph + off)) * amp * (l.front ? 0.6 : -0.8);
      l.sh.rotation.z = l.side * 0.12;
    }
    // olhos que brilham na lanterna
    const P = this.game.player;
    this.eyeMat.color.setScalar(P.flashOn ? 1.8 : 0.25);
  }

  kill() {
    const g = this.game;
    if (g.transitioning || this.L.dead) return;
    this.L.dead = true;
    g.caught({ image: this.scareURL, text: 'A criatura te alcançou.', sanity: 100 });
    g.vibrate([300, 80, 400]);
  }

  dispose() {
    for (const m of this.mats) m.dispose();
    this.skinTex.map.dispose();
    this.skinTex.normalMap.dispose();
    this.root.traverse((o) => o.geometry && o.geometry.dispose());
  }
}

// ------------------------------------------------------------ a Sombra
export class Shade {
  constructor(L) {
    this.L = L;
    this.game = L.game;
    // preto que a neblina quase não apaga
    this.mat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 1, fog: true });
    this.mat.onBeforeCompile = (sh) => {
      // o #include ainda não foi expandido: troca pelo trecho com a neblina reduzida
      const fogChunk = THREE.ShaderChunk.fog_fragment.replace('fogColor, fogFactor )', 'fogColor, fogFactor * 0.55 )');
      sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', fogChunk);
    };
    this.mat.customProgramCacheKey = () => 'l88-shade';
    const g = new THREE.Group();
    const m = this.mat;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 1.35, 4, 8), m);
    body.position.y = 1.55;
    body.scale.z = 0.55;
    const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.85, 3, 6), m);
    legs.position.set(-0.08, 0.5, 0);
    const legs2 = legs.clone();
    legs2.position.x = 0.08;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), m);
    head.scale.set(0.9, 1.3, 1);
    head.position.y = 2.48;
    const arms = [];
    for (const s of [-1, 1]) {
      const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 1.35, 3, 6), m);
      a.position.set(s * 0.22, 1.45, 0.02);
      a.rotation.z = s * 0.05;
      arms.push(a);
    }
    g.add(body, legs, legs2, head, ...arms);
    this.head = head;
    g.visible = false;
    L.dynamic.add(g);
    this.mesh = g;
    this.state = 0;
    this.timer = 30;
    this.fade = 0;
  }

  tryAppear(player) {
    const L = this.L;
    const p = player.pos;
    const behind = Math.random() < 0.25;
    for (let k = 0; k < 14; k++) {
      const a = player.yaw + (behind ? Math.PI : 0) + (Math.random() - 0.5) * 1.2;
      const r = 26 + Math.random() * 22;
      const x = p.x - Math.sin(a) * r;
      const z = p.z - Math.cos(a) * r;
      if (shoreS(x, z) < 2) continue;
      // ao lado de um tronco, meio escondida
      const trees = L.treesNear(x, z, 4);
      if (!trees.length) continue;
      const t = trees[0];
      const ox = x - t.x;
      const oz = z - t.z;
      const ol = Math.hypot(ox, oz) || 1;
      const sx = t.x + (ox / ol) * 0.7;
      const sz = t.z + (oz / ol) * 0.7;
      this.mesh.position.set(sx, groundH(sx, sz) - 0.05, sz);
      this.mesh.visible = true;
      this.state = 1;
      this.life = 0;
      this.seen = 0;
      this.fade = 1;
      this.mat.opacity = 1;
      return true;
    }
    return false;
  }

  update(dt, t, player) {
    const L = this.L;
    const g = this.game;
    const p = player.pos;
    if (this.state === 0) {
      if (L.creature.state !== 'roam') return;
      this.timer -= dt;
      if (this.timer <= 0) {
        if (!this.tryAppear(player)) this.timer = 3;
      }
      return;
    }
    const m = this.mesh;
    this.life += dt;
    const dx = m.position.x - p.x;
    const dz = m.position.z - p.z;
    const d = Math.hypot(dx, dz);
    m.rotation.y = Math.atan2(-dx, -dz);
    this.head.rotation.z = Math.sin(t * 0.6) * 0.15 + 0.2;
    player.forward(_f);
    const dot = (dx * _f.x + dz * _f.z) / Math.max(d, 0.1) / (Math.hypot(_f.x, _f.z) || 1);
    const inView = dot > 0.85;
    if (inView) {
      this.seen += dt;
      if (this.seen > 0.8 && !this.stung) {
        this.stung = true;
        g.audio.sting();
        g.addSanity(-3);
      }
    }
    const lit = player.flashOn && dot > 0.95 && d < 32;
    if (this.state === 1 && (d < 19 || lit || this.seen > 5 || this.life > 45 || L.creature.state !== 'roam')) {
      this.state = 2;
      g.audio.play('whisper', { gain: 0.05, rate: 1.6, wet: 1.2 });
    }
    if (this.state === 2) {
      this.fade -= dt * 3;
      this.mat.opacity = Math.max(0, this.fade);
      m.scale.y = 1 + (1 - this.fade) * 0.15;
      if (this.fade <= 0) {
        m.visible = false;
        m.scale.y = 1;
        this.state = 0;
        this.stung = false;
        this.timer = 35 + Math.random() * 40;
      }
    }
  }

  dispose() {
    this.mat.dispose();
    this.mesh.traverse((o) => o.geometry && o.geometry.dispose());
  }
}

export { zc, halfW };
