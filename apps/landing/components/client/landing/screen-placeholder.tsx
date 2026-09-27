'use client';

import type { ReactElement } from 'react';

import type { ScreenSlide } from '#lib/landing/screen-slide';

type ScreenPlaceholderProps = {
  slide: ScreenSlide;
};

/** Stands in for a screenshot that has not been captured yet. */
export function ScreenPlaceholder({ slide }: ScreenPlaceholderProps): ReactElement {
  return (
    <div className="absolute inset-3 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#b7c4dc] bg-mist text-center text-ink-muted">
      <span className="text-sm font-bold text-navy xl:text-[17px]">Segera: {slide.label}</span>
      <span className="font-mono text-[11px] xl:text-[13px]">{slide.route}</span>
    </div>
  );
}
