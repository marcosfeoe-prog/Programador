// Nível 47 — o Ladrão de Peles. Usa a pele de alguém que já se perdeu aqui:
// de longe é uma pessoa comum, acena, chama, diz que conhece a saída. Mas não
// pisca, a cabeça às vezes vira demais e a voz falha. Quando o andarilho chega
// perto (ou dá as costas a ele), a pele rasga: braços compridos, rosto sem
// olhos, boca aberta — e ele corre atrás pelo labirinto. Extremamente hostil.
import * as THREE from 'three';
import { NPC } from './level0_1_npc.js';
import { W, EH, EV } from './grid.js';
import { TEX } from '../textures.js';
import { angleDiff, clamp, lerp, smoothstep } from '../util.js';

const PASS = new Set([W.NONE, W.DOOR, W.HALF_A, W.HALF_B]);
const WALK = 1.1;
const CHASE = 3.95; // um pouco mais lento que a corrida do andarilho, mas não cansa
const LOSE = 14; // segundos sem ver o andarilho até desistir

const LOOKS = [
  { skin: '#d8a888', hair: '#3a2614', hairStyle: 'short', suit: '#4a5a78', accent: '#c8c0b0', arms: 'down', eyes: '#2a1a10' },
  { skin: '#b58060', hair: '#151010', hairStyle: 'long', suit: '#7a3a3a', accent: '#e0d0b0', arms: 'down', eyes: '#1a1008' },
  { skin: '#e2b898', hair: '#8a6a3a', hairStyle: 'short', suit: '#3a5a3a', accent: '#d8d8d8', arms: 'down', eyes: '#3a5a8a', beard: 'rgba(80,60,30,0.3)' },
];
const LINES = [
  ['Ei! Ei, você! Graças a Deus… achei que eu era o único aqui.', 'Vem cá. Eu sei onde fica a saída. Eu te mostro.'],
  ['Oi… você também caiu aqui? Faz dias que eu não vejo ninguém.', 'Chega mais perto. Eu não mordo.'],
  ['Moço! Por favor, me ajuda. Eu tô perdido há muito tempo.', 'É por aqui. Vem comigo. Vem.'],
];

// O rosto verdadeiro: sem olhos, boca rasgada até as orelhas.
function trueFace() {
  const c = TEX.makeCanvas(256, 256);
  const x = c.getContext('2d');
  x.fillStyle = '#9a8f88';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    x.fillStyle = `rgba(${60 + Math.random() * 60},${30 + Math.random() * 30},${30 + Math.random() * 30},0.15)`;
    x.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
  }
  x.fillStyle = '#050303';
  for (const ex of [90, 166]) {
    x.beginPath();
    x.ellipse(ex, 105, 20, 26, 0, 0, Math.PI * 2);
    x.fill();
  }
  x.beginPath();
  x.moveTo(40, 160);
  x.quadraticCurveTo(128, 250, 216, 160);
  x.quadraticCurveTo(128, 200, 40, 160);
  x.fill();
  x.fillStyle = '#e8e0cc';
  for (let k = 0; k < 14; k++) {
    const t = k / 13;
    const px = lerp(55, 200, t);
    const py = 166 + Math.sin(t * Math.PI) * 26;
    x.beginPath();
    x.moveTo(px - 4, py);
    x.lineTo(px + 4, py);
    x.lineTo(px, py + 12);
    x.fill();
  }
  // costura da pele rasgada
  x.strokeStyle = '#5a1a14';
  x.lineWidth = 3;
  x.beginPath();
  x.moveTo(128, 0);
  for (let y = 0; y < 90; y += 8) x.lineTo(128 + (Math.random() - 0.5) * 12, y);
  x.stroke();
  return c;
}

export class SkinStealer {
  constructor(level) {
    this.L = level;
    this.game = level.game;
    this.state = 'off';
    this.timer = 30; // primeira aparição
    this.x = 0;
    this.z = 0;
    this.yaw = 0;
    this.lookI = 0;
    this.faceCanvas = trueFace();
    this.faceURL = this.faceCanvas.toDataURL();
    this.faceTex = TEX.toTex(this.faceCanvas, { repeat: false });
    this.build(0);
  }

  build(i) {
    if (this.npc) {
      this.npc.root.removeFromParent();
      this.npc.dispose();
    }
    const npc = new NPC(this.L, { id: 'ladrao', name: '', role: '', x: 0, z: 0, yaw: 0, h: 1.76, look: LOOKS[i % LOOKS.length] });
    npc.tag.visible = false;
    npc.root.visible = false;
    this.npc = npc;
    this.skinMat = npc.mats[2];
    this.headMat = npc.mats[5];
    this.humanFace = this.headMat.map;
    this.humanSkin = this.skinMat.color.clone();
    this.suitMat = npc.mats[0];
    this.humanSuit = this.suitMat.color.clone();
  }

  cell(v) {
    return Math.floor(v / this.L.cell);
  }

  center(i) {
    return (i + 0.5) * this.L.cell;
  }

  passable(ax, az, dx, dz) {
    const L = this.L;
    const t = dx ? L.edge(EV, dx > 0 ? ax + 1 : ax, az) : L.edge(EH, ax, dz > 0 ? az + 1 : az);
    return PASS.has(t);
  }

  // Próxima célula no caminho até (tx, tz) — busca em largura.
  pathStep(tx, tz) {
    const sx = this.cell(this.x);
    const sz = this.cell(this.z);
    const gx = this.cell(tx);
    const gz = this.cell(tz);
    if (sx === gx && sz === gz) return { x: tx, z: tz };
    const R = 30;
    const key = (x, z) => (x - sx + R) * 1000 + (z - sz + R);
    const prev = new Map([[key(sx, sz), null]]);
    const q = [[sx, sz]];
    let found = null;
    for (let qi = 0; qi < q.length && qi < 4000; qi++) {
      const [x, z] = q[qi];
      if (x === gx && z === gz) {
        found = [x, z];
        break;
      }
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const nz = z + dz;
        if (Math.abs(nx - sx) > R || Math.abs(nz - sz) > R) continue;
        const k = key(nx, nz);
        if (prev.has(k) || !this.passable(x, z, dx, dz)) continue;
        prev.set(k, [x, z]);
        q.push([nx, nz]);
      }
    }
    if (!found) return null;
    let cur = found;
    for (;;) {
      const p = prev.get(key(cur[0], cur[1]));
      if (!p || (p[0] === sx && p[1] === sz)) break;
      cur = p;
    }
    return { x: this.center(cur[0]), z: this.center(cur[1]) };
  }

  // Aparece num corredor à vista, a uns 15–30 m, parado e "normal".
  appear(player) {
    const L = this.L;
    const p = player.pos;
    for (let t = 0; t < 60; t++) {
      const a = player.yaw + (Math.random() - 0.5) * 1.6;
      const d = 14 + Math.random() * 16;
      const x = this.center(this.cell(p.x - Math.sin(a) * d));
      const z = this.center(this.cell(p.z - Math.cos(a) * d));
      if (!L.open(this.cell(x), this.cell(z))) continue;
      if (!L.chunkAt(x, z)) continue;
      if (!L.los(p.x, p.z, x, z)) continue;
      this.build(this.lookI++);
      this.x = x;
      this.z = z;
      this.yaw = Math.atan2(p.x - x, p.z - z);
      this.state = 'disguise';
      this.t = 0;
      this.spoke = false;
      this.backT = 0;
      this.npc.root.visible = true;
      this.setHuman(true);
      return true;
    }
    return false;
  }

  setHuman(h) {
    this.skinMat.color.copy(h ? this.humanSkin : new THREE.Color(0.55, 0.5, 0.48));
    this.headMat.map = h ? this.humanFace : this.faceTex;
    this.headMat.needsUpdate = true;
    const n = this.npc;
    n.root.scale.setScalar(1);
    for (const a of n.arms) a.sh.scale.set(1, 1, 1);
  }

  hide() {
    this.state = 'off';
    this.npc.root.visible = false;
    this.timer = 35 + Math.random() * 25;
    this.L.chased = false;
  }

  reveal() {
    const g = this.game;
    this.state = 'reveal';
    this.t = 0;
    g.hud.stopSay();
    g.audio.play('growl', { gain: 0.5, rate: 0.7, wet: 0.6 });
    g.audio.play('rift', { gain: 0.3, rate: 0.6 });
    g.glitch = 0.9;
    g.vibrate([80, 40, 160]);
    g.st.fear = 1;
  }

  update(dt, player) {
    const g = this.game;
    const L = this.L;
    const p = player.pos;
    const n = this.npc;
    if (this.state === 'off') {
      this.timer -= dt;
      if (this.timer <= 0 && !this.appear(player)) this.timer = 4;
      return;
    }
    this.t += dt;
    const dx = p.x - this.x;
    const dz = p.z - this.z;
    const d = Math.hypot(dx, dz);
    const sees = L.los(this.x, this.z, p.x, p.z);
    const toP = Math.atan2(dx, dz);
    // o andarilho está olhando para ele?
    const fwdX = -Math.sin(player.yaw);
    const fwdZ = -Math.cos(player.yaw);
    const watched = sees && (-dx * fwdX - dz * fwdZ) / Math.max(d, 0.01) > 0.8;
    let speed = 0;
    if (this.state === 'disguise') {
      this.yaw += angleDiff(toP, this.yaw) * Math.min(1, dt * 2);
      if (sees && d < 26 && !this.spoke && !g.hud.dlg) {
        this.spoke = true;
        g.hud.say(LINES[(this.lookI - 1) % LINES.length], null, 'DESCONHECIDO');
        if (!L.toldTells) {
          L.toldTells = true;
          setTimeout(() => g.level === L && g.hud.message('Ele não pisca. Nem uma vez.', 3), 9000);
        }
      }
      // anda devagar até o andarilho, sempre sorrindo
      if (d > 2.5 && this.t > 2) speed = WALK;
      // dar as costas a ele de perto é um erro
      this.backT = !watched && d < 9 ? this.backT + dt : Math.max(0, this.backT - dt);
      if (d < 3.2 || this.backT > 1.6 || this.t > 50) this.reveal();
      // tique: a cabeça gira demais por um instante
      const tic = Math.sin(this.t * 0.7) > 0.97 ? Math.sin(this.t * 40) * 0.8 : 0;
      n.head.rotation.set(0, tic, tic * 0.4);
      if (d > 45 && !sees) this.hide();
    } else if (this.state === 'reveal') {
      const k = smoothstep(0, 1.3, this.t);
      if (this.t > 0.35 && !this.revealed) {
        this.revealed = true;
        this.skinMat.color.setRGB(0.55, 0.5, 0.48);
        this.suitMat.color.multiplyScalar(0.35);
        this.headMat.map = this.faceTex;
        this.headMat.needsUpdate = true;
        if (!L.toldReveal) {
          L.toldReveal = true;
          g.hud.message('Isso NÃO é uma pessoa. A pele rasga. CORRA!', 4);
        } else g.hud.message('A pele rasga de novo. CORRA!', 3);
      }
      n.root.scale.set(1, 1 + k * 0.18, 1);
      for (const a of n.arms) {
        a.sh.scale.set(1, 1 + k * 0.6, 1);
        a.sh.rotation.x = -k * 0.6;
      }
      n.head.rotation.set(-0.3 * k, Math.sin(this.t * 30) * 0.4 * (1 - k), Math.sin(this.t * 25) * 0.3);
      this.yaw = toP;
      if (this.t > 1.4) {
        this.revealed = false;
        this.state = 'chase';
        this.lost = 0;
        this.t = 0;
        L.chased = true;
        this.growlT = 0;
      }
    } else if (this.state === 'chase') {
      speed = CHASE;
      this.lost = sees ? 0 : this.lost + dt;
      g.st.fear = Math.max(g.st.fear, clamp(1 - d / 25, 0.3, 1));
      this.growlT -= dt;
      if (this.growlT <= 0) {
        this.growlT = 1.5 + Math.random() * 2;
        g.audio.play(Math.random() < 0.5 ? 'growl' : 'whisper', { gain: clamp(0.5 - d / 60, 0.08, 0.5), rate: 0.6 + Math.random() * 0.3, wet: 0.8 });
      }
      n.head.rotation.set(-0.2, Math.sin(this.t * 13) * 0.3, Math.sin(this.t * 9) * 0.25);
      if (d < 0.95) {
        g.caught({ image: this.faceURL, text: 'O Ladrão de Peles te alcançou. Não confie em ninguém aqui — e nunca dê as costas a um "humano".', sanity: 55 });
        g.damage = 1;
        this.hide();
        this.timer = 45;
        return;
      }
      if (this.lost > LOSE || d > 60) {
        g.hud.message('Os passos somem. Ele perdeu você… por enquanto.', 4);
        this.hide();
        return;
      }
    }
    // movimento
    if (speed > 0) {
      // caminho pelo labirinto (recalculado algumas vezes por segundo)
      this.pathT = (this.pathT || 0) - dt;
      if (!sees && (this.pathT <= 0 || !this.wp)) {
        this.pathT = 0.25;
        this.wp = this.pathStep(p.x, p.z);
      }
      const tgt = sees || !this.wp ? { x: p.x, z: p.z } : this.wp;
      const ax = tgt.x - this.x;
      const az = tgt.z - this.z;
      const al = Math.hypot(ax, az) || 1;
      const step = Math.min(al, speed * dt);
      const q = { x: this.x + (ax / al) * step, z: this.z + (az / al) * step };
      L.collide(q, 0.32);
      this.x = q.x;
      this.z = q.z;
      this.yaw += angleDiff(Math.atan2(ax, az), this.yaw) * Math.min(1, dt * 8);
      this.ph = (this.ph || 0) + dt * speed * 3.2;
    }
    // pose
    const walk = speed > 0 ? 1 : 0;
    const ph = this.ph || 0;
    n.legs.forEach((hip, i) => {
      const s = i ? 1 : -1;
      hip.rotation.x = Math.sin(ph) * (this.state === 'chase' ? 0.8 : 0.45) * s * walk;
    });
    if (this.state !== 'reveal')
      n.arms.forEach((a, i) => {
        const s = i ? -1 : 1;
        if (this.state === 'chase') {
          a.sh.rotation.x = -1.2 + Math.sin(ph * 2 + i) * 0.4;
          a.sh.rotation.z = a.sx * 0.35;
        } else {
          // um aceno de vez em quando
          const wave = this.state === 'disguise' && i === 1 && this.t < 4 ? 1 : 0;
          a.sh.rotation.x = wave ? -2.6 : Math.sin(ph) * 0.35 * s * walk;
          a.sh.rotation.z = wave ? -0.3 + Math.sin(this.t * 9) * 0.35 : a.sx * 0.06;
        }
      });
    n.root.position.set(this.x, 0, this.z);
    n.root.rotation.set(this.state === 'chase' ? 0.18 : 0, this.yaw, 0);
    const lv = clamp(L.lightLevel(this.x, this.z), 0.15, 1.2);
    n.amb.value.set(lv, lv * 0.97, lv * 0.92);
  }

  // Para o radar e a seta: posição atual (se visível).
  get active() {
    return this.state !== 'off';
  }

  dispose() {
    this.npc.root.removeFromParent();
    this.npc.dispose();
    this.faceTex.dispose();
  }
}
