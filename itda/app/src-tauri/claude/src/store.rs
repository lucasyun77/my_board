//! 잇다 세션 번호 → 클로드 세션 번호 연결표(파일 하나, JSON).
//!
//! 파일 모양: `{ "잇다세션번호": { "claudeSessionId": "…", "cwd": "…" } }`
//! 클로드 코드는 대화 기록을 작업 폴더별로 보관하므로, 이어 가려면 같은 작업 폴더로 켜야 한다.
//! 그래서 작업 폴더도 함께 적어 둔다.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Link {
    pub claude_session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
}

#[derive(Debug)]
pub struct SessionMap {
    path: Option<PathBuf>,
    links: BTreeMap<String, Link>,
}

impl SessionMap {
    /// 파일에서 불러온다. 파일이 없거나 깨졌으면 빈 표로 시작한다.
    pub fn load(path: impl Into<PathBuf>) -> Self {
        let path = path.into();
        let links = std::fs::read(&path)
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        SessionMap { path: Some(path), links }
    }

    /// 파일에 남기지 않는 표(시험용)
    pub fn in_memory() -> Self {
        SessionMap { path: None, links: BTreeMap::new() }
    }

    pub fn path(&self) -> Option<&Path> {
        self.path.as_deref()
    }

    pub fn get(&self, itda_session_id: &str) -> Option<&Link> {
        self.links.get(itda_session_id)
    }

    /// 연결을 적고 파일에 저장한다. 바뀐 것이 없으면 저장하지 않는다.
    pub fn set(&mut self, itda_session_id: &str, link: Link) -> Result<(), String> {
        if self.links.get(itda_session_id) == Some(&link) {
            return Ok(());
        }
        self.links.insert(itda_session_id.to_string(), link);
        self.save()
    }

    pub fn remove(&mut self, itda_session_id: &str) -> Result<(), String> {
        if self.links.remove(itda_session_id).is_some() {
            self.save()?;
        }
        Ok(())
    }

    /// 임시 파일에 먼저 쓰고 바꿔치기한다(쓰는 도중 꺼져도 표가 깨지지 않게).
    pub fn save(&self) -> Result<(), String> {
        let Some(path) = &self.path else { return Ok(()) };
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| format!("연결표 폴더를 만들 수 없습니다: {e}"))?;
        }
        let body = serde_json::to_vec_pretty(&self.links).map_err(|e| e.to_string())?;
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, body).map_err(|e| format!("연결표를 저장할 수 없습니다: {e}"))?;
        std::fs::rename(&tmp, path).map_err(|e| format!("연결표를 저장할 수 없습니다: {e}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 저장하고_다시_불러오기() {
        let dir = std::env::temp_dir().join(format!("itda-claude-store-{}", std::process::id()));
        let path = dir.join("claude-sessions.json");
        let _ = std::fs::remove_file(&path);
        let mut m = SessionMap::load(&path);
        assert!(m.get("s1").is_none());
        m.set("s1", Link { claude_session_id: "c-1".into(), cwd: Some("/작업".into()) }).unwrap();
        let again = SessionMap::load(&path);
        assert_eq!(again.get("s1").unwrap().claude_session_id, "c-1");
        assert_eq!(again.get("s1").unwrap().cwd.as_deref(), Some("/작업"));
        let mut again = again;
        again.remove("s1").unwrap();
        assert!(SessionMap::load(&path).get("s1").is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
