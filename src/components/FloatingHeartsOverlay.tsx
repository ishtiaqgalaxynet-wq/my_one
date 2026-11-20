import React, { useEffect, useState } from 'react';

export type BurstEffectVariant = 'hug' | 'share' | 'royal';

export interface FloatingBurstParticle {
  id: number;
  emoji: string;
  left: string;
  size: number;
  variant?: BurstEffectVariant;
  drift?: string;
  delayMs?: number;
}

interface FloatingHeartsOverlayProps {
  enabled: boolean;
  burstParticles?: FloatingBurstParticle[];
}

interface AmbientHeartConfig {
  id: number;
  emoji: string;
  left: string;
  size: number;
  duration: string;
  delay: string;
  driftX: string;
  tilt: string;
  opacity: number;
}

interface DynamicHeartParticle {
  id: number;
  emoji: string;
  left: string;
  size: number;
  durationMs: number;
  driftX: string;
  opacity: number;
}

const HEART_EMOJIS = ['💖', '💕', '💗', '💜', '💓', '💞', '🩷'];

const AMBIENT_HEARTS: AmbientHeartConfig[] = [
  { id: 1, emoji: '💖', left: '6%', size: 16, duration: '12s', delay: '-2s', driftX: '18px', tilt: '-12deg', opacity: 0.72 },
  { id: 2, emoji: '💜', left: '13%', size: 20, duration: '15s', delay: '-7s', driftX: '-22px', tilt: '10deg', opacity: 0.65 },
  { id: 3, emoji: '💕', left: '21%', size: 15, duration: '11s', delay: '-4s', driftX: '14px', tilt: '8deg', opacity: 0.75 },
  { id: 4, emoji: '💗', left: '29%', size: 22, duration: '16s', delay: '-10s', driftX: '-16px', tilt: '-14deg', opacity: 0.62 },
  { id: 5, emoji: '💞', left: '37%', size: 18, duration: '13s', delay: '-1s', driftX: '20px', tilt: '12deg', opacity: 0.7 },
  { id: 6, emoji: '🩷', left: '45%', size: 15, duration: '10.5s', delay: '-6s', driftX: '-12px', tilt: '-8deg', opacity: 0.74 },
  { id: 7, emoji: '💓', left: '53%', size: 19, duration: '14s', delay: '-9s', driftX: '24px', tilt: '15deg', opacity: 0.66 },
  { id: 8, emoji: '💖', left: '61%', size: 15, duration: '11.5s', delay: '-3s', driftX: '-18px', tilt: '-10deg', opacity: 0.74 },
  { id: 9, emoji: '💜', left: '68%', size: 21, duration: '15.5s', delay: '-12s', driftX: '16px', tilt: '9deg', opacity: 0.64 },
  { id: 10, emoji: '💕', left: '76%', size: 17, duration: '12.5s', delay: '-5s', driftX: '-20px', tilt: '-12deg', opacity: 0.7 },
  { id: 11, emoji: '💗', left: '84%', size: 20, duration: '14.5s', delay: '-8s', driftX: '14px', tilt: '11deg', opacity: 0.66 },
  { id: 12, emoji: '🩷', left: '92%', size: 16, duration: '11s', delay: '-2.5s', driftX: '-15px', tilt: '-9deg', opacity: 0.72 },
];

const MAX_DYNAMIC_HEARTS = 14;

function createDynamicHeart(): DynamicHeartParticle {
  const durationMs = 5800 + Math.floor(Math.random() * 2400);
  const driftSign = Math.random() > 0.5 ? 1 : -1;
  return {
    id: Date.now() + Math.random(),
    emoji: HEART_EMOJIS[Math.floor(Math.random() * HEART_EMOJIS.length)],
    left: `${4 + Math.random() * 92}%`,
    size: 14 + Math.floor(Math.random() * 12),
    durationMs,
    driftX: `${driftSign * (14 + Math.floor(Math.random() * 26))}px`,
    opacity: 0.65 + Math.random() * 0.25,
  };
}

export const FloatingHeartsOverlay: React.FC<FloatingHeartsOverlayProps> = ({
  enabled,
  burstParticles = [],
}) => {
  const [dynamicHearts, setDynamicHearts] = useState<DynamicHeartParticle[]>([]);

  // Periodically generate floating heart emojis when enabled
  useEffect(() => {
    if (!enabled) {
      setDynamicHearts([]);
      return;
    }
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const timers = new Set<number>();

    const spawnHeart = () => {
      const next = createDynamicHeart();
      setDynamicHearts((prev) => [...prev.slice(-(MAX_DYNAMIC_HEARTS - 1)), next]);
      const cleanupId = window.setTimeout(() => {
        timers.delete(cleanupId);
        setDynamicHearts((prev) => prev.filter((item) => item.id !== next.id));
      }, next.durationMs + 150);
      timers.add(cleanupId);
    };

    // Seed initial gentle heart emojis right away
    for (let i = 0; i < 4; i++) {
      const seedTimer = window.setTimeout(() => {
        timers.delete(seedTimer);
        spawnHeart();
      }, i * 320);
      timers.add(seedTimer);
    }

    const intervalId = window.setInterval(() => {
      spawnHeart();
    }, 1150);

    return () => {
      window.clearInterval(intervalId);
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
    };
  }, [enabled]);

  return (
    <>
      {/* Continuous & Periodic Floating Heart Emojis */}
      {enabled && (
        <div
          aria-hidden="true"
          className="fixed inset-0 pointer-events-none overflow-hidden z-20"
        >
          {AMBIENT_HEARTS.map((heart) => (
            <span
              key={heart.id}
              className="ambient-floating-heart"
              style={
                {
                  left: heart.left,
                  fontSize: `${heart.size}px`,
                  animationDuration: heart.duration,
                  animationDelay: heart.delay,
                  '--heart-drift': heart.driftX,
                  '--heart-tilt': heart.tilt,
                  '--heart-opacity': heart.opacity,
                } as React.CSSProperties
              }
            >
              {heart.emoji}
            </span>
          ))}

          {dynamicHearts.map((heart) => (
            <span
              key={heart.id}
              className="dynamic-floating-heart"
              style={
                {
                  left: heart.left,
                  fontSize: `${heart.size}px`,
                  animationDuration: `${heart.durationMs}ms`,
                  '--heart-drift': heart.driftX,
                  '--heart-opacity': heart.opacity,
                } as React.CSSProperties
              }
            >
              {heart.emoji}
            </span>
          ))}
        </div>
      )}

      {burstParticles.map((particle) => {
        const effectClass =
          particle.variant === 'hug'
            ? 'floating-effect-hug'
            : particle.variant === 'share'
              ? 'floating-effect-share'
              : particle.variant === 'royal'
                ? 'floating-effect-royal'
                : 'floating-heart';

        return (
          <span
            key={particle.id}
            aria-hidden="true"
            className={effectClass}
            style={
              {
                left: particle.left,
                fontSize: `${particle.size}px`,
                animationDelay: particle.delayMs ? `${particle.delayMs}ms` : undefined,
                '--burst-drift': particle.drift ?? '24px',
              } as React.CSSProperties
            }
          >
            {particle.emoji}
          </span>
        );
      })}
    </>
  );
};
