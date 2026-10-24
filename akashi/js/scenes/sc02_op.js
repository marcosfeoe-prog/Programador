// Cena 2 — Abertura "Kōyō Crimson" (0:25–1:55). 64 compassos de rock de anime:
// o Akashi entrando na escola em câmera lenta, alunos abrindo caminho,
// cartões dos personagens, montagem de luta, rosbife, o terraço ao pôr do sol
// e o logotipo.
import { P, V, walk, crowd, kf, range, smooth, pulse, easeOut, easeIn, backOut, PI, add, hash, tremble, seq, mix } from './kit.js';
import { VW, VH } from '../overlay.js';

const BAR = 90 / 64;
const b = (n) => n * BAR;

const DAY = { sky: 'day' };
const SUNSET_ROOF = {
  sky: 'sunset',
  skyOver: { sunDir: [1, 0.08, 0.25] },
  sun: { color: 0xffa060, int: 2.4, dir: [1, 0.18, 0.25], box: 14, center: [0, 0, 6] },
  hemi: { sky: 0xb08ab8, ground: 0x6a4a3a, int: 1.15 },
  rim: 0x8a3a10,
  fog: { color: 0xd08a7a, near: 100, far: 700 },
};
const VOID_DARK = {
  hemi: { sky: 0x553040, ground: 0x100008, int: 0.5 },
  sun: { color: 0xff3a2a, int: 3.2, dir: [-0.6, 0.35, -0.9], shadow: false },
  rim: 0xff2020,
};

// Pinceladas vermelhas no escuro (início da abertura).
function slashes(ov, lt) {
  const g = ov.g;
  const hits = [0, b(0) + BAR * 0.375, BAR * 0.75, BAR, BAR * 1.375, BAR * 1.75];
  hits.forEach((h, i) => {
    const age = lt - h;
    if (age < 0) return;
    const k = easeOut(range(age, 0, 0.12));
    const x0 = 200 + hash(i * 3.3) * 900;
    const y0 = 150 + hash(i * 7.7) * 600;
    const ang = -0.5 + hash(i * 5.1) * 0.6;
    const len = 900 + hash(i) * 500;
    g.save();
    g.translate(x0, y0);
    g.rotate(ang);
    g.fillStyle = i % 2 ? '#ff2a2a' : '#c0101e';
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(len * 0.5 * k, -40, len * k, 10);
    g.lineTo(len * k - 40, 60);
    g.quadraticCurveTo(len * 0.5 * k, 30, 0, 50);
    g.closePath();
    g.fill();
    for (let d = 0; d < 6; d++) {
      g.beginPath();
      g.arc(len * k * (0.2 + hash(i * 9 + d) * 0.8), 70 + hash(d + i) * 50, 4 + hash(d * 3 + i) * 8, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  });
}

const CLOSEUPS = [
  ['akashi', 'glare', 0xc0101e, 0x300408],
  ['hana', 'smile', 0xf06a9a, 0x501830],
  ['kenta', 'surprised', 0x2a6ad0, 0x0a1a40],
  ['ryuji', 'grin', 0xe8b020, 0x403008],
  ['goro', 'angry', 0x9a6030, 0x2a1408],
  ['shin', 'smirk', 0x8a50d0, 0x200a40],
  ['tanaka', 'scared', 0x40a060, 0x0a2a10],
  ['akashi', 'menace', 0x000000, 0x400000],
];

export default {
  name: 'Abertura — "Kōyō Crimson"',
  start: 25,
  dur: 90,
  shots: [
    {
      at: 0,
      set: 'void',
      run(c, lt) {
        c.set.look({ c1: 0x000000, c2: 0x000000, mode: 0, floor: false });
        c.cam([0, 1.5, 6], [0, 1.5, 0], 40);
        c.ov.fade('#000', 1);
        slashes(c.ov, lt);
        c.ov.speedLines({ k: smooth(range(lt, 1.6, 2.6)), t: c.t, color: '#ffffff', inner: 0.5 });
      },
    },
    {
      // câmera lenta: o Akashi atravessa o pátio das cerejeiras
      at: b(2),
      set: 'school',
      env: DAY,
      run(c, lt) {
        const A = c.A;
        const z = 17 - lt * 0.6;
        walk(A, lt, [[0, 17], [0, 8]], 0.6, { style: 'swagger' });
        A.pose(P.bagShoulder(A.p));
        c.show('bag');
        A.wind = 0.7;
        A.expr('neutral');
        c.cam([0.5, 0.75 + lt * 0.03, z - 3.0], [0, 1.45, z], 38);
        c.fx.petals(V(0, 0, z - 2), lt * 0.6 + 70, 420, [10, 6, 10], [0.4, 0, 0.6], 0.06);
        c.ov.credit(['UMA PRODUÇÃO', 'Estúdio Programador'], lt - 0.1, 3.6, 'left');
        c.ov.credit(['ANIMAÇÃO, MÚSICA E EFEITOS', 'tudo feito em código'], lt - 3.9, 4.2, 'left');
        c.post.set({ bloom: 0.75 });
      },
    },
    {
      // vista de cima: os alunos abrem caminho
      at: b(8),
      set: 'school',
      env: DAY,
      run(c, lt) {
        const A = c.A;
        const r = walk(A, lt, [[0, 11], [0, 3]], 1.0, { style: 'swagger' });
        A.pose(P.bagShoulder(A.p));
        c.show('bag');
        A.wind = 0.4;
        for (let i = 0; i < 12; i++) {
          const s = i % 2 ? 1 : -1;
          const z0 = 9.5 - Math.floor(i / 2) * 1.3;
          const near = smooth(range(r.z - z0, 2.5, 0.5));
          const x = s * (1.1 + near * 1.6);
          const st = c.st[i + 2];
          st.place(x, z0, s > 0 ? -PI / 2 + 0.4 : PI / 2 - 0.4);
          st.pose(near > 0.1 ? add(P.scared(lt + i), tremble(lt + i)) : P.idle(lt + i));
          st.expr(near > 0.1 ? 'scared' : 'neutral');
          if (near > 0.4) c.fx.sweat(st, lt - 1 + i * 0.1);
        }
        c.camKF(lt, [
          [0, [0, 7.5, 18], [0, 0.5, 7], 40],
          [b(4), [0, 5.2, 14.5], [0, 0.6, 3.5], 40],
        ]);
        c.fx.petals(V(0, 0, 8), lt + 90, 300, [12, 7, 12]);
        c.ov.credit(['PERSONAGENS', 'Akashi · Hana · Kenta · Ryuji'], lt - 0.2, 5.2, 'right');
      },
    },
    {
      // corte: aluno deixa o pão cair
      at: b(12),
      set: 'school',
      env: DAY,
      run(c, lt) {
        const s = c.st[5];
        s.place(-2.2, 6, PI / 2).pose(add(P.scared(lt), { rsX: 40 - lt * 30 })).expr('shock', 0.8);
        const br = c.show('wBread');
        const y = Math.max(0.05, 1.0 - 4.9 * lt * lt);
        br.position.set(-2.0, y, 6.3);
        br.rotation.set(lt * 6, 0, lt * 4);
        c.face(s, { dist: 1.2, yaw: 30, fov: 34, th: -0.15 });
        c.fx.excl(s, lt - 0.1);
        c.ov.speedLines({ k: 0.7, t: c.t, color: '#000' });
      },
    },
    {
      // corte: o professor se esconde atrás de uma cerejeira
      at: b(13),
      set: 'school',
      env: DAY,
      run(c, lt) {
        const T = c.T;
        T.place(8.25, -6.6, -PI / 2 - 0.3).pose(add(P.scared(lt), { spZ: 18, hdZ: 12 })).expr('scared', -0.8);
        c.cam([5.5, 1.6, -4.0], [7.9, 1.5, -6.8], 32);
        c.fx.bigSweat(T, lt);
      },
    },
    {
      // corte: o olhar do Akashi
      at: b(14),
      set: 'void',
      env: VOID_DARK,
      run(c, lt) {
        c.set.look({ c1: 0x3a0006, c2: 0x000000, c3: 0xff2a2a, mode: 1, spin: 0.4, floor: false });
        const A = c.A;
        A.place(0, 0, 0).pose(P.pockets(lt)).expr('menace');
        A.noBlink = true;
        c.face(A, { dist: 0.55 - lt * 0.05, fov: 28, h: 0.0, th: -0.01 });
        c.ov.speedLines({ k: 1, t: c.t, color: '#000', inner: 0.5 });
        c.post.set({ contrast: 1.2, chroma: 0.006 });
      },
    },
    {
      // corte: Kenta acenando, nervoso
      at: b(15),
      set: 'school',
      env: DAY,
      run(c, lt) {
        const K = c.K;
        K.place(1.2, -31, 0.2).pose(P.wave(lt)).expr('smile');
        c.face(K, { dist: 1.5, yaw: 10, fov: 32, th: -0.2 });
        c.fx.bigSweat(K, lt);
      },
    },
    {
      // Hana debaixo da cerejeira
      at: b(16),
      set: 'school',
      env: DAY,
      run(c, lt) {
        const H = c.H;
        const turn = smooth(range(lt, 1.5, 2.8));
        H.place(-5.6, -6.5, PI * 0.15 + turn * 0.6).pose(add(P.shy(lt), { hdX: -20 * (1 - turn), hdY: 25 * (1 - turn) })).expr(turn > 0.6 ? 'smile' : 'soft', 0, 0.3 * (1 - turn));
        H.wind = 1;
        c.camKF(lt, [
          [0, [-4.0, 1.5, -3.6], [-5.6, 1.6, -6.5], 30],
          [b(4), [-4.4, 1.45, -4.3], [-5.6, 1.45, -6.5], 26],
        ]);
        c.fx.petals(V(-5.6, 0, -6), lt + 120, 380, [8, 6, 8], [1, 0, 0.5], 0.06);
        c.ov.charCard('HANA MIZUKI', 'a aluna transferida', ['Gentil e sorridente', 'Corajosa quando precisa', 'Tem uma quedinha por alguém...'], lt - 0.6, '#e85a8a', 'right');
        c.post.set({ bloom: 0.9, sat: 1.15 });
      },
    },
    {
      // Kenta arruma os óculos (reflexo)
      at: b(20),
      set: 'hallway',
      run(c, lt) {
        const K = c.K;
        const up = pulse(lt, 0.4, 0.9, 3.2, 3.8);
        K.place(2, 0.2, -PI / 2 + 0.3).pose(add(P.idle(lt), { rsX: 100 * up, rsZ: -18 * up, rsY: -40 * up, reX: 140 * up })).expr(up > 0.5 ? 'smirk' : 'neutral');
        c.camKF(lt, [
          [0, [0.4, 1.6, 0.9], [2, 1.55, 0.2], 32],
          [b(4), [0.7, 1.58, 0.8], [2, 1.55, 0.2], 28],
        ]);
        if (up > 0.6) c.fx.sparkles(K.headWorld(V(0, 0, 0), -0.01).add(c.fx.right.clone().multiplyScalar(-0.04)), lt, 2, 0.05, 0.08, 7);
        c.ov.charCard('KENTA MORI', 'o único amigo do Akashi', ['Bom aluno', 'Medroso', 'Fala demais'], lt - 0.6, '#3a7ad0', 'left');
      },
    },
    {
      // os valentões
      at: b(24),
      set: 'void',
      env: { ...VOID_DARK, sun: { color: 0xffc040, int: 2.6, dir: [0.5, 0.6, 0.9], shadow: false }, hemi: { sky: 0x6a5020, ground: 0x200a00, int: 0.9 }, rim: 0xffa020 },
      run(c, lt) {
        c.set.look({ c1: 0xb8860b, c2: 0x2a1000, c3: 0x000000, mode: 2, floor: true });
        c.R.place(0, 0, 0).pose(P.crossArms(lt)).expr('grin');
        c.G.place(-1.1, -0.6, 0.25).pose(P.knuckles(lt)).expr('angry');
        c.S.place(1.0, -0.5, -0.25).pose(add(P.pockets(lt), { hdZ: -8 })).expr('smirk');
        c.camKF(lt, [
          [0, [0.2, 0.7, 4.8], [0, 1.45, 0], 36],
          [b(4), [0.1, 0.9, 3.9], [0, 1.5, 0], 34],
        ]);
        c.ov.charCard('RYUJI & CIA.', 'os valentões do colégio', ['Ryuji: o chefe', 'Goro: o grandalhão', 'Shin: o sorrateiro'], lt - 0.5, '#c8a020', 'right');
        c.post.set({ contrast: 1.15 });
      },
    },
    {
      // terraço ao pôr do sol: câmera gira em volta do Akashi
      at: b(28),
      set: 'rooftop',
      env: SUNSET_ROOF,
      run(c, lt) {
        const A = c.A;
        A.place(0, 8.4, 0.15).pose(P.pockets(lt)).expr(lt > 5.2 ? 'determined' : 'closed');
        A.wind = 1.4;
        A.noBlink = true;
        const ang = -2.6 + easeOut(range(lt, 0, 5.2)) * 2.5;
        const d = 3.4 - smooth(range(lt, 3.5, 5.3)) * 2.6;
        const h = A.headWorld(V(0, 0, 0));
        c.cam([h.x + Math.sin(ang) * d, h.y - 0.3 + d * 0.12, h.z + Math.cos(ang) * d], [h.x, h.y - 0.05 - (d - 0.8) * 0.2, h.z], 34);
        if (lt > 5.2) c.post.set({ flash: 1 - smooth(range(lt, 5.2, 5.5)), zoom: 0.08 * (1 - smooth(range(lt, 5.2, 5.6))) });
        c.fx.petals(V(0, 0, 8), lt + 140, 200, [10, 5, 10], [-2, 0, 0], 0.05);
      },
    },
    {
      // cartão do Akashi
      at: b(32),
      set: 'void',
      env: VOID_DARK,
      run(c, lt) {
        c.set.look({ c1: 0xd0101e, c2: 0x200004, c3: 0x000000, mode: 1, spin: 0.6, floor: true });
        const A = c.A;
        A.place(0, 0, -0.35).pose(P.fight(lt)).expr('glare');
        A.wind = 1;
        c.fx.aura(A, c.t, 0.45);
        const ang = -0.5 + lt * 0.08;
        c.cam([Math.sin(ang) * 3.4, 1.0, Math.cos(ang) * 3.4], [0, 1.15, 0], 34);
        c.ov.charCard('AKASHI', 'o delinquente de Kōyō', ['Irrita-se fácil', 'Determinado', 'Ama rosbife'], lt - 0.3, '#d0101e', 'left');
      },
    },
    {
      // montagem de luta (silhuetas contra o vermelho)
      at: b(36),
      set: 'void',
      env: { ...VOID_DARK, hemi: { sky: 0x200008, ground: 0x000000, int: 0.25 } },
      run(c, lt) {
        c.set.look({ c1: 0x8a0010, c2: 0x000000, c3: 0xffffff, mode: 1, spin: 1.5, floor: true });
        const A = c.A;
        const bar = Math.floor(lt / BAR);
        const u = (lt % BAR) / BAR;
        const foes = [c.X1, c.X2, c.G, c.S];
        const foe = foes[bar % 4];
        A.place(-0.55, 0, PI / 2);
        foe.place(0.5, 0, -PI / 2);
        const hitT = 0.42;
        if (bar === 0) A.pose(P.punchR(u * 1.2));
        else if (bar === 1) A.pose(P.kick(u * 1.1));
        else if (bar === 2) A.pose(P.uppercut(u * 1.15));
        else A.pose(P.punchL(u * 1.2));
        A.expr('shout');
        const hu = u - hitT;
        foe.pose(hu > 0 ? P.hit(hu * 2.5, 1.4) : P.fight(lt)).expr(hu > 0 ? 'pain' : 'angry');
        if (hu > 0) foe.root.position.x += easeOut(range(hu, 0, 0.4)) * 1.2;
        const angs = [0.4, -0.6, 0.9, -0.2];
        const a = angs[bar % 4] + lt * 0.05;
        c.cam([Math.sin(a) * 3.2, 0.9 + (bar % 2) * 0.5, Math.cos(a) * 3.2], [0, 1.2, 0], 34);
        const impact = hu > 0 && hu < 0.06;
        c.post.set({ invert: impact ? 1 : 0, contrast: 1.25 });
        if (hu > 0) {
          const p = foe.headWorld(V(0, 0, 0), -0.25);
          c.fx.impact(p, hu * BAR, 0.9);
          c.ov.onoma(['POW!', 'BAM!', 'DON!', 'SOC!'][bar % 4], 1300 - (bar % 2) * 700, 330 + (bar % 3) * 80, 170, hu * BAR, { color: '#ffe23a', fill2: '#ff6a00' });
          c.shake(0.05 * (1 - range(hu, 0, 0.2)));
        }
        c.ov.speedLines({ k: 0.5, t: c.t, color: '#000', inner: 0.6 });
      },
    },
    {
      // o rosbife (e a Hana espiando)
      at: b(40),
      set: 'rooftop',
      run(c, lt) {
        const A = c.A;
        A.place(1.5, 9.0, PI).pose(P.eat(lt)).expr(lt < b(2) ? 'bliss' : 'eat');
        c.show('bento');
        c.show('chop');
        const H = c.H;
        if (lt < b(2)) {
          c.face(A, { dist: 1.2, yaw: -10, fov: 30, th: -0.15 });
          c.fx.sparkles(A.headWorld(V(0, 0, 0), -0.1), lt, 8, 0.4, 0.14);
          c.ov.shoujo(1, lt, 'rgba(255,200,120,0.5)');
        } else {
          H.place(-7.6, -3.95, 0.5).pose(add(P.shy(lt), { spZ: -10, hdZ: -14 })).expr('blush', 1);
          c.cam([-6.2, 1.5, -1.6], [-7.4, 1.42, -3.9], 30);
          c.fx.hearts(H, lt - b(2));
        }
      },
    },
    {
      // andando na beira do rio ao pôr do sol
      at: b(44),
      set: 'river',
      run(c, lt) {
        const A = c.A;
        const r = walk(A, lt, [[-16, 21.2], [-4, 21.2]], 1.0, { style: 'swagger', y: 4.5 });
        A.pose(P.bagShoulder(A.p));
        c.show('bag');
        A.wind = 0.8;
        A.expr('neutral');
        c.cam([r.x + 2.2, 3.4, 14.5], [r.x, 6.0, 21.2], 34);
        c.post.set({ bloom: 1 });
      },
    },
    {
      // os três no terraço
      at: b(48),
      set: 'rooftop',
      run(c, lt) {
        c.A.place(0.4, 8.2, PI).pose(P.crossArms(lt)).expr('annoyed');
        c.A.wind = 0.8;
        c.H.place(-0.7, 7.6, PI + 0.4).pose(P.shy(lt)).expr('smile', 0.5);
        c.H.wind = 0.8;
        c.K.place(1.5, 7.4, PI - 0.35).pose(P.wave(lt)).expr('happy');
        c.camKF(lt, [
          [0, [0.3, 1.5, 4.8], [0.3, 1.45, 8], 34],
          [b(4), [0.4, 6.5, -4], [0.3, 1.2, 8], 42],
        ]);
        c.fx.petals(V(0, 0, 6), lt + 160, 300, [12, 6, 12], [-1, 0, 0.5]);
      },
    },
    {
      // retratos rápidos
      at: b(52),
      set: 'void',
      run(c, lt) {
        const k = Math.min(7, Math.floor(lt / (BAR / 2)));
        const [who, ex, c1, c2] = CLOSEUPS[k];
        const ch = c.cast[who];
        c.set.look({ c1, c2, c3: 0xffffff, mode: k % 2 ? 2 : 1, spin: 0.8, floor: false });
        ch.place(0, 0, (k % 2 ? 0.3 : -0.3)).pose(P.idle(lt)).expr(ex);
        ch.noBlink = true;
        c.face(ch, { dist: 0.75, fov: 30, yaw: k % 2 ? -14 : 14 });
        c.post.set({ flash: 1 - smooth(range(lt % (BAR / 2), 0, 0.15)) });
      },
    },
    {
      // o soco na câmera
      at: b(56),
      set: 'void',
      env: VOID_DARK,
      run(c, lt) {
        c.set.look({ c1: 0x500008, c2: 0x000000, c3: 0xff2020, mode: 1, spin: 0.3, floor: true });
        const A = c.A;
        const hitAt = 4.9;
        const turn = smooth(range(lt, 0, 1.5));
        A.place(0, 0, PI - PI * (1 - turn));
        const u = range(lt, 3.5, hitAt + 0.6);
        A.pose(lt < 3.5 ? P.fight(lt, turn) : P.punchR(u * 0.95)).expr(lt > 3.5 ? 'shout' : 'glare');
        A.wind = 1;
        c.fx.aura(A, c.t, 0.6 + range(lt, 2, 4.5) * 0.6);
        const push = easeIn(range(lt, 3.9, hitAt));
        c.cam([0.15, 1.45, -2.2 + push * 1.35], [0, 1.4, 0], 40 - push * 6);
        c.ov.crack(VW / 2 + 60, VH / 2 + 40, lt - hitAt);
        if (lt > hitAt) {
          c.post.set({ flash: 1 - smooth(range(lt, hitAt, hitAt + 0.25)), invert: lt < hitAt + 0.08 ? 1 : 0 });
          c.shake(0.04 * (1 - range(lt, hitAt, hitAt + 0.6)));
        }
      },
    },
    {
      // logotipo
      at: b(60),
      set: 'void',
      run(c, lt) {
        c.set.look({ c1: 0x000000, c2: 0x000000, mode: 0, floor: false });
        c.cam([0, 1.5, 4], [0, 1.5, 0], 40);
        c.ov.burstBg('#120004', '#2a0008', lt);
        c.ov.speedLines({ k: 1, t: c.t, color: '#d0101e', inner: 0.72 });
        c.ov.logo(lt, { y: VH / 2 - 60, sub: 'EPISÓDIO 1 — O DELINQUENTE DE KŌYŌ', subAge: lt - 0.8 });
        c.ov.fade('#ffffff', smooth(range(lt, 4.9, 5.6)));
      },
    },
  ],
  lines: [],
  sfx: [
    [b(12) + 0.25, 'pop', { v: 0.5 }],
    [b(14), 'whoosh', { d: 0.4, v: 0.5 }],
    [b(56) + 4.9, 'punch', { big: 1, v: 1 }],
    [b(56) + 4.95, 'scratch', { v: 0.5 }],
  ],
};
