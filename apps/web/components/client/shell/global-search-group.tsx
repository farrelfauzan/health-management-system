'use client';

import { CommandGroup, CommandItem, Icon } from '@hms/ui';

export type GlobalSearchGroupItem = {
  key: string;
  title: string;
  subtitle?: string;
  icon?: string;
  href: string;
};

type GlobalSearchGroupProps = {
  heading: string;
  items: GlobalSearchGroupItem[];
  onNavigate: (href: string) => void;
};

export function GlobalSearchGroup({ heading, items, onNavigate }: GlobalSearchGroupProps) {
  if (items.length === 0) {
    return null;
  }
  return (
    <CommandGroup heading={heading}>
      {items.map((item) => (
        <CommandItem key={item.key} value={item.key} onSelect={() => onNavigate(item.href)}>
          {item.icon ? (
            <Icon name={item.icon} size={18} className="text-muted-foreground" />
          ) : null}
          <span className="truncate">{item.title}</span>
          {item.subtitle ? (
            <span className="ml-auto truncate text-xs text-muted-foreground">{item.subtitle}</span>
          ) : null}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}
