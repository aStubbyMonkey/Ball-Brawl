// Rendering + physics world + fixed-step loop + level containers.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class Engine {
  constructor(container) {
    this.container = container;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = skyTexture();
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
    this.camPos = new THREE.Vector3(0, 18, 16);
    this.camLook = new THREE.Vector3(0, 0, 0);
    this.camTargetPos = this.camPos.clone();
    this.camTargetLook = this.camLook.clone();
    this.shake = 0;

    scene.add(new THREE.HemisphereLight(0xdff3ff, 0x7a5c99, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(8, 20, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -18; sc.right = sc.top = 18; sc.near = 1; sc.far = 60;
    sun.shadow.bias = -0.0005;
    scene.add(sun);
    this.sun = sun;

    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -22, 0) });
    world.allowSleep = false;
    world.defaultContactMaterial.friction = 0.3;
    world.defaultContactMaterial.restitution = 0.2;
    this.world = world;

    this.mat = {
      ground: new CANNON.Material('ground'),
      ball: new CANNON.Material('ball'),
      bouncy: new CANNON.Material('bouncy'),
      ice: new CANNON.Material('ice'),
    };
    const cm = (a, b, friction, restitution) =>
      world.addContactMaterial(new CANNON.ContactMaterial(a, b, { friction, restitution }));
    cm(this.mat.ball, this.mat.ground, 0.35, 0.25);
    cm(this.mat.ball, this.mat.ball, 0.05, 0.85);
    cm(this.mat.ball, this.mat.bouncy, 0.1, 1.4);
    cm(this.mat.ball, this.mat.ice, 0.01, 0.1);

    this.fixedDt = 1 / 60;
    this.time = 0;
    this.timeScale = 1;
    this._acc = 0;
    this._last = performance.now();

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Smoothly move the camera. Pass instant:true to snap. */
  setCamera({ pos, look, fov, instant }) {
    if (pos) this.camTargetPos.set(...pos);
    if (look) this.camTargetLook.set(...look);
    if (fov) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    if (instant) { this.camPos.copy(this.camTargetPos); this.camLook.copy(this.camTargetLook); }
  }

  addShake(amount) { this.shake = Math.min(0.6, this.shake + amount); }

  /** A container for one game's meshes + bodies, removed together on dispose(). */
  createLevel() {
    const engine = this;
    const group = new THREE.Group();
    this.scene.add(group);
    const bodies = new Set();
    return {
      group,
      add(mesh, body) {
        if (mesh) group.add(mesh);
        if (body) { engine.world.addBody(body); bodies.add(body); }
        return mesh || body;
      },
      addBody(body) { engine.world.addBody(body); bodies.add(body); return body; },
      removeBody(body) { if (bodies.delete(body)) engine.world.removeBody(body); },
      dispose() {
        for (const b of bodies) engine.world.removeBody(b);
        bodies.clear();
        engine.scene.remove(group);
        group.traverse((o) => {
          o.geometry?.dispose?.();
          const m = o.material;
          if (m) (Array.isArray(m) ? m : [m]).forEach((mm) => { mm.map?.dispose?.(); mm.dispose?.(); });
        });
      },
    };
  }

  /** onFixed(dt) runs before every physics step; onFrame(dt) once per rendered frame. */
  start(onFixed, onFrame) {
    const tick = (now) => {
      let frameDt = Math.min(0.1, (now - this._last) / 1000);
      this._last = now;
      this._acc += frameDt * this.timeScale;
      let steps = 0;
      while (this._acc >= this.fixedDt && steps < 5) {
        onFixed(this.fixedDt);
        this.world.step(this.fixedDt);
        this.time += this.fixedDt;
        this._acc -= this.fixedDt;
        steps++;
      }
      if (steps === 5) this._acc = 0;
      onFrame(frameDt);
      this._updateCamera(frameDt);
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  _updateCamera(dt) {
    const k = 1 - Math.pow(0.02, dt);
    this.camPos.lerp(this.camTargetPos, k);
    this.camLook.lerp(this.camTargetLook, k);
    this.camera.position.copy(this.camPos);
    if (this.shake > 0.001) {
      const s = this.shake;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.shake *= Math.pow(0.001, dt);
    }
    this.camera.lookAt(this.camLook);
  }
}

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#6ec6ff');
  grd.addColorStop(0.55, '#b39ddb');
  grd.addColorStop(1, '#ff9eb5');
  g.fillStyle = grd; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
