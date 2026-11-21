//! itda-extws 시험: 폴더 만들기, 안내서, 배치, 확장 읽기, 거절, 이전 판 보관

use itda_extws::*;
use serde_json::json;
use std::fs;
use std::path::{Path, PathBuf};

fn temp(name: &str) -> PathBuf {
    let p = std::env::temp_dir().join(format!("itda-extws-{}-{}", name, std::process::id()));
    let _ = fs::remove_dir_all(&p);
    p
}

fn make_ext(dir: &Path, id: &str, manifest: &str, files: &[(&str, &str)]) {
    let d = dir.join("extensions").join(id);
    fs::create_dir_all(&d).unwrap();
    fs::write(d.join("manifest.json"), manifest).unwrap();
    for (n, c) in files {
        let p = d.join(n);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, c).unwrap();
    }
}

const M: &str = r#"{"id":"today-tab","name":"오늘","version":"1.0.0","tabs":[{"id":"main","title":"탭","file":"tab.html"}],"bands":[{"id":"b","file":"band.html","height":36}]}"#;

#[test]
fn 폴더를_만들고_안내서를_넣는다() {
    let dir = temp("make").join("앱고치기");
    let ws = load_workspace(&dir, "안내서 1판").unwrap();
    assert!(dir.is_dir());
    assert_eq!(fs::read_to_string(dir.join("CLAUDE.md")).unwrap(), "안내서 1판");
    assert!(ws.layout.is_none() && ws.extensions.is_empty() && ws.warnings.is_empty());
    assert_eq!(ws.dir, dir.to_string_lossy());
}

#[test]
fn 안내서가_다르면_갈아_끼운다() {
    let dir = temp("guide");
    load_workspace(&dir, "1판").unwrap();
    fs::write(dir.join("CLAUDE.md"), "사용자가 고친 내용").unwrap();
    load_workspace(&dir, "2판").unwrap();
    assert_eq!(fs::read_to_string(dir.join("CLAUDE.md")).unwrap(), "2판");
}

#[test]
fn 배치_읽기와_깨진_배치() {
    let dir = temp("layout");
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("layout.json"), r#"{"channelListSide":"right"}"#).unwrap();
    let ws = load_workspace(&dir, "g").unwrap();
    assert_eq!(ws.layout.unwrap()["channelListSide"], "right");
    fs::write(dir.join("layout.json"), "{깨짐").unwrap();
    let ws = load_workspace(&dir, "g").unwrap();
    assert!(ws.layout.is_none());
    assert_eq!(ws.warnings.len(), 1);
}

#[test]
fn 배치_쓰기() {
    let dir = temp("wlayout");
    write_layout(&dir, &json!({"accent":"#FF7A45","fontScale":1.1})).unwrap();
    let ws = load_workspace(&dir, "g").unwrap();
    assert_eq!(ws.layout.unwrap()["fontScale"], 1.1);
    assert!(write_layout(&dir, &json!([1])).is_err());
    assert!(!dir.join("layout.json.tmp").exists());
}

#[test]
fn 확장_읽기_가리키는_파일만() {
    let dir = temp("ext");
    make_ext(&dir, "today-tab", M, &[("tab.html", "<p>탭</p>"), ("band.html", "<p>띠</p>"), ("남의것.html", "읽으면 안 됨")]);
    make_ext(&dir, "broken", "{깨짐", &[]);
    fs::create_dir_all(dir.join("extensions/empty")).unwrap();
    let ws = load_workspace(&dir, "g").unwrap();
    assert_eq!(ws.extensions.len(), 1);
    let e = &ws.extensions[0];
    assert_eq!(e.manifest["id"], "today-tab");
    assert_eq!(e.files.len(), 2);
    assert_eq!(e.files["tab.html"], "<p>탭</p>");
    assert!(!e.files.contains_key("남의것.html"));
    assert_eq!(ws.warnings.len(), 1);
    assert!(ws.warnings[0].contains("broken"));
}

#[test]
fn 크기_초과는_뺀다() {
    let dir = temp("size");
    let big = "a".repeat(200 * 1024 + 1);
    make_ext(&dir, "today-tab", M, &[("tab.html", &big), ("band.html", "ok")]);
    let ws = load_workspace(&dir, "g").unwrap();
    let e = &ws.extensions[0];
    assert!(!e.files.contains_key("tab.html"));
    assert!(e.files.contains_key("band.html"));
    assert!(ws.warnings.iter().any(|w| w.contains("200KB")));

    // 확장 하나 1MB 초과: 파일 6개(각 190KB) 중 5개까지만
    let dir = temp("total");
    let chunk = "b".repeat(190 * 1024);
    let tabs: Vec<_> = (0..6).map(|i| json!({"id": format!("t{i}"), "title": "t", "file": format!("f{i}.html")})).collect();
    let m = json!({"id":"big-ext","name":"큼","version":"1.0.0","tabs":tabs}).to_string();
    let names: Vec<String> = (0..6).map(|i| format!("f{i}.html")).collect();
    let files: Vec<(&str, &str)> = names.iter().map(|n| (n.as_str(), chunk.as_str())).collect();
    make_ext(&dir, "big-ext", &m, &files);
    let ws = load_workspace(&dir, "g").unwrap();
    assert_eq!(ws.extensions[0].files.len(), 5);
    assert!(ws.warnings.iter().any(|w| w.contains("1MB")));
}

#[test]
fn 경로_탈출은_거절한다() {
    let dir = temp("escape");
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("비밀.txt"), "비밀").unwrap();
    let m = r#"{"id":"evil-ext","name":"x","version":"1.0.0","tabs":[
      {"id":"a","title":"a","file":"../../비밀.txt"},
      {"id":"b","title":"b","file":"/etc/passwd"},
      {"id":"c","title":"c","file":"C:\\Windows\\win.ini"},
      {"id":"d","title":"d","file":"..\\..\\비밀.txt"},
      {"id":"e","title":"e","file":"ok.html"}]}"#;
    make_ext(&dir, "evil-ext", m, &[("ok.html", "ok")]);
    let ws = load_workspace(&dir, "g").unwrap();
    let e = &ws.extensions[0];
    assert_eq!(e.files.keys().collect::<Vec<_>>(), vec!["ok.html"]);
    assert_eq!(ws.warnings.len(), 4);
    assert!(is_safe_rel("sub/a.html") && !is_safe_rel("a/../b") && !is_safe_rel(""));
}

#[cfg(unix)]
#[test]
fn 바로가기로_밖을_가리켜도_거절한다() {
    let dir = temp("symlink");
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("비밀.txt"), "비밀").unwrap();
    make_ext(&dir, "today-tab", M, &[("band.html", "ok")]);
    std::os::unix::fs::symlink(dir.join("비밀.txt"), dir.join("extensions/today-tab/tab.html")).unwrap();
    let ws = load_workspace(&dir, "g").unwrap();
    assert!(!ws.extensions[0].files.contains_key("tab.html"));
    assert_eq!(ws.warnings.len(), 1);
}

#[test]
fn 이전_판_보관과_최근_5개() {
    let dir = temp("history");
    let hist = dir.join("extensions/today-tab/.history");
    let names = || -> Vec<String> {
        let mut v: Vec<String> = fs::read_dir(&hist)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().to_string())
            .filter(|n| n.starts_with("manifest-"))
            .collect();
        v.sort();
        v
    };
    make_ext(&dir, "today-tab", M, &[("tab.html", "t"), ("band.html", "b")]);
    load_workspace(&dir, "g").unwrap();
    assert_eq!(names().len(), 0); // 처음엔 이전 판이 없다
    load_workspace(&dir, "g").unwrap();
    assert_eq!(names().len(), 0); // 안 바뀌면 남기지 않는다
    for v in 2..=9 {
        let m = M.replace("1.0.0", &format!("1.{v}.0"));
        fs::write(dir.join("extensions/today-tab/manifest.json"), m).unwrap();
        load_workspace(&dir, "g").unwrap();
    }
    let n = names();
    assert_eq!(n.len(), 5);
    // 가장 최근 보관본은 바로 직전 판(1.8.0)
    let newest = fs::read_to_string(hist.join(n.last().unwrap())).unwrap();
    assert!(newest.contains("1.8.0"));
}
