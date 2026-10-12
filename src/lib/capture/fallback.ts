/**
 * The native camera, through <input type="file" capture>, for when the live
 * camera cannot be used: no getUserMedia, no MP4 recording, or the camera
 * permission was refused. It must be opened from a tap.
 */
import type { Facing } from './camera';
import type { VideoContainer } from '../types';

export function pickFromNativeCamera(kind: 'photo' | 'video', facing: Facing): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = kind === 'photo' ? 'image/*' : 'video/*';
    input.setAttribute('capture', facing);
    input.style.display = 'none';
    input.addEventListener('change', () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    });
    // Closing the camera without choosing fires "cancel" where supported.
    input.addEventListener('cancel', () => {
      resolve(null);
      input.remove();
    });
    document.body.append(input);
    input.click();
  });
}

/** Which container a picked video is really in, judged by its bytes. */
export async function videoContainerOf(file: Blob): Promise<VideoContainer | null> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const box = String.fromCharCode(...head.slice(4, 8));
  const brand = String.fromCharCode(...head.slice(8, 12));
  if (box !== 'ftyp') return null;
  return brand === 'qt  ' ? 'mov' : 'mp4';
}
