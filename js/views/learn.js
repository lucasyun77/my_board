/* 메뉴: 경영학습 (learn) — 이 메뉴 담당 하위 세션은 이 파일만 고칩니다.
   공용 도구·상태는 window.APP에서 꺼내 씁니다. 새 버튼 동작은 APP.acts['이름'] = (el) => {...},
   새 폼은 APP.forms['이름'] = (fd, form) => {...}, 새 select 변경은 APP.changes['이름'] = (el) => {...} 로 등록합니다.

   흐름: 과목 선택(첫 화면) → ① 개념 읽기 → ② 퀴즈(정답 무관 XP +1, 해설) → ③ 메모
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

  /* ---------- 도우미 ---------- */
  const NUM = '①②③④';
  const refOf = (x) => (x.source_ref && x.source_ref !== '-' ? x.source_ref : '목업-' + x.id);
  const srcLine = (x) => `출처: ${esc(x.source)} · 라이선스: ${esc(x.license)} · 원문 ID: <span class="num">${esc(refOf(x))}</span>`;
  const lastChosen = (qid) => { const a = S.attempts.filter((x) => x.question_id === qid && x.chosen != null).pop(); return a ? a.chosen : null; };
  const subjStats = (s) => {
    const qs = S.questions.filter((q) => q.subject === s); const ids = new Set(qs.map((q) => q.id));
    const at = S.attempts.filter((a) => ids.has(a.question_id));
    return { qs, done: new Set(at.map((a) => a.question_id)).size, rate: at.length ? Math.round(100 * at.filter((a) => a.correct).length / at.length) : null };
  };
  const steps = (on) => `<ol class="ln-steps" aria-label="학습 단계">${['개념 읽기', '퀴즈', '메모'].map((t, i) => `<li class="${i + 1 === on ? 'on' : i + 1 < on ? 'done' : ''}" ${i + 1 === on ? 'aria-current="step"' : ''}><span class="num">${i + 1}</span>${t}</li>`).join('')}</ol>`;
  const memoForm = (subject, cid, label) => `<form class="ln-memo" data-form="learnMemo">
      <input type="hidden" name="subject" value="${esc(subject || '')}"><input type="hidden" name="cid" value="${esc(cid || '')}">
      <label class="f">${label}<textarea name="text" required maxlength="300" placeholder="예: 우리 매장에 적용하면 — "></textarea></label>
      <div class="row"><button class="btn primary sm">메모 저장</button></div></form>`;

  /* ---------- 화면: 퀴즈 ---------- */
  function viewQuiz(qz) {
    const item = qz.list[qz.idx]; const q = qById(item.qid); const ans = qz.answers[qz.idx];
    const originLabel = { recent: '최근 7일', random: '전체 이력 랜덤', new: '새 문제', study: q.subject }[item.origin] || q.subject;
    const title = qz.mode === 'review' ? '오늘의 복습 도전' : qz.mode === 'wrong' ? '오답 다시 풀기' : qz.mode === 'mix' ? '섞어 풀기' : q.subject;
    const last = qz.idx + 1 >= qz.list.length;
    return `<section class="panel ln-quiz">
      ${qz.flow ? steps(2) : ''}
      <div class="row ln-qtop"><b>${esc(title)} · <span class="num">${qz.idx + 1}/${qz.list.length}</span></b><button type="button" class="btn sm" data-act="learnFinish">그만하기</button></div>
      <div class="progress" style="margin:10px 0" aria-hidden="true">${qz.list.map((it, k) => `<span class="${qz.answers[k] != null ? 'done' : ''} ${qz.mode === 'review' && it.origin === 'recent' ? 'recent' : ''}"></span>`).join('')}</div>
      ${qz.mode === 'review' ? '<p class="small muted" style="margin:0">테두리 있는 칸 = 최근 7일 문제</p>' : ''}
      <div class="small muted ln-qmeta">${esc(q.unit)} · <span class="chip">${esc(originLabel)}</span></div>
      <div class="q-stem">${esc(q.stem)}</div>
      <div class="choices">${q.choices.map((c, k) => `<button type="button" class="choice ${ans != null ? (k === q.answer ? 'right' : k === ans ? 'wrong' : '') : ''}" data-act="answer" data-k="${k}" ${ans != null ? 'disabled' : ''}>${NUM[k]} ${esc(c)}${ans != null && k === q.answer ? ' <b class="ln-mark">정답</b>' : ans === k && k !== q.answer ? ' <b class="ln-mark">내 답</b>' : ''}</button>`).join('')}</div>
      ${ans != null ? `<div class="explain" role="status"><b>${ans === q.answer ? '정답입니다' : `오답 — 정답은 ${NUM[q.answer]}. 다시 보기 목록에 담았습니다`}</b> · XP +1
          <p style="margin:6px 0">${esc(q.explanation || '해설 준비 중')}</p>
          <div class="row small muted">${q.explanation_ai ? '<span class="b e">AI 생성 해설</span>' : ''}<span>${srcLine(q)}</span></div></div>
        <div class="row" style="margin-top:12px">${last ? `<button type="button" class="btn primary" data-act="learnFinish">${qz.flow ? '메모 남기고 마치기' : '결과 보고 마치기'}</button>` : '<button type="button" class="btn primary" data-act="nextQ">다음 문제</button>'}</div>` : ''}
    </section>`;
  }

  /* ---------- 화면: 개념 읽기 ---------- */
  function viewRead(c) {
    const qs = S.questions.filter((q) => q.subject === c.subject);
    const notes = S.learnNotes.filter((n) => n.cid === c.id).slice().reverse();
    const idx = S.learnConcepts.indexOf(c); const next = S.learnConcepts[(idx + 1) % S.learnConcepts.length];
    return `<section class="panel ln-read">
      ${steps(1)}
      <div class="row ln-qtop"><span class="chip">${esc(c.subject)}</span><button type="button" class="btn sm" data-act="learnHome">← 과목 선택</button></div>
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

  const noteLi = (n) => { const c = n.cid && conceptById(n.cid); return `<li><div class="small muted"><span class="num">${md(n.at)}</span> · ${esc(n.subject || '공통')}${c ? ' · ' + esc(c.title) : ''}</div><div class="ln-note-row"><span>${esc(n.text)}</span><button type="button" class="btn sm" data-act="learnDelNote" data-id="${n.id}" aria-label="메모 삭제">삭제</button></div></li>`; };

  /* ---------- 화면: 첫 화면(과목 선택) ---------- */
  function viewLearn() {
    const learnedToday = S.attempts.filter((a) => a.at.slice(0, 10) === S.today).length;
    const head = `<div class="view-head"><div><h2>경영학습</h2><p>날짜에 묶이지 않고 원하는 만큼 풉니다. 정답 여부와 관계없이 한 문제당 XP +1.</p></div>
      <div class="row"><span class="pill num">XP ${S.xp} ${badge('측정')}</span><span class="pill num">오늘 ${learnedToday}문제 ${badge('측정')}</span></div></div>`;
    if (S.ui.quiz) return head + viewQuiz(S.ui.quiz);
    const rc = S.ui.learnRead && conceptById(S.ui.learnRead);
    if (rc) return head + viewRead(rc);

    const last = S.ui.lastResult; const memo = S.ui.learnMemo;
    const recentN = new Set(S.attempts.filter((a) => a.at.slice(0, 10) >= dayStr(-6)).map((a) => a.question_id)).size;
    const allN = new Set(S.attempts.map((a) => a.question_id)).size;
    const runsToday = S.learnReviewRuns.filter((r) => r.at === S.today).length;
    const resultBox = last ? `<section class="panel ln-result" role="status">
        ${memo && memo.cid ? steps(3) : ''}
        <div class="row" style="justify-content:space-between"><b>방금 <span class="num">${last.n}</span>문제 · 정답 <span class="num">${last.c}</span>개 · XP +${last.n}</b>${last.mode === 'review' ? `<span class="small muted">구성: 최근 ${last.r} / 랜덤 ${last.a}${last.nw ? ` / 새 문제 ${last.nw}` : ''}</span>` : ''}</div>
        ${memo ? `${memoForm(memo.subject, memo.cid, memo.cid ? '③ 오늘 배운 것 한 줄 메모' : '남길 메모가 있으면 적어 두세요')}<button type="button" class="btn sm ln-skip" data-act="learnSkipMemo">메모 없이 닫기</button>` : ''}
      </section>` : '';

    return head + resultBox + `
      <section class="panel ln-review">
        <div class="ln-review-main"><div><h3>오늘의 복습 도전</h3>
          <p class="small muted" style="margin:4px 0 0">10문제 = 최근 7일 학습 50% + 전체 학습 이력 랜덤 50%. 하루 여러 번 도전할 수 있습니다.</p>
          <div class="row ln-stats"><span class="pill num">최근 7일 ${recentN}문항</span><span class="pill num">전체 이력 ${allN}문항</span><span class="pill num">오늘 도전 ${runsToday}회</span></div></div>
          <button type="button" class="btn primary" data-act="startReview">도전 시작</button></div>
        <div class="row ln-mix"><span class="small muted">과목 상관없이 섞어 풀기</span>${[5, 10, 20].map((n) => `<button type="button" class="btn sm" data-act="learnMix" data-v="${n}">${n}문제</button>`).join('')}</div>
      </section>
      <section><div class="row" style="justify-content:space-between;margin-bottom:10px"><h3>과목 선택</h3><span class="small muted">① 개념 읽기 → ② 퀴즈 → ③ 메모</span></div>
        <div class="ln-subjects">${S.SUBJECTS.map((s) => { const st = subjStats(s); const c = S.learnConcepts.find((x) => x.subject === s); return `<div class="ln-subj">
          <div class="n">${esc(s)}</div>
          <div class="small muted num">문항 ${st.qs.length} · 푼 문항 ${st.done} · 정답률 ${st.rate == null ? '-' : st.rate + '%'}</div>
          <div class="bar" aria-hidden="true"><i style="width:${st.qs.length ? 100 * st.done / st.qs.length : 0}%"></i></div>
          <div class="row ln-btns">${c ? `<button type="button" class="btn sm" data-act="learnRead" data-v="${c.id}">개념 읽기</button>` : ''}<button type="button" class="btn sm primary" data-act="startSubject" data-v="${esc(s)}" ${st.qs.length ? '' : 'disabled'}>바로 풀기</button></div>
        </div>`; }).join('')}</div>
        <p class="small muted">지금 문항·개념은 Claude가 쓴 목업 샘플입니다(문항 ${S.questions.length}개). 공개 데이터 수입 후 교체합니다 — 아래 '자료·출처' 참고.</p></section>
      ${viewWrong()}
      <section class="panel"><h3>내 학습 메모 <span class="small muted num">${S.learnNotes.length}</span></h3>
        ${S.learnNotes.length ? `<ul class="ln-notes">${S.learnNotes.slice().reverse().map(noteLi).join('')}</ul>` : '<p class="muted">아직 메모가 없습니다. 개념을 읽고 퀴즈를 마치면 메모 칸이 열립니다.</p>'}
      </section>
      ${guide('folder', '서하 실장', '하루 한 세트면 충분합니다. 틀린 문제는 다시 보기에 모아 두겠습니다.')}
      ${viewSources()}`;
  }

  function viewWrong() {
    return `<section class="panel ln-wrong"><div class="row" style="justify-content:space-between"><h3>오답 다시 보기 <span class="small muted num">${S.wrong.length}</span></h3>${S.wrong.length ? '<button type="button" class="btn sm primary" data-act="startWrong">오답만 다시 풀기</button>' : ''}</div>
      ${S.wrong.length ? `<p class="small muted" style="margin:4px 0 8px">문제를 누르면 정답과 해설이 펼쳐집니다. 다시 풀어 맞히면 목록에서 빠집니다.</p>
      ${S.wrong.map((id) => { const q = qById(id); if (!q) return ''; const my = lastChosen(id); return `<details><summary><span class="chip">${esc(q.subject)}</span> ${esc(q.stem)}</summary>
        <ul class="ln-ch">${q.choices.map((c, k) => `<li class="${k === q.answer ? 'right' : k === my ? 'wrong' : ''}">${NUM[k]} ${esc(c)}${k === q.answer ? ' <b>정답</b>' : k === my ? ' <b>내 답</b>' : ''}</li>`).join('')}</ul>
        <p style="margin:6px 0">${esc(q.explanation)}</p>
        <div class="row small muted">${q.explanation_ai ? '<span class="b e">AI 생성 해설</span>' : ''}<span>${srcLine(q)}</span></div>
        <div class="row" style="margin-top:8px"><button type="button" class="btn sm" data-act="learnKnown" data-id="${q.id}">이제 알았음 · 목록에서 빼기</button></div></details>`; }).join('')}` : '<p class="muted">오답이 없습니다.</p>'}</section>`;
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
  const clearSide = () => { S.ui.lastResult = null; S.ui.learnMemo = null; S.ui.learnRead = null; };
  const top = () => window.scrollTo(0, 0);
  APP.acts.learnHome = () => { S.ui.learnRead = null; };
  APP.acts.learnRead = (el) => { clearSide(); S.ui.quiz = null; S.ui.learnRead = el.dataset.v; setTimeout(top, 0); };
  APP.acts.learnFlowQuiz = (el) => {
    const c = conceptById(el.dataset.v); if (!c) return;
    const qs = S.questions.filter((q) => q.subject === c.subject);
    const rel = shuffle(qs.filter((q) => c.units.includes(q.unit))); const rest = shuffle(qs.filter((q) => !rel.includes(q)));
    S.ui.quiz = { mode: 'study', flow: c.id, list: [...rel, ...rest].map((q) => ({ qid: q.id, origin: 'study' })), idx: 0, answers: {} };
    clearSide(); setTimeout(top, 0);
  };
  APP.acts.learnMix = (el) => {
    const n = Math.max(1, +el.dataset.v || 10);
    S.ui.quiz = { mode: 'mix', list: shuffle(S.questions).slice(0, n).map((q) => ({ qid: q.id, origin: 'study' })), idx: 0, answers: {} };
    clearSide(); setTimeout(top, 0);
  };
  APP.acts.learnFinish = () => {
    const qz = S.ui.quiz; if (!qz) return;
    const idxs = Object.keys(qz.answers).map(Number);
    const c = idxs.filter((i) => qz.answers[i] === qById(qz.list[i].qid).answer).length;
    S.ui.lastResult = idxs.length ? { mode: qz.mode, n: idxs.length, c, r: qz.list.filter((x) => x.origin === 'recent').length, a: qz.list.filter((x) => x.origin === 'random').length, nw: qz.list.filter((x) => x.origin === 'new').length } : null;
    if (idxs.length && qz.mode === 'review') S.learnReviewRuns.push({ at: S.today, n: idxs.length, c });
    const firstQ = qById(qz.list[0].qid); const fc = qz.flow && conceptById(qz.flow);
    S.ui.learnMemo = idxs.length ? { subject: fc ? fc.subject : (qz.mode === 'study' ? firstQ.subject : ''), cid: fc ? fc.id : '' } : null;
    S.ui.quiz = null; S.ui.learnRead = null; setTimeout(top, 0);
  };
  APP.acts.learnSkipMemo = () => { S.ui.learnMemo = null; S.ui.lastResult = null; };
  APP.acts.learnKnown = (el) => { S.wrong = S.wrong.filter((x) => x !== el.dataset.id); toast('다시 보기 목록에서 뺐습니다'); };
  APP.acts.learnDelNote = (el) => { S.learnNotes = S.learnNotes.filter((n) => n.id !== el.dataset.id); toast('메모를 삭제했습니다'); };
  APP.forms.learnMemo = (fd) => {
    const text = (fd.get('text') || '').toString().trim(); if (!text) return;
    S.learnNotes.push({ id: uid('ln'), at: S.today, subject: (fd.get('subject') || '').toString(), cid: (fd.get('cid') || '').toString(), text });
    S.ui.learnMemo = null; S.ui.lastResult = null; toast('메모를 저장했습니다');
  };

  APP.views.learn = viewLearn;
})();
