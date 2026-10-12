#!/usr/bin/env node
/**
 * Prints the value for WRITER_PASSPHRASE_HASH.
 *
 *   node scripts/hash-passphrase.mjs
 *
 * Asks for the passphrase twice with the typing hidden, so it never lands in
 * shell history or on screen. Piped input also works (one line), for tests.
 * Only the hash is printed to stdout; put that in the Cloudflare dashboard as
 * an Encrypted variable. Keep the passphrase itself in a password manager.
 *
 * Must produce what lib-server/passphrase.ts verifies — tests check that it does.
 */
import { webcrypto as crypto } from 'node:crypto';

const ITERATIONS = 20_000; // keep in step with PASSPHRASE_ITERATIONS in lib-server/passphrase.ts
const MIN_LENGTH = 16;

const toBase64Url = (bytes) => Buffer.from(bytes).toString('base64url');

async function hash(passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, key, 256);
  return `pbkdf2-sha256$${ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(new Uint8Array(bits))}`;
}

/** Reads one line from the terminal without echoing it. */
function readHidden(question) {
  return new Promise((resolve) => {
    process.stderr.write(question);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stderr.write('\n');
          resolve(value);
          return;
        }
        if (char === '\u0003') {
          process.stderr.write('\nCancelled.\n');
          process.exit(130);
        }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else value += char;
      }
    };
    stdin.on('data', onData);
  });
}

async function readPiped() {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text.replace(/\r?\n$/, '');
}

async function main() {
  if (process.argv.length > 2) {
    console.error('Do not pass the passphrase as an argument: it would be saved in your shell history.');
    console.error('Run  node scripts/hash-passphrase.mjs  and type it when asked.');
    process.exit(1);
  }

  let passphrase;
  if (process.stdin.isTTY) {
    passphrase = await readHidden('Passphrase (typing is hidden): ');
    const again = await readHidden('Same passphrase again: ');
    if (again !== passphrase) {
      console.error("The two didn't match. Nothing was generated. Run it again.");
      process.exit(1);
    }
  } else {
    passphrase = await readPiped();
  }

  if (passphrase.length < MIN_LENGTH) {
    console.error(`That passphrase is ${passphrase.length} characters. Use at least ${MIN_LENGTH} — four or five`);
    console.error('ordinary words with spaces is long, strong, and easy to type on an iPad.');
    process.exit(1);
  }

  console.error('Put this in Cloudflare as WRITER_PASSPHRASE_HASH (type: Encrypted):');
  console.log(await hash(passphrase));
}

main();
