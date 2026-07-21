import * as React from 'react';

import { cn } from '#lib/utils';

type IconProps = {
  name: string;
  size?: number;
  fill?: boolean;
  className?: string;
};

/**
 * Renders a self-hosted Material Symbols Outlined glyph.
 * The variable font is bundled via the `material-symbols` package,
 * imported once in `styles/globals.css` — no runtime CDN requests.
 */
function Icon({ name, size = 20, fill = false, className }: IconProps) {
  return (
    <span
      aria-hidden="true"
      data-slot="icon"
      className={cn('material-symbols-outlined shrink-0 select-none leading-none', className)}
      style={{
        fontSize: size,
        fontVariationSettings: `'FILL' ${fill ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 24`,
      }}
    >
      {name}
    </span>
  );
}

export { Icon };
