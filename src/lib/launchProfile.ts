// src/lib/launchProfile.ts — ФИНАЛЬНЫЙ, 100% РАБОЧИЙ
import { invoke } from '@tauri-apps/api/core';
import type { Profile } from '@/types';

export async function launchProfile(profile: Profile) {
  try {
    const profileDir = `/tmp/aezakmi-${Date.now()}`;

    let args = [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-infobars',
      '--disable-extensions',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      `--user-data-dir=${profileDir}`,
      '--start-maximized',
    ];

    if (profile.userAgent && profile.userAgent !== 'auto') {
      args.push(`--user-agent=${profile.userAgent}`);
    }

    if (profile.proxy?.enabled && profile.proxy.host && profile.proxy.port) {
      const login = encodeURIComponent(profile.proxy.login || '');
      const password = encodeURIComponent(profile.proxy.password || '');
      const proxyUrl = `http://${login}:${password}@${profile.proxy.host}:${profile.proxy.port}`;
      args.push(`--proxy-server=${proxyUrl}`);
    }

  // URL will be passed separately to the Playwright script (not as a Chromium arg)

  const chromiumPath = 'playwright';

  // Build payload for the Playwright script
  const payload = {
    profileDir,
    args,
    url: 'https://whoer.net',
    proxy: profile.proxy?.enabled && profile.proxy.host && profile.proxy.port
      ? {
          server: `${profile.proxy.type}://${profile.proxy.host}:${profile.proxy.port}`,
          // prefer explicit `username` field, fallback to legacy `login`
          username: profile.proxy.username || profile.proxy.login || undefined,
          password: profile.proxy.password || undefined,
        }
      : undefined,
  };

  // Call the Rust-side command `open_profile` to launch Playwright. Args is JSON string.
  await invoke('open_profile', { appPath: chromiumPath, args: JSON.stringify(payload) });
  } catch (err: any) {
    console.error('Ошибка:', err.message || err);
  }
}