'use client';

import { Button, Icon, Tooltip, TooltipContent, TooltipTrigger } from '@hms/ui';

type PersonalDocumentActionButtonProps = {
  /** Material Symbols glyph name. */
  icon: string;
  /**
   * What the button does, in the user's language. It is the tooltip and the
   * accessible name at once: the glyph is `aria-hidden`, so without this the
   * button would announce as nothing at all.
   */
  label: string;
  disabled?: boolean;
  onClick: () => void;
};

/**
 * One icon action in the knowledge-base table.
 *
 * The row carries four actions and the labels are long enough in Indonesian
 * ("Indeks ulang") that spelling them out pushed the table into a horizontal
 * scroll. Icons buy that width back, and the tooltip is what stops them from
 * becoming a guessing game — which is the trade an icon-only control has to
 * pay for, not an optional flourish.
 */
export function PersonalDocumentActionButton({
  icon,
  label,
  disabled = false,
  onClick,
}: PersonalDocumentActionButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          <Icon name={icon} size={18} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
