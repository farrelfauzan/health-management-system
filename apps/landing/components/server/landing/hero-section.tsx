import type { ReactElement } from 'react';

import { CheckPoint } from '#components/server/landing/check-point';
import { HeroBookingCard } from '#components/server/landing/hero-booking-card';
import { HeroChatCard } from '#components/server/landing/hero-chat-card';
import { BrandMark } from '#components/shared/brand-mark';
import { LineIcon } from '#components/shared/line-icon';
import { MikoMascot } from '#components/shared/miko-mascot';
import { SITE_CONTACT } from '#lib/landing/site-contact';

/** The opening statement, its call to action, and Miko inside the listening ring. */
export function HeroSection(): ReactElement {
  return (
    <section
      id="top"
      className="mx-auto grid max-w-[1440px] gap-8 px-4 pt-8 pb-10 xl:min-h-[760px] xl:grid-cols-[minmax(0,1fr)_560px] xl:items-center xl:gap-14 xl:px-20 xl:pt-10 xl:pb-20"
    >
      <div className="flex flex-col items-start">
        <p className="in in1 flex h-8 items-center gap-2 rounded-full border border-line bg-white pr-3.5 pl-2.5 text-[13px] font-semibold text-teal-deep xl:h-9 xl:gap-2.5 xl:pr-4 xl:pl-3 xl:text-sm">
          <span className="size-2 rounded-full bg-teal" aria-hidden="true" />
          Terhubung dengan SATUSEHAT Kemenkes
        </p>
        <h1 className="in in2 mt-5 max-w-[680px] text-[40px] leading-[1.08] font-extrabold tracking-[-0.035em] text-balance xl:mt-7 xl:text-[72px] xl:leading-[1.04]">
          Satu sistem untuk seluruh <span className="text-brand">perjalanan pasien.</span>
        </h1>
        <p className="in in3 mt-4 max-w-[600px] text-[17px] leading-[1.55] font-medium text-pretty text-ink-muted xl:mt-6 xl:text-xl">
          Pendaftaran, pemeriksaan, apotek, kasir, sampai laporan SATUSEHAT dalam satu tempat.
          Pasien bisa daftar sendiri lewat WhatsApp, dibantu Miko.
        </p>
        <div className="in in4 mt-7 flex w-full flex-col gap-3 xl:mt-9 xl:w-auto xl:flex-row xl:gap-3.5">
          <a
            href={SITE_CONTACT.demoHref}
            className="flex h-[52px] items-center justify-center gap-2.5 rounded-[14px] bg-brand px-7 text-base font-bold text-white hover:bg-brand-dark xl:h-14 xl:text-[17px]"
          >
            Jadwalkan demo
            <LineIcon name="arrow-right" size={20} />
          </a>
          <a
            href="#modul"
            className="flex h-[52px] items-center justify-center rounded-[14px] border-[1.5px] border-line-strong bg-white px-[26px] text-base font-bold text-navy hover:border-brand hover:text-brand xl:h-14 xl:text-[17px]"
          >
            Lihat semua modul
          </a>
        </div>
        <div className="in in5 mt-4 flex flex-col gap-2 text-sm font-medium text-ink-muted xl:mt-6 xl:flex-row xl:items-center xl:gap-5 xl:text-[15px]">
          <CheckPoint label="Gratis 1 bulan sebagai klinik pilot" />
          <CheckPoint label="Data lama dipindahkan tim kami" />
        </div>
      </div>
      <div className="in in6 relative mx-auto h-[450px] w-full max-w-[358px] xl:h-[640px] xl:w-[560px] xl:max-w-none">
        <div className="in-fade absolute top-0 left-1/2 size-[300px] -translate-x-1/2 rounded-full bg-mist xl:top-[30px] xl:left-10 xl:size-[480px] xl:translate-x-0" />
        <BrandMark className="ring-spin absolute -top-[50px] left-1/2 size-[400px] -translate-x-1/2 xl:-left-10 xl:size-[640px] xl:translate-x-0" />
        <div className="in-pop absolute top-[55px] left-1/2 -translate-x-1/2 xl:top-[120px] xl:left-[130px] xl:translate-x-0">
          <MikoMascot mood="hello" className="size-[190px] xl:size-[300px]" />
        </div>
        <HeroBookingCard />
        <HeroChatCard />
      </div>
    </section>
  );
}
