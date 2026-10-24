// Cena 10 — Desfecho (8:50–9:20) e Cena 11 — Encerramento (9:20–9:50).
// A Hana agradece; o Akashi pega a mochila e vai embora sem dizer uma
// palavra, como se aquilo fosse só o trabalho dele. Depois: créditos,
// ilustrações do encerramento e a prévia do próximo episódio.
import { P, V, walk, kf, range, smooth, pulse, easeOut, PI, add, mix, tremble } from './kit.js';
import { VW, VH } from '../overlay.js';

const STAIR_X = -6;
const stairY = (z) => Math.max(0, Math.min(4.5, 4.5 - 0.714 * (17.79 - z)));

function bodies(c, st) {
  // os cinco derrubados continuam no chão
  const k = (ch, x, z, rot, e = 'ko') => {
    ch.place(x, z, rot, 0.13);
    ch.root.rotation.x = -PI / 2;
    ch.pose(P.lying(st)).expr(e);
    ch.blob.visible = false;
  };
  k(c.X1, -4.4, -0.9, 0.3);
  k(c.X2, -7.4, 12.2, -0.6);
  k(c.G, -2.3, 7.3, 1.8, 'dizzy');
  k(c.S, -1.0, 6.2, 0.9);
  c.R.place(-2.8, -9.4, 0.6, -0.45);
  c.R.root.rotation.x = -PI / 2;
  c.R.pose(P.lying(st)).expr('ko');
  c.R.blob.visible = false;
}

export const aftermath = {
  name: 'Sem dizer uma palavra',
  start: 530,
  dur: 30,
  shots: [
    {
      at: 0,
      set: 'river',
      run(c, lt) {
        bodies(c, lt);
        const r = walk(c.H, lt, [[1.0, 3.6], [-2.9, 6.4]], 0.9, { t0: 0.3, idle: P.shy });
        if (r.done) c.H.faceTo(-4.2, 7.6);
        c.H.expr(lt > 2.5 ? 'blush' : 'sad', 0, 0.3);
        c.A.place(-4.2, 7.6, PI - 0.15 + smooth(range(lt, 3, 4)) * 1.1).pose(P.idle(lt)).expr('neutral');
        c.A.wind = 0.6;
        c.face(c.H, { dist: 1.3, yaw: 15, fov: 32, th: -0.15 });
      },
    },
    {
      // ele passa por ela sem uma palavra
      at: 6,
      set: 'river',
      run(c, lt) {
        bodies(c, 6 + lt);
        const reach = smooth(range(lt, 1.6, 2.2)) * (1 - smooth(range(lt, 3.2, 4.2)) * 0.6);
        c.H.place(-2.9, 6.4, -2.1).pose(add(P.shy(lt), { rsX: 70 * reach, rsZ: 6, reX: 15 * reach, rsY: 0, hdY: -20 - 40 * smooth(range(lt, 1, 3)) })).expr(lt > 3.5 ? 'sad' : 'surprised', -0.8);
        const r = walk(c.A, lt, [[-4.2, 7.6], [-3.6, 8.6], [STAIR_X, 11.5]], 1.0, { style: 'swagger', t0: 0.3 });
        c.A.expr('neutral');
        c.A.wind = 0.8;
        if (lt < 4.2) c.cam([-1.5, 1.45, 5.0], [-3.3, 1.45, 7.2], 34);
        else {
          // subindo a escada até a mochila
          const z = 11.5 + (lt - 4.2) * 1.6;
          const zz = Math.min(z, 17.4);
          c.A.place(STAIR_X, zz, 0, stairY(zz)).pose(zz < 17.4 ? P.walk(lt) : add(P.idle(lt), { spX: 30, rsX: 40, reX: 20 })).expr('neutral');
          const b = c.show('wBag');
          b.position.set(STAIR_X - 0.35, 4.5, 17.55);
          b.rotation.set(0, 0.3, 1.45);
          c.cam([-1.0, 1.0, 6.0], [STAIR_X, 2.8, 14.5], 36);
        }
      },
    },
    {
      // a Hana, mão no peito
      at: 13,
      set: 'river',
      run(c, lt) {
        bodies(c, 13 + lt);
        c.H.place(-2.9, 6.4, -0.4).pose(add(P.shy(lt), { rsX: 55, rsZ: -12, rsY: -40, reX: 110 })).expr('blush', -0.6, 0.4);
        c.H.wind = 0.8;
        c.face(c.H, { dist: 0.85 - lt * 0.02, yaw: 25, fov: 30 });
        c.ov.shoujo(smooth(range(lt, 1, 2)), lt, 'rgba(255,170,120,0.5)');
        c.post.set({ bloom: 1.1, lift: [0.04, 0.01, 0] });
      },
    },
    {
      // o Kenta chega
      at: 19,
      set: 'river',
      run(c, lt) {
        bodies(c, 19 + lt);
        c.H.place(-2.9, 6.4, -0.6 + smooth(range(lt, 0.5, 1)) * 1.2).pose(P.shy(lt)).expr('soft');
        const r = walk(c.K, lt, [[6, 4.5], [-1.6, 6.2]], 4, { style: 'run', idle: (t) => add(P.idle(t), { spX: 20, hipY: -0.04, lsX: 40, rsX: 40, leX: 30, reX: 30 }) });
        if (r.done) c.K.faceTo(-2.9, 6.4);
        c.K.expr(lt > 3.2 ? 'smile' : 'surprised');
        if (lt < 3.2) c.cam([1.0, 1.5, 3.2], [-2.0, 1.3, 6.6], 38);
        else c.face(c.K, { dist: 1.0, yaw: -25, fov: 32 });
      },
    },
    {
      // "Pra ele, isso é só... o trabalho dele."
      at: 25,
      set: 'river',
      env: { skyOver: { cover: 0.4 } },
      run(c, lt) {
        bodies(c, 25 + lt);
        c.K.place(-1.6, 6.2, -0.2).pose(P.idle(lt)).expr('soft');
        c.H.place(-2.9, 6.4, 0.4).pose(P.shy(lt)).expr('blush');
        const x = -10 - lt * 1.1;
        c.A.place(x, 21.4, -PI / 2, 4.5).pose(P.bagShoulder(P.swagger(lt))).expr('neutral');
        c.show('bag');
        c.A.wind = 0.8;
        if (lt < 3.4) c.cam([-2.3, 1.55, 8.6], [-2.2, 1.45, 6.3], 34);
        else {
          c.camKF(lt, [
            [3.4, [-0.6, 1.0, 4.4], [x, 5.4, 21.4], 30],
            [5, [-0.6, 1.2, 4.4], [x, 5.8, 21.4], 34],
          ]);
          c.ov.onoma('GRRRUUUM', 1250, 300, 70, lt - 3.4, { color: '#ffffff', rot: 0.05, dur: 1.6 });
          c.ov.continua(lt - 4.0);
        }
        c.post.set({ bloom: 1.1 });
        c.ov.fade('#000', smooth(range(lt, 4.6, 5)));
      },
    },
  ],
  lines: [
    [0.8, 4.2, 'hana', 'A-Akashi-kun... obrigada! Eu... eu...'],
    [13.6, 4.4, 'hana', 'Ele nem disse nada... mas...', { thought: true }],
    [19.3, 2.8, 'kenta', 'Hana! Você tá bem?! ...Foi o Akashi, né?'],
    [22.3, 2.1, 'kenta', 'Ele é sempre assim.'],
    [24.6, 3.6, 'kenta', 'Pra ele, isso é só... o trabalho dele.'],
    [28.4, 1.4, 'akashi', '...Rosbife.', { thought: true }],
  ],
  sfx: [
    [0, 'wind', { d: 30, v: 0.3, s: 1 }],
    ...[6.6, 7.5, 8.4, 9.3, 10.4, 11.0, 11.6, 12.2].map((t) => [t, 'step', { n: 'gravel', v: 0.4 }]),
    ...[19.2, 19.45, 19.7, 19.95, 20.2, 20.45].map((t) => [t, 'step', { n: 'gravel', v: 0.45 }]),
    [28.2, 'growl', { d: 1.3, v: 0.6 }],
  ],
};

const CREDITS = [
  ['AKASHI — EPISÓDIO 1', 'O Delinquente de Kōyō'],
  ['', ''],
  ['Akashi', 'o delinquente'],
  ['Hana Mizuki', 'a aluna nova'],
  ['Kenta Mori', 'o amigo'],
  ['Ryuji, Goro e Shin', 'os valentões'],
  ['Prof. Tanaka', 'o professor'],
  ['Yuuto', 'o calouro'],
  ['', ''],
  ['Roteiro e direção', 'Estúdio Programador'],
  ['Personagens e cenários', 'modelados em código'],
  ['Animação', 'three.js · WebGL'],
  ['Trilha "Kōyō Crimson"', 'sintetizada (Web Audio)'],
  ['Efeitos', 'shaders em tempo real'],
  ['', ''],
  ['Agradecimento especial', 'a quem ama rosbife'],
];

function creditPanel(c) {
  const g = c.ov.g;
  const gr = g.createLinearGradient(VW - 900, 0, VW, 0);
  gr.addColorStop(0, 'rgba(0,0,0,0)');
  gr.addColorStop(1, 'rgba(0,0,0,0.6)');
  g.fillStyle = gr;
  g.fillRect(VW - 900, 0, 900, VH);
}

export const ending = {
  name: 'Encerramento e próximo episódio',
  start: 560,
  dur: 30,
  shots: [
    {
      // o terraço à noite, olhando as estrelas
      at: 0,
      set: 'rooftop',
      env: {
        sky: 'night',
        hemi: { sky: 0x4a5a9a, ground: 0x1a1a2a, int: 1.1 },
        sun: { color: 0xa0b4ff, int: 0.9, dir: [0.3, 0.6, -0.7], shadow: false },
        fog: { color: 0x1a2040, near: 60, far: 500 },
        rim: 0x2a3a7a,
      },
      run(c, lt) {
        c.A.place(0, 9.3, PI).pose(add(P.sitLean(lt), { hdX: -22 })).expr('soft', 0, 0.8);
        const b = c.show('wBag');
        b.position.set(0.55, 0.0, 9.35);
        b.rotation.set(0, 0.2, 0);
        c.camKF(lt, [
          [0, [1.2, 0.55, 6.4], [0.1, 1.6, 9.3], 44],
          [7.5, [0.8, 0.45, 6.9], [0.05, 1.9, 9.3], 46],
        ]);
        creditPanel(c);
        c.ov.roll(CREDITS, lt / 22);
        c.ov.fade('#000', 1 - smooth(range(lt, 0, 1)));
        c.post.set({ bloom: 1 });
      },
    },
    {
      // os três andando na beira do rio
      at: 7.5,
      set: 'river',
      run(c, lt) {
        const x0 = -22 + lt * 1.0;
        for (const [ch, dx, dz, style] of [
          [c.A, 0, 0, 'swagger'],
          [c.H, -1.1, -0.6, 'walk'],
          [c.K, -2.2, 0.2, 'walk'],
        ]) {
          ch.place(x0 + dx, 21.2 + dz, PI / 2, 4.5);
          ch.pose(style === 'swagger' ? P.bagShoulder(P.swagger(lt, 0.95)) : P.walk(lt + dx, 0.75));
          ch.expr(ch === c.H ? 'smile' : 'neutral');
        }
        c.show('bag');
        c.cam([x0 + 2.8, 3.2, 15.4], [x0 - 1.2, 5.3, 21.2], 36);
        creditPanel(c);
        c.ov.roll(CREDITS, (7.5 + lt) / 22);
        c.post.set({ bloom: 1.1 });
      },
    },
    {
      // a sala vazia ao pôr do sol
      at: 15,
      set: 'classroom',
      env: {
        sky: 'sunset',
        sun: { color: 0xffa060, int: 2.6, dir: [-0.9, 0.25, -0.2], box: 8, center: [0, 1, 0] },
        hemi: { sky: 0xd09080, ground: 0x6a4a3a, int: 1.2 },
        rim: 0x6a3010,
      },
      run(c, lt) {
        c.H.place(-2.05, 3.12, PI).pose(add({ ...P.sitChair(lt), lsX: 32, rsX: 32, leX: 48, reX: 48 }, { hdY: 45 })).expr('soft', -0.8);
        c.H.wind = 0.3;
        c.camKF(lt, [
          [0, [0.8, 1.6, 0.5], [-2.6, 1.0, 3.2], 34],
          [7, [0.2, 1.5, 1.4], [-2.6, 1.0, 3.2], 32],
        ]);
        c.fx.petals(V(-3, 0, 2), lt + 400, 120, [4, 4, 6], [0.4, 0, 0.1], 0.07);
        creditPanel(c);
        c.ov.roll(CREDITS, (15 + lt) / 22);
        c.ov.fade('#000', smooth(range(lt, 6.4, 7)));
      },
    },
    {
      // próximo episódio
      at: 22,
      set: 'void',
      env: { hemi: { sky: 0xffffff, ground: 0x886666, int: 1.6 }, sun: { color: 0xffffff, int: 2, dir: [0.5, 0.7, 1], shadow: false } },
      run(c, lt) {
        c.set.look({ c1: 0xffd0e0, c2: 0xff8ab0, c3: 0xffffff, mode: 3, floor: false });
        c.H.place(-0.45, 0, 0.35).pose(P.wave(lt)).expr('happy');
        c.A.place(0.5, 0, -0.35).pose(add(P.handsUp(lt), tremble(lt, 2))).expr('shock');
        c.cam([0, 1.3, 3.4], [0, 1.3, 0], 36);
        c.fx.bigSweat(c.A, lt - 0.5);
        c.ov.text('PRÓXIMO EPISÓDIO', VW / 2, 120, { size: 64, color: '#fff', stroke: '#d0101e', sw: 12, weight: 900, spacing: 6 });
        const a = smooth(range(lt, 4.6, 5.2));
        c.ov.text('Episódio 2 — O Rosbife Proibido', VW / 2, 230, { size: 56, color: '#d0101e', stroke: '#fff', sw: 10, weight: 900, alpha: a });
        c.ov.fade('#000', smooth(range(lt, 7.4, 8)));
      },
    },
  ],
  lines: [[22.5, 5.0, 'hana', 'No próximo episódio: a cantina vai parar de vender rosbife?! O Akashi entra em pânico! Não percam!']],
  sfx: [],
};
