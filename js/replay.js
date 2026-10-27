// replay.js — records every car continuously and plays incidents back like a TV broadcast:
// a trackside camera with a long lens, slow motion as it goes wrong, then a low orbit of the aftermath.
(function () {
  'use strict';
  const NR = window.NR;
  const RATE = 30;  // frames recorded per second of race time
  const KEEP = 26;  // seconds of history kept
  const F = 22;     // floats per car per frame
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, k) => a + (b - a) * k;

  NR.createReplay = function (race, fx, track, camera) {
    const cars = race.cars, N = cars.length, W = track.HALF_W;
    const frames = [], pending = [], clips = [];
    let nextT = 0, play = null, clipN = 0;
    const api = { clips, onClip: null, onState: null };
    const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
    const v = new THREE.Vector3(), focus = new THREE.Vector3(), tf = track.newFrame();

    // ---------- recording ----------
    function record() {
      const t = race.time;
      if (t < nextT) return;
      nextT = t + 1 / RATE;
      const d = new Float32Array(N * F);
      cars.forEach((c, i) => {
        const o = i * F;
        d[o] = c.world.x; d[o + 1] = c.world.y; d[o + 2] = c.world.z;
        d[o + 3] = c.quat.x; d[o + 4] = c.quat.y; d[o + 5] = c.quat.z; d[o + 6] = c.quat.w;
        d[o + 7] = c.v; d[o + 8] = c.rpm; d[o + 9] = c.gear; d[o + 10] = c.accel; d[o + 11] = c.throttle;
        d[o + 12] = c.slip; d[o + 13] = c.steer; d[o + 14] = c.latAcc; d[o + 15] = c.brake ? 1 : 0;
        d[o + 16] = c.vel.x; d[o + 17] = c.vel.z; d[o + 18] = c.y - c.roadY; d[o + 19] = c.dmgBits;
        d[o + 20] = (c.offroad ? 1 : 0) | (c.out ? 2 : 0) | (c.state === 'race' ? 4 : 0) | (c.hidden ? 8 : 0);
        d[o + 21] = c.vel.y;
      });
      frames.push({ t, d });
      while (frames.length && frames[0].t < t - KEEP) frames.shift();
      // a clip is cut once everyone involved has come to rest (or after a while regardless)
      for (let k = pending.length - 1; k >= 0; k--) {
        const p = pending[k];
        if (p.restT == null && p.cars.every((c) => c.state !== 'crash')) p.restT = t;
        if ((p.restT != null && t > p.restT + 2) || t > p.t + 11) { pending.splice(k, 1); cut(p); }
      }
    }
    function incident(ev) {
      const open = pending.find((p) => ev.t - p.t < 6);
      if (open) { if (!open.cars.includes(ev.car)) open.cars.push(ev.car); return; }
      pending.push({ t: ev.t, car: ev.car, cars: [ev.car], kind: ev.kind, section: ev.section, s: ev.s, restT: null, lap: ev.car.lap });
    }
    function cut(p) {
      const start = Math.max(frames[0].t, p.t - 4.5);
      const fr = frames.filter((f) => f.t >= start);
      if (fr.length < 10) return;
      const clip = {
        id: ++clipN, car: p.car, cars: p.cars, kind: p.kind, section: p.section, s: p.s, lap: p.lap, t0: p.t,
        start, end: fr[fr.length - 1].t, frames: fr, events: fx.eventsBetween(start - 0.05, fr[fr.length - 1].t),
        side: Math.sign(p.car.lat) || 1, out: p.cars.some((c) => c.out),
      };
      clips.push(clip);
      if (clips.length > 12) clips.shift();
      if (api.onClip) api.onClip(clip);
    }

    // ---------- playback ----------
    const KEYS = ['v', 'rpm', 'gear', 'accel', 'throttle', 'slip', 'steer', 'latAcc', 'brake', 'dmgBits', 'offroad', 'out', 'state', 'hidden', 'air', 'vy', 'y', 'roadY', 'squash', 'spinV'];
    function start(clip) {
      if (play) stop();
      play = {
        clip, t: clip.start, i: 0, rate: 1, shot: -1, ang: 0, fov: 30,
        saved: cars.map((c) => ({ world: c.world.clone(), quat: c.quat.clone(), vel: c.vel.clone(), fwd: c.fwd.clone(), up: c.up.clone(), f: KEYS.map((k) => c[k]) })),
        fxSaved: fx.save(), cam: new THREE.Vector3(), look: new THREE.Vector3(),
      };
      fx.clear();
      // the trackside camera: on the outside of where the car ends up, a little past the incident
      track.frame(clip.s + 30, clip.side * (W + 10), tf);
      play.tvCam = tf.pos.clone();
      play.tvCam.y = Math.max(tf.pos.y, NR.groundY(tf.pos.x, tf.pos.z)) + 3.4;
      apply(clip.start);
      if (api.onState) api.onState(true, clip);
    }
    function stop() {
      if (!play) return;
      cars.forEach((c, i) => {
        const s = play.saved[i];
        c.world.copy(s.world); c.quat.copy(s.quat); c.vel.copy(s.vel); c.fwd.copy(s.fwd); c.up.copy(s.up);
        KEYS.forEach((k, j) => { c[k] = s.f[j]; });
      });
      fx.load(play.fxSaved);
      play = null;
      race.render(0);
      if (api.onState) api.onState(false);
    }
    function apply(t) {
      const fr = play.clip.frames;
      while (play.i < fr.length - 2 && fr[play.i + 1].t <= t) play.i++;
      const A = fr[play.i], B = fr[Math.min(play.i + 1, fr.length - 1)];
      const k = B.t > A.t ? clamp((t - A.t) / (B.t - A.t), 0, 1) : 0;
      const a = A.d, b = B.d, n = k < 0.5 ? a : b;
      cars.forEach((c, i) => {
        const o = i * F;
        c.world.set(lerp(a[o], b[o], k), lerp(a[o + 1], b[o + 1], k), lerp(a[o + 2], b[o + 2], k));
        qa.set(a[o + 3], a[o + 4], a[o + 5], a[o + 6]); qb.set(b[o + 3], b[o + 4], b[o + 5], b[o + 6]);
        c.quat.copy(qa).slerp(qb, k);
        c.v = lerp(a[o + 7], b[o + 7], k); c.rpm = lerp(a[o + 8], b[o + 8], k); c.gear = n[o + 9];
        c.accel = lerp(a[o + 10], b[o + 10], k); c.throttle = lerp(a[o + 11], b[o + 11], k); c.slip = lerp(a[o + 12], b[o + 12], k);
        c.steer = lerp(a[o + 13], b[o + 13], k); c.latAcc = lerp(a[o + 14], b[o + 14], k); c.brake = n[o + 15] > 0.5;
        c.vel.set(lerp(a[o + 16], b[o + 16], k), lerp(a[o + 21], b[o + 21], k), lerp(a[o + 17], b[o + 17], k));
        c.y = c.world.y; c.roadY = c.world.y - lerp(a[o + 18], b[o + 18], k);
        c.dmgBits = n[o + 19];
        const fl = n[o + 20];
        c.offroad = !!(fl & 1); c.out = !!(fl & 2); c.state = fl & 4 ? 'race' : 'replay'; c.hidden = !!(fl & 8);
        c.air = false; c.squash = 0; c.spinV = null;
        c.fwd.set(0, 0, 1).applyQuaternion(c.quat); c.up.set(0, 1, 0).applyQuaternion(c.quat);
      });
    }

    // advances the clip by real seconds; returns the playback rate (slow motion around the incident)
    function update(real, shake) {
      const clip = play.clip;
      const rel = play.t - clip.t0;
      const want = rel > -0.9 && rel < 2.6 ? 0.35 : 1;
      play.rate += (want - play.rate) * Math.min(1, real * 6);
      const prev = play.t;
      play.t = Math.min(clip.end, play.t + real * play.rate);
      for (const ev of clip.events) if (ev.t > prev && ev.t <= play.t) fx.respawn(ev);
      apply(play.t);
      race.render(real * play.rate);

      // camera: trackside long lens first, then a low orbit round the car once it has come to grief
      const c = clip.car;
      focus.copy(c.world); focus.y += 0.7;
      const shot = rel < 2.4 ? 0 : 1;
      if (shot !== play.shot) {
        play.shot = shot;
        play.look.copy(focus);
        play.ang = Math.atan2(play.tvCam.x - c.world.x, play.tvCam.z - c.world.z);
      }
      if (shot === 0) {
        camera.position.copy(play.tvCam);
        camera.position.y += Math.sin(play.t * 1.3) * 0.02 * shake;
        play.look.lerp(focus, 1 - Math.exp(-real * 10));
        camera.lookAt(play.look);
        const d = camera.position.distanceTo(play.look);
        const fov = clamp(THREE.MathUtils.radToDeg(2 * Math.atan(5.5 / d)), 8, 55);
        play.fov = play.fov ? play.fov + (fov - play.fov) * Math.min(1, real * 4) : fov;
        camera.fov = play.fov;
      } else {
        play.ang += real * 0.22;
        v.set(c.world.x + Math.sin(play.ang) * 11, 0, c.world.z + Math.cos(play.ang) * 11);
        v.y = Math.max(c.world.y, NR.groundY(v.x, v.z)) + 2.6;
        camera.position.copy(v);
        play.look.lerp(focus, 1 - Math.exp(-real * 6));
        camera.lookAt(play.look);
        camera.fov = 48;
      }
      camera.updateProjectionMatrix();
      if (play.t >= clip.end) stop();
      return play ? play.rate : 1;
    }

    Object.assign(api, {
      record, incident, start, stop, update, focus,
      reset() { if (play) stop(); frames.length = 0; pending.length = 0; clips.length = 0; nextT = 0; },
    });
    // live getters (Object.assign would only copy their current values)
    Object.defineProperties(api, {
      active: { get: () => !!play },
      clip: { get: () => play && play.clip },
      progress: { get: () => (play ? (play.t - play.clip.start) / Math.max(0.01, play.clip.end - play.clip.start) : 0) },
    });
    return api;
  };
})();
