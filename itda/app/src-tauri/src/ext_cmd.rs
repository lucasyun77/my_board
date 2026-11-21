//! 「앱 고치기」 작업 폴더 — 화면이 부르는 타우리 명령 두 개.
//! 실제 일은 타우리와 무관한 `itda_extws` 묶음이 한다(리눅스에서 시험 가능).
//!
//! 화면과 맺은 약속
//!  - `ext_workspace()` → `{ dir, layout: object|null, extensions: [{ manifest, files: { "파일이름": "내용" } }], warnings: [한국어 문장] }`
//!      폴더 `문서 폴더/iSensTogether/앱고치기` 를 만들고, 안내서를 앱에 담긴 판으로 맞춘다.
//!  - `ext_write_layout({ layout })` → `()`  바뀐 배치를 `layout.json` 에 쓴다.
//!  - 오류는 한국어 문장(문자열)으로 돌려준다.

use serde_json::Value;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// 앱에 담긴 안내서
const GUIDE: &str = include_str!("../../ext-guide/CLAUDE.md");

fn workspace_dir(app: &AppHandle) -> PathBuf {
    let docs = app
        .path()
        .document_dir()
        .or_else(|_| app.path().home_dir())
        .unwrap_or_else(|_| std::env::temp_dir());
    docs.join("iSensTogether").join("앱고치기")
}

#[tauri::command]
pub async fn ext_workspace(app: AppHandle) -> Result<itda_extws::Workspace, String> {
    let dir = workspace_dir(&app);
    itda_extws::load_workspace(&dir, GUIDE)
}

#[tauri::command]
pub async fn ext_write_layout(app: AppHandle, layout: Value) -> Result<(), String> {
    let dir = workspace_dir(&app);
    itda_extws::write_layout(&dir, &layout)
}
