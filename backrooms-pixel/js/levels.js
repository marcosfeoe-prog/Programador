// Geração procedural dos três níveis: labirinto em blocos sobre um toro,
// luzes no forro, mapa de luz pré-calculado com sombras, itens e saída.
import { rng, wrap } from './util.js';
import { buildLevelTextures } from './textures.js';

export const LM_Q = 4; // subdivisões do mapa de luz por célula

export const LEVEL_DEFS = [
  {
    id: 0, name: 'NÍVEL 0', title: 'O SAGUÃO',
    intro: 'PAPEL DE PAREDE AMARELO. CARPETE ÚMIDO. O ZUMBIDO DAS LÂMPADAS NUNCA PARA.\nALGO ANDA POR AQUI.',
    hint: 'PROCURE A PAREDE QUE FALHA',
    N: 16, B: 5, remove: 0.36, full: 0.45, pillarDrop: 0.55, variant: 0.12,
    ambient: [0.12, 0.11, 0.07], lampColor: [1.0, 0.94, 0.74], fog: [72, 63, 30], fogDensity: 0.075, maxDist: 24,
    lightRadius: 6.5, lightPower: 1.25, deadProb: 0.14, flickerProb: 0.12,
    step: 'carpet', drainBase: 0.1, darkDrain: 1.5,
    waters: 14, batteries: 9, entity: true, exitMin: 46, exitMax: 72,
    arrows: { every: 11, prob: 0.55 }, damp: 70,
  },
  {
    id: 1, name: 'NÍVEL 1', title: 'ZONA HABITÁVEL',
    intro: 'UM ARMAZÉM DE CONCRETO SEM FIM. AS LUZES CAEM SEM AVISO.\nGUARDE PILHAS.',
    hint: 'ENCONTRE A PORTA DE SAÍDA',
    N: 12, B: 7, remove: 0.55, full: 0.6, pillarDrop: 0.8, variant: 0,
    ambient: [0.055, 0.06, 0.065], lampColor: [0.84, 0.92, 1.0], fog: [18, 20, 22], fogDensity: 0.11, maxDist: 24,
    lightRadius: 7, lightPower: 1.15, deadProb: 0.34, flickerProb: 0.24,
    step: 'concrete', drainBase: 0.14, darkDrain: 1.7,
    waters: 12, batteries: 14, crates: 46, puddles: 60, outages: true, exitMin: 52, exitMax: 82,
    arrows: { every: 12, prob: 0.6 },
  },
  {
    id: 2, name: 'NÍVEL 2', title: 'CANOS',
    intro: 'TÚNEIS DE MANUTENÇÃO. QUENTE. ESCURO. O VAPOR SIBILA NAS PAREDES.\nSUA LANTERNA É TUDO O QUE VOCÊ TEM.',
    hint: 'ACHE A PORTA DE MADEIRA',
    N: 32, B: 2, remove: 0.2, full: 1, pillarDrop: 0, variant: 0.1,
    ambient: [0.018, 0.01, 0.008], lampColor: [1.0, 0.26, 0.16], fog: [6, 2, 1], fogDensity: 0.15, maxDist: 20,
    lightRadius: 4.5, lightPower: 1.0, lampChance: 0.03, deadProb: 0.08, flickerProb: 0.4,
    step: 'metal', drainBase: 0.18, darkDrain: 1.3,
    waters: 10, batteries: 12, rooms: 7, steam: 22, exitMin: 50, exitMax: 90,
    arrows: { every: 14, prob: 0.4 },
  },
];

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

function blockMaze(def, R) {
  const { N, B } = def;
  const S = N * B;
  const g = new Uint8Array(S * S);
  const id = (x, y) => wrap(y, S) * S + wrap(x, S);
  const east = new Uint8Array(N * N).fill(1), south = new Uint8Array(N * N).fill(1);
  const fullE = new Uint8Array(N * N), fullS = new Uint8Array(N * N);
  const node = (i, j) => wrap(j, N) * N + wrap(i, N);

  // labirinto perfeito (busca em profundidade) — garante que tudo se conecta
  const vis = new Uint8Array(N * N);
  const stack = [Math.floor(R() * N * N)];
  vis[stack[0]] = 1;
  while (stack.length) {
    const c = stack[stack.length - 1], cx = c % N, cy = Math.floor(c / N);
    const opts = [];
    for (let d = 0; d < 4; d++) {
      const n = node(cx + DIRS[d][0], cy + DIRS[d][1]);
      if (!vis[n]) opts.push([d, n]);
    }
    if (!opts.length) { stack.pop(); continue; }
    const [d, n] = opts[Math.floor(R() * opts.length)];
    if (d === 0) east[c] = 0;
    else if (d === 2) east[n] = 0;
    else if (d === 1) south[c] = 0;
    else south[n] = 0;
    vis[n] = 1;
    stack.push(n);
  }
  // abre passagens extras: mais ciclos, menos becos
  for (let n = 0; n < N * N; n++) {
    if (east[n] && R() < def.remove) east[n] = 0;
    if (south[n] && R() < def.remove) south[n] = 0;
  }
  // pinta as paredes na grade
  const paintLine = (cells, closed, fullArr, n) => {
    if (closed) { for (const c of cells) g[c] = 1; return; }
    if (R() < def.full) { fullArr[n] = 1; return; }
    const len = cells.length;
    const gap = 1 + Math.floor(R() * Math.max(1, len - 2));
    const s = Math.floor(R() * (len - gap + 1));
    cells.forEach((c, k) => { if (k < s || k >= s + gap) g[c] = 1; });
  };
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const n = node(i, j);
      const vx = [], hy = [];
      for (let k = 1; k < B; k++) { vx.push(id((i + 1) * B, j * B + k)); hy.push(id(i * B + k, (j + 1) * B)); }
      paintLine(vx, east[n], fullE, n);
      paintLine(hy, south[n], fullS, n);
    }
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const allOpen = fullE[node(i - 1, j - 1)] && fullE[node(i - 1, j)] && fullS[node(i - 1, j - 1)] && fullS[node(i, j - 1)];
      if (!(allOpen && R() < def.pillarDrop)) g[id(i * B, j * B)] = 1;
    }
  return { g, S };
}

export function bfs(g, S, start, passable = (t) => t === 0) {
  const dist = new Int32Array(S * S).fill(-1);
  const q = new Int32Array(S * S);
  let h = 0, t = 0;
  dist[start] = 0;
  q[t++] = start;
  while (h < t) {
    const c = q[h++], x = c % S, y = (c - x) / S;
    for (let d = 0; d < 4; d++) {
      const n = wrap(y + DIRS[d][1], S) * S + wrap(x + DIRS[d][0], S);
      if (dist[n] < 0 && passable(g[n])) { dist[n] = dist[c] + 1; q[t++] = n; }
    }
  }
  return dist;
}

// Caminho mais curto de 'from' até 'to' (lista de índices de células, sem a origem).
export function findPath(g, S, from, to, maxLen = 4000) {
  const dist = bfs(g, S, to);
  if (dist[from] < 0) return [];
  const path = [];
  let c = from;
  while (c !== to && path.length < maxLen) {
    const x = c % S, y = (c - x) / S;
    let best = -1;
    for (let d = 0; d < 4; d++) {
      const n = wrap(y + DIRS[d][1], S) * S + wrap(x + DIRS[d][0], S);
      if (dist[n] >= 0 && dist[n] < dist[c]) { best = n; break; }
    }
    if (best < 0) break;
    path.push(best);
    c = best;
  }
  return path;
}

function countReach(dist) { let n = 0; for (let i = 0; i < dist.length; i++) if (dist[i] >= 0) n++; return n; }

function lineClear(g, S, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const n = Math.ceil(Math.hypot(dx, dy) / 0.3);
  for (let k = 1; k < n; k++) {
    const x = x0 + (dx * k) / n, y = y0 + (dy * k) / n;
    if (g[wrap(Math.floor(y), S) * S + wrap(Math.floor(x), S)] !== 0) return false;
  }
  return true;
}

function computeLightmap(L) {
  const { S, grid: g, lights } = L;
  const Q = LM_Q, M = S * Q;
  const lm = new Float32Array(M * M), owner = new Int16Array(M * M).fill(-1), best = new Float32Array(M * M);
  lights.forEach((li, idx) => {
    const lx = li.x + 0.5, ly = li.y + 0.5, R = li.radius;
    const x0 = Math.floor((lx - R) * Q), x1 = Math.ceil((lx + R) * Q);
    const y0 = Math.floor((ly - R) * Q), y1 = Math.ceil((ly + R) * Q);
    for (let sy = y0; sy < y1; sy++)
      for (let sx = x0; sx < x1; sx++) {
        const wx = (sx + 0.5) / Q, wy = (sy + 0.5) / Q;
        const d = Math.hypot(wx - lx, wy - ly);
        if (d >= R) continue;
        const cell = wrap(Math.floor(wy), S) * S + wrap(Math.floor(wx), S);
        if (g[cell] !== 0) continue;
        if (!lineClear(g, S, lx, ly, wx, wy)) continue;
        const k = 1 - d / R;
        const v = li.power * Math.pow(k, 1.6) * (1 / (1 + d * d * 0.04));
        const i = wrap(sy, M) * M + wrap(sx, M);
        lm[i] += v;
        if (v > best[i]) { best[i] = v; owner[i] = idx; }
      }
  });
  L.lm = lm;
  L.owner = owner;
}

function pickOpen(L, R, test) {
  const { S, grid } = L;
  for (let tries = 0; tries < 5000; tries++) {
    const c = Math.floor(R() * S * S);
    if (grid[c] === 0 && (!test || test(c))) return c;
  }
  return -1;
}

export function torusDist(S, a, b) {
  let dx = Math.abs((a % S) - (b % S)), dy = Math.abs(Math.floor(a / S) - Math.floor(b / S));
  dx = Math.min(dx, S - dx);
  dy = Math.min(dy, S - dy);
  return Math.hypot(dx, dy);
}

export function buildLevel(idx, seed) {
  const def = LEVEL_DEFS[idx];
  const R = rng(seed);
  const { g, S } = blockMaze(def, R);
  const L = { def, id: def.id, S, grid: g, seed };
  const at = (x, y) => wrap(y, S) * S + wrap(x, S);

  // salas abertas extras (Nível 2: casas de caldeira)
  if (def.rooms) {
    for (let k = 0; k < def.rooms; k++) {
      const x0 = Math.floor(R() * S), y0 = Math.floor(R() * S), w = 3 + Math.floor(R() * 3), h = 3 + Math.floor(R() * 3);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[at(x0 + x, y0 + y)] = 0;
    }
  }

  // luzes
  const lights = [];
  const lampAt = new Int16Array(S * S).fill(-1);
  const addLight = (x, y) => {
    const c = at(x, y);
    if (g[c] !== 0 || lampAt[c] >= 0) return;
    const r = R();
    const type = r < def.deadProb ? 'dead' : r < def.deadProb + def.flickerProb ? 'flicker' : 'steady';
    lampAt[c] = lights.length;
    lights.push({
      x: wrap(x, S), y: wrap(y, S), radius: def.lightRadius, power: def.lightPower,
      type, cur: type === 'dead' ? 0 : 1, phase: R() * 100, next: R() * 3,
    });
  };
  if (def.lampChance) {
    for (let c = 0; c < S * S; c++) if (g[c] === 0 && R() < def.lampChance) addLight(c % S, Math.floor(c / S));
  } else {
    const o = Math.floor(def.B / 2);
    for (let j = 0; j < def.N; j++) for (let i = 0; i < def.N; i++) addLight(i * def.B + o, j * def.B + o);
  }
  L.lights = lights;
  L.lampAt = lampAt;

  // ponto de partida: embaixo de uma luz que funciona
  const working = lights.filter((l) => l.type === 'steady');
  const sl = working[Math.floor(R() * working.length)] || lights[0];
  let spawn = at(sl.x, sl.y);

  // caixas (Nível 1), sem nunca bloquear caminhos
  if (def.crates) {
    let reach = countReach(bfs(g, S, spawn));
    for (let k = 0; k < def.crates; k++) {
      const c = pickOpen(L, R, (c) => lampAt[c] < 0 && torusDist(S, c, spawn) > 3);
      if (c < 0) continue;
      const cells = [c];
      const extra = Math.floor(R() * 3);
      for (let e = 0; e < extra; e++) {
        const b = cells[Math.floor(R() * cells.length)], d = DIRS[Math.floor(R() * 4)];
        const n = at((b % S) + d[0], Math.floor(b / S) + d[1]);
        if (g[n] === 0 && lampAt[n] < 0 && !cells.includes(n)) cells.push(n);
      }
      for (const cc of cells) g[cc] = 2;
      const r2 = countReach(bfs(g, S, spawn));
      if (r2 !== reach - cells.length) for (const cc of cells) g[cc] = 0;
      else reach = r2;
    }
  }

  // variações de parede
  if (def.variant) for (let c = 0; c < S * S; c++) if (g[c] === 1 && R() < def.variant) g[c] = 2;

  // ilhas que ficaram isoladas viram parede (o jogador nunca as alcançaria)
  const dist0 = bfs(g, S, spawn);
  for (let c = 0; c < S * S; c++) if (g[c] === 0 && dist0[c] < 0) g[c] = 1;

  // saída: uma parede longe, encostada num corredor alcançável
  const cand = [];
  for (let c = 0; c < S * S; c++) {
    if (g[c] === 0 || lampAt[c] >= 0) continue;
    const x = c % S, y = Math.floor(c / S);
    for (let d = 0; d < 4; d++) {
      const n = at(x + DIRS[d][0], y + DIRS[d][1]);
      if (g[n] === 0 && dist0[n] >= def.exitMin && dist0[n] <= def.exitMax) { cand.push([c, n]); break; }
    }
  }
  if (!cand.length) {
    let far = 0, fc = -1;
    for (let c = 0; c < S * S; c++) if (dist0[c] > far) { far = dist0[c]; fc = c; }
    const x = fc % S, y = Math.floor(fc / S);
    for (let d = 0; d < 4; d++) { const n = at(x + DIRS[d][0], y + DIRS[d][1]); if (g[n] !== 0) { cand.push([n, fc]); break; } }
  }
  const [exitCell, exitFront] = cand[Math.floor(R() * cand.length)];
  g[exitCell] = 9;
  L.exit = { x: exitCell % S, y: Math.floor(exitCell / S), front: exitFront };

  // decalques: setas pintadas no chão indicando o caminho, umidade, poças
  const decal = new Uint8Array(S * S);
  const path = findPath(g, S, spawn, exitFront);
  if (def.arrows) {
    for (let k = 3; k < path.length - 2; k++) {
      if (k % def.arrows.every !== 0 || R() > def.arrows.prob) continue;
      const a = path[k], b = path[k + 1];
      const dx = Math.round(((b % S) - (a % S) + S + S / 2) % S - S / 2);
      const dy = Math.round((Math.floor(b / S) - Math.floor(a / S) + S + S / 2) % S - S / 2);
      decal[a] = dx > 0 ? 1 : dy > 0 ? 2 : dx < 0 ? 3 : 4;
    }
  }
  const blots = def.damp || def.puddles || 0;
  for (let k = 0; k < blots; k++) {
    const c = pickOpen(L, R, (c) => !decal[c]);
    if (c >= 0) decal[c] = 5;
  }
  L.decal = decal;
  L.pathLen = path.length;

  // itens
  const items = [];
  const place = (type, count) => {
    for (let k = 0; k < count; k++) {
      const c = pickOpen(L, R, (c) => dist0[c] > 3 && items.every((it) => torusDist(S, c, it.cell) > 5));
      if (c < 0) continue;
      items.push({ type, cell: c, x: (c % S) + 0.3 + R() * 0.4, y: Math.floor(c / S) + 0.3 + R() * 0.4, taken: false, ph: R() * 6 });
    }
  };
  place('water', def.waters);
  place('battery', def.batteries);
  L.items = items;

  // respiros de vapor (Nível 2)
  L.vents = [];
  if (def.steam) {
    for (let k = 0; k < def.steam; k++) {
      const c = pickOpen(L, R, (c) => torusDist(S, c, spawn) > 4);
      if (c >= 0) L.vents.push({ x: (c % S) + 0.5, y: Math.floor(c / S) + 0.5, t: R() * 5, on: false });
    }
  }

  L.spawn = { x: sl.x + 0.5, y: sl.y + 0.5, a: R() * Math.PI * 2, cell: spawn };
  // olha para um lado aberto
  for (let d = 0; d < 4; d++) {
    if (g[at(sl.x + DIRS[d][0], sl.y + DIRS[d][1])] === 0) { L.spawn.a = Math.atan2(DIRS[d][1], DIRS[d][0]); break; }
  }

  computeLightmap(L);
  L.tex = buildLevelTextures(def.id, seed);
  L.ambient = def.ambient;
  L.lampColor = def.lampColor;
  L.fog = def.fog;
  L.fogDensity = def.fogDensity;
  L.maxDist = def.maxDist;
  L.dist0 = dist0;
  return L;
}

export const isSolid = (t) => t !== 0;
