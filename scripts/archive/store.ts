/**
 * The live album's data, reached through Wrangler — the one tool that talks
 * to D1 and R2 the same way locally, on the test database and in production.
 * No SDK, no extra dependency: Wrangler is already how the project deploys.
 *
 * Remote targets authenticate as Wrangler does: `wrangler login` on the
 * owner's machine, or CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID in GitHub
 * Actions. Nothing here reads, prints or stores a credential.
 */
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export type Target = 'production' | 'test' | 'local';

export interface StoreOptions {
  target: Target;
  /** Local target only: the folder holding local D1 + R2 (wrangler's --persist-to). */
  persistTo?: string;
  /** The application repository, where wrangler.toml lives. */
  root?: string;
}

/** Names as wrangler.toml declares them (top level = production; [env.preview] = test). */
const NAMES: Record<Target, { database: string; bucket: string; env?: string }> = {
  production: { database: 'wedding-guestbook', bucket: 'wedding-media' },
  test: { database: 'wedding-guestbook-test', bucket: 'wedding-media-test', env: 'preview' },
  // Local development and the test server use the top-level names with local storage.
  local: { database: 'wedding-guestbook', bucket: 'wedding-media' },
};

export class Store {
  readonly target: Target;
  private readonly root: string;
  private readonly persistTo?: string;

  constructor({ target, persistTo, root = process.cwd() }: StoreOptions) {
    this.target = target;
    this.root = root;
    this.persistTo = persistTo;
  }

  get names() {
    return NAMES[this.target];
  }

  /**
   * How many wrangler calls may run at once. Cloudflare takes several; the
   * local simulator (the test server's storage, shared with a running
   * `wrangler pages dev`) fails overlapping writes, so locally it is one.
   */
  parallel(remote: number): number {
    return this.target === 'local' ? 1 : remote;
  }

  /** --remote, or --local with its folder; and the environment for the test database. */
  private where(): string[] {
    const flags = this.target === 'local' ? ['--local', ...(this.persistTo ? ['--persist-to', this.persistTo] : [])] : ['--remote'];
    const env = this.names.env;
    return env ? [...flags, '--env', env] : flags;
  }

  private async wrangler(args: string[]): Promise<string> {
    const bin = join(this.root, 'node_modules', '.bin', 'wrangler');
    const { stdout } = await run(bin, args, {
      cwd: this.root,
      // Stroke data can make a large answer.
      maxBuffer: 512 * 1024 * 1024,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1', CI: process.env.CI ?? '1' },
    });
    return stdout;
  }

  /**
   * Runs one read-only query and returns its rows. A table that does not
   * exist yet (its migration not applied) reads as empty.
   */
  async rows<T>(sql: string): Promise<T[]> {
    try {
      const out = await this.wrangler(['d1', 'execute', this.names.database, ...this.where(), '--json', '--command', sql]);
      const parsed = JSON.parse(out.slice(out.indexOf('['))) as Array<{ results?: T[] }>;
      return parsed.flatMap((part) => part.results ?? []);
    } catch (failure) {
      if (/no such table/i.test(fullText(failure))) return [];
      throw new Error(`Reading the database failed (${sql.split(/\s+/).slice(0, 4).join(' ')} …): ${errorText(failure)}`);
    }
  }

  /** Runs a .sql file of writes (restore only). */
  async runSqlFile(path: string): Promise<void> {
    try {
      await this.wrangler(['d1', 'execute', this.names.database, ...this.where(), '--file', path, ...(this.target === 'local' ? [] : ['--yes'])]);
    } catch (failure) {
      throw new Error(`Writing to the database failed: ${errorText(failure)}`);
    }
  }

  /** Downloads one object to a file. False when the object does not exist. */
  async getObject(key: string, file: string): Promise<boolean> {
    try {
      await this.wrangler(['r2', 'object', 'get', `${this.names.bucket}/${key}`, '--file', file, ...this.where()]);
      return true;
    } catch (failure) {
      if (/specified key does not exist|NoSuchKey|not found/i.test(fullText(failure))) return false;
      throw new Error(`Downloading ${key} failed: ${errorText(failure)}`);
    }
  }

  /** Uploads one file as an object (restore only). */
  async putObject(key: string, file: string, contentType: string): Promise<void> {
    try {
      await this.wrangler(['r2', 'object', 'put', `${this.names.bucket}/${key}`, '--file', file, '--content-type', contentType, ...this.where()]);
    } catch (failure) {
      throw new Error(`Uploading ${key} failed: ${errorText(failure)}`);
    }
  }

  /** Deletes one object. Used only by the restore drill's test, never by restore itself. */
  async deleteObject(key: string): Promise<void> {
    await this.wrangler(['r2', 'object', 'delete', `${this.names.bucket}/${key}`, ...this.where()]);
  }
}

/** Everything a failed wrangler call printed. */
function fullText(failure: unknown): string {
  const parts = failure as { stderr?: string; stdout?: string; message?: string };
  return `${parts.stdout ?? ''}\n${parts.stderr ?? ''}\n${parts.message ?? ''}`;
}

/**
 * The useful part of a failed wrangler call, for a person to read: its
 * ERROR lines (or else its last lines), without the banner, colours or the
 * log-file notice. Never the environment.
 */
export function errorText(failure: unknown): string {
  const lines = fullText(failure)
    .replace(/\u001b\[[0-9;]*m/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^(⛅️|─|🪵|Resource location|Use --remote)/.test(line));
  const errors = lines.filter((line) => /ERROR|error:/i.test(line));
  return (errors.length ? errors : lines.slice(-4)).join(' | ');
}

/** Runs `task` over `items`, `limit` at a time. */
export async function eachLimit<T>(items: readonly T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await task(item);
    }
  });
  await Promise.all(workers);
}
