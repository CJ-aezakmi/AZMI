#!/usr/bin/env node
// ============================================================
// AEZAKMI Pro — prepare-bundle.cjs
// Подготавливает ресурсы для Tauri NSIS сборки:
//   1. Скачивает ТОЛЬКО node.exe → src-tauri/node/
//   2. Устанавливает Playwright пакет (БЕЗ браузеров) → src-tauri/playwright/
//      ВАЖНО: node_modules переименовывается в modules (Tauri исключает node_modules!)
//   3. Копирует скрипты → src-tauri/scripts/
// ============================================================

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.join(__dirname, '..');
const SRC_TAURI = path.join(PROJECT_ROOT, 'src-tauri');

const NODE_DIR = path.join(SRC_TAURI, 'node');
const SCRIPTS_DIR = path.join(SRC_TAURI, 'scripts');
const PLAYWRIGHT_DIR = path.join(SRC_TAURI, 'playwright');

const NODE_VERSION = '20.11.1';

console.log('🚀 Подготовка ресурсов для Tauri сборки...');
console.log(`   Выход: ${SRC_TAURI}`);

// ============================================================
// Шаг 1: ТОЛЬКО node.exe из portable Node.js
// npm/npx/corepack/node_modules НЕ нужны — экономим ~30MB
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

    // Также копируем npm.cmd и npx.cmd + node_modules/npm для prepare-bundle
    // (нужны ТОЛЬКО для npm install playwright, потом удалим)
    const npmCmd = path.join(extractedDir, 'npm.cmd');
    const npxCmd = path.join(extractedDir, 'npx.cmd');
    const nodeModules = path.join(extractedDir, 'node_modules');
    if (fs.existsSync(npmCmd)) fs.copyFileSync(npmCmd, path.join(NODE_DIR, 'npm.cmd'));
    if (fs.existsSync(npxCmd)) fs.copyFileSync(npxCmd, path.join(NODE_DIR, 'npx.cmd'));
    if (fs.existsSync(nodeModules)) {
      // Копируем рекурсивно node_modules для npm install
      execSync(`xcopy "${nodeModules}" "${path.join(NODE_DIR, 'node_modules')}" /E /I /Q /Y`, {
        stdio: 'pipe', timeout: 60000
      });
    }

    // Cleanup zip и tmp
    if (fs.existsSync(nodeZipPath)) fs.unlinkSync(nodeZipPath);
    if (fs.existsSync(extractTmp)) fs.rmSync(extractTmp, { recursive: true, force: true });

    console.log('   ✅ Node.js распакован (полный, нужен для npm install)');
  } catch (error) {
    console.error('   ❌ Ошибка загрузки Node.js:', error.message);
    process.exit(1);
  }
} else {
  console.log('   ✅ node.exe уже есть');
}

// ============================================================
// Шаг 2: Playwright пакет (БЕЗ скачивания браузеров!)
// ВАЖНО: после установки node_modules → modules (Tauri исключает node_modules!)
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

// Проверяем modules/ (финальное имя) или node_modules/ (до rename)
const modulesDir = path.join(PLAYWRIGHT_DIR, 'modules');
const nodeModulesDir = path.join(PLAYWRIGHT_DIR, 'node_modules');
const playwrightCoreCheck = path.join(modulesDir, 'playwright-core');

if (!fs.existsSync(playwrightCoreCheck)) {
  try {
    const npmExe = path.join(NODE_DIR, 'npm.cmd');
    const nodeExe = path.join(NODE_DIR, 'node.exe');

    if (!fs.existsSync(npmExe) || !fs.existsSync(nodeExe)) {
      throw new Error('npm.cmd не найден в ' + NODE_DIR);
    }

    // Удаляем старые node_modules если есть
    if (fs.existsSync(nodeModulesDir)) {
      fs.rmSync(nodeModulesDir, { recursive: true, force: true });
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

    // Удаляем браузерные бинарники если попали
    const pwPkgDir = path.join(nodeModulesDir, 'playwright');
    if (fs.existsSync(pwPkgDir)) {
      for (const item of fs.readdirSync(pwPkgDir)) {
        if (item.match(/^(chromium|firefox|webkit|ffmpeg|winldd|\.links)/)) {
          const itemPath = path.join(pwPkgDir, item);
          console.log(`   Удаляем лишнее: ${item}`);
          fs.rmSync(itemPath, { recursive: true, force: true });
        }
      }
    }

    // *** КЛЮЧЕВОЙ ШАГ: Переименовываем node_modules → modules ***
    // Tauri resources НЕ включает папки с именем node_modules!
    if (fs.existsSync(nodeModulesDir)) {
      if (fs.existsSync(modulesDir)) {
        fs.rmSync(modulesDir, { recursive: true, force: true });
      }
      fs.renameSync(nodeModulesDir, modulesDir);
      console.log('   ✅ node_modules → modules (обход ограничения Tauri)');
    }

    console.log('   ✅ Playwright пакет готов');
  } catch (error) {
    console.error('   ❌ Ошибка установки Playwright:', error.message);
    process.exit(1);
  }
} else {
  console.log('   ✅ Playwright пакет уже установлен');
}

// *** ВСЕГДА чистим modules/ от мусора (даже если уже был установлен из git) ***
if (fs.existsSync(modulesDir)) {
  // Удаляем .bin/ (содержит symlinks → ломает Tauri bundling)
  const binDir = path.join(modulesDir, '.bin');
  if (fs.existsSync(binDir)) {
    fs.rmSync(binDir, { recursive: true, force: true });
    console.log('   ✅ Удалён modules/.bin/ (symlinks)');
  }

  // Удаляем вложенные node_modules/ внутри modules/
  function removeNestedNodeModules(dir) {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, item);
      if (!fs.statSync(fullPath).isDirectory()) continue;
      if (item === 'node_modules') {
        fs.rmSync(fullPath, { recursive: true, force: true });
        console.log(`   ✅ Удалён вложенный: ${path.relative(PLAYWRIGHT_DIR, fullPath)}`);
      } else {
        removeNestedNodeModules(fullPath);
      }
    }
  }
  removeNestedNodeModules(modulesDir);

  // Удаляем .package-lock.json (не нужен в production)
  const pkgLock = path.join(modulesDir, '.package-lock.json');
  if (fs.existsSync(pkgLock)) {
    fs.unlinkSync(pkgLock);
    console.log('   ✅ Удалён .package-lock.json');
  }
}

// ============================================================
// Шаг 3: Убираем npm/npx/node_modules из node/
// В установщик попадёт ТОЛЬКО node.exe (~70 MB)
// ============================================================
console.log('\n📦 Шаг 3: Очистка node/ (оставляем только node.exe)...');
const nodeDir = NODE_DIR;
if (fs.existsSync(nodeDir)) {
  for (const item of fs.readdirSync(nodeDir)) {
    if (item === 'node.exe') continue; // Оставляем
    const itemPath = path.join(nodeDir, item);
    fs.rmSync(itemPath, { recursive: true, force: true });
    console.log(`   Удалено: ${item}`);
  }
}
console.log('   ✅ Оставлен только node.exe');

// ============================================================
// Шаг 4: Генерируем chromium-info.json для прямой загрузки
// Читаем browsers.json → извлекаем URL скачивания Chromium
// Rust-код скачает браузер НАПРЯМУЮ, без npx/playwright CLI!
// ============================================================
console.log('\n📦 Шаг 4: Генерация chromium-info.json...');

const browsersJsonPath = path.join(modulesDir, 'playwright-core', 'browsers.json');
const chromiumInfoPath = path.join(PLAYWRIGHT_DIR, 'chromium-info.json');

if (fs.existsSync(browsersJsonPath)) {
  try {
    const browsersData = JSON.parse(fs.readFileSync(browsersJsonPath, 'utf8'));
    const chromium = browsersData.browsers.find(b => b.name === 'chromium');
    const headlessShell = browsersData.browsers.find(b => b.name === 'chromium-headless-shell');
    
    if (chromium) {
      const revision = chromium.revision;
      const browserVersion = chromium.browserVersion;
      
      // Собираем все нужные компоненты для загрузки
      const components = [
        {
          name: 'chromium',
          revision,
          browserVersion,
          dirName: `chromium-${revision}`,
          downloadUrls: [
            `https://cdn.playwright.dev/builds/cft/${browserVersion}/win64/chrome-win64.zip`,
            `https://playwright.download.prss.microsoft.com/dbazure/download/playwright/builds/cft/${browserVersion}/win64/chrome-win64.zip`,
            `https://storage.googleapis.com/chrome-for-testing-public/${browserVersion}/win64/chrome-win64.zip`
          ],
          executableCheck: ['chrome-win64', 'chrome.exe']
        }
      ];
      
      // Headless shell тоже нужен — Playwright требует его для работы!
      if (headlessShell) {
        const hsVersion = headlessShell.browserVersion;
        const hsRevision = headlessShell.revision;
        components.push({
          name: 'chromium-headless-shell',
          revision: hsRevision,
          browserVersion: hsVersion,
          dirName: `chromium_headless_shell-${hsRevision}`,
          downloadUrls: [
            `https://cdn.playwright.dev/builds/cft/${hsVersion}/win64/chrome-headless-shell-win64.zip`,
            `https://playwright.download.prss.microsoft.com/dbazure/download/playwright/builds/cft/${hsVersion}/win64/chrome-headless-shell-win64.zip`,
            `https://storage.googleapis.com/chrome-for-testing-public/${hsVersion}/win64/chrome-headless-shell-win64.zip`
          ],
          executableCheck: ['chrome-headless-shell-win64', 'chrome-headless-shell.exe']
        });
      }
      
      const chromiumInfo = {
        revision,
        browserVersion,
        components
      };
      
      fs.writeFileSync(chromiumInfoPath, JSON.stringify(chromiumInfo, null, 2));
      console.log(`   ✅ chromium-info.json: revision=${revision}, version=${browserVersion}, components=${components.length}`);
    } else {
      console.error('   ❌ Chromium не найден в browsers.json');
      process.exit(1);
    }
  } catch (err) {
    console.error('   ❌ Ошибка чтения browsers.json:', err.message);
    process.exit(1);
  }
} else {
  console.error('   ❌ browsers.json не найден:', browsersJsonPath);
  process.exit(1);
}

// ============================================================
// Шаг 5: Копируем скрипты
// ============================================================
console.log('\n📦 Шаг 5: Скрипты...');

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
// Шаг 6: Проверка и итоги
// ============================================================

// Проверяем критичные файлы
const criticalFiles = [
  path.join(NODE_DIR, 'node.exe'),
  path.join(PLAYWRIGHT_DIR, 'chromium-info.json'),
  path.join(PLAYWRIGHT_DIR, 'modules', 'playwright-core', 'cli.js'),
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
const pwMB = (getDirSize(PLAYWRIGHT_DIR) / (1024 * 1024)).toFixed(1);
const scriptsMB = (getDirSize(SCRIPTS_DIR) / (1024 * 1024)).toFixed(2);

console.log('\n📊 Размеры ресурсов:');
console.log(`   node.exe:   ${nodeMB} MB`);
console.log(`   Playwright: ${pwMB} MB`);
console.log(`   Scripts:    ${scriptsMB} MB`);
console.log(`   ИТОГО:      ${(parseFloat(nodeMB) + parseFloat(pwMB) + parseFloat(scriptsMB)).toFixed(1)} MB`);
console.log('\n✅ Ресурсы готовы для Tauri сборки!');
