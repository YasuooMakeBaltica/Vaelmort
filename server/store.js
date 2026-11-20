// Account and session storage. Uses Postgres when DATABASE_URL is set, otherwise a JSON file (for local testing).
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SESSION_DAYS = 30;
const ADMIN_SEED = (process.env.ADMIN_ACCOUNTS || 'yasuoo').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const scrypt = (pass, salt) => new Promise((ok, bad) => crypto.scrypt(pass, salt, 64, (e, k) => (e ? bad(e) : ok(k.toString('hex')))));

async function hashPassword(pass) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: await scrypt(pass, salt) };
}
async function checkPassword(pass, salt, hash) {
  const got = Buffer.from(await scrypt(pass, salt), 'hex'), want = Buffer.from(hash, 'hex');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

function jsonBackend(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let db = { accounts: {}, sessions: {}, chars: {}, nextChar: 1 };
  try { db = Object.assign(db, JSON.parse(fs.readFileSync(file, 'utf8'))); } catch (e) { /* new file */ }
  let timer = null;
  const flush = () => { clearTimeout(timer); timer = setTimeout(() => fs.writeFile(file, JSON.stringify(db), () => {}), 200); };
  return {
    kind: 'json file ' + file,
    async init() {},
    async getAccount(key) { return db.accounts[key] || null; },
    async setFlag(key, flag, on) { const a = db.accounts[key]; if (!a) return false; a[flag] = !!on; flush(); return true; },
    async flagged(flag) { return Object.values(db.accounts).filter((a) => a[flag]).map((a) => a.name); },
    async createAccount(a) { if (db.accounts[a.key]) return false; db.accounts[a.key] = a; flush(); return true; },
    async saveProgress(key, cls, kills) { const a = db.accounts[key]; if (a) { a.cls = cls; a.kills = kills; flush(); } },
    async putSession(tokenHash, key, expires) { db.sessions[tokenHash] = { key, expires }; flush(); },
    async getSession(tokenHash) { const s = db.sessions[tokenHash]; return s && s.expires > Date.now() ? s.key : null; },
    async listChars(key) { return Object.values(db.chars).filter((c) => c.account === key).sort((a, b) => a.id - b.id); },
    async charNameTaken(nameKey) { return Object.values(db.chars).some((c) => c.nameKey === nameKey); },
    async createChar(key, name, cls, nameKey) {
      const c = { id: db.nextChar++, account: key, name, nameKey: nameKey || name.toLowerCase(), cls, level: 1, xp: 0, kills: 0, talents: {}, bounties: {}, bar: null };
      db.chars[c.id] = c; flush(); return c;
    },
    async deleteChar(key, id) { const c = db.chars[id]; if (c && c.account === key) { delete db.chars[id]; flush(); return true; } return false; },
    async saveChar(id, d) { const c = db.chars[id]; if (c) { Object.assign(c, d); flush(); } },
  };
}

function pgBackend(url) {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false }, max: 4 });
  const q = (sql, args) => pool.query(sql, args);
  return {
    kind: 'postgres',
    async init() {
      await q(`create table if not exists accounts (
        key text primary key, name text not null, salt text not null, hash text not null,
        cls text not null default 'necromancer', kills integer not null default 0, created_at timestamptz not null default now())`);
      await q(`create table if not exists sessions (token_hash text primary key, key text not null references accounts(key) on delete cascade, expires_at timestamptz not null)`);
      await q('delete from sessions where expires_at < now()');
      await q(`create table if not exists characters (
        id serial primary key, account text not null references accounts(key) on delete cascade,
        name text not null, name_key text not null unique, cls text not null,
        level integer not null default 1, xp integer not null default 0, kills integer not null default 0,
        talents text not null default '{}', bounties text not null default '{}', created_at timestamptz not null default now())`);
      await q('alter table characters add column if not exists bar text'); // null = from before the skill web
      await q('alter table accounts add column if not exists admin boolean not null default false');
      await q('alter table accounts add column if not exists banned boolean not null default false');
    },
    async getAccount(key) {
      const r = await q('select key, name, salt, hash, cls, kills, admin, banned from accounts where key = $1', [key]);
      return r.rows[0] || null;
    },
    async setFlag(key, flag, on) {
      if (flag !== 'admin' && flag !== 'banned') return false;
      const r = await q(`update accounts set ${flag} = $2 where key = $1`, [key, !!on]);
      return r.rowCount === 1;
    },
    async flagged(flag) {
      if (flag !== 'admin' && flag !== 'banned') return [];
      const r = await q(`select name from accounts where ${flag} order by name`);
      return r.rows.map((x) => x.name);
    },
    async createAccount(a) {
      const r = await q('insert into accounts (key, name, salt, hash, cls, kills) values ($1,$2,$3,$4,$5,$6) on conflict do nothing', [a.key, a.name, a.salt, a.hash, a.cls, a.kills]);
      return r.rowCount === 1;
    },
    async saveProgress(key, cls, kills) { await q('update accounts set cls = $2, kills = $3 where key = $1', [key, cls, kills]); },
    async putSession(tokenHash, key, expires) { await q('insert into sessions (token_hash, key, expires_at) values ($1,$2,to_timestamp($3 / 1000.0))', [tokenHash, key, expires]); },
    async getSession(tokenHash) {
      const r = await q('select key from sessions where token_hash = $1 and expires_at > now()', [tokenHash]);
      return r.rows[0] ? r.rows[0].key : null;
    },
    async listChars(key) {
      const r = await q('select id, name, cls, level, xp, kills, talents, bounties, bar from characters where account = $1 order by id', [key]);
      return r.rows.map((c) => ({ ...c, talents: parse(c.talents), bounties: parse(c.bounties), bar: c.bar ? parse(c.bar) : null }));
    },
    async charNameTaken(nameKey) { return (await q('select 1 from characters where name_key = $1', [nameKey])).rowCount > 0; },
    async createChar(key, name, cls, nameKey) {
      const r = await q('insert into characters (account, name, name_key, cls) values ($1,$2,$3,$4) on conflict do nothing returning id, name, cls, level, xp, kills',
        [key, name, nameKey || name.toLowerCase(), cls]);
      return r.rows[0] ? { ...r.rows[0], talents: {}, bounties: {}, bar: null } : null;
    },
    async deleteChar(key, id) { return (await q('delete from characters where id = $1 and account = $2', [id, key])).rowCount > 0; },
    async saveChar(id, d) {
      await q('update characters set level = $2, xp = $3, kills = $4, talents = $5, bounties = $6, bar = $7 where id = $1',
        [id, d.level, d.xp, d.kills, JSON.stringify(d.talents || {}), JSON.stringify(d.bounties || {}), d.bar ? JSON.stringify(d.bar) : null]);
    },
  };
}
const parse = (s) => { try { return JSON.parse(s); } catch (e) { return {}; } };

// Phone keyboards and copy-paste often add spaces, quotes or typographic dashes to a pasted URL. None of those can
// appear in a valid connection string, so undo them, then log the host (never the password) to make problems visible.
const DASHES = new Set([0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2015, 0x2212]);
function cleanDatabaseUrl(raw) {
  const s = Array.from(String(raw), (ch) => (DASHES.has(ch.codePointAt(0)) ? '-' : ch)).join('').replace(/\s+/g, '');
  // pull the URL out of wrappers like `psql 'postgresql://...'` or `DATABASE_URL=postgresql://...`
  const m = s.match(/postgres(?:ql)?:\/\/[^'"`]+/);
  return (m ? m[0] : s).replace(/^["'`]+|["'`]+$/g, '');
}
// the value with the password hidden, for the log
const maskDatabaseUrl = (url) => url.replace(/(:\/\/[^:/@]*:)[^@/]*(@?)/, '$1***$2').replace(/(password=)[^&]*/i, '$1***');
function describeDatabaseUrl(url) {
  try { const u = new URL(url); if (!u.hostname) throw new Error('no host'); return `${u.protocol}//${u.hostname}${u.pathname}`; } catch (e) {
    return `an invalid URL (${url.length} characters): ${maskDatabaseUrl(url)}`;
  }
}

function createStore() {
  let dbUrl = process.env.DATABASE_URL ? cleanDatabaseUrl(process.env.DATABASE_URL) : '';
  if (dbUrl) console.log('Database:', describeDatabaseUrl(dbUrl));
  const b = dbUrl ? pgBackend(dbUrl) : jsonBackend(process.env.DATA_FILE || path.join(__dirname, 'data', 'store.json'));
  return {
    kind: b.kind,
    // accounts named in ADMIN_ACCOUNTS (comma separated) are made admins when the server starts and when they log in
    async init() {
      await b.init();
      for (const name of ADMIN_SEED) await b.setFlag(name.toLowerCase(), 'admin', true);
    },
    getAccount: (name) => b.getAccount(String(name).toLowerCase()),
    setFlag: (name, flag, on) => b.setFlag(String(name).toLowerCase(), flag, on),
    flagged: (flag) => b.flagged(flag),
    async register(name, pass) {
      const key = name.toLowerCase(), { salt, hash } = await hashPassword(pass);
      const ok = await b.createAccount({ key, name, salt, hash, cls: 'necromancer', kills: 0 });
      return ok ? b.getAccount(key) : null;
    },
    async login(name, pass) {
      const a = await b.getAccount(name.toLowerCase());
      if (!a || !(await checkPassword(pass, a.salt, a.hash))) return null;
      if (!a.admin && ADMIN_SEED.includes(a.key)) { await b.setFlag(a.key, 'admin', true); a.admin = true; }
      return a;
    },
    async newSession(key) {
      const token = crypto.randomBytes(32).toString('hex');
      await b.putSession(sha(token), key, Date.now() + SESSION_DAYS * 864e5);
      return token;
    },
    async resume(token) {
      if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return null;
      const key = await b.getSession(sha(token));
      return key ? b.getAccount(key) : null;
    },
    listChars: (key) => b.listChars(key),
    charNameTaken: (name) => b.charNameTaken(name.toLowerCase()),
    createChar: (key, name, cls, nameKey) => b.createChar(key, name, cls, nameKey),
    deleteChar: (key, id) => b.deleteChar(key, id),
    saveChar: (id, d) => b.saveChar(id, d),
  };
}

module.exports = { createStore };
