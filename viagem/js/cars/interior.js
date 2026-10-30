// Interior: painel, quadro de instrumentos (ponteiros de verdade), volante, bancos,
// console, forros, retrovisor que reflete a estrada, tela central e o motorista
// com os braços no volante.
import * as THREE from 'three';
import { clamp, lerp } from '../util.js';
import { merge, paint, xf, box, cyl, roundBox } from '../geom.js';

function dialTex(spec) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d');
  const classic = spec.interior.classic;
  const sport = spec.interior.sport;
  ctx.fillStyle = '#050506';
  ctx.fillRect(0, 0, 1024, 512);
  const P = spec.phys;
  const maxKmh = Math.max(160, Math.ceil((P.vmax || 300) / 20) * 20);
  const redK = P.redline / 1000;
  const maxK = Math.ceil(redK + 1);
  const dial = (cx, cy, R, max, step, red, label, unit) => {
    // face
    const g = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R);
    if (classic) {
      g.addColorStop(0, '#1a1a18');
      g.addColorStop(1, '#0c0c0a');
    } else {
      g.addColorStop(0, '#16181c');
      g.addColorStop(1, '#060708');
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = classic ? '#c8c0a8' : '#5a6068';
    ctx.lineWidth = 6;
    ctx.stroke();
    const a0 = Math.PI * 0.75;
    const a1 = Math.PI * 2.25;
    if (red) {
      ctx.strokeStyle = '#d8281e';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.86, a0 + (a1 - a0) * (red / max), a1);
      ctx.stroke();
    }
    if (sport && !red) {
      ctx.strokeStyle = spec.interior.accent;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.93, a0, a1);
      ctx.stroke();
    }
    ctx.fillStyle = classic ? '#efe6cc' : '#e8ecf0';
    ctx.strokeStyle = classic ? '#efe6cc' : '#e8ecf0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let v = 0; v <= max + 1e-6; v += step / 2) {
      const a = a0 + (a1 - a0) * (v / max);
      const major = Math.abs(v / step - Math.round(v / step)) < 1e-6;
      ctx.lineWidth = major ? 5 : 2.5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * R * (major ? 0.78 : 0.83), cy + Math.sin(a) * R * (major ? 0.78 : 0.83));
      ctx.lineTo(cx + Math.cos(a) * R * 0.9, cy + Math.sin(a) * R * 0.9);
      ctx.stroke();
      if (major) {
        ctx.font = `bold ${Math.round(R * 0.15)}px sans-serif`;
        ctx.fillText(String(Math.round(v)), cx + Math.cos(a) * R * 0.63, cy + Math.sin(a) * R * 0.63);
      }
    }
    ctx.font = `${Math.round(R * 0.09)}px sans-serif`;
    ctx.fillText(label, cx, cy + R * 0.42);
    ctx.fillText(unit, cx, cy + R * 0.55);
  };
  dial(256, 256, 230, maxK, 1, redK, 'RPM', 'x1000');
  dial(768, 256, 230, maxKmh, maxKmh > 240 ? 40 : 20, 0, 'km/h', '');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return { tex: t, maxKmh, maxK };
}

function leatherTex(color) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4000; i++) {
    const g = 200 + Math.random() * 55;
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  // costuras / acolchoado
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 3;
  for (let y = 0; y < 256; y += 42) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.5;
  for (let y = 4; y < 256; y += 42) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  void color;
  return t;
}

export class Interior {
  constructor(body, spec, mats) {
    this.body = body;
    this.spec = spec;
    this.group = new THREE.Group();
    const I = spec.interior;
    const side = I.side;
    this.side = side;
    const g = spec.cabin;
    const pc = body.params(g.gf);
    const tm = (g.gf + g.sg0) / 2;
    const pm = body.params(tm);
    const cowlZ = body.zOf(g.gf);
    const beltY = pc.ys;
    const floorY = Math.max(pm.yb + 0.1, 0.12);
    this.floorY = floorY;
    const wIn = Math.min(body.params(g.gf - 0.02).wsh, pm.wsh) * 0.9;
    const dashDepth = clamp(0.32 + (cowlZ - body.zOf(g.rf)) * 0.32, 0.42, I.upright ? 0.55 : 0.78);
    const dashBack = cowlZ - dashDepth;
    // ponto do quadril e olhos
    const hipZ = dashBack - (I.upright ? 0.62 : 0.78);
    const hipY = floorY + (I.sport ? 0.16 : I.upright ? 0.36 : 0.24);
    const eyeT = body.tOf(hipZ + 0.05);
    const roofAtEye = body.roofY(clamp(eyeT, g.gr, g.gf), side * 0.37);
    const eyeY = Math.min(roofAtEye - 0.11, hipY + (I.upright ? 0.78 : 0.72));
    this.hip = new THREE.Vector3(side * 0.37, hipY, hipZ);
    this.eye = new THREE.Vector3(side * 0.37, eyeY, hipZ + 0.06);
    const M = mats;
    const parts = { dash: [], soft: [], leather: [], metal: [], black: [], carpet: [], accent: [], wood: [] };

    // ----- painel (perfil extrudado de lado a lado)
    const sh = new THREE.Shape();
    const zc = 0;
    sh.moveTo(zc + 0.02, beltY - 0.01);
    sh.lineTo(zc - dashDepth * 0.75, beltY + 0.015);
    sh.quadraticCurveTo(zc - dashDepth, beltY + 0.02, zc - dashDepth, beltY - 0.08);
    sh.lineTo(zc - dashDepth + 0.05, beltY - 0.2);
    sh.quadraticCurveTo(zc - dashDepth * 0.7, floorY + 0.35, zc - dashDepth * 0.4, floorY + 0.3);
    sh.lineTo(zc + 0.02, floorY + 0.15);
    sh.closePath();
    const dash = new THREE.ExtrudeGeometry(sh, { depth: wIn * 2, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 8 });
    // shape (x,y) = (z,y) -> rotaciona para extrudar ao longo de x
    dash.rotateY(-Math.PI / 2);
    dash.translate(wIn, 0, cowlZ);
    parts.dash.push(dash);
    // faixa de acabamento
    const strip = box(wIn * 2, 0.03, 0.02);
    strip.translate(0, beltY - 0.1, dashBack - 0.005);
    parts.accent.push(strip);
    // saídas de ar
    for (const vx of [-0.6, -0.12, 0.12, 0.6]) {
      if (Math.abs(vx) > wIn - 0.1) continue;
      const v = roundBox(0.14, 0.06, 0.03, 0.01, 1);
      v.translate(vx, beltY - 0.05, dashBack - 0.01);
      parts.black.push(v);
      for (let k = 0; k < 3; k++) {
        const sl = box(0.12, 0.006, 0.01);
        sl.translate(vx, beltY - 0.07 + k * 0.02, dashBack - 0.025);
        parts.metal.push(sl);
      }
    }
    // capuz do quadro
    const hood = roundBox(0.44, 0.07, 0.2, 0.03, 2);
    hood.translate(side * 0.37, beltY + 0.07, dashBack + 0.1);
    parts.dash.push(hood);
    // console central
    const cons = roundBox(0.24, beltY - floorY - 0.05, dashDepth * 0.7, 0.04, 2);
    cons.translate(0, (beltY + floorY) / 2 - 0.05, dashBack + dashDepth * 0.25);
    parts.dash.push(cons);
    const tunnel = roundBox(0.22, 0.22, Math.max(0.3, dashBack - hipZ + 0.3), 0.04, 2);
    tunnel.translate(0, floorY + 0.11, (dashBack + hipZ - 0.2) / 2);
    parts.dash.push(tunnel);
    const arm = roundBox(0.2, 0.08, 0.3, 0.03, 2);
    arm.translate(0, hipY + 0.12, hipZ + 0.1);
    parts.leather.push(arm);
    // alavanca de câmbio
    const lever = cyl(0.008, 0.012, 0.12, 8);
    lever.translate(0, floorY + 0.28, hipZ + 0.42);
    parts.metal.push(lever);
    const knob = I.classic ? new THREE.SphereGeometry(0.03, 12, 8) : roundBox(0.04, 0.06, 0.07, 0.015, 1);
    knob.translate(0, floorY + 0.35, hipZ + 0.42);
    parts.black.push(knob);
    // assoalho, parede corta-fogo e fundo
    const cabinRear = body.zOf(g.sg0);
    const flo = box(wIn * 2.1, 0.04, cowlZ - cabinRear + 0.2);
    flo.translate(0, floorY, (cowlZ + cabinRear) / 2);
    parts.carpet.push(flo);
    const fw = box(wIn * 2.1, beltY - floorY, 0.03);
    fw.translate(0, (beltY + floorY) / 2, cowlZ + 0.02);
    parts.carpet.push(fw);
    const twoSeat = !I.rear && !I.camper;
    if (twoSeat) {
      const bh = body.zOf(Math.max(g.gr, g.sg0 - 0.02));
      const bk = box(wIn * 2.1, beltY - floorY + 0.25, 0.04);
      bk.translate(0, (beltY + floorY + 0.25) / 2, Math.max(bh, hipZ - 0.45));
      parts.soft.push(bk);
    }
    // forros das portas: apoio de braço
    for (const sx of [-1, 1]) {
      const px = body.sideX(tm, beltY - 0.2) - 0.08;
      const len = Math.max(0.6, cowlZ - dashDepth - (hipZ - 0.4));
      const ar = roundBox(0.08, 0.05, len, 0.02, 1);
      ar.translate(sx * px, beltY - 0.17, hipZ + len / 2 - 0.35);
      parts.leather.push(ar);
      const pull = roundBox(0.02, 0.03, 0.12, 0.008, 1);
      pull.translate(sx * (px + 0.01), beltY - 0.07, hipZ + 0.35);
      parts.metal.push(pull);
      const spk = cyl(0.07, 0.07, 0.01, 16);
      spk.rotateZ(Math.PI / 2);
      spk.translate(sx * (px + 0.03), floorY + 0.22, dashBack + 0.1);
      parts.black.push(spk);
    }
    // bancos
    const seat = (x, z, kind) => {
      const out = [];
      const W = kind === 'bench' ? 0.52 : 0.5;
      const cush = roundBox(W, 0.12, 0.5, 0.05, 2);
      cush.translate(0, 0, 0.12);
      out.push(cush);
      const back = roundBox(W, 0.66, 0.12, 0.05, 2);
      back.translate(0, 0.36, -0.12);
      back.rotateX(-0.28);
      out.push(back);
      if (kind === 'bucket') {
        for (const sx of [-1, 1]) {
          const bol = roundBox(0.09, 0.5, 0.16, 0.04, 2);
          bol.translate(sx * (W / 2 - 0.02), 0.3, -0.08);
          bol.rotateX(-0.28);
          out.push(bol);
          const cb = roundBox(0.08, 0.1, 0.42, 0.035, 1);
          cb.translate(sx * (W / 2 - 0.02), 0.06, 0.12);
          out.push(cb);
        }
      }
      const head = roundBox(0.26, 0.18, 0.1, 0.04, 2);
      head.translate(0, 0.8, -0.3);
      out.push(head);
      const geo = merge(out);
      geo.translate(x, hipY - 0.06, z);
      return geo;
    };
    const seatKind = I.seats === 'bench' ? 'comfort' : I.seats;
    parts.leather.push(seat(side * 0.37, hipZ, seatKind));
    parts.leather.push(seat(-side * 0.37, hipZ, seatKind));
    if (I.rear) {
      const rz = hipZ - 0.86;
      if (rz > cabinRear + 0.25) {
        const bench = seat(0, rz, 'comfort');
        bench.scale(2.4, 1, 1);
        bench.translate(0, 0, rz * (1 - 1));
        const rb = merge([bench]);
        rb.translate(0, 0.04, 0);
        parts.leather.push(rb);
      }
    }
    if (I.camper) {
      // armário, pia e cama no fundo da van
      const cz = hipZ - 0.9;
      const cab = box(0.5, 0.75, 1.1);
      cab.translate(-side * (wIn - 0.28), floorY + 0.38, cz - 0.4);
      parts.wood.push(cab);
      const top = box(0.52, 0.03, 1.12);
      top.translate(-side * (wIn - 0.28), floorY + 0.77, cz - 0.4);
      parts.metal.push(top);
      const bed = roundBox(wIn * 1.9, 0.18, 1.0, 0.06, 2);
      bed.translate(0, floorY + 0.48, cabinRear + 0.6);
      parts.leather.push(bed);
      for (let k = 0; k < 3; k++) {
        const pil = roundBox(0.45, 0.12, 0.3, 0.05, 2);
        pil.translate(-0.5 + k * 0.5, floorY + 0.64, cabinRear + 0.25);
        parts.accent.push(pil);
      }
    }
    // pedais
    for (const px of [0.1, -0.05, -0.18]) {
      const pd = box(0.06, 0.1, 0.02);
      pd.rotateX(0.5);
      pd.translate(side * 0.37 + side * px, floorY + 0.14, dashBack + 0.12);
      parts.metal.push(pd);
    }

    const add = (list, mat) => {
      if (!list.length) return null;
      const m = new THREE.Mesh(merge(list), mat);
      this.group.add(m);
      return m;
    };
    add(parts.dash, M.dash);
    add(parts.soft, M.soft);
    add(parts.leather, M.leather);
    add(parts.metal, M.metal);
    add(parts.black, M.black);
    add(parts.carpet, M.carpet);
    add(parts.accent, M.accent);
    add(parts.wood, M.wood);

    // ----- quadro de instrumentos
    const dt = dialTex(spec);
    this.maxKmh = dt.maxKmh;
    this.maxK = dt.maxK;
    const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.17), new THREE.MeshStandardMaterial({ map: dt.tex, emissiveMap: dt.tex, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.4 }));
    const clPos = new THREE.Vector3(side * 0.37, beltY - 0.03, dashBack - 0.012);
    cl.position.copy(clPos);
    cl.rotation.y = Math.PI;
    cl.rotation.x = 0.3;
    this.group.add(cl);
    this.cluster = cl;
    const needleMat = new THREE.MeshStandardMaterial({ color: 0xff3a1a, emissive: 0xff3a1a, emissiveIntensity: 0.6 });
    const needle = () => {
      const g = new THREE.BoxGeometry(0.003, 0.068, 0.003);
      g.translate(0, 0.03, 0);
      const pivot = new THREE.Group();
      const m = new THREE.Mesh(g, needleMat);
      pivot.add(m);
      const capm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.006, 12), M.black);
      capm.rotation.x = Math.PI / 2;
      pivot.add(capm);
      return pivot;
    };
    this.tach = needle();
    this.speedo = needle();
    // posições dos centros dos mostradores no plano do quadro (coordenadas locais)
    for (const [n, u] of [
      [this.tach, -0.085],
      [this.speedo, 0.085],
    ]) {
      n.position.set(u, 0, 0.004);
      cl.add(n);
    }
    // painel digital (marcha e velocidade)
    const dc = document.createElement('canvas');
    dc.width = 128;
    dc.height = 64;
    this.digCtx = dc.getContext('2d');
    this.digTex = new THREE.CanvasTexture(dc);
    this.digTex.colorSpace = THREE.SRGBColorSpace;
    const dig = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.03), new THREE.MeshBasicMaterial({ map: this.digTex, toneMapped: false }));
    dig.position.set(0, -0.045, 0.003);
    cl.add(dig);
    this.lastDig = '';

    // ----- tela central
    const sc = document.createElement('canvas');
    sc.width = 256;
    sc.height = 160;
    this.screenCanvas = sc;
    this.screenTex = new THREE.CanvasTexture(sc);
    this.screenTex.colorSpace = THREE.SRGBColorSpace;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.125), new THREE.MeshBasicMaterial({ map: this.screenTex, toneMapped: false }));
    scr.position.set(0, beltY - 0.06, dashBack - 0.015);
    scr.rotation.y = Math.PI;
    scr.rotation.x = 0.12;
    this.group.add(scr);
    this.screen = scr;

    // ----- volante
    const sw = new THREE.Group();
    const swR = I.classic ? 0.19 : I.upright ? 0.2 : 0.175;
    const rim = new THREE.TorusGeometry(swR, 0.017, 10, 40);
    if (I.sport) {
      // base achatada
      const p = rim.attributes.position;
      for (let i = 0; i < p.count; i++) if (p.getY(i) < -swR * 0.75) p.setY(i, -swR * 0.75 + (p.getY(i) + swR * 0.75) * 0.3);
      rim.computeVertexNormals();
    }
    const swParts = [rim];
    for (const a of I.classic ? [0, Math.PI * 0.66, Math.PI * 1.33] : [-Math.PI / 2, 0.15, Math.PI - 0.15]) {
      const sp = box(swR * 0.9, 0.022, 0.012);
      sp.translate(swR * 0.45, 0, 0);
      sp.rotateZ(a);
      swParts.push(sp);
    }
    const hub = cyl(0.06, 0.07, 0.05, 20);
    hub.rotateX(Math.PI / 2);
    hub.translate(0, 0, -0.01);
    swParts.push(hub);
    const swGeo = merge(swParts);
    const swMesh = new THREE.Mesh(swGeo, M.wheel);
    sw.add(swMesh);
    const logo = new THREE.Mesh(new THREE.CircleGeometry(0.02, 16), M.metal);
    logo.position.z = 0.017;
    sw.add(logo);
    if (I.sport) {
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.022, 0.026), M.accent);
      top.position.y = swR;
      sw.add(top);
    }
    const swPos = new THREE.Vector3(side * 0.37, eyeY - (I.upright ? 0.4 : 0.34), dashBack - 0.16);
    this.swPivot = new THREE.Group();
    this.swPivot.position.copy(swPos);
    this.swPivot.rotation.x = I.upright ? 0.55 : 0.32;
    this.swPivot.rotation.y = Math.PI;
    this.swPivot.add(sw);
    this.wheel = sw;
    this.swR = swR;
    this.group.add(this.swPivot);
    const colm = cyl(0.03, 0.04, 0.35, 10);
    colm.rotateX(Math.PI / 2);
    const column = new THREE.Mesh(colm, M.black);
    column.position.set(0, 0, -0.2);
    this.swPivot.add(column);

    // ----- retrovisor interno (com reflexo de verdade)
    const rvZ = body.zOf(g.rf) - 0.1;
    const rvY = body.roofY(g.rf - 0.01, 0) - 0.08;
    const rvH = new THREE.Mesh(roundBox(0.26, 0.075, 0.035, 0.015, 1), M.black);
    rvH.position.set(0, rvY, rvZ);
    rvH.rotation.x = 0.05;
    this.group.add(rvH);
    this.mirrorRT = new THREE.WebGLRenderTarget(256, 72, { samples: 0 });
    this.mirrorRT.texture.colorSpace = THREE.SRGBColorSpace;
    const mm = new THREE.MeshBasicMaterial({ map: this.mirrorRT.texture, toneMapped: false });
    const mplane = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.062), mm);
    mplane.rotation.y = Math.PI;
    mplane.position.set(0, rvY, rvZ - 0.019);
    this.group.add(mplane);
    this.mirrorPlane = mplane;
    // a câmera olha para trás; a imagem é espelhada na textura
    this.mirrorRT.texture.repeat.x = -1;
    this.mirrorRT.texture.offset.x = 1;
    this.mirrorCam = new THREE.PerspectiveCamera(30, 256 / 72, 1.3, 2500);
    this.mirrorCam.position.set(0, rvY + 0.05, rvZ - 0.2);
    this.group.add(this.mirrorCam);
    // para-sóis
    for (const sx of [-1, 1]) {
      const v = roundBox(0.32, 0.015, 0.15, 0.006, 1);
      v.translate(sx * 0.37, body.roofY(g.rf - 0.02, sx * 0.37) - 0.035, rvZ - 0.06);
      const vm = new THREE.Mesh(v, M.soft);
      this.group.add(vm);
    }

    this.buildDriver(M);
  }

  buildDriver(M) {
    const I = this.spec.interior;
    const side = this.side;
    const hip = this.hip;
    const skinTones = ['#e8c4a0', '#c89870', '#8a5a3a', '#f0d0b0', '#a87850'];
    const shirt = ['#2a4a7a', '#7a2a2a', '#e8e4d8', '#2a5a3a', '#4a4a4e', '#d8a040'];
    const k = Math.floor(Math.abs(this.spec.id.charCodeAt(0) * 7 + this.spec.id.length * 3));
    const skin = new THREE.MeshStandardMaterial({ color: skinTones[k % skinTones.length], roughness: 0.7 });
    const cloth = new THREE.MeshStandardMaterial({ color: shirt[k % shirt.length], roughness: 0.9 });
    const hair = new THREE.MeshStandardMaterial({ color: ['#2a1a10', '#5a3a1a', '#1a1a1a', '#a8783a'][k % 4], roughness: 0.8 });
    const d = new THREE.Group();
    this.driver = d;
    const back = 0.28;
    const torso = new THREE.Mesh(roundBox(0.38, 0.5, 0.22, 0.09, 2), cloth);
    torso.position.set(hip.x, hip.y + 0.32, hip.z - 0.08);
    torso.rotation.x = -back;
    d.add(torso);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 10), skin);
    neck.position.set(hip.x, hip.y + 0.62, hip.z - 0.14);
    d.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), skin);
    head.scale.set(0.9, 1.08, 1);
    head.position.set(hip.x, this.eye.y + 0.02, this.eye.z - 0.03);
    d.add(head);
    const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.104, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
    hairM.scale.set(0.92, 1.1, 1.04);
    hairM.position.copy(head.position).add(new THREE.Vector3(0, 0.012, -0.012));
    hairM.rotation.x = -0.3;
    d.add(hairM);
    this.head = [head, hairM];
    // pernas (estáticas)
    for (const sx of [-1, 1]) {
      const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.36, 4, 8), cloth);
      th.rotation.x = Math.PI / 2 - 0.15;
      th.position.set(hip.x + sx * 0.1, hip.y + 0.06, hip.z + 0.24);
      d.add(th);
      const sh = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.34, 4, 8), cloth);
      sh.rotation.x = I.upright ? 0.25 : 0.9;
      sh.position.set(hip.x + sx * 0.1, Math.max(this.floorY + 0.2, hip.y - 0.1), hip.z + 0.5);
      d.add(sh);
    }
    // braços (IK de dois ossos até as mãos no volante)
    this.arms = [];
    for (const sx of [-1, 1]) {
      const up = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 1, 4, 8), cloth);
      const lo = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 1, 4, 8), skin);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 8), skin);
      hand.scale.set(0.9, 0.75, 1.25);
      d.add(up, lo, hand);
      this.arms.push({ sx, up, lo, hand, shoulder: new THREE.Vector3(hip.x + sx * 0.19, hip.y + 0.52, hip.z - 0.12) });
    }
    this.group.add(d);
    this._v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this._q = new THREE.Quaternion();
    this.updateArms(0);
  }

  // coloca um cilindro (cápsula de altura 1) entre dois pontos
  bone(mesh, a, b, rad) {
    const v = this._v[4].subVectors(b, a);
    const len = v.length();
    mesh.position.copy(a).addScaledVector(v, 0.5);
    mesh.scale.set(1, Math.max(0.01, len - rad * 2) / 1, 1);
    this._q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
    mesh.quaternion.copy(this._q);
  }

  updateArms(steerAngle) {
    if (!this.arms) return;
    this.swPivot.updateMatrix();
    for (const a of this.arms) {
      // posição da mão no aro (10 e 2 horas), girando com o volante
      const base = a.sx > 0 ? Math.PI * 0.82 : Math.PI * 0.18;
      const ang = base + clamp(steerAngle, -1.3, 1.3);
      const hand = this._v[0].set(Math.cos(ang) * this.swR, Math.sin(ang) * this.swR, 0.03);
      hand.applyMatrix4(this.swPivot.matrix);
      const sh = a.shoulder;
      const L1 = 0.29;
      const L2 = 0.28;
      const dir = this._v[1].subVectors(hand, sh);
      let d = dir.length();
      d = Math.min(d, L1 + L2 - 0.005);
      dir.normalize();
      const aa = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
      const h = Math.sqrt(Math.max(0, L1 * L1 - aa * aa));
      // cotovelo para baixo e para fora
      const pole = this._v[2].set(a.sx * 0.8, -1, 0.1).normalize();
      pole.addScaledVector(dir, -pole.dot(dir)).normalize();
      const elbow = this._v[3].copy(sh).addScaledVector(dir, aa).addScaledVector(pole, h);
      const handPos = sh.clone().addScaledVector(dir, d);
      this.bone(a.up, sh, elbow, 0.042);
      this.bone(a.lo, elbow, handPos, 0.03);
      a.hand.position.copy(handPos);
    }
  }

  wheelLocalMatrix() {
    this.wheel.updateMatrix();
    this.swPivot.updateMatrix();
    return new THREE.Matrix4().multiplyMatrices(this.swPivot.matrix, this.wheel.matrix);
  }

  // atualização por quadro (só quando a câmera está dentro)
  update(state, full) {
    const steer = state.steerAngle * 5;
    this.wheel.rotation.z = steer;
    if (full) this.updateArms(steer);
    const rpm = state.rpm / 1000;
    const kmh = Math.abs(state.speed) * 3.6;
    const a0 = Math.PI * 0.75;
    const a1 = Math.PI * 2.25;
    // ponteiro aponta para +y local; ângulo do mostrador medido no canvas (y para baixo)
    const ang = (v, max) => {
      const a = a0 + (a1 - a0) * clamp(v / max, 0, 1.02);
      return -(a + Math.PI / 2);
    };
    this.tach.rotation.z = ang(rpm, this.maxK);
    this.speedo.rotation.z = ang(kmh, this.maxKmh);
    if (full) {
      const txt = `${state.gearLabel}|${Math.round(kmh)}`;
      if (txt !== this.lastDig) {
        this.lastDig = txt;
        const c = this.digCtx;
        c.fillStyle = '#05080a';
        c.fillRect(0, 0, 128, 64);
        c.fillStyle = '#8fe8ff';
        c.font = 'bold 34px sans-serif';
        c.textAlign = 'left';
        c.fillText(state.gearLabel, 8, 44);
        c.textAlign = 'right';
        c.font = 'bold 30px sans-serif';
        c.fillText(String(Math.round(kmh)), 122, 44);
        this.digTex.needsUpdate = true;
      }
    }
  }

  // tela central: navegação, rádio e hora
  drawScreen(info) {
    const c = this.screenCanvas.getContext('2d');
    const W = 256;
    const H = 160;
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0e1a26');
    g.addColorStop(1, '#05080c');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#8fe8ff';
    c.font = 'bold 18px sans-serif';
    c.textAlign = 'left';
    c.fillText(info.time || '', 10, 24);
    c.textAlign = 'right';
    c.fillStyle = '#c8d4e0';
    c.font = '13px sans-serif';
    c.fillText(info.temp || '', W - 10, 24);
    c.strokeStyle = 'rgba(255,255,255,0.15)';
    c.beginPath();
    c.moveTo(10, 34);
    c.lineTo(W - 10, 34);
    c.stroke();
    c.textAlign = 'center';
    if (info.dest) {
      // seta de navegação
      c.save();
      c.translate(50, 86);
      c.rotate(info.bearing || 0);
      c.fillStyle = '#5fe6ff';
      c.beginPath();
      c.moveTo(0, -24);
      c.lineTo(16, 14);
      c.lineTo(0, 6);
      c.lineTo(-16, 14);
      c.closePath();
      c.fill();
      c.restore();
      c.textAlign = 'left';
      c.fillStyle = '#ffffff';
      c.font = 'bold 17px sans-serif';
      c.fillText(info.dest, 90, 76);
      c.fillStyle = '#9fb0c0';
      c.font = '14px sans-serif';
      c.fillText(info.dist || '', 90, 98);
    } else {
      c.fillStyle = '#9fb0c0';
      c.font = '15px sans-serif';
      c.fillText(info.place || 'Explorando', W / 2, 84);
    }
    c.fillStyle = 'rgba(255,255,255,0.08)';
    c.fillRect(0, H - 36, W, 36);
    c.textAlign = 'left';
    c.fillStyle = '#ffb35a';
    c.font = '13px sans-serif';
    c.fillText('♪ ' + (info.radio || ''), 10, H - 14);
    this.screenTex.needsUpdate = true;
  }

  setHeadVisible(v) {
    for (const h of this.head) h.visible = v;
    // no cockpit só os antebraços e as mãos aparecem
    if (this.arms) for (const a of this.arms) a.up.visible = v;
  }
}
