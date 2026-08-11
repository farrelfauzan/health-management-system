# WhatsApp rollout: go/no-go checklist

The gate between "the channel works on Telegram" and "the clinic's WhatsApp
number is published". Every item is a thing somebody checks and signs, not a
thing somebody remembers.

Shipped with `PCS-T11`. Companion to the
[number runbook](./whatsapp-number-warmup.md) and the
[channel strategy](../customer-service/wa-telegram-customer-service-strategy.md)
(§8 for the controls, §9 for the staged rollout).

---

## Why this exists as a document

Announcing the number is the one irreversible step in this phase. A banned
number cannot be un-banned, a patient's data sent to the wrong place cannot be
recalled, and a chat that booked forty appointments nobody saw cannot be
un-promised. Everything before this point is reversible by turning
`CS_CHANNEL_ENABLED` off.

So the gate is deliberately boring: two clean weeks of real Telegram traffic,
then a checklist, then a decision with a name against it.

---

## 1. Two clean weeks on Telegram (D-CS-05, §9)

**Not** two weeks since the code merged. Two weeks of the channel handling real
customers, with somebody reading the transcripts.

Read the numbers from **Admin → Conversations → the metrics card**, or
`GET /api/v1/admin/conversations/metrics?days=14`.

- [ ] The channel has been live and enabled for **≥ 14 consecutive days**
- [ ] **≥ 50 conversations** in the window — below that the rates below are
      noise, not evidence
- [ ] At least one booking completed end to end and the patient arrived
- [ ] Transcripts spot-read on at least 5 separate days by a named person

### What "clean" means, numerically

| Metric | Gate | Why this number |
| --- | --- | --- |
| `handoffRate` | **< 0.25** | Above a quarter, the bot is generating work rather than absorbing it, and WhatsApp volume will multiply that |
| `bookingConversion` | **> 0.10** | The channel exists to book. Below this it is an expensive FAQ |
| `faqNoHitRate` | **< 0.30** | Above this the corpus has holes. Fix the corpus, not the prompt |
| `budgetExhaustedTurns` | **0** | Reaching §8.3's daily cap on a pilot means the cap is wrong or something is looping |
| `enumerationFlags` | **0**, or every one reviewed and explained | A flag is not automatically an attack — a family sharing a number produces the same shape — but an unexamined one is |
| `rateLimitedTurns` | Reviewed | A handful is normal. A spike is one chat worth opening |

A metric outside its gate is **not** an automatic no-go. It is a question that
has to be answered in writing before the box is ticked.

---

## 2. Controls verified

These are asserted by the test suite on every CI run; the boxes are for
confirming they are *enabled in the deployment you are about to expose*.

- [ ] `CS_RATE_LIMIT_PER_CHAT_HOUR` set (default 20) — per-chat flood control
- [ ] `CS_MAX_LLM_CALLS_PER_DAY` set (default 2000) — clinic-wide budget cap
- [ ] `CS_OTP_MAX_CHALLENGES_PER_DAY` set (default 3) — per-chat challenge quota
- [ ] `CS_ENUMERATION_CHAT_THRESHOLD` set (default 3) — cross-chat registry probing
- [ ] `CS_MAX_ACTIVE_BOOKINGS_PER_PHONE` and `CS_MAX_DRAFT_BOOKINGS_PER_DAY` set
- [ ] `WA_GATEWAY_WEBHOOK_SECRET` is a generated value, **not** the compose default
- [ ] `WA_GATEWAY_BASIC_AUTH_*` (GOWA) or `WA_GATEWAY_API_KEY` (WAHA) generated
- [ ] The bridge container has **no published port** — `docker compose ps` shows
      no host mapping for it
- [ ] Admin → Integrations → WhatsApp session card reads **Connected**

### Verified by the suite, for reference

| Control | Where it is proven |
| --- | --- |
| Prompt injection refused in both languages, without reaching a provider | `channel-abuse.spec.ts` |
| Volunteered NIK/BPJS redacted **before** persistence, even inside a blocked message | `channel-abuse.spec.ts` |
| Emergency answered ahead of the injection guard | `channel-abuse.spec.ts` |
| Guards stable across a 200-message burst | `channel-abuse.spec.ts` |
| Enumeration counted across **distinct chats**, not per chat | `channel-abuse.integration.spec.ts` |
| Daily budget counts provider replies only, not templates | `channel-abuse.integration.spec.ts` |
| Budget exhaustion still answers emergencies | `conversation.service.spec.ts` |
| A flagged conversation still completes its booking and says nothing | `conversation.service.spec.ts` |
| Webhook rejects a bad signature, a tampered body, and an unset secret | `whatsapp-webhook-auth.guard.spec.ts` |
| Both bridges behave identically on the same conversations | `whatsapp-gateway-contract.spec.ts` |

---

## 3. Privacy (UU PDP)

- [ ] The first-message notice has been **reviewed by counsel**. The copy was
      revised at `PCS-T11` to add third-party AI processing, the 90-day
      retention period, and a route to exercise rights — but
      [`privacy-notice.id.md`](../legal/privacy-notice.id.md) is still marked
      `PLACEHOLDER`, and **that placeholder is a blocker for this step, not a
      caveat**
- [ ] The retention period stated in the notice matches
      `CS_CONVERSATION_RETENTION_DAYS`
- [ ] Somebody has confirmed the AI provider in `ai_provider_configs` is one
      the clinic is willing to name as a processor
- [ ] The clinic's privacy officer knows this channel exists and how to pull a
      transcript for a data-subject request

---

## 4. Operational readiness

- [ ] A **dedicated** business number, never used for WhatsApp before, never a
      staff member's personal line
- [ ] Warm-up schedule completed (runbook §3)
- [ ] `hms-gowa-session` / `hms-waha-session` volume is backed up
- [ ] Somebody knows how to re-pair (runbook §5) and has done it once in staging
- [ ] Somebody is named as the person who watches the session card daily
- [ ] The handoff queue has a named owner during clinic hours
- [ ] The arrival worklist is part of the front desk's routine, not a screen
      somebody was shown once

---

## 5. Rollback

Rehearse this before you need it. It should take under a minute.

- [ ] `CS_CHANNEL_ENABLED=false` + API restart has been tested, and the webhook
      answers `DISABLED` rather than 404
- [ ] Confirmed that turning the channel off leaves existing appointments
      untouched — they are ordinary `Appointment` rows
- [ ] Everyone involved knows that customers mid-conversation get **silence**,
      not an error, and that somebody must phone anyone mid-booking

---

## 6. Decision

> Announcing the WhatsApp number is not reversible. If any box above is
> unticked, the answer is no — and "no" costs a week, while "yes" too early can
> cost the number.

| | |
| --- | --- |
| Date | |
| Telegram window reviewed | from ………… to ………… |
| Conversations in window | |
| Handoff rate / booking conversion / FAQ no-hit rate | ……… / ……… / ……… |
| Enumeration flags, and their explanation | |
| Outstanding items and why they are acceptable | |
| **Decision** | GO / NO-GO |
| Clinical or operational owner | |
| Technical owner | |
| Privacy officer | |

Re-run this checklist before any later change that widens exposure: a second
number, a new bridge, or removing the reply-only posture.
