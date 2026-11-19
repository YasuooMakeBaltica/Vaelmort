// Account and session storage. Uses Postgres when DATABASE_URL is set, otherwise a JSON file (for local testing).
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SESSION_DAYS = 30;
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
  let db = { accounts: {}, sessions: {} };
  try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { /* new file */ }
  let timer = null;
  const flush = () => { clearTimeout(timer); timer = setTimeout(() => fs.writeFile(file, JSON.stringify(db), () => {}), 200); };
  return {
    kind: 'json file ' + file,
    async init() {},
    async getAccount(key) { return db.accounts[key] || null; },
    async createAccount(a) { if (db.accounts[a.key]) return false; db.accounts[a.key] = a; flush(); return true; },
    async saveProgress(key, cls, kills) { const a = db.accounts[key]; if (a) { a.cls = cls; a.kills = kills; flush(); } },
    async putSession(tokenHash, key, expires) { db.sessions[tokenHash] = { key, expires }; flush(); },
    async getSession(tokenHash) { const s = db.sessions[tokenHash]; return s && s.expires > Date.now() ? s.key : null; },
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
    },
    async getAccount(key) {
      const r = await q('select key, name, salt, hash, cls, kills from accounts where key = $1', [key]);
      return r.rows[0] || null;
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
  };
}

// Phone keyboards and copy-paste often add spaces, quotes or typographic dashes to a pasted URL. None of those can
// appear in a valid connection string, so undo them, then log the host (never the password) to make problems visible.
const DASHES = new Set([0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2015, 0x2212]);
function cleanDatabaseUrl(raw) {
  const s = Array.from(String(raw), (ch) => (DASHES.has(ch.codePointAt(0)) ? '-' : ch)).join('');
  return s.replace(/\s+/g, '').replace(/^["']+|["']+$/g, '');
}
function describeDatabaseUrl(url) {
  try { const u = new URL(url); return `${u.protocol}//${u.hostname}${u.pathname}`; } catch (e) { return 'an invalid URL'; }
}

function createStore() {
  let dbUrl = process.env.DATABASE_URL ? cleanDatabaseUrl(process.env.DATABASE_URL) : '';
  if (dbUrl) console.log('Database:', describeDatabaseUrl(dbUrl));
  const b = dbUrl ? pgBackend(dbUrl) : jsonBackend(process.env.DATA_FILE || path.join(__dirname, 'data', 'store.json'));
  return {
    kind: b.kind,
    init: () => b.init(),
    async register(name, pass) {
      const key = name.toLowerCase(), { salt, hash } = await hashPassword(pass);
      const ok = await b.createAccount({ key, name, salt, hash, cls: 'necromancer', kills: 0 });
      return ok ? b.getAccount(key) : null;
    },
    async login(name, pass) {
      const a = await b.getAccount(name.toLowerCase());
      if (!a || !(await checkPassword(pass, a.salt, a.hash))) return null;
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
    save: (key, cls, kills) => b.saveProgress(key, cls, kills),
  };
}

module.exports = { createStore };
