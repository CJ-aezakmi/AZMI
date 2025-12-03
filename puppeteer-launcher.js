// src/lib/puppeteer-launcher.js — 100% РАБОЧИЙ С ТВОИМ ПУТЁМ!
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
  try {
    const args = process.argv.slice(2);
    const proxy = args[0] || null;
    const ua = args[1] || null;
    const width = args[2] ? parseInt(args[2]) : 1920;
    const height = args[3] ? parseInt(args[3]) : 1080;

  // Puppeteer launcher started

    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-blink-features=AutomationControlled',
      '--start-maximized',
      '--disable-infobars',
      '--no-first-run',
      '--disable-extensions',
      '--disable-plugins',
      '--disable-default-apps',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-features=TranslateUI,ImprovedCookieControls',
      '--webrtc-ip-handling-policy=disable_non_proxied_udp',
    ];

    if (proxy) {
      launchArgs.push(`--proxy-server=${proxy}`);
    }

    const browser = await puppeteer.launch({
      headless: false,
      defaultViewport: { width, height },
      args: launchArgs,
      // ТВОЙ ТОЧНЫЙ ПУТЬ — 100% РАБОТАЕТ!
      executablePath: '/Users/nonnakomissarova/Library/Caches/ms-playwright/chromium-1194/chrome-mac/Chromium.app/Contents/MacOS/Chromium',
    });

    const page = (await browser.pages())[0];
    if (ua && ua !== 'auto') await page.setUserAgent(ua);
    await page.goto('https://whoer.net', { waitUntil: 'networkidle2' });

  // Window opened
  } catch (err) {
    console.error('ОШИБКА PUPPETEER:', err.message);
  }
})();