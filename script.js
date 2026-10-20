// ===== Analytics helper (GA4 gtag가 있을 때만 전송) =====
const track = (name, params = {}) => {
  if (typeof window.gtag === 'function') window.gtag('event', name, params);
};

// ===== Header scroll state =====
const header = document.getElementById('siteHeader');
const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 40);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// ===== Mobile menu =====
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');
const toggleMenu = (open) => {
  hamburger.classList.toggle('open', open);
  mobileMenu.classList.toggle('open', open);
  hamburger.setAttribute('aria-expanded', String(open));
  mobileMenu.setAttribute('aria-hidden', String(!open));
  document.body.style.overflow = open ? 'hidden' : '';
};
hamburger.addEventListener('click', () => toggleMenu(!mobileMenu.classList.contains('open')));
mobileMenu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => toggleMenu(false)));

// ===== AOS fade-in (whole site) =====
if (window.AOS) {
  // staggered groups (delay repeats within each grid/row)
  const staggered = [
    ['.hall-card', 90],
    ['.why-item', 90],
    ['.director-card', 120],
    ['.road-step', 70],
    ['.env-item', 80],
    ['.prog-card', 100],
    ['.map-app', 60],
    ['.loc-row', 90],
    ['.steps li', 70],
  ];
  staggered.forEach(([sel, step]) => {
    document.querySelectorAll(sel).forEach((el, i) => {
      el.setAttribute('data-aos', 'fade-up');
      el.setAttribute('data-aos-delay', String((i % 4) * step));
    });
  });
  // simple fade-up (no stagger)
  // NOTE: `.section-lead` is intentionally omitted — it always lives inside
  // `.section-head`, so it fades in together with its parent as one block.
  // Giving it its own AOS caused a nested double-animation (e.g. the
  // "학원 둘러보기" link appearing out of sync in LEARNING ENVIRONMENT).
  const simple = [
    '.section-head', '.road-copy', '.admission-form',
    '.detail-feature', '.detail-quote .container', '.cta-band .container',
    '.page-eyebrow', '.page-title', '.page-lead', '.global-list li',
  ];
  simple.forEach((sel) => {
    document.querySelectorAll(sel).forEach((el) => {
      // skip elements nested inside an already-animated ancestor to avoid
      // parent/child double-animations that fall out of sync
      if (!el.hasAttribute('data-aos') && !el.closest('[data-aos]')) {
        el.setAttribute('data-aos', 'fade-up');
      }
    });
  });

  AOS.init({ duration: 750, easing: 'ease-out-cubic', once: true, offset: 90, anchorPlacement: 'top-bottom' });
}

// ===== Reservation modal (popup) =====
const reserveModal = document.getElementById('reserveModal');
if (reserveModal) {
  let lastFocused = null;
  const openReserve = () => {
    lastFocused = document.activeElement;
    if (typeof mobileMenu !== 'undefined' && mobileMenu.classList.contains('open')) toggleMenu(false);
    reserveModal.classList.add('open');
    reserveModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    const first = reserveModal.querySelector('input:not([type="checkbox"]), select, textarea');
    if (first) setTimeout(() => first.focus(), 60);
  };
  const closeReserve = () => {
    reserveModal.classList.remove('open');
    reserveModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  };

  document.querySelectorAll('[data-reserve-open]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      track('reserve_open', { location: el.closest('section, header, footer')?.id || el.className || 'unknown' });
      openReserve();
    });
  });
  reserveModal.querySelectorAll('[data-reserve-close]').forEach((el) => {
    el.addEventListener('click', closeReserve);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && reserveModal.classList.contains('open')) closeReserve();
  });

  // Open automatically when arriving from another page with #reserve
  if (location.hash === '#reserve') openReserve();
  window.addEventListener('hashchange', () => { if (location.hash === '#reserve') openReserve(); });

  window.openReserve = openReserve;
  window.closeReserve = closeReserve;
}

// ===== Reservation form (Web3Forms → 연결된 이메일로 전송) =====
const RESERVE_ACCESS_KEY = '95047e57-d2cf-4bd4-bacc-9278ae0c4880';
const reserveForm = document.getElementById('reserveForm');
if (reserveForm) {
  const note = document.getElementById('reserveNote');
  const submitBtn = document.getElementById('reserveSubmit');
  const setNote = (msg, type) => { note.textContent = msg; note.className = 'rf-note' + (type ? ' ' + type : ''); };

  // 학생 이름: 한글·영문·공백만 허용
  const nameEl = reserveForm.elements['name'];
  if (nameEl) {
    nameEl.addEventListener('input', () => {
      const cleaned = nameEl.value.replace(/[^ㄱ-ㅎㅏ-ㅣ가-힣a-zA-Z\s]/g, '');
      if (cleaned !== nameEl.value) nameEl.value = cleaned;
    });
  }

  // 연락처: 숫자만 입력받아 자동 하이픈
  const phoneEl = reserveForm.elements['phone'];
  const formatPhone = (v) => {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (/^01/.test(d)) {                                  // 휴대폰(010 등) → 3-4-4
      if (d.length <= 3) return d;
      if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
      return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
    }
    if (d.startsWith('02')) {                              // 서울 지역번호
      if (d.length <= 2) return d;
      if (d.length <= 6) return `${d.slice(0, 2)}-${d.slice(2)}`;
      return `${d.slice(0, 2)}-${d.slice(2, d.length - 4)}-${d.slice(d.length - 4)}`;
    }
    if (d.length <= 3) return d;                           // 그 외 지역번호
    if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
    return `${d.slice(0, 3)}-${d.slice(3, d.length - 4)}-${d.slice(d.length - 4)}`;
  };
  const ageEl = reserveForm.elements['age'];
  if (phoneEl) {
    phoneEl.addEventListener('input', () => {
      const atEnd = phoneEl.selectionStart === phoneEl.value.length;
      phoneEl.value = formatPhone(phoneEl.value);
      if (atEnd) phoneEl.setSelectionRange(phoneEl.value.length, phoneEl.value.length);
      // 11자리(숫자 기준)가 채워지면 다음 입력칸으로 자동 이동
      if (phoneEl.value.replace(/\D/g, '').length >= 11 && ageEl) ageEl.focus();
    });
  }

  // 상담신청 완료 토스트
  const toast = document.getElementById('reserveToast');
  let toastTimer = null;
  const showToast = () => {
    if (!toast) return;
    toast.classList.add('show');
    toast.setAttribute('aria-hidden', 'false');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
      toast.setAttribute('aria-hidden', 'true');
    }, 2200);
  };

  reserveForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const els = reserveForm.elements;
    const name = els['name'].value.trim();
    const phone = els['phone'].value.trim();
    const achievement = els['achievement'].value.trim();
    const preferred = els['preferred'].value.trim();
    if (!name || !phone) {
      setNote('학생 이름과 연락처를 입력해 주세요.', 'error');
      return;
    }
    if (!achievement) {
      setNote('성취도를 선택해 주세요.', 'error');
      els['achievement'].focus();
      return;
    }
    if (!preferred) {
      setNote('희망 상담 시간을 입력해 주세요.', 'error');
      els['preferred'].focus();
      return;
    }
    if (!els['privacy'].checked) {
      setNote('개인정보 수집·이용에 동의해 주세요.', 'error');
      els['privacy'].focus();
      return;
    }

    const fd = new FormData(reserveForm);
    fd.append('access_key', RESERVE_ACCESS_KEY);
    fd.append('subject', '[도성학원] 새 상담예약 접수');
    fd.append('from_name', '도성학원 홈페이지');

    const label = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = '전송 중…';
    setNote('', '');
    try {
      const res = await fetch('https://api.web3forms.com/submit', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) {
        track('generate_lead', { method: 'reserve_form', achievement: fd.get('achievement') || '' });
        reserveForm.reset();
        setNote('', '');
        if (window.closeReserve) window.closeReserve();
        showToast();
      } else {
        setNote('전송에 실패했습니다. 잠시 후 다시 시도해 주세요.', 'error');
      }
    } catch {
      setNote('네트워크 오류로 전송하지 못했습니다. 잠시 후 다시 시도해 주세요.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = label;
    }
  });
}

// ===== Quick menu: scroll to top =====
document.querySelectorAll('.quick-top').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (window.lenis) window.lenis.scrollTo(0);
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});

// ===== Quick menu: SNS group toggle =====
// 펼침이 끝나면 overflow를 visible로 바꿔 버튼 그림자가 잘리지 않게 한다.
const openSnsGroup = (group) => {
  const list = group.querySelector('.quick-sns-list');
  const toggle = group.querySelector('.quick-sns-toggle');
  group.classList.add('is-open');
  if (toggle) toggle.setAttribute('aria-expanded', 'true');
  if (list) {
    const onEnd = (e) => {
      if (e.propertyName !== 'max-height') return;
      if (group.classList.contains('is-open')) list.style.overflow = 'visible';
      list.removeEventListener('transitionend', onEnd);
    };
    list.addEventListener('transitionend', onEnd);
  }
};
const closeSnsGroup = (group) => {
  const list = group.querySelector('.quick-sns-list');
  const toggle = group.querySelector('.quick-sns-toggle');
  if (list) list.style.overflow = ''; // 접힐 땐 다시 클립(CSS의 hidden으로 복귀)
  group.classList.remove('is-open');
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
};
document.querySelectorAll('.quick-sns-toggle').forEach((btn) => {
  const group = btn.closest('.quick-sns-group');
  if (!group) return;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (group.classList.contains('is-open')) closeSnsGroup(group);
    else openSnsGroup(group);
  });
});
// 바깥 클릭 시 닫기
document.addEventListener('click', (e) => {
  document.querySelectorAll('.quick-sns-group.is-open').forEach((group) => {
    if (group.contains(e.target)) return;
    closeSnsGroup(group);
  });
});

// ===== Lenis smooth scroll =====
let lenis = null;
if (window.Lenis) {
  document.documentElement.style.scrollBehavior = 'auto';
  lenis = new Lenis({ duration: 1.1, smoothWheel: true, wheelMultiplier: 1 });
  window.lenis = lenis;
  const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
}

// Smooth in-page anchor navigation
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    if (a.hasAttribute('data-reserve-open')) return; // handled by reservation modal
    const id = a.getAttribute('href');
    if (id.length > 1) {
      const target = document.querySelector(id);
      if (target) {
        e.preventDefault();
        if (lenis) lenis.scrollTo(target, { offset: -70 });
        else target.scrollIntoView({ behavior: 'smooth' });
      }
    }
  });
});

// ===== GSAP hero entrance =====
if (window.gsap && document.querySelector('.hero-inner')) {
  const heroEls = ['.hero-eyebrow', '.hero-title', '.hero-sub', '.hero-halls', '.hero-cta']
    .map((s) => document.querySelector(s))
    .filter(Boolean);
  gsap.set(heroEls, { opacity: 0, y: 26 });
  gsap.to(heroEls, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out', stagger: 0.11, delay: 0.15 });
}

// ===== Swiper — IN CLASS gallery =====
if (window.Swiper && document.querySelector('.class-swiper')) {
  new Swiper('.class-swiper', {
    slidesPerView: 1.12,
    spaceBetween: 16,
    grabCursor: true,
    loop: true,
    autoplay: { delay: 3500, disableOnInteraction: false },
    pagination: { el: '.class-swiper .swiper-pagination', clickable: true },
    breakpoints: {
      640: { slidesPerView: 2 },
      1024: { slidesPerView: 3 },
    },
  });
}

// ===== Naver blog feed (RSS via /api/blog nginx proxy) =====
(() => {
  const slider = document.getElementById('blogSlider');
  const grid = slider ? slider.querySelector('.swiper-wrapper') : null;
  if (!slider || !grid) return;

  const BLOG_HOME = 'https://blog.naver.com/djnsc';
  const MAX_POSTS = 12;

  const text = (node, sel) => {
    const el = node.querySelector(sel);
    return el ? el.textContent.trim() : '';
  };

  const formatDate = (raw) => {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
  };

  // description은 HTML 문자열(요약 + <img>) → 썸네일과 순수 텍스트로 분리
  const parseDescription = (html) => {
    const doc = new DOMParser().parseFromString(html || '', 'text/html');
    const img = doc.querySelector('img');
    const thumb = img ? img.getAttribute('src') || '' : '';
    doc.querySelectorAll('img').forEach((el) => el.remove());
    const excerpt = (doc.body.textContent || '').replace(/\s+/g, ' ').replace(/[.…]{3,}\s*$/, '…').trim();
    return { thumb: /^https:\/\//.test(thumb) ? thumb : '', excerpt };
  };

  const cleanLink = (link, guid) => {
    const candidate = /^https:\/\/blog\.naver\.com\//.test(guid) ? guid : link;
    try {
      const u = new URL(candidate);
      if (u.hostname !== 'blog.naver.com') return BLOG_HOME;
      u.search = '';
      return u.toString();
    } catch {
      return BLOG_HOME;
    }
  };

  const el = (tag, cls, content) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (content != null) node.textContent = content;
    return node;
  };

  const renderCard = (post, i) => {
    const card = el('article', 'swiper-slide blog-card is-visible');

    const link = el('a', 'blog-link');
    link.style.animationDelay = `${i * 80}ms`;
    link.href = post.link;
    link.target = '_blank';
    link.rel = 'noopener';
    link.setAttribute('aria-label', `${post.title} (새 창에서 네이버 블로그 열기)`);

    const thumb = el('div', 'blog-thumb');
    const showPlaceholder = () => {
      thumb.classList.add('blog-thumb-empty');
      thumb.replaceChildren(el('span', null, 'DJNSC'));
    };
    if (post.thumb) {
      const img = document.createElement('img');
      img.src = post.thumb;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      // 네이버 이미지 서버는 외부 Referer를 차단하므로 referrer를 보내지 않음
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', showPlaceholder, { once: true });
      thumb.appendChild(img);
    } else {
      showPlaceholder();
    }

    const body = el('div', 'blog-body');
    const meta = el('div', 'blog-meta');
    if (post.category) meta.appendChild(el('span', 'blog-category', post.category));
    if (post.date) {
      const time = el('time', null, post.date);
      time.dateTime = post.iso;
      meta.appendChild(time);
    }
    body.append(meta, el('h3', 'blog-title', post.title));
    if (post.excerpt) body.appendChild(el('p', 'blog-excerpt', post.excerpt));
    body.appendChild(el('span', 'blog-more', '자세히 보기 →'));

    link.append(thumb, body);
    card.appendChild(link);
    return card;
  };

  const renderFallback = (message) => {
    const box = el('div', 'blog-fallback');
    box.appendChild(el('p', null, message));
    const a = el('a', null, '네이버 블로그에서 보기 →');
    a.href = BLOG_HOME;
    a.target = '_blank';
    a.rel = 'noopener';
    box.appendChild(a);
    slider.classList.remove('swiper');
    slider.replaceChildren(box);
  };

  // 한 줄 가로 배치, 화면에 보이는 장수(데스크톱 3장)씩 5초마다 부드럽게 넘어가는 자동 슬라이드
  const initSlider = () => {
    if (!window.Swiper) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    new Swiper(slider, {
      slidesPerView: 1,
      slidesPerGroup: 1,
      spaceBetween: 16,
      loop: true,
      speed: 900,                  // 넘어가는 애니메이션 시간(ms)
      grabCursor: true,
      autoplay: reduceMotion ? false : { delay: 5000, disableOnInteraction: false, pauseOnMouseEnter: false },
      breakpoints: {
        640: { slidesPerView: 2, slidesPerGroup: 2, spaceBetween: 20 },
        1024: { slidesPerView: 3, slidesPerGroup: 3, spaceBetween: 24 },
      },
    });
  };

  fetch('/api/blog', { headers: { Accept: 'application/rss+xml, text/xml' } })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    })
    .then((xml) => {
      const doc = new DOMParser().parseFromString(xml, 'text/xml');
      if (doc.querySelector('parsererror')) throw new Error('invalid RSS');
      const posts = Array.from(doc.querySelectorAll('item'))
        .slice(0, MAX_POSTS)
        .map((item) => {
          const pub = text(item, 'pubDate');
          const d = new Date(pub);
          return {
            title: text(item, 'title'),
            link: cleanLink(text(item, 'link'), text(item, 'guid')),
            category: text(item, 'category'),
            date: formatDate(pub),
            iso: Number.isNaN(d.getTime()) ? '' : d.toISOString(),
            ...parseDescription(text(item, 'description')),
          };
        })
        .filter((p) => p.title);

      if (!posts.length) {
        renderFallback('아직 등록된 소식이 없습니다.');
        return;
      }
      // 3장/2장 묶음 루프가 끊기지 않도록 카드 수를 6의 배수(최소 12장)로 맞춰 같은 글을 반복 배치
      const target = Math.ceil(Math.max(12, posts.length) / 6) * 6;
      const slides = Array.from({ length: target }, (_, i) => posts[i % posts.length]);
      grid.replaceChildren(...slides.map(renderCard));
      initSlider();
    })
    .catch((err) => {
      console.warn('[blog] 네이버 블로그 글을 불러오지 못했습니다:', err);
      renderFallback('블로그 소식을 잠시 불러올 수 없습니다.');
    })
    .finally(() => slider.setAttribute('aria-busy', 'false'));
})();

// ===== 특강 안내 이미지 팝업 (겹침형 2개) =====
(() => {
  const popup = document.getElementById('promoPopup');
  if (!popup) return;

  const cards = Array.from(popup.querySelectorAll('.promo-card'));
  const keyFor = (id) => `djnsc_promo_hide_until_${id}`; // 팝업별 "오늘 하루" 저장

  const isHidden = (id) => {
    try {
      const until = Number(localStorage.getItem(keyFor(id)) || 0);
      return Boolean(until && Date.now() < until);
    } catch { return false; }
  };
  const hideForToday = (id) => {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
    try { localStorage.setItem(keyFor(id), String(end)); } catch {}
  };

  const visibleCards = () => cards.filter((c) => c.style.display !== 'none');

  const closeOverlayIfEmpty = () => {
    if (visibleCards().length) return;
    popup.classList.remove('open');
    popup.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };
  const closeCard = (card) => {
    card.style.display = 'none';
    closeOverlayIfEmpty();
  };

  // 숨김 기간인 팝업은 처음부터 감춘다
  cards.forEach((card) => { if (isHidden(card.dataset.popupId)) card.style.display = 'none'; });

  cards.forEach((card) => {
    card.querySelectorAll('[data-popup-close]').forEach((el) =>
      el.addEventListener('click', () => closeCard(card)));
    card.querySelectorAll('[data-popup-hide]').forEach((el) =>
      el.addEventListener('click', () => { hideForToday(card.dataset.popupId); closeCard(card); }));
    // 포스터 클릭 → 팝업 전체 닫고 상담예약 모달 열기
    card.querySelectorAll('[data-popup-reserve]').forEach((el) =>
      el.addEventListener('click', () => {
        track('promo_reserve', { popup: card.dataset.popupId });
        cards.forEach((c) => { c.style.display = 'none'; });
        closeOverlayIfEmpty();
        if (window.openReserve) window.openReserve();
      }));
  });

  // 배경 클릭 → 맨 앞 팝업만 닫기(뒤 팝업은 남긴다)
  popup.querySelectorAll('[data-popup-close-front]').forEach((el) =>
    el.addEventListener('click', () => {
      const vis = visibleCards();
      if (vis.length) closeCard(vis[vis.length - 1]);
    }));
  // ESC → 맨 앞 팝업부터 하나씩 닫기
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !popup.classList.contains('open')) return;
    const vis = visibleCards();
    if (vis.length) closeCard(vis[vis.length - 1]);
  });

  const shouldShow = location.hash !== '#reserve' && visibleCards().length > 0;
  if (shouldShow) {
    setTimeout(() => {
      popup.classList.add('open');
      popup.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      track('promo_open');
    }, 500);
  }
})();

// ===== Analytics: 전화·블로그·외부 링크 클릭 추적 =====
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (!a) return;
  const href = a.getAttribute('href') || '';
  if (href.startsWith('tel:')) {
    track('phone_click', { number: href.slice(4) });
  } else if (a.classList.contains('blog-link')) {
    track('blog_click', { title: (a.querySelector('.blog-title')?.textContent || '').slice(0, 100), url: a.href });
  } else if (/^https?:/.test(href) && a.hostname !== location.hostname) {
    track('outbound_click', { url: a.href, label: (a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 60) });
  }
});
