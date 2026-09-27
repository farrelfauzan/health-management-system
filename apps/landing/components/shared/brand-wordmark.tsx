import type { ReactElement } from 'react';

import { joinClassNames } from '#lib/landing/join-class-names';

type BrandWordmarkProps = {
  className?: string;
};

/** "MetaKlinik" set as the logo: a light gradient "Meta" and a heavy navy "Klinik". */
export function BrandWordmark({ className }: BrandWordmarkProps): ReactElement {
  return (
    <span className={joinClassNames('leading-none tracking-tight whitespace-nowrap', className)}>
      <span className="wm-grad font-medium">Meta</span>
      <span className="font-extrabold text-navy">Klinik</span>
    </span>
  );
}
