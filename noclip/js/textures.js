// Texturas desenhadas em canvas durante o jogo (dependem do idioma ou de
// valores sorteados, como o código da porta).
import * as THREE from 'three';
import { rng } from './util.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function toTex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
}

// "Cookie" da lanterna: centro forte, anel e leves imperfeições do refletor.
export function flashlightCookie() {
  const S = 256;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const r = rng(77);
  const rings = Array.from({ length: 6 }, () => [r.range(0.15, 0.95), r.range(0.02, 0.08), r.range(0.015, 0.03)]);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = (x + 0.5) / S - 0.5, dy = (y + 0.5) / S - 0.5;
      const d = Math.sqrt(dx * dx + dy * dy) * 2;
      let v = Math.exp(-d * d * 7) * 0.85 + Math.exp(-((d - 0.42) ** 2) / 0.004) * 0.12 + Math.max(0, 1 - d) * 0.22;
      for (const [rr, a, w] of rings) v += Math.exp(-((d - rr) ** 2) / (w * w)) * a * (1 - d);
      v *= d < 1 ? 1 : 0;
      const i = (y * S + x) * 4;
      img.data[i] = Math.min(255, v * 255);
      img.data[i + 1] = Math.min(255, v * 248);
      img.data[i + 2] = Math.min(255, v * 232);
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  return toTex(c);
}

// Traço tremido de pincel atômico / spray.
function scrawl(g, pts, w, color, r, jit = 2) {
  g.strokeStyle = color;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  pts.forEach(([x, y], i) => {
    const px = x + r.range(-jit, jit), py = y + r.range(-jit, jit);
    i ? g.lineTo(px, py) : g.moveTo(px, py);
  });
  g.stroke();
}

// Dígito do código pintado na parede: "_ 7 _ _" com o dígito na posição certa.
export function codeDecal(digit, pos, seed) {
  const W = 512, H = 256;
  const c = canvas(W, H);
  const g = c.getContext('2d');
  const r = rng(seed);
  g.fillStyle = 'rgba(0,0,0,0)';
  g.fillRect(0, 0, W, H);
  const col = 'rgba(150,18,16,0.92)';
  g.font = 'bold 150px "Arial Black", Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 0; i < 4; i++) {
    const x = 70 + i * 124;
    if (i === pos) {
      g.save();
      g.translate(x, 118);
      g.rotate(r.range(-0.12, 0.12));
      g.fillStyle = col;
      g.fillText(String(digit), 0, 0);
      // escorrido de tinta
      for (let k = 0; k < 3; k++) {
        const dx = r.range(-35, 35);
        const len = r.range(20, 70);
        g.fillRect(dx, 40, r.range(4, 8), len);
        g.beginPath();
        g.arc(dx + 3, 40 + len, 5, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    } else {
      scrawl(g, [[x - 40, 190], [x + 40, 192]], 14, col, r, 3);
    }
  }
  // "suavidade" de spray: borra a borda
  const c2 = canvas(W, H);
  const g2 = c2.getContext('2d');
  g2.filter = 'blur(1.6px)';
  g2.drawImage(c, 0, 0);
  g2.filter = 'none';
  g2.globalAlpha = 0.6;
  g2.drawImage(c, 0, 0);
  return toTex(c2);
}

// Rosto do Festeiro (giz de cera preto sobre fundo transparente).
export function partyFace() {
  const S = 512;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const r = rng(5);
  const ink = 'rgba(20,14,12,0.95)';
  g.fillStyle = ink;
  for (const ex of [190, 322]) {
    g.beginPath();
    g.ellipse(ex + r.range(-4, 4), 200, 26, 38, r.range(-0.2, 0.2), 0, Math.PI * 2);
    g.fill();
  }
  const pts = [];
  for (let i = 0; i <= 30; i++) {
    const a = 0.12 * Math.PI + (i / 30) * 0.76 * Math.PI;
    pts.push([256 + Math.cos(a) * 150, 250 + Math.sin(a) * 120]);
  }
  scrawl(g, pts, 18, ink, r, 2.5);
  scrawl(g, [[100, 310], [112, 292]], 12, ink, r, 1);
  scrawl(g, [[412, 310], [400, 292]], 12, ink, r, 1);
  // falhas de cera
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(0,0,0,${r.range(0.2, 0.8)})`;
    g.fillRect(r.range(0, S), r.range(0, S), r.range(1, 4), r.range(1, 3));
  }
  return toTex(c);
}

// Olhos e sorriso do Sorridente (emissivo).
export function smilerFace() {
  const W = 512, H = 256;
  const c = canvas(W, H);
  const g = c.getContext('2d');
  const r = rng(9);
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  const glow = (x, y, rx, ry) => {
    const gr = g.createRadialGradient(x, y, 1, x, y, rx * 1.6);
    gr.addColorStop(0, 'rgba(255,255,250,1)');
    gr.addColorStop(0.5, 'rgba(255,255,240,0.9)');
    gr.addColorStop(1, 'rgba(255,255,230,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(x, y, rx * 1.6, ry * 1.6, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
  };
  glow(170, 70, 34, 16);
  glow(342, 70, 34, 16);
  // sorriso com dentes
  g.save();
  g.beginPath();
  g.moveTo(70, 135);
  g.quadraticCurveTo(256, 290, 442, 135);
  g.quadraticCurveTo(256, 215, 70, 135);
  g.closePath();
  g.fillStyle = '#fffef4';
  g.shadowColor = 'rgba(255,255,230,0.9)';
  g.shadowBlur = 18;
  g.fill();
  g.restore();
  g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.lineWidth = 4;
  for (let i = 1; i < 18; i++) {
    const x = 70 + (i / 18) * 372;
    const t = (x - 256) / 186;
    const yTop = 135 + (1 - t * t) * 40;
    const yBot = 135 + (1 - t * t) * 78;
    g.beginPath();
    g.moveTo(x + r.range(-2, 2), yTop);
    g.lineTo(x + r.range(-3, 3), yBot);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(80, 140);
  g.quadraticCurveTo(256, 250, 432, 140);
  g.stroke();
  return toTex(c);
}

// Rótulo da Água de Amêndoa.
export function almondLabel() {
  const c = canvas(256, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#efe6cf';
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#7a5a2e';
  g.fillRect(0, 0, 256, 16);
  g.fillRect(0, 112, 256, 16);
  g.fillStyle = '#5a3d1a';
  g.font = 'bold 30px Georgia, serif';
  g.textAlign = 'center';
  g.fillText('ALMOND', 128, 58);
  g.font = 'italic 22px Georgia, serif';
  g.fillText('water', 128, 88);
  g.beginPath();
  g.ellipse(36, 64, 12, 20, 0.5, 0, Math.PI * 2);
  g.ellipse(220, 64, 12, 20, -0.5, 0, Math.PI * 2);
  g.fill();
  return toTex(c);
}

// Folha de papel (bilhete caído no chão).
export function paperTex(seed = 1) {
  const c = canvas(256, 320);
  const g = c.getContext('2d');
  const r = rng(seed);
  g.fillStyle = '#e9e2cc';
  g.fillRect(0, 0, 256, 320);
  for (let i = 0; i < 14; i++) {
    g.fillStyle = 'rgba(40,40,60,0.55)';
    const y = 40 + i * 19;
    const w = r.range(120, 210);
    g.fillRect(24, y, w, 2.2);
  }
  g.fillStyle = 'rgba(120,90,40,0.18)';
  g.beginPath();
  g.arc(r.range(40, 200), r.range(60, 260), r.range(25, 50), 0, Math.PI * 2);
  g.fill();
  return toTex(c);
}

// Etiqueta genérica com texto (placas, teclas).
export function labelTex(text, { w = 256, h = 64, bg = '#1a1a1a', fg = '#e8e8e8', font = 'bold 34px sans-serif' } = {}) {
  const c = canvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2);
  return toTex(c);
}
