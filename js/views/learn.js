/* 메뉴: 경영학습 (learn) — 이 메뉴 담당 하위 세션은 이 파일만 고칩니다.
   공용 도구·상태는 window.APP에서 꺼내 씁니다. 새 버튼 동작은 APP.acts['이름'] = (el) => {...},
   새 폼은 APP.forms['이름'] = (fd, form) => {...}, 새 select 변경은 APP.changes['이름'] = (el) => {...} 로 등록합니다.

   보기: 오늘(하루 5분 코스·복습 도전·오답) / 과목 / 숙련도·일정(간격 반복 SRS) / 사례(가상 상황) / 개념 지도 / 주간 리포트 · 오늘 탭 맨 위 '오늘의 경영 한 문장'
   흐름: 과목 선택 → ① 개념 읽기 → ② 퀴즈(정답 무관 XP +1, 해설) → ③ 메모
   복습: 오늘의 복습 도전(최근 7일 50% + 전체 이력 랜덤 50%, 10문제, 하루 여러 번) · 오답 다시 보기
   자료: Global-MMLU 한국어판(Apache-2.0) 문제 + OpenStax(CC BY 4.0) 개념 읽기 — 승인됨.
         이 환경에서는 두 사이트 모두 내려받기가 막혀 있어(프록시 403) 목업 샘플을 유지하고,
         수입 함수(APP.learnImport)와 출처 필드(source·license·source_ref)만 준비해 둔다. */
(function () {
  'use strict';
  const { S, esc, badge, uid, shuffle, toast, dayStr, guide, qById, reviewSet, md } = window.APP;

  /* ---------- 개념 읽기 (목업 요약) ----------
     Claude가 자기 말로 쓴 짧은 요약이다. 교재 문장을 옮기지 않았다.
     실제 수입 때 OpenStax 해당 장 요약 번역으로 바꾸고, planned 의 원문 ID를 source_ref 로 채운다. */
  const MOCK_SRC = { source: '목업 요약(Claude 작성)', license: '목업 전용', source_ref: '-' };
  const C = (id, subject, title, units, lead, points, apply, book) => ({ id, subject, title, units, lead, points, apply, ...MOCK_SRC, planned: { source: 'OpenStax ' + book, license: 'CC BY 4.0' } });
  S.learnConcepts = [
    C('c1', '경영전략', '경쟁우위는 어디서 오는가', ['경쟁전략', '산업분석', '포트폴리오'],
      '전략은 “어디서 싸울지”와 “어떻게 이길지” 두 질문에 답하는 일입니다.',
      ['산업의 수익성은 경쟁자·신규 진입자·대체재·공급자·구매자 다섯 힘의 세기로 정해진다.', '이기는 방법은 크게 더 싸게(원가우위), 다르게(차별화), 좁은 시장에 집중하는 것으로 나뉜다.', '여러 사업을 가진 회사는 성장성과 점유율로 사업을 나눠 투자·회수 순서를 정한다.'],
      '우리 브랜드 중 하나를 골라, 원가와 차별화 중 무엇으로 이기고 있는지 한 줄로 적어 보세요.', 'Principles of Management · 전략 관련 장'),
    C('c2', '조직·인사', '사람을 움직이는 두 가지 힘', ['동기부여', '조직구조', '리더십'],
      '불만을 없애는 요인과 의욕을 만드는 요인은 서로 다릅니다.',
      ['급여·근무환경은 부족하면 불만이 생기지만, 넉넉하다고 의욕이 저절로 생기지는 않는다.', '성취·인정·일의 의미가 실제 의욕을 끌어올린다.', '같은 리더라도 구성원의 숙련도에 따라 지시형 → 코칭형 → 지원형 → 위임형으로 바꿔야 한다.'],
      '최근 칭찬한 직원에게 준 것이 위생요인이었는지 동기요인이었는지 돌아보세요.', 'Organizational Behavior · 동기부여 장'),
    C('c3', '마케팅', '누구에게, 무엇으로 기억될 것인가', ['STP', '가격', '고객관리'],
      '모든 사람을 고객으로 삼으면 아무에게도 기억되지 않습니다.',
      ['시장을 나누고(세분화), 이길 곳을 고르고(목표 설정), 고객 머릿속 위치를 정한다(포지셔닝).', '신제품 가격은 높게 시작해 내리거나(초기 고가), 낮게 들어가 점유율을 먼저 잡는다(침투).', '한 고객이 오래 남을수록 신규 획득 비용보다 큰 가치가 쌓인다.'],
      '벌툰 매장의 핵심 고객을 한 문장으로 정의해 보세요.', 'Principles of Marketing · 세분화·포지셔닝 장'),
    C('c4', '회계', '숫자로 회사를 읽는 첫걸음', ['재무제표', '원가', '손익분기'],
      '재무제표는 회사의 사진(재무상태)과 영상(손익)입니다.',
      ['자산은 남의 돈(부채)과 내 돈(자본)으로 마련한다.', '매출이 늘어도 총액이 그대로인 비용(고정비)과 함께 늘어나는 비용(변동비)을 구분한다.', '고정비를 단위당 공헌이익으로 나누면 손익분기 판매량이 나온다.'],
      '한 매장의 월 고정비를 떠올리고, 하루 몇 잔·몇 그릇을 팔아야 본전인지 계산해 보세요.', 'Introduction to Business · 회계 장'),
    C('c5', '재무', '오늘의 1원과 내일의 1원', ['화폐의 시간가치', '투자결정', '레버리지'],
      '돈은 시간이 지나면 가치가 달라집니다. 투자 판단은 이 차이를 계산하는 일입니다.',
      ['미래 돈을 오늘 가치로 바꿀 때 할인율이 높을수록 현재가치는 작아진다.', '순현재가치(NPV)가 0보다 크면 요구수익률보다 더 버는 투자다.', '빚을 늘리면 이익의 출렁임(재무위험)이 커진다.'],
      '검토 중인 신사업 하나의 회수 기간과 요구수익률을 적어 보세요.', 'Introduction to Business · 재무 장'),
    C('c6', '경제', '가격은 수요와 공급이 만난 자리', ['수요공급', '탄력성', '거시경제'],
      '가격 변화에 손님이 얼마나 민감한지 알면 가격 정책이 쉬워집니다.',
      ['대체재가 비싸지면 우리 상품 수요 자체가 늘어난다(곡선 이동).', '가격에 민감한 상품은 값을 내리면 총매출이 늘 수 있다.', '기준금리가 오르면 소비·투자가 줄어 물가 압력이 누그러진다.'],
      '우리 메뉴 중 가격에 민감한 것과 둔감한 것을 하나씩 꼽아 보세요.', 'Principles of Economics · 수요와 공급 장'),
    C('c7', '운영관리', '흐름을 막는 한 곳을 찾아라', ['재고', '품질', '공정'],
      '전체 속도는 가장 느린 공정이 정합니다.',
      ['병목공정의 처리능력이 시스템 전체 산출량을 결정한다.', '주문비용과 보관비용의 균형점에서 한 번에 주문할 양을 정한다.', '문제 해결은 정의 → 측정 → 분석 → 개선 → 관리 순서로 한다.'],
      '매장 피크 시간에 줄이 생기는 지점(병목)이 어디인지 적어 보세요.', 'Introduction to Business · 운영관리 장'),
    C('c8', '경영정보·AI', 'AI를 믿되 확인하라', ['AI 활용', '데이터', '정보시스템'],
      '좋은 정보시스템은 적은 숫자를, 출처와 함께 보여 줍니다.',
      ['생성형 AI는 그럴듯한 오답을 낼 수 있어 근거 문서 연결과 출처 확인이 필요하다.', '핵심 지표는 소수로 두고 정의·출처·신뢰도(측정/추정)를 함께 적는다.', '전사 시스템을 하나로 묶으면 부서 간 숫자 맞추기 시간이 줄어든다.'],
      '이 현황판 숫자 중 “추정”을 “측정”으로 바꾸려면 무엇이 필요한지 적어 보세요.', 'Introduction to Business · 정보시스템 장'),
    C('c9', '기업윤리', '이익과 책임의 순서', ['CSR', '이해관계자', '지배구조'],
      '돈을 버는 것이 첫 책임이지만 유일한 책임은 아닙니다.',
      ['기업의 책임은 경제적 → 법적 → 윤리적 → 자선적 순으로 쌓인다.', '주주뿐 아니라 직원·고객·가맹점·지역사회도 이해관계자다.', '이사회 독립성과 투명성은 지배구조(G)의 핵심이다.'],
      '가맹점과의 관계에서 법보다 한 걸음 더 나간 약속이 있는지 적어 보세요.', 'Principles of Management · 윤리 장')
  ];
  const conceptById = (id) => S.learnConcepts.find((c) => c.id === id);

  S.learnNotes = S.learnNotes || [
    { id: 'ln1', at: dayStr(-2), subject: '경영전략', cid: 'c1', text: '생전포차는 가격보다 분위기 차별화 쪽. 원가우위로 싸우면 안 됨.' }
  ];
  S.learnReviewRuns = S.learnReviewRuns || [];

  /* ---------- 공개 데이터 수입 준비 ----------
     실제 파일을 받으면 아래 함수로 한 줄씩 바꿔 S.questions / S.learnConcepts 에 넣는다.
     필드명은 수입 직전 데이터 카드에서 다시 확인한다. */
  const MMLU_SUBJECT = { management: '경영전략', marketing: '마케팅', professional_accounting: '회계', high_school_macroeconomics: '경제', high_school_microeconomics: '경제', econometrics: '경제', business_ethics: '기업윤리' };
  APP.learnImport = {
    MMLU_SUBJECT,
    fromGlobalMMLU(row) {
      const subject = MMLU_SUBJECT[row.subject]; if (!subject) return null;
      return {
        id: 'gm-' + row.sample_id, subject, unit: row.subject, stem: row.question,
        choices: [row.option_a, row.option_b, row.option_c, row.option_d],
        answer: 'ABCD'.indexOf(String(row.answer).trim().toUpperCase()),
        explanation: '', explanation_ai: false,
        source: 'Global-MMLU (CohereLabs) · ko', license: 'Apache-2.0', source_ref: String(row.sample_id)
      };
    },
    fromOpenStax(sec) {
      return { id: 'os-' + sec.ref, subject: sec.subject, title: sec.title, units: sec.units || [], lead: sec.lead || '', points: sec.points || [], apply: sec.apply || '', source: 'OpenStax ' + sec.book, license: 'CC BY 4.0', source_ref: sec.ref, url: sec.url || '' };
    }
  };

  /* ---------- 메뉴 연결 약속(공용 상태) ---------- */
  S.activity = S.activity || [];
  S.inbox = S.inbox || [];
  if (!S.learnInboxSeeded) {
    S.learnInboxSeeded = true;
    S.inbox.push({ id: uid('ib'), at: new Date().toISOString(), from: 'directives', to: 'learn', kind: '학습 추천', title: '지시 「벌툰 가맹점 월 고정비 절감안」과 이어지는 회계 · 손익분기 복습', payload: { subject: '회계' }, done: false });
  }
  const MENU_KO = { today: '오늘 할 일', numbers: '내가 보는 숫자', directives: '지시 관리', ideas: '신사업', value: '성과·레벨', learn: '경영학습', ai: 'AI 사용', ops: '경영 현황', ideabank: '아이디어뱅크', rules: '보상 기준' };
  const logAct = (type, text, ref) => { S.activity.push({ id: uid('ac'), at: new Date().toISOString(), menu: 'learn', type, text, ref: ref || '' }); if (S.activity.length > 300) S.activity.splice(0, S.activity.length - 300); };

  /* ---------- 날짜: 오늘 기준 '며칠 차이'(정수)로만 계산 — 시간대 차이로 하루가 밀리지 않게 ---------- */
  const mid = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const offOf = (iso) => Math.round((mid(iso) - mid(Date.now())) / 864e5);
  const rel = (o) => (o < 0 ? `${-o}일 지남` : o === 0 ? '오늘' : o === 1 ? '내일' : `${o}일 뒤`);

  /* ---------- 간격 반복(SRS) — 풀이 이력에서 매번 계산(따로 저장하지 않음) ----------
     맞히면 간격 1 → 3 → (직전 간격 × 쉬움 정도)일로 늘리고, 틀리면 1일로 되돌림. 같은 날 다시 맞힌 것은 간격을 늘리지 않음. */
  function srs() {
    const st = {};
    S.attempts.slice().sort((a, b) => a.at.localeCompare(b.at)).forEach((a) => {
      const o = offOf(a.at);
      const s = st[a.question_id] || (st[a.question_id] = { reps: 0, interval: 0, ease: 2.5, lapses: 0, lastOff: null, lastOk: null, n: 0, ok: 0 });
      s.n += 1; if (a.correct) s.ok += 1;
      if (a.correct) {
        if (s.lastOff === o && s.lastOk) return;
        s.reps += 1; s.interval = s.reps === 1 ? 1 : s.reps === 2 ? 3 : Math.round(s.interval * s.ease); s.ease = Math.min(3, +(s.ease + 0.1).toFixed(2));
      } else { s.reps = 0; s.interval = 1; s.ease = Math.max(1.3, +(s.ease - 0.2).toFixed(2)); s.lapses += 1; }
      s.lastOff = o; s.lastOk = a.correct; s.dueOff = o + s.interval;
    });
    Object.values(st).forEach((s) => { s.level = !s.lastOk ? 1 : s.interval >= 7 ? 3 : s.interval >= 3 ? 2 : 1; });
    return st;
  }
  const LV = ['미학습', '익히는 중', '자리 잡는 중', '익힘'];

  /* ---------- 하루 5분 코스: 복습할 때가 된 문항(최대 3) + 새 문항으로 5문제 ---------- */
  function buildCourse(exclude) {
    exclude = exclude || [];
    const st = srs(); const ok = (id) => qById(id) && !exclude.includes(id);
    const due = Object.keys(st).filter((id) => ok(id) && st[id].dueOff <= 0).sort((a, b) => st[a].dueOff - st[b].dueOff);
    const fresh = shuffle(S.questions.filter((q) => !st[q.id] && ok(q.id)).map((q) => q.id));
    let list = due.slice(0, 3); list = list.concat(fresh.slice(0, 5 - list.length));
    if (list.length < 5) list = list.concat(due.filter((id) => !list.includes(id)).slice(0, 5 - list.length));
    if (list.length < 5) list = list.concat(shuffle(S.questions.map((q) => q.id).filter((id) => ok(id) && !list.includes(id))).slice(0, 5 - list.length));
    return { day: S.today, list, due: list.filter((id) => due.includes(id)), round: 1 };
  }
  function course() {
    if (!S.learnCourse || S.learnCourse.day !== S.today || S.learnCourse.list.some((id) => !qById(id))) S.learnCourse = buildCourse();
    const c = S.learnCourse;
    const doneIds = new Set(S.attempts.filter((a) => a.mode === '5분코스' && offOf(a.at) === 0).map((a) => a.question_id));
    return Object.assign({}, c, { remaining: c.list.filter((id) => !doneIds.has(id)) });
  }

  /* ---------- 도우미 ---------- */
  const NUM = '①②③④';
  const refOf = (x) => (x.source_ref && x.source_ref !== '-' ? x.source_ref : '목업-' + x.id);
  const srcLine = (x) => `출처: ${esc(x.source)} · 라이선스: ${esc(x.license)} · 원문 ID: <span class="num">${esc(refOf(x))}</span>`;
  const aiBadge = (q) => (q.explanation_ai ? '<span class="b e">AI 생성 해설</span><span class="b u">목업 AI</span>' : '');
  const qLabel = (q) => (q.situation ? `[사례] ${q.title} — ${q.stem}` : q.stem);
  const lastChosen = (qid) => { const a = S.attempts.filter((x) => x.question_id === qid && x.chosen != null).pop(); return a ? a.chosen : null; };
  const subjStats = (s, st) => {
    const qs = S.questions.filter((q) => q.subject === s); const ids = new Set(qs.map((q) => q.id));
    const at = S.attempts.filter((a) => ids.has(a.question_id));
    return { qs, done: qs.filter((q) => st[q.id]).length, rate: at.length ? Math.round(100 * at.filter((a) => a.correct).length / at.length) : null };
  };
  const steps = (on) => `<ol class="ln-steps" aria-label="학습 단계">${['개념 읽기', '퀴즈', '메모'].map((t, i) => `<li class="${i + 1 === on ? 'on' : i + 1 < on ? 'done' : ''}" ${i + 1 === on ? 'aria-current="step"' : ''}><span class="num">${i + 1}</span>${t}</li>`).join('')}</ol>`;
  const memoForm = (subject, cid, label) => `<form class="ln-memo" data-form="learnMemo">
      <input type="hidden" name="subject" value="${esc(subject || '')}"><input type="hidden" name="cid" value="${esc(cid || '')}">
      <label class="f">${label}<textarea name="text" required maxlength="300" placeholder="예: 우리 매장에 적용하면 — "></textarea></label>
      <div class="row"><button class="btn primary sm">메모 저장</button></div></form>`;
  const MODE_LOG = { review: '복습도전', course: '5분코스', case: '사례' };
  const startQuiz = (mode, ids, origin, extra) => { S.ui.quiz = Object.assign({ mode, list: ids.map((id) => ({ qid: id, origin: typeof origin === 'function' ? origin(id) : origin })), idx: 0, answers: {} }, extra || {}); clearSide(); setTimeout(top, 0); };

  /* ---------- 화면: 퀴즈 ---------- */
  function viewQuiz(qz) {
    const item = qz.list[qz.idx]; const q = qById(item.qid); const ans = qz.answers[qz.idx];
    const originLabel = { recent: '최근 7일', random: '전체 이력 랜덤', new: '새 문제', fresh: '새 문항', due: '복습할 때', study: q.subject }[item.origin] || q.subject;
    const title = { review: '오늘의 복습 도전', wrong: '오답 다시 풀기', mix: '섞어 풀기', course: '하루 5분 코스', unit: `${q.subject} · ${q.unit}`, case: '사례 문제' }[qz.mode] || q.subject;
    const last = qz.idx + 1 >= qz.list.length;
    const s = ans != null ? srs()[q.id] : null;
    return `<section class="panel ln-quiz">
      ${qz.flow ? steps(2) : ''}
      <div class="row ln-qtop"><b>${esc(title)} · <span class="num">${qz.idx + 1}/${qz.list.length}</span></b><button type="button" class="btn sm" data-act="learnFinish">그만하기</button></div>
      <div class="progress" style="margin:10px 0" aria-hidden="true">${qz.list.map((it, k) => `<span class="${qz.answers[k] != null ? 'done' : ''} ${qz.mode === 'review' && it.origin === 'recent' ? 'recent' : ''}"></span>`).join('')}</div>
      ${qz.mode === 'review' ? '<p class="small muted" style="margin:0">테두리 있는 칸 = 최근 7일 문제</p>' : ''}
      <div class="small muted ln-qmeta">${esc(q.unit)} · <span class="chip">${esc(originLabel)}</span></div>
      ${q.situation ? `<div class="ln-case"><b>상황</b><p>${esc(q.situation)}</p></div>` : ''}
      <div class="q-stem">${esc(q.stem)}</div>
      <div class="choices">${q.choices.map((c, k) => `<button type="button" class="choice ${ans != null ? (k === q.answer ? 'right' : k === ans ? 'wrong' : '') : ''}" data-act="learnAnswer" data-k="${k}" ${ans != null ? 'disabled' : ''}>${NUM[k]} ${esc(c)}${ans != null && k === q.answer ? ' <b class="ln-mark">정답</b>' : ans === k && k !== q.answer ? ' <b class="ln-mark">내 답</b>' : ''}</button>`).join('')}</div>
      ${ans != null ? `<div class="explain" role="status"><b>${ans === q.answer ? '정답입니다' : `오답 — 정답은 ${NUM[q.answer]}. 다시 보기 목록에 담았습니다`}</b> · XP +1
          <p style="margin:6px 0">${esc(q.explanation || '해설 준비 중')}</p>
          ${s ? `<p class="ln-next">다음 복습: <b>${rel(s.dueOff)}</b> <span class="small muted">(${ans === q.answer ? '맞혀서 간격을 늘렸습니다' : '틀려서 내일 다시 나옵니다'} · ${badge('측정')})</span></p>` : ''}
          <div class="row small muted">${aiBadge(q)}<span>${srcLine(q)}</span></div></div>
        <div class="row" style="margin-top:12px">${last ? `<button type="button" class="btn primary" data-act="learnFinish">${qz.flow ? '메모 남기고 마치기' : '결과 보고 마치기'}</button>` : '<button type="button" class="btn primary" data-act="nextQ">다음 문제</button>'}</div>` : ''}
    </section>`;
  }

  /* ---------- 화면: 개념 읽기 ---------- */
  function viewRead(c) {
    const qs = S.questions.filter((q) => q.subject === c.subject && !q.situation);
    const notes = S.learnNotes.filter((n) => n.cid === c.id).slice().reverse();
    const idx = S.learnConcepts.indexOf(c); const next = S.learnConcepts[(idx + 1) % S.learnConcepts.length];
    return `<section class="panel ln-read">
      ${steps(1)}
      <div class="row ln-qtop"><span class="chip">${esc(c.subject)}</span><button type="button" class="btn sm" data-act="learnHome">← 돌아가기</button></div>
      <h3 class="ln-title">${esc(c.title)}</h3>
      <p class="ln-lead">${esc(c.lead)}</p>
      <ol class="ln-points">${c.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ol>
      <div class="ln-apply"><b>현장에 대어 보기</b><p>${esc(c.apply)}</p></div>
      <p class="small muted ln-src">${srcLine(c)}<br>수입 예정: ${esc(c.planned.source)} (${esc(c.planned.license)}) 요약 번역으로 교체</p>
      <div class="row" style="margin-top:14px"><button type="button" class="btn primary" data-act="learnFlowQuiz" data-v="${c.id}">② 퀴즈로 확인하기 (${qs.length}문제)</button><button type="button" class="btn" data-act="learnRead" data-v="${next.id}">다음 개념: ${esc(next.subject)}</button></div>
    </section>
    <section class="panel"><h3>이 개념 메모 <span class="small muted num">${notes.length}</span></h3>
      ${notes.length ? `<ul class="ln-notes">${notes.map(noteLi).join('')}</ul>` : ''}
      ${memoForm(c.subject, c.id, '읽으면서 떠오른 점')}</section>`;
  }

  const noteLi = (n) => { const c = n.cid && conceptById(n.cid); return `<li><div class="small muted"><span class="num">${md(n.at)}</span> · ${esc(n.subject || '공통')}${c ? ' · ' + esc(c.title) : ''}</div><div class="ln-note-row"><span>${esc(n.text)}</span>${S.ui.learnDelNote === n.id ? `<span class="row ln-confirm"><b class="small">지울까요?</b><button type="button" class="btn sm" data-act="learnDelNote" data-id="${n.id}">삭제</button><button type="button" class="btn sm" data-act="learnDelCancel">취소</button></span>` : `<button type="button" class="btn sm" data-act="learnDelAsk" data-id="${n.id}" aria-label="메모 삭제">삭제</button>`}</div></li>`; };

  /* ---------- P2: 사례 문제 (Claude가 직접 지은 가상 상황 · 사내 실제 수치 아님) ---------- */
  const CASE_SRC = { source: '사례 문제(Claude 작성 · 가상 상황)', license: '사내 학습용 자체 제작', explanation_ai: true };
  const CASE_POS = [2, 0, 3, 1, 2, 0, 3, 1, 0]; // 정답 위치가 한쪽으로 몰리지 않게 섞어 둔다(고정값)
  const K = (n, subject, title, situation, stem, choices, answer, explanation, cid) => {
    const t = CASE_POS[(n - 1) % CASE_POS.length]; const right = choices[answer]; const others = choices.filter((_, i) => i !== answer);
    const ch = others.slice(); ch.splice(t, 0, right);
    return { id: 'cs' + n, subject, unit: '사례', title, situation, stem, choices: ch, answer: t, explanation, cid, ...CASE_SRC, source_ref: 'case-' + n };
  };
  const CASES = [
    K(1, '경영전략', '저가 경쟁점이 들어왔다', '가상의 분식 브랜드 A의 한 매장 근처에 저가 분식점이 세 곳 새로 생겼습니다. A 매장은 재료 품질과 깔끔한 매장 분위기로 단골이 많은 편입니다.', '점주에게 가장 알맞은 첫 대응은?', ['경쟁점보다 가격을 더 낮춘다', '품질·분위기라는 강점을 더 분명히 드러낸다', '메뉴 구성을 경쟁점과 똑같이 맞춘다', '당분간 홍보를 모두 멈춘다'], 1, '원가 구조가 다른 저가점과 가격으로 싸우면 이익만 줄어듭니다. 이미 가진 차별점(품질·분위기)을 강화해 단골이 떠날 이유를 없애는 것이 먼저입니다.', 'c1'),
    K(2, '조직·인사', '첫날부터 "알아서 해 봐"', '가상의 카페 B 점장은 바빠서 첫 출근한 아르바이트생에게 "보고 알아서 해 보라"고 맡겼습니다. 일주일째 주문 실수가 잦습니다.', '상황에 맞는 리더십 관점에서 점장이 바꿀 점은?', ['더 많은 일을 맡겨 스스로 익히게 한다', '처음에는 순서를 구체적으로 알려 주고 시범을 보인다', '실수할 때마다 급여에서 차감한다', '숙련자가 될 때까지 계산대에서 뺀다'], 1, '경험이 적은 구성원에게는 위임보다 구체적인 지시와 시범이 맞습니다. 익숙해지면 코칭 → 지원 → 위임으로 단계를 옮깁니다.', 'c2'),
    K(3, '마케팅', '신메뉴 가격 정하기', '가상의 디저트 브랜드 C가 새 메뉴를 냅니다. 새로운 맛을 먼저 찾아다니는 단골층이 뚜렷하고, 비슷한 메뉴를 파는 경쟁점은 아직 없습니다.', '처음 가격을 정하는 방법으로 가장 알맞은 것은?', ['처음부터 가장 낮은 가격으로 시작한다', '처음엔 높게 시작해 반응을 보며 단계적으로 조정한다', '경쟁 메뉴가 생길 때까지 출시를 미룬다', '원가에 상관없이 기존 메뉴와 같은 가격으로 맞춘다'], 1, '먼저 사려는 고객이 있고 경쟁이 없을 때는 초기 고가로 시작해 그 지불의사를 반영한 뒤, 경쟁이 생기면 가격을 조정하는 방식이 맞습니다.', 'c3'),
    K(4, '회계', '하루 몇 그릇이면 본전인가', '가상의 국밥 매장 D의 월 고정비(임차료·인건비 등)는 1,200만원이고, 한 그릇을 팔 때 남는 공헌이익은 4,000원입니다. 한 달은 30일 영업으로 봅니다. (숫자는 연습용 가정)', '하루에 몇 그릇을 팔아야 손익분기점인가?', ['50그릇', '100그릇', '300그릇', '1,000그릇'], 1, '월 손익분기 판매량 = 1,200만 ÷ 4,000 = 3,000그릇. 30일로 나누면 하루 100그릇입니다.', 'c4'),
    K(5, '재무', '리모델링을 할까', '가상의 매장 E가 리모델링에 2,000만원을 쓰려 합니다. 늘어날 현금흐름을 요구수익률로 할인해 오늘 가치로 합하면 2,300만원입니다. (숫자는 연습용 가정)', '이 투자에 대한 판단으로 옳은 것은?', ['NPV가 -300만원이라 하지 않는다', 'NPV가 +300만원이라 해 볼 만하다', '회수 기간을 모르면 아무 판단도 할 수 없다', '회계이익이 날 때까지 기다린다'], 1, 'NPV = 2,300만 − 2,000만 = +300만원. 요구수익률보다 더 버는 투자라 가치가 늘어납니다. 다만 현금흐름 추정이 맞는지는 따로 점검합니다.', 'c5'),
    K(6, '경제', '옆 가게 커피값이 올랐다', '가상의 베이커리 F 옆 카페가 커피 가격을 크게 올렸습니다. F도 커피를 팔고, 두 가게 손님층은 많이 겹칩니다.', 'F가 예상하고 준비할 일로 가장 알맞은 것은?', ['커피 수요가 줄 것이니 원두 주문을 줄인다', '대체재가 비싸졌으니 F의 커피 수요가 늘 수 있어 재고·인력을 미리 챙긴다', '가격 변화는 F와 관계없다', '같이 가격을 올려야만 한다'], 1, '대체재 가격이 오르면 우리 상품의 수요 자체가 늘어납니다(수요곡선 이동). 늘어날 손님에 맞춰 준비하는 것이 먼저입니다.', 'c6'),
    K(7, '운영관리', '점심 줄이 줄지 않는다', '가상의 덮밥 매장 G는 점심마다 줄이 깁니다. 키오스크 주문은 금방 끝나는데, 조리대 한 곳에서 주문이 계속 밀립니다.', '줄을 줄이려면 어디부터 손봐야 하는가?', ['키오스크를 한 대 더 들인다', '병목인 조리 공정(인원·순서·미리 손질)을 먼저 보강한다', '메뉴 사진을 바꾼다', '좌석을 늘린다'], 1, '전체 속도는 가장 느린 공정이 정합니다. 이미 빠른 주문 단계를 늘려도 조리대 앞 대기만 길어집니다.', 'c7'),
    K(8, '경영정보·AI', 'AI 보고서에 없던 행사가 나왔다', '가상의 가맹점주 H가 AI로 만든 월간 매출 분석을 받았습니다. 그런데 보고서에 지난달 하지도 않은 할인 행사 효과가 적혀 있습니다.', '가장 알맞은 대응은?', ['AI가 썼으니 그대로 본사에 올린다', '원자료(POS 매출·행사 기록)와 대조해 틀린 부분을 고친 뒤 쓴다', '보고서 전체를 버리고 AI를 다시는 쓰지 않는다', '행사를 실제로 했다고 기록을 바꾼다'], 1, '생성형 AI는 그럴듯한 오답을 낼 수 있습니다. 근거 자료와 대조해 확인하는 절차를 두면 AI의 속도와 정확성을 함께 얻습니다.', 'c8'),
    K(9, '기업윤리', '원재료를 몰래 바꾸자는 의견', '가상의 프랜차이즈 본사 I에서 더 싼 원재료로 바꾸면 이익이 늘지만 맛이 조금 달라질 수 있다는 검토가 나왔습니다. "가맹점에는 알리지 말자"는 의견이 있습니다.', '가장 책임 있는 결정 방식은?', ['알리지 않고 바로 바꾼다', '변경 이유와 영향을 가맹점에 알리고 시험 운영·협의를 거친다', '이익이 늘면 무엇이든 괜찮다', '불만이 나오면 그때 생각한다'], 1, '가맹점은 핵심 이해관계자입니다. 투명하게 알리고 함께 검증해야 장기적인 신뢰와 브랜드 품질을 지킬 수 있습니다.', 'c9')
  ];
  CASES.forEach((cq) => { const i = S.questions.findIndex((q) => q.id === cq.id); if (i >= 0) S.questions[i] = cq; else S.questions.push(cq); });

  /* ---------- P2: 개념 연결 지도 (관계 설명은 직접 작성) ---------- */
  const LINKS = [
    ['c1', 'c3', '포지셔닝은 경쟁전략을 고객의 말로 옮긴 것이다'],
    ['c1', 'c5', '어느 사업에 돈을 더 넣을지는 NPV로 검증한다'],
    ['c4', 'c5', '손익·원가 숫자가 투자 판단의 재료가 된다'],
    ['c4', 'c7', '변동비를 줄일 곳은 대개 공정 안에 있다'],
    ['c6', 'c3', '손님의 가격 민감도가 가격 전략을 정한다'],
    ['c6', 'c5', '금리가 오르면 할인율도 오르고 투자 기준이 높아진다'],
    ['c2', 'c7', '현장 의욕이 품질과 속도를 만든다'],
    ['c2', 'c9', '공정한 보상과 투명한 지배구조가 신뢰를 만든다'],
    ['c8', 'c7', '데이터로 병목을 찾고 개선 효과를 잰다'],
    ['c8', 'c2', 'AI 도입은 사람의 일하는 방식부터 바꾼다'],
    ['c9', 'c1', '책임 있는 경영은 오래 가는 경쟁우위가 된다'],
    ['c3', 'c4', '고객생애가치는 공헌이익 위에서 계산된다']
  ];
  const SHORT = { '경영전략': '전략', '조직·인사': '조직', '경영정보·AI': '정보·AI', '기업윤리': '윤리', '운영관리': '운영' };
  function viewConceptMap() {
    const sel = conceptById(S.ui.learnMapSel) || S.learnConcepts[0];
    const N = S.learnConcepts.length; const cx = 210; const cy = 175; const R = 135;
    const pos = {}; S.learnConcepts.forEach((c, i) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / N; pos[c.id] = [cx + R * Math.cos(a), cy + R * Math.sin(a)]; });
    const on = (l) => l[0] === sel.id || l[1] === sel.id;
    const mine = LINKS.filter(on).map((l) => ({ other: conceptById(l[0] === sel.id ? l[1] : l[0]), text: l[2] }));
    const lines = LINKS.map((l) => `<line x1="${pos[l[0]][0].toFixed(1)}" y1="${pos[l[0]][1].toFixed(1)}" x2="${pos[l[1]][0].toFixed(1)}" y2="${pos[l[1]][1].toFixed(1)}" class="${on(l) ? 'on' : ''}"/>`).join('');
    const nodes = S.learnConcepts.map((c) => { const [x, y] = pos[c.id]; const isSel = c.id === sel.id; const lit = isSel || mine.some((m) => m.other.id === c.id); return `<g class="ln-node ${isSel ? 'sel' : lit ? 'lit' : ''}" data-act="learnMapSel" data-v="${c.id}" role="button" tabindex="0" aria-label="${esc(c.subject)} 개념 선택"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${isSel ? 34 : 29}"/><text x="${x.toFixed(1)}" y="${(y + 5).toFixed(1)}" text-anchor="middle">${esc(SHORT[c.subject] || c.subject)}</text></g>`; }).join('');
    return `<section class="panel"><h3>개념 연결 지도</h3>
        <p class="small muted" style="margin:0 0 6px">원을 누르면 그 개념과 이어진 개념이 밝아집니다. 연결 설명은 Claude가 직접 쓴 목업입니다 ${'<span class="b u">목업 AI</span>'}</p>
        <div class="ln-cmap"><svg viewBox="0 0 420 350" role="img" aria-label="경영 개념 9개와 그 관계">${lines}${nodes}</svg>
        <div class="ln-cmap-side"><span class="chip">${esc(sel.subject)}</span><h3 class="ln-title" style="margin-top:8px">${esc(sel.title)}</h3><p class="ln-lead">${esc(sel.lead)}</p>
          <ul class="ln-links">${mine.map((m) => `<li><button type="button" class="ln-linkbtn" data-act="learnMapSel" data-v="${m.other.id}"><b>${esc(m.other.subject)}</b><span>${esc(m.text)}</span></button></li>`).join('')}</ul>
          <div class="row"><button type="button" class="btn sm primary" data-act="learnRead" data-v="${sel.id}">개념 읽기</button><button type="button" class="btn sm" data-act="learnFlowQuiz" data-v="${sel.id}">퀴즈</button>${CASES.some((k) => k.cid === sel.id) ? `<button type="button" class="btn sm" data-act="learnCase" data-v="${CASES.find((k) => k.cid === sel.id).id}">사례 문제</button>` : ''}</div></div></div>
      </section>`;
  }

  function viewCases(st) {
    const solved = CASES.filter((k) => st[k.id]).length;
    return `<section class="panel"><div class="row" style="justify-content:space-between"><div><h3>사례 문제 <span class="b u">가상 상황</span></h3>
        <p class="small muted" style="margin:4px 0 0">프랜차이즈·매장 경영에서 흔히 생길 만한 상황을 Claude가 직접 지었습니다. 숫자는 모두 연습용 가정이며 사내 실제 자료가 아닙니다.</p></div>
        <button type="button" class="btn primary" data-act="learnCaseAll">사례 ${CASES.length}문제 풀기</button></div>
        <p class="small" style="margin:10px 0 0">푼 사례 <b class="num">${solved}/${CASES.length}</b> ${badge('측정')}</p></section>
      <div class="ln-cases">${CASES.map((k) => { const s = st[k.id]; return `<article class="ln-casecard">
          <div class="row" style="justify-content:space-between"><span class="chip">${esc(k.subject)}</span>${s ? `<span class="small ${s.lastOk ? 'ln-ok' : 'ln-ng'}">${s.lastOk ? '맞힘' : '다시 보기'} · 다음 ${rel(s.dueOff)}</span>` : '<span class="small muted">안 푼 사례</span>'}</div>
          <h4>${esc(k.title)}</h4><p>${esc(k.situation)}</p>
          <div class="row"><button type="button" class="btn sm primary" data-act="learnCase" data-v="${k.id}">풀기</button><button type="button" class="btn sm" data-act="learnRead" data-v="${k.cid}">관련 개념</button></div></article>`; }).join('')}</div>`;
  }

  /* ---------- P3: 오늘의 경영 한 문장 (모두 직접 작성 · 남의 글 인용 아님) ---------- */
  const LINES = [
    ['숫자는 결과이고, 습관이 원인이다.', '이번 주 우리 회사가 바꾼 습관은 무엇인가?'],
    ['가장 느린 공정이 회사 전체의 속도다.', '지금 우리 일의 병목은 어디인가?'],
    ['좋은 지시에는 완료 조건이 한 줄로 적혀 있다.', '오늘 내린 지시의 완료 조건은 분명한가?'],
    ['싸게 팔지, 다르게 팔지를 먼저 정해야 나머지가 정해진다.', '우리 브랜드는 어느 쪽인가?'],
    ['측정하지 않은 개선은 느낌일 뿐이다.', '이번 개선을 무엇으로 잴 것인가?'],
    ['가맹점이 돈을 벌어야 본사도 오래 간다.', '가맹점 이익을 높일 작은 한 가지는?'],
    ['회의가 끝나면 누가, 언제까지, 무엇을 할지가 남아야 한다.', '오늘 회의에서 남은 것은 무엇인가?'],
    ['고정비는 늘리기는 쉽고 줄이기는 어렵다.', '지금 늘리려는 고정비는 꼭 필요한가?'],
    ['AI에게 맡긴 일도 마지막 확인은 사람이 한다.', '확인 없이 쓰고 있는 AI 결과물은 없는가?'],
    ['칭찬은 구체적일수록 다시 일어난다.', '오늘 누구의 어떤 행동을 칭찬할 것인가?'],
    ['새 사업은 작게 시험하고 크게 배운다.', '가장 싸게 검증할 방법은 무엇인가?'],
    ['이익은 장부에 남고 현금은 통장에 남는다. 둘 다 봐야 한다.', '이번 달 현금 흐름은 이익과 같은 방향인가?'],
    ['브랜드는 약속을 지킨 횟수만큼 쌓인다.', '고객과의 약속 중 자주 어기는 것은?'],
    ['손님이 다시 오지 않는 이유는 대개 말로 듣지 못한다.', '떠난 손님의 이유를 어떻게 들을 것인가?']
  ];
  function lineCard() {
    const base = Math.floor(mid(Date.now()) / 864e5);
    const i = ((base + (S.ui.learnLineShift || 0)) % LINES.length + LINES.length) % LINES.length;
    const [t, qn] = LINES[i];
    return `<section class="panel ln-line" aria-labelledby="h-lnline"><div class="row" style="justify-content:space-between"><h3 id="h-lnline">오늘의 경영 한 문장</h3><span class="small muted">직접 작성 · ${i + 1}/${LINES.length}</span></div>
      <p class="ln-line-t">${esc(t)}</p><p class="small muted" style="margin:0">생각해 볼 질문 · ${esc(qn)}</p>
      <div class="row" style="margin-top:10px"><button type="button" class="btn sm" data-act="learnLineNext">다른 문장</button><button type="button" class="btn sm" data-act="learnLineMemo" data-v="${i}">메모로 담기</button></div></section>`;
  }

  /* ---------- P3: 주간 학습 리포트 ---------- */
  function viewReport() {
    const day = (o) => S.attempts.filter((a) => offOf(a.at) === o);
    const week = (from) => { const at = S.attempts.filter((a) => { const o = offOf(a.at); return o >= from && o <= from + 6; }); return { n: at.length, ok: at.filter((a) => a.correct).length, days: new Set(at.map((a) => offOf(a.at))).size, at }; };
    const tw = week(-6); const lw = week(-13);
    const pct = (w) => (w.n ? Math.round(100 * w.ok / w.n) : null);
    const diff = (a, b, unit) => { if (a == null || b == null) return '<span class="small muted">비교 없음</span>'; const d = a - b; return `<span class="small ${d > 0 ? 'ln-ok' : d < 0 ? 'ln-ng' : 'muted'}">지난주보다 ${d > 0 ? '+' : ''}${d}${unit}</span>`; };
    const courseDays = new Set(S.activity.filter((x) => x.menu === 'learn' && x.type === 'course' && offOf(x.at) >= -6).map((x) => offOf(x.at))).size;
    const days = Array.from({ length: 7 }, (_, k) => { const o = k - 6; const at = day(o); return { o, n: at.length, ok: at.filter((a) => a.correct).length }; });
    const dmax = Math.max(1, ...days.map((d) => d.n));
    const subj = S.SUBJECTS.map((s) => { const at = tw.at.filter((a) => { const q = qById(a.question_id); return q && q.subject === s; }); return { s, n: at.length, rate: at.length ? Math.round(100 * at.filter((a) => a.correct).length / at.length) : null }; });
    const weak = subj.filter((x) => x.n).sort((a, b) => a.rate - b.rate)[0];
    const tile = (label, val, sub) => `<div class="kpi"><span class="label">${label} ${badge('측정')}</span><span class="value num">${val}</span>${sub}</div>`;
    return `<section class="panel"><h3>주간 학습 리포트 <span class="small muted">최근 7일 · ${md(dayStr(-6))}~${md(dayStr(0))}</span></h3>
        <div class="ln-kpis">
          ${tile('XP', tw.n, diff(tw.n, lw.n, ''))}
          ${tile('정답률', pct(tw) == null ? '-' : pct(tw) + '<small>%</small>', diff(pct(tw), pct(lw), '%p'))}
          ${tile('공부한 날', tw.days + '<small>/7일</small>', diff(tw.days, lw.days, '일'))}
          ${tile('5분 코스 완료', courseDays + '<small>일</small>', '<span class="small muted">코스를 끝까지 푼 날</span>')}
        </div></section>
      <section class="panel"><h3>날짜별 XP · 정답률 ${badge('측정')}</h3>
        <div class="ln-week">${days.map((d) => `<div><span class="num">${d.n}</span><i style="height:${Math.round(90 * d.n / dmax) + 4}px" class="${d.o === 0 ? 'now' : ''}"></i><small>${d.o === 0 ? '오늘' : md(dayStr(d.o))}</small><small class="num ${d.n ? '' : 'muted'}">${d.n ? Math.round(100 * d.ok / d.n) + '%' : '-'}</small></div>`).join('')}</div>
        <p class="small muted" style="margin:8px 0 0">막대 = 그날 푼 문제 수(= XP), 아래 숫자 = 그날 정답률</p></section>
      <section class="panel"><div class="row" style="justify-content:space-between"><h3>과목별 이번 주 ${badge('측정')}</h3>${weak ? `<button type="button" class="btn sm primary" data-act="startSubject" data-v="${esc(weak.s)}">가장 약한 과목 풀기: ${esc(weak.s)}</button>` : ''}</div>
        <div class="ln-subjbars">${subj.map((x) => `<div class="barrow"><span>${esc(x.s)}</span><div class="bar"><i style="width:${x.rate == null ? 0 : x.rate}%"></i></div><span class="num small">${x.rate == null ? '안 풂' : `${x.rate}% · ${x.n}문`}</span></div>`).join('')}</div>
      </section>`;
  }

  /* ---------- 탭 ---------- */
  const TABS = [['today', '오늘'], ['subjects', '과목'], ['map', '숙련도·일정'], ['cases', '사례'], ['cmap', '개념 지도'], ['report', '주간 리포트']];

  function viewLearn() {
    const st = srs();
    const learnedToday = S.attempts.filter((a) => offOf(a.at) === 0).length;
    const dueN = Object.keys(st).filter((id) => qById(id) && st[id].dueOff <= 0).length;
    const head = `<div class="view-head"><div><h2>경영학습</h2><p>하루 5분, 잊을 때쯤 다시 나오는 복습. 정답 여부와 관계없이 한 문제당 XP +1.</p></div>
      <div class="row"><span class="pill num">XP ${S.xp} ${badge('측정')}</span><span class="pill num">오늘 ${learnedToday}문제 ${badge('측정')}</span><span class="pill num">복습할 때 ${dueN}문항 ${badge('측정')}</span></div></div>`;
    if (S.ui.quiz) return head + viewQuiz(S.ui.quiz);
    const rc = S.ui.learnRead && conceptById(S.ui.learnRead);
    if (rc) return head + viewRead(rc);
    const tab = TABS.some((t) => t[0] === S.ui.learnTab) ? S.ui.learnTab : 'today';
    const tabs = `<div class="ln-tabs" role="tablist" aria-label="경영학습 보기">${TABS.map(([id, label]) => `<button type="button" role="tab" aria-selected="${id === tab}" data-act="learnTab" data-v="${id}">${label}</button>`).join('')}</div>`;
    const body = { today: viewToday, subjects: viewSubjects, map: viewMap, cases: viewCases, cmap: viewConceptMap, report: viewReport }[tab](st);
    return head + inboxBox() + resultBox() + tabs + body;
  }

  function inboxBox() {
    const items = S.inbox.filter((x) => x.to === 'learn' && !x.done);
    if (!items.length) return '';
    return `<section class="panel ln-inbox" aria-labelledby="h-lnin"><h3 id="h-lnin">받은 항목 <span class="small muted num">${items.length}</span></h3>
      <ul class="ln-notes">${items.map((x) => `<li><div class="small muted">${esc(x.kind || '전달')} · 보낸 곳 ${esc(MENU_KO[x.from] || x.from || '-')} · <span class="num">${md(x.at)}</span></div>
        <div class="ln-note-row"><span>${esc(x.title)}</span><span class="row">${x.payload && (x.payload.subject || x.payload.qid) ? `<button type="button" class="btn sm primary" data-act="learnInboxOpen" data-id="${x.id}">바로 풀기</button>` : ''}<button type="button" class="btn sm" data-act="learnInboxDone" data-id="${x.id}">처리 완료</button></span></div></li>`).join('')}</ul></section>`;
  }

  function resultBox() {
    const last = S.ui.lastResult; const memo = S.ui.learnMemo;
    if (!last) return '';
    return `<section class="panel ln-result" role="status">
        ${memo && memo.cid ? steps(3) : ''}
        <div class="row" style="justify-content:space-between"><b>방금 <span class="num">${last.n}</span>문제 · 정답 <span class="num">${last.c}</span>개 · XP +${last.n}</b>${last.mode === 'review' ? `<span class="small muted">구성: 최근 ${last.r} / 랜덤 ${last.a}${last.nw ? ` / 새 문제 ${last.nw}` : ''}</span>` : ''}</div>
        ${memo ? `${memoForm(memo.subject, memo.cid, memo.cid ? '③ 오늘 배운 것 한 줄 메모' : '남길 메모가 있으면 적어 두세요')}` : ''}<button type="button" class="btn sm ln-skip" data-act="learnSkipMemo">${memo ? '메모 없이 닫기' : '닫기'}</button>
      </section>`;
  }

  function viewToday(st) {
    const c = course(); const doneN = c.list.length - c.remaining.length;
    const sent = S.inbox.some((x) => x.to === 'today' && x.from === 'learn' && offOf(x.at) === 0);
    const recentN = new Set(S.attempts.filter((a) => offOf(a.at) >= -6).map((a) => a.question_id)).size;
    const allN = new Set(S.attempts.map((a) => a.question_id)).size;
    const runsToday = S.learnReviewRuns.filter((r) => r.at === S.today).length;
    const courseCard = `<section class="panel ln-course">
        <div class="row" style="justify-content:space-between;align-items:flex-start"><div><h3>하루 5분 코스 ${c.round > 1 ? `<span class="small muted">${c.round}회차</span>` : ''}</h3>
          <p class="small muted" style="margin:4px 0 0">복습할 때가 된 문항 <b class="num">${c.due.length}</b> + 새 문항 <b class="num">${c.list.length - c.due.length}</b> · 약 5분</p></div>
          <span class="pill num">${doneN}/${c.list.length}</span></div>
        <ol class="ln-dots" aria-label="코스 진행">${c.list.map((id) => { const q = qById(id); const done = !c.remaining.includes(id); return `<li class="${done ? 'done' : ''}"><span class="chip">${esc(q.subject)}</span><span class="small muted">${c.due.includes(id) ? '복습' : '새 문항'}</span>${done ? '<b class="small">완료</b>' : ''}</li>`; }).join('')}</ol>
        <div class="row" style="margin-top:12px">${c.remaining.length ? `<button type="button" class="btn primary ln-big" data-act="learnCourse">${doneN ? '이어 풀기' : '5분 코스 시작'}</button>` : `<span class="ln-done">오늘 코스 완료</span><button type="button" class="btn" data-act="learnCourseMore">5문제 더</button>`}
          <button type="button" class="btn sm" data-act="learnSendToday" ${sent ? 'disabled' : ''}>${sent ? '오늘 할 일에 보냄' : '오늘 할 일로 보내기'}</button></div>
      </section>`;
    return `${lineCard()}${courseCard}
      <section class="panel ln-review">
        <div class="ln-review-main"><div><h3>오늘의 복습 도전</h3>
          <p class="small muted" style="margin:4px 0 0">10문제 = 최근 7일 학습 50% + 전체 학습 이력 랜덤 50%. 하루 여러 번 도전할 수 있습니다.</p>
          <div class="row ln-stats"><span class="pill num">최근 7일 ${recentN}문항</span><span class="pill num">전체 이력 ${allN}문항</span><span class="pill num">오늘 도전 ${runsToday}회</span></div></div>
          <button type="button" class="btn primary" data-act="startReview">도전 시작</button></div>
        <div class="row ln-mix"><span class="small muted">과목 상관없이 섞어 풀기</span>${[5, 10, 20].map((n) => `<button type="button" class="btn sm" data-act="learnMix" data-v="${n}">${n}문제</button>`).join('')}</div>
      </section>
      ${viewWrong(st)}
      ${guide('folder', '서하 실장', '맞힌 문제는 간격을 늘려 잊을 때쯤, 틀린 문제는 내일 다시 올려 드리겠습니다.')}`;
  }

  function viewSubjects(st) {
    return `<section><div class="row" style="justify-content:space-between;margin-bottom:10px"><h3>과목 선택</h3><span class="small muted">① 개념 읽기 → ② 퀴즈 → ③ 메모</span></div>
        <div class="ln-subjects">${S.SUBJECTS.map((s) => { const x = subjStats(s, st); const c = S.learnConcepts.find((y) => y.subject === s); return `<div class="ln-subj">
          <div class="n">${esc(s)}</div>
          <div class="small muted num">문항 ${x.qs.length} · 푼 문항 ${x.done} · 정답률 ${x.rate == null ? '-' : x.rate + '%'}</div>
          <div class="bar" aria-hidden="true"><i style="width:${x.qs.length ? 100 * x.done / x.qs.length : 0}%"></i></div>
          <div class="row ln-btns">${c ? `<button type="button" class="btn sm" data-act="learnRead" data-v="${c.id}">개념 읽기</button>` : ''}<button type="button" class="btn sm primary" data-act="startSubject" data-v="${esc(s)}" ${x.qs.length ? '' : 'disabled'}>바로 풀기</button></div>
        </div>`; }).join('')}</div>
        <p class="small muted">지금 문항·개념은 Claude가 쓴 목업 샘플입니다(문항 ${S.questions.length}개). 공개 데이터 수입 후 교체합니다 — 아래 '자료·출처' 참고.</p></section>
      <section class="panel"><h3>내 학습 메모 <span class="small muted num">${S.learnNotes.length}</span></h3>
        ${S.learnNotes.length ? `<ul class="ln-notes">${S.learnNotes.slice().reverse().map(noteLi).join('')}</ul>` : '<p class="muted">아직 메모가 없습니다. 개념을 읽고 퀴즈를 마치면 메모 칸이 열립니다.</p>'}
      </section>
      ${viewSources()}`;
  }

  /* ---------- 숙련도 지도 + 복습 일정 ---------- */
  function viewMap(st) {
    const cell = (s, u) => {
      const qs = S.questions.filter((q) => q.subject === s && q.unit === u);
      const seen = qs.filter((q) => st[q.id]);
      const lv = seen.length ? Math.floor(qs.reduce((t, q) => t + (st[q.id] ? st[q.id].level : 0), 0) / qs.length) : 0;
      return `<button type="button" class="ln-cell lv${lv}" data-act="learnUnit" data-v="${esc(s)}|${esc(u)}" title="${esc(u)}: ${LV[lv]} — 눌러서 풀기"><span>${esc(u)}</span><small>${LV[lv]} <span class="num">${seen.length}/${qs.length}</span></small></button>`;
    };
    const forecast = Array.from({ length: 7 }, (_, k) => Object.keys(st).filter((id) => qById(id) && (k === 0 ? st[id].dueOff <= 0 : st[id].dueOff === k)).length);
    const fmax = Math.max(1, ...forecast);
    const rows = Object.keys(st).filter((id) => qById(id)).sort((a, b) => st[a].dueOff - st[b].dueOff);
    const showAll = S.ui.learnAllDue; const vis = showAll ? rows : rows.slice(0, 8);
    return `<section class="panel"><h3>숙련도 지도 ${badge('측정')}</h3>
        <p class="small muted" style="margin:0 0 10px">과목 × 단원. 칸을 누르면 그 단원만 풉니다. 색은 간격 반복 상태로 정합니다(맞힐수록 진해짐).</p>
        <div class="ln-legend">${LV.map((t, i) => `<span><i class="lv${i}"></i>${t}</span>`).join('')}</div>
        <div class="ln-map">${S.SUBJECTS.map((s) => { const units = [...new Set(S.questions.filter((q) => q.subject === s).map((q) => q.unit))]; return `<div class="ln-maprow"><b>${esc(s)}</b><div class="ln-cells">${units.map((u) => cell(s, u)).join('')}</div></div>`; }).join('')}</div>
      </section>
      <section class="panel"><h3>복습 일정 · 앞으로 7일 ${badge('측정')}</h3>
        <p class="small muted" style="margin:0 0 10px">맞히면 1일 → 3일 → 약 8일 → … 로 간격이 늘고, 틀리면 다음 날 다시 나옵니다.</p>
        <div class="ln-fc">${forecast.map((n, k) => `<div><span class="num">${n}</span><i style="height:${Math.round(70 * n / fmax) + 4}px" class="${k === 0 ? 'now' : ''}"></i><small>${k === 0 ? '오늘까지' : md(dayStr(k))}</small></div>`).join('')}</div>
        <ul class="ln-due">${vis.map((id) => { const q = qById(id); const s = st[id]; return `<li><span class="ln-lvdot lv${s.level}" title="${LV[s.level]}"></span><span class="ln-due-t"><span class="small muted">${esc(q.subject)} · ${esc(q.unit)}</span><br>${esc(qLabel(q))}</span><b class="num ${s.dueOff <= 0 ? 'ln-due-now' : ''}">${rel(s.dueOff)}</b></li>`; }).join('')}</ul>
        ${rows.length > 8 ? `<button type="button" class="btn sm" data-act="learnAllDue">${showAll ? '접기' : `전체 ${rows.length}문항 보기`}</button>` : ''}
      </section>`;
  }

  function viewWrong() {
    return `<section class="panel ln-wrong"><div class="row" style="justify-content:space-between"><h3>오답 다시 보기 <span class="small muted num">${S.wrong.length}</span></h3>${S.wrong.length ? '<button type="button" class="btn sm primary" data-act="startWrong">오답만 다시 풀기</button>' : ''}</div>
      ${S.wrong.length ? `<p class="small muted" style="margin:4px 0 8px">문제를 누르면 정답과 해설이 펼쳐집니다. 다시 풀어 맞히면 목록에서 빠집니다.</p>
      ${(S.ui.learnAllWrong ? S.wrong : S.wrong.slice(0, 5)).map((id) => { const q = qById(id); if (!q) return ''; const my = lastChosen(id); return `<details><summary><span class="chip">${esc(q.subject)}</span> ${esc(qLabel(q))}</summary>${q.situation ? `<p class="small muted" style="margin:6px 0 0">${esc(q.situation)}</p>` : ''}
        <ul class="ln-ch">${q.choices.map((c, k) => `<li class="${k === q.answer ? 'right' : k === my ? 'wrong' : ''}">${NUM[k]} ${esc(c)}${k === q.answer ? ' <b>정답</b>' : k === my ? ' <b>내 답</b>' : ''}</li>`).join('')}</ul>
        <p style="margin:6px 0">${esc(q.explanation)}</p>
        <div class="row small muted">${aiBadge(q)}<span>${srcLine(q)}</span></div>
        <div class="row" style="margin-top:8px"><button type="button" class="btn sm" data-act="learnKnown" data-id="${q.id}">이제 알았음 · 목록에서 빼기</button></div></details>`; }).join('')}${S.wrong.length > 5 ? `<button type="button" class="btn sm" style="margin-top:8px" data-act="learnAllWrong">${S.ui.learnAllWrong ? '접기' : `전체 ${S.wrong.length}문항 보기`}</button>` : ''}` : '<p class="muted">오답이 없습니다.</p>'}</section>`;
  }

  function viewSources() {
    const rows = [
      ['승인', 'Global-MMLU 한국어(ko) — CohereLabs', '한국어(전문 번역·검수)', 'MMLU 57과목 중 management, marketing, business_ethics, professional_accounting, 거시·미시경제, econometrics 등', 'Apache-2.0', '수입 권장. 상업 이용·수정·해설 추가 가능. 출처 표기.', 'https://huggingface.co/datasets/CohereLabs/Global-MMLU'],
      ['승인', 'OpenStax 경영 교재 (Principles of Management, Marketing, Introduction to Business, Organizational Behavior, Entrepreneurship, Principles of Economics)', '영어', '개념 읽기 본문 + 장별 복습 문제. "읽기" 단계 소재', 'CC BY 4.0 (교재별 확인)', '수입 권장. 번역·요약 허용, 출처 표기. Principles of Accounting은 CC BY-NC-SA라 제외 또는 비상업 조건 준수', 'https://openstax.org/subjects/business'],
      ['2순위', 'MMLU 원본 (cais/mmlu)', '영어', '위와 같은 과목, 영어 원문', 'MIT', '한국어판(Global-MMLU)이 있어 원문 대조용으로만', 'https://huggingface.co/datasets/cais/mmlu'],
      ['미사용', 'KMMLU (HAERAE-HUB)', '한국어(국가자격시험 기반)', 'Accounting, Management, Marketing, Economics, Taxation 등', 'CC BY-ND 4.0', '승인안에서 제외(변경 금지 라이선스)', 'https://huggingface.co/datasets/HAERAE-HUB/KMMLU'],
      ['보류', 'KMMLU-Redux / KMMLU-Pro (LGAI-EXAONE)', '한국어(전문자격)', '정제 2,587문항 / 전문자격 2,822문항', 'CC BY-NC-ND 4.0, 접근 동의 필요', '비상업·변경 금지. 사내 학습용이라도 법무 확인 전 사용 보류', 'https://huggingface.co/datasets/LGAI-EXAONE/KMMLU-Redux'],
      ['확인 필요', 'Virginia Tech "Strategic Management" 공개 교재', '영어', '전략경영 개념·문항', '교재 페이지에서 확인', '착수 시 라이선스 재확인', ''],
      ['제외', '큐넷 등 시험 기출 원문', '한국어', '-', '저작권 별도', '무단 수입 금지', '']
    ];
    const bySubj = {}; Object.entries(MMLU_SUBJECT).forEach(([k, v]) => { (bySubj[v] = bySubj[v] || []).push(k); });
    return `<section class="panel" aria-labelledby="h-src"><h3 id="h-src">자료·출처와 수입 준비</h3>
      <div class="ln-import">
        <div><b>문제 · Global-MMLU 한국어판</b> <span class="pill st-hold">미수입</span><p class="small">이 작업 환경에서 내려받기가 막혀 있어(프록시 차단) 목업 문항을 유지합니다. 받으면 <code>APP.learnImport.fromGlobalMMLU()</code>로 바꿔 넣습니다. 원문 ID = <code>sample_id</code>, 정답 A~D → ①~④.</p></div>
        <div><b>개념 읽기 · OpenStax</b> <span class="pill st-hold">미수입</span><p class="small">개념 9개는 Claude가 자기 말로 쓴 목업 요약입니다(교재 문장 미사용). 받으면 장 요약 번역으로 바꾸고 원문 ID에 교재·장·절을 적습니다.</p></div>
      </div>
      <div class="tbl-wrap"><table><thead><tr><th>현황판 과목</th><th>Global-MMLU subject</th><th>지금 목업</th></tr></thead><tbody>
        ${S.SUBJECTS.map((s) => `<tr><td>${esc(s)}</td><td class="small">${bySubj[s] ? bySubj[s].join(', ') : '<span class="muted">해당 없음 → OpenStax 보강</span>'}</td><td class="num">${S.questions.filter((q) => q.subject === s).length}문항</td></tr>`).join('')}
      </tbody></table></div>
      <details class="ln-more"><summary>공개 자료 후보 전체 (Claude 조사 · 회장 승인 2026-11-02)</summary>
      <p class="small muted" style="margin:8px 0 10px">라이선스는 수입 직전 각 데이터 카드에서 다시 확인합니다. 모든 문항에 source·license·원문 ID를 보존합니다.</p>
      <div class="tbl-wrap"><table><thead><tr><th>판단</th><th>자료</th><th>언어</th><th>범위</th><th>라이선스</th><th>쓰는 방법</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td><span class="pill ${r[0] === '승인' ? 'st-done' : r[0] === '제외' || r[0] === '보류' || r[0] === '미사용' ? 'st-hold' : ''}">${r[0]}</span></td><td>${r[6] ? `<a href="${r[6]}" target="_blank" rel="noopener">${esc(r[1])}</a>` : esc(r[1])}</td><td>${r[2]}</td><td class="small">${r[3]}</td><td class="small">${r[4]}</td><td class="small">${r[5]}</td></tr>`).join('')}
      </tbody></table></div></details></section>`;
  }


  /* ---------- 동작 ---------- */
  function clearSide() { S.ui.lastResult = null; S.ui.learnMemo = null; S.ui.learnRead = null; }
  function top() { window.scrollTo(0, 0); }
  APP.acts.learnTab = (el) => { S.ui.learnTab = el.dataset.v; };
  APP.acts.learnHome = () => { S.ui.learnRead = null; };
  APP.acts.learnRead = (el) => { clearSide(); S.ui.quiz = null; S.ui.learnRead = el.dataset.v; setTimeout(top, 0); };
  APP.acts.learnFlowQuiz = (el) => {
    const c = conceptById(el.dataset.v); if (!c) return;
    const qs = S.questions.filter((q) => q.subject === c.subject && !q.situation);
    const rel2 = shuffle(qs.filter((q) => c.units.includes(q.unit))); const rest = shuffle(qs.filter((q) => !rel2.includes(q)));
    startQuiz('study', [...rel2, ...rest].map((q) => q.id), 'study', { flow: c.id });
  };
  APP.acts.learnMix = (el) => { const n = Math.max(1, +el.dataset.v || 10); startQuiz('mix', shuffle(S.questions).slice(0, n).map((q) => q.id), 'study'); };
  APP.acts.learnUnit = (el) => { const [s, u] = el.dataset.v.split('|'); startQuiz('unit', shuffle(S.questions.filter((q) => q.subject === s && q.unit === u)).map((q) => q.id), 'study'); };
  APP.acts.learnCourse = () => { const c = course(); if (!c.remaining.length) return; startQuiz('course', c.remaining, (id) => (c.due.includes(id) ? 'due' : 'fresh')); };
  APP.acts.learnCourseMore = () => { const old = S.learnCourse; const nc = buildCourse(old ? old.list : []); nc.round = (old ? old.round : 1) + 1; S.learnCourse = nc; startQuiz('course', nc.list, (id) => (nc.due.includes(id) ? 'due' : 'fresh')); };
  APP.acts.learnSendToday = () => {
    if (S.inbox.some((x) => x.to === 'today' && x.from === 'learn' && offOf(x.at) === 0)) return;
    S.inbox.push({ id: uid('ib'), at: new Date().toISOString(), from: 'learn', to: 'today', kind: '할 일', title: '경영학습 하루 5분 코스', payload: { est_minutes: 5, tab: 'learn' }, done: false });
    logAct('send', '하루 5분 코스를 오늘 할 일로 보냄', 'today'); toast('오늘 할 일로 보냈습니다');
  };
  APP.acts.learnAnswer = (el) => {
    const qz = S.ui.quiz; if (!qz || qz.answers[qz.idx] != null) return;
    const q = qById(qz.list[qz.idx].qid); const ch = +el.dataset.k; const ok = ch === q.answer;
    qz.answers[qz.idx] = ch;
    S.attempts.push({ id: uid('at'), question_id: q.id, chosen: ch, correct: ok, mode: MODE_LOG[qz.mode] || '학습', at: new Date().toISOString() });
    S.xp += 1;
    if (!ok && !S.wrong.includes(q.id)) S.wrong.push(q.id);
    if (ok && qz.mode === 'wrong') S.wrong = S.wrong.filter((x) => x !== q.id);
  };
  APP.acts.learnFinish = () => {
    const qz = S.ui.quiz; if (!qz) return;
    const idxs = Object.keys(qz.answers).map(Number);
    const c = idxs.filter((i) => qz.answers[i] === qById(qz.list[i].qid).answer).length;
    S.ui.lastResult = idxs.length ? { mode: qz.mode, n: idxs.length, c, r: qz.list.filter((x) => x.origin === 'recent').length, a: qz.list.filter((x) => x.origin === 'random').length, nw: qz.list.filter((x) => x.origin === 'new').length } : null;
    if (idxs.length && qz.mode === 'review') S.learnReviewRuns.push({ at: S.today, n: idxs.length, c });
    if (idxs.length) {
      const name = { review: '복습 도전', course: '5분 코스', wrong: '오답 다시 풀기', mix: '섞어 풀기', unit: '단원 풀기', case: '사례 문제' }[qz.mode] || '과목 학습';
      logAct('quiz', `${name} ${idxs.length}문제 · 정답 ${c}개`, qz.flow || '');
      if (qz.mode === 'course' && !course().remaining.length) { logAct('course', '하루 5분 코스 완료'); toast('오늘 5분 코스 완료'); }
    }
    const firstQ = qById(qz.list[0].qid); const fc = qz.flow && conceptById(qz.flow);
    S.ui.learnMemo = idxs.length ? { subject: fc ? fc.subject : (['study', 'unit'].includes(qz.mode) ? firstQ.subject : ''), cid: fc ? fc.id : '' } : null;
    S.ui.quiz = null; S.ui.learnRead = null; setTimeout(top, 0);
  };
  APP.acts.learnSkipMemo = () => { S.ui.learnMemo = null; S.ui.lastResult = null; };
  APP.acts.learnKnown = (el) => { S.wrong = S.wrong.filter((x) => x !== el.dataset.id); toast('다시 보기 목록에서 뺐습니다'); };
  APP.acts.learnDelAsk = (el) => { S.ui.learnDelNote = el.dataset.id; };
  APP.acts.learnDelCancel = () => { S.ui.learnDelNote = null; };
  APP.acts.learnDelNote = (el) => { S.learnNotes = S.learnNotes.filter((n) => n.id !== el.dataset.id); S.ui.learnDelNote = null; toast('메모를 삭제했습니다'); };
  APP.acts.learnAllWrong = () => { S.ui.learnAllWrong = !S.ui.learnAllWrong; };
  APP.acts.learnAllDue = () => { S.ui.learnAllDue = !S.ui.learnAllDue; };
  APP.acts.learnInboxDone = (el) => { const x = S.inbox.find((i) => i.id === el.dataset.id); if (x) { x.done = true; logAct('inbox', `받은 항목 처리: ${x.title}`, x.id); } };
  APP.acts.learnInboxOpen = (el) => {
    const x = S.inbox.find((i) => i.id === el.dataset.id); if (!x) return;
    const p = x.payload || {}; const ids = p.qid ? [p.qid] : shuffle(S.questions.filter((q) => q.subject === p.subject)).map((q) => q.id);
    x.done = true; logAct('inbox', `받은 항목 열어 풀기: ${x.title}`, x.id);
    if (ids.length) startQuiz('study', ids, 'study');
  };
  APP.acts.learnCase = (el) => startQuiz('case', [el.dataset.v], 'study');
  APP.acts.learnCaseAll = () => { const st = srs(); startQuiz('case', [...CASES.filter((k) => !st[k.id]), ...shuffle(CASES.filter((k) => st[k.id]))].map((k) => k.id), 'study'); };
  APP.acts.learnLineNext = () => { S.ui.learnLineShift = (S.ui.learnLineShift || 0) + 1; };
  APP.acts.learnLineMemo = (el) => { const L = LINES[+el.dataset.v]; if (!L) return; S.learnNotes.push({ id: uid('ln'), at: S.today, subject: '한 문장', cid: '', text: L[0] }); logAct('memo', `한 문장 담기: ${L[0]}`); toast('학습 메모에 담았습니다'); };
  APP.acts.learnMapSel = (el) => { S.ui.learnMapSel = el.dataset.v; };
  document.addEventListener('keydown', (e) => { const g = e.target.closest && e.target.closest('.ln-node'); if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); g.dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
  APP.forms.learnMemo = (fd) => {
    const text = (fd.get('text') || '').toString().trim(); if (!text) return;
    S.learnNotes.push({ id: uid('ln'), at: S.today, subject: (fd.get('subject') || '').toString(), cid: (fd.get('cid') || '').toString(), text });
    S.ui.learnMemo = null; S.ui.lastResult = null; logAct('memo', `학습 메모: ${text.slice(0, 40)}`); toast('메모를 저장했습니다');
  };

  APP.views.learn = viewLearn;
})();
