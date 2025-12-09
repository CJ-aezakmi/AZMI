import { ask } from '@tauri-apps/plugin-dialog';

export async function safeConfirm(message: string, options?: any): Promise<boolean> {
  try {
    // Try Tauri dialog first
    const res = await ask(message, {
      title: options?.title || 'Подтверждение',
      kind: options?.kind || 'warning',
      okLabel: options?.okLabel || 'OK',
      cancelLabel: options?.cancelLabel || 'Отмена',
    });
    // ask() returns true if OK was clicked, false if Cancel
    return res === true;
  } catch (e) {
    console.log('Tauri dialog not available, using browser confirm:', e);
    // Fallback to browser confirm when Tauri dialog permission is not available
    // eslint-disable-next-line no-alert
    return Promise.resolve(window.confirm(message));
  }
}

export async function safePrompt(message: string, defaultValue?: string): Promise<string | null> {
  try {
    // For prompt we still use browser implementation as Tauri ask() is for confirmation
    // eslint-disable-next-line no-alert
    return Promise.resolve(window.prompt(message, defaultValue));
  } catch (e) {
    return null;
  }
}

export default { safeConfirm, safePrompt };
