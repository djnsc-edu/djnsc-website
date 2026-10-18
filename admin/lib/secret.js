'use strict';
// 관리자 비밀번호 저장소: Secret Manager(운영) 또는 환경변수(로컬 개발)
// 비밀번호는 평문이 아닌 scrypt 해시(JSON)로 저장: { scrypt: "salt:hash", temporary: bool, updatedAt }
const crypto = require('crypto');

const SECRET = process.env.ADMIN_SECRET_NAME || 'projects/516453510311/secrets/djnsc-admin-password';
const SM = 'https://secretmanager.googleapis.com/v1';
const CACHE_MS = 60 * 1000;

const hashPassword = (pw, salt = crypto.randomBytes(16).toString('hex')) =>
  salt + ':' + crypto.scryptSync(pw, salt, 32, { N: 16384, r: 8, p: 1 }).toString('hex');

const verifyHash = (pw, stored) => {
  const [salt, hex] = String(stored || '').split(':');
  if (!salt || !hex) return false;
  const a = crypto.scryptSync(pw, salt, 32, { N: 16384, r: 8, p: 1 });
  const b = Buffer.from(hex, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

class PasswordStore {
  constructor(auth) {
    this.auth = auth;
    this.cache = null;   // { record, at }
    this.local = process.env.ADMIN_PASSWORD
      ? { scrypt: hashPassword(process.env.ADMIN_PASSWORD), temporary: false, updatedAt: new Date().toISOString() }
      : null;
  }

  async _token() {
    const client = await this.auth.getClient();
    const { token } = await client.getAccessToken();
    return token;
  }

  async record(force = false) {
    if (this.local) return this.local;
    if (!force && this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.record;
    const res = await fetch(`${SM}/${SECRET}/versions/latest:access`, {
      headers: { Authorization: `Bearer ${await this._token()}` },
    });
    if (!res.ok) throw new Error(`Secret Manager ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    const record = JSON.parse(Buffer.from(body.payload.data, 'base64').toString('utf8'));
    this.cache = { record, at: Date.now() };
    return record;
  }

  // 비밀번호 검증. 실패 시 캐시를 새로 읽어 한 번 더 확인(방금 바뀐 경우 대비)
  async verify(pw) {
    let rec = await this.record();
    if (verifyHash(pw, rec.scrypt)) return rec;
    if (this.local) return null;
    rec = await this.record(true);
    return verifyHash(pw, rec.scrypt) ? rec : null;
  }

  async setPassword(pw) {
    const record = { scrypt: hashPassword(pw), temporary: false, updatedAt: new Date().toISOString() };
    if (this.local) { this.local = record; return record; }
    const res = await fetch(`${SM}/${SECRET}:addVersion`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await this._token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: { data: Buffer.from(JSON.stringify(record)).toString('base64') } }),
    });
    if (!res.ok) throw new Error(`Secret Manager addVersion ${res.status}: ${(await res.text()).slice(0, 200)}`);
    this.cache = { record, at: Date.now() };
    return record;
  }

  // 세션 서명 키: 현재 비밀번호 해시에서 파생 → 비밀번호를 바꾸면 기존 로그인이 모두 풀림
  async sessionKey() {
    const rec = await this.record();
    return crypto.createHmac('sha256', 'djnsc-admin-session-v1').update(rec.scrypt).digest();
  }
}

module.exports = { PasswordStore, hashPassword, verifyHash };
