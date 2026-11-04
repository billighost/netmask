use crate::types::CaptivePortalStatus;
use std::io::Read;
use std::time::Duration;

const PROBE: &str = "http://www.msftconnecttest.com/connecttest.txt";

pub fn classify_response(
    status: u16,
    location: Option<&str>,
    body: &str,
) -> (bool, Option<String>) {
    if status == 204 || (status == 200 && body.trim() == "Microsoft Connect Test") {
        return (false, None);
    }
    let redirect = location
        .and_then(|value| url::Url::parse(PROBE).ok()?.join(value).ok())
        .filter(|url| {
            matches!(url.scheme(), "http" | "https")
                && url.username().is_empty()
                && url.password().is_none()
        })
        .map(|url| url.to_string());
    let body = body.trim_start().to_ascii_lowercase();
    if (300..400).contains(&status)
        || (status == 200 && (body.starts_with("<html") || body.starts_with("<!doctype html")))
    {
        (
            true,
            redirect.or_else(|| Some("http://www.msftconnecttest.com/redirect".into())),
        )
    } else {
        (false, None)
    }
}

pub fn check_captive_portal() -> Result<CaptivePortalStatus, String> {
    let client = reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(2))
        .timeout(Duration::from_secs(4))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "Cannot start the connectivity check")?;
    let response = client
        .get(PROBE)
        .send()
        .map_err(|_| "Connectivity could not be checked")?;
    let status = response.status().as_u16();
    let location = response
        .headers()
        .get("Location")
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    let mut bytes = Vec::new();
    response
        .take(4096)
        .read_to_end(&mut bytes)
        .map_err(|_| "Connectivity response was interrupted")?;
    let (is_captive, portal_url) = classify_response(
        status,
        location.as_deref(),
        &String::from_utf8_lossy(&bytes),
    );
    let checked_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|time| time.as_millis() as i64)
        .unwrap_or(0);
    Ok(CaptivePortalStatus {
        is_captive,
        portal_url,
        checked_at,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn portal_detection_distinguishes_probe_content_and_valid_web_redirects() {
        assert_eq!(
            classify_response(200, None, "Microsoft Connect Test\n"),
            (false, None)
        );
        assert_eq!(classify_response(204, None, ""), (false, None));
        assert!(classify_response(302, Some("http://192.168.1.1/login"), "").0);
        assert_eq!(
            classify_response(302, Some("file:///etc/passwd"), "")
                .1
                .as_deref(),
            Some("http://www.msftconnecttest.com/redirect")
        );
        assert!(classify_response(200, None, "<!DOCTYPE html><title>Sign in</title>").0);
        assert!(!classify_response(503, None, "Try login later").0);
    }
}
