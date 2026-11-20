# Sprite generator

Renders the hero sprite sheets in `assets/heroes/sheets/` from small 3D models.

```bash
cd tools/sprite-gen
mkdir -p sheets
node render_sheets.js            # all heroes, all animations (~2 min)
HERO_SCALE=0.86 node render_sheets.js   # same, heroes drawn at 86% size (feet stay on the anchor)
node render_sheets.js necromancer attack   # one hero, one animation
```

Output goes to `tools/sprite-gen/sheets/`; copy the PNGs into `assets/heroes/sheets/`.

- `render.js` - pixel-art SDF renderer
- `heroes.js`, `heroes2.js` - hero models
- `rig.js` - rig and pose helpers
- `anims.js` - animations (`H.ANIMS.<hero>.anims`)

## Enemies and props

```bash
node render_foes.js              # every enemy in H.FOE_ART -> assets/foes/ (+ foes.json)
node render_foes.js wolf,golem   # just these
node render_props.js             # dummy, tents, well, bounty board, lamp, brazier -> assets/props/ (+ props.json)
```

- `foes.js` - enemy and minion models and animations (`H.FOE_ART`)
- `props.js` - static town and camp props (`H.PROP_ART`); each one is rendered once, cropped, with its ground anchor and light points in `props.json`
