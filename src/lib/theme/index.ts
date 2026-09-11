import type { ThemePreference } from '../domain/types';

export const THEME_STORAGE_KEY = 'ferik-journal-theme';
export const THEME_EVENT = 'ferik-theme-change';
export type ResolvedTheme = Exclude<ThemePreference, 'system'>;

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  return preference === 'system' ? (systemPrefersDark ? 'dark' : 'light') : preference;
}

export function getStoredThemePreference(): ThemePreference | null {
  if (typeof window === 'undefined') return null;
  const value = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isThemePreference(value) ? value : null;
}

export function getThemePreference(): ThemePreference {
  return getStoredThemePreference() ?? 'system';
}

export function getSystemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyTheme(preference: ThemePreference, persist = true): ResolvedTheme {
  const resolved = resolveTheme(preference, getSystemPrefersDark());
  if (typeof document === 'undefined') return resolved;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#0B0F14' : '#F6F8FA');
  if (persist) window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { preference, resolved } }));
  return resolved;
}

export function subscribeToThemeChange(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const refresh = () => {
    if (getThemePreference() === 'system') applyTheme('system', false);
    listener();
  };
  window.addEventListener(THEME_EVENT, listener);
  media.addEventListener('change', refresh);
  return () => { window.removeEventListener(THEME_EVENT, listener); media.removeEventListener('change', refresh); };
}
