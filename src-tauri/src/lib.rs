// src-tauri/src/lib.rs — ПУСТОЙ
// ВРЕМЕННО: Включаем консоль для отладки
// #![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

use base64::Engine;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // КРИТИЧНО: Копируем bundled ресурсы СИНХРОННО при первом запуске
            println!("[STARTUP] Проверка и установка ресурсов...");
            let app_handle = app.handle().clone();
            
            // Блокируем до завершения установки ресурсов
            tauri::async_runtime::block_on(async move {
                match setup_bundled_resources(&app_handle).await {
                    Ok(_) => println!("[STARTUP] ✅ Ресурсы готовы"),
                    Err(e) => println!("[STARTUP] ⚠️ Ошибка установки ресурсов: {}", e),
                }
            });
            
            println!("[STARTUP] Запуск приложения...");
            
            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.open_devtools();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_profile,
            check_and_install_nodejs,
            validate_license_key,
            check_and_install_playwright,
            download_update,
            install_update
        ])
        .run(tauri::generate_context!())
        .expect("error")
}

#[tauri::command]
fn open_profile(_app: tauri::AppHandle, app_path: String, args: String) -> Result<(), String> {
    use std::process::Command;

    // macOS implementation
    #[cfg(target_os = "macos")]
    {
        // Определяем какой лаунчер использовать
        let script_name = match app_path.as_str() {
            "advanced-antidetect" => "advanced-antidetect-launcher.js",
            "playwright" => "launch_playwright.js",
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
        // Определяем какой лаунчер использовать
        let script_name = match app_path.as_str() {
            "advanced-antidetect" => "advanced-antidetect-launcher.js",
            "playwright" => "launch_puppeteer.cjs",
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
            
            // Скрываем консоль Node.js на Windows
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                cmd.creation_flags(CREATE_NO_WINDOW);
            }
            
            let child = cmd.spawn().map_err(|e| format!("Ошибка запуска: {}", e))?;
            println!("[DEBUG] Процесс запущен с PID: {:?}", child.id());
            return Ok(());
        }

        // Production mode - В production используем bundled Node.js и скрипты
        #[cfg(not(debug_assertions))]
            {
                #[cfg(target_os = "windows")]
                {
                    println!("[PROD] Production режим - используем bundled ресурсы");
                    
                    // Получаем директорию приложения
                    let app_dir = std::env::current_exe()
                        .ok()
                        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
                        .ok_or("Failed to get app directory")?;
                    
                    println!("[PROD] Директория приложения: {:?}", app_dir);
                    
                    // Используем bundled Node.js
                    let node_exe = app_dir.join("node").join("node.exe");
                    if !node_exe.exists() {
                        let err = format!("Node.js не найден: {:?}", node_exe);
                        println!("[PROD ERROR] {}", err);
                        return Err(err);
                    }
                    
                    // Ищем скрипт
                    let script_path = app_dir.join("scripts").join("launch_puppeteer.cjs");
                    if !script_path.exists() {
                        let err = format!("Скрипт не найден: {:?}", script_path);
                        println!("[PROD ERROR] {}", err);
                        return Err(err);
                    }
                    
                    // Проверяем playwright
                    let playwright_dir = app_dir.join("playwright");
                    if !playwright_dir.exists() {
                        let err = format!("Playwright не найден: {:?}", playwright_dir);
                        println!("[PROD ERROR] {}", err);
                        return Err(err);
                    }
                    
                    println!("[PROD] ✓ Node.js: {:?}", node_exe);
                    println!("[PROD] ✓ Скрипт: {:?}", script_path);
                    println!("[PROD] ✓ Playwright: {:?}", playwright_dir);
                    
                    // Создаём команду запуска
                    let node_modules = playwright_dir.join("node_modules");
                    
                    let mut cmd = Command::new(&node_exe);
                    cmd.arg(&script_path)
                       .arg(format!("--payload={}", payload_b64))
                       .current_dir(&app_dir);
                    
                    // Добавляем пути к окружению
                    if let Ok(path) = std::env::var("PATH") {
                        let new_path = format!("{};{}", app_dir.join("node").display(), path);
                        cmd.env("PATH", new_path);
                    }
                    
                    cmd.env("NODE_PATH", &node_modules);
                    
                    // ВАЖНО: Chromium находится в playwright-cache, а не в node_modules!
                    let chromium_cache = app_dir.join("playwright-cache");
                    cmd.env("PLAYWRIGHT_BROWSERS_PATH", &chromium_cache);
                    
                    println!("[PROD] Запускаем: {:?}", cmd);
                    println!("[PROD] PLAYWRIGHT_BROWSERS_PATH: {:?}", chromium_cache);
                    println!("[PROD] Payload length: {} bytes", payload_b64.len());
                    
                    // Скрываем консоль Node.js
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
                
                #[cfg(not(target_os = "windows"))]
                {
                    let cwd = std::env::current_dir().map_err(|e| e.to_string())?;
                    let mut script_path = cwd.join("scripts").join("launch_puppeteer.cjs");
                    if !script_path.exists() {
                        if let Some(parent) = cwd.parent() {
                            let alt = parent.join("scripts").join("launch_puppeteer.cjs");
                            if alt.exists() {
                                script_path = alt;
                            }
                        }
                    }

                    let mut cmd = Command::new("node");
                    cmd.arg(script_path).arg(format!("--payload={}", payload_b64));
                    
                    let _child = cmd.spawn().map_err(|e| e.to_string())?;
                    return Ok(());
                }
            }
    }
}

#[tauri::command]
async fn check_and_install_nodejs() -> Result<String, String> {
    use std::process::Command;
    
    // Check if Node.js is already installed
    #[cfg(target_os = "windows")]
    {
        let check = Command::new("node")
            .arg("--version")
            .output();
        
        if check.is_ok() && check.unwrap().status.success() {
            return Ok("Node.js already installed".to_string());
        }
        
        // Node.js not found, try to install from bundled installer
        let app_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
            .ok_or("Failed to get app directory")?;
        
        let installer_candidates = vec![
            app_dir.join("node-installer.msi"),
            app_dir.join("resources").join("node-installer.msi"),
            app_dir.join("binaries").join("node-installer.msi"),
        ];
        
        let installer_path = installer_candidates.into_iter()
            .find(|p| p.exists())
            .ok_or("Node.js installer not found. Please install Node.js 18+ manually from https://nodejs.org")?;
        
        // Launch installer with UI (not silent, so user can see progress)
        let mut cmd = Command::new("msiexec");
        cmd.arg("/i")
           .arg(installer_path)
           .arg("/qb") // Basic UI with progress
           .arg("ADDLOCAL=ALL");
        
        let status = cmd.status().map_err(|e| format!("Failed to launch installer: {}", e))?;
        
        if status.success() {
            Ok("Node.js installation started. Please restart the application after installation completes.".to_string())
        } else {
            Err("Installation was cancelled or failed. Please install Node.js manually from https://nodejs.org".to_string())
        }
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        Ok("Node.js check is only available on Windows".to_string())
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

// Функция для копирования bundled ресурсов
async fn setup_bundled_resources(_app: &tauri::AppHandle) -> Result<(), String> {
    use std::fs;
    
    #[cfg(target_os = "windows")]
    {
        let app_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
            .ok_or("Failed to get app directory")?;
        
        println!("[SETUP] Директория приложения: {:?}", app_dir);
        
        let bundle_dir = app_dir.join("bundle");
        
        // Проверяем маркер установки
        let setup_marker = app_dir.join(".aezakmi_setup_done");
        if setup_marker.exists() {
            println!("[SETUP] ✅ Ресурсы уже установлены (найден маркер)");
            
            // Дополнительная проверка что ресурсы действительно на месте
            let node_exists = app_dir.join("node").join("node.exe").exists();
            let playwright_exists = app_dir.join("playwright").exists();
            let scripts_exists = app_dir.join("scripts").join("launch_puppeteer.cjs").exists();
            
            if node_exists && playwright_exists && scripts_exists {
                println!("[SETUP] ✅ Все компоненты на месте");
                return Ok(());
            } else {
                println!("[SETUP] ⚠️ Маркер есть, но ресурсы отсутствуют! Переустановка...");
                let _ = fs::remove_file(&setup_marker);
            }
        }
        
        // Проверяем наличие bundle
        if !bundle_dir.exists() {
            println!("[SETUP] ❌ Bundle директория не найдена: {:?}", bundle_dir);
            println!("[SETUP] Это нормально для dev режима");
            return Ok(());
        }
        
        println!("[SETUP] 📦 Найден bundle: {:?}", bundle_dir);
        
        println!("[SETUP] 🚀 Начинаем копирование bundled ресурсов...");
        
        // Копируем Node.js
        let node_src = bundle_dir.join("node");
        let node_dest = app_dir.join("node");
        if node_src.exists() {
            if node_dest.exists() {
                println!("[SETUP] Node.js уже установлен, пропускаем");
            } else {
                println!("[SETUP] ⏳ Копирование Node.js (~50MB)...");
                copy_dir_all(&node_src, &node_dest)
                    .map_err(|e| format!("Ошибка копирования Node.js: {}", e))?;
                println!("[SETUP] ✅ Node.js установлен");
            }
        } else {
            return Err("Node.js не найден в bundle!".to_string());
        }
        
        // Копируем Playwright
        let playwright_src = bundle_dir.join("playwright");
        let playwright_dest = app_dir.join("playwright");
        if playwright_src.exists() {
            if playwright_dest.exists() {
                println!("[SETUP] Playwright уже установлен, пропускаем");
            } else {
                println!("[SETUP] ⏳ Копирование Playwright (~400MB, может занять минуту)...");
                copy_dir_all(&playwright_src, &playwright_dest)
                    .map_err(|e| format!("Ошибка копирования Playwright: {}", e))?;
                println!("[SETUP] ✅ Playwright установлен");
            }
        } else {
            return Err("Playwright не найден в bundle!".to_string());
        }
        
        // Копируем скрипты
        let scripts_src = bundle_dir.join("scripts");
        let scripts_dest = app_dir.join("scripts");
        if scripts_src.exists() {
            if scripts_dest.exists() {
                println!("[SETUP] Скрипты уже установлены, пропускаем");
            } else {
                println!("[SETUP] ⏳ Копирование скриптов...");
                copy_dir_all(&scripts_src, &scripts_dest)
                    .map_err(|e| format!("Ошибка копирования скриптов: {}", e))?;
                println!("[SETUP] ✅ Скрипты установлены");
            }
        } else {
            return Err("Скрипты не найдены в bundle!".to_string());
        }
        
        // Создаём маркер успешной установки
        fs::write(&setup_marker, "installed")
            .map_err(|e| format!("Ошибка создания маркера: {}", e))?;
        
        println!("[SETUP] ✅✅✅ ВСЕ РЕСУРСЫ УСПЕШНО УСТАНОВЛЕНЫ! ✅✅✅");
        println!("[SETUP] Node.js: {:?}", node_dest);
        println!("[SETUP] Playwright: {:?}", playwright_dest);
        println!("[SETUP] Скрипты: {:?}", scripts_dest);
    }
    
    Ok(())
}

fn copy_dir_all(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    use std::fs;
    
    fs::create_dir_all(dst)?;
    
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let dst_path = dst.join(entry.file_name());
        
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &dst_path)?;
        } else {
            fs::copy(entry.path(), dst_path)?;
        }
    }
    
    Ok(())
}

// Команда для проверки статуса установки
#[tauri::command]
async fn check_and_install_playwright() -> Result<String, String> {
    let app_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .ok_or("Failed to get app directory")?;
    
    let playwright_dir = app_dir.join("playwright");
    let node_dir = app_dir.join("node");
    
    if playwright_dir.exists() && node_dir.exists() {
        return Ok("✅ Все компоненты установлены и готовы к работе!".to_string());
    } else {
        return Err("Ресурсы не установлены. Переустановите приложение.".to_string());
    }
}

// Команда для проверки статуса Playwright
#[tauri::command]
#[allow(dead_code)]
fn check_playwright_status() -> Result<serde_json::Value, String> {
    use std::process::Command;
    
    let mut status = serde_json::json!({
        "node_installed": false,
        "node_version": null,
        "playwright_installed": false,
        "script_found": false,
        "script_path": null,
        "current_dir": null
    });
    
    // Проверяем Node.js
    let node_check = Command::new("node").arg("--version").output();
    if let Ok(output) = node_check {
        if output.status.success() {
            status["node_installed"] = serde_json::json!(true);
            status["node_version"] = serde_json::json!(String::from_utf8_lossy(&output.stdout).trim());
        }
    }
    
    // Проверяем текущую директорию
    if let Ok(cwd) = std::env::current_dir() {
        status["current_dir"] = serde_json::json!(cwd.to_string_lossy());
        
        // Ищем скрипт
        let mut script_candidates = vec![
            cwd.join("scripts").join("launch_puppeteer.cjs"),
        ];
        
        if let Some(parent) = cwd.parent() {
            script_candidates.push(parent.join("scripts").join("launch_puppeteer.cjs"));
        }
        
        for candidate in &script_candidates {
            if candidate.exists() {
                status["script_found"] = serde_json::json!(true);
                status["script_path"] = serde_json::json!(candidate.to_string_lossy());
                break;
            }
        }
    }
    
    // Проверяем Playwright
    let pw_check = Command::new("npx").arg("playwright").arg("--version").output();
    if let Ok(output) = pw_check {
        if output.status.success() {
            status["playwright_installed"] = serde_json::json!(true);
        }
    }
    
    Ok(status)
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
