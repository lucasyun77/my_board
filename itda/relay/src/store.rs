//! 저장소.
//! - 상태 전체(스냅숏)를 주기적으로 저장하고, 시작할 때 마지막 스냅숏을 불러온다.
//! - 앱이 보낸 모든 동작을 한 줄씩 남긴다 → 감사 기록(누가 언제 무엇을 했나).
//! - 앱의 오류 보고를 모은다.
//! 파일 하나(시험용) 또는 포스트그레스(본제품)를 쓴다.

use crate::state::State;
use serde_json::Value;
use sqlx::{postgres::PgPoolOptions, PgPool, Row};
use std::path::PathBuf;

pub enum Store {
    /// 저장하지 않음(시험용)
    Memory,
    /// 파일 하나(시제품 방식). 감사 기록·오류 보고는 옆의 .log 파일에 한 줄씩
    File(PathBuf),
    Pg(PgPool),
}

const SCHEMA: &[&str] = &[
    "CREATE TABLE IF NOT EXISTS tg_snapshot (id BIGSERIAL PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT now(), state JSONB NOT NULL)",
    "CREATE TABLE IF NOT EXISTS tg_audit (seq BIGSERIAL PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT now(), who TEXT NOT NULL, op TEXT NOT NULL, body JSONB NOT NULL)",
    "CREATE INDEX IF NOT EXISTS tg_audit_who ON tg_audit (who, at)",
    "CREATE TABLE IF NOT EXISTS tg_report (id BIGSERIAL PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT now(), who TEXT NOT NULL, body JSONB NOT NULL)",
];
/// 스냅숏은 최근 이만큼만 남긴다(되돌리기용)
const KEEP_SNAPSHOTS: i64 = 50;

impl Store {
    pub async fn postgres(url: &str) -> Result<Self, String> {
        let pool = PgPoolOptions::new().max_connections(8).connect(url).await.map_err(|e| format!("데이터베이스에 연결하지 못했습니다: {e}"))?;
        for q in SCHEMA { sqlx::query(q).execute(&pool).await.map_err(|e| format!("표를 만들지 못했습니다: {e}"))?; }
        Ok(Store::Pg(pool))
    }

    pub fn label(&self) -> &'static str {
        match self { Store::Memory => "memory", Store::File(_) => "file", Store::Pg(_) => "postgres" }
    }

    pub async fn load(&self) -> Option<State> {
        match self {
            Store::Memory => None,
            Store::File(p) => std::fs::read_to_string(p).ok().and_then(|s| serde_json::from_str(&s).ok()),
            Store::Pg(pool) => {
                let row = sqlx::query("SELECT state FROM tg_snapshot ORDER BY id DESC LIMIT 1").fetch_optional(pool).await.ok()??;
                let v: Value = row.try_get("state").ok()?;
                serde_json::from_value(v).ok()
            }
        }
    }

    pub async fn snapshot(&self, st: &State) -> Result<(), String> {
        match self {
            Store::Memory => Ok(()),
            Store::File(p) => {
                let body = serde_json::to_string_pretty(st).map_err(|e| e.to_string())?;
                let tmp = p.with_extension("tmp");
                tokio::fs::write(&tmp, body).await.map_err(|e| e.to_string())?;
                tokio::fs::rename(&tmp, p).await.map_err(|e| e.to_string())
            }
            Store::Pg(pool) => {
                let v = serde_json::to_value(st).map_err(|e| e.to_string())?;
                sqlx::query("INSERT INTO tg_snapshot (state) VALUES ($1)").bind(v).execute(pool).await.map_err(|e| e.to_string())?;
                sqlx::query("DELETE FROM tg_snapshot WHERE id < (SELECT COALESCE(MAX(id), 0) - $1 FROM tg_snapshot)").bind(KEEP_SNAPSHOTS).execute(pool).await.map_err(|e| e.to_string())?;
                Ok(())
            }
        }
    }

    /// 감사 기록 한 줄
    pub async fn audit(&self, who: &str, body: &Value) {
        let op = body.get("op").and_then(|o| o.as_str()).unwrap_or("?").to_string();
        match self {
            Store::Memory => {}
            Store::File(p) => append_line(p.with_extension("audit.log"), who, &op, body).await,
            Store::Pg(pool) => {
                if let Err(e) = sqlx::query("INSERT INTO tg_audit (who, op, body) VALUES ($1, $2, $3)").bind(who).bind(&op).bind(body).execute(pool).await {
                    eprintln!("감사 기록 저장 실패: {e}");
                }
            }
        }
    }

    /// 앱 오류 보고
    pub async fn report(&self, who: &str, body: &Value) {
        match self {
            Store::Memory => {}
            Store::File(p) => append_line(p.with_extension("report.log"), who, "report", body).await,
            Store::Pg(pool) => {
                if let Err(e) = sqlx::query("INSERT INTO tg_report (who, body) VALUES ($1, $2)").bind(who).bind(body).execute(pool).await {
                    eprintln!("오류 보고 저장 실패: {e}");
                }
            }
        }
    }

    /// 최근 감사 기록(관리자 화면용)
    pub async fn recent_audit(&self, limit: i64) -> Vec<Value> {
        match self {
            Store::Pg(pool) => sqlx::query("SELECT seq, to_char(at, 'YYYY-MM-DD HH24:MI:SS') AS at, who, op FROM tg_audit ORDER BY seq DESC LIMIT $1")
                .bind(limit).fetch_all(pool).await.unwrap_or_default().into_iter()
                .map(|r| serde_json::json!({"seq": r.get::<i64, _>("seq"), "at": r.get::<String, _>("at"), "who": r.get::<String, _>("who"), "op": r.get::<String, _>("op")}))
                .collect(),
            _ => vec![],
        }
    }
}

async fn append_line(path: PathBuf, who: &str, op: &str, body: &Value) {
    use tokio::io::AsyncWriteExt;
    let line = serde_json::json!({"at": crate::state::now_ms(), "who": who, "op": op, "body": body}).to_string() + "\n";
    if let Ok(mut f) = tokio::fs::OpenOptions::new().create(true).append(true).open(path).await {
        let _ = f.write_all(line.as_bytes()).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// TOGETHER_TEST_DATABASE_URL 이 있을 때만 실제 데이터베이스로 시험
    #[tokio::test]
    async fn 데이터베이스에_저장하고_다시_불러온다() {
        let Ok(url) = std::env::var("TOGETHER_TEST_DATABASE_URL") else { eprintln!("데이터베이스 주소가 없어 건너뜀"); return; };
        let s = Store::postgres(&url).await.unwrap();
        let mut st = State::default();
        st.seq = 4242;
        st.upsert_member(crate::state::Member { id: "g:1".into(), name: "김하늘".into(), computer: "디자인실".into(), ..Default::default() });
        s.snapshot(&st).await.unwrap();
        let back = s.load().await.unwrap();
        assert_eq!(back.seq, 4242);
        assert_eq!(back.members[0].name, "김하늘");
        s.audit("g:1", &serde_json::json!({"op": "log", "text": "cargo test"})).await;
        let a = s.recent_audit(5).await;
        assert!(a.iter().any(|r| r["op"] == "log" && r["who"] == "g:1"));
    }
}
