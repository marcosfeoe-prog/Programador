// Nível 54 — as Aracmonster: aranhas gigantes (quase 3 m de uma pata à outra)
// grudadas em teias nos cantos e no teto dos cômodos. Ficam paradas, só
// mexendo as patas; se o andarilho chega perto demais, dão o bote. Raramente,
// uma desce da teia e sai caçando pelos corredores — e depois volta.
import * as THREE from 'three';
import { TEX } from '../textures.js';
import { clamp, damp, lerp, mulberry32, smoothstep, TAU } from '../util.js';
import { H, sdf, clear, BOUNDS, WEBS } from './level54_map.js';

const LUNGE_R = 2.7; // perto assim da teia, ela pula
const WARN_R = 7;
const HUNT_SPD = 2.75; // mais rápida que andando, mais lenta que correndo
const CATCH_R = 1.2;
const NAV = 0.4;

// ------------------------------------------------------------ texturas
function abdomenTex() {
  const S = 256;
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  x.fillStyle = '#1e1410';
  x.fillRect(0, 0, S, S);
  const r = mulberry32(5401);
  for (let i = 0; i < 3500; i++) {
    x.fillStyle = `rgba(${60 + r() * 50},${40 + r() * 30},${20 + r() * 20},${r() * 0.35})`;
    x.fillRect(r() * S, r() * S, 1, 3 + r() * 5);
  }
  // marcas em chevron, vermelho-escuras
  x.fillStyle = 'rgba(120,24,18,0.85)';
  for (let k = 0; k < 5; k++) {
    const y = 40 + k * 38;
    x.beginPath();
    x.moveTo(S * 0.5, y);
    x.lineTo(S * 0.5 + 46 - k * 6, y + 18);
    x.lineTo(S * 0.5, y + 10);
    x.lineTo(S * 0.5 - 46 + k * 6, y + 18);
    x.closePath();
    x.fill();
  }
  return TEX.toTex(c, { repeat: false });
}

function legTex() {
  const c = TEX.makeCanvas(64, 256);
  const x = c.getContext('2d');
  x.fillStyle = '#24170f';
  x.fillRect(0, 0, 64, 256);
  const r = mulberry32(5402);
  for (let i = 0; i < 900; i++) {
    x.fillStyle = `rgba(${70 + r() * 40},${50 + r() * 30},${30},${r() * 0.4})`;
    x.fillRect(r() * 64, r() * 256, 1, 2 + r() * 4);
  }
  // anéis claros nas juntas
  x.fillStyle = 'rgba(150,110,70,0.55)';
  x.fillRect(0, 0, 64, 14);
  x.fillRect(0, 242, 64, 14);
  return TEX.toTex(c, { repeat: false });
}

export function spiderFaceURL() {
  const c = TEX.makeCanvas(512, 512);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(256, 230, 20, 256, 256, 300);
  g.addColorStop(0, '#2a1a12');
  g.addColorStop(1, '#000');
  x.fillStyle = g;
  x.fillRect(0, 0, 512, 512);
  const eyes = [
    [200, 190, 42],
    [312, 190, 42],
    [150, 160, 22],
    [362, 160, 22],
    [222, 130, 18],
    [290, 130, 18],
    [120, 214, 14],
    [392, 214, 14],
  ];
  for (const [ex, ey, er] of eyes) {
    const eg = x.createRadialGradient(ex - er * 0.3, ey - er * 0.3, 1, ex, ey, er);
    eg.addColorStop(0, '#ff9a8a');
    eg.addColorStop(0.35, '#c0101a');
    eg.addColorStop(1, '#200004');
    x.fillStyle = eg;
    x.beginPath();
    x.arc(ex, ey, er, 0, TAU);
    x.fill();
  }
  // quelíceras e presas
  x.fillStyle = '#140c08';
  for (const s of [-1, 1]) {
    x.beginPath();
    x.ellipse(256 + s * 52, 330, 48, 90, s * 0.2, 0, TAU);
    x.fill();
    x.fillStyle = '#d8c8a8';
    x.beginPath();
    x.moveTo(256 + s * 40, 400);
    x.quadraticCurveTo(256 + s * 30, 470, 256 + s * 6, 488);
    x.quadraticCurveTo(256 + s * 22, 450, 256 + s * 58, 405);
    x.fill();
    x.fillStyle = '#140c08';
  }
  // pelos
  x.strokeStyle = 'rgba(120,90,60,0.5)';
  const r = mulberry32(5403);
  for (let i = 0; i < 500; i++) {
    const a = r() * TAU;
    const d = 120 + r() * 140;
    x.beginPath();
    x.moveTo(256 + Math.cos(a) * d, 256 + Math.sin(a) * d);
    x.lineTo(256 + Math.cos(a) * (d + 12 + r() * 20), 256 + Math.sin(a) * (d + 12 + r() * 20));
    x.stroke();
  }
  return c.toDataURL('image/jpeg', 0.85);
}

// ------------------------------------------------------------ navegação
// Grade de 0,5 m; distâncias por busca em largura (8 vizinhos).
class Nav {
  constructor() {
    this.x0 = BOUNDS.x0;
    this.z0 = BOUNDS.z0;
    this.nx = Math.ceil((BOUNDS.x1 - BOUNDS.x0) / NAV);
    this.nz = Math.ceil((BOUNDS.z1 - BOUNDS.z0) / NAV);
    this.walk = new Uint8Array(this.nx * this.nz);
    for (let j = 0; j < this.nz; j++)
      for (let i = 0; i < this.nx; i++) this.walk[j * this.nx + i] = sdf(this.x0 + (i + 0.5) * NAV, this.z0 + (j + 0.5) * NAV) < -0.26 ? 1 : 0;
    this.q = new Int32Array(this.nx * this.nz);
  }

  cell(x, z) {
    const i = clamp(Math.floor((x - this.x0) / NAV), 0, this.nx - 1);
    const j = clamp(Math.floor((z - this.z0) / NAV), 0, this.nz - 1);
    return j * this.nx + i;
  }

  // a célula andável mais perto (para quem está colado na parede)
  near(x, z) {
    let k = this.cell(x, z);
    if (this.walk[k]) return k;
    const i0 = k % this.nx;
    const j0 = (k - i0) / this.nx;
    for (let r = 1; r < 5; r++)
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          const i = i0 + di;
          const j = j0 + dj;
          if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) continue;
          k = j * this.nx + i;
          if (this.walk[k]) return k;
        }
    return -1;
  }

  // campo de distâncias até (x, z), em passos (máx. maxD)
  field(x, z, maxD = 200, out) {
    const D = out || new Int16Array(this.nx * this.nz);
    D.fill(-1);
    const s = this.near(x, z);
    if (s < 0) return D;
    const q = this.q;
    let h = 0;
    let t = 0;
    q[t++] = s;
    D[s] = 0;
    const nx = this.nx;
    while (h < t) {
      const k = q[h++];
      const d = D[k];
      if (d >= maxD) continue;
      const i = k % nx;
      const j = (k - i) / nx;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= nx || jj >= this.nz) continue;
          const kk = jj * nx + ii;
          if (!this.walk[kk] || D[kk] >= 0) continue;
          // diagonal só se as duas laterais também forem livres
          if (di && dj && !this.walk[j * nx + ii] && !this.walk[jj * nx + i]) continue;
          D[kk] = d + 1;
          q[t++] = kk;
        }
    }
    return D;
  }

  // próximo ponto descendo o campo D, a partir de (x, z)
  step(D, x, z) {
    const k = this.near(x, z);
    if (k < 0 || D[k] < 0) return null;
    const nx = this.nx;
    let best = k;
    // olha dois passos à frente para suavizar
    for (let s = 0; s < 3; s++) {
      const i = best % nx;
      const j = (best - i) / nx;
      let b = best;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= nx || jj >= this.nz) continue;
          const kk = jj * nx + ii;
          if (D[kk] >= 0 && D[kk] < D[b]) b = kk;
        }
      best = b;
    }
    const i = best % nx;
    const j = (best - i) / nx;
    return { x: this.x0 + (i + 0.5) * NAV, z: this.z0 + (j + 0.5) * NAV, d: D[k] * NAV };
  }
}

// ------------------------------------------------------------ o bicho
const LEG_A = [0.62, 0.22, -0.2, -0.62]; // ângulo de cada par (para a frente → para trás)

function buildSpider(mats, geos) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const add = (geo, mat, parent, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = false;
    parent.add(m);
    return m;
  };
  const ceph = add(geos.ceph, mats.body, body, 0, 0, 0.28);
  ceph.scale.set(1, 0.72, 1.15);
  const abd = add(geos.abd, mats.abd, body, 0, 0.1, -0.5);
  abd.scale.set(0.92, 0.78, 1.22);
  abd.rotation.x = -0.25;
  // olhos
  const eyes = [
    [-0.07, 0.14, 0.62, 0.045],
    [0.07, 0.14, 0.62, 0.045],
    [-0.15, 0.12, 0.56, 0.028],
    [0.15, 0.12, 0.56, 0.028],
    [-0.04, 0.2, 0.57, 0.022],
    [0.04, 0.2, 0.57, 0.022],
    [-0.2, 0.08, 0.5, 0.02],
    [0.2, 0.08, 0.5, 0.02],
  ];
  for (const [x, y, z, r] of eyes) {
    const e = add(geos.eye, mats.eye, body, x, y, z);
    e.scale.setScalar(r / 0.05);
  }
  // quelíceras com presas
  const fangs = [];
  for (const s of [-1, 1]) {
    const f = new THREE.Group();
    f.position.set(s * 0.07, -0.02, 0.62);
    body.add(f);
    const ch = add(geos.chel, mats.body, f, 0, -0.08, 0.02);
    ch.rotation.x = 0.35;
    const fang = add(geos.fang, mats.fang, f, 0, -0.2, 0.06);
    fang.rotation.x = 0.6;
    fangs.push(f);
  }
  // patas: quadril (gira em Y) → fêmur (sobe) → tíbia (desce) → tarso
  const legs = [];
  for (const s of [1, -1])
    for (let k = 0; k < 4; k++) {
      const hip = new THREE.Group();
      hip.position.set(s * 0.18, 0.02, 0.42 - k * 0.15);
      hip.rotation.y = s > 0 ? -LEG_A[k] : Math.PI + LEG_A[k];
      body.add(hip);
      const fem = new THREE.Group();
      hip.add(fem);
      add(geos.fem, mats.leg, fem);
      const knee = new THREE.Group();
      knee.position.x = 0.88;
      fem.add(knee);
      add(geos.knee, mats.leg, knee);
      add(geos.tib, mats.leg, knee);
      const ank = new THREE.Group();
      ank.position.x = 1.0;
      knee.add(ank);
      add(geos.tar, mats.leg, ank);
      legs.push({ hip, fem, knee, ank, s, k, base: hip.rotation.y, ph: (k % 2 === 0) === s > 0 ? 0 : Math.PI });
    }
  // pedipalpos
  for (const s of [-1, 1]) {
    const p = new THREE.Group();
    p.position.set(s * 0.1, -0.02, 0.58);
    p.rotation.set(0.6, s * -0.4, 0);
    body.add(p);
    const m = add(geos.palp, mats.leg, p, 0, 0, 0.14);
    m.rotation.x = Math.PI / 2;
  }
  return { root, body, legs, fangs, abd };
}

function makeGeos() {
  // cilindro ao longo de +X, começando na origem
  const limb = (len, r0, r1) => {
    const g = new THREE.CylinderGeometry(r1, r0, len, 7, 1);
    g.rotateZ(-Math.PI / 2);
    g.translate(len / 2, 0, 0);
    return g;
  };
  return {
    ceph: new THREE.SphereGeometry(0.32, 16, 12),
    abd: new THREE.SphereGeometry(0.5, 18, 14),
    eye: new THREE.SphereGeometry(0.05, 10, 8),
    chel: new THREE.CylinderGeometry(0.05, 0.065, 0.18, 8),
    fang: new THREE.ConeGeometry(0.025, 0.14, 6),
    fem: limb(0.9, 0.06, 0.05),
    knee: new THREE.SphereGeometry(0.058, 8, 6),
    tib: limb(1.02, 0.048, 0.034),
    tar: limb(0.55, 0.032, 0.008),
    palp: new THREE.CylinderGeometry(0.02, 0.03, 0.28, 6),
  };
}

// ------------------------------------------------------------ o bando
export class Aracmonsters {
  constructor(L) {
    this.L = L;
    this.game = L.game;
    this.nav = new Nav();
    this.geos = makeGeos();
    this.texs = [abdomenTex(), legTex()];
    const webT = L.webMap;
    this.list = [];
    this.webMeshes = [];
    this.webGeo = new THREE.PlaneGeometry(1, 1);
    this.webMat = new THREE.MeshBasicMaterial({ map: webT, transparent: true, depthWrite: false, side: THREE.DoubleSide, color: 0xd8d4c8, opacity: 0.9 });
    this.silkMat = new THREE.LineBasicMaterial({ color: 0xe8e4dc, transparent: true, opacity: 0.6 });
    this.mats = [this.webMat, this.silkMat];
    for (const w of WEBS) this.list.push(this.make(w));
    this.huntT = 80 + Math.random() * 60;
    this.playerD = null;
    this.pdT = 0;
    this.face = null;
    this.hissT = 0;
  }

  make(w) {
    const mats = {
      body: new THREE.MeshStandardMaterial({ color: 0x2a1c14, roughness: 0.85 }),
      abd: new THREE.MeshStandardMaterial({ map: this.texs[0], roughness: 0.7 }),
      leg: new THREE.MeshStandardMaterial({ map: this.texs[1], roughness: 0.9 }),
      eye: new THREE.MeshStandardMaterial({ color: 0x300004, emissive: 0xc81020, emissiveIntensity: 1.6, roughness: 0.15 }),
      fang: new THREE.MeshStandardMaterial({ color: 0xd8c8a8, roughness: 0.4 }),
    };
    this.mats.push(...Object.values(mats));
    const m = buildSpider(mats, this.geos);
    // teia: no canto, um véu vertical; no teto, um disco horizontal
    const web = new THREE.Mesh(this.webGeo, this.webMat);
    const yaw = Math.atan2(w.ux, w.uz);
    if (w.kind === 'corner') {
      web.position.set(w.cx + w.ux * 0.8, H - 1.25, w.cz + w.uz * 0.8);
      web.rotation.set(0.25, yaw, 0, 'YXZ');
      web.scale.set(2.9, 2.4, 1);
    } else {
      web.position.set(w.x, H - 0.06, w.z);
      web.rotation.set(-Math.PI / 2, 0, yaw);
      web.scale.set(3.4, 3.4, 1);
    }
    web.renderOrder = 2;
    this.L.dynamic.add(web);
    this.webMeshes.push(web);
    // fios soltos do canto até a teia
    const silkG = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const silk = new THREE.Line(silkG, this.silkMat);
    silk.visible = false;
    silk.frustumCulled = false;
    this.L.dynamic.add(silk);
    this.L.dynamic.add(m.root);
    const anchor = w.kind === 'corner' ? { x: w.cx + w.ux * 1.05, y: H - 1.05, z: w.cz + w.uz * 1.05 } : { x: w.x, y: H - 0.72, z: w.z };
    const sp = {
      w,
      m,
      mats,
      silk,
      anchor,
      yaw0: yaw,
      state: 'web',
      x: anchor.x,
      y: anchor.y,
      z: anchor.z,
      yaw,
      pitch: w.kind === 'corner' ? 1.15 : 0,
      roll: w.kind === 'corner' ? 0 : Math.PI,
      t: 0,
      cool: 0,
      ph: Math.random() * TAU,
      twitch: 0,
      aware: 0,
      homeD: null,
      lostT: 0,
      huntTime: 0,
    };
    this.pose(sp, 0);
    return sp;
  }

  // ------------------------------------------------------------ quadro
  update(dt, player) {
    const g = this.game;
    const L = this.L;
    const st = g.st;
    const px = player.pos.x;
    const pz = player.pos.z;
    let fear = 0;
    let closest = 1e9;
    this.hissT -= dt;
    // caçada rara: de tempos em tempos uma desce da teia
    this.huntT -= dt;
    if (this.huntT <= 0) {
      this.huntT = 45;
      if (!this.list.some((s) => s.state === 'drop' || s.state === 'hunt') && !L.done) {
        const cand = this.list.filter((s) => s.state === 'web' && s.cool <= 0 && Math.hypot(s.anchor.x - px, s.anchor.z - pz) < 30 && Math.hypot(s.anchor.x - px, s.anchor.z - pz) > 6);
        if (cand.length && Math.random() < 0.55) {
          const s = cand[Math.floor(Math.random() * cand.length)];
          s.state = 'drop';
          s.t = 0;
          this.huntT = 110 + Math.random() * 90;
          this.sound('hiss', s, player, 0.5, 0.75);
          if (L.onHunt) L.onHunt(s);
        }
      }
    }
    // campo de distância até o jogador (para quem estiver caçando)
    const hunting = this.list.some((s) => s.state === 'hunt');
    if (hunting) {
      this.pdT -= dt;
      if (this.pdT <= 0 || !this.playerD) {
        this.pdT = 0.4;
        this.playerD = this.nav.field(px, pz, 120, this.playerD);
      }
    }
    for (const s of this.list) {
      s.t += dt;
      s.cool = Math.max(0, s.cool - dt);
      const dxA = px - s.anchor.x;
      const dzA = pz - s.anchor.z;
      const dA = Math.hypot(dxA, dzA);
      const dS = Math.hypot(px - s.x, pz - s.z);
      const sees = dS < 14 && clear(px, pz, s.state === 'web' || s.state === 'lunge' || s.state === 'retreat' ? s.anchor.x : s.x, s.state === 'web' || s.state === 'lunge' || s.state === 'retreat' ? s.anchor.z : s.z, 0.05);
      let walking = 0;
      if (s.state === 'web') {
        s.aware = damp(s.aware, sees && dA < WARN_R ? 1 : 0, 3, dt);
        // vira devagar para o jogador
        if (s.aware > 0.3) {
          const want = Math.atan2(dxA, dzA);
          s.yaw = angDamp(s.yaw, want, 1.2 * s.aware, dt);
          if (this.hissT <= 0 && dA < 5.5) {
            this.hissT = 3 + Math.random() * 3;
            this.sound('hiss', s, player, 0.35, 0.9 + Math.random() * 0.2);
          }
        } else s.yaw = angDamp(s.yaw, s.yaw0, 0.5, dt);
        if (sees && dA < LUNGE_R && s.cool <= 0 && !L.done) {
          s.state = 'lunge';
          s.t = 0;
          this.sound('hiss', s, player, 0.8, 1.15);
          this.sound('skitter', s, player, 0.6, 1.3);
          if (L.onLunge) L.onLunge(s);
        }
      } else if (s.state === 'lunge') {
        // pula preso ao fio, direto no peito
        const tx = px;
        const ty = 1.0;
        const tz = pz;
        const k = 1 - Math.exp(-dt * 9);
        s.x = lerp(s.x, tx, k);
        s.y = lerp(s.y, ty, k);
        s.z = lerp(s.z, tz, k);
        s.yaw = Math.atan2(px - s.x, pz - s.z);
        s.pitch = damp(s.pitch, 0.5, 6, dt);
        s.roll = damp(s.roll, 0, 6, dt);
        walking = 1.5;
        if (Math.hypot(px - s.x, pz - s.z) < 0.9 && !g.transitioning) this.bite(s);
        else if (s.t > 1.1 || dA > 5.5) {
          s.state = 'retreat';
          s.t = 0;
          if (L.onEscape) L.onEscape(s);
        }
      } else if (s.state === 'retreat') {
        const k = 1 - Math.exp(-dt * 3.5);
        s.x = lerp(s.x, s.anchor.x, k);
        s.y = lerp(s.y, s.anchor.y, k);
        s.z = lerp(s.z, s.anchor.z, k);
        s.pitch = damp(s.pitch, s.w.kind === 'corner' ? 1.15 : 0, 4, dt);
        s.roll = damp(s.roll, s.w.kind === 'corner' ? 0 : Math.PI, 4, dt);
        walking = 1;
        if (Math.hypot(s.x - s.anchor.x, s.z - s.anchor.z) < 0.08 && Math.abs(s.y - s.anchor.y) < 0.08) {
          s.state = 'web';
          s.cool = Math.max(s.cool, 4);
        }
      } else if (s.state === 'drop' || s.state === 'climb') {
        // desce (ou sobe) pelo fio até o chão logo abaixo da teia
        const up = s.state === 'climb';
        const k = smoothstep(0, 1.4, s.t);
        const a = up ? 1 - k : k;
        s.x = s.anchor.x;
        s.z = s.anchor.z;
        s.y = lerp(s.anchor.y, 0.72, a);
        s.pitch = lerp(s.w.kind === 'corner' ? 1.15 : 0, 0, a);
        s.roll = lerp(s.w.kind === 'corner' ? 0 : Math.PI, 0, a);
        walking = 0.4;
        if (s.t > 1.45) {
          s.t = 0;
          if (up) {
            s.state = 'web';
            s.cool = 25;
          } else {
            s.state = 'hunt';
            s.huntTime = 0;
            s.lostT = 0;
            this.sound('skitter', s, player, 0.7, 1);
          }
        }
      } else if (s.state === 'hunt' || s.state === 'home') {
        const home = s.state === 'home';
        let tgt = null;
        if (home) {
          if (!s.homeD) s.homeD = this.nav.field(s.anchor.x, s.anchor.z, 400);
          tgt = Math.hypot(s.x - s.anchor.x, s.z - s.anchor.z) < 0.6 ? { x: s.anchor.x, z: s.anchor.z, d: 0 } : this.nav.step(s.homeD, s.x, s.z);
        } else {
          s.huntTime += dt;
          s.lostT = sees ? 0 : s.lostT + dt;
          tgt = dS < 3.5 && clear(s.x, s.z, px, pz, 0.3) ? { x: px, z: pz, d: dS } : this.nav.step(this.playerD, s.x, s.z);
          if (!tgt || s.huntTime > 34 || s.lostT > 12 || (tgt && tgt.d > 45)) {
            s.state = 'home';
            s.t = 0;
          }
        }
        if (tgt) {
          const dx = tgt.x - s.x;
          const dz = tgt.z - s.z;
          const d = Math.hypot(dx, dz);
          const spd = home ? 2.2 : HUNT_SPD;
          if (d > 0.02) {
            const st2 = Math.min(d, spd * dt);
            s.x += (dx / d) * st2;
            s.z += (dz / d) * st2;
            s.yaw = angDamp(s.yaw, Math.atan2(dx, dz), 7, dt);
            walking = spd / 2.2;
          }
          if (home && Math.hypot(s.x - s.anchor.x, s.z - s.anchor.z) < 0.15) {
            s.state = 'climb';
            s.t = 0;
          }
        }
        s.y = 0.72;
        if (!home && dS < CATCH_R && !g.transitioning) {
          this.bite(s);
          s.state = 'home';
          s.t = 0;
        }
        // passos (tec-tec-tec)
        s.stepT = (s.stepT || 0) - dt;
        if (walking && s.stepT <= 0) {
          s.stepT = 0.34;
          this.sound('skitter', s, player, 0.35, 0.9 + Math.random() * 0.3);
        }
      }
      // brilho de acordo com a luz do lugar
      const Lx = L.lightAt(s.x, Math.min(s.y, 2), s.z);
      const b = 0.25 + Lx * 0.9;
      s.mats.body.color.setRGB(0.16 * b, 0.11 * b, 0.08 * b);
      s.mats.abd.color.setRGB(b, b, b);
      s.mats.leg.color.setRGB(b, b, b);
      s.mats.fang.color.setRGB(0.85 * b, 0.78 * b, 0.66 * b);
      this.pose(s, dt, walking);
      // fio de seda quando está fora da teia
      const off = s.state !== 'web' && s.state !== 'hunt' && s.state !== 'home';
      s.silk.visible = off;
      if (off) {
        const p = s.silk.geometry.attributes.position;
        p.setXYZ(0, s.anchor.x, H - 0.05, s.anchor.z);
        p.setXYZ(1, s.x, s.y + 0.2, s.z);
        p.needsUpdate = true;
      }
      // medo
      if (s.state === 'hunt' || s.state === 'lunge') fear = Math.max(fear, clamp(1.3 - dS / 14, 0.5, 1));
      else if (sees) fear = Math.max(fear, clamp(1 - dS / 10, 0, 0.7));
      if (dS < closest) closest = dS;
    }
    st.fear = Math.max(st.fear || 0, fear);
    L.spiderFear = fear;
    this.closest = closest;
  }

  bite(s) {
    const g = this.game;
    if (!this.face) this.face = spiderFaceURL();
    s.cool = 22;
    g.caught({ image: this.face, text: 'Uma Aracmonster te mordeu. Elas só atacam quem chega perto das teias — passe pelo outro lado do cômodo.', sanity: 38 });
    if (s.state === 'lunge') {
      s.state = 'retreat';
      s.t = 0;
    }
    if (this.L.onBite) this.L.onBite(s);
  }

  sound(name, s, player, gain, rate) {
    const g = this.game;
    if (!g.audio.ready) return;
    const dx = s.x - player.pos.x;
    const dz = s.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 26) return;
    const occl = clear(player.pos.x, player.pos.z, s.x, s.z, 0.05) ? 1 : 0.35;
    // pan: lado relativo ao olhar
    const yaw = player.yaw;
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const pan = clamp((dx * rx + dz * rz) / Math.max(d, 1), -1, 1) * 0.8;
    g.audio.play(name, { gain: (gain * occl) / (1 + d * 0.18), rate, pan, wet: 0.5 + (1 - occl) });
  }

  // Pose do corpo e das patas.
  pose(s, dt, walking = 0) {
    const m = s.m;
    m.root.position.set(s.x, s.y, s.z);
    m.root.rotation.set(s.pitch, s.yaw, s.roll, 'YXZ');
    s.ph += dt * (walking ? 9 * walking : 0.6);
    s.twitch = Math.max(0, s.twitch - dt);
    if (Math.random() < dt * (0.3 + s.aware * 1.5)) s.twitch = 0.25;
    const tw = s.twitch > 0 ? Math.sin(s.t * 60) * 0.12 : 0;
    const br = Math.sin(s.t * 1.8) * 0.02;
    m.abd.scale.set(0.92 + br, 0.78 + br, 1.22);
    m.body.position.y = walking ? Math.abs(Math.sin(s.ph)) * 0.04 : 0;
    for (const l of m.legs) {
      const p = s.ph + l.ph;
      const sw = walking ? Math.sin(p) * 0.32 : Math.sin(s.t * 0.7 + l.k) * 0.03;
      const lift = walking ? Math.max(0, Math.cos(p)) * 0.45 : 0;
      l.hip.rotation.y = l.base + sw * (l.s > 0 ? 1 : -1);
      l.fem.rotation.z = 0.78 + lift + (l.k === 0 ? tw : 0);
      l.knee.rotation.z = -1.72 + lift * 0.4 - (l.k === 0 ? tw * 2 : 0);
      l.ank.rotation.z = -0.52;
    }
    // presas mexendo
    const f = s.state === 'lunge' || s.state === 'hunt' ? Math.sin(s.t * 18) * 0.25 : Math.sin(s.t * 2) * 0.04;
    m.fangs[0].rotation.z = f;
    m.fangs[1].rotation.z = -f;
  }

  radar() {
    return this.list.map((s) => ({ x: s.x, z: s.z }));
  }

  dispose() {
    for (const s of this.list) {
      s.m.root.removeFromParent();
      s.silk.removeFromParent();
      s.silk.geometry.dispose();
    }
    for (const w of this.webMeshes) w.removeFromParent();
    this.webGeo.dispose();
    for (const g of Object.values(this.geos)) g.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.texs) t.dispose();
  }
}

function angDamp(a, b, k, dt) {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return a + d * (1 - Math.exp(-k * dt));
}
