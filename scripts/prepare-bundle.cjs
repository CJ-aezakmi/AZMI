#!/usr/bin/env node
// ============================================================
// AEZAKMI Pro — prepare-bundle.cjs
// Подготавливает ресурсы для Tauri NSIS сборки:
//   1. Скачивает portable Node.js → src-tauri/node/
//   2. Устанавливает Playwright пакет (БЕЗ браузеров) → src-tauri/playwright/
//   3. Копирует скрипты → src-tauri/scripts/
// Результат используется в tauri.conf.json → bundle.resources
// ============================================================

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.join(__dirname, '..');
const SRC_TAURI = path.join(PROJECT_ROOT, 'src-tauri');

// Ресурсы кладём ВНУТРЬ src-tauri/ для Tauri bundling
const NODE_DIR = path.join(SRC_TAURI, 'node');
const SCRIPTS_DIR = path.join(SRC_TAURI, 'scripts');
const PLAYWRIGHT_DIR = path.join(SRC_TAURI, 'playwright');

const NODE_VERSION = '20.11.1';

console.log('🚀 Подготовка ресурсов для Tauri сборки...');
console.log(`   Выход: ${SRC_TAURI}`);

// ============================================================
// Шаг 1: Portable Node.js
// ============================================================
console.log('\n📦 Шаг 1: Node.js portable v' + NODE_VERSION + '...');

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

    const extractedDir = path.join(extractTmp, `node-v${NODE_VERSION}-win-x64`);
    if (fs.existsSync(extractedDir)) {
      for (const file of fs.readdirSync(extractedDir)) {
        const src = path.join(extractedDir, file);
        const dest = path.join(NODE_DIR, file);
        if (fs.existsSync(dest)) {
          fs.rmSync(dest, { recursive: true, force: true });
        }
        fs.renameSync(src, dest);
      }
    }

    // Cleanup
    if (fs.existsSync(nodeZipPath)) fs.unlinkSync(nodeZipPath);
    if (fs.existsSync(extractTmp)) fs.rmSync(extractTmp, { recursive: true, force: true });

    console.log('   ✅ Node.js готов');
  } catch (error) {
    console.error('   ❌ Ошибка загрузки Node.js:', error.message);
    process.exit(1);
  }
} else {
  console.log('   ✅ Node.js уже скачан');
}

// ============================================================
// Шаг 2: Playwright пакет (БЕЗ скачивания браузеров!)
// Браузеры загрузятся при первом запуске приложения
// ============================================================
console.log('\n📦 Шаг 2: Playwright пакет (без браузеров)...');

if (!fs.existsSync(PLAYWRIGHT_DIR)) {
  fs.mkdirSync(PLAYWRIGHT_DIR, { recursive: true });
}

const playwrightPkg = path.join(PLAYWRIGHT_DIR, 'package.json');
fs.writeFileSync(playwrightPkg, JSON.stringify({
  name: 'aezakmi-playwright-bundle',
  version: '1.0.0',
  private: true,
  dependencies: {
    'playwright': '^1.50.0'
  }
}, null, 2));

const playwrightNodeModules = path.join(PLAYWRIGHT_DIR, 'node_modules', 'playwright-core');
if (!fs.existsSync(playwrightNodeModules)) {
  try {
    const npmExe = path.join(NODE_DIR, 'npm.cmd');
    const nodeExe = path.join(NODE_DIR, 'node.exe');

    if (!fs.existsSync(npmExe) || !fs.existsSync(nodeExe)) {
      throw new Error('Node.js не найден в ' + NODE_DIR);
    }

    console.log('   Установка playwright пакета...');
    execSync(`"${npmExe}" install --ignore-scripts`, {
      cwd: PLAYWRIGHT_DIR,
      stdio: 'inherit',
      env: {
        ...process.env,
        PATH: `${NODE_DIR};${process.env.PATH}`,
        PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1'
      },
      timeout: 120000
    });

    // Удаляем браузерные бинарники если они случайно попали
    const pwPkgDir = path.join(PLAYWRIGHT_DIR, 'node_modules', 'playwright');
    if (fs.existsSync(pwPkgDir)) {
      for (const item of fs.readdirSync(pwPkgDir)) {
        if (item.match(/^(chromium|firefox|webkit|ffmpeg|winldd|\.links)/)) {
          const itemPath = path.join(pwPkgDir, item);
          console.log(`   Удаляем лишнее: ${item}`);
          fs.rmSync(itemPath, { recursive: true, force: true });
        }
      }
    }

    console.log('   ✅ Playwright пакет установлен (без браузеров)');
  } catch (error) {
    console.error('   ❌ Ошибка установки Playwright:', error.message);
    process.exit(1);
  }
} else {
  console.log('   ✅ Playwright пакет уже установлен');
}

// ============================================================
// Шаг 3: Копируем скрипты
// ============================================================
console.log('\n📦 Шаг 3: Скрипты...');

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
// Шаг 4: Итоги
// ============================================================
function getDirSize(dirPath) {
  if (!fs.existsSync(dirPath)) return 0;
  let size = 0;
  for (const file of fs.readdirSync(dirPath)) {
    const filePath = path.join(dirPath, file);
    const stats = fs.statSync(filePath);
    size += stats.isDirectory() ? getDirSize(filePath) : stats.size;
  }
  return size;
}

const nodeMB = (getDirSize(NODE_DIR) / (1024 * 1024)).toFixed(1);
const pwMB = (getDirSize(PLAYWRIGHT_DIR) / (1024 * 1024)).toFixed(1);
const scriptsMB = (getDirSize(SCRIPTS_DIR) / (1024 * 1024)).toFixed(2);

console.log('\n📊 Размеры ресурсов:');
console.log(`   Node.js:    ${nodeMB} MB`);
console.log(`   Playwright: ${pwMB} MB`);
console.log(`   Scripts:    ${scriptsMB} MB`);
console.log(`   ИТОГО:      ${(parseFloat(nodeMB) + parseFloat(pwMB) + parseFloat(scriptsMB)).toFixed(1)} MB`);
console.log('\n✅ Ресурсы готовы для Tauri сборки!');
