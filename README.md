# Camera Cars on a Nürburgring Track

A live 3D race of twelve GT3 cars round a compact Nürburgring Nordschleife, running in the browser. Watch it from a helicopter, a blimp, the driver's seat or the trackside grandstands.

**Play it:** https://cyberspy13.github.io/nurburgring-camera-cars/

## What's in it

- **12 GT3 cars**: McLaren, BMW, Mercedes-AMG, Audi, Aston Martin, Porsche, Ferrari and Lamborghini, each with its own look and engine sound.
- **A 17-lap race**: shuffled grid, slipstreaming and overtaking, tyre wear, lap times and a live timing tower.
- **Crashes**: spins, trips across the grass and barrier hits with sparks and flying bodywork. Cars may rejoin or retire. Yellow flags go out, and a **safety car** comes out for serious incidents.
- **Replays**: broadcast-style crash replays with slow motion.
- **Weather and time of day**: clear, rain, snow or hail, by day or night. Each changes grip, so wet or snowy races have more incidents.
- **Winner celebration**: chequered flag, fireworks, doughnuts in front of a cheering grandstand, and a full results table.
- **Sound**: each engine is modelled cylinder by cylinder in the browser, with no sound files. There are also tyre, crash, crowd and weather sounds.

## Controls

| Key | Action |
| --- | --- |
| `1` `2` `3` | Air, cabin or spectator camera |
| `←` `→` | Switch car (or stand, in spectator view) |
| `B` | Helicopter or blimp |
| `W` / `N` | Cycle the weather / day or night |
| `R` | Replay the last incident |
| `P` or `Space` | Pause |
| `M` | Sound on or off (sound starts after your first click or key press) |
| `H` | Hide the overlay |

You can also use the on-screen buttons. Weather, day/night, pause, race speed (up to 16×) and replays sit under the circuit map. Scroll to zoom the air cameras; drag to orbit the blimp.

## Running it locally

There's no build step. Open `index.html` in Chrome, Edge or Firefox. You need an internet connection to load three.js and the fonts.

## Files

| File | What it does |
| --- | --- |
| `index.html` | The page, its layout and styles |
| `js/world.js` | Textures, sky, terrain, road, kerbs and barriers |
| `js/track.js` | The circuit layout, speed profile and racing line |
| `js/scenery.js` | Grandstand, spectators, forests, village and castle |
| `js/cars.js` | Car models, race simulation, crashes, safety car and celebration |
| `js/fx.js` | Smoke, spray, sparks, debris, fireworks and confetti |
| `js/replay.js` | Recording and crash replays |
| `js/cameras.js` | Helicopter, blimp, cabin, spectator and podium cameras |
| `js/weather.js` | Weather, night lighting and headlights |
| `js/audio.js`, `js/engine-worklet.js` | Engine and effect sounds |
| `js/main.js` | Start-up, interface and the main loop |

Built with [three.js](https://threejs.org/) r128. The circuit is a shortened, stylised take on the Nordschleife, and the car liveries are generic team colours, not official designs.
