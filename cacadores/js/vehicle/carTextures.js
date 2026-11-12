// Texturas dos veículos desenhadas do zero: pintura com faixas e adesivos da equipe,
// vidros com colunas, frente (grade, faróis) e traseira (lanternas), pneus, rodas e
// placas no padrão de cada país (EUA, Canadá, Mercosul, Chile).

import * as THREE from 'three';
import { RNG } from '../core/rng.js';

function cv(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function tex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

function shade(hex, f) {
  const c = new THREE.Color(hex);
  const o = {};
  c.getRGB(o, THREE.SRGBColorSpace);
  return `rgb(${Math.min(255, o.r * 255 * f) | 0},${Math.min(255, o.g * 255 * f) | 0},${Math.min(255, o.b * 255 * f) | 0})`;
}

// Lateral da carroceria. u = comprimento (0 = traseira, 1 = frente);
// v: 0..0.5 lado direito (0 = baixo, 0.5 = topo), 0.5..1 lado esquerdo.
export function bodyTexture(spec) {
  const W = 1024;
  const H = 512;
  const c = cv(W, H);
  const g = c.getContext('2d');
  const paint = spec.paint;
  g.fillStyle = paint;
  g.fillRect(0, 0, W, H);
  // Leve variação de brilho (reflexo do céu na parte de cima).
  for (const half of [0, 1]) {
    const y0 = half * H * 0.5;
    const gr = g.createLinearGradient(0, y0 + (half ? 0 : H * 0.5), 0, y0 + (half ? H * 0.5 : 0));
    gr.addColorStop(0, 'rgba(0,0,0,0.25)');
    gr.addColorStop(0.35, 'rgba(0,0,0,0)');
    gr.addColorStop(0.7, 'rgba(255,255,255,0.06)');
    gr.addColorStop(1, 'rgba(255,255,255,0.12)');
    g.fillStyle = gr;
    g.fillRect(0, y0, W, H * 0.5);
  }
  const side = (fn) => {
    // Desenha nos dois lados (o esquerdo é espelhado verticalmente).
    g.save();
    g.translate(0, H * 0.5);
    g.scale(1, -1);
    fn(true);
    g.restore();
    g.save();
    g.translate(0, H * 0.5);
    fn(false);
    g.restore();
  };
  // Em cada lado, y = 0 é a linha central do teto e y = H/2 é o assoalho.
  side((right) => {
    const vy = (v) => (0.5 - v) * H; // v em 0..0.5 (0 baixo, 0.5 topo)
    // Saia/soleira escura.
    g.fillStyle = 'rgba(20,20,22,0.9)';
    g.fillRect(0, vy(0.07), W, vy(0) - vy(0.07));
    // Faixas de pintura.
    if (spec.stripe) {
      g.fillStyle = spec.stripe;
      g.fillRect(0, vy(0.205), W, vy(0.17) - vy(0.205));
      g.fillStyle = spec.stripe2 || 'rgba(255,255,255,0.8)';
      g.fillRect(0, vy(0.215), W, 4);
    }
    // Portas (vincos) e maçanetas.
    g.strokeStyle = 'rgba(0,0,0,0.45)';
    g.lineWidth = 2;
    for (const d of spec.doors || []) {
      g.beginPath();
      g.moveTo(d * W, vy(0.08));
      g.lineTo(d * W, vy(0.3));
      g.stroke();
      g.fillStyle = 'rgba(30,30,30,0.7)';
      g.fillRect(d * W - 34, vy(0.255), 22, 5);
    }
    // Adesivos da equipe.
    if (spec.decal) {
      g.save();
      g.fillStyle = spec.decalColor || '#ffffff';
      g.font = `bold ${spec.decalSize || 34}px sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const x = W * (spec.decalU || 0.48);
      const y = vy(spec.decalV || 0.15);
      if (!right) {
        // Lado esquerdo vem espelhado: desespelha o texto.
        g.translate(x, y);
        g.scale(1, -1);
        g.fillText(spec.decal, 0, 0);
      } else g.fillText(spec.decal, x, y);
      g.restore();
    }
    if (spec.number) {
      g.save();
      const x = W * 0.3;
      const y = vy(0.2);
      g.translate(x, y);
      if (!right) g.scale(1, -1);
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(0, 0, 26, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#111';
      g.font = 'bold 30px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(spec.number, 0, 1);
      g.restore();
    }
    // Lama nas partes de baixo.
    const rng = new RNG(right ? 3 : 4);
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(90,70,50,${rng.next() * 0.18})`;
      const x = rng.next() * W;
      g.beginPath();
      g.ellipse(x, vy(0.02 + rng.next() * 0.07), 10 + rng.next() * 30, 3 + rng.next() * 6, 0, 0, Math.PI * 2);
      g.fill();
    }
  });
  return tex(c);
}

// Cabine: janelas escuras com colunas na cor do carro.
// u = 0 traseira → 1 frente; v = 0 cintura esq. → 0.5 teto → 1 cintura dir.
export function cabinTexture(spec) {
  const W = 512;
  const H = 256;
  const c = cv(W, H);
  const g = c.getContext('2d');
  g.fillStyle = spec.roof || spec.paint;
  g.fillRect(0, 0, W, H);
  const glass = (x0, y0, x1, y1) => {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, '#1a2430');
    gr.addColorStop(0.5, '#33414e');
    gr.addColorStop(1, '#111820');
    g.fillStyle = gr;
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
  };
  const win = spec.windows || { rear: 0.12, front: 0.88, pillars: [0.5], sideTop: 0.3 };
  // Janelas laterais (as duas faixas de v).
  const sideH = win.sideTop;
  for (const [a, b] of [
    [0.02, sideH],
    [1 - sideH, 0.98],
  ]) {
    glass(win.rear * W, a * H, win.front * W, b * H);
    g.fillStyle = spec.pillar || '#111';
    for (const p of win.pillars) g.fillRect(p * W - 7, a * H, 14, (b - a) * H);
  }
  // Para-brisa e vidro traseiro (faixas nas pontas).
  glass(win.front * W + 6, 0.05 * H, W, 0.95 * H);
  glass(0, 0.08 * H, win.rear * W - 6, 0.92 * H);
  // Rack de teto / bagageiro.
  if (spec.roofRack) {
    g.fillStyle = '#222';
    for (const v of [0.4, 0.6]) g.fillRect(0.2 * W, v * H - 3, 0.6 * W, 6);
  }
  return tex(c);
}

// Frente (metade esquerda) e traseira (metade direita).
export function endsTexture(spec, country) {
  const W = 512;
  const H = 256;
  const c = cv(W, H);
  const g = c.getContext('2d');
  g.fillStyle = spec.paint;
  g.fillRect(0, 0, W, H);
  // --- Frente
  g.fillStyle = '#1a1a1c';
  g.fillRect(40, 70, 176, 70);
  g.strokeStyle = '#3a3a3e';
  g.lineWidth = 2;
  for (let x = 48; x < 210; x += 10) {
    g.beginPath();
    g.moveTo(x, 74);
    g.lineTo(x, 136);
    g.stroke();
  }
  for (const x of [8, 196]) {
    const gr = g.createRadialGradient(x + 26, 100, 2, x + 26, 100, 30);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.5, '#c8d0d8');
    gr.addColorStop(1, '#5a6066');
    g.fillStyle = gr;
    g.fillRect(x, 82, 52, 36);
  }
  g.fillStyle = '#1c1c1e';
  g.fillRect(0, 170, 256, 60);
  plate(g, 88, 182, 80, 34, country, spec.plateText);
  // --- Traseira
  g.fillStyle = '#1c1c1e';
  g.fillRect(256, 170, 256, 60);
  for (const x of [262, 442]) {
    g.fillStyle = '#8a0c0c';
    g.fillRect(x, 70, 44, 50);
    g.fillStyle = 'rgba(255,120,120,0.5)';
    g.fillRect(x + 4, 74, 36, 12);
    g.fillStyle = '#d8d8d8';
    g.fillRect(x, 108, 44, 10);
  }
  plate(g, 344, 120, 80, 34, country, spec.plateText);
  return tex(c);
}

function plate(g, x, y, w, h, country, text) {
  const id = country?.id || 'usa';
  if (id === 'brasil' || id === 'argentina' || id === 'uruguai') {
    // Placa Mercosul: fundo branco com faixa azul no alto.
    g.fillStyle = '#f4f4f4';
    g.fillRect(x, y, w, h);
    g.fillStyle = '#1f4fa0';
    g.fillRect(x, y, w, h * 0.26);
    g.fillStyle = '#fff';
    g.font = `bold ${h * 0.18}px sans-serif`;
    g.textAlign = 'center';
    g.fillText(id === 'brasil' ? 'BRASIL' : id === 'argentina' ? 'ARGENTINA' : 'URUGUAY', x + w / 2, y + h * 0.2);
    g.fillStyle = '#111';
    g.font = `bold ${h * 0.5}px monospace`;
    g.fillText(text || 'BRA2E19', x + w / 2, y + h * 0.84, w * 0.92);
  } else if (id === 'chile') {
    g.fillStyle = '#f4f4f0';
    g.fillRect(x, y, w, h);
    g.fillStyle = '#111';
    g.font = `bold ${h * 0.5}px monospace`;
    g.textAlign = 'center';
    g.fillText(text || 'KXPT·42', x + w / 2, y + h * 0.7, w * 0.92);
    g.font = `${h * 0.18}px sans-serif`;
    g.fillText('CHILE', x + w / 2, y + h * 0.95);
  } else if (id === 'canada') {
    g.fillStyle = '#f2f2f2';
    g.fillRect(x, y, w, h);
    g.fillStyle = '#1a3a8a';
    g.font = `bold ${h * 0.5}px monospace`;
    g.textAlign = 'center';
    g.fillText(text || 'HZR 427', x + w / 2, y + h * 0.7, w * 0.9);
    g.font = `${h * 0.16}px sans-serif`;
    g.fillText('MANITOBA', x + w / 2, y + h * 0.95);
  } else {
    g.fillStyle = '#eef0f2';
    g.fillRect(x, y, w, h);
    g.fillStyle = '#1d3f7a';
    g.font = `bold ${h * 0.5}px monospace`;
    g.textAlign = 'center';
    g.fillText(text || 'TRN-427', x + w / 2, y + h * 0.72, w * 0.9);
    g.font = `${h * 0.16}px sans-serif`;
    g.fillText('OKLAHOMA', x + w / 2, y + h * 0.95);
  }
  g.strokeStyle = '#222';
  g.lineWidth = 1.5;
  g.strokeRect(x, y, w, h);
}

export function tireTexture() {
  const c = cv(256, 64);
  const g = c.getContext('2d');
  g.fillStyle = '#1b1b1c';
  g.fillRect(0, 0, 256, 64);
  // Sulcos da banda de rodagem (blocos em V).
  g.fillStyle = '#0c0c0d';
  for (let x = 0; x < 256; x += 16) {
    g.beginPath();
    g.moveTo(x, 4);
    g.lineTo(x + 8, 32);
    g.lineTo(x, 60);
    g.lineTo(x + 5, 60);
    g.lineTo(x + 13, 32);
    g.lineTo(x + 5, 4);
    g.fill();
  }
  g.fillStyle = '#2a2a2b';
  g.fillRect(0, 30, 256, 4);
  const t = tex(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

export function rimTexture(style = 0) {
  const c = cv(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#151516';
  g.fillRect(0, 0, 256, 256);
  // Pneu (parede lateral com letras em relevo).
  g.fillStyle = '#1e1e20';
  g.beginPath();
  g.arc(128, 128, 126, 0, Math.PI * 2);
  g.fill();
  const rimR = 84;
  const gr = g.createRadialGradient(110, 110, 10, 128, 128, rimR);
  gr.addColorStop(0, style === 1 ? '#3a3c40' : '#e8eaec');
  gr.addColorStop(1, style === 1 ? '#18191b' : '#8a8e92');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(128, 128, rimR, 0, Math.PI * 2);
  g.fill();
  // Raios.
  g.fillStyle = '#0d0d0e';
  const n = style === 1 ? 8 : 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    g.save();
    g.translate(128, 128);
    g.rotate(a);
    g.beginPath();
    g.moveTo(22, -12);
    g.lineTo(rimR - 10, -18);
    g.lineTo(rimR - 10, 18);
    g.lineTo(22, 12);
    g.fill();
    g.restore();
  }
  g.fillStyle = style === 1 ? '#2a2c30' : '#b8bcc0';
  g.beginPath();
  g.arc(128, 128, 22, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.fillStyle = '#333';
    g.beginPath();
    g.arc(128 + Math.cos(a) * 14, 128 + Math.sin(a) * 14, 3, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.font = 'bold 13px sans-serif';
  g.textAlign = 'center';
  for (let i = 0; i < 4; i++) {
    g.save();
    g.translate(128, 128);
    g.rotate((i / 4) * Math.PI * 2);
    g.fillText('ALL TERRAIN', 0, -104);
    g.restore();
  }
  return tex(c);
}

// Tela de grade antigranizo.
export function meshTexture() {
  const c = cv(128, 128);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(30,30,30,1)';
  g.lineWidth = 2;
  for (let x = 0; x <= 128; x += 16) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 128);
    g.moveTo(0, x);
    g.lineTo(128, x);
    g.stroke();
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function plateText(rng, country) {
  const L = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  const d = () => rng.int(0, 9);
  const l = () => L[rng.int(0, L.length - 1)];
  switch (country?.id) {
    case 'brasil':
      return `${l()}${l()}${l()}${d()}${l()}${d()}${d()}`;
    case 'argentina':
      return `${l()}${l()} ${d()}${d()}${d()} ${l()}${l()}`;
    case 'uruguai':
      return `S${l()}${l()} ${d()}${d()}${d()}${d()}`;
    case 'chile':
      return `${l()}${l()}${l()}${l()}·${d()}${d()}`;
    case 'canada':
      return `${l()}${l()}${l()} ${d()}${d()}${d()}`;
    default:
      return `${l()}${l()}${l()}-${d()}${d()}${d()}`;
  }
}
