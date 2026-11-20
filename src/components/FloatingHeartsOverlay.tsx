import React from 'react';

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
  left: string;
  size: number;
  duration: string;
  delay: string;
  driftX: string;
  tilt: string;
  opacity: number;
  color: string;
}

const LAVENDER_HEARTS: AmbientHeartConfig[] = [
  { id: 1, left: '6%', size: 16, duration: '12s', delay: '-2s', driftX: '18px', tilt: '-12deg', opacity: 0.55, color: '#dec9e9' },
  { id: 2, left: '13%', size: 22, duration: '15s', delay: '-7s', driftX: '-22px', tilt: '10deg', opacity: 0.45, color: '#c19ee0' },
  { id: 3, left: '21%', size: 14, duration: '11s', delay: '-4s', driftX: '14px', tilt: '8deg', opacity: 0.6, color: '#f6f1fc' },
  { id: 4, left: '29%', size: 24, duration: '16s', delay: '-10s', driftX: '-16px', tilt: '-14deg', opacity: 0.4, color: '#b185db' },
  { id: 5, left: '37%', size: 18, duration: '13s', delay: '-1s', driftX: '20px', tilt: '12deg', opacity: 0.5, color: '#d2b7e5' },
  { id: 6, left: '45%', size: 15, duration: '10.5s', delay: '-6s', driftX: '-12px', tilt: '-8deg', opacity: 0.55, color: '#dec9e9' },
  { id: 7, left: '53%', size: 20, duration: '14s', delay: '-9s', driftX: '24px', tilt: '15deg', opacity: 0.42, color: '#a06cd5' },
  { id: 8, left: '61%', size: 14, duration: '11.5s', delay: '-3s', driftX: '-18px', tilt: '-10deg', opacity: 0.58, color: '#f6f1fc' },
  { id: 9, left: '68%', size: 23, duration: '15.5s', delay: '-12s', driftX: '16px', tilt: '9deg', opacity: 0.45, color: '#c19ee0' },
  { id: 10, left: '76%', size: 17, duration: '12.5s', delay: '-5s', driftX: '-20px', tilt: '-12deg', opacity: 0.52, color: '#d2b7e5' },
  { id: 11, left: '84%', size: 21, duration: '14.5s', delay: '-8s', driftX: '14px', tilt: '11deg', opacity: 0.46, color: '#b185db' },
  { id: 12, left: '92%', size: 15, duration: '11s', delay: '-2.5s', driftX: '-15px', tilt: '-9deg', opacity: 0.55, color: '#dec9e9' },
];

export const FloatingHeartsOverlay: React.FC<FloatingHeartsOverlayProps> = ({
  enabled,
  burstParticles = [],
}) => {
  return (
    <>
      {enabled && (
        <div
          aria-hidden="true"
          className="fixed inset-0 pointer-events-none overflow-hidden z-20"
        >
          {LAVENDER_HEARTS.map((heart) => (
            <span
              key={heart.id}
              className="ambient-floating-heart"
              style={
                {
                  left: heart.left,
                  color: heart.color,
                  animationDuration: heart.duration,
                  animationDelay: heart.delay,
                  '--heart-drift': heart.driftX,
                  '--heart-tilt': heart.tilt,
                  '--heart-opacity': heart.opacity,
                } as React.CSSProperties
              }
            >
              <svg
                width={heart.size}
                height={heart.size}
                viewBox="0 0 24 24"
                fill="currentColor"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
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
