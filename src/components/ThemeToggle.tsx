import { useEffect, useState } from 'react';
import type { ThemePreference } from '../lib/domain/types';
import { applyTheme, getThemePreference, getSystemPrefersDark, resolveTheme, subscribeToThemeChange } from '../lib/theme';
import { loadAppSettings, saveThemePreference } from './dataClient';

export default function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>(() => getThemePreference());
  const resolved = resolveTheme(preference, getSystemPrefersDark());
  useEffect(() => {
    const stored = getThemePreference();
    applyTheme(stored, false);
    loadAppSettings().then((settings) => {
      if (!localStorage.getItem('ferik-journal-theme')) {
        setPreference(settings.theme); applyTheme(settings.theme);
      }
    }).catch(() => undefined);
    return subscribeToThemeChange(() => setPreference(getThemePreference()));
  }, []);
  async function toggleTheme() {
    const next: ThemePreference = resolved === 'dark' ? 'light' : 'dark';
    setPreference(next); applyTheme(next);
    await saveThemePreference(next).catch(() => undefined);
  }
  return <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={`Ganti ke mode ${resolved === 'dark' ? 'terang' : 'gelap'}`} title={`Mode ${resolved === 'dark' ? 'gelap' : 'terang'} aktif`}><span aria-hidden="true">{resolved === 'dark' ? '☀' : '◐'}</span></button>;
}
