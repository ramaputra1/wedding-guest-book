import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { AlbumCopy } from '../config/site';
import { getAlbum, getSession, getStats } from '../lib/api';
import { recorderType, type CaptureMode, type Facing } from '../lib/capture/camera';
import { pickFromNativeCamera, videoContainerOf } from '../lib/capture/fallback';
import { photoFromFile, photoFromVideo, type CapturedPhoto } from '../lib/capture/photo';
import { startRecording, videoStills, type RecordingControl } from '../lib/capture/video';
import { newId } from '../lib/ids';
import type { QueueItem } from '../lib/queue/store';
import type { AlbumEntry, AlbumMedia, AlbumMode, ApiStats, DeviceId, VideoContainer } from '../lib/types';
import { Album, NEW_SPREAD_ID } from './album/Album';
import { MediaViewer } from './album/MediaViewer';
import { CameraRail } from './CameraRail';
import { useCamera } from './hooks/useCamera';
import { useUploader } from './hooks/useUploader';
import { mergeAlbum } from './merge';
import { SignIn } from './SignIn';

interface Props {
  mode: AlbumMode;
  /** Write mode only: which iPad this page is. Identity, not permission. */
  deviceId?: DeviceId;
  /** Write mode only: how that iPad is named on screen, e.g. "iPad 1". */
  deviceLabel?: string;
  /** Write mode only: which camera faces the guests. */
  facing?: Facing;
  /** The video cap, from the same setting the server enforces. */
  maxVideoMs?: number;
  /** Self-timer choices for photos, in seconds; the first is the default. */
  photoTimers?: readonly number[];
  intro: string;
  copy: AlbumCopy;
}

type Auth = 'checking' | 'signed-out' | 'signed-in';

interface Capture {
  kind: 'photo' | 'video';
  original: Blob;
  thumb: Blob;
  poster?: Blob;
  width: number;
  height: number;
  durationMs?: number;
  container?: VideoContainer;
}

// The queue is "piling up" past any of these: the wifi is not keeping pace,
// and iOS gives a site roughly 1 GB of storage in all.
const WARN_QUEUE_BYTES = 250_000_000;
const WARN_QUEUE_ITEMS = 25;
const WARN_STORAGE_SHARE = 0.6;
const SAVED_FLASH_MS = 1_500;
/** After a capture the guest sees it land before the viewfinder returns. */
const REVIEW_MS = 2_500;
const STATS_REFRESH_MS = 60_000;

/**
 * The one island. On `/` it renders the album read-only and opens items
 * full-size; on /ipad1 and /ipad2 it adds sign-in, the camera, the upload
 * queue and the rail. Whether a write is allowed is decided by the server on
 * every request — nothing here grants anything.
 */
export default function GuestBook({ mode, deviceId, deviceLabel, facing = 'user', maxVideoMs = 15_000, photoTimers = [3, 5], intro, copy }: Props) {
  const [entries, setEntries] = useState<AlbumEntry[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [auth, setAuth] = useState<Auth>(mode === 'write' ? 'checking' : 'signed-out');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<AlbumMedia | null>(null);

  const [railOpen, setRailOpen] = useState(true);
  const [captureMode, setCaptureMode] = useState<CaptureMode>('photo');
  const [recording, setRecording] = useState<RecordingControl | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState<ReadonlySet<string>>(new Set());
  const [announcement, setAnnouncement] = useState('');
  const [stats, setStats] = useState<ApiStats | null>(null);
  const [storageShare, setStorageShare] = useState(0);
  const previewVideo = useRef<HTMLVideoElement | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const reviewTimer = useRef<ReturnType<typeof setTimeout>>();
  const [photoTimer, setPhotoTimer] = useState(photoTimers[0]);
  /** Whole seconds left on the photo self-timer, or null when none is running. */
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownHandles = useRef<{ fire?: ReturnType<typeof setTimeout>; frame?: number }>({});

  const writing = mode === 'write' && auth === 'signed-in';

  const load = useCallback(
    async (fresh = false) => {
      try {
        setEntries(await getAlbum(copy, fresh));
        setLoadFailed(false);
      } catch {
        setLoadFailed(true);
      }
    },
    [copy],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (mode !== 'write' || !deviceId) return;
    getSession()
      // A session made on the other iPad's page does not count here: signing
      // in again relabels this browser as this page's device.
      .then((session) => {
        const signedIn = session?.deviceId === deviceId;
        setAuth(signedIn ? 'signed-in' : 'signed-out');
        if (signedIn) void load(true);
      })
      .catch(() => setAuth('signed-out'));
  }, [mode, deviceId, load]);

  const refreshStats = useCallback(() => {
    getStats().then(setStats).catch(() => undefined);
    navigator.storage
      ?.estimate?.()
      .then(({ usage = 0, quota = 0 }) => setStorageShare(quota > 0 ? usage / quota : 0))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!writing) return;
    refreshStats();
    const timer = setInterval(refreshStats, STATS_REFRESH_MS);
    return () => clearInterval(timer);
  }, [writing, refreshStats]);

  const uploads = useUploader({
    enabled: writing,
    onSaved: (item) => {
      setAnnouncement(copy.save.saved);
      setJustSaved((current) => new Set(current).add(item.entryId));
      setTimeout(
        () =>
          setJustSaved((current) => {
            const next = new Set(current);
            next.delete(item.entryId);
            return next;
          }),
        SAVED_FLASH_MS,
      );
      void load(true);
      refreshStats();
    },
    // The session expired: everything stays queued until the iPad signs in again.
    onUnauthorized: () => setAuth('signed-out'),
  });

  // Thumbnails of queued captures, shown at once, before the upload finishes.
  const [thumbUrls, setThumbUrls] = useState<ReadonlyMap<string, string>>(new Map());
  useEffect(() => {
    setThumbUrls((previous) => {
      const next = new Map<string, string>();
      for (const item of uploads.items) next.set(item.mediaId, previous.get(item.mediaId) ?? URL.createObjectURL(item.thumb));
      for (const [id, url] of previous) if (!next.has(id)) URL.revokeObjectURL(url);
      return next;
    });
  }, [uploads.items]);

  const album = useMemo(() => {
    if (mode !== 'write' || !deviceId || entries === null) return entries;
    return mergeAlbum(entries, uploads.items, thumbUrls, deviceId, { photoAlt: copy.photoAlt, videoAlt: copy.videoAlt });
  }, [mode, deviceId, entries, uploads.items, thumbUrls, copy]);

  const destinationId =
    selectedId && selectedId !== NEW_SPREAD_ID && album?.some((entry) => entry.id === selectedId) ? selectedId : NEW_SPREAD_ID;

  const recorderMime = useMemo(() => (typeof window === 'undefined' ? null : recorderType()), []);
  const camera = useCamera({ active: writing && railOpen, mode: captureMode, facing, locked: recording !== null || countdown !== null });

  // Bring the destination into view when the camera comes on or the target
  // moves, so the viewfinder is never off-screen.
  useEffect(() => {
    if (!camera.stream) return;
    const spread = document.querySelector(`[data-spread-id="${destinationId}"]`);
    if (!spread) return;
    const box = spread.getBoundingClientRect();
    if (box.top >= 0 && box.bottom <= window.innerHeight) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    spread.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  }, [camera.stream, destinationId]);

  async function enqueue(capture: Capture) {
    if (!deviceId) return;
    const isNew = destinationId === NEW_SPREAD_ID;
    const entryId = isNew ? newId(deviceId) : destinationId;
    const savedOnServer = entries?.some((entry) => entry.id === entryId) ?? false;
    const item: QueueItem = {
      mediaId: newId(deviceId),
      entryId,
      createEntry: !savedOnServer,
      ...capture,
      createdAt: Date.now(),
      stored: [],
      attempts: 0,
      nextAttemptAt: 0,
      state: 'saving',
    };
    await uploads.enqueue(item);
    // The next shots go to the same new spread, until another is chosen.
    if (isNew) setSelectedId(entryId);
    // Let the capture land in its mount before the viewfinder comes back.
    setReviewing(true);
    clearTimeout(reviewTimer.current);
    reviewTimer.current = setTimeout(() => setReviewing(false), REVIEW_MS);
  }

  // The iPad's own camera app takes over only when the live camera cannot
  // work at all — never merely because it is still starting.
  const useNativeCamera = camera.problem !== null;

  async function takePhoto() {
    let photo: CapturedPhoto;
    if (!useNativeCamera) {
      if (!camera.stream || !previewVideo.current) return;
      photo = await photoFromVideo(previewVideo.current);
    } else {
      const file = await pickFromNativeCamera('photo', facing);
      if (!file) return;
      photo = await photoFromFile(file);
    }
    await enqueue({ kind: 'photo', ...photo });
  }

  async function recordVideo() {
    if (recording) {
      recording.stop();
      return;
    }
    if (!useNativeCamera && recorderMime) {
      if (!camera.stream) return;
      const control = startRecording(camera.stream, recorderMime, maxVideoMs, setProgress);
      setRecording(control);
      try {
        const take = await control.done;
        setBusy(true);
        const stills = await videoStills(take.blob);
        await enqueue({
          kind: 'video',
          original: take.blob,
          container: 'mp4',
          thumb: stills.thumb,
          poster: stills.poster,
          width: stills.width,
          height: stills.height,
          durationMs: Math.min(maxVideoMs, stills.durationMs ?? take.durationMs),
        });
      } finally {
        setRecording(null);
        setProgress(0);
      }
      return;
    }
    // No live recording here: the iPad's own camera app records instead.
    const file = await pickFromNativeCamera('video', facing);
    if (!file) return;
    setBusy(true);
    const stills = await videoStills(file);
    await enqueue({
      kind: 'video',
      original: file,
      container: (await videoContainerOf(file)) ?? 'mp4',
      thumb: stills.thumb,
      poster: stills.poster,
      width: stills.width,
      height: stills.height,
      // The server reads the real length from the file; this is only the claim.
      durationMs: stills.durationMs ?? 1,
    });
  }

  function cancelCountdown() {
    clearTimeout(countdownHandles.current.fire);
    cancelAnimationFrame(countdownHandles.current.frame ?? 0);
    countdownHandles.current = {};
    setCountdown(null);
    setProgress(0);
  }

  async function snap() {
    try {
      setBusy(true);
      await takePhoto();
    } catch (error) {
      setAnnouncement(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Photos are always taken on a self-timer, so a guest can put the iPad
   * down and pose. The photo is fired by its own timeout; the animation frame
   * only draws the countdown, so a slow frame can never delay the shot.
   */
  function startCountdown(seconds: number) {
    const totalMs = seconds * 1000;
    const startedAt = performance.now();
    setCountdown(seconds);
    setAnnouncement(`${copy.camera.photoIn} ${seconds} ${copy.camera.seconds}`);
    const draw = () => {
      const elapsed = performance.now() - startedAt;
      setProgress(Math.min(1, elapsed / totalMs));
      setCountdown(Math.max(1, Math.ceil((totalMs - elapsed) / 1000)));
      countdownHandles.current.frame = requestAnimationFrame(draw);
    };
    countdownHandles.current.frame = requestAnimationFrame(draw);
    countdownHandles.current.fire = setTimeout(() => {
      cancelCountdown();
      void snap();
    }, totalMs);
  }

  // The camera went away mid-countdown (rail closed, page hidden): no surprise photo later.
  useEffect(() => {
    if (!camera.stream && countdown !== null) cancelCountdown();
  }, [camera.stream, countdown]);

  async function onShutter() {
    if (captureMode === 'photo') {
      if (countdown !== null) return cancelCountdown();
      // The iPad's own camera app has its own timer.
      if (useNativeCamera) return snap();
      if (camera.stream) startCountdown(photoTimer);
      return;
    }
    try {
      await recordVideo();
    } catch (error) {
      setAnnouncement(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  const onDiscard = (mediaId: string) => {
    if (window.confirm(copy.save.confirmRemove)) void uploads.discard(mediaId);
  };

  const onSignedIn = () => {
    setAuth('signed-in');
    // Signed out, this page may have been shown the public cached copy; now read it fresh.
    void load(true);
  };

  const toggleSelection = (id: string) => setSelectedId((current) => (current === id ? null : id));

  const livePreview =
    camera.stream && writing
      ? {
          spreadId: destinationId,
          preview: {
            stream: camera.stream,
            mirrored: facing === 'user',
            aspect: (() => {
              const settings = camera.stream.getVideoTracks()[0]?.getSettings();
              return settings?.width && settings?.height ? settings.width / settings.height : captureMode === 'photo' ? 4 / 3 : 16 / 9;
            })(),
            reviewing,
            countdown: countdown ?? undefined,
            onVideo: (video: HTMLVideoElement | null) => {
              previewVideo.current = video;
            },
          },
        }
      : undefined;

  const albumView = (
    <Album
      entries={album}
      loadFailed={loadFailed}
      mode={writing ? 'write' : 'view'}
      intro={intro}
      selectedId={selectedId}
      onSelect={toggleSelection}
      live={livePreview}
      justSaved={justSaved}
      onOpen={mode === 'view' ? setViewing : undefined}
      onRetry={uploads.retry}
      onDiscard={onDiscard}
      copy={copy}
    />
  );

  if (mode === 'view') {
    return (
      <>
        {albumView}
        {viewing && <MediaViewer item={viewing} onClose={() => setViewing(null)} copy={copy.viewer} />}
      </>
    );
  }

  if (!writing) {
    return (
      <div class="album writer__album">
        {auth === 'signed-out' && deviceId && (
          <SignIn deviceId={deviceId} deviceLabel={deviceLabel ?? deviceId} copy={copy.signIn} onSignedIn={onSignedIn} />
        )}
        {albumView}
      </div>
    );
  }

  const destinationIndex = (album ?? []).findIndex((entry) => entry.id === destinationId);
  const destination = destinationId === NEW_SPREAD_ID || destinationIndex < 0 ? copy.newSpread : `${copy.spread} ${destinationIndex + 1}`;
  const queueBytes = uploads.items.reduce((sum, item) => sum + item.original.size + item.thumb.size + (item.poster?.size ?? 0), 0);
  const notices: string[] = [];
  if (queueBytes > WARN_QUEUE_BYTES || uploads.items.length >= WARN_QUEUE_ITEMS || storageShare > WARN_STORAGE_SHARE) {
    notices.push(copy.camera.storageWarning);
  }
  if (camera.problem === 'refused') notices.push(copy.camera.cameraRefused);
  if (camera.problem === 'unavailable') notices.push(copy.camera.cameraUnavailable);

  return (
    <div class="writer">
      <CameraRail
        open={railOpen}
        onToggle={() => setRailOpen(!railOpen)}
        mode={captureMode}
        onMode={setCaptureMode}
        recording={recording !== null}
        counting={countdown !== null}
        timer={photoTimer}
        timers={photoTimers}
        onTimer={setPhotoTimer}
        progress={progress}
        busy={busy || camera.starting}
        onShutter={onShutter}
        destination={destination}
        status={{
          waiting: uploads.items.length,
          gauge: stats ? { usedBytes: stats.bytesUsed, allowanceBytes: stats.bytesAllowance } : null,
        }}
        copy={copy.camera}
      />
      <div class="album writer__album">
        {notices.length > 0 && (
          <div class="writer__notices" role="status">
            {notices.map((notice) => (
              <p key={notice} class="notice">
                {notice}
              </p>
            ))}
          </div>
        )}
        {albumView}
      </div>
      {/* Saves and capture problems, announced without moving focus. */}
      <p class="visually-hidden" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
