// 로컬 개발용 프록시 미들웨어 (live-server 전용 — 배포에는 포함되지 않음)
// 배포 환경의 nginx `location = /api/blog` 프록시를 로컬에서 흉내낸다.
// 브라우저는 CORS 때문에 네이버 RSS를 직접 못 가져오므로, dev 서버가 서버사이드로 중계한다.
const RSS_URL = 'https://rss.blog.naver.com/djnsc.xml';

module.exports = function devProxy(req, res, next) {
  const path = req.url.split('?')[0];
  if (path !== '/api/blog') return next();

  fetch(RSS_URL, {
    headers: {
      // 네이버는 HTTP/1.0 요청에 426을 주지만 node fetch는 HTTP/1.1이라 OK
      'User-Agent': 'djnsc.com blog widget (dev)',
      Accept: 'application/rss+xml, text/xml',
    },
  })
    .then(async (r) => {
      const body = await r.text();
      res.statusCode = r.status;
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(body);
    })
    .catch((err) => {
      console.warn('[dev-proxy] /api/blog 프록시 실패:', err.message);
      res.statusCode = 502;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('dev-proxy error: ' + err.message);
    });
};
