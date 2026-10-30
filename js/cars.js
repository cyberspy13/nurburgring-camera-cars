// cars.js — the field of cars and the race simulation (the 3D models are built in models.js).
(function () {
  'use strict';
  const NR = (window.NR = window.NR || {});

  // Field of cars. Liveries are colour schemes only, no manufacturer logos.
  const ENTRIES = [
    { brand: 'McLaren', model: '720S GT3', num: 59, type: 'mid', base: '#ff7a00', accent: '#1b2533', accent2: '#3fb6ff', style: 'lower' },
    { brand: 'BMW', model: 'M4 GT3', num: 98, type: 'coupe', base: '#f4f5f6', accent: '#1c3f94', style: 'mstripes' },
    { brand: 'Mercedes-AMG', model: 'AMG GT3', num: 4, type: 'front', base: '#c3c8cd', accent: '#00a19b', accent2: '#16181b', style: 'line' },
    { brand: 'Audi', model: 'R8 LMS', num: 16, type: 'mid', base: '#7c8188', accent: '#c8102e', accent2: '#141414', style: 'front' },
    { brand: 'Aston Martin', model: 'Vantage GT3', num: 7, type: 'front', base: '#00513f', accent: '#c4d600', accent2: '#0b2a22', style: 'line' },
    { brand: 'Porsche', model: '911 GT3 R', num: 911, type: 'rear', base: '#f7f7f5', accent: '#c8102e', accent2: '#141414', style: 'stripe' },
    { brand: 'Ferrari', model: '296 GT3', num: 71, type: 'mid', base: '#c40d0d', accent: '#ffd200', accent2: '#141414', style: 'stripe' },
    { brand: 'Lamborghini', model: 'Huracán GT3', num: 63, type: 'mid', base: '#8fc31f', accent: '#141414', accent2: '#ffffff', style: 'lower' },
    { brand: 'BMW', model: 'M4 GT3', num: 99, type: 'coupe', base: '#0d2c5a', accent: '#ffffff', style: 'mstripes' },
    { brand: 'Mercedes-AMG', model: 'AMG GT3', num: 48, type: 'front', base: '#16181b', accent: '#e10600', accent2: '#5b6168', style: 'line' },
    { brand: 'McLaren', model: '720S GT3', num: 58, type: 'mid', base: '#3b4048', accent: '#ff7a00', accent2: '#ff7a00', style: 'stripe' },
    { brand: 'Aston Martin', model: 'Vantage GT3', num: 27, type: 'front', base: '#c9d1d6', accent: '#00513f', accent2: '#c4d600', style: 'front' },
    // the guest entry: a red double-decker flying a PR 4ML flag (also on its plates), a little off the GT3s' pace
    { brand: 'Bus', model: 'Double-decker', num: 13, type: 'bus', base: '#d7261e', accent: '#f2ead3', reg: 'PR 4ML', pace: 0.95 },
  ];

  // ---------------- race simulation ----------------
  const TOTAL_LAPS = 17;
  const RAIL = 5.2;     // the Armco stands this far beyond the road edge (world.buildRoad)
  const GRIP = 17.5;    // lateral grip the speed profile is planned with (track.js)
  const MAX_OUT = 5;    // after this many retirements incidents stay minor
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const heading = (v) => Math.atan2(v.x, v.z);

  // Race states per car: 'race' (driving, also on the cool-down lap once c.finished), 'crash' (free
  // sliding body after a mistake or contact), 'out' (retired, parked), 'ceremony' (podium celebration).
  function createRace(track, scene, fx) {
    const { rand } = NR.world;
    const L = track.L, W = track.HALF_W;
    const S0 = NR.S_FINISH;
    const wrapS = (s) => ((s % L) + L) % L;
    const wrapD = (d) => d - L * Math.round(d / L); // signed distance along the lap
    const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    const secOfS = (s) => track.secOf[Math.floor(wrapS(s) / track.ds) % track.NS];
    const cars = ENTRIES.map((e, i) => {
      const rig = NR.buildCarModel(e);
      scene.add(rig.root);
      return Object.assign({}, e, {
        idx: i, rig, color: e.base, fr: track.newFrame(),
        len: rig.len || 4.4, wid: rig.wid || 1.95, // contact length and width (a pair touches at the average)
        world: new THREE.Vector3(), fwd: new THREE.Vector3(), up: new THREE.Vector3(),
        quat: new THREE.Quaternion(), vel: new THREE.Vector3(),
      });
    });
    const firstPass = new Map(), pairT = new Map();
    const mtx = new THREE.Matrix4(), yawQ = new THREE.Quaternion(), rollQ = new THREE.Quaternion();
    const sideV = new THREE.Vector3(), upV = new THREE.Vector3(), fwdV = new THREE.Vector3(), tmp = new THREE.Vector3();
    const Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
    const tf = track.newFrame();
    let time = 0, phase = 'race', winner = null, finishCount = 0, outCount = 0, endT = 0;
    const yellows = [];
    const ceremony = { center: new THREE.Vector3(), fwd: new THREE.Vector3(), side: new THREE.Vector3(), up: new THREE.Vector3(), t: 0 };
    const api = {
      cars, TOTAL_LAPS, ceremony, onEvent: null, quiet: false,
      step, render, reset, beginCeremony, forceIncident,
      get time() { return time; }, get phase() { return phase; }, get winner() { return winner; },
      get scPhase() { return scPhase; },
    };
    const emit = (ev) => { if (!api.quiet && api.onEvent) api.onEvent(ev); };
    const puff = (type, p) => { if (fx) fx.emit(type, p, time); };

    function resetCar(c, i) {
      const row = Math.floor(i / 2), pace = c.pace || 1;
      Object.assign(c, {
        dist: -10 - row * 13 - (i % 2) * 5, lat: i % 2 ? 2.6 : -2.6, latV: 0, latLim: 0, passSide: 0,
        v: 44, vy: 0, y: 0, air: false, airTime: 0, roadY: 0, squash: 0,
        // car and driver: straight-line speed, cornering grip, braking bravery, tyre wear per lap, appetite for risk
        topF: (0.972 + rand() * 0.05) * pace, gripF: (0.95 + rand() * 0.07) * pace, brakeF: (0.94 + rand() * 0.1) * pace,
        wear: 0.001 + rand() * 0.002, risk: 0.6 + rand() * 0.8,
        ph: rand() * 6.28, bias: (rand() - 0.5) * 1.6, draft: 0, attack: false,
        steer: 0, accel: 0, latAcc: 0, gear: 3, rpm: 0.5, brake: false, throttle: 0.8, slip: 0, offroad: false,
        lapStart: 0, lastLap: null, bestLap: null, gap: 0, cp: null, lapIdx: undefined, lap: 1,
        pos: i + 1, prevPos: i + 1, section: 0, s: 0,
        state: 'race', out: false, hidden: false, finished: false, finishTime: 0, finishRank: 0, lapsDown: 0,
        cr: null, dmgBits: 0, yawOff: 0, rejoin: 0, smokeT: 0, outT: 0, spinV: null, gainT: -99, loseT: -99,
        gapAhead: 0, gapBehind: 0, graceT: 22, // the rolling start: let the pack string out before contact can spin anyone
      });
      c.vel.set(0, 0, 0);
    }
    function reset() {
      time = 0; phase = 'race'; winner = null; finishCount = 0; outCount = 0; endT = 0;
      { scPhase = 'none'; sc.state = 'pit'; sc.hidden = true; sc.rig.root.visible = false; }
      yellows.length = 0; firstPass.clear(); pairT.clear();
      // a fresh grid every race: shuffle who starts where
      const slots = cars.map((c, i) => i);
      for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
      cars.forEach((c, i) => resetCar(c, slots[i]));
      if (fx) fx.reset();
    }

    function step(dt) {
      time += dt;
      if (phase === 'ceremony') { ceremonyStep(dt); return; }
      // yellow flags wave wherever a car is sliding, crawling back or stranded on the road
      yellows.length = 0;
      for (const c of cars) if (c.state === 'crash' || c.rejoin > 0 || (c.state === 'out' && Math.abs(c.lat) < W + 1.5)) yellows.push(c.s);
      for (const c of cars) {
        if (c.state === 'race') driveCar(c, dt);
        else if (c.state === 'crash') crashStep(c, dt);
        else if (c.state === 'out') outStep(c, dt);
      }
      scStep(dt);
      contacts();
      ranking();
      if (phase === 'finishing' && (cars.every((c) => c.finished || c.out) || time - endT > 75)) endRace();
      if (firstPass.size > 600) {
        let lead = 0;
        for (const c of cars) lead = Math.max(lead, c.cp || 0);
        for (const k of firstPass.keys()) if (k < lead - 300) firstPass.delete(k);
      }
    }
    function yellowAt(s) {
      for (const ys of yellows) { const d = wrapD(ys - s); if (d > -40 && d < 260) return true; }
      return false;
    }

    // ---------- racing ----------
    function driveCar(c, dt) {
      const s = wrapS(S0 + c.dist);
      const tyre = 1 - c.wear * Math.max(0, c.lapIdx || 0);
      const form = 1 + 0.012 * Math.sin(time * 0.05 + c.ph) + 0.008 * Math.sin(time * 0.13 + c.ph * 2);
      // racing instinct: a driver who has dropped back pushes a little harder, a comfortable leader eases off
      const chase = 1 + clamp((c.gapAhead - 1.2) * 0.0025, 0, 0.009) - (c.gapBehind > 4 ? 0.004 : 0);
      const top = c.topF * (1 + 0.045 * c.draft) * chase;
      const yellow = yellows.length > 0 && yellowAt(s);
      const scOn = scPhase !== 'none';
      const wg = api.weather.grip; // less grip in the wet and the snow: slower corners, earlier braking
      const look = (c.v * (c.attack ? 0.075 : 0.12)) / c.brakeF / wg; // braking later when attacking
      let vt = Math.min(track.lerpArr(track.vProf, s + look) * Math.sqrt(c.gripF * tyre * wg) * form * chase, 79 * top * (0.9 + 0.1 * wg));
      let latT = track.lerpArr(track.line, s) + c.bias * 0.6;
      if (yellow) vt *= 0.86;
      if (c.finished) vt = Math.min(vt, 32); // cool-down lap

      // traffic: the nearest running car ahead on the road, lapped cars included
      let ahead = null, gap = 1e9;
      for (const o of cars) {
        if (o === c || o.state !== 'race') continue;
        const d = wrapD(o.s - s);
        if (d > 0 && d < gap) { gap = d; ahead = o; }
      }
      if (!sc.hidden) { const d = wrapD(sc.s - s); if (d > 0 && d < gap) { gap = d; ahead = sc; } }
      // the distances below are tuned for two cars: a longer or wider vehicle (the bus) leaves less room
      if (ahead) gap -= (ahead.len + c.len) / 2 - 4.4;
      const wx = ahead ? (ahead.wid + c.wid) / 2 - 1.95 : 0;
      let draftT = 0;
      c.attack = false;
      if (ahead && gap > 4 && gap < 45 && Math.abs(ahead.lat - c.lat) < 1.8 + wx && c.v > 40) draftT = 1 - gap / 45; // slipstream
      if (ahead && gap < 34) {
        const overlap = Math.abs(ahead.lat - c.lat) < 2.25 + wx;
        if (overlap || gap < 8) {
          const lim = W - 1.25;
          const left = Math.min(lim, ahead.lat + 2.9 + wx), right = Math.max(-lim, ahead.lat - 2.9 - wx);
          const roomL = left - ahead.lat, roomR = ahead.lat - right;
          // no passing under yellow flags (except cars crawling back) or on the cool-down lap
          const allowed = !c.finished && !ahead.finished && ahead !== sc && (!yellow || ahead.v < 20) && (!scOn || ahead.v < 15);
          const want = allowed && (vt > ahead.v + 0.4 || c.draft > 0.45);
          if (want && Math.max(roomL, roomR) > 2.35 + wx) {
            if (!c.passSide) c.passSide = roomL > roomR ? 1 : -1;
            latT = c.passSide > 0 ? left : right;
            c.attack = gap < 14;
          }
          if (overlap && gap < 16) vt = Math.min(vt, ahead.v + (gap - 7.5) * 0.9);
        }
      } else c.passSide = 0;
      c.draft += (draftT - c.draft) * Math.min(1, dt * 1.5);

      // behind the safety car: single file, no overtaking, a steady gap to the car in front
      // (a car crawling back after a spin may still be passed)
      if (scOn && !c.finished && !(ahead && ahead !== sc && ahead.v < 15)) {
        c.passSide = 0; c.attack = false;
        latT = track.lerpArr(track.line, s);
        if (ahead && gap < 240) vt = Math.min(vt, Math.max(0, ahead.v + (gap - 16) * 0.5));
        else vt *= 0.8; // catching the queue at a safe pace
        if (scPhase === 'restart' && c === leaderOnTrack()) vt = Math.min(vt, 40);
      }

      // sliding or stranded cars: steer round them, braking hard if there's no room
      for (const o of cars) {
        if ((o.state !== 'crash' && o.state !== 'out') || o.hidden || Math.abs(o.lat) > W + 1.2) continue;
        const d = wrapD(o.s - s);
        if (d < -3 || d > 170) continue;
        const pass = o.lat > 0 ? o.lat - 3.6 : o.lat + 3.6;
        if (Math.abs(pass) < W - 0.9) latT = pass;
        else vt = Math.min(vt, Math.sqrt(2 * 9 * Math.max(0, d - 7)));
        if (o.state === 'crash') vt = Math.min(vt, 14 + Math.sqrt(2 * 9 * Math.max(0, d - 12)));
      }

      // after a spin: turn back the right way round, then rejoin with care
      if (c.rejoin > 0) {
        c.yawOff -= Math.sign(c.yawOff) * Math.min(Math.abs(c.yawOff), 1.4 * dt);
        vt = Math.min(vt, Math.abs(c.yawOff) > 0.25 ? 2.5 : 30);
        if (Math.abs(c.yawOff) < 1e-3 && Math.abs(c.lat) < W - 1 && c.v > 20) c.rejoin = 0;
      }

      // lateral movement (a car rejoining from the grass may be outside the usual limit for a while)
      c.latLim = Math.max(0, c.latLim - dt * 1.5);
      const lim = Math.max(W - 1.1, c.latLim);
      const dl = clamp((latT - c.lat) * 0.9, -1, 1);
      c.latV += (dl * 3.2 - c.latV) * Math.min(1, dt * 3);
      c.lat = clamp(c.lat + c.latV * dt, -lim, lim);

      // longitudinal
      const vPrev = c.v;
      let thr;
      if (c.v < vt) {
        c.v += 10.5 * (0.7 + 0.3 * wg) * (1 + 0.12 * c.draft) * Math.max(0.1, 1 - Math.pow(c.v / (80 * top), 2)) * dt * (c.air ? 0.3 : 1);
        thr = c.v < vt - 0.6 ? 1 : 0.35 + 0.6 * Math.pow(c.v / 80, 3);
      } else {
        c.v = Math.max(vt, c.v - 17 * (0.6 + 0.4 * wg) * dt);
        thr = c.v < vPrev - 0.05 ? 0 : 0.3 + 0.6 * Math.pow(c.v / 80, 3);
      }
      c.throttle += (thr - c.throttle) * Math.min(1, dt * 14);
      c.brake = c.v < vPrev - 0.05;
      c.accel += ((c.v - vPrev) / dt - c.accel) * Math.min(1, dt * 6);
      c.dist += c.v * dt;

      // checkpoints, laps and the chequered flag
      const cp = Math.floor(c.dist / 100);
      if (cp !== c.cp) {
        c.cp = cp;
        if (!firstPass.has(cp)) firstPass.set(cp, time);
        c.gap = time - firstPass.get(cp);
      }
      const lapNow = Math.floor(c.dist / L);
      if (c.lapIdx === undefined) c.lapIdx = lapNow;
      if (lapNow > c.lapIdx) {
        if (c.lapIdx >= 0) { c.lastLap = time - c.lapStart; c.bestLap = c.bestLap ? Math.min(c.bestLap, c.lastLap) : c.lastLap; }
        c.lapIdx = lapNow; c.lapStart = time;
        if (!c.finished && (lapNow >= TOTAL_LAPS || winner)) finish(c, lapNow);
        else if (c.pos === 1 && !c.finished && lapNow >= 1) emit({ type: 'leaderLap', car: c, lap: lapNow + 1 });
      }
      c.lap = Math.min(TOTAL_LAPS, Math.max(1, lapNow + 1));

      // placement on the road + vertical physics (Flugplatz / Pflanzgarten hops)
      const sNow = wrapS(S0 + c.dist);
      track.frame(sNow, c.lat, c.fr);
      const roadY = c.fr.pos.y;
      if (c.y === 0 && c.roadY === 0) c.y = roadY;
      const roadVy = (roadY - (c.roadY || roadY)) / dt;
      c.roadY = roadY;
      if (c.air) {
        c.vy -= 9.81 * dt; c.y += c.vy * dt; c.airTime += dt;
        if (c.y <= roadY) { c.squash = Math.min(0.09, (roadVy - c.vy) * 0.012); c.air = false; c.y = roadY; c.vy = roadVy; }
      } else if (roadVy < c.vy - 9.81 * dt * 1.6 && c.v > 30) {
        c.air = true; c.airTime = 0; c.vy -= 9.81 * dt; c.y += c.vy * dt;
      } else { c.vy = roadVy; c.y = roadY; }
      c.squash *= Math.exp(-dt * 6);

      // orientation
      const k = track.lerpArr(track.kS, sNow);
      c.latAcc = c.v * c.v * k;
      c.steer += (Math.atan(2.7 * k) + c.latV * 0.01 - c.steer) * Math.min(1, dt * 8);
      const yaw = Math.atan2(c.latV, Math.max(8, c.v)) + c.yawOff;
      sideV.copy(c.fr.side);
      mtx.makeBasis(sideV, c.fr.up, c.fr.fwd);
      c.quat.setFromRotationMatrix(mtx);
      yawQ.setFromAxisAngle(c.fr.up, yaw);
      c.quat.premultiply(yawQ);
      c.world.copy(c.fr.pos); c.world.y = c.y;
      c.fwd.set(0, 0, 1).applyQuaternion(c.quat);
      c.up.set(0, 1, 0).applyQuaternion(c.quat);
      c.vel.copy(c.fr.fwd).multiplyScalar(c.v).addScaledVector(c.fr.side, c.latV);

      // six-speed gearbox: revs are a share of the redline, upshift at the limiter, downshift with some hysteresis
      const kmh = c.v * 3.6;
      const shifts = [0, 92, 128, 162, 196, 232, 292];
      let gear = c.gear;
      while (gear < 6 && kmh > shifts[gear]) gear++;
      while (gear > 1 && kmh < shifts[gear - 1] - 10) gear--;
      c.gear = gear;
      c.rpm = Math.max(0.3, Math.min(1, kmh / shifts[gear]));
      c.section = secOfS(sNow);
      c.s = sNow;
      c.offroad = Math.abs(c.lat) > W;

      // tyres squeal near the limit; wheelspin while turning round after a spin
      const use = Math.abs(c.latAcc) / (GRIP * c.gripF * tyre * wg); // share of the available grip in use
      c.slip = c.rejoin > 0 && Math.abs(c.yawOff) > 0.25 ? 0.45 : clamp((use - 0.85) * 2, 0, 0.3);
      if (c.slip > 0.3 && (c.smokeT -= dt) <= 0) { c.smokeT = 0.06; tyreSmoke(c, 0.6); }

      // mistakes: the closer to the grip limit, the likelier; the first lap, battles and worn tyres raise the odds
      if (phase === 'race' && !scOn && !c.finished && !c.rejoin && !c.air && time > 14 && time > c.graceT) {
        const stress = clamp((use - 0.6) / 0.4, 0, 1);
        let rate = api.hazard * stress * stress * c.risk * (1 + 8 * (1 - tyre)) * (c.attack ? 3 : 1) * ((c.lapIdx || 0) < 1 ? 2 : 1);
        rate *= api.weather.risk;
        if (outCount >= MAX_OUT) rate *= 0.3;
        if (Math.random() < rate * dt) startCrash(c, Math.random() < 0.6 ? 'spin' : 'off');
      }
    }
    api.hazard = 0.0012; // incidents per second at full stress (tuned for a handful per race)
    api.weather = { grip: 1, risk: 1 }; // set by weather.js
    api.tailBase = 0.5;                 // tail-light glow; brighter after dark

    function finish(c, lapsDone) {
      c.finished = true; c.finishTime = time; c.finishRank = ++finishCount;
      c.lapsDown = Math.max(0, TOTAL_LAPS - lapsDone);
      if (!winner) { winner = c; phase = 'finishing'; endT = time; emit({ type: 'win', car: c }); }
      // the classified place so far: cars still running on a better lap will finish ahead
      emit({ type: 'finish', car: c, rank: 1 + cars.filter((o) => o !== c && byRank(o, c) < 0).length });
    }
    function endRace() {
      // anyone still circulating is classified where they are
      cars.filter((c) => !c.finished && !c.out).sort((a, b) => b.dist - a.dist).forEach((c) => {
        c.finished = true; c.finishTime = time; c.finishRank = ++finishCount;
        c.lapsDown = Math.max(0, TOTAL_LAPS - Math.max(0, c.lapIdx || 0));
      });
      phase = 'over';
      emit({ type: 'raceover' });
    }

    // ---------- incidents ----------
    function startCrash(c, kind, spinDir) {
      if (c.state !== 'race') return;
      track.frame(c.s + 12, 0, tf);
      const turn = Math.sign(wrapA(heading(tf.fwd) - heading(c.fr.fwd))) || 1; // which way the corner bends
      c.state = 'crash';
      c.cr = {
        x: c.world.x, z: c.world.z, s: c.s, lat: c.lat, s0: c.s, dist0: c.dist,
        vx: c.vel.x, vz: c.vel.z, yaw: heading(c.fwd), w: 0, h: 0, vy: 0, roll: 0, rollV: 0, rolled: false,
        t: 0, still: 0, maxHit: 0, hitT: -9, kind,
      };
      // a spin snaps the tail round into the corner; running wide means the car simply stops turning
      c.cr.w = kind === 'spin' ? (spinDir || turn) * (2.3 + Math.random() * 1.6) : turn * 0.35;
      c.passSide = 0; c.attack = false; c.draft = 0; c.rejoin = 0; c.yawOff = 0;
      emit({ type: 'incident', car: c, kind, s: c.s, section: track.sections[c.section].name, t: time });
    }
    function forceIncident(i, kind) { startCrash(cars[i], kind || 'spin'); }

    // finds the car's place along the track from its free position; returns the ground height there
    function locate(c) {
      const cr = c.cr;
      for (let k = 0; k < 2; k++) {
        track.frame(cr.s, 0, tf);
        cr.s = wrapS(cr.s + (cr.x - tf.pos.x) * tf.fwd.x + (cr.z - tf.pos.z) * tf.fwd.z);
      }
      track.frame(cr.s, 0, c.fr);
      const h = Math.hypot(c.fr.side.x, c.fr.side.z) || 1;
      cr.lat = ((cr.x - c.fr.pos.x) * c.fr.side.x + (cr.z - c.fr.pos.z) * c.fr.side.z) / h;
      const roadY = c.fr.pos.y + clamp(cr.lat, -W, W) * (c.fr.side.y / h);
      const k = clamp((Math.abs(cr.lat) - W) / 2.5, 0, 1);
      return roadY + (NR.groundY(cr.x, cr.z) - roadY) * k;
    }

    function crashStep(c, dt) {
      const cr = c.cr;
      cr.t += dt;
      const onGround = cr.h <= 0 && cr.vy <= 0;
      const sp0 = Math.hypot(cr.vx, cr.vz);
      if (onGround) {
        // scrubbing tyres on tarmac, or ploughing through the grass
        const mu = (Math.abs(cr.lat) > W + 0.3 ? 6.5 : 8.8) * (0.6 + 0.4 * api.weather.grip);
        const k = sp0 > 1e-3 ? Math.max(0, sp0 - mu * dt) / sp0 : 0;
        cr.vx *= k; cr.vz *= k;
        cr.w *= Math.exp(-dt * (Math.abs(cr.lat) > W ? 1.1 : 0.75));
      }
      cr.yaw += cr.w * dt;
      cr.x += cr.vx * dt; cr.z += cr.vz * dt;
      const gy = locate(c);

      // the Armco
      const lim = W + RAIL - 1.0;
      if (Math.abs(cr.lat) > lim) {
        const sd = Math.sign(cr.lat), h = Math.hypot(c.fr.side.x, c.fr.side.z) || 1;
        const nx = (c.fr.side.x / h) * sd, nz = (c.fr.side.z / h) * sd;
        const pen = Math.abs(cr.lat) - lim;
        cr.x -= nx * pen; cr.z -= nz * pen; cr.lat = sd * lim;
        const vn = cr.vx * nx + cr.vz * nz;
        if (vn > 0.3) hitBarrier(c, vn, nx, nz);
      }

      // airborne after a big hit: fly, barrel-roll and land
      if (!onGround || cr.vy > 0) {
        cr.vy -= 9.81 * dt; cr.h += cr.vy * dt; cr.roll += cr.rollV * dt;
        if (cr.h <= 0) {
          cr.h = 0;
          if (cr.vy < -3) { crashFx(c, -cr.vy * 0.8); cr.vy = -cr.vy * 0.3; cr.rollV *= 0.55; } else cr.vy = 0;
        }
      } else if (cr.roll) {
        const target = Math.round(cr.roll / Math.PI) * Math.PI; // settle on the wheels or the roof
        cr.roll += (target - cr.roll) * Math.min(1, dt * 5);
      }
      crashPose(c, gy);
      c.rpm += (0.32 - c.rpm) * Math.min(1, dt * 2);
      if ((c.slip > 0.2 || (c.offroad && c.v > 3)) && (c.smokeT -= dt) <= 0) { c.smokeT = 0.045; tyreSmoke(c, 0.6 + c.slip); }

      if (Math.hypot(cr.vx, cr.vz) < 0.5 && Math.abs(cr.w) < 0.4 && cr.h === 0) cr.still += dt; else cr.still = 0;
      if (cr.still > 1.2) settle(c);
    }

    function hitBarrier(c, vn, nx, nz) {
      const cr = c.cr;
      cr.vx -= 1.35 * vn * nx; cr.vz -= 1.35 * vn * nz;       // bounce back off the rail
      const tx = -nz, tz = nx, vt = cr.vx * tx + cr.vz * tz;   // and scrub speed along it
      cr.vx -= vt * 0.25 * tx; cr.vz -= vt * 0.25 * tz;
      cr.w += (Math.random() - 0.5) * vn * 0.22;
      cr.maxHit = Math.max(cr.maxHit, vn);
      if (vn > 9 && Math.random() < 0.7) c.dmgBits |= 1;      // rear wing torn off
      if (vn > 13) c.dmgBits |= 2;                            // splitter gone
      if (vn > 20 && !cr.rolled && Math.random() < 0.45) {
        cr.rolled = true; cr.h = 0.02; cr.vy = 3.5 + vn * 0.12;
        cr.rollV = (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 3);
      }
      crashFx(c, vn);
      if (vn > 16) deploySC(c); // a heavy hit leaves debris everywhere
    }
    function crashFx(c, hit, at) {
      if (hit < 2 && time - c.cr.hitT < 0.3) return; // light scraping along the rail
      if (c.cr) c.cr.hitT = time;
      const p = at || c.world;
      const strength = clamp(hit / 25, 0.08, 1);
      puff('crash', { pos: [p.x, p.y + 0.5, p.z], vel: [c.vel.x, 0, c.vel.z], strength, colors: [c.base, c.accent || '#1b1b1b', '#141414'] });
      emit({ type: 'impact', car: c, pos: p.clone(), strength });
    }

    function crashPose(c, gy) {
      const cr = c.cr;
      // tilt with the road's banking on the tarmac, level out on the grass
      const k = clamp((Math.abs(cr.lat) - W) / 2.5, 0, 1);
      upV.copy(c.fr.up).lerp(Y, k).normalize();
      fwdV.set(Math.sin(cr.yaw), 0, Math.cos(cr.yaw));
      fwdV.addScaledVector(upV, -fwdV.dot(upV)).normalize();
      sideV.crossVectors(upV, fwdV);
      mtx.makeBasis(sideV, upV, fwdV);
      c.quat.setFromRotationMatrix(mtx);
      if (cr.roll) c.quat.multiply(rollQ.setFromAxisAngle(Z, cr.roll));
      c.world.set(cr.x, gy + cr.h + 0.62 * (1 - Math.cos(cr.roll)), cr.z); // rolls pivot round the body's middle
      c.y = c.world.y; c.roadY = gy;
      c.fwd.set(0, 0, 1).applyQuaternion(c.quat);
      c.up.set(0, 1, 0).applyQuaternion(c.quat);
      c.vel.set(cr.vx, cr.vy, cr.vz);
      c.v = Math.hypot(cr.vx, cr.vz);
      c.s = cr.s; c.lat = cr.lat; c.section = secOfS(cr.s);
      c.offroad = Math.abs(cr.lat) > W;
      const sideways = Math.abs(cr.vx * fwdV.z - cr.vz * fwdV.x);
      c.slip = cr.h > 0 || c.state === 'out' ? 0 : clamp(sideways / 12 + Math.abs(cr.w) / 5, 0, 1);
      c.steer = clamp(-cr.w * 0.12, -0.45, 0.45);
      c.latAcc = 0; c.accel = 0; c.brake = c.state === 'crash'; c.throttle = 0;
      c.air = false; c.squash = 0;
    }

    function settle(c) {
      const cr = c.cr;
      const roofed = Math.cos(cr.roll) < 0.5;
      const wrecked = roofed || cr.rolled || cr.maxHit > 13 || (c.dmgBits & 2);
      if (roofed || (wrecked && outCount < MAX_OUT)) retire(c);
      else rejoin(c);
    }
    function retire(c) {
      c.state = 'out'; c.out = true; outCount++;
      c.v = 0; c.vel.set(0, 0, 0); c.rpm = 0; c.throttle = 0; c.slip = 0; c.outT = 0; c.brake = false;
      emit({ type: 'retire', car: c, section: track.sections[c.section].name });
      deploySC(c);
    }
    function rejoin(c) {
      const cr = c.cr;
      c.state = 'race';
      c.dist = cr.dist0 + wrapD(cr.s - cr.s0);
      c.lat = cr.lat; c.latLim = Math.abs(cr.lat) + 0.2; c.latV = 0;
      track.frame(cr.s, 0, tf);
      c.yawOff = wrapA(cr.yaw - heading(tf.fwd));
      c.rejoin = 1; c.v = 0; c.vy = 0; c.air = false; c.y = 0; c.roadY = 0; c.squash = 0; c.passSide = 0;
      c.graceT = time + 25; // shaken, but no second mistake straight away
      c.cr = null;
      emit({ type: 'rejoin', car: c });
    }
    function outStep(c, dt) {
      const cr = c.cr;
      c.outT += dt;
      // marshals push a car stranded on the racing line to the verge
      if (c.outT > 10 && Math.abs(cr.lat) < W + 1.6) {
        const sd = cr.lat >= 0 ? 1 : -1, h = Math.hypot(c.fr.side.x, c.fr.side.z) || 1;
        const mv = Math.min(1.2 * dt, W + 1.6 - Math.abs(cr.lat));
        cr.x += (c.fr.side.x / h) * sd * mv; cr.z += (c.fr.side.z / h) * sd * mv;
        crashPose(c, locate(c));
      }
      // smoke from the damaged engine for a while
      if (c.outT < 28 && (c.smokeT -= dt) <= 0) {
        c.smokeT = 0.14;
        tmp.copy(c.world).addScaledVector(c.fwd, c.rig.engineZ).addScaledVector(c.up, 0.9);
        puff('smoke', { pos: [tmp.x, tmp.y, tmp.z], vel: [0, 1.2, 0], size: 1.1, dark: true });
      }
    }

    function tyreSmoke(c, size) {
      tmp.copy(c.world).addScaledVector(c.fwd, c.rig.rearZ).addScaledVector(c.up, 0.25);
      puff(c.offroad ? 'dust' : 'smoke', { pos: [tmp.x, tmp.y, tmp.z], vel: [c.vel.x * 0.3, 0.6, c.vel.z * 0.3], size });
    }

    // ---------- contact between cars ----------
    function contacts() {
      for (let i = 0; i < cars.length; i++) {
        const a = cars[i];
        if (a.hidden || a.state === 'out' || a.state === 'ceremony') continue;
        for (let j = i + 1; j < cars.length; j++) {
          const b = cars[j];
          if (b.hidden || b.state === 'out' || b.state === 'ceremony') continue;
          const dx = a.world.x - b.world.x, dz = a.world.z - b.world.z;
          const len = (a.len + b.len) / 2, wid = (a.wid + b.wid) / 2, near = len + 1.6; // 4.4 and 1.95 for two cars
          if (dx * dx + dz * dz > near * near) continue;
          const key = i * 32 + j;
          if (a.state === 'crash' || b.state === 'crash') { crashContact(a, b, key); continue; }
          const ds = wrapD(b.s - a.s), dl = b.lat - a.lat;
          if (Math.abs(ds) > len || Math.abs(dl) > wid) continue;
          const back = ds > 0 ? a : b, front = back === a ? b : a;
          const inLine = Math.abs(dl) < wid - 0.65;
          let hit;
          if (inLine) {
            // nose into tail
            hit = Math.max(0, back.v - front.v);
            back.v = Math.min(back.v, front.v - 0.3);
            back.dist -= len - Math.abs(ds);
          } else {
            // side by side: leaning on each other
            const push = (wid - Math.abs(dl)) / 2, sd = Math.sign(dl) || 1;
            a.lat -= sd * push; b.lat += sd * push;
            hit = Math.abs(a.latV - b.latV) * 1.5;
            a.latV = b.latV = (a.latV + b.latV) / 2;
          }
          if (hit > 2.5 && time - (pairT.get(key) || -9) > 2) {
            pairT.set(key, time);
            tmp.copy(a.world).add(b.world).multiplyScalar(0.5);
            const victim = inLine ? front : Math.random() < 0.5 ? a : b;
            const p = phase === 'race' && scPhase === 'none' && !victim.finished && time > victim.graceT ? Math.min(0.4, (hit - 3.5) / 12) : 0;
            puff('crash', { pos: [tmp.x, tmp.y + 0.5, tmp.z], vel: [front.vel.x, 0, front.vel.z], strength: clamp(hit / 30, 0.05, 0.4), colors: [a.base, b.base, '#141414'] });
            emit({ type: 'impact', car: victim, pos: tmp.clone(), strength: clamp(hit / 30, 0.05, 0.4) });
            if (Math.random() < p) {
              startCrash(victim, 'spin', Math.random() < 0.5 ? -1 : 1);
              emit({ type: 'contact', car: victim, other: victim === a ? b : a });
            }
          }
        }
      }
    }
    function crashContact(a, b, key) {
      const cc = a.state === 'crash' ? a : b, o = cc === a ? b : a;
      const ext = (cc.len + o.len) / 2 - 4.4; // a longer vehicle (the bus) reaches further along the road
      const apart = ext > 0 ? Math.abs(wrapD(o.s - cc.s)) > 2.4 + ext || Math.abs(o.lat - cc.lat) > 2.4 : cc.world.distanceTo(o.world) > 2.4;
      if (apart || time - (pairT.get(key) || -9) < 1) return;
      pairT.set(key, time);
      const rvx = o.vel.x - cc.vel.x, rvz = o.vel.z - cc.vel.z, hit = Math.hypot(rvx, rvz);
      cc.cr.vx += rvx * 0.45; cc.cr.vz += rvz * 0.45; cc.cr.w += (Math.random() - 0.5) * 3;
      tmp.copy(a.world).add(b.world).multiplyScalar(0.5);
      crashFx(cc, hit, tmp);
      if (o.state === 'crash') { o.cr.vx -= rvx * 0.45; o.cr.vz -= rvz * 0.45; }
      else if (o.state === 'race') {
        o.v *= 0.6;
        if (hit > 8 && Math.random() < 0.4) startCrash(o, 'spin', Math.random() < 0.5 ? -1 : 1);
      }
    }

    // ---------- running order ----------
    // By distance covered. A finished car counts only up to its last crossing of the line, so a lapped car
    // that takes the flag early still ranks behind the cars on the lead lap; ties go to whoever crossed first.
    const dnf = (c) => (c.out && !c.finished ? 1 : 0);
    const reach = (c) => (c.finished ? (TOTAL_LAPS - c.lapsDown) * L : c.dist);
    const byRank = (a, b) => dnf(a) - dnf(b) || reach(b) - reach(a) || a.finishRank - b.finishRank;
    function ranking() {
      const order = cars.slice().sort(byRank);
      order.forEach((c, i) => { c.pos = i + 1; c.gapBehind = 0; });
      let prev = null;
      for (const c of order) {
        if (c.finished || c.out) continue;
        c.gapAhead = prev ? c.gap - prev.gap : 0;
        if (prev) prev.gapBehind = c.gapAhead;
        prev = c;
      }
      for (const c of order) {
        if (c.pos >= c.prevPos || c.state !== 'race' || c.finished || c.rejoin) continue;
        for (const o of order) {
          if (o.prevPos < c.prevPos && o.pos > c.pos && o.state === 'race' && !o.finished && Math.abs(wrapD(o.s - c.s)) < 40) {
            c.gainT = time; o.loseT = time;
            const key = 1000 + Math.min(c.idx, o.idx) * 32 + Math.max(c.idx, o.idx);
            if (time - (pairT.get(key) || -99) > 8) { pairT.set(key, time); emit({ type: 'overtake', car: c, other: o, pos: c.pos }); }
          }
        }
      }
      for (const c of cars) c.prevPos = c.pos;
    }
    api.classification = () => cars.slice().sort(byRank);

    // ---------- the winner's celebration ----------
    function beginCeremony() {
      phase = 'ceremony';
      scPhase = 'none'; sc.state = 'pit'; sc.hidden = true;
      const podium = cars.slice().sort(byRank).filter((c) => !c.out).slice(0, 3);
      track.frame(S0 + 55, 1.5, tf);
      ceremony.center.copy(tf.pos); ceremony.fwd.copy(tf.fwd); ceremony.side.copy(tf.side); ceremony.up.copy(tf.up);
      ceremony.t = 0; ceremony.podium = podium;
      for (const c of cars) {
        c.hidden = !podium.includes(c);
        Object.assign(c, { cr: null, v: 0, slip: 0, throttle: 0.1, rpm: 0.25, gear: 1, brake: false, air: false, squash: 0, latAcc: 0, accel: 0, steer: 0, spinV: null, offroad: false });
        c.vel.set(0, 0, 0);
        if (c.hidden) continue;
        c.state = 'ceremony'; c.cerRank = podium.indexOf(c); c.donut = 0; c.section = secOfS(S0 + 55);
        if (c.cerRank > 0) {
          // runners-up parked at an angle on the grandstand side of the straight
          track.frame(S0 + (c.cerRank === 1 ? 24 : 88), -3.6, tf);
          place(c, tf.pos, heading(tf.fwd) - 0.6, tf.up);
        }
      }
      ceremonyStep(0);
    }
    function place(c, pos, yaw, up) {
      fwdV.set(Math.sin(yaw), 0, Math.cos(yaw));
      fwdV.addScaledVector(up, -fwdV.dot(up)).normalize();
      sideV.crossVectors(up, fwdV);
      mtx.makeBasis(sideV, up, fwdV);
      c.quat.setFromRotationMatrix(mtx);
      c.world.copy(pos); c.y = pos.y; c.roadY = pos.y;
      c.fwd.copy(fwdV); c.up.copy(up);
    }
    function ceremonyStep(dt) {
      const C = ceremony;
      C.t += dt;
      for (const c of cars) {
        if (c.state !== 'ceremony') continue;
        if (c.cerRank === 0) {
          // victory doughnuts: rear wheels lit up, the car pivoting round a tight circle in its own smoke
          const go = Math.min(1, C.t / 2.5);
          c.donut += dt * 1.9 * go;
          const R = 3.0, a = c.donut, ca = Math.cos(a), sa = Math.sin(a);
          tmp.copy(C.center).addScaledVector(C.side, R * ca).addScaledVector(C.fwd, R * sa);
          const tx = -sa * C.side.x + ca * C.fwd.x, tz = -sa * C.side.z + ca * C.fwd.z; // direction of travel
          const rx = ca * C.side.x + sa * C.fwd.x, rz = ca * C.side.z + sa * C.fwd.z;   // outward from the centre
          const nose = 1.2;
          place(c, tmp, Math.atan2(tx * Math.cos(nose) - rx * Math.sin(nose), tz * Math.cos(nose) - rz * Math.sin(nose)), C.up);
          c.v = 1.9 * R * go; c.spinV = 42 * go;
          c.vel.set(tx * c.v, 0, tz * c.v);
          c.rpm = 0.82 + 0.1 * Math.sin(C.t * 3.1) * go; c.throttle = go; c.slip = go; c.gear = 2; c.steer = 0.45 * go;
          if (go > 0.3 && (c.smokeT -= dt) <= 0) { c.smokeT = 0.04; tyreSmoke(c, 1.6); }
        } else {
          // idling, with the odd blip of the throttle
          const blip = Math.max(0, Math.sin(C.t * 0.9 + c.cerRank * 2) - 0.85) / 0.15;
          c.rpm = 0.22 + 0.5 * blip; c.throttle = 0.1 + 0.8 * blip;
        }
      }
    }

    // ---------- safety car ----------
    // Comes out for serious incidents (a car out of the race, or a heavy hit leaving debris), picks up
    // the leader, bunches the field single file with no overtaking, then peels into the pit lane just
    // before the line; racing resumes as the leader crosses it.
    let scPhase = 'none', scT = 0, scLap = 0, scWasHidden = true;
    function createSafetyCar() {
      const { col } = NR.world;
      const e = { brand: 'Safety car', model: 'Safety car', engine: 'Mercedes-AMG', body: 'Mercedes-AMG', road: true, num: 0, sc: true, type: 'front', base: '#f3f4f1', accent: '#ff9a1f', accent2: '#1a3a7a', style: 'sc' };
      const rig = NR.buildCarModel(e);
      rig.wing.visible = false; // a road car: no rear wing
      rig.root.visible = false;
      scene.add(rig.root);
      // roof light bar: two amber lamps that flash alternately while it leads the field
      const R = rig.roofTop;
      const bar = new THREE.Group();
      bar.position.set(0, R.y + 0.05, R.z); bar.rotation.x = R.pitch;
      bar.add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.05, 0.28), NR.carMaterials().carbon));
      const lamps = [-1, 1].map((sd) => {
        const m = new THREE.MeshStandardMaterial({ color: col('#6b3a00'), emissive: col('#ffa000'), emissiveIntensity: 0.2, roughness: 0.25 });
        const l = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.09, 0.22), m);
        l.position.set(sd * 0.27, 0.07, 0); bar.add(l);
        return m;
      });
      rig.body.add(bar);
      return Object.assign({}, e, {
        idx: -1, rig, lamps, fr: track.newFrame(), len: 4.4, wid: 1.95,
        world: new THREE.Vector3(), fwd: new THREE.Vector3(), up: new THREE.Vector3(), quat: new THREE.Quaternion(), vel: new THREE.Vector3(),
        state: 'pit', hidden: true, s: 0, lat: 0, latV: 0, v: 0, rpm: 0.3, gear: 2, throttle: 0, accel: 0, slip: 0, steer: 0, latAcc: 0,
        brake: false, offroad: false, out: false, air: false, y: 0, roadY: 0, squash: 0, dmgBits: 0, spinV: null,
      });
    }
    function leaderOnTrack() {
      let best = null;
      for (const c of cars) if (c.state === 'race' && !c.finished && (!best || c.pos < best.pos)) best = c;
      return best;
    }
    function deploySC(c) {
      if (scPhase !== 'none' || phase !== 'race' || time < 20) return;
      const lead = leaderOnTrack();
      if (!lead || lead.lap >= TOTAL_LAPS) return; // never on the final lap
      // it joins a few hundred metres up the road from the leader, on a clear stretch
      let s = wrapS(lead.s + 300);
      for (let k = 0; k < 8 && cars.some((o) => !o.hidden && Math.abs(wrapD(o.s - s)) < 30); k++) s = wrapS(s + 40);
      Object.assign(sc, { state: 'out', hidden: false, s, lat: track.lerpArr(track.line, s) * 0.5, latV: 0, v: Math.max(25, lead.v * 0.7), gear: 3 });
      scPhase = 'deployed'; scT = 0;
      emit({ type: 'safetyCar', car: c, section: track.sections[c.section].name });
    }
    function scStep(dt) {
      if (scPhase === 'deployed') {
        // stays out until the road is clear and the field is bunched up behind it
        scT += dt;
        const lead = leaderOnTrack();
        const clear = !cars.some((c) => c.state === 'crash' || c.rejoin > 0 || (c.state === 'out' && Math.abs(c.lat) < W + 1.5));
        const close = lead && wrapD(sc.s - lead.s) < 80;
        if (phase !== 'race' || !lead || lead.lap >= TOTAL_LAPS || (clear && close && scT > 75)) {
          scPhase = 'ending'; sc.state = 'in';
          if (phase === 'race') emit({ type: 'safetyCarIn' });
        }
      } else if (scPhase === 'restart') {
        const lead = leaderOnTrack();
        if (phase !== 'race' || !lead) scPhase = 'none';
        else if (lead.lapIdx > scLap) { scPhase = 'none'; emit({ type: 'green', car: lead }); }
      }
      if (sc.state === 'pit') return;

      const s = sc.s;
      let vt = Math.min(track.lerpArr(track.vProf, s + sc.v * 0.12) * 0.7, 46);
      let latT = track.lerpArr(track.line, s) * 0.5;
      const lead = leaderOnTrack();
      if (sc.state === 'out' && lead && wrapD(s - lead.s) > 220) vt = Math.min(vt, 22); // let the leader catch up
      for (const o of cars) { // round stranded cars like everyone else
        if ((o.state !== 'crash' && o.state !== 'out') || o.hidden || Math.abs(o.lat) > W + 1.2) continue;
        const d = wrapD(o.s - s);
        if (d < -3 || d > 170) continue;
        const pass = o.lat > 0 ? o.lat - 3.6 : o.lat + 3.6;
        if (Math.abs(pass) < W - 0.9) latT = pass;
        else vt = Math.min(vt, Math.sqrt(2 * 9 * Math.max(0, d - 7)));
        if (o.state === 'crash') vt = Math.min(vt, 12 + Math.sqrt(2 * 9 * Math.max(0, d - 12)));
      }
      // "safety car in this lap": it peels off into the pit lane just before the line
      let lim = W - 1.1;
      if (sc.state === 'in') {
        const toLine = wrapD(S0 - s);
        if (toLine > 0 && toLine < 170) { latT = W + 3.6; lim = W + 3.8; vt = Math.min(vt, 22); }
      }
      const dl = clamp((latT - sc.lat) * 0.9, -1, 1);
      sc.latV += (dl * 3 - sc.latV) * Math.min(1, dt * 3);
      sc.lat = clamp(sc.lat + sc.latV * dt, -lim, lim);
      const vPrev = sc.v;
      sc.v = sc.v < vt ? Math.min(vt, sc.v + 7 * dt) : Math.max(vt, sc.v - 11 * dt);
      sc.brake = sc.v < vPrev - 0.03;
      sc.accel += ((sc.v - vPrev) / dt - sc.accel) * Math.min(1, dt * 6);
      sc.throttle = sc.v < vt - 0.5 ? 0.8 : sc.brake ? 0 : 0.3;
      sc.s = wrapS(s + sc.v * dt);
      track.frame(sc.s, sc.lat, sc.fr);
      sc.y = sc.roadY = sc.fr.pos.y;
      mtx.makeBasis(sideV.copy(sc.fr.side), sc.fr.up, sc.fr.fwd);
      sc.quat.setFromRotationMatrix(mtx);
      sc.quat.premultiply(yawQ.setFromAxisAngle(sc.fr.up, Math.atan2(sc.latV, Math.max(8, sc.v))));
      sc.world.copy(sc.fr.pos);
      sc.fwd.set(0, 0, 1).applyQuaternion(sc.quat);
      sc.up.set(0, 1, 0).applyQuaternion(sc.quat);
      sc.vel.copy(sc.fr.fwd).multiplyScalar(sc.v).addScaledVector(sc.fr.side, sc.latV);
      const k = track.lerpArr(track.kS, sc.s);
      sc.steer += (Math.atan(2.7 * k) + sc.latV * 0.01 - sc.steer) * Math.min(1, dt * 8);
      sc.latAcc = sc.v * sc.v * k;
      const kmh = sc.v * 3.6, shifts = [0, 70, 105, 140, 175, 210, 260];
      while (sc.gear < 6 && kmh > shifts[sc.gear]) sc.gear++;
      while (sc.gear > 1 && kmh < shifts[sc.gear - 1] - 10) sc.gear--;
      sc.rpm = Math.max(0.25, Math.min(1, kmh / shifts[sc.gear]));
      sc.offroad = Math.abs(sc.lat) > W;
      sc.section = secOfS(sc.s);
      if (sc.state === 'in' && sc.lat > W + 2.4) {
        // gone down the pit lane: the leader now sets the pace until the line
        sc.state = 'pit'; sc.hidden = true; sc.v = 0; sc.vel.set(0, 0, 0);
        const lead2 = leaderOnTrack();
        scLap = lead2 ? lead2.lapIdx : 0;
        scPhase = 'restart';
      }
    }
    function renderSC(dt) {
      const m = sc.rig;
      m.root.visible = !sc.hidden;
      if (sc.hidden) return;
      m.root.position.copy(sc.world); m.root.quaternion.copy(sc.quat);
      m.body.rotation.z = clamp(sc.latAcc * 0.004, -0.06, 0.06);
      m.body.rotation.x = clamp(-sc.accel * 0.003, -0.04, 0.04);
      const spin = (sc.v * dt) / m.wheelR;
      m.wheels.forEach((w) => { w.spin.rotation.x += spin; if (w.front) w.pivot.rotation.y = sc.steer * 1.2; });
      blurRims(m, Math.abs(spin) > 0.3);
      m.tail.emissiveIntensity = sc.brake ? 3.2 : api.tailBase;
      // the light bar flashes while it leads the field and goes dark on its way in
      const on = sc.state === 'out', ph = (performance.now() / 1000 * 2.4) % 1;
      sc.lamps[0].emissiveIntensity = on ? (ph < 0.5 ? 5 : 0.25) : 0.15;
      sc.lamps[1].emissiveIntensity = on ? (ph < 0.5 ? 0.25 : 5) : 0.15;
    }
    // replays only record the race cars, so the safety car stays out of them
    function setReplay(on) {
      if (on) { scWasHidden = sc.hidden; sc.hidden = true; } else sc.hidden = scWasHidden;
      sc.rig.root.visible = !sc.hidden;
    }
    const sc = createSafetyCar();
    api.sc = sc;
    api.audible = cars.concat([sc]); // everything with an engine
    api.setReplay = setReplay;
    reset();

    // ---------- drawing ----------
    const upT = new THREE.Vector3();
    function render(dt) {
      for (const c of cars) {
        const m = c.rig;
        m.root.visible = !c.hidden;
        if (c.hidden) continue;
        m.root.position.copy(c.world);
        m.root.quaternion.copy(c.quat);
        if (c.air) m.root.rotateX(-clamp(c.vy * 0.012, -0.1, 0.1));
        const driving = c.state === 'race';
        m.body.rotation.z = driving ? clamp(c.latAcc * 0.0028, -0.05, 0.05) : 0;
        m.body.rotation.x = driving ? clamp(-c.accel * 0.0025, -0.035, 0.035) : 0;
        m.body.position.y = -c.squash;
        m.blob.position.y = 0.04 - (c.y - c.roadY);
        m.blob.visible = upT.set(0, 1, 0).applyQuaternion(c.quat).y > 0.7;
        const spin = ((c.spinV != null ? c.spinV : c.v) * dt) / m.wheelR;
        m.wheels.forEach((w) => { w.spin.rotation.x += spin; if (w.front) w.pivot.rotation.y = c.steer * 1.2; });
        if (m.rims) blurRims(m, Math.abs(spin) > 0.3);
        m.tail.emissiveIntensity = c.brake ? 3.2 : api.tailBase;
        m.wing.visible = !(c.dmgBits & 1);
        m.splitter.visible = !(c.dmgBits & 2);
        if (m.flag && m.wing.visible) waveFlag(m.flag, dt, c.v);
      }
      renderSC(dt);
    }
    // spokes turning faster than the eye can follow (or the frame rate can show) become a blurred disc
    function blurRims(m, on) {
      if (m.blurred === on) return;
      m.blurred = on;
      for (const r of m.rims) r.material = on ? r.userData.mats.blur : r.userData.mats.sharp;
    }
    // the bus's roof flag: a travelling ripple, quicker and deeper with speed, pinned at the pole
    function waveFlag(f, dt, v) {
      const k = Math.min(v, 70) / 70;
      f.t += dt * (3 + 9 * k);
      const p = f.geo.attributes.position, r = f.rest, amp = 0.05 + 0.09 * k;
      for (let i = 0; i < p.count; i++) { const x = r[i * 3]; p.setZ(i, Math.sin(x * 4.2 - f.t) * amp * x); }
      p.needsUpdate = true;
      f.geo.computeVertexNormals();
    }

    return api;
  }

  NR.ENTRIES = ENTRIES;
  NR.createRace = createRace;
})();
