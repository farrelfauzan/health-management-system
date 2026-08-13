/**
 * The slice of Nest's CORS options this API sets (SJ-1). Declared structurally
 * so the resolver can be unit-tested without constructing a Nest application,
 * and so `origin` is a plain list rather than the `boolean | function | …`
 * union the framework accepts — the whole point of the ticket is that it is
 * never `true`.
 */
export type CorsOptions = {
  readonly origin: string[];
  readonly methods: string[];
  readonly allowedHeaders: string[];
  readonly exposedHeaders: string[];
  readonly credentials: boolean;
};
