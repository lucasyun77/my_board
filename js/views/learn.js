/* 메뉴: 경영학습 (learn) — 이 메뉴 담당 하위 세션은 이 파일만 고칩니다.
   공용 도구·상태는 window.APP에서 꺼내 씁니다. 새 버튼 동작은 APP.acts['이름'] = (el) => {...},
   새 폼은 APP.forms['이름'] = (fd, form) => {...}, 새 select 변경은 APP.changes['이름'] = (el) => {...} 로 등록합니다. */
(function () {
  'use strict';
  const { clone, S, save, RATE, HOUR_VALUE, LEVEL_COST, STATUSES, STAGES, F_TYPES, L_TABLE, $, esc, won, kwon, days, md, BADGE, badge, tagById, chip, uid, shuffle, toast, isOpen, isOverdue, isStale, Lof, Sof, evaluate, sumConfirmed, dayStr, guide, currentFilter, applyFilter, prioPill, statPill, statusSelect, qById, reviewSet } = window.APP;
  function viewLearn() {
    const qz = S.ui.quiz;
    const learnedToday = S.attempts.filter((a) => a.at.slice(0, 10) === S.today).length;
    const head = `<div class="view-head"><div><h2>경영학습</h2><p>날짜에 묶이지 않고 원하는 만큼 풉니다. 정답 여부와 관계없이 한 문제당 XP +1.</p></div>
      <div class="row"><span class="pill num">XP ${S.xp} ${badge('측정')}</span><span class="pill num">오늘 ${learnedToday}문제</span></div></div>`;
    if (qz) {
      const item = qz.list[qz.idx]; const q = qById(item.qid); const ans = qz.answers[qz.idx];
      const originLabel = { recent: '최근 학습', random: '전체 이력 랜덤', new: '새 문제', study: q.subject }[item.origin];
      return head + `<section class="panel">
        <div class="row" style="justify-content:space-between"><b>${qz.mode === 'review' ? '오늘의 복습 도전' : esc(q.subject)} · ${qz.idx + 1}/${qz.list.length}</b><button type="button" class="btn sm" data-act="quitQuiz">그만하기</button></div>
        <div class="progress" style="margin:10px 0" aria-hidden="true">${qz.list.map((it, k) => `<span class="${qz.answers[k] != null ? 'done' : ''} ${qz.mode === 'review' && it.origin === 'recent' ? 'recent' : ''}"></span>`).join('')}</div>
        <div class="small muted">${esc(q.unit)} · <span class="chip">${originLabel}</span></div>
        <div class="q-stem">${esc(q.stem)}</div>
        <div class="choices">${q.choices.map((c, k) => `<button type="button" class="choice ${ans != null ? (k === q.answer ? 'right' : k === ans ? 'wrong' : '') : ''}" data-act="answer" data-k="${k}" ${ans != null ? 'disabled' : ''}>${'①②③④'[k]} ${esc(c)}</button>`).join('')}</div>
        ${ans != null ? `<div class="explain"><b>${ans === q.answer ? '정답' : '오답 — 다시 보기 목록에 추가'}</b> · XP +1<p style="margin:6px 0">${esc(q.explanation)}</p><div class="row small muted">${q.explanation_ai ? '<span class="b e">AI 생성 해설</span>' : ''}<span>출처: ${esc(q.source)} · 라이선스: ${esc(q.license)}</span></div></div>
          <div class="row" style="margin-top:12px">${qz.idx + 1 < qz.list.length ? '<button type="button" class="btn primary" data-act="nextQ">다음 문제</button>' : '<button type="button" class="btn primary" data-act="quitQuiz">결과 보고 마치기</button>'}</div>` : ''}
      </section>`;
    }
    const last = S.ui.lastResult;
    const recentN = new Set(S.attempts.filter((a) => a.at.slice(0, 10) >= dayStr(-6)).map((a) => a.question_id)).size;
    return head + guide('folder', '서하 실장', '하루 한 세트면 충분합니다. 틀린 문제는 다시 보기에 모아 두겠습니다.') + `
      ${last ? `<div class="explain" role="status">방금 ${last.n}문제 · 정답 ${last.c}개 · XP +${last.n}${last.mode === 'review' ? ` · 구성: 최근 ${last.r} / 랜덤 ${last.a}${last.nw ? ` / 새 문제 ${last.nw}` : ''}` : ''}</div>` : ''}
      <section class="panel"><div class="row" style="justify-content:space-between"><div><h3>오늘의 복습 도전</h3><p class="small muted" style="margin:4px 0 0">10문제 = 최근 7일 학습 50% + 전체 학습 이력 랜덤 50%. 하루 여러 번 도전할 수 있습니다. (최근 7일 풀이 ${recentN}문항)</p></div><button type="button" class="btn primary" data-act="startReview">도전 시작</button></div></section>
      <section><h3 style="margin-bottom:10px">과목 선택</h3><div class="subjects">${S.SUBJECTS.map((s) => { const qs = S.questions.filter((q) => q.subject === s); const done = new Set(S.attempts.filter((a) => qs.some((q) => q.id === a.question_id)).map((a) => a.question_id)).size; return `<button type="button" class="subject" data-act="startSubject" data-v="${s}"><span class="n">${s}</span><span class="small muted num">${qs.length}문항 · 푼 문항 ${done}</span><div class="bar" style="width:100%"><i style="width:${qs.length ? 100 * done / qs.length : 0}%"></i></div></button>`; }).join('')}</div>
        <p class="small muted">목업 문항은 Claude가 쓴 샘플 27개입니다. 승인 후 아래 공개 데이터로 교체합니다.</p></section>
      <section class="panel"><div class="row" style="justify-content:space-between"><h3>다시 보기 (오답 ${S.wrong.length})</h3>${S.wrong.length ? '<button type="button" class="btn sm" data-act="startWrong">오답만 풀기</button>' : ''}</div>
        <ul style="margin:8px 0 0;padding-left:18px">${S.wrong.map((id) => { const q = qById(id); return `<li><span class="muted small">${esc(q.subject)}</span> ${esc(q.stem)}</li>`; }).join('') || '<li class="muted">오답이 없습니다.</li>'}</ul></section>
      ${viewSources()}`;
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
    return `<section class="panel" aria-labelledby="h-src"><h3 id="h-src">문제은행 공개 자료 (Claude 추천 · 회장 승인)</h3>
      <p class="small muted" style="margin:4px 0 10px">2026-11-02 조사. 라이선스는 수입 직전 각 데이터 카드에서 다시 확인합니다. 모든 문항에 source·license·원문 ID를 보존합니다.</p>
      <div class="tbl-wrap"><table><thead><tr><th>판단</th><th>자료</th><th>언어</th><th>범위</th><th>라이선스</th><th>쓰는 방법</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td><span class="pill ${r[0] === '승인' ? 'st-done' : r[0] === '제외' || r[0] === '보류' || r[0] === '미사용' ? 'st-hold' : ''}">${r[0]}</span></td><td>${r[6] ? `<a href="${r[6]}" target="_blank" rel="noopener">${esc(r[1])}</a>` : esc(r[1])}</td><td>${r[2]}</td><td class="small">${r[3]}</td><td class="small">${r[4]}</td><td class="small">${r[5]}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="small" style="margin:10px 0 0"><b>추천 조합</b> · 문제는 Global-MMLU 한국어판, 개념 읽기는 OpenStax 요약, 해설이 없는 문항만 AI 해설(표시 필수). 과목 9개를 이 자료 범위에 맞춰 확정합니다.</p></section>`;
  }
  APP.views.learn = viewLearn;
})();
