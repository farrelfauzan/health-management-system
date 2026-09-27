import type { ReactElement } from 'react';

import { BrandMark } from '#components/shared/brand-mark';
import { BrandWordmark } from '#components/shared/brand-wordmark';
import { SITE_CONTACT } from '#lib/landing/site-contact';

/** Brand line, section links and contact details. */
export function SiteFooter(): ReactElement {
  return (
    <footer id="kontak" className="border-t border-line bg-canvas">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-8 px-4 pt-12 pb-8 xl:gap-12 xl:px-20 xl:pt-14">
        <div className="rv grid gap-8 xl:grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,1fr))_minmax(0,1.4fr)] xl:gap-12">
          <div className="flex flex-col gap-3 xl:gap-4">
            <div className="flex items-center gap-2.5 xl:gap-3">
              <BrandMark className="size-8 xl:size-9" />
              <BrandWordmark className="text-xl xl:text-[22px]" />
            </div>
            <p className="max-w-[320px] text-sm leading-[1.55] text-ink-muted xl:text-[15px]">
              Sistem manajemen klinik yang terhubung dengan SATUSEHAT, dengan Miko sebagai asisten
              WhatsApp.
            </p>
          </div>
          <nav aria-label="Produk" className="flex flex-col gap-2.5 text-[15px] xl:gap-3">
            <span className="text-sm font-extrabold">Produk</span>
            <a href="#fitur" className="text-ink-muted hover:text-brand">
              Fitur
            </a>
            <a href="#modul" className="text-ink-muted hover:text-brand">
              Modul
            </a>
            <a href="#tampilan" className="text-ink-muted hover:text-brand">
              Tampilan
            </a>
            <a href="#miko" className="text-ink-muted hover:text-brand">
              Miko
            </a>
            <a href="#faq" className="text-ink-muted hover:text-brand">
              FAQ
            </a>
          </nav>
          <nav aria-label="Perusahaan" className="flex flex-col gap-2.5 text-[15px] xl:gap-3">
            <span className="text-sm font-extrabold">Perusahaan</span>
            <a href="#tentang" className="text-ink-muted hover:text-brand">
              Tentang kami
            </a>
            <a href="#privasi" className="text-ink-muted hover:text-brand">
              Kebijakan privasi
            </a>
            <a href="#syarat" className="text-ink-muted hover:text-brand">
              Syarat layanan
            </a>
          </nav>
          <address className="flex flex-col gap-2.5 text-[15px] not-italic xl:gap-3">
            <span className="text-sm font-extrabold">Kontak</span>
            <a href={`mailto:${SITE_CONTACT.email}`} className="text-ink-muted hover:text-brand">
              {SITE_CONTACT.email}
            </a>
            <a
              href={SITE_CONTACT.whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink-muted hover:text-brand"
            >
              WhatsApp {SITE_CONTACT.whatsappLabel}
            </a>
          </address>
        </div>
        <div className="flex flex-col gap-1 border-t border-line pt-5 text-[13px] text-ink-muted xl:flex-row xl:justify-between xl:text-sm">
          <span>© 2026 MetaKlinik</span>
          <span>Dibuat untuk klinik di Indonesia</span>
        </div>
      </div>
    </footer>
  );
}
