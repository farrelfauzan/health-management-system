import type { TelegramWebhookHealth } from '@hms/shared-types';

/**
 * Collapses the webhook health into the one thing an operator should do next.
 *
 * **Ordered worst-first, and the order carries the meaning.** Several of these
 * can be true at once, and the first match has to be the one that actually
 * needs acting on. A deployment with no domain is also unregistered, but
 * telling somebody to press a button that cannot work is worse than telling
 * them what to configure. A hijacked webhook is also delivering fine — to
 * somebody else — so it must outrank a healthy read.
 *
 * `PAUSED` sits below the faults on purpose: a channel that is switched off is
 * not broken, but a *misconfigured* channel that is also switched off should
 * still surface its misconfiguration, so it is found before the switch is
 * flipped rather than after customers arrive.
 */
export function resolveTelegramWebhookStatus(
  webhook: TelegramWebhookHealth,
): 'NOT_CONFIGURED' | 'NO_DOMAIN' | 'HIJACKED' | 'UNREGISTERED' | 'DELIVERY_FAILING' | 'PAUSED' | 'HEALTHY' {
  if (!webhook.isConfigured) {
    return 'NOT_CONFIGURED';
  }
  if (webhook.expectedUrl === null) {
    return 'NO_DOMAIN';
  }
  if (webhook.registeredUrl !== null && !webhook.isMatching) {
    return 'HIJACKED';
  }
  if (webhook.registeredUrl === null) {
    return 'UNREGISTERED';
  }
  // A remembered error with nothing queued behind it is a fault that already
  // passed; only a live backlog means deliveries are failing now.
  if (webhook.pendingUpdateCount > 0 && !webhook.isLastErrorStale) {
    return 'DELIVERY_FAILING';
  }
  if (!webhook.isChannelEnabled) {
    return 'PAUSED';
  }
  return 'HEALTHY';
}
