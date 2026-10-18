/* 도성학원 관리자 대시보드 */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');
  const pct = (n) => `${Math.round(Number(n || 0) * 100)}%`;
  const dur = (s) => {
    s = Math.round(Number(s || 0));
    const m = Math.floor(s / 60); const r = s % 60;
    return m ? `${m}분 ${r}초` : `${r}초`;
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const RED = '#770016', RED_B = '#9b1b36', GOLD = '#c9a874', WINE = '#4a1220', INK_SOFT = '#5c4b52';
  const PALETTE = [RED, GOLD, WINE, '#b8955e', RED_B, '#8a7a80', '#2a0c13', '#e2cca3'];

  let range = '7d';
  const charts = {};
  const PREV_LABEL = { today: '어제', '7d': '이전 7일', '28d': '이전 28일', '90d': '이전 90일' };

  if (location.search.includes('changed=1')) {
    $('#changedNotice').classList.remove('hidden');
    history.replaceState(null, '', '/admin/');
  }

  // ----- 상태/설정 -----
  const checkStatus = async () => {
    const r = await fetch('/admin/api/status', { credentials: 'same-origin' });
    if (r.status === 401) return location.assign('/admin/login');
    const s = await r.json();
    $('#saEmail').textContent = s.serviceAccount || '';
    if (s.ok) {
      $('#setup').classList.add('hidden');
      $('#subtitle').textContent = `djnsc.com · GA 속성 ${s.propertyName ? `"${s.propertyName}" ` : ''}(${s.measurementId})${s.mock ? ' · 샘플 데이터' : ''}`;
    } else {
      $('#setup').classList.remove('hidden');
      $('#setupErr').textContent = s.error || '';
      $('#subtitle').textContent = 'djnsc.com · GA 연결 대기 중';
    }
    return s.ok;
  };

  // ----- 실시간 -----
  const loadRealtime = async () => {
    try {
      const r = await fetch('/admin/api/realtime', { credentials: 'same-origin' });
      if (r.status === 401) return location.assign('/admin/login');
      if (!r.ok) throw new Error();
      const d = await r.json();
      $('#live').classList.remove('off');
      $('#liveText').textContent = `지금 접속 ${fmt(d.activeUsers)}명`;
    } catch {
      $('#live').classList.add('off');
      $('#liveText').textContent = '실시간 집계 불가';
    }
  };

  // ----- 렌더링 -----
  const delta = (el, cur, prev, kind) => {
    const c = Number(cur || 0), p = Number(prev || 0);
    let badge;
    if (!p && !c) badge = '<b class="flat">변화 없음</b>';
    else if (!p) badge = '<b class="up">신규</b>';
    else {
      const d = (c - p) / p;
      const cls = Math.abs(d) < 0.005 ? 'flat' : d > 0 ? 'up' : 'down';
      const sign = d > 0 ? '▲' : d < 0 ? '▼' : '';
      badge = `<b class="${cls}">${sign} ${Math.abs(Math.round(d * 100))}%</b>`;
    }
    const prevText = kind === 'dur' ? dur(p) : kind === 'pct' ? pct(p) : fmt(p);
    el.innerHTML = `${badge}<span>${PREV_LABEL[range]} ${prevText}</span>`;
  };

  const renderKpis = (k) => {
    const map = { users: 'n', sessions: 'n', pageviews: 'n', avgDuration: 'dur', reserveOpen: 'n', leads: 'n', newUsers: 'n', engagementRate: 'pct' };
    Object.entries(map).forEach(([key, kind]) => {
      const v = k[key] || { value: 0, prev: 0 };
      const el = $(`[data-kpi="${key}"]`);
      el.textContent = kind === 'dur' ? dur(v.value) : kind === 'pct' ? pct(v.value) : fmt(v.value);
      el.classList.remove('skeleton');
      delta($(`[data-delta="${key}"]`), v.value, v.prev, kind);
    });
  };

  const bars = (el, rows, opts = {}) => {
    const { valueKey = 'users', unit = '명', total = rows.reduce((a, r) => a + Number(r[valueKey] || 0), 0), gold = false, sub = null } = opts;
    if (!rows.length) { el.innerHTML = '<div class="empty">아직 데이터가 없습니다.</div>'; return; }
    const max = Math.max(...rows.map((r) => Number(r[valueKey] || 0)), 1);
    el.innerHTML = rows.map((r) => {
      const v = Number(r[valueKey] || 0);
      const share = total ? Math.round(v / total * 100) : 0;
      return `<div class="bar${gold ? ' gold' : ''}">
        <span class="name" title="${esc(r.raw || r.name)}">${esc(r.name)}${sub && r[sub] ? `<small>${esc(r[sub])}</small>` : ''}</span>
        <span class="val num">${fmt(v)}${unit}<small>${share}%</small></span>
        <span class="track"><span class="fill" style="width:${Math.round(v / max * 100)}%"></span></span>
      </div>`;
    }).join('');
  };

  const table = (el, rows, cols, empty = '아직 데이터가 없습니다.') => {
    const tb = $('tbody', el);
    if (!rows.length) { tb.innerHTML = `<tr><td colspan="${cols.length}" class="empty">${empty}</td></tr>`; return; }
    tb.innerHTML = rows.map((r, i) => `<tr>${cols.map((c, j) => `<td class="${c.r ? 'r num' : ''}">${j === 0 && c.rank ? `<span class="rank">${i + 1}</span>` : ''}${c.render(r)}</td>`).join('')}</tr>`).join('');
  };

  const mkChart = (id, cfg) => {
    try {
      if (charts[id]) charts[id].destroy();
      if (typeof Chart === 'undefined') throw new Error('Chart.js not loaded');
      charts[id] = new Chart($(`#${id}`), cfg);
    } catch (e) { console.warn('[admin] chart failed:', id, e.message); }
  };

  const trendLabel = (key) => {
    if (range === 'today') return `${Number(key)}시`;
    return `${Number(key.slice(4, 6))}/${Number(key.slice(6, 8))}`;
  };

  const renderTrend = (daily) => {
    $('#trendHint').textContent = range === 'today' ? '시간대별 방문자·방문 횟수' : '일별 방문자·방문 횟수';
    mkChart('trendChart', {
      type: 'line',
      data: {
        labels: daily.map((d) => trendLabel(d.key)),
        datasets: [
          { label: '방문자', data: daily.map((d) => d.users), borderColor: RED, backgroundColor: 'rgba(119,0,22,0.10)', fill: true, tension: 0.35, pointRadius: daily.length > 40 ? 0 : 3, borderWidth: 2 },
          { label: '방문 횟수', data: daily.map((d) => d.sessions), borderColor: GOLD, backgroundColor: 'transparent', tension: 0.35, pointRadius: daily.length > 40 ? 0 : 3, borderWidth: 2, borderDash: [4, 3] },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'top', align: 'end', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, font: { family: 'Pretendard', size: 12 } } } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { family: 'Pretendard', size: 11 }, maxTicksLimit: 12, color: INK_SOFT } },
          y: { beginAtZero: true, grid: { color: 'rgba(60,20,30,0.08)' }, ticks: { precision: 0, font: { family: 'Pretendard', size: 11 }, color: INK_SOFT } },
        },
      },
    });
  };

  const doughnut = (id, rows, key) => {
    if (!rows.length) { if (charts[id]) charts[id].destroy(); return; }
    mkChart(id, {
      type: 'doughnut',
      data: { labels: rows.map((r) => r.name), datasets: [{ data: rows.map((r) => r[key]), backgroundColor: rows.map((_, i) => PALETTE[i % PALETTE.length]), borderWidth: 2, borderColor: '#fff' }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { display: false } } },
    });
  };

  const render = (d) => {
    renderKpis(d.kpis);
    renderTrend(d.daily);
    doughnut('channelChart', d.channels, 'sessions');
    bars($('#channelBars'), d.channels, { valueKey: 'sessions', unit: '회' });
    bars($('#sourceBars'), d.sources.slice(0, 10), { valueKey: 'sessions', unit: '회' });
    table($('#eventTable'), d.events, [
      { render: (r) => esc(r.label) },
      { r: true, render: (r) => `<b>${fmt(r.value)}</b>` },
      { r: true, render: (r) => `<span style="color:#8a7a80">${fmt(r.prev)}</span>` },
    ]);
    table($('#pageTable'), d.pages.slice(0, 8), [
      { rank: true, render: (r) => `${esc(r.name)}<span class="sub">${esc(r.path)} · 평균 ${dur(r.avgDuration)}</span>` },
      { r: true, render: (r) => `<b>${fmt(r.views)}</b>` },
      { r: true, render: (r) => fmt(r.users) },
    ]);
    bars($('#cityBars'), d.cities.slice(0, 8), { gold: true });
    doughnut('deviceChart', d.devices, 'users');
    bars($('#deviceBars'), d.devices);
    const t = new Date(d.generatedAt);
    $('#updatedAt').textContent = `${d.label} 기준 · ${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')} 갱신 (5분마다 새로 집계)`;
  };

  const skeleton = () => { $$('[data-kpi]').forEach((el) => el.classList.add('skeleton')); };

  const load = async () => {
    skeleton();
    try {
      const r = await fetch(`/admin/api/report?range=${range}`, { credentials: 'same-origin' });
      if (r.status === 401) return location.assign('/admin/login');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      render(d);
    } catch (e) {
      $$('[data-kpi]').forEach((el) => { el.classList.remove('skeleton'); el.textContent = '–'; });
      $('#updatedAt').textContent = `데이터를 불러오지 못했습니다: ${e.message}`;
    }
  };

  $$('#ranges button').forEach((b) => b.addEventListener('click', () => {
    $$('#ranges button').forEach((x) => x.classList.toggle('active', x === b));
    range = b.dataset.range;
    load();
  }));

  (async () => {
    const ok = await checkStatus();
    loadRealtime();
    setInterval(loadRealtime, 60 * 1000);
    if (ok) load();
    else $('#updatedAt').textContent = 'GA 연결 후 통계가 표시됩니다.';
    // 연결 전이면 2분마다 상태를 다시 확인
    if (!ok) {
      const timer = setInterval(async () => { if (await checkStatus()) { clearInterval(timer); load(); } }, 120 * 1000);
    }
  })();
})();
