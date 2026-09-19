import { useEffect, useState } from 'react';
import type { AppSettings, MarketTimeframe } from '../lib/domain/types';
import { INSTRUMENTS } from '../lib/market/instruments';
import { DEFAULT_WATCHLIST } from '../lib/market/signals';
import { notificationSupport, requestNotificationPermission, type NotificationSupport } from '../lib/notify';
import { Badge, Notice } from './ui';
import { clearMarketCache, loadAppSettings, updateMarketSettings } from './dataClient';

const TIMEFRAMES: MarketTimeframe[] = ['M15', 'H1', 'H4'];

/** Instruments with no keyless browser source — flagged so the UI can be honest. */
const NEEDS_KEY = new Set(['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD']);
const NEEDS_PROXY = new Set(['XAGUSD', 'WTIUSD']);

export default function MarketSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [twelveDataKey, setTwelveDataKey] = useState('');
  const [alphaVantageKey, setAlphaVantageKey] = useState('');
  const [dataProxyUrl, setDataProxyUrl] = useState('');
  const [watchlist, setWatchlist] = useState<string[]>(DEFAULT_WATCHLIST);
  const [timeframe, setTimeframe] = useState<MarketTimeframe>('H1');
  const [permission, setPermission] = useState<NotificationSupport>('default');
  const [status, setStatus] = useState('');

  useEffect(() => {
    loadAppSettings().then((loaded) => {
      setSettings(loaded);
      setTwelveDataKey(loaded.twelveDataKey ?? '');
      setAlphaVantageKey(loaded.alphaVantageKey ?? '');
      setDataProxyUrl(loaded.dataProxyUrl ?? '');
      setWatchlist(loaded.watchlist?.length ? loaded.watchlist : DEFAULT_WATCHLIST);
      setTimeframe(loaded.signalTimeframe ?? 'H1');
    }).catch(() => undefined);
    setPermission(notificationSupport());
  }, []);

  async function persist(patch: Partial<AppSettings>) {
    const saved = await updateMarketSettings(patch);
    setSettings(saved);
    setStatus('Tersimpan.');
    window.setTimeout(() => setStatus(''), 2500);
  }

  function toggleInstrument(id: string) {
    const next = watchlist.includes(id)
      ? watchlist.filter((entry) => entry !== id)
      : [...watchlist, id];
    setWatchlist(next);
    void persist({ watchlist: next });
  }

  async function enableNotifications() {
    const result = await requestNotificationPermission();
    setPermission(result);
    await persist({ desktopNotifications: result === 'granted' });
  }

  return (
    <section className="card settings-section">
      <div className="card-head">
        <h2>Sumber data market</h2>
        <span className="badge">Fundamental &amp; Signals</span>
      </div>
      <p className="subtitle">
        Semua data diambil langsung dari browser kamu, tanpa server perantara. API key disimpan
        lokal di perangkat ini dan <strong>tidak ikut ke dalam file backup</strong>.
      </p>

      <div className="grid u-mt-4" style={{ gap: 14 }}>
        <div className="field">
          <label htmlFor="twelvedata-key">API key Twelve Data</label>
          <input
            id="twelvedata-key"
            type="password"
            value={twelveDataKey}
            placeholder="Kosongkan kalau belum punya"
            onChange={(event) => setTwelveDataKey(event.target.value)}
            onBlur={() => void persist({ twelveDataKey: twelveDataKey.trim() })}
          />
          <span className="field__hint">
            Gratis 800 request/hari. Menyalakan 7 forex major. Tier gratisnya tidak mencakup
            komoditas, jadi XAG dan WTI tetap butuh data proxy.
          </span>
        </div>

        <div className="field">
          <label htmlFor="alphavantage-key">API key Alpha Vantage</label>
          <input
            id="alphavantage-key"
            type="password"
            value={alphaVantageKey}
            placeholder="Kosongkan kalau belum punya"
            onChange={(event) => setAlphaVantageKey(event.target.value)}
            onBlur={() => void persist({ alphaVantageKey: alphaVantageKey.trim() })}
          />
          <span className="field__hint">
            Untuk berita dan skor sentimen. Gratis 25 request/hari, jadi feed di-cache 6 jam.
          </span>
        </div>

        <div className="field">
          <label htmlFor="data-proxy">Data proxy URL (opsional)</label>
          <input
            id="data-proxy"
            type="url"
            value={dataProxyUrl}
            placeholder="https://xxx.workers.dev/chart"
            onChange={(event) => setDataProxyUrl(event.target.value)}
            onBlur={() => void persist({ dataProxyUrl: dataProxyUrl.trim() })}
          />
          <span className="field__hint">
            Endpoint milik kamu sendiri (mis. Cloudflare Worker, gratis 100k request/hari) yang
            meneruskan Yahoo Finance dan menambahkan header CORS. Ini satu-satunya cara gratis
            mendapat candle perak dan minyak, karena Yahoo tidak mengirim CORS ke browser.
          </span>
        </div>
      </div>

      <fieldset className="theme-options" style={{ marginTop: 18 }}>
        <legend>Watchlist</legend>
        <div className="filter-chips u-mt-2">
          {INSTRUMENTS.map((instrument) => {
            const selected = watchlist.includes(instrument.id);
            const blocked = NEEDS_PROXY.has(instrument.id) && !dataProxyUrl;
            const keyed = NEEDS_KEY.has(instrument.id) && !twelveDataKey && !dataProxyUrl;
            return (
              <button
                key={instrument.id}
                type="button"
                className="btn btn--sm"
                aria-pressed={selected}
                onClick={() => toggleInstrument(instrument.id)}
                style={selected
                  ? { borderColor: 'var(--brand)', color: 'var(--brand)', background: 'var(--brand-subtle)' }
                  : undefined}
                title={blocked
                  ? 'Butuh data proxy — tidak ada sumber gratis dari browser'
                  : keyed ? 'Butuh API key Twelve Data' : undefined}
              >
                {instrument.label}
                {(blocked || keyed) && ' *'}
              </button>
            );
          })}
        </div>
        <p className="field__hint u-mt-2">
          Tanda <strong>*</strong> berarti instrumen itu belum punya sumber data dengan pengaturan sekarang.
        </p>
      </fieldset>

      <div className="field u-mt-4" style={{ maxWidth: 220 }}>
        <label htmlFor="signal-timeframe">Timeframe sinyal</label>
        <select
          id="signal-timeframe"
          value={timeframe}
          onChange={(event) => {
            const next = event.target.value as MarketTimeframe;
            setTimeframe(next);
            void persist({ signalTimeframe: next });
          }}
        >
          {TIMEFRAMES.map((tf) => <option key={tf} value={tf}>{tf}</option>)}
        </select>
      </div>

      <div className="u-mt-4">
        <div className="u-row-between u-wrap u-mb-2">
          <strong className="u-sm">Notifikasi desktop</strong>
          {permission === 'granted' && settings?.desktopNotifications
            ? <Badge tone="profit">Aktif</Badge>
            : <Badge>Nonaktif</Badge>}
        </div>
        {permission === 'unsupported' ? (
          <Notice tone="warning">Browser ini tidak mendukung Notification API.</Notice>
        ) : permission === 'denied' ? (
          <Notice tone="warning">
            Notifikasi diblokir di level browser. Izinkan lewat pengaturan situs, lalu muat ulang halaman.
          </Notice>
        ) : (
          <div className="actions">
            <button className="btn" type="button" onClick={enableNotifications}>
              {permission === 'granted' ? 'Perbarui izin' : 'Izinkan notifikasi'}
            </button>
            {permission === 'granted' && (
              <button
                className="btn"
                type="button"
                onClick={() => void persist({ desktopNotifications: !settings?.desktopNotifications })}
              >
                {settings?.desktopNotifications ? 'Matikan' : 'Nyalakan'}
              </button>
            )}
          </div>
        )}
        <p className="field__hint u-mt-2">
          Aplikasi ini statis tanpa service worker, jadi notifikasi hanya bisa muncul saat tabnya
          terbuka — persis seperti yang diinginkan: alert tampil ketika kamu membuka aplikasi.
        </p>
      </div>

      <div className="actions u-mt-4">
        <button
          className="btn"
          type="button"
          onClick={async () => {
            await clearMarketCache();
            setStatus('Cache market dikosongkan.');
            window.setTimeout(() => setStatus(''), 2500);
          }}
        >
          Kosongkan cache market
        </button>
        {status && <span className="save-state">{status}</span>}
      </div>
      <p className="field__hint u-mt-2">
        Hanya menghapus candle, berita, dan alert yang di-cache. Trade, jurnal, dan review tidak tersentuh.
      </p>
    </section>
  );
}
