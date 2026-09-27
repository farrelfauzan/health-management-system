'use client';

import type { ReactElement } from 'react';

import { CarouselControls } from '#components/client/landing/carousel-controls';
import { ScreenFrame } from '#components/client/landing/screen-frame';
import { ScreenSlideCopy } from '#components/client/landing/screen-slide-copy';
import { useCarouselIndex } from '#hooks/use-carousel-index';
import { CAROUSEL_INTERVAL_MS } from '#lib/landing/carousel-interval-ms';
import type { ScreenSlide } from '#lib/landing/screen-slide';

type ScreenCarouselProps = {
  slides: readonly ScreenSlide[];
};

/** Screenshots on the right, their story on the left; advances every few seconds. */
export function ScreenCarousel({ slides }: ScreenCarouselProps): ReactElement {
  const { index, goTo, goToNext, goToPrevious } = useCarouselIndex({
    count: slides.length,
    intervalMs: CAROUSEL_INTERVAL_MS,
  });
  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Tampilan aplikasi MetaKlinik"
      className="rv-s grid gap-6 xl:grid-cols-[440px_minmax(0,1fr)] xl:items-center xl:gap-16"
    >
      <div className="order-2 flex flex-col gap-5 xl:order-1 xl:justify-between xl:gap-12 xl:py-6">
        <div className="relative h-[230px] xl:h-[340px]" aria-live="polite">
          {slides.map((slide, position) => (
            <ScreenSlideCopy key={slide.id} slide={slide} isActive={position === index} />
          ))}
        </div>
        <CarouselControls
          count={slides.length}
          index={index}
          onPrevious={goToPrevious}
          onNext={goToNext}
          onSelect={goTo}
        />
      </div>
      <div className="relative order-1 aspect-[358/226] w-full xl:order-2 xl:aspect-[776/468]">
        {slides.map((slide, position) => (
          <ScreenFrame key={slide.id} slide={slide} isActive={position === index} />
        ))}
      </div>
    </div>
  );
}
