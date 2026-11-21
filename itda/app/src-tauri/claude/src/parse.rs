//! 클로드 코드가 표준 출력으로 내보내는 신호(한 줄에 JSON 하나)를 「정규화된 사건」으로 바꾼다.
//!
//! 해석하는 신호(견본: `fixtures/claude-stream-sample.jsonl`)
//!  - system/init            → started(클로드 세션 번호)
//!  - assistant 의 text      → text
//!  - assistant 의 tool_use  → tool(도구 이름, 입력 요약 200자 이내)
//!  - assistant 의 thinking  → 보내지 않음
//!  - user 의 tool_result    → tool_result(앞 300자, 오류 여부)
//!  - system/permission_denied → denied(도구 이름, 거절 이유 그대로)
//!  - result                 → result(비용, 오류 여부, "끝" 또는 오류 요약)
//!  - stream_event 등 나머지 → 보내지 않음
//!  - JSON 이 아닌 줄        → error

use serde::Serialize;
use serde_json::Value;

/// 도구 입력 요약 최대 글자 수
pub const TOOL_SUMMARY_MAX: usize = 200;
/// 도구 결과 앞부분 최대 글자 수
pub const TOOL_RESULT_MAX: usize = 300;

/// 사건 종류(화면과 맺은 약속의 `kind` 값)
#[derive(Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    Started,
    Text,
    Tool,
    ToolResult,
    Denied,
    Result,
    Exit,
    Error,
}

/// 정규화된 사건. 화면에 보내는 값에서 `sessionId` 만 빠진 모양이다.
#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub kind: Kind,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cost_usd: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub claude_session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_error: Option<bool>,
}

impl Event {
    pub fn new(kind: Kind, text: impl Into<String>) -> Self {
        Event { kind, text: text.into(), tool: None, cost_usd: None, claude_session_id: None, is_error: None }
    }
    pub fn error(text: impl Into<String>) -> Self {
        Event::new(Kind::Error, text)
    }
}

/// 글자 수(바이트 아님) 기준으로 자른다. 잘렸으면 끝에 「…」를 붙인다.
pub fn cut(s: &str, max: usize) -> String {
    let s = s.trim();
    if s.chars().count() <= max {
        return s.to_string();
    }
    let mut out: String = s.chars().take(max.saturating_sub(1)).collect();
    out.push('…');
    out
}

/// 도구 입력을 사람이 알아볼 짧은 글로 줄인다(명령, 파일 경로, 찾는 말 등).
pub fn summarize_tool_input(input: &Value) -> String {
    const KEYS: [&str; 10] =
        ["command", "file_path", "notebook_path", "path", "pattern", "url", "query", "description", "prompt", "skill"];
    let text = match input {
        Value::Object(m) => KEYS
            .iter()
            .find_map(|k| m.get(*k).and_then(Value::as_str).filter(|s| !s.trim().is_empty()))
            .map(str::to_string)
            .unwrap_or_else(|| if m.is_empty() { String::new() } else { input.to_string() }),
        Value::Null => String::new(),
        Value::String(s) => s.clone(),
        other => other.to_string(),
    };
    // 여러 줄 명령은 한 줄로 보이게 한다
    cut(&text.split_whitespace().collect::<Vec<_>>().join(" "), TOOL_SUMMARY_MAX)
}

/// 도구 결과 내용(글 또는 조각 배열)을 글로 모은다.
fn tool_result_text(content: &Value) -> String {
    match content {
        Value::String(s) => s.clone(),
        Value::Array(parts) => parts
            .iter()
            .filter_map(|p| match p.get("type").and_then(Value::as_str) {
                Some("text") => p.get("text").and_then(Value::as_str).map(str::to_string),
                Some("image") => Some("[그림]".to_string()),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("\n"),
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

fn str_of<'a>(v: &'a Value, key: &str) -> Option<&'a str> {
    v.get(key).and_then(Value::as_str)
}

/// 한 줄을 해석한다. 한 줄에서 사건이 여러 개(예: 글과 도구 사용이 함께) 나올 수 있고, 하나도 없을 수 있다.
pub fn parse_line(line: &str) -> Vec<Event> {
    let line = line.trim();
    if line.is_empty() {
        return vec![];
    }
    let v: Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(e) => return vec![Event::error(format!("신호를 해석하지 못했습니다({e}): {}", cut(line, 200)))],
    };
    let mut out = Vec::new();
    match str_of(&v, "type").unwrap_or("") {
        "system" => match str_of(&v, "subtype").unwrap_or("") {
            "init" => {
                if let Some(id) = str_of(&v, "session_id") {
                    let mut e = Event::new(Kind::Started, id);
                    e.claude_session_id = Some(id.to_string());
                    out.push(e);
                }
            }
            "permission_denied" => {
                let tool = str_of(&v, "tool_name").unwrap_or("알 수 없는 도구").to_string();
                let reason = str_of(&v, "decision_reason")
                    .filter(|s| !s.is_empty())
                    .or_else(|| str_of(&v, "message"))
                    .unwrap_or("")
                    .to_string();
                let mut e = Event::new(Kind::Denied, reason);
                e.tool = Some(tool);
                out.push(e);
            }
            _ => {}
        },
        "assistant" => {
            if let Some(Value::Array(blocks)) = v.pointer("/message/content") {
                for b in blocks {
                    match str_of(b, "type").unwrap_or("") {
                        "text" => {
                            let t = str_of(b, "text").unwrap_or("");
                            if !t.trim().is_empty() {
                                out.push(Event::new(Kind::Text, t));
                            }
                        }
                        "tool_use" | "server_tool_use" => {
                            let name = str_of(b, "name").unwrap_or("알 수 없는 도구").to_string();
                            let mut e = Event::new(Kind::Tool, summarize_tool_input(b.get("input").unwrap_or(&Value::Null)));
                            e.tool = Some(name);
                            out.push(e);
                        }
                        _ => {} // thinking 등은 보내지 않는다
                    }
                }
            }
        }
        "user" => {
            if let Some(Value::Array(blocks)) = v.pointer("/message/content") {
                for b in blocks.iter().filter(|b| str_of(b, "type") == Some("tool_result")) {
                    let text = tool_result_text(b.get("content").unwrap_or(&Value::Null));
                    let mut e = Event::new(Kind::ToolResult, cut(&text, TOOL_RESULT_MAX));
                    e.is_error = Some(b.get("is_error").and_then(Value::as_bool).unwrap_or(false));
                    out.push(e);
                }
            }
        }
        "result" => {
            let is_error = v.get("is_error").and_then(Value::as_bool).unwrap_or(false)
                || str_of(&v, "subtype").is_some_and(|s| s != "success");
            let text = if is_error {
                let detail = str_of(&v, "result")
                    .filter(|s| !s.trim().is_empty())
                    .map(str::to_string)
                    .or_else(|| match v.get("errors") {
                        Some(Value::Array(a)) if !a.is_empty() => Some(
                            a.iter().map(|x| x.as_str().map(str::to_string).unwrap_or_else(|| x.to_string())).collect::<Vec<_>>().join(" / "),
                        ),
                        _ => None,
                    })
                    .or_else(|| str_of(&v, "subtype").map(str::to_string))
                    .unwrap_or_else(|| "알 수 없는 오류".into());
                cut(&format!("오류: {detail}"), TOOL_RESULT_MAX)
            } else {
                "끝".to_string()
            };
            let mut e = Event::new(Kind::Result, text);
            e.is_error = Some(is_error);
            e.cost_usd = v.get("total_cost_usd").and_then(Value::as_f64);
            out.push(e);
        }
        _ => {} // stream_event, rate_limit_event 등은 보내지 않는다
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 자르기는_글자_기준() {
        assert_eq!(cut("안녕하세요", 10), "안녕하세요");
        assert_eq!(cut("안녕하세요", 3), "안녕…");
    }

    #[test]
    fn 깨진_줄은_오류() {
        let e = parse_line("{깨짐");
        assert_eq!(e.len(), 1);
        assert_eq!(e[0].kind, Kind::Error);
        assert!(parse_line("   ").is_empty());
    }

    #[test]
    fn 결과_오류_요약() {
        let e = parse_line(r#"{"type":"result","subtype":"error_during_execution","is_error":true,"total_cost_usd":0.5,"errors":["모델 없음"]}"#);
        assert_eq!(e[0].kind, Kind::Result);
        assert_eq!(e[0].is_error, Some(true));
        assert_eq!(e[0].text, "오류: 모델 없음");
        assert_eq!(e[0].cost_usd, Some(0.5));
    }

    #[test]
    fn 도구_결과_조각_배열() {
        let e = parse_line(r#"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"x","content":[{"type":"text","text":"가나다"}]}]}}"#);
        assert_eq!(e[0].text, "가나다");
        assert_eq!(e[0].is_error, Some(false));
    }

    #[test]
    fn 사건_모양은_약속대로() {
        let mut e = Event::new(Kind::ToolResult, "글");
        e.is_error = Some(true);
        assert_eq!(serde_json::to_value(&e).unwrap(), serde_json::json!({"kind":"tool_result","text":"글","isError":true}));
    }
}
