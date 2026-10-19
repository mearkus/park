// Lightweight CPU particle system for steam, mist, smoke, sparks and dust.
import * as THREE from 'three';

function spriteTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Particles {
  constructor(scene, max = 3000) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.alpha0 = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.cursor = 0;

    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('pcolor', this.aCol);
    geo.setAttribute('psize', this.aSize);
    this.uniforms = { uTex: { value: spriteTexture() }, uScale: { value: 400 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */`
        attribute vec4 pcolor; attribute float psize; uniform float uScale; varying vec4 vC;
        void main(){ vC = pcolor; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = psize * uScale / max(-mv.z, 0.1); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uTex; varying vec4 vC;
        void main(){ vec4 t = texture2D(uTex, gl_PointCoord); if (vC.a * t.a < 0.004) discard; gl_FragColor = vec4(vC.rgb, vC.a * t.a);
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  setViewportHeight(h) {
    this.uniforms.uScale.value = h * 0.6;
  }

  // o: {x,y,z, vx,vy,vz, spread, life, size, grow, color:[r,g,b], alpha, drag, gravity, count}
  emit(o) {
    const count = o.count || 1;
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      const sp = o.spread || 0;
      this.pos[i * 3] = o.x + (Math.random() - 0.5) * (o.jitter || 0);
      this.pos[i * 3 + 1] = o.y;
      this.pos[i * 3 + 2] = o.z + (Math.random() - 0.5) * (o.jitter || 0);
      this.vel[i * 3] = (o.vx || 0) + (Math.random() - 0.5) * sp;
      this.vel[i * 3 + 1] = (o.vy || 0) + (Math.random() - 0.5) * sp * 0.5;
      this.vel[i * 3 + 2] = (o.vz || 0) + (Math.random() - 0.5) * sp;
      const life = (o.life || 2) * (0.75 + Math.random() * 0.5);
      this.life[i] = life;
      this.maxLife[i] = life;
      this.size[i] = (o.size || 1) * (0.8 + Math.random() * 0.4);
      this.grow[i] = o.grow || 0;
      const c = o.color || [1, 1, 1];
      this.col[i * 4] = c[0]; this.col[i * 4 + 1] = c[1]; this.col[i * 4 + 2] = c[2];
      this.alpha0[i] = o.alpha ?? 0.7;
      this.col[i * 4 + 3] = 0;
      this.drag[i] = o.drag ?? 0.5;
      this.grav[i] = o.gravity ?? 0;
    }
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.col[i * 4 + 3] = 0; this.size[i] = 0; continue; }
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const t = 1 - this.life[i] / this.maxLife[i];
      const fade = Math.min(1, t * 6) * (1 - t) * (1 - t) * 1.4;
      this.col[i * 4 + 3] = this.alpha0[i] * Math.min(1, fade);
    }
    this.aPos.needsUpdate = true;
    this.aCol.needsUpdate = true;
    this.aSize.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    this.size.fill(0);
    this.col.fill(0);
  }
}
