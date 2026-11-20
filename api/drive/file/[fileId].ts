import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleDriveFileProxy } from '../../_lib/driveProxy.js';

export default async function handler(
  req: IncomingMessage & { query?: Record<string, string | string[]> },
  res: ServerResponse
): Promise<void> {
  const rawQueryId = req.query?.fileId;
  let fileId = Array.isArray(rawQueryId) ? rawQueryId[0] : rawQueryId;

  if (!fileId && req.url) {
    const match = /\/api\/drive\/file\/([^/?#]+)/.exec(req.url);
    if (match) {
      fileId = decodeURIComponent(match[1]);
    }
  }

  await handleDriveFileProxy(String(fileId || ''), req, res);
}
