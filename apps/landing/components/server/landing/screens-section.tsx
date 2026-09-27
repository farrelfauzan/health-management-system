import type { ReactElement } from 'react';

import { ScreenCarousel } from '#components/client/landing/screen-carousel';
import { SectionEyebrow } from '#components/shared/section-eyebrow';
import { SCREEN_SLIDES } from '#lib/landing/screen-slides';

/** Real screenshots of the app in an auto-advancing carousel; slides still waiting for a screenshot stay hidden. */
export function ScreensSection(): ReactElement {
  const capturedSlides = SCREEN_SLIDES.filter((slide) => slide.imageSrc !== null);
  return (
    <section id="tampilan" className="bg-white">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 py-16 xl:gap-12 xl:px-20 xl:py-24">
        <div className="rv flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between xl:gap-12">
          <div className="flex flex-col gap-3 xl:gap-3.5">
            <SectionEyebrow>Lihat langsung</SectionEyebrow>
            <h2 className="text-[32px] leading-[1.15] font-extrabold tracking-[-0.03em] xl:text-5xl xl:leading-[1.1]">
              Begini MetaKlinik dipakai sehari-hari.
            </h2>
          </div>
          <p className="hidden max-w-[420px] text-lg leading-normal text-ink-muted xl:block">
            Tampilan asli aplikasi MetaKlinik, bukan ilustrasi. Geser untuk melihat layar lainnya.
          </p>
        </div>
        <ScreenCarousel slides={capturedSlides} />
      </div>
    </section>
  );
}
