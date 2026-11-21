// Vaelmort quests: the main story (The Last Verse) and each zone's side quests, the NPCs who give them,
// and the helpers the client and the server share (availability, progress, rewards).
//
// The story. Before the world had names, the Choir, the old gods, sang it into shape. Then they went quiet and
// sank into the Hush, the chasm beneath everything. Their unsung verses rot down there, and what they touch
// forgets its own song: the Hollowing. Vaelmort's obelisk, the Wardstone, holds the one note still ringing,
// the Last Verse, and it keeps the Hush shut. Aurel, the last Cantor, went down to wake the Choir and came back
// without a voice. He sits in the Sundered Reach now, crowned in nothing: the Hollow King. The Wardstone is cracking.
(function (V) {
  'use strict';

  // ---------- the people who give quests ----------
  // at: [tile dx, dy] from the centre of town, or zone outposts placed by screen angle (ang) and tile radius (r).
  // look: which hero model they wear.
  V.NPCS = {
    ostra: { name: 'Keeper Ostra', title: 'Keeper of the Wardstone', look: 'mage', at: [-2.6, 2.6], color: '#9cf5d2' },
    hesk: { name: 'Ranger Hesk', title: 'Warden of the Wood', look: 'hunter', zone: 1, ang: -Math.PI / 2 - 0.14, r: 26, color: '#a6ec4f', camp: 'Hesk\'s Watch' },
    maudlin: { name: 'Sister Maudlin', title: 'Gravekeeper', look: 'necromancer', zone: 2, ang: 0.14, r: 26, color: '#8fd0c0', camp: 'The Lantern Rest' },
    varro: { name: 'Varro Ashhand', title: 'Last Smith of the Ruins', look: 'doomknight', zone: 3, ang: Math.PI - 0.14, r: 26, color: '#ffb23d', camp: 'Ashhand\'s Anvil' },
    gyle: { name: 'Barrow-Warden Gyle', title: 'Keeper of the Cairns', look: 'warlord', zone: 4, ang: Math.PI / 2 - 0.14, r: 26, color: '#d9c48a', camp: 'Cairnwatch' },
    ilke: { name: 'Wayfinder Ilke', title: 'Guide of the Rime', look: 'druid', zone: 5, ang: -0.8 + 0.16, r: 45, color: '#8fe0ff', camp: 'Ilke\'s Fire' },
    sael: { name: 'Sael the Unsung', title: 'A Hollow Who Kept Its Voice', look: 'assassin', zone: 6, ang: 2.35 - 0.16, r: 45, color: '#d29bff', camp: 'The Quiet Stone' },
  };
  V.npcTile = (id) => {
    const n = V.NPCS[id];
    if (n.at) return [V.C + n.at[0], V.C + n.at[1]];
    const sx = n.r * Math.SQRT2 * Math.cos(n.ang), sy = n.r * Math.SQRT2 * Math.sin(n.ang);
    return [V.C + (sx + sy) / 2, V.C + (sy - sx) / 2];
  };
  V.npcPos = (id) => V.toWorld(...V.npcTile(id));
  V.nearNpc = (id, x, y, pad = 0) => { const [nx, ny] = V.npcPos(id); return V.gdist(x, y, nx, ny) < V.INTERACT + pad; };
  V.OUTPOSTS = Object.keys(V.NPCS).filter((id) => V.NPCS[id].camp); // these get a camp: tent, fire, safety

  // quest items: never in your bags, only counted on the quest
  V.QITEMS = {
    heartwood: 'Hollow Heartwood', pelt: 'Wolf Pelt', graveiron: 'Grave-Iron Shard', charm: 'Barrow Charm', essence: 'Wisp Essence',
    candle: 'Corpse-Candle', core: 'Golem Core', slag: 'Singing Slag', rime: 'Rime-Shard', mote: 'Void Mote', echo: 'Echo-Stone',
  };

  // ---------- quests ----------
  // obj: kill {foes, n} · collect {item, foes, n, ch} · find {z} (discover a dungeon entrance) · reach {boss} (its lair)
  //      boss {foe} · dungeon {z} (clear it, any mode). No objectives = deliver: turn it in to `to`.
  // main: part of the story. lv: its level. gear: reward rarity for a pick-one item (0 = none).
  const Q = (o) => o;
  V.QUESTS = [
    // ===== Prologue and the Mourning Wood (1-35) =====
    Q({ id: 'm1', main: true, npc: 'ostra', lv: 1, title: 'A Note Gone Quiet', where: 'Hollows wander the Mourning Wood, just north of town.',
      text: ['You hear it? No. Few can anymore. The Wardstone holds one note, low and steady, and this week it faltered.', 'When it falters, Hollows come up out of the wood like water through a cracked hull. Thin them. Six will do for a start.'],
      done: ['Good. The note steadied while you were out there. It listens to what we do, I think.'], obj: [{ k: 'kill', foes: ['hollow'], n: 6 }] }),
    Q({ id: 'm2', main: true, npc: 'ostra', to: 'hesk', req: ['m1'], lv: 5, title: 'The Ranger\'s Watch', where: 'Hesk\'s Watch, up the north road into the wood.',
      text: ['Ranger Hesk keeps a fire up the north road. She has been counting Hollows for me longer than you have been alive.', 'Go to her. Tell her the stone faltered. She will know what that means.'],
      done: ['Ostra sent you? Then it faltered. I felt it in the trees before I heard it from anyone.'], obj: [] }),
    Q({ id: 'm3', main: true, npc: 'hesk', req: ['m2'], lv: 9, title: 'Rootsong', gear: 2, where: 'Hollows anywhere in the Mourning Wood.',
      text: ['When a Hollow falls, sometimes a knot of heartwood is left behind, black and warm. It still remembers a little of the song.', 'Bring me six. Ostra can read them like letters.'],
      done: ['Warm, every one. Something below is singing them up again and again. That is worse than I feared.'], obj: [{ k: 'collect', item: 'heartwood', foes: ['hollow'], n: 6, ch: 0.45 }] }),
    Q({ id: 'm4', main: true, npc: 'hesk', req: ['m3'], lv: 18, title: 'Beneath the Root', where: 'Somewhere at the far edge of the Mourning Wood. Look for the oldest tree.',
      text: ['The Hollows come from somewhere. There is a root out at the edge of the wood older than the road, older than the town.', 'It is hollow. Things go in. Find it, but do not go down alone unless you mean to.'],
      done: ['You found it. Then that is where the song is coming up.'], obj: [{ k: 'find', z: 1 }] }),
    Q({ id: 'm5', main: true, npc: 'hesk', to: 'ostra', req: ['m4'], lv: 28, title: 'The Old Wolf', gear: 3, where: 'Old Thornback prowls the deep north of the Mourning Wood.',
      text: ['There is a wolf out there that was old when I was a girl. Thornback. The Hollowing took him and he did not die of it.', 'He guards the deep wood for whatever is singing. Put him down, then tell Ostra. She will want to hear it from you.'],
      done: ['Thornback, at last. Hesk has hunted that wolf for thirty winters.', 'Listen. The note is clearer. But there is more than one wound in the world, and the next one is out on the moor.'], obj: [{ k: 'boss', foe: 'thornback' }] }),
    // Hesk's side quests
    Q({ id: 's1a', npc: 'hesk', req: ['m2'], lv: 6, title: 'Thin the Pack', where: 'Dire Wolves run in the Mourning Wood.',
      text: ['The wolves have gone strange since the Hollows came. They hunt in silence now. Cull eight before they reach the road.'],
      done: ['Quieter. Well, quieter in the right way.'], obj: [{ k: 'kill', foes: ['wolf'], n: 8 }] }),
    Q({ id: 's1b', npc: 'hesk', req: ['m2'], lv: 12, title: 'Pelts for the Watch', where: 'Dire Wolves in the Mourning Wood.',
      text: ['Winter comes early when the stone falters. Bring me five good pelts and the watch will not freeze.'],
      done: ['Thick ones. The cold can come now.'], obj: [{ k: 'collect', item: 'pelt', foes: ['wolf'], n: 5, ch: 0.4 }] }),
    Q({ id: 's1c', npc: 'hesk', to: 'ostra', req: ['m2'], lv: 14, title: 'Word for the Keeper', where: 'Keeper Ostra, beside the Wardstone in Vaelmort Gate.',
      text: ['Take this tally to Ostra. Every Hollow I have counted since the falter. She keeps the numbers; I just make them.'],
      done: ['More than last week. Always more. Thank you for carrying it.'], obj: [] }),
    Q({ id: 's1d', npc: 'hesk', req: ['m4'], lv: 25, title: 'Into the Warrens', gear: 2, where: 'Hollowroot Warrens, the root at the edge of the wood.',
      text: ['Someone has to go down into the Warrens and come back up. Take friends. Clear it and tell me what sings at the bottom.'],
      done: ['You came back. Most do not. Sit by the fire a while.'], obj: [{ k: 'dungeon', z: 1 }] }),

    // ===== The Bleak Moor (22-56) =====
    Q({ id: 'm6', main: true, npc: 'ostra', to: 'gyle', req: ['m5'], lv: 30, title: 'The Barrow Bell', where: 'Cairnwatch, down the south road onto the Bleak Moor.',
      text: ['Out on the moor the dead are buried in barrows, and Gyle keeps the bell that wakes them if they stir.', 'He rang it three nights running. Go and find out why.'],
      done: ['Ostra\'s errand-runner? Good. I have run out of shovels and patience both.'], obj: [] }),
    Q({ id: 'm7', main: true, npc: 'gyle', req: ['m6'], lv: 34, title: 'Bones That Walk', where: 'Skeletons on the Bleak Moor.',
      text: ['The barrows are opening from the inside. The dead walk out with no song in them at all, just habit.', 'Lay ten of them back down. Gently, if you can. Hard, if you cannot.'],
      done: ['Ten. And I will hear ten more tonight. But it buys us the night.'], obj: [{ k: 'kill', foes: ['skeleton'], n: 10 }] }),
    Q({ id: 'm8', main: true, npc: 'gyle', req: ['m7'], lv: 40, title: 'Grave-Iron', gear: 2, where: 'Skeletons and Bone Archers on the Bleak Moor.',
      text: ['The old kings were buried with iron to hold them down. The walkers carry shards of it still.', 'Bring me six shards. I will forge a new lock for the deepest barrow.'],
      done: ['Cold iron, still humming. Something below has been pulling at these for a long time.'], obj: [{ k: 'collect', item: 'graveiron', foes: ['skeleton', 'archer'], n: 6, ch: 0.4 }] }),
    Q({ id: 'm9', main: true, npc: 'gyle', to: 'ostra', req: ['m8'], lv: 48, title: 'The Barrow Deeps', gear: 3, where: 'Somewhere at the far edge of the Bleak Moor, an old mound with a stone door.',
      text: ['The deepest barrow is not on any map I keep. It is out at the edge of the moor, where the grass turns grey.', 'Find its door. Go down. Whatever is calling the dead up is in there.'],
      done: ['The Deeps, cleared. Gyle will sleep tonight for the first time in a month.', 'And I have read your heartwood and his iron. They say the same thing. The song is coming from the drowned graves next.'], obj: [{ k: 'find', z: 4 }, { k: 'dungeon', z: 4 }] }),
    // Gyle's side quests
    Q({ id: 's4a', npc: 'gyle', req: ['m6'], lv: 30, title: 'Broken Bows', where: 'Bone Archers on the Bleak Moor.',
      text: ['The archers do not tire and do not miss twice. Break eight of their bows before they thin my diggers any further.'],
      done: ['Good riddance to the lot of them.'], obj: [{ k: 'kill', foes: ['archer'], n: 8 }] }),
    Q({ id: 's4b', npc: 'gyle', req: ['m6'], lv: 37, title: 'Charms of the Barrow', where: 'Skeletons on the Bleak Moor.',
      text: ['The families left charms with their dead. The walkers still wear them. Bring back five, so I can return them where they belong.'],
      done: ['Each one has a name scratched in it. I will see them home.'], obj: [{ k: 'collect', item: 'charm', foes: ['skeleton'], n: 5, ch: 0.4 }] }),
    Q({ id: 's4c', npc: 'gyle', req: ['m6'], lv: 43, title: 'Moor Wolves', where: 'Dire Wolves on the Bleak Moor.',
      text: ['Wolves have come down from the wood to dig at the barrows. Drive off eight.'],
      done: ['The barrows are quiet. For a wolf, anyway.'], obj: [{ k: 'kill', foes: ['wolf'], n: 8 }] }),
    Q({ id: 's4d', npc: 'gyle', to: 'maudlin', req: ['m8'], lv: 47, title: 'The Lost Patrol', where: 'Sister Maudlin at the Lantern Rest, east road into the Drowned Graves.',
      text: ['I sent a patrol east to the drowned graves. None came back. Sister Maudlin keeps a light out there; ask her what she saw.'],
      done: ['Gyle\'s patrol. Yes. They walked into the water singing. I am sorry.'], obj: [] }),

    // ===== The Drowned Graves (49-83) =====
    Q({ id: 'm10', main: true, npc: 'ostra', to: 'maudlin', req: ['m9'], lv: 52, title: 'Black Water', where: 'The Lantern Rest, down the east road into the Drowned Graves.',
      text: ['The graves to the east flooded a hundred years ago and the dead never noticed. Sister Maudlin tends them anyway.', 'She has been writing to me about lights under the water. Go and see them.'],
      done: ['You came to see the lights. Everyone does. Few want to see what holds them.'], obj: [] }),
    Q({ id: 'm11', main: true, npc: 'maudlin', req: ['m10'], lv: 57, title: 'Wisplight', gear: 2, where: 'Wisps over the Drowned Graves.',
      text: ['The wisps are what is left when a song drowns: one bright note, wandering. Gather eight of their essences.', 'I will bottle them and we will listen to what they are trying to sing.'],
      done: ['They all sing the same three notes. Down, and down, and down.'], obj: [{ k: 'collect', item: 'essence', foes: ['wisp'], n: 8, ch: 0.45 }] }),
    Q({ id: 'm12', main: true, npc: 'maudlin', req: ['m11'], lv: 64, title: 'The Sunken Crypt', gear: 2, where: 'Somewhere at the far edge of the Drowned Graves, a crypt half under the water.',
      text: ['The wisps lead to a crypt at the edge of the graves, with a door that will not stay shut. Find it.', 'Then go in and clear it, before whatever breathes behind that door learns to walk.'],
      done: ['The crypt is quiet. You smell of black water. It will wash out, eventually.'], obj: [{ k: 'find', z: 2 }, { k: 'dungeon', z: 2 }] }),
    Q({ id: 'm13', main: true, npc: 'maudlin', to: 'ostra', req: ['m12'], lv: 75, title: 'The Drowned Matron', gear: 3, where: 'The Drowned Matron rises in the deep east of the Drowned Graves.',
      text: ['She was the first to drown and she has been mothering the others ever since, singing them under.', 'End her song. Then tell Ostra the water is still.'],
      done: ['The Matron. Maudlin\'s letters will be short and happy for once.', 'But the heartwood, the iron, the wisplight all point one way now: down, under the old ruins to the west, where the Warden keeps a fire that should have gone out.'], obj: [{ k: 'boss', foe: 'matron' }] }),
    // Maudlin's side quests
    Q({ id: 's2a', npc: 'maudlin', req: ['m10'], lv: 52, title: 'Return the Drowned', where: 'The Drowned, in the Drowned Graves.',
      text: ['The Drowned wander up out of the water looking for their homes. There are none left. Lay ten of them to rest.'],
      done: ['Rest well. All of you.'], obj: [{ k: 'kill', foes: ['drowned'], n: 10 }] }),
    Q({ id: 's2b', npc: 'maudlin', req: ['m10'], lv: 58, title: 'Corpse-Candles', where: 'The Drowned, in the Drowned Graves.',
      text: ['Each Drowned carries a candle that will not go out. I need six to keep my lanterns burning through the dark weeks.'],
      done: ['They burn green. They always burn green.'], obj: [{ k: 'collect', item: 'candle', foes: ['drowned'], n: 6, ch: 0.4 }] }),
    Q({ id: 's2c', npc: 'maudlin', req: ['m10'], lv: 63, title: 'Archers in the Reeds', where: 'Bone Archers in the Drowned Graves.',
      text: ['Archers have taken the reeds by the road and shoot at my lanterns. Silence eight.'],
      done: ['My lights thank you.'], obj: [{ k: 'kill', foes: ['archer'], n: 8 }] }),
    Q({ id: 's2d', npc: 'maudlin', req: ['m12'], lv: 70, title: 'The Matron\'s Lair', where: 'The deep east of the Drowned Graves.',
      text: ['Before anyone faces the Matron, someone should see where she rests. Go and look. Only look.'],
      done: ['A nest of old bones and new water. Thank you for coming back to tell me.'], obj: [{ k: 'reach', boss: 'matron' }] }),

    // ===== The Ember Ruins (76-111) =====
    Q({ id: 'm14', main: true, npc: 'ostra', to: 'varro', req: ['m13'], lv: 78, title: 'The Old Flame', where: 'Ashhand\'s Anvil, down the west road into the Ember Ruins.',
      text: ['The ruins to the west were a city of smiths. They forged the Wardstone\'s iron. One smith is still there, Varro.', 'He refuses to leave the forge. Find out if he is still himself.'],
      done: ['Still myself. Mostly. Ostra worries too much and too late.'], obj: [] }),
    Q({ id: 'm15', main: true, npc: 'varro', req: ['m14'], lv: 82, title: 'Cinders', where: 'Cinders in the Ember Ruins.',
      text: ['The Cinders are what the Hollowing makes of fire. They eat the ruins a stone at a time. Snuff twelve.'],
      done: ['The streets are dark again. Dark is better than that kind of light.'], obj: [{ k: 'kill', foes: ['cinder'], n: 12 }] }),
    Q({ id: 'm16', main: true, npc: 'varro', req: ['m15'], lv: 92, title: 'Singing Slag', gear: 2, where: 'Ember Golems in the Ember Ruins.',
      text: ['The golems carry slag from the old forge in their chests, and it hums. Bring me six pieces.', 'If I can hear what the Warden is forging, I can tell you how to stop him.'],
      done: ['A chain. He is forging a chain long enough to reach the bottom of the Hush.'], obj: [{ k: 'collect', item: 'slag', foes: ['golem'], n: 6, ch: 0.45 }] }),
    Q({ id: 'm17', main: true, npc: 'varro', to: 'ostra', req: ['m16'], lv: 104, title: 'The Ember Warden', gear: 3, where: 'The Ember Warden walks the deep west of the Ember Ruins.',
      text: ['The Warden was the forge-master. He kept the fire too long and it kept him. He is building a way down.', 'Break him. Then go to Ostra, and tell her the forge is cold.'],
      done: ['A chain to the bottom of the Hush. Someone wanted a way down very badly.', 'The Revenant in the north has the other end of it, Varro thinks. Into the cold, then.'], obj: [{ k: 'boss', foe: 'warden' }] }),
    // Varro's side quests
    Q({ id: 's3a', npc: 'varro', req: ['m14'], lv: 80, title: 'Imp Trouble', where: 'Imps in the Ember Ruins.',
      text: ['Imps keep stealing my tongs. Ten fewer imps, ten fewer thieves.'],
      done: ['My tongs! Well, some of them.'], obj: [{ k: 'kill', foes: ['imp'], n: 10 }] }),
    Q({ id: 's3b', npc: 'varro', req: ['m14'], lv: 88, title: 'Warden\'s Forge', gear: 2, where: 'Somewhere at the far edge of the Ember Ruins, an arch with fire behind it.',
      text: ['The old forge is out at the edge of the ruins, behind an arch that never cools. Find it, go in, and put it out.'],
      done: ['Cold at last. I never thought I would be glad to hear a forge go quiet.'], obj: [{ k: 'find', z: 3 }, { k: 'dungeon', z: 3 }] }),
    Q({ id: 's3c', npc: 'varro', req: ['m14'], lv: 96, title: 'Golem Cores', where: 'Ember Golems in the Ember Ruins.',
      text: ['A golem core can run a bellows for a year. Bring me five and I will forge you something worth keeping.'],
      done: ['Still warm. Good.'], obj: [{ k: 'collect', item: 'core', foes: ['golem'], n: 5, ch: 0.4 }] }),
    Q({ id: 's3d', npc: 'varro', to: 'ilke', req: ['m16'], lv: 102, title: 'Word to the North', where: 'Wayfinder Ilke, at Ilke\'s Fire in the far north of the Frostmire.',
      text: ['There is a guide in the Frostmire called Ilke. Tell her the chain is real. She will know which way it runs.'],
      done: ['Varro sent you? Then the chain is real. I hoped he was drunk.'], obj: [] }),

    // ===== The Frostmire (111-152) =====
    Q({ id: 'm18', main: true, npc: 'ostra', to: 'ilke', req: ['m17'], lv: 108, title: 'Where Nothing Thaws', where: 'Ilke\'s Fire, in the far north of the Frostmire.',
      text: ['North of the wood the cold never lifts, and the dead stay as they fell. Ilke guides travellers through it.', 'She is the only one who has seen the Revenant and come back. Go to her.'],
      done: ['You walked here? Through that? Sit down before you freeze to my fire.'], obj: [] }),
    Q({ id: 'm19', main: true, npc: 'ilke', req: ['m18'], lv: 114, title: 'Rime-Shards', gear: 2, where: 'Frost Wraiths in the Frostmire.',
      text: ['The wraiths are frozen breath, the last word someone spoke. Shatter them and the shards keep the word.', 'Bring me eight. We will listen for the Revenant\'s name.'],
      done: ['They all say one name. Aurel. That was the last Cantor\'s name, before he went down.'], obj: [{ k: 'collect', item: 'rime', foes: ['wraith'], n: 8, ch: 0.45 }] }),
    Q({ id: 'm20', main: true, npc: 'ilke', req: ['m19'], lv: 126, title: 'The Rime Vault', gear: 2, where: 'Somewhere at the far edge of the Frostmire, a ring of ice standing alone.',
      text: ['There is a vault at the edge of the Frostmire, a ring of ice with a door of frozen air.', 'Find it and go through. The chain\'s far end is anchored somewhere inside.'],
      done: ['You cut the anchor. The ice groaned all the way over here.'], obj: [{ k: 'find', z: 5 }, { k: 'dungeon', z: 5 }] }),
    Q({ id: 'm21', main: true, npc: 'ilke', to: 'ostra', req: ['m20'], lv: 144, title: 'The Frost Revenant', gear: 3, where: 'The Frost Revenant stalks the deep north of the Frostmire.',
      text: ['The Revenant holds the chain now, and pulls. Every pull, the Wardstone cracks a little more.', 'Stop him. Then go home and tell Ostra the truth: Aurel is not dead. He is the Hollow King.'],
      done: ['Aurel. I sang with him once, when we were both young. He had the best voice in Vaelmort.', 'He went down to wake the Choir and came back with nothing. Now he wants to take the last note with him. To the Reach, then. To the end.'], obj: [{ k: 'boss', foe: 'revenant' }] }),
    // Ilke's side quests
    Q({ id: 's5a', npc: 'ilke', req: ['m18'], lv: 112, title: 'Wolves of the Rime', where: 'Rime Wolves in the Frostmire.',
      text: ['The rime wolves follow travellers until they lie down. Cull ten so my roads stay walkable.'],
      done: ['The roads are mine again.'], obj: [{ k: 'kill', foes: ['frostwolf'], n: 10 }] }),
    Q({ id: 's5b', npc: 'ilke', req: ['m18'], lv: 122, title: 'Shatter the Wraiths', where: 'Frost Wraiths in the Frostmire.',
      text: ['Ten wraiths fewer, ten voices fewer whispering at my fire.'],
      done: ['Quiet. Blessed quiet.'], obj: [{ k: 'kill', foes: ['wraith'], n: 10 }] }),
    Q({ id: 's5c', npc: 'ilke', req: ['m18'], lv: 134, title: 'Ice-Bound', where: 'Ice Golems in the Frostmire.',
      text: ['The ice golems are walking glaciers. They crush the trail markers. Break six of them.'],
      done: ['Good. Now I can mark the trail again.'], obj: [{ k: 'kill', foes: ['icegolem'], n: 6 }] }),
    Q({ id: 's5d', npc: 'ilke', req: ['m20'], lv: 140, title: 'The Revenant\'s Path', where: 'The deep north of the Frostmire.',
      text: ['Walk to where the Revenant waits and come back. Just learn the ground. You will want to know it.'],
      done: ['You know the ground now. That is half of any fight.'], obj: [{ k: 'reach', boss: 'revenant' }] }),

    // ===== The Sundered Reach (152-200) =====
    Q({ id: 'm22', main: true, npc: 'ostra', to: 'sael', req: ['m21'], lv: 150, title: 'The Unsung', where: 'The Quiet Stone, deep in the Sundered Reach.',
      text: ['There is a Hollow in the Reach who kept their voice. Sael. They write to me in a hand I do not recognise, and they are always right.', 'Go to them. Do not strike first. They are on our side, as much as anyone down there can be.'],
      done: ['Ostra\'s champion. I wondered when you would come. Sit. Mind the dark; it bites.'], obj: [] }),
    Q({ id: 'm23', main: true, npc: 'sael', req: ['m22'], lv: 156, title: 'Void Lights', gear: 2, where: 'Void Wisps in the Sundered Reach.',
      text: ['The void wisps are notes the King has swallowed. Break them and they let one go.', 'Bring me eight motes. I will string them into a verse he cannot unhear.'],
      done: ['Eight notes. Nearly a song. Nearly enough.'], obj: [{ k: 'collect', item: 'mote', foes: ['voidwisp'], n: 8, ch: 0.45 }] }),
    Q({ id: 'm24', main: true, npc: 'sael', req: ['m23'], lv: 166, title: 'Knights of Nothing', where: 'Hollow Knights in the Sundered Reach.',
      text: ['The King\'s knights were his choir once. Now they guard the silence. Eight of them stand between you and the throne.'],
      done: ['The way is open. I am sorry it had to be them.'], obj: [{ k: 'kill', foes: ['hknight'], n: 8 }] }),
    Q({ id: 'm25', main: true, npc: 'sael', req: ['m24'], lv: 178, title: 'Throne of Nothing', gear: 3, where: 'Somewhere at the far edge of the Sundered Reach, a tear standing in the air.',
      text: ['His throne is not a chair. It is a tear in the world at the edge of the Reach, where the Hush shows through.', 'Find it. Go in. Close as much of it as you can.'],
      done: ['You came back out of the Hush. I did not think that was a thing people did.'], obj: [{ k: 'find', z: 6 }, { k: 'dungeon', z: 6 }] }),
    Q({ id: 'm26', main: true, npc: 'sael', to: 'ostra', req: ['m25'], lv: 194, title: 'The Last Verse', gear: 4, where: 'The Hollow King waits in the deep south of the Sundered Reach.',
      text: ['He is waiting for you. He has been waiting a long time, for someone to bring the last note close enough to take.', 'Go anyway. Sing it at him, if you can. Then go home to Ostra. Whatever happens, she should hear it from you.'],
      done: ['You are back. The stone is ringing. Do you hear it? Everyone can hear it.', 'Aurel is quiet now. Maybe the Choir will hear that, too. Rest, champion. The Hush is shut. For now.'], obj: [{ k: 'boss', foe: 'hollowking' }] }),
    // Sael's side quests
    Q({ id: 's6a', npc: 'sael', req: ['m22'], lv: 152, title: 'Stalkers', where: 'Void Stalkers in the Sundered Reach.',
      text: ['Stalkers hunt anything that still has a voice. Including me. Twelve fewer would be a kindness.'],
      done: ['I can hear myself think again.'], obj: [{ k: 'kill', foes: ['stalker'], n: 12 }] }),
    Q({ id: 's6b', npc: 'sael', req: ['m22'], lv: 168, title: 'Echo-Stones', where: 'Void Stalkers in the Sundered Reach.',
      text: ['Stalkers swallow echoes and the echoes harden. Six echo-stones, and I can hear what the Reach remembers.'],
      done: ['Voices. Hundreds. All of them asking to go home.'], obj: [{ k: 'collect', item: 'echo', foes: ['stalker'], n: 6, ch: 0.4 }] }),
    Q({ id: 's6c', npc: 'sael', req: ['m24'], lv: 176, title: 'The King\'s Shadow', where: 'The deep south of the Sundered Reach.',
      text: ['Walk to the edge of his court and look at him. Do not speak. He will speak first, if you let him.'],
      done: ['He looked back, did he not. He always does.'], obj: [{ k: 'reach', boss: 'hollowking' }] }),
    Q({ id: 's6d', npc: 'sael', req: ['m25'], lv: 186, title: 'Nightmare Below', gear: 3, where: 'Throne of Nothing, the tear at the edge of the Reach.',
      text: ['The tear opens again whenever you look away. Go back in and close it, on whatever terms it offers.'],
      done: ['Shut again. Thank you. It will hold a little longer.'], obj: [{ k: 'dungeon', z: 6 }] }),
  ];
  V.QUEST = Object.fromEntries(V.QUESTS.map((q) => [q.id, q]));
  for (const q of V.QUESTS) q.to = q.to || q.npc;

  // ---------- helpers shared by client and server ----------
  V.cleanQuests = (raw) => {
    const out = { a: {}, d: [] };
    if (!raw || typeof raw !== 'object') return out;
    if (Array.isArray(raw.d)) out.d = [...new Set(raw.d.filter((id) => V.QUEST[id]))];
    if (raw.a && typeof raw.a === 'object') for (const [id, prog] of Object.entries(raw.a)) {
      const q = V.QUEST[id]; if (!q || out.d.includes(id) || !Array.isArray(prog)) continue;
      out.a[id] = q.obj.map((o, i) => Math.max(0, Math.min(V.objNeed(o), prog[i] | 0)));
    }
    return out;
  };
  V.objNeed = (o) => o.n || 1;
  V.questReady = (q, prog) => q.obj.every((o, i) => (prog[i] || 0) >= V.objNeed(o));
  V.questXp = (q) => Math.round(V.xpNext(q.lv) * (q.obj.length === 0 ? 0.6 : q.main ? 2 : 1.2));
  // can this character take it right now?
  V.questOpen = (q, qs, level) => !qs.d.includes(q.id) && !qs.a[q.id] && level >= q.lv - 3 && (q.req || []).every((r) => qs.d.includes(r));
  V.objText = (o, v) => {
    const need = V.objNeed(o), c = need > 1 ? ` ${Math.min(v, need)}/${need}` : v >= need ? ' ✓' : '';
    if (o.k === 'kill') return `Slay ${o.foes.map((f) => V.FOES[f].name).join(' or ')}${c}`;
    if (o.k === 'collect') return `${V.QITEMS[o.item]}${c}`;
    if (o.k === 'find') return `Find ${V.DUNGEONS[o.z].name}${c}`;
    if (o.k === 'reach') return `Reach the lair of ${V.FOES[o.boss].name}${c}`;
    if (o.k === 'boss') return `Slay ${V.FOES[o.foe].name}${c}`;
    if (o.k === 'dungeon') return `Clear ${V.DUNGEONS[o.z].name} (any mode)${c}`;
    return '';
  };
  // the pick-one reward: three fixed catalog items, the same for everyone (a weapon and two other slots, chosen per quest)
  V.questChoices = (q) => {
    if (!q.gear) return [];
    const npcZone = V.NPCS[q.npc].zone, z = npcZone || V.zoneForLevel(q.lv);
    let h = 2166136261; for (const ch of `quest:${q.id}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    const slots = [0]; for (let i = 1; slots.length < 3; i++) { const s = 1 + ((h >>> 0) + i * 2654435761) % (V.SLOTS.length - 1); if (!slots.includes(s)) slots.push(s); }
    return slots.map((s) => V.catDrop(z, q.lv, q.gear, Math.random, s));
  };
})(typeof window !== 'undefined' ? window.V : globalThis.V);
