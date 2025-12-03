// src/types/index.ts — ФИНАЛЬНЫЙ РАБОЧИЙ ВАРИАНТ
export interface Proxy {
  enabled: boolean;
  type: 'http' | 'socks5' | 'socks4';
  host: string;
  port: number;
  // legacy: some code uses `username` field; prefer `login` but keep both
  login?: string;
  username?: string;
  password?: string;
  // runtime status set by proxy tester
  status?: 'working' | 'failed' | 'unchecked';
}

export interface Profile {
  id: string;
  name: string;
  os: string;
  userAgent: string;
  language: string;
  windowWidth: number;
  windowHeight: number;
  // Optional more detailed screen dimensions (some UI expects these)
  screenWidth?: number;
  screenHeight?: number;
  // Optional freeform notes attached to profile
  notes?: string;
  proxy: Proxy | null;
  tags: string[];
  createdAt: string;
  updatedAt?: string;
  status: 'ready' | 'active' | 'inactive';
}