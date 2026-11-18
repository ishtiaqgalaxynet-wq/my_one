import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Crown,
  Heart,
  Loader2,
  Moon,
  Music,
  Pause,
  Play,
  Share2,
  Sun,
  X,
} from 'lucide-react';
import {
  FloatingHeartsOverlay,
  type FloatingBurstParticle,
} from './FloatingHeartsOverlay';
import { getYouTubeEmbedUrl, isVideoItem } from '../lib/imageUtils';
import { type PhotoItem, type SiteContent, type ThemeMode } from '../types/kingdom';

interface PublicKingdomViewProps {
  content: SiteContent;
  photos: PhotoItem[];
  theme: ThemeMode;
  onToggleTheme: () => void;
  isAdmin: boolean;
  onOpenAdmin: () => void;
  onLoadVideoSource: (photo: PhotoItem) => Promise<string>;
  onLoadBackgroundMusic: (content: SiteContent) => Promise<string | null>;
}

export const PublicKingdomView: React.FC<PublicKingdomViewProps> = ({
  content,
  photos,
  theme,
  onToggleTheme,
  isAdmin,
  onOpenAdmin,
  onLoadVideoSource,
  onLoadBackgroundMusic,
}) => {
  const [particles, setParticles] = useState<FloatingBurstParticle[]>([]);
  const [ambientHeartsEnabled, setAmbientHeartsEnabled] = useState<boolean>(() => {
    try {
      const saved = window.localStorage.getItem('kingdom_floating_hearts');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [hugCount, setHugCount] = useState<number>(0);
  const [lightboxPhoto, setLightboxPhoto] = useState<PhotoItem | null>(null);
  const [lightboxVideoSrc, setLightboxVideoSrc] = useState<string | null>(null);
  const [lightboxVideoLoading, setLightboxVideoLoading] = useState(false);
  const [lightboxVideoError, setLightboxVideoError] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  // Background music player state (plays uploaded MP3 automatically on page load)
  const bgAudioRef = useRef<HTMLAudioElement | null>(null);
  const userPausedMusicRef = useRef(false);
  const pausedForVideoRef = useRef(false);
  const [bgMusicSrc, setBgMusicSrc] = useState<string | null>(null);
  const [bgMusicLoading, setBgMusicLoading] = useState(false);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [awaitingGesture, setAwaitingGesture] = useState(false);
  const [galleryVideoSrcs, setGalleryVideoSrcs] = useState<Record<string, string>>({});

  const hasConfiguredMusic = Boolean(
    content.bgMusicEnabled &&
      ((content.bgMusicChunkCount ?? 0) > 0 || (content.bgMusicUrl ?? '').trim().length > 0)
  );

  // Load background music source when enabled / updated
  useEffect(() => {
    let cancelled = false;

    if (!hasConfiguredMusic) {
      setBgMusicSrc(null);
      setBgMusicLoading(false);
      setIsMusicPlaying(false);
      setAwaitingGesture(false);
      return;
    }

    setBgMusicLoading(true);

    onLoadBackgroundMusic(content)
      .then((src) => {
        if (!cancelled) {
          userPausedMusicRef.current = false;
          setBgMusicSrc(src);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBgMusicSrc(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBgMusicLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    hasConfiguredMusic,
    content.bgMusicEnabled,
    content.bgMusicChunkCount,
    content.bgMusicUrl,
    content.bgMusicTitle,
    content.bgMusicDuration,
    onLoadBackgroundMusic,
    content,
  ]);

  const tryStartMusic = useCallback(async () => {
    const audio = bgAudioRef.current;
    if (!audio || !bgMusicSrc || userPausedMusicRef.current) return;
    try {
      await audio.play();
      setIsMusicPlaying(true);
      setAwaitingGesture(false);
    } catch {
      // Browser blocked unmuted autoplay until first user interaction
      setIsMusicPlaying(false);
      setAwaitingGesture(true);
    }
  }, [bgMusicSrc]);

  // Attempt autoplay whenever source is ready & autoplay is enabled
  useEffect(() => {
    const audio = bgAudioRef.current;
    if (!audio || !bgMusicSrc) return;

    audio.loop = content.bgMusicLoop ?? true;

    if (content.bgMusicAutoPlay ?? true) {
      void tryStartMusic();
    }
  }, [bgMusicSrc, content.bgMusicAutoPlay, content.bgMusicLoop, tryStartMusic]);

  // Keep loop synchronized
  useEffect(() => {
    const audio = bgAudioRef.current;
    if (!audio) return;
    audio.loop = content.bgMusicLoop ?? true;
  }, [content.bgMusicLoop]);

  // First-gesture fallback when browser blocks autoplay on initial load
  useEffect(() => {
    if (!awaitingGesture || !bgMusicSrc || !(content.bgMusicAutoPlay ?? true)) return;

    const handleFirstInteraction = () => {
      if (!userPausedMusicRef.current) {
        void tryStartMusic();
      }
    };

    window.addEventListener('pointerdown', handleFirstInteraction, { passive: true });
    window.addEventListener('keydown', handleFirstInteraction, { passive: true });
    window.addEventListener('touchstart', handleFirstInteraction, { passive: true });

    return () => {
      window.removeEventListener('pointerdown', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };
  }, [awaitingGesture, bgMusicSrc, content.bgMusicAutoPlay, tryStartMusic]);

  // Pause background music while watching a video in the lightbox, resume when closed
  useEffect(() => {
    const audio = bgAudioRef.current;
    if (!audio) return;

    if (lightboxPhoto && isVideoItem(lightboxPhoto)) {
      if (!audio.paused) {
        pausedForVideoRef.current = true;
        audio.pause();
        setIsMusicPlaying(false);
      }
    } else if (pausedForVideoRef.current) {
      pausedForVideoRef.current = false;
      if (!userPausedMusicRef.current && bgMusicSrc) {
        void tryStartMusic();
      }
    }
  }, [lightboxPhoto, bgMusicSrc, tryStartMusic]);

  const toggleMusicPlayback = async () => {
    const audio = bgAudioRef.current;
    if (!audio || !bgMusicSrc) return;

    if (audio.paused) {
      userPausedMusicRef.current = false;
      await tryStartMusic();
    } else {
      userPausedMusicRef.current = true;
      setAwaitingGesture(false);
      audio.pause();
      setIsMusicPlaying(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (!lightboxPhoto || !isVideoItem(lightboxPhoto)) {
      setLightboxVideoSrc(null);
      setLightboxVideoLoading(false);
      setLightboxVideoError(null);
      return;
    }

    setLightboxVideoLoading(true);
    setLightboxVideoError(null);
    setLightboxVideoSrc(null);

    onLoadVideoSource(lightboxPhoto)
      .then((src) => {
        if (!cancelled) {
          setLightboxVideoSrc(src);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLightboxVideoError(
            err instanceof Error ? err.message : 'Unable to load this video.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLightboxVideoLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [lightboxPhoto, onLoadVideoSource]);

  const publishedPhotos = useMemo(
    () => photos.filter((p) => p.status === 'published'),
    [photos]
  );

  // Resolve video sources so published gallery & collage videos auto-loop play smoothly
  useEffect(() => {
    let cancelled = false;
    const videoItems = publishedPhotos.filter((p) => isVideoItem(p));
    if (videoItems.length === 0) return;

    videoItems.forEach((item) => {
      if (item.videoData && item.videoData.trim().length > 0) {
        if (!getYouTubeEmbedUrl(item.videoData)) {
          setGalleryVideoSrcs((prev) =>
            prev[item.id] === item.videoData ? prev : { ...prev, [item.id]: item.videoData! }
          );
        }
        return;
      }

      if ((item.chunkCount ?? 0) > 0 && !galleryVideoSrcs[item.id]) {
        onLoadVideoSource(item)
          .then((src) => {
            if (!cancelled && src && !getYouTubeEmbedUrl(src)) {
              setGalleryVideoSrcs((prev) => ({ ...prev, [item.id]: src }));
            }
          })
          .catch(() => undefined);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [publishedPhotos, onLoadVideoSource, galleryVideoSrcs]);

  const videoCount = useMemo(
    () => publishedPhotos.filter((p) => isVideoItem(p)).length,
    [publishedPhotos]
  );
  const photoCount = publishedPhotos.length - videoCount;

  const slotMap = useMemo(() => {
    const map = new Map<string, PhotoItem>();
    for (const item of publishedPhotos) {
      if (!item.isExtra) {
        map.set(item.slotKey, item);
      }
    }
    return map;
  }, [publishedPhotos]);

  const extraPhotos = useMemo(
    () => publishedPhotos.filter((p) => p.isExtra),
    [publishedPhotos]
  );

  const showToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 2800);
  };

  const toggleAmbientHearts = () => {
    setAmbientHeartsEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem('kingdom_floating_hearts', String(next));
      } catch {
        // Ignore storage errors
      }
      showToast(next ? 'Floating hearts enabled' : 'Floating hearts turned off');
      return next;
    });
  };

  const triggerHeartBurst = (emojis: string[] = ['💖', '💕', '👑', '✨', '💗', '🌹']) => {
    const batch: FloatingBurstParticle[] = Array.from({ length: 18 }, (_, i) => ({
      id: Date.now() + i + Math.random(),
      emoji: emojis[Math.floor(Math.random() * emojis.length)],
      left: `${4 + Math.random() * 90}vw`,
      size: 18 + Math.floor(Math.random() * 20),
    }));

    setParticles((prev) => [...prev, ...batch]);
    window.setTimeout(() => {
      const ids = new Set(batch.map((b) => b.id));
      setParticles((prev) => prev.filter((p) => !ids.has(p.id)));
    }, 3900);
  };

  const handleSendHug = () => {
    setHugCount((c) => c + 1);
    triggerHeartBurst(['🤗', '💖', '💕', '👑']);
    showToast(`Sent a warm royal hug to ${content.displayName}`);
  };

  const handleShareLove = async () => {
    triggerHeartBurst(['💗', '✨', '🌹']);
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast('Kingdom link copied to share');
    } catch {
      showToast('Sharing love across the kingdom');
    }
  };

  const normalizedIg = content.instagramHandle.startsWith('@')
    ? content.instagramHandle
    : `@${content.instagramHandle}`;

  const renderSlotMedia = (
    slotKey: string,
    className: string,
    fallbackIcon: React.ReactNode = <Crown className="w-5 h-5 opacity-80" />
  ) => {
    const item = slotMap.get(slotKey);
    const isVideo = isVideoItem(item);
    const hasValidMedia = item && (item.imageData || isVideo) && !failedImages[item.id];
    const hasPosterImage = Boolean(item?.imageData && !item.imageData.startsWith('data:video/') && !failedImages[item.id]);
    const autoLoopVideoSrc =
      isVideo && item
        ? galleryVideoSrcs[item.id] ||
          (item.videoData && !getYouTubeEmbedUrl(item.videoData) ? item.videoData : undefined)
        : undefined;

    return (
      <button
        type="button"
        onClick={() => hasValidMedia && item && setLightboxPhoto(item)}
        aria-label={item?.caption || item?.sectionLabel || `${content.displayName} media`}
        className={`relative overflow-hidden flex items-center justify-center bg-gradient-to-br from-[#9163cb] to-[#6247aa] text-[#f6f1fc] transition-transform duration-200 ${
          hasValidMedia ? 'cursor-pointer hover:scale-[1.015]' : 'cursor-default'
        } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kingdom-ivory)] ${className}`}
      >
        {hasValidMedia && item ? (
          <>
            {autoLoopVideoSrc ? (
              <video
                src={autoLoopVideoSrc}
                poster={hasPosterImage ? item.imageData : undefined}
                autoPlay
                loop
                muted
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : hasPosterImage ? (
              <img
                src={item.imageData}
                alt={item.caption || item.sectionLabel}
                referrerPolicy="no-referrer"
                onError={() => setFailedImages((prev) => ({ ...prev, [item.id]: true }))}
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : null}
            {isVideo && !autoLoopVideoSrc && (
              <span className="relative z-10 w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-black/55 backdrop-blur-sm border border-white/30 text-white flex items-center justify-center shadow-lg">
                <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current ml-0.5" />
              </span>
            )}
          </>
        ) : (
          <span className="flex flex-col items-center justify-center gap-1 select-none pointer-events-none">
            {fallbackIcon}
          </span>
        )}
      </button>
    );
  };

  const letterParagraphs = content.letterBody
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <div className="min-h-screen bg-[var(--kingdom-bg)] text-[var(--kingdom-ink)] transition-colors duration-200">
      {/* Floating Editorial Navigation Bar */}
      <header className="sticky top-3 z-30 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto h-14 px-3.5 sm:px-5 rounded-full bg-[var(--kingdom-wine)]/95 backdrop-blur-md border border-[var(--kingdom-ivory)]/20 text-[var(--kingdom-ivory)] shadow-[0_10px_28px_rgba(0,0,0,0.28)] flex items-center justify-between gap-6">
          <a
            href="#story"
            className="flex items-center gap-2.5 font-display text-base sm:text-lg font-bold tracking-tight whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kingdom-ivory)] rounded-full pr-2"
          >
            <span className="w-9 h-9 rounded-full border border-[var(--kingdom-ivory)]/45 bg-[var(--kingdom-deep)]/65 flex items-center justify-center shrink-0">
              <Crown className="w-4 h-4" />
            </span>
            <span className="truncate max-w-[160px] sm:max-w-[220px]">
              {content.displayName}
            </span>
          </a>

          <nav
            aria-label="Primary sections"
            className="hidden md:flex items-center gap-7 text-xs sm:text-sm font-medium tracking-wide text-[var(--kingdom-ivory)]/80"
          >
            <a
              href="#story"
              className="hover:text-[var(--kingdom-ivory)] hover:underline underline-offset-4 whitespace-nowrap shrink-0 transition-colors"
            >
              Story
            </a>
            <a
              href="#social"
              className="hover:text-[var(--kingdom-ivory)] hover:underline underline-offset-4 whitespace-nowrap shrink-0 transition-colors"
            >
              Social
            </a>
            <a
              href="#gallery"
              className="hover:text-[var(--kingdom-ivory)] hover:underline underline-offset-4 whitespace-nowrap shrink-0 transition-colors"
            >
              Gallery
            </a>
            <a
              href="#letter"
              className="hover:text-[var(--kingdom-ivory)] hover:underline underline-offset-4 whitespace-nowrap shrink-0 transition-colors"
            >
              Letter
            </a>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            {hasConfiguredMusic && (
              <button
                type="button"
                onClick={() => void toggleMusicPlayback()}
                aria-label={isMusicPlaying ? 'Pause background music' : 'Play background music'}
                title={
                  isMusicPlaying
                    ? `Playing: ${content.bgMusicTitle || 'Background Music'}`
                    : awaitingGesture
                      ? 'Tap to play background music'
                      : 'Play background music'
                }
                className={`h-10 px-3 flex items-center justify-center gap-1.5 rounded-full border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kingdom-ivory)] ${
                  isMusicPlaying
                    ? 'bg-[#dec9e9] text-[#352063] border-[#dec9e9] hover:bg-[#dac3e8]'
                    : 'border-[var(--kingdom-ivory)]/30 bg-[var(--kingdom-deep)]/45 text-[var(--kingdom-ivory)] hover:bg-[var(--kingdom-deep)]'
                }`}
              >
                {bgMusicLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isMusicPlaying ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Music className={`w-4 h-4 ${awaitingGesture ? 'animate-pulse' : ''}`} />
                )}
                <span className="hidden sm:inline text-xs font-semibold">
                  {isMusicPlaying ? 'Playing' : 'Music'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={toggleAmbientHearts}
              aria-pressed={ambientHeartsEnabled}
              aria-label={
                ambientHeartsEnabled
                  ? 'Turn off floating hearts'
                  : 'Turn on floating hearts'
              }
              title={
                ambientHeartsEnabled
                  ? 'Floating hearts: On'
                  : 'Floating hearts: Off'
              }
              className={`w-10 h-10 flex items-center justify-center rounded-full border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kingdom-ivory)] ${
                ambientHeartsEnabled
                  ? 'bg-[#dec9e9] text-[#352063] border-[#dec9e9] hover:bg-[#dac3e8]'
                  : 'border-[var(--kingdom-ivory)]/30 bg-[var(--kingdom-deep)]/45 text-[var(--kingdom-ivory)] hover:bg-[var(--kingdom-deep)]'
              }`}
            >
              <Heart
                className="w-4 h-4"
                fill={ambientHeartsEnabled ? 'currentColor' : 'none'}
              />
            </button>

            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className="w-10 h-10 flex items-center justify-center rounded-full border border-[var(--kingdom-ivory)]/30 bg-[var(--kingdom-deep)]/45 hover:bg-[var(--kingdom-deep)] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kingdom-ivory)]"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
        {/* Section 1: Hero Showcase Card */}
        <section id="story" className="scroll-mt-24 space-y-6">
          {/* Hero Card */}
          <div className="hero-enter-card rounded-[28px] sm:rounded-[30px] bg-[var(--kingdom-cream)] p-3.5 sm:p-5 shadow-lg space-y-5">
            <div className="relative h-64 sm:h-96 rounded-[20px] sm:rounded-[22px] overflow-hidden">
              {renderSlotMedia('s0', 'hero-enter-media w-full h-full')}

              {/* Bottom Overlay Row: non-overlapping on mobile & desktop */}
              <div className="absolute inset-x-3 bottom-3 sm:inset-x-4 sm:bottom-4 z-10 flex items-end justify-between gap-2.5 pointer-events-none">
                {/* Mini Floating Song Card */}
                <div className="hero-enter-up hero-delay-2 pointer-events-auto relative w-20 h-24 sm:w-32 sm:h-36 rounded-2xl bg-[var(--kingdom-wine)] p-1.5 sm:p-2 shadow-xl shrink-0">
                  {renderSlotMedia('s1', 'w-full h-full rounded-xl')}
                  <a
                    href={content.songUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Play our song"
                    className="absolute right-1 bottom-1 sm:right-1.5 sm:bottom-1.5 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[var(--kingdom-deep)] text-[var(--kingdom-ivory)] flex items-center justify-center shadow hover:scale-105 transition-transform"
                  >
                    <Music className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </a>
                </div>

                {/* Account Corner Anchor */}
                <div className="hero-enter-up hero-delay-3 pointer-events-auto min-w-0 max-w-[66%] sm:max-w-xs bg-[var(--kingdom-deep)]/95 text-[var(--kingdom-ivory)] rounded-2xl p-1.5 sm:p-2 pr-3 sm:pr-3.5 flex items-center gap-2 sm:gap-2.5 shadow-xl">
                  {renderSlotMedia('s2', 'w-9 h-9 sm:w-10 sm:h-10 rounded-xl shrink-0')}
                  <div className="min-w-0 text-left">
                    <p className="text-xs font-bold truncate">{content.displayName}</p>
                    <p className="text-[10px] sm:text-[11px] text-[var(--kingdom-ivory)]/80 truncate">
                      {content.accountSubtitle}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Highlights & Bio Split */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-center px-1 sm:px-2 pb-1">
              <div className="lg:col-span-5 flex items-center gap-3 sm:gap-4">
                {(['s3', 's4', 's5'] as const).map((slotKey, index) => (
                  <div
                    key={slotKey}
                    className={`hero-enter-up hero-delay-${index + 2} w-16 h-16 sm:w-20 sm:h-20 rounded-full p-0.5 border-2 border-[var(--kingdom-wine)] shrink-0`}
                  >
                    {renderSlotMedia(slotKey, 'w-full h-full rounded-full')}
                  </div>
                ))}
              </div>

              <div className="lg:col-span-7 space-y-2 text-left">
                <h1 className="hero-enter-up hero-delay-3 font-display text-2xl sm:text-3xl font-bold text-[var(--kingdom-rose)] text-balance">
                  {content.bioTitle}
                </h1>
                <p className="hero-enter-up hero-delay-4 text-sm sm:text-[15px] leading-relaxed text-[var(--kingdom-ink)]/95">
                  {content.bioText}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Hidden Background Audio Player (Auto-plays uploaded MP3 on page load) */}
        {bgMusicSrc && (
          <audio
            ref={bgAudioRef}
            src={bgMusicSrc}
            preload="auto"
            onPlay={() => {
              setIsMusicPlaying(true);
              setAwaitingGesture(false);
            }}
            onPause={() => {
              setIsMusicPlaying(false);
            }}
            onError={() => {
              setIsMusicPlaying(false);
            }}
          />
        )}

        {/* Section 2: Split Portrait & Royal Stats */}
        <section className="grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch">
          <div className="md:col-span-5 rounded-3xl bg-[var(--kingdom-cream)] p-3 shadow-md flex">
            {renderSlotMedia('s6', 'w-full min-h-[260px] md:min-h-[300px] rounded-2xl')}
          </div>

          <div className="md:col-span-7 rounded-3xl bg-[var(--kingdom-wine)] text-[var(--kingdom-ivory)] p-4 sm:p-5 flex flex-col justify-between gap-4 shadow-md">
            <div className="rounded-2xl bg-[var(--kingdom-cream)] text-[var(--kingdom-ink)] p-5 sm:p-6 space-y-4">
              <div>
                <h2 className="font-display text-xl sm:text-2xl font-bold">
                  {content.displayName}
                </h2>
                <p className="text-xs sm:text-sm opacity-85 mt-0.5">{content.friendsLabel}</p>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:gap-3 pt-2 border-t border-[var(--kingdom-ink)]/15">
                <div className="min-w-0">
                  <p className="text-base sm:text-lg font-bold tabular-nums truncate">
                    {content.memoriesCount}
                  </p>
                  <p className="text-[11px] sm:text-xs opacity-80 break-words">{content.memoriesLabel}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-base sm:text-lg font-bold tabular-nums truncate">
                    {content.followerCount}
                  </p>
                  <p className="text-[11px] sm:text-xs opacity-80 break-words">{content.followerLabel}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-base sm:text-lg font-bold tabular-nums truncate">
                    {content.followingCount}
                  </p>
                  <p className="text-[11px] sm:text-xs opacity-80 break-words">{content.followingLabel}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleSendHug}
                className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#dec9e9] hover:bg-[#dac3e8] text-[#352063] px-4 py-2.5 text-xs sm:text-sm font-semibold active:scale-[0.98] transition-all cursor-pointer"
              >
                <Heart className="w-4 h-4 shrink-0" />
                <span>
                  {content.hugButtonText}
                  {hugCount > 0 ? ` (${hugCount})` : ''}
                </span>
              </button>

              <button
                type="button"
                onClick={handleShareLove}
                className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#dec9e9] hover:bg-[#dac3e8] text-[#352063] px-4 py-2.5 text-xs sm:text-sm font-semibold active:scale-[0.98] transition-all cursor-pointer"
              >
                <Share2 className="w-4 h-4 shrink-0" />
                <span>{content.shareButtonText}</span>
              </button>
            </div>
          </div>
        </section>

        {/* Section 3: Social Card */}
        <section id="social" className="scroll-mt-24 grid grid-cols-1 gap-5 items-stretch">
          <div className="rounded-[28px] bg-[var(--kingdom-cream)] p-6 sm:p-8 flex flex-col items-center justify-center text-center shadow-md space-y-4">
            <div className="w-24 h-24 rounded-full border-4 border-[var(--kingdom-wine)] overflow-hidden">
              {renderSlotMedia('s7', 'w-full h-full rounded-full')}
            </div>

            <div className="space-y-1 max-w-full px-2">
              <p className="text-base sm:text-lg font-bold text-[var(--kingdom-rose)] break-all">
                {normalizedIg}
              </p>
              <p className="text-xs opacity-75">Instagram</p>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-6 pt-3 w-full max-w-xs border-t border-[var(--kingdom-ink)]/15">
              <div className="min-w-0">
                <p className="text-base sm:text-lg font-bold tabular-nums truncate">{content.tiktokHugs}</p>
                <p className="text-xs opacity-80">Hugs</p>
              </div>
              <div className="min-w-0">
                <p className="text-base sm:text-lg font-bold tabular-nums truncate">{content.tiktokSmiles}</p>
                <p className="text-xs opacity-80">Smiles</p>
              </div>
              <div className="min-w-0">
                <p className="text-base sm:text-lg font-bold tabular-nums truncate">{content.tiktokLikes}</p>
                <p className="text-xs opacity-80">Likes</p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 4: Photo Collage & Extra Memories */}
        <section id="gallery" className="scroll-mt-24 rounded-[30px] bg-[var(--kingdom-cream)] p-4 sm:p-5 shadow-md space-y-4">
          <div className="rounded-full bg-[var(--kingdom-wine)] text-[var(--kingdom-ivory)] px-4 py-2.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full border-2 border-[var(--kingdom-ivory)] flex items-center justify-center shrink-0">
                <Crown className="w-4 h-4" />
              </div>
              <span className="font-semibold text-sm truncate">{content.displayName}</span>
            </div>
            <span className="text-xs text-[var(--kingdom-ivory)]/80 whitespace-nowrap">
              {videoCount > 0
                ? `${photoCount} ${photoCount === 1 ? 'photo' : 'photos'} · ${videoCount} ${videoCount === 1 ? 'video' : 'videos'}`
                : `${publishedPhotos.length} ${publishedPhotos.length === 1 ? 'photo' : 'photos'}`}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {renderSlotMedia('s10', 'row-span-2 min-h-[250px] sm:min-h-[320px] h-full rounded-2xl')}
            {renderSlotMedia('s11', 'h-32 sm:h-44 rounded-2xl')}
            {renderSlotMedia('s12', 'h-32 sm:h-44 rounded-2xl')}
            {renderSlotMedia('s13', 'col-span-2 h-44 sm:h-60 rounded-2xl')}
          </div>

          {extraPhotos.length > 0 && (
            <div className="pt-4 border-t border-[var(--kingdom-ink)]/15 space-y-3">
              <h3 className="text-sm font-semibold tracking-tight text-[var(--kingdom-rose)]">
                More Kingdom Memories
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                {extraPhotos.map((photo) => {
                  const isVideo = isVideoItem(photo);
                  const hasPosterImage =
                    Boolean(photo.imageData) &&
                    !photo.imageData.startsWith('data:video/') &&
                    !failedImages[photo.id];
                  const autoLoopVideoSrc = isVideo
                    ? galleryVideoSrcs[photo.id] ||
                      (photo.videoData && !getYouTubeEmbedUrl(photo.videoData)
                        ? photo.videoData
                        : undefined)
                    : undefined;

                  return (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => setLightboxPhoto(photo)}
                      className="group relative aspect-[4/3] rounded-2xl overflow-hidden bg-[var(--kingdom-wine)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kingdom-wine)]"
                    >
                      {autoLoopVideoSrc ? (
                        <video
                          src={autoLoopVideoSrc}
                          poster={hasPosterImage ? photo.imageData : undefined}
                          autoPlay
                          loop
                          muted
                          playsInline
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : hasPosterImage ? (
                        <img
                          src={photo.imageData}
                          alt={photo.caption || photo.sectionLabel}
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setFailedImages((prev) => ({ ...prev, [photo.id]: true }))
                          }
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[var(--kingdom-ivory)]">
                          <Crown className="w-6 h-6 opacity-80" />
                        </div>
                      )}

                      {isVideo && !autoLoopVideoSrc && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className="w-11 h-11 rounded-full bg-black/55 backdrop-blur-sm border border-white/30 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                            <Play className="w-5 h-5 fill-current ml-0.5" />
                          </span>
                        </div>
                      )}

                      {photo.caption && (
                        <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black/80 to-transparent text-left">
                          <p className="text-xs text-white font-medium truncate">
                            {photo.caption}
                          </p>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Section 5: Love Letter */}
        <section id="letter" className="scroll-mt-24 rounded-[30px] bg-[var(--kingdom-wine)] text-[var(--kingdom-ivory)] p-7 sm:p-10 shadow-md space-y-4">
          <h2 className="font-display text-2xl sm:text-3xl font-bold">
            {content.letterTitle}
          </h2>
          <div className="space-y-4 text-sm sm:text-base leading-relaxed text-[var(--kingdom-ivory)]/95 max-w-2xl">
            {letterParagraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
          <p className="pt-2 text-base font-semibold">{content.letterSignoff}</p>
        </section>

        {/* Section 6: Royal Finale */}
        <section className="py-10 sm:py-14 text-center space-y-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--kingdom-wine)] text-[var(--kingdom-ivory)] border border-[var(--kingdom-ivory)]/25 shadow-md">
            <Crown className="w-8 h-8" />
          </div>
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-[var(--kingdom-ink)] max-w-lg mx-auto text-balance leading-tight">
            {content.finaleTitle}
          </h2>
          <div className="flex flex-col items-center gap-4">
            <button
              type="button"
              onClick={() => triggerHeartBurst(['💜', '✨', '👑', '🪻', '💕', '🌸'])}
              className="min-h-[48px] rounded-full bg-[var(--kingdom-wine)] text-[var(--kingdom-ivory)] border-2 border-[var(--kingdom-ivory)]/80 px-8 py-3 text-sm sm:text-base font-bold hover:bg-[var(--kingdom-deep)] active:scale-[0.98] transition-all cursor-pointer shadow-lg"
            >
              {content.finaleButtonText}
            </button>
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-[var(--kingdom-ink)]/15 py-6 px-4 text-center text-xs text-[var(--kingdom-ink)]/75">
        <div className="max-w-5xl mx-auto flex items-center justify-center">
          <button
            type="button"
            onClick={onOpenAdmin}
            className="hover:text-[var(--kingdom-ink)] underline underline-offset-4 cursor-pointer"
          >
            {isAdmin ? 'Open Admin Dashboard' : 'Admin Sign In'}
          </button>
        </div>
      </footer>

      {/* Floating Hearts Effect & Burst Particles */}
      <FloatingHeartsOverlay
        enabled={ambientHeartsEnabled}
        burstParticles={particles}
      />

      {/* Action Toast */}
      {toastMessage && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-[var(--kingdom-deep)] text-[var(--kingdom-ivory)] border border-[var(--kingdom-ivory)]/25 px-4 py-2.5 text-xs sm:text-sm font-medium shadow-xl"
        >
          {toastMessage}
        </div>
      )}

      {/* Photo Lightbox Modal */}
      {lightboxPhoto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={lightboxPhoto.sectionLabel}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLightboxPhoto(null)}
        >
          <div
            className="relative max-w-3xl w-full rounded-2xl bg-[var(--kingdom-deep)] border border-[var(--kingdom-ivory)]/20 overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--kingdom-ivory)]/15 text-[var(--kingdom-ivory)]">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{lightboxPhoto.sectionLabel}</p>
                {lightboxPhoto.caption && (
                  <p className="text-xs text-[var(--kingdom-ivory)]/75 truncate">
                    {lightboxPhoto.caption}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setLightboxPhoto(null)}
                aria-label="Close photo preview"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-black flex items-center justify-center max-h-[78vh] min-h-[240px]">
              {isVideoItem(lightboxPhoto) ? (
                lightboxVideoLoading ? (
                  <div className="flex flex-col items-center justify-center gap-2.5 py-16 text-[var(--kingdom-ivory)]/85">
                    <Loader2 className="w-7 h-7 animate-spin" />
                    <span className="text-xs font-medium">Loading video...</span>
                  </div>
                ) : lightboxVideoError ? (
                  <div className="p-8 text-center text-xs text-red-300">
                    {lightboxVideoError}
                  </div>
                ) : lightboxVideoSrc ? (
                  (() => {
                    const ytEmbed = getYouTubeEmbedUrl(lightboxVideoSrc);
                    if (ytEmbed) {
                      return (
                        <iframe
                          src={ytEmbed}
                          title={lightboxPhoto.sectionLabel}
                          allow="autoplay; encrypted-media; picture-in-picture"
                          allowFullScreen
                          className="w-full aspect-video max-h-[78vh]"
                        />
                      );
                    }
                    return (
                      <video
                        src={lightboxVideoSrc}
                        controls
                        autoPlay
                        loop
                        playsInline
                        className="max-h-[78vh] w-full object-contain bg-black"
                      />
                    );
                  })()
                ) : null
              ) : (
                <img
                  src={lightboxPhoto.imageData}
                  alt={lightboxPhoto.caption || lightboxPhoto.sectionLabel}
                  referrerPolicy="no-referrer"
                  className="max-h-[78vh] w-auto object-contain"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
