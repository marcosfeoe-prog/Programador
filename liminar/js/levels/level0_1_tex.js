// Subnível 0.1 — texturas procedurais da Estação Zênite: placas de piso,
// painéis das paredes, metal escuro, grade, carpete do Mirante, faixas de
// perigo, placas de sinalização e telas.
import { registerTexture, TEX, textCanvasTex } from '../textures.js';
import { clamp, mulberry32, TAU } from '../util.js';

const { toTex, noiseField, whiteNoise, paintRGB, normalMap } = TEX;

// Piso: placas de 0,6 m (4×4 por repetição de 2,4 m), juntas escuras, rebites e marcas de uso.
registerTexture('zFloor', (S) => {
  const low = noiseField(S, S, 3, 3, 4, 701);
  const mid = noiseField(S, S, 12, 12, 3, 702);
  const fine = whiteNoise(S * S, 703);
  const r = mulberry32(704);
  const tone = Array.from({ length: 16 }, () => r());
  const q = S / 4;
  const hf = new Float32Array(S * S);
  const rg = new Float32Array(S * S);
  const cv = paintRGB(S, S, (x, y, i, o) => {
    const tx = Math.floor(x / q);
    const ty = Math.floor(y / q);
    const lx = x - tx * q;
    const ly = y - ty * q;
    const d = Math.min(lx, q - 1 - lx, ly, q - 1 - ly);
    let k = 0.56 + (tone[ty * 4 + tx] - 0.5) * 0.05 + low[i] * 0.06 + mid[i] * 0.03 + fine[i] * 0.012;
    // rebites nos cantos
    const cx = Math.min(lx, q - 1 - lx);
    const cy = Math.min(ly, q - 1 - ly);
    const rv = Math.hypot(cx - q * 0.08, cy - q * 0.08);
    let h = 0.5;
    if (rv < q * 0.025) {
      k += 0.08;
      h = 0.8;
    }
    if (d < 1.2) {
      k *= 0.42;
      h = 0;
    } else if (d < 3) k *= 0.93 + d * 0.02;
    o[0] = k * 0.96;
    o[1] = k * 0.98;
    o[2] = k;
    hf[i] = h + mid[i] * 0.04;
    rg[i] = d < 1.2 ? 0.8 : clamp(0.32 + mid[i] * 0.2 + low[i] * 0.15, 0.15, 0.65);
  });
  const rgh = paintRGB(S, S, (x, y, i, o) => {
    o[0] = o[1] = o[2] = rg[i];
  });
  return { map: toTex(cv), normalMap: normalMap(hf, S, S, 2), roughnessMap: toTex(rgh, { srgb: false }) };
});

// Parede: dois painéis brancos de 1,2 m por repetição (2,4 m × 2,4 m), com
// junta, faixa horizontal a 1 m, grelha de ventilação e um friso azul.
registerTexture('zWall', (S) => {
  const low = noiseField(S, S, 2, 2, 4, 711);
  const fine = whiteNoise(S * S, 712);
  const h2 = S >> 1;
  const band = Math.round(S * (1 - 1.0 / 2.4));
  const stripe = Math.round(S * (1 - 1.12 / 2.4));
  const hf = new Float32Array(S * S);
  const cv = paintRGB(S, S, (x, y, i, o) => {
    const lx = x % h2;
    const dx = Math.min(lx, h2 - 1 - lx);
    const dy = Math.min(y, S - 1 - y);
    const db = Math.abs(y - band);
    let k = 0.8 + low[i] * 0.04 + fine[i] * 0.01;
    let h = 0.5;
    let blue = 0;
    if (Math.min(dx, dy) < 1.2) {
      k *= 0.45;
      h = 0;
    } else if (Math.min(dx, dy) < 4) k *= 0.97;
    if (db < 1) {
      k *= 0.6;
      h = 0.2;
    }
    if (Math.abs(y - stripe) < S * 0.012) blue = 1;
    // grelha de ventilação num dos painéis, embaixo
    const vx = x - h2 * 0.18;
    const vy = y - S * 0.86;
    if (x < h2 && vx > 0 && vx < h2 * 0.3 && vy > 0 && vy < S * 0.07) {
      if (Math.floor(vy / (S * 0.012)) % 2 === 0) {
        k *= 0.35;
        h = 0.1;
      }
    }
    o[0] = blue ? 0.16 : k * 0.975;
    o[1] = blue ? 0.38 : k * 0.985;
    o[2] = blue ? 0.62 : k;
    hf[i] = h;
  });
  return { map: toTex(cv), normalMap: normalMap(hf, S, S, 2.2) };
});

// Metal escuro com chapas, rebites e riscos (estrutura, máquinas).
registerTexture('zDark', (S) => {
  const low = noiseField(S, S, 4, 4, 4, 721);
  const scr = noiseField(S, S, 64, 2, 2, 722);
  const fine = whiteNoise(S * S, 723);
  const h2 = S >> 1;
  const hf = new Float32Array(S * S);
  const rg = new Float32Array(S * S);
  const cv = paintRGB(S, S, (x, y, i, o) => {
    const lx = x % h2;
    const ly = y % h2;
    const d = Math.min(lx, h2 - 1 - lx, ly, h2 - 1 - ly);
    let k = 0.2 + low[i] * 0.05 + fine[i] * 0.012;
    let h = 0.5;
    const rv = Math.min(Math.hypot(lx - 8, ly - 8), Math.hypot(h2 - 9 - lx, ly - 8), Math.hypot(lx - 8, h2 - 9 - ly), Math.hypot(h2 - 9 - lx, h2 - 9 - ly));
    if (rv < 3) {
      k += 0.07;
      h = 0.85;
    }
    if (scr[i] > 0.72) k += 0.04;
    if (d < 1.2) {
      k *= 0.5;
      h = 0;
    }
    o[0] = k * 0.95;
    o[1] = k * 0.98;
    o[2] = k * 1.04;
    hf[i] = h;
    rg[i] = clamp(0.38 + low[i] * 0.2 - (scr[i] > 0.72 ? 0.12 : 0), 0.2, 0.7);
  });
  const rgh = paintRGB(S, S, (x, y, i, o) => {
    o[0] = o[1] = o[2] = rg[i];
  });
  return { map: toTex(cv), normalMap: normalMap(hf, S, S, 2.5), roughnessMap: toTex(rgh, { srgb: false }) };
});

// Grade de piso industrial (barras cruzadas).
registerTexture('zGrate', (S) => {
  const low = noiseField(S, S, 2, 2, 3, 731);
  const p = S / 8;
  const hf = new Float32Array(S * S);
  const cv = paintRGB(S, S, (x, y, i, o) => {
    const ax = (x % p) / p;
    const ay = (y % (p * 0.5)) / (p * 0.5);
    const barX = ax < 0.16;
    const barY = ay < 0.22;
    let k = 0.05;
    let h = 0;
    if (barX || barY) {
      k = 0.34 + low[i] * 0.06;
      h = barX ? 1 : 0.8;
    }
    o[0] = k * 0.95;
    o[1] = k * 0.97;
    o[2] = k;
    hf[i] = h;
  });
  return { map: toTex(cv), normalMap: normalMap(hf, S, S, 3) };
});

// Carpete azul-noite do Mirante, com padrão discreto de losangos.
registerTexture('zCarpet', (S) => {
  const fib = whiteNoise(S * S, 741);
  const low = noiseField(S, S, 4, 4, 4, 742);
  const hf = new Float32Array(S * S);
  const cv = paintRGB(S, S, (x, y, i, o) => {
    const u = (x / S) * 8;
    const v = (y / S) * 8;
    const dia = Math.abs((u % 1) - 0.5) + Math.abs((v % 1) - 0.5);
    const pat = dia > 0.46 && dia < 0.5 ? 1 : 0;
    const k = 0.25 + fib[i] * 0.03 + low[i] * 0.05 + pat * 0.06;
    o[0] = k * 0.55;
    o[1] = k * 0.68;
    o[2] = k * 1.18;
    hf[i] = 0.5 + fib[i] * 0.4;
  });
  return { map: toTex(cv), normalMap: normalMap(hf, S, S, 1.2) };
});

// Faixas de perigo amarelas e pretas, gastas.
registerTexture('zHazard', (S) => {
  const low = noiseField(S, S, 6, 6, 4, 751);
  const cv = paintRGB(S, S, (x, y, i, o) => {
    const s = ((x + y) / S) * 4;
    const yel = s - Math.floor(s) < 0.5;
    const wear = low[i] > 0.62 ? 0.5 : 1;
    if (yel) {
      o[0] = 0.85 * wear + 0.2 * (1 - wear);
      o[1] = 0.62 * wear + 0.2 * (1 - wear);
      o[2] = 0.06 + 0.15 * (1 - wear);
    } else {
      o[0] = o[1] = o[2] = 0.05 + (1 - wear) * 0.12;
    }
  });
  return { map: toTex(cv) };
});

// Teto: placas claras com perfurações acústicas.
registerTexture('zCeil', (S) => {
  const low = noiseField(S, S, 2, 2, 3, 761);
  const q = S / 2;
  const hf = new Float32Array(S * S);
  const cv = paintRGB(S, S, (x, y, i, o) => {
    const lx = x % q;
    const ly = y % q;
    const d = Math.min(lx, q - 1 - lx, ly, q - 1 - ly);
    let k = 0.72 + low[i] * 0.03;
    let h = 0.5;
    const px = lx % (q / 16);
    const py = ly % (q / 16);
    if (d > q * 0.08 && Math.hypot(px - q / 32, py - q / 32) < q / 120 + 0.6) {
      k *= 0.6;
      h = 0.2;
    }
    if (d < 1.2) {
      k *= 0.45;
      h = 0;
    }
    o[0] = k * 0.97;
    o[1] = k * 0.985;
    o[2] = k;
    hf[i] = h;
  });
  return { map: toTex(cv), normalMap: normalMap(hf, S, S, 1.5) };
});

// Cobre enrolado das bobinas (espiras horizontais).
registerTexture('zCopper', (S) => {
  const low = noiseField(S, S, 2, 4, 3, 771);
  const hf = new Float32Array(S * S);
  const cv = paintRGB(S, S, (x, y, i, o) => {
    const t = ((y / S) * 48) % 1;
    const ridge = Math.sin(t * Math.PI);
    const k = 0.45 + ridge * 0.4 + low[i] * 0.08;
    o[0] = k * 0.95;
    o[1] = k * 0.52;
    o[2] = k * 0.28;
    hf[i] = ridge;
  });
  return { map: toTex(cv), normalMap: normalMap(hf, S, S, 4) };
});

// ------------------------------------------------------------ placas e telas
// Placa de sinalização: fundo grafite, texto branco, faixa colorida e seta opcional.
export function zSign(text, sub, color = '#3fa7ff', arrow = 0) {
  return textCanvasTex(512, 128, (c, w, h) => {
    c.fillStyle = '#1a1e24';
    c.fillRect(0, 0, w, h);
    c.fillStyle = color;
    c.fillRect(0, 0, 14, h);
    c.fillStyle = '#eef3f8';
    c.font = 'bold 54px Arial, Helvetica, sans-serif';
    c.textBaseline = 'middle';
    c.fillText(text, 36, sub ? h * 0.38 : h / 2);
    if (sub) {
      c.fillStyle = '#8fa0b0';
      c.font = '26px Arial, Helvetica, sans-serif';
      c.fillText(sub, 38, h * 0.76);
    }
    if (arrow) {
      c.fillStyle = color;
      c.save();
      c.translate(w - 56, h / 2);
      c.rotate(arrow > 0 ? 0 : Math.PI);
      c.beginPath();
      c.moveTo(-22, -24);
      c.lineTo(22, 0);
      c.lineTo(-22, 24);
      c.closePath();
      c.fill();
      c.restore();
    }
  });
}

// Logotipo grande da estação para o Átrio.
export function zLogo() {
  return textCanvasTex(1024, 256, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.strokeStyle = '#7cc8ff';
    c.lineWidth = 10;
    c.beginPath();
    c.arc(128, h / 2, 86, 0, TAU);
    c.stroke();
    c.beginPath();
    c.ellipse(128, h / 2, 118, 30, -0.4, 0, TAU);
    c.stroke();
    c.fillStyle = '#7cc8ff';
    c.beginPath();
    c.arc(128, h / 2, 30, 0, TAU);
    c.fill();
    c.fillStyle = '#f2f7fc';
    c.font = 'bold 104px Arial, Helvetica, sans-serif';
    c.textBaseline = 'middle';
    c.fillText('ZÊNITE', 270, h * 0.42);
    c.fillStyle = '#9fb3c6';
    c.font = '38px Arial, Helvetica, sans-serif';
    c.fillText('USINA ORBITAL 7  ·  NÍVEL 0.1', 276, h * 0.8);
  }, { mips: true });
}

// Telas de console: gráficos, ondas e listas (sempre o mesmo desenho por semente).
export function zScreen(seed, hue = 200, title = 'SISTEMA') {
  const r = mulberry32(seed);
  return textCanvasTex(256, 160, (c, w, h) => {
    c.fillStyle = `hsl(${hue},45%,7%)`;
    c.fillRect(0, 0, w, h);
    c.fillStyle = `hsl(${hue},80%,62%)`;
    c.font = 'bold 15px monospace';
    c.fillText(title, 10, 20);
    c.fillRect(10, 26, w - 20, 1.5);
    const kind = Math.floor(r() * 3);
    c.strokeStyle = `hsl(${hue},85%,60%)`;
    c.lineWidth = 2;
    if (kind === 0) {
      c.beginPath();
      for (let x = 0; x <= w - 20; x += 4) {
        const y = 92 + Math.sin(x * 0.07 + r()) * 18 + (r() - 0.5) * 10;
        if (x === 0) c.moveTo(10 + x, y);
        else c.lineTo(10 + x, y);
      }
      c.stroke();
    } else if (kind === 1) {
      for (let b = 0; b < 12; b++) {
        const bh = 18 + r() * 90;
        c.fillStyle = `hsla(${hue},80%,${45 + r() * 25}%,0.9)`;
        c.fillRect(14 + b * 19, 148 - bh, 13, bh);
      }
    } else {
      c.font = '12px monospace';
      for (let l = 0; l < 8; l++) {
        c.fillStyle = r() < 0.15 ? '#ff6a5a' : `hsl(${hue},60%,${55 + r() * 20}%)`;
        let s = '';
        for (let k = 0; k < 22; k++) s += '0123456789ABCDEF.-:'[Math.floor(r() * 19)];
        c.fillText(s, 10, 46 + l * 14);
      }
    }
  });
}

// Tela grande da Sala de Controle, redesenhada quando a energia muda.
export class ControlScreen {
  constructor() {
    this.cv = TEX.makeCanvas(512, 256);
    this.tex = toTex(this.cv, { repeat: false, mips: false });
    this.draw(0.38, [false, false, false], 0);
  }

  draw(power, coils, t) {
    const c = this.cv.getContext('2d');
    const w = 512;
    const h = 256;
    const ok = power > 0.95;
    c.fillStyle = '#04121c';
    c.fillRect(0, 0, w, h);
    c.fillStyle = ok ? '#7dffb0' : '#ffb347';
    c.font = 'bold 26px monospace';
    c.fillText('ZÊNITE · REDE PRINCIPAL', 16, 34);
    c.fillRect(16, 44, w - 32, 2);
    c.font = 'bold 64px monospace';
    c.fillText(`${Math.round(power * 100)}%`, 20, 120);
    c.font = '18px monospace';
    c.fillStyle = '#9cc6e0';
    c.fillText('SAÍDA PARA O SAGUÃO (NÍVEL 0)', 20, 150);
    for (let k = 0; k < 3; k++) {
      const x = 270 + k * 76;
      c.strokeStyle = coils[k] ? '#7dffb0' : '#ff5f4f';
      c.lineWidth = 3;
      c.strokeRect(x, 70, 60, 80);
      c.fillStyle = coils[k] ? '#7dffb0' : '#ff5f4f';
      c.fillRect(x + 6, 150 - 74 * (coils[k] ? 0.95 : 0.25 + 0.15 * Math.sin(t * 5 + k)), 48, 4);
      c.font = 'bold 18px monospace';
      c.fillText(`B${k + 1}`, x + 18, 176);
    }
    c.strokeStyle = ok ? '#7dffb0' : '#ffb347';
    c.lineWidth = 2;
    c.beginPath();
    for (let x = 0; x < w - 32; x += 3) {
      const a = ok ? 10 : 22;
      const y = 222 + Math.sin(x * 0.05 + t * 3) * a * (ok ? 1 : 0.5 + 0.5 * Math.sin(x * 0.31 + t * 9));
      if (x === 0) c.moveTo(16 + x, y);
      else c.lineTo(16 + x, y);
    }
    c.stroke();
    c.font = '16px monospace';
    c.fillStyle = ok ? '#7dffb0' : '#ff5f4f';
    c.fillText(ok ? 'ELEVADOR DE SERVIÇO: LIBERÁVEL' : 'ALERTA: BOBINAS FORA DE FASE', 270, 34 + 170);
    this.tex.needsUpdate = true;
  }
}

// Holograma: grade de linhas de latitude/longitude ciano (planeta girando).
export function holoTex() {
  return textCanvasTex(512, 256, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.strokeStyle = 'rgba(120,220,255,0.95)';
    c.lineWidth = 2;
    for (let i = 1; i < 8; i++) {
      c.beginPath();
      c.moveTo(0, (i / 8) * h);
      c.lineTo(w, (i / 8) * h);
      c.stroke();
    }
    for (let i = 0; i < 16; i++) {
      c.beginPath();
      c.moveTo((i / 16) * w, 0);
      c.lineTo((i / 16) * w, h);
      c.stroke();
    }
    // continentes imaginários
    const r = mulberry32(55);
    c.fillStyle = 'rgba(120,220,255,0.35)';
    for (let k = 0; k < 14; k++) {
      c.beginPath();
      c.ellipse(r() * w, h * 0.2 + r() * h * 0.6, 20 + r() * 50, 10 + r() * 26, r() * 3, 0, TAU);
      c.fill();
    }
  }, { repeat: true });
}

// Luz quente no vão da porta e brilho genérico radial (para "poças" de luz).
export function glowTex() {
  return textCanvasTex(128, 128, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  });
}

export function makeNameTag(name, role) {
  const t = textCanvasTex(512, 128, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = 'rgba(8,14,20,0.55)';
    const r = 26;
    c.beginPath();
    c.moveTo(r, 8);
    c.arcTo(w - 8, 8, w - 8, h - 8, r);
    c.arcTo(w - 8, h - 8, 8, h - 8, r);
    c.arcTo(8, h - 8, 8, 8, r);
    c.arcTo(8, 8, w - 8, 8, r);
    c.fill();
    c.textAlign = 'center';
    c.fillStyle = '#f2f7fc';
    c.font = 'bold 44px Arial, Helvetica, sans-serif';
    c.fillText(name, w / 2, 58);
    c.fillStyle = '#8fd0ff';
    c.font = '30px Arial, Helvetica, sans-serif';
    c.fillText(role, w / 2, 100);
  });
  return t;
}

