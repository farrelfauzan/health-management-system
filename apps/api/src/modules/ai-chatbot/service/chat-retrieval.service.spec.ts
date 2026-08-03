import { ConfigService } from '@nestjs/config';

import { RetrievedDocumentChunk } from '@hms/shared-types';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { DocumentRetrievalService } from '../../document-management/service/document-retrieval.service';
import { ChatRetrievalService } from './chat-retrieval.service';

describe('ChatRetrievalService', () => {
  const retrievePassagesMock = jest.fn();

  const actor: CurrentUser = { sub: 'doctor-1', email: 'doctor@hms.local' };

  function buildService(
    env: Record<string, string> = { AI_CHAT_RETRIEVAL_ENABLED: 'true' },
  ): ChatRetrievalService {
    return new ChatRetrievalService(
      { retrievePassages: retrievePassagesMock } as unknown as DocumentRetrievalService,
      new ConfigService(env),
    );
  }

  function buildPassage(overrides: Partial<RetrievedDocumentChunk> = {}): RetrievedDocumentChunk {
    return {
      chunkId: 'chunk-1',
      documentId: 'document-1',
      documentTitle: 'SOP Pendaftaran BPJS',
      chunkIndex: 0,
      content: 'Pendaftaran pasien BPJS dibuka pukul 07.00 di poliklinik umum.',
      language: 'ID',
      sourceTier: 'CLINIC',
      score: 0.032,
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    retrievePassagesMock.mockResolvedValue([]);
  });

  it('retrieves nothing at all while the flag is off', async () => {
    const actual = await buildService({ AI_CHAT_RETRIEVAL_ENABLED: 'false' }).retrieve(
      'DOCTOR',
      actor,
      'Kapan pendaftaran BPJS dibuka?',
    );

    expect(actual).toEqual({ promptBlock: '', citations: [] });
    // Not "queried and discarded": with the flag off no corpus is touched and
    // the completion body is the Phase 13 one.
    expect(retrievePassagesMock).not.toHaveBeenCalled();
  });

  it('scopes a doctor session to the clinic corpus plus that doctor’s own documents', async () => {
    await buildService().retrieve('DOCTOR', actor, 'formularium antibiotik');

    expect(retrievePassagesMock).toHaveBeenCalledWith({
      query: 'formularium antibiotik',
      channelVisibility: 'DOCTOR',
      ownerUserId: 'doctor-1',
    });
  });

  it('gives a patient session no personal corpus and only patient-visible documents', async () => {
    // Two separate protections in one call: a staff-only SOP carries DOCTOR
    // visibility and is unreachable, and patients have no personal knowledge
    // base in this phase, so the owner half contributes nothing rather than
    // being outranked.
    await buildService().retrieve(
      'PATIENT',
      { sub: 'patient-1', email: 'patient@hms.local' },
      'Kapan klinik buka?',
    );

    expect(retrievePassagesMock).toHaveBeenCalledWith({
      query: 'Kapan klinik buka?',
      channelVisibility: 'PATIENT',
      ownerUserId: null,
    });
  });

  it('gives an admin session the staff-facing corpus plus their own documents', async () => {
    // DOCTOR visibility is the store's name for "staff-only", not for
    // "clinicians only" — an SOP is written for the people running the clinic.
    await buildService().retrieve(
      'ADMIN',
      { sub: 'admin-1', email: 'admin@hms.local' },
      'prosedur klaim BPJS',
    );

    expect(retrievePassagesMock).toHaveBeenCalledWith({
      query: 'prosedur klaim BPJS',
      channelVisibility: 'DOCTOR',
      ownerUserId: 'admin-1',
    });
  });

  it('numbers passages once and uses the same number in the prompt and the citation', async () => {
    retrievePassagesMock.mockResolvedValue([
      buildPassage({ chunkId: 'chunk-1', documentId: 'document-1', documentTitle: 'SOP Pendaftaran' }),
      buildPassage({
        chunkId: 'chunk-2',
        documentId: 'document-2',
        documentTitle: 'Antibiotic Guideline',
        language: 'EN',
        sourceTier: 'PERSONAL',
        content: 'Amoxicillin remains first line for uncomplicated community-acquired pneumonia.',
      }),
    ]);

    const actual = await buildService().retrieve('DOCTOR', actor, 'first line antibiotic');

    expect(actual.citations).toEqual([
      {
        reference: 1,
        documentId: 'document-1',
        title: 'SOP Pendaftaran',
        language: 'ID',
        sourceTier: 'CLINIC',
      },
      {
        reference: 2,
        documentId: 'document-2',
        title: 'Antibiotic Guideline',
        language: 'EN',
        sourceTier: 'PERSONAL',
      },
    ]);
    expect(actual.promptBlock).toContain('[1] SOP Pendaftaran (ID)');
    expect(actual.promptBlock).toContain('[2] Antibiotic Guideline (EN)');
    expect(actual.promptBlock).toContain(
      'Amoxicillin remains first line for uncomplicated community-acquired pneumonia.',
    );
  });

  it('keeps identifiers the client needs out of the text the provider is sent', async () => {
    retrievePassagesMock.mockResolvedValue([buildPassage()]);

    const actual = await buildService().retrieve('DOCTOR', actor, 'jam pendaftaran');

    // The document id is a citation field, not something the model needs to
    // see — and a model that saw it would happily quote it into a reply.
    expect(actual.promptBlock).not.toContain('document-1');
    expect(actual.promptBlock).not.toContain('chunk-1');
  });

  it('returns an empty result when the corpus has nothing to say', async () => {
    retrievePassagesMock.mockResolvedValue([]);

    const actual = await buildService().retrieve('PATIENT', actor, 'apakah ada kolam renang?');

    expect(actual).toEqual({ promptBlock: '', citations: [] });
  });

  it('degrades a retrieval failure to an ungrounded answer rather than failing the exchange', async () => {
    retrievePassagesMock.mockRejectedValue(new Error('Embedding provider is unreachable'));

    const actual = await buildService().retrieve('DOCTOR', actor, 'jam pendaftaran');

    expect(actual).toEqual({ promptBlock: '', citations: [] });
  });
});
