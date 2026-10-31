// Texturas procedurais em canvas: gramado com listras de corte, linhas
// oficiais, desgaste, poças e neve; camisas (frente e costas com nome e
// número); bola; placas de LED; arquibancada; rede.
import * as THREE from 'three';
import { PITCH as P } from '../engine/constants.js';
import { RNG, luminance } from '../util.js';

export const GROUND_W = 121;
export const GROUND_H = 84;

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

let noiseCache = null;
function noiseTile(seed = 7) {
  if (noiseCache) return noiseCache;
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  const img = g.createImageData(256, 256);
  const r = new RNG(seed);
  for (let i = 0; i < 256 * 256; i++) {
    const v = 128 + (r.next() - 0.5) * 120;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  noiseCache = c;
  return c;
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)));
  const gg = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)));
  return `rgb(${r},${gg},${b})`;
}

// Gramado completo (campo + área de escape).
export function pitchTextures({ env, seed = 1, wear = 0.4, res = 4096, pattern = 'listras' }) {
  const W = res;
  const H = Math.round((res * GROUND_H) / GROUND_W);
  const sx = W / GROUND_W;
  const sy = H / GROUND_H;
  const X = (x) => (x + GROUND_W / 2) * sx;
  const Z = (z) => (z + GROUND_H / 2) * sy;
  const c = canvas(W, H);
  const g = c.getContext('2d');
  const rng = new RNG(seed);
  const wet = env.rain > 0;
  const snow = env.snow > 0;
  const base = wet ? '#2f6a26' : env.weather === 'calor' ? '#4a8030' : '#3b7a2a';
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  // listras do corte da grama
  const n = 18;
  const sw = P.L / n;
  for (let i = -2; i < n + 2; i++) {
    const x0 = -P.HL + i * sw;
    g.fillStyle = i % 2 ? 'rgba(255,255,230,0.075)' : 'rgba(0,30,0,0.07)';
    g.fillRect(X(x0), 0, sw * sx + 1, H);
  }
  if (pattern === 'xadrez') {
    const nz = 10;
    const sz = P.W / nz;
    for (let j = -1; j < nz + 1; j++) {
      const z0 = -P.HW + j * sz;
      g.fillStyle = j % 2 ? 'rgba(255,255,230,0.05)' : 'rgba(0,30,0,0.05)';
      g.fillRect(0, Z(z0), W, sz * sy + 1);
    }
  }
  // variação de cor em manchas grandes
  for (let i = 0; i < 260; i++) {
    const x = rng.float(0, W);
    const y = rng.float(0, H);
    const r = rng.float(2, 9) * sx;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = rng.chance(0.5);
    gr.addColorStop(0, dark ? 'rgba(20,40,10,0.08)' : 'rgba(170,190,90,0.06)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // granulação
  const pat = g.createPattern(noiseTile(), 'repeat');
  g.globalAlpha = 0.11;
  g.globalCompositeOperation = 'overlay';
  g.fillStyle = pat;
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  // desgaste: pequena área, marca do pênalti, círculo central
  const worn = (x, z, rx, rz, a) => {
    g.save();
    g.translate(X(x), Z(z));
    g.scale(rx * sx, rz * sy);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    const col = wet ? '92,72,46' : '120,104,70';
    gr.addColorStop(0, `rgba(${col},${a})`);
    gr.addColorStop(0.6, `rgba(${col},${a * 0.45})`);
    gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, 1, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };
  const w = Math.min(1, wear + (wet ? 0.25 : 0));
  for (const s of [-1, 1]) {
    worn(s * (P.HL - 2.5), 0, 4.5, 3.4, 0.55 * w);
    worn(s * (P.HL - 0.6), 0, 1.6, 2.6, 0.7 * w);
    worn(s * (P.HL - P.penSpot), 0, 1.2, 1, 0.5 * w);
  }
  worn(0, 0, 3, 3, 0.35 * w);
  for (let i = 0; i < 40 * w; i++) worn(rng.float(-P.HL + 8, P.HL - 8), rng.float(-P.HW + 5, P.HW - 5), rng.float(0.6, 2), rng.float(0.5, 1.6), rng.float(0.1, 0.3) * w);

  // neve
  if (snow) {
    g.fillStyle = 'rgba(236,241,246,0.9)';
    g.fillRect(0, 0, W, H);
    g.globalAlpha = 0.2;
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = pat;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    // marcas de pegadas/varridas
    for (let i = 0; i < 220; i++) {
      const x = rng.float(-P.HL, P.HL);
      const z = rng.float(-P.HW, P.HW);
      worn(x, z, rng.float(0.5, 2.5), rng.float(0.3, 1.2), 0.12);
    }
  }
  // poças
  for (const p of env.puddles || []) {
    g.save();
    g.translate(X(p.x), Z(p.z));
    g.scale(p.r * p.sx * sx, p.r * sy);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    gr.addColorStop(0, 'rgba(70,86,84,0.6)');
    gr.addColorStop(0.75, 'rgba(66,84,72,0.4)');
    gr.addColorStop(1, 'rgba(60,80,64,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, 1, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  // linhas (12 cm, borda externa nas medidas oficiais)
  const lw = 0.12;
  g.strokeStyle = snow ? 'rgba(30,80,210,0.95)' : 'rgba(246,248,240,0.93)';
  g.fillStyle = g.strokeStyle;
  g.lineWidth = lw * sx;
  const line = (x0, z0, x1, z1) => {
    g.beginPath();
    g.moveTo(X(x0), Z(z0));
    g.lineTo(X(x1), Z(z1));
    g.stroke();
  };
  const h = lw / 2;
  // perímetro
  g.strokeRect(X(-P.HL + h), Z(-P.HW + h), (P.L - lw) * sx, (P.W - lw) * sy);
  line(0, -P.HW + h, 0, P.HW - h);
  const circ = (x, z, r, a0 = 0, a1 = Math.PI * 2) => {
    g.save();
    g.translate(X(x), Z(z));
    g.scale(sx, sy);
    g.lineWidth = lw;
    g.beginPath();
    g.arc(0, 0, r, a0, a1);
    g.restore();
    g.stroke();
  };
  circ(0, 0, P.circleR - h);
  const spot = (x, z, r) => {
    g.beginPath();
    g.ellipse(X(x), Z(z), r * sx, r * sy, 0, 0, Math.PI * 2);
    g.fill();
  };
  spot(0, 0, 0.15);
  for (const s of [-1, 1]) {
    const gx = s * P.HL;
    // grande área
    const bx = gx - s * (P.boxD - h);
    line(gx - s * h, -P.boxW / 2 + h, bx, -P.boxW / 2 + h);
    line(gx - s * h, P.boxW / 2 - h, bx, P.boxW / 2 - h);
    line(bx, -P.boxW / 2 + h, bx, P.boxW / 2 - h);
    // pequena área
    const sxx = gx - s * (P.sixD - h);
    line(gx - s * h, -P.sixW / 2 + h, sxx, -P.sixW / 2 + h);
    line(gx - s * h, P.sixW / 2 - h, sxx, P.sixW / 2 - h);
    line(sxx, -P.sixW / 2 + h, sxx, P.sixW / 2 - h);
    // marca do pênalti e meia-lua (só fora da área)
    const px = gx - s * P.penSpot;
    spot(px, 0, 0.11);
    const da = Math.acos((P.boxD - P.penSpot) / P.arcR);
    if (s > 0) circ(px, 0, P.arcR - h, Math.PI - da, Math.PI + da);
    else circ(px, 0, P.arcR - h, -da, da);
    // arcos de escanteio
    for (const zs of [-1, 1]) {
      const a0 = s > 0 ? (zs > 0 ? Math.PI : Math.PI / 2) : zs > 0 ? -Math.PI / 2 : 0;
      circ(gx, zs * P.HW, 1 - h, a0, a0 + Math.PI / 2);
    }
  }

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 16;

  // rugosidade: molhado brilha, poças espelham
  const rc = canvas(512, Math.round((512 * GROUND_H) / GROUND_W));
  const rg = rc.getContext('2d');
  const baseR = snow ? 200 : wet ? Math.round(255 * (0.62 - env.rain * 0.18)) : 238;
  rg.fillStyle = `rgb(${baseR},${baseR},${baseR})`;
  rg.fillRect(0, 0, rc.width, rc.height);
  const rsx = rc.width / GROUND_W;
  const rsy = rc.height / GROUND_H;
  for (const p of env.puddles || []) {
    rg.save();
    rg.translate((p.x + GROUND_W / 2) * rsx, (p.z + GROUND_H / 2) * rsy);
    rg.scale(p.r * p.sx * rsx, p.r * rsy);
    const gr = rg.createRadialGradient(0, 0, 0, 0, 0, 1);
    gr.addColorStop(0, 'rgb(20,20,20)');
    gr.addColorStop(0.8, 'rgba(40,40,40,0.8)');
    gr.addColorStop(1, 'rgba(40,40,40,0)');
    rg.fillStyle = gr;
    rg.beginPath();
    rg.arc(0, 0, 1, 0, Math.PI * 2);
    rg.fill();
    rg.restore();
  }
  const rough = new THREE.CanvasTexture(rc);
  return { map, rough };
}

// Camisa: frente (padrão + escudo pequeno) e costas (nome e número).
export function shirtTexture(kit, opts = {}) {
  const c = canvas(128, 160);
  const g = c.getContext('2d');
  const p = kit.p;
  const s = kit.s;
  g.fillStyle = p;
  g.fillRect(0, 0, 128, 160);
  const back = !!opts.back;
  switch (kit.pattern) {
    case 'listras':
      g.fillStyle = s;
      for (let x = 10; x < 128; x += 36) g.fillRect(x, 0, 18, 160);
      break;
    case 'finas':
      g.fillStyle = s;
      for (let x = 6; x < 128; x += 16) g.fillRect(x, 0, 4, 160);
      break;
    case 'aros':
      g.fillStyle = s;
      for (let y = 18; y < 160; y += 40) g.fillRect(0, y, 128, 20);
      break;
    case 'faixa':
      g.fillStyle = s;
      g.beginPath();
      if (back) {
        g.moveTo(128, 20);
        g.lineTo(128, 56);
        g.lineTo(0, 160);
        g.lineTo(0, 124);
      } else {
        g.moveTo(0, 20);
        g.lineTo(0, 56);
        g.lineTo(128, 160);
        g.lineTo(128, 124);
      }
      g.closePath();
      g.fill();
      break;
    case 'metades':
      g.fillStyle = s;
      g.fillRect(back ? 0 : 64, 0, 64, 160);
      break;
    case 'quartos':
      g.fillStyle = s;
      g.fillRect(back ? 0 : 64, 0, 64, 80);
      g.fillRect(back ? 64 : 0, 80, 64, 80);
      break;
  }
  // gola e barra
  g.fillStyle = kit.trim || s;
  g.fillRect(0, 0, 128, 7);
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.fillRect(0, 152, 128, 8);
  // dobras do tecido
  const gr = g.createLinearGradient(0, 0, 128, 0);
  gr.addColorStop(0, 'rgba(0,0,0,0.18)');
  gr.addColorStop(0.2, 'rgba(0,0,0,0)');
  gr.addColorStop(0.8, 'rgba(0,0,0,0)');
  gr.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 160);
  if (opts.number != null) {
    const ink = kit.numberColor || (luminance(p) > 0.55 ? '#141414' : '#ffffff');
    const edge = luminance(ink) > 0.5 ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.5)';
    g.textAlign = 'center';
    g.fillStyle = ink;
    g.strokeStyle = edge;
    if (back) {
      g.font = 'bold 15px Arial, sans-serif';
      g.lineWidth = 2;
      const nm = (opts.name || '').toUpperCase().slice(0, 12);
      g.strokeText(nm, 64, 30);
      g.fillText(nm, 64, 30);
      g.font = 'bold 74px Arial Black, Arial, sans-serif';
      g.lineWidth = 3;
      g.strokeText(String(opts.number), 64, 112);
      g.fillText(String(opts.number), 64, 112);
    } else {
      g.font = 'bold 26px Arial Black, Arial, sans-serif';
      g.lineWidth = 2;
      g.strokeText(String(opts.number), 88, 62);
      g.fillText(String(opts.number), 88, 62);
      // escudo simplificado
      if (opts.crest && opts.crest.complete) g.drawImage(opts.crest, 28, 30, 22, 26);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function ballTexture(color = 'branca') {
  const c = canvas(512, 256);
  const g = c.getContext('2d');
  const base = color === 'laranja' ? '#ff7a1a' : '#f4f4f2';
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 256);
  const cols = color === 'laranja' ? ['#1d2a6b', '#ffd23b'] : ['#1d2a6b', '#d4252f', '#f0b81c'];
  // faixas curvas (deixam a rotação visível)
  for (let i = 0; i < 6; i++) {
    g.strokeStyle = cols[i % cols.length];
    g.lineWidth = 16;
    g.beginPath();
    for (let x = 0; x <= 512; x += 8) {
      const y = 128 + Math.sin((x / 512) * Math.PI * 2 * 2 + i * 1.05) * 70 + (i - 2.5) * 6;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  // costuras
  g.strokeStyle = 'rgba(60,60,60,0.35)';
  g.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    g.beginPath();
    g.moveTo(i * 64, 0);
    g.bezierCurveTo(i * 64 + 30, 80, i * 64 - 30, 176, i * 64, 256);
    g.stroke();
  }
  g.fillStyle = 'rgba(0,0,0,0.05)';
  g.fillRect(0, 0, 512, 24);
  g.fillRect(0, 232, 512, 24);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const SPONSORS = [
  ['CAFÉ MONTANHA', '#3b1f0e', '#f2d29b'],
  ['BANCO HORIZONTE', '#0b3d91', '#ffffff'],
  ['REFRI POLAR', '#d4252f', '#ffffff'],
  ['SEGUROS ÂNCORA', '#0f5e54', '#f4f1e6'],
  ['TELEVERDE', '#0a7d3b', '#fff36b'],
  ['PNEUS TRILHA', '#111111', '#f0b81c'],
  ['AEROLINHAS SUL', '#ffffff', '#1d4fa0'],
  ['MOTOR VOLTA', '#e05a00', '#111111'],
  ['GRAMADO 3D', '#141c2a', '#7cf29a'],
  ['ÁGUA SERENA', '#4fb3e8', '#ffffff'],
];

export function adTexture(clubName, colors) {
  const c = canvas(2048, 64);
  const g = c.getContext('2d');
  let x = 0;
  const items = SPONSORS.slice();
  items.splice(3, 0, [clubName.toUpperCase(), colors.p, colors.s]);
  const segW = 2048 / items.length;
  for (const [name, bg, fg] of items) {
    g.fillStyle = bg;
    g.fillRect(x, 0, segW, 64);
    g.fillStyle = fg;
    g.font = 'bold 30px Arial Black, Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let fs = 30;
    while (g.measureText(name).width > segW - 14 && fs > 12) {
      fs -= 2;
      g.font = `bold ${fs}px Arial Black, Arial, sans-serif`;
    }
    g.fillText(name, x + segW / 2, 34);
    x += segW;
  }
  // pixels de LED
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (let yy = 0; yy < 64; yy += 4) g.fillRect(0, yy, 2048, 1);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

export function goalAdTexture(text, a, b) {
  const c = canvas(1024, 64);
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? a : b;
    g.fillRect(i * 128, 0, 128, 64);
    g.fillStyle = i % 2 ? b : a;
    g.font = 'bold 40px Arial Black, Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, i * 128 + 64, 34);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

// Cadeiras da arquibancada (com a sigla do clube escrita no setor central).
export function seatTexture(primary, secondary, text, rows = 40, cols = 220) {
  const W = 2048;
  const H = 512;
  const c = canvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = shade(primary, 0.35);
  g.fillRect(0, 0, W, H);
  const rh = H / rows;
  const cw = W / cols;
  // máscara do texto
  let mask = null;
  if (text) {
    const m = canvas(cols, rows);
    const mg = m.getContext('2d');
    mg.fillStyle = '#000';
    mg.fillRect(0, 0, cols, rows);
    mg.fillStyle = '#fff';
    mg.font = `bold ${Math.round(rows * 0.8)}px Arial Black, Arial, sans-serif`;
    mg.textAlign = 'center';
    mg.textBaseline = 'middle';
    mg.fillText(text, cols / 2, rows / 2 + 1);
    mask = mg.getImageData(0, 0, cols, rows).data;
  }
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const on = mask && mask[(r * cols + k) * 4] > 128;
      g.fillStyle = on ? secondary : primary;
      g.fillRect(k * cw + 1, r * rh + rh * 0.25, cw - 2, rh * 0.6);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(k * cw + 1, r * rh + rh * 0.75, cw - 2, rh * 0.12);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function netTexture() {
  const c = canvas(64, 64);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, 32);
  g.lineTo(64, 32);
  g.moveTo(32, 0);
  g.lineTo(32, 64);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function concreteTexture(seed = 3) {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#8a8d90';
  g.fillRect(0, 0, 256, 256);
  g.globalAlpha = 0.35;
  g.fillStyle = g.createPattern(noiseTile(seed), 'repeat');
  g.fillRect(0, 0, 256, 256);
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
