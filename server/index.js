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
const TICK = 0.05; // 20 updates per second
const MAX_PLAYERS = +process.env.MAX_PLAYERS || 64;
const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;

const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/heroes/heroes.json'), 'utf8'));
const map = V.generate(V.SEED);
const sim = V.createSim(map, meta, { validate: true });
const store = createStore();

// ---------- static files ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.md': 'text/markdown; charset=utf-8' };
const PUBLIC = [/^index\.html$/, /^src\/[a-z]+\.js$/, /^assets\/heroes\/heroes\.json$/, /^assets\/heroes\/sheets\/[a-z_]+\.png$/];
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
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
const clients = new Map(); // ws -> { acct, pid, chatT, authTries }
let nextPid = 1;
const send = (ws, m) => { if (ws.readyState === 1) ws.send(typeof m === 'string' ? m : JSON.stringify(m)); };
const broadcast = (m) => { const s = JSON.stringify(m); for (const [ws, c] of clients) if (c.pid) send(ws, s); };
const clean = (s) => Array.from(String(s), (ch) => { const c = ch.codePointAt(0); return c < 32 || c === 127 || c === 0x2028 || c === 0x2029 ? ' ' : ch; }).join('').trim();

async function signIn(ws, c, m) {
  if (c.pid) return;
  if (++c.authTries > 8) { send(ws, { t: 'error', msg: 'Too many attempts. Wait a minute and try again.' }); ws.close(); return; }
  if (clients.size > MAX_PLAYERS * 2 || sim.players.size >= MAX_PLAYERS) { send(ws, { t: 'error', msg: 'The realm is full right now. Try again soon.' }); return; }
  let acct = null;
  try {
    if (m.t === 'resume') {
      acct = await store.resume(m.token);
      if (!acct) { send(ws, { t: 'error', msg: 'Your saved sign-in has expired. Log in again.' }); return; }
    } else {
      const name = typeof m.name === 'string' ? m.name.trim() : '', pass = typeof m.pass === 'string' ? m.pass : '';
      if (!NAME_RE.test(name)) { send(ws, { t: 'error', msg: 'Names are 3–16 letters, numbers or underscores.' }); return; }
      if (pass.length < 6 || pass.length > 128) { send(ws, { t: 'error', msg: 'Use a password of at least 6 characters.' }); return; }
      if (m.t === 'register') {
        acct = await store.register(name, pass);
        if (!acct) { send(ws, { t: 'error', msg: 'That name is taken. Pick another, or log in if it is yours.' }); return; }
      } else {
        acct = await store.login(name, pass);
        if (!acct) { send(ws, { t: 'error', msg: 'Wrong name or password.' }); return; }
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
  const token = await store.newSession(acct.key);
  c.acct = acct; c.pid = nextPid++;
  const p = sim.addPlayer(c.pid, { name: acct.name, cls: acct.cls, kills: acct.kills });
  send(ws, { t: 'welcome', id: c.pid, name: acct.name, token, x: p.x, y: p.y, seq: p.seq, cls: p.cls, kills: p.kills, foes: sim.foeList() });
  console.log(`+ ${acct.name} (${sim.players.size} online)`);
}

async function saveAccount(c) {
  const p = c.pid && sim.players.get(c.pid);
  if (!p || !c.acct) return;
  try { await store.save(c.acct.key, p.cls, p.kills); } catch (e) { console.error('save failed', c.acct.key, e.message); }
}

wss.on('connection', (ws) => {
  const c = { acct: null, pid: 0, chatT: 0, authTries: 0, msgs: 0 };
  clients.set(ws, c);
  ws.on('message', (raw) => {
    if (++c.msgs > 80) return; // flood guard, reset every second
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'login' || m.t === 'register' || m.t === 'resume') { signIn(ws, c, m); return; }
    if (!c.pid) return;
    if (m.t === 'in') sim.input(c.pid, m);
    else if (m.t === 'chat') {
      const now = Date.now();
      if (now - c.chatT < 800) return;
      const text = clean(m.text || '').slice(0, 160);
      if (!text) return;
      c.chatT = now;
      broadcast({ t: 'chat', name: c.acct.name, text });
    }
  });
  ws.on('close', async () => {
    clients.delete(ws);
    if (c.pid) {
      await saveAccount(c);
      sim.removePlayer(c.pid);
      console.log(`- ${c.acct.name} (${sim.players.size} online)`);
    }
  });
});

setInterval(() => { for (const c of clients.values()) c.msgs = 0; }, 1000);
setInterval(() => { for (const c of clients.values()) saveAccount(c); }, 30000);
let last = Date.now();
setInterval(() => {
  const now = Date.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
  sim.step(dt);
  const snap = sim.snapshot();
  snap.t = 's'; snap.n = sim.players.size; snap.e = sim.drainEvents();
  if (sim.players.size) broadcast(snap);
}, TICK * 1000);

store.init().then(() => {
  server.listen(PORT, () => console.log(`Vaelmort server on :${PORT} (accounts: ${store.kind})`));
}).catch((e) => { console.error('Could not start the account store:', e.message); process.exit(1); });

for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, async () => {
  await Promise.all([...clients.values()].map(saveAccount));
  process.exit(0);
});
