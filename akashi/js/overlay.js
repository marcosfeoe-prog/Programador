// Camada 2D por cima da imagem 3D: legendas, linhas de velocidade de mangá,
// onomatopeias, faixas de cinema, fades, cartões de título e de personagem,
// balão de pensamento, rachadura na tela e os créditos. Coordenadas virtuais
// de 1920 × 1080 (a camada é escalada para o tamanho real).
import { clamp, hash, smooth, range, backOut, easeOut } from './util.js';
import { drawRosbife } from './props.js';

export const VW = 1920;
export const VH = 1080;
const FONT = '"Arial Black", "Helvetica Neue", "Liberation Sans", Impact, sans-serif';
const SANS = '"Helvetica Neue", Arial, "Liberation Sans", sans-serif';

export class Overlay {
  constructor(canvas) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.k = 1;
  }

  resize(w, h) {
    this.c.width = w;
    this.c.height = h;
    this.k = w / VW;
  }

  begin() {
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.c.width, this.c.height);
    g.setTransform(this.k, 0, 0, this.k, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  // ------------------------------------------------------------ básicos
  fade(color, a) {
    if (a <= 0) return;
    const g = this.g;
    g.globalAlpha = clamp(a);
    g.fillStyle = color;
    g.fillRect(0, 0, VW, VH);
    g.globalAlpha = 1;
  }

  letterbox(k) {
    if (k <= 0) return;
    const g = this.g;
    const h = 120 * clamp(k);
    g.fillStyle = '#000';
    g.fillRect(0, 0, VW, h);
    g.fillRect(0, VH - h, VW, h);
  }

  // Linhas de concentração (radiais) do mangá.
  speedLines(o = {}) {
    const { k = 1, cx = VW / 2, cy = VH / 2, color = '#000', t = 0, n = 90, inner = 0.42, fps = 12, seed = 0 } = o;
    if (k <= 0) return;
    const g = this.g;
    const f = Math.floor(t * fps) + seed * 100;
    const R = Math.hypot(VW, VH);
    g.fillStyle = color;
    g.globalAlpha = clamp(k);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (hash(i + f * 13.1) - 0.5) * 0.06;
      const r0 = R * (inner + hash(i * 3.3 + f) * 0.25) * 0.5 + (1 - clamp(k)) * 200;
      const w = (0.004 + hash(i * 7.1 + f) * 0.012) * (0.6 + k * 0.4);
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      g.lineTo(cx + Math.cos(a - w) * R, cy + Math.sin(a - w) * R);
      g.lineTo(cx + Math.cos(a + w) * R, cy + Math.sin(a + w) * R);
      g.closePath();
      g.fill();
    }
    g.globalAlpha = 1;
  }

  // Linhas paralelas de velocidade (deslocamento lateral).
  dashLines(o = {}) {
    const { k = 1, color = 'rgba(255,255,255,0.8)', t = 0, n = 40, dir = 1, fps = 12 } = o;
    if (k <= 0) return;
    const g = this.g;
    const f = Math.floor(t * fps);
    g.fillStyle = color;
    g.globalAlpha = clamp(k);
    for (let i = 0; i < n; i++) {
      const y = hash(i * 2.1 + f) * VH;
      const len = 300 + hash(i * 5.1 + f) * 900;
      const x = ((hash(i * 9.7 + f) * (VW + len)) - len);
      g.fillRect(dir > 0 ? x : VW - x - len, y, len, 2 + hash(i + f) * 5);
    }
    g.globalAlpha = 1;
  }

  // Fundo de "choque": cor chapada com raios, por trás de nada (usado em cortes).
  burstBg(color1, color2, t, cx = VW / 2, cy = VH / 2) {
    const g = this.g;
    g.fillStyle = color1;
    g.fillRect(0, 0, VW, VH);
    g.fillStyle = color2;
    const n = 24;
    const R = 2400;
    const rot = t * 0.3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rot;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      g.lineTo(cx + Math.cos(a + Math.PI / n) * R, cy + Math.sin(a + Math.PI / n) * R);
      g.fill();
    }
  }

  // Raios dourados saindo de um ponto (a marmita se abrindo).
  rays(cx, cy, k, t, color = 'rgba(255,230,140,0.55)', n = 18) {
    if (k <= 0) return;
    const g = this.g;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = clamp(k);
    const R = 1800 * k;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + t * 0.25;
      const w = 0.05 + hash(i) * 0.05;
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, R);
      gr.addColorStop(0, color);
      gr.addColorStop(1, 'rgba(255,230,140,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(a - w) * R, cy + Math.sin(a - w) * R);
      g.lineTo(cx + Math.cos(a + w) * R, cy + Math.sin(a + w) * R);
      g.fill();
    }
    const rg = g.createRadialGradient(cx, cy, 0, cx, cy, 260 * k);
    rg.addColorStop(0, 'rgba(255,250,220,0.9)');
    rg.addColorStop(1, 'rgba(255,250,220,0)');
    g.fillStyle = rg;
    g.fillRect(cx - 300, cy - 300, 600, 600);
    g.restore();
  }

  // Fundo de flores/brilhos (efeito shōjo) nas laterais.
  shoujo(k, t, color = 'rgba(255,190,210,0.55)') {
    if (k <= 0) return;
    const g = this.g;
    g.save();
    g.globalAlpha = clamp(k);
    for (let i = 0; i < 26; i++) {
      const side = i % 2 ? 1 : 0;
      const x = side ? VW - 60 - hash(i) * 380 : 60 + hash(i) * 380;
      const y = ((hash(i * 3.3) * VH + t * (30 + hash(i) * 40)) % (VH + 100)) - 50;
      const r = 14 + hash(i * 5.5) * 26;
      g.fillStyle = color;
      g.beginPath();
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2 + t + i;
        g.ellipse(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.5, r * 0.32, a, 0, Math.PI * 2);
      }
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.beginPath();
      g.arc(x, y, r * 0.18, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  // ------------------------------------------------------------ texto
  // Onomatopeia com contorno grosso, que "estoura" na tela.
  onoma(text, x, y, size, age, o = {}) {
    const { color = '#ffffff', stroke = '#111111', rot = -0.08, dur = 1.2, shake = 6, skew = -0.15, fill2 = null } = o;
    if (age < 0 || age > dur) return;
    const g = this.g;
    const s = backOut(range(age, 0, 0.18)) * (1 + 0.04 * Math.sin(age * 30));
    const a = 1 - smooth(range(age, dur * 0.7, dur));
    const sx = (hash(Math.floor(age * 24)) - 0.5) * shake;
    const sy = (hash(Math.floor(age * 24) + 7) - 0.5) * shake;
    g.save();
    g.globalAlpha = a;
    g.translate(x + sx, y + sy);
    g.rotate(rot);
    g.transform(1, 0, skew, 1, 0, 0);
    g.scale(s, s);
    g.font = `900 ${size}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = size * 0.2;
    g.strokeStyle = stroke;
    g.strokeText(text, 0, 0);
    if (fill2) {
      const gr = g.createLinearGradient(0, -size / 2, 0, size / 2);
      gr.addColorStop(0, color);
      gr.addColorStop(1, fill2);
      g.fillStyle = gr;
    } else g.fillStyle = color;
    g.fillText(text, 0, 0);
    g.restore();
  }

  text(str, x, y, o = {}) {
    const { size = 40, color = '#fff', align = 'center', font = SANS, weight = 700, stroke = null, sw = 6, alpha = 1, italic = false, spacing = 0, shadow = null } = o;
    const g = this.g;
    g.save();
    g.globalAlpha = clamp(alpha);
    g.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${font}`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    if (spacing) g.letterSpacing = `${spacing}px`;
    if (shadow) {
      g.shadowColor = shadow;
      g.shadowBlur = 18;
    }
    if (stroke) {
      g.lineJoin = 'round';
      g.lineWidth = sw;
      g.strokeStyle = stroke;
      g.strokeText(str, x, y);
    }
    g.fillStyle = color;
    g.fillText(str, x, y);
    g.restore();
  }

  wrap(str, maxW, size, font = SANS, weight = 700, italic = false) {
    const g = this.g;
    g.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${font}`;
    const words = str.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (g.measureText(test).width > maxW && cur) {
        lines.push(cur);
        cur = w;
      } else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  // Legenda: nome do personagem colorido e fala com contorno.
  subtitle(sub, lb = 0) {
    if (!sub) return;
    const { name, color, text, thought, age, dur, shown } = sub;
    const g = this.g;
    const a = smooth(range(age, 0, 0.12)) * (1 - smooth(range(age, dur - 0.15, dur)));
    if (a <= 0) return;
    const size = 46;
    const str = thought ? `(${text})` : text;
    const visible = str.slice(0, Math.ceil(str.length * (shown ?? 1)));
    const lines = this.wrap(str, 1500, size, SANS, 700, thought);
    const base = VH - 70 - Math.max(0, lb * 120 - 20);
    let y = base - (lines.length - 1) * (size + 10);
    if (name) this.text(name, VW / 2, y - size - 4, { size: 30, color, stroke: '#000', sw: 7, alpha: a, weight: 800 });
    let left = visible.length;
    for (const line of lines) {
      const part = line.slice(0, Math.max(0, left));
      left -= line.length + 1;
      // mantém a linha centralizada pelo comprimento final
      g.save();
      g.font = `${thought ? 'italic ' : ''}700 ${size}px ${SANS}`;
      const full = g.measureText(line).width;
      g.restore();
      this.text(part, VW / 2 - full / 2, y, {
        size,
        color: thought ? '#cfe6ff' : '#ffffff',
        stroke: '#0a0a0a',
        sw: 9,
        alpha: a,
        italic: thought,
        align: 'left',
      });
      y += size + 10;
    }
  }

  // ------------------------------------------------------------ cartões
  // Logotipo "AKASHI" da abertura.
  logo(age, o = {}) {
    const { x = VW / 2, y = VH / 2 - 40, scale = 1, sub = null, subAge = 0 } = o;
    if (age < 0) return;
    const g = this.g;
    const s = backOut(range(age, 0, 0.3)) * scale;
    const shake = age < 0.5 ? (hash(Math.floor(age * 30)) - 0.5) * 16 * (1 - age * 2) : 0;
    g.save();
    g.translate(x + shake, y);
    g.scale(s, s);
    g.rotate(-0.05);
    g.transform(1, 0, -0.18, 1, 0, 0);
    g.font = `900 230px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = 46;
    g.strokeStyle = '#0a0a0a';
    g.strokeText('AKASHI', 0, 0);
    g.lineWidth = 22;
    g.strokeStyle = '#ffffff';
    g.strokeText('AKASHI', 0, 0);
    const gr = g.createLinearGradient(0, -110, 0, 110);
    gr.addColorStop(0, '#ff5a4a');
    gr.addColorStop(0.5, '#d0101e');
    gr.addColorStop(1, '#6a0008');
    g.fillStyle = gr;
    g.fillText('AKASHI', 0, 0);
    // golpe de pincel atrás
    g.globalCompositeOperation = 'destination-over';
    g.fillStyle = '#111';
    g.beginPath();
    g.moveTo(-760, 40);
    g.quadraticCurveTo(0, -30, 760, 10);
    g.lineTo(740, 90);
    g.quadraticCurveTo(0, 60, -740, 120);
    g.closePath();
    g.fill();
    g.restore();
    if (sub && subAge > 0) {
      const a = smooth(range(subAge, 0, 0.4));
      this.text(sub, x, y + 190 * scale, { size: 50 * scale, color: '#fff', stroke: '#000', sw: 10, alpha: a, weight: 800, spacing: 4 });
    }
  }

  // Cartão de apresentação de personagem (abertura).
  charCard(name, role, traits, age, color = '#d0101e', side = 'left') {
    if (age < 0) return;
    const g = this.g;
    const slide = easeOut(range(age, 0, 0.35));
    const x0 = side === 'left' ? -900 + slide * 960 : VW + 900 - slide * 960;
    const align = side === 'left' ? 'left' : 'right';
    g.save();
    g.fillStyle = color;
    g.globalAlpha = 0.92;
    g.beginPath();
    if (side === 'left') {
      g.moveTo(x0 - 100, 700);
      g.lineTo(x0 + 820, 680);
      g.lineTo(x0 + 760, 860);
      g.lineTo(x0 - 100, 880);
    } else {
      g.moveTo(x0 + 100, 700);
      g.lineTo(x0 - 820, 680);
      g.lineTo(x0 - 760, 860);
      g.lineTo(x0 + 100, 880);
    }
    g.fill();
    g.restore();
    const tx = side === 'left' ? x0 + 30 : x0 - 30;
    this.text(name, tx, 760, { size: 96, color: '#fff', stroke: '#000', sw: 14, align, font: FONT, weight: 900 });
    this.text(role, tx, 835, { size: 38, color: '#fff', align, weight: 700, stroke: 'rgba(0,0,0,0.6)', sw: 6 });
    (traits || []).forEach((tr, i) => {
      const ta = smooth(range(age, 0.5 + i * 0.35, 0.75 + i * 0.35));
      if (ta <= 0) return;
      const ty = 180 + i * 80;
      const bx = side === 'left' ? 80 : VW - 80;
      g.save();
      g.globalAlpha = ta;
      g.fillStyle = 'rgba(0,0,0,0.75)';
      const w = 560;
      g.fillRect(side === 'left' ? bx - 20 + (1 - ta) * -60 : bx - w + 20 + (1 - ta) * 60, ty - 32, w, 64);
      g.fillStyle = color;
      g.fillRect(side === 'left' ? bx - 20 + (1 - ta) * -60 : bx + 8 + (1 - ta) * 60, ty - 32, 12, 64);
      g.restore();
      this.text(tr, side === 'left' ? bx + 10 : bx - 10, ty, { size: 38, color: '#fff', align, alpha: ta, weight: 800 });
    });
  }

  // Créditos da abertura (canto inferior).
  credit(lines, age, dur, side = 'right') {
    if (age < 0 || age > dur) return;
    const a = smooth(range(age, 0, 0.4)) * (1 - smooth(range(age, dur - 0.4, dur)));
    const x = side === 'right' ? VW - 110 : 110;
    lines.forEach((l, i) => {
      this.text(l, x, VH - 230 + i * 52, {
        size: i === 0 ? 30 : 42,
        color: '#fff',
        align: side === 'right' ? 'right' : 'left',
        alpha: a,
        stroke: 'rgba(0,0,0,0.75)',
        sw: 6,
        weight: i === 0 ? 600 : 800,
        spacing: i === 0 ? 3 : 1,
      });
    });
  }

  // Balão de pensamento com um rosbife desenhado.
  thought(x, y, r, age, kind = 'rosbife') {
    if (age < 0) return;
    const g = this.g;
    const k = backOut(range(age, 0, 0.35));
    g.save();
    g.translate(x, y);
    g.scale(k, k);
    const puff = (px, py, pr) => {
      g.beginPath();
      g.arc(px, py, pr, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    };
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#111';
    g.lineWidth = 6;
    puff(-r * 1.25, r * 1.25, r * 0.12);
    puff(-r * 0.95, r * 0.95, r * 0.2);
    g.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.arc(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.62, r * 0.32, 0, Math.PI * 2);
    }
    g.fill();
    g.stroke();
    g.beginPath();
    g.ellipse(0, 0, r * 0.95, r * 0.72, 0, 0, Math.PI * 2);
    g.fill();
    if (kind === 'rosbife') {
      const bob = Math.sin(age * 4) * 6;
      drawRosbife(g, -r * 0.2, bob - 8, r * 0.42, r * 0.3, -0.2);
      drawRosbife(g, r * 0.25, bob + 14, r * 0.4, r * 0.28, 0.3);
      // brilhinhos
      g.fillStyle = '#ffd23a';
      for (let i = 0; i < 3; i++) {
        const a = age * 3 + i * 2;
        const sx = Math.cos(a) * r * 0.6;
        const sy = Math.sin(a) * r * 0.42;
        g.beginPath();
        for (let p = 0; p < 8; p++) {
          const aa = (p / 8) * Math.PI * 2;
          const rr = p % 2 ? 4 : 14;
          g.lineTo(sx + Math.cos(aa) * rr, sy + Math.sin(aa) * rr);
        }
        g.fill();
      }
    }
    g.restore();
  }

  // Rachaduras na tela (soco na câmera).
  crack(x, y, age, seed = 3) {
    if (age < 0) return;
    const g = this.g;
    const k = easeOut(range(age, 0, 0.12));
    g.save();
    g.strokeStyle = '#ffffff';
    g.lineCap = 'round';
    for (let i = 0; i < 14; i++) {
      let a = (i / 14) * Math.PI * 2 + hash(i + seed) * 0.4;
      let px = x;
      let py = y;
      const L = (300 + hash(i * 3 + seed) * 700) * k;
      g.lineWidth = 7;
      g.strokeStyle = '#000';
      g.beginPath();
      g.moveTo(px, py);
      const pts = [];
      for (let s = 0; s < 6; s++) {
        a += (hash(i * 11 + s + seed) - 0.5) * 0.7;
        px += Math.cos(a) * (L / 6);
        py += Math.sin(a) * (L / 6);
        pts.push([px, py]);
        g.lineTo(px, py);
      }
      g.stroke();
      g.lineWidth = 3;
      g.strokeStyle = '#ffffff';
      g.beginPath();
      g.moveTo(x, y);
      for (const [qx, qy] of pts) g.lineTo(qx, qy);
      g.stroke();
    }
    g.restore();
  }

  // Cartão de título do episódio.
  episodeCard(num, title, age, dur) {
    if (age < 0 || age > dur) return;
    const a = smooth(range(age, 0, 0.5)) * (1 - smooth(range(age, dur - 0.5, dur)));
    this.text(`EPISÓDIO ${num}`, VW / 2, VH / 2 - 60, { size: 44, color: '#fff', alpha: a, spacing: 12, weight: 700, stroke: '#000', sw: 6 });
    this.text(title, VW / 2, VH / 2 + 30, { size: 84, color: '#fff', alpha: a, font: FONT, weight: 900, stroke: '#000', sw: 12 });
  }

  // Créditos do encerramento (rolando).
  roll(entries, u, x = VW - 420) {
    let y = VH + 80 - u * (entries.length * 92 + VH);
    for (const [role, name] of entries) {
      if (y > -60 && y < VH + 60) {
        const fadeA = smooth(range(y, -40, 120)) * (1 - smooth(range(y, VH - 120, VH + 40)));
        if (role) this.text(role, x, y, { size: 26, color: '#ffd8d8', alpha: fadeA, weight: 600, spacing: 3, stroke: 'rgba(0,0,0,0.6)', sw: 5 });
        if (name) this.text(name, x, y + 34, { size: 38, color: '#fff', alpha: fadeA, weight: 800, stroke: 'rgba(0,0,0,0.6)', sw: 6 });
      }
      y += 92;
    }
  }

  // Carimbo "Continua…" estilo anime.
  continua(age) {
    if (age < 0) return;
    const a = smooth(range(age, 0, 0.3));
    const g = this.g;
    g.save();
    g.globalAlpha = a;
    g.translate(VW - 380, VH - 200);
    g.rotate(-0.06);
    g.fillStyle = '#fff';
    g.fillRect(-250, -60, 520, 120);
    g.strokeStyle = '#111';
    g.lineWidth = 8;
    g.strokeRect(-250, -60, 520, 120);
    g.fillStyle = '#d0101e';
    g.beginPath();
    g.moveTo(230, -40);
    g.lineTo(290, 0);
    g.lineTo(230, 40);
    g.fill();
    g.restore();
    this.text('Continua...', VW - 400, VH - 205, { size: 64, color: '#111', alpha: a, font: FONT, weight: 900 });
  }
}
