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
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.md': 'text/markdown; charset=utf-8' };
const PUBLIC = [/^index\.html$/, /^src\/[a-z]+\.js$/, /^assets\/heroes\/heroes\.json$/, /^assets\/heroes\/sheets\/[a-z_]+\.png$/, /^assets\/foes\/foes\.json$/, /^assets\/foes\/[a-z_]+\.png$/, /^assets\/props\/props\.json$/, /^assets\/props\/[a-z_0-9]+\.png$/];
const indexHtml = () => fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .replace(/<meta name="vaelmort-server" content="[^"]*">/, '<meta name="vaelmort-server" content="same-origin">');
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok ' + sim.players.size); return; }
  let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  if (!PUBLIC.some((re) => re.test(rel))) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found'); return; }
  try {
    const body = rel === 'index.html' ? indexHtml() : fs.readFileSync(path.join(ROOT, rel));
    res.writeHead(200, { 'content-type': TYPES[path.extname(rel)] || 'application/octet-stream', 'cache-control': rel === 'index.html' ? 'no-cache' : 'public, max-age=300' });
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
  // one session per account: the newest sign-in wins
  for (const [other, oc] of clients) if (oc.acct && oc.acct.key === acct.key && other !== ws) { send(other, { t: 'error', msg: 'You signed in somewhere else.' }); other.close(); }
  c.acct = acct;
  const token = await store.newSession(acct.key);
  send(ws, { t: 'account', name: acct.name, token });
  await sendChars(ws, c);
}

const charView = (ch) => ({ id: ch.id, name: ch.name, cls: ch.cls, level: ch.level, kills: ch.kills });
async function sendChars(ws, c) { c.chars = await store.listChars(c.acct.key); send(ws, { t: 'chars', list: c.chars.map(charView), max: V.MAX_CHARS }); }

async function createChar(ws, c, m) {
  const name = typeof m.name === 'string' ? m.name.trim() : '';
  if (!V.NAME_RE.test(name)) { send(ws, { t: 'error', msg: 'Character names are 3–16 letters, numbers or underscores and start with a letter.' }); return; }
  if (!V.CLASSES[m.cls]) { send(ws, { t: 'error', msg: 'Pick a class.' }); return; }
  if ((c.chars || []).length >= V.MAX_CHARS) { send(ws, { t: 'error', msg: `You can have up to ${V.MAX_CHARS} characters. Delete one to make room.` }); return; }
  if (await store.charNameTaken(name)) { send(ws, { t: 'error', msg: 'That character name is taken.' }); return; }
  const ch = await store.createChar(c.acct.key, name, m.cls);
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
  const p = sim.addPlayer(c.pid, ch);
  send(ws, { t: 'welcome', id: c.pid, name: p.name, cls: p.cls, level: p.level, talents: p.talents, refunded: p.refunded ? 1 : 0, x: p.x, y: p.y, seq: p.seq, foes: sim.foeList() });
  if (p.refunded) saveChar(c); // the skill-web refund happens once
  console.log(`+ ${p.name} (${c.acct.name}, ${sim.players.size} online)`);
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
