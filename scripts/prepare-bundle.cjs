#!/usr/bin/env node
// ============================================================
// AEZAKMI Pro — prepare-bundle.cjs v2.0
// Подготавливает ресурсы для Tauri NSIS сборки:
//   1. Скачивает ТОЛЬКО node.exe → src-tauri/node/
//   2. Копирует скрипты → src-tauri/scripts/
//
// Camoufox скачивается пользователем при первом запуске через UI.
// Playwright больше не используется.
// ============================================================

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.join(__dirname, '..');
const SRC_TAURI = path.join(PROJECT_ROOT, 'src-tauri');

const NODE_DIR = path.join(SRC_TAURI, 'node');
const SCRIPTS_DIR = path.join(SRC_TAURI, 'scripts');

const NODE_VERSION = '20.11.1';

console.log('🚀 AEZAKMI Pro — подготовка ресурсов для Tauri сборки...');
console.log(`   Выход: ${SRC_TAURI}`);

// ============================================================
// Шаг 1: ТОЛЬКО node.exe из portable Node.js
// ============================================================
console.log('\n📦 Шаг 1: node.exe v' + NODE_VERSION + '...');

if (!fs.existsSync(NODE_DIR)) {
  fs.mkdirSync(NODE_DIR, { recursive: true });
}

if (!fs.existsSync(path.join(NODE_DIR, 'node.exe'))) {
  const nodeUrl = `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`;
  const nodeZipPath = path.join(SRC_TAURI, 'node-download.zip');
  const extractTmp = path.join(SRC_TAURI, 'node-extract-tmp');

  console.log(`   Загрузка: ${nodeUrl}`);
  try {
    execSync(
      `powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '${nodeUrl}' -OutFile '${nodeZipPath}'"`,
      { stdio: 'inherit', timeout: 180000 }
    );

    console.log('   Распаковка...');
    if (fs.existsSync(extractTmp)) {
      fs.rmSync(extractTmp, { recursive: true, force: true });
    }
    execSync(
      `powershell -Command "Expand-Archive -Path '${nodeZipPath}' -DestinationPath '${extractTmp}' -Force"`,
      { stdio: 'inherit', timeout: 120000 }
    );

    // Копируем ТОЛЬКО node.exe
    const extractedDir = path.join(extractTmp, `node-v${NODE_VERSION}-win-x64`);
    const srcExe = path.join(extractedDir, 'node.exe');
    const destExe = path.join(NODE_DIR, 'node.exe');
    if (fs.existsSync(srcExe)) {
      fs.copyFileSync(srcExe, destExe);
      console.log('   ✅ node.exe скопирован');
    } else {
      throw new Error('node.exe не найден в архиве');
    }

    // Cleanup zip и tmp
    if (fs.existsSync(nodeZipPath)) fs.unlinkSync(nodeZipPath);
    if (fs.existsSync(extractTmp)) fs.rmSync(extractTmp, { recursive: true, force: true });

    console.log('   ✅ Node.js готов');
  } catch (error) {
    console.error('   ❌ Ошибка загрузки Node.js:', error.message);
    process.exit(1);
  }
} else {
  console.log('   ✅ node.exe уже есть');
}

// Очищаем node/ от лишних файлов (npm, npx и т.д.)
if (fs.existsSync(NODE_DIR)) {
  for (const item of fs.readdirSync(NODE_DIR)) {
    if (item === 'node.exe') continue;
    const itemPath = path.join(NODE_DIR, item);
    fs.rmSync(itemPath, { recursive: true, force: true });
    console.log(`   Удалено: ${item}`);
  }
}

// ============================================================
// Шаг 2: Копируем скрипты
// ============================================================
console.log('\n📦 Шаг 2: Скрипты...');

if (!fs.existsSync(SCRIPTS_DIR)) {
  fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
}

const launchScript = path.join(__dirname, 'launch_playwright.cjs');
const destScript = path.join(SCRIPTS_DIR, 'launch_playwright.cjs');

if (fs.existsSync(launchScript)) {
  fs.copyFileSync(launchScript, destScript);
  console.log('   ✅ launch_playwright.cjs скопирован');
} else {
  console.error('   ❌ launch_playwright.cjs не найден в ' + __dirname);
  process.exit(1);
}

// ============================================================
// Шаг 3: Очистка старых артефактов Playwright (если остались)
// ============================================================
const PLAYWRIGHT_DIR = path.join(SRC_TAURI, 'playwright');
if (fs.existsSync(PLAYWRIGHT_DIR)) {
  fs.rmSync(PLAYWRIGHT_DIR, { recursive: true, force: true });
  console.log('\n🧹 Удалена старая папка playwright/ (больше не используется)');
}

// ============================================================
// Шаг 4: Проверка и итоги
// ============================================================
const criticalFiles = [
  path.join(NODE_DIR, 'node.exe'),
  path.join(SCRIPTS_DIR, 'launch_playwright.cjs'),
];
console.log('\n🔍 Проверка критичных файлов:');
for (const f of criticalFiles) {
  const exists = fs.existsSync(f);
  const rel = path.relative(SRC_TAURI, f);
  console.log(`   ${exists ? '✅' : '❌'} ${rel}`);
  if (!exists) {
    console.error(`КРИТИЧЕСКАЯ ОШИБКА: ${f} не найден!`);
    process.exit(1);
  }
}

function getDirSize(dirPath) {
  if (!fs.existsSync(dirPath)) return 0;
  let size = 0;
  try {
    for (const file of fs.readdirSync(dirPath)) {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      size += stats.isDirectory() ? getDirSize(filePath) : stats.size;
    }
  } catch (e) {}
  return size;
}

const nodeMB = (getDirSize(NODE_DIR) / (1024 * 1024)).toFixed(1);
const scriptsMB = (getDirSize(SCRIPTS_DIR) / (1024 * 1024)).toFixed(2);

console.log('\n📊 Размеры ресурсов:');
console.log(`   node.exe:   ${nodeMB} MB`);
console.log(`   Scripts:    ${scriptsMB} MB`);
console.log(`   ИТОГО:      ${(parseFloat(nodeMB) + parseFloat(scriptsMB)).toFixed(1)} MB`);
console.log('\n✅ Ресурсы готовы для Tauri сборки!');
