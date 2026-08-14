/**
 * The one place the Telegram webhook's address is written down.
 *
 * Two things need to agree on it and they sit far apart: the controller that
 * *serves* the route, and the registration that *tells Telegram where it is*.
 * A mismatch between them is the worst kind of bug this channel can have —
 * `setWebhook` succeeds against any well-formed url, so the registration looks
 * healthy while every delivery 404s, and the only symptom is a bot that stops
 * replying. Composing both from the same segments makes the mismatch
 * unrepresentable rather than merely unlikely.
 *
 * `publicPath` reproduces the global prefix and URI versioning set in
 * `main.ts`. That coupling is the one thing here a type cannot enforce, which
 * is why the channel-gateway integration spec posts to this exact path and
 * asserts the route answers — a 404 there means somebody changed the prefix
 * and this constant did not follow.
 */
const API_GLOBAL_PREFIX = 'api';
const CONTROLLER_VERSION = '1';
const CONTROLLER_PATH = 'channels/telegram';
const ROUTE_PATH = 'webhook';

export const TELEGRAM_WEBHOOK_ROUTE = {
  version: CONTROLLER_VERSION,
  controllerPath: CONTROLLER_PATH,
  routePath: ROUTE_PATH,
  publicPath: `/${API_GLOBAL_PREFIX}/v${CONTROLLER_VERSION}/${CONTROLLER_PATH}/${ROUTE_PATH}`,
} as const;
