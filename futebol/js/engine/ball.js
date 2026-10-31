// Física da bola: gravidade, arrasto com crise de arrasto, efeito Magnus,
// "folha seca" (bola sem rotação oscila), vento com rajadas, quique com atrito
// e troca de rotação, rolagem com resistência do gramado, poças, traves,
// travessão, rede e placas de publicidade.
import { PITCH as P, BALL as B, G } from './constants.js';
import { clamp, smoothstep, noise1 } from '../util.js';
import { puddleAt } from './weather.js';

const R = B.r;
const K = B.k;

// Coeficiente de arrasto: ~0,45 em baixa velocidade e ~0,21 depois da crise
// de arrasto (escoamento turbulento) acima de ~15 m/s.
export function cdOf(sp) {
  return 0.21 + 0.24 * (1 - smoothstep(9, 15, sp));
}

// Coeficiente de sustentação (Magnus) em função do parâmetro de rotação S = rω/v.
export function clOf(S) {
  return (0.32 * S) / (S + 0.12);
}

// Segmentos das traves e travessões (centro dos cilindros).
const PZ = P.goalW / 2 + P.postR;
const BAR_Y = P.goalH + P.postR;
const FRAME = [];
for (const s of [-1, 1]) {
  const x = s * P.HL;
  FRAME.push({ a: [x, 0, -PZ], b: [x, BAR_Y, -PZ], s, kind: 'trave' });
  FRAME.push({ a: [x, 0, PZ], b: [x, BAR_Y, PZ], s, kind: 'trave' });
  FRAME.push({ a: [x, BAR_Y, -PZ], b: [x, BAR_Y, PZ], s, kind: 'travessao' });
}

// Planos da rede (dois lados). n = normal apontando para dentro do gol.
const NET_Z = P.goalW / 2 + P.postR * 2;
const NETS = [];
for (const s of [-1, 1]) {
  const x0 = s * P.HL;
  const xTop = s * (P.HL + P.netTopDepth);
  const xBot = s * (P.HL + P.netDepth);
  // fundo inclinado
  const dx = xBot - xTop;
  const dy = -P.goalH;
  const len = Math.hypot(dx, dy);
  NETS.push({ s, kind: 'fundo', px: xTop, py: P.goalH, pz: 0, nx: (-s * P.goalH) / len, ny: -Math.abs(dx) / len, nz: 0 });
  // teto
  NETS.push({ s, kind: 'teto', px: x0, py: P.goalH, pz: 0, nx: 0, ny: -1, nz: 0 });
  // laterais
  NETS.push({ s, kind: 'lado', px: x0, py: 0, pz: NET_Z, nx: 0, ny: 0, nz: -1 });
  NETS.push({ s, kind: 'lado', px: x0, py: 0, pz: -NET_Z, nx: 0, ny: 0, nz: 1 });
}

// O ponto (x, y, z) está dentro da "caixa" do gol do lado s?
function insideGoalFrame(s, x, y, z, m = 0) {
  const ax = s * x - P.HL; // profundidade a partir da linha
  if (ax < -m || Math.abs(z) > NET_Z + m || y > P.goalH + m || y < -0.5) return false;
  const depthAtY = P.netDepth - (P.netDepth - P.netTopDepth) * clamp(y / P.goalH, 0, 1);
  return ax <= depthAtY + m;
}

export class Ball {
  constructor() {
    this.p = { x: 0, y: R, z: 0 };
    this.v = { x: 0, y: 0, z: 0 };
    this.w = { x: 0, y: 0, z: 0 };
    this.prev = { x: 0, y: R, z: 0 };
    this.held = null; // jogador segurando (goleiro, lateral)
    this.glue = null; // jogador conduzindo com a bola colada ao pé
    this.fixed = false; // parada para cobrança
    this.seed = Math.random() * 100;
    this.events = []; // {type:'trave'|'rede'|'quique'|'placa', ...}
    this.time = 0;
  }

  place(x, z, y = R) {
    this.glue = null;
    this.p.x = x;
    this.p.y = y;
    this.p.z = z;
    this.v.x = this.v.y = this.v.z = 0;
    this.w.x = this.w.y = this.w.z = 0;
    this.prev.x = x;
    this.prev.y = y;
    this.prev.z = z;
  }

  get speed() {
    return Math.hypot(this.v.x, this.v.y, this.v.z);
  }
  get groundSpeed() {
    return Math.hypot(this.v.x, this.v.z);
  }
  get onGround() {
    return this.p.y <= R + 0.03 && Math.abs(this.v.y) < 0.6;
  }

  step(dt, env, substeps = 4) {
    this.prev.x = this.p.x;
    this.prev.y = this.p.y;
    this.prev.z = this.p.z;
    if (this.held || this.fixed || this.glue) {
      this.time += dt;
      return;
    }
    const h = dt / substeps;
    for (let i = 0; i < substeps; i++) {
      integrate(this, h, env, true, this.time);
      this.time += h;
    }
  }
}

// Integra um subpasso. full=false pula colisões com traves/rede (previsão rápida).
export function integrate(b, h, env, full, time) {
  const p = b.p;
  const v = b.v;
  const w = b.w;
  const px0 = p.x;
  const py0 = p.y;
  const pz0 = p.z;

  // vento (fraco rente ao chão, protegido pelas arquibancadas)
  let wx = 0;
  let wz = 0;
  if (env.windSpeed > 0.1) {
    const hf = clamp((p.y + 0.6) / 9, 0.22, 1);
    const g = 1 + env.gust * noise1(time * 0.4, 3);
    wx = env.windX * hf * g;
    wz = env.windZ * hf * g;
  }
  const rx = v.x - wx;
  const ry = v.y;
  const rz = v.z - wz;
  const sp = Math.hypot(rx, ry, rz);
  let ax = 0;
  let ay = -G;
  let az = 0;
  const kq = (0.5 * env.rho * B.A) / B.m;
  if (sp > 0.05) {
    const drag = kq * cdOf(sp) * sp;
    ax -= drag * rx;
    ay -= drag * ry;
    az -= drag * rz;
    const wm = Math.hypot(w.x, w.y, w.z);
    const airborne = p.y > R + 0.02;
    if (wm > 0.5) {
      const S = (R * wm) / sp;
      const cl = clOf(S);
      const cx = w.y * rz - w.z * ry;
      const cy = w.z * rx - w.x * rz;
      const cz = w.x * ry - w.y * rx;
      const cm = Math.hypot(cx, cy, cz);
      if (cm > 1e-6) {
        const f = (kq * cl * sp * sp) / cm;
        ax += cx * f;
        ay += cy * f;
        az += cz * f;
      }
    }
    // "folha seca": bola rápida quase sem rotação desvia de forma errática
    if (airborne && sp > 17 && wm < 4) {
      const amt = kq * 0.04 * sp * sp * smoothstep(17, 27, sp) * (1 - wm / 4);
      let nx = noise1(time * 3.1 + b.seed, 11);
      let ny = noise1(time * 2.6 + b.seed, 23) * 0.6;
      let nz = noise1(time * 3.4 + b.seed, 37);
      const d = (nx * rx + ny * ry + nz * rz) / (sp * sp);
      nx -= d * rx;
      ny -= d * ry;
      nz -= d * rz;
      ax += nx * amt;
      ay += ny * amt;
      az += nz * amt;
    }
    if (airborne) {
      const dec = Math.exp(-0.06 * h);
      w.x *= dec;
      w.y *= dec;
      w.z *= dec;
    }
  }
  v.x += ax * h;
  v.y += ay * h;
  v.z += az * h;
  p.x += v.x * h;
  p.y += v.y * h;
  p.z += v.z * h;

  // ---- chão
  if (p.y < R) {
    p.y = R;
    if (v.y < -0.9) {
      const vn = -v.y;
      const e = env.restitution * (1 - 0.22 * smoothstep(3, 18, vn));
      v.y = vn * e;
      if (v.y < 0.7) v.y = 0;
      const ux = v.x + R * w.z;
      const uz = v.z - R * w.x;
      const um = Math.hypot(ux, uz);
      if (um > 1e-4) {
        const j = Math.min(env.slideMu * (1 + e) * vn, (um * K) / (1 + K));
        const dx = (-ux / um) * j;
        const dz = (-uz / um) * j;
        v.x += dx;
        v.z += dz;
        w.x += (-R * dz) / (K * R * R);
        w.z += (R * dx) / (K * R * R);
      }
      const keep = env.bounceKeep;
      v.x *= keep;
      v.z *= keep;
      w.y *= 0.7;
      if (full && vn > 2.5) b.events.push({ type: 'quique', speed: vn, x: p.x, z: p.z });
    } else {
      if (v.y < 0) v.y = 0;
      const ux = v.x + R * w.z;
      const uz = v.z - R * w.x;
      const um = Math.hypot(ux, uz);
      if (um > 0.12) {
        // deslizando: atrito cinético até começar a rolar
        const j = Math.min(env.slideMu * G * h, (um * K) / (1 + K));
        const dx = (-ux / um) * j;
        const dz = (-uz / um) * j;
        v.x += dx;
        v.z += dz;
        w.x += (-R * dz) / (K * R * R);
        w.z += (R * dx) / (K * R * R);
      } else {
        w.x = v.z / R;
        w.z = -v.x / R;
      }
      w.y *= Math.exp(-2.5 * h);
      const gs = Math.hypot(v.x, v.z);
      if (gs > 0) {
        let res = env.rollMu * G + env.rollLin * gs;
        if (env.puddles.length) res += puddleAt(env, p.x, p.z) * (3.5 + gs * 0.6);
        const ns = Math.max(0, gs - res * h);
        v.x *= ns / gs;
        v.z *= ns / gs;
        if (ns === 0) {
          w.x = w.z = 0;
        }
      }
    }
  }
  if (!full) return;

  // ---- traves e travessão (só perto dos gols)
  if (Math.abs(p.x) > P.HL - 1.5 && Math.abs(p.x) < P.HL + 1.5 && Math.abs(p.z) < PZ + 1 && p.y < BAR_Y + 1) {
    for (const f of FRAME) collideSegment(b, f, h);
  }
  // ---- rede
  if (Math.abs(p.x) > P.HL - 0.5 && Math.abs(p.x) < P.HL + P.netDepth + 1 && Math.abs(p.z) < NET_Z + 1 && p.y < P.goalH + 1) {
    for (const n of NETS) collideNet(b, n, px0, py0, pz0);
  }
  // ---- placas de publicidade
  if (p.y < P.boardH + R) {
    if (Math.abs(p.x) > P.boardX - R && Math.abs(px0) <= P.boardX - R && Math.abs(p.z) < P.boardZ) {
      p.x = Math.sign(p.x) * (P.boardX - R);
      v.x = -v.x * 0.45;
      v.z *= 0.8;
      b.events.push({ type: 'placa', speed: Math.abs(v.x) });
    }
    if (Math.abs(p.z) > P.boardZ - R && Math.abs(pz0) <= P.boardZ - R && Math.abs(p.x) < P.boardX) {
      p.z = Math.sign(p.z) * (P.boardZ - R);
      v.z = -v.z * 0.45;
      v.x *= 0.8;
      b.events.push({ type: 'placa', speed: Math.abs(v.z) });
    }
  }
}

function collideSegment(b, f, h) {
  const p = b.p;
  const v = b.v;
  const [ax, ay, az] = f.a;
  const [bx, by, bz] = f.b;
  const sx = bx - ax;
  const sy = by - ay;
  const sz = bz - az;
  const ll = sx * sx + sy * sy + sz * sz;
  let t = ((p.x - ax) * sx + (p.y - ay) * sy + (p.z - az) * sz) / ll;
  t = clamp(t, 0, 1);
  const cx = ax + sx * t;
  const cy = ay + sy * t;
  const cz = az + sz * t;
  let dx = p.x - cx;
  let dy = p.y - cy;
  let dz = p.z - cz;
  const d = Math.hypot(dx, dy, dz);
  const minD = R + P.postR;
  if (d >= minD || d < 1e-6) return;
  dx /= d;
  dy /= d;
  dz /= d;
  p.x = cx + dx * minD;
  p.y = cy + dy * minD;
  p.z = cz + dz * minD;
  const vn = v.x * dx + v.y * dy + v.z * dz;
  if (vn < 0) {
    const e = 0.72;
    v.x -= (1 + e) * vn * dx;
    v.y -= (1 + e) * vn * dy;
    v.z -= (1 + e) * vn * dz;
    // atrito tangencial e perda de rotação
    v.x *= 0.93;
    v.y *= 0.93;
    v.z *= 0.93;
    b.w.x *= 0.5;
    b.w.y *= 0.5;
    b.w.z *= 0.5;
    b.events.push({ type: 'trave', kind: f.kind, side: f.s, speed: -vn, x: p.x, y: p.y, z: p.z });
  }
}

function collideNet(b, n, px0, py0, pz0) {
  const p = b.p;
  const v = b.v;
  const dNow = (p.x - n.px) * n.nx + (p.y - n.py) * n.ny + (p.z - n.pz) * n.nz;
  const dPrev = (px0 - n.px) * n.nx + (py0 - n.py) * n.ny + (pz0 - n.pz) * n.nz;
  // de que lado a bola estava
  const side = dPrev >= 0 ? 1 : -1;
  if (side * dNow >= R) return;
  // o ponto de contato precisa estar na área daquele pedaço de rede
  const cx = p.x - n.nx * dNow;
  const cy = p.y - n.ny * dNow;
  const cz = p.z - n.nz * dNow;
  const s = n.s;
  const depth = s * cx - P.HL;
  if (n.kind === 'fundo') {
    if (Math.abs(cz) > NET_Z || cy < 0 || cy > P.goalH) return;
  } else if (n.kind === 'teto') {
    if (Math.abs(cz) > NET_Z || depth < 0 || depth > P.netTopDepth) return;
  } else {
    if (depth < 0 || cy > P.goalH) return;
    const depthAtY = P.netDepth - (P.netDepth - P.netTopDepth) * clamp(cy / P.goalH, 0, 1);
    if (depth > depthAtY) return;
  }
  const nx = n.nx * side;
  const ny = n.ny * side;
  const nz = n.nz * side;
  // empurra para o lado de onde veio
  const pen = R - side * dNow;
  p.x += nx * pen;
  p.y += ny * pen;
  p.z += nz * pen;
  const vn = v.x * nx + v.y * ny + v.z * nz;
  if (vn < 0) {
    // rede absorve quase tudo
    v.x -= 1.12 * vn * nx;
    v.y -= 1.12 * vn * ny;
    v.z -= 1.12 * vn * nz;
    v.x *= 0.55;
    v.z *= 0.55;
    if (v.y > 0) v.y *= 0.5;
    b.w.x *= 0.4;
    b.w.y *= 0.4;
    b.w.z *= 0.4;
    if (-vn > 0.8) b.events.push({ type: 'rede', side: s, kind: n.kind, speed: -vn, x: p.x, y: p.y, z: p.z, inside: side > 0 });
  }
}

export { insideGoalFrame };

// ------------------------------------------------------------ previsão

const tmp = { p: { x: 0, y: 0, z: 0 }, v: { x: 0, y: 0, z: 0 }, w: { x: 0, y: 0, z: 0 }, events: [], seed: 0 };

function loadTmp(b) {
  tmp.p.x = b.p.x;
  tmp.p.y = b.p.y;
  tmp.p.z = b.p.z;
  tmp.v.x = b.v.x;
  tmp.v.y = b.v.y;
  tmp.v.z = b.v.z;
  tmp.w.x = b.w.x;
  tmp.w.y = b.w.y;
  tmp.w.z = b.w.z;
  tmp.seed = b.seed;
  tmp.events.length = 0;
}

// Prevê a trajetória: preenche out com {x,y,z,vx,vy,vz} a cada dtS segundos.
export function predictBall(b, env, n, dtS, out) {
  loadTmp(b);
  const sub = 3;
  const h = dtS / sub;
  for (let i = 0; i < n; i++) {
    const o = out[i] || (out[i] = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0 });
    o.x = tmp.p.x;
    o.y = tmp.p.y;
    o.z = tmp.p.z;
    o.vx = tmp.v.x;
    o.vy = tmp.v.y;
    o.vz = tmp.v.z;
    o.t = i * dtS;
    if (!b.held && !b.fixed) for (let k = 0; k < sub; k++) integrate(tmp, h, env, false, 0);
  }
  return out;
}

// ------------------------------------------------------------ solucionadores de chute

// Tabela de rolagem: distância e tempo para a bola rasteira desacelerar.
export function buildRollTable(env) {
  const vmax = 42;
  const dv = 0.25;
  const n = Math.round(vmax / dv) + 1;
  const D = new Float32Array(n); // distância percorrida desde vmax até v
  const T = new Float32Array(n);
  let v = vmax;
  let s = 0;
  let t = 0;
  const h = 1 / 240;
  const kq = (0.5 * env.rho * B.A) / B.m;
  let idx = n - 1;
  D[idx] = 0;
  T[idx] = 0;
  while (v > 0 && idx > 0) {
    const a = kq * cdOf(v) * v * v + env.rollMu * G + env.rollLin * v;
    const nv = v - a * h;
    s += v * h;
    t += h;
    while (idx > 0 && nv <= (idx - 1) * dv) {
      idx--;
      D[idx] = s;
      T[idx] = t;
    }
    v = nv;
  }
  for (let i = idx - 1; i >= 0; i--) {
    D[i] = s;
    T[i] = t;
  }
  return { D, T, dv, n, vmax };
}

function sampleTable(arr, tb, v) {
  const f = clamp(v / tb.dv, 0, tb.n - 1);
  const i = Math.floor(f);
  const j = Math.min(tb.n - 1, i + 1);
  return arr[i] + (arr[j] - arr[i]) * (f - i);
}

// Velocidade inicial para a bola rasteira percorrer d e chegar com va.
export function groundPassSpeed(tb, d, va) {
  const target = sampleTable(tb.D, tb, va) - d;
  if (target <= 0) return tb.vmax;
  // D decresce com v: busca binária
  let lo = va;
  let hi = tb.vmax;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (sampleTable(tb.D, tb, mid) > target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// Tempo para a bola rasteira ir de v0 até percorrer d (ou Infinity se parar antes).
export function groundTravelTime(tb, v0, d) {
  const d0 = sampleTable(tb.D, tb, v0);
  const dEnd = sampleTable(tb.D, tb, 0);
  if (d0 + d > dEnd) return Infinity;
  // acha v em que D(v) = d0 + d
  let lo = 0;
  let hi = v0;
  const target = d0 + d;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (sampleTable(tb.D, tb, mid) > target) lo = mid;
    else hi = mid;
  }
  return sampleTable(tb.T, tb, lo) - sampleTable(tb.T, tb, v0);
}

// Converte rotação local (lateral, para trás, por cima) para o mundo, dada a direção do chute.
function spinWorld(dirx, dirz, local, out) {
  // rolar para a frente (topspin) gira em torno de (dirz, 0, -dirx);
  // backspin (back > 0) é o oposto; side gira em torno do eixo vertical
  const back = local.back || 0;
  const side = local.side || 0;
  out.x = -dirz * back;
  out.y = side;
  out.z = dirx * back;
  return out;
}

const simB = { p: { x: 0, y: 0, z: 0 }, v: { x: 0, y: 0, z: 0 }, w: { x: 0, y: 0, z: 0 }, events: [], seed: 0 };

function simulateTo(from, vel, spin, env, tx, tz, horiz, maxT) {
  simB.p.x = from.x;
  simB.p.y = from.y;
  simB.p.z = from.z;
  simB.v.x = vel.x;
  simB.v.y = vel.y;
  simB.v.z = vel.z;
  simB.w.x = spin.x;
  simB.w.y = spin.y;
  simB.w.z = spin.z;
  simB.events.length = 0;
  const h = 1 / 120;
  const dx = tx - from.x;
  const dz = tz - from.z;
  const dl = Math.hypot(dx, dz) || 1;
  const ux = dx / dl;
  const uz = dz / dl;
  let t = 0;
  let lastAlong = 0;
  let lx = simB.p.x;
  let ly = simB.p.y;
  let lz = simB.p.z;
  while (t < maxT) {
    lx = simB.p.x;
    ly = simB.p.y;
    lz = simB.p.z;
    integrate(simB, h, env, false, t);
    t += h;
    const along = (simB.p.x - from.x) * ux + (simB.p.z - from.z) * uz;
    if (along >= horiz) {
      // interpola o cruzamento
      const f = (horiz - lastAlong) / Math.max(1e-6, along - lastAlong);
      return {
        x: lx + (simB.p.x - lx) * f,
        y: ly + (simB.p.y - ly) * f,
        z: lz + (simB.p.z - lz) * f,
        t: t - h + h * f,
        reached: true,
      };
    }
    if (along < lastAlong - 0.01 && t > 0.3) break;
    lastAlong = along;
  }
  return { x: simB.p.x, y: simB.p.y, z: simB.p.z, t, reached: false, along: lastAlong };
}

// Chute forte (velocidade dada): acha direção e elevação para passar por target.
export function solveDrive(from, target, speed, spinLocal, env) {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const horiz = Math.hypot(dx, dz);
  let yaw = Math.atan2(dz, dx);
  let pitch = Math.atan2(target.y - from.y + 0.5 * 9.81 * (horiz / speed) ** 2, horiz);
  const spin = { x: 0, y: 0, z: 0 };
  const vel = { x: 0, y: 0, z: 0 };
  let best = null;
  for (let it = 0; it < 7; it++) {
    const cp = Math.cos(pitch);
    vel.x = Math.cos(yaw) * cp * speed;
    vel.z = Math.sin(yaw) * cp * speed;
    vel.y = Math.sin(pitch) * speed;
    spinWorld(Math.cos(yaw), Math.sin(yaw), spinLocal, spin);
    const r = simulateTo(from, vel, spin, env, target.x, target.z, horiz, 4);
    if (!r.reached) {
      pitch += 0.08;
      continue;
    }
    // erro lateral (perpendicular à linha alvo) e vertical
    const ux = dx / horiz;
    const uz = dz / horiz;
    const lat = (r.x - target.x) * -uz + (r.z - target.z) * ux;
    const vert = r.y - target.y;
    best = { vx: vel.x, vy: vel.y, vz: vel.z, wx: spin.x, wy: spin.y, wz: spin.z, t: r.t };
    if (Math.abs(lat) < 0.03 && Math.abs(vert) < 0.03) break;
    yaw -= lat / horiz;
    pitch -= (vert / horiz) * 0.9;
    pitch = clamp(pitch, -0.3, 1.2);
  }
  if (!best) {
    const cp = Math.cos(pitch);
    spinWorld(Math.cos(yaw), Math.sin(yaw), spinLocal, spin);
    best = { vx: Math.cos(yaw) * cp * speed, vy: Math.sin(pitch) * speed, vz: Math.sin(yaw) * cp * speed, wx: spin.x, wy: spin.y, wz: spin.z, t: horiz / speed };
  }
  return best;
}

// Bola alta com ângulo de saída dado: acha velocidade e direção para cair em target.
export function solveLob(from, target, pitch, spinLocal, env) {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const horiz = Math.max(0.5, Math.hypot(dx, dz));
  let yaw = Math.atan2(dz, dx);
  let speed = Math.sqrt((9.81 * horiz) / Math.max(0.2, Math.sin(2 * pitch))) * 1.08;
  const spin = { x: 0, y: 0, z: 0 };
  const vel = { x: 0, y: 0, z: 0 };
  let best = null;
  for (let it = 0; it < 8; it++) {
    const cp = Math.cos(pitch);
    vel.x = Math.cos(yaw) * cp * speed;
    vel.z = Math.sin(yaw) * cp * speed;
    vel.y = Math.sin(pitch) * speed;
    spinWorld(Math.cos(yaw), Math.sin(yaw), spinLocal, spin);
    // simula até a bola descer à altura do alvo
    simB.p.x = from.x;
    simB.p.y = from.y;
    simB.p.z = from.z;
    simB.v.x = vel.x;
    simB.v.y = vel.y;
    simB.v.z = vel.z;
    simB.w.x = spin.x;
    simB.w.y = spin.y;
    simB.w.z = spin.z;
    const h = 1 / 120;
    let t = 0;
    let up = true;
    while (t < 6) {
      integrate(simB, h, env, false, t);
      t += h;
      if (simB.v.y < 0) up = false;
      if (!up && simB.p.y <= Math.max(B.r + 0.01, target.y)) break;
    }
    const ax = simB.p.x - from.x;
    const az = simB.p.z - from.z;
    const along = (ax * dx + az * dz) / horiz;
    const lat = (ax * -dz + az * dx) / horiz;
    best = { vx: vel.x, vy: vel.y, vz: vel.z, wx: spin.x, wy: spin.y, wz: spin.z, t };
    if (Math.abs(along - horiz) < 0.08 && Math.abs(lat) < 0.08) break;
    speed *= clamp(Math.sqrt(horiz / Math.max(0.3, along)), 0.7, 1.4);
    speed = clamp(speed, 3, 40);
    yaw -= lat / horiz;
  }
  return best;
}
