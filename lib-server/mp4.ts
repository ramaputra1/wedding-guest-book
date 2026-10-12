/**
 * Reads a video's duration from the file itself, so the 15-second cap does not
 * rest on what the iPad claims.
 *
 * MP4 and QuickTime files are a sequence of boxes: [size:4][type:4][body].
 * The movie header ('mvhd', inside 'moov') holds a timescale and a duration.
 * 'moov' may come first (MediaRecorder in Chrome) or last (many cameras), so
 * the top-level boxes are walked with small range reads; nothing else of the
 * file is read. In a fragmented file mvhd may say 0, and the total is then
 * in 'mvex' → 'mehd' when the recorder wrote one.
 */

/** Reads `length` bytes at `offset`. Returns fewer at end of file. */
export type ReadRange = (offset: number, length: number) => Promise<Uint8Array>;

// A recording has a handful of top-level boxes; a fragmented one maybe a few
// dozen. Past this, give up rather than walk an adversarial file forever.
const MAX_TOP_LEVEL_BOXES = 256;
// A 15-second clip's moov is a few KB to a few hundred KB.
const MAX_MOOV_BYTES = 4_000_000;

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const typeAt = (bytes: Uint8Array, at: number) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);

interface BoxHeader {
  type: string;
  size: number;
  headerSize: number;
}

function header(bytes: Uint8Array, at: number, remaining: number): BoxHeader | null {
  if (bytes.length < at + 8) return null;
  const v = view(bytes);
  let size = v.getUint32(at);
  const type = typeAt(bytes, at + 4);
  let headerSize = 8;
  if (size === 1) {
    if (bytes.length < at + 16) return null;
    size = Number(v.getBigUint64(at + 8));
    headerSize = 16;
  } else if (size === 0) {
    size = remaining;
  }
  if (size < headerSize) return null;
  return { type, size, headerSize };
}

/** Duration in ms from an 'mvhd' or 'mehd' body, or null. */
function readMvhd(bytes: Uint8Array, at: number): { timescale: number; duration: number } | null {
  const v = view(bytes);
  if (bytes.length < at + 32) return null;
  const version = bytes[at];
  if (version === 1) {
    if (bytes.length < at + 32) return null;
    return { timescale: v.getUint32(at + 20), duration: Number(v.getBigUint64(at + 24)) };
  }
  return { timescale: v.getUint32(at + 12), duration: v.getUint32(at + 16) };
}

function readMehd(bytes: Uint8Array, at: number): number | null {
  const v = view(bytes);
  const version = bytes[at];
  if (version === 1) return bytes.length >= at + 12 ? Number(v.getBigUint64(at + 4)) : null;
  return bytes.length >= at + 8 ? v.getUint32(at + 4) : null;
}

/** Searches a moov body for the duration. */
function durationFromMoov(moov: Uint8Array): number | null {
  let timescale = 0;
  let duration = 0;
  let fragmentDuration: number | null = null;
  let at = 0;
  while (at + 8 <= moov.length) {
    const box = header(moov, at, moov.length - at);
    if (!box) break;
    const body = at + box.headerSize;
    if (box.type === 'mvhd') {
      const mvhd = readMvhd(moov, body);
      if (mvhd) ({ timescale, duration } = mvhd);
    } else if (box.type === 'mvex') {
      let inner = body;
      const end = Math.min(at + box.size, moov.length);
      while (inner + 8 <= end) {
        const child = header(moov, inner, end - inner);
        if (!child) break;
        if (child.type === 'mehd') fragmentDuration = readMehd(moov, inner + child.headerSize);
        inner += child.size;
      }
    }
    at += box.size;
  }
  if (!timescale) return null;
  const units = duration > 0 ? duration : fragmentDuration;
  return units && units > 0 ? Math.round((units / timescale) * 1000) : null;
}

/**
 * The video's duration in milliseconds, or null when the file does not state
 * one (some fragmented recordings), so the caller falls back to the claim.
 */
export async function videoDurationMs(read: ReadRange, fileSize: number): Promise<number | null> {
  let offset = 0;
  for (let i = 0; i < MAX_TOP_LEVEL_BOXES && offset + 8 <= fileSize; i++) {
    const head = await read(offset, 16);
    const box = header(head, 0, fileSize - offset);
    if (!box) return null;
    if (box.type === 'moov') {
      const bodySize = Math.min(box.size, fileSize - offset) - box.headerSize;
      if (bodySize <= 0 || bodySize > MAX_MOOV_BYTES) return null;
      return durationFromMoov(await read(offset + box.headerSize, bodySize));
    }
    offset += box.size;
  }
  return null;
}
