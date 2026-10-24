// Cena 5 — O terraço (3:35–4:30). A hora sagrada do rosbife: a marmita se abre
// com raios dourados e coral celestial. O Kenta reclama, a Hana aparece com
// um sanduíche de rosbife feito por ela… e o Akashi acha que ela está com febre.
import { P, V, walk, kf, range, smooth, pulse, easeOut, easeIn, backOut, PI, add, mix, seq, talkWindow } from './kit.js';

const SPOT = { x: -3, z: 9.15 };
const KSPOT = { x: -2.1, z: 9.0 };
const HSPOT = { x: -2.75, z: 7.65 };

function door(c, open) {
  const d = c.set.door;
  const th = open * 1.6;
  d.position.set(-8.55 + Math.cos(th) * 0.55, 1.075, -3.97 + Math.sin(th) * 0.55);
  d.rotation.y = -th;
}

function akashiSit(c, lt, pose, expr = 'neutral', lx = 0) {
  c.A.place(SPOT.x, SPOT.z, PI).pose(pose).expr(expr, lx);
  c.A.wind = 0.3;
}

function kentaSit(c, lt, layer = {}, expr = 'neutral') {
  c.K.place(KSPOT.x, KSPOT.z, PI - 0.5).pose(add({ ...P.sitFloor(lt), rsX: 35, reX: 60 }, layer)).expr(expr, 0.6);
  c.show('bread');
}

function bentoFloor(c, lidOpen = 1) {
  const b = c.show('wBento');
  b.position.set(SPOT.x, 0.0, SPOT.z - 0.42);
  b.rotation.y = 0;
  const l = c.show('wLid');
  const k = easeOut(lidOpen);
  l.position.set(SPOT.x + 0.25 * k, 0.075 + 0.35 * Math.sin(k * PI * 0.8), SPOT.z - 0.42 - 0.1 * k);
  l.rotation.set(-k * 1.3, 0, k * 0.4);
}

export default {
  name: 'O terraço — rosbife',
  start: 215,
  dur: 55,
  shots: [
    {
      // a porta abre com tudo
      at: 0,
      set: 'rooftop',
      run(c, lt) {
        door(c, easeOut(range(lt, 0.3, 0.55)));
        walk(c.A, lt, [[-8, -4.6], [-7.2, -1.8]], 1.3, { style: 'swagger', t0: 0.6, idle: P.pockets });
        c.A.pose(add(c.A.p, { rsX: 25, reX: 70, rFist: 1 }));
        c.show('boxA');
        c.A.expr('determined');
        c.A.wind = 0.5;
        c.cam([-6.4, 1.2, 0.6], [-7.8, 1.4, -3.6], 38);
        if (lt > 0.35 && lt < 0.7) c.shake(0.03);
        c.ov.onoma('BAM!', 700, 380, 140, lt - 0.35, { dur: 0.9, color: '#fff' });
      },
    },
    {
      at: 2.5,
      set: 'rooftop',
      run(c, lt) {
        door(c, 1);
        const r = walk(c.A, lt, [[-6.2, 4.0], [SPOT.x, SPOT.z - 0.4]], 1.6, { style: 'swagger', t0: -1.0 });
        const sit = smooth(range(lt, 1.8, 2.4));
        if (r.done) {
          c.A.place(SPOT.x, SPOT.z, PI);
          c.A.pose(add(mix(P.pockets(lt), P.sitFloor(lt), sit), { rsX: 25, reX: 70 }));
        } else c.A.pose(add(c.A.p, { rsX: 25, reX: 70, rFist: 1 }));
        c.show('boxA');
        c.A.expr('neutral');
        c.camKF(lt, [
          [0, [4, 2.6, -2], [-4, 0.8, 7], 44],
          [2.5, [3, 2.0, -1], [-3.2, 0.6, 8.6], 40],
        ]);
      },
    },
    {
      // abrindo a marmita: raios dourados
      at: 5,
      set: 'rooftop',
      run(c, lt) {
        const open = range(lt, 1.2, 1.7);
        akashiSit(c, lt, add(P.sitFloor(lt), { lsX: 50, leX: 40, rsX: 50 + 25 * open, reX: 40 + 30 * open, spX: 18 }), lt > 1.3 ? 'sparkle' : 'determined', 0);
        c.A.st.ly = -0.8;
        bentoFloor(c, open);
        c.camKF(lt, [
          [0, [SPOT.x + 0.25, 1.4, SPOT.z - 1.45], [SPOT.x, 0.25, SPOT.z - 0.3], 42],
          [3.5, [SPOT.x + 0.15, 1.3, SPOT.z - 1.25], [SPOT.x, 0.3, SPOT.z - 0.3], 38],
        ]);
        const p = c.toScreen(V(SPOT.x, 0.08, SPOT.z - 0.42));
        const k = smooth(range(lt, 1.25, 1.6));
        c.ov.rays(p.x, p.y, k, lt);
        c.post.set({ bloom: 0.6 + k * 0.8, exposure: 1 + k * 0.1 });
      },
    },
    {
      // close na marmita
      at: 8.5,
      set: 'rooftop',
      run(c, lt) {
        akashiSit(c, lt, add(P.sitFloor(lt), lt > 1.6 ? P.clap(smooth(range(lt, 1.6, 2.0))) : { spX: 18 }), 'sparkle');
        bentoFloor(c, 1);
        const b = V(SPOT.x, 0.06, SPOT.z - 0.42);
        c.camKF(lt, [
          [0, [SPOT.x + 0.32, 0.42, SPOT.z - 0.78], [b.x, b.y, b.z], 34],
          [3.5, [SPOT.x + 0.22, 0.34, SPOT.z - 0.64], [b.x, b.y, b.z], 30],
        ]);
        c.fx.sparkles(b.clone().add(V(0.03, 0.04, 0)), lt, 9, 0.12, 0.05, 4);
        const p = c.toScreen(b);
        c.ov.rays(p.x, p.y, 0.55, lt + 3);
        c.post.set({ bloom: 1.1, sat: 1.25 });
      },
    },
    {
      // comendo: felicidade
      at: 12,
      set: 'rooftop',
      run(c, lt) {
        akashiSit(c, lt, P.eat(lt), (lt * 0.55) % 1 > 0.35 ? 'eat' : 'bliss');
        c.A.st.talk = (lt * 0.55) % 1 > 0.6 && (lt * 0.55) % 1 < 0.95;
        c.show('bento');
        c.show('chop');
        const ang = 0.35 + lt * 0.03;
        c.face(c.A, { dist: 1.15, yaw: -18 + lt * 2, fov: 32, th: -0.16 });
        c.fx.sparkles(c.A.headWorld(V(0, 0, 0), -0.05), lt, 8, 0.38, 0.11, 5);
        c.ov.shoujo(1, lt, 'rgba(255,205,150,0.55)');
        c.post.set({ bloom: 0.9, sat: 1.15 });
      },
    },
    {
      // o Kenta chega
      at: 20,
      set: 'rooftop',
      run(c, lt) {
        akashiSit(c, lt, P.eat(lt), lt > 6.9 ? 'angry' : lt > 2.8 ? 'determined' : 'eat', 0.6);
        c.show('bento');
        c.show('chop');
        const sit = smooth(range(lt, 0.5, 1.1));
        c.K.place(KSPOT.x, KSPOT.z, PI - 0.5).pose(add(mix(P.idle(lt), P.sitFloor(lt), sit), { rsX: 45, reX: 70 })).expr(lt > 5.5 ? 'smirk' : 'sad', -0.6);
        c.show('bread');
        if (lt < 2.8 || (lt > 5.5 && lt < 7)) c.cam([KSPOT.x + 0.2, 1.0, KSPOT.z - 2.2], [(SPOT.x + KSPOT.x) / 2, 0.75, SPOT.z], 34);
        else if (lt < 5.5) c.face(c.A, { dist: 1.0, yaw: -20, fov: 30, th: -0.12 });
        else c.face(c.A, { dist: 0.8, yaw: -30, fov: 30, th: -0.1 });
        if (lt > 7) c.fx.vein(c.A, lt - 7);
      },
    },
    {
      // a Hana aparece na porta
      at: 28,
      set: 'rooftop',
      run(c, lt) {
        door(c, 1);
        akashiSit(c, lt, P.eat(lt, true, 0), 'neutral', -0.3);
        c.show('bento');
        c.show('chop');
        kentaSit(c, lt, {}, 'surprised');
        const H = c.H;
        if (lt < 1.8) {
          H.place(-8.1, -3.55, 0.4).pose(add(P.shy(lt), { spZ: -12, hdZ: -10 })).expr('surprised');
          c.cam([-7.1, 1.5, -1.6], [-8.1, 1.35, -3.55], 32);
        } else {
          const r = walk(H, lt, [[-6.6, 2.6], [HSPOT.x, HSPOT.z]], 1.25, { t0: 1.8, idle: (t) => P.offer(smooth(range(t, 5.2, 5.8))) });
          H.expr(lt > 4 ? 'blush' : 'smile', r.done ? 0 : 0.3, r.done ? -0.2 : 0);
          if (r.done) H.root.rotation.y = 0.05;
          c.show('gift');
          if (lt < 4) c.cam([SPOT.x + 1.2, 1.1, SPOT.z - 0.4], [r.x, 1.3, r.z], 34);
          else {
            c.face(H, { dist: 1.3, yaw: 5, fov: 32, th: -0.15 });
            c.ov.shoujo(smooth(range(lt, 4, 4.6)), lt);
          }
        }
      },
    },
    {
      // silêncio... ele pega o sanduíche
      at: 36,
      set: 'rooftop',
      run(c, lt) {
        akashiSit(c, lt, P.sitFloor(lt), 'blank');
        kentaSit(c, lt, {}, 'scared');
        const H = c.H;
        H.place(HSPOT.x, HSPOT.z, 0.05).pose(P.offer(1)).expr(lt > 6.8 ? 'flustered' : 'blush', 0, -0.3);
        const take = range(lt, 2.2, 2.6);
        if (lt < 2.4) c.show('gift');
        if (lt < 1.4) {
          c.face(c.A, { dist: 0.75, fov: 28, th: -0.03 });
          c.post.set({ vignette: 0.6 });
        } else if (lt < 2.2) {
          c.face(c.K, { dist: 0.8, yaw: -25, fov: 30 });
          c.fx.bigSweat(c.K, lt - 1.4);
        } else {
          const bite = lt > 3.4 ? P.eat(lt - 3.4 + 0.4, true, 1) : add(P.sitFloor(lt), { rsX: 60 * (1 - take) + 40 * take, reX: 30 + 70 * take });
          akashiSit(c, lt, bite, lt > 5.3 ? 'soft' : lt > 3.4 ? 'eat' : 'blank');
          c.show('sandA');
          if (lt < 6.8) c.face(c.A, { dist: 1.1, yaw: -25, fov: 32, th: -0.12 });
          else {
            c.face(H, { dist: 0.9, yaw: 10, fov: 30 });
            c.fx.steam(H, lt - 6.8, 1.3);
            c.fx.hearts(H, lt - 6.9, 5);
            c.ov.shoujo(1, lt, 'rgba(255,150,190,0.6)');
            c.post.set({ lift: [0.05, 0.0, 0.02] });
          }
        }
      },
    },
    {
      // "Tá com febre?"
      at: 44,
      set: 'rooftop',
      run(c, lt) {
        const reach = pulse(lt, 0.3, 0.9, 2.6, 3.0);
        akashiSit(c, lt, add(P.sitFloor(lt), { spX: 20 * reach, rsX: 95 * reach, reX: 20, rsY: 0 }), 'neutral');
        c.show('sandA');
        kentaSit(c, lt, lt > 4.8 ? P.facepalm() : {}, lt > 4.8 ? 'closed' : 'surprised');
        const H = c.H;
        const wave = lt > 2.8;
        H.place(HSPOT.x, HSPOT.z, 0.05).pose(wave ? add(P.handsUp(lt), { lsX: 90 + Math.sin(lt * 25) * 30, rsX: 90 - Math.sin(lt * 25) * 30, leX: 80, reX: 80 }) : P.shy(lt)).expr(wave ? 'flustered' : 'blush');
        if (lt < 2.6) c.cam([SPOT.x + 1.6, 1.05, SPOT.z - 1.0], [SPOT.x + 0.1, 0.9, (SPOT.z + HSPOT.z) / 2], 36);
        else if (lt < 4.8) {
          c.face(H, { dist: 0.95, yaw: -5, fov: 30 });
          c.fx.steam(H, lt, 1.5);
          c.ov.speedLines({ k: 0.4, t: c.t, color: 'rgba(255,90,140,1)' });
        } else {
          c.face(c.K, { dist: 0.85, yaw: -30, fov: 30 });
          c.post.set({ sat: 0.7 });
        }
      },
    },
    {
      // o céu do terraço
      at: 51,
      set: 'rooftop',
      run(c, lt) {
        akashiSit(c, lt, add(P.sitFloor(lt), { rsX: 80, reX: 130, hdX: -10 }), 'bliss');
        c.show('chop');
        kentaSit(c, lt, {}, 'smile');
        c.H.place(HSPOT.x + 0.2, HSPOT.z, 0.3).pose(add(P.shy(lt), { rsX: 100, reX: 120, rsZ: 10 + Math.sin(lt * 14) * 10 })).expr('blush');
        c.camKF(lt, [
          [0, [-1, 2.2, 3.5], [-2.8, 0.9, 8.5], 40],
          [4, [-0.5, 9, -6], [-2.8, 4, 8], 50],
        ]);
        c.ov.fade('#ffffff', smooth(range(lt, 3.5, 4)));
      },
    },
  ],
  lines: [
    [10.5, 1.5, 'akashi', '...Itadakimasu.', { mouth: false }],
    [13.4, 4.4, 'akashi', 'Perfeito. A crosta temperada... o centro rosado...', { thought: true }],
    [18.0, 1.8, 'akashi', 'Isso é felicidade.', { thought: true }],
    [20.3, 2.4, 'kenta', 'De novo rosbife? Você come isso todo dia!'],
    [22.85, 2.6, 'akashi', 'Rosbife é perfeito. Não precisa de mais nada.'],
    [25.55, 1.5, 'kenta', 'Você vai virar um rosbife.'],
    [27.0, 1.0, 'akashi', 'Quer apanhar?'],
    [29.8, 2.0, 'hana', 'Ah, vocês estão aqui!'],
    [32.0, 3.8, 'hana', 'Eu... fiz um sanduíche de rosbife a mais. Quer?'],
    [41.3, 1.5, 'akashi', '...Não é ruim.'],
    [44.2, 2.4, 'akashi', 'Seu rosto tá vermelho. Tá com febre?'],
    [46.8, 1.8, 'hana', 'N-n-não é nada!!', { shout: true }],
    [48.8, 2.2, 'kenta', 'Esse cara é um caso perdido...', { thought: true }],
  ],
  sfx: [
    [0.0, 'wind', { d: 55, v: 0.25, s: 1 }],
    [0.35, 'door', { d: 0.1, v: 0.9 }],
    [0.4, 'clang', { v: 0.35, k: 0.6 }],
    [6.2, 'whoosh', { d: 0.4, v: 0.3, lo: 800, hi: 3000 }],
    [10.4, 'pop', { v: 0.3 }],
    [10.55, 'pop', { v: 0.3 }],
    [28.2, 'creak', { d: 1, v: 0.5 }],
    [37.5, 'gulp', { v: 0.6 }],
    [39.5, 'heart', { v: 0.5 }],
    [40.3, 'heart', { v: 0.5 }],
    [42.8, 'hiss', { d: 1.5, v: 0.5 }],
    [46.7, 'boing', { v: 0.45 }],
    [48.8, 'slide', { v: 0.35, down: 1 }],
  ],
};
