// Post-processing: a subtle tilt-shift "miniature" blur, vignette and a warm grade.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uTilt: { value: 1 },
    uFocus: { value: 0.55 },
    uVignette: { value: 0.32 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 uResolution; uniform float uTilt; uniform float uFocus; uniform float uVignette;
    varying vec2 vUv;
    void main(){
      vec4 base = texture2D(tDiffuse, vUv);
      // tilt-shift: blur grows away from a horizontal focus band
      float d = abs(vUv.y - uFocus);
      float r = smoothstep(0.24, 0.6, d) * 2.6 * uTilt;
      vec3 col = base.rgb;
      if (r > 0.05) {
        vec2 px = r / uResolution;
        vec3 acc = base.rgb; float w = 1.0;
        for (int i = 0; i < 12; i++) {
          float a = float(i) * 2.39996;
          float rr = sqrt(float(i) + 0.5) / 3.5;
          vec2 o = vec2(cos(a), sin(a)) * rr * px * 3.0;
          acc += texture2D(tDiffuse, vUv + o).rgb; w += 1.0;
        }
        col = acc / w;
      }
      // gentle warm grade in linear space: lift shadows toward teal, warm highlights
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col, col * vec3(0.94, 1.0, 1.04), (1.0 - smoothstep(0.0, 0.25, l)) * 0.35);
      col = mix(col, col * vec3(1.04, 1.0, 0.95), smoothstep(0.3, 1.2, l) * 0.35);
      // vignette
      vec2 q = vUv - 0.5;
      col *= 1.0 - uVignette * smoothstep(0.25, 0.85, dot(q, q) * 2.0);
      gl_FragColor = vec4(col, base.a);
    }`,
};

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.enabled = true;
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.finish = new ShaderPass(FinishShader);
    this.composer.addPass(this.finish);
    this.composer.addPass(new OutputPass());
  }

  setSize(w, h, pr) {
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.finish.uniforms.uResolution.value.set(w * pr, h * pr);
  }

  setTilt(v) { this.finish.uniforms.uTilt.value = v; }

  render(dt) {
    this.composer.render(dt);
  }
}
