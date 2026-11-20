# Sound effects

`build.js` layers, trims and pitches recorded clips into the game's effects (`assets/sfx/<name>_<n>.mp3` + `sfx.json`).
Every source is **CC0** (public domain) from opengameart.org:

| Folder in `src/` | Pack |
|---|---|
| `rpg/` | [RPG Sound Pack](https://opengameart.org/content/rpg-sound-pack) by artisticdude |
| `ken/` | [50 RPG sound effects](https://opengameart.org/content/50-rpg-sound-effects) by Kenney |
| `r80/` | [80 CC0 RPG SFX](https://opengameart.org/content/80-cc0-rpg-sfx) by rubberduck |
| `bang/` | [25 CC0 bang / firework SFX](https://opengameart.org/content/25-cc0-bang-firework-sfx) by rubberduck |
| `one/` | [Cure magic](https://opengameart.org/content/cure-magic), [Freeze spell](https://opengameart.org/content/freeze-spell-0), [Earth element spell](https://opengameart.org/content/earth-element-magic-spell), [Energy drain](https://opengameart.org/content/energy-drain), [Ghost breath](https://opengameart.org/content/ghost-breath) |

The source clips are not committed (`src/` is git-ignored). Download the packs, put the files named in `build.js` into those folders, then:

```bash
node build.js            # everything
node build.js swing,hit  # just these
```

Needs ffmpeg with libmp3lame.
