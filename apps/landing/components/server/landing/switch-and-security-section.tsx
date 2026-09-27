import type { ReactElement } from 'react';

import { FeatureListItem } from '#components/server/landing/feature-list-item';
import { SectionEyebrow } from '#components/shared/section-eyebrow';

/** Two objections answered side by side: switching from another EMR, and patient-data safety. */
export function SwitchAndSecuritySection(): ReactElement {
  return (
    <section id="pindah" className="bg-canvas">
      <div className="mx-auto grid max-w-[1440px] gap-4 px-4 py-16 xl:grid-cols-2 xl:gap-8 xl:px-20 xl:py-24">
        <div className="rv-l flex flex-col gap-3 rounded-3xl bg-mist px-6 py-7 xl:gap-4 xl:rounded-[28px] xl:p-12">
          <SectionEyebrow className="text-brand">Sudah pakai RME lain?</SectionEyebrow>
          <h3 className="text-[26px] leading-[1.2] font-extrabold tracking-[-0.025em] xl:text-4xl xl:leading-[1.15]">
            Pindahnya kami bantu, klinik tetap jalan.
          </h3>
          <ul className="mt-3 flex flex-col gap-[18px] xl:mt-4 xl:gap-[22px]">
            <FeatureListItem icon="check" tone="brand">
              Nomor rekam medis lama tetap berlaku, pasien tidak perlu nomor baru.
            </FeatureListItem>
            <FeatureListItem icon="check" tone="brand">
              Tim kami memindahkan data dokter, obat, dan tarif layanan.
            </FeatureListItem>
            <FeatureListItem icon="check" tone="brand">
              Coba dulu gratis 1 bulan sebagai klinik pilot sebelum memutuskan.
            </FeatureListItem>
          </ul>
        </div>
        <div className="rv-r flex flex-col gap-3 rounded-3xl border border-line bg-white px-6 py-7 xl:gap-4 xl:rounded-[28px] xl:p-12">
          <SectionEyebrow className="text-teal-deep">Keamanan data pasien</SectionEyebrow>
          <h3 className="text-[26px] leading-[1.2] font-extrabold tracking-[-0.025em] xl:text-4xl xl:leading-[1.15]">
            Setiap orang hanya melihat yang perlu dilihat.
          </h3>
          <ul className="mt-3 flex flex-col gap-[18px] xl:mt-4 xl:gap-[22px]">
            <FeatureListItem icon="users" tone="teal">
              Hak akses diatur per peran: admin, dokter, bidan, apoteker, dan analis lab.
            </FeatureListItem>
            <FeatureListItem icon="lock" tone="teal">
              Rekam medis hanya bisa dibuka tenaga medis yang menangani pasien.
            </FeatureListItem>
            <FeatureListItem icon="history" tone="teal">
              Setiap akses ke data pasien tercatat, termasuk saat data diekspor.
            </FeatureListItem>
          </ul>
        </div>
      </div>
    </section>
  );
}
