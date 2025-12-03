import { ask } from '@tauri-apps/plugin-dialog';

export async function safeConfirm(message: string, options?: any): Promise<boolean> {
  try {
    const res = await ask(message, options);
    return Boolean(res);
  } catch (e) {
    // Fallback to browser confirm when Tauri dialog permission is not available
    // eslint-disable-next-line no-alert
    return window.confirm(message);
  }
}

export async function safePrompt(message: string, options?: any): Promise<string | null> {
  try {
    const res = await ask(message, options);
    return typeof res === 'string' ? res : null;
  } catch (e) {
    // Fallback to browser prompt
    // eslint-disable-next-line no-alert
    return window.prompt(message);
  }
}

export default { safeConfirm, safePrompt };
