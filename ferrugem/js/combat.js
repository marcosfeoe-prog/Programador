// Combate: raio que testa cenário, inimigos e projéteis; interseções raio-esfera e
// raio-cápsula; explosões com dano em área.
import { clamp } from './util.js';

const _wh = {};
const RES = { kind: '', t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, mat: '', owner: null, collider: null, enemy: null, part: '', proj: null };

export function raySphere(o, d, c, r) {
  const ox = o.x - c.x,
    oy = o.y - c.y,
    oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const h = b * b - cc;
  if (h < 0) return -1;
  const t = -b - Math.sqrt(h);
  if (t >= 0) return t;
  return cc < 0 ? 0 : -1;
}

// Inigo Quilez: interseção raio-cápsula (segmento a-b, raio r).
export function rayCapsule(o, d, a, b, r) {
  const bax = b.x - a.x,
    bay = b.y - a.y,
    baz = b.z - a.z;
  const oax = o.x - a.x,
    oay = o.y - a.y,
    oaz = o.z - a.z;
  const baba = bax * bax + bay * bay + baz * baz;
  if (baba < 1e-9) return raySphere(o, d, a, r);
  const bard = bax * d.x + bay * d.y + baz * d.z;
  const baoa = bax * oax + bay * oay + baz * oaz;
  const rdoa = d.x * oax + d.y * oay + d.z * oaz;
  const oaoa = oax * oax + oay * oay + oaz * oaz;
  const A = baba - bard * bard;
  const B = baba * rdoa - baoa * bard;
  const C = baba * oaoa - baoa * baoa - r * r * baba;
  if (Math.abs(A) < 1e-9) {
    const t1 = raySphere(o, d, a, r),
      t2 = raySphere(o, d, b, r);
    if (t1 < 0) return t2;
    if (t2 < 0) return t1;
    return Math.min(t1, t2);
  }
  const h = B * B - A * C;
  if (h < 0) return -1;
  const t = (-B - Math.sqrt(h)) / A;
  const y = baoa + t * bard;
  if (y > 0 && y < baba) return t >= 0 ? t : -1;
  const ocx = y <= 0 ? oax : o.x - b.x,
    ocy = y <= 0 ? oay : o.y - b.y,
    ocz = y <= 0 ? oaz : o.z - b.z;
  const bb = d.x * ocx + d.y * ocy + d.z * ocz;
  const c2 = ocx * ocx + ocy * ocy + ocz * ocz - r * r;
  const h2 = bb * bb - c2;
  if (h2 > 0) {
    const t2 = -bb - Math.sqrt(h2);
    if (t2 >= 0) return t2;
  }
  return -1;
}

/*
 Raio contra tudo que pode ser atingido. Retorna um objeto reaproveitado (copie o que
 precisar antes do próximo raio). kind: 'world' | 'object' | 'enemy' | 'proj'.
*/
export function raycastAll(G, o, d, maxDist, mode = 'bullet') {
  let best = null;
  let bestT = maxDist;
  const wh = G.col.raycast(o, d, maxDist, mode, _wh);
  if (wh) {
    bestT = wh.t;
    best = RES;
    RES.kind = wh.collider && wh.collider.owner ? 'object' : 'world';
    RES.t = wh.t;
    RES.nx = wh.nx;
    RES.ny = wh.ny;
    RES.nz = wh.nz;
    RES.mat = wh.mat;
    RES.owner = wh.collider ? wh.collider.owner : null;
    RES.collider = wh.collider;
  }
  if (G.enemies) {
    const eh = G.enemies.raycast(o, d, bestT);
    if (eh) {
      bestT = eh.t;
      best = RES;
      RES.kind = 'enemy';
      RES.t = eh.t;
      RES.enemy = eh.enemy;
      RES.part = eh.part;
      RES.nx = -d.x;
      RES.ny = -d.y;
      RES.nz = -d.z;
      RES.mat = 'flesh';
      RES.owner = null;
    }
  }
  if (G.proj) {
    const ph = G.proj.raycast(o, d, bestT);
    if (ph) {
      bestT = ph.t;
      best = RES;
      RES.kind = 'proj';
      RES.t = ph.t;
      RES.proj = ph.proj;
      RES.nx = -d.x;
      RES.ny = -d.y;
      RES.nz = -d.z;
      RES.mat = 'metal';
      RES.owner = null;
    }
  }
  if (!best) return null;
  RES.x = o.x + d.x * RES.t;
  RES.y = o.y + d.y * RES.t;
  RES.z = o.z + d.z * RES.t;
  if (RES.kind !== 'enemy') RES.enemy = null;
  if (RES.kind !== 'proj') RES.proj = null;
  return RES;
}

// Explosão: dano em área (inimigos, jogador, barris e caixas), efeitos e barulho.
export function explode(G, x, y, z, radius = 5, dmg = 150, playerDmg = 45) {
  G.fx.explosion({ x, y, z }, radius);
  if (G.audio) G.audio.explosion({ x, z });
  const P = G.player;
  const pd = Math.hypot(P.pos.x - x, P.pos.z - z);
  G.fx.shake(clamp(1.1 - pd / 22, 0, 0.9));
  const blocked = (tx, ty, tz) => !G.col.clear(x, y + 0.6, z, tx, ty, tz, 'bullet');
  for (const e of G.enemies.list) {
    if (!e.alive) continue;
    const dx = e.pos.x - x,
      dz = e.pos.z - z;
    const d = Math.hypot(dx, dz);
    const rr = radius + e.radius;
    if (d > rr) continue;
    let k = 1 - (d / rr) * 0.6;
    if (blocked(e.pos.x, e.pos.y + 1, e.pos.z)) k *= 0.3;
    const inv = d > 0.01 ? 1 / d : 0;
    e.onExplosion(dmg * k, { x: dx * inv, y: 0, z: dz * inv });
  }
  if (!P.dead && pd < radius) {
    let k = 1 - pd / radius;
    if (blocked(P.pos.x, P.pos.y + 1.2, P.pos.z)) k *= 0.3;
    P.takeDamage(playerDmg * (0.35 + 0.65 * k), { x, z }, { knockdown: pd < radius * 0.55, raw: true });
  }
  G.level.explosionAt(x, z, radius);
  G.enemies.noise(x, z, 45);
}
