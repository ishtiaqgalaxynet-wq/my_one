import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import express, { type Request, type Response } from 'express';

interface FirebaseAppletConfig {
  projectId: string;
  apiKey: string;
  firestoreDatabaseId?: string;
}

const SUPER_ADMIN_EMAIL = 'ishtiaqhimel11@gmail.com';
const PORT = Number(process.env.PORT) || 3000;
const ROOT_DIR = process.cwd();
const UPLOAD_DIR = path.resolve(ROOT_DIR, 'uploads');
const DIST_DIR = path.resolve(ROOT_DIR, 'dist');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const firebaseConfig: FirebaseAppletConfig = JSON.parse(
  fs.readFileSync(path.resolve(ROOT_DIR, 'firebase-applet-config.json'), 'utf8')
) as FirebaseAppletConfig;

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/ogg': 'ogv',
  'video/x-m4v': 'm4v',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/flac': 'flac',
  'audio/webm': 'weba',
};

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  ogv: 'video/ogg',
  m4v: 'video/x-m4v',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/opus',
  flac: 'audio/flac',
  weba: 'audio/webm',
};

function sanitizeExtFromHeader(contentType: string, rawFileName: string): { ext: string; mime: string } | null {
  const normalizedMime = contentType.split(';')[0].trim().toLowerCase();
  if (normalizedMime && EXT_BY_MIME[normalizedMime]) {
    return { ext: EXT_BY_MIME[normalizedMime], mime: normalizedMime };
  }

  const extMatch = path.extname(rawFileName).replace(/^\./, '').toLowerCase();
  if (extMatch && MIME_BY_EXT[extMatch]) {
    return { ext: extMatch, mime: MIME_BY_EXT[extMatch] };
  }

  return null;
}

async function verifyAdminToken(req: Request): Promise<{ uid: string; email: string } | null> {
  const authHeader = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!match) return null;

  const idToken = match[1].trim();
  if (!idToken) return null;

  try {
    const lookupRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );

    if (!lookupRes.ok) return null;
    const payload = (await lookupRes.json()) as {
      users?: Array<{ localId?: string; email?: string; emailVerified?: boolean }>;
    };

    const user = payload.users?.[0];
    if (!user?.localId || !user.email || !user.emailVerified) {
      return null;
    }

    if (user.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
      return { uid: user.localId, email: user.email };
    }

    const dbId = firebaseConfig.firestoreDatabaseId || '(default)';
    const adminDocRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/${encodeURIComponent(dbId)}/documents/admins/${encodeURIComponent(user.localId)}`,
      {
        headers: { Authorization: `Bearer ${idToken}` },
      }
    );

    if (!adminDocRes.ok) return null;
    return { uid: user.localId, email: user.email };
  } catch {
    return null;
  }
}

async function startServer() {
  const app = express();

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // Upload photo, video, or MP3 audio file to local server storage (never Firebase/Firestore)
  app.post(
    '/api/media/upload',
    express.raw({ type: '*/*', limit: '55mb' }),
    async (req: Request, res: Response) => {
      const admin = await verifyAdminToken(req);
      if (!admin) {
        res.status(401).json({ error: 'Verified admin authentication required to upload media.' });
        return;
      }

      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(400).json({ error: 'Uploaded file payload is empty.' });
        return;
      }

      const contentType = String(req.headers['content-type'] || '');
      const rawFileNameHeader = String(req.headers['x-file-name'] || 'upload');
      let decodedName = 'upload';
      try {
        decodedName = decodeURIComponent(rawFileNameHeader);
      } catch {
        decodedName = rawFileNameHeader;
      }

      const resolved = sanitizeExtFromHeader(contentType, decodedName);
      if (!resolved) {
        res.status(415).json({ error: 'Unsupported media file format.' });
        return;
      }

      const kindHeader = String(req.headers['x-media-kind'] || '').toLowerCase();
      const prefix =
        kindHeader === 'video' || resolved.mime.startsWith('video/')
          ? 'video'
          : kindHeader === 'audio' || resolved.mime.startsWith('audio/')
            ? 'music'
            : 'photo';

      const filename = `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${resolved.ext}`;
      const targetPath = path.join(UPLOAD_DIR, filename);

      try {
        await fs.promises.writeFile(targetPath, req.body);
        res.status(201).json({
          url: `/media/${filename}`,
          filename,
          mimeType: resolved.mime,
          byteLength: req.body.length,
        });
      } catch (err) {
        console.error('Failed to persist uploaded media file:', err);
        res.status(500).json({ error: 'Unable to save uploaded file on server.' });
      }
    }
  );

  // Delete an uploaded media file when replaced or removed
  app.delete('/api/media/:filename', async (req: Request, res: Response) => {
    const admin = await verifyAdminToken(req);
    if (!admin) {
      res.status(401).json({ error: 'Verified admin authentication required.' });
      return;
    }

    const filename = String(req.params.filename || '');
    if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
      res.status(400).json({ error: 'Invalid media filename.' });
      return;
    }

    const targetPath = path.resolve(UPLOAD_DIR, filename);
    if (!targetPath.startsWith(UPLOAD_DIR + path.sep)) {
      res.status(400).json({ error: 'Invalid media path.' });
      return;
    }

    try {
      await fs.promises.unlink(targetPath);
    } catch {
      // Ignore already-deleted files
    }
    res.json({ deleted: true });
  });

  // Stream uploaded photos, videos, and audio with HTTP Range support (206 Partial Content)
  app.get('/media/:filename', async (req: Request, res: Response) => {
    const filename = String(req.params.filename || '');
    if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
      res.status(400).end('Invalid filename');
      return;
    }

    const targetPath = path.resolve(UPLOAD_DIR, filename);
    if (!targetPath.startsWith(UPLOAD_DIR + path.sep)) {
      res.status(403).end('Forbidden');
      return;
    }

    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(targetPath);
    } catch {
      res.status(404).end('Not found');
      return;
    }

    if (!stat.isFile()) {
      res.status(404).end('Not found');
      return;
    }

    const ext = path.extname(filename).replace(/^\./, '').toLowerCase();
    const mimeType = MIME_BY_EXT[ext] || 'application/octet-stream';
    const fileSize = stat.size;
    const range = req.headers.range;

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Type', mimeType);

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (!Number.isFinite(start) || start < 0 || start >= fileSize || end < start || end >= fileSize) {
        res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
        return;
      }

      const chunkSize = end - start + 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Content-Length', String(chunkSize));
      fs.createReadStream(targetPath, { start, end }).pipe(res);
      return;
    }

    res.status(200);
    res.setHeader('Content-Length', String(fileSize));
    fs.createReadStream(targetPath).pipe(res);
  });

  // Stream publicly shared Google Drive photos, videos, and audio with HTTP Range support
  app.get('/api/drive/file/:fileId', async (req: Request, res: Response) => {
    const fileId = String(req.params.fileId || '');
    if (!/^[a-zA-Z0-9_-]{10,120}$/.test(fileId)) {
      res.status(400).end('Invalid Google Drive file ID');
      return;
    }

    const forwardHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0',
    };
    if (typeof req.headers.range === 'string' && req.headers.range.trim()) {
      forwardHeaders.Range = req.headers.range;
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
        res.status(404).end('Google Drive file is unavailable or not shared.');
        return;
      }

      res.status(upstream.status);
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
          res.status(502).end('Stream error');
        } else {
          res.end();
        }
      });
      nodeStream.pipe(res);
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      if (!res.headersSent) {
        res.status(502).end('Failed to stream Google Drive media');
      }
    }
  });

  if (process.env.NODE_ENV === 'development') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(DIST_DIR));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(DIST_DIR, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
