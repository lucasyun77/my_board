/* 메뉴: 아이디어뱅크 (ideabank) — "아이디어 공장".
   주제마다 AI(Claude 등) 예약 작업을 걸어 아이디어를 비주얼 산출물(카드뉴스·PT·HTML 리포트·영상·문서)로 만들고,
   회장이 평가(별점·채택·보류)해서 채택분을 신사업·지시 관리로 흘려보낸다.
   목업: 예약 실행·AI 생성·미리보기 글은 모두 화면 안에서 만든 목업이며, 실제 예약 작업(트리거)은 만들지 않는다.
   메뉴 연결: S.inbox(다른 메뉴로 보내기), S.activity(행동 기록) — 공용 파일 수정 없이 S에 둔다. */
(function () {
  'use strict';
  const { S, esc, md, badge, uid, toast, dayStr, guide } = window.APP;

  /* ---------- 기준 ---------- */
  const FORMATS = { cardnews: '카드뉴스', ppt: 'PT형', html: 'HTML 비주얼 리포트', video: '영상', doc: '문서형' };
  const AIS = ['Claude', 'ChatGPT', 'Gemini'];
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  const COLORS = ['#C0392B', '#E9A400', '#2E8B57', '#5B6FB8', '#E46F8C', '#2F8C7A', '#8C6A4F'];
  const DECISIONS = ['채택', '보류'];
  const AI_PILL = '<span class="ib-ai" title="화면 안에서 규칙으로 만든 결과입니다">목업 AI</span>';

  /* ---------- 메뉴 연결(공용 약속) ---------- */
  S.activity = S.activity || [];
  S.inbox = S.inbox || [];
  function logAct(type, text, ref) {
    S.activity.unshift({ id: uid('ac'), at: new Date().toISOString(), menu: 'ideabank', type, text, ref: ref || '' });
    if (S.activity.length > 300) S.activity = S.activity.slice(0, 300);
  }

  /* ---------- 샘플 데이터(메뉴 파일 안에서만 S에 붙인다) ---------- */
  if (!S.ideaBank) {
    const SEED0 = { it1: 2, it2: 1, it3: 3, it4: 1 }; // 샘플 게시물로 이미 쓴 아이디어 다음부터 생성
    const T = (id, title, desc, color, ai, sch, formats, prompt, seeds) => ({ id, title, desc, color, created_at: dayStr(-20), schedule: Object.assign({ ai, formats, prompt, enabled: true }, sch), seeds, seedIdx: SEED0[id] || 0 });
    const P = (topic_id, title, format, ai, ago, summary, rating, decision) => ({ id: uid('ip'), topic_id, title, format, ai, created_at: dayStr(-ago), summary, link: '#', rating: rating || 0, decision: decision || null, sent: {}, by: '예약 작업' });
    S.ideaBank = {
      topics: [
        T('it1', '매장 고객경험', '벌툰 매장에서 고객이 더 오래, 더 자주 머물게 하는 아이디어', '#E9A400', 'Claude', { freq: 'weekly', dow: 1, dom: 1, hour: 9 }, ['cardnews', 'html'], '벌툰 매장 고객경험 개선 아이디어 3개를 카드뉴스와 HTML 리포트로 만들어 줘. 비용·기대효과·시범 방법 포함.', ['주말 만화 정주행 패스', '좌석별 조명 밝기 선택', '대기 고객 실시간 알림', '신간 입고 SNS 알림']),
        T('it2', '생전포차 글로벌 메뉴', '해외 매장에서 통할 포차 메뉴와 현지화 방향', '#C0392B', 'Claude', { freq: 'weekly', dow: 3, dom: 1, hour: 10 }, ['ppt', 'video'], '생전포차 해외 매장용 메뉴 아이디어를 PT 5장과 30초 소개 영상 콘티로 만들어 줘.', ['K포차 안주 세트 3종', '현지 주류 페어링', '1인 포차 메뉴']),
        T('it3', 'AI 업무 자동화', '본사·가맹점 반복 업무를 AI로 줄이는 아이디어', '#2F8C7A', 'Claude', { freq: 'daily', dow: 1, dom: 1, hour: 8 }, ['doc', 'html'], '본사 반복 업무 중 AI로 자동화할 후보를 하나 골라 절감시간·방법·위험을 문서와 HTML 리포트로 정리해 줘.', ['발주 수량 자동 추천', '회의록 요약·지시 추출', '가맹점 문의 자동 분류', '매장 오픈 체크리스트 자동화']),
        T('it4', '신규 브랜드 네이밍', '새 브랜드 이름·슬로건 후보와 시각 방향', '#5B6FB8', 'ChatGPT', { freq: 'monthly', dow: 1, dom: 1, hour: 9 }, ['cardnews', 'ppt'], '신규 외식 브랜드 이름 후보 5개와 슬로건, 색·로고 방향을 카드뉴스와 PT로 만들어 줘.', ['골목 감성 브랜드', '건강 간편식 브랜드'])
      ],
      posts: [
        P('it1', '주말 만화 정주행 패스', 'cardnews', 'Claude', 0, '토·일 정액 이용권. 장시간 이용 고객의 재방문을 늘리는 안. 3개 매장 2주 시범 제안(효과 수치는 시범 후 측정).'),
        P('it1', '주말 만화 정주행 패스 — 수익 구조', 'html', 'Claude', 0, '이용권 가격 구간별 손익을 보는 계산표와 좌석 회전 그래프(예시 그래프).'),
        P('it1', '좌석별 조명 밝기 선택', 'cardnews', 'Claude', 7, '좌석마다 3단 조명. 장시간 고객 만족도 개선 기대, 설치비는 견적 확인 필요.', 4, '채택'),
        P('it2', 'K포차 안주 세트 3종', 'ppt', 'Claude', 1, '떡볶이·전·꼬치 세트를 현지 입맛에 맞춘 3종 구성. 원가율 목표는 현지 견적 후 확정.', 3),
        P('it2', 'K포차 안주 세트 — 30초 소개', 'video', 'Claude', 1, '30초 매장 소개 영상 콘티(장면 6개, 자막·음악 방향).'),
        P('it3', '발주 수량 자동 추천', 'doc', 'Claude', 0, '최근 판매 기록으로 다음 주 발주량을 추천. 점주 작업 시간 절감 기대(실측 필요).', 5, '채택'),
        P('it3', '회의록 요약·지시 추출', 'html', 'Claude', 1, '회의록에서 지시·담당·기한을 뽑아 Asana로 넘기는 흐름도와 예시 화면.', 4),
        P('it3', '가맹점 문의 자동 분류', 'doc', 'Claude', 2, '문의를 유형별로 자동 분류해 담당자에게 바로 넘기는 안.', 2, '보류'),
        P('it4', '골목 감성 브랜드 이름 5안', 'cardnews', 'ChatGPT', 3, '이름 5안·슬로건·추천 색. 상표 검색은 별도 확인 필요.')
      ]
    };
  }
  const B = S.ideaBank;
  /* 예전 저장본 보정: 평가 필드 채우기 */
  B.posts.forEach((p) => {
    if (p.rating == null) p.rating = 0;
    if (p.decision === undefined) p.decision = p.reviewed ? '채택' : null;
    if (!p.sent) p.sent = {};
  });

  /* ---------- 계산 ---------- */
  const topicById = (id) => B.topics.find((t) => t.id === id);
  const postById = (id) => B.posts.find((p) => p.id === id);
  const postsOf = (id) => B.posts.filter((p) => p.topic_id === id).sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  const pad = (n) => String(n).padStart(2, '0');
  const cronOf = (s) => `CRON_TZ=Asia/Seoul 0 ${s.hour} ${s.freq === 'monthly' ? s.dom : '*'} * ${s.freq === 'weekly' ? s.dow : '*'}`;
  const schLabel = (s) => (s.freq === 'daily' ? '매일' : s.freq === 'weekly' ? `매주 ${DOW[s.dow]}요일` : `매월 ${s.dom}일`) + ` ${pad(s.hour)}:00`;
  function nextRun(s) {
    if (!s.enabled) return null;
    const base = new Date(S.today + 'T00:00:00'); const nowH = new Date().getHours();
    for (let i = 0; i < 62; i++) {
      const d = new Date(base); d.setDate(d.getDate() + i);
      const hit = s.freq === 'daily' || (s.freq === 'weekly' && d.getDay() === +s.dow) || (s.freq === 'monthly' && d.getDate() === +s.dom);
      if (hit && (i > 0 || nowH < s.hour)) return { date: d, i };
    }
    return null;
  }
  const nextLabel = (s) => { const n = nextRun(s); if (!n) return '꺼짐'; return (n.i === 0 ? '오늘' : n.i === 1 ? '내일' : `${n.date.getMonth() + 1}/${n.date.getDate()}`) + ` ${pad(s.hour)}:00`; };
  const inboxOf = (p, to) => S.inbox.find((x) => x.from === 'ideabank' && x.to === to && x.payload && x.payload.post_id === p.id);
  const evalStats = (list) => {
    const rated = list.filter((p) => p.rating > 0);
    return { n: list.length, rated: rated.length, adopt: list.filter((p) => p.decision === '채택').length, hold: list.filter((p) => p.decision === '보류').length, avg: rated.length ? rated.reduce((s, p) => s + p.rating, 0) / rated.length : 0, sent: list.filter((p) => p.sent && (p.sent.ideas || p.sent.directives)).length };
  };

  /* ---------- 썸네일(인라인 SVG, 직접 그린 도형만) ---------- */
  const clip = (t, n) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
  function thumb(p, color) {
    const t = esc(clip(p.title, 15)); const c = esc(color);
    const head = `<svg class="ib-svg" viewBox="0 0 320 200" role="img" aria-label="${esc(FORMATS[p.format])} 썸네일: ${esc(p.title)}" preserveAspectRatio="xMidYMid slice">`;
    const body = {
      cardnews: `<rect width="320" height="200" fill="${c}"/><rect x="62" y="22" width="150" height="160" rx="14" fill="#fff" opacity=".35" transform="rotate(-6 137 102)"/><rect x="92" y="18" width="150" height="164" rx="14" fill="#FFFDF9"/><rect x="108" y="36" width="40" height="8" rx="4" fill="${c}"/><text x="108" y="74" font-size="15" font-weight="900" fill="#3D1E0F">${esc(clip(p.title, 8))}</text><text x="108" y="94" font-size="15" font-weight="900" fill="#3D1E0F">${esc(clip(p.title.slice(8), 8))}</text><rect x="108" y="118" width="118" height="6" rx="3" fill="#E4D7C6"/><rect x="108" y="132" width="96" height="6" rx="3" fill="#E4D7C6"/><circle cx="214" cy="162" r="9" fill="${c}"/><text x="230" y="190" font-size="11" fill="#fff" font-weight="700">1 / 5</text>`,
      ppt: `<rect width="320" height="200" fill="#F8F1E7"/><rect x="24" y="20" width="272" height="160" rx="10" fill="#FFFDF9" stroke="#E4D7C6" stroke-width="2"/><rect x="24" y="20" width="272" height="34" rx="10" fill="${c}"/><rect x="24" y="40" width="272" height="14" fill="${c}"/><text x="40" y="43" font-size="14" font-weight="900" fill="#fff">${t}</text><rect x="48" y="128" width="26" height="32" fill="${c}" opacity=".45"/><rect x="86" y="104" width="26" height="56" fill="${c}" opacity=".65"/><rect x="124" y="84" width="26" height="76" fill="${c}"/><rect x="180" y="80" width="96" height="7" rx="3" fill="#E4D7C6"/><rect x="180" y="96" width="80" height="7" rx="3" fill="#E4D7C6"/><rect x="180" y="112" width="88" height="7" rx="3" fill="#E4D7C6"/>`,
      html: `<rect width="320" height="200" fill="#FFFDF9"/><rect width="320" height="26" fill="#3D1E0F"/><circle cx="16" cy="13" r="4" fill="#F27BA0"/><circle cx="30" cy="13" r="4" fill="#FABF1A"/><circle cx="44" cy="13" r="4" fill="#6CC08F"/><rect x="60" y="7" width="200" height="12" rx="6" fill="#5a3a28"/><rect x="0" y="26" width="320" height="56" fill="${c}"/><text x="20" y="60" font-size="16" font-weight="900" fill="#fff">${t}</text><rect x="20" y="96" width="132" height="86" rx="10" fill="#F8F1E7"/><polyline points="32,166 58,142 82,150 108,118 140,108" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round"/><rect x="166" y="96" width="134" height="40" rx="10" fill="#F8F1E7"/><rect x="166" y="142" width="134" height="40" rx="10" fill="#F8F1E7"/>`,
      video: `<rect width="320" height="200" fill="#2B1A10"/><rect x="0" y="0" width="320" height="200" fill="${c}" opacity=".35"/><circle cx="160" cy="92" r="32" fill="#FFFDF9" opacity=".92"/><polygon points="150,76 150,108 176,92" fill="${c}"/><text x="18" y="30" font-size="14" font-weight="900" fill="#fff">${t}</text><rect x="18" y="168" width="284" height="5" rx="3" fill="#fff" opacity=".3"/><rect x="18" y="168" width="96" height="5" rx="3" fill="#FABF1A"/><text x="266" y="158" font-size="12" fill="#fff" font-weight="700">0:30</text>`,
      doc: `<rect width="320" height="200" fill="#F1E9DE"/><rect x="92" y="14" width="136" height="186" rx="6" fill="#FFFDF9" stroke="#E4D7C6" stroke-width="2"/><rect x="108" y="32" width="56" height="8" rx="4" fill="${c}"/><text x="108" y="62" font-size="12" font-weight="900" fill="#3D1E0F">${esc(clip(p.title, 9))}</text>${[78, 92, 106, 120, 134, 148, 162].map((y, i) => `<rect x="108" y="${y}" width="${i % 3 === 2 ? 70 : 104}" height="5" rx="2" fill="#E4D7C6"/>`).join('')}`
    }[p.format] || '';
    return head + body + '</svg>';
  }
  function cover(t) {
    const ps = postsOf(t.id).slice(0, 3);
    if (!ps.length) return `<span class="ib-cover ib-cover-empty"><span>${esc(clip(t.title, 10))}</span><small>아직 산출물 없음</small></span>`;
    return `<span class="ib-cover n${ps.length}">${ps.map((p) => `<span>${thumb(p, t.color)}</span>`).join('')}</span>`;
  }
  const stars = (n) => `<span class="ib-stars" aria-label="별점 ${n}점">${[1, 2, 3, 4, 5].map((k) => `<i class="${k <= n ? 'on' : ''}">★</i>`).join('')}</span>`;
  const decPill = (p) => (p.decision === '채택' ? '<span class="pill st-done">채택</span>' : p.decision === '보류' ? '<span class="pill st-hold">보류</span>' : '<span class="pill">평가 전</span>');

  /* ---------- 미리보기 내용(목업 생성 — 모두 직접 쓴 틀 문장) ---------- */
  const firstSentence = (s) => String(s || '').split(/(?<=[.다])\s/)[0] || '';
  function slides(p, t) {
    const sum = p.summary || '요약이 아직 없습니다.';
    const lead = firstSentence(sum);
    const steps = ['시범 매장·부서 1~3곳을 고른다', '2주 동안 운영하며 반응과 시간을 잰다', '결과를 보고 확대·수정·중단을 정한다'];
    const checks = ['비용·인력은 견적 후 확정', '고객·직원 반응은 시범에서 측정', '숫자는 추정 표시 후 실측으로 교체'];
    switch (p.format) {
      case 'cardnews': return [
        { k: 'cover', h: p.title, b: t.title },
        { k: 'text', h: '왜 지금인가', b: `${t.title}에서 반복해서 나오는 불편을 줄이는 것이 출발점입니다. ${t.desc || ''}` },
        { k: 'text', h: '아이디어', b: lead },
        { k: 'list', h: '이렇게 해 봅니다', items: steps },
        { k: 'text', h: '다음 한 걸음', b: '채택하면 신사업 파이프라인 또는 지시로 넘겨 담당과 기한을 정합니다.' }
      ];
      case 'ppt': return [
        { k: 'cover', h: p.title, b: `${t.title} · 제안서` },
        { k: 'list', h: '배경', items: [t.desc || t.title, '현장에서 반복되는 요청과 불편', '작게 시험해 볼 수 있는 범위'] },
        { k: 'list', h: '제안', items: [lead, '기존 운영에 얹어 바로 시작 가능', '효과는 시범 기간에 측정'] },
        { k: 'table', h: '실행 계획', rows: steps.map((s, i) => [`${i + 1}단계`, s]) },
        { k: 'list', h: '확인할 점', items: checks }
      ];
      case 'video': return ['오프닝 — 매장 전경, 제목 자막', '문제 — 기다리거나 불편한 장면', `제안 — ${clip(p.title, 18)} 소개`, '사용 장면 — 고객이 써 보는 모습', '반응 — 직원·고객 한마디(시범 후 촬영)', '마무리 — 로고와 한 줄 메시지'].map((s, i) => ({ k: 'scene', h: `컷 ${i + 1} · ${i * 5}~${i * 5 + 5}초`, b: s }));
      case 'html': return [{ k: 'report', h: p.title, b: sum, steps, checks }];
      default: return [{ k: 'doc', h: p.title, sections: [['1. 배경', t.desc || t.title], ['2. 제안', sum], ['3. 실행', steps.join(' → ')], ['4. 확인할 점', checks.join(' · ')]] }];
    }
  }
  function slideHtml(sl, p, t, i, n) {
    const c = esc(t.color);
    if (sl.k === 'report') {
      return `<div class="ib-rep" style="--c:${c}"><div class="ib-rep-hero"><small>${esc(t.title)} · HTML 리포트</small><b>${esc(sl.h)}</b></div>
        <div class="ib-rep-kpis">${['시범 범위', '측정 기간', '판단 기준'].map((k, j) => `<div><span>${k}</span><b>${['1~3곳', '2주', '반응·시간'][j]}</b><em>제안</em></div>`).join('')}</div>
        <section><h5>요약</h5><p>${esc(sl.b)}</p></section>
        <section><h5>예시 그래프 <em>목업 — 실데이터 아님</em></h5><div class="ib-rep-bars">${[38, 52, 47, 64, 71].map((v, j) => `<span style="height:${v}%"><i>${j + 1}주</i></span>`).join('')}</div></section>
        <section><h5>실행 순서</h5><ol>${sl.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></section>
        <section><h5>확인할 점</h5><ul>${sl.checks.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></section></div>`;
    }
    if (sl.k === 'doc') {
      return `<div class="ib-doc"><b class="ib-doc-t">${esc(sl.h)}</b><small>${esc(t.title)} · ${esc(p.ai)} 작성 문서(목업)</small>${sl.sections.map(([h, b]) => `<h5>${esc(h)}</h5><p>${esc(b)}</p>`).join('')}</div>`;
    }
    const cls = p.format === 'cardnews' ? 'ib-card' : p.format === 'video' ? 'ib-scene' : 'ib-slide';
    let inner = '';
    if (sl.k === 'cover') inner = `<small>${esc(sl.b)}</small><b class="ib-sl-big">${esc(sl.h)}</b>`;
    else if (sl.k === 'list') inner = `<b class="ib-sl-h">${esc(sl.h)}</b><ul>${sl.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
    else if (sl.k === 'table') inner = `<b class="ib-sl-h">${esc(sl.h)}</b><table>${sl.rows.map((r) => `<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`).join('')}</table>`;
    else if (sl.k === 'scene') inner = `<span class="ib-play" aria-hidden="true">▶</span><b class="ib-sl-h">${esc(sl.h)}</b><p>${esc(sl.b)}</p>`;
    else inner = `<b class="ib-sl-h">${esc(sl.h)}</b><p>${esc(sl.b)}</p>`;
    return `<div class="${cls} ${sl.k === 'cover' ? 'is-cover' : ''}" style="--c:${c}">${inner}<span class="ib-pg num">${i + 1} / ${n}</span></div>`;
  }

  /* ---------- 지시문 개선 제안(목업 AI: 평가 결과로 규칙 생성) ---------- */
  function promptAdvice(t) {
    const ps = postsOf(t.id); const st = evalStats(ps);
    if (st.rated + st.adopt + st.hold < 2) return null;
    const good = ps.filter((p) => p.decision === '채택' || p.rating >= 4);
    const bad = ps.filter((p) => p.decision === '보류' || (p.rating && p.rating <= 2));
    const cnt = (list) => list.reduce((m, p) => (m[p.format] = (m[p.format] || 0) + 1, m), {});
    const g = cnt(good); const b = cnt(bad);
    const goodF = Object.keys(g).sort((x, y) => g[y] - g[x]);
    const weakF = Object.keys(b).filter((f) => (b[f] || 0) > (g[f] || 0));
    const formats = [...new Set([...goodF, ...t.schedule.formats.filter((f) => !weakF.includes(f))])].slice(0, 3);
    const why = [];
    if (goodF.length) why.push(`채택·높은 별점은 ${goodF.map((f) => FORMATS[f]).join('·')}에서 많이 나왔습니다`);
    if (weakF.length) why.push(`${weakF.map((f) => FORMATS[f]).join('·')}은 보류·낮은 별점이 더 많았습니다`);
    if (good.length) why.push(`좋게 본 주제어: ${good.slice(0, 3).map((p) => `‘${clip(p.title.replace(/\s—.*$/, ''), 14)}’`).join(', ')}`);
    const adds = [];
    if (good.length) adds.push(`${good.slice(0, 2).map((p) => `‘${p.title.replace(/\s—.*$/, '')}’`).join('·')} 같은 방향을 더 깊게`);
    adds.push('아이디어마다 시범 방법과 확인할 숫자(추정 표시)를 함께');
    if (weakF.length) adds.push(`${weakF.map((f) => FORMATS[f]).join('·')}은 줄이고 ${formats.map((f) => FORMATS[f]).join('·')} 위주로`);
    const base = String(t.schedule.prompt || '').replace(/\s*\[평가 반영\].*$/, '');
    return { why, formats: formats.length ? formats : t.schedule.formats, prompt: `${base} [평가 반영] ${adds.join('. ')}.`.trim(), stat: st };
  }

  /* ---------- 아이디어 섞기(목업 AI) ---------- */
  function termsOf(t) { return [...new Set([...(t.seeds || []), ...postsOf(t.id).map((p) => p.title.replace(/\s—.*$/, ''))])].slice(0, 4); }
  function mixIdeas(a, b, fmt) {
    const A = termsOf(a); const Bt = termsOf(b);
    const pick = (arr, i) => arr.length ? arr[i % arr.length] : null;
    const out = [];
    for (let i = 0; i < 3; i++) {
      const x = pick(A, i) || a.title; const y = pick(Bt, i + 1) || b.title;
      const title = [`${x} × ${y}`, `${a.title}에 ‘${y}’ 얹기`, `${b.title} 방식으로 푼 ‘${x}’`][i];
      out.push({ title, format: fmt, summary: `${a.title}의 ‘${x}’와 ${b.title}의 ‘${y}’를 묶은 안입니다. 비용이 적은 작은 시범으로 반응부터 확인합니다.` });
    }
    return out;
  }

  /* ---------- 화면 조각 ---------- */
  const fmtChecks = (sel) => Object.entries(FORMATS).map(([k, v]) => `<label class="ib-ck"><input type="checkbox" name="formats" value="${k}" ${sel.includes(k) ? 'checked' : ''}> ${v}</label>`).join('');
  function schedFields(s) {
    return `<label class="f">AI<select name="ai">${AIS.map((a) => `<option ${a === s.ai ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
      <label class="f">주기<select name="freq">${[['daily', '매일'], ['weekly', '매주'], ['monthly', '매월']].map(([k, v]) => `<option value="${k}" ${k === s.freq ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="f">요일(매주일 때)<select name="dow">${DOW.map((d, i) => `<option value="${i}" ${i === +s.dow ? 'selected' : ''}>${d}요일</option>`).join('')}</select></label>
      <label class="f">날짜(매월일 때)<input type="number" name="dom" min="1" max="28" value="${s.dom}"></label>
      <label class="f">시각<select name="hour">${Array.from({ length: 24 }, (_, h) => h).filter((h) => h === 0 || h >= 8).map((h) => `<option value="${h}" ${h === +s.hour ? 'selected' : ''}>${pad(h)}:00</option>`).join('')}</select></label>
      <fieldset class="ib-fs wide"><legend>만들 산출물(여러 개 선택)</legend>${fmtChecks(s.formats)}</fieldset>
      <label class="f wide">생성 지시문<textarea name="prompt" rows="3" placeholder="예: 이 주제로 아이디어 3개를 카드뉴스로 만들어 줘">${esc(s.prompt || '')}</textarea></label>`;
  }
  const readSched = (fd, g) => ({ ai: g('ai') || 'Claude', freq: g('freq') || 'weekly', dow: +g('dow') || 0, dom: Math.min(28, Math.max(1, +g('dom') || 1)), hour: +g('hour') || 9, formats: fd.getAll('formats'), prompt: g('prompt') });

  function inboxBox() {
    const items = S.inbox.filter((x) => x.to === 'ideabank' && !x.done);
    if (!items.length) return '';
    return `<section class="panel ib-inbox" aria-labelledby="h-ib-in"><h3 id="h-ib-in">받은 항목 <span class="pill st-wait">${items.length}</span></h3>
      <ul class="ib-inlist">${items.map((x) => `<li><div><b>${esc(x.title)}</b><span class="ib-lab">${esc(x.from)}에서 · ${esc(String(x.at).slice(0, 10))}${x.kind ? ' · ' + esc(x.kind) : ''}</span></div>
        <span class="row"><button type="button" class="btn sm primary" data-act="ibInTopic" data-id="${esc(x.id)}">주제로 만들기</button><button type="button" class="btn sm" data-act="ibInDone" data-id="${esc(x.id)}">확인만</button></span></li>`).join('')}</ul></section>`;
  }

  function mixPanel() {
    const m = S.ui.ibMix; if (!m) return '';
    const sel = m.sel || [];
    const a = topicById(sel[0]); const b = topicById(sel[1]);
    return `<section class="panel ib-mix" aria-labelledby="h-ib-mix"><h3 id="h-ib-mix">주제 섞어 새 아이디어 만들기 ${AI_PILL}</h3>
      <p class="ib-p">주제 두 개를 고르면 각 주제의 아이디어를 엮어 새 안 3개를 만듭니다.</p>
      <div class="row ib-mixpick" role="group" aria-label="섞을 주제 두 개 고르기">${B.topics.map((t) => { const on = sel.includes(t.id); return `<button type="button" class="chip ib-mixchip ${on ? 'on' : ''}" data-act="ibMixPick" data-id="${t.id}" aria-pressed="${on}"><span class="dot" style="background:${esc(t.color)}"></span>${esc(t.title)}${on ? ` <b class="num">${sel.indexOf(t.id) + 1}</b>` : ''}</button>`; }).join('')}</div>
      <div class="row" style="margin-top:10px"><label class="f ib-inline">만들 형태<select data-act="ibMixFmt">${Object.entries(FORMATS).map(([k, v]) => `<option value="${k}" ${k === (m.fmt || 'cardnews') ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <button type="button" class="btn primary sm" data-act="ibMixRun" ${a && b ? '' : 'disabled'}>섞어서 3개 만들기</button><button type="button" class="btn sm" data-act="ibMixClose">닫기</button></div>
      ${!(a && b) ? '<p class="ib-note" style="margin-top:8px">주제 두 개를 골라 주세요.</p>' : ''}
      ${m.results && m.results.length ? `<ul class="ib-mixres">${m.results.map((r) => `<li><b>${esc(r.title)}</b><span>${esc(r.summary)}</span></li>`).join('')}</ul>
        <div class="row"><button type="button" class="btn primary sm" data-act="ibMixSave">‘${esc(m.names || '')}’ 새 주제로 저장</button><span class="ib-note">저장하면 예약은 꺼진 상태로 만들어집니다.</span></div>` : ''}
    </section>`;
  }

  function listView() {
    const st = evalStats(B.posts); const on = B.topics.filter((t) => t.schedule.enabled).length;
    const rate = st.rated + st.adopt + st.hold ? Math.round(100 * st.adopt / Math.max(1, B.posts.filter((p) => p.decision).length)) : null;
    return `<div class="view-head"><div><h2>아이디어뱅크</h2><p>AI가 만든 아이디어를 평가·채택해서 신사업과 지시로 흘려보내는 곳입니다.</p></div>
        <div class="row"><button type="button" class="btn" data-act="ibMixOpen" ${B.topics.length >= 2 ? '' : 'disabled'}>주제 섞기</button><button type="button" class="btn primary" data-act="ibNew">+ 새 주제</button></div></div>
      ${inboxBox()}
      <div class="ib-kpis"><div><span>주제 · 예약 켜짐</span><b class="num">${B.topics.length} · ${on}</b></div><div><span>산출물 ${badge('측정')}</span><b class="num">${st.n}</b></div><div><span>채택률 ${badge('측정')}</span><b class="num">${rate == null ? '—' : rate + '%'}</b><small>결정한 ${B.posts.filter((p) => p.decision).length}건 중 채택 ${st.adopt}</small></div><div><span>보낸 아이디어 ${badge('측정')}</span><b class="num">${st.sent}</b><small>신사업·지시로</small></div></div>
      ${mixPanel()}
      ${S.ui.ibNew ? `<section class="panel"><h3>새 주제 등록</h3><form class="form" data-form="ibTopic">
          <label class="f wide">주제 이름<input type="text" name="title" required maxlength="40" placeholder="예: 가맹점 매출 회복"></label>
          <label class="f wide">한 줄 설명<input type="text" name="desc" maxlength="80" placeholder="어떤 아이디어를 모을지"></label>
          <fieldset class="ib-fs wide"><legend>카드 색</legend>${COLORS.map((c, i) => `<label class="ib-color"><input type="radio" name="color" value="${c}" ${i === 0 ? 'checked' : ''}><span style="background:${c}"></span></label>`).join('')}</fieldset>
          ${schedFields({ ai: 'Claude', freq: 'weekly', dow: 1, dom: 1, hour: 9, formats: ['cardnews', 'html'], prompt: '' })}
          <div class="wide row"><button class="btn primary">등록하고 예약 걸기(목업)</button><button type="button" class="btn" data-act="ibCancel">취소</button></div>
        </form></section>` : ''}
      <div class="ib-grid">${B.topics.map((t) => { const n = postsOf(t.id); const es = evalStats(n); return `<button type="button" class="ib-topic" data-act="ibOpen" data-id="${t.id}" style="--c:${esc(t.color)}">
          ${cover(t)}
          <span class="ib-tb"><b class="ib-tt">${esc(t.title)}</b><span class="ib-desc">${esc(t.desc || '')}</span>
            <span class="ib-meta"><span class="pill ${t.schedule.enabled ? 'st-done' : 'st-hold'}">${esc(t.schedule.ai)} · ${schLabel(t.schedule)}${t.schedule.enabled ? '' : ' · 꺼짐'}</span></span>
            <span class="ib-meta"><span>산출물 <b class="num">${n.length}</b></span><span>채택 <b class="num">${es.adopt}</b></span><span>평가 전 <b class="num">${n.filter((p) => !p.decision && !p.rating).length}</b></span></span>
            <span class="ib-meta"><span>다음 실행 ${nextLabel(t.schedule)}</span></span></span>
        </button>`; }).join('')}</div>
      <p class="ib-note">목업 — 예약 작업은 화면 안 설정만 저장합니다. 실서비스에서는 예약 작업이 끝나면 산출물 링크·썸네일이 이 게시판에 자동 등록됩니다.</p>`;
  }

  function topicView(t) {
    const f = S.ui.ibFmt || 'all'; const dv = S.ui.ibDec || 'all'; const sort = S.ui.ibSort || 'new';
    const all = postsOf(t.id);
    let list = all.filter((p) => (f === 'all' || p.format === f) && (dv === 'all' || (dv === 'none' ? !p.decision : p.decision === dv)));
    if (sort === 'star') list = list.slice().sort((a, b) => b.rating - a.rating);
    const s = t.schedule; const adv = promptAdvice(t); const es = evalStats(all);
    return `<div class="view-head"><div><button type="button" class="btn sm" data-act="ibBack">← 주제 목록</button><h2 style="margin-top:8px">${esc(t.title)}</h2><p>${esc(t.desc || '')}</p></div>
        <div class="row"><button type="button" class="btn" data-act="ibAddPost">+ 산출물 등록</button><button type="button" class="btn primary" data-act="ibRun" data-id="${t.id}" ${s.formats.length ? '' : 'disabled'}>지금 실행(목업)</button></div></div>
      <div class="grid2 ib-top2">
      <section class="panel ib-sched" style="--c:${esc(t.color)}"><h3>AI 예약 작업 <span class="pill ${s.enabled ? 'st-done' : 'st-hold'}">${s.enabled ? '켜짐' : '꺼짐'}</span><span class="ib-lab">화면 안 목업 설정</span></h3>
        <div class="ib-sched-row"><div><span class="ib-lab">AI</span><b>${esc(s.ai)}</b></div><div><span class="ib-lab">주기</span><b>${schLabel(s)}</b></div><div><span class="ib-lab">다음 실행</span><b>${nextLabel(s)}</b></div><div><span class="ib-lab">산출물</span><b>${s.formats.map((x) => FORMATS[x]).join(' · ') || '없음'}</b></div></div>
        <p class="ib-prompt"><span class="ib-lab">지시문</span>${esc(s.prompt || '(없음)')}</p>
        <code class="ib-cron">${esc(cronOf(s))}</code>
        <div class="row" style="margin-top:10px"><button type="button" class="btn sm" data-act="ibToggle" data-id="${t.id}">${s.enabled ? '예약 끄기' : '예약 켜기'}</button><button type="button" class="btn sm" data-act="ibEditSched">${S.ui.ibEditSched ? '편집 닫기' : '예약 편집'}</button><button type="button" class="btn sm ib-danger" data-act="ibAskDel">주제 삭제</button></div>
        ${S.ui.ibAskDel ? `<div class="ib-confirm"><span>‘${esc(t.title)}’과 산출물 ${all.length}건을 삭제할까요? 예약 설정도 함께 지워집니다.</span><span class="row"><button type="button" class="btn sm ib-danger" data-act="ibDelTopic" data-id="${t.id}">삭제</button><button type="button" class="btn sm" data-act="ibCancelDel">취소</button></span></div>` : ''}
        ${S.ui.ibEditSched ? `<form class="form" data-form="ibSchedule" style="margin-top:12px">${schedFields(s)}<div class="wide"><button class="btn primary sm">예약 저장</button></div></form>` : ''}
      </section>
      <section class="panel ib-adv"><h3>지시문 개선 제안 ${AI_PILL}</h3>
        <div class="ib-evalsum"><span>평가 <b class="num">${es.rated}</b>/${es.n} ${badge('측정')}</span><span>평균 별점 <b class="num">${es.avg ? es.avg.toFixed(1) : '—'}</b></span><span>채택 <b class="num">${es.adopt}</b> · 보류 <b class="num">${es.hold}</b></span></div>
        ${adv ? `<ul class="ib-why">${adv.why.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>
          <p class="ib-prompt"><span class="ib-lab">제안 지시문</span>${esc(adv.prompt)}</p>
          <p class="ib-prompt"><span class="ib-lab">제안 산출물</span>${adv.formats.map((x) => FORMATS[x]).join(' · ')}</p>
          ${t.schedule.prompt === adv.prompt ? '<p class="ib-note"><span class="pill st-done">적용됨</span> 지금 지시문이 제안과 같습니다. 평가가 더 쌓이면 다시 제안합니다.</p>' : S.ui.ibAdvAsk ? `<div class="ib-confirm"><span>지시문과 산출물 형태를 제안대로 바꿉니다. 다음 실행부터 적용됩니다.</span><span class="row"><button type="button" class="btn sm primary" data-act="ibAdvApply" data-id="${t.id}">적용</button><button type="button" class="btn sm" data-act="ibAdvCancel">취소</button></span></div>`
            : `<div class="row"><button type="button" class="btn sm primary" data-act="ibAdvAsk">제안 적용</button></div>`}`
          : '<p class="ib-note">산출물 2건 이상을 평가(별점·채택·보류)하면 결과를 보고 지시문 고칠 점을 제안합니다.</p>'}
      </section></div>
      ${S.ui.ibAddPost ? `<section class="panel"><h3>산출물 직접 등록</h3><form class="form" data-form="ibPost">
          <label class="f wide">제목<input type="text" name="title" required maxlength="60" placeholder="예: 주말 패스 가격 3안 비교"></label>
          <label class="f">형태<select name="format">${Object.entries(FORMATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
          <label class="f">만든 AI<select name="ai">${[...AIS, '직접 작성'].map((a) => `<option>${a}</option>`).join('')}</select></label>
          <label class="f wide">링크(파일·페이지 주소)<input type="url" name="link" placeholder="https://"></label>
          <label class="f wide">한 줄 요약<input type="text" name="summary" maxlength="120"></label>
          <div class="wide row"><button class="btn primary sm">등록</button><button type="button" class="btn sm" data-act="ibAddPost">취소</button></div></form></section>` : ''}
      <section class="panel"><h3>산출물 <span class="ib-lab">${all.length}건</span></h3>
        <div class="ib-filters">
          <div class="seg ib-seg" role="group" aria-label="형태 필터">${[['all', '전체'], ...Object.entries(FORMATS)].map(([k, v]) => `<button type="button" data-act="ibFmt" data-v="${k}" aria-pressed="${k === f}">${v}${k === 'all' ? '' : ` ${all.filter((p) => p.format === k).length}`}</button>`).join('')}</div>
          <div class="seg ib-seg" role="group" aria-label="평가 필터">${[['all', '평가 전체'], ['채택', '채택'], ['보류', '보류'], ['none', '결정 전']].map(([k, v]) => `<button type="button" data-act="ibDec" data-v="${k}" aria-pressed="${k === dv}">${v}</button>`).join('')}</div>
          <div class="seg ib-seg" role="group" aria-label="정렬">${[['new', '최신순'], ['star', '별점순']].map(([k, v]) => `<button type="button" data-act="ibSort" data-v="${k}" aria-pressed="${k === sort}">${v}</button>`).join('')}</div>
        </div>
        ${list.length ? `<div class="ib-posts">${list.map((p) => `<button type="button" class="ib-post" data-act="ibPostOpen" data-id="${p.id}">
            <span class="ib-thumb">${thumb(p, t.color)}<span class="ib-fbadge">${FORMATS[p.format]}</span></span>
            <span class="ib-pb"><b>${esc(p.title)}</b><span class="ib-ps">${esc(p.summary || '')}</span>
              <span class="ib-meta">${p.rating ? stars(p.rating) : ''}${decPill(p)}${p.sent.ideas ? '<span class="pill st-wait">→ 신사업</span>' : ''}${p.sent.directives ? '<span class="pill st-wait">→ 지시</span>' : ''}</span>
              <span class="ib-meta"><span>${esc(p.ai)} · ${md(p.created_at)}${p.created_at === S.today ? ' <span class="pill st-wait">새 글</span>' : ''}</span></span></span>
          </button>`).join('')}</div>` : guide('folder', '조건에 맞는 산출물이 없습니다', '필터를 바꾸거나 ‘지금 실행(목업)’을 누르면 AI가 만든 산출물이 여기에 쌓입니다.')}
      </section>
      ${postModal(t)}`;
  }

  function postModal(t) {
    const p = S.ui.ibPost && postById(S.ui.ibPost); if (!p) return '';
    const sl = slides(p, t); const i = Math.min(S.ui.ibSlide || 0, sl.length - 1);
    const many = sl.length > 1;
    const inI = inboxOf(p, 'ideas'); const inD = inboxOf(p, 'directives');
    const sendBtn = (to, label, item) => item
      ? `<span class="ib-sent">${label} 보냄 ✓ ${item.done ? '<span class="ib-lab">(받는 쪽 처리 완료)</span>' : `<button type="button" class="dir-link ib-link" data-act="ibUnsend" data-id="${p.id}" data-v="${to}">보내기 취소</button>`}</span>`
      : `<button type="button" class="btn sm ${to === 'ideas' ? 'primary' : ''}" data-act="ibSend" data-id="${p.id}" data-v="${to}" ${p.decision === '채택' ? '' : 'disabled'}>${label}로 보내기</button>`;
    return `<div class="ib-modal" role="dialog" aria-modal="true" aria-labelledby="ib-mt"><div class="ib-back" data-act="ibPostClose"></div>
      <div class="ib-sheet"><button type="button" class="ib-x" data-act="ibPostClose" aria-label="닫기">×</button>
        <div class="ib-view">
          <div class="ib-stage ib-f-${p.format}">${slideHtml(sl[i], p, t, i, sl.length)}</div>
          ${many ? `<div class="ib-nav"><button type="button" class="btn sm" data-act="ibSlide" data-v="-1" ${i ? '' : 'disabled'} aria-label="이전">‹ 이전</button>
            <span class="ib-dots">${sl.map((_, k) => `<button type="button" class="${k === i ? 'on' : ''}" data-act="ibSlideTo" data-v="${k}" aria-label="${k + 1}번째로">${k + 1}</button>`).join('')}</span>
            <button type="button" class="btn sm" data-act="ibSlide" data-v="1" ${i < sl.length - 1 ? '' : 'disabled'} aria-label="다음">다음 ›</button></div>` : ''}
          <p class="ib-note ib-view-note">${AI_PILL} 미리보기 글은 화면 안에서 만든 예시입니다.</p>
        </div>
        <div class="ib-sheet-b"><span class="row"><span class="chip">${FORMATS[p.format]}</span>${decPill(p)}</span><h3 id="ib-mt">${esc(p.title)}</h3>
          <p>${esc(p.summary || '요약 없음')}</p>
          <p class="ib-lab">${esc(t.title)} · ${esc(p.ai)} · ${esc(p.by || '직접 등록')} · ${esc(p.created_at)}</p>
          <div class="ib-eval"><span class="ib-lab">별점</span><span class="ib-starbtns" role="group" aria-label="별점 주기">${[1, 2, 3, 4, 5].map((k) => `<button type="button" class="${k <= p.rating ? 'on' : ''}" data-act="ibRate" data-id="${p.id}" data-v="${k}" aria-pressed="${k === p.rating}" aria-label="${k}점">★</button>`).join('')}</span></div>
          <div class="ib-eval"><span class="ib-lab">결정</span><span class="seg" role="group" aria-label="채택 여부">${DECISIONS.map((d) => `<button type="button" data-act="ibDecide" data-id="${p.id}" data-v="${d}" aria-pressed="${p.decision === d}">${d}</button>`).join('')}<button type="button" data-act="ibDecide" data-id="${p.id}" data-v="" aria-pressed="${!p.decision}">결정 전</button></span></div>
          <div class="ib-send"><span class="ib-lab">채택분 보내기${p.decision === '채택' ? '' : ' — 채택하면 보낼 수 있습니다'}</span>
            <div class="row">${sendBtn('ideas', '신사업', inI)}${sendBtn('directives', '지시 초안', inD)}</div></div>
          <div class="row ib-acts">${p.link && p.link !== '#' ? `<a class="btn sm" href="${esc(p.link)}" target="_blank" rel="noopener">원본 열기</a>` : '<button type="button" class="btn sm" data-act="ibNoLink">원본 열기</button>'}
            ${S.ui.ibDelAsk === p.id ? `<button type="button" class="btn sm ib-danger" data-act="ibDelPost" data-id="${p.id}">정말 삭제</button><button type="button" class="btn sm" data-act="ibDelCancel">취소</button>` : `<button type="button" class="btn sm ib-danger" data-act="ibDelAsk" data-id="${p.id}">삭제</button>`}
            <button type="button" class="btn sm" data-act="ibPostClose">닫기</button></div>
        </div></div></div>`;
  }

  APP.views.ideabank = () => { const t = S.ui.ibTopic && topicById(S.ui.ibTopic); return t ? topicView(t) : listView(); };

  /* ---------- 동작 ---------- */
  const resetUi = () => { Object.assign(S.ui, { ibAddPost: false, ibEditSched: false, ibAskDel: false, ibPost: null, ibFmt: 'all', ibDec: 'all', ibAdvAsk: false, ibDelAsk: null }); };
  const sendTo = (p, to) => {
    const t = topicById(p.topic_id) || { title: '' };
    const base = { id: uid('ib'), at: new Date().toISOString(), from: 'ideabank', to, done: false };
    const item = to === 'ideas'
      ? Object.assign(base, { kind: 'idea', title: p.title, payload: { post_id: p.id, topic: t.title, summary: p.summary || '', format: p.format, rating: p.rating, ai: p.ai } })
      : Object.assign(base, { kind: 'directive_draft', title: `[아이디어 실행] ${p.title}`, payload: { post_id: p.id, topic: t.title, body: `${p.summary || ''}\n(아이디어뱅크 ‘${t.title}’ 채택안 · ${p.ai} 생성 · 별점 ${p.rating || '-'})`, priority: '보통', due: dayStr(14) } });
    S.inbox.push(item); p.sent[to] = item.id;
    logAct('send', `‘${p.title}’ → ${to === 'ideas' ? '신사업' : '지시 초안'}`, p.id);
  };
  Object.assign(APP.acts, {
    ibNew: () => { S.ui.ibNew = !S.ui.ibNew; },
    ibCancel: () => { S.ui.ibNew = false; },
    ibOpen: (el) => { S.ui.ibTopic = el.dataset.id; resetUi(); setTimeout(() => window.scrollTo(0, 0), 0); },
    ibBack: () => { S.ui.ibTopic = null; resetUi(); },
    ibFmt: (el) => { S.ui.ibFmt = el.dataset.v; },
    ibDec: (el) => { S.ui.ibDec = el.dataset.v; },
    ibSort: (el) => { S.ui.ibSort = el.dataset.v; },
    ibAddPost: () => { S.ui.ibAddPost = !S.ui.ibAddPost; },
    ibEditSched: () => { S.ui.ibEditSched = !S.ui.ibEditSched; },
    ibAskDel: () => { S.ui.ibAskDel = true; },
    ibCancelDel: () => { S.ui.ibAskDel = false; },
    ibToggle: (el) => { const s = topicById(el.dataset.id).schedule; s.enabled = !s.enabled; logAct('schedule', `‘${topicById(el.dataset.id).title}’ 예약 ${s.enabled ? '켬' : '끔'}`, el.dataset.id); toast(s.enabled ? `예약을 켰습니다 — 다음 실행 ${nextLabel(s)} (목업)` : '예약을 껐습니다'); },
    ibDelTopic: (el) => { const id = el.dataset.id; const t = topicById(id); B.topics = B.topics.filter((x) => x.id !== id); B.posts = B.posts.filter((p) => p.topic_id !== id); S.ui.ibTopic = null; resetUi(); logAct('delete', `주제 ‘${t ? t.title : id}’ 삭제`, id); toast('주제를 삭제했습니다'); },
    ibPostOpen: (el) => { S.ui.ibPost = el.dataset.id; S.ui.ibSlide = 0; S.ui.ibDelAsk = null; },
    ibPostClose: () => { S.ui.ibPost = null; S.ui.ibDelAsk = null; },
    ibNoLink: () => toast('목업 산출물이라 원본 파일이 없습니다. 왼쪽 미리보기로 확인해 주세요'),
    ibSlide: (el) => { S.ui.ibSlide = Math.max(0, (S.ui.ibSlide || 0) + (+el.dataset.v)); },
    ibSlideTo: (el) => { S.ui.ibSlide = +el.dataset.v; },
    ibRate: (el) => { const p = postById(el.dataset.id); const v = +el.dataset.v; p.rating = p.rating === v ? 0 : v; logAct('rate', `‘${p.title}’ 별점 ${p.rating || '취소'}`, p.id); },
    ibDecide: (el) => {
      const p = postById(el.dataset.id); const v = el.dataset.v || null; if (p.decision === v) return;
      p.decision = v; logAct('decide', `‘${p.title}’ ${v || '결정 취소'}`, p.id);
      toast(v === '채택' ? '채택했습니다 — 신사업이나 지시로 보낼 수 있습니다' : v === '보류' ? '보류했습니다' : '결정을 취소했습니다');
    },
    ibSend: (el) => {
      const p = postById(el.dataset.id); const to = el.dataset.v; if (!p || p.decision !== '채택' || inboxOf(p, to)) return;
      sendTo(p, to); toast(to === 'ideas' ? '신사업 메뉴의 받은 항목으로 보냈습니다' : '지시 관리 메뉴의 받은 항목으로 지시 초안을 보냈습니다');
    },
    ibUnsend: (el) => {
      const p = postById(el.dataset.id); const to = el.dataset.v; const it = inboxOf(p, to); if (!it || it.done) return;
      S.inbox = S.inbox.filter((x) => x !== it); delete p.sent[to]; logAct('unsend', `‘${p.title}’ 보내기 취소(${to})`, p.id); toast('보내기를 취소했습니다');
    },
    ibDelAsk: (el) => { S.ui.ibDelAsk = el.dataset.id; },
    ibDelCancel: () => { S.ui.ibDelAsk = null; },
    ibDelPost: (el) => { const p = postById(el.dataset.id); B.posts = B.posts.filter((x) => x.id !== el.dataset.id); S.ui.ibPost = null; S.ui.ibDelAsk = null; if (p) logAct('delete', `산출물 ‘${p.title}’ 삭제`, p.id); toast('산출물을 삭제했습니다'); },
    ibRun: (el) => {
      const t = topicById(el.dataset.id); const s = t.schedule;
      const idea = t.seeds && t.seeds.length ? t.seeds[t.seedIdx++ % t.seeds.length] : `${t.title} 아이디어 ${postsOf(t.id).length + 1}`;
      s.formats.forEach((f) => B.posts.push({ id: uid('ip'), topic_id: t.id, title: `${idea}${s.formats.length > 1 ? ' — ' + FORMATS[f] : ''}`, format: f, ai: s.ai, created_at: S.today, summary: `${t.title} 주제에서 ‘${idea}’를 ${FORMATS[f]}로 정리한 안입니다. 시범 방법과 확인할 점을 담았습니다(목업 생성).`, link: '#', rating: 0, decision: null, sent: {}, by: '지금 실행' }));
      S.ui.ibFmt = 'all'; S.ui.ibDec = 'all';
      logAct('run', `‘${t.title}’ 지금 실행 → ${s.formats.length}건 생성(목업)`, t.id);
      toast(`${s.ai}가 산출물 ${s.formats.length}건을 만들었습니다(목업)`);
    },
    ibAdvAsk: () => { S.ui.ibAdvAsk = true; },
    ibAdvCancel: () => { S.ui.ibAdvAsk = false; },
    ibAdvApply: (el) => {
      const t = topicById(el.dataset.id); const adv = promptAdvice(t); if (!adv) return;
      t.schedule.prompt = adv.prompt; t.schedule.formats = adv.formats; S.ui.ibAdvAsk = false;
      logAct('prompt', `‘${t.title}’ 지시문 개선 제안 적용`, t.id); toast('지시문을 바꿨습니다 — 다음 실행부터 적용(목업)');
    },
    ibMixOpen: () => { S.ui.ibMix = S.ui.ibMix ? null : { sel: [], fmt: 'cardnews', results: [] }; },
    ibMixClose: () => { S.ui.ibMix = null; },
    ibMixPick: (el) => {
      const m = S.ui.ibMix; const id = el.dataset.id;
      m.sel = m.sel.includes(id) ? m.sel.filter((x) => x !== id) : [...m.sel, id].slice(-2); m.results = [];
    },
    ibMixRun: () => {
      const m = S.ui.ibMix; const a = topicById(m.sel[0]); const b = topicById(m.sel[1]); if (!a || !b) return;
      m.results = mixIdeas(a, b, m.fmt || 'cardnews'); m.names = `${a.title} × ${b.title}`;
      logAct('mix', `‘${a.title}’ × ‘${b.title}’ 섞기 → 3건(목업)`, `${a.id},${b.id}`);
    },
    ibMixSave: () => {
      const m = S.ui.ibMix; const a = topicById(m.sel[0]); const b = topicById(m.sel[1]); if (!a || !b || !m.results.length) return;
      const t = { id: uid('it'), title: m.names, desc: `‘${a.title}’과 ‘${b.title}’을 섞어 만든 주제`, color: a.color, created_at: S.today, schedule: { ai: a.schedule.ai, formats: [m.fmt || 'cardnews'], prompt: `${a.title}와 ${b.title}의 장점을 묶은 아이디어를 만들어 줘.`, enabled: false, freq: 'weekly', dow: 1, dom: 1, hour: 9 }, seeds: [], seedIdx: 0 };
      B.topics.unshift(t);
      m.results.forEach((r) => B.posts.push({ id: uid('ip'), topic_id: t.id, title: r.title, format: r.format, ai: '목업 AI', created_at: S.today, summary: r.summary, link: '#', rating: 0, decision: null, sent: {}, by: '주제 섞기' }));
      S.ui.ibMix = null; logAct('topic', `섞은 주제 ‘${t.title}’ 만듦`, t.id);
      toast(`‘${t.title}’ 주제를 만들었습니다`);
    },
    ibInDone: (el) => { const x = S.inbox.find((i) => i.id === el.dataset.id); if (x) { x.done = true; logAct('inbox', `받은 항목 ‘${x.title}’ 확인`, x.id); } },
    ibInTopic: (el) => {
      const x = S.inbox.find((i) => i.id === el.dataset.id); if (!x) return;
      const t = { id: uid('it'), title: clip(x.title, 40), desc: (x.payload && (x.payload.summary || x.payload.body)) || `${x.from}에서 보낸 항목`, color: COLORS[B.topics.length % COLORS.length], created_at: S.today, schedule: { ai: 'Claude', formats: ['cardnews'], prompt: `‘${x.title}’에 대한 아이디어 3개를 카드뉴스로 만들어 줘.`, enabled: false, freq: 'weekly', dow: 1, dom: 1, hour: 9 }, seeds: [], seedIdx: 0 };
      B.topics.unshift(t); x.done = true; logAct('topic', `받은 항목으로 주제 ‘${t.title}’ 만듦`, t.id); toast('주제로 만들었습니다(예약은 꺼진 상태)');
    }
  });
  APP.changes.ibMixFmt = (el) => { if (S.ui.ibMix) { S.ui.ibMix.fmt = FORMATS[el.value] ? el.value : 'cardnews'; S.ui.ibMix.results = []; } };

  /* 상세 창: Esc 닫기, ←→ 넘기기 */
  document.addEventListener('keydown', (e) => {
    if (!S.ui.ibPost || !document.querySelector('.ib-modal')) return;
    if (e.key === 'Escape') { const b = document.querySelector('.ib-sheet [data-act="ibPostClose"]'); if (b) b.click(); }
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '')) {
      const b = document.querySelector(`.ib-nav [data-act="ibSlide"][data-v="${e.key === 'ArrowRight' ? 1 : -1}"]`); if (b && !b.disabled) { e.preventDefault(); b.click(); }
    }
  });

  const getter = (fd) => (n) => (fd.get(n) || '').toString().trim();
  Object.assign(APP.forms, {
    ibTopic: (fd) => {
      const g = getter(fd); const sch = readSched(fd, g);
      if (!sch.formats.length) sch.formats = ['cardnews'];
      const t = { id: uid('it'), title: g('title'), desc: g('desc'), color: /^#[0-9A-Fa-f]{6}$/.test(g('color')) ? g('color') : COLORS[0], created_at: S.today, schedule: Object.assign(sch, { enabled: true }), seeds: [], seedIdx: 0 };
      B.topics.unshift(t); S.ui.ibNew = false; logAct('topic', `주제 ‘${t.title}’ 등록`, t.id);
      toast(`‘${t.title}’ 등록 — ${t.schedule.ai} 예약 ${schLabel(t.schedule)} (목업)`);
    },
    ibSchedule: (fd) => {
      const t = topicById(S.ui.ibTopic); const g = getter(fd); const sch = readSched(fd, g);
      if (!sch.formats.length) { toast('산출물 형태를 하나 이상 고르세요'); return; }
      t.schedule = Object.assign(t.schedule, sch); S.ui.ibEditSched = false; logAct('schedule', `‘${t.title}’ 예약 수정`, t.id);
      toast(`예약을 저장했습니다 — 다음 실행 ${nextLabel(t.schedule)} (목업)`);
    },
    ibPost: (fd) => {
      const g = getter(fd); const link = /^https?:\/\//.test(g('link')) ? g('link') : '#';
      B.posts.push({ id: uid('ip'), topic_id: S.ui.ibTopic, title: g('title'), format: FORMATS[g('format')] ? g('format') : 'doc', ai: g('ai'), created_at: S.today, summary: g('summary'), link, rating: 0, decision: null, sent: {}, by: '직접 등록' });
      S.ui.ibAddPost = false; logAct('post', `산출물 ‘${g('title')}’ 직접 등록`, S.ui.ibTopic); toast('산출물을 등록했습니다');
    }
  });
})();
