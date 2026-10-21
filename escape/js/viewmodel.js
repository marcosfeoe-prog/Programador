// Braços em primeira pessoa: lanterna na mão direita, garrafa de água de
// amêndoas na esquerda (animação de beber) e o gesto de alcançar ao usar.
import * as THREE from 'three';
import { damp } from './util.js';
import { bottleLabel } from './textures.js';

export class ViewModel {
  constructor() {
    this.scene = new THREE.Scene();
    this.hemi = new THREE.HemisphereLight(0xfff0d0, 0x302820, 1.6);
    this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xffffff, 1.2);
    this.key.position.set(0.5, 1, 0.6);
    this.scene.add(this.key);
    this.root = new THREE.Group();
    this.scene.add(this.root);

    const suit = new THREE.MeshLambertMaterial({ color: 0xc9a227 });
    const glove = new THREE.MeshLambertMaterial({ color: 0x2b2b2b });
    const metal = new THREE.MeshLambertMaterial({ color: 0x1d1d1f });
    this.lens = new THREE.MeshBasicMaterial({ color: 0xfff6d8 });

    // Braço direito + lanterna.
    this.right = new THREE.Group();
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.34, 10), suit);
    sleeve.rotation.x = Math.PI / 2;
    sleeve.position.z = 0.17;
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.04, 10), glove);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.z = 0.0;
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.07, 0.11), glove);
    hand.position.set(0, 0, -0.06);
    const torch = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.2, 10), metal);
    body.rotation.x = Math.PI / 2;
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.024, 0.06, 12), metal);
    head.rotation.x = Math.PI / 2;
    head.position.z = -0.12;
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12), this.lens);
    lens.position.z = -0.151;
    torch.add(body, head, lens);
    torch.position.set(0, 0.03, -0.1);
    this.right.add(sleeve, cuff, hand, torch);
    this.rightBase = new THREE.Vector3(0.25, -0.25, -0.5);
    this.root.add(this.right);

    // Braço esquerdo + garrafa (só aparece ao beber).
    this.left = new THREE.Group();
    const sleeveL = sleeve.clone();
    const handL = hand.clone();
    const bottle = new THREE.Group();
    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.17, 14),
      new THREE.MeshLambertMaterial({ color: 0xe8e4d0, transparent: true, opacity: 0.85 }),
    );
    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0365, 0.0365, 0.07, 14, 1, true),
      new THREE.MeshLambertMaterial({ map: bottleLabel() }),
    );
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.03, 0.05, 10), glass.material);
    neck.position.y = 0.11;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.02, 10), new THREE.MeshLambertMaterial({ color: 0x5f7a2e }));
    cap.position.y = 0.145;
    bottle.add(glass, label, neck, cap);
    bottle.position.set(0, 0.05, -0.07);
    this.left.add(sleeveL, handL, bottle);
    this.leftBase = new THREE.Vector3(-0.22, -0.5, -0.42);
    this.left.position.copy(this.leftBase);
    this.left.visible = false;
    this.root.add(this.left);

    this.drinkT = -1;
    this.reachT = -1;
    this.sway = new THREE.Vector2();
    this.lowered = 0;
  }

  reset() {
    this.drinkT = -1;
    this.reachT = -1;
    this.left.visible = false;
  }

  drink() {
    if (this.drinkT >= 0) return false;
    this.drinkT = 0;
    this.left.visible = true;
    return true;
  }

  reach() {
    this.reachT = 0;
  }

  get drinking() {
    return this.drinkT >= 0;
  }

  update(dt, player, time) {
    const ph = player.stepPhase * Math.PI * 2;
    const amp = player.bobAmp;
    this.sway.x = damp(this.sway.x, -player.lookSway.x * 0.04, 8, dt);
    this.sway.y = damp(this.sway.y, player.lookSway.y * 0.03, 8, dt);
    // Ao correr a lanterna desce e balança mais.
    this.lowered = damp(this.lowered, player.running ? 1 : 0, 6, dt);
    const r = this.right;
    r.position.set(
      this.rightBase.x + Math.cos(ph) * 0.02 * amp + this.sway.x,
      this.rightBase.y + Math.abs(Math.sin(ph)) * 0.02 * amp - this.lowered * 0.06 + this.sway.y + Math.sin(time * 1.6) * 0.003,
      this.rightBase.z + this.lowered * 0.04,
    );
    r.rotation.set(this.lowered * -0.35 + this.sway.y * 2, this.sway.x * 2 + this.lowered * 0.25, this.lowered * 0.3);
    if (this.reachT >= 0) {
      this.reachT += dt * 3.5;
      const k = Math.sin(Math.min(1, this.reachT) * Math.PI);
      r.position.z -= k * 0.12;
      r.position.y += k * 0.04;
      r.rotation.x += k * 0.25;
      if (this.reachT >= 1) this.reachT = -1;
    }
    this.lens.color.setScalar(player.light ? 1 : 0.08);

    // Beber: sobe → inclina → segura → desce (2,4 s).
    if (this.drinkT >= 0) {
      this.drinkT += dt;
      const t = this.drinkT;
      const up = Math.min(1, t / 0.5) * (t > 1.9 ? Math.max(0, 1 - (t - 1.9) / 0.5) : 1);
      const tilt = t < 0.5 ? 0 : t < 0.9 ? (t - 0.5) / 0.4 : t < 1.7 ? 1 : Math.max(0, 1 - (t - 1.7) / 0.4);
      const e = up * up * (3 - 2 * up);
      this.left.position.set(
        this.leftBase.x + e * 0.17,
        this.leftBase.y + e * 0.36 + Math.sin(t * 9) * 0.004 * tilt,
        this.leftBase.z + e * 0.07,
      );
      this.left.rotation.set(tilt * 1.25, 0, -e * 0.5 - tilt * 0.3);
      if (t >= 2.4) {
        this.drinkT = -1;
        this.left.visible = false;
      }
    }
  }
}
