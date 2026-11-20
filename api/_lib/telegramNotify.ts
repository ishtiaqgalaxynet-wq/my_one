import type { IncomingMessage, ServerResponse } from 'node:http';

export type NotifyEventType = 'first_visit' | 'send_hug' | 'share_love' | 'tap_for_love';

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

  const timezone = typeof body.timezone === 'string' && body.timezone.trim()
    ? body.timezone.trim().slice(0, 80)
    : 'Unknown';
  const language = typeof body.language === 'string' && body.language.trim()
    ? body.language.trim().slice(0, 40)
    : 'Unknown';
  const screen = typeof body.screen === 'string' && body.screen.trim()
    ? body.screen.trim().slice(0, 40)
    : 'Unknown';
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

  let messageLines: string[] = [];

  if (eventType === 'first_visit') {
    messageLines = [
      `👀 <b>First-Time Visitor Opened ${escapeTelegramHtml(displayName)}!</b>`,
      '',
      `<b>Timezone:</b> ${escapeTelegramHtml(timezone)}`,
      `<b>Language:</b> ${escapeTelegramHtml(language)} | <b>Screen:</b> ${escapeTelegramHtml(screen)}`,
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
      `<b>Time (UTC):</b> ${escapeTelegramHtml(new Date(now).toISOString())}`,
    ].filter(Boolean);
  }

  if (!botToken || !chatId) {
    sendJson(res, 200, {
      ok: true,
      notified: false,
      event: eventType,
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
        disable_web_page_preview: true,
      }),
    });

    if (!tgRes.ok) {
      const errText = await tgRes.text().catch(() => '');
      console.warn('Telegram sendMessage failed:', tgRes.status, errText.slice(0, 200));
      sendJson(res, 200, {
        ok: true,
        notified: false,
        event: eventType,
        reason: `telegram_http_${tgRes.status}`,
      });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      notified: true,
      event: eventType,
    });
  } catch (err) {
    console.warn('Telegram notify error:', err);
    sendJson(res, 200, {
      ok: true,
      notified: false,
      event: eventType,
      reason: 'telegram_network_error',
    });
  }
}
