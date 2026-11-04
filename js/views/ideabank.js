/* 메뉴: 아이디어뱅크 (ideabank) — 주제별 카드 게시판.
   주제마다 AI(Claude 등) 예약 작업을 걸어 아이디어를 비주얼 산출물(카드뉴스·PT·HTML 리포트·영상·문서)로 만들고 게시물로 쌓는다.
   목업: 예약 실행은 '지금 실행(목업)'으로 흉내 내며, 실서비스에서는 예약 작업이 결과물을 등록한다. */
(function () {
  'use strict';
  const { clone, S, esc, md, badge, uid, toast, dayStr, guide } = window.APP;

  /* ---------- 기준 ---------- */
  const FORMATS = { cardnews: '카드뉴스', ppt: 'PT형', html: 'HTML 비주얼 리포트', video: '영상', doc: '문서형' };
  const AIS = ['Claude', 'ChatGPT', 'Gemini'];
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  const COLORS = ['#C0392B', '#E9A400', '#2E8B57', '#5B6FB8', '#E46F8C', '#2F8C7A', '#8C6A4F'];

  /* ---------- 샘플 데이터(메뉴 파일 안에서만 S에 붙인다) ---------- */
  if (!S.ideaBank) {
    const SEED0 = { it1: 2, it2: 1, it3: 3, it4: 1 }; // 샘플 게시물로 이미 쓴 아이디어 다음부터 생성
    const T = (id, title, desc, color, ai, sch, formats, prompt, seeds) => ({ id, title, desc, color, created_at: dayStr(-20), schedule: Object.assign({ ai, formats, prompt, enabled: true }, sch), seeds, seedIdx: SEED0[id] || 0 });
    const P = (topic_id, title, format, ai, ago, summary, reviewed) => ({ id: uid('ip'), topic_id, title, format, ai, created_at: dayStr(-ago), summary, link: '#', reviewed: !!reviewed, by: '예약 작업' });
    S.ideaBank = {
      topics: [
        T('it1', '매장 고객경험', '벌툰 매장에서 고객이 더 오래, 더 자주 머물게 하는 아이디어', '#E9A400', 'Claude', { freq: 'weekly', dow: 1, dom: 1, hour: 9 }, ['cardnews', 'html'], '벌툰 매장 고객경험 개선 아이디어 3개를 카드뉴스와 HTML 리포트로 만들어 줘. 비용·기대효과·시범 방법 포함.', ['주말 만화 정주행 패스', '좌석별 조명 밝기 선택', '대기 고객 실시간 알림', '신간 입고 SNS 알림']),
        T('it2', '생전포차 글로벌 메뉴', '해외 매장에서 통할 포차 메뉴와 현지화 방향', '#C0392B', 'Claude', { freq: 'weekly', dow: 3, dom: 1, hour: 10 }, ['ppt', 'video'], '생전포차 해외 매장용 메뉴 아이디어를 PT 5장과 30초 소개 영상 콘티로 만들어 줘.', ['K포차 안주 세트 3종', '현지 주류 페어링', '1인 포차 메뉴']),
        T('it3', 'AI 업무 자동화', '본사·가맹점 반복 업무를 AI로 줄이는 아이디어', '#2F8C7A', 'Claude', { freq: 'daily', dow: 1, dom: 1, hour: 8 }, ['doc', 'html'], '본사 반복 업무 중 AI로 자동화할 후보를 하나 골라 절감시간·방법·위험을 문서와 HTML 리포트로 정리해 줘.', ['발주 수량 자동 추천', '회의록 요약·지시 추출', '가맹점 문의 자동 분류', '매장 오픈 체크리스트 자동화']),
        T('it4', '신규 브랜드 네이밍', '새 브랜드 이름·슬로건 후보와 시각 방향', '#5B6FB8', 'ChatGPT', { freq: 'monthly', dow: 1, dom: 1, hour: 9 }, ['cardnews', 'ppt'], '신규 외식 브랜드 이름 후보 5개와 슬로건, 색·로고 방향을 카드뉴스와 PT로 만들어 줘.', ['골목 감성 브랜드', '건강 간편식 브랜드'])
      ],
      posts: [
        P('it1', '주말 만화 정주행 패스', 'cardnews', 'Claude', 0, '토·일 6시간 정액 패스. 객단가 +18% 예상, 3개 매장 2주 시범 제안.'),
        P('it1', '주말 만화 정주행 패스 — 수익 구조', 'html', 'Claude', 0, '패스 가격별 손익 시뮬레이션과 매장별 좌석 회전율 그래프.'),
        P('it1', '좌석별 조명 밝기 선택', 'cardnews', 'Claude', 7, '좌석마다 3단 조명. 장시간 고객 만족도 개선, 설치비 좌석당 4만원 추정.', true),
        P('it2', 'K포차 안주 세트 3종', 'ppt', 'Claude', 1, '떡볶이·전·꼬치 세트를 현지 입맛에 맞춘 3종 구성, 원가율 32% 목표.'),
        P('it2', 'K포차 안주 세트 — 30초 소개', 'video', 'Claude', 1, '30초 매장 소개 영상 콘티(장면 6개, 자막·음악 방향).'),
        P('it3', '발주 수량 자동 추천', 'doc', 'Claude', 0, '최근 8주 판매로 다음 주 발주량 추천. 점주 1인당 월 1.5시간 절감 추정.'),
        P('it3', '회의록 요약·지시 추출', 'html', 'Claude', 1, '회의록에서 지시·담당·기한을 뽑아 Asana로 넘기는 흐름도와 예시 화면.', true),
        P('it3', '가맹점 문의 자동 분류', 'doc', 'Claude', 2, '문의를 7개 유형으로 자동 분류, 응답 시간 40% 단축 목표.'),
        P('it4', '골목 감성 브랜드 이름 5안', 'cardnews', 'ChatGPT', 3, '이름 5안·슬로건·추천 색. 상표 검색은 별도 확인 필요.')
      ]
    };
  }
  const B = S.ideaBank;

  /* ---------- 계산 ---------- */
  const topicById = (id) => B.topics.find((t) => t.id === id);
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

  /* ---------- 썸네일(인라인 SVG, 직접 그린 도형만) ---------- */
  const clip = (t, n) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
  function thumb(p, color) {
    const t = esc(clip(p.title, 15)); const c = esc(color);
    const head = `<svg class="ib-svg" viewBox="0 0 320 200" role="img" aria-label="${esc(FORMATS[p.format])} 썸네일: ${esc(p.title)}" preserveAspectRatio="xMidYMid slice">`;
    const body = {
      cardnews: `<rect width="320" height="200" fill="${c}"/><rect x="62" y="22" width="150" height="160" rx="14" fill="#fff" opacity=".35" transform="rotate(-6 137 102)"/><rect x="92" y="18" width="150" height="164" rx="14" fill="#FFFDF9"/><rect x="108" y="36" width="40" height="8" rx="4" fill="${c}"/><text x="108" y="74" font-size="15" font-weight="900" fill="#3D1E0F">${esc(clip(p.title, 8))}</text><text x="108" y="94" font-size="15" font-weight="900" fill="#3D1E0F">${esc(clip(p.title.slice(8), 8))}</text><rect x="108" y="118" width="118" height="6" rx="3" fill="#E4D7C6"/><rect x="108" y="132" width="96" height="6" rx="3" fill="#E4D7C6"/><circle cx="214" cy="162" r="9" fill="${c}"/><text x="230" y="190" font-size="11" fill="#fff" font-weight="700">1 / 5</text>`,
      ppt: `<rect width="320" height="200" fill="#F8F1E7"/><rect x="24" y="20" width="272" height="160" rx="10" fill="#FFFDF9" stroke="#E4D7C6" stroke-width="2"/><rect x="24" y="20" width="272" height="34" rx="10" fill="${c}"/><rect x="24" y="40" width="272" height="14" fill="${c}"/><text x="40" y="43" font-size="14" font-weight="900" fill="#fff">${t}</text><rect x="48" y="128" width="26" height="32" fill="${c}" opacity=".45"/><rect x="86" y="104" width="26" height="56" fill="${c}" opacity=".65"/><rect x="124" y="84" width="26" height="76" fill="${c}"/><rect x="180" y="80" width="96" height="7" rx="3" fill="#E4D7C6"/><rect x="180" y="96" width="80" height="7" rx="3" fill="#E4D7C6"/><rect x="180" y="112" width="88" height="7" rx="3" fill="#E4D7C6"/>`,
      html: `<rect width="320" height="200" fill="#FFFDF9"/><rect width="320" height="26" fill="#3D1E0F"/><circle cx="16" cy="13" r="4" fill="#F27BA0"/><circle cx="30" cy="13" r="4" fill="#FABF1A"/><circle cx="44" cy="13" r="4" fill="#6CC08F"/><rect x="60" y="7" width="200" height="12" rx="6" fill="#5a3a28"/><rect x="0" y="26" width="320" height="56" fill="${c}"/><text x="20" y="60" font-size="16" font-weight="900" fill="#fff">${t}</text><rect x="20" y="96" width="132" height="86" rx="10" fill="#F8F1E7"/><polyline points="32,166 58,142 82,150 108,118 140,108" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round"/><rect x="166" y="96" width="134" height="40" rx="10" fill="#F8F1E7"/><rect x="166" y="142" width="134" height="40" rx="10" fill="#F8F1E7"/><text x="178" y="122" font-size="15" font-weight="900" fill="${c}">+18%</text>`,
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

  function listView() {
    const total = B.posts.length; const todayN = B.posts.filter((p) => p.created_at === S.today).length; const on = B.topics.filter((t) => t.schedule.enabled).length;
    return `<div class="view-head"><div><h2>아이디어뱅크</h2><p>주제마다 AI에 예약 작업을 걸어 두면 아이디어가 카드뉴스·PT·HTML 리포트·영상·문서로 쌓입니다.</p></div>
        <button type="button" class="btn primary" data-act="ibNew">+ 새 주제</button></div>
      <div class="ib-kpis"><div><span>주제</span><b class="num">${B.topics.length}</b></div><div><span>예약 켜짐</span><b class="num">${on}</b></div><div><span>산출물 ${badge('측정')}</span><b class="num">${total}</b></div><div><span>오늘 생성</span><b class="num">${todayN}</b></div></div>
      ${S.ui.ibNew ? `<section class="panel"><h3>새 주제 등록</h3><form class="form" data-form="ibTopic">
          <label class="f wide">주제 이름<input type="text" name="title" required maxlength="40" placeholder="예: 가맹점 매출 회복"></label>
          <label class="f wide">한 줄 설명<input type="text" name="desc" maxlength="80" placeholder="어떤 아이디어를 모을지"></label>
          <fieldset class="ib-fs wide"><legend>카드 색</legend>${COLORS.map((c, i) => `<label class="ib-color"><input type="radio" name="color" value="${c}" ${i === 0 ? 'checked' : ''}><span style="background:${c}"></span></label>`).join('')}</fieldset>
          ${schedFields({ ai: 'Claude', freq: 'weekly', dow: 1, dom: 1, hour: 9, formats: ['cardnews', 'html'], prompt: '' })}
          <div class="wide row"><button class="btn primary">등록하고 예약 걸기</button><button type="button" class="btn" data-act="ibCancel">취소</button></div>
        </form></section>` : ''}
      <div class="ib-grid">${B.topics.map((t) => { const n = postsOf(t.id); return `<button type="button" class="ib-topic" data-act="ibOpen" data-id="${t.id}" style="--c:${esc(t.color)}">
          ${cover(t)}
          <span class="ib-tb"><b class="ib-tt">${esc(t.title)}</b><span class="ib-desc">${esc(t.desc || '')}</span>
            <span class="ib-meta"><span class="pill ${t.schedule.enabled ? 'st-done' : 'st-hold'}">${esc(t.schedule.ai)} · ${schLabel(t.schedule)}${t.schedule.enabled ? '' : ' · 꺼짐'}</span></span>
            <span class="ib-meta"><span>산출물 <b class="num">${n.length}</b>건</span><span>다음 실행 ${nextLabel(t.schedule)}</span></span>
            <span class="ib-fmts">${t.schedule.formats.map((f) => `<span class="chip">${FORMATS[f]}</span>`).join('')}</span></span>
        </button>`; }).join('')}</div>
      <p class="ib-note">목업 — 실서비스에서는 주제 등록 시 AI 예약 작업(${esc(cronOf({ hour: 9, freq: 'weekly', dow: 1, dom: 1 }))} 형식)을 만들고, 작업이 끝나면 산출물 링크·썸네일이 이 게시판에 자동 등록됩니다.</p>`;
  }

  function topicView(t) {
    const f = S.ui.ibFmt || 'all'; const all = postsOf(t.id); const list = all.filter((p) => f === 'all' || p.format === f);
    const s = t.schedule;
    return `<div class="view-head"><div><button type="button" class="btn sm" data-act="ibBack">← 주제 목록</button><h2 style="margin-top:8px">${esc(t.title)}</h2><p>${esc(t.desc || '')}</p></div>
        <div class="row"><button type="button" class="btn" data-act="ibAddPost">+ 산출물 등록</button><button type="button" class="btn primary" data-act="ibRun" data-id="${t.id}" ${s.formats.length ? '' : 'disabled'}>지금 실행(목업)</button></div></div>
      <section class="panel ib-sched" style="--c:${esc(t.color)}"><h3>AI 예약 작업 <span class="pill ${s.enabled ? 'st-done' : 'st-hold'}">${s.enabled ? '켜짐' : '꺼짐'}</span></h3>
        <div class="ib-sched-row"><div><span class="ib-lab">AI</span><b>${esc(s.ai)}</b></div><div><span class="ib-lab">주기</span><b>${schLabel(s)}</b></div><div><span class="ib-lab">다음 실행</span><b>${nextLabel(s)}</b></div><div><span class="ib-lab">산출물</span><b>${s.formats.map((x) => FORMATS[x]).join(' · ') || '없음'}</b></div></div>
        <p class="ib-prompt"><span class="ib-lab">지시문</span>${esc(s.prompt || '(없음)')}</p>
        <code class="ib-cron">${esc(cronOf(s))}</code>
        <div class="row" style="margin-top:10px"><button type="button" class="btn sm" data-act="ibToggle" data-id="${t.id}">${s.enabled ? '예약 끄기' : '예약 켜기'}</button><button type="button" class="btn sm" data-act="ibEditSched">${S.ui.ibEditSched ? '편집 닫기' : '예약 편집'}</button><button type="button" class="btn sm ib-danger" data-act="ibAskDel">주제 삭제</button></div>
        ${S.ui.ibAskDel ? `<div class="ib-confirm"><span>‘${esc(t.title)}’과 산출물 ${all.length}건을 삭제할까요? 예약 작업도 함께 해제됩니다.</span><span class="row"><button type="button" class="btn sm ib-danger" data-act="ibDelTopic" data-id="${t.id}">삭제</button><button type="button" class="btn sm" data-act="ibCancelDel">취소</button></span></div>` : ''}
        ${S.ui.ibEditSched ? `<form class="form" data-form="ibSchedule" style="margin-top:12px">${schedFields(s)}<div class="wide"><button class="btn primary sm">예약 저장</button></div></form>` : ''}
      </section>
      ${S.ui.ibAddPost ? `<section class="panel"><h3>산출물 직접 등록</h3><form class="form" data-form="ibPost">
          <label class="f wide">제목<input type="text" name="title" required maxlength="60" placeholder="예: 주말 패스 가격 3안 비교"></label>
          <label class="f">형태<select name="format">${Object.entries(FORMATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
          <label class="f">만든 AI<select name="ai">${[...AIS, '직접 작성'].map((a) => `<option>${a}</option>`).join('')}</select></label>
          <label class="f wide">링크(파일·페이지 주소)<input type="url" name="link" placeholder="https://"></label>
          <label class="f wide">한 줄 요약<input type="text" name="summary" maxlength="120"></label>
          <div class="wide row"><button class="btn primary sm">등록</button><button type="button" class="btn sm" data-act="ibAddPost">취소</button></div></form></section>` : ''}
      <section class="panel"><h3>산출물 <span class="ib-lab">${all.length}건</span></h3>
        <div class="seg ib-seg" role="group" aria-label="형태 필터">${[['all', '전체'], ...Object.entries(FORMATS)].map(([k, v]) => `<button type="button" data-act="ibFmt" data-v="${k}" aria-pressed="${k === f}">${v}${k === 'all' ? '' : ` ${all.filter((p) => p.format === k).length}`}</button>`).join('')}</div>
        ${list.length ? `<div class="ib-posts">${list.map((p) => `<button type="button" class="ib-post" data-act="ibPostOpen" data-id="${p.id}">
            <span class="ib-thumb">${thumb(p, t.color)}<span class="ib-fbadge">${FORMATS[p.format]}</span></span>
            <span class="ib-pb"><b>${esc(p.title)}</b><span class="ib-ps">${esc(p.summary || '')}</span>
              <span class="ib-meta"><span>${esc(p.ai)} · ${md(p.created_at)}${p.created_at === S.today ? ' <span class="pill st-wait">새 글</span>' : ''}</span>${p.reviewed ? '<span class="pill st-done">검토 완료</span>' : '<span class="pill">검토 전</span>'}</span></span>
          </button>`).join('')}</div>` : guide('folder', '산출물이 없습니다', '‘지금 실행(목업)’을 누르거나 예약 시간이 되면 AI가 만든 산출물이 여기에 쌓입니다.')}
      </section>
      ${postModal(t)}`;
  }

  function postModal(t) {
    const p = S.ui.ibPost && B.posts.find((x) => x.id === S.ui.ibPost); if (!p) return '';
    return `<div class="ib-modal" role="dialog" aria-modal="true" aria-labelledby="ib-mt"><div class="ib-back" data-act="ibPostClose"></div>
      <div class="ib-sheet"><div class="ib-big">${thumb(p, t.color)}</div>
        <div class="ib-sheet-b"><span class="chip">${FORMATS[p.format]}</span><h3 id="ib-mt">${esc(p.title)}</h3>
          <p>${esc(p.summary || '요약 없음')}</p>
          <p class="ib-lab">${esc(t.title)} · ${esc(p.ai)} · ${esc(p.by || '직접 등록')} · ${esc(p.created_at)}</p>
          <div class="row">${p.link && p.link !== '#' ? `<a class="btn primary sm" href="${esc(p.link)}" target="_blank" rel="noopener">산출물 열기</a>` : '<button type="button" class="btn primary sm" data-act="ibNoLink">산출물 열기</button>'}
            <button type="button" class="btn sm" data-act="ibReview" data-id="${p.id}">${p.reviewed ? '검토 취소' : '검토 완료'}</button>
            <button type="button" class="btn sm ib-danger" data-act="ibDelPost" data-id="${p.id}">삭제</button>
            <button type="button" class="btn sm" data-act="ibPostClose">닫기</button></div>
        </div></div></div>`;
  }

  APP.views.ideabank = () => { const t = S.ui.ibTopic && topicById(S.ui.ibTopic); return t ? topicView(t) : listView(); };

  /* ---------- 동작 ---------- */
  const resetUi = () => { S.ui.ibAddPost = false; S.ui.ibEditSched = false; S.ui.ibAskDel = false; S.ui.ibPost = null; S.ui.ibFmt = 'all'; };
  APP.acts.ibNew = () => { S.ui.ibNew = !S.ui.ibNew; };
  APP.acts.ibCancel = () => { S.ui.ibNew = false; };
  APP.acts.ibOpen = (el) => { S.ui.ibTopic = el.dataset.id; resetUi(); setTimeout(() => window.scrollTo(0, 0), 0); };
  APP.acts.ibBack = () => { S.ui.ibTopic = null; resetUi(); };
  APP.acts.ibFmt = (el) => { S.ui.ibFmt = el.dataset.v; };
  APP.acts.ibAddPost = () => { S.ui.ibAddPost = !S.ui.ibAddPost; };
  APP.acts.ibEditSched = () => { S.ui.ibEditSched = !S.ui.ibEditSched; };
  APP.acts.ibAskDel = () => { S.ui.ibAskDel = true; };
  APP.acts.ibCancelDel = () => { S.ui.ibAskDel = false; };
  APP.acts.ibToggle = (el) => { const s = topicById(el.dataset.id).schedule; s.enabled = !s.enabled; toast(s.enabled ? `예약을 켰습니다 — 다음 실행 ${nextLabel(s)}` : '예약을 껐습니다'); };
  APP.acts.ibDelTopic = (el) => { const id = el.dataset.id; B.topics = B.topics.filter((t) => t.id !== id); B.posts = B.posts.filter((p) => p.topic_id !== id); S.ui.ibTopic = null; resetUi(); toast('주제를 삭제했습니다'); };
  APP.acts.ibPostOpen = (el) => { S.ui.ibPost = el.dataset.id; };
  APP.acts.ibPostClose = () => { S.ui.ibPost = null; };
  APP.acts.ibNoLink = () => toast('목업 산출물이라 열 파일이 없습니다');
  APP.acts.ibReview = (el) => { const p = B.posts.find((x) => x.id === el.dataset.id); p.reviewed = !p.reviewed; };
  APP.acts.ibDelPost = (el) => { B.posts = B.posts.filter((p) => p.id !== el.dataset.id); S.ui.ibPost = null; toast('산출물을 삭제했습니다'); };
  APP.acts.ibRun = (el) => {
    const t = topicById(el.dataset.id); const s = t.schedule;
    const idea = t.seeds && t.seeds.length ? t.seeds[t.seedIdx++ % t.seeds.length] : `${t.title} 아이디어 ${postsOf(t.id).length + 1}`;
    s.formats.forEach((f) => B.posts.push({ id: uid('ip'), topic_id: t.id, title: `${idea}${s.formats.length > 1 ? ' — ' + FORMATS[f] : ''}`, format: f, ai: s.ai, created_at: S.today, summary: `${s.ai}가 지시문에 따라 만든 ${FORMATS[f]} (목업 생성)`, link: '#', reviewed: false, by: '지금 실행' }));
    S.ui.ibFmt = 'all';
    toast(`${s.ai}가 산출물 ${s.formats.length}건을 만들었습니다(목업)`);
  };
  /* Esc 로 상세 닫기 */
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.ui.ibPost) { S.ui.ibPost = null; const c = document.querySelector('.ib-modal'); if (c) c.remove(); APP.save(); } });

  const getter = (fd) => (n) => (fd.get(n) || '').toString().trim();
  APP.forms.ibTopic = (fd) => {
    const g = getter(fd); const sch = readSched(fd, g);
    if (!sch.formats.length) sch.formats = ['cardnews'];
    const t = { id: uid('it'), title: g('title'), desc: g('desc'), color: /^#[0-9A-Fa-f]{6}$/.test(g('color')) ? g('color') : COLORS[0], created_at: S.today, schedule: Object.assign(sch, { enabled: true }), seeds: [], seedIdx: 0 };
    B.topics.unshift(t); S.ui.ibNew = false;
    toast(`‘${t.title}’ 등록 — ${t.schedule.ai} 예약 ${schLabel(t.schedule)} (목업)`);
  };
  APP.forms.ibSchedule = (fd) => {
    const t = topicById(S.ui.ibTopic); const g = getter(fd); const sch = readSched(fd, g);
    if (!sch.formats.length) { toast('산출물 형태를 하나 이상 고르세요'); return; }
    t.schedule = Object.assign(t.schedule, sch); S.ui.ibEditSched = false; toast(`예약을 저장했습니다 — 다음 실행 ${nextLabel(t.schedule)}`);
  };
  APP.forms.ibPost = (fd) => {
    const g = getter(fd); const link = /^https?:\/\//.test(g('link')) ? g('link') : '#';
    B.posts.push({ id: uid('ip'), topic_id: S.ui.ibTopic, title: g('title'), format: FORMATS[g('format')] ? g('format') : 'doc', ai: g('ai'), created_at: S.today, summary: g('summary'), link, reviewed: false, by: '직접 등록' });
    S.ui.ibAddPost = false; toast('산출물을 등록했습니다');
  };
  void clone;
})();
