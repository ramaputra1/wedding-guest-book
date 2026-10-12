import type { AlbumPage } from '../../lib/types';

interface Props {
  page: AlbumPage | null;
  blankLabel: string;
}

/** Warm writing paper with faint ruled lines. Phase 5 puts the canvas here. */
export function WritingPage({ page, blankLabel }: Props) {
  return (
    <div class="writing-page">
      {/* The ruling pattern is defined once in Album; see album__defs. */}
      <svg class="writing-page__rules" aria-hidden="true" focusable="false">
        <rect width="100%" height="100%" fill="url(#writing-rules)" />
      </svg>
      {page ? (
        <img class="writing-page__ink" src={page.src} alt={page.alt} loading="lazy" decoding="async" />
      ) : (
        <span class="visually-hidden">{blankLabel}</span>
      )}
    </div>
  );
}
