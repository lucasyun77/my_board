//! 깃허브 합치기 — 화면이 부르는 타우리 명령 다섯 개.
//! 실제 일은 타우리와 무관한 `itda_git` 묶음이 한다(리눅스에서 시험 가능).
//!
//! 화면과 맺은 약속(설계서 `itda/docs/10-깃허브합치기설계.md` 3장, 칸 이름은 낙타 표기)
//!  - `git_check()` → `{ installed, version }`
//!  - `git_prepare({ sessionId, repo, baseBranch, branch, dir? })` → `{ dir, branch, created }`
//!  - `git_status({ dir })` → `{ branch, changed, ahead, behind, head }`
//!  - `git_save_push({ dir, message })` → `{ branch, commit, pushed, nothingToCommit }`
//!  - `git_head({ dir })` → `{ branch, commit }`
//!  - 오류는 한국어 문장(문자열)으로 돌려준다.

use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn 문서_폴더(app: &AppHandle) -> PathBuf {
    app.path()
        .document_dir()
        .or_else(|_| app.path().home_dir())
        .unwrap_or_else(|_| std::env::temp_dir())
}

/// 깃은 시간이 걸리는 일이라 화면이 멈추지 않게 따로 돌린다
async fn 따로_돌리기<T, F>(f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| format!("깃 작업이 중간에 멈췄습니다: {e}"))?
}

#[tauri::command]
pub async fn git_check() -> Result<itda_git::CheckResult, String> {
    따로_돌리기(|| Ok(itda_git::check())).await
}

#[tauri::command]
pub async fn git_prepare(
    app: AppHandle,
    session_id: String,
    repo: String,
    base_branch: String,
    branch: String,
    dir: Option<String>,
) -> Result<itda_git::Prepared, String> {
    let 폴더 = match dir.as_deref().map(str::trim).filter(|d| !d.is_empty()) {
        Some(d) => PathBuf::from(d),
        None => itda_git::default_dir(&문서_폴더(&app), &repo, &session_id),
    };
    따로_돌리기(move || {
        itda_git::prepare(&itda_git::PrepareArgs {
            repo: &repo,
            base_branch: &base_branch,
            branch: &branch,
            dir: &폴더,
        })
    })
    .await
}

#[tauri::command]
pub async fn git_status(dir: String) -> Result<itda_git::Status, String> {
    따로_돌리기(move || itda_git::status(&PathBuf::from(dir))).await
}

#[tauri::command]
pub async fn git_save_push(dir: String, message: String) -> Result<itda_git::SavePushed, String> {
    따로_돌리기(move || itda_git::save_push(&PathBuf::from(dir), &message, None, None)).await
}

#[tauri::command]
pub async fn git_head(dir: String) -> Result<itda_git::Head, String> {
    따로_돌리기(move || itda_git::head(&PathBuf::from(dir))).await
}
