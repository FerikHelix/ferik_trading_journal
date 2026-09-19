/**
 * Desktop notifications for signal alerts.
 *
 * This is a static site with no service worker and no push subscription, so
 * notifications can only be raised while a tab is actually open — which is
 * exactly the intended behaviour: alerts surface when the app is opened.
 *
 * Everything degrades silently. An unsupported browser, a denied permission
 * or an iOS Safari tab simply means the in-app alert list is the only channel,
 * and nothing throws.
 */

export type NotificationSupport = 'unsupported' | 'default' | 'granted' | 'denied';

export function notificationSupport(): NotificationSupport {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission as NotificationSupport;
}

/**
 * Must be called from a user gesture — browsers reject permission prompts that
 * are not user-initiated, and Safari throws rather than returning 'denied'.
 */
export async function requestNotificationPermission(): Promise<NotificationSupport> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission as NotificationSupport;
  try {
    return (await Notification.requestPermission()) as NotificationSupport;
  } catch {
    return 'denied';
  }
}

export interface DesktopNotice {
  /** Stable id so repeated renders replace rather than stack. */
  tag: string;
  title: string;
  body: string;
  url?: string;
}

/** Raises at most `max` notifications so a first scan cannot spam the desktop. */
export function showNotifications(notices: DesktopNotice[], max = 3): number {
  if (notificationSupport() !== 'granted') return 0;

  let shown = 0;
  for (const notice of notices.slice(0, max)) {
    try {
      const notification = new Notification(notice.title, {
        body: notice.body,
        tag: notice.tag,
        icon: undefined,
      });
      if (notice.url) {
        notification.onclick = () => {
          window.focus();
          window.location.href = notice.url as string;
        };
      }
      shown += 1;
    } catch {
      // Some browsers throw when constructing Notification outside a service
      // worker. Nothing to recover — the in-app list already has the alert.
      break;
    }
  }
  return shown;
}
