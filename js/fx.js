// fx.js — particles and debris: tyre smoke, dust, sparks, flying bodywork, fireworks and confetti.
// Every emission is logged with its race time and a seed, so crash replays re-create it exactly.
(function () {
  'use strict';
  const NR = window.NR;

  function mulberry(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const hexRGB = (hex) => { const n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };

  NR.createFx = function (scene) {
    const { canvasTex } = NR.world;
    const softTex = canvasTex(64, 64, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    const flakeTex = canvasTex(16, 16, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(3, 5, w - 6, h - 10); });

    // ---------- point-sprite pools ----------
    const FIELDS = 15; // x y z vx vy vz life ttl s0 s1 a0 r g b grav  (+ drag in its own array)
    function pool(max, tex, blending) {
      const pos = new Float32Array(max * 3), rgb = new Float32Array(max * 3), alpha = new Float32Array(max), size = new Float32Array(max);
      const geo = new THREE.BufferGeometry();
      const attr = (arr, n) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('position', attr(pos, 3)); geo.setAttribute('pcolor', attr(rgb, 3));
      geo.setAttribute('alpha', attr(alpha, 1)); geo.setAttribute('size', attr(size, 1));
      const mat = new THREE.ShaderMaterial({
        uniforms: { map: { value: tex }, scale: { value: 600 } },
        vertexShader: `
          attribute float size; attribute float alpha; attribute vec3 pcolor;
          uniform float scale; varying float vA; varying vec3 vC;
          void main() {
            vA = alpha; vC = pcolor;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = alpha > 0.0 ? min(480.0, size * scale / max(0.2, -mv.z)) : 0.0;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          uniform sampler2D map; varying float vA; varying vec3 vC;
          void main() {
            float a = texture2D(map, gl_PointCoord).a * vA;
            if (a < 0.004) discard;
            gl_FragColor = vec4(vC, a);
          }`,
        transparent: true, depthWrite: false, blending,
      });
      const points = new THREE.Points(geo, mat);
      points.frustumCulled = false; points.renderOrder = 5;
      scene.add(points);
      const st = { d: new Float32Array(max * FIELDS), drag: new Float32Array(max), head: 0, live: 0 };
      function add(x, y, z, vx, vy, vz, ttl, s0, s1, a0, c, grav, drag) {
        const i = st.head; st.head = (st.head + 1) % max;
        const o = i * FIELDS, d = st.d;
        d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = vx; d[o + 4] = vy; d[o + 5] = vz;
        d[o + 6] = 0; d[o + 7] = ttl; d[o + 8] = s0; d[o + 9] = s1; d[o + 10] = a0;
        d[o + 11] = c[0]; d[o + 12] = c[1]; d[o + 13] = c[2]; d[o + 14] = grav; st.drag[i] = drag;
      }
      let wasLive = true;
      function update(dt) {
        const d = st.d;
        let live = 0;
        for (let i = 0; i < max; i++) {
          const o = i * FIELDS;
          if (d[o + 7] <= 0) { alpha[i] = 0; continue; }
          live++;
          d[o + 6] += dt;
          const t = d[o + 6] / d[o + 7];
          if (t >= 1) { d[o + 7] = 0; alpha[i] = 0; continue; }
          const k = Math.exp(-st.drag[i] * dt);
          d[o + 3] *= k; d[o + 5] *= k; d[o + 4] = d[o + 4] * k - d[o + 14] * dt;
          d[o] += d[o + 3] * dt; d[o + 1] += d[o + 4] * dt; d[o + 2] += d[o + 5] * dt;
          pos[i * 3] = d[o]; pos[i * 3 + 1] = d[o + 1]; pos[i * 3 + 2] = d[o + 2];
          rgb[i * 3] = d[o + 11]; rgb[i * 3 + 1] = d[o + 12]; rgb[i * 3 + 2] = d[o + 13];
          size[i] = d[o + 8] + (d[o + 9] - d[o + 8]) * Math.sqrt(t);
          alpha[i] = d[o + 10] * Math.min(1, t * 12) * Math.pow(1 - t, 1.3);
        }
        if (!live && !wasLive) return; // nothing alive: skip re-uploading the buffers
        wasLive = live > 0;
        geo.attributes.position.needsUpdate = geo.attributes.pcolor.needsUpdate = true;
        geo.attributes.alpha.needsUpdate = geo.attributes.size.needsUpdate = true;
      }
      return {
        add, update, mat,
        save: () => ({ d: st.d.slice(), drag: st.drag.slice(), head: st.head }),
        load: (s) => { st.d.set(s.d); st.drag.set(s.drag); st.head = s.head; wasLive = true; },
        clear: () => { st.d.fill(0); st.head = 0; alpha.fill(0); wasLive = true; },
      };
    }
    const smoke = pool(2600, softTex, THREE.NormalBlending);
    const glow = pool(3200, softTex, THREE.AdditiveBlending);
    const flakes = pool(1400, flakeTex, THREE.NormalBlending);
    const pools = [smoke, glow, flakes];

    // ---------- flying bodywork ----------
    const MAXD = 160;
    const debris = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.35 }), MAXD);
    debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    debris.castShadow = true; debris.frustumCulled = false;
    scene.add(debris);
    const DF = 17; // x y z vx vy vz rx ry rz wx wy wz sx sy sz groundY alive(0 none, 1 flying, 2 resting)
    const dState = { d: new Float32Array(MAXD * DF), col: new Float32Array(MAXD * 3), head: 0 };
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), vp = new THREE.Vector3(), vs = new THREE.Vector3(), cTmp = new THREE.Color();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAXD; i++) { debris.setMatrixAt(i, zero); debris.setColorAt(i, cTmp.setRGB(1, 1, 1)); }
    function setDebris(i) {
      const o = i * DF, d = dState.d;
      if (!d[o + 16]) { debris.setMatrixAt(i, zero); return; }
      e.set(d[o + 6], d[o + 7], d[o + 8]);
      debris.setMatrixAt(i, m4.compose(vp.set(d[o], d[o + 1], d[o + 2]), q.setFromEuler(e), vs.set(d[o + 12], d[o + 13], d[o + 14])));
    }
    function addDebris(x, y, z, vx, vy, vz, sx, sy, sz, rgb, gy, R) {
      const i = dState.head; dState.head = (dState.head + 1) % MAXD;
      const o = i * DF, d = dState.d;
      d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = vx; d[o + 4] = vy; d[o + 5] = vz;
      d[o + 6] = R() * 6; d[o + 7] = R() * 6; d[o + 8] = R() * 6;
      d[o + 9] = (R() - 0.5) * 22; d[o + 10] = (R() - 0.5) * 22; d[o + 11] = (R() - 0.5) * 22;
      d[o + 12] = sx; d[o + 13] = sy; d[o + 14] = sz; d[o + 15] = gy; d[o + 16] = 1;
      dState.col.set(rgb, i * 3);
      debris.setColorAt(i, cTmp.setRGB(rgb[0], rgb[1], rgb[2]).convertSRGBToLinear());
      debris.instanceColor.needsUpdate = true;
    }
    function updateDebris(dt) {
      const d = dState.d;
      let any = false;
      for (let i = 0; i < MAXD; i++) {
        const o = i * DF;
        if (d[o + 16] !== 1) continue;
        any = true;
        d[o + 4] -= 9.81 * dt;
        d[o] += d[o + 3] * dt; d[o + 1] += d[o + 4] * dt; d[o + 2] += d[o + 5] * dt;
        d[o + 6] += d[o + 9] * dt; d[o + 7] += d[o + 10] * dt; d[o + 8] += d[o + 11] * dt;
        const floor = d[o + 15] + d[o + 13] * 0.5;
        if (d[o + 1] < floor) {
          d[o + 1] = floor;
          d[o + 4] = -d[o + 4] * 0.3; d[o + 3] *= 0.6; d[o + 5] *= 0.6;
          d[o + 9] *= 0.5; d[o + 10] *= 0.5; d[o + 11] *= 0.5;
          if (Math.abs(d[o + 4]) < 0.8 && Math.hypot(d[o + 3], d[o + 5]) < 0.6) {
            d[o + 16] = 2; d[o + 6] = Math.round(d[o + 6] / Math.PI) * Math.PI; d[o + 8] = Math.round(d[o + 8] / Math.PI) * Math.PI; // lie flat
          }
        }
        setDebris(i);
      }
      if (any) debris.instanceMatrix.needsUpdate = true;
    }

    // ---------- emitters ----------
    const SMOKE = [0.86, 0.86, 0.85], DARK = [0.16, 0.16, 0.17], DUST = [0.6, 0.53, 0.4], SPARK = [1, 0.62, 0.22], SPARK2 = [1, 0.85, 0.5];
    const api = { onCrash: null, onBurst: null };
    const log = [];
    const rockets = [];

    function spawn(type, p) {
      const R = mulberry(p.seed);
      const [x, y, z] = p.pos;
      const vel = p.vel || [0, 0, 0];
      if (type === 'smoke' || type === 'dust') {
        const dust = type === 'dust', k = p.size || 1;
        for (let n = 0; n < 2; n++) {
          smoke.add(x + (R() - 0.5) * 1.6, y + R() * 0.3, z + (R() - 0.5) * 1.6,
            vel[0] + (R() - 0.5) * 1.2, vel[1] + R() * 0.8, vel[2] + (R() - 0.5) * 1.2,
            (dust ? 1.8 : 2.4) + R() * 1.2, 0.9 * k, (dust ? 3.8 : 5.2) * k, p.dark ? 0.6 : dust ? 0.5 : 0.42,
            p.dark ? DARK : dust ? DUST : SMOKE, dust ? 0.4 : -0.35, 1.3);
        }
      } else if (type === 'spray') {
        // water (or powder snow) thrown up behind a car
        const k = p.size || 1, col = p.snow ? [0.95, 0.96, 0.98] : [0.8, 0.84, 0.88];
        for (let n = 0; n < 2; n++) {
          smoke.add(x + (R() - 0.5) * 2, y + R() * 0.4, z + (R() - 0.5) * 2,
            vel[0] + (R() - 0.5) * 2, vel[1] + R() * 1.2, vel[2] + (R() - 0.5) * 2,
            0.8 + R() * 0.6, 0.9 * k, 3.6 * k, p.snow ? 0.4 : 0.26, col, -0.1, 2.2);
        }
      } else if (type === 'crash') {
        const s = p.strength;
        glow.add(x, y, z, 0, 0, 0, 0.16, 1 + 2.5 * s, 2 + 4 * s, 1, SPARK2, 0, 0); // the flash of the hit
        for (let n = 0, N = 14 + Math.round(90 * s); n < N; n++) {
          const a = R() * Math.PI * 2, up = R(), sp = 4 + R() * 12 * (0.4 + s);
          glow.add(x, y, z, vel[0] * 0.4 + Math.cos(a) * sp * (1 - up * 0.5), up * sp * 0.8 + 1, vel[2] * 0.4 + Math.sin(a) * sp * (1 - up * 0.5),
            0.25 + R() * 0.6, 0.32, 0.14, 1, R() < 0.5 ? SPARK : SPARK2, 9.8, 0.6);
        }
        for (let n = 0, N = 3 + Math.round(10 * s); n < N; n++) {
          smoke.add(x + (R() - 0.5), y, z + (R() - 0.5), vel[0] * 0.2 + (R() - 0.5) * 3, 0.6 + R() * 1.5, vel[2] * 0.2 + (R() - 0.5) * 3,
            1.6 + R() * 1.4, 1.2, 4.5 + 3 * s, 0.4, SMOKE, -0.2, 1.4);
        }
        const cols = (p.colors || ['#222222']).map(hexRGB);
        for (let n = 0, N = Math.round(1 + 12 * s * s + R() * 3 * s); n < N; n++) {
          const a = R() * Math.PI * 2, sp = 2 + R() * 9 * s;
          addDebris(x, y + 0.2, z, vel[0] * 0.6 + Math.cos(a) * sp, 2 + R() * 7 * s, vel[2] * 0.6 + Math.sin(a) * sp,
            0.08 + R() * 0.45, 0.02 + R() * 0.05, 0.06 + R() * 0.35, cols[Math.floor(R() * cols.length)], y - 0.5, R);
        }
        if (api.onCrash) api.onCrash(new THREE.Vector3(x, y, z), s);
      } else if (type === 'firework') {
        rockets.push({ x, y, z, vy: 34 + R() * 8, t: 0, burst: 1.3 + R() * 0.5, col: hexRGB(p.color || '#ffd23f'), seed: p.seed });
      } else if (type === 'confetti') {
        const cs = ['#ffd23f', '#e5322d', '#ffffff', '#1f6fd1', '#22b35a', '#ff7a00'].map(hexRGB);
        for (let n = 0; n < (p.n || 120); n++) {
          flakes.add(x + (R() - 0.5) * (p.spread || 20), y + R() * 4, z + (R() - 0.5) * (p.spread || 20),
            (R() - 0.5) * 3, 1 + R() * 2, (R() - 0.5) * 3, 5 + R() * 4, 0.22, 0.22, 1, cs[Math.floor(R() * cs.length)], 1.1, 1.8);
        }
      }
    }
    function burst(r) {
      const R = mulberry(r.seed + 7);
      for (let n = 0; n < 150; n++) {
        const u = R() * 2 - 1, a = R() * Math.PI * 2, rr = Math.sqrt(1 - u * u), sp = 15 + R() * 4;
        glow.add(r.x, r.y, r.z, rr * Math.cos(a) * sp, u * sp, rr * Math.sin(a) * sp, 1.6 + R() * 0.8, 1.6, 0.7, 1, r.col, 4, 1.3);
      }
      for (let n = 0; n < 40; n++) {
        const u = R() * 2 - 1, a = R() * Math.PI * 2, rr = Math.sqrt(1 - u * u), sp = 8 + R() * 6;
        glow.add(r.x, r.y, r.z, rr * Math.cos(a) * sp, u * sp, rr * Math.sin(a) * sp, 2.2 + R(), 0.9, 0.4, 1, [1, 1, 0.9], 3, 1.6);
      }
      if (api.onBurst) api.onBurst(new THREE.Vector3(r.x, r.y, r.z));
    }
    function updateRockets(dt) {
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.t += dt; r.vy -= 9.81 * dt; r.y += r.vy * dt;
        glow.add(r.x, r.y, r.z, 0, -2, 0, 0.5, 0.5, 0.2, 0.8, SPARK2, 0, 0.5);
        if (r.t > r.burst) { burst(r); rockets.splice(i, 1); }
      }
    }

    let seedN = 1;
    function emit(type, p, t) {
      if (p.seed == null) p.seed = (seedN++ * 2654435761) >>> 0;
      log.push({ t, type, p });
      if (log.length > 6000) log.splice(0, 1000);
      spawn(type, p);
    }

    let scaleH = 600;
    function update(dt, camera, heightPx) {
      if (camera && heightPx) scaleH = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
      pools.forEach((pl) => { pl.mat.uniforms.scale.value = scaleH; });
      if (dt <= 0) return;
      updateRockets(dt);
      pools.forEach((pl) => pl.update(dt));
      updateDebris(dt);
    }

    return Object.assign(api, {
      emit, update,
      eventsBetween: (t0, t1) => log.filter((ev) => ev.t > t0 && ev.t <= t1),
      respawn: (ev) => spawn(ev.type, ev.p),
      save: () => ({ pools: pools.map((pl) => pl.save()), d: dState.d.slice(), col: dState.col.slice(), head: dState.head }),
      load(s) {
        pools.forEach((pl, i) => pl.load(s.pools[i]));
        dState.d.set(s.d); dState.col.set(s.col); dState.head = s.head;
        for (let i = 0; i < MAXD; i++) {
          debris.setColorAt(i, cTmp.setRGB(s.col[i * 3], s.col[i * 3 + 1], s.col[i * 3 + 2]).convertSRGBToLinear());
          setDebris(i);
        }
        debris.instanceColor.needsUpdate = true; debris.instanceMatrix.needsUpdate = true;
      },
      // clear() empties the scene for a replay; reset() also forgets the event log for a new race
      clear() {
        pools.forEach((pl) => pl.clear());
        dState.d.fill(0); dState.head = 0; rockets.length = 0;
        for (let i = 0; i < MAXD; i++) debris.setMatrixAt(i, zero);
        debris.instanceMatrix.needsUpdate = true;
      },
      reset() { this.clear(); log.length = 0; },
    });
  };
})();
