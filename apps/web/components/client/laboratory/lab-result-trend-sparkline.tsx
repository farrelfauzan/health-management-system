'use client';

type LabResultTrendSparklineProps = {
  /** Oldest first — the direction a trend is read in. */
  values: number[];
  label: string;
};

const VIEWBOX_WIDTH = 120;

const VIEWBOX_HEIGHT = 32;

const PADDING = 3;

/**
 * A test's last few released values, as one line (`P18-T07`).
 *
 * Deliberately unlabelled and unscaled: it answers "which way is this going",
 * and the table underneath answers "by how much". Drawing axes on a
 * hundred-pixel line would invite it to be read as a measurement, which at
 * this size it cannot be.
 *
 * Fewer than two points draws nothing — a single value has no direction, and a
 * flat line through one dot would suggest stability nobody has observed.
 */
export function LabResultTrendSparkline({ values, label }: LabResultTrendSparklineProps) {
  if (values.length < 2) {
    return null;
  }

  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = maximum - minimum || 1;
  const stepWidth = (VIEWBOX_WIDTH - PADDING * 2) / (values.length - 1);
  const points = values
    .map((value, index) => {
      const x = PADDING + index * stepWidth;
      const y =
        VIEWBOX_HEIGHT - PADDING - ((value - minimum) / span) * (VIEWBOX_HEIGHT - PADDING * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      className="h-8 w-[120px]"
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-primary"
      />
    </svg>
  );
}
