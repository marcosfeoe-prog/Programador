// Texturas procedurais (canvas): arenito, piso, caixotes, pintura dos bombsites,
// fumaça e clarão do disparo. Nenhuma imagem externa.
import * as THREE from 'three';
import { seeded } from './util.js';

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTex(c, repeat = true, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// Granulado: pontos claros/escuros espalhados.
function speckle(g, w, h, n, rnd, alpha = 0.08) {
  for (let i = 0; i < n; i++) {
    const v = rnd() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${alpha * rnd()})`;
    const s = 1 + rnd() * 2.5;
    g.fillRect(rnd() * w, rnd() * h, s, s);
  }
}

// Parede de arenito: blocos irregulares com argamassa e sujeira na base.
// Cobre 4 m × 4 m.
export function sandstoneTex(seed = 1, tint = [201, 166, 112]) {
  const S = 512;
  const [c, g] = canvas(S);
  const rnd = seeded(seed);
  g.fillStyle = `rgb(${tint[0] - 40},${tint[1] - 40},${tint[2] - 40})`;
  g.fillRect(0, 0, S, S);
  const rowH = 32;
  for (let y = 0; y < S; y += rowH) {
    let x = -rnd() * 60;
    while (x < S) {
      const w = 50 + rnd() * 50;
      const k = 0.86 + rnd() * 0.22;
      g.fillStyle = `rgb(${tint[0] * k | 0},${tint[1] * k | 0},${tint[2] * k | 0})`;
      g.fillRect(x + 2, y + 2, w - 3, rowH - 3);
      // desgaste nas bordas
      g.fillStyle = 'rgba(255,240,210,0.10)';
      g.fillRect(x + 2, y + 2, w - 3, 3);
      g.fillStyle = 'rgba(60,40,20,0.12)';
      g.fillRect(x + 2, y + rowH - 5, w - 3, 3);
      if (x + w > S) {
        // repete o bloco do outro lado para emendar sem costura
        g.fillStyle = `rgb(${tint[0] * k | 0},${tint[1] * k | 0},${tint[2] * k | 0})`;
        g.fillRect(x + 2 - S, y + 2, w - 3, rowH - 3);
      }
      x += w;
    }
  }
  speckle(g, S, S, 9000, rnd, 0.12);
  // manchas
  for (let i = 0; i < 40; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 10 + rnd() * 50;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(90,60,30,${0.05 + rnd() * 0.08})`);
    gr.addColorStop(1, 'rgba(90,60,30,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return toTex(c);
}

// Piso de lajotas empoeiradas com areia (4 m × 4 m).
export function floorTex(seed = 2) {
  const S = 512;
  const [c, g] = canvas(S);
  const rnd = seeded(seed);
  g.fillStyle = '#8f7a58';
  g.fillRect(0, 0, S, S);
  const T = 128;
  for (let y = 0; y < S; y += T) {
    for (let x = 0; x < S; x += T) {
      const k = 0.88 + rnd() * 0.2;
      g.fillStyle = `rgb(${178 * k | 0},${154 * k | 0},${112 * k | 0})`;
      g.fillRect(x + 3, y + 3, T - 6, T - 6);
      // rachaduras
      g.strokeStyle = 'rgba(70,50,30,0.25)';
      g.lineWidth = 1;
      if (rnd() < 0.4) {
        g.beginPath();
        let px = x + rnd() * T;
        let py = y + rnd() * T;
        g.moveTo(px, py);
        for (let k2 = 0; k2 < 5; k2++) {
          px += (rnd() - 0.5) * 40;
          py += (rnd() - 0.5) * 40;
          g.lineTo(px, py);
        }
        g.stroke();
      }
    }
  }
  // areia acumulada
  for (let i = 0; i < 70; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 20 + rnd() * 70;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(214,186,130,${0.15 + rnd() * 0.25})`);
    gr.addColorStop(1, 'rgba(214,186,130,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  speckle(g, S, S, 14000, rnd, 0.14);
  return toTex(c);
}

// Caixote de madeira com moldura e travessa diagonal.
export function crateTex(seed = 3) {
  const S = 256;
  const [c, g] = canvas(S);
  const rnd = seeded(seed);
  // tábuas
  for (let i = 0; i < 8; i++) {
    const k = 0.85 + rnd() * 0.25;
    g.fillStyle = `rgb(${150 * k | 0},${108 * k | 0},${62 * k | 0})`;
    g.fillRect(0, i * 32, S, 32);
    g.fillStyle = 'rgba(40,25,10,0.5)';
    g.fillRect(0, i * 32, S, 2);
    // veios
    g.strokeStyle = 'rgba(70,45,20,0.25)';
    for (let v = 0; v < 4; v++) {
      g.beginPath();
      const yy = i * 32 + 4 + rnd() * 24;
      g.moveTo(0, yy);
      g.bezierCurveTo(S * 0.3, yy + (rnd() - 0.5) * 8, S * 0.6, yy + (rnd() - 0.5) * 8, S, yy);
      g.stroke();
    }
  }
  const frame = (x, y, w, h) => {
    g.fillStyle = '#6e4a24';
    g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,220,170,0.12)';
    g.fillRect(x, y, w, 2);
  };
  frame(0, 0, S, 22);
  frame(0, S - 22, S, 22);
  frame(0, 0, 22, S);
  frame(S - 22, 0, 22, S);
  g.save();
  g.translate(S / 2, S / 2);
  g.rotate(Math.PI / 4);
  frame(-S * 0.7, -11, S * 1.4, 22);
  g.restore();
  // pregos
  g.fillStyle = '#3b3530';
  for (const [x, y] of [[11, 11], [S - 11, 11], [11, S - 11], [S - 11, S - 11]]) {
    g.beginPath();
    g.arc(x, y, 3, 0, Math.PI * 2);
    g.fill();
  }
  speckle(g, S, S, 2500, rnd, 0.12);
  return toTex(c, false);
}

// Letra do bombsite pintada com spray na parede.
export function siteLetterTex(letter) {
  const [c, g] = canvas(256);
  g.clearRect(0, 0, 256, 256);
  g.font = 'bold 200px Impact, Arial Black, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(180,20,10,0.8)';
  g.shadowBlur = 12;
  g.fillStyle = 'rgba(200,30,20,0.9)';
  g.fillText(letter, 128, 136);
  g.shadowBlur = 0;
  // respingos do spray
  const rnd = seeded(letter.charCodeAt(0));
  g.fillStyle = 'rgba(200,30,20,0.6)';
  for (let i = 0; i < 120; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 60 + rnd() * 70;
    g.fillRect(128 + Math.cos(a) * r, 136 + Math.sin(a) * r, 1.5, 1.5);
  }
  return toTex(c, false);
}

// Marca de bala (decalque).
export function bulletHoleTex() {
  const [c, g] = canvas(64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  gr.addColorStop(0, 'rgba(10,8,6,1)');
  gr.addColorStop(0.25, 'rgba(30,22,14,0.95)');
  gr.addColorStop(0.5, 'rgba(70,55,35,0.5)');
  gr.addColorStop(1, 'rgba(70,55,35,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return toTex(c, false);
}

// Partícula macia (fumaça, poeira, sangue).
export function softTex() {
  const [c, g] = canvas(128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 62);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return toTex(c, false);
}

// Nuvem de fumaça com textura irregular.
export function smokeTex() {
  const [c, g] = canvas(128);
  const rnd = seeded(7);
  for (let i = 0; i < 26; i++) {
    const x = 64 + (rnd() - 0.5) * 50;
    const y = 64 + (rnd() - 0.5) * 50;
    const r = 18 + rnd() * 30;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.35)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  }
  return toTex(c, false);
}

// Clarão do disparo: estrela de pontas.
export function muzzleTex() {
  const [c, g] = canvas(128);
  g.translate(64, 64);
  for (let i = 0; i < 7; i++) {
    g.rotate((Math.PI * 2) / 7 + 0.2);
    const gr = g.createLinearGradient(0, 0, 60, 0);
    gr.addColorStop(0, 'rgba(255,240,200,1)');
    gr.addColorStop(1, 'rgba(255,150,40,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(0, -7);
    g.lineTo(60, 0);
    g.lineTo(0, 7);
    g.fill();
  }
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 30);
  gr.addColorStop(0, 'rgba(255,255,230,1)');
  gr.addColorStop(1, 'rgba(255,180,60,0)');
  g.fillStyle = gr;
  g.fillRect(-64, -64, 128, 128);
  return toTex(c, false);
}

// Metal/polímero com leve ruído (armas da visão em primeira pessoa).
export function gunMetalTex(seed = 9) {
  const [c, g] = canvas(128);
  const rnd = seeded(seed);
  g.fillStyle = '#808080';
  g.fillRect(0, 0, 128, 128);
  speckle(g, 128, 128, 1500, rnd, 0.2);
  for (let i = 0; i < 30; i++) {
    g.strokeStyle = `rgba(255,255,255,${rnd() * 0.08})`;
    g.beginPath();
    const y = rnd() * 128;
    g.moveTo(0, y);
    g.lineTo(128, y + (rnd() - 0.5) * 6);
    g.stroke();
  }
  return toTex(c);
}

// Madeira envernizada (coronha da AK).
export function woodTex(seed = 11) {
  const [c, g] = canvas(128);
  const rnd = seeded(seed);
  g.fillStyle = '#7a3f18';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(${rnd() < 0.5 ? '40,15,5' : '160,90,40'},${0.15 + rnd() * 0.2})`;
    g.lineWidth = 1 + rnd() * 2;
    g.beginPath();
    const y = rnd() * 128;
    g.moveTo(0, y);
    g.bezierCurveTo(40, y + (rnd() - 0.5) * 10, 80, y + (rnd() - 0.5) * 10, 128, y);
    g.stroke();
  }
  return toTex(c);
}
