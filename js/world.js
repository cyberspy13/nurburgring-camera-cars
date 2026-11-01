// world.js — textures, sky, light, terrain, road surface, kerbs and Armco.
(function () {
  'use strict';
  const NR = (window.NR = window.NR || {});

  // ---------- helpers ----------
  const col = (hex) => new THREE.Color(hex).convertSRGBToLinear();
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function hash(x, z) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  function vnoise(x, z) {
    const ix = Math.floor(x), iz = Math.floor(z);
    let fx = x - ix, fz = z - iz;
    fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
    const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  }
  function fbm(x, z, oct) {
    let s = 0, amp = 0.5, f = 1;
    for (let o = 0; o < (oct || 4); o++) { s += amp * vnoise(x * f, z * f); f *= 2.03; amp *= 0.5; }
    return s;
  }
  let seed = 1337;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };

  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 8;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    return t;
  }
  function speckle(g, w, h, n, colors, size) {
    for (let i = 0; i < n; i++) {
      g.fillStyle = colors[(rand() * colors.length) | 0];
      const s = (size || 1.5) * (0.5 + rand());
      g.fillRect(rand() * w, rand() * h, s, s);
    }
  }

  // Merge geometries (each with an optional Matrix4 and vertex tint) into one non-indexed geometry.
  function merge(parts) {
    const pos = [], nor = [], colr = [];
    const nm = new THREE.Matrix3(), v = new THREE.Vector3();
    parts.forEach(({ geo, m, tint }) => {
      const g = geo.index ? geo.toNonIndexed() : geo;
      const P = g.attributes.position, N = g.attributes.normal;
      if (m) nm.getNormalMatrix(m);
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i); if (m) v.applyMatrix4(m); pos.push(v.x, v.y, v.z);
        v.fromBufferAttribute(N, i); if (m) v.applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
        const t = typeof tint === 'function' ? tint(P.getY(i)) : tint == null ? 1 : tint;
        colr.push(t, t, t);
      }
    });
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    return out;
  }

  const TEX = {};
  function makeTextures() {
    TEX.asphalt = canvasTex(512, 1024, (g, w, h) => {
      g.fillStyle = '#45474a'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 10; i++) { // patch repairs
        g.fillStyle = rand() < 0.5 ? 'rgba(30,31,33,0.14)' : 'rgba(95,96,98,0.08)';
        g.fillRect(rand() * w, rand() * h, 60 + rand() * 200, 80 + rand() * 300);
      }
      for (let i = 0; i < 400; i++) { // fine cracks / aggregate variation
        g.strokeStyle = 'rgba(25,26,28,0.12)'; g.lineWidth = 1;
        const x = rand() * w, y = rand() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rand() - 0.5) * 30, y + (rand() - 0.5) * 30); g.stroke();
      }
      speckle(g, w, h, 60000, ['#3a3c3f', '#55575a', '#2f3133', '#606264'], 1.6);
      const wear = g.createLinearGradient(0, 0, w, 0); // rubbered-in lines
      wear.addColorStop(0.0, 'rgba(0,0,0,0)'); wear.addColorStop(0.3, 'rgba(20,20,22,0.25)');
      wear.addColorStop(0.5, 'rgba(0,0,0,0.05)'); wear.addColorStop(0.7, 'rgba(20,20,22,0.25)');
      wear.addColorStop(1.0, 'rgba(0,0,0,0)');
      g.fillStyle = wear; g.fillRect(0, 0, w, h);
      g.fillStyle = '#e9e9e4'; // edge lines
      g.fillRect(w * 0.035, 0, w * 0.022, h); g.fillRect(w * 0.943, 0, w * 0.022, h);
      speckle(g, w * 0.03, h, 1500, ['#45474a'], 2); // worn line edges
    }, true);
    TEX.grass = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#67733f'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 90000, ['#58663a', '#727d47', '#5f6d3b', '#7d8550', '#4d5a32', '#857f55'], 2.4);
      for (let i = 0; i < 2500; i++) { // blades
        g.strokeStyle = rand() < 0.5 ? 'rgba(40,52,25,0.35)' : 'rgba(150,160,100,0.25)'; g.lineWidth = 1;
        const x = rand() * w, y = rand() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rand() - 0.5) * 3, y - 4 - rand() * 5); g.stroke();
      }
    }, true);
    TEX.kerb = canvasTex(64, 256, (g, w, h) => {
      for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#f2f2ee' : '#c8202a'; g.fillRect(0, i * h / 4, w, h / 4); }
      speckle(g, w, h, 900, ['rgba(40,40,40,0.35)'], 2);
    }, true);
    TEX.armco = canvasTex(32, 128, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      ['#7d848b', '#dfe3e6', '#8b9298', '#e6e9eb', '#80878e'].forEach((c, i, a) => gr.addColorStop(i / (a.length - 1), c));
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }, true);
    TEX.fence = canvasTex(64, 64, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.strokeStyle = 'rgba(70,76,80,0.95)'; g.lineWidth = 2.2;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke();
    }, true);
    TEX.fence.encoding = THREE.LinearEncoding;
    TEX.stone = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#8c8577'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 22) for (let x = (y / 22) % 2 ? -18 : 0; x < w; x += 38) {
        g.fillStyle = `hsl(38, ${8 + rand() * 10}%, ${42 + rand() * 18}%)`;
        g.fillRect(x + 1, y + 1, 36, 20);
      }
      speckle(g, w, h, 6000, ['rgba(0,0,0,0.15)', 'rgba(255,255,255,0.08)'], 2);
    }, true);
    TEX.blob = canvasTex(128, 128, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    TEX.cloud = canvasTex(256, 128, (g, w, h) => {
      for (let i = 0; i < 26; i++) {
        const x = w * (0.2 + rand() * 0.6), y = h * (0.45 + rand() * 0.25), r = 18 + rand() * 34;
        const gr = g.createRadialGradient(x, y, 1, x, y, r);
        gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      }
    });
  }

  // ---------- sky, fog, lights ----------
  const SKY = { top: '#4f86c9', horizon: '#c9dbe8', ground: '#7d8a73' };
  const SUN_DIR = new THREE.Vector3(-0.55, 0.62, 0.56).normalize();

  function skyMaterial(linear) {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(SKY.top) }, horizon: { value: new THREE.Color(SKY.horizon) },
        ground: { value: new THREE.Color(SKY.ground) }, sunDir: { value: SUN_DIR }, lin: { value: linear ? 1 : 0 },
        // weather.js turns these: the warm halo, the disc (sun or moon) and the stars
        halo: { value: 1 }, disc: { value: 1 }, discCol: { value: new THREE.Color(1, 0.97, 0.9) }, stars: { value: 0 },
      },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top, horizon, ground, sunDir, discCol; uniform float lin, halo, disc, stars; varying vec3 vDir;
        float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        void main(){ vec3 d = normalize(vDir); float h = d.y;
          vec3 c = mix(horizon, top, pow(max(h, 0.0), 0.5));
          c = mix(c, ground, smoothstep(0.0, -0.06, h));
          float s = max(dot(d, sunDir), 0.0);
          c += halo * vec3(1.0, 0.86, 0.62) * pow(s, 10.0) * 0.22 + disc * discCol * pow(s, 1200.0) * 3.0;
          if (stars > 0.0 && h > 0.02) {
            vec3 q = floor(d * 420.0);
            c += vec3(0.9, 0.94, 1.0) * step(0.9972, hash(q)) * stars * smoothstep(0.02, 0.3, h) * (0.35 + 0.65 * hash(q + 3.1));
          }
          if (lin > 0.5) c = pow(c, vec3(2.2));
          gl_FragColor = vec4(c, 1.0); }`,
    });
  }

  // Some GPUs / software renderers return black or NaN from PMREM; render a probe sphere and check.
  function envLooksValid(renderer, env) {
    try {
      const rt = new THREE.WebGLRenderTarget(8, 8);
      const s = new THREE.Scene();
      s.environment = env;
      s.add(new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 })));
      const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 10); cam.position.z = 3;
      renderer.setRenderTarget(rt); renderer.render(s, cam); renderer.setRenderTarget(null);
      const px = new Uint8Array(8 * 8 * 4);
      renderer.readRenderTargetPixels(rt, 0, 0, 8, 8, px);
      rt.dispose();
      const c = (3 * 8 + 3) * 4; // centre pixel
      return px[c] + px[c + 1] + px[c + 2] > 30;
    } catch (e) { return false; }
  }

  function buildSky(scene, renderer) {
    const sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 16), skyMaterial(false));
    sky.renderOrder = -1;
    scene.add(sky);
    scene.fog = new THREE.FogExp2(new THREE.Color(SKY.horizon), 0.00026);

    // Reflection maps from painted equirectangular skies (top half sky, bottom half fields):
    // sunny, overcast for rain and snow, and night
    const pmrem = new THREE.PMREMGenerator(renderer);
    const paintEnv = (top, hor, fields, sun, puffs) => {
      const t = canvasTex(512, 256, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, top); gr.addColorStop(0.47, hor);
        gr.addColorStop(0.5, fields[0]); gr.addColorStop(0.56, fields[1]); gr.addColorStop(1, fields[2]);
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        if (sun) {
          const sx = w * 0.62, sy = h * 0.22, sg = g.createRadialGradient(sx, sy, 1, sx, sy, 40);
          sg.addColorStop(0, sun); sg.addColorStop(1, 'rgba(255,250,235,0)');
          g.fillStyle = sg; g.fillRect(0, 0, w, h);
        }
        for (let i = 0; i < puffs; i++) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(rand() * w, h * (0.1 + rand() * 0.3), 20 + rand() * 40, 5 + rand() * 8, 0, 0, Math.PI * 2); g.fill(); }
      });
      t.mapping = THREE.EquirectangularReflectionMapping;
      return pmrem.fromEquirectangular(t).texture;
    };
    const env = paintEnv(SKY.top, SKY.horizon, ['#8d9a7c', '#4f6236', '#3c4a2b'], 'rgba(255,250,235,1)', 18);
    let envs = null;
    if (envLooksValid(renderer, env)) {
      envs = {
        day: env,
        grey: paintEnv('#6c757e', '#a9b1b8', ['#7d8574', '#4a553a', '#3a4430'], null, 0),
        night: paintEnv('#04070d', '#121b2a', ['#0d1117', '#080b0e', '#05070a'], 'rgba(170,190,255,0.6)', 0),
      };
      scene.environment = env;
    }
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight(col('#cfe2ff'), col('#4f5d36'), 0.55);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(col('#fff2df'), 2.1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -95; sc.right = 95; sc.top = 95; sc.bottom = -95; sc.near = 10; sc.far = 900;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
    scene.add(sun); scene.add(sun.target);

    const clouds = new THREE.Group();
    for (let i = 0; i < 34; i++) {
      const m = new THREE.SpriteMaterial({ map: TEX.cloud, transparent: true, depthWrite: false, fog: false, opacity: 0.75 + rand() * 0.25 });
      const sp = new THREE.Sprite(m);
      const a = rand() * Math.PI * 2, r = 600 + rand() * 2600;
      sp.position.set(Math.cos(a) * r - 130, 1500 + rand() * 500, Math.sin(a) * r);
      const s = 500 + rand() * 700; sp.scale.set(s, s * 0.45, 1);
      clouds.add(sp);
    }
    scene.add(clouds);
    return { sky, sun, clouds, hemi, envs };
  }

  // ---------- terrain ----------
  function buildTerrain(track, scene) {
    const SX = 3600, SZ = 3000, CX = -130, CZ = -70, NX = 300, NZ = 250;
    const geo = new THREE.PlaneGeometry(SX, SZ, NX, NZ);
    geo.rotateX(-Math.PI / 2);
    geo.translate(CX, 0, CZ);
    const pos = geo.attributes.position;
    const nV = pos.count;
    const heights = new Float32Array(nV);
    const colors = new Float32Array(nV * 3);
    const W = track.HALF_W;

    // coarse samples for a smooth elevation field that follows the circuit
    const cs = [];
    for (let j = 0; j < track.NS; j += 10) cs.push(track.P[j * 3], track.P[j * 3 + 1], track.P[j * 3 + 2]);
    const nC = cs.length / 3;
    const cGrass = [col('#6f7d4c'), col('#7f8a55'), col('#8f9460'), col('#5f6c40')];
    const cDirt = col('#8a7a5c');
    const tmpC = new THREE.Color();

    for (let i = 0; i < nV; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      let sw = 0, swy = 0;
      for (let c = 0; c < nC; c++) {
        const dx = x - cs[c * 3], dz = z - cs[c * 3 + 2];
        let w = 1 / (dx * dx + dz * dz + 900); w *= w;
        sw += w; swy += w * cs[c * 3 + 1];
      }
      const field = swy / sw;
      const nr = track.nearest(x, z);
      const dEdge = nr ? nr.d - W : 300;
      // the pit lane and pit building sit on ground levelled with the road
      let pitW = 0;
      if (nr && nr.lat > 0) {
        const PIT = track.PIT, dp = nr.j * track.ds - track.S_FINISH, d = dp - track.L * Math.round(dp / track.L);
        pitW = 34 * smooth(PIT.entry - 40, PIT.laneIn + 10, d) * (1 - smooth(PIT.laneOut - 10, PIT.exit + 40, d));
      }
      const dFlat = dEdge - pitW;
      const hills = (fbm(x * 0.0021 + 3, z * 0.0021 - 7, 4) - 0.35) * 70 + (fbm(x * 0.012, z * 0.012, 2) - 0.5) * 5;
      const rEdge = Math.max(Math.abs(x - CX) - 1250, Math.abs(z - CZ) - 1000, 0);
      const castle = 46 * Math.exp(-((x + 240) ** 2 + (z - 30) ** 2) / (2 * 135 * 135));
      let h = field + (hills + castle) * smooth(14, 220, dEdge) + rEdge * 0.22;
      if (nr && dFlat < 60) {
        const road = nr.surfY - 0.12;
        if (dEdge < 0) h = nr.surfY - 0.3;
        else h = road + (h - road) * smooth(9, 60, dFlat);
      }
      heights[i] = h;
      pos.setY(i, h);
      const n = fbm(x * 0.006, z * 0.006, 3);
      const k = Math.min(3, Math.floor(n * 4.2));
      tmpC.copy(cGrass[Math.max(0, k)]).lerp(cGrass[Math.min(3, k + 1)], (n * 4.2) % 1);
      if (nr && dEdge > -1 && dEdge < 2.6) tmpC.lerp(cDirt, 0.55);
      const lum = 0.92 + vnoise(x * 0.05, z * 0.05) * 0.16;
      colors[i * 3] = tmpC.r * lum; colors[i * 3 + 1] = tmpC.g * lum; colors[i * 3 + 2] = tmpC.b * lum;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const tex = TEX.grass; tex.repeat.set(SX / 9, SZ / 9);
    const mat = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.96, metalness: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    scene.add(mesh);

    const x0 = CX - SX / 2, z0 = CZ - SZ / 2, dx = SX / NX, dz = SZ / NZ;
    NR.groundY = function (x, z) {
      const fx = Math.min(NX - 0.001, Math.max(0, (x - x0) / dx)), fz = Math.min(NZ - 0.001, Math.max(0, (z - z0) / dz));
      const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
      const i00 = iz * (NX + 1) + ix;
      const a = heights[i00], b = heights[i00 + 1], c = heights[i00 + NX + 1], d = heights[i00 + NX + 2];
      return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
    };
    return mesh;
  }

  // ---------- road ribbon, kerbs, barriers ----------
  function ribbon(track, rows, makeRow) {
    // rows: array of sample indices; makeRow(j, out[]) pushes vertices [x,y,z,u,v] pairs
    const pos = [], uv = [], idx = [];
    let perRow = 0;
    rows.forEach((run) => {
      const start = pos.length / 3;
      run.forEach((j, r) => {
        const verts = makeRow(j, r);
        perRow = verts.length;
        verts.forEach((v) => { pos.push(v[0], v[1], v[2]); uv.push(v[3], v[4]); });
        if (r > 0) {
          const a = start + (r - 1) * perRow, b = start + r * perRow;
          for (let q = 0; q < perRow - 1; q++) idx.push(a + q, b + q, a + q + 1, a + q + 1, b + q, b + q + 1);
        }
      });
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  function buildRoad(track, scene) {
    const { P, S, NS, ds, HALF_W: W } = track;
    const all = []; for (let j = 0; j <= NS; j++) all.push(j % NS);
    const v3 = (j, lat, lift) => [P[j * 3] + S[j * 3] * lat, P[j * 3 + 1] + S[j * 3 + 1] * lat + lift, P[j * 3 + 2] + S[j * 3 + 2] * lat];

    const roadGeo = ribbon(track, [all], (j, r) => {
      const v = (r * ds) / 16;
      return [-W, -W / 2, 0, W / 2, W].map((lat, q) => [...v3(j, lat, 0.03), q / 4, v]);
    });
    TEX.asphalt.repeat.set(1, 1);
    const road = new THREE.Mesh(roadGeo, new THREE.MeshStandardMaterial({ map: TEX.asphalt, roughness: 0.88, metalness: 0 }));
    road.receiveShadow = true;
    scene.add(road);

    // kerbs on the inside of tighter corners
    const kerbRuns = [];
    for (let side = -1; side <= 1; side += 2) {
      let cur = null;
      for (let j = 0; j < NS; j++) {
        const on = Math.abs(track.kS[j]) > 1 / 150 && Math.sign(track.kS[j]) === side;
        if (on) { if (!cur) cur = { side, js: [] }; cur.js.push(j); }
        else if (cur) { if (cur.js.length > 6) kerbRuns.push(cur); cur = null; }
      }
      if (cur && cur.js.length > 6) kerbRuns.push(cur);
    }
    const kerbGeos = kerbRuns.map((run) => ribbon(track, [run.js], (j, r) => {
      const v = (r * ds) / 3;
      const a = run.side * (W - 0.7), b = run.side * (W + 0.9);
      return [[...v3(j, a, 0.045), 0, v], [...v3(j, (a + b) / 2, 0.1), 0.5, v], [...v3(j, b, 0.05), 1, v]];
    }));
    const kerbMat = new THREE.MeshStandardMaterial({ map: TEX.kerb, roughness: 0.6 });
    kerbGeos.forEach((g) => { const m = new THREE.Mesh(g, kerbMat); m.receiveShadow = true; scene.add(m); });

    // Armco: double steel rail both sides plus posts, open on the inside where the pit lane runs
    const PIT = track.PIT;
    const dOf = (j) => { const d = j * ds - track.S_FINISH; return d - track.L * Math.round(d / track.L); };
    const inPits = (j) => { const d = dOf(j); return d > PIT.entry - 6 && d < PIT.exit + 6; };
    const railMat = new THREE.MeshStandardMaterial({ map: TEX.armco, metalness: 0.75, roughness: 0.38, side: THREE.DoubleSide });
    const RL = W + 5.2;
    const postGeo = new THREE.BoxGeometry(0.14, 0.9, 0.14);
    const posts = new THREE.InstancedMesh(postGeo, new THREE.MeshStandardMaterial({ color: col('#6d7379'), metalness: 0.6, roughness: 0.5 }), Math.ceil(NS / 2) * 2 + 2);
    const m4 = new THREE.Matrix4();
    let pc = 0;
    const runsOutsidePits = [];
    all.forEach((j, i) => {
      if (inPits(j)) return;
      if (i === 0 || inPits(all[i - 1])) runsOutsidePits.push([]);
      runsOutsidePits[runsOutsidePits.length - 1].push(j);
    });
    for (let side = -1; side <= 1; side += 2) {
      const g = ribbon(track, side > 0 ? runsOutsidePits : [all], (j, r) => {
        const lat = side * RL;
        const base = P[j * 3 + 1] + S[j * 3 + 1] * side * W - 0.12;
        const x = P[j * 3] + S[j * 3] * lat, z = P[j * 3 + 2] + S[j * 3 + 2] * lat;
        return [[x, base + 0.3, z, (r * ds) / 4, 0], [x, base + 0.85, z, (r * ds) / 4, 1]];
      });
      const rail = new THREE.Mesh(g, railMat);
      rail.castShadow = true; rail.receiveShadow = true;
      scene.add(rail);
      for (let j = 0; j < NS; j += 2) {
        if (side > 0 && inPits(j)) continue;
        const lat = side * (RL + 0.12);
        const base = P[j * 3 + 1] + S[j * 3 + 1] * side * W - 0.12;
        m4.makeTranslation(P[j * 3] + S[j * 3] * lat, base + 0.45, P[j * 3 + 2] + S[j * 3 + 2] * lat);
        posts.setMatrixAt(pc++, m4);
      }
    }
    posts.count = pc;
    posts.castShadow = true;
    scene.add(posts);
    buildPitLane(track, scene, dOf);
    return road;
  }

  // ---------- the pit lane: entry and exit roads, the lane past the boxes, the pit wall and its lines ----------
  function buildPitLane(track, scene, dOf) {
    const { P, S, NS, ds, HALF_W: W, PIT } = track;
    const v3 = (j, lat, lift) => [P[j * 3] + S[j * 3] * lat, P[j * 3 + 1] + S[j * 3 + 1] * lat + lift, P[j * 3 + 2] + S[j * 3 + 2] * lat];
    const idxAt = (d) => (((Math.round((track.S_FINISH + d) / ds)) % NS) + NS) % NS;
    const rows = (d0, d1) => { const out = [], j0 = idxAt(d0), n = Math.round((d1 - d0) / ds); for (let k = 0; k <= n; k++) out.push((j0 + k) % NS); return out; };
    const lane = (d) => d >= PIT.laneIn && d <= PIT.laneOut;
    // the surface's edges: the entry and exit roads are a lane wide; past the boxes it widens to the garages
    const inner = (d) => (lane(d) ? PIT.wall + 0.6 : Math.max(W + 0.02, PIT.path(d) - PIT.half));
    const outer = (d) => {
      if (!lane(d)) return PIT.path(d) + PIT.half;
      const g = smooth(PIT.laneIn, PIT.laneIn + 30, d) * (1 - smooth(PIT.laneOut - 30, PIT.laneOut, d));
      return PIT.fast + PIT.half + (PIT.garage - PIT.fast - PIT.half) * g;
    };
    const surf = ribbon(track, [rows(PIT.entry, PIT.exit)], (j, r) => {
      const d = dOf(j), a = inner(d), b = outer(d), v = (r * ds) / 16;
      return [0, 1, 2, 3, 4].map((q) => [...v3(j, a + ((b - a) * q) / 4, 0.035), 0.1 + 0.2 * q, v]);
    });
    const lanes = new THREE.Mesh(surf, new THREE.MeshStandardMaterial({ map: TEX.asphalt, roughness: 0.9, metalness: 0 }));
    lanes.receiveShadow = true;
    scene.add(lanes);

    // the pit wall between the track and the lane: two faces and a top, capped at both ends
    const concrete = new THREE.MeshStandardMaterial({ color: col('#cfd2d4'), roughness: 0.85 });
    const H = 1.05, a = PIT.wall, b = PIT.wall + 0.6, wallRows = [rows(PIT.laneIn, PIT.laneOut)];
    [[a, a], [a, b], [b, b]].forEach(([l0, l1], face) => {
      const g = ribbon(track, wallRows, (j, r) => {
        const y0 = face === 1 ? H : -0.1, y1 = H;
        return face === 1 ? [[...v3(j, l0, y1), 0, 0], [...v3(j, l1, y1), 1, 0]] : [[...v3(j, l0, y0), 0, 0], [...v3(j, l1, y1), 1, 0]];
      });
      const m = new THREE.Mesh(g, concrete);
      m.material.side = THREE.DoubleSide; m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
    });
    const fr = track.newFrame(), basis = new THREE.Matrix4();
    const place = (m, d, lat, lift) => {
      track.frame(track.S_FINISH + d, lat, fr);
      m.position.copy(fr.pos); m.position.y += lift;
      m.quaternion.setFromRotationMatrix(basis.makeBasis(fr.side, fr.up, fr.fwd));
      scene.add(m);
      return m;
    };
    [PIT.laneIn, PIT.laneOut].forEach((d) => place(new THREE.Mesh(new THREE.BoxGeometry(0.6, H + 0.1, 0.06), concrete), d, (a + b) / 2, (H - 0.1) / 2));

    // painted lines: the edge of the fast lane, and the speed limit lines across the lane
    const paint = new THREE.MeshStandardMaterial({ color: col('#e9e9e4'), roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 });
    const edge = ribbon(track, [rows(PIT.laneIn + 30, PIT.laneOut - 30)], (j) => [[...v3(j, PIT.fast + PIT.half - 0.08, 0.04), 0, 0], [...v3(j, PIT.fast + PIT.half + 0.08, 0.04), 1, 0]]);
    scene.add(new THREE.Mesh(edge, paint));
    [PIT.laneIn, PIT.laneOut].forEach((d) => {
      const w = PIT.half * 2;
      const m = place(new THREE.Mesh(new THREE.PlaneGeometry(w, 0.4), paint), d, PIT.fast, 0.045);
      m.rotateX(-Math.PI / 2);
    });
  }

  NR.world = { merge, col, smooth, hash, vnoise, fbm, rand, canvasTex, TEX, SKY, SUN_DIR, makeTextures, buildSky, buildTerrain, buildRoad };
})();
