/* 메뉴: 신사업 (ideas) — 이 메뉴 담당 하위 세션은 이 파일만 고칩니다.
   공용 도구·상태는 window.APP에서 꺼내 씁니다. 새 버튼 동작은 APP.acts['이름'] = (el) => {...},
   새 폼은 APP.forms['이름'] = (fd, form) => {...}, 새 select 변경은 APP.changes['이름'] = (el) => {...} 로 등록합니다. */
(function () {
  'use strict';
  const { S, STAGES, esc, days, md, badge, chip, uid, toast, dayStr } = window.APP;

  const AXES = [
    ['시장성', '시장 크기·성장성'],
    ['적합도', '우리 그룹 역량·브랜드와 맞는 정도'],
    ['필요자원', '적게 들수록 높게(5 = 자원 적음)'],
    ['속도', '빨리 검증·출시할 수 있을수록 높게']
  ];
  const ACTIVE = ['아이디어', '검증', 'PoC'];

  /* ---------- 데이터 정리(한 번) : 링크는 배열, 메모는 {at, body, kind} ---------- */
  const SEED = {
    i1: { links: ['https://example.com/gamecoach-interview'], notes: [{ at: dayStr(-10), body: '아이디어 등록', kind: 'sys' }] },
    i3: { links: ['https://example.com/sensetalk-poc-plan'], notes: [{ at: dayStr(-12), body: '단계 변경: 검증 → PoC', kind: 'sys' }] },
    i5: { notes: [{ at: dayStr(-2), body: '후보 도시: 호치민·도쿄·LA 1차 압축', kind: 'memo' }] }
  };
  function normalize() {
    S.ideas.forEach((i) => {
      if (!Array.isArray(i.links)) i.links = String(i.links || '').split(/\n+/).map((x) => x.trim()).filter(Boolean);
      if (!Array.isArray(i.notes)) i.notes = [];
      if (!Array.isArray(i.tags)) i.tags = [];
      if (!Array.isArray(i.s) || i.s.length !== 4) i.s = [3, 3, 3, 3];
      if (!S.ideasSeeded && SEED[i.id]) {
        if (SEED[i.id].links && !i.links.length) i.links = SEED[i.id].links.slice();
        if (SEED[i.id].notes) i.notes = SEED[i.id].notes.concat(i.notes);
      }
    });
    S.ideasSeeded = true;
  }

  /* ---------- 도구 ---------- */
  const total = (i) => i.s.reduce((a, b) => a + (+b || 0), 0);
  const level = (n) => (n >= 16 ? 'hi' : n >= 12 ? 'mid' : 'lo');
  const dday = (d) => { if (!d) return ''; const n = days(S.today, d); return n === 0 ? 'D-day' : n > 0 ? `D-${n}` : `D+${-n}`; };
  const isLate = (i) => ACTIVE.includes(i.stage) && i.next_due && i.next_due < S.today;
  const safeUrl = (u) => (/^https?:\/\//i.test(u) ? u : '');
  const byId = (id) => S.ideas.find((x) => x.id === id);
  const ui = () => S.ui;
  function sorted(list) {
    const mode = ui().ideaSort || 'score';
    return list.slice().sort((a, b) => mode === 'due'
      ? String(a.next_due || '9').localeCompare(String(b.next_due || '9')) || total(b) - total(a)
      : total(b) - total(a) || String(a.next_due || '9').localeCompare(String(b.next_due || '9')));
  }
  const stageSelect = (i, act, extra = '') => `<select aria-label="${esc(i.title)} 단계 이동" data-act="${act}" data-id="${i.id}" ${extra}>${STAGES.map((s) => `<option ${s === i.stage ? 'selected' : ''}>${s}</option>`).join('')}</select>`;
  const scoreBox = (i) => `<span class="ideas-score ${level(total(i))}" title="4축 합계(20점 만점)"><b class="num">${total(i)}</b><small>/20</small></span>`;
  const pips = (n) => `<span class="ideas-pips" aria-hidden="true">${[1, 2, 3, 4, 5].map((k) => `<i class="${k <= n ? 'on' : ''}"></i>`).join('')}</span>`;
  const dueTag = (i) => (i.next_due ? `<span class="num ideas-due ${isLate(i) ? 'late' : ''}">${md(i.next_due)} · ${dday(i.next_due)}</span>` : '');

  /* ---------- 카드 ---------- */
  function card(i) {
    return `<article class="card ideas-card ${isLate(i) ? 'late' : ''}" data-act="ideaOpen" data-id="${i.id}">
      <div class="ideas-card-top"><button type="button" class="ideas-title" data-act="ideaOpen" data-id="${i.id}">${esc(i.title)}</button>${scoreBox(i)}</div>
      ${i.summary ? `<div class="ideas-sum">${esc(i.summary)}</div>` : ''}
      <div class="ideas-axes small">${AXES.map(([a], k) => `<span>${a} <b class="num">${i.s[k]}</b></span>`).join('')}</div>
      ${i.next_action ? `<div class="ideas-next small"><span class="muted">다음</span> ${esc(i.next_action)} ${dueTag(i)}</div>` : ''}
      ${i.tags.length ? `<div class="row ideas-tags">${i.tags.map(chip).join('')}</div>` : ''}
      <div class="ideas-foot small muted"><span>${esc(i.owner)}</span>${i.notes.length ? `<span>메모 ${i.notes.length}</span>` : ''}${i.links.length ? `<span>링크 ${i.links.length}</span>` : ''}</div>
      ${stageSelect(i, 'ideasStage', 'class="ideas-stage-sel"')}
    </article>`;
  }

  /* ---------- 보기: 칸반 / 점수표 ---------- */
  function column(st) {
    const c = sorted(S.ideas.filter((i) => i.stage === st));
    return `<section class="col" data-stage="${st}" aria-label="${st} ${c.length}건"><header><span>${st}</span><span class="num muted">${c.length}</span></header>
      ${c.map(card).join('') || '<div class="small muted ideas-empty">비어 있음</div>'}</section>`;
  }
  function kanban() {
    const showClosed = ui().ideaClosed !== false;
    return `<div class="ideas-kanban">${['아이디어', '검증', 'PoC', '론칭'].map(column).join('')}</div>
      ${showClosed ? `<div class="ideas-kanban closed">${['보류', '폐기'].map(column).join('')}</div>` : ''}`;
  }
  function ranking() {
    const list = S.ideas.filter((i) => ui().ideaClosed !== false || !['보류', '폐기'].includes(i.stage)).sort((a, b) => total(b) - total(a) || String(a.next_due || '9').localeCompare(String(b.next_due || '9')));
    return `<section class="panel"><h3>점수표 ${badge('수기')}</h3><p class="small muted" style="margin:4px 0 12px">4축 합계 순. 필요자원은 적게 들수록 높은 점수입니다.</p>
      <ol class="ideas-rank">${list.map((i, n) => `<li>
        <span class="ideas-rank-n num">${n + 1}</span>
        <div class="ideas-rank-main"><button type="button" class="ideas-title" data-act="ideaOpen" data-id="${i.id}">${esc(i.title)}</button>
          <div class="small muted">${esc(i.stage)} · ${esc(i.owner)}${i.next_due ? ` · 다음 액션 ${dueTag(i)}` : ''}</div>
          <div class="ideas-rank-axes small">${AXES.map(([a], k) => `<span>${a} ${pips(i.s[k])}<b class="num">${i.s[k]}</b></span>`).join('')}</div></div>
        ${scoreBox(i)}</li>`).join('') || '<li class="muted">아이디어가 없습니다.</li>'}</ol></section>`;
  }

  /* ---------- 상세·편집 창 ---------- */
  function form(i) {
    const isNew = !i;
    const d = i || { title: '', summary: '', owner: '', stage: '아이디어', s: [3, 3, 3, 3], next_action: '', next_due: dayStr(7), tags: [], links: [] };
    return `<form class="form ideas-form" data-form="ideaSave" data-id="${isNew ? '' : d.id}">
      <label class="f wide">제목<input type="text" name="title" required maxlength="60" value="${esc(d.title)}" placeholder="예: 매장 무인 주문 키트"></label>
      <label class="f wide">한 줄 설명<input type="text" name="summary" maxlength="120" value="${esc(d.summary)}" placeholder="무엇을, 누구에게"></label>
      <label class="f">담당<input type="text" name="owner" value="${esc(d.owner === '담당 미정' ? '' : d.owner)}" placeholder="예: AI전략실"></label>
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
  function detail(i) {
    const notes = i.notes.map((n, k) => ({ ...n, k })).reverse();
    return `<div class="ideas-detail">
      <div class="ideas-d-head">${scoreBox(i)}<div><div class="ideas-d-stage"><span class="ideas-stage-dot" data-stage="${esc(i.stage)}"></span>${esc(i.stage)} · ${esc(i.owner)}</div>
        ${i.summary ? `<p class="ideas-d-sum">${esc(i.summary)}</p>` : ''}</div></div>
      <div class="ideas-d-sec"><h4>4축 점수 ${badge('수기')}</h4>
        <ul class="ideas-d-axes">${AXES.map(([a, hint], k) => `<li><span>${a}<small class="muted">${hint}</small></span>${pips(i.s[k])}<b class="num">${i.s[k]}</b></li>`).join('')}</ul></div>
      <div class="ideas-d-sec"><h4>다음 액션</h4>${i.next_action ? `<p>${esc(i.next_action)} ${dueTag(i)}</p>` : '<p class="muted">정하지 않음</p>'}</div>
      <div class="ideas-d-grid">
        <div class="ideas-d-sec"><h4>태그</h4>${i.tags.length ? `<div class="row">${i.tags.map(chip).join('')}</div>` : '<p class="muted">없음</p>'}</div>
        <div class="ideas-d-sec"><h4>링크</h4>${i.links.length ? `<ul class="ideas-links">${i.links.map((l) => safeUrl(l) ? `<li><a href="${esc(l)}" target="_blank" rel="noopener noreferrer">${esc(l.replace(/^https?:\/\//i, ''))}</a></li>` : `<li>${esc(l)}</li>`).join('')}</ul>` : '<p class="muted">없음</p>'}</div>
      </div>
      <div class="ideas-d-sec ideas-d-move"><label class="f">단계 이동${stageSelect(i, 'ideasStage')}</label><button type="button" class="btn" data-act="ideaEditOn">편집</button></div>
      <div class="ideas-d-sec"><h4>메모 이력 <span class="muted num">${i.notes.length}</span></h4>
        <form class="ideas-note-form" data-form="ideaNote" data-id="${i.id}"><label class="f" style="flex:1">새 메모<textarea name="body" rows="2" required placeholder="회의 결과, 판단 근거 등"></textarea></label><button class="btn primary">메모 추가</button></form>
        <ol class="ideas-notes">${notes.map((n) => `<li class="${n.kind === 'sys' ? 'sys' : ''}"><span class="num muted">${esc(md(n.at))}</span><span>${n.kind === 'sys' ? '<span class="pill">기록</span> ' : ''}${esc(n.body)}</span>${n.kind === 'sys' ? '' : `<button type="button" class="ideas-x" data-act="ideaNoteDel" data-id="${i.id}" data-k="${n.k}" aria-label="메모 삭제">×</button>`}</li>`).join('') || '<li class="muted">아직 메모가 없습니다.</li>'}</ol></div>
    </div>`;
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

  /* ---------- 화면 ---------- */
  function viewIdeas() {
    normalize();
    const mode = ui().ideaView || 'board';
    const sort = ui().ideaSort || 'score';
    const showClosed = ui().ideaClosed !== false;
    const active = S.ideas.filter((i) => ACTIVE.includes(i.stage));
    const late = S.ideas.filter(isLate);
    const avg = active.length ? (active.reduce((a, i) => a + total(i), 0) / active.length).toFixed(1) : '-';
    const seg = (act, cur, opts) => `<span class="seg">${opts.map(([v, l]) => `<button type="button" data-act="${act}" data-v="${v}" aria-pressed="${v === cur}">${l}</button>`).join('')}</span>`;
    return `<div class="view-head"><div><h2>신사업 파이프라인</h2><p>아이디어 → 검증 → PoC → 론칭 · 4축 점수(각 1~5). 카드를 누르면 상세·편집·메모를 볼 수 있습니다.</p></div>
        <button type="button" class="btn primary" data-act="ideaNew">+ 아이디어 등록</button></div>
      <div class="ideas-stats">
        <div><span class="small muted">진행 중 ${badge('측정')}</span><b class="num">${active.length}<small>건</small></b></div>
        <div><span class="small muted">론칭 ${badge('측정')}</span><b class="num">${S.ideas.filter((i) => i.stage === '론칭').length}<small>건</small></b></div>
        <div class="${late.length ? 'alert' : ''}"><span class="small muted">다음 액션 기한 경과 ${badge('측정')}</span><b class="num">${late.length}<small>건</small></b></div>
        <div><span class="small muted">진행 중 평균 점수 ${badge('수기')}</span><b class="num">${avg}<small>/20</small></b></div>
      </div>
      <div class="ideas-tools">
        ${seg('ideaView', mode, [['board', '칸반'], ['rank', '점수표']])}
        ${mode === 'rank' ? '' : `<span class="ideas-tool-l small muted">열 안 정렬</span>${seg('ideaSort', sort, [['score', '점수순'], ['due', '기한순']])}`}
        <label class="ideas-check small"><input type="checkbox" data-act="ideaClosedTgl" ${showClosed ? 'checked' : ''}> 보류·폐기 보기</label>
      </div>
      ${mode === 'rank' ? ranking() : kanban()}
      <p class="small muted">초기 5건은 회장님 확인 전 샘플입니다. 저장 시 Asana 연동은 실서비스에서 반영됩니다.</p>
      ${overlay()}`;
  }

  /* ---------- 동작 ---------- */
  const focusLater = (sel) => setTimeout(() => { const el = document.querySelector(sel); if (el) el.focus(); }, 0);
  const log = (i, body) => i.notes.push({ at: S.today, body, kind: 'sys' });
  Object.assign(APP.acts, {
    ideaView: (el) => { ui().ideaView = el.dataset.v; },
    ideaSort: (el) => { ui().ideaSort = el.dataset.v; },
    ideaNew: () => { ui().ideaOpen = 'new'; ui().ideaEdit = false; focusLater('.ideas-form input[name=title]'); },
    ideaOpen: (el) => { ui().ideaOpen = el.dataset.id; ui().ideaEdit = false; ui().ideaReturn = el.dataset.id; focusLater('.ideas-dialog'); },
    ideaClose: () => { const back = ui().ideaReturn; ui().ideaOpen = null; ui().ideaEdit = false; if (back) focusLater(`.ideas-title[data-id="${back}"]`); },
    ideaEditOn: () => { ui().ideaEdit = true; focusLater('.ideas-form input[name=title]'); },
    ideaEditOff: () => { ui().ideaEdit = false; focusLater('.ideas-dialog'); },
    ideaNoteDel: (el) => { const i = byId(el.dataset.id); if (i) { i.notes.splice(+el.dataset.k, 1); toast('메모를 삭제했습니다'); } focusLater('.ideas-dialog'); }
  });
  APP.changes.ideasStage = (el) => {
    const i = byId(el.dataset.id); if (!i || i.stage === el.value) return;
    log(i, `단계 변경: ${i.stage} → ${el.value}`);
    i.stage = el.value; toast(`${i.title} → ${el.value}`);
  };
  APP.changes.ideaClosedTgl = (el) => { ui().ideaClosed = el.checked; };
  APP.forms.ideaSave = (fd, frm) => {
    const g = (n) => (fd.get(n) || '').toString().trim();
    const data = {
      title: g('title'), summary: g('summary'), owner: g('owner') || '담당 미정', stage: STAGES.includes(g('stage')) ? g('stage') : '아이디어',
      s: [0, 1, 2, 3].map((k) => Math.min(5, Math.max(1, +g('s' + k) || 3))),
      next_action: g('next_action'), next_due: g('next_due'), tags: fd.getAll('tags'),
      links: g('links').split(/\n+/).map((x) => x.trim()).filter(Boolean)
    };
    if (!data.title) { toast('제목을 입력해 주세요'); return; }
    const id = frm.dataset.id;
    if (!id) {
      const i = Object.assign({ id: uid('i'), notes: [{ at: S.today, body: '아이디어 등록', kind: 'sys' }] }, data);
      if (g('memo')) i.notes.push({ at: S.today, body: g('memo'), kind: 'memo' });
      S.ideas.push(i); ui().ideaOpen = i.id; ui().ideaReturn = i.id; ui().ideaEdit = false;
      toast('아이디어를 등록했습니다 (Asana 반영은 목업 표시)');
    } else {
      const i = byId(id); if (!i) return;
      const ch = [];
      if (i.stage !== data.stage) ch.push(`단계 ${i.stage} → ${data.stage}`);
      if (total(i) !== data.s.reduce((a, b) => a + b, 0) || i.s.join() !== data.s.join()) ch.push(`점수 ${total(i)} → ${data.s.reduce((a, b) => a + b, 0)} (${data.s.join('·')})`);
      if (i.next_action !== data.next_action || i.next_due !== data.next_due) ch.push(`다음 액션 변경${data.next_due ? ` ~${md(data.next_due)}` : ''}`);
      if (i.title !== data.title) ch.push(`제목 '${i.title}' → '${data.title}'`);
      Object.assign(i, data);
      log(i, ch.length ? `수정: ${ch.join(', ')}` : '수정: 설명·태그·링크');
      ui().ideaEdit = false; toast('저장했습니다');
    }
    focusLater('.ideas-dialog');
  };
  APP.forms.ideaNote = (fd, frm) => {
    const i = byId(frm.dataset.id); const body = (fd.get('body') || '').toString().trim();
    if (!i || !body) return;
    i.notes.push({ at: S.today, body, kind: 'memo' }); toast('메모를 추가했습니다');
    focusLater('.ideas-note-form textarea');
  };

  /* Esc·바깥 누르기로 닫기 (닫기 버튼을 대신 누른다) */
  const closeBtn = () => document.querySelector('.ideas-dialog [data-act="ideaClose"]');
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && closeBtn()) { e.preventDefault(); closeBtn().click(); } });
  document.addEventListener('click', (e) => { if (e.target.classList && e.target.classList.contains('ideas-overlay') && closeBtn()) closeBtn().click(); });
  /* 다른 메뉴로 가면 창은 닫힌 상태로 */
  window.addEventListener('hashchange', () => { if (location.hash !== '#ideas' && S.ui.ideaOpen) { S.ui.ideaOpen = null; S.ui.ideaEdit = false; } });

  APP.views.ideas = viewIdeas;
})();
