// Pós-processamento: a cena é renderizada em HDR (com MSAA) e passa por bloom
// leve, gradação de cor e efeitos de anime — flash branco, quadro de impacto
// invertido, quadro de mangá em preto e branco (com vermelho), aberração
// cromática, zoom blur, sépia de flashback, vinheta e granulação.
import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;

const BRIGHT = /* glsl */ `
uniform sampler2D tIn;
uniform float uThr;
varying vec2 vUv;
void main() {
  vec3 c = texture2D( tIn, vUv ).rgb;
  float b = max( c.r, max( c.g, c.b ) );
  gl_FragColor = vec4( c * smoothstep( uThr, uThr + 0.4, b ), 1.0 );
}`;

const BLUR = /* glsl */ `
uniform sampler2D tIn;
uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec3 c = texture2D( tIn, vUv ).rgb * 0.227;
  c += texture2D( tIn, vUv + uDir * 1.385 ).rgb * 0.316;
  c += texture2D( tIn, vUv - uDir * 1.385 ).rgb * 0.316;
  c += texture2D( tIn, vUv + uDir * 3.231 ).rgb * 0.07;
  c += texture2D( tIn, vUv - uDir * 3.231 ).rgb * 0.07;
  gl_FragColor = vec4( c, 1.0 );
}`;

const FINAL = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform vec2 uRes;
uniform float uTime;
uniform float uExposure;
uniform float uSat;
uniform float uContrast;
uniform vec3 uTint;
uniform vec3 uLift;
uniform float uBloom;
uniform float uVignette;
uniform float uGrain;
uniform float uFlash;
uniform vec3 uFlashColor;
uniform float uInvert;
uniform float uMono;
uniform float uMonoRed;
uniform float uChroma;
uniform float uZoom;
uniform vec2 uZoomC;
uniform float uSepia;
uniform float uHalftone;
varying vec2 vUv;

float h( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
vec3 toSRGB( vec3 c ) {
  c = max( c, 0.0 );
  return mix( c * 12.92, 1.055 * pow( c, vec3( 1.0 / 2.4 ) ) - 0.055, step( 0.0031308, c ) );
}
vec3 sampleScene( vec2 uv ) {
  if ( uChroma > 0.0 ) {
    vec2 d = ( uv - 0.5 ) * uChroma;
    return vec3( texture2D( tScene, uv + d ).r, texture2D( tScene, uv ).g, texture2D( tScene, uv - d ).b );
  }
  return texture2D( tScene, uv ).rgb;
}
void main() {
  vec2 uv = vUv;
  vec3 col;
  if ( uZoom > 0.001 ) {
    vec2 dir = uv - uZoomC;
    col = vec3( 0.0 );
    float n = 10.0;
    float j = h( uv * 731.0 + uTime ) * 0.5;
    for ( float i = 0.0; i < 10.0; i++ ) col += sampleScene( uv - dir * uZoom * ( i + j ) / n );
    col /= n;
  } else col = sampleScene( uv );
  col += texture2D( tBloom, uv ).rgb * uBloom;
  col *= uExposure;
  col = col * uTint + uLift;
  // ombro suave para não estourar
  col = col / ( 1.0 + max( col - 0.85, 0.0 ) * 0.9 );
  col = toSRGB( col );
  float l = dot( col, vec3( 0.299, 0.587, 0.114 ) );
  col = mix( vec3( l ), col, uSat );
  col = ( col - 0.5 ) * uContrast + 0.5;
  if ( uSepia > 0.0 ) {
    vec3 sp = vec3( l * 1.07, l * 0.86, l * 0.62 ) + vec3( 0.06, 0.03, 0.0 );
    col = mix( col, sp, uSepia );
  }
  if ( uMono > 0.0 ) {
    // quadro de mangá: preto e branco chapado, retícula nos meios-tons
    float dots = length( fract( gl_FragCoord.xy / 5.0 ) - 0.5 );
    float m = l > 0.62 ? 1.0 : ( l > 0.3 ? step( 0.32 + ( 0.62 - l ) * 0.4, dots ) : 0.0 );
    vec3 mono = vec3( m );
    float red = smoothstep( 0.15, 0.35, col.r - max( col.g, col.b ) ) * uMonoRed;
    mono = mix( mono, vec3( 0.85, 0.05, 0.08 ), red );
    col = mix( col, mono, uMono );
  }
  col = mix( col, 1.0 - col, uInvert );
  if ( uHalftone > 0.0 ) {
    float dots = length( fract( gl_FragCoord.xy / 6.0 ) - 0.5 );
    col = mix( col, col * step( dots, 0.5 - l * 0.25 + 0.2 ), uHalftone );
  }
  vec2 v = uv - 0.5;
  col *= 1.0 - uVignette * smoothstep( 0.25, 0.85, length( v * vec2( 1.1, 1.0 ) ) );
  col += ( h( uv * uRes + fract( uTime * 13.7 ) * 100.0 ) - 0.5 ) * uGrain;
  col = mix( col, uFlashColor, uFlash );
  gl_FragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}`;

export const POST_DEFAULTS = {
  exposure: 1,
  sat: 1.08,
  contrast: 1.03,
  tint: [1, 1, 1],
  lift: [0, 0, 0],
  bloom: 0.55,
  bloomThr: 0.85,
  vignette: 0.32,
  grain: 0.025,
  flash: 0,
  flashColor: [1, 1, 1],
  invert: 0,
  mono: 0,
  monoRed: 1,
  chroma: 0,
  zoom: 0,
  zoomC: [0.5, 0.5],
  sepia: 0,
  halftone: 0,
};

export class Post {
  constructor(renderer, quality) {
    this.r = renderer;
    this.q = quality;
    const gl = renderer.getContext();
    const half = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
    this.type = half ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.samples = quality.msaa && gl.getParameter(gl.MAX_SAMPLES) > 0 ? Math.min(4, gl.getParameter(gl.MAX_SAMPLES)) : 0;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: this.type, samples: this.samples, depthBuffer: true });
    const lo = { type: this.type, depthBuffer: false };
    this.b1 = new THREE.WebGLRenderTarget(4, 4, lo);
    this.b2 = new THREE.WebGLRenderTarget(4, 4, lo);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.bright = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: BRIGHT, uniforms: { tIn: { value: null }, uThr: { value: 0.85 } } });
    this.blur = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: BLUR, uniforms: { tIn: { value: null }, uDir: { value: new THREE.Vector2() } } });
    this.U = {
      tScene: { value: this.rt.texture },
      tBloom: { value: this.b1.texture },
      uRes: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uExposure: { value: 1 },
      uSat: { value: 1 },
      uContrast: { value: 1 },
      uTint: { value: new THREE.Vector3(1, 1, 1) },
      uLift: { value: new THREE.Vector3() },
      uBloom: { value: 0 },
      uVignette: { value: 0 },
      uGrain: { value: 0 },
      uFlash: { value: 0 },
      uFlashColor: { value: new THREE.Vector3(1, 1, 1) },
      uInvert: { value: 0 },
      uMono: { value: 0 },
      uMonoRed: { value: 0 },
      uChroma: { value: 0 },
      uZoom: { value: 0 },
      uZoomC: { value: new THREE.Vector2(0.5, 0.5) },
      uSepia: { value: 0 },
      uHalftone: { value: 0 },
    };
    this.final = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FINAL, uniforms: this.U, depthTest: false, depthWrite: false });
    this.p = { ...POST_DEFAULTS };
  }

  setSize(w, h) {
    this.rt.setSize(w, h);
    const bw = Math.max(1, Math.floor(w / 4));
    const bh = Math.max(1, Math.floor(h / 4));
    this.b1.setSize(bw, bh);
    this.b2.setSize(bw, bh);
    this.U.uRes.value.set(w, h);
    this.bw = bw;
    this.bh = bh;
  }

  reset() {
    this.p = { ...POST_DEFAULTS };
  }

  set(o) {
    Object.assign(this.p, o);
  }

  pass(mat, target) {
    this.quad.material = mat;
    this.r.setRenderTarget(target);
    this.r.render(this.scene, this.cam);
  }

  render(scene, camera, t) {
    const r = this.r;
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(scene, camera);
    const p = this.p;
    const bloomOn = this.q.bloom && p.bloom > 0;
    if (bloomOn) {
      this.bright.uniforms.tIn.value = this.rt.texture;
      this.bright.uniforms.uThr.value = p.bloomThr;
      this.pass(this.bright, this.b1);
      for (let i = 0; i < 2; i++) {
        this.blur.uniforms.tIn.value = this.b1.texture;
        this.blur.uniforms.uDir.value.set((1 + i) / this.bw, 0);
        this.pass(this.blur, this.b2);
        this.blur.uniforms.tIn.value = this.b2.texture;
        this.blur.uniforms.uDir.value.set(0, (1 + i) / this.bh);
        this.pass(this.blur, this.b1);
      }
    }
    const U = this.U;
    U.uTime.value = t;
    U.uExposure.value = p.exposure;
    U.uSat.value = p.sat;
    U.uContrast.value = p.contrast;
    U.uTint.value.set(...p.tint);
    U.uLift.value.set(...p.lift);
    U.uBloom.value = bloomOn ? p.bloom : 0;
    U.uVignette.value = p.vignette;
    U.uGrain.value = p.grain;
    U.uFlash.value = p.flash;
    U.uFlashColor.value.set(...p.flashColor);
    U.uInvert.value = p.invert;
    U.uMono.value = p.mono;
    U.uMonoRed.value = p.monoRed;
    U.uChroma.value = p.chroma;
    U.uZoom.value = p.zoom;
    U.uZoomC.value.set(...p.zoomC);
    U.uSepia.value = p.sepia;
    U.uHalftone.value = p.halftone;
    this.pass(this.final, null);
  }
}
