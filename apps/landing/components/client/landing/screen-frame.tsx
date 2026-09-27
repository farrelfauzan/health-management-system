'use client';

import Image from 'next/image';
import type { ReactElement } from 'react';

import { ScreenPlaceholder } from '#components/client/landing/screen-placeholder';
import type { ScreenSlide } from '#lib/landing/screen-slide';

type ScreenFrameProps = {
  slide: ScreenSlide;
  isActive: boolean;
};

const WINDOW_DOT_COLORS: readonly string[] = ['#FF8A80', '#FFD27A', '#7FE0A6'];

/** A browser window holding one screenshot; frames are stacked and cross-fade. */
export function ScreenFrame({ slide, isActive }: ScreenFrameProps): ReactElement {
  return (
    <figure
      aria-hidden={!isActive}
      className={`${isActive ? 'shot is-active' : 'shot'} absolute inset-0 m-0 flex flex-col overflow-hidden rounded-2xl border border-[#dce3ef] bg-white shadow-[0_30px_60px_-30px_rgba(11,28,48,.35)] xl:rounded-[20px]`}
    >
      <div className="flex h-[30px] shrink-0 items-center gap-1.5 border-b border-[#eef1f6] bg-canvas px-3 xl:h-11 xl:gap-2 xl:px-4">
        {WINDOW_DOT_COLORS.map((color) => (
          <span
            key={color}
            className="size-2 rounded-full xl:size-[11px]"
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
      <div className="relative grow bg-canvas">
        {slide.imageSrc ? (
          <Image
            src={slide.imageSrc}
            alt={`Tampilan ${slide.label} di MetaKlinik`}
            fill
            sizes="(min-width: 1024px) 780px, 100vw"
            className="object-cover object-left-top"
          />
        ) : (
          <ScreenPlaceholder slide={slide} />
        )}
      </div>
    </figure>
  );
}
