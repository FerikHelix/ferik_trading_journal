import { useEffect, useRef, useState } from 'react';
import type { SignalAlert } from '../lib/domain/types';
import { alertTitle, describeAlert, scanWatchlist } from '../lib/market/signals';
import { showNotifications } from '../lib/notify';
import { Icon } from './ui';
import { addSignalAlerts, getSignalAlerts, loadAppSettings, markAlertsSeen } from './dataClient';
import { marketCacheIO } from './marketCacheIO';

/** Waits for the browser to go idle, with a timeout for Safari and Firefox. */
function idle(timeout = 1200): Promise<void> {
  return new Promise((resolve) => {
    const request = (window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    }).requestIdleCallback;
    if (typeof request === 'function') request(() => resolve(), { timeout });
    else window.setTimeout(resolve, 600);
  });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'baru saja';
  if (minutes < 60) return `${minutes} mnt lalu`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.round(hours / 24)} hr lalu`;
}

export default function AlertBell() {
  const [alerts, setAlerts] = useState<SignalAlert[]>([]);
  const [open, setOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const unseen = alerts.filter((alert) => !alert.seenAt);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      // Everything this island does is background work, including its reads.
      // Touching IndexedDB on mount put it in contention with foreground
      // writes on the same connection — saving a theme choice, autosaving a
      // journal — which could leave those writes uncommitted when the user
      // navigated immediately afterwards. Yielding first keeps the bell off
      // the critical path entirely.
      await idle();
      if (cancelled) return;

      // Show what is already stored before the network is touched, so the bell
      // is never empty while a scan is in flight.
      const stored = await getSignalAlerts().catch(() => [] as SignalAlert[]);
      if (!cancelled) setAlerts(stored);

      const settings = await loadAppSettings().catch(() => null);
      if (!settings || cancelled) return;

      setScanning(true);
      try {
        const { alerts: found } = await scanWatchlist(settings, marketCacheIO, { signal: controller.signal });
        const fresh = await addSignalAlerts(found);
        if (cancelled) return;

        if (fresh.length > 0) {
          setAlerts(await getSignalAlerts());
          if (settings.desktopNotifications) {
            showNotifications(fresh.map((alert) => ({
              tag: alert.id,
              title: alertTitle(alert),
              body: describeAlert(alert),
              url: `${import.meta.env.BASE_URL}signals/`,
            })));
          }
        }
      } catch {
        // A failed scan must never break the shell — the page still works.
      } finally {
        if (!cancelled) setScanning(false);
      }
    })();

    return () => { cancelled = true; controller.abort(); };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unseen.length > 0) {
      const ids = unseen.map((alert) => alert.id);
      await markAlertsSeen(ids).catch(() => undefined);
      setAlerts((current) => current.map((alert) => (
        ids.includes(alert.id) ? { ...alert, seenAt: new Date().toISOString() } : alert
      )));
    }
  }

  return (
    <div className="alert-trigger" ref={containerRef}>
      <button
        type="button"
        className="icon-btn"
        onClick={toggle}
        aria-expanded={open}
        aria-label={unseen.length > 0 ? `${unseen.length} alert sinyal belum dibaca` : 'Alert sinyal'}
      >
        <Icon name="bell" />
        {unseen.length > 0 && <span className="alert-dot">{unseen.length > 9 ? '9+' : unseen.length}</span>}
      </button>

      {open && (
        <div className="alert-menu">
          {scanning && alerts.length === 0 && (
            <p className="u-sm u-center muted" style={{ padding: 16 }}>Memindai order block…</p>
          )}
          {!scanning && alerts.length === 0 && (
            <p className="u-sm u-center muted" style={{ padding: 16 }}>
              Belum ada alert. Atur watchlist di Settings.
            </p>
          )}
          {alerts.map((alert) => (
            <a className="alert-row" key={alert.id} href={`${import.meta.env.BASE_URL}signals/`}>
              <span className="alert-row__head">
                <span className="alert-row__title">{alertTitle(alert)}</span>
                <span className="alert-row__time">{timeAgo(alert.createdAt)}</span>
              </span>
              <span className="alert-row__body">{describeAlert(alert)}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
