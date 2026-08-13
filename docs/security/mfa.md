# TOTP multi-factor authentication

**SJ-8.** Which accounts need a second factor, how login changes for them, and
what happens when someone loses their phone.

---

## Who needs one

A **permission-set predicate**, never a role-name list:
`apps/api/src/modules/auth/service/privileged-permission.predicate.ts`.

| Pattern | Why |
|---|---|
| `*.manage:any`, `*.*.manage:any` | Reconfigures an upstream integration |
| `*.export:any`, `*.export:own`, `*.*.export:any` | Bulk data egress |
| `user.create:any`, `user.update:any` | Creates or alters accounts |
| `role.assign:any`, `role.unassign:any` | Can grant permissions — including its own |
| `audit.read:any` | Reads the access log wholesale |
| `patient.merge:any` | Irreversible across two records |

Matching on the capability rather than the role name is the point. Clinics
rename roles and invent new ones; a role called `BILLING_SUPERVISOR` that is
granted `role.assign:any` next quarter requires a second factor the moment it
is granted, with no code change. The predicate runs against the user's resolved
permissions on **every login and every refresh** — nothing is cached on the
user row, so revoking a privileged role stops requiring MFA immediately.

Ordinary clinical work is deliberately absent. Making a receptionist produce a
code to open the day's appointment list would teach the whole clinic to resent
the control, and every workaround people invent for it is worse than the
control was good.

## Login becomes two-phase

```
password ok ──► privileged?  ── no ──► access + refresh tokens
                    │
                   yes
                    │
        ┌───────────┴────────────┐
   factor enrolled?          not enrolled
        │                         │
   MFA_REQUIRED           MFA_ENROLMENT_REQUIRED
   challenge ticket        enrolment ticket
        │                         │
   POST /auth/mfa/challenge   POST /auth/mfa/enroll → verify
        │                         │
        └────────► access + refresh tokens ◄────────┘
```

`POST /auth/v1/login` returns a `status` discriminator. **Branch on it** — a
client that reaches straight for `tokens` breaks the moment an account becomes
privileged.

### The ticket

A two-minute JWT with three claims (`sub`, `purpose`, `jti`) and nothing else.
No permissions, no roles, no email.

It is signed with `HMAC-SHA256(JWT_ACCESS_SECRET, "hms:mfa-pending-ticket:v1")`
rather than the access secret itself. That is the load-bearing detail: the
global `JwtAuthGuard` would happily populate `request.user` from anything that
verifies against the access secret, and `PermissionsGuard` then resolves
permissions from the database — so a ticket that verified as an access token
would carry full authority. A derived key makes that a *signature* failure
instead of a check somebody has to remember. The `purpose` claim is checked as
well, so a challenge ticket cannot be spent on enrolment.

Deriving from `JWT_ACCESS_SECRET` also keeps SJ-5's rotation runbook unchanged:
tickets follow the access key through a rotation and previous keys still
verify.

## Enforcement lives at token issuance

Not on individual routes. `AuthService.login` and `AuthService.refresh` are the
only two places a session can begin, so a check there cannot be forgotten by a
future route — forgetting it means not issuing a token at all.

Refresh is checked as well as login. Promote a user to an admin role and their
existing refresh token would otherwise keep minting access tokens for a week
without ever passing a challenge. The family is **revoked** rather than merely
refused, so the client is sent back through login, which is the path that hands
out an enrolment ticket.

### Grace period

`MFA_ENFORCEMENT_GRACE_UNTIL` — an absolute ISO-8601 instant, unset by default
(enforce immediately). While it is in the future a privileged account without a
factor still gets tokens, and the login response carries
`mfaEnrolmentRequired` plus the deadline so the frontend can nag.

Absolute rather than "N days per account", deliberately. A per-account window
measured from when someone became privileged has *already elapsed* for every
administrator who has held the role for a year — the first deploy would lock
them all out with no warning at all, which is the opposite of a grace period.

An unparseable value is logged and treated as absent: enforce now. That is the
failure someone notices and cannot exploit.

### Failing open, once

Without `MFA_SECRET_ENCRYPTION_KEY` nobody can enrol, so enforcement stays off
and a warning is logged at boot. Enforcing in that state would lock every
administrator out with no route back in short of an operator editing the
database.

Production cannot reach that state: `validateEnvironment` refuses to boot
without the key. Development and CI, which run thousands of tests that never
touch MFA, need no key.

## Cryptography

| Thing | Treatment | Why |
|---|---|---|
| TOTP secret | AES-256-GCM, `MFA_SECRET_ENCRYPTION_KEY` | Symmetric construction — the server recomputes the same HMAC the phone does, so it must read the secret back. Hashing would produce a factor that verifies nothing. |
| Recovery code | SHA-256, salted with the owner's id | 75 bits of CSPRNG output: no dictionary to slow down, nothing an offline search reaches. The salt stops one precomputation spanning users. |
| Password | Argon2id | See [password-policy.md](password-policy.md) |

TOTP is RFC 6238 with the parameters every authenticator assumes — SHA-1, six
digits, thirty-second steps — stated explicitly in `MfaService` rather than
inherited, because a library default drifting away from them would silently
invalidate every enrolment in the clinic.

`totp-base32.plugin.spec.ts` pins the implementation against the RFC 6238
Appendix B vectors.

### Replay

Codes are valid for a whole 30-second step, so a code read over someone's
shoulder would otherwise work again for the rest of its window.
`mfa_credentials.last_accepted_time_step` records the counter of the last
accepted code and only ever moves forward; the `lt` filter on the update makes
the database the arbiter when two requests race, so exactly one wins and the
other reads as a replay.

Drift tolerance is ±30 s (one step either side). A replayed code and a wrong
code produce **identical** responses — telling a caller their code was "right
but already used" confirms the value they guessed was real.

### Throttling

Five failures then exponential backoff, reusing SJ-7's curve, keyed on
`sha256("mfa:" + userId)` so MFA failures never count against the account's
password streak.

The per-IP ceiling is deliberately *not* applied: charging challenges against
it would halve the login capacity of a clinic behind one NAT, and nothing is
given up, because a challenge is unreachable without a login that already paid
the IP toll.

## Recovery and reset

| Situation | Path |
|---|---|
| Lost phone, has recovery codes | Present one at the challenge. Single-use, audited as `MFA_RECOVERY_USED`. |
| Lost phone, no codes | A colleague with `user.update:any` calls `POST /auth/mfa/reset`, producing **their own** current code. Audited as `MFA_RESET` with a reason. |
| New phone, still has the old one | Reset your own id through the same endpoint, then enrol again. |
| Running low on codes | `POST /auth/mfa/recovery-codes`, which also requires a current code. |

Ten codes are issued at enrolment and shown exactly once — only hashes are
stored, so a client that fails to display them has cost the user their
fallback. Regenerating invalidates every prior code.

`POST /auth/mfa/enroll` **refuses** when a verified credential already exists,
and that refusal is a security control rather than tidiness: beginning an
enrolment clears `verified_at`, so without it anyone holding a stolen access
token could strip the victim's second factor by starting an enrolment they
never finish — turning the endpoint that adds a factor into the one that
removes it.

## Audit events

`MFA_ENROLLED`, `MFA_CHALLENGE_FAILED`, `MFA_RECOVERY_USED`,
`MFA_RECOVERY_REGENERATED`, `MFA_RESET`.

`MFA_RESET` is the one to watch: it is the single action that downgrades
another account to a password. SJ-24's alerting should treat a burst of them,
or any outside working hours, as an incident.

## Configuration

| Key | Required | Notes |
|---|---|---|
| `MFA_SECRET_ENCRYPTION_KEY` | Production only | 32 bytes, base64 or hex. Distinct from every other encryption key. |
| `MFA_SECRET_KEY_VERSION` | No | Defaults to 1. Stamped on each row so a rotation can find what needs re-sealing. |
| `MFA_ENFORCEMENT_GRACE_UNTIL` | No | ISO-8601 instant. Unset enforces immediately. |
| `MFA_ISSUER_NAME` | No | What the authenticator app shows. Defaults to "HMS Clinic". |

Losing `MFA_SECRET_ENCRYPTION_KEY` is recoverable but disruptive: every
enrolled user must re-scan, via `MFA_RESET` by an administrator who can still
produce their own code — so **do not rotate it without a plan for the last
administrator standing.**

## Rollout

1. Generate and set `MFA_SECRET_ENCRYPTION_KEY` (`openssl rand -hex 32`).
2. Set `MFA_ENFORCEMENT_GRACE_UNTIL` to roughly two weeks out.
3. Deploy. Privileged users are let in and told.
4. Watch `MFA_ENROLLED` counts; chase the stragglers.
5. Let the deadline pass. Remaining privileged users are handed an enrolment
   ticket at their next login and enrol before they get in.

Step 2 is not optional on a clinic that already has administrators. Skipping it
means every one of them enrols under pressure at their next login.
