// Cena 9 — A batalha debaixo do viaduto (7:05–8:50). A gangue do Ryuji prende a
// Hana na beira do rio. O Akashi aparece no alto da escada contra o pôr do
// sol, desce devagar e derruba os cinco: taco, chute giratório, cabeçada,
// gancho, corrente… o cano de ferro entorta na cabeça dele. "...É só isso?"
import * as THREE from 'three';
import { P, V, walk, kf, range, smooth, pulse, easeOut, easeIn, backOut, PI, add, mix, tremble, hash, clamp } from './kit.js';
import { VW, VH } from '../overlay.js';

const A0 = { x: -4.3, z: 8.6 };
const ROT_GANG = 2.28; // o Akashi olhando para a gangue
const STAIR_X = -6;
const stairY = (z) => clamp(4.5 - 0.714 * (17.79 - z), 0, 4.5);

const H0 = { x: -0.2, z: 4.6 };
const S0 = { x: 0.25, z: 4.3 };
const R0 = { x: -1.3, z: 5.5 };
const G0 = { x: -1.6, z: 7.2 };
const X10 = { x: -2.2, z: 6.5 };
const X20 = { x: -6.0, z: 10.7 };

const yaw = (ax, az, bx, bz) => Math.atan2(bx - ax, bz - az);

// Caído de costas no chão.
function ko(ch, x, z, rot, t = 0, expr = 'ko') {
  ch.place(x, z, rot, 0.13);
  ch.root.rotation.x = -PI / 2;
  ch.pose(P.lying(t)).expr(expr);
  ch.blob.visible = false;
}

// Voando (arco com giro) de "from" até "to" entre t0 e t1.
function fly(ch, t, t0, t1, from, to, h = 1.2, spin = 1, expr = 'pain') {
  const u = range(t, t0, t1);
  const x = from.x + (to.x - from.x) * u;
  const z = from.z + (to.z - from.z) * u;
  const y = Math.sin(u * PI) * h + (to.y || 0) * u;
  ch.place(x, z, yaw(to.x, to.z, from.x, from.z), y);
  ch.root.rotation.x = -u * PI * 0.5 * spin;
  ch.pose(P.hit(0.3 + u, 1.3)).expr(expr);
  ch.blob.visible = y < 0.4;
  return { x, y, z, u };
}

// Estado "de fundo" de cada bandido conforme o tempo da cena (st).
function gangState(c, st) {
  const { X1, X2, G, S, R, H } = c;
  // bandido 1 (taco): antes do ataque fica na roda; depois, nas latas de lixo
  if (st < 34) {
    X1.place(X10.x, X10.z, yaw(X10.x, X10.z, A0.x, A0.z)).pose(P.fight(st, 0.7)).expr('grin');
    c.show('bat');
  } else if (st >= 38.6) ko(X1, -4.4, -0.9, 0.3, st, 'ko');
  if (st < 40) {
    if (st > 26) X2.place(X20.x, X20.z, yaw(X20.x, X20.z, A0.x, A0.z)).pose(P.fight(st + 1, 0.7)).expr('angry');
    else X2.place(-0.9, 4.9, yaw(-0.9, 4.9, STAIR_X, 15)).pose(P.pockets(st)).expr('grin');
  } else if (st >= 43.2) ko(X2, -7.4, 12.2, -0.6, st);
  if (st < 46) G.place(G0.x, G0.z, yaw(G0.x, G0.z, A0.x, A0.z)).pose(P.knuckles(st)).expr('grin');
  else if (st >= 52.6) ko(G, -2.6 + 0.3, 7.6 - 0.3, yaw(-2.6, 7.6, A0.x, A0.z) + PI, st, 'dizzy');
  if (st < 54.2) {
    S.place(S0.x, S0.z, yaw(S0.x, S0.z, H0.x, H0.z)).pose(add(P.reach(1), { rsX: 55, rsZ: -10 })).expr('smirk');
    c.show('chain');
    c.props.chain.userData.setShape([[0, 0, 0], [0.05, -0.15, 0.25]]);
    H.place(H0.x, H0.z, st < 8 ? yaw(H0.x, H0.z, R0.x, R0.z) : yaw(H0.x, H0.z, A0.x, A0.z)).pose(add(P.scared(st), { rsX: -20, rsZ: 30, reX: 10 }, tremble(st))).expr(st < 8 ? 'angry' : 'scared');
  } else if (st >= 58.6) ko(S, -1.0, 6.2, 0.9, st, 'ko');
  if (st >= 54.2) {
    const u = range(st, 54.2, 55);
    H.place(H0.x + u * 1.1, H0.z - u * 0.9, yaw(1.0, 3.6, A0.x, A0.z)).pose(mix(P.scared(st), { ...P.sitBack(st), hipY: -0.5, lkX: 110, rkX: 110, lhX: 20, rhX: 20, spX: 5 }, smooth(u))).expr('scared');
  }
}

function akashiAt(c, x, z, rot, pose, expr = 'determined') {
  c.A.place(x, z, rot).pose(pose).expr(expr);
  c.A.wind = 0.6;
}

export default {
  name: 'A batalha no rio',
  start: 425,
  dur: 105,
  shots: [
    {
      // a gangue e a Hana
      at: 0,
      set: 'river',
      run(c, lt) {
        const st = lt;
        gangState(c, st);
        c.R.place(R0.x, R0.z, yaw(R0.x, R0.z, H0.x, H0.z)).pose(lt < 4 ? P.crossArms(lt) : P.point(1)).expr('grin');
        c.camKF(lt, [
          [0, [3.4, 1.5, 7.4], [-0.7, 1.15, 5.0], 38],
          [8, [2.8, 1.45, 7.0], [-0.7, 1.2, 5.0], 34],
        ]);
        if (lt > 4) c.fx.bigSweat(c.H, lt - 4.3);
      },
    },
    {
      // ele aparece no alto da escada
      at: 8,
      set: 'river',
      run(c, lt) {
        const st = 8 + lt;
        gangState(c, st);
        c.R.place(R0.x, R0.z, yaw(R0.x, R0.z, STAIR_X, 17)).pose(P.crossArms(st)).expr(lt > 2.6 ? 'surprised' : 'grin');
        akashiAt(c, STAIR_X, 17.4, PI + 0.25, P.bagShoulder(P.pockets(st)), 'menace');
        c.A.place(STAIR_X, 17.4, PI + 0.25, 4.5);
        c.show('bag');
        c.A.wind = 1.3;
        if (lt < 2.5) {
          c.camKF(lt, [
            [0, [-3.6, 0.55, 5.4], [STAIR_X, 6.2, 17.4], 36],
            [2.5, [-3.8, 0.6, 5.8], [STAIR_X, 6.0, 17.4], 32],
          ]);
          c.post.set({ bloom: 1.2 });
        } else c.face(c.R, { dist: 1.0, yaw: 25, fov: 30 });
        c.lb = 1;
        c.ov.letterbox(1);
      },
    },
    {
      // solta a mochila
      at: 14,
      set: 'river',
      run(c, lt) {
        const st = 14 + lt;
        gangState(c, st);
        c.R.place(R0.x, R0.z, yaw(R0.x, R0.z, STAIR_X, 17)).pose(P.crossArms(st)).expr('surprised');
        const drop = lt > 0.3;
        akashiAt(c, STAIR_X, 17.4, PI + 0.25, drop ? P.pockets(st) : P.bagShoulder(P.pockets(st)), 'menace');
        c.A.place(STAIR_X, 17.4, PI + 0.25, 4.5);
        c.A.wind = 1.3;
        c.A.noBlink = true;
        if (!drop) c.show('bag');
        else {
          const b = c.show('wBag');
          const y = Math.max(4.5, 6.0 - 4.9 * (lt - 0.3) ** 2 * 3);
          b.position.set(STAIR_X - 0.35, y, 17.55);
          b.rotation.set(0, 0.3, y > 4.6 ? 0.3 : 1.45);
        }
        if (lt < 1.3) c.cam([STAIR_X + 2.6, 5.7, 14.2], [STAIR_X, 5.4, 17.4], 42);
        else c.face(c.A, { dist: 0.62, fov: 28, th: 0 });
        c.lb = 1;
        c.ov.letterbox(1);
      },
    },
    {
      // risada do Ryuji; o Akashi desce a escada
      at: 20,
      set: 'river',
      run(c, lt) {
        const st = 20 + lt;
        gangState(c, st);
        const R = c.R;
        R.place(R0.x, R0.z, yaw(R0.x, R0.z, STAIR_X, 15)).pose(add(lt < 3.4 ? P.idle(st) : P.point(1), { spX: -10 + Math.sin(st * 14) * 4 })).expr(lt < 3.4 ? 'laugh' : 'grin');
        const b = c.show('wBag');
        b.position.set(STAIR_X - 0.35, 4.5, 17.55);
        b.rotation.set(0, 0.3, 1.45);
        const z = 17.4 - Math.max(0, lt - 1.5) * 1.0;
        const zz = Math.max(11.4, z);
        c.A.place(STAIR_X, zz, PI, stairY(zz)).pose(zz > 11.4 ? P.swagger(st, 0.9) : P.pockets(st)).expr('menace');
        c.A.wind = 0.8;
        if (lt < 3.4) c.face(R, { dist: 0.9, yaw: 20, fov: 30 });
        else {
          c.camKF(lt, [
            [3.4, [1.5, 2.0, 4.0], [-3.5, 2.4, 11], 40],
            [8, [0.8, 1.8, 4.6], [-4, 1.8, 10], 38],
          ]);
        }
      },
    },
    {
      // "Cinco? ...Achei que eram mais."
      at: 28,
      set: 'river',
      run(c, lt) {
        const st = 28 + lt;
        gangState(c, st);
        const R = c.R;
        R.place(R0.x, R0.z, yaw(R0.x, R0.z, A0.x, A0.z)).pose(lt > 4.5 ? add(P.point(1), { spX: 10 }) : P.crossArms(st)).expr(lt > 4.5 ? 'shout' : 'angry');
        const r = walk(c.A, st, [[STAIR_X, 11.4], [A0.x, A0.z]], 1.15, { style: 'swagger', t0: 26, idle: (t) => (t > 29.5 && t < 31.2 ? P.knuckles(t) : P.fight(t, 0.4)) });
        if (r.done) c.A.root.rotation.y = ROT_GANG;
        c.A.expr(lt > 2 ? 'glare' : 'menace');
        c.A.wind = 0.8;
        if (lt < 2.0) c.cam([-1.8, 1.25, 9.6], [-4.4, 1.2, 9.2], 34);
        else if (lt < 4.5) c.face(c.A, { dist: 0.8, yaw: 15, fov: 30 });
        else {
          c.face(R, { dist: 0.8, yaw: -10, fov: 30 });
          c.ov.speedLines({ k: 0.8, t: c.t, color: '#000' });
          c.shake(0.005);
        }
      },
    },
    {
      // bandido 1: taco, esquiva em câmera lenta, soco no estômago
      at: 34,
      set: 'river',
      run(c, lt) {
        const st = 34 + lt;
        gangState(c, st);
        c.R.place(R0.x, R0.z, yaw(R0.x, R0.z, A0.x, A0.z)).pose(P.fight(st, 0.6)).expr('shout');
        const X1 = c.X1;
        const hitT = 37.35;
        // Akashi
        let ap = P.fight(st);
        const dodge = pulse(st, 35.75, 35.95, 36.55, 36.9);
        ap = add(ap, { spX: -28 * dodge, chX: -10 * dodge, hdX: -15 * dodge, hipZo: 0, hipY: -0.04 * dodge });
        if (st > 36.93) ap = P.punchR(range(st, 36.93, 37.93));
        akashiAt(c, A0.x, A0.z, ROT_GANG, ap, st > 37.2 && st < 37.8 ? 'shout' : 'determined');
        // bandido 1
        if (st < 38.6) {
          if (st < hitT) {
            const r = walk(X1, st, [[X10.x, X10.z], [-3.45, 7.75]], 3.2, { style: 'run', t0: 34.4, idle: (t) => P.overhead(range(t, 35.2, 36.3)) });
            X1.faceTo(A0.x, A0.z);
            X1.expr('shout');
            c.show('bat');
          } else if (st < 37.55) {
            X1.place(-3.45, 7.75, yaw(-3.45, 7.75, A0.x, A0.z)).pose(P.doubled(range(st, hitT, 37.55))).expr('pain');
          } else {
            fly(X1, st, 37.55, 38.6, { x: -3.45, z: 7.75 }, { x: -4.5, z: -1.4 }, 1.6, 1.4);
          }
          if (st >= hitT) {
            const bt = c.show('wBat');
            const u = range(st, hitT, hitT + 0.9);
            bt.position.set(-3.2 + u * 1.5, Math.max(0.05, 1.4 + u * 1.2 - 3 * u * u), 7.5 + u * 0.8);
            bt.rotation.set(u * 9, 0, u * 6);
          }
        }
        if (st >= 38.6) {
          const bt = c.show('wBat');
          bt.position.set(-1.7, 0.05, 8.3);
          bt.rotation.set(0, 0.4, PI / 2);
        }
        // câmeras
        if (st < 35.6) c.cam([-1.0, 1.25, 10.6], [-3.6, 1.3, 7.9], 36);
        else if (st < 36.9) {
          c.cam([-5.7, 1.35, 6.3], [-3.85, 1.4, 8.2], 32);
          c.post.set({ zoom: 0.05, sat: 0.7, contrast: 1.1 });
          c.ov.speedLines({ k: 0.7, t: c.t, color: '#000', inner: 0.6 });
        } else if (st < 37.85) {
          c.cam([-2.4, 0.9, 7.0], [-3.8, 1.2, 8.2], 34);
          c.post.set({ invert: st > hitT && st < hitT + 0.06 ? 1 : 0 });
          const p = X1.headWorld(V(0, 0, 0), -0.35);
          c.fx.impact(p, st - hitT, 0.8);
          c.ov.onoma('SOC!', 1250, 330, 190, st - hitT, { color: '#ffe23a', fill2: '#ff6a00' });
          if (st > hitT) c.shake(0.04 * (1 - range(st, hitT, hitT + 0.4)));
        } else {
          c.cam([-0.6, 2.2, 5.4], [-4.3, 0.8, 0.5], 40);
          c.ov.onoma('CRASH!', 760, 520, 150, st - 38.6, { color: '#ffffff' });
          c.fx.dust(V(-4.5, 0, -1.6), st - 38.6, 8, 1.0);
        }
      },
    },
    {
      // bandido 2 por trás: chute giratório
      at: 40,
      set: 'river',
      run(c, lt) {
        const st = 40 + lt;
        gangState(c, st);
        c.R.place(R0.x, R0.z, yaw(R0.x, R0.z, A0.x, A0.z)).pose(P.fight(st, 0.6)).expr('angry');
        const X2 = c.X2;
        const hitT = 42.2;
        const spin = easeIn(range(st, 41.65, 42.15));
        let ap = st > 41.7 ? P.kick(range(st, 41.85, 42.85)) : P.fight(st);
        akashiAt(c, A0.x, A0.z, ROT_GANG + spin * PI * 1.0 + (st > 43.4 ? -smooth(range(st, 43.4, 44.2)) * PI : 0), ap, st > 41.7 && st < 43 ? 'shout' : 'determined');
        if (st < hitT) {
          walk(X2, st, [[X20.x, X20.z], [-4.95, 9.45]], 3.3, { style: 'run', t0: 40.4, idle: (t) => P.punchR(range(t, 41.6, 42.6)) });
          X2.faceTo(A0.x, A0.z);
          X2.expr('shout');
        } else if (st < 43.2) fly(X2, st, hitT, 43.2, { x: -4.95, z: 9.45 }, { x: -7.4, z: 12.2 }, 0.9, 0.8);
        if (st < 41.7) c.cam([-2.3, 1.45, 7.2], [-5.6, 1.3, 10.3], 34);
        else if (st < 43.5) {
          const a = -0.6 + range(st, 41.7, 43.5) * 1.2;
          c.cam([A0.x + Math.sin(a) * 3.2, 1.0, A0.z - Math.cos(a) * 3.2], [A0.x - 0.4, 1.0, A0.z + 0.4], 38);
          c.post.set({ invert: st > hitT && st < hitT + 0.06 ? 1 : 0 });
          c.fx.impact(V(-5.0, 1.4, 9.5), st - hitT, 0.8);
          c.ov.onoma('POW!', 1300, 300, 190, st - hitT, { color: '#ffe23a', fill2: '#ff6a00' });
          if (st > hitT) c.shake(0.04 * (1 - range(st, hitT, hitT + 0.4)));
          c.ov.speedLines({ k: 0.5 * pulse(st, 41.7, 41.9, 42.4, 42.8), t: c.t, color: '#000' });
        } else {
          c.face(c.A, { dist: 1.2, yaw: 0, fov: 32, th: -0.2 });
          c.fx.dust(V(-7.4, 0, 12.2), st - 43.2, 8, 0.9);
        }
      },
    },
    {
      // o Goro: abraço de urso, cabeçada, gancho e a queda
      at: 46,
      set: 'river',
      run(c, lt) {
        const st = 46 + lt;
        gangState(c, st);
        c.R.place(R0.x, R0.z, yaw(R0.x, R0.z, A0.x, A0.z)).pose(P.fight(st, 0.6)).expr(st > 51.3 ? 'shock' : 'angry');
        const G = c.G;
        const GP = { x: -3.55, z: 8.15 };
        const hug = st > 47.5 && st < 49.6;
        const lift = hug ? smooth(range(st, 47.6, 48.2)) * 0.35 : st < 49.9 && st > 49.6 ? (1 - range(st, 49.6, 49.9)) * 0.35 : 0;
        let ap;
        if (st < 47.5) ap = P.fight(st);
        else if (st < 49.3) ap = add(P.idle(st), { lsX: 15, lsZ: 35, rsX: 15, rsZ: 35, leX: 40, reX: 40, lhX: 10 + Math.sin(st * 20) * 10, rhX: -Math.sin(st * 20) * 10, lkX: 30, rkX: 25 });
        else if (st < 50.7) ap = P.headbutt(range(st, 49.3, 50.0));
        else ap = P.uppercut(range(st, 50.7, 51.7));
        const ax = hug ? -4.0 : A0.x;
        const az = hug ? 8.45 : A0.z;
        c.A.place(ax, az, ROT_GANG, lift).pose(ap).expr(st > 49.2 ? 'shout' : st > 47.5 ? 'pain' : 'determined');
        c.A.blob.visible = true;
        // Goro
        if (st < 47.5) {
          walk(G, st, [[G0.x, G0.z], [GP.x, GP.z]], 3.4, { style: 'run', t0: 46.6 });
          G.faceTo(A0.x, A0.z);
          G.expr('shout');
        } else if (st < 49.55) {
          G.place(GP.x, GP.z, yaw(GP.x, GP.z, ax, az)).pose({ lsX: 82, lsZ: -28, lsY: -35, leX: 75, rsX: 82, rsZ: -28, rsY: -35, reX: 75, spX: -8, chX: -6, lkX: 20, rkX: 20, hipY: -0.05, hdX: -5 }).expr('grin');
        } else if (st < 51.15) {
          const u = range(st, 49.55, 50.5);
          G.place(GP.x + u * 0.95, GP.z - u * 0.55, yaw(GP.x, GP.z, ax, az)).pose(P.hit(u, 1.2)).expr('pain');
        } else if (st < 52.6) {
          const u = easeIn(range(st, 51.2, 52.6));
          G.place(-2.6, 7.6, yaw(-2.6, 7.6, A0.x, A0.z));
          G.root.rotation.x = -u * PI * 0.5;
          G.root.position.y = 0.13 * u;
          G.pose(P.hit(0.5, 1.4)).expr('dizzy');
        }
        // câmeras
        if (st < 47.5) c.cam([-1.0, 0.6, 10.5], [-2.8, 1.3, 7.8], 38);
        else if (st < 49.55) {
          if (st < 48.6) c.face(G, { dist: 1.2, yaw: 25, fov: 34, th: -0.1 });
          else c.face(c.A, { dist: 0.85, yaw: -20, fov: 32 });
          c.shake(0.006);
        } else if (st < 50.7) {
          c.face(c.A, { dist: 1.5, yaw: 75, fov: 34, th: -0.15 });
          c.post.set({ invert: st < 49.62 ? 1 : 0 });
          c.fx.impact(V(-3.75, 1.75, 8.3), st - 49.55, 0.6);
          c.ov.onoma('DON!', 1250, 300, 200, st - 49.55, { color: '#ffffff' });
          c.shake(0.05 * (1 - range(st, 49.55, 50)));
        } else if (st < 52.6) {
          c.cam([-3.0, 0.35, 9.9], [-3.2, 1.8, 7.9], 42);
          c.post.set({ invert: st > 51.15 && st < 51.21 ? 1 : 0, zoom: 0.04 * pulse(st, 51.15, 51.2, 51.5, 51.9) });
          c.fx.impact(V(-3.1, 1.9, 8.0), st - 51.15, 0.9);
          c.ov.onoma('BAM!', 760, 300, 210, st - 51.15, { color: '#ffe23a', fill2: '#ff6a00' });
          c.ov.speedLines({ k: pulse(st, 51.1, 51.2, 51.8, 52.2), t: c.t, color: '#000' });
        } else {
          c.cam([0.2, 2.6, 4.6], [-2.8, 0.6, 8.0], 40);
          c.fx.dust(V(-2.4, 0, 7.0), st - 52.6, 12, 1.6, 1.5);
          c.fx.shockwave(V(-2.4, 0, 7.0), st - 52.6, 6);
          c.shake(0.06 * (1 - range(st, 52.6, 53.3)));
          c.ov.onoma('DOOOM', 960, 420, 180, st - 52.6, { color: '#ffffff', rot: 0 });
        }
      },
    },
    {
      // o Shin: corrente agarrada no ar
      at: 54,
      set: 'river',
      run(c, lt) {
        const st = 54 + lt;
        gangState(c, st);
        const S = c.S;
        const SP = { x: -2.45, z: 7.25 };
        const catchT = 55.9;
        const hitT = 57.8;
        // Ryuji some de cena (está se esgueirando por trás)
        if (st < 55.5) c.R.place(R0.x, R0.z, yaw(R0.x, R0.z, A0.x, A0.z)).pose(P.fight(st, 0.6)).expr('angry');
        let ap = P.fight(st);
        if (st > 55.7 && st < 57.3) ap = add(P.fight(st), { lsX: 92, lsZ: 10, lsY: 0, leX: 12, lFist: 1 });
        if (st >= 57.3) ap = P.punchR(range(st, hitT - 0.42, hitT + 0.58));
        akashiAt(c, A0.x, A0.z, ROT_GANG, ap, st > catchT ? 'glare' : 'determined');
        if (st < 58.6) {
          let sx = S0.x;
          let sz = S0.z;
          if (st > 54.4) {
            const u = range(st, 54.4, 55.3);
            sx = S0.x + (SP.x - S0.x) * u;
            sz = S0.z + (SP.z - S0.z) * u;
          }
          if (st > 57.0) {
            const u = easeIn(range(st, 57.0, 57.6));
            sx = SP.x + (-3.55 - SP.x) * u;
            sz = SP.z + (8.0 - SP.z) * u;
          }
          if (st < hitT) {
            S.place(sx, sz, yaw(sx, sz, A0.x, A0.z));
            const swing = range(st, 55.1, 55.9);
            S.pose(st < 55.1 ? (st < 54.4 ? P.reach(1) : P.run(st, 0.8)) : st < 57.0 ? add(P.overhead(0.3 + swing * 0.4), { lsX: 30 }) : add(P.reach(1), { spX: 25 })).expr(st > 57 ? 'shock' : 'shout');
            c.show('chain');
            // corrente: da mão do Shin até a mão do Akashi (depois de agarrada)
            const ch = c.props.chain;
            const ph = ch.parent;
            const a = new THREE.Vector3();
            c.S.worldOf(c.S.rGrip, a);
            let b;
            if (st > catchT) b = c.A.worldOf(c.A.lGrip, new THREE.Vector3());
            else {
              const u = range(st, 55.3, catchT);
              b = a.clone().lerp(c.A.worldOf(c.A.lGrip, new THREE.Vector3()), u * 0.95).add(V(0, Math.sin(u * PI) * 0.6, 0));
            }
            ph.updateWorldMatrix(true, false);
            const la = ph.worldToLocal(a.clone());
            const lb = ph.worldToLocal(b.clone());
            const mid = la.clone().lerp(lb, 0.5);
            mid.y -= st > catchT ? 0.05 : 0.15;
            ch.userData.setShape([[la.x, la.y, la.z], [mid.x, mid.y, mid.z], [lb.x, lb.y, lb.z]]);
            ch.position.set(0, 0, 0);
          } else fly(S, st, hitT, 58.6, { x: -3.55, z: 8.0 }, { x: -1.0, z: 6.2 }, 0.9, 1);
        }
        // câmeras
        if (st < catchT) c.cam([0.6, 1.6, 9.8], [-1.8, 1.1, 6.5], 40);
        else if (st < 57.0) {
          c.face(c.A, { dist: 1.6, yaw: -55, fov: 36, th: -0.25 });
          c.post.set({ invert: st < catchT + 0.05 ? 1 : 0 });
          c.ov.onoma('TCHAK!', 1300, 360, 150, st - catchT, { color: '#ffffff' });
          c.ov.speedLines({ k: 0.6, t: c.t, color: '#000', inner: 0.6 });
        } else if (st < 58.9) {
          c.cam([-1.6, 1.3, 10.4], [-3.5, 1.3, 8.0], 34);
          c.post.set({ invert: st > hitT && st < hitT + 0.06 ? 1 : 0 });
          c.fx.impact(V(-3.6, 1.5, 7.9), st - hitT, 0.8);
          c.ov.onoma('SOC!', 1250, 330, 190, st - hitT, { color: '#ffe23a', fill2: '#ff6a00' });
          if (st > hitT) c.shake(0.04 * (1 - range(st, hitT, hitT + 0.4)));
        } else {
          c.face(c.H, { dist: 0.9, yaw: 10, fov: 32, th: -0.05 });
          c.ov.speedLines({ k: 0.5, t: c.t, color: '#000' });
        }
      },
    },
    {
      // o cano de ferro: CLANG
      at: 60,
      set: 'river',
      run(c, lt) {
        const st = 60 + lt;
        gangState(c, st);
        const R = c.R;
        const RP = { x: -5.0, z: 9.4 };
        const hitT = 60.0;
        akashiAt(c, A0.x, A0.z, ROT_GANG, add(P.fight(st, 0.5), { hdX: 8 * pulse(st, 60, 60.05, 60.2, 60.6), hdY: st > 68 ? 75 * smooth(range(st, 68.0, 69.4)) : 0 }), st > 68.2 ? 'menace' : 'blank');
        c.A.noBlink = st > 68;
        R.place(RP.x, RP.z, yaw(RP.x, RP.z, A0.x, A0.z)).pose(st < 63 ? P.overhead(0.7) : add(P.scared(st), tremble(st, 1.5), { rsX: 40, reX: 60 })).expr(st < 62.6 ? 'shout' : 'scared');
        c.show('pipe');
        c.props.pipe.userData.setBend(st > hitT ? 0.55 : 0);
        if (st < 60.6) {
          c.cam([-3.4, 1.85, 10.6], [-4.6, 1.85, 9.0], 34);
          c.post.set({ mono: 1, monoRed: 1, contrast: 1.35 });
          c.ov.onoma('CLANG!', 960, 330, 240, st - hitT, { color: '#ffffff', stroke: '#000', rot: -0.12, dur: 1.2 });
          c.fx.impact(V(-4.5, 1.9, 8.9), st - hitT, 0.7);
          c.shake(0.05);
        } else if (st < 64.8) {
          c.face(R, { dist: 0.85, yaw: -15, fov: 30 });
          c.post.set({ sat: 0.5, vignette: 0.7 });
        } else if (st < 68) {
          c.cam([-2.6, 1.6, 7.6], [-4.6, 1.7, 9.2], 30);
          c.post.set({ sat: 0.5, vignette: 0.7 });
        } else if (st < 71) {
          c.face(c.A, { dist: 0.7, yaw: 85, fov: 28, th: 0 });
          c.post.set({ vignette: 0.8, contrast: 1.15 });
          c.ov.speedLines({ k: 0.4, t: c.t, color: '#000' });
        } else {
          c.face(R, { dist: 0.75, yaw: -10, fov: 30 });
          c.fx.bigSweat(R, st - 71);
          c.post.set({ vignette: 0.6 });
        }
        c.lb = 1;
        c.ov.letterbox(1);
      },
    },
    {
      // ele agarra o cano, entorta e joga no rio; a aura explode
      at: 76,
      set: 'river',
      run(c, lt) {
        const st = 76 + lt;
        gangState(c, st);
        const R = c.R;
        const RP = { x: -5.0, z: 9.4 };
        const faceR = yaw(A0.x, A0.z, RP.x, RP.z);
        const turn = smooth(range(st, 76.0, 76.4));
        const grab = st > 76.5;
        const thrown = st > 78.0;
        let ap = add(P.fight(st, 0.4), { rsX: 70, rsZ: 10, reX: 60 });
        if (thrown) ap = add(P.fight(st, 0.4), { rsX: 140 * pulse(st, 77.7, 77.9, 78.1, 78.6) });
        akashiAt(c, A0.x, A0.z, ROT_GANG + (faceR - ROT_GANG + 2 * PI) * 0 + turn * (faceR - ROT_GANG), ap, 'menace');
        c.A.noBlink = true;
        R.place(RP.x + range(st, 76.5, 78) * 0.5, RP.z + range(st, 76.5, 78) * 0.4, yaw(RP.x, RP.z, A0.x, A0.z)).pose(add(P.scared(st), tremble(st, 1.5))).expr('scared');
        if (!grab) {
          c.show('pipe');
          c.props.pipe.userData.setBend(0.55);
        } else if (!thrown) {
          c.show('pipeA');
          c.props.pipeA.userData.setBend(0.5 + smooth(range(st, 77.0, 77.4)) * 0.9);
        } else {
          const p = c.show('wPipe');
          const u = range(st, 78.0, 79.3);
          p.position.set(-4.3 + u * 2.0, 2.0 + u * 5 - u * u * 7.6, 8.6 - u * 20.6);
          p.rotation.set(u * 14, 0, u * 9);
          p.userData.setBend(1.4);
          if (u >= 1) p.visible = false;
        }
        const aura = smooth(range(st, 79.4, 80.4));
        c.fx.aura(c.A, c.t, aura * 1.1);
        c.A.wind = 0.6 + aura * 1.4;
        if (st < 78.0) {
          const h = c.A.worldOf(c.A.rGrip, new THREE.Vector3());
          c.cam([h.x + 0.8, h.y + 0.2, h.z + 0.4], [h.x, h.y, h.z], 34);
          c.ov.onoma('CREC', 1300, 380, 140, st - 77.1, { color: '#ffffff' });
        } else if (st < 79.5) {
          c.cam([1.0, 2.6, 2.5], [-2.6, 0.2, -10], 42);
          c.fx.splash(V(-2.3, -0.7, -12), st - 79.3, 1.2);
        } else {
          c.camKF(st, [
            [79.5, [-6.6, 0.45, 7.6], [A0.x, 1.5, A0.z], 40],
            [84, [-6.3, 0.5, 7.9], [A0.x, 1.6, A0.z], 34],
          ]);
          c.fx.dust(V(A0.x, 0, A0.z), (st - 79.5) % 1.5, 10, 1.4 + aura, 1.5, Math.floor(st - 79.5));
          c.post.set({ tint: [1.15, 0.88, 0.85], bloom: 1.1 });
          c.ov.speedLines({ k: 0.4 * aura, t: c.t, color: '#4a0000', inner: 0.7 });
          c.shake(0.008 * aura);
        }
      },
    },
    {
      // o soco final
      at: 84,
      set: 'river',
      run(c, lt) {
        const st = 84 + lt;
        gangState(c, st);
        const R = c.R;
        const AP = { x: -4.2, z: 7.6 };
        const RP = { x: -4.0, z: 6.25 };
        const hitT = 88.0;
        const aRot = yaw(AP.x, AP.z, RP.x, RP.z);
        let ap = P.fight(st, 1);
        if (st > 85.7 && st < 86.6) ap = add(P.fight(st), { hdZ: -18 * pulse(st, 85.8, 85.95, 86.2, 86.5), hdY: -10 });
        if (st > 87.0) ap = P.punchR(range(st, hitT - 0.42 * 1.4, hitT + 0.58 * 1.4));
        akashiAt(c, AP.x, AP.z, aRot, ap, st > 87.2 ? 'shout' : 'menace');
        c.fx.aura(c.A, c.t, 1.0 + pulse(st, 87.5, 88, 88.3, 89) * 0.6);
        c.A.wind = 1.6;
        if (st < hitT) {
          R.place(RP.x, RP.z, yaw(RP.x, RP.z, AP.x, AP.z)).pose(st < 85.6 ? add(P.fight(st, 0.8), tremble(st)) : P.punchL(range(st, 85.6, 86.6))).expr(st > 87.4 ? 'shock' : 'shout');
        } else if (st < 90.6) {
          const u = range(st, hitT, 90.6);
          const z = RP.z + (-9.4 - RP.z) * u;
          const y = u < 0.45 ? Math.sin((u / 0.45) * PI) * 2.0 : Math.max(0, Math.sin(((u - 0.45) / 0.55) * PI) * 0.8);
          R.place(RP.x + u * 1.2, z, aRot + PI, y - (u > 0.95 ? 0.6 * (u - 0.95) * 20 : 0));
          R.root.rotation.x = -u * PI * 2.2;
          R.pose(P.hit(0.5, 1.5)).expr('ko');
          R.blob.visible = y < 0.5;
        } else {
          R.place(RP.x + 1.2, -9.4, 0.6, -0.45);
          R.root.rotation.x = -PI / 2;
          R.pose(P.lying(st)).expr('ko');
          R.blob.visible = false;
        }
        // câmeras
        if (st < 87.3) {
          const a = -1.2 + range(st, 84, 87.3) * 2.4;
          const m = { x: (AP.x + RP.x) / 2, z: (AP.z + RP.z) / 2 };
          c.cam([m.x + Math.sin(a) * 3.0, 1.2, m.z + Math.cos(a) * 3.0], [m.x, 1.35, m.z], 36);
          c.post.set({ sat: 0.85 });
          c.ov.speedLines({ k: 0.35, t: c.t, color: '#000' });
        } else if (st < 88.55) {
          c.cam([-2.9, 1.5, 6.6], [-4.05, 1.55, 6.9], 34);
          const inv = st > hitT && st < hitT + 0.06;
          const mono = st > hitT + 0.06 && st < 88.5;
          c.post.set({ invert: inv ? 1 : 0, mono: mono ? 1 : 0, monoRed: 1, contrast: 1.3, zoom: st > hitT ? 0.08 : 0.02 });
          const p = V(RP.x, 1.6, RP.z + 0.1);
          c.fx.impact(p, st - hitT, 1.4, 0.5);
          c.fx.shockwave(V(RP.x, 0, RP.z), st - hitT, 7);
          c.fx.debris(V(RP.x, 0.1, RP.z), st - hitT, 16, 4, 3, 'sparkle', 0.12);
          c.ov.onoma('BAM!!!', 960, 360, 300, st - hitT, { color: '#ffe23a', fill2: '#ff3a00', dur: 1.4, rot: -0.1 });
          c.ov.speedLines({ k: 1, t: c.t, color: '#000', inner: 0.4 });
          if (st > hitT) c.shake(0.09 * (1 - range(st, hitT, hitT + 0.6)));
        } else if (st < 91) {
          const rz = Math.max(-9.4, RP.z + (-9.4 - RP.z) * range(st, hitT, 90.6));
          c.cam([3.5, 2.2, 2.0], [-3.5, 0.8, rz], 40);
          c.fx.dust(V(-3.6, 0, 1.2), st - 89.2, 8, 0.9);
          c.fx.splash(V(-2.8, -0.7, -9.4), st - 90.6, 1.5);
          c.ov.dashLines({ k: 0.5 * (1 - range(st, 89, 90.5)), t: c.t });
        } else {
          c.face(c.A, { dist: 1.6, yaw: -20, fov: 32, th: -0.3 });
          c.ov.onoma('TCHIBUM!', 1350, 300, 120, st - 91, { color: '#9ad8ff', dur: 1.5 });
        }
      },
    },
    {
      // depois da luta: o pôr do sol
      at: 94,
      set: 'river',
      run(c, lt) {
        const st = 94 + lt;
        gangState(c, st);
        c.A.place(-4.2, 7.6, PI - 0.15).pose(add(P.idle(st), { lsZ: 10, rsZ: 10, hdX: 4 })).expr('neutral', 0, -0.3);
        c.A.wind = 1.0;
        c.R.place(-2.8, -9.4, 0.6, -0.45);
        c.R.root.rotation.x = -PI / 2;
        c.R.pose(P.lying(st)).expr('ko');
        c.R.blob.visible = false;
        c.H.expr('surprised');
        c.camKF(lt, [
          [0, [-3.7, 1.2, 3.6], [-4.2, 1.7, 7.6], 34],
          [11, [-2.6, 2.2, -1.5], [-4.2, 2.4, 7.6], 40],
        ]);
        c.fx.dust(V(-4.2, 0, 7.6), (lt * 0.4) % 2.5, 8, 1.0, 2.5, 7, 'steam');
        c.post.set({ bloom: 1.1 });
      },
    },
  ],
  lines: [
    [0.8, 3.0, 'ryuji', 'Grita mais alto. Quero que o seu herói escute.'],
    [4.2, 3.2, 'hana', 'Ele não é meu herói... Me solta!', { shout: true }],
    [15.5, 2.0, 'akashi', 'Solta ela.'],
    [20.3, 3.0, 'ryuji', 'Hahaha! Olha só, o herói chegou!'],
    [23.6, 3.0, 'ryuji', 'Somos cinco, Akashi. Você tá sozinho!'],
    [30.2, 2.3, 'akashi', 'Cinco? ...Achei que eram mais.'],
    [32.6, 1.4, 'ryuji', 'PEGUEM ELE!!', { shout: true }],
    [47.8, 1.4, 'goro', 'Te peguei!'],
    [58.9, 1.1, 'hana', 'Cuidado!', { shout: true }],
    [63.0, 2.4, 'ryuji', 'H-hã...? Ele nem se mexeu...'],
    [68.2, 2.2, 'akashi', '...É só isso?'],
    [71.0, 3.0, 'ryuji', 'Q-que tipo de monstro é você?!', { shout: true }],
    [80.0, 2.0, 'akashi', 'Minha vez.'],
    [96.0, 1.6, 'x1', 'Ugh...'],
  ],
  sfx: [
    ...[8.1, 8.9, 9.7].map((t) => [t, 'step', { n: 'gravel', v: 0.4, r: 0.4 }]),
    [14.3, 'whoosh', { d: 0.3, v: 0.3 }],
    [14.75, 'thud', { v: 0.6 }],
    ...[21.5, 22.5, 23.5, 24.5, 25.5, 26.5].map((t) => [t, 'step', { v: 0.5, r: 0.4 }]),
    ...[27.3, 28.2, 29.1].map((t) => [t, 'step', { n: 'gravel', v: 0.5 }]),
    [29.6, 'knuckle', { v: 0.8 }],
    ...[34.5, 34.8, 35.1].map((t) => [t, 'step', { n: 'gravel', v: 0.5 }]),
    [35.85, 'whoosh', { d: 0.4, v: 0.7, lo: 300, hi: 1500 }],
    [37.35, 'punch', { v: 1 }],
    [38.6, 'crashMetal', { v: 0.9 }],
    ...[40.5, 40.8, 41.1, 41.4].map((t) => [t, 'step', { n: 'gravel', v: 0.5 }]),
    [41.75, 'whoosh', { d: 0.45, v: 0.7 }],
    [42.2, 'punch', { v: 1 }],
    [43.2, 'thud', { v: 0.8 }],
    ...[46.7, 47.0, 47.3].map((t) => [t, 'step', { n: 'heavy', v: 0.8 }]),
    [47.55, 'thud', { v: 0.6 }],
    [49.55, 'punch', { v: 1, big: 1 }],
    [50.9, 'whoosh', { d: 0.3, v: 0.6 }],
    [51.15, 'punch', { v: 1, big: 1 }],
    [52.6, 'thud', { v: 1 }],
    [52.6, 'boom', { v: 0.7 }],
    [55.2, 'whoosh', { d: 0.6, v: 0.6 }],
    [55.9, 'chain', { d: 0.3, v: 0.8 }],
    [57.0, 'chain', { d: 0.4, v: 0.7 }],
    [57.8, 'punch', { v: 1 }],
    [58.6, 'thud', { v: 0.7 }],
    [59.3, 'whoosh', { d: 0.7, v: 0.5, lo: 200, hi: 900 }],
    [60.0, 'clang', { v: 1 }],
    [76.5, 'chain', { d: 0.1, v: 0.4 }],
    [77.1, 'clang', { v: 0.4, k: 0.7 }],
    [77.95, 'whoosh', { d: 0.5, v: 0.6 }],
    [79.3, 'splash', { v: 0.8 }],
    [79.4, 'wind', { d: 5, v: 0.6 }],
    [85.6, 'whoosh', { d: 0.35, v: 0.5 }],
    [87.6, 'whoosh', { d: 0.4, v: 0.7 }],
    [88.0, 'punch', { v: 1.2, big: 1 }],
    [89.3, 'thud', { v: 0.6 }],
    [90.6, 'splash', { v: 1 }],
  ],
};
