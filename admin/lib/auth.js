'use strict';
// 세션 쿠키(HMAC 서명) + 로그인 시도 제한
const crypto = require('crypto');

const COOKIE = 'djnsc_admin';
const SESSION_HOURS = 12;
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

const fails = new Map(); // ip -> { count, until }

const clientIp = (req) => {
  const xff = req.headers['x-forwarded-for'];
  return (xff ? String(xff).split(',')[0] : req.socket.remoteAddress || '').trim();
};

const isLocked = (ip) => {
  const f = fails.get(ip);
  if (!f) return 0;
  if (f.until && f.until > Date.now()) return Math.ceil((f.until - Date.now()) / 60000);
  if (f.until && f.until <= Date.now()) fails.delete(ip);
  return 0;
};
const noteFail = (ip) => {
  const f = fails.get(ip) || { count: 0, until: 0 };
  f.count += 1;
  if (f.count >= MAX_FAILS) { f.until = Date.now() + LOCK_MS; f.count = 0; }
  fails.set(ip, f);
};
const clearFails = (ip) => fails.delete(ip);

const sign = (payload, key) => crypto.createHmac('sha256', key).update(payload).digest('base64url');

const makeCookie = (key, flags = {}) => {
  const exp = Date.now() + SESSION_HOURS * 3600 * 1000;
  const payload = `${exp}.${flags.temp ? 't' : 'n'}.${crypto.randomBytes(8).toString('base64url')}`;
  const value = `${payload}.${sign(payload, key)}`;
  return `${COOKIE}=${value}; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}`;
};
const clearCookie = () => `${COOKIE}=; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

const parseCookies = (req) => {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  return out;
};

// 반환: null(미로그인) | { temp: boolean }
const readSession = (req, key) => {
  const raw = parseCookies(req)[COOKIE];
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length !== 4) return null;
  const payload = parts.slice(0, 3).join('.');
  const expected = sign(payload, key);
  const given = parts[3];
  if (expected.length !== given.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given))) return null;
  if (Number(parts[0]) < Date.now()) return null;
  return { temp: parts[1] === 't' };
};

module.exports = { clientIp, isLocked, noteFail, clearFails, makeCookie, clearCookie, readSession };
