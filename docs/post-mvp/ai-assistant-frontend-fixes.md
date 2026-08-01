# AI Assistant Frontend — Fixes and Gaps

Companion to [ai-chatbot.md](./ai-chatbot.md) §8 (Phase 13 frontend). Phase 13 shipped a working assistant screen; this document covers four items found in use — one crash, one feature that was stubbed rather than built, and two changes to how the assistant is reached and read.

**Scope: frontend only.** Every fix below is in `apps/web`. No API change, no migration, no OpenAPI regeneration — the endpoints all four need already exist and are already generated. Nothing here touches the Phase 15 tool design in [ai-chatbot-tools.md](./ai-chatbot-tools.md), and none of it should wait for that phase.

| # | Item | Kind | Where it lives |
| - | ---- | ---- | -------------- |
| 1 | Unhandled rejection on a failed send | **Bug — crash + stuck UI** | `lib/ai-assistant/use-conversation.ts` |
| 2 | Recent history does nothing | **Not built** (stubbed on purpose) | `components/client/ai-assistant/consultation-history-item.tsx` |
| 3 | Chat in the background, toast + unread badge | Feature | Layouts, shell nav, new provider |
| 4 | Collapsible consultation sidebar | Feature | `components/client/ai-assistant/consultation-sidebar.tsx` |

**Order matters.** Fix 1 first — it is a crash, it is small, and both feature items make it *more* likely to fire, because a request that outlives the screen it started on is exactly the case that currently has no rejection handler. Fix 2 next, since it is a prerequisite for fix 3 being useful. Fixes 3 and 4 are independent of each other.

## 1. Unhandled rejection on a failed send

### 1.1 The report

```
⨯ unhandledRejection: AxiosError: Network Error
    at async orvalAxiosMutator (lib/api/http.ts:114:20)
    at async Object.requestReply (lib/ai-assistant/create-chat-conversation-service.ts:85:24)
```

### 1.2 Root cause

The stack names where the rejection *originated*, not where it was dropped. Both named frames are correct and neither is at fault:

- `http.ts:114` is `await apiClient.request<T>(config)` inside `orvalAxiosMutator` — the mutator is supposed to let transport errors propagate, and the 401-refresh interceptor above it deliberately re-rejects anything it cannot fix.
- `create-chat-conversation-service.ts:85` is `await chatControllerSendMessageV1(...)` inside `requestReply` — it awaits, so the rejection travels up to its caller.

The caller is where it is dropped, in `use-conversation.ts`:

```ts
void service.requestReply({ text: trimmedText, promptId }).then((body) => {
  if (conversationEpochRef.current !== epoch) {
    return;
  }
  setMessages((previous) => [...previous, buildAssistantMessage(body)]);
  setIsReplying(false);
});
```

**There is no `.catch()`.** `void` silences the lint rule about floating promises without handling the rejection, so any failed send becomes an unhandled rejection.

### 1.3 The user-visible half is worse than the log

The crash is noisy but survivable. The stuck state is not: `setIsReplying(false)` lives **only** in the success path. On failure `isReplying` stays `true` forever, and since `ChatComposer` and every `SuggestedPromptCard` take `isBusy={conversation.isReplying || isUnavailable}`, the composer is disabled for the rest of the page's life. The user's message sits in the thread with no reply, no error, and no way to retry — the typing indicator never stops.

One dropped Wi-Fi packet bricks the screen until a reload. That is the actual bug; the console line is the symptom that got noticed.

### 1.4 Fix

1. Attach a rejection handler that resets `isReplying` **and** surfaces the failure, guarded by the same epoch check as the success path so a reset conversation does not adopt a stale error.
2. Represent the failure in the thread rather than only in a toast — a `ConversationMessage` variant carrying error copy and a **retry** action, so the user's typed text is not lost. Losing what someone typed because the network blinked is the part that feels broken.
3. Move `setIsReplying(false)` out of both branches into a single settlement path, so no future edit can reintroduce a route that leaves it `true`.
4. Keep transport failures distinct from policy failures: a 503 from chat being disabled is already handled by `AssistantUnavailableNotice` and must not become a retryable thread error.

**Specs:** a rejecting `requestReply` leaves `isReplying` false, renders a retry affordance, keeps the user message, and produces no unhandled rejection; retry re-sends the same text; a rejection after `resetConversation` renders nothing.

## 2. Recent history does nothing

### 2.1 This is not a regression

`ConsultationHistoryItem` is `disabled`, `cursor-not-allowed`, and titled with the `historyUnavailable` string. It was shipped as a deliberate placeholder — the list renders session titles and refuses to open them. So "not working" is accurate, but the fix is *build it*, not *repair it*.

### 2.2 Four separate things are missing

**a. Nothing loads a past conversation.** `useConversation` holds messages in local React state, seeded with a greeting. There is no path that fetches an existing session's turns. The endpoint exists and is already generated — `chatControllerListMessagesV1` in `lib/api/generated/ai-chatbot/ai-chatbot.ts` — and is currently referenced nowhere in `apps/web`.

**b. The session id is trapped inside the service instance.** `createChatConversationService` creates a session lazily on first send (`resolveSessionId`) and keeps the id in a closure. `AiAssistantPanel` starts a new conversation by bumping `conversationEpoch` to build a *new service*. There is no way to point the panel at an **existing** session id, which is precisely what opening a history entry means. The service needs to accept an optional existing session id, and the panel needs to hold the active one as state rather than let it hide in a closure.

**c. The list never refreshes.** `useChatSessions` runs once; the session row is created server-side during the first `requestReply`. Nothing invalidates `getChatControllerListSessionsV1QueryKey()` afterwards, so a user who has just had a conversation sees a history list that does not contain it until a full page reload. Invalidate after the first successful send of a new session.

**d. There is no empty state.** `history.map(...)` over an empty array renders an empty `<div>` under a heading. A user with no history sees the same thing as a user whose history failed to load. `useChatSessions` sets `retry: false` and a 503 is expected when chat is off — all three cases need distinct copy.

### 2.3 Fix

- Accept an optional `sessionId` in `createChatConversationService`; when present, skip creation and use it.
- Lift the active session id into `AiAssistantPanel` state. "New consultation" clears it; selecting a history entry sets it.
- Load that session's turns with `chatControllerListMessagesV1` and seed `useConversation` from them instead of from the greeting. `SYSTEM` turns are **not** rendered — they are the record of processing (`ai-chatbot.md` §5.1), not conversation, and Phase 15 will put redacted payloads in them.
- Make `ConsultationHistoryItem` a real button with `onSelect`, an active state for the open session, and the `disabled` stub removed along with the `historyUnavailable` string.
- Invalidate the sessions query after a send that created a session.
- Add empty, loading, and error states to the history section.

**Note for Phase 15:** once tool results exist, replaying a session must also restore `meta.toolResults` rendering, or a reopened conversation will show prose where cards used to be. Worth building the seed path with that in mind even though the field does not exist yet.

**Gap found while building this:** a replayed assistant turn cannot show its disclaimer. `ChatMessageView` records `disclaimerShown: boolean` but not the text — the wording rides on the send-response envelope's `meta` and is never persisted per message. Synthesizing it client-side would be exactly the "render as if it had been shown" failure the live path is written to avoid, so replayed turns carry none and the standing confidential-data notice under the composer covers the screen. Closing this properly is an API change (persist the disclaimer with the turn, or expose it on `ChatMessageView`) and is deliberately **not** in these fixes, which are frontend-only.

## 3. Background chat, toast, and unread badge

### 3.1 What is in the way

The assistant is a **page**, and its state lives inside that page. `useConversation` is called by `AiAssistantPanel`, which is rendered by `app/admin/ai-assistant/page.tsx`. Navigating away unmounts it and the conversation is gone — including an in-flight reply, whose rejection then has nowhere to land (§1). `ChatLauncher` is a `Link` to that route, not an overlay, so "open the assistant" always means "leave what you were doing".

Making chat run in the background is therefore not a component change. It is moving conversation state above the route.

### 3.2 Shape

- **`AiAssistantProvider`** — a client provider mounted in the three layouts that already mount `ChatLauncher` (`app/admin/layout.tsx`, `app/doctor/layout.tsx`, `app/portal/layout.tsx`). It owns the active session id, the messages, `isReplying`, and the unread count. `useConversation` moves behind it; `AiAssistantPanel` becomes a consumer instead of an owner.
- **In-flight requests survive navigation**, because the provider outlives the route. This makes §1's rejection handling load-bearing rather than merely correct — a reply that fails while the user is on another screen must not crash the app.
- **Toast on arrival while away.** Reuse `sonner`, already used in `components/client/integrations/*`. Fire only when the assistant screen is not the active route — a toast for a reply the user is already looking at is noise. The toast links to the assistant.
- **Unread count** is the number of assistant replies that arrived while the assistant route was not active. Opening the route clears it. Persist across reloads only if the conversation is also restored (§2); until then it resets, which is correct — an unread badge pointing at a conversation the app has forgotten is worse than no badge.

### 3.3 Badge placement

Two entry points show it, and both need a change:

- **Sidebar item** — `lib/shell/nav-items.ts` defines the AI Assistant entry; `components/client/shell/sidebar-nav-item.tsx` renders it. `AdminNavItem` has no badge slot today. Add an optional badge that the nav item renders when non-zero. Keep it generic rather than assistant-specific — the same slot will be wanted for the approval queue later — but wire only the assistant now.
- **Top bar** — `components/server/shell/top-bar.tsx:28` links to `/admin/ai-assistant`. It is a **server component**; an unread count is client state, so the badge belongs in a small client component the top bar renders, not in the top bar itself.

Accessibility: the count needs an accessible label ("3 balasan belum dibaca"), not a bare number, and the toast must not be the only channel — it disappears.

### 3.4 Explicitly not in this item

- **A floating chat window** over other screens. That is a bigger UI decision and is not what was asked; the launcher keeps navigating to the page. The provider makes a floating window possible later without another rewrite.
- **Push or cross-device notification.** Browser-session only.
- **Polling for replies to sessions this browser did not start.** The unread count reflects *this* client's in-flight requests, not server state.

## 4. Collapsible consultation sidebar

### 4.1 Current state

`ConsultationSidebar` is `hidden w-80 shrink-0 ... lg:flex` — fixed width, and simply absent below the `lg` breakpoint, which means suggested prompts and history are **unreachable on tablet and mobile**, not merely hidden. That is a second problem sitting behind the requested one.

### 4.2 Fix

- Collapse toggle on the sidebar, animating between the current `w-80` and a narrow icon rail — rail rather than zero width, so "new consultation" stays one click away and the way back is obvious.
- Persist the preference (`localStorage`) so it survives navigation and reload; a reader who collapsed it wants it collapsed tomorrow.
- Below `lg`, make it an overlay drawer opened from a header button instead of leaving it absent. Same component, different presentation.
- The chat column is already `min-w-0 flex-1`, so it widens correctly on collapse with no change.
- `@hms/ui` sidebar primitives already exist (`SidebarMenuButton`, `SidebarMenuItem` are in use) — check for a collapsible primitive there before adding local state, per the `@hms/ui`-only rule.

## 5. Delivery tasks

Branch naming per repo convention: `fix/ai-assistant-<short-desc>` for the bug, `feature/ai-assistant-<short-desc>` for the rest.

1. `P13-F01` **Send-failure handling** (§1). Rejection handler, single settlement path for `isReplying`, error message variant with retry, transport-vs-policy failures kept distinct. Specs per §1.4. **Ship first, independent of everything else.**
2. `P13-F02` **Session replay** (§2). Optional `sessionId` in the conversation service, active session id lifted into panel state, `chatControllerListMessagesV1` seeding, `SYSTEM` turns excluded, sessions query invalidated after session creation, empty/loading/error states, `ConsultationHistoryItem` made real and the `historyUnavailable` string removed.
3. `P13-F03` **Background conversation** (§3.1–3.2). `AiAssistantProvider` in the three layouts, `AiAssistantPanel` converted to a consumer, in-flight requests surviving navigation, `sonner` toast fired only when the assistant route is inactive. Depends on `P13-F01`.
4. `P13-F04` **Unread badge** (§3.3). Optional badge slot on `AdminNavItem` + `SidebarNavItem`, client badge component for the server-rendered top bar, accessible label, cleared on route activation. Depends on `P13-F03`.
5. `P13-F05` **Collapsible sidebar** (§4). Collapse toggle, icon rail, persisted preference, sub-`lg` overlay drawer. Independent of all of the above.

## 6. Definition of Done

- A send that fails with a network error leaves the composer usable, keeps the typed text, offers a retry, and logs no unhandled rejection.
- A failed send while the user is on another screen does not crash the app.
- Clicking a recent consultation opens it with its turns, and no `SYSTEM` turn is rendered.
- A conversation started now appears in recent history without a reload.
- Empty, loading, and error states in the history list are visibly different from one another.
- Navigating away from the assistant and back does not lose the conversation or an in-flight reply.
- A reply arriving while the user is elsewhere raises one toast and increments the badge; opening the assistant clears it.
- The badge has an accessible label, not a bare number.
- The sidebar collapses to a rail, the choice survives a reload, and the prompts and history are reachable on a tablet.

## 7. Related Documents

- [ai-chatbot.md](./ai-chatbot.md) §8 — the Phase 13 frontend requirements these fixes build on
- [ai-chatbot-tools.md](./ai-chatbot-tools.md) §4.5 — Phase 15 renders tool results in the thread; §2.3's replay path should anticipate it
- [.claude/rules/nextjs-frontend.md](../../.claude/rules/nextjs-frontend.md) — one component per file, `components/server` vs `components/client`, `@hms/ui` only, Orval-generated client only
