import https from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';

export type NotifyEventType = 'first_visit' | 'send_hug' | 'share_love' | 'tap_for_love' | 'test';

export interface TelegramConfig {
  botToken: string;
  chatIds: string[];
  configured: boolean;
}

export interface TelegramSendResult {
  ok: boolean;
  statusCode: number;
  description?: string;
  errorCode?: number;
}

const FIRST_VISIT_COOLDOWN_MS = 10 * 60 * 1000;
const BUTTON_COOLDOWN_MS = 2500;
const TELEGRAM_REQUEST_TIMEOUT_MS = 10000;

const recentNotifyMap = new Map<string, number>();

function cleanEnvValue(rawValue: string | undefined): string {
  const trimmed = (rawValue || '').trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function getTelegramConfig(): TelegramConfig {
  let botToken = cleanEnvValue(
    process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN
  );
  // Strip accidental "bot" prefix if someone copied "bot123456:ABC..." instead of "123456:ABC..."
  if (/^bot\d+:/i.test(botToken)) {
    botToken = botToken.slice(3);
  }

  const rawChatIds = cleanEnvValue(
    process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_IDS || process.env.CHAT_ID
  );
  const chatIds = rawChatIds
    .split(',')
    .map((id) => cleanEnvValue(id))
    .filter(Boolean);

  return {
    botToken,
    chatIds,
    configured: Boolean(botToken && chatIds.length > 0),
  };
}

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
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
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
        if (!raw.trim()) {
          resolve({});
          return;
        }
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
  if (res.writableEnded) return;
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function sanitizeText(value: unknown, fallback: string, maxLen: number): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLen) : fallback;
}

function sanitizePositiveInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.round(value);
}

export function buildTelegramMessage(
  eventType: NotifyEventType,
  body: Record<string, unknown>,
  userAgent: string,
  nowMs: number
): string {
  const timezone = sanitizeText(body.timezone, 'Unknown', 80);
  const language = sanitizeText(body.language, 'Unknown', 40);
  const screen = sanitizeText(body.screen, 'Unknown', 40);
  const displayName = sanitizeText(body.displayName, 'The Princess Kingdom', 60);
  const buttonLabel = sanitizeText(body.buttonLabel, '', 60);
  const hugCount = sanitizePositiveInt(body.hugCount);
  const tapCount = sanitizePositiveInt(body.tapCount);
  const shareCopied = typeof body.shareCopied === 'boolean' ? body.shareCopied : null;
  const finaleTitle = sanitizeText(body.finaleTitle, '', 160);
  const customMessage = sanitizeText(body.customMessage, '', 300);
  const utcIso = new Date(nowMs).toISOString();

  let lines: string[];

  if (eventType === 'first_visit') {
    lines = [
      `👀 <b>First-Time Visitor Opened ${escapeTelegramHtml(displayName)}!</b>`,
      '',
      `<b>Timezone:</b> ${escapeTelegramHtml(timezone)}`,
      `<b>Language:</b> ${escapeTelegramHtml(language)} | <b>Screen:</b> ${escapeTelegramHtml(screen)}`,
      `<b>Device:</b> ${escapeTelegramHtml(userAgent.slice(0, 180) || 'Unknown')}`,
      `<b>Time (UTC):</b> ${escapeTelegramHtml(utcIso)}`,
    ];
  } else if (eventType === 'send_hug') {
    const label = buttonLabel || 'Send a hug';
    lines = [
      `🤗💖 <b>Warm Royal Hug Delivered!</b>`,
      '',
      customMessage
        ? escapeTelegramHtml(customMessage)
        : `Someone wrapped <b>${escapeTelegramHtml(displayName)}</b> in a warm hug using the <b>"${escapeTelegramHtml(label)}"</b> button.`,
      hugCount ? `<b>Total Kingdom Hugs:</b> #${hugCount.toLocaleString()}` : '',
      `<b>Floating Effect:</b> Warm Hug Wave (🤗 🫂 💖 💕 🌷)`,
      `<b>Visitor Timezone:</b> ${escapeTelegramHtml(timezone)}`,
      `<b>Time (UTC):</b> ${escapeTelegramHtml(utcIso)}`,
    ];
  } else if (eventType === 'share_love') {
    const label = buttonLabel || 'Share love';
    const shareOutcome =
      shareCopied === true
        ? 'Copied the Kingdom link to clipboard so it can be shared with someone special 📋'
        : 'Triggered a sparkle love share across the Kingdom ✨';
    lines = [
      `💌✨ <b>Someone Shared Your Kingdom!</b>`,
      '',
      customMessage
        ? escapeTelegramHtml(customMessage)
        : `A visitor clicked <b>"${escapeTelegramHtml(label)}"</b> on <b>${escapeTelegramHtml(displayName)}</b>'s page to spread the love.`,
      `<b>Action Taken:</b> ${escapeTelegramHtml(shareOutcome)}`,
      `<b>Section:</b> Profile Stats & Love Actions`,
      `<b>Floating Effect:</b> Diagonal Sparkle Spin (💌 ✨ 🌸 💗 🕊️ 🌹)`,
      `<b>Visitor Timezone:</b> ${escapeTelegramHtml(timezone)}`,
      `<b>Time (UTC):</b> ${escapeTelegramHtml(utcIso)}`,
    ];
  } else if (eventType === 'tap_for_love') {
    const label = buttonLabel || 'Tap for love 💖';
    lines = [
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
      `<b>Time (UTC):</b> ${escapeTelegramHtml(utcIso)}`,
    ];
  } else {
    lines = [
      `✅💜 <b>Telegram Notifications Active!</b>`,
      '',
      `Your server for <b>${escapeTelegramHtml(displayName)}</b> successfully connected to Telegram.`,
      `<b>Time (UTC):</b> ${escapeTelegramHtml(utcIso)}`,
    ];
  }

  return lines.filter(Boolean).join('\n');
}

/**
 * Sends a Telegram message using node:https with family: 4 (IPv4) so cloud hosts
 * like Render never stall or fail on unrouted IPv6 addresses for api.telegram.org.
 */
export function postTelegramRequest(
  botToken: string,
  method: string,
  payload?: Record<string, unknown>
): Promise<{ statusCode: number; ok: boolean; errorCode?: number; description?: string; result?: unknown }> {
  return new Promise((resolve, reject) => {
    const bodyString = payload ? JSON.stringify(payload) : '';
    const request = https.request(
      {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${encodeURIComponent(botToken)}/${method}`,
        method: payload ? 'POST' : 'GET',
        family: 4,
        timeout: TELEGRAM_REQUEST_TIMEOUT_MS,
        headers: payload
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(bodyString, 'utf8'),
            }
          : undefined,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          const statusCode = response.statusCode || 500;
          try {
            const parsed = JSON.parse(raw) as {
              ok?: boolean;
              error_code?: number;
              description?: string;
              result?: unknown;
            };
            resolve({
              statusCode,
              ok: Boolean(parsed.ok) && statusCode >= 200 && statusCode < 300,
              errorCode: parsed.error_code,
              description: parsed.description,
              result: parsed.result,
            });
          } catch {
            resolve({
              statusCode,
              ok: false,
              description: raw.slice(0, 200) || `HTTP ${statusCode}`,
            });
          }
        });
      }
    );

    request.on('timeout', () => {
      request.destroy(new Error('Telegram API request timed out after 10s'));
    });
    request.on('error', (err) => {
      reject(err);
    });

    if (bodyString) {
      request.write(bodyString);
    }
    request.end();
  });
}

async function sendToTelegramChat(
  botToken: string,
  chatId: string,
  htmlText: string
): Promise<TelegramSendResult> {
  const firstAttempt = await postTelegramRequest(botToken, 'sendMessage', {
    chat_id: chatId,
    text: htmlText,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });

  if (firstAttempt.ok) {
    return { ok: true, statusCode: firstAttempt.statusCode };
  }

  // Fallback without HTML parse_mode if Telegram rejected HTML entity formatting
  if (firstAttempt.statusCode === 400 && /parse entities/i.test(firstAttempt.description || '')) {
    const plainText = htmlText
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
    const fallbackAttempt = await postTelegramRequest(botToken, 'sendMessage', {
      chat_id: chatId,
      text: plainText,
      disable_web_page_preview: true,
    });
    return {
      ok: fallbackAttempt.ok,
      statusCode: fallbackAttempt.statusCode,
      errorCode: fallbackAttempt.errorCode,
      description: fallbackAttempt.description,
    };
  }

  return {
    ok: false,
    statusCode: firstAttempt.statusCode,
    errorCode: firstAttempt.errorCode,
    description: firstAttempt.description,
  };
}

export async function dispatchTelegramNotification(
  eventType: NotifyEventType,
  body: Record<string, unknown>,
  userAgent: string,
  nowMs = Date.now()
): Promise<{
  notified: boolean;
  reason?: string;
  telegramDescription?: string;
}> {
  const config = getTelegramConfig();
  if (!config.configured) {
    console.warn(
      '[Telegram] Notification skipped: missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in environment variables.'
    );
    return { notified: false, reason: 'telegram_not_configured' };
  }

  const message = buildTelegramMessage(eventType, body, userAgent, nowMs);

  try {
    const results = await Promise.all(
      config.chatIds.map((chatId) => sendToTelegramChat(config.botToken, chatId, message))
    );

    const anySuccess = results.some((r) => r.ok);
    const firstFailure = results.find((r) => !r.ok);

    if (!anySuccess && firstFailure) {
      console.warn(
        `[Telegram] sendMessage failed (HTTP ${firstFailure.statusCode}): ${firstFailure.description || 'Unknown error'}`
      );
      return {
        notified: false,
        reason: `telegram_http_${firstFailure.statusCode}`,
        telegramDescription: firstFailure.description,
      };
    }

    if (firstFailure) {
      console.warn(
        `[Telegram] Partial delivery failure (HTTP ${firstFailure.statusCode}): ${firstFailure.description || 'Unknown error'}`
      );
    }

    return { notified: true };
  } catch (err) {
    console.warn('[Telegram] Network error calling api.telegram.org:', err);
    return { notified: false, reason: 'telegram_network_error' };
  }
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

  const config = getTelegramConfig();
  if (!config.configured) {
    console.warn(
      `[Telegram] Skipped "${eventType}" alert: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set.`
    );
    sendJson(res, 200, {
      ok: true,
      notified: false,
      event: eventType,
      reason: 'telegram_not_configured',
    });
    return;
  }

  const clientIp = extractClientIp(req);
  const now = Date.now();
  const cooldownMs = eventType === 'first_visit' ? FIRST_VISIT_COOLDOWN_MS : BUTTON_COOLDOWN_MS;
  const throttleKey = `${clientIp || 'unknown'}:${eventType}`;
  const lastSentAt = recentNotifyMap.get(throttleKey);

  if (lastSentAt && now - lastSentAt < cooldownMs) {
    sendJson(res, 200, { ok: true, notified: false, deduplicated: true, event: eventType });
    return;
  }
  recentNotifyMap.set(throttleKey, now);

  if (recentNotifyMap.size > 500) {
    for (const [k, ts] of recentNotifyMap.entries()) {
      if (now - ts > FIRST_VISIT_COOLDOWN_MS) recentNotifyMap.delete(k);
    }
  }

  const userAgent = String(req.headers['user-agent'] || 'Unknown');
  const outcome = await dispatchTelegramNotification(eventType, body, userAgent, now);

  if (!outcome.notified) {
    // Allow immediate retry if Telegram failed rather than locking behind cooldown
    recentNotifyMap.delete(throttleKey);
  }

  sendJson(res, 200, {
    ok: true,
    notified: outcome.notified,
    event: eventType,
    ...(outcome.reason ? { reason: outcome.reason } : {}),
  });
}

export async function handleTelegramTest(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse
): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    return;
  }

  const body = await readJsonBody(req);
  const userAgent = String(req.headers['user-agent'] || 'Admin Test');
  const outcome = await dispatchTelegramNotification('test', body, userAgent, Date.now());

  sendJson(res, outcome.notified ? 200 : 502, {
    ok: outcome.notified,
    notified: outcome.notified,
    event: 'test',
    ...(outcome.reason ? { reason: outcome.reason } : {}),
    ...(outcome.telegramDescription ? { description: outcome.telegramDescription } : {}),
  });
}
