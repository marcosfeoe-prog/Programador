// Peças do carro: rodas (pneu, aro, disco e pinça), faróis e lanternas moldados na
// carroceria, grades e entradas de ar, frisos, maçanetas, retrovisores, aerofólio,
// escapamentos e acessórios (bagageiro, estepe, prancha).
import * as THREE from 'three';
import { RNG, lerp, clamp } from '../util.js';
import { merge, paint, xf, box, cyl, roundBox } from '../geom.js';

const texCache = {};
function canvasTex(key, w, h, draw, srgb = true) {
  if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  texCache[key] = t;
  return t;
}

// ------------------------------------------------------------ texturas
export function tireTex() {
  return canvasTex('tire', 512, 128, (ctx, w, h) => {
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(0, 0, w, h);
    // banda de rodagem no meio (v 0.3..0.7)
    const y0 = h * 0.28;
    const y1 = h * 0.72;
    ctx.fillStyle = '#202020';
    ctx.fillRect(0, y0, w, y1 - y0);
    ctx.fillStyle = '#0c0c0c';
    for (const f of [0.38, 0.5, 0.62]) ctx.fillRect(0, h * f - 2, w, 4);
    for (let x = 0; x < w; x += 8) {
      ctx.fillRect(x, y0, 3, h * 0.1);
      ctx.fillRect(x + 4, y1 - h * 0.1, 3, h * 0.1);
    }
    // letras no flanco
    ctx.fillStyle = '#3c3c3c';
    ctx.font = 'bold 16px sans-serif';
    for (let x = 0; x < w; x += 128) {
      ctx.fillText('ROTA SERENA', x + 6, h * 0.12);
      ctx.fillText('ROTA SERENA', x + 70, h * 0.95);
    }
  });
}

function rubberTex() {
  return canvasTex('discTex', 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#8a8c8e';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = `rgba(${Math.random() > 0.5 ? 255 : 0},0,0,0.05)`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 8, 1);
    }
  });
}

// Faróis: mapa de cor e mapa de emissão (DRL / farol)
export function lightTex(style, tail) {
  const key = (tail ? 'T' : 'H') + style;
  const W = 256;
  const H = 128;
  const draw = (ctx, emit) => {
    ctx.fillStyle = emit ? '#000' : tail ? '#3a0606' : '#18191b';
    ctx.fillRect(0, 0, W, H);
    const chrome = (x, y, r) => {
      if (emit) return;
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
      g.addColorStop(0, '#f4f6f8');
      g.addColorStop(0.5, '#8a9098');
      g.addColorStop(1, '#2a2e34');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };
    const lens = (x, y, r) => {
      chrome(x, y, r);
      ctx.fillStyle = emit ? '#fff' : '#c8d4e0';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
      if (!emit) {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.arc(x - r * 0.2, y - r * 0.2, r * 0.15, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    const led = (x0, y0, x1, y1, th, col) => {
      ctx.strokeStyle = emit ? col : tail ? '#ff4a3a' : '#e8eef4';
      ctx.lineWidth = th;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    };
    if (!tail) {
      switch (style) {
        case 'slit':
          led(16, 40, W - 16, 48, 10, '#ffffff');
          lens(70, 88, 22);
          lens(130, 90, 22);
          lens(190, 92, 20);
          break;
        case 'quad':
          lens(70, 68, 44);
          lens(176, 68, 36);
          led(20, 118, W - 20, 112, 7, '#ffffff');
          break;
        case 'quadled':
          for (let i = 0; i < 4; i++) {
            if (!emit) {
              ctx.fillStyle = '#9aa2aa';
              ctx.fillRect(18 + i * 58, 36, 48, 56);
            }
            ctx.fillStyle = emit ? '#fff' : '#dfe8f2';
            ctx.fillRect(26 + i * 58, 44, 32, 40);
          }
          break;
        case 'round':
        default: {
          // farol redondo: refletor e lente com estrias
          const cx = W / 2;
          const cy = H / 2;
          if (!emit) {
            for (let r = 60; r > 4; r -= 6) {
              ctx.strokeStyle = `rgba(255,255,255,${0.15 + (60 - r) / 140})`;
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.ellipse(cx, cy, r * 2, r, 0, 0, Math.PI * 2);
              ctx.stroke();
            }
          }
          ctx.fillStyle = emit ? '#fff' : '#f4f2e8';
          ctx.beginPath();
          ctx.ellipse(cx, cy, 30, 15, 0, 0, Math.PI * 2);
          ctx.fill();
          if (emit) {
            const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, 120);
            g.addColorStop(0, 'rgba(255,250,235,0.9)');
            g.addColorStop(1, 'rgba(255,250,235,0.25)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);
          }
        }
      }
    } else {
      switch (style) {
        case 'bar':
          led(10, H / 2, W - 10, H / 2, 26, '#ff2a1a');
          if (!emit) led(10, H / 2, W - 10, H / 2, 6, '#ff9a8a');
          break;
        case 'ring':
          ctx.strokeStyle = emit ? '#ff2a1a' : '#ff5a4a';
          ctx.lineWidth = 18;
          ctx.beginPath();
          ctx.ellipse(W / 2, H / 2, W * 0.36, H * 0.32, 0, 0, Math.PI * 2);
          ctx.stroke();
          break;
        case 'round2':
          for (const x of [W * 0.28, W * 0.72]) {
            ctx.fillStyle = emit ? '#ff2a1a' : '#c81a12';
            ctx.beginPath();
            ctx.arc(x, H / 2, H * 0.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = emit ? '#ff6a4a' : '#ff7a6a';
            ctx.beginPath();
            ctx.arc(x, H / 2, H * 0.18, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        case 'vert':
        default:
          ctx.fillStyle = emit ? '#ff2a1a' : '#b81a12';
          ctx.fillRect(10, 8, W - 20, H * 0.55);
          ctx.fillStyle = emit ? '#000' : '#e8902a';
          ctx.fillRect(10, H * 0.62, W - 20, H * 0.18);
          ctx.fillStyle = emit ? '#000' : '#f0f0f0';
          ctx.fillRect(10, H * 0.82, W - 20, H * 0.12);
      }
    }
  };
  const map = canvasTex(key, W, H, (ctx) => draw(ctx, false));
  const em = canvasTex(key + 'e', W, H, (ctx) => draw(ctx, true));
  return { map, em };
}

function meshTex(style, accent) {
  return canvasTex('grille' + style + (accent || ''), 256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#060607';
    ctx.fillRect(0, 0, w, h);
    if (style === 'slats') {
      for (let y = 6; y < h; y += 16) {
        ctx.fillStyle = '#3a3c40';
        ctx.fillRect(0, y, w, 7);
        ctx.fillStyle = '#5a5c60';
        ctx.fillRect(0, y, w, 2);
      }
      return;
    }
    const chrome = style === 'chromeMesh';
    const s = chrome ? 14 : 10;
    ctx.strokeStyle = chrome ? '#b8bec6' : '#2c2e32';
    ctx.lineWidth = chrome ? 3 : 2.2;
    for (let y = 0; y < h + s; y += s * 0.86) {
      const off = (Math.round(y / (s * 0.86)) % 2) * (s / 2);
      for (let x = -s; x < w + s; x += s) {
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
          const px = x + off + Math.cos(a) * s * 0.5;
          const py = y + Math.sin(a) * s * 0.5;
          if (k) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
    if (accent) {
      ctx.fillStyle = accent;
      ctx.fillRect(0, h - 10, w, 6);
    }
    if (chrome) {
      ctx.strokeStyle = '#d8dde2';
      ctx.lineWidth = 10;
      ctx.strokeRect(4, 4, w - 8, h - 8);
    }
  });
}

function ventTex() {
  return canvasTex('vent', 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#0a0a0b';
    ctx.fillRect(0, 0, w, h);
    for (let y = 8; y < h; y += 14) {
      ctx.fillStyle = '#26282c';
      ctx.fillRect(6, y, w - 12, 6);
    }
  });
}

export function plateTex(text, eu) {
  return canvasTex('plate' + text, 256, 64, (ctx, w, h) => {
    ctx.fillStyle = '#f2f2ec';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 4;
    ctx.strokeRect(3, 3, w - 6, h - 6);
    if (eu) {
      ctx.fillStyle = '#1f3c9a';
      ctx.fillRect(4, 4, 28, h - 8);
    }
    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold 40px "DejaVu Sans Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2 + (eu ? 12 : 0), h / 2 + 2);
  });
}

// ------------------------------------------------------------ rodas
function spokeShape(style, rr, i, n) {
  const sh = new THREE.Shape();
  const rh = 0.075;
  const a0 = (i / n) * Math.PI * 2;
  const P = (r, a) => [Math.cos(a0 + a) * r, Math.sin(a0 + a) * r];
  const poly = (pts) => {
    sh.moveTo(...pts[0]);
    for (let k = 1; k < pts.length; k++) sh.lineTo(...pts[k]);
    sh.closePath();
  };
  const R = rr * 0.93;
  switch (style) {
    case 'six': {
      const wi = 0.055;
      const wo = 0.05;
      poly([P(rh, -wi / rh), P(R, -wo / R), P(R, wo / R), P(rh, wi / rh)]);
      break;
    }
    case 'y5': {
      const w = 0.026;
      const m = rh + (R - rh) * 0.45;
      poly([P(rh, -w * 1.4 / rh), P(m, -w / m), P(R, -0.24), P(R, -0.24 + 0.09), P(m + 0.03, 0), P(R, 0.24 - 0.09), P(R, 0.24), P(m, w / m), P(rh, w * 1.4 / rh)]);
      break;
    }
    case 'split10':
    case 'multi': {
      const w = style === 'multi' ? 0.016 : 0.014;
      poly([P(rh, -w / rh), P(R, -w * 0.8 / R), P(R, w * 0.8 / R), P(rh, w / rh)]);
      break;
    }
    case 'turbine': {
      const pts = [];
      const steps = 6;
      for (let k = 0; k <= steps; k++) {
        const r = lerp(rh, R, k / steps);
        pts.push(P(r, -0.02 / Math.max(r, 0.05) + (k / steps) * 0.55));
      }
      for (let k = steps; k >= 0; k--) {
        const r = lerp(rh, R, k / steps);
        pts.push(P(r, 0.028 / Math.max(r, 0.05) + (k / steps) * 0.55 + 0.05));
      }
      poly(pts);
      break;
    }
    case 'petal': {
      const pts = [];
      for (let k = 0; k <= 10; k++) {
        const u = k / 10;
        const r = lerp(rh, R, u);
        const wa = Math.sin(Math.min(1, u * 1.3) * Math.PI * 0.5) * 0.36 * (1 - u * 0.35);
        pts.push(P(r, -wa));
      }
      for (let k = 10; k >= 0; k--) {
        const u = k / 10;
        const r = lerp(rh, R, u);
        const wa = Math.sin(Math.min(1, u * 1.3) * Math.PI * 0.5) * 0.36 * (1 - u * 0.35);
        pts.push(P(r, wa));
      }
      poly(pts);
      break;
    }
  }
  return sh;
}

export function wheelGeos(W, lod = 0, rear = false) {
  const r = rear && W.rR ? W.rR : W.r;
  const w = W.w;
  const rr = W.rim;
  const segs = lod ? 18 : 48;
  // pneu (perfil girado em torno do eixo x)
  const side = r - rr;
  const prof = [
    [rr - 0.005, -w * 0.42],
    [rr + side * 0.25, -w * 0.5],
    [rr + side * 0.8, -w * 0.5],
    [r - 0.012, -w * 0.47],
    [r, -w * 0.4],
    [r, w * 0.4],
    [r - 0.012, w * 0.47],
    [rr + side * 0.8, w * 0.5],
    [rr + side * 0.25, w * 0.5],
    [rr - 0.005, w * 0.42],
  ];
  const tire = new THREE.LatheGeometry(
    prof.map((p) => new THREE.Vector2(p[0], p[1])),
    segs,
  );
  // uv: u ao redor, v ao longo do perfil
  tire.rotateZ(-Math.PI / 2);
  const parts = [];
  // tambor do aro
  const barrel = cyl(rr * 0.97, rr * 0.97, w * 0.86, segs, true);
  barrel.rotateZ(Math.PI / 2);
  parts.push(paint(barrel, '#2a2c2e'));
  // borda externa
  const lipC = W.lip || W.rimColor;
  const lip = new THREE.TorusGeometry(rr * 0.985, 0.012, 6, segs);
  lip.rotateY(Math.PI / 2);
  lip.translate(w * 0.43, 0, 0);
  parts.push(paint(lip, lipC));
  const face = w * 0.36;
  const style = W.style;
  if (style === 'steel' || style === 'hubcap') {
    const disc = new THREE.Shape();
    disc.absarc(0, 0, rr * 0.92, 0, Math.PI * 2, false);
    if (style === 'steel') {
      for (let i = 0; i < 6; i++) {
        const h = new THREE.Path();
        const a = (i / 6) * Math.PI * 2;
        h.absarc(Math.cos(a) * rr * 0.58, Math.sin(a) * rr * 0.58, rr * 0.13, 0, Math.PI * 2, true);
        disc.holes.push(h);
      }
    }
    const dg = new THREE.ExtrudeGeometry(disc, { depth: 0.012, bevelEnabled: false, curveSegments: lod ? 10 : 24 });
    dg.rotateY(Math.PI / 2);
    dg.translate(face - 0.03, 0, 0);
    parts.push(paint(dg, W.rimColor));
    if (style === 'hubcap') {
      const cap = new THREE.SphereGeometry(rr * 0.62, lod ? 10 : 24, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      cap.scale(1, 1, 1);
      cap.rotateZ(-Math.PI / 2);
      cap.scale(0.28, 1, 1);
      cap.translate(face - 0.02, 0, 0);
      parts.push(paint(cap, '#d8dce0'));
    }
  } else {
    const n = W.spokes || { six: 6, y5: 5, split10: 10, turbine: 14, petal: 5, multi: 10 }[style] || 6;
    const spokes = [];
    for (let i = 0; i < n; i++) {
      const offA = style === 'split10' ? ((i % 2) * 2 - 1) * 0.07 : 0;
      const ii = style === 'split10' ? Math.floor(i / 2) * 2 + 0.5 * (i % 2) * 0 : i;
      const sh = spokeShape(style, rr, ii + offA * (n / (Math.PI * 2)), n);
      const g = new THREE.ExtrudeGeometry(sh, { depth: style === 'petal' ? 0.035 : 0.028, bevelEnabled: !lod, bevelThickness: 0.006, bevelSize: 0.005, bevelSegments: 1, curveSegments: 4 });
      g.rotateY(Math.PI / 2);
      g.translate(face - 0.04, 0, 0);
      // côncavo: raios internos mais para fora
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const rad = Math.hypot(p.getY(k), p.getZ(k));
        p.setX(k, p.getX(k) + (1 - rad / rr) * 0.035);
      }
      g.computeVertexNormals();
      spokes.push(g);
    }
    parts.push(paint(merge(spokes), W.rimColor));
    if (style === 'petal') {
      const dish = cyl(rr * 0.9, rr * 0.9, 0.01, segs);
      dish.rotateZ(Math.PI / 2);
      dish.translate(face - 0.05, 0, 0);
      parts.push(paint(dish, '#2a2c30'));
    }
  }
  // cubo e porcas
  const hub = cyl(0.07, 0.08, 0.05, lod ? 10 : 20);
  hub.rotateZ(Math.PI / 2);
  hub.translate(face + 0.02, 0, 0);
  parts.push(paint(hub, W.rimColor));
  if (!lod) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const nut = cyl(0.012, 0.012, 0.03, 6);
      nut.rotateZ(Math.PI / 2);
      nut.translate(face + 0.045, Math.cos(a) * 0.05, Math.sin(a) * 0.05);
      parts.push(paint(nut, '#c8ccd0'));
    }
    const cap = cyl(0.03, 0.035, 0.02, 16);
    cap.rotateZ(Math.PI / 2);
    cap.translate(face + 0.05, 0, 0);
    parts.push(paint(cap, '#1a1a1a'));
  }
  const rim = merge(parts);
  const disc = cyl(rr * 0.8, rr * 0.8, 0.028, lod ? 16 : 40);
  disc.rotateZ(Math.PI / 2);
  disc.translate(w * 0.08, 0, 0);
  const hat = cyl(rr * 0.42, rr * 0.42, 0.06, 20);
  hat.rotateZ(Math.PI / 2);
  hat.translate(w * 0.12, 0, 0);
  const discG = merge([paint(disc, '#8a8c8e'), paint(hat, '#4a4c4e')]);
  // pinça (fica fixa, não gira)
  const cal = roundBox(0.07, 0.17, 0.1, 0.02, 1);
  const a = Math.PI * 0.8;
  cal.translate(w * 0.13, Math.sin(a) * rr * 0.68, Math.cos(a) * rr * 0.68 * -1);
  cal.rotateX(0);
  const caliper = paint(cal, W.caliper || '#444');
  return { tire, rim, disc: discG, caliper, r };
}

// ------------------------------------------------------------ remendos na carroceria
// polar: anéis x segmentos numa superelipse (w x h), projetados na casca
function patchPolar(body, cx, cy, w, h, rot, dir, front, n, rings = 4, segs = 28) {
  const d = new THREE.Vector3(dir[0], dir[1], front ? -1 : 1).normalize();
  const zEdge = front ? body.L / 2 : -body.L / 2;
  const P = [];
  const U = [];
  const I = [];
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  const shoot = (lx, ly) => {
    const x = cx + lx * cr - ly * sr;
    const y = cy + lx * sr + ly * cr;
    const o = [x - d.x * 1.5, y - d.y * 1.5, zEdge - d.z * 1.5];
    return body.hitZ(o, [d.x, d.y, d.z]);
  };
  const center = shoot(0, 0);
  if (!center) return null;
  P.push(...center);
  U.push(0.5, 0.5);
  for (let r = 1; r <= rings; r++) {
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const ex = 2 / n;
      const lx = (r / rings) * Math.sign(ca) * Math.pow(Math.abs(ca), ex) * w * 0.5;
      const ly = (r / rings) * Math.sign(sa) * Math.pow(Math.abs(sa), ex) * h * 0.5;
      const hit = shoot(lx, ly) || center;
      P.push(...hit);
      U.push(lx / w + 0.5, ly / h + 0.5);
    }
  }
  for (let s = 0; s < segs; s++) {
    const s1 = (s + 1) % segs;
    I.push(0, 1 + s, 1 + s1);
    for (let r = 1; r < rings; r++) {
      const a = 1 + (r - 1) * segs + s;
      const b = 1 + (r - 1) * segs + s1;
      const c = 1 + r * segs + s1;
      const e = 1 + r * segs + s;
      I.push(a, e, c, a, c, b);
    }
  }
  return finishPatch(P, U, I, front ? 1 : -1, 0.004);
}

function finishPatch(P, U, I, zSign, off) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  g.computeVertexNormals();
  // garante normais para fora
  const n = g.attributes.normal;
  let sum = 0;
  for (let i = 0; i < n.count; i++) sum += n.getZ(i) * zSign + Math.abs(n.getX(i)) * 0.2;
  if (zSign !== 0 && sum < 0) {
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) {
      const t = ix[i + 1];
      ix[i + 1] = ix[i + 2];
      ix[i + 2] = t;
    }
    g.computeVertexNormals();
  }
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.getX(i) * off, p.getY(i) + n.getY(i) * off, p.getZ(i) + n.getZ(i) * off);
  return g;
}

// remendo lateral (lado +x): parâmetros em z e y
function patchSide(body, t0, t1, y0, y1, nz = 10, ny = 6, shape = null) {
  const P = [];
  const U = [];
  const I = [];
  for (let j = 0; j <= ny; j++)
    for (let i = 0; i <= nz; i++) {
      const u = i / nz;
      const v = j / ny;
      let t = lerp(t0, t1, u);
      const y = lerp(y0, y1, v);
      if (shape) t = shape(u, v, t);
      P.push(body.sideX(t, y), y, body.zOf(t));
      U.push(u, v);
    }
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nz; i++) {
      const a = j * (nz + 1) + i;
      I.push(a, a + nz + 1, a + 1, a + 1, a + nz + 1, a + nz + 2);
    }
  const g = finishPatch(P, U, I, 0, 0);
  g.computeVertexNormals();
  // força normais para +x e afasta da superfície
  const n = g.attributes.normal;
  let sx = 0;
  for (let i = 0; i < n.count; i++) sx += n.getX(i);
  if (sx < 0) {
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) {
      const tt = ix[i + 1];
      ix[i + 1] = ix[i + 2];
      ix[i + 2] = tt;
    }
    g.computeVertexNormals();
  }
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + 0.004);
  return g;
}

// remendo no topo (capô): parâmetros em t e x
function patchTop(body, t0, t1, x0, x1, nt = 8, nx = 8) {
  const P = [];
  const U = [];
  const I = [];
  for (let j = 0; j <= nt; j++)
    for (let i = 0; i <= nx; i++) {
      const t = lerp(t0, t1, j / nt);
      const x = lerp(x0, x1, i / nx);
      P.push(x, body.topY(t, x) + 0.004, body.zOf(t));
      U.push(i / nx, j / nt);
    }
  for (let j = 0; j < nt; j++)
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      I.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  g.computeVertexNormals();
  const n = g.attributes.normal;
  if (n.getY(0) < 0) {
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) {
      const tt = ix[i + 1];
      ix[i + 1] = ix[i + 2];
      ix[i + 2] = tt;
    }
    g.computeVertexNormals();
  }
  return g;
}

const mirrorX = (g) => {
  const m = g.clone();
  m.scale(-1, 1, 1);
  const ix = m.index.array;
  for (let i = 0; i < ix.length; i += 3) {
    const t = ix[i + 1];
    ix[i + 1] = ix[i + 2];
    ix[i + 2] = t;
  }
  m.computeVertexNormals();
  return m;
};

// ------------------------------------------------------------ montagem dos detalhes
// Devolve listas de geometrias por material
export function buildDetails(body, spec, lod) {
  const out = { headLens: [], tailLens: [], grille: [], vents: [], black: [], chrome: [], paint: [], carbon: [], glass: [], mirrorGlass: [], plates: [], accent: [], amber: [], wipers: null, mirrors: [] };
  const L = spec.lights || {};
  const both = (g, list) => {
    if (!g) return;
    list.push(g, mirrorX(g));
  };
  // faróis e lanternas
  if (L.head) {
    const h = L.head;
    const g = patchPolar(body, h.x, h.y, h.w, h.h, h.rot, h.dir, true, h.round ? 2 : 5, lod ? 2 : 4, lod ? 12 : 28);
    both(g, out.headLens);
  }
  if (L.tail) {
    const tl = L.tail;
    if (tl.single) {
      out.tailLens.push(patchPolar(body, 0, tl.y, tl.w, tl.h, 0, [0, 0], false, 8, 2, lod ? 16 : 40));
    } else {
      both(patchPolar(body, tl.x, tl.y, tl.w, tl.h, -(tl.rot || 0), tl.dir, false, tl.style === 'ring' ? 2 : 5, lod ? 2 : 3, lod ? 12 : 24), out.tailLens);
    }
  }
  if (lod > 1) return out;
  for (const gr of L.grille || []) {
    const n = gr.shape || 6;
    if (gr.pair) both(patchPolar(body, gr.x, gr.y, gr.w, gr.h, 0, [-0.2, 0], true, n, 3, 20), out.grille);
    else out.grille.push(patchPolar(body, gr.x, gr.y, gr.w, gr.h, 0, [0, 0], true, n, 3, 24));
    if (gr.accent && spec.accent) {
      // filete colorido no splitter
      const a = patchPolar(body, 0, 0.17, 1.5, 0.025, 0, [0, 0], true, 8, 1, 30);
      if (a) out.accent.push(a);
    }
  }
  out.grilleStyle = (L.grille && L.grille[0] && L.grille[0].style) || 'mesh';
  if (L.fog) {
    const f = L.fog;
    both(patchPolar(body, f.x, f.y, f.r * 2, f.r * 2, 0, [0, 0], true, 2, 2, 16), f.amber ? out.amber : out.headLens);
  }
  if (lod) return out;
  // entradas de ar laterais
  for (const it of L.intakes || []) {
    const dt = it.w / body.L;
    const g = patchSide(body, it.t - dt / 2, it.t + dt / 2, it.y - it.h / 2, it.y + it.h / 2, 10, 6, (u, v, t) => t + (v - 0.5) * dt * 0.35);
    both(g, out.vents);
  }
  for (const hv of L.hoodVents || []) {
    const dt = hv.l / body.L;
    if (hv.x === 0) out.vents.push(patchTop(body, hv.t - dt / 2, hv.t + dt / 2, -hv.w / 2, hv.w / 2));
    else both(patchTop(body, hv.t - dt / 2, hv.t + dt / 2, hv.x - hv.w / 2, hv.x + hv.w / 2), out.vents);
  }
  // frisos das portas e do capô
  const g = spec.cabin;
  const lineSide = (t, y0, y1) => {
    const P = [];
    const I = [];
    const n = 14;
    const dz = 0.0025;
    for (let i = 0; i <= n; i++) {
      const y = lerp(y0, y1, i / n);
      const x = body.sideX(t, y) + 0.0015;
      const z = body.zOf(t);
      P.push(x, y, z - dz, x, y, z + dz);
      if (i) {
        const a = (i - 1) * 2;
        I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setIndex(I);
    geo.computeVertexNormals();
    const nn = geo.attributes.normal;
    for (let i = 0; i < nn.count; i++) nn.setXYZ(i, 1, 0, 0);
    return geo;
  };
  const p = (t) => body.params(t);
  const doorFront = g.gf - 0.012;
  const doorRear = g.pillars && g.pillars.length && !spec.interior.camper ? g.pillars[0] : g.sg0 + 0.01;
  for (const t of [doorFront, doorRear]) {
    const pr = p(t);
    both(lineSide(t, pr.yb + 0.08, pr.ys - 0.01), out.black);
  }
  if (g.pillars && g.pillars.length && spec.interior.rear && !spec.interior.camper) {
    const t = g.sg0 + 0.01;
    const pr = p(t);
    both(lineSide(t, Math.max(pr.yb + 0.08, body.wheels[1].r * 2 + 0.05), pr.ys - 0.01), out.black);
  }
  // linha do capô (atravessa o topo)
  const lineTop = (t) => {
    const P = [];
    const I = [];
    const pr = p(t);
    const n = 16;
    for (let i = 0; i <= n; i++) {
      const x = lerp(-pr.wsh * 0.97, pr.wsh * 0.97, i / n);
      const y = body.topY(t, x) + 0.0015;
      const z = body.zOf(t);
      P.push(x, y, z - 0.0025, x, y, z + 0.0025);
      if (i) {
        const a = (i - 1) * 2;
        I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setIndex(I);
    geo.computeVertexNormals();
    return geo;
  };
  out.black.push(lineTop(g.gf + 0.012), lineTop(g.gr - 0.012));
  // maçanetas
  const hy = p(doorRear).ys - 0.07;
  const ht = doorRear + 0.035;
  const handle = roundBox(0.025, 0.028, 0.15, 0.01, 1);
  handle.translate(body.sideX(ht, hy) + 0.008, hy, body.zOf(ht));
  both(paint(handle, spec.blackHandles ? '#111' : '#c8ccd0'), out.chrome);
  // retrovisores
  if (spec.mirror) {
    const m = spec.mirror;
    const pr = p(m.t);
    const sx = body.sideX(m.t, Math.min(m.y, pr.ys - 0.01)) || pr.wsh;
    const big = m.big ? 1.35 : 1;
    const house = new THREE.SphereGeometry(1, 16, 10);
    house.scale(0.1 * big, 0.06 * big, 0.055 * big);
    const hx = sx + 0.13 * big;
    house.translate(hx, m.y + 0.04, body.zOf(m.t));
    const arm = box(0.12 * big, 0.025, 0.05);
    arm.translate(sx + 0.05 * big, m.y + 0.01, body.zOf(m.t));
    const mg = new THREE.CircleGeometry(1, 16);
    mg.scale(0.085 * big, 0.048 * big, 1);
    mg.rotateY(Math.PI);
    mg.translate(hx, m.y + 0.04, body.zOf(m.t) - 0.05 * big);
    const housing = merge([house, arm]);
    if (spec.cabin.blackPillars || spec.mirrorBlack) both(housing, out.carbon);
    else both(housing, out.paint);
    both(mg, out.mirrorGlass);
  }
  // emblema
  const emb = cyl(0.04, 0.04, 0.01, 20);
  emb.rotateX(Math.PI / 2);
  const ey = (L.head ? L.head.y : 0.6) + 0.02;
  const ez = body.hitZ([0, ey, body.L], [0, 0, -1]);
  if (ez) {
    emb.translate(0, ey, ez[2] + 0.004);
    out.chrome.push(paint(emb, '#d8dce0'));
  }
  // placas
  if (L.plateF !== false) {
    const pz = body.hitZ([0, 0.36, body.L], [0, 0, -1]);
    if (pz) {
      const pl = new THREE.PlaneGeometry(0.52, 0.12);
      pl.translate(0, 0.36, pz[2] + 0.012);
      out.plates.push(pl);
    }
  }
  const prz = body.hitZ([0, 0.55, -body.L], [0, 0, 1]);
  if (prz) {
    const pl = new THREE.PlaneGeometry(0.52, 0.12);
    pl.rotateY(Math.PI);
    pl.translate(0, 0.55, prz[2] - 0.012);
    out.plates.push(pl);
  }
  // aerofólio
  if (spec.wing) buildWing(body, spec, out);
  // escapamentos
  for (const [ex, ey2, er] of spec.exhaust || []) {
    if (spec.exhaustTop) {
      const t = 0.12;
      const y = body.topY(t, ex);
      const tube = cyl(er, er * 1.1, 0.16, 16, true);
      tube.rotateX(-0.6);
      tube.translate(ex, y + 0.04, body.zOf(t));
      out.chrome.push(paint(tube, '#c8c0b0'));
      continue;
    }
    const z = (body.hitZ([ex, ey2, -body.L], [0, 0, 1]) || [0, 0, -body.L / 2])[2];
    const tube = cyl(er, er, 0.12, 18, true);
    tube.rotateX(Math.PI / 2);
    tube.translate(ex, ey2, z - 0.03);
    out.chrome.push(paint(tube, '#d0d2d4'));
    const inner = new THREE.CircleGeometry(er * 0.92, 16);
    inner.rotateY(Math.PI);
    inner.translate(ex, ey2, z + 0.01);
    out.black.push(inner);
  }
  // difusor
  if (spec.diffuser) {
    for (let i = 0; i < spec.diffuser; i++) {
      const x = lerp(-0.6, 0.6, i / (spec.diffuser - 1));
      const fin = box(0.012, 0.2, 0.42);
      fin.translate(x, 0.24, -body.L / 2 + 0.2);
      out.carbon.push(fin);
    }
  }
  // entrada no teto e barbatana
  if (spec.scoop) {
    const t = spec.scoop.t;
    const ry = body.roofY(t, 0);
    const sc = roundBox(0.34, spec.scoop.h, 0.5, 0.06, 2);
    sc.translate(0, ry + spec.scoop.h / 2 - 0.02, body.zOf(t));
    out.paint.push(sc);
    const mouth = new THREE.PlaneGeometry(0.26, spec.scoop.h * 0.65);
    mouth.translate(0, ry + spec.scoop.h * 0.5, body.zOf(t) + 0.252);
    out.black.push(mouth);
  }
  if (spec.fin) {
    const f = spec.fin;
    const P = [];
    const n = 10;
    const sh = new THREE.Shape();
    for (let i = 0; i <= n; i++) {
      const t = lerp(f.t1, f.t0, i / n);
      const y = Math.max(body.topY(t, 0), body.roofY(t, 0)) - 0.02;
      if (i === 0) sh.moveTo(body.zOf(t), y);
      else sh.lineTo(body.zOf(t), y);
      P.push([body.zOf(t), y]);
    }
    for (let i = n; i >= 0; i--) {
      const [z, y] = P[i];
      sh.lineTo(z, y + f.h * Math.min(1, (n - i) / 3 + 0.2));
    }
    const fg = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: false });
    fg.rotateY(-Math.PI / 2);
    fg.translate(0.006, 0, 0);
    out.paint.push(fg);
  }
  // bagageiro de teto
  if (spec.rack) {
    const r = spec.rack;
    const z0 = body.zOf(r.t0);
    const z1 = body.zOf(r.t1);
    for (const sx of [-1, 1]) {
      const rail = box(0.04, 0.05, z1 - z0);
      rail.translate(sx * 0.62, r.y, (z0 + z1) / 2);
      out.black.push(rail);
      for (const zz of [z0 + 0.1, z1 - 0.1]) {
        const ft = box(0.06, r.y - body.roofY(body.tOf(zz), 0.62), 0.06);
        ft.translate(sx * 0.62, (r.y + body.roofY(body.tOf(zz), 0.62)) / 2, zz);
        out.black.push(ft);
      }
    }
    for (let k = 0; k < 4; k++) {
      const z = lerp(z0 + 0.2, z1 - 0.2, k / 3);
      const bar = box(1.3, 0.03, 0.05);
      bar.translate(0, r.y + 0.03, z);
      out.black.push(bar);
    }
    if (r.board) {
      // prancha de surfe
      const sb = new THREE.SphereGeometry(1, 20, 10);
      sb.scale(0.27, 0.045, 1.25);
      sb.translate(0.2, r.y + 0.1, (z0 + z1) / 2);
      out.board = [sb];
      const st = box(0.03, 0.002, 2.3);
      st.translate(0.2, r.y + 0.146, (z0 + z1) / 2);
      out.accent.push(st);
    }
  }
  if (spec.snorkel) {
    const t0 = spec.cabin.gf;
    const tube = cyl(0.045, 0.045, 0.9, 10);
    const sx = body.sideX(t0 + 0.02, 0.95);
    tube.translate(-(sx + 0.04), 1.4, body.zOf(t0 + 0.005));
    out.black.push(tube);
    const head = roundBox(0.1, 0.1, 0.16, 0.03, 1);
    head.translate(-(sx + 0.04), 1.88, body.zOf(t0 + 0.005) + 0.04);
    out.black.push(head);
  }
  // friso cromado em "C" (grã-turismo bicolor)
  if (spec.chromeC) {
    const P = [];
    const I = [];
    const n = 24;
    for (let i = 0; i <= n; i++) {
      const y = lerp(0.24, 0.88, i / n);
      const t = 0.47 - 0.11 * ((y - 0.56) / 0.3) ** 2;
      const x = body.sideX(t, y) + 0.003;
      const z = body.zOf(t);
      P.push(x, y, z - 0.012, x + 0.004, y, z + 0.012);
      if (i) {
        const a = (i - 1) * 2;
        I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setIndex(I);
    geo.computeVertexNormals();
    const nn = geo.attributes.normal;
    for (let i = 0; i < nn.count; i++) nn.setXYZ(i, 1, 0.1, 0);
    both(geo, out.chrome);
  }
  // limpadores do para-brisa
  out.wipers = buildWipers(body, spec);
  return out;
}

function buildWing(body, spec, out) {
  const w = spec.wing;
  const t = w.t;
  const z = body.zOf(t);
  const deckY = body.topY(t + 0.02, 0);
  if (w.mount === 'duck') {
    // rabo de pato: cunha sobre a tampa traseira
    const sh = new THREE.Shape();
    sh.moveTo(0, 0);
    sh.lineTo(0.3, 0);
    sh.lineTo(-0.02, 0.07);
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: w.span, bevelEnabled: false });
    g.rotateY(-Math.PI / 2);
    g.translate(w.span / 2, body.topY(t, 0) - 0.01, z - 0.04);
    out.paint.push(g);
    return;
  }
  // perfil aerodinâmico
  const c = w.chord;
  const af = new THREE.Shape();
  const N = 12;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const th = 0.12 * c * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1015 * u ** 4) * 5;
    if (i === 0) af.moveTo(c * 0.5 - u * c, th + u * c * 0.12);
    else af.lineTo(c * 0.5 - u * c, th + u * c * 0.12);
  }
  for (let i = N; i >= 0; i--) {
    const u = i / N;
    const th = 0.12 * c * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1015 * u ** 4) * 5;
    af.lineTo(c * 0.5 - u * c, -th * 0.4 + u * c * 0.12);
  }
  const g = new THREE.ExtrudeGeometry(af, { depth: w.span, bevelEnabled: false, curveSegments: 4 });
  g.rotateY(-Math.PI / 2);
  g.translate(w.span / 2, w.y, z);
  const list = w.color === '#151617' || w.color === '#0c0e12' ? out.carbon : out.paint;
  if (w.mount === 'flush') {
    g.translate(0, deckY + 0.04 - w.y, 0);
    list.push(g);
    return;
  }
  list.push(g);
  // placas laterais
  for (const sx of [-1, 1]) {
    const ep = box(0.012, 0.16, c * 1.25);
    ep.translate(sx * (w.span / 2 + 0.006), w.y + 0.02, z);
    out.carbon.push(ep);
  }
  // suportes
  for (const sx of [-1, 1]) {
    const mx = sx * w.span * 0.26;
    const by = body.topY(t + 0.03, mx);
    const h = w.y - by;
    if (w.mount === 'swan') {
      const sh = new THREE.Shape();
      sh.moveTo(-0.06, 0);
      sh.lineTo(0.1, 0);
      sh.quadraticCurveTo(0.06, h * 0.7, -0.02, h + 0.06);
      sh.lineTo(-0.08, h + 0.06);
      sh.quadraticCurveTo(-0.02, h * 0.6, -0.06, 0);
      const sg = new THREE.ExtrudeGeometry(sh, { depth: 0.015, bevelEnabled: false });
      sg.rotateY(-Math.PI / 2);
      sg.translate(mx + 0.0075, by, z + 0.08);
      out.carbon.push(sg);
    } else {
      const post = box(0.03, h, 0.08);
      post.translate(mx, by + h / 2, z + 0.02);
      list.push(post);
    }
  }
}

function buildWipers(body, spec) {
  const g = spec.cabin;
  const t0 = g.gf - 0.004;
  const z0 = body.zOf(t0);
  const y0 = body.params(t0).ys + 0.015;
  const zr = body.zOf(g.rf);
  const yr = body.roofY(g.rf, 0);
  const s = new THREE.Vector3(0, yr - y0, zr - z0).normalize();
  const nrm = new THREE.Vector3(1, 0, 0).cross(s).normalize();
  const wipers = [];
  const len = Math.min(0.62, body.params(t0).wsh * 0.8);
  for (const x of [0.32, -0.38]) {
    const pivot = new THREE.Object3D();
    pivot.position.set(x, y0, z0 + 0.01);
    // base (eixo x, s, n): a palheta varre o plano do para-brisa
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), s, nrm);
    pivot.quaternion.setFromRotationMatrix(m);
    const swing = new THREE.Object3D();
    pivot.add(swing);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(len, 0.012, 0.014));
    arm.position.set(-len / 2, 0.006, 0.012);
    swing.add(arm);
    wipers.push({ pivot, swing, arm });
  }
  return wipers;
}

export { meshTex, ventTex, rubberTex };
