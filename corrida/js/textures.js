// Texturas procedurais (canvas) — nenhum arquivo de imagem externo.
import * as THREE from 'three';

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTex(c, { srgb = true, repeat = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}

function speckle(g, w, h, n, colors, r, rand) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[(rand() * colors.length) | 0];
    const s = 1 + rand() * r;
    g.fillRect(rand() * w, rand() * h, s, s);
  }
}

// Asfalto: u = largura da pista (0..1), v = comprimento.
export function asphaltTexture() {
  const [c, g] = canvas(512, 512);
  const rand = rng(11);
  g.fillStyle = '#3b3d41';
  g.fillRect(0, 0, 512, 512);
  speckle(g, 512, 512, 26000, ['#2c2e31', '#46484c', '#505257', '#35373a', '#5b5d61'], 2, rand);
  // linha de borracha (traçado ideal), mais escura no meio
  const grd = g.createLinearGradient(0, 0, 512, 0);
  grd.addColorStop(0.25, 'rgba(0,0,0,0)');
  grd.addColorStop(0.5, 'rgba(10,10,12,0.25)');
  grd.addColorStop(0.75, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 512);
  // remendos
  for (let i = 0; i < 5; i++) {
    g.fillStyle = `rgba(20,20,22,${0.15 + rand() * 0.15})`;
    g.fillRect(60 + rand() * 380, rand() * 512, 20 + rand() * 60, 20 + rand() * 80);
  }
  // faixas brancas de borda
  g.fillStyle = '#e9e9e4';
  g.fillRect(8, 0, 14, 512);
  g.fillRect(512 - 22, 0, 14, 512);
  speckle(g, 512, 512, 900, ['#3b3d41'], 2, rand);
  return toTex(c);
}

export function grassTexture() {
  const [c, g] = canvas(256, 256);
  const rand = rng(5);
  g.fillStyle = '#4a7a2e';
  g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 9000, ['#3f6d27', '#558a35', '#5f963b', '#41702a', '#6a9f44'], 2, rand);
  for (let i = 0; i < 1400; i++) {
    g.strokeStyle = rand() < 0.5 ? 'rgba(110,160,70,0.5)' : 'rgba(40,80,25,0.5)';
    const x = rand() * 256;
    const y = rand() * 256;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rand() - 0.5) * 3, y - 2 - rand() * 4);
    g.stroke();
  }
  return toTex(c);
}

export function curbTexture() {
  const [c, g] = canvas(64, 256);
  g.fillStyle = '#d42020';
  g.fillRect(0, 0, 64, 128);
  g.fillStyle = '#f2f2f2';
  g.fillRect(0, 128, 64, 128);
  g.fillStyle = 'rgba(0,0,0,0.12)';
  for (let i = 0; i < 64; i += 4) g.fillRect(i, 0, 1, 256);
  return toTex(c);
}

export function checkerTexture(n = 8, m = 2) {
  const [c, g] = canvas(64 * n, 64 * m);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++) {
      g.fillStyle = (i + j) % 2 ? '#111' : '#f4f4f4';
      g.fillRect(i * 64, j * 64, 64, 64);
    }
  return toTex(c);
}

// Muro de concreto com faixas de patrocinadores fictícios. u = comprimento, v = altura.
export function barrierTexture() {
  const [c, g] = canvas(1024, 128);
  const rand = rng(3);
  g.fillStyle = '#c9c8c2';
  g.fillRect(0, 0, 1024, 128);
  speckle(g, 1024, 128, 6000, ['#b5b4ae', '#d6d5cf', '#a9a8a2'], 2, rand);
  const ads = [
    ['#0f4fa8', '#ffffff', 'TURBO'],
    ['#f2c200', '#141414', 'PNEUS ARCO'],
    ['#c41e1e', '#ffffff', 'VELOX'],
    ['#151515', '#ff7a00', 'CORRIDA 3D'],
  ];
  ads.forEach(([bg, fg, txt], i) => {
    const x = i * 256;
    g.fillStyle = bg;
    g.fillRect(x + 4, 14, 248, 70);
    g.fillStyle = fg;
    g.font = 'bold 44px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(txt, x + 128, 50, 230);
  });
  // faixa vermelha/branca na base
  for (let i = 0; i < 1024; i += 64) {
    g.fillStyle = (i / 64) % 2 ? '#d42020' : '#f0f0f0';
    g.fillRect(i, 98, 64, 30);
  }
  return toTex(c);
}

export function carbonTexture() {
  const [c, g] = canvas(64, 64);
  for (let i = 0; i < 8; i++)
    for (let j = 0; j < 8; j++) {
      const lg = g.createLinearGradient(i * 8, j * 8, i * 8 + 8, j * 8 + 8);
      const a = (i + j) % 2 ? ['#2a2c30', '#121315'] : ['#121315', '#2a2c30'];
      lg.addColorStop(0, a[0]);
      lg.addColorStop(1, a[1]);
      g.fillStyle = lg;
      g.fillRect(i * 8, j * 8, 8, 8);
    }
  const t = toTex(c);
  t.repeat.set(4, 4);
  return t;
}

export function honeycombTexture() {
  const [c, g] = canvas(128, 64);
  g.fillStyle = '#050505';
  g.fillRect(0, 0, 128, 64);
  g.strokeStyle = '#3a3a3a';
  g.lineWidth = 2;
  const r = 6;
  for (let y = 0; y < 72; y += r * 1.5) {
    for (let x = 0; x < 136; x += r * Math.sqrt(3)) {
      const ox = ((y / (r * 1.5)) % 2) * r * 0.866;
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
        g.lineTo(x + ox + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      g.closePath();
      g.stroke();
    }
  }
  const t = toTex(c);
  t.repeat.set(4, 8);
  return t;
}

// Pneu: u = volta ao redor, v = perfil (lateral A → banda → lateral B).
export function tireTexture(treadV0, treadV1, sideTextV) {
  const [c, g] = canvas(1024, 256);
  const H = 256;
  g.fillStyle = '#1b1b1d';
  g.fillRect(0, 0, 1024, H);
  const y0 = (1 - treadV1) * H;
  const y1 = (1 - treadV0) * H;
  g.fillStyle = '#232326';
  g.fillRect(0, y0, 1024, y1 - y0);
  // sulcos circunferenciais
  g.fillStyle = '#0b0b0c';
  [0.22, 0.5, 0.78].forEach((f) => g.fillRect(0, y0 + (y1 - y0) * f - 3, 1024, 6));
  // sulcos diagonais
  g.strokeStyle = '#0e0e10';
  g.lineWidth = 3;
  for (let x = 0; x < 1024; x += 16) {
    g.beginPath();
    g.moveTo(x, y0);
    g.lineTo(x + 10, y0 + (y1 - y0) * 0.22);
    g.moveTo(x + 10, y0 + (y1 - y0) * 0.78);
    g.lineTo(x, y1);
    g.stroke();
  }
  // letras na lateral
  g.fillStyle = '#e8e8e8';
  g.font = 'bold 22px Arial, sans-serif';
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  for (const v of sideTextV) {
    const y = (1 - v) * H;
    for (let k = 0; k < 2; k++) {
      g.fillText('PNEUS ARCO', 256 + k * 512, y);
      g.font = 'bold 12px Arial, sans-serif';
      g.fillText('RACING 265/35 R19', 64 + k * 512, y);
      g.fillText('RACING 265/35 R19', 448 + k * 512, y);
      g.font = 'bold 22px Arial, sans-serif';
    }
  }
  return toTex(c, { aniso: 4 });
}

// Pintura do carro. U = comprimento (0 = frente). V = volta na seção, com
// faixas fixas: 0–0,04 assoalho, 0,04–0,08 canto inferior, 0,08–0,30 lateral,
// 0,30–0,36 ombro e 0,36–0,5 topo (V = 0,5 − 0,22·x). A outra metade espelha (1 − V).
export const LIVERY_V = { side0: 0.08, side1: 0.3, topK: 0.22 };
export function liveryTexture(spec) {
  const W = 1024;
  const H = 512;
  const [c, g] = canvas(W, H);
  g.fillStyle = spec.color;
  g.fillRect(0, 0, W, H);
  const vy = (v) => (1 - v) * H;
  const vx = (x) => 0.5 - LIVERY_V.topK * x; // V no topo para a distância x do centro
  const both = (fn) => {
    fn(false);
    fn(true);
  };
  // faixas duplas no capô, teto e tampa traseira
  if (spec.stripes) {
    g.fillStyle = spec.stripeColor;
    for (const [x0, x1] of [
      [0.06, 0.2],
      [-0.2, -0.06],
    ])
      g.fillRect(W * 0.004, vy(vx(x0)), W * 0.992, vy(vx(x1)) - vy(vx(x0)));
  }
  // faixa lateral alta, logo abaixo do ombro
  if (spec.sideStripe) {
    g.fillStyle = spec.stripeColor;
    both((r) => {
      const v = r ? 1 - 0.288 : 0.288;
      g.save();
      g.translate(0, vy(v));
      if (r) g.scale(1, -1);
      g.beginPath();
      g.moveTo(W * 0.06, 4);
      g.lineTo(W * 0.95, 9);
      g.lineTo(W * 0.95, -7);
      g.lineTo(W * 0.06, -3);
      g.fill();
      g.restore();
    });
  }
  // juntas de painéis (portas, capô, tampa traseira)
  g.strokeStyle = 'rgba(0,0,0,0.6)';
  g.lineWidth = 2;
  const line = (u0, v0, u1, v1) => {
    g.beginPath();
    g.moveTo(u0 * W, vy(v0));
    g.lineTo(u1 * W, vy(v1));
    g.stroke();
  };
  for (const r of [false, true]) {
    if (spec.noPanelLines) break;
    const V = (v) => (r ? 1 - v : v);
    for (const u of spec.doorLines) line(u, V(0.1), u + 0.006, V(0.3));
    line(spec.doorLines[0], V(0.1), spec.doorLines[1], V(0.1));
    // capô: laterais e junta traseira
    line(0.012, V(vx(spec.hoodHalf)), spec.hoodLine, V(vx(spec.hoodHalf)));
    if (spec.trunkLine) line(spec.trunkLine, V(vx(spec.trunkHalf)), 0.99, V(vx(spec.trunkHalf)));
  }
  if (!spec.noPanelLines) line(spec.hoodLine, vx(spec.hoodHalf), spec.hoodLine, 1 - vx(spec.hoodHalf));
  if (spec.trunkLine && !spec.noPanelLines) line(spec.trunkLine, vx(spec.trunkHalf), spec.trunkLine, 1 - vx(spec.trunkHalf));
  // número nas laterais
  const drawNumber = (u, v, flip) => {
    g.save();
    g.translate(u * W, vy(v));
    if (flip) g.rotate(Math.PI);
    g.fillStyle = '#f7f7f7';
    g.beginPath();
    g.ellipse(0, 0, 44, 30, 0, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = '#111';
    g.stroke();
    g.fillStyle = '#111';
    g.font = 'bold 46px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(spec.number), 0, 3);
    g.restore();
  };
  if (!spec.noNumber) {
    drawNumber(spec.numberU, 0.19, false);
    drawNumber(spec.numberU, 0.81, true);
  }
  // patrocínios na parte baixa da lateral
  const sponsor = (u, v, flip, txt) => {
    g.save();
    g.translate(u * W, vy(v));
    if (flip) g.rotate(Math.PI);
    g.fillStyle = spec.sponsorColor;
    g.font = 'bold 17px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(txt, 0, 0);
    g.restore();
  };
  // entre as caixas de roda: VELOX na porta, PNEUS ARCO atrás dela
  const su0 = spec.doorLines[0] + 0.045;
  const su1 = Math.min(spec.doorLines[1] + 0.045, spec.rearU - 0.16);
  if (!spec.noSponsors) {
    sponsor(su0, 0.115, false, 'VELOX');
    sponsor(su0, 0.885, true, 'VELOX');
    sponsor(su1, 0.115, false, 'PNEUS ARCO');
    sponsor(su1, 0.885, true, 'PNEUS ARCO');
  }
  // desenho extra do módulo do carro (grafismos, textos, degradês)
  if (spec.draw) spec.draw(g, { W, H, vy, vx, both, line, drawNumber, sponsor, spec });
  // assoalho e canto inferior escuros
  g.fillStyle = '#141518';
  g.fillRect(0, vy(0.055), W, vy(0) - vy(0.055));
  g.fillRect(0, 0, W, vy(0.945));
  return toTex(c, { repeat: false });
}

// Veneziana (aberturas do capô/para-lama): ripas inclinadas escuras.
export function louverTexture() {
  const [c, g] = canvas(64, 64);
  g.fillStyle = '#060607';
  g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 8) {
    const lg = g.createLinearGradient(0, y, 0, y + 8);
    lg.addColorStop(0, '#3a3c40');
    lg.addColorStop(0.35, '#1c1d20');
    lg.addColorStop(1, '#050506');
    g.fillStyle = lg;
    g.fillRect(0, y + 1, 64, 6);
  }
  return toTex(c);
}

// Disco de freio ventilado e perfurado (UV planar da tampa do cilindro).
export function discTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#2a2b2e';
  g.fillRect(0, 0, 256, 256);
  const grd = g.createRadialGradient(128, 128, 40, 128, 128, 128);
  grd.addColorStop(0, '#3a3b3f');
  grd.addColorStop(0.45, '#8c8f94');
  grd.addColorStop(0.75, '#9a9da2');
  grd.addColorStop(0.98, '#6d7075');
  grd.addColorStop(1, '#2a2b2e');
  g.fillStyle = grd;
  g.beginPath();
  g.arc(128, 128, 127, 0, Math.PI * 2);
  g.fill();
  // marcas circulares de uso
  g.strokeStyle = 'rgba(0,0,0,0.12)';
  for (let r = 64; r < 125; r += 3) {
    g.beginPath();
    g.arc(128, 128, r, 0, Math.PI * 2);
    g.stroke();
  }
  // furos
  g.fillStyle = '#121214';
  for (let k = 0; k < 36; k++) {
    for (const rr of [78, 96, 114]) {
      const a = (k / 36) * Math.PI * 2 + rr * 0.01;
      g.beginPath();
      g.arc(128 + Math.cos(a) * rr, 128 + Math.sin(a) * rr, 3, 0, Math.PI * 2);
      g.fill();
    }
  }
  return toTex(c, { repeat: false });
}

export function plateTexture(txt) {
  const [c, g] = canvas(256, 80);
  g.fillStyle = '#f4f4f0';
  g.fillRect(0, 0, 256, 80);
  g.fillStyle = '#1f4ea8';
  g.fillRect(0, 0, 256, 18);
  g.fillStyle = '#fff';
  g.font = 'bold 13px Arial';
  g.textAlign = 'center';
  g.fillText('BRASIL', 128, 14);
  g.fillStyle = '#111';
  g.font = 'bold 46px Arial';
  g.fillText(txt, 128, 66);
  g.strokeStyle = '#111';
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, 253, 77);
  return toTex(c, { repeat: false });
}

export function bannerTexture(text, bg = '#111', fg = '#fff') {
  const [c, g] = canvas(1024, 128);
  g.fillStyle = bg;
  g.fillRect(0, 0, 1024, 128);
  g.fillStyle = fg;
  g.font = 'bold 84px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 512, 68);
  return toTex(c, { repeat: false });
}

export function garageTexture() {
  const [c, g] = canvas(512, 128);
  g.fillStyle = '#d8d8d8';
  g.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 4; i++) {
    const x = i * 128 + 14;
    g.fillStyle = '#5b6068';
    g.fillRect(x, 30, 100, 98);
    g.fillStyle = '#4b5058';
    for (let y = 34; y < 128; y += 8) g.fillRect(x, y, 100, 2);
  }
  g.fillStyle = '#c41e1e';
  g.fillRect(0, 0, 512, 18);
  return toTex(c);
}

export function softDotTexture() {
  const [c, g] = canvas(64, 64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return toTex(c, { repeat: false });
}
