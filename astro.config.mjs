// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';

// No @astrojs/cloudflare adapter, on purpose. Every version of it either
// targets Workers (v13+) or emits dist/_worker.js (v12), and a _worker.js
// makes Cloudflare Pages ignore the functions/ directory the API lives in.
// The site is fully static; Pages Functions serve /api/*. See
// docs/reports/phase-0-foundation.md.
export default defineConfig({
  output: 'static',
  integrations: [preact()],
});
