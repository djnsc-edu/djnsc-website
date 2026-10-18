'use strict';
// 도성학원 관리자 페이지 서버
// - nginx가 /admin 으로 오는 요청을 이 서버(127.0.0.1:3000)로 넘김
// - 비밀번호 로그인(세션 쿠키) → GA4 방문 통계 API → 대시보드
const http = require('http');
const fs = require('fs');
const path = require('path');
const { GoogleAuth } = require('google-auth-library');
const { PasswordStore } = require('./lib/secret');
const auth = require('./lib/auth');
const { GaClient, RANGES } = require('./lib/ga');

const PORT = Number(process.env.ADMIN_PORT || process.env.PORT || 3000);
const BASE = '/admin';
const PUBLIC = path.join(__dirname, 'public');
const CHART_JS = path.join(__dirname, 'node_modules', 'chart.js', 'dist', 'chart.umd.js'); // 차트 라이브러리는 CDN 대신 패키지에서 직접 제공

const gauth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/analytics.readonly', 'https://www.googleapis.com/auth/cloud-platform'],
});
const passwords = new PasswordStore(gauth);
const ga = new GaClient(gauth);

// ---------- 유틸 ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};
const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { ...SECURITY, ...headers });
  res.end(body);
};
const json = (res, status, obj) => send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
const redirect = (res, to, extra = {}) => send(res, 302, '', { Location: to, ...extra });
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const pageCache = new Map();
const page = (name, vars = {}) => {
  if (!pageCache.has(name) || process.env.NODE_ENV !== 'production') pageCache.set(name, fs.readFileSync(path.join(PUBLIC, name), 'utf8'));
  return pageCache.get(name).replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? escapeHtml(vars[k]) : ''));
};

const readForm = (req) => new Promise((resolve, reject) => {
  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 10000) { reject(new Error('too large')); req.destroy(); } });
  req.on('end', () => resolve(Object.fromEntries(new URLSearchParams(body))));
  req.on('error', reject);
});

const serveStatic = (res, file) => {
  const full = path.join(PUBLIC, file);
  if (!full.startsWith(PUBLIC) || !fs.existsSync(full)) return send(res, 404, 'Not found');
  send(res, 200, fs.readFileSync(full), { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'private, max-age=300' });
};

// ---------- 라우팅 ----------
async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  let p = url.pathname;
  if (p === BASE) p = BASE + '/';
  if (!p.startsWith(BASE + '/')) return send(res, 404, 'Not found');
  const route = p.slice(BASE.length); // '/', '/login', '/api/...'

  if (route === '/healthz') return send(res, 200, 'ok');
  if (route.startsWith('/static/')) return serveStatic(res, route.slice('/static/'.length));
  if (route === '/vendor/chart.umd.js') return send(res, 200, fs.readFileSync(CHART_JS), { 'Content-Type': MIME['.js'], 'Cache-Control': 'private, max-age=86400' });

  // 세션 확인 (Secret Manager 장애 시에도 로그인 화면은 떠야 하므로 try)
  let key = null;
  let session = null;
  try {
    key = await passwords.sessionKey();
    session = auth.readSession(req, key);
  } catch (e) {
    console.error('[admin] password store error:', e.message);
    if (route !== '/login' || req.method !== 'GET') return send(res, 503, page('login.html', { error: '비밀번호 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.' }), { 'Content-Type': MIME['.html'] });
  }

  // --- 로그인 ---
  if (route === '/login') {
    if (req.method === 'GET') {
      if (session) return redirect(res, BASE + '/');
      return send(res, 200, page('login.html', { error: '' }), { 'Content-Type': MIME['.html'] });
    }
    if (req.method === 'POST') {
      const ip = auth.clientIp(req);
      const locked = auth.isLocked(ip);
      if (locked) return send(res, 429, page('login.html', { error: `비밀번호를 여러 번 틀려 ${locked}분 동안 잠겼습니다.` }), { 'Content-Type': MIME['.html'] });
      const form = await readForm(req);
      const rec = await passwords.verify(String(form.password || ''));
      if (!rec) {
        auth.noteFail(ip);
        return send(res, 401, page('login.html', { error: '비밀번호가 올바르지 않습니다.' }), { 'Content-Type': MIME['.html'] });
      }
      auth.clearFails(ip);
      const cookie = auth.makeCookie(await passwords.sessionKey(), { temp: !!rec.temporary });
      return redirect(res, BASE + (rec.temporary ? '/password' : '/'), { 'Set-Cookie': cookie });
    }
  }

  if (!session) return route === '/' ? redirect(res, BASE + '/login') : json(res, 401, { error: 'unauthorized' });

  if (route === '/logout' && req.method === 'POST') return redirect(res, BASE + '/login', { 'Set-Cookie': auth.clearCookie() });

  // --- 비밀번호 변경 (임시 비밀번호면 이 화면을 먼저 거침) ---
  if (route === '/password') {
    if (req.method === 'GET') return send(res, 200, page('password.html', { error: '', notice: session.temp ? '처음 로그인하셨습니다. 임시 비밀번호를 새 비밀번호로 바꿔 주세요.' : '' }), { 'Content-Type': MIME['.html'] });
    if (req.method === 'POST') {
      const form = await readForm(req);
      const current = String(form.current || '');
      const next = String(form.next || '');
      const confirm = String(form.confirm || '');
      const fail = (error) => send(res, 400, page('password.html', { error, notice: '' }), { 'Content-Type': MIME['.html'] });
      if (!(await passwords.verify(current))) return fail('현재 비밀번호가 올바르지 않습니다.');
      if (next.length < 8) return fail('새 비밀번호는 8자 이상이어야 합니다.');
      if (!/[A-Za-z]/.test(next) || !/[0-9]/.test(next)) return fail('새 비밀번호에는 영문과 숫자를 모두 넣어 주세요.');
      if (next !== confirm) return fail('새 비밀번호 확인이 일치하지 않습니다.');
      if (next === current) return fail('현재 비밀번호와 다른 비밀번호를 입력해 주세요.');
      try {
        await passwords.setPassword(next);
      } catch (e) {
        console.error('[admin] setPassword failed:', e.message);
        return fail('비밀번호를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      }
      const cookie = auth.makeCookie(await passwords.sessionKey(), { temp: false });
      return redirect(res, BASE + '/?changed=1', { 'Set-Cookie': cookie });
    }
  }

  if (session.temp && route !== '/password') return redirect(res, BASE + '/password');

  // --- 대시보드 ---
  if (route === '/' && req.method === 'GET') return send(res, 200, page('dashboard.html', {}), { 'Content-Type': MIME['.html'] });

  // --- API ---
  if (route === '/api/status') return json(res, 200, await ga.status());
  if (route === '/api/report') {
    const range = url.searchParams.get('range') || '7d';
    if (!RANGES[range]) return json(res, 400, { error: 'bad range' });
    try {
      return json(res, 200, await ga.report(range));
    } catch (e) {
      console.error('[admin] report failed:', e.message);
      return json(res, e.status === 403 ? 403 : 502, { error: e.message, status: e.status || 0 });
    }
  }
  if (route === '/api/realtime') {
    try {
      return json(res, 200, await ga.realtime());
    } catch (e) {
      return json(res, e.status === 403 ? 403 : 502, { error: e.message });
    }
  }

  return send(res, 404, 'Not found');
}

http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    console.error('[admin] unhandled:', e);
    if (!res.headersSent) json(res, 500, { error: 'internal error' });
  });
}).listen(PORT, '0.0.0.0', () => console.log(`[admin] listening on ${PORT}${process.env.MOCK_GA === '1' ? ' (MOCK_GA)' : ''}`));
