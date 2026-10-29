// Nível 55 — os Manequins: figuras amarelas, lisas, sem rosto. Ficam imóveis
// enquanto alguém olha para eles; quando ninguém olha (fora da tela, atrás de
// uma parede ou numa piscada), andam direto para o andarilho. Um toque mata.
import * as THREE from 'three';
import { TEX } from '../textures.js';
import { clamp, mulberry32, TAU } from '../util.js';

const NAV = 0.4;
export const SPEED = 3.4; // quando ninguém olha
export const KILL_R = 0.85;

// ------------------------------------------------------------ navegação
export class Nav {
  constructor(M) {
    const B = M.bounds;
    this.x0 = B.x0;
    this.z0 = B.z0;
    this.nx = Math.ceil((B.x1 - B.x0) / NAV);
    this.nz = Math.ceil((B.z1 - B.z0) / NAV);
    this.walk = new Uint8Array(this.nx * this.nz);
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++) this.walk[j * this.nx + i] = M.sdf(this.x0 + (i + 0.5) * NAV, this.z0 + (j + 0.5) * NAV) < -0.32 ? 1 : 0;
    this.q = new Int32Array(this.nx * this.nz);
  }

  cell(x, z) {
    const i = clamp(Math.floor((x - this.x0) / NAV), 0, this.nx - 1);
    const j = clamp(Math.floor((z - this.z0) / NAV), 0, this.nz - 1);
    return j * this.nx + i;
  }

  near(x, z) {
    const k0 = this.cell(x, z);
    if (this.walk[k0]) return k0;
    const i0 = k0 % this.nx;
    const j0 = (k0 - i0) / this.nx;
    for (let r = 1; r < 6; r++)
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          const i = i0 + di;
          const j = j0 + dj;
          if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) continue;
          const k = j * this.nx + i;
          if (this.walk[k]) return k;
        }
    return -1;
  }

  field(x, z, maxD, out) {
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
          if (di && dj && !this.walk[j * nx + ii] && !this.walk[jj * nx + i]) continue;
          D[kk] = d + 1;
          q[t++] = kk;
        }
    }
    return D;
  }

  step(D, x, z) {
    const k = this.near(x, z);
    if (k < 0 || D[k] < 0) return null;
    const nx = this.nx;
    let best = k;
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

// ------------------------------------------------------------ corpo
function makeGeos() {
  const cap = (r, len) => {
    const g = new THREE.CapsuleGeometry(r, len, 6, 12);
    g.translate(0, -len / 2 - r * 0.4, 0);
    return g;
  };
  return {
    torso: new THREE.CapsuleGeometry(0.15, 0.36, 6, 14),
    pelvis: new THREE.SphereGeometry(0.15, 14, 10),
    neck: new THREE.CylinderGeometry(0.045, 0.055, 0.12, 10),
    head: new THREE.SphereGeometry(0.11, 18, 14),
    upper: cap(0.047, 0.22),
    fore: cap(0.04, 0.21),
    hand: new THREE.SphereGeometry(0.05, 10, 8),
    thigh: cap(0.072, 0.3),
    shin: cap(0.056, 0.32),
    foot: new THREE.CapsuleGeometry(0.045, 0.14, 4, 8),
  };
}

function buildBody(geos, mat) {
  const G = () => new THREE.Group();
  const mesh = (g, parent, y = 0) => {
    const m = new THREE.Mesh(g, mat);
    m.position.y = y;
    m.castShadow = false;
    parent.add(m);
    return m;
  };
  const root = G();
  const hips = G();
  hips.position.y = 0.98;
  root.add(hips);
  const pel = mesh(geos.pelvis, hips);
  pel.scale.set(1.15, 0.8, 0.8);
  const spine = G();
  spine.position.y = 0.06;
  hips.add(spine);
  const tor = mesh(geos.torso, spine, 0.28);
  tor.scale.set(1.3, 1, 0.78);
  const neck = G();
  neck.position.y = 0.55;
  spine.add(neck);
  mesh(geos.neck, neck, 0.05);
  const head = G();
  head.position.y = 0.12;
  neck.add(head);
  const hm = mesh(geos.head, head, 0.1);
  hm.scale.set(0.88, 1.18, 0.98);
  const arm = (s) => {
    const sh = G();
    sh.position.set(s * 0.215, 0.48, 0);
    spine.add(sh);
    mesh(geos.upper, sh);
    const el = G();
    el.position.y = -0.3;
    sh.add(el);
    mesh(geos.fore, el);
    const hd = G();
    hd.position.y = -0.29;
    el.add(hd);
    const h = mesh(geos.hand, hd, -0.05);
    h.scale.set(0.7, 1.3, 0.45);
    return { sh, el, hd };
  };
  const leg = (s) => {
    const hip = G();
    hip.position.set(s * 0.095, -0.04, 0);
    hips.add(hip);
    mesh(geos.thigh, hip);
    const kn = G();
    kn.position.y = -0.42;
    hip.add(kn);
    mesh(geos.shin, kn);
    const an = G();
    an.position.y = -0.43;
    kn.add(an);
    const f = mesh(geos.foot, an, -0.04);
    f.rotation.x = Math.PI / 2;
    f.position.z = 0.06;
    return { hip, kn, an };
  };
  return { root, hips, spine, neck, head, armL: arm(-1), armR: arm(1), legL: leg(-1), legR: leg(1) };
}

// Poses: rotações (x, y, z) por articulação. Frente = +z; braço/perna para a
// frente = x negativo; joelho dobra com x positivo; cotovelo com x negativo.
const P = {
  stand: { armL: [[0.05, 0, -0.08], [-0.15, 0, 0]], armR: [[0.05, 0, 0.08], [-0.15, 0, 0]], legL: [[0, 0, 0], [0, 0, 0]], legR: [[0, 0, 0], [0, 0, 0]], spine: [0, 0, 0], head: [0.1, 0, 0] },
  walk: { armL: [[0.45, 0, -0.1], [-0.3, 0, 0]], armR: [[-0.45, 0, 0.1], [-0.5, 0, 0]], legL: [[-0.5, 0, 0], [0.25, 0, 0]], legR: [[0.38, 0, 0], [0.55, 0, 0]], spine: [0.08, 0, 0], head: [0.05, 0, 0], drop: 0.04 },
  reach: { armL: [[-1.45, 0, 0.12], [-0.15, 0, 0]], armR: [[-1.35, 0, -0.1], [-0.2, 0, 0]], legL: [[-0.35, 0, 0], [0.3, 0, 0]], legR: [[0.3, 0, 0], [0.5, 0, 0]], spine: [0.22, 0, 0], head: [-0.1, 0, 0], drop: 0.05 },
  lean: { armL: [[0.1, 0, -0.08], [-0.2, 0, 0]], armR: [[-2.4, 0.3, 0.35], [-1.4, 0, 0]], legL: [[0.25, 0, -0.1], [0.2, 0, 0]], legR: [[-0.15, 0, 0.05], [0.1, 0, 0]], spine: [0.05, 0.3, 0.12], head: [0.15, 0.5, 0] },
  crouch: { armL: [[-0.7, 0, -0.2], [-1.2, 0, 0]], armR: [[-0.8, 0, 0.2], [-1.1, 0, 0]], legL: [[-1.7, 0, -0.1], [2.3, 0, 0]], legR: [[-1.6, 0, 0.12], [2.3, 0, 0]], spine: [0.6, 0, 0], head: [0.4, 0, 0], drop: 0.52 },
  curl: { armL: [[-1.3, 0, 0.3], [-1.6, 0, 0]], armR: [[-1.2, 0, -0.3], [-1.7, 0, 0]], legL: [[-2.1, 0, 0], [2.4, 0, 0]], legR: [[-1.9, 0, 0], [2.4, 0, 0]], spine: [0.8, 0, 0], head: [0.9, 0, 0], lie: 'side' },
  lie: { armL: [[-2.9, 0, 0.2], [0, 0, 0]], armR: [[0.1, 0, 0.15], [0, 0, 0]], legL: [[0, 0, -0.08], [0.1, 0, 0]], legR: [[0, 0, 0.1], [0.2, 0, 0]], spine: [0, 0, 0], head: [0, 0.6, 0], lie: 'face' },
  crawl: { armL: [[-1.5, 0, 0], [0, 0, 0]], armR: [[-1.1, 0, 0], [0, 0, 0]], legL: [[-1.4, 0, 0], [1.6, 0, 0]], legR: [[-1.7, 0, 0], [1.5, 0, 0]], spine: [1.35, 0, 0], head: [-1.0, 0, 0], drop: 0.5 },
};
export const POSES = Object.keys(P);

function setPose(b, name) {
  const p = P[name] || P.stand;
  const j = (g, r) => g.rotation.set(r[0], r[1], r[2]);
  j(b.armL.sh, p.armL[0]);
  j(b.armL.el, p.armL[1]);
  j(b.armR.sh, p.armR[0]);
  j(b.armR.el, p.armR[1]);
  j(b.legL.hip, p.legL[0]);
  j(b.legL.kn, p.legL[1]);
  j(b.legR.hip, p.legR[0]);
  j(b.legR.kn, p.legR[1]);
  b.legL.an.rotation.x = -p.legL[1][0] * 0.4;
  b.legR.an.rotation.x = -p.legR[1][0] * 0.4;
  j(b.spine, p.spine);
  j(b.head, p.head);
  b.hips.position.y = 0.98 - (p.drop || 0);
  b.hips.rotation.set(0, 0, 0);
  if (p.lie === 'side') {
    b.hips.rotation.set(0, 0, Math.PI / 2);
    b.hips.position.y = 0.2;
  } else if (p.lie === 'face') {
    b.hips.rotation.set(Math.PI / 2, 0, 0);
    b.hips.position.y = 0.16;
  }
}

export function mannequinFaceURL() {
  const c = TEX.makeCanvas(512, 512);
  const x = c.getContext('2d');
  x.fillStyle = '#120e00';
  x.fillRect(0, 0, 512, 512);
  const g = x.createRadialGradient(240, 200, 30, 256, 260, 260);
  g.addColorStop(0, '#fff07a');
  g.addColorStop(0.55, '#e8b800');
  g.addColorStop(1, '#3a2a00');
  x.fillStyle = g;
  x.beginPath();
  x.ellipse(256, 270, 190, 240, 0, 0, TAU);
  x.fill();
  // tecido esticado, sem rosto: só as sombras de onde deveriam estar os olhos e a boca
  x.fillStyle = 'rgba(120,80,0,0.28)';
  for (const s of [-1, 1]) {
    x.beginPath();
    x.ellipse(256 + s * 70, 240, 46, 26, 0, 0, TAU);
    x.fill();
  }
  x.beginPath();
  x.ellipse(256, 380, 60, 16, 0, 0, TAU);
  x.fill();
  const r = mulberry32(558);
  x.strokeStyle = 'rgba(160,110,0,0.18)';
  for (let i = 0; i < 60; i++) {
    x.beginPath();
    const yy = 80 + r() * 380;
    x.moveTo(90 + r() * 40, yy);
    x.quadraticCurveTo(256, yy + (r() - 0.5) * 40, 420 - r() * 40, yy + (r() - 0.5) * 20);
    x.stroke();
  }
  return c.toDataURL('image/jpeg', 0.85);
}

// ------------------------------------------------------------ o grupo
export class Mannequins {
  constructor(L, M, spots) {
    this.L = L;
    this.M = M;
    this.game = L.game;
    this.nav = new Nav(M);
    this.geos = makeGeos();
    this.mats = [];
    this.list = spots.map((s) => this.make(s));
    this.D = null;
    this.dT = 0;
    this.frustum = new THREE.Frustum();
    this.pm = new THREE.Matrix4();
    this.sph = new THREE.Sphere(new THREE.Vector3(), 0.55);
    this.face = null;
  }

  // sombreamento próprio (matcap): tecido amarelo fosco com volume
  matcap() {
    if (this.mc) return this.mc;
    const S = 256;
    const c = TEX.makeCanvas(S, S);
    const x = c.getContext('2d');
    const g = x.createRadialGradient(S * 0.38, S * 0.32, S * 0.04, S * 0.5, S * 0.5, S * 0.52);
    g.addColorStop(0, '#fff6b8');
    g.addColorStop(0.35, '#f6d23a');
    g.addColorStop(0.75, '#c89a08');
    g.addColorStop(1, '#5a4000');
    x.fillStyle = g;
    x.fillRect(0, 0, S, S);
    this.mc = TEX.toTex(c, { repeat: false });
    return this.mc;
  }

  make(s) {
    const mat = new THREE.MeshMatcapMaterial({ matcap: this.matcap(), color: 0xffffff });
    this.mats.push(mat);
    const b = buildBody(this.geos, mat);
    this.L.dynamic.add(b.root);
    const m = { s, b, mat, x: s.x, z: s.z, yaw: s.yaw, pose: s.pose, awake: s.awake, seen: true, moved: 0, lastSeen: { x: s.x, z: s.z } };
    this.place(m);
    return m;
  }

  place(m) {
    setPose(m.b, m.pose);
    m.b.root.position.set(m.x, this.M.floorY(m.x, m.z), m.z);
    m.b.root.rotation.y = m.yaw;
    const L = this.L.lightAt(m.x, 1.2, m.z);
    const k = clamp(0.45 + L * 0.6, 0.4, 1.05);
    m.mat.color.setRGB(k, k, k);
  }

  reset() {
    for (const m of this.list) {
      m.x = m.s.x;
      m.z = m.s.z;
      m.yaw = m.s.yaw;
      m.pose = m.s.pose;
      m.awake = m.s.awake;
      m.moved = 0;
      m.lastSeen = { x: m.x, z: m.z };
      this.place(m);
    }
    this.D = null;
  }

  // alguém (a câmera) está vendo este manequim?
  visible(m, cam, blink) {
    if (blink) return false;
    const P = this.game.player.pos;
    const d = Math.hypot(m.x - P.x, m.z - P.z);
    if (d > 70) return false;
    this.sph.center.set(m.x, this.M.floorY(m.x, m.z) + 1.0, m.z);
    if (!this.frustum.intersectsSphere(this.sph)) return false;
    return this.M.clear(P.x, P.z, m.x, m.z, 0.03) || this.M.clear(P.x, P.z, m.x + 0.3, m.z + 0.3, 0.03) || this.M.clear(P.x, P.z, m.x - 0.3, m.z - 0.3, 0.03);
  }

  update(dt, player, blink) {
    const g = this.game;
    const cam = g.camera;
    cam.updateMatrixWorld();
    this.pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pm);
    const px = player.pos.x;
    const pz = player.pos.z;
    let fear = 0;
    let anyMoving = false;
    this.dT -= dt;
    if (this.dT <= 0 || !this.D) {
      this.dT = 0.35;
      this.D = this.nav.field(px, pz, 100, this.D);
    }
    let sting = false;
    for (const m of this.list) {
      const d = Math.hypot(m.x - px, m.z - pz);
      const seen = this.visible(m, cam, blink);
      if (!m.awake && d < 11 && seen) m.awake = true;
      if (!m.awake && d < 6) m.awake = true;
      if (seen) {
        if (!m.seen) {
          // acabou de olhar de novo: ele chegou mais perto?
          const moved = Math.hypot(m.x - m.lastSeen.x, m.z - m.lastSeen.z);
          if (moved > 1.5 && d < 12) sting = true;
          m.lastSeen = { x: m.x, z: m.z };
        }
        if (d < 14) fear = Math.max(fear, clamp(1.1 - d / 14, 0.2, 1));
      } else if (m.awake && !g.transitioning) {
        const t = this.nav.step(this.D, m.x, m.z);
        if (t && t.d < 38) {
          const dx = (d < 2.5 ? px : t.x) - m.x;
          const dz = (d < 2.5 ? pz : t.z) - m.z;
          const l = Math.hypot(dx, dz);
          if (l > 0.01) {
            const s = Math.min(l, SPEED * dt);
            m.x += (dx / l) * s;
            m.z += (dz / l) * s;
            m.yaw = Math.atan2(dx, dz);
            m.moved += s;
            anyMoving = true;
            // muda de pose enquanto ninguém vê
            if (m.moved > 0.9) {
              m.moved = 0;
              m.pose = Math.random() < 0.6 ? 'walk' : 'reach';
            }
            this.place(m);
          }
          if (Math.hypot(m.x - px, m.z - pz) < KILL_R) {
            if (!this.face) this.face = mannequinFaceURL();
            this.L.kill(m);
            return;
          }
        }
      }
      m.seen = seen;
    }
    if (sting) {
      g.audio.sting && g.audio.sting();
      g.vibrate(80);
    }
    if (anyMoving && Math.random() < dt * 0.8) {
      const near = this.list.filter((m) => m.awake && !m.seen).sort((a, b) => Math.hypot(a.x - px, a.z - pz) - Math.hypot(b.x - px, b.z - pz))[0];
      if (near) {
        const dd = Math.hypot(near.x - px, near.z - pz);
        if (dd < 16) g.audio.play('creak', { gain: 0.12 / (1 + dd * 0.2), rate: 1.6 + Math.random() * 0.4, wet: 0.6 });
      }
    }
    g.st.fear = Math.max(g.st.fear || 0, fear);
    this.fear = fear;
  }

  radar() {
    return this.list.filter((m) => m.awake).map((m) => ({ x: m.x, z: m.z }));
  }

  dispose() {
    for (const m of this.list) m.b.root.removeFromParent();
    for (const g of Object.values(this.geos)) g.dispose();
    for (const m of this.mats) m.dispose();
    if (this.mc) this.mc.dispose();
  }
}
