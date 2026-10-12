/**
 * IDs are made here, on the iPad, never on the server: `{device}-{ULID}`.
 * The device prefix makes two iPads' ids structurally unable to collide; the
 * ULID sorts by time. Monotonic, so two ids made in the same millisecond
 * still sort in the order they were made.
 */
import { monotonicFactory } from 'ulid';
import type { DeviceId } from './types';

const nextUlid = monotonicFactory();

export function newId(device: DeviceId): string {
  return `${device}-${nextUlid()}`;
}
