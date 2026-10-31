// Câmeras: transmissão de TV (padrão), TV próxima, alta (tática) e atrás do
// ataque; enquadramentos especiais de bola parada, comemoração e replay.
import * as THREE from 'three';
import { PITCH as P } from '../engine/constants.js';
import { clamp, damp, lerp } from '../util.js';

export const CAM_MODES = ['tv', 'tvclose', 'alta', 'atras'];
export const CAM_NAMES = { tv: 'Transmissão', tvclose: 'TV próxima', alta: 'Alta (tática)', atras: 'Atrás do ataque' };

export class BroadcastCam {
  constructor(camera) {
    this.cam = camera;
    this.mode = 'tv';
    this.pos = new THREE.Vector3(0, 18, 74);
    this.look = new THREE.Vector3();
    this.lookS = new THREE.Vector3();
    this.fov = 24;
    this.first = true;
    this.shake = 0;
  }

  snap() {
    this.first = true;
  }

  // ctx: {ball:{x,y,z,vx,vz}, attackDir, state, sp, focus:{x,z}|null, aspect}
  update(dt, ctx) {
    const b = ctx.ball;
    const aspect = ctx.aspect || 16 / 9;
    // em telas mais estreitas, abre o ângulo
    const narrow = clamp((16 / 9) / aspect, 0.8, 1.6);
    let tx = b.x + (ctx.vx || 0) * 0.35;
    let tz = b.z * 0.85 + (ctx.vz || 0) * 0.2;
    let ty = Math.min(b.y, 3) * 0.3;
    if (ctx.focus) {
      tx = ctx.focus.x;
      tz = ctx.focus.z;
      ty = 1;
    }
    let px;
    let py;
    let pz;
    let fov;
    let mode = this.mode;
    const sp = ctx.sp;
    let special = false;
    if (sp && (sp.type === 'penalty' || (sp.type === 'freekick' && sp.direct)) && ctx.state === 'setpiece') {
      // atrás do cobrador, olhando para o gol
      const gx = sp.team.oppGoalX;
      const dx = gx - sp.x;
      const dz = -sp.z;
      const dl = Math.hypot(dx, dz) || 1;
      px = sp.x - (dx / dl) * (sp.type === 'penalty' ? 9 : 13);
      pz = sp.z - (dz / dl) * (sp.type === 'penalty' ? 9 : 13);
      py = sp.type === 'penalty' ? 2.6 : 4;
      tx = gx;
      tz = 0;
      ty = 1.2;
      fov = 38;
      special = true;
    }
    if (!special) {
      switch (mode) {
        case 'tvclose':
          tx = clamp(tx, -P.HL + 6, P.HL - 6);
          px = clamp(tx * 0.9, -44, 44);
          py = 9;
          pz = P.HW + 16;
          fov = 25 * narrow;
          break;
        case 'alta':
          // "cabo aéreo" sobre a lateral
          px = clamp(tx * 0.6, -30, 30);
          py = 33;
          pz = P.HW + 13;
          fov = 42 * narrow;
          break;
        case 'atras': {
          const d = ctx.attackDir || 1;
          px = clamp(tx - d * 18, -58, 58);
          pz = tz * 0.7;
          py = 8.5;
          tx += d * 12;
          fov = 52 * Math.min(narrow, 1.25);
          break;
        }
        default:
          // câmera principal, no meio da arquibancada
          tx = clamp(tx, -P.HL + 4, P.HL - 4);
          px = clamp(tx * 0.82, -40, 40);
          py = 14;
          pz = P.HW + 19;
          fov = 27 * narrow;
      }
    }
    if (this.first) {
      this.pos.set(px, py, pz);
      this.look.set(tx, ty, tz);
      this.lookS.copy(this.look);
      this.fov = fov;
      this.first = false;
    }
    const k = special ? 3 : mode === 'atras' ? 3.5 : 2.6;
    this.pos.x = damp(this.pos.x, px, k, dt);
    this.pos.y = damp(this.pos.y, py, k, dt);
    this.pos.z = damp(this.pos.z, pz, k, dt);
    this.look.x = damp(this.look.x, tx, k * 1.6, dt);
    this.look.y = damp(this.look.y, ty, k * 1.6, dt);
    this.look.z = damp(this.look.z, tz, k * 1.3, dt);
    this.fov = damp(this.fov, fov, 2.5, dt);
    this.apply();
  }

  apply() {
    const c = this.cam;
    c.position.copy(this.pos);
    if (this.shake > 0) {
      c.position.x += (Math.random() - 0.5) * this.shake;
      c.position.y += (Math.random() - 0.5) * this.shake;
    }
    c.lookAt(this.look);
    if (Math.abs(c.fov - this.fov) > 0.01) {
      c.fov = this.fov;
      c.updateProjectionMatrix();
    }
  }

  // Câmera de replay: alterna ângulo baixo lateral e atrás do gol.
  replay(dt, ball, variant, goalX, t) {
    let px;
    let py;
    let pz;
    let fov;
    if (variant % 2 === 0) {
      // beira do campo, baixa
      px = ball.x - Math.sign(goalX) * 7;
      py = 1.7;
      pz = P.HW + 3;
      fov = 34;
    } else {
      // atrás da rede
      px = goalX + Math.sign(goalX) * 4.2;
      py = 2.2;
      pz = ball.z * 0.2;
      fov = 50;
    }
    if (this.first) {
      this.pos.set(px, py, pz);
      this.look.set(ball.x, ball.y, ball.z);
      this.fov = fov;
      this.first = false;
    }
    this.pos.x = damp(this.pos.x, px, 2, dt);
    this.pos.y = damp(this.pos.y, py, 2, dt);
    this.pos.z = damp(this.pos.z, pz, 2, dt);
    this.look.x = damp(this.look.x, ball.x, 5, dt);
    this.look.y = damp(this.look.y, Math.min(ball.y, 4), 5, dt);
    this.look.z = damp(this.look.z, ball.z, 5, dt);
    this.fov = damp(this.fov, fov, 3, dt);
    this.apply();
  }

  // Base de controle no chão: frente e direita da câmera.
  basis() {
    const f = new THREE.Vector3();
    this.cam.getWorldDirection(f);
    f.y = 0;
    if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
    f.normalize();
    return { fx: f.x, fz: f.z, rx: -f.z, rz: f.x };
  }
}
