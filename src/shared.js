// Vaelmort shared rules: classes, skills, talents, resources, enemies, zones, bounties, progression, math and collision.
// Loaded by the browser and the server.
(function (root) {
  'use strict';
  const V = root.V || (root.V = {});

  V.SEED = 1337;
  V.MAX_LEVEL = 30;
  V.MAX_CHARS = 4;
  V.DODGE_CD = 1.1;
  V.DODGE_TIME = 0.22;
  V.CHEST = 24;
  V.xpNext = (lv) => Math.round(80 * Math.pow(lv, 1.35));
  V.foeXp = (lv, elite, boss) => Math.round((10 + 5 * lv) * (elite ? 3 : 1) * (boss ? 12 : 1));
  V.xpScale = (playerLv, foeLv) => { const d = playerLv - foeLv; return d >= 6 ? 0.1 : d >= 4 ? 0.5 : d <= -3 ? 1.3 : 1; };
  V.talentPoints = (lv) => Math.max(0, lv - 1);

  // ---------- resources ----------
  V.RES = {
    wrath: { name: 'Wrath', color: '#e85325', regen: 0, build: true, start: 30 },
    fury: { name: 'Fury', color: '#e0453a', regen: 0, build: true, start: 30 },
    mana: { name: 'Mana', color: '#4b86ff', regen: 5, start: 100 },
    energy: { name: 'Energy', color: '#e8cf3c', regen: 14, start: 100 },
    focus: { name: 'Focus', color: '#bfe0ff', regen: 9, start: 100 },
  };

  // ---------- classes ----------
  V.ORDER = ['doomknight', 'necromancer', 'warlord', 'assassin', 'hunter', 'druid'];
  V.CLASSES = {
    doomknight: { role: 'Tank', res: 'wrath', hp: 240, speed: 132, armor: 0.2,
      blurb: 'A hellforged knight who drags enemies close and burns the ground beneath them.',
      passive: 'Hellforged: takes 20% less damage.',
      basic: { name: 'Cleave', kind: 'melee', dmg: 28, range: 64, arc: 2.2, hits: [5], kb: 80 },
      skills: ['hellslam', 'chain', 'bulwark', 'charge', 'doomfall'] },
    necromancer: { role: 'Summoner', res: 'mana', hp: 160, speed: 138, armor: 0,
      blurb: 'Commands the dead, spears foes with bone and smothers them in plague.',
      passive: 'Soul Harvest: kills restore 6% health.',
      basic: { name: 'Soul Bolt', kind: 'shot', dmg: 24, speed: 330, range: 270, hits: [4], size: 3 },
      skills: ['raise', 'bonespear', 'plague', 'bonearmor', 'army'] },
    warlord: { role: 'Bruiser', res: 'fury', hp: 215, speed: 138, armor: 0.08,
      blurb: 'A battlefield commander who spins through crowds and rallies everyone near the banner.',
      passive: 'Battle Rhythm: each hit shortens War Banner by 0.5s.',
      basic: { name: 'Sunder', kind: 'melee', dmg: 32, range: 66, arc: 1.9, hits: [5], kb: 100 },
      skills: ['banner', 'whirl', 'leap', 'rally', 'avatar'] },
    assassin: { role: 'Striker', res: 'energy', hp: 130, speed: 150, armor: 0, dodgeCd: 0.66,
      blurb: 'Strikes from the shadows, exposes a target and finishes it in a blink.',
      passive: 'Evasive: dodge recovers 40% faster.',
      basic: { name: 'Twin Fangs', kind: 'melee', dmg: 11, range: 52, arc: 1.6, hits: [2, 4], kb: 20 },
      skills: ['step', 'fan', 'smoke', 'evisc', 'deathmark'] },
    hunter: { role: 'Marksman', res: 'focus', hp: 160, speed: 144, armor: 0,
      blurb: 'A silver-sworn hunter of witches: traps, volleys and holy fire from range.',
      passive: 'Silver Oath: +30% damage to magical enemies.',
      basic: { name: 'Silver Bolt', kind: 'shot', dmg: 25, speed: 520, range: 310, hits: [2], size: 2, pierce: 1 },
      skills: ['volley', 'trap', 'purge', 'tumble', 'rain'] },
    druid: { role: 'Healer', res: 'mana', hp: 180, speed: 140, armor: 0.05,
      blurb: 'Keeps the group alive with blooms and bark while wolves and storms do the fighting.',
      passive: 'Verdant: regenerates health twice as fast.',
      basic: { name: 'Thorn Seed', kind: 'shot', dmg: 21, speed: 300, range: 250, hits: [4], size: 3 },
      skills: ['bloom', 'roots', 'wolves', 'barkskin', 'storm'] },
    // admin only: a being of light in a world of darkness
    lightborn: { role: 'Radiant', res: 'mana', hp: 320, speed: 152, armor: 0.15, admin: true,
      blurb: 'A rare being of pure light. Smites the dark from afar and heals everyone near.',
      passive: 'Radiance: regenerates health and mana quickly; +30% damage to magical enemies.',
      basic: { name: 'Radiant Lance', kind: 'shot', dmg: 42, speed: 560, range: 320, hits: [4], size: 3, pierce: 2 },
      skills: ['smite', 'sunbeam', 'blink', 'sanctuary', 'dawnbreak'] },
  };
  V.ALL_CLASSES = V.ORDER.concat(['lightborn']);

  // ---------- skills (slot 1-4 + ultimate) ----------
  V.SKILLS = {
    // Doom Knight
    hellslam: { name: 'Hellfire Slam', lvl: 1, cd: 7, cost: 20, desc: 'Slam the ground for 45 damage around you and leave burning ground for 3.5s.' },
    chain: { name: 'Chain Grasp', lvl: 3, cd: 8, cost: 15, desc: 'Hurl a hellchain that pulls the first enemy hit to you and stuns it for 1s.' },
    bulwark: { name: 'Iron Bulwark', lvl: 6, cd: 16, cost: 20, desc: 'Take 50% less damage for 5s and force nearby enemies to attack you.' },
    charge: { name: 'Infernal Charge', lvl: 10, cd: 10, cost: 25, desc: 'Charge forward, hitting everything in your path for 35 damage.' },
    doomfall: { name: 'Doomfall', lvl: 15, cd: 45, cost: 60, ult: true, desc: 'Leap to a spot and crash down for 130 damage, stunning enemies and setting the ground ablaze.' },
    // Necromancer
    raise: { name: 'Raise Dead', lvl: 1, cd: 9, cost: 30, desc: 'Raise two skeletons that fight for you for 15s.' },
    bonespear: { name: 'Bone Spear', lvl: 3, cd: 5, cost: 20, desc: 'Launch a spear of bone that pierces every enemy in a line for 40 damage.' },
    plague: { name: 'Plague Cloud', lvl: 6, cd: 10, cost: 30, desc: 'Poison an area for 5s, damaging and slowing enemies inside.' },
    bonearmor: { name: 'Bone Armor', lvl: 10, cd: 18, cost: 25, desc: 'Gain a shield of bone that absorbs damage equal to 30% of your health for 8s.' },
    army: { name: 'Army of the Dead', lvl: 15, cd: 60, cost: 70, ult: true, desc: 'Raise five skeletons at once for 12s.' },
    // Warlord
    banner: { name: 'War Banner', lvl: 1, cd: 12, cost: 20, desc: 'Plant a banner for 8s. Allies near it deal 40% more damage, move faster and regenerate.' },
    whirl: { name: 'Whirlwind', lvl: 3, cd: 8, cost: 25, desc: 'Spin for 1.2s, hitting everything around you four times.' },
    leap: { name: 'Leap Slam', lvl: 6, cd: 10, cost: 20, desc: 'Leap to a spot, dealing 40 damage and slowing enemies where you land.' },
    rally: { name: 'Rallying Shout', lvl: 10, cd: 20, cost: 30, desc: 'Restore 25% health over 4s to you and allies nearby.' },
    avatar: { name: 'Avatar of War', lvl: 15, cd: 60, cost: 50, ult: true, desc: 'For 10s deal 50% more damage, move 30% faster and spend no Fury.' },
    // Assassin
    step: { name: 'Shadow Step', lvl: 1, cd: 7, cost: 25, desc: 'Dash through enemies toward the cursor, damaging and exposing them. Your next hit is a strong critical.' },
    fan: { name: 'Fan of Knives', lvl: 3, cd: 6, cost: 30, desc: 'Throw twelve knives in every direction for 14 damage each.' },
    smoke: { name: 'Smoke Bomb', lvl: 6, cd: 14, cost: 30, desc: 'Drop smoke for 4s. Enemies inside cannot see you or attack.' },
    evisc: { name: 'Eviscerate', lvl: 10, cd: 8, cost: 35, desc: 'A finishing strike for 60 damage, doubled against exposed or badly wounded enemies.' },
    deathmark: { name: 'Death Mark', lvl: 15, cd: 50, cost: 50, ult: true, desc: 'Mark an enemy. After 4s it takes 60% of the damage you dealt to it, plus 120.' },
    // Witch Hunter
    volley: { name: 'Silver Volley', lvl: 1, cd: 6, cost: 25, desc: 'Fire five bolts in a fan that mark targets to take 30% more damage.' },
    trap: { name: "Hunter's Trap", lvl: 3, cd: 8, cost: 20, desc: 'Set a trap that explodes for 45 damage and roots the first enemy to step near it. Up to 3.' },
    purge: { name: 'Purge', lvl: 6, cd: 9, cost: 25, desc: 'Blast a cone of holy light for 35 damage and knock enemies back. +50% against magic.' },
    tumble: { name: 'Tumble', lvl: 10, cd: 10, cost: 20, desc: 'Roll backward. Your next 3 bolts deal 50% more damage and pierce further.' },
    rain: { name: 'Rain of Silver', lvl: 15, cd: 50, cost: 60, ult: true, desc: 'Silver arrows rain on an area for 4s.' },
    // Druid
    bloom: { name: 'Wild Bloom', lvl: 1, cd: 9, cost: 30, desc: 'Grow a field of flowers for 5s that heals allies and roots enemies.' },
    roots: { name: 'Entangling Roots', lvl: 3, cd: 8, cost: 20, desc: 'A seed that roots its target for 3s and spreads roots to enemies nearby.' },
    wolves: { name: 'Spirit Wolves', lvl: 6, cd: 14, cost: 35, desc: 'Call two spirit wolves to fight for you for 10s.' },
    barkskin: { name: 'Barkskin', lvl: 10, cd: 18, cost: 20, desc: 'Take 40% less damage for 6s and hurt anything that strikes you.' },
    smite: { name: 'Smite', lvl: 1, cd: 4, cost: 15, desc: 'Call a pillar of light down on a spot for 90 damage, stunning the enemies there.' },
    sunbeam: { name: 'Sunbeam', lvl: 1, cd: 6, cost: 20, desc: 'Fire a beam of sunlight that burns every enemy in a long line for 75 damage and marks them.' },
    blink: { name: 'Blink', lvl: 1, cd: 5, cost: 10, desc: 'Vanish in a flash and reappear at the cursor, blinding enemies where you land.' },
    sanctuary: { name: 'Sanctuary', lvl: 1, cd: 14, cost: 30, desc: 'Heal yourself and allies nearby for 40% of their health, then more over 4s.' },
    dawnbreak: { name: 'Dawnbreak', lvl: 1, cd: 40, cost: 50, ult: true, desc: 'Become the dawn: a blinding nova for 240 damage that stuns everything around you and heals allies.' },
    storm: { name: 'Storm of the Grove', lvl: 15, cd: 55, cost: 60, ult: true, desc: 'Call a storm for 6s that strikes enemies in the area with lightning.' },
  };
  V.SKILL_KEYS = ['1', '2', '3', '4', '5'];

  // ---------- trainers, camps and the bounty board (tile offsets from the town centre) ----------
  // Each class trainer keeps a small camp at the edge of a zone. Camps are safe: enemies cannot attack you there.
  V.TRAINERS = {
    druid: { name: 'Elder Wren', camp: 'Wren\'s Grove', at: [-13, -7.5] },
    assassin: { name: 'Vex the Quiet', camp: 'Shade Hollow', at: [-7.5, -13] },
    warlord: { name: 'Gorran Ironbrow', camp: 'Ironbrow Camp', at: [7.5, 13] },
    hunter: { name: 'Inquisitor Sable', camp: 'Sable\'s Watch', at: [13, 7.5] },
    necromancer: { name: 'Morvane', camp: 'The Ossuary', at: [8.6, -12.3] },
    doomknight: { name: 'Ser Halvard', camp: 'Cinder Bastion', at: [-8.6, 12.3] },
    lightborn: { name: 'The Dawnkeeper', camp: 'Dawn Shrine', at: [-2.5, 5] },
  };
  V.BOARD_AT = [1.2, 4];       // the bounty board in Vaelmort Gate
  V.CAMP_R = 130;              // ground px around a camp where you are safe
  V.INTERACT = 120;            // ground px to talk to a trainer or use the board
  V.MAX_BOUNTIES = 3;
  V.trainerPos = (cls) => { const t = V.TRAINERS[cls]; return V.toWorld(V.C + t.at[0], V.C + t.at[1]); };
  V.boardPos = () => V.toWorld(V.C + V.BOARD_AT[0], V.C + V.BOARD_AT[1]);
  let campPts = null;
  V.inCamp = (x, y) => {
    campPts = campPts || Object.keys(V.TRAINERS).map(V.trainerPos);
    for (const [tx, ty] of campPts) if (V.gdist(x, y, tx, ty) < V.CAMP_R) return true;
    return false;
  };
  V.nearTrainer = (cls, x, y, pad = 0) => { const [tx, ty] = V.trainerPos(cls); return V.gdist(x, y, tx, ty) < V.INTERACT + pad; };
  V.nearBoard = (x, y, pad = 0) => { const [bx, by] = V.boardPos(); return V.gdist(x, y, bx, by) < V.INTERACT + pad; };
  // bounty state per zone: { i: which bounty in the zone's list, n: kills so far, st: 0 on the board, 1 accepted, 2 ready to turn in }
  V.cleanBounties = (b) => {
    const out = {};
    if (!b || typeof b !== 'object') return out;
    for (let z = 1; z < V.ZONE_INFO.length; z++) {
      const e = b[z]; if (!e || typeof e !== 'object' || !V.ZONE_INFO[z].bounties) continue;
      const st = [0, 1, 2].includes(e.st) ? e.st : 0;
      out[z] = { i: Math.max(0, e.i | 0), n: st ? Math.max(0, e.n | 0) : 0, st };
    }
    return out;
  };
  V.bountyOf = (z, e) => { const list = V.ZONE_INFO[z].bounties; return list[(e ? e.i : 0) % list.length]; };

  // ---------- talent definitions (placed into each class's skill web below) ----------
  const T = (id, name, max, mod, desc) => ({ id, name, max, mod, desc });
  V.TALENTS = {
    doomknight: [
      { name: 'Hellfire', nodes: [T('dkh1', 'Kindled Steel', 3, { dmg: 0.04 }, '+4% damage per rank.'), T('dkh2', 'Searing Slam', 3, { 'hellslam.dmg': 0.15 }, 'Hellfire Slam deals +15% damage per rank.'),
        T('dkh3', 'Trail of Cinders', 2, { 'charge.dmg': 0.25 }, 'Infernal Charge deals +25% damage per rank.'), T('dkh4', 'Ember Heart', 2, { crit: 0.03 }, '+3% critical chance per rank.'),
        T('dkh5', 'Infernal Core', 1, { flag: 'infernalCore' }, 'Burning ground lasts twice as long and burns twice as hard.')] },
      { name: 'Bulwark', nodes: [T('dkb1', 'Thick Plate', 3, { hp: 0.05 }, '+5% maximum health per rank.'), T('dkb2', 'Iron Will', 3, { armor: 0.03 }, 'Take 3% less damage per rank.'),
        T('dkb3', 'Unyielding', 2, { 'bulwark.dur': 1.5 }, 'Iron Bulwark lasts 1.5s longer per rank.'), T('dkb4', 'Spiked Plate', 2, { thorns: 8 }, 'Enemies that hit you take 8 damage per rank.'),
        T('dkb5', 'Last Stand', 1, { flag: 'lastStand' }, 'Once a minute, a killing blow leaves you at 1 health and invulnerable for 2s.')] },
      { name: 'Dread', nodes: [T('dkd1', 'Wrathful', 3, { resGen: 0.15 }, 'Gain 15% more Wrath per rank.'), T('dkd2', 'Grasping Chains', 3, { 'chain.cdr': 0.15 }, 'Chain Grasp cooldown -15% per rank.'),
        T('dkd3', 'Long Reach', 2, { basicRange: 0.1 }, 'Cleave reaches 10% further per rank.'), T('dkd4', 'Executioner', 2, { execute: 0.2 }, '+20% damage per rank to enemies under 30% health.'),
        T('dkd5', 'Doomsayer', 1, { flag: 'doomsayer' }, 'Doomfall cooldown -40% and it stuns 1s longer.')] },
    ],
    necromancer: [
      { name: 'Bone', nodes: [T('neb1', 'Sharpened Bone', 3, { 'bonespear.dmg': 0.15 }, 'Bone Spear deals +15% damage per rank.'), T('neb2', 'Marrow', 3, { dmg: 0.04 }, '+4% damage per rank.'),
        T('neb3', 'Ossuary', 2, { 'bonearmor.power': 0.2 }, 'Bone Armor absorbs 20% more per rank.'), T('neb4', 'Splinter', 2, { crit: 0.03 }, '+3% critical chance per rank.'),
        T('neb5', 'Bone Prison', 1, { flag: 'boneSpearRoot' }, 'Bone Spear roots every enemy it pierces for 1.5s.')] },
      { name: 'Plague', nodes: [T('nep1', 'Virulence', 3, { 'plague.dmg': 0.15 }, 'Plague Cloud deals +15% damage per rank.'), T('nep2', 'Lingering', 3, { 'plague.dur': 1 }, 'Plague Cloud lasts 1s longer per rank.'),
        T('nep3', 'Soul Siphon', 2, { leech: 0.02 }, 'Heal for 2% of damage dealt per rank.'), T('nep4', 'Withering', 2, { execute: 0.15 }, '+15% damage per rank to enemies under 30% health.'),
        T('nep5', 'Pandemic', 1, { flag: 'pandemic' }, 'Enemies in Plague Cloud take 15% more damage from everything.')] },
      { name: 'Undeath', nodes: [T('neu1', 'Grave Pact', 3, { summonDmg: 0.12 }, 'Minions deal +12% damage per rank.'), T('neu2', 'Bone Legion', 3, { summonHp: 0.15 }, 'Minions have +15% health per rank.'),
        T('neu3', 'Dark Rites', 2, { 'raise.cdr': 0.15 }, 'Raise Dead cooldown -15% per rank.'), T('neu4', 'Soul Well', 2, { resGen: 0.15 }, '+15% Mana regeneration per rank.'),
        T('neu5', 'Lich Lord', 1, { flag: 'lichLord' }, 'Raise Dead summons three skeletons that last 5s longer.')] },
    ],
    warlord: [
      { name: 'Arms', nodes: [T('wla1', 'Heavy Hands', 3, { dmg: 0.04 }, '+4% damage per rank.'), T('wla2', 'Whirling Steel', 3, { 'whirl.dmg': 0.15 }, 'Whirlwind deals +15% damage per rank.'),
        T('wla3', 'Brutal Leap', 2, { 'leap.dmg': 0.25 }, 'Leap Slam deals +25% damage per rank.'), T('wla4', 'Cruelty', 2, { crit: 0.03 }, '+3% critical chance per rank.'),
        T('wla5', 'Bladestorm', 1, { flag: 'bladestorm' }, 'Whirlwind lasts 1s longer and drags enemies inward.')] },
      { name: 'Command', nodes: [T('wlc1', 'Banner Bearer', 3, { 'banner.dur': 2 }, 'War Banner lasts 2s longer per rank.'), T('wlc2', 'Inspiring', 3, { hp: 0.05 }, '+5% maximum health per rank.'),
        T('wlc3', 'Rally Cry', 2, { 'rally.power': 0.2 }, 'Rallying Shout heals 20% more per rank.'), T('wlc4', 'Phalanx', 2, { armor: 0.03 }, 'Take 3% less damage per rank.'),
        T('wlc5', 'Warmaster', 1, { flag: 'warmaster' }, 'Your banner also heals 2% health per second and grants +10% critical chance.')] },
      { name: 'Rage', nodes: [T('wlr1', 'Bloodlust', 3, { resGen: 0.15 }, 'Gain 15% more Fury per rank.'), T('wlr2', 'Unstoppable', 3, { speed: 0.03 }, '+3% movement speed per rank.'),
        T('wlr3', 'Leech Blade', 2, { leech: 0.02 }, 'Heal for 2% of damage dealt per rank.'), T('wlr4', 'Butcher', 2, { execute: 0.2 }, '+20% damage per rank to enemies under 30% health.'),
        T('wlr5', 'Endless War', 1, { flag: 'endlessWar' }, 'Avatar of War lasts 5s longer and each kill extends it by 1s.')] },
    ],
    assassin: [
      { name: 'Blades', nodes: [T('asb1', 'Keen Edge', 3, { dmg: 0.04 }, '+4% damage per rank.'), T('asb2', 'Flurry', 3, { 'fan.dmg': 0.15 }, 'Fan of Knives deals +15% damage per rank.'),
        T('asb3', 'Lacerate', 2, { 'evisc.dmg': 0.2 }, 'Eviscerate deals +20% damage per rank.'), T('asb4', 'Precision', 2, { crit: 0.04 }, '+4% critical chance per rank.'),
        T('asb5', 'Thousand Cuts', 1, { flag: 'thousandCuts' }, 'Twin Fangs strikes three times.')] },
      { name: 'Shadow', nodes: [T('ass1', 'Fleet', 3, { speed: 0.03 }, '+3% movement speed per rank.'), T('ass2', 'Shade Walk', 3, { 'step.cdr': 0.15 }, 'Shadow Step cooldown -15% per rank.'),
        T('ass3', 'Thick Smoke', 2, { 'smoke.dur': 1.5 }, 'Smoke Bomb lasts 1.5s longer per rank.'), T('ass4', 'Evasion', 2, { dodgeCdr: 0.15 }, 'Dodge cooldown -15% per rank.'),
        T('ass5', 'Umbral', 1, { flag: 'umbral' }, 'Shadow Step and Smoke Bomb hide you for 2s; your next hit from hiding deals 80% more.')] },
      { name: 'Venom', nodes: [T('asv1', 'Toxin', 3, { poison: 4 }, 'Twin Fangs poisons for 4 damage per second per rank.'), T('asv2', 'Quick Fingers', 3, { 'fan.cdr': 0.15 }, 'Fan of Knives cooldown -15% per rank.'),
        T('asv3', 'Opportunist', 2, { execute: 0.2 }, '+20% damage per rank to enemies under 30% health.'), T('asv4', 'Leech Venom', 2, { leech: 0.02 }, 'Heal for 2% of damage dealt per rank.'),
        T('asv5', "Death's Embrace", 1, { flag: 'deathsEmbrace' }, 'Death Mark detonates for double and exposes enemies around the target.')] },
    ],
    hunter: [
      { name: 'Marksman', nodes: [T('hum1', 'Steady Aim', 3, { dmg: 0.04 }, '+4% damage per rank.'), T('hum2', 'Silver Tips', 3, { 'volley.dmg': 0.15 }, 'Silver Volley deals +15% damage per rank.'),
        T('hum3', 'Deadeye', 2, { crit: 0.04 }, '+4% critical chance per rank.'), T('hum4', 'Long Shot', 2, { basicRange: 0.15 }, 'Silver Bolt flies 15% further per rank.'),
        T('hum5', 'Piercing Faith', 1, { flag: 'piercingFaith' }, 'Silver Bolt pierces two more enemies and marks them.')] },
      { name: 'Witchbane', nodes: [T('huw1', 'Holy Silver', 3, { magicDmg: 0.08 }, '+8% damage per rank to magical enemies.'), T('huw2', 'Purifier', 3, { 'purge.dmg': 0.2 }, 'Purge deals +20% damage per rank.'),
        T('huw3', 'Hallowed', 2, { armor: 0.03 }, 'Take 3% less damage per rank.'), T('huw4', 'Exorcist', 2, { execute: 0.2 }, '+20% damage per rank to enemies under 30% health.'),
        T('huw5', 'Inquisitor', 1, { flag: 'inquisitor' }, 'Purge stuns for 1.5s and its cooldown is halved.')] },
      { name: 'Trapper', nodes: [T('hut1', 'Snares', 3, { 'trap.dmg': 0.2 }, "Hunter's Trap deals +20% damage per rank."), T('hut2', 'Quick Hands', 3, { 'trap.cdr': 0.15 }, "Hunter's Trap cooldown -15% per rank."),
        T('hut3', 'Fleetfoot', 2, { speed: 0.03 }, '+3% movement speed per rank.'), T('hut4', 'Acrobat', 2, { 'tumble.cdr': 0.2 }, 'Tumble cooldown -20% per rank.'),
        T('hut5', 'Storm of Silver', 1, { flag: 'stormSilver' }, 'Rain of Silver lasts 2s longer and marks every enemy it hits.')] },
    ],
    druid: [
      { name: 'Growth', nodes: [T('drg1', 'Verdance', 3, { healPow: 0.1 }, 'Your healing is 10% stronger per rank.'), T('drg2', 'Overgrowth', 3, { 'bloom.dur': 1 }, 'Wild Bloom lasts 1s longer per rank.'),
        T('drg3', 'Thick Hide', 2, { hp: 0.05 }, '+5% maximum health per rank.'), T('drg4', 'Barkweave', 2, { 'barkskin.dur': 2 }, 'Barkskin lasts 2s longer per rank.'),
        T('drg5', 'Tree of Life', 1, { flag: 'treeOfLife' }, 'Wild Bloom heals twice as much and its cooldown is halved.')] },
      { name: 'Wild', nodes: [T('drw1', 'Pack Leader', 3, { summonDmg: 0.12 }, 'Wolves deal +12% damage per rank.'), T('drw2', 'Alpha', 3, { summonHp: 0.15 }, 'Wolves have +15% health per rank.'),
        T('drw3', 'Feral', 2, { dmg: 0.04 }, '+4% damage per rank.'), T('drw4', 'Thornhide', 2, { thorns: 8 }, 'Enemies that hit you take 8 damage per rank.'),
        T('drw5', 'Great Hunt', 1, { flag: 'greatHunt' }, 'Spirit Wolves calls three wolves that last 6s longer.')] },
      { name: 'Storm', nodes: [T('drs1', 'Static', 3, { 'storm.dmg': 0.15 }, 'Storm of the Grove deals +15% damage per rank.'), T('drs2', 'Gathering Clouds', 3, { 'storm.dur': 1 }, 'Storm of the Grove lasts 1s longer per rank.'),
        T('drs3', 'Rooted Earth', 2, { 'roots.dmg': 0.25 }, 'Entangling Roots deals +25% damage per rank.'), T('drs4', 'Spark', 2, { crit: 0.03 }, '+3% critical chance per rank.'),
        T('drs5', 'Eye of the Storm', 1, { flag: 'eyeStorm' }, 'Your storm follows you and strikes twice as often.')] },
    ],
    lightborn: [
      { name: 'Radiance', nodes: [T('lbr1', 'Inner Sun', 3, { dmg: 0.06 }, '+6% damage per rank.'), T('lbr2', 'Searing Light', 3, { 'sunbeam.dmg': 0.2 }, 'Sunbeam deals +20% damage per rank.'),
        T('lbr3', 'Judgement', 2, { 'smite.dmg': 0.25 }, 'Smite deals +25% damage per rank.'), T('lbr4', 'Brilliance', 2, { crit: 0.05 }, '+5% critical chance per rank.'),
        T('lbr5', 'Noon', 1, { flag: 'noon' }, 'Smite strikes a second time a moment later.')] },
      { name: 'Grace', nodes: [T('lbg1', 'Blessed', 3, { hp: 0.08 }, '+8% maximum health per rank.'), T('lbg2', 'Mercy', 3, { healPow: 0.15 }, 'Your healing is 15% stronger per rank.'),
        T('lbg3', 'Halo', 2, { armor: 0.05 }, 'Take 5% less damage per rank.'), T('lbg4', 'Shining Ward', 2, { thorns: 15 }, 'Enemies that hit you take 15 damage per rank.'),
        T('lbg5', 'Undying Light', 1, { flag: 'lastStand' }, 'Once a minute, a killing blow leaves you at 1 health and invulnerable for 2s.')] },
      { name: 'Swiftness', nodes: [T('lbs1', 'Lightfoot', 3, { speed: 0.05 }, '+5% movement speed per rank.'), T('lbs2', 'Flicker', 3, { 'blink.cdr': 0.15 }, 'Blink cooldown -15% per rank.'),
        T('lbs3', 'Wellspring', 2, { resGen: 0.25 }, '+25% Mana regeneration per rank.'), T('lbs4', 'Afterimage', 2, { dodgeCdr: 0.2 }, 'Dodge cooldown -20% per rank.'),
        T('lbs5', 'Sunrise', 1, { flag: 'sunrise' }, 'Dawnbreak cooldown -40%.')] },
    ],
  };
  // ---------- the skill web ----------
  // Each class has a star map: a free heart (which grants the first skill), three branches of skills,
  // passives and keystones, bridges between branches and the ultimate on the rim. A node can be bought
  // when it links to something you already own. Skills cost points from the same pool as passives.
  const BRIDGE = [{ hp: 0.04 }, { dmg: 0.03 }, { crit: 0.02 }];
  const BRIDGE_TXT = ['+4% maximum health per rank.', '+3% damage per rank.', '+2% critical chance per rank.'];
  const BRIDGE_NAME = ['Kinship', 'Convergence', 'Alignment'];
  V.WEB = {};
  for (const cls of V.ALL_CLASSES) {
    const sk = V.CLASSES[cls].skills, tree = V.TALENTS[cls], nodes = {}, list = [];
    const add = (n) => { n.links = n.links || []; nodes[n.id] = n; list.push(n); return n; };
    const link = (a, b) => { nodes[a].links.push(b); nodes[b].links.push(a); };
    add({ id: 'heart', kind: 'heart', name: V.CLASSES[cls].basic.name + ' & ' + V.SKILLS[sk[0]].name, max: 1, cost: 0, ring: 0, lat: 0, b: -1, skill: sk[0],
      desc: `Where every ${cls === 'hunter' ? 'witch hunter' : cls} begins. Grants ${V.SKILLS[sk[0]].name}.` });
    // give each branch the skill its talents upgrade most
    const pool = sk.slice(1, 4), pick = tree.map(() => null);
    const refs = (br, s) => br.nodes.reduce((c, n) => c + Object.keys(n.mod).filter((k) => k.startsWith(s + '.')).length, 0);
    for (let round = 0; round < 3; round++) {
      let best = null;
      tree.forEach((br, b) => { if (pick[b]) return; for (const s of pool) if (!pick.includes(s)) { const r = refs(br, s); if (!best || r > best[0]) best = [r, b, s]; } });
      pick[best[1]] = best[2];
    }
    tree.forEach((br, b) => {
      const n = br.nodes, s = pick[b];
      add({ id: s, kind: 'skill', skill: s, name: V.SKILLS[s].name, max: 1, cost: 1, ring: 1.15, lat: 0, b, desc: V.SKILLS[s].desc }); link('heart', s);
      const P = (t, ring, lat, kind) => add(Object.assign({}, t, { kind: kind || (t.mod.flag ? 'key' : 'passive'), cost: 1, ring, lat, b }));
      P(n[0], 2.2, 0); link(s, n[0].id);
      P(n[1], 3.2, -0.55); P(n[2], 3.2, 0.55); link(n[0].id, n[1].id); link(n[0].id, n[2].id);
      P(n[3], 4.2, 0); link(n[1].id, n[3].id); link(n[2].id, n[3].id);
      P(n[4], 5.3, 0); link(n[3].id, n[4].id);
    });
    // bridges between neighbouring branches, the ultimate between branches 0 and 1
    for (let b = 1; b <= 2; b++) {
      const id = cls + '_x' + b, right = (b + 1) % 3;
      add({ id, kind: 'passive', name: BRIDGE_NAME[b], max: 2, cost: 1, ring: 3.5, lat: 0, b: b + 0.5, mod: BRIDGE[b], desc: BRIDGE_TXT[b] });
      link(id, tree[b].nodes[2].id); link(id, tree[right].nodes[1].id);
    }
    const u = sk[4];
    add({ id: u, kind: 'ult', skill: u, name: V.SKILLS[u].name, max: 1, cost: 3, ring: 5.6, lat: 0, b: 0.5, desc: V.SKILLS[u].desc });
    link(u, tree[0].nodes[3].id); link(u, tree[1].nodes[3].id);
    V.WEB[cls] = { nodes, list };
  }
  V.webNode = (cls, id) => V.WEB[cls].nodes[id] || null;
  V.spentPoints = (cls, talents) => { let s = 0; for (const id in talents || {}) { const n = V.webNode(cls, id); if (n) s += (talents[id] | 0) * n.cost; } return s; };
  V.pointsLeft = (cls, level, talents) => V.talentPoints(level) - V.spentPoints(cls, talents);
  V.reachable = (cls, talents, id) => { const n = V.webNode(cls, id); return !!n && n.links.some((l) => l === 'heart' || (talents[l] | 0) > 0); };
  // can this character put one more point into node id?
  V.canLearn = (cls, level, talents, id) => {
    const n = V.webNode(cls, id);
    if (!n || n.kind === 'heart' || (talents[id] | 0) >= n.max) return false;
    return V.pointsLeft(cls, level, talents) >= n.cost && V.reachable(cls, talents, id);
  };
  // keep only what is still legal (connected, affordable), buying in order outward from the heart
  V.cleanTalents = (cls, level, raw) => {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (let pass = 0, more = true; more && pass < 20; pass++) {
      more = false;
      for (const n of V.WEB[cls].list) while ((out[n.id] | 0) < Math.min(n.max, raw[n.id] | 0) && V.canLearn(cls, level, out, n.id)) { out[n.id] = (out[n.id] | 0) + 1; more = true; }
    }
    return out;
  };
  V.ownedSkills = (cls, talents) => V.WEB[cls].list.filter((n) => n.skill && (n.kind === 'heart' || (talents[n.id] | 0) > 0)).map((n) => n.skill);
  // the 1-5 action bar: owned skills only, no duplicates
  V.cleanBar = (cls, talents, bar) => {
    const own = new Set(V.ownedSkills(cls, talents)), out = [null, null, null, null, null];
    if (Array.isArray(bar)) bar.slice(0, 5).forEach((s, i) => { if (own.has(s) && !out.includes(s)) out[i] = s; });
    return out;
  };
  V.computeMods = (cls, talents) => {
    const m = { dmg: 0, crit: 0, hp: 0, armor: 0, speed: 0, leech: 0, thorns: 0, resGen: 0, execute: 0, basicRange: 0, summonDmg: 0, summonHp: 0,
      dodgeCdr: 0, poison: 0, magicDmg: 0, healPow: 0, skill: {}, flags: new Set() };
    for (const n of V.WEB[cls].list) {
      const r = talents[n.id] | 0;
      if (!r || !n.mod) continue;
      for (const [k, v] of Object.entries(n.mod)) {
        if (k === 'flag') m.flags.add(v);
        else if (k.includes('.')) { const [s, f] = k.split('.'); (m.skill[s] || (m.skill[s] = {}))[f] = (m.skill[s][f] || 0) + v * r; }
        else m[k] += v * r;
      }
    }
    return m;
  };

  // ---------- enemies ----------
  // ai: melee | charger | ranged | tank | boss. sprite + pal pick the art; k is the pixel scale of the art.
  V.FOES = {
    hollow: { name: 'Hollow', sprite: 'hollow', pal: 'hollow', k: 1.55, hp: 80, dmg: 12, speed: 84, range: 40, windup: 0.45, cd: 1.3, aggro: 300, r: 15, h: 48, ai: 'melee' },
    wolf: { name: 'Dire Wolf', sprite: 'wolf', pal: 'wolf', k: 1.6, hp: 62, dmg: 10, speed: 118, range: 38, windup: 0.35, cd: 1.1, aggro: 320, r: 15, h: 32, ai: 'charger' },
    skeleton: { name: 'Barrow Skeleton', sprite: 'skelwar', pal: 'bone', k: 1.5, hp: 78, dmg: 13, speed: 82, range: 42, windup: 0.45, cd: 1.3, aggro: 300, r: 14, h: 46, ai: 'melee' },
    archer: { name: 'Skeleton Archer', sprite: 'skelarcher', pal: 'bone', k: 1.5, hp: 56, dmg: 11, speed: 72, range: 240, windup: 0.6, cd: 2.0, aggro: 330, r: 13, h: 46, ai: 'ranged',
      proj: { speed: 280, color: '#e6dfc8', size: 2 } },
    wisp: { name: 'Grave Wisp', sprite: 'wisp', pal: 'grave', k: 1.6, hp: 52, dmg: 11, speed: 72, range: 220, windup: 0.55, cd: 2.2, aggro: 340, r: 12, h: 50, ai: 'ranged', magic: true, float: true,
      proj: { speed: 170, color: '#9ad8ff', size: 3 } },
    drowned: { name: 'Drowned', sprite: 'hollow', pal: 'drowned', k: 1.7, hp: 135, dmg: 16, speed: 62, range: 44, windup: 0.55, cd: 1.5, aggro: 280, r: 17, h: 52, ai: 'melee' },
    cinder: { name: 'Cinder Hollow', sprite: 'hollow', pal: 'cinder', k: 1.6, hp: 95, dmg: 15, speed: 90, range: 40, windup: 0.4, cd: 1.2, aggro: 300, r: 15, h: 50, ai: 'melee' },
    imp: { name: 'Ember Imp', sprite: 'imp', pal: 'ember', k: 1.6, hp: 48, dmg: 10, speed: 112, range: 200, windup: 0.45, cd: 1.7, aggro: 320, r: 12, h: 44, ai: 'ranged', magic: true, float: true,
      proj: { speed: 230, color: '#ff8a3a', size: 3 } },
    golem: { name: 'Ash Golem', sprite: 'golem', pal: 'ash', k: 1.7, hp: 270, dmg: 24, speed: 52, range: 62, windup: 0.85, cd: 2.2, aggro: 280, r: 24, h: 70, ai: 'tank', slam: 92 },
    frostwolf: { name: 'Rime Wolf', sprite: 'wolf', pal: 'frost', k: 1.7, hp: 110, dmg: 16, speed: 124, range: 40, windup: 0.35, cd: 1.1, aggro: 330, r: 16, h: 34, ai: 'charger' },
    wraith: { name: 'Frost Wraith', sprite: 'wraith', pal: 'frost', k: 1.6, hp: 95, dmg: 15, speed: 76, range: 230, windup: 0.6, cd: 2.0, aggro: 340, r: 14, h: 54, ai: 'ranged', magic: true, float: true,
      proj: { speed: 200, color: '#a8e8ff', size: 3, slow: 1.5 } },
    icegolem: { name: 'Glacial Golem', sprite: 'golem', pal: 'ice', k: 1.8, hp: 360, dmg: 30, speed: 50, range: 66, windup: 0.9, cd: 2.3, aggro: 280, r: 26, h: 74, ai: 'tank', slam: 100 },
    stalker: { name: 'Void Stalker', sprite: 'wolf', pal: 'void', k: 1.8, hp: 150, dmg: 22, speed: 130, range: 42, windup: 0.3, cd: 1.0, aggro: 340, r: 17, h: 36, ai: 'charger', magic: true },
    voidwisp: { name: 'Void Wisp', sprite: 'wisp', pal: 'void', k: 1.7, hp: 120, dmg: 20, speed: 78, range: 240, windup: 0.5, cd: 1.9, aggro: 350, r: 13, h: 52, ai: 'ranged', magic: true, float: true,
      proj: { speed: 210, color: '#c58bff', size: 3 } },
    hknight: { name: 'Hollow Knight', sprite: 'hollow', pal: 'knight', k: 2.1, hp: 420, dmg: 32, speed: 64, range: 58, windup: 0.7, cd: 1.8, aggro: 300, r: 22, h: 68, ai: 'tank', slam: 86 },
    // bosses
    thornback: { name: 'Old Thornback', sprite: 'wolf', pal: 'thornback', k: 2.9, hp: 900, dmg: 22, speed: 100, range: 64, windup: 0.6, cd: 1.6, aggro: 360, r: 32, h: 62, ai: 'boss', boss: true,
      abilities: [{ kind: 'charge', cd: 7, windup: 0.8 }, { kind: 'summon', cd: 16, windup: 1.0, add: 'wolf', n: 3 }] },
    matron: { name: 'The Drowned Matron', sprite: 'wraith', pal: 'drowned', k: 2.8, hp: 1500, dmg: 28, speed: 70, range: 220, windup: 0.7, cd: 2.0, aggro: 360, r: 28, h: 96, ai: 'boss', boss: true, magic: true, float: true,
      proj: { speed: 190, color: '#7fe0c0', size: 4 },
      abilities: [{ kind: 'nova', cd: 6, windup: 0.9, n: 16 }, { kind: 'summon', cd: 15, windup: 1.0, add: 'drowned', n: 2 }] },
    warden: { name: 'Ember Warden', sprite: 'hollow', pal: 'warden', k: 2.7, hp: 2100, dmg: 34, speed: 70, range: 76, windup: 0.75, cd: 1.9, aggro: 360, r: 30, h: 92, ai: 'boss', boss: true, magic: true, slam: 130,
      proj: { speed: 220, color: '#ff8a3a', size: 4 },
      abilities: [{ kind: 'slam', cd: 6, windup: 1.0 }, { kind: 'nova', cd: 9, windup: 0.9, n: 14 }, { kind: 'summon', cd: 18, windup: 1.0, add: 'imp', n: 3 }] },
    revenant: { name: 'Frost Revenant', sprite: 'golem', pal: 'frostboss', k: 2.8, hp: 3200, dmg: 40, speed: 66, range: 80, windup: 0.8, cd: 2.0, aggro: 360, r: 34, h: 112, ai: 'boss', boss: true, slam: 140,
      proj: { speed: 220, color: '#a8e8ff', size: 4, slow: 2 },
      abilities: [{ kind: 'slam', cd: 6, windup: 1.0 }, { kind: 'charge', cd: 9, windup: 0.8 }, { kind: 'nova', cd: 11, windup: 0.9, n: 18 }] },
    hollowking: { name: 'The Hollow King', sprite: 'hollow', pal: 'king', k: 3.2, hp: 5200, dmg: 50, speed: 72, range: 84, windup: 0.75, cd: 1.8, aggro: 380, r: 36, h: 110, ai: 'boss', boss: true, magic: true, slam: 150,
      proj: { speed: 230, color: '#c58bff', size: 4 },
      abilities: [{ kind: 'slam', cd: 6, windup: 1.0 }, { kind: 'nova', cd: 8, windup: 0.9, n: 20 }, { kind: 'charge', cd: 10, windup: 0.8 }, { kind: 'summon', cd: 20, windup: 1.2, add: 'hknight', n: 2 }] },
    dummy: { name: 'Training Dummy', sprite: 'dummy', k: 1, hp: 1000, dmg: 0, speed: 0, r: 14, h: 50, ai: 'none' },
  };
  for (const [k, d] of Object.entries(V.FOES)) d.art = d.art || k; // sprite sheet key in assets/foes
  V.MINION_ART = { skeleton: 'skelminion', wolf: 'spiritwolf' };
  V.foeStats = (type, lv, elite) => {
    const d = V.FOES[type];
    return { hp: Math.round(d.hp * (1 + 0.16 * (lv - 1)) * (elite ? 2.5 : 1)), dmg: d.dmg * (1 + 0.12 * (lv - 1)) * (elite ? 1.4 : 1) };
  };

  // ---------- zones (index matches world.js zone ids) ----------
  V.ZONE_INFO = [
    { name: 'Vaelmort Gate', sub: 'The last lit stones. You are safe here.', lv: [0, 0], dark: 0.4, safe: true },
    { name: 'Mourning Wood', sub: 'Hollows walk between the pines', lv: [1, 6], dark: 0.58,
      spawns: [['hollow', 16], ['wolf', 12]], boss: 'thornback',
      bounties: [{ name: 'Cull the Hollows', types: ['hollow'], n: 8 }, { name: 'Thin the Pack', types: ['wolf'], n: 6 }, { name: 'The Old Wolf', types: ['thornback'], n: 1 }] },
    { name: 'Drowned Graves', sub: 'Wisps drift over black water', lv: [8, 13], dark: 0.58,
      spawns: [['wisp', 12], ['drowned', 12], ['archer', 6]], boss: 'matron',
      bounties: [{ name: 'Lay the Wisps to Rest', types: ['wisp'], n: 8 }, { name: 'Return the Drowned', types: ['drowned'], n: 8 }, { name: 'The Matron Below', types: ['matron'], n: 1 }] },
    { name: 'Ember Ruins', sub: 'The Warden keeps the old flame', lv: [12, 17], dark: 0.5,
      spawns: [['cinder', 12], ['imp', 10], ['golem', 7]], boss: 'warden',
      bounties: [{ name: 'Snuff the Cinders', types: ['cinder'], n: 8 }, { name: 'Golem Breaker', types: ['golem'], n: 4 }, { name: 'The Ember Warden', types: ['warden'], n: 1 }] },
    { name: 'Bleak Moor', sub: 'Barrows split open in the wind', lv: [4, 9], dark: 0.45,
      spawns: [['skeleton', 12], ['archer', 10], ['wolf', 6]],
      bounties: [{ name: 'Barrow Watch', types: ['skeleton'], n: 8 }, { name: 'Break the Bows', types: ['archer'], n: 6 }] },
    { name: 'Frostmire', sub: 'Nothing thaws here, not even the dead', lv: [17, 23], dark: 0.42,
      spawns: [['frostwolf', 14], ['wraith', 12], ['icegolem', 7]], boss: 'revenant',
      bounties: [{ name: 'Wolves of the Rime', types: ['frostwolf'], n: 8 }, { name: 'Shatter the Wraiths', types: ['wraith'], n: 8 }, { name: 'The Frost Revenant', types: ['revenant'], n: 1 }] },
    { name: 'Sundered Reach', sub: 'Where the Hollow King waits', lv: [23, 30], dark: 0.62,
      spawns: [['stalker', 14], ['voidwisp', 12], ['hknight', 8]], boss: 'hollowking',
      bounties: [{ name: 'Stalk the Stalkers', types: ['stalker'], n: 8 }, { name: 'Void Lights', types: ['voidwisp'], n: 8 }, { name: 'Knights of Nothing', types: ['hknight'], n: 5 }, { name: 'The Hollow King', types: ['hollowking'], n: 1 }] },
  ];
  V.bountyReward = (zone) => Math.round(V.xpNext(Math.max(1, V.ZONE_INFO[zone].lv[1])) * 0.3);

  V.FIELD_KINDS = ['fire', 'bloom', 'banner', 'plague', 'smoke', 'trap', 'rain', 'storm'];
  V.FOE_STATES = ['idle', 'chase', 'windup', 'recover', 'return', 'dash'];
  V.ABILITIES = ['basic', 'slam', 'nova', 'summon', 'charge'];
  V.MINION_KINDS = ['skeleton', 'wolf'];
  // player buff bits sent to every client in view
  V.BUFF_BITS = { bulwark: 1, avatar: 2, barkskin: 4, shield: 8, invis: 16, whirl: 32, banner: 64, rally: 128, empowered: 256 };

  // nameplate colour by level difference (grey easy ... red dangerous)
  V.levelColor = (me, them) => { const d = them - me; return d >= 5 ? '#ff4a4a' : d >= 3 ? '#ff9a3c' : d >= -2 ? '#f2e27a' : d >= -6 ? '#6fdc6f' : '#9a9aa6'; };

  const ROWS = [2, 1, 0, 7, 6, 5, 4, 3]; // octant (E=0, clockwise, y down) -> sheet row S,SE,E,NE,N,NW,W,SW
  V.dirRow = (dx, dy) => ROWS[((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8];
  V.angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  V.gdist = (ax, ay, bx, by) => Math.hypot(bx - ax, (by - ay) * 2); // distance on the ground plane
  V.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  V.NAME_RE = /^[A-Za-z][A-Za-z0-9_]{2,15}$/;

  V.crackLines = function (seed, scale = 1) {
    const R = V.rng(seed), lines = [];
    for (let i = 0; i < 10; i++) {
      let ang = i / 10 * Math.PI * 2 + (R() - 0.5) * 0.4, x = 0, y = 0;
      const pts = [[0, 0]], L = (70 + R() * 55) * scale;
      for (let s = 1; s <= 5; s++) { ang += (R() - 0.5) * 0.9; x += Math.cos(ang) * L / 5; y += Math.sin(ang) * L / 10; pts.push([x, y]); }
      lines.push(pts);
    }
    return lines;
  };
  V.bloomPoints = function (seed) {
    const R = V.rng(seed), pts = [];
    for (let i = 0; i < 70; i++) { const b = R() * Math.PI * 2, r = Math.sqrt(R()) * 108; pts.push([Math.cos(b) * r, Math.sin(b) * r * 0.5, R(), (R() * 4) | 0]); }
    return pts;
  };

  V.makeCollision = function (map) {
    const N = V.N;
    function blockedGround(x, y) {
      const [tx, ty] = V.toTile(x, y), i = Math.floor(tx), j = Math.floor(ty);
      if (i < 0 || j < 0 || i >= N || j >= N) return true;
      return map.solid[j * N + i] === 1;
    }
    function hitProp(x, y, r) {
      const [tx, ty] = V.toTile(x, y), i = Math.floor(tx), j = Math.floor(ty);
      for (let b = j - 1; b <= j + 1; b++) for (let a = i - 1; a <= i + 1; a++) {
        if (a < 0 || b < 0 || a >= N || b >= N) continue;
        const list = map.grid[b * N + a];
        if (!list) continue;
        for (const p of list) { const dx = x - p.x, dy = (y - p.y) * 2; if (dx * dx + dy * dy < (r + p.r) ** 2) return p; }
      }
      return null;
    }
    const solidAt = (x, y, r) => blockedGround(x, y) || blockedGround(x + r, y) || blockedGround(x - r, y) ||
      blockedGround(x, y + r / 2) || blockedGround(x, y - r / 2) || !!hitProp(x, y, r);
    function moveEnt(e, dx, dy, r) {
      if (!solidAt(e.x + dx, e.y, r)) e.x += dx;
      if (!solidAt(e.x, e.y + dy, r)) e.y += dy;
    }
    // furthest free point along a straight path (for dashes and leaps)
    function pathEnd(x0, y0, x1, y1, r, stopAtWalls) {
      const L = Math.hypot(x1 - x0, y1 - y0);
      if (L < 1) return [x0, y0];
      let best = 0;
      for (let s = 6; s <= L; s += 6) { if (!solidAt(x0 + (x1 - x0) * s / L, y0 + (y1 - y0) * s / L, r)) best = s; else if (stopAtWalls) break; }
      if (!solidAt(x1, y1, r)) best = L;
      return [x0 + (x1 - x0) * best / L, y0 + (y1 - y0) * best / L];
    }
    return { blockedGround, hitProp, solidAt, moveEnt, pathEnd };
  };
})(typeof window !== 'undefined' ? window : globalThis);
