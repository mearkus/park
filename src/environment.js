// Sky, sun, time of day, distant cloud sea, drifting clouds and stars.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mulberry32 } from './noise.js';

export const TIMES = {
  dawn: {
    label: 'Dawn', elev: 5, azim: 105, sun: '#ffb27a', sunI: 2.4, hemiSky: '#ffd9b8', hemiGround: '#5d4a3c', hemiI: 0.8,
    horizon: '#efbd9c', exposure: 0.66, turbidity: 3.5, rayleigh: 1.8, env: 0.55, windows: 0.9, stars: 0, cloud: '#ffe2cc', cloudShade: '#b98f9c', reflect: '#a9b9d6',
  },
  day: {
    label: 'Midday', elev: 52, azim: 150, sun: '#fff3e2', sunI: 3.1, hemiSky: '#cfe4ff', hemiGround: '#6d5d48', hemiI: 0.9,
    horizon: '#bcd4e8', exposure: 0.5, turbidity: 2.5, rayleigh: 1.1, env: 0.6, windows: 0.1, stars: 0, cloud: '#ffffff', cloudShade: '#a9bed6', reflect: '#8fbce0',
  },
  golden: {
    label: 'Golden hour', elev: 11, azim: 235, sun: '#ffc078', sunI: 3.2, hemiSky: '#ffe2bf', hemiGround: '#5f4a38', hemiI: 0.75,
    horizon: '#f3cba3', exposure: 0.62, turbidity: 2.6, rayleigh: 1.25, env: 0.55, windows: 0.6, stars: 0, cloud: '#fff0dc', cloudShade: '#c49aa4', reflect: '#9cc0dc',
  },
  night: {
    label: 'Night', elev: -14, azim: 260, moon: true, sun: '#9fb6ff', sunI: 0.75, hemiSky: '#3b4f7a', hemiGround: '#1b1a22', hemiI: 0.55,
    horizon: '#1c2740', exposure: 0.85, turbidity: 2, rayleigh: 0.6, env: 0.18, windows: 2.6, stars: 1, cloud: '#3c4a6a', cloudShade: '#1b2236', reflect: '#1e2a44',
  },
};
export const TIME_ORDER = ['golden', 'day', 'dawn', 'night'];

export class Environment {
  constructor(scene, renderer, quality) {
    this.scene = scene;
    this.renderer = renderer;
    this.quality = quality;

    this.sky = new Sky();
    this.sky.scale.setScalar(9000);
    scene.add(this.sky);

    this.sunDir = new THREE.Vector3();
    this.sun = new THREE.DirectionalLight('#ffffff', 3);
    this.sun.castShadow = true;
    const sm = quality.high ? 4096 : 2048;
    this.sun.shadow.mapSize.set(sm, sm);
    const sc = this.sun.shadow.camera;
    sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110; sc.near = 10; sc.far = 500;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.18;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight('#cfe4ff', '#6d5d48', 0.9);
    scene.add(this.hemi);

    this.fog = new THREE.FogExp2('#bcd4e8', 0.0016);
    scene.fog = this.fog;

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null;

    this.windowUniform = { value: 0.2 };
    this.time = 0;

    this.makeCloudSea();
    this.makeStars();
    this.makeClouds();
  }

  makeCloudSea() {
    const geo = new THREE.PlaneGeometry(6000, 6000, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.seaUniforms = {
      uTime: { value: 0 },
      uLight: { value: new THREE.Color('#ffffff') },
      uShade: { value: new THREE.Color('#aebfd2') },
      uHorizon: { value: new THREE.Color('#bcd4e8') },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.seaUniforms,
      vertexShader: /* glsl */`
        varying vec3 vW;
        void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */`
        uniform float uTime; uniform vec3 uLight; uniform vec3 uShade; uniform vec3 uHorizon;
        varying vec3 vW;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float vnoise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
        float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*vnoise(p); p*=2.03; a*=0.5; } return s; }
        void main(){
          vec2 p = vW.xz * 0.0045 + vec2(uTime*0.006, uTime*0.003);
          float n = fbm(p) * 0.65 + fbm(p*2.7 - uTime*0.004) * 0.35;
          float puff = smoothstep(0.3, 0.78, n);
          vec3 col = mix(uShade, uLight, puff);
          float d = length(vW.xz);
          col = mix(col, uShade * 0.7, (1.0 - smoothstep(110.0, 260.0, d)) * 0.5);
          float fade = smoothstep(500.0, 2600.0, d);
          col = mix(col, uHorizon, fade);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      depthWrite: true,
    });
    this.cloudSea = new THREE.Mesh(geo, mat);
    this.cloudSea.position.y = -46;
    this.scene.add(this.cloudSea);
  }

  makeStars() {
    const rand = mulberry32(42);
    const n = 1800;
    const pos = new Float32Array(n * 3);
    const size = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = rand() * 2 - 1, th = rand() * Math.PI * 2;
      const y = Math.abs(u);
      const r = Math.sqrt(1 - y * y);
      pos[i * 3] = Math.cos(th) * r * 3000;
      pos[i * 3 + 1] = y * 3000 + 100;
      pos[i * 3 + 2] = Math.sin(th) * r * 3000;
      size[i] = rand() < 0.06 ? 3.2 : 1.2 + rand() * 1.4;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
    this.starUniforms = { uOpacity: { value: 0 }, uTime: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.starUniforms,
      transparent: true, depthWrite: false,
      vertexShader: `attribute float size; varying float vTw; uniform float uTime;
        void main(){ vTw = 0.7 + 0.3*sin(uTime*2.0 + position.x*0.37 + position.z*0.11);
          gl_PointSize = size * vTw * 1.5; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uOpacity; varying float vTw;
        void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.0,d); gl_FragColor = vec4(vec3(0.85,0.9,1.0)*1.6, a*uOpacity*vTw); }`,
    });
    this.stars = new THREE.Points(geo, mat);
    this.stars.renderOrder = -1;
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
  }

  makeClouds() {
    const rand = mulberry32(7);
    this.clouds = new THREE.Group();
    this.cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 1, transparent: true, opacity: 0.92 });
    const base = new THREE.IcosahedronGeometry(1, 1);
    for (let c = 0; c < 7; c++) {
      const g = new THREE.Group();
      const puffs = 4 + Math.floor(rand() * 4);
      for (let p = 0; p < puffs; p++) {
        const m = new THREE.Mesh(base, this.cloudMat);
        const s = 4 + rand() * 5;
        m.scale.set(s * 1.3, s * 0.7, s);
        m.position.set((p - puffs / 2) * 5 + rand() * 3, rand() * 2.5, rand() * 6 - 3);
        m.castShadow = true;
        g.add(m);
      }
      const ang = (c / 7) * Math.PI * 2 + rand() * 0.6, r = 125 + rand() * 70;
      g.position.set(Math.cos(ang) * r, -6 + rand() * 40, Math.sin(ang) * r);
      g.userData.ang = ang;
      g.userData.r = r;
      g.userData.speed = 1.2 + rand() * 1.5;
      this.clouds.add(g);
    }
    this.scene.add(this.clouds);
  }

  setTime(key) {
    const t = TIMES[key];
    this.key = key;
    const sky = this.sky.material.uniforms;
    sky.turbidity.value = t.turbidity;
    sky.rayleigh.value = t.rayleigh;
    sky.mieCoefficient.value = 0.006;
    sky.mieDirectionalG.value = 0.82;
    if (sky.cloudCoverage) {
      sky.cloudCoverage.value = 0.32;
      sky.cloudDensity.value = 0.35;
    }
    const phi = THREE.MathUtils.degToRad(90 - t.elev);
    const theta = THREE.MathUtils.degToRad(t.azim);
    this.sunDir.setFromSphericalCoords(1, phi, theta);
    sky.sunPosition.value.copy(this.sunDir);

    // Light comes from the sun, or from the moon at night.
    const lightDir = t.moon ? new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(50), THREE.MathUtils.degToRad(70)) : this.sunDir.clone();
    this.lightDir = lightDir;
    this.sun.position.copy(lightDir).multiplyScalar(220);
    this.sun.color.set(t.sun);
    this.sun.intensity = t.sunI;
    this.hemi.color.set(t.hemiSky);
    this.hemi.groundColor.set(t.hemiGround);
    this.hemi.intensity = t.hemiI;
    this.fog.color.set(t.horizon);
    this.renderer.toneMappingExposure = t.exposure;
    this.seaUniforms.uHorizon.value.set(t.horizon);
    this.seaUniforms.uLight.value.set(t.cloud);
    this.seaUniforms.uShade.value.set(t.cloudShade);
    this.cloudMat.color.set(t.cloud);
    this.reflect = new THREE.Color(t.reflect);
    this.starUniforms.uOpacity.value = t.stars;
    this.windowUniform.value = t.windows;
    this.nightness = t.moon ? 1 : 0;

    // Image-based lighting from the sky
    this.scene.remove(this.sky);
    const envScene = new THREE.Scene();
    envScene.add(this.sky);
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(envScene, 0, 1, 20000);
    envScene.remove(this.sky);
    this.scene.add(this.sky);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = t.env;
  }

  update(dt) {
    this.time += dt;
    this.seaUniforms.uTime.value = this.time;
    this.starUniforms.uTime.value = this.time;
    const sky = this.sky.material.uniforms;
    if (sky.time) sky.time.value = this.time;
    for (const c of this.clouds.children) {
      c.userData.ang += c.userData.speed * dt * 0.004;
      c.position.x = Math.cos(c.userData.ang) * c.userData.r;
      c.position.z = Math.sin(c.userData.ang) * c.userData.r;
    }
  }
}
