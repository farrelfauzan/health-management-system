# Telegram rollout: go/no-go checklist

The gate between "the code is deployed" and "customers are told the bot's
name". Every item is a thing somebody checks and signs, not a thing somebody
remembers.

Companion to the [WhatsApp go/no-go](./whatsapp-rollout-go-no-go.md), which
gates the *next* channel, and to the
[deployment runbook](./deployment-runbook.md) for the mechanics.

---

## Why this exists as a document

Two environment variables make the webhook *accept* a message. Four more
things make the bot actually *serve* one, and every one of them fails quietly:

| What is missing | What the customer sees |
|---|---|
| `CS_CHANNEL_ENABLED` off | Nothing. The webhook authenticates and does no work. |
| Seed never run | Every booking fails — the channel's system account does not exist |
| No active AI provider row | "Layanan sedang tidak tersedia" for every message |
| Empty FAQ corpus | "Saya tidak punya informasi itu" for every question |
| Webhook not registered | Nothing at all. Telegram has nowhere to deliver. |

None of these logs an error at deploy time. The channel looks deployed and
answers nobody. That is the failure this checklist exists to catch before a
patient finds it.

---

## 1. One bot per environment

**A bot token has exactly one webhook, globally — not one per environment.**

If staging and production share a token, whichever registers last silently
takes the traffic and the other goes quiet with a configuration that still
looks correct. There is no error, on either side.

- [ ] A **separate bot** exists in @BotFather for each environment that will
      run this channel
- [ ] Each environment's `TELEGRAM_BOT_TOKEN` is that environment's own bot
- [ ] The bot's display name and username are ones the clinic is willing to
      publish (they are visible to every customer)

---

## 2. Environment

- [ ] `CS_CHANNEL_ENABLED="true"` — defaults to `false`; with it off the
      webhook authenticates and does nothing
- [ ] `TELEGRAM_BOT_TOKEN` set from this environment's bot
- [ ] `TELEGRAM_WEBHOOK_SECRET` set, and drawn from `A–Z a–z 0–9 _ -` only.
      Generate with:
      `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
      **Base64 is rejected by Telegram** — `/` and `=` are not allowed in a
      secret token, and the failure appears as `400 Bad Request: secret token
      contains unallowed characters`
- [ ] `HMS_DOMAIN` set to this deployment's public host, and reachable over
      HTTPS with a browser-trusted certificate. Telegram will not deliver to
      plain http or to a self-signed certificate
- [ ] `CLINIC_TIMEZONE` set — it is the source of "today" in the assistant's
      prompt, so a wrong value makes it mis-resolve "besok"
- [ ] `CS_CLINIC_NAME` set — it appears in the system prompt and therefore in
      how the assistant introduces itself
- [ ] `CS_MAX_LLM_CALLS_PER_DAY` reviewed against expected volume. This is a
      **clinic-wide daily budget**, not per chat: a development value of `10`
      carried into production stops the channel after ten conversations
- [ ] `CS_RATE_LIMIT_PER_CHAT_HOUR` reviewed — the per-chat limit, which a real
      customer completing a booking can reach in a few minutes at low values

---

## 3. Database

`migrate deploy` does **not** seed. These rows arrive only from `pnpm db:seed`,
which is idempotent and safe to re-run.

- [ ] `pnpm db:seed` has been run against this environment
- [ ] The channel's system account exists —
      `customer-service-channel@system.hms.local`. Without it every booking
      fails with `ServiceUnavailableException`, because the channel has no
      actor to act as
- [ ] That account's role holds its grants, including
      `doctor-patient.assign:any` — without it bookings still succeed but the
      doctor is never linked to the patient, visible only as
      `appointment_care_team_link_failed` in the logs
- [ ] A current privacy-notice version is published. Without one,
      draft-patient creation throws and **every chat booking fails**
- [ ] An **active AI provider** row exists in `ai_provider_configs`, and
      `AI_PROVIDER_ENCRYPTION_KEY` is the same key its credential was
      encrypted with. Configuration lives in the database, not in the
      environment
- [ ] The clinic FAQ corpus is ingested and the embedding provider is
      reachable. An empty corpus is not an error — the assistant answers "saya
      tidak punya informasi itu" to every question, which is honest and
      useless

---

## 4. Registration

Register from **Admin → Integrations → Telegram webhook**. The URL is derived
from `HMS_DOMAIN` and shown read-only; it is never typed, so it cannot point
anywhere but this deployment.

- [ ] The card shows **Registered**, not "not registered" or "registered to a
      different deployment"
- [ ] The URL shown matches this environment's domain
- [ ] Any error the card displays is marked as one Telegram merely *remembers*
      — a resolved fault stays in `lastErrorMessage` forever and is not
      cleared by successful deliveries

If registering by hand instead (no portal access):

```bash
curl -F "url=https://<HMS_DOMAIN>/api/v1/channels/telegram/webhook" \
     -F "secret_token=<TELEGRAM_WEBHOOK_SECRET>" \
     "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook"
```

Then verify with `getWebhookInfo` — `setWebhook` answers `ok` for any
well-formed URL without checking that the host is yours.

---

## 5. Smoke test, on the real deployment

Run as a person, from a phone that is not a developer's.

- [ ] Send `halo` — the privacy notice arrives, once
- [ ] Ask a factual question the corpus covers — the answer is grounded, not
      invented
- [ ] Ask for a schedule using a relative date ("besok", "minggu depan") — the
      assistant resolves it instead of asking for a calendar date
- [ ] Ask by Indonesian poli name ("poli anak") — sessions are found
- [ ] Complete a booking with a name and phone number typed the natural way,
      without separators — the number survives and the booking is created
- [ ] The booking appears in the portal under the **name that was typed**, and
      the doctor is on that patient's care team
- [ ] Send a message describing chest pain — the emergency template arrives
      and the conversation moves to `NEEDS_HUMAN`. **Return it to the bot from
      the admin screen afterwards**; nothing does so automatically
- [ ] `pending_update_count` is `0` after the test

---

## 6. Turning it off

The whole channel is reversible, and knowing how before launch is part of the
gate.

- [ ] Everyone on call knows that `CS_CHANNEL_ENABLED="false"` plus a restart
      stops all work while keeping the webhook authenticated — Telegram keeps
      getting its 200s and does not disable the endpoint
- [ ] Everyone on call knows that removing the webhook entirely is
      `deleteWebhook`, and that doing so means Telegram **queues** updates
      rather than dropping them

---

## 7. Decision

- [ ] Every box above is ticked, or explicitly waived with a reason
- [ ] Name and date recorded here

| Field | Value |
|---|---|
| Decision | go / no-go |
| Environment | |
| Bot username | |
| Decided by | |
| Date | |
| Waivers | |
