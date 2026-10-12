/**
 * The two writer devices. A plain value, not a secret: shared by the client
 * (routes, labels) and the server (validation), so it lives on the client
 * side of the boundary — src/ may be imported by functions/, never the reverse
 * for lib-server/.
 */
import type { DeviceId } from './types';

export const DEVICE_IDS: readonly DeviceId[] = ['ipad1', 'ipad2'];

export function isDeviceId(value: unknown): value is DeviceId {
  return typeof value === 'string' && (DEVICE_IDS as readonly string[]).includes(value);
}
