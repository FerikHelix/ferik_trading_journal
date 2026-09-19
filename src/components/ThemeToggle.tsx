import { useEffect, useState } from 'preact/hooks';
import type { ThemePreference } from '../lib/domain/types';
import {
  THEME_STORAGE_KEY,
  applyTheme,
  getThemePreference,
  getSystemPrefersDark,
  resolveTheme,
  subscribeToThemeChange,
  type ResolvedTheme,
} from '../lib/theme';
import Icon from './ui/Icon';
import { loadAppSettings, saveThemePreference } from './dataClient';

export default function ThemeToggle() {
  /**
   * The resolved theme lives in state, set from an effect, rather than being
   * derived during render.
   *
   * Deriving it was wrong: `getSystemPrefersDark()` returns false during the
   * static build (no `window`), so the server always rendered the "light"
   * variant. On the client the preference is usually still 'system', so
   * `setPreference` bailed out, the component never re-rendered, and the
   * button kept announcing the wrong action — a real accessibility bug, not
   * just a cosmetic one. Setting state in an effect guarantees exactly one
   * corrective render after mount.
   */
  const [resolved, setResolved] = useState<ResolvedTheme>('dark');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => setResolved(resolveTheme(getThemePreference(), getSystemPrefersDark()));

    applyTheme(getThemePreference(), false);
    sync();
    setReady(true);

    loadAppSettings()
      .then((settings) => {
        // Only adopt the stored setting when this device has no explicit
        // choice yet, so a local preference always wins over a restored one.
        if (!localStorage.getItem(THEME_STORAGE_KEY)) {
          applyTheme(settings.theme);
          sync();
        }
      })
      .catch(() => undefined);

    return subscribeToThemeChange(sync);
  }, []);

  async function toggleTheme() {
    const next: ThemePreference = resolved === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setResolved(next);
    await saveThemePreference(next).catch(() => undefined);
  }

  // Until this island hydrates, the static HTML cannot know which theme the
  // visitor resolves to, and its click handler is not attached yet. Rendering
  // a disabled, theme-neutral button makes that honest: clicking during the
  // first moments of a page load used to do nothing at all, silently.
  if (!ready) {
    return (
      <button className="icon-btn theme-toggle" type="button" disabled aria-label="Menyiapkan tema">
        <Icon name="sun" />
      </button>
    );
  }

  // The aria-label wording is part of the e2e contract — keep it verbatim.
  return (
    <button
      className="icon-btn theme-toggle"
      type="button"
      onClick={toggleTheme}
      aria-label={`Ganti ke mode ${resolved === 'dark' ? 'terang' : 'gelap'}`}
      title={`Mode ${resolved === 'dark' ? 'gelap' : 'terang'} aktif`}
    >
      <Icon name={resolved === 'dark' ? 'sun' : 'moon'} />
    </button>
  );
}
