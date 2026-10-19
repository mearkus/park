// Seasonal atmosphere (snow, falling leaves, pollen, fireflies) and flocks of birds.
import * as THREE from 'three';
import { HALF } from './terrain.js';

const LEAVES = [[0.85, 0.42, 0.12], [0.93, 0.66, 0.16], [0.72, 0.24, 0.1], [0.95, 0.78, 0.3]];

export class Ambience {
  constructor(scene, particles) {
    this.particles = particles;
    this.acc = 0;
    // Flocks: small dark chevrons that wheel high over the land
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0, -0.35, 0.3, -0.9, 0.15, 0, 0,
      0, 0, 0, 0.15, 0, 0, -0.35, 0.3, 0.9,
    ], 3));
    wing.computeVertexNormals();
    this.birdCount = 18;
    this.birds = new THREE.InstancedMesh(wing, new THREE.MeshBasicMaterial({ color: '#2a2622', side: THREE.DoubleSide }), this.birdCount);
    this.birds.frustumCulled = false;
    this.flock = [];
    for (let f = 0; f < 3; f++) {
      const cx = (Math.random() - 0.5) * 100, cz = (Math.random() - 0.5) * 100;
      for (let i = 0; i < 6; i++) {
        this.flock.push({ cx, cz, r: 26 + f * 9, h: 42 + f * 6 + Math.random() * 3, phase: f * 2 + i * 0.07, off: [(i % 3) * 1.6, Math.floor(i / 3) * 1.4], speed: 0.16 + f * 0.03, flap: Math.random() * 6 });
      }
    }
    scene.add(this.birds);
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler(0, 0, 0, 'YXZ');
    this.p = new THREE.Vector3();
    this.s = new THREE.Vector3();
  }

  // season: 0 spring 1 summer 2 autumn 3 winter
  update(dt, time, { target, season, night, snowy, active, rate = 1 }) {
    // birds (only by day)
    this.birds.visible = !night;
    if (!night) {
      this.flock.forEach((b, i) => {
        b.phase += dt * b.speed;
        const a = b.phase;
        const x = b.cx + Math.cos(a) * b.r - Math.sin(a) * b.off[0];
        const z = b.cz + Math.sin(a) * b.r + Math.cos(a) * b.off[0] - b.off[1];
        const flap = Math.sin(time * 9 + b.flap);
        this.e.set(0.35, -a - Math.PI / 2, 0);
        this.q.setFromEuler(this.e);
        this.m.compose(this.p.set(x, b.h + Math.sin(a * 3 + i) * 0.6, z), this.q, this.s.set(1.2, flap, 1.2));
        this.birds.setMatrixAt(i, this.m);
      });
      this.birds.instanceMatrix.needsUpdate = true;
    }
    if (!active) return;

    // weather particles spawned around what the camera looks at
    const fx = this.particles;
    const spawn = (n) => {
      this.acc += n * rate * dt;
      const k = Math.floor(this.acc);
      this.acc -= k;
      return k;
    };
    const around = (r) => {
      const x = THREE.MathUtils.clamp(target.x + (Math.random() - 0.5) * r, -HALF, HALF);
      const z = THREE.MathUtils.clamp(target.z + (Math.random() - 0.5) * r, -HALF, HALF);
      return [x, z];
    };
    if (season === 3 && snowy) {
      for (let i = spawn(70); i > 0; i--) {
        const [x, z] = around(130);
        fx.emit({ x, y: target.y + 30 + Math.random() * 15, z, vx: 0.6, vy: -3.2, spread: 0.6, life: 11, size: 0.32, color: [1, 1, 1], alpha: 0.9, drag: 0 });
      }
    } else if (season === 2) {
      for (let i = spawn(14); i > 0; i--) {
        const [x, z] = around(90);
        const c = LEAVES[Math.floor(Math.random() * LEAVES.length)];
        fx.emit({ x, y: target.y + 14 + Math.random() * 10, z, vx: 1.4, vy: -1.4, spread: 1.6, life: 9, size: 0.3, color: c, alpha: 0.95, drag: 0 });
      }
    } else if (night && season === 1) {
      for (let i = spawn(10); i > 0; i--) {
        const [x, z] = around(70);
        fx.emit({ x, y: target.y + 1 + Math.random() * 4, z, vy: 0.2, spread: 0.7, life: 4, size: 0.28, color: [1.6, 1.5, 0.5], alpha: 1, drag: 0 });
      }
    } else if (season === 0 && !night) {
      for (let i = spawn(8); i > 0; i--) {
        const [x, z] = around(70);
        fx.emit({ x, y: target.y + 2 + Math.random() * 6, z, vx: 0.8, vy: 0.15, spread: 0.6, life: 7, size: 0.16, color: [1, 0.95, 0.75], alpha: 0.85, drag: 0 });
      }
    }
  }
}
