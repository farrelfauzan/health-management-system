# Password policy and login throttling

**SJ-7.** How credentials are stored, what a password must satisfy, and what
happens to someone guessing.

---

## Storage: Argon2id

| Parameter | Value | Why |
|---|---|---|
| Algorithm | Argon2id | Memory-hard; the OWASP first choice for new systems |
| `memoryCost` | 65536 (64 MiB) | The parameter that actually costs a GPU attacker; OWASP floor at `t=3` |
| `timeCost` | 3 | |
| `parallelism` | 4 | |

Constants live in `apps/api/src/common/crypto/password-hasher.service.ts`, not
inline at call sites, because raising them is the intended response to faster
hardware.

### Measured cost

| Hardware | Median hash time | Measured? |
|---|---|---|
| Apple Silicon dev machine (M-series) | **~90–125 ms** | yes, 5-run sample |
| GitHub-hosted CI runner (`ubuntu-latest`) | — | **not measured** |
| Production host | — | **not measured** |

Only the dev-machine figure is a real measurement. It sits at the bottom of the
100–300 ms band the ticket asks for.

**This is the open item on the ticket.** Argon2 cost is a property of the
hardware it runs on, and a laptop number tells you very little about a clinic
server — which is likely to be slower, meaning the same parameters cost *more*
there, not less. Run the benchmark at the bottom of this page on the production
host before go-live and adjust `memoryCost` until the median lands near 250 ms.
Record the result in this table when you do.

### Migration off bcrypt

Every account predating this ticket holds a bcrypt hash. Nothing is reset.

On a successful login the stored hash is inspected; if it is bcrypt, or an
Argon2id hash written under weaker parameters than the current ones, it is
re-hashed and the row updated — using the one moment the plaintext is
legitimately in hand. Parameters are read out of the hash string rather than
assumed, so **raising the constants above is self-applying**: every login after
the change upgrades anything below the new floor.

A failed upgrade is logged and swallowed. The credential was already verified;
turning a successful authentication into an outage because a housekeeping write
failed would be the wrong trade.

---

## Policy: length and a breach check, nothing else

Following NIST 800-63B:

- **Minimum 12 characters**, maximum 200.
- **No composition rules.** No required digit, symbol, or capital. They push
  people towards `Password1!` and buy nothing measurable.
- **Rejected if it appears in breach corpora.**

Enforced by `passwordPolicySchema` in `@hms/shared-types` wherever a password is
*set*, and by `BreachedPasswordCheckerService` server-side.

The login schema is deliberately **not** subject to the 12-character floor:
raising it there would lock out every account whose password predates the rule.

### The breached-password list

`apps/api/src/common/crypto/common-breached-passwords.ts` carries a curated core
list — roughly 200 entries covering what dominates credential-stuffing traffic,
including Indonesian-language and clinic-domain guesses (`rahasia`,
`puskesmas`, `dokter`) that an English-only list misses entirely.

**This is not the full top-10,000.** To use one:

```bash
BREACHED_PASSWORD_LIST_PATH=/etc/hms/breached-passwords.txt
```

One entry per line; a SecLists `10-million-password-list-top-10000.txt` works
as-is. Entries are **merged** with the built-in list, never replacing it. An
unreadable file logs a warning and falls back to the built-in list rather than
failing startup or silently disabling the check.

The list is vendored rather than fetched, and the Pwned Passwords range API is
deliberately not used: a clinic server is expected to run without internet
access, and a wordlist that has to be downloaded is a wordlist that is missing
on the machine that needed it.

---

## Throttling

Two independent budgets, both checked **before** any password is verified — the
point is to stop a guessing loop short of the Argon2 work it is trying to make
the server do.

### Per account

- Streak counted since the last success, within a one-hour window.
- First **5** consecutive failures pass through normally.
- From the 6th: `2^(n-5)` seconds, capped at **15 minutes**.
- **Any success clears the streak.**

A **soft lock, not a hard one.** A hard lockout is a denial-of-service handed to
anyone who knows a colleague's email address; locking the front desk out of the
system during opening hours is a worse outcome than the guessing it prevents.

### Per IP

**10 attempts per minute per address**, then `429`. Generous for a clinic behind
one NAT — a front desk genuinely does log in repeatedly — and still orders of
magnitude below a useful guessing rate.

Uses the proxy-resolved client address, which is governed by `TRUSTED_PROXY_HOPS`
(SJ-5). With that at `0` the socket peer decides, so a forwarded header cannot
be used to escape the budget.

### What the table stores

`login_attempts` keys on `identifier_hash` — a SHA-256 of the lowercased email,
**never the address**. The table necessarily records what was *typed*, including
typos and addresses belonging to nobody, and a list of those is a liability with
no operational value. Throttling only asks whether recent failures share an
identifier, which equality answers.

Rows are written for unknown accounts too, **deliberately**. If only real
accounts accumulated failures, the throttle itself would answer "does this email
exist" — the exact question the anti-enumeration work below exists to make
unanswerable.

---

## Anti-enumeration

Three channels, all closed:

| Channel | Treatment |
|---|---|
| **Response** | Unknown account and wrong password return byte-identical `401` bodies |
| **Timing** | An unknown account still runs one Argon2 verification against a throwaway hash |
| **Throttling** | Keyed on the submitted address, so a nonexistent account backs off identically |

The dummy hash is generated at module load rather than checked in: a fixed hash
in the repository is a fixed target, and an attacker who recognises it in a
timing trace learns the account does not exist.

Timing is *not* constant — Argon2 varies a few ms run to run, and a surviving
bcrypt row costs differently again. What is gone is the order-of-magnitude gap
between "hash a password" and "return immediately", which is the one an attacker
can measure over the internet.

System accounts (the BPJS Antrean bridge) are refused *after* the same hashing
work, so "this is a service account" is not detectable as a different kind of no.

---

## Audit

Failures write `USER_LOGIN_FAILED` with the client IP (SJ-4). The email is
deliberately not recorded — an unmatched address would turn the audit log into a
list of addresses people mistyped. **≥10 failures/hour on one account** is the
alerting threshold, to be consumed by SJ-24.

---

## Verifying

```bash
# Policy, hashing, migration and throttling, against real Postgres.
pnpm --filter @hms/api exec jest --config ./jest.config.cjs \
  --testPathIgnorePatterns=/node_modules/ \
  --testPathPattern="password-policy\.integration\.spec\.ts$"

# Hash cost on this host — run before go-live and tune memoryCost.
cd apps/api && node -e "
const {hash,Algorithm}=require('@node-rs/argon2');
(async()=>{const p={algorithm:Algorithm.Argon2id,memoryCost:65536,timeCost:3,parallelism:4};
const t=[];for(let i=0;i<10;i++){const s=Date.now();await hash('bench'+i,p);t.push(Date.now()-s);}
t.sort((a,b)=>a-b);console.log('median ms:',t[5]);})()"
```
