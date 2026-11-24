// Camoufox: статус установки, проверка и скачивание обновлений.
// Сам браузер качает Rust (download_camoufox), здесь — обёртки и настройки.
import { invoke } from '@tauri-apps/api/core';

export interface CamoufoxStatus {
  installed: boolean;
  /** Версия Camoufox, например "159.0-beta.43"; null — установлен вручную, версия неизвестна */
  version: string | null;
  exePath: string | null;
  /** Установка старого образца (exe в корне папки) — будет заменена при обновлении */
  legacy: boolean;
}

export interface CamoufoxUpdateInfo {
  installedVersion: string | null;
  latestVersion: string;
  updateAvailable: boolean;
  sizeMb: number;
}

export function getCamoufoxStatus(): Promise<CamoufoxStatus> {
  return invoke<CamoufoxStatus>('get_camoufox_status');
}

export function checkCamoufoxUpdate(): Promise<CamoufoxUpdateInfo> {
  return invoke<CamoufoxUpdateInfo>('check_camoufox_update');
}

/** Скачивает указанную версию или последнюю с GitHub. Прогресс — событие `camoufox-progress`. */
export function downloadCamoufox(version?: string): Promise<string> {
  return invoke<string>('download_camoufox', { version: version ?? null });
}

// ─── Настройки автообновления ──────────────────────────────────────────

const AUTO_UPDATE_KEY = 'aezakmi_camoufox_auto_update';
const LAST_CHECK_KEY = 'camoufox_last_update_check';
/** Чаще дёргать GitHub API не стоит: без токена лимит 60 запросов в час на IP */
const CHECK_INTERVAL_HOURS = 6;

export function isCamoufoxAutoUpdateEnabled(): boolean {
  return localStorage.getItem(AUTO_UPDATE_KEY) !== 'false'; // по умолчанию включено
}

export function setCamoufoxAutoUpdateEnabled(enabled: boolean): void {
  localStorage.setItem(AUTO_UPDATE_KEY, enabled ? 'true' : 'false');
}

export function shouldCheckCamoufoxUpdate(): boolean {
  const saved = localStorage.getItem(LAST_CHECK_KEY);
  if (!saved) return true;
  const hours = (Date.now() - new Date(saved).getTime()) / (1000 * 60 * 60);
  return !(hours >= 0 && hours < CHECK_INTERVAL_HOURS);
}

export function markCamoufoxUpdateCheck(): void {
  localStorage.setItem(LAST_CHECK_KEY, new Date().toISOString());
}
