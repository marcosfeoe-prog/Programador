// Intervalo (eyecatch, 4:30–4:35) e Cena 6 — Atrás do ginásio (4:35–5:30).
// O Ryuji e a gangue encurralam um calouro; uma sombra comprida se aproxima.
// O Akashi não precisa dar um soco: só um olhar e eles fogem.
import { P, V, walk, kf, range, smooth, pulse, easeOut, easeIn, backOut, PI, add, mix, tremble, talkWindow } from './kit.js';
import { VW, VH } from '../overlay.js';

export const eyecatch = {
  name: 'Intervalo',
  start: 270,
  dur: 5,
  shots: [
    {
      at: 0,
      set: 'void',
      env: { hemi: { sky: 0xffffff, ground: 0x886666, int: 1.6 }, sun: { color: 0xffffff, int: 2, dir: [0.5, 0.7, 1], shadow: false } },
      run(c, lt) {
        const second = lt > 2.3;
        c.set.look(second ? { c1: 0xffb8d0, c2: 0xff7aa0, c3: 0xffffff, mode: 2, floor: false } : { c1: 0xffe0a0, c2: 0xd0101e, c3: 0xffffff, mode: 3, floor: false });
        if (!second) {
          c.A.place(0, 0, -0.25).pose(P.eat(lt + 1)).expr(lt % 1.8 > 0.6 ? 'eat' : 'bliss');
          c.show('bento');
          c.show('chop');
          c.cam([0.4, 1.0, 2.3], [0, 0.55, 0], 34);
          c.fx.sparkles(c.A.headWorld(V(0, 0, 0)), lt, 6, 0.35, 0.12);
        } else {
          c.H.place(0, 0, 0.2).pose(P.shy(lt)).expr('blush');
          c.face(c.H, { dist: 1.25, fov: 32, th: -0.2 });
          c.fx.hearts(c.H, lt - 2.3, 4);
        }
        c.ov.logo(second ? lt - 2.3 : lt, { y: second ? VH - 190 : 170, scale: 0.55 });
        c.post.set({ flash: 1 - smooth(range(second ? lt - 2.3 : lt, 0, 0.2)) });
        c.ov.fade('#000', smooth(range(lt, 4.7, 5)));
      },
    },
  ],
  lines: [],
  sfx: [],
};

const WALL_Z = -2.55;
const Y0 = { x: -12, z: WALL_Z };
const R0 = { x: -12, z: -1.85 };
const G0 = { x: -13.2, z: -1.35 };
const S0 = { x: -10.8, z: -1.45 };

function gang(c, lt, mode = 'bully') {
  const Y = c.Y;
  const R = c.R;
  const G = c.G;
  const S = c.S;
  Y.place(Y0.x, Y0.z, 0).pose(add(P.cower(lt), tremble(lt))).expr('scared', 0, -0.3);
  if (mode === 'bully') {
    R.place(R0.x, R0.z, PI).pose(P.wallSlam(lt)).expr('grin', 0, -0.3);
    G.place(G0.x, G0.z, PI - 0.6).pose(P.crossArms(lt)).expr('grin');
    S.place(S0.x, S0.z, PI + 0.55).pose(add(P.pockets(lt), { hdZ: -10 })).expr('smirk');
  }
}

// Silhueta comprida no chão: o sol baixo vem de +X, a sombra aponta para -X.
function longShadow(c, x0, z0, len) {
  const s = c.set.longShadow;
  const dx = -0.936;
  const dz = -0.352;
  s.visible = true;
  s.scale.set(1.3, len, 1);
  s.rotation.z = PI / 2 - 0.36;
  s.position.set(x0 + dx * len * 0.5, 0.02, z0 + dz * len * 0.5);
}

export default {
  name: 'Atrás do ginásio',
  start: 275,
  dur: 55,
  shots: [
    {
      at: 0,
      set: 'gym',
      run(c, lt) {
        gang(c, lt);
        c.camKF(lt, [
          [0, [-8.4, 1.45, -1.3], [-12.2, 1.25, -2.3], 36],
          [6, [-8.9, 1.45, -1.2], [-12.2, 1.3, -2.3], 32],
        ]);
      },
    },
    {
      at: 6,
      set: 'gym',
      run(c, lt) {
        gang(c, lt);
        if (lt < 3.3) {
          c.G.pose(P.knuckles(lt)).expr('grin');
          c.face(c.G, { dist: 1.0, yaw: 20, fov: 32, th: -0.12 });
        } else {
          c.S.pose(add(P.pockets(lt), { hdX: -12 + Math.sin(lt * 18) * 4, spX: -6 })).expr('laugh');
          c.face(c.S, { dist: 0.85, yaw: -15, fov: 30 });
        }
      },
    },
    {
      // a sombra comprida se aproxima
      at: 12,
      set: 'gym',
      run(c, lt) {
        gang(c, lt);
        const ax = 9 - lt * 1.1;
        c.A.place(ax, -0.6, -PI / 2).pose(P.bagShoulder(P.swagger(lt))).expr('menace');
        c.show('bag');
        longShadow(c, ax, -0.6, 10.5);
        c.camKF(lt, [
          [0, [-6.8, 1.7, 3.2], [2.5, 0.0, -1.6], 40],
          [6, [-7.6, 1.4, 2.6], [0, 0.2, -1.4], 40],
        ]);
        c.post.set({ vignette: 0.7, contrast: 1.1 });
        c.lb = 1;
        c.ov.letterbox(1);
      },
    },
    {
      at: 18,
      set: 'gym',
      run(c, lt) {
        gang(c, lt);
        const turn = smooth(range(lt, 0.1, 0.4));
        c.R.pose(add(P.wallSlam(lt), { hdY: -70 * turn, chY: -20 * turn })).expr(lt > 1.6 ? 'shock' : 'angry', -1);
        c.face(c.R, { dist: 0.8, yaw: -60, fov: 30 });
        c.lb = 1;
        c.ov.letterbox(1);
      },
    },
    {
      // os olhos na sombra
      at: 20.5,
      set: 'gym',
      env: { sun: { dir: [0.95, 0.25, 0.1] }, rim: 0xff6a2a },
      run(c, lt) {
        const A = c.A;
        A.place(-6.4, -0.6, -PI / 2).pose(P.bagShoulder(P.pockets(lt))).expr('menace');
        A.noBlink = true;
        c.show('bag');
        A.wind = 0.4;
        c.face(A, { dist: 0.62 - lt * 0.03, fov: 28, h: -0.03, th: -0.01 });
        c.ov.speedLines({ k: smooth(range(lt, 0.2, 0.6)), t: c.t, color: '#000', inner: 0.55 });
        c.post.set({ contrast: 1.2, tint: [1.1, 0.9, 0.9] });
        c.lb = 1;
        c.ov.letterbox(1);
      },
    },
    {
      // passo a passo, com aura vermelha
      at: 24,
      set: 'gym',
      env: { rim: 0xff3a1a, hemi: { sky: 0xc08080, ground: 0x6a3a2a, int: 1.0 } },
      run(c, lt) {
        const A = c.A;
        const steps = [0, 2.6, 5.2, 7.8];
        let k = 0;
        for (const s of steps) if (lt > s) k++;
        const prog = Math.min(4, k - 1 + smooth(range(lt - steps[k - 1], 0, 0.7)));
        const ax = -6.4 - prog * 0.85;
        A.place(ax, -0.7 - prog * 0.18, -PI / 2 - 0.1).pose(P.bagShoulder(add(P.pockets(lt), { lhX: Math.sin(prog * PI) * 18, rhX: -Math.sin(prog * PI) * 18 }))).expr('menace');
        A.noBlink = true;
        c.show('bag');
        c.fx.aura(A, c.t, 0.4 + range(lt, 0, 8) * 0.5);
        const back = smooth(range(lt, 1, 9)) * 0.7;
        c.Y.place(Y0.x, Y0.z, 0).pose(P.cower(lt)).expr('surprised', 1);
        c.R.place(R0.x - back * 0.5, R0.z, -PI / 2 + PI).pose(add(P.fight(lt, 0.6), tremble(lt, 0.5))).expr('angry', 0);
        c.R.faceTo(ax, -0.7);
        c.G.place(G0.x - back, G0.z, 0).faceTo(ax, -0.7);
        c.G.pose(add(P.scared(lt), tremble(lt))).expr('scared');
        c.S.place(S0.x - back * 0.8, S0.z, 0).faceTo(ax, -0.7);
        c.S.pose(add(P.scared(lt + 1), tremble(lt + 1, 1.5))).expr('shock');
        if (lt < 4.8) {
          c.cam([-13.6, 0.55, -0.3], [ax, 1.5, -0.7], 40);
        } else if (lt < 6.8) {
          c.face(c.S, { dist: 0.8, yaw: 15, fov: 30 });
          c.fx.bigSweat(c.S, lt - 4.8);
        } else {
          c.face(c.G, { dist: 0.9, yaw: -15, fov: 30 });
          c.fx.bigSweat(c.G, lt - 6.8);
        }
        c.post.set({ tint: [1.15, 0.85, 0.85], contrast: 1.12 });
        c.ov.speedLines({ k: 0.3, t: c.t, color: '#3a0000', inner: 0.75 });
        c.lb = 1;
        c.ov.letterbox(1);
      },
    },
    {
      // cara a cara
      at: 34,
      set: 'gym',
      env: { rim: 0xff3a1a },
      run(c, lt) {
        const A = c.A;
        const lean = smooth(range(lt, 3.0, 3.6));
        A.place(-10.45, -1.5, -PI / 2 - 0.2).pose(add(P.bagShoulder(P.pockets(lt)), { spX: 14 * lean, hdX: 8 * lean })).expr('menace');
        A.noBlink = true;
        c.show('bag');
        const R = c.R;
        R.place(-11.6, -1.75, PI / 2 - 0.2).pose(add(lt < 3 ? P.fight(lt, 0.7) : P.scared(lt), tremble(lt, lt > 3 ? 1.5 : 0.3))).expr(lt < 3 ? 'angry' : 'scared');
        c.Y.place(Y0.x, Y0.z, 0.6).pose(P.cower(lt)).expr('surprised');
        if (lt < 3.2) c.face(R, { dist: 0.95, yaw: 20, fov: 30 });
        else if (lt < 8.2) {
          c.cam([-11.0, 1.62, 0.15], [-11.0, 1.6, -1.6], 30);
          c.ov.speedLines({ k: 0.6, t: c.t, color: '#000', inner: 0.6 });
          c.fx.bigSweat(R, lt - 3.4);
        } else {
          c.face(A, { dist: 0.5, fov: 26, th: 0 });
          c.post.set({ mono: 1, monoRed: 1, contrast: 1.3 });
          c.ov.onoma('!!!', 1450, 300, 200, lt - 8.2, { color: '#d0101e', stroke: '#000', dur: 1 });
        }
        c.lb = 1;
        c.ov.letterbox(1);
      },
    },
    {
      // fuga cômica
      at: 42,
      set: 'gym',
      run(c, lt) {
        c.A.place(-10.45, -1.5, -PI / 2 - 0.2).pose(P.bagShoulder(P.pockets(lt))).expr('annoyed');
        c.show('bag');
        c.Y.place(Y0.x + 0.2, Y0.z, 0.6).pose(P.sitBack(lt)).expr('surprised', 1);
        const t0 = 0.3;
        walk(c.R, lt, [[-11.6, -1.6], [-14, 0.5], [-30, 2]], 7, { style: 'run', t0: t0 + 0.4 });
        walk(c.G, lt, [[-13.0, -1.2], [-15, 0.9], [-30, 2.5]], 6.5, { style: 'run', t0: t0 + 0.2 });
        walk(c.S, lt, [[-11.0, -1.2], [-13.5, 1.6], [-30, 3]], 7.5, { style: 'run', t0 });
        for (const ch of [c.R, c.G, c.S]) ch.expr('scared');
        c.R.expr('shout');
        c.cam([-7.5, 1.6, 2.6], [-14, 1.0, -0.5], 42);
        for (let i = 0; i < 3; i++) c.fx.dust(V(-13 - i * 2.5 - lt * 3, 0, 0.8), (lt - 0.5 - i * 0.25) % 1.4, 6, 0.8, 1.2, i + 1);
        c.ov.dashLines({ k: 0.6, t: c.t, color: 'rgba(255,255,255,0.7)', dir: -1 });
        c.ov.onoma('ZUUUM', 520, 420, 110, lt - 0.5, { color: '#ffffff', dur: 2 });
      },
    },
    {
      // "obrigado, senpai"
      at: 48,
      set: 'gym',
      run(c, lt) {
        const Y = c.Y;
        const A = c.A;
        const bow = pulse(lt, 0.2, 0.5, 2.0, 2.4);
        Y.place(-11.3, -1.9, PI / 2 + 0.2).pose(mix(P.idle(lt), P.bow(1.2), bow)).expr(lt > 2.4 ? 'sparkle' : 'closed', 1);
        const r = walk(A, lt, [[-10.0, -1.4], [-4, -0.2], [6, 0.5]], 1.1, { style: 'swagger', t0: 0.8 });
        A.pose(P.bagShoulder(add(A.p, { rsZ: 10 })));
        c.show('bag');
        A.expr('annoyed');
        if (lt < 5.2) {
          c.cam([-8.6, 1.35, 1.0], [-11.4, 1.15, -1.9], 36);
          if (lt > 2.4) c.fx.sparkles(Y.headWorld(V(0, 0, 0)), lt, 5, 0.3, 0.1, 2);
        } else {
          // a Hana viu tudo, escondida atrás da grade
          const H = c.H;
          H.place(5.4, 4.2, -PI / 2 - 0.7).pose(add(P.shy(lt), { hdZ: -10 })).expr('blush', -0.6);
          c.show('hanaBag');
          c.face(H, { dist: 1.0, yaw: -10, fov: 32 });
          c.ov.shoujo(smooth(range(lt, 5.2, 5.8)), lt);
        }
      },
    },
  ],
  lines: [
    [0.6, 2.6, 'ryuji', 'Ei, calouro. Passa a grana do lanche.'],
    [3.5, 2.2, 'yuuto', 'M-mas eu não tenho...'],
    [6.6, 2.6, 'goro', 'Então a gente vai ter que te ensinar uma lição.'],
    [9.5, 1.6, 'shin', 'Hehehe!'],
    [15.5, 2.3, 'akashi', '...Vocês estão fazendo barulho.', { mouth: false }],
    [18.3, 2.0, 'ryuji', 'Hã?! Quem você pensa que—', { shout: true }],
    [25.5, 3.0, 'akashi', 'Eu tô tentando digerir meu rosbife em paz.'],
    [28.8, 1.8, 'shin', 'R-Ryuji... é o Akashi...'],
    [30.8, 2.2, 'goro', 'O delinquente de Kōyō...'],
    [34.3, 2.4, 'ryuji', 'T-tsc! Acha que me assusta?!'],
    [37.5, 1.6, 'akashi', 'Some daqui.'],
    [40.0, 1.6, 'akashi', 'Agora.'],
    [42.6, 1.0, 'shin', 'AAAAH!', { shout: true }],
    [43.8, 2.6, 'ryuji', 'Isso não vai ficar assim, Akashi!!', { shout: true }],
    [48.3, 2.2, 'yuuto', 'O-obrigado, Akashi-senpai!'],
    [50.7, 2.7, 'akashi', 'Eu não fiz nada. Vocês é que estavam fazendo barulho.', { mouth: false }],
    [53.4, 1.6, 'hana', 'Ele é... gentil.', { thought: true }],
  ],
  sfx: [
    [0.0, 'wind', { d: 55, v: 0.18, s: 1 }],
    [0.4, 'thud', { v: 0.5 }],
    [6.3, 'knuckle', { v: 0.7 }],
    ...[12.2, 13.1, 14.0, 14.9, 15.8, 16.7].map((t) => [t, 'step', { n: 'gravel', v: 0.55 }]),
    [24.1, 'step', { n: 'heavy', v: 1 }],
    [26.7, 'step', { n: 'heavy', v: 1 }],
    [29.3, 'step', { n: 'heavy', v: 1 }],
    [31.9, 'step', { n: 'heavy', v: 1 }],
    [42.3, 'scratch', { v: 0.5 }],
    [42.6, 'whoosh', { d: 0.6, v: 0.6 }],
    ...[42.8, 43.0, 43.15, 43.3, 43.5, 43.65, 43.8, 44.0].map((t) => [t, 'step', { n: 'gravel', v: 0.4 }]),
  ],
};
