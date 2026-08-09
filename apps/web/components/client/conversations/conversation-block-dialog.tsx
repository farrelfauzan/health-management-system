'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CS_BLOCK_REASON_MAX_LENGTH } from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { csAdminControllerBlockV1 } from '#lib/api/generated/customer-service/customer-service';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { invalidateConversationQueries } from '#lib/conversations/invalidate-conversation-queries';

type ConversationBlockDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  onBlocked: (message: string) => void;
  onFailed: (message: string) => void;
};

/**
 * §8.3's chat block, behind a confirmation.
 *
 * A dialog rather than a button, because this is the one action on the screen
 * that silences a member of the public: every message they send afterwards is
 * dropped before it is written down, and they are told nothing. The
 * description says both of those things out loud — an admin who thinks a block
 * sends a polite "we can't help you" is about to make a decision they did not
 * intend.
 *
 * The reason field is optional and goes to the log, not to the customer.
 */
export function ConversationBlockDialog({
  open,
  onOpenChange,
  conversationId,
  onBlocked,
  onFailed,
}: ConversationBlockDialogProps) {
  const t = useTranslations('conversations.block');
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const blockMutation = useMutation({
    mutationFn: async () => {
      const trimmed = reason.trim();
      await csAdminControllerBlockV1(
        conversationId,
        trimmed.length > 0 ? { reason: trimmed } : {},
      );
    },
    onSuccess: async () => {
      setReason('');
      onOpenChange(false);
      await invalidateConversationQueries(queryClient, conversationId);
      onBlocked(t('blocked'));
    },
    onError: (error: unknown) => {
      onFailed(resolveApiErrorMessage(error, t('failed')));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="conversation-block-reason">{t('reason')}</Label>
          <Input
            id="conversation-block-reason"
            value={reason}
            maxLength={CS_BLOCK_REASON_MAX_LENGTH}
            placeholder={t('reasonPlaceholder')}
            onChange={(event) => setReason(event.target.value)}
          />
          <p className="text-xs text-slate-500">{t('reasonHint')}</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={blockMutation.isPending}
            onClick={() => blockMutation.mutate()}
          >
            {blockMutation.isPending ? t('blocking') : t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
