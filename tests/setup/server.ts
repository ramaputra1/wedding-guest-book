/**
 * Starts the real Pages Functions under `wrangler pages dev`, against a fresh
 * local D1 + R2 in a temporary folder, with secrets passed as bindings —
 * never read from .dev.vars, so the owner's real values are never involved.
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = process.cwd();
const WRANGLER = join(ROOT, 'node_modules', '.bin', 'wrangler');
const QUIET_ENV = { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1' };

export interface ServerSecrets {
  signingKey: string;
  passphraseHash: string;
}

export interface TestServer {
  url: string;
  stop(): Promise<void>;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => (typeof address === 'object' && address ? resolve(address.port) : reject(new Error('no port'))));
    });
  });
}

/** A new, empty local D1 + R2 with the migration applied. */
export function freshState(): { dir: string; remove(): void } {
  const dir = mkdtempSync(join(tmpdir(), 'guestbook-state-'));
  execFileSync(WRANGLER, ['d1', 'migrations', 'apply', 'wedding-guestbook', '--local', '--persist-to', dir], {
    cwd: ROOT,
    env: QUIET_ENV,
    stdio: 'pipe',
  });
  return { dir, remove: () => rmSync(dir, { recursive: true, force: true }) };
}

export async function startServer(secrets: ServerSecrets, persistDir: string): Promise<TestServer> {
  const port = await freePort();
  const assets = mkdtempSync(join(tmpdir(), 'guestbook-assets-'));
  writeFileSync(join(assets, 'index.html'), '<!doctype html><title>test</title>');

  const child = spawn(
    WRANGLER,
    [
      'pages', 'dev', assets,
      '--port', String(port),
      '--ip', '127.0.0.1',
      '--persist-to', persistDir,
      '--show-interactive-dev-session=false',
      '--binding', `SESSION_SIGNING_KEY=${secrets.signingKey}`,
      '--binding', `WRITER_PASSPHRASE_HASH=${secrets.passphraseHash}`,
    ],
    { cwd: ROOT, env: QUIET_ENV, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let log = '';
  child.stdout.on('data', (chunk: Buffer) => (log += chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => (log += chunk.toString()));

  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 120_000;
  while (true) {
    if (child.exitCode !== null) throw new Error(`wrangler exited early:\n${log}`);
    try {
      if ((await fetch(`${url}/api/entries`)).ok) break;
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) {
      child.kill('SIGKILL');
      throw new Error(`wrangler did not start within 120 s:\n${log}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return {
    url,
    stop: () =>
      new Promise<void>((resolve) => {
        if (child.exitCode !== null) return resolve();
        child.once('exit', () => {
          rmSync(assets, { recursive: true, force: true });
          resolve();
        });
        child.kill('SIGTERM');
      }),
  };
}

/** Random secrets for one test run, in the shapes the server expects. */
export function randomSigningKey(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
}
