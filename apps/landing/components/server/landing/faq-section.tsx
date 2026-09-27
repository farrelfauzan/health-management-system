import type { ReactElement } from 'react';

import { FaqAccordionItem } from '#components/server/landing/faq-accordion-item';
import { LineIcon } from '#components/shared/line-icon';
import { SectionEyebrow } from '#components/shared/section-eyebrow';
import { FAQ_ITEMS } from '#lib/landing/faq-items';
import { SITE_CONTACT } from '#lib/landing/site-contact';

/** Answers to what clinic owners ask before switching, with a WhatsApp way out for the rest. */
export function FaqSection(): ReactElement {
  return (
    <section id="faq" className="bg-white">
      <div className="mx-auto grid max-w-[1440px] gap-8 px-4 py-16 xl:grid-cols-[420px_minmax(0,1fr)] xl:gap-16 xl:px-20 xl:py-24">
        <div className="rv flex flex-col gap-3 xl:sticky xl:top-28 xl:gap-4 xl:self-start">
          <SectionEyebrow>Pertanyaan umum</SectionEyebrow>
          <h2 className="text-[32px] leading-[1.15] font-extrabold tracking-[-0.03em] xl:text-5xl xl:leading-[1.1]">
            Yang sering ditanyakan klinik.
          </h2>
          <p className="text-base leading-[1.55] text-ink-muted xl:text-lg">
            Belum menemukan jawabannya? Tanyakan langsung ke tim kami lewat WhatsApp.
          </p>
          <a
            href={SITE_CONTACT.whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex h-[52px] items-center justify-center gap-2.5 self-stretch rounded-[14px] border-[1.5px] border-line-strong bg-white px-6 text-base font-bold text-navy hover:border-brand hover:text-brand xl:self-start"
          >
            <LineIcon name="chat" size={20} />
            Tanya lewat WhatsApp
          </a>
        </div>
        <div className="rv border-t border-line">
          {FAQ_ITEMS.map((item) => (
            <FaqAccordionItem key={item.question} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}
