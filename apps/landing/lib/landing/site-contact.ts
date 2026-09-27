const WHATSAPP_NUMBER = '6281381035295';
const WHATSAPP_GREETING = 'Halo, saya ingin tahu lebih lanjut tentang MetaKlinik.';

/**
 * Public contact details. The bracketed values are placeholders until the business
 * confirms them; `demoHref` is where every "Jadwalkan demo" button points.
 * `whatsappHref` is a wa.me link, which opens the WhatsApp app on phones and
 * WhatsApp Web or Desktop elsewhere.
 */
export const SITE_CONTACT = {
  email: '[EMAIL]',
  whatsappLabel: '+62 813-8103-5295',
  whatsappHref: `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_GREETING)}`,
  address: '[ALAMAT KANTOR]',
  demoHref: '#kontak',
} as const;
