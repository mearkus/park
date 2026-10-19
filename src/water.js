// Stylised water: depth-tinted using the terrain heightmap, with foam, fresnel and sun glints.
import * as THREE from 'three';
import { SIZE, HALF, N } from './terrain.js';

export function createWater(terrain, env) {
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, 96, 96);
  geo.rotateX(-Math.PI / 2);
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uHeight: { value: terrain.heightTex },
      uWaterLevel: { value: terrain.wl },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color('#ffffff') },
      uSky: { value: new THREE.Color('#bcd4e8') },
      uShallow: { value: new THREE.Color('#46c2c0') },
      uDeep: { value: new THREE.Color('#0b4a6e') },
      uNight: { value: 0 },
    },
  ]);
  uniforms.uHeight.value = terrain.heightTex;
  const texel = 1 / (N + 1);
  const mat = new THREE.ShaderMaterial({
    uniforms,
    fog: true,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */`
      #include <fog_pars_vertex>
      uniform float uTime;
      varying vec3 vW;
      void main(){
        vec3 p = position;
        vec4 w = modelMatrix * vec4(p, 1.0);
        w.y += sin(w.x*0.35 + uTime*1.3)*0.05 + cos(w.z*0.28 + uTime*1.1)*0.05;
        vW = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime; uniform sampler2D uHeight; uniform float uWaterLevel;
      uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uSky; uniform vec3 uShallow; uniform vec3 uDeep; uniform float uNight;
      varying vec3 vW;
      vec2 wave(vec2 p, vec2 d, float f, float s, float a){ float ph = dot(p,d)*f + uTime*s; return d * cos(ph) * a * f; }
      void main(){
        vec2 uv = (vW.xz + ${HALF.toFixed(1)}) / ${SIZE.toFixed(1)};
        uv = uv * (1.0 - ${texel.toFixed(6)}) + ${(texel / 2).toFixed(6)};
        float ground = (uWaterLevel - 12.0) + texture2D(uHeight, uv).r * 24.0;
        float depth = uWaterLevel - ground;
        if (depth < -0.3) discard;
        float camD = length(cameraPosition - vW);
        float detail = 1.0 - smoothstep(60.0, 200.0, camD);
        vec2 g = wave(vW.xz, normalize(vec2(1.0,0.3)), 0.7, 1.6, 0.06)
               + wave(vW.xz, normalize(vec2(-0.4,1.0)), 1.3, 2.1, 0.035)
               + (wave(vW.xz, normalize(vec2(0.7,-0.8)), 2.6, 2.9, 0.016)
               + wave(vW.xz, normalize(vec2(-0.9,-0.2)), 4.1, 3.7, 0.008)) * detail;
        g += vec2(sin(vW.z*0.53 + uTime*0.7 + sin(vW.x*0.21)*2.0), cos(vW.x*0.47 - uTime*0.6 + sin(vW.z*0.19)*2.0)) * 0.025;
        vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);
        vec3 col = mix(uShallow, uDeep, smoothstep(0.2, 7.0, depth));
        col = mix(col, uSky, clamp(fres*0.85 + 0.08, 0.0, 1.0));
        vec3 R = reflect(-uSunDir, n);
        float spec = pow(max(dot(R, V), 0.0), 140.0);
        col += uSunColor * spec * 1.6;
        float foamLine = 1.0 - smoothstep(0.0, 0.55 + 0.15*sin(uTime*1.7 + vW.x*0.6 + vW.z*0.4), depth);
        float foamNoise = 0.6 + 0.4*sin(vW.x*3.1 + uTime*2.0)*sin(vW.z*2.7 - uTime*1.6);
        float foam = foamLine * foamNoise;
        col = mix(col, vec3(0.95,0.98,1.0) * (1.0 - uNight*0.6), clamp(foam, 0.0, 1.0)*0.85);
        float alpha = mix(0.45, 0.93, smoothstep(0.0, 3.5, depth));
        alpha = max(alpha, foam*0.9);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = terrain.wl;
  mesh.renderOrder = 1;
  mesh.name = 'water';

  mesh.userData.update = (dt, t) => {
    uniforms.uTime.value = t;
    uniforms.uSunDir.value.copy(env.lightDir || env.sunDir);
    uniforms.uSunColor.value.copy(env.sun.color).multiplyScalar(env.nightness ? 0.5 : 1);
    uniforms.uSky.value.copy(env.reflect || env.fog.color);
    uniforms.uNight.value = env.nightness;
  };
  return mesh;
}
