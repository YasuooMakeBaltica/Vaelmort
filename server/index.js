// Vaelmort game server: serves the client files and runs the shared world over WebSockets at /ws.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { createStore } = require('./store');

globalThis.window = globalThis;
const ROOT = path.join(__dirname, '..');
require(path.join(ROOT, 'src/world.js'));
require(path.join(ROOT, 'src/shared.js'));
require(path.join(ROOT, 'src/quests.js'));
require(path.join(ROOT, 'src/sim.js'));
const V = globalThis.V;

const PORT = +process.env.PORT || 8080;
const TICK = 0.05; // 20 simulation steps per second
const SEND_EVERY = 2; // 10 network updates per second
const MAX_PLAYERS = +process.env.MAX_PLAYERS || 64;
const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;

const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/heroes/heroes.json'), 'utf8'));
const map = V.generate(V.SEED);
const world = V.createSim(map, meta, { validate: true }); world.pending = [];
const instances = new Map(); // dungeon instances: id -> { id, zone, mode, sim, party, endT }
let nextInst = 1;
const sims = () => [world, ...[...instances.values()].map((d) => d.sim)];
const online = () => sims().reduce((n, s) => n + s.players.size, 0);
const store = createStore();

// ---------- static files ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.mp3': 'audio/mpeg', '.md': 'text/markdown; charset=utf-8' };
const PUBLIC = [/^index\.html$/, /^admin\.html$/, /^src\/[a-z]+\.js$/, /^assets\/heroes\/heroes\.json$/, /^assets\/heroes\/sheets\/[a-z_]+\.png$/, /^assets\/foes\/foes\.json$/, /^assets\/foes\/[a-z_]+\.png$/, /^assets\/props\/props\.json$/, /^assets\/npcs\/npcs\.json$/, /^assets\/npcs\/sheets\/[a-z_]+\.png$/, /^assets\/props\/[a-z_0-9]+\.png$/, /^assets\/music\/[a-z]+\.mp3$/, /^assets\/sfx\/sfx\.json$/, /^assets\/sfx\/[A-Za-z]+_\d+\.mp3$/];
// every deploy gets a new version tag on the script links, so browsers never mix a new page with old cached code
const BUILD = Date.now().toString(36);
const indexHtml = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
  .replace(/(<script src="src\/[a-z]+\.js)"/g, `$1?v=${BUILD}"`)
  .replace(/<meta name="vaelmort-server" content="[^"]*">/, '<meta name="vaelmort-server" content="same-origin">');
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok ' + online()); return; }
  let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  if (!PUBLIC.some((re) => re.test(rel))) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found'); return; }
  try {
    const html = rel.endsWith('.html'), body = html ? indexHtml(rel) : fs.readFileSync(path.join(ROOT, rel));
    const range = !html && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || ''); // audio streams ask for byte ranges (Safari requires it)
    if (range) {
      const start = range[1] ? +range[1] : body.length - +range[2], end = range[1] && range[2] ? Math.min(+range[2], body.length - 1) : body.length - 1;
      if (start >= body.length || start < 0 || start > end) { res.writeHead(416, { 'content-range': `bytes */${body.length}` }); res.end(); return; }
      res.writeHead(206, { 'content-type': TYPES[path.extname(rel)] || 'application/octet-stream', 'content-range': `bytes ${start}-${end}/${body.length}`, 'accept-ranges': 'bytes', 'content-length': end - start + 1, 'cache-control': 'public, max-age=86400' });
      res.end(body.subarray(start, end + 1)); return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(rel)] || 'application/octet-stream', 'cache-control': html ? 'no-cache' : 'public, max-age=300' });
    res.end(body);
  } catch (e) { res.writeHead(404); res.end('Not found'); }
});

// ---------- sockets ----------
const wss = new WebSocketServer({
  server, path: '/ws', maxPayload: 4096,
  // compress messages; level 1 is fast enough for the free 0.1 CPU and still shrinks the JSON several times
  perMessageDeflate: { threshold: 128, zlibDeflateOptions: { level: 1, memLevel: 7 } },
});
const clients = new Map(); // ws -> { acct, pid, chatT, authTries }
let nextPid = 1;
const send = (ws, m) => { if (ws.readyState === 1) ws.send(typeof m === 'string' ? m : JSON.stringify(m)); };
const broadcast = (m) => { const s = JSON.stringify(m); for (const [ws, c] of clients) if (c.pid) send(ws, s); };
const clean = (s) => Array.from(String(s), (ch) => { const c = ch.codePointAt(0); return c < 32 || c === 127 || c === 0x2028 || c === 0x2029 ? ' ' : ch; }).join('').trim();

async function signIn(ws, c, m) {
  if (c.acct) return;
  if (++c.authTries > 8) { send(ws, { t: 'error', msg: 'Too many attempts. Wait a minute and try again.' }); ws.close(); return; }
  if (clients.size > MAX_PLAYERS * 2) { send(ws, { t: 'error', msg: 'The realm is full right now. Try again soon.' }); return; }
  let acct = null;
  try {
    if (m.t === 'resume') {
      acct = await store.resume(m.token);
      if (!acct) { send(ws, { t: 'error', msg: 'Your saved sign-in has expired. Log in again.' }); return; }
    } else {
      const name = typeof m.name === 'string' ? m.name.trim() : '', pass = typeof m.pass === 'string' ? m.pass : '';
      if (!NAME_RE.test(name)) { send(ws, { t: 'error', msg: 'Account names are 3–16 letters, numbers or underscores.' }); return; }
      if (pass.length < 6 || pass.length > 128) { send(ws, { t: 'error', msg: 'Use a password of at least 6 characters.' }); return; }
      if (m.t === 'register') {
        acct = await store.register(name, pass);
        if (!acct) { send(ws, { t: 'error', msg: 'That account name is taken. Pick another, or log in if it is yours.' }); return; }
      } else {
        acct = await store.login(name, pass);
        if (!acct) { send(ws, { t: 'error', msg: 'Wrong account name or password.' }); return; }
      }
    }
  } catch (e) {
    console.error('auth error', e);
    send(ws, { t: 'error', msg: 'The server could not reach its database. Try again shortly.' });
    return;
  }
  if (ws.readyState !== 1) return;
  if (acct.banned) { send(ws, { t: 'error', msg: 'This account is banned.' }); return; }
  // one session per account: the newest sign-in wins
  // (the web admin panel is a separate connection and never kicks or is kicked by the game)
  c.panel = !!m.panel;
  if (c.panel && !acct.admin) { send(ws, { t: 'error', msg: 'That account is not an admin.' }); return; }
  if (!c.panel) for (const [other, oc] of clients) if (oc.acct && !oc.panel && oc.acct.key === acct.key && other !== ws) { send(other, { t: 'error', msg: 'You signed in somewhere else.' }); other.close(); }
  c.acct = acct;
  const token = await store.newSession(acct.key);
  send(ws, { t: 'account', name: acct.name, token, admin: acct.admin ? 1 : 0 });
  await sendChars(ws, c);
}

const charView = (ch) => ({ id: ch.id, name: ch.name, cls: ch.cls, level: ch.level, kills: ch.kills });
async function sendChars(ws, c) { c.chars = await store.listChars(c.acct.key); send(ws, { t: 'chars', list: c.chars.map(charView), max: c.acct.admin ? 99 : V.MAX_CHARS }); }

async function createChar(ws, c, m) {
  const admin = !!c.acct.admin; // admins: any name up to 24 characters, taken names allowed, no character limit
  const name = typeof m.name === 'string' ? (admin ? clean(m.name).replace(/\s+/g, ' ').slice(0, 24) : m.name.trim()) : '';
  if (admin ? !name : !V.NAME_RE.test(name)) { send(ws, { t: 'error', msg: 'Character names are 3–16 letters, numbers or underscores and start with a letter.' }); return; }
  if (!V.CLASSES[m.cls] || (!c.acct.admin && !V.ORDER.includes(m.cls))) { send(ws, { t: 'error', msg: 'Pick a class.' }); return; }
  if (!admin && (c.chars || []).length >= V.MAX_CHARS) { send(ws, { t: 'error', msg: `You can have up to ${V.MAX_CHARS} characters. Delete one to make room.` }); return; }
  if (!admin && await store.charNameTaken(name)) { send(ws, { t: 'error', msg: 'That character name is taken.' }); return; }
  const ch = await store.createChar(c.acct.key, name, m.cls, admin ? name.toLowerCase() + '~' + Date.now().toString(36) : undefined);
  if (!ch) { send(ws, { t: 'error', msg: 'That character name is taken.' }); return; }
  await sendChars(ws, c);
  play(ws, c, ch.id);
}

async function play(ws, c, charId) {
  if (c.pid) return;
  const ch = (c.chars || []).find((x) => x.id === charId);
  if (!ch) { send(ws, { t: 'error', msg: 'That character no longer exists.' }); return; }
  if (online() >= MAX_PLAYERS) { send(ws, { t: 'error', msg: 'The realm is full right now. Try again soon.' }); return; }
  c.char = ch; c.pid = nextPid++; c.foeCache = new Map(); c.sim = world; c.epoch = 0;
  const p = world.addPlayer(c.pid, Object.assign({}, ch, { admin: !!c.acct.admin }));
  send(ws, { t: 'welcome', id: c.pid, name: p.name, cls: p.cls, level: p.level, talents: p.talents, refunded: p.refunded ? 1 : 0, inv: p.bag, eq: p.eq, x: p.x, y: p.y, seq: p.seq, foes: world.foeList(), quests: p.quests, found: p.found });
  if (p.refunded) saveChar(c); // the skill-web refund happens once
  console.log(`+ ${p.name} (${c.acct.name}, ${online()} online)`);
}

// ---------- admin ----------
const reply = (ws, op, extra) => send(ws, Object.assign({ t: 'admin', op }, extra));
function clientByPid(pid) { for (const [w, c] of clients) if (c.pid === pid) return [w, c]; return [null, null]; }
async function adminList(ws) {
  const players = [];
  for (const [, c] of clients) if (c.pid) { const p = c.sim.players.get(c.pid); if (p) players.push({ pid: c.pid, name: p.name, cls: p.cls, level: p.level, acct: c.acct.name, zone: c.sim.dun ? V.DUNGEONS[c.sim.dun.zone].name + ' (' + V.DUN_MODES[c.sim.dun.mode].name + ')' : V.ZONE_INFO[Math.max(0, p.zone)].name }); }
  reply(ws, 'list', { players, admins: await store.flagged('admin'), banned: await store.flagged('banned'), foes: Object.keys(V.FOES).filter((k) => k !== 'dummy') });
}
async function adminOp(ws, c, m) {
  const a = await store.getAccount(c.acct.key); // re-check every time: admin can be removed while signed in
  if (!a || !a.admin) { reply(ws, 'error', { msg: 'You are not an admin.' }); return; }
  const say = (msg) => reply(ws, 'ok', { msg });
  const [tw, tc] = Number.isInteger(m.pid) ? clientByPid(m.pid) : [null, null];
  const target = tc && tc.sim.players.get(tc.pid);
  switch (m.op) {
    case 'list': return adminList(ws);
    case 'kick':
      if (!tw) return say('That player is not online.');
      send(tw, { t: 'error', msg: 'You were kicked by an admin.' }); tw.close(); console.log(`admin ${a.name} kicked ${tc.acct.name}`);
      return say(`Kicked ${target ? target.name : tc.acct.name}.`);
    case 'ban': case 'unban': {
      const name = typeof m.name === 'string' ? m.name.trim() : (tc ? tc.acct.name : '');
      if (!name || name.toLowerCase() === a.key) return say('Pick another account.');
      if (!(await store.setFlag(name, 'banned', m.op === 'ban'))) return say(`No account named ${name}.`);
      if (m.op === 'ban') for (const [w, oc] of clients) if (oc.acct && oc.acct.key === name.toLowerCase()) { send(w, { t: 'error', msg: 'This account is banned.' }); w.close(); }
      console.log(`admin ${a.name} ${m.op}ned ${name}`);
      await adminList(ws); return say(`${m.op === 'ban' ? 'Banned' : 'Unbanned'} ${name}.`);
    }
    case 'xp': {
      const n = Math.max(1, Math.min(10000000, m.n | 0));
      if (!target) return say('That player is not online.');
      tc.sim.giveXp(tc.pid, n); saveChar(tc);
      return say(`Gave ${target.name} ${n.toLocaleString()} XP.`);
    }
    case 'tp': {
      if (!c.pid) return say('Enter the world to teleport.');
      if (!target) return say('That player is not online.');
      if (tc.sim !== c.sim) return say(`${target.name} is in ${tc.sim.dun ? 'a dungeon' : 'the overworld'}; you can only teleport to players in the same world.`);
      c.sim.teleport(c.pid, target.x + 30, target.y + 10);
      return say(`Teleported to ${target.name}.`);
    }
    case 'spawn': {
      if (!V.FOES[m.type] || m.type === 'dummy') return say('Unknown enemy.');
      const at = c.pid ? c.sim.players.get(c.pid) : target, ss = c.pid ? c.sim : tc && tc.sim;
      if (!at) return say('Enter the world, or pick a player to spawn next to.');
      const n = ss.spawnFoes(m.type, Math.max(1, Math.min(20, m.n | 0 || 1)), at.x, at.y, Math.max(1, Math.min(V.MAX_LEVEL + 5, m.level | 0 || at.level)));
      return say(n ? `Spawned ${n} ${V.FOES[m.type].name}.` : 'Too many spawned enemies already.');
    }
    case 'give': {
      const pid = Number.isInteger(m.pid) ? m.pid : c.pid, tc2 = clientByPid(pid)[1];
      if (!pid || !tc2) return say(c.pid ? 'That player is not online.' : 'Pick a player (or enter the world to give yourself an item).');
      const slot = Math.max(0, Math.min(V.SLOTS.length - 1, m.slot | 0)), rarity = Math.max(0, Math.min(V.RARITY.length - 1, m.rarity | 0));
      const level = Math.max(1, Math.min(V.MAX_LEVEL, m.level | 0 || 1)), base = typeof m.base === 'string' ? m.base : '';
      let custom = null;
      if (m.custom && typeof m.custom === 'object') { // stats arrive in display units: percentages, thorns as a number
        const stats = {};
        for (const [k, v] of Object.entries(m.custom.stats || {})) if (V.AFFIX[k] && Number.isFinite(+v) && +v > 0) stats[k] = k === 'thorns' ? Math.min(5000, +v) : Math.min(500, +v) / 100;
        custom = { name: typeof m.custom.name === 'string' ? clean(m.custom.name).slice(0, 40) : '', stats };
      }
      const it = tc2.sim.giveItem(pid, slot, rarity, level, base, custom);
      if (!it) return say('That player is not online.');
      if (it === 'full') return say('Their bags are full.');
      saveChar(tc2); console.log(`admin ${a.name} gave ${it.n} (${V.RARITY[it.r].name}, lv ${it.lv}) to ${tc2.char.name}`);
      return say(`Gave ${it.n} (${V.RARITY[it.r].name} ${V.SLOT_NAME[it.s]}, level ${it.lv}) to ${tc2.char.name}.`);
    }
    case 'announce': {
      const text = clean(m.text).slice(0, 200);
      if (!text) return;
      for (const [w, oc] of clients) if (oc.acct) send(w, { t: 'announce', text, from: a.name });
      console.log(`announcement by ${a.name}: ${text}`);
      return say('Announcement sent.');
    }
    case 'admin': case 'unadmin': {
      const name = typeof m.name === 'string' ? m.name.trim() : '';
      if (!name || (m.op === 'unadmin' && name.toLowerCase() === a.key)) return say('You cannot remove yourself.');
      if (!(await store.setFlag(name, 'admin', m.op === 'admin'))) return say(`No account named ${name}.`);
      for (const [w, oc] of clients) if (oc.acct && oc.acct.key === name.toLowerCase()) { oc.acct.admin = m.op === 'admin'; send(w, { t: 'adminflag', admin: oc.acct.admin ? 1 : 0 }); }
      console.log(`admin ${a.name} ${m.op === 'admin' ? 'added' : 'removed'} admin ${name}`);
      await adminList(ws); return say(`${name} ${m.op === 'admin' ? 'is now an admin' : 'is no longer an admin'}.`);
    }
  }
}

// ---------- parties (up to V.PARTY_MAX, across worlds) ----------
const parties = new Map(); // id -> { id, leader, members: [pid], inst }
let nextParty = 1;
const cOf = (pid) => clientByPid(pid)[1];
function partyView(P) {
  return { t: 'party', id: P.id, leader: P.leader, inst: P.inst && instances.has(P.inst) ? instances.get(P.inst).zone : 0, members: P.members.map((pid) => {
    const mc = cOf(pid), p = mc && mc.sim && mc.sim.players.get(pid);
    if (!p) return { pid, name: '?', cls: 'knight', level: 1, hp: 0, maxHp: 1, dead: 1, where: '' };
    const dun = mc.sim.dun;
    return { pid, name: p.name, cls: p.cls, level: p.level, hp: Math.ceil(p.hp), maxHp: p.maxHp, dead: p.dead > 0 ? 1 : 0, where: dun ? V.DUNGEONS[dun.zone].name : V.ZONE_INFO[Math.max(0, p.zone)].name, dun: dun ? 1 : 0, lives: dun ? mc.sim.lives.get(pid) ?? V.DUN_LIVES : -1 };
  }) };
}
function sendParty(P) { const v = JSON.stringify(partyView(P)); for (const pid of P.members) { const [w] = clientByPid(pid); if (w) send(w, v); } }
const sysTo = (ws, text) => send(ws, { t: 'chat', sys: 1, text });
function partyInvite(ws, c, m) {
  let tw, tc;
  if (Number.isInteger(m.pid)) [tw, tc] = clientByPid(m.pid);
  else if (typeof m.name === 'string') { const nm = m.name.trim().toLowerCase(); for (const [w, oc] of clients) if (oc.pid && oc.char && oc.char.name.toLowerCase() === nm) { tw = w; tc = oc; } }
  if (!tc || !tc.pid) return sysTo(ws, 'That player is not online.');
  if (tc === c) return sysTo(ws, 'You cannot invite yourself.');
  let P = parties.get(c.party);
  if (P && P.leader !== c.pid) return sysTo(ws, 'Only the party leader can invite.');
  if (P && P.members.length >= V.PARTY_MAX) return sysTo(ws, `A party holds at most ${V.PARTY_MAX}.`);
  if (tc.party) return sysTo(ws, `${tc.char.name} is already in a party.`);
  tc.invites.set(c.pid, Date.now() + 60000);
  send(tw, { t: 'pinvite', from: c.pid, name: c.char.name });
  sysTo(ws, `Invited ${tc.char.name} to your party.`);
}
function partyAccept(ws, c, from) {
  const exp = c.invites.get(from); c.invites.delete(from);
  const fc = cOf(from);
  if (!exp || exp < Date.now() || !fc || !fc.pid) return sysTo(ws, 'That invite has expired.');
  if (c.party) return sysTo(ws, 'Leave your party first.');
  let P = parties.get(fc.party);
  if (P && P.leader !== from) return sysTo(ws, 'That invite has expired.');
  if (!P) { P = { id: nextParty++, leader: from, members: [from], inst: 0 }; parties.set(P.id, P); fc.party = P.id; }
  if (P.members.length >= V.PARTY_MAX) return sysTo(ws, 'That party is full.');
  P.members.push(c.pid); c.party = P.id; c.invites.clear();
  for (const pid of P.members) { const [w] = clientByPid(pid); if (w) sysTo(w, pid === c.pid ? `You joined ${fc.char.name}'s party.` : `${c.char.name} joined the party.`); }
  sendParty(P);
}
function leaveParty(c, quiet) {
  const P = parties.get(c.party);
  c.party = 0;
  if (!P) return;
  P.members = P.members.filter((pid) => pid !== c.pid);
  const [w] = clientByPid(c.pid); if (w && !quiet) { send(w, { t: 'party', id: 0 }); sysTo(w, 'You left the party.'); }
  if (c.sim && c.sim.dun && !quiet) leaveDungeon(c); // the dungeon belongs to the party
  if (P.members.length <= 1) { // a party of one is no party
    for (const pid of P.members) { const oc = cOf(pid); if (oc) { oc.party = 0; const [ow] = clientByPid(pid); if (ow) { send(ow, { t: 'party', id: 0 }); sysTo(ow, 'Your party has disbanded.'); } } }
    parties.delete(P.id); return;
  }
  if (P.leader === c.pid) P.leader = P.members[0];
  for (const pid of P.members) { const [ow] = clientByPid(pid); if (ow) sysTo(ow, `${c.char ? c.char.name : 'Someone'} left the party.${P.leader !== c.pid && pid === P.leader ? ' You lead it now.' : ''}`); }
  sendParty(P);
}
function partyKick(c, pid) {
  const P = parties.get(c.party);
  if (!P || P.leader !== c.pid || pid === c.pid || !P.members.includes(pid)) return;
  const tc = cOf(pid); if (!tc) return;
  const [tw] = clientByPid(pid); if (tw) sysTo(tw, 'You were removed from the party.');
  leaveParty(tc);
}
function partyPromote(c, pid) {
  const P = parties.get(c.party);
  if (!P || P.leader !== c.pid || !P.members.includes(pid)) return;
  P.leader = pid; sendParty(P);
}

// ---------- dungeons: a private copy for each party ----------
function moveTo(c, dest, at) {
  const [ws] = clientByPid(c.pid);
  Object.assign(c.char, c.sim.charData(c.pid));
  c.sim.removePlayer(c.pid, true);
  const p = dest.addPlayer(c.pid, Object.assign({}, c.char, { admin: !!c.acct.admin }), true);
  if (at) { p.x = at[0]; p.y = at[1]; }
  c.sim = dest; c.foeCache = new Map(); c.epoch = (c.epoch || 0) + 1;
  if (ws) send(ws, { t: 'map', w: c.epoch, dun: dest.dun ? { zone: dest.dun.zone, mode: dest.dun.mode } : null, x: p.x, y: p.y, seq: p.seq, foes: dest.foeList() });
}
function closeInstance(d) {
  instances.delete(d.id);
  const P = parties.get(d.party); if (P && P.inst === d.id) { P.inst = 0; sendParty(P); }
}
function enterDungeon(ws, c, zone, mode) {
  const D = V.DUNGEONS[zone], p = c.sim.players.get(c.pid);
  if (!D || !V.DUN_MODES[mode] || !p) return;
  if (c.sim !== world) return sysTo(ws, 'You are already in a dungeon.');
  if (p.dead > 0) return;
  if (V.nearGate(p.x, p.y, 60) !== zone) return sysTo(ws, `Walk up to the ${D.gate === 'portal' ? 'portal' : 'gate'} first.`);
  const P = parties.get(c.party);
  let d = P && P.inst && instances.get(P.inst);
  if (d && !d.endT) { // the party is already inside: join them
    if (d.zone !== zone) return sysTo(ws, `Your party is in ${V.DUNGEONS[d.zone].name}.`);
    if ((d.sim.lives.get(c.pid) ?? 1) <= 0) return sysTo(ws, 'You have no lives left in this run.');
    moveTo(c, d.sim); sendParty(P); return;
  }
  if (P && P.leader !== c.pid) return sysTo(ws, 'Only the party leader can open a dungeon.');
  const size = P ? P.members.length : 1;
  const sim = V.createSim(V.generateDungeon(zone), meta, { validate: true, dun: { zone, mode, size } }); sim.pending = [];
  d = { id: nextInst++, zone, mode, sim, party: P ? P.id : 0, endT: 0, started: Date.now() };
  instances.set(d.id, d);
  console.log(`${c.char.name} opened ${D.name} (${V.DUN_MODES[mode].name}, party of ${size})`);
  moveTo(c, sim);
  if (P) { // the rest of the party is pulled in with the leader
    P.inst = d.id;
    for (const pid of P.members) if (pid !== c.pid) {
      const mc = cOf(pid); if (!mc || mc.sim !== world) continue;
      const mp = world.players.get(pid); if (mp && mp.dead > 0) continue;
      moveTo(mc, sim); const [mw] = clientByPid(pid); if (mw) sysTo(mw, `${c.char.name} led the party into ${D.name}.`);
    }
    sendParty(P);
  }
}
function leaveDungeon(c) {
  if (!c.pid || !c.sim || !c.sim.dun) return;
  const s = c.sim, zone = s.dun.zone, [gx, gy] = V.gatePos(zone);
  moveTo(c, world, [gx + (Math.random() - 0.5) * 60, gy + 46]);
  saveChar(c);
  for (const d of instances.values()) if (d.sim === s && !s.players.size) closeInstance(d);
  const P = parties.get(c.party); if (P) sendParty(P);
}
function dungeonTick(now) {
  for (const d of [...instances.values()]) {
    const s = d.sim;
    if (s.wiped && !d.endT) {
      d.endT = now + 4500;
      for (const pid of s.players.keys()) { const [w] = clientByPid(pid); if (w) sysTo(w, `Your party has fallen. ${V.DUNGEONS[d.zone].name} casts you out.`); }
    }
    if (s.cleared && !d.endT) { // cleared: everyone goes home in 10 seconds
      d.endT = now + 10000;
      for (const pid of s.players.keys()) { const [w] = clientByPid(pid); if (w) send(w, { t: 'dleave', s: 10 }); }
    }
    if (d.endT && now > d.endT) {
      for (const pid of [...s.players.keys()]) { const mc = cOf(pid); if (mc) leaveDungeon(mc); }
      closeInstance(d);
    } else if (!s.players.size && now - d.started > 5000) closeInstance(d);
  }
}

async function saveChar(c) {
  const d = c.pid && c.sim && c.sim.charData(c.pid);
  if (!d || !c.char) return;
  Object.assign(c.char, d);
  try { await store.saveChar(c.char.id, d); } catch (e) { console.error('save failed', c.char.name, e.message); }
}
async function leaveWorld(c) {
  if (!c.pid) return;
  await saveChar(c);
  leaveParty(c, true);
  const s = c.sim; s.removePlayer(c.pid); c.sim = null;
  for (const d of instances.values()) if (d.sim === s && !s.players.size) closeInstance(d);
  console.log(`- ${c.char.name} (${online()} online)`);
  c.pid = 0; c.char = null;
}

wss.on('connection', (ws) => {
  const c = { acct: null, pid: 0, char: null, chars: null, chatT: 0, authTries: 0, msgs: 0, foeCache: new Map(), sim: null, party: 0, invites: new Map() };
  clients.set(ws, c);
  ws.on('message', async (raw) => {
    if (++c.msgs > 80) return; // flood guard, reset every second
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    try {
      if (m.t === 'login' || m.t === 'register' || m.t === 'resume') { await signIn(ws, c, m); return; }
      if (!c.acct) return;
      if (m.t === 'admin') { await adminOp(ws, c, m); return; }
      if (c.panel) return;
      if (!c.pid) {
        if (m.t === 'create') await createChar(ws, c, m);
        else if (m.t === 'delete' && Number.isInteger(m.id)) { await store.deleteChar(c.acct.key, m.id); await sendChars(ws, c); }
        else if (m.t === 'play' && Number.isInteger(m.id)) await play(ws, c, m.id);
        return;
      }
      if (m.t === 'in') c.sim.input(c.pid, m);
      else if (m.t === 'learn' && typeof m.node === 'string') { if (c.sim.learn(c.pid, m.node)) saveChar(c); }
      else if (m.t === 'bar' && Array.isArray(m.bar)) { if (c.sim.setBar(c.pid, m.bar.slice(0, V.BAR_SIZE).map((x) => (typeof x === 'string' ? x.slice(0, 24) : null)))) saveChar(c); }
      else if (m.t === 'respec') { if (c.sim.respec(c.pid)) saveChar(c); }
      else if (m.t === 'pick' && Number.isInteger(m.id)) { if (c.sim.pick(c.pid, m.id)) saveChar(c); }
      else if (m.t === 'equip' && Number.isInteger(m.i)) { if (c.sim.equip(c.pid, m.i)) saveChar(c); }
      else if (m.t === 'unequip' && V.SLOTS.includes(m.slot)) { if (c.sim.unequip(c.pid, m.slot)) saveChar(c); }
      else if (m.t === 'discard' && Number.isInteger(m.i)) { if (c.sim.discard(c.pid, m.i)) saveChar(c); }
      else if (m.t === 'trash' && (Number.isInteger(m.i) || V.SLOTS.includes(m.slot))) { if (c.sim.trash(c.pid, m.i, V.SLOTS.includes(m.slot) ? m.slot : null)) saveChar(c); }
      else if (m.t === 'recall') c.sim.recall(c.pid);
      else if (m.t === 'qaccept' && typeof m.q === 'string') { if (c.sim.questAccept(c.pid, m.q)) saveChar(c); }
      else if (m.t === 'qturnin' && typeof m.q === 'string') { if (c.sim.questTurnIn(c.pid, m.q, m.pick | 0)) saveChar(c); }
      else if (m.t === 'qabandon' && typeof m.q === 'string') { if (c.sim.questAbandon(c.pid, m.q)) saveChar(c); }
      else if (m.t === 'nuke') { if (c.sim.nuke(c.pid)) console.log(`${c.char.name} nuked the map`); }
      else if (m.t === 'trial') { if (c.sim.startTrial(c.pid)) saveChar(c); }
      else if (m.t === 'evolve' && typeof m.cls === 'string') { if (c.sim.evolve(c.pid, m.cls)) { saveChar(c); console.log(`${c.char.name} evolved into ${m.cls}`); } }
      else if (m.t === 'accept' && Number.isInteger(m.z)) { if (c.sim.acceptBounty(c.pid, m.z)) saveChar(c); }
      else if (m.t === 'turnin' && Number.isInteger(m.z)) { if (c.sim.turnIn(c.pid, m.z)) saveChar(c); }
      else if (m.t === 'abandon' && Number.isInteger(m.z)) { if (c.sim.abandonBounty(c.pid, m.z)) saveChar(c); }
      else if (m.t === 'leave') { await leaveWorld(c); await sendChars(ws, c); }
      else if (m.t === 'pinvite') partyInvite(ws, c, m);
      else if (m.t === 'paccept' && Number.isInteger(m.from)) partyAccept(ws, c, m.from);
      else if (m.t === 'pdecline' && Number.isInteger(m.from)) { c.invites.delete(m.from); const [fw] = clientByPid(m.from); if (fw) send(fw, { t: 'chat', sys: 1, text: `${c.char.name} declined your party invite.` }); }
      else if (m.t === 'pleave') leaveParty(c);
      else if (m.t === 'pkick' && Number.isInteger(m.pid)) partyKick(c, m.pid);
      else if (m.t === 'ppromote' && Number.isInteger(m.pid)) partyPromote(c, m.pid);
      else if (m.t === 'dungeon' && Number.isInteger(m.zone) && Number.isInteger(m.mode)) enterDungeon(ws, c, m.zone, m.mode);
      else if (m.t === 'dleave') leaveDungeon(c);
      else if (m.t === 'chat') {
        const now = Date.now();
        if (now - c.chatT < 800) return;
        const text = clean(m.text || '').slice(0, 160);
        if (!text) return;
        c.chatT = now;
        if (/^\/p(arty)?\s/i.test(text)) { // party chat
          const P = parties.get(c.party), msg = text.replace(/^\/p(arty)?\s+/i, '');
          if (!P) { send(ws, { t: 'chat', sys: 1, text: 'You are not in a party.' }); return; }
          if (msg) for (const pid of P.members) { const [w] = clientByPid(pid); if (w) send(w, { t: 'chat', name: c.char.name, text: msg, party: 1 }); }
          return;
        }
        broadcast({ t: 'chat', name: c.char.name, text });
      }
    } catch (e) {
      console.error('message error', e);
      send(ws, { t: 'error', msg: 'Something went wrong on the server. Try again.' });
    }
  });
  ws.on('close', async () => {
    clients.delete(ws);
    await leaveWorld(c);
  });
});

setInterval(() => { for (const c of clients.values()) c.msgs = 0; }, 1000);
setInterval(() => { for (const c of clients.values()) saveChar(c); }, 30000);
// The world runs at 20 ticks a second; each player gets a view of what is near them every SEND_EVERY ticks.
let last = Date.now(), tick = 0;
// a bug must never take the whole realm down: log it and keep the world running
process.on('uncaughtException', (e) => console.error('uncaught', e));
process.on('unhandledRejection', (e) => console.error('unhandled rejection', e));
setInterval(() => {
  const now = Date.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
  for (const s of sims()) {
    try { s.step(dt); } catch (e) { console.error('tick failed', e); }
    s.pending.push(...s.drainEvents());
  }
  try { dungeonTick(now); } catch (e) { console.error('dungeon tick failed', e); }
  if (++tick % SEND_EVERY) return;
  const n = online();
  for (const [ws, c] of clients) {
    if (!c.pid || !c.sim) continue;
    const v = c.sim.view(c.pid, c.foeCache, c.sim.pending);
    if (!v) continue;
    v.t = 's'; v.n = n; v.w = c.epoch; // which world this view is from
    send(ws, v);
  }
  for (const s of sims()) s.pending = [];
  if (tick % 20 === 0) for (const P of parties.values()) sendParty(P);
}, TICK * 1000);

store.init().then(() => {
  server.listen(PORT, () => console.log(`Vaelmort server on :${PORT} (accounts: ${store.kind})`));
}).catch((e) => { console.error('Could not start the account store:', e.message); process.exit(1); });

for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, async () => {
  await Promise.all([...clients.values()].map(saveChar));
  process.exit(0);
});
