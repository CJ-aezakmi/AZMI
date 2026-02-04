// src/lib/launchProfile.ts — УЛУЧШЕННАЯ ВЕРСИЯ С РАСШИРЕННЫМ АНТИДЕТЕКТОМ
import { invoke } from '@tauri-apps/api/core';
import type { Profile, LaunchConfig } from '@/types';

/**
 * Генерация User-Agent на основе ОС и типа браузера
 */
function generateUserAgent(profile: Profile): string {
  if (profile.userAgent && profile.userAgent !== 'auto') {
    return profile.userAgent;
  }

  const os = profile.os || 'windows';
  const browserEngine = profile.browserEngine || 'chromium';

  const userAgents = {
    windows: {
      chromium: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
      camoufox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
      webkit: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    macos: {
      chromium: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      firefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
      camoufox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
      webkit: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    },
    linux: {
      chromium: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      firefox: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
      camoufox: 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
      webkit: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  };

  const osKey = os.toLowerCase() as keyof typeof userAgents;
  const engineKey = browserEngine as keyof typeof userAgents.windows;

  return userAgents[osKey]?.[engineKey] || userAgents.windows.chromium;
}

/**
 * Запуск профиля с расширенным антидетектом
 */
export async function launchProfile(profile: Profile) {
  try {
    // Генерируем уникальную директорию профиля
    const timestamp = Date.now();
    const profileDir = `aezakmi-profile-${profile.id}-${timestamp}`;

    console.log('[LAUNCH] 🚀 Запуск профиля:', profile.name);
    console.log('[LAUNCH] 🔧 Движок браузера:', profile.browserEngine || 'chromium');

    // Генерируем или используем существующий User-Agent
    const userAgent = generateUserAgent(profile);
    console.log('[LAUNCH] 👤 User-Agent:', userAgent);

    // Формируем данные прокси
    let proxyData = undefined;
    if (profile.proxy?.enabled && profile.proxy.host && profile.proxy.port) {
      const proxyHost = profile.proxy.host.trim();
      const proxyPort = String(profile.proxy.port).trim();
      const proxyType = profile.proxy.type || 'http';

      const username = (profile.proxy.username || profile.proxy.login || '').trim();
      const password = (profile.proxy.password || '').trim();

      proxyData = {
        server: `${proxyType}://${proxyHost}:${proxyPort}`,
        username: username || undefined,
        password: password || undefined,
      };

      console.log('[LAUNCH] 🌐 Прокси:', {
        server: proxyData.server,
        hasAuth: !!(username && password),
        type: proxyType,
      });
      console.log('[LAUNCH] 🔐 Детали прокси:', {
        host: proxyHost,
        port: proxyPort,
        username: username ? `${username.substring(0, 10)}...` : 'нет',
        password: password ? '***' : 'нет',
        fullServer: proxyData.server,
      });
    } else {
      console.log('[LAUNCH] 🌐 Прокси: не используется');
    }

    // Формируем экран
    const screen = {
      width: profile.screenWidth || 1920,
      height: profile.screenHeight || 1080,
    };
    console.log('[LAUNCH] 🖥️  Разрешение:', `${screen.width}x${screen.height}`);

    // Формируем конфигурацию антидетекта
    const antidetectConfig = {
      canvas: {
        noise: profile.antidetect.canvasNoise,
        noiseLevel: profile.antidetect.canvas?.noiseLevel || 0.1,
      },
      webgl: {
        noise: profile.antidetect.webglNoise,
        vendor: profile.antidetect.webgl?.vendor || 'Intel Inc.',
        renderer: profile.antidetect.webgl?.renderer || 'Intel Iris OpenGL Engine',
      },
      audio: {
        noise: profile.antidetect.audioNoise,
        contextNoise: profile.antidetect.audio?.contextNoise || 0.001,
      },
      webrtc: {
        block: profile.antidetect.blockWebRTC,
        replacePublicIP: profile.antidetect.webrtc?.replacePublicIP ?? true,
        replaceLocalIP: profile.antidetect.webrtc?.replaceLocalIP ?? true,
      },
      fonts: profile.antidetect.fonts || {},
      // Дополнительные параметры
      hardwareConcurrency: profile.antidetect.hardwareConcurrency || 8,
      deviceMemory: profile.antidetect.deviceMemory || 8,
      hideAutomation: profile.antidetect.hideAutomation ?? true,
      spoofPlugins: profile.antidetect.spoofPlugins ?? true,
      spoofBattery: profile.antidetect.spoofBattery ?? true,
    };

    console.log('[LAUNCH] 🛡️  Антидетект:', {
      canvas: antidetectConfig.canvas.noise ? '✅' : '❌',
      webgl: antidetectConfig.webgl.noise ? '✅' : '❌',
      audio: antidetectConfig.audio.noise ? '✅' : '❌',
      webrtc: antidetectConfig.webrtc.block ? '🚫' : '✅',
    });

    // Формируем полную конфигурацию для лаунчера
    const launchConfig: LaunchConfig = {
      profileDir,
      browserType: profile.browserEngine || 'chromium',
      userAgent,
      screen,
      proxy: proxyData,
      url: 'https://whoer.net',
      antidetect: antidetectConfig,
      os: profile.os || 'windows',
    };

    // Конвертируем в JSON и base64 для передачи через Rust
    const payload = JSON.stringify(launchConfig);

    console.log('[LAUNCH] 📦 Payload размер:', payload.length, 'байт');
    console.log('[LAUNCH] 📦 Proxy в payload:', JSON.stringify(launchConfig.proxy));

    // Вызываем Rust команду для запуска браузера через новый лаунчер
    await invoke('open_profile', {
      appPath: 'advanced-antidetect', // Указываем использовать новый лаунчер
      args: payload,
    });

    console.log(`[LAUNCH] ✅ Профиль "${profile.name}" успешно запущен!`);

    return {
      success: true,
      profileDir,
      message: `Профиль "${profile.name}" запущен`,
    };

  } catch (err: any) {
    console.error('[LAUNCH] ❌ Ошибка запуска:', err.message || err);

    // Детальная обработка ошибок
    let errorMessage = 'Неизвестная ошибка';

    if (err.message?.includes('proxy')) {
      errorMessage = 'Ошибка подключения к прокси. Проверьте настройки прокси.';
    } else if (err.message?.includes('timeout')) {
      errorMessage = 'Превышено время ожидания запуска браузера.';
    } else if (err.message?.includes('executable')) {
      errorMessage = 'Браузер не найден. Переустановите компоненты.';
    } else {
      errorMessage = err.message || 'Не удалось запустить профиль';
    }

    throw new Error(errorMessage);
  }
}