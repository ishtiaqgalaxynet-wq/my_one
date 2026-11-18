import { MAX_LENGTHS, type PhotoItem } from '../types/kingdom';

export const MAX_VIDEO_RAW_BYTES = 50 * 1024 * 1024;
export const MAX_AUDIO_RAW_BYTES = 50 * 1024 * 1024;

export interface CompressedImageResult {
  blob: Blob;
  previewDataUrl: string;
  mimeType: string;
  byteLength: number;
  width: number;
  height: number;
}

export interface ProcessedVideoResult {
  videoFile: File;
  posterBlob: Blob | null;
  posterPreviewUrl: string;
  mimeType: string;
  byteLength: number;
}

export interface ProcessedAudioResult {
  audioFile: File;
  previewObjectUrl: string;
  mimeType: string;
  byteLength: number;
  durationSeconds: number;
  defaultTitle: string;
}

export interface UploadedMediaResponse {
  url: string;
  filename: string;
  mimeType: string;
  byteLength: number;
}

/**
 * Optimizes an uploaded image file onto a canvas into a JPEG Blob for fast upload
 * to the Express media server (never stored as base64 in Firestore).
 */
export async function compressImageFile(file: File): Promise<CompressedImageResult> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Unable to decode the selected image file.'));
      el.src = objectUrl;
    });

    const maxDim = 1800;
    const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context is unavailable in this browser.');
    }

    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) resolve(result);
          else reject(new Error('Failed to encode image file.'));
        },
        'image/jpeg',
        0.88
      );
    });

    const previewDataUrl = canvas.toDataURL('image/jpeg', 0.72);

    return {
      blob,
      previewDataUrl,
      mimeType: 'image/jpeg',
      byteLength: blob.size,
      width,
      height,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function generateFallbackVideoPoster(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#9163cb"/><stop offset="100%" stop-color="#352063"/></linearGradient></defs><rect width="640" height="480" fill="url(#g)"/><circle cx="320" cy="240" r="56" fill="rgba(246,241,252,0.18)" stroke="#f6f1fc" stroke-width="3"/><polygon points="304,212 354,240 304,268" fill="#f6f1fc"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function captureVideoPoster(
  objectUrl: string
): Promise<{ posterBlob: Blob | null; posterPreviewUrl: string }> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';

    let settled = false;
    const finish = (result: { posterBlob: Blob | null; posterPreviewUrl: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      resolve(result);
    };

    const timer = window.setTimeout(() => {
      finish({ posterBlob: null, posterPreviewUrl: generateFallbackVideoPoster() });
    }, 3500);

    const captureFrame = () => {
      try {
        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 360;
        const scale = Math.min(1, 960 / Math.max(vw, vh));
        const width = Math.max(1, Math.round(vw * scale));
        const height = Math.max(1, Math.round(vh * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish({ posterBlob: null, posterPreviewUrl: generateFallbackVideoPoster() });
          return;
        }
        ctx.drawImage(video, 0, 0, width, height);
        const preview = canvas.toDataURL('image/jpeg', 0.78);
        canvas.toBlob(
          (blob) => {
            finish({
              posterBlob: blob,
              posterPreviewUrl: preview || generateFallbackVideoPoster(),
            });
          },
          'image/jpeg',
          0.82
        );
      } catch {
        finish({ posterBlob: null, posterPreviewUrl: generateFallbackVideoPoster() });
      }
    };

    video.onloadeddata = () => {
      if (video.duration && video.duration > 0.25) {
        video.currentTime = Math.min(0.3, video.duration * 0.1);
      } else {
        captureFrame();
      }
    };

    video.onseeked = () => captureFrame();
    video.onerror = () =>
      finish({ posterBlob: null, posterPreviewUrl: generateFallbackVideoPoster() });
    video.src = objectUrl;
  });
}

export function isVideoFile(file: File): boolean {
  if (file.type.startsWith('video/')) return true;
  return /\.(mp4|webm|mov|m4v|ogg|ogv)$/i.test(file.name);
}

export async function processVideoFile(file: File): Promise<ProcessedVideoResult> {
  if (file.size > MAX_VIDEO_RAW_BYTES) {
    throw new Error(
      `Video "${file.name}" is ${formatBytes(file.size)}. Maximum upload size is 50 MB.`
    );
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const { posterBlob, posterPreviewUrl } = await captureVideoPoster(objectUrl);
    const mimeType = (file.type || 'video/mp4').slice(0, MAX_LENGTHS.mimeType);

    return {
      videoFile: file,
      posterBlob,
      posterPreviewUrl,
      mimeType,
      byteLength: file.size,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function uploadMediaToServer(params: {
  file: Blob;
  filename: string;
  contentType: string;
  kind: 'image' | 'video' | 'audio';
  idToken: string;
}): Promise<UploadedMediaResponse> {
  const res = await fetch('/api/media/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.idToken}`,
      'Content-Type': params.contentType || 'application/octet-stream',
      'x-file-name': encodeURIComponent(params.filename),
      'x-media-kind': params.kind,
    },
    body: params.file,
  });

  if (!res.ok) {
    let errText = `Media upload failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) errText = data.error;
    } catch {
      // Ignore parse failure
    }
    throw new Error(errText);
  }

  return (await res.json()) as UploadedMediaResponse;
}

export async function deleteServerMediaUrl(
  mediaUrl: string | undefined,
  idToken: string
): Promise<void> {
  if (!mediaUrl || !mediaUrl.startsWith('/media/')) return;
  const filename = mediaUrl.slice('/media/'.length).split('?')[0];
  if (!filename || !/^[a-zA-Z0-9._-]+$/.test(filename)) return;

  await fetch(`/api/media/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  }).catch(() => undefined);
}

export function isVideoItem(
  item?: Pick<PhotoItem, 'mediaType' | 'videoData' | 'chunkCount' | 'imageData'> | null
): boolean {
  if (!item) return false;
  if (item.mediaType === 'video') return true;
  if ((item.chunkCount ?? 0) > 0) return true;
  if (item.videoData && item.videoData.trim().length > 0) return true;
  return isDirectVideoUrl(item.imageData);
}

export function isDirectVideoUrl(value: string): boolean {
  const trimmed = (value || '').trim().toLowerCase();
  if (!trimmed) return false;
  if (trimmed.startsWith('data:video/')) return true;
  return /\.(mp4|webm|mov|m4v|ogg|ogv)(\?.*)?$/i.test(trimmed);
}

export function getYouTubeEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    let videoId: string | null = null;
    if (host === 'youtu.be') {
      videoId = parsed.pathname.slice(1).split('/')[0] || null;
    } else if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (parsed.pathname.startsWith('/shorts/')) {
        videoId = parsed.pathname.split('/')[2] || null;
      } else if (parsed.pathname.startsWith('/embed/')) {
        videoId = parsed.pathname.split('/')[2] || null;
      } else {
        videoId = parsed.searchParams.get('v');
      }
    }
    if (!videoId || !/^[a-zA-Z0-9_-]{6,20}$/.test(videoId)) return null;
    return `https://www.youtube.com/embed/${videoId}?autoplay=1&loop=1&playlist=${videoId}&rel=0`;
  } catch {
    return null;
  }
}

export function isValidImageInput(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_LENGTHS.imageData) return false;
  return (
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('data:video/') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('/')
  );
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  const kb = Math.max(1, Math.round(bytes / 1024));
  return `${kb} KB`;
}

export function isAudioFile(file: File): boolean {
  if (file.type.startsWith('audio/')) return true;
  return /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|weba|webm)$/i.test(file.name);
}

export function isValidAudioUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_LENGTHS.bgMusicUrl) return false;
  return (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('/')
  );
}

function readAudioDurationSeconds(objectUrl: string): Promise<number> {
  return new Promise((resolve) => {
    const audio = document.createElement('audio');
    audio.preload = 'metadata';

    let settled = false;
    const finish = (secs: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      audio.removeAttribute('src');
      audio.load();
      resolve(Number.isFinite(secs) && secs > 0 ? Math.min(7200, Math.round(secs)) : 0);
    };

    const timer = window.setTimeout(() => finish(0), 3000);
    audio.onloadedmetadata = () => finish(audio.duration);
    audio.onerror = () => finish(0);
    audio.src = objectUrl;
  });
}

export async function processAudioFile(file: File): Promise<ProcessedAudioResult> {
  if (!isAudioFile(file)) {
    throw new Error(`"${file.name}" does not appear to be a supported audio file.`);
  }
  if (file.size > MAX_AUDIO_RAW_BYTES) {
    throw new Error(
      `Audio "${file.name}" is ${formatBytes(file.size)}. Maximum upload size is 50 MB.`
    );
  }

  const previewObjectUrl = URL.createObjectURL(file);
  const durationSeconds = await readAudioDurationSeconds(previewObjectUrl);
  const mimeType = (file.type || 'audio/mpeg').slice(0, MAX_LENGTHS.bgMusicMimeType);

  const defaultTitle =
    file.name
      .replace(/\.[^.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .trim()
      .slice(0, MAX_LENGTHS.bgMusicTitle) || 'Our Royal Soundtrack';

  return {
    audioFile: file,
    previewObjectUrl,
    mimeType,
    byteLength: file.size,
    durationSeconds,
    defaultTitle,
  };
}

export function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
