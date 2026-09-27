import type { ReactElement } from 'react';

import { MetaPointCard } from '#components/server/landing/meta-point-card';
import { SectionEyebrow } from '#components/shared/section-eyebrow';
import { META_POINTS } from '#lib/landing/meta-points';

/** Why the product is called Meta: an EMR that runs the whole clinic. */
export function MetaSection(): ReactElement {
  return (
    <section id="fitur" className="bg-white">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-8 px-4 py-16 xl:gap-14 xl:px-20 xl:py-24">
        <div className="rv grid gap-3.5 xl:grid-cols-[minmax(0,1fr)_600px] xl:items-end xl:gap-16">
          <div className="flex flex-col gap-3.5 xl:gap-4">
            <SectionEyebrow>Kenapa namanya Meta</SectionEyebrow>
            <h2 className="text-[40px] leading-[1.05] font-extrabold tracking-[-0.035em] xl:text-[64px] xl:leading-[1.02] xl:tracking-[-0.04em]">
              Lebih dari sekadar <span className="text-brand">RME.</span>
            </h2>
          </div>
          <p className="text-base leading-relaxed text-ink-muted xl:text-lg">
            MetaKlinik mencatat rekam medis, lalu melangkah lebih jauh: pendaftaran, pemeriksaan,
            apotek, lab, kasir, pajak, laporan SATUSEHAT, sampai asisten AI,{' '}
            <strong className="text-navy">semuanya dalam satu sistem</strong>.
          </p>
        </div>
        <div className="stagger grid gap-3.5 xl:grid-cols-4 xl:gap-5">
          {META_POINTS.map((point) => (
            <MetaPointCard key={point.title} point={point} />
          ))}
        </div>
      </div>
    </section>
  );
}
