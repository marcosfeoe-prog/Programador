// Ciclo de dia e noite: o dia (06:00–18:00) dura 10 minutos reais e a noite
// (18:00–06:00) dura outros 10 minutos, em velocidade normal (1x).
import * as THREE from 'three';
import { DAY_SECONDS, NIGHT_SECONDS } from '../config.js';

export class TimeOfDay {
  constructor(startHours = 10.5) {
    this.hours = startHours;
    this.day = 1;
    this.scale = 1;
    this.sun = new THREE.Vector3();
    this.moon = new THREE.Vector3();
    this.computeDirs();
  }

  get isDay() {
    return this.hours >= 6 && this.hours < 18;
  }

  update(dt) {
    const rate = this.isDay ? 12 / DAY_SECONDS : 12 / NIGHT_SECONDS; // horas por segundo
    this.hours += dt * rate * this.scale;
    if (this.hours >= 24) {
      this.hours -= 24;
      this.day++;
    }
    this.computeDirs();
  }

  // Segundos reais (em 1x) até a próxima transição dia/noite.
  remaining() {
    if (this.isDay) return ((18 - this.hours) / 12) * DAY_SECONDS;
    const h = this.hours >= 18 ? 24 - this.hours + 6 : 6 - this.hours;
    return (h / 12) * NIGHT_SECONDS;
  }

  computeDirs() {
    const th = ((this.hours - 6) / 12) * Math.PI; // 0 = nascer (leste), π = pôr (oeste)
    const tilt = (62 * Math.PI) / 180;
    this.sun.set(Math.cos(th), Math.sin(th) * Math.sin(tilt), Math.sin(th) * Math.cos(tilt)).normalize();
    this.moon.set(-this.sun.x + 0.18, -this.sun.y + 0.08, -this.sun.z - 0.12).normalize();
  }
}
