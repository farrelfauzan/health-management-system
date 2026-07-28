import { SatusehatHttpClient } from './satusehat-http.client';
import { SatusehatMasterDataClient } from './satusehat-master-data.client';
import { SatusehatError } from './satusehat.error';

describe('SatusehatMasterDataClient', () => {
  const mockSendRequest = jest.fn();
  const client = new SatusehatMasterDataClient({
    sendRequest: mockSendRequest,
  } as unknown as SatusehatHttpClient);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('searches the patient index by NIK identifier and returns the IHS number', async () => {
    mockSendRequest.mockResolvedValue({
      resourceType: 'Bundle',
      total: 1,
      entry: [{ resource: { resourceType: 'Patient', id: 'P02478375538' } }],
    });

    const actualIhsNumber = await client.findPatientIhsNumberByNik('3204120101900001');

    expect(actualIhsNumber).toBe('P02478375538');
    expect(mockSendRequest).toHaveBeenCalledWith({
      method: 'GET',
      path: '/Patient',
      query: { identifier: 'https://fhir.kemkes.go.id/id/nik|3204120101900001' },
    });
  });

  it('searches the practitioner index by NIK identifier', async () => {
    mockSendRequest.mockResolvedValue({
      resourceType: 'Bundle',
      total: 1,
      entry: [{ resource: { resourceType: 'Practitioner', id: 'N10000001' } }],
    });

    const actualIhsNumber = await client.findPractitionerIhsNumberByNik('3204120101900001');

    expect(actualIhsNumber).toBe('N10000001');
    expect(mockSendRequest).toHaveBeenCalledWith({
      method: 'GET',
      path: '/Practitioner',
      query: { identifier: 'https://fhir.kemkes.go.id/id/nik|3204120101900001' },
    });
  });

  it('returns null when the search bundle has no entries', async () => {
    mockSendRequest.mockResolvedValue({ resourceType: 'Bundle', total: 0 });

    const actualIhsNumber = await client.findPatientIhsNumberByNik('3204120101900001');

    expect(actualIhsNumber).toBeNull();
  });

  it('throws SATUSEHAT_UNAVAILABLE when an entry carries no resource id', async () => {
    mockSendRequest.mockResolvedValue({ entry: [{ resource: { resourceType: 'Patient' } }] });

    const actualError = await client
      .findPatientIhsNumberByNik('3204120101900001')
      .catch((err: unknown) => err);

    expect(actualError).toBeInstanceOf(SatusehatError);
    expect((actualError as SatusehatError).code).toBe('SATUSEHAT_UNAVAILABLE');
  });

  it('propagates transport errors from the HTTP client untouched', async () => {
    mockSendRequest.mockRejectedValue(new SatusehatError('SATUSEHAT_TIMEOUT', 'timed out'));

    await expect(client.findPractitionerIhsNumberByNik('3204120101900001')).rejects.toMatchObject({
      code: 'SATUSEHAT_TIMEOUT',
    });
  });
});
