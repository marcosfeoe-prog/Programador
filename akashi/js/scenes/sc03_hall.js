// Cena 3 — O corredor (1:55–2:35). O sino toca; o Akashi atravessa o corredor
// e todo mundo se encosta na parede. Um calouro esbarra nele, o professor
// quase desmaia de susto e o Kenta aparece com a notícia do rosbife.
import { P, V, walk, crowd, kf, range, smooth, pulse, easeOut, PI, add, tremble, talkWindow, seq, mix } from './kit.js';

const CROUCH = { hipY: -0.42, lhX: 95, rhX: 55, lkX: 120, rkX: 105, spX: 30, chX: 10, rsX: 62, reX: 20, lsX: 20, leX: 30, hdX: 18 };
const WEST = -PI / 2; // olhando para -X

export default {
  name: 'O corredor',
  start: 115,
  dur: 40,
  shots: [
    {
      // a escola às 8:25, alunos atrasados correndo
      at: 0,
      set: 'school',
      run(c, lt) {
        c.set.clock.userData.set(8 + 25 / 60 + lt / 3600);
        c.camKF(lt, [
          [0, [2, 2.2, -12], [0, 13, -33], 40],
          [6, [1.5, 3.2, -16], [0, 14.6, -33], 34],
        ]);
        for (let i = 0; i < 4; i++) walk(c.st[i], lt, [[-1.2 + i * 0.8, -8 + i * 1.3], [-1.2 + i * 0.6, -32]], 3.4, { style: 'run', t0: i * 0.2, phase: i * 0.2 });
        c.fx.petals(V(0, 0, -16), lt + 200, 260, [14, 8, 14]);
      },
    },
    {
      // o corredor: todos se encostam na parede
      at: 6,
      set: 'hallway',
      run(c, lt) {
        const A = c.A;
        const r = walk(A, lt, [[16, 0.05], [9, 0.05]], 1.15, { style: 'swagger' });
        A.pose(P.bagShoulder(A.p));
        c.show('bag');
        A.expr('annoyed');
        const spots = [
          [4, 6.2, -1.22, 0],
          [5, 7.4, -1.25, 0],
          [6, 9.6, -1.22, 0],
          [7, 11.2, -1.22, 0],
          [8, 13.6, -1.24, 0],
          [9, 6.8, 1.22, PI],
          [10, 8.6, 1.24, PI],
          [11, 10.4, 1.2, PI],
          [12, 12.4, 1.22, PI],
          [13, 14.4, 1.2, PI],
        ];
        for (const [i, x, z, rot] of spots) {
          const s = c.st[i];
          const near = smooth(range(Math.abs(r.x - x), 3.2, 1.2));
          s.place(x, z, rot + (x > r.x ? 0.4 : -0.4) * (rot ? -1 : 1));
          const base = near > 0.2 ? add(P.scared(lt + i), tremble(lt + i, near)) : add(P.idle(lt + i), { spX: -4 });
          s.pose(add(base, { hdY: (r.x - x) * 4 * (rot ? -1 : 1) }));
          s.expr(near > 0.3 ? 'scared' : 'neutral', (r.x > x ? 1 : -1) * 0.5);
          if (near > 0.5) c.fx.sweat(s, lt + i * 0.2 - 1);
        }
        talkWindow(c.st[9], lt, 0.5, 3);
        talkWindow(c.st[6], lt, 3.2, 6);
        c.camKF(lt, [
          [0, [3.6, 1.5, 0.35], [12, 1.4, 0], 38],
          [6, [4.2, 1.45, 0.3], [10, 1.4, 0], 36],
        ]);
      },
    },
    {
      // o calouro sai da sala e esbarra no Akashi
      at: 12,
      set: 'hallway',
      run(c, lt) {
        const A = c.A;
        const Y = c.Y;
        const hit = 0.95;
        const stop = smooth(range(lt, hit, hit + 0.3));
        A.place(8.6 - Math.min(lt, hit) * 1.0, 0.05, WEST);
        A.pose(lt < hit ? P.bagShoulder(P.swagger(lt + 6)) : P.bagShoulder(add(P.pockets(lt), { hdX: 22 * stop, hdY: -10 * stop })));
        c.show('bag');
        A.expr(lt < hit ? 'annoyed' : 'glare', 0, -0.6);
        if (lt < hit) {
          walk(Y, lt, [[8.0, -1.5], [7.65, -0.35]], 1.4, { style: 'walk' });
          Y.pose(add(Y.p, { lsX: 40, leX: 90, lsZ: -10 }));
          c.show('booksY');
          Y.expr('neutral', 0, -0.5);
        } else {
          const u = range(lt, hit, hit + 0.4);
          Y.place(7.6 - u * 0.3, -0.45 - u * 0.15, 0.6);
          Y.pose(mix(P.hit(u), P.sitBack(lt), smooth(u))).expr(lt > 1.6 ? 'scared' : 'shock', 0, 0.5);
          c.fx.bigSweat(Y, lt - 1.8);
          // livros voando
          const names = ['wBook1', 'wBook2', 'wBook3'];
          names.forEach((n, i) => {
            const bk = c.show(n);
            const a = lt - hit;
            const fall = Math.min(a, 0.6);
            bk.position.set(7.75 + (i - 1) * 0.35 * fall * 2, Math.max(0.03, 1.0 + 2.2 * fall - 7 * fall * fall), -0.2 + i * 0.12 + fall * 0.4);
            bk.rotation.set(a < 0.6 ? a * (5 + i) : 0, i * 0.7, a < 0.6 ? a * 3 : 0);
          });
        }
        c.cam([6.0, 1.15, 1.25], [7.9, 0.8, -0.3], 38);
        if (lt > hit && lt < hit + 0.5) c.shake(0.03);
        c.ov.onoma('TUM!', 1180, 300, 120, lt - hit, { color: '#ffffff', dur: 0.8 });
        c.fx.excl(Y, lt - hit - 0.05);
      },
    },
    {
      // ele pega o livro do chão e devolve
      at: 16,
      set: 'hallway',
      run(c, lt) {
        const A = c.A;
        const Y = c.Y;
        A.place(7.65, 0.05, WEST - 0.5);
        const down = pulse(lt, 0.1, 0.7, 1.3, 2.0);
        const give = smooth(range(lt, 1.8, 2.3)) * (1 - smooth(range(lt, 3.1, 3.4)));
        A.pose(add(mix(P.pockets(lt), CROUCH, down), { rsX: 55 * give, reX: 10 * give, rsY: 0, rFist: 0.5 }));
        A.expr(lt < 1.2 ? 'annoyed' : 'glare', 0, -0.5);
        if (lt > 1.0 && lt < 2.9) c.show('bookA');
        for (const [n, x] of [
          ['wBook2', 7.3],
          ['wBook3', 7.1],
        ]) {
          const bk = c.show(n);
          bk.position.set(x, 0.03, -0.1);
          bk.rotation.set(0, x * 2, 0);
        }
        if (lt < 2.0) {
          const bk = c.show('wBook1');
          bk.position.set(7.35, 0.03, 0.12);
        }
        if (lt < 3.0) {
          Y.place(7.3, -0.6, 0.6).pose(add(P.sitBack(lt), { rsX: 50 * give, reX: 20 * give })).expr(lt > 2.4 ? 'surprised' : 'scared', 0, 0.6);
          if (lt > 2.8) c.show('booksY');
        } else {
          walk(Y, lt, [[7.4, -0.5], [5.5, 1.0], [-3, 1.0]], 4, { style: 'run', t0: 3.1 });
          Y.pose(add(Y.p, { lsX: 40, leX: 100 })).expr('scared');
          c.show('booksY');
        }
        if (lt < 2.2) c.cam([6.3, 0.55, 0.9], [7.9, 1.25, -0.2], 36);
        else c.ots(Y, A, { back: 0.5, side: -0.3, h: -0.05, fov: 34 });
        c.fx.sweat(Y, lt - 0.3);
      },
    },
    {
      // o professor Tanaka
      at: 20,
      set: 'hallway',
      run(c, lt) {
        const A = c.A;
        const T = c.T;
        const r = walk(A, lt, [[4.4, 0.1], [1.4, 0.1]], 1.1, { style: 'swagger', idle: P.pockets });
        if (!r.moving) A.root.rotation.y = WEST - 0.4;
        A.pose(P.bagShoulder(A.p));
        c.show('bag');
        A.expr(lt > 2.6 ? 'annoyed' : 'neutral', -0.6);
        const jump = pulse(lt, 0.15, 0.3, 0.6, 0.9);
        const bowK = smooth(range(lt, 3.0, 3.4)) * (0.7 + Math.sin(lt * 9) * 0.3);
        T.place(0.2, -0.9, PI / 2 - 0.2, jump * 0.25);
        T.pose(lt < 3 ? add(P.handsUp(lt), { hipY: 0 }) : P.bow(bowK)).expr(lt < 3 ? 'shock' : 'smile', 1);
        c.fx.bigSweat(T, lt - 0.3);
        c.fx.excl(T, lt - 0.1);
        c.camKF(lt, [
          [0, [2.9, 1.45, 1.45], [0.9, 1.3, -0.45], 40],
          [4.5, [3.1, 1.42, 1.45], [1.0, 1.3, -0.45], 36],
        ]);
      },
    },
    {
      // o Kenta chega correndo
      at: 24.5,
      set: 'hallway',
      run(c, lt) {
        const A = c.A;
        const K = c.K;
        A.place(1.0, 0.1, WEST + 0.3 + smooth(range(lt, 0.5, 1)) * 0.9);
        A.pose(P.bagShoulder(P.pockets(lt))).expr('annoyed', 1);
        c.show('bag');
        const r = walk(K, lt, [[7, 0.6], [1.8, 0.5]], 3.8, { style: 'run', idle: (t) => add(P.idle(t), { lsX: 70, lsZ: 30, leX: 30 }) });
        if (!r.moving) K.faceTo(1.0, 0.1);
        K.expr('happy');
        c.T.place(-1.2, -0.7, PI / 2 + 0.5).pose(P.bow(0.5)).expr('closed');
        c.camKF(lt, [
          [0, [3.2, 1.5, -1.0], [1.2, 1.4, 0.3], 38],
          [2.8, [2.6, 1.5, -0.9], [1.2, 1.45, 0.3], 34],
        ]);
      },
    },
    {
      at: 27.3,
      set: 'hallway',
      run(c, lt) {
        const A = c.A;
        A.place(1.0, 0.1, WEST + 1.2).pose(add(P.bagShoulder(P.pockets(lt)), { spX: 8, hdX: 6 })).expr('shout', 0.5);
        c.show('bag');
        c.K.place(1.8, 0.5, WEST - 0.9).pose(P.idle(lt)).expr('surprised');
        c.face(A, { dist: 0.75, yaw: 25, fov: 30 });
        c.fx.vein(A, lt - 0.1);
        c.ov.speedLines({ k: 0.5, t: c.t, color: '#000' });
        c.shake(0.004);
      },
    },
    {
      at: 29,
      set: 'hallway',
      run(c, lt) {
        const K = c.K;
        K.place(1.8, 0.5, WEST - 0.9).pose(add(P.idle(lt), { hdZ: 8 })).expr('smile');
        c.A.place(1.0, 0.1, WEST + 1.2).pose(P.pockets(lt)).expr('angry');
        c.face(K, { dist: 0.8, yaw: -20, fov: 30 });
        c.fx.bigSweat(K, lt - 0.2);
      },
    },
    {
      // caminhando lado a lado — rosbife?!
      at: 31.5,
      set: 'hallway',
      run(c, lt) {
        const A = c.A;
        const K = c.K;
        const stopAt = 6.3;
        const xa = 0.6 - Math.min(lt, stopAt) * 1.05;
        A.place(xa, 0.05, WEST);
        A.pose(lt < stopAt ? P.bagShoulder(P.swagger(lt)) : P.bagShoulder(add(P.pockets(lt), { hdY: 25, spX: -4 })));
        c.show('bag');
        const xk = 0.9 - Math.min(lt, stopAt + 0.6) * 1.05;
        K.place(xk, 0.95, WEST + (lt > stopAt + 0.6 ? -0.7 : 0));
        K.pose(lt < stopAt + 0.6 ? P.walk(lt + 0.3, 0.8) : P.idle(lt));
        const sparkle = lt > stopAt;
        A.expr(sparkle ? 'sparkle' : 'annoyed', 0.4);
        K.expr(lt > 4.4 ? 'smirk' : 'smile', -0.5);
        if (!sparkle) c.cam([xa - 3.0, 1.45, 0.25], [xa, 1.45, 0.35], 36);
        else {
          c.face(A, { dist: 0.85, yaw: 30, fov: 28, h: 0.01 });
          c.fx.sparkles(A.headWorld(V(0, 0, 0)), lt, 7, 0.32, 0.12, 3);
          c.ov.shoujo(smooth(range(lt, stopAt, stopAt + 0.4)), lt, 'rgba(255,215,140,0.5)');
          c.ov.speedLines({ k: 0.4, t: c.t, color: 'rgba(255,200,120,1)', inner: 0.7 });
        }
      },
    },
  ],
  lines: [
    [6.5, 2.4, 'aluno', 'Não olha pra ele...'],
    [9.1, 2.8, 'aluna', 'Dizem que ele derrubou dez caras sozinho...'],
    [12.7, 2.0, 'yuuto', 'D-d-desculpa!!', { shout: true }],
    [16.6, 1.9, 'akashi', 'Olha por onde anda.'],
    [20.4, 2.2, 'tanaka', 'Ah! B-bom dia, Akashi-kun!', { shout: true }],
    [22.8, 1.4, 'akashi', '...Bom dia.'],
    [24.9, 2.35, 'kenta', 'Akashi! Você assustou o professor de novo!'],
    [27.35, 1.6, 'akashi', 'Eu só disse bom dia!', { shout: true }],
    [29.05, 2.4, 'kenta', 'Com essa cara, até "bom dia" parece ameaça...'],
    [31.8, 2.3, 'kenta', 'Ouvi dizer que hoje chega uma aluna nova.'],
    [34.3, 1.4, 'akashi', 'Não me interessa.'],
    [35.9, 2.0, 'kenta', '...E que hoje tem rosbife na cantina.'],
    [38.1, 1.7, 'akashi', '...Sério?!'],
  ],
  sfx: [
    [0.3, 'chime', { v: 0.55 }],
    [0.4, 'crowd', { d: 5, v: 0.25, s: 1 }],
    [6.0, 'crowd', { d: 6, v: 0.18, s: 1 }],
    ...[0.3, 1.2, 2.1, 3.0, 3.9, 4.8, 5.7].map((t) => [6 + t, 'step', { v: 0.35, r: 0.25 }]),
    [12.95, 'thud', { v: 0.7 }],
    [13.05, 'whoosh', { d: 0.3, v: 0.4 }],
    [13.5, 'thud', { v: 0.4 }],
    [13.65, 'thud', { v: 0.3 }],
    [19.2, 'whoosh', { d: 0.4, v: 0.3 }],
    [20.3, 'door', { v: 0.5 }],
    [20.35, 'boing', { v: 0.4 }],
    [24.6, 'step', { v: 0.3 }],
    [24.9, 'step', { v: 0.3 }],
    [25.2, 'step', { v: 0.3 }],
    [27.4, 'pop', { v: 0.5 }],
    [37.85, 'slide', { v: 0.4 }],
    [38.0, 'bell', { n: 96, v: 0.45 }],
    [38.15, 'bell', { n: 100, v: 0.45 }],
    [38.3, 'bell', { n: 103, v: 0.45 }],
  ],
};
