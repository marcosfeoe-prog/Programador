// Céu pintado no estilo anime: degradê com brilho do sol no horizonte,
// nuvens de bordas definidas e sombreadas em dois tons, e estrelas.
import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize( position );
  vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  gl_Position = p.xyww;
}`;

const FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uMid;
uniform vec3 uBottom;
uniform vec3 uGlow;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunSize;
uniform float uCover;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform vec3 uCloudRim;
uniform float uCloudScale;
uniform float uTime;
uniform float uStars;
uniform float uSunDisk;
varying vec3 vDir;

float h21( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float vn( vec2 p ) {
  vec2 i = floor( p ); vec2 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( h21( i ), h21( i + vec2( 1, 0 ) ), f.x ), mix( h21( i + vec2( 0, 1 ) ), h21( i + vec2( 1, 1 ) ), f.x ), f.y );
}
float fbm( vec2 p ) {
  float s = 0.0; float a = 0.5;
  for ( int i = 0; i < 5; i++ ) { s += vn( p ) * a; p = p * 2.03 + vec2( 1.7, 9.2 ); a *= 0.5; }
  return s;
}

void main() {
  vec3 d = normalize( vDir );
  float h = d.y;
  vec3 col;
  if ( h > 0.0 ) col = mix( uMid, uTop, pow( clamp( h, 0.0, 1.0 ), 0.55 ) );
  else col = mix( uMid, uBottom, pow( clamp( -h * 3.0, 0.0, 1.0 ), 0.6 ) );
  // brilho do horizonte do lado do sol
  vec2 sh = normalize( uSunDir.xz + 1e-4 );
  vec2 dh = normalize( d.xz + 1e-4 );
  float az = dot( sh, dh ) * 0.5 + 0.5;
  float band = exp( -abs( h ) * 7.0 );
  col = mix( col, uGlow, band * pow( az, 2.0 ) * 0.85 );
  // sol
  float sd = dot( d, normalize( uSunDir ) );
  float disk = smoothstep( cos( uSunSize ), cos( uSunSize * 0.85 ), sd ) * uSunDisk;
  col += uSunColor * ( pow( max( sd, 0.0 ), 90.0 ) * 0.6 + pow( max( sd, 0.0 ), 8.0 ) * 0.12 );
  col = mix( col, uSunColor * 1.4 + 0.3, disk );
  // estrelas
  if ( uStars > 0.0 && h > 0.0 ) {
    vec2 sp = d.xz / ( h + 0.3 ) * 90.0;
    vec2 ci = floor( sp );
    float r = h21( ci );
    vec2 off = vec2( h21( ci + 3.1 ), h21( ci + 7.7 ) ) - 0.5;
    float dist = length( fract( sp ) - 0.5 - off * 0.6 );
    float tw = 0.6 + 0.4 * sin( uTime * ( 2.0 + r * 4.0 ) + r * 30.0 );
    col += step( 0.93, r ) * smoothstep( 0.09, 0.0, dist ) * uStars * tw * smoothstep( 0.0, 0.25, h );
  }
  // nuvens
  if ( uCover > 0.0 && h > -0.02 ) {
    vec2 p = d.xz / ( h + 0.16 ) * uCloudScale + vec2( uTime * 0.012, uTime * 0.004 );
    vec2 w = vec2( fbm( p * 0.5 + 3.0 ), fbm( p * 0.5 + 8.0 ) );
    float n = fbm( p + w * 1.2 );
    float thr = 1.0 - uCover * 0.62;
    float fw = fwidth( n ) * 1.2 + 0.004;
    float c = smoothstep( thr - fw, thr + fw, n ) * smoothstep( -0.02, 0.12, h );
    float n2 = fbm( p + w * 1.2 - normalize( uSunDir.xz + 1e-4 ) * 0.09 );
    float lit = smoothstep( n2 - 0.01, n2 + 0.01, n + 0.015 );
    float core = smoothstep( thr + 0.12, thr + 0.2, n );
    vec3 cc = mix( uCloudShade, uCloudLit, max( lit, 1.0 - core ) * 0.85 + 0.15 * lit );
    float edge = ( 1.0 - smoothstep( thr, thr + 0.05, n ) );
    cc += uCloudRim * edge * pow( max( sd, 0.0 ), 3.0 ) * 1.5;
    col = mix( col, cc, c );
  }
  gl_FragColor = vec4( col, 1.0 );
  #include <colorspace_fragment>
}`;

export class Sky {
  constructor() {
    this.uniforms = {
      uTop: { value: new THREE.Color() },
      uMid: { value: new THREE.Color() },
      uBottom: { value: new THREE.Color() },
      uGlow: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color() },
      uSunSize: { value: 0.045 },
      uSunDisk: { value: 1 },
      uCover: { value: 0.5 },
      uCloudLit: { value: new THREE.Color() },
      uCloudShade: { value: new THREE.Color() },
      uCloudRim: { value: new THREE.Color() },
      uCloudScale: { value: 1.6 },
      uTime: { value: 0 },
      uStars: { value: 0 },
    };
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), this.mat);
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
  }

  set(s) {
    const U = this.uniforms;
    for (const k of ['top', 'mid', 'bottom', 'glow', 'sunColor', 'cloudLit', 'cloudShade', 'cloudRim']) {
      const u = U['u' + k[0].toUpperCase() + k.slice(1)];
      if (s[k] !== undefined) u.value.set(s[k]);
    }
    if (s.sunDir) U.uSunDir.value.set(...s.sunDir).normalize();
    U.uSunSize.value = s.sunSize ?? 0.045;
    U.uSunDisk.value = s.sunDisk ?? 1;
    U.uCover.value = s.cover ?? 0.5;
    U.uCloudScale.value = s.cloudScale ?? 1.6;
    U.uStars.value = s.stars ?? 0;
  }

  update(camera, t) {
    this.mesh.position.copy(camera.position);
    this.uniforms.uTime.value = t;
  }
}

// Paletas de céu usadas pelos cenários.
export const SKIES = {
  dawn: {
    top: 0x6f8fd0,
    mid: 0xf4c4b0,
    bottom: 0x9a8a9a,
    glow: 0xffb27a,
    sunDir: [0.6, 0.12, -0.8],
    sunColor: 0xffd8a0,
    cover: 0.45,
    cloudLit: 0xffe2d2,
    cloudShade: 0xb090b8,
    cloudRim: 0xffc890,
  },
  day: {
    top: 0x2f78d8,
    mid: 0xa8d4f4,
    bottom: 0x7a8a90,
    glow: 0xd8ecff,
    sunDir: [0.4, 0.75, -0.5],
    sunColor: 0xfff4d8,
    cover: 0.5,
    cloudLit: 0xffffff,
    cloudShade: 0xb4c4e0,
    cloudRim: 0xffffff,
  },
  afternoon: {
    top: 0x3f74c4,
    mid: 0xd8d4c0,
    bottom: 0x8a8070,
    glow: 0xffd8a0,
    sunDir: [-0.7, 0.32, 0.6],
    sunColor: 0xffe0b0,
    cover: 0.42,
    cloudLit: 0xfff2dc,
    cloudShade: 0xb8a8b8,
    cloudRim: 0xffd8a0,
  },
  sunset: {
    top: 0x3a3a8a,
    mid: 0xf08a5a,
    bottom: 0x5a3a4a,
    glow: 0xffb050,
    sunDir: [0.45, 0.06, 0.89],
    sunColor: 0xffa040,
    sunSize: 0.07,
    cover: 0.48,
    cloudLit: 0xffb27a,
    cloudShade: 0x8a5a8a,
    cloudRim: 0xffe0a0,
  },
  dusk: {
    top: 0x1c2050,
    mid: 0xb06a7a,
    bottom: 0x2a2030,
    glow: 0xf08a5a,
    sunDir: [-0.6, 0.02, 0.8],
    sunColor: 0xff8050,
    sunDisk: 0,
    cover: 0.35,
    cloudLit: 0xd88a8a,
    cloudShade: 0x4a3a6a,
    cloudRim: 0xff9a6a,
    stars: 0.35,
  },
  night: {
    top: 0x070a1a,
    mid: 0x1c2244,
    bottom: 0x0a0a12,
    glow: 0x3a3a6a,
    sunDir: [0.3, 0.5, -0.8],
    sunColor: 0xa0b0ff,
    sunSize: 0.03,
    sunDisk: 0.8,
    cover: 0.25,
    cloudLit: 0x3a4470,
    cloudShade: 0x161a30,
    cloudRim: 0x5a6aa0,
    stars: 1,
  },
};
