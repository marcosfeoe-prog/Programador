// Medidas oficiais (IFAB) e constantes físicas. Unidades: metros, segundos, kg.
// Eixos: x ao longo do campo (gols em x = ±52,5), z na largura, y para cima.

export const PITCH = {
  L: 105,
  W: 68,
  HL: 52.5, // metade do comprimento
  HW: 34, // metade da largura
  goalW: 7.32,
  goalH: 2.44,
  postR: 0.06, // traves de 12 cm
  netTopDepth: 0.9,
  netDepth: 2.0,
  boxD: 16.5,
  boxW: 40.32,
  sixD: 5.5,
  sixW: 18.32,
  penSpot: 11,
  circleR: 9.15,
  arcR: 9.15,
  boardX: 57, // placas de publicidade atrás do gol
  boardZ: 38.5, // placas laterais
  boardH: 0.9,
};

export const BALL = {
  m: 0.43,
  r: 0.11,
  A: Math.PI * 0.11 * 0.11,
  k: 2 / 3, // momento de inércia de casca esférica: I = k m r²
};

export const G = 9.81;

// Fixos da simulação
export const STEP = 1 / 60; // passo dos jogadores e da IA
export const BALL_SUBSTEPS = 4; // 240 Hz para a bola
