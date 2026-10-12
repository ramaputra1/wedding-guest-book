/** Reading a video's duration from the file (lib-server/mp4.ts). */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { videoDurationMs, type ReadRange } from '../lib-server/mp4';

const fixture = new Uint8Array(readFileSync('tests/fixtures/fake-camera-3s.mp4'));

const reader = (bytes: Uint8Array): ReadRange => async (offset, length) => bytes.slice(offset, offset + length);

function box(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + body.length);
  new DataView(out.buffer).setUint32(0, out.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(body, 8);
  return out;
}

function mvhd(timescale: number, duration: number, version: 0 | 1 = 0): Uint8Array {
  const body = new Uint8Array(version ? 108 : 96);
  const v = new DataView(body.buffer);
  body[0] = version;
  if (version) {
    v.setUint32(20, timescale);
    v.setBigUint64(24, BigInt(duration));
  } else {
    v.setUint32(12, timescale);
    v.setUint32(16, duration);
  }
  return box('mvhd', body);
}

const join = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) (out.set(p, at), (at += p.length));
  return out;
};

const ftyp = box('ftyp', new TextEncoder().encode('isom\0\0\0\0isom'));

describe('videoDurationMs', () => {
  it("reads a real MediaRecorder recording's duration", async () => {
    const ms = await videoDurationMs(reader(fixture), fixture.length);
    expect(ms).toBeGreaterThan(2_500);
    expect(ms).toBeLessThan(3_500);
  });

  it('finds moov at the end of the file, as cameras write it', async () => {
    const file = join(ftyp, box('mdat', new Uint8Array(50_000)), box('moov', mvhd(600, 9_000)));
    expect(await videoDurationMs(reader(file), file.length)).toBe(15_000);
  });

  it('reads a version-1 (64-bit) header', async () => {
    const file = join(ftyp, box('moov', mvhd(1_000, 20_000, 1)));
    expect(await videoDurationMs(reader(file), file.length)).toBe(20_000);
  });

  it('uses mehd when a fragmented file leaves mvhd at zero', async () => {
    const mehd = box('mehd', new Uint8Array([0, 0, 0, 0, 0, 0, 0x2e, 0xe0])); // 12000
    const file = join(ftyp, box('moov', join(mvhd(1_000, 0), box('mvex', mehd))));
    expect(await videoDurationMs(reader(file), file.length)).toBe(12_000);
  });

  it('returns null rather than guessing for files that state nothing or are garbage', async () => {
    const noDuration = join(ftyp, box('moov', mvhd(1_000, 0)));
    expect(await videoDurationMs(reader(noDuration), noDuration.length)).toBeNull();
    const garbage = new Uint8Array(1_000).fill(7);
    expect(await videoDurationMs(reader(garbage), garbage.length)).toBeNull();
    const noMoov = join(ftyp, box('mdat', new Uint8Array(100)));
    expect(await videoDurationMs(reader(noMoov), noMoov.length)).toBeNull();
  });
});
