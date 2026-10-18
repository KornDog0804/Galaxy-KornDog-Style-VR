# Brandi's Universe

A 360° space scene with a STARSET player. Works on desktop, phone, and Quest (WebXR).

- `index.html` — the live page (A-Frame 1.5, single file)
- `index-classic.html` — the previous version, kept for reference
- `index-cosmic-v2.html` — the earlier VR-rig prototype
- `img/` — Quest-sized (4096×2048 WebP) skies and the meteor sprite; the page only loads these

## VR controls
| Input | Action |
|---|---|
| Left stick | Move |
| Right stick left/right | Snap turn (30°) |
| Right stick up/down | Fly up / down |
| Y or B | Bring the player panel to you |
| A or X | Play / pause |
| Trigger on the panel | Click buttons, seek bar |

Desktop: Space play/pause · N next · P previous · S shuffle · WASD to move. Add `?panel` to the URL to show the 3D player panel outside VR.

## Notes
- Visuals react to the real audio spectrum when the audio host sends CORS headers. If it doesn't, the page automatically reloads the track without CORS (music always plays) and uses a tempo-based pulse instead.
- The 8K PNG/JPG originals in the repo root are no longer used by `index.html`; they're still used by `index-classic.html` / `index-cosmic-v2.html`.

## Solar system (new)

`solar.js` adds a procedurally-textured solar system around you: the Sun, Mercury, Venus, Earth (continents, clouds, night lights) with the Moon, Mars, Jupiter (Great Red Spot) with Io/Europa/Ganymede/Callisto, Saturn (rings, shadows, Titan), Uranus, Neptune, an asteroid belt, two distant galaxies, comets with particle tails, bolides and shooting stars that kick up on the beat. All textures are baked on the GPU at load (planets pop in one by one); no image files needed.
