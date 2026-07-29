type IntegrationProviderLogoProps = {
  provider: 'bpjs' | 'satusehat';
};

const PROVIDER_LOGOS = {
  bpjs: {
    alt: 'BPJS PCare',
    height: 31,
    src: 'https://www.bpjs-kesehatan.go.id/assets/img/logo/logo-color.svg',
    width: 202,
  },
  satusehat: {
    alt: 'SATUSEHAT',
    height: 73,
    src: 'https://satusehat.kemkes.go.id/platform/assets/illustrations/logo-satset.png',
    width: 326,
  },
} as const;

export function IntegrationProviderLogo({ provider }: IntegrationProviderLogoProps) {
  const logo = PROVIDER_LOGOS[provider];

  return (
    // Provider-hosted brand assets stay unmodified and are not bundled as HMS-owned artwork.
    <img
      src={logo.src}
      alt={logo.alt}
      width={logo.width}
      height={logo.height}
      className="h-5 w-auto max-w-32 object-contain"
    />
  );
}
