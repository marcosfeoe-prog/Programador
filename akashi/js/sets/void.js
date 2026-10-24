// Cenário: fundo abstrato para a abertura, o intervalo (eyecatch) e cartões
// de personagem. Um cilindro em volta da câmera com padrões de mangá:
// degradê, linhas de velocidade radiais, retícula (pontos) e listras.
import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec3 vP;
varying vec2 vUv;
void main() {
  vP = position;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`;
const FRAG = /* glsl */ `
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform float uMode;
uniform float uTime;
uniform float uSpin;
varying vec3 vP;
varying vec2 vUv;
float h( float x ) { return fract( sin( x * 91.3 ) * 47453.5 ); }
void main() {
  float a = atan( vP.x, vP.z );
  float y = vP.y;
  vec3 col = mix( uC2, uC1, smoothstep( -12.0, 14.0, y ) );
  if ( uMode > 0.5 && uMode < 1.5 ) {
    // linhas de velocidade em volta (raios)
    float k = floor( ( a + uTime * uSpin ) * 40.0 );
    float r = h( k + floor( uTime * 10.0 ) );
    float line = step( 0.55, r ) * smoothstep( 0.4, 0.0, abs( fract( ( a + uTime * uSpin ) * 40.0 ) - 0.5 ) );
    col = mix( col, uC3, line * 0.8 );
  } else if ( uMode > 1.5 && uMode < 2.5 ) {
    // retícula
    vec2 g = vec2( a * 60.0, y * 3.0 );
    vec2 f = fract( g ) - 0.5;
    float rad = mix( 0.05, 0.45, smoothstep( -10.0, 12.0, y ) );
    col = mix( col, uC3, smoothstep( rad + 0.04, rad, length( f ) ) );
  } else if ( uMode > 2.5 && uMode < 3.5 ) {
    // listras diagonais andando
    float s = fract( ( a * 8.0 + y * 0.4 ) - uTime * 0.6 );
    col = mix( col, uC3, step( 0.5, s ) * 0.5 );
  }
  gl_FragColor = vec4( col, 1.0 );
  #include <colorspace_fragment>
}`;

export function buildVoid(q) {
  const g = new THREE.Group();
  const U = {
    uC1: { value: new THREE.Color(0xc0202a) },
    uC2: { value: new THREE.Color(0x1a0408) },
    uC3: { value: new THREE.Color(0x000000) },
    uMode: { value: 1 },
    uTime: { value: 0 },
    uSpin: { value: 0 },
  };
  const back = new THREE.Mesh(
    new THREE.CylinderGeometry(40, 40, 80, 64, 1, true),
    new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: U, side: THREE.BackSide, depthWrite: false, fog: false }),
  );
  back.renderOrder = -5;
  back.position.y = 1;
  g.add(back);
  // chão escuro brilhante (só aparece se a tomada pedir)
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(30, 48),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.005;
  g.add(floor);
  return {
    group: g,
    U,
    floor,
    look(o = {}) {
      U.uC1.value.set(o.c1 ?? 0xc0202a);
      U.uC2.value.set(o.c2 ?? 0x1a0408);
      U.uC3.value.set(o.c3 ?? 0x000000);
      U.uMode.value = o.mode ?? 1;
      U.uSpin.value = o.spin ?? 0;
      floor.visible = o.floor !== false;
    },
    env: {
      sky: 'day',
      showSky: false,
      hemi: { sky: 0xffffff, ground: 0x666666, int: 1.5 },
      sun: { color: 0xffffff, int: 2.2, dir: [0.5, 0.6, 0.8], box: 6, center: [0, 1, 0], shadow: false },
      fog: { color: 0x000000, near: 500, far: 1000 },
      rim: 0x000000,
    },
    update(t) {
      U.uTime.value = t;
    },
  };
}
