# 잇다 — 서로 다른 컴퓨터의 AI 세션을 잇는 팀 협업 앱 (시제품 0.1.0)

| 무엇 | 어디 |
|---|---|
| 윈도우용 실행 묶음 (내려받아 바로 실행) | `release/Itda-0.1.0-windows-x64.zip` |
| 기획서 | `docs/01-기획서.md` |
| 개발 계획서 | `docs/02-개발계획서.md` |
| 제품설명서 | `docs/03-제품설명서.md` |
| 브랜드 기획서 | `docs/04-브랜드기획서.md` |
| 동료용 쉬운 설명서 | `docs/05-쉬운설명서-동료용.md` |
| 투자 설명 자료(발표 원고 12장) | `docs/06-투자유치자료.md` |
| 사용 설명 그림 9장 | `manual/` |
| 중계 서버 + AI 본부장 (러스트) | `relay/` |
| 윈도우 데스크톱 앱 (러스트·타우리) | `app/src-tauri/` |
| 화면 (자바스크립트·HTML·CSS) | `app/ui/` — `index.html`을 브라우저로 열면 시연 방식 |

## 빠른 실행
```
cargo test -p itda-relay                       # 본부장 시험 5개
cargo run -p itda-relay -- --demo --port 7878  # 브라우저로 http://localhost:7878
```
윈도우 설치 파일: 저장소의 `.github/workflows/itda-windows.yml` 작업이 윈도우 서버에서 만든다.
