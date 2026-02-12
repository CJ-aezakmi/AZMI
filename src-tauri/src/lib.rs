// src-tauri/src/lib.rs — AEZAKMI Pro v2.1.0

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
            println!("[STARTUP] AEZAKMI Pro v2.1.0");
            
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

#[tauri::command]
fn open_profile(_app: tauri::AppHandle, app_path: String, args: String) -> Result<(), String> {
    use std::process::Command;

    // macOS implementation
    #[cfg(target_os = "macos")]
    {
        // Unified launcher: multi-engine + mobile fingerprints
        let script_name = match app_path.as_str() {
            "playwright" | "advanced-antidetect" => "launch_playwright.cjs",
            _ => return Err(format!("Unknown launcher: {}", app_path)),
        };

        let cwd = std::env::current_dir().map_err(|e| e.to_string())?;
        let mut script_path = cwd.join("scripts").join(script_name);
        
        if !script_path.exists() {
            if let Some(parent) = cwd.parent() {
                let alt = parent.join("scripts").join(script_name);
                if alt.exists() {
                    script_path = alt;
                }
            }
        }
        
        let payload = args;
        let payload_b64 = base64::engine::general_purpose::STANDARD.encode(payload);

        let mut cmd = Command::new("node");
        cmd.arg(script_path.as_os_str()).arg(format!("--payload={}", payload_b64));
        let _child = cmd.spawn().map_err(|e| e.to_string())?;
        return Ok(());
    }

    // Windows/Linux implementation
    #[cfg(not(target_os = "macos"))]
    {
        // Unified launcher: multi-engine + mobile fingerprints
        let script_name = match app_path.as_str() {
            "playwright" | "advanced-antidetect" => "launch_playwright.cjs",
            _ => return Err(format!("Unknown launcher: {}", app_path)),
        };

        let payload = args;
        let payload_b64 = base64::engine::general_purpose::STANDARD.encode(payload);

        // В режиме разработки используем Node.js скрипт напрямую
        #[cfg(debug_assertions)]
        {
            println!("[DEBUG] Режим разработки - запуск: {}", script_name);
            let cwd = std::env::current_dir().map_err(|e| e.to_string())?;
            println!("[DEBUG] Текущая директория: {:?}", cwd);
            
            let mut script_path = cwd.join("scripts").join(script_name);
            println!("[DEBUG] Проверяем: {:?}", script_path);
            
            if !script_path.exists() {
                if let Some(parent) = cwd.parent() {
                    let alt = parent.join("scripts").join(script_name);
                    println!("[DEBUG] Проверяем альтернативный путь: {:?}", alt);
                    if alt.exists() {
                        script_path = alt;
                    } else {
                        return Err(format!("Script not found. Tried: {:?} and {:?}", 
                            cwd.join("scripts").join(script_name), alt));
                    }
                } else {
                    return Err(format!("Script not found: {:?}", script_path));
                }
            }
            
            println!("[DEBUG] Скрипт найден: {:?}", script_path);

            let node_check = Command::new("node").arg("--version").output();
            if node_check.is_err() {
                return Err("Node.js не установлен! Установите Node.js 18+ с https://nodejs.org".to_string());
            }
            println!("[DEBUG] Node.js найден: {:?}", String::from_utf8_lossy(&node_check.unwrap().stdout));
            
            let mut cmd = Command::new("node");
            cmd.arg(&script_path).arg(format!("--payload={}", payload_b64));
            
            println!("[DEBUG] Запускаем: node {:?} --payload=[base64]", script_path);
            
            // В DEV режиме показываем логи Node.js в терминале
            use std::process::Stdio;
            cmd.stdout(Stdio::inherit());
            cmd.stderr(Stdio::inherit());
            println!("[DEBUG] ✅ Логи Node.js скрипта будут видны в терминале");
            
            let child = cmd.spawn().map_err(|e| format!("Ошибка запуска: {}", e))?;
            println!("[DEBUG] Процесс запущен с PID: {:?}", child.id());
            return Ok(());
        }

        // Production mode
        #[cfg(not(debug_assertions))]
        {
            println!("[PROD] Production режим");
            
            // Получаем директорию приложения
            let app_dir = std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|p| p.to_path_buf()))
                .ok_or("Failed to get app directory")?;
            
            println!("[PROD] Директория приложения: {:?}", app_dir);
            
            // Проверяем что Node.js установлен в системе
            let node_check = Command::new("node").arg("--version").output();
            if node_check.is_err() || !node_check.as_ref().unwrap().status.success() {
                return Err("Node.js не установлен! Запустите мастер настройки в приложении.".to_string());
            }
            println!("[PROD] ✓ Node.js: {}", String::from_utf8_lossy(&node_check.unwrap().stdout).trim());
            
            // Ищем скрипт — unified launcher
            let script_path = app_dir.join("scripts").join("launch_playwright.cjs");
            if !script_path.exists() {
                let err = format!("Скрипт не найден: {:?}", script_path);
                println!("[PROD ERROR] {}", err);
                return Err(err);
            }
            
            println!("[PROD] ✓ Скрипт: {:?}", script_path);
            
            // Устанавливаем путь к playwright-cache
            let cache_dir = match get_playwright_cache_dir() {
                Ok(dir) => dir,
                Err(e) => {
                    println!("[PROD WARN] Не удалось определить playwright-cache: {}", e);
                    app_dir.join("playwright-cache")
                }
            };
            
            let mut cmd = Command::new("node");
            cmd.arg(&script_path)
               .arg(format!("--payload={}", payload_b64))
               .env("PLAYWRIGHT_BROWSERS_PATH", &cache_dir)
               .current_dir(&app_dir);
            
            println!("[PROD] Payload length: {} bytes", payload_b64.len());
            
            // В PROD режиме скрываем консоль Node.js
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                cmd.creation_flags(CREATE_NO_WINDOW);
            }
            
            let child = cmd.spawn().map_err(|e| format!("Ошибка spawn: {}", e))?;
            println!("[PROD] ✓ Процесс запущен с PID: {:?}", child.id());
            return Ok(());
        }
    }
}

#[tauri::command]
async fn check_and_install_nodejs() -> Result<String, String> {
    use std::process::Command;
    
    // Check if Node.js is already installed
    let check = Command::new("node").arg("--version").output();
    
    match check {
        Ok(output) if output.status.success() => {
            let version = String::from_utf8_lossy(&output.stdout);
            Ok(format!("Node.js already installed: {}", version.trim()))
        }
        _ => {
            Err("Node.js не найден. Используйте мастер настройки для установки.".to_string())
        }
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
    use std::process::Command;
    
    // Проверяем Node.js
    let node_check = Command::new("node").arg("--version").output();
    let node_ok = node_check.map(|o| o.status.success()).unwrap_or(false);
    
    // Проверяем Playwright
    let pw_check = Command::new("npx").args(["playwright", "--version"]).output();
    let pw_ok = pw_check.map(|o| o.status.success()).unwrap_or(false);
    
    let mut status = Vec::new();
    status.push(format!("Node.js: {}", if node_ok { "установлен" } else { "НЕ установлен" }));
    status.push(format!("Playwright: {}", if pw_ok { "установлен" } else { "НЕ установлен" }));
    
    if node_ok && pw_ok {
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

/// Проверяет установлен ли Node.js (системный)
#[tauri::command]
async fn check_node_installed(_app: tauri::AppHandle) -> Result<bool, String> {
    use std::process::Command;
    
    // Проверяем системный Node.js
    let check = Command::new("node")
        .arg("--version")
        .output();
    
    match check {
        Ok(output) if output.status.success() => {
            let version = String::from_utf8_lossy(&output.stdout);
            println!("[CHECK] Node.js найден: {}", version.trim());
            Ok(true)
        }
        _ => {
            println!("[CHECK] Node.js не найден");
            Ok(false)
        }
    }
}

/// Проверяет установлены ли браузеры Playwright
#[tauri::command]
async fn check_browsers_installed(_app: tauri::AppHandle) -> Result<bool, String> {
    use std::process::Command;
    
    // Проверяем наличие npx и playwright
    let check = Command::new("npx")
        .args(["playwright", "--version"])
        .output();
    
    match check {
        Ok(output) if output.status.success() => {
            let version = String::from_utf8_lossy(&output.stdout);
            println!("[CHECK] Playwright найден: {}", version.trim());
            
            // Проверяем физическое наличие Chromium в кеше
            match get_playwright_cache_dir() {
                Ok(cache_dir) => {
                    let chromium_path = cache_dir.join("chromium-1194");
                    if chromium_path.exists() {
                        println!("[CHECK] ✓ Chromium найден в {}", chromium_path.display());
                        return Ok(true);
                    } else {
                        println!("[CHECK] Chromium не найден в {}", chromium_path.display());
                    }
                }
                Err(e) => {
                    println!("[CHECK] Ошибка получения пути к кешу: {}", e);
                }
            }
            
            // Playwright установлен, но Chromium не найден
            Ok(false)
        }
        _ => {
            println!("[CHECK] Playwright не найден");
            Ok(false)
        }
    }
}

/// Скачивает и запускает установщик Node.js с официального сайта
#[tauri::command]
async fn download_and_run_nodejs_installer() -> Result<String, String> {
    use std::io::Write;
    use futures_util::StreamExt;
    
    println!("[NODEJS] Скачиваем установщик Node.js...");
    
    // URL последней LTS версии Node.js для Windows x64
    let download_url = "https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi";
    
    let temp_dir = std::env::temp_dir();
    let installer_path = temp_dir.join("nodejs-setup.msi");
    
    // Скачиваем
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
    
    // Запускаем MSI установщик
    let status = std::process::Command::new("msiexec")
        .arg("/i")
        .arg(&installer_path)
        .arg("/qb")    // Базовый UI с прогрессом
        .arg("ADDLOCAL=ALL")
        .status()
        .map_err(|e| format!("Ошибка запуска установщика: {}", e))?;
    
    // Удаляем установщик
    let _ = std::fs::remove_file(&installer_path);
    
    if status.success() {
        Ok("Node.js успешно установлен! Перезапустите программу.".to_string())
    } else {
        Err("Установка Node.js отменена или завершилась с ошибкой".to_string())
    }
}

/// Получает корректный путь к playwright-cache (в корне проекта)
fn get_playwright_cache_dir() -> Result<std::path::PathBuf, String> {
    use std::env;
    use std::path::PathBuf;
    
    let current_exe = env::current_exe()
        .map_err(|e| format!("Не удалось получить путь к exe: {}", e))?;
    
    // Путь от exe
    let exe_dir = current_exe
        .parent()
        .ok_or("Не удалось получить директорию exe")?;
    
    // Вариант 1: Development mode - ищем в корне AEZAKMI-Portable-CLEAN
    // Путь: разработка/aezakmi/src-tauri/target/debug/app.exe
    // Идем: debug -> target -> src-tauri -> aezakmi -> разработка -> AEZAKMI-Portable-CLEAN
    if let Some(dev_root) = exe_dir
        .parent()  // target
        .and_then(|p| p.parent())  // src-tauri
        .and_then(|p| p.parent())  // aezakmi
        .and_then(|p| p.parent())  // разработка
        .and_then(|p| p.parent())  // AEZAKMI-Portable-CLEAN (корень)
    {
        let dev_cache = dev_root.join("playwright-cache");
        if dev_cache.exists() {
            println!("[CACHE] Найден кеш для разработки: {}", dev_cache.display());
            return Ok(dev_cache);
        }
    }
    
    // Вариант 2: Production mode - рядом с exe
    let prod_cache = exe_dir.join("playwright-cache");
    println!("[CACHE] Используем путь для production: {}", prod_cache.display());
    Ok(prod_cache)
}

/// Устанавливает Playwright и Chromium браузер через npm/npx
#[tauri::command]
async fn install_playwright_browsers_cmd() -> Result<String, String> {
    use std::process::Command;
    
    println!("[BROWSERS] Установка Playwright и Chromium...");
    
    // Проверяем Node.js
    let node_check = Command::new("node").arg("--version").output();
    if node_check.is_err() || !node_check.unwrap().status.success() {
        return Err("Node.js не установлен. Установите Node.js сначала.".to_string());
    }
    
    // Получаем путь к playwright-cache
    let cache_dir = get_playwright_cache_dir()?;
    
    println!("[BROWSERS] Путь к кешу: {}", cache_dir.display());
    
    // Проверяем существует ли Chromium
    let chromium_dir = cache_dir.join("chromium-1194");
    if chromium_dir.exists() {
        println!("[BROWSERS] ✓ Chromium уже установлен в {}", chromium_dir.display());
        return Ok("Chromium браузер уже установлен!".to_string());
    }
    
    // Создаем директорию если её нет
    if !cache_dir.exists() {
        std::fs::create_dir_all(&cache_dir)
            .map_err(|e| format!("Не удалось создать директорию кеша: {}", e))?;
    }
    
    // Устанавливаем Chromium браузер с переменной окружения
    println!("[BROWSERS] npx playwright install chromium...");
    let browser_install = Command::new("npx")
        .args(["playwright", "install", "chromium"])
        .env("PLAYWRIGHT_BROWSERS_PATH", &cache_dir)
        .output()
        .map_err(|e| format!("Ошибка установки Chromium: {}", e))?;
    
    if browser_install.status.success() {
        println!("[BROWSERS] Chromium успешно установлен!");
        Ok("Chromium браузер установлен!".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&browser_install.stderr);
        let stdout = String::from_utf8_lossy(&browser_install.stdout);
        println!("[BROWSERS] stdout: {}", stdout);
        println!("[BROWSERS] stderr: {}", stderr);
        Err(format!("Ошибка установки Chromium: {}", stderr))
    }
}

/// Проверяет установлен ли Playwright
#[tauri::command]
async fn check_playwright_installed(_app: tauri::AppHandle) -> Result<bool, String> {
    use std::process::Command;
    
    let check = Command::new("npx")
        .args(["playwright", "--version"])
        .output();
    
    match check {
        Ok(output) if output.status.success() => {
            println!("[CHECK] Playwright установлен");
            Ok(true)
        }
        _ => {
            println!("[CHECK] Playwright не установлен");
            Ok(false)
        }
    }
}

/// Устанавливает Node.js runtime
#[tauri::command]
async fn install_node_runtime(_app: tauri::AppHandle) -> Result<(), String> {
    println!("[Runtime] Installing Node.js...");
    download_and_run_nodejs_installer().await?;
    println!("[Runtime] Node.js installed successfully");
    Ok(())
}

/// Устанавливает Playwright runtime
#[tauri::command]
async fn install_playwright_runtime(_app: tauri::AppHandle) -> Result<(), String> {
    println!("[Runtime] Installing Playwright...");
    install_playwright_browsers_cmd().await?;
    println!("[Runtime] Playwright installed successfully");
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
    
    let app_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .ok_or("Failed to get app directory")?;
    
    let script_path = app_dir.join("scripts").join("launch_playwright.cjs");
    
    if !script_path.exists() {
        return Err("Скрипт запуска не найден. Переустановите приложение.".to_string());
    }
    
    // Получаем путь к playwright-cache
    let cache_dir = match get_playwright_cache_dir() {
        Ok(dir) => dir,
        Err(e) => {
            println!("[CookieBot WARN] Не удалось определить playwright-cache: {}", e);
            app_dir.join("playwright-cache")
        }
    };
    
    // Создаём временный JSON файл для конфигурации cookie bot
    let temp_dir = std::env::temp_dir();
    let config_file = temp_dir.join("aezakmi_cookie_bot_config.json");
    std::fs::write(&config_file, &config_json)
        .map_err(|e| format!("Ошибка записи конфигурации: {}", e))?;
    
    let child = Command::new("node")
        .arg(&script_path)
        .arg("--cookie-bot")
        .arg("--config")
        .arg(&config_file)
        .arg("--profile-id")
        .arg(&profile_id)
        .env("PLAYWRIGHT_BROWSERS_PATH", &cache_dir)
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
    use std::process::Command;
    
    let check = Command::new("npx")
        .args(["playwright", "--version"])
        .output();
    
    match check {
        Ok(output) if output.status.success() => {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            Ok(version)
        }
        _ => Err("Playwright не установлен".to_string())
    }
}

/// Обновляет Playwright runtime
#[tauri::command]
async fn update_playwright_runtime(_app: tauri::AppHandle) -> Result<String, String> {
    use std::process::Command;
    
    println!("[Playwright] Updating runtime...");
    
    // Обновляем playwright через npm
    let update = Command::new("npm")
        .args(["install", "-g", "playwright@latest"])
        .output()
        .map_err(|e| format!("npm update error: {}", e))?;
    
    if !update.status.success() {
        let stderr = String::from_utf8_lossy(&update.stderr);
        println!("[Playwright] npm update stderr: {}", stderr);
    }
    
    // Устанавливаем/обновляем Chromium
    let install = Command::new("npx")
        .args(["playwright", "install", "chromium"])
        .output()
        .map_err(|e| format!("playwright install error: {}", e))?;
    
    if install.status.success() {
        Ok("Playwright обновлён".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&install.stderr);
        Err(format!("Ошибка обновления: {}", stderr))
    }
}