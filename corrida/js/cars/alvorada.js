// Alvorada H2 — protótipo a hidrogênio (inspirado na referência 1).
// Módulo próprio: forma da carroceria (seções) + detalhes em decorate(ctx).
// Coordenadas do modelo: +z frente, +y cima, +x esquerda; chão em y = 0.
// ctx: ver buildCar() em ../carModel.js (onFront/onRear/onTop/onSide, plateGeo,
// headlight/taillight, part(), materiais M, paint/paintPlain, etc.).

export default {
  id: 'alvorada',
  style: 'alvorada',
  name: 'Alvorada H2',
  desc: 'Protótipo a hidrogênio de pontões e cockpit-bolha. A maior aderência do grid.',
  length: 5.0,
  frontU: 0.17,
  rearU: 0.79,
  wheelR: 0.36,
  tireW: 0.32,
  trackHalf: 0.9,
  hw: [[0, 0.7], [0.04, 0.85], [0.1, 0.98], [0.17, 1.05], [0.27, 1.0], [0.4, 0.92], [0.55, 0.95], [0.79, 1.08], [0.92, 1.04], [1, 0.9]],
  yb: [[0, 0.12], [0.05, 0.1], [0.9, 0.12], [1, 0.2]],
  yt: [[0, 0.28], [0.06, 0.36], [0.17, 0.46], [0.28, 0.6], [0.4, 0.7], [0.7, 0.78], [0.9, 0.8], [1, 0.74]],
  yf: [[0, 0.34], [0.05, 0.55], [0.17, 0.86], [0.27, 0.72], [0.42, 0.7], [0.6, 0.78], [0.79, 0.94], [0.92, 0.9], [1, 0.78]],
  rs: 0.14,
  rb: 0.06,
  tuck: 0.05,
  tumble: 0.1,
  flare: 0.02,
  sideScoops: [{ u0: 0.24, u1: 0.62, y0: 0.22, y1: 0.62, depth: 0.16 }],
  cab: { s: 0.27, e: 0.7, roof: 1.12, tW: 0.45, tR: 0.65, hwBase: [[0, 0.6], [0.5, 0.62], [1, 0.4]], hwRoof: [[0, 0.45], [0.5, 0.5], [1, 0.3]], rRoof: 0.16, crown: 0.05, winEnd: 0.7, bPillar: null, darkGlass: true, singleSeat: true },
  wheelStyle: 'y5',
  doorLines: [0.33, 0.56],
  hoodLine: 0.25,
  hoodHalf: 0.5,
  trunkLine: 0.74,
  trunkHalf: 0.55,
  numberU: 0.48,
  stripes: false,
  sideStripe: false,
  skip: { handles: true, markers: true, fuel: true, wipers: true, plate: true, thirdBrake: true },
  mass: 1300,
  power: 1.25,
  grip: 1.1,
  downforce: 1.6,
  final: 3.3,
  decorate(ctx) {
    const { onFront, headlight, part, fy, front } = ctx;
    for (const sgn of [1, -1]) {
      const g = onFront(sgn * front.hw * 0.6, fy(0.7), 0.006);
      g.add(headlight(sgn, [[-0.16, -0.02], [0.16, -0.03], [0.17, 0.02], [-0.15, 0.025]], { projectors: 2 }));
      part(sgn > 0 ? 'farol esquerdo' : 'farol direito', 14).add(g);
    }
  },
};
