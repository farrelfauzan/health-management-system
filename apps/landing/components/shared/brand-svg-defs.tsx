import type { ReactElement } from 'react';

import { BRAND_MARK_SYMBOL_ID } from '#lib/landing/brand-mark-symbol-id';
import { BRAND_PLUS_PATH } from '#lib/landing/brand-plus-path';
import { BRAND_WAVE_RIBBONS } from '#lib/landing/brand-wave-ribbons';

/**
 * The gradients and the logo symbol, rendered once per page. Every `BrandMark` and
 * `MikoMascot` references these ids, so the page carries one copy of the ribbon paths.
 */
export function BrandSvgDefs(): ReactElement {
  return (
    <svg
      width="0"
      height="0"
      aria-hidden="true"
      focusable="false"
      style={{ position: 'absolute', overflow: 'hidden' }}
    >
      <defs>
        <linearGradient id="mwGb1" gradientUnits="userSpaceOnUse" x1="20" y1="40" x2="180" y2="160">
          <stop offset="0" stopColor="#2448F0" />
          <stop offset="1" stopColor="#2F9BFF" />
        </linearGradient>
        <linearGradient id="mwGb2" gradientUnits="userSpaceOnUse" x1="180" y1="30" x2="30" y2="170">
          <stop offset="0" stopColor="#079C80" />
          <stop offset="1" stopColor="#22C3B0" />
        </linearGradient>
        <linearGradient
          id="mwGb3"
          gradientUnits="userSpaceOnUse"
          x1="100"
          y1="20"
          x2="100"
          y2="180"
        >
          <stop offset="0" stopColor="#0891D1" />
          <stop offset="1" stopColor="#5FD4F5" />
        </linearGradient>
        <linearGradient id="mwGb4" gradientUnits="userSpaceOnUse" x1="30" y1="170" x2="170" y2="30">
          <stop offset="0" stopColor="#5B45F0" />
          <stop offset="1" stopColor="#8E7BFF" />
        </linearGradient>
        <linearGradient
          id="mwPlusG"
          gradientUnits="userSpaceOnUse"
          x1="76"
          y1="76"
          x2="124"
          y2="124"
        >
          <stop offset="0" stopColor="#1F5BF0" />
          <stop offset="1" stopColor="#0FB39B" />
        </linearGradient>
        <linearGradient
          id="mkBody"
          gradientUnits="userSpaceOnUse"
          x1="50"
          y1="58"
          x2="196"
          y2="206"
        >
          <stop offset="0" stopColor="#4F8BFF" />
          <stop offset=".5" stopColor="#1E63E9" />
          <stop offset="1" stopColor="#14B8A6" />
        </linearGradient>
        <symbol id={BRAND_MARK_SYMBOL_ID} viewBox="0 0 200 200" overflow="visible">
          {BRAND_WAVE_RIBBONS.map((ribbon) => (
            <g key={ribbon.className} className={`mw-bundle ${ribbon.className}`}>
              <path d={ribbon.path} />
            </g>
          ))}
          <path className="mw-plus" d={BRAND_PLUS_PATH} />
        </symbol>
      </defs>
    </svg>
  );
}
