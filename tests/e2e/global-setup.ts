/**
 * Starts the built site (dist/) with the real Functions on a fresh database,
 * using a passphrase and signing key made up for this run.
 */
import { existsSync } from 'node:fs';
import { hashPassphrase } from '../../lib-server/passphrase';
import { freshState, randomSigningKey, startServer } from '../setup/server';

export default async function globalSetup() {
  if (!existsSync('dist/ipad1/index.html')) throw new Error('Build the site first: npm run build');
  const passphrase = `e2e passphrase ${crypto.randomUUID()}`;
  const state = freshState();
  const server = await startServer({ signingKey: randomSigningKey(), passphraseHash: await hashPassphrase(passphrase) }, state.dir, 'dist');
  // Workers inherit the environment set here.
  process.env.E2E_BASE_URL = server.url;
  process.env.E2E_PASSPHRASE = passphrase;
  // The server's local D1 + R2, for the archive viewer test's export.
  process.env.E2E_STATE_DIR = state.dir;
  return async () => {
    await server.stop();
    state.remove();
  };
}
