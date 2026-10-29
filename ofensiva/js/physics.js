// Movimento estilo motor Source (aceleração, atrito, controle no ar), colisão
// AABB contra o mapa e hitboxes (cabeça, peito, estômago, pernas).
import { lerp } from './util.js';
import { rayBox } from './map.js';

export const PHYS = {
  gravity: 20,
  jump: 7.55,
  accel: 5.5,
  airAccel: 12,
  airCap: 0.75,
  friction: 5.2,
  stopSpeed: 2.0,
  radius: 0.4,
  stand: 1.8,
  duck: 1.35,
  eyeStand: 1.64,
  eyeDuck: 1.18,
};

export const eyeHeight = (a) => lerp(PHYS.eyeStand, PHYS.eyeDuck, a.crouchT);
export const bodyHeight = (a) => lerp(PHYS.stand, PHYS.duck, a.crouchT);

function friction(v, dt) {
  const sp = Math.hypot(v.x, v.z);
  if (sp < 0.01) {
    v.x = v.z = 0;
    return;
  }
  const control = Math.max(sp, PHYS.stopSpeed);
  const drop = control * PHYS.friction * dt;
  const ns = Math.max(0, sp - drop) / sp;
  v.x *= ns;
  v.z *= ns;
}

function accelerate(v, wx, wz, wishSpeed, accel, dt, cap = Infinity) {
  const cur = v.x * wx + v.z * wz;
  const add = Math.min(wishSpeed, cap) - cur;
  if (add <= 0) return;
  const acc = Math.min(accel * dt * wishSpeed, add);
  v.x += acc * wx;
  v.z += acc * wz;
}

// wish: direção desejada no mundo (x, z) já normalizada ou zero; speed: m/s.
export function applyMovement(a, wishX, wishZ, wishSpeed, jump, dt) {
  const v = a.vel;
  if (a.onGround) {
    if (jump && a.jumpReady) {
      v.y = PHYS.jump;
      a.onGround = false;
      a.jumpReady = false;
      a.events.push('jump');
    } else friction(v, dt);
  }
  if (a.onGround) accelerate(v, wishX, wishZ, wishSpeed, PHYS.accel, dt);
  else accelerate(v, wishX, wishZ, wishSpeed, PHYS.airAccel, dt, PHYS.airCap);
  if (!jump) a.jumpReady = true;
}

const _solids = [];

function overlapping(map, a, h) {
  const r = PHYS.radius;
  const p = a.pos;
  map.solidsNear(p.x - r, p.y + 0.01, p.z - r, p.x + r, p.y + h, p.z + r, _solids);
  return _solids;
}

function stepAxis(map, a, axis, delta, h) {
  if (!delta) return;
  const r = PHYS.radius;
  const key = axis === 0 ? 'x' : 'z';
  a.pos[key] += delta;
  const solids = overlapping(map, a, h);
  for (const s of solids) {
    const mn = axis === 0 ? s[0] : s[2];
    const mx = axis === 0 ? s[3] : s[5];
    // ainda sobrepõe depois de ajustes anteriores?
    if (a.pos[key] + r <= mn || a.pos[key] - r >= mx) continue;
    // degrau baixo: sobe
    if (s[4] - a.pos.y <= 0.35 && a.onGround) {
      a.pos.y = s[4];
      continue;
    }
    if (delta > 0) a.pos[key] = mn - r - 1e-4;
    else a.pos[key] = mx + r + 1e-4;
    a.vel[key] = 0;
  }
}

export function moveActor(map, a, dt) {
  const h = bodyHeight(a);
  // subpassos para não atravessar quinas em quedas de FPS
  const steps = Math.max(1, Math.ceil((Math.hypot(a.vel.x, a.vel.z) * dt) / 0.25));
  const sdt = dt / steps;
  for (let i = 0; i < steps; i++) {
    stepAxis(map, a, 0, a.vel.x * sdt, h);
    stepAxis(map, a, 2, a.vel.z * sdt, h);
  }
  const wasGround = a.onGround;
  a.vel.y -= PHYS.gravity * dt;
  let ny = a.pos.y + a.vel.y * dt;
  const ground = map.groundAt(a.pos.x, a.pos.z, PHYS.radius - 0.02, a.pos.y);
  if (ny <= ground) {
    if (!wasGround && a.vel.y < -6) a.events.push('land');
    ny = ground;
    a.vel.y = 0;
    a.onGround = true;
  } else {
    a.onGround = false;
  }
  a.pos.y = ny;
}

// Resolve sobreposição (ex.: depois de empurrões entre jogadores).
export function pushOut(map, a) {
  const r = PHYS.radius;
  const solids = overlapping(map, a, bodyHeight(a));
  for (const s of solids) {
    const p = a.pos;
    if (p.x + r <= s[0] || p.x - r >= s[3] || p.z + r <= s[2] || p.z - r >= s[5]) continue;
    const dx1 = p.x + r - s[0];
    const dx2 = s[3] - (p.x - r);
    const dz1 = p.z + r - s[2];
    const dz2 = s[5] - (p.z - r);
    const m = Math.min(dx1, dx2, dz1, dz2);
    if (m === dx1) p.x -= dx1 + 1e-4;
    else if (m === dx2) p.x += dx2 + 1e-4;
    else if (m === dz1) p.z -= dz1 + 1e-4;
    else p.z += dz2 + 1e-4;
  }
}

// ------------------------------------------------------------ hitboxes
function raySphere(o, d, cx, cy, cz, r, maxT) {
  const ox = o.x - cx;
  const oy = o.y - cy;
  const oz = o.z - cz;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const c = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 0 && t < maxT ? t : null;
}

export function hitboxes(a) {
  const p = a.pos;
  const eye = p.y + eyeHeight(a);
  const hip = p.y + lerp(0.92, 0.55, a.crouchT);
  const fx = -Math.sin(a.yaw) * 0.03;
  const fz = -Math.cos(a.yaw) * 0.03;
  return {
    head: [p.x + fx, eye + 0.05, p.z + fz, 0.135],
    chest: [p.x - 0.23, hip + 0.22, p.z - 0.2, p.x + 0.23, eye - 0.12, p.z + 0.2],
    stomach: [p.x - 0.2, hip - 0.02, p.z - 0.18, p.x + 0.2, hip + 0.22, p.z + 0.18],
    legs: [p.x - 0.2, p.y, p.z - 0.17, p.x + 0.2, hip - 0.02, p.z + 0.17],
  };
}

// Raio contra o corpo de um ator: { t, group } ou null.
export function rayActor(o, d, a, maxT) {
  const hb = hitboxes(a);
  let best = null;
  const h = hb.head;
  const th = raySphere(o, d, h[0], h[1], h[2], h[3], maxT);
  if (th !== null) best = { t: th, group: 'head' };
  for (const g of ['chest', 'stomach', 'legs']) {
    const b = hb[g];
    const r = rayBox(o, d, [b[0], b[1], b[2]], [b[3], b[4], b[5]], best ? best.t : maxT);
    if (r) best = { t: r.t, group: g };
  }
  return best;
}
