// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  app_lib::run();
}

#[cfg(test)]
mod tests {
    use app_lib::commands::*;
    use app_lib::ping::*;
    use app_lib::qr::*;
    use app_lib::updater::*;

    #[test]
    fn test_current_dns_result_camel_case_serialization() {
        let res = CurrentDnsResult {
            primary: "1.1.1.1".into(),
            secondary: Some("1.0.0.1".into()),
            is_dhcp: false,
        };
        let json = serde_json::to_string(&res).expect("serialization failed");
        assert!(json.contains("\"isDhcp\":false"), "JSON must contain camelCase isDhcp, got: {}", json);
        assert!(!json.contains("is_dhcp"), "JSON must NOT contain snake_case is_dhcp");
    }

    #[test]
    fn test_download_update_result_camel_case_serialization() {
        let res = DownloadUpdateResult {
            success: true,
            file_path: Some("C:\\temp\\update.exe".into()),
            error: None,
            in_progress: Some(false),
            already_downloaded: Some(true),
        };
        let json = serde_json::to_string(&res).expect("serialization failed");
        assert!(json.contains("\"filePath\":"), "JSON must contain camelCase filePath, got: {}", json);
        assert!(json.contains("\"inProgress\":false"), "JSON must contain camelCase inProgress, got: {}", json);
        assert!(json.contains("\"alreadyDownloaded\":true"), "JSON must contain camelCase alreadyDownloaded, got: {}", json);
        assert!(!json.contains("file_path"));
        assert!(!json.contains("in_progress"));
        assert!(!json.contains("already_downloaded"));
    }

    #[test]
    fn test_operation_result_camel_case_serialization() {
        let res = OperationResult {
            success: true,
            message: Some("OK".into()),
        };
        let json = serde_json::to_string(&res).expect("serialization failed");
        assert!(json.contains("\"success\":true"));
        assert!(json.contains("\"message\":\"OK\""));
    }

    #[test]
    fn test_compare_semver_scenarios() {
        assert!(compare_semver("2.1.1", "2.1.0") > 0);
        assert!(compare_semver("v2.2.0", "2.1.0") > 0);
        assert_eq!(compare_semver("2.1.0", "2.1.0"), 0);
        assert!(compare_semver("2.0.9", "2.1.0") < 0);
        assert!(compare_semver("v2.2.1-beta.1", "2.2.0") > 0);
    }

    #[test]
    fn test_jitter_algorithm() {
        assert_eq!(compute_jitter(&[]), None);
        assert_eq!(compute_jitter(&[20]), None);
        assert_eq!(compute_jitter(&[20, 20, 20]), Some(0.0));
        assert_eq!(compute_jitter(&[20, 22, 20, 22]), Some(2.0));
        assert_eq!(compute_jitter(&[10, 110, 10]), Some(100.0));
    }

    #[test]
    fn test_wifi_qr_and_svg() {
        assert_eq!(
            build_wifi_qr_string("HomeWiFi", "SecretPass123", "WPA2-Personal"),
            "WIFI:T:WPA;S:HomeWiFi;P:SecretPass123;;"
        );
        let payload = "WIFI:T:WPA;S:ACE-Ibadan;P:Skills-Setup@302026;;";
        let matrix = create_qr_matrix(payload);
        assert!(!matrix.is_empty());
        assert!(matrix[matrix.len() - 8][8]);

        let svg = render_qr_svg(payload, 240, 4);
        assert!(svg.starts_with("<svg xmlns=\"http://www.w3.org/2000/svg\""));
    }
}
