import { MAX_LENGTHS, type PhotoItem } from '../types/kingdom';

export const MAX_VIDEO_RAW_BYTES = 9 * 1024 * 1024;
export const MAX_AUDIO_RAW_BYTES = 9 * 1024 * 1024;
const VIDEO_CHUNK_CHAR_SIZE = 650000;
const AUDIO_CHUNK_CHAR_SIZE = 650000;

export interface CompressedImageResult {
  dataUrl: string;
  byteLength: number;
  width: number;
  height: number;
}

export interface ProcessedVideoResult {
  videoDataUrl: string;
  posterDataUrl: string;
  mimeType: string;
  byteLength: number;
  chunks: string[];
  inlineVideoData?: string;
}

export interface ProcessedAudioResult {
  audioDataUrl: string;
  mimeType: string;
  byteLength: number;
  durationSeconds: number;
  chunks: string[];
  defaultTitle: string;
}

/**
 * Compresses an uploaded image file onto a canvas and produces a base64 JPEG
 * data URL guaranteed to stay comfortably beneath Firestore's 800KB field limit.
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

    const maxDim = 1350;
    const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
    let width = Math.max(1, Math.round(img.width * scale));
    let height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context is unavailable in this browser.');
    }

    const qualities = [0.84, 0.72, 0.6, 0.48];
    let bestDataUrl = '';

    for (let attempt = 0; attempt < qualities.length; attempt++) {
      canvas.width = width;
      canvas.height = height;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      const candidate = canvas.toDataURL('image/jpeg', qualities[attempt]);
      bestDataUrl = candidate;

      if (candidate.length <= MAX_LENGTHS.imageData - 40000) {
        return {
          dataUrl: candidate,
          byteLength: candidate.length,
          width,
          height,
        };
      }

      width = Math.max(320, Math.round(width * 0.8));
      height = Math.max(320, Math.round(height * 0.8));
    }

    if (bestDataUrl.length > MAX_LENGTHS.imageData) {
      throw new Error('Compressed image still exceeds storage size limit. Please choose a smaller photo.');
    }

    return {
      dataUrl: bestDataUrl,
      byteLength: bestDataUrl.length,
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

async function captureVideoPoster(objectUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';

    let settled = false;
    const finish = (poster: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      resolve(poster);
    };

    const timer = window.setTimeout(() => {
      finish(generateFallbackVideoPoster());
    }, 3500);

    const captureFrame = () => {
      try {
        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 360;
        const scale = Math.min(1, 720 / Math.max(vw, vh));
        const width = Math.max(1, Math.round(vw * scale));
        const height = Math.max(1, Math.round(vh * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish(generateFallbackVideoPoster());
          return;
        }
        ctx.drawImage(video, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
        if (dataUrl && dataUrl.length < MAX_LENGTHS.imageData) {
          finish(dataUrl);
        } else {
          finish(generateFallbackVideoPoster());
        }
      } catch {
        finish(generateFallbackVideoPoster());
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
    video.onerror = () => finish(generateFallbackVideoPoster());
    video.src = objectUrl;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Unable to read the selected video file.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read video file from device.'));
    reader.readAsDataURL(file);
  });
}

export function isVideoFile(file: File): boolean {
  if (file.type.startsWith('video/')) return true;
  return /\.(mp4|webm|mov|m4v|ogg|ogv)$/i.test(file.name);
}

export async function processVideoFile(file: File): Promise<ProcessedVideoResult> {
  if (file.size > MAX_VIDEO_RAW_BYTES) {
    throw new Error(
      `Video "${file.name}" is ${formatBytes(file.size)}. Please choose a clip under 9 MB or paste a direct video URL.`
    );
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const [posterDataUrl, videoDataUrl] = await Promise.all([
      captureVideoPoster(objectUrl),
      readFileAsDataUrl(file),
    ]);

    const mimeType = (file.type || 'video/mp4').slice(0, MAX_LENGTHS.mimeType);

    if (videoDataUrl.length <= MAX_LENGTHS.videoData) {
      return {
        videoDataUrl,
        posterDataUrl,
        mimeType,
        byteLength: file.size,
        chunks: [],
        inlineVideoData: videoDataUrl,
      };
    }

    const chunks: string[] = [];
    for (let offset = 0; offset < videoDataUrl.length; offset += VIDEO_CHUNK_CHAR_SIZE) {
      chunks.push(videoDataUrl.slice(offset, offset + VIDEO_CHUNK_CHAR_SIZE));
    }

    if (chunks.length > MAX_LENGTHS.maxVideoChunks) {
      throw new Error(
        `Video "${file.name}" exceeds the maximum encoded size. Please use a shorter clip or paste a direct video URL.`
      );
    }

    return {
      videoDataUrl,
      posterDataUrl,
      mimeType,
      byteLength: file.size,
      chunks,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
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
  return trimmed.startsWith('https://') || trimmed.startsWith('http://');
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
      `Audio "${file.name}" is ${formatBytes(file.size)}. Please choose an audio file under 9 MB or paste a direct HTTPS audio URL.`
    );
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const [durationSeconds, audioDataUrl] = await Promise.all([
      readAudioDurationSeconds(objectUrl),
      readFileAsDataUrl(file),
    ]);

    const mimeType = (file.type || 'audio/mpeg').slice(0, MAX_LENGTHS.bgMusicMimeType);
    const chunks: string[] = [];
    for (let offset = 0; offset < audioDataUrl.length; offset += AUDIO_CHUNK_CHAR_SIZE) {
      chunks.push(audioDataUrl.slice(offset, offset + AUDIO_CHUNK_CHAR_SIZE));
    }

    if (chunks.length > MAX_LENGTHS.maxMusicChunks) {
      throw new Error(
        `Audio "${file.name}" exceeds the maximum encoded size. Please use a shorter or compressed MP3/M4A file.`
      );
    }

    const defaultTitle =
      file.name
        .replace(/\.[^.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .trim()
        .slice(0, MAX_LENGTHS.bgMusicTitle) || 'Our Royal Soundtrack';

    return {
      audioDataUrl,
      mimeType,
      byteLength: file.size,
      durationSeconds,
      chunks,
      defaultTitle,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
