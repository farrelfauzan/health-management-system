export type JwtExpiresIn = number | `${number}${'ms' | 's' | 'm' | 'h' | 'd' | 'w' | 'y'}`;

export function resolveJwtExpiresIn(
  value: string | undefined,
  fallback: JwtExpiresIn,
): JwtExpiresIn {
  const rawValue = value?.trim();

  if (!rawValue) {
    return fallback;
  }

  if (/^\d+$/.test(rawValue)) {
    return Number(rawValue);
  }

  return rawValue as JwtExpiresIn;
}
