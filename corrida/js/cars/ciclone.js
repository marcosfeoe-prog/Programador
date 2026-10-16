// Ciclone F5 — hipercarro biturbo de motor central (inspirado na referência 2).
// Módulo próprio: forma da carroceria (seções) + detalhes em decorate(ctx).
// Coordenadas do modelo: +z frente, +y cima, +x esquerda; chão em y = 0.
// ctx: ver buildCar() em ../carModel.js (onFront/onRear/onTop/onSide, plateGeo,
// headlight/taillight, part(), materiais M, paint/paintPlain, etc.).
//
// Quase todos os detalhes (faróis, entradas de ar, saias, venezianas) são "peles"
// que copiam a superfície da carroceria: cada ponto é amostrado na própria seção
// (CarShape.halfPath) e afastado alguns milímetros na direção da normal. Assim as
// peças acompanham as curvas da lataria em vez de serem placas planas.

const LEN = 4.72;
const WIN_END = 0.6; // fim da janela lateral (t da cabine)

// ------------------------------------------------------------- utilidades
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sm = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
// janela suave: sobe entre a0..a1 e desce entre b0..b1
const win = (x, a0, a1, b0, b1) => sm(a0, a1, x) * (1 - sm(b0, b1, x));
const mix = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------- escultura da lataria
// borda dianteira do ressalto do capô (forma de "U" vista de cima)
const NOSE_Y = 0.27; // altura da boca central na ponta
const POD_W = 0.44;
const podU = (x) => 0.214 + 0.045 * (Math.min(1, x / POD_W) ** 2);
// altura do ressalto acima do capô (pele própria, com a frente escura)
const podH = (u, x) => {
  const us = podU(x);
  const side = 1 - sm(0.28, POD_W, x);
  return -0.016 + 0.093 * sm(us - 0.004, us + 0.018, u) * Math.pow(side, 0.6) * (1 - 0.25 * (x / POD_W) ** 2);
};
// canal lateral: borda de cima (vinco) sobe de trás da roda dianteira até a tomada
const chanTop = (u) => mix(0.36, 0.69, sm(0.27, 0.62, u));
const CH_END0 = 0.62;
const CH_END1 = 0.65;
const chanDepth = (u) => 0.15 * sm(0.27, 0.6, u) ** 0.8 * (1 - sm(CH_END0, CH_END1, u));

function topProfile(u, x, c) {
  // x0 = fim do topo (mesma conta de CarShape.halfPath)
  const rs = Math.max(0.03, Math.min(c.rs, (c.yf - c.yb - c.rb) * 0.42, (c.hw - c.tumble) * 0.4));
  const x0 = Math.max(0.04, c.hw - c.tumble - rs);
  const r = Math.min(1, x / x0);
  // na frente o capô fica mais plano e os para-lamas sobem em crista forte
  const pw = 2 + 0.7 * (1 - sm(0.28, 0.42, u));
  let y = c.yt + (c.yf - c.yt) * Math.pow(r, pw);
  // nariz: quilha central suave que desce até a ponta
  y += 0.02 * win(u, 0.0, 0.03, 0.14, 0.2) * Math.exp(-((x / 0.2) ** 2));
  // painel central do capô levemente elevado, com vincos que abrem até o ressalto
  const xe = mix(0.2, POD_W - 0.04, sm(0.0, 0.22, u));
  y += 0.014 * win(u, 0.005, 0.03, 0.2, 0.24) * (1 - sm(xe - 0.03, xe + 0.03, x));
  // capô rebaixado logo antes do ressalto (aumenta a "boca" da abertura)
  const fx = 1 - sm(POD_W - 0.1, POD_W + 0.02, x);
  y -= 0.03 * win(u, 0.11, 0.2, 0.225, 0.27) * fx;
  // tampa do motor: leve canal ao lado da espinha central
  y -= 0.018 * win(u, 0.74, 0.8, 0.95, 0.99) * win(x, 0.22, 0.32, 0.58, 0.68);
  return y;
}

function bodyMod(u, p, c) {
  // bico: a ponta encolhe mais (tampa plana pequena, nariz arredondado)
  if (p.seg === 4) p.y = topProfile(u, p.x, c);
  // bico: a ponta encolhe para os lados e para o meio da altura (tampa plana pequena)
  if (u < 0.035) {
    const k = Math.sqrt(u / 0.035);
    p.x *= mix(0.6, 1, k);
    p.y = NOSE_Y + (p.y - NOSE_Y) * mix(0.5, 1, k);
  }
  if (p.seg === 2) {
    // canal côncavo da porta até a tomada de ar antes da roda traseira
    const d = chanDepth(u);
    if (d > 0) {
      const top = chanTop(u);
      const ky = sm(0.17, 0.29, p.y) * (1 - sm(top - 0.13, top, p.y));
      p.x -= d * ky;
    }
  }
}

// ----------------------------------------------------- materiais próprios
let MAT = null;
let RIM = null; // material do aro (as rodas são montadas antes do decorate)
function mats(ctx) {
  if (MAT) return MAT;
  const { THREE, TX, M } = ctx;
  // trama de carbono 2x2 (sarja) com mais contraste que a padrão
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  for (let i = 0; i < 8; i++)
    for (let j = 0; j < 8; j++) {
      const hor = (i + j) % 4 < 2;
      const x = i * 8;
      const y = j * 8;
      const lg = hor ? g.createLinearGradient(x, y, x, y + 8) : g.createLinearGradient(x, y, x + 8, y);
      lg.addColorStop(0, '#0c0d0f');
      lg.addColorStop(0.5, hor ? '#43464c' : '#2a2c31');
      lg.addColorStop(1, '#0c0d0f');
      g.fillStyle = lg;
      g.fillRect(x, y, 8, 8);
    }
  const carbonTex = (rx, ry) => {
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.repeat.set(rx, ry);
    return t;
  };
  MAT = {
    // carbono com trama fina (UV em metros nas peles e nas peças extrudadas)
    carbon: new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: carbonTex(9, 9), metalness: 0.2, roughness: 0.38, clearcoat: 0.9, clearcoatRoughness: 0.05, envMapIntensity: 0.8 }),
    // carbono do teto (UV da cabine: u ao longo do carro todo)
    roofCarbon: new THREE.MeshPhysicalMaterial({ color: 0x86898f, map: carbonTex(26, 25), metalness: 0.15, roughness: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.06, envMapIntensity: 0.32 }),
    hole: new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.85, metalness: 0 }),
    satinBlack: new THREE.MeshStandardMaterial({ color: 0x0e0f11, roughness: 0.45, metalness: 0.3 }),
    lampBase: new THREE.MeshPhysicalMaterial({ color: 0x0a1424, metalness: 0.85, roughness: 0.25, clearcoat: 1 }),
    grille: M.grille,
    louver: M.louver,
  };
  return MAT;
}

// --------------------------------------------- pele que copia a carroceria
function surfaceKit(ctx) {
  const { THREE, S, mesh } = ctx;
  const memo = new Map();
  const path = (u) => {
    const key = Math.round(clamp(u, 0, 1) * 4000);
    let e = memo.get(key);
    if (e) return e;
    const h = S.halfPath(key / 4000);
    const acc = [0];
    for (let i = 1; i < h.length; i++) acc.push(acc[i - 1] + Math.hypot(h[i].x - h[i - 1].x, h[i].y - h[i - 1].y));
    e = { h, acc, z: S.z(key / 4000) };
    memo.set(key, e);
    return e;
  };
  // ponto da superfície (lado esquerdo) em u e comprimento de arco s (m) a partir do centro de baixo
  const P = (u, s) => {
    const { h, acc, z } = path(u);
    const n = h.length;
    s = clamp(s, 0, acc[n - 1]);
    let i = 0;
    while (i < n - 2 && acc[i + 1] < s) i++;
    const t = (s - acc[i]) / Math.max(1e-6, acc[i + 1] - acc[i]);
    return new THREE.Vector3(h[i].x + (h[i + 1].x - h[i].x) * t, h[i].y + (h[i + 1].y - h[i].y) * t, z);
  };
  const PN = (u, s) => {
    const p = P(u, s);
    const ts = P(u, s + 0.006).sub(P(u, s - 0.006));
    const tu = P(u + 0.003, s).sub(P(u - 0.003, s));
    const n = new THREE.Vector3().crossVectors(tu, ts).normalize();
    if (n.x * ts.y - n.y * ts.x < 0) n.negate();
    return { p, n };
  };
  // s na lateral para uma altura y (canto inferior, lateral e ombro)
  const sOfY = (u, y) => {
    const { h, acc } = path(u);
    for (let i = 4; i < 29; i++) {
      const a = h[i];
      const b = h[i + 1];
      if (b.y >= y) return acc[i] + (acc[i + 1] - acc[i]) * clamp((y - a.y) / Math.max(1e-6, b.y - a.y), 0, 1);
    }
    return acc[29];
  };
  // s no topo para uma distância x do centro
  const sOfX = (u, x) => {
    const { h, acc } = path(u);
    const n = h.length;
    for (let i = n - 1; i > 22; i--) {
      const a = h[i];
      const b = h[i - 1];
      if (b.x >= x) return acc[i] + (acc[i - 1] - acc[i]) * clamp((x - a.x) / Math.max(1e-6, b.x - a.x), 0, 1);
    }
    return acc[22];
  };
  const sTotal = (u) => {
    const { acc } = path(u);
    return acc[acc.length - 1];
  };
  // malha em grade: map(a, b) -> [u, s]; lift(a, b) = afastamento da superfície.
  // wall: profundidade (negativa) das paredes da borda; sides: [1, -1] = esquerda e direita.
  const skin = (map, na, nb, o = {}) => {
    const lift = o.lift ?? 0.003;
    const grid = [];
    for (let i = 0; i <= na; i++)
      for (let j = 0; j <= nb; j++) {
        const a = i / na;
        const b = j / nb;
        const [u, s] = map(a, b);
        const { p, n } = PN(u, s);
        grid.push({ p, n, l: typeof lift === 'function' ? lift(a, b) : lift });
      }
    const G = (i, j) => grid[i * (nb + 1) + j];
    // comprimentos para UV em metros
    let lenA = 0;
    let lenB = 0;
    const jm = nb >> 1;
    const im = na >> 1;
    for (let i = 1; i <= na; i++) lenA += G(i, jm).p.distanceTo(G(i - 1, jm).p);
    for (let j = 1; j <= nb; j++) lenB += G(im, j).p.distanceTo(G(im, j - 1).p);
    const uvs = o.uvUnit ? [1, 1] : [lenA * (o.uvScale ?? 1), lenB * (o.uvScale ?? 1)];
    const out = {};
    for (const sgn of o.sides || [1, -1]) {
      const pos = [];
      const uv = [];
      const idx = [];
      const vtx = (q, l) => {
        pos.push(sgn * (q.p.x + q.n.x * l), q.p.y + q.n.y * l, q.p.z + q.n.z * l);
        return pos.length / 3 - 1;
      };
      for (let i = 0; i <= na; i++)
        for (let j = 0; j <= nb; j++) {
          const q = G(i, j);
          vtx(q, q.l);
          uv.push((i / na) * uvs[0], (j / nb) * uvs[1]);
        }
      // orientação: a face precisa olhar para fora
      const c = G(im, jm);
      const da = G(Math.min(na, im + 1), jm).p.clone().sub(G(Math.max(0, im - 1), jm).p);
      const db = G(im, Math.min(nb, jm + 1)).p.clone().sub(G(im, Math.max(0, jm - 1)).p);
      let flip = new THREE.Vector3().crossVectors(da, db).dot(c.n) < 0;
      if (sgn < 0) flip = !flip;
      // quadMat(a, b) escolhe o material de cada quadrilátero (o.mat vira lista)
      const nM = o.quadMat ? o.mat.length : 1;
      const bk = Array.from({ length: nM }, () => []);
      const tri = (q, a, b, d) => (flip ? q.push(a, d, b) : q.push(a, b, d));
      for (let i = 0; i < na; i++)
        for (let j = 0; j < nb; j++) {
          const k = i * (nb + 1) + j;
          const q = bk[o.quadMat ? o.quadMat((i + 0.5) / na, (j + 0.5) / nb) : 0];
          tri(q, k, k + nb + 1, k + 1);
          tri(q, k + 1, k + nb + 1, k + nb + 2);
        }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      let start = 0;
      bk.forEach((q, mi) => {
        idx.push(...q);
        geo.addGroup(start, q.length, mi);
        start += q.length;
      });
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const m = mesh(geo, o.mat, !!o.cast);
      // paredes da borda (dos dois lados: material comum de um lado só)
      if (o.wall !== undefined) {
        const ring = [];
        for (let i = 0; i <= na; i++) ring.push(G(i, 0));
        for (let j = 1; j <= nb; j++) ring.push(G(na, j));
        for (let i = na - 1; i >= 0; i--) ring.push(G(i, nb));
        for (let j = nb - 1; j >= 1; j--) ring.push(G(0, j));
        ring.push(ring[0]);
        const wp = [];
        const wi = [];
        const wuv = [];
        ring.forEach((q, k) => {
          wp.push(sgn * (q.p.x + q.n.x * q.l), q.p.y + q.n.y * q.l, q.p.z + q.n.z * q.l);
          wp.push(sgn * (q.p.x + q.n.x * o.wall), q.p.y + q.n.y * o.wall, q.p.z + q.n.z * o.wall);
          wuv.push(k * 0.02, 0, k * 0.02, 0.02);
        });
        for (let k = 0; k < ring.length - 1; k++) {
          const a = 2 * k;
          wi.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
          wi.push(a, a + 2, a + 1, a + 2, a + 3, a + 1);
        }
        const wg = new THREE.BufferGeometry();
        wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
        wg.setAttribute('uv', new THREE.Float32BufferAttribute(wuv, 2));
        wg.setIndex(wi);
        wg.computeVertexNormals();
        const g = new THREE.Group();
        g.add(m);
        g.add(mesh(wg, o.wallMat || o.mat, false));
        out[sgn > 0 ? 'L' : 'R'] = g;
      } else out[sgn > 0 ? 'L' : 'R'] = m;
    }
    return out;
  };
  return { P, PN, sOfY, sOfX, sTotal, skin, path };
}

// Loft ao longo de x (asa): secs = [{x, pts:[[z, y], ...]}] com laços fechados do mesmo tamanho.
function loftX(THREE, secs) {
  const n = secs[0].pts.length;
  const pos = [];
  const idx = [];
  for (const s of secs) for (const [z, y] of s.pts) pos.push(s.x, y, z);
  for (let k = 0; k < secs.length - 1; k++)
    for (let i = 0; i < n; i++) {
      const a = k * n + i;
      const b = k * n + ((i + 1) % n);
      idx.push(a, b, a + n, b, b + n, a + n);
    }
  // tampas
  for (const [k, dir] of [
    [0, -1],
    [secs.length - 1, 1],
  ]) {
    const c = pos.length / 3;
    const s = secs[k];
    const cz = s.pts.reduce((q, p) => q + p[0], 0) / n;
    const cy = s.pts.reduce((q, p) => q + p[1], 0) / n;
    pos.push(s.x, cy, cz);
    for (let i = 0; i < n; i++) {
      const a = k * n + i;
      const b = k * n + ((i + 1) % n);
      if (dir > 0) idx.push(c, a, b);
      else idx.push(c, b, a);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export default {
  id: 'ciclone',
  style: 'ciclone',
  name: 'Ciclone F5',
  desc: 'Hipercarro biturbo de motor central. A maior velocidade final do grid.',
  length: LEN,
  frontU: 0.19,
  rearU: 0.75,
  wheelR: 0.345,
  tireW: 0.31,
  trackHalf: 0.86,
  hw: [[0, 0.74], [0.03, 0.87], [0.08, 0.95], [0.13, 1.0], [0.19, 1.035], [0.25, 1.02], [0.32, 0.95], [0.45, 0.93], [0.6, 0.98], [0.7, 1.05], [0.75, 1.075], [0.85, 1.05], [0.95, 0.98], [1, 0.92]],
  yb: [[0, 0.14], [0.06, 0.12], [0.5, 0.12], [0.82, 0.13], [0.9, 0.2], [1, 0.32]],
  yt: [[0, 0.46], [0.04, 0.52], [0.1, 0.58], [0.19, 0.63], [0.3, 0.68], [0.45, 0.74], [0.6, 0.82], [0.75, 0.9], [0.9, 0.9], [1, 0.84]],
  yf: [[0, 0.46], [0.04, 0.62], [0.1, 0.76], [0.19, 0.87], [0.27, 0.83], [0.35, 0.79], [0.5, 0.8], [0.62, 0.9], [0.75, 0.99], [0.88, 0.97], [1, 0.88]],
  rs: [[0, 0.1], [0.12, 0.085], [0.27, 0.09], [0.4, 0.12], [0.75, 0.16], [1, 0.12]],
  rb: 0.06,
  tuck: 0.05,
  tumble: 0.1,
  flare: 0,
  bodyMod,
  cab: {
    s: 0.285,
    e: 0.92,
    roof: 1.13,
    tW: 0.3,
    tR: 0.42,
    hwBase: [[0, 0.7], [0.2, 0.8], [0.4, 0.82], [0.65, 0.72], [1, 0.42]],
    hwRoof: [[0, 0.5], [0.3, 0.62], [0.6, 0.58], [1, 0.3]],
    rRoof: 0.2,
    crown: 0.06,
    winEnd: WIN_END,
    bPillar: null,
    darkGlass: true,
    roofMat: 'carbon',
    // vidro lateral em gota: as fileiras de vértices da lateral acompanham a borda de
    // baixo do vidro, que sobe para trás até virar uma ponta (borda lisa, sem degraus)
    cabMod(t, p, c) {
      // base da cabine bem funda: fica escondida dentro da carroceria (sem "prateleira")
      if (p.seg === 0) {
        p.y = c.yb - 0.16;
        return;
      }
      if (p.seg !== 1 || p.v < 0.3005) return;
      const xr = c.wR - c.r;
      const yA = c.yt - c.crown * (xr / c.wR) ** 2;
      const ySide = yA + ((-2 * c.crown * xr) / (c.wR * c.wR)) * c.r - c.r;
      if (ySide - c.belt < 0.07) return;
      const q = sm(0.22, WIN_END + 0.04, t) ** 2;
      const yW = mix(c.belt + 0.04, ySide - 0.014, q);
      const i = Math.round((p.v - 0.302) / 0.003); // 0 = borracha, 1..6 = lateral
      const y = i === 0 ? yW - 0.02 : i === 1 ? yW : yW + ((ySide - yW) * (i - 1)) / 5;
      p.x = c.wB + ((c.wR - c.wB) * (y - c.yb)) / Math.max(1e-4, ySide - c.yb);
      p.y = y;
    },
    matFn({ t, seg, j, inner, def }) {
      if (seg === 0) return 0;
      if (seg === 3) {
        if (t < 0.045) return 2;
        if (t < 0.35 && (def === 1 || def === 2)) return def;
        // venezianas transversais na espinha de carbono sobre o motor
        if (t > 0.7 && t < 0.95 && j > 19 && Math.round(t * 70) % 3 === 0) return 2;
        return 3;
      }
      if (seg === 2) {
        if (t < 0.28) return inner && t > 0.035 ? 1 : 2;
        return 0;
      }
      if (t < 0.05 && j <= 5) return 2;
      // lateral (j de 4 a 11): 6 = borracha, 7..11 = vidro
      if (t < WIN_END && j >= 6) return t < 0.035 || j === 6 ? 2 : 1;
      return 0;
    },
  },
  wheelStyle: 'center10',
  rimColor: '#141517',
  caliperColor: '#f2c200',
  doorLines: [0.33, 0.57],
  hoodLine: 0.24,
  hoodHalf: 0.58,
  trunkLine: 0.76,
  trunkHalf: 0.6,
  numberU: 0.47,
  stripes: false,
  sideStripe: false,
  livery: {
    noNumber: true,
    noSponsors: true,
    noPanelLines: true,
    draw(g, h) {
      const { W, vy, vx } = h;
      for (const r of [false, true]) {
        const V = (v) => vy(r ? 1 - v : v);
        // sombreado do canal lateral: escurece em direção à tomada de ar
        const gr = g.createLinearGradient(0.34 * W, 0, 0.64 * W, 0);
        gr.addColorStop(0, 'rgba(70,72,78,0)');
        gr.addColorStop(0.5, 'rgba(70,72,78,0.45)');
        gr.addColorStop(1, 'rgba(34,36,40,0.88)');
        g.fillStyle = gr;
        g.beginPath();
        g.moveTo(0.3 * W, V(0.1));
        g.lineTo(0.64 * W, V(0.1));
        g.lineTo(0.64 * W, V(0.28));
        g.lineTo(0.3 * W, V(0.16));
        g.closePath();
        g.fill();
      }
      // junta da porta (sutil)
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 2;
      for (const r of [false, true]) {
        const V = (v) => vy(r ? 1 - v : v);
        g.beginPath();
        g.moveTo(0.305 * W, V(0.3));
        g.lineTo(0.3 * W, V(0.16));
        g.stroke();
      }
    },
  },
  skip: {
    splitter: true,
    skirts: true,
    handles: true,
    markers: true,
    fuel: true,
    mirrors: true,
    wipers: true,
    thirdBrake: true,
    reverse: true,
    plate: true,
    diffuser: true,
    exhaust: true,
  },
  mass: 1360,
  power: 1.45,
  grip: 1.04,
  downforce: 1.2,
  drag: 0.9,
  final: 3.0,

  // aro preto de 10 raios finos em pares (V), côncavo, com porca central
  wheelFace(w) {
    const { THREE, spin, face, rimR, mesh } = w;
    if (!RIM) RIM = new THREE.MeshPhysicalMaterial({ color: 0x0f1012, metalness: 0.55, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 });
    const mat = RIM;
    const r0 = 0.072;
    const r1 = rimR - 0.008;
    const dish = 0.05;
    const pos = [];
    const N = 7;
    for (let k = 0; k < 5; k++) {
      const base = (k / 5) * Math.PI * 2;
      for (const side of [-1, 1]) {
        const st = [];
        for (let i = 0; i <= N; i++) {
          const f = i / N;
          const r = r0 + (r1 - r0) * f;
          const ang = base + side * (0.09 + 0.2 * f) + 0.06 * f; // abre em V e gira um pouco
          const half = (0.011 - 0.003 * f) / r; // meia largura angular
          const xf = face - 0.004 - dish * (1 - f) ** 1.3;
          const xb = xf - 0.03;
          const c = (a, rr, x) => [x, Math.cos(a) * rr, Math.sin(a) * rr];
          st.push([c(ang - half, r, xf), c(ang + half, r, xf), c(ang + half, r, xb), c(ang - half, r, xb)]);
        }
        for (let i = 0; i < N; i++) {
          const A = st[i];
          const B = st[i + 1];
          const q = (a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
          q(A[0], B[0], B[1], A[1]); // frente
          q(A[1], B[1], B[2], A[2]); // lados
          q(A[3], B[3], B[0], A[0]);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    spin.add(mesh(g, mat, false));
    // cubo e porca central
    const hub = new THREE.CylinderGeometry(0.085, 0.09, 0.05, 28);
    hub.rotateZ(Math.PI / 2);
    const hm = mesh(hub, mat, false);
    hm.position.x = face - dish - 0.012;
    spin.add(hm);
    const nut = new THREE.CylinderGeometry(0.032, 0.036, 0.04, 6);
    nut.rotateZ(Math.PI / 2);
    const nm = mesh(nut, w.M.satin, false);
    nm.position.x = face - dish + 0.02;
    spin.add(nm);
    // anel de aro (lábio) escuro já vem do motor; anel de "parafusos" decorativos
    const ring = new THREE.TorusGeometry(rimR - 0.018, 0.006, 6, 48);
    ring.rotateY(Math.PI / 2);
    const rm = mesh(ring, mat, false);
    rm.position.x = face - 0.006;
    spin.add(rm);
    return true;
  },

  decorate(ctx) {
    const { THREE, S, M, root, part, mesh, paintPlain, plateGeo, onFront, onRear, onSide, bumperG, front, rear, fy, ry, headMat, drlMat, brakeMat, revMat, cab } = ctx;
    const X = mats(ctx);
    const K = surfaceKit(ctx);
    const { skin, sOfY, sOfX, PN } = K;
    const L = S.L;
    const add = (grp, o) => {
      grp.add(o.L);
      grp.add(o.R);
    };

    // branco perolado: leve iridescência no verniz (vale para qualquer cor escolhida)
    for (const pm of [ctx.paint, paintPlain]) {
      pm.iridescence = 0.3;
      pm.iridescenceIOR = 1.45;
      pm.iridescenceThicknessRange = [260, 420];
    }
    // emblema redondo no contraforte atrás da janela
    {
      const t = 0.72;
      const ch = S.cabHalf(t);
      const yb = ch.belt + 0.08;
      for (const sgn of [1, -1]) {
        const x = S.cabSideX(t, yb);
        const em = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.006, 24), M.chrome, false);
        em.rotation.z = Math.PI / 2;
        em.position.set(sgn * (x + 0.002), yb, S.z(S.cabU(t)));
        root.add(em);
        const ei = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.007, 24), new THREE.MeshStandardMaterial({ color: 0x9a1418, roughness: 0.4 }), false);
        ei.rotation.z = Math.PI / 2;
        ei.position.set(sgn * (x + 0.003), yb, S.z(S.cabU(t)));
        root.add(ei);
      }
    }
    // teto em carbono com trama fina (troca o material 3 da cabine)
    for (const o of root.children)
      if (o.isMesh && Array.isArray(o.material) && o.material[3] === M.carbon) {
        o.material = o.material.slice();
        o.material[3] = X.roofCarbon;
      }

    // ------------------------- ressalto do capô com a abertura escura na frente
    {
      // b < 0.3: faixa escura (a frente do ressalto); a malha segue a curva em "U"
      const podMap = (a, b) => {
        const x = a * (POD_W + 0.02);
        const us = podU(Math.min(x, POD_W));
        const u = b < 0.3 ? mix(us - 0.03, us + 0.013, b / 0.3) : mix(us + 0.013, 0.31, (b - 0.3) / 0.7);
        return [u, sOfX(u, x), x];
      };
      const o = skin((a, b) => podMap(a, b), 16, 30, {
        mat: [paintPlain, X.hole],
        lift: (a, b) => {
          const [u, , x] = podMap(a, b);
          return podH(u, x);
        },
        quadMat: (a, b) => (b < 0.3 ? 1 : 0),
        cast: true,
      });
      add(root, o);
    }

    // --------------------------------------------------------------- faróis
    {
      // linha central do farol: da ponta dianteira (a = 0) até a ponta traseira (a = 1)
      const lamp = (a, b, grow = 0) => {
        const u = 0.02 + 0.1 * a;
        const sC = sOfY(u, mix(0.47, 0.6, a)); // na face da frente, subindo para o para-lama
        const hw = 0.042 * Math.pow(1 - a, 0.7) * Math.sqrt(sm(0, 0.12, a)) + 0.005 + grow;
        return [u, sC + (b * 2 - 1) * hw];
      };
      for (const sgn of [1, -1]) {
        const hp = part(sgn > 0 ? 'farol esquerdo' : 'farol direito', 14);
        const sides = [sgn];
        const pick = (o) => (sgn > 0 ? o.L : o.R);
        hp.add(pick(skin((a, b) => lamp(a, b, 0.006), 24, 4, { mat: M.gloss, lift: 0.003, wall: -0.02, sides })));
        hp.add(pick(skin((a, b) => lamp(a, b), 24, 4, { mat: X.lampBase, lift: 0.005, sides })));
        // filete de LED na borda de cima
        hp.add(pick(skin((a, b) => {
          const [u, s0] = lamp(0.04 + a * 0.86, 0.78 + 0.14 * b);
          return [u, s0];
        }, 24, 1, { mat: drlMat, lift: 0.007, sides })));
        // projetores (duas lentes pequenas)
        for (const a of [0.2, 0.36]) {
          const [u, s] = lamp(a, 0.4);
          const { p, n } = PN(u, s);
          const pr = mesh(new THREE.SphereGeometry(0.016, 14, 8), headMat, false);
          pr.position.set(sgn * (p.x + n.x * 0.006), p.y + n.y * 0.006, p.z + n.z * 0.006);
          pr.scale.set(1, 1, 1);
          hp.add(pr);
        }
        hp.add(pick(skin((a, b) => lamp(a, b, 0.003), 24, 4, { mat: M.lens, lift: 0.014, wall: 0.003, sides })));
      }
    }

    // ----------------------------------------------- frente: entradas de ar
    {
      // entradas grandes nos cantos (na superfície que vira para a frente)
      const o = skin(
        (a, b) => {
          const u = 0.004 + 0.07 * a;
          const y = mix(0.16, 0.36 - 0.05 * a, b) + 0.015 * a;
          return [u, sOfY(u, y)];
        },
        12,
        6,
        { mat: X.hole, lift: 0.003 },
      );
      add(bumperG, o);
      const gr = skin(
        (a, b) => {
          const u = 0.008 + 0.06 * a;
          const y = mix(0.17, 0.345 - 0.05 * a, b) + 0.015 * a;
          return [u, sOfY(u, y)];
        },
        10,
        5,
        { mat: X.grille, lift: 0.0045, uvScale: 1 },
      );
      add(bumperG, gr);
      // tampa plana da ponta: normais levemente para cima (reflete o céu como o resto da lataria)
      for (const o of root.children)
        if (o.isMesh && o.material === paintPlain && o.geometry.attributes.position.getZ(0) > S.z(0.001)) {
          const nr = o.geometry.attributes.normal;
          for (let k = 0; k < nr.count; k++) nr.setXYZ(k, 0, 0.53, 0.85);
        }
      // boca central larga logo acima do splitter
      const g = onFront(0, NOSE_Y, 0.002);
      g.add(mesh(plateGeo([[-0.33, -0.06], [0.33, -0.06], [0.3, 0.05], [0.1, 0.065], [-0.1, 0.065], [-0.3, 0.05]], 0.025, 0.03), X.hole, false));
      const gm = mesh(plateGeo([[-0.3, -0.045], [0.3, -0.045], [0.27, 0.04], [-0.27, 0.04]], 0.02, 0.01), X.grille, false);
      gm.position.z = 0.002;
      gm.scale.set(0.97, 0.9, 1);
      g.add(gm);
      bumperG.add(g);
    }

    // ------------------------------------------------- splitter de carbono
    {
      const ySp = front.yb - 0.02;
      const shp = new THREE.Shape();
      const pts = [];
      const uB = 0.15;
      for (let k = 0; k <= 12; k++) {
        const u = uB * (1 - k / 12);
        const x = S.sideX(u, ySp + 0.06) + 0.035 + 0.03 * (1 - u / uB);
        pts.push([x, S.z(u)]);
      }
      const zN = S.z(0) + 0.11;
      pts.push([0.35, zN - 0.02]);
      pts.push([0, zN]);
      pts.push([-0.35, zN - 0.02]);
      for (let k = 12; k >= 0; k--) {
        const [x, z] = pts[k];
        pts.push([-x, z]);
      }
      shp.moveTo(pts[0][0], -pts[0][1]);
      for (const [x, z] of pts.slice(1)) shp.lineTo(x, -z);
      shp.closePath();
      const geo = new THREE.ExtrudeGeometry(shp, { depth: 0.028, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2, curveSegments: 4 });
      geo.rotateX(Math.PI / 2);
      const sp = mesh(geo, X.carbon);
      sp.position.y = ySp + 0.034;
      bumperG.add(sp);
    }

    // ------------------------------------------------------ lateral: saias
    for (const sgn of [1, -1]) {
      const sk = part(sgn > 0 ? 'saia esquerda' : 'saia direita', 22);
      const o = skin(
        (a, b) => {
          const u = mix(S.u(S.zF - S.rA - 0.02), S.u(S.zR + S.rA + 0.02), a);
          const y = mix(0.135, 0.23, b);
          return [u, sOfY(u, y)];
        },
        40,
        4,
        { mat: X.carbon, lift: (a, b) => 0.008 + 0.014 * b * (1 - b) * 4, wall: -0.01, sides: [sgn], uvScale: 1 },
      );
      sk.add(sgn > 0 ? o.L : o.R);
    }

    // ------------------------------------- tomada de ar no fim do canal lateral
    {
      const o = skin(
        (a, b) => {
          const u = mix(CH_END0 + 0.004, CH_END1 - 0.004, b);
          const y = mix(0.3, chanTop(u) - 0.03, a);
          return [u, sOfY(u, y)];
        },
        10,
        6,
        { mat: X.hole, lift: 0.004 },
      );
      add(root, o);
      const gr = skin(
        (a, b) => {
          const u = mix(CH_END0 + 0.007, CH_END1 - 0.006, b);
          const y = mix(0.32, chanTop(u) - 0.05, a);
          return [u, sOfY(u, y)];
        },
        10,
        6,
        { mat: X.grille, lift: 0.006, uvScale: 1 },
      );
      add(root, gr);
    }

    // ------------------------------------------- retrovisores pequenos em haste
    {
      const t = 0.07;
      const mu = S.cabU(t);
      const ch = S.cabHalf(t);
      const by = ch.belt + 0.035;
      for (const sgn of [1, -1]) {
        const mg = part(sgn > 0 ? 'retrovisor esquerdo' : 'retrovisor direito', 12);
        const x0 = S.cabSideX(t, by);
        const stalk = mesh(new THREE.BoxGeometry(0.1, 0.016, 0.035), paintPlain, false);
        stalk.position.set(sgn * (x0 + 0.02), by + 0.02, S.z(mu) - 0.02);
        stalk.rotation.z = sgn * 0.5;
        stalk.scale.x = 0.7;
        mg.add(stalk);
        const head = mesh(new THREE.SphereGeometry(1, 20, 12), paintPlain);
        head.scale.set(0.05, 0.034, 0.085);
        head.position.set(sgn * (x0 + 0.075), by + 0.045, S.z(mu) - 0.03);
        mg.add(head);
        const gl = mesh(new THREE.CircleGeometry(1, 18), M.mirror, false);
        gl.scale.set(0.055, 0.028, 1);
        gl.rotation.y = Math.PI;
        gl.position.set(sgn * (x0 + 0.075), by + 0.045, S.z(mu) - 0.08);
        mg.add(gl);
      }
    }

    // ------------------------------- tampa do motor: venezianas e espinha
    {
      // respiros no alto dos para-lamas traseiros (moldura preta + veneziana)
      const ventMap = (m) => (a, b) => {
        const u = mix(0.785 - m, 0.865 + m, a);
        const x = mix(0.71 - m, 0.85 + m, b) - 0.025 * a;
        return [u, sOfX(u, x)];
      };
      add(root, skin(ventMap(0.006), 8, 4, { mat: X.hole, lift: 0.003 }));
      add(root, skin(ventMap(0), 8, 4, { mat: X.louver, lift: 0.005, uvScale: 1 }));
    }

    // ------------------------------------------------------ asa traseira
    {
      const wing = part('asa traseira', 18);
      const uw = 0.95;
      const zc = S.z(uw);
      const yw = 1.16;
      const span = 1.8;
      const secs = [];
      const NS = 26;
      for (let k = 0; k <= NS; k++) {
        const f = k / NS;
        const x = (f - 0.5) * span;
        const e = Math.max(0, (Math.abs(x) - span * 0.36) / (span * 0.14));
        const rise = 0.055 * e * e;
        const c = 0.34 - 0.06 * e;
        const aoa = 0.13 + 0.05 * e;
        const pts = [];
        const NP = 16;
        for (let i = 0; i < NP; i++) {
          const th = (i / NP) * Math.PI * 2;
          // aerofólio: x' de -0.5 (bordo de fuga) a 0.5 (ataque), mais curvo embaixo
          const xc = 0.5 * Math.cos(th);
          const tk = 0.07 * Math.sqrt(Math.max(0, 0.5 + xc)) * (1 - (0.5 + xc) * 0.6);
          const yc = Math.sin(th) > 0 ? tk * 0.6 : -tk * 1.2 - 0.02 * (1 - 4 * xc * xc);
          const zz = xc * c;
          const yy = yc * c * 2.2;
          pts.push([zc + zz * Math.cos(aoa) + yy * Math.sin(aoa), yw + rise + yy * Math.cos(aoa) - zz * Math.sin(aoa)]);
        }
        secs.push({ x, pts });
      }
      wing.add(mesh(loftX(THREE, secs), paintPlain));
      // gurney flap escuro no bordo de fuga
      const gf = mesh(new THREE.BoxGeometry(span * 0.6, 0.022, 0.006), X.satinBlack, false);
      gf.position.set(0, yw + 0.03, zc - 0.165);
      wing.add(gf);
      // suportes em "pescoço de cisne"
      for (const sgn of [1, -1]) {
        const xs = sgn * 0.36;
        const yd = S.topY(uw, 0.36);
        const hS = yw - yd - 0.03; // topo do suporte fica escondido dentro da asa
        const prof = [
          [0.09, 0],
          [-0.07, 0],
          [-0.06, hS * 0.5],
          [-0.03, hS],
          [0.05, hS],
          [0.06, hS * 0.6],
        ];
        const g = mesh(plateGeo(prof.map(([z, y]) => [z, y]), 0.02, 0.022), paintPlain);
        g.rotation.y = -Math.PI / 2;
        g.position.set(xs - 0.011, yd - 0.01, zc);
        wing.add(g);
      }
    }

    // --------------------------------------------------- traseira
    {
      // painel de tela preta de largura quase total
      const pn = onRear(0, ry(0.42), 0.002);
      pn.add(mesh(plateGeo([[-rear.hw * 0.86, -0.13], [rear.hw * 0.86, -0.13], [rear.hw * 0.8, 0.12], [-rear.hw * 0.8, 0.12]], 0.05, 0.03), X.grille, false));
      root.add(pn);
      // lanternas finas nos cantos de cima
      for (const sgn of [1, -1]) {
        const out = [[-0.3, -0.012], [0.12, -0.022], [0.2, 0.0], [0.2, 0.018], [-0.3, 0.014]];
        const leds = [[[-0.28, -0.004], [0.17, -0.012], [0.17, 0.006], [-0.28, 0.006]]];
        const g = onRear(sgn * rear.hw * 0.62, ry(0.86), 0.003);
        g.add(ctx.taillight(-sgn, out, leds, { r: 0.008 }));
        part(sgn > 0 ? 'lanterna esquerda' : 'lanterna direita', 14).add(g);
      }
      // luz de freio central e de ré
      const tb = onRear(0, ry(0.86), 0.003);
      tb.add(mesh(plateGeo([[-0.12, -0.006], [0.12, -0.006], [0.12, 0.006], [-0.12, 0.006]], 0.004, 0.008), brakeMat, false));
      root.add(tb);
      // nome do modelo em letras prateadas, pequeno, abaixo da luz de freio
      {
        const cv = document.createElement('canvas');
        cv.width = 512;
        cv.height = 64;
        const g = cv.getContext('2d');
        g.font = 'bold 40px Arial, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = '#d9dde2';
        g.fillText('C I C L O N E   F 5', 256, 34);
        const tex = new THREE.CanvasTexture(cv);
        tex.colorSpace = THREE.SRGBColorSpace;
        const nm = mesh(new THREE.PlaneGeometry(0.34, 0.0425), new THREE.MeshStandardMaterial({ map: tex, transparent: true, metalness: 0.8, roughness: 0.3 }), false);
        const ng = onRear(0, ry(0.78), 0.004);
        ng.add(nm);
        root.add(ng);
      }
      const rv = onRear(0, ry(0.62), 0.006);
      rv.add(mesh(plateGeo([[-0.06, -0.012], [0.06, -0.012], [0.06, 0.012], [-0.06, 0.012]], 0.006, 0.01), revMat, false));
      root.add(rv);
      // escapamentos centrais
      for (const sgn of [1, -1]) {
        const ex = 0.12 * sgn;
        const ey = ry(0.3);
        const zz = S.rearZ(ex, ey);
        const tip = new THREE.CylinderGeometry(0.05, 0.055, 0.14, 24, 1, true);
        tip.rotateX(Math.PI / 2);
        const e = mesh(tip, new THREE.MeshStandardMaterial({ color: 0x2e2f33, metalness: 1, roughness: 0.25, side: THREE.DoubleSide }), false);
        e.position.set(ex, ey, zz - 0.02);
        root.add(e);
        const inn = mesh(new THREE.CircleGeometry(0.048, 20), M.exhaustIn, false);
        inn.rotation.y = Math.PI;
        inn.position.set(ex, ey, zz + 0.0);
        root.add(inn);
      }
      // difusor: aletas verticais sob a rampa do assoalho
      const dif = part('difusor', 20);
      for (const xf of [-0.62, -0.36, -0.12, 0.12, 0.36, 0.62]) {
        const shp = [];
        const u0 = 0.82;
        for (let k = 0; k <= 8; k++) {
          const u = u0 + (1 - u0) * (k / 8);
          shp.push([S.z(u), S.sec(u).yb + 0.01]);
        }
        shp.push([S.z(1) - 0.03, 0.2]);
        shp.push([S.z(u0), 0.13]);
        const fg = mesh(plateGeo(shp.map(([z, y]) => [z, y]), 0.01, 0.012), X.satinBlack);
        fg.rotation.y = -Math.PI / 2;
        fg.position.set(xf - 0.006, 0, 0);
        dif.add(fg);
      }
      // teto do difusor (rampa do assoalho) em preto fosco
      const ramp = skin(
        (a, b) => {
          const u = mix(0.8, 0.996, a);
          return [u, b * K.path(u).acc[4] * 1.02];
        },
        16,
        4,
        { mat: X.hole, lift: 0.004, sides: [1, -1] },
      );
      add(dif, ramp);
      const lip = mesh(new THREE.BoxGeometry(rear.hw * 1.7, 0.012, 0.08), X.carbon);
      lip.position.set(0, 0.125, S.z(1) - 0.0);
      dif.add(lip);
    }
  },
};
