// 잇다 시연용 자료. 시각 숫자는 "지금으로부터 몇 분 전"을 뜻한다(화면·서버가 실제 시각으로 바꿈).
// 사람 이름은 모두 지어낸 예시다.
window.ITDA_DEMO = {
  "seq": 1000,
  "members": [
    {"id": "u-choi", "name": "최민준", "computer": "기획팀 노트북", "role": "팀장·기획", "online": true, "lastSeen": 1, "helpLevel": 2},
    {"id": "u-kim", "name": "김하늘", "computer": "디자인실 아이맥", "role": "디자이너", "online": true, "lastSeen": 1, "helpLevel": 3},
    {"id": "u-lee", "name": "이도윤", "computer": "개발실 데스크톱", "role": "개발자", "online": true, "lastSeen": 2, "helpLevel": 1},
    {"id": "u-park", "name": "박서연", "computer": "마케팅 노트북", "role": "마케터", "online": false, "lastSeen": 40, "helpLevel": 2}
  ],
  "projects": [
    {"id": "p-app", "name": "벌툰 예약 앱", "kind": "개발", "goal": "12월 첫 주 사내 시범 출시: 매장 예약·대기 알림", "guide": "디자인은 김하늘 담당, 합치기는 팀 메인 세션이 한다. 쉬운 우리말 화면 문구.", "ownerId": "u-choi", "members": ["u-choi", "u-kim", "u-lee", "u-park"], "createdAt": 4000},
    {"id": "p-cos", "name": "K화장품 새 라인", "kind": "사업", "goal": "진정 크림 라인 컨셉·상세페이지·견본 발송 메일", "guide": "본 브랜드의 순한 성분 원칙을 지킨다.", "ownerId": "u-choi", "members": ["u-choi", "u-park", "u-kim"], "createdAt": 3000}
  ],
  "sessions": [
    {"id": "s-team", "projectId": "p-app", "ownerId": "u-choi", "title": "팀 메인 (지휘)", "isMain": true, "isTeamMain": true, "status": "working", "lastActivity": 1, "createdAt": 4000},
    {"id": "s-plan", "projectId": "p-app", "ownerId": "u-choi", "title": "요구사항 정리", "isMain": false, "isTeamMain": false, "status": "waiting", "lastActivity": 25, "createdAt": 3900},
    {"id": "s-kim-main", "projectId": "p-app", "ownerId": "u-kim", "title": "김하늘 메인", "isMain": true, "isTeamMain": false, "status": "working", "lastActivity": 1, "createdAt": 3800},
    {"id": "s-kim-login", "projectId": "p-app", "ownerId": "u-kim", "title": "로그인·예약 화면 시안", "isMain": false, "isTeamMain": false, "status": "working", "lastActivity": 2, "createdAt": 3700},
    {"id": "s-kim-icon", "projectId": "p-app", "ownerId": "u-kim", "title": "아이콘 세트", "isMain": false, "isTeamMain": false, "status": "stalled", "lastActivity": 18, "createdAt": 3600},
    {"id": "s-lee-main", "projectId": "p-app", "ownerId": "u-lee", "title": "이도윤 메인", "isMain": true, "isTeamMain": false, "status": "working", "lastActivity": 1, "createdAt": 3800},
    {"id": "s-lee-api", "projectId": "p-app", "ownerId": "u-lee", "title": "예약 서버", "isMain": false, "isTeamMain": false, "status": "working", "lastActivity": 3, "createdAt": 3500},
    {"id": "s-lee-test", "projectId": "p-app", "ownerId": "u-lee", "title": "시험 자동화", "isMain": false, "isTeamMain": false, "status": "stalled", "lastActivity": 35, "createdAt": 3400},
    {"id": "s-park-main", "projectId": "p-app", "ownerId": "u-park", "title": "박서연 메인", "isMain": true, "isTeamMain": false, "status": "waiting", "lastActivity": 40, "createdAt": 3300},
    {"id": "s-cos-team", "projectId": "p-cos", "ownerId": "u-choi", "title": "팀 메인 (지휘)", "isMain": true, "isTeamMain": true, "status": "working", "lastActivity": 6, "createdAt": 3000},
    {"id": "s-cos-park", "projectId": "p-cos", "ownerId": "u-park", "title": "상세페이지 문안", "isMain": true, "isTeamMain": false, "status": "working", "lastActivity": 4, "createdAt": 2900},
    {"id": "s-cos-kim", "projectId": "p-cos", "ownerId": "u-kim", "title": "용기 디자인", "isMain": true, "isTeamMain": false, "status": "waiting", "lastActivity": 15, "createdAt": 2800}
  ],
  "logs": {
    "s-team": [
      {"ts": 30, "kind": "sys", "text": "팀 메인 세션: 오케스트라 지침을 불러왔습니다. (요청 받기 → 순서 정하기 → 합치기 → 알리기)", "from": "u-choi"},
      {"ts": 12, "kind": "req", "text": "[김하늘 · 김하늘 메인] 「로그인 화면 시안」 v3 합치기 요청: 예약 버튼 색을 잇다 주황으로 바꿨어요. 앱에 반영해 주세요.", "from": "u-kim"},
      {"ts": 11, "kind": "in", "text": "김하늘 님 시안 v3을 예약 서버 화면 틀에 합쳐 줘. 이도윤 님 작업과 겹치는지 먼저 확인해.", "from": "u-choi"},
      {"ts": 10, "kind": "out", "text": "확인했습니다. 이도윤 님의 「예약 서버」는 화면 파일을 건드리지 않아 겹침이 없습니다.\n1) 시안 v3의 색·간격을 화면 틀에 반영\n2) 예약 버튼 문구 「예약하기」로 통일\n3) 합친 결과를 「앱 화면 묶음」 v5로 올림", "from": "u-choi"},
      {"ts": 9, "kind": "sys", "text": "산출물 「앱 화면 묶음」 v5 을 올렸습니다.", "from": "u-choi"},
      {"ts": 2, "kind": "coach", "text": "[AI 본부장] 계획서 7번 「대기 알림 문구」 담당자가 없습니다. 박서연 님께 맡길까요?", "from": "agent"}
    ],
    "s-kim-login": [
      {"ts": 50, "kind": "sys", "text": "세션이 열렸습니다.", "from": "u-kim"},
      {"ts": 45, "kind": "in", "text": "벌툰 매장 예약 앱 로그인 화면을 만들어 줘. 따뜻한 베이지 바탕, 큰 예약 버튼.", "from": "u-kim"},
      {"ts": 44, "kind": "out", "text": "로그인 화면 시안 v1을 만들었습니다. 바탕 #F6F1E7, 버튼 높이 56으로 손가락으로 누르기 쉽게 했습니다.", "from": "u-kim"},
      {"ts": 20, "kind": "in", "text": "버튼 색을 잇다 주황으로, 카카오 로그인 버튼 추가", "from": "u-kim"},
      {"ts": 19, "kind": "out", "text": "v3으로 고쳤습니다. 주황 #FF7A45, 간편 로그인 버튼 2개를 아래에 두었습니다.", "from": "u-kim"},
      {"ts": 13, "kind": "in", "text": "/보내기 예약 버튼 색을 잇다 주황으로 바꿨어요. 앱에 반영해 주세요.", "from": "u-kim"},
      {"ts": 12, "kind": "sys", "text": "「팀 메인 (지휘)」 세션으로 요청을 보냈습니다.", "from": "u-kim"},
      {"ts": 2, "kind": "out", "text": "예약 확인 화면 작업 중… 날짜 고르기 달력 만드는 중", "from": "u-kim"}
    ],
    "s-kim-icon": [
      {"ts": 30, "kind": "out", "text": "아이콘 12개 중 7개 완료.", "from": "u-kim"},
      {"ts": 17, "kind": "req", "text": "[AI 본부장 지시] 다음 일: 나머지 아이콘 5개(알림·지도·쿠폰·내정보·설정) — 끝나면 산출물을 올리고 완료 표시해 주세요.", "from": "agent"}
    ],
    "s-lee-api": [
      {"ts": 60, "kind": "in", "text": "cargo new booking-api", "from": "u-lee"},
      {"ts": 59, "kind": "out", "text": "     Created binary (application) `booking-api` package", "from": "u-lee"},
      {"ts": 8, "kind": "in", "text": "cargo test", "from": "u-lee"},
      {"ts": 7, "kind": "out", "text": "running 14 tests\ntest 예약_겹침_막기 ... ok\ntest 대기_순번_알림 ... ok\ntest result: ok. 14 passed; 0 failed", "from": "u-lee"},
      {"ts": 3, "kind": "out", "text": "예약 취소 기능 작성 중 (취소 후 대기 1번에게 알림)", "from": "u-lee"}
    ],
    "s-lee-test": [
      {"ts": 36, "kind": "out", "text": "화면 시험 5개 중 3개 통과, 2개 실패(로그인 버튼 위치 바뀜)", "from": "u-lee"},
      {"ts": 34, "kind": "coach", "text": "[AI 본부장 제안] 로그인 시안이 v3으로 바뀌었습니다. 시험의 버튼 위치 기준을 v3에 맞춰 고치면 됩니다.", "from": "agent"}
    ],
    "s-kim-main": [
      {"ts": 14, "kind": "in", "text": "로그인 시안 v3을 팀 메인 세션에 보내서 합쳐 달라고 해", "from": "u-kim"},
      {"ts": 13, "kind": "out", "text": "「로그인·예약 화면 시안」 세션의 v3을 팀 메인에 합치기 요청으로 보냈습니다.", "from": "u-kim"}
    ],
    "s-lee-main": [
      {"ts": 5, "kind": "out", "text": "하위 세션 2개 진행 상황: 예약 서버(가동), 시험 자동화(멈춤 35분)", "from": "u-lee"}
    ],
    "s-cos-park": [
      {"ts": 6, "kind": "in", "text": "진정 크림 상세페이지 첫 문단을 써 줘. 본 브랜드의 순한 성분 원칙을 지켜.", "from": "u-park"},
      {"ts": 5, "kind": "out", "text": "「예민한 날의 피부에게, 다섯 가지 성분만.」 — 향료·알코올 없이 시카와 판테놀로 붉은 기를 가라앉힙니다.", "from": "u-park"}
    ]
  },
  "artifacts": [
    {"id": "a-login", "projectId": "p-app", "sessionId": "s-kim-login", "ownerId": "u-kim", "name": "로그인 화면 시안", "kind": "디자인", "versions": [
      {"v": 1, "ts": 44, "by": "u-kim", "note": "첫 시안", "content": ""},
      {"v": 2, "ts": 30, "by": "u-kim", "note": "글자 크기 키움", "content": ""},
      {"v": 3, "ts": 19, "by": "u-kim", "note": "잇다 주황 버튼, 간편 로그인", "content": "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 520'><rect width='300' height='520' rx='28' fill='#F6F1E7'/><text x='150' y='120' font-size='34' text-anchor='middle' fill='#1F2A44' font-weight='700'>벌툰 예약</text><text x='150' y='152' font-size='14' text-anchor='middle' fill='#6b7280'>기다림 없이 자리 잡기</text><rect x='30' y='210' width='240' height='48' rx='12' fill='#fff' stroke='#ddd'/><text x='46' y='240' font-size='14' fill='#9ca3af'>휴대폰 번호</text><rect x='30' y='272' width='240' height='56' rx='14' fill='#FF7A45'/><text x='150' y='306' font-size='18' text-anchor='middle' fill='#fff' font-weight='700'>예약하기</text><rect x='30' y='350' width='115' height='44' rx='12' fill='#FEE500'/><text x='87' y='377' font-size='13' text-anchor='middle'>간편 로그인 1</text><rect x='155' y='350' width='115' height='44' rx='12' fill='#1F2A44'/><text x='212' y='377' font-size='13' text-anchor='middle' fill='#fff'>간편 로그인 2</text></svg>"}
    ]},
    {"id": "a-icons", "projectId": "p-app", "sessionId": "s-kim-icon", "ownerId": "u-kim", "name": "아이콘 세트", "kind": "디자인", "versions": [
      {"v": 1, "ts": 40, "by": "u-kim", "note": "7개", "content": ""}
    ]},
    {"id": "a-bundle", "projectId": "p-app", "sessionId": "s-team", "ownerId": "u-choi", "name": "앱 화면 묶음", "kind": "코드", "versions": [
      {"v": 1, "ts": 300, "by": "u-choi", "note": "틀", "content": ""},
      {"v": 2, "ts": 200, "by": "u-choi", "note": "예약 목록", "content": ""},
      {"v": 3, "ts": 120, "by": "u-choi", "note": "로그인 시안 v1 합침", "content": ""},
      {"v": 4, "ts": 60, "by": "u-choi", "note": "예약 서버 연결", "content": ""},
      {"v": 5, "ts": 9, "by": "u-choi", "note": "로그인 시안 v3 합침", "content": "합친 화면 목록\n- 로그인 (시안 v3 · 김하늘)\n- 예약 목록 (이도윤 서버 연결)\n- 예약 확인\n- 대기 알림 (문구 담당자 미정)"}
    ]},
    {"id": "a-api", "projectId": "p-app", "sessionId": "s-lee-api", "ownerId": "u-lee", "name": "예약 서버", "kind": "코드", "versions": [
      {"v": 1, "ts": 58, "by": "u-lee", "note": "뼈대", "content": ""},
      {"v": 2, "ts": 30, "by": "u-lee", "note": "예약 겹침 막기", "content": ""},
      {"v": 3, "ts": 7, "by": "u-lee", "note": "시험 14개 통과", "content": "예약 서버 v3\n- 예약 만들기 / 바꾸기 / 취소\n- 같은 자리 같은 시각 겹침 막기\n- 대기 순번 알림\n시험 14개 통과"}
    ]},
    {"id": "a-req", "projectId": "p-app", "sessionId": "s-plan", "ownerId": "u-choi", "name": "요구사항 정리표", "kind": "문서", "versions": [
      {"v": 1, "ts": 80, "by": "u-choi", "note": "", "content": ""},
      {"v": 2, "ts": 26, "by": "u-choi", "note": "대기 알림 추가", "content": "1. 매장·날짜·인원 고르기\n2. 예약 확인 알림\n3. 대기 순번 알림\n4. 예약 취소 시 다음 대기자 알림"}
    ]},
    {"id": "a-copy", "projectId": "p-cos", "sessionId": "s-cos-park", "ownerId": "u-park", "name": "상세페이지 문안", "kind": "문서", "versions": [
      {"v": 1, "ts": 5, "by": "u-park", "note": "첫 문단", "content": "예민한 날의 피부에게, 다섯 가지 성분만.\n향료·알코올 없이 시카와 판테놀로 붉은 기를 가라앉힙니다."}
    ]},
    {"id": "a-mail", "projectId": "p-cos", "sessionId": "s-cos-team", "ownerId": "u-choi", "name": "견본 발송 메일", "kind": "이메일", "versions": [
      {"v": 1, "ts": 20, "by": "u-choi", "note": "초안", "content": "제목: 진정 크림 견본을 보내 드립니다\n\n안녕하세요, 새 진정 크림 견본을 보내 드립니다. 사용 후 느낌을 알려 주시면 출시 전에 반영하겠습니다."}
    ]}
  ],
  "channels": [
    {"id": "ch-all", "projectId": "p-app", "name": "전체", "kind": "channel", "members": []},
    {"id": "ch-design", "projectId": "p-app", "name": "디자인", "kind": "channel", "members": []},
    {"id": "ch-agent", "projectId": "p-app", "name": "본부장", "kind": "channel", "members": []},
    {"id": "dm-kim", "projectId": "p-app", "name": "김하늘", "kind": "dm", "members": ["u-choi", "u-kim"]},
    {"id": "ch-cos-all", "projectId": "p-cos", "name": "전체", "kind": "channel", "members": []},
    {"id": "ch-cos-agent", "projectId": "p-cos", "name": "본부장", "kind": "channel", "members": []}
  ],
  "messages": [
    {"id": "m1", "channelId": "ch-all", "from": "u-choi", "text": "오늘 목표: 로그인·예약 화면 합치고 예약 서버 연결까지!", "ts": 120},
    {"id": "m2", "channelId": "ch-all", "from": "u-lee", "text": "예약 서버 시험 14개 통과했습니다. 화면 쪽 붙여도 됩니다.", "ts": 7, "artifactId": "a-api"},
    {"id": "m3", "channelId": "ch-design", "from": "u-kim", "text": "로그인 시안 v3 올렸어요 @최민준 확인 부탁드려요", "ts": 18, "artifactId": "a-login"},
    {"id": "m4", "channelId": "ch-design", "from": "u-choi", "text": "좋아요! 팀 메인에서 합쳤습니다.", "ts": 8, "replyTo": "m3"},
    {"id": "m5", "channelId": "ch-agent", "from": "agent", "text": "안녕하세요, AI 본부장입니다. 오늘 이 앱을 쓰는 매장 직원이 가장 먼저 해야 하는 일은 무엇인가요? 그 답으로 화면 순서를 정하겠습니다.", "ts": 90},
    {"id": "m6", "channelId": "ch-agent", "from": "u-choi", "text": "손님 도착 확인이 제일 먼저예요. 예약자 이름만 보고 바로 체크.", "ts": 85},
    {"id": "m7", "channelId": "ch-agent", "from": "agent", "text": "위키 「사람들의 생각 기록」에 남겼습니다. 그렇다면 첫 화면은 「오늘 도착 예정」 목록이어야 합니다. 계획서에 「도착 확인 화면」을 추가하고 김하늘 님께 시안을 부탁할까요?", "ts": 84},
    {"id": "m8", "channelId": "dm-kim", "from": "u-kim", "text": "아이콘 5개 남았는데 오늘 오후에 끝낼게요", "ts": 16},
    {"id": "m9", "channelId": "ch-cos-agent", "from": "agent", "text": "본 브랜드 위키의 「순한 성분 원칙」을 이 팀 위키에 복제했습니다. 상세페이지 문안이 이 원칙을 지키는지 계속 확인하겠습니다.", "ts": 30}
  ],
  "wiki": [
    {"id": "w1", "projectId": "p-app", "title": "프로젝트 목표", "body": "12월 첫 주 사내 시범 출시: 매장 예약·대기 알림", "scope": "team", "by": "agent", "updatedAt": 100},
    {"id": "w2", "projectId": "p-app", "title": "화면 문구 규칙", "body": "- 쉬운 우리말\n- 버튼은 동사로 끝냄: 예약하기, 취소하기\n- 주색 #FF7A45, 바탕 #F6F1E7", "scope": "team", "by": "u-kim", "updatedAt": 50},
    {"id": "w3", "projectId": "p-app", "title": "사람들의 생각 기록", "body": "- 최민준: 손님 도착 확인이 제일 먼저. 예약자 이름만 보고 바로 체크.", "scope": "team", "by": "agent", "updatedAt": 84},
    {"id": "w4", "projectId": "p-app", "title": "합치기 순서 규칙", "body": "1. 디자인 시안은 팀 메인이 화면 묶음에 합친다\n2. 서버 변경은 시험 통과 후에만 합친다\n3. 겹치면 본부장이 두 사람에게 메신저로 묻는다", "scope": "team", "by": "u-choi", "updatedAt": 200},
    {"id": "w5", "projectId": "p-app", "title": "회사 공통: 브랜드 말투", "body": "모든 팀 공통. 친절하지만 짧게. 과장 표현 금지.", "scope": "common", "by": "agent", "updatedAt": 500},
    {"id": "w6", "projectId": "p-cos", "title": "순한 성분 원칙 (본 브랜드에서 복제)", "body": "- 향료·알코올·색소 넣지 않음\n- 핵심 성분 5개 이하\n- 효능 표현은 식약처 기준 안에서", "scope": "common", "by": "agent", "updatedAt": 30}
  ],
  "plan": [
    {"id": "t1", "projectId": "p-app", "title": "요구사항 정리표", "ownerId": "u-choi", "done": true, "artifactId": "a-req", "when": "오늘"},
    {"id": "t2", "projectId": "p-app", "title": "로그인 화면 시안", "ownerId": "u-kim", "done": true, "artifactId": "a-login", "when": "오늘"},
    {"id": "t3", "projectId": "p-app", "title": "예약 서버 기본 기능", "ownerId": "u-lee", "done": true, "artifactId": "a-api", "when": "오늘"},
    {"id": "t4", "projectId": "p-app", "title": "아이콘 12개", "ownerId": "u-kim", "done": false, "when": "오늘"},
    {"id": "t5", "projectId": "p-app", "title": "화면 시험 자동화", "ownerId": "u-lee", "done": false, "when": "오늘"},
    {"id": "t6", "projectId": "p-app", "title": "예약 취소·다음 대기자 알림", "ownerId": "u-lee", "done": false, "when": "오늘"},
    {"id": "t7", "projectId": "p-app", "title": "대기 알림 문구", "ownerId": "", "done": false, "when": "오늘"},
    {"id": "t8", "projectId": "p-app", "title": "도착 확인 화면", "ownerId": "u-kim", "done": false, "when": "내일"},
    {"id": "t9", "projectId": "p-app", "title": "매장 안내 문서", "ownerId": "u-park", "done": true, "when": "오늘"},
    {"id": "t10", "projectId": "p-cos", "title": "상세페이지 문안", "ownerId": "u-park", "done": false, "artifactId": "a-copy", "when": "오늘"},
    {"id": "t11", "projectId": "p-cos", "title": "견본 발송 메일", "ownerId": "u-choi", "done": false, "artifactId": "a-mail", "when": "오늘"}
  ],
  "coach": [
    {"id": "c1", "projectId": "p-app", "sessionId": "s-kim-icon", "level": "warn", "text": "김하늘 님의 「아이콘 세트」 세션이 18분 넘게 멈춰 있습니다.", "ts": 17},
    {"id": "c2", "projectId": "p-app", "sessionId": "s-lee-test", "level": "warn", "text": "이도윤 님의 「시험 자동화」 세션이 35분 넘게 멈춰 있습니다.", "ts": 33},
    {"id": "c3", "projectId": "p-app", "level": "check", "text": "검수: 「매장 안내 문서」는 완료 표시됐지만 연결된 산출물이 없습니다. 빠진 것이 없는지 확인해 주세요.", "ts": 10},
    {"id": "c4", "projectId": "p-app", "sessionId": "s-team", "level": "info", "text": "팀 메인이 로그인 시안 v3을 합쳤지만, 위키 「화면 문구 규칙」의 버튼 문구(동사로 끝냄) 확인이 빠졌습니다.", "ts": 8}
  ],
  "requests": [
    {"id": "r1", "projectId": "p-app", "fromSession": "s-kim-main", "toSession": "s-team", "artifactId": "a-login", "note": "예약 버튼 색을 잇다 주황으로 바꿨어요. 앱에 반영해 주세요.", "status": "합침", "ts": 12},
    {"id": "r2", "projectId": "p-app", "fromSession": "s-lee-main", "toSession": "s-team", "artifactId": "a-api", "note": "예약 취소 기능 붙으면 화면에 취소 버튼 추가 부탁", "status": "대기", "ts": 4}
  ],
  "boards": [
    {"id": "b1", "projectId": "p-app", "name": "출시 준비판", "widgets": ["goal", "progress", "followup", "coach"], "by": "u-choi"},
    {"id": "b2", "projectId": "p-app", "name": "팀원 업무량", "widgets": ["workload", "uptime", "requests"], "by": "u-choi"}
  ]
};
