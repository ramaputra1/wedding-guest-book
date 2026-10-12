/** Small byte helpers shared by session signing and passphrase hashing. */

const encoder = new TextEncoder();

// Typed as ArrayBuffer-backed: that is what Web Crypto accepts as a BufferSource.
export type Bytes = Uint8Array<ArrayBuffer>;

export function utf8(text: string): Bytes {
  // Copied so the type is ArrayBuffer-backed in both the Workers and DOM typings.
  return new Uint8Array(encoder.encode(text));
}

export function toBase64Url(bytes: Uint8Array | ArrayBuffer): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Returns null for anything that is not valid base64url, rather than throwing. */
export function fromBase64Url(text: string): Bytes | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  try {
    const binary = atob(padded);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

/**
 * Compares two byte arrays in time that depends only on their length, never
 * on where they first differ — so a caller cannot learn a secret byte by byte
 * from response timing.
 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}
