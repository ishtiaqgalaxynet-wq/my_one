export const SUPER_ADMIN_EMAIL = 'ishtiaqhimel11@gmail.com';

export const MAX_LENGTHS = {
  displayName: 60,
  accountSubtitle: 60,
  instagramHandle: 60,
  tiktokHandle: 60,
  bioTitle: 80,
  bioText: 1200,
  friendsLabel: 40,
  memoriesCount: 24,
  memoriesLabel: 40,
  followerCount: 24,
  followerLabel: 40,
  followingCount: 24,
  followingLabel: 40,
  hugButtonText: 32,
  shareButtonText: 32,
  tiktokHugs: 24,
  tiktokSmiles: 24,
  tiktokLikes: 24,
  pinnedSubtitle: 80,
  pinnedCaption: 120,
  letterTitle: 100,
  letterBody: 3000,
  letterSignoff: 100,
  finaleTitle: 160,
  finaleButtonText: 40,
  songLabel: 60,
  songUrl: 300,
  slotKey: 64,
  sectionLabel: 80,
  imageData: 800000,
  caption: 200,
  email: 160,
  adminDisplayName: 80,
} as const;

export type ThemeMode = 'dark' | 'light';
export type PhotoStatus = 'published' | 'hidden';

export interface SiteContent {
  displayName: string;
  accountSubtitle: string;
  instagramHandle: string;
  tiktokHandle: string;
  bioTitle: string;
  bioText: string;
  friendsLabel: string;
  memoriesCount: string;
  memoriesLabel: string;
  followerCount: string;
  followerLabel: string;
  followingCount: string;
  followingLabel: string;
  hugButtonText: string;
  shareButtonText: string;
  tiktokHugs: string;
  tiktokSmiles: string;
  tiktokLikes: string;
  pinnedSubtitle: string;
  pinnedCaption: string;
  letterTitle: string;
  letterBody: string;
  letterSignoff: string;
  finaleTitle: string;
  finaleButtonText: string;
  songLabel: string;
  songUrl: string;
  defaultTheme: ThemeMode;
  updatedAt?: unknown;
  updatedByUid?: string;
}

export interface PhotoItem {
  id: string;
  slotKey: string;
  sectionLabel: string;
  imageData: string;
  caption: string;
  isExtra: boolean;
  status: PhotoStatus;
  sortOrder: number;
  updatedAt?: unknown;
  updatedByUid?: string;
}

export interface AdminUser {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin';
  createdAt?: unknown;
  createdByUid?: string;
}

export type SlotCategory = 'hero' | 'social' | 'collage';

export interface SlotDefinition {
  slotKey: string;
  sectionLabel: string;
  description: string;
  aspectHint: string;
  category: SlotCategory;
  sortOrder: number;
}

export const SLOT_DEFINITIONS: SlotDefinition[] = [
  {
    slotKey: 's0',
    sectionLabel: 'Hero Banner Backdrop',
    description: 'Full-width top showcase banner behind the mini card and pill.',
    aspectHint: 'Landscape 16:9',
    category: 'hero',
    sortOrder: 0,
  },
  {
    slotKey: 's1',
    sectionLabel: 'Mini Song Card Photo',
    description: 'Floating portrait card on the bottom-left of the hero banner.',
    aspectHint: 'Portrait 4:5',
    category: 'hero',
    sortOrder: 1,
  },
  {
    slotKey: 's2',
    sectionLabel: 'Account Pill Avatar',
    description: 'Small square thumbnail inside the Kingdom Account corner pill.',
    aspectHint: 'Square 1:1',
    category: 'hero',
    sortOrder: 2,
  },
  {
    slotKey: 's3',
    sectionLabel: 'Highlight Story 1',
    description: 'First circular highlight frame beneath the hero banner.',
    aspectHint: 'Square 1:1',
    category: 'hero',
    sortOrder: 3,
  },
  {
    slotKey: 's4',
    sectionLabel: 'Highlight Story 2',
    description: 'Second circular highlight frame beneath the hero banner.',
    aspectHint: 'Square 1:1',
    category: 'hero',
    sortOrder: 4,
  },
  {
    slotKey: 's5',
    sectionLabel: 'Highlight Story 3',
    description: 'Third circular highlight frame beneath the hero banner.',
    aspectHint: 'Square 1:1',
    category: 'hero',
    sortOrder: 5,
  },
  {
    slotKey: 's6',
    sectionLabel: 'Feature Profile Portrait',
    description: 'Tall framed photo next to the stats & memories card.',
    aspectHint: 'Portrait 3:4',
    category: 'social',
    sortOrder: 6,
  },
  {
    slotKey: 's7',
    sectionLabel: 'Social Card Avatar',
    description: 'Circular profile avatar on the Instagram social stats card.',
    aspectHint: 'Square 1:1',
    category: 'social',
    sortOrder: 7,
  },
  {
    slotKey: 's8',
    sectionLabel: 'Pinned Card Backdrop',
    description: 'Full background image on the pinned Queen showcase card.',
    aspectHint: 'Landscape 4:3',
    category: 'social',
    sortOrder: 8,
  },
  {
    slotKey: 's9',
    sectionLabel: 'Pinned Card Avatar',
    description: 'Centered circular crown avatar inside the pinned showcase card.',
    aspectHint: 'Square 1:1',
    category: 'social',
    sortOrder: 9,
  },
  {
    slotKey: 's10',
    sectionLabel: 'Collage Photo 1 (Tall Left)',
    description: 'Tall left mosaic tile in the Kingdom photo collage.',
    aspectHint: 'Portrait 3:4',
    category: 'collage',
    sortOrder: 10,
  },
  {
    slotKey: 's11',
    sectionLabel: 'Collage Photo 2 (Top Right)',
    description: 'Upper right tile in the Kingdom photo collage.',
    aspectHint: 'Landscape 4:3',
    category: 'collage',
    sortOrder: 11,
  },
  {
    slotKey: 's12',
    sectionLabel: 'Collage Photo 3 (Lower Left)',
    description: 'Lower left tile in the Kingdom photo collage.',
    aspectHint: 'Landscape 4:3',
    category: 'collage',
    sortOrder: 12,
  },
  {
    slotKey: 's13',
    sectionLabel: 'Collage Photo 4 (Tall Right)',
    description: 'Tall right mosaic tile in the Kingdom photo collage.',
    aspectHint: 'Portrait 3:4',
    category: 'collage',
    sortOrder: 13,
  },
];

export const DEFAULT_SITE_CONTENT: SiteContent = {
  displayName: 'Princess',
  accountSubtitle: 'Kingdom Account',
  instagramHandle: '@nusratjahan_bushra',
  tiktokHandle: 'princess12',
  bioTitle: 'Princess',
  bioText:
    'Once upon a time, a girl was born with a smile that could light up a whole kingdom. Wherever she walked, ordinary days turned into small adventures, and every little moment felt like magic. This is her kingdom, and I am the lucky one who gets to be in it.',
  friendsLabel: '∞ friends',
  memoriesCount: '999+',
  memoriesLabel: 'memories',
  followerCount: '1',
  followerLabel: 'follower (me)',
  followingCount: '1',
  followingLabel: 'following (you)',
  hugButtonText: 'Send a hug',
  shareButtonText: 'Share love',
  tiktokHugs: '∞',
  tiktokSmiles: '∞',
  tiktokLikes: '1,000,000',
  pinnedSubtitle: 'my queen · she/her',
  pinnedCaption: '1 follower: me · 0 following: she needs no one 👑',
  letterTitle: 'A letter for you 💌',
  letterBody:
    'My dear Princess,\n\nEvery day with you feels like a fairytale. You make ordinary moments magical, and your smile is my favorite place to be.\n\nThank you for being you. I will always be your biggest fan, your safe place, and your happily ever after.',
  letterSignoff: 'Love always ❤️',
  finaleTitle: 'You are my princess, today and always.',
  finaleButtonText: 'Tap for love 💖',
  songLabel: '🎵 Play our song',
  songUrl: 'https://youtu.be/blQLxdHb-MY',
  defaultTheme: 'dark',
};

export function sanitizeSiteContent(raw: SiteContent, uid: string): Omit<SiteContent, 'updatedAt'> & { updatedByUid: string } {
  const clamp = (val: string, fallback: string, max: number) => {
    const trimmed = (val ?? '').trim();
    const chosen = trimmed.length > 0 ? trimmed : fallback;
    return chosen.slice(0, max);
  };

  return {
    displayName: clamp(raw.displayName, DEFAULT_SITE_CONTENT.displayName, MAX_LENGTHS.displayName),
    accountSubtitle: clamp(raw.accountSubtitle, DEFAULT_SITE_CONTENT.accountSubtitle, MAX_LENGTHS.accountSubtitle),
    instagramHandle: clamp(raw.instagramHandle, DEFAULT_SITE_CONTENT.instagramHandle, MAX_LENGTHS.instagramHandle),
    tiktokHandle: clamp(raw.tiktokHandle, DEFAULT_SITE_CONTENT.tiktokHandle, MAX_LENGTHS.tiktokHandle),
    bioTitle: clamp(raw.bioTitle, DEFAULT_SITE_CONTENT.bioTitle, MAX_LENGTHS.bioTitle),
    bioText: clamp(raw.bioText, DEFAULT_SITE_CONTENT.bioText, MAX_LENGTHS.bioText),
    friendsLabel: clamp(raw.friendsLabel, DEFAULT_SITE_CONTENT.friendsLabel, MAX_LENGTHS.friendsLabel),
    memoriesCount: clamp(raw.memoriesCount, DEFAULT_SITE_CONTENT.memoriesCount, MAX_LENGTHS.memoriesCount),
    memoriesLabel: clamp(raw.memoriesLabel, DEFAULT_SITE_CONTENT.memoriesLabel, MAX_LENGTHS.memoriesLabel),
    followerCount: clamp(raw.followerCount, DEFAULT_SITE_CONTENT.followerCount, MAX_LENGTHS.followerCount),
    followerLabel: clamp(raw.followerLabel, DEFAULT_SITE_CONTENT.followerLabel, MAX_LENGTHS.followerLabel),
    followingCount: clamp(raw.followingCount, DEFAULT_SITE_CONTENT.followingCount, MAX_LENGTHS.followingCount),
    followingLabel: clamp(raw.followingLabel, DEFAULT_SITE_CONTENT.followingLabel, MAX_LENGTHS.followingLabel),
    hugButtonText: clamp(raw.hugButtonText, DEFAULT_SITE_CONTENT.hugButtonText, MAX_LENGTHS.hugButtonText),
    shareButtonText: clamp(raw.shareButtonText, DEFAULT_SITE_CONTENT.shareButtonText, MAX_LENGTHS.shareButtonText),
    tiktokHugs: clamp(raw.tiktokHugs, DEFAULT_SITE_CONTENT.tiktokHugs, MAX_LENGTHS.tiktokHugs),
    tiktokSmiles: clamp(raw.tiktokSmiles, DEFAULT_SITE_CONTENT.tiktokSmiles, MAX_LENGTHS.tiktokSmiles),
    tiktokLikes: clamp(raw.tiktokLikes, DEFAULT_SITE_CONTENT.tiktokLikes, MAX_LENGTHS.tiktokLikes),
    pinnedSubtitle: clamp(raw.pinnedSubtitle, DEFAULT_SITE_CONTENT.pinnedSubtitle, MAX_LENGTHS.pinnedSubtitle),
    pinnedCaption: clamp(raw.pinnedCaption, DEFAULT_SITE_CONTENT.pinnedCaption, MAX_LENGTHS.pinnedCaption),
    letterTitle: clamp(raw.letterTitle, DEFAULT_SITE_CONTENT.letterTitle, MAX_LENGTHS.letterTitle),
    letterBody: clamp(raw.letterBody, DEFAULT_SITE_CONTENT.letterBody, MAX_LENGTHS.letterBody),
    letterSignoff: clamp(raw.letterSignoff, DEFAULT_SITE_CONTENT.letterSignoff, MAX_LENGTHS.letterSignoff),
    finaleTitle: clamp(raw.finaleTitle, DEFAULT_SITE_CONTENT.finaleTitle, MAX_LENGTHS.finaleTitle),
    finaleButtonText: clamp(raw.finaleButtonText, DEFAULT_SITE_CONTENT.finaleButtonText, MAX_LENGTHS.finaleButtonText),
    songLabel: clamp(raw.songLabel, DEFAULT_SITE_CONTENT.songLabel, MAX_LENGTHS.songLabel),
    songUrl: clamp(raw.songUrl, DEFAULT_SITE_CONTENT.songUrl, MAX_LENGTHS.songUrl),
    defaultTheme: raw.defaultTheme === 'light' ? 'light' : 'dark',
    updatedByUid: uid.slice(0, 128),
  };
}
