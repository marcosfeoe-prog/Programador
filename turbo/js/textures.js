// Texturas procedurais desenhadas em canvas (nenhuma imagem externa).
import * as THREE from 'three';
import { hash3, tileNoise, clamp } from './util.js';

const cache = new Map();
let maxAniso = 4;

export function setAnisotropy(n) {
  maxAniso = n;
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTex(c, { repeat = true, srgb = true, mip = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  if (!mip) {
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
  }
  return t;
}

function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

function shade(hex, f) {
  const c = new THREE.Color(hex);
  if (f >= 1) c.lerp(new THREE.Color(1, 1, 1), f - 1);
  else c.multiplyScalar(f);
  return '#' + c.getHexString();
}

// Ruído granulado sobre uma área (asfalto, pedra...).
function speckle(ctx, x0, y0, w, h, amount, seed, dark = 0.5, light = 0.5) {
  const img = ctx.getImageData(x0, y0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const n = tileNoise(x / w, y / h, 16, 32, 3, seed) * 0.6 + (hash3(x, y, seed) - 0.5) * 0.9;
      const k = 1 + n * amount * (n < 0 ? dark * 2 : light * 2);
      d[i] = clamp(d[i] * k, 0, 255);
      d[i + 1] = clamp(d[i + 1] * k, 0, 255);
      d[i + 2] = clamp(d[i + 2] * k, 0, 255);
    }
  }
  ctx.putImageData(img, x0, y0);
}

// Pista: u = largura (zebras nas bordas), v = comprimento (repete a cada 8 m).
export function roadTexture(world) {
  return cached('road-' + world.id, () => {
    const W = 256;
    const H = 512;
    const c = canvas(W, H);
    const ctx = c.getContext('2d');
    ctx.fillStyle = world.road;
    ctx.fillRect(0, 0, W, H);
    speckle(ctx, 0, 0, W, H, 0.22, 7);
    // marcas de pneu suaves
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = '#000';
    for (const x of [0.3, 0.37, 0.63, 0.7]) ctx.fillRect(x * W - 6, 0, 12, H);
    ctx.globalAlpha = 1;
    // faixas tracejadas (3 pistas)
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const x of [1 / 3, 2 / 3]) {
      ctx.fillRect(x * W - 2.5, 0, 5, H * 0.32);
      ctx.fillRect(x * W - 2.5, H * 0.5, 5, H * 0.32);
    }
    // zebras
    const kw = Math.round(W * 0.075);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? world.kerbB : world.kerbA;
      ctx.fillRect(0, (i * H) / 4, kw, H / 4);
      ctx.fillRect(W - kw, (i * H) / 4, kw, H / 4);
    }
    // sombra da zebra e linha branca de borda
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(kw, 0, 3, H);
    ctx.fillRect(W - kw - 3, 0, 3, H);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(kw + 5, 0, 4, H);
    ctx.fillRect(W - kw - 9, 0, 4, H);
    return toTex(c);
  });
}

// Lateral da pista (a "laje" flutuante): faixa clara em cima, cor do mundo e
// listras discretas.
export function sideTexture(world) {
  return cached('side-' + world.id, () => {
    const W = 128;
    const H = 64;
    const c = canvas(W, H);
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, shade(world.side, 1.18));
    g.addColorStop(0.5, world.side);
    g.addColorStop(1, shade(world.side, 0.72));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(0, 0, W, 5);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let x = 0; x < W; x += 32) ctx.fillRect(x, 8, 2, H - 8);
    speckle(ctx, 0, 0, W, H, 0.08, 3);
    return toTex(c);
  });
}

export function underTexture(world) {
  return cached('under-' + world.id, () => {
    const c = canvas(64, 64);
    const ctx = c.getContext('2d');
    ctx.fillStyle = world.under;
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 30, 64, 4);
    ctx.fillRect(30, 0, 4, 64);
    speckle(ctx, 0, 0, 64, 64, 0.1, 9);
    return toTex(c);
  });
}

// Defensa: listras inclinadas na cor do mundo.
export function railTexture(world) {
  return cached('rail-' + world.id, () => {
    const W = 128;
    const H = 32;
    const c = canvas(W, H);
    const ctx = c.getContext('2d');
    ctx.fillStyle = world.rail;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = world.railStripe;
    for (let x = -H; x < W + H; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, H);
      ctx.lineTo(x + 16, H);
      ctx.lineTo(x + 16 + H, 0);
      ctx.lineTo(x + H, 0);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, H - 3, W, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(0, 0, W, 2);
    return toTex(c);
  });
}

// Setas de curva (chevrons) para as defensas externas.
export function chevronTexture(color = '#ffd21a', bg = '#16161c') {
  return cached('chev-' + color + bg, () => {
    const W = 128;
    const H = 64;
    const c = canvas(W, H);
    const ctx = c.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = color;
    for (let k = 0; k < 2; k++) {
      const x0 = k * 64 + 14;
      ctx.beginPath();
      ctx.moveTo(x0, 8);
      ctx.lineTo(x0 + 18, 8);
      ctx.lineTo(x0 + 40, 32);
      ctx.lineTo(x0 + 18, 56);
      ctx.lineTo(x0, 56);
      ctx.lineTo(x0 + 22, 32);
      ctx.fill();
    }
    return toTex(c);
  });
}

export function checkerTexture(n = 8) {
  return cached('checker' + n, () => {
    const S = 256;
    const c = canvas(S, S);
    const ctx = c.getContext('2d');
    const q = S / n;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        ctx.fillStyle = (x + y) % 2 ? '#111' : '#f6f6f6';
        ctx.fillRect(x * q, y * q, q, q);
      }
    const t = toTex(c);
    t.magFilter = THREE.NearestFilter;
    return t;
  });
}

// Faixa do pórtico: texto grande com bordas quadriculadas.
export function bannerTexture(text, bg = '#16161c', fg = '#ffffff') {
  return cached('banner-' + text + bg, () => {
    const W = 1024;
    const H = 128;
    const c = canvas(W, H);
    const ctx = c.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const q = 16;
    for (let x = 0; x < W / q; x++)
      for (let y = 0; y < 2; y++) {
        ctx.fillStyle = (x + y) % 2 ? '#111' : '#fff';
        ctx.fillRect(x * q, y * q, q, q);
        ctx.fillRect(x * q, H - (y + 1) * q, q, q);
      }
    ctx.font = 'italic 900 64px "Arial Black", Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = fg;
    ctx.fillText(text, W / 2, H / 2 + 2);
    return toTex(c, { repeat: false });
  });
}

// Placa de turbo: setas brilhantes (a animação é feita deslocando o offset).
export function boostTexture() {
  return cached('boost', () => {
    const W = 128;
    const H = 256;
    const c = canvas(W, H);
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, '#0a3cff');
    g.addColorStop(0.5, '#1ad8ff');
    g.addColorStop(1, '#0a3cff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    for (let k = 0; k < 2; k++) {
      const y0 = k * 128 + 24;
      ctx.beginPath();
      ctx.moveTo(14, y0 + 70);
      ctx.lineTo(64, y0 + 18);
      ctx.lineTo(114, y0 + 70);
      ctx.lineTo(114, y0 + 96);
      ctx.lineTo(64, y0 + 44);
      ctx.lineTo(14, y0 + 96);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, -10, W - 6, H + 20);
    return toTex(c);
  });
}

export function hazardTexture() {
  return cached('hazard', () => {
    const S = 128;
    const c = canvas(S, S);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffcc12';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#18181c';
    for (let x = -S; x < S * 2; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, S);
      ctx.lineTo(x + 24, S);
      ctx.lineTo(x + 24 + S, 0);
      ctx.lineTo(x + S, 0);
      ctx.fill();
    }
    speckle(ctx, 0, 0, S, S, 0.06, 4);
    return toTex(c);
  });
}

export function crateTexture() {
  return cached('crate', () => {
    const S = 128;
    const c = canvas(S, S);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#c98a3e';
    ctx.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 32) {
      ctx.fillStyle = y % 64 ? '#b57934' : '#d29546';
      ctx.fillRect(0, y, S, 30);
    }
    ctx.strokeStyle = '#7a4c1e';
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, S - 12, S - 12);
    ctx.beginPath();
    ctx.moveTo(10, 10);
    ctx.lineTo(S - 10, S - 10);
    ctx.stroke();
    speckle(ctx, 0, 0, S, S, 0.12, 5);
    return toTex(c);
  });
}

// Aro da roda (desenhado de frente, fundo transparente entre os raios para
// aparecer o disco de freio). style: cinco, malha, turbina, estrela, disco, raios.
export function rimTexture(style, color) {
  return cached('rim2-' + style + color, () => {
    const S = 256;
    const c = canvas(S, S);
    const ctx = c.getContext('2d');
    const cx = S / 2;
    ctx.save();
    ctx.translate(cx, cx);
    // aba externa
    const lip = ctx.createRadialGradient(0, 0, 100, 0, 0, 127);
    lip.addColorStop(0, shade(color, 0.55));
    lip.addColorStop(0.45, shade(color, 1.25));
    lip.addColorStop(0.75, shade(color, 0.85));
    lip.addColorStop(1, shade(color, 0.5));
    ctx.strokeStyle = lip;
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.arc(0, 0, 115, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    const spokes = (n, w0, w1, r0 = 20, r1 = 106) => {
      for (let i = 0; i < n; i++) {
        ctx.save();
        ctx.rotate((i / n) * Math.PI * 2);
        ctx.beginPath();
        ctx.moveTo(-w0, r0);
        ctx.lineTo(-w1, r1);
        ctx.lineTo(w1, r1);
        ctx.lineTo(w0, r0);
        ctx.fill();
        ctx.restore();
      }
    };
    if (style === 'cinco') {
      spokes(5, 13, 20);
      ctx.fillStyle = shade(color, 0.6);
      spokes(5, 3, 4, 26, 100);
      ctx.fillStyle = color;
    } else if (style === 'raios') {
      spokes(14, 3, 6);
    } else if (style === 'estrela') {
      spokes(6, 16, 5);
      spokes(12, 2.5, 2.5, 64, 106);
    } else if (style === 'malha') {
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      for (let i = 0; i < 10; i++) {
        ctx.save();
        ctx.rotate((i / 10) * Math.PI * 2);
        for (const sg of [1, -1]) {
          ctx.beginPath();
          ctx.moveTo(0, 22);
          ctx.quadraticCurveTo(sg * 38, 62, 0, 104);
          ctx.stroke();
        }
        ctx.restore();
      }
    } else if (style === 'turbina') {
      for (let i = 0; i < 10; i++) {
        ctx.save();
        ctx.rotate((i / 10) * Math.PI * 2);
        ctx.beginPath();
        ctx.moveTo(-4, 20);
        ctx.quadraticCurveTo(34, 40, 30, 106);
        ctx.lineTo(12, 106);
        ctx.quadraticCurveTo(18, 50, -12, 22);
        ctx.fill();
        ctx.restore();
      }
    } else if (style === 'disco') {
      ctx.beginPath();
      ctx.arc(0, 0, 106, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 66, Math.sin(a) * 66, 15, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    // cubo com porcas
    const hub = ctx.createRadialGradient(-6, -6, 2, 0, 0, 28);
    hub.addColorStop(0, '#ffffff');
    hub.addColorStop(1, shade(color, 0.7));
    ctx.fillStyle = hub;
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a2c30';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 15, Math.sin(a) * 15, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = shade(color, 0.5);
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    // brilho só onde já há metal
    ctx.globalCompositeOperation = 'source-atop';
    const sh = ctx.createLinearGradient(-128, -128, 128, 128);
    sh.addColorStop(0, 'rgba(255,255,255,0.35)');
    sh.addColorStop(0.45, 'rgba(255,255,255,0)');
    sh.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = sh;
    ctx.fillRect(-128, -128, 256, 256);
    ctx.restore();
    return toTex(c, { repeat: false });
  });
}

// Disco de freio ventilado com furos.
export function brakeTexture() {
  return cached('brake', () => {
    const S = 128;
    const c = canvas(S, S);
    const ctx = c.getContext('2d');
    ctx.translate(S / 2, S / 2);
    const g = ctx.createRadialGradient(0, 0, 18, 0, 0, 64);
    g.addColorStop(0, '#3a3c40');
    g.addColorStop(0.3, '#9aa0a8');
    g.addColorStop(0.95, '#7a8088');
    g.addColorStop(1, '#55595e');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 63, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a2c30';
    for (let r = 0; r < 3; r++)
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + r * 0.26;
        const d = 30 + r * 10;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * d, Math.sin(a) * d, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    ctx.fillStyle = '#26282c';
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fill();
    return toTex(c, { repeat: false });
  });
}

// Pneu: banda de rodagem com sulcos (u = volta, v = perfil do pneu).
export function tireTexture() {
  return cached('tire2', () => {
    const W = 512;
    const H = 64;
    const c = canvas(W, H);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1e1f22';
    ctx.fillRect(0, 0, W, H);
    // flancos lisos nas pontas do perfil, sulcos no meio
    ctx.fillStyle = '#26272b';
    ctx.fillRect(0, 0, W, 14);
    ctx.fillRect(0, H - 14, W, 14);
    ctx.fillStyle = '#0f1012';
    for (let x = 0; x < W; x += 16) {
      ctx.save();
      ctx.translate(x, H / 2);
      ctx.transform(1, 0, 0.6, 1, 0, 0);
      ctx.fillRect(-2, -16, 5, 13);
      ctx.restore();
      ctx.save();
      ctx.translate(x + 8, H / 2);
      ctx.transform(1, 0, -0.6, 1, 0, 0);
      ctx.fillRect(-2, 3, 5, 13);
      ctx.restore();
    }
    ctx.fillRect(0, H / 2 - 1, W, 2);
    return toTex(c);
  });
}

// Mancha radial suave (brilho, neon sob o carro, partículas, sol).
export function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  return cached('glow' + inner + outer, () => {
    const S = 128;
    const c = canvas(S, S);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, inner);
    g.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.55)'));
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    return toTex(c, { repeat: false });
  });
}

export function cloudTexture(seed = 1) {
  return cached('cloud' + seed, () => {
    const S = 256;
    const c = canvas(S, S);
    const ctx = c.getContext('2d');
    let r = seed * 13.7;
    const rnd = () => {
      r = (r * 9301 + 49297) % 233280;
      return r / 233280;
    };
    for (let i = 0; i < 22; i++) {
      const x = S * (0.22 + rnd() * 0.56);
      const y = S * (0.42 + rnd() * 0.22);
      const rad = S * (0.1 + rnd() * 0.16);
      const g = ctx.createRadialGradient(x, y - rad * 0.2, 0, x, y, rad);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.6, 'rgba(250,252,255,0.6)');
      g.addColorStop(1, 'rgba(240,246,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    // base levemente sombreada
    const img = ctx.getImageData(0, 0, S, S);
    for (let y = 0; y < S; y++) {
      const k = 1 - clamp((y / S - 0.5) * 0.9, 0, 0.3);
      for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4;
        img.data[i] *= k;
        img.data[i + 1] *= k;
        img.data[i + 2] *= k * 1.02;
      }
    }
    ctx.putImageData(img, 0, 0);
    return toTex(c, { repeat: false });
  });
}

// Janelas de prédio (cor = emissivo à noite).
export function windowsTexture(seed = 1, lit = '#ffd98a', wall = '#20222c') {
  return cached('win' + seed + lit + wall, () => {
    const W = 128;
    const H = 256;
    const c = canvas(W, H);
    const ctx = c.getContext('2d');
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, W, H);
    const cols = 4;
    const rows = 16;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const on = hash3(x, y, seed) < 0.45;
        ctx.fillStyle = on ? lit : 'rgba(255,255,255,0.06)';
        ctx.fillRect(x * (W / cols) + 6, y * (H / rows) + 4, W / cols - 12, H / rows - 7);
      }
    return toTex(c);
  });
}

// Camadas de rocha (cânion) — usado como mapa de cor vertical.
export function strataTexture(seed = 2) {
  return cached('strata' + seed, () => {
    const W = 64;
    const H = 256;
    const c = canvas(W, H);
    const ctx = c.getContext('2d');
    const cols = ['#c8642e', '#d98446', '#b4502a', '#e3a462', '#a8452a', '#d0763a', '#e8b878', '#bf5c30'];
    let y = 0;
    let i = 0;
    while (y < H) {
      const h = 6 + hash3(i, seed, 3) * 26;
      ctx.fillStyle = cols[Math.floor(hash3(i, seed, 9) * cols.length)];
      ctx.fillRect(0, y, W, h + 1);
      y += h;
      i++;
    }
    speckle(ctx, 0, 0, W, H, 0.14, seed);
    return toTex(c);
  });
}

export function groundTexture(kind) {
  return cached('ground-' + kind, () => {
    const S = 256;
    const c = canvas(S, S);
    const ctx = c.getContext('2d');
    const base = { sand: '#e8b77a', snow: '#eef4fb', basalt: '#2b2524', grass: '#5fbf4a', desert: '#d99a5a' }[kind] || '#888';
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, S, S);
    speckle(ctx, 0, 0, S, S, kind === 'snow' ? 0.05 : 0.18, 11);
    if (kind === 'basalt') {
      ctx.strokeStyle = 'rgba(255,90,20,0.55)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 18; i++) {
        let x = hash3(i, 1, 2) * S;
        let y = hash3(i, 2, 2) * S;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let k = 0; k < 5; k++) {
          x += (hash3(i, k, 5) - 0.5) * 50;
          y += (hash3(i, k, 6) - 0.5) * 50;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    return toTex(c);
  });
}

// Plaquinha de colocação acima dos carros.
export function tagCanvas() {
  return canvas(256, 128);
}

export function drawTag(c, pos, name, color) {
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  // haste
  ctx.fillStyle = 'rgba(20,24,40,0.9)';
  ctx.fillRect(40, 70, 6, 58);
  // bandeira
  ctx.beginPath();
  ctx.moveTo(40, 8);
  ctx.lineTo(220, 8);
  ctx.lineTo(200, 74);
  ctx.lineTo(40, 74);
  ctx.closePath();
  ctx.fillStyle = 'rgba(22,28,52,0.92)';
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillRect(40, 8, 10, 66);
  ctx.font = 'italic 900 46px "Arial Black", Impact, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(pos, 60, 43);
  ctx.font = 'italic 700 22px Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText(name, 128, 45);
}

export function clearTextureCache() {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
