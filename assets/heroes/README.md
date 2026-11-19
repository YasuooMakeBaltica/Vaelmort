# Pixel Realm — Hero Sprites (v1)

Six playable classes for an isometric pixel-art ARPG/MMO, each with **idle**, **run** and **attack** animations in **8 directions**.

## Files

```
heroes.json            frame size, anchor, direction order, fps, loop flags, file paths
sheets/<hero>_<anim>.png
(generator lives in tools/sprite-gen/ -- only needed to make new art; see "Regenerating")
```

Heroes: `doomknight`, `necromancer`, `warlord`, `assassin`, `hunter` (Witch Hunter), `druid`
Animations: `idle` (loops), `run` (loops), `attack` (plays once)

## Sheet layout

- Each frame is **96×96 px**. Background is transparent.
- **Columns = frames**, left to right.
- **Rows = facing direction**, top to bottom: `S, SE, E, NE, N, NW, W, SW`.
  `S` faces the camera (bottom of the screen), `E` faces screen-right, `N` faces away.
- **Anchor: (48, 77)**, the ground point under the character. Draw a frame at `(worldX − 48, worldY − 77)` so the feet land on the entity position.
- Frame rates and frame counts are in `heroes.json`. Idle runs at 6–8 fps, run at 12–14, attacks at 12–14.

| Hero | idle | run | attack |
|---|---|---|---|
| Doom Knight | 6 | 8 | 8 |
| Necromancer | 8 | 8 | 8 |
| Warlord | 6 | 8 | 8 |
| Assassin | 6 | 8 | 7 |
| Witch Hunter | 6 | 8 | 7 |
| Druid | 8 | 8 | 8 |

## Using them in the game

- **Rendering:** integer scaling only (2× on phones, 3–4× on desktop), with `imageSmoothingEnabled = false` / `image-rendering: pixelated`.
- **Direction from movement:** take the screen-space velocity `(dx, dy)` (y down) and compute
  `a = atan2(dy, dx)`. Then `idx = round(a / (π/4))`, which maps E=0, SE=1, S=2, SW=3, W=±4, NW=−3, N=−2, NE=−1. Convert that to the row order above.
- **Shadows** are not baked in. Draw a dark ellipse (about 22×8 px at 1×, 35% black) centered on the anchor before the sprite.
- **Depth sorting:** sort entities by their world/feet Y.
- **Attack effects** are baked into the attack frames: smears, the impact ring, and the Necromancer's and Hunter's projectiles while they're near the hero. Real gameplay projectiles should be spawned by the game. Treat the in-frame ones as muzzle flash. Suggested hit frames: Doom Knight 5, Necromancer 4 (release), Warlord 5, Assassin 2 and 4, Hunter 2 (release), Druid 4.
- **Signature glow colors** (for UI, particles and nameplates) are in `heroes.json`.
- **Camera:** sprites are rendered from 30° elevation, matching a standard 2:1 isometric tile grid (Vaelmort uses 96×48 floor diamonds). Heroes are about 47–56 px tall at 1× (rendered with `HERO_SCALE=0.86`).

## Regenerating / adding art

The sprites are rendered from small 3D models (`tools/sprite-gen/heroes*.js`), posed by `tools/sprite-gen/anims.js`, by a pixel-art renderer (`tools/sprite-gen/render.js`). To re-render every sheet:

```bash
cd tools/sprite-gen && mkdir -p sheets && node render_sheets.js   # writes sheets/*.png (~2 min); copy them into assets/heroes/sheets/
```

To add an animation, add an entry under `H.ANIMS.<hero>.anims` in `anims.js` with `n`, `fps` and `pose(frame)`.
