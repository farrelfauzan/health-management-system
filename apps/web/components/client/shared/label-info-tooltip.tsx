'use client';

import type { ReactNode } from 'react';
import { Icon, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, cn } from '@hms/ui';
import { useTranslations } from 'next-intl';

const INFO_ICON_SIZE = 16;

type LabelInfoTooltipProps = {
  /** Visible label of the field being explained; names the trigger for screen readers. */
  field: string;
  children: ReactNode;
  className?: string;
};

/**
 * Info icon that opens a tooltip on hover and on keyboard focus. Render it
 * beside a `FormLabel` (never inside it: a button inside a `<label>` is not
 * valid HTML and its name would leak into the input's accessible name). Use
 * it for guidance that needs more than one sentence or cites a source; a
 * one-liner belongs in `FieldDescription`.
 */
export function LabelInfoTooltip({ field, children, className }: LabelInfoTooltipProps) {
  const t = useTranslations('shared.form');
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={t('moreAbout', { field })}
            className={cn(
              'inline-flex size-5 shrink-0 items-center justify-center rounded-full text-slate-500 outline-none hover:text-slate-900 focus-visible:ring-[3px] focus-visible:ring-ring/50',
              className,
            )}
          >
            <Icon name="info" size={INFO_ICON_SIZE} />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-left text-pretty">{children}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
