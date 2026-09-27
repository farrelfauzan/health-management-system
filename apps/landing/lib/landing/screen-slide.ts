/** One screen in the product carousel: the copy on the left and the screenshot on the right. */
export type ScreenSlide = {
  readonly id: string;
  readonly tag: string;
  readonly tagColor: string;
  readonly title: string;
  readonly description: string;
  readonly route: string;
  readonly label: string;
  readonly imageSrc: string | null;
};
