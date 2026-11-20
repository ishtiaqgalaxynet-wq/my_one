import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleTelegramNotify } from './_lib/telegramNotify.js';

export default async function handler(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse
): Promise<void> {
  await handleTelegramNotify(req, res);
}
