/**
 * Every customisable value for the site lives here. To change the wedding's
 * details, edit this file and nothing else — components read from it and
 * never hard-code a name, date, or line of copy.
 */
import type { ImageMetadata } from 'astro';
import heroPhoto from '../assets/hero/hero.jpg';

/** A calendar date as `YYYY-MM-DD`. */
export type IsoDate = `${number}-${number}-${number}`;

/**
 * Which part of the photograph to keep when a narrow screen crops it.
 * The couple in the current photograph stand at the horizontal centre.
 */
export type HeroFocus = 'center' | 'left' | 'right';

/**
 * Where the names sit on the photograph. Choose the region where the picture
 * is already dark and quiet, so the type reads without darkening the photo.
 */
export type HeroTextPlacement = 'lower' | 'center';

/** Words on the camera rail. Sentence case, active voice (DESIGN.md, Words). */
export interface CameraCopy {
  label: string;
  show: string;
  hide: string;
  mode: string;
  photo: string;
  video: string;
  takePhoto: string;
  startRecording: string;
  destination: string;
}

/**
 * Words the album uses, mostly for assistive technology. Labels are joined
 * into phrases like "Spread 3, 2 items" and "Show item 2 of 3".
 */
export interface AlbumCopy {
  emptyAlbum: string;
  spread: string;
  newSpread: string;
  emptyMount: string;
  item: string;
  items: string;
  showItem: string;
  of: string;
  video: string;
  seconds: string;
  blankPage: string;
  camera: CameraCopy;
}

export interface SiteConfig {
  /** BCP 47 language tag for `<html lang>`. */
  lang: string;
  /** The browser tab and share-preview title. */
  title: string;
  /** One sentence for search results and share previews. */
  description: string;

  couple: {
    /** Both names, in the order they are set on the cover. */
    names: readonly [string, string];
    /** What sits between the names on the cover, e.g. "&" or "and". */
    joiner: string;
  };

  date: {
    /** Machine-readable date, used for `<time datetime>`. */
    iso: IsoDate;
    /** Exactly as it should be set under the names, in the owner's chosen format. */
    display: string;
  };

  hero: {
    /**
     * The photograph, imported so astro:assets can generate every size at
     * build time. Prepare a new one with `node scripts/prepare-hero.mjs`.
     */
    image: ImageMetadata;
    /** Describes the photograph for people who cannot see it. */
    alt: string;
    focus: HeroFocus;
    textPlacement: HeroTextPlacement;
  };

  /** The guest book's single line of introduction. DESIGN.md allows one, never two. */
  intro: string;

  album: AlbumCopy;

  /** Labels for the two writer devices, used in their page titles. */
  devices: { ipad1: string; ipad2: string };
}

const names = ['Rama', 'Assela'] as const;
const joiner = '&';
const dateDisplay = '19 December 2026';

export const site = {
  lang: 'en',
  title: `${names[0]} ${joiner} ${names[1]}`,
  description: `The guest book from ${names[0]} and ${names[1]}'s wedding, ${dateDisplay}.`,

  couple: {
    names,
    joiner,
  },

  date: {
    iso: '2026-12-19',
    display: dateDisplay,
  },

  hero: {
    image: heroPhoto,
    alt: `${names[0]} and ${names[1]} holding hands on a lawn by the sea, framed by tall trees.`,
    focus: 'center',
    textPlacement: 'lower',
  },

  intro: 'Every page here was written by hand on the day.',

  album: {
    emptyAlbum: 'Nothing here yet.',
    spread: 'Spread',
    newSpread: 'New spread',
    emptyMount: 'empty',
    item: 'item',
    items: 'items',
    showItem: 'Show item',
    of: 'of',
    video: 'Video',
    seconds: 'seconds',
    blankPage: 'Blank page',
    camera: {
      label: 'Camera',
      show: 'Show camera',
      hide: 'Hide camera',
      mode: 'Capture mode',
      photo: 'Photo',
      video: 'Video',
      takePhoto: 'Take photo',
      startRecording: 'Start recording',
      destination: 'Saves to',
    },
  },

  devices: { ipad1: 'iPad 1', ipad2: 'iPad 2' },
} as const satisfies SiteConfig;
