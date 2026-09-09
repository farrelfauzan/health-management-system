import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PatientAddressFields } from './patient-address-fields';
import { buildPatientAddressDefaults } from '#lib/patients/build-patient-address-defaults';
import type { PatientAddressFormValues } from '#lib/patients/patient-address-form-values.types';
import {
  regionsControllerListDistrictsV1,
  regionsControllerListProvincesV1,
  regionsControllerListRegenciesV1,
  regionsControllerListVillagesV1,
} from '#lib/api/generated/regions/regions';
import indonesianMessages from '../../../messages/id/clinical.json';
import englishMessages from '../../../messages/en/clinical.json';

vi.mock('#lib/api/generated/regions/regions', () => ({
  regionsControllerListProvincesV1: vi.fn(),
  regionsControllerListRegenciesV1: vi.fn(),
  regionsControllerListDistrictsV1: vi.fn(),
  regionsControllerListVillagesV1: vi.fn(),
  getRegionsControllerListProvincesV1QueryKey: () => ['provinces'],
  getRegionsControllerListRegenciesV1QueryKey: (params?: unknown) => ['regencies', params],
  getRegionsControllerListDistrictsV1QueryKey: (params?: unknown) => ['districts', params],
  getRegionsControllerListVillagesV1QueryKey: (params?: unknown) => ['villages', params],
}));

const provincesMock = vi.mocked(regionsControllerListProvincesV1);
const regenciesMock = vi.mocked(regionsControllerListRegenciesV1);
const districtsMock = vi.mocked(regionsControllerListDistrictsV1);
const villagesMock = vi.mocked(regionsControllerListVillagesV1);

const FULL_CHAIN: PatientAddressFormValues = {
  provinceCode: '31',
  provinceName: 'Daerah Khusus Ibukota Jakarta',
  regencyCode: '31.71',
  regencyName: 'Kota Administrasi Jakarta Pusat',
  districtCode: '31.71.01',
  districtName: 'Gambir',
  villageCode: '31.71.01.1001',
  villageName: 'Gambir',
  rtRw: '003/007',
  postalCode: '10110',
};

function buildListResponse<TRegion>(data: TRegion[]) {
  return { status: 200, headers: {}, data: { data } };
}

function buildVillageListResponse<TRegion>(data: TRegion[], total: number) {
  return { status: 200, headers: {}, data: { data, meta: { page: 1, limit: 50, total } } };
}

function renderFields(params: {
  value: PatientAddressFormValues;
  onChange: (value: PatientAddressFormValues) => void;
  locale?: 'id' | 'en';
}): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const locale = params.locale ?? 'id';

  render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === 'id' ? indonesianMessages : englishMessages}
    >
      <QueryClientProvider client={queryClient}>
        <PatientAddressFields
          value={params.value}
          onChange={params.onChange}
          errors={{}}
          isRequired
          isEnabled
        />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('PatientAddressFields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.hasPointerCapture = vi.fn();
    window.HTMLElement.prototype.releasePointerCapture = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    provincesMock.mockResolvedValue(
      buildListResponse([
        { code: '11', name: 'Aceh' },
        { code: '31', name: 'Daerah Khusus Ibukota Jakarta' },
      ]),
    );
    regenciesMock.mockResolvedValue(
      buildListResponse([{ code: '31.71', name: 'Kota Administrasi Jakarta Pusat', parentCode: '31' }]),
    );
    districtsMock.mockResolvedValue(
      buildListResponse([{ code: '31.71.01', name: 'Gambir', parentCode: '31.71' }]),
    );
    villagesMock.mockResolvedValue(
      buildVillageListResponse([{ code: '31.71.01.1001', name: 'Gambir', parentCode: '31.71.01' }], 1),
    );
  });

  it('shows an edit chain from the record before the region lists load', () => {
    renderFields({ value: FULL_CHAIN, onChange: vi.fn() });

    expect(screen.getByText('Daerah Khusus Ibukota Jakarta')).toBeInTheDocument();
    expect(screen.getByText('Kota Administrasi Jakarta Pusat')).toBeInTheDocument();
    expect(screen.getAllByText('Gambir')).toHaveLength(2);
    expect(screen.getByDisplayValue('003/007')).toBeInTheDocument();
    expect(screen.getByDisplayValue('10110')).toBeInTheDocument();
  });

  it('opens with every level below the empty one disabled', async () => {
    renderFields({ value: buildPatientAddressDefaults(), onChange: vi.fn() });

    // Province is disabled too until its own list arrives, which is the
    // per-level loading state; the three below it stay disabled after that.
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /provinsi/i })).toBeEnabled();
    });
    expect(screen.getByRole('combobox', { name: /kabupaten/i })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: /kecamatan/i })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: /kelurahan/i })).toBeDisabled();
  });

  it('clears every level below the one that changed', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderFields({ value: FULL_CHAIN, onChange });

    await user.click(screen.getByRole('combobox', { name: /provinsi/i }));
    await user.click(await screen.findByRole('option', { name: 'Aceh' }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        provinceCode: '11',
        provinceName: 'Aceh',
        regencyCode: '',
        districtCode: '',
        villageCode: '',
      }),
    );
  });

  it('asks the server for villages by name rather than filtering a fetched page', async () => {
    const user = userEvent.setup();
    renderFields({ value: FULL_CHAIN, onChange: vi.fn() });

    await user.click(screen.getByRole('combobox', { name: /kelurahan/i }));
    await user.type(screen.getByPlaceholderText('Ketik nama kelurahan atau desa'), 'gam');

    await waitFor(() => {
      expect(villagesMock).toHaveBeenCalledWith(
        expect.objectContaining({ districtCode: '31.71.01', q: 'gam' }),
        expect.anything(),
      );
    });
  });

  /**
   * The API answers `villages?districtCode=<unknown>` with an empty page rather
   * than a 404, so a district that has been retired and a district that really
   * holds nothing are indistinguishable to the form. Both have to read as an
   * empty list: there is nothing here a clerk could act on differently.
   */
  it('renders an empty village list as empty rather than as a failure', async () => {
    const user = userEvent.setup();
    villagesMock.mockResolvedValue(buildVillageListResponse([], 0));
    renderFields({
      value: { ...FULL_CHAIN, villageCode: '', villageName: '' },
      onChange: vi.fn(),
    });

    await user.click(screen.getByRole('combobox', { name: /kelurahan/i }));

    expect(await screen.findByText('Wilayah tidak ditemukan.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('labels every level in English too', () => {
    renderFields({ value: buildPatientAddressDefaults(), onChange: vi.fn(), locale: 'en' });

    expect(screen.getByRole('combobox', { name: /province/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /city \/ regency/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /district/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /village/i })).toBeInTheDocument();
  });
});
