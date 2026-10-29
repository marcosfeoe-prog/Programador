import * as THREE from 'three';
import { load, settings, Q } from '../js/config.js';
import { Post } from '../js/post.js';
import { LU, tex, texturesReady } from '../js/materials.js';
import { Level0 } from '../js/levels/level0.js';
const P = new URLSearchParams(location.search);
load();
settings.quality = P.get('q') || 'high';
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setSize(1280, 720);
renderer.setPixelRatio(1);
document.body.appendChild(renderer.domElement);
LU.uNoise.value = tex('noise.png', { srgb: false });
const post = new Post(renderer);
post.configure(Q().msaa, Q().bloom);
post.setSize(1280, 720);
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(75, 1280 / 720, 0.05, 80);
const game = { seed: +(P.get('seed') || 1007) };
const levels = { 0: Level0 };
const L = new levels[P.get('l') || 0](game);
if (P.get('I')) { const op = L.panel.bind(L); L.panel = (x, z, o = {}) => op(x, z, { ...o, I: +P.get('I') }); }
const t0 = performance.now();
await L.build((p) => (window.__prog = p));
window.__bakeMs = performance.now() - t0;
scene.add(L.group);
scene.fog = new THREE.FogExp2(L.fog.color, L.fog.density);
scene.background = new THREE.Color(L.fog.color);
const gr = L.grade;
post.u.uExposure.value = +(P.get('exp') || gr.exposure); post.u.uTint.value.set(...gr.tint); post.u.uLift.value.set(...gr.lift);
post.u.uSat.value = gr.sat; post.u.uContrast.value = gr.contrast; post.u.uBloom.value = gr.bloom; post.u.uCA.value = gr.ca; post.u.uGrain.value = gr.grain;
if (P.get('auto')) {
  const { rng } = await import('../js/util.js');
  const r = rng(+P.get('auto'));
  let best = null;
  for (let k = 0; k < 300; k++) {
    const p = L.grid.randomOpen(r); if (!p) continue;
    for (let a = 0; a < 8; a++) {
      const yaw = a * Math.PI / 4; const dx = -Math.sin(yaw), dz = -Math.cos(yaw);
      const t = L.grid.trace(p.x, 1.6, p.z, p.x + dx * 30, 1.6, p.z + dz * 30) * 30;
      const lv = L.probes.level(p.x, p.z);
      const sc = Math.min(t, 18) + (lv > 0.05 ? 5 : 0) + r() * 4;
      if (!best || sc > best.sc) best = { sc, x: p.x, z: p.z, yaw };
    }
  }
  P.set('x', best.x); P.set('z', best.z); P.set('yaw', best.yaw);
}
const x = +(P.get('x') ?? L.spawn.x), z = +(P.get('z') ?? L.spawn.z), yaw = +(P.get('yaw') ?? L.spawn.yaw), pitch = +(P.get('pitch') ?? 0);
cam.position.set(x, +(P.get('y') ?? 1.62), z);
cam.rotation.order = 'YXZ'; cam.rotation.set(pitch, yaw, 0);
if (P.get('top')) { cam.position.set(L.grid.W/2, 90, L.grid.D/2); cam.rotation.set(-Math.PI/2, 0, 0); cam.far = 200; cam.updateProjectionMatrix(); scene.fog = null; L.meshCeil.visible = false; L.group.traverse(o=>{ if (o.material && o.material.emissive && o.position) {} }); }
await texturesReady();
if (P.get('dbg') === 'lm') { const bm = new THREE.MeshBasicMaterial({ map: L.lm }); L.group.traverse(o => { if (o.isMesh && o.geometry.attributes.uv1) o.material = bm; }); }
if (P.get('dbg') === 'alb') { L.group.traverse(o => { if (o.isMesh && o.material.map) o.material = new THREE.MeshBasicMaterial({ map: o.material.map }); }); }

window.__map = () => { const g = L.grid; let s=''; for (let zz=0; zz<g.h; zz+=2){ for(let xx=0;xx<g.w;xx++){ const v=g.get(xx,zz); s+= v===1?'#':v===2?'=':'.'; } s+='\n'; } return s; };
let vm = null; const fp = { pos: cam.position, flashOn: true, battery: 1, bobPhase: 0, speedK: 0 };
if (P.get('vm')) { const { ViewModel } = await import('../js/viewmodel.js'); vm = new ViewModel({}); vm.attach(cam); scene.add(cam); vm.setAspect(1280/720, 75); vm.setShadows(Q().shadow); const { makeEnv } = await import('../js/materials.js'); vm.setEnv(makeEnv(renderer)); await texturesReady(); if (P.get('vmb')) { const b = P.get('vmb').split(',').map(Number); vm.base.set(b[0], b[1], b[2]); if (b.length > 3) vm.baseRot.set(b[3], b[4], b[5]); } }
let hound = null;
if (P.get('hound')) {
  const { Hound } = await import('../js/entities/hound.js');
  const { makeEnv } = await import('../js/materials.js');
  game.player = { pos: new THREE.Vector3(cam.position.x, 0, cam.position.z), flashOn: true, battery: 1, crouchK: 0, alive: true };
  game.audio = { voice: () => null, skitter() {}, scream() {}, stinger() {} };
  game.camera = cam;
  const fx = -Math.sin(cam.rotation.y), fz = -Math.cos(cam.rotation.y);
  const dd = +(P.get('hd') || 2.2);
  const t0 = performance.now();
  hound = new Hound(L, cam.position.x + fx * dd, cam.position.z + fz * dd, 3);
  window.__houndMs = performance.now() - t0;
  hound.heading = Math.atan2(-fx, -fz) + +(P.get('hrot') || 0);
  hound.placeLimbs();
  hound.setEnv(makeEnv(renderer));
  scene.add(hound.object);
  await texturesReady();
  hound.think = () => ({ dx: Math.sin(hound.heading), dz: Math.cos(hound.heading), speed: +(P.get('hspeed') || 0), sees: true, dP: 3 });
  const T = +(P.get('hsteps') || 30) / 30, hsp = +(P.get('hspeed') || 0);
  hound.pos.x -= Math.sin(hound.heading) * hsp * T; hound.pos.z -= Math.cos(hound.heading) * hsp * T;
  hound.vel.set(Math.sin(hound.heading) * hsp, 0, Math.cos(hound.heading) * hsp); hound.placeLimbs();
  for (let i = 0; i < +(P.get('hsteps') || 30); i++) { hound.update(1 / 30); }
}
function frame() { L.update(1/60); if (vm) vm.update(1/60, fp, L); post.u.uTime.value = performance.now()/1000; post.render(scene, cam, vm && vm.scene, vm && vm.camera); }
frame(); frame();
window.__dbg = { vm, L, THREE, renderer, frame, post };
window.__ready = true;
if (vm) window.__info2 = { probe: vm.mSleeve.userData.uProbe.value.map(v => v.toArray().map(x => +x.toFixed(3))), lvl: L.probes.level(cam.position.x, cam.position.z) };
window.__info = { houndMs: window.__houndMs,  atlas: L.atlas, lights: L.lights.length, quads: L.quads.length, info: renderer.info.render };
window.__lmdump = () => {
  const t = L.lm, W = t.image.width, H = t.image.height, d = t.image.data;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d'); const im = ctx.createImageData(W, H);
  for (let i = 0; i < W * H; i++) for (let k = 0; k < 3; k++) im.data[i * 4 + k] = Math.min(255, THREE.DataUtils.fromHalfFloat(d[i * 4 + k]) * 120);
  for (let i = 0; i < W * H; i++) im.data[i * 4 + 3] = 255;
  ctx.putImageData(im, 0, 0);
  const fl = L.quads.filter(q => q.kind === 0).slice(0, 3).map(q => [q.ax, q.ay, q.cw, q.ch, q.o, q.lu, q.lv]);
  return { url: c.toDataURL(), fl };
};
