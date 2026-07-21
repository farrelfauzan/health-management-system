import { Avatar, AvatarFallback, cn } from '@hms/ui';

import { getInitials } from '#lib/shared/initials';

type AvatarInitialsProps = {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const SIZE_CLASSES: Record<NonNullable<AvatarInitialsProps['size']>, string> = {
  sm: 'size-7 text-[11px]',
  md: 'size-9 text-xs',
  lg: 'size-11 text-sm',
};

export function AvatarInitials({ name, size = 'md', className }: AvatarInitialsProps) {
  return (
    <Avatar className={cn(SIZE_CLASSES[size], className)}>
      <AvatarFallback className="bg-primary-fixed font-heading font-medium text-on-primary-fixed-variant">
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
