// Fotos de polaroide desenhadas proceduralmente (lembranças de infância), com cara de
// foto antiga: superexposição, tom rosado, vinheta, grão e legenda escrita à mão.

const S = 228;

function grad(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}
function sky(ctx, top, bottom, h = S) {
  ctx.fillStyle = grad(ctx, 0, 0, 0, h, [[0, top], [1, bottom]]);
  ctx.fillRect(0, 0, S, h);
}
function circle(ctx, x, y, r, c) {
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
function cloud(ctx, x, y, s, c = 'rgba(255,255,255,0.9)') {
  ctx.fillStyle = c;
  for (const [dx, dy, r] of [[0, 0, 14], [14, -6, 16], [30, 0, 13], [16, 6, 14], [-12, 4, 10]]) {
    ctx.beginPath();
    ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
    ctx.fill();
  }
}
function soft(ctx, x, y, r, c) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, c);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

const THEMES = {
  tv(ctx) {
    ctx.fillStyle = '#6d4c5a';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#b5838f';
    ctx.fillRect(0, 150, S, 78);
    ctx.fillStyle = '#3b2a30';
    ctx.fillRect(48, 60, 132, 104);
    ctx.fillStyle = '#9fd6ff';
    ctx.fillRect(60, 70, 96, 76);
    circle(ctx, 86, 96, 14, '#ffe36e');
    ctx.fillStyle = '#7bd389';
    ctx.fillRect(60, 126, 96, 20);
    circle(ctx, 168, 90, 5, '#c9b0b8');
    circle(ctx, 168, 108, 5, '#c9b0b8');
    soft(ctx, 108, 108, 90, 'rgba(160,220,255,0.35)');
    ctx.fillStyle = 'rgba(40,20,30,0.6)';
    ctx.beginPath();
    ctx.ellipse(110, 214, 30, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    circle(ctx, 110, 186, 15, 'rgba(40,20,30,0.6)');
  },
  swing(ctx) {
    sky(ctx, '#9fc4ff', '#ffe0ec', 150);
    ctx.fillStyle = '#7fae6a';
    ctx.fillRect(0, 150, S, 78);
    ctx.fillStyle = '#4e3a32';
    ctx.fillRect(150, 30, 14, 130);
    circle(ctx, 160, 40, 56, '#5f8f55');
    circle(ctx, 120, 55, 40, '#6e9e60');
    ctx.strokeStyle = '#3d2c26';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(118, 70);
    ctx.lineTo(92, 160);
    ctx.moveTo(140, 70);
    ctx.lineTo(118, 162);
    ctx.stroke();
    ctx.fillStyle = '#e88fb4';
    ctx.save();
    ctx.translate(105, 162);
    ctx.rotate(0.2);
    ctx.fillRect(-18, -4, 36, 8);
    ctx.restore();
    cloud(ctx, 40, 50, 1);
  },
  cake(ctx) {
    ctx.fillStyle = '#2a1820';
    ctx.fillRect(0, 0, S, S);
    soft(ctx, 114, 110, 130, 'rgba(255,190,120,0.55)');
    ctx.fillStyle = '#f5d7e2';
    ctx.beginPath();
    ctx.ellipse(114, 170, 70, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffc1d6';
    ctx.fillRect(56, 120, 116, 50);
    ctx.fillStyle = '#ffd9e6';
    ctx.beginPath();
    ctx.ellipse(114, 120, 58, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 7; i++) {
      const x = 76 + i * 12.5;
      ctx.fillStyle = ['#8fd3ff', '#ffe36e', '#b9f2a1'][i % 3];
      ctx.fillRect(x - 2, 96, 4, 22);
      soft(ctx, x, 88, 14, 'rgba(255,220,140,0.9)');
      circle(ctx, x, 90, 3, '#fff6d0');
    }
  },
  beach(ctx) {
    sky(ctx, '#7fc2ff', '#cfeaff', 110);
    ctx.fillStyle = '#4aa6d8';
    ctx.fillRect(0, 100, S, 40);
    ctx.fillStyle = '#ffe9c4';
    ctx.fillRect(0, 138, S, 90);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(0, 136, S, 4);
    circle(ctx, 180, 40, 18, '#fff8d8');
    ctx.fillStyle = '#d9d9d9';
    ctx.fillRect(84, 100, 4, 90);
    ctx.fillStyle = '#ff7aa8';
    ctx.beginPath();
    ctx.moveTo(30, 108);
    ctx.quadraticCurveTo(86, 50, 142, 108);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(62, 100);
    ctx.quadraticCurveTo(86, 64, 96, 100);
    ctx.fill();
  },
  car(ctx) {
    ctx.fillStyle = '#3a2f3a';
    ctx.fillRect(0, 0, S, S);
    sky(ctx, '#ffb3c8', '#ffe2c8', 140);
    ctx.fillStyle = '#9e8fae';
    ctx.beginPath();
    ctx.moveTo(0, 140);
    ctx.lineTo(80, 108);
    ctx.lineTo(150, 112);
    ctx.lineTo(228, 140);
    ctx.fill();
    ctx.fillStyle = '#6f8f6a';
    ctx.fillRect(0, 130, S, 30);
    ctx.fillStyle = '#3a2f3a';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(228, 0);
    ctx.lineTo(228, 30);
    ctx.quadraticCurveTo(120, 18, 10, 40);
    ctx.lineTo(0, 160);
    ctx.lineTo(0, 0);
    ctx.fill();
    ctx.fillRect(0, 160, S, 68);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(20, 40, 200, 4);
  },
  icecream(ctx) {
    sky(ctx, '#bfe6ff', '#fff3f8');
    ctx.fillStyle = '#e8b980';
    ctx.beginPath();
    ctx.moveTo(84, 120);
    ctx.lineTo(144, 120);
    ctx.lineTo(114, 210);
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,100,60,0.5)';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(84 + i * 10, 120);
      ctx.lineTo(114, 210);
      ctx.stroke();
    }
    circle(ctx, 114, 100, 34, '#ff9ec4');
    circle(ctx, 96, 112, 14, '#ff9ec4');
    circle(ctx, 134, 114, 13, '#ff9ec4');
    circle(ctx, 104, 88, 8, '#ffd0e2');
    ctx.fillStyle = '#ff9ec4';
    ctx.beginPath();
    ctx.ellipse(132, 140, 5, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  cat(ctx) {
    sky(ctx, '#ffd0dc', '#fff4e6');
    ctx.fillStyle = '#e9d8cc';
    ctx.fillRect(0, 0, 30, S);
    ctx.fillRect(198, 0, 30, S);
    ctx.fillRect(0, 168, S, 60);
    ctx.fillStyle = '#d6c2b6';
    ctx.fillRect(0, 164, S, 8);
    ctx.fillStyle = '#4a3a40';
    ctx.beginPath();
    ctx.ellipse(118, 140, 34, 28, 0, 0, Math.PI * 2);
    ctx.fill();
    circle(ctx, 118, 104, 20, '#4a3a40');
    ctx.beginPath();
    ctx.moveTo(102, 96);
    ctx.lineTo(104, 76);
    ctx.lineTo(114, 90);
    ctx.moveTo(122, 90);
    ctx.lineTo(132, 76);
    ctx.lineTo(134, 96);
    ctx.fill();
    ctx.strokeStyle = '#4a3a40';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(150, 156);
    ctx.quadraticCurveTo(180, 160, 172, 128);
    ctx.stroke();
    soft(ctx, 160, 40, 60, 'rgba(255,255,230,0.8)');
  },
  fort(ctx) {
    ctx.fillStyle = '#2b2033';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#f2c7d8';
    ctx.beginPath();
    ctx.moveTo(10, 200);
    ctx.lineTo(114, 50);
    ctx.lineTo(218, 200);
    ctx.fill();
    ctx.fillStyle = '#c99ab0';
    ctx.beginPath();
    ctx.moveTo(84, 200);
    ctx.lineTo(114, 120);
    ctx.lineTo(144, 200);
    ctx.fill();
    soft(ctx, 114, 170, 40, 'rgba(255,220,150,0.8)');
    for (let i = 0; i < 14; i++) {
      const x = 20 + i * 14, y = 40 + Math.sin(i * 0.8) * 10;
      soft(ctx, x, y, 9, 'rgba(255,230,160,0.9)');
      circle(ctx, x, y, 2, '#fff3c8');
    }
  },
  stars(ctx) {
    ctx.fillStyle = '#1e1a3a';
    ctx.fillRect(0, 0, S, S);
    const r = (i) => (Math.sin(i * 91.7) * 43758.5) % 1;
    for (let i = 0; i < 26; i++) {
      const x = Math.abs(r(i)) * S, y = Math.abs(r(i + 50)) * S * 0.8;
      soft(ctx, x, y, 12, 'rgba(190,255,200,0.6)');
      ctx.fillStyle = '#d8ffe0';
      ctx.save();
      ctx.translate(x, y);
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2, rr = k % 2 ? 2.5 : 6;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.fill();
      ctx.restore();
    }
    circle(ctx, 170, 60, 16, '#e8ffe9');
    circle(ctx, 177, 55, 14, '#1e1a3a');
  },
  bike(ctx) {
    sky(ctx, '#a8d0ff', '#fff0f6', 130);
    ctx.fillStyle = '#86b874';
    ctx.fillRect(0, 128, S, 100);
    ctx.strokeStyle = '#3a6ad0';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(70, 168, 28, 0, Math.PI * 2);
    ctx.arc(160, 168, 28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(70, 168);
    ctx.lineTo(108, 132);
    ctx.lineTo(160, 168);
    ctx.moveTo(108, 132);
    ctx.lineTo(112, 168);
    ctx.lineTo(70, 168);
    ctx.moveTo(108, 132);
    ctx.lineTo(150, 128);
    ctx.lineTo(160, 168);
    ctx.moveTo(150, 128);
    ctx.lineTo(146, 112);
    ctx.stroke();
    ctx.fillStyle = '#2c2c34';
    ctx.fillRect(98, 124, 22, 6);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(136, 108, 20, 4);
  },
  grandma(ctx) {
    ctx.fillStyle = '#f3e1c8';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#b8e0ff';
    ctx.fillRect(120, 30, 80, 70);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.strokeRect(120, 30, 80, 70);
    ctx.beginPath();
    ctx.moveTo(160, 30);
    ctx.lineTo(160, 100);
    ctx.stroke();
    ctx.fillStyle = '#e48aa8';
    ctx.fillRect(0, 140, S, 88);
    ctx.fillStyle = '#ffffff';
    for (let x = 0; x < S; x += 24) for (let y = 140; y < S; y += 24) if (((x + y) / 24) % 2 < 1) ctx.fillRect(x, y, 12, 12);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(70, 112, 34, 32);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(106, 126, 8, -1.2, 1.2);
    ctx.stroke();
    ctx.fillStyle = '#6b4632';
    ctx.fillRect(74, 114, 26, 6);
    for (let i = 0; i < 3; i++) soft(ctx, 82 + i * 6, 96 - i * 12, 10, 'rgba(255,255,255,0.5)');
  },
  night(ctx) {
    ctx.fillStyle = '#141024';
    ctx.fillRect(0, 0, S, S);
    const cols = ['rgba(255,180,90,0.8)', 'rgba(255,120,180,0.7)', 'rgba(140,180,255,0.7)'];
    for (let i = 0; i < 18; i++) {
      const x = (i * 53) % S, y = 40 + ((i * 37) % 120);
      soft(ctx, x, y, 12 + (i % 4) * 6, cols[i % 3]);
    }
    ctx.fillStyle = '#0a0812';
    ctx.fillRect(0, 170, S, 58);
    ctx.fillRect(0, 0, S, 22);
  },
  sunset(ctx) {
    sky(ctx, '#7f86d8', '#ffb38a', 150);
    soft(ctx, 114, 150, 80, 'rgba(255,200,140,0.9)');
    circle(ctx, 114, 148, 18, '#fff1c8');
    ctx.fillStyle = '#c2a66e';
    ctx.fillRect(0, 148, S, 80);
    ctx.strokeStyle = 'rgba(120,90,60,0.6)';
    for (let i = 0; i < 80; i++) {
      const x = (i * 29) % S, y = 150 + ((i * 17) % 78);
      ctx.beginPath();
      ctx.moveTo(x, y + 10);
      ctx.lineTo(x + 2, y);
      ctx.stroke();
    }
    cloud(ctx, 40, 60, 1.2, 'rgba(255,170,200,0.85)');
  },
  flowers(ctx) {
    sky(ctx, '#ffe3ef', '#fff8f0');
    ctx.strokeStyle = '#5f8f55';
    ctx.lineWidth = 3;
    const fl = [[60, 70], [90, 50], [120, 60], [150, 48], [170, 80], [100, 90], [140, 92]];
    for (const [x, y] of fl) {
      ctx.beginPath();
      ctx.moveTo(114, 210);
      ctx.quadraticCurveTo(114, 150, x, y);
      ctx.stroke();
    }
    for (const [x, y] of fl) {
      for (let k = 0; k < 6; k++) circle(ctx, x + Math.cos(k) * 9, y + Math.sin(k) * 9, 7, k % 2 ? '#ff8fbf' : '#ffb3d4');
      circle(ctx, x, y, 5, '#ffe36e');
    }
    ctx.fillStyle = '#f0d8e8';
    ctx.fillRect(98, 170, 32, 40);
  },
  family(ctx) {
    sky(ctx, '#a8d8ff', '#fff6ea', 120);
    ctx.fillStyle = '#8cc078';
    ctx.fillRect(0, 118, S, 110);
    ctx.fillStyle = '#ff9ec4';
    ctx.fillRect(30, 160, 170, 40);
    ctx.fillStyle = '#ffffff';
    for (let x = 30; x < 200; x += 20) ctx.fillRect(x, 160, 10, 40);
    const ppl = [[60, 1], [96, 1.25], [132, 1.15], [166, 0.8]];
    for (const [x, s] of ppl) {
      circle(ctx, x, 120 - 30 * s, 11 * s, 'rgba(70,50,60,0.85)');
      ctx.fillStyle = 'rgba(70,50,60,0.85)';
      ctx.fillRect(x - 12 * s, 128 - 28 * s, 24 * s, 46 * s);
    }
    soft(ctx, 40, 30, 70, 'rgba(255,250,220,0.9)');
  },
};

function photoLook(ctx, seed = 1) {
  // superexposição quente
  const g = ctx.createRadialGradient(S * 0.3, S * 0.25, 0, S * 0.3, S * 0.25, S * 0.9);
  g.addColorStop(0, 'rgba(255,240,230,0.45)');
  g.addColorStop(1, 'rgba(255,240,230,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  // tom rosado e pretos lavados
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = 'rgba(255,150,190,0.45)';
  ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'lighten';
  ctx.fillStyle = 'rgba(60,40,60,1)';
  ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'source-over';
  // vinheta
  const v = ctx.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.75);
  v.addColorStop(0, 'rgba(40,20,30,0)');
  v.addColorStop(1, 'rgba(40,20,30,0.45)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, S, S);
  // grão
  const img = ctx.getImageData(0, 0, S, S);
  const d = img.data;
  let s = seed * 9973;
  for (let i = 0; i < d.length; i += 4) {
    s = (s * 16807) % 2147483647;
    const n = ((s / 2147483647) - 0.5) * 22;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

// Devolve um canvas 256x312 com a polaroide completa (moldura + foto + legenda).
export function drawPolaroid(theme, caption, seed = 1) {
  const pic = document.createElement('canvas');
  pic.width = pic.height = S;
  const pc = pic.getContext('2d');
  (THEMES[theme] || THEMES.sunset)(pc);
  photoLook(pc, seed);
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 312;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f5f1ea';
  ctx.fillRect(0, 0, 256, 312);
  // textura do papel
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(${150 + Math.random() * 60},${140 + Math.random() * 50},${140 + Math.random() * 50},0.07)`;
    ctx.fillRect(Math.random() * 256, Math.random() * 312, 2, 2);
  }
  ctx.filter = 'blur(0.6px)';
  ctx.drawImage(pic, 14, 14);
  ctx.filter = 'none';
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(14, 14, S, 1);
  ctx.save();
  ctx.translate(128, 276);
  ctx.rotate(-0.02);
  ctx.fillStyle = '#4b3f4a';
  ctx.font = 'italic 21px "Fraunces", Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(caption, 0, 0, 228);
  ctx.restore();
  return c;
}

export const THEME_NAMES = Object.keys(THEMES);
