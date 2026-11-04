use base64::Engine;
use std::io::Read;
use std::process::{Child, Command, Stdio};
use std::sync::mpsc;
use std::time::{Duration, Instant};

pub fn hidden_command(program: &str) -> Command {
    let mut command = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    #[cfg(unix)]
    command.env("LC_ALL", "C").env("LANG", "C");
    command
}

// Closing an owned process group/job terminates descendants as well as the
// direct child. Otherwise inherited output pipes can outlive a timed-out shell.
#[cfg(windows)]
struct ProcessTree(windows_sys::Win32::Foundation::HANDLE);
#[cfg(windows)]
impl ProcessTree {
    fn attach(child: &Child) -> Result<Self, String> {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::System::JobObjects::*;
        unsafe {
            let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if handle.is_null() {
                return Err("Cannot create a command process group".into());
            }
            let tree = Self(handle);
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
                std::mem::size_of_val(&limits) as u32,
            ) == 0
                || AssignProcessToJobObject(handle, child.as_raw_handle()) == 0
            {
                return Err("Cannot contain the command process group".into());
            }
            Ok(tree)
        }
    }
}
#[cfg(windows)]
impl Drop for ProcessTree {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.0);
        }
    }
}
#[cfg(unix)]
struct ProcessTree(i32);
#[cfg(unix)]
impl ProcessTree {
    fn attach(child: &Child) -> Result<Self, String> {
        Ok(Self(child.id() as i32))
    }
}
#[cfg(unix)]
impl Drop for ProcessTree {
    fn drop(&mut self) {
        unsafe {
            libc::kill(-self.0, libc::SIGKILL);
        }
    }
}

fn read_output(mut stream: impl Read) -> Vec<u8> {
    let mut result = Vec::new();
    let mut buffer = [0u8; 4096];
    while let Ok(size) = stream.read(&mut buffer) {
        if size == 0 {
            break;
        }
        let remaining = (2 * 1024 * 1024usize).saturating_sub(result.len());
        result.extend_from_slice(&buffer[..size.min(remaining)]);
    }
    result
}

/// Run an executable directly, with bounded output and a real deadline.
/// User-controlled arguments are never concatenated into a shell command.
pub fn run_checked(program: &str, arguments: &[&str], timeout: Duration) -> Result<String, String> {
    let mut command = hidden_command(program);
    command
        .args(arguments)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let mut child = command
        .spawn()
        .map_err(|e| format!("Cannot start {program}: {e}"))?;
    let tree = match ProcessTree::attach(&child) {
        Ok(tree) => tree,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }
    };
    let stdout = child
        .stdout
        .take()
        .ok_or("Could not capture command output")?;
    let stderr = child
        .stderr
        .take()
        .ok_or("Could not capture command errors")?;
    let (sender, receiver) = mpsc::channel();
    let output_sender = sender.clone();
    std::thread::spawn(move || {
        let _ = output_sender.send((true, read_output(stdout)));
    });
    std::thread::spawn(move || {
        let _ = sender.send((false, read_output(stderr)));
    });
    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Ok(status),
            Ok(None) if started.elapsed() < timeout => {
                std::thread::sleep(Duration::from_millis(15))
            }
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                break Err(format!("{program} timed out"));
            }
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                break Err(format!("Cannot wait for {program}: {error}"));
            }
        }
    };
    drop(tree);
    let mut stdout = Vec::new();
    for _ in 0..2 {
        let remaining = timeout
            .saturating_sub(started.elapsed())
            .max(Duration::from_millis(50));
        let (is_stdout, bytes) = receiver
            .recv_timeout(remaining)
            .map_err(|_| format!("{program} output capture timed out"))?;
        if is_stdout {
            stdout = bytes;
        }
    }
    let status = status?;
    if !status.success() {
        // Both output streams can echo arguments, SSIDs or credentials.
        return Err(format!("{program} failed (exit code {:?})", status.code()));
    }
    Ok(String::from_utf8_lossy(&stdout)
        .trim_end_matches(['\r', '\n'])
        .to_owned())
}

pub fn run(program: &str, arguments: &[&str]) -> Result<String, String> {
    run_checked(program, arguments, Duration::from_secs(12))
}

pub fn powershell_literal(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

pub fn encode_powershell(script: &str) -> String {
    let bytes: Vec<u8> = script.encode_utf16().flat_map(u16::to_le_bytes).collect();
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

pub fn elevated_script(script: &str) -> String {
    let child = encode_powershell(&format!(
        "$ErrorActionPreference = 'Stop'; try {{ {script} }} catch {{ exit 1 }}"
    ));
    format!(
        "$ErrorActionPreference = 'Stop'; try {{ $p = Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand {child}' -Verb RunAs -Wait -PassThru -WindowStyle Hidden; exit $p.ExitCode }} catch {{ exit 1 }}"
    )
}

pub fn powershell(script: &str, elevated: bool) -> Result<String, String> {
    if !cfg!(windows) {
        return Err("This operation is only available on Windows".into());
    }
    let script = if elevated {
        elevated_script(script)
    } else {
        format!("$ErrorActionPreference = 'Stop'; {script}")
    };
    let encoded = encode_powershell(&script);
    run_checked(
        "powershell.exe",
        &[
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-EncodedCommand",
            &encoded,
        ],
        Duration::from_secs(if elevated { 120 } else { 15 }),
    )
}

pub fn powershell_json(script: &str) -> Result<serde_json::Value, String> {
    let script = format!(
        "$nmResult = & {{ {script} }}; $nmBytes = [Text.Encoding]::UTF8.GetBytes(($nmResult | ConvertTo-Json -Depth 8 -Compress)); $nmOutput = [Console]::OpenStandardOutput(); $nmOutput.Write($nmBytes, 0, $nmBytes.Length)"
    );
    let result = powershell(&script, false)?;
    serde_json::from_str(&result).map_err(|_| "Windows returned an invalid response".into())
}

pub fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn elevation_preserves_literal_unicode_and_propagates_child_failure() {
        let name = "Café's $(whoami); & Wi-Fi";
        assert_eq!(powershell_literal(name), "'Café''s $(whoami); & Wi-Fi'");
        let script = format!(
            "$name = {}; throw 'expected failure'",
            powershell_literal(name)
        );
        let encoded = encode_powershell(&script);
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .unwrap();
        let unicode: Vec<u16> = decoded
            .chunks_exact(2)
            .map(|b| u16::from_le_bytes([b[0], b[1]]))
            .collect();
        assert_eq!(String::from_utf16(&unicode).unwrap(), script);
        let outer = elevated_script(&script);
        assert!(outer.contains("exit $p.ExitCode"));
        assert!(outer.contains("-PassThru"));
        assert!(!outer.contains(name));
    }
    fn fixture(name: &str, timeout: Duration) -> Result<String, String> {
        let exe = std::env::current_exe().unwrap();
        run_checked(
            exe.to_str().unwrap(),
            &["--exact", name, "--ignored", "--nocapture"],
            timeout,
        )
    }
    #[test]
    fn deadlines_cover_inherited_output_pipes_and_errors_do_not_echo_secrets() {
        let started = Instant::now();
        assert!(
            fixture(
                "system::tests::fixture_holds_pipes",
                Duration::from_millis(100)
            )
            .is_err()
        );
        assert!(started.elapsed() < Duration::from_secs(2));
        let started = Instant::now();
        assert!(
            fixture(
                "system::tests::fixture_leaves_descendant",
                Duration::from_secs(2)
            )
            .is_ok()
        );
        assert!(started.elapsed() < Duration::from_secs(2));
        let error = fixture(
            "system::tests::fixture_private_error",
            Duration::from_secs(2),
        )
        .unwrap_err();
        assert!(!error.contains("fixture-sensitive-argument"));
    }
    #[test]
    #[ignore = "subprocess fixture, invoked by the deadline test"]
    fn fixture_holds_pipes() {
        std::thread::sleep(Duration::from_secs(5));
    }
    #[test]
    #[ignore = "subprocess fixture, invoked by the deadline test"]
    fn fixture_leaves_descendant() {
        hidden_command(std::env::current_exe().unwrap().to_str().unwrap())
            .args([
                "--exact",
                "system::tests::fixture_holds_pipes",
                "--ignored",
                "--nocapture",
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .spawn()
            .unwrap();
    }
    #[test]
    #[ignore = "subprocess fixture, invoked by the deadline test"]
    fn fixture_private_error() {
        eprintln!("fixture-sensitive-argument");
        std::process::exit(9);
    }
}
