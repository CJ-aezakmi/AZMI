// Система автообновлений через GitHub Releases API
import { invoke } from '@tauri-apps/api/core';

const GITHUB_REPO = 'CJ-aezakmi/AZMI';
const CURRENT_VERSION = '2.0.0';

export interface UpdateInfo {
  available: boolean;
  version: string;
  downloadUrl: string;
  releaseNotes: string;
  publishedAt: string;
}

/**
 * Проверяет наличие обновлений на GitHub
 */
export async function checkForUpdates(): Promise<UpdateInfo | null> {
  try {
    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
    
    if (!response.ok) {
      console.error('Failed to check for updates:', response.statusText);
      return null;
    }
    
    const release = await response.json();
    const latestVersion = release.tag_name.replace(/^v/, ''); // Убираем 'v' из 'v2.0.1'
    
    // Сравниваем версии
    const isNewer = compareVersions(latestVersion, CURRENT_VERSION) > 0;
    
    if (!isNewer) {
      return {
        available: false,
        version: CURRENT_VERSION,
        downloadUrl: '',
        releaseNotes: '',
        publishedAt: ''
      };
    }
    
    // Ищем установщик для Windows (.msi или .exe)
    const windowsAsset = release.assets.find((asset: any) => 
      asset.name.endsWith('.msi') || asset.name.endsWith('.exe')
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
 */
export async function downloadUpdate(url: string, onProgress?: (percent: number) => void): Promise<string> {
  try {
    // Вызываем Rust backend для скачивания (с прогрессом)
    const filePath = await invoke<string>('download_update', { 
      url,
      onProgress: onProgress ? (percent: number) => onProgress(percent) : undefined 
    });
    
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
