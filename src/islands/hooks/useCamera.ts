import { useEffect, useState } from 'preact/hooks';
import { closeCamera, isPermissionRefusal, liveCameraAvailable, openCamera, type CaptureMode, type Facing } from '../../lib/capture/camera';

export type CameraProblem = 'refused' | 'unavailable' | null;

interface Options {
  /** On only while the iPad is signed in, the rail is open and the page is visible. */
  active: boolean;
  mode: CaptureMode;
  facing: Facing;
  /** Never swap streams in the middle of a recording. */
  locked: boolean;
}

/**
 * The live camera stream. Off whenever it is not needed — rail closed, page
 * hidden — for the battery and for the guests' privacy. A refusal is
 * remembered for the session; the native camera takes over (lib/capture/fallback).
 */
export function useCamera({ active, mode, facing, locked }: Options) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [problem, setProblem] = useState<CameraProblem>(liveCameraAvailable() ? null : 'unavailable');
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const update = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  const wanted = active && visible && problem === null;

  useEffect(() => {
    if (locked) return;
    if (!wanted) {
      setStream(null);
      return;
    }
    let cancelled = false;
    let opened: MediaStream | null = null;
    // The previous stream is being closed: never let anything record from it.
    setStream(null);
    openCamera(mode, facing)
      .then((next) => {
        if (cancelled) return closeCamera(next);
        opened = next;
        setStream(next);
      })
      .catch((error: unknown) => {
        if (!cancelled) setProblem(isPermissionRefusal(error) ? 'refused' : 'unavailable');
      });
    return () => {
      cancelled = true;
      closeCamera(opened);
    };
    // `locked` is deliberately not a dependency: unlocking must not restart the camera.
  }, [wanted, mode, facing]);

  /** Wanted but not delivered yet: the shutter waits rather than guessing. */
  const starting = wanted && stream === null;
  return { stream, problem, starting };
}
