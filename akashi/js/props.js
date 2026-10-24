// Objetos de cena: mochila escolar, marmita (bentô) de rosbife, hashis,
// sanduíche, livros, cano de ferro, taco, corrente, latas de lixo, gato…
import * as THREE from 'three';
import { toon, flat, mesh, canvasTexture } from './toon.js';

// Fatia de rosbife: crosta temperada nas bordas e centro rosado.
export function drawRosbife(g, cx, cy, rx, ry, rot = 0) {
  g.save();
  g.translate(cx, cy);
  g.rotate(rot);
  g.fillStyle = '#5a2c1c';
  g.beginPath();
  g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
  const rg = g.createRadialGradient(0, 0, 0, 0, 0, Math.max(rx, ry) * 0.9);
  rg.addColorStop(0, '#e2737a');
  rg.addColorStop(0.55, '#d0525e');
  rg.addColorStop(0.85, '#a8464a');
  rg.addColorStop(1, '#7a3a2a');
  g.fillStyle = rg;
  g.beginPath();
  g.ellipse(0, 0, rx * 0.86, ry * 0.8, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(255,220,220,0.5)';
  g.lineWidth = Math.max(1, rx * 0.04);
  g.beginPath();
  g.moveTo(-rx * 0.5, -ry * 0.2);
  g.quadraticCurveTo(-rx * 0.1, ry * 0.1, rx * 0.4, -ry * 0.25);
  g.moveTo(-rx * 0.3, ry * 0.35);
  g.quadraticCurveTo(rx * 0.1, ry * 0.2, rx * 0.5, ry * 0.3);
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.beginPath();
  g.ellipse(-rx * 0.35, -ry * 0.35, rx * 0.16, ry * 0.08, -0.4, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

let ROS_TEX;
export function rosbifeTexture() {
  if (!ROS_TEX)
    ROS_TEX = canvasTexture(256, 256, (g) => {
      g.clearRect(0, 0, 256, 256);
      drawRosbife(g, 128, 128, 120, 100);
    });
  return ROS_TEX;
}

const G = {
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
};

// Mochila escolar de couro (pasta) — segurada pela alça.
export function makeBag(color = 0x2a1a14) {
  const g = new THREE.Group();
  const body = mesh(G.box(0.38, 0.28, 0.09), toon(color), 0.8, { smooth: true });
  body.position.set(0, -0.2, 0);
  g.add(body);
  const flap = mesh(G.box(0.385, 0.12, 0.095), toon(0x3a2418), 0.6, { smooth: true });
  flap.position.set(0, -0.11, 0.003);
  g.add(flap);
  const buckle = new THREE.Mesh(G.box(0.04, 0.03, 0.01), toon(0xc8a040));
  buckle.position.set(0, -0.15, 0.052);
  g.add(buckle);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 6, 12, Math.PI), toon(0x1a100c));
  strap.position.set(0, -0.06, 0);
  g.add(strap);
  return g;
}

// Marmita aberta: arroz, fatias de rosbife em leque e molho.
export function makeBento(open = true) {
  const g = new THREE.Group();
  const base = mesh(G.box(0.22, 0.05, 0.15), toon(0x1a1a1a), 0.7, { smooth: true });
  base.position.y = 0.025;
  g.add(base);
  const inner = new THREE.Mesh(G.box(0.205, 0.01, 0.135), toon(0x8a1a1a));
  inner.position.y = 0.046;
  g.add(inner);
  const rice = new THREE.Mesh(G.box(0.085, 0.02, 0.125), toon(0xfbfbf4));
  rice.position.set(-0.055, 0.052, 0);
  g.add(rice);
  const umeboshi = new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 6), toon(0xc0203a));
  umeboshi.position.set(-0.055, 0.064, 0);
  g.add(umeboshi);
  const sliceMat = flat(0xffffff, { map: rosbifeTexture(), transparent: true });
  const sliceGeo = new THREE.CircleGeometry(0.04, 20);
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(sliceGeo, sliceMat);
    s.rotation.x = -Math.PI / 2 + 0.25;
    s.rotation.z = -0.6 + i * 0.3;
    s.scale.set(1, 0.8, 1);
    s.position.set(0.04 + i * 0.006, 0.058 + i * 0.002, -0.035 + i * 0.018);
    g.add(s);
  }
  const lettuce = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), toon(0x6ac04a));
  lettuce.scale.set(1.4, 0.4, 1);
  lettuce.position.set(0.075, 0.052, 0.05);
  g.add(lettuce);
  if (!open) {
    const lid = mesh(G.box(0.225, 0.025, 0.155), toon(0x8a1a1a), 0.7, { smooth: true });
    lid.position.y = 0.06;
    g.add(lid);
    g.userData.lid = lid;
  }
  return g;
}

// Tampa separada (para animar a abertura) e pano de amarrar (furoshiki).
export function makeBentoLid() {
  const g = new THREE.Group();
  const lid = mesh(G.box(0.225, 0.025, 0.155), toon(0x8a1a1a), 0.7, { smooth: true });
  g.add(lid);
  const knot = mesh(new THREE.SphereGeometry(0.03, 10, 8), toon(0xd8303a), 0.7);
  knot.scale.set(1.3, 0.7, 1);
  knot.position.y = 0.02;
  g.add(knot);
  g.userData.knot = knot;
  return g;
}

export function makeChopsticks() {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.004, 0.2, 6), toon(0x7a3a1a));
    c.position.set(s * 0.006, 0, 0);
    c.rotation.z = s * 0.03;
    g.add(c);
  }
  // fatia na ponta
  const s = new THREE.Mesh(new THREE.CircleGeometry(0.03, 16), flat(0xffffff, { map: rosbifeTexture(), transparent: true, side: THREE.DoubleSide }));
  s.position.set(0, -0.1, 0.0);
  s.scale.set(1, 0.75, 1);
  g.add(s);
  g.userData.slice = s;
  return g;
}

export function makeSandwich() {
  const g = new THREE.Group();
  const bread = toon(0xf2deb0);
  const crust = toon(0xc08a4a);
  for (const y of [0, 0.03]) {
    const b = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.014, 3), bread, 0.7);
    b.rotation.y = Math.PI / 6;
    b.position.y = y;
    g.add(b);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.012, 3, 1, true), crust);
    c.rotation.y = Math.PI / 6;
    c.position.y = y;
    g.add(c);
  }
  const meat = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.012, 3), toon(0xc84a50));
  meat.rotation.y = Math.PI / 6;
  meat.position.y = 0.015;
  g.add(meat);
  const leaf = new THREE.Mesh(new THREE.CylinderGeometry(0.063, 0.063, 0.004, 3), toon(0x6ac04a));
  leaf.rotation.y = Math.PI / 6 + 0.1;
  leaf.position.y = 0.022;
  g.add(leaf);
  return g;
}

// Caixinha embrulhada (Hana traz o sanduíche nela).
export function makeGiftBox() {
  const g = new THREE.Group();
  const b = mesh(G.box(0.16, 0.06, 0.12), toon(0xf6a8c0), 0.7, { smooth: true });
  g.add(b);
  const r1 = new THREE.Mesh(G.box(0.165, 0.062, 0.02), toon(0xffffff));
  g.add(r1);
  const r2 = new THREE.Mesh(G.box(0.02, 0.062, 0.125), toon(0xffffff));
  g.add(r2);
  return g;
}

export function makeBread() {
  const g = new THREE.Group();
  const b = mesh(new THREE.CapsuleGeometry(0.035, 0.1, 4, 8), toon(0xd8a050), 0.7);
  b.rotation.z = Math.PI / 2;
  g.add(b);
  const wrap = new THREE.Mesh(new THREE.CapsuleGeometry(0.037, 0.05, 4, 8), flat(0xffffff, { transparent: true, opacity: 0.4 }));
  wrap.rotation.z = Math.PI / 2;
  wrap.position.x = 0.04;
  g.add(wrap);
  return g;
}

export function makeBooks() {
  const g = new THREE.Group();
  const cols = [0x3a6ab0, 0xc04040, 0x40a060];
  cols.forEach((c, i) => {
    const b = mesh(G.box(0.18, 0.03, 0.25), toon(c), 0.6, { smooth: true });
    b.position.y = i * 0.032;
    b.rotation.y = (i - 1) * 0.12;
    g.add(b);
  });
  return g;
}

export function makeBook(color = 0x3a6ab0) {
  const b = mesh(G.box(0.18, 0.03, 0.25), toon(color), 0.6, { smooth: true });
  return b;
}

export function makePipe(bent = 0) {
  const g = new THREE.Group();
  const mat = toon(0x8a9098);
  const a = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.55, 8), mat, 0.7);
  a.position.y = 0.275;
  g.add(a);
  const pivot = new THREE.Group();
  pivot.position.y = 0.55;
  g.add(pivot);
  const b = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.4, 8), mat, 0.7);
  b.position.y = 0.2;
  pivot.add(b);
  g.userData.pivot = pivot;
  g.userData.setBend = (k) => (pivot.rotation.z = k);
  pivot.rotation.z = bent;
  return g;
}

export function makeBat() {
  const g = new THREE.Group();
  const b = mesh(new THREE.CylinderGeometry(0.035, 0.016, 0.8, 10), toon(0xc8a060), 0.7);
  b.position.y = 0.4;
  g.add(b);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.18, 8), toon(0x222222));
  grip.position.y = 0.06;
  g.add(grip);
  return g;
}

export function makeChain(n = 14) {
  const g = new THREE.Group();
  const mat = toon(0xa0a8b0);
  const links = [];
  for (let i = 0; i < n; i++) {
    const l = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 5, 10), mat);
    l.rotation.y = i % 2 ? Math.PI / 2 : 0;
    g.add(l);
    links.push(l);
  }
  // forma da corrente: lista de pontos em coordenadas locais
  g.userData.setShape = (pts) => {
    for (let i = 0; i < links.length; i++) {
      const u = (i / (links.length - 1)) * (pts.length - 1);
      const k = Math.min(pts.length - 2, Math.floor(u));
      const f = u - k;
      const a = pts[k];
      const b = pts[k + 1];
      links[i].position.set(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
    }
  };
  g.userData.setShape([
    [0, 0, 0],
    [0, -0.5, 0],
  ]);
  return g;
}

export function makePhone() {
  const g = new THREE.Group();
  const b = mesh(G.box(0.07, 0.14, 0.01), toon(0x1a1a1a), 0.6, { smooth: true });
  g.add(b);
  const s = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.12), flat(0xbfe0ff));
  s.position.z = 0.0055;
  g.add(s);
  return g;
}

export function makeTrashCan(color = 0x4a6a5a) {
  const g = new THREE.Group();
  const body = mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.75, 14), toon(color), 0.8);
  body.position.y = 0.375;
  g.add(body);
  const lid = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 14), toon(0x3a4a42), 0.8);
  lid.position.y = 0.77;
  g.add(lid);
  g.userData.lid = lid;
  return g;
}

export function makeCat() {
  const g = new THREE.Group();
  const black = toon(0x16161c);
  const body = mesh(new THREE.SphereGeometry(0.12, 12, 8), black, 0.8);
  body.scale.set(0.75, 0.7, 1.4);
  body.position.y = 0.18;
  g.add(body);
  const head = mesh(new THREE.SphereGeometry(0.075, 12, 8), black, 0.8);
  head.position.set(0, 0.28, 0.17);
  g.add(head);
  for (const s of [1, -1]) {
    const ear = mesh(new THREE.ConeGeometry(0.03, 0.06, 4), black, 0.8);
    ear.position.set(s * 0.04, 0.35, 0.16);
    head.parent.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), flat(0xf8e040));
    eye.position.set(s * 0.028, 0.29, 0.235);
    eye.scale.set(1, 1.2, 0.5);
    g.add(eye);
    const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.02, 0.004), flat(0x000000));
    pupil.position.set(s * 0.028, 0.29, 0.243);
    g.add(pupil);
    for (const z of [0.1, -0.1]) {
      const leg = mesh(new THREE.CylinderGeometry(0.022, 0.02, 0.14, 6), black, 0.8);
      leg.position.set(s * 0.05, 0.07, z);
      g.add(leg);
    }
  }
  const tail = mesh(new THREE.CylinderGeometry(0.015, 0.012, 0.3, 6), black, 0.8);
  tail.position.set(0, 0.3, -0.22);
  tail.rotation.x = -0.6;
  g.add(tail);
  return g;
}

// Pilha de caixas de papelão, sacos de lixo etc.
export function makeTrashBag(color = 0x22262a) {
  const m = mesh(new THREE.SphereGeometry(0.3, 10, 8), toon(color), 0.7);
  m.scale.set(1, 0.75, 0.9);
  m.position.y = 0.2;
  const g = new THREE.Group();
  g.add(m);
  const knot = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 6), toon(color));
  knot.position.y = 0.46;
  g.add(knot);
  return g;
}

export function makeCrate(color = 0xb08a5a) {
  return mesh(new THREE.BoxGeometry(0.6, 0.45, 0.45), toon(color), 0.6, { smooth: true });
}
