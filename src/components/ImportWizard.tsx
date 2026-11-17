import { useEffect, useState } from 'preact/hooks';
import type { Account, ImportPreview } from '../lib/domain/types';
import type { ImportAccountTarget, ImportCommitResult } from '../lib/db';
import { commitTradeHistory, loadAccounts, previewTradeHistory, resolveDetectedAccount } from './dataClient';

const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export default function ImportWizard() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [file, setFile] = useState<File>();
  const [parsed, setParsed] = useState<ImportPreview>();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ImportCommitResult>();
  const [accountMode, setAccountMode] = useState<'existing' | 'new'>('new');
  const [accountId, setAccountId] = useState('');
  const [form, setForm] = useState({ label: '', accountNumber: '', server: '', currency: 'USD' });

  useEffect(() => {
    loadAccounts().then((items) => {
      setAccounts(items);
      setAccountId(items[0]?.id ?? '');
      setAccountMode(items.length ? 'existing' : 'new');
    }).catch(() => setError('Database lokal tidak dapat dibuka.'));
  }, []);

  function selectFile(next?: File) {
    setFile(next);
    setParsed(undefined);
    setResult(undefined);
    setError('');
    setStep(1);
  }

  async function handlePreview() {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      setParsed(await previewTradeHistory(file));
      setStep(2);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'File tidak dapat dibaca.');
    } finally {
      setBusy(false);
    }
  }

  function accountTarget(): ImportAccountTarget | undefined {
    if (!parsed) return undefined;
    if (parsed.detectedAccount) {
      const existing = resolveDetectedAccount(accounts, parsed);
      return existing
        ? { kind: 'existing', accountId: existing.id }
        : { kind: 'new', account: parsed.detectedAccount };
    }
    if (accountMode === 'existing' && accountId) return { kind: 'existing', accountId };
    if (!form.label.trim() || !form.server.trim() || !form.currency.trim()) return undefined;
    return {
      kind: 'new',
      account: {
        label: form.label,
        accountNumber: form.accountNumber,
        server: form.server,
        currency: form.currency,
        sourceTimeZone: browserTimeZone(),
      },
    };
  }

  async function commit() {
    const target = accountTarget();
    if (!parsed || !file || !target) return;
    setBusy(true);
    setError('');
    try {
      const committed = await commitTradeHistory(parsed, target, file.name);
      setResult(committed);
      setAccounts((items) => items.some((account) => account.id === committed.account.id) ? items : [...items, committed.account]);
      setStep(3);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Import gagal disimpan.');
    } finally {
      setBusy(false);
    }
  }

  const detectedExisting = parsed ? resolveDetectedAccount(accounts, parsed) : undefined;
  const manualReady = parsed?.detectedAccount || (accountMode === 'existing' ? Boolean(accountId) : Boolean(form.label.trim() && form.server.trim() && form.currency.trim()));

  return <section className="card">
    <div className="stepper">
      {['File', 'Review', 'Selesai'].map((label, index) => <div className={`step ${step === index + 1 ? 'active' : step > index + 1 ? 'done' : ''}`} key={label}>
        <span className="step-number">{step > index + 1 ? '✓' : index + 1}</span><span>{label}</span>
      </div>)}
    </div>

    {error && <div className="notice error" role="alert">{error}</div>}

    {step === 1 && <div className="grid">
      <label className="dropzone">
        <input
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          onChange={(event) => selectFile(event.currentTarget.files?.[0])}
        />
        <div>
          <div className="empty-icon" style={{ margin: '0 auto 14px' }}>⇧</div>
          <h3>{file?.name ?? 'Pilih MT5 workbook atau Exness CSV'}</h3>
          <p className="muted">Klik untuk memilih file. Data diproses lokal dan tidak diunggah ke server.</p>
          {file && <span className="badge">{(file.size / 1024).toFixed(1)} KB</span>}
        </div>
      </label>
      <div className="actions"><button className="btn primary" disabled={!file || busy} onClick={handlePreview}>{busy ? 'Membaca…' : 'Preview import'}</button></div>
    </div>}

    {step === 2 && parsed && <div className="grid">
      <div className="card-head">
        <div><span className="badge">{parsed.sourceLabel}</span><h3>{parsed.detectedAccount?.label ?? 'Pilih account tujuan'}</h3></div>
        {parsed.detectedAccount && <span className="muted">{detectedExisting ? 'Account existing' : 'Account baru otomatis'}</span>}
      </div>

      {!parsed.detectedAccount && <div className="grid" style={{ maxWidth: 650 }}>
        {accounts.length > 0 && <div className="field"><label>Trading account</label><select value={accountMode === 'new' ? 'new' : accountId} onChange={(event) => {
          if (event.currentTarget.value === 'new') setAccountMode('new');
          else { setAccountMode('existing'); setAccountId(event.currentTarget.value); }
        }}>{accounts.map((account) => <option value={account.id} key={account.id}>{account.label}</option>)}<option value="new">+ Buat account baru</option></select></div>}
        {accountMode === 'new' && <div className="form-grid">
          <Field label="Nama account" value={form.label} onInput={(value) => setForm({ ...form, label: value })} />
          <Field label="Broker / server" value={form.server} onInput={(value) => setForm({ ...form, server: value })} />
          <Field label="Nomor account (opsional)" value={form.accountNumber} onInput={(value) => setForm({ ...form, accountNumber: value })} />
          <Field label="Currency" value={form.currency} onInput={(value) => setForm({ ...form, currency: value.toUpperCase() })} />
        </div>}
      </div>}

      <div className="grid three-col">
        <Mini label="Trade valid" value={parsed.deals.length} />
        <Mini label="Balance event" value={parsed.balanceEvents.length} />
        <Mini label="Issue" value={parsed.issues.length} />
      </div>
      {parsed.issues.length > 0 && <div className="notice warning">{parsed.issues.slice(0, 5).map((issue) => <div key={`${issue.row}-${issue.message}`}>Baris {issue.row}: {issue.message}</div>)}</div>}
      <div className="table-wrap" style={{ margin: 0 }}><table><thead><tr>{Object.keys(parsed.preview[0] ?? {}).slice(0, 6).map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{parsed.preview.slice(0, 5).map((row, index) => <tr key={index}>{Object.values(row).slice(0, 6).map((value, column) => <td key={column}>{value}</td>)}</tr>)}</tbody></table></div>
      <div className="actions"><button className="btn" onClick={() => setStep(1)}>← Ganti file</button><button className="btn primary" disabled={!manualReady || busy} onClick={commit}>{busy ? 'Menyimpan…' : 'Simpan import'}</button></div>
    </div>}

    {step === 3 && <div className="empty"><div className="empty-icon">✓</div><h3>{result?.alreadyImported ? 'File sudah pernah diimpor' : 'Import selesai'}</h3><p>{result?.inserted ?? 0} data baru, {result?.duplicates ?? 0} duplikat, dan {result?.failed ?? 0} gagal.</p><div className="actions"><a className="btn primary" href={`${import.meta.env.BASE_URL}trades/`}>Lihat trades</a><button className="btn" onClick={() => selectFile(undefined)}>Import lagi</button></div></div>}
  </section>;
}

function Field({ label, value, onInput }: { label: string; value: string; onInput: (value: string) => void }) {
  return <div className="field"><label>{label}</label><input aria-label={label} value={value} onInput={(event) => onInput(event.currentTarget.value)} /></div>;
}

function Mini({ label, value }: { label: string; value: number }) {
  return <div className="card"><div className="stat-label">{label}</div><div className="stat-value">{value}</div></div>;
}
