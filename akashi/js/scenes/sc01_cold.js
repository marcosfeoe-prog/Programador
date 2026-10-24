// Cena 1 — Abertura fria (0:00–0:25). Amanhecer no Colégio Kōyō; os alunos
// chegam conversando até que passos pesados silenciam todo mundo: o Akashi.
import { P, V, walk, crowd, kf, range, smooth, pulse, easeOut, PI, talkWindow, tremble, add } from './kit.js';

const DAWN = {
  sky: 'dawn',
  hemi: { sky: 0xe0c8dc, ground: 0x7a6a72, int: 1.35 },
  sun: { color: 0xffcfa8, int: 2.1, dir: [0.45, 0.3, -0.85], center: [0, 0, 15], box: 30 },
  rim: 0x4a2418,
  fog: { color: 0xe8c8c0, near: 70, far: 600 },
};

export default {
  name: 'Abertura fria — o portão',
  start: 0,
  dur: 25,
  shots: [
    {
      // céu do amanhecer descendo até a escola; alunos chegando
      at: 0,
      set: 'school',
      env: DAWN,
      run(c, lt) {
        c.camKF(lt, [
          [0, [0, 1.8, 37.5], [0, 34, -8], 46],
          [6.5, [0, 1.6, 36], [0, 6, -22], 40, 'io'],
        ]);
        for (let i = 0; i < 8; i++) {
          const s = i % 2 ? 1 : -1;
          const x0 = s * (9 + i * 2.6);
          walk(c.st[i], lt, [[x0, 26], [s * (1.2 + (i % 3) * 0.6), 24.2], [s * (1.4 + (i % 3) * 0.5), 8]], 1.15, { t0: -i * 0.9, phase: i * 0.31 });
        }
        c.fx.petals(V(0, 0, 22), lt + 3, 260, [22, 9, 14]);
        c.ov.fade('#000', 1 - smooth(range(lt, 0, 1.6)));
        c.lb = 1;
        c.ov.letterbox(1);
      },
    },
    {
      // pátio: grupos conversando, alunos entrando
      at: 7,
      set: 'school',
      env: DAWN,
      run(c, lt) {
        c.camKF(lt, [
          [0, [-3.4, 1.35, 20.5], [0.5, 2.2, -12], 38],
          [6, [-2.8, 1.3, 19.2], [0.5, 2.0, -12], 36],
        ]);
        crowd(
          c,
          [
            [8, -1.9, 14.2, 1.4, P.idle, 'smile'],
            [9, -0.9, 14.5, -1.8, P.idle, 'happy'],
            [10, 2.5, 12.6, -0.4, P.idle, 'neutral'],
            [11, 1.7, 13.4, 2.3, P.crossArms, 'smile'],
            [12, 2.9, 13.6, -2.4, P.idle, 'laugh'],
            [13, 3.8, 9.8, 0.5, P.idle, 'neutral'],
          ],
          lt,
        );
        for (const i of [8, 9, 12]) talkWindow(c.st[i], (lt + i) % 3, 0, 1.6);
        walk(c.st[0], lt, [[1.2, 23.5], [1.2, 12]], 1.2, { t0: 0.2 });
        walk(c.st[1], lt, [[-1.0, 24.5], [-1.0, 12]], 1.1, { t0: 0.8, phase: 0.4 });
        walk(c.st[2], lt, [[0.2, 26], [0.2, 12]], 1.25, { t0: 2.4, phase: 0.2 });
        c.fx.petals(V(0, 0, 17), lt + 10, 240, [14, 7, 12]);
        c.lb = 1;
        c.ov.letterbox(1);
      },
    },
    {
      // os pés do Akashi cruzando o portão (câmera lenta)
      at: 13,
      set: 'school',
      env: { ...DAWN, sun: { ...DAWN.sun, dir: [0.2, 0.35, 0.95] }, rim: 0xff8a5a },
      run(c, lt) {
        const A = c.A;
        walk(A, lt, [[0.3, 24.0], [0.3, 21.4]], 0.55, { style: 'swagger', t0: 0 });
        A.pose(add(A.p, { coatBack: 8 }));
        A.wind = 0.6;
        c.cam([-0.75, 0.16, 20.9], [0.25, 0.28, 23.4 - lt * 0.5], 44);
        c.shake(0.004 + pulse(lt % 1.25, 0.25, 0.3, 0.35, 0.6) * 0.02, 30);
        c.fx.petals(V(0.3, 0, 22.5), lt * 1.5 + 30, 200, [5, 2.5, 5], [2.5, 0.4, -0.5], 0.05);
        c.post.set({ sat: 0.85, vignette: 0.6, contrast: 1.12 });
        c.lb = 1;
        c.ov.letterbox(1);
      },
    },
    {
      // alunos percebem quem chegou
      at: 17,
      set: 'school',
      env: DAWN,
      run(c, lt) {
        const g = c.st[1];
        const b = c.st[2];
        g.place(-2.1, 17.9, 0.35).pose(add(P.scared(lt), tremble(lt))).expr('shock', 0.5);
        b.place(-1.2, 18.4, 0.1).pose(add(P.idle(lt), { spX: -8, hdX: -6 })).expr('scared', 0.3);
        crowd(c, [[3, -3.2, 19.4, 0.4, P.scared, 'scared']], lt);
        talkWindow(g, lt, 0.2, 2.0);
        c.cam([-0.7, 1.45, 20.6], [-1.75, 1.32, 18.2], 32);
        c.fx.bigSweat(g, lt - 0.4);
        c.fx.sweat(b, lt - 0.7, 1);
        c.ov.speedLines({ k: smooth(range(lt, 0, 0.3)) * 0.35, t: c.t, color: 'rgba(30,30,60,1)', inner: 0.75 });
        c.lb = 1;
        c.ov.letterbox(1);
      },
    },
    {
      at: 19,
      set: 'school',
      env: DAWN,
      run(c, lt) {
        const b = c.st[2];
        b.place(-1.2, 18.4, 0.1).pose(add(P.scared(lt), tremble(lt, 1.5))).expr('shock', 0.2);
        talkWindow(b, lt, 0.2, 1.9);
        c.face(b, { dist: 0.78, yaw: 14, fov: 30, h: 0.02 });
        c.post.set({ chroma: 0.004 });
        c.fx.bigSweat(b, lt - 0.2);
        c.ov.speedLines({ k: 0.6, t: c.t, color: '#101018', inner: 0.6 });
        c.lb = 1;
        c.ov.letterbox(1);
      },
    },
    {
      // contra-plongée: o Akashi no portão, contra o sol
      at: 21,
      set: 'school',
      env: {
        ...DAWN,
        sun: { color: 0xffb880, int: 2.4, dir: [0.15, 0.32, 1], center: [0, 0, 18], box: 20 },
        skyOver: { sunDir: [0.1, 0.12, 1] },
        rim: 0xff7a4a,
      },
      run(c, lt) {
        const A = c.A;
        A.place(0, 21.6, PI).pose(P.bagShoulder(P.pockets(lt))).expr(lt > 2.3 ? 'menace' : 'glare', 0, -0.2);
        c.show('bag');
        A.wind = 1;
        A.noBlink = lt > 2.0;
        c.camKF(lt, [
          [0, [0.35, 0.32, 18.0], [0, 1.45, 21.6], 40],
          [4, [0.18, 0.55, 19.3], [0, 1.6, 21.6], 34, 'out'],
        ]);
        c.fx.petals(V(0, 0, 21), lt * 1.2 + 50, 240, [10, 6, 8], [-1.8, 0, -1]);
        if (lt > 2.3) {
          const e = A.headWorld(V(0, 0, 0), -0.01);
          for (const s of [-1, 1]) {
            const p = e.clone().addScaledVector(c.fx.right, s * 0.045);
            p.z -= 0.12;
            c.fx.sprite('glow', p, 0.18 * smooth(range(lt, 2.3, 2.6)), { add: true, color: 0xff2020 });
          }
        }
        c.ov.speedLines({ k: smooth(range(lt, 2.4, 2.9)) * 0.9, t: c.t, color: '#ffffff', inner: 0.55 });
        c.post.set({ flash: smooth(range(lt, 3.55, 4.0)), contrast: 1.1, bloom: 0.9 });
        c.lb = 1 - smooth(range(lt, 3.6, 4));
        c.ov.letterbox(c.lb);
      },
    },
  ],
  lines: [
    [1.2, 5.3, 'narr', 'Colégio Kōyō. Uma escola comum, numa cidade comum...'],
    [7.4, 5.3, 'narr', '...mas existe um aluno que ninguém tem coragem de encarar.'],
    [17.2, 1.7, 'aluna', 'É... é ele!'],
    [19.2, 1.8, 'aluno', 'O delinquente... Akashi!', { shout: true }],
  ],
  sfx: [
    [0.5, 'birds', { n: 5, v: 0.3 }],
    [2.6, 'birds', { n: 3, v: 0.25, p: 0.4 }],
    [5.2, 'birds', { n: 4, v: 0.25, p: -0.4 }],
    [7, 'crowd', { d: 6, v: 0.35, s: 1 }],
    [9.8, 'birds', { n: 3, v: 0.2 }],
    [13.3, 'step', { n: 'heavy', v: 1 }],
    [14.55, 'step', { n: 'heavy', v: 0.9 }],
    [15.8, 'step', { n: 'heavy', v: 0.9 }],
    [13.2, 'wind', { d: 4, v: 0.4, s: 1 }],
    [17.05, 'whoosh', { d: 0.3, v: 0.4 }],
    [21.1, 'wind', { d: 4, v: 0.55, s: 1 }],
    [23.3, 'pop', { v: 0.6 }],
  ],
};
