/**
 * Hard-coded album content for the Phase 2 design review.
 * Phase 3 replaces this with entries from GET /api/entries — delete the file then.
 *
 * Photos are crops of the hero photograph (already public on the cover).
 * Handwriting comes from placeholder-ink.ts, served as SVG files by
 * src/pages/placeholder/[page].svg.ts.
 */
import { getImage } from 'astro:assets';
import { site } from '../config/site';
import { placeholderPageUrl } from './placeholder-ink';
import type { AlbumEntry, AlbumMedia } from './types';

type Gravity = 'centre' | 'north' | 'south' | 'east' | 'west' | 'northwest' | 'southeast';

async function placeholderPhoto(id: string, gravity: Gravity, alt: string): Promise<AlbumMedia> {
  const image = await getImage({
    src: site.hero.image,
    width: 960,
    height: 720,
    widths: [480, 960],
    fit: 'cover',
    position: gravity,
    format: 'webp',
    quality: 70,
  });
  return {
    id,
    kind: 'photo',
    src: image.src,
    srcSet: image.srcSet.attribute,
    width: 960,
    height: 720,
    alt,
  };
}

async function placeholderVideo(id: string, gravity: Gravity, alt: string, durationMs: number): Promise<AlbumMedia> {
  return { ...(await placeholderPhoto(id, gravity, alt)), kind: 'video', durationMs };
}

export async function getPlaceholderAlbum(): Promise<AlbumEntry[]> {
  const day = Date.UTC(2026, 11, 19, 14, 0);
  return [
    {
      id: 'ipad1-01MA79MCR0HSW3529SE27SRMR2',
      deviceId: 'ipad1',
      createdAt: day,
      media: [await placeholderPhoto('ipad1-01MA79P7B01490XNQX0D2HV6MK', 'centre', 'Placeholder photo: two people holding hands by the sea.')],
      page: { src: placeholderPageUrl(1), alt: 'Placeholder handwriting, four lines and a signature.' },
    },
    {
      id: 'ipad2-01MA79R1Y0FWTWRR0KA388DDDH',
      deviceId: 'ipad2',
      createdAt: day + 9 * 60_000,
      media: [
        await placeholderPhoto('ipad2-01MA79SWH0JX4X6P5CCDTZN744', 'west', 'Placeholder photo: tall trees against the sky.'),
        await placeholderVideo('ipad2-01MA79VQ40SRJZ9R1XCH7FT6Y2', 'east', 'Placeholder video: wind in the trees.', 15_000),
        await placeholderPhoto('ipad2-01MA79XHQ0313G7HV6B96S3GWD', 'south', 'Placeholder photo: the shaded lawn.'),
      ],
      page: { src: placeholderPageUrl(2), alt: 'Placeholder handwriting, three lines and a signature.' },
    },
    {
      id: 'ipad1-01MA79ZCA0MZ2M1HVEKJMN668Q',
      deviceId: 'ipad1',
      createdAt: day + 23 * 60_000,
      media: [await placeholderVideo('ipad1-01MA7A16X0W4MSNN9NEJ8R47MS', 'north', 'Placeholder video: the sky over the sea.', 9_000)],
      page: null,
    },
    {
      id: 'ipad2-01MA7A31G0TQ1ZQZ1FFJ5SQ6MB',
      deviceId: 'ipad2',
      createdAt: day + 41 * 60_000,
      media: [],
      page: { src: placeholderPageUrl(3), alt: 'Placeholder handwriting, two lines and a signature.' },
    },
  ];
}
