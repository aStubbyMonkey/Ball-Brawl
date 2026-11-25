// Living lava: a rolling, glowing shader sea with drifting crust, rising embers and popping bubbles.
import * as THREE from 'three';

const NOISE = /* glsl */`
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec2 mod289(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}
vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}
float snoise(vec2 v){
  const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
  vec2 i=floor(v+dot(v,C.yy)); vec2 x0=v-i+dot(i,C.xx);
  vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);
  vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1; i=mod289(i);
  vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));
  vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0); m=m*m; m=m*m;
  vec3 x=2.0*fract(p*C.www)-1.0; vec3 h=abs(x)-0.5; vec3 ox=floor(x+0.5); vec3 a0=x-ox;
  m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
  vec3 g; g.x=a0.x*x0.x+h.x*x0.y; g.yz=a0.yz*x12.xz+h.yz*x12.yw;
  return 130.0*dot(m,g);
}
float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*snoise(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return s; }
`;

const VERT = /* glsl */`
uniform float uTime;
varying vec2 vXZ; varying float vH;
#include <fog_pars_vertex>
${NOISE}
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec2 p = wp.xz;
  float h = sin(p.x*0.33 + uTime*1.2)*0.13 + sin(p.y*0.41 - uTime*0.9)*0.13
          + snoise(p*0.16 + vec2(uTime*0.12, -uTime*0.08))*0.3;
  wp.y += h;
  vXZ = p; vH = h;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */`
uniform float uTime;
varying vec2 vXZ; varying float vH;
#include <fog_pars_fragment>
${NOISE}
// Cartoon lava: a few flat color bands (no photo-real gradients), chunky dark crust
// islands with bright rims, and wobbly glowing crest lines.
void main(){
  vec2 p = vXZ * 0.06;
  vec2 flow = vec2(uTime*0.03, uTime*0.02);
  float warp = snoise(p*0.8 - flow) * 0.6;
  float n = fbm(p + flow + warp);
  float band = floor(clamp(n*1.6 + 1.6, 0.0, 3.99));       // 0..3
  vec3 c0 = vec3(0.62, 0.04, 0.02);   // deep red
  vec3 c1 = vec3(0.98, 0.20, 0.02);   // orange
  vec3 c2 = vec3(1.00, 0.45, 0.03);   // light orange
  vec3 c3 = vec3(1.00, 0.78, 0.18);   // yellow
  vec3 col = band < 1.0 ? c0 : band < 2.0 ? c1 : band < 3.0 ? c2 : c3;

  // Crust: rounded floating rock islands with a hot outline.
  float k = snoise(p*2.2 + vec2(4.0) + flow*1.4) + warp*0.3;
  float crust = smoothstep(0.42, 0.46, k);
  float rim = smoothstep(0.34, 0.38, k) - crust;
  col = mix(col, vec3(0.16, 0.04, 0.06), crust);
  col = mix(col, vec3(1.0, 0.85, 0.3), rim);

  // Glowy crest lines riding the waves.
  float crest = smoothstep(0.17, 0.2, vH) - smoothstep(0.24, 0.27, vH);
  col = mix(col, vec3(1.0, 0.92, 0.55), crest * (1.0 - crust) * 0.8);
  col *= 0.96 + 0.05 * sin(uTime * 2.0 + n * 6.0);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const SOFT_DOT = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.8)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.userData.shared = true;
  return t;
})();
export { SOFT_DOT };

const BUBBLE_GEO = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
BUBBLE_GEO.userData.shared = true;

/** Bubbling lava sea. Returns { update(dt), y }. `area` = radius where bubbles/embers appear. */
export function makeLava(ctx, y = -3, { area = 26 } = {}) {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: Math.random() * 100 } }]);
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, fog: true });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(320, 320, 220, 220), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  ctx.level.add(mesh);

  // Warm light from below so platforms glow orange underneath.
  const glow = new THREE.DirectionalLight(0xff6a1a, 0.9);
  glow.position.set(0, -10, 0);
  ctx.level.add(glow);

  // Embers: soft glowing dots drifting up out of the lava.
  const N = 260;
  const pos = new Float32Array(N * 3);
  const vel = new Float32Array(N * 2); // [rise speed, phase]
  const life = new Float32Array(N);
  const reset = (i, fresh) => {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * area;
    pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = y + (fresh ? Math.random() * 10 : 0); pos[i * 3 + 2] = Math.sin(a) * r;
    vel[i * 2] = 0.8 + Math.random() * 2.2; vel[i * 2 + 1] = Math.random() * 10;
    life[i] = 3 + Math.random() * 4;
  };
  for (let i = 0; i < N; i++) reset(i, true);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const embers = new THREE.Points(geo, new THREE.PointsMaterial({
    map: SOFT_DOT, color: 0xffa030, size: 0.32, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  }));
  embers.frustumCulled = false;
  ctx.level.add(embers);

  // Bubbles that swell up and pop.
  const bubbleMat = new THREE.MeshStandardMaterial({ color: 0xff7a00, emissive: 0xff5000, emissiveIntensity: 1.2, roughness: 0.4 });
  const bubbles = [];
  let bubbleT = 0, t = 0;

  return {
    y,
    mesh,
    update(dt) {
      t += dt;
      uniforms.uTime.value += dt;
      for (let i = 0; i < N; i++) {
        life[i] -= dt;
        const k = i * 3;
        pos[k + 1] += vel[i * 2] * dt;
        pos[k] += Math.sin(t * 1.5 + vel[i * 2 + 1]) * dt * 0.6;
        pos[k + 2] += Math.cos(t * 1.3 + vel[i * 2 + 1]) * dt * 0.6;
        if (life[i] <= 0 || pos[k + 1] > y + 14) reset(i, false);
      }
      geo.attributes.position.needsUpdate = true;

      bubbleT -= dt;
      if (bubbleT <= 0) {
        bubbleT = 0.12 + Math.random() * 0.2;
        const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * area;
        const m = new THREE.Mesh(BUBBLE_GEO, bubbleMat);
        m.position.set(Math.cos(a) * r, y + 0.05, Math.sin(a) * r);
        m.userData = { t: 0, size: 0.3 + Math.random() * 0.7, dur: 0.6 + Math.random() * 0.8 };
        m.scale.setScalar(0.01);
        ctx.level.add(m);
        bubbles.push(m);
      }
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i], u = b.userData;
        u.t += dt;
        const k = u.t / u.dur;
        b.scale.set(u.size * k, u.size * k * 0.8, u.size * k);
        if (k >= 1) {
          ctx.level.group.remove(b);
          bubbles.splice(i, 1);
          ctx.fx.burst(b.position, '#ffb000', { count: 5, speed: 1.4, up: 3.5, size: 0.1 + u.size * 0.08, life: 0.7 });
        }
      }
    },
  };
}
