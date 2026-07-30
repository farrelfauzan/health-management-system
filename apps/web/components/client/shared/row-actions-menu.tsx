'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
  cn,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

export type RowAction = {
  label: string;
  onSelect: () => void;
  icon?: string;
  isDestructive?: boolean;
  isDisabled?: boolean;
};

type RowActionsMenuProps = {
  actions: RowAction[];
  triggerLabel?: string;
};

export function RowActionsMenu({ actions, triggerLabel }: RowActionsMenuProps) {
  const t = useTranslations('shared.accessibility');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={triggerLabel ?? t('openRowActions')}
        >
          <Icon name="more_vert" size={18} className="text-slate-500" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((action) => (
          <DropdownMenuItem
            key={action.label}
            disabled={action.isDisabled}
            variant={action.isDestructive ? 'destructive' : 'default'}
            onSelect={action.onSelect}
            className={cn(action.isDestructive && 'text-danger')}
          >
            {action.icon ? <Icon name={action.icon} size={16} /> : null}
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
