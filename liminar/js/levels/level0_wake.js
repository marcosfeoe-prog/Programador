// Nível 0 — despertar vindo das Frontrooms: a câmera mostra o próprio
// andarilho de fora, deitado no carpete; ele se levanta, olha ao redor, e a
// câmera avança pelo corredor mostrando o Nível 0 antes de voltar aos olhos dele.
import * as THREE from 'three';
import { lerp, smoothstep } from '../util.js';
import { makeMike, CineBars, subsAt } from './level177_common.js';

const _p = new THREE.Vector3();
const _l = new THREE.Vector3();

export class ThirdPersonWake {
  constructor(level) {
    this.L = level;
    this.game = level.game;
    const g = this.game;
    this.t = 0;
    this.active = true;
    this.end = 15;
    const s = level.spawn;
    this.x = s.x;
    this.z = s.z;
    // direção do corredor mais longo a partir do ponto inicial
    let best = { len: -1, yaw: s.yaw };
    for (let k = 0; k < 8; k++) {
      const yaw = (k / 8) * Math.PI * 2;
      const dx = -Math.sin(yaw);
      const dz = -Math.cos(yaw);
      let len = 0;
      while (len < 24 && level.los(this.x, this.z, this.x + dx * (len + 1), this.z + dz * (len + 1))) len += 1;
      if (len > best.len) best = { len, yaw };
    }
    this.yaw = best.yaw;
    this.run = Math.max(4, best.len - 1.5);
    this.dir = { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
    // lado com espaço para a câmera (sem atravessar paredes)
    const L = level;
    const free = (sx, d) => L.los(this.x, this.z, this.x - this.dir.x * 1.9 + this.dir.z * sx * d, this.z - this.dir.z * 1.9 - this.dir.x * sx * d);
    this.side = free(1, 1.7) ? 1 : free(-1, 1.7) ? -1 : 0;
    this.back = L.los(this.x, this.z, this.x - this.dir.x * 2.2, this.z - this.dir.z * 2.2) ? 1.9 : 0.6;
    g.player.frozen = true;
    g.hud.show(false);
    this.bars = new CineBars(() => (this.t = Math.max(this.t, this.end - 0.8)));
    this.subs = [
      [0.8, 'Carpete úmido. Cheiro de mofo. Um zumbido que não para.'],
      [4.2, 'Você se levanta devagar. Paredes amarelas para todo lado.'],
      [7.4, 'Nenhuma janela. Nenhuma porta. Nenhuma casa.'],
      [10.4, 'Os Bastidores. Nível 0.'],
      [14.0, ''],
    ];
    this.si = { i: 0 };
    const me = makeMike(level);
    me.amb.value.set(0.95, 0.85, 0.55);
    me.root.visible = true;
    me.root.position.set(this.x, 0.05, this.z);
    me.root.rotation.order = 'YXZ';
    me.root.rotation.set(-Math.PI / 2, this.yaw + Math.PI, 0);
    this.me = me;
    g.fade = 1;
    g.fadeTarget = 1;
    g.glitch = 0.8;
    g.audio.play('breath', { gain: 0.35, wet: 0.3 });
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    const t = this.t;
    if (g.input.pressed('interact')) this.t = Math.max(this.t, this.end - 0.8);
    const s = subsAt(this.subs, t, this.si);
    if (s !== null) this.bars.sub(s);
    // pálpebras: abre, pisca, abre
    const blink = t < 0.8 ? 1 : t < 2 ? lerp(1, 0.2, (t - 0.8) / 1.2) : t < 2.4 ? 0.7 : t < 13.6 ? 0 : smoothstep(13.6, 14.2, t) * 0.8 * (1 - smoothstep(14.4, 15, t));
    g.fade = blink;
    g.fadeTarget = blink;
    const me = this.me;
    const { x, z, dir, yaw } = this;
    // o corpo: deitado → sentado → de pé (de costas para o corredor, depois vira)
    const up = smoothstep(3.2, 6.4, t);
    me.root.rotation.x = (-Math.PI / 2) * (1 - up);
    me.root.position.y = 0.05 * (1 - up);
    const turn = smoothstep(6.4, 8.8, t);
    me.root.rotation.y = yaw + turn * Math.PI;
    // olha em volta
    const look = t > 6.4 && t < 10 ? Math.sin((t - 6.4) * 1.8) * 0.9 : 0;
    me.head.rotation.set(t < 6 ? 0 : -0.05, look, 0);
    const br = Math.sin(t * 1.5);
    me.torso.scale.set(1 + br * 0.01, 1 + br * 0.015, 1);
    for (const a of me.arms) {
      a.sh.rotation.x = -0.4 * (1 - up) * Math.sin(t * 2) + (t > 4 && t < 6 ? -0.3 : 0);
      a.sh.rotation.z = a.sx * 0.1;
    }
    // câmera
    const cam = g.camera;
    if (t < 6.4) {
      // de cima, descendo enquanto ele se levanta
      const a = 0.5 + t * 0.12;
      let R = 2.6;
      while (R > 0.8 && !this.L.los(x, z, x + Math.sin(yaw + a) * (R + 0.4), z + Math.cos(yaw + a) * (R + 0.4))) R -= 0.2;
      _p.set(x + Math.sin(yaw + a) * R, lerp(2.6, 1.6, smoothstep(2, 6.4, t)), z + Math.cos(yaw + a) * R);
      _l.set(x, lerp(0.2, 1.3, up), z);
    } else if (t < 10) {
      // ao lado dele, enquanto olha ao redor
      const k = smoothstep(6.4, 10, t);
      const sd = this.side * lerp(1.5, 0.7, k);
      _p.set(x - dir.x * this.back + dir.z * sd, lerp(1.6, 1.75, k), z - dir.z * this.back - dir.x * sd);
      _l.set(x + dir.x * 2, 1.5, z + dir.z * 2);
    } else if (t < 13) {
      // a câmera avança pelo corredor, passando por ele
      const k = smoothstep(10, 13, t);
      const d = lerp(-this.back, this.run, k);
      _p.set(x + dir.x * d, 1.65 + Math.sin(k * Math.PI) * 0.2, z + dir.z * d);
      _l.set(x + dir.x * (d + 4), 1.5, z + dir.z * (d + 4));
    } else {
      // e volta para os olhos dele
      const k = smoothstep(13, 14.6, t);
      const d = lerp(this.run, 0, k);
      _p.set(x + dir.x * d, lerp(1.65, 1.62, k), z + dir.z * d);
      _l.set(x + dir.x * (d + 4), 1.5, z + dir.z * (d + 4));
      me.root.visible = k < 0.9;
    }
    cam.position.copy(_p);
    cam.up.set(0, 1, 0);
    cam.lookAt(_l);
    if (t >= this.end) this.finish();
  }

  finish() {
    if (!this.active) return;
    const g = this.game;
    this.active = false;
    this.dispose();
    g.fade = 0;
    g.fadeTarget = 0;
    g.hud.show(true);
    g.player.frozen = false;
    g.player.pos.x = this.x;
    g.player.pos.z = this.z;
    g.player.yaw = this.yaw;
    g.player.pitch = 0;
    g.hud.say(['Onde… onde eu tô? Eu tava em casa agora mesmo.', 'Isso não pode ser real. Tem que ter uma saída.'], () => g.hud.objective('Encontre a saída do Nível 0.', 6));
  }

  dispose() {
    if (this.bars) this.bars.dispose();
    this.bars = null;
    if (this.me) {
      this.me.root.removeFromParent();
      this.me.dispose();
      this.me = null;
    }
  }
}
