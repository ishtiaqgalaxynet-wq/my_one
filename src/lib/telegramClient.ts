export type TelegramInteractionEvent = 'send_hug' | 'share_love' | 'tap_for_love';

export interface NotifyApiResponse {
  ok: boolean;
  notified?: boolean;
  deduplicated?: boolean;
  reason?: string;
}

interface FirstVisitPayload {
  event: 'first_visit';
  displayName: string;
  timezone: string;
  language: string;
  screen: string;
}

interface ButtonEventPayload {
  event: TelegramInteractionEvent;
  displayName: string;
  buttonLabel: string;
  hugCount?: number;
  shareCopied?: boolean;
  tapCount?: number;
  finaleTitle?: string;
  timezone: string;
}

function getVisitorTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

async function postNotifyPayload(
  payload: FirstVisitPayload | ButtonEventPayload
): Promise<NotifyApiResponse | null> {
  const serialized = JSON.stringify(payload);

  try {
    const response = await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: serialized,
    });

    if (!response.ok) {
      return null;
    }

    const parsed = (await response.json().catch(() => null)) as NotifyApiResponse | null;
    return parsed;
  } catch {
    // Fallback to sendBeacon when fetch is interrupted during navigation/unload
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([serialized], { type: 'text/plain;charset=UTF-8' });
        const queued = navigator.sendBeacon('/api/notify', blob);
        if (queued) {
          return { ok: true, notified: true };
        }
      }
    } catch {
      // Ignore beacon errors
    }
    return null;
  }
}

export async function notifyFirstVisit(displayName: string): Promise<boolean> {
  const result = await postNotifyPayload({
    event: 'first_visit',
    displayName,
    timezone: getVisitorTimezone(),
    language: typeof navigator !== 'undefined' ? navigator.language || '' : '',
    screen:
      typeof window !== 'undefined' && window.screen
        ? `${window.screen.width}x${window.screen.height}`
        : '',
  });

  return Boolean(result?.notified || result?.deduplicated);
}

export async function notifyButtonInteraction(
  event: TelegramInteractionEvent,
  params: {
    displayName: string;
    buttonLabel: string;
    hugCount?: number;
    shareCopied?: boolean;
    tapCount?: number;
    finaleTitle?: string;
  }
): Promise<boolean> {
  const result = await postNotifyPayload({
    event,
    displayName: params.displayName,
    buttonLabel: params.buttonLabel,
    hugCount: params.hugCount,
    shareCopied: params.shareCopied,
    tapCount: params.tapCount,
    finaleTitle: params.finaleTitle,
    timezone: getVisitorTimezone(),
  });

  return Boolean(result?.notified || result?.deduplicated);
}
