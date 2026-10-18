import type { TestProject } from 'vitest/node';
import { hashPassphrase } from '../../lib-server/passphrase';
import { freshState, randomSigningKey, startServer } from './server';

declare module 'vitest' {
  export interface ProvidedContext {
    baseUrl: string;
    signingKey: string;
    passphrase: string;
    passphraseHash: string;
    /** The server's local D1 + R2 folder, for tests that use wrangler directly (the archive drill). */
    stateDir: string;
  }
}

export default async function setup(project: TestProject) {
  const signingKey = randomSigningKey();
  const passphrase = `test passphrase ${crypto.randomUUID()}`;
  const passphraseHash = await hashPassphrase(passphrase);
  const state = freshState();
  const server = await startServer({ signingKey, passphraseHash }, state.dir);

  project.provide('baseUrl', server.url);
  project.provide('signingKey', signingKey);
  project.provide('passphrase', passphrase);
  project.provide('passphraseHash', passphraseHash);
  project.provide('stateDir', state.dir);

  return async () => {
    await server.stop();
    state.remove();
  };
}
