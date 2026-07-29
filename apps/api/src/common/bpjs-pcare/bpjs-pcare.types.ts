export type BpjsPcareRequestCredentials = {
  readonly consId: string;
  readonly secretKey: string;
  readonly userKey: string;
  readonly pcareUsername: string;
  readonly pcarePassword: string;
};

export type BpjsPcareSignedHeaders = {
  readonly 'X-cons-id': string;
  readonly 'X-Timestamp': string;
  readonly 'X-Signature': string;
  readonly 'X-Authorization': string;
  readonly user_key: string;
};

export type BpjsPcareDecryptionContext = {
  readonly consId: string;
  readonly secretKey: string;
  readonly timestamp: string;
};

export type BpjsPcareResponseMetaData = {
  readonly code: string | number;
  readonly message: string;
};

export type BpjsPcareResponseEnvelope = {
  readonly metaData: BpjsPcareResponseMetaData;
  readonly response: unknown;
};

export type BpjsPcareCodecErrorCode =
  'BPJS_PCARE_RESPONSE_MALFORMED' | 'BPJS_PCARE_DECRYPT_FAILED' | 'BPJS_PCARE_DECOMPRESS_FAILED';
