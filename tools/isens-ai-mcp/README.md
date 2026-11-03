# 아이센스 사내 AI(Qwen) 로컬 커넥터

회장 현황판의 AI 리포트·추천·진행 기록 요약·칭찬 초안을 Claude 대신 **사내 AI(Qwen3.8-Flash-Next)** 로 돌리기 위한 작은 연결 프로그램입니다.
사내 AI 서버(`isens-1544.asuscomm.com`)는 **회사 네트워크에서만** 열리므로, 회사 네트워크에 있는 PC의 **Claude 데스크톱 앱**에 붙여서 씁니다.

## 준비물
- 회사 네트워크에 연결된 PC, Claude 데스크톱 앱(로그인: boss@isens.camp)
- Node.js 18 이상 (`node -v` 로 확인)
- 사내 AI API 키: PC가맹부 조상준 과장에게 메신저로 요청(1인 1키, 본인만 사용)

## 설치 (한 번만)
1. 이 폴더의 `server.mjs` 를 PC에 저장합니다. 예: `C:\isens-ai\server.mjs` 또는 `~/isens-ai/server.mjs`
2. Claude 데스크톱 앱 → 설정 → 개발자 → 「설정 편집」으로 `claude_desktop_config.json` 을 열고 아래를 넣습니다.

```json
{
  "mcpServers": {
    "isens-ai": {
      "command": "node",
      "args": ["C:\\isens-ai\\server.mjs"],
      "env": {
        "ISENS_AI_KEY": "여기에 조상준 과장에게 받은 키",
        "ISENS_AI_URL": "https://isens-1544.asuscomm.com/v1/chat/completions",
        "ISENS_AI_MODEL": "Qwen3.8-Flash-Next"
      }
    }
  }
}
```
3. Claude 데스크톱 앱을 완전히 껐다 켭니다. 설정 → 개발자에서 `isens-ai` 가 「실행 중」이면 됩니다.
4. 데스크톱 앱에서 회장 현황판을 열면 지시 관리 상단에 「기본 AI 사내 AI · 연결됨」이 보입니다. 처음 한 번 사용 허용을 묻습니다.

## 알아 둘 점
- 키는 이 설정 파일에만 적습니다. 채팅·저장소·현황판에는 적지 않습니다.
- API 주소·형식은 OpenAI 호환(`/v1/chat/completions`)으로 가정했습니다. 다르면 조상준 과장에게 받은 주소로 `ISENS_AI_URL` 만 바꾸면 됩니다.
- 업무시간(08~18시)에는 한 사람당 동시에 1건만 처리되어 차례를 기다릴 수 있습니다(최대 4분 대기).
- 브라우저나 회사 밖에서 현황판을 열면 사내 AI를 쓸 수 없고, 그때는 리포트 작성이 멈춥니다(필요하면 태스크별로 Claude를 골라 쓸 수 있음).
- 오픈베타 기간은 11/9 18시까지(예정)입니다. 이후 운영 방식이 바뀌면 주소·키만 바꾸면 됩니다.
