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
  /** "Take photo in" + "3 seconds" */
  takePhotoIn: string;
  cancelTimer: string;
  /** Announced when the countdown starts: "Photo in" + "3 seconds". */
  photoIn: string;
  timer: string;
  /** "3 s" on the timer choice. */
  secondsShort: string;
  seconds: string;
  startRecording: string;
  stopRecording: string;
  destination: string;
  /** "3 waiting to save" */
  waiting: string;
  /** "1.2 of 10 GB used" */
  gaugeOf: string;
  gaugeUnit: string;
  storageWarning: string;
  cameraRefused: string;
  cameraUnavailable: string;
}

/** Words for a capture's journey to storage (DESIGN.md, Status). */
export interface SaveCopy {
  saving: string;
  saved: string;
  notSavedPhoto: string;
  notSavedVideo: string;
  signInAgain: string;
  remove: string;
  confirmRemove: string;
}

/** Words in the full-size viewer on the public album. */
export interface ViewerCopy {
  openPhoto: string;
  playVideo: string;
  close: string;
}

/** Which camera the iPads use. "user" faces the guests, as a guest book is filmed. */
export interface CaptureConfig {
  facing: 'user' | 'environment';
  /**
   * The self-timer choices for photos, in seconds; the first is the default.
   * A photo is always taken on a timer, so guests have time to pose.
   */
  photoTimers: readonly [number, number];
}

/** Words on the writer's sign-in. DESIGN.md: "Enter the passphrase", not "Login to continue". */
export interface SignInCopy {
  label: string;
  submit: string;
  submitting: string;
  wrongPassphrase: string;
  unreachable: string;
  notConfigured: string;
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
  loading: string;
  loadFailed: string;
  photoAlt: string;
  videoAlt: string;
  handwrittenPage: string;
  camera: CameraCopy;
  save: SaveCopy;
  viewer: ViewerCopy;
  signIn: SignInCopy;
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

  capture: CaptureConfig;
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
    loading: 'Opening the album…',
    loadFailed: "The album didn't load. Reload the page to try again.",
    photoAlt: 'A photo from the guest book',
    videoAlt: 'A video from the guest book',
    handwrittenPage: 'A handwritten page',
    camera: {
      label: 'Camera',
      show: 'Show camera',
      hide: 'Hide camera',
      mode: 'Capture mode',
      photo: 'Photo',
      video: 'Video',
      takePhoto: 'Take photo',
      takePhotoIn: 'Take photo in',
      cancelTimer: 'Cancel timer',
      photoIn: 'Photo in',
      timer: 'Timer',
      secondsShort: 's',
      seconds: 'seconds',
      startRecording: 'Start recording',
      stopRecording: 'Stop recording',
      destination: 'Saves to',
      waiting: 'waiting to save',
      gaugeOf: 'of',
      gaugeUnit: 'GB used',
      storageWarning: 'Uploads are piling up on this iPad. Check the wifi.',
      cameraRefused: 'The camera is blocked. Allow it in Settings → Safari → Camera; until then the shutter opens the iPad camera.',
      cameraUnavailable: 'The live camera is not available here; the shutter opens the iPad camera.',
    },
    save: {
      saving: 'Saving…',
      saved: 'Saved',
      notSavedPhoto: "That photo didn't save. Tap to try again.",
      notSavedVideo: "That video didn't save. Tap to try again.",
      signInAgain: 'Sign in again to finish saving.',
      remove: 'Remove',
      confirmRemove: 'Remove this from the iPad? It was never saved and cannot be recovered.',
    },
    viewer: {
      openPhoto: 'Open photo',
      playVideo: 'Play video',
      close: 'Close',
    },
    signIn: {
      label: 'Enter the passphrase',
      submit: 'Sign in',
      submitting: 'Signing in…',
      wrongPassphrase: "That passphrase didn't match. Check it and try again.",
      unreachable: "The guest book couldn't be reached. Check the wifi and try again.",
      notConfigured: "Signing in isn't set up yet. The owner needs to finish the Cloudflare setup.",
    },
  },

  devices: { ipad1: 'iPad 1', ipad2: 'iPad 2' },

  capture: { facing: 'user', photoTimers: [3, 5] },
} as const satisfies SiteConfig;
