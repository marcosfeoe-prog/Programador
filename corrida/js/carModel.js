// Modelos 3D procedurais dos carros: carroceria "loftada" a partir de seções
// superelípticas (com caixas de roda recortadas), cabine com vidros e colunas,
// faróis, lanternas, grade, splitter, difusor, escapamentos, retrovisores, asa,
// interior com piloto e rodas completas (pneu com banda de rodagem, aro raiado,
// disco de freio e pinça).
import * as THREE from 'three';
import * as TX from './textures.js';

// ---------------------------------------------------------------- modelos
export const CAR_MODELS = [
  {
    id: 'gt',
    name: 'Falcão GT',
    desc: 'Carro de corrida GT com asa traseira. Equilibrado e estável.',
    length: 4.6,
    frontU: 0.18,
    rearU: 0.79,
    wheelR: 0.345,
    tireW: 0.28,
    trackHalf: 0.87,
    hw: [[0, 0.8], [0.04, 0.9], [0.1, 0.96], [0.18, 1.0], [0.32, 0.955], [0.5, 0.93], [0.68, 0.975], [0.79, 1.02], [0.92, 0.985], [0.97, 0.94], [1, 0.86]],
    yb: [[0, 0.17], [0.1, 0.14], [0.9, 0.15], [1, 0.27]],
    yt: [[0, 0.47], [0.06, 0.62], [0.18, 0.79], [0.3, 0.8], [0.6, 0.83], [0.79, 0.9], [0.93, 0.88], [1, 0.8]],
    n: 3.0,
    tumble: 0.14,
    cab: { s: 0.3, e: 0.84, roof: 1.2, tW: 0.32, tR: 0.6, hw: [[0, 0.86], [0.25, 0.73], [0.6, 0.7], [1, 0.62]], n: 3.2, tumble: 0.3 },
    headlights: 'slim',
    taillights: 'slim',
    wing: true,
    hoodVents: true,
    exhaust: 'center2',
    doorLines: [0.36, 0.6],
    hoodLine: 0.29,
    numberU: 0.5,
    stripes: false,
    sideStripe: true,
    mass: 1250,
    power: 1.0,
    grip: 1.0,
  },
  {
    id: 'raio',
    name: 'Raio S',
    desc: 'Superesportivo de motor central. Rápido nas retas, arisco nas curvas.',
    length: 4.5,
    frontU: 0.17,
    rearU: 0.8,
    wheelR: 0.34,
    tireW: 0.29,
    trackHalf: 0.86,
    hw: [[0, 0.78], [0.04, 0.88], [0.1, 0.95], [0.17, 0.985], [0.4, 0.935], [0.62, 0.975], [0.8, 1.03], [0.95, 0.99], [1, 0.9]],
    yb: [[0, 0.15], [0.1, 0.13], [0.9, 0.14], [1, 0.26]],
    yt: [[0, 0.42], [0.06, 0.58], [0.17, 0.77], [0.3, 0.74], [0.6, 0.8], [0.8, 0.88], [0.95, 0.86], [1, 0.79]],
    n: 2.6,
    tumble: 0.16,
    cab: { s: 0.26, e: 0.74, roof: 1.11, tW: 0.42, tR: 0.66, hw: [[0, 0.84], [0.35, 0.7], [0.65, 0.68], [1, 0.64]], n: 2.8, tumble: 0.34 },
    headlights: 'slim',
    taillights: 'bar',
    wing: false,
    ducktail: true,
    louvers: true,
    exhaust: 'center4',
    doorLines: [0.33, 0.57],
    hoodLine: 0.24,
    numberU: 0.47,
    stripes: true,
    sideStripe: false,
    mass: 1180,
    power: 1.1,
    grip: 0.96,
  },
  {
    id: 'bisao',
    name: 'Bisão V8',
    desc: 'Muscle car V8 de capô longo. Muito torque, mais pesado.',
    length: 4.8,
    frontU: 0.16,
    rearU: 0.8,
    wheelR: 0.35,
    tireW: 0.29,
    trackHalf: 0.85,
    hw: [[0, 0.86], [0.03, 0.91], [0.08, 0.94], [0.2, 0.96], [0.5, 0.94], [0.8, 0.975], [0.97, 0.95], [1, 0.9]],
    yb: [[0, 0.2], [0.1, 0.18], [0.9, 0.18], [1, 0.24]],
    yt: [[0, 0.64], [0.05, 0.75], [0.35, 0.84], [0.6, 0.88], [0.85, 0.9], [1, 0.87]],
    n: 4.6,
    tumble: 0.08,
    cab: { s: 0.4, e: 0.82, roof: 1.3, tW: 0.28, tR: 0.62, hw: [[0, 0.86], [0.25, 0.76], [0.6, 0.75], [1, 0.72]], n: 4.0, tumble: 0.22 },
    headlights: 'round',
    taillights: 'wide',
    wing: false,
    lip: true,
    scoop: true,
    antenna: true,
    exhaust: 'sides',
    doorLines: [0.43, 0.64],
    hoodLine: 0.39,
    numberU: 0.53,
    stripes: true,
    sideStripe: false,
    mass: 1420,
    power: 1.18,
    grip: 0.95,
  },
];

export const CAR_COLORS = [
  { name: 'Vermelho', color: '#c8141c', stripe: '#f4f4f4', sponsor: '#ffffff' },
  { name: 'Azul', color: '#1446b8', stripe: '#f2f2f2', sponsor: '#ffd400' },
  { name: 'Amarelo', color: '#f2b705', stripe: '#121212', sponsor: '#121212' },
  { name: 'Verde', color: '#0f7a3a', stripe: '#f0e6c8', sponsor: '#ffffff' },
  { name: 'Branco', color: '#ecedee', stripe: '#1446b8', sponsor: '#c8141c' },
  { name: 'Preto', color: '#17181b', stripe: '#e88a10', sponsor: '#e88a10' },
  { name: 'Laranja', color: '#e8620c', stripe: '#141414', sponsor: '#ffffff' },
  { name: 'Prata', color: '#9aa1a8', stripe: '#c8141c', sponsor: '#111111' },
];

const RIM_COLORS = ['#c9ccd0', '#1c1d20', '#b8923a', '#8d9399'];
const CALIPER_COLORS = ['#d01d1d', '#f2c200', '#1d5fd0', '#e8620c'];

// ------------------------------------------------------------- utilidades
// Interpolação Catmull-Rom (com bordas presas) entre chaves [u, valor].
function kf(arr, u) {
  const n = arr.length;
  if (u <= arr[0][0]) return arr[0][1];
  if (u >= arr[n - 1][0]) return arr[n - 1][1];
  let i = 1;
  while (u > arr[i][0]) i++;
  const p0 = arr[Math.max(0, i - 2)][1];
  const p1 = arr[i - 1][1];
  const p2 = arr[i][1];
  const p3 = arr[Math.min(n - 1, i + 1)][1];
  const t = (u - arr[i - 1][0]) / (arr[i][0] - arr[i - 1][0]);
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

const sgnPow = (v, p) => Math.sign(v) * Math.pow(Math.abs(v), p);

// Geometria da forma do carro (carroceria + cabine), usada para gerar a malha e
// para posicionar os detalhes exatamente sobre a superfície.
class CarShape {
  constructor(spec) {
    this.s = spec;
    this.L = spec.length;
    this.R = spec.wheelR;
    this.zF = this.z(spec.frontU);
    this.zR = this.z(spec.rearU);
  }
  z(u) {
    return this.L / 2 - u * this.L;
  }
  u(z) {
    return (this.L / 2 - z) / this.L;
  }
  sec(u) {
    const s = this.s;
    let hw = kf(s.hw, u);
    const yb = kf(s.yb, u);
    const yt = kf(s.yt, u);
    // arredondamento das pontas (para-choques curvos)
    const e0 = 0.035;
    const e1 = 0.03;
    let f = 1;
    if (u < e0) f = Math.sqrt(1 - (1 - u / e0) ** 2);
    else if (u > 1 - e1) f = Math.sqrt(1 - (1 - (1 - u) / e1) ** 2);
    const fw = 0.55 + 0.45 * f;
    const fh = 0.45 + 0.55 * f;
    hw *= fw;
    const ym = (yb + yt) / 2 + (1 - fh) * 0.05;
    const hh = ((yt - yb) / 2) * fh;
    return { hw, ym, hh, yb, yt, n: s.n, tb: s.tumble };
  }
  point(u, ex, ey, out) {
    const c = this.sec(u);
    out.set(ex * c.hw * (1 - c.tb * Math.max(0, ey)), c.ym + ey * c.hh, this.z(u));
    return c;
  }
  // altura do recorte das caixas de roda na posição z (ou -Infinity)
  arch(z, ytop) {
    const rA = this.R + 0.075;
    let y = -Infinity;
    for (const zw of [this.zF, this.zR]) {
      const dz = z - zw;
      if (Math.abs(dz) < rA) y = Math.max(y, this.R + 0.02 + Math.sqrt(rA * rA - dz * dz));
    }
    return Math.min(y, ytop - 0.08);
  }
  inside(u, x, y) {
    const c = this.sec(u);
    const ey = (y - c.ym) / c.hh;
    if (Math.abs(ey) > 1) return false;
    const ex = Math.pow(1 - Math.pow(Math.abs(ey), c.n), 1 / c.n);
    return Math.abs(x) <= ex * c.hw * (1 - c.tb * Math.max(0, ey));
  }
  frontZ(x, y) {
    for (let u = 0; u < 0.3; u += 0.002) if (this.inside(u, x, y)) return this.z(u);
    return this.z(0.3);
  }
  rearZ(x, y) {
    for (let u = 1; u > 0.7; u -= 0.002) if (this.inside(u, x, y)) return this.z(u);
    return this.z(0.7);
  }
  topY(u, x) {
    const c = this.sec(u);
    for (let ey = 1; ey > -1; ey -= 0.005) {
      const ex = Math.pow(1 - Math.pow(Math.abs(ey), c.n), 1 / c.n);
      if (Math.abs(x) <= ex * c.hw * (1 - c.tb * Math.max(0, ey))) return c.ym + ey * c.hh;
    }
    return c.ym;
  }
  sideX(u, y) {
    const c = this.sec(u);
    const ey = THREE.MathUtils.clamp((y - c.ym) / c.hh, -1, 1);
    const ex = Math.pow(1 - Math.pow(Math.abs(ey), c.n), 1 / c.n);
    return ex * c.hw * (1 - c.tb * Math.max(0, ey));
  }
  // ---- cabine
  cabU(t) {
    const c = this.s.cab;
    return c.s + t * (c.e - c.s);
  }
  cabSec(t) {
    const c = this.s.cab;
    const u = this.cabU(t);
    const belt = this.topY(u, 0.55) - 0.02;
    let k;
    if (t < c.tW) k = Math.sin(((t / c.tW) * Math.PI) / 2);
    else if (t < c.tR) k = 1;
    else k = Math.cos((((t - c.tR) / (1 - c.tR)) * Math.PI) / 2);
    k = Math.max(0, k);
    const yb = belt - 0.08;
    const yt = belt + (c.roof - belt) * Math.pow(k, 0.85) + 0.004;
    return { hw: kf(c.hw, t), ym: (yb + yt) / 2, hh: (yt - yb) / 2, n: c.n, tb: c.tumble, belt, yt };
  }
  cabPoint(t, ex, ey, out) {
    const c = this.cabSec(t);
    out.set(ex * c.hw * (1 - c.tb * Math.max(0, ey)), c.ym + ey * c.hh, this.z(this.cabU(t)));
    return c;
  }
}

// Gera uma malha "loft" (anéis de seções) com grupos de material por quadrilátero.
function loftGeometry(nu, M, pointFn, quadMat, nMats) {
  const pos = new Float32Array((nu + 1) * (M + 1) * 3);
  const uv = new Float32Array((nu + 1) * (M + 1) * 2);
  const col = new Float32Array((nu + 1) * (M + 1) * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i <= nu; i++)
    for (let j = 0; j <= M; j++) {
      const k = i * (M + 1) + j;
      const info = pointFn(i, j, v);
      pos.set([v.x, v.y, v.z], k * 3);
      uv.set(info.uv, k * 2);
      col.set([info.shade, info.shade, info.shade], k * 3);
    }
  const buckets = Array.from({ length: nMats }, () => []);
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < M; j++) {
      const a = i * (M + 1) + j;
      const b = a + 1;
      const c = a + M + 1;
      const d = c + 1;
      buckets[quadMat(i, j)].push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const index = [];
  let start = 0;
  buckets.forEach((b, m) => {
    index.push(...b);
    g.addGroup(start, b.length, m);
    start += b.length;
  });
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

// Tampa (leque) fechando um anel de pontos; orienta a face para `dir`.
function capGeometry(ring, dir) {
  const c = new THREE.Vector3();
  ring.forEach((p) => c.add(p));
  c.divideScalar(ring.length);
  const pos = [c.x, c.y, c.z];
  ring.forEach((p) => pos.push(p.x, p.y, p.z));
  const idx = [];
  for (let j = 0; j < ring.length - 1; j++) idx.push(0, j + 1, j + 2);
  const a = ring[0].clone().sub(c);
  const b = ring[1].clone().sub(c);
  if (a.cross(b).dot(dir) < 0) for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const uvs = [0.5, 0.97];
  ring.forEach(() => uvs.push(0.5, 0.97));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const cols = [];
  for (let k = 0; k <= ring.length; k++) cols.push(1, 1, 1);
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------- materiais comuns
let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  const carbon = TX.carbonTexture();
  SHARED = {
    chrome: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, metalness: 1, roughness: 0.08 }),
    blackPlastic: new THREE.MeshStandardMaterial({ color: 0x0d0d0f, metalness: 0.1, roughness: 0.55 }),
    gloss: new THREE.MeshPhysicalMaterial({ color: 0x050506, metalness: 0.2, roughness: 0.2, clearcoat: 1 }),
    carbon: new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: carbon, metalness: 0.3, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.1 }),
    grille: new THREE.MeshStandardMaterial({ color: 0xffffff, map: TX.honeycombTexture(), metalness: 0.3, roughness: 0.6 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x0c1218,
      metalness: 0,
      roughness: 0.04,
      transparent: true,
      opacity: 0.4,
      envMapIntensity: 1.6,
      clearcoat: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.22, clearcoat: 1, depthWrite: false }),
    reflector: new THREE.MeshStandardMaterial({ color: 0xdfe4ea, metalness: 1, roughness: 0.15 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.92 }),
    disc: new THREE.MeshStandardMaterial({ color: 0x77797d, metalness: 0.9, roughness: 0.38 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x2b2d31, metalness: 0.8, roughness: 0.4 }),
    seat: new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.85 }),
    seatAccent: new THREE.MeshStandardMaterial({ color: 0x8a1010, roughness: 0.8 }),
    suit: new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.8 }),
    visor: new THREE.MeshPhysicalMaterial({ color: 0x080808, metalness: 0.6, roughness: 0.05, clearcoat: 1 }),
    mirror: new THREE.MeshStandardMaterial({ color: 0xcfd6dc, metalness: 1, roughness: 0.02 }),
    exhaustIn: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 }),
    plateMat: null,
  };
  return SHARED;
}

function mesh(geo, mat, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = false;
  return m;
}

// ------------------------------------------------------------------ rodas
function buildWheel(spec, rimColor, caliperColor, M) {
  const R = spec.wheelR;
  const w = spec.tireW;
  const rimR = R * 0.74;
  // perfil do pneu (raio, eixo) da lateral interna até a externa
  const pts = [];
  const side = (y, r0, r1, n) => {
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1);
      const r = r0 + (r1 - r0) * t;
      pts.push(new THREE.Vector2(r, y + Math.sign(y) * 0.012 * Math.sin(t * Math.PI)));
    }
  };
  const cr = 0.045;
  side(-w / 2, rimR, R - cr, 6);
  for (let k = 1; k <= 5; k++) {
    const a = (k / 6) * (Math.PI / 2);
    pts.push(new THREE.Vector2(R - cr + Math.sin(a) * cr, -w / 2 + cr - Math.cos(a) * cr));
  }
  const treadStart = pts.length;
  for (let k = 0; k < 7; k++) pts.push(new THREE.Vector2(R, -w / 2 + cr + ((w - 2 * cr) * k) / 6));
  const treadEnd = pts.length - 1;
  for (let k = 1; k <= 5; k++) {
    const a = (k / 6) * (Math.PI / 2);
    pts.push(new THREE.Vector2(R - cr + Math.cos(a) * cr, w / 2 - cr + Math.sin(a) * cr));
  }
  const sideBStart = pts.length;
  side(w / 2, R - cr, rimR, 6);
  const nP = pts.length - 1;
  const tireGeo = new THREE.LatheGeometry(pts, 56);
  tireGeo.rotateZ(-Math.PI / 2);
  const tireTex = TX.tireTexture(treadStart / nP, treadEnd / nP, [(sideBStart + 2.5) / nP, 2.5 / nP]);
  const tireMat = new THREE.MeshStandardMaterial({ map: tireTex, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });

  const pivot = new THREE.Group();
  const mirror = new THREE.Group();
  pivot.add(mirror);
  const spin = new THREE.Group();
  mirror.add(spin);
  spin.add(mesh(tireGeo, tireMat));

  const rimMat = new THREE.MeshPhysicalMaterial({ color: rimColor, metalness: 1, roughness: 0.22, clearcoat: 0.6 });
  // tambor do aro
  const barrel = new THREE.CylinderGeometry(rimR, rimR, w * 0.92, 40, 1, true);
  barrel.rotateZ(Math.PI / 2);
  spin.add(mesh(barrel, new THREE.MeshStandardMaterial({ color: 0x55585e, metalness: 0.9, roughness: 0.35, side: THREE.DoubleSide }), false));
  // borda (lábio) do aro
  const lip = new THREE.TorusGeometry(rimR - 0.004, 0.013, 8, 48);
  lip.rotateY(Math.PI / 2);
  const lipM = mesh(lip, M.chrome, false);
  lipM.position.x = w * 0.43;
  spin.add(lipM);
  // raios duplos
  const spokes = 7;
  const spokeLen = rimR - 0.07;
  const spokeGeo = new THREE.BoxGeometry(0.028, spokeLen, 0.026);
  spokeGeo.translate(0, 0.07 + spokeLen / 2, 0);
  for (let k = 0; k < spokes; k++) {
    for (const off of [-0.075, 0.075]) {
      const s = mesh(spokeGeo, rimMat, false);
      s.rotation.x = (k / spokes) * Math.PI * 2 + off;
      s.position.x = w * 0.36;
      s.rotation.y = 0;
      spin.add(s);
    }
  }
  // cubo, porcas e calota central
  const hub = new THREE.CylinderGeometry(0.075, 0.085, 0.06, 24);
  hub.rotateZ(Math.PI / 2);
  const hubM = mesh(hub, rimMat, false);
  hubM.position.x = w * 0.34;
  spin.add(hubM);
  const nutGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.03, 6);
  nutGeo.rotateZ(Math.PI / 2);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const n = mesh(nutGeo, M.chrome, false);
    n.position.set(w * 0.38, Math.cos(a) * 0.048, Math.sin(a) * 0.048);
    spin.add(n);
  }
  const cap = new THREE.CylinderGeometry(0.028, 0.028, 0.02, 20);
  cap.rotateZ(Math.PI / 2);
  const capM = mesh(cap, new THREE.MeshStandardMaterial({ color: caliperColor, metalness: 0.5, roughness: 0.3 }), false);
  capM.position.x = w * 0.39;
  spin.add(capM);
  // disco de freio ventilado com "chapéu"
  const disc = new THREE.CylinderGeometry(rimR * 0.86, rimR * 0.86, 0.03, 40);
  disc.rotateZ(Math.PI / 2);
  const discM = mesh(disc, M.disc, false);
  discM.position.x = w * 0.08;
  spin.add(discM);
  const hat = new THREE.CylinderGeometry(rimR * 0.42, rimR * 0.42, 0.07, 24);
  hat.rotateZ(Math.PI / 2);
  const hatM = mesh(hat, M.darkMetal, false);
  hatM.position.x = w * 0.16;
  spin.add(hatM);
  // pinça (não gira)
  const calGeo = new THREE.BoxGeometry(0.075, 0.1, 0.2);
  const cal = mesh(calGeo, new THREE.MeshStandardMaterial({ color: caliperColor, metalness: 0.3, roughness: 0.35 }), false);
  const ca = 2.3;
  cal.position.set(w * 0.11, Math.cos(ca) * rimR * 0.72, Math.sin(ca) * rimR * 0.72);
  cal.rotation.x = -ca;
  mirror.add(cal);
  return { pivot, mirror, spin };
}

// Mescla malhas sem animação que compartilham material em uma só geometria.
function mergeStatic(root, keep) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const buckets = new Map();
  const remove = [];
  root.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material)) return;
    for (let p = o; p && p !== root; p = p.parent) if (keep.has(p)) return;
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(m);
    if (m.determinant() < 0) {
      for (const name of Object.keys(g.attributes)) {
        const a = g.attributes[name];
        for (let t = 0; t < a.count; t += 3)
          for (let c = 0; c < a.itemSize; c++) {
            const v = a.array[(t + 1) * a.itemSize + c];
            a.array[(t + 1) * a.itemSize + c] = a.array[(t + 2) * a.itemSize + c];
            a.array[(t + 2) * a.itemSize + c] = v;
          }
      }
    }
    const key = o.material.uuid + (o.castShadow ? 's' : 'n');
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, cast: o.castShadow, list: [] });
    buckets.get(key).list.push(g);
    remove.push(o);
  });
  for (const o of remove) {
    o.removeFromParent();
    o.geometry.dispose();
  }
  for (const { mat, cast, list } of buckets.values()) {
    let n = 0;
    for (const g of list) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3);
    const nor = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    const col = mat.vertexColors ? new Float32Array(n * 3).fill(1) : null;
    let off = 0;
    for (const g of list) {
      const c = g.attributes.position.count;
      pos.set(g.attributes.position.array, off * 3);
      if (g.attributes.normal) nor.set(g.attributes.normal.array, off * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, off * 2);
      if (col && g.attributes.color) col.set(g.attributes.color.array, off * 3);
      off += c;
      g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = cast;
    root.add(mesh);
  }
}

// ------------------------------------------------------------------- carro
export function buildCar(model, colorDef, number = 7, variant = 0) {
  const M = shared();
  const S = new CarShape(model);
  const root = new THREE.Group();
  const spec = {
    color: colorDef.color,
    stripeColor: colorDef.stripe,
    sponsorColor: colorDef.sponsor,
    stripes: model.stripes,
    sideStripe: model.sideStripe,
    doorLines: model.doorLines,
    hoodLine: model.hoodLine,
    numberU: model.numberU,
    number,
  };
  const livery = TX.liveryTexture(spec);
  const paint = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: livery,
    vertexColors: true,
    metalness: 0.55,
    roughness: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1.2,
  });
  const paintPlain = new THREE.MeshPhysicalMaterial({
    color: colorDef.color,
    metalness: 0.55,
    roughness: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
  });

  // ---- carroceria
  const NU = 120;
  const MR = 72;
  const body = loftGeometry(
    NU,
    MR,
    (i, j, v) => {
      const u = i / NU;
      const th = -Math.PI / 2 + (j / MR) * Math.PI * 2;
      const c = S.sec(u);
      const ex = sgnPow(Math.cos(th), 2 / c.n);
      const ey = sgnPow(Math.sin(th), 2 / c.n);
      S.point(u, ex, ey, v);
      let shade = 1;
      // caixas de roda: a parte de baixo das laterais sobe até o arco
      const ay = S.arch(v.z, c.yt);
      if (Math.abs(ex) > 0.6 && ey < 0.55 && v.y < ay) {
        v.y = ay;
        const outer = Math.abs(ex) > 0.8;
        v.x = Math.sign(v.x) * Math.min(Math.abs(v.x), c.hw * (outer ? 1 : 0.86));
        if (!outer && ey < 0.2) shade = 0.07;
      }
      if (ey < -0.75) shade = Math.min(shade, 0.15);
      return { uv: [u, j / MR], shade };
    },
    () => 0,
    1,
  );
  const bodyMesh = mesh(body, paint);
  root.add(bodyMesh);
  // tampas das pontas
  const ringAt = (u) => {
    const r = [];
    for (let j = 0; j <= MR; j++) {
      const th = -Math.PI / 2 + (j / MR) * Math.PI * 2;
      const c = S.sec(u);
      const p = new THREE.Vector3();
      S.point(u, sgnPow(Math.cos(th), 2 / c.n), sgnPow(Math.sin(th), 2 / c.n), p);
      r.push(p);
    }
    return r;
  };
  root.add(mesh(capGeometry(ringAt(0), new THREE.Vector3(0, 0, 1)), paintPlain));
  root.add(mesh(capGeometry(ringAt(1), new THREE.Vector3(0, 0, -1)), paintPlain));

  // ---- cabine (vidros + colunas + teto)
  const cab = model.cab;
  const NT = 60;
  const MC = 64;
  const exyCab = (j, n) => {
    const th = -Math.PI / 2 + (j / MC) * Math.PI * 2;
    return [sgnPow(Math.cos(th), 2 / n), sgnPow(Math.sin(th), 2 / n)];
  };
  const cabGeo = loftGeometry(
    NT,
    MC,
    (i, j, v) => {
      const t = i / NT;
      const [ex, ey] = exyCab(j, cab.n);
      S.cabPoint(t, ex, ey, v);
      return { uv: [S.cabU(t), j / MC], shade: 1 };
    },
    (i, j) => {
      const t = (i + 0.5) / NT;
      const [ex, ey] = exyCab(j + 0.5, cab.n);
      if (ey < -0.2) return 2; // parte escondida/borda inferior
      const sideZone = Math.abs(ex) > 0.78;
      if (!sideZone) {
        // para-brisa e vidro traseiro
        if (t > 0.03 && t < cab.tW - 0.02 && Math.abs(ex) < 0.72) return 1;
        if (t > cab.tR + 0.03 && t < 0.95 && Math.abs(ex) < 0.66) return 1;
        return 0;
      }
      // janelas laterais com coluna B
      const bPillar = t > 0.52 * cab.tR + 0.2 && t < 0.52 * cab.tR + 0.25;
      if (t > 0.06 && t < cab.tR + 0.12 && ey < 0.72 && ey > 0.05 && !bPillar) return 1;
      return 0;
    },
    3,
  );
  const cabMesh = mesh(cabGeo, [paint, M.glass, M.gloss]);
  root.add(cabMesh);

  // ---- rodas
  const rimColor = RIM_COLORS[variant % RIM_COLORS.length];
  const calColor = CALIPER_COLORS[(variant + 1) % CALIPER_COLORS.length];
  const wheels = [];
  for (const front of [true, false])
    for (const sgn of [1, -1]) {
      const w = buildWheel(model, rimColor, calColor, M);
      w.mirror.scale.x = sgn;
      w.pivot.position.set(sgn * model.trackHalf, model.wheelR, front ? S.zF : S.zR);
      root.add(w.pivot);
      wheels.push({ ...w, front, side: sgn, baseY: model.wheelR });
    }
  // forro escuro das caixas de roda
  const linerGeo = new THREE.CylinderGeometry(model.wheelR + 0.04, model.wheelR + 0.04, 0.3, 24, 1, true, 0, Math.PI);
  linerGeo.rotateZ(Math.PI / 2);
  for (const zw of [S.zF, S.zR])
    for (const sgn of [1, -1]) {
      const l = mesh(linerGeo, new THREE.MeshStandardMaterial({ color: 0x0a0a0b, roughness: 1, side: THREE.DoubleSide }), false);
      l.position.set(sgn * (model.trackHalf - 0.12), model.wheelR + 0.01, zw);
      root.add(l);
    }

  // ---- faróis
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4dc, emissiveIntensity: 1.2 });
  const drlMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xdff0ff, emissiveIntensity: 2.2 });
  const s0 = S.sec(0.04);
  for (const sgn of [1, -1]) {
    const g = new THREE.Group();
    const hx = sgn * s0.hw * 0.62;
    const hy = s0.ym + s0.hh * (model.headlights === 'round' ? 0.15 : 0.32);
    const hz = S.frontZ(hx, hy);
    g.position.set(hx, hy, hz - 0.03);
    g.rotation.y = sgn * 0.35;
    if (model.headlights === 'round') {
      for (const k of [0, 1]) {
        const ring = mesh(new THREE.TorusGeometry(0.085, 0.014, 10, 28), M.chrome, false);
        ring.position.set(sgn * (k ? -0.11 : 0.1), 0, 0.03);
        g.add(ring);
        const refl = mesh(new THREE.SphereGeometry(0.085, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.reflector, false);
        refl.rotation.x = -Math.PI / 2;
        refl.position.copy(ring.position).setZ(0.0);
        refl.scale.set(1, 0.5, 1);
        g.add(refl);
        const bulb = mesh(new THREE.SphereGeometry(0.035, 12, 8), headMat, false);
        bulb.position.copy(ring.position).setZ(0.03);
        g.add(bulb);
        const lens = mesh(new THREE.SphereGeometry(0.085, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.lens, false);
        lens.rotation.x = Math.PI / 2;
        lens.position.copy(ring.position).setZ(0.03);
        lens.scale.set(1, 0.35, 1);
        g.add(lens);
      }
      const housing = mesh(new THREE.BoxGeometry(0.46, 0.2, 0.06), M.blackPlastic, false);
      housing.position.set(0, 0, -0.01);
      g.add(housing);
    } else {
      const housing = mesh(new THREE.SphereGeometry(0.5, 24, 12), M.gloss, false);
      housing.scale.set(0.27, 0.075, 0.12);
      g.add(housing);
      for (const k of [-1, 1]) {
        const refl = mesh(new THREE.SphereGeometry(0.045, 14, 10), M.reflector, false);
        refl.position.set(k * 0.06, 0.0, 0.03);
        refl.scale.z = 0.5;
        g.add(refl);
        const bulb = mesh(new THREE.SphereGeometry(0.024, 12, 8), headMat, false);
        bulb.position.set(k * 0.06, 0.0, 0.05);
        g.add(bulb);
      }
      const drl = mesh(new THREE.BoxGeometry(0.22, 0.012, 0.012), drlMat, false);
      drl.position.set(0, -0.026, 0.055);
      g.add(drl);
      const drl2 = mesh(new THREE.BoxGeometry(0.012, 0.04, 0.012), drlMat, false);
      drl2.position.set(-sgn * 0.11, -0.008, 0.05);
      g.add(drl2);
      const lens = mesh(new THREE.SphereGeometry(0.5, 24, 12), M.lens, false);
      lens.scale.set(0.28, 0.085, 0.14);
      lens.position.z = 0.01;
      g.add(lens);
    }
    root.add(g);
  }

  // ---- grade, entradas de ar e splitter
  const gy = s0.ym - s0.hh * 0.25;
  const gz = S.frontZ(0, gy);
  const grille = mesh(new THREE.BoxGeometry(model.headlights === 'round' ? 0.95 : 0.7, model.headlights === 'round' ? 0.16 : 0.13, 0.08), M.grille, false);
  grille.position.set(0, model.headlights === 'round' ? s0.ym + s0.hh * 0.15 : gy, (model.headlights === 'round' ? S.frontZ(0, s0.ym + s0.hh * 0.15) : gz) - 0.03);
  root.add(grille);
  for (const sgn of [1, -1]) {
    const iy = s0.ym - s0.hh * 0.45;
    const ix = sgn * s0.hw * 0.62;
    const intake = mesh(new THREE.BoxGeometry(0.28, 0.09, 0.08), M.grille, false);
    intake.position.set(ix, iy, S.frontZ(ix, iy) - 0.035);
    intake.rotation.y = sgn * 0.3;
    root.add(intake);
  }
  const sp = S.sec(0.02);
  const spY = S.sec(0.06).yb;
  const splitter = mesh(new THREE.BoxGeometry(S.sec(0.06).hw * 1.7, 0.018, 0.24), M.blackPlastic);
  splitter.position.set(0, spY + 0.004, S.frontZ(0, spY + 0.06) - 0.14);
  root.add(splitter);
  if (model.headlights === 'round') {
    // para-choque cromado do muscle car
    const bump = mesh(new THREE.BoxGeometry(sp.hw * 1.9, 0.05, 0.06), M.chrome, false);
    bump.position.set(0, s0.ym - s0.hh * 0.62, S.frontZ(0, s0.ym - s0.hh * 0.62) - 0.01);
    root.add(bump);
  }

  // ---- saias laterais, aberturas e maçanetas
  const uMid = (model.frontU + model.rearU) / 2;
  const skirtLen = S.zF - S.zR - 2 * (model.wheelR + 0.12);
  const sMid = S.sec(uMid);
  for (const sgn of [1, -1]) {
    const skirt = mesh(new THREE.BoxGeometry(0.06, 0.06, skirtLen), M.carbon);
    skirt.position.set(sgn * (S.sideX(uMid, sMid.yb + 0.08) - 0.005), sMid.yb + 0.04, (S.zF + S.zR) / 2);
    root.add(skirt);
    // abertura atrás da roda dianteira
    const vu = model.frontU + (model.wheelR + 0.22) / model.length;
    const vy = S.sec(vu).ym + 0.03;
    const vent = mesh(new THREE.BoxGeometry(0.03, 0.12, 0.2), M.grille, false);
    vent.position.set(sgn * (S.sideX(vu, vy) - 0.008), vy, S.z(vu));
    root.add(vent);
    // maçaneta
    const hu = model.doorLines[1] - 0.04;
    const hy = S.cabSec((hu - cab.s) / (cab.e - cab.s)).belt - 0.07;
    const handle = mesh(new THREE.BoxGeometry(0.03, 0.025, 0.14), M.chrome, false);
    handle.position.set(sgn * (S.sideX(hu, hy) + 0.006), hy, S.z(hu));
    root.add(handle);
  }
  // tampa do tanque
  {
    const fu = model.rearU - (model.wheelR + 0.2) / model.length;
    const fy = S.cabSec(Math.min(0.98, (fu - cab.s) / (cab.e - cab.s))).belt - 0.12;
    const fuel = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 20), M.chrome, false);
    fuel.rotation.z = Math.PI / 2;
    fuel.position.set(S.sideX(fu, fy) + 0.005, fy, S.z(fu));
    root.add(fuel);
  }

  // ---- retrovisores
  {
    const t = 0.12;
    const mu = S.cabU(t);
    const cs = S.cabSec(t);
    const my = cs.belt + 0.07;
    for (const sgn of [1, -1]) {
      const x0 = S.sideX(mu, cs.belt - 0.02) - 0.02;
      const stalk = mesh(new THREE.BoxGeometry(0.16, 0.025, 0.05), M.blackPlastic, false);
      stalk.position.set(sgn * (x0 + 0.08), my - 0.03, S.z(mu));
      root.add(stalk);
      const house = mesh(new THREE.SphereGeometry(0.5, 20, 12), paintPlain);
      house.scale.set(0.2, 0.11, 0.13);
      house.position.set(sgn * (x0 + 0.17), my, S.z(mu) + 0.01);
      root.add(house);
      const glass = mesh(new THREE.CircleGeometry(0.5, 20), M.mirror, false);
      glass.scale.set(0.17, 0.085, 1);
      glass.rotation.y = Math.PI;
      glass.position.set(sgn * (x0 + 0.17), my, S.z(mu) - 0.055);
      root.add(glass);
    }
  }

  // ---- limpadores de para-brisa
  {
    const t0 = 0.04;
    const t1 = cab.tW;
    const p0 = new THREE.Vector3();
    const p1 = new THREE.Vector3();
    S.cabPoint(t0, 0, 1, p0);
    S.cabPoint(t1, 0, 1, p1);
    const slope = Math.atan2(p1.y - p0.y, p0.z - p1.z);
    for (const x of [0.28, -0.22]) {
      const wiper = mesh(new THREE.BoxGeometry(0.55, 0.012, 0.02), M.blackPlastic, false);
      wiper.position.set(x, p0.y + 0.03, p0.z - 0.03);
      wiper.rotation.x = -slope;
      wiper.rotation.y = 0.12;
      root.add(wiper);
    }
  }

  // ---- capô: aberturas / tomada de ar
  if (model.hoodVents) {
    for (const sgn of [1, -1]) {
      const u = model.frontU + 0.03;
      const x = sgn * 0.42;
      const v = mesh(new THREE.BoxGeometry(0.3, 0.02, 0.26), M.grille, false);
      v.position.set(x, S.topY(u, x) - 0.002, S.z(u));
      v.rotation.x = -0.12;
      v.rotation.z = -sgn * 0.12;
      root.add(v);
    }
  }
  if (model.scoop) {
    const u = 0.22;
    const y = S.topY(u, 0);
    const slope = Math.atan2(S.topY(u + 0.05, 0) - S.topY(u - 0.05, 0), 0.1 * model.length);
    const scoopG = new THREE.Group();
    const sGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 4, 1);
    sGeo.rotateY(Math.PI / 4);
    sGeo.rotateX(Math.PI / 2);
    const scoop = mesh(sGeo, paintPlain);
    scoop.scale.set(0.82, 0.13, 0.85);
    scoopG.add(scoop);
    const mouth = mesh(new THREE.BoxGeometry(0.5, 0.06, 0.02), M.grille, false);
    mouth.position.set(0, 0.0, 0.43);
    scoopG.add(mouth);
    scoopG.position.set(0, y + 0.02, S.z(u));
    scoopG.rotation.x = slope;
    root.add(scoopG);
  }
  if (model.louvers) {
    for (let k = 0; k < 6; k++) {
      const u = model.cab.e + 0.015 + k * 0.022;
      const y = S.topY(u, 0);
      const l = mesh(new THREE.BoxGeometry(0.8, 0.015, 0.045), M.gloss, false);
      l.position.set(0, y - 0.004, S.z(u));
      l.rotation.x = -0.25;
      root.add(l);
    }
  }
  if (model.antenna) {
    const u = model.cab.e - 0.02;
    const ant = mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.6, 6), M.blackPlastic, false);
    ant.position.set(-0.55, S.topY(u, -0.55) + 0.3, S.z(u));
    ant.rotation.x = -0.25;
    root.add(ant);
  }

  // ---- lanternas
  const brakeMat = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff1010, emissiveIntensity: 0.6 });
  const revMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xffffff, emissiveIntensity: 0 });
  const s1 = S.sec(0.975);
  const ty = s1.ym + s1.hh * 0.42;
  if (model.taillights === 'bar') {
    const bar = mesh(new THREE.BoxGeometry(s1.hw * 1.7, 0.035, 0.04), brakeMat, false);
    bar.position.set(0, ty, S.rearZ(0, ty) + 0.012);
    root.add(bar);
  }
  for (const sgn of [1, -1]) {
    const tx = sgn * s1.hw * (model.taillights === 'wide' ? 0.5 : 0.66);
    const tz = S.rearZ(tx, ty);
    const g = new THREE.Group();
    g.position.set(tx, ty, tz + 0.01);
    g.rotation.y = -sgn * 0.3;
    if (model.taillights === 'wide') {
      const housing = mesh(new THREE.BoxGeometry(0.62, 0.15, 0.04), M.chrome, false);
      g.add(housing);
      const lamp = mesh(new THREE.BoxGeometry(0.58, 0.12, 0.03), brakeMat, false);
      lamp.position.z = -0.008;
      g.add(lamp);
      for (let k = 0; k < 3; k++) {
        const div = mesh(new THREE.BoxGeometry(0.01, 0.12, 0.02), M.chrome, false);
        div.position.set(-0.15 + k * 0.15, 0, -0.012);
        g.add(div);
      }
      g.rotation.y = 0;
      g.position.z = S.rearZ(tx, ty) + 0.02;
    } else {
      const housing = mesh(new THREE.SphereGeometry(0.5, 24, 12), M.gloss, false);
      housing.scale.set(0.3, 0.07, 0.08);
      g.add(housing);
      const lamp = mesh(new THREE.SphereGeometry(0.5, 24, 12), brakeMat, false);
      lamp.scale.set(0.27, 0.045, 0.085);
      g.add(lamp);
      for (const k of [-1, 1]) {
        const ring = mesh(new THREE.TorusGeometry(0.03, 0.006, 8, 20), brakeMat, false);
        ring.rotation.y = Math.PI;
        ring.position.set(k * 0.07, 0, -0.04);
        g.add(ring);
      }
    }
    root.add(g);
    // luz de ré
    const rev = mesh(new THREE.BoxGeometry(0.08, 0.035, 0.02), revMat, false);
    const ry = s1.ym - s1.hh * 0.25;
    rev.position.set(sgn * s1.hw * 0.5, ry, S.rearZ(sgn * s1.hw * 0.5, ry) - 0.002);
    root.add(rev);
  }

  // ---- difusor, escapamentos e placa
  {
    const sr = S.sec(0.96);
    const dif = new THREE.Group();
    const plate = mesh(new THREE.BoxGeometry(sr.hw * 1.6, 0.03, 0.42), M.carbon);
    plate.rotation.x = -0.18;
    dif.add(plate);
    for (let k = -2; k <= 2; k++) {
      const fin = mesh(new THREE.BoxGeometry(0.015, 0.12, 0.4), M.carbon);
      fin.position.set(k * sr.hw * 0.3, 0.05, -0.02);
      fin.rotation.x = -0.18;
      dif.add(fin);
    }
    dif.position.set(0, sr.yb + 0.02, S.z(1) + 0.26);
    root.add(dif);

    const exGeo = new THREE.CylinderGeometry(0.045, 0.05, 0.2, 20, 1, true);
    exGeo.rotateX(Math.PI / 2);
    const exInGeo = new THREE.CircleGeometry(0.04, 16);
    const exY = sr.yb + 0.09;
    let exX = [];
    if (model.exhaust === 'center2') exX = [-0.08, 0.08];
    else if (model.exhaust === 'center4') exX = [-0.2, -0.08, 0.08, 0.2];
    else exX = [-sr.hw * 0.62, -sr.hw * 0.48, sr.hw * 0.48, sr.hw * 0.62];
    for (const x of exX) {
      const e = mesh(exGeo, new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 1, roughness: 0.15, side: THREE.DoubleSide }), false);
      e.position.set(x, exY, S.z(1) + 0.02);
      root.add(e);
      const inn = mesh(exInGeo, M.exhaustIn, false);
      inn.rotation.y = Math.PI;
      inn.position.set(x, exY, S.z(1) + 0.08);
      root.add(inn);
    }
    const plateMat = new THREE.MeshStandardMaterial({ map: TX.plateTexture('CRD' + String(number).padStart(1, '0') + 'A' + (10 + number)), roughness: 0.5 });
    const py = S.sec(0.98).ym - 0.02;
    const pl = mesh(new THREE.PlaneGeometry(0.42, 0.13), plateMat, false);
    pl.rotation.y = Math.PI;
    pl.position.set(0, py, S.rearZ(0, py) - 0.012);
    root.add(pl);
  }

  // ---- asa / spoiler
  if (model.wing) {
    const u = 0.93;
    const yDeck = S.topY(u, 0.5);
    const wingG = new THREE.Group();
    const af = new THREE.Shape();
    af.moveTo(0.18, 0);
    af.bezierCurveTo(0.12, 0.05, -0.05, 0.06, -0.2, 0.02);
    af.lineTo(-0.21, 0.0);
    af.bezierCurveTo(-0.05, 0.02, 0.1, 0.0, 0.18, 0);
    const wGeo = new THREE.ExtrudeGeometry(af, { depth: 1.72, bevelEnabled: false });
    wGeo.translate(0, 0, -0.86);
    wGeo.rotateY(Math.PI / 2);
    const wm = mesh(wGeo, M.carbon);
    wm.rotation.x = 0.1;
    wingG.add(wm);
    for (const sgn of [1, -1]) {
      const ep = mesh(new THREE.BoxGeometry(0.012, 0.18, 0.42), M.carbon);
      ep.position.set(sgn * 0.87, 0.02, 0);
      wingG.add(ep);
      const strut = mesh(new THREE.BoxGeometry(0.02, 0.34, 0.1), M.blackPlastic);
      strut.position.set(sgn * 0.42, -0.17, 0.02);
      strut.rotation.x = 0.2;
      wingG.add(strut);
    }
    // terceira luz de freio
    const third = mesh(new THREE.BoxGeometry(0.4, 0.018, 0.02), brakeMat, false);
    third.position.set(0, -0.01, -0.21);
    wingG.add(third);
    wingG.position.set(0, yDeck + 0.32, S.z(u) - 0.05);
    root.add(wingG);
  }
  if (model.ducktail) {
    const u = 0.965;
    const d = mesh(new THREE.BoxGeometry(S.sec(u).hw * 1.6, 0.025, 0.13), M.carbon);
    d.position.set(0, S.topY(u, 0) + 0.01, S.z(u) - 0.03);
    d.rotation.x = 0.25;
    root.add(d);
  }
  if (model.lip) {
    const u = 0.975;
    const d = mesh(new THREE.BoxGeometry(S.sec(u).hw * 1.7, 0.025, 0.14), M.gloss);
    d.position.set(0, S.topY(u, 0) + 0.02, S.z(u));
    d.rotation.x = 0.3;
    root.add(d);
  }

  // ---- interior e piloto
  const interior = new THREE.Group();
  const roofY = cab.roof;
  const helmetY = roofY - 0.21;
  const tSeat = cab.tW + 0.18;
  const zSeat = S.z(S.cabU(Math.min(tSeat, 0.8)));
  const dX = 0.36;
  for (const sgn of [1, -1]) {
    const back = mesh(new THREE.BoxGeometry(0.46, 0.58, 0.1), M.seat, false);
    back.position.set(sgn * dX, helmetY - 0.36, zSeat - 0.18);
    back.rotation.x = -0.22;
    interior.add(back);
    const side = mesh(new THREE.BoxGeometry(0.5, 0.2, 0.08), M.seatAccent, false);
    side.position.set(sgn * dX, helmetY - 0.14, zSeat - 0.22);
    side.rotation.x = -0.22;
    interior.add(side);
    const base = mesh(new THREE.BoxGeometry(0.46, 0.1, 0.5), M.seat, false);
    base.position.set(sgn * dX, helmetY - 0.66, zSeat + 0.1);
    interior.add(base);
  }
  // piloto (lado esquerdo = +x)
  const torso = mesh(new THREE.CapsuleGeometry(0.17, 0.3, 4, 12), M.suit, false);
  torso.position.set(dX, helmetY - 0.36, zSeat - 0.06);
  torso.rotation.x = -0.22;
  interior.add(torso);
  const helmetMat = new THREE.MeshPhysicalMaterial({ color: colorDef.stripe, metalness: 0.3, roughness: 0.3, clearcoat: 1 });
  const helmet = mesh(new THREE.SphereGeometry(0.13, 24, 16), helmetMat, false);
  helmet.position.set(dX, helmetY, zSeat + 0.02);
  interior.add(helmet);
  const visor = mesh(new THREE.SphereGeometry(0.133, 24, 12, -Math.PI * 0.35, Math.PI * 0.7, Math.PI * 0.32, Math.PI * 0.25), M.visor, false);
  visor.position.copy(helmet.position);
  visor.rotation.y = Math.PI / 2 - Math.PI / 2;
  interior.add(visor);
  // painel e volante
  const tDash = Math.max(0.05, cab.tW - 0.06);
  const zDash = S.z(S.cabU(tDash));
  const dashY = S.cabSec(tDash).belt;
  const dash = mesh(new THREE.BoxGeometry(1.25, 0.12, 0.35), M.seat, false);
  dash.position.set(0, dashY - 0.02, zDash - 0.05);
  interior.add(dash);
  const cluster = mesh(new THREE.PlaneGeometry(0.22, 0.08), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x3aa0ff, emissiveIntensity: 0.6 }), false);
  cluster.position.set(dX, dashY + 0.045, zDash - 0.2);
  cluster.rotation.x = -0.5;
  cluster.rotation.y = Math.PI;
  interior.add(cluster);
  const wheelG = new THREE.Group();
  const sw = mesh(new THREE.TorusGeometry(0.15, 0.022, 10, 28), M.seat, false);
  wheelG.add(sw);
  const swBar = mesh(new THREE.BoxGeometry(0.28, 0.03, 0.02), M.darkMetal, false);
  wheelG.add(swBar);
  const swTop = mesh(new THREE.BoxGeometry(0.03, 0.02, 0.025), new THREE.MeshStandardMaterial({ color: 0xff8800 }), false);
  swTop.position.y = 0.15;
  wheelG.add(swTop);
  const zWheel = (zDash + zSeat) / 2 + 0.02;
  wheelG.position.set(dX, helmetY - 0.3, zWheel);
  wheelG.rotation.x = -0.45;
  interior.add(wheelG);
  // braços
  for (const k of [-1, 1]) {
    const arm = mesh(new THREE.CapsuleGeometry(0.045, 0.32, 4, 8), M.suit, false);
    const sh = new THREE.Vector3(dX + k * 0.17, helmetY - 0.22, zSeat - 0.04);
    const hd = new THREE.Vector3(dX + k * 0.14, helmetY - 0.3, zWheel - 0.02);
    arm.position.copy(sh).add(hd).multiplyScalar(0.5);
    arm.lookAt(hd);
    arm.rotateX(Math.PI / 2);
    interior.add(arm);
  }
  // gaiola de proteção (só no GT)
  if (model.wing) {
    const barMat = M.darkMetal;
    const zb = zSeat - 0.38;
    const hoop = mesh(new THREE.TorusGeometry(0.55, 0.022, 8, 24, Math.PI), barMat, false);
    hoop.scale.y = 0.55;
    hoop.position.set(0, roofY - 0.38, zb);
    interior.add(hoop);
  }
  root.add(interior);

  // ---- fundo (assoalho)
  const floor = mesh(new THREE.BoxGeometry(1.6, 0.03, model.length * 0.8), M.blackPlastic, false);
  floor.position.set(0, S.sec(0.5).yb + 0.03, 0);
  root.add(floor);

  // junta as peças estáticas por material (menos chamadas de desenho)
  const keep = new Set([wheelG, helmet, visor, ...wheels.map((w) => w.pivot)]);
  mergeStatic(root, keep);
  for (const w of wheels) mergeStatic(w.spin, new Set());
  root.traverse((o) => {
    if (o.isMesh && o.material && o.material.transparent) o.renderOrder = 2;
  });

  return {
    root,
    wheels,
    steeringWheel: wheelG,
    driverHead: [helmet, visor],
    views: {
      cockpit: new THREE.Vector3(dX, helmetY - 0.03, zSeat + 0.02),
      hood: new THREE.Vector3(0, S.cabSec(0.02).belt + 0.32, S.z(S.cabU(0)) - 0.1),
    },
    brakeMat,
    revMat,
    headMat,
    paint,
    shape: S,
    dims: { length: model.length, halfWidth: Math.max(...model.hw.map((k) => k[1])), height: cab.roof },
  };
}
