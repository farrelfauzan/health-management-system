import type { ReactElement } from 'react';

import { BRAND_MARK_SYMBOL_ID } from '#lib/landing/brand-mark-symbol-id';
import { joinClassNames } from '#lib/landing/join-class-names';

type BrandMarkProps = {
  /** Rendered width and height in pixels; omit to size it with `className`. */
  size?: number;
  /** `white` is the flat variant for coloured backgrounds. */
  tone?: 'color' | 'white';
  /** Accessible name; the mark is decorative when omitted. */
  label?: string;
  className?: string;
};

/** The MetaKlinik wave mark, drawn from the shared symbol in `BrandSvgDefs`. */
export function BrandMark({
  size,
  tone = 'color',
  label,
  className,
}: BrandMarkProps): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={joinClassNames(
        'block overflow-visible',
        tone === 'white' && 'mw-white',
        className,
      )}
    >
      <use href={`#${BRAND_MARK_SYMBOL_ID}`} />
    </svg>
  );
}
