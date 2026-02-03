#!/usr/bin/env node
// Script to prepare all dependencies for bundling

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const BUNDLE_DIR = path.join(__dirname, '..', 'bundle');
const NODE_VERSION = '20.11.0';
const NODE_DIR = path.join(BUNDLE_DIR, 'node');
const PLAYWRIGHT_DIR = path.join(BUNDLE_DIR, 'playwright');

console.log('🚀 Подготовка автономного пакета...');

// Создаём директории
if (!fs.existsSync(BUNDLE_DIR)) {
  fs.mkdirSync(BUNDLE_DIR, { recursive: true });
}

if (!fs.existsSync(NODE_DIR)) {
  fs.mkdirSync(NODE_DIR, { recursive: true });
}

if (!fs.existsSync(PLAYWRIGHT_DIR)) {
  fs.mkdirSync(PLAYWRIGHT_DIR, { recursive: true });
}

// Шаг 1: Скачиваем portable Node.js
console.log('📦 Скачиваем portable Node.js...');
const nodeUrl = `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`;
const nodeZipPath = path.join(BUNDLE_DIR, 'node.zip');

if (!fs.existsSync(path.join(NODE_DIR, 'node.exe'))) {
  console.log('  Загрузка Node.js...');
  
  // Используем PowerShell для скачивания (встроенный в Windows)
  try {
    execSync(
      `powershell -Command "Invoke-WebRequest -Uri '${nodeUrl}' -OutFile '${nodeZipPath}'"`,
      { stdio: 'inherit' }
    );
    
    console.log('  Распаковка Node.js...');
    execSync(
      `powershell -Command "Expand-Archive -Path '${nodeZipPath}' -DestinationPath '${BUNDLE_DIR}' -Force"`,
      { stdio: 'inherit' }
    );
    
    // Перемещаем файлы
    const extractedDir = path.join(BUNDLE_DIR, `node-v${NODE_VERSION}-win-x64`);
    if (fs.existsSync(extractedDir)) {
      const files = fs.readdirSync(extractedDir);
      files.forEach(file => {
        const src = path.join(extractedDir, file);
        const dest = path.join(NODE_DIR, file);
        if (fs.existsSync(dest)) {
          if (fs.lstatSync(dest).isDirectory()) {
            fs.rmSync(dest, { recursive: true, force: true });
          } else {
            fs.unlinkSync(dest);
          }
        }
        fs.renameSync(src, dest);
      });
      fs.rmdirSync(extractedDir);
    }
    
    // Удаляем zip
    if (fs.existsSync(nodeZipPath)) {
      fs.unlinkSync(nodeZipPath);
    }
    
    console.log('  ✅ Node.js готов');
  } catch (error) {
    console.error('  ❌ Ошибка загрузки Node.js:', error.message);
    process.exit(1);
  }
} else {
  console.log('  ✅ Node.js уже есть');
}

// Шаг 2: Устанавливаем Playwright локально
console.log('📦 Устанавливаем Playwright...');

const playwrightPackageJson = {
  name: 'aezakmi-playwright-bundle',
  version: '1.0.0',
  private: true,
  dependencies: {
    playwright: '^1.40.0'
  }
};

fs.writeFileSync(
  path.join(PLAYWRIGHT_DIR, 'package.json'),
  JSON.stringify(playwrightPackageJson, null, 2)
);

try {
  // Устанавливаем Playwright используем загруженный Node.js
  const nodeExe = path.join(NODE_DIR, 'node.exe');
  const npmExe = path.join(NODE_DIR, 'npm.cmd');
  
  if (fs.existsSync(nodeExe) && fs.existsSync(npmExe)) {
    console.log('  Установка Playwright пакета...');
    execSync(`"${npmExe}" install`, {
      cwd: PLAYWRIGHT_DIR,
      stdio: 'inherit',
      env: { ...process.env, PATH: `${NODE_DIR};${process.env.PATH}` }
    });
    
    console.log('  Установка Chromium браузера...');
    const npxExe = path.join(NODE_DIR, 'npx.cmd');
    execSync(`"${npxExe}" playwright install chromium`, {
      cwd: PLAYWRIGHT_DIR,
      stdio: 'inherit',
      env: { ...process.env, PATH: `${NODE_DIR};${process.env.PATH}` }
    });
    
    console.log('  ✅ Playwright готов');
  } else {
    throw new Error('Node.js не найден');
  }
} catch (error) {
  console.error('  ❌ Ошибка установки Playwright:', error.message);
  process.exit(1);
}

// Шаг 3: Копируем скрипты
console.log('📦 Копируем скрипты...');
const scriptsDir = path.join(__dirname);
const bundleScriptsDir = path.join(BUNDLE_DIR, 'scripts');

if (!fs.existsSync(bundleScriptsDir)) {
  fs.mkdirSync(bundleScriptsDir, { recursive: true });
}

fs.copyFileSync(
  path.join(scriptsDir, 'launch_playwright.cjs'),
  path.join(bundleScriptsDir, 'launch_playwright.cjs')
);

console.log('  ✅ Скрипты скопированы');

// Шаг 4: Создаём манифест
console.log('📦 Создаём манифест...');
const manifest = {
  version: '2.0.0',
  nodeVersion: NODE_VERSION,
  playwrightVersion: require(path.join(PLAYWRIGHT_DIR, 'node_modules', 'playwright', 'package.json')).version,
  bundledAt: new Date().toISOString(),
  components: {
    node: 'node',
    playwright: 'playwright',
    scripts: 'scripts'
  }
};

fs.writeFileSync(
  path.join(BUNDLE_DIR, 'manifest.json'),
  JSON.stringify(manifest, null, 2)
);

console.log('  ✅ Манифест создан');

console.log('\n✅ Автономный пакет готов!');
console.log(`📂 Размер: ${getDirectorySize(BUNDLE_DIR)} MB`);
console.log(`📍 Путь: ${BUNDLE_DIR}`);

function getDirectorySize(dirPath) {
  let size = 0;
  const files = fs.readdirSync(dirPath);
  
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stats = fs.statSync(filePath);
    
    if (stats.isDirectory()) {
      size += getDirectorySize(filePath);
    } else {
      size += stats.size;
    }
  }
  
  return (size / (1024 * 1024)).toFixed(2);
}
