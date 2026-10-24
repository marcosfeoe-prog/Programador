// Cena 7 — A rua ao entardecer (5:30–6:10). A Hana volta para casa sozinha.
// Passos que param quando ela para. Ela se vira: ninguém. Um susto: só um
// gato. Mas, escondidos num vão do muro, o Ryuji e o Shin observam…
import { P, V, walk, kf, range, smooth, pulse, easeOut, easeIn, PI, add, mix, tremble, hash } from './kit.js';

const SOUTH = PI; // a Hana anda para -Z

function lamps(c, t, flick = 0) {
  const L = c.set.lamps;
  L.forEach((l, i) => {
    const on = smooth(range(t, 334 + i * 0.3, 334.4 + i * 0.3));
    let f = on;
    if (flick && i === 4) f *= Math.sin(t * 37) > 0.2 || Math.sin(t * 9.3) > 0.7 ? 1 : 0.1;
    l.userData.head.material.color.setScalar(0.15 + f * 0.85);
    if (l.userData.cone) l.userData.cone.material.opacity = 0.08 * f;
    if (l.userData.pool) l.userData.pool.material.opacity = 0.12 * f;
  });
}

function hanaLight(c, x, z, k = 2.2) {
  const p = c.set.pl1;
  p.position.set(x + 0.5, 3.2, z + 0.6);
  p.intensity = k;
}

export default {
  name: 'Alguém está me seguindo?',
  start: 330,
  dur: 40,
  shots: [
    {
      at: 0,
      set: 'street',
      run(c, lt) {
        lamps(c, c.t);
        const r = walk(c.H, lt, [[0.6, 21], [0.6, 15]], 1.0);
        c.show('hanaBag');
        c.H.expr('neutral');
        hanaLight(c, r.x, r.z, 1.2);
        c.camKF(lt, [
          [0, [1.4, 4.2, 4], [0, 2.4, 22], 40],
          [6, [1.2, 3.2, 6], [0.4, 1.8, 18], 38],
        ]);
      },
    },
    {
      // passos atrás dela
      at: 6,
      set: 'street',
      run(c, lt) {
        lamps(c, c.t);
        const stop = 3.5;
        const z = 15 - Math.min(lt, stop) * 1.0;
        const look = smooth(range(lt, 4.2, 4.8));
        c.H.place(0.6, z, SOUTH).pose(lt < stop ? P.walk(lt) : add(P.shy(lt), { hdY: 70 * look, chY: 15 * look })).expr(lt < stop ? 'neutral' : lt < 4.5 ? 'surprised' : 'scared', look);
        c.show('hanaBag');
        hanaLight(c, 0.6, z);
        if (lt < stop) c.cam([0.7, 1.45, z - 2.8 + lt * 0.0], [0.6, 1.35, z], 36);
        else {
          c.face(c.H, { dist: 0.85 - (lt - stop) * 0.04, yaw: 20, fov: 30 });
          c.fx.sweat(c.H, lt - 5);
          c.post.set({ vignette: 0.55 });
        }
      },
    },
    {
      // vista do perseguidor (atrás do poste)
      at: 14,
      set: 'street',
      run(c, lt) {
        lamps(c, c.t, 1);
        const z = 11.5 - lt * 1.9;
        c.H.place(0.6, z, SOUTH).pose(P.walk(lt, 1.4)).expr('scared');
        c.show('hanaBag');
        hanaLight(c, 0.6, z);
        c.cam([2.4, 1.55, z + 7.5], [0.6, 1.2, z], 34);
        c.handheld(0.05);
        c.post.set({ vignette: 0.9, sat: 0.7, grain: 0.06 });
        c.lb = 1;
        c.ov.letterbox(1);
      },
    },
    {
      // "Quem está aí?!" — rua vazia
      at: 20,
      set: 'street',
      run(c, lt) {
        lamps(c, c.t, 1);
        const turn = smooth(range(lt, 0, 0.35));
        const z = 0.1;
        c.H.place(0.6, z, SOUTH - PI * turn).pose(add(P.scared(lt), tremble(lt))).expr('shout');
        c.show('hanaBag');
        hanaLight(c, 0.6, z);
        if (lt < 2.2) c.face(c.H, { dist: 0.9, yaw: 10, fov: 30 });
        else {
          c.camKF(lt, [
            [2.2, [0.6, 1.5, z + 0.3], [0.3, 1.4, z + 20], 40],
            [6, [0.6, 1.5, z + 0.9], [0.2, 1.5, z + 20], 34],
          ]);
          c.post.set({ vignette: 0.7, sat: 0.75 });
        }
      },
    },
    {
      // o gato!
      at: 26,
      set: 'street',
      run(c, lt) {
        lamps(c, c.t, 1);
        const z = 0.1;
        const jump = 0.2;
        const scare = smooth(range(lt, jump + 0.1, jump + 0.5));
        c.H.place(0.6, z + scare * 0.3, mix({ a: 0 }, { a: 1 }, 0).a + scare * PI * 0.0).pose(lt < jump + 0.2 ? P.idle(lt) : P.sitBack(lt)).expr(lt < jump + 0.2 ? 'neutral' : lt > 1.8 ? 'sad' : 'shock', 0, -0.4);
        c.H.root.rotation.y = SOUTH;
        c.show('hanaBag');
        hanaLight(c, 0.6, z);
        const cat = c.show('cat');
        const u = range(lt, jump, jump + 0.7);
        const cz = -5.6 + u * 4.2;
        cat.position.set(-2.4 + u * 2.4, Math.sin(u * PI) * 0.9, cz);
        cat.rotation.y = 0.5;
        cat.scale.setScalar(1.3);
        // tampa da lixeira pulando
        if (lt < 1.4) {
          if (lt < 0.8) c.cam([1.6, 0.9, z + 1.2], [-1.6, 0.6, -5.2], 36);
          else c.cam([1.0, 0.7, -0.4], [0.2, 0.3, -1.6], 40);
          c.post.set({ zoom: 0.12 * pulse(lt, jump, jump + 0.1, jump + 0.4, jump + 0.7) });
          c.shake(0.04 * pulse(lt, jump, jump + 0.05, 0.6, 0.9));
          c.ov.onoma('MIAAAU!', 1300, 380, 150, lt - jump - 0.1, { color: '#ffffff', dur: 1.2 });
        } else {
          c.face(c.H, { dist: 1.0, yaw: -10, fov: 32, th: -0.12 });
          c.fx.bigSweat(c.H, lt - 1.4);
        }
      },
    },
    {
      // revelação: a gangue escondida no vão do muro
      at: 30,
      set: 'street',
      env: { fog: { color: 0x4a3a5a, near: 20, far: 150 } },
      run(c, lt) {
        lamps(c, c.t);
        const r = walk(c.H, lt, [[0.6, 0.1], [0.6, -20]], 1.0, { t0: 0.3 });
        c.show('hanaBag');
        c.H.expr('neutral');
        hanaLight(c, r.x, r.z, 1.6);
        const R = c.R;
        const S = c.S;
        R.place(-3.55, 11.1, PI - 0.5).pose(add(P.crossArms(lt), { hdY: -10 })).expr(lt > 6 ? 'grin' : 'smirk', 0.6);
        S.place(-3.2, 10.5, PI - 0.7).pose(add(P.pockets(lt), { lsX: 60, leX: 100, lsZ: -10 })).expr('smirk', 0.6);
        c.show('phoneS');
        const p2 = c.set.pl2;
        p2.color.set(0x9ac0ff);
        p2.position.set(-3.0, 1.5, 10.0);
        p2.intensity = 1.5;
        if (lt < 3) {
          c.camKF(lt, [
            [0, [1.2, 1.4, -2.5], [0.6, 1.3, 1.0], 36],
            [3, [1.6, 3.4, -5.5], [-2.6, 1.4, 9.5], 40],
          ]);
        } else if (lt < 6) c.face(S, { dist: 1.0, yaw: -30, fov: 32 });
        else c.face(R, { dist: 0.9, yaw: -25, fov: 30, h: -0.04 });
        c.post.set({ tint: [0.95, 0.9, 1.1], vignette: 0.6 });
      },
    },
  ],
  lines: [
    [10.5, 3.0, 'hana', 'Tem... alguém me seguindo?', { thought: true }],
    [20.3, 1.8, 'hana', 'Quem está aí?!', { shout: true }],
    [27.6, 2.3, 'hana', '...Um gato. Que susto...'],
    [33.2, 2.6, 'ryuji', 'Aquela é a garota que tava com o Akashi.', { mouth: false }],
    [36.0, 1.8, 'shin', 'O que a gente faz, Ryuji?'],
    [37.9, 2.1, 'ryuji', 'Chama o pessoal.'],
  ],
  sfx: [
    [0.4, 'crow', { n: 2, v: 0.3 }],
    [3.6, 'crow', { n: 3, v: 0.25, p: -0.5 }],
    [4.0, 'buzz', { d: 3, v: 0.4 }],
    ...[0.6, 1.4, 2.2, 3.0, 3.8, 4.6, 5.4, 6.2, 7.0, 7.8, 8.6, 9.4].map((t) => [t, 'step', { v: 0.28, r: 0.3 }]),
    ...[6.95, 7.75, 8.55, 9.35, 9.75].map((t) => [t, 'step', { v: 0.32, r: 0.6, p: 0.3 }]),
    ...[14.2, 14.75, 15.3, 15.85, 16.4, 16.95, 17.5, 18.05, 18.6, 19.15].map((t) => [t, 'step', { v: 0.3, r: 0.3 }]),
    ...[14.45, 15.0, 15.55, 16.1, 16.65, 17.2, 17.75, 18.3, 18.85].map((t) => [t, 'step', { v: 0.3, r: 0.6, p: 0.3 }]),
    [20.1, 'whoosh', { d: 0.3, v: 0.4 }],
    [21.5, 'wind', { d: 5, v: 0.4, s: 1 }],
    [26.15, 'crashMetal', { v: 0.5 }],
    [27.0, 'meow', { v: 0.7 }],
    [26.6, 'thud', { v: 0.4 }],
  ],
};
