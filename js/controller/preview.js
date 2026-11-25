// Phone character preview: your ball on a little turntable. Drag to spin it.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Avatar } from '../cosmetics/avatar.js';

export function createPreview(canvas, look) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7acc, 0.8));
  const key = new THREE.DirectionalLight(0xffffff, 1.8);
  key.position.set(2, 4, 3);
  scene.add(key);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 0.5, 3.35);
  camera.lookAt(0, 0.27, 0);

  // Soft shadow blob under the ball.
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(0,0,0,0.45)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = -0.52;
  scene.add(blob);

  const avatar = new Avatar(look, { anisotropy: renderer.capabilities.getMaxAnisotropy() });
  const turntable = new THREE.Group();
  turntable.add(avatar.body, avatar.face);
  scene.add(turntable);

  // Drag to spin; otherwise it sways gently to show off the outfit.
  let yaw = 0, yawVel = 0, dragging = false, lastX = 0, idle = 0, squash = 0, squashVel = 0;
  canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX; lastX = e.clientX;
    yawVel = dx * 0.012; yaw += yawVel; idle = 0;
  });
  const up = () => { dragging = false; };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  let last = performance.now(), running = true;
  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!dragging) {
      idle += dt;
      yawVel *= Math.pow(0.05, dt);
      yaw += yawVel;
      // Drift back toward facing front with a gentle sway.
      if (idle > 1.2) {
        const target = Math.sin(idle * 0.6) * 0.5;
        let d = target - yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        yaw += d * Math.min(1, dt * 2);
      }
    }
    squashVel += (-squash * 180 - squashVel * 12) * dt;
    squash += squashVel * dt;
    const s = Math.max(-0.35, Math.min(0.35, squash));
    turntable.rotation.y = yaw;
    turntable.position.y = Math.abs(Math.sin(now / 420)) * 0.05;
    avatar.body.scale.set(0.5 * (1 + s * 0.5), 0.5 * (1 - s), 0.5 * (1 + s * 0.5));
    avatar.face.scale.set(1 + s * 0.5, 1 - s, 1 + s * 0.5);
    avatar.body.rotation.y = 0;
    avatar.update(dt, 0);
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  return {
    /** Update the look; the ball does a little happy bounce. */
    set(next) { avatar.set(next); squashVel += 5; idle = 0.9; },
    pause() { running = false; },
    resume() { if (!running) { running = true; last = performance.now(); requestAnimationFrame(loop); } },
  };
}
