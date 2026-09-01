'use client';

import * as React from 'react';

import { Button } from '#components/button';
import { cn } from '#lib/utils';

type RichTextEditorToolbarButtonProps = {
  label: string;
  onPress: () => void;
  isActive?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
};

export function RichTextEditorToolbarButton({
  label,
  onPress,
  isActive = false,
  disabled = false,
  children,
}: RichTextEditorToolbarButtonProps): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      aria-pressed={isActive}
      disabled={disabled}
      onClick={onPress}
      className={cn('size-8', isActive && 'bg-accent text-accent-foreground')}
    >
      {children}
    </Button>
  );
}
