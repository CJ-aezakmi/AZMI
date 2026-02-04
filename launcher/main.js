const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const axios = require('axios');
const semver = require('semver');
const extract = require('extract-zip');

let mainWindow;
const APP_NAME = 'AEZAKMI';
const GITHUB_REPO = 'CJ-aezakmi/AZMI';
const INSTALL_DIR = path.join(process.env.LOCALAPPDATA, 'AEZAKMI', 'app');
const RUNTIME_DIR = path.join(process.env.LOCALAPPDATA, 'AEZAKMI', 'runtime');
const NODE_VERSION = 'v20.11.1';
const NODE_ZIP = `node-${NODE_VERSION}-win-x64.zip`;
const NODE_URL = `https://nodejs.org/dist/${NODE_VERSION}/${NODE_ZIP}`;
const NODE_DIR = path.join(RUNTIME_DIR, 'node');
const NODE_EXE = path.join(NODE_DIR, 'node.exe');
const NPM_CMD = path.join(NODE_DIR, 'npm.cmd');
const RUNTIME_NODE_MODULES = path.join(RUNTIME_DIR, 'node_modules');
const PLAYWRIGHT_BROWSERS_PATH = path.join(RUNTIME_DIR, 'ms-playwright');

const CANDIDATE_EXES = [
    path.join(INSTALL_DIR, 'AEZAKMI.exe'),
    path.join(INSTALL_DIR, 'app.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'AEZAKMI', 'AEZAKMI.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'AEZAKMI', 'app.exe'),
];

function findInstalledExe() {
    const currentExe = process.execPath;
    return CANDIDATE_EXES.find(p => {
        if (!fs.existsSync(p)) return false;
        const resolved = fs.realpathSync(p);
        const currentResolved = fs.realpathSync(currentExe);
        return resolved !== currentResolved;
    }) || null;
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 500,
        height: 400,
        resizable: false,
        frame: false,
        transparent: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        icon: path.join(__dirname, 'icon.ico')
    });

    mainWindow.loadFile('index.html');

    setTimeout(() => {
        startLaunchSequence();
    }, 1000);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

async function startLaunchSequence() {
    try {
        updateStatus('Проверка установки...', 10);

        const isInstalled = Boolean(findInstalledExe());

        if (!isInstalled) {
            updateStatus('AEZAKMI не установлен. Скачивание...', 20);
            await downloadAndInstallApp();
        } else {
            updateStatus('Проверка обновлений...', 30);
            const hasUpdate = await checkForUpdates();

            if (hasUpdate) {
                updateStatus('Доступно обновление! Скачивание...', 40);
                await downloadAndInstallApp();
            }
        }

        updateStatus('Проверка Playwright/Chromium...', 60);
        await checkAndInstallPlaywright();

        updateStatus('Проверка зависимостей...', 80);
        
        updateStatus('Запуск AEZAKMI...', 95);
        await launchApp();

        updateStatus('Готово!', 100);

        setTimeout(() => {
            app.quit();
        }, 1000);

    } catch (error) {
        updateStatus(`Ошибка: ${error.message}`, 0);
        console.error('[Launcher] Error:', error);
    }
}

function getGitHubHeaders() {
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
}

async function getLatestRelease() {
    const response = await axios.get(
        `https://api.github.com/repos/${GITHUB_REPO}/releases`,
        { timeout: 10000, headers: getGitHubHeaders() }
    );

    const releases = Array.isArray(response.data) ? response.data : [];
    const latest = releases.find(r => !r.draft && !r.prerelease);

    if (!latest) {
        throw new Error('Не найден опубликованный релиз');
    }

    return latest;
}

async function checkForUpdates() {
    try {
        const packagePath = path.join(INSTALL_DIR, 'resources', 'app', 'package.json');
        let currentVersion = '0.0.0';

        if (fs.existsSync(packagePath)) {
            const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
            currentVersion = pkg.version;
        }

        const latestRelease = await getLatestRelease();
        const latestVersion = String(latestRelease.tag_name || '').replace('v', '');

        console.log(`[Launcher] Current: ${currentVersion}, Latest: ${latestVersion}`);

        return semver.gt(latestVersion, currentVersion);
    } catch (error) {
        console.error('[Launcher] Check updates error:', error.message);
        return false;
    }
}

async function downloadAndInstallApp() {
    try {
        const release = await getLatestRelease();
        const asset = (release.assets || []).find(a => a.name.endsWith('.exe'));

        if (!asset) {
            throw new Error('Установщик не найден');
        }

        const installerPath = path.join(app.getPath('temp'), 'aezakmi-setup.exe');

        updateStatus('Скачивание установщика...', 30);

        const writer = fs.createWriteStream(installerPath);
        const downloadResponse = await axios({
            url: asset.browser_download_url,
            method: 'GET',
            responseType: 'stream'
        });

        downloadResponse.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        updateStatus('Установка...', 50);

        // Тихая установка NSIS
        await new Promise((resolve) => {
            exec(`"${installerPath}" /S`, (error) => {
                resolve();
            });
        });

        await new Promise(resolve => setTimeout(resolve, 5000));

        if (!findInstalledExe()) {
            throw new Error('Установка не завершилась');
        }

        try {
            fs.unlinkSync(installerPath);
        } catch (e) {}

    } catch (error) {
        console.error('[Launcher] Download/Install error:', error);
        throw new Error(`Не удалось установить: ${error.message}`);
    }
}

async function checkAndInstallPlaywright() {
    try {
        await ensureNodeRuntime();
        await ensurePlaywrightRuntime();
    } catch (error) {
        console.error('[Launcher] Playwright check error:', error);
        throw error;
    }
}

async function ensureNodeRuntime() {
    if (fs.existsSync(NODE_EXE)) return;

    updateStatus('Установка Node.js...', 62);
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });

    const zipPath = path.join(app.getPath('temp'), NODE_ZIP);

    const writer = fs.createWriteStream(zipPath);
    const response = await axios({ url: NODE_URL, method: 'GET', responseType: 'stream' });
    response.data.pipe(writer);
    await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });

    const extractDir = path.join(app.getPath('temp'), `node-${Date.now()}`);
    fs.mkdirSync(extractDir, { recursive: true });
    await extract(zipPath, { dir: extractDir });

    const extracted = path.join(extractDir, `node-${NODE_VERSION}-win-x64`);
    
    fs.mkdirSync(NODE_DIR, { recursive: true });
    if (fs.existsSync(extracted)) {
        const copyRecursive = (src, dest) => {
            if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
            const items = fs.readdirSync(src, { withFileTypes: true });
            for (const item of items) {
                const srcPath = path.join(src, item.name);
                const destPath = path.join(dest, item.name);
                if (item.isDirectory()) {
                    copyRecursive(srcPath, destPath);
                } else {
                    fs.copyFileSync(srcPath, destPath);
                }
            }
        };
        copyRecursive(extracted, NODE_DIR);
    }

    try { fs.unlinkSync(zipPath); } catch (_) { }
}

async function ensurePlaywrightRuntime() {
    updateStatus('Проверка Playwright...', 65);
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });

    const pkgPath = path.join(RUNTIME_DIR, 'package.json');
    if (!fs.existsSync(pkgPath)) {
        fs.writeFileSync(
            pkgPath,
            JSON.stringify({
                name: 'aezakmi-runtime',
                private: true,
                type: 'module'
            }, null, 2)
        );
    }

    const playwrightPath = path.join(RUNTIME_NODE_MODULES, 'playwright');
    let needsInstall = !fs.existsSync(playwrightPath);

    if (needsInstall) {
        updateStatus('Установка Playwright...', 66);

        await new Promise((resolve, reject) => {
            const cmd = `cmd /c "\"${NPM_CMD}\" install playwright@latest"`;
            exec(cmd, { cwd: RUNTIME_DIR }, (error) => {
                if (error) {
                    console.error('[Launcher] Playwright install error:', error);
                    reject(error);
                } else {
                    console.log('[Launcher] Playwright install completed');
                    resolve();
                }
            });
        });
    }

    let chromiumInstalled = false;
    if (fs.existsSync(PLAYWRIGHT_BROWSERS_PATH)) {
        const files = fs.readdirSync(PLAYWRIGHT_BROWSERS_PATH);
        chromiumInstalled = files.some(f => f.startsWith('chromium-'));
    }

    if (!chromiumInstalled) {
        updateStatus('Скачивание Chromium...', 70);
        await new Promise((resolve, reject) => {
            const cmd = `cmd /c "\"${NPM_CMD}\" exec -- playwright install chromium"`;
            const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH };
            exec(cmd, { cwd: RUNTIME_DIR, env }, (error) => {
                if (error) {
                    console.error('[Launcher] Chromium install error:', error);
                    reject(error);
                } else {
                    console.log('[Launcher] Chromium install completed');
                    resolve();
                }
            });
        });
    }

    await ensureAppNodeModules();
}

async function ensureAppNodeModules() {
    const exePath = findInstalledExe();
    if (!exePath) return;

    const appDir = path.dirname(exePath);
    const nodeModulesLink = path.join(appDir, 'node_modules');
    const packageJsonPath = path.join(appDir, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
        fs.writeFileSync(
            packageJsonPath,
            JSON.stringify({ name: 'playwright-launcher', type: 'module', private: true }, null, 2)
        );
    }

    if (fs.existsSync(nodeModulesLink)) {
        return;
    }

    try {
        fs.symlinkSync(RUNTIME_NODE_MODULES, nodeModulesLink, 'junction');
        console.log('[Launcher] node_modules link created');
    } catch (e) {
        console.error('[Launcher] Symlink error:', e);
    }
}

async function launchApp() {
    try {
        const exePath = findInstalledExe();
        if (!exePath) {
            throw new Error('Приложение не найдено после установки');
        }

        await new Promise((resolve, reject) => {
            const envPath = `${NODE_DIR};${process.env.PATH || ''}`;
            const cmd = `cmd /c "set PATH=${envPath}&& set NODE_PATH=${RUNTIME_NODE_MODULES}&& set PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH}&& start \"\" \"${exePath}\""`;
            exec(cmd, (error) => {
                if (error) {
                    return reject(error);
                }
                resolve();
            });
        });

        console.log('[Launcher] App launched successfully');

    } catch (error) {
        console.error('[Launcher] Launch error:', error);
        throw new Error(`Не удалось запустить: ${error.message}`);
    }
}

function updateStatus(message, progress) {
    if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('update-status', { message, progress });
    }
}

ipcMain.on('close-app', () => {
    app.quit();
});
