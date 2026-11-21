//! 「앱 고치기」 작업 폴더(`문서/iSensTogether/앱고치기`)를 읽고 쓰는 부품.
//!
//! 폴더 모양
//!  - `CLAUDE.md`                          : 안내서(앱에 담긴 판으로 맞춰 둔다)
//!  - `layout.json`                        : 배치 설정
//!  - `extensions/<아이디>/manifest.json`  : 확장 설명서와, 그것이 가리키는 화면 파일
//!  - `extensions/<아이디>/.history/`      : 이전 설명서 보관(최근 5개)
//!
//! 이 묶음은 타우리에 기대지 않는다. `cargo test -p itda-extws` 로 시험한다.

use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// 파일 하나의 최대 크기
pub const MAX_FILE_BYTES: u64 = 200 * 1024;
/// 확장 하나가 읽혀 보내는 파일 크기 합의 최대
pub const MAX_EXT_BYTES: u64 = 1024 * 1024;
/// 보관하는 이전 설명서 개수
pub const KEEP_HISTORY: usize = 5;

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct Extension {
    pub manifest: Value,
    pub files: BTreeMap<String, String>,
}

#[derive(Serialize, Debug, Clone)]
pub struct Workspace {
    pub dir: String,
    pub layout: Option<Value>,
    pub extensions: Vec<Extension>,
    pub warnings: Vec<String>,
}

/// 작업 폴더를 만들고, 안내서를 맞추고, 배치와 확장을 읽는다.
pub fn load_workspace(dir: &Path, guide: &str) -> Result<Workspace, String> {
    fs::create_dir_all(dir).map_err(|e| format!("앱 고치기 폴더를 만들 수 없습니다: {e}"))?;
    let mut warnings = Vec::new();

    // 안내서: 없거나 다르면 앱에 담긴 판으로
    let guide_path = dir.join("CLAUDE.md");
    if fs::read_to_string(&guide_path).map(|s| s != guide).unwrap_or(true) {
        fs::write(&guide_path, guide).map_err(|e| format!("안내서를 넣을 수 없습니다: {e}"))?;
    }

    // 배치: 없거나 깨졌으면 비움
    let layout = match fs::read_to_string(dir.join("layout.json")) {
        Ok(s) => match serde_json::from_str::<Value>(&s) {
            Ok(v) if v.is_object() => Some(v),
            _ => {
                warnings.push("배치 설정 파일(layout.json)이 올바른 형식이 아니라 무시했습니다.".to_string());
                None
            }
        },
        Err(_) => None,
    };

    let mut extensions = Vec::new();
    let ext_root = dir.join("extensions");
    if let Ok(rd) = fs::read_dir(&ext_root) {
        let mut dirs: Vec<PathBuf> = rd.flatten().map(|e| e.path()).filter(|p| p.is_dir()).collect();
        dirs.sort();
        for d in dirs {
            let name = d.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
            if let Some(ext) = read_extension(&d, &name, &mut warnings) {
                extensions.push(ext);
            }
        }
    }

    Ok(Workspace { dir: dir.to_string_lossy().to_string(), layout, extensions, warnings })
}

/// 화면이 바꾼 배치를 `layout.json` 에 쓴다(임시 파일에 쓴 뒤 바꿔치기).
pub fn write_layout(dir: &Path, layout: &Value) -> Result<(), String> {
    if !layout.is_object() {
        return Err("배치 설정은 항목들의 묶음 모양이어야 합니다.".to_string());
    }
    fs::create_dir_all(dir).map_err(|e| format!("앱 고치기 폴더를 만들 수 없습니다: {e}"))?;
    let body = serde_json::to_string_pretty(layout).map_err(|e| format!("배치 설정을 글로 바꿀 수 없습니다: {e}"))?;
    let tmp = dir.join("layout.json.tmp");
    fs::write(&tmp, body).map_err(|e| format!("배치 설정을 쓸 수 없습니다: {e}"))?;
    fs::rename(&tmp, dir.join("layout.json")).map_err(|e| format!("배치 설정을 저장할 수 없습니다: {e}"))
}

/// 설명서가 가리키는 파일 이름이 안전한지(폴더 밖으로 나가지 않는지) 본다.
pub fn is_safe_rel(rel: &str) -> bool {
    if rel.is_empty() || rel.contains('\0') || rel.starts_with('/') || rel.starts_with('\\') {
        return false;
    }
    // 윈도우 드라이브 글자(C:...)
    if rel.len() >= 2 && rel.as_bytes()[1] == b':' {
        return false;
    }
    let p = Path::new(rel);
    if p.is_absolute() {
        return false;
    }
    !rel.split(['/', '\\']).any(|c| c == "..")
        && p.components().all(|c| matches!(c, Component::Normal(_) | Component::CurDir))
}

fn read_extension(d: &Path, name: &str, warnings: &mut Vec<String>) -> Option<Extension> {
    let mpath = d.join("manifest.json");
    let raw = match fs::metadata(&mpath) {
        Ok(m) if m.len() > MAX_FILE_BYTES => {
            warnings.push(format!("확장 「{name}」의 설명서가 너무 커서 건너뛰었습니다."));
            return None;
        }
        Ok(_) => match fs::read_to_string(&mpath) {
            Ok(s) => s,
            Err(_) => {
                warnings.push(format!("확장 「{name}」의 설명서를 읽을 수 없어 건너뛰었습니다."));
                return None;
            }
        },
        Err(_) => return None, // 설명서가 없는 폴더는 확장이 아니다
    };
    let manifest: Value = match serde_json::from_str::<Value>(&raw) {
        Ok(v) if v.is_object() => v,
        _ => {
            warnings.push(format!("확장 「{name}」의 설명서(manifest.json)가 깨져 있어 건너뛰었습니다."));
            return None;
        }
    };

    keep_history(d, &raw, name, warnings);

    // 설명서가 가리키는 파일 모으기(중복 제거, 순서 유지)
    let mut rels: Vec<String> = Vec::new();
    for key in ["tabs", "bands"] {
        if let Some(arr) = manifest.get(key).and_then(|v| v.as_array()) {
            for item in arr {
                if let Some(f) = item.get("file").and_then(|v| v.as_str()) {
                    if !rels.iter().any(|r| r == f) {
                        rels.push(f.to_string());
                    }
                }
            }
        }
    }

    let base = fs::canonicalize(d).unwrap_or_else(|_| d.to_path_buf());
    let mut files = BTreeMap::new();
    let mut total: u64 = 0;
    for rel in rels {
        if !is_safe_rel(&rel) {
            warnings.push(format!("확장 「{name}」의 파일 이름 「{rel}」은 폴더 밖을 가리켜 거절했습니다."));
            continue;
        }
        let path = d.join(&rel);
        // 바로가기(심볼릭 링크) 등으로 폴더 밖으로 새는지 한 번 더 확인
        match fs::canonicalize(&path) {
            Ok(real) if real.starts_with(&base) => {}
            Ok(_) => {
                warnings.push(format!("확장 「{name}」의 파일 「{rel}」은 폴더 밖에 있어 거절했습니다."));
                continue;
            }
            Err(_) => {
                warnings.push(format!("확장 「{name}」의 파일 「{rel}」을 찾을 수 없습니다."));
                continue;
            }
        }
        let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
        if size > MAX_FILE_BYTES {
            warnings.push(format!("확장 「{name}」의 파일 「{rel}」이 200KB를 넘어 뺐습니다."));
            continue;
        }
        if total + size > MAX_EXT_BYTES {
            warnings.push(format!("확장 「{name}」의 파일 합계가 1MB를 넘어 「{rel}」을 뺐습니다."));
            continue;
        }
        match fs::read_to_string(&path) {
            Ok(s) => {
                total += size;
                files.insert(rel, s);
            }
            Err(_) => warnings.push(format!("확장 「{name}」의 파일 「{rel}」을 글로 읽을 수 없어 뺐습니다.")),
        }
    }
    Some(Extension { manifest, files })
}

/// 설명서 내용이 지난번과 달라졌으면 지난 것을 `.history` 에 남기고 최근 5개만 둔다.
fn keep_history(d: &Path, raw: &str, name: &str, warnings: &mut Vec<String>) {
    let hist = d.join(".history");
    let last = hist.join(".last.json");
    let prev = fs::read_to_string(&last).ok();
    if prev.as_deref() == Some(raw) {
        return;
    }
    let res: std::io::Result<()> = (|| {
        fs::create_dir_all(&hist)?;
        if let Some(p) = prev {
            let ts = timestamp();
            // 같은 초에 여러 번 바뀌어도 순서가 맞도록, 그 초에 이미 있는 가장 큰 번호 다음 번호를 붙인다
            let prefix = format!("manifest-{ts}-");
            let n = fs::read_dir(&hist)?
                .flatten()
                .filter_map(|e| {
                    let f = e.file_name().to_string_lossy().to_string();
                    f.strip_prefix(&prefix)?.strip_suffix(".json")?.parse::<u32>().ok()
                })
                .max()
                .unwrap_or(0)
                + 1;
            let target = hist.join(format!("{prefix}{n:03}.json"));
            fs::write(&target, p)?;
        }
        fs::write(&last, raw)?;
        // 오래된 것 지우기(이름이 시각 순서)
        let mut olds: Vec<PathBuf> = fs::read_dir(&hist)?
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.file_name().map(|n| n.to_string_lossy().starts_with("manifest-")).unwrap_or(false))
            .collect();
        olds.sort();
        while olds.len() > KEEP_HISTORY {
            let _ = fs::remove_file(olds.remove(0));
        }
        Ok(())
    })();
    if res.is_err() {
        warnings.push(format!("확장 「{name}」의 이전 판을 보관하지 못했습니다."));
    }
}

/// 세계 표준시 `YYYYMMDD-HHMMSS`
fn timestamp() -> String {
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0) as i64;
    let (days, rem) = (secs.div_euclid(86400), secs.rem_euclid(86400));
    // 날짜 계산(1970-01-01 기준 일수 → 연월일)
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z.rem_euclid(146097);
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + if month <= 2 { 1 } else { 0 };
    format!("{year:04}{month:02}{day:02}-{:02}{:02}{:02}", rem / 3600, rem % 3600 / 60, rem % 60)
}
