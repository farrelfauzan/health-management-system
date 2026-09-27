'use client';

import type { ReactElement } from 'react';

import { LineIcon } from '#components/shared/line-icon';

type CarouselControlsProps = {
  count: number;
  index: number;
  onPrevious: () => void;
  onNext: () => void;
  onSelect: (index: number) => void;
};

const ARROW_BUTTON_CLASS_NAME =
  'flex size-11 items-center justify-center rounded-full border-[1.5px] border-line-strong bg-white text-navy hover:border-brand hover:text-brand xl:size-[52px]';

/** Previous/next buttons, a "03 / 08" counter and one dot per screen. */
export function CarouselControls({
  count,
  index,
  onPrevious,
  onNext,
  onSelect,
}: CarouselControlsProps): ReactElement {
  const formatPosition = (value: number): string => String(value).padStart(2, '0');
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          aria-label="Layar sebelumnya"
          onClick={onPrevious}
          className={ARROW_BUTTON_CLASS_NAME}
        >
          <LineIcon name="arrow-left" size={20} />
        </button>
        <button
          type="button"
          aria-label="Layar berikutnya"
          onClick={onNext}
          className={ARROW_BUTTON_CLASS_NAME}
        >
          <LineIcon name="arrow-right" size={20} />
        </button>
        <span className="ml-1.5 font-mono text-[13px] text-ink-muted xl:text-sm">
          {formatPosition(index + 1)} / {formatPosition(count)}
        </span>
      </div>
      <div className="flex items-center">
        {Array.from({ length: count }, (_, position) => (
          <button
            key={position}
            type="button"
            aria-label={`Tampilkan layar ${position + 1}`}
            aria-current={position === index}
            onClick={() => onSelect(position)}
            className="flex h-11 w-[22px] items-center justify-center"
          >
            <span className={position === index ? 'dot is-active' : 'dot'} />
          </button>
        ))}
      </div>
    </div>
  );
}
