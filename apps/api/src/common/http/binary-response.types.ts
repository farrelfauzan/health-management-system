import { Writable } from 'node:stream';

/**
 * The part of an HTTP response a route needs in order to stream a binary body
 * itself: a writable stream plus the two headers that make a browser save the
 * bytes instead of rendering them.
 *
 * Declared structurally rather than imported from `express`, following
 * `RefreshTokenCookieWriter` in `modules/auth/auth.types.ts`. The API is a
 * framework internal here — nothing about the platform belongs in a shared
 * contract — and a narrow type also says plainly which two capabilities a
 * streaming route is allowed to reach for.
 */
export type BinaryResponseWriter = Writable & {
  setHeader(name: string, value: string): unknown;
};
