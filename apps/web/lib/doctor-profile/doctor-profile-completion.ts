/**
 * The doctor profile-completion screen (P20-T02), and the query parameter
 * that carries where the doctor was going when `proxy.ts` sent them there.
 * The page only honours a `next` inside the doctor shell, so this can never
 * become an open redirect.
 */
export const DOCTOR_PROFILE_COMPLETION = {
  path: '/doctor/complete-profile',
  nextParam: 'next',
} as const;
