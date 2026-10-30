// Cena 3D da garagem: plataforma giratória iluminada com o carro escolhido.
// Também gera as miniaturas dos carros para os menus.
import * as THREE from 'three';
import { buildCar } from './cars.js';
import { glowTexture } from './textures.js';
import { damp } from './util.js';

export class Garage {
  constructor(game) {
    this.game = game;
    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color('#163a7a');
    scene.fog = new THREE.Fog('#1d4a9a', 20, 52);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    // fundo em degradê
    const bgMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {},
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: `varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = mix(vec3(0.05,0.13,0.32), vec3(0.12,0.36,0.78), smoothstep(-0.2, 0.6, h));
        c += vec3(0.1,0.25,0.5) * pow(max(0.0, 1.0 - abs(h - 0.05) * 3.0), 3.0); gl_FragColor = vec4(c, 1.);
        #include <colorspace_fragment>
      }`,
    });
    const bg = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), bgMat);
    scene.add(bg);
    this.bg = bg;
    // piso e plataforma
    const floor = new THREE.Mesh(new THREE.CircleGeometry(58, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0e2350, roughness: 0.5, metalness: 0.2 }));
    floor.receiveShadow = true;
    scene.add(floor);
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.4, 0.25, 64), new THREE.MeshStandardMaterial({ color: 0x1a3c86, roughness: 0.35, metalness: 0.4 }));
    plat.position.y = 0.12;
    plat.receiveShadow = true;
    scene.add(plat);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.06, 8, 96).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3fa0ff }));
    ring.position.y = 0.25;
    scene.add(ring);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(13, 13).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTexture('rgba(70,150,255,0.6)', 'rgba(70,150,255,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.position.y = 0.02;
    scene.add(halo);
    this.turn = new THREE.Group();
    this.turn.position.y = 0.25;
    scene.add(this.turn);
    // luzes
    scene.add(new THREE.HemisphereLight(0xbcd6ff, 0x1a2a50, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(5, 9, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const c = key.shadow.camera;
    c.left = c.bottom = -6;
    c.right = c.top = 6;
    key.shadow.bias = -0.0005;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x6fb6ff, 1.4);
    rim.position.set(-6, 4, -6);
    scene.add(rim);
    this.envMap = this.makeStudioEnv();
    scene.environment = this.envMap;
    this.angle = 0.7;
    this.vel = 0.25;
    this.dragging = false;
    this.zoom = 1;
    this.focusY = 0.6;
    this.car = null;
    this.key = '';
    this.bindDrag();
  }

  makeStudioEnv() {
    const r = this.game.renderer;
    const s = new THREE.Scene();
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(10, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
        fragmentShader: `varying vec3 vP; void main(){ vec3 d = normalize(vP); vec3 c = mix(vec3(0.08,0.12,0.25), vec3(0.75,0.85,1.0), smoothstep(-0.3, 0.9, d.y));
          c += vec3(2.5) * smoothstep(0.92, 0.97, d.y);
          c += vec3(1.6) * smoothstep(0.97, 0.995, max(dot(d, normalize(vec3(1.,0.3,0.4))), dot(d, normalize(vec3(-1.,0.25,-0.5)))));
          gl_FragColor = vec4(c, 1.); }`,
      }),
    );
    s.add(m);
    const pm = new THREE.PMREMGenerator(r);
    const rt = pm.fromScene(s, 0, 0.1, 100);
    pm.dispose();
    return rt.texture;
  }

  bindDrag() {
    const el = this.game.canvas;
    let last = 0;
    el.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      this.dragging = true;
      last = e.clientX;
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - last;
      last = e.clientX;
      this.angle += dx * 0.01;
      this.vel = dx * 0.6;
    });
    window.addEventListener('pointerup', () => (this.dragging = false));
  }

  setCar(id, look) {
    const key = id + JSON.stringify(look);
    if (this.car && this.carId === id) {
      this.car.setPaint(look.paint);
      this.car.setRim(look.rim);
      this.car.setNeon(look.neon);
      this.key = key;
      return;
    }
    if (this.car) {
      this.turn.remove(this.car.group);
      this.car.dispose();
    }
    this.car = buildCar(id, look);
    this.carId = id;
    this.key = key;
    this.turn.add(this.car.group);
    this.pop = 0;
  }

  update(dt, view = 'garage') {
    if (!this.dragging) {
      this.vel = damp(this.vel, 0.3, 1.5, dt);
      this.angle += this.vel * dt;
    }
    this.turn.rotation.y = this.angle;
    if (this.car) {
      this.pop = Math.min(1, (this.pop ?? 1) + dt * 3);
      const s = 0.85 + 0.15 * (1 - (1 - this.pop) ** 3);
      this.car.group.scale.setScalar(s);
      this.car.animate(dt, 0, 0, 0);
    }
    const cam = this.camera;
    const portrait = cam.aspect < 1;
    // menu: carro mais à direita; garagem: centralizado no alto (painel embaixo)
    // ox < 0 empurra o carro para a direita; oy > 0 para cima
    const target = view === 'menu' ? { d: portrait ? 17 : 14, y: portrait ? 3.2 : 3.4, ox: portrait ? 0 : -2.4, oy: portrait ? 0.6 : 0.2 } : { d: portrait ? 19 : 13.5, y: portrait ? 4.4 : 3.4, ox: portrait ? 0 : -2.2, oy: portrait ? 4.6 : 1.2 };
    this.cur = this.cur || { ...target };
    for (const k in target) this.cur[k] = damp(this.cur[k], target[k], 4, dt);
    const a = 0.35;
    cam.position.set(Math.sin(a) * this.cur.d, this.cur.y, Math.cos(a) * this.cur.d);
    cam.lookAt(0, 0.6, 0);
    // desloca o carro na tela (deixa espaço para os painéis)
    cam.setViewOffset(1000, 1000, this.cur.ox * 60, this.cur.oy * 60, 1000, 1000);
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Miniatura de um carro (dataURL), renderizada fora da tela.
  thumbnail(id, look, w = 256, h = 160, angle = -1.95) {
    const r = this.game.renderer;
    const s = new THREE.Scene();
    s.environment = this.envMap;
    s.add(new THREE.HemisphereLight(0xffffff, 0x334466, 1.8));
    const l = new THREE.DirectionalLight(0xffffff, 2.4);
    l.position.set(4, 6, 5);
    s.add(l);
    const car = buildCar(id, look);
    car.glow.visible = false;
    s.add(car.group);
    car.group.rotation.y = angle;
    const cam = new THREE.PerspectiveCamera(30, w / h, 0.1, 50);
    cam.position.set(3.9, 2.1, 4.8);
    cam.lookAt(0, 0.55, 0);
    const rt = new THREE.WebGLRenderTarget(w * 2, h * 2, { samples: 4 });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    r.setRenderTarget(rt);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(s, cam);
    const px = new Uint8Array(w * 2 * h * 2 * 4);
    r.readRenderTargetPixels(rt, 0, 0, w * 2, h * 2, px);
    r.setRenderTarget(null);
    r.setClearColor(0x000000, 1);
    const c = document.createElement('canvas');
    c.width = w * 2;
    c.height = h * 2;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w * 2, h * 2);
    // inverte verticalmente
    for (let y = 0; y < h * 2; y++) img.data.set(px.subarray((h * 2 - 1 - y) * w * 2 * 4, (h * 2 - y) * w * 2 * 4), y * w * 2 * 4);
    ctx.putImageData(img, 0, 0);
    car.dispose();
    rt.dispose();
    return c.toDataURL();
  }
}
