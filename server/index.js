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
require(path.join(ROOT, 'src/sim.js'));
const V = globalThis.V;

const PORT = +process.env.PORT || 8080;
const TICK = 0.05; // 20 simulation steps per second
const SEND_EVERY = 2; // 10 network updates per second
const MAX_PLAYERS = +process.env.MAX_PLAYERS || 64;
const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;

const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/heroes/heroes.json'), 'utf8'));
const map = V.generate(V.SEED);
const sim = V.createSim(map, meta, { validate: true });
const store = createStore();

// ---------- static files ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.mp3': 'audio/mpeg', '.md': 'text/markdown; charset=utf-8' };
const PUBLIC = [/^index\.html$/, /^admin\.html$/, /^src\/[a-z]+\.js$/, /^assets\/heroes\/heroes\.json$/, /^assets\/heroes\/sheets\/[a-z_]+\.png$/, /^assets\/foes\/foes\.json$/, /^assets\/foes\/[a-z_]+\.png$/, /^assets\/props\/props\.json$/, /^assets\/props\/[a-z_0-9]+\.png$/, /^assets\/music\/[a-z]+\.mp3$/];
const indexHtml = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
  .replace(/<meta name="vaelmort-server" content="[^"]*">/, '<meta name="vaelmort-server" content="same-origin">');
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok ' + sim.players.size); return; }
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
  if (!V.CLASSES[m.cls] || (V.CLASSES[m.cls].admin && !c.acct.admin)) { send(ws, { t: 'error', msg: 'Pick a class.' }); return; }
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
  if (sim.players.size >= MAX_PLAYERS) { send(ws, { t: 'error', msg: 'The realm is full right now. Try again soon.' }); return; }
  c.char = ch; c.pid = nextPid++; c.foeCache = new Map();
  const p = sim.addPlayer(c.pid, Object.assign({}, ch, { admin: !!c.acct.admin }));
  send(ws, { t: 'welcome', id: c.pid, name: p.name, cls: p.cls, level: p.level, talents: p.talents, refunded: p.refunded ? 1 : 0, x: p.x, y: p.y, seq: p.seq, foes: sim.foeList() });
  if (p.refunded) saveChar(c); // the skill-web refund happens once
  console.log(`+ ${p.name} (${c.acct.name}, ${sim.players.size} online)`);
}

// ---------- admin ----------
const reply = (ws, op, extra) => send(ws, Object.assign({ t: 'admin', op }, extra));
function clientByPid(pid) { for (const [w, c] of clients) if (c.pid === pid) return [w, c]; return [null, null]; }
async function adminList(ws) {
  const players = [];
  for (const [, c] of clients) if (c.pid) { const p = sim.players.get(c.pid); if (p) players.push({ pid: c.pid, name: p.name, cls: p.cls, level: p.level, acct: c.acct.name, zone: V.ZONE_INFO[Math.max(0, p.zone)].name }); }
  reply(ws, 'list', { players, admins: await store.flagged('admin'), banned: await store.flagged('banned'), foes: Object.keys(V.FOES).filter((k) => k !== 'dummy') });
}
async function adminOp(ws, c, m) {
  const a = await store.getAccount(c.acct.key); // re-check every time: admin can be removed while signed in
  if (!a || !a.admin) { reply(ws, 'error', { msg: 'You are not an admin.' }); return; }
  const say = (msg) => reply(ws, 'ok', { msg });
  const [tw, tc] = Number.isInteger(m.pid) ? clientByPid(m.pid) : [null, null];
  const target = tc && sim.players.get(tc.pid);
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
      sim.giveXp(tc.pid, n); saveChar(tc);
      return say(`Gave ${target.name} ${n.toLocaleString()} XP.`);
    }
    case 'tp': {
      if (!c.pid) return say('Enter the world to teleport.');
      if (!target) return say('That player is not online.');
      sim.teleport(c.pid, target.x + 30, target.y + 10);
      return say(`Teleported to ${target.name}.`);
    }
    case 'spawn': {
      if (!V.FOES[m.type] || m.type === 'dummy') return say('Unknown enemy.');
      const at = c.pid ? sim.players.get(c.pid) : target;
      if (!at) return say('Enter the world, or pick a player to spawn next to.');
      const n = sim.spawnFoes(m.type, Math.max(1, Math.min(20, m.n | 0 || 1)), at.x, at.y, Math.max(1, Math.min(V.MAX_LEVEL + 5, m.level | 0 || at.level)));
      return say(n ? `Spawned ${n} ${V.FOES[m.type].name}.` : 'Too many spawned enemies already.');
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

async function saveChar(c) {
  const d = c.pid && sim.charData(c.pid);
  if (!d || !c.char) return;
  Object.assign(c.char, d);
  try { await store.saveChar(c.char.id, d); } catch (e) { console.error('save failed', c.char.name, e.message); }
}
async function leaveWorld(c) {
  if (!c.pid) return;
  await saveChar(c);
  sim.removePlayer(c.pid);
  console.log(`- ${c.char.name} (${sim.players.size} online)`);
  c.pid = 0; c.char = null;
}

wss.on('connection', (ws) => {
  const c = { acct: null, pid: 0, char: null, chars: null, chatT: 0, authTries: 0, msgs: 0, foeCache: new Map() };
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
      if (m.t === 'in') sim.input(c.pid, m);
      else if (m.t === 'learn' && typeof m.node === 'string') { if (sim.learn(c.pid, m.node)) saveChar(c); }
      else if (m.t === 'bar' && Array.isArray(m.bar)) { if (sim.setBar(c.pid, m.bar.slice(0, 5).map((x) => (typeof x === 'string' ? x.slice(0, 24) : null)))) saveChar(c); }
      else if (m.t === 'respec') { if (sim.respec(c.pid)) saveChar(c); }
      else if (m.t === 'accept' && Number.isInteger(m.z)) { if (sim.acceptBounty(c.pid, m.z)) saveChar(c); }
      else if (m.t === 'turnin' && Number.isInteger(m.z)) { if (sim.turnIn(c.pid, m.z)) saveChar(c); }
      else if (m.t === 'abandon' && Number.isInteger(m.z)) { if (sim.abandonBounty(c.pid, m.z)) saveChar(c); }
      else if (m.t === 'leave') { await leaveWorld(c); await sendChars(ws, c); }
      else if (m.t === 'chat') {
        const now = Date.now();
        if (now - c.chatT < 800) return;
        const text = clean(m.text || '').slice(0, 160);
        if (!text) return;
        c.chatT = now;
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
let last = Date.now(), tick = 0, pending = [];
setInterval(() => {
  const now = Date.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
  sim.step(dt);
  pending.push(...sim.drainEvents());
  if (++tick % SEND_EVERY) return;
  const events = pending; pending = [];
  const n = sim.players.size;
  for (const [ws, c] of clients) {
    if (!c.pid) continue;
    const v = sim.view(c.pid, c.foeCache, events);
    if (!v) continue;
    v.t = 's'; v.n = n;
    send(ws, v);
  }
}, TICK * 1000);

store.init().then(() => {
  server.listen(PORT, () => console.log(`Vaelmort server on :${PORT} (accounts: ${store.kind})`));
}).catch((e) => { console.error('Could not start the account store:', e.message); process.exit(1); });

for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, async () => {
  await Promise.all([...clients.values()].map(saveChar));
  process.exit(0);
});
