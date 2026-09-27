import type { ReactElement } from 'react';

import { MobileMenu } from '#components/client/landing/mobile-menu';
import { BrandMark } from '#components/shared/brand-mark';
import { BrandWordmark } from '#components/shared/brand-wordmark';
import { NAV_LINKS } from '#lib/landing/nav-links';
import { SITE_CONTACT } from '#lib/landing/site-contact';

/** Sticky top bar: logo, section links and the demo button. */
export function SiteHeader(): ReactElement {
  return (
    <header className="nav-bar border-b border-line bg-canvas">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 xl:h-[88px] xl:px-20">
        <a
          href="#top"
          aria-label="MetaKlinik, ke atas"
          className="flex items-center gap-2 xl:gap-3"
        >
          <BrandMark className="size-[30px] xl:size-10" />
          <BrandWordmark className="text-[19px] xl:text-2xl" />
        </a>
        <nav aria-label="Menu utama" className="hidden items-center gap-10 xl:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-[15px] font-semibold text-navy hover:text-brand"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-6 xl:flex">
          <a
            href={SITE_CONTACT.demoHref}
            className="flex h-12 items-center rounded-xl bg-brand px-[22px] text-[15px] font-bold text-white hover:bg-brand-dark"
          >
            Jadwalkan demo
          </a>
        </div>
        <MobileMenu links={NAV_LINKS} demoHref={SITE_CONTACT.demoHref} />
      </div>
    </header>
  );
}
