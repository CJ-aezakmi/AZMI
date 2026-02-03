// Система лицензирования
import { invoke } from '@tauri-apps/api/core';

export interface LicenseInfo {
  key: string;
  activatedAt: string;
  expiresAt: string;
  isValid: boolean;
}

// Проверка лицензии
export async function checkLicense(): Promise<LicenseInfo | null> {
  const savedLicense = localStorage.getItem('aezakmi_license');
  
  if (!savedLicense) {
    return null;
  }
  
  try {
    const license: LicenseInfo = JSON.parse(savedLicense);
    const now = new Date().getTime();
    const expiresAt = new Date(license.expiresAt).getTime();
    
    if (now > expiresAt) {
      // Лицензия истекла
      localStorage.removeItem('aezakmi_license');
      return null;
    }
    
    return {
      ...license,
      isValid: true
    };
  } catch {
    return null;
  }
}

// Активация лицензии
export async function activateLicense(key: string): Promise<{ success: boolean; message: string; license?: LicenseInfo }> {
  try {
    // Проверяем ключ через Rust backend
    const result = await invoke('validate_license_key', { key }) as { valid: boolean; message: string; days: number };
    
    if (!result.valid) {
      return {
        success: false,
        message: result.message
      };
    }
    
    // Создаем запись о лицензии с правильным сроком из Rust
    const activatedAt = new Date();
    let expiresAt: Date;
    
    if (result.days === 0) {
      // Бессрочная лицензия - ставим дату через 100 лет
      expiresAt = new Date(activatedAt.getTime() + 100 * 365 * 24 * 60 * 60 * 1000);
    } else {
      // Обычная лицензия - ставим срок из result.days
      expiresAt = new Date(activatedAt.getTime() + result.days * 24 * 60 * 60 * 1000);
    }
    
    const license: LicenseInfo = {
      key,
      activatedAt: activatedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      isValid: true
    };
    
    localStorage.setItem('aezakmi_license', JSON.stringify(license));
    
    return {
      success: true,
      message: result.message,
      license
    };
  } catch (error: any) {
    return {
      success: false,
      message: error?.message || 'Ошибка активации лицензии'
    };
  }
}

// Получить оставшееся время лицензии
export function getRemainingTime(license: LicenseInfo): string {
  const now = new Date().getTime();
  const expiresAt = new Date(license.expiresAt).getTime();
  const diff = expiresAt - now;
  
  if (diff <= 0) {
    return 'Истекла';
  }
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (days > 0) {
    return `${days} дн. ${hours} ч.`;
  } else {
    return `${hours} ч.`;
  }
}
