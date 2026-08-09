# WhatsApp number runbook (GOWA)

Operational procedures for the clinic's WhatsApp channel: choosing and warming
the number, keeping the session alive, and re-authenticating when it dies.

Companion to [the channel strategy](../customer-service/wa-telegram-customer-service-strategy.md)
— §2.1 for why GOWA, §8.1 for the security posture, §8.4 for operations. This
document is the *how*; the strategy is the *why*.

Shipped with `PCS-T09`.

---

## 1. The risk this document exists for

GOWA drives a real WhatsApp Web session over the unofficial multi-device
protocol. **This violates WhatsApp's terms of service, and the number can be
banned.** Not throttled, not warned — banned, usually without notice and
usually permanently.

Everything below is a mitigation, and none of them is optional:

| Mitigation | Why |
| --- | --- |
| A dedicated business number | A ban takes the number with it. If that number is also the one printed on the clinic's door and answered by the front desk, a ban is an outage of the clinic's phone line, not of a chatbot. |
| Gradual warm-up | A brand-new number that sends hundreds of messages on day one is the exact signature of the spam automation the ban heuristics were built for. |
| Reply-only posture | The channel answers; it does not initiate. Unsolicited first contact is what gets reported, and user reports are the strongest ban signal there is. |
| Send pacing | Replies leave one at a time with a gap (`WA_GATEWAY_SEND_PACING_MS`, default 1000 ms). A burst of simultaneous sends does not look like a person. |
| Per-chat rate limits | Already enforced by the conversation layer (`CS_RATE_LIMIT_PER_CHAT_HOUR`), which answers with a template instead of calling the model. |

The long-term fix is the official **WhatsApp Business Cloud API**, which has
message-template costs and business verification but no ban risk. The
`WhatsappGatewayPort` interface exists so that adapter is a drop-in third
implementation. Treat GOWA as the pragmatic v1, not the endgame.

---

## 2. Choosing the number

1. **Buy a SIM that has never been used for WhatsApp.** A number previously
   registered and then abandoned carries whatever history it had.
2. **Never use a staff member's personal number**, and never use the clinic's
   main published line until the channel has run clean for a month on the
   dedicated one.
3. **Register it in the WhatsApp app first**, on a real phone, and complete the
   profile: business name, address, hours. A number with no profile that
   immediately starts messaging is a bare automation account.
4. **Keep the SIM.** Re-pairing after a logout needs the phone that owns the
   number (§5).

---

## 3. Warm-up schedule

The goal is a traffic curve that looks like a business gradually telling its
customers about a new channel — because that is what it is.

| Days | What to do | Ceiling |
| --- | --- | --- |
| 1–2 | Staff message the number from their own phones and hold ordinary conversations. Do not announce it. | ~10 conversations/day |
| 3–7 | Invite a handful of regular patients who have agreed to try it. Leave `CS_CHANNEL_ENABLED=false` for part of each day if needed. | ~30 conversations/day |
| 8–14 | Soft launch: mention the number to patients at the counter. Watch the handoff queue and the transcript quality daily. | ~100 conversations/day |
| 15+ | Publish the number, if the two weeks were clean. | Monitor and grow |

**Do not announce the WhatsApp number publicly until the channel has run two
clean weeks**, per the strategy's staged-rollout plan (`PCS-T11`). "Clean"
means: no ban warning, no spike in handoffs, and no session logouts you did not
cause.

While warming up, raise `WA_GATEWAY_SEND_PACING_MS` to `2000`–`3000`. The cost
is a reply that arrives a second or two later; the benefit is a send pattern
that is harder to distinguish from a person typing.

---

## 4. Deployment posture

The compose service is behind the `whatsapp` profile, so it does not start by
default:

```bash
docker compose -f infra/docker/docker-compose.dev.yml --profile whatsapp up -d
```

Three properties of that service are load-bearing rather than incidental, and
each is a way the clinic's WhatsApp session can be stolen if it is changed:

- **The REST port is never published.** There is no `ports:` mapping on the
  `gowa` service, and there must not be. Anyone who can reach GOWA's API can
  send messages as the clinic and read its session. Reach it in development
  with `docker compose exec` or a sidecar on the same network — never by adding
  a port mapping "just for now".
- **Basic auth is on.** `WA_GATEWAY_BASIC_AUTH_USERNAME` /
  `WA_GATEWAY_BASIC_AUTH_PASSWORD` must be generated per deployment. The
  compose defaults are for one developer's laptop.
- **The session volume is persisted.** `hms-gowa-session` holds the paired
  device credentials. `docker compose down -v` destroys it and forces a re-pair
  against a live number. Back it up before any operation that touches volumes.

Webhook authentication is HMAC-SHA256 over the raw body
(`WA_GATEWAY_WEBHOOK_SECRET`, echoed in `X-Hub-Signature-256`). Generate it
with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

An **empty** secret closes the webhook rather than opening it. That is
deliberate: a forged inbound message on this channel can book an appointment.

---

## 5. QR pairing and re-authentication

A logged-out WhatsApp session is the channel's number one operational failure
mode, and the reason is that **nothing fails**. The bridge keeps answering, the
API keeps accepting bookings, the conversation state machine keeps working —
and every reply is silently never delivered. A clinic can lose a day of
customer messages without one error in the logs.

### Watching for it

The admin **Integrations → WhatsApp** card polls
`GET /api/v1/admin/channel-gateway/whatsapp/session` and shows three separate
flags, because they fail differently:

| Flag | Meaning | Response |
| --- | --- | --- |
| `isConfigured: false` | No gateway configured | Set `WA_GATEWAY_BASE_URL` and restart the API |
| `isConnected: false` | The bridge cannot reach WhatsApp, or the bridge is down | Usually transient. Check the container is up; wait a minute |
| `isLoggedIn: false` | **The pairing is gone** | Re-pair. Nothing else fixes it |

### Re-pairing

1. Open the WhatsApp card in admin and press **Re-pair**, or call
   `POST /api/v1/admin/channel-gateway/whatsapp/session/pairing`.
2. The response carries `qrLink`, pointing at the bridge **on the private
   network**. HMS does not proxy the image — a pairing code grants the WhatsApp
   session outright, and re-serving it would put a live credential into an HMS
   response and its caches. Open the link from a machine on that network.
3. On the phone holding the SIM: WhatsApp → Settings → Linked devices → Link a
   device → scan.
4. Poll the session endpoint until `isLoggedIn` is true. The QR expires in
   about 60 seconds; start again if it does.

### If re-pairing keeps failing

Repeated failed pairings, or a pairing that succeeds and drops within minutes,
usually means the number was banned rather than logged out. Check by opening
WhatsApp on the phone itself — a banned number says so there. If it is banned,
the number is gone: move to a new SIM and restart the warm-up from day one.

---

## 6. Daily checks

- The WhatsApp session card is green.
- The handoff queue (`/admin/conversations`, filter *Needs a human*) is not
  growing unattended — a rising queue with no replies is what a logged-out
  session looks like from the customer's side.
- The arrival worklist on `/admin/registrations` has been worked, so
  chat-created drafts are not accumulating.

## 7. What to do on a ban

1. Stop the channel: `CS_CHANNEL_ENABLED=false`, restart the API. The webhooks
   stay registered and answer `DISABLED`, which is a much easier state to
   diagnose later than a 404.
2. Telegram is unaffected — it is a different channel with no ban risk — so the
   conversational service keeps running there.
3. Bookings already made are unaffected: they are ordinary `Appointment` rows.
   Customers mid-conversation are not: their next message goes nowhere. Work
   the transcript list and phone anyone who was mid-booking.
4. Post-mortem before re-launching on a new number. A ban that is not
   understood will happen again on the replacement.
