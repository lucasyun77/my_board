# 경영학습 문제은행 — 공개 자료 추천 (Claude 조사, 2026-11-02)

라이선스는 수입 직전 각 데이터 카드에서 다시 확인한다. 모든 문항에 `source`, `license`, `source_ref`(원문 ID)를 보존한다.

| 판단 | 자료 | 언어 | 범위 | 라이선스 | 쓰는 방법 |
|---|---|---|---|---|---|
| **1순위** | [Global-MMLU (CohereLabs) — ko](https://huggingface.co/datasets/CohereLabs/Global-MMLU) | 한국어(번역·검수) | MMLU 57과목 중 management, marketing, business_ethics, professional_accounting, high_school_macro/microeconomics, econometrics 등 | Apache-2.0 | 수입 권장. 수정·해설 추가·상업 이용 가능, 출처 표기 |
| **1순위** | [OpenStax 경영 교재](https://openstax.org/subjects/business) (Principles of Management, Principles of Marketing, Introduction to Business, Organizational Behavior, Entrepreneurship, Principles of Economics) | 영어 | 개념 읽기 본문 + 장별 복습 문제 | CC BY 4.0 (교재별 확인) | "개념 읽기" 소재. 번역·요약 허용, 출처 표기. **Principles of Accounting은 CC BY-NC-SA** → 제외 또는 비상업 조건 준수 |
| 2순위 | [MMLU 원본 (cais/mmlu)](https://huggingface.co/datasets/cais/mmlu) | 영어 | 위와 같음 | MIT | 원문 대조용 |
| 조건부 | [KMMLU (HAERAE-HUB)](https://huggingface.co/datasets/HAERAE-HUB/KMMLU) | 한국어(국가자격시험 기반) | Accounting, Management, Marketing, Economics, Taxation 등 | CC BY-ND 4.0 | 변경 금지. 원문 그대로 출제는 가능, AI 해설 덧붙이기가 "변경"에 해당하는지 검토 필요 |
| 보류 | [KMMLU-Redux](https://huggingface.co/datasets/LGAI-EXAONE/KMMLU-Redux) / [KMMLU-Pro](https://huggingface.co/datasets/LGAI-EXAONE/KMMLU-Pro) (LGAI-EXAONE) | 한국어(전문자격) | 2,587 / 2,822문항 | CC BY-NC-ND 4.0, 접근 동의 필요 | 비상업·변경 금지 → 법무 확인 전 보류 |
| 확인 필요 | Virginia Tech "Strategic Management" 공개 교재 | 영어 | 전략경영 | 교재 페이지 확인 | 착수 시 재확인 |
| 제외 | 큐넷 등 시험 기출 원문 | 한국어 | - | 저작권 별도 | 무단 수입 금지 |

## 추천 조합
- **문제**: Global-MMLU 한국어판(경영·경제·회계·윤리 과목) → 과목 9개에 매핑
- **개념 읽기**: OpenStax(CC BY) 장 요약 번역
- **해설**: 원자료에 해설이 없으므로 AI 해설을 붙이고 `AI 생성 해설`로 표시
- KMMLU는 원문 그대로 "도전 문제"로만 쓸지 회장님 판단 필요

## 과목 매핑(안)
| 현황판 과목 | Global-MMLU subject |
|---|---|
| 경영전략·조직·인사 | management |
| 마케팅 | marketing |
| 회계 | professional_accounting |
| 재무 | professional_accounting(일부), OpenStax 보강 |
| 경제 | high_school_macroeconomics, high_school_microeconomics, econometrics |
| 경영정보·AI | OpenStax Introduction to Business 정보시스템 장 + 보강 필요 |
| 기업윤리 | business_ethics |
| 운영관리 | 해당 과목 없음 → OpenStax 보강 필요 |

※ 목업의 27문항은 Claude가 쓴 샘플이며 실제 데이터 수입 시 교체한다.
