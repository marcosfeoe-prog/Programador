// Modelos 3D das armas do caçador, montados peça por peça com geometria procedural:
// rifle de ferrolho com luneta, espingarda de bombeamento, fuzil de assalto com mira
// holográfica e besta com cames. Cada arma expõe as peças móveis (ferrolho, telha da
// espingarda, carregador, corda e virote) para as animações.
// Sistema de coordenadas: o cano aponta para -Z, Y para cima, origem no punho.
import * as THREE from 'three';
import { makeWoodTexture } from '../world/textures.js';

let MATS = null;
function mats() {
  if (MATS) return MATS;
  const wt = makeWoodTexture(256, [120, 70, 38]);
  wt.repeat.set(3, 1);
  const wt2 = makeWoodTexture(256, [150, 102, 60]);
  wt2.repeat.set(3, 1);
  MATS = {
    steel: new THREE.MeshStandardMaterial({ color: 0x3a3e44, metalness: 0.7, roughness: 0.38 }),
    steelLight: new THREE.MeshStandardMaterial({ color: 0x8a8e94, metalness: 0.75, roughness: 0.3 }),
    poly: new THREE.MeshStandardMaterial({ color: 0x1d1e20, metalness: 0.15, roughness: 0.62 }),
    polyTan: new THREE.MeshStandardMaterial({ color: 0x6e5f45, metalness: 0.1, roughness: 0.7 }),
    alu: new THREE.MeshStandardMaterial({ color: 0x45494d, metalness: 0.55, roughness: 0.45 }),
    wood: new THREE.MeshStandardMaterial({ map: wt, color: 0xd9a77a, roughness: 0.5, metalness: 0.0 }),
    woodLight: new THREE.MeshStandardMaterial({ map: wt2, color: 0xe0b890, roughness: 0.55 }),
    scope: new THREE.MeshStandardMaterial({ color: 0x121315, metalness: 0.5, roughness: 0.4 }),
    lens: new THREE.MeshStandardMaterial({ color: 0x0f2232, metalness: 0.95, roughness: 0.05, emissive: 0x06121c }),
    glassDot: new THREE.MeshStandardMaterial({ color: 0x334455, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.25 }),
    redDot: new THREE.MeshBasicMaterial({ color: 0xff2010 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 0.95, roughness: 0.3 }),
    shellRed: new THREE.MeshStandardMaterial({ color: 0x9a1a14, roughness: 0.5 }),
    string: new THREE.LineBasicMaterial({ color: 0x15120e }),
    carbon: new THREE.MeshStandardMaterial({ color: 0x232524, metalness: 0.3, roughness: 0.5 }),
    fletch: new THREE.MeshStandardMaterial({ color: 0xd8461c, roughness: 0.6, side: THREE.DoubleSide }),
    glove: new THREE.MeshStandardMaterial({ color: 0x2d2822, roughness: 0.85 }),
    sleeve: new THREE.MeshStandardMaterial({ color: 0x4b5337, roughness: 0.9 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xb07a5a, roughness: 0.7 }),
  };
  return MATS;
}

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}
// cilindro ao longo de Z, de z0 a z1
function cylZ(r0, r1, z0, z1, mat, y = 0, x = 0, seg = 16) {
  const len = Math.abs(z1 - z0);
  const g = new THREE.CylinderGeometry(r1, r0, len, seg).rotateX(-Math.PI / 2);
  // r0 fica em z0 (trás), r1 em z1 (frente)
  return mesh(g, mat, x, y, (z0 + z1) / 2);
}
function boxM(w, h, d, mat, x, y, z) {
  return mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
}
// perfil lateral (x = distância para a frente, y = altura) extrudado na espessura
function profile(points, thick, mat, bevel = 0.005) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thick - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -(thick - bevel * 2) / 2);
  g.rotateY(Math.PI / 2);
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}
function triggerGroup(M, y) {
  const g = new THREE.Group();
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.0032, 6, 14, Math.PI), M.steel);
  guard.rotation.set(0, Math.PI / 2, Math.PI);
  guard.position.set(0, y, -0.012);
  g.add(guard);
  const tr = boxM(0.005, 0.022, 0.006, M.steel, 0, y + 0.008, -0.008);
  tr.rotation.x = 0.35;
  g.add(tr);
  return g;
}

// ---------------------------------------------------------------- rifle
function buildRifle() {
  const M = mats();
  const g = new THREE.Group();
  const by = 0.03;
  g.add(
    profile(
      [
        [-0.4, -0.035],
        [-0.4, -0.15],
        [-0.31, -0.135],
        [-0.13, -0.07],
        [-0.075, -0.07],
        [-0.045, -0.118],
        [-0.012, -0.118],
        [0.0, -0.05],
        [0.11, -0.026],
        [0.43, -0.016],
        [0.455, 0.0],
        [0.455, 0.02],
        [0.11, 0.024],
        [-0.02, 0.024],
        [-0.1, 0.016],
        [-0.3, 0.004],
      ],
      0.046,
      M.wood,
    ),
  );
  // soleira de borracha
  g.add(boxM(0.048, 0.118, 0.014, M.poly, 0, -0.092, 0.405));
  g.add(cylZ(0.0175, 0.0175, 0.04, -0.17, M.steel, by));
  g.add(cylZ(0.0118, 0.0088, -0.17, -0.74, M.steel, by));
  g.add(cylZ(0.0105, 0.0105, -0.71, -0.745, M.steelLight, by));
  g.add(triggerGroup(M, by - 0.05));
  // ferrolho (anima: gira e volta)
  const bolt = new THREE.Group();
  bolt.position.set(0, by, 0.0);
  bolt.add(cylZ(0.009, 0.009, 0.055, -0.02, M.steelLight, 0));
  const arm = new THREE.Group();
  arm.position.set(0, 0, 0.035);
  const handle = cylZ(0.0042, 0.0042, 0, 0.05, M.steelLight, 0);
  handle.rotation.y = Math.PI / 2;
  handle.position.set(0.025, -0.006, 0);
  arm.add(handle);
  arm.add(mesh(new THREE.SphereGeometry(0.0095, 12, 8), M.steel, 0.052, -0.012, 0.004));
  bolt.add(arm);
  bolt.userData.arm = arm;
  g.add(bolt);
  // luneta
  const sy = by + 0.056;
  g.add(cylZ(0.0135, 0.0135, 0.07, -0.2, M.scope, sy));
  g.add(cylZ(0.0135, 0.025, -0.2, -0.25, M.scope, sy));
  g.add(cylZ(0.025, 0.025, -0.25, -0.272, M.scope, sy));
  g.add(cylZ(0.0135, 0.019, 0.07, 0.1, M.scope, sy));
  g.add(cylZ(0.019, 0.019, 0.1, 0.13, M.scope, sy));
  const lensF = mesh(new THREE.CircleGeometry(0.022, 20), M.lens, 0, sy, -0.2725);
  lensF.rotation.y = Math.PI;
  g.add(lensF);
  g.add(mesh(new THREE.CircleGeometry(0.017, 20), M.lens, 0, sy, 0.1305));
  g.add(mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.026, 12), M.scope, 0, sy + 0.02, -0.06));
  const tur = mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.024, 12), M.scope, 0.02, sy, -0.06);
  tur.rotation.z = Math.PI / 2;
  g.add(tur);
  for (const z of [-0.13, 0.03]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0145, 0.0035, 6, 16), M.steel);
    ring.position.set(0, sy, z);
    g.add(ring);
    g.add(boxM(0.012, 0.03, 0.014, M.steel, 0, by + 0.028, z));
  }
  g.userData = { by, sightY: sy, muzzle: new THREE.Vector3(0, by, -0.75), bolt, grip: new THREE.Vector3(0.005, -0.075, 0.03), fore: new THREE.Vector3(-0.005, -0.02, -0.3), boltKnob: new THREE.Vector3(0.052, by - 0.012, 0.04) };
  return g;
}

// ---------------------------------------------------------------- espingarda
function buildShotgun() {
  const M = mats();
  const g = new THREE.Group();
  const by = 0.035;
  g.add(boxM(0.044, 0.074, 0.23, M.alu, 0, by - 0.006, -0.02));
  g.add(boxM(0.046, 0.012, 0.05, M.poly, 0.0, by + 0.018, -0.02)); // janela de ejeção
  g.add(cylZ(0.0128, 0.0128, -0.13, -0.72, M.steel, by + 0.009));
  g.add(boxM(0.008, 0.004, 0.57, M.steel, 0, by + 0.024, -0.43));
  g.add(mesh(new THREE.SphereGeometry(0.0032, 8, 6), M.brass, 0, by + 0.028, -0.715));
  g.add(cylZ(0.0108, 0.0108, -0.13, -0.62, M.steel, by - 0.027));
  g.add(cylZ(0.0118, 0.0118, -0.615, -0.635, M.steelLight, by - 0.027));
  // telha (pump)
  const pump = new THREE.Group();
  pump.position.set(0, by - 0.027, -0.33);
  pump.add(cylZ(0.021, 0.021, 0.1, -0.1, M.woodLight, 0, 0, 14));
  for (let k = 0; k < 7; k++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.0212, 0.0018, 4, 16), M.poly);
    r.position.z = -0.075 + k * 0.025;
    pump.add(r);
  }
  g.add(pump);
  g.add(
    profile(
      [
        [-0.39, -0.03],
        [-0.39, -0.155],
        [-0.3, -0.14],
        [-0.1, -0.075],
        [-0.06, -0.072],
        [-0.035, -0.118],
        [-0.005, -0.118],
        [0.02, -0.04],
        [0.09, -0.04],
        [0.09, 0.03],
        [0.0, 0.03],
        [-0.12, 0.012],
        [-0.3, 0.0],
      ],
      0.045,
      M.woodLight,
    ),
  );
  g.add(boxM(0.047, 0.125, 0.014, M.poly, 0, -0.092, 0.395));
  g.add(triggerGroup(M, by - 0.05));
  g.userData = { by, sightY: by + 0.027, muzzle: new THREE.Vector3(0, by + 0.009, -0.73), pump, grip: new THREE.Vector3(0.005, -0.075, 0.03), fore: new THREE.Vector3(0, by - 0.05, -0.33), port: new THREE.Vector3(0.025, by + 0.012, -0.02) };
  return g;
}

// ---------------------------------------------------------------- fuzil de assalto
function buildRifleAR() {
  const M = mats();
  const g = new THREE.Group();
  const by = 0.04;
  g.add(boxM(0.034, 0.05, 0.23, M.alu, 0, by, -0.03));
  g.add(boxM(0.032, 0.045, 0.17, M.alu, 0, by - 0.046, 0.0));
  g.add(boxM(0.026, 0.008, 0.25, M.poly, 0, by + 0.03, -0.04)); // trilho
  for (let k = 0; k < 10; k++) g.add(boxM(0.03, 0.004, 0.006, M.poly, 0, by + 0.036, -0.15 + k * 0.024));
  g.add(boxM(0.006, 0.014, 0.05, M.steelLight, 0.018, by + 0.004, -0.02)); // tampa ejeção
  g.add(cylZ(0.023, 0.023, -0.145, -0.41, M.poly, by, 0, 8));
  g.add(boxM(0.016, 0.006, 0.26, M.poly, 0, by + 0.024, -0.28));
  g.add(cylZ(0.0085, 0.0085, -0.41, -0.53, M.steel, by));
  const brake = cylZ(0.0125, 0.0125, -0.53, -0.585, M.steel, by);
  g.add(brake);
  g.add(boxM(0.026, 0.004, 0.012, M.poly, 0, by + 0.009, -0.55));
  g.add(boxM(0.026, 0.004, 0.012, M.poly, 0, by + 0.009, -0.566));
  // empunhadura e coronha
  const grip = boxM(0.028, 0.1, 0.034, M.poly, 0, by - 0.1, 0.055);
  grip.rotation.x = -0.32;
  g.add(grip);
  g.add(triggerGroup(M, by - 0.072));
  g.add(cylZ(0.0145, 0.0145, 0.08, 0.27, M.poly, by - 0.004));
  g.add(
    profile(
      [
        [-0.37, -0.11],
        [-0.37, 0.025],
        [-0.22, 0.02],
        [-0.2, -0.015],
        [-0.25, -0.03],
        [-0.27, -0.08],
      ],
      0.036,
      M.poly,
      0.004,
    ),
  );
  // carregador curvo (anima na recarga)
  const mag = new THREE.Group();
  mag.position.set(0, by - 0.06, -0.035);
  const ms = new THREE.Shape();
  ms.moveTo(-0.022, 0);
  ms.lineTo(0.022, 0);
  ms.quadraticCurveTo(0.03, -0.09, 0.06, -0.17);
  ms.lineTo(0.015, -0.18);
  ms.quadraticCurveTo(-0.012, -0.095, -0.022, 0);
  const mg = new THREE.ExtrudeGeometry(ms, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 });
  mg.translate(0, 0, -0.011);
  mg.rotateY(Math.PI / 2);
  // a frente do carregador fica em -Z
  mag.add(new THREE.Mesh(mg, M.poly));
  g.add(mag);
  // mira holográfica
  const sy = by + 0.06;
  g.add(boxM(0.024, 0.02, 0.05, M.poly, 0, by + 0.044, -0.05));
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.055, 20, 1, true), M.poly);
  tube.geometry.rotateX(Math.PI / 2);
  tube.position.set(0, sy, -0.05);
  tube.material = M.poly.clone();
  tube.material.side = THREE.DoubleSide;
  g.add(tube);
  const glass = mesh(new THREE.CircleGeometry(0.018, 20), M.glassDot, 0, sy, -0.075);
  g.add(glass);
  const dot = mesh(new THREE.SphereGeometry(0.0019, 8, 6), M.redDot, 0, sy, -0.074);
  g.add(dot);
  g.userData = { by, sightY: sy, muzzle: new THREE.Vector3(0, by, -0.59), mag, grip: new THREE.Vector3(0.004, by - 0.095, 0.06), fore: new THREE.Vector3(-0.004, by - 0.03, -0.27), port: new THREE.Vector3(0.02, by + 0.005, -0.02), dot };
  return g;
}

// ---------------------------------------------------------------- besta
function buildCrossbow() {
  const M = mats();
  const g = new THREE.Group();
  const by = 0.052;
  g.add(
    profile(
      [
        [-0.36, -0.03],
        [-0.36, -0.14],
        [-0.27, -0.125],
        [-0.1, -0.065],
        [-0.06, -0.065],
        [-0.035, -0.115],
        [-0.005, -0.115],
        [0.01, -0.04],
        [0.1, -0.012],
        [0.1, 0.03],
        [-0.02, 0.03],
        [-0.1, 0.02],
        [-0.28, 0.005],
      ],
      0.044,
      M.wood,
    ),
  );
  g.add(boxM(0.032, 0.026, 0.52, M.carbon, 0, by - 0.013, -0.33));
  g.add(boxM(0.012, 0.004, 0.5, M.steelLight, 0, by + 0.001, -0.33));
  g.add(boxM(0.07, 0.05, 0.05, M.carbon, 0, by - 0.01, -0.58));
  // estribo
  const stir = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.005, 6, 16, Math.PI), M.steel);
  stir.position.set(0, by - 0.03, -0.62);
  stir.rotation.set(Math.PI / 2, 0, Math.PI);
  g.add(stir);
  // braços curvados para trás + cames
  const tips = [];
  for (const side of [1, -1]) {
    let px = 0.03 * side;
    let pz = -0.575;
    for (let k = 0; k < 5; k++) {
      const nx = px + 0.058 * side;
      const nz = pz + 0.012 + k * 0.012;
      const len = Math.hypot(nx - px, nz - pz);
      const seg = boxM(len + 0.004, 0.034 - k * 0.003, 0.012, M.carbon, (px + nx) / 2, by - 0.006, (pz + nz) / 2);
      seg.rotation.y = -Math.atan2(nz - pz, nx - px);
      g.add(seg);
      px = nx;
      pz = nz;
    }
    const cam = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.012, 16), M.alu, px, by - 0.006, pz);
    g.add(cam);
    tips.push(new THREE.Vector3(px, by + 0.004, pz + 0.01));
  }
  // corda (3 pontos) – atualizada pela animação
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  const string = new THREE.Line(sg, M.string);
  string.frustumCulled = false;
  g.add(string);
  // trava da corda
  g.add(boxM(0.036, 0.022, 0.04, M.steel, 0, by + 0.006, -0.06));
  // virote
  const bolt = makeBoltMesh(M);
  bolt.position.set(0, by + 0.008, -0.07);
  g.add(bolt);
  // luneta pequena
  const sy = by + 0.062;
  g.add(cylZ(0.012, 0.012, -0.06, -0.21, M.scope, sy));
  g.add(cylZ(0.012, 0.018, -0.21, -0.24, M.scope, sy));
  g.add(cylZ(0.012, 0.016, -0.06, -0.035, M.scope, sy));
  g.add(boxM(0.01, 0.05, 0.012, M.steel, 0, by + 0.03, -0.09));
  g.add(boxM(0.01, 0.05, 0.012, M.steel, 0, by + 0.03, -0.19));
  const lf = mesh(new THREE.CircleGeometry(0.016, 18), M.lens, 0, sy, -0.2405);
  lf.rotation.y = Math.PI;
  g.add(lf);
  g.add(triggerGroup(M, by - 0.06));
  g.userData = { by, sightY: sy, muzzle: new THREE.Vector3(0, by + 0.008, -0.5), string, tips, bolt, grip: new THREE.Vector3(0.004, -0.072, 0.03), fore: new THREE.Vector3(-0.004, by - 0.04, -0.3) };
  return g;
}

export function makeBoltMesh(M = mats()) {
  const b = new THREE.Group();
  b.add(cylZ(0.0045, 0.0045, 0.0, -0.4, M.carbon, 0, 0, 8));
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.045, 3).rotateX(-Math.PI / 2), M.steelLight);
  tip.position.z = -0.42;
  b.add(tip);
  for (let k = 0; k < 3; k++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.014), M.fletch);
    f.rotation.set(0, Math.PI / 2, 0);
    const holder = new THREE.Group();
    holder.rotation.z = (k / 3) * Math.PI * 2;
    f.position.set(0, 0.01, -0.03);
    holder.add(f);
    b.add(holder);
  }
  return b;
}

export function makeShellMesh(kind) {
  const M = mats();
  const g = new THREE.Group();
  if (kind === 'shotgun') {
    g.add(cylZ(0.0105, 0.0105, 0.03, -0.035, M.shellRed, 0, 0, 10));
    g.add(cylZ(0.011, 0.011, 0.035, 0.022, M.brass, 0, 0, 10));
  } else {
    const s = kind === 'rifle' ? 1.3 : 1;
    g.add(cylZ(0.0058 * s, 0.0058 * s, 0.025 * s, -0.025 * s, M.brass, 0, 0, 8));
  }
  return g;
}

// mãos e antebraços (luva + manga), orientados a cada quadro
export class Arm {
  constructor(parent, left) {
    const M = mats();
    this.group = new THREE.Group();
    this.hand = new THREE.Group();
    const palm = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.045, 4, 8).rotateX(Math.PI / 2), M.glove);
    palm.scale.set(1.1, 0.85, 1);
    this.hand.add(palm);
    const fingers = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.011, 6, 10, Math.PI * 1.2), M.glove);
    fingers.rotation.set(0, Math.PI / 2, left ? Math.PI * 0.4 : Math.PI * 0.4);
    fingers.position.set(left ? 0.01 : -0.01, -0.01, 0.0);
    this.hand.add(fingers);
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.03, 3, 6), M.glove);
    thumb.position.set(left ? -0.02 : 0.02, 0.012, -0.02);
    thumb.rotation.set(0.9, 0, left ? 0.6 : -0.6);
    this.hand.add(thumb);
    // antebraço afinando no punho, manga com dobra
    this.fore = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.026, 1, 12).translate(0, 0, 0), M.sleeve);
    this.cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.026, 0.035, 12), M.glove);
    this.group.add(this.hand, this.fore, this.cuff);
    this.group.traverse((o) => (o.frustumCulled = false));
    parent.add(this.group);
  }
  place(wrist, elbow, handRot) {
    this.hand.position.copy(wrist);
    if (handRot) this.hand.quaternion.copy(handRot);
    const d = _d.subVectors(elbow, wrist);
    const len = d.length();
    this.fore.position.copy(wrist).addScaledVector(d, 0.5);
    this.fore.scale.set(1, len, 1);
    this.fore.quaternion.setFromUnitVectors(_y, d.normalize());
    this.cuff.position.copy(wrist).addScaledVector(d, 0.045);
    this.cuff.quaternion.copy(this.fore.quaternion);
  }
}
const _d = new THREE.Vector3();
const _y = new THREE.Vector3(0, 1, 0);

export const BUILDERS = { rifle: buildRifle, shotgun: buildShotgun, ar: buildRifleAR, crossbow: buildCrossbow };
export { mats as gunMaterials };
