/**
 * Opening and closing the camera. Photos ask for the sharpest 4:3 frame the
 * camera gives (capped later at 2560 px); videos ask for 720p, which keeps a
 * 15-second clip near 5 MB (docs/DECISIONS.md, D5).
 */
export type CaptureMode = 'photo' | 'video';
export type Facing = 'user' | 'environment';

/** H.264 in MP4, in order of preference. WebM is never used: desktop Safari cannot play it. */
const RECORDER_TYPES = ['video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4'];

export function recorderType(): string | null {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return null;
  return RECORDER_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

/** Whether a live camera can be used here at all (it needs HTTPS and a browser that offers it). */
export function liveCameraAvailable(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;
}

export async function openCamera(mode: CaptureMode, facing: Facing): Promise<MediaStream> {
  const video: MediaTrackConstraints =
    mode === 'photo'
      ? { facingMode: facing, width: { ideal: 2560 }, height: { ideal: 1920 } }
      : { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } };
  return navigator.mediaDevices.getUserMedia({ video, audio: mode === 'video' });
}

export function closeCamera(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

/** "NotAllowedError" means the person (or a setting) refused the camera. */
export function isPermissionRefusal(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
}
