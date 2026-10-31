// Funções geométricas do campo usadas pela IA, pelas regras e pelas estatísticas.
import { PITCH as P } from './constants.js';

// Ângulo visível do gol a partir de (x, z), gol em goalX.
export function goalAngle(x, z, goalX) {
  const dx = Math.abs(goalX - x);
  const a1 = Math.atan2(z - P.goalW / 2, dx);
  const a2 = Math.atan2(z + P.goalW / 2, dx);
  return Math.abs(a2 - a1);
}

// Gols esperados (xG) aproximados de uma finalização sem bloqueio.
export function xgAt(x, z, goalX) {
  const dx = Math.abs(goalX - x);
  const d = Math.hypot(dx, z);
  const ang = goalAngle(x, z, goalX);
  return 1 / (1 + Math.exp(-(-2.6 + 3.6 * ang - 0.045 * d)));
}

export function inBox(x, z, goalX) {
  return Math.abs(goalX - x) <= P.boxD && Math.abs(z) <= P.boxW / 2 && Math.sign(x) === Math.sign(goalX);
}
export function inSix(x, z, goalX) {
  return Math.abs(goalX - x) <= P.sixD && Math.abs(z) <= P.sixW / 2 && Math.sign(x) === Math.sign(goalX);
}

// Distância de um ponto (px,pz) ao segmento (ax,az)-(bx,bz) e parâmetro t.
export function segDist(px, pz, ax, az, bx, bz) {
  const sx = bx - ax;
  const sz = bz - az;
  const ll = sx * sx + sz * sz || 1e-9;
  let t = ((px - ax) * sx + (pz - az) * sz) / ll;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + sx * t;
  const cz = az + sz * t;
  return { d: Math.hypot(px - cx, pz - cz), t, cx, cz };
}

export function inPitch(x, z, m = 0) {
  return Math.abs(x) <= P.HL - m && Math.abs(z) <= P.HW - m;
}
