import { CorsOptions } from './cors-options.type';

/**
 * Methods and headers the API actually uses. Listed rather than reflected,
 * because `Access-Control-Allow-Headers` echoing whatever was asked for is how
 * a header nobody audited becomes part of the contract.
 */
const ALLOWED_METHODS: readonly string[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'];
const ALLOWED_HEADERS: readonly string[] = ['Content-Type', 'Authorization', 'X-Request-Id'];
const EXPOSED_HEADERS: readonly string[] = ['X-Request-Id'];

/**
 * Origins allowed when `CORS_ALLOWED_ORIGINS` is unset. Development only: the
 * two ports a developer runs the web app on, and nothing else.
 */
const DEVELOPMENT_ORIGINS: readonly string[] = ['http://localhost:3000', 'http://127.0.0.1:3000'];

/**
 * Builds the CORS policy from configuration (SJ-1).
 *
 * Replaces `origin: true`, which reflected whatever `Origin` arrived. Combined
 * with `credentials: true` that is an open door: any site a signed-in user
 * visits could call this API with their cookies attached and read the replies.
 * SameSite=Strict on the refresh cookie limited the damage, but "limited by a
 * second control" is not the same as "not allowed".
 *
 * An allowlist read from the environment is also what makes SJ-1's
 * IP-to-hostname cutover a config change rather than a deploy: the day the
 * clinic gets a real domain, this moves from `http://10.0.0.5:3000` to
 * `https://hms.example.id` without touching code.
 *
 * **Production refuses to fall back.** With `NODE_ENV=production` and no
 * allowlist configured, the policy is empty — every cross-origin request is
 * refused — rather than quietly admitting `localhost`. A misconfigured
 * deployment should be visibly broken, not invisibly permissive.
 */
export function resolveCorsOptions(env: Record<string, string | undefined>): CorsOptions {
  return {
    origin: readAllowedOrigins(env),
    methods: [...ALLOWED_METHODS],
    allowedHeaders: [...ALLOWED_HEADERS],
    exposedHeaders: [...EXPOSED_HEADERS],
    credentials: true,
  };
}

function readAllowedOrigins(env: Record<string, string | undefined>): string[] {
  const configured = (env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  if (configured.length > 0) {
    return configured;
  }
  return env.NODE_ENV === 'production' ? [] : [...DEVELOPMENT_ORIGINS];
}
