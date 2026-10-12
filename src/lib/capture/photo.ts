/**
 * Turns a camera frame or a picked image into the two files a photo is
 * stored as: the photo itself (long edge ≤ 2560 px, JPEG ~0.85, ≈1 MB) and a
 * thumbnail for the album (long edge 640 px, ≈40 KB).
 */
export const PHOTO_MAX_EDGE = 2560;
const PHOTO_QUALITY = 0.85;
export const THUMB_MAX_EDGE = 640;
const THUMB_QUALITY = 0.72;

export interface CapturedPhoto {
  original: Blob;
  thumb: Blob;
  width: number;
  height: number;
}

export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export function toJpeg(source: CanvasImageSource, width: number, height: number, quality: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return Promise.reject(new Error('This browser cannot draw images.'));
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The image could not be encoded.'))), 'image/jpeg', quality),
  );
}

/** The photo and its thumbnail from any drawable source of the given size. */
export async function encodePhoto(source: CanvasImageSource, sourceWidth: number, sourceHeight: number): Promise<CapturedPhoto> {
  const full = fitWithin(sourceWidth, sourceHeight, PHOTO_MAX_EDGE);
  const small = fitWithin(sourceWidth, sourceHeight, THUMB_MAX_EDGE);
  const [original, thumb] = await Promise.all([
    toJpeg(source, full.width, full.height, PHOTO_QUALITY),
    toJpeg(source, small.width, small.height, THUMB_QUALITY),
  ]);
  return { original, thumb, width: full.width, height: full.height };
}

/** The current frame of a live camera preview. Never mirrored: the photo shows the room as it is. */
export function photoFromVideo(video: HTMLVideoElement): Promise<CapturedPhoto> {
  if (!video.videoWidth || !video.videoHeight) return Promise.reject(new Error('The camera has not started yet.'));
  return encodePhoto(video, video.videoWidth, video.videoHeight);
}

/** A photo picked through the native camera (the fallback), turned upright by its EXIF orientation. */
export async function photoFromFile(file: Blob): Promise<CapturedPhoto> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    return await encodePhoto(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}
