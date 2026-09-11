/**
 * The KFA lookup is a live call to SATUSEHAT, not a local table: every
 * keystroke past the threshold costs an upstream request, and a two-letter
 * term against a national dictionary returns noise. Three characters is the
 * shortest term worth spending a call on.
 */
export const MIN_KFA_SEARCH_LENGTH = 3;

export const KFA_SEARCH_LIMIT = 20;

/** How long typing must pause before the term is sent upstream. */
export const KFA_SEARCH_DEBOUNCE_MS = 350;
