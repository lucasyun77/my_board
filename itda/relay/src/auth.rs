//! 회사 구글 계정 로그인 확인.
//! 앱은 구글에서 받은 신분증(ID 토큰)을 첫 인사에 실어 보낸다.
//! 중계 서버는 구글 공개 열쇠로 서명을 확인하고, 발급처·받는 앱·만료·회사 도메인을 검사한다.

use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};
use serde::Deserialize;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

pub const GOOGLE_JWKS_URL: &str = "https://www.googleapis.com/oauth2/v3/certs";
pub const GOOGLE_ISSUERS: [&str; 2] = ["accounts.google.com", "https://accounts.google.com"];

/// 확인을 통과한 사람
#[derive(Clone, Debug, PartialEq)]
pub struct Identity {
    /// 회원 아이디: "g:" + 구글 고유번호
    pub id: String,
    pub email: String,
    pub name: String,
}

#[derive(Deserialize, Clone)]
struct Jwk {
    kid: String,
    n: String,
    e: String,
}
#[derive(Deserialize, Clone)]
struct Jwks {
    keys: Vec<Jwk>,
}

#[derive(Deserialize)]
struct Claims {
    sub: String,
    #[serde(default)]
    email: String,
    #[serde(default)]
    email_verified: bool,
    #[serde(default)]
    hd: Option<String>,
    #[serde(default)]
    name: Option<String>,
}

pub struct GoogleAuth {
    /// 받아들이는 앱 번호(구글 클라우드에서 만든 OAuth 클라이언트)
    pub client_ids: Vec<String>,
    /// 받아들이는 회사 도메인(비우면 모든 구글 계정 — 시험용)
    pub allowed_domains: Vec<String>,
    /// 데스크톱 앱이 로그인 창을 열 때 쓰는 값(설치형 앱용, 구글 정책상 비밀로 취급되지 않음)
    pub client_secret: String,
    jwks_url: String,
    cache: RwLock<Option<(Jwks, Instant)>>,
    fixed: Option<Jwks>,
}

impl GoogleAuth {
    pub fn new(client_ids: Vec<String>, allowed_domains: Vec<String>, client_secret: String) -> Self {
        Self { client_ids, allowed_domains, client_secret, jwks_url: GOOGLE_JWKS_URL.into(), cache: RwLock::new(None), fixed: None }
    }

    /// 시험용: 정해진 공개 열쇠 묶음을 쓴다(구글에 묻지 않음)
    pub fn with_fixed_jwks(mut self, jwks_json: &str) -> Self {
        self.fixed = serde_json::from_str(jwks_json).ok();
        self
    }

    async fn keys(&self, force: bool) -> Result<Jwks, String> {
        if let Some(k) = &self.fixed { return Ok(k.clone()); }
        if !force {
            if let Some((k, at)) = self.cache.read().await.as_ref() {
                if at.elapsed() < Duration::from_secs(3600) { return Ok(k.clone()); }
            }
        }
        let k: Jwks = reqwest::Client::new().get(&self.jwks_url).timeout(Duration::from_secs(10)).send().await
            .map_err(|e| format!("구글 공개 열쇠를 받지 못했습니다: {e}"))?
            .json().await.map_err(|e| format!("구글 공개 열쇠 형식 오류: {e}"))?;
        *self.cache.write().await = Some((k.clone(), Instant::now()));
        Ok(k)
    }

    pub async fn verify(&self, token: &str) -> Result<Identity, String> {
        let header = decode_header(token).map_err(|_| "신분증 형식이 틀렸습니다".to_string())?;
        if header.alg != Algorithm::RS256 { return Err("지원하지 않는 서명 방식입니다".into()); }
        let kid = header.kid.ok_or("신분증에 열쇠 번호가 없습니다")?;
        let mut jwks = self.keys(false).await?;
        if !jwks.keys.iter().any(|k| k.kid == kid) { jwks = self.keys(true).await?; } // 구글이 열쇠를 바꿨을 수 있음
        let jwk = jwks.keys.iter().find(|k| k.kid == kid).ok_or("알 수 없는 열쇠로 서명된 신분증입니다")?;
        let key = DecodingKey::from_rsa_components(&jwk.n, &jwk.e).map_err(|_| "공개 열쇠 오류".to_string())?;
        let mut v = Validation::new(Algorithm::RS256);
        v.set_audience(&self.client_ids);
        v.set_issuer(&GOOGLE_ISSUERS);
        v.leeway = 60;
        let data = decode::<Claims>(token, &key, &v).map_err(|e| match e.kind() {
            jsonwebtoken::errors::ErrorKind::ExpiredSignature => "로그인이 만료되었습니다".to_string(),
            jsonwebtoken::errors::ErrorKind::InvalidAudience => "이 회사용 앱에서 받은 신분증이 아닙니다".to_string(),
            jsonwebtoken::errors::ErrorKind::InvalidIssuer => "구글이 발급한 신분증이 아닙니다".to_string(),
            _ => "신분증 확인에 실패했습니다".to_string(),
        })?;
        let c = data.claims;
        if c.email.is_empty() || !c.email_verified { return Err("확인된 이메일이 없는 계정입니다".into()); }
        if !self.allowed_domains.is_empty() {
            let dom = c.hd.clone().unwrap_or_else(|| c.email.rsplit('@').next().unwrap_or("").to_string()).to_lowercase();
            if !self.allowed_domains.iter().any(|d| d.eq_ignore_ascii_case(&dom)) {
                return Err("회사 계정으로만 들어올 수 있습니다".into());
            }
        }
        let name = c.name.filter(|n| !n.trim().is_empty()).unwrap_or_else(|| c.email.split('@').next().unwrap_or("").to_string());
        Ok(Identity { id: format!("g:{}", c.sub), email: c.email.to_lowercase(), name })
    }
}

/// 로그인 방식
pub enum AuthMode {
    /// 시험용: 모임 암호만 확인(비면 누구나)
    Open { team_key: String },
    /// 회사 구글 계정
    Google(GoogleAuth),
}

impl AuthMode {
    pub fn label(&self) -> &'static str {
        match self { AuthMode::Open { .. } => "open", AuthMode::Google(_) => "google" }
    }
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use base64::Engine;
    use jsonwebtoken::{encode, EncodingKey, Header};
    use rsa::{pkcs1::EncodeRsaPrivateKey, traits::PublicKeyParts, RsaPrivateKey};
    use serde_json::json;

    /// 시험용 열쇠 한 쌍과 그 공개 열쇠 묶음
    pub fn test_keys() -> (EncodingKey, String) {
        let mut rng = rand::thread_rng();
        let k = RsaPrivateKey::new(&mut rng, 2048).unwrap();
        let pem = k.to_pkcs1_pem(Default::default()).unwrap();
        let b = base64::engine::general_purpose::URL_SAFE_NO_PAD;
        let jwks = json!({"keys": [{"kid": "t1", "kty": "RSA", "alg": "RS256", "n": b.encode(k.n().to_bytes_be()), "e": b.encode(k.e().to_bytes_be())}]}).to_string();
        (EncodingKey::from_rsa_pem(pem.as_bytes()).unwrap(), jwks)
    }

    pub fn token(key: &EncodingKey, aud: &str, email: &str, hd: Option<&str>, exp_in: i64) -> String {
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as i64;
        let mut h = Header::new(Algorithm::RS256);
        h.kid = Some("t1".into());
        let mut c = json!({"iss": "https://accounts.google.com", "aud": aud, "sub": "1234567890", "email": email, "email_verified": true, "name": "김하늘", "iat": now, "exp": now + exp_in});
        if let Some(d) = hd { c["hd"] = json!(d); }
        encode(&h, &c, key).unwrap()
    }

    #[tokio::test]
    async fn 회사_계정_신분증을_확인한다() {
        let (key, jwks) = test_keys();
        let g = GoogleAuth::new(vec!["app-1".into()], vec!["example.co.kr".into()], String::new()).with_fixed_jwks(&jwks);
        // 정상
        let id = g.verify(&token(&key, "app-1", "Kim@example.co.kr", Some("example.co.kr"), 600)).await.unwrap();
        assert_eq!(id, Identity { id: "g:1234567890".into(), email: "kim@example.co.kr".into(), name: "김하늘".into() });
        // 다른 회사 도메인
        assert!(g.verify(&token(&key, "app-1", "kim@gmail.com", None, 600)).await.unwrap_err().contains("회사 계정"));
        // 다른 앱에서 받은 신분증
        assert!(g.verify(&token(&key, "other-app", "kim@example.co.kr", Some("example.co.kr"), 600)).await.is_err());
        // 만료
        assert!(g.verify(&token(&key, "app-1", "kim@example.co.kr", Some("example.co.kr"), -600)).await.unwrap_err().contains("만료"));
        // 위조(다른 열쇠로 서명)
        let (other, _) = test_keys();
        assert!(g.verify(&token(&other, "app-1", "kim@example.co.kr", Some("example.co.kr"), 600)).await.is_err());
    }
}
