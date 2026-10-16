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
  t.repeat.set(3, 1);
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

// Pintura do carro. U = comprimento (0 = frente), V = volta (0 baixo, .25 esquerda, .5 topo, .75 direita).
export function liveryTexture(spec) {
  const W = 1024;
  const H = 512;
  const [c, g] = canvas(W, H);
  g.fillStyle = spec.color;
  g.fillRect(0, 0, W, H);
  const vy = (v) => (1 - v) * H;
  // faixas no topo
  if (spec.stripes) {
    g.fillStyle = spec.stripeColor;
    g.fillRect(0, vy(0.5) - 26, W, 16);
    g.fillRect(0, vy(0.5) + 10, W, 16);
  }
  // faixa lateral
  if (spec.sideStripe) {
    g.fillStyle = spec.stripeColor;
    for (const v of [0.215, 0.785]) {
      g.save();
      g.translate(0, vy(v));
      g.beginPath();
      g.moveTo(W * 0.08, -6);
      g.lineTo(W * 0.92, -14);
      g.lineTo(W * 0.92, 4);
      g.lineTo(W * 0.08, 6);
      g.fill();
      g.restore();
    }
  }
  // linhas das portas
  g.strokeStyle = 'rgba(0,0,0,0.55)';
  g.lineWidth = 2;
  for (const [vA, vB] of [
    [0.16, 0.34],
    [0.66, 0.84],
  ]) {
    for (const u of spec.doorLines) {
      g.beginPath();
      g.moveTo(u * W, vy(vA));
      g.lineTo(u * W + 6, vy(vB));
      g.stroke();
    }
  }
  // capô: linhas das juntas
  g.beginPath();
  g.moveTo(spec.hoodLine * W, vy(0.42));
  g.lineTo(spec.hoodLine * W, vy(0.58));
  g.stroke();
  // número nas laterais
  const drawNumber = (u, v, flip) => {
    g.save();
    g.translate(u * W, vy(v));
    if (flip) g.rotate(Math.PI);
    g.fillStyle = '#f7f7f7';
    g.beginPath();
    g.ellipse(0, 0, 46, 34, 0, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = '#111';
    g.stroke();
    g.fillStyle = '#111';
    g.font = 'bold 50px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(spec.number), 0, 3);
    g.restore();
  };
  drawNumber(spec.numberU, 0.24, false);
  drawNumber(spec.numberU, 0.76, true);
  // patrocínio na saia lateral
  const sponsor = (u, v, flip, txt) => {
    g.save();
    g.translate(u * W, vy(v));
    if (flip) g.rotate(Math.PI);
    g.fillStyle = spec.sponsorColor;
    g.font = 'bold 22px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(txt, 0, 0);
    g.restore();
  };
  sponsor(0.3, 0.12, false, 'VELOX');
  sponsor(0.3, 0.88, true, 'VELOX');
  sponsor(0.72, 0.13, false, 'PNEUS ARCO');
  sponsor(0.72, 0.87, true, 'PNEUS ARCO');
  // fundo escuro
  g.fillStyle = '#16171a';
  g.fillRect(0, vy(0.06), W, vy(0) - vy(0.06));
  g.fillRect(0, 0, W, vy(0.94));
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
