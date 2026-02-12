// src/lib/launchProfile.ts — УЛУЧШЕННАЯ ВЕРСИЯ С РАСШИРЕННЫМ АНТИДЕТЕКТОМ
import { invoke } from '@tauri-apps/api/core';
import type { Profile, LaunchConfig } from '@/types';
import { getTimezoneAndLanguageFromProxy } from './geoip';

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
    },
    macos: {
      chromium: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    linux: {
      chromium: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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

    // Генерируем или используем существующий User-Agent
    const userAgent = generateUserAgent(profile);

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
    }

    // Формируем экран
    const screen = {
      width: profile.screenWidth || 1920,
      height: profile.screenHeight || 1080,
    };

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

    // Формируем данные мобильной эмуляции
    const mobileEmulationData = profile.mobileEmulation?.enabled ? {
      enabled: true,
      deviceName: profile.mobileEmulation.deviceName,
      width: profile.mobileEmulation.width,
      height: profile.mobileEmulation.height,
      deviceScaleFactor: profile.mobileEmulation.deviceScaleFactor,
      isMobile: profile.mobileEmulation.isMobile ?? true,
      hasTouch: profile.mobileEmulation.hasTouch ?? true,
      userAgent: profile.mobileEmulation.userAgent,
    } : undefined;

    // Формируем полную конфигурацию для лаунчера
    const launchConfig: LaunchConfig = {
      profileDir,
      browserType: profile.browserEngine || 'chromium',
      userAgent,
      screen,
      proxy: proxyData,
      url: profile.homepage || 'https://www.google.com', // Домашняя страница или Google по умолчанию
      antidetect: antidetectConfig,
      os: profile.os || 'windows',
      mobileEmulation: mobileEmulationData,
      locale: profile.language || 'ru-RU', // Базовое значение, будет обновлено в launcher
      timezoneId: profile.timezone || 'Europe/Moscow', // Базовое значение, будет обновлено в launcher
      autoDetectLocale: !!proxyData, // Флаг для автоопределения по реальному IP
      cookies: profile.cookies, // Импортированные cookies
    };

    // Конвертируем в JSON и base64 для передачи через Rust
    const payload = JSON.stringify(launchConfig);

    // Вызываем Rust команду для запуска браузера через Playwright лаунчер
    await invoke('open_profile', {
      appPath: 'playwright', // Unified launcher: multi-engine + mobile fingerprints
      args: payload,
    });

    return {
      success: true,
      profileDir,
      message: `Профиль "${profile.name}" запущен`,
    };

  } catch (err: any) {
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