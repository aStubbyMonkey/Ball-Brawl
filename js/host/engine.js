// Rendering + physics world + fixed-step loop + camera + level containers.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const _v = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();

export class Engine {
  constructor(container) {
    this.container = container;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false; // updated once per frame for the main view (ball cams reuse it)
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;
    // Soft studio reflections so glossy/metal cosmetics (crowns, shades) actually shine.
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    // Sky dome with a vertical gradient (colors set per level theme).
    this.skyUniforms = {
      top: { value: new THREE.Color('#6ec6ff') }, mid: { value: new THREE.Color('#b39ddb') }, bottom: { value: new THREE.Color('#ff9eb5') },
    };
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
      uniforms: this.skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP;
        void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.6)) : mix(mid, bottom, pow(-h, 0.5));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
    }));
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    this.sky = sky;
    scene.add(sky);
    scene.fog = new THREE.Fog('#c9b8f0', 70, 220);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 900);
    this.camPos = new THREE.Vector3(0, 18, 16);
    this.camLook = new THREE.Vector3(0, 0, 0);
    this.camTargetPos = this.camPos.clone();
    this.camTargetLook = this.camLook.clone();
    this._camVel = new THREE.Vector3();
    this._lookVel = new THREE.Vector3();
    this.camSmooth = 0.9; // seconds to (mostly) reach a fixed camera target
    this.shake = 0;
    this._follow = null;

    this.hemi = new THREE.HemisphereLight(0xdff3ff, 0x7a5c99, 0.5);
    scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -22; sc.right = sc.top = 22; sc.near = 1; sc.far = 90;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(sun, sun.target);
    this.sun = sun;
    this.sunOffset = new THREE.Vector3(10, 26, 12);

    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -22, 0) });
    world.allowSleep = false;
    world.broadphase = new CANNON.SAPBroadphase(world); // fast with hundreds of static tiles
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
    // Zero friction on balls: they never physically roll (fixedRotation), and the
    // ball controller does all the braking itself. Any friction here pins them in place.
    cm(this.mat.ball, this.mat.ground, 0, 0.2);
    cm(this.mat.ball, this.mat.ball, 0, 0.85);
    cm(this.mat.ball, this.mat.bouncy, 0, 1.2);
    cm(this.mat.ball, this.mat.ice, 0, 0.1);

    this.fixedDt = 1 / 60;
    this.time = 0;       // game time (slows down in slow-mo)
    this.realTime = 0;   // wall-clock time
    this.timeScale = 1;
    this._ts = null;     // eased time-scale change in progress
    this.alpha = 0;      // 0..1 between the last two physics steps (for interpolation)
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

  /** Level themes call this: sky gradient + fog. */
  setSky({ top, mid, bottom, fog, fogNear = 70, fogFar = 220 }) {
    if (top) this.skyUniforms.top.value.set(top);
    if (mid) this.skyUniforms.mid.value.set(mid);
    if (bottom) this.skyUniforms.bottom.value.set(bottom);
    this.scene.fog.color.set(fog || mid || '#c9b8f0');
    this.scene.fog.near = fogNear; this.scene.fog.far = fogFar;
  }

  /** Smoothly move the camera. Pass instant:true to snap. smooth = seconds for the glide. */
  setCamera({ pos, look, fov, instant, smooth }) {
    if (pos) this.camTargetPos.set(...pos);
    if (look) this.camTargetLook.set(...look);
    if (fov) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    if (smooth) this.camSmooth = smooth;
    if (instant) { this.camPos.copy(this.camTargetPos); this.camLook.copy(this.camTargetLook); this._camVel.set(0, 0, 0); this._lookVel.set(0, 0, 0); }
  }

  /** Start the camera from a swooping wide shot so it glides into the level's view. */
  swoopIn() {
    const look = this.camTargetLook, off = _v.copy(this.camTargetPos).sub(look);
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.9).multiplyScalar(1.6);
    off.y += 6;
    this.camPos.copy(look).add(off);
    this.camLook.copy(look);
    this._camVel.set(0, 0, 0); this._lookVel.set(0, 0, 0);
  }

  /**
   * Auto-frame a moving set of points. getPoints() returns Vector3-likes each frame.
   * opts: { min, max, pad, dir:[x,y,z] (camera direction from target), smooth (seconds) }
   * Pass null to go back to the fixed camera from setCamera().
   */
  follow(getPoints, opts = {}) {
    if (!getPoints) { this._follow = null; return; }
    const d = opts.dir || [0, 0.78, 0.62];
    const l = Math.hypot(...d);
    this._follow = {
      getPoints, min: opts.min ?? 10, max: opts.max ?? 34, pad: opts.pad ?? 2,
      dir: new THREE.Vector3(d[0] / l, d[1] / l, d[2] / l), smooth: opts.smooth ?? 0.6,
    };
  }

  /** Save / restore the whole camera setup (used by the slow-mo director). */
  saveCamera() {
    return { follow: this._follow, pos: this.camTargetPos.clone(), look: this.camTargetLook.clone(), smooth: this.camSmooth };
  }
  restoreCamera(s) {
    if (!s) return;
    this._follow = s.follow; this.camTargetPos.copy(s.pos); this.camTargetLook.copy(s.look); this.camSmooth = s.smooth;
  }

  _applyFollow() {
    const f = this._follow;
    const pts = f.getPoints().filter(Boolean);
    if (!pts.length) return;
    const c = new THREE.Vector3();
    for (const p of pts) c.add(_v.set(p.x, p.y, p.z));
    c.divideScalar(pts.length);
    let r = 0;
    for (const p of pts) r = Math.max(r, _v.set(p.x, p.y, p.z).distanceTo(c));
    // Fit radius r in a 45deg vertical fov, with a bit extra for wide screens.
    const aspect = Math.min(1, this.camera.aspect);
    const dist = Math.max(f.min, Math.min(f.max, (r + f.pad) * 2.6 / aspect));
    this.camTargetLook.copy(c);
    this.camTargetPos.copy(c).addScaledVector(f.dir, dist);
  }

  addShake(amount) { this.shake = Math.min(0.6, this.shake + amount); }

  /** Ease the game speed to `scale` over `seconds` (real time). 1 = normal, 0.25 = slow-mo. */
  setTimeScale(scale, seconds = 0.4) {
    if (seconds <= 0) { this.timeScale = scale; this._ts = null; return; }
    this._ts = { from: this.timeScale, to: scale, t: 0, dur: seconds };
  }

  /** Physics position interpolated for rendering (smooth at any frame rate or time scale). */
  lerpPos(body, out = new THREE.Vector3()) {
    const p = body.position, q = body._prev;
    if (!q) return out.set(p.x, p.y, p.z);
    const a = this.alpha;
    return out.set(q.x + (p.x - q.x) * a, q.y + (p.y - q.y) * a, q.z + (p.z - q.z) * a);
  }

  /** Interpolated rotation, as a THREE.Quaternion. */
  lerpQuat(body, out = new THREE.Quaternion()) {
    const q = body.quaternion, p = body._prevQ;
    out.set(q.x, q.y, q.z, q.w);
    if (p) out.slerpQuaternions(_qa.set(p.x, p.y, p.z, p.w), _qb.set(q.x, q.y, q.z, q.w), this.alpha);
    return out;
  }

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
          if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
          const m = o.material;
          if (m) (Array.isArray(m) ? m : [m]).forEach((mm) => { if (mm.userData?.shared) return; if (mm.map && !mm.map.userData?.shared) mm.map.dispose(); mm.dispose?.(); });
        });
      },
    };
  }

  /** onFixed(dt) runs before every physics step; onFrame(dt, realDt) once per rendered frame. */
  start(onFixed, onFrame) {
    const tick = (now) => {
      const realDt = Math.min(0.1, (now - this._last) / 1000);
      this._last = now;
      this.realTime += realDt;
      if (this._ts) {
        const s = this._ts;
        s.t += realDt;
        const k = Math.min(1, s.t / s.dur), e = k * k * (3 - 2 * k); // smoothstep
        this.timeScale = s.from + (s.to - s.from) * e;
        if (k >= 1) this._ts = null;
      }
      this._acc += realDt * this.timeScale;
      let steps = 0;
      while (this._acc >= this.fixedDt && steps < 5) {
        // Remember where moving bodies were, so rendering can interpolate between steps.
        for (const b of this.world.bodies) {
          if (b.type === CANNON.Body.STATIC) continue;
          (b._prev ||= new CANNON.Vec3()).copy(b.position);
          (b._prevQ ||= new CANNON.Quaternion()).copy(b.quaternion);
        }
        onFixed(this.fixedDt);
        this.world.step(this.fixedDt);
        this.time += this.fixedDt;
        this._acc -= this.fixedDt;
        steps++;
      }
      if (steps === 5) this._acc = 0;
      this.alpha = this._acc / this.fixedDt;
      onFrame(realDt * this.timeScale, realDt);
      this._updateCamera(realDt);
      try { this.beforeRender?.(realDt); } catch (e) { console.error('[beforeRender]', e); }
      this.renderer.shadowMap.needsUpdate = true;
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  _updateCamera(dt) {
    if (this._follow) this._applyFollow();
    const smooth = this._follow ? this._follow.smooth : this.camSmooth;
    smoothDamp(this.camPos, this.camTargetPos, this._camVel, smooth, dt);
    smoothDamp(this.camLook, this.camTargetLook, this._lookVel, smooth * 0.8, dt);
    const cam = this.camera;
    cam.position.copy(this.camPos);
    // A slow, gentle drift so the camera never feels frozen.
    const t = this.realTime;
    cam.position.x += Math.sin(t * 0.23) * 0.25;
    cam.position.y += Math.sin(t * 0.31) * 0.15;
    if (this.shake > 0.001) {
      const s = this.shake;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      this.shake *= Math.pow(0.001, dt);
    }
    cam.lookAt(this.camLook);
    this.sky.position.copy(cam.position);
    // Keep the sun's shadow box centered on what we're looking at.
    this.sun.target.position.copy(this.camLook);
    this.sun.position.copy(this.camLook).add(this.sunOffset);
  }
}

/** Critically damped spring toward target (Unity-style SmoothDamp), per component. */
function smoothDamp(cur, target, vel, smoothTime, dt) {
  const omega = 2 / Math.max(0.0001, smoothTime);
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  for (const k of ['x', 'y', 'z']) {
    const change = cur[k] - target[k];
    const temp = (vel[k] + omega * change) * dt;
    vel[k] = (vel[k] - omega * temp) * exp;
    cur[k] = target[k] + (change + temp) * exp;
  }
}
