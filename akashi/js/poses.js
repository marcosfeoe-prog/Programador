// Biblioteca de poses e ciclos de animação. Uma pose é um objeto de ângulos
// em graus (chaves descritas em Character.applyPose); ciclos (andar, correr,
// comer…) são funções do tempo. mix() mistura poses para transições.
import { clamp, lerp, smooth, easeOut, easeIn, range } from './util.js';

const S = Math.sin;
const C = Math.cos;

export function mix(a, b, w) {
  if (w <= 0) return a;
  if (w >= 1) return b;
  const out = {};
  for (const k in a) out[k] = typeof a[k] === 'number' ? a[k] * (1 - w) + (b[k] ?? 0) * w : a[k];
  for (const k in b) if (!(k in a)) out[k] = typeof b[k] === 'number' ? b[k] * w : b[k];
  return out;
}

// Soma camadas (ângulos aditivos sobre uma base).
export function add(base, ...layers) {
  const out = { ...base };
  for (const l of layers) for (const k in l) out[k] = typeof l[k] === 'number' ? (out[k] || 0) + l[k] : l[k];
  return out;
}

// Sequência de poses no tempo: keys = [[t, pose], ...] com transição suave.
export function seq(t, keys, blend = 0.25) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t < keys[i][0]) {
      const a = keys[i - 1];
      const b = keys[i];
      const bl = Math.min(blend, b[0] - a[0]);
      const w = smooth((t - (b[0] - bl)) / bl);
      const pa = typeof a[1] === 'function' ? a[1](t - a[0]) : a[1];
      if (w <= 0) return pa;
      const pb = typeof b[1] === 'function' ? b[1](0) : b[1];
      return mix(pa, pb, w);
    }
  }
  const last = keys[keys.length - 1];
  return typeof last[1] === 'function' ? last[1](t - last[0]) : last[1];
}

export const P = {
  stand: { lsZ: 2, rsZ: 2, leX: 8, reX: 8, lhZ: 1.5, rhZ: 1.5 },

  idle(t, k = 1) {
    const b = S(t * 1.6);
    return { chX: b * 1.2 * k, spX: -b * 0.6 * k, lsZ: 3 + b * 1.5, rsZ: 3 + b * 1.5, leX: 10, reX: 10, lhZ: 2, rhZ: 2, hdX: -b * 0.8 };
  },

  // Postura do delinquente: mãos nos bolsos, ombros caídos, queixo erguido.
  pockets(t = 0) {
    const b = S(t * 1.4);
    return {
      lsX: -14,
      lsZ: 14,
      lsY: -15,
      leX: 38,
      rsX: -14,
      rsZ: 14,
      rsY: -15,
      reX: 38,
      lFist: 1,
      rFist: 1,
      chX: -3 + b,
      spX: 4,
      hdX: -6,
      hdZ: 3,
      lhZ: 4,
      rhZ: 4,
      lhY: -6,
      rhY: -6,
    };
  },

  // Mochila no ombro (mão direita segurando a alça atrás da cabeça).
  bagShoulder(base) {
    return { ...base, rsX: 160, rsZ: 6, rsY: -10, reX: 132, rFist: 1 };
  },

  walk(t, speed = 1, amp = 1) {
    const p = t * Math.PI * 2 * 0.95 * speed;
    const s = S(p);
    const c = C(p);
    const kneeL = 6 + 42 * Math.pow(Math.max(0, C(p + 0.6)), 2);
    const kneeR = 6 + 42 * Math.pow(Math.max(0, C(p + Math.PI + 0.6)), 2);
    return {
      hipY: (C(2 * p) * 0.022 - 0.012) * amp,
      hipRY: 7 * s * amp,
      hipZ: 2.5 * c * amp,
      chY: -9 * s * amp,
      spX: 3,
      lhX: 27 * s * amp,
      rhX: -27 * s * amp,
      lkX: kneeL * amp,
      rkX: kneeR * amp,
      laX: (8 * c - 4) * amp,
      raX: (-8 * c - 4) * amp,
      lsX: -22 * s * amp,
      rsX: 22 * s * amp,
      lsZ: 5,
      rsZ: 5,
      leX: 14 + 10 * Math.max(0, -s) * amp,
      reX: 14 + 10 * Math.max(0, s) * amp,
      hdX: -1,
    };
  },

  // Andar gingado do delinquente (mãos nos bolsos).
  swagger(t, speed = 1) {
    const p = t * Math.PI * 2 * 0.8 * speed;
    const s = S(p);
    const c = C(p);
    const w = P.walk(t, 0.8 * speed, 1.05);
    return {
      ...w,
      ...P.pockets(t),
      hipY: w.hipY,
      lhX: w.lhX,
      rhX: w.rhX,
      lkX: w.lkX,
      rkX: w.rkX,
      laX: w.laX,
      raX: w.raX,
      hipRY: 9 * s,
      chY: -13 * s,
      chZ: 4 * c,
      hipZ: 3 * c,
      lhZ: 5,
      rhZ: 5,
      hdZ: 3 - 3 * c,
      hdY: 5 * s,
      hdX: -6,
      spX: 5,
    };
  },

  run(t, speed = 1, amp = 1) {
    const p = t * Math.PI * 2 * 1.45 * speed;
    const s = S(p);
    const c = C(p);
    return {
      hipY: (Math.abs(C(p)) * 0.05 - 0.06) * amp,
      hipX: 6 * amp,
      spX: 12 * amp,
      chX: 4,
      hipRY: 10 * s,
      chY: -14 * s,
      lhX: 50 * s * amp - 5,
      rhX: -50 * s * amp - 5,
      lkX: 15 + 75 * Math.pow(Math.max(0, C(p + 0.9)), 1.5) * amp,
      rkX: 15 + 75 * Math.pow(Math.max(0, C(p + Math.PI + 0.9)), 1.5) * amp,
      laX: 10 * c,
      raX: -10 * c,
      lsX: -50 * s * amp,
      rsX: 50 * s * amp,
      lsZ: 10,
      rsZ: 10,
      leX: 85,
      reX: 85,
      lFist: 1,
      rFist: 1,
      hdX: -8,
    };
  },

  sitChair(t = 0) {
    const b = S(t * 1.5);
    return {
      hipY: -0.43,
      lhX: 88,
      rhX: 88,
      lkX: 88,
      rkX: 88,
      laX: 0,
      raX: 0,
      lhZ: 5,
      rhZ: 5,
      spX: 6 + b,
      lsX: 30,
      rsX: 30,
      leX: 55,
      reX: 55,
      lsZ: 8,
      rsZ: 8,
    };
  },

  // Sentado à carteira com o queixo apoiado na mão, olhando a janela.
  sitChin(t = 0) {
    return { ...P.sitChair(t), spX: 14, chX: 8, lsX: 62, lsZ: 6, leX: 140, lsY: -10, lFist: 1, hdZ: 10, hdX: 4, rsX: 40, reX: 70 };
  },

  // Sentado no chão de pernas cruzadas.
  sitFloor(t = 0) {
    const b = S(t * 1.4);
    return {
      hipY: -0.84,
      lhX: 72,
      rhX: 72,
      lhZ: 38,
      rhZ: 38,
      lhY: 35,
      rhY: 35,
      lkX: 140,
      rkX: 140,
      laX: 30,
      raX: 30,
      spX: 8 + b,
      chX: 2,
      lsX: 25,
      rsX: 25,
      leX: 50,
      reX: 50,
      lsZ: 10,
      rsZ: 10,
    };
  },

  // Sentado no chão encostado (pernas esticadas, uma dobrada).
  sitLean(t = 0) {
    const b = S(t * 1.2);
    return {
      hipY: -0.83,
      lhX: 80,
      rhX: 70,
      lkX: 10,
      rkX: 70,
      lhZ: 6,
      rhZ: 12,
      spX: -12 + b,
      chX: -4,
      lsX: 10,
      lsZ: 20,
      leX: 20,
      rsX: 40,
      rsZ: 14,
      reX: 40,
      hdX: -4,
    };
  },

  // Comendo sentado: marmita na mão esquerda, hashi na direita indo à boca.
  eat(t, sitting = true, bite = 1) {
    const base = sitting ? P.sitFloor(t) : P.stand;
    const cyc = (t * 0.55) % 1;
    const up = bite ? smooth(range(cyc, 0.1, 0.35)) * (1 - smooth(range(cyc, 0.55, 0.8))) : 0;
    return {
      ...base,
      lsX: 42,
      lsZ: 4,
      lsY: -30,
      leX: 88,
      lwX: 10,
      rsX: 38 + up * 30,
      rsZ: 18 - up * 10,
      rsY: -10,
      reX: 95 + up * 45,
      rwX: 10,
      hdX: 6 - up * 10,
      spX: (base.spX || 0) + 3,
    };
  },

  bow(k = 1) {
    return { spX: 32 * k, chX: 12 * k, hdX: 10 * k, lsX: 8 * k, rsX: 8 * k, lsZ: -3, rsZ: -3, leX: 10, reX: 10, hipY: -0.01 * k };
  },

  // Mãos juntas na frente (tímida).
  shy(t = 0) {
    const b = S(t * 2);
    return {
      lsX: 22,
      lsZ: -6,
      lsY: -30,
      leX: 70,
      rsX: 22,
      rsZ: -6,
      rsY: -30,
      reX: 70,
      hdX: 8 + b * 2,
      hdZ: 6,
      lhZ: -2,
      rhZ: -2,
      lhY: 10,
      rhY: 10,
      lkX: 6,
      rkX: 10,
    };
  },

  // Oferecendo algo com as duas mãos.
  offer(k = 1) {
    return {
      lsX: 62 * k,
      lsZ: -6,
      lsY: -15,
      leX: 30 + 20 * (1 - k),
      rsX: 62 * k,
      rsZ: -6,
      rsY: -15,
      reX: 30 + 20 * (1 - k),
      spX: 8 * k,
      hdX: 12 * k,
      hdY: 0,
    };
  },

  crossArms(t = 0) {
    const b = S(t * 1.3);
    return {
      lsX: 48,
      lsZ: -10,
      lsY: -52,
      leX: 118,
      rsX: 52,
      rsZ: -12,
      rsY: -52,
      reX: 118,
      chX: -3 + b,
      hdX: -4,
      lhZ: 5,
      rhZ: 5,
      lFist: 1,
      rFist: 1,
    };
  },

  scared(t = 0) {
    const tr = S(t * 40) * 1.5;
    return {
      lsX: 55 + tr,
      lsZ: 22,
      lsY: -10,
      leX: 110,
      rsX: 55 - tr,
      rsZ: 22,
      rsY: -10,
      reX: 110,
      spX: -8,
      chX: -6,
      hdX: -4 + tr,
      lkX: 12,
      rkX: 12,
      hipY: -0.02,
      lhZ: -3,
      rhZ: -3,
    };
  },

  // Postura de luta (guarda alta).
  fight(t = 0, k = 1) {
    const b = S(t * 4) * 1.5;
    return {
      hipY: -0.06 * k,
      hipRY: -20 * k,
      chY: 12 * k,
      spX: 8 * k,
      lhX: 24 * k,
      rhX: -18 * k,
      lhZ: 10 * k,
      rhZ: 10 * k,
      lkX: 26 * k,
      rkX: 22 * k,
      laX: -6,
      lsX: 62 * k + b,
      lsZ: 12,
      lsY: -20,
      leX: 115 * k,
      rsX: 48 * k - b,
      rsZ: 20,
      rsY: -25,
      reX: 125 * k,
      lFist: 1,
      rFist: 1,
      hdX: 6 * k,
      hdY: 16 * k,
    };
  },

  // Soco de direita: u de 0 a 1 (preparação → golpe → recolhe).
  punchR(u, k = 1) {
    const f = P.fight(0, k);
    const wind = smooth(range(u, 0, 0.3));
    const hit = easeOut(range(u, 0.3, 0.42));
    const back = smooth(range(u, 0.7, 1));
    const ext = hit * (1 - back);
    return {
      ...f,
      rsX: lerp(lerp(f.rsX, 20, wind), 88, ext),
      rsZ: lerp(20, 4, ext),
      rsY: lerp(-25, 0, ext),
      reX: lerp(lerp(125, 140, wind), 4, ext),
      chY: lerp(f.chY + 18 * wind, -28, ext),
      hipRY: lerp(f.hipRY - 6 * wind, 18, ext),
      spX: f.spX + 8 * ext,
      rhX: f.rhX - 10 * ext,
      lsX: f.lsX - 20 * ext,
      leX: f.leX + 10 * ext,
      hdY: f.hdY - 20 * ext,
    };
  },

  punchL(u, k = 1) {
    const f = P.fight(0, k);
    const wind = smooth(range(u, 0, 0.25));
    const ext = easeOut(range(u, 0.25, 0.38)) * (1 - smooth(range(u, 0.65, 1)));
    return {
      ...f,
      lsX: lerp(lerp(f.lsX, 40, wind), 90, ext),
      lsZ: lerp(12, 2, ext),
      lsY: lerp(-20, 0, ext),
      leX: lerp(115, 4, ext),
      chY: lerp(f.chY, 30, ext),
      hipRY: f.hipRY + 10 * ext,
    };
  },

  // Gancho de baixo para cima (uppercut).
  uppercut(u) {
    const f = P.fight(0, 1);
    const wind = smooth(range(u, 0, 0.35));
    const ext = easeOut(range(u, 0.35, 0.5)) * (1 - smooth(range(u, 0.8, 1)));
    return {
      ...f,
      hipY: lerp(-0.14 * wind, 0.04, ext),
      lkX: lerp(26 + 30 * wind, 5, ext),
      rkX: lerp(22 + 30 * wind, 5, ext),
      rsX: lerp(lerp(48, 0, wind), 165, ext),
      rsZ: lerp(20, 8, ext),
      reX: lerp(lerp(125, 100, wind), 40, ext),
      chY: lerp(f.chY + 15 * wind, -20, ext),
      spX: lerp(20 * wind, -18, ext),
      hdX: lerp(10, -20, ext),
    };
  },

  // Chute alto de lado (perna direita).
  kick(u) {
    const f = P.fight(0, 1);
    const ext = easeOut(range(u, 0.15, 0.4)) * (1 - smooth(range(u, 0.7, 1)));
    return {
      ...f,
      hipZ: 28 * ext,
      spZ: 14 * ext,
      rhZ: 80 * ext + 10,
      rhX: lerp(f.rhX, 10, ext),
      rkX: lerp(70, 8, smooth(range(u, 0.2, 0.42))) * (u < 0.7 ? 1 : 1 - smooth(range(u, 0.7, 1))) + 0,
      lkX: 15,
      hipY: -0.04,
      lsX: 40,
      lsZ: 40,
      rsX: 30,
      rsZ: 30,
      hdZ: -14 * ext,
    };
  },

  headbutt(u) {
    const k = easeOut(range(u, 0.3, 0.45)) * (1 - smooth(range(u, 0.6, 1)));
    const w = smooth(range(u, 0, 0.3)) * (1 - k);
    return { spX: -15 * w + 30 * k, chX: -10 * w + 18 * k, hdX: -10 * w + 25 * k, lsX: 30, rsX: 30, leX: 60, reX: 60, lFist: 1, rFist: 1 };
  },

  // Recebendo um golpe (cabeça e tronco jogados para trás).
  hit(u, k = 1) {
    const a = easeOut(range(u, 0, 0.25)) * (1 - smooth(range(u, 0.6, 1)) * 0.5);
    return {
      spX: -25 * a * k,
      chX: -15 * a * k,
      hdX: -25 * a * k,
      hdZ: 10 * a,
      lsX: 30 * a,
      lsZ: 45 * a,
      rsX: 35 * a,
      rsZ: 40 * a,
      leX: 40,
      reX: 30,
      lhX: 10 * a,
      rhX: -10 * a,
      lkX: 15 * a,
    };
  },

  // Dobrado de dor (soco no estômago).
  doubled(u) {
    const a = easeOut(range(u, 0, 0.3));
    return { spX: 40 * a, chX: 25 * a, hdX: 20 * a, hipY: -0.08 * a, lkX: 25 * a, rkX: 25 * a, lhX: 20 * a, rhX: 20 * a, lsX: 50 * a, rsX: 50 * a, leX: 80, reX: 80, lsZ: -10, rsZ: -10 };
  },

  // Deitado (use com root.rotation.x = -90° e y ≈ 0.13).
  lying(t = 0) {
    const b = S(t * 1.3) * 2;
    return { lsZ: 40 + b, rsZ: 30 - b, lsX: 10, rsX: -10, leX: 30, reX: 20, lhZ: 12, rhZ: 8, lkX: 10, rkX: 25, hdY: 25, hdX: -5 };
  },

  // Caído sentado no chão, apoiado nas mãos (assustado).
  sitBack(t = 0) {
    const tr = S(t * 30);
    return {
      hipY: -0.8,
      lhX: 70,
      rhX: 60,
      lkX: 60,
      rkX: 40,
      lhZ: 15,
      rhZ: 12,
      spX: -25,
      chX: -5,
      lsX: -40,
      lsZ: 15,
      rsX: -40,
      rsZ: 15,
      leX: 5,
      reX: 5,
      hdX: 10 + tr,
    };
  },

  // Encurralado contra a parede (encolhido).
  cower(t = 0) {
    const tr = S(t * 35);
    return { spX: 14, chX: 8, hdX: 16 + tr, hipY: -0.06, lkX: 22, rkX: 22, lhX: 10, rhX: 10, lsX: 40, lsZ: -8, lsY: -40, leX: 125, rsX: 40, rsZ: -8, rsY: -40, reX: 125, lFist: 1, rFist: 1 };
  },

  // Mão na parede ao lado da vítima (braço direito esticado à frente).
  wallSlam(t = 0) {
    return { rsX: 88, rsZ: 12, reX: 12, spX: 12, chX: 6, hdX: 8, lsX: -10, lsZ: 14, leX: 35, lFist: 1, lhZ: 6, rhZ: 6, lhX: 10, rhX: -12 };
  },

  point(k = 1) {
    return { rsX: 82 * k, rsZ: 8, reX: 6, rFist: 0, chY: -10 * k, hdY: 0 };
  },

  // Estalando os dedos na frente do peito.
  knuckles(t = 0) {
    const w = S(t * 9) * 4;
    return {
      lsX: 68,
      lsZ: -22,
      lsY: -28,
      leX: 108 + w,
      rsX: 68,
      rsZ: -22,
      rsY: -28,
      reX: 108 - w,
      lFist: 1,
      rFist: 0.6,
      chX: -4,
      hdX: 4,
      lhZ: 6,
      rhZ: 6,
    };
  },

  // Mão erguida segurando algo à frente do rosto (olhar o punho, segurar corrente).
  lookFist(k = 1) {
    return { rsX: 70 * k, rsZ: -5, rsY: -30, reX: 110 * k, rFist: 1, hdX: 10, lsX: -5, lsZ: 10, leX: 20 };
  },

  // Mãos para cima (susto, rendição).
  handsUp(t = 0) {
    const tr = S(t * 30) * 2;
    return { lsX: 150 + tr, lsZ: 20, leX: 40, rsX: 150 - tr, rsZ: 20, reX: 40, spX: -6, hdX: -4 };
  },

  facepalm() {
    return { rsX: 100, rsZ: -20, rsY: -40, reX: 135, hdX: 18, spX: 6, lsX: 0, lsZ: 6 };
  },

  wave(t) {
    return { rsX: 0, rsZ: 150, reX: 30 + S(t * 12) * 25, rsY: 0, hdZ: -5 };
  },

  clap(k = 1) {
    return { lsX: 68 * k, lsZ: -20 * k, lsY: -25, leX: 70 * k, rsX: 68 * k, rsZ: -20 * k, rsY: -25, reX: 70 * k, hdX: 8 };
  },

  // Segurando um objeto na frente com as duas mãos (cano, taco, caixa).
  holdFront(k = 1) {
    return { lsX: 35 * k, lsZ: -4, lsY: -20, leX: 60 * k, rsX: 35 * k, rsZ: -4, rsY: -20, reX: 60 * k, lFist: 1, rFist: 1 };
  },

  // Cano/taco erguido acima da cabeça com as duas mãos.
  overhead(u) {
    const up = smooth(range(u, 0, 0.5));
    const down = easeIn(range(u, 0.55, 0.7));
    const a = up * (1 - down);
    return {
      lsX: lerp(40, 170, a) + down * 20,
      rsX: lerp(40, 170, a) + down * 20,
      lsZ: -8,
      rsZ: -8,
      leX: lerp(60, 50, a),
      reX: lerp(60, 50, a),
      lFist: 1,
      rFist: 1,
      spX: lerp(0, -16, a) + down * 30,
      chX: lerp(0, -8, a) + down * 10,
      lhX: 18,
      rhX: -16,
      lkX: 14,
      rkX: 10,
    };
  },

  // Correndo com o braço esticado para alcançar algo.
  reach(k = 1) {
    return { rsX: 75 * k, rsZ: 4, reX: 10, rFist: 0, spX: 6, hdX: -4 };
  },
};

// Caminhada até um ponto: devolve posição e direção ao longo de uma polilinha.
export function along(path, dist) {
  let d = Math.max(0, dist);
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1];
    const [bx, bz] = path[i];
    const L = Math.hypot(bx - ax, bz - az);
    if (d <= L || i === path.length - 1) {
      const u = clamp(d / L, 0, 1);
      return { x: ax + (bx - ax) * u, z: az + (bz - az) * u, rot: Math.atan2(bx - ax, bz - az), done: d >= L && i === path.length - 1 };
    }
    d -= L;
  }
  const [x, z] = path[path.length - 1];
  return { x, z, rot: 0, done: true };
}
