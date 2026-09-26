'use client';

import { useState } from 'react';
import { cn } from '@hms/ui';

import { BrandMark } from '#components/shared/brand-mark';
import { useBrandWaveMotion } from '#hooks/use-brand-wave-motion';

type AnimatedBrandMarkProps = {
  size: number;
  label: string;
  className?: string;
};

/**
 * The MetaKlinik mark that starts listening when pointed at: hovering eases
 * the calm ring into a moving sound wave, and leaving settles it back.
 */
export function AnimatedBrandMark({ size, label, className }: AnimatedBrandMarkProps) {
  const [isListening, setIsListening] = useState(false);
  const paths = useBrandWaveMotion(isListening);
  return (
    <span
      className={cn('inline-flex shrink-0', className)}
      onPointerEnter={() => setIsListening(true)}
      onPointerLeave={() => setIsListening(false)}
    >
      <BrandMark size={size} label={label} paths={paths} />
    </span>
  );
}
