import { useEffect, useState } from 'preact/hooks';
import type { ImportPreview } from '../lib/domain/types';
import { Badge, Card, EmptyState, Icon, Notice } from './ui';
import { commitDetectedHistory, commitTradeHistory, previewTradeHistory } from './dataClient';

const base = import.meta.env.BASE_URL;

interface Result {
  desk: string;
  file: string;
  label: string;
  inserted: number;
  duplicates: number;
  failed: number;
  alreadyImported: boolean;
  detected: boolean;
}

/**
 * Import is one action: choose a file, and it lands on the desk the file names.
 * The review step is gone because the parser is what the user trusts, and it
 * reports afterwards what it did.
 */
export default function ImportWizard() {
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);  const [error, setError] = useState('');
  const [result, setResult] = useState<Result>();
  const [pending, setPending] = useState<{ parsed: ImportPreview; fileName: string }>();
  const [manual, setManual] = useState({ label: '', server: '', currency: 'USD', accountNumber: '' });

  async function handleFile(file?: File) {
    if (!file) return;
    setBusy(true);
    setError('');
    setResult(undefined);
    setPending(undefined);
    try {
      const parsed = await previewTradeHistory(file);
      if (!parsed.detectedAccount) {
        setPending({ parsed, fileName: file.name });
        return;
      }
      const committed = await commitDetectedHistory(parsed, file.name);
      setResult({
        desk: committed.account.label,
        file: file.name,
        label: parsed.sourceLabel,
        inserted: committed.inserted,
        duplicates: committed.duplicates,
        failed: committed.failed,
        alreadyImported: committed.alreadyImported,
        detected: true,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That file could not be imported.');
    } finally {
      setBusy(false);
    }
  }

  async function commitPending() {
    if (!pending) return;
    setBusy(true);
    setError('');
    try {
      const committed = await commitTradeHistory(pending.parsed, {
        kind: 'new',
        account: {
          ...manual,
          sourceTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          kind: 'personal',
        },
      }, pending.fileName);
      setResult({
        desk: committed.account.label,
        file: pending.fileName,
        label: pending.parsed.sourceLabel,
        inserted: committed.inserted,
        duplicates: committed.duplicates,
        failed: committed.failed,
        alreadyImported: committed.alreadyImported,
        detected: false,
      });
      setPending(undefined);
      setManual({ label: '', server: '', currency: 'USD', accountNumber: '' });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The import could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Import history"
      description="MT5 report (workbook or CSV) or Exness CSV. Processed locally, never uploaded."
      badge={result ? <Badge tone="profit">done</Badge> : undefined}
    >
      {/* The static HTML ships a file input with no listener; choosing a file in
          that window would do nothing at all. Do not remove this gate. */}
      <div className="import-surface" data-import-ready={hydrated ? 'true' : 'false'}>
      {error && <Notice tone="error">{error}</Notice>}

      <label className="dropzone">
        <input
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          onChange={(event) => {
            const input = event.currentTarget;
            handleFile(input.files?.[0]);
            input.value = '';
          }}
        />
        <div>
          <div className="empty-icon"><Icon name="upload" size={20} /></div>
          <h3>{busy ? 'Reading…' : 'Choose a session export'}</h3>
          <p className="muted">
            The desk is taken from the file's own account number. Re-importing overlapping history only adds what is new.
          </p>
        </div>
      </label>

      {pending && (
        <div className="grid panel">
          <Notice tone="warning" title="This file does not say which desk it belongs to">
            Give it a name once. The next export of the same account will find it on its own.
          </Notice>
          <div className="form-grid">
            <Field label="Desk name" value={manual.label} onInput={(value) => setManual({ ...manual, label: value })} />
            <Field label="Account number (optional)" value={manual.accountNumber} onInput={(value) => setManual({ ...manual, accountNumber: value })} />
            <Field label="Broker / server" value={manual.server} onInput={(value) => setManual({ ...manual, server: value })} />
            <Field label="Currency" value={manual.currency} onInput={(value) => setManual({ ...manual, currency: value.toUpperCase() })} />
          </div>
          <div className="actions">
            <button className="btn" onClick={() => setPending(undefined)}>Cancel</button>
            <button
              className="btn primary"
              disabled={busy || !manual.label.trim() || !manual.server.trim() || !manual.currency.trim()}
              onClick={commitPending}
            >
              Save import
            </button>
          </div>
        </div>
      )}

      {result ? (
        <div className="import-result">
          <div className="import-result__head">
            <Icon name={result.alreadyImported ? 'inbox' : 'shield-check'} size={18} />
            <strong>{result.alreadyImported ? 'Already imported' : 'Imported'}</strong>
            <Badge>{result.label}</Badge>
          </div>
          <p>
            <strong>{result.file}</strong> → <strong>{result.desk}</strong>
            {result.detected ? ' (resolved from the file)' : ' (named by you)'}.
          </p>
          <div className="grid three-col">
            <Mini label="New" value={result.inserted} />
            <Mini label="Duplicate" value={result.duplicates} />
            <Mini label="Failed" value={result.failed} />
          </div>
          <div className="actions">
            <a className="btn primary" href={`${base}trades/`}>See the calendar</a>
            <a className="btn" href={`${base}`}>Back to Today</a>
          </div>
        </div>
      ) : !pending ? (
        <EmptyState
          icon="upload"
          title="No file chosen"
          description="The first import creates the desk. After that, the file finds it."
          compact
        />
      ) : null}
      </div>
    </Card>
  );
}

function Field({ label, value, onInput }: { label: string; value: string; onInput: (value: string) => void }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input aria-label={label} value={value} onInput={(event) => onInput(event.currentTarget.value)} />
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

