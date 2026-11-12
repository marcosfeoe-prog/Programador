// Posição do sol pela latitude e hora local (o sol fica ao norte no hemisfério sul),
// cores do céu, luz do sol e luz ambiente — também à noite (lua e estrelas).

import * as THREE from 'three';
import { clamp, smoothstep, DEG } from '../core/math.js';

export class Sky {
  constructor() {
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.moonDir = new THREE.Vector3(0, 1, 0);
    this.sunColor = new THREE.Color(1, 1, 1);
    this.zenith = new THREE.Color();
    this.horizon = new THREE.Color();
    this.ambSky = new THREE.Color();
    this.ambGround = new THREE.Color();
    this.haze = new THREE.Color();
    this.elev = 0;
    this.night = 0;
    this.sunLight = new THREE.DirectionalLight(0xffffff, 3);
    this.sunLight.castShadow = false;
    this.hemi = new THREE.HemisphereLight(0x8899bb, 0x443322, 1);
  }

  // t = segundos desde a meia-noite (hora solar local).
  update(t, lat, decl, shade = { sun: 1, sky: 1, tint: 0 }) {
    const H = ((t / 3600 - 12) * 15) * DEG;
    const phi = lat * DEG;
    const d = decl * DEG;
    const east = -Math.cos(d) * Math.sin(H);
    const north = Math.sin(d) * Math.cos(phi) - Math.cos(d) * Math.sin(phi) * Math.cos(H);
    const up = Math.sin(d) * Math.sin(phi) + Math.cos(d) * Math.cos(phi) * Math.cos(H);
    this.sunDir.set(east, up, -north).normalize();
    this.moonDir.set(-east * 0.8 + 0.2, Math.max(0.25, -up * 0.9 + 0.2), north * 0.6).normalize();
    const el = Math.asin(clamp(this.sunDir.y, -1, 1));
    this.elev = el / DEG;
    const e = this.elev;
    // Transmitância da atmosfera (massa de ar) — avermelha o sol perto do horizonte.
    const am = 1 / Math.max(0.035, Math.sin(Math.max(el, 0) + 0.035));
    const tr = [Math.exp(-0.06 * am), Math.exp(-0.13 * am), Math.exp(-0.3 * am)];
    const day = smoothstep(-4, 6, e);
    this.night = 1 - smoothstep(-12, -2, e);
    const sunI = 3.3 * day;
    this.sunColor.setRGB(tr[0] * sunI, tr[1] * sunI * 0.97, tr[2] * sunI * 0.93);
    // Céu limpo.
    const twilight = smoothstep(-8, 4, e) * (1 - smoothstep(4, 22, e));
    const z = new THREE.Color(0.1, 0.22, 0.52).multiplyScalar(0.25 + 1.05 * smoothstep(-6, 30, e));
    z.lerp(new THREE.Color(0.12, 0.12, 0.3), twilight * 0.35);
    const h = new THREE.Color(0.62, 0.68, 0.76).multiplyScalar(0.18 + 0.95 * smoothstep(-6, 20, e));
    h.lerp(new THREE.Color(1.15, 0.58, 0.3), twilight * 0.65);
    const nightZ = new THREE.Color(0.0025, 0.004, 0.012);
    const nightH = new THREE.Color(0.006, 0.008, 0.016);
    z.lerp(nightZ, this.night);
    h.lerp(nightH, this.night);
    this.zenith.copy(z);
    this.horizon.copy(h);
    // Sob a tempestade: céu cinza e mais escuro.
    const sk = shade.sky;
    const grey = (c, f) => {
      const l = (c.r + c.g + c.b) / 3;
      c.setRGB(c.r + (l - c.r) * f, c.g + (l - c.g) * f, c.b + (l - c.b) * f);
    };
    // Luz ambiente (hemisférica).
    this.ambSky.copy(z).multiplyScalar(1.6).lerp(h, 0.45);
    this.ambSky.multiplyScalar(0.35 + 0.65 * sk);
    grey(this.ambSky, (1 - sk) * 0.6);
    if (shade.tint > 0) this.ambSky.lerp(new THREE.Color(0.12, 0.22, 0.2).multiplyScalar(this.ambSky.g * 4), shade.tint * 0.25);
    this.ambGround.setRGB(0.18, 0.15, 0.1).multiplyScalar((0.1 + 1.4 * day) * (0.4 + 0.6 * sk) * shade.sun * 0.5 + 0.05 * day + 0.004);
    this.haze.copy(h).lerp(this.ambSky, 0.3);
    grey(this.haze, (1 - sk) * 0.5);
    // Luzes do three.js.
    this.sunLight.color.copy(this.sunColor).multiplyScalar(1 / 3.3);
    this.sunLight.intensity = 3.3 * shade.sun * day;
    this.hemi.color.copy(this.ambSky);
    this.hemi.groundColor.copy(this.ambGround);
    this.hemi.intensity = 1.0 + 0.6 * this.night;
    // Luar.
    if (this.night > 0.5) {
      this.sunLight.color.setRGB(0.55, 0.62, 0.8);
      this.sunLight.intensity = 0.05 * shade.sun;
    }
    return this;
  }

  lightDir() {
    return this.night > 0.5 ? this.moonDir : this.sunDir;
  }
}

// Declinação do sol: fim da primavera em cada hemisfério (época de tornados).
export function seasonDecl(hemi) {
  return hemi > 0 ? 20 : -18;
}
