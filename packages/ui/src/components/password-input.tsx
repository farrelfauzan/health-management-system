'use client';

import * as React from 'react';
import { EyeIcon, EyeOffIcon } from 'lucide-react';

import { Button } from '#components/button';
import { Input } from '#components/input';
import { cn } from '#lib/utils';

type PasswordInputLabels = {
  show: string;
  hide: string;
};

type PasswordInputProps = Omit<React.ComponentProps<'input'>, 'type'> & {
  labels?: PasswordInputLabels;
};

const DEFAULT_PASSWORD_INPUT_LABELS: PasswordInputLabels = {
  show: 'Show password',
  hide: 'Hide password',
};

/**
 * An `Input` for passwords and other secrets, with a trailing button that
 * reveals what was typed. Masked by default; the button's name says what
 * pressing it will do, so a screen reader hears "Show password" or "Hide
 * password" rather than a bare toggle state.
 */
export function PasswordInput({
  className,
  disabled,
  labels = DEFAULT_PASSWORD_INPUT_LABELS,
  ...props
}: PasswordInputProps): React.JSX.Element {
  const [isVisible, setIsVisible] = React.useState(false);
  return (
    <div className="relative">
      <Input
        {...props}
        type={isVisible ? 'text' : 'password'}
        disabled={disabled}
        // Last, so a caller's `px-*` cannot slide the text under the button.
        className={cn(className, 'pr-10')}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={disabled}
        aria-label={isVisible ? labels.hide : labels.show}
        aria-controls={props.id}
        onClick={() => setIsVisible((wasVisible) => !wasVisible)}
        className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        {isVisible ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
      </Button>
    </div>
  );
}
