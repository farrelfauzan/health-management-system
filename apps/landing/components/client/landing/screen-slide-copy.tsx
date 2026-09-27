'use client';

import type { ReactElement } from 'react';

import type { ScreenSlide } from '#lib/landing/screen-slide';

type ScreenSlideCopyProps = {
  slide: ScreenSlide;
  isActive: boolean;
};

/** The words beside a screenshot; copies are stacked and slide in when their screen shows. */
export function ScreenSlideCopy({ slide, isActive }: ScreenSlideCopyProps): ReactElement {
  return (
    <div
      aria-hidden={!isActive}
      className={`${isActive ? 'slide is-active' : 'slide'} absolute inset-0 flex flex-col gap-2.5 xl:gap-[18px]`}
    >
      <span
        className="self-start rounded-full border border-line bg-white px-3 py-1.5 text-xs font-bold xl:text-sm"
        style={{ color: slide.tagColor }}
      >
        {slide.tag}
      </span>
      <h3 className="text-2xl leading-[1.2] font-extrabold tracking-[-0.025em] xl:text-[40px] xl:leading-[1.12]">
        {slide.title}
      </h3>
      <p className="text-[15px] leading-[1.55] text-ink-muted xl:text-lg">{slide.description}</p>
    </div>
  );
}
