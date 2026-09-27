import type { ReactElement } from 'react';

import { BRAND_PLUS_PATH } from '#lib/landing/brand-plus-path';
import { BRAND_WAVE_RIBBONS } from '#lib/landing/brand-wave-ribbons';

const RIBBON_GRADIENTS: Readonly<Record<string, readonly [string, string]>> = {
  'mw-b1': ['#2448F0', '#2F9BFF'],
  'mw-b2': ['#079C80', '#22C3B0'],
  'mw-b3': ['#0891D1', '#5FD4F5'],
  'mw-b4': ['#5B45F0', '#8E7BFF'],
};

/**
 * The social preview drawn for `ImageResponse`: inline styles only, since the renderer
 * supports neither classes nor blend modes.
 */
export function SocialImageCard(): ReactElement {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 64,
        padding: '0 96px',
        background: '#F8F9FF',
        fontFamily: 'Plus Jakarta Sans',
        color: '#0B1C30',
      }}
    >
      <div
        style={{
          width: 380,
          height: 380,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 999,
          background: '#EFF4FF',
        }}
      >
        <svg width="340" height="340" viewBox="0 0 200 200">
          <defs>
            {Object.entries(RIBBON_GRADIENTS).map(([className, [from, to]]) => (
              <linearGradient key={className} id={className} x1="0" y1="1" x2="1" y2="0">
                <stop offset="0" stopColor={from} />
                <stop offset="1" stopColor={to} />
              </linearGradient>
            ))}
            <linearGradient id="plus" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#1F5BF0" />
              <stop offset="1" stopColor="#0FB39B" />
            </linearGradient>
          </defs>
          {BRAND_WAVE_RIBBONS.map((ribbon) => (
            <path
              key={ribbon.className}
              d={ribbon.path}
              fill={`url(#${ribbon.className})`}
              fillRule="evenodd"
              opacity={0.55}
            />
          ))}
          <path d={BRAND_PLUS_PATH} fill="url(#plus)" />
        </svg>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ display: 'flex', fontSize: 44, letterSpacing: -1 }}>
          <span style={{ fontWeight: 500, color: '#1F5BF0' }}>Meta</span>
          <span style={{ fontWeight: 800 }}>Klinik</span>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontSize: 72,
            fontWeight: 800,
            lineHeight: 1.02,
            letterSpacing: -3,
          }}
        >
          <span>Lebih dari</span>
          <span>
            sekadar <span style={{ color: '#0050CB', marginLeft: 18 }}>RME.</span>
          </span>
        </div>
        <div style={{ display: 'flex', fontSize: 28, fontWeight: 500, color: '#424656' }}>
          Bertenaga AI, terhubung SATUSEHAT
        </div>
        <div style={{ display: 'flex', fontSize: 24, fontWeight: 500, color: '#006A61' }}>
          metaklinik.renovix.id
        </div>
      </div>
    </div>
  );
}
