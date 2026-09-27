import type { ReactElement } from 'react';

import { BrandMark } from '#components/shared/brand-mark';
import { LineIcon } from '#components/shared/line-icon';
import { MikoMascot } from '#components/shared/miko-mascot';
import { SITE_CONTACT } from '#lib/landing/site-contact';

/** The closing call to action with a waving Miko. */
export function DemoCtaSection(): ReactElement {
  return (
    <section id="demo" className="bg-canvas">
      <div className="mx-auto max-w-[1440px] px-4 pt-4 pb-16 xl:px-20 xl:pt-10 xl:pb-24">
        <div className="rv-s relative grid overflow-hidden rounded-[28px] bg-brand px-6 py-8 text-center text-white xl:grid-cols-[minmax(0,1fr)_300px] xl:items-center xl:gap-12 xl:rounded-[32px] xl:px-[72px] xl:py-16 xl:text-left">
          <BrandMark
            tone="white"
            className="absolute -top-[60px] left-1/2 size-[340px] -translate-x-1/2 opacity-35 xl:-top-[68px] xl:right-[-60px] xl:left-auto xl:size-[520px] xl:translate-x-0"
          />
          <div className="relative order-2 flex flex-col items-center xl:order-1 xl:items-start">
            <h2 className="mt-5 text-[32px] leading-[1.15] font-extrabold tracking-[-0.03em] xl:mt-0 xl:max-w-[640px] xl:text-[52px] xl:leading-[1.08]">
              Siap merapikan alur klinik Anda?
            </h2>
            <p className="mt-3 text-base leading-[1.55] text-[#dce6ff] xl:mt-5 xl:max-w-[600px] xl:text-xl">
              Jadwalkan demo. Kami tunjukkan alurnya langsung, dari pendaftaran sampai laporan
              SATUSEHAT.
            </p>
            <div className="mt-7 flex w-full flex-col gap-3 xl:mt-9 xl:w-auto xl:flex-row xl:gap-3.5">
              <a
                href={SITE_CONTACT.demoHref}
                className="flex h-[52px] items-center justify-center gap-2.5 rounded-[14px] bg-white px-7 text-base font-bold text-navy hover:bg-mist xl:h-14 xl:text-[17px]"
              >
                Jadwalkan demo
                <LineIcon name="arrow-right" size={20} />
              </a>
              <a
                href={SITE_CONTACT.whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-[52px] items-center justify-center gap-2.5 rounded-[14px] border-[1.5px] border-white/55 px-6 text-base font-bold text-white hover:border-white hover:bg-white/10 xl:h-14 xl:text-[17px]"
              >
                <LineIcon name="chat" size={20} />
                Chat WhatsApp
              </a>
            </div>
          </div>
          <div className="relative order-1 flex justify-center xl:order-2">
            <MikoMascot mood="hello" className="size-[180px] xl:size-[280px]" />
          </div>
        </div>
      </div>
    </section>
  );
}
