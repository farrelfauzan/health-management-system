import { ConflictException } from '@nestjs/common';

import { DocumentTypeBehaviorValue, ManagedDocumentRecord } from '@hms/shared-types';

import { PrismaTransactionClient } from '../../../common/prisma/prisma.types';
import { DocumentIssueBehaviorService } from './document-issue-behavior.service';
import { DocumentIssueContext } from './document-issue-behavior.types';

describe('DocumentIssueBehaviorService', () => {
  function buildDocument(behavior: DocumentTypeBehaviorValue): ManagedDocumentRecord {
    return {
      type: { behavior },
    } as unknown as ManagedDocumentRecord;
  }

  function buildContext(behavior: DocumentTypeBehaviorValue): DocumentIssueContext {
    return {
      document: buildDocument(behavior),
      issuedContent: { contentHtml: '<p>Total</p>', storageKey: null },
      actorUserId: 'actor-1',
      decisionId: 'decision-1',
    };
  }

  function buildHandler(behavior: DocumentTypeBehaviorValue) {
    return {
      behavior,
      executeIssue: jest.fn(),
      announceIssued: jest.fn(),
    };
  }

  it('always supports GENERIC, which has no side effect to wire up', () => {
    const service = new DocumentIssueBehaviorService();

    expect(() => service.assertBehaviorSupported(buildDocument('GENERIC'))).not.toThrow();
  });

  it('refuses a behaviour with no registered handler rather than issuing a hollow row', () => {
    const service = new DocumentIssueBehaviorService();

    expect(() => service.assertBehaviorSupported(buildDocument('INVOICE_TEMPLATE'))).toThrow(
      ConflictException,
    );
  });

  it('refuses PATIENT_BILL with the reason it will never be handled here', () => {
    const service = new DocumentIssueBehaviorService();

    expect(() => service.assertBehaviorSupported(buildDocument('PATIENT_BILL'))).toThrow(
      /issued by billing/,
    );
  });

  it('accepts a behaviour once its owning module has registered a handler', () => {
    const service = new DocumentIssueBehaviorService();
    service.registerHandler(buildHandler('CLINIC_CORPUS'));

    expect(() => service.assertBehaviorSupported(buildDocument('CLINIC_CORPUS'))).not.toThrow();
  });

  it('hands the registered handler the issuing transaction', async () => {
    const service = new DocumentIssueBehaviorService();
    const mockHandler = buildHandler('INVOICE_TEMPLATE');
    service.registerHandler(mockHandler);
    const inputTx = {} as PrismaTransactionClient;
    const inputContext = buildContext('INVOICE_TEMPLATE');

    await service.executeIssue(inputContext, inputTx);

    expect(mockHandler.executeIssue).toHaveBeenCalledWith(inputContext, inputTx);
  });

  it('does nothing for GENERIC, which has no handler by design', async () => {
    const service = new DocumentIssueBehaviorService();
    const mockHandler = buildHandler('INVOICE_TEMPLATE');
    service.registerHandler(mockHandler);

    await service.executeIssue(buildContext('GENERIC'), {} as PrismaTransactionClient);

    expect(mockHandler.executeIssue).not.toHaveBeenCalled();
  });

  it('throws inside the transaction when an unregistered behaviour reaches the issue', async () => {
    const service = new DocumentIssueBehaviorService();

    await expect(
      service.executeIssue(buildContext('CLINIC_CORPUS'), {} as PrismaTransactionClient),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses a second handler for the same behaviour rather than letting one win silently', () => {
    const service = new DocumentIssueBehaviorService();
    service.registerHandler(buildHandler('CLINIC_CORPUS'));

    expect(() => service.registerHandler(buildHandler('CLINIC_CORPUS'))).toThrow(
      /already registered/,
    );
  });

  it('runs the post-commit half only for a behaviour that registered one', async () => {
    const service = new DocumentIssueBehaviorService();
    const mockHandler = buildHandler('INVOICE_TEMPLATE');
    service.registerHandler(mockHandler);

    await service.announceIssued(buildContext('INVOICE_TEMPLATE'));
    await service.announceIssued(buildContext('GENERIC'));

    expect(mockHandler.announceIssued).toHaveBeenCalledTimes(1);
  });
});
