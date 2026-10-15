// Nível 3 — o Cão, o mesmo bicho do Nível 9 (corpo, IK das patas e sons), mas
// adaptado aos corredores de tijolo: anda de célula em célula e, quando caça,
// segue um caminho pelo labirinto (busca em largura). Não é rápido, mas não
// desiste: segue o andarilho de muito longe por muito tempo.
import { Hounds } from './level9_hounds.js';
import { lampUniforms, houndFaceURL } from './level9_mats.js';
import { W, EH, EV } from './grid.js';
import { clamp } from '../util.js';

const SMELL = 2.2;
const ROAM = 1.2;
const CHASE = 3.1; // mais devagar que o do Nível 9, mas não larga
const FLEE = 5;
const GIVE_UP = 28; // segundos sem ouvir até desistir
const PASS = new Set([W.NONE, W.DOOR, W.HALF_A, W.HALF_B]);

export class GridHounds extends Hounds {
  constructor(level) {
    level.lampU = level.lampU || lampUniforms(1);
    // ganchos que o Cão do Nível 9 usa (zonas seguras); nos níveis em grade não há
    if (!level.pushOutSafe) level.pushOutSafe = () => {};
    if (!level.inSafe) level.inSafe = () => false;
    if (!level.groundY) level.groundY = () => 0;
    super(level);
    this.pool = [this.pool[0]];
    this.spawnT = 35;
  }

  cellOf(x) {
    return Math.floor(x / this.L.cell);
  }

  center(i) {
    return (i + 0.5) * this.L.cell;
  }

  // Dá para ir da célula (ax, az) para a vizinha (ax+dx, az+dz)?
  passable(ax, az, dx, dz) {
    const L = this.L;
    const t = dx ? L.edge(EV, dx > 0 ? ax + 1 : ax, az) : L.edge(EH, ax, dz > 0 ? az + 1 : az);
    if (!PASS.has(t)) return false;
    if (L.houndBlocked && L.houndBlocked(ax + dx, az + dz)) return false;
    return true;
  }

  // Próxima célula do caminho até (tx, tz), por busca em largura limitada.
  pathStep(h, tx, tz) {
    const sx = this.cellOf(h.x);
    const sz = this.cellOf(h.z);
    const gx = this.cellOf(tx);
    const gz = this.cellOf(tz);
    if (sx === gx && sz === gz) return { x: tx, z: tz, len: 0 };
    const R = 34;
    const key = (x, z) => (x - sx + R) * 1000 + (z - sz + R);
    const prev = new Map([[key(sx, sz), null]]);
    const q = [[sx, sz]];
    let found = null;
    for (let qi = 0; qi < q.length && qi < 5000; qi++) {
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
        if (prev.has(k)) continue;
        if (!this.passable(x, z, dx, dz)) continue;
        prev.set(k, [x, z]);
        q.push([nx, nz]);
      }
    }
    if (!found) return null;
    // volta até o primeiro passo
    let cur = found;
    let len = 0;
    for (;;) {
      const p = prev.get(key(cur[0], cur[1]));
      len++;
      if (!p || (p[0] === sx && p[1] === sz)) break;
      cur = p;
    }
    return { x: this.center(cur[0]), z: this.center(cur[1]), len };
  }

  spawn(player) {
    const L = this.L;
    const c = L.cell;
    for (let t = 0; t < 24; t++) {
      const a = Math.random() * Math.PI * 2;
      const r = 26 + Math.random() * 20;
      const x = this.center(this.cellOf(player.pos.x + Math.cos(a) * r));
      const z = this.center(this.cellOf(player.pos.z + Math.sin(a) * r));
      if (L.floorOf(x) !== L.floorOf(player.pos.x)) continue;
      if (L.houndBlocked && L.houndBlocked(Math.floor(x / c), Math.floor(z / c))) continue;
      if (!L.chunkAt(x, z)) continue;
      const p = { x, z };
      L.collide(p, 0.4);
      if (Math.hypot(p.x - x, p.z - z) > 0.05) continue;
      const h = this.pool.find((q) => !q.active);
      if (!h) return false;
      Object.assign(h, { active: true, x, z, y: 0, yaw: Math.random() * 6.28, state: 'roam', wp: null, prevWp: null, timer: 0, lost: 0, stuck: 0, pause: 0, twitch: 0, spd: 0, pathT: 0 });
      h.root.visible = true;
      if (!this.announced) {
        this.announced = true;
        this.game.hud.message('Um latido rouco, distante, ecoa pelos tijolos. Algo anda de quatro por aqui.', 5);
        this.bark(h, player, r);
      }
      return true;
    }
    return false;
  }

  nextWaypoint(h, player) {
    const ci = this.cellOf(h.x);
    const cj = this.cellOf(h.z);
    let opts = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].filter(([dx, dz]) => this.passable(ci, cj, dx, dz));
    const prev = h.prevWp;
    const fresh = opts.filter(([dx, dz]) => !prev || prev[0] !== ci + dx || prev[1] !== cj + dz);
    if (fresh.length) opts = fresh;
    if (!opts.length) {
      h.wp = [h.x, h.z];
      return;
    }
    if (Math.random() < 0.45) opts.sort((a, b) => Math.hypot(this.center(ci + a[0]) - player.pos.x, this.center(cj + a[1]) - player.pos.z) - Math.hypot(this.center(ci + b[0]) - player.pos.x, this.center(cj + b[1]) - player.pos.z));
    const [dx, dz] = Math.random() < 0.6 ? opts[0] : opts[Math.floor(Math.random() * opts.length)];
    h.prevWp = [ci, cj];
    h.wp = [this.center(ci + dx), this.center(cj + dz)];
  }

  update(dt, player) {
    const g = this.game;
    const L = this.L;
    const st = g.st;
    this.cool = Math.max(0, this.cool - dt);
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.cool <= 0 && !this.active.length && !g.transitioning && !L.noHounds) this.spawnT = this.spawn(player) ? 40 + Math.random() * 30 : 4;
    const noise = this.noise(player) * (g.quietMul || 1);
    let closest = null;
    let cd = 1e9;
    for (const h of this.pool) {
      if (!h.active) continue;
      const dx = player.pos.x - h.x;
      const dz = player.pos.z - h.z;
      const d = Math.hypot(dx, dz);
      if (d > 120 || L.floorOf(h.x) !== L.floorOf(player.pos.x) || L.noHounds) {
        this.despawn(h);
        continue;
      }
      const hears = d < noise || d < SMELL;
      let tx = h.x;
      let tz = h.z;
      let speed = 0;
      if (h.state === 'roam') {
        if (hears) {
          h.state = 'alert';
          h.timer = 0.9;
          this.bark(h, player, d);
        } else if (h.pause > 0) h.pause -= dt;
        else {
          if (!h.wp || Math.hypot(h.wp[0] - h.x, h.wp[1] - h.z) < 0.5) {
            this.nextWaypoint(h, player);
            if (Math.random() < 0.15) h.pause = 1 + Math.random() * 2;
          }
          tx = h.wp[0];
          tz = h.wp[1];
          speed = ROAM;
        }
      } else if (h.state === 'alert') {
        h.timer -= dt;
        tx = player.pos.x;
        tz = player.pos.z;
        if (h.timer <= 0) {
          h.state = 'chase';
          h.lost = 0;
          h.pathT = 0;
        }
      } else if (h.state === 'chase') {
        h.lost = hears ? 0 : h.lost + dt;
        h.pathT -= dt;
        if (h.pathT <= 0 || !h.path) {
          h.pathT = 0.35;
          h.path = this.pathStep(h, player.pos.x, player.pos.z);
        }
        if (h.path) {
          tx = h.path.x;
          tz = h.path.z;
          speed = CHASE;
        }
        if (h.lost > GIVE_UP || !h.path || h.path.len > 60) {
          h.state = 'roam';
          h.wp = null;
          h.pause = 2;
        }
      } else if (h.state === 'flee') {
        h.timer -= dt;
        tx = h.x - dx;
        tz = h.z - dz;
        speed = FLEE;
        if (h.timer <= 0) {
          this.despawn(h);
          continue;
        }
      }
      this.move(h, tx, tz, speed, dt);
      if (!h.active) continue;
      const d2 = Math.hypot(player.pos.x - h.x, player.pos.z - h.z);
      if (h.state === 'chase' && d2 < 1.05 && !g.transitioning) {
        if (!this.face) this.face = houndFaceURL();
        g.caught({ image: this.face, text: 'O Cão te alcançou. Ele não corre muito, mas nunca desiste: mantenha distância.', sanity: 40 });
        h.state = 'flee';
        h.timer = 3.5;
        this.cool = 25;
      }
      // brilho pela luz do lugar (o nível não tem luzes dinâmicas)
      const k = clamp(L.lightLevel(h.x, h.z) * 0.3 + 0.02, 0.02, 0.6);
      if (this.mat.emissive) this.mat.emissive.setRGB(0.8 * k, 0.77 * k, 0.71 * k);
      this.animate(h, dt, player, d2);
      if (h.state !== 'flee' && d2 < cd) {
        cd = d2;
        closest = h;
      }
    }
    if (closest) {
      const hunting = closest.state === 'chase' || closest.state === 'alert';
      st.growl = { x: closest.x, z: closest.z, v: hunting ? clamp(1 - cd / 35, 0.25, 0.75) : clamp(1 - cd / 22, 0, 1) * 0.3 };
      st.fear = Math.max(st.fear || 0, hunting ? clamp(1.25 - cd / 25, 0.35, 1) : clamp(1 - cd / 20, 0, 0.6));
      L.houndFear = st.fear;
    } else L.houndFear = 0;
  }
}
