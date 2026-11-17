import { useEffect, useState } from 'preact/hooks';
import type { Account, ThemePreference } from '../lib/domain/types';
import { createPlainBackup, decryptBackup, encryptBackup, parsePlainBackup, type BackupSnapshot } from '../lib/backup';
import { THEME_STORAGE_KEY, applyTheme, getThemePreference } from '../lib/theme';
import {
  clearLocalData, loadAccounts, loadAppSettings, loadSnapshot, restoreSnapshot, saveThemePreference,
} from './dataClient';
import DeskSettings from './DeskSettings';
import { Card, Notice } from './ui';

const download = (text: string, name: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
};

export default function SettingsApp() {
  // The static HTML ships these controls fully formed, but their handlers only
  // exist once this island hydrates. Without this gate a click landing in that
  // window changes the radio visually and does nothing else.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [preference, setPreference] = useState<ThemePreference>(() => getThemePreference());
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [restore, setRestore] = useState<{ snapshot: BackupSnapshot; name: string }>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([loadAccounts(), loadAppSettings()])
      .then(([savedAccounts, settings]) => {
        setAccounts(savedAccounts);
        setPreference(settings.theme);
        if (!localStorage.getItem(THEME_STORAGE_KEY)) applyTheme(settings.theme);
      })
      .catch(() => undefined);
  }, []);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'That operation failed.');
    } finally {
      setBusy(false);
    }
  };

  const updateTheme = async (next: ThemePreference) => {
    setPreference(next);
    applyTheme(next);
    await saveThemePreference(next);
    setMessage('Theme preference saved.');
  };

  const exportData = (encrypted: boolean) => run(async () => {
    const snapshot = await loadSnapshot();
    const stamp = new Date().toISOString().slice(0, 10);
    if (encrypted) {
      if (!password) throw new Error('Enter a password for the encrypted backup.');
      download(await encryptBackup(snapshot, password), `feriktrading-${stamp}.ftj.enc.json`);
    } else {
      download(createPlainBackup(snapshot), `feriktrading-${stamp}.ftj.json`);
    }
    setMessage('Backup written. Keep the file somewhere safe.');
  });

  const inspect = (file?: File) => run(async () => {
    if (!file) return;
    const raw = await file.text();
    const snapshot = file.name.endsWith('.enc.json') ? await decryptBackup(raw, password) : parsePlainBackup(raw);
    setRestore({ snapshot, name: file.name });
  });

  const restoreData = (mode: 'merge' | 'replace') => run(async () => {
    if (!restore) return;
    await restoreSnapshot(restore.snapshot, mode);
    const settings = await loadAppSettings();
    setPreference(settings.theme);
    applyTheme(settings.theme);
    setRestore(undefined);
    setMessage(`Restore (${mode}) complete.`);
    setAccounts(await loadAccounts());
  });

  return (
    <div className="grid two-col">
      <div className="grid">
        <Card title="Appearance" description="System follows the device. The choice is saved in backups too.">
          <fieldset className="theme-options">
            <legend>Theme</legend>
            {([['system', 'System'], ['light', 'Light'], ['dark', 'Dark']] as const).map(([value, label]) => (
              <label className={`theme-option ${preference === value ? 'selected' : ''}`} key={value}>
                <input
                  type="radio"
                  name="theme"
                  value={value}
                  checked={preference === value}
                  disabled={!hydrated}
                  onChange={() => updateTheme(value)}
                />
                <span>
                  <strong>{label}</strong>
                  <small>
                    {value === 'system' ? 'Follow the device'
                      : value === 'light' ? 'Light background for daytime' : 'Dark background for focus sessions'}
                  </small>
                </span>
              </label>
            ))}
          </fieldset>
        </Card>

        <DeskSettings accounts={accounts} onChange={setAccounts} />

        <Card title="Export backup" description="Covers desks, broker history, journals, plans, sessions and settings.">
          <div className="field spaced">
            <label>Encryption password</label>
            <input
              aria-label="Encryption password"
              type="password"
              value={password}
              onInput={(event) => setPassword(event.currentTarget.value)}
              placeholder="Only needed for an encrypted backup"
            />
          </div>
          <div className="actions">
            <button className="btn" disabled={busy} onClick={() => exportData(false)}>Export plain</button>
            <button className="btn primary" disabled={busy || !password} onClick={() => exportData(true)}>Export encrypted</button>
          </div>
        </Card>
      </div>

      <div className="grid">
        <Card title="Restore backup" description="For an encrypted file, enter its password before choosing the file.">
          <label className="dropzone compact-dropzone">
            <input aria-label="Choose backup file" hidden type="file" accept=".json" onChange={(event) => inspect(event.currentTarget.files?.[0])} />
            <div>
              <div className="empty-icon">⇩</div>
              <strong>Choose a backup file</strong>
            </div>
          </label>
          {restore && (
            <div className="notice restore-preview">
              <strong>{restore.name}</strong>
              <br />
              {restore.snapshot.accounts.length} desks · {restore.snapshot.positions.length} positions
              {restore.snapshot.plans.length ? ` · ${restore.snapshot.plans.length} plans` : ''}
              <div className="actions">
                <button className="btn" onClick={() => restoreData('merge')}>Merge</button>
                <button className="btn danger" onClick={() => restoreData('replace')}>Replace everything</button>
              </div>
            </div>
          )}
        </Card>

        <Card title="Privacy & storage">
          <Notice>
            Every record lives in this browser's IndexedDB. There is no server and no telemetry. Clearing site data erases the journal permanently.
          </Notice>
          <button
            className="btn danger spaced-top"
            disabled={busy}
            onClick={() => {
              if (confirm('Delete all local data? This cannot be undone.')) {
                run(async () => {
                  await clearLocalData();
                  setAccounts([]);
                  setMessage('All local data has been deleted.');
                });
              }
            }}
          >
            Delete all local data
          </button>
        </Card>

        {(message || error) && <Notice tone={error ? 'error' : 'success'}>{error || message}</Notice>}
      </div>
    </div>
  );
}
