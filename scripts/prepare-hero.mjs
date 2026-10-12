#!/usr/bin/env node
/**
 * Turns an original hero photograph into the master copy the site builds from.
 *
 *   node scripts/prepare-hero.mjs <path/to/original.jpg>
 *
 * Writes src/assets/hero/hero.jpg. The repository is public, so the original
 * should stay outside it: camera files carry GPS position, body and lens
 * serial numbers and an owner name in their metadata. Re-encoding with sharp
 * writes none of it unless asked, and this script then checks the result.
 *
 * Every responsive size and format is generated from the master at build
 * time by astro:assets; this script only sets an upper bound on detail.
 */
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// 3840 px covers a 4K display edge to edge. More only bloats the repo.
const MASTER_LONG_EDGE = 3840;
const MASTER_QUALITY = 88;

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/prepare-hero.mjs <path/to/original.jpg>');
  process.exit(1);
}

const outDir = new URL('../src/assets/hero/', import.meta.url);
const outFile = fileURLToPath(new URL('hero.jpg', outDir));
await mkdir(outDir, { recursive: true });

const info = await sharp(input)
  // Bake EXIF orientation into the pixels before the orientation tag is dropped.
  .rotate()
  .resize({
    width: MASTER_LONG_EDGE,
    height: MASTER_LONG_EDGE,
    fit: 'inside',
    withoutEnlargement: true,
  })
  .toColourspace('srgb')
  .jpeg({ quality: MASTER_QUALITY, mozjpeg: true })
  .toFile(outFile);

const meta = await sharp(outFile).metadata();
const leftovers = ['exif', 'xmp', 'iptc', 'icc'].filter((key) => meta[key]);
if (leftovers.length > 0) {
  console.error(`Metadata survived re-encoding: ${leftovers.join(', ')}. Not safe to commit.`);
  process.exit(1);
}

console.log(`Wrote ${outFile}`);
console.log(`${info.width}×${info.height}, ${(info.size / 1024 / 1024).toFixed(2)} MB, no EXIF/XMP/IPTC/ICC metadata`);
