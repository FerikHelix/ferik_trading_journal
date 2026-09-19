import { useEffect, useState } from 'preact/hooks';
import type { AppSettings, MarketTimeframe } from '../lib/domain/types';
import { INSTRUMENTS, PROVIDER_MAP } from '../lib/market/instruments';
import { DEFAULT_WATCHLIST } from '../lib/market/signals';
import { notificationSupport, requestNotificationPermission, type NotificationSupport } from '../lib/notify';
import { Badge, Notice } from './ui';
import { clearMarketCache, loadAppSettings, updateMarketSettings } from './dataClient';

const TIMEFRAMES: MarketTimeframe[] = ['M15', 'H1', 'H4'];

/**
 * Instruments with no fallback source. Flagged in the picker so the watchlist
 * does not quietly contain things that go dark whenever Dukascopy does.
 */
const SINGLE_SOURCE = new Set(
  INSTRUMENTS
    .filter((instrument) => (PROVIDER_MAP[instrument.id] ?? []).length === 1)
    .map((instrument) => instrument.id),
);

export default function MarketSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [dataProxyUrl, setDataProxyUrl] = useState('');
  const [watchlist, setWatchlist] = useState<string[]>(DEFAULT_WATCHLIST);
  const [timeframe, setTimeframe] = useState<MarketTimeframe>('H1');
  const [permission, setPermission] = useState<NotificationSupport>('default');
  const [status, setStatus] = useState('');

  useEffect(() => {
    loadAppSettings().then((loaded) => {
      setSettings(loaded);
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
        Tidak ada API key sama sekali. Harga diambil langsung dari browser kamu: Dukascopy untuk
        forex, emas, perak, dan minyak; Binance dan Gate.io untuk BTC dan emas tokenised.
      </p>

      <Notice tone="info" title="Kalau sebagian instrumen tidak muncul">
        Dukascopy adalah satu-satunya sumber gratis yang punya perak, minyak, dan forex major.
        Kalau ia sedang tidak bisa dihubungi, BTC dan emas tetap jalan lewat Binance/Gate.io dan
        perak lewat CoinGecko — sisanya kosong sampai ia pulih atau kamu mengisi data proxy di bawah.
        <strong>GBPUSD</strong> diketahui tidak mengembalikan data dari Dukascopy, jadi ia tidak
        ikut watchlist default.
      </Notice>

      <div className="field u-mt-4">
        <label htmlFor="data-proxy">Data proxy URL (opsional)</label>
        <input
          id="data-proxy"
          type="url"
          value={dataProxyUrl}
          placeholder="https://xxx.workers.dev/chart"
          onInput={(event) => setDataProxyUrl(event.currentTarget.value)}
          onBlur={() => void persist({ dataProxyUrl: dataProxyUrl.trim() })}
        />
        <span className="field__hint">
          Bukan API key. Ini endpoint milik kamu sendiri (misalnya Cloudflare Worker, gratis 100k
          request/hari) yang meneruskan Yahoo Finance dan menambahkan header CORS. Kalau diisi, ia
          dipakai lebih dulu daripada sumber lain.
        </span>
      </div>

      <fieldset className="theme-options" style={{ marginTop: 18 }}>
        <legend>Watchlist</legend>
        <div className="filter-chips u-mt-2">
          {INSTRUMENTS.map((instrument) => {
            const selected = watchlist.includes(instrument.id);
            const fragile = SINGLE_SOURCE.has(instrument.id) && !dataProxyUrl;
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
                title={fragile ? 'Hanya tersedia lewat Dukascopy — tidak ada cadangan' : undefined}
              >
                {instrument.label}
                {fragile && ' *'}
              </button>
            );
          })}
        </div>
        <p className="field__hint u-mt-2">
          Tanda <strong>*</strong> berarti instrumen itu hanya punya satu sumber (Dukascopy), jadi
          ia ikut mati kalau sumber itu tidak bisa dihubungi.
        </p>
      </fieldset>

      <div className="field u-mt-4" style={{ maxWidth: 220 }}>
        <label htmlFor="signal-timeframe">Timeframe sinyal</label>
        <select
          id="signal-timeframe"
          value={timeframe}
          onChange={(event) => {
            const next = event.currentTarget.value as MarketTimeframe;
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
        Hanya menghapus candle dan alert yang di-cache. Trade, jurnal, dan review tidak tersentuh.
      </p>
    </section>
  );
}
