import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';

export async function handleDriveFileProxy(
  fileId: string,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (!/^[a-zA-Z0-9_-]{10,120}$/.test(fileId)) {
    res.statusCode = 400;
    res.end('Invalid Google Drive file ID');
    return;
  }

  const forwardHeaders: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0',
  };
  const rangeHeader = req.headers.range;
  if (typeof rangeHeader === 'string' && rangeHeader.trim()) {
    forwardHeaders.Range = rangeHeader;
  }

  const candidates = [
    `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`,
    `https://drive.google.com/uc?export=download&confirm=t&id=${encodeURIComponent(fileId)}`,
  ];

  const controller = new AbortController();
  req.on('close', () => {
    if (!res.writableEnded) {
      controller.abort();
    }
  });

  try {
    let upstream: globalThis.Response | null = null;

    for (const candidateUrl of candidates) {
      const attempt = await fetch(candidateUrl, {
        headers: forwardHeaders,
        redirect: 'follow',
        signal: controller.signal,
      });

      const ct = (attempt.headers.get('content-type') || '').toLowerCase();
      if ((attempt.ok || attempt.status === 206) && !ct.includes('text/html')) {
        upstream = attempt;
        break;
      }
      await attempt.body?.cancel().catch(() => undefined);
    }

    if (!upstream || !upstream.body) {
      res.statusCode = 404;
      res.end('Google Drive file is unavailable or not shared.');
      return;
    }

    res.statusCode = upstream.status;
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const contentLength = upstream.headers.get('content-length');
    const contentRange = upstream.headers.get('content-range');
    const acceptRanges = upstream.headers.get('accept-ranges') || 'bytes';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', acceptRanges);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    if (contentRange) res.setHeader('Content-Range', contentRange);

    const nodeStream = Readable.fromWeb(upstream.body as unknown as WebReadableStream);
    nodeStream.on('error', () => {
      if (!res.headersSent) {
        res.statusCode = 502;
        res.end('Stream error');
      } else {
        res.end();
      }
    });
    nodeStream.pipe(res);
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') return;
    if (!res.headersSent) {
      res.statusCode = 502;
      res.end('Failed to stream Google Drive media');
    }
  }
}
