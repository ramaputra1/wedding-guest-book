/**
 * IDs are `{device_id}-{ULID}`, generated on the iPad, never here. The server
 * only checks their shape and reads the time a ULID carries.
 */
import type { DeviceId } from '../src/lib/types';

// Crockford base32: no I, L, O or U.
const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ID_PATTERN = /^(ipad1|ipad2)-([0-9A-HJKMNP-TV-Z]{26})$/;

export function parseId(value: unknown): { deviceId: DeviceId; ulid: string } | null {
  if (typeof value !== 'string') return null;
  const match = ID_PATTERN.exec(value);
  if (!match) return null;
  return { deviceId: match[1] as DeviceId, ulid: match[2] };
}

/** The millisecond timestamp in a ULID's first ten characters. */
export function ulidTime(ulid: string): number {
  let time = 0;
  for (const char of ulid.slice(0, 10)) time = time * 32 + ULID_ALPHABET.indexOf(char);
  return time;
}

// Device clocks drift; a little future is tolerated, more is a bad clock or a forged id.
const MAX_FUTURE_MS = 10 * 60_000;
const EARLIEST = Date.UTC(2026, 0, 1);

/** The capture time an id claims, if it is plausible. */
export function idTime(ulid: string, now = Date.now()): number | null {
  const time = ulidTime(ulid);
  return time >= EARLIEST && time <= now + MAX_FUTURE_MS ? time : null;
}
