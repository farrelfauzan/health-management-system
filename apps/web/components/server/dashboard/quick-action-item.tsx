import Link from 'next/link';
import { Icon, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@hms/ui';

type QuickActionItemProps = {
  icon: string;
  title: string;
  description: string;
  href?: string;
  disabledReason?: string;
};

export function QuickActionItem({
  icon,
  title,
  description,
  href,
  disabledReason,
}: QuickActionItemProps) {
  const content = (
    <span className="flex items-center gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-info-tint text-primary">
        <Icon name={icon} size={20} />
      </span>
      <span className="flex min-w-0 flex-col text-left">
        <span className="font-heading text-sm font-medium text-slate-900">{title}</span>
        <span className="text-xs text-slate-500">{description}</span>
      </span>
    </span>
  );
  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-lg px-2 py-2 transition-colors hover:bg-slate-50"
      >
        {content}
      </Link>
    );
  }
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span aria-disabled="true" className="block cursor-not-allowed rounded-lg px-2 py-2 opacity-60">
            {content}
          </span>
        </TooltipTrigger>
        <TooltipContent>{disabledReason}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
