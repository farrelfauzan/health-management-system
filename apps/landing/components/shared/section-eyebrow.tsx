import type { ReactElement, ReactNode } from 'react';

import { joinClassNames } from '#lib/landing/join-class-names';

type SectionEyebrowProps = {
  children: ReactNode;
  className?: string;
};

/** The small monospaced label above a section heading. */
export function SectionEyebrow({ children, className }: SectionEyebrowProps): ReactElement {
  return (
    <p
      className={joinClassNames(
        'font-mono text-xs tracking-[0.08em] text-ink-muted uppercase xl:text-[13px]',
        className,
      )}
    >
      {children}
    </p>
  );
}
