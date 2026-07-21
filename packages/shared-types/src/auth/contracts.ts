export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: string;
};

export type RefreshedAuthTokens = {
  accessToken: string;
  tokenType: string;
  expiresIn: string;
};

export type LogoutResult = {
  success: boolean;
  message: string;
};
