import { SatusehatHttpClient } from './satusehat-http.client';
import { SatusehatLocationClient } from './satusehat-location.client';
import { SatusehatError } from './satusehat.error';
import { SatusehatFhirLocation } from './satusehat-fhir.types';

describe('SatusehatLocationClient', () => {
  const mockSendRequest = jest.fn();
  const client = new SatusehatLocationClient({
    sendRequest: mockSendRequest,
  } as unknown as SatusehatHttpClient);
  const inputResource = { resourceType: 'Location', name: 'Poli KIA' } as SatusehatFhirLocation;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('searches by the organization-scoped identifier and returns the first id', async () => {
    mockSendRequest.mockResolvedValue({ total: 1, entry: [{ resource: { id: 'loc-1' } }] });

    const actualId = await client.findLocationIdByIdentifier('10000004', 'row-uuid');

    expect(actualId).toBe('loc-1');
    expect(mockSendRequest).toHaveBeenCalledWith({
      method: 'GET',
      path: '/Location',
      query: { identifier: 'http://sys-ids.kemkes.go.id/location/10000004|row-uuid' },
    });
  });

  it('returns null when nothing is registered under the identifier', async () => {
    mockSendRequest.mockResolvedValue({ total: 0 });

    await expect(client.findLocationIdByIdentifier('10000004', 'row-uuid')).resolves.toBeNull();
  });

  it('creates a Location and returns the assigned id', async () => {
    mockSendRequest.mockResolvedValue({ id: 'loc-2' });

    const actualId = await client.createLocation(inputResource);

    expect(actualId).toBe('loc-2');
    expect(mockSendRequest).toHaveBeenCalledWith({ method: 'POST', path: '/Location', body: inputResource });
  });

  it('refuses a create response with no id', async () => {
    mockSendRequest.mockResolvedValue({});

    await expect(client.createLocation(inputResource)).rejects.toBeInstanceOf(SatusehatError);
  });

  it('replaces a registered Location with PUT', async () => {
    mockSendRequest.mockResolvedValue({ id: 'loc-2' });

    await client.updateLocation('loc-2', inputResource);

    expect(mockSendRequest).toHaveBeenCalledWith({ method: 'PUT', path: '/Location/loc-2', body: inputResource });
  });
});
