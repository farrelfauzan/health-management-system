import { optionalExample } from './api-endpoint.decorator';

const DEFAULT_APPROVER_EXAMPLE = {
  id: '4e1f9f0a-9a3f-4b58-b6b3-8d2f5a6c7e91',
  email: 'direktur.medis@klinik.example',
};

const SYSTEM_TYPE_VIEW = {
  id: 'c0a8012e-1b4f-4c7a-9d2e-3f5a6b7c8d90',
  code: 'AGREEMENT_PATIENT_CLINIC',
  name: 'Perjanjian pasien–klinik',
  description: optionalExample(
    'Kesepakatan antara pasien dan klinik — tanggung jawab biaya, persetujuan umum perawatan',
  ),
  behavior: 'GENERIC',
  isSystem: true,
  isApprovalRequired: true,
  allowSelfApproval: false,
  requiredApprovals: 1,
  requiresPatient: true,
  requiresDoctor: false,
  contentMode: 'EITHER',
  isActive: true,
  sortOrder: 10,
  documentCount: 12,
  defaultApprovers: [DEFAULT_APPROVER_EXAMPLE],
  createdAt: '2026-09-30T00:00:00.000Z',
  updatedAt: '2026-09-30T00:00:00.000Z',
};

const CLINIC_TYPE_VIEW = {
  ...SYSTEM_TYPE_VIEW,
  id: 'd1b9123f-2c5a-4d8b-8e3f-4a6b7c8d9e01',
  code: 'SURAT_KETERANGAN_SEHAT',
  name: 'Surat Keterangan Sehat',
  description: optionalExample('Surat keterangan sehat untuk keperluan administrasi'),
  isSystem: false,
  isApprovalRequired: false,
  requiresPatient: true,
  contentMode: 'DRAFTED',
  sortOrder: 100,
  documentCount: 0,
  defaultApprovers: [],
};

/**
 * Canonical examples for the document-type master data surface (`P16-T39`),
 * mirrored by `ApiEndpoint` into the OpenAPI document. Note what the
 * create example does *not* carry: `behavior` and `code` are the server's.
 */
export const DOCUMENT_TYPE_EXAMPLES = {
  systemView: SYSTEM_TYPE_VIEW,
  clinicView: CLINIC_TYPE_VIEW,
  createRequest: {
    name: 'Surat Keterangan Sehat',
    description: 'Surat keterangan sehat untuk keperluan administrasi',
    isApprovalRequired: false,
    requiresPatient: true,
    contentMode: 'DRAFTED',
    sortOrder: 100,
  },
  updateRequest: {
    name: 'Templat kuitansi',
    isApprovalRequired: true,
    requiredApprovals: 1,
  },
  setDefaultApproversRequest: {
    approverIds: [DEFAULT_APPROVER_EXAMPLE.id],
  },
  deletedView: {
    id: 'd1b9123f-2c5a-4d8b-8e3f-4a6b7c8d9e01',
    deletedAt: '2026-09-30T04:15:00.000Z',
  },
};
