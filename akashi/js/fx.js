// Efeitos visuais em 3D no estilo anime: veia de raiva, gota de suor,
// brilhos, corações, vapor de vergonha, "!" e "?", nuvens de poeira, estrela
// de impacto, aura de chamas, onda de choque, respingos, pétalas de cerejeira
// e chuva. Tudo é recalculado a cada quadro a partir do tempo (sem estado):
// begin() zera o uso do pool, cada efeito pega sprites, end() esconde o resto.
import * as THREE from 'three';
import { canvasTexture } from './toon.js';
import { clamp, hash, backOut, easeOut, smooth, range } from './util.js';

const TEX = {};
function tex(name, draw, size = 128) {
  if (!TEX[name]) TEX[name] = canvasTexture(size, size, draw);
  return TEX[name];
}

function drawVein(g, W) {
  g.translate(W / 2, W / 2);
  g.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    g.save();
    g.rotate((i * Math.PI) / 2 + Math.PI / 4);
    g.beginPath();
    g.moveTo(10, -14);
    g.quadraticCurveTo(34, -8, 40, -30);
    g.moveTo(14, 10);
    g.quadraticCurveTo(38, 8, 44, -12);
    g.lineWidth = 14;
    g.strokeStyle = '#2a0000';
    g.stroke();
    g.lineWidth = 8;
    g.strokeStyle = '#ff2a2a';
    g.stroke();
    g.restore();
  }
}
function drawSweat(g, W) {
  g.translate(W / 2, W / 2);
  g.beginPath();
  g.moveTo(0, -46);
  g.bezierCurveTo(26, -6, 30, 22, 0, 34);
  g.bezierCurveTo(-30, 22, -26, -6, 0, -46);
  g.fillStyle = '#9ad8ff';
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = '#1a3a6a';
  g.stroke();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.ellipse(-8, 8, 6, 12, 0.3, 0, Math.PI * 2);
  g.fill();
}
function drawStar(g, W, color = '#ffffff', glow = '#fff6c0') {
  g.translate(W / 2, W / 2);
  const rg = g.createRadialGradient(0, 0, 0, 0, 0, W / 2);
  rg.addColorStop(0, glow);
  rg.addColorStop(0.2, 'rgba(255,240,200,0.35)');
  rg.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = rg;
  g.fillRect(-W / 2, -W / 2, W, W);
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = i % 2 === 0 ? W * 0.46 : W * 0.06;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
}
function drawHeart(g, W) {
  g.translate(W / 2, W / 2 + 6);
  g.beginPath();
  g.moveTo(0, 36);
  g.bezierCurveTo(-60, -6, -30, -50, 0, -20);
  g.bezierCurveTo(30, -50, 60, -6, 0, 36);
  g.fillStyle = '#ff5a8a';
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = '#7a0a2a';
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.beginPath();
  g.ellipse(-20, -14, 8, 5, -0.6, 0, Math.PI * 2);
  g.fill();
}
function drawPuff(g, W, fill = '#f4efe6', line = '#4a4038') {
  g.translate(W / 2, W / 2);
  const blobs = [
    [0, 0, 30],
    [-26, 8, 22],
    [26, 6, 22],
    [-12, -18, 20],
    [14, -16, 22],
    [0, 20, 20],
  ];
  g.fillStyle = line;
  for (const [x, y, r] of blobs) {
    g.beginPath();
    g.arc(x, y, r + 5, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = fill;
  for (const [x, y, r] of blobs) {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = 'rgba(0,0,0,0.08)';
  for (const [x, y, r] of blobs) {
    g.beginPath();
    g.arc(x + 4, y + 6, r * 0.6, 0, Math.PI * 2);
    g.fill();
  }
}
function drawGlyph(g, W, ch, fill, line) {
  g.translate(W / 2, W / 2);
  g.font = 'bold 110px "Arial Black", Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 14;
  g.strokeStyle = line;
  g.strokeText(ch, 0, 6);
  g.fillStyle = fill;
  g.fillText(ch, 0, 6);
}
function drawFlame(g, W) {
  g.translate(W / 2, W / 2);
  const rg = g.createRadialGradient(0, 18, 4, 0, 6, W * 0.46);
  rg.addColorStop(0, 'rgba(255,240,200,1)');
  rg.addColorStop(0.3, 'rgba(255,90,40,0.9)');
  rg.addColorStop(0.7, 'rgba(200,10,20,0.45)');
  rg.addColorStop(1, 'rgba(120,0,10,0)');
  g.fillStyle = rg;
  g.beginPath();
  g.moveTo(0, -60);
  g.bezierCurveTo(30, -20, 44, 30, 0, 56);
  g.bezierCurveTo(-44, 30, -30, -20, 0, -60);
  g.fill();
}
function drawGlow(g, W) {
  const rg = g.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.3, 'rgba(255,255,255,0.4)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, W, W);
}
function drawBurst(g, W) {
  g.translate(W / 2, W / 2);
  g.fillStyle = '#fffbe0';
  g.strokeStyle = '#1a1a1a';
  g.lineWidth = 5;
  g.beginPath();
  const n = 14;
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? W * (0.36 + hash(i) * 0.12) : W * 0.16;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  g.stroke();
}
function drawRing(g, W) {
  g.translate(W / 2, W / 2);
  g.lineWidth = 10;
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.beginPath();
  g.arc(0, 0, W / 2 - 10, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 4;
  g.strokeStyle = 'rgba(255,200,150,0.6)';
  g.beginPath();
  g.arc(0, 0, W / 2 - 22, 0, Math.PI * 2);
  g.stroke();
}
function drawDrop(g, W) {
  g.translate(W / 2, W / 2);
  g.fillStyle = 'rgba(200,230,255,0.95)';
  g.beginPath();
  g.ellipse(0, 0, W * 0.2, W * 0.32, 0, 0, Math.PI * 2);
  g.fill();
}
function drawPetal(g, W) {
  g.translate(W / 2, W / 2);
  g.fillStyle = '#ffc2d4';
  g.beginPath();
  g.moveTo(0, -W * 0.42);
  g.bezierCurveTo(W * 0.4, -W * 0.2, W * 0.3, W * 0.35, 0, W * 0.42);
  g.bezierCurveTo(-W * 0.3, W * 0.35, -W * 0.4, -W * 0.2, 0, -W * 0.42);
  g.fill();
  g.fillStyle = '#ff9ab8';
  g.beginPath();
  g.moveTo(0, -W * 0.42);
  g.lineTo(-W * 0.06, -W * 0.25);
  g.lineTo(W * 0.06, -W * 0.25);
  g.fill();
}
function drawNote(g, W) {
  g.translate(W / 2, W / 2);
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#2a2a4a';
  g.lineWidth = 5;
  g.beginPath();
  g.ellipse(-12, 26, 18, 13, -0.4, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillRect(2, -40, 8, 66);
  g.strokeRect(2, -40, 8, 66);
  g.beginPath();
  g.moveTo(10, -40);
  g.quadraticCurveTo(40, -24, 30, 4);
  g.lineWidth = 8;
  g.stroke();
}

function T(name) {
  switch (name) {
    case 'vein':
      return tex(name, drawVein);
    case 'sweat':
      return tex(name, drawSweat);
    case 'sparkle':
      return tex(name, (g, W) => drawStar(g, W));
    case 'heart':
      return tex(name, drawHeart);
    case 'puff':
      return tex(name, (g, W) => drawPuff(g, W));
    case 'steam':
      return tex(name, (g, W) => drawPuff(g, W, '#ffffff', 'rgba(255,255,255,0)'));
    case 'smoke':
      return tex(name, (g, W) => drawPuff(g, W, '#8a8494', '#3a3440'));
    case 'excl':
      return tex(name, (g, W) => drawGlyph(g, W, '!', '#ffe23a', '#1a1a1a'));
    case 'quest':
      return tex(name, (g, W) => drawGlyph(g, W, '?', '#7ad0ff', '#1a1a1a'));
    case 'flame':
      return tex(name, drawFlame);
    case 'glow':
      return tex(name, drawGlow);
    case 'burst':
      return tex(name, drawBurst, 256);
    case 'ring':
      return tex(name, drawRing, 256);
    case 'drop':
      return tex(name, drawDrop, 32);
    case 'petal':
      return tex(name, drawPetal, 64);
    case 'note':
      return tex(name, drawNote);
  }
}

const _v = new THREE.Vector3();
const _r = new THREE.Vector3();
const _u = new THREE.Vector3();

export class FX {
  constructor(scene, quality) {
    this.scene = scene;
    this.q = quality;
    this.group = new THREE.Group();
    this.group.name = 'fx';
    scene.add(this.group);
    this.pool = [];
    for (let i = 0; i < 260; i++) {
      const m = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, fog: false });
      const s = new THREE.Sprite(m);
      s.visible = false;
      s.renderOrder = 10;
      this.group.add(s);
      this.pool.push(s);
    }
    // pétalas instanciadas
    const pg = new THREE.PlaneGeometry(1, 1);
    this.petalMesh = new THREE.InstancedMesh(
      pg,
      new THREE.MeshBasicMaterial({ map: T('petal'), transparent: true, alphaTest: 0.2, side: THREE.DoubleSide, depthWrite: false }),
      700,
    );
    this.petalMesh.frustumCulled = false;
    this.petalMesh.count = 0;
    this.petalMesh.renderOrder = 9;
    this.group.add(this.petalMesh);
    // chuva (segmentos)
    this.rainGeo = new THREE.BufferGeometry();
    this.rainPos = new Float32Array(900 * 6);
    this.rainGeo.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(this.rainGeo, new THREE.LineBasicMaterial({ color: 0xaec6e8, transparent: true, opacity: 0.45 }));
    this.rain.frustumCulled = false;
    this.group.add(this.rain);
    // anel de choque no chão
    this.ringMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: T('ring'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.ringMesh.rotation.x = -Math.PI / 2;
    this.group.add(this.ringMesh);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._s = new THREE.Vector3();
  }

  begin(camera) {
    this.camera = camera;
    this.used = 0;
    this.petalMesh.count = 0;
    this.rain.visible = false;
    this.ringMesh.visible = false;
    camera.updateMatrixWorld();
    _r.setFromMatrixColumn(camera.matrixWorld, 0);
    _u.setFromMatrixColumn(camera.matrixWorld, 1);
    this.right = _r.clone();
    this.up = _u.clone();
  }

  end() {
    for (let i = this.used; i < this.pool.length; i++) this.pool[i].visible = false;
    this.petalMesh.instanceMatrix.needsUpdate = true;
  }

  // Um sprite: pos (Vector3), tamanho em metros, opções.
  sprite(type, pos, size, o = {}) {
    if (this.used >= this.pool.length) return null;
    const s = this.pool[this.used++];
    s.visible = true;
    const m = s.material;
    const t = T(type);
    if (m.map !== t) {
      m.map = t;
      m.needsUpdate = true;
    }
    const add = !!o.add;
    if ((m.blending === THREE.AdditiveBlending) !== add) {
      m.blending = add ? THREE.AdditiveBlending : THREE.NormalBlending;
      m.needsUpdate = true;
    }
    m.opacity = o.opacity ?? 1;
    m.rotation = o.rot ?? 0;
    m.color.set(o.color ?? 0xffffff);
    m.depthTest = o.depthTest ?? true;
    s.position.copy(pos);
    s.scale.set(size * (o.sx ?? 1), size * (o.sy ?? 1), 1);
    s.renderOrder = o.order ?? 10;
    return s;
  }

  // Ponto relativo à cabeça do personagem, deslocado no plano da câmera.
  near(char, dx, dy, up = 0) {
    char.headWorld(_v, up);
    return _v.clone().addScaledVector(this.right, dx).addScaledVector(this.up, dy);
  }

  vein(char, age, side = 1) {
    if (age < 0) return;
    const pop = backOut(range(age, 0, 0.25));
    const pulse = 1 + Math.sin(age * 14) * 0.08;
    this.sprite('vein', this.near(char, 0.13 * side, 0.12), 0.12 * pop * pulse * char.sc);
  }

  sweat(char, age, side = -1) {
    if (age < 0) return;
    const k = backOut(range(age, 0, 0.25));
    const p = this.near(char, 0.14 * side, 0.06 - Math.min(age, 1.5) * 0.02);
    this.sprite('sweat', p, 0.08 * k * char.sc, { rot: side * 0.3 });
  }

  bigSweat(char, age) {
    if (age < 0) return;
    const k = backOut(range(age, 0, 0.3));
    this.sprite('sweat', this.near(char, -0.16, 0.1 - Math.min(age, 2) * 0.03), 0.16 * k * char.sc, { rot: -0.4 });
  }

  excl(char, age, glyph = 'excl') {
    if (age < 0 || age > 1.6) return;
    const k = backOut(range(age, 0, 0.18)) * (1 - smooth(range(age, 1.3, 1.6)));
    this.sprite(glyph, this.near(char, 0.12, 0.26), 0.2 * k * char.sc);
  }

  hearts(char, age, n = 4) {
    if (age < 0) return;
    for (let i = 0; i < n; i++) {
      const ph = (age * 0.5 + i / n) % 1;
      const p = this.near(char, Math.sin(i * 2.3 + age) * 0.2, -0.05 + ph * 0.5);
      this.sprite('heart', p, 0.09 * (1 - ph * 0.4) * char.sc, { opacity: 1 - smooth(range(ph, 0.6, 1)) });
    }
  }

  steam(char, age, k = 1) {
    if (age < 0) return;
    for (let i = 0; i < 3; i++) {
      const ph = (age * 1.2 + i / 3) % 1;
      const p = this.near(char, (i - 1) * 0.1, 0.18 + ph * 0.25);
      this.sprite('steam', p, (0.08 + ph * 0.1) * k * char.sc, { opacity: (1 - ph) * 0.9 });
    }
  }

  sparkles(center, age, n = 6, radius = 0.3, size = 0.12, seed = 1) {
    for (let i = 0; i < n; i++) {
      const per = 0.9 + hash(i + seed) * 0.6;
      const ph = ((age + hash(i * 3.1 + seed) * per) % per) / per;
      const a = hash(i * 7.7 + seed + Math.floor((age + hash(i * 3.1 + seed) * per) / per)) * Math.PI * 2;
      const r = radius * (0.4 + hash(i * 5.3 + seed) * 0.6);
      const p = center.clone().addScaledVector(this.right, Math.cos(a) * r).addScaledVector(this.up, Math.sin(a) * r);
      const k = Math.sin(ph * Math.PI);
      this.sprite('sparkle', p, size * k, { add: true, rot: ph * 2 });
    }
  }

  notes(char, age) {
    for (let i = 0; i < 3; i++) {
      const ph = (age * 0.4 + i / 3) % 1;
      const p = this.near(char, 0.15 + Math.sin(ph * 6 + i) * 0.06, 0.1 + ph * 0.4);
      this.sprite('note', p, 0.1 * char.sc, { opacity: 1 - smooth(range(ph, 0.7, 1)) });
    }
  }

  // Nuvem de poeira que se expande a partir de pos.
  dust(pos, age, n = 8, scale = 1, dur = 1.2, seed = 1, type = 'puff') {
    if (age < 0 || age > dur) return;
    const u = age / dur;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + hash(i + seed);
      const r = easeOut(u) * (0.6 + hash(i * 3 + seed) * 0.8) * scale;
      const p = pos.clone();
      p.x += Math.cos(a) * r;
      p.z += Math.sin(a) * r;
      p.y += 0.15 * scale + u * 0.3 * scale * hash(i * 9 + seed);
      this.sprite(type, p, (0.4 + u * 0.6) * scale * (0.7 + hash(i + seed * 2) * 0.6), { opacity: 1 - smooth(range(u, 0.5, 1)), rot: a });
    }
  }

  // Estrela de impacto (golpes).
  impact(pos, age, size = 1, dur = 0.35) {
    if (age < 0 || age > dur) return;
    const u = age / dur;
    this.sprite('burst', pos, size * (0.6 + u * 0.8), { opacity: 1 - smooth(range(u, 0.4, 1)), rot: u * 0.4, depthTest: false, order: 20 });
    this.sprite('glow', pos, size * 2.2 * (1 - u), { add: true, depthTest: false, color: 0xfff0c0, order: 19 });
  }

  // Faíscas/pedrinhas voando a partir do impacto.
  debris(pos, age, n = 10, speed = 3, seed = 1, type = 'sparkle', size = 0.08) {
    if (age < 0 || age > 1.2) return;
    for (let i = 0; i < n; i++) {
      const a = hash(i + seed) * Math.PI * 2;
      const up = 0.3 + hash(i * 3 + seed) * 0.9;
      const v = speed * (0.5 + hash(i * 7 + seed));
      const p = pos.clone();
      p.x += Math.cos(a) * v * age;
      p.z += Math.sin(a) * v * age;
      p.y += up * v * age - 4.9 * age * age;
      if (p.y < 0.02) p.y = 0.02;
      this.sprite(type, p, size * (1 - age / 1.2), { add: type === 'sparkle' });
    }
  }

  // Aura de chamas em volta do personagem.
  aura(char, t, k = 1, color = 0xff3020) {
    if (k <= 0) return;
    const base = char.root.position;
    const n = Math.floor(18 * k) + 4;
    for (let i = 0; i < n; i++) {
      const per = 0.7 + hash(i) * 0.5;
      const ph = ((t + hash(i * 1.7) * per) % per) / per;
      const a = hash(i * 9.1 + Math.floor((t + hash(i * 1.7) * per) / per)) * Math.PI * 2;
      const r = (0.35 + hash(i * 2.3) * 0.25) * (1 - ph * 0.5) * char.sc;
      const p = new THREE.Vector3(base.x + Math.cos(a) * r, base.y + (0.1 + ph * 2.0) * char.sc, base.z + Math.sin(a) * r);
      this.sprite('flame', p, (0.4 - ph * 0.22) * Math.min(1, k) * char.sc, { add: true, opacity: Math.sin(ph * Math.PI) * 0.75, color, sy: 1.7 });
    }
    const c = char.headWorld(_v, -0.6);
    this.sprite('glow', c, 2.6 * k * char.sc, { add: true, opacity: 0.35 * k, color });
  }

  shockwave(pos, age, size = 4, dur = 0.6) {
    if (age < 0 || age > dur) return;
    const u = age / dur;
    this.ringMesh.visible = true;
    this.ringMesh.position.set(pos.x, pos.y + 0.05, pos.z);
    const s = size * easeOut(u);
    this.ringMesh.scale.set(s, s, 1);
    this.ringMesh.material.opacity = 1 - u;
  }

  splash(pos, age, scale = 1, seed = 3) {
    if (age < 0 || age > 1.4) return;
    for (let i = 0; i < 24; i++) {
      const a = hash(i + seed) * Math.PI * 2;
      const v = (1.5 + hash(i * 3 + seed) * 2.5) * scale;
      const up = (2.5 + hash(i * 5 + seed) * 3) * scale;
      const p = pos.clone();
      p.x += Math.cos(a) * v * age * 0.5;
      p.z += Math.sin(a) * v * age * 0.5;
      p.y += up * age - 4.9 * age * age;
      if (p.y < pos.y) continue;
      this.sprite('drop', p, 0.09 * scale, { opacity: 0.9 });
    }
    this.dust(pos, age, 6, scale * 0.8, 1.2, seed, 'steam');
  }

  // Pétalas caindo numa caixa em volta de center (determinístico no tempo).
  petals(center, t, n = 300, size = [12, 7, 12], wind = [0.6, 0, 0.2], scale = 0.06) {
    const m = this.petalMesh;
    const start = m.count;
    n = Math.min(n, this.petalBudget ?? 700, 700 - start);
    for (let i = 0; i < n; i++) {
      const fall = 0.5 + hash(i * 1.3) * 0.5;
      const yy = (hash(i * 2.1) * size[1] - t * fall) % size[1];
      const y = yy < 0 ? yy + size[1] : yy;
      const dx = hash(i * 3.7) * size[0] + t * wind[0] + Math.sin(t * 1.3 + i) * 0.4;
      const dz = hash(i * 4.9) * size[2] + t * wind[2] + Math.cos(t * 1.1 + i) * 0.4;
      const x = center.x - size[0] / 2 + (((dx % size[0]) + size[0]) % size[0]);
      const z = center.z - size[2] / 2 + (((dz % size[2]) + size[2]) % size[2]);
      this._e.set(t * (1 + hash(i)) + i, t * 1.7 + i * 0.3, t * 0.7 + i);
      this._q.setFromEuler(this._e);
      this._s.set(scale, scale, scale);
      this._m.compose(_v.set(x, center.y + y, z), this._q, this._s);
      m.setMatrixAt(start + i, this._m);
    }
    m.count = start + n;
  }

  rainAt(center, t, n = 800, area = 14, h = 12, len = 0.5) {
    this.rain.visible = true;
    const p = this.rainPos;
    n = Math.min(n, 900);
    for (let i = 0; i < n; i++) {
      const sp = 14 + hash(i) * 4;
      const yy = (hash(i * 2.3) * h - t * sp) % h;
      const y = (yy < 0 ? yy + h : yy) + center.y;
      const x = center.x + (hash(i * 3.3) - 0.5) * area;
      const z = center.z + (hash(i * 4.4) - 0.5) * area;
      p.set([x, y, z, x - 0.04, y - len, z], i * 6);
    }
    for (let i = n; i < 900; i++) p.set([0, -100, 0, 0, -100, 0], i * 6);
    this.rainGeo.attributes.position.needsUpdate = true;
  }
}
