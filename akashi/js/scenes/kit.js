// Kit das cenas: reexporta poses e curvas e oferece ajudas para caminhadas,
// multidões e efeitos recorrentes.
import * as THREE from 'three';
import { P, mix, seq, add, along } from '../poses.js';
import { clamp, lerp, kf, step, range, smooth, easeIn, easeOut, easeInOut, backOut, pulse, hash, noise1, DEG } from '../util.js';

export { P, mix, seq, add, along, clamp, lerp, kf, step, range, smooth, easeIn, easeOut, easeInOut, backOut, pulse, hash, noise1, DEG };
export const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const PI = Math.PI;

function pathLen(path) {
  let L = 0;
  for (let i = 1; i < path.length; i++) L += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
  return L;
}

// Faz o personagem andar por um caminho com velocidade v (m/s) a partir de t0.
// style: 'walk' | 'swagger' | 'run'. Ao chegar, usa a pose "idle" (função ou objeto).
export function walk(ch, lt, path, v, o = {}) {
  const { t0 = 0, style = 'walk', idle = null, y = 0, layer = null, face = null } = o;
  const L = pathLen(path);
  const d = clamp((lt - t0) * v, 0, L);
  const a = along(path, d);
  const moving = lt > t0 && d < L - 1e-3;
  ch.place(a.x, a.z, a.rot, y);
  if (face !== null && !moving) ch.root.rotation.y = face;
  let pose;
  if (moving || !idle) {
    const tt = (lt - t0) + (o.phase || 0);
    if (style === 'run') pose = P.run(tt, v / 3.2);
    else if (style === 'swagger') pose = P.swagger(tt, v / 1.06);
    else pose = P.walk(tt, v / 1.33);
    if (!moving) pose = P.idle(lt);
  }
  if (!moving && idle) pose = typeof idle === 'function' ? idle(lt) : idle;
  if (layer) pose = add(pose, typeof layer === 'function' ? layer(lt) : layer);
  ch.pose(pose);
  return { x: a.x, z: a.z, rot: a.rot, moving, done: d >= L - 1e-3 };
}

// Coloca um aluno parado (lista: [índice, x, z, rot, pose, expr]).
export function crowd(c, list, lt = 0) {
  for (const [i, x, z, rot, pose, expr, lx] of list) {
    const s = c.st[i];
    s.place(x, z, rot);
    s.pose(typeof pose === 'function' ? pose(lt + i * 0.37) : pose || P.idle(lt + i));
    s.expr(expr || 'neutral', lx || 0);
  }
}

// Ângulo para olhar de (x, z) até (tx, tz).
export const yawTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);

// Vira só a cabeça (graus) — devolve uma camada para somar na pose.
export const headTurn = (y, x = 0) => ({ hdY: y, hdX: x });

// Tremedeira de susto.
export const tremble = (t, k = 1) => ({ hdZ: Math.sin(t * 47) * 2 * k, chZ: Math.sin(t * 41) * 1.2 * k });

// Fala de um figurante (mexe a boca durante a janela [a, b]).
export function talkWindow(ch, lt, a, b) {
  if (lt >= a && lt < b) ch.st.talk = true;
}
