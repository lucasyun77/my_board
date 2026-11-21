//! 회사 구글 계정 로그인 — 화면이 부르는 타우리 명령 두 개.
//! 실제 일은 타우리와 무관한 `itda_login` 묶음이 한다(리눅스에서 시험 가능).
//!
//! 화면과 맺은 약속
//!  - `google_sign_in({ clientId, clientSecret, domain })`
//!      → `{ idToken, refreshToken, expiresAt, email, name }`
//!  - `google_refresh({ clientId, clientSecret, refreshToken })`
//!      → `{ idToken, expiresAt }`
//!  - 오류는 한국어 문장(문자열)으로 돌려준다.
//!
//! 주의: 새로 고침 토큰은 지금은 화면이 들고 있는다.
//! 나중에 윈도우 자격 증명 보관소로 옮겨야 함(앱 본체가 보관하고 화면에는 내주지 않도록).

use itda_login::{Refreshed, SignIn};

/// 기본 브라우저로 구글 로그인 창을 열고, 돌아오면 토큰으로 바꿔 돌려준다(5분 안에 안 돌아오면 오류).
#[tauri::command]
pub async fn google_sign_in(client_id: String, client_secret: String, domain: String) -> Result<SignIn, String> {
    itda_login::sign_in(&client_id, &client_secret, &domain, itda_login::open_browser).await
}

/// 새로 고침 토큰으로 새 신분증(ID 토큰)을 받는다.
#[tauri::command]
pub async fn google_refresh(client_id: String, client_secret: String, refresh_token: String) -> Result<Refreshed, String> {
    itda_login::refresh(&client_id, &client_secret, &refresh_token).await
}
