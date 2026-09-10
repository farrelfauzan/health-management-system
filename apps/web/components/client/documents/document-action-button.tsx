'use client';

import { Button, Icon, Tooltip, TooltipContent, TooltipTrigger } from '@hms/ui';

type DocumentActionButtonProps = {
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
 * One icon action in a document table row.
 *
 * Shared by the personal knowledge base and the clinic corpus, which carry
 * four and five actions respectively. The labels are long enough in
 * Indonesian ("Proses ulang", "Kirim untuk ditinjau") that spelling them out
 * pushed both tables into a horizontal scroll. Icons buy that width back, and
 * the tooltip is what stops them from becoming a guessing game — which is the
 * trade an icon-only control has to pay for, not an optional flourish.
 *
 * It lives here rather than beside either table on purpose: two tables whose
 * rows read as the same control must not be free to drift apart.
 *
 * Needs a `TooltipProvider` ancestor. Put one around the whole row rather than
 * one per button, so a group of actions the reader takes in as a single thing
 * shares a single delay timer. This app has no global provider.
 */
export function DocumentActionButton({
  icon,
  label,
  disabled = false,
  onClick,
}: DocumentActionButtonProps) {
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
