import { DocumentApprovalAnnouncement } from './document-approval-notification.service';
import { groupAnnouncementsByRecipient } from './group-announcements-by-recipient';

const APPROVER_A = { userId: 'user-a', email: 'a@klinik.example' };
const APPROVER_B = { userId: 'user-b', email: 'b@klinik.example' };

function buildAnnouncement(
  documentId: string,
  overrides: Partial<DocumentApprovalAnnouncement> = {},
): DocumentApprovalAnnouncement {
  return {
    kind: 'REQUESTED',
    documentId,
    documentTitle: `FAQ ${documentId}`,
    documentTypeName: 'Dokumen korpus klinik',
    drafterEmail: 'drafter@klinik.example',
    dueAt: null,
    reason: null,
    recipients: [APPROVER_A],
    ...overrides,
  };
}

describe('groupAnnouncementsByRecipient', () => {
  it('puts every document one person is named on into one group, in order', () => {
    const actual = groupAnnouncementsByRecipient([
      buildAnnouncement('doc-1'),
      buildAnnouncement('doc-2'),
      buildAnnouncement('doc-3'),
    ]);

    expect(actual).toHaveLength(1);
    expect(actual[0]?.announcements.map((item) => item.documentId)).toEqual([
      'doc-1',
      'doc-2',
      'doc-3',
    ]);
  });

  it('gives each person on a shared panel a group of their own', () => {
    const actual = groupAnnouncementsByRecipient([
      buildAnnouncement('doc-1', { recipients: [APPROVER_A, APPROVER_B] }),
      buildAnnouncement('doc-2', { recipients: [APPROVER_A, APPROVER_B] }),
    ]);

    expect(actual.map((group) => [group.email, group.announcements.length])).toEqual([
      ['a@klinik.example', 2],
      ['b@klinik.example', 2],
    ]);
  });

  it('never folds two kinds of event into one group', () => {
    const actual = groupAnnouncementsByRecipient([
      buildAnnouncement('doc-1', { kind: 'APPROVED' }),
      buildAnnouncement('doc-2', { kind: 'REJECTED' }),
    ]);

    expect(actual.map((group) => group.kind)).toEqual(['APPROVED', 'REJECTED']);
  });

  it('treats an address that differs only in case as the same person', () => {
    const actual = groupAnnouncementsByRecipient([
      buildAnnouncement('doc-1'),
      buildAnnouncement('doc-2', { recipients: [{ ...APPROVER_A, email: 'A@Klinik.Example' }] }),
    ]);

    expect(actual).toHaveLength(1);
  });

  it('produces nothing for an announcement nobody is named on', () => {
    expect(groupAnnouncementsByRecipient([buildAnnouncement('doc-1', { recipients: [] })])).toEqual(
      [],
    );
  });
});
