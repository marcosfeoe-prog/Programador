// Cena 8 — O beco escuro (6:10–7:05). O Akashi caminha sozinho entre neons e
// poças, pensando no que dizem dele. Um flashback da infância mostra por
// que ele é assim. Então, ao longe, um grito: a Hana.
import { P, V, walk, kf, range, smooth, pulse, easeOut, easeIn, PI, add, mix, tremble } from './kit.js';

const NORTH = PI; // anda para -Z
const zAt = (t) => 16 - Math.min(t, 38.5) * 0.43; // posição no beco no tempo da cena

function akashiWalk(c, st, layer = {}) {
  const z = zAt(st);
  const moving = st < 38.5;
  c.A.place(0.15, z, NORTH).pose(P.bagShoulder(add(moving ? P.swagger(st, 0.45) : P.pockets(st), layer)));
  c.show('bag');
  return z;
}

const SEPIA = { sky: 'sunset', rim: 0x7a3a10 };

export default {
  name: 'O beco escuro',
  start: 370,
  dur: 55,
  shots: [
    {
      at: 0,
      set: 'alley',
      run(c, lt) {
        const z = akashiWalk(c, lt);
        c.A.expr('neutral', 0, -0.2);
        c.camKF(lt, [
          [0, [0.5, 0.75, z - 3.6], [0.1, 1.5, z], 38],
          [8, [0.3, 0.9, z - 3.2], [0.1, 1.55, z], 34],
        ]);
        c.fx.dust(V(1.2, 0.2, 12), (lt * 0.8) % 2, 6, 0.6, 2, 3, 'steam');
        c.ov.fade('#000', 1 - smooth(range(lt, 0, 1.2)));
      },
    },
    {
      // pés na poça (reflexos do neon)
      at: 8,
      set: 'alley',
      run(c, lt) {
        const st = 8 + lt;
        const z = akashiWalk(c, st);
        c.cam([0.6, 0.12, z - 1.4], [0.15, 0.25, z + 0.3], 44);
        const ph = (st * 0.45 * 0.8 * 2) % 1;
        if (ph < 0.25) c.fx.splash(V(0.25, 0.02, z + 0.1), ph * 2, 0.35, Math.floor(st));
      },
    },
    {
      at: 12.5,
      set: 'alley',
      run(c, lt) {
        const st = 12.5 + lt;
        const z = akashiWalk(c, st, { hdY: 30 * pulse(lt, 1, 1.6, 3.6, 4.4) });
        c.A.expr('neutral', 0.8);
        c.cam([-1.0, 1.7, z - 2.0], [0.15, 1.55, z + 0.3], 36);
      },
    },
    {
      // perfil, gota caindo do cabelo
      at: 18,
      set: 'alley',
      run(c, lt) {
        const st = 18 + lt;
        const z = akashiWalk(c, st);
        c.A.expr(lt > 5 ? 'sad' : 'neutral', 0, -0.4);
        c.A.st.lx = 0;
        c.face(c.A, { dist: 0.7, yaw: 85, fov: 30, th: -0.04 });
        const h = c.A.headWorld(V(0, 0, 0), 0.1);
        const ph = (lt * 0.7) % 1;
        c.fx.sprite('drop', h.clone().add(V(0, -ph * 0.6, -0.08)), 0.025, { opacity: 1 - ph });
        c.post.set({ sat: 0.85 });
      },
    },
    {
      // flashback: o pequeno Akashi não sai da frente
      at: 28,
      set: 'river',
      env: SEPIA,
      run(c, lt) {
        const K = c.cast.kidAkashi;
        const V1 = c.cast.kidVictim;
        const B1 = c.cast.kidBully1;
        const B2 = c.cast.kidBully2;
        const push = pulse(lt, 4.2, 4.4, 4.8, 5.4);
        K.place(-1, 3, PI / 2).pose(add(P.fight(lt, 0.35), { spX: -10 * push, hdX: -6 })).expr(lt > 7 ? 'shout' : 'determined');
        K.root.position.x -= push * 0.25;
        V1.place(-1.9, 3.1, PI / 2 + 0.3).pose(P.cower(lt)).expr('sad', 1);
        B1.place(0.15, 3.0, -PI / 2).pose(lt > 4 && lt < 5 ? P.reach(1) : P.crossArms(lt)).expr('grin');
        B2.place(0.4, 2.2, -PI / 2 - 0.4).pose(P.pockets(lt)).expr('smirk');
        if (lt < 4) c.camKF(lt, [
          [0, [-0.7, 1.2, 6.5], [-0.7, 0.75, 3], 36],
          [4, [-0.8, 1.0, 5.4], [-0.8, 0.75, 3], 34],
        ]);
        else if (lt < 7.6) c.face(B1, { dist: 1.1, yaw: -20, fov: 34, th: -0.1 });
        else c.face(K, { dist: 0.8, yaw: 15, fov: 32 });
        c.post.set({ sepia: 0.85, vignette: 0.8, grain: 0.07, contrast: 0.95, bloom: 0.3 });
        c.ov.fade('#fff', 1 - smooth(range(lt, 0, 0.4)));
        c.ov.fade('#fff', smooth(range(lt, 9.6, 10)));
      },
    },
    {
      // de volta ao beco: o punho
      at: 38,
      set: 'alley',
      run(c, lt) {
        const st = 38 + lt;
        const z = akashiWalk(c, st, mix({ rsX: 0 }, { rsX: 0 }, 0));
        const lift = smooth(range(lt, 0.8, 1.6));
        c.A.place(0.15, z, NORTH - 0.3);
        c.A.pose(add(P.pockets(st), { lsX: 70 * lift, lsZ: -5, lsY: -30 * lift, leX: 110 * lift, lFist: lt > 5.5 ? 1 : 0.4, hdX: 14 * lift }));
        c.A.expr(lt > 5.8 ? 'determined' : 'neutral', 0.4, -0.6);
        if (lt < 4) c.cam([1.0, 1.9, z - 1.6], [0.1, 1.35, z], 34);
        else {
          c.face(c.A, { dist: 0.75, yaw: -25, fov: 30, th: -0.08 });
          if (lt > 5.8) c.shake(0.004 * (1 - range(lt, 5.8, 6.4)));
        }
        c.ov.fade('#fff', 1 - smooth(range(lt, 0, 0.35)));
      },
    },
    {
      // o grito
      at: 46,
      set: 'alley',
      run(c, lt) {
        const z = zAt(46);
        if (lt < 3) {
          c.A.place(0.15, z, NORTH - 0.3 + smooth(range(lt, 0.4, 0.8)) * 0.3).pose(P.bagShoulder(P.pockets(lt))).expr(lt > 0.5 ? 'shock' : 'neutral');
          c.show('bag');
          c.A.noBlink = true;
          c.face(c.A, { dist: 0.6 - easeOut(range(lt, 0.4, 0.7)) * 0.12, fov: 28 });
          c.post.set({ zoom: 0.07 * pulse(lt, 0.4, 0.5, 0.8, 1.4), chroma: 0.004 });
          c.ov.speedLines({ k: smooth(range(lt, 0.4, 0.6)), t: c.t, color: '#000', inner: 0.5 });
          c.fx.excl(c.A, lt - 0.45);
        } else {
          const r = walk(c.A, lt, [[0.15, z], [0.15, -30]], 6.5, { style: 'run', t0: 3 });
          c.A.expr('determined');
          c.cam([0.6, 1.2, r.z - 3.5], [0.15, 1.3, r.z], 46);
          c.ov.dashLines({ k: 0.7, t: c.t, color: 'rgba(255,255,255,0.6)' });
          const ph = (lt * 2.9) % 1;
          if (ph < 0.3) c.fx.splash(V(0.2, 0.02, r.z + 0.3), ph, 0.5, Math.floor(lt * 2.9));
          c.ov.fade('#000', smooth(range(lt, 8.4, 9)));
        }
      },
    },
  ],
  lines: [
    [8.5, 3.6, 'akashi', 'Delinquente. Monstro. Encrenqueiro.', { thought: true }],
    [12.6, 4.0, 'akashi', 'É assim que me chamam desde sempre.', { thought: true }],
    [18.5, 4.2, 'akashi', 'Todo mundo foge quando me vê... Talvez seja melhor assim.', { thought: true }],
    [23.2, 4.0, 'akashi', 'Ninguém se machuca se ficar longe de mim.', { thought: true }],
    [28.6, 4.2, 'akashi', 'Desde criança... eu só sei fazer uma coisa.', { thought: true }],
    [33.4, 2.0, 'kid', 'Sai da frente, nanico!'],
    [35.7, 2.0, 'kidakashi', 'Não saio.'],
    [38.6, 5.4, 'akashi', 'Ficar de pé. E não deixar ninguém ser pisado na minha frente.', { thought: true }],
    [46.3, 2.0, 'hana', 'Me solta! Socorro!', { mouth: false, shout: true, noVoice: true }],
  ],
  sfx: [
    [0, 'buzz', { d: 28, v: 0.5, s: 1 }],
    [0, 'hiss', { d: 28, v: 0.25, s: 1 }],
    ...[2.3, 6.1, 11.7, 15.2, 21.4, 25.8, 40.9].map((t) => [t, 'drip', { v: 0.35 }]),
    ...[0.3, 1.6, 2.9, 4.2, 5.5, 6.8, 8.1, 9.4, 10.7, 12.0, 13.3, 14.6, 15.9, 17.2, 18.5, 19.8, 21.1, 22.4, 23.7, 25.0, 26.3].map((t) => [t, 'step', { n: 'wet', v: 0.35, r: 0.5 }]),
    [28.0, 'whoosh', { d: 0.6, v: 0.3, lo: 1500, hi: 5000 }],
    [32.2, 'thud', { v: 0.4 }],
    [38, 'buzz', { d: 8.3, v: 0.5, s: 1 }],
    [44.0, 'knuckle', { v: 0.6 }],
    ...[49.0, 49.35, 49.7, 50.05, 50.4, 50.75, 51.1, 51.45, 51.8, 52.15, 52.5, 52.85, 53.2, 53.55].map((t) => [t, 'step', { n: 'wet', v: 0.55 }]),
  ],
};
