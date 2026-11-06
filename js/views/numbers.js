/* 메뉴: 내가 보는 숫자 (numbers) — 이 메뉴 담당 하위 세션은 이 파일만 고칩니다.
   공용 도구·상태는 window.APP에서 꺼내 씁니다. 새 버튼 동작은 APP.acts['이름'], 폼은 APP.forms['이름'], select 변경은 APP.changes['이름']로 등록합니다. */
(function () {
  'use strict';
  const { S, esc, badge } = window.APP;

  // 뼈대(메인 세션). 실제 화면은 하위 세션이 만든다.
  S.numbersExtra = S.numbersExtra || {
    cards: [
      { id: 'n1', name: '월 매출(3개 브랜드 합계)', unit: '원', value: null, source: '미확인' },
      { id: 'n2', name: '이번 달 신규 가맹 계약', unit: '건', value: null, source: '미확인' },
      { id: 'n3', name: '로열티 납부율', unit: '%', value: null, source: '미확인' }
    ]
  };

  function viewNumbers() {
    const cards = S.numbersExtra.cards;
    return `<div class="view-head"><div><h2>내가 보는 숫자</h2><p>회장님이 매일 직접 확인하는 숫자만 모아 봅니다. (준비 중 — 담당 하위 세션이 만들고 있습니다)</p></div></div>
      <div class="kpis">${cards.map((c) => `<div class="kpi"><span class="label">${esc(c.name)} ${badge(c.source)}</span><span class="value num">${c.value == null ? '—' : esc(c.value)}<small>${esc(c.unit)}</small></span><span class="small muted">데이터 원천 확정 전</span></div>`).join('')}</div>`;
  }

  APP.views.numbers = viewNumbers;
})();
