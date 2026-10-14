// Nível 23 — texturas procedurais: madeira petrificada, musgo do chão, atlas de
// samambaia/capim, musgo pendente e um brilho radial para halos e poças de luz.
import { registerTexture, TEX, textCanvasTex } from '../textures.js';
import { mulberry32 } from '../util.js';

const sm = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Madeira petrificada: fibras de pedra ao longo do tronco (v), fraturas
// transversais (os troncos fossilizados racham em gomos) e manchas de líquen.
registerTexture('l23Bark', (S) => {
  const fib = TEX.noiseField(S, S, 40, 2, 3, 2301);
  const fib2 = TEX.noiseField(S, S, 96, 6, 2, 2302);
  const big = TEX.noiseField(S, S, 3, 3, 4, 2303);
  const lich = TEX.noiseField(S, S, 6, 6, 4, 2304);
  const fine = TEX.whiteNoise(S * S, 2305);
  const rnd = mulberry32(2306);
  const cracks = [rnd() * S, rnd() * S, rnd() * S];
  const hf = new Float32Array(S * S);
  const cv = TEX.paintRGB(S, S, (x, y, i, o) => {
    const f = 1 - Math.abs(fib[i]) * 2.4;
    let h = 0.5 + Math.max(f, -0.4) * 0.3 + fib2[i] * 0.12 + fine[i] * 0.03;
    // fraturas transversais irregulares
    let cr = 0;
    for (const c of cracks) {
      let d = Math.abs(y - c - big[(i + S * 7) % (S * S)] * S * 0.05 - fib[i] * S * 0.006);
      d = Math.min(d, S - d);
      cr = Math.max(cr, 1 - sm(0, S / 220 + 0.6, d));
    }
    h -= cr * 0.55;
    const L = sm(0.3, 0.5, lich[i] + fib2[i] * 0.12);
    hf[i] = h + L * 0.08;
    const k = (0.62 + h * 0.55) * (0.9 + big[i] * 0.16);
    // pedra cinza com reflexo esverdeado; líquen pálido nas cristas
    let r = 0.44 * k;
    let g = 0.45 * k;
    let b = 0.4 * k;
    r += (0.56 - r) * L * 0.5;
    g += (0.58 - g) * L * 0.5;
    b += (0.47 - b) * L * 0.5;
    o[0] = r;
    o[1] = g;
    o[2] = b;
  });
  return { map: TEX.toTex(cv), normalMap: TEX.normalMap(hf, S, S, 3) };
});

// Cerne do tronco oco (parede interna do abrigo): fibras de madeira escura.
registerTexture('l23Heart', (S) => {
  const fib = TEX.noiseField(S, S, 36, 3, 3, 2341);
  const fib2 = TEX.noiseField(S, S, 90, 8, 2, 2342);
  const low = TEX.noiseField(S, S, 3, 3, 3, 2343);
  const fine = TEX.whiteNoise(S * S, 2344);
  const hf = new Float32Array(S * S);
  const cv = TEX.paintRGB(S, S, (x, y, i, o) => {
    const f = 1 - Math.abs(fib[i]) * 2.2;
    const h = 0.55 + Math.max(f, -0.3) * 0.3 + fib2[i] * 0.14 + fine[i] * 0.03;
    hf[i] = h;
    const k = (0.55 + h * 0.5) * (0.9 + low[i] * 0.2);
    o[0] = 0.52 * k;
    o[1] = 0.4 * k;
    o[2] = 0.28 * k;
  });
  return { map: TEX.toTex(cv), normalMap: TEX.normalMap(hf, S, S, 2) };
});

// Musgo e serrapilheira do chão: verde-oliva manchado, folhas secas e terra.
registerTexture('l23Moss', (S) => {
  const a = TEX.noiseField(S, S, 6, 6, 5, 2311);
  const b = TEX.noiseField(S, S, 24, 24, 3, 2312);
  const c = TEX.noiseField(S, S, 64, 64, 2, 2313);
  const fine = TEX.whiteNoise(S * S, 2314);
  const hf = new Float32Array(S * S);
  const cv = TEX.paintRGB(S, S, (x, y, i, o) => {
    const tuft = 0.5 + c[i] * 0.5 + fine[i] * 0.12;
    const k = 0.55 + a[i] * 0.25 + b[i] * 0.15 + tuft * 0.35;
    const dry = sm(0.15, 0.45, b[i] + a[i] * 0.4);
    o[0] = (0.2 + dry * 0.12) * k;
    o[1] = (0.26 + dry * 0.05) * k;
    o[2] = (0.11 + dry * 0.03) * k;
    hf[i] = tuft * 0.6 + b[i] * 0.3;
  });
  return { map: TEX.toTex(cv), normalMap: TEX.normalMap(hf, S, S, 2) };
});

// Atlas de vegetação (com transparência): metade esquerda uma fronde de
// samambaia, metade direita um tufo de capim.
registerTexture('l23Plants', (S) => {
  const W = S * 2;
  const H = S;
  const cv = TEX.makeCanvas(W, H);
  const c = cv.getContext('2d');
  const rnd = mulberry32(2321);
  // fronde: ráquis curva com folíolos que diminuem até a ponta
  const cx = S / 2;
  const seg = 26;
  const pts = [];
  for (let k = 0; k <= seg; k++) {
    const t = k / seg;
    pts.push([cx + Math.sin(t * 2.2) * S * 0.04, H - t * H * 0.97]);
  }
  for (let k = 1; k < seg; k++) {
    const t = k / seg;
    const [x, y] = pts[k];
    const len = S * 0.42 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.92) * (1 - t * 0.35);
    for (const s of [-1, 1]) {
      const g = 70 + rnd() * 40;
      c.fillStyle = `rgb(${(g * 0.55) | 0},${g | 0},${(g * 0.32) | 0})`;
      c.beginPath();
      c.moveTo(x, y);
      const ex = x + s * len;
      const ey = y - len * 0.32;
      c.quadraticCurveTo(x + s * len * 0.5, y - len * 0.42, ex, ey);
      c.quadraticCurveTo(x + s * len * 0.55, y + len * 0.04, x, y + (H / seg) * 0.9);
      c.fill();
    }
  }
  c.strokeStyle = 'rgb(58,70,30)';
  c.lineWidth = Math.max(1, S / 110);
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts) c.lineTo(p[0], p[1]);
  c.stroke();
  // capim: lâminas finas curvadas
  for (let k = 0; k < 46; k++) {
    const x0 = S + S * (0.25 + rnd() * 0.5);
    const h = H * (0.45 + rnd() * 0.55);
    const lean = (rnd() - 0.5) * S * 0.5;
    const w = S * (0.012 + rnd() * 0.012);
    const g = 60 + rnd() * 60;
    c.fillStyle = `rgb(${(g * 0.75) | 0},${(g * 0.85) | 0},${(g * 0.4) | 0})`;
    c.beginPath();
    c.moveTo(x0 - w, H);
    c.quadraticCurveTo(x0 + lean * 0.3, H - h * 0.6, x0 + lean, H - h);
    c.quadraticCurveTo(x0 + lean * 0.3 + w, H - h * 0.6, x0 + w, H);
    c.fill();
  }
  return { map: TEX.toTex(cv, { repeat: false }) };
});

// Musgo pendente ("barba-de-velho"): fios verticais de comprimentos diferentes.
registerTexture('l23Drape', (S) => {
  const W = S / 2;
  const H = S;
  const cv = TEX.makeCanvas(W, H);
  const c = cv.getContext('2d');
  const rnd = mulberry32(2331);
  for (let k = 0; k < 34; k++) {
    const x = W * (0.08 + rnd() * 0.84);
    const len = H * (0.2 + rnd() * 0.8) * (1 - Math.abs(x / W - 0.5) * 0.8);
    const g = 120 + rnd() * 70;
    c.strokeStyle = `rgba(${(g * 0.86) | 0},${(g * 0.92) | 0},${(g * 0.74) | 0},1)`;
    c.lineWidth = Math.max(1, W * (0.006 + rnd() * 0.008));
    c.beginPath();
    c.moveTo(x, 0);
    let px = x;
    for (let y = 0; y < len; y += H / 30) {
      px += (rnd() - 0.5) * W * 0.04;
      c.lineTo(px, y);
      // fiapos laterais
      if (rnd() < 0.25) {
        c.moveTo(px, y);
        c.lineTo(px + (rnd() - 0.5) * W * 0.08, y + H * 0.03);
        c.moveTo(px, y);
      }
    }
    c.stroke();
  }
  return { map: TEX.toTex(cv, { repeat: false }) };
});

// Brilho radial (halo da janela, poças de luz, esporos).
export function glowTex() {
  return textCanvasTex(128, 128, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.5)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  });
}
