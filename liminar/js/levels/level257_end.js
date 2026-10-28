// Nível 257 — o fim: flashback de todos os níveis, o Mike olhando as próprias
// mãos, a janela com o paraíso lá fora e o sol crescendo, e a porta para o escuro.
import * as THREE from 'three';
import { makeMike, walkPose, CineBars, subsAt } from './level177_common.js';
import { LEN, cx } from './level257_path.js';
import { clamp, lerp, smoothstep } from '../util.js';

export const FLASH_KEYS = ['fr', '0', '1', '2', '3', '4', '5', '8', '9', '10', '10_1', '11', '12', '12_2', '14', '15', '16', '23', '34', '35', '37', '43', '44', '45', '46', '47', '48', '49', '122', '62'];

export function preloadFlash() {
  return FLASH_KEYS.map((k) => {
    const im = new window.Image();
    im.src = `assets/flash/${k}.jpg`;
    return im;
  });
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

export class Ending {
  constructor(L) {
    this.L = L;
    this.game = L.game;
    const g = this.game;
    this.t = 0;
    this.active = true;
    this.si = { i: 0 };
    g.player.frozen = true;
    g.input.enabled = false;
    g.hud.stopSay();
    g.hud.show(false);
    this.bars = new CineBars(() => this.skip());
    // flashback (DOM por cima do jogo)
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:30;background:#000 center/cover no-repeat;pointer-events:none;';
    const wf = document.createElement('div');
    wf.style.cssText = 'position:fixed;inset:0;z-index:31;background:#fff;opacity:0;pointer-events:none;';
    document.body.append(ov, wf);
    this.ov = ov;
    this.wf = wf;
    this.imgs = L.flashImgs || [];
    this.fi = -1;
    // tempos de cada imagem (cada vez mais rápido)
    this.ft = [];
    let acc = 0.25;
    for (let i = 0; i < this.imgs.length; i++) {
      this.ft.push(acc);
      acc += lerp(0.17, 0.06, i / Math.max(1, this.imgs.length - 1));
    }
    this.flashEnd = acc + 0.15;
    g.audio.play('transition', { gain: 0.35, rate: 0.6 });
    g.audio.play('heart', { gain: 0.3 });
    // o Mike
    const s0 = 964;
    this.me = makeMike(L);
    this.me.amb.value.set(1.0, 0.72, 0.5);
    this.pos = { x: cx(s0) - 0.6, z: -s0 };
    this.subs = [
      [this.flashEnd + 0.8, 'MIKE: …Tudo isso. Eu passei por tudo isso.'],
      [this.flashEnd + 4.2, 'MIKE: Minhas mãos… elas ainda são minhas. Eu ainda sou eu.'],
      [this.flashEnd + 8.0, 'MIKE: Quantos lugares. Quantas portas. Quantas vezes eu achei que não ia aguentar.'],
      [this.flashEnd + 12.0, 'MIKE: Olha lá fora…'],
      [this.flashEnd + 15.2, 'MIKE: Parece o paraíso. Tão calmo… o sol nunca termina de se pôr aqui.'],
      [this.flashEnd + 19.2, 'MIKE: Eu podia ficar aqui pra sempre. Seria tão fácil.'],
      [this.flashEnd + 22.6, ''],
      [this.flashEnd + 24.0, 'MIKE: Mas tem uma porta.'],
      [this.flashEnd + 27.0, 'MIKE: Eu não sei pra onde ela leva. Nunca soube.'],
      [this.flashEnd + 30.6, 'MIKE: Mas eu cheguei longe demais pra desistir agora.'],
      [this.flashEnd + 34.4, 'MIKE: Seja o que for que estiver do outro lado… eu vou.'],
      [this.flashEnd + 38.0, ''],
    ];
    this.T = (x) => this.flashEnd + x;
  }

  update(dt) {
    const g = this.game;
    const L = this.L;
    if (this.done) return;
    this.t += dt;
    const t = this.t;
    const s = subsAt(this.subs, t, this.si);
    if (s !== null) this.bars.sub(s);
    // ---- flashback
    if (t < this.flashEnd + 0.6) {
      let i = -1;
      while (i + 1 < this.ft.length && t >= this.ft[i + 1]) i++;
      if (i !== this.fi && i >= 0 && this.imgs[i]) {
        this.fi = i;
        this.ov.style.backgroundImage = `url(${this.imgs[i].src})`;
        this.ov.style.filter = `contrast(${1.1 + Math.random() * 0.4}) saturate(${0.8 + Math.random() * 0.6}) blur(${Math.random() < 0.3 ? 1.5 : 0}px)`;
        this.ov.style.transform = `scale(${1.02 + Math.random() * 0.06}) translate(${(Math.random() - 0.5) * 2}%, ${(Math.random() - 0.5) * 2}%)`;
        this.wf.style.opacity = '0.55';
        g.audio.play('click', { gain: 0.12, rate: 0.6 + Math.random() * 0.8 });
      }
      this.wf.style.opacity = String(Math.max(0, Number(this.wf.style.opacity) - dt * 6));
      if (t > this.flashEnd) {
        this.ov.style.opacity = String(1 - clamp((t - this.flashEnd) / 0.6, 0, 1));
        this.wf.style.opacity = String(1 - clamp((t - this.flashEnd) / 0.6, 0, 1));
      }
      if (t < this.flashEnd) return;
    } else if (this.ov) {
      this.ov.remove();
      this.wf.remove();
      this.ov = this.wf = null;
    }
    const me = this.me;
    const T = this.T;
    me.root.visible = true;
    const cam = g.camera;
    const O = L.outside;
    const u = g.post.u;
    if (t < T(23)) {
      // ---- mãos e janela
      const px = this.pos.x;
      const pz = this.pos.z;
      me.root.position.set(px, 0, pz);
      const turn = smoothstep(T(11), T(14), t);
      me.root.rotation.y = lerp(Math.PI, Math.PI * 1.5, turn);
      const hands = smoothstep(T(1.5), T(3.5), t) * (1 - smoothstep(T(10.5), T(12), t));
      for (const a of me.arms) {
        a.sh.rotation.set(-0.85 * hands, 0, a.sx * (0.06 - 0.16 * hands));
        a.el.rotation.set(-1.3 * hands, 0, -a.sx * 0.5 * hands);
      }
      // mão virando devagar, como quem olha a palma e o dorso
      if (me.arms[0].hand) for (const a of me.arms) a.hand.rotation.y = Math.sin(t * 0.8) * 0.6 * hands;
      me.head.rotation.set(0.55 * hands - 0.08 * turn, 0, 0);
      const br = Math.sin(t * 1.4);
      me.torso.scale.set(1 + br * 0.008, 1 + br * 0.012, 1);
      if (t < T(11)) {
        // de frente para ele, um pouco de lado e de cima
        const k = smoothstep(T(0), T(11), t);
        _v.set(px + lerp(1.1, 0.55, k), lerp(1.85, 1.7, k), pz - lerp(1.6, 1.15, k));
        _w.set(px, lerp(1.4, 1.25, k), pz - 0.15);
      } else {
        // por trás do ombro, olhando a janela
        const k = smoothstep(T(11), T(16), t);
        _v.set(px + lerp(1.2, 2.2, k), lerp(1.75, 1.95, k), pz + lerp(-1.2, 0.8, k));
        _w.set(px - 8, lerp(1.4, 2.6, k), pz - lerp(0, 1.5, k));
      }
      this.camTo(_v, t < T(0.2) ? 1 : 1 - Math.exp(-dt * 2.2));
      cam.up.set(0, 1, 0);
      cam.lookAt(_w);
      // o paraíso: o sol cresce, tudo fica mais laranja
      const glow = smoothstep(T(12), T(21), t);
      O.sunSize = lerp(70, 300, glow);
      u.uExposure.value = lerp(L.look.exposure, 1.35, glow);
      u.uTint.value.setRGB(lerp(1.12, 1.3, glow), lerp(0.95, 0.88, glow), lerp(0.78, 0.6, glow));
      u.uBloom.value = lerp(L.look.bloom, 1.1, glow);
      L.sun.intensity = lerp(L.sunI, L.sunI * 1.6, glow);
      // corte para a porta
      const f = smoothstep(T(21.5), T(22.8), t);
      g.fade = f;
      g.fadeTarget = f;
      if (t >= T(22.8) && !this.cut) {
        this.cut = true;
        this.wpos = { s: 991 };
      }
      return;
    }
    // ---- a porta
    g.fade = 1 - smoothstep(T(23), T(24.2), t);
    if (t > T(36)) g.fade = smoothstep(T(36), T(38.5), t);
    g.fadeTarget = g.fade;
    const walk1 = smoothstep(T(23.5), T(29.5), t);
    const walk2 = smoothstep(T(33), T(37), t);
    const sNow = lerp(991, LEN - 0.9, walk1) + walk2 * 2.6;
    const mx = cx(sNow);
    const mz = -sNow;
    me.root.position.set(mx, 0, mz);
    me.root.rotation.set(0, Math.PI, 0);
    const walking = (t > T(23.5) && t < T(29.5)) || (t > T(33) && t < T(37));
    this.ph = (this.ph || 0) + dt * (walking ? 5.5 : 0);
    walkPose(me, this.ph, walking ? 1 : 0);
    me.head.rotation.set(walk1 >= 1 && walk2 <= 0 ? -0.08 : 0, t > T(26) && t < T(28.5) ? Math.sin((t - T(26)) * 1.4) * 0.5 : 0, 0);
    // a porta abre (para dentro do escuro)
    L.doorOpen = smoothstep(T(30.2), T(32.4), t);
    if (t > T(30.2) && !this.creak) {
      this.creak = true;
      g.audio.play('creak', { gain: 0.35, rate: 0.6, wet: 1.0 });
    }
    // o corpo some no escuro
    me.root.visible = walk2 < 0.85;
    const camS = Math.min(991 + walk1 * 5 - 4.5, LEN - 4.2);
    _v.set(cx(camS) + 1.0, 1.85, -camS);
    _w.set(cx(LEN) * 0.7 + mx * 0.3, 1.45, -LEN - 2);
    this.camTo(_v, t < T(23.1) ? 1 : 1 - Math.exp(-dt * 2));
    cam.up.set(0, 1, 0);
    cam.lookAt(_w);
    if (t > T(38.6) && !this.done) {
      this.done = true;
      this.dispose();
      g.post.u.uFadeColor.value.setRGB(0, 0, 0);
      g.reachExit('noclip', 0.1);
    }
  }

  // o jogador recoloca a câmera todo quadro; a cena guarda a sua própria posição
  camTo(v, k) {
    if (!this.cp) this.cp = v.clone();
    this.cp.lerp(v, k);
    this.game.camera.position.copy(this.cp);
  }

  // pular: vai direto para a escuridão
  skip() {
    if (this.done || this.t < 1) return;
    this.done = true;
    this.dispose();
    this.game.fade = 1;
    this.game.fadeTarget = 1;
    this.game.post.u.uFadeColor.value.setRGB(0, 0, 0);
    this.game.reachExit('noclip', 0.1);
  }

  dispose() {
    if (this.bars) this.bars.dispose();
    this.bars = null;
    for (const e of [this.ov, this.wf]) if (e) e.remove();
    this.ov = this.wf = null;
    if (this.me) {
      this.me.root.visible = false;
    }
  }

  destroy() {
    this.dispose();
    if (this.me) {
      this.me.root.removeFromParent();
      this.me.dispose();
      this.me = null;
    }
  }
}
