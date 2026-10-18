'use strict';
// Google Analytics 4 Data API(REST) 클라이언트 + 대시보드용 데이터 가공
const DATA = 'https://analyticsdata.googleapis.com/v1beta';
const ADMIN = 'https://analyticsadmin.googleapis.com/v1beta';
const MEASUREMENT_ID = process.env.GA_MEASUREMENT_ID || 'G-LVNRBN3290';
const CACHE_MS = 5 * 60 * 1000;
const REALTIME_CACHE_MS = 30 * 1000;

const RANGES = {
  today: { label: '오늘', cur: ['today', 'today'], prev: ['yesterday', 'yesterday'], byHour: true },
  '7d': { label: '최근 7일', cur: ['6daysAgo', 'today'], prev: ['13daysAgo', '7daysAgo'] },
  '28d': { label: '최근 28일', cur: ['27daysAgo', 'today'], prev: ['55daysAgo', '28daysAgo'] },
  '90d': { label: '최근 90일', cur: ['89daysAgo', 'today'], prev: ['179daysAgo', '90daysAgo'] },
};

const EVENTS = {
  reserve_open: '상담예약 창 열기',
  generate_lead: '상담 신청 완료',
  phone_click: '전화번호 터치',
  blog_click: '학원소식(블로그) 클릭',
  outbound_click: '외부 링크 클릭',
};

const CHANNELS = {
  'Organic Search': '검색 유입', Direct: '직접 접속', Referral: '링크 유입', 'Organic Social': 'SNS',
  'Paid Search': '검색 광고', 'Paid Social': 'SNS 광고', Email: '이메일', Unassigned: '기타', 'Organic Video': '동영상',
  Display: '배너 광고', 'Cross-network': '광고(복합)', Affiliates: '제휴', Audio: '오디오', SMS: '문자',
};

const PAGES = {
  '/': '메인', '/index.html': '메인', '/math.html': '수학관', '/science.html': '과학관', '/cs.html': '정보올림피아드관',
  '/gifted-school.html': '영재고·과학고관', '/college.html': '대입수학·수리논술관', '/privacy.html': '개인정보처리방침',
};

const CITIES = {
  Seoul: '서울', Busan: '부산', Incheon: '인천', Daegu: '대구', Daejeon: '대전', Gwangju: '광주', Ulsan: '울산', Sejong: '세종',
  Suwon: '수원', Seongnam: '성남', Goyang: '고양', Yongin: '용인', Bucheon: '부천', Anyang: '안양', Hwaseong: '화성',
  Gwacheon: '과천', Gimpo: '김포', Namyangju: '남양주', Uijeongbu: '의정부', Gwangmyeong: '광명', Hanam: '하남',
  Cheongju: '청주', Cheonan: '천안', Jeonju: '전주', Changwon: '창원', Jeju: '제주', Gimhae: '김해', Pohang: '포항',
  '(not set)': '알 수 없음',
};

const DEVICES = { desktop: 'PC', mobile: '모바일', tablet: '태블릿', smarttv: 'TV' };

const sourceLabel = (source, medium) => {
  const s = (source || '').toLowerCase();
  const m = (medium || '').toLowerCase();
  if (s === '(direct)') return '직접 접속 (주소 입력·즐겨찾기·카카오톡 등)';
  if (s.includes('naver')) {
    if (s.includes('blog')) return '네이버 블로그';
    if (s.includes('cafe')) return '네이버 카페';
    if (m === 'organic' || s === 'naver' || s === 'search.naver.com' || s.includes('m.search')) return '네이버 검색';
    return `네이버 (${source})`;
  }
  if (s.includes('google')) return m === 'organic' ? '구글 검색' : `구글 (${source})`;
  if (s.includes('daum')) return '다음 검색';
  if (s.includes('bing')) return 'Bing 검색';
  if (s.includes('kakao')) return '카카오톡';
  if (s.includes('instagram')) return '인스타그램';
  if (s.includes('youtube')) return '유튜브';
  if (s.includes('facebook')) return '페이스북';
  if (s.includes('djnsc.com')) return '사이트 내부 이동';
  return medium && medium !== '(none)' ? `${source} (${medium})` : source;
};

const num = (v) => Number(v || 0);

class GaClient {
  constructor(auth) {
    this.auth = auth;
    this.propertyId = process.env.GA_PROPERTY_ID || null;
    this.cache = new Map();
    this.mock = process.env.MOCK_GA === '1';
  }

  async token() {
    const client = await this.auth.getClient();
    const { token } = await client.getAccessToken();
    return token;
  }

  async serviceAccountEmail() {
    try {
      const c = await this.auth.getCredentials();
      if (c && c.client_email) return c.client_email;
    } catch { /* 로컬 개발 등 */ }
    return process.env.SERVICE_ACCOUNT_EMAIL || '(알 수 없음)';
  }

  async api(url, body) {
    const res = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      const err = new Error(`GA API ${res.status}: ${text.slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  // 측정 ID(G-…)로 속성 ID를 자동 탐색 (서비스 계정이 뷰어로 추가된 속성 중에서)
  async resolveProperty() {
    if (this.propertyId) return this.propertyId;
    const summaries = await this.api(`${ADMIN}/accountSummaries?pageSize=200`);
    const props = [];
    for (const acc of summaries.accountSummaries || []) for (const p of acc.propertySummaries || []) props.push(p);
    for (const p of props) {
      const streams = await this.api(`${ADMIN}/${p.property}/dataStreams?pageSize=50`);
      for (const s of streams.dataStreams || []) {
        if (s.webStreamData && s.webStreamData.measurementId === MEASUREMENT_ID) {
          this.propertyId = p.property.replace('properties/', '');
          this.propertyName = p.displayName;
          return this.propertyId;
        }
      }
    }
    const err = new Error(props.length
      ? `서비스 계정이 접근할 수 있는 속성(${props.length}개) 중 측정 ID ${MEASUREMENT_ID} 를 가진 속성이 없습니다.`
      : '서비스 계정이 접근할 수 있는 GA 속성이 없습니다. GA 관리 > 속성 액세스 관리에 서비스 계정을 뷰어로 추가해 주세요.');
    err.status = 403;
    throw err;
  }

  async batch(requests) {
    const pid = await this.resolveProperty();
    const out = [];
    for (let i = 0; i < requests.length; i += 5) {
      const res = await this.api(`${DATA}/properties/${pid}:batchRunReports`, { requests: requests.slice(i, i + 5) });
      out.push(...(res.reports || []));
    }
    return out;
  }

  rows(report) {
    return (report.rows || []).map((r) => ({
      d: (r.dimensionValues || []).map((v) => v.value),
      m: (r.metricValues || []).map((v) => num(v.value)),
    }));
  }

  async status() {
    const email = await this.serviceAccountEmail();
    if (this.mock) return { ok: true, mock: true, propertyId: 'mock', serviceAccount: email, measurementId: MEASUREMENT_ID };
    try {
      const pid = await this.resolveProperty();
      return { ok: true, propertyId: pid, propertyName: this.propertyName || '', serviceAccount: email, measurementId: MEASUREMENT_ID };
    } catch (e) {
      return { ok: false, error: e.message, status: e.status || 0, serviceAccount: email, measurementId: MEASUREMENT_ID };
    }
  }

  async report(rangeKey) {
    const range = RANGES[rangeKey] || RANGES['7d'];
    const key = `report:${rangeKey}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
    const data = this.mock ? mockReport(rangeKey, range) : await this.fetchReport(rangeKey, range);
    this.cache.set(key, { data, at: Date.now() });
    return data;
  }

  async fetchReport(rangeKey, range) {
    const cur = { startDate: range.cur[0], endDate: range.cur[1] };
    const prev = { startDate: range.prev[0], endDate: range.prev[1] };
    const M = (...names) => names.map((name) => ({ name }));
    const D = (...names) => names.map((name) => ({ name }));
    const eventFilter = { filter: { fieldName: 'eventName', inListFilter: { values: Object.keys(EVENTS) } } };
    const timeDim = range.byHour ? 'hour' : 'date';

    const [summary, daily, channels, sources, pages, events, devices, cities] = await this.batch([
      { dateRanges: [cur, prev], metrics: M('activeUsers', 'sessions', 'screenPageViews', 'averageSessionDuration', 'engagementRate', 'newUsers') },
      { dateRanges: [cur], dimensions: D(timeDim), metrics: M('activeUsers', 'sessions', 'screenPageViews'),
        orderBys: [{ dimension: { dimensionName: timeDim } }], limit: 400 },
      { dateRanges: [cur], dimensions: D('sessionDefaultChannelGroup'), metrics: M('sessions', 'activeUsers'),
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 12 },
      { dateRanges: [cur], dimensions: D('sessionSource', 'sessionMedium'), metrics: M('sessions', 'activeUsers'),
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 12 },
      { dateRanges: [cur], dimensions: D('pagePath', 'pageTitle'), metrics: M('screenPageViews', 'activeUsers', 'averageSessionDuration'),
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 12 },
      { dateRanges: [cur, prev], dimensions: D('eventName'), metrics: M('eventCount'), dimensionFilter: eventFilter, limit: 50 },
      { dateRanges: [cur], dimensions: D('deviceCategory'), metrics: M('activeUsers'), limit: 10 },
      { dateRanges: [cur], dimensions: D('city'), metrics: M('activeUsers'),
        orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }], limit: 10 },
    ]);

    // 요약: dateRanges가 2개면 각 행의 마지막 차원값이 date_range_0 / date_range_1
    const sumRows = this.rows(summary);
    const pick = (tag) => (sumRows.find((r) => r.d.includes(tag)) || { m: [0, 0, 0, 0, 0, 0] }).m;
    const c = pick('date_range_0');
    const p = pick('date_range_1');
    const kpi = (i) => ({ value: c[i], prev: p[i] });

    const evRows = this.rows(events);
    const ev = (name, tag) => (evRows.find((r) => r.d[0] === name && r.d[1] === tag) || { m: [0] }).m[0];

    return {
      range: rangeKey, label: range.label, generatedAt: new Date().toISOString(),
      kpis: {
        users: kpi(0), sessions: kpi(1), pageviews: kpi(2), avgDuration: kpi(3), engagementRate: kpi(4), newUsers: kpi(5),
        reserveOpen: { value: ev('reserve_open', 'date_range_0'), prev: ev('reserve_open', 'date_range_1') },
        leads: { value: ev('generate_lead', 'date_range_0'), prev: ev('generate_lead', 'date_range_1') },
      },
      daily: this.rows(daily).map((r) => ({ key: r.d[0], users: r.m[0], sessions: r.m[1], pageviews: r.m[2] })),
      channels: this.rows(channels).map((r) => ({ name: CHANNELS[r.d[0]] || r.d[0], raw: r.d[0], sessions: r.m[0], users: r.m[1] })),
      sources: this.rows(sources).map((r) => ({ name: sourceLabel(r.d[0], r.d[1]), raw: `${r.d[0]} / ${r.d[1]}`, sessions: r.m[0], users: r.m[1] })),
      pages: this.rows(pages).map((r) => ({ path: r.d[0], name: PAGES[r.d[0]] || r.d[1] || r.d[0], views: r.m[0], users: r.m[1], avgDuration: r.m[2] })),
      events: Object.entries(EVENTS).map(([name, label]) => ({ name, label, value: ev(name, 'date_range_0'), prev: ev(name, 'date_range_1') })),
      devices: this.rows(devices).map((r) => ({ name: DEVICES[r.d[0]] || r.d[0], users: r.m[0] })),
      cities: this.rows(cities).map((r) => ({ name: CITIES[r.d[0]] || r.d[0], users: r.m[0] })),
    };
  }

  async realtime() {
    const hit = this.cache.get('realtime');
    if (hit && Date.now() - hit.at < REALTIME_CACHE_MS) return hit.data;
    let data;
    if (this.mock) {
      data = { activeUsers: 3, generatedAt: new Date().toISOString() };
    } else {
      const pid = await this.resolveProperty();
      const res = await this.api(`${DATA}/properties/${pid}:runRealtimeReport`, { metrics: [{ name: 'activeUsers' }] });
      const first = (res.rows || [])[0];
      data = { activeUsers: first ? num(first.metricValues[0].value) : 0, generatedAt: new Date().toISOString() };
    }
    this.cache.set('realtime', { data, at: Date.now() });
    return data;
  }
}

// 로컬 개발용 샘플 데이터
function mockReport(rangeKey, range) {
  const days = { today: 1, '7d': 7, '28d': 28, '90d': 90 }[rangeKey] || 7;
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const daily = [];
  if (range.byHour) {
    for (let h = 0; h < 24; h++) daily.push({ key: String(h).padStart(2, '0'), users: rnd(0, 6), sessions: rnd(0, 7), pageviews: rnd(0, 20) });
  } else {
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10).replace(/-/g, '');
      const u = rnd(18, 60);
      daily.push({ key, users: u, sessions: u + rnd(2, 15), pageviews: u * rnd(2, 4) });
    }
  }
  const sum = (k) => daily.reduce((a, r) => a + r[k], 0);
  const kp = (v, f = 0.85) => ({ value: v, prev: Math.round(v * (f + Math.random() * 0.3)) });
  const share = (total, pct) => Math.round(total * pct / 100);
  return {
    range: rangeKey, label: range.label, generatedAt: new Date().toISOString(), mock: true,
    kpis: {
      users: kp(sum('users')), sessions: kp(sum('sessions')), pageviews: kp(sum('pageviews')), avgDuration: kp(96),
      engagementRate: kp(0.62, 0.95), newUsers: kp(Math.round(sum('users') * 0.7)),
      reserveOpen: kp(Math.round(sum('users') * 0.08)), leads: kp(Math.round(sum('users') * 0.02)),
    },
    daily,
    channels: [['Organic Search', 58], ['Direct', 24], ['Referral', 11], ['Organic Social', 5], ['Unassigned', 2]]
      .map(([raw, pct]) => ({ raw, name: CHANNELS[raw], sessions: share(sum('sessions'), pct), users: share(sum('users'), pct) })),
    sources: [['naver', 'organic', 40], ['(direct)', '(none)', 24], ['google', 'organic', 16], ['blog.naver.com', 'referral', 9],
      ['m.search.naver.com', 'referral', 4], ['daum', 'organic', 3], ['kakao', 'referral', 2], ['instagram', 'social', 2]]
      .map(([s, m, pct]) => ({ name: sourceLabel(s, m), raw: `${s} / ${m}`, sessions: share(sum('sessions'), pct), users: share(sum('users'), pct) })),
    pages: [['/', 46], ['/gifted-school.html', 16], ['/math.html', 14], ['/cs.html', 10], ['/college.html', 8], ['/science.html', 5], ['/privacy.html', 1]]
      .map(([p, pct]) => ({ path: p, name: PAGES[p], views: share(sum('pageviews'), pct), users: share(sum('users'), pct), avgDuration: rnd(40, 180) })),
    events: Object.entries(EVENTS).map(([name, label], i) => ({ name, label, ...kp(Math.round(sum('users') * [0.08, 0.02, 0.05, 0.06, 0.04][i])) })),
    devices: [['mobile', 71], ['desktop', 26], ['tablet', 3]].map(([d, pct]) => ({ name: DEVICES[d], users: share(sum('users'), pct) })),
    cities: [['Seoul', 62], ['Seongnam', 7], ['Gwacheon', 5], ['Suwon', 4], ['Yongin', 4], ['Goyang', 3], ['Incheon', 3], ['(not set)', 2]]
      .map(([c, pct]) => ({ name: CITIES[c] || c, users: share(sum('users'), pct) })),
  };
}

module.exports = { GaClient, RANGES, EVENTS };
