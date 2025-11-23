const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');

// Простая функция генерации UUID
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Создаем директории для профилей
const PROFILES_DIR = path.join(app.getPath('userData'), 'AEZAKMI_Profiles');
const PROXIES_FILE = path.join(app.getPath('userData'), 'proxies.json');

console.log('AEZAKMI Antidetect Pro main process loaded');
console.log('Profiles directory:', PROFILES_DIR);
console.log('Proxies file:', PROXIES_FILE);

let mainWindow;
let profileWindows = new Map();

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        title: 'AEZAKMI Antidetect Pro v2.0',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: false
        }
    });

    mainWindow.loadFile('index.html');
    
    // Открываем DevTools в режиме разработки
    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }
}

app.whenReady().then(() => {
    // Создаем директорию для профилей
    try {
        if (!fs.existsSync(PROFILES_DIR)) {
            fs.mkdirSync(PROFILES_DIR, { recursive: true });
            console.log('Created profiles directory:', PROFILES_DIR);
        }
        
        // Создаем файл для прокси если не существует
        if (!fs.existsSync(PROXIES_FILE)) {
            fs.writeFileSync(PROXIES_FILE, JSON.stringify([], null, 2));
            console.log('Created proxies file:', PROXIES_FILE);
        }
    } catch (error) {
        console.error('Error creating directories:', error);
    }
    
    createWindow();
    console.log('AEZAKMI Antidetect Pro is ready!');
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// IPC Handlers для профилей
ipcMain.handle('get-profiles', async () => {
    try {
        console.log('Getting profiles from:', PROFILES_DIR);
        const profiles = [];
        
        if (!fs.existsSync(PROFILES_DIR)) {
            fs.mkdirSync(PROFILES_DIR, { recursive: true });
            console.log('Created profiles directory');
        }
        
        const folders = fs.readdirSync(PROFILES_DIR);
        console.log('Found folders:', folders);
        
        for (const folder of folders) {
            try {
                const configPath = path.join(PROFILES_DIR, folder, 'config.json');
                if (fs.existsSync(configPath)) {
                    const configData = fs.readFileSync(configPath, 'utf8');
                    const config = JSON.parse(configData);
                    profiles.push({ id: folder, ...config });
                    console.log('Loaded profile:', config.name);
                }
            } catch (error) {
                console.error('Error loading profile:', folder, error);
            }
        }
        
        console.log('Total profiles loaded:', profiles.length);
        return profiles;
    } catch (error) {
        console.error('Error getting profiles:', error);
        return [];
    }
});

ipcMain.handle('save-profile', async (event, profileData) => {
    try {
        console.log('Saving profile:', profileData);
        
        const profileId = profileData.id || generateUUID();
        const profileDir = path.join(PROFILES_DIR, profileId);
        
        // Создаем директорию профиля
        if (!fs.existsSync(profileDir)) {
            fs.mkdirSync(profileDir, { recursive: true });
            console.log('Created profile directory:', profileDir);
        }
        
        const profile = {
            ...profileData,
            id: profileId,
            createdAt: profileData.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        const configPath = path.join(profileDir, 'config.json');
        fs.writeFileSync(configPath, JSON.stringify(profile, null, 2));
        
        console.log(`Profile saved successfully: ${profile.name} (${profileId})`);
        console.log('Config saved to:', configPath);
        
        return profile;
    } catch (error) {
        console.error('Error saving profile:', error);
        throw new Error(`Ошибка сохранения профиля: ${error.message}`);
    }
});

ipcMain.handle('delete-profile', async (event, profileId) => {
    try {
        console.log('Deleting profile:', profileId);
        
        const profileDir = path.join(PROFILES_DIR, profileId);
        if (fs.existsSync(profileDir)) {
            fs.rmSync(profileDir, { recursive: true, force: true });
            console.log(`Profile deleted: ${profileId}`);
        }
        
        // Закрываем окно профиля если оно открыто
        if (profileWindows.has(profileId)) {
            const window = profileWindows.get(profileId);
            if (!window.isDestroyed()) {
                window.close();
            }
            profileWindows.delete(profileId);
        }
        
        return true;
    } catch (error) {
        console.error('Error deleting profile:', error);
        throw new Error(`Ошибка удаления профиля: ${error.message}`);
    }
});

ipcMain.handle('launch-profile', async (event, profileId) => {
    try {
        console.log('Launching profile:', profileId);
        
        const profileDir = path.join(PROFILES_DIR, profileId);
        const configPath = path.join(profileDir, 'config.json');
        
        if (!fs.existsSync(configPath)) {
            throw new Error('Профиль не найден');
        }
        
        const profile = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        console.log(`Launching profile: ${profile.name}`);
        
        // Закрываем предыдущее окно если оно открыто
        if (profileWindows.has(profileId)) {
            const existingWindow = profileWindows.get(profileId);
            if (!existingWindow.isDestroyed()) {
                existingWindow.close();
            }
        }
        
        // Создаем новое окно браузера
        const browserWindow = new BrowserWindow({
            width: parseInt(profile.screenWidth) || 1920,
            height: parseInt(profile.screenHeight) || 1080,
            title: `AEZAKMI Pro — ${profile.name}`,
            webPreferences: {
                partition: `persist:aezakmi_${profileId}`,
                contextIsolation: false,
                nodeIntegration: false,
                webSecurity: false,
                allowRunningInsecureContent: true
            }
        });
        
        profileWindows.set(profileId, browserWindow);
        
        // Настройка прокси если указан
        if (profile.proxy && profile.proxy.enabled && profile.proxy.host && profile.proxy.port) {
            try {
                const proxyUrl = `${profile.proxy.type || 'http'}://${profile.proxy.host}:${profile.proxy.port}`;
                console.log(`Setting proxy: ${proxyUrl}`);
                
                await browserWindow.webContents.session.setProxy({
                    proxyRules: proxyUrl,
                    proxyBypassRules: 'localhost,127.0.0.1'
                });
                
                console.log('Proxy set successfully');
            } catch (proxyError) {
                console.error('Error setting proxy:', proxyError);
            }
        }
        
        // Устанавливаем User Agent
        if (profile.userAgent && profile.userAgent !== 'auto') {
            browserWindow.webContents.setUserAgent(profile.userAgent);
            console.log('User Agent set:', profile.userAgent);
        }
        
        // Загружаем стартовую страницу
        const startUrl = profile.startUrl || 'https://whoer.net/ru';
        console.log(`Loading start URL: ${startUrl}`);
        
        try {
            await browserWindow.loadURL(startUrl);
            console.log('URL loaded successfully');
        } catch (loadError) {
            console.error(`Failed to load URL: ${startUrl}`, loadError);
            // Пробуем загрузить Google как fallback
            await browserWindow.loadURL('https://www.google.com');
        }
        
        // Применяем антидетект скрипты после загрузки страницы
        browserWindow.webContents.on('did-finish-load', () => {
            console.log(`Applying fingerprint spoofing for profile ${profileId}`);
            
            const spoofingScript = `
                (function() {
                    console.log('AEZAKMI antidetect spoofing started');
                    
                    // Canvas fingerprint spoofing
                    try {
                        const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
                        CanvasRenderingContext2D.prototype.getImageData = function() {
                            const imageData = originalGetImageData.apply(this, arguments);
                            const data = imageData.data;
                            for (let i = 0; i < data.length; i += 4) {
                                data[i] = Math.min(255, Math.max(0, data[i] + Math.floor(Math.random() * 5 - 2)));
                                data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + Math.floor(Math.random() * 5 - 2)));
                                data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + Math.floor(Math.random() * 5 - 2)));
                            }
                            return imageData;
                        };
                        console.log('Canvas spoofing applied');
                    } catch (e) { console.log('Canvas spoofing failed:', e); }
                    
                    // WebGL fingerprint spoofing
                    try {
                        const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
                        WebGLRenderingContext.prototype.getParameter = function(parameter) {
                            if (parameter === 37445) return 'Intel Inc.';
                            if (parameter === 37446) return 'Intel Iris OpenGL Engine';
                            return originalGetParameter.apply(this, arguments);
                        };
                        console.log('WebGL spoofing applied');
                    } catch (e) { console.log('WebGL spoofing failed:', e); }
                    
                    // Screen resolution spoofing
                    try {
                        Object.defineProperty(screen, 'width', { value: ${profile.screenWidth || 1920} });
                        Object.defineProperty(screen, 'height', { value: ${profile.screenHeight || 1080} });
                        Object.defineProperty(screen, 'availWidth', { value: ${profile.screenWidth || 1920} });
                        Object.defineProperty(screen, 'availHeight', { value: ${(profile.screenHeight || 1080) - 40} });
                        console.log('Screen resolution spoofing applied');
                    } catch (e) { console.log('Screen spoofing failed:', e); }
                    
                    // Language spoofing
                    try {
                        Object.defineProperty(navigator, 'language', { value: '${profile.language || 'ru-RU'}' });
                        Object.defineProperty(navigator, 'languages', { value: ['${profile.language || 'ru-RU'}', 'en-US', 'en'] });
                        console.log('Language spoofing applied');
                    } catch (e) { console.log('Language spoofing failed:', e); }
                    
                    console.log('AEZAKMI antidetect spoofing completed');
                })();
            `;
            
            browserWindow.webContents.executeJavaScript(spoofingScript).catch(error => {
                console.error('Error applying spoofing script:', error);
            });
        });
        
        // Обработка закрытия окна
        browserWindow.on('closed', () => {
            profileWindows.delete(profileId);
            console.log('Profile window closed:', profileId);
        });
        
        return { success: true, profileId, message: 'Профиль запущен успешно' };
        
    } catch (error) {
        console.error('Error launching profile:', error);
        throw new Error(`Ошибка запуска профиля: ${error.message}`);
    }
});

// IPC Handlers для прокси
ipcMain.handle('get-proxies', async () => {
    try {
        console.log('Getting proxies from:', PROXIES_FILE);
        
        if (!fs.existsSync(PROXIES_FILE)) {
            fs.writeFileSync(PROXIES_FILE, JSON.stringify([], null, 2));
            console.log('Created empty proxies file');
        }
        
        const data = fs.readFileSync(PROXIES_FILE, 'utf8');
        const proxies = JSON.parse(data);
        console.log('Loaded proxies:', proxies.length);
        
        return proxies;
    } catch (error) {
        console.error('Error getting proxies:', error);
        return [];
    }
});

ipcMain.handle('save-proxies', async (event, proxies) => {
    try {
        console.log('Saving proxies:', proxies.length);
        fs.writeFileSync(PROXIES_FILE, JSON.stringify(proxies, null, 2));
        console.log('Proxies saved successfully');
        return true;
    } catch (error) {
        console.error('Error saving proxies:', error);
        throw new Error(`Ошибка сохранения прокси: ${error.message}`);
    }
});

ipcMain.handle('test-proxy', async (event, proxy) => {
    try {
        console.log('Testing proxy:', proxy.host + ':' + proxy.port);
        
        // Создаем тестовое окно для проверки прокси
        const testWindow = new BrowserWindow({
            show: false,
            webPreferences: {
                partition: `proxy-test-${Date.now()}`,
                contextIsolation: false,
                nodeIntegration: false,
                webSecurity: false
            }
        });
        
        // Настраиваем прокси для тестового окна
        const proxyUrl = `${proxy.type}://${proxy.host}:${proxy.port}`;
        console.log('Setting test proxy:', proxyUrl);
        
        await testWindow.webContents.session.setProxy({
            proxyRules: proxyUrl,
            proxyBypassRules: ''
        });
        
        // Пробуем загрузить тестовую страницу
        const testPromise = new Promise((resolve) => {
            const timeout = setTimeout(() => {
                testWindow.destroy();
                resolve({ success: false, status: 'timeout', message: 'Превышено время ожидания' });
            }, 15000);
            
            testWindow.webContents.once('did-finish-load', () => {
                clearTimeout(timeout);
                testWindow.destroy();
                resolve({ success: true, status: 'working', message: 'Прокси работает' });
            });
            
            testWindow.webContents.once('did-fail-load', (event, errorCode, errorDescription) => {
                clearTimeout(timeout);
                testWindow.destroy();
                resolve({ success: false, status: 'failed', message: `Ошибка: ${errorDescription}` });
            });
        });
        
        // Загружаем тестовую страницу
        testWindow.loadURL('http://httpbin.org/ip').catch(() => {
            testWindow.destroy();
        });
        
        const result = await testPromise;
        console.log('Proxy test result:', result);
        return result;
        
    } catch (error) {
        console.error('Error testing proxy:', error);
        return { success: false, status: 'failed', message: `Ошибка тестирования: ${error.message}` };
    }
});

// Обработка ошибок
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
});