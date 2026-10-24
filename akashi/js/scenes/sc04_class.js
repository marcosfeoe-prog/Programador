// Cena 4 — A sala de aula (2:35–3:35). A aluna nova, Hana Mizuki, se apresenta
// e senta do lado do Akashi. Ela acha os olhos dele tranquilos; ele só pensa
// em rosbife — até a barriga roncar no meio da aula.
import { P, V, walk, kf, range, smooth, pulse, easeOut, PI, add, tremble, talkWindow, mix, seq, hash } from './kit.js';
import { seat, DESK_X, DESK_Z } from '../sets/classroom.js';

const AK = seat(0, 4);
const HN = seat(1, 4);
const FRONT = PI; // sentados olhando para a lousa (-Z)

// Alunos sentados (todas as carteiras menos a do Akashi e a da Hana).
function seated(c, lt, o = {}) {
  let k = 0;
  for (let row = 0; row < 5; row++)
    for (let col = 0; col < 6; col++) {
      if (row === 4 && col < 2) continue;
      if (k >= 24) return;
      const s = c.st[k];
      const p = seat(col, row);
      const look = o.look ? o.look(p, k) : 0;
      s.place(p.x, p.z, FRONT + look);
      const base = (k + row) % 3 === 0 ? P.sitChin(lt + k) : P.sitChair(lt + k);
      s.pose(add(base, { hdY: o.head ? o.head(p, k) : 0, ...(o.layer || {}) }));
      s.expr(o.expr ? o.expr(k) : 'neutral', o.lx ? o.lx(p, k) : 0);
      if (o.sweat && hash(k) > 0.4) c.fx.sweat(s, lt - hash(k * 3));
      k++;
    }
}

function akashiSeat(c, lt, expr = 'annoyed', layer = {}) {
  const A = c.A;
  A.place(AK.x, AK.z, FRONT).pose(add(P.sitChin(lt), { hdY: 48, ...layer })).expr(expr, -0.8);
}

function hanaSeat(c, lt, expr = 'smile', layer = {}) {
  c.H.place(HN.x, HN.z, FRONT).pose(add({ ...P.sitChair(lt), lsX: 32, rsX: 32, leX: 48, reX: 48, lsZ: 2, rsZ: 2 }, { hdY: 35, ...layer })).expr(expr, -0.7);
}

export default {
  name: 'A aluna nova',
  start: 155,
  dur: 60,
  shots: [
    {
      at: 0,
      set: 'classroom',
      run(c, lt) {
        c.set.clock.userData.set(8.5);
        seated(c, lt, { expr: (k) => (k % 4 === 0 ? 'smile' : 'neutral') });
        for (const k of [3, 7, 12]) talkWindow(c.st[k], lt, 0, 1.2);
        akashiSeat(c, lt);
        const turn = smooth(range(lt, 0.8, 1.4));
        c.T.place(-0.6, -3.9, PI * (1 - turn) + 0.2 * turn, 0.15).pose(turn < 0.5 ? add(P.point(1), { rsX: 120, reX: 40 }) : P.idle(lt)).expr('neutral');
        c.camKF(lt, [
          [0, [4.0, 2.3, -4.0], [-2.4, 0.8, 2.4], 46],
          [6, [3.8, 2.1, -3.6], [-2.6, 0.9, 2.6], 44],
        ]);
      },
    },
    {
      // a Hana entra
      at: 6,
      set: 'classroom',
      run(c, lt) {
        c.set.clock.userData.set(8.52);
        seated(c, lt, { head: (p) => (lt > 1 ? -25 : 0), expr: (k) => (k % 3 === 0 ? 'surprised' : 'smile') });
        akashiSeat(c, lt);
        walk(c.H, lt, [[4.2, -3.6], [2.6, -3.5], [0.6, -3.3]], 1.0, { t0: 0.3, idle: P.shy });
        if (lt > 2.4) c.H.root.rotation.y = 0;
        c.H.expr('smile', -0.4);
        c.T.place(-1.4, -3.75, 0.5, 0.15).pose(P.idle(lt)).expr('smile');
        talkWindow(c.st[8], lt, 2.4, 4.2);
        talkWindow(c.st[3], lt, 4.3, 5.9);
        c.camKF(lt, [
          [0, [1.3, 1.8, 3.9], [2.4, 1.3, -3.4], 34],
          [6, [1.0, 1.8, 3.6], [0.8, 1.35, -3.3], 32],
        ]);
        c.ov.shoujo(smooth(range(lt, 1, 2)), lt);
      },
    },
    {
      // apresentação e reverência
      at: 12,
      set: 'classroom',
      run(c, lt) {
        const H = c.H;
        const bow = pulse(lt, 4.4, 4.8, 5.4, 5.9);
        H.place(0.6, -3.3, 0, 0.15).pose(mix(P.shy(lt), P.bow(1), bow)).expr(bow > 0.5 ? 'closed' : lt > 3 ? 'happy' : 'smile');
        H.wind = 0.15;
        c.camKF(lt, [
          [0, [0.75, 1.5, -1.3], [0.6, 1.5, -3.3], 30],
          [6, [0.7, 1.52, -1.6], [0.6, 1.48, -3.3], 26],
        ]);
        c.fx.sparkles(H.headWorld(V(0, 0, 0), -0.1), lt, 5, 0.42, 0.1, 9);
      },
    },
    {
      // "...do lado do Akashi-kun"
      at: 18,
      set: 'classroom',
      run(c, lt) {
        c.T.place(-1.3, -3.7, 0.35, 0.15).pose(P.point(smooth(range(lt, 0.8, 1.3)))).expr('smile');
        c.H.place(0.6, -3.3, -0.1, 0.15).pose(P.shy(lt)).expr('smile');
        c.face(c.T, { dist: 1.3, yaw: -25, fov: 32, th: -0.2 });
      },
    },
    {
      at: 21.3,
      set: 'classroom',
      run(c, lt) {
        seated(c, lt, { expr: () => 'shock', layer: tremble(lt) });
        const s = c.st[19];
        talkWindow(s, lt, 0.1, 1.5);
        c.face(s, { dist: 0.9, yaw: 20, fov: 34 });
        c.fx.bigSweat(s, lt);
        c.post.set({ sat: 0.6 });
        c.ov.speedLines({ k: 0.6, t: c.t, color: '#1a1a40' });
      },
    },
    {
      // ela atravessa a sala; o Akashi vira a cabeça devagar
      at: 23,
      set: 'classroom',
      run(c, lt) {
        seated(c, lt, { expr: () => 'scared', head: (p) => (p.x < -1 ? 40 : 15) });
        const r = walk(c.H, lt, [[0.6, -3.3], [-1.4, -2.7], [-1.4, 2.35]], 1.15, { idle: P.shy, face: PI });
        c.H.expr('smile', 0.2);
        const turn = smooth(range(lt, 2.8, 3.4));
        akashiSeat(c, lt, turn > 0.5 ? 'glare' : 'annoyed', { hdY: 48 - turn * 75, hdZ: 10 - turn * 8 });
        if (lt < 3.3) c.cam([AK.x + 0.7, 1.4, AK.z + 1.0], [r.x, 1.35, r.z], 36);
        else {
          c.face(c.A, { dist: 0.75, yaw: -30, fov: 28 });
          c.post.set({ vignette: 0.6 });
          c.ov.speedLines({ k: 0.35, t: c.t, color: '#000', inner: 0.75 });
        }
      },
    },
    {
      at: 27,
      set: 'classroom',
      run(c, lt) {
        c.H.place(-1.4, 2.35, PI - 0.6).pose(add(P.wave(lt), { hdZ: -6 })).expr('happy');
        akashiSeat(c, lt, lt > 2.1 ? 'annoyed' : 'blank', { hdY: -27 + smooth(range(lt, 2.2, 2.8)) * 75 });
        if (lt < 2.0) {
          c.face(c.H, { dist: 0.95, yaw: -15, fov: 30 });
          c.ov.shoujo(1, lt);
        } else c.face(c.A, { dist: 0.9, yaw: 50, fov: 30 });
      },
    },
    {
      // ela senta e o observa
      at: 30,
      set: 'classroom',
      run(c, lt) {
        seated(c, lt);
        akashiSeat(c, lt, 'neutral');
        const bl = smooth(range(lt, 5.5, 7.5));
        hanaSeat(c, lt, bl > 0.5 ? 'blush' : 'soft', { hdY: 55, hdX: 4 });
        c.H.st.lx = -0.9;
        c.face(c.H, { dist: 1.0 - lt * 0.02, yaw: 52, fov: 30, th: -0.05 });
        c.fx.petals(V(-7, 0, 2), lt + 300, 160, [4, 5, 8], [0.3, 0, 0.2], 0.07);
        c.post.set({ bloom: 0.9, lift: [0.03, 0.01, 0.02] });
        c.ov.shoujo(0.6 + bl * 0.4, lt);
      },
    },
    {
      // rosbife...
      at: 38,
      set: 'classroom',
      run(c, lt) {
        seated(c, lt);
        hanaSeat(c, lt, 'soft');
        akashiSeat(c, lt, lt > 5.4 ? 'surprised' : 'neutral', { hdY: 48, hdX: -3 });
        c.face(c.A, { dist: 1.1, yaw: 62, fov: 34, th: -0.12, side: 0.25 });
        const h = c.toScreen(c.A.headWorld(V(0, 0, 0)));
        c.ov.thought(Math.min(1600, h.x + 380), Math.max(220, h.y - 250), 190, lt - 0.4);
        c.ov.onoma('GRRRUUUM', 1350, 860, 120, lt - 5.5, { color: '#c8a0ff', stroke: '#2a1040', rot: 0.06, dur: 2.2 });
        if (lt > 5.5) c.shake(0.004 * (1 - range(lt, 5.5, 7)));
      },
    },
    {
      // a sala inteira olha
      at: 46,
      set: 'classroom',
      run(c, lt) {
        seated(c, lt, { head: (p) => 0, look: (p) => Math.atan2(AK.x - p.x, AK.z - p.z) - FRONT, expr: () => 'surprised' });
        c.T.place(-0.8, -3.8, 0.3, 0.15).pose(P.idle(lt)).expr('surprised');
        if (lt < 1.7) {
          hanaSeat(c, lt, 'laugh', { rsX: 50, reX: 75, hdY: 40 });
          akashiSeat(c, lt, 'surprised');
          c.face(c.H, { dist: 0.85, yaw: 40, fov: 30 });
        } else if (lt < 3.9) {
          akashiSeat(c, lt, 'shout', { hdY: -40, spX: 10 });
          hanaSeat(c, lt, 'surprised');
          c.face(c.A, { dist: 0.75, yaw: -20, fov: 30 });
          c.fx.vein(c.A, lt - 1.75);
          c.ov.speedLines({ k: 0.6, t: c.t, color: '#000' });
          c.shake(0.004);
        } else {
          hanaSeat(c, lt, 'flustered', { rsX: 40, reX: 60, lsX: 40, leX: 60, hdY: 40 });
          akashiSeat(c, lt, 'angry', { hdY: -40 });
          c.face(c.H, { dist: 0.9, yaw: 40, fov: 30 });
          c.fx.bigSweat(c.H, lt - 3.9);
        }
      },
    },
    {
      at: 52,
      set: 'classroom',
      run(c, lt) {
        seated(c, lt, { expr: () => 'neutral' });
        c.T.place(-0.8, -3.8, 0.3, 0.15).pose(add(P.idle(lt), { rsX: 40, reX: 60 })).expr('smile');
        c.face(c.T, { dist: 1.0, yaw: -15, fov: 32 });
        c.fx.bigSweat(c.T, lt - 0.3);
      },
    },
    {
      // o relógio dispara até o almoço
      at: 56,
      set: 'classroom',
      run(c, lt) {
        const h = 8.75 + easeOut(range(lt, 0.2, 3.2)) * 3.25;
        c.set.clock.userData.set(h);
        seated(c, lt, { expr: () => 'closed' });
        c.camKF(lt, [
          [0, [0, 2.45, -3.2], [0, 2.6, -4.6], 30],
          [4, [0, 2.55, -3.6], [0, 2.6, -4.6], 30],
        ]);
        c.post.set({ zoom: 0.06 * pulse(lt, 0.2, 0.6, 2.6, 3.2) });
        c.ov.onoma('12:00', 1500, 860, 110, lt - 3.0, { color: '#ffe23a', dur: 1.0, rot: 0 });
        c.ov.fade('#ffffff', smooth(range(lt, 3.6, 4)));
      },
    },
  ],
  lines: [
    [1.0, 3.2, 'tanaka', 'Pessoal, silêncio! Hoje temos uma aluna nova.'],
    [8.4, 1.8, 'aluno', 'Que fofa...'],
    [10.3, 1.6, 'aluna', 'Ela é linda!'],
    [12.3, 4.3, 'hana', 'Muito prazer! Eu sou a Hana Mizuki. Espero que a gente se dê bem!'],
    [18.2, 3.0, 'tanaka', 'Mizuki-san, pode sentar... ali, do lado do Akashi-kun.'],
    [21.4, 1.5, 'aluno', 'C-coitada...'],
    [27.0, 2.0, 'hana', 'Oi! Prazer, vizinho!'],
    [29.1, 0.9, 'akashi', '...Hm.'],
    [30.5, 3.4, 'hana', 'Todo mundo parece ter medo dele...', { thought: true }],
    [34.2, 3.6, 'hana', '...mas os olhos dele parecem tão tranquilos.', { thought: true }],
    [38.5, 4.6, 'akashi', 'Rosbife... Será que ainda vai ter rosbife no almoço?', { thought: true }],
    [46.3, 1.4, 'hana', 'Hihi...'],
    [48.0, 1.8, 'akashi', 'Tá rindo de quê?!', { shout: true }],
    [50.0, 1.7, 'hana', 'N-nada!'],
    [52.3, 3.3, 'tanaka', 'Ahem... v-vamos abrir o livro na página 42...'],
  ],
  sfx: [
    [0.2, 'chalk', { v: 0.5 }],
    [6.15, 'door', { d: 0.5, v: 0.5 }],
    [6.6, 'crowd', { d: 5.2, v: 0.2, s: 1 }],
    [21.3, 'whoosh', { d: 0.3, v: 0.3 }],
    [26.3, 'heart', { v: 0.7 }],
    [43.5, 'growl', { d: 1.6, v: 0.9 }],
    [46.1, 'boing', { v: 0.4, down: 1 }],
    [48.0, 'pop', { v: 0.5 }],
    [56.2, 'whoosh', { d: 3, v: 0.35, lo: 300, hi: 1500 }],
    [57.8, 'chime', { v: 0.5 }],
  ],
};
