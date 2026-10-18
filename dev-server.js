// 로컬 개발 서버 런처 (배포에는 포함되지 않음)
// live-server를 Node API로 띄우면서 /api/blog 프록시 미들웨어를 주입한다.
// (CLI --middleware 는 경로를 live-server 패키지 기준으로 require 해서 상대경로가 안 먹힘)
const liveServer = require('live-server');
const devProxy = require('./dev-proxy.js');

liveServer.start({
  port: 8080,
  host: '127.0.0.1',
  open: false,       // 브라우저 자동 실행 안 함
  wait: 200,         // 파일 변경 후 리로드까지 대기(ms)
  logLevel: 2,
  middleware: [devProxy],
});
