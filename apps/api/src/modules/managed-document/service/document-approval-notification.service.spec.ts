import { ConfigService } from '@nestjs/config';

import { MailService } from '../../../common/mail/mail.service';
import { ClinicProfileService } from '../../billing/service/clinic-profile.service';
import { NotificationService } from '../../notification/service/notification.service';
import {
  DocumentApprovalAnnouncement,
  DocumentApprovalNotificationService,
} from './document-approval-notification.service';

const APPROVER_A = { userId: 'user-a', email: 'a@klinik.example' };
const APPROVER_B = { userId: 'user-b', email: 'b@klinik.example' };
const DRAFTER = { userId: 'user-d', email: 'drafter@klinik.example' };

function buildAnnouncement(
  documentId: string,
  overrides: Partial<DocumentApprovalAnnouncement> = {},
): DocumentApprovalAnnouncement {
  return {
    kind: 'REQUESTED',
    documentId,
    documentTitle: `FAQ ${documentId}`,
    documentTypeName: 'Dokumen korpus klinik',
    drafterEmail: DRAFTER.email,
    dueAt: null,
    reason: null,
    recipients: [APPROVER_A],
    ...overrides,
  };
}

describe('DocumentApprovalNotificationService', () => {
  const notificationServiceMock = { createForUsers: jest.fn() };
  const mailServiceMock = { sendMail: jest.fn() };
  const clinicProfileServiceMock = { getClinicName: jest.fn() };
  const configServiceMock = { get: jest.fn().mockReturnValue(undefined) };

  const service = new DocumentApprovalNotificationService(
    notificationServiceMock as unknown as NotificationService,
    mailServiceMock as unknown as MailService,
    clinicProfileServiceMock as unknown as ClinicProfileService,
    configServiceMock as unknown as ConfigService,
  );

  function readSentMails(): Array<{ to: string; subject: string; text: string }> {
    return mailServiceMock.sendMail.mock.calls.map((call) => call[0]);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mailServiceMock.sendMail.mockResolvedValue({ accepted: true, messageId: 'message-1' });
    clinicProfileServiceMock.getClinicName.mockResolvedValue('Klinik Sehat Bersama');
  });

  describe('announceBatch', () => {
    it('mails an approver once for a bulk submit, listing every document', async () => {
      await service.announceBatch([
        buildAnnouncement('doc-1'),
        buildAnnouncement('doc-2'),
        buildAnnouncement('doc-3'),
      ]);

      const [actualMail] = readSentMails();
      expect(readSentMails()).toHaveLength(1);
      expect(actualMail?.to).toBe(APPROVER_A.email);
      expect(actualMail?.subject).toBe('Permintaan persetujuan: 3 dokumen / Klinik Sehat Bersama');
      expect(actualMail?.text).toContain('FAQ doc-1');
      expect(actualMail?.text).toContain('FAQ doc-3');
      expect(actualMail?.text).toContain('http://localhost:3000/admin/documents?tab=approvals');
    });

    it('keeps one bell row per document, because each is its own to-do', async () => {
      await service.announceBatch([buildAnnouncement('doc-1'), buildAnnouncement('doc-2')]);

      expect(notificationServiceMock.createForUsers).toHaveBeenCalledTimes(2);
    });

    it('mails each person on a shared panel once', async () => {
      const inputRecipients = [APPROVER_A, APPROVER_B];

      await service.announceBatch([
        buildAnnouncement('doc-1', { recipients: inputRecipients }),
        buildAnnouncement('doc-2', { recipients: inputRecipients }),
      ]);

      expect(readSentMails().map((mail) => mail.to)).toEqual([APPROVER_A.email, APPROVER_B.email]);
    });

    it('sends the ordinary single-document mail to someone named on only one', async () => {
      await service.announceBatch([buildAnnouncement('doc-1')]);

      expect(readSentMails()[0]?.subject).toBe(
        'Permintaan persetujuan: FAQ doc-1 / Klinik Sehat Bersama',
      );
    });

    it('sends a drafter one digest for a bulk approval, linking to the registry', async () => {
      await service.announceBatch([
        buildAnnouncement('doc-1', { kind: 'APPROVED', recipients: [DRAFTER] }),
        buildAnnouncement('doc-2', { kind: 'APPROVED', recipients: [DRAFTER] }),
      ]);

      const [actualMail] = readSentMails();
      expect(readSentMails()).toHaveLength(1);
      expect(actualMail?.subject).toBe('Disetujui: 2 dokumen / Klinik Sehat Bersama');
      expect(actualMail?.text).toContain('/admin/documents?tab=registry');
    });

    it('still mails the second person when the first mail fails', async () => {
      mailServiceMock.sendMail.mockRejectedValueOnce(new Error('smtp down'));

      await service.announceBatch([
        buildAnnouncement('doc-1', { recipients: [APPROVER_A, APPROVER_B] }),
        buildAnnouncement('doc-2', { recipients: [APPROVER_A, APPROVER_B] }),
      ]);

      expect(mailServiceMock.sendMail).toHaveBeenCalledTimes(2);
    });

    it('sends nothing for a batch nobody is named on', async () => {
      await service.announceBatch([buildAnnouncement('doc-1', { recipients: [] })]);

      expect(notificationServiceMock.createForUsers).not.toHaveBeenCalled();
      expect(mailServiceMock.sendMail).not.toHaveBeenCalled();
    });
  });

  describe('announce', () => {
    it('behaves as a batch of one: one single-document mail per recipient', async () => {
      await service.announce(buildAnnouncement('doc-1', { recipients: [APPROVER_A, APPROVER_B] }));

      expect(readSentMails().map((mail) => mail.subject)).toEqual([
        'Permintaan persetujuan: FAQ doc-1 / Klinik Sehat Bersama',
        'Permintaan persetujuan: FAQ doc-1 / Klinik Sehat Bersama',
      ]);
      expect(notificationServiceMock.createForUsers).toHaveBeenCalledTimes(1);
    });
  });
});
