fn main() {
    println!("cargo:rerun-if-changed=windows-app-manifest.xml");
    println!("cargo:rerun-if-changed=windows-app-manifest.rc");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        omit_gnu_default_manifest();
        // Tauri embeds resources in binaries only. The webview's Common Controls
        // imports also need the same manifest in the library's unit test host.
        let windows = tauri_build::WindowsAttributes::new_without_app_manifest();
        tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(windows))
            .expect("Tauri build configuration failed");
        embed_resource::compile_for_everything("windows-app-manifest.rc", embed_resource::NONE)
            .manifest_required()
            .expect("Windows application manifest could not be compiled");
    } else {
        tauri_build::build();
    }
}

fn omit_gnu_default_manifest() {
    if std::env::var("CARGO_CFG_TARGET_ENV").as_deref() != Ok("gnu") {
        return;
    }
    println!("cargo:rerun-if-env-changed=RUSTC_LINKER");
    let compiler = std::env::var("RUSTC_LINKER").unwrap_or_else(|_| {
        match std::env::var("CARGO_CFG_TARGET_ARCH").as_deref() {
            Ok("x86_64") => "x86_64-w64-mingw32-gcc",
            Ok("x86") => "i686-w64-mingw32-gcc",
            _ => "gcc",
        }
        .into()
    });
    let output = std::process::Command::new(&compiler)
        .arg("-dumpspecs")
        .output()
        .expect("The Windows GNU compiler must be available for resource linking");
    assert!(
        output.status.success(),
        "Could not read Windows GNU linker specs"
    );
    let specs = String::from_utf8(output.stdout)
        .expect("GNU linker specs must be UTF-8")
        .replace("\r\n", "\n");
    let endfile = specs
        .split("*endfile:\n")
        .nth(1)
        .and_then(|section| section.split("\n\n").next())
        .expect("GNU linker specs have no endfile section");
    if !endfile.contains("default-manifest.o") {
        return;
    }
    // Recent MinGW toolchains inject a non-neutral manifest. BFD drops the
    // application's manifest on collision, removing Common Controls v6.
    // Preserve every other compiler setting and use our manifest for all hosts.
    let endfile = endfile.replace("%{!shared:%:if-exists(default-manifest.o%s)}", "");
    assert!(
        !endfile.contains("default-manifest.o"),
        "Unrecognized GNU default manifest spec; use the Windows MSVC toolchain"
    );
    let path = std::path::PathBuf::from(std::env::var_os("OUT_DIR").unwrap())
        .join("netmask-manifest.specs");
    std::fs::write(&path, format!("*endfile:\n{endfile}\n\n"))
        .expect("Could not write GNU manifest linker specs");
    println!("cargo:rustc-link-arg=-specs={}", path.display());
}
