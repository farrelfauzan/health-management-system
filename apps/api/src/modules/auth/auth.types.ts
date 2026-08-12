/**
 * The slice of the Express response the auth controller uses to manage the
 * refresh cookie, and the slice of the request that carries it back (SJ-6).
 * Declared structurally so the controller does not depend on Express types
 * leaking through its signature.
 */
export type RefreshTokenCookieOptions = {
  readonly httpOnly: boolean;
  readonly secure: boolean;
  readonly sameSite: 'strict' | 'lax' | 'none';
  readonly path: string;
  readonly maxAge?: number;
};

export type RefreshTokenCookieWriter = {
  cookie(name: string, value: string, options: RefreshTokenCookieOptions): unknown;
  clearCookie(name: string, options: Omit<RefreshTokenCookieOptions, 'maxAge'>): unknown;
};

/**
 * Only the raw header. Express 5 does not parse cookies and the API does not
 * pull in `cookie-parser` for the single cookie it reads — the parser below is
 * shorter than the dependency's type stub.
 */
export type RefreshTokenCookieCarrier = {
  readonly headers?: { readonly cookie?: string };
};
