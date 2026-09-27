import { ImageResponse } from 'next/og';

import { SocialImageCard } from '#components/shared/social-image-card';
import { loadSocialImageFonts } from '#lib/landing/load-social-image-fonts';
import { SOCIAL_IMAGE_SIZE } from '#lib/landing/social-image-size';

export const alt = 'MetaKlinik — Lebih dari sekadar RME. Aplikasi klinik terhubung SATUSEHAT.';
export const size = SOCIAL_IMAGE_SIZE;
export const contentType = 'image/png';

/** The preview shown when the site is shared on WhatsApp, LinkedIn, Facebook and the like. */
export default async function OpenGraphImage(): Promise<ImageResponse> {
  return new ImageResponse(<SocialImageCard />, {
    ...SOCIAL_IMAGE_SIZE,
    fonts: await loadSocialImageFonts(),
  });
}
