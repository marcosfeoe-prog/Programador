// Texturas procedurais desenhadas em <canvas>. Nenhuma imagem externa.
import * as THREE from 'three';
import { RNG } from './util.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// Ruído por pixel somado à cor existente.
function grain(g, w, h, amount, seed = 1) {
  const rng = new RNG(seed);
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng.next() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

// Manchas suaves (umidade, sujeira) desenhadas com gradientes radiais,
// repetidas nas bordas para a textura continuar sem emenda.
function blotches(g, w, h, n, color, rMin, rMax, alpha, seed = 2) {
  const rng = new RNG(seed);
  for (let i = 0; i < n; i++) {
    const x = rng.float(0, w);
    const y = rng.float(0, h);
    const r = rng.float(rMin, rMax);
    const a = rng.float(alpha * 0.3, alpha);
    for (const ox of [-w, 0, w]) {
      for (const oy of [-h, 0, h]) {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gr.addColorStop(0, `rgba(${color},${a})`);
        gr.addColorStop(1, `rgba(${color},0)`);
        g.fillStyle = gr;
        g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
  }
}

// Escorridos verticais (infiltração descendo do teto).
function drips(g, w, h, n, color, seed = 3) {
  const rng = new RNG(seed);
  for (let i = 0; i < n; i++) {
    const x = rng.float(0, w);
    const len = rng.float(h * 0.1, h * 0.5);
    const wd = rng.float(1, 5);
    const gr = g.createLinearGradient(0, 0, 0, len);
    gr.addColorStop(0, `rgba(${color},${rng.float(0.1, 0.3)})`);
    gr.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = gr;
    g.fillRect(x, 0, wd, len);
  }
}

// ---------- Nível 0: o saguão amarelo ----------

export function wallpaperYellow() {
  const [c, g] = canvas(256, 512);
  g.fillStyle = '#c9b65f';
  g.fillRect(0, 0, 256, 512);
  // Listras verticais com losangos pequenos (padrão clássico do papel de parede).
  for (let x = 0; x < 256; x += 32) {
    g.fillStyle = 'rgba(150,128,52,0.35)';
    g.fillRect(x, 0, 3, 512);
    g.fillStyle = 'rgba(235,220,140,0.25)';
    g.fillRect(x + 14, 0, 4, 512);
  }
  g.fillStyle = 'rgba(140,118,48,0.30)';
  for (let x = 0; x < 256; x += 32) {
    for (let y = 0; y < 512; y += 32) {
      const cx = x + 16;
      const cy = y + 16 + ((x / 32) % 2) * 16;
      g.beginPath();
      g.moveTo(cx, cy - 6);
      g.lineTo(cx + 4, cy);
      g.lineTo(cx, cy + 6);
      g.lineTo(cx - 4, cy);
      g.closePath();
      g.fill();
    }
  }
  blotches(g, 256, 512, 10, '120,96,30', 20, 80, 0.25, 11);
  drips(g, 256, 512, 14, '110,88,30', 12);
  // Rodapé sujo.
  const gr = g.createLinearGradient(0, 430, 0, 512);
  gr.addColorStop(0, 'rgba(90,70,20,0)');
  gr.addColorStop(1, 'rgba(90,70,20,0.45)');
  g.fillStyle = gr;
  g.fillRect(0, 430, 256, 82);
  grain(g, 256, 512, 18, 13);
  return toTexture(c);
}

export function carpetMustard() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#8f7a3e';
  g.fillRect(0, 0, 256, 256);
  const rng = new RNG(21);
  // Fibras.
  for (let i = 0; i < 9000; i++) {
    const v = rng.float(-30, 30);
    g.fillStyle = `rgb(${143 + v},${122 + v},${62 + v * 0.6})`;
    g.fillRect(rng.float(0, 256), rng.float(0, 256), 1, rng.float(1, 3));
  }
  blotches(g, 256, 256, 9, '60,48,18', 15, 60, 0.35, 22);
  grain(g, 256, 256, 22, 23);
  return toTexture(c);
}

export function ceilingTiles(base = '#d8d2b4', line = 'rgba(120,112,80,0.7)', seed = 31) {
  const [c, g] = canvas(256, 256);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  const rng = new RNG(seed);
  // Furinhos das placas acústicas.
  g.fillStyle = 'rgba(90,84,60,0.35)';
  for (let i = 0; i < 1600; i++) g.fillRect(rng.float(0, 256), rng.float(0, 256), 1.5, 1.5);
  blotches(g, 256, 256, 4, '140,110,50', 20, 60, 0.35, seed + 1);
  g.strokeStyle = line;
  g.lineWidth = 6;
  g.strokeRect(0, 0, 256, 256);
  grain(g, 256, 256, 12, seed + 2);
  return toTexture(c);
}

// Painel da luminária fluorescente (difusor com grade).
export function lampPanel(tint = [255, 250, 225]) {
  const [c, g] = canvas(64, 128);
  g.fillStyle = `rgb(${tint[0]},${tint[1]},${tint[2]})`;
  g.fillRect(0, 0, 64, 128);
  g.strokeStyle = 'rgba(0,0,0,0.12)';
  g.lineWidth = 1;
  for (let i = 0; i < 64; i += 8) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 128);
    g.stroke();
  }
  for (let i = 0; i < 128; i += 8) {
    g.beginPath();
    g.moveTo(0, i);
    g.lineTo(64, i);
    g.stroke();
  }
  g.strokeStyle = 'rgba(120,120,110,0.9)';
  g.lineWidth = 6;
  g.strokeRect(0, 0, 64, 128);
  return toTexture(c, false);
}

// Fenda de "noclip": estática animada (o deslocamento é animado no jogo).
export function glitch() {
  const [c, g] = canvas(128, 256);
  const rng = new RNG(41);
  for (let y = 0; y < 256; y += 2) {
    for (let x = 0; x < 128; x += 2) {
      const v = rng.next();
      const k = v > 0.92 ? 255 : v * 40;
      g.fillStyle = v > 0.97 ? `rgb(${k},${k * 0.9},${k * 0.5})` : `rgb(${k * 0.5},${k * 0.45},${k * 0.6})`;
      g.fillRect(x, y, 2, 2);
    }
  }
  for (let i = 0; i < 18; i++) {
    g.fillStyle = `rgba(${rng.int(100, 255)},${rng.int(60, 200)},${rng.int(150, 255)},0.5)`;
    g.fillRect(0, rng.float(0, 256), 128, rng.float(1, 4));
  }
  return toTexture(c);
}

// ---------- Nível 1: armazém de concreto ----------

export function concrete(base = '#77746c', seed = 51, w = 512) {
  const [c, g] = canvas(w, w);
  g.fillStyle = base;
  g.fillRect(0, 0, w, w);
  blotches(g, w, w, 26, '40,40,38', 20, 110, 0.3, seed);
  blotches(g, w, w, 14, '170,168,160', 20, 90, 0.18, seed + 1);
  drips(g, w, w, 22, '30,28,24', seed + 2);
  // Rachaduras.
  const rng = new RNG(seed + 3);
  g.strokeStyle = 'rgba(25,25,22,0.55)';
  for (let i = 0; i < 7; i++) {
    let x = rng.float(0, w);
    let y = rng.float(0, w);
    g.lineWidth = rng.float(0.8, 1.8);
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 12; k++) {
      x += rng.float(-14, 14);
      y += rng.float(4, 16);
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // Marcas das fôrmas de concreto.
  g.fillStyle = 'rgba(30,30,28,0.35)';
  for (let y = 0; y < w; y += w / 4) g.fillRect(0, y, w, 2);
  g.fillStyle = 'rgba(30,30,28,0.55)';
  for (let x = w / 8; x < w; x += w / 4) {
    for (let y = w / 8; y < w; y += w / 4) {
      g.beginPath();
      g.arc(x, y, 3, 0, Math.PI * 2);
      g.fill();
    }
  }
  grain(g, w, w, 26, seed + 4);
  return toTexture(c);
}

export function concreteFloor(base = '#5f5c55', seed = 61) {
  const [c, g] = canvas(512, 512);
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 512);
  blotches(g, 512, 512, 30, '30,30,28', 30, 120, 0.35, seed);
  blotches(g, 512, 512, 10, '120,90,50', 20, 70, 0.2, seed + 1);
  g.strokeStyle = 'rgba(20,20,18,0.5)';
  g.lineWidth = 2;
  g.strokeRect(0, 0, 512, 512);
  g.beginPath();
  g.moveTo(256, 0);
  g.lineTo(256, 512);
  g.moveTo(0, 256);
  g.lineTo(512, 256);
  g.stroke();
  grain(g, 512, 512, 24, seed + 2);
  return toTexture(c);
}

export function crate(seed = 71, label = '') {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#7b5a35';
  g.fillRect(0, 0, 256, 256);
  const rng = new RNG(seed);
  for (let y = 0; y < 256; y += 32) {
    g.fillStyle = `rgb(${rng.int(105, 135)},${rng.int(76, 96)},${rng.int(42, 58)})`;
    g.fillRect(0, y + 1, 256, 30);
    g.strokeStyle = 'rgba(40,25,10,0.35)';
    for (let k = 0; k < 6; k++) {
      g.beginPath();
      const yy = y + rng.float(4, 28);
      g.moveTo(0, yy);
      g.bezierCurveTo(80, yy + rng.float(-3, 3), 170, yy + rng.float(-3, 3), 256, yy);
      g.stroke();
    }
  }
  g.fillStyle = '#4a3218';
  g.fillRect(0, 0, 256, 18);
  g.fillRect(0, 238, 256, 18);
  g.fillRect(0, 0, 18, 256);
  g.fillRect(238, 0, 18, 256);
  g.save();
  g.translate(128, 128);
  g.rotate(Math.PI / 4);
  g.fillRect(-170, -9, 340, 18);
  g.restore();
  g.fillStyle = 'rgba(20,20,20,0.6)';
  g.font = 'bold 22px monospace';
  if (label) g.fillText(label, 70, 70);
  grain(g, 256, 256, 18, seed + 1);
  return toTexture(c, false);
}

// ---------- Nível 2: canos ----------

export function darkPanels(seed = 81) {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#4a4036';
  g.fillRect(0, 0, 512, 512);
  blotches(g, 512, 512, 30, '20,16,12', 30, 120, 0.4, seed);
  blotches(g, 512, 512, 12, '120,80,40', 20, 80, 0.2, seed + 1);
  drips(g, 512, 512, 30, '25,18,10', seed + 2);
  // Placas rebitadas.
  g.strokeStyle = 'rgba(15,12,8,0.7)';
  g.lineWidth = 3;
  for (let x = 0; x <= 512; x += 128) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 512);
    g.stroke();
  }
  g.fillStyle = 'rgba(20,15,10,0.8)';
  for (let x = 8; x < 512; x += 128) {
    for (let y = 8; y < 512; y += 32) {
      g.beginPath();
      g.arc(x, y, 2.5, 0, Math.PI * 2);
      g.arc(x + 112, y, 2.5, 0, Math.PI * 2);
      g.fill();
    }
  }
  grain(g, 512, 512, 30, seed + 3);
  return toTexture(c);
}

export function rustMetal(seed = 91) {
  const [c, g] = canvas(256, 128);
  g.fillStyle = '#9a6a35';
  g.fillRect(0, 0, 256, 128);
  blotches(g, 256, 128, 20, '70,35,12', 8, 40, 0.6, seed);
  blotches(g, 256, 128, 10, '200,140,70', 6, 30, 0.35, seed + 1);
  // Faixa de brilho ao longo do cano.
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, 'rgba(0,0,0,0.35)');
  gr.addColorStop(0.45, 'rgba(255,220,160,0.18)');
  gr.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 128);
  grain(g, 256, 128, 26, seed + 2);
  return toTexture(c);
}

export function dirtFloor(seed = 101) {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#3d362d';
  g.fillRect(0, 0, 512, 512);
  blotches(g, 512, 512, 40, '20,17,13', 20, 90, 0.5, seed);
  blotches(g, 512, 512, 25, '110,96,76', 10, 50, 0.25, seed + 1);
  const rng = new RNG(seed + 2);
  for (let i = 0; i < 3000; i++) {
    const v = rng.int(30, 110);
    g.fillStyle = `rgba(${v},${v * 0.9},${v * 0.75},0.6)`;
    g.fillRect(rng.float(0, 512), rng.float(0, 512), 2, 2);
  }
  grain(g, 512, 512, 30, seed + 3);
  return toTexture(c);
}

// ---------- Nível 3: o hotel ----------

export function hotelWallpaper(seed = 111) {
  const [c, g] = canvas(256, 512);
  g.fillStyle = '#b58f80';
  g.fillRect(0, 0, 256, 512);
  // Adamascado: flores estilizadas em grade intercalada.
  g.fillStyle = 'rgba(140,100,90,0.55)';
  for (let y = 0; y < 512 + 64; y += 64) {
    for (let x = 0; x < 256 + 64; x += 64) {
      const ox = (y / 64) % 2 ? 32 : 0;
      const cx = x + ox;
      const cy = y;
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        g.ellipse(cx, cy, 5, 14, (k * Math.PI) / 4, 0, Math.PI * 2);
        g.fill();
      }
      g.beginPath();
      g.arc(cx, cy, 4, 0, Math.PI * 2);
      g.fill();
    }
  }
  // Lambri (meia-parede) com moldura.
  g.fillStyle = '#d9c9b8';
  g.fillRect(0, 300, 256, 212);
  g.fillStyle = 'rgba(120,96,80,0.6)';
  g.fillRect(0, 300, 256, 6);
  g.fillRect(0, 312, 256, 3);
  g.strokeStyle = 'rgba(140,116,96,0.6)';
  g.lineWidth = 3;
  g.strokeRect(20, 340, 216, 140);
  g.fillStyle = 'rgba(70,50,40,0.6)';
  g.fillRect(0, 496, 256, 16);
  blotches(g, 256, 512, 8, '80,50,40', 20, 70, 0.25, seed);
  grain(g, 256, 512, 16, seed + 1);
  return toTexture(c);
}

export function hotelCarpet(seed = 121) {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#7a2f2a';
  g.fillRect(0, 0, 256, 256);
  // Hexágonos como no carpete do corredor.
  const r = 16;
  const hx = r * Math.sqrt(3);
  g.strokeStyle = 'rgba(190,90,70,0.6)';
  g.lineWidth = 2;
  for (let row = -1; row < 12; row++) {
    for (let col = -1; col < 10; col++) {
      const cx = col * hx + (row % 2 ? hx / 2 : 0);
      const cy = row * r * 1.5;
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = Math.PI / 6 + (k * Math.PI) / 3;
        g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      g.closePath();
      g.stroke();
    }
  }
  blotches(g, 256, 256, 8, '30,10,8', 15, 50, 0.35, seed);
  grain(g, 256, 256, 18, seed + 1);
  return toTexture(c);
}

export function woodDoor(seed = 131) {
  const [c, g] = canvas(128, 256);
  g.fillStyle = '#a5652c';
  g.fillRect(0, 0, 128, 256);
  const rng = new RNG(seed);
  g.strokeStyle = 'rgba(70,35,10,0.35)';
  for (let i = 0; i < 40; i++) {
    const x = rng.float(0, 128);
    g.lineWidth = rng.float(0.5, 2);
    g.beginPath();
    g.moveTo(x, 0);
    g.bezierCurveTo(x + rng.float(-6, 6), 80, x + rng.float(-6, 6), 170, x, 256);
    g.stroke();
  }
  g.strokeStyle = 'rgba(60,30,10,0.55)';
  g.lineWidth = 3;
  g.strokeRect(14, 14, 100, 100);
  g.strokeRect(14, 134, 100, 108);
  // Número do quarto.
  g.fillStyle = '#d8c07a';
  g.font = 'bold 18px serif';
  g.fillText(String(100 + rng.int(1, 99)), 46, 60);
  grain(g, 128, 256, 14, seed + 1);
  return toTexture(c, false);
}

// Placa de saída iluminada.
export function exitSign(text = 'EXIT') {
  const [c, g] = canvas(256, 96);
  g.fillStyle = '#1b0505';
  g.fillRect(0, 0, 256, 96);
  g.strokeStyle = '#ff3a2a';
  g.lineWidth = 4;
  g.strokeRect(4, 4, 248, 88);
  g.fillStyle = '#ff4a35';
  g.font = 'bold 60px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 136, 50);
  g.beginPath();
  g.moveTo(22, 48);
  g.lineTo(44, 30);
  g.lineTo(44, 66);
  g.closePath();
  g.fill();
  return toTexture(c, false);
}

// ---------- Nível 4: corredores de emergência ----------

export function tiles(base = '#c8c4b8', seed = 141) {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#5c584f';
  g.fillRect(0, 0, 256, 256);
  const rng = new RNG(seed);
  for (let y = 0; y < 256; y += 32) {
    for (let x = 0; x < 256; x += 32) {
      const v = rng.int(-14, 14);
      g.fillStyle = base;
      g.fillRect(x + 1.5, y + 1.5, 29, 29);
      g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 100})`;
      g.fillRect(x + 1.5, y + 1.5, 29, 29);
    }
  }
  blotches(g, 256, 256, 14, '60,45,30', 10, 50, 0.4, seed + 1);
  drips(g, 256, 256, 18, '50,30,20', seed + 2);
  grain(g, 256, 256, 18, seed + 3);
  return toTexture(c);
}

export function hazardStripes() {
  const [c, g] = canvas(128, 32);
  g.fillStyle = '#d9b020';
  g.fillRect(0, 0, 128, 32);
  g.fillStyle = '#1a1a1a';
  for (let x = -32; x < 160; x += 32) {
    g.beginPath();
    g.moveTo(x, 32);
    g.lineTo(x + 16, 32);
    g.lineTo(x + 32, 0);
    g.lineTo(x + 16, 0);
    g.closePath();
    g.fill();
  }
  grain(g, 128, 32, 20, 151);
  return toTexture(c);
}

// ---------- Entidades e objetos ----------

// Rosto do Sorridente: olhos e sorriso brancos sobre fundo transparente.
export function smilerFace() {
  const [c, g] = canvas(256, 256);
  g.clearRect(0, 0, 256, 256);
  g.shadowColor = '#ffffff';
  g.shadowBlur = 18;
  g.fillStyle = '#fbfbef';
  for (const x of [84, 172]) {
    g.beginPath();
    g.ellipse(x, 92, 15, 10, x < 128 ? 0.25 : -0.25, 0, Math.PI * 2);
    g.fill();
  }
  // Sorriso largo com dentes.
  g.beginPath();
  g.moveTo(36, 140);
  g.quadraticCurveTo(128, 250, 220, 140);
  g.quadraticCurveTo(128, 196, 36, 140);
  g.fill();
  g.shadowBlur = 0;
  g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.lineWidth = 3;
  for (let x = 52; x < 210; x += 13) {
    g.beginPath();
    g.moveTo(x, 140);
    g.lineTo(x + 1, 205);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function bottleLabel() {
  const [c, g] = canvas(128, 64);
  g.fillStyle = '#e9e1c9';
  g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#6e8a3c';
  g.fillRect(0, 0, 128, 14);
  g.fillRect(0, 50, 128, 14);
  g.fillStyle = '#3a2a14';
  g.font = 'bold 13px serif';
  g.textAlign = 'center';
  g.fillText('ÁGUA DE', 64, 30);
  g.fillText('AMÊNDOAS', 64, 45);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function panelTex(text = 'ENERGIA') {
  const [c, g] = canvas(128, 192);
  g.fillStyle = '#56605a';
  g.fillRect(0, 0, 128, 192);
  g.strokeStyle = 'rgba(0,0,0,0.6)';
  g.lineWidth = 4;
  g.strokeRect(6, 6, 116, 180);
  g.fillStyle = '#d9b020';
  g.fillRect(14, 14, 100, 22);
  g.fillStyle = '#111';
  g.font = 'bold 15px monospace';
  g.textAlign = 'center';
  g.fillText(text, 64, 31);
  grain(g, 128, 192, 22, 161);
  return toTexture(c, false);
}

// Sobreposição de granulado de filme (usada como fundo CSS animado).
export function grainDataURL() {
  const [c, g] = canvas(160, 160);
  const img = g.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 26;
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL();
}
