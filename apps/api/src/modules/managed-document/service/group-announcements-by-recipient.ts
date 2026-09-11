import { DocumentApprovalMailKind } from './build-document-approval-copy';
import { DocumentApprovalAnnouncement } from './document-approval-notification.service';

/** Everything one person is owed mail about from one batch, of one kind. */
export type DocumentApprovalRecipientGroup = {
  kind: DocumentApprovalMailKind;
  email: string;
  announcements: DocumentApprovalAnnouncement[];
};

/**
 * Regroups a batch from "per document, many recipients" to "per recipient,
 * many documents", which is the shape mail is sent in. Keyed by kind as well
 * as address, so a batch can never fold an approval into a rejection's mail.
 * Addresses compare case-insensitively; order is first-seen, so the digest
 * lists documents in the order the action handled them.
 */
export function groupAnnouncementsByRecipient(
  announcements: readonly DocumentApprovalAnnouncement[],
): DocumentApprovalRecipientGroup[] {
  const groups = new Map<string, DocumentApprovalRecipientGroup>();
  for (const announcement of announcements) {
    for (const recipient of announcement.recipients) {
      const key = `${announcement.kind}:${recipient.email.toLowerCase()}`;
      const group = groups.get(key) ?? {
        kind: announcement.kind,
        email: recipient.email,
        announcements: [],
      };
      group.announcements.push(announcement);
      groups.set(key, group);
    }
  }
  return [...groups.values()];
}
