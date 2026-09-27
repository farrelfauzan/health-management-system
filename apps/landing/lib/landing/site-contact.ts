const WHATSAPP_NUMBER = '6281381035295';
const WHATSAPP_GREETING = 'Halo, saya ingin tahu lebih lanjut tentang MetaKlinik.';

/**
 * Public contact details shown in the footer; `demoHref` is where every "Jadwalkan
 * demo" button points. `whatsappHref` is a wa.me link, which opens the WhatsApp app on
 * phones and WhatsApp Web or Desktop elsewhere. The office address stays off the page
 * until the business wants it public.
 */
export const SITE_CONTACT = {
  email: 'farrelfauzan78@gmail.com',
  whatsappLabel: '0813-8103-5295',
  phoneE164: '+6281381035295',
  whatsappHref: `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_GREETING)}`,
  demoHref: '#kontak',
} as const;
