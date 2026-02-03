#!/usr/bin/env node
// Puppeteer-based antidetect browser launcher with FULL proxy auth support
const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');
const { SocksClient } = require('socks');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Применяем stealth плагин
puppeteer.use(StealthPlugin());

async function main() {
  try {
    // Получаем аргументы
    const args = process.argv.slice(2);
    const payloadArg = args.find((arg) => arg.startsWith('--payload='));

    if (!payloadArg) {
      console.error('[PUPPETEER] ❌ Ошибка: отсутствует --payload');
      return;
    }

    const payloadJson = payloadArg.replace('--payload=', '');
    const payload = JSON.parse(Buffer.from(payloadJson, 'base64').toString('utf8'));

    console.log('[PUPPETEER] Загружен Puppeteer с полным антидетектом');
    console.log('[PUPPETEER] Профиль:', payload.profileName);
    
    // DEBUG: показываем credentials
    console.log('[PUPPETEER] === ПОЛНЫЙ PAYLOAD DEBUG ===');
    console.log('[PUPPETEER] Payload:', JSON.stringify(payload, null, 2));
    
    if (payload.proxy) {
      console.log('[PUPPETEER] === PROXY DEBUG ===');
      console.log('[PUPPETEER] Server:', payload.proxy.server);
      console.log('[PUPPETEER] Username:', payload.proxy.username || 'НЕТ');
      console.log('[PUPPETEER] Username type:', typeof payload.proxy.username);
      console.log('[PUPPETEER] Password:', payload.proxy.password ? '***' + payload.proxy.password.length + ' символов' : 'НЕТ');
      console.log('[PUPPETEER] Password type:', typeof payload.proxy.password);
    } else {
      console.log('[PUPPETEER] ❌ payload.proxy отсутствует!');
    }

    // Путь к Chromium
    const bundledChromiumPath = path.resolve(__dirname, '../../playwright-cache/chromium-1194/chrome-win64/chrome.exe');
    
    let chromiumPath = bundledChromiumPath;
    if (fs.existsSync(bundledChromiumPath)) {
      console.log('[PUPPETEER] ✅ Chromium найден:', bundledChromiumPath);
    } else {
      console.log('[PUPPETEER] ⚠️ Bundled Chromium не найден, используется системный');
      chromiumPath = null;
    }

    const url = payload.url || 'https://www.google.com';
    const userDataDir = payload.userDataDir || path.join(__dirname, `../src-tauri/${payload.profileName}`);

    // Базовые аргументы Chrome
    const chromeArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      `--user-data-dir=${userDataDir}`,
      '--lang=ru-RU,ru',
    ];

    // === ПРОКСИ С АВТОРИЗАЦИЕЙ ЧЕРЕЗ ЛОКАЛЬНЫЙ ТУННЕЛЬ ===
    let localProxyServer = null;
    
    if (payload.proxy && payload.proxy.server) {
      const { server, username, password } = payload.proxy;
      
      console.log('[PUPPETEER] 🔧 Настройка прокси:', server);
      
      const isSocks = server.toLowerCase().includes('socks');
      
      if (username && password) {
        console.log('[PUPPETEER] 🚇 Создание локального туннеля для авторизации...');
        
        // Создаем локальный HTTP прокси БЕЗ авторизации
        // который внутри подключается к реальному прокси С авторизацией
        const localPort = await createLocalProxyTunnel(server, username, password, isSocks);
        
        chromeArgs.push(`--proxy-server=http://127.0.0.1:${localPort}`);
        console.log('[PUPPETEER] ✅ Локальный туннель запущен на порту:', localPort);
        
        localProxyServer = global.localProxyServer;
      } else {
        // Прокси без авторизации - используем напрямую
        let proxyUrl = server;
        if (isSocks) {
          proxyUrl = proxyUrl.includes('://') ? proxyUrl : 'socks5://' + proxyUrl;
        } else {
          proxyUrl = proxyUrl.includes('://') ? proxyUrl : 'http://' + proxyUrl;
        }
        chromeArgs.push(`--proxy-server=${proxyUrl}`);
        console.log('[PUPPETEER] ✅ Прокси без авторизации:', proxyUrl);
      }
    }

    // Запуск браузера
    console.log('[PUPPETEER] 🚀 Запуск браузера...');
    const browser = await puppeteer.launch({
      headless: false,
      executablePath: chromiumPath,
      args: chromeArgs,
      ignoreDefaultArgs: ['--enable-automation', '--enable-blink-features=AutomationControlled'],
      defaultViewport: null,
    });
    console.log('[PUPPETEER] ✅ Браузер запущен');

    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();

    // Дополнительный антидетект
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.navigator.chrome = { runtime: {} };
      
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(parameters)
      );
    });

    console.log('[PUPPETEER] 📄 Переход на:', url);
    
    try {
      await page.goto(url, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      console.log('[PUPPETEER] ✅ Страница загружена');
    } catch (error) {
      if (error.message.includes('timeout') || error.message.includes('ERR_')) {
        console.warn('[PUPPETEER] ⚠️ Ошибка загрузки:', error.message);
        console.warn('[PUPPETEER] Браузер остается открытым');
      } else {
        throw error;
      }
    }
    
    console.log('[PUPPETEER] ✅ Браузер работает');
    
    // Ждем закрытия браузера
    await browser.waitForTarget(() => false, { timeout: 0 }).catch(() => {});
    
    // Закрываем локальный прокси
    if (localProxyServer) {
      localProxyServer.close();
      console.log('[PUPPETEER] 🛑 Локальный туннель остановлен');
    }
    
  } catch (err) {
    console.error('[PUPPETEER] ❌ Критическая ошибка:', err.message);
    console.error('[PUPPETEER] Stack:', err.stack);
  }
}

// === СОЗДАНИЕ ЛОКАЛЬНОГО HTTP ПРОКСИ-ТУННЕЛЯ ===
async function createLocalProxyTunnel(proxyServer, username, password, isSocks) {
  return new Promise((resolve, reject) => {
    // Парсим адрес прокси
    let proxyHost, proxyPort;
    const cleanServer = proxyServer.replace(/^(socks5?|https?):\/\//, '').replace(/^[^@]+@/, '');
    [proxyHost, proxyPort] = cleanServer.split(':');
    proxyPort = parseInt(proxyPort) || (isSocks ? 1080 : 8080);
    
    console.log('[TUNNEL] ========== DEBUG ==========');
    console.log('[TUNNEL] Тип прокси:', isSocks ? 'SOCKS5' : 'HTTP');
    console.log('[TUNNEL] Исходный server:', proxyServer);
    console.log('[TUNNEL] Распарсенный host:', proxyHost);
    console.log('[TUNNEL] Распарсенный port:', proxyPort);
    console.log('[TUNNEL] Username:', username);
    console.log('[TUNNEL] Username длина:', username.length);
    console.log('[TUNNEL] Password длина:', password.length);
    console.log('[TUNNEL] Password первый символ:', password.charAt(0));
    console.log('[TUNNEL] Password последний символ:', password.charAt(password.length - 1));
    console.log('[TUNNEL] ==================================');
    
    const server = http.createServer();
    
    // Обработка CONNECT для HTTPS
    server.on('connect', async (req, clientSocket, head) => {
      const [targetHost, targetPort] = req.url.split(':');
      
      try {
        let upstreamSocket;
        
        if (isSocks) {
          // SOCKS5 подключение с авторизацией
          console.log('[TUNNEL] SOCKS5 CONNECT:', req.url);
          console.log('[TUNNEL] SOCKS5 Host:', proxyHost);
          console.log('[TUNNEL] SOCKS5 Port:', proxyPort);
          console.log('[TUNNEL] SOCKS5 Username length:', username.length);
          console.log('[TUNNEL] SOCKS5 Password length:', password.length);
          
          const socksOptions = {
            proxy: {
              host: proxyHost,
              port: proxyPort,
              type: 5,
              userId: username,
              password: password
            },
            command: 'connect',
            destination: {
              host: targetHost,
              port: parseInt(targetPort)
            }
          };
          
          const info = await SocksClient.createConnection(socksOptions);
          upstreamSocket = info.socket;
          console.log('[TUNNEL] ✅ SOCKS5 туннель установлен');
        } else {
          // HTTP CONNECT с авторизацией
          console.log('[TUNNEL] HTTP CONNECT:', req.url);
          
          upstreamSocket = await new Promise((res, rej) => {
            const socket = net.connect(proxyPort, proxyHost, () => {
              const auth = Buffer.from(`${username}:${password}`).toString('base64');
              const connectRequest = 
                `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n` +
                `Host: ${targetHost}:${targetPort}\r\n` +
                `Proxy-Authorization: Basic ${auth}\r\n` +
                `Proxy-Connection: Keep-Alive\r\n` +
                `\r\n`;
              
              console.log('[TUNNEL] Отправка CONNECT с авторизацией');
              socket.write(connectRequest);
              
              // Читаем ответ
              let buffer = '';
              const onData = (data) => {
                buffer += data.toString();
                if (buffer.includes('\r\n\r\n')) {
                  socket.removeListener('data', onData);
                  socket.removeListener('error', rej);
                  
                  const statusLine = buffer.split('\r\n')[0];
                  console.log('[TUNNEL] Ответ прокси:', statusLine);
                  
                  if (buffer.includes(' 200 ')) {
                    console.log('[TUNNEL] ✅ HTTP туннель установлен');
                    res(socket);
                  } else {
                    socket.destroy();
                    rej(new Error(`Proxy returned: ${statusLine}`));
                  }
                }
              };
              
              socket.on('data', onData);
              socket.once('error', rej);
            });
            
            socket.once('error', (err) => {
              console.error('[TUNNEL] Socket error:', err.message);
              rej(err);
            });
          });
        }
        
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        upstreamSocket.pipe(clientSocket);
        clientSocket.pipe(upstreamSocket);
        
        upstreamSocket.on('error', (err) => console.error('[TUNNEL] Upstream error:', err.message));
        clientSocket.on('error', (err) => console.error('[TUNNEL] Client error:', err.message));
        
      } catch (error) {
        console.error('[TUNNEL] ❌ Ошибка подключения:', error.message);
        clientSocket.end('HTTP/1.1 500 Connection Failed\r\n\r\n');
      }
    });
    
    // Обработка обычных HTTP запросов
    server.on('request', (req, res) => {
      console.log('[TUNNEL] HTTP запрос:', req.method, req.url);
      
      const options = {
        host: proxyHost,
        port: proxyPort,
        path: req.url,
        method: req.method,
        headers: {
          ...req.headers,
          'Proxy-Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
        }
      };
      
      const proxyReq = http.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      });
      
      proxyReq.on('error', (err) => {
        console.error('[TUNNEL] ❌ HTTP ошибка:', err.message);
        res.writeHead(500);
        res.end();
      });
      
      req.pipe(proxyReq);
    });
    
    // Слушаем на случайном порту
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      console.log('[TUNNEL] ✅ Локальный прокси слушает на порту:', port);
      global.localProxyServer = server;
      resolve(port);
    });
    
    server.on('error', (err) => {
      console.error('[TUNNEL] ❌ Server error:', err.message);
      reject(err);
    });
  });
}

main();
