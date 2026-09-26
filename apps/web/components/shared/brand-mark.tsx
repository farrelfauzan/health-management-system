import { useId } from 'react';

import { BRAND_PLUS_PATH } from '#lib/brand/brand-plus-path';
import { BRAND_STATIC_WAVE_PATHS } from '#lib/brand/brand-static-wave-paths';
import { BRAND_WAVE_BUNDLES } from '#lib/brand/brand-wave-bundles';

type BrandMarkProps = {
  /** Rendered width and height in pixels. */
  size: number;
  /** Accessible name, e.g. "Logo MetaKlinik". */
  label: string;
  /** Ribbon paths to draw; the calm, static ring when omitted. */
  paths?: readonly string[];
  className?: string;
};

const RIBBON_OPACITY = 0.55;

/**
 * The MetaKlinik mark: four translucent sound-wave ribbons around a rounded
 * health plus. Drawn for light surfaces, where overlapping ribbons multiply
 * into deeper tones like layered ink.
 */
export function BrandMark({
  size,
  label,
  paths = BRAND_STATIC_WAVE_PATHS,
  className,
}: BrandMarkProps) {
  const id = useId();
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox="0 0 200 200"
      className={className}
      style={{ overflow: 'visible', isolation: 'isolate' }}
    >
      <defs>
        {BRAND_WAVE_BUNDLES.map((bundle, index) => (
          <linearGradient
            key={bundle.gradient.from}
            id={`${id}-ribbon-${index}`}
            gradientUnits="userSpaceOnUse"
            x1={bundle.gradient.x1}
            y1={bundle.gradient.y1}
            x2={bundle.gradient.x2}
            y2={bundle.gradient.y2}
          >
            <stop offset="0" stopColor={bundle.gradient.from} />
            <stop offset="1" stopColor={bundle.gradient.to} />
          </linearGradient>
        ))}
        <linearGradient
          id={`${id}-plus`}
          gradientUnits="userSpaceOnUse"
          x1="76"
          y1="76"
          x2="124"
          y2="124"
        >
          <stop offset="0" stopColor="#1F5BF0" />
          <stop offset="1" stopColor="#0FB39B" />
        </linearGradient>
      </defs>
      {paths.map((path, index) => (
        <path
          key={BRAND_WAVE_BUNDLES[index]?.gradient.from ?? index}
          d={path}
          fill={`url(#${id}-ribbon-${index})`}
          fillRule="evenodd"
          opacity={RIBBON_OPACITY}
          style={{ mixBlendMode: 'multiply' }}
        />
      ))}
      <path d={BRAND_PLUS_PATH} fill={`url(#${id}-plus)`} />
    </svg>
  );
}
