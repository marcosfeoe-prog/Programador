// Nível 9 — os Cães: criaturas pálidas, magras e quase humanas que andam de quatro
// pelas ruas. Não enxergam bem: caçam pelo som. Não entram nas poças de luz dos postes acesos.
import * as THREE from 'three';
import { GeoBuilder } from '../materials.js';
import { clamp, damp, angleDiff } from '../util.js';
import { baseMat, injectLamps, houndFaceURL } from './level9_mats.js';
import { P } from './level9_build.js';

const HEAR_RUN = 25; // correr é ouvido até aqui
const HEAR_WALK = 7; // andar é ouvido até aqui
const SMELL = 2.2; // parado, mas perto demais
const CHASE = 4.3;
const ROAM = 1.3;
const FLEE = 5.2;
const MIN_SPAWN = 28;
const GRACE = 20; // segundos sem Cães no começo
const SKIN = [0.8, 0.77, 0.71];
const SKIN2 = [0.66, 0.6, 0.55];
const HAIR = [0.018, 0.016, 0.015];

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _e = new THREE.Euler();

// Elipsoide (esfera escalada) adicionado ao construtor de geometria.
function ellipsoid(gb, sphere, x, y, z, rx, ry, rz, col, rotX = 0) {
  _e.set(rotX, 0, 0);
  _q.setFromEuler(_e);
  _m.compose(_v.set(x, y, z), _q, _s.set(rx, ry, rz));
  gb.addGeometry(sphere, _m, col);
}

// Segmento entre dois pontos (cilindro afinando).
function bone(gb, a, b, r0, r1, col, sides = 7) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  const g = new GeoBuilder();
  g.cylinder(0, len / 2, 0, r0, len, col, null, { sides, r2: r1 });
  const geo = g.build();
  _v.set(dx, dy, dz).normalize();
  _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _v);
  _m.compose(new THREE.Vector3(...a), _q, _s.set(1, 1, 1));
  gb.addGeometry(geo, _m, col);
  geo.dispose();
}

export class Hounds {
  constructor(level) {
    this.L = level;
    this.game = level.game;
    const Q = level.Q;
    this.mat = baseMat(Q, { roughness: 0.62 });
    injectLamps(this.mat, level.lampU, { shin: '24.0', spec: '0.25' });
    this.face = null;
    this.geos = this.makeGeos();
    this.pool = [this.make(), this.make()];
    this.t = 0;
    this.spawnT = GRACE;
    this.cool = 0;
  }

  // Geometrias compartilhadas: corpo, cabeça (com cabelo), braço/antebraço, coxa/canela.
  makeGeos() {
    const sph = new THREE.SphereGeometry(1, 12, 9);
    // corpo: caixa torácica estreita, coluna saliente, quadril e pescoço comprido
    const body = new GeoBuilder();
    ellipsoid(body, sph, 0, 0.8, 0.22, 0.17, 0.15, 0.27, SKIN, -0.12);
    ellipsoid(body, sph, 0, 0.75, -0.08, 0.12, 0.11, 0.22, SKIN2);
    ellipsoid(body, sph, 0, 0.71, -0.34, 0.15, 0.12, 0.15, SKIN);
    for (let k = 0; k < 7; k++) ellipsoid(body, sph, 0, 0.9 - k * 0.014, 0.36 - k * 0.11, 0.025, 0.03, 0.04, SKIN2);
    for (let k = 0; k < 4; k++) {
      // costelas marcadas
      const z = 0.3 - k * 0.075;
      for (const s of [-1, 1]) ellipsoid(body, sph, s * 0.13, 0.76, z, 0.045, 0.1, 0.018, SKIN2);
    }
    bone(body, [0, 0.86, 0.42], [0, 0.72, 0.66], 0.05, 0.04, SKIN);
    // cabeça (pivô na base do pescoço): crânio, mandíbula comprida, olhos fundos e cabelo
    const head = new GeoBuilder();
    ellipsoid(head, sph, 0, -0.02, 0.1, 0.1, 0.12, 0.11, SKIN);
    ellipsoid(head, sph, 0, -0.12, 0.15, 0.07, 0.08, 0.07, SKIN2);
    for (const s of [-1, 1]) ellipsoid(head, sph, s * 0.04, 0.0, 0.2, 0.025, 0.02, 0.012, HAIR);
    const hr = (a, b) => {
      // mecha de cabelo pendurada
      bone(head, a, b, 0.018, 0.006, HAIR, 4);
    };
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const x = Math.cos(a) * 0.085;
      const z = 0.1 + Math.sin(a) * 0.09;
      hr([x, 0.07, z], [x * 1.3, -0.42 - (k % 3) * 0.06, z + 0.05]);
    }
    ellipsoid(head, sph, 0, 0.05, 0.08, 0.105, 0.07, 0.115, HAIR);
    // membros: segmento de cima (do ombro/quadril para baixo) e de baixo (com mão/pé)
    const upper = (len, r) => {
      const g = new GeoBuilder();
      g.cylinder(0, -len / 2, 0, r * 0.75, len, SKIN, null, { sides: 7, r2: r });
      ellipsoid(g, sph, 0, -len, 0, r * 0.8, r * 0.8, r * 0.8, SKIN2);
      return g.build();
    };
    const lower = (len, r, hand) => {
      const g = new GeoBuilder();
      g.cylinder(0, -len / 2, 0, r * 0.7, len, SKIN, null, { sides: 7, r2: r });
      // mão (dedos compridos) ou pé
      if (hand)
        for (let f = -2; f <= 2; f++)
          bone(g, [f * 0.012, -len, 0], [f * 0.03, -len - 0.02, 0.11 + (2 - Math.abs(f)) * 0.02], 0.011, 0.007, SKIN, 4);
      else ellipsoid(g, sph, 0, -len - 0.01, 0.06, 0.035, 0.025, 0.1, SKIN2);
      return g.build();
    };
    const out = {
      body: body.build(),
      head: head.build(),
      arm: upper(0.46, 0.045),
      fore: lower(0.52, 0.036, true),
      thigh: upper(0.46, 0.055),
      shin: lower(0.46, 0.04, false),
    };
    sph.dispose();
    return out;
  }

  make() {
    const G = this.geos;
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const mesh = (geo) => {
      const m = new THREE.Mesh(geo, this.mat);
      m.castShadow = false;
      m.receiveShadow = false;
      return m;
    };
    body.add(mesh(G.body));
    const head = new THREE.Group();
    head.position.set(0, 0.72, 0.66);
    head.add(mesh(G.head));
    body.add(head);
    // membros: pivô (ombro/quadril) → segmento de cima → pivô (cotovelo/joelho) → segmento de baixo
    const limbs = [];
    const limb = (x, y, z, fx, fz, L1, L2, geoA, geoB, back, off) => {
      const a = new THREE.Group();
      a.position.set(x, y, z);
      a.rotation.order = 'ZXY';
      a.add(mesh(geoA));
      const b = new THREE.Group();
      b.position.set(0, -L1, 0);
      b.add(mesh(geoB));
      a.add(b);
      body.add(a);
      limbs.push({ a, b, x, y, z, fx, fz, L1, L2, back, off });
    };
    // marcha lateral (um membro de cada vez): FE, TD, FD, TE
    limb(0.17, 0.82, 0.36, 0.27, 0.66, 0.46, 0.52, G.arm, G.fore, true, 0);
    limb(-0.17, 0.82, 0.36, -0.27, 0.66, 0.46, 0.52, G.arm, G.fore, true, 0.5);
    limb(0.14, 0.72, -0.36, 0.24, -0.44, 0.46, 0.46, G.thigh, G.shin, false, 0.25);
    limb(-0.14, 0.72, -0.36, -0.24, -0.44, 0.46, 0.46, G.thigh, G.shin, false, 0.75);
    root.visible = false;
    this.L.dynamic.add(root);
    return { root, body, head, limbs, active: false, x: 0, z: 0, y: 0, yaw: 0, phase: 0, spd: 0 };
  }

  get active() {
    return this.pool.filter((h) => h.active);
  }

  reset() {
    for (const h of this.pool) this.despawn(h);
    this.spawnT = 10;
  }

  despawn(h) {
    h.active = false;
    h.root.visible = false;
  }

  // Barulho que o jogador faz agora (raio em metros).
  noise(player) {
    const s = player.speed || 0;
    if (s > 3.6) return HEAR_RUN;
    if (s > 0.6) return HEAR_WALK;
    return 0;
  }

  spawn(player) {
    const L = this.L;
    const fx = -Math.sin(player.yaw);
    const fz = -Math.cos(player.yaw);
    for (let t = 0; t < 16; t++) {
      // ponto numa rua, a 30–55 m, de preferência fora da vista
      const a = Math.random() * Math.PI * 2;
      const r = 30 + Math.random() * 25;
      let x = player.pos.x + Math.cos(a) * r;
      let z = player.pos.z + Math.sin(a) * r;
      if (Math.random() < 0.5) x = Math.round(x / P) * P + (Math.random() - 0.5) * 3;
      else z = Math.round(z / P) * P + (Math.random() - 0.5) * 3;
      const dx = x - player.pos.x;
      const dz = z - player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < MIN_SPAWN) continue;
      if (t < 10 && (dx * fx + dz * fz) / d > 0.35) continue;
      if (L.inSafe(x, z, 2)) continue;
      if (!L.chunks.has(L.chunkKey(Math.floor(x / P), Math.floor(z / P)))) continue;
      const p = { x, z };
      L.collide(p, 0.4);
      if (Math.hypot(p.x - x, p.z - z) > 0.05) continue;
      const h = this.pool.find((q) => !q.active);
      Object.assign(h, {
        active: true,
        x,
        z,
        y: L.groundY(x, z),
        yaw: Math.random() * 6.28,
        state: 'roam',
        wp: null,
        prevWp: null,
        timer: 0,
        heard: 99,
        stuck: 0,
        pause: 0,
        tx: x,
        tz: z,
        twitch: 0,
        side: Math.random() < 0.5 ? 1 : -1,
        stuckN: 0,
        spd: 0,
      });
      this.nextWaypoint(h, player);
      h.root.visible = true;
      return true;
    }
    return false;
  }

  // Próximo cruzamento (os Cães rondam pelas ruas), com tendência a ir na direção do jogador.
  nextWaypoint(h, player) {
    const ci = Math.round(h.x / P);
    const cj = Math.round(h.z / P);
    const atInter = Math.hypot(h.x - ci * P, h.z - cj * P) < 3;
    if (!atInter) {
      // primeiro vai até o cruzamento mais próximo ao longo da rua em que está
      const onV = Math.abs(h.x - ci * P) < Math.abs(h.z - cj * P);
      const towards = onV ? (player.pos.z > h.z ? 1 : -1) : player.pos.x > h.x ? 1 : -1;
      const pick = Math.random() < 0.6 ? towards : -towards;
      h.wp = onV ? [ci * P, (Math.floor(h.z / P) + (pick > 0 ? 1 : 0)) * P] : [(Math.floor(h.x / P) + (pick > 0 ? 1 : 0)) * P, cj * P];
      return;
    }
    const opts = [
      [ci + 1, cj],
      [ci - 1, cj],
      [ci, cj + 1],
      [ci, cj - 1],
    ].map(([a, b]) => [a * P, b * P]);
    const prev = h.prevWp;
    let cand = opts.filter((o) => !prev || Math.hypot(o[0] - prev[0], o[1] - prev[1]) > 1);
    if (Math.random() < 0.5) {
      cand.sort((a, b) => Math.hypot(a[0] - player.pos.x, a[1] - player.pos.z) - Math.hypot(b[0] - player.pos.x, b[1] - player.pos.z));
      cand = cand.slice(0, 1);
    }
    h.prevWp = [ci * P, cj * P];
    h.wp = cand[Math.floor(Math.random() * cand.length)];
    // anda um pouco fora do eixo da rua
    const lane = (Math.random() - 0.5) * 3;
    if (h.wp[0] === ci * P) h.wp[0] += lane;
    else h.wp[1] += lane;
  }

  update(dt, player) {
    const g = this.game;
    const L = this.L;
    this.t += dt;
    this.cool = Math.max(0, this.cool - dt);
    const st = g.st;
    const want = this.t < 75 ? 1 : 2;
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.cool <= 0 && this.active.length < want && !g.transitioning) {
      this.spawnT = this.spawn(player) ? 25 + Math.random() * 20 : 3;
    }
    const noise = this.noise(player);
    const pSafe = L.inSafe(player.pos.x, player.pos.z, 0);
    let closest = null;
    let cd = 1e9;
    for (const h of this.pool) {
      if (!h.active) continue;
      const dx = player.pos.x - h.x;
      const dz = player.pos.z - h.z;
      const d = Math.hypot(dx, dz);
      if (d > 95) {
        this.despawn(h);
        continue;
      }
      const hears = d < noise || (d < SMELL && !pSafe);
      let speed = 0;
      let tx = h.x;
      let tz = h.z;
      if (h.state === 'roam') {
        if (hears) {
          h.state = 'alert';
          h.timer = 0.75;
          h.tx = player.pos.x;
          h.tz = player.pos.z;
          this.bark(h, player, d);
        } else if (h.pause > 0) {
          h.pause -= dt;
        } else {
          if (!h.wp || Math.hypot(h.wp[0] - h.x, h.wp[1] - h.z) < 1.2) {
            this.nextWaypoint(h, player);
            if (Math.random() < 0.3) h.pause = 1 + Math.random() * 2.5;
          }
          tx = h.wp[0];
          tz = h.wp[1];
          speed = ROAM;
        }
      } else if (h.state === 'alert') {
        // para, levanta a cabeça e escuta antes de correr
        h.timer -= dt;
        h.tx = player.pos.x;
        h.tz = player.pos.z;
        tx = h.tx;
        tz = h.tz;
        if (h.timer <= 0) {
          h.state = 'chase';
          h.heard = 0;
        }
      } else if (h.state === 'chase') {
        if (hears) {
          h.heard = 0;
          h.tx = player.pos.x;
          h.tz = player.pos.z;
        } else h.heard += dt;
        tx = h.tx;
        tz = h.tz;
        const dt2 = Math.hypot(h.tx - h.x, h.tz - h.z);
        speed = dt2 > 0.8 ? CHASE : 0.6;
        if (h.heard > 6 || (h.heard > 2.5 && dt2 < 1.5)) {
          // perdeu o interesse: volta a rondar
          h.state = 'roam';
          h.wp = null;
          h.prevWp = null;
          h.pause = 1.5;
        }
      } else if (h.state === 'flee') {
        h.timer -= dt;
        tx = h.x - dx;
        tz = h.z - dz;
        speed = FLEE;
        if (h.timer <= 0) {
          this.despawn(h);
          continue;
        }
      }
      this.move(h, tx, tz, speed, dt);
      if (!h.active) continue;
      // alcançou o jogador
      const d2 = Math.hypot(player.pos.x - h.x, player.pos.z - h.z);
      if (h.state === 'chase' && d2 < 1.05 && !pSafe && !g.transitioning) {
        if (!this.face) this.face = houndFaceURL();
        g.caught({ image: this.face, text: 'Um Cão te alcançou. Não corra perto deles e fique sob os postes acesos.', sanity: 40 });
        h.state = 'flee';
        h.timer = 3.5;
        this.cool = 14;
      }
      this.animate(h, dt, player, d2);
      if (h.state !== 'flee' && d2 < cd) {
        cd = d2;
        closest = h;
      }
    }
    // som e coração
    if (closest) {
      const hunting = closest.state === 'chase' || closest.state === 'alert';
      st.growl = { x: closest.x, z: closest.z, v: hunting ? clamp(1 - cd / 30, 0.25, 0.75) : clamp(1 - cd / 22, 0, 1) * 0.3 };
      st.fear = Math.max(st.fear || 0, hunting ? clamp(1.25 - cd / 22, 0.35, 1) : clamp(1 - cd / 20, 0, 0.6));
      L.sanityExtra = st.fear * 0.45;
    } else L.sanityExtra = 0;
  }

  // Latido distorcido ao ouvir o jogador (pan pela direção).
  bark(h, player, d) {
    const a = this.game.audio;
    const rx = Math.cos(player.yaw);
    const rz = -Math.sin(player.yaw);
    const pan = clamp(((h.x - player.pos.x) * rx + (h.z - player.pos.z) * rz) / Math.max(d, 1), -1, 1);
    a.play('bark', { gain: 0.55 * clamp(1.2 - d / 30, 0.25, 1), rate: 0.5 + Math.random() * 0.1, pan, wet: 0.6 });
    this.game.vibrate(40);
  }

  // Move em direção a (tx, tz), desviando das casas e das poças de luz.
  move(h, tx, tz, speed, dt) {
    const L = this.L;
    h.spd = damp(h.spd, speed, speed > h.spd ? 3 : 6, dt);
    const dx = tx - h.x;
    const dz = tz - h.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.05) {
      const want = Math.atan2(dx, dz);
      h.yaw += clamp(angleDiff(h.yaw, want), -dt * 4.5, dt * 4.5);
    }
    if (h.spd < 0.02) return;
    const step = Math.min(h.spd * dt, d + 0.5);
    const p = { x: h.x + Math.sin(h.yaw) * step, z: h.z + Math.cos(h.yaw) * step };
    // não entra na luz dos postes acesos: escorrega pela borda
    L.pushOutSafe(p, h);
    L.collide(p, 0.38);
    const moved = Math.hypot(p.x - h.x, p.z - h.z);
    h.stuck = moved < step * 0.25 ? h.stuck + dt : Math.max(0, h.stuck - dt);
    if (h.stuck > 2.5 && h.state === 'roam') {
      // preso atrás de uma casa: tenta outro caminho; preso demais, some (longe da vista)
      h.wp = null;
      h.stuck = 0;
      h.stuckN = (h.stuckN || 0) + 1;
      h.yaw += Math.PI * (0.5 + Math.random());
      const pp = this.game.player.pos;
      if (h.stuckN > 3 && Math.hypot(pp.x - h.x, pp.z - h.z) > 30) this.despawn(h);
    }
    h.x = p.x;
    h.z = p.z;
    h.dist = moved;
  }

  // Marcha de quatro apoios com IK de dois ossos; cabeça baixa que se contorce.
  animate(h, dt, player, d) {
    const gy = this.L.groundY(h.x, h.z);
    h.y = damp(h.y, gy, 10, dt);
    const run = clamp(h.spd / CHASE, 0, 1);
    const S = 0.75 + run * 0.9; // passada
    h.phase += (h.dist || 0) / S;
    h.dist = 0;
    const t = this.game.time;
    const bob = Math.sin(h.phase * Math.PI * 4) * (0.012 + run * 0.03);
    h.root.position.set(h.x, h.y, h.z);
    h.root.rotation.y = h.yaw;
    h.body.position.y = bob - run * 0.06 + Math.sin(t * 1.7) * 0.006;
    h.body.rotation.x = run * 0.08;
    h.body.rotation.z = Math.sin(h.phase * Math.PI * 2) * 0.04;
    // cabeça: pende baixa; ergue ao escutar; espasmos de vez em quando
    h.twitch -= dt;
    if (h.twitch < -2 - Math.random() * 4) h.twitch = 0.25;
    const listen = h.state === 'alert' ? 1 : 0;
    const jerk = h.twitch > 0 ? Math.sin(t * 60) * 0.5 : 0;
    h.head.rotation.x = damp(h.head.rotation.x, 0.5 - listen * 0.75 - run * 0.15, 8, dt);
    h.head.rotation.z = damp(h.head.rotation.z, jerk + listen * 0.35, 20, dt);
    for (const l of h.limbs) {
      const u = (((h.phase + l.off) % 1) + 1) % 1;
      let fz;
      let lift = 0;
      if (u < 0.62) fz = l.fz + S * 0.5 * (0.5 - u / 0.62);
      else {
        const k = (u - 0.62) / 0.38;
        fz = l.fz + S * 0.5 * (-0.5 + k);
        lift = Math.sin(Math.PI * k) * (0.08 + run * 0.1);
      }
      // alvo do pé em coordenadas do corpo (o pé fica no chão mesmo com o balanço)
      const ty = 0.03 + lift - h.body.position.y - l.y;
      const tx = l.fx - l.x;
      const tz = fz - l.z;
      const rho = Math.atan2(tx, -ty);
      const py = -Math.hypot(tx, ty);
      const D = clamp(Math.hypot(tz, py), Math.abs(l.L1 - l.L2) + 0.02, l.L1 + l.L2 - 0.002);
      const th = Math.atan2(tz, -py);
      const al = Math.acos(clamp((l.L1 * l.L1 + D * D - l.L2 * l.L2) / (2 * l.L1 * D), -1, 1));
      const p1 = l.back ? th - al : th + al;
      const ez = l.L1 * Math.sin(p1);
      const ey = -l.L1 * Math.cos(p1);
      const fzz = (tz / Math.hypot(tz, py)) * D;
      const fyy = (py / Math.hypot(tz, py)) * D;
      const p2 = Math.atan2(fzz - ez, -(fyy - ey));
      l.a.rotation.z = rho;
      l.a.rotation.x = -p1;
      l.b.rotation.x = -(p2 - p1);
    }
  }

  dispose() {
    for (const h of this.pool) this.L.dynamic.remove(h.root);
    for (const k in this.geos) this.geos[k].dispose();
    this.mat.dispose();
  }
}
