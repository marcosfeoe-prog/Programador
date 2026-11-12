// Funções matemáticas pequenas usadas em todo o jogo.

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const sat = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => (x - a) / (b - a);
export const remap = (x, a, b, c, d) => c + ((x - a) / (b - a)) * (d - c);
export const remapC = (x, a, b, c, d) => c + sat((x - a) / (b - a)) * (d - c);
export function smoothstep(a, b, x) {
  const t = sat((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
// Suavização exponencial independente da taxa de quadros.
export const damp = (a, b, rate, dt) => b + (a - b) * Math.exp(-rate * dt);
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

export function dampAngle(a, b, rate, dt) {
  return a + wrapAngle(b - a) * (1 - Math.exp(-rate * dt));
}

export function len2(x, z) {
  return Math.sqrt(x * x + z * z);
}

// Distância de um ponto a um segmento (2D) e parâmetro t da projeção.
export function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz || 1e-9;
  let t = ((px - ax) * dx + (pz - az) * dz) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t - px;
  const qz = az + dz * t - pz;
  return { d: Math.sqrt(qx * qx + qz * qz), t };
}

// Rumo (0 = norte, 90 = leste) a partir de um vetor no plano XZ (−z = norte).
export function bearingDeg(dx, dz) {
  let b = (Math.atan2(dx, -dz) * 180) / Math.PI;
  if (b < 0) b += 360;
  return b;
}

const DIRS = ['N', 'NNE', 'NE', 'ENE', 'L', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
export function compass(b) {
  return DIRS[Math.round(b / 22.5) % 16];
}

export function fmtDist(m) {
  if (m < 950) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(m < 9950 ? 1 : 0)} km`;
}

export function fmtMoney(v) {
  const s = Math.round(Math.abs(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (v < 0 ? '−$ ' : '$ ') + s;
}

export function fmtClock(sec) {
  const s = ((sec % 86400) + 86400) % 86400;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function fmtDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m > 0 ? `${m} min ${String(s).padStart(2, '0')} s` : `${s} s`;
}

// Ponto dentro de polígono (lista de [x, z]).
export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const zi = poly[i][1];
    const xj = poly[j][0];
    const zj = poly[j][1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}
