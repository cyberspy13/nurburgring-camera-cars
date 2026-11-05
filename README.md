# Camera Cars on a Nürburgring Track

A live 3D race of twelve GT3 cars, plus Parkroyal Community School's open-top bus, round a compact Nürburgring Nordschleife, running in the browser. Watch it from a helicopter, a blimp, a banner plane, the driver's seat or the trackside grandstands, or pick a car and race it yourself.

**Play it:** https://cyberspy13.github.io/nurburgring-camera-cars/

## What's in it

- **12 GT3 cars**: McLaren, BMW, Mercedes-AMG, Audi, Aston Martin, Porsche, Ferrari, Lamborghini, Corvette and Ford, each with its own engine sound and a body shaped after the real car: its silhouette, grille and lights, flared wheel arches, swan-neck rear wing, and centre-lock wheels with brake calipers. Six wear colour schemes copied from real race cars: the #9 and #73 Mercedes-AMG GT3s, the #24 Corvette Z06 GT3.R, the #007 Aston Martin Vantage, the #22 BMW M4 and a Gulf-coloured Ford GT. Every car carries its number on the bonnet, doors and roof.
- **A guest bus**: #13, a red open-top double-decker in Parkroyal Community School colours, with the school's crest and name on its sides and back. Sixteen pupils in red jumpers ride on the top deck, waving at the crowds and cheering whenever it overtakes. It flies a PR 4ML flag from its back rail (the same registration is on its plates), and some fans in the crowd wave "Come on Parkroyal bus" flags. It has a turbo-diesel straight-six, races a little off the GT3s' pace, and can be followed from every camera, including the driver's seat. With pupils on board it never crashes: a knock from another car only rocks it.
- **Parkroyal Community School**: a red-brick Victorian school beside the track after Breidscheid, with its row of gables and tall chimneys, a newer extension with the school's name in red, and a green all-weather pitch behind spear-top railings. Its pupils line the railings and go wild when the bus goes by. It's also one of the spectator stands.
- **Banner planes**: a red plane towing COME ON PARKROYAL BUS and a white and blue one towing HELLO MACCLESFIELD circle low over whatever you're watching, so the banners keep crossing the view. At night their navigation lights come on and the banners stay lit.
- **Swimming pools**: four pools beside the track, with people swimming laps, floating on rubber rings, sitting on the edge and standing in the water to wave at the cars.
- **Cows and sheep**: five fenced fields beside the track. The cows (black-and-white and brown) and the sheep (with a black sheep in every flock) graze, wander, lie down (more of them at night) and lift their heads to watch the cars go by, with calves and lambs at their mothers' sides. Now and then you hear a moo or a baa. There's a farm at Metzgesfeld with a farmhouse, a red barn, hay bales and a tractor.
- **Snowy mountains** all round the horizon, hazy in the distance, dark against the stars at night, and hidden by heavy rain and snow.
- **A 17-lap race**: shuffled grid, slipstreaming and overtaking, tyre wear, lap times and a live timing tower.
- **Pit stops**: every car makes one compulsory stop between laps 5 and 11, or earlier when a safety car comes out. It's a GT3 endurance stop of about 35 seconds. A ten-strong crew in team colours jacks the car up, refuels it with a fire marshal standing by, swaps the drivers, and changes all four tyres once the fuel is in, repairing any lost wing on the way. The lollipop man holds the car until the 60 km/h pit lane is clear. When the car you're following stops, the helicopter and cabin views cut to a TV camera on the pit wall.
- **Crashes**: spins, trips across the grass and barrier hits with sparks and flying bodywork. Cars may rejoin or retire. Yellow flags go out, and a **safety car** comes out for serious incidents.
- **Replays**: broadcast-style crash replays with slow motion.
- **Weather and time of day**: clear, rain, snow or hail, by day or night. Each changes grip, so wet or snowy races have more incidents.
- **Winner celebration**: chequered flag, fireworks, doughnuts in front of a cheering grandstand, and a full results table.
- **Drive mode**: choose any of the 13 cars, including the bus (a little slower), and race it from the back of a standing grid over a quick 5 laps or the full 17. Rivals can be easy, normal or hard. Take a corner too fast and you run wide; a crash spins you round and the car gets going again. There are no pit stops or safety car in drive mode. Exit goes back to watching.
- **Sound**: each engine is modelled cylinder by cylinder in the browser, with no sound files. There are also tyre, crash, crowd and weather sounds.

## Controls

| Key | Action |
| --- | --- |
| `1` `2` `3` | Air, cabin or spectator camera |
| `←` `→` | Switch car (or stand, in spectator view) |
| `B` | Helicopter, blimp or banner plane |
| `W` / `N` | Cycle the weather / day or night |
| `R` | Replay the last incident |
| `P` or `Space` | Pause |
| `M` | Sound on or off (sound starts after your first tap, click or key press) |
| `H` | Hide the overlay |
| `D` | Drive a car |

While driving:

| Key | Action |
| --- | --- |
| `↑` or `W` | Gas |
| `↓` or `S` | Brake |
| `←` `→` or `A` `D` | Steer |
| `C` | Chase camera or driver's seat |
| `P` | Pause |

You can also use the on-screen buttons. Weather, day/night, pause, race speed (up to 16×) and replays sit under the circuit map. Scroll to zoom the air cameras; drag to orbit the blimp. The plane camera flies alongside the banner planes.

**On an iPhone or iPad** everything is a tap. To drive, tap **Drive** and tilt the device like a steering wheel (or choose the steering buttons), with Gas and Brake pedals on the screen; **Centre** sets the way you're holding it as straight ahead. Otherwise pinch the 3D view to zoom the air cameras and drag one finger to orbit the blimp. On a phone the controls sit above the map, the weather buttons open from the cloud button, and the standings open from **Standings**. Turn the phone on its side for the widest view. In Safari, Share › Add to Home Screen runs it full screen. With the iPhone's silent switch on, iOS mutes the engine sound.

## Running it locally

There's no build step. Open `index.html` in Chrome, Edge or Firefox. You need an internet connection to load three.js and the fonts.

## Files

| File | What it does |
| --- | --- |
| `index.html` | The page, its layout and styles |
| `js/world.js` | Textures, sky, terrain, mountains, road, kerbs, barriers and the pit lane |
| `js/track.js` | The circuit layout, speed profile, racing line and pit lane layout |
| `js/scenery.js` | Grandstand, pit building, sponsor bridge, spectators, forests, village and castle |
| `js/school.js` | Parkroyal Community School, its pitch and its pupils |
| `js/pools.js` | The swimming pools and their swimmers |
| `js/farm.js` | The fields, the cows and sheep, and the farm |
| `js/models.js` | Car, bus and cockpit models: bodies, liveries, lights, wings and wheels |
| `js/cars.js` | The field of cars, race simulation, pit stops, crashes, safety car, celebration and the handling of the car you drive |
| `js/pits.js` | The pit crews and their kit: garage boards, box markings, fuel rigs, and each stop acted out |
| `js/fx.js` | Smoke, spray, sparks, debris, fireworks and confetti |
| `js/replay.js` | Recording and crash replays |
| `js/cameras.js` | Helicopter, blimp, banner plane, cabin, spectator and podium cameras |
| `js/weather.js` | Weather, night lighting and headlights |
| `js/planes.js` | The two banner planes and their flight |
| `js/audio.js`, `js/engine-worklet.js` | Engine and effect sounds, and the moos and baas |
| `js/main.js` | Start-up, interface, drive mode (car choice, pedals, tilt steering) and the main loop |

Built with [three.js](https://threejs.org/) r128. The circuit is a shortened, stylised take on the Nordschleife, and the car liveries are colour schemes only. Six follow real race cars, but none carries manufacturer or sponsor logos. The Qatar Airways bridge over the start/finish line is decoration, not a real sponsorship.
