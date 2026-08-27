# Staff invitations and outbound mail

**IMP-23.** How a staff account comes into existence, and what carries the
invitation.

---

## The problem this replaces

Until this ticket, an administrator created an account by typing the new
user's password into a form. Every such account had, from its first moment, a
password known to at least two people — and the second one had to get it to the
first somehow: WhatsApp, a sticky note, a spoken sentence across a busy front
desk. Nothing in the system recorded that this had happened, and nothing forced
the password to change afterwards.

The invitation flow removes the second person. An administrator supplies an
address and a set of roles; the person who ends up holding the account is the
only one who ever knows its password.

`POST /api/v1/users` — the direct create-with-password endpoint — still exists
and is still guarded by `user.create:any`. It is no longer reachable from the
web app: the create dialog was replaced by `AdminUserInviteDialog`, which has
no password field. Retiring the endpoint itself is a separate change, because
it means deciding what a `User` with no password means to the rest of the API.

## The token

`UserInvitation` is `RefreshToken` in a different hat, and deliberately so —
both are bearer secrets that must be presentable exactly once and revocable at
any moment.

| Property | Value | Why |
|---|---|---|
| Entropy | 256 bits from `randomBytes` | Unguessable; the accept route needs no throttle |
| Encoding | base64url | Survives a URL and an email client's line wrapping unescaped |
| At rest | SHA-256 hex, `UNIQUE` | Plain SHA-256, not Argon2: the input is uniformly random, so there is no dictionary for a slow hash to defend against |
| In the clear | The emailed link, once | `buildInvitationUrl` is the only function that assembles a URL from a token |
| Lifetime | `USER_INVITATION_TTL_HOURS`, default 72, capped at 336 | Survives a weekend; dead before a forwarded or archived link is interesting |

The token travels in the URL path, which means browser history, proxy logs and
the `Referer` header all see it. That is accepted rather than mitigated: the
page is *navigated to* from an email, so there is nowhere else to put it. The
short lifetime and the single use are the mitigation.

## States

Derived at read time from three timestamps, never stored as a column — a
`status` field would need a background job to move rows to `EXPIRED` the moment
the clock passes `expiresAt`.

| Status | Condition | Accept route answers |
|---|---|---|
| `PENDING` | not consumed, not revoked, not lapsed | 200 / 201 |
| `ACCEPTED` | `consumedAt` set | **409** — "already used", go and log in |
| `REVOKED` | `revokedAt` set | **410** — withdrawn, ask for another |
| `EXPIRED` | `expiresAt` passed | **410** — lapsed, ask for another |
| unknown token | no row | **404** |

Four distinguishable answers rather than one flat "invalid link". The usual
argument for flattening is that distinguishing leaks; here it leaks nothing,
because reaching the route at all requires guessing 256 bits. Someone holding a
real link that stopped working needs to know whether to log in, ask for a
resend, or ask their administrator — and one generic error tells them to do
none of those. The public page translates the *status code*, not the API's
English message (`resolveInvitationLinkMessageKey`), because it is the one
surface an invitee meets before they have an account.

A **resend revokes and replaces**: the old row gets `revokedAt`, a new row is
written with a fresh token and expiry, in one transaction. Rotating the hash in
place would erase the fact that an earlier link existed, and the question after
a leak is "how many links were minted for this address, and when".

## Roles

`roleCodes` is a denormalised `text[]` on the invitation, not `UserRole` rows.
The grant is not live until acceptance, and writing `UserRole` before then
would be a real permission grant to an account that cannot log in. Codes are
re-validated against `Role` at accept time, so a role deleted between invite
and accept fails loudly (400) rather than quietly creating an under-privileged
account.

The SUPER_ADMIN restriction from `AdminManagementService` is repeated on the
invite path: only a SUPER_ADMIN may invite one.

## Audit

| Action | Actor | Written when |
|---|---|---|
| `USER_INVITED` | the administrator | invite, and again on each resend (with `replacedInvitationId`) |
| `USER_INVITE_ACCEPTED` | **the invitee** | acceptance |
| `USER_INVITE_REVOKED` | the administrator | manual revoke |

`USER_INVITE_ACCEPTED` is the only row in `audit_logs` whose actor is its own
subject, and it is the moment an account becomes able to log in — so it is what
"when did this account start existing for real" reads back to. A `USER_CREATED`
row is written alongside it with `metadata.via = 'invitation'`.

## Mail

`MailService` (`apps/api/src/common/mail/`) is a provider-neutral abstraction
in the same shape as `ObjectStorageService`: feature services inject the
abstract class and never see a transport SDK. Two implementations:

- **`SmtpMailService`** — nodemailer over SMTP. Provider-neutral by design: the
  same six variables point it at Brevo, Postmark, Mailtrap, SES's SMTP
  endpoint, or a Gmail app password.
- **`LogMailService`** — writes the message to the application log, plain-text
  body and link included, and sends nothing. Selected when `MAIL_HOST` is
  empty.

The log transport logs the link on purpose. A developer with no SMTP account
still has to be able to walk the accept flow, and a transport that swallowed
the one thing the email exists to deliver would be a silent failure with extra
steps.

### Configuration

| Variable | Default | Notes |
|---|---|---|
| `MAIL_TRANSPORT` | inferred | `smtp` or `log`; unset, the presence of `MAIL_HOST` decides |
| `MAIL_HOST` | *(empty)* | Setting it selects SMTP. Required when `MAIL_TRANSPORT=smtp` |
| `MAIL_PORT` | `587` | |
| `MAIL_SECURE` | `port === 465` | Implicit TLS. On 587 leave it false — STARTTLS still applies |
| `MAIL_USER` / `MAIL_PASSWORD` | *(empty)* | **Set together or not at all.** A half-filled pair fails at boot |
| `MAIL_FROM` | `Saling Jaga <no-reply@localhost>` | Must be an address the provider authorises, or messages are dropped |
| `MAIL_CONNECTION_TIMEOUT_MS` | `10000` | Also the greeting timeout |
| `WEB_APP_BASE_URL` | `http://localhost:3000` | The **web** origin links point at, not the API's |

### Send failures do not fail the caller

The invitation row is committed first; the send is fire-and-forget after it.
An SMTP timeout that rolled back the invite would leave the administrator with
a success-shaped failure and no row to resend from. A refused send logs
`mail_send_failed` — **without the recipient address**, because a bounce log is
otherwise a list of addresses the clinic tried to reach — and the invitation
appears in the pending list with a resend button, which is the recovery.

## Routes

| Method | Path | Guard |
|---|---|---|
| `GET` | `/api/v1/users/invitations` | `user.read:any` |
| `POST` | `/api/v1/users/invitations` | `user.create:any` |
| `POST` | `/api/v1/users/invitations/:id/resend` | `user.update:any` |
| `DELETE` | `/api/v1/users/invitations/:id` | `user.update:any` |
| `GET` | `/api/v1/invitations/:token` | **public** |
| `POST` | `/api/v1/invitations/:token/accept` | **public** |

No new permission keys. Inviting someone *is* creating a user, on a schedule of
the invitee's choosing; a separate key would let a role hold one without the
other, which is not a distinction a clinic can act on.

The two public routes are on `PUBLIC_ROUTE_ALLOWLIST` in
`route-guard-coverage.spec.ts` — adding them was a diff-visible act in the PR
that added the routes. The web route `/invite/[token]` is outside `proxy.ts`'s
matcher for the same reason: the person opening it has no session, and the auth
gate would bounce every legitimate invitee to a login page they cannot use yet.

## Local development

With no `MAIL_*` set, invite someone from the admin UI and read the link out of
the API's stdout:

```
[mail:log-transport] to=… subject=Undangan akun Saling Jaga / …
… http://localhost:3000/invite/<token> …
```

Open it in a private window (the accept page needs no session, but an existing
one makes the outcome confusing) and set a password.
