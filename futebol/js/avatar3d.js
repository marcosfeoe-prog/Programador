// Bonecos 3D procedurais: rosto, cabelo, barba, uniforme com número e nome.
import * as THREE from 'three';

const SEG = 24;
const geoCache = new Map();
function geo(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}
const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0, ...opts }));
  return matCache.get(key);
}

function shade(hex, f) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return '#' + c.getHexString();
}

function luminance(hex) {
  const c = new THREE.Color(hex);
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
}

// ---------- textura da camisa ----------
const kitTexCache = new Map();
export function kitTexture(kit) {
  const key = JSON.stringify(kit);
  if (kitTexCache.has(key)) return kitTexCache.get(key);
  const W = 1024;
  const H = 512;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const c = cv.getContext('2d');
  const p1 = kit.primary;
  const p2 = kit.secondary;
  c.fillStyle = p1;
  c.fillRect(0, 0, W, H);
  c.fillStyle = p2;
  switch (kit.pattern) {
    case 'stripes':
      for (let x = 0; x < W; x += 64) c.fillRect(x + 32, 0, 32, H);
      break;
    case 'hoops':
      for (let y = 40; y < H; y += 90) c.fillRect(0, y, W, 45);
      break;
    case 'half':
      c.fillRect(0, 0, W / 4, H);
      c.fillRect((W * 3) / 4, 0, W / 4, H);
      break;
    case 'sash': {
      c.save();
      // faixa diagonal na frente (frente = u 0/1) e nas costas
      for (const ox of [-W, 0, W]) {
        c.beginPath();
        c.moveTo(ox + W * 0.9, 0);
        c.lineTo(ox + W * 1.02, 0);
        c.lineTo(ox + W * 1.16, H);
        c.lineTo(ox + W * 1.04, H);
        c.closePath();
        c.fill();
      }
      c.restore();
      break;
    }
    case 'chevron':
      for (const ox of [0, W]) {
        c.beginPath();
        c.moveTo(ox - 200, 90);
        c.lineTo(ox, 200);
        c.lineTo(ox + 200, 90);
        c.lineTo(ox + 200, 150);
        c.lineTo(ox, 260);
        c.lineTo(ox - 200, 150);
        c.closePath();
        c.fill();
      }
      break;
    case 'band':
      c.fillRect(0, H * 0.38, W, H * 0.2);
      break;
    default:
      // detalhes discretos na gola e laterais
      c.fillRect(0, 0, W, 14);
      c.globalAlpha = 0.85;
      c.fillRect(W * 0.23, 0, 14, H);
      c.fillRect(W * 0.75, 0, 14, H);
      c.globalAlpha = 1;
  }
  // textura de tecido
  c.globalAlpha = 0.06;
  c.fillStyle = '#000';
  for (let y = 0; y < H; y += 4) c.fillRect(0, y, W, 1);
  c.globalAlpha = 1;
  const txt = luminance(p1) > 0.6 ? (luminance(p2) < 0.5 ? p2 : '#111') : luminance(p2) > 0.55 ? p2 : '#fff';
  // número e nome nas costas (u = 0.5)
  c.fillStyle = txt;
  c.strokeStyle = luminance(txt) > 0.5 ? 'rgba(0,0,0,.45)' : 'rgba(255,255,255,.35)';
  c.lineWidth = 6;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  if (kit.name) {
    c.font = 'bold 46px Arial Black, Arial, sans-serif';
    c.strokeText(kit.name.toUpperCase().slice(0, 14), W / 2, 90);
    c.fillText(kit.name.toUpperCase().slice(0, 14), W / 2, 90);
  }
  if (kit.number != null) {
    c.font = 'bold 210px Arial Black, Arial, sans-serif';
    c.strokeText(String(kit.number), W / 2, 260);
    c.fillText(String(kit.number), W / 2, 260);
  }
  // escudo no peito esquerdo e patrocinador centralizado na frente (cruza a costura)
  const cx = W * 0.075;
  c.fillStyle = p2;
  c.strokeStyle = txt;
  c.lineWidth = 5;
  c.beginPath();
  c.moveTo(cx - 34, 80);
  c.lineTo(cx + 34, 80);
  c.lineTo(cx + 34, 120);
  c.quadraticCurveTo(cx, 170, cx - 34, 120);
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = txt;
  c.font = 'bold 22px Arial, sans-serif';
  c.fillText((kit.short || '').slice(0, 3), cx, 110);
  if (kit.sponsor) {
    c.font = 'bold 54px Arial, sans-serif';
    c.fillStyle = txt;
    c.fillText(kit.sponsor, 0, 250);
    c.fillText(kit.sponsor, W, 250);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  kitTexCache.set(key, tex);
  if (kitTexCache.size > 80) {
    const first = kitTexCache.keys().next().value;
    kitTexCache.get(first).dispose();
    kitTexCache.delete(first);
  }
  return tex;
}

// ---------- cabeça ----------
function addHair(head, look) {
  const hc = look.hairColor;
  const m = mat(hc, { roughness: 0.85 });
  const R = 0.122;
  const cap = (r, thetaLen, sy = 1, phiLen = Math.PI * 2, phiStart = 0) => {
    const mesh = new THREE.Mesh(geo(`cap${r}${thetaLen}${phiLen}`, () => new THREE.SphereGeometry(r, SEG, 16, phiStart, phiLen, 0, thetaLen)), m);
    mesh.scale.y = sy;
    return mesh;
  };
  const style = look.hair;
  const g = new THREE.Group();
  const backTilt = (mesh) => {
    mesh.rotation.x = -0.25;
    return mesh;
  };
  switch (style) {
    case 'careca':
      break;
    case 'raspado': {
      const c = backTilt(cap(R + 0.002, 1.25));
      c.material = mat(hc, { roughness: 1, transparent: true, opacity: 0.55 });
      g.add(c);
      break;
    }
    case 'curto':
      g.add(backTilt(cap(R + 0.008, 1.3, 1.02)));
      break;
    case 'social': {
      g.add(backTilt(cap(R + 0.01, 1.32, 1.05)));
      const part = new THREE.Mesh(geo('part', () => new THREE.SphereGeometry(0.06, 12, 8)), m);
      part.position.set(0.04, 0.1, 0.05);
      part.scale.set(1.4, 0.5, 1.3);
      g.add(part);
      break;
    }
    case 'topete': {
      g.add(backTilt(cap(R + 0.008, 1.25)));
      const q = new THREE.Mesh(geo('topete', () => new THREE.SphereGeometry(0.075, 16, 10)), m);
      q.position.set(0, 0.115, 0.05);
      q.scale.set(1.15, 0.75, 1.25);
      g.add(q);
      break;
    }
    case 'moicano': {
      const c = backTilt(cap(R + 0.002, 1.2));
      c.material = mat(hc, { roughness: 1, transparent: true, opacity: 0.4 });
      g.add(c);
      const mo = new THREE.Mesh(geo('moicano', () => new THREE.BoxGeometry(0.035, 0.07, 0.2)), m);
      mo.position.set(0, 0.125, -0.005);
      mo.rotation.x = -0.15;
      g.add(mo);
      break;
    }
    case 'cacheado': {
      g.add(backTilt(cap(R + 0.012, 1.35, 1.05)));
      const s = geo('curl', () => new THREE.SphereGeometry(0.03, 8, 6));
      for (let i = 0; i < 40; i++) {
        const th = (i / 40) * Math.PI * 2 * 3.1;
        const ph = 0.15 + (i / 40) * 1.05;
        const b = new THREE.Mesh(s, m);
        b.position.set(Math.sin(th) * Math.sin(ph) * 0.135, Math.cos(ph) * 0.135, Math.cos(th) * Math.sin(ph) * 0.135 - 0.01);
        g.add(b);
      }
      break;
    }
    case 'blackpower': {
      const afro = new THREE.Mesh(geo('afro', () => new THREE.SphereGeometry(0.17, SEG, 18)), mat(hc, { roughness: 1 }));
      afro.position.set(0, 0.09, -0.075);
      afro.scale.set(1.1, 0.95, 1);
      g.add(afro);
      break;
    }
    case 'dreads': {
      g.add(backTilt(cap(R + 0.01, 1.35)));
      const d = geo('dread', () => new THREE.CylinderGeometry(0.012, 0.01, 0.2, 6));
      for (let i = 0; i < 22; i++) {
        const th = Math.PI * 0.35 + (i / 21) * Math.PI * 1.3;
        const b = new THREE.Mesh(d, m);
        b.position.set(Math.sin(th) * 0.12, -0.02, Math.cos(th) * 0.12);
        b.rotation.z = Math.sin(th) * 0.25;
        b.rotation.x = Math.cos(th) * -0.25;
        g.add(b);
      }
      break;
    }
    case 'tranças': {
      g.add(backTilt(cap(R + 0.006, 1.3)));
      const t = geo('trança', () => new THREE.TorusGeometry(R + 0.01, 0.009, 6, 24, Math.PI * 0.9));
      for (let i = -3; i <= 3; i++) {
        const b = new THREE.Mesh(t, m);
        b.rotation.y = Math.PI / 2;
        b.rotation.z = Math.PI * 0.05;
        b.position.x = i * 0.026;
        b.scale.setScalar(1 - Math.abs(i) * 0.04);
        g.add(b);
      }
      break;
    }
    case 'longo': {
      g.add(backTilt(cap(R + 0.012, 1.4, 1.05)));
      const back = new THREE.Mesh(geo('longback', () => new THREE.CylinderGeometry(0.12, 0.14, 0.26, SEG, 1, true, Math.PI * 0.6, Math.PI * 0.8)), mat(hc, { roughness: 0.85, side: THREE.DoubleSide }));
      back.position.set(0, -0.08, -0.005);
      back.rotation.y = Math.PI;
      g.add(back);
      break;
    }
    case 'coque': {
      g.add(backTilt(cap(R + 0.008, 1.35)));
      const bun = new THREE.Mesh(geo('bun', () => new THREE.SphereGeometry(0.045, 14, 10)), m);
      bun.position.set(0, 0.12, -0.07);
      g.add(bun);
      break;
    }
    case 'rabo': {
      g.add(backTilt(cap(R + 0.008, 1.35)));
      const tail = new THREE.Mesh(geo('tail', () => new THREE.CylinderGeometry(0.03, 0.012, 0.2, 10)), m);
      tail.position.set(0, -0.02, -0.15);
      tail.rotation.x = 0.4;
      g.add(tail);
      break;
    }
    case 'franja': {
      g.add(backTilt(cap(R + 0.01, 1.35)));
      const fr = new THREE.Mesh(geo('franja', () => new THREE.SphereGeometry(0.1, 16, 8, 0, Math.PI * 2, 0, 0.9)), m);
      fr.position.set(0, 0.035, 0.05);
      fr.rotation.x = 0.9;
      fr.scale.set(1.15, 1, 0.7);
      g.add(fr);
      break;
    }
    case 'undercut': {
      const sides = backTilt(cap(R + 0.002, 1.5));
      sides.material = mat(hc, { roughness: 1, transparent: true, opacity: 0.5 });
      g.add(sides);
      const top = new THREE.Mesh(geo('uctop', () => new THREE.SphereGeometry(0.11, 18, 10, 0, Math.PI * 2, 0, 1.0)), m);
      top.position.set(0, 0.03, 0.01);
      top.scale.set(1.05, 1.3, 1.15);
      g.add(top);
      break;
    }
    default:
      g.add(backTilt(cap(R + 0.008, 1.3)));
  }
  head.add(g);
}

function addBeard(head, look) {
  if (!look.beard || look.beard === 'nenhuma') return;
  const hc = look.hairColor;
  const solid = mat(hc, { roughness: 1 });
  const opacity = { rala: 0.35, curta: 0.8 }[look.beard] ?? 1;
  const fill = opacity < 1 ? mat(hc, { roughness: 1, transparent: true, opacity }) : solid;
  // barba acompanha a mandíbula: queixo (abaixo da boca) + bochechas laterais
  const jawGroup = new THREE.Group();
  jawGroup.position.set(0, -0.05, 0.015);
  const big = look.beard === 'cheia' ? 1.07 : 1.02;
  jawGroup.scale.set(0.87 * big, 0.83 * big, 0.92 * big);
  const chinPart = new THREE.Mesh(geo('beardChin', () => new THREE.SphereGeometry(0.1, 24, 10, 0, Math.PI, Math.PI * 0.62, Math.PI * 0.38)), fill);
  const cheekL = new THREE.Mesh(geo('beardCheekL', () => new THREE.SphereGeometry(0.1, 12, 10, 0, Math.PI * 0.34, Math.PI * 0.3, Math.PI * 0.4)), fill);
  const cheekR = new THREE.Mesh(geo('beardCheekR', () => new THREE.SphereGeometry(0.1, 12, 10, Math.PI * 0.66, Math.PI * 0.34, Math.PI * 0.3, Math.PI * 0.4)), fill);
  const must = () => {
    const mm = new THREE.Mesh(geo('must', () => new THREE.BoxGeometry(0.05, 0.01, 0.012)), solid);
    mm.position.set(0, -0.041, 0.112);
    return mm;
  };
  const goatee = () => {
    const cc = new THREE.Mesh(geo('goatee', () => new THREE.SphereGeometry(0.022, 10, 8)), solid);
    cc.position.set(0, -0.112, 0.08);
    cc.scale.set(1, 1.2, 0.7);
    return cc;
  };
  switch (look.beard) {
    case 'rala':
    case 'curta':
      jawGroup.add(chinPart, cheekL, cheekR);
      head.add(jawGroup);
      if (look.beard === 'curta') head.add(must());
      break;
    case 'cheia':
      jawGroup.add(chinPart, cheekL, cheekR);
      head.add(jawGroup, must());
      break;
    case 'cavanhaque':
      head.add(must(), goatee());
      break;
    case 'bigode':
      head.add(must());
      break;
  }
}

function buildHead(look) {
  const head = new THREE.Group();
  const skin = mat(look.skin, { roughness: 0.55 });
  const skull = new THREE.Mesh(geo('skull', () => new THREE.SphereGeometry(0.12, SEG, 20)), skin);
  skull.scale.set(0.92, 1.08, 1);
  head.add(skull);
  // mandíbula
  const jaw = new THREE.Mesh(geo('jawskin', () => new THREE.SphereGeometry(0.1, SEG, 14)), skin);
  jaw.position.set(0, -0.05, 0.015);
  jaw.scale.set(0.85, 0.8, 0.9);
  head.add(jaw);
  // orelhas
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(geo('ear', () => new THREE.SphereGeometry(0.028, 10, 8)), skin);
    ear.position.set(s * 0.112, -0.005, -0.005);
    ear.scale.set(0.45, 1, 0.75);
    head.add(ear);
  }
  // olhos
  const white = mat('#f7f7f2', { roughness: 0.3 });
  const iris = mat(look.eyes, { roughness: 0.25 });
  const pupil = mat('#050505', { roughness: 0.2 });
  for (const s of [-1, 1]) {
    const e = new THREE.Group();
    const sc = new THREE.Mesh(geo('sclera', () => new THREE.SphereGeometry(0.019, 14, 10)), white);
    sc.scale.set(1.2, 0.85, 0.6);
    const ir = new THREE.Mesh(geo('iris', () => new THREE.CircleGeometry(0.0105, 16)), iris);
    ir.position.z = 0.0118;
    const pu = new THREE.Mesh(geo('pupil', () => new THREE.CircleGeometry(0.005, 12)), pupil);
    pu.position.z = 0.0121;
    e.add(sc, ir, pu);
    e.position.set(s * 0.042, 0.018, 0.1);
    head.add(e);
    const brow = new THREE.Mesh(geo('brow', () => new THREE.BoxGeometry(0.038, 0.008, 0.01)), mat(look.hairColor === '#f2f2f2' ? '#888' : look.hairColor, { roughness: 1 }));
    brow.position.set(s * 0.043, 0.048, 0.108);
    brow.rotation.z = s * -0.12;
    head.add(brow);
  }
  // nariz e boca
  const nose = new THREE.Mesh(geo('nose', () => new THREE.SphereGeometry(0.018, 12, 10)), mat(shade(look.skin, 0.95), { roughness: 0.55 }));
  nose.position.set(0, -0.012, 0.118);
  nose.scale.set(0.9, 1.2, 1);
  head.add(nose);
  const mouth = new THREE.Mesh(geo('mouth', () => new THREE.TorusGeometry(0.02, 0.0045, 6, 12, Math.PI)), mat(shade(look.skin, 0.6), { roughness: 0.6 }));
  mouth.position.set(0, -0.055, 0.104);
  mouth.rotation.z = Math.PI;
  head.add(mouth);
  addHair(head, look);
  addBeard(head, look);
  return head;
}

// ---------- corpo ----------
export function buildFigure(look, kit) {
  const fig = new THREE.Group();
  const skin = mat(look.skin, { roughness: 0.55 });
  const build = look.build || 1;
  const tex = kitTexture(kit);
  const shirt = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 });
  const sleeveColor = kit.pattern === 'sleeves' ? kit.secondary : kit.primary;
  const sleeve = mat(sleeveColor, { roughness: 0.75 });
  const shortsColor = kit.shorts || (luminance(kit.primary) > 0.8 ? kit.secondary : kit.pattern === 'stripes' || kit.pattern === 'hoops' ? '#111111' : kit.primary);
  const shorts = mat(shortsColor, { roughness: 0.75 });
  const socks = mat(kit.socks || kit.primary, { roughness: 0.8 });
  const boots = mat(look.boots || '#111', { roughness: 0.35, metalness: 0.1 });

  // tronco
  const torso = new THREE.Mesh(geo('torso', () => new THREE.CylinderGeometry(0.2, 0.16, 0.56, 32, 1, false, 0, Math.PI * 2)), shirt);
  torso.position.y = 1.2;
  torso.scale.set(build, 1, 0.62 * build);
  fig.add(torso);
  const shoulders = new THREE.Mesh(geo('shoulders', () => new THREE.SphereGeometry(0.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2)), sleeve);
  shoulders.position.y = 1.475;
  shoulders.scale.set(build, 0.32, 0.62 * build);
  fig.add(shoulders);
  // gola
  const collar = new THREE.Mesh(geo('collar', () => new THREE.TorusGeometry(0.055, 0.012, 8, 20)), mat(kit.secondary));
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 1.53;
  fig.add(collar);
  // pescoço e cabeça
  const neck = new THREE.Mesh(geo('neck', () => new THREE.CylinderGeometry(0.05, 0.058, 0.1, 16)), skin);
  neck.position.y = 1.56;
  fig.add(neck);
  const head = buildHead(look);
  head.position.y = 1.72;
  fig.add(head);
  fig.userData.head = head;
  // braços
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * 0.215 * build, 1.43, 0);
    const up = new THREE.Mesh(geo('uparm', () => new THREE.CylinderGeometry(0.055, 0.05, 0.2, 14)), sleeve);
    up.position.y = -0.1;
    const fore = new THREE.Mesh(geo('forearm', () => new THREE.CylinderGeometry(0.042, 0.034, 0.26, 12)), skin);
    fore.position.y = -0.32;
    const hand = new THREE.Mesh(geo('hand', () => new THREE.SphereGeometry(0.042, 12, 10)), skin);
    hand.position.y = -0.47;
    hand.scale.set(0.8, 1.1, 0.6);
    arm.add(up, fore, hand);
    arm.rotation.z = s * 0.12;
    fig.add(arm);
    arms.push(arm);
  }
  fig.userData.arms = arms;
  // calção
  const sh = new THREE.Mesh(geo('shorts', () => new THREE.CylinderGeometry(0.165, 0.18, 0.2, 24)), shorts);
  sh.position.y = 0.85;
  sh.scale.set(build, 1, 0.7 * build);
  fig.add(sh);
  // pernas
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(s * 0.085 * build, 0.8, 0);
    const thighS = new THREE.Mesh(geo('thighS', () => new THREE.CylinderGeometry(0.075, 0.07, 0.16, 14)), shorts);
    thighS.position.y = -0.04;
    const thigh = new THREE.Mesh(geo('thigh', () => new THREE.CylinderGeometry(0.066, 0.055, 0.2, 14)), skin);
    thigh.position.y = -0.2;
    const sock = new THREE.Mesh(geo('sock', () => new THREE.CylinderGeometry(0.052, 0.04, 0.36, 14)), socks);
    sock.position.y = -0.48;
    const boot = new THREE.Mesh(geo('boot', () => new THREE.BoxGeometry(0.085, 0.07, 0.2)), boots);
    boot.position.set(0, -0.69, 0.035);
    leg.add(thighS, thigh, sock, boot);
    fig.add(leg);
  }
  for (const c of fig.children) c.position.y -= 0.075; // pés no chão
  const h = look.height || 1.8;
  fig.scale.setScalar(h / 1.8);
  fig.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
    }
  });
  return fig;
}

export function kitFor(player, team, override) {
  const k = override || player?.look?.kit;
  return {
    primary: k?.primary || team?.colors?.[0] || '#1d4ed8',
    secondary: k?.secondary || team?.colors?.[1] || '#ffffff',
    pattern: k?.pattern || team?.pattern || 'solid',
    number: player?.number ?? 10,
    name: (player?.last || player?.name || '').split(' ').pop(),
    short: team?.short || '',
    sponsor: k?.sponsor ?? team?.sponsor ?? '',
  };
}

// ---------- visualizador interativo ----------
export class FigureViewer {
  constructor(canvas, { accent = '#22c55e', autoRotate = true, framing = 'full' } = {}) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    this.framing = framing;
    this.scene.add(new THREE.HemisphereLight('#dfe8ff', '#3a2f25', 1.1));
    const key = new THREE.DirectionalLight('#ffffff', 2.2);
    key.position.set(2, 4, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -1.5;
    key.shadow.camera.right = 1.5;
    key.shadow.camera.top = 2.5;
    key.shadow.camera.bottom = -0.5;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(accent, 1.4);
    rim.position.set(-3, 2, -3);
    this.scene.add(rim);
    this.rim = rim;
    // pedestal
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.08, 48), new THREE.MeshStandardMaterial({ color: '#1b2230', roughness: 0.4, metalness: 0.3 }));
    ped.position.y = -0.04;
    ped.receiveShadow = true;
    this.scene.add(ped);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.575, 0.012, 8, 64), new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.8 }));
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.y = 0.001;
    this.scene.add(this.ring);
    this.holder = new THREE.Group();
    this.scene.add(this.holder);
    this.rotY = 0.35;
    this.autoRotate = autoRotate;
    this.dragging = false;
    this.t = 0;
    this._bind();
    this._resize();
    this._loop = this._loop.bind(this);
    this.alive = true;
    requestAnimationFrame(this._loop);
  }
  _bind() {
    let lastX = 0;
    this._down = (e) => {
      this.dragging = true;
      lastX = e.clientX;
      this.canvas.setPointerCapture?.(e.pointerId);
    };
    this._move = (e) => {
      if (!this.dragging) return;
      this.rotY += (e.clientX - lastX) * 0.012;
      lastX = e.clientX;
    };
    this._up = () => {
      this.dragging = false;
    };
    this.canvas.addEventListener('pointerdown', this._down);
    this.canvas.addEventListener('pointermove', this._move);
    window.addEventListener('pointerup', this._up);
    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(this.canvas);
  }
  _resize() {
    const w = this.canvas.clientWidth || 300;
    const h = this.canvas.clientHeight || 400;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    if (this.framing === 'bust') {
      this.camera.position.set(0, 1.55, 1.7);
      this.camera.lookAt(0, 1.45, 0);
    } else {
      const d = Math.max(4.2, 4.2 / Math.min(1, this.camera.aspect * 1.4));
      this.camera.position.set(0, 1.05, d);
      this.camera.lookAt(0, 0.92, 0);
    }
    this.camera.updateProjectionMatrix();
  }
  setFigure(look, kit, accent) {
    while (this.holder.children.length) this.holder.remove(this.holder.children[0]);
    this.fig = buildFigure(look, kit);
    this.holder.add(this.fig);
    if (accent) {
      this.ring.material.color.set(accent);
      this.ring.material.emissive.set(accent);
      this.rim.color.set(accent);
    }
  }
  _loop(ts) {
    if (!this.alive) return;
    const dt = Math.min(0.05, (ts - (this._last || ts)) / 1000);
    this._last = ts;
    this.t += dt;
    if (this.autoRotate && !this.dragging) this.rotY += dt * 0.35;
    this.holder.rotation.y = this.rotY;
    if (this.fig) {
      const br = Math.sin(this.t * 1.6);
      const [a1, a2] = this.fig.userData.arms;
      a1.rotation.x = br * 0.05;
      a2.rotation.x = -br * 0.05;
      this.fig.userData.head.rotation.y = Math.sin(this.t * 0.5) * 0.25;
      this.fig.userData.head.rotation.x = Math.sin(this.t * 0.7) * 0.04;
      this.fig.position.y = br * 0.004;
    }
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this._loop);
  }
  dispose() {
    this.alive = false;
    this._ro.disconnect();
    window.removeEventListener('pointerup', this._up);
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
  }
}

// ---------- miniaturas (retratos) ----------
let thumbR = null;
const thumbCache = new Map();
function thumbRenderer() {
  if (thumbR) return thumbR;
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(160, 180, false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#eef2ff', '#3b3026', 1.3));
  const key = new THREE.DirectionalLight('#fff', 2.2);
  key.position.set(1.5, 2.5, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#9ad', 1);
  rim.position.set(-2, 2, -2);
  scene.add(rim);
  const camera = new THREE.PerspectiveCamera(26, 160 / 180, 0.1, 20);
  camera.position.set(0.35, 1.62, 1.55);
  camera.lookAt(0, 1.52, 0);
  thumbR = { renderer, scene, camera, canvas };
  return thumbR;
}

export function renderThumb(look, kit) {
  const key = JSON.stringify([look, kit]);
  if (thumbCache.has(key)) return thumbCache.get(key);
  let url = '';
  try {
    const { renderer, scene, camera } = thumbRenderer();
    const fig = buildFigure({ ...look, height: 1.8 }, kit);
    fig.rotation.y = 0.25;
    scene.add(fig);
    renderer.render(scene, camera);
    url = renderer.domElement.toDataURL('image/png');
    scene.remove(fig);
  } catch (e) {
    url = '';
  }
  thumbCache.set(key, url);
  if (thumbCache.size > 700) thumbCache.delete(thumbCache.keys().next().value);
  return url;
}
