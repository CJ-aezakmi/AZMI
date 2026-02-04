// Система управления зависимостями и компонентами
import { invoke } from '@tauri-apps/api/core';
import { BaseDirectory, exists, mkdir } from '@tauri-apps/plugin-fs';
import { Command } from '@tauri-apps/plugin-shell';
import { join, appDataDir, resourceDir } from '@tauri-apps/api/path';

export interface DependencyStatus {
  name: string;
  installed: boolean;
  version?: string;
  required: boolean;
  error?: string;
}

export interface SystemStatus {
  allReady: boolean;
  dependencies: DependencyStatus[];
  playwrightBrowsers: {
    chromium: boolean;
    installed: boolean;
  };
  nodeJs: {
    installed: boolean;
    version?: string;
    portable: boolean;
  };
}

class DependencyManager {
  private appDataPath: string = '';
  private resourcePath: string = '';
  private nodePortablePath: string = '';
  private playwrightCachePath: string = '';

  async initialize() {
    this.appDataPath = await appDataDir();
    try {
      this.resourcePath = await resourceDir();
    } catch {
      this.resourcePath = this.appDataPath;
    }
    
    this.nodePortablePath = await join(this.appDataPath, 'node-portable');
    this.playwrightCachePath = await join(this.appDataPath, 'playwright-cache');
  }

  // Проверка всех системных зависимостей
  async checkSystemStatus(): Promise<SystemStatus> {
    await this.initialize();

    const dependencies: DependencyStatus[] = [];
    
    // Проверка Node.js
    const nodeStatus = await this.checkNodeJs();
    dependencies.push({
      name: 'Node.js',
      installed: nodeStatus.installed,
      version: nodeStatus.version,
      required: true,
    });

    // Проверка Playwright
    const playwrightStatus = await this.checkPlaywright();
    dependencies.push({
      name: 'Playwright',
      installed: playwrightStatus.installed,
      required: true,
    });

    // Проверка браузеров Playwright
    const browsersStatus = await this.checkPlaywrightBrowsers();
    dependencies.push({
      name: 'Chromium Browser',
      installed: browsersStatus.chromium,
      required: true,
    });

    const allReady = dependencies.every(dep => dep.installed || !dep.required);

    return {
      allReady,
      dependencies,
      playwrightBrowsers: browsersStatus,
      nodeJs: nodeStatus,
    };
  }

  // Проверка Node.js (портативная или системная)
  private async checkNodeJs(): Promise<{ installed: boolean; version?: string; portable: boolean }> {
    // Проверяем портативный Node.js
    try {
      const portableExists = await exists(await join(this.nodePortablePath, 'node.exe'));
      if (portableExists) {
        const version = await this.getNodeVersion(await join(this.nodePortablePath, 'node.exe'));
        return { installed: true, version, portable: true };
      }
    } catch (err) {
      console.warn('Portable Node.js not found:', err);
    }

    // Проверяем системный Node.js
    try {
      const command = Command.create('node', ['--version']);
      const output = await command.execute();
      if (output.code === 0 && output.stdout) {
        return { installed: true, version: output.stdout.trim(), portable: false };
      }
    } catch (err) {
      console.warn('System Node.js not found:', err);
    }

    return { installed: false, portable: false };
  }

  private async getNodeVersion(nodePath: string): Promise<string> {
    try {
      const command = Command.create(nodePath, ['--version']);
      const output = await command.execute();
      return output.stdout?.trim() || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  // Проверка Playwright
  private async checkPlaywright(): Promise<{ installed: boolean; version?: string }> {
    const nodeStatus = await this.checkNodeJs();
    if (!nodeStatus.installed) {
      return { installed: false };
    }

    try {
      const npxPath = nodeStatus.portable 
        ? await join(this.nodePortablePath, 'npx.cmd')
        : 'npx';
      
      const command = Command.create(npxPath, ['playwright', '--version']);
      const output = await command.execute();
      
      if (output.code === 0 && output.stdout) {
        return { installed: true, version: output.stdout.trim() };
      }
    } catch (err) {
      console.warn('Playwright check failed:', err);
    }

    return { installed: false };
  }

  // Проверка установленных браузеров Playwright
  private async checkPlaywrightBrowsers(): Promise<{ chromium: boolean; installed: boolean }> {
    try {
      // Проверяем наличие кэша браузеров
      const cacheExists = await exists(this.playwrightCachePath);
      if (!cacheExists) {
        return { chromium: false, installed: false };
      }

      // Ищем папку chromium
      const chromiumPath = await join(this.playwrightCachePath, 'chromium-*');
      const chromiumExists = await exists(chromiumPath).catch(() => false);

      return {
        chromium: chromiumExists,
        installed: chromiumExists,
      };
    } catch (err) {
      console.warn('Browser check failed:', err);
      return { chromium: false, installed: false };
    }
  }

  // Установка портативного Node.js
  async installPortableNodeJs(onProgress?: (message: string) => void): Promise<boolean> {
    try {
      onProgress?.('Распаковка портативного Node.js...');
      
      // Создаём директорию для портативного Node.js
      await mkdir(this.nodePortablePath, { recursive: true });

      // Копируем Node.js из resources (должен быть упакован в установщик)
      const nodeResourcePath = await join(this.resourcePath, 'node-portable');
      
      // Используем Tauri command для копирования
      await invoke('copy_directory', {
        src: nodeResourcePath,
        dst: this.nodePortablePath,
      });

      onProgress?.('Node.js успешно установлен');
      return true;
    } catch (err: any) {
      console.error('Failed to install portable Node.js:', err);
      onProgress?.(`Ошибка установки Node.js: ${err.message}`);
      return false;
    }
  }

  // Установка Playwright browsers
  async installPlaywrightBrowsers(onProgress?: (message: string) => void): Promise<boolean> {
    try {
      const nodeStatus = await this.checkNodeJs();
      if (!nodeStatus.installed) {
        throw new Error('Node.js не установлен');
      }

      onProgress?.('Установка браузеров Playwright...');

      // Проверяем, упакованы ли браузеры в resources
      const browsersResourcePath = await join(this.resourcePath, 'playwright-cache');
      const resourceBrowsersExist = await exists(browsersResourcePath);

      if (resourceBrowsersExist) {
        // Копируем предустановленные браузеры
        onProgress?.('Распаковка браузеров из установщика...');
        await mkdir(this.playwrightCachePath, { recursive: true });
        
        await invoke('copy_directory', {
          src: browsersResourcePath,
          dst: this.playwrightCachePath,
        });

        // Устанавливаем переменную окружения
        await this.setPlaywrightEnv();
        
        onProgress?.('Браузеры успешно установлены');
        return true;
      } else {
        // Скачиваем браузеры через Playwright
        onProgress?.('Загрузка браузеров Playwright (это может занять несколько минут)...');
        
        const npxPath = nodeStatus.portable 
          ? await join(this.nodePortablePath, 'npx.cmd')
          : 'npx';

        // Устанавливаем путь к кэшу
        await this.setPlaywrightEnv();

        const command = Command.create(npxPath, [
          'playwright',
          'install',
          'chromium',
          '--with-deps'
        ], {
          env: {
            'PLAYWRIGHT_BROWSERS_PATH': this.playwrightCachePath
          }
        });

        const output = await command.execute();
        
        if (output.code === 0) {
          onProgress?.('Браузеры успешно установлены');
          return true;
        } else {
          throw new Error(`Ошибка установки: ${output.stderr}`);
        }
      }
    } catch (err: any) {
      console.error('Failed to install Playwright browsers:', err);
      onProgress?.(`Ошибка установки браузеров: ${err.message}`);
      return false;
    }
  }

  private async setPlaywrightEnv() {
    // Сохраняем путь к кэшу в конфиг приложения
    try {
      const configPath = await join(this.appDataPath, 'config.json');
      const config = {
        PLAYWRIGHT_BROWSERS_PATH: this.playwrightCachePath,
      };
      
      await invoke('write_file', {
        path: configPath,
        contents: JSON.stringify(config, null, 2),
      });
    } catch (err) {
      console.error('Failed to save Playwright env:', err);
    }
  }

  // Проверка обновлений компонентов
  async checkComponentUpdates(): Promise<{
    playwrightNeedsUpdate: boolean;
    browsersNeedUpdate: boolean;
  }> {
    // Проверяем версию Playwright
    const playwrightStatus = await this.checkPlaywright();
    let playwrightNeedsUpdate = false;

    if (playwrightStatus.installed && playwrightStatus.version) {
      // Сравниваем с минимальной требуемой версией (например, 1.40.0)
      const currentVersion = playwrightStatus.version.replace('Version ', '').trim();
      const minVersion = '1.40.0';
      playwrightNeedsUpdate = this.compareVersions(currentVersion, minVersion) < 0;
    }

    // Проверяем браузеры
    const browsersStatus = await this.checkPlaywrightBrowsers();
    const browsersNeedUpdate = !browsersStatus.installed;

    return {
      playwrightNeedsUpdate,
      browsersNeedUpdate,
    };
  }

  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    return 0;
  }

  // Автоматическое исправление проблем
  async autoFix(onProgress?: (message: string) => void): Promise<boolean> {
    const status = await this.checkSystemStatus();
    
    if (status.allReady) {
      onProgress?.('Все компоненты установлены');
      return true;
    }

    let success = true;

    // Устанавливаем недостающие компоненты
    if (!status.nodeJs.installed) {
      onProgress?.('Установка Node.js...');
      success = await this.installPortableNodeJs(onProgress) && success;
    }

    if (!status.playwrightBrowsers.installed) {
      onProgress?.('Установка браузеров...');
      success = await this.installPlaywrightBrowsers(onProgress) && success;
    }

    return success;
  }
}

export const dependencyManager = new DependencyManager();
