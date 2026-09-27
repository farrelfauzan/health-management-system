import type { SocialImageFont } from '#lib/landing/social-image-font';

const FAMILY = 'Plus Jakarta Sans';
const WEIGHTS: readonly SocialImageFont['weight'][] = [500, 800];

async function loadWeight(weight: SocialImageFont['weight']): Promise<SocialImageFont | null> {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${FAMILY.replace(/ /g, '+')}:wght@${weight}`;
  const css = await (await fetch(cssUrl)).text();
  const fontUrl = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
  if (!fontUrl) {
    return null;
  }
  const data = await (await fetch(fontUrl)).arrayBuffer();
  return { name: FAMILY, data, weight, style: 'normal' };
}

/**
 * Fetches the brand face from Google Fonts for the social preview image. Any failure
 * falls back to the renderer's default font instead of breaking the build.
 */
export async function loadSocialImageFonts(): Promise<SocialImageFont[]> {
  try {
    const fonts = await Promise.all(WEIGHTS.map(loadWeight));
    return fonts.filter((font): font is SocialImageFont => font !== null);
  } catch {
    return [];
  }
}
