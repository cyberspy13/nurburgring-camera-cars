// audio.js — engine sound for every car plus the race's other noises, mixed for whichever camera is live.
// No sound files. Engines run in an AudioWorklet (engine-worklet.js) that fires each cylinder at its
// real crank angle into modelled exhaust pipes; where the worklet cannot start, a simpler synth built
// from standard Web Audio nodes takes over. Tyres, crashes, fireworks, crowd and reverb are shared.
(function () {
  'use strict';
  const NR = window.NR;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  // Shared: red (redline rpm), turbo, pops (afterfire), grit (rasp under load), vol.
  // cal: evens out the worklet engines' raw loudness (measured at full throttle), so `vol` alone sets the balance.
  // Worklet engine: layout (firing pattern), pipe (each bank's exhaust length, m), tail (tailpipe, m),
  //   muff (silencer cut-off, Hz), chamber (silencer body resonance, Hz), pulse (blowdown width, crank
  //   degrees), intake (airbox resonance, Hz), whine (gearbox whine, Hz per m/s).
  // Fallback synth: cyl, bank, uneven, tilt, bright and res (exhaust resonances as [Hz, dB, Q]).
  const ENGINES = {
    'McLaren': {
      label: '4.0 twin-turbo V8', cal: 2.1, red: 7800, turbo: 0.9, pops: 0.5, grit: 2.2, vol: 0.95,
      layout: 'flat8', pipe: [1.5, 1.55], tail: 0.55, muff: 5200, chamber: 140, pulse: 34, intake: 520, whine: 33,
      cyl: 8, bank: 0.55, uneven: 0.06, tilt: 0.85, bright: 1.0, res: [[170, 5, 1.1], [1350, 4, 1.4]],
    },
    'BMW': {
      label: '3.0 twin-turbo straight-six', cal: 1.3, red: 7400, turbo: 1.0, pops: 0.45, grit: 1.8, vol: 0.9,
      layout: 'i6', pipe: [1.27, 1.3], tail: 0.7, muff: 4600, chamber: 160, pulse: 36, intake: 600, whine: 36,
      cyl: 6, bank: 0.3, uneven: 0.03, tilt: 1.0, bright: 0.95, res: [[230, 4, 1.0], [950, 5, 1.4]],
    },
    'Mercedes-AMG': {
      label: '6.2 V8', cal: 0.9, red: 7300, turbo: 0, pops: 0.95, grit: 3.0, vol: 1.15,
      layout: 'cross8', pipe: [1.6, 1.72], tail: 0.8, muff: 4200, chamber: 95, pulse: 30, intake: 380, whine: 30,
      cyl: 8, bank: 0.2, uneven: 0.45, tilt: 1.05, bright: 0.85, res: [[115, 7, 1.0], [470, 4, 1.2]],
    },
    'Audi': {
      label: '5.2 V10', cal: 1.15, red: 8600, turbo: 0, pops: 0.5, grit: 2.4, vol: 1.0,
      layout: 'v10', pipe: [1.1, 1.12], tail: 0.5, muff: 6500, chamber: 170, pulse: 26, intake: 700, whine: 34,
      cyl: 10, bank: 0.35, uneven: 0.04, tilt: 0.78, bright: 1.1, res: [[300, 4, 1.0], [1800, 6, 1.6]],
    },
    'Aston Martin': {
      label: '4.0 twin-turbo V8', cal: 1.55, red: 7200, turbo: 0.8, pops: 0.8, grit: 2.6, vol: 1.0,
      layout: 'cross8', pipe: [1.63, 1.74], tail: 0.75, muff: 4000, chamber: 110, pulse: 34, intake: 450, whine: 31,
      cyl: 8, bank: 0.2, uneven: 0.32, tilt: 1.1, bright: 0.9, res: [[140, 6, 1.0], [640, 4, 1.3]],
    },
    'Porsche': {
      label: '4.2 flat-six', cal: 0.6, red: 9400, turbo: 0, pops: 0.25, grit: 2.0, vol: 1.0,
      layout: 'flat6', pipe: [1.0, 1.02], tail: 0.45, muff: 7000, chamber: 190, pulse: 24, intake: 820, whine: 38,
      cyl: 6, bank: 0.5, uneven: 0.03, tilt: 0.7, bright: 1.15, res: [[260, 4, 1.1], [2400, 6, 2.0]],
    },
    'Ferrari': {
      label: '3.0 twin-turbo V6', cal: 0.8, red: 8000, turbo: 1.0, pops: 0.5, grit: 2.0, vol: 0.95,
      layout: 'v6', pipe: [1.18, 1.2], tail: 0.5, muff: 5800, chamber: 175, pulse: 30, intake: 680, whine: 35,
      cyl: 6, bank: 0.3, uneven: 0.06, tilt: 0.75, bright: 1.1, res: [[240, 4, 1.0], [2000, 5, 1.6]],
    },
    'Lamborghini': {
      label: '5.2 V10', cal: 1.0, red: 8500, turbo: 0, pops: 1.0, grit: 2.8, vol: 1.05,
      layout: 'v10', pipe: [1.11, 1.13], tail: 0.55, muff: 6200, chamber: 150, pulse: 25, intake: 640, whine: 33,
      cyl: 10, bank: 0.45, uneven: 0.07, tilt: 0.7, bright: 1.05, res: [[200, 5, 1.0], [1500, 6, 1.5]],
    },
    // the bus: a big lazy diesel, heavily silenced, with turbo whistle and no afterfire
    'Bus': {
      label: '9.0 turbo-diesel straight-six', cal: 2.05, red: 2600, turbo: 0.8, pops: 0, grit: 2.6, vol: 1.0,
      layout: 'i6', pipe: [1.9, 1.95], tail: 1.0, muff: 1500, chamber: 70, pulse: 50, intake: 240, whine: 26,
      cyl: 6, bank: 0.3, uneven: 0.04, tilt: 1.25, bright: 0.6, res: [[85, 6, 1.0], [380, 4, 1.2]],
    },
  };
  // The exhaust bank each firing feeds, in firing order. Every layout here fires evenly overall;
  // the cross-plane V8 alternates banks unevenly (1-5-4-8-6-3-7-2), which is where its burble comes from.
  const LAYOUTS = {
    cross8: [0, 1, 0, 1, 1, 0, 1, 0],
    flat8: [0, 1, 0, 1, 0, 1, 0, 1],
    v10: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
    i6: [0, 1, 0, 1, 0, 1], // 1-5-3-6-2-4 into two three-cylinder manifolds
    flat6: [0, 1, 0, 1, 0, 1],
    v6: [0, 1, 0, 1, 0, 1],
  };
  const engineOf = (c) => ENGINES[c.engine || c.brand] || ENGINES.BMW;
  const MAXV = 6; // cars heard at once; the quietest drop out
  const ENGINE_GAIN = 0.55;

  // Settings for one car's worklet engine; sister cars get slightly different pipes and their own randomness.
  function engineConfig(car) {
    const p = engineOf(car), tune = 0.97 + 0.06 * (((car.num * 37) % 10) / 10);
    return {
      seed: (Math.imul(car.num + 1, 2654435761) >>> 0) || 1, banks: LAYOUTS[p.layout], red: p.red,
      pipe: p.pipe.map((l) => l * tune), tail: p.tail, muff: p.muff, chamber: p.chamber * tune, pulse: p.pulse,
      intake: p.intake, whine: p.whine, turbo: p.turbo, pops: p.pops, grit: p.grit, cal: p.cal || 1, gain: ENGINE_GAIN,
    };
  }

  // engine-worklet.js also loads as a page script, which hands over its source for a Blob URL.
  const here = document.currentScript && document.currentScript.src;
  const WORKLET_URL = here ? new URL('engine-worklet.js', here).href : 'js/engine-worklet.js';
  const workletScript = new Promise((done) => {
    if (NR.engineWorklet) return done();
    const s = document.createElement('script');
    s.src = WORKLET_URL;
    s.onload = s.onerror = () => done();
    (document.head || document.documentElement).appendChild(s);
  });

  function createAudio(race) {
    let ctx = null, bus, master, revIn, BUF, CURVE, PULSE;
    let engine = 'loading', via = null; // which synth runs the engines ('worklet' or 'native'), and how the worklet loaded
    let enabled = true, celebrating = false, crowd = null, bed = null, sky = 'clear', wx = null;
    let held = false, heard = false, holdT = 0; // paused by the race; the context has run at least once
    const waves = new Map(), voices = new Map(), aud = new Map(), made = new Map();
    const api = { onChange: null };
    const changed = () => api.onChange && api.onChange();
    const live = () => !!ctx && ctx.state === 'running';
    const wanted = () => enabled && !held && !document.hidden;
    // Sound off, paused or in a background tab: fade out, then suspend the context so the engine
    // simulations stop using the CPU. Resuming needs no click once the context has run before.
    function hold() {
      if (!ctx) return;
      clearTimeout(holdT);
      if (wanted()) { if (ctx.state !== 'running') ctx.resume(); return; }
      if (ctx.state !== 'running') return;
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
      holdT = setTimeout(() => { if (!wanted()) ctx.suspend(); }, 400); // after the fade, or it clicks
    }
    const noise = () => Math.random() * 2 - 1;

    // ---------- generated material ----------
    function makeBuffers() {
      const sr = ctx.sampleRate;
      const buf = (len, fn) => { const b = ctx.createBuffer(1, len, sr); fn(b.getChannelData(0)); return b; };
      const norm = (d) => { let m = 0; for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i])); if (m) for (let i = 0; i < d.length; i++) d[i] /= m; };
      const white = buf(sr * 2, (d) => { for (let i = 0; i < d.length; i++) d[i] = noise(); });
      // slow random wander (~45 Hz) for cycle-to-cycle variation; the length is whole steps so it loops cleanly
      const step = Math.floor(sr / 45), nPts = 180, pts = Array.from({ length: nPts }, noise);
      const slow = buf(step * nPts, (d) => {
        for (let i = 0; i < d.length; i++) {
          const k = Math.floor(i / step), f = (i % step) / step, a = pts[k], b = pts[(k + 1) % nPts];
          d[i] = a + (b - a) * (0.5 - 0.5 * Math.cos(Math.PI * f));
        }
      });
      // overrun pops: a sharp crack over a low thump
      const pops = [0, 1, 2, 3].map((j) => buf(Math.floor(sr * 0.12), (d) => {
        const f = 55 + j * 18, tc = 0.004 + j * 0.002, a = 0.25 + j * 0.12;
        let lp = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          lp += (noise() - lp) * a;
          d[i] = lp * Math.exp(-t / tc) * 1.6 + Math.sin(2 * Math.PI * f * t) * Math.exp(-t / 0.02) * 0.9;
        }
        norm(d);
      }));
      // turbo flutter when the driver lifts: resonant noise chopped into quick chuffs
      const flutter = buf(Math.floor(sr * 0.6), (d) => {
        const w = (2 * Math.PI * 1100) / sr, r = 0.985, c1 = 2 * r * Math.cos(w), c2 = -r * r;
        let y1 = 0, y2 = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr, y = noise() + c1 * y1 + c2 * y2;
          y2 = y1; y1 = y;
          d[i] = y * Math.exp(-t / 0.2) * (0.15 + Math.pow(0.5 + 0.5 * Math.cos(2 * Math.PI * 21 * t), 4)) * Math.min(1, t / 0.01);
        }
        norm(d);
      });
      return { white, slow, pops, flutter };
    }

    // An open-air space: a few reflections off stands, barriers and trees, then a tail whose highs fade first.
    function makeIR() {
      const sr = ctx.sampleRate, len = Math.floor(sr * 2.2), ir = ctx.createBuffer(2, len, sr);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let k = 0; k < 9; k++) d[Math.floor(sr * (0.012 + Math.random() * 0.09))] += (Math.random() < 0.5 ? -1 : 1) * (0.5 - k * 0.04);
        let lp = 0;
        for (let i = Math.floor(sr * 0.02); i < len; i++) {
          const t = i / sr;
          lp += Math.max(0.04, 0.85 - 0.4 * t) * (noise() - lp);
          d[i] += lp * Math.exp((-t * 6.9) / 1.6) * 0.6;
        }
      }
      return ir;
    }

    // band-pass resonator for the generated one-shots; q = π·f·decay gives a ringing mode
    function reso(f, q) {
      const sr = ctx.sampleRate, w = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr, al = Math.sin(w) / (2 * q), a0 = 1 + al;
      const b0 = al / a0, a1 = (-2 * Math.cos(w)) / a0, a2 = (1 - al) / a0;
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      return (x) => { const y = b0 * (x - x2) - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
    }
    const peakOf = (arrs) => arrs.reduce((m, d) => d.reduce((mm, x) => Math.max(mm, Math.abs(x)), m), 1e-9);
    // small bright bits bouncing away after a hit or burst
    function scatter(d, from, to, count, fLo, fHi, amp, fade) {
      const sr = ctx.sampleRate;
      for (let k = 0; k < count; k++) {
        const t0 = from + (to - from) * Math.pow(Math.random(), 1.6), at = Math.floor(t0 * sr);
        const f = fLo + Math.random() * (fHi - fLo), tau = 0.006 + Math.random() * 0.03, a = amp * (0.3 + Math.random()) * Math.exp(-(t0 - from) / fade);
        const n = Math.min(d.length - at, Math.floor(tau * sr * 5));
        for (let i = 0; i < n; i++) d[at + i] += Math.sin((2 * Math.PI * f * i) / sr) * Math.exp(-i / (tau * sr)) * a;
      }
    }

    // A crash: the hit, panels ringing at inharmonic modes as they crumple, a scrape, then debris.
    function makeImpact(size) {
      const sr = ctx.sampleRate, sec = 1.3 + size * 0.7, len = Math.floor(sr * sec);
      const b = ctx.createBuffer(2, len, sr), out = [b.getChannelData(0), b.getChannelData(1)];
      const ex = new Float32Array(len), metal = new Float32Array(len), low = new Float32Array(len);
      const hitN = Math.floor(sr * (0.006 + 0.01 * size));
      for (let i = 0; i < hitN; i++) ex[i] += noise() * (1 - i / hitN);
      for (let tg = 0.004; ;) { // crumpling: grains that thin out
        tg += -Math.log(1 - Math.random()) / (110 * Math.exp(-tg / (0.1 + 0.12 * size)));
        if (tg > 0.2 + 0.35 * size) break;
        const at = Math.floor(tg * sr), n = Math.floor(sr * (0.001 + Math.random() * 0.004)), a = (0.2 + Math.random() * 0.6) * Math.exp(-tg / (0.12 + 0.1 * size));
        for (let i = 0; i < n && at + i < len; i++) ex[at + i] += noise() * a * (1 - i / n);
      }
      const modes = [];
      for (let k = 0, f = 230 + Math.random() * 200; k < 11 && f < 8000; k++, f *= 1.38 + Math.random() * 0.3) {
        modes.push({ run: reso(f, Math.PI * f * (0.04 + Math.random() * 0.22)), a: 1 / (1 + k * 0.3) });
      }
      let lp = 0, ph = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr, x = ex[i];
        let m = 0;
        for (const md of modes) m += md.run(x) * md.a;
        metal[i] = m;
        lp += 0.03 * (x - lp);
        ph += (2 * Math.PI * (38 + 80 * Math.exp(-t / 0.04))) / sr;
        low[i] = lp * 4 + Math.sin(ph) * Math.exp(-t / (0.05 + 0.06 * size)) * 0.5;
      }
      const mP = peakOf([metal]), lP = peakOf([low]);
      for (let ch = 0; ch < 2; ch++) {
        const d = out[ch];
        for (let i = 0; i < len; i++) d[i] = (metal[i] / mP) * 0.6 + (low[i] / lP) * (0.55 + 0.25 * size) + ex[i] * 0.15;
        if (size > 0) { // scraping along the barrier
          const s0 = Math.floor(sr * 0.05), s1 = Math.floor(sr * (0.35 + 0.3 * size)), bp = reso(1400 + Math.random() * 900, 1.6);
          let rough = 0;
          for (let i = s0; i < s1 && i < len; i++) {
            rough += 0.002 * (Math.random() - rough);
            d[i] += bp(noise()) * (0.5 + 4 * rough) * Math.sin((Math.PI * (i - s0)) / (s1 - s0)) * 0.5 * size;
          }
        }
        scatter(d, 0.1, sec * 0.92, 10 + 22 * size, 1500, 6500, 0.18, 0.5);
      }
      const P = peakOf(out) / 0.9;
      out.forEach((d) => { for (let i = 0; i < len; i++) d[i] /= P; });
      return b;
    }

    // A firework: rising whoosh, the burst at 0.4 s, then crackle.
    function makeFirework() {
      const sr = ctx.sampleRate, len = Math.floor(sr * 2.6), b = ctx.createBuffer(2, len, sr), out = [b.getChannelData(0), b.getChannelData(1)];
      const t0 = 0.4, at = Math.floor(t0 * sr);
      for (let ch = 0; ch < 2; ch++) {
        const d = out[ch];
        let low = 0, band = 0; // swept state-variable band-pass for the rising whoosh
        for (let i = 0; i < at; i++) {
          const t = i / sr, f1 = 2 * Math.sin((Math.PI * (700 + 1900 * (t / t0))) / sr);
          low += f1 * band;
          band += f1 * (noise() - low - 0.35 * band);
          d[i] = band * Math.pow(t / t0, 2) * 0.5;
        }
        let lp = 0;
        for (let i = at; i < len; i++) {
          const t = (i - at) / sr;
          lp += 0.25 * (noise() - lp);
          d[i] += lp * Math.exp(-t / 0.03) * 1.4 + Math.sin(2 * Math.PI * 46 * t) * Math.exp(-t / 0.35) * 0.7;
        }
        scatter(d, t0 + 0.12, 2.5, 160, 2500, 9000, 0.12, 0.7);
      }
      const P = peakOf(out) / 0.9;
      out.forEach((d) => { for (let i = 0; i < len; i++) d[i] /= P; });
      return b;
    }

    // A crowd loop: voices through vowel formants with slow swells, applause, whistles and the odd air horn.
    function makeCrowd() {
      const sr = ctx.sampleRate, sec = 8, len = sr * sec, X = Math.floor(sr * 0.5);
      const out = [new Float32Array(len), new Float32Array(len)];
      for (let ch = 0; ch < 2; ch++) {
        const d = out[ch], f1 = reso(600, 1.5), f2 = reso(1150, 2), f3 = reso(2500, 3);
        let sw = 0, swT = 0;
        for (let i = 0; i < len; i++) {
          swT += 0.00004 * (Math.random() - 0.5); swT *= 0.9999; sw += 0.0005 * (swT * 40 - sw);
          const x = noise();
          d[i] = (f1(x) + 0.7 * f2(x) + 0.35 * f3(x)) * (0.8 + clamp(sw, -0.3, 0.3));
        }
        for (let k = 0; k < sec * 26; k++) { // applause
          const a0 = Math.floor(Math.random() * (len - sr * 0.02)), a = 0.15 + Math.random() * 0.35;
          let px = 0;
          for (let i = 0; i < sr * 0.012; i++) { const x = noise() * Math.exp(-i / (sr * 0.004)); d[a0 + i] += (x - px) * a; px = x; }
        }
        for (let k = 0; k < 3; k++) { // whistles
          const a0 = Math.floor(Math.random() * (len - sr)), dur = 0.4 + Math.random() * 0.5, f0 = 1800 + Math.random() * 900;
          let ph = 0;
          for (let i = 0; i < dur * sr; i++) {
            const t = i / (dur * sr), f = f0 * (1 + 0.3 * Math.sin(Math.PI * t)) * (1 + 0.01 * Math.sin((i / sr) * 2 * Math.PI * 6));
            ph += (2 * Math.PI * f) / sr;
            d[a0 + i] += Math.sin(ph) * Math.sin(Math.PI * t) * 0.07;
          }
        }
        if (ch === 0 || Math.random() < 0.5) { // air horn
          const a0 = Math.floor(Math.random() * (len - sr)), dur = 0.7 * sr;
          for (let i = 0; i < dur; i++) {
            const t = i / sr, env = Math.min(1, i / 400) * Math.min(1, (dur - i) / 2000);
            let s = 0;
            for (let h = 1; h <= 6; h++) s += (Math.sin(2 * Math.PI * 340 * h * t) + Math.sin(2 * Math.PI * 425 * h * t)) / h;
            d[a0 + i] += s * env * 0.03;
          }
        }
        for (let i = 0; i < X; i++) { const w = i / X; d[i] = d[i] * w + d[len - X + i] * (1 - w); } // fold the end into the start
      }
      // the folded tail is dropped, so the loop point is seamless
      const P = peakOf(out) / 0.8, b = ctx.createBuffer(2, len - X, sr);
      out.forEach((d, ch) => { const o = b.getChannelData(ch); for (let i = 0; i < len - X; i++) o[i] = d[i] / P; });
      return b;
    }
    function material(key, fn) { if (!made.has(key)) made.set(key, fn()); return made.get(key); }

    // One period = one four-stroke cycle, so the firing pulses sit at harmonic `cyl`
    // and the uneven-firing burble fills the harmonics in between (fallback synth only).
    function waveOf(p) {
      if (waves.has(p)) return waves.get(p);
      const N = 128, re = new Float32Array(N + 1), im = new Float32Array(N + 1), half = p.cyl / 2;
      let s = p.label.length * 7919 + p.cyl * 104729 + p.red;
      const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      for (let k = 1; k <= N; k++) {
        const m = Math.pow(Math.max(1, k / p.cyl), -p.tilt);
        let a = 0;
        if (k % p.cyl === 0) a += m;
        else if (k % half === 0) a += p.bank * m;
        a += p.uneven * Math.pow(k, -0.55) * (k % 2 ? 0.4 : 1) * (0.35 + 0.65 * rnd());
        a += 0.02 * Math.pow(Math.max(1, k / p.cyl), -0.5) * rnd(); // mechanical hash
        const ph = rnd() * Math.PI * 2;
        re[k] = a * Math.cos(ph); im[k] = a * Math.sin(ph);
      }
      const w = ctx.createPeriodicWave(re, im);
      waves.set(p, w);
      return w;
    }

    // Start the worklet from a Blob URL, else a data: URL (a page opened from file:// has an opaque
    // origin, which only the data: URL gets past), else straight from its file. Returns how it loaded.
    async function loadWorklet() {
      if (!ctx.audioWorklet || typeof AudioWorkletNode === 'undefined') return null;
      await workletScript;
      const ways = [];
      if (NR.engineWorklet) {
        const code = `(${NR.engineWorklet})();`;
        try { ways.push(['blob', URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))]); } catch (e) { /* no Blob URLs */ }
        ways.push(['data', 'data:text/javascript;charset=utf-8,' + encodeURIComponent(code)]);
      }
      ways.push(['file', WORKLET_URL]);
      for (const [via, u] of ways) {
        try {
          await ctx.audioWorklet.addModule(u);
          const probe = new AudioWorkletNode(ctx, 'nr-engine', { numberOfInputs: 0, outputChannelCount: [1], processorOptions: engineConfig({ num: 1, brand: 'BMW' }) });
          probe.port.postMessage('stop');
          return via;
        } catch (e) { /* try the next way in */ }
      }
      return null;
    }

    function init() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      heard = ctx.state === 'running';
      ctx.onstatechange = () => { if (ctx.state === 'running') heard = true; changed(); };
      BUF = makeBuffers();
      CURVE = new Float32Array(1025);
      for (let i = 0; i < 1025; i++) CURVE[i] = Math.tanh((i / 512 - 1) * 3);
      const re = new Float32Array(11), im = new Float32Array(11);
      for (let k = 1; k <= 10; k++) re[k] = Math.pow(0.82, k); // narrow pulses, one per firing
      PULSE = ctx.createPeriodicWave(re, im);

      bus = ctx.createGain(); bus.gain.value = 0.8;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
      master = ctx.createGain(); master.gain.value = 0;
      bus.connect(comp); comp.connect(master); master.connect(ctx.destination);
      // shared open-air reverb, fed by per-source sends
      revIn = ctx.createGain();
      const conv = ctx.createConvolver(); conv.buffer = makeIR();
      const revOut = ctx.createGain(); revOut.gain.value = 0.55;
      revIn.connect(conv); conv.connect(revOut); revOut.connect(comp);
      // cockpit bed: road rumble and wind, scaled by the followed car's speed
      const n = ctx.createBufferSource(); n.buffer = BUF.white; n.loop = true;
      const road = ctx.createBiquadFilter(); road.type = 'lowpass'; road.frequency.value = 240; road.Q.value = 0.6;
      const wind = ctx.createBiquadFilter(); wind.type = 'bandpass'; wind.frequency.value = 900; wind.Q.value = 0.5;
      bed = { road: ctx.createGain(), wind: ctx.createGain() };
      bed.road.gain.value = 0; bed.wind.gain.value = 0;
      n.connect(road); road.connect(bed.road); bed.road.connect(bus);
      n.connect(wind); wind.connect(bed.wind); bed.wind.connect(bus);
      n.start();

      loadWorklet().then((how) => { via = how; engine = how ? 'worklet' : 'native'; }, () => { engine = 'native'; });
      // build the one-shot sounds in the background so the first crash or cheer does not stall a frame
      const warm = [() => material('crowd', makeCrowd), () => material('impact1', () => makeImpact(1)), () => material('impact2', () => makeImpact(2)),
        () => material('impact0', () => makeImpact(0)), () => material('firework', makeFirework)];
      const next = () => { const f = warm.shift(); if (f) { f(); setTimeout(next, 120); } };
      setTimeout(next, 400);
      document.addEventListener('visibilitychange', hold);
      return true;
    }

    // ---------- one car ----------
    function createVoice(car) {
      const p = engineOf(car), t = ctx.currentTime;
      const v = { car, p, nodes: [], srcs: [], load: 0.5, hi: 0, boost: 0, gear: car.gear, bovT: 0, wob: Math.random() * 6 };
      const node = (n) => { v.nodes.push(n); return n; };
      const src = (n) => { v.srcs.push(n); return node(n); };
      const gain = (val) => { const g = node(ctx.createGain()); g.gain.value = val; return g; };
      const filt = (type, f, q, db) => {
        const b = node(ctx.createBiquadFilter()); b.type = type; b.frequency.value = f;
        if (q != null) b.Q.value = q;
        if (db != null) b.gain.value = db;
        return b;
      };
      v.gain = gain; v.filt = filt; v.src = src; v.node = node;

      // output: air absorption → stereo position → level → mix, with a send to the reverb
      v.vol = gain(0); v.vol.connect(bus);
      v.send = gain(0); v.vol.connect(v.send); v.send.connect(revIn);
      v.pan = node(ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain()); v.pan.connect(v.vol);
      v.air = filt('lowpass', 16000, 0.5); v.air.connect(v.pan);

      // tyres: a squeal in two narrow bands, and rumble plus grit when off the track
      const tn = src(ctx.createBufferSource()); tn.buffer = BUF.white; tn.loop = true;
      v.sqG = gain(0); v.sqG.connect(v.air);
      v.sq1 = filt('bandpass', 1500, 8); v.sq2 = filt('bandpass', 3100, 6);
      const sq2G = gain(0.5);
      tn.connect(v.sq1); v.sq1.connect(v.sqG); tn.connect(v.sq2); v.sq2.connect(sq2G); sq2G.connect(v.sqG);
      v.rumG = gain(0); v.rumG.connect(v.air);
      const rl = filt('lowpass', 220, 0.7), gr = filt('bandpass', 2600, 0.8), grG = gain(0.25);
      tn.connect(rl); rl.connect(v.rumG); tn.connect(gr); gr.connect(grG); grG.connect(v.rumG);

      if (engine === 'worklet') {
        try { workletEngine(v); } catch (e) { engine = 'native'; }
      }
      if (!v.wk) nativeEngine(v);
      v.srcs.forEach((s) => (s.buffer ? s.start(t, Math.random() * (s.buffer.duration - 0.1)) : s.start(t)));
      return v;
    }

    function workletEngine(v) {
      const n = new AudioWorkletNode(ctx, 'nr-engine', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1], processorOptions: engineConfig(v.car) });
      v.nodes.push(n); v.wk = n; v.P = {};
      ['rpm', 'load', 'dop', 'rear', 'inside', 'speed', 'on'].forEach((k) => { v.P[k] = n.parameters.get(k); });
      v.P.rpm.value = v.p.red * Math.max(0.13, v.car.rpm || 0);
      v.P.on.value = v.car.out ? 0 : 1;
      n.connect(v.air);
    }

    // The fallback engine: harmonic wave, pulse-gated noise, drive and resonances from standard nodes.
    function nativeEngine(v) {
      const { gain, filt, src, node, car, p } = v;
      v.eng = gain(1); v.eng.connect(v.air);
      v.cut = gain(1); v.cut.connect(v.eng);
      v.sum = gain(0.5); v.sum.connect(v.cut);
      v.lp = filt('lowpass', 3000, 0.7); v.lp.connect(v.sum);
      let into = v.lp;
      const tune = 0.96 + 0.08 * (((car.num * 37) % 10) / 10); // sister cars sound slightly different
      p.res.forEach(([f, db, q]) => { const pk = filt('peaking', f * tune, q, db); pk.connect(into); into = pk; });
      const shaper = node(ctx.createWaveShaper()); shaper.curve = CURVE; shaper.oversample = '2x'; shaper.connect(into);
      v.pre = gain(0.4); v.pre.connect(shaper);
      v.exG = gain(1); v.exG.connect(v.pre);
      v.osc = src(ctx.createOscillator()); v.osc.setPeriodicWave(waveOf(p)); v.osc.connect(v.exG);
      // combustion roughness: noise gated by the firing pulses
      v.nG = gain(0); v.nG.connect(v.pre);
      v.nbp = filt('bandpass', 1200, 0.7); v.nbp.connect(v.nG);
      const nz = src(ctx.createBufferSource()); nz.buffer = BUF.white; nz.loop = true; nz.connect(v.nbp);
      v.am = src(ctx.createOscillator()); v.am.setPeriodicWave(PULSE);
      v.amD = gain(0.3); v.am.connect(v.amD); v.amD.connect(v.nG.gain);
      // cycle-to-cycle wander in pitch and level
      const jit = src(ctx.createBufferSource()); jit.buffer = BUF.slow; jit.loop = true;
      const jDet = gain(9); jit.connect(jDet); jDet.connect(v.osc.detune); jDet.connect(v.am.detune);
      const jAmp = gain(0.1); jit.connect(jAmp); jAmp.connect(v.exG.gain);
      if (p.turbo) {
        v.tG = gain(0); v.tG.connect(v.sum);
        v.tOsc = src(ctx.createOscillator()); v.tOsc.frequency.value = 3000; v.tOsc.connect(v.tG);
      }
      // straight-cut gearbox whine, only heard from the cockpit
      v.wG = gain(0); v.wG.connect(v.sum);
      v.wOsc = src(ctx.createOscillator()); v.wOsc.type = 'triangle'; v.wOsc.frequency.value = 1000; v.wOsc.connect(v.wG);
      const f0 = (p.red * Math.max(0.13, car.rpm || 0)) / 120;
      v.osc.frequency.value = f0; v.am.frequency.value = f0 * p.cyl;
    }

    function release(v) {
      const t = ctx.currentTime;
      v.vol.gain.setTargetAtTime(0, t, 0.05);
      v.send.gain.setTargetAtTime(0, t, 0.05);
      v.srcs.forEach((s) => s.stop(t + 0.35));
      setTimeout(() => {
        if (v.wk) v.wk.port.postMessage('stop');
        v.nodes.forEach((n) => n.disconnect());
      }, 600);
    }

    function playIn(v, buffer, t, amp, rate) {
      const s = ctx.createBufferSource(), g = ctx.createGain();
      s.buffer = buffer; s.playbackRate.value = rate; g.gain.value = amp;
      s.connect(g); g.connect(v.air);
      s.onended = () => g.disconnect();
      s.start(t);
    }
    const pop = (v, t, amp) => playIn(v, BUF.pops[(Math.random() * BUF.pops.length) | 0], t, amp * 0.6, 0.75 + Math.random() * 0.6);

    // sequential gearbox on the fallback synth: ignition cut for a few hundredths on every upshift
    function shiftCut(v, t) {
      const g = v.cut.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(1, t);
      g.linearRampToValueAtTime(0.25, t + 0.012);
      g.setValueAtTime(0.25, t + 0.045);
      g.linearRampToValueAtTime(1, t + 0.085);
    }

    function drive(v, dt, t) {
      const c = v.car, p = v.p, a = aud.get(c);
      // throttle: the race model's own when it has one, otherwise read from acceleration plus drag at speed
      const want = c.throttle != null ? clamp(c.throttle, 0, 1)
        : c.accel < -2.5 ? 0 : clamp(0.22 + c.accel * 0.09 + Math.pow(c.v / 80, 3) * 0.65, 0, 1);
      v.load += (want - v.load) * Math.min(1, dt * (want > v.load ? 12 : 18));
      const L = v.load, on = c.out ? 0 : 1;
      let rf = Math.max(0.13, c.rpm || 0);
      if (c.air) rf = Math.min(1.02, rf * 1.05); // wheels spin up over the crests

      const up = c.gear > v.gear, down = c.gear < v.gear, shifted = up || down;
      v.gear = c.gear;

      v.air.frequency.setTargetAtTime(a.air, t, 0.05);
      if (v.pan.pan) v.pan.pan.setTargetAtTime(a.pan, t, 0.05);
      v.vol.gain.setTargetAtTime(a.g, t, 0.05);
      v.send.gain.setTargetAtTime(a.g * a.wet, t, 0.08);

      // tyres: squeal with slip, metal scrape for a sliding wreck, rumble off the track
      const slip = clamp(c.slip || 0, 0, 1), scrape = c.out && a.spd > 1;
      const squeal = Math.max(slip > 0.02 ? Math.pow(slip, 1.3) * Math.min(1, a.spd / 6) : 0, scrape ? 0.5 * Math.min(1, a.spd / 12) : 0);
      v.wob += dt * (5 + slip * 4);
      const fq = (scrape && slip < 0.2 ? 900 : 1350 + 450 * slip) * (1 + 0.06 * Math.sin(v.wob) + 0.03 * Math.sin(v.wob * 2.7)) * a.dop;
      v.sq1.frequency.setTargetAtTime(fq, t, 0.03);
      v.sq2.frequency.setTargetAtTime(fq * 2.07, t, 0.03);
      v.sqG.gain.setTargetAtTime(squeal * 3.2, t, 0.04);
      v.rumG.gain.setTargetAtTime(c.offroad ? 1.6 * Math.min(1, a.spd / 25) : 0, t, 0.08);

      if (v.wk) {
        if (on && up) v.wk.port.postMessage('shift');
        else if (on && down) v.wk.port.postMessage('blip');
        const P = v.P;
        P.rpm.setTargetAtTime(p.red * rf, t, shifted ? 0.012 : 0.035);
        P.load.setTargetAtTime(L, t, 0.03);
        P.dop.setTargetAtTime(a.dop, t, 0.05);
        P.rear.setTargetAtTime(a.rear, t, 0.08);
        P.inside.setTargetAtTime(a.inside ? 1 : 0, t, 0.05);
        P.speed.setTargetAtTime(Math.min(200, c.v || 0), t, 0.05);
        P.on.setTargetAtTime(on, t, 0.25);
        return;
      }

      if (up) shiftCut(v, t);
      else if (down && on) {
        const n = Math.round(Math.random() * 2 * p.pops + 0.3);
        for (let i = 0; i < n; i++) pop(v, t + 0.03 + i * (0.04 + Math.random() * 0.05), 0.5);
      }
      const f0 = ((p.red * rf) / 120) * a.dop;
      v.eng.gain.setTargetAtTime(on * (0.75 + 0.25 * a.rear), t, on ? 0.08 : 0.25);
      v.osc.frequency.setTargetAtTime(f0, t, shifted ? 0.012 : 0.035);
      v.am.frequency.setTargetAtTime(f0 * p.cyl, t, shifted ? 0.012 : 0.035);
      v.nbp.frequency.setTargetAtTime(clamp(f0 * p.cyl * 2.6, 300, 5000), t, 0.05);
      v.pre.gain.setTargetAtTime(0.22 + 0.2 * p.grit * L * (0.6 + 0.4 * rf), t, 0.03);
      v.exG.gain.setTargetAtTime(0.55 + 0.45 * L, t, 0.03);
      v.nG.gain.setTargetAtTime(0.04 + 0.1 * L, t, 0.03);
      v.amD.gain.setTargetAtTime(0.12 + 0.4 * L, t, 0.03);
      v.lp.frequency.setTargetAtTime((1100 + 5400 * L) * (0.55 + 0.45 * rf) * p.bright * (a.inside ? 0.6 : 0.6 + 0.4 * a.rear), t, 0.04);
      if (on && L < 0.12 && rf > 0.5 && Math.random() < p.pops * 5 * dt) pop(v, t + Math.random() * 0.02, 0.2 + Math.random() * 0.5);
      if (v.tOsc) {
        const bt = L > 0.45 ? L * rf : 0;
        v.boost += (bt - v.boost) * Math.min(1, dt * (bt > v.boost ? 2.2 : 7));
        v.hi = Math.max(L, v.hi - dt * 1.5);
        if (on && L < 0.2 && v.hi > 0.55 && v.boost > 0.35 && t > v.bovT) {
          playIn(v, BUF.flutter, t, 0.35 * p.turbo * v.boost, 0.9 + Math.random() * 0.2);
          v.bovT = t + 1.2; v.hi = 0;
        }
        v.tOsc.frequency.setTargetAtTime((2300 + 6200 * v.boost) * a.dop, t, 0.05);
        v.tG.gain.setTargetAtTime(0.05 * p.turbo * v.boost * v.boost * (a.inside ? 1.3 : 1), t, 0.05);
      }
      v.wOsc.frequency.setTargetAtTime(Math.max(60, c.v * 34) * a.dop, t, 0.05);
      v.wG.gain.setTargetAtTime(a.inside ? 0.01 + 0.025 * Math.min(1, c.v / 70) : 0, t, 0.08);
    }

    // ---------- the mix for the current camera ----------
    const camPos = new THREE.Vector3(), camPrev = new THREE.Vector3(), camVel = new THREE.Vector3();
    const right = new THREE.Vector3(), q = new THREE.Quaternion(), dir = new THREE.Vector3(), rel = new THREE.Vector3();
    const lis = { pos: new THREE.Vector3(), right: new THREE.Vector3(1, 0, 0), cabin: false, wet: 0.2, ok: false };
    let havePrev = false;
    const score = (c) => { const a = aud.get(c); return a.g * (voices.has(c) ? 1.5 : 1) * (a.key ? 100 : 1); };

    // o: { camera, mode, air, focus, paused, speed }; modes other than air, cabin and spectator
    // (replay, ceremony) get the helicopter mix with the followed car always heard.
    function update(dt, o) {
      dt = Math.max(0, dt);
      o.camera.getWorldPosition(camPos);
      if (havePrev && dt > 0) {
        if (camPos.distanceTo(camPrev) > 40) camVel.set(0, 0, 0); // camera cut, not movement
        else { rel.subVectors(camPos, camPrev).divideScalar(dt); camVel.lerp(rel, Math.min(1, dt * 8)); }
      }
      camPrev.copy(camPos); havePrev = true;
      if (!!o.paused !== held) { held = !!o.paused; hold(); changed(); }
      if (!live()) return;
      const t = ctx.currentTime;
      master.gain.setTargetAtTime(enabled && !o.paused ? 0.9 : 0, t, 0.08);
      right.set(1, 0, 0).applyQuaternion(o.camera.getWorldQuaternion(q));
      const cabin = o.mode === 'cabin', blimp = o.mode === 'air' && o.air === 'blimp', spect = o.mode === 'spectator';
      const ref = cabin ? 7 : spect ? 13 : blimp ? 380 : 24; // distance at full level
      const outside = cabin ? 0.5 : blimp ? 0.8 : 1;
      const wet = cabin ? 0.05 : spect ? 0.3 : blimp ? 0.4 : 0.2;
      lis.pos.copy(camPos); lis.right.copy(right); lis.cabin = cabin; lis.wet = wet; lis.ok = true;
      if (o.paused) return;

      const fleet = race.audible || race.cars; // the race cars plus the safety car
      for (const c of fleet) {
        const a = aud.get(c) || {};
        aud.set(c, a);
        if (c.hidden) { a.g = 0; a.key = false; continue; }
        a.inside = cabin && c.idx === o.focus;
        a.key = c.idx === o.focus && !spect && !blimp; // the followed car always gets a voice
        dir.copy(c.world).addScaledVector(c.up, 0.45).sub(camPos);
        const d = Math.max(0.5, dir.length());
        dir.divideScalar(d);
        if (c.vel) rel.copy(c.vel); else rel.copy(c.fwd).multiplyScalar(c.v);
        a.spd = rel.length();
        rel.multiplyScalar(o.speed).sub(camVel);
        a.dop = a.inside ? 1 : 343 / (343 + clamp(rel.dot(dir), -120, 120)); // Doppler shift
        a.pan = a.inside ? 0 : clamp(dir.dot(right), -1, 1) * 0.75;
        a.rear = a.inside ? 1 : 0.5 + 0.5 * c.fwd.dot(dir); // 1 when the exhaust points at the listener
        const audible = !c.out || a.spd > 1;
        a.g = audible ? (a.inside ? 0.85 : Math.min(1.4, ref / d) * outside) * engineOf(c).vol : 0;
        a.air = a.inside ? 9000 : clamp(16000 * Math.exp(-d / 260), 450, 16000) * (cabin ? 0.4 : 1);
        a.wet = a.inside ? 0.015 : wet * clamp(Math.sqrt(d / ref), 0.6, 2.5);
      }
      if (engine !== 'loading') {
        const ranked = fleet.slice().sort((x, y) => score(y) - score(x));
        const keep = new Set(ranked.slice(0, MAXV).filter((c) => aud.get(c).g > 0.004));
        for (const [c, v] of voices) if (!keep.has(c)) { release(v); voices.delete(c); }
        for (const c of keep) if (!voices.has(c)) voices.set(c, createVoice(c));
        for (const v of voices.values()) drive(v, dt, t);
      }

      // cockpit road rumble and wind
      const f = race.cars[o.focus];
      const inCar = cabin && f && !f.hidden, sp = inCar ? f.v || 0 : 0;
      bed.road.gain.setTargetAtTime(inCar ? (0.05 + 0.2 * Math.min(1, sp / 70)) * (f.offroad ? 2.2 : 1) : 0, t, 0.1);
      bed.wind.gain.setTargetAtTime(inCar ? 0.25 * Math.pow(sp / 80, 2) : 0, t, 0.1);

      // weather: rain hiss (drumming on the roof in the cockpit), hail clatter, wind with the snow
      if (sky !== 'clear' && !wx) startWeather();
      if (wx) {
        wx.rain.gain.setTargetAtTime(sky === 'rain' ? (cabin ? 0.2 : 0.11) : sky === 'hail' ? 0.05 : 0, t, 0.6);
        wx.lp.frequency.setTargetAtTime(cabin ? 2200 : 6500, t, 0.2);
        wx.hail.gain.setTargetAtTime(sky === 'hail' ? (cabin ? 0.34 : 0.2) : 0, t, 0.5);
        wx.wind.gain.setTargetAtTime(sky === 'snow' ? 0.14 : sky === 'rain' ? 0.04 : 0, t, 0.8);
      }

      // crowd: a murmur by the fences, a roar with swells for the winner
      const now = t;
      const cheer = celebrating ? 0.42 + 0.18 * Math.sin(now * 0.8 + Math.sin(now * 0.31) * 2) : spect ? 0.05 : 0;
      if (cheer > 0 && !crowd) startCrowd();
      if (crowd) { crowd.g.gain.setTargetAtTime(cheer, t, celebrating ? 0.5 : 0.8); crowd.s.gain.setTargetAtTime(cheer * 0.35, t, 0.5); }
    }

    function makeHail() {
      // hundreds of sharp ticks a second, looped
      const sr = ctx.sampleRate, b = ctx.createBuffer(1, sr * 3, sr), d = b.getChannelData(0);
      for (let k = 0; k < 1100; k++) {
        const at = Math.floor(Math.random() * (d.length - 400)), amp = 0.15 + Math.random() * 0.85, f = 2200 + Math.random() * 4500;
        for (let i = 0; i < 360; i++) d[at + i] += amp * Math.sin((2 * Math.PI * f * i) / sr) * Math.exp(-i / (sr * 0.0022));
      }
      let m = 0;
      for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
      for (let i = 0; i < d.length; i++) d[i] /= m || 1;
      return b;
    }
    function startWeather() {
      const n = ctx.createBufferSource(); n.buffer = BUF.white; n.loop = true;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 450;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6500;
      const wl = ctx.createBiquadFilter(); wl.type = 'lowpass'; wl.frequency.value = 380;
      const h = ctx.createBufferSource(); h.buffer = material('hail', makeHail); h.loop = true;
      wx = { rain: ctx.createGain(), wind: ctx.createGain(), hail: ctx.createGain(), lp };
      wx.rain.gain.value = wx.wind.gain.value = wx.hail.gain.value = 0;
      n.connect(hp); hp.connect(lp); lp.connect(wx.rain); wx.rain.connect(bus);
      n.connect(wl); wl.connect(wx.wind); wx.wind.connect(bus);
      h.connect(wx.hail); wx.hail.connect(bus);
      n.start(); h.start();
    }

    function startCrowd() {
      const s = ctx.createBufferSource();
      s.buffer = material('crowd', makeCrowd); s.loop = true;
      const g = ctx.createGain(), sd = ctx.createGain();
      g.gain.value = 0; sd.gain.value = 0;
      s.connect(g); g.connect(bus); s.connect(sd); sd.connect(revIn);
      s.start(ctx.currentTime, Math.random() * 4);
      crowd = { src: s, g, s: sd };
    }

    // A sound from a point in the world: level, stereo side, air and travel time from the last listener.
    // `lead` is how far into the buffer the main hit sits, so that hit lands when the sound arrives.
    function playAt(buffer, pos, ref, amp, rate, lead) {
      if (!lis.ok) return;
      const t = ctx.currentTime;
      dir.copy(pos).sub(lis.pos);
      const d = Math.max(1, dir.length());
      dir.divideScalar(d);
      const g = Math.min(1.6, ref / d) * amp;
      if (g < 0.002) return;
      const s = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), gn = ctx.createGain(), sd = ctx.createGain();
      const pn = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
      s.buffer = buffer; s.playbackRate.value = rate;
      lp.type = 'lowpass'; lp.frequency.value = clamp(16000 * Math.exp(-d / 260), 450, 16000) * (lis.cabin && d > 4 ? 0.5 : 1);
      if (pn.pan) pn.pan.value = clamp(dir.dot(lis.right), -1, 1) * 0.75;
      gn.gain.value = g; sd.gain.value = g * lis.wet * clamp(Math.sqrt(d / 15), 0.6, 2.5);
      s.connect(lp); lp.connect(pn); pn.connect(gn); gn.connect(bus); gn.connect(sd); sd.connect(revIn);
      const start = t + Math.min(3, d / 343) - lead / rate; // sound takes time to arrive
      if (start >= t) s.start(start); else s.start(t, (t - start) * rate);
      s.onended = () => [s, lp, pn, gn, sd].forEach((n) => n.disconnect());
    }

    // crash into a barrier or another car; strength 0..1 sets size and loudness
    function impact(pos, strength) {
      if (!live() || !pos) return;
      const s = clamp(strength == null ? 0.6 : strength, 0, 1), size = s > 0.66 ? 2 : s > 0.3 ? 1 : 0;
      playAt(material('impact' + size, () => makeImpact(size)), pos, 16 * (0.5 + 0.8 * s), 0.45 + 0.75 * s, 1.1 - 0.2 * s + Math.random() * 0.08, 0);
    }
    function firework(pos) {
      if (!live() || !pos) return;
      playAt(material('firework', makeFirework), pos, 90, 0.9, 0.9 + Math.random() * 0.25, 0.4);
    }
    // Crowd roar for the winner. The flag is kept while sound is off, so a later unmute picks it up.
    function celebrate(on) {
      celebrating = !!on;
      if (!live()) return;
      if (celebrating && !crowd) startCrowd();
      if (celebrating) crowd.g.gain.setTargetAtTime(0.6, ctx.currentTime, 0.3);
    }

    // Browsers only start sound after a click or key press, so this runs from those events.
    function unlock() {
      if (!enabled) return;
      if (!ctx && !init()) return;
      hold();
    }
    // Never creates the audio context itself, so it is safe to call outside a click or key press.
    function setEnabled(on) {
      enabled = on;
      if (on && ctx) unlock();
      else hold();
      changed();
    }
    // 'off', 'waiting' (on, but the browser has not allowed sound yet) or 'on' (held while paused counts as on)
    function status() { return !enabled ? 'off' : live() || (heard && !wanted()) ? 'on' : 'waiting'; }

    Object.assign(api, {
      update, unlock, setEnabled, status, impact, firework, celebrate,
      weather: (kind) => { sky = kind; },
      debug: () => ({ ctx, master, voices, engine, via }),
    });
    // a live getter (Object.assign would only copy its current value)
    Object.defineProperty(api, 'enabled', { get: () => enabled });
    return api;
  }

  NR.ENGINES = ENGINES;
  NR.engineOf = engineOf;
  NR.engineConfig = engineConfig;
  NR.createAudio = createAudio;
})();
