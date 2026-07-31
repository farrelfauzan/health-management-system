/**
 * One entry in the sidebar's recent-consultation list, projected from a real
 * `ChatSessionView`. A session with no title yet (nothing has been asked)
 * falls back to a localized placeholder at the call site.
 */
export type ConsultationHistoryEntry = {
  id: string;
  title: string;
};
