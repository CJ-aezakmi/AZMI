// Система автообновлений через GitHub Releases API
import { invoke } from '@tauri-apps/api/core';

const GITHUB_REPO = 'CJ-aezakmi/AZMI';
const CURRENT_VERSION = '3.0.7';

export interface UpdateInfo {
  available: boolean;
  version: string;
  downloadUrl: string;
  releaseNotes: string;
  publishedAt: string;
}

export interface PlaywrightUpdateInfo {
  needsUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
}

/**
 * Проверяет наличие обновлений на GitHub
 */
export async function checkForUpdates(): Promise<UpdateInfo | null> {
  try {
    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { 'Accept': 'application/vnd.github.v3+json' },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      console.error('Failed to check for updates:', response.statusText);
      return null;
    }

    const release = await response.json();
    const latestVersion = release.tag_name.replace(/^v/, '');
    const isNewer = compareVersions(latestVersion, CURRENT_VERSION) > 0;

    if (!isNewer) {
      return { available: false, version: CURRENT_VERSION, downloadUrl: '', releaseNotes: '', publishedAt: '' };
    }

    const windowsAsset = release.assets.find((asset: any) =>
      asset.name.endsWith('.exe') && !asset.name.toLowerCase().includes('launcher')
    );

    if (!windowsAsset) {
      console.error('No Windows installer found in release');
      return null;
    }

    return {
      available: true,
      version: latestVersion,
      downloadUrl: windowsAsset.browser_download_url,
      releaseNotes: release.body || 'Новая версия доступна',
      publishedAt: release.published_at
    };
  } catch (error) {
    console.error('Error checking for updates:', error);
    return null;
  }
}

/**
 * Проверяет актуальность Playwright
 */
export async function checkPlaywrightUpdate(): Promise<PlaywrightUpdateInfo> {
  try {
    // Получаем текущую версию через Tauri
    const currentVersion = await invoke<string>('get_playwright_version').catch(() => '0.0.0');
    
    // Проверяем последнюю версию на npm
    const response = await fetch('https://registry.npmjs.org/playwright/latest', {
      signal: AbortSignal.timeout(8000)
    });
    
    if (!response.ok) {
      return { needsUpdate: false, currentVersion, latestVersion: currentVersion };
    }

    const data = await response.json();
    const latestVersion = data.version || currentVersion;

    const needsUpdate = compareVersions(latestVersion, currentVersion) > 0;

    return { needsUpdate, currentVersion, latestVersion };
  } catch (error) {
    console.error('Error checking Playwright version:', error);
    return { needsUpdate: false, currentVersion: 'unknown', latestVersion: 'unknown' };
  }
}

/**
 * Обновляет Playwright до последней версии
 */
export async function updatePlaywright(onProgress?: (message: string) => void): Promise<boolean> {
  try {
    onProgress?.('Обновление Playwright...');
    await invoke('update_playwright_runtime');
    onProgress?.('Playwright обновлён!');
    return true;
  } catch (error) {
    console.error('Error updating Playwright:', error);
    return false;
  }
}

/**
 * Сравнивает две версии (format: "2.0.1")
 * @returns 1 если v1 > v2, -1 если v1 < v2, 0 если равны
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;

    if (part1 > part2) return 1;
    if (part1 < part2) return -1;
  }

  return 0;
}

/**
 * Скачивает обновление и возвращает путь к файлу
 * Прогресс передаётся через Tauri event 'update-progress'
 */
export async function downloadUpdate(url: string, _onProgress?: (percent: number) => void): Promise<string> {
  try {
    const filePath = await invoke<string>('download_update', { url });
    return filePath;
  } catch (error) {
    console.error('Error downloading update:', error);
    throw error;
  }
}

/**
 * Устанавливает обновление и перезапускает приложение
 */
export async function installUpdate(installerPath: string): Promise<void> {
  try {
    await invoke('install_update', { installerPath });
    // После этого приложение должно закрыться и запуститься установщик
  } catch (error) {
    console.error('Error installing update:', error);
    throw error;
  }
}

/**
 * Получает последнее время проверки обновлений
 */
export function getLastUpdateCheck(): Date | null {
  const saved = localStorage.getItem('last_update_check');
  return saved ? new Date(saved) : null;
}

/**
 * Сохраняет время последней проверки обновлений
 */
export function setLastUpdateCheck(): void {
  localStorage.setItem('last_update_check', new Date().toISOString());
}

/**
 * Проверяет, нужно ли автоматически проверить обновления (раз в 24 часа)
 */
export function shouldAutoCheck(): boolean {
  const last = getLastUpdateCheck();
  if (!last) return true;

  const now = new Date();
  const hoursSince = (now.getTime() - last.getTime()) / (1000 * 60 * 60);

  return hoursSince >= 24;
}

/**
 * Получить настройку автообновления
 */
export function isAutoUpdateEnabled(): boolean {
  const saved = localStorage.getItem('auto_update_enabled');
  return saved !== 'false'; // По умолчанию включено
}

/**
 * Установить настройку автообновления
 */
export function setAutoUpdateEnabled(enabled: boolean): void {
  localStorage.setItem('auto_update_enabled', enabled ? 'true' : 'false');
}

export function getCurrentVersion(): string {
  return CURRENT_VERSION;
}
