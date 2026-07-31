'use client';

import { Icon } from '@hms/ui';

type AssistantDisclaimerProps = {
  disclaimer: string;
};

/**
 * Renders the server-supplied disclaimer attached to one assistant reply.
 * Deliberately per-message and never derived locally: the API returns the
 * text in the response envelope's `meta`, and showing a locally-held string
 * instead would let the UI claim a disclaimer the backend did not send.
 */
export function AssistantDisclaimer({ disclaimer }: AssistantDisclaimerProps) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
      <Icon name="info" size={16} className="mt-0.5 shrink-0 text-current" />
      <span>{disclaimer}</span>
    </p>
  );
}
