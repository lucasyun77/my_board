/* 메뉴: 신사업 (ideas) — "사내 벤처 스튜디오"
   아이디어가 가설·실험·관문을 거쳐 진행/중단으로 결정되는 과정을 한 화면에서 본다.
   이 메뉴 담당 하위 세션은 이 파일과 css/views/ideas.css 만 고칩니다.
   새 버튼 동작은 APP.acts, 폼은 APP.forms, select·체크 변경은 APP.changes 에 등록합니다. */
(function () {
  'use strict';
  const { S, STAGES, esc, days, md, badge, chip, uid, toast, dayStr } = window.APP;

  /* ================= 기준 ================= */
  const AXES = [
    ['시장성', '시장 크기·성장성'],
    ['적합도', '우리 그룹 역량·브랜드와 맞는 정도'],
    ['필요자원', '적게 들수록 높게(5 = 자원 적음)'],
    ['속도', '빨리 검증·출시할 수 있을수록 높게']
  ];
  const ACTIVE = ['아이디어', '검증', 'PoC'];
  const FLOW = ['아이디어', '검증', 'PoC', '론칭'];
  const HYP = [
    ['cust', '고객', '누가 이 문제를 겪나요?'],
    ['prob', '문제', '무엇이 불편하거나 비싼가요?'],
    ['sol', '해결', '우리는 어떻게 풀어 주나요?'],
    ['rev', '수익', '누가, 무엇에, 어떻게 돈을 내나요?']
  ];
  const HYP_ST = ['미검증', '검증 중', '확인', '기각'];
  const HYP_CLS = { '미검증': 'n', '검증 중': 'w', '확인': 'ok', '기각': 'no' };
  const VERDICTS = ['지지', '반박', '애매'];
  const DECISIONS = ['진행', '보류', '중단', '피벗'];
  const hypOk = (i, k) => i.hyp[k].st === '확인';
  const lastDecision = (i) => i.decisions[i.decisions.length - 1];
  /* 단계 관문: 그 단계로 들어가려면 충족해야 할 조건. auto가 있으면 자동 판정, 없으면 수기 체크 */
  const GATES = {
    '검증': [
      { k: 'prob', t: '문제 가설을 적었다', auto: (i) => !!i.hyp.prob.t },
      { k: 'cust', t: '고객 가설을 적었다', auto: (i) => !!i.hyp.cust.t },
      { k: 'owner', t: '담당을 정했다', auto: (i) => !!i.owner && i.owner !== '담당 미정' }
    ],
    'PoC': [
      { k: 'pc', t: '고객·문제 가설이 「확인」', auto: (i) => hypOk(i, 'cust') && hypOk(i, 'prob') },
      { k: 'exp1', t: '실험 1건 이상 기록', auto: (i) => i.exps.length >= 1 },
      { k: 'score', t: '4축 합계 12점 이상', auto: (i) => total(i) >= 12 },
      { k: 'res', t: 'PoC 인력·예산 확보(수기 확인)' }
    ],
    '론칭': [
      { k: 'sr', t: '해결·수익 가설이 「확인」', auto: (i) => hypOk(i, 'sol') && hypOk(i, 'rev') },
      { k: 'exp3', t: '실험 3건 이상, 「지지」 1건 이상', auto: (i) => i.exps.length >= 3 && i.exps.some((e) => e.verdict === '지지') },
      { k: 'go', t: '최근 결정이 「진행」', auto: (i) => (lastDecision(i) || {}).decision === '진행' },
      { k: 'legal', t: '법무·브랜드 검토 완료(수기 확인)' }
    ]
  };
  const CANVAS = [
    ['prob', '문제'], ['sol', '해결책'], ['uvp', '고유 가치 제안'], ['edge', '경쟁 우위'], ['cust', '고객군'],
    ['metric', '핵심 지표'], ['channel', '채널'], ['cost', '비용 구조'], ['rev', '수익원']
  ];

  /* ================= 데이터 정리 ================= */
  S.activity = S.activity || [];
  S.inbox = S.inbox || [];
  const H = (t, st) => ({ t: t || '', st: st || '미검증' });
  const SEED = {
    i1: {
      links: ['https://example.com/gamecoach-interview'], notes: [{ at: dayStr(-10), body: '아이디어 등록', kind: 'sys' }],
      hyp: { cust: H('실력을 빨리 올리고 싶은 10~20대 게이머', '검증 중'), prob: H('혼자 연습하면 무엇이 문제인지 몰라 정체된다', '확인'), sol: H('검증된 코치와 1:1 화면 공유 코칭 매칭'), rev: H('회당 코칭료의 일정 비율을 수수료로') },
      exps: [{ at: dayStr(-3), what: '대학 e스포츠 동아리 3곳 인터뷰', hyp: 'prob', result: '면담자 다수가 "피드백 받을 곳이 없다"고 답함', learn: '문제는 분명하나 지불 의사는 아직 모름', verdict: '지지' }]
    },
    i3: {
      links: ['https://example.com/sensetalk-poc-plan'], notes: [{ at: dayStr(-12), body: '단계 변경: 검증 → PoC', kind: 'sys' }],
      hyp: { cust: H('리뷰·문의를 매일 확인할 시간이 없는 가맹 점주', '확인'), prob: H('고객 의견이 흩어져 있어 개선점을 놓친다', '확인'), sol: H('매장 의견을 AI가 하루 한 번 요약해 알림', '검증 중'), rev: H('가맹점 월 구독료(본사 일부 지원)') },
      exps: [
        { at: dayStr(-15), what: '점주 5명에게 요약 샘플 보여 주기', hyp: 'prob', result: '5명 모두 "매일 받고 싶다"', learn: '알림 시간은 영업 전 오전이 좋다', verdict: '지지' },
        { at: dayStr(-8), what: '요약 정확도 내부 점검(리뷰 100건)', hyp: 'sol', result: '오분류가 일부 있어 메뉴명 사전 필요', learn: '브랜드별 메뉴 사전을 먼저 만든다', verdict: '애매' }
      ],
      decisions: [{ at: dayStr(-12), decision: '진행', reason: '점주 반응이 좋고 필요 자원이 적어 PoC로 진행' }]
    },
    i5: {
      notes: [{ at: dayStr(-2), body: '후보 도시: 호치민·도쿄·LA 1차 압축', kind: 'memo' }],
      hyp: { cust: H('한국식 포차 분위기를 찾는 해외 20~30대', '검증 중'), prob: H('현지에 한국 술자리 문화를 제대로 겪을 곳이 적다') },
      decisions: [{ at: dayStr(-5), decision: '보류', reason: '현지 파트너 후보가 정해질 때까지 투자 판단 보류 → 검증 단계에서 조사만 계속' }]
    }
  };
  function normalize() {
    S.ideas.forEach((i) => {
      if (!Array.isArray(i.links)) i.links = String(i.links || '').split(/\n+/).map((x) => x.trim()).filter(Boolean);
      if (!Array.isArray(i.notes)) i.notes = [];
      if (!Array.isArray(i.tags)) i.tags = [];
      if (!Array.isArray(i.s) || i.s.length !== 4) i.s = [3, 3, 3, 3];
      if (!i.hyp) i.hyp = {};
      HYP.forEach(([k]) => { i.hyp[k] = Object.assign(H(), i.hyp[k] || {}); });
      if (!Array.isArray(i.exps)) i.exps = [];
      if (!Array.isArray(i.decisions)) i.decisions = [];
      if (!i.gateChk) i.gateChk = {};
      if (!i.canvas) i.canvas = {};
      if (!i.devil) i.devil = null;
      const sd = SEED[i.id];
      if (sd && !S.ideasSeeded && sd.links && !i.links.length) i.links = sd.links.slice();
      if (sd && !S.ideasSeeded && sd.notes) i.notes = sd.notes.concat(i.notes);
      if (sd && !S.ideasSeeded2) {
        if (sd.hyp) HYP.forEach(([k]) => { if (sd.hyp[k] && !i.hyp[k].t) i.hyp[k] = Object.assign({}, sd.hyp[k]); });
        if (sd.exps && !i.exps.length) i.exps = sd.exps.map((e) => Object.assign({ id: uid('x') }, e));
        if (sd.decisions && !i.decisions.length) i.decisions = sd.decisions.map((d) => Object.assign({ id: uid('c') }, d));
      }
    });
    if (!S.ideasSeeded2 && !S.inbox.some((x) => x.id === 'ib-ideas-sample')) {
      S.inbox.push({ id: 'ib-ideas-sample', at: new Date().toISOString(), from: 'ideabank', to: 'ideas', kind: 'adopt', title: '무인 야간 운영 키트', payload: { summary: '영업 종료 후 매장을 무인 픽업 거점으로 쓰는 운영 키트', topic: '매장 운영', sample: true }, done: false });
    }
    S.ideasSeeded = true; S.ideasSeeded2 = true;
  }

  /* ================= 도구 ================= */
  const total = (i) => i.s.reduce((a, b) => a + (+b || 0), 0);
  const level = (n) => (n >= 16 ? 'hi' : n >= 12 ? 'mid' : 'lo');
  const dday = (d) => { if (!d) return ''; const n = days(S.today, d); return n === 0 ? 'D-day' : n > 0 ? `D-${n}` : `D+${-n}`; };
  const isLate = (i) => ACTIVE.includes(i.stage) && i.next_due && i.next_due < S.today;
  const safeUrl = (u) => (/^https?:\/\//i.test(u) ? u : '');
  const byId = (id) => S.ideas.find((x) => x.id === id);
  const ui = () => S.ui;
  const mockAi = () => '<span class="b e ideas-mockai" title="목업 AI: 규칙으로 만든 예시 결과">목업 AI</span>';
  function logAct(type, text, ref) {
    S.activity.push({ id: uid('ac'), at: new Date().toISOString(), menu: 'ideas', type, text, ref: ref || '' });
    if (S.activity.length > 300) S.activity.splice(0, S.activity.length - 300);
  }
  const note = (i, body) => i.notes.push({ at: S.today, body, kind: 'sys' });
  function gateOf(i, stage) {
    const items = (GATES[stage] || []).map((g) => Object.assign({}, g, { ok: g.auto ? !!g.auto(i) : !!i.gateChk[stage + ':' + g.k] }));
    return { items, met: items.filter((g) => g.ok).length, n: items.length };
  }
  /* from → to 앞으로 갈 때 거쳐야 할 관문 중 미충족 */
  function unmetBetween(i, from, to) {
    const a = FLOW.indexOf(from), b = FLOW.indexOf(to);
    if (b <= a || b < 1) return [];
    const start = a < 0 ? 1 : a + 1;
    const out = [];
    for (let k = start; k <= b; k++) gateOf(i, FLOW[k]).items.filter((g) => !g.ok).forEach((g) => out.push(`[${FLOW[k]}] ${g.t}`));
    return out;
  }
  const nextStage = (i) => { const k = FLOW.indexOf(i.stage); return k >= 0 && k < 3 ? FLOW[k + 1] : null; };
  function sorted(list) {
    const mode = ui().ideaSort || 'score';
    return list.slice().sort((a, b) => mode === 'due'
      ? String(a.next_due || '9').localeCompare(String(b.next_due || '9')) || total(b) - total(a)
      : total(b) - total(a) || String(a.next_due || '9').localeCompare(String(b.next_due || '9')));
  }
  const byScore = (list) => list.slice().sort((a, b) => total(b) - total(a) || String(a.next_due || '9').localeCompare(String(b.next_due || '9')));
  const stageSelect = (i, extra = '') => `<select aria-label="${esc(i.title)} 단계 이동" data-act="ideasStage" data-id="${i.id}" ${extra}>${STAGES.map((s) => `<option ${s === i.stage ? 'selected' : ''}>${s}</option>`).join('')}</select>`;
  const scoreBox = (i) => `<span class="ideas-score ${level(total(i))}" title="4축 합계(20점 만점)"><b class="num">${total(i)}</b><small>/20</small></span>`;
  const pips = (n) => `<span class="ideas-pips" aria-hidden="true">${[1, 2, 3, 4, 5].map((k) => `<i class="${k <= n ? 'on' : ''}"></i>`).join('')}</span>`;
  const dueTag = (i) => (i.next_due ? `<span class="num ideas-due ${isLate(i) ? 'late' : ''}">${md(i.next_due)} · ${dday(i.next_due)}</span>` : '');
  const hypPill = (st) => `<span class="ideas-hst ${HYP_CLS[st] || 'n'}">${esc(st)}</span>`;
  const seg = (act, cur, opts, extra = '') => `<span class="seg" ${extra}>${opts.map(([v, l]) => `<button type="button" data-act="${act}" data-v="${v}" aria-pressed="${v === cur}">${l}</button>`).join('')}</span>`;

  /* ================= 담당 고르기: 입력해서 찾는 칸 (조직·사람, 초성 검색) ================= */
  const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  const cho = (s) => String(s || '').replace(/[가-힣]/g, (c) => CHO[Math.floor((c.charCodeAt(0) - 0xAC00) / 588)]);
  function ownerList() {
    const m = new Map();
    (window.MOCK && MOCK.ORGS || []).forEach((o) => m.set(o, { n: o, d: '조직' }));
    (S.directives || []).forEach((d) => { if (d.assignee && d.assignee !== '미지정' && !m.has(d.assignee)) m.set(d.assignee, { n: d.assignee, d: d.org || '' }); });
    S.ideas.forEach((i) => { if (i.owner && i.owner !== '담당 미정' && !m.has(i.owner)) m.set(i.owner, { n: i.owner, d: '기존 담당' }); });
    return [...m.values()];
  }
  function picker(name, value, label) {
    const v = value || '';
    return `<span class="ipp"><input type="text" class="ipp-in" role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="ippl-${name}" aria-label="${esc(label)}" autocomplete="off" spellcheck="false" data-ipk="${name}" data-prev="${esc(v)}" value="${esc(v)}" placeholder="조직·이름·초성(예: ㅁㅋㅌ)"><input type="hidden" name="${name}" value="${esc(v)}">${v ? '<button type="button" class="ipp-x" tabindex="-1" aria-label="지우기">×</button>' : ''}<ul class="ipp-list" id="ippl-${name}" role="listbox" hidden></ul></span>`;
  }
  function ippMatches(q) {
    q = String(q || '').trim().toLowerCase();
    const onlyCho = q && /^[ㄱ-ㅎ\s]+$/.test(q);
    return ownerList().map((s) => {
      if (!q) return [s, 0];
      const n = s.n.toLowerCase(); const hay = (s.n + ' ' + s.d).toLowerCase();
      if (onlyCho) { const c = cho(s.n); return [s, c.startsWith(q) ? 1 : c.includes(q) ? 2 : cho(hay).includes(q) ? 3 : -1]; }
      return [s, n.startsWith(q) ? 1 : n.includes(q) ? 2 : hay.includes(q) ? 3 : -1];
    }).filter((x) => x[1] >= 0).sort((a, b) => a[1] - b[1] || a[0].n.localeCompare(b[0].n, 'ko')).map((x) => x[0]);
  }
  function ippOpen(inp, q) {
    const ul = inp.parentNode.querySelector('.ipp-list');
    const hits = ippMatches(q).slice(0, 40);
    ul.innerHTML = (!String(q || '').trim() ? '<li role="option" data-v="" class="ipp-empty">담당 미정</li>' : '')
      + hits.map((s) => `<li role="option" data-v="${esc(s.n)}"><b>${esc(s.n)}</b><span class="small muted">${esc(s.d)}</span></li>`).join('')
      + (!hits.length ? '<li class="ipp-more small muted" aria-disabled="true">맞는 항목이 없습니다 — 칸을 벗어나면 원래 값으로 돌아갑니다</li>' : '');
    ul.hidden = false; inp.setAttribute('aria-expanded', 'true');
    ippActive(inp, ul.querySelector('li[data-v]' + (String(q || '').trim() ? ':not(.ipp-empty)' : '')));
  }
  function ippActive(inp, li) {
    const ul = inp.parentNode.querySelector('.ipp-list');
    ul.querySelectorAll('li.on').forEach((x) => x.classList.remove('on'));
    if (li) { li.classList.add('on'); li.id = li.id || 'ippo-' + Math.random().toString(36).slice(2, 8); inp.setAttribute('aria-activedescendant', li.id); li.scrollIntoView({ block: 'nearest' }); } else inp.removeAttribute('aria-activedescendant');
  }
  function ippClose(inp) { const ul = inp.parentNode && inp.parentNode.querySelector('.ipp-list'); if (ul) ul.hidden = true; inp.setAttribute('aria-expanded', 'false'); }
  function ippPick(inp, v) {
    inp.value = v; inp.dataset.prev = v; ippClose(inp);
    inp.parentNode.querySelector('input[type=hidden]').value = v;
    let x = inp.parentNode.querySelector('.ipp-x');
    if (v && !x) { inp.insertAdjacentHTML('afterend', '<button type="button" class="ipp-x" tabindex="-1" aria-label="지우기">×</button>'); }
    if (!v && x) x.remove();
  }
  document.addEventListener('focusin', (e) => { const t = e.target; if (t && t.dataset && t.dataset.ipk) { t.select(); ippOpen(t, ''); } });
  document.addEventListener('input', (e) => { const t = e.target; if (t && t.dataset && t.dataset.ipk) ippOpen(t, t.value); });
  document.addEventListener('focusout', (e) => {
    const t = e.target; if (!t || !t.dataset || !t.dataset.ipk) return;
    ippClose(t);
    const typed = t.value.trim(); if (typed === t.dataset.prev) return;
    if (!typed) { ippPick(t, ''); return; }
    const hits = ippMatches(typed); const exact = hits.find((s) => s.n === typed) || (hits.length === 1 ? hits[0] : null);
    if (exact) ippPick(t, exact.n); else t.value = t.dataset.prev;
  });
  window.addEventListener('keydown', (e) => {
    const t = e.target; if (!t || !t.dataset || !t.dataset.ipk) return;
    const ul = t.parentNode.querySelector('.ipp-list');
    const opts = [...ul.querySelectorAll('li[data-v]')]; const cur = ul.querySelector('li.on'); const k = opts.indexOf(cur);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (ul.hidden) { ippOpen(t, ''); return; } ippActive(t, opts[e.key === 'ArrowDown' ? Math.min(opts.length - 1, k + 1) : Math.max(0, k - 1)] || null); }
    else if (e.key === 'Enter') { e.preventDefault(); if (!ul.hidden && cur) ippPick(t, cur.dataset.v); }
    else if (e.key === 'Escape' && !ul.hidden) { e.preventDefault(); e.stopImmediatePropagation(); t.value = t.dataset.prev; ippClose(t); }
  }, true);
  document.addEventListener('mousedown', (e) => {
    const t = e.target; if (!t || !t.closest) return;
    const li = t.closest('.ipp-list li[data-v]');
    if (li) { e.preventDefault(); ippPick(li.closest('.ipp').querySelector('.ipp-in'), li.dataset.v); return; }
    if (t.closest('.ipp-list')) { e.preventDefault(); return; }
    const x = t.closest('.ipp-x');
    if (x) { e.preventDefault(); const inp = x.closest('.ipp').querySelector('.ipp-in'); ippPick(inp, ''); inp.focus(); }
  });

  /* ================= 카드·보기 ================= */
  function card(i) {
    const nx = nextStage(i); const g = nx && gateOf(i, nx);
    return `<article class="card ideas-card ${isLate(i) ? 'late' : ''}" data-act="ideaOpen" data-id="${i.id}">
      <div class="ideas-card-top"><button type="button" class="ideas-title" data-act="ideaOpen" data-id="${i.id}">${esc(i.title)}</button>${scoreBox(i)}</div>
      ${i.summary ? `<div class="ideas-sum">${esc(i.summary)}</div>` : ''}
      <div class="ideas-axes small">${AXES.map(([a], k) => `<span>${a} <b class="num">${i.s[k]}</b></span>`).join('')}</div>
      ${i.next_action ? `<div class="ideas-next small"><span class="muted">다음</span> ${esc(i.next_action)} ${dueTag(i)}</div>` : ''}
      ${g ? `<div class="ideas-gatebar small ${g.met === g.n ? 'ok' : ''}" title="${esc(nx)} 관문 조건 충족 수"><span>${esc(nx)} 관문</span><span class="ideas-gatepips" aria-hidden="true">${g.items.map((x) => `<i class="${x.ok ? 'on' : ''}"></i>`).join('')}</span><b class="num">${g.met}/${g.n}</b></div>` : ''}
      ${i.tags.length ? `<div class="row ideas-tags">${i.tags.map(chip).join('')}</div>` : ''}
      <div class="ideas-foot small muted"><span>${esc(i.owner)}</span><span>가설 확인 ${HYP.filter(([k]) => hypOk(i, k)).length}/4</span>${i.exps.length ? `<span>실험 ${i.exps.length}</span>` : ''}${i.notes.filter((n) => n.kind !== 'sys').length ? `<span>메모 ${i.notes.filter((n) => n.kind !== 'sys').length}</span>` : ''}</div>
      ${stageSelect(i, 'class="ideas-stage-sel"')}
    </article>`;
  }
  function column(st) {
    const c = sorted(S.ideas.filter((i) => i.stage === st));
    return `<section class="col" data-stage="${st}" aria-label="${st} ${c.length}건"><header><span>${st}</span><span class="num muted">${c.length}</span></header>
      ${c.map(card).join('') || '<div class="small muted ideas-empty">비어 있음</div>'}</section>`;
  }
  function kanban() {
    return `<div class="ideas-kanban">${FLOW.map(column).join('')}</div>
      ${ui().ideaClosed !== false ? `<div class="ideas-kanban closed">${['보류', '폐기'].map(column).join('')}</div>` : ''}`;
  }
  const shown = () => S.ideas.filter((i) => ui().ideaClosed !== false || !['보류', '폐기'].includes(i.stage));
  function ranking() {
    const list = byScore(shown());
    return `<section class="panel"><h3>점수표 ${badge('수기')}</h3><p class="small muted ideas-lead">4축 합계 순. 필요자원은 적게 들수록 높은 점수입니다.</p>
      <ol class="ideas-rank">${list.map((i, n) => `<li>
        <span class="ideas-rank-n num">${n + 1}</span>
        <div class="ideas-rank-main"><button type="button" class="ideas-title" data-act="ideaOpen" data-id="${i.id}">${esc(i.title)}</button>
          <div class="small muted">${esc(i.stage)} · ${esc(i.owner)}${i.next_due ? ` · 다음 액션 ${dueTag(i)}` : ''}</div>
          <div class="ideas-rank-axes small">${AXES.map(([a], k) => `<span>${a} ${pips(i.s[k])}<b class="num">${i.s[k]}</b></span>`).join('')}</div></div>
        ${scoreBox(i)}</li>`).join('') || '<li class="muted">아이디어가 없습니다.</li>'}</ol></section>`;
  }
  /* 포트폴리오 지도: 가로 시장성 × 세로 적합도, 원 크기 = 필요 자원(많이 들수록 큼) */
  function portfolioMap() {
    const list = shown();
    const narrow = window.matchMedia && matchMedia('(max-width: 640px)').matches;
    const W = narrow ? 360 : 720, Hh = narrow ? 400 : 460, L = narrow ? 34 : 54, R = narrow ? 30 : 44, T = 40, B = 44;
    const px = (v) => L + ((v - 1) / 4) * (W - L - R), py = (v) => T + ((5 - v) / 4) * (Hh - T - B);
    const groups = {};
    list.forEach((i) => { const k = i.s[0] + ',' + i.s[1]; (groups[k] = groups[k] || []).push(i); });
    const dots = [];
    Object.values(groups).forEach((g) => g.forEach((i, n) => {
      const ang = (n / g.length) * Math.PI * 2 - Math.PI / 2, off = g.length > 1 ? (narrow ? 22 : 30) : 0;
      dots.push({ i, x: px(i.s[0]) + Math.cos(ang) * off, y: py(i.s[1]) + Math.sin(ang) * off, r: (narrow ? 7 : 9) + (5 - i.s[2]) * (narrow ? 3.5 : 5) });
    }));
    dots.sort((a, b) => b.r - a.r);
    const grid = [1, 2, 3, 4, 5].map((v) => `<line x1="${px(v)}" y1="${T}" x2="${px(v)}" y2="${Hh - B}" class="g"/><line x1="${L}" y1="${py(v)}" x2="${W - R}" y2="${py(v)}" class="g"/><text x="${px(v)}" y="${Hh - B + 18}" text-anchor="middle" class="ax">${v}</text><text x="${L - 10}" y="${py(v) + 5}" text-anchor="end" class="ax">${v}</text>`).join('');
    const svg = `<svg class="ideas-map" viewBox="0 0 ${W} ${Hh}" role="group" aria-label="포트폴리오 지도: 가로 시장성, 세로 적합도, 원 크기는 필요 자원">
      <rect x="${px(3)}" y="${T}" width="${px(5) - px(3)}" height="${py(3) - T}" class="q"/>
      <text x="${px(5) - 6}" y="${py(3) - 8}" text-anchor="end" class="ql">우선 추진</text>
      <text x="${L + 6}" y="${Hh - B - 8}" class="ql">재검토</text>
      ${grid}
      <text x="${(L + W - R) / 2}" y="${Hh - 6}" text-anchor="middle" class="at">시장성 →</text>
      <text transform="translate(${narrow ? 11 : 16} ${(T + Hh - B) / 2}) rotate(-90)" text-anchor="middle" class="at">적합도 →</text>
      ${dots.map((d) => `<g class="dot" data-act="ideaOpen" data-id="${d.i.id}" data-stage="${esc(d.i.stage)}" tabindex="0" role="button" aria-label="${esc(d.i.title)}: 시장성 ${d.i.s[0]}, 적합도 ${d.i.s[1]}, 필요자원 ${d.i.s[2]}, ${esc(d.i.stage)}"><circle cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" r="${d.r.toFixed(1)}"/><text x="${(d.x > W - R - 50 ? d.x + d.r : d.x < L + 50 ? d.x - d.r : d.x).toFixed(1)}" y="${(d.y - d.r - 5).toFixed(1)}" text-anchor="${d.x > W - R - 50 ? 'end' : d.x < L + 50 ? 'start' : 'middle'}" class="lb">${esc(d.i.title.length > 9 ? d.i.title.slice(0, 9) + '…' : d.i.title)}</text></g>`).join('')}
    </svg>`;
    return `<section class="panel"><h3>포트폴리오 지도 ${badge('수기')}</h3><p class="small muted ideas-lead">가로 시장성 × 세로 적합도. 원이 클수록 필요 자원이 많습니다. 원을 누르면 상세가 열립니다.</p>
      ${svg}
      <div class="ideas-legend small">${FLOW.concat(['보류', '폐기']).map((s) => `<span data-stage="${s}"><i></i>${s}</span>`).join('')}<span class="muted">· 원 크기 = 필요 자원</span></div></section>`;
  }

  /* ================= 상세 창 ================= */
  const TABS = [['over', '개요'], ['hyp', '가설'], ['exp', '실험'], ['gate', '관문'], ['dec', '결정'], ['canvas', '개요서']];
  function form(i) {
    const isNew = !i;
    const d = i || { title: '', summary: '', owner: '', stage: '아이디어', s: [3, 3, 3, 3], next_action: '', next_due: dayStr(7), tags: [], links: [] };
    const pre = ui().ideaPrefill || {};
    if (isNew && pre.title) Object.assign(d, { title: pre.title, summary: pre.summary || '' });
    return `<form class="form ideas-form" data-form="ideaSave" data-id="${isNew ? '' : d.id}">
      <label class="f wide">제목<input type="text" name="title" required maxlength="60" value="${esc(d.title)}" placeholder="예: 매장 무인 주문 키트"></label>
      <label class="f wide">한 줄 설명<input type="text" name="summary" maxlength="120" value="${esc(d.summary)}" placeholder="무엇을, 누구에게"></label>
      <label class="f">담당${picker('owner', d.owner === '담당 미정' ? '' : d.owner, '담당 찾기')}</label>
      <label class="f">단계<select name="stage">${STAGES.map((s) => `<option ${s === d.stage ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <div class="wide ideas-axis-grid">${AXES.map(([a, hint], k) => `<fieldset class="ideas-axis"><legend>${a} <span class="muted">· ${hint}</span></legend>
        <div class="ideas-radio">${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="s${k}" value="${n}" ${n === +d.s[k] ? 'checked' : ''}><span class="num">${n}</span></label>`).join('')}</div></fieldset>`).join('')}</div>
      <label class="f wide">다음 액션<input type="text" name="next_action" value="${esc(d.next_action)}" placeholder="예: 경쟁 서비스 5개 비교"></label>
      <label class="f">다음 액션 기한<input type="date" name="next_due" value="${esc(d.next_due)}"></label>
      <fieldset class="wide ideas-tagset"><legend>태그</legend><div class="row">${S.tags.slice().sort((a, b) => a.sort - b.sort).map((t) => `<label class="chip"><input type="checkbox" name="tags" value="${t.id}" ${d.tags.includes(t.id) ? 'checked' : ''}> ${esc(t.name)}</label>`).join('')}</div></fieldset>
      <label class="f wide">링크 <span class="muted">(한 줄에 하나, https://로 시작)</span><textarea name="links" rows="2" placeholder="https://">${esc(d.links.join('\n'))}</textarea></label>
      ${isNew ? '<label class="f wide">첫 메모 <span class="muted">(선택)</span><textarea name="memo" rows="2"></textarea></label>' : ''}
      <div class="wide row ideas-form-btns"><button class="btn primary">${isNew ? '등록' : '저장'}</button><button type="button" class="btn" data-act="${isNew ? 'ideaClose' : 'ideaEditOff'}">취소</button></div>
    </form>`;
  }
  function tabOver(i) {
    const notes = i.notes.map((n, k) => ({ ...n, k })).reverse();
    return `<div class="ideas-d-sec"><h4>4축 점수 ${badge('수기')}</h4>
        <ul class="ideas-d-axes">${AXES.map(([a, hint], k) => `<li><span>${a}<small class="muted">${hint}</small></span>${pips(i.s[k])}<b class="num">${i.s[k]}</b></li>`).join('')}</ul></div>
      <div class="ideas-d-sec"><h4>다음 액션</h4>${i.next_action ? `<p>${esc(i.next_action)} ${dueTag(i)}</p>` : '<p class="muted">정하지 않음</p>'}</div>
      <div class="ideas-d-grid">
        <div class="ideas-d-sec"><h4>태그</h4>${i.tags.length ? `<div class="row">${i.tags.map(chip).join('')}</div>` : '<p class="muted">없음</p>'}</div>
        <div class="ideas-d-sec"><h4>링크</h4>${i.links.length ? `<ul class="ideas-links">${i.links.map((l) => safeUrl(l) ? `<li><a href="${esc(l)}" target="_blank" rel="noopener noreferrer">${esc(l.replace(/^https?:\/\//i, ''))}</a></li>` : `<li>${esc(l)}</li>`).join('')}</ul>` : '<p class="muted">없음</p>'}</div>
      </div>
      <div class="ideas-d-sec"><h4>메모 이력 <span class="muted num">${i.notes.length}</span></h4>
        <form class="ideas-note-form" data-form="ideaNote" data-id="${i.id}"><label class="f" style="flex:1">새 메모<textarea name="body" rows="2" required placeholder="회의 결과, 판단 근거 등"></textarea></label><button class="btn primary">메모 추가</button></form>
        <ol class="ideas-notes">${notes.map((n) => `<li class="${n.kind === 'sys' ? 'sys' : ''}"><span class="num muted">${esc(md(n.at))}</span><span>${n.kind === 'sys' ? '<span class="pill">기록</span> ' : ''}${esc(n.body)}</span>${n.kind === 'sys' ? '' : `<button type="button" class="ideas-x" data-act="ideaNoteDel" data-id="${i.id}" data-k="${n.k}" aria-label="메모 삭제">×</button>`}</li>`).join('') || '<li class="muted">아직 메모가 없습니다.</li>'}</ol></div>`;
  }
  function tabHyp(i) {
    return `<p class="small muted ideas-lead">네 가지 가설을 적고, 실험 결과에 따라 상태를 바꿉니다. 「확인」이 쌓여야 다음 관문을 넘습니다.</p>
      <div class="ideas-hyps">${HYP.map(([k, name, q]) => {
        const h = i.hyp[k];
        return `<section class="ideas-hyp ${HYP_CLS[h.st]}"><header><b>${name} 가설</b>${hypPill(h.st)}</header>
          <label class="f"><span class="muted">${q}</span><textarea rows="2" data-hyp="${k}" data-id="${i.id}" placeholder="한두 문장으로 적어 주세요">${esc(h.t)}</textarea></label>
          <div class="ideas-hst-seg" role="group" aria-label="${name} 가설 상태">${HYP_ST.map((st) => `<button type="button" data-act="ideaHypSt" data-id="${i.id}" data-k="${k}" data-v="${st}" aria-pressed="${st === h.st}">${st}</button>`).join('')}</div>
          <div class="small muted">관련 실험 ${i.exps.filter((e) => e.hyp === k).length}건 <span class="ideas-saved" hidden>· 저장됨</span></div></section>`;
      }).join('')}</div>`;
  }
  function tabExp(i) {
    const del = ui().ideaExpDel;
    const hypName = (k) => (HYP.find((h) => h[0] === k) || [0, '없음'])[1];
    return `<details class="ideas-add" ${i.exps.length ? '' : 'open'}><summary class="btn primary">+ 실험 기록</summary>
        <form class="form ideas-exp-form" data-form="ideaExp" data-id="${i.id}">
          <label class="f wide">무엇을 했나<input type="text" name="what" required placeholder="예: 점주 5명에게 시안 보여 주기"></label>
          <label class="f">언제<input type="date" name="at" value="${S.today}"></label>
          <label class="f">어떤 가설<select name="hyp"><option value="">연결 안 함</option>${HYP.map(([k, n]) => `<option value="${k}">${n} 가설</option>`).join('')}</select></label>
          <label class="f wide">결과<textarea name="result" rows="2" placeholder="관찰한 사실 위주로"></textarea></label>
          <label class="f wide">배운 점<textarea name="learn" rows="2" placeholder="다음에 바꿀 것"></textarea></label>
          <fieldset class="wide ideas-axis"><legend>가설에 대한 판정</legend><div class="ideas-radio three">${VERDICTS.map((v, n) => `<label><input type="radio" name="verdict" value="${v}" ${n === 2 ? 'checked' : ''}><span>${v}</span></label>`).join('')}</div></fieldset>
          <div class="wide row ideas-form-btns"><button class="btn primary">기록</button></div>
        </form></details>
      <ol class="ideas-exps">${i.exps.slice().reverse().map((e) => `<li class="ideas-exp v-${VERDICTS.indexOf(e.verdict)}">
        <header><b>${esc(e.what)}</b><span class="ideas-verdict">${esc(e.verdict)}</span></header>
        <div class="small muted">${esc(md(e.at))} · ${hypName(e.hyp)}${e.hyp ? ' 가설' : ''}</div>
        ${e.result ? `<p><span class="muted">결과</span> ${esc(e.result)}</p>` : ''}
        ${e.learn ? `<p><span class="muted">배운 점</span> ${esc(e.learn)}</p>` : ''}
        <div class="ideas-exp-act">${del === e.id
          ? `<span class="small">이 실험 기록을 지울까요?</span><button type="button" class="btn sm ideas-danger" data-act="ideaExpDelYes" data-id="${i.id}" data-x="${e.id}">지우기</button><button type="button" class="btn sm" data-act="ideaExpDelNo">취소</button>`
          : `<button type="button" class="ideas-link" data-act="ideaExpDel" data-x="${e.id}">삭제</button>`}</div>
      </li>`).join('') || '<li class="muted">아직 실험이 없습니다. 작게 빨리 해 보고 결과를 남겨 주세요.</li>'}</ol>`;
  }
  function gateList(i, st, isNext) {
    const g = gateOf(i, st);
    return `<section class="ideas-gate ${isNext ? 'next' : ''} ${g.met === g.n ? 'ok' : ''}"><header><b>${st}(으)로 가는 관문</b><span class="num">${g.met}/${g.n}</span>${isNext ? '<span class="pill">다음 관문</span>' : ''}</header>
      <ul>${g.items.map((x) => x.auto
        ? `<li class="${x.ok ? 'ok' : ''}"><span class="ideas-chk" aria-hidden="true">${x.ok ? '✓' : ''}</span><span>${esc(x.t)}</span><span class="small muted">자동</span></li>`
        : `<li class="${x.ok ? 'ok' : ''}"><label><input type="checkbox" data-act="ideaGateChk" data-id="${i.id}" data-k="${st}:${x.k}" ${x.ok ? 'checked' : ''}><span>${esc(x.t)}</span></label><span class="small muted">수기</span></li>`).join('')}</ul></section>`;
  }
  function tabGate(i) {
    const nx = nextStage(i);
    return `<p class="small muted ideas-lead">관문을 다 채우지 않고 단계를 옮기면 화면에서 한 번 더 확인합니다. 자동 항목은 가설·실험·결정 기록으로 판정합니다.</p>
      <div class="ideas-gates">${['검증', 'PoC', '론칭'].map((st) => gateList(i, st, st === nx)).join('')}</div>`;
  }
  function devilFor(i) {
    const pool = [];
    const weak = AXES.map(([a], k) => [a, i.s[k], k]).sort((a, b) => a[1] - b[1]);
    const w = weak[0];
    if (w[2] === 0) pool.push(`시장성이 ${w[1]}점입니다. 이 시장이 우리가 들일 노력만큼 커질 근거가 있습니까?`);
    if (w[2] === 1) pool.push(`적합도가 ${w[1]}점입니다. 우리 그룹이 아니어도 누구나 할 수 있는 사업 아닙니까?`);
    if (w[2] === 2) pool.push(`필요자원이 ${w[1]}점(자원 많이 듦)입니다. 같은 인력·예산을 기존 브랜드에 쓰면 더 낫지 않습니까?`);
    if (w[2] === 3) pool.push(`속도가 ${w[1]}점입니다. 검증까지 오래 걸리는 동안 경쟁사가 먼저 하면 어떻게 합니까?`);
    if (!hypOk(i, 'rev')) pool.push('수익 가설이 확인되지 않았습니다. 고객이 "좋다"고 말하는 것과 실제로 돈을 내는 것은 다릅니다.');
    if (!hypOk(i, 'cust')) pool.push('고객 가설이 아직 넓습니다. 처음 100명의 고객이 정확히 누구인지 이름을 댈 수 있습니까?');
    if (i.exps.length < 2) pool.push(`실험이 ${i.exps.length}건뿐입니다. 회의실 판단만으로 다음 단계로 가는 것 아닙니까?`);
    if (i.exps.some((e) => e.verdict === '반박')) pool.push('반박된 실험이 있습니다. 그 결과를 무시하고 계획을 그대로 두는 이유가 무엇입니까?');
    if (!i.owner || i.owner === '담당 미정') pool.push('담당이 없습니다. 이 일에 매주 시간을 쓸 사람이 실제로 있습니까?');
    pool.push('이 사업이 실패한다면 가장 그럴듯한 이유는 무엇이고, 그 위험을 지금 가장 싸게 확인하는 방법은?');
    pool.push('1년 뒤에도 이 사업을 계속할 만큼 회장님 관심과 회사 자원이 유지될 수 있습니까?');
    pool.push('같은 문제를 이미 푸는 대안(직접 해결, 다른 서비스)보다 확실히 나은 점이 하나라도 있습니까?');
    const seed = (i.devilRound || 0);
    const rot = pool.slice(seed % pool.length).concat(pool.slice(0, seed % pool.length));
    return rot.filter((x, n, a) => a.indexOf(x) === n).slice(0, 3);
  }
  function tabDec(i) {
    const dv = i.devil;
    return `<section class="ideas-d-sec"><h4>진행·중단 결정 기록</h4>
        <form class="form ideas-dec-form" data-form="ideaDec" data-id="${i.id}">
          <label class="f">결정<select name="decision">${DECISIONS.map((d) => `<option>${d}</option>`).join('')}</select></label>
          <label class="f">날짜<input type="date" name="at" value="${S.today}"></label>
          <label class="f wide">근거<textarea name="reason" rows="2" required placeholder="무엇을 보고 이렇게 정했는지"></textarea></label>
          <label class="wide ideas-check2"><input type="checkbox" name="apply" value="1" checked> 보류·중단이면 단계도 함께 옮기기(보류 / 폐기)</label>
          <div class="wide row ideas-form-btns"><button class="btn primary">결정 기록</button></div>
        </form>
        <ol class="ideas-decs">${i.decisions.slice().reverse().map((d) => `<li class="d-${DECISIONS.indexOf(d.decision)}"><span class="ideas-dec">${esc(d.decision)}</span><div><div>${esc(d.reason)}</div><div class="small muted num">${esc(d.at)}</div></div></li>`).join('') || '<li class="muted">아직 결정 기록이 없습니다.</li>'}</ol></section>
      <section class="ideas-d-sec ideas-devil"><h4>반대 의견 3개 ${mockAi()}</h4>
        <p class="small muted ideas-lead">일부러 반대 입장에서 묻습니다. 답이 준비된 질문은 체크해 두세요.</p>
        ${dv ? `<ol>${dv.items.map((x, n) => `<li class="${x.done ? 'done' : ''}"><label><input type="checkbox" data-act="ideaDevilChk" data-id="${i.id}" data-k="${n}" ${x.done ? 'checked' : ''}><span>${esc(x.t)}</span></label></li>`).join('')}</ol><p class="small muted">만든 날 ${esc(md(dv.at))} · 점수·가설·실험 기록을 보고 규칙으로 만든 예시입니다.</p>` : ''}
        <button type="button" class="btn" data-act="ideaDevil" data-id="${i.id}">${dv ? '다시 만들기' : '반대 의견 만들기'}</button></section>`;
  }
  function canvasAuto(i) {
    const exp = i.exps; const sup = exp.filter((e) => e.verdict === '지지').length, rej = exp.filter((e) => e.verdict === '반박').length;
    const tagNames = i.tags.map((t) => (S.tags.find((x) => x.id === t) || {}).name).filter(Boolean);
    return {
      prob: i.hyp.prob.t, sol: i.hyp.sol.t, uvp: i.summary, cust: i.hyp.cust.t, rev: i.hyp.rev.t,
      edge: i.s[1] >= 4 ? `그룹 역량과 잘 맞음(적합도 ${i.s[1]}/5)${tagNames.length ? ' · ' + tagNames.join(', ') : ''}` : '',
      metric: exp.length ? `실험 ${exp.length}건(지지 ${sup} · 반박 ${rej})${i.next_action ? ` · 다음: ${i.next_action}` : ''}` : (i.next_action ? `다음: ${i.next_action}` : ''),
      channel: '',
      cost: `필요자원 ${i.s[2]}/5(${i.s[2] >= 4 ? '적게 듦' : i.s[2] <= 2 ? '많이 듦' : '보통'}) · ${i.owner === '담당 미정' ? '담당 미정' : '담당 ' + i.owner}`
    };
  }
  const canvasVal = (i) => { const a = canvasAuto(i); const o = {}; CANVAS.forEach(([k]) => { o[k] = i.canvas[k] != null && i.canvas[k] !== '' ? { t: i.canvas[k], src: 'hand' } : { t: a[k] || '', src: a[k] ? 'auto' : '' }; }); return o; };
  function tabCanvas(i) {
    const v = canvasVal(i); const editing = ui().ideaCanvasEdit;
    if (editing) {
      return `<form class="form ideas-canvas-form" data-form="ideaCanvas" data-id="${i.id}">
        <p class="wide small muted ideas-lead">비워 두면 가설·점수·실험 기록에서 자동으로 채웁니다.</p>
        ${CANVAS.map(([k, n]) => `<label class="f"><span>${n}</span><textarea name="${k}" rows="2" placeholder="${esc(canvasAuto(i)[k] || '미정')}">${esc(i.canvas[k] || '')}</textarea></label>`).join('')}
        <div class="wide row ideas-form-btns"><button class="btn primary">저장</button><button type="button" class="btn" data-act="ideaCanvasEdit" data-v="0">취소</button></div></form>`;
    }
    return `<p class="small muted ideas-lead">한 장 사업 개요서(린 캔버스 형식). <span class="ideas-src auto">자동</span> 가설·점수·실험에서 채움 · <span class="ideas-src hand">수기</span> 직접 고침</p>
      <div class="ideas-canvas">${CANVAS.map(([k, n]) => `<section class="c-${k}"><h5>${n}${v[k].src ? `<span class="ideas-src ${v[k].src}">${v[k].src === 'auto' ? '자동' : '수기'}</span>` : ''}</h5><p class="${v[k].t ? '' : 'muted'}">${v[k].t ? esc(v[k].t) : '미정'}</p></section>`).join('')}</div>
      <div class="row ideas-canvas-btns"><button type="button" class="btn primary" data-act="ideaCanvasCopy" data-id="${i.id}">Markdown 복사</button><button type="button" class="btn" data-act="ideaCanvasEdit" data-v="1">고치기</button>${Object.values(i.canvas).some((x) => x) ? `<button type="button" class="btn" data-act="ideaCanvasReset" data-id="${i.id}">자동 값으로 되돌리기</button>` : ''}</div>`;
  }
  function canvasMd(i) {
    const v = canvasVal(i);
    const hyps = HYP.map(([k, n]) => `- ${n}: ${i.hyp[k].t || '미정'} (${i.hyp[k].st})`);
    const dec = lastDecision(i);
    return [`# ${i.title} — 한 장 사업 개요서`, '', `> ${i.summary || ''}`, '', `- 단계: ${i.stage} · 담당: ${i.owner} · 4축 ${total(i)}/20 (시장성 ${i.s[0]} · 적합도 ${i.s[1]} · 필요자원 ${i.s[2]} · 속도 ${i.s[3]})`, dec ? `- 최근 결정: ${dec.decision} (${dec.at}) — ${dec.reason}` : '- 최근 결정: 없음', '',
      ...CANVAS.map(([k, n]) => `## ${n}\n${v[k].t || '미정'}`), '', '## 가설 상태', ...hyps, '', `## 실험 ${i.exps.length}건`, ...i.exps.map((e) => `- ${e.at} ${e.what} → ${e.verdict}${e.learn ? ` (배운 점: ${e.learn})` : ''}`), '', `_회장 현황판 신사업 · ${S.today} 기준 · 목업_`].join('\n');
  }
  function detail(i) {
    const tab = ui().ideaTab || 'over';
    const body = { over: tabOver, hyp: tabHyp, exp: tabExp, gate: tabGate, dec: tabDec, canvas: tabCanvas }[tab] || tabOver;
    const nx = nextStage(i); const g = nx && gateOf(i, nx);
    return `<div class="ideas-detail">
      <div class="ideas-d-head">${scoreBox(i)}<div><div class="ideas-d-stage"><span class="ideas-stage-dot" data-stage="${esc(i.stage)}"></span>${esc(i.stage)} · ${esc(i.owner)}</div>
        ${i.summary ? `<p class="ideas-d-sum">${esc(i.summary)}</p>` : ''}</div></div>
      ${gateWarn(i.id)}
      <div class="ideas-d-move"><label class="f">단계 이동${stageSelect(i)}</label>${g ? `<button type="button" class="ideas-link" data-act="ideaTab" data-v="gate">${esc(nx)} 관문 ${g.met}/${g.n}</button>` : ''}<button type="button" class="btn" data-act="ideaEditOn">편집</button></div>
      <div class="ideas-dtabs" role="tablist" aria-label="상세 보기">${TABS.map(([v, l]) => `<button type="button" role="tab" data-act="ideaTab" data-v="${v}" aria-selected="${v === tab}">${l}${v === 'exp' && i.exps.length ? ` <span class="num muted">${i.exps.length}</span>` : ''}${v === 'dec' && i.decisions.length ? ` <span class="num muted">${i.decisions.length}</span>` : ''}</button>`).join('')}</div>
      <div class="ideas-dbody" role="tabpanel">${body(i)}</div>
    </div>`;
  }
  function gateWarn(id) {
    const w = ui().ideaGateWarn; if (!w || (id && w.id !== id)) return '';
    const i = byId(w.id); if (!i) return '';
    return `<div class="ideas-warn" role="alert"><b>「${esc(i.title)}」을(를) ${esc(w.to)}(으)로 옮기려면 관문 ${w.unmet.length}개가 남았습니다.</b>
      <ul>${w.unmet.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      <div class="row"><button type="button" class="btn ideas-danger" data-act="ideaGateForce">그래도 옮기기</button><button type="button" class="btn" data-act="ideaGateCancel">취소</button>${id ? '<button type="button" class="btn" data-act="ideaTab" data-v="gate">관문 보기</button>' : `<button type="button" class="btn" data-act="ideaOpen" data-id="${i.id}" data-tab="gate">관문 보기</button>`}</div></div>`;
  }
  function overlay() {
    const open = ui().ideaOpen; if (!open) return '';
    const i = open === 'new' ? null : byId(open);
    if (open !== 'new' && !i) { ui().ideaOpen = null; return ''; }
    const editing = !i || ui().ideaEdit;
    const title = !i ? '새 아이디어 등록' : editing ? `편집 · ${esc(i.title)}` : esc(i.title);
    return `<div class="ideas-overlay"><div class="ideas-dialog" role="dialog" aria-modal="true" aria-labelledby="ideas-d-title" tabindex="-1">
      <header><h3 id="ideas-d-title">${title}</h3><button type="button" class="ideas-x big" data-act="ideaClose" aria-label="닫기">×</button></header>
      ${editing ? form(i) : detail(i)}</div></div>`;
  }
  function inboxBox() {
    const items = S.inbox.filter((x) => x.to === 'ideas' && !x.done);
    if (!items.length) return '';
    const from = { ideabank: '아이디어뱅크' };
    return `<section class="ideas-inbox" aria-label="받은 항목"><h3>받은 항목 <span class="num muted">${items.length}</span></h3>
      <ul>${items.map((x) => `<li><div><b>${esc(x.title)}</b>${x.payload && x.payload.sample ? ' <span class="pill">샘플</span>' : ''}
        <div class="small muted">${esc(from[x.from] || x.from || '다른 메뉴')}${x.payload && x.payload.topic ? ' · ' + esc(x.payload.topic) : ''} · ${esc(md(String(x.at).slice(0, 10)))}</div>
        ${x.payload && x.payload.summary ? `<div class="small">${esc(x.payload.summary)}</div>` : ''}</div>
        <div class="row"><button type="button" class="btn primary sm" data-act="ideaInboxAdopt" data-x="${esc(x.id)}">새 아이디어로 등록</button><button type="button" class="btn sm" data-act="ideaInboxSkip" data-x="${esc(x.id)}">넘기기</button></div></li>`).join('')}</ul></section>`;
  }

  /* ================= 화면 ================= */
  function viewIdeas() {
    normalize();
    const mode = ui().ideaView || 'board';
    const sort = ui().ideaSort || 'score';
    const showClosed = ui().ideaClosed !== false;
    const active = S.ideas.filter((i) => ACTIVE.includes(i.stage));
    const late = S.ideas.filter(isLate);
    const avg = active.length ? (active.reduce((a, i) => a + total(i), 0) / active.length).toFixed(1) : '-';
    const ready = active.filter((i) => { const nx = nextStage(i); const g = nx && gateOf(i, nx); return g && g.met === g.n; }).length;
    return `<div class="view-head"><div><h2>신사업 파이프라인</h2><p>아이디어 → 검증 → PoC → 론칭. 가설을 세우고 실험으로 확인한 뒤, 관문을 넘으면 다음 단계로 갑니다.</p></div>
        <button type="button" class="btn primary" data-act="ideaNew">+ 아이디어 등록</button></div>
      ${inboxBox()}
      <div class="ideas-stats">
        <div><span class="small muted">진행 중 ${badge('측정')}</span><b class="num">${active.length}<small>건</small></b></div>
        <div><span class="small muted">관문 통과 준비 ${badge('측정')}</span><b class="num">${ready}<small>건</small></b></div>
        <div class="${late.length ? 'alert' : ''}"><span class="small muted">다음 액션 기한 경과 ${badge('측정')}</span><b class="num">${late.length}<small>건</small></b></div>
        <div><span class="small muted">진행 중 평균 점수 ${badge('수기')}</span><b class="num">${avg}<small>/20</small></b></div>
      </div>
      ${ui().ideaOpen ? '' : gateWarn()}
      <div class="ideas-tools">
        ${seg('ideaView', mode, [['board', '칸반'], ['rank', '점수표'], ['map', '지도']])}
        ${mode === 'board' ? `<span class="ideas-tool-l small muted">열 안 정렬</span>${seg('ideaSort', sort, [['score', '점수순'], ['due', '기한순']])}` : ''}
        <label class="ideas-check small"><input type="checkbox" data-act="ideaClosedTgl" ${showClosed ? 'checked' : ''}> 보류·폐기 보기</label>
      </div>
      ${mode === 'rank' ? ranking() : mode === 'map' ? portfolioMap() : kanban()}
      <p class="small muted">초기 5건과 가설·실험 기록은 회장님 확인 전 샘플입니다. 시장 규모 등 실제 수치는 넣지 않았습니다. Asana 연동은 실서비스에서 반영됩니다.</p>
      ${overlay()}`;
  }

  /* ================= 동작 ================= */
  const focusLater = (sel) => setTimeout(() => { const el = document.querySelector(sel); if (el) el.focus({ preventScroll: false }); }, 0);
  function moveStage(i, to, forced) {
    const from = i.stage; if (from === to) return;
    note(i, `단계 변경: ${from} → ${to}${forced ? ` (관문 미충족 ${forced}개 상태로 이동)` : ''}`);
    logAct('stage', `${i.title}: ${from} → ${to}${forced ? ' (관문 미충족)' : ''}`, i.id);
    i.stage = to; toast(`${i.title} → ${to}`);
  }
  function tryStage(i, to) {
    const unmet = unmetBetween(i, i.stage, to);
    if (unmet.length) { ui().ideaGateWarn = { id: i.id, to, unmet }; return false; }
    ui().ideaGateWarn = null; moveStage(i, to); return true;
  }
  Object.assign(APP.acts, {
    ideaView: (el) => { ui().ideaView = el.dataset.v; },
    ideaSort: (el) => { ui().ideaSort = el.dataset.v; },
    ideaNew: () => { ui().ideaOpen = 'new'; ui().ideaEdit = false; ui().ideaPrefill = null; focusLater('.ideas-form input[name=title]'); },
    ideaOpen: (el) => { ui().ideaOpen = el.dataset.id; ui().ideaEdit = false; ui().ideaCanvasEdit = false; ui().ideaExpDel = null; ui().ideaTab = el.dataset.tab || 'over'; ui().ideaReturn = el.dataset.id; focusLater('.ideas-dialog'); },
    ideaClose: () => { const back = ui().ideaReturn; ui().ideaOpen = null; ui().ideaEdit = false; ui().ideaCanvasEdit = false; ui().ideaPrefill = null; ui().ideaInboxId = null; if (ui().ideaGateWarn) ui().ideaGateWarn = null; if (back) focusLater(`.ideas-title[data-id="${back}"]`); },
    ideaTab: (el) => { ui().ideaTab = el.dataset.v; ui().ideaCanvasEdit = false; ui().ideaExpDel = null; focusLater(`.ideas-dtabs [data-v="${el.dataset.v}"]`); },
    ideaEditOn: () => { ui().ideaEdit = true; focusLater('.ideas-form input[name=title]'); },
    ideaEditOff: () => { ui().ideaEdit = false; focusLater('.ideas-dialog'); },
    ideaNoteDel: (el) => { const i = byId(el.dataset.id); if (i) { i.notes.splice(+el.dataset.k, 1); toast('메모를 삭제했습니다'); } focusLater('.ideas-dialog'); },
    ideaHypSt: (el) => {
      const i = byId(el.dataset.id); const h = i && i.hyp[el.dataset.k]; if (!h || h.st === el.dataset.v) return;
      const name = HYP.find((x) => x[0] === el.dataset.k)[1];
      note(i, `${name} 가설: ${h.st} → ${el.dataset.v}`); logAct('hyp', `${i.title} ${name} 가설 → ${el.dataset.v}`, i.id);
      h.st = el.dataset.v; focusLater(`[data-act="ideaHypSt"][data-k="${el.dataset.k}"][data-v="${el.dataset.v}"]`);
    },
    ideaExpDel: (el) => { ui().ideaExpDel = el.dataset.x; focusLater('[data-act="ideaExpDelNo"]'); },
    ideaExpDelNo: () => { ui().ideaExpDel = null; },
    ideaExpDelYes: (el) => { const i = byId(el.dataset.id); if (i) { const e = i.exps.find((x) => x.id === el.dataset.x); i.exps = i.exps.filter((x) => x.id !== el.dataset.x); if (e) note(i, `실험 기록 삭제: ${e.what}`); toast('실험 기록을 지웠습니다'); } ui().ideaExpDel = null; },
    ideaGateForce: () => { const w = ui().ideaGateWarn; const i = w && byId(w.id); if (i) moveStage(i, w.to, w.unmet.length); ui().ideaGateWarn = null; },
    ideaGateCancel: () => { ui().ideaGateWarn = null; toast('단계를 그대로 두었습니다'); },
    ideaDevil: (el) => {
      const i = byId(el.dataset.id); if (!i) return;
      i.devilRound = (i.devilRound || 0) + (i.devil ? 3 : 0);
      i.devil = { at: S.today, items: devilFor(i).map((t) => ({ t, done: false })) };
      logAct('devil', `${i.title}: 반대 의견 3개 생성(목업 AI)`, i.id); toast('반대 의견 3개를 만들었습니다(목업 AI)');
    },
    ideaCanvasEdit: (el) => { ui().ideaCanvasEdit = el.dataset.v === '1'; focusLater(ui().ideaCanvasEdit ? '.ideas-canvas-form textarea' : '[data-act="ideaCanvasEdit"]'); },
    ideaCanvasReset: (el) => { const i = byId(el.dataset.id); if (i) { i.canvas = {}; toast('자동 값으로 되돌렸습니다'); } },
    ideaCanvasCopy: (el) => { const i = byId(el.dataset.id); if (i) copyText(canvasMd(i), '개요서를 Markdown으로 복사했습니다'); },
    ideaInboxAdopt: (el) => {
      const x = S.inbox.find((y) => y.id === el.dataset.x); if (!x) return;
      ui().ideaOpen = 'new'; ui().ideaEdit = false; ui().ideaInboxId = x.id;
      ui().ideaPrefill = { title: x.title, summary: (x.payload && x.payload.summary) || '' };
      focusLater('.ideas-form input[name=title]');
    },
    ideaInboxSkip: (el) => { const x = S.inbox.find((y) => y.id === el.dataset.x); if (x) { x.done = true; x.done_at = new Date().toISOString(); logAct('inbox', `받은 항목 넘김: ${x.title}`, x.id); toast('받은 항목을 넘겼습니다'); } }
  });
  APP.changes.ideasStage = (el) => {
    const i = byId(el.dataset.id); if (!i || i.stage === el.value) return;
    tryStage(i, el.value);
  };
  APP.changes.ideaClosedTgl = (el) => { ui().ideaClosed = el.checked; };
  APP.changes.ideaGateChk = (el) => {
    const i = byId(el.dataset.id); if (!i) return;
    i.gateChk[el.dataset.k] = el.checked;
    note(i, `관문 확인 ${el.checked ? '체크' : '해제'}: ${el.dataset.k.replace(':', ' · ')}`);
  };
  APP.changes.ideaDevilChk = (el) => { const i = byId(el.dataset.id); if (i && i.devil) i.devil.items[+el.dataset.k].done = el.checked; };
  APP.forms.ideaSave = (fd, frm) => {
    const g = (n) => (fd.get(n) || '').toString().trim();
    const data = {
      title: g('title'), summary: g('summary'), owner: g('owner') || '담당 미정',
      s: [0, 1, 2, 3].map((k) => Math.min(5, Math.max(1, +g('s' + k) || 3))),
      next_action: g('next_action'), next_due: g('next_due'), tags: fd.getAll('tags'),
      links: g('links').split(/\n+/).map((x) => x.trim()).filter(Boolean)
    };
    const stage = STAGES.includes(g('stage')) ? g('stage') : '아이디어';
    if (!data.title) { toast('제목을 입력해 주세요'); return; }
    const id = frm.dataset.id;
    if (!id) {
      const i = Object.assign({ id: uid('i'), stage: '아이디어', notes: [{ at: S.today, body: '아이디어 등록', kind: 'sys' }] }, data);
      const inb = ui().ideaInboxId && S.inbox.find((y) => y.id === ui().ideaInboxId);
      if (inb) { i.notes.push({ at: S.today, body: `아이디어뱅크에서 받음: ${inb.title}`, kind: 'sys' }); inb.done = true; inb.done_at = new Date().toISOString(); inb.ref = i.id; }
      if (g('memo')) i.notes.push({ at: S.today, body: g('memo'), kind: 'memo' });
      S.ideas.push(i); normalize();
      logAct('create', `신사업 등록: ${i.title}${inb ? ' (받은 항목)' : ''}`, i.id);
      ui().ideaOpen = i.id; ui().ideaReturn = i.id; ui().ideaEdit = false; ui().ideaTab = 'over'; ui().ideaPrefill = null; ui().ideaInboxId = null;
      if (stage !== '아이디어' && !tryStage(i, stage)) toast('등록했습니다 — 관문 확인 후 단계를 옮겨 주세요');
      else toast('아이디어를 등록했습니다 (Asana 반영은 목업 표시)');
    } else {
      const i = byId(id); if (!i) return;
      const ch = [];
      const sum = data.s.reduce((a, b) => a + b, 0);
      if (i.s.join() !== data.s.join()) ch.push(`점수 ${total(i)} → ${sum} (${data.s.join('·')})`);
      if (i.next_action !== data.next_action || i.next_due !== data.next_due) ch.push(`다음 액션 변경${data.next_due ? ` ~${md(data.next_due)}` : ''}`);
      if (i.title !== data.title) ch.push(`제목 '${i.title}' → '${data.title}'`);
      if (i.owner !== data.owner) ch.push(`담당 ${i.owner} → ${data.owner}`);
      Object.assign(i, data);
      if (ch.length) note(i, `수정: ${ch.join(', ')}`);
      logAct('edit', `${i.title} 수정`, i.id);
      ui().ideaEdit = false;
      if (stage !== i.stage && !tryStage(i, stage)) toast('저장했습니다 — 단계는 관문 확인이 필요합니다');
      else toast('저장했습니다');
    }
    focusLater('.ideas-dialog');
  };
  APP.forms.ideaNote = (fd, frm) => {
    const i = byId(frm.dataset.id); const body = (fd.get('body') || '').toString().trim();
    if (!i || !body) return;
    i.notes.push({ at: S.today, body, kind: 'memo' }); logAct('memo', `${i.title} 메모 추가`, i.id); toast('메모를 추가했습니다');
    focusLater('.ideas-note-form textarea');
  };
  APP.forms.ideaExp = (fd, frm) => {
    const i = byId(frm.dataset.id); const g = (n) => (fd.get(n) || '').toString().trim();
    if (!i || !g('what')) return;
    const e = { id: uid('x'), at: g('at') || S.today, what: g('what'), hyp: g('hyp'), result: g('result'), learn: g('learn'), verdict: VERDICTS.includes(g('verdict')) ? g('verdict') : '애매' };
    i.exps.push(e);
    if (e.hyp && i.hyp[e.hyp].st === '미검증') i.hyp[e.hyp].st = '검증 중';
    note(i, `실험 기록: ${e.what} → ${e.verdict}`); logAct('exp', `${i.title} 실험: ${e.what} → ${e.verdict}`, i.id);
    toast(e.hyp ? '실험을 기록했습니다 — 가설 상태도 확인해 주세요' : '실험을 기록했습니다');
    focusLater('.ideas-exps li');
  };
  APP.forms.ideaDec = (fd, frm) => {
    const i = byId(frm.dataset.id); const g = (n) => (fd.get(n) || '').toString().trim();
    if (!i || !g('reason')) return;
    const d = { id: uid('c'), at: g('at') || S.today, decision: DECISIONS.includes(g('decision')) ? g('decision') : '진행', reason: g('reason') };
    i.decisions.push(d);
    note(i, `결정: ${d.decision} — ${d.reason}`); logAct('decision', `${i.title} 결정: ${d.decision}`, i.id);
    const to = { '보류': '보류', '중단': '폐기' }[d.decision];
    if (to && g('apply') === '1' && i.stage !== to) moveStage(i, to); else toast(`결정을 기록했습니다: ${d.decision}`);
  };
  APP.forms.ideaCanvas = (fd, frm) => {
    const i = byId(frm.dataset.id); if (!i) return;
    CANVAS.forEach(([k]) => { const v = (fd.get(k) || '').toString().trim(); if (v) i.canvas[k] = v; else delete i.canvas[k]; });
    ui().ideaCanvasEdit = false; logAct('canvas', `${i.title} 개요서 수정`, i.id); toast('개요서를 저장했습니다');
  };
  function copyText(text, okMsg) {
    const fallback = () => { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast(okMsg); } catch (er) { toast('복사가 막혀 있습니다 — 개요서를 직접 선택해 복사해 주세요'); } ta.remove(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast(okMsg), fallback); else fallback();
  }

  /* Esc·바깥 누르기로 닫기, 지도 원은 Enter/스페이스로 열기 */
  const closeBtn = () => document.querySelector('.ideas-dialog [data-act="ideaClose"]');
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && closeBtn()) { e.preventDefault(); closeBtn().click(); return; }
    const t = e.target;
    if ((e.key === 'Enter' || e.key === ' ') && t && t.classList && t.classList.contains('dot')) { e.preventDefault(); t.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
  });
  /* 가설 글은 입력하는 동안 바로 저장(다시 그리기 없이) — 다른 버튼을 눌러 화면이 바뀌어도 잃지 않게 */
  const hypBox = (t) => t && t.dataset && t.dataset.hyp && byId(t.dataset.id);
  document.addEventListener('input', (e) => { const i = hypBox(e.target); if (i) { i.hyp[e.target.dataset.hyp].t = e.target.value.trim(); APP.save(); } });
  document.addEventListener('change', (e) => {
    const i = hypBox(e.target); if (!i) return;
    const k = e.target.dataset.hyp; i.hyp[k].t = e.target.value.trim(); APP.save();
    logAct('hyp', `${i.title} ${HYP.find((x) => x[0] === k)[1]} 가설 수정`, i.id);
    const sec = e.target.closest('.ideas-hyp'); if (sec) { const c = sec.querySelector('.ideas-saved'); if (c) { c.hidden = false; setTimeout(() => { c.hidden = true; }, 1500); } }
  });
  document.addEventListener('click', (e) => { if (e.target.classList && e.target.classList.contains('ideas-overlay') && closeBtn()) closeBtn().click(); });
  window.addEventListener('hashchange', () => { if (location.hash !== '#ideas' && S.ui.ideaOpen) { S.ui.ideaOpen = null; S.ui.ideaEdit = false; S.ui.ideaGateWarn = null; } });

  APP.views.ideas = viewIdeas;
})();
