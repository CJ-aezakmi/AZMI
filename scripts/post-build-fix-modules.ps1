# POST-BUILD FIX: Копирует modules/ в собранный bundle
# Tauri glob не сохраняет структуру папок — копируем вручную!

Write-Host "=== POST-BUILD: Исправление playwright/modules/ ==="

$bundleDir = "src-tauri\target\release\bundle\nsis"
if (-not (Test-Path $bundleDir)) {
    Write-Host "❌ Bundle директория не найдена: $bundleDir"
    exit 1
}

# Находим директорию с установленными файлами (внутри nsis/)
$unpackedDirs = Get-ChildItem $bundleDir -Directory | Where-Object { $_.Name -like "*_*" -or $_.Name -eq "app-unpacked" }

if ($unpackedDirs.Count -eq 0) {
    Write-Host "❌ Не найдена unpacked директория в $bundleDir"
    exit 1
}

$unpackedDir = $unpackedDirs[0].FullName
Write-Host "✓ Найдена unpacked директория: $unpackedDir"

# Путь к modules в исходниках
$sourceModules = "src-tauri\playwright\modules"
if (-not (Test-Path $sourceModules)) {
    Write-Host "❌ Исходная modules не найдена: $sourceModules"
    exit 1
}

# Путь назначения в bundle
$destPlaywright = Join-Path $unpackedDir "playwright"
if (-not (Test-Path $destPlaywright)) {
    Write-Host "❌ playwright директория не найдена в bundle: $destPlaywright"
    exit 1
}

$destModules = Join-Path $destPlaywright "modules"

# Удаляем старую modules (если есть битая)
if (Test-Path $destModules) {
    Write-Host "Удаляем старую modules..."
    Remove-Item -Recurse -Force $destModules
}

# Копируем modules целиком
Write-Host "Копирование: $sourceModules → $destModules"
Copy-Item -Recurse -Force $sourceModules $destModules

# Проверка
$playwrightCore = Join-Path $destModules "playwright-core\package.json"
if (Test-Path $playwrightCore) {
    $version = (Get-Content $playwrightCore | ConvertFrom-Json).version
    Write-Host "✅ SUCCESS! playwright-core версия $version установлен в bundle"
    exit 0
} else {
    Write-Host "❌ ОШИБКА! playwright-core не найден после копирования!"
    exit 1
}
