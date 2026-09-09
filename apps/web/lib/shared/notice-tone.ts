/**
 * Tone of a notification (toast or inline notice). `error` and `warning` are
 * statement tones: they describe a condition the user has to act on, so their
 * title renders bold in the tone colour. `success` and `info` stay regular weight.
 */
export type NoticeTone = 'error' | 'warning' | 'success' | 'info';
