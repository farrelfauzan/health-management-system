'use client';

import { useState, type ReactElement } from 'react';

import { LineIcon } from '#components/shared/line-icon';
import type { NavLink } from '#lib/landing/nav-link';

type MobileMenuProps = {
  links: readonly NavLink[];
  demoHref: string;
};

/** Phone-width header controls: the demo button and a menu that drops the section links. */
export function MobileMenu({ links, demoHref }: MobileMenuProps): ReactElement {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const closeMenu = (): void => setIsOpen(false);
  return (
    <div className="flex items-center gap-2 xl:hidden">
      <a
        href={demoHref}
        className="flex h-11 items-center rounded-xl bg-brand px-4 text-sm font-bold text-white hover:bg-brand-dark"
      >
        Demo
      </a>
      <button
        type="button"
        aria-label={isOpen ? 'Tutup menu' : 'Buka menu'}
        aria-expanded={isOpen}
        aria-controls="mobile-menu-panel"
        onClick={() => setIsOpen((open) => !open)}
        className="flex size-11 items-center justify-center rounded-xl border border-line bg-white text-navy"
      >
        <LineIcon name={isOpen ? 'close' : 'menu'} size={22} />
      </button>
      {isOpen && (
        <nav
          id="mobile-menu-panel"
          aria-label="Menu utama"
          className="panel absolute inset-x-0 top-16 flex flex-col border-b border-line bg-canvas px-4 pb-4"
        >
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={closeMenu}
              className="flex h-12 items-center border-b border-line text-base font-semibold text-navy"
            >
              {link.label}
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}
