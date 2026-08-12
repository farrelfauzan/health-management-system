/**
 * What a client receives on login or refresh (SJ-6).
 *
 * The refresh token is deliberately absent. It travels only as an `httpOnly`
 * cookie the API sets, so no script on the page can read it — returning it in
 * the body as well would hand it straight back to JavaScript and make the
 * cookie flag decorative.
 */
export type AuthTokens = {
  accessToken: string;
  tokenType: string;
  expiresIn: string;
};

export type RefreshedAuthTokens = AuthTokens;

export type LogoutResult = {
  success: boolean;
  message: string;
};
