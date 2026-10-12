// Static SVG files of placeholder handwriting, generated at build time.
// Phase 3 deletes this endpoint along with src/lib/placeholder-*.ts.
import type { APIRoute, GetStaticPaths } from 'astro';
import { PLACEHOLDER_PAGES, placeholderPageSvg } from '../../lib/placeholder-ink';

export const getStaticPaths = (() =>
  Object.keys(PLACEHOLDER_PAGES).map((page) => ({ params: { page: `page-${page}` } }))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ params }) => {
  const page = PLACEHOLDER_PAGES[Number(String(params.page).replace('page-', ''))];
  if (!page) return new Response(null, { status: 404 });
  return new Response(placeholderPageSvg(page.seed, page.lines), {
    headers: { 'Content-Type': 'image/svg+xml' },
  });
};
