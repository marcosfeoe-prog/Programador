// Céu, luzes e mapa de ambiente (reflexos da pintura).
import * as THREE from 'three';

export const SUN_DIR = new THREE.Vector3(-0.45, 0.62, -0.35).normalize();

function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { sunDir: { value: SUN_DIR } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * p;
        gl_Position.z = gl_Position.w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 zenith = vec3(0.16, 0.36, 0.78);
        vec3 horizon = vec3(0.70, 0.82, 0.94);
        vec3 ground = vec3(0.42, 0.45, 0.42);
        vec3 col = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.55));
        col = mix(col, ground, smoothstep(0.0, -0.08, h));
        float s = max(dot(d, sunDir), 0.0);
        col += vec3(1.0, 0.85, 0.6) * pow(s, 8.0) * 0.35;
        col += vec3(1.0, 0.95, 0.85) * pow(s, 900.0) * 18.0;
        // nuvens simples
        if (h > 0.02) {
          vec2 uv = d.xz / (h + 0.15);
          float n = sin(uv.x * 3.1 + sin(uv.y * 2.3)) * sin(uv.y * 2.7 + sin(uv.x * 1.7));
          n += 0.5 * sin(uv.x * 7.3 + uv.y * 5.1) * sin(uv.y * 6.1 - uv.x * 2.2);
          float c = smoothstep(0.35, 0.95, n) * smoothstep(0.02, 0.25, h);
          col = mix(col, vec3(0.97, 0.97, 1.0), c * 0.75);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export function createSky() {
  const m = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), skyMaterial());
  m.frustumCulled = false;
  m.renderOrder = -10;
  return m;
}

// Mapa de ambiente: céu + painéis brilhantes, pré-filtrado com PMREM.
export function createEnvMap(renderer) {
  const scene = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMaterial());
  scene.add(sky);
  const panelMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const groundMat = new THREE.MeshBasicMaterial({ color: 0x3d4a35 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(48, 32), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -2;
  scene.add(ground);
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(14, 3), panelMat);
    const a = (i / 6) * Math.PI * 2;
    p.position.set(Math.cos(a) * 35, 10 + (i % 2) * 4, Math.sin(a) * 35);
    p.lookAt(0, 0, 0);
    scene.add(p);
  }
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(scene, 0.02);
  pm.dispose();
  return rt.texture;
}

export function createLights(scene) {
  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4a5a3a, 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
  sun.position.copy(SUN_DIR).multiplyScalar(120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const c = sun.shadow.camera;
  c.left = -45;
  c.right = 45;
  c.top = 45;
  c.bottom = -45;
  c.near = 1;
  c.far = 300;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  scene.add(sun.target);
  return { hemi, sun };
}
