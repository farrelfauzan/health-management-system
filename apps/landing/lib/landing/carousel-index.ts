/** What `useCarouselIndex` hands back: the visible slide and the ways to move it. */
export type CarouselIndex = {
  readonly index: number;
  readonly goTo: (index: number) => void;
  readonly goToNext: () => void;
  readonly goToPrevious: () => void;
};
