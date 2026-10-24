// Rostos de anime desenhados em canvas: olhos grandes com íris em degradê e
// brilhos, sobrancelhas, boca, rubor, curativo… O desenho é projetado de
// frente sobre a cabeça (decalque), então acompanha a curvatura do rosto.
// Cada expressão é um conjunto de parâmetros; o canvas só é redesenhado
// quando o estado muda.
import * as THREE from 'three';

// Metade da largura (em metros) e centro vertical da área do decalque.
export const FACE_W = 0.13;
export const FACE_CY = -0.03;

export const EXPR = {
  neutral: {},
  angry: { lid: 0.35, brow: 0.55, mouth: 'frown' },
  glare: { open: 0.62, lid: 0.45, brow: 0.7, pupil: 0.75, mouth: 'line' },
  menace: { open: 0.55, lid: 0.5, brow: 0.85, pupil: 0.6, mouth: 'line', shadow: 1, glow: 1 },
  shout: { lid: 0.4, brow: 0.75, mouth: 'shout' },
  smile: { mouth: 'smile' },
  soft: { open: 0.85, brow: -0.15, mouth: 'smallsmile' },
  grin: { lid: 0.3, brow: 0.45, mouth: 'grin' },
  happy: { eyes: 'happy', mouth: 'opensmile' },
  surprised: { open: 1.22, pupil: 0.72, brow: -0.45, browUp: 0.006, mouth: 'o' },
  shock: { open: 1.3, pupil: 0.38, brow: -0.55, browUp: 0.008, mouth: 'open', gloom: 1 },
  scared: { open: 1.15, pupil: 0.5, brow: -0.65, mouth: 'wavy', gloom: 0.6 },
  sad: { open: 0.82, brow: -0.6, lid: -0.2, mouth: 'frown' },
  closed: { eyes: 'closed', mouth: 'line' },
  blush: { open: 0.95, brow: -0.25, blush: 1, mouth: 'smallsmile' },
  flustered: { open: 1.12, brow: -0.5, blush: 1.5, mouth: 'wavy', pupil: 0.8 },
  eat: { eyes: 'happy', mouth: 'chew', blush: 0.6 },
  bliss: { eyes: 'happy', mouth: 'smallsmile', blush: 0.9, brow: -0.3 },
  sparkle: { eyes: 'star', mouth: 'opensmile', brow: -0.25, open: 1.1 },
  smirk: { lid: 0.2, brow: 0.25, mouth: 'smirk' },
  pain: { eyes: 'squeeze', brow: -0.35, mouth: 'teeth' },
  determined: { lid: 0.32, brow: 0.5, mouth: 'line' },
  laugh: { eyes: 'happy', mouth: 'laugh' },
  dizzy: { eyes: 'spiral', mouth: 'wavy' },
  ko: { eyes: 'x', mouth: 'open' },
  annoyed: { open: 0.55, lid: 0.12, brow: 0.3, mouth: 'tch' },
  blank: { open: 0.9, pupil: 0.55, mouth: 'line', brow: -0.1 },
};

const DEFAULT_STYLE = {
  size: 256,
  eyeColor: '#6b4a2a',
  eyeDark: '#24140c',
  eyeLight: '#c79a6a',
  eyeW: 0.036,
  eyeH: 0.03,
  eyeX: 0.043,
  eyeY: -0.012,
  shape: 'normal',
  lashes: false,
  line: '#2a1b1b',
  brow: '#3a2418',
  browT: 0.0055,
  mouthY: -0.084,
  mouthW: 0.02,
  lid0: 0,
  brow0: 0,
  bandage: false,
  mustache: null,
  freckles: false,
  iris: 1,
  highlight: 1,
};

const SHAPES = {
  // altura do controle da pálpebra de cima e de baixo (fração da altura)
  round: { up: 0.78, lo: -0.72, inner: 0.1 },
  normal: { up: 0.64, lo: -0.6, inner: 0.15 },
  sharp: { up: 0.5, lo: -0.42, inner: 0.05 },
  small: { up: 0.55, lo: -0.5, inner: 0.1 },
};

export class FaceRig {
  constructor(style) {
    this.st = { ...DEFAULT_STYLE, ...style };
    const S = this.st.size;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = S;
    this.g = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.key = '';
  }

  // state: { expr, talk, blink, lx, ly }
  update(state) {
    const lx = Math.round((state.lx || 0) * 4) / 4;
    const ly = Math.round((state.ly || 0) * 4) / 4;
    const key = `${state.expr}|${state.talk ? 1 : 0}|${state.blink ? 1 : 0}|${lx}|${ly}`;
    if (key === this.key) return;
    this.key = key;
    this.draw(state.expr, state.talk, state.blink, lx, ly);
    this.texture.needsUpdate = true;
  }

  draw(exprName, talk, blink, lx, ly) {
    const st = this.st;
    const g = this.g;
    const S = st.size;
    const k = S / (2 * FACE_W);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, S, S);
    g.setTransform(k, 0, 0, -k, S / 2, S / 2 + FACE_CY * k);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const ex = EXPR[exprName] || EXPR.neutral;
    const e = {
      open: ex.open ?? 1,
      lid: (ex.lid ?? 0) + st.lid0,
      brow: (ex.brow ?? 0) + st.brow0,
      browUp: ex.browUp ?? 0,
      pupil: ex.pupil ?? 1,
      eyes: ex.eyes || 'open',
      mouth: ex.mouth || 'line',
      blush: ex.blush || 0,
      shadow: ex.shadow || 0,
      glow: ex.glow || 0,
      gloom: ex.gloom || 0,
      lx,
      ly,
    };
    if (blink && (e.eyes === 'open' || e.eyes === 'star')) e.eyes = 'blink';

    if (e.gloom) this.gloom(e.gloom);
    if (st.freckles) this.freckles();
    if (e.blush) this.blush(e.blush);
    if (st.bandage) this.bandage();
    this.nose();
    for (const s of [1, -1]) this.eye(e, s);
    for (const s of [1, -1]) this.browLine(e, s);
    if (st.mustache) this.mustache();
    this.mouth(e.mouth, talk);
    if (e.shadow) this.menace(e);
  }

  eyeGeom(e, s) {
    const st = this.st;
    const sh = SHAPES[st.shape] || SHAPES.normal;
    const cx = s * st.eyeX;
    const cy = st.eyeY;
    const w = st.eyeW;
    const h = st.eyeH * e.open;
    const ix = cx - s * w * 0.5;
    const ox = cx + s * w * 0.5;
    const iy = cy + h * sh.inner - e.lid * st.eyeH * 0.55;
    const oy = cy + h * 0.28 + e.lid * st.eyeH * 0.12;
    const upY = cy + h * sh.up - e.lid * st.eyeH * 0.18;
    const loY = cy + h * sh.lo;
    return { cx, cy, w, h, ix, ox, iy, oy, upY, loY, sh };
  }

  eye(e, s) {
    const st = this.st;
    const g = this.g;
    const q = this.eyeGeom(e, s);
    const { cx, cy, w, ix, ox, iy, oy, upY, loY } = q;
    g.strokeStyle = st.line;
    g.fillStyle = st.line;

    if (e.eyes === 'blink' || e.eyes === 'closed') {
      g.lineWidth = 0.0035;
      g.beginPath();
      g.moveTo(ix, cy - 0.002);
      g.quadraticCurveTo(cx, cy - 0.009 - (e.eyes === 'closed' ? 0.002 : 0), ox, cy + 0.001);
      g.stroke();
      if (st.lashes) this.lashes(ox, cy + 0.001, s, 0.6);
      return;
    }
    if (e.eyes === 'happy') {
      g.lineWidth = 0.0042;
      g.beginPath();
      g.moveTo(ix, cy - 0.004);
      g.quadraticCurveTo(cx, cy + 0.016, ox, cy - 0.004);
      g.stroke();
      if (st.lashes) this.lashes(ox, cy - 0.003, s, 0.5);
      return;
    }
    if (e.eyes === 'squeeze') {
      g.lineWidth = 0.004;
      g.beginPath();
      g.moveTo(ox, cy + 0.009);
      g.lineTo(ix + s * 0.004, cy);
      g.lineTo(ox, cy - 0.009);
      g.stroke();
      return;
    }
    if (e.eyes === 'x') {
      g.lineWidth = 0.004;
      g.beginPath();
      g.moveTo(cx - 0.011, cy + 0.011);
      g.lineTo(cx + 0.011, cy - 0.011);
      g.moveTo(cx - 0.011, cy - 0.011);
      g.lineTo(cx + 0.011, cy + 0.011);
      g.stroke();
      return;
    }
    if (e.eyes === 'spiral') {
      g.lineWidth = 0.0022;
      g.beginPath();
      for (let a = 0; a < 16; a += 0.2) {
        const r = 0.0012 * a;
        const x = cx + Math.cos(a * s) * r;
        const y = cy + Math.sin(a * s) * r;
        if (a === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      return;
    }

    // forma do branco do olho
    const shape = () => {
      g.beginPath();
      g.moveTo(ix, iy);
      g.bezierCurveTo(ix + s * w * 0.2, upY, ox - s * w * 0.25, upY + 0.002, ox, oy);
      g.bezierCurveTo(ox - s * w * 0.1, loY + 0.004, ix + s * w * 0.25, loY, ix, iy);
      g.closePath();
    };
    shape();
    g.fillStyle = '#fffaf6';
    g.fill();
    g.save();
    shape();
    g.clip();
    // íris
    const irx = w * 0.3 * st.iris;
    const iry = st.eyeH * 0.5 * st.iris;
    const icx = cx + e.lx * w * 0.22;
    const icy = cy - st.eyeH * 0.04 + e.ly * st.eyeH * 0.18;
    const grd = g.createLinearGradient(0, icy + iry, 0, icy - iry);
    grd.addColorStop(0, e.glow ? '#1a0606' : st.eyeDark);
    grd.addColorStop(0.55, e.glow ? '#220808' : st.eyeColor);
    grd.addColorStop(1, e.glow ? '#2a0a0a' : st.eyeLight);
    g.fillStyle = grd;
    g.beginPath();
    g.ellipse(icx, icy, irx, iry, 0, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 0.0012;
    g.strokeStyle = st.eyeDark;
    g.stroke();
    // pupila
    g.fillStyle = e.glow ? '#000' : 'rgba(10,4,4,0.92)';
    g.beginPath();
    g.ellipse(icx, icy + iry * 0.05, irx * 0.48 * e.pupil, iry * 0.52 * e.pupil, 0, 0, Math.PI * 2);
    g.fill();
    // sombra da pálpebra
    const sg = g.createLinearGradient(0, upY + 0.004, 0, upY - st.eyeH * 0.45);
    sg.addColorStop(0, 'rgba(60,20,30,0.38)');
    sg.addColorStop(1, 'rgba(60,20,30,0)');
    g.fillStyle = sg;
    g.fillRect(cx - w, cy - st.eyeH, w * 2, st.eyeH * 2);
    // brilhos
    if (!e.glow) {
      g.fillStyle = '#ffffff';
      const hs = st.highlight;
      g.beginPath();
      g.ellipse(icx + s * irx * 0.35, icy + iry * 0.38, irx * 0.34 * hs, iry * 0.26 * hs, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.ellipse(icx - s * irx * 0.35, icy - iry * 0.45, irx * 0.14 * hs, iry * 0.1 * hs, 0, 0, Math.PI * 2);
      g.fill();
      if (e.eyes === 'star') this.star(icx, icy + iry * 0.1, irx * 0.75, '#ffffff');
    }
    g.restore();

    // pálpebra superior (traço grosso, mais grosso na ponta de fora)
    g.strokeStyle = st.line;
    g.lineWidth = st.shape === 'sharp' ? 0.0046 : 0.0042;
    g.beginPath();
    g.moveTo(ix - s * 0.001, iy + 0.0005);
    g.bezierCurveTo(ix + s * w * 0.2, upY, ox - s * w * 0.25, upY + 0.002, ox + s * 0.002, oy);
    g.stroke();
    g.lineWidth = 0.0068;
    g.beginPath();
    g.moveTo(cx + s * w * 0.12, upY - 0.0005);
    g.quadraticCurveTo(ox - s * w * 0.12, upY + 0.0015, ox + s * 0.003, oy - 0.0005);
    g.stroke();
    if (st.lashes) this.lashes(ox + s * 0.002, oy, s, 1);
    // pálpebra inferior (fina, só na metade de fora)
    g.lineWidth = 0.0016;
    g.beginPath();
    g.moveTo(cx - s * w * 0.05, loY + 0.0015);
    g.quadraticCurveTo(ox - s * w * 0.12, loY + 0.002, ox - s * 0.001, oy - st.eyeH * 0.12);
    g.stroke();
  }

  lashes(x, y, s, k) {
    const g = this.g;
    g.lineWidth = 0.0024;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + s * 0.007 * k, y + 0.004 * k);
    g.moveTo(x - s * 0.002, y + 0.002);
    g.lineTo(x + s * 0.004 * k, y + 0.008 * k);
    g.stroke();
  }

  star(x, y, r, color) {
    const g = this.g;
    g.fillStyle = color;
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 2;
      const rr = i % 2 === 0 ? r : r * 0.28;
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.fill();
  }

  browLine(e, s) {
    const st = this.st;
    const g = this.g;
    const cx = s * st.eyeX;
    const base = st.eyeY + st.eyeH * 0.92 + e.browUp;
    const ixb = cx - s * st.eyeW * 0.45;
    const oxb = cx + s * st.eyeW * 0.62;
    const iyb = base - e.brow * 0.011 + (e.eyes === 'happy' ? 0.002 : 0);
    const oyb = base + 0.004 + e.brow * 0.004;
    const t = st.browT;
    g.fillStyle = st.brow;
    g.beginPath();
    g.moveTo(ixb, iyb - t * 0.5);
    g.quadraticCurveTo((ixb + oxb) / 2, Math.max(iyb, oyb) + 0.003, oxb, oyb);
    g.quadraticCurveTo((ixb + oxb) / 2, Math.max(iyb, oyb) + 0.003 - t * 0.9, ixb, iyb + t * 0.5);
    g.closePath();
    g.fill();
  }

  nose() {
    const g = this.g;
    g.strokeStyle = 'rgba(150,80,70,0.75)';
    g.lineWidth = 0.0018;
    g.beginPath();
    g.moveTo(0.002, -0.04);
    g.lineTo(-0.0015, -0.049);
    g.stroke();
  }

  blush(k) {
    const g = this.g;
    for (const s of [1, -1]) {
      const x = s * 0.056;
      const y = -0.05;
      const rg = g.createRadialGradient(x, y, 0, x, y, 0.024);
      rg.addColorStop(0, `rgba(255,90,110,${0.55 * Math.min(1, k)})`);
      rg.addColorStop(1, 'rgba(255,90,110,0)');
      g.fillStyle = rg;
      g.beginPath();
      g.ellipse(x, y, 0.026, 0.014, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = `rgba(220,60,80,${0.75 * Math.min(1, k)})`;
      g.lineWidth = 0.0014;
      g.beginPath();
      for (let i = -1; i <= 1; i++) {
        g.moveTo(x + i * 0.007 - 0.003, y - 0.004);
        g.lineTo(x + i * 0.007 + 0.003, y + 0.004);
      }
      g.stroke();
    }
    if (k > 1.2) {
      // rubor que toma o rosto todo
      g.fillStyle = `rgba(255,80,100,${0.18 * (k - 1.2) * 3})`;
      g.fillRect(-0.09, -0.07, 0.18, 0.05);
    }
  }

  freckles() {
    const g = this.g;
    g.fillStyle = 'rgba(160,90,60,0.5)';
    for (const s of [1, -1])
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.arc(s * (0.045 + i * 0.008), -0.045 - (i % 2) * 0.004, 0.0016, 0, Math.PI * 2);
        g.fill();
      }
  }

  bandage() {
    const g = this.g;
    g.save();
    g.translate(-0.062, -0.052);
    g.rotate(0.38);
    g.fillStyle = '#f0c9a0';
    g.strokeStyle = '#8c5a3c';
    g.lineWidth = 0.0012;
    g.beginPath();
    g.roundRect(-0.017, -0.0065, 0.034, 0.013, 0.005);
    g.fill();
    g.stroke();
    g.fillStyle = '#ddb085';
    g.fillRect(-0.005, -0.0055, 0.01, 0.011);
    g.fillStyle = 'rgba(120,80,50,0.6)';
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 2; j++) {
        g.beginPath();
        g.arc(-0.0025 + i * 0.005, -0.0025 + j * 0.005, 0.0007, 0, Math.PI * 2);
        g.fill();
      }
    g.restore();
  }

  mustache() {
    const g = this.g;
    g.fillStyle = this.st.mustache;
    g.beginPath();
    g.moveTo(0, -0.058);
    g.quadraticCurveTo(0.018, -0.054, 0.026, -0.066);
    g.quadraticCurveTo(0.012, -0.064, 0, -0.064);
    g.quadraticCurveTo(-0.012, -0.064, -0.026, -0.066);
    g.quadraticCurveTo(-0.018, -0.054, 0, -0.058);
    g.fill();
  }

  gloom(k) {
    // linhas verticais de "pavor" na testa
    const g = this.g;
    g.strokeStyle = `rgba(60,70,140,${0.55 * k})`;
    g.lineWidth = 0.0016;
    g.beginPath();
    for (let i = -5; i <= 5; i++) {
      const x = i * 0.009;
      g.moveTo(x, 0.1);
      g.lineTo(x, 0.025 + Math.abs(i) * 0.002);
    }
    g.stroke();
  }

  menace(e) {
    // faixa de sombra sobre os olhos e pupilas vermelhas brilhando
    const st = this.st;
    const g = this.g;
    const top = st.eyeY + st.eyeH * 2.6;
    const bot = st.eyeY - st.eyeH * 0.9;
    const sg = g.createLinearGradient(0, top, 0, bot);
    sg.addColorStop(0, 'rgba(20,6,12,0.88)');
    sg.addColorStop(0.75, 'rgba(20,6,12,0.7)');
    sg.addColorStop(1, 'rgba(20,6,12,0)');
    g.fillStyle = sg;
    g.fillRect(-FACE_W, bot, FACE_W * 2, top - bot);
    for (const s of [1, -1]) {
      const q = this.eyeGeom(e, s);
      const x = q.cx + s * 0.002;
      const y = q.cy;
      const rg = g.createRadialGradient(x, y, 0, x, y, 0.014);
      rg.addColorStop(0, 'rgba(255,240,230,1)');
      rg.addColorStop(0.25, 'rgba(255,40,40,0.95)');
      rg.addColorStop(1, 'rgba(255,0,0,0)');
      g.fillStyle = rg;
      g.beginPath();
      g.ellipse(x, y, 0.016, 0.009, 0, 0, Math.PI * 2);
      g.fill();
    }
  }

  mouth(type, talk) {
    const st = this.st;
    const g = this.g;
    const y = st.mouthY;
    const w = st.mouthW;
    g.strokeStyle = st.line;
    g.lineWidth = 0.0026;
    const fillMouth = (path, tongue = true) => {
      g.fillStyle = '#5a1622';
      path();
      g.fill();
      if (tongue) {
        g.save();
        path();
        g.clip();
        g.fillStyle = '#e0707a';
        g.beginPath();
        g.ellipse(0, y - 0.012, w * 0.7, 0.007, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      path();
      g.stroke();
    };
    if (talk) {
      // boca aberta ao falar, conforme o tipo
      if (type === 'shout' || type === 'laugh' || type === 'open' || type === 'opensmile') talk = false;
      else if (type === 'chew') {
        type = 'chew2';
        talk = false;
      } else if (type === 'grin' || type === 'teeth') {
        type = 'teethopen';
        talk = false;
      }
    }
    if (talk) {
      const big = type === 'frown' || type === 'tch' ? 0.8 : 1;
      fillMouth(() => {
        g.beginPath();
        g.moveTo(-w * 0.55 * big, y + 0.002);
        g.quadraticCurveTo(0, y + 0.004, w * 0.55 * big, y + 0.002);
        g.quadraticCurveTo(w * 0.4, y - 0.014 * big, 0, y - 0.015 * big);
        g.quadraticCurveTo(-w * 0.4, y - 0.014 * big, -w * 0.55 * big, y + 0.002);
        g.closePath();
      });
      return;
    }
    switch (type) {
      case 'line':
        g.beginPath();
        g.moveTo(-w * 0.45, y);
        g.quadraticCurveTo(0, y - 0.0015, w * 0.45, y);
        g.stroke();
        break;
      case 'frown':
        g.beginPath();
        g.moveTo(-w * 0.5, y - 0.004);
        g.quadraticCurveTo(0, y + 0.004, w * 0.5, y - 0.004);
        g.stroke();
        break;
      case 'smile':
        g.beginPath();
        g.moveTo(-w * 0.6, y + 0.004);
        g.quadraticCurveTo(0, y - 0.009, w * 0.6, y + 0.004);
        g.stroke();
        break;
      case 'smallsmile':
        g.beginPath();
        g.moveTo(-w * 0.35, y + 0.002);
        g.quadraticCurveTo(0, y - 0.005, w * 0.35, y + 0.002);
        g.stroke();
        break;
      case 'smirk':
        g.beginPath();
        g.moveTo(-w * 0.5, y - 0.001);
        g.quadraticCurveTo(w * 0.1, y - 0.004, w * 0.6, y + 0.006);
        g.stroke();
        break;
      case 'tch':
        g.beginPath();
        g.moveTo(-w * 0.5, y - 0.003);
        g.lineTo(w * 0.15, y);
        g.lineTo(w * 0.5, y + 0.003);
        g.stroke();
        g.fillStyle = '#fff';
        g.beginPath();
        g.moveTo(w * 0.22, y - 0.0005);
        g.lineTo(w * 0.32, y - 0.0065);
        g.lineTo(w * 0.4, y + 0.001);
        g.closePath();
        g.fill();
        g.lineWidth = 0.001;
        g.stroke();
        break;
      case 'wavy':
        g.lineWidth = 0.0022;
        g.beginPath();
        for (let i = 0; i <= 8; i++) {
          const x = -w * 0.6 + (i / 8) * w * 1.2;
          const yy = y + (i % 2 ? 0.0028 : -0.0028);
          if (i === 0) g.moveTo(x, yy);
          else g.lineTo(x, yy);
        }
        g.stroke();
        break;
      case 'chew':
        g.beginPath();
        g.moveTo(-w * 0.45, y);
        g.quadraticCurveTo(-w * 0.2, y - 0.006, 0, y);
        g.quadraticCurveTo(w * 0.2, y - 0.006, w * 0.45, y);
        g.stroke();
        break;
      case 'chew2':
        g.beginPath();
        g.moveTo(-w * 0.4, y - 0.002);
        g.quadraticCurveTo(0, y + 0.004, w * 0.4, y - 0.002);
        g.stroke();
        break;
      case 'o':
        fillMouth(() => {
          g.beginPath();
          g.ellipse(0, y - 0.004, w * 0.3, 0.0075, 0, 0, Math.PI * 2);
        }, false);
        break;
      case 'open':
        fillMouth(() => {
          g.beginPath();
          g.ellipse(0, y - 0.007, w * 0.55, 0.012, 0, 0, Math.PI * 2);
        });
        break;
      case 'opensmile':
      case 'laugh': {
        const b = type === 'laugh' ? 1.35 : 1;
        fillMouth(() => {
          g.beginPath();
          g.moveTo(-w * 0.65 * b, y + 0.004);
          g.quadraticCurveTo(0, y + 0.002, w * 0.65 * b, y + 0.004);
          g.quadraticCurveTo(w * 0.5 * b, y - 0.018 * b, 0, y - 0.019 * b);
          g.quadraticCurveTo(-w * 0.5 * b, y - 0.018 * b, -w * 0.65 * b, y + 0.004);
          g.closePath();
        });
        break;
      }
      case 'shout': {
        fillMouth(() => {
          g.beginPath();
          g.moveTo(-w * 0.85, y + 0.006);
          g.lineTo(w * 0.85, y + 0.006);
          g.quadraticCurveTo(w * 0.75, y - 0.03, 0, y - 0.032);
          g.quadraticCurveTo(-w * 0.75, y - 0.03, -w * 0.85, y + 0.006);
          g.closePath();
        });
        g.fillStyle = '#fff';
        g.fillRect(-w * 0.7, y + 0.0005, w * 1.4, 0.004);
        if (st.fangs) {
          // presas
          g.beginPath();
          for (const s of [1, -1]) {
            g.moveTo(s * w * 0.55, y + 0.001);
            g.lineTo(s * w * 0.45, y - 0.006);
            g.lineTo(s * w * 0.35, y + 0.001);
          }
          g.fill();
        }
        break;
      }
      case 'grin':
      case 'teeth':
      case 'teethopen': {
        const hh = type === 'teethopen' ? 0.016 : 0.011;
        const ww = type === 'grin' ? w * 1.5 : w * 1.15;
        g.fillStyle = '#fff';
        g.beginPath();
        if (type === 'grin') {
          g.moveTo(-ww * 0.5, y + 0.006);
          g.quadraticCurveTo(0, y - 0.004, ww * 0.5, y + 0.006);
          g.quadraticCurveTo(ww * 0.3, y - hh, 0, y - hh);
          g.quadraticCurveTo(-ww * 0.3, y - hh, -ww * 0.5, y + 0.006);
        } else g.roundRect(-ww * 0.5, y - hh * 0.75, ww, hh, 0.003);
        g.fill();
        g.lineWidth = 0.0018;
        g.stroke();
        g.lineWidth = 0.0011;
        g.beginPath();
        g.moveTo(-ww * 0.45, y - hh * 0.25 + (type === 'grin' ? 0.002 : 0));
        g.lineTo(ww * 0.45, y - hh * 0.25 + (type === 'grin' ? 0.002 : 0));
        for (let i = -2; i <= 2; i++) {
          g.moveTo(i * ww * 0.18, y + 0.003);
          g.lineTo(i * ww * 0.18, y - hh * 0.7);
        }
        g.stroke();
        break;
      }
    }
  }
}
