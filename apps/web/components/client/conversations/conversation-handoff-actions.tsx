'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AdminConversationView } from '@hms/shared-types';
import { Button } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ConversationBlockDialog } from '#components/client/conversations/conversation-block-dialog';
import {
  csAdminControllerReleaseV1,
  csAdminControllerTakeOverV1,
  csAdminControllerUnblockV1,
} from '#lib/api/generated/customer-service/customer-service';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { invalidateConversationQueries } from '#lib/conversations/invalidate-conversation-queries';

type ConversationHandoffActionsProps = {
  conversation: AdminConversationView;
  onResult: (message: string) => void;
  onFailed: (message: string) => void;
};

/**
 * Take over, release, block.
 *
 * Take over is hidden once the conversation is already `HUMAN_ACTIVE` rather
 * than disabled, because replying takes it over anyway — an admin who is
 * already holding the conversation has nothing to press it for, and a greyed
 * button invites the question of what would happen.
 *
 * Release stays available on a blocked conversation, matching the API: a
 * blocked chat stuck in `HUMAN_ACTIVE` with no way back would need unblocking
 * first, which is exactly backwards.
 */
export function ConversationHandoffActions({
  conversation,
  onResult,
  onFailed,
}: ConversationHandoffActionsProps) {
  const t = useTranslations('conversations.actions');
  const queryClient = useQueryClient();
  const [isBlockOpen, setIsBlockOpen] = useState(false);

  function buildMutation(
    request: (id: string) => Promise<unknown>,
    successMessage: string,
    failureMessage: string,
  ) {
    return {
      mutationFn: async () => {
        await request(conversation.id);
      },
      onSuccess: async () => {
        await invalidateConversationQueries(queryClient, conversation.id);
        onResult(successMessage);
      },
      onError: (error: unknown) => {
        onFailed(resolveApiErrorMessage(error, failureMessage));
      },
    };
  }

  const takeOverMutation = useMutation(
    buildMutation(csAdminControllerTakeOverV1, t('takenOver'), t('takeOverFailed')),
  );
  const releaseMutation = useMutation(
    buildMutation(csAdminControllerReleaseV1, t('released'), t('releaseFailed')),
  );
  const unblockMutation = useMutation(
    buildMutation(csAdminControllerUnblockV1, t('unblocked'), t('unblockFailed')),
  );
  const isPossessionChallengeLive = conversation.state === 'AWAITING_OTP';

  return (
    <div className="flex flex-wrap items-center gap-2">
      {conversation.state !== 'HUMAN_ACTIVE' && !conversation.isBlocked ? (
        <Button
          type="button"
          variant="outline"
          disabled={takeOverMutation.isPending || isPossessionChallengeLive}
          onClick={() => takeOverMutation.mutate()}
        >
          {t('takeOver')}
        </Button>
      ) : null}
      {conversation.state === 'HUMAN_ACTIVE' || conversation.state === 'NEEDS_HUMAN' ? (
        <Button
          type="button"
          variant="outline"
          disabled={releaseMutation.isPending}
          onClick={() => releaseMutation.mutate()}
        >
          {t('release')}
        </Button>
      ) : null}
      {conversation.isBlocked ? (
        <Button
          type="button"
          variant="outline"
          disabled={unblockMutation.isPending}
          onClick={() => unblockMutation.mutate()}
        >
          {t('unblock')}
        </Button>
      ) : (
        <Button type="button" variant="destructive" onClick={() => setIsBlockOpen(true)}>
          {t('block')}
        </Button>
      )}
      <ConversationBlockDialog
        open={isBlockOpen}
        onOpenChange={setIsBlockOpen}
        conversationId={conversation.id}
        onBlocked={onResult}
        onFailed={onFailed}
      />
    </div>
  );
}
