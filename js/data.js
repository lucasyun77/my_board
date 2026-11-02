/* 목업 샘플 데이터. 실제 운영 시 Supabase·Asana·사용량 API로 교체한다.
   날짜는 오늘 기준 상대값(D(n))으로 만들어 언제 열어도 화면이 살아 있게 한다. */
(function () {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const D = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const T = (n, h = 9) => { const d = new Date(today); d.setDate(d.getDate() + n); d.setHours(h, 0, 0, 0); return d.toISOString(); };

  const ORGS = ['경영지원본부', '벌툰사업부', '블랙라벨사업부', '생전포차사업부', 'AI전략실', '마케팅실'];

  const tags = [
    { id: 't1', name: 'AI전환', color: '#F29801', description: 'AI로 업무 방식을 바꾸는 과제', sort: 1 },
    { id: 't2', name: '비용절감', color: '#3D7A4E', description: '고정비·변동비 절감', sort: 2 },
    { id: 't3', name: '가맹확대', color: '#4A6A8A', description: '가맹점 수·매출 확대', sort: 3 },
    { id: 't4', name: '브랜드', color: '#8A5A9A', description: '블랙라벨·벌툰·생전포차 브랜드 관리', sort: 4 },
    { id: 't5', name: '신사업', color: '#B4412F', description: '신규 사업 검증·론칭', sort: 5 },
    { id: 't6', name: '글로벌', color: '#2F7F86', description: '해외 진출', sort: 6 }
  ];

  const directives = [
    { id: 'd1', title: '전 부서 AI 업무 자동화 사례 1건씩 제출', body: '부서별 반복 업무 1개를 골라 AI 스킬로 자동화하고 결과 공유', org: 'AI전략실', assignee: '담당 A', issued_at: D(-12), due_at: D(-2), priority: '긴급', status: '진행', tags: ['t1'], source_url: '#', result_url: '', memo: '3개 부서 미제출', updated_at: D(-5), asana_gid: 'mock-1001' },
    { id: 'd2', title: '벌툰 가맹점 월 고정비 절감안 보고', body: '임대료 외 고정비 항목별 절감 가능액 산출', org: '벌툰사업부', assignee: '담당 B', issued_at: D(-9), due_at: D(0), priority: '높음', status: '보고대기', tags: ['t2', 't3'], source_url: '#', result_url: '#', memo: '', updated_at: D(-1), asana_gid: 'mock-1002' },
    { id: 'd3', title: '생전포차 해외 1호점 후보 도시 3곳 비교', body: '임대료·인건비·한류 수요 기준 비교표', org: '생전포차사업부', assignee: '담당 C', issued_at: D(-6), due_at: D(5), priority: '보통', status: '진행', tags: ['t6', 't5'], source_url: '#', result_url: '', memo: '', updated_at: D(-1), asana_gid: 'mock-1003' },
    { id: 'd4', title: '블랙라벨 신메뉴 시식 결과 정리', body: '', org: '블랙라벨사업부', assignee: '담당 D', issued_at: D(-4), due_at: D(1), priority: '높음', status: '지시', tags: ['t4'], source_url: '#', result_url: '', memo: '', updated_at: D(-4), asana_gid: 'mock-1004' },
    { id: 'd5', title: '본사 회의록 자동 요약 → 아사나 등록 파이프라인', body: '회의 녹취 → 요약 → 액션아이템 아사나 자동 생성', org: 'AI전략실', assignee: '담당 E', issued_at: D(-15), due_at: D(-6), priority: '보통', status: '완료', tags: ['t1'], source_url: '#', result_url: '#', memo: '', updated_at: D(-6), asana_gid: 'mock-1005' },
    { id: 'd6', title: '벌툰 브랜드 표기 통일 점검(간판·SNS·메뉴판)', body: '"벌툰" 표기 혼용 사례 전수 점검', org: '마케팅실', assignee: '담당 F', issued_at: D(-3), due_at: D(10), priority: '보통', status: '진행', tags: ['t4'], source_url: '#', result_url: '', memo: '', updated_at: D(0), asana_gid: 'mock-1006' },
    { id: 'd7', title: '분기 비용 집행 현황 1장 요약', body: '', org: '경영지원본부', assignee: '담당 G', issued_at: D(-2), due_at: D(3), priority: '보통', status: '지시', tags: ['t2'], source_url: '#', result_url: '', memo: '', updated_at: D(-2), asana_gid: 'mock-1007' },
    { id: 'd8', title: '가맹 상담 문의 응답시간 측정 체계 마련', body: '', org: '마케팅실', assignee: '담당 H', issued_at: D(-20), due_at: D(-10), priority: '보통', status: '보류', tags: ['t3'], source_url: '#', result_url: '', memo: 'CRM 교체 후 재개', updated_at: D(-10), asana_gid: 'mock-1008' }
  ];

  const ideas = [
    { id: 'i1', title: '게임코치', summary: '게임 실력 향상 1:1 코칭 매칭', stage: '검증', owner: 'AI전략실', s: [4, 3, 3, 4], next_action: '코치 풀 20명 확보 가능성 조사', next_due: D(7), tags: ['t5'], links: '', notes: [{ at: D(-3), body: '대학 e스포츠 동아리 3곳 인터뷰 완료' }] },
    { id: 'i2', title: '마이크루', summary: '소규모 크루(동호회) 운영 도구', stage: '아이디어', owner: '담당 미정', s: [3, 3, 4, 3], next_action: '경쟁 서비스 5개 비교', next_due: D(10), tags: ['t5'], links: '', notes: [] },
    { id: 'i3', title: '센스톡', summary: '매장 고객 의견을 AI로 요약해 점주에게 전달', stage: 'PoC', owner: 'AI전략실', s: [4, 5, 4, 4], next_action: '벌툰 3개 매장 2주 시범 운영', next_due: D(4), tags: ['t5', 't1'], links: '', notes: [{ at: D(-1), body: '시범 매장 3곳 확정' }] },
    { id: 'i4', title: 'K한류 리버스비즈니스어링 리포트', summary: '해외 한류 소비 데이터를 국내 사업 기회로 역해석한 리포트', stage: '아이디어', owner: '마케팅실', s: [3, 4, 5, 4], next_action: '샘플 리포트 1편 제작', next_due: D(14), tags: ['t5', 't6'], links: '', notes: [] },
    { id: 'i5', title: '생전포차 글로벌', summary: '생전포차 해외 직영·가맹 진출', stage: '검증', owner: '생전포차사업부', s: [5, 4, 2, 2], next_action: '후보 도시 3곳 비교(지시 연계)', next_due: D(5), tags: ['t6', 't3'], links: '', notes: [] }
  ];

  const dailyTasks = [
    { id: 'k1', date: D(0), title: '신사업 파이프라인 주간 점검', est_minutes: 60, est_value: 300000, started_at: null, ended_at: null, actual_minutes: null, time_source: null, done: false },
    { id: 'k2', date: D(0), title: '경영학습 복습 도전 1세트', est_minutes: 15, est_value: 30000, started_at: null, ended_at: null, actual_minutes: null, time_source: null, done: false }
  ];

  // 인계문서 §5-2 산정 예시를 확정 1건으로 넣어 레벨업 흐름을 바로 볼 수 있게 한다.
  const achievements = [
    { id: 'a1', title: '[예시] 본사 회의록 자동 요약 프로그램', date: D(-1), output_url: '#', output_type: 'ai_code', headcount: 100, by_agent: true,
      saved_hours: 1, months: 12, monthly_revenue: 0, monthly_cost: 0, est_minutes: 240, actual_minutes: 120,
      B: 360000, L: 8, F: 2, S: 1.25, A: 1.2, N: 1, value_won: 8640000, status: '확정', confirmed_at: D(-1),
      rationale: ['B: 1인 월 1시간 × 30,000원 × 12개월', 'L: 영향 100명(본사 전원 수준) → 8.0', 'F: AI 고도화 + 코드 → 2.0', 'S: 예상 240분, 실제 120분 → 1.25', 'A: 에이전트 수행 → 1.2', 'N: 협상 없음 → 1.0'],
      negotiations: [] }
  ];

  const wallet = { balance_won: 8640000, total_won: 8640000, level: 1 };

  // AI 사용량(14일). Claude만 측정 가능 경로가 있다고 가정. 나머지는 미확인.
  const usage = [];
  for (let i = 13; i >= 0; i--) {
    const wk = new Date(today); wk.setDate(wk.getDate() - i);
    const weekend = [0, 6].includes(wk.getDay());
    const base = weekend ? 0.45 : 1;
    const wave = 0.75 + 0.5 * Math.abs(Math.sin(i * 1.7));
    usage.push({ date: D(-i), provider: 'Claude', input_tokens: Math.round(2100000 * base * wave), output_tokens: Math.round(380000 * base * wave), cost_usd: +(14.2 * base * wave).toFixed(2), calls: Math.round(210 * base * wave), data_source: '측정' });
  }
  const providers = [
    { name: 'Claude (Claude Code·API)', path: 'Claude Code 로컬 세션 로그 + 조직 Admin API 사용량', status: '측정', note: '토큰·비용 수집 가능(착수 시 키 권한 확인)' },
    { name: 'Claude (claude.ai 구독 채팅)', path: '구독 화면에 토큰 수치 미노출', status: '미확인', note: '사용 횟수만 스킬 로그로 추정 검토' },
    { name: 'ChatGPT (구독)', path: '개인 구독은 토큰 노출 안 됨', status: '미확인', note: 'API 키 사용분만 Usage API로 수집 가능' },
    { name: 'Gemini', path: 'Google AI Studio / Cloud 결제 보고서', status: '미확인', note: '관리자 키 보유 여부 확인 필요(§8-4)' }
  ];
  const features = [
    { name: '채팅', share: 38 }, { name: '코드(Claude Code)', share: 27 }, { name: '스킬', share: 17 }, { name: '커넥터', share: 11 }, { name: '에이전트', share: 7 }
  ];
  const topSkills = [
    ['isens-file-naming', 41], ['morning', 33], ['xlsx', 26], ['pptx', 22], ['beoltoon-ppt', 19], ['docx', 15], ['suhun-recommend', 12], ['isens-org-master', 9], ['pdf', 8], ['kipris-ip-research', 5]
  ];

  // 경영 현황
  const waiting = [
    { title: '벌툰 가맹계약서 개정안 결재', from: '경영지원본부', since: D(-6) },
    { title: '생전포차 해외 법인 설립 자문사 선정', from: '생전포차사업부', since: D(-4) },
    { title: '11월 마케팅 예산 증액 요청', from: '마케팅실', since: D(-2) },
    { title: 'AI 도구 연간 라이선스 갱신', from: 'AI전략실', since: D(-1) }
  ];
  const depts = [
    { name: '경영지원본부', registered: true, delayed: 0 },
    { name: '벌툰사업부', registered: true, delayed: 1 },
    { name: '블랙라벨사업부', registered: true, delayed: 0 },
    { name: '생전포차사업부', registered: false, delayed: 2 },
    { name: 'AI전략실', registered: true, delayed: 3 },
    { name: '마케팅실', registered: true, delayed: 1 }
  ];
  const issues = [
    { title: '[예시] 가맹점 A 상표 사용 분쟁', due: D(6), next: '내용증명 회신 검토', owner: '경영지원본부' },
    { title: '[예시] 블랙라벨 원재료 단가 인상 통보', due: D(2), next: '대체 공급처 2곳 견적', owner: '블랙라벨사업부' }
  ];
  const calendar = [
    { time: '09:30', title: '주간 경영회의' }, { time: '13:00', title: '센스톡 PoC 점검' }, { time: '16:00', title: '외부 미팅(가맹 투자)' }
  ];

  // 경영학습 — 실데이터 수입 전 목업 샘플. source를 반드시 남긴다.
  const SUBJECTS = ['경영전략', '조직·인사', '마케팅', '회계', '재무', '경제', '운영관리', '경영정보·AI', '기업윤리'];
  const SRC = { source: '목업 샘플(Claude 작성)', license: '목업 전용', source_ref: '-' };
  const Q = (id, subject, unit, stem, choices, answer, explanation) => ({ id, subject, unit, stem, choices, answer, explanation, explanation_ai: true, ...SRC });
  const questions = [
    Q('q1', '경영전략', '경쟁전략', '포터의 본원적 경쟁전략에 해당하지 않는 것은?', ['원가우위', '차별화', '집중화', '수직계열화'], 3, '포터의 본원적 전략은 원가우위·차별화·집중화 세 가지다. 수직계열화는 기업 범위(성장) 전략이다.'),
    Q('q2', '경영전략', '산업분석', '5 Forces 모형에서 "구매자의 교섭력"이 커지는 상황은?', ['구매자가 많고 분산되어 있다', '전환비용이 낮다', '제품 차별화가 크다', '구매자가 후방통합 능력이 없다'], 1, '구매자의 전환비용이 낮으면 쉽게 공급자를 바꿀 수 있어 교섭력이 커진다.'),
    Q('q3', '경영전략', '포트폴리오', 'BCG 매트릭스에서 시장성장률은 높고 상대적 점유율은 낮은 사업은?', ['Star', 'Cash Cow', 'Question Mark', 'Dog'], 2, '고성장·저점유 사업은 Question Mark(물음표)다. 투자 여부를 결정해야 하는 단계다.'),
    Q('q4', '조직·인사', '동기부여', '허즈버그 2요인 이론에서 위생요인에 해당하는 것은?', ['성취감', '인정', '급여·근무조건', '일 자체의 보람'], 2, '급여·근무조건·회사정책은 불만을 줄이는 위생요인이다. 성취·인정·일 자체는 동기요인이다.'),
    Q('q5', '조직·인사', '조직구조', '사업부제 조직의 장점으로 가장 적절한 것은?', ['기능별 전문성 극대화', '사업 단위 성과책임 명확화', '자원 중복 최소화', '최고경영자 의사결정 집중'], 1, '사업부제는 사업 단위로 손익 책임을 지게 해 성과책임이 명확하다. 대신 자원이 중복될 수 있다.'),
    Q('q6', '조직·인사', '리더십', '구성원의 성숙도에 따라 리더십 스타일을 바꿔야 한다는 이론은?', ['허시-블랜차드 상황적 리더십', '맥그리거 X·Y이론', '매슬로 욕구단계', '피들러 LPC'], 0, '허시와 블랜차드는 구성원의 준비도(성숙도)에 따라 지시·코칭·지원·위임을 달리하라고 했다.'),
    Q('q7', '마케팅', 'STP', 'STP 전략의 순서로 옳은 것은?', ['타기팅 → 세분화 → 포지셔닝', '세분화 → 타기팅 → 포지셔닝', '포지셔닝 → 세분화 → 타기팅', '세분화 → 포지셔닝 → 타기팅'], 1, '시장을 나누고(Segmentation), 목표를 고르고(Targeting), 위치를 정한다(Positioning).'),
    Q('q8', '마케팅', '가격', '신제품 출시 때 높은 가격으로 시작해 점차 낮추는 전략은?', ['침투가격', '스키밍가격', '단수가격', '묶음가격'], 1, '초기 고가로 혁신 수용층의 지불의사를 흡수하는 것이 스키밍(초기 고가) 전략이다.'),
    Q('q9', '마케팅', '고객관리', '고객생애가치(CLV)를 높이는 직접적인 방법이 아닌 것은?', ['재구매율 향상', '객단가 향상', '이탈률 감소', '신규 고객 획득단가 증가'], 3, '획득단가 증가는 비용 쪽 요인이다. CLV는 유지기간·구매빈도·객단가·마진으로 커진다.'),
    Q('q10', '회계', '재무제표', '재무상태표의 기본 등식은?', ['자산 = 부채 + 자본', '자산 = 수익 − 비용', '자본 = 자산 + 부채', '부채 = 자산 + 자본'], 0, '자산은 타인자본(부채)과 자기자본(자본)으로 조달된다.'),
    Q('q11', '회계', '원가', '조업도가 늘어도 총액이 일정한 원가는?', ['변동원가', '고정원가', '준변동원가', '기회원가'], 1, '임차료처럼 조업도와 무관하게 총액이 일정한 원가가 고정원가다. 단위당 고정원가는 조업도가 늘면 줄어든다.'),
    Q('q12', '회계', '손익분기', '고정비 3,000만원, 단위당 공헌이익 1만원일 때 손익분기 판매량은?', ['300개', '3,000개', '30,000개', '300,000개'], 1, '손익분기 판매량 = 고정비 ÷ 단위당 공헌이익 = 3,000만 ÷ 1만 = 3,000개.'),
    Q('q13', '재무', '화폐의 시간가치', '할인율이 높아지면 미래 현금흐름의 현재가치는?', ['커진다', '작아진다', '변하지 않는다', '알 수 없다'], 1, '현재가치 = 미래가치 ÷ (1+r)^n 이므로 r이 커지면 현재가치는 작아진다.'),
    Q('q14', '재무', '투자결정', 'NPV가 0보다 크다는 의미로 옳은 것은?', ['IRR이 할인율보다 낮다', '투자로 기업가치가 증가한다', '회수기간이 1년 이내다', '회계이익이 흑자다'], 1, 'NPV > 0이면 요구수익률을 넘는 가치를 창출해 기업가치가 증가한다.'),
    Q('q15', '재무', '레버리지', '부채비율이 높아질 때 일반적으로 커지는 것은?', ['재무위험', '영업위험', '매출총이익률', '재고회전율'], 0, '부채가 늘면 이자 부담이 고정적으로 생겨 재무위험(재무레버리지)이 커진다.'),
    Q('q16', '경제', '수요공급', '대체재 가격이 오르면 해당 재화의 수요곡선은?', ['왼쪽 이동', '오른쪽 이동', '곡선 위 이동', '변화 없음'], 1, '대체재가 비싸지면 이 재화를 더 찾으므로 수요곡선 자체가 오른쪽으로 이동한다.'),
    Q('q17', '경제', '탄력성', '가격탄력성이 1보다 큰(탄력적) 재화의 가격을 내리면 총수입은?', ['감소', '증가', '불변', '0이 된다'], 1, '탄력적 재화는 가격 하락률보다 수요 증가율이 커서 총수입이 늘어난다.'),
    Q('q18', '경제', '거시경제', '중앙은행이 기준금리를 올렸을 때 단기적으로 예상되는 효과는?', ['투자 증가', '물가 상승 압력 완화', '대출 수요 증가', '자국 통화 약세'], 1, '금리 인상은 소비·투자를 줄여 총수요를 낮추고 물가 상승 압력을 완화한다.'),
    Q('q19', '운영관리', '재고', '경제적 주문량(EOQ) 모형에서 주문비용이 늘면 EOQ는?', ['감소', '증가', '불변', '0'], 1, 'EOQ = √(2DS/H). 주문비용 S가 커지면 EOQ도 커진다.'),
    Q('q20', '운영관리', '품질', '6시그마의 DMAIC 단계 순서로 옳은 것은?', ['정의-측정-분석-개선-관리', '측정-정의-분석-관리-개선', '분석-정의-측정-개선-관리', '정의-분석-측정-관리-개선'], 0, 'Define-Measure-Analyze-Improve-Control 순서다.'),
    Q('q21', '운영관리', '공정', '병목공정에 대한 설명으로 옳은 것은?', ['가장 빠른 공정이다', '전체 산출량을 결정한다', '없애도 산출량은 같다', '재고와 무관하다'], 1, '제약이론(TOC)에서 병목공정의 처리능력이 전체 시스템 산출량을 결정한다.'),
    Q('q22', '경영정보·AI', 'AI 활용', '생성형 AI의 "환각(hallucination)"에 대한 대응으로 가장 적절한 것은?', ['출력은 항상 사실이므로 그대로 쓴다', '출처 확인·근거 문서 연결(RAG)로 검증한다', '프롬프트를 짧게만 쓴다', '모델 온도를 최대로 올린다'], 1, '근거 문서를 연결하고 출처를 확인하는 절차가 환각을 줄이는 기본 대응이다.'),
    Q('q23', '경영정보·AI', '데이터', 'KPI 대시보드 설계 원칙으로 가장 적절한 것은?', ['지표는 많을수록 좋다', '핵심 지표를 소수로 두고 정의·출처를 명시한다', '추정치와 실측치를 구분하지 않는다', '글씨를 작게 해 한 화면에 모두 넣는다'], 1, '핵심 지표를 줄이고 정의·출처·신뢰도를 밝혀야 의사결정에 쓸 수 있다.'),
    Q('q24', '경영정보·AI', '정보시스템', 'ERP 도입의 주된 목적은?', ['부서별 시스템 분리', '전사 자원 정보의 통합 관리', '종이 문서 확대', '고객 접점만 관리'], 1, 'ERP는 회계·구매·생산·인사 등 전사 자원 정보를 하나의 시스템으로 통합한다.'),
    Q('q25', '기업윤리', 'CSR', '캐롤의 CSR 피라미드에서 가장 기초가 되는 책임은?', ['자선적 책임', '윤리적 책임', '법적 책임', '경제적 책임'], 3, '캐롤은 경제적 → 법적 → 윤리적 → 자선적 책임 순으로 피라미드를 쌓았다.'),
    Q('q26', '기업윤리', '이해관계자', '이해관계자 이론의 핵심 주장은?', ['주주 이익만 고려한다', '기업은 다양한 이해관계자에 대한 책임이 있다', '정부 규제만 따르면 된다', '단기 이익이 최우선이다'], 1, '프리먼의 이해관계자 이론은 주주 외 직원·고객·지역사회 등에 대한 책임을 강조한다.'),
    Q('q27', '기업윤리', '지배구조', 'ESG에서 G가 뜻하는 것은?', ['Growth', 'Governance', 'Green', 'Global'], 1, 'G는 지배구조(Governance)로, 이사회 독립성·투명성 등을 다룬다.')
  ];

  // 풀이 이력(최근 7일 + 그 이전) — 복습 도전 50:50 확인용
  const attempts = [];
  const hist = [['q1', -1, true], ['q4', -1, false], ['q7', -2, true], ['q10', -2, true], ['q13', -3, false], ['q16', -4, true], ['q19', -5, true], ['q22', -6, true],
    ['q2', -12, true], ['q5', -14, false], ['q8', -15, true], ['q11', -18, true], ['q14', -20, false], ['q17', -22, true], ['q20', -25, true], ['q25', -28, true]];
  hist.forEach(([qid, d, c], i) => attempts.push({ id: 'at' + i, question_id: qid, chosen: null, correct: c, mode: '학습', at: T(d, 8) }));
  const xp = attempts.length;

  const rewardRules = [
    { version: 'v1.0', effective_from: D(0), reason: '최초 기준(인계문서 V01 §5-2 기본값)' }
  ];

  window.MOCK = { today: D(0), D, ORGS, tags, directives, ideas, dailyTasks, achievements, wallet, usage, providers, features, topSkills, waiting, depts, issues, calendar, SUBJECTS, questions, attempts, xp, rewardRules };
})();
