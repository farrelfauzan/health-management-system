import type { LineIconName } from '#lib/landing/line-icon-name';

/** One reason MetaKlinik is more than a plain EMR. */
export type MetaPoint = {
  readonly icon: LineIconName;
  readonly color: string;
  readonly title: string;
  readonly description: string;
};
