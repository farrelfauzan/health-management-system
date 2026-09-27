import type { ReactElement } from 'react';

import { MikoStepCard } from '#components/server/landing/miko-step-card';
import { LineIcon } from '#components/shared/line-icon';
import { SectionEyebrow } from '#components/shared/section-eyebrow';

/** Introduces Miko, the WhatsApp assistant, and what it will not do. */
export function MikoSection(): ReactElement {
  return (
    <section id="miko" className="bg-white">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-7 px-4 py-16 xl:gap-12 xl:px-20 xl:py-24">
        <div className="rv flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between xl:gap-12">
          <div className="flex flex-col gap-3 xl:gap-3.5">
            <SectionEyebrow>Asisten WhatsApp</SectionEyebrow>
            <h2 className="text-[32px] leading-[1.15] font-extrabold tracking-[-0.03em] xl:text-5xl xl:leading-[1.1]">
              Kenalan dengan <span className="wm-grad">Miko.</span>
            </h2>
          </div>
          <p className="max-w-[500px] text-base leading-[1.55] text-ink-muted xl:text-lg">
            Miko melayani pasien lewat WhatsApp kapan saja, supaya staf meja depan bisa fokus pada
            pasien yang sudah datang.
          </p>
        </div>
        <div className="stagger grid gap-4 xl:grid-cols-3 xl:gap-6">
          <MikoStepCard
            mood="listening"
            step="01 · Mendengarkan"
            title="Pasien bertanya"
            description="Jam praktik, lokasi, atau biaya layanan. Miko menjawab dari dokumen klinik Anda sendiri."
          />
          <MikoStepCard
            mood="thinking"
            step="02 · Berpikir"
            title="Miko cek jadwal"
            description="Sesi praktik dokter yang masih bisa diisi langsung ditampilkan. Pasien tinggal pilih."
          />
          <MikoStepCard
            mood="happy"
            step="03 · Senang"
            title="Kunjungan terdaftar"
            description="Pasien dapat kode booking. Saat tiba, meja depan tinggal mencocokkannya."
          />
        </div>
        <div className="rv flex items-start gap-3.5 rounded-[18px] bg-mist p-[18px] xl:items-center xl:gap-4 xl:px-6">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-white text-brand xl:size-10 xl:rounded-xl">
            <LineIcon name="shield" size={22} />
          </span>
          <p className="text-[15px] leading-normal xl:text-base">
            <strong>Miko tidak memberi diagnosis.</strong> Untuk keadaan darurat, Miko langsung
            mengarahkan pasien ke 119 atau IGD rumah sakit terdekat.
          </p>
        </div>
      </div>
    </section>
  );
}
