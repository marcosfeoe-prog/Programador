// Alvorada H2 — hipercarro-protótipo a hidrogênio, no estilo dos protótipos de Le Mans.
// Módulo próprio: forma da carroceria (seções + bodyMod) e detalhes em decorate(ctx).
// Coordenadas do modelo: +z frente, +y cima, +x esquerda; chão em y = 0.
// ctx: ver buildCar() em ../carModel.js (onFront/onRear/onTop/onSide, plateGeo,
// part(), materiais M, paint/paintPlain, etc.).
//
// Volumes principais (como na foto de referência):
//  - bico central baixo e pontudo em "V"; pontões altos e redondos sobre as rodas
//    dianteiras; entre eles e o cockpit, um "poço" escuro com a mecânica à mostra;
//  - cockpit-bolha estreito em gota, vidro fumê, snorkel no teto e espinha dorsal;
//  - lateral com canal côncavo profundo e grande entrada de ar antes da roda traseira;
//  - para-lamas traseiros altos e asa translúcida de largura total.

// ------------------------------------------------------------ utilidades
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const sstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;
// janela suave: 1 entre a e b, com rampas de largura f
const win = (a, b, f, x) => sstep(a - f, a, x) * (1 - sstep(b, b + f, x));
// Catmull-Rom entre chaves [u, valor] (cópia local do kf do motor: a forma usa antes do ctx)
function key(arr, u) {
  if (typeof arr === 'number') return arr;
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
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t2 * t);
}

// índices da meia seção (mesma ordem de CarShape.halfPath)
const I_SIDE0 = 9; // primeiro ponto da lateral
const I_SH0 = 23; // primeiro ponto do ombro
const I_TOP0 = 30; // primeiro ponto do topo

// ------------------------------------------------------------ forma
// início do flanco interno dos pontões (fração de x0): 0 = topo todo abaulado
const POD_T0 = [[0, 0.0], [0.05, 0.18], [0.1, 0.5], [0.17, 0.56], [0.3, 0.56], [0.45, 0.6], [0.62, 0.56], [0.8, 0.6], [0.95, 0.58], [1, 0.45]];
// entradas laterais esculpidas (afundam a lateral; também escurecem a pintura e
// recebem um forro fosco). y0/y1 podem ser chaves [u, y] (bocas em cunha).
const SCOOPS = [
  // canal côncavo que nasce atrás da roda dianteira e corre pela lateral
  { u0: 0.255, u1: 0.64, y0: 0.24, y1: 0.6, depth: 0.15, fu: 0.07, fy: 0.1, shade: 0.35 },
  // grande entrada de ar antes da roda traseira: cunha estreita na frente, alta atrás
  { u0: 0.49, u1: 0.688, y0: [[0.49, 0.5], [0.688, 0.4]], y1: [[0.49, 0.66], [0.688, 0.95]], depth: 0.2, fu: 0.07, fy: 0.12, shade: 0.95, liner: 0.25 },
  // saída de ar vertical logo atrás da caixa de roda dianteira
  { u0: 0.25, u1: 0.305, y0: 0.14, y1: [[0.25, 0.68], [0.305, 0.6]], depth: 0.1, fu: 0.02, fy: 0.05, shade: 0.6, liner: 0.55 },
];
// intensidade (0..1) de uma entrada no ponto (u, y); ys1 = topo da lateral
const scoopK = (sc, u, y, ys1 = 9) => {
  const y1 = Math.min(key(sc.y1, u), ys1);
  return sstep(sc.u0, sc.u0 + sc.fu, u) * (1 - sstep(sc.u1 - sc.fu, sc.u1, u)) * sstep(key(sc.y0, u), key(sc.y0, u) + sc.fy, y) * (1 - sstep(y1 - sc.fy, y1, y));
};

// parâmetros derivados da seção (iguais aos de CarShape.halfPath)
function secInfo(c) {
  const rs = Math.max(0.03, Math.min(c.rs, (c.yf - c.yb - c.rb) * 0.42, (c.hw - c.tumble) * 0.4));
  const xt = c.hw - c.tumble;
  const x0 = Math.max(0.04, xt - rs);
  return { rs, xt, x0, ys1: c.yf - rs, ys0: c.yb + c.rb };
}

// recuo escuro da frente (abaixo da barra de LED, acima do lábio inferior); uEnd é
// onde ele termina: a forma recua só antes da caixa de roda, a pintura escura vai até ela
const frontRecess = (u, y, c, ys1, uEnd = 0.085) =>
  sstep(0.004, 0.03, u) * (1 - sstep(uEnd - 0.03, uEnd, u)) * sstep(c.yb + 0.08, c.yb + 0.12, y) * (1 - sstep(ys1 - 0.05, ys1 - 0.005, y));

function bodyMod(u, p, c) {
  const { xt, x0, ys1 } = secInfo(c);
  if (p.seg === 3) {
    // ombro em quarto de elipse: o pontão fica redondo, sem crista
    const t = Math.sqrt(clamp01((xt - p.x) / Math.max(1e-6, xt - x0)));
    const th = (t * Math.PI) / 2;
    p.x = x0 + (xt - x0) * Math.cos(th);
    p.y = ys1 + (c.yf - ys1) * Math.sin(th);
  } else if (p.seg === 4) {
    // topo: fundo (centro / poço) plano e flanco do pontão em "S" até o alto
    const t = clamp01(p.x / x0);
    const t0 = key(POD_T0, u);
    const s = clamp01((t - t0) / (1 - t0));
    const w = s * s * (3 - 2 * s);
    p.y = c.yt + (c.yf - c.yt) * w;
  } else if (p.seg === 2) {
    // entradas laterais esculpidas
    for (const sc of SCOOPS) p.x -= sc.depth * scoopK(sc, u, p.y, ys1);
    // frente: recuo escuro sob a barra de LED (o lábio inferior fica para fora)
    p.x -= 0.065 * frontRecess(u, p.y, c, ys1);
    // traseira: leve recuo do painel das lanternas
    p.x -= 0.04 * sstep(0.955, 0.99, u) * sstep(c.yb + 0.1, c.yb + 0.16, p.y) * (1 - sstep(ys1 - 0.08, ys1 - 0.02, p.y));
  }
}

// ------------------------------------------------------------ texturas próprias
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

// pontilhado prata/cinza das lâminas das calotas
let DOT_TEX = null;
function dotTexture(THREE, TX) {
  if (DOT_TEX) return DOT_TEX;
  const [c, g] = makeCanvas(256, 256);
  g.fillStyle = '#aeb4bf';
  g.fillRect(0, 0, 256, 256);
  const rand = TX.rng(77);
  for (let i = 0; i < 5200; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const r = 0.7 + rand() * 1.5;
    const l = rand();
    g.fillStyle = l < 0.55 ? `rgba(52,58,72,${0.35 + rand() * 0.4})` : `rgba(240,244,250,${0.35 + rand() * 0.5})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  DOT_TEX = new THREE.CanvasTexture(c);
  DOT_TEX.colorSpace = THREE.SRGBColorSpace;
  DOT_TEX.wrapS = DOT_TEX.wrapT = THREE.RepeatWrapping;
  DOT_TEX.repeat.set(7, 7);
  DOT_TEX.anisotropy = 8;
  return DOT_TEX;
}

// texto claro sobre fundo transparente (asa, espinha, splitter)
function textTexture(THREE, txt, opts = {}) {
  const w = opts.w || 1024;
  const h = opts.h || 128;
  const [c, g] = makeCanvas(w, h);
  if (opts.bg) {
    g.fillStyle = opts.bg;
    g.fillRect(0, 0, w, h);
  }
  g.fillStyle = opts.color || '#ffffff';
  g.font = `${opts.weight || 'bold'} ${opts.size || 80}px Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (opts.spacing) g.letterSpacing = opts.spacing + 'px';
  if (opts.stroke) {
    g.lineWidth = opts.stroke;
    g.strokeStyle = opts.color || '#ffffff';
    g.strokeText(txt, w / 2, h / 2 + 2);
  } else g.fillText(txt, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// malha a partir de anéis de pontos (mesmo número de pontos por anel); a face fica
// para o lado de (anel seguinte − anel) × (ponto seguinte − ponto); flip inverte
function ringsGeometry(THREE, rings, closed = false, flip = false) {
  const n = rings.length;
  const m = rings[0].length;
  const pos = [];
  const uv = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++) {
      const p = rings[i][j];
      pos.push(p.x, p.y, p.z);
      uv.push(i / (n - 1), j / (m - 1));
    }
  const idx = [];
  const mm = closed ? m : m - 1;
  for (let i = 0; i < n - 1; i++)
    for (let j = 0; j < mm; j++) {
      const a = i * m + j;
      const b = i * m + ((j + 1) % m);
      const c = a + m;
      const d = b + m;
      if (flip) idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------ rodas
// calota aerodinâmica de 5 lâminas curvas ("turbina"), pontilhada
function wheelFace(w) {
  const { THREE, TX, spin, face, rimR, mesh } = w;
  const base = new THREE.MeshPhysicalMaterial({ color: 0x141a2a, metalness: 0.7, roughness: 0.35, clearcoat: 0.6, side: THREE.DoubleSide });
  const blade = new THREE.MeshStandardMaterial({ color: 0xffffff, map: dotTexture(THREE, TX), metalness: 0.55, roughness: 0.42 });
  // fundo: prato raso (cone) escuro
  const dish = new THREE.LatheGeometry(
    [new THREE.Vector2(0.001, -0.03), new THREE.Vector2(0.09, -0.028), new THREE.Vector2(rimR * 0.7, -0.012), new THREE.Vector2(rimR + 0.004, 0.0)],
    48,
  );
  dish.rotateZ(-Math.PI / 2);
  const dm = mesh(dish, base, false);
  dm.position.x = face - 0.004;
  spin.add(dm);
  // lâminas: borda de ataque curva, larga no aro e estreita no cubo
  const r0 = 0.07;
  const r1 = rimR - 0.012;
  const N = 8;
  for (let k = 0; k < 5; k++) {
    const a0 = -0.45; // construída em torno do ângulo 0 e depois girada para o lugar
    const sh = new THREE.Shape();
    const lead = [];
    const trail = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const r = r0 + (r1 - r0) * t;
      const a = a0 + 0.24 * t * t + 0.05 * t; // varredura (curva)
      const wdt = 0.5 + 0.36 * t; // largura angular
      lead.push([Math.cos(a) * r, Math.sin(a) * r]);
      trail.push([Math.cos(a + wdt) * r, Math.sin(a + wdt) * r]);
    }
    sh.moveTo(lead[0][0], lead[0][1]);
    for (let i = 1; i <= N; i++) sh.lineTo(lead[i][0], lead[i][1]);
    sh.absarc(0, 0, r1, Math.atan2(lead[N][1], lead[N][0]), Math.atan2(trail[N][1], trail[N][0]) + (Math.atan2(trail[N][1], trail[N][0]) < Math.atan2(lead[N][1], lead[N][0]) ? Math.PI * 2 : 0), false);
    for (let i = N; i >= 0; i--) sh.lineTo(trail[i][0], trail[i][1]);
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.016, bevelEnabled: false, curveSegments: 6 });
    g.rotateY(Math.PI / 2);
    // torção em volta do próprio raio: lâmina de turbina (uma borda sai, a outra afunda)
    g.rotateZ(0.2);
    const bm = mesh(g, blade, false);
    bm.position.x = face - 0.012;
    bm.rotation.x = (k / 5) * Math.PI * 2;
    spin.add(bm);
  }
  // cubo central escuro com anel
  const hub = new THREE.CylinderGeometry(0.068, 0.075, 0.03, 32);
  hub.rotateZ(Math.PI / 2);
  const hm = mesh(hub, base, false);
  hm.position.x = face + 0.002;
  spin.add(hm);
  const ring = new THREE.TorusGeometry(0.07, 0.006, 8, 32);
  ring.rotateY(Math.PI / 2);
  const rm = mesh(ring, blade, false);
  rm.position.x = face + 0.016;
  spin.add(rm);
  return true;
}

// ------------------------------------------------------------ detalhes
function decorate(ctx) {
  const { THREE, TX, S, M, paint, paintPlain, part, onRear, onTop, plateGeo, mirrorPts, mesh, root, drlMat, headMat, brakeMat, revMat, bumperG, cab, front, rear } = ctx;
  const L = S.L;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const cabTop = (t) => {
    const h = S.cabHalf(t);
    return h[h.length - 1].y;
  };

  // ---- acabamento da pintura: acetinado metálico (como a foto)
  for (const m of [paint, paintPlain]) {
    m.metalness = 0.62;
    m.roughness = 0.36;
    m.clearcoat = 0.8;
    m.clearcoatRoughness = 0.14;
  }

  // ---- pintura extra direto no canvas da pintura (posições exatas pela forma)
  const cv = paint.map.image;
  const g = cv.getContext('2d');
  const W = cv.width;
  const H = cv.height;
  const ink = (a) => (a > 0.004 ? a : 0);
  // pinta por coluna (u) cada trecho da meia seção com alpha = f(u, ponto)
  const shadeCols = (u0, u1, fn, rgb) => {
    for (let px = Math.floor(u0 * W); px < Math.ceil(u1 * W); px++) {
      const u = (px + 0.5) / W;
      const h = S.halfPath(u);
      const c = S.sec(u);
      for (let i = 0; i < h.length - 1; i++) {
        const a = ink((fn(u, h[i], c) + fn(u, h[i + 1], c)) / 2);
        if (!a) continue;
        // pixels inteiros, sem sobreposição (senão aparecem listras); o alpha varia
        // linearmente ao longo do trecho (sem degraus entre colunas)
        const a0 = fn(u, h[i], c);
        const a1 = fn(u, h[i + 1], c);
        const ya = Math.round((1 - h[i].v) * H);
        const yb = Math.round((1 - h[i + 1].v) * H);
        const n = Math.abs(yb - ya);
        // em blocos de até 3 px (alpha quase constante: um bloco só)
        const step = Math.abs(a1 - a0) < 0.02 ? n : 3;
        for (let k = 0; k < n; k += step) {
          const m = Math.min(step, n - k);
          const al = ink(a0 + ((a1 - a0) * (k + m / 2)) / n);
          if (!al) continue;
          g.fillStyle = `rgba(${rgb},${al.toFixed(3)})`;
          const y = yb > ya ? ya + k : ya - k - m;
          g.fillRect(px, y, 1, m);
          g.fillRect(px, H - y - m, 1, m);
        }
      }
    }
  };
  // poço escuro entre os pontões (frente do cockpit)
  shadeCols(0.1, 0.3, (u, p, c) => (p.seg === 4 ? 0.93 * win(0.13, 0.225, 0.02, u) * sstep(c.yt + 0.1, c.yt + 0.03, p.y) : 0), '6,8,14');
  // recuo da frente (sob a barra de LED)
  shadeCols(0, 0.15, (u, p, c) => (p.seg === 2 ? 0.94 * frontRecess(u, p.y, c, secInfo(c).ys1, 0.135) : 0), '5,7,12');
  // interior das entradas laterais
  shadeCols(0.22, 0.75, (u, p) => {
    if (p.seg !== 2) return 0;
    let a = 0;
    for (const sc of SCOOPS) a = Math.max(a, sc.shade * scoopK(sc, u, p.y, secInfo(S.sec(u)).ys1));
    return a;
  }, '4,6,12');
  // oclusão falsa: a parte baixa da lateral escurece suavemente perto do chão
  shadeCols(0, 1, (u, p, c) => (p.seg === 2 || p.seg === 1 ? 0.32 * (1 - sstep(c.yb + 0.03, c.yb + 0.24, p.y)) : 0), '2,4,12');
  // vale da traseira entre os para-lamas (sombra suave junto à espinha)
  shadeCols(0.6, 1, (u, p, c) => (p.seg === 4 ? 0.25 * win(0.66, 0.97, 0.03, u) * sstep(c.yt + 0.06, c.yt + 0.01, p.y) : 0), '0,0,10');

  // V (vertical da textura) na lateral (altura y) e no topo (distância x)
  const vSide = (u, y) => {
    const h = S.halfPath(u);
    for (let i = I_SIDE0; i < I_TOP0; i++)
      if (h[i + 1].y >= y) {
        const t = (y - h[i].y) / Math.max(1e-6, h[i + 1].y - h[i].y);
        return h[i].v + (h[i + 1].v - h[i].v) * t;
      }
    return h[I_TOP0].v;
  };
  const vTop = (u, x) => {
    const h = S.halfPath(u);
    for (let i = h.length - 1; i > I_SH0; i--)
      if (h[i - 1].x >= x) {
        const t = (x - h[i].x) / Math.max(1e-6, h[i - 1].x - h[i].x);
        return h[i].v + (h[i - 1].v - h[i].v) * t;
      }
    return h[I_SH0].v;
  };
  // texto na pintura, nos dois lados (o direito vem espelhado e girado)
  // texto claro em cores escuras e grafite em cores claras (branco, prata, amarelo)
  const base = new THREE.Color(ctx.colorDef.color);
  const light = 0.2126 * base.r + 0.7152 * base.g + 0.0722 * base.b > 0.35;
  const inkText = light ? 'rgba(20,24,34,0.9)' : 'rgba(235,240,255,0.92)';
  const paintText = (u, v, txt, px, opts = {}) => {
    for (const r of [false, true]) {
      g.save();
      g.translate(u * W, (r ? v : 1 - v) * H);
      if (r !== !!opts.flip) g.rotate(Math.PI);
      if (opts.rot) g.rotate(opts.rot * (r ? -1 : 1));
      g.fillStyle = opts.color || inkText;
      g.font = `${opts.weight || 'bold'} ${px}px Arial, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      if (opts.spacing) g.letterSpacing = opts.spacing + 'px';
      g.fillText(txt, 0, 0);
      g.restore();
    }
  };
  // lateral: "H2" grande e "ALVORADA" logo atrás da roda dianteira
  paintText(0.335, Math.min(0.285, vSide(0.335, 0.6)), 'ALVORADA', 10, { spacing: 2 });
  paintText(0.335, Math.min(0.25, vSide(0.335, 0.52)), 'H2', 24, { weight: '900' });
  // capô: "700 BAR" na borda do poço, olhando para a frente
  paintText(0.112, vTop(0.112, 0.3), '700 BAR', 8, { spacing: 2, rot: Math.PI / 2 });
  // o canvas mudou: reenvia a textura
  paint.map.needsUpdate = true;

  // ---- barra de LED na borda de ataque dos pontões (desce em "V" até o bico)
  const ledPath = (sgn) => {
    const pts = [];
    // começa na ponta do "V", no centro do bico
    const h0 = S.halfPath(0.004);
    pts.push(V3(0, (h0[I_SH0 + 2].y + h0[I_SH0 + 3].y) / 2 + 0.004, S.z(0.004) + 0.012));
    for (let k = 0; k <= 26; k++) {
      const u = 0.006 + (0.112 - 0.006) * (k / 26) ** 1.1;
      const h = S.halfPath(u);
      const a = h[I_SH0 + 2];
      const b = h[I_SH0 + 3];
      pts.push(V3(sgn * ((a.x + b.x) / 2 + 0.006), (a.y + b.y) / 2 + 0.006, S.z(u) + 0.004));
    }
    return new THREE.CatmullRomCurve3(pts);
  };
  for (const sgn of [1, -1]) {
    const hp = part(sgn > 0 ? 'farol esquerdo' : 'farol direito', 14);
    const tube = new THREE.TubeGeometry(ledPath(sgn), 64, 0.011, 6, false);
    hp.add(mesh(tube, drlMat, false));
    // moldura preta sob a barra
    const back = new THREE.TubeGeometry(ledPath(sgn), 64, 0.015, 6, false);
    const bm = mesh(back, M.gloss, false);
    bm.position.set(-sgn * 0.005, -0.009, -0.006);
    hp.add(bm);
    // cascata de "pixels" de LED sobre o pontão, rareando para trás
    const rand = TX.rng(sgn > 0 ? 913 : 517);
    const px = new THREE.BoxGeometry(0.024, 0.024, 0.008);
    for (let i = 0; i < 13; i++) {
      const uR = 0.06 + i * 0.0072;
      const h = S.halfPath(uR);
      const xEdge = (h[I_SH0 + 2].x + h[I_SH0 + 3].x) / 2;
      for (let j = 0; j < 16; j++) {
        const fade = i / 13 + j / 15;
        if (rand() < fade * fade * 1.2 + 0.04) continue;
        const u = uR + (rand() - 0.5) * 0.004;
        const x = xEdge - 0.026 - j * 0.027 - i * 0.006 + (rand() - 0.5) * 0.012;
        if (x < 0.5) break;
        const gq = onTop(u, sgn * x, 0.004);
        const q = mesh(px, rand() < 0.6 ? drlMat : headMat, false);
        const s = (1.05 - fade * 0.5) * (0.75 + rand() * 0.4);
        q.scale.set(s, s * (0.8 + rand() * 0.4), 1);
        gq.add(q);
        hp.add(gq);
      }
    }
  }

  // ---- bico: tampa da ponta em preto (contorno da seção u = 0, sem o queixo),
  // entrada vertical com filete rosa no meio
  {
    const h0 = S.halfPath(0);
    const yLip = h0[0].y + 0.07;
    const cy = (yLip + h0[h0.length - 1].y) / 2;
    const half = h0.filter((q) => q.y > yLip && q.x > 0.004).map((q) => [q.x * 0.99, cy + (q.y - cy) * 0.99]);
    const outline = [[half[0][0], yLip], ...half, ...mirrorPts(half), [-half[0][0], yLip]];
    const cap = new THREE.Group();
    cap.add(mesh(plateGeo(outline, 0.01, 0.012), M.gloss, false));
    const intake = mesh(plateGeo([[-0.045, yLip + 0.02], [0.045, yLip + 0.02], [0.03, cy + 0.06], [0, cy + 0.08], [-0.03, cy + 0.06]], 0.01, 0.01), M.exhaustIn, false);
    intake.position.z = 0.002;
    cap.add(intake);
    const fil = mesh(plateGeo([[-0.004, yLip + 0.03], [0.004, yLip + 0.03], [0.004, cy + 0.06], [-0.004, cy + 0.06]], 0.002, 0.006), M.accentPink, false);
    fil.position.z = 0.006;
    cap.add(fil);
    cap.position.z = S.z(0) + 0.002;
    bumperG.add(cap);
  }
  // emblema cromado no bico: sol nascente ("alvorada") com raios
  {
    const eg = onTop(0.042, 0, 0.002);
    const sun = new THREE.Shape();
    sun.absarc(0, 0, 0.034, 0, Math.PI, false);
    sun.lineTo(-0.034, -0.006);
    sun.lineTo(0.034, -0.006);
    sun.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, 0, 0.022, Math.PI, 0, true);
    hole.closePath();
    sun.holes.push(hole);
    const sg = new THREE.ExtrudeGeometry(sun, { depth: 0.004, bevelEnabled: false, curveSegments: 12 });
    const grp = new THREE.Group();
    grp.add(mesh(sg, M.chrome, false));
    for (let k = 0; k < 5; k++) {
      const a = (Math.PI * (k + 1)) / 6;
      const ray = mesh(new THREE.BoxGeometry(0.004, 0.018, 0.004), M.chrome, false);
      ray.position.set(Math.cos(a) * 0.047, Math.sin(a) * 0.047, 0.002);
      ray.rotation.z = a - Math.PI / 2;
      grp.add(ray);
    }
    // deitado no capô, com o "horizonte" virado para a frente
    grp.rotation.z = Math.PI;
    eg.add(grp);
    bumperG.add(eg);
  }
  // splitter em "V" (contorno da frente em planta), preto com o nome
  {
    const sp = new THREE.Shape();
    const side = [];
    const spY = front.yb - 0.012;
    for (let k = 0; k <= 16; k++) {
      const u = 0.002 + (0.085 * k) / 16;
      side.push([S.sideX(u, S.sec(u).yb + 0.03) + 0.01 + 0.02 * (1 - k / 16), -(S.z(u) + 0.04)]);
    }
    sp.moveTo(-side[16][0], side[16][1]);
    for (let k = 16; k >= 0; k--) sp.lineTo(-side[k][0] * (k === 0 ? 0.1 : 1), side[k][1]);
    for (let k = 0; k <= 16; k++) sp.lineTo(side[k][0] * (k === 0 ? 0.1 : 1), side[k][1]);
    sp.lineTo(side[16][0] - 0.2, side[16][1] + 0.12);
    sp.lineTo(-side[16][0] + 0.2, side[16][1] + 0.12);
    sp.closePath();
    const geo = new THREE.ExtrudeGeometry(sp, { depth: 0.018, bevelEnabled: false, curveSegments: 4 });
    geo.rotateX(-Math.PI / 2);
    const sm = mesh(geo, M.carbon);
    sm.position.y = spY;
    bumperG.add(sm);
    // nome em letras finas na borda do splitter
    const tm = new THREE.MeshBasicMaterial({ map: textTexture(THREE, 'A L V O R A D A', { size: 70, weight: '600' }), transparent: true, depthWrite: false });
    for (const sgn of [1, -1]) {
      const u = 0.035;
      const pl = mesh(new THREE.PlaneGeometry(0.34, 0.042), tm, false);
      const x = sgn * (S.sideX(u, S.sec(u).yb + 0.03) * 0.5 + 0.05);
      pl.position.set(x, spY + 0.02, S.z(u) + 0.03);
      pl.rotation.y = sgn * 0.75;
      if (sgn < 0) pl.visible = false;
      bumperG.add(pl);
    }
  }

  // ---- lâmina central do capô com filete rosa (do bico até o para-brisa)
  {
    const u0 = 0.112;
    const u1 = cab.s + 0.006;
    const rings = [];
    for (let k = 0; k <= 24; k++) {
      const u = u0 + ((u1 - u0) * k) / 24;
      const base = S.topY(u, 0) - 0.02;
      const yA = S.topY(u0, 0);
      const yB = S.topY(u1, 0.06) + 0.02;
      const top = mix(yA, yB, sstep(0, 1, k / 24)) + 0.012;
      const hw = 0.045;
      const z = S.z(u);
      rings.push([V3(-hw * 1.4, base, z), V3(-hw, top - 0.02, z), V3(-hw * 0.5, top, z), V3(hw * 0.5, top, z), V3(hw, top - 0.02, z), V3(hw * 1.4, base, z)]);
    }
    root.add(mesh(ringsGeometry(THREE, rings, false, true), paintPlain));
    // filete rosa: desce sobre o bico e sobe pela lâmina
    const pts = [];
    for (let k = 0; k <= 30; k++) {
      const u = 0.075 + ((u1 - 0.075) * k) / 30;
      let y;
      if (u < u0) y = S.topY(u, 0);
      else {
        const kk = (u - u0) / (u1 - u0);
        y = mix(S.topY(u0, 0), S.topY(u1, 0.06) + 0.02, sstep(0, 1, kk)) + 0.012;
      }
      pts.push(V3(0, y + 0.006, S.z(u)));
    }
    root.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.009, 6, false), M.accentPink, false));
  }

  // ---- forro fosco do poço e da entrada lateral (preto sem reflexo: parece aberto)
  {
    const rings = [];
    for (let k = 0; k <= 28; k++) {
      const u = 0.118 + ((cab.s + 0.012 - 0.118) * k) / 28;
      const c = S.sec(u);
      // borda do poço: onde o flanco do pontão passa de yt + 4,5 cm (bissecção)
      let lo = 0.02;
      let hi = 0.95;
      for (let it = 0; it < 18; it++) {
        const m = (lo + hi) / 2;
        if (S.topY(u, m) < c.yt + 0.045) lo = m;
        else hi = m;
      }
      const xe = lo;
      const ring = [];
      for (let j = 0; j <= 20; j++) {
        const x = -xe + (2 * xe * j) / 20;
        ring.push(V3(x, S.topY(u, x) + 0.008, S.z(u)));
      }
      rings.push(ring);
    }
    root.add(mesh(ringsGeometry(THREE, rings), M.liner, false));
    // forro das entradas laterais: em cada anel do loft (u = i/220), a faixa da
    // lataria onde a entrada é funda (bordas interpoladas), 5 mm para fora
    for (const sc of SCOOPS) {
      if (!sc.liner) continue;
      const i0 = Math.ceil(sc.u0 * 220);
      const i1 = Math.floor(sc.u1 * 220);
      const NJ = 10;
      for (const sgn of [1, -1]) {
        const rings = [];
        for (let i = i0; i <= i1; i++) {
          const u = i / 220;
          const h = S.halfPath(u);
          const ys1 = secInfo(S.sec(u)).ys1;
          // faixa de y onde a entrada passa do limiar (cruzamentos interpolados)
          let ya = null;
          let yb = null;
          let best = 0;
          let yBest = h[I_SIDE0].y;
          for (let j = I_SIDE0; j < I_SH0 - 1; j++) {
            const ka = scoopK(sc, u, h[j].y, ys1) - sc.liner;
            const kb = scoopK(sc, u, h[j + 1].y, ys1) - sc.liner;
            if (ka + sc.liner > best) {
              best = ka + sc.liner;
              yBest = h[j].y;
            }
            const yc = h[j].y + ((h[j + 1].y - h[j].y) * -ka) / (kb - ka || 1);
            if (ka < 0 && kb >= 0 && ya === null) ya = yc;
            if (ka >= 0 && kb < 0) yb = yc;
          }
          if (ya === null || yb === null) ya = yb = yBest;
          // x da lataria na altura y (linear entre os vértices = a própria malha)
          const xAt = (y) => {
            for (let j = I_SIDE0; j < I_SH0 - 1; j++)
              if (h[j + 1].y >= y) return h[j].x + ((h[j + 1].x - h[j].x) * (y - h[j].y)) / Math.max(1e-6, h[j + 1].y - h[j].y);
            return h[I_SH0 - 1].x;
          };
          const ring = [];
          for (let k = 0; k <= NJ; k++) {
            const y = ya + ((yb - ya) * (sgn > 0 ? k : NJ - k)) / NJ;
            ring.push(V3(sgn * (xAt(y) + 0.005), y, S.z(u)));
          }
          rings.push(ring);
        }
        const lg = ringsGeometry(THREE, rings);
        // UV em metros (z, y): a colmeia fica na escala certa (radiador ao fundo)
        const pa = lg.attributes.position;
        const uv = lg.attributes.uv;
        for (let k = 0; k < pa.count; k++) uv.setXY(k, pa.getZ(k) * 1.5, pa.getY(k) * 1.5);
        root.add(mesh(lg, M.grille, false));
      }
    }
  }
  // vidro da bolha bem escuro (troca só o vidro desta cabine)
  {
    // só a face de fora: visto de dentro (câmera do cockpit) o vidro não escurece a pista
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x02040a, metalness: 0.35, roughness: 0.03, transparent: true, opacity: 0.9, envMapIntensity: 2.4, clearcoat: 1, side: THREE.FrontSide, depthWrite: false });
    for (const o of root.children) if (o.isMesh && Array.isArray(o.material) && o.material[1] === M.darkGlass) o.material = [o.material[0], glass, o.material[2], o.material[3]];
  }

  // ---- mecânica à mostra no poço: amortecedores com molas laranja, braços, tanque
  {
    const springMat = new THREE.MeshStandardMaterial({ color: 0xd8500c, emissive: 0x2a0800, metalness: 0.4, roughness: 0.4 });
    for (const sgn of [1, -1]) {
      for (const [u, ang] of [
        [0.148, 0.25],
        [0.19, -0.15],
      ]) {
        const y = S.topY(u, 0.3) + 0.06;
        const grp = new THREE.Group();
        const damper = new THREE.CylinderGeometry(0.013, 0.013, 0.28, 10);
        damper.rotateZ(Math.PI / 2);
        grp.add(mesh(damper, M.darkMetal, false));
        const helix = [];
        for (let i = 0; i <= 90; i++) {
          const t = i / 90;
          const a = t * Math.PI * 2 * 6;
          helix.push(V3(-0.09 + 0.18 * t, Math.cos(a) * 0.026, Math.sin(a) * 0.026));
        }
        grp.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helix), 80, 0.005, 4, false), springMat, false));
        grp.position.set(sgn * 0.33, y - 0.025, S.z(u));
        grp.rotation.y = sgn * ang;
        root.add(grp);
      }
      // braço da suspensão (pushrod) e caixa eletrônica
      const arm = new THREE.CylinderGeometry(0.012, 0.012, 0.42, 8);
      arm.rotateZ(Math.PI / 2 - sgn * 0.25);
      const am = mesh(arm, M.satin, false);
      am.position.set(sgn * 0.5, S.topY(0.17, 0.4) + 0.05, S.z(0.17));
      root.add(am);
      const box = mesh(new THREE.BoxGeometry(0.16, 0.06, 0.12), M.blackPlastic, false);
      box.position.set(sgn * 0.2, S.topY(0.205, 0.2) + 0.03, S.z(0.205));
      root.add(box);
    }
  }

  // ---- cockpit: HUD rosa (triângulo) refletido no para-brisa
  {
    const t = 0.24;
    const h = S.cabHalf(t);
    const y = h[h.length - 1].y - 0.02;
    const z = S.z(S.cabU(t));
    const slope = Math.atan2(cabTop(t + 0.05) - cabTop(t - 0.05), S.z(S.cabU(t - 0.05)) - S.z(S.cabU(t + 0.05)));
    const hud = new THREE.Group();
    const seg = (ax, ay, bx, by) => {
      const len = Math.hypot(bx - ax, by - ay);
      const b = mesh(new THREE.BoxGeometry(len, 0.007, 0.002), M.accentPink, false);
      b.position.set((ax + bx) / 2, (ay + by) / 2, 0);
      b.rotation.z = Math.atan2(by - ay, bx - ax);
      hud.add(b);
    };
    seg(-0.16, 0.05, 0.18, 0.035);
    seg(0.18, 0.035, -0.04, -0.09);
    seg(-0.04, -0.09, -0.16, 0.05);
    seg(-0.2, -0.015, -0.08, -0.015);
    hud.position.set(0, y, z);
    hud.rotation.x = -Math.PI / 2 + slope;
    root.add(hud);
  }

  // ---- snorkel (tomada de ar no teto) e espinha dorsal até a asa
  const tS = 0.62;
  {
    const sg = part('tomada de ar do teto', 20);
    const t0 = tS;
    const y0 = cabTop(t0);
    const z0 = S.z(S.cabU(t0));
    const pr = new THREE.Shape();
    pr.moveTo(0, 0);
    pr.lineTo(0.0, 0.075);
    pr.lineTo(-0.06, 0.08);
    pr.lineTo(-0.36, 0.035);
    pr.lineTo(-0.4, 0.0);
    pr.closePath();
    const sgeo = new THREE.ExtrudeGeometry(pr, { depth: 0.22, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 3 });
    sgeo.translate(0, 0, -0.11);
    sgeo.rotateY(-Math.PI / 2);
    const sm = mesh(sgeo, M.gloss);
    sm.position.set(0, y0 - 0.025, z0 + 0.05);
    sg.add(sm);
    const mouth = mesh(new THREE.PlaneGeometry(0.2, 0.05), M.exhaustIn, false);
    mouth.position.set(0, y0 + 0.022, z0 + 0.0635);
    sg.add(mouth);
  }
  // espinha: barbatana baixa do snorkel até a asa, topo preto com fórmula
  const wingU = 0.85;
  const wingY = 1.04;
  {
    const u0 = S.cabU(tS) - 0.03;
    const u1 = 0.985;
    const rings = [];
    const topPts = [];
    for (let k = 0; k <= 30; k++) {
      const u = u0 + ((u1 - u0) * k) / 30;
      const base = S.topY(u, 0) - 0.03;
      const t = (u - S.cabU(0)) / (S.cabU(1) - S.cabU(0));
      const roofish = t < 1 ? cabTop(Math.min(t, 0.999)) + 0.01 : base;
      // desce do teto até ~14 cm sobre o deck e morre na cauda
      const deck = S.topY(u, 0) + 0.14 * (1 - sstep(0.93, 0.985, u)) + 0.01;
      const top = Math.max(roofish, mix(cabTop(tS) - 0.02, deck, sstep(0, 1, (u - u0) / (0.9 - u0))));
      const hw = 0.065 - 0.025 * (k / 30);
      const z = S.z(u);
      rings.push([V3(-hw * 1.6, base, z), V3(-hw, top - 0.03, z), V3(-hw * 0.8, top, z), V3(hw * 0.8, top, z), V3(hw, top - 0.03, z), V3(hw * 1.6, base, z)]);
      topPts.push({ z, top, hw });
    }
    const sp = part('espinha dorsal', 24);
    sp.add(mesh(ringsGeometry(THREE, rings, false, true), paintPlain));
    // tampa preta com a fórmula da água
    const capR = topPts.map((q) => [V3(-q.hw * 0.85, q.top + 0.002, q.z), V3(q.hw * 0.85, q.top + 0.002, q.z)]);
    const capMat = new THREE.MeshStandardMaterial({ map: textTexture(THREE, '2H₂ + O₂ → 2H₂O + ENERGIA', { w: 1024, h: 64, size: 40, bg: '#0a0b0e', color: '#e8ecf5' }), roughness: 0.4 });
    capMat.map.flipY = false;
    const cg = ringsGeometry(THREE, capR, false, true);
    sp.add(mesh(cg, capMat, false));
    // filete rosa na borda da espinha
    const pk = topPts.map((q) => V3(q.hw * 0.95, q.top - 0.004, q.z));
    sp.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pk), 60, 0.004, 5, false), M.accentPink, false));
  }

  // ---- asa traseira translúcida de largura total
  {
    const wg = part('asa traseira', 18);
    const span = 2.02;
    const chord = 0.6;
    const wingMat = new THREE.MeshPhysicalMaterial({
      color: 0x4a9cff,
      emissive: 0x0b3d9a,
      emissiveIntensity: 0.55,
      metalness: 0,
      roughness: 0.06,
      transparent: true,
      opacity: 0.5,
      clearcoat: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    // perfil (z para trás negativo, y): bordo de ataque redondo, extradorso alto
    const prof = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const x = -chord * t;
      const th = 0.06 * Math.sin(Math.PI * Math.pow(t, 0.7)) * (1 - 0.3 * t);
      prof.push([x, th * 0.5 + 0.03 * Math.sin(Math.PI * t)]);
    }
    const lower = prof.map(([x, y]) => [x, -y * 0.25 + 0.03 * Math.sin(Math.PI * -x / chord) * 0.6]);
    const rings = [];
    const NS = 24;
    for (let s = 0; s <= NS; s++) {
      const x = -span / 2 + (span * s) / NS;
      const drop = 0.05 * (2 * Math.abs(x) / span) ** 4; // pontas levemente caídas
      const ring = [];
      for (const [zz, yy] of prof) ring.push(V3(x, yy - drop, zz));
      for (let i = lower.length - 2; i > 0; i--) ring.push(V3(x, lower[i][1] - drop, lower[i][0]));
      rings.push(ring);
    }
    const wgeo = ringsGeometry(THREE, rings, true);
    const wm = mesh(wgeo, wingMat, false);
    const grp = new THREE.Group();
    grp.add(wm);
    // letreiro "ALVORADA" sobre o extradorso
    const tMat = new THREE.MeshBasicMaterial({ map: textTexture(THREE, 'ALVORADA', { w: 1024, h: 160, size: 120, weight: '300', spacing: 34, stroke: 3 }), transparent: true, opacity: 0.95, depthWrite: false, color: 0xd8ecff });
    const tp = mesh(new THREE.PlaneGeometry(1.5, 0.22), tMat, false);
    tp.rotation.x = -Math.PI / 2 - 0.06;
    tp.position.set(0, 0.078, -chord * 0.46);
    grp.add(tp);
    // borda de ataque e de fuga iluminadas (ciano)
    const glow = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x3aa0ff, emissiveIntensity: 1.8 });
    const edge = new THREE.CylinderGeometry(0.006, 0.006, span, 8);
    edge.rotateZ(Math.PI / 2);
    const em = mesh(edge, glow, false);
    em.position.set(0, -0.002, -chord + 0.004);
    grp.add(em);
    // placas laterais translúcidas que descem até os para-lamas
    for (const sgn of [1, -1]) {
      // a borda de baixo acompanha o alto do para-lama traseiro
      const zLE = S.z(wingU) + chord / 2;
      const ep = new THREE.Shape();
      ep.moveTo(0.06, 0.06);
      ep.lineTo(-chord - 0.04, 0.08);
      for (let k = 0; k <= 8; k++) {
        const x = -chord - 0.08 + ((chord - 0.02) * k) / 8;
        ep.lineTo(x, S.topY(S.u(zLE + x), 0.95) - wingY - 0.015);
      }
      ep.closePath();
      const eg = new THREE.ExtrudeGeometry(ep, { depth: 0.014, bevelEnabled: false });
      eg.rotateY(-Math.PI / 2);
      const e = mesh(eg, wingMat, false);
      e.position.x = sgn * (span / 2 + (sgn > 0 ? 0.014 : 0));
      grp.add(e);
      const eb = mesh(new THREE.BoxGeometry(0.02, 0.012, chord + 0.06), glow, false);
      eb.position.set(sgn * (span / 2 + 0.007), 0.075, -chord / 2 - 0.01);
      grp.add(eb);
      // pilone (pescoço de cisne) do deck até o intradorso
      const pyl = new THREE.Shape();
      const yb = S.topY(wingU + 0.01, 0.34) - wingY;
      pyl.moveTo(-0.08, yb);
      pyl.lineTo(0.12, yb);
      pyl.lineTo(-0.05, 0.0);
      pyl.lineTo(-0.2, 0.0);
      pyl.closePath();
      const pg = new THREE.ExtrudeGeometry(pyl, { depth: 0.02, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 1 });
      pg.translate(0, 0, -0.01);
      pg.rotateY(-Math.PI / 2);
      const pm = mesh(pg, M.darkMetal);
      pm.position.x = sgn * 0.34;
      grp.add(pm);
    }
    grp.position.set(0, wingY, S.z(wingU) + chord / 2);
    wg.add(grp);
  }

  // ---- traseira: borda de luz (lanternas finas) e painel escuro
  {
    // contorno da tampa traseira (u = 1), recuado para dentro pela normal 2D
    const h = S.halfPath(1);
    const zr = S.z(1);
    const yCut = rear.yb + 0.17;
    const inset = (d) => {
      const out = [];
      for (let i = I_SIDE0 + 2; i < h.length; i++) {
        const a = h[Math.max(0, i - 1)];
        const b = h[Math.min(h.length - 1, i + 1)];
        const tx = b.x - a.x;
        const ty = b.y - a.y;
        const l = Math.hypot(tx, ty) || 1;
        // normal para dentro (a meia seção corre de baixo para cima no sentido anti-horário)
        const x = h[i].x - (ty / l) * d;
        const y = h[i].y + (tx / l) * d;
        if (y >= yCut) out.push([Math.max(0, x), y]);
      }
      // suaviza (Laplace) para tirar as ondulações do recuo nos cantos
      for (let it = 0; it < 6; it++)
        for (let i = 1; i < out.length - 1; i++) {
          out[i][0] = out[i][0] * 0.5 + (out[i - 1][0] + out[i + 1][0]) * 0.25;
          out[i][1] = out[i][1] * 0.5 + (out[i - 1][1] + out[i + 1][1]) * 0.25;
        }
      return out;
    };
    // painel escuro em colmeia (saída dos radiadores) com a borda de luz em volta
    const ring = inset(0.075);
    const half = ring.filter((q) => q[0] > 0.005);
    const outline = [[half[0][0], yCut], ...half, ...mirrorPts(half), [-half[0][0], yCut]];
    const gp = new THREE.Group();
    gp.add(mesh(plateGeo(outline, 0.03, 0.03), M.grille, false));
    gp.rotation.y = Math.PI;
    gp.position.z = zr - 0.004;
    root.add(gp);
    for (const sgn of [1, -1]) {
      const lp = part(sgn > 0 ? 'lanterna esquerda' : 'lanterna direita', 14);
      const pts = inset(0.035)
        .reverse()
        .map(([x, y]) => V3(sgn * Math.max(0.004, x), y, zr - 0.009));
      const curve = new THREE.CatmullRomCurve3(pts);
      lp.add(mesh(new THREE.TubeGeometry(curve, 70, 0.009, 6, false), brakeMat, false));
      const back = mesh(new THREE.TubeGeometry(curve, 70, 0.017, 6, false), M.gloss, false);
      back.position.z = 0.006;
      lp.add(back);
    }
    // painel preto inferior (saída do difusor)
    const pg = onRear(0, rear.yb + 0.1, 0.002);
    const rw = rear.hw * 0.9;
    pg.add(mesh(plateGeo([[-rw, -0.08], [rw, -0.08], [rw * 0.85, 0.1], [-rw * 0.85, 0.1]], 0.03, 0.03), M.gloss, false));
    // luz de ré central (estreita)
    const rv = mesh(plateGeo([[-0.08, -0.008], [0.08, -0.008], [0.08, 0.008], [-0.08, 0.008]], 0.004, 0.008), revMat, false);
    rv.position.set(0, 0.06, 0.004);
    pg.add(rv);
    // "H2" na traseira
    const hm = new THREE.MeshBasicMaterial({ map: textTexture(THREE, 'H2', { w: 256, h: 128, size: 96, weight: '900' }), transparent: true, depthWrite: false });
    const ht = mesh(new THREE.PlaneGeometry(0.16, 0.08), hm, false);
    ht.position.set(0, -0.01, 0.006);
    pg.add(ht);
    root.add(pg);
  }

  // ---- difusor traseiro com aletas e saída de água (H2O)
  {
    const dg = part('difusor', 20);
    const dw = rear.hw * 1.5;
    const depth = 0.55;
    const pl = mesh(new THREE.BoxGeometry(dw, 0.02, depth), M.carbon);
    pl.position.set(0, 0, -depth / 2);
    pl.rotation.x = 0.2;
    const grp = new THREE.Group();
    grp.add(pl);
    for (let k = -3; k <= 3; k++) {
      const fin = mesh(new THREE.BoxGeometry(0.012, 0.14, depth * 0.95), M.carbon);
      fin.position.set(k * dw * 0.14, 0.05, -depth / 2);
      fin.rotation.x = 0.2;
      grp.add(fin);
    }
    grp.position.set(0, rear.yb + 0.01, S.z(1) + depth - 0.02);
    dg.add(grp);
    const pipe = new THREE.CylinderGeometry(0.028, 0.03, 0.1, 18, 1, true);
    pipe.rotateX(Math.PI / 2);
    const pm = mesh(pipe, M.satin, false);
    pm.position.set(0, rear.yb + 0.05, S.z(1) - 0.03);
    dg.add(pm);
  }

  // ---- tampa do motor: duas grelhas de veneziana ao lado da espinha
  for (const sgn of [1, -1]) {
    const vg = onTop(0.71, sgn * 0.27, 0.003);
    vg.add(mesh(plateGeo([[-0.11, -0.16], [0.11, -0.13], [0.09, 0.14], [-0.09, 0.16]].map(([x, y]) => [x * sgn, y]), 0.025, 0.02), M.louver, false));
    root.add(vg);
  }
  // ---- bocal de abastecimento de hidrogênio (700 bar) no para-lama traseiro direito
  {
    const fg = onTop(0.68, -0.72, 0.002);
    const ring = new THREE.CylinderGeometry(0.055, 0.058, 0.012, 28);
    ring.rotateX(Math.PI / 2);
    fg.add(mesh(ring, M.satin, false));
    const capG = new THREE.CylinderGeometry(0.044, 0.044, 0.014, 28);
    capG.rotateX(Math.PI / 2);
    const cm = mesh(capG, new THREE.MeshStandardMaterial({ map: textTexture(THREE, 'H2', { w: 128, h: 128, size: 64, weight: '900', bg: '#1d2232' }), metalness: 0.6, roughness: 0.35 }), false);
    cm.position.z = 0.004;
    fg.add(cm);
    root.add(fg);
  }

  // ---- saias laterais (lâminas de carbono)
  for (const sgn of [1, -1]) {
    const u0 = 0.27;
    const u1 = 0.69;
    const um = (u0 + u1) / 2;
    const y = S.sec(um).yb + 0.035;
    const sk = mesh(new THREE.BoxGeometry(0.06, 0.05, (u1 - u0) * L), M.carbon);
    sk.position.set(sgn * (S.sideX(um, y) - 0.01), y, S.z(um));
    part(sgn > 0 ? 'saia esquerda' : 'saia direita', 22).add(sk);
  }

  // ---- câmeras retrovisoras em hastes sobre os pontões
  for (const sgn of [1, -1]) {
    const mg = part(sgn > 0 ? 'retrovisor esquerdo' : 'retrovisor direito', 12);
    const u = 0.235;
    const x = 0.66;
    const y = S.topY(u, x);
    // haste em lâmina, inclinada para fora e para cima
    const stalk = mesh(new THREE.BoxGeometry(0.2, 0.014, 0.06), M.gloss, false);
    stalk.position.set(sgn * (x + 0.08), y + 0.06, S.z(u));
    stalk.rotation.z = sgn * 0.55;
    mg.add(stalk);
    // cápsula da câmera (aerodinâmica, preta)
    const cg = new THREE.CapsuleGeometry(0.028, 0.1, 4, 12);
    cg.rotateX(Math.PI / 2);
    const body = mesh(cg, M.gloss);
    body.position.set(sgn * (x + 0.17), y + 0.12, S.z(u) - 0.01);
    mg.add(body);
    const lens = mesh(new THREE.CircleGeometry(0.014, 14), M.visor, false);
    lens.rotation.y = Math.PI;
    lens.position.set(sgn * (x + 0.17), y + 0.12, S.z(u) - 0.089);
    mg.add(lens);
  }
}

export default {
  id: 'alvorada',
  style: 'alvorada',
  name: 'Alvorada H2',
  desc: 'Protótipo a hidrogênio de pontões e cockpit-bolha. Muita pressão aerodinâmica: o mais grudado no chão.',
  length: 5.0,
  frontU: 0.165,
  rearU: 0.79,
  wheelR: 0.37,
  tireW: 0.33,
  trackHalf: 0.9,
  hw: [[0, 0.2], [0.025, 0.5], [0.055, 0.8], [0.09, 0.98], [0.13, 1.06], [0.165, 1.08], [0.21, 1.075], [0.26, 1.02], [0.32, 0.95], [0.42, 0.92], [0.52, 0.94], [0.62, 1.0], [0.71, 1.07], [0.79, 1.09], [0.87, 1.075], [0.94, 1.03], [0.98, 0.97], [1, 0.92]],
  yb: [[0, 0.17], [0.03, 0.11], [0.08, 0.1], [0.5, 0.095], [0.9, 0.11], [0.97, 0.16], [1, 0.22]],
  yt: [[0, 0.46], [0.05, 0.52], [0.1, 0.56], [0.125, 0.52], [0.15, 0.44], [0.2, 0.43], [0.25, 0.5], [0.33, 0.62], [0.5, 0.66], [0.62, 0.7], [0.72, 0.68], [0.85, 0.69], [0.95, 0.69], [1, 0.64]],
  yf: [[0, 0.47], [0.03, 0.53], [0.06, 0.65], [0.1, 0.8], [0.15, 0.92], [0.2, 0.94], [0.25, 0.88], [0.3, 0.76], [0.36, 0.69], [0.46, 0.67], [0.54, 0.74], [0.62, 0.88], [0.7, 0.97], [0.79, 1.0], [0.87, 0.98], [0.94, 0.92], [1, 0.8]],
  rs: [[0, 0.08], [0.06, 0.14], [0.15, 0.2], [0.3, 0.16], [0.45, 0.12], [0.6, 0.12], [0.7, 0.15], [0.79, 0.2], [0.95, 0.16], [1, 0.12]],
  rb: 0.06,
  tuck: 0.04,
  tumble: 0.1,
  flare: 0,
  bodyMod,
  cab: {
    s: 0.2,
    e: 0.63,
    roof: 1.1,
    tW: 0.52,
    tR: 0.64,
    hwBase: [[0, 0.44], [0.3, 0.53], [0.6, 0.52], [1, 0.26]],
    hwRoof: [[0, 0.24], [0.35, 0.36], [0.6, 0.34], [1, 0.1]],
    rRoof: 0.18,
    crown: 0.06,
    winEnd: 0.72,
    bPillar: null,
    darkGlass: true,
    singleSeat: true,
  },
  wheelStyle: 'y5',
  wheelFace,
  rimColor: '#2a3346',
  caliperColor: '#e0206e',
  doorLines: [0.33, 0.56],
  hoodLine: 0.25,
  hoodHalf: 0.5,
  trunkLine: 0.74,
  trunkHalf: 0.55,
  numberU: 0.48,
  stripes: false,
  sideStripe: false,
  livery: { noNumber: true, noSponsors: true, noPanelLines: true },
  skip: { splitter: true, skirts: true, handles: true, markers: true, fuel: true, mirrors: true, wipers: true, thirdBrake: true, reverse: true, plate: true, diffuser: true, exhaust: true },
  mass: 1290,
  power: 1.3,
  grip: 1.1,
  downforce: 1.6,
  drag: 1.05,
  final: 3.3,
  decorate,
};
