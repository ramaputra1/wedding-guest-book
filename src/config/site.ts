/**
 * Every customisable value for the site lives here. To change the wedding's
 * details, edit this file and nothing else — components read from it and
 * never hard-code a name, date, or line of copy.
 *
 * Values below are placeholders until the owner supplies the real ones
 * (docs/PHASES.md, "Content the owner still owes").
 */

/** A calendar date as `YYYY-MM-DD`. */
export type IsoDate = `${number}-${number}-${number}`;

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
    /** Path to the hero photograph. Phase 1 settles where it lives. */
    src: string;
    /** Describes the photograph for people who cannot see it. */
    alt: string;
  };

  /** The guest book's single line of introduction. DESIGN.md allows one, never two. */
  intro: string;
}

export const site = {
  lang: 'en',
  title: 'Placeholder & Placeholder',
  description: 'Our wedding guest book.',

  couple: {
    names: ['First name', 'Second name'],
    joiner: '&',
  },

  date: {
    iso: '2000-01-01',
    display: 'Wedding date',
  },

  hero: {
    src: '/hero/placeholder.jpg',
    alt: '',
  },

  intro: 'Every page here was written by hand on the day.',
} as const satisfies SiteConfig;
