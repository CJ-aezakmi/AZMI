// src-tauri/src/lib.rs — AEZAKMI Pro v2.2.3

use base64::Engine;
use tauri::Manager;
use std::sync::Mutex;
use std::collections::HashMap;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            println!("[STARTUP] AEZAKMI Pro v2.2.2");
            
            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.open_devtools();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_profile,
            validate_license_key,
            check_node_installed,
            check_browsers_installed,
            download_and_run_nodejs_installer,
            install_playwright_browsers_cmd,
            check_and_install_nodejs,
            check_and_install_playwright,
            download_update,
            install_update,
            copy_directory,
            write_file,
            check_playwright_installed,
            install_node_runtime,
            install_playwright_runtime,
            start_cookie_bot,
            stop_cookie_bot,
            get_playwright_version,
            update_playwright_runtime
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}

// ============================================================================
// HELPERS: Получение путей к bundled Node.js
// ============================================================================

/// Получает директорию приложения (рядом с exe)
fn get_app_dir() -> Result<std::path::PathBuf, String> {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .ok_or_else(|| "Не удалось определить директорию приложения".to_string())
}

/// Находит путь к node.exe — сначала bundled, потом system
fn get_node_exe() -> Result<std::path::PathBuf, String> {
    // 1. Bundled node рядом с exe: {app_dir}/node/node.exe
    if let Ok(app_dir) = get_app_dir() {
        let bundled = app_dir.join("node").join("node.exe");
        if bundled.exists() {
            println!("[NODE] Используем bundled: {}", bundled.display());
            return Ok(bundled);
        }
    }
    
    // 2. Dev mode: ищем в корне проекта AEZAKMI-Portable-CLEAN/node/
    if let Ok(exe) = std::env::current_exe() {
        // exe: src-tauri/target/debug/app.exe → вверх 5 уровней до AEZAKMI-Portable-CLEAN
        let mut dir = exe.as_path();
        for _ in 0..6 {
            if let Some(parent) = dir.parent() {
                let dev_node = parent.join("node").join("node.exe");
                if dev_node.exists() {
                    println!("[NODE] Используем dev node: {}", dev_node.display());
                    return Ok(dev_node);
                }
                dir = parent;
            }
        }
    }
    
    // 3. System node (в PATH)
    let check = std::process::Command::new("node").arg("--version").output();
    if let Ok(output) = check {
        if output.status.success() {
            println!("[NODE] Используем системный node");
            return Ok(std::path::PathBuf::from("node"));
        }
    }
    
    Err("Node.js не найден! Ни bundled, ни системный.".to_string())
}

/// Находит путь к npx.cmd — сначала bundled, потом system
fn get_npx_cmd() -> Result<std::path::PathBuf, String> {
    // 1. Bundled npx рядом с exe
    if let Ok(app_dir) = get_app_dir() {
        let bundled = app_dir.join("node").join("npx.cmd");
        if bundled.exists() {
            println!("[NPX] Используем bundled: {}", bundled.display());
            return Ok(bundled);
        }
    }
    
    // 2. Dev mode
    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.as_path();
        for _ in 0..6 {
            if let Some(parent) = dir.parent() {
                let dev_npx = parent.join("node").join("npx.cmd");
                if dev_npx.exists() {
                    println!("[NPX] Используем dev npx: {}", dev_npx.display());
                    return Ok(dev_npx);
                }
                dir = parent;
            }
        }
    }
    
    // 3. System npx
    let check = std::process::Command::new("npx").arg("--version").output();
    if let Ok(output) = check {
        if output.status.success() {
            println!("[NPX] Используем системный npx");
            return Ok(std::path::PathBuf::from("npx"));
        }
    }
    
    Err("npx не найден! Ни bundled, ни системный.".to_string())
}

/// Получает PATH с добавленным bundled node/
fn get_enhanced_path() -> String {
    let base_path = std::env::var("PATH").unwrap_or_default();
    
    if let Ok(app_dir) = get_app_dir() {
        let node_dir = app_dir.join("node");
        if node_dir.exists() {
            return format!("{};{}", node_dir.display(), base_path);
        }
    }
    
    // Dev mode
    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.as_path();
        for _ in 0..6 {
            if let Some(parent) = dir.parent() {
                let node_dir = parent.join("node");
                if node_dir.exists() {
                    return format!("{};{}", node_dir.display(), base_path);
                }
                dir = parent;
            }
        }
    }
    
    base_path
}

/// Получает путь к NODE_PATH (для require('playwright'))
/// Production: playwright/modules (Tauri исключает node_modules!)
/// Dev: playwright/node_modules
fn get_node_path() -> String {
    let mut paths = Vec::new();
    
    if let Ok(app_dir) = get_app_dir() {
        // Production: modules (переименовано из node_modules)
        let pw_modules = app_dir.join("playwright").join("modules");
        if pw_modules.exists() {
            paths.push(pw_modules.display().to_string());
        }
        // Fallback: node_modules (если не переименовано)
        let pw_nm = app_dir.join("playwright").join("node_modules");
        if pw_nm.exists() {
            paths.push(pw_nm.display().to_string());
        }
    }
    
    // Dev mode
    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.as_path();
        for _ in 0..6 {
            if let Some(parent) = dir.parent() {
                let pw_modules = parent.join("playwright").join("node_modules");
                if pw_modules.exists() {
                    paths.push(pw_modules.display().to_string());
                    break;
                }
                dir = parent;
            }
        }
    }
    
    paths.join(";")
}

#[tauri::command]
fn open_profile(_app: tauri::AppHandle, app_path: String, args: String) -> Result<(), String> {
    use std::process::Command;

    let script_name = match app_path.as_str() {
        "playwright" | "advanced-antidetect" => "launch_playwright.cjs",
        _ => return Err(format!("Unknown launcher: {}", app_path)),
    };

    let payload_b64 = base64::engine::general_purpose::STANDARD.encode(&args);

    // Находим bundled node.exe
    let node_exe = get_node_exe()?;
    let cache_dir = get_playwright_cache_dir()?;
    let node_path_env = get_node_path();
    let enhanced_path = get_enhanced_path();
    
    // Находим скрипт
    let app_dir = get_app_dir()?;
    let mut script_path = app_dir.join("scripts").join(script_name);
    
    if !script_path.exists() {
        // Dev mode: ищем в корне проёкта
        if let Ok(exe) = std::env::current_exe() {
            let mut dir = exe.as_path();
            for _ in 0..6 {
                if let Some(parent) = dir.parent() {
                    let alt = parent.join("scripts").join(script_name);
                    if alt.exists() {
                        script_path = alt;
                        break;
                    }
                    dir = parent;
                }
            }
        }
    }
    
    if !script_path.exists() {
        return Err(format!("Скрипт не найден: {:?}", script_path));
    }
    
    println!("[LAUNCH] Node: {:?}", node_exe);
    println!("[LAUNCH] Script: {:?}", script_path);
    println!("[LAUNCH] Cache: {:?}", cache_dir);
    
    let mut cmd = Command::new(&node_exe);
    cmd.arg(&script_path)
       .arg(format!("--payload={}", payload_b64))
       .env("PLAYWRIGHT_BROWSERS_PATH", &cache_dir)
       .env("NODE_PATH", &node_path_env)
       .env("PATH", &enhanced_path);
    
    // В PROD режиме скрываем консоль
    #[cfg(all(not(debug_assertions), target_os = "windows"))]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    
    // В DEV режиме показываем логи
    #[cfg(debug_assertions)]
    {
        use std::process::Stdio;
        cmd.stdout(Stdio::inherit());
        cmd.stderr(Stdio::inherit());
    }
    
    let child = cmd.spawn().map_err(|e| format!("Ошибка запуска: {}", e))?;
    println!("[LAUNCH] PID: {:?}", child.id());
    Ok(())
}

#[tauri::command]
async fn check_and_install_nodejs() -> Result<String, String> {
    // Проверяем bundled node первым, потом системный
    match get_node_exe() {
        Ok(node_path) => {
            let check = std::process::Command::new(&node_path).arg("--version").output();
            match check {
                Ok(output) if output.status.success() => {
                    let version = String::from_utf8_lossy(&output.stdout);
                    Ok(format!("Node.js найден: {} ({})", version.trim(), node_path.display()))
                }
                _ => Err("Node.js найден но не работает".to_string())
            }
        }
        Err(e) => Err(e)
    }
}

// Структура лицензионного ключа с сроком действия
struct LicenseKey {
    key: &'static str,
    days: i64, // 0 = навсегда
}

// Список валидных лицензионных ключей (65 штук)
const VALID_LICENSE_KEYS: &[LicenseKey] = &[
    // 50 ключей на 3 дня
    LicenseKey { key: "AZMI-2025-A1B2-C3D4", days: 3 },
    LicenseKey { key: "AZMI-2025-E5F6-G7H8", days: 3 },
    LicenseKey { key: "AZMI-2025-I9J0-K1L2", days: 3 },
    LicenseKey { key: "AZMI-2025-M3N4-O5P6", days: 3 },
    LicenseKey { key: "AZMI-2025-Q7R8-S9T0", days: 3 },
    LicenseKey { key: "AZMI-2025-U1V2-W3X4", days: 3 },
    LicenseKey { key: "AZMI-2025-Y5Z6-A7B8", days: 3 },
    LicenseKey { key: "AZMI-2025-C9D0-E1F2", days: 3 },
    LicenseKey { key: "AZMI-2025-G3H4-I5J6", days: 3 },
    LicenseKey { key: "AZMI-2025-K7L8-M9N0", days: 3 },
    LicenseKey { key: "AZMI-2025-O1P2-Q3R4", days: 3 },
    LicenseKey { key: "AZMI-2025-S5T6-U7V8", days: 3 },
    LicenseKey { key: "AZMI-2025-W9X0-Y1Z2", days: 3 },
    LicenseKey { key: "AZMI-2025-A3B4-C5D6", days: 3 },
    LicenseKey { key: "AZMI-2025-E7F8-G9H0", days: 3 },
    LicenseKey { key: "AZMI-2025-I1J2-K3L4", days: 3 },
    LicenseKey { key: "AZMI-2025-M5N6-O7P8", days: 3 },
    LicenseKey { key: "AZMI-2025-Q9R0-S1T2", days: 3 },
    LicenseKey { key: "AZMI-2025-U3V4-W5X6", days: 3 },
    LicenseKey { key: "AZMI-2025-Y7Z8-A9B0", days: 3 },
    LicenseKey { key: "AZMI-2025-C1D2-E3F4", days: 3 },
    LicenseKey { key: "AZMI-2025-G5H6-I7J8", days: 3 },
    LicenseKey { key: "AZMI-2025-K9L0-M1N2", days: 3 },
    LicenseKey { key: "AZMI-2025-O3P4-Q5R6", days: 3 },
    LicenseKey { key: "AZMI-2025-S7T8-U9V0", days: 3 },
    LicenseKey { key: "AZMI-2025-W1X2-Y3Z4", days: 3 },
    LicenseKey { key: "AZMI-2025-A5B6-C7D8", days: 3 },
    LicenseKey { key: "AZMI-2025-E9F0-G1H2", days: 3 },
    LicenseKey { key: "AZMI-2025-I3J4-K5L6", days: 3 },
    LicenseKey { key: "AZMI-2025-M7N8-O9P0", days: 3 },
    LicenseKey { key: "AZMI-2025-Q1R2-S3T4", days: 3 },
    LicenseKey { key: "AZMI-2025-U5V6-W7X8", days: 3 },
    LicenseKey { key: "AZMI-2025-Y9Z0-A1B2", days: 3 },
    LicenseKey { key: "AZMI-2025-C3D4-E5F6", days: 3 },
    LicenseKey { key: "AZMI-2025-G7H8-I9J0", days: 3 },
    LicenseKey { key: "AZMI-2025-K1L2-M3N4", days: 3 },
    LicenseKey { key: "AZMI-2025-O5P6-Q7R8", days: 3 },
    LicenseKey { key: "AZMI-2025-S9T0-U1V2", days: 3 },
    LicenseKey { key: "AZMI-2025-W3X4-Y5Z6", days: 3 },
    LicenseKey { key: "AZMI-2025-A7B8-C9D0", days: 3 },
    LicenseKey { key: "AZMI-2025-E1F2-G3H4", days: 3 },
    LicenseKey { key: "AZMI-2025-I5J6-K7L8", days: 3 },
    LicenseKey { key: "AZMI-2025-M9N0-O1P2", days: 3 },
    LicenseKey { key: "AZMI-2025-Q3R4-S5T6", days: 3 },
    LicenseKey { key: "AZMI-2025-U7V8-W9X0", days: 3 },
    LicenseKey { key: "AZMI-2025-Y1Z2-A3B4", days: 3 },
    LicenseKey { key: "AZMI-2025-C5D6-E7F8", days: 3 },
    LicenseKey { key: "AZMI-2025-G9H0-I1J2", days: 3 },
    LicenseKey { key: "AZMI-2025-K3L4-M5N6", days: 3 },
    LicenseKey { key: "AZMI-2025-O7P8-Q9R0", days: 3 },
    
    // 10 ключей на месяц (30 дней)
    LicenseKey { key: "AZMI-2025-GOLD-X1Y2", days: 30 },
    LicenseKey { key: "AZMI-2025-GOLD-Z3W4", days: 30 },
    LicenseKey { key: "AZMI-2025-GOLD-V5U6", days: 30 },
    LicenseKey { key: "AZMI-2025-GOLD-T7S8", days: 30 },
    LicenseKey { key: "AZMI-2025-GOLD-R9Q0", days: 30 },
    LicenseKey { key: "AZMI-2025-GOLD-P1O2", days: 30 },
    LicenseKey { key: "AZMI-2025-GOLD-N3M4", days: 30 },
    LicenseKey { key: "AZMI-2025-GOLD-L5K6", days: 30 },
    LicenseKey { key: "AZMI-2025-GOLD-J7I8", days: 30 },
    LicenseKey { key: "AZMI-2025-GOLD-H9G0", days: 30 },
    
    // 5 ключей навсегда (0 = бессрочно)
    LicenseKey { key: "AZMI-2025-PREM-UNLM", days: 0 },
    LicenseKey { key: "AZMI-2025-PREM-LIFE", days: 0 },
    LicenseKey { key: "AZMI-2025-PREM-INFN", days: 0 },
    LicenseKey { key: "AZMI-2025-PREM-FRVR", days: 0 },
    LicenseKey { key: "AZMI-2025-PREM-ETRN", days: 0 },
];

#[tauri::command]
fn validate_license_key(key: String) -> Result<serde_json::Value, String> {
    use std::fs;
    use std::path::PathBuf;
    
    let key_upper = key.to_uppercase();
    
    // Находим ключ в списке
    let license = VALID_LICENSE_KEYS.iter().find(|k| k.key == key_upper.as_str());
    
    if license.is_none() {
        return Ok(serde_json::json!({
            "valid": false,
            "message": "Неверный лицензионный ключ"
        }));
    }
    
    let license = license.unwrap();
    
    // Получаем путь к файлу с использованными ключами
    let app_data_dir = std::env::var("APPDATA")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string());
    
    let used_keys_path = PathBuf::from(app_data_dir).join("aezakmi_used_keys.txt");
    
    // Проверяем, использовался ли ключ ранее
    if used_keys_path.exists() {
        if let Ok(content) = fs::read_to_string(&used_keys_path) {
            if content.lines().any(|line| line == key_upper) {
                return Ok(serde_json::json!({
                    "valid": false,
                    "message": "Этот лицензионный ключ уже был активирован"
                }));
            }
        }
    }
    
    // Сохраняем использованный ключ с датой активации и сроком
    let mut keys_to_write = String::new();
    if used_keys_path.exists() {
        if let Ok(content) = fs::read_to_string(&used_keys_path) {
            keys_to_write = content;
        }
    }
    
    // Формат: KEY|DAYS|TIMESTAMP
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    keys_to_write.push_str(&format!("{}|{}|{}\n", key_upper, license.days, timestamp));
    
    if let Err(e) = fs::write(&used_keys_path, keys_to_write) {
        eprintln!("Failed to save used key: {}", e);
    }
    
    let message = if license.days == 0 {
        "Лицензия успешно активирована (БЕССРОЧНАЯ)".to_string()
    } else if license.days == 30 {
        "Лицензия успешно активирована на 30 дней".to_string()
    } else {
        format!("Лицензия успешно активирована на {} дня", license.days)
    };
    
    Ok(serde_json::json!({
        "valid": true,
        "message": message,
        "days": license.days  // Добавляем количество дней для фронтенда!
    }))
}

// Команда для проверки статуса установки
#[tauri::command]
async fn check_and_install_playwright() -> Result<String, String> {
    // Проверяем Node.js (bundled или system)
    let node_ok = get_node_exe().is_ok();
    
    // Проверяем наличие Chromium в кеше
    let chromium_ok = match get_playwright_cache_dir() {
        Ok(cache_dir) => {
            // Ищем любую папку chromium-*
            if cache_dir.exists() {
                std::fs::read_dir(&cache_dir)
                    .ok()
                    .map(|entries| entries.filter_map(|e| e.ok())
                        .any(|e| e.file_name().to_string_lossy().starts_with("chromium-")))
                    .unwrap_or(false)
            } else {
                false
            }
        }
        Err(_) => false,
    };
    
    let mut status = Vec::new();
    status.push(format!("Node.js: {}", if node_ok { "установлен" } else { "НЕ установлен" }));
    status.push(format!("Playwright: {}", if chromium_ok { "установлен" } else { "НЕ установлен" }));
    
    if node_ok && chromium_ok {
        Ok(format!("Все компоненты установлены!\n{}", status.join("\n")))
    } else {
        Ok(format!("Некоторые компоненты отсутствуют:\n{}", status.join("\n")))
    }
}

// ============================================================================
// СИСТЕМА АВТООБНОВЛЕНИЙ
// ============================================================================

/// Скачивает файл обновления с GitHub
#[tauri::command]
async fn download_update(url: String) -> Result<String, String> {
    use std::io::Write;
    use futures_util::StreamExt;
    
    println!("[UPDATE] Начинаем скачивание: {}", url);
    
    // Определяем путь для сохранения
    let temp_dir = std::env::temp_dir();
    let file_name = url.split('/').last().unwrap_or("aezakmi_update.exe");
    let file_path = temp_dir.join(file_name);
    
    println!("[UPDATE] Путь сохранения: {:?}", file_path);
    
    // Скачиваем файл
    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Ошибка при скачивании: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("HTTP ошибка: {}", response.status()));
    }
    
    // Создаем файл
    let mut file = std::fs::File::create(&file_path)
        .map_err(|e| format!("Не удалось создать файл: {}", e))?;
    
    // Скачиваем по частям
    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;
    
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Ошибка чтения данных: {}", e))?;
        file.write_all(&chunk)
            .map_err(|e| format!("Ошибка записи: {}", e))?;
        
        downloaded += chunk.len() as u64;
        
        if downloaded % (1024 * 1024) == 0 {
            println!("[UPDATE] Скачано: {} MB", downloaded / (1024 * 1024));
        }
    }
    
    println!("[UPDATE] ✅ Скачивание завершено: {} байт", downloaded);
    
    Ok(file_path.to_string_lossy().to_string())
}

/// Запускает установщик и закрывает текущее приложение
#[tauri::command]
async fn install_update(installer_path: String) -> Result<(), String> {
    use std::process::Command;
    
    println!("[UPDATE] Запуск установщика: {}", installer_path);
    
    let path = std::path::Path::new(&installer_path);
    
    if !path.exists() {
        return Err(format!("Установщик не найден: {}", installer_path));
    }
    
    #[cfg(target_os = "windows")]
    {
        // Запускаем установщик Windows (.msi или .exe)
        if installer_path.ends_with(".msi") {
            // MSI установщик
            let _child = Command::new("msiexec")
                .arg("/i")
                .arg(&installer_path)
                .arg("/qb") // Базовый UI с прогрессом
                .spawn()
                .map_err(|e| format!("Ошибка запуска установщика: {}", e))?;
        } else {
            // EXE установщик
            let _child = Command::new(&installer_path)
                .spawn()
                .map_err(|e| format!("Ошибка запуска установщика: {}", e))?;
        }
        
        println!("[UPDATE] ✅ Установщик запущен. Завершаем приложение...");
        
        // Даем время на запуск установщика
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
        
        // Закрываем приложение
        std::process::exit(0);
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        return Err("Автообновление поддерживается только на Windows".to_string());
    }
}
/// Копирует директорию рекурсивно
#[tauri::command]
async fn copy_directory(src: String, dst: String) -> Result<(), String> {
    use std::path::Path;
    use std::fs;
    
    let src_path = Path::new(&src);
    let dst_path = Path::new(&dst);
    
    if !src_path.exists() {
        return Err(format!("Исходная директория не существует: {}", src));
    }
    
    // Создаём целевую директорию
    fs::create_dir_all(dst_path)
        .map_err(|e| format!("Ошибка создания директории {}: {}", dst, e))?;
    
    // Копируем рекурсивно
    copy_dir_recursive(src_path, dst_path)?;
    
    Ok(())
}

fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> Result<(), String> {
    use std::fs;
    
    for entry in fs::read_dir(src).map_err(|e| format!("Ошибка чтения {:?}: {}", src, e))? {
        let entry = entry.map_err(|e| format!("Ошибка: {}", e))?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        
        if src_path.is_dir() {
            fs::create_dir_all(&dst_path)
                .map_err(|e| format!("Ошибка создания {:?}: {}", dst_path, e))?;
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)
                .map_err(|e| format!("Ошибка копирования {:?}: {}", src_path, e))?;
        }
    }
    
    Ok(())
}

/// Записывает текст в файл
#[tauri::command]
async fn write_file(path: String, contents: String) -> Result<(), String> {
    use std::fs;
    use std::path::Path;
    
    let file_path = Path::new(&path);
    
    // Создаём родительские директории если нужно
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Ошибка создания директории: {}", e))?;
    }
    
    fs::write(file_path, contents)
        .map_err(|e| format!("Ошибка записи файла: {}", e))?;
    
    Ok(())
}

/// Проверяет установлен ли Node.js (bundled или системный)
#[tauri::command]
async fn check_node_installed(_app: tauri::AppHandle) -> Result<bool, String> {
    match get_node_exe() {
        Ok(node_path) => {
            let check = std::process::Command::new(&node_path).arg("--version").output();
            match check {
                Ok(output) if output.status.success() => {
                    let version = String::from_utf8_lossy(&output.stdout);
                    println!("[CHECK] Node.js найден: {} ({})", version.trim(), node_path.display());
                    Ok(true)
                }
                _ => {
                    println!("[CHECK] Node.js exe найден но не работает: {}", node_path.display());
                    Ok(false)
                }
            }
        }
        Err(e) => {
            println!("[CHECK] Node.js не найден: {}", e);
            Ok(false)
        }
    }
}

/// Проверяет установлены ли браузеры (Chromium в playwright-cache)
#[tauri::command]
async fn check_browsers_installed(_app: tauri::AppHandle) -> Result<bool, String> {
    match get_playwright_cache_dir() {
        Ok(cache_dir) => {
            if !cache_dir.exists() {
                println!("[CHECK] Директория кеша не существует: {}", cache_dir.display());
                return Ok(false);
            }
            
            // Ищем любую папку chromium-*
            let has_chromium = std::fs::read_dir(&cache_dir)
                .ok()
                .map(|entries| entries.filter_map(|e| e.ok())
                    .any(|e| {
                        let name = e.file_name().to_string_lossy().to_string();
                        name.starts_with("chromium-") && e.path().is_dir()
                    }))
                .unwrap_or(false);
            
            if has_chromium {
                println!("[CHECK] ✓ Chromium найден в {}", cache_dir.display());
            } else {
                println!("[CHECK] Chromium НЕ найден в {}", cache_dir.display());
            }
            
            Ok(has_chromium)
        }
        Err(e) => {
            println!("[CHECK] Ошибка получения пути к кешу: {}", e);
            Ok(false)
        }
    }
}

/// Скачивает и запускает установщик Node.js (фоллбэк если bundled нет)
#[tauri::command]
async fn download_and_run_nodejs_installer() -> Result<String, String> {
    // Сначала проверяем — может bundled node уже есть
    if let Ok(node_path) = get_node_exe() {
        let check = std::process::Command::new(&node_path).arg("--version").output();
        if let Ok(output) = check {
            if output.status.success() {
                let version = String::from_utf8_lossy(&output.stdout);
                return Ok(format!("Node.js уже установлен: {} ({})", version.trim(), node_path.display()));
            }
        }
    }
    
    // Bundled нет — скачиваем с сайта
    use std::io::Write;
    use futures_util::StreamExt;
    
    println!("[NODEJS] Скачиваем установщик Node.js...");
    
    let download_url = "https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi";
    
    let temp_dir = std::env::temp_dir();
    let installer_path = temp_dir.join("nodejs-setup.msi");
    
    let client = reqwest::Client::new();
    let response = client
        .get(download_url)
        .send()
        .await
        .map_err(|e| format!("Ошибка скачивания: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("HTTP ошибка: {}", response.status()));
    }
    
    let mut file = std::fs::File::create(&installer_path)
        .map_err(|e| format!("Невозможно создать файл: {}", e))?;
    
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Ошибка чтения: {}", e))?;
        file.write_all(&chunk).map_err(|e| format!("Ошибка записи: {}", e))?;
    }
    
    drop(file);
    
    println!("[NODEJS] Установщик скачан: {:?}", installer_path);
    
    let status = std::process::Command::new("msiexec")
        .arg("/i")
        .arg(&installer_path)
        .arg("/qb")
        .arg("ADDLOCAL=ALL")
        .status()
        .map_err(|e| format!("Ошибка запуска установщика: {}", e))?;
    
    let _ = std::fs::remove_file(&installer_path);
    
    if status.success() {
        Ok("Node.js успешно установлен!".to_string())
    } else {
        Err("Установка Node.js отменена или завершилась с ошибкой".to_string())
    }
}

/// Получает корректный путь к playwright-cache
/// В production — %LOCALAPPDATA%/AEZAKMI Pro/playwright-cache (права на запись!)
/// В dev — корень AEZAKMI-Portable-CLEAN/playwright-cache
fn get_playwright_cache_dir() -> Result<std::path::PathBuf, String> {
    use std::env;
    
    let current_exe = env::current_exe()
        .map_err(|e| format!("Не удалось получить путь к exe: {}", e))?;
    
    let exe_dir = current_exe
        .parent()
        .ok_or("Не удалось получить директорию exe")?;
    
    // Вариант 1: Development mode — ищем в корне AEZAKMI-Portable-CLEAN
    if let Some(dev_root) = exe_dir
        .parent()  // target
        .and_then(|p| p.parent())  // src-tauri
        .and_then(|p| p.parent())  // aezakmi
        .and_then(|p| p.parent())  // разработка
        .and_then(|p| p.parent())  // AEZAKMI-Portable-CLEAN
    {
        let dev_cache = dev_root.join("playwright-cache");
        if dev_cache.exists() {
            println!("[CACHE] Найден кеш для разработки: {}", dev_cache.display());
            return Ok(dev_cache);
        }
    }
    
    // Вариант 2: Production — %LOCALAPPDATA%/AEZAKMI Pro/playwright-cache
    // НЕ рядом с exe (Program Files — нет прав на запись)!
    if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
        let cache = std::path::PathBuf::from(&local_app_data)
            .join("AEZAKMI Pro")
            .join("playwright-cache");
        println!("[CACHE] Production путь: {}", cache.display());
        return Ok(cache);
    }
    
    // Вариант 3: fallback — домашняя папка пользователя
    if let Ok(user_profile) = env::var("USERPROFILE") {
        let cache = std::path::PathBuf::from(&user_profile)
            .join(".aezakmi")
            .join("playwright-cache");
        println!("[CACHE] Fallback путь: {}", cache.display());
        return Ok(cache);
    }
    
    // Вариант 4: крайний fallback — рядом с exe (может не иметь прав)
    let prod_cache = exe_dir.join("playwright-cache");
    println!("[CACHE] Крайний fallback: {}", prod_cache.display());
    Ok(prod_cache)
}

/// Устанавливает Chromium браузер через bundled playwright CLI
#[tauri::command]
async fn install_playwright_browsers_cmd() -> Result<String, String> {
    use std::process::Command;
    
    println!("[BROWSERS] ========= Установка Chromium =========");
    
    // Проверяем Node.js (bundled или system)
    let node_exe = get_node_exe()
        .map_err(|_| "Node.js не найден. Переустановите приложение.".to_string())?;
    println!("[BROWSERS] Node: {}", node_exe.display());
    
    // Получаем путь к playwright-cache (в %LOCALAPPDATA%, не в Program Files!)
    let cache_dir = get_playwright_cache_dir()?;
    println!("[BROWSERS] Путь к кешу: {}", cache_dir.display());
    
    // Проверяем — может Chromium уже есть
    if cache_dir.exists() {
        let has_chromium = std::fs::read_dir(&cache_dir)
            .ok()
            .map(|entries| entries.filter_map(|e| e.ok())
                .any(|e| e.file_name().to_string_lossy().starts_with("chromium-") && e.path().is_dir()))
            .unwrap_or(false);
        
        if has_chromium {
            println!("[BROWSERS] Chromium уже установлен");
            return Ok("Chromium браузер уже установлен!".to_string());
        }
    }
    
    // Создаем директорию кеша
    if !cache_dir.exists() {
        std::fs::create_dir_all(&cache_dir)
            .map_err(|e| format!("Не удалось создать директорию кеша: {}", e))?;
        println!("[BROWSERS] Создана директория: {}", cache_dir.display());
    }
    
    let enhanced_path = get_enhanced_path();
    let mut all_errors: Vec<String> = Vec::new();
    
    // ========= Метод 1: node + playwright CLI напрямую (самый надёжный) =========
    println!("[BROWSERS] Метод 1: прямой CLI скрипт...");
    
    let app_dir = get_app_dir().ok();
    let cli_candidates: Vec<std::path::PathBuf> = {
        let mut paths = Vec::new();
        if let Some(ref ad) = app_dir {
            // Production: modules/ (переименовано из node_modules)
            paths.push(ad.join("playwright").join("modules").join("playwright-core").join("cli.js"));
            paths.push(ad.join("playwright").join("modules").join("playwright").join("cli.js"));
            // Fallback: node_modules/ (на случай если не переименовано)
            paths.push(ad.join("playwright").join("node_modules").join("playwright-core").join("cli.js"));
            paths.push(ad.join("playwright").join("node_modules").join("playwright").join("cli.js"));
        }
        // Dev mode
        if let Ok(exe) = std::env::current_exe() {
            let mut dir = exe.as_path();
            for _ in 0..6 {
                if let Some(parent) = dir.parent() {
                    let p = parent.join("playwright").join("node_modules").join("playwright-core").join("cli.js");
                    if p.exists() && !paths.contains(&p) {
                        paths.push(p);
                    }
                    dir = parent;
                }
            }
        }
        paths
    };
    
    for cli_path in &cli_candidates {
        if !cli_path.exists() {
            println!("[BROWSERS] CLI не найден: {}", cli_path.display());
            continue;
        }
        println!("[BROWSERS] Найден CLI: {}", cli_path.display());
        
        let output = Command::new(&node_exe)
            .arg(cli_path)
            .args(["install", "chromium"])
            .env("PLAYWRIGHT_BROWSERS_PATH", &cache_dir)
            .env("PATH", &enhanced_path)
            .output();
        
        match output {
            Ok(result) => {
                let stdout = String::from_utf8_lossy(&result.stdout);
                let stderr = String::from_utf8_lossy(&result.stderr);
                println!("[BROWSERS] stdout: {}", stdout);
                println!("[BROWSERS] stderr: {}", stderr);
                println!("[BROWSERS] exit code: {:?}", result.status.code());
                
                if result.status.success() {
                    println!("[BROWSERS] Chromium установлен через CLI!");
                    return Ok("Chromium браузер установлен!".to_string());
                }
                all_errors.push(format!("CLI {}: {}", cli_path.display(), stderr.trim()));
            }
            Err(e) => {
                println!("[BROWSERS] Ошибка запуска CLI: {}", e);
                all_errors.push(format!("CLI запуск: {}", e));
            }
        }
    }
    
    // ========= Метод 2: npx playwright install chromium =========
    println!("[BROWSERS] Метод 2: npx...");
    
    if let Ok(npx_path) = get_npx_cmd() {
        println!("[BROWSERS] npx: {}", npx_path.display());
        
        let pw_dir = app_dir.as_ref().map(|d| d.join("playwright")).filter(|d| d.exists());
        
        let mut cmd = Command::new(&npx_path);
        cmd.args(["playwright", "install", "chromium"])
           .env("PLAYWRIGHT_BROWSERS_PATH", &cache_dir)
           .env("PATH", &enhanced_path);
        
        if let Some(ref pw_cwd) = pw_dir {
            cmd.current_dir(pw_cwd);
            // NODE_PATH: ищем modules (prod) или node_modules (dev)
            let modules_path = pw_cwd.join("modules");
            let nm_path = pw_cwd.join("node_modules");
            let node_path = if modules_path.exists() {
                modules_path.display().to_string()
            } else {
                nm_path.display().to_string()
            };
            cmd.env("NODE_PATH", &node_path);
        }
        
        let output = cmd.output();
        match output {
            Ok(result) => {
                let stdout = String::from_utf8_lossy(&result.stdout);
                let stderr = String::from_utf8_lossy(&result.stderr);
                println!("[BROWSERS] npx stdout: {}", stdout);
                println!("[BROWSERS] npx stderr: {}", stderr);
                
                if result.status.success() {
                    println!("[BROWSERS] Chromium установлен через npx!");
                    return Ok("Chromium браузер установлен!".to_string());
                }
                all_errors.push(format!("npx: {}", stderr.trim()));
            }
            Err(e) => {
                println!("[BROWSERS] npx ошибка: {}", e);
                all_errors.push(format!("npx запуск: {}", e));
            }
        }
    } else {
        all_errors.push("npx не найден".to_string());
    }
    
    // Всё не удалось
    let error_details = all_errors.join(" | ");
    println!("[BROWSERS] ВСЕ МЕТОДЫ: {}", error_details);
    Err(format!("Не удалось установить Chromium. Проверьте интернет. Детали: {}", error_details))
}

/// Проверяет установлен ли Playwright (наличие пакета)
#[tauri::command]
async fn check_playwright_installed(_app: tauri::AppHandle) -> Result<bool, String> {
    // Проверяем наличие playwright пакета в bundled или через npx
    if let Ok(app_dir) = get_app_dir() {
        // Production: modules/ (переименовано из node_modules)
        let pw_check = app_dir.join("playwright").join("modules").join("playwright-core");
        if pw_check.exists() {
            println!("[CHECK] Playwright пакет найден (bundled/modules)");
            return Ok(true);
        }
        // Fallback: node_modules/
        let pw_check2 = app_dir.join("playwright").join("node_modules").join("playwright-core");
        if pw_check2.exists() {
            println!("[CHECK] Playwright пакет найден (bundled/node_modules)");
            return Ok(true);
        }
    }
    
    // Проверяем через npx
    if let Ok(npx_path) = get_npx_cmd() {
        let check = std::process::Command::new(&npx_path)
            .args(["playwright", "--version"])
            .env("PATH", get_enhanced_path())
            .output();
        
        if let Ok(output) = check {
            if output.status.success() {
                println!("[CHECK] Playwright установлен (npx)");
                return Ok(true);
            }
        }
    }
    
    println!("[CHECK] Playwright не установлен");
    Ok(false)
}

/// Устанавливает Node.js runtime
#[tauri::command]
async fn install_node_runtime(_app: tauri::AppHandle) -> Result<(), String> {
    println!("[Runtime] Installing Node.js...");
    download_and_run_nodejs_installer().await?;
    Ok(())
}

/// Устанавливает Playwright runtime
#[tauri::command]
async fn install_playwright_runtime(_app: tauri::AppHandle) -> Result<(), String> {
    println!("[Runtime] Installing Playwright...");
    install_playwright_browsers_cmd().await?;
    Ok(())
}

// ==================== COOKIE BOT ====================

fn cookie_bot_processes() -> &'static Mutex<HashMap<String, u32>> {
    use std::sync::OnceLock;
    static INSTANCE: OnceLock<Mutex<HashMap<String, u32>>> = OnceLock::new();
    INSTANCE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Запускает Cookie Bot для профиля
#[tauri::command]
async fn start_cookie_bot(_app: tauri::AppHandle, profile_id: String, config_json: String) -> Result<String, String> {
    use std::process::Command;
    
    println!("[CookieBot] Starting for profile: {}", profile_id);
    
    let node_exe = get_node_exe()?;
    let app_dir = get_app_dir()?;
    let cache_dir = get_playwright_cache_dir().unwrap_or_else(|_| app_dir.join("playwright-cache"));
    let node_path_env = get_node_path();
    let enhanced_path = get_enhanced_path();
    
    // Ищем скрипт
    let mut script_path = app_dir.join("scripts").join("launch_playwright.cjs");
    if !script_path.exists() {
        // Dev mode
        if let Ok(exe) = std::env::current_exe() {
            let mut dir = exe.as_path();
            for _ in 0..6 {
                if let Some(parent) = dir.parent() {
                    let alt = parent.join("scripts").join("launch_playwright.cjs");
                    if alt.exists() {
                        script_path = alt;
                        break;
                    }
                    dir = parent;
                }
            }
        }
    }
    
    if !script_path.exists() {
        return Err("Скрипт запуска не найден. Переустановите приложение.".to_string());
    }
    
    // Создаём конфигурацию
    let temp_dir = std::env::temp_dir();
    let config_file = temp_dir.join("aezakmi_cookie_bot_config.json");
    std::fs::write(&config_file, &config_json)
        .map_err(|e| format!("Ошибка записи конфигурации: {}", e))?;
    
    let child = Command::new(&node_exe)
        .arg(&script_path)
        .arg("--cookie-bot")
        .arg("--config")
        .arg(&config_file)
        .arg("--profile-id")
        .arg(&profile_id)
        .env("PLAYWRIGHT_BROWSERS_PATH", &cache_dir)
        .env("NODE_PATH", &node_path_env)
        .env("PATH", &enhanced_path)
        .spawn()
        .map_err(|e| format!("Ошибка запуска Cookie Bot: {}", e))?;
    
    let pid = child.id();
    
    if let Ok(mut procs) = cookie_bot_processes().lock() {
        procs.insert(profile_id.clone(), pid);
    }
    
    println!("[CookieBot] Started with PID: {}", pid);
    Ok(format!("Cookie Bot запущен (PID: {})", pid))
}

/// Останавливает Cookie Bot для профиля
#[tauri::command]
async fn stop_cookie_bot(profile_id: String) -> Result<String, String> {
    println!("[CookieBot] Stopping for profile: {}", profile_id);
    
    let pid = {
        let mut procs = cookie_bot_processes().lock()
            .map_err(|_| "Lock error".to_string())?;
        procs.remove(&profile_id)
    };
    
    if let Some(pid) = pid {
        #[cfg(target_os = "windows")]
        {
            let _ = std::process::Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/T", "/F"])
                .output();
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = std::process::Command::new("kill")
                .args(["-9", &pid.to_string()])
                .output();
        }
        Ok(format!("Cookie Bot остановлен (PID: {})", pid))
    } else {
        Ok("Cookie Bot не был запущен для этого профиля".to_string())
    }
}

/// Получает версию Playwright
#[tauri::command]
async fn get_playwright_version(_app: tauri::AppHandle) -> Result<String, String> {
    // Пробуем прочитать версию из bundled пакета
    if let Ok(app_dir) = get_app_dir() {
        // Production: modules/
        let pkg_json = app_dir.join("playwright").join("modules").join("playwright").join("package.json");
        // Fallback: node_modules/
        let pkg_json2 = app_dir.join("playwright").join("node_modules").join("playwright").join("package.json");
        
        for pj in &[pkg_json, pkg_json2] {
            if pj.exists() {
                if let Ok(content) = std::fs::read_to_string(pj) {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                        if let Some(version) = json.get("version").and_then(|v| v.as_str()) {
                            return Ok(format!("Version {}", version));
                        }
                    }
                }
            }
        }
    }
    
    // Fallback: через npx
    if let Ok(npx_path) = get_npx_cmd() {
        let check = std::process::Command::new(&npx_path)
            .args(["playwright", "--version"])
            .env("PATH", get_enhanced_path())
            .output();
        
        if let Ok(output) = check {
            if output.status.success() {
                return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
            }
        }
    }
    
    Err("Playwright не установлен".to_string())
}

/// Обновляет Playwright runtime
#[tauri::command]
async fn update_playwright_runtime(_app: tauri::AppHandle) -> Result<String, String> {
    println!("[Playwright] Updating runtime...");
    
    let enhanced_path = get_enhanced_path();
    let cache_dir = get_playwright_cache_dir()?;
    
    // Обновляем через bundled npx
    if let Ok(npx_path) = get_npx_cmd() {
        // Обновляем Chromium
        let install = std::process::Command::new(&npx_path)
            .args(["playwright", "install", "chromium"])
            .env("PLAYWRIGHT_BROWSERS_PATH", &cache_dir)
            .env("PATH", &enhanced_path)
            .output()
            .map_err(|e| format!("Ошибка: {}", e))?;
        
        if install.status.success() {
            return Ok("Playwright обновлён".to_string());
        }
        
        let stderr = String::from_utf8_lossy(&install.stderr);
        return Err(format!("Ошибка обновления: {}", stderr));
    }
    
    Err("npx не найден для обновления".to_string())
}