/**
 * The operations dashboard (P29-T01 skeleton). `asOf` is the instant the
 * figures were read, shown on every dashboard as "Data per …" (NFR-AN-04).
 * The metrics themselves arrive with the shared analytics contract (P29-T02)
 * and the operations endpoint (P29-T04).
 */
export type AnalyticsOperationsView = {
  asOf: string;
};
