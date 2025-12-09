// src-tauri/src/lib.rs — ПУСТОЙ
#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Open devtools for the main webview window in debug (dev) builds so it's easier to debug UI/IPC issues
            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.open_devtools();
            }
            Ok(())
        })
        // Register a command `open_profile` that the frontend can call via `invoke`
        .invoke_handler(tauri::generate_handler![open_profile])
        .run(tauri::generate_context!())
        .expect("error")
}

#[tauri::command]
fn open_profile(_app: tauri::AppHandle, app_path: String, args: String) -> Result<(), String> {
    use std::process::Command;

    // This command uses the system `open` on macOS to launch an app with args.
    // It runs from the Rust side (no shell plugin permission required for JS invoke).
    #[cfg(target_os = "macos")]
    {
        // If the frontend requests "playwright" as app_path, spawn the node script
        if app_path == "playwright" {
            let cwd = std::env::current_dir().map_err(|e| e.to_string())?;
            // try repo-root/scripts and src-tauri/scripts
            let mut script_path = cwd.join("scripts").join("launch_playwright.js");
            if !script_path.exists() {
                if let Some(parent) = cwd.parent() {
                    let alt = parent.join("scripts").join("launch_playwright.js");
                    if alt.exists() {
                        script_path = alt;
                    }
                }
            }
            let payload = args; // args is JSON string from frontend
            // pass base64 encoded to avoid shell / quoting issues
            let payload_b64 = base64::encode(payload);

            let mut cmd = Command::new("node");
            cmd.arg(script_path.as_os_str()).arg(payload_b64);
            let _child = cmd.spawn().map_err(|e| e.to_string())?;
            return Ok(());
        }

        // default behavior uses macOS `open` for bundles
        let status = Command::new("open")
            .arg("-a")
            .arg(app_path)
            .arg("--args")
            .args(args.split_whitespace())
            .status()
            .map_err(|e| e.to_string())?;

        if status.success() {
            Ok(())
        } else {
            Err(format!("failed to open app: exit code {:?}", status.code()))
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        // For non-macOS, if app_path == "playwright", spawn launcher executable
        if app_path == "playwright" {
            let payload = args; // args is JSON string from frontend
            let payload_b64 = base64::encode(payload);

            // In production (bundled), use the sidecar exe from resources
            let exe_path = if cfg!(target_os = "windows") {
                // Try to find launch_playwright.exe in bundled resources
                let app_dir = std::env::current_exe()
                    .ok()
                    .and_then(|p| p.parent().map(|p| p.to_path_buf()))
                    .ok_or("Failed to get app directory")?;
                
                // Check multiple possible locations
                let candidates = vec![
                    app_dir.join("launch_playwright.exe"),
                    app_dir.join("binaries").join("launch_playwright.exe"),
                    app_dir.join("resources").join("launch_playwright.exe"),
                ];
                
                candidates.into_iter()
                    .find(|p| p.exists())
                    .ok_or("launch_playwright.exe not found in bundle")?
            } else {
                // For Linux/etc, fall back to node script
                let cwd = std::env::current_dir().map_err(|e| e.to_string())?;
                let mut script_path = cwd.join("scripts").join("launch_playwright.cjs");
                if !script_path.exists() {
                    if let Some(parent) = cwd.parent() {
                        let alt = parent.join("scripts").join("launch_playwright.cjs");
                        if alt.exists() {
                            script_path = alt;
                        }
                    }
                }
                script_path
            };

            let mut cmd = if cfg!(target_os = "windows") {
                Command::new(exe_path)
            } else {
                let mut c = Command::new("node");
                c.arg(exe_path);
                c
            };
            
            cmd.arg(payload_b64);
            
            // Hide console window on Windows
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                cmd.creation_flags(CREATE_NO_WINDOW);
            }
            
            let _child = cmd.spawn().map_err(|e| e.to_string())?;
            return Ok(());
        }

        // Fallback: try to spawn the executable directly
        let status = Command::new(app_path)
            .args(args.split_whitespace())
            .status()
            .map_err(|e| e.to_string())?;

        if status.success() {
            Ok(())
        } else {
            Err(format!("failed to open app: exit code {:?}", status.code()))
        }
    }
}