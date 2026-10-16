// Ciclone F5 — hipercarro de motor central (inspirado na referência 2).
// Módulo próprio: forma da carroceria (seções) + detalhes em decorate(ctx).
// Coordenadas do modelo: +z frente, +y cima, +x esquerda; chão em y = 0.
// ctx: ver buildCar() em ../carModel.js (onFront/onRear/onTop/onSide, plateGeo,
// headlight/taillight, part(), materiais M, paint/paintPlain, etc.).

export default {
  id: 'ciclone',
  style: 'ciclone',
  name: 'Ciclone F5',
  desc: 'Hipercarro biturbo de motor central. A maior velocidade final do grid.',
  length: 4.7,
  frontU: 0.165,
  rearU: 0.78,
  wheelR: 0.35,
  tireW: 0.32,
  trackHalf: 0.87,
  hw: [[0, 0.82], [0.04, 0.92], [0.1, 0.98], [0.165, 1.01], [0.3, 0.96], [0.45, 0.92], [0.6, 0.98], [0.78, 1.05], [0.92, 1.0], [1, 0.9]],
  yb: [[0, 0.15], [0.05, 0.12], [0.9, 0.13], [1, 0.22]],
  yt: [[0, 0.44], [0.05, 0.52], [0.165, 0.6], [0.26, 0.66], [0.75, 0.86], [0.92, 0.9], [1, 0.82]],
  yf: [[0, 0.46], [0.05, 0.6], [0.165, 0.82], [0.3, 0.76], [0.5, 0.8], [0.78, 0.98], [0.92, 0.96], [1, 0.84]],
  rs: 0.13,
  rb: 0.06,
  tuck: 0.05,
  tumble: 0.08,
  flare: 0.02,
  sideScoops: [{ u0: 0.4, u1: 0.68, y0: 0.25, y1: 0.7, depth: 0.14 }],
  cab: { s: 0.26, e: 0.74, roof: 1.13, tW: 0.42, tR: 0.64, hwBase: [[0, 0.84], [0.5, 0.78], [1, 0.56]], hwRoof: [[0, 0.62], [0.5, 0.56], [1, 0.36]], rRoof: 0.16, crown: 0.04, winEnd: 0.7, bPillar: null, roofMat: 'carbon', darkGlass: true },
  wheelStyle: 'center10',
  doorLines: [0.33, 0.57],
  hoodLine: 0.24,
  hoodHalf: 0.58,
  trunkLine: 0.76,
  trunkHalf: 0.6,
  numberU: 0.47,
  stripes: false,
  sideStripe: false,
  skip: { markers: true },
  mass: 1360,
  power: 1.45,
  grip: 1.04,
  downforce: 1.2,
  drag: 0.9,
  final: 3.0,
  decorate(ctx) {
    const { onFront, headlight, part, fy, front } = ctx;
    for (const sgn of [1, -1]) {
      const g = onFront(sgn * front.hw * 0.66, fy(0.78), 0.006);
      g.add(headlight(sgn, [[-0.17, -0.02], [0.14, -0.035], [0.2, 0.0], [0.17, 0.03], [-0.15, 0.025]], { projectors: 2 }));
      part(sgn > 0 ? 'farol esquerdo' : 'farol direito', 14).add(g);
    }
  },
};
