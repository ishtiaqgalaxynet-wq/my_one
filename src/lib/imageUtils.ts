import { MAX_LENGTHS } from '../types/kingdom';

export interface CompressedImageResult {
  dataUrl: string;
  byteLength: number;
  width: number;
  height: number;
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

export function isValidImageInput(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_LENGTHS.imageData) return false;
  return (
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('/')
  );
}

export function formatBytes(chars: number): string {
  const kb = Math.max(1, Math.round(chars / 1024));
  return `${kb} KB`;
}
