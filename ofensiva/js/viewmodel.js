// Visão em primeira pessoa: arma + braços numa cena separada (não atravessa
// paredes), com balanço ao andar, atraso do mouse, coice, recarga, troca de arma,
// golpe de faca, arremesso de granada e inspeção (tecla F).
import * as THREE from 'three';
import { buildGun, buildArms } from './models.js';
import { muzzleTex } from './textures.js';
import { clamp, damp } from './util.js';

const HOLD = {
  rifle: { pos: [0.19, -0.2, -0.46], left: [0, 0.03, -0.33] },
  sniper: { pos: [0.18, -0.2, -0.46], left: [0, 0.01, -0.38] },
  smg: { pos: [0.18, -0.19, -0.44], left: [0, -0.02, -0.17] },
  shotgun: { pos: [0.19, -0.2, -0.46], left: [0, 0.02, -0.38] },
  pistol: { pos: [0.14, -0.15, -0.46], left: [-0.02, -0.04, 0.02] },
  knife: { pos: [0.18, -0.19, -0.4], left: null },
  grenade: { pos: [0.16, -0.18, -0.4], left: null },
  bomb: { pos: [0.08, -0.22, -0.42], left: [-0.1, 0.0, 0.0] },
};

export class ViewModel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight(0xfff2dd, 0x6a5a40, 1.4));
    const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
    sun.position.set(0.5, 1, 0.3);
    this.scene.add(sun);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.holder = new THREE.Group();
    this.holder.scale.setScalar(0.8);
    this.root.add(this.holder);
    this.gun = null;
    this.arms = null;
    this.team = null;
    this.id = null;
    this.type = 'rifle';
    this.t = 0;
    this.draw = 0;
    this.drawDur = 0.5;
    this.kickZ = 0;
    this.kickR = 0;
    this.reloadT = 0;
    this.reloadDur = 0;
    this.slashT = 0;
    this.slashDir = 1;
    this.throwT = 0;
    this.inspectT = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.bob = 0;
    this.land = 0;
    this.visible = true;

    this.flash = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: muzzleTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, depthTest: false }),
    );
    this.flash.visible = false;
    this.flashT = 0;
    this.flashLight = new THREE.PointLight(0xffb060, 0, 3);
    this.root.add(this.flashLight);
  }

  setTeam(team) {
    if (this.team === team) return;
    this.team = team;
    if (this.arms) {
      this.holder.remove(this.arms.right);
      this.holder.remove(this.arms.left);
    }
    this.arms = buildArms(team);
    this.holder.add(this.arms.right);
    this.holder.add(this.arms.left);
    const id = this.id;
    this.id = null;
    if (id) this.equip(id, this.type, 0.01);
  }

  equip(id, type, drawTime = 0.5) {
    if (this.gun) this.holder.remove(this.gun);
    if (this.flash.parent) this.flash.parent.remove(this.flash);
    this.id = id;
    this.type = type;
    this.gun = buildGun(id);
    this.gun.traverse((o) => {
      if (o.isMesh) o.castShadow = false;
    });
    this.holder.add(this.gun);
    this.gun.add(this.flash);
    this.flash.position.copy(this.gun.userData.muzzle);
    this.draw = 0;
    this.drawDur = drawTime;
    this.reloadT = 0;
    this.inspectT = 0;
    this.slashT = 0;
    this.throwT = 0;
    const h = HOLD[type] || HOLD.rifle;
    this.holder.position.set(...h.pos);
    if (this.arms) {
      // braço direito no punho, vindo de baixo/trás
      const r = this.arms.right;
      r.position.set(0.02, -0.04, 0.06);
      r.rotation.set(0.85, 0.2, 0);
      const l = this.arms.left;
      if (h.left) {
        l.visible = true;
        l.position.set(h.left[0] - 0.03, h.left[1] - 0.04, h.left[2]);
        l.rotation.set(0.9, -0.35, 0.2);
        if (type === 'pistol') l.rotation.set(1.0, 0.45, -0.3);
      } else l.visible = false;
    }
  }

  kick(strength = 1) {
    this.kickZ = Math.min(0.09, this.kickZ + 0.03 * strength);
    this.kickR = Math.min(0.25, this.kickR + 0.06 * strength);
    if (this.type !== 'knife' && this.type !== 'grenade') {
      this.flashT = 0.045;
      this.flash.visible = true;
      this.flash.material.rotation = Math.random() * 6.28;
      const s = this.type === 'pistol' ? 0.16 : 0.24;
      this.flash.scale.set(s, s, 1);
      this.flashLight.intensity = 2.5;
      this.flashLight.position.copy(this.holder.position).add(new THREE.Vector3(0, 0.05, -0.6));
    }
    const sl = this.gun?.userData.slide;
    if (sl && this.type === 'pistol') sl.position.z = this.gun.userData.slideHome.z + 0.03;
    this.inspectT = 0;
  }

  reload(dur) {
    this.reloadT = dur;
    this.reloadDur = dur;
    this.inspectT = 0;
  }

  cancelReload() {
    this.reloadT = 0;
  }

  slash() {
    this.slashT = 0.35;
    this.slashDir = -this.slashDir;
  }

  throwAnim() {
    this.throwT = 0.5;
  }

  inspect() {
    if (this.reloadT <= 0 && this.draw >= this.drawDur) this.inspectT = 2.6;
  }

  landed(k) {
    this.land = Math.min(1, this.land + k);
  }

  update(dt, s) {
    this.t += dt;
    const g = this.gun;
    if (!g) return;
    this.draw = Math.min(this.drawDur, this.draw + dt);
    const drawK = 1 - this.draw / this.drawDur;

    // balanço ao andar
    const sp = s.onGround ? clamp(s.speed / 6, 0, 1) : 0;
    this.bob += dt * (6 + s.speed * 1.2) * (sp > 0.05 ? 1 : 0);
    const bobAmp = sp * 0.012;
    const bx = Math.cos(this.bob) * bobAmp;
    const by = -Math.abs(Math.sin(this.bob)) * bobAmp * 1.2;

    // atraso do mouse
    this.swayX = damp(this.swayX, clamp(-s.mouseDX * 0.0009, -0.04, 0.04), 10, dt);
    this.swayY = damp(this.swayY, clamp(s.mouseDY * 0.0009, -0.04, 0.04), 10, dt);

    this.kickZ = damp(this.kickZ, 0, 14, dt);
    this.kickR = damp(this.kickR, 0, 12, dt);
    this.land = damp(this.land, 0, 8, dt);
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) {
        this.flash.visible = false;
        this.flashLight.intensity = 0;
      }
    }
    const sl = g.userData.slide;
    if (sl) sl.position.z = damp(sl.position.z, g.userData.slideHome.z, 18, dt);

    const h = HOLD[this.type] || HOLD.rifle;
    let px = h.pos[0] + bx + this.swayX;
    let py = h.pos[1] + by + this.swayY - drawK * 0.25 - this.land * 0.03 - s.crouch * 0.01;
    let pz = h.pos[2] + this.kickZ;
    let rx = this.kickR - drawK * 0.6;
    let ry = 0;
    let rz = this.swayX * 2;

    // recarga: inclina a arma e tira/coloca o carregador
    const mag = g.userData.mag;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      const k = 1 - Math.max(0, this.reloadT) / this.reloadDur;
      const bell = Math.sin(Math.min(1, k) * Math.PI);
      rz += bell * 0.5;
      rx += bell * 0.15;
      py -= bell * 0.04;
      if (mag) {
        const out = k > 0.15 && k < 0.6 ? Math.sin(((k - 0.15) / 0.45) * Math.PI) : 0;
        mag.position.copy(g.userData.magHome);
        mag.position.y -= out * 0.25;
        mag.visible = !(k > 0.3 && k < 0.45);
      }
    } else if (mag) {
      mag.position.copy(g.userData.magHome);
      mag.visible = true;
    }

    // inspeção
    if (this.inspectT > 0) {
      this.inspectT -= dt;
      const k = 1 - this.inspectT / 2.6;
      const e = Math.sin(k * Math.PI);
      ry += e * 0.9 * Math.sin(k * Math.PI * 2 + 0.3);
      rz += e * 0.6;
      px -= e * 0.05;
      py += e * 0.03;
    }

    // faca
    if (this.slashT > 0) {
      this.slashT -= dt;
      const k = 1 - this.slashT / 0.35;
      const e = Math.sin(k * Math.PI);
      ry += this.slashDir * (k - 0.5) * 2.0 * e;
      rx += -e * 0.4;
      px -= e * 0.08 * this.slashDir;
      pz -= e * 0.1;
    }
    // granada
    if (this.throwT > 0) {
      this.throwT -= dt;
      const k = 1 - this.throwT / 0.5;
      const e = Math.sin(k * Math.PI);
      pz -= e * 0.25;
      py += e * 0.12;
      rx += e * 0.8;
      if (k > 0.45) g.visible = false;
    } else g.visible = true;

    this.holder.position.set(px, py, pz);
    this.holder.rotation.set(rx, ry, rz);
    this.root.visible = this.visible && !s.scoped;
  }

  render(renderer, fov, aspect) {
    if (!this.root.visible) return;
    this.camera.fov = fov;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }
}
